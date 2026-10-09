'use client'

import { useEffect } from 'react'
import { CloseIcon } from '@/components/ui/Icon'

/**
 * Painel lateral (drawer) — o padrão de formulário do portal: os campos
 * nunca vivem «à mostra» na página; abrem num painel à direita, sobre
 * um scrim que ofusca o conteúdo, e fecham com ✕, Esc ou clique fora.
 *
 * Presentacional: quem o usa é que guarda o estado (`open`) e o que
 * dentro dele acontece — aqui só se monta o chassi (head, body, foot)
 * e se cuida do fecho.
 */
export default function PortalDrawer({ open, title, hint, onClose, children, footer }) {
  // Esc fecha — mesmo contrato do StockEditModal.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="portal-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="portal-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="portal-drawer-card">
        <div className="portal-drawer-head">
          <div className="portal-drawer-head-txt">
            <h3>{title}</h3>
            {hint && <p>{hint}</p>}
          </div>
          <button
            type="button"
            className="portal-drawer-x"
            onClick={onClose}
            aria-label="Fechar sem guardar"
          >
            <CloseIcon size={15} />
          </button>
        </div>
        <div className="portal-drawer-body">{children}</div>
        {footer && <div className="portal-drawer-foot">{footer}</div>}
      </div>
    </div>
  )
}
