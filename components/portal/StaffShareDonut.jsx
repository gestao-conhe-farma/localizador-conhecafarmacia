'use client'

import { useMemo } from 'react'
import { fmtKz } from '@/lib/reservation-format'
import { PieChart } from '@/components/charts/pie-chart'
import { PieSlice } from '@/components/charts/pie-slice'
import { PieCenter } from '@/components/charts/pie-center'

/**
 * Fatias das vendas da equipa — donut @bklit com o total no centro e a
 * percentagem de cada farmacêutico. Recebe as linhas já agregadas pelo
 * servidor (mesma fonte do ranking) — sem novas queries.
 *
 * A paleta usa as variáveis --chart-1…--chart-5 do tema (verde da
 * marca); passando de 5 perfis o cinzento dos restos evita repetir
 * cor e confundir a leitura.
 */

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]
const COR_RESTO = 'var(--ink-30v)'

export default function StaffShareDonut({ rows }) {
  const data = useMemo(() => {
    const fatias = (rows || [])
      .filter((r) => r.value > 0)
      .map((r, i) => ({
        label: r.name,
        value: Math.round(r.value * 100) / 100,
        color: PALETTE[i] || COR_RESTO,
      }))
    return fatias.slice(0, 5)
  }, [rows])

  const total = useMemo(() => data.reduce((t, d) => t + d.value, 0), [data])

  if (data.length === 0) return null

  return (
    <div className="portal-donut-share">
      <PieChart data={data} size={230} innerRadius={72} cornerRadius={4} padAngle={0.012}>
        {data.map((_, i) => (
          <PieSlice key={i} index={i} />
        ))}
        {/* Sem hover o PieCenter mostra o total animado; com hover,
            este children substitui pelo valor da fatia sob o cursor. */}
        <PieCenter defaultLabel="Total do período">
          {(p) => (
            <span className="portal-donut-share-c">
              <b>{fmtKz(p.value)}</b>
              <span>{p.label}</span>
            </span>
          )}
        </PieCenter>
      </PieChart>

      <ul className="portal-donut-share-list">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.label}>
              <i style={{ background: d.color }} />
              <span className="nm">{d.label}</span>
              <span className="pc">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
