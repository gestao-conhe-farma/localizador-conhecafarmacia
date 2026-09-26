import { Suspense } from 'react'
import RestockPanel from '@/components/portal/RestockPanel'

export const metadata = {
  title: 'Portal da farmácia — entrada de stock',
  robots: { index: false, follow: false },
}

/**
 * Entrada de stock (reposição) — a farmácia soma as unidades recebidas
 * de cada medicamento. Complemento directo da baixa automática que as
 * reservas concluídas fazem (trigger 0006): a baixa sai aqui em cima.
 *
 * Suspense obrigatório: o RestockPanel usa useSearchParams (deep-link
 * ?q=… vindo dos botões «Repor» da página de atenção) e, sem boundary,
 * o Next desactiva a renderização estática de toda a shell.
 */
export default function PortalRestockPage() {
  return (
    <div className="portal-page">
      <Suspense
        fallback={
          <div className="empty-state" role="status">
            <div className="spinner" />
          </div>
        }
      >
        <RestockPanel />
      </Suspense>
    </div>
  )
}
