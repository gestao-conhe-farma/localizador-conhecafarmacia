'use server'

import { revalidatePath } from 'next/cache'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { getActiveStaff } from '@/lib/staff-session'
import { createServerComponentClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/api-keys'
import {
  IMPORT_CHUNK,
  guessMapping,
  normalizeName,
  parseBoolean,
  parseCsv,
  parseDateValue,
  parseNumber,
  parseQuantity,
} from '@/lib/csv'
import { logError, logWarn } from '@/lib/log'

/**
 * Server Actions da integração (plano 2026-10-12, ideia 1).
 *
 *   1. Chaves de API — criar/revogar. A chave em claro só existe na
 *      resposta da criação; nunca é registada em logs.
 *   2. Webhooks — só registo do destino nesta fase (sem entrega).
 *   3. Importação CSV — pré-visualização com mapeamento de colunas e
 *      aplicação em LOTES (cada pedido de servidor fica curto: um
 *      ficheiro de 2.000 linhas são N pedidos, não um que expira).
 *
 * Autorização: criar/revogar chaves exige perfil GERENTE (é uma
 * credencial da farmácia, não um ajuste de balcão); importar stock e ver
 * o histórico é para qualquer perfil activo, como a entrada de stock.
 * O pharmacy_id vem sempre da sessão — nunca do cliente.
 *
 * Escrita com o cliente service-role (as tabelas não têm policies de
 * escrita), sempre filtrada pelo pharmacy_id da sessão.
 */

const SCOPES = ['stock:read', 'stock:write']
const MAX_KEY_DAYS = 3650
const MAX_IMPORT_ROWS = 2000
const MAX_REPORT = 100

function errMeta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}

/** Sessão + perfil activo, com o nível de permissão que a acção exige. */
async function requireStaff({ manager = false } = {}) {
  const session = await getPharmacySession()
  if (!session) return { error: 'SESSAO_EXPIRADA' }
  const staff = await getActiveStaff(session)
  if (!staff) return { error: 'SEM_PERFIL' }
  if (manager && staff.role !== 'gerente') return { error: 'SEM_PERMISSAO' }
  return { session, staff }
}

