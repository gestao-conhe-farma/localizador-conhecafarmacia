import PharmacyProfileForm from '@/components/portal/PharmacyProfileForm'
import { getPharmacySession } from '@/lib/pharmacy-session'

export const metadata = {
  title: 'Portal da farmácia — perfil',
  robots: { index: false, follow: false },
}

/**
 * Dados da farmácia (ponto 3) — organização das definições da plataforma
 * de gestão: secções numeradas separadas por réguas, em vez de todas as
 * opções amontoadas num único cartão.
 */
export default async function PortalProfilePage() {
  const { pharmacy } = await getPharmacySession()

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Perfil da farmácia</h1>
          <p className="portal-page-sub">
            Morada, contactos, horário e localização — tudo o que o cliente vê na página pública.
          </p>
        </div>
      </div>

      <PharmacyProfileForm pharmacy={pharmacy} />
    </div>
  )
}
