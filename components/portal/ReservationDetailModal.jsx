'use client'

import { useEffect, useState } from 'react'
import { trackingUrl } from '@/lib/reservation-messages'
import { CheckIcon } from '@/components/ui/Icon'

/**
 * Pop-up de detalhe da reserva — o mesmo padrão visual do modal de stock
 * (scrim + card centrado, Esc fecha). Reúne o que o card não mostra:
 * cronologia completa, notas e motivo na íntegra, link de acompanhamento
 * para copiar e o montante estimado com a decomposição.
 *
 * As acções de transição ficam nos cards (fila é para movimentar rápido);
 * aqui é leitura — só o WhatsApp repete, para o caso de o atendente abrir
 * o detalhe a partir de uma reserva já confirmada.
 */

const BADGES = {
  pendente: { label: 'Pendente', cls: 'portal-badge--warn' },
  confirmada: { label: 'Confirmada', cls: 'portal-badge--info' },
  pronta: { label: 'Pronta p/ recolha', cls: 'portal-badge--info' },
  concluida: { label: 'Concluída', cls: 'portal-badge--ok' },
  recusada: { label: 'Recusada', cls: 'portal-badge--off' },
  expirada: { label: 'Expirada', cls: 'portal-badge--off' },
}

import { fmtKz, estimateTotal } from '@/lib/reservation-format'

