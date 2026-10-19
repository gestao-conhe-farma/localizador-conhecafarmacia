'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CloseIcon } from '@/components/ui/Icon'

// Entrada: o painel desliza da direita para o ecrã. Saída: o caminho inverso.
// O AnimatePresence mantém o painel montado até a saída terminar.
const ENTER = { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] }

/**
 * Painel lateral (drawer) — o padrão de formulário do portal: os campos
 * nunca vivem «à mostra» na página; abrem num painel à direita, sobre
 * um scrim que ofusca o conteúdo, e fecham com ✕, Esc ou clique fora.
 *
 * Presentacional: quem o usa é que guarda o estado (`open`) e o que
 * dentro dele acontece — aqui só se monta o chassi (head, body, foot)
 * e se cuida do fecho.
 */
export default function PortalDrawer({
  open,
  title,
  hint,
  onClose,
  children,
  footer,
  cardClassName = '',
}) {
  // Esc fecha — mesmo contrato do StockEditModal.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="portal-drawer"
          className="portal-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className="portal-drawer-scrim"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: EXIT }}
            transition={ENTER}
          />
          <motion.div
            className={`portal-drawer-card${cardClassName ? ` ${cardClassName}` : ''}`}
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: ENTER }}
            exit={{ x: '100%', transition: EXIT }}
          >
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
