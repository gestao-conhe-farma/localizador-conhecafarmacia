import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import Link from 'next/link'

// Página pública "por baixo dos panos": noindex até ao lançamento, como as
// restantes páginas do Localizador.
export const metadata = {
  title: 'Política de Privacidade',
  description:
    'Que dados pessoais o Localizador de Medicamentos recolhe, para quê, com quem os partilha e como exercer os seus direitos, nos termos da Lei n.º 22/11, de 17 de Junho.',
  robots: {
    index: false,
    follow: false,
  },
}

/** Secção numerada — o número vive no markup e no índice, não em CSS. */
function Sec({ id, n, title, children }) {
  return (
    <section className="legal-sec" id={id}>
      <h3>
        <span className="legal-num">{n}</span>
        <span>{title}</span>
      </h3>
      {children}
    </section>
  )
}

/** Campo que a empresa tem de preencher antes de publicar. */
function Fill({ children }) {
  return <span className="legal-fill">{children}</span>
}

export default function PrivacidadePage() {
  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap legal-page">
          <header className="legal-hero">
            <p className="cf-kicker">Documentos legais</p>
            <h1 className="legal-title">Política de Privacidade</h1>
            <p className="legal-lede">
              Que dados pessoais o Localizador recolhe, para que fins, com quem os partilha
              e que controlo tem sobre eles — nos termos da Lei n.º 22/11, de 17 de Junho
              (Protecção de Dados Pessoais).
            </p>
            <p className="legal-meta">
              <span>
                Versão <b>1.0</b>
              </span>
              <span className="sep">·</span>
              <span>
                Em vigor desde <b>23 de Outubro de 2026</b>
              </span>
              <span className="sep">·</span>
              <span>localizador.conhecafarmacia.com</span>
            </p>
          </header>

          <div className="legal-grid">
            <nav className="legal-toc" aria-label="Índice da Política de Privacidade">
              <p className="legal-toc-title">Neste documento</p>

              <p className="legal-toc-group">Parte I · Utilizadores</p>
              <ul>
                <li>
                  <a href="#responsavel">1. Quem é responsável pelos dados</a>
                </li>
                <li>
                  <a href="#dados">2. Que dados tratamos</a>
                </li>
                <li>
                  <a href="#fins">3. Para que fins e com que fundamento</a>
                </li>
                <li>
                  <a href="#nao-fazemos">4. O que não fazemos</a>
                </li>
                <li>
                  <a href="#partilha">5. Com quem partilhamos</a>
                </li>
                <li>
                  <a href="#cookies">6. Cookies e armazenamento local</a>
                </li>
                <li>
                  <a href="#conservacao">7. Durante quanto tempo guardamos</a>
                </li>
                <li>
                  <a href="#seguranca">8. Como protegemos os dados</a>
                </li>
                <li>
                  <a href="#direitos">9. Os seus direitos</a>
                </li>
                <li>
                  <a href="#menores">10. Menores</a>
                </li>
                <li>
                  <a href="#alteracoes-politica">11. Alterações a esta política</a>
                </li>
              </ul>

              <p className="legal-toc-group">Parte II · Farmácias e empresas</p>
              <ul>
                <li>
                  <a href="#dados-farmacias">12. Que dados tratamos das farmácias</a>
                </li>
                <li>
                  <a href="#fins-farmacias">13. Para que fins os usamos</a>
                </li>
                <li>
                  <a href="#acessos">14. Acessos e responsabilidades</a>
                </li>
                <li>
                  <a href="#fim-conta">15. Depois do fim da conta</a>
                </li>
              </ul>

              <p className="legal-toc-group">Disposições finais</p>
              <ul>
                <li>
                  <a href="#contacto-privacidade">16. Contacto e reclamações</a>
                </li>
              </ul>
            </nav>

            <article className="legal-body">
              <section className="legal-part" id="parte-i">
                <p className="cf-kicker">Parte I</p>
                <h2 className="legal-part-title">Para quem usa o Localizador</h2>
                <p className="legal-part-intro">
                  Aplica-se a quem pesquisa medicamentos, vê farmácias ou faz uma reserva. A
                  pesquisa não exige conta e não é associada a quem a faz.
                </p>

                <Sec id="responsavel" n="1" title="Quem é responsável pelos dados">
                  <p className="legal-p">
                    O responsável pelo tratamento é <Fill>[NOME DA EMPRESA]</Fill>, NIF{' '}
                    <Fill>[NIF]</Fill>, com sede em <Fill>[SEDE]</Fill>, em Luanda, Angola —
                    a entidade que opera o Localizador de Medicamentos da Conheça Farmácia.
                  </p>
                  <p className="legal-p">
                    Para qualquer questão sobre os seus dados, escreva para
                    privacidade@conhecafarmacia.com ou geral@conhecafarmacia.com. Também
                    pode ligar ou enviar mensagem para +244 925 696 002.
                  </p>
                </Sec>

                <Sec id="dados" n="2" title="Que dados tratamos">
                  <p className="legal-p">
                    <b>Pesquisas.</b> O termo que escreve e os filtros que aplica são
                    processados no seu navegador, directamente contra a base de dados, e não
                    são registados pela Conheça Farmácia. Não sabemos quem pesquisou o quê.
                  </p>
                  <p className="legal-p">
                    <b>Reservas.</b> Quando reserva um produto, guardamos o nome, o número
                    de telefone, o produto e a quantidade, a farmácia escolhida, a hora de
                    levantamento, a nota que decidir escrever, o estado da reserva e as datas
                    de criação e de conclusão. O link de acompanhamento usa um código próprio
                    — sem ele, o link não abre.
                  </p>
                  <p className="legal-p">
                    <b>Contactos directos.</b> Se nos ligar ou escrever por WhatsApp, a
                    conversa fica no seu telefone e no nosso, no serviço de mensagens. Não a
                    copiamos para a base de dados do Localizador, salvo o que for necessário
                    para tratar do assunto.
                  </p>
                  <p className="legal-p">
                    <b>Dados técnicos.</b> O alojamento regista automaticamente informação
                    de funcionamento e segurança — endereço IP, data e hora, endereço
                    pedido, tipo de navegador — por um período curto. A medição de audiência
                    que usamos é agregada, sem cookies e sem identificar pessoas.
                  </p>
                  <p className="legal-p">
                    <b>Preferências do dispositivo.</b> A escolha entre tema claro e escuro
                    fica guardada no seu navegador. Não é enviada para nós.
                  </p>
                </Sec>

                <Sec id="fins" n="3" title="Para que fins e com que fundamento">
                  <ul className="legal-list">
                    <li>
                      <b>Gerir a reserva e entregá-la à farmácia escolhida</b> — tratamento
                      necessário para executar o pedido que fez (Lei n.º 22/11, de 17 de
                      Junho).
                    </li>
                    <li>
                      <b>Segurança e prevenção de abuso</b> — reservas falsas, acessos
                      indevidos e ataques ao serviço, com base no interesse legítimo de
                      manter o serviço disponível e fiável.
                    </li>
                    <li>
                      <b>Responder às suas mensagens</b> — a seu pedido ou com o seu
                      consentimento.
                    </li>
                    <li>
                      <b>Cumprir obrigações legais</b> — quando a lei nos obrigue a conservar
                      ou comunicar informação.
                    </li>
                    <li>
                      <b>Melhorar o serviço</b> — apenas com dados agregados, que não
                      identificam ninguém.
                    </li>
                  </ul>
                  <div className="legal-box">
                    <b>A reserva pode revelar informação de saúde.</b>
                    Reservar um medicamento específico pode deixar implícito um problema de
                    saúde. Tratamos esses dados com cuidado reforçado, apenas para executar o
                    pedido, e nunca para perfilagem, publicidade ou decisões automatizadas
                    sobre si.
                  </div>
                </Sec>

                <Sec id="nao-fazemos" n="4" title="O que não fazemos">
                  <ul className="legal-list">
                    <li>não vendemos nem alugamos dados pessoais;</li>
                    <li>
                      não cedemos dados a terceiros para publicidade ou marketing;
                    </li>
                    <li>
                      não pedimos dados clínicos, diagnósticos, exames ou cópias de receitas
                      no site. A nota da reserva é opcional — escreva nela apenas o que
                      quiser partilhar;
                    </li>
                    <li>não gravamos as pesquisas nem as associamos a pessoas;</li>
                    <li>
                      não fazemos perfilagem comportamental nem publicidade dirigida com
                      base nos seus dados;
                    </li>
                    <li>
                      não tomamos decisões automatizadas que produzam efeitos jurídicos ou
                      significativos sobre si.
                    </li>
                  </ul>
                </Sec>

                <Sec id="partilha" n="5" title="Com quem partilhamos">
                  <p className="legal-p">
                    <b>A farmácia escolhida.</b> Recebe o nome, o telefone, o produto, a
                    quantidade, a hora de levantamento e a nota — é o mínimo para preparar e
                    entregar a reserva.
                  </p>
                  <p className="legal-p">
                    <b>Prestadores que trabalham por nossa conta.</b> Usamos serviços de
                    alojamento e base de dados (Supabase e Vercel), de medição agregada
                    (Vercel) e de envio de e-mail (Resend). Actuam segundo as nossas
                    instruções, com obrigações de confidencialidade e de segurança, e só
                    tratam os dados para as finalidades descritas nesta política.
                  </p>
                  <p className="legal-p">
                    <b>Autoridades.</b> Apenas quando a lei o exigir ou para defender
                    direitos em processo.
                  </p>
                  <p className="legal-p">
                    Alguns destes prestadores podem alojar dados fora de Angola. Quando isso
                    acontece, exigimos salvaguardas contratuais e limitamos as finalidades e
                    o tempo de conservação. Não há transferências para anunciantes.
                  </p>
                </Sec>

                <Sec id="cookies" n="6" title="Cookies e armazenamento local">
                  <p className="legal-p">
                    O site não usa cookies de publicidade nem de rastreio entre sites. A
                    medição de audiência é feita sem cookies e em forma agregada. No
                    armazenamento local do seu navegador guardamos apenas a preferência de
                    tema (claro ou escuro). A entrada no portal da farmácia usa cookies
                    próprios de sessão, necessários à autenticação — sem eles não é possível
                    manter quem está autenticado.
                  </p>
                  <p className="legal-p">
                    Se num futuro próximo passarmos a usar cookies que exijam consentimento,
                    actualizamos esta política e pedimos autorização antes de os instalar.
                  </p>
                </Sec>

                <Sec id="conservacao" n="7" title="Durante quanto tempo guardamos">
                  <p className="legal-p">
                    Guardamos os dados apenas enquanto forem necessários para a finalidade
                    que os justificou. Na prática:
                  </p>
                  <ul className="legal-list">
                    <li>
                      <b>Reservas</b> — até ao levantamento ou à expiração e, depois, pelo
                      período necessário para responder a reclamações e cumprir obrigações
                      legais;
                    </li>
                    <li>
                      <b>Mensagens de suporte</b> — enquanto o assunto estiver aberto e pelo
                      tempo necessário para o documentar;
                    </li>
                    <li>
                      <b>Registos técnicos</b> — pelo período curto definido pelo prestador
                      de alojamento;
                    </li>
                    <li>
                      <b>Dados que a lei obrigue a conservar</b> — pelo prazo legal
                      aplicável.
                    </li>
                  </ul>
                  <p className="legal-p">
                    Quando deixa de ser necessário, o dado é eliminado ou anonimizado de
                    forma a não permitir identificar ninguém.
                  </p>
                </Sec>

                <Sec id="seguranca" n="8" title="Como protegemos os dados">
                  <ul className="legal-list">
                    <li>ligação cifrada (HTTPS) em todo o site;</li>
                    <li>
                      acesso restrito por perfil: cada farmácia só vê os dados da sua própria
                      operação;
                    </li>
                    <li>
                      palavras-passe geridas pelo serviço de autenticação, nunca guardadas
                      em texto simples, e autenticação de dois factores disponível para a
                      equipa;
                    </li>
                    <li>
                      registo de auditoria das alterações feitas no portal, com autor e data;
                    </li>
                    <li>cópias de segurança e actualizações regulares.</li>
                  </ul>
                  <p className="legal-p">
                    Nenhum sistema é invulnerável. Se ocorrer um incidente que afecte dados
                    pessoais, avaliamos o risco e notificamos a Agência Angolana de Protecção
                    de Dados e as pessoas afectadas quando a lei o exigir.
                  </p>
                </Sec>

                <Sec id="direitos" n="9" title="Os seus direitos">
                  <p className="legal-p">
                    Nos termos da Lei n.º 22/11, pode pedir informação sobre o tratamento,
                    aceder aos seus dados, rectificá-los, actualizá-los, eliminá-los, opor-se
                    ao tratamento e retirar o consentimento que tenha dado. A retirada do
                    consentimento não afecta o que já foi tratado com base nele.
                  </p>
                  <p className="legal-p">
                    Para exercer estes direitos, escreva para
                    privacidade@conhecafarmacia.com com o assunto «Dados pessoais» e indique
                    o pedido. Podemos pedir prova de identidade para garantir que não
                    entregamos dados à pessoa errada, e respondemos no prazo legal aplicável.
                  </p>
                  <p className="legal-p">
                    Depois de uma reserva, parte dos dados fica também com a farmácia. Os
                    pedidos relativos a esses dados devem ser dirigidos à farmácia, sem
                    prejuízo de nos poder contactar para ajudar.
                  </p>
                </Sec>

                <Sec id="menores" n="10" title="Menores">
                  <p className="legal-p">
                    O serviço não é dirigido a crianças e não recolhemos conscientemente
                    dados de menores. Uma reserva deve ser feita por quem a pode levantar ou
                    por um adulto responsável. Se é responsável por um menor que forneceu
                    dados, contacte-nos e eliminamos a informação.
                  </p>
                </Sec>

                <Sec id="alteracoes-politica" n="11" title="Alterações a esta política">
                  <p className="legal-p">
                    Podemos actualizar esta política para reflectir mudanças no serviço ou na
                    lei. A versão em vigor está sempre nesta página, com a data de entrada em
                    vigor. Alterações materiais são anunciadas no site antes de produzirem
                    efeitos.
                  </p>
                </Sec>
              </section>

              <section className="legal-part" id="parte-ii">
                <p className="cf-kicker">Parte II</p>
                <h2 className="legal-part-title">Para farmácias e empresas</h2>
                <p className="legal-part-intro">
                  Aplica-se às farmácias parceiras, às pessoas com acesso ao portal de gestão
                  e a quem nos contacta para aderir à rede.
                </p>

                <Sec id="dados-farmacias" n="12" title="Que dados tratamos das farmácias">
                  <p className="legal-p">
                    <b>Conta e pessoas.</b> Nome, função, e-mail, telefone, perfil de acesso e
                    registo dos acessos ao portal.
                  </p>
                  <p className="legal-p">
                    <b>Farmácia.</b> Nome, morada, coordenadas, município, horário,
                    telefone, WhatsApp, e-mail e logótipo — os dados que aparecem
                    publicamente no Localizador.
                  </p>
                  <p className="legal-p">
                    <b>Operação.</b> Stock confirmado, lotes e validades, movimentos,
                    reservas recebidas, avisos e relatórios.
                  </p>
                  <p className="legal-p">
                    <b>Equipa do balcão.</b> Perfis individuais com nome, função e PIN de
                    acesso, para que cada movimento fique atribuído a quem o fez.
                  </p>
                  <p className="legal-p">
                    <b>Integração.</b> Chaves de API, destinos de webhook e registo das
                    importações.
                  </p>
                  <p className="legal-p">
                    <b>Auditoria.</b> Quem alterou o quê, quando e com que motivo.
                  </p>
                  <p className="legal-p">
                    <b>Facturação e suporte.</b> Se houver um plano pago, os dados necessários
                    à facturação; e as mensagens trocadas com a equipa.
                  </p>
                  <p className="legal-p">
                    <b>Contactos de adesão.</b> Se nos contactar pelo formulário de farmácias,
                    guardamos o nome, a função, o e-mail, o telefone, o município, a mensagem
                    e a informação técnica do envio.
                  </p>
                </Sec>

                <Sec id="fins-farmacias" n="13" title="Para que fins os usamos">
                  <ul className="legal-list">
                    <li>criar e gerir a conta, os acessos e os perfis da equipa;</li>
                    <li>publicar o stock confirmado e o perfil público da farmácia;</li>
                    <li>entregar e acompanhar as reservas dos clientes;</li>
                    <li>
                      manter a segurança, prevenir fraude e detectar uso indevido do portal
                      ou da API;
                    </li>
                    <li>prestar suporte e responder a pedidos;</li>
                    <li>facturar planos activos e cumprir obrigações legais e fiscais.</li>
                  </ul>
                  <p className="legal-p">
                    O fundamento é, conforme o caso, a execução do contrato de adesão, o
                    cumprimento de obrigações legais, o interesse legítimo na segurança do
                    serviço, ou o consentimento de quem nos contacta.
                  </p>
                </Sec>

                <Sec id="acessos" n="14" title="Acessos e responsabilidades">
                  <p className="legal-p">
                    A farmácia é responsável pelo tratamento dos dados dos clientes que
                    recebe através das reservas, incluindo o uso que a sua equipa faz deles.
                    Deve limitar os acessos a quem precisa, formar a equipa e não usar os
                    contactos para publicidade sem consentimento.
                  </p>
                  <p className="legal-p">
                    A Conheça Farmácia trata esses dados para os disponibilizar à farmácia
                    escolhida, garantir a segurança do serviço e cumprir obrigações legais. O
                    acesso da nossa equipa é limitado e registado na auditoria: só acontece
                    para suporte, segurança ou obrigação legal.
                  </p>
                  <p className="legal-p">
                    A farmácia deve informar os seus colaboradores sobre o tratamento dos
                    dados associados aos perfis de balcão, nos termos da lei aplicável.
                  </p>
                </Sec>

                <Sec id="fim-conta" n="15" title="Depois do fim da conta">
                  <p className="legal-p">
                    Quando a participação termina, o stock e o perfil público deixam de
                    aparecer imediatamente. Os dados operacionais e de auditoria são
                    conservados apenas pelo período necessário a obrigações legais e fiscais,
                    a litígios em curso ou à segurança do serviço — e depois eliminados ou
                    anonimizados.
                  </p>
                  <p className="legal-p">
                    Antes do encerramento, a farmácia pode pedir a exportação dos dados a que
                    tem direito (stock, movimentos e reservas), usando as ferramentas do
                    portal ou falando com a equipa.
                  </p>
                </Sec>
              </section>

              <section className="legal-part legal-end" id="disposicoes-finais">
                <p className="cf-kicker">Disposições finais</p>
                <h2 className="legal-part-title">Contacto e reclamações</h2>

                <Sec id="contacto-privacidade" n="16" title="Falar connosco e reclamar">
                  <p className="legal-p">
                    <Fill>[NOME DA EMPRESA]</Fill> · NIF <Fill>[NIF]</Fill> ·{' '}
                    <Fill>[SEDE]</Fill>, Luanda, Angola.
                    <br />
                    Privacidade: privacidade@conhecafarmacia.com · Geral:
                    geral@conhecafarmacia.com · Telefone e WhatsApp: +244 925 696 002.
                  </p>
                  <p className="legal-p">
                    Se considerar que os seus dados não foram tratados de acordo com a lei,
                    pode apresentar reclamação à Agência Angolana de Protecção de Dados (APD),
                    em apd.ao. Agradecemos que nos contacte primeiro: resolve-se quase sempre
                    mais depressa.
                  </p>
                  <p className="legal-p">
                    Esta política complementa os{' '}
                    <Link href="/termos">Termos de Utilização</Link>, que explicam as regras
                    do serviço. Os dois documentos devem ser lidos em conjunto.
                  </p>
                </Sec>

                <div className="legal-help">
                  <div>
                    <p className="legal-help-title">Quer saber o que sabemos sobre si?</p>
                    <p>
                      Escreva-nos com o assunto «Dados pessoais» e respondemos com a
                      informação que estiver associada ao seu contacto.
                    </p>
                  </div>
                  <div className="legal-help-acts">
                    <a
                      href="mailto:privacidade@conhecafarmacia.com?subject=Dados%20pessoais"
                      className="cf-btn cf-btn--primary cf-btn--sm"
                    >
                      Escrever sobre privacidade
                    </a>
                    <Link href="/termos" className="cf-btn cf-btn--ghost cf-btn--sm">
                      Termos de Utilização
                    </Link>
                  </div>
                </div>
              </section>
            </article>
          </div>
        </div>
      </main>
      <AppFooter />
    </>
  )
}
