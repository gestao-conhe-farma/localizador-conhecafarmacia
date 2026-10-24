import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import Notice from '@/components/ui/Notice'
import ApplicationRecap from '@/components/farmacias/ApplicationRecap'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_WHATSAPP } from '@/lib/constants'

export const metadata = {
  title: 'Pedido recebido',
  description:
    'Recebemos o pedido de adesão da sua farmácia. A equipa da Conheça Farmácia entra em contacto no máximo em 72 horas.',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function ParticiparObrigadoPage({ searchParams }) {
  const query = await searchParams
  const emailFalhou = query?.email === '0'

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <section className="shop-hero">
          <div className="cf-wrap">
            <p className="cf-kicker">Pedido enviado</p>
            <h1>
              Pedido recebido.
              <br />
              <em>Obrigado.</em>
            </h1>
            <p className="shop-hero-sub">
              A equipa da Conheça Farmácia vai analisar os dados da sua farmácia e entra em contacto
              no máximo em 72 horas (horas corridas).
            </p>
          </div>
        </section>

        <section className="sh-section">
          <div className="cf-wrap">
            <div className="apply-card apply-success">
              <span className="apply-success-icon" aria-hidden="true">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>

              <h2>O que acontece agora</h2>
              <ol className="apply-success-steps">
                <li>A equipa revê a identificação, a localização e os contactos da farmácia.</li>
                <li>Entramos em contacto pelo e-mail ou telefone indicados, no máximo em 72 horas.</li>
                <li>Se o pedido avançar, combinamos os próximos passos da adesão ao Localizador.</li>
              </ol>

              <ApplicationRecap enviado={!emailFalhou} />

              {!emailFalhou && (
                <p className="apply-success-note">
                  Enviámos a confirmação para o e-mail indicado no formulário. Se não a encontrar,
                  verifique também a pasta de spam.
                </p>
              )}

              {emailFalhou && (
                <Notice tone="warn" role="status">
                  O pedido ficou registado, mas o e-mail de confirmação não saiu. Se precisar de
                  falar connosco, use{' '}
                  <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>{' '}
                  ou {CONTACT_EMAIL} · {CONTACT_PHONE_DISPLAY}.
                </Notice>
              )}

              <p className="apply-success-note">
                Guarde este contacto para o caso de precisar de acrescentar alguma informação:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · {CONTACT_PHONE_DISPLAY}.
              </p>

              <div className="apply-success-acts">
                <Link className="cf-btn cf-btn--primary" href="/pesquisa">
                  Pesquisar medicamentos
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias da rede
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </>
  )
}
