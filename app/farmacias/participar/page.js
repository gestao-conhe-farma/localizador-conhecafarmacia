import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import PharmacyApplicationForm from '@/components/farmacias/PharmacyApplicationForm'

// Página pública "por baixo dos panos": noindex como as restantes páginas
// do Localizador até ao lançamento.
export const metadata = {
  title: 'Adesão de farmácias',
  description:
    'Candidate a sua farmácia ao Localizador de Medicamentos. Preencha os dados e a equipa da Conheça Farmácia entra em contacto no máximo em 72 horas.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ParticiparPage() {
  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <section className="shop-hero">
          <div className="cf-wrap">
            <p className="cf-kicker">Adesão de farmácias</p>
            <h1>
              Traga a sua farmácia
              <br />
              <em>para o Localizador.</em>
            </h1>
            <p className="shop-hero-sub">
              Preencha os dados da farmácia. A equipa da Conheça Farmácia revê o pedido e entra em
              contacto no máximo em 72 horas (horas corridas).
            </p>
          </div>
        </section>

        <section className="sh-section">
          <div className="cf-wrap">
            <div className="apply-card">
              <PharmacyApplicationForm />
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </>
  )
}
