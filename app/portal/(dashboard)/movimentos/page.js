import MovementsPanel from '@/components/portal/MovementsPanel'

export const metadata = {
  title: 'Portal da farmácia — movimentos',
  robots: { index: false, follow: false },
}

/**
 * Histórico de movimentos de stock (0020) — o livro-razão da farmácia.
 * Página própria (e não uma aba do Stock) porque é o que se consulta
 * quando há uma dúvida: «porque é que este saldo está assim?»
 */
export default function PortalMovementsPage() {
  return (
    <div className="portal-page">
      <MovementsPanel />
    </div>
  )
}
