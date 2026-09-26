import RestockPanel from '@/components/portal/RestockPanel'

export const metadata = {
  title: 'Portal da farmácia — entrada de stock',
  robots: { index: false, follow: false },
}

/**
 * Entrada de stock (reposição) — a farmácia soma as unidades recebidas
 * de cada medicamento. Complemento directo da baixa automática que as
 * reservas concluídas fazem (trigger 0006): a baixa sai aqui em cima.
 */
export default function PortalRestockPage() {
  return (
    <div className="portal-page">
      <RestockPanel />
    </div>
  )
}
