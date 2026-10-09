import Link from 'next/link'
import { requireActiveStaff } from '@/lib/staff-session'
import { getPerformanceReport } from '@/lib/actions/pharmacy-staff'
import { fmtKz } from '@/lib/reservation-format'
import StaffCompare from '@/components/portal/StaffCompare'
import StaffShareDonut from '@/components/portal/StaffShareDonut'

export const metadata = {
  title: 'Portal da farmácia — desempenho',
  robots: { index: false, follow: false },
}

// Dados frescos a cada visita (perfil + relatório do turno).
export const dynamic = 'force-dynamic'

const JANELAS = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
]

function pctTexto(pct) {
  if (pct === null || pct === undefined) return '—'
  if (pct === 0) return '±0%'
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`
}

function pctClasse(pct) {
  if (pct === null || pct === undefined || pct === 0) return 'is-flat'
  return pct > 0 ? 'is-up' : 'is-down'
}

/**
 * Desempenho de vendas — o GERENTE vê a equipa (ranking, tabela
 * avançada, comparação lado a lado); o BALCÃO vê a versão PESSOAL:
 * só as suas vendas, ticket e tendência, sem colegas. O escopo é
 * imposto no servidor (getPerformanceReport), nunca pelo cliente.
 * Fonte: reservas movidas por `handled_by` (0018) + entradas de stock;
 * o histórico anterior à atribuição conta como «Não atribuído».
 */
export default async function DesempenhoPage({ searchParams }) {
  const staff = await requireActiveStaff()
  const isManager = staff.role === 'gerente'
  const params = await searchParams
  const dias = JANELAS.some((j) => j.id === Number(params?.dias)) ? Number(params.dias) : 30
  const report = await getPerformanceReport({ days: dias })

  if (!report.ok) {
    return (
      <div className="portal-page">
        <div className="portal-page-head">
          <div>
            <h1 className="portal-page-title">Desempenho</h1>
            <p className="portal-page-sub">Comparação de vendas por farmacêutico.</p>
          </div>
        </div>
        <div className="portal-box">
          <div className="portal-rows-empty">
            <b>Não foi possível gerar o relatório</b>
            Recarregue a página e tente de novo.
          </div>
        </div>
      </div>
    )
  }

  const { rows, totals } = report
  const maxValue = Math.max(...rows.map((r) => r.value), 1)
  const totalPct =
    totals.prevValue > 0
      ? Math.round(((totals.value - totals.prevValue) / totals.prevValue) * 100)
      : null
  // Movimento do balcão (só faz sentido com métricas de equipo):
  // quem recusou/expirou sem vender aparece no total da equipa.
  const recusas = totals.refused + totals.expired

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        {' '}
        <div>
          <h1 className="portal-page-title">Desempenho</h1>
          <p className="portal-page-sub">
            {isManager
              ? 'Vendas por farmacêutico — reservas concluídas e entradas de stock no período.'
              : `As suas vendas, ${staff.name} — reservas concluídas e entradas de stock no período.`}
          </p>
        </div>
      </div>

      <div className="portal-toolbar portal-toolbar--left">
        <div className="portal-chips" role="group" aria-label="Escolher período">
          {JANELAS.map((j) => (
            <Link
              key={j.id}
              href={`/portal/desempenho?dias=${j.id}`}
              className={`portal-chip${dias === j.id ? ' portal-chip--active' : ''}`}
            >
              {j.label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs — o mesmo cartão do resto do portal, com a tendência
          desta janela contra a anterior (mesmo tamanho). */}
      <div className="portal-kpis">
        <div className="portal-kpi">
          <div className="portal-kpi-top">
            <span className="portal-kpi-k">Vendas · {report.window} dias</span>
            <span className="portal-kpi-ic portal-kpi-ic--green" aria-hidden="true">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
              </svg>
            </span>
          </div>
          <div className="portal-kpi-n">{fmtKz(totals.value)}</div>
          <span className="portal-kpi-delta">
            <i className={totalPct == null ? 'd-warn' : totalPct >= 0 ? 'd-up' : 'd-down'} />
            {totalPct == null
              ? 'sem base de comparação'
              : `${totalPct >= 0 ? '+' : ''}${totalPct}% vs. os ${report.window} dias anteriores`}
          </span>
        </div>

        <div className="portal-kpi">
          <div className="portal-kpi-top">
            <span className="portal-kpi-k">Vendas concluídas</span>
            <span className="portal-kpi-ic portal-kpi-ic--green" aria-hidden="true">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6z" />
                <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
              </svg>
            </span>
          </div>
          <div className="portal-kpi-n">{totals.count}</div>
          <span className="portal-kpi-delta">
            <i className={totals.count > 0 ? 'd-up' : 'd-warn'} />
            {totals.count > 0 ? `${totals.units} un. levantadas` : 'sem vendas no período'}
          </span>
        </div>

        <div className="portal-kpi">
          <div className="portal-kpi-top">
            <span className="portal-kpi-k">Ticket médio</span>
            <span className="portal-kpi-ic portal-kpi-ic--green" aria-hidden="true">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
              </svg>
            </span>
          </div>
          <div className="portal-kpi-n">{fmtKz(totals.ticket)}</div>
          <span className="portal-kpi-delta">por venda levantada</span>
        </div>

        <div className="portal-kpi">
          <div className="portal-kpi-top">
            <span className="portal-kpi-k">Entradas de stock</span>
            <span className="portal-kpi-ic portal-kpi-ic--green" aria-hidden="true">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 21V9" />
                <path d="m7 14 5-5 5 5" />
                <path d="M5 3h14" />
              </svg>
            </span>
          </div>
          <div className="portal-kpi-n">{totals.entries}</div>
          <span className="portal-kpi-delta">
            <i className="d-up" />
            {totals.entryUnits} un. registadas
          </span>
        </div>
      </div>

      {/* Movimento do balcão — reservas que passaram por um perfil:
          tratadas, recusadas e expiradas (o gerente lê quem trabalhou
          e quem deixou reservas cair; o balcão vê só as suas). */}
      <div className="portal-box portal-box--pad">
        <div className="portal-sec-head">
          <h2>Movimento do balcão</h2>
          <span className="portal-sec-head-b">reservas com perfil activo</span>
        </div>
        <div className="portal-cmp-metrics portal-staff-flow">
          <div className="portal-cmp-metric">
            <span className="portal-cmp-k">Reservas tratadas</span>
            <span className="portal-cmp-v">{totals.treated}</span>
          </div>
          <div className="portal-cmp-metric">
            <span className="portal-cmp-k">Recusadas</span>
            <span className="portal-cmp-v">{totals.refused}</span>
          </div>
          <div className="portal-cmp-metric">
            <span className="portal-cmp-k">Expiradas</span>
            <span className="portal-cmp-v">{totals.expired}</span>
          </div>
          <div className="portal-cmp-metric">
            <span className="portal-cmp-k">Concluídas</span>
            <span className="portal-cmp-v">{totals.count}</span>
          </div>
        </div>
        <p className="portal-hint">
          {recusas > 0
            ? `${recusas} reserva${recusas === 1 ? '' : 's'} não chegou ao balcão (recusa ou validade).`
            : 'Nenhuma recusa ou expiração no período — tudo o que entrou chegou ao cliente.'}
        </p>
      </div>

      {/* Ranking com barras — leitura imediata de quem lidera.
          Só para gerentes: o balcão não vê colegas (o escopo do
          relatório já é pessoal, mas a leitura de equipa não é dele). */}
      {isManager && (
        <div className="portal-box portal-box--pad">
          <div className="portal-sec-head">
            <h2>Ranking de vendas</h2>
            <span className="portal-sec-head-b">por valor estimado</span>
          </div>
          {rows.length === 0 ? (
            <div className="portal-rows-empty">
              <b>Sem vendas atribuídas neste período</b>
              Assim que houver reservas concluídas com perfil activo, aparecem aqui.
            </div>
          ) : (
            rows.map((r, i) => (
              <div key={r.id || `anon-${i}`} className="portal-rank">
                <span className="portal-rank-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="portal-rank-name">
                  <b>{r.name}</b>
                  <span className="sub">
                    {r.count} venda{r.count === 1 ? '' : 's'} · ticket {fmtKz(r.ticket)}
                  </span>
                </span>
                <span className="portal-rank-bar" aria-hidden="true">
                  <span
                    className="portal-rank-fill"
                    style={{ width: `${Math.max(4, Math.round((r.value / maxValue) * 100))}%` }}
                  />
                </span>
                <span className="portal-rank-v">{fmtKz(r.value)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Fatia de cada um nas vendas da equipa — donut @bklit. */}
      {isManager && rows.length > 1 && (
        <div className="portal-box portal-box--pad">
          <div className="portal-sec-head">
            <h2>Partilha das vendas</h2>
            <span className="portal-sec-head-b">por valor estimado</span>
          </div>
          <StaffShareDonut rows={rows} />
        </div>
      )}

      {/* Tabela avançada — métricas lado a lado + tendência de cada
          farmacêutico contra o período anterior (só gerentes: é a
          leitura de equipa; o balcão ficou com os KPIs acima). */}
      {isManager && (
        <div className="portal-box portal-rows">
          <div className="portal-sec-head">
            <h2>Tabela avançada</h2>
            <span className="portal-sec-head-b">actual vs. anterior</span>
          </div>
          <div className="portal-rowhead portal-cols-desempenho" aria-hidden="true">
            <span>Farmacêutico</span>
            <span>Vendas</span>
            <span>Nº</span>
            <span>Ticket médio</span>
            <span>Unidades</span>
            <span>Entradas</span>
            <span>Tratadas</span>
            <span>Recusas</span>
            <span>Período ant.</span>
          </div>
          {rows.length === 0 ? (
            <div className="portal-rows-empty">
              <b>Nada a comparar</b>
              Não houve actividade registada nos últimos {report.window * 2} dias.
            </div>
          ) : (
            rows.map((r, i) => (
              <div
                key={r.id || `anon-${i}`}
                className="portal-rowline portal-rowline--static portal-cols-desempenho"
              >
                <div className="portal-cell">
                  <b>{r.name}</b>
                  <span className="sub portal-cell-mob">
                    {r.role === 'gerente' ? 'Gerente' : r.role ? 'Balcão' : '—'} ·{' '}
                    {r.active === false ? 'inactivo' : 'activo'}
                  </span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{fmtKz(r.value)}</span>
                  <span className="tiny">{r.unpriced > 0 ? `${r.unpriced} s/ preço` : ''}</span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{r.count}</span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{fmtKz(r.ticket)}</span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{r.units}</span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{r.entries}</span>
                  <span className="tiny">{r.entryUnits > 0 ? `${r.entryUnits} un.` : ''}</span>
                </div>
                <div className="portal-cell">
                  <span className="strong">{r.treated}</span>
                  <span className="tiny">{r.count > 0 ? `${r.count} vend.` : 's/ venda'}</span>
                </div>
                <div className="portal-cell">
                  <span className={`strong${r.refused + r.expired > 0 ? ' is-warn' : ''}`}>
                    {r.refused + r.expired}
                  </span>
                  <span className="tiny">
                    {r.refused > 0 ? `${r.refused} rec.` : ''}
                    {r.refused > 0 && r.expired > 0 ? ' · ' : ''}
                    {r.expired > 0 ? `${r.expired} exp.` : ''}
                  </span>
                </div>
                <div className="portal-cell">
                  <span className={`portal-trend ${pctClasse(r.pct)}`}>{pctTexto(r.pct)}</span>
                  <span className="tiny">{fmtKz(r.prevValue)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Comparação lado a lado — escolhe dois perfis e vê as métricas
          face a face (só gerentes — são colegas a serem comparados). */}
      {isManager && rows.length > 1 && <StaffCompare rows={rows} />}

      <p className="portal-hint">
        Vendas = reservas concluídas (preço da opção × unidades separadas). Tratadas = reservas que
        passaram por um perfil neste período (inclui recusadas/expiradas). Recusas = recusadas +
        expiradas sem levantamento. Entradas = registos de stock em nome de cada perfil. Antes da
        atribuição existir, os registos contam como <b>Não atribuído</b>.
      </p>
    </div>
  )
}
