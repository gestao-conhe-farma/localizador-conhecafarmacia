import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import PharmacyList from '@/components/search/PharmacyList'

// Página "por baixo dos panos": fora do índice do Google até ao lançamento.
export const metadata = {
  title: 'Farmácias parceiras',
  description:
    'Farmácias de Luanda que confirmam o stock de medicamentos no Localizador, sempre com dados das últimas 72 horas.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function FarmaciasPage() {
  return (
    <>
      <AppHeader />
      <main className="search-page">
        <PharmacyList />
      </main>
      <AppFooter />
    </>
  )
}
