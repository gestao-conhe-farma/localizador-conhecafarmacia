import { createServerComponentClient } from '@/lib/supabase/server'
import { logError, logWarn } from '@/lib/log'
import {
  ENTRY_PLAN,
  FEATURES,
  LIMIT_LABELS,
  PLANS_ENFORCED,
  entitlements,
  hasFeature,
  planInfo,
  planNeededForFeature,
  planNeededForLimit,
} from '@/lib/plans'

/**
 * Estado do plano de uma farmácia (migração 0028) e a aplicação dos
 * entitlements (lib/plans.js) no lado do servidor.
 *
 * Lê com o cliente da sessão (cookies): a RLS da 0028 só deixa ver a
 * própria linha (`is_own_pharmacy`) e o grant é POR COLUNA — `notes` e
 * `updated_by` (uso interno) nunca chegam aqui, nem sequer são pedidos.
 * Por isso o select nomeia as colunas em vez de usar `*` (que falharia
 * com 42501 ao pedir colunas sem grant).
 *
 * Toda a autorização por plano passa por aqui: esconder botões não é
 * autorização, e as Server Actions do portal chamam `requireEntitlement`
 * antes de escrever seja o que for.
 *
 * O PRAZO é uma linha e não um aviso: experiência ou graça terminadas põem
 * a farmácia no plano de entrada na hora (`effectivePlanOf`), sem job
 * agendado, sem escrever na base e sem apagar nada — o estado fica como
 * está para a equipa ver e para «retomar» devolver o que ela tinha.
 */

const COLUMNS = 'plan_code, status, trial_until, grace_until, started_at, updated_at'

/** Estados em que o plano atribuído está em vigor. */
const PLAN_ACTIVE = new Set(['trial', 'activo', 'graca'])

/** Acima disto um prazo pede atenção nos ecrãs («a expirar»). */
export const DIAS_ALERTA = 7

const DIA_MS = 24 * 60 * 60 * 1000

