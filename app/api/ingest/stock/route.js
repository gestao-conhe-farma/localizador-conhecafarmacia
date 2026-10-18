import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasScope, keyFromRequest, parseApiKey, verifyApiKeyHash } from '@/lib/api-keys'
import { getSubscription } from '@/lib/platform/subscriptions'
import { ingestLimitFor } from '@/lib/plans'
import { drainDue } from '@/lib/webhooks'
import { logError, logWarn } from '@/lib/log'

/**
 * Ingestão de stock para terceiros (ideia 1 do plano 2026-10-12).
 *
 *   POST /api/ingest/stock   scope stock:write   → repõe/actualiza o stock
 *   GET  /api/ingest/stock   scope stock:read    → devolve o stock da farmácia
 *
 * Autenticação: `Authorization: Bearer cfk_<key_id>_<segredo>` (ou
 * `x-api-key`). A farmácia vem DA CHAVE — nunca do corpo do pedido: um
 * parceiro nunca consegue escrever no stock de outra farmácia.
 *
 * Postura desta rota (padrão ingerido da pesquisa de 2026-10-13):
 *   • idempotência: `idempotency_key` no corpo → repetir o mesmo envio
 *     (timeout, retry, ficheiro reenviado) não conta duas vezes;
 *   • estado por REPOSIÇÃO (mode `set`) como caminho preferido — é o que
 *     sobrevive a retries sem inventar deltas; `delta` existe para quem
 *     só sabe enviar movimento;
 *   • lote e validade só se aplicam a ENTRADAS (saldo que sobe): numa baixa
 *     a saída segue o FEFO e o lote enviado não é gravado. Nesse caso a
 *     linha devolve `warning: LOTE_IGNORADO`, para não ser um erro silencioso;
 *   • rate-limit por chave E por plano (janela fixa, atómico na BD) com
 *     Retry-After: o plano é o tecto de negócio e a chave o técnico; uma
 *     chave que já existe continua a sincronizar mesmo num plano sem
 *     integração (descer de plano não tranca o que está a correr);
 *   • auditoria sem payload e sem dados pessoais (rota, estado, contagens,
 *     duração) — em `api_request_log`;
 *   • o movimento do livro-razão é escrito pela MESMA porta do portal
 *     (`post_stock_change`, 0020), por isso o histórico fica completo e
 *     a baixa respeita lotes/FEFO (0021);
 *   • os movimentos entram na fila de webhooks (0025) pelo trigger do
 *     livro-razão, e no fim do pedido a entrega é acelerada aqui mesmo
 *     (`after()`): o parceiro que acabou de enviar stock recebe o
 *     evento em segundos, sem esperar pelo ciclo do cron.
 *
 * Corpo (JSON):
 * {
 *   "idempotency_key": "erp-2026-10-13-01",     // opcional mas recomendado
 *   "source_ref": "ERP-KuatelaSoft/loja-3",     // opcional (rasto)
 *   "items": [
 *     {
 *       "drug_id": "uuid",                       // OU "drug": "Paracetamol"
 *       "drug": "Paracetamol", "form": "comprimido", "dosage": "500 mg",
 *       "mode": "set",                           // set (default) | delta
 *       "quantity": 12,                          // unidades-base
 *       "in_stock": true,                        // alternativo à quantidade
 *       "price": 1500,                           // opcional
 *       "lot_number": "L2401",                   // opcional; só em entradas (FEFO)
 *       "expires_at": "2027-03-31"               // opcional (FEFO)
 *     }
 *   ]
 * }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROUTE_POST = 'POST /api/ingest/stock'
const ROUTE_GET = 'GET /api/ingest/stock'

const MAX_ITEMS = 500
const MAX_BODY_BYTES = 1024 * 1024 // 1 MB — acima disto, parte em lotes
const WINDOW_SECONDS = 60
const MAX_REPORT_ROWS = 100

function json(body, status = 200, extraHeaders = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

function err(code, message, status = 400, { retryAfter = null, headers = {} } = {}) {
  const body = { ok: false, error: code, message }
  if (retryAfter) body.retry_after = retryAfter
  return json(body, status, headers)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Texto curto e limpo (nunca confiar no que vem de fora). */
function text(v, max) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function intOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10)
  if (!Number.isFinite(n)) return NaN
  return Math.trunc(n)
}

function moneyOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n * 100) / 100
}

