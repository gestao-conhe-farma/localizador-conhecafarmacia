'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSalesReport } from '@/lib/actions/pharmacy-portal'
import { logWarn } from '@/lib/log'
import { fmtKz } from '@/lib/reservation-format'

/**
 * Mini-relatório de vendas — total estimado por dia a partir das
 * reservas concluídas. Gráfico de LINHA em SVG puro (o projecto não
 * usa lib de charts): área verde suave + ponto no pico, com os dias
 * em baixo — o «spark» do mock modelo-a-v2. KPIs em cartões do v2
 * (kicker + ícone + delta com ponto).
 *
 * Requisito de pureza dos hooks (react-hooks): "hoje" vive em estado
 * montado uma vez, nunca Date.now() directo no render — os dias sem
 * vendas são calculados a partir dele sem impureza.
 */

const WINDOWS = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
]

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  FALHA_RELATORIO: 'Não foi possível gerar o relatório.',
}

function labelDia(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export default function SalesReport() {
  const [report, setReport] = useState(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  // Resolvido após montar (evita Date.now() impuro no render).
  const [today, setToday] = useState(null)

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10))
  }, [])

  const load = async (d) => {
    setLoading(true)
    const res = await getSalesReport({ days: d })
    setLoading(false)
    if (res.ok) setReport(res)
    else {
      setReport({ ok: false, error: res.error })
      logWarn('portal-vendas', 'Relatório falhou', { error: res.error })
    }
  }

  useEffect(() => {
    load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  /**
   * Série contínua: os dias da janela sem vendas entram com zero —
   * buracos honestos no gráfico (dia sem venda ≠ dia inexistente).
   */
  const series = useMemo(() => {
    if (!report?.ok || !today) return []
    const map = new Map(report.days)
    const out = []
    const start = new Date(`${today}T00:00:00Z`)
    for (let i = report.window - 1; i >= 0; i -= 1) {
      const d = new Date(start.getTime() - i * 24 * 3600 * 1000)
      const iso = d.toISOString().slice(0, 10)
      const bucket = map.get(iso) || { value: 0, count: 0, units: 0 }
      out.push({ day: iso, ...bucket })
    }
    return out
  }, [report, today])

  const maxValue = Math.max(...series.map((s) => s.value), 0)
  const bestDay = series.reduce((acc, s) => (s.value > (acc?.value ?? -1) ? s : acc), null)

  /**
   * Pontos do gráfico de linha — viewBox 520×150 como no mock; o y
   * escala do valor máximo para o chão (com folga) e os dias sem
   * vendas ficam no fundo (buracos honestos, sem colapsar o eixo).
   */
  const spark = (() => {
    if (series.length === 0 || maxValue <= 0) return null
    const W = 520
    const H = 150
    const n = series.length
    const pt = (s, i) => {
      const x = n === 1 ? W / 2 : (i / (n - 1)) * W
      const y = H - 10 - (s.value / maxValue) * (H - 30)
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
    }
    const pts = series.map(pt)
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
    const area = `${line} L${W},${H} L0,${H} Z`
    const peakIdx = series.findIndex((s) => s.value === maxValue)
    const [px, py] = pts[peakIdx === -1 ? n - 1 : peakIdx]
    return { line, area, px, py }
  })()

  /**
   * Tendência vs. período anterior (mesmo tamanho da janela):
   * delta % do valor estimado — null quando não há base de comparação
   * (período anterior sem vendas não permite %: mostra só o absoluto).
   */
  const trend = useMemo(() => {
    if (!report?.ok || !report.prev) return null
    const cur = report.totalValue
    const prev = report.prev.totalValue
    if (prev <= 0) return { cur, prev, pct: null }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return { cur, prev, pct }
  }, [report])

  return (
    <section className="portal-section">
      {/* Padrão único do portal: cabeçalho compacto, sem hero. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Vendas</h1>
          <p className="portal-page-sub">
            Valor estimado por dia — reservas concluídas (levantadas no balcão).
          </p>
        </div>
      </div>

      {/* Toolbar única — janela numa linha, à esquerda. */}
      <div className="portal-toolbar portal-toolbar--left">
        <div className="portal-chips" role="group" aria-label="Escolher janela do relatório">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`portal-chip${days === w.id ? ' portal-chip--active' : ''}`}
              onClick={() => setDays(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !report && (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      )}

      {report && !report.ok && (
        <div className="empty-state">
          <p className="empty-sub">{ERRORES[report.error] || ERRORES.FALHA_RELATORIO}</p>
        </div>
      )}

      {report?.ok && (
        <>
          {/* KPIs do mock (kicker + ícone + número + delta com ponto):
              "quanto, quantas, melhor dia" — a tendência real (esta
              janela vs. a anterior) vive no delta do primeiro. */}
          <div className="portal-kpis portal-kpis--3">
            <div className="portal-kpi">
              <div className="portal-kpi-top">
                <span className="portal-kpi-k">Total estimado · {report.window} dias</span>
                <span className="portal-kpi-ic portal-kpi-ic--green" aria-hidden="true">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </span>
              </div>
              <span className="portal-kpi-n">{fmtKz(report.totalValue)}</span>
              {trend && trend.pct != null && (
                <span className="portal-kpi-delta">
                  <i className={trend.pct >= 0 ? 'd-up' : 'd-down'} />
                  {trend.pct >= 0 ? '+' : ''}
                  {trend.pct}% vs. os {report.window} dias anteriores
                </span>
              )}
              {trend && trend.pct == null && (
                <span className="portal-kpi-delta">
                  <i className="d-warn" />
                  sem vendas na janela anterior
                </span>
              )}
            </div>
            <div className="portal-kpi">
              <div className="portal-kpi-top">
                <span className="portal-kpi-k">Reservas concluídas</span>
                <span className="portal-kpi-ic portal-kpi-ic--teal" aria-hidden="true">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </div>
              <span className="portal-kpi-n">{report.totalCount}</span>
              <span className="portal-kpi-s">levantadas no balcão</span>
            </div>
            <div className="portal-kpi">
              <div className="portal-kpi-top">
                <span className="portal-kpi-k">Melhor dia</span>
                <span className="portal-kpi-ic portal-kpi-ic--amber" aria-hidden="true">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 21h8M12 17v4" />
                    <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
                    <path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1" />
                  </svg>
                </span>
              </div>
              <span className="portal-kpi-n">
                {bestDay && bestDay.value > 0 ? fmtKz(bestDay.value) : '—'}
              </span>
              <span className="portal-kpi-s">
                {bestDay && bestDay.value > 0 ? labelDia(bestDay.day) : 'sem vendas na janela'}
              </span>
            </div>
          </div>

          {/* Gráfico de linha (spark do mock) — área verde suave, pico
              marcado com ponto; dias sem venda ficam no fundo. */}
          {spark ? (
            <div className="portal-box">
              <div className="portal-card-head">
                <h2>Vendas por dia</h2>
                <span className="portal-card-hint">Kz estimados</span>
              </div>
              <div className="portal-card-body">
                <div
                  className="portal-spark"
                  role="img"
                  aria-label={`Valor estimado por dia nos últimos ${report.window} dias; total ${fmtKz(report.totalValue)}`}
                >
                  <svg viewBox="0 0 520 150" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="sparkGfx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#0a844f" stopOpacity=".26" />
                        <stop offset="1" stopColor="#0a844f" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={spark.area} fill="url(#sparkGfx)" />
                    <path
                      d={spark.line}
                      fill="none"
                      stroke="#0a844f"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx={spark.px} cy={spark.py} r="4" fill="#0a844f" />
                    <circle cx={spark.px} cy={spark.py} r="8" fill="#0a844f" opacity=".16" />
                  </svg>
                </div>
                <div className="portal-spark-days">
                  {series.map((s, i) => (
                    <span
                      key={s.day}
                      title={`${labelDia(s.day)} — ${fmtKz(s.value)} · ${s.count} reserva${s.count !== 1 ? 's' : ''}`}
                      style={{ display: series.length > 10 && i % 2 === 1 ? 'none' : undefined }}
                    >
                      {labelDia(s.day)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="portal-box">
              <div className="portal-rows-empty">
                <b>Sem vendas na janela</b>
                Nenhuma reserva concluída nos últimos {report.window} dias — o gráfico aparece assim
                que houver levantamentos no balcão.
              </div>
            </div>
          )}

          {report.unpricedCount > 0 && (
            <p className="portal-foot-note">
              {report.unpricedCount} de {report.totalCount} reservas concluídas não entram no
              montante — foram criadas antes das formas de venda e não têm preço registado.
            </p>
          )}
          <p className="portal-foot-note">
            Valores estimados pelo preço das formas de venda — o final é o apurado no balcão.
          </p>
        </>
      )}
    </section>
  )
}