/** Rótulos do ciclo de vida, para o chip do portal e para a área interna. */
export const STATUS_LABELS = {
  trial: 'Em experiência',
  activo: 'Activo',
  graca: 'Período de graça',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

/**
 * Um prazo (experiência ou graça) já terminou?
 *
 * Uma data EM FALTA conta como terminada, de propósito: `trial` sem
 * `trial_until` (ou `graca` sem `grace_until`) seria acesso pago sem fim —
 * e aqui falha-se para o mínimo, nunca para o máximo (a mesma regra do
 * código de plano desconhecido). Uma data ilegível é o mesmo caso.
 */
export function prazoVencido(iso) {
  if (!iso) return true
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? true : t <= Date.now()
}

/**
 * Plano em vigor — a única regra que decide o que a farmácia tem hoje.
 *
 * Cai para o plano de entrada em três casos, todos pelo mesmo motivo (a
 * farmácia foi avisada de que aquele era o fim do prazo) e sem apagar nada:
 *
 *   • estado que corta (`suspenso`, `cancelado`) — decisão da equipa;
 *   • `trial` com o fim da experiência no passado — experiência terminada
 *     sem decisão é o plano de entrada, como o ecrã do primeiro plano
 *     anuncia a quem negocia (§3.2 do plano);
 *   • `graca` com o fim da graça no passado — a graça é tempo dado, não um
 *     plano novo.
 *
 * O ESTADO (`status`) fica como está: é o que diz à equipa porque é que a
 * farmácia desceu, e é o que faz «retomar» devolver exactamente o que ela
 * tinha. Nada é escrito aqui — esta função é uma leitura, e uma decisão de
 * produto que muda de valor quando o relógio anda não deve andar a escrever
 * na base a cada leitura.
 */
export function effectivePlanOf(planCode, status, trialUntil, graceUntil) {
  if (!PLAN_ACTIVE.has(status)) return ENTRY_PLAN
  if (status === 'trial' && prazoVencido(trialUntil)) return ENTRY_PLAN
  if (status === 'graca' && prazoVencido(graceUntil)) return ENTRY_PLAN
  return planCode
}

/**
 * Ficha do plano de uma linha da 0028 — a mesma forma para a área interna e
 * para o portal, para que «Gestão», «Em experiência» e «em vigor:
 * Localizador» não possam dizer coisas diferentes em ecrãs diferentes.
 *
 * `planoNome` é o plano ATRIBUÍDO (o que a equipa negociou, com o rótulo do
 * estado) e `emVigor`/`emVigorNome` é o que está a valer hoje — que é
 * diferente sempre que um prazo terminou ou há suspensão. `expirado` diz
 * que o prazo terminou (não que ainda está a chegar: para isso é
 * `aExpirar`, e os dois nunca são verdadeiros ao mesmo tempo).
 */
export function fichaPlano(row) {
  if (!row?.plan_code) {
    return {
      // `temPlano` distingue «a farmácia ainda não tem plano nenhum» (o caso
      // da recém-criada, que se resolve no ecrã do primeiro plano) de «tem o
      // plano de entrada». Sem isto, a ficha não saberia qual dos dois
      // botões mostrar.
      temPlano: false,
      planCode: null,
      planoNome: null,
      status: null,
      statusLabel: 'Sem plano',
      trialUntil: null,
      graceUntil: null,
      startedAt: null,
      updatedAt: null,
      fimEm: null,
      diasParaFim: null,
      aExpirar: false,
      expirado: false,
      emVigor: null,
      emVigorNome: null,
    }
  }

  const status = row.status || null
  const fimEm = status === 'trial' ? row.trial_until : status === 'graca' ? row.grace_until : null
  const fimMs = fimEm ? new Date(fimEm).getTime() : null
  const expirado = fimEm !== null && fimEm !== undefined && prazoVencido(fimEm)
  const diasParaFim =
    fimMs === null || Number.isNaN(fimMs) ? null : Math.ceil((fimMs - Date.now()) / DIA_MS)

  // `planInfo` cai para o plano de entrada com um código desconhecido —
  // aqui é só o RÓTULO; os limites (a parte que autoriza) são resolvidos
  // por `entitlements()`, que também falha para o mínimo.
  const vigor = effectivePlanOf(row.plan_code, status, row.trial_until, row.grace_until)
  return {
    temPlano: true,
    planCode: row.plan_code,
    planoNome: planInfo(row.plan_code).nome,
    status,
    statusLabel: STATUS_LABELS[status] || status,
    trialUntil: row.trial_until || null,
    graceUntil: row.grace_until || null,
    startedAt: row.started_at || null,
    updatedAt: row.updated_at || null,
    fimEm: fimEm || null,
    diasParaFim,
    aExpirar: diasParaFim !== null && !expirado && diasParaFim <= DIAS_ALERTA,
    expirado,
    emVigor: vigor,
    emVigorNome: planInfo(vigor).nome,
  }
}

/**
 * Devolve sempre um objecto válido (nunca null): sem linha ou com erro de
 * leitura resolve para o plano de ENTRADA — falhar para o mínimo, nunca
 * para o máximo. `falha: true` diz que foi fallback, para quem quiser
 * distinguir «não tem plano» de «o plano é o de entrada».
 */
export async function getSubscription(pharmacyId) {
  const base = {
    planCode: ENTRY_PLAN,
    status: 'activo',
    effectivePlan: ENTRY_PLAN,
    entitlements: entitlements(ENTRY_PLAN),
    plan: planInfo(ENTRY_PLAN),
    trialUntil: null,
    graceUntil: null,
    prazoVencido: false,
    falha: false,
    enforced: PLANS_ENFORCED,
  }
  if (!pharmacyId) return { ...base, falha: true }

  try {
    const supabase = await createServerComponentClient()
    const { data, error } = await supabase
      .from('pharmacy_subscriptions')
      .select(COLUMNS)
      .eq('pharmacy_id', pharmacyId)
      .maybeSingle()

    // Tabela por aplicar (PGRST205/42P01): o portal não pode rebentar por
    // causa disto — assume o plano de entrada e segue.
    if (error) {
      logWarn('planos', 'Subscrição ilegível — a assumir plano de entrada', {
        pharmacyId,
        code: error.code,
      })
      return { ...base, falha: true }
    }
    if (!data) return { ...base, falha: true }

    const planCode = data.plan_code || ENTRY_PLAN
    const effectivePlan = effectivePlanOf(planCode, data.status, data.trial_until, data.grace_until)
    // Prazo terminado (e não suspensão): é o que explica à farmácia, no
    // portão do portal e no chip da sidebar, porque é que desceu de plano.
    const vencido =
      data.status === 'trial'
        ? prazoVencido(data.trial_until)
        : data.status === 'graca'
          ? prazoVencido(data.grace_until)
          : false
    return {
      ...base,
      planCode,
      status: data.status,
      effectivePlan,
      entitlements: entitlements(effectivePlan),
      plan: planInfo(effectivePlan),
      trialUntil: data.trial_until,
      graceUntil: data.grace_until,
      prazoVencido: vencido,
    }
  } catch (err) {
    logError('planos', 'Falha ao ler a subscrição', {
      pharmacyId,
      message: err?.message || String(err),
    })
    return { ...base, falha: true }
  }
}

/**
 * Guard para Server Actions.
 *
 * `feature` é uma chave de FEATURES (funcionalidade, ex.: 'movimentos') ou
 * um limite (ex.: 'webhooks'). `need` é quantas unidades o pedido quer —
 * `requireEntitlement(id, 'webhooks', count + 1)` recusa o SEXTO destino
 * no plano Gestão.
 *
 * Devolve `{ ok: true, ... }` ou `{ ok: false, error: 'PLANO_INSUFICIENTE', ... }`
 * no formato `{ ok, error }` do resto do projecto, com o que a UI precisa
 * para explicar: o plano em vigor e o plano que desbloquearia.
 *
 * Com `PLANS_ENFORCED` desligado devolve sempre ok (interruptor de
 * rollout — ver lib/plans.js).
 */
export async function requireEntitlement(pharmacyId, feature, need = 1) {
  const sub = await getSubscription(pharmacyId)
  if (!PLANS_ENFORCED) return { ok: true, enforced: false, sub }

  if (FEATURES[feature]) {
    if (hasFeature(sub.effectivePlan, feature)) return { ok: true, enforced: true, sub }
    return {
      ok: false,
      error: 'PLANO_INSUFICIENTE',
      feature,
      featureLabel: FEATURES[feature].label,
      plano: sub.effectivePlan,
      planoNome: sub.plan.nome,
      planoNecessario: planNeededForFeature(feature),
      limite: null,
    }
  }

  const limit = sub.entitlements[feature]
  if (typeof limit === 'number' && limit >= need) return { ok: true, enforced: true, sub }

  return {
    ok: false,
    error: 'PLANO_INSUFICIENTE',
    feature,
    featureLabel: LIMIT_LABELS[feature] || feature,
    plano: sub.effectivePlan,
    planoNome: sub.plan.nome,
    planoNecessario: planNeededForLimit(feature, need),
    limite: typeof limit === 'number' ? limit : 0,
  }
}

/**
 * A mesma conta, sem ir à base de dados, a partir de uma subscrição já
 * lida (páginas que precisam de saber se bloqueiam algo, a seguir a
 * `getSubscription`).
 */
export function allow(sub, feature, need = 1) {
  if (!PLANS_ENFORCED) return true
  if (FEATURES[feature]) return hasFeature(sub.effectivePlan, feature)
  const limit = entsOf(sub)[feature]
  return typeof limit === 'number' && limit >= need
}

function entsOf(sub) {
  return sub?.entitlements || entitlements(ENTRY_PLAN)
}
