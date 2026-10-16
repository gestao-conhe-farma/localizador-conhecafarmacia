'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit } from '@/lib/platform/audit'
import { can } from '@/lib/platform/permissions'
import { ENTRY_PLAN, PLAN_ORDER, catalogoPlanos } from '@/lib/plans'
import { fichaPlano } from '@/lib/platform/subscriptions'
import { logError } from '@/lib/log'

/**
 * PLANOS no lado interno — Phase 7 do plano
 * (docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * O que vive aqui é o ESTADO da subscrição de cada farmácia (migração
 * 0028): que plano tem, em que ponto do ciclo está (experiência, activo,
 * graça, suspenso) e as notas internas de quem negoceia. O CATÁLOGO — o que
 * cada plano abre e quanto custa — não se toca daqui: é `lib/plans.js`, em
 * código, e este módulo limita-se a lê-lo (`catalogo()`).
 *
 * Três regras, as mesmas da área de farmácias:
 *
 *   1. A autorização é a matriz (`requirePlatform`), nunca a UI. As seis
 *      acções de plano são `superadmin` + `faturacao`, exigem sessão `aal2`
 *      e motivo escrito — avaliados no servidor antes de qualquer escrita.
 *   2. Nada se apaga. Sair do plano pago é `suspenso`; para voltar,
 *      `retomar`. O `plan_code` fica onde está durante a suspensão: quem
 *      desce é o plano EM VIGOR (`effectivePlanOf` em
 *      lib/platform/subscriptions.js), e é isso que devolve o serviço
 *      anterior intacto quando o pagamento regulariza. O DELETE está
 *      revogado ao service_role na 0028 — a regra vive no schema.
 *   3. A escrita lê a linha de volta. A trilha não pode ser mais optimista
 *      do que a base: se o valor gravado não for o pedido, a acção falha
 *      com `SEM_EFEITO` em vez de registar uma mudança que não aconteceu
 *      (foi exactamente o que o trigger da 0005 fez, em silêncio, até à
 *      0030).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Colunas do plano — as mesmas que a farmácia lê, mais as notas internas. */
const COLS = 'plan_code, status, trial_until, grace_until, started_at, ended_at, updated_at, notes'

/** Dias por omissão: a experiência e a graça da §3.2. */
const DIAS_TRIAL = 14
const DIAS_GRACA = 15

const MAX_DIAS = 365
const MAX_NOTAS = 600

const ESTADOS = ['trial', 'activo', 'graca', 'suspenso', 'cancelado']

function texto(valor, limite) {
  const t = String(valor ?? '').trim()
  return limite ? t.slice(0, limite) : t
}

function erroMeta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}

function falha(scope, mensagem, err) {
  logError(scope, mensagem, erroMeta(err))
  return { ok: false, error: 'FALHA' }
}

// `fichaPlano` (o plano atribuído, o estado, o prazo e o plano EM VIGOR)
// vive em lib/platform/subscriptions.js, ao lado da regra que decide o que
// está em vigor: a ficha da farmácia, a lista e este ecrã lêem a mesma
// função, e nenhum deles pode dizer «Gestão» quando a farmácia já está no
// plano de entrada.

/** Só os campos do plano: é isto que a trilha guarda no antes/depois. */
function camposPlano(row) {
  if (!row) return null
  return {
    plano: row.plan_code ?? null,
    estado: row.status ?? null,
    experiencia_ate: row.trial_until ?? null,
    graca_ate: row.grace_until ?? null,
    notas: row.notes ?? null,
  }
}

/** Dias: inteiro 1..365, ou o valor por omissão. `null` = inválido. */
function normalizarDias(valor, omissao) {
  if (valor === undefined || valor === null || valor === '') return omissao
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS) return null
  return n
}

function maisDias(dias, de = Date.now()) {
  return new Date(de + dias * 24 * 60 * 60 * 1000).toISOString()
}

function lerSubscricao(admin, pharmacyId) {
  return admin
    .from('pharmacy_subscriptions')
    .select(COLS)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error
      return data || null
    })
}