/**
 * Tecto de pedidos/minuto da ingestão: o menor entre o limite técnico da
 * chave e o limite de negócio do plano em vigor.
 *
 * `ingestPerMinute === 0` quer dizer «este plano não vende integração», não
 * «zero pedidos». Uma chave que já existe continua a sincronizar — a mesma
 * promessa de que descer de plano nunca tranca o que já está a correr — e o
 * que impede integrações novas é o guard de `createApiKey` (apiKeys = 0).
 * Sem esta excepção, ligar o limite cortaria no deploy as integrações já
 * instaladas.
 */
async function ingestRateLimit(admin, key) {
  const sub = await getSubscription(key.pharmacy_id, { client: admin })
  return ingestLimitFor(sub.effectivePlan, key.rate_limit_per_minute || 120, sub.enforced)
}

/**
 * Autentica a chave e devolve o contexto (chave, farmácia, limites).
 * `scope` é o que a rota exige; a chave sem o scope recebe 403.
 */
async function authenticate(request, scope, admin) {
  const presented = keyFromRequest(request)
  if (!presented) {
    return {
      error: err('CHAVE_EM_FALTA', 'Envie a chave em Authorization: Bearer … ou x-api-key.', 401),
    }
  }
  const parsed = parseApiKey(presented)
  if (!parsed) {
    return { error: err('CHAVE_INVALIDA', 'Formato de chave inválido.', 401) }
  }

  const { data: key, error } = await admin
    .from('pharmacy_api_keys')
    .select(
      'id, pharmacy_id, name, key_hash, scopes, active, revoked_at, expires_at, rate_limit_per_minute, request_count',
    )
    .eq('key_id', parsed.keyId)
    .maybeSingle()
  if (error) throw error
  if (!key) return { error: err('CHAVE_INVALIDA', 'Chave desconhecida.', 401) }

  // Hash + estado antes de dizer seja o que for sobre a chave.
  if (!verifyApiKeyHash(presented, key.key_hash)) {
    return { error: err('CHAVE_INVALIDA', 'Chave desconhecida.', 401) }
  }
  if (!key.active || key.revoked_at) {
    return { error: err('CHAVE_REVOGADA', 'Esta chave foi revogada.', 401) }
  }
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return { error: err('CHAVE_EXPIRADA', 'Esta chave expirou.', 401) }
  }
  if (!hasScope(key.scopes, scope)) {
    return { error: err('SEM_SCOPE', `A chave não tem o scope ${scope}.`, 403) }
  }

  // Rate-limit: a conta é atómica e sobrevive ao 429.
  const limit = await ingestRateLimit(admin, key)
  const { data: rate, error: eRate } = await admin.rpc('api_rate_consume', {
    p_key_id: key.id,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  })
  if (eRate) throw eRate
  if (rate && rate.allowed === false) {
    return {
      error: err('LIMITE_ATINGIDO', `Limite de ${rate.limit} pedidos/minuto atingido.`, 429, {
        retryAfter: rate.retry_after,
        headers: { 'Retry-After': String(rate.retry_after || WINDOW_SECONDS) },
      }),
    }
  }

  return { key, pharmacyId: key.pharmacy_id, rate }
}

/** Marca de uso (best-effort — não falha o pedido por causa disto). */
function touchKey(admin, key) {
  admin
    .from('pharmacy_api_keys')
    .update({ last_used_at: new Date().toISOString(), request_count: (key.request_count || 0) + 1 })
    .eq('id', key.id)
    .then(
      () => {},
      () => {},
    )
}

function audit(
  admin,
  { pharmacyId, keyId, route, method, status, itemsOk, itemsError, errorCode, idem, ms },
) {
  admin
    .from('api_request_log')
    .insert({
      pharmacy_id: pharmacyId,
      api_key_id: keyId,
      route,
      method,
      status,
      items_ok: itemsOk ?? null,
      items_error: itemsError ?? null,
      error_code: errorCode ?? null,
      idempotency_key: idem ?? null,
      duration_ms: ms ?? null,
    })
    .then(
      () => {},
      () => {},
    )
}

