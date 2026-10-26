'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { isOpenNow } from '@/lib/opening-hours'
import { ORIGIN_FILTERS, originGroup } from '@/lib/origin-flags'
import { logError, logWarn } from '@/lib/log'
import ProductModal from '@/components/search/ProductModal'
import VariantCard from '@/components/search/VariantCard'
import VariantSheet from '@/components/search/VariantSheet'
import { useProductSheet } from '@/components/search/useProductSheet'
import { useVariantSheet } from '@/components/search/useVariantSheet'
import { useStuckBar } from '@/components/search/useStuckBar'
import { defaultOption } from '@/lib/product-utils'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'
import { clearStoredLocation, geolocationErrorMessage, requestBrowserLocation } from '@/lib/geo'
import { groupVariants, nearestDistance, sortVariants } from '@/lib/variants'
import {
  KIND_IDS,
  MEDICINE_CATEGORIES,
  PARAPHARMACY_TYPES,
  PROVINCIAS,
  categoriaLabel,
  categoriasParaPesquisa,
  kindLabel,
  melhorCategoria,
  municipiosDaProvincia,
  normalizarTexto,
  subcategoriasDe,
} from '@/lib/constants'

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
async function fetchGroups(term, municipio, provincia) {
  const supabase = createClient()
  let req = supabase
    .from('stock_confirmed')
    .select('*')
    .order('drug_name')
    .order('pharmacy_name')
    .limit(500)
  if (term) {
    req = req.or(`drug_name.ilike.%${term}%,drug_molecule.ilike.%${term}%,brand.ilike.%${term}%`)
  }
  // Província é o primeiro filtro: sem município escolhido, restringe à
  // lista de municípios dela. Com município, o `eq` é mais estreito.
  if (municipio) req = req.eq('pharmacy_municipio', municipio)
  else if (provincia) req = req.in('pharmacy_municipio', municipiosDaProvincia(provincia))
  const { data, error } = await req
  if (error) throw error
  return groupByDrug(data)
}