function lerFarmacia(admin, pharmacyId) {
  return admin
    .from('pharmacies')
    .select('id, slug, name, municipio, active, verified, created_at')
    .eq('id', pharmacyId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error
      return data || null
    })
}

/**
 * A escrita que não mente: grava, lê de volta e compara.
 *
 * O patch nunca inclui colunas que o trigger de `pharmacies` proteja — aqui
 * a tabela é a `pharmacy_subscriptions`, sem trigger nenhum —, mas a
 * comparação fica na mesma: qualquer via (uma policy, um grant revogado por
 * engano, uma migração futura) que faça a escrita não pegar tem de aparecer
 * como falha, e não como uma linha de auditoria bonita.
 */
function confirmado(depois, patch) {
  if (!depois) return false
  const igual = (a, b) => {
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    const da = new Date(a)
    const db = new Date(b)
    if (!Number.isNaN(da.getTime()) && !Number.isNaN(db.getTime())) {
      return Math.abs(da.getTime() - db.getTime()) < 1000
    }
    return String(a) === String(b)
  }
  return ['plan_code', 'status', 'trial_until', 'grace_until', 'notes'].every((campo) => {
    if (!Object.hasOwn(patch, campo)) return true
    return igual(depois[campo], patch[campo])
  })
}

/**
 * O caminho único de todas as acções de plano: autoriza (com motivo e MFA
 * já resolvidos pela matriz), confirma que a farmácia existe, deixa a
 * acção decidir o patch a partir do estado actual, grava, confirma e
 * registra na trilha.
 *
 * `construir(antes)` devolve `{ patch }`, `{ erro: 'CODIGO' }` ou `{ nada: true }`
 * — este último para quando o pedido não muda nada (suspender quem já está
 * suspenso): aí não se escreve nem se registra na trilha, devolve-se
 * `mudou: 0`, como as acções da ficha da farmácia fazem.
 */
async function aplicar({ acao, pharmacyId, motivo, construir }) {
  const g = await requirePlatform(acao, { reason: motivo })
  if (!g.ok) return g
  if (!UUID_RE.test(String(pharmacyId || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, pharmacyId)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }

    const antes = await lerSubscricao(admin, pharmacyId)
    const decisao = construir(antes)
    if (decisao.erro) return { ok: false, error: decisao.erro }
    if (decisao.nada) return { ok: true, mudou: 0, plano: fichaPlano(antes) }

    const patch = {
      ...decisao.patch,
      updated_at: new Date().toISOString(),
      updated_by: g.session?.user?.id ?? null,
    }

    const { data: depois, error } = antes
      ? await admin
          .from('pharmacy_subscriptions')
          .update(patch)
          .eq('pharmacy_id', pharmacyId)
          .select(COLS)
          .maybeSingle()
      : await admin
          .from('pharmacy_subscriptions')
          .insert({ pharmacy_id: pharmacyId, ...patch })
          .select(COLS)
          .maybeSingle()

    if (error) throw error

    if (!confirmado(depois, patch)) {
      logError('platform', 'O plano não ficou gravado como foi pedido', {
        acao,
        pharmacyId,
        pedido: patch,
        lido: depois,
      })
      return { ok: false, error: 'SEM_EFEITO' }
    }

    await logPlatformAudit({
      action: acao,
      table: 'pharmacy_subscriptions',
      recordId: pharmacyId,
      pharmacyId,
      before: camposPlano(antes),
      after: camposPlano(depois),
      reason: motivo,
      session: g.session,
    })

    revalidatePath('/interno')
    revalidatePath('/interno/planos')
    revalidatePath(`/interno/farmacias/${pharmacyId}`)

    return {
      ok: true,
      farmacia: { id: farmacia.id, nome: farmacia.name },
      plano: fichaPlano(depois),
      criado: !antes,
    }
  } catch (err) {
    return falha('platform', 'Falha ao gravar o plano da farmácia', err)
  }
}

/** O `plan_code` é do catálogo? Um código desconhecido resolveria para o mínimo — mas isso é para LER, não para gravar. */
function planValido(code) {
  return PLAN_ORDER.includes(code)
}

