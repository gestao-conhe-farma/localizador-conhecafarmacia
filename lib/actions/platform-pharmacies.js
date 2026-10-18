'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { convidarDono } from '@/lib/invites'
import { can, viewScope } from '@/lib/platform/permissions'
import { fichaPlano } from '@/lib/platform/subscriptions'
import { MUNICIPIOS, SITE_URL } from '@/lib/constants'
import { emailConfigurado, emailRecuperacao, enviarEmail } from '@/lib/email'
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

/**
 * Ban da conta Auth na suspensão. O Supabase recebe uma duração (`nh`) e
 * não uma data: 876000 h ≈ 100 anos. A suspensão é reversível por
 * `ban_duration: 'none'` ao repor o acesso; nunca se apaga a conta.
 */
const BAN_DURATION = '876000h'

/**
 * A suspensão MANUAL da ficha é do superadmin e do onboarding.
 *
 * A matriz dá `account.suspend`/`unsuspend` também ao `faturacao`, mas
 * com uma condição escrita na própria descrição: «apenas pela via do
 * pagamento». Esta acção não tem contexto de pagamento (é um botão na
 * ficha, com motivo) — quem cobra suspende o PLANO em `plan.suspend`. A
 * condição fica aqui, no servidor, para não depender de a UI esconder o
 * botão.
 */
const SUSPENSAO_MANUAL = new Set(['superadmin', 'onboarding'])

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

/** A conta está com um ban em vigor? (a mesma régua da ficha) */
function estaBanido(user) {
  if (!user?.banned_until) return false
  const quando = new Date(user.banned_until)
  return !Number.isNaN(quando.getTime()) && quando > new Date()
}

