import { Suspense } from 'react'
import ReservationStatus from '@/components/reservation/ReservationStatus'

export const metadata = {
  title: 'Acompanhar reserva — Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Acompanhamento público da reserva — URL não-listado com token
 * partilhado pela farmácia no WhatsApp (/reserva/[id]?t=[token]).
 * Renderização client-side via RPC get_reservation_status (migração
 * 0035): sem token válido nada é devolvido — a tabela não tem leitura
 * pública.
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