// ===============================================================
// Leituras
// ===============================================================

/**
 * Subscrições de todas as farmácias (Task 7.1 Step 2), incluindo as que
 * AINDA NÃO TÊM plano — que são, para esta área, o trabalho por fazer: uma
 * farmácia criada há pouco não tem linha na 0028 até alguém lha atribuir, e
 * sem esta lista ela desaparecia do ecrã dos planos.
 *
 * Lê com o service-role (a área interna não tem RLS alargada, 0027) e
 * devolve tudo o que é preciso para o ecrã decidir, sem uma segunda
 * passagem à base.
 *
 * O guard é de LEITURA: o nível que negoceia planos vê o estado deles sem
 * precisar de ter confirmado o código do autenticador — o MFA é exigido nas
 * seis acções que ESCREVEM (ver `requirePlatformRead` em
 * lib/platform/session.js). Pedi-lo aqui tornava o ecrã dos planos
 * inutilizável numa sessão só com senha.
 */
export async function getSubscriptions() {
  const g = await requirePlatformRead('plan.change')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()
    const [farmRes, subRes] = await Promise.all([
      admin
        .from('pharmacies')
        .select('id, slug, name, municipio, active, verified, created_at')
        .order('name'),
      admin.from('pharmacy_subscriptions').select(`pharmacy_id, ${COLS}`),
    ])
    if (farmRes.error) throw farmRes.error
    if (subRes.error) throw subRes.error

    const porId = new Map((subRes.data || []).map((s) => [s.pharmacy_id, s]))
    const rows = (farmRes.data || []).map((f) => {
      const sub = porId.get(f.id) || null
      return {
        id: f.id,
        slug: f.slug,
        name: f.name,
        municipio: f.municipio,
        active: f.active,
        verified: f.verified,
        criadaEm: f.created_at,
        plano: fichaPlano(sub),
        notas: sub?.notes ?? null,
      }
    })

    const conta = (fn) => rows.filter(fn).length
    return {
      ok: true,
      rows,
      podeAtribuir: can(g.session.role, 'plan.assign'),
      planos: catalogoPlanos(),
      totais: {
        total: rows.length,
        semPlano: conta((r) => !r.plano.temPlano),
        activos: conta((r) => r.plano.status === 'activo'),
        // Estados CONTADOS sem os prazos vencidos: uma experiência terminada
        // não está «a correr», já está no plano de entrada — e é isso que
        // `vencidos` conta. Os seis totais particionam as farmácias.
        trial: conta((r) => r.plano.status === 'trial' && !r.plano.expirado),
        graca: conta((r) => r.plano.status === 'graca' && !r.plano.expirado),
        suspensos: conta((r) => r.plano.status === 'suspenso'),
        cancelados: conta((r) => r.plano.status === 'cancelado'),
        aExpirar: conta((r) => r.plano.aExpirar),
        // Prazo terminado: a farmácia JÁ está no plano de entrada e o
        // estado continua `trial`/`graca` — são os que pedem decisão hoje,
        // não os que vão pedir para a semana.
        vencidos: conta((r) => r.plano.expirado),
      },
    }
  } catch (err) {
    return falha('platform', 'Falha ao listar as subscrições', err)
  }
}

/**
 * Histórico das acções de plano (Task 7.1 Step 2): a trilha filtrada pelas
 * acções `plan.*`, por farmácia ou de todas. Serve o ecrã dos planos e o
 * «porquê» de uma descida de plano três meses depois.
 */
export async function getPlanHistory(pharmacyId = null, limite = 20) {
  const g = await requirePlatformRead('plan.change')
  if (!g.ok) return g
  if (pharmacyId && !UUID_RE.test(String(pharmacyId))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    let q = admin
      .from('platform_audit_log')
      .select('id, created_at, actor_email, actor_role, action, reason, pharmacy_id, before, after')
      .like('action', 'plan.%')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limite) || 20, 100))
    if (pharmacyId) q = q.eq('pharmacy_id', pharmacyId)

    const { data, error } = await q
    if (error) throw error
    return {
      ok: true,
      rows: (data || []).map((h) => ({
        id: h.id,
        quando: h.created_at,
        actorEmail: h.actor_email,
        actorRole: h.actor_role,
        action: h.action,
        reason: h.reason,
        pharmacyId: h.pharmacy_id,
        before: h.before,
        after: h.after,
      })),
    }
  } catch (err) {
    return falha('platform', 'Falha ao ler o histórico de planos', err)
  }
}

