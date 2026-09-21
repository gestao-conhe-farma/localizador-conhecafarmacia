import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
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
      <Header />
      <main className="search-page">
        <DrugSearch />
      </main>
      <Footer />
    </>
  )
}