export default function DrugSearch() {
  // A homepage entrega o termo no URL (?q=) e as categorias em ?tipo=.
  // Ler aqui é o que faz o link «paracetamol» da homepage cair já com
  // resultados, em vez de uma página vazia à espera de ser escrita.
  const params = useSearchParams()
  const initialQuery = (params.get('q') || '').trim()
  const tipoParam = params.get('tipo') || ''
  const categoriaParam = params.get('categoria') || ''
  const subParam = params.get('sub') || ''
  // Um termo que é uma categoria (?q=febre) entra logo como filtro: não é
  // uma pesquisa por nome. Resolve-se no primeiro render para o efeito de
  // arranque não ter de chamar setState.
  const grupoInicial = initialQuery ? melhorCategoria(initialQuery) : null
  const tipoInicial =
    (KIND_IDS.includes(tipoParam) ? tipoParam : '') ||
    (grupoInicial?.tipo === 'tipo' ? grupoInicial.id : '') ||
    (grupoInicial?.tipo === 'sub' ? grupoInicial.kind : '') ||
    ''
  const categoriaInicial =
    categoriaParam || (grupoInicial?.tipo === 'categoria' ? grupoInicial.id : '')
  const subInicial = subParam || (grupoInicial?.tipo === 'sub' ? grupoInicial.id : '')
  const [query, setQuery] = useState(grupoInicial ? '' : initialQuery)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [provincia, setProvincia] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Categoria vinda da homepage: filtro local, como «abertas agora».
  const [kind, setKind] = useState(tipoInicial)
  // Área clínica (medicamentos) e subcategoria (parafarmácia) — também
  // vindas do URL, para os cards da homepage abrirem já filtrados.
  const [categoria, setCategoria] = useState(categoriaInicial)
  const [sub, setSub] = useState(subInicial)
  // Nada é pedido à base de dados até haver uma acção (pesquisar, filtrar
  // ou escolher uma sugestão): em 3G a entrada na página é instantânea.
  const [started, setStarted] = useState(
    Boolean(initialQuery) ||
      Boolean(tipoInicial) ||
      Boolean(categoriaInicial) ||
      Boolean(subInicial),
  )
  // Origem do medicamento: filtro local ('' = todas). Cada farmácia declara
  // a origem no portal, por isso o mesmo produto pode aparecer em grupos
  // diferentes — filtra-se ao nível da linha, não do medicamento.
  const [origin, setOrigin] = useState('')
  // Os filtros vivem num painel: a barra mostra só «Filtros» (com o número
  // de activos), a ordem e os chips do que está aplicado.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState('nome')
  // Posição do cliente — permite mostrar a distância no card e ordenar as
  // farmácias por proximidade. Começa vazia para o HTML do servidor e o do
  // browser coincidirem; só é preenchida depois de um gesto («Perto de mim»).
  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  // Modo pesquisa: o texto do hero recolhe e a caixa+filtros ficam no centro,
  // para os resultados terem o palco. Voltamos ao hero quando se limpa.
  const [searchMode, setSearchMode] = useState(Boolean(initialQuery))
  // Ficha aberta em cartão sobre a lista — o id vive no URL (?produto=),
  // por isso o link é partilhável e o «voltar» do browser fecha o cartão.
  const { openId, open: openSheet, swap: swapSheet, close: closeSheet } = useProductSheet()
  // Lista de farmácias de uma variante (marca + dosagem) — passo anterior à
  // ficha do item concreto, com URL própria para o «voltar» funcionar.
  const {
    drugId: varianteId,
    brandKey: marcaAberta,
    open: openVariantSheet,
    close: closeVariantSheet,
  } = useVariantSheet()
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const heroRef = useRef(null)
  const userActed = useRef(false)
  const reduced = useReducedMotion()
  // Caixa do hero fora do topo do ecrã → barra compacta fixa nos resultados.
  const stuck = useStuckBar(boxRef)

  // Sugestões: nomes de produtos E marcas — "Ben-u-ron" leva ao paracetamol.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Categorias primeiro e SEM esperar pela base de dados: escrever
      // «febre» ou «bebé» tem de dar sugestão mesmo numa rede lenta —
      // é uma lista local.
      const needle = normalizarTexto(q)
      const grupos = categoriasParaPesquisa()
        .filter((c) => normalizarTexto(c.label).includes(needle))
        .slice(0, 4)
        .map((c) => ({ suggestionKind: 'grupo', ...c }))
      if (grupos.length > 0) {
        setSuggestions(grupos)
        setActiveIdx(-1)
      }
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
        setSuggestions([
          ...grupos,
          ...brandList,
          ...(drugs || []).map((d) => ({ kind: 'drug', ...d })),
        ])
        setActiveIdx(-1)
      } catch (err) {
        logWarn('drug-search', 'Autocomplete falhou', { message: err?.message })
        // Falha de rede não pode apagar a sugestão de categoria que já
        // está no ecrã.
        if (grupos.length === 0) setSuggestions([])
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

  const load = async (term, muni = municipio, prov = provincia) => {
    setLoading(true)
    setStarted(true)
    setError('')
    try {
      setGroups(await fetchGroups(String(term ?? '').trim(), muni, prov))
    } catch (err) {
      logError('drug-search', 'Pesquisa falhou', { message: err?.message })
      setError('Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  // Filtro vindo de uma categoria (chip ou sugestão): não é uma pesquisa
  // por texto — é o mesmo filtro local que os cards da homepage usam.
  const aplicarGrupo = (c) => {
    userActed.current = true
    setShowSuggest(false)
    setSuggestions([])
    setActiveIdx(-1)
    setQuery('')
    setSearchMode(true)
    if (c.tipo === 'categoria') {
      setCategoria(c.id)
      setKind('')
      setSub('')
    } else if (c.tipo === 'tipo') {
      setKind(c.id)
      setCategoria('')
      setSub('')
    } else {
      setKind(c.kind || '')
      setCategoria('')
      setSub(c.id)
    }
    // Sem dados carregados ainda é preciso ir buscá-los uma vez; com
    // dados, o filtro é aplicado no sítio.
    if (!started) load('', municipio, provincia)
  }

  const runSearch = async (term, muni = municipio, prov = provincia) => {
    const q = String(term ?? query).trim()
    const grupo = melhorCategoria(q)
    if (grupo) {
      aplicarGrupo(grupo)
      return
    }
    userActed.current = true
    setShowSuggest(false)
    inputRef.current?.blur()
    setSearchMode(Boolean(q))
    await load(q, muni, prov)
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
    await load('', municipio, provincia)
  }

  // O ecrã acompanha a recolha/volta do hero: sem isto, quem pesquisa a
  // partir de baixo da página fica a olhar para o sítio errado.
  useEffect(() => {
    if (!userActed.current) return
    heroRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [searchMode, reduced])

  // Única carga automática: quando a homepage (ou um link partilhado)
  // traz o termo em ?q=. Sem termo não há pedido nenhum — a página fica
  // com a caixa e o convite a pesquisar, o que poupa a query a quem só
  // está de passagem numa rede lenta.
  useEffect(() => {
    // Categoria vinda da homepage também é uma acção: os resultados do
    // tipo escolhido têm de aparecer, mesmo sem termo escrito.
    if (!initialQuery && !tipoInicial && !categoriaInicial && !subInicial) return
    // Categoria no URL: os filtros já arrancaram no useState, por isso o
    // pedido é só o do stock; o filtro é aplicado no sítio.
    const grupo = initialQuery ? melhorCategoria(initialQuery) : null
    const termo = grupo ? '' : initialQuery
    let alive = true
    ;(async () => {
      try {
        const rows = await fetchGroups(termo, '', '')
        if (alive) setGroups(rows)
      } catch (err) {
        logError('drug-search', 'Carga inicial falhou', { message: err?.message })
        if (alive) {
          setError('Não foi possível concluir a pesquisa. Verifique a ligação e tente novamente.')
          setGroups([])
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [initialQuery, tipoInicial, categoriaInicial, subInicial])

  const chooseProvincia = (p) => {
    setProvincia(p)
    setMunicipio('')
    load(query, '', p)
  }

  const chooseMunicipio = (m) => {
    setMunicipio(m)
    load(query, m, provincia)
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

  // Filtros locais: "abertas agora" e origem não pedem novo fetch (o
  // horário e a origem já vieram em cada linha).
  const filteredItems = useMemo(() => {
    if (!groups) return null
    const items = groups.flatMap((g) => g.items)
    if (!onlyOpen && !origin && !kind && !categoria && !sub) return items
    return items.filter(
      (it) =>
        (!onlyOpen || isOpenNow(it.pharmacy_opening_hours)) &&
        (!origin || originGroup(it.origin) === origin) &&
        (!kind || (it.drug_kind || 'medicamento') === kind) &&
        (!categoria || it.drug_category === categoria) &&
        (!sub || it.drug_category === sub),
    )
  }, [groups, onlyOpen, origin, kind, categoria, sub])

  // Um card por medicamento + marca. A ordem é escolhida pelo cliente; a
  // predefinição é nome A–Z (previsível para quem já sabe o que procura).
  const variants = useMemo(
    () => (filteredItems ? sortVariants(groupVariants(filteredItems), sort) : null),
    [filteredItems, sort],
  )

  const filtered =
    onlyOpen || Boolean(origin) || Boolean(kind) || Boolean(categoria) || Boolean(sub)

  const totalPharmacies = filteredItems
    ? new Set(filteredItems.map((it) => it.pharmacy_id)).size
    : 0

  // Variante aberta no URL (medicamento + marca). Vive nos resultados já
  // filtrados: os filtros globais continuam a mandar na lista.
  const openVariant = varianteId
    ? variants?.find((v) => v.drug_id === varianteId && v.brandKey === (marcaAberta || '')) || null
    : null
  const title = query.trim()
    ? query.trim().charAt(0).toUpperCase() + query.trim().slice(1)
    : categoria
      ? categoriaLabel(categoria) || 'Confirmado agora'
      : kind
        ? kindLabel(kind)
        : 'Confirmado agora'

  // Escolher «Dor e febre» e não ver nada não é um filtro mal aplicado: é
  // stock que passou a janela de confirmação. A mensagem tem de dizer isso,
  // em vez de mandar «desactivar filtros» a quem não ligou nenhum.
  const grupoLabel =
    (categoria && categoriaLabel(categoria)) ||
    (kind && kindLabel(kind)) ||
    (sub && categoriaLabel(sub)) ||
    ''
  const otherFilters = onlyOpen || Boolean(origin)
  const emptyTitle = filtered
    ? grupoLabel && !otherFilters
      ? `Sem stock confirmado em ${grupoLabel} agora`
      : 'Nenhuma farmácia corresponde a estes filtros'
    : `Sem stock confirmado para «${query.trim() || municipio || provincia}»`
  const emptySub = filtered
    ? grupoLabel && !otherFilters
      ? 'Os medicamentos precisam de confirmação das últimas 72 horas, a parafarmácia dos últimos 30 dias. O produto pode existir sem confirmação — ligue para a farmácia antes de sair.'
      : 'Desactive os filtros para ver todas as farmácias — ou confirme por WhatsApp antes de sair.'
    : 'Medicamentos confirmados nas últimas 72 h e parafarmácia nos últimos 30 dias. Experimente o princípio activo sem dosagem, ou veja as farmácias da rede.'

  const activeCount =
    Number(Boolean(categoria)) +
    Number(Boolean(kind)) +
    Number(Boolean(sub)) +
    Number(Boolean(origin)) +
    Number(Boolean(onlyOpen)) +
    Number(Boolean(provincia)) +
    Number(Boolean(municipio))

  const clearFilters = () => {
    setCategoria('')
    setKind('')
    setSub('')
    setOrigin('')
    setOnlyOpen(false)
    // Limpar província/município exige nova query (o servidor filtrava).
    if (provincia || municipio) chooseProvincia('')
  }

  // Pedida só a partir de um gesto («Perto de mim»). Devolve as coordenadas
  // para quem abriu o pedido (a folha da variante) poder ordenar por perto.
  const askLocation = async () => {
    setLocating(true)
    setLocationError('')
    try {
      const coords = await requestBrowserLocation()
      setLocation(coords)
      return coords
    } catch (err) {
      setLocationError(geolocationErrorMessage(err?.code, err?.permission))
      return null
    } finally {
      setLocating(false)
    }
  }

  const toggleLocation = async () => {
    if (location) {
      clearStoredLocation()
      setLocation(null)
      setLocationError('')
      return
    }
    await askLocation()
  }

  return (
    <>
      <section
        className={`shop-hero shop-hero--tools${searchMode ? ' shop-hero--searching' : ''}`}
        ref={heroRef}
      >
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
                <p className="shop-hero-sub">
                  Diga o que precisa e veja as farmácias de Luanda e Ícolo e Bengo que confirmam
                  stock nas últimas 72 horas.
                </p>
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
                      key={
                        s.suggestionKind === 'grupo'
                          ? `grupo-${s.tipo}-${s.id}-${s.kind || ''}`
                          : s.kind === 'brand'
                            ? `brand-${s.name}`
                            : s.id
                      }
                      type="button"
                      role="option"
                      aria-selected={i === activeIdx}
                      className={`suggest-item${i === activeIdx ? ' suggest-item--on' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (s.suggestionKind === 'grupo') {
                          aplicarGrupo(s)
                          return
                        }
                        setQuery(s.name)
                        runSearch(s.name)
                      }}
                    >
                      <span className="suggest-name">{s.label || s.name}</span>
                      <span className="suggest-meta">
                        {s.suggestionKind === 'grupo'
                          ? s.tipo === 'sub'
                            ? `subcategoria · ${kindLabel(s.kind)}`
                            : s.tipo === 'tipo'
                              ? 'parafarmácia'
                              : 'categoria'
                          : s.kind === 'brand'
                            ? 'marca'
                            : [s.form, s.dosage].filter(Boolean).join(' · ') || 'produto'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filtros e ordem: uma barra só. O painel guarda as listas
                longas (categorias, províncias, origem); os filtros activos
                ficam visíveis como chips removíveis por baixo. */}
            <div className="sh-controls">
              <button
                type="button"
                className={`sh-filter-btn${activeCount ? ' sh-filter-btn--on' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls="sh-filter-panel"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M7 12h10M10 17h4" />
                </svg>
                Filtros
                {activeCount ? <span className="sh-filter-badge">{activeCount}</span> : null}
              </button>

              <label className="sh-sort">
                <span className="sh-sort-label">Ordenar</span>
                <select
                  className="sh-sort-select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Ordenar resultados"
                >
                  <option value="nome">Nome A–Z</option>
                  <option value="farmacias">Mais farmácias</option>
                  <option value="preco">Preço mais baixo</option>
                  <option value="recente">Confirmação recente</option>
                </select>
              </label>
            </div>

            {activeCount > 0 ? (
              <div className="sh-filters" role="group" aria-label="Filtros activos">
                {categoria ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => setCategoria('')}
                    aria-label={`Remover a categoria ${categoriaLabel(categoria)}`}
                  >
                    {categoriaLabel(categoria)} ×
                  </button>
                ) : null}
                {kind ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => {
                      setKind('')
                      setSub('')
                    }}
                    aria-label={`Remover a categoria ${kindLabel(kind)}`}
                  >
                    {kindLabel(kind)} ×
                  </button>
                ) : null}
                {sub ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => setSub('')}
                    aria-label={`Remover a subcategoria ${categoriaLabel(sub)}`}
                  >
                    {categoriaLabel(sub)} ×
                  </button>
                ) : null}
                {origin ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => setOrigin('')}
                    aria-label="Remover o filtro de origem"
                  >
                    Origem: {origin} ×
                  </button>
                ) : null}
                {onlyOpen ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => setOnlyOpen(false)}
                    aria-label="Mostrar também as farmácias fechadas"
                  >
                    Abertas agora ×
                  </button>
                ) : null}
                {provincia ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => chooseProvincia('')}
                    aria-label={`Remover a província ${provincia}`}
                  >
                    {provincia} ×
                  </button>
                ) : null}
                {municipio ? (
                  <button
                    type="button"
                    className="cf-chip cf-chip--on"
                    onClick={() => chooseMunicipio('')}
                    aria-label={`Remover o município ${municipio}`}
                  >
                    {municipio} ×
                  </button>
                ) : null}
                <button type="button" className="cf-chip" onClick={clearFilters}>
                  Limpar tudo
                </button>
              </div>
            ) : null}

            {filtersOpen ? (
              <div className="sh-filter-panel" id="sh-filter-panel">
                <div className="sh-filter-group">
                  <span className="sh-toolbar-label">Categoria</span>
                  <div className="sh-filter-chips">
                    <button
                      type="button"
                      className={`cf-chip${!categoria && !kind ? ' cf-chip--on' : ''}`}
                      onClick={() => {
                        setCategoria('')
                        setKind('')
                        setSub('')
                      }}
                    >
                      Todas
                    </button>
                    {MEDICINE_CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cf-chip${categoria === c.id ? ' cf-chip--on' : ''}`}
                        aria-pressed={categoria === c.id}
                        onClick={() => aplicarGrupo({ tipo: 'categoria', id: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                    {PARAPHARMACY_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`cf-chip${kind === t.id ? ' cf-chip--on' : ''}`}
                        aria-pressed={kind === t.id}
                        onClick={() => aplicarGrupo({ tipo: 'tipo', id: t.id })}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {kind && subcategoriasDe(kind).length > 0 ? (
                  <div className="sh-filter-group">
                    <span className="sh-toolbar-label">Subcategoria</span>
                    <div className="sh-filter-chips">
                      <button
                        type="button"
                        className={`cf-chip${sub === '' ? ' cf-chip--on' : ''}`}
                        onClick={() => setSub('')}
                      >
                        Todas
                      </button>
                      {subcategoriasDe(kind).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`cf-chip${sub === s.id ? ' cf-chip--on' : ''}`}
                          aria-pressed={sub === s.id}
                          onClick={() => setSub(sub === s.id ? '' : s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="sh-filter-group">
                  <span className="sh-toolbar-label">Província</span>
                  <div className="sh-filter-chips">
                    <button
                      type="button"
                      className={`cf-chip${provincia === '' ? ' cf-chip--on' : ''}`}
                      onClick={() => chooseProvincia('')}
                    >
                      Todas
                    </button>
                    {PROVINCIAS.map((p) => (
                      <button
                        key={p.nome}
                        type="button"
                        className={`cf-chip${provincia === p.nome ? ' cf-chip--on' : ''}`}
                        aria-pressed={provincia === p.nome}
                        onClick={() => chooseProvincia(p.nome)}
                      >
                        {p.nome}
                      </button>
                    ))}
                  </div>
                </div>

                {provincia ? (
                  <div className="sh-filter-group">
                    <span className="sh-toolbar-label">Município</span>
                    <div className="sh-filter-chips">
                      <button
                        type="button"
                        className={`cf-chip${municipio === '' ? ' cf-chip--on' : ''}`}
                        onClick={() => chooseMunicipio('')}
                      >
                        Todos
                      </button>
                      {municipiosDaProvincia(provincia).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`cf-chip${municipio === m ? ' cf-chip--on' : ''}`}
                          aria-pressed={municipio === m}
                          onClick={() => chooseMunicipio(m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="sh-filter-group">
                  <span className="sh-toolbar-label">Origem</span>
                  <div className="sh-filter-chips">
                    <button
                      type="button"
                      className={`cf-chip${origin === '' ? ' cf-chip--on' : ''}`}
                      onClick={() => setOrigin('')}
                    >
                      Todas
                    </button>
                    {ORIGIN_FILTERS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`cf-chip${origin === o.id ? ' cf-chip--on' : ''}`}
                        aria-pressed={origin === o.id}
                        onClick={() => setOrigin(origin === o.id ? '' : o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sh-filter-group sh-filter-group--row">
                  <button
                    type="button"
                    className={`cf-chip${onlyOpen ? ' cf-chip--on' : ''}`}
                    aria-pressed={onlyOpen}
                    onClick={() => setOnlyOpen((v) => !v)}
                  >
                    Abertas agora
                  </button>
                  <button
                    type="button"
                    className={`cf-chip${location ? ' cf-chip--on' : ''}`}
                    aria-pressed={Boolean(location)}
                    onClick={toggleLocation}
                    disabled={locating}
                  >
                    {locating
                      ? 'A obter posição…'
                      : location
                        ? 'Esquecer localização'
                        : 'Perto de mim'}
                  </button>
                  <button type="button" className="cf-chip" onClick={clearFilters}>
                    Limpar filtros
                  </button>
                </div>

                {locationError ? (
                  <p className="sh-filter-note" role="status">
                    {locationError}
                  </p>
                ) : null}
              </div>
            ) : null}
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
              {variants === null
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
                {!started
                  ? 'escreva o medicamento ou escolha um filtro'
                  : variants === null
                    ? 'a carregar…'
                    : `${totalPharmacies} farmácia${totalPharmacies === 1 ? ' confirma' : 's confirmam'} · ${
                        variants.length
                      } apresenta${variants.length === 1 ? 'ção' : 'ções'}`}
                {municipio ? ` · ${municipio}` : provincia ? ` · ${provincia}` : ''}
                {kind ? ` · ${kindLabel(kind)}` : ''}
                {categoria ? ` · ${categoriaLabel(categoria)}` : ''}
                {sub ? ` · ${categoriaLabel(sub)}` : ''}
              </span>
            </div>
          </div>

          {error && (
            <div className="sh-empty" role="alert">
              <p className="sh-empty-title">Algo falhou</p>
              <p className="sh-empty-sub">{error}</p>
            </div>
          )}

          {!error && variants === null && !started && (
            <div className="sh-empty">
              <p className="sh-empty-title">Procure o medicamento</p>
              <p className="sh-empty-sub">
                Escreva o nome ou a marca e carregue em Enter. Só aparece o que as farmácias
                parceiras confirmaram — 72 horas para medicamentos, 30 dias para parafarmácia.
              </p>
              <p style={{ marginTop: 16 }}>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias da rede
                </Link>
              </p>
            </div>
          )}

          {!error && variants === null && started && (
            <div className="sh-empty" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A procurar stock confirmado…</p>
            </div>
          )}

          {!error && variants !== null && variants.length === 0 && (
            <div className="sh-empty">
              <p className="sh-empty-title">{emptyTitle}</p>
              <p className="sh-empty-sub">{emptySub}</p>
              <p style={{ marginTop: 16 }}>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias
                </Link>
              </p>
            </div>
          )}

          {!error && variants !== null && variants.length > 0 && (
            <div className="variant-grid">
              {variants.map((v) => (
                <VariantCard
                  key={v.key}
                  variant={v}
                  distance={nearestDistance(v, location)}
                  onOpen={openVariantSheet}
                />
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

      {varianteId && !openId && openVariant ? (
        <VariantSheet
          key={openVariant.key}
          variant={openVariant}
          location={location}
          onRequestLocation={askLocation}
          locating={locating}
          locationError={locationError}
          onClose={closeVariantSheet}
          onOpenItem={openProduct}
        />
      ) : null}

      {openId && <ProductModal stockItemId={openId} onClose={closeSheet} onOpenItem={swapSheet} />}
    </>
  )
}
