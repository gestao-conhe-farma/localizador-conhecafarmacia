import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import Link from 'next/link'

// Página pública "por baixo dos panos": noindex como /pesquisa, /farmacia e
// /sobre até ao lançamento. O documento cita a lei angolana em vigor, por
// isso não é conteúdo para indexar antes de a entidade estar preenchida.
export const metadata = {
  title: 'Termos de Utilização',
  description:
    'As regras de utilização do Localizador de Medicamentos: o que o serviço faz, o que não faz, como funcionam as reservas e o que se aplica às farmácias parceiras.',
  robots: {
    index: false,
    follow: false,
  },
}

/**
 * Secção numerada do documento.
 * O número é texto e não um contador CSS: o mesmo valor aparece no índice,
 * e uma secção inserida a meio obriga a renumerar os dois sítios — que é o
 * que se quer, para não haver índice a apontar para números errados.
 */
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

export default function TermosPage() {
  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap legal-page">
          <header className="legal-hero">
            <p className="cf-kicker">Documentos legais</p>
            <h1 className="legal-title">Termos de Utilização</h1>
            <p className="legal-lede">
              O que é o Localizador de Medicamentos, o que pode esperar dele e o que se aplica a
              quem o usa para procurar um medicamento e a quem gere uma farmácia parceira.
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
            <nav className="legal-toc" aria-label="Índice dos Termos de Utilização">
              <p className="legal-toc-title">Neste documento</p>

              <p className="legal-toc-group">Parte I · Quem procura medicamentos</p>
              <ul>
                <li>
                  <a href="#quem-somos">1. Quem somos e o que é o Localizador</a>
                </li>
                <li>
                  <a href="#informacao">2. O que significa a informação que vê</a>
                </li>
                <li>
                  <a href="#uso">3. Como usar o serviço</a>
                </li>
                <li>
                  <a href="#reservas">4. Reservas de medicamentos</a>
                </li>
                <li>
                  <a href="#responsabilidade">5. Responsabilidade</a>
                </li>
                <li>
                  <a href="#terceiros">6. Ligações e serviços de terceiros</a>
                </li>
                <li>
                  <a href="#propriedade">7. Propriedade intelectual</a>
                </li>
                <li>
                  <a href="#reclamacoes">8. Reclamações e litígios</a>
                </li>
                <li>
                  <a href="#conta">9. Conta de utente e itens guardados</a>
                </li>
              </ul>

              <p className="legal-toc-group">Parte II · Farmácias e empresas</p>
              <ul>
                <li>
                  <a href="#adesao">10. Adesão à rede e conta da farmácia</a>
                </li>
                <li>
                  <a href="#compromissos">11. O que a farmácia se compromete a cumprir</a>
                </li>
                <li>
                  <a href="#atendimento">12. Reservas, preços e atendimento</a>
                </li>
                <li>
                  <a href="#dados-farmacias">13. Dados dos clientes</a>
                </li>
                <li>
                  <a href="#planos">14. Planos, alterações e suspensão</a>
                </li>
                <li>
                  <a href="#responsabilidade-farmacia">15. Responsabilidade da farmácia</a>
                </li>
              </ul>

              <p className="legal-toc-group">Disposições finais</p>
              <ul>
                <li>
                  <a href="#alteracoes">16. Alterações a estes termos</a>
                </li>
                <li>
                  <a href="#lei">17. Lei aplicável e foro</a>
                </li>
                <li>
                  <a href="#contactos">18. Contactos</a>
                </li>
              </ul>
            </nav>

            <article className="legal-body">
              <section className="legal-part" id="parte-i">
                <p className="cf-kicker">Parte I</p>
                <h2 className="legal-part-title">Para quem procura medicamentos</h2>
                <p className="legal-part-intro">
                  Aplica-se a todas as pessoas que usam o site para pesquisar stock, ver farmácias
                  ou fazer uma reserva. Não é necessário criar conta.
                </p>

                <Sec id="quem-somos" n="1" title="Quem somos e o que é o Localizador">
                  <p className="legal-p">
                    O Localizador de Medicamentos é um serviço da Conheça Farmácia, marca gerida por{' '}
                    <Fill>[NOME DA EMPRESA]</Fill>, com NIF <Fill>[NIF]</Fill> e sede em{' '}
                    <Fill>[SEDE]</Fill>, em Luanda, Angola. Está disponível em
                    localizador.conhecafarmacia.com e pode ser contactado por
                    geral@conhecafarmacia.com ou +244 925 696 002.
                  </p>
                  <p className="legal-p">
                    O serviço mostra quais as farmácias parceiras que confirmaram ter um determinado
                    medicamento ou produto de parafarmácia em stock, com a data e a hora dessa
                    confirmação, e dá-lhe o contacto directo de cada uma.
                  </p>
                  <div className="legal-box">
                    <b>Não somos uma farmácia.</b>
                    Não vendemos, não dispensamos e não entregamos medicamentos, nem substituímos o
                    aconselhamento de um médico ou de um farmacêutico. O Localizador informa e
                    encaminha; quem vende e dispensa é a farmácia.
                  </div>
                </Sec>

                <Sec id="informacao" n="2" title="O que significa a informação que vê">
                  <p className="legal-p">
                    Cada farmácia parceira actualiza o seu stock no portal de gestão. Cada
                    actualização fica com data e hora, e a informação deixa de ser apresentada ao
                    público 72 horas depois — o que expira, desaparece.
                  </p>
                  <ul className="legal-list">
                    <li>
                      <b>&laquo;Confirmado há…&raquo;</b> é a idade da confirmação. Diz-lhe quando a
                      farmácia confirmou o stock, não que o produto esteja reservado para si.
                    </li>
                    <li>
                      <b>O preço</b> é o preço de balcão indicado pela farmácia. Pode mudar sem
                      aviso e o valor a pagar é sempre o que a farmácia praticar no momento da
                      dispensa.
                    </li>
                    <li>
                      <b>Morada, horário e contactos</b> são fornecidos pela própria farmácia.
                      Confirme o horário antes de se deslocar.
                    </li>
                    <li>
                      <b>A quantidade</b> é indicativa. Uma farmácia pode ter menos unidades do que
                      as que aparecem, sobretudo em produtos com muita procura.
                    </li>
                  </ul>
                  <p className="legal-p">
                    Fazemos o possível por manter a informação correcta, mas ela depende de quem a
                    introduz. Pode estar incompleta, desactualizada ou conter erros. Antes de sair
                    de casa, confirme por telefone ou WhatsApp com a farmácia.
                  </p>
                </Sec>

                <Sec id="uso" n="3" title="Como usar o serviço">
                  <p className="legal-p">
                    O acesso é gratuito e não exige registo. Pode pesquisar por nome ou molécula,
                    filtrar por município, abrir a ficha do produto e contactar a farmácia. Ao usar
                    o serviço, compromete-se a fazê-lo de forma lícita e a não prejudicar o
                    funcionamento do site nem os direitos de terceiros.
                  </p>
                  <p className="legal-p">Em particular, não pode:</p>
                  <ul className="legal-list">
                    <li>
                      recolher informação de forma automatizada (scripts, robôs, raspagem) nem
                      revender ou redistribuir os dados do Localizador;
                    </li>
                    <li>
                      tentar contornar limites técnicos, aceder a áreas reservadas ou perturbar o
                      serviço;
                    </li>
                    <li>
                      introduzir dados falsos em reservas ou formulários, ou fazer reservas que não
                      pretende levantar;
                    </li>
                    <li>
                      usar o site para publicidade, recrutamento ou qualquer fim comercial sem
                      autorização escrita nossa.
                    </li>
                  </ul>
                  <p className="legal-p">
                    Podemos limitar ou bloquear o acesso em caso de uso abusivo e recusar reservas
                    manifestamente falsas.
                  </p>
                </Sec>

                <Sec id="reservas" n="4" title="Reservas de medicamentos">
                  <p className="legal-p">
                    Alguns produtos podem ser reservados numa farmácia. Reservar não é comprar: é
                    pedir à farmácia que separe o produto até lá passar. O pedido segue estes
                    passos:
                  </p>
                  <ul className="legal-list">
                    <li>escolhe o produto, a farmácia, a quantidade e a hora de levantamento;</li>
                    <li>indica o seu nome e um número de telefone;</li>
                    <li>
                      a farmácia recebe o pedido no portal e confirma, recusa ou marca como pronta;
                    </li>
                    <li>o levantamento e o pagamento acontecem no balcão da farmácia.</li>
                  </ul>
                  <p className="legal-p">
                    <b>Sem pagamento online.</b> O Localizador não recebe pagamentos nem guarda
                    dados de cartão. O pagamento é feito directamente à farmácia, no balcão.
                  </p>
                  <p className="legal-p">
                    <b>Preço indicativo.</b> O valor mostrado é uma estimativa calculada a partir do
                    preço que a farmácia indicou. A reserva não fixa o preço: o valor final é
                    apurado pela farmácia no momento da dispensa.
                  </p>
                  <p className="legal-p">
                    <b>Quantidade.</b> A farmácia pode confirmar uma quantidade diferente da que
                    pediu, por exemplo quando só tem parte do stock disponível. Deve ser informado
                    dessa diferença antes do levantamento.
                  </p>
                  <p className="legal-p">
                    <b>Receita médica.</b> Se o medicamento exigir receita, a farmácia só o pode
                    dispensar contra receita válida. A reserva não substitui a receita nem garante a
                    dispensa.
                  </p>
                  <p className="legal-p">
                    <b>Prazo.</b> A reserva fica pendente até a farmácia responder. Sem resposta,
                    expira ao fim de 72 horas. Se não for levantada no período combinado, a farmácia
                    pode libertar o stock para outros clientes.
                  </p>
                  <p className="legal-p">
                    <b>Cancelamento e recusa.</b> Pode cancelar pelo link de acompanhamento da
                    reserva ou falando directamente com a farmácia. A farmácia pode recusar o
                    pedido, com um motivo — por exemplo falta de stock ou impossibilidade de atender
                    a zona de levantamento.
                  </p>
                  <p className="legal-p">
                    <b>Contacto.</b> O número de telefone que indicar é usado para gerir a reserva e
                    o levantamento. Não é usado para publicidade.
                  </p>
                  <div className="legal-box">
                    <b>A compra é com a farmácia.</b>O contrato de compra e venda é celebrado entre
                    si e a farmácia. O Localizador não é parte nesse contrato e não interfere no
                    preço nem nas condições de venda.
                  </div>
                </Sec>

                <Sec id="responsabilidade" n="5" title="Responsabilidade">
                  <p className="legal-p">
                    O serviço é prestado tal como está. Dentro do que a lei permite:
                  </p>
                  <ul className="legal-list">
                    <li>
                      não garantimos que a informação esteja sempre correcta, completa ou
                      actualizada, nem que o serviço esteja disponível sem interrupções;
                    </li>
                    <li>
                      não prestamos aconselhamento médico, diagnóstico ou terapêutico. Em caso de
                      dúvida sobre um medicamento, ou numa emergência, fale com um profissional de
                      saúde ou contacte os serviços de emergência;
                    </li>
                    <li>
                      não respondemos por actos ou omissões das farmácias — preço, qualidade,
                      dispensa, recusa ou atraso — nem pela informação que elas introduzem;
                    </li>
                    <li>
                      não respondemos por danos que resultem do uso de serviços de terceiros, como
                      WhatsApp, chamadas telefónicas ou mapas.
                    </li>
                  </ul>
                  <p className="legal-p">
                    Nada nestes termos exclui ou limita os direitos que a lei angolana confere ao
                    consumidor, em especial a Lei n.º 15/03, de 22 de Julho (Defesa do Consumidor),
                    nem a responsabilidade que a lei não permita excluir.
                  </p>
                </Sec>

                <Sec id="terceiros" n="6" title="Ligações e serviços de terceiros">
                  <p className="legal-p">
                    O site tem ligações para o WhatsApp, para o telefone e para mapas das farmácias.
                    Não controlamos esses serviços e não respondemos pelo seu conteúdo,
                    disponibilidade ou forma de tratamento de dados. A utilização de cada um rege-se
                    pelas regras do respectivo prestador.
                  </p>
                </Sec>

                <Sec id="propriedade" n="7" title="Propriedade intelectual">
                  <p className="legal-p">
                    A marca Conheça Farmácia, o nome Localizador de Medicamentos, o logótipo, o
                    desenho do site, os textos e a base de dados pertencem a{' '}
                    <Fill>[NOME DA EMPRESA]</Fill> ou são usados com autorização. Não podem ser
                    copiados, reproduzidos ou usados comercialmente sem autorização escrita.
                  </p>
                  <p className="legal-p">
                    Pode partilhar ligações para o site e citar excertos com indicação da fonte. A
                    informação das farmácias — nome, morada, contactos e stock — pertence às
                    farmácias que a fornecem e é publicada com a sua autorização.
                  </p>
                </Sec>

                <Sec id="reclamacoes" n="8" title="Reclamações e litígios">
                  <p className="legal-p">
                    Se algo correu mal, fale primeiro connosco: geral@conhecafarmacia.com ou +244
                    925 696 002. Diga o que aconteceu e, se aplicável, o número da reserva.
                  </p>
                  <p className="legal-p">
                    Reclamações sobre o produto, o preço, a qualidade ou o atendimento devem ser
                    dirigidas à farmácia, que é quem vende. Se não ficarem resolvidas, pode recorrer
                    ao Instituto Nacional de Defesa do Consumidor (INADEC) e aos tribunais
                    competentes.
                  </p>
                </Sec>

                <Sec id="conta" n="9" title="Conta de utente e itens guardados">
                  <p className="legal-p">
                    A conta é opcional e não é necessária para pesquisar, comparar preços ou
                    reservar. Quem a cria usa a mesma conta no site e no Localizador, e entra em
                    conta.conhecafarmacia.com — este site não tem formulários de entrada próprios.
                  </p>
                  <ul className="legal-list">
                    <li>
                      a conta é pessoal: a palavra-passe é sua responsabilidade e não deve ser
                      partilhada;
                    </li>
                    <li>
                      uma conta por pessoa e por endereço de e-mail. Não é permitido criar contas
                      para terceiros ou em nome de outra pessoa;
                    </li>
                    <li>
                      se suspeitar de acesso indevido, altere a palavra-passe em
                      conta.conhecafarmacia.com/perfil/seguranca e avise-nos.
                    </li>
                  </ul>
                  <p className="legal-p">
                    <b>Guardar não é reservar.</b> Guardar um medicamento ou uma farmácia cria uma
                    marca na sua lista: não separa stock, não cria compromisso com a farmácia e não
                    fixa preços nem quantidades. O stock continua a expirar 72 horas depois da
                    confirmação e o preço é sempre o que a farmácia praticar ao balcão.
                  </p>
                  <p className="legal-p">
                    <b>Reservas.</b> Uma reserva feita com sessão iniciada aparece na lista das suas
                    reservas, com o estado e o link de acompanhamento. Sem conta, a reserva funciona
                    na mesma e vive apenas nesse link — guarde-o.
                  </p>
                  <p className="legal-p">
                    <b>Encerrar a conta.</b> Pode apagá-la em
                    conta.conhecafarmacia.com/perfil/seguranca. Os itens guardados desaparecem com a
                    conta; as reservas que já fez mantêm-se como registo operacional da farmácia,
                    sem o vínculo à conta.
                  </p>
                </Sec>
              </section>

              <section className="legal-part" id="parte-ii">
                <p className="cf-kicker">Parte II</p>
                <h2 className="legal-part-title">Para farmácias e empresas</h2>
                <p className="legal-part-intro">
                  Aplica-se às farmácias que aderem ao Localizador e às pessoas que gerem a conta da
                  farmácia no portal. A adesão pressupõe a aceitação destes termos e da Política de
                  Privacidade.
                </p>

                <Sec id="adesao" n="10" title="Adesão à rede e conta da farmácia">
                  <p className="legal-p">
                    O acesso ao portal é criado pela equipa da Conheça Farmácia, por convite, para a
                    farmácia e para as pessoas que ela indicar. A conta é pessoal: as credenciais
                    não devem ser partilhadas e cada pessoa responde pelo uso que faz do seu acesso.
                  </p>
                  <ul className="legal-list">
                    <li>
                      a farmácia responde pela exactidão dos dados que introduz e mantém-nos
                      actualizados;
                    </li>
                    <li>
                      deve comunicar-nos de imediato qualquer acesso não autorizado ou suspeita de
                      comprometimento de credenciais;
                    </li>
                    <li>
                      recomendamos a autenticação de dois factores nas contas de gestão e a
                      atribuição de perfis individuais à equipa do balcão.
                    </li>
                  </ul>
                  <p className="legal-p">
                    Ao aderir, a farmácia declara que exerce a actividade com licença válida e
                    farmacêutico responsável, que anuncia apenas medicamentos registados em Angola e
                    produtos cuja venda lhe é permitida, e que cumpre o Decreto Presidencial n.º
                    191/10, de 1 de Setembro, e a restante legislação farmacêutica aplicável.
                  </p>
                </Sec>

                <Sec id="compromissos" n="11" title="O que a farmácia se compromete a cumprir">
                  <p className="legal-p">
                    O Localizador só vale o que valer o stock que lá está. Por isso, a farmácia
                    compromete-se a:
                  </p>
                  <ul className="legal-list">
                    <li>
                      confirmar apenas o stock que tem fisicamente disponível e actualizá-lo quando
                      se altera, dentro da janela de 72 horas;
                    </li>
                    <li>
                      indicar os preços que pratica ao balcão, sem valores que não esteja disposta a
                      praticar;
                    </li>
                    <li>
                      manter correctos a morada, o horário, o telefone e o WhatsApp da farmácia;
                    </li>
                    <li>
                      responder às reservas em tempo útil, confirmando, recusando com motivo ou
                      marcando como prontas;
                    </li>
                    <li>
                      dispensar apenas contra receita válida quando ela é exigida, e cumprir as
                      regras de dispensa e de publicidade — Lei n.º 9/17, de 13 de Março (Lei Geral
                      da Publicidade), e legislação farmacêutica;
                    </li>
                    <li>
                      não publicar promessas terapêuticas, comparações antes/depois ou publicidade a
                      medicamentos sujeitos a receita médica.
                    </li>
                  </ul>
                  <div className="legal-box">
                    <b>O que não é aceitável.</b>
                    Declarar stock que não existe para atrair clientes, usar preços de isco, marcar
                    reservas como prontas sem ter o produto, ou usar dados de clientes para
                    marketing sem consentimento. Situações reiteradas levam à suspensão da conta.
                  </div>
                </Sec>

                <Sec id="atendimento" n="12" title="Reservas, preços e atendimento">
                  <p className="legal-p">
                    A farmácia é a única responsável por confirmar a reserva, preparar o produto,
                    cobrar, facturar e entregar, bem como por verificar a receita quando aplicável.
                    O Localizador não interfere no preço nem nas condições de venda praticadas ao
                    balcão.
                  </p>
                  <p className="legal-p">
                    As questões de preço, qualidade, troca ou devolução devem ser resolvidas
                    directamente entre a farmácia e o cliente, sem prejuízo do que a Lei n.º 15/03,
                    de 22 de Julho, determina.
                  </p>
                  <p className="legal-p">
                    Reservas sistematicamente não atendidas, stock fictício e recusas sem motivo
                    prejudicam a confiança na rede e podem levar à suspensão prevista na secção 14.
                  </p>
                </Sec>

                <Sec id="dados-farmacias" n="13" title="Dados dos clientes">
                  <p className="legal-p">
                    Para cada reserva, a farmácia recebe o nome, o telefone, o produto, a
                    quantidade, a hora de levantamento e a nota do cliente. Só pode usar esses dados
                    para gerir a reserva e o levantamento, e para cumprir obrigações legais.
                  </p>
                  <ul className="legal-list">
                    <li>não os usar para publicidade sem consentimento do cliente;</li>
                    <li>limitar o acesso aos funcionários que precisam deles para atender;</li>
                    <li>não os copiar para sistemas próprios sem base legal para o fazer;</li>
                    <li>comunicar-nos sem demora qualquer incidente que afecte esses dados.</li>
                  </ul>
                  <p className="legal-p">
                    Os detalhes estão na <Link href="/privacidade">Política de Privacidade</Link>,
                    que faz parte destes termos.
                  </p>
                </Sec>

                <Sec id="planos" n="14" title="Planos, alterações e suspensão">
                  <p className="legal-p">
                    A presença no Localizador é gratuita. Algumas funcionalidades de gestão podem
                    ser pagas; nesse caso, o preço, o que inclui e o período de facturação são
                    apresentados antes de qualquer cobrança e só se aplicam depois de aceites pela
                    farmácia.
                  </p>
                  <p className="legal-p">
                    Podemos alterar, acrescentar ou descontinuar funcionalidades. Alterações que
                    afectem o valor pago ou o modo como o stock é publicado são comunicadas com
                    antecedência razoável.
                  </p>
                  <p className="legal-p">
                    Podemos suspender ou encerrar o acesso em caso de incumprimento destes termos,
                    stock fictício reiterado, risco para os clientes, uso indevido do portal ou da
                    API, ou falta de pagamento de um plano activo. Quando o problema for corrigível,
                    a suspensão é levantada depois da correcção.
                  </p>
                  <p className="legal-p">
                    A farmácia pode cessar a participação quando quiser, por escrito. O stock deixa
                    de ser publicado e os dados seguem o que a Política de Privacidade prevê para o
                    fim da conta.
                  </p>
                </Sec>

                <Sec id="responsabilidade-farmacia" n="15" title="Responsabilidade da farmácia">
                  <p className="legal-p">
                    A farmácia responde perante os clientes e perante terceiros pela informação que
                    publica e pelo atendimento que presta. Na relação com a Conheça Farmácia,
                    responde pelos danos directos que resultem do incumprimento destes termos, na
                    medida permitida pela lei.
                  </p>
                  <p className="legal-p">
                    Sem prejuízo dessa responsabilidade, a farmácia mantém a Conheça Farmácia
                    indemnizada por reclamações de terceiros causadas por informação que tenha
                    introduzido em violação destes termos — por exemplo stock fictício, preço errado
                    ou dispensa indevida.
                  </p>
                </Sec>
              </section>

              <section className="legal-part legal-end" id="disposicoes-finais">
                <p className="cf-kicker">Disposições finais</p>
                <h2 className="legal-part-title">Aplicam-se aos dois lados</h2>

                <Sec id="alteracoes" n="16" title="Alterações a estes termos">
                  <p className="legal-p">
                    Podemos actualizar estes termos. A nova versão é publicada nesta página, com a
                    data de entrada em vigor, e as alterações materiais são anunciadas no site.
                    Continuar a usar o serviço depois da publicação vale como aceitação. Se não
                    concordar, deve deixar de usar o serviço — e, no caso das farmácias, pode cessar
                    a participação nos termos da secção 14.
                  </p>
                </Sec>

                <Sec id="lei" n="17" title="Lei aplicável e foro">
                  <p className="legal-p">
                    Estes termos regem-se pela lei angolana, em especial pela Lei n.º 23/11, de 20
                    de Junho (Comunicações Electrónicas e Serviços da Sociedade da Informação), pela
                    Lei n.º 15/03, de 22 de Julho (Defesa do Consumidor), e pela Lei n.º 22/11, de
                    17 de Junho (Protecção de Dados Pessoais). Para litígios de consumo aplicam-se
                    as regras legais de competência, podendo o consumidor recorrer ao INADEC. Nos
                    restantes casos, são competentes os tribunais de Luanda.
                  </p>
                </Sec>

                <Sec id="contactos" n="18" title="Contactos">
                  <p className="legal-p">
                    <Fill>[NOME DA EMPRESA]</Fill> · NIF <Fill>[NIF]</Fill> · <Fill>[SEDE]</Fill>,
                    Luanda, Angola.
                    <br />
                    E-mail: geral@conhecafarmacia.com · Telefone e WhatsApp: +244 925 696 002.
                  </p>
                  <p className="legal-p">
                    Estes termos e a Política de Privacidade formam o acordo completo entre si e a
                    Conheça Farmácia quanto ao uso do Localizador. Se alguma cláusula for
                    considerada inválida, as restantes mantêm-se em vigor.
                  </p>
                </Sec>

                <div className="legal-help">
                  <div>
                    <p className="legal-help-title">Ficou com dúvidas?</p>
                    <p>
                      Respondemos a questões sobre estes termos e sobre reservas pelo e-mail ou
                      WhatsApp da equipa.
                    </p>
                  </div>
                  <div className="legal-help-acts">
                    <a
                      href="https://wa.me/244925696002?text=Olá,%20tenho%20uma%20dúvida%20sobre%20os%20Termos%20de%20Utilização"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cf-btn cf-btn--primary cf-btn--sm"
                    >
                      Falar por WhatsApp
                    </a>
                    <Link href="/privacidade" className="cf-btn cf-btn--ghost cf-btn--sm">
                      Política de Privacidade
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
