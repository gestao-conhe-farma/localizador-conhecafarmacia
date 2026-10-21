'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { isOpenNow, openStatus } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'
import ProductCard from '@/components/search/ProductCard'
import ProductModal from '@/components/search/ProductModal'
import { useProductSheet } from '@/components/search/useProductSheet'
import { defaultOption, freshness, priceOf, productHref, quantityText } from '@/lib/product-utils'
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

const ICON_CLOSE = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
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
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Modo pesquisa: o texto do hero recolhe e a caixa+filtros ficam no centro,
  // para os resultados terem o palco. Voltamos ao hero quando se limpa.
  const [searchMode, setSearchMode] = useState(false)
  // Caixa do hero fora do topo do ecrã → barra compacta fixa nos resultados.
  const [stuck, setStuck] = useState(false)
  // Ficha aberta em cartão sobre a lista — o id vive no URL (?produto=),
  // por isso o link é partilhável e o «voltar» do browser fecha o cartão.
  const { openId, open: openSheet, swap: swapSheet, close: closeSheet } = useProductSheet()
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const heroRef = useRef(null)
  const userActed = useRef(false)
  const reduced = useReducedMotion()

  // Sugestões: nomes de produtos E marcas — "Ben-u-ron" leva ao paracetamol.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const [{ data: drugs }, { data: brands }] = await Promise.all([
          supabase
            .from('drugs')
            .select('id, name, form, dosage')
            .eq('active', true)
            .ilike('name', `%${q}%`)
            .limit(8),
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

  // Refinar sem voltar ao hero: quando a caixa grande sai por cima do ecrã
  // (debaixo do header), entra uma barra compacta fixa com o mesmo termo.
  // O cálculo corre num rAF por scroll — mede a posição real, por isso
  // também acerta quando a lista muda de altura debaixo dos pés.
  useEffect(() => {
    // Sem pesquisa activa não há barra — o estado é reposto pelas acções
    // que saem do modo pesquisa (limpar / termo vazio).
    if (!searchMode) return
    let raf = 0
    const check = () => {
      raf = 0
      const el = boxRef.current
      if (!el) return
      // 72px = header fixo + folga: só conta quando a caixa já está
      // mesmo escondida por baixo do header. `scrollY > 80` evita um
      // flash durante a recolha suave do hero logo após pesquisar.
      setStuck(window.scrollY > 80 && el.getBoundingClientRect().bottom <= 72)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [searchMode, groups])

  const load = async (term, muni = municipio) => {
    setLoading(true)
    setError('')
    try {
      setGroups(await fetchGroups(String(term ?? '').trim(), muni))
    } catch (err) {
      logError('drug-search', 'Pesquisa falhou', { message: err?.message })
      setError('Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  const runSearch = async (term, muni = municipio) => {
    const q = String(term ?? query).trim()
    userActed.current = true
    setShowSuggest(false)
    inputRef.current?.blur()
    setSearchMode(Boolean(q))
    if (!q) setStuck(false)
    await load(q, muni)
  }

  // Limpar devolve o hero e a lista do que está confirmado agora — sem
  // mexer no município escolhido (isso é um filtro, não a pesquisa).
  const resetSearch = async () => {
    userActed.current = true
    setQuery('')
    setSuggestions([])
    setShowSuggest(false)
    setActiveIdx(-1)
    setSearchMode(false)
    setStuck(false)
    await load('', municipio)
  }

  // O ecrã acompanha a recolha/volta do hero: sem isto, quem pesquisa a
  // partir de baixo da página fica a olhar para o sítio errado.
  useEffect(() => {
    if (!userActed.current) return
    heroRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [searchMode, reduced])

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
    load(query, m)
  }

  const openProduct = (id) => {
    setShowSuggest(false)
    openSheet(id)
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
      if (searchMode) resetSearch()
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
      <section className={`shop-hero${searchMode ? ' shop-hero--searching' : ''}`} ref={heroRef}>
        <div className="cf-wrap">
          <AnimatePresence initial={false}>
            {!searchMode && (
              <motion.div
                key="hero-copy"
                className="hero-copy"
                initial={false}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  y: reduced ? 0 : -28,
                  transitionEnd: { display: 'none' },
                }}
                transition={{ duration: reduced ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="cf-kicker">O que precisa, onde está</p>
                <h1>
                  Procure o produto.
                  <br />
                  Nós dizemos <em>quem o tem.</em>
                </h1>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout
            className={`search-focus${searchMode ? ' search-focus--on' : ''}`}
            transition={{ duration: reduced ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="shop-search" ref={boxRef}>
              <div className="cf-field-wrap">
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
                    // Apagar o que se escreveu também limpa a pesquisa.
                    if (!v.trim() && searchMode) resetSearch()
                  }}
                  onFocus={() => setShowSuggest(true)}
                  onKeyDown={onKeyDown}
                />
                {query.trim() ? (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Limpar pesquisa"
                    onClick={resetSearch}
                  >
                    {ICON_CLOSE}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="search-go"
                  aria-label="Procurar"
                  title="Procurar"
                  onClick={() => runSearch()}
                >
                  {ICON_SEARCH}
                </button>
              </div>

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
          </motion.div>
        </div>
      </section>

      {/* Barra de refinação fixa — só com pesquisa activa e depois de a
          caixa do hero desaparecer por cima. Fluido o mesmo termo e as
          mesmas acções; o resultado actualiza-se no sítio. */}
      {searchMode && stuck && (
        <div className="sh-quick" role="search" aria-label="Refinar pesquisa">
          <div className="cf-wrap sh-quick-inner">
            <div className="cf-field-wrap sh-quick-field">
              <label className="cf-sr" htmlFor="q-quick">
                Procurar produto
              </label>
              <input
                id="q-quick"
                className="cf-field"
                type="search"
                value={query}
                placeholder="paracetamol, soro, fraldas…"
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runSearch()
                  } else if (e.key === 'Escape') {
                    e.currentTarget.blur()
                  }
                }}
              />
              {query.trim() ? (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Limpar pesquisa"
                  onClick={resetSearch}
                >
                  {ICON_CLOSE}
                </button>
              ) : null}
              <button
                type="button"
                className="search-go"
                aria-label="Procurar"
                title="Procurar"
                onClick={() => runSearch()}
              >
                {ICON_SEARCH}
              </button>
            </div>
            <span className="sh-quick-count">
              {visible === null
                ? 'a procurar…'
                : `${totalPharmacies} farmácia${totalPharmacies === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      )}

      <section className="sh-section">
        <div className="cf-wrap">
          <div className="sh-bar">
            <div className="sh-bar-l">
              <h2>{title}</h2>
              <span className="sh-bar-sub">
                {visible === null
                  ? 'a carregar…'
                  : `${totalPharmacies} farmácia${totalPharmacies === 1 ? ' confirma' : 's confirmam'} · ${
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
                      onOpen={openProduct}
                    />
                    {g.drug_requires_rx ? (
                      <p className="e-summary">Sujeito a receita médica.</p>
                    ) : null}
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
                              {[it.pharmacy_municipio, quantityText(it)]
                                .filter(Boolean)
                                .join(' · ')}
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
                            <Link
                              className="cf-btn cf-btn--ghost"
                              href={productHref(it.stock_item_id)}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                                e.preventDefault()
                                openProduct(it.stock_item_id)
                              }}
                            >
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
                O Localizador só mostra o que foi confirmado pela farmácia — 72 h para medicamentos,
                30 dias para parafarmácia. Se o produto não aparece, pode existir sem confirmação:
                ligue para a farmácia ou veja a rede completa.
              </p>
            </div>
            <Link className="cf-btn cf-btn--primary" href="/farmacia">
              Ver farmácias
            </Link>
          </div>
        </div>
      </section>

      {openId && <ProductModal stockItemId={openId} onClose={closeSheet} onOpenItem={swapSheet} />}
    </>
  )
}
