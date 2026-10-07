'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMyStockSnapshot, getMyReservations } from '@/lib/actions/pharmacy-portal'

/**
 * Pesquisa global da top-bar (v2) — a pill do mockup, agora a
 * funcionar: `/` (ou o clique/foco) abre um campo com resultados
 * agrupados em Páginas · Medicamentos · Reservas. Os medicamentos
 * abrem no Stock com `?q=` (deep-link) e as reservas em /reservas
 * com `?q=` — os painéis leem o parâmetro e isolam o resultado.
 *
 * Os dados (stock + reservas) só carregam na primeira abertura, via
 * Server Actions já usadas pelas próprias páginas — sem endpoint
 * novo. Falha de carregamento não bloqueia: as Páginas ficam sempre
 * pesquisáveis.
 */

/** Páginas do portal — primeiro grupo, presente mesmo sem dados. */
const PAGES = [
  { label: 'Visão geral', sub: 'Resumo do dia', href: '/portal' },
  { label: 'Precisa de atenção', sub: 'Avisos e fila de hoje', href: '/portal/atencao' },
  { label: 'Stock', sub: 'Medicamentos, preços e validade', href: '/portal/stock' },
  { label: 'Entrada de stock', sub: 'Repor mercadoria recebida', href: '/portal/entrada' },
  { label: 'Reservas', sub: 'Atender pedidos dos clientes', href: '/portal/reservas' },
  { label: 'Vendas', sub: 'Relatório por dia', href: '/portal/vendas' },
  { label: 'Perfil da farmácia', sub: 'Contacto, morada e horário', href: '/portal/perfil' },
  { label: 'Ajuda', sub: 'Guias do atendente', href: '/portal/ajuda' },
]

/** Estado curto da reserva no resultado (mesmo vocabulário do v2). */
const RES_ST = {
  pendente: 'Por atender',
  confirmada: 'Confirmada',
  pronta: 'Pronta · aguarda levantamento',
  concluida: 'Concluída',
  recusada: 'Recusada',
  expirada: 'Expirada',
}

export default function PortalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [meds, setMeds] = useState(null)
  const [ress, setRess] = useState(null)
  const inputRef = useRef(null)

  // `/` abre a pesquisa (fora de campos de texto); Esc fecha.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Foco no campo ao abrir.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Dados na primeira abertura — uma vez, depois ficam em cache.
  useEffect(() => {
    if (!open || meds !== null) return
    let alive = true
    ;(async () => {
      const [s, r] = await Promise.allSettled([getMyStockSnapshot(), getMyReservations()])
      if (!alive) return
      setMeds(s.status === 'fulfilled' && s.value?.ok ? s.value.items || [] : [])
      setRess(r.status === 'fulfilled' && r.value?.ok ? r.value.reservations || [] : [])
    })()
    return () => {
      alive = false
    }
  }, [open, meds])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = []

    const pages = PAGES.filter(
      (p) => !needle || `${p.label} ${p.sub}`.toLowerCase().includes(needle),
    )
    if (pages.length) out.push({ title: 'Páginas', items: pages })
    if (!needle) return out

    if (meds) {
      const items = meds
        .filter((it) => !it.retired_at)
        .filter((it) =>
          `${it.name || ''} ${it.molecule || ''} ${it.form || ''}`.toLowerCase().includes(needle),
        )
        .slice(0, 6)
        .map((it) => ({
          label: it.name,
          sub: [
            [it.form, it.dosage].filter(Boolean).join(' · '),
            it.in_stock ? `${it.quantity ?? 0} em stock` : 'sem stock',
          ]
            .filter(Boolean)
            .join(' — '),
          href: `/portal/stock?q=${encodeURIComponent(it.name)}`,
        }))
      if (items.length) out.push({ title: 'Medicamentos', items })
    }

    if (ress) {
      const items = ress
        .filter((r) => {
          const d = r.drugs || {}
          return [d.name, r.requester_name, r.requester_phone].some((v) =>
            String(v || '')
              .toLowerCase()
              .includes(needle),
          )
        })
        .slice(0, 5)
        .map((r) => {
          const d = r.drugs || {}
          const key = r.requester_phone || r.requester_name || d.name || ''
          return {
            label: `${d.name || 'Medicamento'} — ${r.requester_name || 'cliente'}`,
            sub: `${RES_ST[r.status] || r.status} · ${r.requester_phone || 'sem telefone'}`,
            href: `/portal/reservas?q=${encodeURIComponent(key)}`,
          }
        })
      if (items.length) out.push({ title: 'Reservas', items })
    }

    return out
  }, [q, meds, ress])

  const go = (item) => {
    router.push(item.href)
    setOpen(false)
    setQ('')
  }

  const first = groups[0]?.items[0]

  return (
    <div className={`portal-topsearch${open ? ' is-open' : ''}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder="Pesquisar no portal…"
        aria-label="Pesquisar páginas, medicamentos e reservas"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && first) {
            e.preventDefault()
            go(first)
          }
        }}
      />
      <kbd aria-hidden="true">/</kbd>

      {open && (
        <>
          {/* Backdrop: tocar fora fecha o painel de resultados. */}
          <div
            className="portal-search-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="portal-search-pop" role="listbox" aria-label="Resultados da pesquisa">
            {groups.length === 0 && (
              <p className="portal-search-empty">
                Nada para «{q}» — tente o nome do medicamento, o cliente ou a página.
              </p>
            )}
            {groups.map((g) => (
              <div key={g.title} className="portal-search-group">
                <span className="portal-search-group-k">{g.title}</span>
                {g.items.map((item) => (
                  <button
                    key={`${g.title}-${item.href}-${item.label}`}
                    type="button"
                    className="portal-search-item"
                    role="option"
                    onClick={() => go(item)}
                  >
                    <b>{item.label}</b>
                    <span>{item.sub}</span>
                  </button>
                ))}
              </div>
            ))}
            {meds === null && q.trim() && (
              <p className="portal-search-empty">A carregar medicamentos e reservas…</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
