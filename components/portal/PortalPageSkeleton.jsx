'use client'

const PAGE_LABELS = {
  overview: 'Visão geral',
  reservations: 'Reservas',
  stock: 'Stock',
  entry: 'Entrada de stock',
  movements: 'Movimentos',
  team: 'Equipa',
  performance: 'Desempenho',
  attention: 'Atenção',
  announcements: 'Avisos',
  integration: 'Integração',
  sales: 'Vendas',
  profile: 'Perfil',
  session: 'Sessão',
  help: 'Ajuda',
}

const PAGE_LAYOUTS = {
  overview: { stats: 4, panels: 3, rows: 4 },
  reservations: { stats: 4, panels: 1, rows: 5 },
  stock: { stats: 4, panels: 1, rows: 6 },
  entry: { stats: 4, panels: 1, rows: 5 },
  movements: { stats: 3, panels: 1, rows: 6 },
  team: { stats: 0, panels: 2, rows: 4 },
  performance: { stats: 4, panels: 3, rows: 4 },
  attention: { stats: 3, panels: 1, rows: 5 },
  announcements: { stats: 0, panels: 1, rows: 4 },
  integration: { stats: 0, panels: 2, rows: 4 },
  sales: { stats: 4, panels: 2, rows: 4 },
  profile: { stats: 0, panels: 3, rows: 3 },
  session: { stats: 0, panels: 3, rows: 3 },
  help: { stats: 0, panels: 2, rows: 4 },
}

function Block({ className = '' }) {
  return <span className={`portal-skeleton-block${className ? ` ${className}` : ''}`} />
}

export function PortalSectionSkeleton({ lines = 4 }) {
  return (
    <div className="portal-skeleton portal-section-skeleton" role="status" aria-busy="true">
      <span className="sr-only">A carregar secção…</span>
      <div className="portal-page-head portal-skeleton-head" aria-hidden="true">
        <div className="portal-skeleton-heading">
          <Block className="portal-skeleton-heading-title" />
          <Block className="portal-skeleton-heading-sub" />
        </div>
      </div>
      <section className="portal-box portal-skeleton-panel" aria-hidden="true">
        <div className="portal-skeleton-panel-head">
          <Block className="portal-skeleton-title" />
          <Block className="portal-skeleton-control" />
        </div>
        <div className="portal-skeleton-rows">
          {Array.from({ length: lines }, (_, i) => (
            <div className="portal-skeleton-row" key={i}>
              <Block className="portal-skeleton-avatar" />
              <span className="portal-skeleton-row-text">
                <Block className="portal-skeleton-line" />
                <Block className="portal-skeleton-line portal-skeleton-line--sub" />
              </span>
              <Block className="portal-skeleton-control" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Panel({ rows, index, variant }) {
  return (
    <section className={`portal-box portal-skeleton-panel portal-skeleton-panel--${variant}`}>
      <div className="portal-skeleton-panel-head">
        <Block className="portal-skeleton-title" />
        {index === 0 && <Block className="portal-skeleton-control" />}
      </div>
      {(variant === 'performance' || variant === 'overview') && index === 0 ? (
        <div className="portal-skeleton-chart" aria-hidden="true">
          <Block className="portal-skeleton-chart-line" />
          <Block className="portal-skeleton-chart-line portal-skeleton-chart-line--short" />
          <Block className="portal-skeleton-chart-plot" />
        </div>
      ) : (
        <div className="portal-skeleton-rows" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div className="portal-skeleton-row" key={i}>
              <Block className="portal-skeleton-avatar" />
              <span className="portal-skeleton-row-text">
                <Block className="portal-skeleton-line" />
                <Block className="portal-skeleton-line portal-skeleton-line--sub" />
              </span>
              <Block className="portal-skeleton-control" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function PortalPageSkeleton({ variant = 'overview', title }) {
  const layout = PAGE_LAYOUTS[variant] || PAGE_LAYOUTS.overview
  const label = title || PAGE_LABELS[variant] || 'Portal'

  return (
    <div
      className={`portal-page portal-skeleton portal-skeleton--${variant}`}
      role="status"
      aria-busy="true"
      aria-label={`A carregar ${label}`}
    >
      <span className="sr-only">A carregar {label}…</span>
      <header className="portal-page-head portal-skeleton-head" aria-hidden="true">
        <div className="portal-skeleton-heading">
          <Block className="portal-skeleton-heading-title" />
          <Block className="portal-skeleton-heading-sub" />
        </div>
        {['stock', 'overview', 'reservations'].includes(variant) && (
          <Block className="portal-skeleton-action" />
        )}
      </header>

      {layout.stats > 0 && (
        <div className="portal-kpis portal-skeleton-kpis" aria-hidden="true">
          {Array.from({ length: layout.stats }, (_, i) => (
            <div className="portal-kpi portal-skeleton-kpi" key={i}>
              <Block className="portal-skeleton-line portal-skeleton-line--label" />
              <Block className="portal-skeleton-line portal-skeleton-line--number" />
              <Block className="portal-skeleton-line portal-skeleton-line--sub" />
            </div>
          ))}
        </div>
      )}

      {layout.panels > 0 && (
        <div
          className={`portal-skeleton-panels portal-skeleton-panels--${variant}`}
          aria-hidden="true"
        >
          {Array.from({ length: layout.panels }, (_, i) => (
            <Panel key={i} index={i} rows={layout.rows} variant={variant} />
          ))}
        </div>
      )}
    </div>
  )
}