// ---------------------------------------------------------------
// 1. Visão geral (chaves, webhooks, chamadas, importações)
// ---------------------------------------------------------------
export async function getIntegrationOverview() {
  const ctx = await requireStaff()
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session, staff } = ctx

  try {
    const supabase = await createServerComponentClient()
    const [rKeys, rHooks, rLog, rImports] = await Promise.all([
      supabase
        .from('pharmacy_api_keys')
        .select(
          'id, name, key_id, key_last4, scopes, rate_limit_per_minute, active, revoked_at, revoked_reason, expires_at, last_used_at, request_count, created_at',
        )
        .eq('pharmacy_id', session.pharmacy.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pharmacy_webhooks')
        .select('id, url, description, events, active, created_at')
        .eq('pharmacy_id', session.pharmacy.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('api_request_log')
        .select(
          'id, route, method, status, items_ok, items_error, error_code, duration_ms, created_at',
        )
        .eq('pharmacy_id', session.pharmacy.id)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('stock_imports')
        .select(
          'id, kind, file_name, rows_total, rows_ok, rows_error, rows_skipped, report, created_at',
        )
        .eq('pharmacy_id', session.pharmacy.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    for (const r of [rKeys, rHooks, rLog, rImports]) {
      if (r.error) throw r.error
    }

    return {
      ok: true,
      canManage: staff.role === 'gerente',
      keys: rKeys.data || [],
      webhooks: rHooks.data || [],
      calls: rLog.data || [],
      imports: rImports.data || [],
    }
  } catch (err) {
    // Migrações 0023/0024 por aplicar → a página diz o que falta em vez
    // de rebentar (padrão de falha suave do resto do portal).
    const code = err?.code
    logError('integracao', 'Falha ao carregar a integração', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return {
      ok: false,
      error: code === 'PGRST205' || code === '42P01' ? 'MIGRACOES_EM_FALTA' : 'FALHA_CARREGAR',
    }
  }
}

// ---------------------------------------------------------------
// 2. Chaves de API
// ---------------------------------------------------------------
export async function createApiKey({ name, scopes, expiresInDays }) {
  const ctx = await requireStaff({ manager: true })
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session, staff } = ctx

  const cleanName = String(name || '')
    .trim()
    .slice(0, 60)
  if (cleanName.length < 2) return { ok: false, error: 'NOME_INVALIDO' }

  const list = Array.isArray(scopes) ? scopes.filter((s) => SCOPES.includes(s)) : []
  if (list.length === 0) return { ok: false, error: 'SEM_SCOPE' }

  let days = Number.parseInt(expiresInDays, 10)
  if (Number.isNaN(days) || days <= 0) days = null
  if (days && days > MAX_KEY_DAYS) return { ok: false, error: 'PRAZO_INVALIDO' }

  try {
    const admin = createAdminClient()
    const { token, keyId, last4, hash } = generateApiKey()
    const { data, error } = await admin
      .from('pharmacy_api_keys')
      .insert({
        pharmacy_id: session.pharmacy.id,
        name: cleanName,
        key_id: keyId,
        key_hash: hash,
        key_last4: last4,
        scopes: list,
        expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
        created_by: session.user.id,
      })
      .select('id, name, key_id, key_last4, scopes, expires_at, created_at')
      .single()
    if (error) throw error

    // O token NUNCA entra em logs — só a existência da chave.
    logWarn('integracao', 'Chave de API criada', {
      slug: session.pharmacy.slug,
      nome: cleanName,
      scopes: list.join(','),
      por: staff.name,
    })

    revalidatePath('/portal/integracao')
    return { ok: true, token, key: data }
  } catch (err) {
    logError('integracao', 'Falha ao criar chave', { slug: session.pharmacy.slug, ...errMeta(err) })
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}

export async function revokeApiKey({ id, reason }) {
  const ctx = await requireStaff({ manager: true })
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session } = ctx

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const cleanReason =
    String(reason || '')
      .trim()
      .slice(0, 120) || null

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('pharmacy_api_keys')
      .update({ active: false, revoked_at: new Date().toISOString(), revoked_reason: cleanReason })
      .eq('id', id)
      .eq('pharmacy_id', session.pharmacy.id)
    if (error) throw error

    logWarn('integracao', 'Chave de API revogada', { slug: session.pharmacy.slug, id })
    revalidatePath('/portal/integracao')
    return { ok: true }
  } catch (err) {
    logError('integracao', 'Falha ao revogar chave', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_REVOGAR' }
  }
}

// ---------------------------------------------------------------
// 3. Webhooks (registo do destino — entrega numa fase seguinte)
// ---------------------------------------------------------------
export async function saveWebhook({ url, description }) {
  const ctx = await requireStaff({ manager: true })
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session } = ctx

  const cleanUrl = String(url || '')
    .trim()
    .slice(0, 500)
  if (!/^https:\/\/[^\s]+$/i.test(cleanUrl)) return { ok: false, error: 'URL_INVALIDA' }
  const cleanDesc =
    String(description || '')
      .trim()
      .slice(0, 120) || null

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('pharmacy_webhooks').insert({
      pharmacy_id: session.pharmacy.id,
      url: cleanUrl,
      description: cleanDesc,
      created_by: session.user.id,
    })
    if (error) throw error
    revalidatePath('/portal/integracao')
    return { ok: true }
  } catch (err) {
    logError('integracao', 'Falha ao guardar webhook', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

export async function deleteWebhook({ id }) {
  const ctx = await requireStaff({ manager: true })
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session } = ctx

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('pharmacy_webhooks')
      .delete()
      .eq('id', id)
      .eq('pharmacy_id', session.pharmacy.id)
    if (error) throw error
    revalidatePath('/portal/integracao')
    return { ok: true }
  } catch (err) {
    logError('integracao', 'Falha ao remover webhook', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_REMOVER' }
  }
}

// ---------------------------------------------------------------
// 4. Importação CSV
// ---------------------------------------------------------------

/** Catálogo visível à farmácia, indexado para casar nomes do ficheiro. */
async function buildDrugIndex(admin, pharmacyId) {
  const { data, error } = await admin
    .from('drugs')
    .select('id, name, form, dosage, active')
    .or(`active.eq.true,created_by_pharmacy.eq.${pharmacyId}`)
  if (error) throw error
  const list = data || []

  const byName = new Map()
  for (const d of list) {
    const variants = [d.name, `${d.name} ${d.form || ''} ${d.dosage || ''}`]
    for (const v of variants) {
      const key = normalizeName(v)
      if (!key) continue
      const arr = byName.get(key) || []
      arr.push(d)
      byName.set(key, arr)
    }
  }
  return {
    list: list.map((d) => ({ ...d, norm: normalizeName(d.name) })),
    byName,
  }
}

/** Casa o nome do ficheiro com o catálogo (exacto → contém → ambíguo). */
function matchDrug(index, rawName) {
  const key = normalizeName(rawName)
  if (!key) return { error: 'SEM_MEDICAMENTO' }
  const exact = index.byName.get(key)
  if (exact && exact.length === 1) return { drug: exact[0] }
  if (exact && exact.length > 1) return { error: 'MEDICAMENTO_AMBIGUO' }
  const partial = index.list.filter((d) => d.norm.includes(key) || key.includes(d.norm))
  if (partial.length === 1) return { drug: partial[0] }
  return { error: partial.length > 1 ? 'MEDICAMENTO_AMBIGUO' : 'MEDICAMENTO_NAO_ENCONTRADO' }
}

/** Lê as células de uma linha segundo o mapeamento escolhido. */
function parseRow(cells, mapping) {
  const get = (field) => {
    const idx = mapping?.[field]
    return idx != null && idx >= 0 ? (cells[idx] ?? '') : ''
  }
  const rawQuantity = get('quantity')
  const rawInStock = get('in_stock')
  const rawExpires = get('expires')
  const rawPrice = get('price')
  return {
    name: get('drug'),
    quantity: parseQuantity(rawQuantity),
    hasQuantity: String(rawQuantity).trim() !== '',
    inStock: parseBoolean(rawInStock),
    hasInStock: String(rawInStock).trim() !== '',
    expires: parseDateValue(rawExpires),
    hasExpires: String(rawExpires).trim() !== '',
    lot: String(get('lot')).trim().slice(0, 40) || null,
    price: parseNumber(rawPrice),
    hasPrice: String(rawPrice).trim() !== '',
  }
}

/** Pré-visualização: cabeçalhos, mapeamento, primeiras linhas e contagens. */
export async function previewStockImport({ csvText, mapping }) {
  const ctx = await requireStaff()
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session } = ctx

  try {
    const text = String(csvText || '')
    if (!text.trim()) return { ok: false, error: 'FICHEIRO_VAZIO' }

    const parsed = parseCsv(text)
    if (parsed.headers.length === 0) return { ok: false, error: 'FICHEIRO_VAZIO' }
    if (parsed.rows.length > MAX_IMPORT_ROWS) return { ok: false, error: 'DEMASIADAS_LINHAS' }

    const effective = sanitizeMapping(mapping, parsed.headers) || guessMapping(parsed.headers)
    if (effective.drug < 0) return { ok: false, error: 'SEM_COLUNA_MEDICAMENTO' }

    const admin = createAdminClient()
    const index = await buildDrugIndex(admin, session.pharmacy.id)

    const rows = []
    let ok = 0
    let failed = 0
    for (const r of parsed.rows) {
      const view = previewRow(r, effective, index)
      if (view.status === 'ok') ok += 1
      else failed += 1
      if (rows.length < 30) rows.push(view)
    }

    return {
      ok: true,
      delimiter: parsed.delimiter,
      headers: parsed.headers,
      mapping: effective,
      rowsTotal: parsed.rows.length,
      counts: { ok, erro: failed },
      preview: rows,
    }
  } catch (err) {
    logError('integracao', 'Falha na pré-visualização da importação', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_LER' }
  }
}

function sanitizeMapping(mapping, headers) {
  if (!mapping || typeof mapping !== 'object') return null
  const out = {}
  for (const field of ['drug', 'quantity', 'in_stock', 'lot', 'expires', 'price']) {
    const v = Number.parseInt(mapping[field], 10)
    out[field] = Number.isNaN(v) || v < 0 || v >= headers.length ? -1 : v
  }
  return out.drug >= 0 ? out : null
}

function previewRow(row, mapping, index) {
  const parsed = parseRow(row.cells, mapping)
  const base = { line: row.line, name: parsed.name, quantity: parsed.quantity }

  if (!parsed.name) return { ...base, status: 'erro', error: 'SEM_MEDICAMENTO' }
  const match = matchDrug(index, parsed.name)
  if (match.error) return { ...base, status: 'erro', error: match.error }
  if (parsed.hasExpires && !parsed.expires)
    return { ...base, status: 'erro', error: 'VALIDADE_INVALIDA' }
  if (parsed.hasPrice && parsed.price == null)
    return { ...base, status: 'erro', error: 'PRECO_INVALIDO' }
  if (parsed.quantity == null && !parsed.hasInStock && parsed.price == null) {
    return { ...base, status: 'erro', error: 'SEM_QUANTIDADE_NEM_ESTADO' }
  }
  if (parsed.quantity != null && parsed.quantity < 0) {
    return { ...base, status: 'erro', error: 'QUANTIDADE_INVALIDA' }
  }

  return {
    ...base,
    drug_id: match.drug.id,
    drug: `${match.drug.name}${match.drug.form ? ` · ${match.drug.form}` : ''}${match.drug.dosage ? ` ${match.drug.dosage}` : ''}`,
    status: 'ok',
    lot: parsed.lot,
    expires: parsed.expires,
    in_stock: parsed.inStock,
    price: parsed.price,
  }
}

/** Cria a ficha da importação (o `source_ref` de todos os movimentos). */
export async function startStockImport({ fileName, rowsTotal }) {
  const ctx = await requireStaff()
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session, staff } = ctx

  const total = Number.parseInt(rowsTotal, 10)
  if (Number.isNaN(total) || total <= 0 || total > MAX_IMPORT_ROWS) {
    return { ok: false, error: 'DEMASIADAS_LINHAS' }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('stock_imports')
      .insert({
        pharmacy_id: session.pharmacy.id,
        kind: 'csv',
        file_name: String(fileName || 'import.csv')
          .trim()
          .slice(0, 200),
        rows_total: total,
        created_by_staff: staff.id,
        created_by: session.user.id,
      })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, importId: data.id, rowsTotal: total }
  } catch (err) {
    logError('integracao', 'Falha ao abrir a importação', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_IMPORTAR' }
  }
}

/**
 * Aplica um LOTE de linhas (IMPORT_CHUNK por pedido). Devolve o resultado
 * por linha e as contagens do lote; o cliente acumula e chama finish.
 */
export async function applyStockImportChunk({ importId, csvText, mapping, mode, from }) {
  const ctx = await requireStaff()
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session, staff } = ctx

  if (typeof importId !== 'string' || !/^[0-9a-f-]{36}$/i.test(importId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const start = Number.parseInt(from, 10)
  if (Number.isNaN(start) || start < 0) return { ok: false, error: 'PAYLOAD_INVALIDO' }
  const applyMode = mode === 'delta' ? 'delta' : 'set'

  try {
    const parsed = parseCsv(String(csvText || ''))
    const effective = sanitizeMapping(mapping, parsed.headers)
    if (!effective) return { ok: false, error: 'SEM_COLUNA_MEDICAMENTO' }

    const slice = parsed.rows.slice(start, start + IMPORT_CHUNK)
    if (slice.length === 0)
      return { ok: true, done: true, results: [], counts: { ok: 0, erro: 0, ignoradas: 0 } }

    const admin = createAdminClient()
    const index = await buildDrugIndex(admin, session.pharmacy.id)

    const results = []
    for (const r of slice) {
      const parsedRow = parseRow(r.cells, effective)
      const view = previewRow(r, effective, index)
      if (view.status !== 'ok') {
        results.push({ line: r.line, name: parsedRow.name, status: 'erro', error: view.error })
        continue
      }

      const args = {
        p_pharmacy_id: session.pharmacy.id,
        p_drug_id: matchDrug(index, parsedRow.name).drug.id,
        p_type: 'importacao',
        p_source: 'csv',
        p_reason: applyMode === 'delta' ? 'importação CSV (soma)' : 'importação CSV (reposição)',
        p_source_ref: importId,
        // Idempotência por (ficha, linha): reprocessar o mesmo lote não
        // soma duas vezes (a linha do ficheiro é a identidade do evento).
        p_idem: `${importId}:${r.line}`,
        p_staff_id: staff.id,
        p_lot_number: parsedRow.lot,
        p_expires_at: parsedRow.expires || null,
        p_actor_label: `CSV ${parsedRow.name}`.slice(0, 120),
        p_in_stock: parsedRow.inStock,
      }
      if (applyMode === 'delta' && parsedRow.quantity != null) {
        args.p_delta = parsedRow.quantity
      } else if (parsedRow.quantity != null) {
        args.p_set_quantity = parsedRow.quantity
      } else {
        args.p_delta = 0
      }

      const { data, error } = await admin.rpc('post_stock_change', args)
      if (error || !data?.ok) {
        if (error) logError('integracao', 'post_stock_change falhou (csv)', errMeta(error))
        results.push({
          line: r.line,
          name: parsedRow.name,
          status: 'erro',
          error: data?.error || 'FALHA_APLICAR',
        })
        continue
      }

      if (parsedRow.price != null) {
        await admin
          .from('stock_items')
          .update({ price: parsedRow.price })
          .eq('pharmacy_id', session.pharmacy.id)
          .eq('drug_id', args.p_drug_id)
      }

      results.push({
        line: r.line,
        name: parsedRow.name,
        status: data.duplicate ? 'duplicado' : 'ok',
        quantity: data.quantity,
      })
    }

    const counts = {
      ok: results.filter((r) => r.status === 'ok').length,
      duplicado: results.filter((r) => r.status === 'duplicado').length,
      erro: results.filter((r) => r.status === 'erro').length,
    }
    return {
      ok: true,
      done: start + slice.length >= parsed.rows.length,
      results,
      counts,
      applied: slice.length,
    }
  } catch (err) {
    logError('integracao', 'Falha ao aplicar lote da importação', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_IMPORTAR' }
  }
}

/** Fecha a ficha com as contagens finais e o relatório (máx. 100 linhas). */
export async function finishStockImport({ importId, totals, report, fileName }) {
  const ctx = await requireStaff()
  if (ctx.error) return { ok: false, error: ctx.error }
  const { session } = ctx

  if (typeof importId !== 'string' || !/^[0-9a-f-]{36}$/i.test(importId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const num = (v) => {
    const n = Number.parseInt(v, 10)
    return Number.isNaN(n) || n < 0 ? 0 : n
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('stock_imports')
      .update({
        rows_ok: num(totals?.ok),
        rows_error: num(totals?.erro),
        rows_skipped: num(totals?.ignoradas),
        report: Array.isArray(report) ? report.slice(0, MAX_REPORT) : null,
        file_name: String(fileName || 'import.csv')
          .trim()
          .slice(0, 200),
      })
      .eq('id', importId)
      .eq('pharmacy_id', session.pharmacy.id)
    if (error) throw error

    logWarn('integracao', 'Importação CSV concluída', {
      slug: session.pharmacy.slug,
      import: importId,
      ok: num(totals?.ok),
      erros: num(totals?.erro),
    })
    revalidatePath('/portal/integracao')
    revalidatePath('/portal/movimentos')
    return { ok: true }
  } catch (err) {
    logError('integracao', 'Falha ao fechar a importação', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}
