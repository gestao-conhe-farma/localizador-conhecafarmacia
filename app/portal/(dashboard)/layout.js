import { redirect } from 'next/navigation'
import PortalShell from '@/components/portal/PortalShell'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'

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

  return (
    <PortalShell pharmacy={pharmacy} userName={profile.display_name} userSub={profile.user_id}>
      {children}
    </PortalShell>
  )
}
