'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform } from '@/lib/platform/session'
import { logPlatformAudit } from '@/lib/platform/audit'
import { can, viewScope } from '@/lib/platform/permissions'
import { fichaPlano } from '@/lib/platform/subscriptions'
import { MUNICIPIOS } from '@/lib/constants'
import { logError } from '@/lib/log'

/**
 * Farmácias na área interna (Phase 5 do plano
 * docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * Três regras que valem para TODAS as funções deste ficheiro:
 *
 *   1. A autorização é a matriz (`requirePlatform`), não a UI. Cada função
 *      começa por ela, e quem chamar isto por POST directo bate na mesma
 *      parede (Task 11.2 Step 5).
 *   2. O ID da farmácia vem sempre do PEDIDO mas nunca é FONTE de
 *      confiança: valida-se o formato (uuid) e confirma-se que a farmácia
 *      existe antes de escrever seja o que for — um id inventado não pode
 *      criar nem alterar nada (OWASP Multi-Tenant Security).
 *   3. O que a resposta PODE CONTER também é decidido pela matriz. Um
 *      `suporte` ou um `auditoria` não tem acesso RLS alargado (0027): se
 *      esta camada devolvesse tudo, a decisão de «não deve ver reservas
 *      com contacto de cliente» seria decorativa. É por isso que `viewScope`
 *      corta campos no payload, e não só colunas na tabela da página.
 *

 * Leitura com o cliente service-role: a área interna lê e escreve pelo
 * servidor (0027) e a trilha registra as escritas.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Campos que a equipa pode editar na ficha (nada de slug nem de lat/lng). */
const CAMPOS_EDITAVEIS = [
  'name',
  'municipio',
  'address',
  'phone',
  'whatsapp',
  'email',
  'opening_hours',
  'maps_url',
]

const LIMITES = {
  name: 120,
  address: 200,
  phone: 40,
  whatsapp: 40,
  email: 160,
  opening_hours: 400,
  maps_url: 500,
}

/**
 * Farmácias por dia (2): a lista mostra se o stock foi confirmado nas
 * últimas 72 h — a janela que o Localizador usa (0008). Passado esse
 * tempo, a farmácia continua no directório mas desaparece da pesquisa com
 * «confirmado», e é isso que a equipa precisa de ver antes de uma chamada.
 */
const JANELA_CONFIRMADO = 72 * 60 * 60 * 1000
/** Acima disto o stock está «parado» (filtro próprio da lista). */
const DIAS_PARADO = 5

function texto(valor, limite) {
  const t = String(valor ?? '').trim()
  return limite ? t.slice(0, limite) : t
}

function erroMeta(err) {
  return {
    message: err?.message || String(err),
    code: err?.code,
    details: err?.details,
  }
}

function falha(scope, mensagem, err) {
  logError(scope, mensagem, erroMeta(err))
  return { ok: false, error: 'FALHA' }
}

// `fichaPlano` vive em lib/platform/subscriptions.js, ao lado da regra que
// decide o plano EM VIGOR (um prazo terminado desce ao plano de entrada).
// Trazê-la para cá duplicada foi como a ficha e a lista podiam dizer
// «Gestão» de uma farmácia que o portal já tratava como Localizador.

/**
 * Uma farmácia existe? Devolve a linha actual (para o antes/depois da
 * trilha e para a edição saber o que mudou) ou `null`.
 */
