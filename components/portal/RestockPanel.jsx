'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getMyStockSnapshot, addStockUnits } from '@/lib/actions/pharmacy-portal'
import { expiryStatus, monthYear } from '@/lib/expiry'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  QUANTIDADE_INVALIDA: 'Quantidade inválida — indique quantas unidades chegaram (≥ 1).',
  PAYLOAD_INVALIDO: 'Pedido inválido.',
  MEDICAMENTO_INEXISTENTE: 'Medicamento não disponível no catálogo.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
  FALHA_CARREGAR: 'Não foi possível carregar o stock.',
  PACK_INVALIDO: 'Estrutura da caixa inválida — use números de 1 a 999.',
  UNIDADE_INVALIDA: 'Unidade de entrada inválida.',
  PRECO_INVALIDO: 'Preço inválido numa das formas de venda.',
  DEFAULT_MULTIPLO: 'Só uma forma de venda pode ser a padrão.',
}

function timeAgo(iso, now) {
  if (!iso) return null
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

const PAGE_SIZE = 40

/** Plural da unidade — rótulos da entrada ("3 caixas", "10 lâminas"). */
const PLURALS = {
  comprimido: 'Comprimidos',
  lamina: 'Lâminas',
  caixa: 'Caixas',
  frasco: 'Frascos',
  ampola: 'Ampolas',
  unidade: 'Unidades',
}

/** Formas sólidas (comprimido/cápsula) — as que têm lâminas e caixas. */
const isSolid = (form) => /comprimido|c[aá]psula/i.test(form || '')

/**
 * Unidades em que esta farmácia pode dizer o que chegou (0016).
 * União das formas de venda activas com as unidades físicas de
 * chegada: quem vende só por lâmina AINDA RECEBE caixas — vender e
 * chegar são decisões diferentes.
 */
function unitOptions(it) {
  const set = new Set((it.sale_options || []).filter((o) => o.active !== false).map((o) => o.unit))
  if (isSolid(it.form)) {
    set.add('caixa')
    set.add('lamina')
  } else {
    const f = (it.form || '').toLowerCase()
    if (f.includes('xarope') || f.includes('solução') || f.includes('suspens')) set.add('frasco')
    else if (f.includes('injet') || f.includes('inject')) set.add('ampola')
  }
  if (!set.size) set.add('unidade')
  return [...set]
}

/** Unidade seleccionada por omissão: a do saldo (padrão); sem opções
 *  registadas, as sólidas começam em «caixas» — é como chega a
 *  mercadoria. */
function defaultUnit(it) {
  const def = (it.sale_options || []).find((o) => o.is_default && o.active !== false)
  if (def) return def.unit
  return unitOptions(it)[0]
}

/** Unidades com campo de preço nesta entrada. */
function priceUnits(it) {
  if (isSolid(it.form)) return ['caixa', 'lamina']
  return unitOptions(it).slice(0, 3)
}

/** Preço actual de uma forma de venda (para pré-preencher o campo). */
function priceOf(it, unit) {
  const o = (it.sale_options || []).find((x) => x.unit === unit)
  return o && o.price != null ? String(o.price) : ''
}

/** Formas de venda sugeridas pela forma farmacêutica — mesmas regras
 *  do modal do Stock (copiadas: este painel é client-only). */
function suggestOptionsLocal(form) {
  const f = (form || '').toLowerCase()
  if (f.includes('comprimido') || f.includes('cápsula') || f.includes('capsula')) {
    return [
      { unit: 'lamina', packSize: '1', price: '', isDefault: true, active: true },
      { unit: 'caixa', packSize: '3', price: '', isDefault: false, active: true },
    ]
  }
  if (f.includes('xarope') || f.includes('solução') || f.includes('suspens')) {
    return [{ unit: 'frasco', packSize: '1', price: '', isDefault: true, active: true }]
  }
  if (f.includes('injet') || f.includes('inject')) {
    return [{ unit: 'ampola', packSize: '1', price: '', isDefault: true, active: true }]
  }
  return [{ unit: 'unidade', packSize: '1', price: '', isDefault: true, active: true }]
}

/**
 * Lista de formas de venda que esta entrada vai guardar — o mesmo
 * shape achatado do modal (addStockUnits valida e grava no servidor).
 * A estrutura da caixa (0016) manda no pack_size da caixa/lâmina para
 * o factor de conversão coincidir com a leitura física; preços
 * escritos entram por cima (preencher preço = oferecer a forma).
 */
function buildOptions(it, { unit, pack, priceMap }) {
  let list = (it.sale_options || []).map((o) => ({
    unit: o.unit,
    packSize: String(o.pack_size ?? 1),
    price: o.price != null ? String(o.price) : '',
    isDefault: Boolean(o.is_default),
    active: o.active !== false,
  }))
  if (!list.length) list = suggestOptionsLocal(it.form)
  const lam = Number(pack.lam ?? it.pack_laminas ?? '') || null
  const comp = Number(pack.comp ?? it.pack_comprimidos ?? '') || null
  const base = (list.find((o) => o.isDefault && o.active) || list[0]).unit
  const packFor = (u) => {
    if (u === 'caixa') return lam ? (base === 'comprimido' ? lam * (comp || 1) : lam) : 3
    if (u === 'lamina') return base === 'comprimido' ? comp || 1 : 1
    return 1
  }
  // A unidade em que se está a registar tem de existir — o factor da
  // soma vem do pack_size desta opção. Criada inactiva: chegar não é
  // oferecer (activa-se quando tem preço, abaixo).
  if (!list.some((o) => o.unit === unit)) {
    list.push({
      unit,
      packSize: String(packFor(unit)),
      price: '',
      isDefault: false,
      active: false,
    })
  }
  // Estrutura (0016) aplicada às opções que contam fora da base.
  if (lam) {
    const caixa = list.find((o) => o.unit === 'caixa' && !o.isDefault)
    if (caixa) caixa.packSize = String(packFor('caixa'))
    const lamina = list.find((o) => o.unit === 'lamina' && !o.isDefault)
    if (lamina && base === 'comprimido' && comp) lamina.packSize = String(comp)
  }
  // Preços escritos nesta entrada — preencher = oferecer a forma.
  for (const [u, v] of Object.entries(priceMap || {})) {
    if (v === '' || v == null) continue
    let o = list.find((x) => x.unit === u)
    if (!o) {
      o = { unit: u, packSize: String(packFor(u)), price: '', isDefault: false, active: false }
      list.push(o)
    }
    o.price = String(v)
    o.active = true
  }
  // Exactamente uma forma padrão (regra do servidor).
  const active = list.filter((o) => o.active)
  if (active.length && !active.some((o) => o.isDefault)) {
    for (const o of list) o.isDefault = false
    active[0].isDefault = true
    active[0].packSize = '1'
  }
  return list
}

/** Leitura física do que chegou — «3 caixas · 30 lâminas · 300 comp.». */
function physicalParts(qty, unit, lam, comp, solid) {
  if (!solid) return []
  if (unit === 'comprimido') return [`${qty} comprimidos`]
  if (unit === 'lamina') {
    const parts = [`${qty} lâminas`]
    if (comp) parts.push(`${qty * comp} comprimidos`)
    return parts
  }
  if (unit === 'caixa') {
    if (!lam) return [`${qty} caixas`]
    const laminas = qty * lam
    const parts = [`${qty} caixas`, `${laminas} lâminas`]
    if (comp) parts.push(`${laminas * comp} comprimidos`)
    return parts
  }
  return []
}

/**
 * Entrada de stock (reposição) — o complemento da baixa automática das
 * reservas: quando a farmácia recebe mercadoria, soma unidades recebidas
 * ao saldo de cada medicamento.
 *
 * Padrão único do portal: cabeçalho compacto + toolbar de uma linha +
 * lista densa. Cada linha: nome do medicamento, saldo actual, campo
 * «chegaram N» + unidade (caixas, lâminas, frascos…) e guardar. Com
 * quantidade escrita abre-se o detalhe (0016): estrutura da caixa
 * (lâminas/caixa · comprimidos/lâmina), preços por forma de venda e a
 * prévia do que vai entrar no saldo. A entrada religa o item (in_stock)
 * e refresca a confirmação — o Localizador volta a vê-lo no mesmo clique.
 *
 * Filtros: «Repor» (esgotados/fora do ar, os que mais precisam), «Todos»
 * e «Validade» (em stock com validade a vencer — entrada de lote novo).
 *
 * Deep-link a partir da página "Precisa de atenção": `?q=Paracetamol`
 * pré-filtra a pesquisa (o botão «Repor» de um aviso abre aqui com o
 * medicamento já isolado na lista, pronto para o atendente escrever a
 * quantidade que chegou). `useSearchParams` exige <Suspense> no caller —
 * a página já embrulha.
 *
 * Deep-link por id (`?drug=<drug_id>`), usado pelo aviso de validade:
 * força o filtro «Todos» (o item pode ter saldo e estar fora do chip
 * «Para repor»), isola a linha pelo nome, foca o campo e destaca-a
 * em laranja uns segundos — o atendente vê logo onde tocar.
 */
export default function RestockPanel() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState(null)
  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const [filter, setFilter] = useState('restock')
  const [units, setUnits] = useState({}) // drug_id -> texto do input
  // 0016 — detalhe da entrada, por medicamento: unidade escolhida,
  // estrutura da caixa (lâminas/caixa, comp/lâmina) e preços escritos.
  const [unitSel, setUnitSel] = useState({}) // drug_id -> unit id
  const [packs, setPacks] = useState({}) // drug_id -> { lam, comp }
  const [prices, setPrices] = useState({}) // drug_id -> { caixa, lamina, … }
  const [savingId, setSavingId] = useState(null)
  const [toast, setToast] = useState('')
  const [log, setLog] = useState([]) // entradas desta sessão (confirmação)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 4000)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await getMyStockSnapshot()
      if (alive && res.ok) setItems(res.items)
      else if (alive) {
        setItems([])
        flash(ERRORES[res.error] || ERRORES.FALHA_CARREGAR)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Deep-link da atenção: se o q= do URL casa um único medicamento, o foco
  // vai logo ao campo «Chegaram» dessa linha — o atendente chega, digita,
  // soma. Corre após o load (só há linha quando items já chegou).
  const [autofocusDone, setAutofocusDone] = useState(false)
  // Linha destacada por deep-link ?drug= (apaga-se sozinha).
  const [highlightId, setHighlightId] = useState(null)
  useEffect(() => {
    if (autofocusDone || items === null) return
    const drugId = searchParams.get('drug')
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    // ?drug= (validade): isola pelo id e força «Todos» — o item tem saldo,
    // o chip «Para repor» escondia-o.
    if (drugId) {
      const it = (items || []).find((row) => row.drug_id === drugId)
      setAutofocusDone(true)
      if (it) {
        setFilter('all')
        setQuery(it.name)
        setHighlightId(drugId)
        setTimeout(() => setHighlightId(null), 6000)
        queueMicrotask(() => {
          document.querySelector(`input[aria-label="Unidades recebidas de ${it.name}"]`)?.focus()
        })
      }
      return
    }
    if (!q) {
      setAutofocusDone(true)
      return
    }
    const matches = (items || []).filter(
      (it) =>
        it.name?.toLowerCase().includes(q) ||
        it.molecule?.toLowerCase().includes(q) ||
        [it.form, it.dosage].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
    if (matches.length === 1) {
      setAutofocusDone(true)
      queueMicrotask(() => {
        document
          .querySelector(`input[aria-label="Unidades recebidas de ${matches[0].name}"]`)
          ?.focus()
      })
    }
  }, [items, searchParams, autofocusDone])

  useEffect(() => {
    queueMicrotask(() => setVisibleCount(PAGE_SIZE))
  }, [query, filter])

  const counts = useMemo(() => {
    const list = items || []
    return {
      restock: list.filter((it) => !it.in_stock || (it.quantity ?? 0) === 0).length,
      all: list.length,
      exp: list.filter((it) => {
        if (!it.in_stock) return false
        const st = expiryStatus(it.expires_at)
        return st && st.level !== 'ok'
      }).length,
    }
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    return items
      .filter((it) => {
        if (filter === 'restock' && it.in_stock && (it.quantity ?? 0) > 0) return false
        if (filter === 'exp') {
          if (!it.in_stock) return false
          const st = expiryStatus(it.expires_at)
          if (!st || st.level === 'ok') return false
        }
        if (!q) return true
        return (
          it.name?.toLowerCase().includes(q) ||
          it.molecule?.toLowerCase().includes(q) ||
          [it.form, it.dosage].filter(Boolean).join(' ').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        // Fora do ar primeiro (mais urgente), depois alfabético.
        const out = (x) => (!x.in_stock || (x.quantity ?? 0) === 0 ? 0 : 1)
        return out(a) - out(b) || (a.name || '').localeCompare(b.name || '')
      })
  }, [items, query, filter])

  const save = async (it) => {
    const raw = (units[it.drug_id] || '').trim()
    const n = Number.parseInt(raw, 10)
    if (!raw || Number.isNaN(n) || n < 1) {
      flash(ERRORES.QUANTIDADE_INVALIDA)
      return
    }
    const id = it.drug_id
    const solid = isSolid(it.form)
    const unit = unitSel[id] || defaultUnit(it)
    const pack = packs[id] || {}
    const priceMap = prices[id] || {}
    const lam = Number(pack.lam ?? it.pack_laminas ?? '') || null
    // Caixas sem estrutura conhecida e sem opção «caixa» registada: não
    // há como converter nem mostrar o total de comprimidos — pede a
    // informação (0016) em vez de somar às cegas.
    const hasCaixaOpt = (it.sale_options || []).some((o) => o.unit === 'caixa')
    if (unit === 'caixa' && solid && !hasCaixaOpt && !lam) {
      flash('Indique as lâminas por caixa (campo abaixo) para registar caixas.')
      return
    }
    const options = buildOptions(it, { unit, pack, priceMap })
    const comp = Number(pack.comp ?? it.pack_comprimidos ?? '') || null
    const parts = physicalParts(n, unit, lam, comp, solid)
    const baseUnit = (options.find((o) => o.isDefault && o.active) || options[0]).unit

    setSavingId(id)
    const res = await addStockUnits({
      drugId: id,
      units: n,
      unit,
      // A estrutura só existe nas formas sólidas — nos outros casos os
      // campos nem aparecem (undefined = não tocar nas colunas).
      ...(solid && {
        packLaminas: pack.lam ?? it.pack_laminas ?? '',
        packComprimidos: pack.comp ?? it.pack_comprimidos ?? '',
      }),
      options,
    })
    setSavingId(null)
    if (res.ok) {
      setItems((list) =>
        (list || []).map((row) =>
          row.drug_id === id
            ? {
                ...row,
                in_stock: true,
                quantity: res.total,
                confirmed_at: new Date().toISOString(),
                ...(solid && {
                  pack_laminas:
                    pack.lam !== undefined
                      ? pack.lam === ''
                        ? null
                        : Number(pack.lam)
                      : row.pack_laminas,
                  pack_comprimidos:
                    pack.comp !== undefined
                      ? pack.comp === ''
                        ? null
                        : Number(pack.comp)
                      : row.pack_comprimidos,
                }),
                // Formas de venda optimistas (mesmo shape do modal).
                sale_options: options.map((o, i) => ({
                  id: `tmp-${i}`,
                  stock_item_id: row.stock_item_id,
                  unit: o.unit,
                  pack_size: Number(o.packSize) || 1,
                  price: o.price === '' ? null : Number(o.price),
                  is_default: Boolean(o.isDefault),
                  active: o.active !== false,
                })),
              }
            : row,
        ),
      )
      setUnits((u) => ({ ...u, [id]: '' }))
      const desc = parts.length ? parts.join(' · ') : `${n} ${PLURALS[unit].toLowerCase()}`
      setLog((l) => [
        { name: it.name, added: res.added, unit: baseUnit, total: res.total, at: Date.now() },
        ...l,
      ])
      flash(
        `+${desc} de ${it.name} — saldo agora em ${res.total} ${PLURALS[baseUnit].toLowerCase()}.`,
      )
    } else {
      flash(ERRORES[res.error] || ERRORES.FALHA_GUARDAR)
    }
  }

  if (items === null) {
    return (
      <section className="portal-section">
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      </section>
    )
  }

  return (
    <section className="portal-section">
      {/* Padrão único do portal: cabeçalho compacto, sem hero. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Entrada de stock</h1>
          <p className="portal-page-sub">
            Chegou mercadoria? Indique quantas unidades entraram — o saldo soma, o produto volta ao
            Localizador e os avisos de reposição/desactualizado desaparecem.
          </p>
        </div>
      </div>

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}

      {/* Caixa com cabeçalho (sec-head do mock): pesquisa pill à
          direita; filtros viram tabs sublinhadas com contagem neutra. */}
      <div className="portal-box">
        <div className="portal-sec-head">
          <h2>Lista de entrada</h2>
          <div className="portal-sec-tools">
            <label className="portal-sec-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                placeholder="Pesquisar medicamento…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Pesquisar medicamento na entrada de stock"
              />
            </label>
          </div>
        </div>

        <div className="portal-undertabs" role="group" aria-label="Filtrar lista de entrada">
          {[
            { id: 'restock', label: 'Para repor' },
            { id: 'all', label: 'Todos' },
            { id: 'exp', label: 'Validade' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? 'active' : ''}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <span className="portal-cnt">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="portal-rows-empty">
            <b>{filter === 'restock' && !query ? 'Nada a repor' : 'Nada encontrado'}</b>
            {filter === 'restock' && !query
              ? 'Nenhum produto esgotado neste momento — mude para «Todos» para registar entrada em qualquer medicamento.'
              : 'Tente outro termo de pesquisa ou mude de filtro.'}
          </div>
        )}

        <div className="restock-list">
          {filtered.slice(0, visibleCount).map((it) => {
            const expiry = expiryStatus(it.expires_at)
            const busy = savingId === it.drug_id
            const out = !it.in_stock || (it.quantity ?? 0) === 0
            // 0016 — detalhe da entrada (unidade, estrutura, preços,
            // prévia de conversão). O detalhe só abre com quantidade
            // escrita: a lista mantém-se varrível, os campos aparecem
            // exactamente quando o atendente vai registar.
            const id = it.drug_id
            const solid = isSolid(it.form)
            const selUnit = unitSel[id] || defaultUnit(it)
            const pack = packs[id] || {}
            const lam = Number(pack.lam ?? it.pack_laminas ?? '') || null
            const comp = Number(pack.comp ?? it.pack_comprimidos ?? '') || null
            const qtyN = Number.parseInt((units[id] || '').trim(), 10)
            const detailsOn = (units[id] || '').trim() !== ''
            const optList = buildOptions(it, { unit: selUnit, pack, priceMap: {} })
            const chosen = optList.find((o) => o.unit === selUnit)
            const factor = chosen ? Number(chosen.packSize) || 1 : 1
            const baseUnit = (optList.find((o) => o.isDefault && o.active) || optList[0]).unit
            const parts = qtyN >= 1 ? physicalParts(qtyN, selUnit, lam, comp, solid) : []
            const preview =
              qtyN >= 1
                ? parts.length
                  ? `${parts.join(' · ')} · +${qtyN * factor} no saldo`
                  : `+${qtyN * factor} ${PLURALS[baseUnit].toLowerCase()}`
                : ''
            return (
              <div
                key={it.drug_id}
                className={`restock-row${out ? ' restock-row--out' : ''}${
                  highlightId === it.drug_id ? ' restock-row--focus' : ''
                }`}
              >
                <div className="restock-main">
                  <span className="restock-name">
                    {it.name}
                    {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
                  </span>
                  <span className="restock-meta">
                    {[it.form, it.dosage].filter(Boolean).join(' · ')}
                    {it.expires_at && expiry && expiry.level !== 'ok'
                      ? ` · validade ${monthYear(it.expires_at)} (${expiry.label})`
                      : it.expires_at
                        ? ` · validade ${monthYear(it.expires_at)}`
                        : ''}
                  </span>
                </div>

                <div className="restock-balance" title="Saldo actual em stock">
                  <span className="restock-balance-n">{it.in_stock ? (it.quantity ?? 0) : 0}</span>
                  <span className="restock-balance-k">em stock</span>
                </div>

                <div className="restock-form" data-tour="restock-input">
                  <label className="restock-field">
                    <span className="restock-field-k">Chegaram</span>
                    <div className="restock-qty">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        className="portal-input restock-input"
                        placeholder="0"
                        value={units[id] || ''}
                        onChange={(e) => setUnits((u) => ({ ...u, [id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !busy) save(it)
                        }}
                        aria-label={`Unidades recebidas de ${it.name}`}
                        disabled={busy}
                      />
                      {/* 0016 — EM QUE unidade chegou (caixas, lâminas,
                        frascos…): o saldo converte-se sozinho. */}
                      <select
                        className="portal-input restock-unit"
                        value={selUnit}
                        onChange={(e) => setUnitSel((u) => ({ ...u, [id]: e.target.value }))}
                        aria-label={`Unidade em que chegou ${it.name}`}
                        disabled={busy}
                      >
                        {unitOptions(it).map((u) => (
                          <option key={u} value={u}>
                            {PLURALS[u]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary restock-save"
                    onClick={() => save(it)}
                    disabled={busy}
                  >
                    {busy ? 'A guardar…' : 'Somar'}
                  </button>
                </div>

                {/* 0016 — detalhe da entrada: estrutura da caixa, preços
                  por forma de venda e prévia do que vai entrar. Só
                  visível com quantidade escrita. */}
                {detailsOn && (
                  <div className="restock-details">
                    {solid && (
                      <span className="restock-pack">
                        Caixa com
                        <input
                          type="number"
                          min="1"
                          max="999"
                          inputMode="numeric"
                          className="portal-input portal-input--price"
                          value={pack.lam ?? it.pack_laminas ?? ''}
                          onChange={(e) =>
                            setPacks((p) => ({ ...p, [id]: { ...p[id], lam: e.target.value } }))
                          }
                          aria-label={`Lâminas por caixa de ${it.name}`}
                          disabled={busy}
                        />
                        lâminas ·
                        <input
                          type="number"
                          min="1"
                          max="999"
                          inputMode="numeric"
                          className="portal-input portal-input--price"
                          value={pack.comp ?? it.pack_comprimidos ?? ''}
                          onChange={(e) =>
                            setPacks((p) => ({ ...p, [id]: { ...p[id], comp: e.target.value } }))
                          }
                          aria-label={`Comprimidos por lâmina de ${it.name}`}
                          disabled={busy}
                        />
                        comprimidos/lâmina
                      </span>
                    )}
                    <span className="restock-prices">
                      <span className="restock-prices-k">Preços:</span>
                      {priceUnits(it).map((u) => (
                        <label key={u} className="restock-price">
                          {PLURALS[u].toLowerCase()}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="portal-input portal-input--price"
                            value={(prices[id] || {})[u] ?? priceOf(it, u)}
                            onChange={(e) =>
                              setPrices((p) => ({ ...p, [id]: { ...p[id], [u]: e.target.value } }))
                            }
                            aria-label={`Preço de ${PLURALS[u].toLowerCase()} de ${it.name}`}
                            disabled={busy}
                          />
                          Kz
                        </label>
                      ))}
                    </span>
                    {preview && <span className="restock-preview">{preview}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filtered.length > visibleCount && (
          <div className="portal-pgbar">
            <span className="portal-pginfo">
              A mostrar {visibleCount} de {filtered.length}
            </span>
            <div className="portal-pgbtns">
              <button type="button" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                Mostrar mais →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmação da sessão — as últimas entradas registadas. */}
      {log.length > 0 && (
        <div className="restock-log">
          <h2 className="portal-h2">Entradas desta sessão</h2>
          <ul>
            {log.slice(0, 8).map((e, i) => (
              <li key={i}>
                <b>
                  +{e.added}
                  {e.unit ? ` ${PLURALS[e.unit].toLowerCase()}` : ''}
                </b>{' '}
                {e.name} — saldo em <b>{e.total}</b>
              </li>
            ))}
          </ul>
          <p className="portal-hint">
            O histórico completo do stock vive na página Stock (coluna «Confirmado»).
          </p>
        </div>
      )}
    </section>
  )
}
