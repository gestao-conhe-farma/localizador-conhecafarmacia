import PharmacyProfileForm from '@/components/portal/PharmacyProfileForm'
import { getPharmacySession } from '@/lib/pharmacy-session'

export const metadata = {
  title: 'Portal da farmácia — perfil',
  robots: { index: false, follow: false },
}

/**
 * Dados da farmácia (ponto 3) — painéis hairline do v2 «Premium
 * Calmo»: Identificação, Contacto e localização, Horário. O cabeçalho
 * (com o «Guardar» primário) vive dentro do form, que é client.
 */
export default async function PortalProfilePage() {
  const { pharmacy } = await getPharmacySession()

  return (
    <div className="portal-page">
      <PharmacyProfileForm pharmacy={pharmacy} />
    </div>
  )
}
