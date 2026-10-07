import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'
import { openStatus } from '@/lib/opening-hours'
import {
  getMyAttentionFeed,
  getPendingReservationsCount,
  getSalesReport,
} from '@/lib/actions/pharmacy-portal'
import { createServerComponentClient } from '@/lib/supabase/server'
import PendingReservationsCard from '@/components/portal/PendingReservationsCard'
import MiniMonthCalendar from '@/components/portal/MiniMonthCalendar'

export const metadata = {
  title: 'Portal da farmácia — visão geral',
  robots: { index: false, follow: false },
}

/** "1 reposição" / "2 reposições" — contagens sem língua de madeira. */
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

/** Fuso do público-alvo (Kz/Angola) — a saudação segue o dia lá, não o UTC do servidor. */
const TZ = 'Africa/Luanda'

/** Bom dia (<12) · Boa tarde (<19) · Boa noite. */
function saudacao() {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: TZ,
    }).format(new Date()),
  )
  if (h < 12) return 'Bom dia'
  if (h < 19) return 'Boa tarde'
  return 'Boa noite'
}

/** "Quarta, 23 de setembro" — igual à data do mock, em pt-PT. */
function dataLonga() {
  const s = new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date())
  const partes = s.replace('-feira', '').split(', ')
  return partes.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(', ')
}

