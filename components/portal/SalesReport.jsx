'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSalesReport } from '@/lib/actions/pharmacy-portal'
import { logWarn } from '@/lib/log'

/**
 * Mini-relatório de vendas — total estimado por dia a partir das
 * reservas concluídas. Gráfico de barras em CSS puro (o projecto não
 * usa lib de charts): cada barra escala em % do dia mais alto, com
 * tooltip nativo pelo title e o valor legível por baixo.
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

const fmtKz = (n) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n) + ' Kz'

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
          {/* KPIs — três números que respondem "quanto, quantas, melhor dia". */}
          <div className="sales-kpis">
            <div className="sales-kpi">
              <span className="sales-kpi-value">{fmtKz(report.totalValue)}</span>
              <span className="sales-kpi-label">Total estimado · {report.window} dias</span>
            </div>
            <div className="sales-kpi">
              <span className="sales-kpi-value">{report.totalCount}</span>
              <span className="sales-kpi-label">Reservas concluídas</span>
            </div>
            <div className="sales-kpi">
              <span className="sales-kpi-value">
                {bestDay && bestDay.value > 0 ? fmtKz(bestDay.value) : '—'}
              </span>
              <span className="sales-kpi-label">
                {bestDay && bestDay.value > 0
                  ? `Melhor dia · ${labelDia(bestDay.day)}`
                  : 'Sem vendas na janela'}
              </span>
            </div>
          </div>

          {/* Gráfico de barras CSS — altura em % do dia mais alto. */}
          {series.length > 0 && (
            <div
              className={`sales-chart${maxValue === 0 ? ' sales-chart--empty' : ''}`}
              role="img"
              aria-label={`Valor estimado por dia nos últimos ${report.window} dias; total ${fmtKz(report.totalValue)}`}
            >
              {series.map((s) => (
                <div key={s.day} className="sales-col">
                  <div className="sales-bar-wrap">
                    <div
                      className={`sales-bar${s.value === 0 ? ' sales-bar--zero' : ''}`}
                      style={
                        s.value > 0
                          ? { height: `${Math.max(6, Math.round((s.value / maxValue) * 100))}%` }
                          : undefined
                      }
                      title={`${labelDia(s.day)} — ${fmtKz(s.value)} · ${s.count} reserva${s.count !== 1 ? 's' : ''}`}
                    />
                  </div>
                  <span className="sales-col-label">{labelDia(s.day)}</span>
                </div>
              ))}
            </div>
          )}

          {report.unpricedCount > 0 && (
            <p className="sales-note">
              {report.unpricedCount} de {report.totalCount} reservas concluídas não entram no
              montante — foram criadas antes das formas de venda e não têm preço registado.
            </p>
          )}
          <p className="sales-note">
            Valores estimados pelo preço das formas de venda — o final é o apurado no balcão.
          </p>
        </>
      )}
    </section>
  )
}
