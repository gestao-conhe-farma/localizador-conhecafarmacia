'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { openStatus } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'

const MUNICIPIOS = [
  'Belas',
  'Cacuaco',
  'Cazenga',
  'Ícolo e Bengo',
  'Luanda',
  'Quilamba Quiaxi',
  'Quissama',
  'Talatona',
  'Viana',
]

const ICON_SEARCH = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

/**
 * Cartão de farmácia no desenho de loja (Modelo D): a "montra" é
 * tipográfica — nome, município e quantos produtos estão confirmados —
 * em vez de uma foto que não temos. A acção leva à prateleira.
 */
function StoreCard({ pharmacy, count }) {
  const status = openStatus(pharmacy.opening_hours)
  const open = status?.open
  return (
    <Link
      href={`/farmacia/${pharmacy.slug}`}
      className="pcard"
      aria-label={`${pharmacy.name} — ver prateleira`}
    >
      <div className="pcard-media">
        <div className="pcard-flags">
          {pharmacy.verified && <span className="tagchip">Verificada</span>}
          {count > 0 ? (
            <span className="tagchip">{count} em stock</span>
          ) : (
            <span className="tagchip">Sem stock</span>
          )}
        </div>
        <div className="pack">
          <span className="pack-brand">Farmácia parceira</span>
          <span className="pack-name">{pharmacy.name}</span>
          <span className="pack-dose">{pharmacy.municipio || 'Luanda'}</span>
          <span className="pack-foot">
            <span>{pharmacy.municipio || 'Luanda'}</span>
            <span>{count > 0 ? 'Confirmado hoje' : 'Aguarda stock'}</span>
          </span>
        </div>
      </div>

      <div className="pcard-body">
        <span className="pcard-name">{pharmacy.name}</span>
        <span className="pcard-meta">
          {[pharmacy.municipio, pharmacy.address].filter(Boolean).join(' · ')}
        </span>
        <div className="pcard-pricerow">
          <div>
            <span className="price" style={{ fontSize: 15 }}>
              {count > 0
                ? `${count} produto${count === 1 ? '' : 's'} confirmado${count === 1 ? '' : 's'}`
                : 'Sem stock confirmado'}
            </span>
            <div className="pcard-unit">{pharmacy.opening_hours || 'Horário não indicado'}</div>
          </div>
          <span className="pcard-fresh">
            <i className={`cf-dot${status && !open ? ' cf-dot--off' : ''}`} />
            {status ? (open ? 'Aberta' : 'Fechada') : 'Horário'}
          </span>
        </div>
      </div>

      <span className={`pcard-cta${count === 0 ? ' pcard-cta--quiet' : ''}`}>
        {count > 0 ? 'Ver prateleira' : 'Ver farmácia'} <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

export default function PharmacyList() {
  const [pharmacies, setPharmacies] = useState(null)
  const [counts, setCounts] = useState({})
  const [municipio, setMunicipio] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const phRes = await supabase
          .from('pharmacies')
          .select('slug, name, municipio, address, phone, whatsapp, opening_hours, verified')
          .eq('active', true)
          .order('name')
        if (phRes.error) throw phRes.error
        if (!alive) return

        // Contagens via RPC (agregação no Postgres). Fallback: ler a view
        // stock_confirmed e contar no cliente, até a migração 0003 estar
        // aplicada no projecto Supabase.
        const c = {}
        const rpcRes = await supabase.rpc('pharmacy_stock_counts')
        if (!rpcRes.error) {
          for (const row of rpcRes.data || []) c[row.pharmacy_slug] = Number(row.stock_count)
        } else {
          logWarn('pharmacy-list', 'RPC pharmacy_stock_counts falhou — a usar fallback', {
            message: rpcRes.error.message,
          })
          const stRes = await supabase.from('stock_confirmed').select('pharmacy_slug')
          if (stRes.error) throw stRes.error
          for (const row of stRes.data || []) {
            c[row.pharmacy_slug] = (c[row.pharmacy_slug] || 0) + 1
          }
        }
        if (!alive) return
        setPharmacies(phRes.data || [])
        setCounts(c)
      } catch (err) {
        logError('pharmacy-list', 'Falha ao carregar farmácias', { message: err?.message })
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const visible = useMemo(() => {
    if (!pharmacies) return []
    const q = query.trim().toLowerCase()
    const list = pharmacies.filter(
      (p) =>
        (!municipio || p.municipio === municipio) &&
        (!onlyOpen || openStatus(p.opening_hours)?.open === true) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.municipio || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)),
    )
    // Com stock primeiro, depois ordem alfabética.
    return [...list].sort(
      (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) || a.name.localeCompare(b.name, 'pt'),
    )
  }, [pharmacies, counts, municipio, onlyOpen, query])

  const withStock = visible.filter((p) => (counts[p.slug] || 0) > 0).length

  return (
    <>
      <section className="shop-hero">
        <div className="cf-wrap shop-hero-grid">
          <div>
            <p className="cf-kicker">A rede</p>
            <h1>
              Farmácias que dizem <em>o que têm.</em>
            </h1>
            <p>
              Cada farmácia desta lista confirma o próprio stock: o que aparece está na prateleira,
              e o que deixa de ser confirmado sai do ar. Escolha a mais perto e veja o que está
              disponível hoje.
            </p>
          </div>
          <aside>
            <b className="cf-num">{pharmacies ? pharmacies.length : '—'}</b>
            farmácias parceiras em Luanda. {pharmacies ? withStock : '—'} com stock confirmado
            agora — 72 h para medicamentos, 30 dias para parafarmácia.
          </aside>
        </div>
      </section>

      <section className="sh-section">
        <div className="cf-wrap">
          <div className="sh-bar" style={{ marginTop: 0 }}>
            <div className="sh-bar-l">
              <h2>Prateleiras da rede</h2>
              <span className="sh-bar-sub">
                {pharmacies === null
                  ? 'a carregar…'
                  : `${visible.length} farmácia${visible.length === 1 ? '' : 's'}${
                      municipio ? ` em ${municipio}` : ' em Luanda'
                    } · ${withStock} com stock confirmado agora`}
              </span>
            </div>
            <div className="sh-filters">
              <button
                type="button"
                className={`cf-chip${!onlyOpen ? ' cf-chip--on' : ''}`}
                onClick={() => setOnlyOpen(false)}
              >
                Todas
              </button>
              <button
                type="button"
                className={`cf-chip${onlyOpen ? ' cf-chip--on' : ''}`}
                aria-pressed={onlyOpen}
                onClick={() => setOnlyOpen((o) => !o)}
              >
                Abertas agora
              </button>
            </div>
          </div>

          <div className="shelf-head" style={{ borderBottom: 0, marginTop: 18 }}>
            <div className="cf-field-wrap">
              <span className="cf-ico" aria-hidden="true">
                {ICON_SEARCH}
              </span>
              <label className="cf-sr" htmlFor="q-store">
                Procurar farmácia
              </label>
              <input
                id="q-store"
                className="cf-field"
                type="search"
                placeholder="Nome, município ou morada"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="sh-filters">
              <button
                type="button"
                className={`cf-chip${municipio === '' ? ' cf-chip--on' : ''}`}
                onClick={() => setMunicipio('')}
              >
                Todos os municípios
              </button>
              {MUNICIPIOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`cf-chip${municipio === m ? ' cf-chip--on' : ''}`}
                  onClick={() => setMunicipio(municipio === m ? '' : m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="sh-empty" role="alert">
              <p className="sh-empty-title">Algo falhou</p>
              <p className="sh-empty-sub">
                Não foi possível carregar a lista de farmácias. Tente novamente.
              </p>
            </div>
          )}

          {!error && pharmacies === null && (
            <div className="sh-empty" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A carregar farmácias…</p>
            </div>
          )}

          {!error && pharmacies !== null && visible.length === 0 && (
            <div className="sh-empty">
              <p className="sh-empty-title">
                {onlyOpen
                  ? `Nenhuma farmácia aberta agora${municipio ? ` em ${municipio}` : ''}`
                  : `Ainda não há farmácias em ${municipio || 'Luanda'}`}
              </p>
              <p className="sh-empty-sub">
                {onlyOpen
                  ? 'Desactive o filtro para ver toda a rede — ou confirme por WhatsApp antes de sair.'
                  : 'Estamos a crescer a rede — a sua zona será coberta em breve.'}
              </p>
            </div>
          )}

          {!error && pharmacies !== null && visible.length > 0 && (
            <div className="pcard-grid" style={{ marginTop: 26 }}>
              {visible.map((p) => (
                <StoreCard key={p.slug} pharmacy={p} count={counts[p.slug] || 0} />
              ))}
            </div>
          )}

          <div className="sh-cta">
            <div>
              <h3>É farmácia e não aparece nesta lista?</h3>
              <p>
                As parceiras do lançamento confirmam o stock no portal em segundos e aparecem aqui
                de imediato — gratuitamente. O Localizador é um serviço da Conheça Farmácia.
              </p>
            </div>
            <Link className="cf-btn cf-btn--primary" href="/#farmacias">
              Quero participar
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