/** Valor em Kwanzas no formato do mock: "37 500 Kz" (pt-PT, sem decimais). */
function kz(v) {
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(
    Math.round(v || 0),
  )} Kz`
}

/**
 * Contagem leve para o KPI «Stock disponível»: itens com in_stock = true
 * (head count — não carrega linhas). Falha devolve 0, nunca a página.
 */
async function countActiveStock(pharmacyId) {
  try {
    const supabase = await createServerComponentClient()
    const { count, error } = await supabase
      .from('stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pharmacyId)
      .eq('in_stock', true)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Donut «Stock no Localizador»: disponível (in_stock), o resto do
 * catálogo visível e os fármacos pendentes de validação (0015).
 * Três head counts — nada de linhas carregadas.
 */
async function countCatalog(pharmacyId) {
  try {
    const supabase = await createServerComponentClient()
    let totalRes = await supabase
      .from('drugs')
      .select('id', { count: 'exact', head: true })
      .or(`active.eq.true,created_by_pharmacy.eq.${pharmacyId}`)
    // 0015 por aplicar (coluna inexistente) → só activos, como no snapshot.
    if (totalRes.error) {
      totalRes = await supabase
        .from('drugs')
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
    }
    const pendRes = await supabase
      .from('drugs')
      .select('id', { count: 'exact', head: true })
      .eq('active', false)
      .eq('created_by_pharmacy', pharmacyId)
    if (totalRes.error) return { total: 0, pending: 0 }
    return { total: totalRes.count ?? 0, pending: pendRes.count ?? 0 }
  } catch {
    return { total: 0, pending: 0 }
  }
}

/**
 * Dias com eventos para o mini-calendário — janela −60/+90 dias:
 * reservas concluídas (ponto verde) e validades a vencer (ponto
 * âmbar). Uma janela em vez de mês fixo para os ‹ › do calendário
 * mostrarem eventos também nos meses vizinhos.
 */
async function dashboardEvents(pharmacyId) {
  try {
    const supabase = await createServerComponentClient()
    const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()
    const to = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
    const [res, stock] = await Promise.all([
      supabase
        .from('reservations')
        .select('resolved_at')
        .eq('pharmacy_id', pharmacyId)
        .eq('status', 'concluida')
        .gte('resolved_at', from)
        .lte('resolved_at', to)
        .limit(500),
      supabase
        .from('stock_items')
        .select('expires_at')
        .eq('pharmacy_id', pharmacyId)
        .eq('in_stock', true)
        .not('expires_at', 'is', null)
        .gte('expires_at', from.slice(0, 10))
        .lte('expires_at', to.slice(0, 10)),
    ])
    const events = {}
    for (const r of res.data || []) {
      const d = String(r.resolved_at || '').slice(0, 10)
      if (d) events[d] = 'ok'
    }
    // A validade ganha o ponto (urgência maior quando coincidem).
    for (const s of stock.data || []) {
      const d = String(s.expires_at || '').slice(0, 10)
      if (d) events[d] = 'warn'
    }
    return events
  } catch {
    return {}
  }
}

/** «vendeu há 2 d» / «expira em 12 dias» — texto do feed do dia. */
function timeAgoRel(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return d === 1 ? 'ontem' : `há ${d} d`
}

/** «21 out» — data curta em pt-PT. */
function dataCurta(iso) {
  if (!iso) return ''
  return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Visão geral (v2 «Premium Calmo»): os 4 cartões KPI do mockup
 * modelo-a-v2 com contagens REAIS do servidor — atenção, reservas,
 * stock e vendas (7 dias). Sem deltas históricos: não há fonte de
 * «ontem» e inventar números é pior que não os mostrar.
 */
export default async function PortalOverviewPage() {
  const { session, reason, detail } = await getPharmacySessionVerbose()
  if (!session) {
    // Mesmo conduta do layout — e nunca desestruturar null (era o crash).
    console.log('[portal-debug] visão geral sem sessão:', reason, detail || '')
    const qs = new URLSearchParams({ motivo: reason })
    if (detail) qs.set('detalhe', detail)
    redirect(`/portal/login?${qs.toString()}`)
  }
  const { pharmacy } = session
  const status = openStatus(pharmacy.opening_hours)
  const nome = String(session.profile?.display_name || '')
    .trim()
    .split(/\s+/)[0]

  const [att, pend, sales, stockCount, catalog, events] = await Promise.all([
    getMyAttentionFeed(),
    getPendingReservationsCount(),
    getSalesReport({ days: 7 }),
    countActiveStock(pharmacy.id),
    countCatalog(pharmacy.id),
    dashboardEvents(pharmacy.id),
  ])

  // O feed completo dá as mesmas contagens que o antigo getAttentionCount
  // (restock + expiry + stale) e ainda os itens para o «Hoje na farmácia».
  const feedRestock = att.ok ? att.feed.restock : []
  const feedExpiry = att.ok ? att.feed.expiry : []
  const feedStale = att.ok ? att.feed.stale : []
  const atencaoN = feedRestock.length + feedExpiry.length + feedStale.length
  const restockN = feedRestock.length
  const expiryN = feedExpiry.length
  const staleN = feedStale.length
  const pendN = pend.ok ? pend.count : 0

  const kpis = [
    {
      href: '/portal/atencao',
      k: 'Precisa de atenção',
      n: atencaoN,
      s: [
        plural(restockN, 'reposição', 'reposições'),
        plural(expiryN, 'validade', 'validades'),
        plural(staleN, 'desactualizado', 'desactualizados'),
      ].join(' · '),
      ic: 'red',
      svg: (
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
          <path d="M12 3 2.5 20h19L12 3z" />
          <path d="M12 10v4" />
          <path d="M12 17.5h.01" />
        </svg>
      ),
    },
    {
      href: '/portal/reservas',
      k: 'Reservas por atender',
      n: pendN,
      s: 'prazo de resposta: 72 h',
      ic: 'amber',
      svg: (
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
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      ),
    },
    {
      href: '/portal/stock',
      k: 'Stock disponível',
      n: stockCount,
      s: 'itens marcados «temos» no stock',
      ic: 'green',
      svg: (
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
          <path d="M4 8h16v12H4z" />
          <path d="M9 8V5h6v3" />
          <path d="M4 13h16" />
        </svg>
      ),
    },
    {
      href: '/portal/vendas',
      k: 'Vendas (7 dias)',
      n: kz(sales.ok ? sales.totalValue : 0),
      s: sales.ok
        ? plural(sales.totalCount, 'reserva concluída', 'reservas concluídas')
        : 'relatório indisponível',
      ic: 'teal',
      svg: (
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
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-8" />
          <path d="M22 20H2" />
        </svg>
      ),
    },
  ]

  /**
   * «Hoje na farmácia» — itens de atenção REAIS, mais urgentes ao
   * topo: reposição (vermelho) · validade (âmbar) · desactualizado
   * (neutro). Máximo de 4 — o resto vive em /portal/atencao.
   */
  const feedTop = [
    ...feedRestock.map((r) => ({
      key: `r-${r.drug_id}`,
      cls: 'bad',
      title: `Repor ${r.name}`,
      sub: `vendeu ${timeAgoRel(r.when)}${
        r.stockQuantity != null ? ` · restam ${r.stockQuantity}` : ''
      }`,
      when: timeAgoRel(r.when),
    })),
    ...feedExpiry.map((e) => ({
      key: `e-${e.drug_id}`,
      cls: e.level === 'expired' || e.level === '30' ? 'bad' : 'warn',
      title: `Validade ${e.name}`,
      sub:
        e.days < 0
          ? `expirou há ${Math.abs(e.days)} dias`
          : `expira em ${e.days} dia${e.days !== 1 ? 's' : ''}`,
      when: dataCurta(e.expires_at),
    })),
    ...feedStale.map((s) => ({
      key: `s-${s.drug_id}`,
      cls: 'mut',
      title: `Reconfirmar ${s.name}`,
      sub: `confirmado ${timeAgoRel(s.confirmed_at)}`,
      when: dataCurta(s.confirmed_at),
    })),
  ].slice(0, 4)

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          {/* Cumprimento por hora (como o mock: «Bom dia, Domingos») —
              primeiro nome do perfil quando existe. */}
          <h1 className="portal-page-title">
            {saudacao()}
            {nome ? `, ${nome}` : ''}
          </h1>
          <p className="portal-page-sub">
            {dataLonga()} · Tudo o que precisa de decisão hoje, numa só vista.
            {status ? <> · {status.label}</> : null}
          </p>
        </div>
        <Link href="/portal/stock" className="btn btn-primary">
          + Adicionar medicamento
        </Link>
      </div>

      {/* KPIs do mock (kicker + ícone à direita, número grande, sub) —
          contagens reais; links levam à área correspondente. */}
      <div className="portal-kpis">
        {kpis.map((c) => (
          <Link key={c.k} href={c.href} className="portal-kpi">
            <span className="portal-kpi-top">
              <span className="portal-kpi-k">{c.k}</span>
              <span className={`portal-kpi-ic portal-kpi-ic--${c.ic}`} aria-hidden="true">
                {c.svg}
              </span>
            </span>
            <span className="portal-kpi-n">{c.n}</span>
            <span className="portal-kpi-s">{c.s}</span>
          </Link>
        ))}
      </div>

      {/* Painel inferior do mock — grelha 2 colunas: reservas com
          acções reais à esquerda; donut de stock + calendário do dia
          com feed à direita. Tudo com dados do servidor. */}
      <div className="portal-grid2">
        <div className="portal-box">
          <div className="portal-card-head">
            <h2>Reservas por atender</h2>
            <Link href="/portal/reservas" className="portal-card-link">
              Ver todas →
            </Link>
          </div>
          <div className="portal-card-body">
            <PendingReservationsCard />
          </div>
        </div>

        <div className="portal-grid2-col">
          <div className="portal-box">
            <div className="portal-card-head">
              <h2>Stock no Localizador</h2>
            </div>
            <div className="portal-card-body portal-donut-wrap">
              <div
                className="portal-donut"
                style={{
                  '--p': catalog.total > 0 ? Math.round((stockCount / catalog.total) * 100) : 0,
                }}
              >
                <b>{catalog.total > 0 ? Math.round((stockCount / catalog.total) * 100) : 0}%</b>
              </div>
              <ul className="portal-donut-legend">
                <li>
                  <i className="portal-lg-green" /> Disponível <b>{stockCount}</b>
                </li>
                <li>
                  <i className="portal-lg-dark" /> Catálogo visível <b>{catalog.total}</b>
                </li>
                <li>
                  <i className="portal-lg-gray" /> Pendentes validação <b>{catalog.pending}</b>
                </li>
              </ul>
            </div>
          </div>

          <div className="portal-box">
            <div className="portal-card-head">
              <h2>Hoje na farmácia</h2>
              <span className="portal-card-hint">ponto = evento</span>
            </div>
            <div className="portal-card-body">
              <MiniMonthCalendar events={events} />
              {feedTop.length > 0 && (
                <div className="portal-feed" style={{ marginTop: 12 }}>
                  {feedTop.map((f) => (
                    <div key={f.key} className="portal-feed-item">
                      <span className={`portal-st portal-st--${f.cls}`} aria-hidden="true">
                        <i />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <b>{f.title}</b>
                        <span>{f.sub}</span>
                      </div>
                      <span className="when">{f.when}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="portal-page-hint">
        A sua página pública:{' '}
        <Link href={`/farmacia/${pharmacy.slug}`}>/farmacia/{pharmacy.slug}</Link>
      </p>
      <p className="portal-foot-note">
        O stock fica visível no Localizador enquanto a confirmação for actual · Dúvidas:{' '}
        suporte@conhecafarmacia.com
      </p>
    </div>
  )
}
