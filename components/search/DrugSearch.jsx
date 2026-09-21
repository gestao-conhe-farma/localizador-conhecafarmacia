'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

const fmtKz = (n) =>
  new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n) + ' Kz'

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
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

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
      } catch {
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
      const orFilter = `name.ilike.%${q}%,molecule.ilike.%${q}%`
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
      setResults([...byDrug.values()])
    } catch {
      setError(
        'Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.'
      )
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
  const totalPharmacies = results
    ? results.reduce((acc, r) => acc + r.pharmacies.length, 0)
    : 0

  return (
    <div className="search-container">
      <h1 className="search-title">Que medicamento procura?</h1>
      <p className="search-sub">
        Stock confirmado pelas farmácias nas últimas 72 horas · Luanda
      </p>

      {/* Caixa de busca */}
      <div className="search-box" ref={boxRef}>
        <span className="search-box-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Ex.: insulina, carbamazepina…"
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

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

      {/* Filtro por município */}
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

      {/* Resultados */}
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

        {!loading && !error && results !== null && !hasResults && (
          <div className="empty-state">
            <p className="empty-title">Sem stock confirmado para &laquo;{query}&raquo;</p>
            <p className="empty-sub">
              Não há farmácias parceiras com este medicamento confirmado nas últimas 72
              horas. Estamos a crescer a rede — volte em breve.
            </p>
          </div>
        )}

        {!loading && hasResults && (
          <>
            <div className="results-head">
              <span className="results-count">
                <strong>{results.length}</strong> medicamento{results.length !== 1 && 's'}{' '}
                em <strong>{totalPharmacies}</strong> farmácia
                {totalPharmacies !== 1 && 's'}
                {municipio && <> em {municipio}</>}
              </span>
            </div>

            {results.map((r) => (
              <section key={r.drug_id} className="drug-result">
                <header className="drug-result-head">
                  <div>
                    <div className="drug-name">{r.drug_name}</div>
                    <div className="drug-meta">
                      {[r.drug_form, r.drug_dosage].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {r.drug_requires_rx && <span className="rx-badge">Receita médica</span>}
                </header>

                {r.pharmacies.map((p) => (
                  <div key={p.stock_item_id} className="pharmacy-row">
                    <div className="pharmacy-row-info">
                      <Link
                        href={`/farmacia/${p.pharmacy_slug}`}
                        className="pharmacy-row-name"
                      >
                        {p.pharmacy_name}
                      </Link>
                      <div className="pharmacy-row-addr">
                        {p.pharmacy_municipio}
                        {p.pharmacy_address ? ` · ${p.pharmacy_address}` : ''}
                      </div>
                    </div>

                    <div className="pharmacy-row-actions">
                      {p.price != null && (
                        <span className="stock-row-meta mr-1">{fmtKz(p.price)}</span>
                      )}
                      <span className="confirmed-badge" title={`Confirmado ${timeAgo(p.confirmed_at)}`}>
                        <span className="confirmed-dot" />
                        Confirmado {timeAgo(p.confirmed_at)}
                      </span>
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
                            `Olá! Vi no Localizador da Conheça Farmácia que têm ${r.drug_name} em stock. Podem confirmar, por favor?`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-mini btn-mini--wa"
                        >
                          WhatsApp
                        </a>
                      )}
                      <span className="btn-mini btn-mini--soon" title="Reservas chegando em breve">
                        Reservar · em breve
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}

        {results === null && !loading && !error && (
          <div className="empty-state">
            <p className="empty-sub">
              Escreva o nome do medicamento acima para ver as farmácias com stock
              confirmado.
            </p>
          </div>
        )}

        {/* CTA para farmácias */}
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
  )
}
