import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'
import { openStatus } from '@/lib/opening-hours'
import {
  getAttentionCount,
  getPendingReservationsCount,
  getSalesReport,
} from '@/lib/actions/pharmacy-portal'
import { createServerComponentClient } from '@/lib/supabase/server'

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
  return partes
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(', ')
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

  const [att, pend, sales, stockCount] = await Promise.all([
    getAttentionCount(),
    getPendingReservationsCount(),
    getSalesReport({ days: 7 }),
    countActiveStock(pharmacy.id),
  ])

  const atencaoN = att.ok ? att.count : 0
  const restockN = att.ok ? att.restockItems?.length || 0 : 0
  const expiryN = att.ok ? att.expiryCount || 0 : 0
  const staleN = Math.max(0, atencaoN - restockN - expiryN)
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

      <p className="portal-page-hint">
        A sua página pública:{' '}
        <Link href={`/farmacia/${pharmacy.slug}`}>/farmacia/{pharmacy.slug}</Link>
      </p>
    </div>
  )
}
