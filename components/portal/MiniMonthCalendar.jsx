'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { fmtKz } from '@/lib/reservation-format'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/** S T Q Q S S D — Segunda a Domingo (a mesma linha do calendário de /reservas). */
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

/**
 * Categorias de acontecimento do dia — uma cor cada, a mesma legenda para
 * a grelha e para o painel. `chave` é o campo que o servidor manda com a
 * contagem do dia.
 */
const CATEGORIAS = [
  {
    id: 'venda',
    chave: 'reservations',
    singular: 'venda',
    plural: 'vendas',
    cor: 'var(--portal-ok)',
  },
  {
    id: 'entrada',
    chave: 'entradas',
    singular: 'entrada',
    plural: 'entradas',
    cor: 'var(--portal-teal)',
  },
  {
    id: 'validade',
    chave: 'expiries',
    singular: 'validade a vencer',
    plural: 'validades a vencer',
    cor: 'var(--portal-warn)',
  },
  { id: 'saida', chave: 'saidas', singular: 'saída', plural: 'saídas', cor: 'var(--portal-red)' },
  { id: 'ajuste', chave: 'ajustes', singular: 'ajuste', plural: 'ajustes', cor: 'var(--ink-45v)' },
]

/** Rótulo de cada tipo de movimento do livro-razão (na lista do painel). */
const TIPO_MOVIMENTO = {
  entrada: 'entrada',
  importacao: 'importação',
  saida: 'saída',
  expiracao: 'baixa por validade',
  devolucao: 'devolução',
  ajuste: 'ajuste',
  retirada: 'retirada',
  restauro: 'restauro',
}

/** Forma vazia de um dia — o servidor só manda dias com algum evento. */
function normalizar(v) {
  const e = v || {}
  return {
    reservations: Number(e.reservations) || 0,
    entradas: Number(e.entradas) || 0,
    expiries: Number(e.expiries) || 0,
    saidas: Number(e.saidas) || 0,
    ajustes: Number(e.ajustes) || 0,
    items: Array.isArray(e.items) ? e.items : [],
    movimentos: Array.isArray(e.movimentos) ? e.movimentos : [],
    value: Number(e.value) || 0,
    semPreco: Number(e.semPreco) || 0,
  }
}

/** Quantas vezes aconteceu cada categoria no dia. */
function contagem(e, cat) {
  return e[cat.chave] || 0
}

