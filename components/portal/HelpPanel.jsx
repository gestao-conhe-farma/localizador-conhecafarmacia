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

import { ChevronIcon, CloseIcon } from '@/components/ui/Icon'

/** Ícones SVG dos tópicos — substituem os antigos emojis. */
function TopicIcon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    width: 16,
    height: 16,
    'aria-hidden': true,
  }
  const paths = {
    entrar: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9" />
        <path d="m16 7 3 3" />
      </>
    ),
    reservas: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    repor: (
      <>
        <path d="M12 21V9" />
        <path d="m7 14 5-5 5 5" />
        <path d="M5 3h14" />
      </>
    ),
    entradas: (
      <>
        <path d="M4 8h16v12H4z" />
        <path d="M9 8V5h6v3M4 13h16" />
      </>
    ),
    detalhes: (
      <>
        <path d="M12 2 3 7l9 5 9-5-9-5z" />
        <path d="M3 12l9 5 9-5" />
        <path d="M3 17l9 5 9-5" />
      </>
    ),
    avisos: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      </>
    ),
    vendas: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </>
    ),
  }
  return <svg {...common}>{paths[name] || paths.detalhes}</svg>
}

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
          O menu à esquerda tem dois grupos — <b>Gestão</b> (o dia-a-dia: Atenção, Stock, Reservas,
          Vendas) e <b>Farmácia</b> (o perfil que o cliente vê). Os itens têm um número por ordem e
          os <b>badges</b> coloridos mostram o que está à espera de ti. A <b>Entrada de stock</b>{' '}
          vive dentro de <b>Stock</b>: toca na <b>seta</b> ao lado de Stock para abrir o submenu.
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
            Escreve <b>quantas unidades chegaram</b> e toca em <b>Somar</b>.
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
    icon: 'entradas',
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
            Escreve quantas unidades chegaram em <b>Chegaram</b> e toca em <b>Somar</b> (a tecla
            Enter também funciona).
          </li>
          <li>O saldo actualiza na hora e o produto volta a aparecer no Localizador.</li>
        </ol>
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
            <b>Como vende este medicamento?</b> — se vendes lâmina e caixa, registra as duas formas
            com o preço de cada. Ex.: lâmina 100 Kz · caixa com 3 lâminas 300 Kz.
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
]

/** Resumo de 30 segundos — a tabela do guia. */
const CHEATSHEET = [
  ['Cliente reservou', 'Reservas', 'Confirmar (com quantidade) → WhatsApp → Concluída'],
  ['Não temos o produto', 'Reservas', 'Recusar + motivo (com texto, o cliente lê)'],
  ['Produto esgotou', 'Atenção', '«Repor na entrada» quando chegar mercadoria'],
  ['Chegou fornecedor', 'Stock → Entrada de stock', 'Escrever unidades → Somar'],
  ['Mudou preço/validade/marca', 'Stock → nome do medicamento', 'Preencher no modal → Guardar'],
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

      <div className="portal-toolbar portal-toolbar--left">
        <div className="stock-search-wrap">
          <span className="stock-search-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="search"
            className="portal-input portal-search"
            placeholder="Pesquisar na ajuda (ex.: validade, recusar, origem...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar na ajuda"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-sub">
            Nada encontrado para «{query}». Tenta outra palavra — ou fala connosco:
            suporte@conhecafarmacia.com
          </p>
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
                  <TopicIcon name={t.icon} />
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

      {/* Resumo de 30 segundos — sempre visível no fundo. */}
      <div className="help-cheatsheet">
        <h2 className="portal-h2">Resumo de 30 segundos</h2>
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
        <div className="help-rule help-rule--ok">
          <b>Duas regras que valem ouro:</b> 1. Responde às reservas em menos de 72 horas. · 2.
          Registra toda a mercadoria que chega.
        </div>
      </div>

      {/* Rever o tour de boas-vindas — para quem fechou à pressa ou
          quer voltar a ver os 3 passos com os destaques no ecrã. */}
      <div className="help-replay">
        <div>
          <b>Rever o tour de boas-vindas</b>
          <p>
            Os 3 passos essenciais, com destaques sobre as páginas reais: reservas, atenção e
            entrada de stock.
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