/** A suspensão em vigor, ou `null`. Uma linha = conta suspensa (0034). */
async function lerSuspensao(admin, id) {
  const { data, error } = await admin
    .from('pharmacy_account_suspensions')
    .select(
      'pharmacy_id, suspended_at, suspended_by_email, reason, pharmacy_was_active, staff_active_ids, accounts_banned_ids',
    )
    .eq('pharmacy_id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Contas Auth ligadas à farmácia, com o estado do ban lido na Admin API.
 * A lista de `admin_users` é a fonte de quem pertence à farmácia; o Auth
 * só diz se essa conta está banida. Uma linha órfã (user já apagado) é
 * ignorada — não pode impedir a suspensão do resto.
 */
async function lerContasAuth(admin, id) {
  const { data, error } = await admin
    .from('admin_users')
    .select('user_id, display_name')
    .eq('pharmacy_id', id)
    .order('created_at')
  if (error) throw error

  const contas = []
  for (const conta of data || []) {
    const { data: authData, error: errAuth } = await admin.auth.admin.getUserById(conta.user_id)
    if (errAuth) {
      if (errAuth.status === 404 || /not found/i.test(String(errAuth.message || ''))) continue
      throw errAuth
    }
    const user = authData?.user
    contas.push({
      userId: conta.user_id,
      displayName: conta.display_name || null,
      email: user?.email || null,
      banido: estaBanido(user),
    })
  }
  return contas
}

/** Levanta o ban das contas que a operação acabou de banir (rollback). */
async function desfazerBans(admin, ids) {
  for (const userId of ids || []) {
    const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
    if (error) {
      logError('platform', 'Rollback: não foi possível levantar um ban', {
        userId,
        message: error.message,
      })
    }
  }
}

/** Reactiva só os perfis indicados (rollback da suspensão). */
async function reporPerfis(admin, ids) {
  if (!ids || ids.length === 0) return
  const { error } = await admin.from('pharmacy_staff').update({ active: true }).in('id', ids)
  if (error) {
    logError('platform', 'Rollback: não foi possível repor os perfis do balcão', {
      message: error.message,
    })
  }
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

    const [subRes, contasRes, utilizadoresRes, suspensaoRes] = await Promise.all([
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
      // A suspensão em vigor (0034) é lida SEMPRE, e não só no âmbito
      // operacional: o `faturacao` também precisa de ver que a conta está
      // suspensa, mesmo sem acesso a perfis/stock/reservas.
      admin
        .from('pharmacy_account_suspensions')
        .select(
          'suspended_at, suspended_by_email, reason, pharmacy_was_active, staff_active_ids, accounts_banned_ids',
        )
        .eq('pharmacy_id', id)
        .maybeSingle(),
    ])

    const sub = subRes.data || null
    const plano = fichaPlano(sub)
    // Só os NÚMEROS saem para o ecrã: os ids guardados na tabela são a
    // fotografia interna necessária para repor o acesso, não dados da ficha.
    const suspensao = suspensaoRes.data
      ? {
          quando: suspensaoRes.data.suspended_at,
          por: suspensaoRes.data.suspended_by_email || null,
          motivo: suspensaoRes.data.reason,
          farmaciaEstavaActiva: suspensaoRes.data.pharmacy_was_active === true,
          perfisInactivos: (suspensaoRes.data.staff_active_ids || []).length,
          contasBanidas: (suspensaoRes.data.accounts_banned_ids || []).length,
        }
      : null
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
      suspensao,
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
    // Uma conta suspensa mantém a farmácia inactiva até alguém repor o
    // acesso (0034). Activar a farmácia sozinha devolveria a vitrina ao
    // Localizador sem devolver o portal — e a ficha passaria a dizer
    // «activa» de uma conta que continua banida.
    if (active && (await lerSuspensao(admin, id))) {
      return { ok: false, error: 'CONTA_SUSPENSA' }
    }
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

/**
 * SUSPENDER A CONTA DA FARMÁCIA (`account.suspend`) — Task 5.3 Step 3.
 *
 * Desactivar a farmácia (`setPharmacyActive`) tira-a do Localizador, mas
 * não corta o portal: a conta Auth e os perfis do balcão continuam a valer.
 * Esta operação é a suspensão completa:
 *
 *   1. ban nas contas Auth da farmácia (`ban_duration` ≈ 100 anos);
 *   2. `pharmacies.active = false` — é o que corta sessões JÁ emitidas,
 *      porque `getPharmacySession` exige a farmácia activa no pedido
 *      seguinte (um ban só impede entradas novas);
 *   3. `pharmacy_staff.active = false` — os perfis com PIN deixam de
 *      entrar mesmo que o cookie do balcão ainda esteja vivo.
 *
 * NADA é apagado. A linha da 0034 guarda a fotografia necessária para
 * repor o acesso: que perfis estavam activos e que contas ESTA suspensão
 * baniu (uma conta já banida por outro motivo não é desbanida depois por
 * acidente). `pharmacy_was_active` impede que repor o acesso reactiva uma
 * farmácia que já estava inactiva por outra razão.
 *
 * Falhas a meio fazem ROLLBACK do que já foi feito: uma suspensão parcial
 * sem linha de estado deixaria contas banidas e sem rasto de como as
 * desbanir.
 */
export async function suspendPharmacyAccount({ pharmacyId, motivo } = {}) {
  const g = await requirePlatform('account.suspend', { reason: motivo })
  if (!g.ok) return g
  if (!SUSPENSAO_MANUAL.has(g.session.role)) return { ok: false, error: 'VIA_PAGAMENTO' }

  const id = String(pharmacyId || '')
  if (!UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }
  const requestId = newRequestId()

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }
    if (await lerSuspensao(admin, id)) return { ok: false, error: 'JA_SUSPENSA' }

    const contas = await lerContasAuth(admin, id)
    const banidasAgora = []
    for (const conta of contas) {
      if (conta.banido) continue
      const { error } = await admin.auth.admin.updateUserById(conta.userId, {
        ban_duration: BAN_DURATION,
      })
      if (error) {
        logError('platform', 'Não foi possível banir uma conta da farmácia', {
          pharmacyId: id,
          userId: conta.userId,
          code: error.code,
          message: error.message,
        })
        await desfazerBans(admin, banidasAgora)
        return { ok: false, error: 'SEM_EFEITO' }
      }
      banidasAgora.push(conta.userId)
    }

    const { data: perfisActivos, error: errPerfis } = await admin
      .from('pharmacy_staff')
      .select('id')
      .eq('pharmacy_id', id)
      .eq('active', true)
    if (errPerfis) {
      await desfazerBans(admin, banidasAgora)
      throw errPerfis
    }
    const staffIds = (perfisActivos || []).map((p) => p.id)

    if (staffIds.length > 0) {
      const { error } = await admin
        .from('pharmacy_staff')
        .update({ active: false })
        .in('id', staffIds)
      if (error) {
        await desfazerBans(admin, banidasAgora)
        throw error
      }
    }

    const { data: estado, error: errEstado } = await admin
      .from('pharmacies')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('active')
      .maybeSingle()
    if (errEstado || !estado || estado.active !== false) {
      await reporPerfis(admin, staffIds)
      if (farmacia.active) {
        await admin.from('pharmacies').update({ active: true }).eq('id', id)
      }
      await desfazerBans(admin, banidasAgora)
      if (errEstado) throw errEstado
      logError('platform', 'Suspensão: o estado da farmácia não ficou gravado', {
        id,
        lido: estado?.active,
      })
      return { ok: false, error: 'SEM_EFEITO' }
    }

    const { error: errSuspensao } = await admin.from('pharmacy_account_suspensions').insert({
      pharmacy_id: id,
      suspended_by: g.session.user.id,
      suspended_by_email: g.session.user.email || null,
      reason: texto(motivo, 400),
      pharmacy_was_active: farmacia.active,
      staff_active_ids: staffIds,
      accounts_banned_ids: banidasAgora,
    })
    if (errSuspensao) {
      await reporPerfis(admin, staffIds)
      if (farmacia.active) {
        await admin.from('pharmacies').update({ active: true }).eq('id', id)
      }
      await desfazerBans(admin, banidasAgora)
      if (errSuspensao.code === '23505') return { ok: false, error: 'JA_SUSPENSA' }
      throw errSuspensao
    }

    const registo = await logPlatformAudit({
      action: 'account.suspend',
      table: 'pharmacies',
      recordId: id,
      pharmacyId: id,
      before: {
        conta: 'activa',
        farmacia_activa: farmacia.active,
        perfis_activos: staffIds.length,
        contas_banidas: contas.filter((c) => c.banido).length,
        // Quem? A contagem sozinha não responde, três meses depois, a
        // «que contas é que esta suspensão cortou». O estado muda em cada
        // conta, por isso a chave entra no diff com e-mail e estado.
        contas: contas.map((c) => ({
          email: c.email || c.userId,
          estado: c.banido ? 'banida' : 'activa',
        })),
      },
      after: {
        conta: 'suspensa',
        farmacia_activa: false,
        perfis_activos: 0,
        contas_banidas: contas.length,
        contas: contas.map((c) => ({
          email: c.email || c.userId,
          estado: 'banida',
        })),
      },
      reason: texto(motivo, 400),
      session: g.session,
      requestId,
    })

    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${id}`)
    revalidatePath('/interno/auditoria')
    return {
      ok: true,
      auditado: registo.ok,
      requestId,
      contas: contas.length,
      perfis: staffIds.length,
    }
  } catch (err) {
    return falha('platform', 'Falha ao suspender a conta da farmácia', err)
  }
}

/**
 * REPOR A CONTA SUSPENSA (`account.unsuspend`).
 *
 * Desfaz exactamente o que a suspensão fez, sem inventar estado:
 *   • levanta o ban SÓ das contas que `accounts_banned_ids` registou;
 *   • reactiva a farmácia só se ela estava activa antes (`pharmacy_was_active`);
 *   • reactiva os perfis que estavam activos na altura — os que a farmácia
 *     já tinha desligado de propósito continuam desligados.
 *
 * A linha da suspensão só desaparece no fim, depois de tudo o resto ter
 * resultado. Se uma parte falhar, a linha fica: a operação pode ser
 * repetida e o ecrã não diz «reposta» a uma conta que ainda está cortada.
 */
export async function unsuspendPharmacyAccount({ pharmacyId, motivo } = {}) {
  const g = await requirePlatform('account.unsuspend', { reason: motivo })
  if (!g.ok) return g
  if (!SUSPENSAO_MANUAL.has(g.session.role)) return { ok: false, error: 'VIA_PAGAMENTO' }

  const id = String(pharmacyId || '')
  if (!UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }
  const requestId = newRequestId()

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }
    const suspensao = await lerSuspensao(admin, id)
    if (!suspensao) return { ok: false, error: 'NAO_ESTA_SUSPENSA' }

    const { data: perfisAntes } = await admin
      .from('pharmacy_staff')
      .select('id')
      .eq('pharmacy_id', id)
      .eq('active', true)

    for (const userId of suspensao.accounts_banned_ids || []) {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      // 404 = a conta já não existe (foi apagada depois do ban). Não é
      // razão para manter a farmácia suspensa; o resto da operação segue.
      if (error && !(error.status === 404 || /not found/i.test(String(error.message || '')))) {
        logError('platform', 'Não foi possível levantar o ban de uma conta', {
          pharmacyId: id,
          userId,
          code: error.code,
          message: error.message,
        })
        return { ok: false, error: 'SEM_EFEITO' }
      }
    }

    if (suspensao.pharmacy_was_active) {
      const { data: estado, error: errEstado } = await admin
        .from('pharmacies')
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('active')
        .maybeSingle()
      if (errEstado) throw errEstado
      if (!estado || estado.active !== true) {
        logError('platform', 'Repor acesso: o estado da farmácia não ficou gravado', {
          id,
          lido: estado?.active,
        })
        return { ok: false, error: 'SEM_EFEITO' }
      }
    }

    const staffIds = suspensao.staff_active_ids || []
    if (staffIds.length > 0) {
      const { error } = await admin
        .from('pharmacy_staff')
        .update({ active: true })
        .in('id', staffIds)
      if (error) throw error
    }

    const { data: apagadas, error: errApagar } = await admin
      .from('pharmacy_account_suspensions')
      .delete()
      .eq('pharmacy_id', id)
      .select('pharmacy_id')
    if (errApagar) throw errApagar
    if (!apagadas || apagadas.length !== 1) {
      logError('platform', 'Repor acesso: a linha da suspensão não foi apagada', { id })
      return { ok: false, error: 'SEM_EFEITO' }
    }

    const { data: perfisDepois } = await admin
      .from('pharmacy_staff')
      .select('id')
      .eq('pharmacy_id', id)
      .eq('active', true)

    const registo = await logPlatformAudit({
      action: 'account.unsuspend',
      table: 'pharmacies',
      recordId: id,
      pharmacyId: id,
      before: {
        conta: 'suspensa',
        farmacia_activa: farmacia.active,
        perfis_activos: (perfisAntes || []).length,
        contas_banidas: (suspensao.accounts_banned_ids || []).length,
      },
      after: {
        conta: 'activa',
        farmacia_activa: suspensao.pharmacy_was_active ? true : farmacia.active,
        perfis_activos: (perfisDepois || []).length,
        contas_banidas: 0,
      },
      reason: texto(motivo, 400),
      session: g.session,
      requestId,
    })

    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${id}`)
    revalidatePath('/interno/auditoria')
    return {
      ok: true,
      auditado: registo.ok,
      requestId,
      contas: (suspensao.accounts_banned_ids || []).length,
    }
  } catch (err) {
    return falha('platform', 'Falha ao repor a conta da farmácia', err)
  }
}

