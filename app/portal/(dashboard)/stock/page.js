import { Suspense } from 'react'
import StockPanel from '@/components/portal/StockPanel'
import { PortalSectionSkeleton } from '@/components/portal/PortalPageSkeleton'
import { getActiveStaff } from '@/lib/staff-session'

export const metadata = {
  title: 'Portal da farmácia — stock',
  robots: { index: false, follow: false },
}

/**
 * Gestão de stock (ponto 4) + criação de fármacos (ponto 1).
 * O botão "+ Medicamento em falta no catálogo" vive na toolbar do
 * StockPanel e abre o formulário num drawer — já não há uma secção
 * solta no fundo da página.
 *
 * Suspense obrigatório: o StockPanel lê ?q= (deep-link da pesquisa
 * global da top-bar) com useSearchParams — sem boundary, o Next
 * desactiva a renderização estática da shell.
 */
export default async function PortalStockPage() {
  // Só o gerente valida os medicamentos criados pela farmácia (0015).
  const staff = await getActiveStaff()
  const isManager = staff?.role === 'gerente'
  return (
    <div className="portal-page">
      <Suspense fallback={<PortalSectionSkeleton lines={6} />}>
        <StockPanel isManager={isManager} />
      </Suspense>
    </div>
  )
}