/**
 * O que o ecrã do PRIMEIRO PLANO precisa: a farmácia (para confirmar que é
 * mesmo ela), se já tem plano, e o catálogo. A acção desta página é
 * `plan.assign` — o ecrã existe para pôr uma farmácia sem plano em
 * `trial` ou `activo`, e nada mais.
 */
export async function getPrimeiroPlano(pharmacyId) {
  const g = await requirePlatformRead('plan.assign')
  if (!g.ok) return g
  if (!UUID_RE.test(String(pharmacyId || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const farmacia = await lerFarmacia(admin, pharmacyId)
    if (!farmacia) return { ok: false, error: 'NAO_ENCONTRADA' }
    const sub = await lerSubscricao(admin, pharmacyId)

    return {
      ok: true,
      farmacia,
      plano: fichaPlano(sub),
      planos: catalogoPlanos(),
      padroes: { diasTrial: DIAS_TRIAL, diasGraca: DIAS_GRACA },
      podeVerFicha: can(g.session.role, 'pharmacy.view'),
    }
  } catch (err) {
    return falha('platform', 'Falha ao preparar o primeiro plano', err)
  }
}

// ===============================================================
// Escrita
// ===============================================================

/**
 * O PRIMEIRO plano de uma farmácia recém-criada (`plan.assign`).
 *
 * Só existe para uma farmácia **sem** linha na 0028: se já tiver plano, o
 * caminho é `changePlan`/`startTrial` — e dizê-lo é melhor do que reescrever
 * por cima (o `JA_TEM_PLANO` do pedido vira uma frase no ecrã).
 *
 * `modo` é o que o ecrã pergunta: «experiência» (acesso completo com prazo,
 * para a farmácia experimentar) ou «activo» (o plano escolhido em vigor
 * desde já). É a diferença entre `trial_until` preenchido e não.
 */
export async function assignPlan({
  pharmacyId,
  planCode,
  modo = 'trial',
  dias,
  notas,
  motivo,
} = {}) {
  const plano = texto(planCode)
  const modoFinal = texto(modo) === 'activo' ? 'activo' : 'trial'
  const diasFinal = normalizarDias(dias, DIAS_TRIAL)
  const notasFinal = notas === undefined ? undefined : texto(notas, MAX_NOTAS)

  if (!planValido(plano)) return { ok: false, error: 'PLANO_INVALIDO' }
  if (modoFinal === 'trial' && diasFinal === null) return { ok: false, error: 'PRAZO_INVALIDO' }

  return aplicar({
    acao: 'plan.assign',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (antes) return { erro: 'JA_TEM_PLANO' }
      const patch = {
        plan_code: plano,
        status: modoFinal,
        trial_until: modoFinal === 'trial' ? maisDias(diasFinal) : null,
        grace_until: null,
      }
      if (notasFinal !== undefined) patch.notes = notasFinal || null
      return { patch }
    },
  })
}

/**
 * Mudar de plano (`plan.change`): subida ou descida.
 *
 * Não mexe no ESTADO — quem está em experiência continua em experiência, com
 * o prazo que tinha, e quem está suspenso por pagamento continua suspenso.
 * Separá-lo assim é o que impede uma descida de plano de apagar (ou
 * inventar) um prazo: cada acção responde por uma coisa só.
 */
export async function changePlan({ pharmacyId, planCode, notas, motivo } = {}) {
  const plano = texto(planCode)
  const notasFinal = notas === undefined ? undefined : texto(notas, MAX_NOTAS)
  if (!planValido(plano)) return { ok: false, error: 'PLANO_INVALIDO' }

  return aplicar({
    acao: 'plan.change',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (!antes) return { erro: 'SEM_PLANO' }
      const patch = { plan_code: plano }
      if (notasFinal !== undefined) patch.notes = notasFinal || null
      return { patch }
    },
  })
}

