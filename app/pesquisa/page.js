import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import DrugSearch from '@/components/search/DrugSearch'

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
      <main className="search-page">
        <DrugSearch />
      </main>
      <AppFooter />
    </>
  )
}
