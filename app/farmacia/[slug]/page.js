import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import PharmacyStock from '@/components/search/PharmacyStock'
import { getPharmacyStockServer } from '@/lib/stock'

// Página server-rendered: o HTML já chega ao crawler com o stock da farmácia
// e o <title> correto — antes tudo era buscado no browser. A query vive em
// lib/stock.js (partilhada com o refetch do componente client).

export async function generateMetadata({ params }) {
  const { slug } = await params
  const items = await getPharmacyStockServer(slug)
  const name = items?.[0]?.pharmacy_name

  if (!name) {
    // Perfil público "por baixo dos panos": noindex até ao lançamento.
    return {
      title: 'Farmácia parceira',
      robots: { index: false, follow: false },
    }
  }
  return {
    title: name,
    description: `Stock confirmado em tempo real na ${name} — medicamentos críticos, preços e contacto directo. Localizador de Medicamentos da Conheça Farmácia.`,
    robots: { index: false, follow: false },
  }
}

export default async function FarmaciaPage({ params }) {
  const { slug } = await params
  const initialItems = await getPharmacyStockServer(slug)

  return (
    <>
      <AppHeader />
      <main>
        <PharmacyStock slug={slug} initialItems={initialItems} />
      </main>
      <AppFooter />
    </>
  )
}
