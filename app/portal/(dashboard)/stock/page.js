import { Suspense } from 'react'
import StockPanel from '@/components/portal/StockPanel'

export const metadata = {
  title: 'Portal da farmácia — stock',
  robots: { index: false, follow: false },
}

/**
 * Gestão de stock (ponto 4) + criação de fármacos (ponto 1).
 * O botão "+ Medicamento em falta no catálogo" vive na toolbar do
 * StockPanel e abre o formulário num modal — já não há uma secção
 * solta no fundo da página.
 *
 * Suspense obrigatório: o StockPanel lê ?q= (deep-link da pesquisa
 * global da top-bar) com useSearchParams — sem boundary, o Next
 * desactiva a renderização estática da shell.
 */
export default function PortalStockPage() {
  return (
    <div className="portal-page">
      <Suspense
        fallback={
          <div className="empty-state" role="status">
            <div className="spinner" />
          </div>
        }
      >
        <StockPanel />
      </Suspense>
    </div>
  )
}
