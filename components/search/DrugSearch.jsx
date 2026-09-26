'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isOpenNow } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'
import ReserveModal from '@/components/search/ReserveModal'
import {
  formatOptionLabel,
  formatPerBase,
  comparableOption,
  perBasePrice,
  unitLabel,
} from '@/lib/sale-options'

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

const fmtKz = (n) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n) + ' Kz'

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

export default function DrugSearch() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [municipio, setMunicipio] = useState('')
  const [results, setResults] = useState(null) // null = ainda não pesquisou
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Item com modal de reserva aberto (null = fechado).
  const [reserving, setReserving] = useState(null)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Stats do hero — contagens reais (farmácias activas + stock confirmado nas últimas 72 h)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString()
        const [ph, st] = await Promise.all([
          supabase
            .from('pharmacies')
            .select('slug', { count: 'exact', head: true })
            .eq('active', true),
          supabase
            .from('stock_confirmed')
            .select('stock_item_id', { count: 'exact', head: true })
            .gte('confirmed_at', since),
        ])
        if (!alive) return
        setStats({ pharmacies: ph.count ?? 0, items: st.count ?? 0 })
      } catch (err) {
        // stats são informativas — falham com log, sem bloquear a página
        logWarn('drug-search', 'Stats do hero falharam', { message: err?.message })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Autocomplete: nomes de medicamentos enquanto se escreve (mín. 2 chars)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('drugs')
          .select('id, name, form, dosage')
          .eq('active', true)
          .ilike('name', `%${q}%`)
          .limit(8)
        setSuggestions(data || [])
        setActiveIdx(-1)
      } catch (err) {
        logWarn('drug-search', 'Autocomplete falhou', { message: err?.message })
        setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Fecha o autocomplete ao clicar fora
  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowSuggest(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const runSearch = async (term) => {
    const q = (term ?? query).trim()
    if (!q) return
    setShowSuggest(false)
    inputRef.current?.blur()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      // Busca por nome OU molécula (ilike em ambas)
      const orFilter = `drug_name.ilike.%${q}%,drug_molecule.ilike.%${q}%`
      let req = supabase
        .from('stock_confirmed')
        .select('*')
        .or(orFilter)
        .order('drug_name')
        .order('pharmacy_name')
        .limit(200)
      if (municipio) req = req.eq('pharmacy_municipio', municipio)
      const { data, error: err } = await req
      if (err) throw err

      // Agrupar por medicamento
      const byDrug = new Map()
      for (const row of data || []) {
        const key = row.drug_id
        if (!byDrug.has(key)) {
          byDrug.set(key, {
            drug_id: row.drug_id,
            drug_name: row.drug_name,
            drug_form: row.drug_form,
            drug_dosage: row.drug_dosage,
            drug_requires_rx: row.drug_requires_rx,
            pharmacies: [],
          })
        }
        byDrug.get(key).pharmacies.push(row)
      }
      // Ordenar farmácias de cada medicamento: preço ascendente (sem preço
      // vai para o fim), desempate pela confirmação mais recente
      for (const r of byDrug.values()) {
        r.pharmacies.sort(
          (a, b) =>
            (a.price ?? Infinity) - (b.price ?? Infinity) ||
            new Date(b.confirmed_at) - new Date(a.confirmed_at),
        )
      }
      setResults([...byDrug.values()])
    } catch (err) {
      logError('drug-search', 'Pesquisa falhou', { message: err?.message })
      setError('Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.')
      setResults([])
    } finally {
      setLoading(false)
    }
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

  const hasResults = results && results.length > 0

  // Filtro "só abertas agora": pós-filtro local (sem novo pedido) —
  // farmácias fechadas/desconhecidas saem; grupos esvaziados desaparecem
  const shown = useMemo(() => {
    if (!results) return null
    if (!onlyOpen) return results
    return results
      .map((r) => ({
        ...r,
        pharmacies: r.pharmacies.filter((p) => isOpenNow(p.pharmacy_opening_hours)),
      }))
      .filter((r) => r.pharmacies.length > 0)
  }, [results, onlyOpen])

  const visible = shown || []
  const hasVisible = visible.length > 0
  const totalPharmacies = visible.reduce((acc, r) => acc + r.pharmacies.length, 0)

  return (
    <>
      {/* Hero — kicker editorial + título serif (Modelo F) */}
      <section className="search-hero">
        <div className="search-container">
          <p className="kicker">Localizador de Medicamentos · Luanda</p>
          <h1 className="search-hero-title">
            Encontre o medicamento <em>confirmado</em> há menos de 72 horas.
          </h1>
          <p className="search-hero-sub">
            Pesquise por nome ou molécula. Cada resultado vem de uma farmácia parceira que confirmou
            o stock recentemente.
          </p>
        </div>
      </section>

      {/* Busca + filtros — zona de "header" da página */}
      <section className="search-filter-section">
        <div className="search-container">
          <div className="search-box" ref={boxRef}>
            <span className="search-box-icon" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              placeholder="Insulina, carbamazepina, salbutamol…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggest(true)
              }}
              onFocus={() => setShowSuggest(true)}
              onKeyDown={onKeyDown}
              aria-label="Nome do medicamento"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setQuery('')
                  setResults(null)
                  setError('')
                  inputRef.current?.focus()
                }}
                aria-label="Limpar pesquisa"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <button type="button" className="search-go" onClick={() => runSearch()}>
              Pesquisar
            </button>

            {showSuggest && suggestions.length > 0 && (
              <div className="suggest-list" role="listbox">
                {suggestions.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`suggest-item${i === activeIdx ? ' suggest-item--active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(s.name)
                      runSearch(s.name)
                    }}
                  >
                    <span className="suggest-name">{s.name}</span>
                    <span className="suggest-meta">
                      {[s.form, s.dosage].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro por município + abertas agora */}
          <div className="chip-row" role="group" aria-label="Filtrar por município">
            <button
              type="button"
              className={`chip${municipio === '' ? ' chip--active' : ''}`}
              onClick={() => setMunicipio('')}
            >
              Todos
            </button>
            {MUNICIPIOS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${municipio === m ? ' chip--active' : ''}`}
                onClick={() => setMunicipio(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="chip-row" style={{ marginTop: '0.6rem' }}>
            <button
              type="button"
              className={`chip${onlyOpen ? ' chip--active' : ''}`}
              aria-pressed={onlyOpen}
              onClick={() => setOnlyOpen((o) => !o)}
            >
              Só abertas agora
            </button>
          </div>
        </div>
      </section>

      {/* Resultados — zona de conteúdo com fundo alternativo */}
      <section className="search-results-section">
        <div className="search-container">
          {/* Stats strip — visível apenas antes da primeira pesquisa,
              para dar espaço e destaque aos resultados */}
          {results === null && !loading && (
            <div className="stats-strip">
              <div className="stat">
                <b>{stats ? stats.pharmacies : '—'}</b>
                <span>farmácias parceiras</span>
              </div>
              <div className="stat">
                <b>{stats ? stats.items : '—'}</b>
                <span>medicamentos confirmados agora</span>
              </div>
              <div className="stat">
                <b>72 h</b>
                <span>idade máxima do stock</span>
              </div>
              <div className="stat">
                <b>{MUNICIPIOS.length}</b>
                <span>municípios cobertos</span>
              </div>
            </div>
          )}

          <div className="mt-2">
            {loading && (
              <div className="empty-state" role="status">
                <div className="spinner" />
                <p className="text-sm text-brand-deep/50 mt-3">A pesquisar…</p>
              </div>
            )}

            {!loading && error && (
              <div className="empty-state" role="alert">
                <p className="empty-title">Algo falhou</p>
                <p className="empty-sub">{error}</p>
              </div>
            )}

            {!loading && !error && results !== null && !hasVisible && (
              <div className="empty-state">
                <p className="empty-title">
                  {onlyOpen && hasResults
                    ? 'Nenhuma das farmácias com este medicamento está aberta agora'
                    : `Sem stock confirmado para «${query}»`}
                </p>
                <p className="empty-sub">
                  {onlyOpen && hasResults
                    ? 'Desactive o filtro «só abertas agora» para ver todas — ou confirme por WhatsApp antes de sair.'
                    : 'Não há farmácias parceiras com este medicamento confirmado nas últimas 72 horas. Estamos a crescer a rede — volte em breve.'}
                </p>
              </div>
            )}

            {!loading && hasVisible && (
              <>
                <div className="results-head">
                  <span className="results-count">
                    <strong>{visible.length}</strong> medicamento{visible.length !== 1 && 's'} em{' '}
                    <strong>{totalPharmacies}</strong> farmácia
                    {totalPharmacies !== 1 && 's'}
                    {municipio && <> em {municipio}</>}
                    {onlyOpen && <> · abertas agora</>}
                  </span>
                </div>

                {visible.map((r) => (
                  <section key={r.drug_id} className="drug-block">
                    <div className="results-head">
                      <h2 className="drug-title">{r.drug_name}</h2>
                      <span className="results-count">
                        {[r.drug_form, r.drug_dosage].filter(Boolean).join(' · ')}
                        {' — '}
                        <strong>{r.pharmacies.length}</strong> farmácia
                        {r.pharmacies.length !== 1 && 's'}
                        {r.drug_requires_rx && (
                          <span className="rx-badge rx-badge--inline">Receita médica</span>
                        )}
                      </span>
                    </div>

                    {r.pharmacies.map((p, pi) => {
                      // Opções de venda (0012): etiquetas por forma de venda.
                      // Melhor preço só compara a MESMA unidade (a default).
                      const opts = p.sale_options || []
                      const baseOpt = opts.find((o) => o.is_default)
                      const baseLabel = baseOpt ? unitLabel(baseOpt.unit) : null
                      // Preço normalizado (Kz por unidade-base): compara
                      // lâmina com caixa de forma justa — quem tem o menor
                      // Kz/un. leva o selo, mesmo com unidades diferentes.
                      const cmpPer = perBasePrice(comparableOption(opts))
                      const bestPer = perBasePrice(comparableOption(r.pharmacies[0]?.sale_options))
                      const sameUnit = bestPer != null && cmpPer != null && r.pharmacies.length > 1
                      return (
                        <div key={p.stock_item_id} className="drug-card">
                          <div className="drug-card-main">
                            <Link href={`/farmacia/${p.pharmacy_slug}`} className="drug-card-name">
                              {p.pharmacy_name}
                            </Link>
                            {pi === 0 && sameUnit && cmpPer <= bestPer && (
                              <span
                                className="best-price"
                                title={`Preço mais baixo por ${baseLabel || 'unidade'} entre as farmácias com stock`}
                              >
                                Melhor preço
                              </span>
                            )}
                            <div className="drug-card-meta">
                              {p.pharmacy_municipio}
                              {p.pharmacy_address ? ` · ${p.pharmacy_address}` : ''} ·{' '}
                              <span className="fresh">confirmado {timeAgo(p.confirmed_at)}</span>
                            </div>
                          </div>

                          <div className="drug-card-side">
                            {opts.length > 0 ? (
                              <div className="sale-tags">
                                {opts.map((o) => {
                                  const per = formatPerBase(o, baseLabel)
                                  return (
                                    <span key={o.id} className="sale-tag">
                                      {formatOptionLabel(o, baseLabel)}
                                      {o.price != null && <b> · {fmtKz(o.price)}</b>}
                                      {per && <i> {per}</i>}
                                    </span>
                                  )
                                })}
                              </div>
                            ) : (
                              p.price != null && <span className="price">{fmtKz(p.price)}</span>
                            )}
                            {p.pharmacy_phone && (
                              <a
                                href={`tel:${p.pharmacy_phone.replace(/\s/g, '')}`}
                                className="btn-mini btn-mini--phone"
                              >
                                Ligar
                              </a>
                            )}
                            {p.pharmacy_whatsapp && (
                              <a
                                href={`https://wa.me/${p.pharmacy_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `Olá! Vi no Localizador da Conheça Farmácia que têm ${r.drug_name} em stock. Podem confirmar, por favor?`,
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-mini btn-mini--wa"
                              >
                                WhatsApp
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-mini btn-mini--wa"
                              title="Reservar e levantar na farmácia"
                              onClick={() => setReserving(p)}
                            >
                              Reservar
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </section>
                ))}
              </>
            )}

            {results === null && !loading && !error && (
              <div className="empty-state">
                <p className="empty-sub">
                  Escreva o nome do medicamento acima para ver as farmácias com stock confirmado.
                </p>
              </div>
            )}

            {/* CTA para farmácias */}
            {reserving && <ReserveModal item={reserving} onClose={() => setReserving(null)} />}

            <div className="search-cta">
              <p className="search-cta-title">É farmácia e não aparece na lista?</p>
              <p className="search-cta-sub">
                Junte-se às parceiras do lançamento e seja encontrado por quem precisa —
                gratuitamente.
              </p>
              <a href="/#farmacias" className="btn btn-primary">
                Quero participar
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