async function lerFarmacia(admin, id) {
  const { data, error } = await admin
    .from('pharmacies')
    .select(
      'id, slug, name, municipio, address, phone, whatsapp, email, opening_hours, maps_url, lat, lng, verified, active, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

function scopeDe(role) {
  return viewScope(role)
}

// ===============================================================
// Lista
// ===============================================================

/**
 * Lista de farmácias com os números que a equipa consulta antes de ligar:
 * plano, contas, stock confirmado e última acção.
 *
 * A agregação vive na base de dados (`platform_pharmacy_overview`, 0029) —
 * o PostgREST não faz `group by` e sem ela a lista arrastaria tabelas
 * inteiras para contar linhas.
 *
 * Filtros (todos opcionais): `municipio`, `estado` (ativa|inativa),
 * `selo` (com|sem), `plano` (código ou 'sem'), `stock` (fresco|parado).
 */
export async function listPharmacies(filtros = {}) {
  const g = await requirePlatform('pharmacy.view')
  if (!g.ok) return g
  const scope = scopeDe(g.session.role)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('platform_pharmacy_overview')
    // Tabela/função por aplicar (PGRST202/42P01): dizê-lo à equipa é melhor
    // do que uma lista vazia que parece «não há farmácias».
    if (error) {
      logError('platform', 'Vista de farmácias ilegível', erroMeta(error))
      return { ok: false, error: 'SEM_VISTA', detail: error.code }
    }

    const agora = Date.now()
    const todas = (data || []).map((r) => {
      const ultimo = r.stock_ultimo ? new Date(r.stock_ultimo).getTime() : null
      const fresco = ultimo !== null && agora - ultimo <= JANELA_CONFIRMADO
      const parado = ultimo === null || agora - ultimo > DIAS_PARADO * 24 * 60 * 60 * 1000
      return {
        id: r.pharmacy_id,
        slug: r.slug,
        name: r.name,
        municipio: r.municipio,
        active: r.active,
        verified: r.verified,
        createdAt: r.created_at,
        plano: fichaPlano({
          plan_code: r.plan_code,
          status: r.plan_status,
          trial_until: r.trial_until,
          grace_until: r.grace_until,
        }),
        contas: Number(r.contas || 0),
        // Só entra no payload o que o nível pode ver (ver nota 3 do topo).
        ...(scope.operacao
          ? {
              perfis: Number(r.perfis || 0),
              perfisActivos: Number(r.perfis_activos || 0),
              chavesAtivas: Number(r.chaves_activas || 0),
              destinos: Number(r.destinos || 0),
              stockConfirmado: Number(r.stock_confirmado || 0),
              stockUltimo: r.stock_ultimo || null,
              stockFresco: fresco,
              stockParado: parado,
              reservasAbertas: Number(r.reservas_abertas || 0),
              ultimaAccao: r.ultima_accao || null,
              ultimaAccaoEm: r.ultima_accao_em || null,
            }
          : {}),
      }
    })

    const municipio = texto(filtros.municipio)
    const estado = texto(filtros.estado)
    const selo = texto(filtros.selo)
    const plano = texto(filtros.plano)
    const stock = texto(filtros.stock)

    const rows = todas.filter((r) => {
      if (municipio && r.municipio !== municipio) return false
      if (estado === 'ativa' && !r.active) return false
      if (estado === 'inativa' && r.active) return false
      if (selo === 'com' && !r.verified) return false
      if (selo === 'sem' && r.verified) return false
      if (plano === 'sem' && r.plano.planCode) return false
      if (plano && plano !== 'sem' && r.plano.planCode !== plano) return false
      // «fresco» = confirmou stock dentro da janela de 72 h; «parado» = há
      // mais de 5 dias que não confirma (ou nunca confirmou).
      if (stock === 'fresco' && r.stockFresco !== true) return false
      if (stock === 'parado' && r.stockParado !== true) return false
      return true
    })

    return {
      ok: true,
      scope,
      rows,
      totais: {
        total: todas.length,
        activas: todas.filter((r) => r.active).length,
        inativas: todas.filter((r) => !r.active).length,
        verificadas: todas.filter((r) => r.verified).length,
        semSelo: todas.filter((r) => !r.verified).length,
        semPlano: todas.filter((r) => !r.plano.planCode).length,
        stockParado: todas.filter((r) => r.stockParado).length,
        emGraca: todas.filter(
          (r) =>
            r.plano.status === 'graca' ||
            r.plano.status === 'trial' ||
            r.plano.status === 'suspenso',
        ).length,
      },
    }
  } catch (err) {
    return falha('platform', 'Falha ao listar farmácias', err)
  }
}

// ===============================================================
// Ficha
// ===============================================================

/**
 * Ficha completa de uma farmácia, com os blocos que a §5.2 do plano pede.
 *
 * Os blocos operacionais (integração, perfis, stock, reservas e histórico)
 * só são LIDOS e devolvidos quando `viewScope(role).operacao` é `true` —
 * o `faturacao` fica com a ficha comercial (plano, prazos, contactos de
 * facturação) e as notas internas, e nada mais. O contacto de quem
 * reservou só sai quando `viewScope.contacto` é `true`.
 */
export async function getPharmacyDetalhe(id) {
  const g = await requirePlatform('pharmacy.view')
  if (!g.ok) return g
  if (!UUID_RE.test(String(id || ''))) return { ok: false, error: 'ID_INVALIDO' }

  const scope = scopeDe(g.session.role)
  // Quem pode mudar o plano é quem negoceia: é essa a régua para as notas
  // internas (não há uma acção própria de «ler notas» na matriz).
  const podeVerNotas = can(g.session.role, 'plan.change')

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }

    const [subRes, contasRes, utilizadoresRes] = await Promise.all([
      admin
        .from('pharmacy_subscriptions')
        .select('plan_code, status, trial_until, grace_until, started_at, updated_at, notes')
        .eq('pharmacy_id', id)
        .maybeSingle(),
      admin
        .from('admin_users')
        .select('user_id, role, display_name, created_at')
        .eq('pharmacy_id', id)
        .order('created_at'),
      // Contas do Auth: o e-mail e o estado da conta vivem em `auth.users`,
      // que não é acessível por PostgREST — lêem-se pela Admin API. São
      // poucas dezenas de utilizadores nesta fase; a lista é cruzada por id.
      admin.auth.admin.listUsers({ perPage: 200 }),
    ])

    const sub = subRes.data || null
    const plano = fichaPlano(sub)
    const utilizadores = new Map(
      (utilizadoresRes?.data?.users || []).map((u) => [
        u.id,
        {
          email: u.email,
          confirmadoEm: u.email_confirmed_at || u.confirmed_at || null,
          ultimoAcesso: u.last_sign_in_at || null,
          banido: u.banned_until ? new Date(u.banned_until) > new Date() : false,
        },
      ]),
    )
    const contas = (contasRes.data || []).map((c) => {
      const u = utilizadores.get(c.user_id) || {}
      return {
        userId: c.user_id,
        displayName: c.display_name || null,
        email: u.email || null,
        criadaEm: c.created_at,
        // Um convite por aceitar tem `email_confirmed_at` nulo: é a
        // diferença entre «a farmácia já entrou» e «ainda não aceitou».
        conviteAceite: Boolean(u.confirmadoEm),
        confirmadoEm: u.confirmadoEm || null,
        ultimoAcesso: u.ultimoAcesso || null,
        banido: u.banido === true,
      }
    })

    const base = {
      ok: true,
      scope,
      farmacia,
      plano: { ...plano, startedAt: sub?.started_at || null, updatedAt: sub?.updated_at || null },
      // Notas internas da equipa (coluna sem grant para a farmácia): só
      // para quem negoceia o plano.
      notas: podeVerNotas ? sub?.notes || null : undefined,
      contas,
      podeVerNotas,
    }

    if (!scope.operacao) {
      // Ficha comercial: nada de perfis, stock, reservas, integração ou
      // histórico — e a página sabe-o pelo `scope`, para não mostrar
      // blocos vazios que parecem avaria.
      return base
    }

    const [staffRes, chavesRes, webhooksRes, stockRes, reservasRes, historicoRes] =
      await Promise.all([
        admin
          .from('pharmacy_staff')
          .select('id, name, role, active, created_at')
          .eq('pharmacy_id', id)
          .order('created_at'),
        admin
          .from('pharmacy_api_keys')
          .select(
            'id, name, key_last4, active, revoked_at, rate_limit_per_minute, last_used_at, request_count, created_at',
          )
          .eq('pharmacy_id', id)
          .order('created_at', { ascending: false }),
        admin
          .from('pharmacy_webhooks')
          .select('id, url, description, events, active, created_at')
          .eq('pharmacy_id', id)
          .order('created_at', { ascending: false }),
        admin
          .from('stock_items')
          .select(
            'id, drug_id, in_stock, quantity, price, confirmed_at, expires_at, source, drugs ( name, form, dosage )',
          )
          .eq('pharmacy_id', id)
          .eq('in_stock', true)
          .order('confirmed_at', { ascending: false })
          .limit(8),
        admin
          .from('reservations')
          .select(
            'id, drug_id, requester_name, requester_phone, quantity, status, created_at, resolved_at, drugs ( name, form, dosage )',
          )
          .eq('pharmacy_id', id)
          .order('created_at', { ascending: false })
          .limit(8),
        admin
          .from('platform_audit_log')
          .select(
            'id, created_at, actor_email, actor_role, action, reason, table_name, record_id, before, after',
          )
          .eq('pharmacy_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

    const stock = (stockRes.data || []).map((s) => ({
      id: s.id,
      medicamento: s.drugs?.name || '—',
      forma: s.drugs?.form || null,
      dosagem: s.drugs?.dosage || null,
      quantity: s.quantity,
      price: s.price,
      confirmedAt: s.confirmed_at,
      expiresAt: s.expires_at,
      source: s.source,
    }))

    return {
      ...base,
      perfis: (staffRes.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        active: s.active,
        criadoEm: s.created_at,
      })),
      integracao: {
        chaves: (chavesRes.data || []).map((k) => ({
          id: k.id,
          name: k.name,
          last4: k.key_last4,
          active: k.active,
          revokedAt: k.revoked_at,
          rateLimit: k.rate_limit_per_minute,
          lastUsedAt: k.last_used_at,
          requestCount: k.request_count,
          criadaEm: k.created_at,
        })),
        destinos: (webhooksRes.data || []).map((w) => ({
          id: w.id,
          url: w.url,
          description: w.description,
          events: w.events,
          active: w.active,
          criadoEm: w.created_at,
        })),
      },
      operacao: {
        stock,
        stockUltimo: stock[0]?.confirmedAt || null,
        reservas: (reservasRes.data || []).map((r) => ({
          id: r.id,
          medicamento: r.drugs?.name || '—',
          quantity: r.quantity,
          status: r.status,
          criadaEm: r.created_at,
          resolvidaEm: r.resolved_at,
          // Contacto de quem reservou: cortado para `auditoria` (§3.2).
          ...(scope.contacto
            ? { requesterName: r.requester_name, requesterPhone: r.requester_phone }
            : {}),
        })),
      },
      historico: (historicoRes.data || []).map((h) => ({
        id: h.id,
        quando: h.created_at,
        actorEmail: h.actor_email,
        actorRole: h.actor_role,
        action: h.action,
        reason: h.reason,
        table: h.table_name,
        recordId: h.record_id,
        before: h.before,
        after: h.after,
      })),
    }
  } catch (err) {
    return falha('platform', 'Falha ao ler a ficha da farmácia', err)
  }
}

