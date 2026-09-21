import AppHeader from '@/components/layout/AppHeader'
import Footer from '@/components/layout/Footer'
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
      <main className="search-container pb-20">
        {/* Hero */}
        <section className="about-hero">
          <h1 className="about-hero-title">Sobre o projecto</h1>
          <p className="about-hero-sub">
            O Localizador de Medicamentos é um serviço da Conheça Farmácia que aproxima
            as pessoas do medicamento certo — com informação em que se pode confiar.
          </p>
        </section>

        {/* O problema */}
        <section className="about-section">
          <p className="about-kicker">O problema</p>
          <h2 className="about-h2">Em Luanda, encontrar um medicamento é uma corrida contra o tempo</h2>
          <p className="about-p">
            Quem precisa de um medicamento específico — insulina, um anticonvulsivante,
            um anticoagulante — conhece a rotina: ligar a uma farmácia atrás da outra,
            percorrer a cidade sem garantias, e chegar a casa sem resposta.
          </p>
          <p className="about-p">
            O problema não é só a falta do medicamento — é a falta de informação. Ninguém
            sabe, antes de sair de casa, qual farmácia o tem.
          </p>
        </section>

        {/* A solução */}
        <section className="about-section">
          <p className="about-kicker">A solução</p>
          <h2 className="about-h2">Uma rede de farmácias que confirmam o stock — e um mapa que o mostra</h2>
          <p className="about-p">
            As farmácias parceiras actualizam o stock no nosso portal. Cada confirmação
            tem data e hora, e o público vê sempre quanto tempo tem: &laquo;confirmado há 40
            minutos&raquo;.
          </p>
          <div className="about-points">
            <div className="about-point">
              <span className="confirmed-dot" />
              <p className="about-point-text">
                Pesquisa por nome ou molécula, com filtros por município de Luanda.
              </p>
            </div>
            <div className="about-point">
              <span className="confirmed-dot" />
              <p className="about-point-text">
                Preço, morada, telefone e WhatsApp directos da farmácia — sem intermediários.
              </p>
            </div>
            <div className="about-point">
              <span className="confirmed-dot" />
              <p className="about-point-text">
                Nada de informação velha: stock confirmado há mais de 72 horas sai do ar
                automaticamente.
              </p>
            </div>
            <div className="about-point">
              <span className="confirmed-dot" />
              <p className="about-point-text">
                Reservas em desenvolvimento: num futuro próximo, reservará o medicamento
                antes de sair de casa.
              </p>
            </div>
          </div>
        </section>

        {/* Compromissos */}
        <section className="about-section">
          <p className="about-kicker">Compromissos</p>
          <h2 className="about-h2">O que nos obriga</h2>
          <div className="about-points">
            {COMPROMISSOS.map((c) => (
              <div key={c} className="about-point">
                <span className="confirmed-dot" />
                <p className="about-point-text">{c}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="about-cta">
          <h2 className="search-cta-title">É farmácia? Junte-se à rede do lançamento.</h2>
          <p className="search-cta-sub">
            Seja encontrado por quem precisa do seu stock — gratuitamente.
          </p>
          <Link href="/#farmacias" className="btn btn-primary">
            Quero participar
          </Link>
        </section>
      </main>
      <Footer />
    </>
  )
}
