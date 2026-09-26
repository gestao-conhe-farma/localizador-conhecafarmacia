import SalesReport from '@/components/portal/SalesReport'

export const metadata = {
  title: 'Portal da farmácia — vendas',
  robots: { index: false, follow: false },
}

/**
 * Mini-relatório de vendas — total estimado por dia a partir das
 * reservas concluídas, com janelas de 7/30/90 dias.
 */
export default function PortalSalesPage() {
  return (
    <div className="portal-page">
      <SalesReport />
    </div>
  )
}
