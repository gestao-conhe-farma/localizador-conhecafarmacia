'use client'

import { useEffect, useRef, useState } from 'react'
import ProductSheet from '@/components/search/ProductSheet'
import { fetchProductClient } from '@/lib/stock'
import { logError } from '@/lib/log'

/**
 * Ficha do produto em cartão sobre a página — o mesmo `ProductSheet` da
 * rota /produto/[id], mas sem navegar: a lista de resultados fica por
 * baixo, desfocada, e fechar devolve o cliente ao ponto exacto onde
 * estava (com a pesquisa, os filtros e o scroll intactos).
 *
 * Os dados são lidos no browser (view `stock_confirmed`), como a
 * prateleira da farmácia faz no refetch — nada de novo render do
 * servidor para abrir uma ficha.
 */
export default function ProductModal({ stockItemId, onClose, onOpenItem }) {
  // Um só estado com o id que o produziu: mudar de produto reinicia no
  // render (sem um setState síncrono no efeito) e uma resposta atrasada do
  // produto anterior nunca escreve por cima do actual.
  const [state, setState] = useState({ id: null, data: null, error: false, loading: true })
  const cardRef = useRef(null)
  const bodyRef = useRef(null)
  const closeRef = useRef(null)
  const restoreRef = useRef(null)

  if (state.id !== stockItemId) {
    setState({ id: stockItemId, data: null, error: false, loading: true })
  }

  useEffect(() => {
    let alive = true
    fetchProductClient(stockItemId)
      .then((res) => {
        if (!alive) return
        setState({ id: stockItemId, data: res, error: !res, loading: false })
      })
      .catch((err) => {
        logError('product-modal', 'Falha ao abrir a ficha', {
          id: stockItemId,
          message: err?.message,
        })
        if (alive) setState({ id: stockItemId, data: null, error: true, loading: false })
      })
    return () => {
      alive = false
    }
  }, [stockItemId])

  // Outra farmácia escolhida nas alternativas: o cartão volta ao topo.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [stockItemId])

  const { data, error, loading } = state

  // Escape fecha; a página por baixo não rola enquanto o cartão está aberto.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // Foco preso ao cartão: Tab no último controlo volta ao primeiro.
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusables = [
        ...card.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    restoreRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      const restore = restoreRef.current
      if (restore && typeof restore.focus === 'function') restore.focus()
    }
  }, [onClose])

  const title = data?.item?.drug_name || 'Ficha do produto'

  return (
    <div
      className="pdp-modal"
      onMouseDown={(e) => {
        // Só o fundo fecha — um arrasto que acaba no cartão não conta.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="pdp-modal__card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="pdp-modal__bar">
          <span className="pdp-modal__tag">Ficha do produto</span>
          <button
            type="button"
            className="pdp-modal__close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Fechar ficha"
            title="Fechar (Esc)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="pdp-modal__body" ref={bodyRef}>
          {loading && (
            <div className="pdp-modal__state" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A abrir a ficha…</p>
            </div>
          )}

          {!loading && error && (
            <div className="pdp-modal__state">
              <p className="sh-empty-title">Este produto já não está no Localizador</p>
              <p className="sh-empty-sub">
                A farmácia pode ter deixado de confirmar o stock ou o item pode ter sido vendido.
                Feche a ficha e procure outra vez.
              </p>
              <p style={{ marginTop: 18 }}>
                <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
                  Voltar aos resultados
                </button>
              </p>
            </div>
          )}

          {!loading && !error && data && (
            <ProductSheet
              key={data.item.stock_item_id}
              item={data.item}
              alternatives={data.alternatives}
              modal
              onOpenItem={onOpenItem}
            />
          )}
        </div>
      </div>
    </div>
  )
}