/**
 * REENVIAR O CONVITE (`account.resend`).
 *
 * O convite expira ao fim de uma hora e este é o caminho para o repetir sem
 * apagar nada. O que acontece é exactamente o do convite inicial — a mesma
 * função (`lib/invites.js`) gera um link novo com `generateLink` e entrega-o
 * pelo Resend —, com duas diferenças que a ficha exige:
 *
 *   • só para convites POR ACEITAR: quem já entrou tem senha e sessão, e um
 *     convite reenviado a essa conta seria um link de sessão a circular sem
 *     ninguém o ter pedido. Para essa, o caminho é a recuperação de senha;
 *   • a conta é a DESTA farmácia: a linha de `admin_users` é lida com o id
 *     que o ecrã mandou e o `pharmacy_id` da ficha, nunca aceite às cegas —
 *     um id de outra conta não pode fazer sair um convite nosso daqui.
 *
 * O motivo é obrigatório na matriz (`ACOES_COM_MOTIVO`) e fica em
 * `platform_audit_log.reason`: um reenvio é um e-mail nosso a um cliente, e
 * tem de ter quem responda por ele três meses depois.
 */
export async function resendPharmacyInvite({ pharmacyId, userId, motivo } = {}) {
  const g = await requirePlatform('account.resend', { reason: motivo })
  if (!g.ok) return g

  const id = String(pharmacyId || '')
  const contaId = String(userId || '')
  if (!UUID_RE.test(id) || !UUID_RE.test(contaId)) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }

    const { data: conta, error: errConta } = await admin
      .from('admin_users')
      .select('user_id, display_name, pharmacy_id')
      .eq('user_id', contaId)
      .eq('pharmacy_id', id)
      .maybeSingle()
    if (errConta) throw errConta
    if (!conta) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }

    const { data: authData, error: errAuth } = await admin.auth.admin.getUserById(contaId)
    // A linha de `admin_users` pode sobreviver ao user do Auth num ambiente
    // mexido à mão: para quem está na ficha, o resultado é o mesmo — não há
    // conta para convidar, e não uma falha genérica que parece avaria.
    if (errAuth) {
      if (errAuth.status === 404 || /not found/i.test(String(errAuth.message || ''))) {
        return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }
      }
      throw errAuth
    }
    const user = authData?.user
    if (!user?.email) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }

    // `email_confirmed_at` nulo é o que distingue um convite pendente de uma
    // conta que já entrou — a mesma régua que a ficha usa para a coluna
    // «Convite». A verificação é aqui outra vez porque o ecrã pode estar
    // aberto desde antes de a pessoa ter aceite.
    if (user.email_confirmed_at || user.confirmed_at) {
      return { ok: false, error: 'CONVITE_JA_ACEITE' }
    }

    const requestId = newRequestId()
    const convite = await convidarDono({
      admin,
      farmacia,
      email: user.email,
      nome: conta.display_name || null,
    })
    if (!convite.ok) {
      return { ok: false, error: convite.error, detalhe: convite.detalhe || null, requestId }
    }

    await logPlatformAudit({
      action: 'account.resend',
      table: 'admin_users',
      recordId: contaId,
      pharmacyId: id,
      // As duas versões têm as MESMAS chaves: o `diffJson` da trilha mostra
      // só o que mudou, e um `convite_aceite` só no `before` aparecia como
      // «false → null» no histórico — a leitura oposta à que aconteceu.
      before: { email: user.email, convite: 'pendente', farmacia: farmacia.slug },
      after: { email: convite.email, convite: 'reenviado', farmacia: farmacia.slug },
      reason: texto(motivo, 400),
      session: g.session,
      requestId,
    })

    revalidatePath(`/interno/farmacias/${id}`)
    return { ok: true, email: convite.email, requestId }
  } catch (err) {
    return falha('platform', 'Falha ao reenviar o convite da farmácia', err)
  }
}