/** «12 de outubro de 2026» — data longa para o rótulo da célula. */
function dataLonga(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${y}`
}

/** «quinta-feira, 15 de Outubro» — título do painel do dia (como /reservas). */
function tituloDia(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const semana = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-PT', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  return `${semana}, ${d} de ${MESES[m - 1]}`
}

/** { y, m } de um dia 'YYYY-MM-DD' — mês com que o calendário abre. */
function mesDe(iso) {
  if (!iso) return null
  const [y, m] = iso.split('-').map(Number)
  return { y, m: m - 1 }
}

/** «2 vendas · 3 entradas · 1 ajuste» — resumo do dia no subtítulo do painel. */
function resumoDia(e) {
  return CATEGORIAS.filter((c) => contagem(e, c) > 0)
    .map((c) => {
      const n = contagem(e, c)
      return `${n} ${n === 1 ? c.singular : c.plural}`
    })
    .join(' · ')
}

/**
 * Calendário «Hoje na farmácia» do dashboard — um calendário geral das
 * acções do dia no portal (vendas, entradas, saídas, ajustes e validades).
 * Usa a mesma composição e as mesmas classes do «Calendário de reservas»
 * (/reservas), que é a referência visual do portal: cabeçalho com mês e
 * ‹ ›, legenda, grelha com um ponto por categoria e, à direita, o painel
 * do dia escolhido.
 *
 * Chega com o dia de HOJE já escolhido (`today`, calculado no servidor): o
 * painel do dia vem preenchido na primeira pintura. Sem `today` o calendário
 * resolve-o depois de montar.
 *
 * `events` = mapa { 'YYYY-MM-DD': { reservations, entradas, expiries, saidas,
 * ajustes, items: [{name, qty}], movimentos: [{tipo, name, delta}], value,
 * semPreco } }.
 *
 * Teclado (roving tabindex, um só dia no Tab): setas andam um dia (±1) e uma
 * semana (±7), Home/End vão às pontas da semana, PageUp/PageDown mudam de
 * mês. Enter/Espaço escolhem (o mesmo que clicar).
 */
export default function MiniMonthCalendar({ events = {}, hint = '', today: hojeProp = '' }) {
  // "Hoje": entra no render (por isso vem por prop ou por efeito) —
  // react-hooks/purity não deixa chamar Date.now() no render.
  const [today, setToday] = useState(hojeProp)
  // Mês em visualização: ano+mês em estado (o ‹ › navega).
  const [cursor, setCursor] = useState(() => mesDe(hojeProp))
  // Dia escolhido ('YYYY-MM-DD') — o painel do dia está sempre visível, como
  // em /reservas. Abre no dia de hoje.
  const [escolhido, setEscolhido] = useState(hojeProp || null)
  // Dia com o foco do teclado (roving tabindex).
  const [foco, setFoco] = useState(null)
  const gridRef = useRef(null)

  // Só quando não há `today` do servidor: resolver "hoje" depois de montar.
  useEffect(() => {
    if (hojeProp) return
    const iso = new Date().toISOString().slice(0, 10)
    setToday(iso)
    setCursor(mesDe(iso))
    setEscolhido((s) => s || iso)
  }, [hojeProp])

  // Andar com as setas pode mudar de mês (borda da semana/mês): o render
  // seguinte traz a célula do dia novo e o foco vai atrás dela.
  useEffect(() => {
    if (!foco || !gridRef.current) return
    const el = gridRef.current.querySelector(`[data-iso="${foco}"]`)
    if (el && document.activeElement !== el) el.focus()
  }, [foco, cursor])

  if (!cursor) {
    return (
      <div className="portal-rescal" role="status" aria-hidden="true">
        <div className="portal-rescal-left">
          <div className="portal-calwk">
            {DOW.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { y, m } = cursor
  const first = new Date(Date.UTC(y, m, 1))
  const startDow = (first.getUTCDay() + 6) % 7 // Segunda = 0
  const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const daysPrev = new Date(Date.UTC(y, m, 0)).getUTCDate()

  const cells = []
  for (let i = startDow - 1; i >= 0; i -= 1) {
    cells.push({ d: daysPrev - i, mut: true })
  }
  for (let d = 1; d <= daysIn; d += 1) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      d,
      isoRaw: iso,
      today: iso === today,
      evt: events[iso] ? normalizar(events[iso]) : null,
    })
  }
  let next = 1
  while (cells.length % 7 !== 0) {
    cells.push({ d: next, mut: true })
    next += 1
  }

  const shift = (delta) => {
    const d = new Date(Date.UTC(y, m + delta, 1))
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  const selEvt = escolhido ? normalizar(events[escolhido]) : null
  const temEvento = CATEGORIAS.some((c) => contagem(selEvt || {}, c) > 0)
  const selPassado = escolhido ? escolhido < today : false
  const baseDia = foco || escolhido || today
  // Um só dia no percurso do Tab: o focado; sem foco, o de hoje.
  const tabIso =
    foco || (cells.some((c) => c.isoRaw === today) ? today : cells.find((c) => !c.mut)?.isoRaw)

  /** Anda N dias a partir do dia em foco — o cursor acompanha o mês. */
  const mover = (delta) => {
    const d = new Date(`${baseDia}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + delta)
    const iso = d.toISOString().slice(0, 10)
    setFoco(iso)
    setEscolhido(iso)
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m) {
      setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
    }
  }

  /** Home/End — segunda/domingo da semana do dia em foco. */
  const semana = (fim) => {
    const dow = (new Date(`${baseDia}T00:00:00Z`).getUTCDay() + 6) % 7
    mover(fim ? 6 - dow : -dow)
  }

  /** PageUp/PageDown — mês anterior/seguinte, mantendo o dia (limitado). */
  const mes = (delta) => {
    const d = new Date(`${baseDia}T00:00:00Z`)
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + delta)
    const daysInNew = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(Number(baseDia.slice(8, 10)), daysInNew))
    const iso = d.toISOString().slice(0, 10)
    setFoco(iso)
    setEscolhido(iso)
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  const onKeyDown = (e) => {
    const k = e.key
    if (k === 'ArrowLeft') mover(-1)
    else if (k === 'ArrowRight') mover(1)
    else if (k === 'ArrowUp') mover(-7)
    else if (k === 'ArrowDown') mover(7)
    else if (k === 'Home') semana(false)
    else if (k === 'End') semana(true)
    else if (k === 'PageUp') mes(-1)
    else if (k === 'PageDown') mes(1)
    else return
    e.preventDefault()
  }

  const movimentosTotal = selEvt ? selEvt.entradas + selEvt.saidas + selEvt.ajustes : 0

  return (
    <>
      <div className="portal-rescal">
        <div className="portal-rescal-left">
          <div className="portal-calhead">
            <b>
              {MESES[m]} {y}
            </b>
            <div className="portal-calnav">
              <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior">
                ‹
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Mês seguinte">
                ›
              </button>
            </div>
            <div className="portal-cal-legend">
              {CATEGORIAS.map((c) => (
                <span key={c.id}>
                  <i style={{ background: c.cor }} /> {c.singular}
                </span>
              ))}
            </div>
          </div>

          <div className="portal-calwk">
            {DOW.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          {/* As setas são tratadas aqui (o evento sobe dos botões) — um só
              handler para a grelha inteira. */}
          <div className="portal-calgrid" ref={gridRef} onKeyDown={onKeyDown}>
            {cells.map((c, i) => {
              if (c.mut) {
                return (
                  <button key={i} type="button" className="portal-cald portal-cald--mut" disabled>
                    <span className="cdn">{c.d}</span>
                  </button>
                )
              }
              const doDia = c.evt || normalizar(null)
              const presentes = CATEGORIAS.filter((cat) => contagem(doDia, cat) > 0)
              const rotulo = [
                dataLonga(c.isoRaw),
                ...presentes.map((cat) => {
                  const n = contagem(doDia, cat)
                  return `${n} ${n === 1 ? cat.singular : cat.plural}`
                }),
              ].join(' · ')
              const classes = ['portal-cald']
              if (c.today) classes.push('portal-cald--today')
              if (escolhido === c.isoRaw) classes.push('portal-cald--sel')
              return (
                <button
                  key={i}
                  type="button"
                  data-iso={c.isoRaw}
                  tabIndex={c.isoRaw === tabIso ? 0 : -1}
                  className={classes.join(' ')}
                  aria-pressed={escolhido === c.isoRaw}
                  aria-label={rotulo}
                  onFocus={() => setFoco(c.isoRaw)}
                  onClick={() => setEscolhido(c.isoRaw)}
                >
                  <span className="cdn">{c.d}</span>
                  {presentes.length > 0 && (
                    <span className="portal-caldots" aria-hidden="true">
                      {presentes.map((cat) => (
                        <i key={cat.id} style={{ background: cat.cor }} />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Painel do dia escolhido — à direita, como em /reservas. */}
        <div className="portal-rescal-right">
          <div className="portal-calside-title">
            {escolhido ? `${tituloDia(escolhido)}${escolhido === today ? ' · hoje' : ''}` : ' '}
          </div>
          <div className="portal-calside-sub">
            {temEvento ? resumoDia(selEvt) : escolhido ? 'Sem acções neste dia' : ' '}
          </div>

          <div className="portal-cal-daylist" key={escolhido || 'sem-dia'} role="status">
            {escolhido && !temEvento && (
              <div className="portal-cal-empty">
                Sem acções neste dia.
                <br />
                {selPassado
                  ? 'As vendas, entradas e saídas deste dia já passaram.'
                  : 'As vendas, entradas e saídas aparecem aqui quando acontecerem.'}
              </div>
            )}

            {selEvt?.reservations > 0 && (
              <div className="portal-citem">
                <div className="portal-citem-top">
                  <b className="portal-citem-name">Vendas do dia</b>
                  {/* Sem preço registado não se inventa 0 Kz: um traço. */}
                  <span className="portal-citem-time">
                    {selEvt.value > 0 ? fmtKz(selEvt.value) : '—'}
                  </span>
                </div>
                <div className="portal-citem-meta">
                  <span className="sub">
                    {selEvt.reservations === 1 ? '1 reserva' : `${selEvt.reservations} reservas`}
                    {selEvt.semPreco > 0 ? ' · sem preço registado' : ''}
                  </span>
                </div>
                {selEvt.items.length > 0 && (
                  <div className="portal-citem-meta">
                    {selEvt.items.map((it, i) => (
                      <span key={`${it.name}-${i}`}>
                        {it.name}
                        {it.qty ? ` ×${it.qty}` : ''}
                      </span>
                    ))}
                    {selEvt.reservations > selEvt.items.length && (
                      <span className="sub">
                        +{selEvt.reservations - selEvt.items.length} reservas neste dia
                      </span>
                    )}
                  </div>
                )}
                <div className="portal-citem-foot">
                  <Link
                    className="btn-mini"
                    href={`/portal/reservas?dia=${escolhido}`}
                    title="Abrir a fila filtrada a este dia"
                  >
                    Reservas do dia →
                  </Link>
                </div>
              </div>
            )}

            {movimentosTotal > 0 && (
              <div className="portal-citem">
                <div className="portal-citem-top">
                  <b className="portal-citem-name">Movimentos de stock</b>
                  <span className="portal-citem-time">
                    {movimentosTotal === 1 ? '1 movimento' : `${movimentosTotal} movimentos`}
                  </span>
                </div>
                {selEvt.movimentos.map((mv, i) => (
                  <div key={`${mv.name}-${i}`} className="portal-citem-meta">
                    <span>{mv.name}</span>
                    <span className="sub">{TIPO_MOVIMENTO[mv.tipo] || mv.tipo}</span>
                    {mv.delta !== 0 && (
                      <span
                        className={`portal-st ${mv.delta > 0 ? 'portal-st--ok' : 'portal-st--mut'}`}
                      >
                        {mv.delta > 0 ? `+${mv.delta}` : `−${Math.abs(mv.delta)}`}
                      </span>
                    )}
                  </div>
                ))}
                {movimentosTotal > selEvt.movimentos.length && (
                  <div className="portal-citem-meta">
                    <span className="sub">
                      +{movimentosTotal - selEvt.movimentos.length} movimentos neste dia
                    </span>
                  </div>
                )}
              </div>
            )}

            {selEvt?.expiries > 0 && (
              <div className="portal-citem">
                <div className="portal-citem-top">
                  <b className="portal-citem-name">
                    {selEvt.expiries === 1 ? '1 validade' : `${selEvt.expiries} validades`}
                  </b>
                  <span className="portal-citem-time">
                    {selPassado ? 'chegou ao fim' : 'a vencer'}
                  </span>
                </div>
                <div className="portal-citem-foot">
                  <Link className="btn-mini" href="/portal/atencao?tipo=expiry">
                    Ver na fila →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hint && (
        <p className="portal-card-hint" style={{ marginTop: 8 }}>
          {hint}
        </p>
      )}
    </>
  )
}
