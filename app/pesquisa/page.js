import { Suspense } from 'react'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import DrugSearch from '@/components/search/DrugSearch'

// Render por pedido: o cartão da ficha lê `?produto=` (useSearchParams) e
// queremos o hero e a lista no HTML inicial — um shell estático obrigaria
// a pré-renderizar só o fallback da Suspense e a página aparecia vazia
// até à hidratação. É uma página noindex, por isso o custo é irrelevante.
export const dynamic = 'force-dynamic'

// Página "por baixo dos panos": fora do índice do Google até ao lançamento.
export const metadata = {
  title: 'Pesquisar medicamento',
  description:
    'Pesquise o medicamento e veja que farmácias de Luanda o têm em stock, com confirmação das últimas 72 horas.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PesquisaPage() {
  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        {/* O cartão da ficha vive no URL (?produto=…): `useSearchParams`
            corre dentro desta fronteira de Suspense. */}
        <Suspense fallback={null}>
          <DrugSearch />
        </Suspense>
      </main>
      <AppFooter />
    </>
  )
}
