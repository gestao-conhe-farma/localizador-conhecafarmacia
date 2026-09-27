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
}

function timeAgo(iso, now) {
  if (!iso) return null
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

const PAGE_SIZE = 40

/**
 * Entrada de stock (reposição) — o complemento da baixa automática das
 * reservas: quando a farmácia recebe mercadoria, soma unidades recebidas
 * ao saldo de cada medicamento.
 *
 * Padrão único do portal: cabeçalho compacto + toolbar de uma linha +
 * lista densa. Cada linha: nome do medicamento, saldo actual, campo
 * «chegaram N unidades» e guardar. A entrada religa o item (in_stock)
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
    setSavingId(it.drug_id)
    const res = await addStockUnits({ drugId: it.drug_id, units: n })
    setSavingId(null)
    if (res.ok) {
      setItems((list) =>
        (list || []).map((row) =>
          row.drug_id === it.drug_id
            ? {
                ...row,
                in_stock: true,
                quantity: res.total,
                confirmed_at: new Date().toISOString(),
              }
            : row,
        ),
      )
      setUnits((u) => ({ ...u, [it.drug_id]: '' }))
      setLog((l) => [{ name: it.name, added: n, total: res.total, at: Date.now() }, ...l])
      flash(`+${n} ${it.name} — saldo agora em ${res.total}.`)
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

      {/* Toolbar única — pesquisa + chips numa linha. */}
      <div className="portal-toolbar portal-toolbar--left">
        <div className="stock-search-wrap">
          <span className="stock-search-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="search"
            className="portal-input portal-search"
            placeholder="Pesquisar medicamento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar medicamento na entrada de stock"
          />
        </div>
        <div className="portal-chips" role="group" aria-label="Filtrar lista de entrada">
          {[
            { id: 'restock', label: 'Para repor' },
            { id: 'all', label: 'Todos' },
            { id: 'exp', label: 'Validade' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`portal-chip${filter === f.id ? ' portal-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <span className="portal-chip-n">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">
            {filter === 'restock' && !query ? 'Nada a repor' : 'Nada encontrado'}
          </p>
          <p className="empty-sub">
            {filter === 'restock' && !query
              ? 'Nenhum produto esgotado neste momento — mude para «Todos» para registar entrada em qualquer medicamento.'
              : 'Tente outro termo de pesquisa ou mude de filtro.'}
          </p>
        </div>
      )}

      <div className="restock-list">
        {filtered.slice(0, visibleCount).map((it) => {
          const expiry = expiryStatus(it.expires_at)
          const busy = savingId === it.drug_id
          const out = !it.in_stock || (it.quantity ?? 0) === 0
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
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    className="portal-input restock-input"
                    placeholder="0"
                    value={units[it.drug_id] || ''}
                    onChange={(e) => setUnits((u) => ({ ...u, [it.drug_id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !busy) save(it)
                    }}
                    aria-label={`Unidades recebidas de ${it.name}`}
                    disabled={busy}
                  />
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
            </div>
          )
        })}
      </div>

      {filtered.length > visibleCount && (
        <button
          type="button"
          className="portal-chip restock-more"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
        >
          Mostrar mais ({filtered.length - visibleCount})
        </button>
      )}

      {/* Confirmação da sessão — as últimas entradas registadas. */}
      {log.length > 0 && (
        <div className="restock-log">
          <h2 className="portal-h2">Entradas desta sessão</h2>
          <ul>
            {log.slice(0, 8).map((e, i) => (
              <li key={i}>
                <b>+{e.added}</b> {e.name} — saldo em <b>{e.total}</b>
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
