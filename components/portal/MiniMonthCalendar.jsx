'use client'

import { useEffect, useState } from 'react'

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
 * Mini-calendário «Hoje na farmácia» (mock modelo-a-v2): mês corrente
 * com ponto verde nos dias que têm eventos reais (reservas concluídas
 * e validades a vencer), dia de hoje preenchido. Eventos = mapa
 * { 'YYYY-MM-DD': 'ok' | 'warn' } vindo do servidor.
 */
export default function MiniMonthCalendar({ events = {}, hint = '' }) {
  // "Hoje" resolvido depois de montar (react-hooks/purity — sem
  // Date.now() directo no render).
  const [today, setToday] = useState('')
  // Mês em visualização: ano+mês em estado (o ‹ › navega).
  const [cursor, setCursor] = useState(null)

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10)
    setToday(iso)
    const d = new Date(`${iso}T00:00:00Z`)
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }, [])

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
    cells.push({ d, iso, today: iso === today, evt: events[iso] || null })
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

  return (
    <div className="portal-cal">
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
      <div className="portal-cal-grid">
        {DOW.map((w, i) => (
          <span key={i} className="dow">
            {w}
          </span>
        ))}
        {cells.map((c, i) => (
          <span
            key={i}
            className={[
              'portal-cal-d',
              c.mut ? 'portal-cal-d--mut' : '',
              c.today ? 'portal-cal-d--today' : '',
              c.evt ? 'portal-cal-d--evt' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={c.evt ? { color: LEVEL_COLOR[c.evt] || undefined } : undefined}
            title={
              c.evt === 'ok'
                ? 'Reservas concluídas neste dia'
                : c.evt === 'warn'
                  ? 'Validade a vencer neste dia'
                  : undefined
            }
          >
            {c.d}
          </span>
        ))}
      </div>
      {hint && (
        <p className="portal-card-hint" style={{ marginTop: 8 }}>
          {hint}
        </p>
      )}
    </div>
  )
}
