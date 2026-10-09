'use client'

import { useMemo, useState } from 'react'
import { fmtKz } from '@/lib/reservation-format'
import { RadarChart } from '@/components/charts/radar-chart'
import { RadarGrid } from '@/components/charts/radar-grid'
import { RadarAxis } from '@/components/charts/radar-axis'
import { RadarLabels } from '@/components/charts/radar-labels'
import { RadarArea } from '@/components/charts/radar-area'

/**
 * Comparação lado a lado — dois perfis face a face (pedido do gerente):
 * escolhe um farmacêutico em cada coluna e vê as métricas do período
 * com a diferença no meio. Sem novas queries — recebe as linhas já
 * agregadas pelo servidor.
 *
 * Além da lista de métricas, um Radar (@bklit) normaliza cada eixo
 * 0–100 contra o MELHOR da equipa — o desenho do turno de cada um
 * lê-se de relance (quem é mais constante, quem depende de entradas).
 */

const METRICAS = [
  { key: 'value', label: 'Vendas', fmt: fmtKz },
  { key: 'count', label: 'Nº de vendas', fmt: (v) => String(v) },
  { key: 'ticket', label: 'Ticket médio', fmt: fmtKz },
  { key: 'units', label: 'Unidades', fmt: (v) => String(v) },
  { key: 'entries', label: 'Entradas de stock', fmt: (v) => String(v) },
  {
    key: 'pct',
    label: 'vs. período anterior',
    fmt: (v) => (v === null ? '—' : `${v > 0 ? '▲' : v < 0 ? '▼' : '±'} ${Math.abs(v)}%`),
  },
]

/** Eixos do radar — só métricas positivas e comparáveis em 0–100
 *  (a tendência pct fica de fora: tem negativos e não normaliza). */
const RADAR_METRICAS = [
  { key: 'value', label: 'Vendas' },
  { key: 'count', label: 'Vendas nº' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'units', label: 'Unidades' },
  { key: 'treated', label: 'Tratadas' },
  { key: 'entries', label: 'Entradas' },
]

/** Cores das duas séries — verde da marca + accent (paleta do tema). */
const CORES = ['var(--chart-1)', 'var(--chart-2)']

export default function StaffCompare({ rows }) {
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(() => (rows.length > 1 ? 1 : 0))

  const a = rows[left] || rows[0]
  const b = rows[right] || rows[1] || rows[0]

  /**
   * Séries do radar — cada eixo é normalizado 0–100 contra o MELHOR
   * valor da equipa naquele eixo (0 = ninguém, 100 = topo). Assim os
   * dois polígonos ficam na mesma escala e a comparação é honesta.
   */
  const radarSeries = useMemo(() => {
    if (!a || !b || a.id === b.id) return null
    const pick = (row) =>
      RADAR_METRICAS.map((m) => ({
        key: m.key,
        label: m.label,
        raw: Number(row?.[m.key]) || 0,
      }))
    const axes = pick(a)
      .map((m, i) => ({
        key: m.key,
        label: m.label,
        max: Math.max(m.raw, Number(b?.[RADAR_METRICAS[i].key]) || 0),
      }))
      .map((ax) => ({ ...ax, max: ax.max > 0 ? ax.max : 1 }))
    const toSeries = (row, label, color) => ({
      label,
      color,
      values: Object.fromEntries(
        axes.map((ax, i) => [ax.key, Math.round((pick(row)[i].raw / ax.max) * 100)]),
      ),
    })
    return {
      metrics: axes.map((ax) => ({ key: ax.key, label: ax.label })),
      series: [toSeries(a, a.name, CORES[0]), toSeries(b, b.name, CORES[1])],
    }
  }, [a, b])

  const gap = useMemo(() => {
    if (!a || !b) return null
    const diff = Math.round((a.value - b.value) * 100) / 100
    if (a.id === b.id) return null
    if (diff === 0) return { text: 'Empate em vendas.' }
    const leader = diff > 0 ? a : b
    return {
      text: `${leader.name} lidera por ${fmtKz(Math.abs(diff))} neste período.`,
    }
  }, [a, b])

  const selecionar = (idx, setter) => (e) => setter(Number(e.target.value))

  const renderCard = (row, value, setter) => (
    <div className="portal-cmp-card">
      <select
        className="portal-input"
        value={value}
        onChange={selecionar(value, setter)}
        aria-label="Escolher farmacêutico"
      >
        {rows.map((r, i) => (
          <option key={r.id || `anon-${i}`} value={i}>
            {r.name}
          </option>
        ))}
      </select>
      <div className="portal-cmp-metrics">
        {METRICAS.map((m) => (
          <div key={m.key} className="portal-cmp-metric">
            <span className="portal-cmp-k">{m.label}</span>
            <span className="portal-cmp-v">
              {m.fmt(row?.[m.key] ?? (m.key === 'pct' ? null : 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="portal-box portal-box--pad">
      <div className="portal-sec-head">
        <h2>Comparar farmacêuticos</h2>
        <span className="portal-sec-head-b">lado a lado</span>
      </div>
      <div className="portal-cmp">
        {renderCard(a, left, setLeft)}
        <div className="portal-cmp-gap" role="status">
          {gap?.text || 'Escolha dois perfis diferentes.'}
        </div>
        {renderCard(b, right, setRight)}
      </div>

      {/* Radar (@bklit) — cada eixo normalizado contra o melhor da
          equipa; os dois turnos desenham-se lado a lado. */}
      {radarSeries && (
        <div className="portal-radar">
          <RadarChart
            data={radarSeries.series}
            metrics={radarSeries.metrics}
            className="portal-radar-gfx"
          >
            <RadarGrid />
            <RadarAxis />
            <RadarLabels />
            {radarSeries.series.map((_, i) => (
              <RadarArea key={i} index={i} showGlow={false} />
            ))}
          </RadarChart>
          <ul className="portal-radar-legend" aria-hidden="true">
            {radarSeries.series.map((s, i) => (
              <li key={s.label}>
                <i style={{ background: CORES[i] }} />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
