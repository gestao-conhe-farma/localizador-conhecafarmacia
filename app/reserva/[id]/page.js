import { Suspense } from 'react'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
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
 *
 * A página usa o mesmo esqueleto das outras páginas do Localizador
 * (AppHeader + .cf-shop + AppFooter): quem chega pelo link do WhatsApp
 * reconhece o sítio e não aterra num ecrã com outra linguagem.
 */
export default async function ReservationTrackPage({ params }) {
  const { id } = await params

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap">
          <Suspense
            fallback={
              <div className="sh-empty" role="status">
                <div className="sh-spinner" />
                <p className="sh-empty-sub">A carregar a reserva…</p>
              </div>
            }
          >
            <ReservationStatus reservationId={id} />
          </Suspense>
        </div>
      </main>
      <AppFooter />
    </>
  )
}
