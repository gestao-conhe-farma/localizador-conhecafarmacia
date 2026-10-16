'use client'

import { useMemo, useState } from 'react'

/**
 * Ajuda do portal — o guia do atendente renderizado na própria app,
 * para consultar sem sair do fluxo de trabalho. Estrutura em JSX
 * (sem parser de Markdown — o projecto não usa um): acordeão por tema
 * e uma pesquisa simples que filtra secções pelo texto.
 *
 * Conteúdo espelha localizador/guia-atendente-portal.md — ao actualizar
 * o guia, actualizar aqui também.
 */

import { ChevronIcon, NavIcon } from '@/components/ui/Icon'

const TOPICS = [
  {
    id: 'entrar',
    icon: 'entrar',
    title: 'Entrar no Portal',
    body: (
      <>
        <ol className="help-ol">
          <li>
            Abre o navegador e vai ao <b>Portal da farmácia</b> (endereço que a equipa te passou).
          </li>
          <li>
            Escreve o <b>email</b> e a <b>palavra-passe</b> da farmácia.
          </li>
          <li>
            Vês a <b>Visão geral</b>: os cartões mostram o que pede atenção hoje.
          </li>
        </ol>
        <p className="help-tip">
          O menu tem dois grupos — <b>Gestão</b> (o dia-a-dia: Atenção, Stock, Reservas, Vendas) e{' '}
          <b>Farmácia</b> (o perfil que o cliente vê). Os itens têm um número por ordem e os{' '}
          <b>badges</b> coloridos mostram o que está à espera de ti. A <b>Entrada de stock</b> vive
          dentro de <b>Stock</b>: toca na <b>seta</b> ao lado de Stock para abrir o submenu.
        </p>
        <p className="help-tip">
          <b>Telemóvel ou tablet:</b> o menu vive no botão <b>☰</b> (canto superior esquerdo) —
          toca para abrir o menu completo; toca em ✕ (ou fora do menu) para fechar.
        </p>
      </>
    ),
  },
  {
    id: 'pesquisa',
    icon: 'detalhes',
    title: 'Pesquisa — tudo em segundos',
    body: (
      <>
        <p>
          A barra de pesquisa no <b>topo do portal</b> procura ao mesmo tempo <b>páginas</b>,{' '}
          <b>medicamentos</b> (nome, molécula ou forma) e <b>reservas</b> (nome ou telefone do
          cliente). Escolher um resultado leva-te à página certa — o stock abre já filtrado pelo
          medicamento.
        </p>
        <p className="help-tip">
          Atalho: toca em <b>/</b> em qualquer página para abrir a pesquisa, e <b>Esc</b> para
          fechar. <b>Enter</b> abre o primeiro resultado — cliente ao balcão à espera, dois toques.
        </p>
      </>
    ),
  },
  {
    id: 'calendario',
    icon: 'inicio',
    title: 'Calendário do mês (Visão geral)',
    body: (
      <>
        <p>
          No fundo da <b>Visão geral</b>, o calendário marca cada dia com pontos: <b>venda</b>,{' '}
          <b>entrada</b>, <b>validade a vencer</b>, <b>saída</b> e <b>ajuste</b>. Toca num dia para
          ver o que se passou — dali podes <b>abrir a fila filtrada a esse dia</b>.
        </p>
        <p className="help-tip">
          Serve para o «o que se passou no dia 12?»: chega-te ao detalhe sem procurar página a
          página. As setas do teclado andam entre dias.
        </p>
      </>
    ),
  },
  {
    id: 'perfil',
    icon: 'perfil',
    title: 'Quem está ao balcão (trocar perfil)',
    body: (
      <>
        <p>
          No <b>fundo do menu</b> está o <b>perfil activo</b> — tudo o que registar (vendas,
          reservas, entradas) fica em nome dele. Em telemóveis e tablets, abre o menu com o botão{' '}
          <b>☰</b> e o perfil está logo a seguir à navegação, junto ao botão do tema.
        </p>
        <ol className="help-ol">
          <li>
            Toca no <b>bloco com o nome do perfil</b> (fundo do menu) — abre o menu directo.
          </li>
          <li>
            <b>Trocar perfil</b> — abre os cartões da equipa: escolhe o teu cartão e escreve o{' '}
            <b>PIN de 4 dígitos</b>. Só os perfis activos aparecem.
          </li>
          <li>
            <b>Sessão e PIN</b> — o cartão de identidade do perfil em uso: início de sessão,
            validade e a troca do PIN (actual + novo).
          </li>
          <li>
            <b>Sair do perfil</b> — o dispositivo volta ao ecrã de escolha. A sessão da farmácia
            mantém-se.
          </li>
        </ol>
        <p className="help-tip">
          PIN errado é apenas registado em log (para o gerente ver tentativas suspeitas) —{' '}
          <b>não há bloqueio de conta</b>.
        </p>
      </>
    ),
  },
  {
    id: 'reservas',
    icon: 'reservas',
    title: 'Atender reservas',
    badge: 'O mais urgente do dia',
    body: (
      <>
        <div className="help-rule">
          <b>Regra de ouro:</b> responde em menos de <b>72 horas</b> — passado esse prazo, a reserva
          expira sozinha e o cliente é avisado.
        </div>
        <h4 className="help-h4">Confirmar uma reserva (temos o medicamento)</h4>
        <ol className="help-ol">
          <li>Abre Reservas no menu.</li>
          <li>
            No cartão vês: medicamento, cliente, telefone, quantidade e o <b>valor estimado</b> (≈
            Kz).
          </li>
          <li>
            Toca em <b>Confirmar</b>. Se não tens a quantidade toda, escreve{' '}
            <b>quantas podes atender</b> — o cliente vê logo a quantidade confirmada e o novo valor.
          </li>
          <li>
            Toca em <b>WhatsApp</b> — a mensagem já vai escrita, com o valor e o link de
            acompanhamento. Confirma o envio no WhatsApp da farmácia.
          </li>
          <li>
            Quando o cliente levantar o produto, toca em <b>Concluída</b>. Só assim o stock baixa e
            a venda entra no relatório.
          </li>
        </ol>
        <h4 className="help-h4">Recusar uma reserva</h4>
        <ol className="help-ol">
          <li>
            No cartão, toca em <b>Recusar</b>.
          </li>
          <li>
            Escolhe o motivo: <b>Sem stock</b>, <b>Fora da zona</b>, ou <b>Outro motivo</b> — neste
            último abre uma caixa de texto: <b>escreve a explicação, o cliente lê-a!</b> (ex.: «Só
            atendemos levantamento no próprio dia.»)
          </li>
          <li>A mensagem de recusa também já vai pronta para o WhatsApp.</li>
        </ol>
        <p className="help-tip">
          Tocar no <b>nome do medicamento</b> ou em <b>Detalhes</b> abre a ficha completa:
          histórico, prazo, nota do cliente e o link de acompanhamento para copiar.
        </p>
      </>
    ),
  },
  {
    id: 'reposicao',
    icon: 'repor',
    title: 'Repor stock (produto esgotou)',
    body: (
      <>
        <p>
          Quando uma reserva concluída leva as últimas unidades, o produto sai do Localizador e
          aparece em Atenção com o aviso «Vendeu · repor».
        </p>
        <ol className="help-ol">
          <li>
            Vai a <b>Atenção</b> (ou abre <b>Stock</b> → <b>Entrada de stock</b>).
          </li>
          <li>
            No aviso do produto, toca em <b>Repor na entrada →</b> — a página abre logo no
            medicamento certo.
          </li>
          <li>
            Escreve <b>quantas</b> chegaram, escolhe a <b>unidade</b> ao lado (caixas, lâminas…) e
            toca em <b>Somar</b>.
          </li>
          <li>Pronto: o produto volta ao Localizador na hora e o aviso desaparece.</li>
        </ol>
        <p className="help-tip">
          Só queres religar o produto sem indicar quantidade (sobraram unidades na gaveta)? Usa{' '}
          <b>Repor sem qtd.</b> mesmo no aviso.
        </p>
      </>
    ),
  },
  {
    id: 'entradas',
    icon: 'stock',
    title: 'Registar entradas de stock (chegou fornecedor)',
    body: (
      <>
        <ol className="help-ol">
          <li>
            Abre <b>Stock</b> no menu e toca na <b>seta</b> para abrir a <b>Entrada de stock</b>.
          </li>
          <li>
            A lista vem já com os produtos <b>esgotados primeiro</b> (chip «Para repor»). Usa a
            pesquisa ou o chip «Todos» para qualquer medicamento.
          </li>
          <li>
            Na linha do medicamento vês o <b>saldo actual</b> («12 em stock»).
          </li>
          <li>
            Escreve quantas chegaram em <b>Chegaram</b> e escolhe a <b>unidade</b> ao lado — caixas,
            lâminas, frascos… (a tecla Enter também funciona).
          </li>
          <li>
            Com a quantidade escrita abre-se o <b>detalhe</b>: <b>lâminas por caixa</b>,{' '}
            <b>comprimidos por lâmina</b> (o total de comprimidos aparece calculado) e os{' '}
            <b>preços por forma de venda</b>. Toca em <b>Somar</b>.
          </li>
          <li>O saldo actualiza na hora e o produto volta a aparecer no Localizador.</li>
        </ol>
        <p className="help-tip">
          Atalho rápido: no próprio <b>Stock</b>, o botão <b>«+ Nova entrada»</b> abre um{' '}
          <b>painel lateral</b> — pesquisa, quantidade, unidade, <b>Somar</b> — sem sair da página.
          A página completa (com preços e estrutura da caixa) continua em Stock → seta →{' '}
          <b>Entrada de stock</b>.
        </p>
        <p className="help-tip">
          No fundo da página fica a lista das <b>entradas desta sessão</b> — confere com a nota do
          fornecedor antes de fechar.
        </p>
      </>
    ),
  },
  {
    id: 'detalhes',
    icon: 'detalhes',
    title: 'Corrigir detalhes: preço, validade, origem, foto',
    body: (
      <>
        <p>
          Vai a <b>Stock</b> e toca no <b>nome</b> do medicamento. Abre o modal de edição:
        </p>
        <ul className="help-ul">
          <li>
            <b>Caixas / unidades</b> — quantidade em prateleira (substitui o valor).
          </li>
          <li>
            <b>Validade</b> — passada, o produto deixa de aparecer no Localizador até corrigir.
          </li>
          <li>
            <b>Disponível a partir de</b> — se a mercadoria só chega dia X, marca aqui: o cliente vê
            «chega dia X».
          </li>
          <li>
            <b>Preço</b> — usado quando não há formas de venda.
          </li>
          <li>
            <b>Origem e Marca</b> — o cliente valoriza: Portugal (PT), Índia (IN)… e a marca (ex.:
            Ben-u-ron). Preenche sempre que souberes — aparecem na reserva e no WhatsApp, e ajudam a
            vender!
          </li>
          <li>
            <b>Foto da embalagem</b> — fotografa a caixa real (até 2 MB). O preview aparece no
            modal; o botão vermelho remove.
          </li>
          <li>
            <b>Formas de venda</b> — se vendes lâmina e caixa, registra as duas formas com o preço
            de cada. Ex.: lâmina 100 Kz · caixa com 10 lâminas 950 Kz.
          </li>
          <li>
            <b>Retirar do catálogo</b> — para o que a farmácia <b>deixou de vender</b>: botão
            vermelho no fundo do modal, confirma, e o medicamento sai do Localizador e das listas —
            fica na <b>Lixeira</b> (chip no Stock), de onde pode ser restaurado. «Não disponível» é
            «não tenho agora»; retirado é «não vendo mais».
          </li>
        </ul>
        <p>
          Toca em <b>Guardar</b> — tudo fica visível no Localizador imediatamente.
        </p>
      </>
    ),
  },
  {
    id: 'avisos',
    icon: 'avisos',
    title: 'Outros avisos (Atenção)',
    body: (
      <>
        <ul className="help-ul">
          <li>
            <b>Validade a vencer (90/60/30 dias)</b> — se chegou lote novo, corrige a validade ou
            usa «Corrigir na entrada»; se não há reposição, marca «Já não disponível».
          </li>
          <li>
            <b>Stock desactualizado (mais de 5 dias)</b> — confirma que ainda está na prateleira e
            toca em <b>Reconfirmar agora</b>. Um clique.
          </li>
        </ul>
        <p className="help-tip">
          Os badges do menu mostram as duas urgências separadas: <b>vermelho</b> = reposições e
          assuntos do dia · <b>laranja</b> = validades a vencer ou expiradas.
        </p>
      </>
    ),
  },
  {
    id: 'novo-medicamento',
    icon: 'stock',
    title: 'Medicamento novo + validação do gerente',
    badge: 'Só o gerente valida',
    body: (
      <>
        <p>
          Se um medicamento que a farmácia vende <b>não existe no catálogo</b>, cria-o: em{' '}
          <b>Stock</b>, botão <b>+ Adicionar medicamento</b>. Escreve o nome como aparece na caixa,
          a molécula (DCI), a forma, a dosagem e se exige <b>receita médica</b>.
        </p>
        <div className="help-rule">
          <b>Fluxo de validação:</b> o medicamento criado entra com a marca{' '}
          <b>«Aguarda validação»</b> — só a tua farmácia o vê. O <b>gerente</b> abre o filtro{' '}
          <b>Aguarda validação</b> no Stock e, no menu <b>⋯</b> da linha, escolhe{' '}
          <b>Validar e publicar</b> (fica visível aos clientes) ou <b>Recusar fármaco</b> (só é
          possível enquanto não tiver stock nem reservas). Só o gerente pode validar.
        </div>
        <p className="help-tip">
          Enquanto está pendente, já podes marcar o stock dele — quando o gerente publica, o produto
          aparece logo no Localizador com o stock registado.
        </p>
      </>
    ),
  },
  {
    id: 'movimentos',
    icon: 'movimentos',
    title: 'Movimentos — porquê este saldo?',
    body: (
      <>
        <p>
          A página <b>Movimentos</b> é o livro-razão do stock: cada entrada, venda, ajuste e
          validade fica registado. Quando um saldo não bate, abre Movimentos e vê <b>o que mexeu</b>
          no produto — data, quantidade e motivo.
        </p>
        <p className="help-tip">
          Usa a pesquisa para ir direto a um medicamento e confere as entradas da sessão antes de
          corrigir números à mão.
        </p>
      </>
    ),
  },
  {
    id: 'perfil-farmacia',
    icon: 'inicio',
    title: 'Perfil da farmácia (o que o cliente vê)',
    body: (
      <>
        <p>
          O <b>nome da farmácia</b> no canto superior direito abre o <b>Perfil</b>: é aqui que se
          edita a ficha que os clientes vêem no Localizador — nome público, <b>morada</b>,{' '}
          <b>telefone</b>, <b>email</b>, <b>WhatsApp</b> e o link do <b>mapa</b>.
        </p>
        <ul className="help-ul">
          <li>
            <b>Horário de atendimento</b> — escreve as horas («Seg–Sáb · 07:30–19:00» ou «Todos os
            dias · 24 horas»). É deste texto que saem o selo <b>Aberto agora</b> e o filtro «só
            abertas agora» da busca.
          </li>
          <li>
            <b>Guardar</b> (no topo da página) — as alterações aparecem logo no Localizador.
          </li>
        </ul>
        <p className="help-tip">
          A ficha é tudo o que o cliente vê antes de decidir: sem telefone nem horário, a farmácia
          perde o contacto para a que está ao lado.
        </p>
      </>
    ),
  },
  {
    id: 'equipa',
    icon: 'equipa',
    title: 'Equipa e PINs (para o gerente)',
    body: (
      <>
        <p>
          A página <b>Equipa</b> (só o gerente vê) gere quem trabalha na farmácia: cada colega tem
          um <b>perfil</b> (Gerente ou Balcão) e um <b>PIN de 4 dígitos</b> para entrar no turno.
        </p>
        <ul className="help-ul">
          <li>
            <b>Adicionar colega</b> — nome, papel e PIN inicial. O colega pode mudar o PIN na página{' '}
            <b>Sessão</b>.
          </li>
          <li>
            <b>Desactivar perfil</b> — quem sai da farmácia: o perfil deixa de aparecer na escolha e
            o histórico dos registos mantém-se.
          </li>
          <li>
            <b>Papéis:</b> gerente valida medicamentos e gere a equipa; balcão atende, repõe e
            registar. O resto é igual para todos.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'sessao',
    icon: 'perfil',
    title: 'Sessão: PIN, trocar de perfil e fechar a conta',
    body: (
      <>
        <p>
          A página <b>Sessão</b> é do <b>farmacêutico que está ao balcão neste dispositivo</b>: o
          perfil activo, o PIN e a conta. O mesmo nome do perfil aparece no fundo do menu.
        </p>
        <ul className="help-ul">
          <li>
            <b>Trocar perfil</b> — escolhe o teu cartão e escreve o PIN; a partir daí as vendas,
            reservas e entradas ficam em teu nome.
          </li>
          <li>
            <b>Alterar PIN</b> — abre um painel e pede o PIN actual antes de gravar o novo.
          </li>
          <li>
            <b>Terminar sessão da conta</b> — fecha também o perfil activo. Para mudar de pessoa sem
            fechar a conta, usa <b>Trocar perfil</b>.
          </li>
        </ul>
        <p className="help-tip">
          Os dados da <b>farmácia</b> (nome, contacto, horário) não estão aqui: vivem no Perfil,
          pelo nome da farmácia na barra de cima.
        </p>
      </>
    ),
  },
  {
    id: 'vendas',
    icon: 'vendas',
    title: 'Vendas (para o gestor)',
    body: (
      <>
        <p>
          A página <b>Vendas</b> mostra o total estimado por dia das reservas concluídas, com
          janelas de 7 / 30 / 90 dias. É estimado com o preço das formas de venda — o final é o
          apurado no balcão.
        </p>
      </>
    ),
  },
  {
    id: 'desempenho',
    icon: 'desempenho',
    title: 'Desempenho — quem vende o quê',
    body: (
      <>
        <p>
          A página <b>Desempenho</b> conta as <b>reservas concluídas</b> (o cliente levantou) e as{' '}
          <b>entradas de stock</b> de cada perfil, nas janelas de <b>7 / 30 / 90 dias</b> — com a
          tendência face ao período anterior.
        </p>
        <ul className="help-ul">
          <li>
            <b>Gerente:</b> ranking, partilha das vendas e tabela avançada (unidades, ticket médio,
            recusas), mais a comparação de dois perfis lado a lado.
          </li>
          <li>
            <b>Balcão:</b> a mesma página, só com as tuas vendas — sem colegas à vista.
          </li>
        </ul>
        <p className="help-tip">
          O que foi registado antes de haver perfis conta como <b>Não atribuído</b> — não é erro.
        </p>
      </>
    ),
  },
  {
    id: 'integracao',
    icon: 'integracao',
    title: 'Integração — ligar o sistema da farmácia',
    badge: 'Instalação',
    body: (
      <>
        <p>
          Para o <b>sistema de gestão da farmácia</b> enviar o stock sozinho — sem ninguém a
          escrevê-lo —, abre <b>Integração</b>:
        </p>
        <ul className="help-ul">
          <li>
            <b>Chaves da farmácia</b> — a chave <code>cfk_…</code> que o sistema usa para entrar.
            Aparece <b>uma vez só</b>: copia-a nesse momento. Criar e revogar chaves é do{' '}
            <b>gerente</b>.
          </li>
          <li>
            <b>Importar stock (CSV)</b> — exporta do teu sistema e importa aqui: escolher o ficheiro
            → dizer o que é cada coluna → pré-visualização → aplicar. É a via sem programação.
          </li>
          <li>
            <b>Webhooks</b> — regista um endereço do teu sistema para receber os avisos de
            alterações de stock (<code>stock.updated</code>) e confirma nas <b>últimas entregas</b>{' '}
            que estão a chegar.
          </li>
        </ul>
        <p className="help-tip">
          As <b>últimas chamadas de terceiros</b> mostram o que entrou e o que falhou: é o primeiro
          sítio a olhar quando o stock não sincroniza.
        </p>
      </>
    ),
  },
]

/** Resumo de 30 segundos — a tabela do guia. */
const CHEATSHEET = [
  ['Cliente reservou', 'Reservas', 'Confirmar (com quantidade) → WhatsApp → Concluída'],
  [
    'Procuro um medicamento ou reserva',
    'Pesquisa (barra de cima ou tecla /)',
    'Escrever nome, molécula ou telefone → Enter',
  ],
  ['Não temos o produto', 'Reservas', 'Recusar + motivo (com texto, o cliente lê)'],
  ['Produto esgotou', 'Atenção', '«Repor na entrada» quando chegar mercadoria'],
  ['Chegou fornecedor', 'Stock → «+ Nova entrada»', 'Painel lateral: qtd + unidade → Somar'],
  [
    'Entrada completa (preços)',
    'Stock → seta → Entrada de stock',
    'Escrever qtd + unidade → Somar',
  ],
  [
    'Mudou de turno / outro colega',
    'Fundo do menu (nome do perfil)',
    'Trocar perfil → cartão → PIN',
  ],
  [
    'Medicamento não está no catálogo',
    'Stock → «+ Adicionar medicamento»',
    'Criar → o gerente valida e publica',
  ],
  ['Saldo não bate', 'Movimentos', 'Ver o que mexeu no produto'],
  ['Novo colega / PIN perdido', 'Equipa (gerente)', 'Criar perfil ou repor PIN'],
  ['Mudou preço/validade/marca', 'Stock → nome do medicamento', 'Preencher no modal → Guardar'],
  [
    'Deixou de vender um produto',
    'Stock → modal → Retirar',
    'Confirma — fica na Lixeira (restaurável)',
  ],
  ['Não sei que perfil está activo', 'Sessão (ou fundo do menu)', 'Trocar perfil → cartão → PIN'],
  [
    'Mudou morada, telefone ou horário',
    'Perfil (nome da farmácia, em cima)',
    'Editar → Guardar (visível no Localizador)',
  ],
  ['Quero ver quem vendeu mais', 'Desempenho', 'Escolher 7 / 30 / 90 dias → ranking e tabela'],
  ['Ligar o sistema da farmácia', 'Integração', 'Criar chave de API ou importar stock (CSV)'],
]

export default function HelpPanel() {
  const [openId, setOpenId] = useState('reservas')
  const [query, setQuery] = useState('')

  // Pesquisa simples: título + texto corrido do tópico (body como string).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPICS
    return TOPICS.filter((t) => {
      const haystack = [t.title, t.badge || '', extractText(t.body)].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [query])

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id))

  // «Rever tour»: limpa o flag do onboarding e reabre o tour (o PortalTour
  // ouve este evento, limpa o storage e recomeça do passo 0).
  const [tourMsg, setTourMsg] = useState('')
  const replayTour = () => {
    window.dispatchEvent(new CustomEvent('portal-tour:restart'))
    setTourMsg('Tour reaberto — segue os passos destacados no ecrã.')
    setTimeout(() => setTourMsg(''), 4000)
  }

  return (
    <section className="portal-section">
      {/* Padrão único do portal: cabeçalho compacto. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Ajuda</h1>
          <p className="portal-page-sub">
            O guia rápido do portal: repor stock, atender reservas e registar entradas — sem sair
            daqui.
          </p>
        </div>
      </div>

      {/* Caixa com cabeçalho (sec-head do mock): título + pesquisa
          pill à direita — o acordeão vive dentro da caixa. */}
      <div className="portal-box">
        <div className="portal-sec-head">
          <h2>Guias</h2>
          <div className="portal-sec-tools">
            <label className="portal-sec-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                placeholder="Pesquisar na ajuda (ex.: validade, recusar…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Pesquisar na ajuda"
              />
            </label>
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="portal-rows-empty">
            <b>Nada encontrado</b>
            Nada para «{query}» — tenta outra palavra, ou fala connosco: suporte@conhecafarmacia.com
          </div>
        )}

        <div className="help-list">
          {filtered.map((t) => {
            const open = openId === t.id
            return (
              <div key={t.id} className={`help-item${open ? ' help-item--open' : ''}`}>
                <button
                  type="button"
                  className="help-item-head"
                  aria-expanded={open}
                  onClick={() => toggle(t.id)}
                >
                  <span className="help-item-icon" aria-hidden="true">
                    <NavIcon name={t.icon} size={16} />
                  </span>
                  <span className="help-item-title">{t.title}</span>
                  {t.badge && <span className="help-item-badge">{t.badge}</span>}
                  <span className="help-item-chevron" aria-hidden="true">
                    <ChevronIcon dir={open ? 'down' : 'right'} />
                  </span>
                </button>
                {open && <div className="help-item-body">{t.body}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Resumo de 30 segundos — sempre visível no fundo. */}
      <div className="help-cheatsheet">
        <h2 className="portal-h2">Resumo de 30 segundos</h2>
        <div className="help-table-scroll">
          <table className="help-table">
            <thead>
              <tr>
                <th>O que aconteceu</th>
                <th>Onde vais</th>
                <th>O que fazes</th>
              </tr>
            </thead>
            <tbody>
              {CHEATSHEET.map(([what, where, whatDo]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td>{where}</td>
                  <td>{whatDo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="help-rule help-rule--ok">
          <b>Duas regras que valem ouro:</b> 1. Responde às reservas em menos de 72 horas. · 2.
          Registra toda a mercadoria que chega.
        </div>
      </div>

      {/* Rever o tour de boas-vindas — para quem fechou à pressa ou
          quer voltar a ver os 5 passos com os destaques no ecrã. */}
      <div className="help-replay">
        <div>
          <b>Rever o tour de boas-vindas</b>
          <p>
            Os 5 passos essenciais, com destaques sobre as páginas reais: reservas, perfil do
            balcão, atenção e entrada de stock (submenu + «Nova entrada»).
          </p>
          {tourMsg && <p className="help-replay-msg">{tourMsg}</p>}
        </div>
        <button type="button" className="btn btn-primary" onClick={replayTour}>
          Rever tour
        </button>
      </div>

      <p className="help-foot">
        Dúvidas que o guia não responde? <b>suporte@conhecafarmacia.com</b> — ajudamos na hora.
      </p>
    </section>
  )
}

/** Extrai texto plano de um elemento React — para a pesquisa filtrar. */
function extractText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (typeof node === 'object' && node.props) {
    return `${extractText(node.props.children)}`
  }
  return ''
}
