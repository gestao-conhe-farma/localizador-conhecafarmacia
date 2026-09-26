import { Suspense } from 'react'
import ReservationStatus from '@/components/reservation/ReservationStatus'

export const metadata = {
  title: 'Acompanhar reserva — Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Acompanhamento público da reserva — URL não-listado partilhado pela
 * farmácia no WhatsApp (link vem nos templates de confirmação).
 * Renderização client-side: a policy "reservations public read by id"
 * (migração 0011) deixa ler apenas a reserva do id no URL, sem login.
 */
export default async function ReservationTrackPage({ params }) {
  const { id } = await params

  return (
    <main className="res-track-page">
      <Suspense
        fallback={
          <div className="empty-state" role="status">
            <div className="spinner" />
          </div>
        }
      >
        <ReservationStatus reservationId={id} />
      </Suspense>
    </main>
  )
}
