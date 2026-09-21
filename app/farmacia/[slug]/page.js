import AppHeader from '@/components/layout/AppHeader'
import Footer from '@/components/layout/Footer'
import PharmacyStock from '@/components/search/PharmacyStock'

// Perfil público "por baixo dos panos": noindex até ao lançamento.
export const metadata = {
  title: 'Farmácia parceira',
  description:
    'Perfil público da farmácia parceira no Localizador de Medicamentos da Conheça Farmácia.',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function FarmaciaPage({ params }) {
  const { slug } = await params

  return (
    <>
      <AppHeader />
      <main>
        <PharmacyStock slug={slug} />
      </main>
      <Footer />
    </>
  )
}
