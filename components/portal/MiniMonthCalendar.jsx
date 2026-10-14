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

/** S T Q Q S S D — Segunda a Domingo (mesmo alfabeto do mock). */
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

/** Cor do ponto por tipo de evento (o mesmo trio da fila). */
const LEVEL_COLOR = {
  bad: 'var(--portal-red)',
  warn: '#d99a1e',
  ok: 'var(--portal-ok)',
}

/**
 * O servidor pode mandar só o nível do dia ('ok' | 'warn', como nas
 * primeiras versões) ou o detalhe completo ({ level, reservations,
 * expiries, items, value, semPreco }). Aceitar os dois evita quebrar se
 * um dia voltar à forma antiga.
 */
function normalizar(v) {
  if (!v) return null
  if (typeof v === 'string') {
    return { level: v, reservations: 0, expiries: 0, items: [], value: 0, semPreco: 0 }
  }
  return {
    level: v.level || 'ok',
    reservations: Number(v.reservations) || 0,
    expiries: Number(v.expiries) || 0,
    items: Array.isArray(v.items) ? v.items : [],
    value: Number(v.value) || 0,
    semPreco: Number(v.semPreco) || 0,
  }
}

/** «12 de outubro de 2026» — data longa do painel do dia escolhido. */
function dataLonga(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${y}`
}

/** { y, m } de um dia 'YYYY-MM-DD' — mês com que o calendário abre. */
function mesDe(iso) {
  if (!iso) return null
  const [y, m] = iso.split('-').map(Number)
  return { y, m: m - 1 }
}

/** «2 reservas · 1 validade» — resumo do dia mostrado na célula larga
 * (só no cartão de largura toda; no telemóvel a célula mostra só o
 * número e o ponto). */
function resumoDia(e) {
  const partes = []
  if (e.reservations) {
    partes.push(`${e.reservations} ${e.reservations === 1 ? 'reserva' : 'reservas'}`)
  }
  if (e.expiries) partes.push(`${e.expiries} ${e.expiries === 1 ? 'validade' : 'validades'}`)
  return partes.join(' · ')
}

/**
 * Mini-calendário «Hoje na farmácia» (mock modelo-a-v2): mês corrente
 * com ponto nos dias que têm eventos reais (reservas concluídas e
 * validades a vencer) e o dia de hoje preenchido.
 *
 * Chega com o dia de HOJE já escolhido (`today`): o painel do dia vem
 * preenchido na primeira pintura — sem esperar por um efeito e sem a
 * largura do cartão mudar à chegada (o `today` é calculado no servidor,
 * pelo mesmo relógio que gerou os eventos).
 *
 * Escolher um dia — com o rato ou com o TECLADO — abre o painel desse
 * dia AO LADO da grelha, à direita (a mesma composição do calendário de
 * /reservas; por baixo dela só em ecrã estreito): as vendas (valor e nº
 * de reservas, com a mesma conta do relatório), a lista do que saiu
 * (nome × quantidade) e os caminhos para o resolver (fila da atenção e
 * fila de reservas filtrada ao dia). Escape ou um segundo clique no dia
 * fecham o painel e a grelha volta à largura toda do cartão.
 *
 * Teclado: setas andam um dia (±1) e uma semana (±7),
 * Home/End vão às pontas da semana, PageUp/PageDown mudam de mês,
 * Enter/Espaço escolhem (o mesmo que clicar), Escape fecha. O foco é
 * único na grelha (roving tabindex) e atravessa meses nas bordas.
 *
 * `events` = mapa { 'YYYY-MM-DD': 'ok' | 'warn' | { level, reservations,
 * expiries, items: [{name, qty}], value, semPreco } }.
 * `today` = dia de hoje 'YYYY-MM-DD' calculado pelo servidor (opcional;
 * sem ele o calendário resolve-o depois de montar, e a primeira pintura
 * sai com a grelha à largura toda).
 */
export default function MiniMonthCalendar({ events = {}, hint = '', today: hojeProp = '' }) {
  // "Hoje": entra no render (por isso vem por prop ou por efeito) —
  // react-hooks/purity não deixa chamar Date.now() no render.
  const [today, setToday] = useState(hojeProp)
  // Mês em visualização: ano+mês em estado (o ‹ › navega).
  const [cursor, setCursor] = useState(() => mesDe(hojeProp))
  // Dia escolhido ('YYYY-MM-DD') — o painel do dia vive ao lado. Abre no
  // dia de hoje; fechá-lo (Escape, ou clicar no dia outra vez) volta a
  // deixar a grelha com a largura toda.
  const [escolhido, setEscolhido] = useState(hojeProp || null)
  // Dia com o foco do teclado (roving tabindex): 35 botões tabuláveis
  // eram uma armadilha; só um dia está no percurso do Tab.
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

  // Andar com as setas pode mudar de mês (borda da semana/mês): o
  // render seguinte traz a célula do dia novo e o foco vai atrás dela.
  useEffect(() => {
    if (!foco || !gridRef.current) return
    const el = gridRef.current.querySelector(`[data-iso="${foco}"]`)
    if (el && document.activeElement !== el) el.focus()
  }, [foco, cursor])

  if (!cursor) {
    return (
      <div className="portal-cal" role="status" aria-hidden="true">
        <div className="portal-cal-grid">
          {DOW.map((w, i) => (
            <span key={i} className="dow">
              {w}
            </span>
          ))}
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
    cells.push({ d, iso, today: iso === today, evt: normalizar(events[iso]), isoRaw: iso })
  }
  let next = 1
  while (cells.length % 7 !== 0) {
    cells.push({ d: next, mut: true })
    next += 1
  }

  const shift = (delta) => {
    const d = new Date(Date.UTC(y, m + delta, 1))
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
    setEscolhido(null)
  }

  const selEvt = escolhido ? normalizar(events[escolhido]) : null
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
    else if (k === 'Escape') setEscolhido(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="portal-cal">
      {/* Com um dia escolhido a grelha e o painel dividem a largura
          (.portal-cal-cols--split); sem escolha fica só a grelha. */}
      <div className={`portal-cal-cols${escolhido ? ' portal-cal-cols--split' : ''}`}>
        <div className="portal-cal-main">
          <div className="portal-cal-head">
            <b>
              {MESES[m]} {y}
            </b>
            <div className="portal-cal-nav" style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior">
                ‹
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Mês seguinte">
                ›
              </button>
            </div>
          </div>
          {/* As setas são tratadas aqui (o evento sobe dos botões) — um só
          handler para a grelha inteira. */}
          <div className="portal-cal-grid" ref={gridRef} onKeyDown={onKeyDown}>
            {DOW.map((w, i) => (
              <span key={i} className="dow">
                {w}
              </span>
            ))}
            {/* O dia de hoje tem fundo cheio: a tinta do evento (verde) ficava
            sobre verde — ilegível. Como o ponto já marca o evento, o
            «hoje» mantém a tinta do seu estado (branco/accent). */}
            {cells.map((c, i) => {
              if (c.mut) {
                return (
                  <span key={i} className="portal-cal-d portal-cal-d--mut" aria-hidden="true">
                    {c.d}
                  </span>
                )
              }
              const rotulo = [
                dataLonga(c.isoRaw),
                c.evt?.reservations ? `${c.evt.reservations} reserva(s) concluída(s)` : null,
                c.evt?.expiries ? `${c.evt.expiries} validade(s)` : null,
                c.evt ? null : 'sem eventos',
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <button
                  key={i}
                  type="button"
                  data-iso={c.isoRaw}
                  tabIndex={c.isoRaw === tabIso ? 0 : -1}
                  className={[
                    'portal-cal-d',
                    c.today ? 'portal-cal-d--today' : '',
                    c.evt ? 'portal-cal-d--evt' : '',
                    escolhido === c.isoRaw ? 'portal-cal-d--sel' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    c.evt && !c.today ? { color: LEVEL_COLOR[c.evt.level] || undefined } : undefined
                  }
                  aria-pressed={escolhido === c.isoRaw}
                  aria-label={rotulo}
                  onFocus={() => setFoco(c.isoRaw)}
                  onClick={() => setEscolhido((s) => (s === c.isoRaw ? null : c.isoRaw))}
                >
                  {c.d}
                  {c.evt && (c.evt.reservations > 0 || c.evt.expiries > 0) ? (
                    <span className="portal-cal-dlbl" aria-hidden="true">
                      {resumoDia(c.evt)}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* Painel do dia escolhido: vendas, lista do que saiu e caminhos
          — na coluna da direita. */}
        {escolhido && (
          <div className="portal-cal-day" role="status">
            <b>
              {dataLonga(escolhido)}
              {escolhido === today ? ' · hoje' : ''}
            </b>

            {selEvt?.reservations > 0 && (
              <p className="portal-cal-day-sales">
                <span>Vendas do dia</span>
                {/* Sem preço registado não se inventa 0 Kz: um traço. */}
                <b>{selEvt.value > 0 ? fmtKz(selEvt.value) : '—'}</b>
                <span>
                  {selEvt.reservations === 1 ? '1 reserva' : `${selEvt.reservations} reservas`}
                  {selEvt.semPreco > 0 ? ' · sem preço registado' : ''}
                </span>
              </p>
            )}

            {selEvt?.items?.length > 0 && (
              <ul className="portal-cal-day-items">
                {selEvt.items.map((it, i) => (
                  <li key={`${it.name}-${i}`}>
                    <span>{it.name}</span>
                    {it.qty ? <span className="qtd">×{it.qty}</span> : null}
                  </li>
                ))}
                {selEvt.reservations > selEvt.items.length && (
                  <li className="mais">
                    +{selEvt.reservations - selEvt.items.length} reservas neste dia
                  </li>
                )}
              </ul>
            )}

            <ul className="portal-cal-day-links">
              {selEvt?.reservations > 0 && (
                <li>
                  <span>Reservas do dia</span>
                  <Link
                    href={`/portal/reservas?dia=${escolhido}`}
                    title="Abrir a fila filtrada a este dia"
                  >
                    Abrir na fila →
                  </Link>
                </li>
              )}
              {selEvt?.expiries > 0 && (
                <li>
                  <span>
                    {selEvt.expiries === 1 ? '1 validade' : `${selEvt.expiries} validades`}
                    {selPassado ? ' chegou ao fim' : ' a vencer'}
                  </span>
                  <Link href="/portal/atencao?tipo=expiry">Ver na fila →</Link>
                </li>
              )}
            </ul>

            {!selEvt?.reservations && !selEvt?.expiries ? (
              <span>Sem eventos neste dia.</span>
            ) : null}
          </div>
        )}
      </div>

      {hint && (
        <p className="portal-card-hint" style={{ marginTop: 8 }}>
          {hint}
        </p>
      )}
    </div>
  )
}
