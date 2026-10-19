'use client'

import { useMemo, useState } from 'react'
import { fmtKz } from '@/lib/reservation-format'
import { RadarChart } from '@/components/charts/radar-chart'
import { RadarGrid } from '@/components/charts/radar-grid'
import { RadarAxis } from '@/components/charts/radar-axis'
import { RadarLabels } from '@/components/charts/radar-labels'
import { RadarArea } from '@/components/charts/radar-area'
import { RadarTooltip } from '@/components/charts/radar-tooltip'

/**
 * Comparação lado a lado — escolhe dois a cinco perfis e vê as métricas
 * do período face a face. Sem novas queries: recebe as linhas já
 * agregadas pelo servidor.
 *
 * Além dos cartões de métricas, um Radar (@bklit) normaliza cada eixo
 * 0–100 contra o MELHOR perfil seleccionado — o desenho do turno de
 * cada um lê-se de relance (quem é mais constante, quem depende de
 * entradas). A legenda sincroniza com o gráfico: passar o rato num
 * perfil destaca o polígono correspondente (hoveredIndex controlado).
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

/** Paleta do tema (@bklit) — uma cor por série, até cinco perfis. */
const CORES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const MAX_PERFIS = CORES.length

/** Linhas do tooltip (formato `TooltipRow` do @bklit) para o eixo em foco. */
function radarRows(perfis, metricIndex) {
  const metric = RADAR_METRICAS[metricIndex]
  if (!metric) return []

  return perfis.filter(Boolean).map((row, index) => ({
    color: CORES[index],
    label: row.name,
    value:
      metric.key === 'value' || metric.key === 'ticket'
        ? fmtKz(Number(row[metric.key]) || 0)
        : String(Number(row[metric.key]) || 0),
  }))
}