/**
 * Período de experiência (`plan.trial`): acesso completo com prazo.
 *
 * O plano por omissão é o `gestao` — a §3.2 descreve a experiência como
 * «acesso de `gestao` completo com prazo». Não é uma promoção silenciosa: a
 * farmácia fica com os limites que a experiência dá e vê-os no portal, e o
 * fim do prazo traz a decisão de volta à equipa.
 */
export async function startTrial({ pharmacyId, planCode, dias, motivo } = {}) {
  const pedido = texto(planCode)
  const diasFinal = normalizarDias(dias, DIAS_TRIAL)
  if (pedido && !planValido(pedido)) return { ok: false, error: 'PLANO_INVALIDO' }
  if (diasFinal === null) return { ok: false, error: 'PRAZO_INVALIDO' }

  return aplicar({
    acao: 'plan.trial',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (!antes) return { erro: 'SEM_PLANO' }
      const plano = pedido || (antes.plan_code === ENTRY_PLAN ? 'gestao' : antes.plan_code)
      return {
        patch: {
          plan_code: plano,
          status: 'trial',
          trial_until: maisDias(diasFinal),
          grace_until: null,
        },
      }
    },
  })
}

/**
 * Período de graça (`plan.grace`): pagamento atrasado, nada se corta.
 *
 * O plano em vigor continua o mesmo até ao fim da graça (`grace_until`); ao
 * contrário da suspensão, aqui não há perda nenhuma de funcionalidades — é
 * dar tempo, e ficar registado que foi dado.
 */
export async function startGrace({ pharmacyId, dias, motivo } = {}) {
  const diasFinal = normalizarDias(dias, DIAS_GRACA)
  if (diasFinal === null) return { ok: false, error: 'PRAZO_INVALIDO' }

  return aplicar({
    acao: 'plan.grace',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (!antes) return { erro: 'SEM_PLANO' }
      return {
        patch: {
          status: 'graca',
          grace_until: maisDias(diasFinal),
          trial_until: null,
        },
      }
    },
  })
}

/**
 * Suspender por pagamento (`plan.suspend`) — o corte por incumprimento.
 *
 * Muda SÓ o estado. O `plan_code` fica onde está e é o plano EM VIGOR que
 * desce para o de entrada (`effectivePlanOf`): a farmácia continua com
 * conta, histórico e stock, deixa de ter as funcionalidades do plano pago, e
 * `resumePlan` devolve exactamente o que ela tinha. Nada se apaga — a regra
 * da 0028, e a razão pela qual uma suspensão é reversível.
 */
export async function suspendForBilling({ pharmacyId, motivo } = {}) {
  return aplicar({
    acao: 'plan.suspend',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (!antes) return { erro: 'SEM_PLANO' }
      if (antes.status === 'suspenso') return { nada: true }
      return { patch: { status: 'suspenso' } }
    },
  })
}

/**
 * Retomar o plano (`plan.resume`): pagamento regularizado.
 *
 * Volta a `activo` e limpa os prazos — os que lá estavam já passaram, e
 * deixá-los no ecrã mostrava datas que não valem nada. O plano volta a ser o
 * que estava guardado (nada desceu no `plan_code`).
 */
export async function resumePlan({ pharmacyId, motivo } = {}) {
  return aplicar({
    acao: 'plan.resume',
    pharmacyId,
    motivo,
    construir: (antes) => {
      if (!antes) return { erro: 'SEM_PLANO' }
      const limpo =
        antes.status === 'activo' &&
        antes.trial_until == null &&
        antes.grace_until == null &&
        antes.ended_at == null
      if (limpo) return { nada: true }
      return {
        patch: {
          status: 'activo',
          trial_until: null,
          grace_until: null,
          ended_at: null,
        },
      }
    },
  })
}