// ===============================================================
// Escrita
// ===============================================================

/**
 * Editar a ficha (fase 5.2). Recebe um FormData (é o que o
 * `useActionState` entrega) e devolve `{ ok }` ou `{ ok: false, error }`
 * com o campo em causa, para o formulário mostrar o erro ao lado do campo
 * e não uma tarja genérica.
 */
export async function updatePharmacy(_prev, formData) {
  const g = await requirePlatform('pharmacy.update')
  if (!g.ok) return g

  const id = texto(formData?.get('id'))
  if (!UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }

  const campos = {}
  for (const campo of CAMPOS_EDITAVEIS) {
    if (formData.get(campo) === null) continue
    campos[campo] = texto(formData.get(campo), LIMITES[campo])
  }

  if (!campos.name || campos.name.length < 2) {
    return { ok: false, error: 'NOME_INVALIDO', campo: 'name' }
  }
  if (!MUNICIPIOS.includes(campos.municipio)) {
    return { ok: false, error: 'MUNICIPIO_INVALIDO', campo: 'municipio' }
  }
  if (campos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) {
    return { ok: false, error: 'EMAIL_INVALIDO', campo: 'email' }
  }
  if (campos.maps_url && !/^https?:\/\//i.test(campos.maps_url)) {
    return { ok: false, error: 'URL_INVALIDO', campo: 'maps_url' }
  }

  try {
    const admin = createAdminClient()
    const antes = await lerFarmacia(admin, id)
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADA' }

    const mudanca = {}
    for (const campo of CAMPOS_EDITAVEIS) {
      const novo = campos[campo] ?? ''
      const velho = antes[campo] ?? ''
      if (novo !== velho) mudanca[campo] = novo
    }
    // Sem diferenças não se escreve nada — mas a acção não falha: dizer
    // «não havia nada para mudar» é informação, não erro.
    if (Object.keys(mudanca).length === 0) return { ok: true, mudou: 0 }

    const { error } = await admin
      .from('pharmacies')
      .update({ ...mudanca, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    const depois = { ...antes, ...mudanca }
    await logPlatformAudit({
      action: 'pharmacy.update',
      table: 'pharmacies',
      recordId: id,
      pharmacyId: id,
      before: antes,
      after: depois,
      session: g.session,
    })

    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${id}`)
    return { ok: true, mudou: Object.keys(mudanca).length, campos: Object.keys(mudanca) }
  } catch (err) {
    return falha('platform', 'Falha ao editar a ficha da farmácia', err)
  }
}

/**
 * Selo «verificada» — confiança pública do directório (0001). Não é uma
 * acção destrutiva, mas é visível ao cliente final: a matriz dá-a a
 * `superadmin` e `onboarding`, e a trilha guarda-a sempre.
 */
export async function setPharmacyVerified(id, verified) {
  const g = await requirePlatform('pharmacy.verify')
  if (!g.ok) return g
  if (!UUID_RE.test(String(id || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const antes = await lerFarmacia(admin, id)
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADA' }
    if (antes.verified === Boolean(verified)) return { ok: true, mudou: 0 }

    const { data, error } = await admin
      .from('pharmacies')
      .update({ verified: Boolean(verified), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('verified')
      .maybeSingle()
    if (error) throw error
    // Ler a linha de volta não é cerimónia: o trigger da 0005 repunha
    // `verified`/`active` em silêncio em qualquer update, e a trilha ficava
    // a registar uma mudança que nunca aconteceu (corrigido na 0030). Se o
    // valor gravado não for o pedido, isto falha — em vez de mentir no
    // registo de auditoria.
    if (!data || data.verified !== Boolean(verified)) {
      logError('platform', 'Selo não ficou gravado na farmácia', {
        id,
        pedido: Boolean(verified),
        lido: data?.verified,
      })
      return { ok: false, error: 'SEM_EFEITO' }
    }

    await logPlatformAudit({
      action: 'pharmacy.verify',
      table: 'pharmacies',
      recordId: id,
      pharmacyId: id,
      before: antes,
      after: { ...antes, verified: Boolean(verified) },
      session: g.session,
    })

    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${id}`)
    return { ok: true, verificado: Boolean(verified) }
  } catch (err) {
    return falha('platform', 'Falha ao alterar o selo da farmácia', err)
  }
}

/**
 * Activar/desactivar a farmácia.
 *
 * `active = false` é a suspensão a sério: `getPharmacySession` já exige
 * farmácia activa (por isso o portal corta no pedido seguinte) e a view
 * pública `stock_confirmed` junta `p.active` — o stock sai do alcance do
 * cliente. Nada se apaga: o histórico, o stock e as contas ficam à espera.
 *
 * É uma acção sensível: exige motivo e sessão `aal2` (ACOES_COM_MFA), as
 * duas verificadas no servidor por `requirePlatform` antes de tocar em
 * nada. O motivo fica em `platform_audit_log.reason`.
 */
export async function setPharmacyActive(id, active, reason) {
  const acao = active ? 'pharmacy.activate' : 'pharmacy.deactivate'
  const g = await requirePlatform(acao, { reason })
  if (!g.ok) return g
  if (!UUID_RE.test(String(id || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const antes = await lerFarmacia(admin, id)
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADA' }
    if (antes.active === Boolean(active)) return { ok: true, mudou: 0 }

    const { data, error } = await admin
      .from('pharmacies')
      .update({ active: Boolean(active), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('active')
      .maybeSingle()
    if (error) throw error
    // Mesma leitura de volta do selo: uma farmácia que fica activa quando
    // se pediu para a suspender é o pior erro possível nesta área, e a
    // trilha não pode ser mais optimista do que a base de dados.
    if (!data || data.active !== Boolean(active)) {
      logError('platform', 'Estado da farmácia não ficou gravado', {
        id,
        pedido: Boolean(active),
        lido: data?.active,
      })
      return { ok: false, error: 'SEM_EFEITO' }
    }

    await logPlatformAudit({
      action: acao,
      table: 'pharmacies',
      recordId: id,
      pharmacyId: id,
      before: antes,
      after: { ...antes, active: Boolean(active) },
      reason: texto(reason, 400),
      session: g.session,
    })

    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${id}`)
    return { ok: true, active: Boolean(active) }
  } catch (err) {
    return falha('platform', 'Falha ao alterar o estado da farmácia', err)
  }
}
