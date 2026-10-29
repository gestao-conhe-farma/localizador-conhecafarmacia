import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import ProductSheet from '@/components/search/ProductSheet'
import { getProductServer } from '@/lib/stock'
import { getAccountSession } from '@/lib/account-session'
import { kindLabel, quantityText } from '@/lib/product-utils'

// Ficha de produto server-rendered: o HTML chega ao crawler com o nome do
// produto, a farmácia e o preço — a reserva em dois passos é que é cliente.
// Noindex até ao lançamento, como as restantes páginas públicas.

export async function generateMetadata({ params }) {
  const { id } = await params
  const data = await getProductServer(id)
  const item = data?.item
  if (!item) {
    return {
      title: 'Produto indisponível',
      robots: { index: false, follow: false },
    }
  }
  const pres = [item.drug_form, item.drug_dosage].filter(Boolean).join(' ')
  const qty = quantityText(item)
  return {
    title: `${item.drug_name} — ${item.pharmacy_name}`,
    description: `${item.drug_name}${pres ? ` (${pres})` : ''} na ${item.pharmacy_name}${
      item.pharmacy_municipio ? `, ${item.pharmacy_municipio}` : ''
    }. ${qty ? `${qty} confirmadas pela farmácia.` : 'Stock confirmado pela farmácia.'} Preço de balcão e reserva gratuita no Localizador da Conheça Farmácia.`,
    robots: { index: false, follow: false },
  }
}

export default async function ProdutoPage({ params }) {
  const { id } = await params
  const data = await getProductServer(id)
  const item = data?.item || null
  const alternatives = data?.alternatives || []

  // Nome e telefone da conta para o formulário de reserva chegar preenchido
  // (Task 5.8). Só o que o formulário usa atravessa — nunca o objecto `user`.
  const sessao = await getAccountSession()
  const meta = sessao?.user?.user_metadata || {}
  const profile = sessao
    ? { name: meta.full_name || meta.display_name || '', phone: meta.phone || '' }
    : null

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        {item ? (
          <>
            <div className="cf-wrap" style={{ paddingTop: 24 }}>
              <p className="pdp-crumb">
                <Link href="/pesquisa">Pesquisar</Link>
                <span>/</span>
                <Link href={`/farmacia/${item.pharmacy_slug}`}>{item.pharmacy_name}</Link>
                <span>/</span>
                <span>{kindLabel(item.drug_kind)}</span>
              </p>
            </div>
            <div className="cf-wrap">
              <ProductSheet item={item} alternatives={alternatives} profile={profile} />
            </div>
            <div className="cf-wrap">
              <p className="cf-note">
                Preços de balcão, em kwanzas. A reserva não se paga online: o produto fica separado
                e o pagamento é feito na farmácia. Sem nova confirmação da farmácia, um medicamento
                sai do Localizador ao fim de 72 h e um produto de parafarmácia ao fim de 30 dias.
              </p>
            </div>
          </>
        ) : (
          <div className="cf-wrap">
            <div className="sh-empty" style={{ paddingTop: 80 }}>
              <p className="sh-empty-title">Este produto já não está no Localizador</p>
              <p className="sh-empty-sub">
                A farmácia pode ter deixado de confirmar o stock, o item pode ter sido vendido ou a
                validade expirou. Pesquise outra vez para ver o que está disponível agora.
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
                  Pesquisar produto
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias
                </Link>
              </p>
            </div>
          </div>
        )}
      </main>
      <AppFooter />
    </>
  )
}
