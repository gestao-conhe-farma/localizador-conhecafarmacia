import PharmacyProfileForm from '@/components/portal/PharmacyProfileForm'
import { getPharmacySession } from '@/lib/pharmacy-session'

export const metadata = {
  title: 'Portal da farmácia — perfil',
  robots: { index: false, follow: false },
}

/**
 * Perfil da FARMÁCIA (ponto 3) — painéis hairline do v2 «Premium
 * Calmo»: Identificação, Contacto e localização, Horário. O cabeçalho
 * (com o «Guardar» primário) vive dentro do form, que é client.
 *
 * É o par de /portal/sessao (dados do farmacêutico com sessão
 * iniciada) e a entrada é o nome da farmácia na top-bar.
 *
 * `accountEmail`: o email da CONTA serve de valor inicial no campo de
 * email da farmácia até este ser preenchido (o email de login vive no
 * auth.users — ver migração 0019).
 */
export default async function PortalProfilePage() {
  const session = await getPharmacySession()
  const pharmacy = session.pharmacy
  const accountEmail = session.user?.email || ''

  return (
    <div className="portal-page">
      <PharmacyProfileForm pharmacy={pharmacy} accountEmail={accountEmail} />
    </div>
  )
}