/** Resolve o medicamento do catálogo: por id (preciso) ou por nome. */
async function resolveDrug(admin, item) {
  const drugId = text(item.drug_id, 40)
  if (drugId) {
    if (!UUID_RE.test(drugId)) return { error: 'DRUG_ID_INVALIDO' }
    const { data } = await admin
      .from('drugs')
      .select('id, name, form, dosage')
      .eq('id', drugId)
      .eq('active', true)
      .maybeSingle()
    return data ? { drug: data } : { error: 'MEDICAMENTO_NAO_ENCONTRADO' }
  }

  const name = text(item.drug ?? item.nome ?? item.name, 120)
  if (!name) return { error: 'SEM_MEDICAMENTO' }
  const form = text(item.form ?? item.forma, 60)
  const dosage = text(item.dosage ?? item.dose, 60)

  // ilike com wildcards escapados: o nome é dado, não padrão.
  const pattern = name.replace(/([%_\\])/g, '\\$1')
  let q = admin
    .from('drugs')
    .select('id, name, form, dosage')
    .eq('active', true)
    .ilike('name', pattern)
  if (form) q = q.ilike('form', form)
  if (dosage) q = q.ilike('dosage', dosage)
  const { data: rows } = await q.limit(2)
  if (!rows || rows.length === 0) {
    // Segunda tentativa pelo nome COMPOSTO (nome + forma/dose), que é
    // como o catálogo às vezes aparece exportado («Paracetamol comprimido»).
    const { data: alt } = await admin
      .from('drugs')
      .select('id, name, form, dosage')
      .eq('active', true)
      .ilike('name', `%${pattern}%`)
      .limit(2)
    if (!alt || alt.length === 0) return { error: 'MEDICAMENTO_NAO_ENCONTRADO' }
    if (alt.length > 1) return { error: 'MEDICAMENTO_AMBIGUO' }
    return { drug: alt[0] }
  }
  if (rows.length > 1) return { error: 'MEDICAMENTO_AMBIGUO' }
  return { drug: rows[0] }
}

/** Valida e aplica UMA linha. Nunca lança: devolve resultado por linha. */
async function applyItem(admin, ctx, item, index) {
  if (!item || typeof item !== 'object') return { index, status: 'erro', error: 'LINHA_INVALIDA' }

  const { drug, error: eDrug } = await resolveDrug(admin, item)
  if (eDrug) return { index, status: 'erro', error: eDrug, drug: text(item.drug ?? item.nome, 120) }

  const mode = text(item.mode, 20) === 'delta' ? 'delta' : 'set'
  const quantity = intOrNull(item.quantity ?? item.quantidade)
  if (Number.isNaN(quantity) || (quantity !== null && quantity < 0)) {
    return {
      index,
      drug_id: drug.id,
      drug: drug.name,
      status: 'erro',
      error: 'QUANTIDADE_INVALIDA',
    }
  }
  const inStock = typeof item.in_stock === 'boolean' ? item.in_stock : null
  if (quantity === null && inStock === null) {
    return {
      index,
      drug_id: drug.id,
      drug: drug.name,
      status: 'erro',
      error: 'SEM_QUANTIDADE_NEM_ESTADO',
    }
  }

  const price = moneyOrNull(item.price ?? item.preco)
  if (Number.isNaN(price)) {
    return { index, drug_id: drug.id, drug: drug.name, status: 'erro', error: 'PRECO_INVALIDO' }
  }

  const expiresAt = text(item.expires_at ?? item.validade, 10)
  if (expiresAt && !DATE_RE.test(expiresAt)) {
    return { index, drug_id: drug.id, drug: drug.name, status: 'erro', error: 'VALIDADE_INVALIDA' }
  }
  const lot = text(item.lot_number ?? item.lote, 40)

  const args = {
    p_pharmacy_id: ctx.pharmacyId,
    p_drug_id: drug.id,
    p_type: 'importacao',
    p_source: 'api',
    p_reason: text(item.reason ?? item.motivo, 120) || 'sincronização automática',
    p_note: null,
    p_source_ref: ctx.sourceRef,
    p_idem: ctx.idemFor(index),
    p_staff_id: null,
    p_lot_number: lot,
    p_expires_at: expiresAt || null,
    p_actor_label: ctx.keyLabel,
    p_in_stock: inStock,
  }
  if (mode === 'delta' && quantity !== null) {
    args.p_delta = quantity
  } else if (quantity !== null) {
    // Reposição: o valor enviado é o saldo (sobrevive a retries).
    args.p_set_quantity = quantity
  } else {
    // Só disponibilidade: não mexe no saldo, só no «temos/não temos».
    args.p_delta = 0
  }

  const { data, error } = await admin.rpc('post_stock_change', args)
  if (error) {
    logError('ingest-stock', 'post_stock_change falhou', {
      message: error.message,
      code: error.code,
    })
    return { index, drug_id: drug.id, drug: drug.name, status: 'erro', error: 'FALHA_APLICAR' }
  }
  if (!data?.ok) {
    return {
      index,
      drug_id: drug.id,
      drug: drug.name,
      status: 'erro',
      error: data?.error || 'FALHA_APLICAR',
    }
  }

  // Preço (opcional) — não é movimento de stock, é atributo do item.
  if (price !== null) {
    const { error: ePrice } = await admin
      .from('stock_items')
      .update({ price })
      .eq('pharmacy_id', ctx.pharmacyId)
      .eq('drug_id', drug.id)
    if (ePrice) {
      logWarn('ingest-stock', 'Preço não guardado', { message: ePrice.message, drug: drug.id })
    }
  }

  // Lote/validade só entram em ENTRADAS (0021). Numa baixa o FEFO decide
  // de que camadas sai e o lote enviado não é gravado: avisamos NA LINHA
  // em vez de ignorar em silêncio. A linha continua «ok» — o stock foi
  // reposto; o aviso só diz o que não foi usado.
  const baixou = !data.duplicate && data.after < data.before
  const loteIgnorado = baixou && (lot !== null || expiresAt !== null)

  return {
    index,
    drug_id: drug.id,
    drug: drug.name,
    status: data.duplicate ? 'duplicado' : 'ok',
    quantity: data.quantity,
    before: data.before,
    after: data.after,
    warning: loteIgnorado ? 'LOTE_IGNORADO' : null,
    warning_message: loteIgnorado
      ? 'Lote e validade só se aplicam a entradas: esta reposição baixou o saldo, pelo que a saída segue o FEFO e o lote enviado não foi gravado.'
      : null,
  }
}

