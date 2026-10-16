'use client'

import { useEffect, useRef, useState } from 'react'
import Notice from '@/components/ui/Notice'

/**
 * Confirmação de uma acção sensível — com MOTIVO e com o resumo do antes e
 * depois à vista (Task 5.2 do plano: «cada uma em ConfirmActionModal com
 * motivo obrigatório nas destrutivas»).
 *
 * O motivo não é enfeite de formulário: é o que fica gravado em
 * `platform_audit_log.reason` e o que responde, três meses depois, à
 * pergunta «porque é que esta farmácia saiu do ar?». Por isso o botão só
 * destrava com texto escrito — e o servidor recusa de novo, com
 * `MOTIVO_OBRIGATORIO`, se alguém contornar este ecrã.
 *
 * O diálogo fecha com Escape e com o clique no véu, mas NUNCA enquanto a
 * acção está a correr: perder o ecrã a meio deixaria a pessoa sem saber se
 * a farmácia ficou desactivada.
 */
export default function ConfirmActionModal({
  titulo,
  descricao,
  resumo,
  aviso,
  motivoObrigatorio = false,
  confirmLabel = 'Confirmar',
  tom = 'primary',
  pending = false,
  erro = null,
  onCancel,
  onConfirm,
}) {
  const [motivo, setMotivo] = useState('')
  const caixa = useRef(null)

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCancel, pending])

  const faltaMotivo = motivoObrigatorio && motivo.trim().length < 3

  return (
    <div
      className="interno-modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
    >
      <div
        className="interno-modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={caixa}
        tabIndex={-1}
      >
        <div className="interno-modal-head">
          <span className="interno-modal-title">{titulo}</span>
          <button
            type="button"
            className="interno-modal-close"
            onClick={onCancel}
            disabled={pending}
            aria-label="Fechar sem aplicar"
          >
            ×
          </button>
        </div>

        <div className="interno-modal-body">
          {descricao && <p>{descricao}</p>}

          {resumo && <dl className="interno-dl">{resumo}</dl>}

          {aviso}

          {motivoObrigatorio ? (
            <label className="interno-label">
              Motivo — fica na trilha de auditoria
              <textarea
                className="interno-textarea"
                rows={3}
                value={motivo}
                autoFocus
                disabled={pending}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: pedido da farmácia por telefone, a conta foi suspensa a pedido do dono…"
              />
            </label>
          ) : (
            <Notice tone="warn">
              Esta alteração fica registada na trilha com o seu e-mail e a data.
            </Notice>
          )}

          {erro && (
            <Notice tone="danger" role="alert">
              {erro}
            </Notice>
          )}
        </div>

        <div className="interno-modal-acts">
          <button
            type="button"
            className="interno-btn interno-btn--ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={
              tom === 'danger'
                ? 'interno-btn interno-btn--danger'
                : 'interno-btn interno-btn--primary'
            }
            onClick={() => onConfirm(motivo)}
            disabled={pending || faltaMotivo}
          >
            {pending ? 'A aplicar…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