/** Data/hora completa — o modal é onde o "há 2 h" do card se abre em dia e hora. */
function fmtDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('pt-PT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Motivo legível (reason é "chave" ou "chave:texto") — mesma regra da fila. */
function reasonLabel(reason) {
  if (!reason) return null
  const [key, ...rest] = String(reason).split(':')
  const map = {
    sem_stock: 'Sem stock',
    zona: 'Zona não atendida',
    outro: 'Motivo',
    ttl: 'Prazo de 72 h vencido',
  }
  const base = map[key.trim()] || key
  return rest.length > 0 ? `${base}: ${rest.join(':').trim()}` : base
}

/** Descrição do que foi reservado — "1 caixa (3 lâminas)" (0012). */
function saleOptionInfo(r) {
  if (!r.sale_option_id) return null
  const opt = (r.item_options || []).find((o) => o.id === r.sale_option_id)
  if (!opt) return null
  const base = (r.item_options || []).find((o) => o.is_default && o.id !== opt.id)
  const baseLabel = base ? base.unit : null
  const pack = opt.pack_size ?? 1
  const unit = pack > 1 ? `${opt.unit} (${pack} ${baseLabel || 'un.'})` : opt.unit
  return `${r.quantity} × ${unit}`
}

/**
 * Cronologia da reserva — só as etapas que aconteceram (ou o prazo a
 * correr, nas pendentes). Cada linha: o quê, quando em completo.
 */
function timeline(r) {
  const steps = []
  if (r.created_at) steps.push({ label: 'Reserva recebida', at: r.created_at })
  if (r.status === 'pendente' && r.expires_at) {
    steps.push({ label: 'Prazo para resposta (72 h)', at: r.expires_at, pending: true })
  }
  if (r.client_contacted_at)
    steps.push({ label: 'Cliente avisado (WhatsApp)', at: r.client_contacted_at })
  if (r.status !== 'pendente') {
    steps.push({
      label: r.status === 'concluida' ? 'Levantada no balcão' : 'Encerrada',
      at: r.resolved_at,
    })
  }
  return steps.filter((s) => s.label)
}

export default function ReservationDetailModal({
  reservation: r,
  pharmacyName,
  busy = false,
  onClose,
  onWhatsApp,
}) {
  const [copied, setCopied] = useState(false)
  const badge = BADGES[r.status] || { label: r.status, cls: '' }
  const d = r.drugs || {}
  const opt = r.stock_sale_options
  const total = estimateTotal(r)
  const qty = r.confirmed_quantity ?? r.quantity

  // Esc fecha — o mesmo comportamento do modal de stock.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl(r.id))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {
      /* clipboard indisponível — o link fica visível para copiar à mão */
    }
  }

  return (
    <div className="stock-modal" role="dialog" aria-modal="true" aria-labelledby="res-detail-title">
      <div className="stock-modal-scrim" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal-card res-detail-card">
        <div className="portal-section-head" style={{ marginBottom: 0 }}>
          <h3 id="res-detail-title" className="portal-h2">
            {d.name || 'Reserva'}
            {d.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
          </h3>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
            aria-label="Fechar detalhes"
          >
            Fechar
          </button>
        </div>

        <p className="stock-modal-state">
          {[d.form, d.dosage].filter(Boolean).join(' · ') || 'Medicamento'} — {pharmacyName}
        </p>

        {/* Estado + valor — o cabeçalho da ficha. */}
        <div className="res-detail-badges">
          <span className={`portal-badge ${badge.cls}`}>{badge.label}</span>
          {total != null && (
            <span className="stock-tag res-tag-price">
              ≈ {fmtKz(total)}
              {qty != null && opt?.price != null ? (
                <i className="res-detail-calc">
                  {' '}
                  ({qty} × {fmtKz(Number(opt.price))})
                </i>
              ) : null}
            </span>
          )}
        </div>

        {/* Ficha: uma linha rótulo → valor por facto relevante. */}
        <dl className="res-detail-grid">
          <div className="res-detail-row">
            <dt>Cliente</dt>
            <dd>
              {r.requester_name || '—'}
              {r.requester_phone && (
                <>
                  {' · '}
                  <a href={`tel:${r.requester_phone}`}>{r.requester_phone}</a>
                </>
              )}
            </dd>
          </div>
          <div className="res-detail-row">
            <dt>Reservado</dt>
            <dd>{saleOptionInfo(r) || `${r.quantity}×${opt ? ` ${opt.unit}` : ' un.'}`}</dd>
          </div>
          {r.confirmed_quantity != null && r.confirmed_quantity !== r.quantity && (
            <div className="res-detail-row">
              <dt>Confirmado</dt>
              <dd>
                {r.confirmed_quantity} de {r.quantity} — parcial
              </dd>
            </div>
          )}
          {r.notes && (
            <div className="res-detail-row">
              <dt>Nota do cliente</dt>
              <dd>“{r.notes}”</dd>
            </div>
          )}
          {reasonLabel(r.reason) && (
            <div className="res-detail-row">
              <dt>Motivo</dt>
              <dd>{reasonLabel(r.reason)}</dd>
            </div>
          )}
          {r.status === 'pendente' && r.expires_at && (
            <div className="res-detail-row">
              <dt>Prazo</dt>
              <dd>
                Responder até {fmtDateTime(r.expires_at)} (72 h da entrada — depois expira
                automaticamente)
              </dd>
            </div>
          )}
        </dl>

        {/* Cronologia — cada etapa com data/hora completas. */}
        <div className="res-detail-section">
          <b>Cronologia</b>
          <ol className="res-detail-timeline">
            {timeline(r).map((s, i) => (
              <li key={i} className={s.pending ? 'res-detail-step--pending' : ''}>
                <span className="res-detail-step-label">{s.label}</span>
                <span className="res-detail-step-at">{s.at ? fmtDateTime(s.at) : '—'}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Link de acompanhamento — para colar no WhatsApp manual. */}
        <div className="res-detail-section">
          <b>Link de acompanhamento do cliente</b>
          <div className="res-detail-link">
            <code>{trackingUrl(r.id)}</code>
            <button type="button" className="btn-mini res-details-btn" onClick={copyLink}>
              {copied ? (
                <>
                  <CheckIcon /> Copiado
                </>
              ) : (
                'Copiar'
              )}
            </button>
          </div>
        </div>

        <div className="stock-modal-actions">
          {['confirmada', 'pronta', 'recusada', 'expirada'].includes(r.status) && (
            <button
              type="button"
              className="btn-mini res-wa-btn"
              disabled={busy}
              onClick={onWhatsApp}
            >
              Avisar cliente no WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
