import ReservationsQueue from '@/components/portal/ReservationsQueue'

export const metadata = {
  title: 'Portal da farmácia — reservas',
  robots: { index: false, follow: false },
}

/**
 * Fila de reservas (ponto 4) — página própria, com realtime.
 */
export default function PortalReservationsPage() {
  return (
    <div className="portal-page">
      <ReservationsQueue />
    </div>
  )
}
