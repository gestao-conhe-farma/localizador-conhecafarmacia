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
 */

const COLUMNS = 'plan_code, status, trial_until, grace_until, started_at, updated_at'

/** Estados em que o plano atribuído está em vigor. */
const PLAN_ACTIVE = new Set(['trial', 'activo', 'graca'])

/** Rótulos do ciclo de vida, para o chip do portal e para a área interna. */
export const STATUS_LABELS = {
  trial: 'Em experiência',
  activo: 'Activo',
  graca: 'Período de graça',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
}

/**
 * Plano em vigor: um estado suspenso ou cancelado cai para o plano de
 * entrada. Nunca apaga nada — o que a farmácia construiu fica à espera de
 * voltar (é o que dá sentido a `status` em vez de `delete`).
 */
function effectivePlanOf(planCode, status) {
  return PLAN_ACTIVE.has(status) ? planCode : ENTRY_PLAN
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
    const effectivePlan = effectivePlanOf(planCode, data.status)
    return {
      ...base,
      planCode,
      status: data.status,
      effectivePlan,
      entitlements: entitlements(effectivePlan),
      plan: planInfo(effectivePlan),
      trialUntil: data.trial_until,
      graceUntil: data.grace_until,
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
