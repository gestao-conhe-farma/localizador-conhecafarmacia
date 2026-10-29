import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import ProductCard from '@/components/search/ProductCard'
import { getDrugStockServer } from '@/lib/stock'

// Render por pedido: o stock muda a cada confirmação de farmácia e a página é
// noindex, por isso não há ganho em pré-renderizar.
export const dynamic = 'force-dynamic'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Um medicamento, todas as farmácias que o têm.
 *
 * É o destino do «ver farmácias» do hub da conta: quem guardou um medicamento
 * no Localizador chega aqui e vê quem o confirmou, por preço. Os cartões levam
 * à ficha do item (`/produto/<stock_item_id>`), como na prateleira da farmácia
 * e na pesquisa — o mesmo item que o cliente viu, com a mesma reserva.
 *
 * Noindex até ao lançamento, como as restantes páginas públicas.
 */
export async function generateMetadata({ params }) {
  const { id } = await params
  const items = await getDrugStockServer(id)
  const first = items?.[0]

  if (!first) {
    return {
      title: 'Medicamento indisponível',
      robots: { index: false, follow: false },
    }
  }

  const farmacias = new Set(items.map((item) => item.pharmacy_slug)).size
  return {
    title: `${first.drug_name} — ${plural(farmacias, 'farmácia', 'farmácias')}`,
    description: `${first.drug_name} confirmado por ${plural(
      farmacias,
      'farmácia',
      'farmácias',
    )} de Luanda e Ícolo e Bengo. Preços de balcão e reserva gratuita no Localizador da Conheça Farmácia.`,
    robots: { index: false, follow: false },
  }
}

export default async function MedicamentoPage({ params }) {
  const { id } = await params
  const items = await getDrugStockServer(id)

  const first = items?.[0] || null
  const farmacias = new Set((items || []).map((item) => item.pharmacy_slug)).size
  const apresentacao = first
    ? [first.drug_form, first.drug_dosage, first.drug_molecule].filter(Boolean).join(' · ')
    : ''

  // Do mais barato para o mais caro. Sem preço vai para o fim: a farmácia não
  // o publicou e ordenar por um valor que não existe seria inventá-lo.
  const ordenados = [...(items || [])].sort(
    (a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY),
  )

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap" style={{ paddingTop: 24, paddingBottom: 56 }}>
          <p className="pdp-crumb">
            <Link href="/pesquisa">Pesquisar</Link>
            <span>/</span>
            <Link href="/farmacia">Farmácias</Link>
            <span>/</span>
            <span>Medicamento</span>
          </p>

          {first ? (
            <>
              <div className="sh-bar">
                <div className="sh-bar-l">
                  <h1 className="acct-title">{first.drug_name}</h1>
                  <span className="sh-bar-sub">
                    {plural(farmacias, 'farmácia', 'farmácias')}
                    {apresentacao ? ` · ${apresentacao}` : ''}
                  </span>
                </div>
                <Link className="cf-btn cf-btn--ghost" href="/pesquisa">
                  Nova pesquisa
                </Link>
              </div>

              <div className="pcard-grid" style={{ marginTop: 16 }}>
                {ordenados.map((item) => (
                  <ProductCard key={item.stock_item_id} item={item} />
                ))}
              </div>

              <p className="cf-note" style={{ marginTop: 24 }}>
                Stock confirmado pelas farmácias nas últimas 72 horas. O preço é o de balcão, em
                kwanzas; a reserva não se paga online.
              </p>
            </>
          ) : (
            <div className="sh-empty" style={{ paddingTop: 64 }}>
              <p className="sh-empty-title">Nenhuma farmácia tem este medicamento agora</p>
              <p className="sh-empty-sub">
                Pode ter sido vendido desde a última confirmação, ou o stock saiu do Localizador ao
                fim de 72 horas sem nova confirmação. Pesquise outra vez para ver o que está
                disponível.
              </p>
              <p
                style={{
                  marginTop: 16,
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Link className="cf-btn cf-btn--primary" href="/pesquisa">
                  Pesquisar medicamento
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
      <AppFooter />
    </>
  )
}