// ---------------------------------------------------------------
// POST — ingestão
// ---------------------------------------------------------------
export async function POST(request) {
  const started = Date.now()
  let admin
  let ctx = null

  try {
    const declared = Number(request.headers.get('content-length') || 0)
    if (declared > MAX_BODY_BYTES) {
      return err(
        'CORPO_DEMASIADO_GRANDE',
        `Corpo acima de ${MAX_BODY_BYTES} bytes. Envie em lotes.`,
        413,
      )
    }

    admin = createAdminClient()
    const auth = await authenticate(request, 'stock:write', admin)
    if (auth.error) return auth.error
    const { key, pharmacyId } = auth
    touchKey(admin, key)

    let body
    try {
      body = await request.json()
    } catch {
      audit(admin, {
        pharmacyId,
        keyId: key.id,
        route: ROUTE_POST,
        method: 'POST',
        status: 400,
        errorCode: 'JSON_INVALIDO',
        ms: Date.now() - started,
      })
      return err('JSON_INVALIDO', 'O corpo do pedido não é JSON válido.', 400)
    }

    const items = body?.items
    if (!Array.isArray(items) || items.length === 0) {
      audit(admin, {
        pharmacyId,
        keyId: key.id,
        route: ROUTE_POST,
        method: 'POST',
        status: 400,
        errorCode: 'SEM_ITENS',
        ms: Date.now() - started,
      })
      return err('SEM_ITENS', 'Envie um array "items" com pelo menos uma linha.', 400)
    }
    if (items.length > MAX_ITEMS) {
      audit(admin, {
        pharmacyId,
        keyId: key.id,
        route: ROUTE_POST,
        method: 'POST',
        status: 413,
        errorCode: 'DEMASIADAS_LINHAS',
        ms: Date.now() - started,
      })
      return err('DEMASIADAS_LINHAS', `Máximo ${MAX_ITEMS} linhas por pedido.`, 413)
    }

    const idem = text(body?.idempotency_key ?? body?.idempotencia, 120)
    ctx = {
      pharmacyId,
      keyLabel: key.name,
      sourceRef: text(body?.source_ref, 200) || key.name,
      // Uma chave de idempotência POR LINHA: o mesmo envio repetido
      // devolve «duplicado» em vez de somar outra vez (0020).
      idemFor: (index) => (idem ? `${idem}:${index}` : null),
    }

    const results = []
    for (let i = 0; i < items.length; i++) {
      results.push(await applyItem(admin, ctx, items[i], i))
    }

    const applied = results.filter((r) => r.status === 'ok').length
    const duplicates = results.filter((r) => r.status === 'duplicado').length
    const failed = results.filter((r) => r.status === 'erro').length
    const warnings = results.filter((r) => r.warning).length
    const status = failed === 0 ? 200 : applied + duplicates > 0 ? 207 : 422

    audit(admin, {
      pharmacyId,
      keyId: key.id,
      route: ROUTE_POST,
      method: 'POST',
      status,
      itemsOk: applied + duplicates,
      itemsError: failed,
      idem,
      ms: Date.now() - started,
    })

    // Caminho quente: quem acabou de escrever stock é quem tem um
    // webhook à espera. Corre DEPOIS da resposta (after) para não atrasar
    // o ERP, e nunca falha o pedido por causa disto.
    if (applied > 0) {
      after(async () => {
        try {
          await drainDue({ limit: 10, worker: 'ingest' })
        } catch (e) {
          logWarn('ingest-stock', 'Drenagem de webhooks falhou', { message: e?.message })
        }
      })
    }

    return json(
      {
        ok: failed === 0,
        applied,
        duplicates,
        failed,
        warnings,
        results: results.slice(0, MAX_REPORT_ROWS),
      },
      status,
    )
  } catch (e) {
    logError('ingest-stock', 'Falha inesperada na ingestão', { message: e?.message })
    if (admin && ctx) {
      audit(admin, {
        pharmacyId: ctx.pharmacyId,
        keyId: null,
        route: ROUTE_POST,
        method: 'POST',
        status: 500,
        errorCode: 'FALHA_INTERNA',
        ms: Date.now() - started,
      })
    }
    return err('FALHA_INTERNA', 'Erro inesperado ao processar o pedido.', 500)
  }
}