export default function StaffCompare({ rows }) {
  const maxPerfis = Math.min(MAX_PERFIS, rows.length)
  const [picks, setPicks] = useState(() => (rows.length > 1 ? [0, 1] : [0]))
  /** Série em foco (estado controlado do radar): sincroniza legenda ↔ gráfico. */
  const [hoveredSeries, setHoveredSeries] = useState(null)

  /** Slots válidos + sem repetições, mesmo que `rows` mude entre visitas. */
  const selection = useMemo(() => {
    const vistos = new Set()
    const limpos = picks.filter((index) => {
      if (index >= rows.length || vistos.has(index)) return false
      vistos.add(index)
      return true
    })
    return limpos.length > 0 ? limpos : rows.map((_, i) => i).slice(0, 2)
  }, [picks, rows])

  const perfis = useMemo(
    () => selection.map((index) => rows[index]).filter(Boolean),
    [selection, rows],
  )

  const canAdd = perfis.length < maxPerfis && selection.length < rows.length && rows.length > 2

  const escolher = (slot, index) => {
    setHoveredSeries(null)
    setPicks(selection.map((value, i) => (i === slot ? index : value)))
  }

  const adicionar = () => {
    const usados = new Set(selection)
    const livre = rows.findIndex((_, i) => !usados.has(i))
    if (livre === -1 || selection.length >= maxPerfis) return
    setHoveredSeries(null)
    setPicks([...selection, livre])
  }

  const remover = (slot) => {
    if (selection.length <= 2) return
    setHoveredSeries(null)
    setPicks(selection.filter((_, i) => i !== slot))
  }

  /**
   * Séries do radar — cada eixo é normalizado 0–100 contra o MELHOR
   * valor entre os perfis escolhidos naquele eixo (0 = ninguém, 100 =
   * topo). Assim todos os polígonos ficam na mesma escala e a
   * comparação é honesta, independentemente de quantos forem.
   */
  const radarSeries = useMemo(() => {
    if (perfis.length < 2) return null

    const brutos = perfis.map((row) => RADAR_METRICAS.map((metric) => Number(row[metric.key]) || 0))
    const maximos = RADAR_METRICAS.map((_, metricIndex) =>
      Math.max(1, ...brutos.map((valores) => valores[metricIndex])),
    )

    return {
      metrics: RADAR_METRICAS,
      series: perfis.map((row, index) => ({
        label: row.name,
        color: CORES[index],
        values: Object.fromEntries(
          RADAR_METRICAS.map((metric, metricIndex) => [
            metric.key,
            Math.round((brutos[index][metricIndex] / maximos[metricIndex]) * 100),
          ]),
        ),
      })),
    }
  }, [perfis])

  const resumo = useMemo(() => {
    if (perfis.length < 2) return 'Escolha dois perfis diferentes.'
    const ordenados = [...perfis].sort((x, y) => (y.value || 0) - (x.value || 0))
    const diff = Math.round(((ordenados[0].value || 0) - (ordenados[1].value || 0)) * 100) / 100
    if (diff === 0) return 'Empate em vendas entre os perfis escolhidos.'
    return `${ordenados[0].name} lidera por ${fmtKz(diff)} sobre ${ordenados[1].name}.`
  }, [perfis])

  const renderCard = (row, slot) => (
    <div
      className="portal-cmp-card"
      key={row.id || `slot-${slot}`}
      style={{ '--cmp-color': CORES[slot] }}
    >
      <div className="portal-cmp-card-head">
        <span className="portal-cmp-card-mark" aria-hidden="true" />
        <span className="portal-cmp-card-side">{`Perfil ${String.fromCharCode(65 + slot)}`}</span>
        <span className="portal-cmp-card-total">{fmtKz(row?.value || 0)}</span>
        {selection.length > 2 ? (
          <button
            aria-label={`Remover ${row?.name || 'perfil'} da comparação`}
            className="portal-cmp-card-remove"
            onClick={() => remover(slot)}
            title="Remover da comparação"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="12"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>
      <select
        aria-label={`Escolher farmacêutico para o perfil ${String.fromCharCode(65 + slot)}`}
        className="portal-input"
        onChange={(event) => escolher(slot, Number(event.target.value))}
        value={selection[slot]}
      >
        {rows.map((r, i) => (
          <option
            disabled={selection.includes(i) && selection[slot] !== i}
            key={r.id || `anon-${i}`}
            value={i}
          >
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
        <span className="portal-sec-head-b">
          {perfis.length} de até {maxPerfis}
        </span>
      </div>
      <div className="portal-cmp">
        {perfis.map((row, slot) => renderCard(row, slot))}
        {canAdd ? (
          <button className="portal-cmp-add" onClick={adicionar} type="button">
            <span className="portal-cmp-add-ic" aria-hidden="true">
              +
            </span>
            <b>Comparar outro</b>
            <small>até {maxPerfis} perfis</small>
          </button>
        ) : null}
        <div className="portal-cmp-gap" role="status">
          <span aria-hidden="true">↔</span>
          {resumo}
        </div>
      </div>

      {/* Radar (@bklit) — cada eixo normalizado contra o melhor dos perfis
          escolhidos; a legenda acende a série correspondente no gráfico. */}
      {radarSeries && (
        <div className="portal-radar">
          <RadarTooltip
            className="portal-radar-gfx"
            metrics={radarSeries.metrics}
            rowsFor={(metricIndex) => radarRows(perfis, metricIndex)}
          >
            <RadarChart
              data={radarSeries.series}
              hoveredIndex={hoveredSeries}
              key={selection.join('-')}
              margin={76}
              metrics={radarSeries.metrics}
              onHoverChange={setHoveredSeries}
            >
              <RadarGrid />
              <RadarAxis />
              <RadarLabels />
              {radarSeries.series.map((_, i) => (
                <RadarArea key={i} index={i} showGlow={false} showPoints={perfis.length <= 3} />
              ))}
            </RadarChart>
          </RadarTooltip>
          <ul className="portal-radar-legend">
            {radarSeries.series.map((s, i) => {
              const isActive = hoveredSeries === i
              const isDimmed = hoveredSeries !== null && !isActive
              return (
                <li key={`${s.label}-${i}`}>
                  <button
                    className={`portal-radar-legend-item${isActive ? ' is-active' : ''}${
                      isDimmed ? ' is-dimmed' : ''
                    }`}
                    onBlur={() => setHoveredSeries(null)}
                    onFocus={() => setHoveredSeries(i)}
                    onPointerEnter={() => setHoveredSeries(i)}
                    onPointerLeave={() => setHoveredSeries(null)}
                    type="button"
                  >
                    <i style={{ background: CORES[i] }} />
                    {s.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
