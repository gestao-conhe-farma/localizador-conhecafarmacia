import { redirect } from 'next/navigation'
import PortalShell from '@/components/portal/PortalShell'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'
import { getActiveStaff } from '@/lib/staff-session'
import { STATUS_LABELS, getSubscription } from '@/lib/platform/subscriptions'
import { PLANS_ENFORCED } from '@/lib/plans'

// Sessão sempre fresca: nada disto pode ser estático.
export const dynamic = 'force-dynamic'

/**
 * Layout partilhado do portal (redesign): valida a sessão UMA vez e
 * renderiza o shell — sidebar verde de altura total + top-bar ao lado.
 * As páginas filhas só consomem a sessão.
 *
 * Vive no route group (dashboard) para NÃO envolver o login
 * (app/portal/login/): este layout exige sessão e
 * redireccionaria o próprio login para si mesmo, em loop.
 */
export default async function PortalLayout({ children }) {
  const { session, reason, detail } = await getPharmacySessionVerbose()
  if (!session) {
    // A razão segue no URL e é mostrada na página de login — encerra a
    // adivinhação do loop pós-login (cookies não chegam? papel errado?).
    const qs = new URLSearchParams({ motivo: reason })
    if (detail) qs.set('detalhe', detail)
    redirect(`/portal/login?${qs.toString()}`)
  }
  const { profile, pharmacy } = session

  // 0018: sem perfil de farmacêutico activo não há portal — o dispositivo
  // vai ao ecrã de escolha com PIN. Os registos ficam em nome do activo.
  const staff = await getActiveStaff(session)
  if (!staff) redirect('/portal/perfis')

  // Plano da farmácia (0028): lido UMA vez aqui e passado ao shell, que o
  // mostra no chip da sidebar e marca com cadeado os itens fora do plano.
  // Só dados serializáveis seguem para os componentes cliente — e
  // `PLANS_ENFORCED` tem de vir do servidor (não é NEXT_PUBLIC_*, um
  // cliente leria `undefined`).
  const sub = await getSubscription(pharmacy.id)
  // `sub.plan.nome` é o plano EM VIGOR (um prazo terminado ou uma suspensão
  // descem ao plano de entrada) — e o rótulo diz porquê, em vez de dizer
  // «Em experiência» de uma experiência que já acabou.
  const estadoLabel = sub.prazoVencido
    ? sub.status === 'graca'
      ? 'graça terminada'
      : 'experiência terminada'
    : sub.status === 'activo'
      ? null
      : STATUS_LABELS[sub.status] || null
  const plan = {
    nome: sub.plan.nome,
    status: sub.status,
    estadoLabel,
    features: sub.entitlements.features,
    enforced: PLANS_ENFORCED,
  }

  return (
    <PortalShell
      pharmacy={pharmacy}
      userName={profile.display_name}
      userSub={profile.user_id}
      staff={staff}
      plan={plan}
    >
      {children}
    </PortalShell>
  )
}