/**
 * REPOR A SENHA DA CONTA (`account.reset_password`) — Task 6.
 *
 * Quem perdeu a senha não precisa de um convite novo (a conta já está
 * confirmada) nem de uma suspensão: precisa de um link de recuperação no
 * e-mail da conta. Nós NUNCA definimos a senha por ninguém — geramos o
 * token (`generateLink`, que não envia nada) e entregamos o link pelo
 * Resend, como no convite. É a mesma decisão de 6.1: o SMTP do Supabase
 * está limitado a 2 mensagens/hora e só entrega à equipa do projecto.
 *
 * O link aponta para `/portal/recuperar/confirmar`, que troca o
 * `token_hash` por sessão e mostra o formulário. Em nenhum passo a senha
 * passa por aqui, pelo log ou pela trilha: o `before`/`after` fala do
 * PEDIDO («link enviado»), não de credenciais.
 *
 * O que é recusado, e porquê:
 *   • conta por confirmar → `CONVITE_PENDENTE` (o caminho é o convite; um
 *     link de recuperação sobre um e-mail não confirmado não abre sessão);
 *   • conta banida → `CONTA_SUSPENSA` (repor a senha não é repor o acesso);
 *   • farmácia/conta que não são uma da outra → `CONTA_NAO_ENCONTRADA`.
 */
