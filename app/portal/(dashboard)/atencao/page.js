import AttentionPanel from '@/components/portal/AttentionPanel'
import { getPharmacySession } from '@/lib/pharmacy-session'

export const metadata = {
  title: 'Portal da farmácia — precisa de atenção',
  robots: { index: false, follow: false },
}

/**
 * "Precisa de Atenção" — agrega tudo o que exige decisão da farmácia
 * hoje: reposição de produtos esgotados por vendas (reservas concluídas),
 * validades nas janelas 90/60/30 dias (e expirados) e stock desactualizado.
 * O layout do portal já validou a sessão; aqui só se consome o pharmacy.id
 * para os acks de reposição por farmácia.
 */
export default async function PortalAttentionPage() {
  const { pharmacy } = await getPharmacySession()

  return (
    <div className="portal-page">
      <AttentionPanel pharmacyId={pharmacy.id} />
    </div>
  )
}
