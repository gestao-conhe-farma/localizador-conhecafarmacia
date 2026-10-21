'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isOpenNow, openStatus } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'
import ProductCard from '@/components/search/ProductCard'
import {
  defaultOption,
  freshness,
  priceOf,
  productHref,
  quantityText,
} from '@/lib/product-utils'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'

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

const SUGESTOES = ['paracetamol', 'soro fisiológico', 'fraldas', 'insulina', 'amoxicilina']

const ICON_SEARCH = (
  <svg
    width="18"
    height="18"
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
 * Ordena as farmácias de um produto e calcula o intervalo de preço e o
 * item que representa o cartão. Recalculado depois dos filtros locais,
 * para o cartão nunca mostrar o preço de uma farmácia já escondida.
 */
function summarize(items) {
  const sorted = [...items].sort(
    (a, b) =>
      (defaultOption(a)?.price ?? a.price ?? Infinity) -
        (defaultOption(b)?.price ?? b.price ?? Infinity) ||
      new Date(b.confirmed_at) - new Date(a.confirmed_at),
  )
  const prices = sorted
    .map((it) => defaultOption(it)?.price ?? it.price)
    .filter((p) => p != null)
    .map(Number)
  const priceLabel =
    prices.length === 0
      ? null
      : Math.min(...prices) === Math.max(...prices)
        ? fmtKz(Math.min(...prices))
        : `${fmtKz(Math.min(...prices)).replace(' Kz', '')} – ${fmtKz(Math.max(...prices))}`
  return { items: sorted, cheapest: sorted[0], priceLabel }
}

/** Junta as linhas de stock por produto — a lista compara farmácias. */
function groupByDrug(rows) {
  const byDrug = new Map()
  for (const row of rows || []) {
    if (!byDrug.has(row.drug_id)) {
      byDrug.set(row.drug_id, {
        drug_id: row.drug_id,
        drug_name: row.drug_name,
        drug_form: row.drug_form,
        drug_dosage: row.drug_dosage,
        drug_molecule: row.drug_molecule,
        drug_kind: row.drug_kind,
        drug_requires_rx: row.drug_requires_rx,
        items: [],
      })
    }
    byDrug.get(row.drug_id).items.push(row)
  }
  return [...byDrug.values()]
    .map((g) => ({ ...g, ...summarize(g.items) }))
    .sort(
      (a, b) =>
        String(a.drug_name).localeCompare(String(b.drug_name), 'pt') ||
        String(a.drug_dosage || '').localeCompare(String(b.drug_dosage || ''), 'pt'),
    )
}

/**
 * Query única da busca — usada na primeira visita (sem termo) e em cada
 * pesquisa. Vive fora do componente para o efeito de arranque não depender
 * de uma função recriada a cada render.
 */
async function fetchGroups(term, municipio) {
  const supabase = createClient()
  let req = supabase
    .from('stock_confirmed')
    .select('*')
    .order('drug_name')
    .order('pharmacy_name')
    .limit(200)
  if (term) {
    req = req.or(`drug_name.ilike.%${term}%,drug_molecule.ilike.%${term}%,brand.ilike.%${term}%`)
  }
  if (municipio) req = req.eq('pharmacy_municipio', municipio)
  const { data, error } = await req
  if (error) throw error
  return groupByDrug(data)
}

export default function DrugSearch() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [municipio, setMunicipio] = useState('')
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Contagens reais do hero — farmácias activas e produtos visíveis.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const [ph, st] = await Promise.all([
          supabase.from('pharmacies').select('slug', { count: 'exact', head: true }).eq('active', true),
          supabase.from('stock_confirmed').select('stock_item_id', { count: 'exact', head: true }),
        ])
        if (!alive) return
        setStats({ pharmacies: ph.count ?? 0, items: st.count ?? 0 })
      } catch (err) {
        logWarn('drug-search', 'Stats do hero falharam', { message: err?.message })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Sugestões: nomes de produtos E marcas — "Ben-u-ron" leva ao paracetamol.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const [{ data: drugs }, { data: brands }] = await Promise.all([
          supabase.from('drugs').select('id, name, form, dosage').eq('active', true).ilike('name', `%${q}%`).limit(8),
          supabase.from('stock_confirmed').select('brand').ilike('brand', `%${q}%`).limit(30),
        ])
        const brandList = [...new Set((brands || []).map((b) => b.brand))]
          .filter(Boolean)
          .slice(0, 4)
          .map((b) => ({ kind: 'brand', name: b }))
        setSuggestions([...brandList, ...(drugs || []).map((d) => ({ kind: 'drug', ...d }))])
        setActiveIdx(-1)
      } catch (err) {
        logWarn('drug-search', 'Autocomplete falhou', { message: err?.message })
        setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowSuggest(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const runSearch = async (term, muni = municipio) => {
    const q = String(term ?? query).trim()
    setShowSuggest(false)
    inputRef.current?.blur()
    setLoading(true)
    setError('')
    try {
      setGroups(await fetchGroups(q, muni))
    } catch (err) {
      logError('drug-search', 'Pesquisa falhou', { message: err?.message })
      setError('Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  // Primeira visita: mostra o que está confirmado agora, em vez de uma
  // página vazia à espera que o cliente escreva.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const initial = await fetchGroups('', '')
        if (alive) setGroups(initial)
      } catch (err) {
        logError('drug-search', 'Carga inicial falhou', { message: err?.message })
        if (alive) {
          setError('Não foi possível carregar os produtos confirmados. Tente novamente.')
          setGroups([])
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const chooseMunicipio = (m) => {
    setMunicipio(m)
    runSearch(query, m)
  }

  const onKeyDown = (e) => {
    if (!showSuggest || !suggestions.length) {
      if (e.key === 'Enter') runSearch()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0) {
        setQuery(suggestions[activeIdx].name)
        runSearch(suggestions[activeIdx].name)
      } else {
        runSearch()
      }
    } else if (e.key === 'Escape') {
      setShowSuggest(false)
    }
  }

  // Filtro local: "abertas agora" não pede novo fetch (o horário já veio).
  const visible = useMemo(() => {
    if (!groups) return null
    if (!onlyOpen) return groups
    return groups
      .map((g) => {
        const live = summarize(g.items.filter((it) => isOpenNow(it.pharmacy_opening_hours)))
        return live.items.length === 0 ? null : { ...g, ...live }
      })
      .filter(Boolean)
  }, [groups, onlyOpen])

  const totalPharmacies = (visible || []).reduce((n, g) => n + g.items.length, 0)
  const title = query.trim()
    ? query.trim().charAt(0).toUpperCase() + query.trim().slice(1)
    : 'Confirmado agora'

  return (
    <>
      <section className="shop-hero">
        <div className="cf-wrap shop-hero-grid">
          <div>
            <p className="cf-kicker">O que precisa, onde está</p>
            <h1>
              Procure o produto.
              <br />
              Nós dizemos <em>quem o tem.</em>
            </h1>
            <p>
              Em vez de abrir sete farmácias para descobrir que nenhuma tem o que procura, comece
              pelo produto. A lista compara preço, frescura e portas abertas entre as farmácias da
              rede.
            </p>
          </div>
          <aside>
            <b className="cf-num">{stats ? stats.items : '—'}</b>
            produtos confirmados agora
            {stats ? `, em ${stats.pharmacies} farmácia${stats.pharmacies === 1 ? '' : 's'}` : ''}.
            Preços de balcão, em kwanzas — sem taxas nem entrega.
          </aside>
        </div>

        <div className="cf-wrap">
          <div className="shop-search" ref={boxRef}>
            <div className="cf-field-wrap">
              <span className="cf-ico" aria-hidden="true">
                {ICON_SEARCH}
              </span>
              <label className="cf-sr" htmlFor="q">
                Procurar produto
              </label>
              <input
                id="q"
                ref={inputRef}
                className="cf-field"
                type="search"
                value={query}
                placeholder="paracetamol, soro, fraldas…"
                autoComplete="off"
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  if (v.trim().length < 2) setSuggestions([])
                  setShowSuggest(true)
                }}
                onFocus={() => setShowSuggest(true)}
                onKeyDown={onKeyDown}
              />
            </div>
            <button type="button" className="cf-btn cf-btn--primary" onClick={() => runSearch()}>
              Procurar
            </button>

            {showSuggest && suggestions.length > 0 && (
              <div className="suggest" role="listbox">
                {suggestions.map((s, i) => (
                  <button
                    key={s.kind === 'brand' ? `brand-${s.name}` : s.id}
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`suggest-item${i === activeIdx ? ' suggest-item--on' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(s.name)
                      runSearch(s.name)
                    }}
                  >
                    <span className="suggest-name">{s.name}</span>
                    <span className="suggest-meta">
                      {s.kind === 'brand'
                        ? 'marca'
                        : [s.form, s.dosage].filter(Boolean).join(' · ') || 'produto'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shop-suggest">
            <span>Sugestões:</span>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuery(s)
                  runSearch(s)
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="sh-toolbar" role="group" aria-label="Filtrar por município">
            <button
              type="button"
              className={`cf-chip${municipio === '' ? ' cf-chip--on' : ''}`}
              onClick={() => chooseMunicipio('')}
            >
              Todos
            </button>
            {MUNICIPIOS.map((m) => (
              <button
                key={m}
                type="button"
                className={`cf-chip${municipio === m ? ' cf-chip--on' : ''}`}
                onClick={() => chooseMunicipio(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sh-section">
        <div className="cf-wrap">
          <div className="sh-bar">
            <div className="sh-bar-l">
              <h2>{title}</h2>
              <span className="sh-bar-sub">
                {visible === null
                  ? 'a carregar…'
                  : `${totalPharmacies} farmácia${totalPharmacies === 1 ? '' : 's'} confirmam · ${
                      visible.length
                    } apresenta${visible.length === 1 ? 'ção' : 'ções'}`}
                {municipio ? ` · ${municipio}` : ''}
              </span>
            </div>
            <div className="sh-filters" role="group" aria-label="Filtros">
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

          {error && (
            <div className="sh-empty" role="alert">
              <p className="sh-empty-title">Algo falhou</p>
              <p className="sh-empty-sub">{error}</p>
            </div>
          )}

          {!error && visible === null && (
            <div className="sh-empty" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A procurar stock confirmado…</p>
            </div>
          )}

          {!error && visible !== null && visible.length === 0 && (
            <div className="sh-empty">
              <p className="sh-empty-title">
                {onlyOpen
                  ? 'Nenhuma destas farmácias está aberta agora'
                  : `Sem stock confirmado para «${query.trim() || municipio}»`}
              </p>
              <p className="sh-empty-sub">
                {onlyOpen
                  ? 'Desactive o filtro para ver todas — ou confirme por WhatsApp antes de sair.'
                  : 'Medicamentos confirmados nas últimas 72 h e parafarmácia nos últimos 30 dias. Experimente o princípio activo sem dosagem, ou veja as farmácias da rede.'}
              </p>
              <p style={{ marginTop: 16 }}>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias
                </Link>
              </p>
            </div>
          )}

          {!error && visible !== null && visible.length > 0 && (
            <div className="e-groups">
              {visible.map((g) => (
                <article key={g.drug_id} className="e-group">
                  <div>
                    <ProductCard
                      item={g.cheapest}
                      flat
                      ctaLabel="Ver ficha completa"
                      priceLabel={g.priceLabel || undefined}
                    />
                    <p className="e-summary">
                      {g.drug_requires_rx ? 'Sujeito a receita médica. ' : ''}
                      {g.drug_molecule ? `Princípio activo: ${g.drug_molecule}. ` : ''}
                      {g.items.length === 1
                        ? 'Uma farmácia tem este produto confirmado agora.'
                        : `${g.items.length} farmácias confirmaram este produto — compare frescura e preço antes de sair.`}
                    </p>
                  </div>

                  <div className="e-rows">
                    <div className="e-head">
                      <span>Farmácia</span>
                      <span>Horário</span>
                      <span>Confirmação</span>
                      <span style={{ textAlign: 'right' }}>Preço</span>
                      <span />
                    </div>
                    {g.items.map((it) => {
                      const st = openStatus(it.pharmacy_opening_hours)
                      const price = priceOf(it)
                      return (
                        <div key={it.stock_item_id} className="e-row">
                          <div className="e-who">
                            <b>{it.pharmacy_name}</b>
                            <span>
                              {[it.pharmacy_municipio, quantityText(it)].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          <span className="e-hrs">
                            <i className={`cf-dot${st && !st.open ? ' cf-dot--off' : ''}`} />
                            {st ? st.label : it.pharmacy_opening_hours || 'Horário não indicado'}
                          </span>
                          <span className="e-fresh">
                            <i className="cf-dot" />
                            {freshness(it.confirmed_at) || 'agora'}
                          </span>
                          <span className="e-price price">{price.label}</span>
                          <span className="e-go">
                            <Link className="cf-btn cf-btn--ghost" href={productHref(it.stock_item_id)}>
                              {it.reservable === false ? 'Ver ficha' : 'Reservar'}
                            </Link>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="sh-cta">
            <div>
              <h3>Não encontra o que procura?</h3>
              <p>
                O Localizador só mostra o que foi confirmado pela farmácia — 72 h para
                medicamentos, 30 dias para parafarmácia. Se o produto não aparece, pode existir sem
                confirmação: ligue para a farmácia ou veja a rede completa.
              </p>
            </div>
            <Link className="cf-btn cf-btn--primary" href="/farmacia">
              Ver farmácias
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