export async function sendPharmacyPasswordReset({ pharmacyId, userId, motivo } = {}) {
  const g = await requirePlatform('account.reset_password', { reason: motivo })
  if (!g.ok) return g

  const id = String(pharmacyId || '')
  const contaId = String(userId || '')
  if (!UUID_RE.test(id) || !UUID_RE.test(contaId)) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }

    const { data: conta, error: errConta } = await admin
      .from('admin_users')
      .select('user_id, display_name, pharmacy_id')
      .eq('user_id', contaId)
      .eq('pharmacy_id', id)
      .maybeSingle()
    if (errConta) throw errConta
    if (!conta) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }

    const { data: authData, error: errAuth } = await admin.auth.admin.getUserById(contaId)
    if (errAuth) {
      if (errAuth.status === 404 || /not found/i.test(String(errAuth.message || ''))) {
        return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }
      }
      throw errAuth
    }
    const user = authData?.user
    if (!user?.email) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }
    if (estaBanido(user)) return { ok: false, error: 'CONTA_SUSPENSA' }
    if (!user.email_confirmed_at && !user.confirmed_at) {
      return { ok: false, error: 'CONVITE_PENDENTE' }
    }

    // Sem chave do Resend não se gera o link: um token criado e não
    // entregue só cria confusão (e o pedido seguinte volta a gerar outro).
    if (!emailConfigurado()) return { ok: false, error: 'EMAIL_NAO_CONFIGURADO' }

    const { data: link, error: errLink } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
    })
    if (errLink) {
      const msg = String(errLink.message || '')
      if (
        errLink.status === 429 ||
        errLink.code === 'over_request_rate_limit' ||
        /rate limit|too many/i.test(msg)
      ) {
        return { ok: false, error: 'EMAIL_LIMITE', detalhe: msg }
      }
      throw errLink
    }

    const tokenHash = link?.properties?.hashed_token
    if (!tokenHash) {
      logError('platform', 'A reposição de senha não devolveu token', {
        email: user.email,
        userId: contaId,
      })
      return { ok: false, error: 'LINK_FALHOU' }
    }

    const url = `${SITE_URL}/portal/recuperar/confirmar?token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=recovery`
    const mensagem = emailRecuperacao({
      nome: conta.display_name || null,
      farmacia: farmacia.name,
      link: url,
    })
    const envio = await enviarEmail({ to: user.email, ...mensagem })
    if (!envio.ok) {
      logError('platform', 'A reposição de senha foi gerada mas o e-mail não saiu', {
        email: user.email,
        userId: contaId,
        code: envio.error,
        detalhe: envio.detalhe || null,
      })
      return { ok: false, error: envio.error, detalhe: envio.detalhe || null }
    }

    const requestId = newRequestId()
    const registo = await logPlatformAudit({
      action: 'account.reset_password',
      table: 'admin_users',
      recordId: contaId,
      pharmacyId: id,
      // As duas versões têm as MESMAS chaves (`diffJson` da trilha mostra
      // só o que mudou). Nunca entra aqui uma senha — nem a antiga nem a
      // nova: a operação é «pedido enviado», não «senha alterada».
      before: { email: user.email, senha: 'inalterada', farmacia: farmacia.slug },
      after: { email: user.email, senha: 'link de reposição enviado', farmacia: farmacia.slug },
      reason: texto(motivo, 400),
      session: g.session,
      requestId,
    })

    revalidatePath(`/interno/farmacias/${id}`)
    return { ok: true, email: user.email, requestId, auditado: registo.ok }
  } catch (err) {
    return falha('platform', 'Falha ao enviar a reposição de senha da farmácia', err)
  }
}

