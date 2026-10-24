import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import Link from 'next/link'

// Página "por baixo dos panos": fora do índice do Google até ao lançamento.
export const metadata = {
  title: 'Sobre o projecto',
  description:
    'O Localizador de Medicamentos aproxima as pessoas do medicamento certo: farmácias de Luanda confirmam o stock e o público pesquisa com informação de confiança, sempre das últimas 72 horas.',
  robots: {
    index: false,
    follow: false,
  },
}

const COMPROMISSOS = [
  'Informação sempre fresca: o stock confirmado tem menos de 72 horas — o que expira, desaparece.',
  'Confirmação pela própria farmácia: ninguém inventa stock. Quem actualiza é quem tem o medicamento na mão.',
  'Gratuito para o público: pesquisar, ligar e contactar por WhatsApp não custa nada.',
  'Sem vendas nem intermediários: não somos farmácia nem revendedor — encaminhamos, nunca vendemos.',
]

export default function SobrePage() {
  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <section className="shop-hero">
          <div className="cf-wrap">
            <p className="cf-kicker">O projecto</p>
            <h1>Sobre o Localizador</h1>
            <p className="shop-hero-sub">
              O Localizador de Medicamentos é um serviço da Conheça Farmácia que aproxima as pessoas
              do medicamento certo — com informação em que se pode confiar.
            </p>
            <div className="legal-meta">
              <span>Farmácias de Luanda</span>
              <span className="sep">·</span>
              <span>
                Stock confirmado nas últimas <b>72 horas</b>
              </span>
              <span className="sep">·</span>
              <span>Gratuito para o público</span>
            </div>
          </div>
        </section>

        <section className="sh-section">
          <div className="cf-wrap">
            <div className="doc-card">
              <div className="legal-grid">
                <nav className="legal-toc" aria-label="Nesta página">
                  <p className="legal-toc-title">Nesta página</p>
                  <ul>
                    <li>
                      <a href="#problema">O problema</a>
                    </li>
                    <li>
                      <a href="#solucao">A solução</a>
                    </li>
                    <li>
                      <a href="#compromissos">Compromissos</a>
                    </li>
                    <li>
                      <a href="#documentos">Documentos legais</a>
                    </li>
                  </ul>
                </nav>

                <article className="legal-body">
                  <section className="legal-part" id="problema">
                    <p className="cf-kicker">O problema</p>
                    <h2 className="legal-part-title">
                      Em Luanda, encontrar um medicamento é uma corrida contra o tempo
                    </h2>
                    <p className="legal-p">
                      Quem precisa de um medicamento específico — insulina, um anticonvulsivante, um
                      anticoagulante — conhece a rotina: ligar a uma farmácia atrás da outra,
                      percorrer a cidade sem garantias, e chegar a casa sem resposta.
                    </p>
                    <p className="legal-p">
                      O problema não é só a falta do medicamento — é a falta de informação. Ninguém
                      sabe, antes de sair de casa, qual farmácia o tem.
                    </p>
                  </section>

                  <section className="legal-part" id="solucao">
                    <p className="cf-kicker">A solução</p>
                    <h2 className="legal-part-title">
                      Uma rede de farmácias que confirmam o stock — e um mapa que o mostra
                    </h2>
                    <p className="legal-p">
                      As farmácias parceiras actualizam o stock no nosso portal. Cada confirmação
                      tem data e hora, e o público vê sempre quanto tempo tem: &laquo;confirmado há
                      40 minutos&raquo;.
                    </p>
                    <ul className="legal-list">
                      <li>Pesquisa por nome ou molécula, com filtros por província e município.</li>
                      <li>
                        Preço, morada, telefone e WhatsApp directos da farmácia — sem
                        intermediários.
                      </li>
                      <li>
                        Nada de informação velha: stock confirmado há mais de 72 horas sai do ar
                        automaticamente.
                      </li>
                      <li>
                        Reservas em desenvolvimento: num futuro próximo, reservará o medicamento
                        antes de sair de casa.
                      </li>
                    </ul>
                  </section>

                  <section className="legal-part" id="compromissos">
                    <p className="cf-kicker">Compromissos</p>
                    <h2 className="legal-part-title">O que nos obriga</h2>
                    <ul className="legal-list">
                      {COMPROMISSOS.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </section>

                  <section className="legal-part" id="documentos">
                    <p className="cf-kicker">Compromissos por escrito</p>
                    <h2 className="legal-part-title">As regras do serviço, à vista de todos</h2>
                    <p className="legal-p">
                      O que fazemos, o que não fazemos e como tratamos os dados está escrito — não
                      fica só na conversa.
                    </p>
                    <ul className="legal-list">
                      <li>
                        <Link href="/termos">Termos de Utilização</Link> — o que o Localizador é e
                        não é, como funcionam as reservas e o que se aplica às farmácias parceiras.
                      </li>
                      <li>
                        <Link href="/privacidade">Política de Privacidade</Link> — que dados
                        recolhemos, para que fins e como exercer os seus direitos.
                      </li>
                    </ul>
                  </section>

                  <div className="legal-help">
                    <div>
                      <p className="legal-help-title">É farmácia? Junte-se à rede do lançamento.</p>
                      <p>Seja encontrado por quem precisa do seu stock — gratuitamente.</p>
                    </div>
                    <div className="legal-help-acts">
                      <Link href="/farmacias/participar" className="cf-btn cf-btn--primary cf-btn--sm">
                        Quero participar
                      </Link>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </>
  )
}