// ---------------------------------------------------------------
// GET — leitura do stock da farmácia (reconciliação do parceiro)
// ---------------------------------------------------------------
export async function GET(request) {
  const started = Date.now()
  let admin
  let ctx = null
  try {
    admin = createAdminClient()
    const auth = await authenticate(request, 'stock:read', admin)
    if (auth.error) return auth.error
    const { key, pharmacyId } = auth
    touchKey(admin, key)
    ctx = { pharmacyId }

    const { data: items, error } = await admin
      .from('stock_items')
      .select(
        'id, drug_id, in_stock, quantity, price, expires_at, available_from, confirmed_at, source, synced_at, source_ref, retired_at, drugs(name, form, dosage, molecule)',
      )
      .eq('pharmacy_id', pharmacyId)
      .order('confirmed_at', { ascending: false })
      .limit(2000)
    if (error) throw error

    const { data: lots } = await admin
      .from('stock_lots')
      .select('stock_item_id, lot_number, expires_at, quantity')
      .eq('pharmacy_id', pharmacyId)
      .gt('quantity', 0)
      .order('expires_at', { ascending: true, nullsFirst: false })
      .limit(5000)

    const lotsByItem = new Map()
    for (const l of lots || []) {
      const list = lotsByItem.get(l.stock_item_id) || []
      list.push({ lot_number: l.lot_number, expires_at: l.expires_at, quantity: l.quantity })
      lotsByItem.set(l.stock_item_id, list)
    }

    const payload = (items || []).map((s) => ({
      drug_id: s.drug_id,
      drug: s.drugs?.name || null,
      form: s.drugs?.form || null,
      dosage: s.drugs?.dosage || null,
      molecule: s.drugs?.molecule || null,
      in_stock: s.in_stock,
      quantity: s.quantity,
      price: s.price != null ? Number(s.price) : null,
      expires_at: s.expires_at,
      available_from: s.available_from,
      confirmed_at: s.confirmed_at,
      source: s.source,
      synced_at: s.synced_at,
      source_ref: s.source_ref,
      retired_at: s.retired_at,
      lots: lotsByItem.get(s.id) || [],
    }))

    audit(admin, {
      pharmacyId,
      keyId: key.id,
      route: ROUTE_GET,
      method: 'GET',
      status: 200,
      itemsOk: payload.length,
      ms: Date.now() - started,
    })

    return json({ ok: true, updated_at: new Date().toISOString(), items: payload })
  } catch (e) {
    logError('ingest-stock', 'Falha inesperada na leitura', { message: e?.message })
    if (admin && ctx) {
      audit(admin, {
        pharmacyId: ctx.pharmacyId,
        keyId: null,
        route: ROUTE_GET,
        method: 'GET',
        status: 500,
        errorCode: 'FALHA_INTERNA',
        ms: Date.now() - started,
      })
    }
    return err('FALHA_INTERNA', 'Erro inesperado ao ler o stock.', 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' },
  })
}