/**
 * REVOGAR UM CONVITE PENDENTE (`account.revoke`).
 *
 * O caso: a morada estava errada ou a farmácia desistiu antes de aceitar.
 * O convite é um `user` do Auth por confirmar; apagá-lo é o único gesto que
 * o faz parar de existir — reenviar só emitia outro link para a mesma
 * conta. A linha de `admin_users` desaparece com ele pela FK
 * `on delete cascade` (0001), que é o que a ficha mostra na coluna
 * «Convite».
 *
 * AS GUARDAS, todas antes de apagar:
 *   • a conta tem de ser DESTA farmácia (`admin_users.pharmacy_id`);
 *   • só se apaga um convite POR ACEITAR. `email_confirmed_at` preenchido
 *     é uma conta que já entrou: essa tem senha, sessões e possivelmente
 *     stock/reservas pelo portal, e o caminho é suspender — nunca apagar;
 *   • `last_sign_in_at` também trava: um convite pendente não tem sessões,
 *     e um acesso registado significa que a conta já foi usada mesmo que a
 *     confirmação não tenha ficado gravada.
 *
 * A trilha grava o `before` completo (e-mail, nome, convite pendente e a
 * farmácia) e `after: null` — o registo da remoção. Como no resto do
 * módulo, a auditoria é best-effort: se falhar, a conta fica apagada na
 * mesma e a resposta leva `auditado: false`, para o ecrã avisar em vez de
 * dizer «feito» sem rasto.
 */
