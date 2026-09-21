import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PharmacyLeadForm from '@/components/home/PharmacyLeadForm'

const CONTACT_PHONE = '+244 925 696 002'
const CONTACT_EMAIL = 'geral@conhecafarmacia.com'
const MAIN_SITE = 'https://conhecafarmacia.com'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        {/* ============ HERO ============ */}
        <section className="hero">
          <div className="hero-container">
            <div className="hero-content">
              <span className="hero-eyebrow">Uma ideia da Conheça Farmácia</span>
              <h1 className="hero-title">
                Encontre o seu medicamento em Luanda — <span className="highlight">sem dar voltas</span>
              </h1>
              <p className="hero-subtitle">
                Um website gratuito onde qualquer pessoa pesquisa o medicamento e vê, em
                segundos, quais as farmácias de Luanda que o têm em stock — com informação
                confirmada pela própria farmácia.
              </p>
              <div className="hero-actions">
                <a href="#farmacias" className="btn btn-primary btn-lg">
                  Sou farmácia e quero participar
                </a>
                <a href="#como-funciona" className="btn btn-secondary btn-lg">
                  Como funciona
                </a>
              </div>
            </div>

            <div className="hero-animated" aria-hidden="true">
              <div className="hero-animated-card">
                <div className="hero-animated-icon">
                  {/* Ícone pílula */}
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7Z" />
                    <path d="m8.5 8.5 7 7" />
                  </svg>
                </div>
                <div className="hero-animated-text">Insulina · disponível</div>
              </div>
              <div className="hero-ticker-text hero-ticker-text--prominent mt-3">
                Stock confirmado pela farmácia
              </div>
              <div className="hero-ticker-text">Actualizado nas últimas 72 horas</div>
            </div>
          </div>
        </section>

        {/* ============ O PROBLEMA ============ */}
        <section className="section-padding">
          <div className="container-center">
            <div className="section-head">
              <span className="section-eyebrow">O problema</span>
              <h2 className="section-title">Uma caça ao tesouro que não devia existir</h2>
              <p className="section-subtitle">
                Quem precisa de uma insulina, de um anticonvulsivante ou de um medicamento
                oncológico oral anda de farmácia em farmácia — gastando dinheiro de
                transporte, horas do dia e, muitas vezes, chegando tarde.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* telefone */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <h3>Informação espalhada</h3>
                <p>
                  A informação existe, mas está dispersa por telefonemas, conhecimentos e
                  grupos de WhatsApp. Ninguém sabe onde procurar primeiro.
                </p>
              </div>
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* relógio */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h3>Tempo e dinheiro perdidos</h3>
                <p>
                  Horas de deslocação e custos de transporte para, ao balcão, descobrir que
                  o medicamento não está disponível.
                </p>
              </div>
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* alerta */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                </div>
                <h3>Casos urgentes chegam tarde</h3>
                <p>
                  Para os medicamentos mais comuns, a dúvida é outra: <em>quem tem, a que
                  preço e a que horário?</em> A resposta demora — e às vezes custa caro.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ A SOLUÇÃO / COMO FUNCIONA ============ */}
        <section id="como-funciona" className="section-padding bg-brand-bg-alt">
          <div className="container-center">
            <div className="section-head">
              <span className="section-eyebrow">A ideia, em uma frase</span>
              <h2 className="section-title">
                Pesquisa. Vê. <span className="text-brand-primary">Reserva.</span>
              </h2>
              <p className="section-subtitle">
                Para quem procura um medicamento, o processo é simples e gratuito:
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="loc-card">
                <div className="step-num">1</div>
                <h3>Pesquisa</h3>
                <p>Escreve o nome do medicamento no site, no telemóvel ou no computador.</p>
              </div>
              <div className="loc-card">
                <div className="step-num">2</div>
                <h3>Vê as farmácias com stock</h3>
                <p>
                  Com morada, horário e contacto — e com a data em que a farmácia confirmou
                  o stock. Passadas 72 horas sem actualização, deixa de aparecer como
                  &laquo;confirmado&raquo;.
                </p>
              </div>
              <div className="loc-card">
                <div className="step-num">3</div>
                <h3>Reserva e vai ao balcão</h3>
                <p>
                  Reserva directamente no site ou combina a entrega com a farmácia. O
                  pagamento acontece sempre no balcão, ao preço da farmácia.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ PARA FARMÁCIAS ============ */}
        <section id="farmacias" className="section-padding">
          <div className="container-center">
            <div className="section-head">
              <span className="section-eyebrow">Para as farmácias parceiras</span>
              <h2 className="section-title">Seja encontrado por quem mais precisa — grátis</h2>
              <p className="section-subtitle">
                Uma actualização de 5 minutos, 2–3 vezes por semana, num ecrã simples de
                botões &laquo;temos / não temos&raquo;, no telemóvel. Sem instalar nada.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* users */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3>Clientes novos, sem custo</h3>
                <p>
                  Doentes que procuram activamente o medicamento que a sua farmácia tem — e
                  que hoje não a encontram. Sem comissão nem qualquer quantia.
                </p>
              </div>
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* clipboard-check */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <path d="m9 14 2 2 4-4" />
                  </svg>
                </div>
                <h3>Reservas organizadas</h3>
                <p>
                  O doente pede a reserva pelo site; a farmácia confirma no painel e o
                  cliente vem ao balcão — ou recebe em casa, decisão sempre da farmácia.
                </p>
              </div>
              <div className="loc-card">
                <div className="loc-card-icon">
                  {/* badge-check */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h3>Perfil público verificado</h3>
                <p>
                  Página da farmácia com morada, horário, mapa e selo &laquo;stock
                  confirmado&raquo;, no maior site de educação farmacêutica de Angola.
                </p>
              </div>
            </div>

            {/* Formulário de pré-adesão */}
            <PharmacyLeadForm />
          </div>
        </section>

        {/* ============ COMPROMISSOS ============ */}
        <section className="commit-section">
          <div className="container-center">
            <div className="section-head">
              <span className="section-eyebrow">Os nossos compromissos</span>
              <h2 className="section-title">Três regras que fazem isto funcionar</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="commit-item">
                <h3 className="text-lg font-bold text-brand-deep mb-3">Informação com data</h3>
                <p className="text-sm text-brand-deep/70 leading-relaxed">
                  Cada stock publicado tem hora de confirmação. Passadas 72 horas sem
                  actualização, deixa de aparecer como &laquo;confirmado&raquo;. Melhor
                  poucos medicamentos com informação fiável do que muitos com informação
                  errada.
                </p>
              </div>
              <div className="commit-item">
                <h3 className="text-lg font-bold text-brand-deep mb-3">
                  Não vendemos medicamentos
                </h3>
                <p className="text-sm text-brand-deep/70 leading-relaxed">
                  A Conheça Farmácia é uma organização de educação em saúde. Indicamos onde
                  está disponível e encaminhamos; a venda e a entrega são sempre
                  responsabilidade da farmácia. O pagamento acontece no balcão.
                </p>
              </div>
              <div className="commit-item">
                <h3 className="text-lg font-bold text-brand-deep mb-3">
                  Privacidade desde o dia um
                </h3>
                <p className="text-sm text-brand-deep/70 leading-relaxed">
                  O contacto do cliente serve apenas para a reserva e é visível apenas à
                  farmácia escolhida. Nunca é partilhado com terceiros.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="section-padding">
          <div className="container-center">
            <div className="section-head">
              <span className="section-eyebrow">FAQ</span>
              <h2 className="section-title">Perguntas que já adivinhamos</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
              <div className="faq-item">
                <p className="faq-q">Como é que sabem o que cada farmácia tem em stock?</p>
                <p className="faq-a">
                  As próprias farmácias parceiras actualizam o seu stock num painel simples,
                  e a nossa equipa acompanha e valida regularmente, especialmente no início.
                  Só publicamos o que a farmácia confirmou.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">E se a informação estiver desactualizada?</p>
                <p className="faq-a">
                  Toda a informação de stock tem data de confirmação visível. Passadas 72
                  horas sem actualização, deixa de aparecer como &laquo;confirmado&raquo;.
                  Mesmo assim, recomendamos sempre confirmar por telefone nos casos
                  urgentes — a honestidade é parte do serviço.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Vocês vendem medicamentos?</p>
                <p className="faq-a">
                  Não. Somos uma organização de educação em saúde. Mostramos onde o
                  medicamento está disponível e encaminhamos o cliente; a farmácia fica
                  responsável por atender o pedido. A compra faz-se sempre na farmácia.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Isto vai custar às farmácias?</p>
                <p className="faq-a">
                  O lançamento é gratuito — para farmácias e para utilizadores. No futuro, a
                  sustentabilidade virá de parcerias institucionais e de serviços às
                  farmácias parceiras, nunca de comissão sobre medicamentos.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">E os medicamentos sujeitos a receita médica?</p>
                <p className="faq-a">
                  Funcionam da mesma forma: a pessoa pode reservar, mas o levantamento no
                  balcão exige a apresentação da receita, conforme a lei angolana. O site
                  deixa isso sempre claro.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">O que fazem com os meus dados?</p>
                <p className="faq-a">
                  O telefone do cliente é usado apenas para a reserva e é visível apenas à
                  farmácia escolhida. Não partilhamos dados com terceiros e não usamos
                  contactos para marketing sem autorização.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Porque começam só com alguns medicamentos e só em Luanda?</p>
                <p className="faq-a">
                  Porque preferimos dez medicamentos com informação fiável a mil com
                  informação errada. Luanda concentra a nossa rede inicial de farmácias.
                  Quando o modelo estiver validado, expandimos.
                </p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Quando arranca?</p>
                <p className="faq-a">
                  Estamos na fase de parcerias com as primeiras farmácias de Luanda. Se é
                  farmácia, junte-se às parceiras do lançamento — ficam em destaque na
                  página principal.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer
        contactPhone={CONTACT_PHONE}
        contactEmail={CONTACT_EMAIL}
        mainSite={MAIN_SITE}
      />
    </>
  )
}
