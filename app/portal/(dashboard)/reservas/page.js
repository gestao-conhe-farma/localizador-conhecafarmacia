import { Suspense } from 'react'
import ReservationsQueue from '@/components/portal/ReservationsQueue'

export const metadata = {
  title: 'Portal da farmácia — reservas',
  robots: { index: false, follow: false },
}

/**
 * Fila de reservas (ponto 4) — página própria, com realtime.
 *
 * Suspense obrigatório: a fila lê ?q= (deep-link da pesquisa global
 * da top-bar) com useSearchParams — sem boundary, o Next desactiva a
 * renderização estática da shell.
 */
export default function PortalReservationsPage() {
  return (
    <div className="portal-page">
      <Suspense
        fallback={
          <div className="empty-state" role="status">
            <div className="spinner" />
          </div>
        }
      >
        <ReservationsQueue />
      </Suspense>
    </div>
  )
}