export async function revokePharmacyInvite({ pharmacyId, userId, motivo } = {}) {
  const g = await requirePlatform('account.revoke', { reason: motivo })
  if (!g.ok) return g

  const id = String(pharmacyId || '')
  const contaId = String(userId || '')
  if (!UUID_RE.test(id) || !UUID_RE.test(contaId)) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, id)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }

    const { data: conta, error: errConta } = await admin
      .from('admin_users')
      .select('user_id, display_name, pharmacy_id')
      .eq('user_id', contaId)
      .eq('pharmacy_id', id)
      .maybeSingle()
    if (errConta) throw errConta
    if (!conta) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }

    const { data: authData, error: errAuth } = await admin.auth.admin.getUserById(contaId)
    if (errAuth) {
      if (errAuth.status === 404 || /not found/i.test(String(errAuth.message || ''))) {
        return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }
      }
      throw errAuth
    }
    const user = authData?.user
    if (!user?.email) return { ok: false, error: 'CONTA_NAO_ENCONTRADA' }

    // A mesma régua da ficha e do reenvio, relida aqui: o ecrã pode estar
    // aberto desde antes de a pessoa ter aceitado. Nunca se apaga uma conta
    // que já entrou — para essa há `account.suspend`.
    if (user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at) {
      return { ok: false, error: 'CONVITE_JA_ACEITE' }
    }

    const { error: errApagar } = await admin.auth.admin.deleteUser(contaId)
    if (errApagar) {
      logError('platform', 'Não foi possível apagar a conta do convite', {
        userId: contaId,
        code: errApagar.code,
        message: errApagar.message,
      })
      return { ok: false, error: 'FALHA' }
    }

    const registo = await logPlatformAudit({
      action: 'account.revoke',
      table: 'admin_users',
      recordId: contaId,
      pharmacyId: id,
      before: {
        email: user.email,
        nome: conta.display_name || null,
        convite: 'pendente',
        farmacia: farmacia.slug,
      },
      after: null,
      reason: texto(motivo, 400),
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath(`/interno/farmacias/${id}`)
    revalidatePath('/interno/auditoria')

    return {
      ok: true,
      email: user.email,
      nome: conta.display_name || null,
      auditado: registo.ok,
    }
  } catch (err) {
    return falha('platform', 'Falha ao revogar o convite da farmácia', err)
  }
}
