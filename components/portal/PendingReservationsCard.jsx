'use client'

import { useEffect, useMemo, useState } from 'react'
import { getMyReservations, setReservationStatus } from '@/lib/actions/pharmacy-portal'
import { quantityDesc } from '@/lib/reservation-format'

const REASONS = [
  { id: 'sem_stock', label: 'Sem stock' },
  { id: 'zona', label: 'Não atendemos essa zona' },
  { id: 'outro', label: 'Outro motivo' },
]

/** «há 2h» / «há 3 d» — idade do pedido (mesmo relógio da fila). */
function quando(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

/**
 * «Reservas por atender» da Visão geral (mock modelo-a-v2, cartão à
 * esquerda): as 3 mais antigas primeiro, com Confirmar (único sólido)
 * e Recusar no mesmo estilo da fila — painéis inline de quantidade e
 * de motivo. Os detalhes completos ficam em /portal/reservas.
 */
export default function PendingReservationsCard() {
  const [rows, setRows] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmQty, setConfirmQty] = useState('')
  const [rejectingId, setRejectingId] = useState(null)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherReason, setOtherReason] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let alive = true
    getMyReservations()
      .then((res) => {
        if (alive) setRows(res.ok ? res.reservations : [])
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [])

  const pend = useMemo(() => {
    const list = (rows || []).filter((r) => r.status === 'pendente')
    // Mais antiga primeiro — quem espera há mais tempo está no topo.
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return list.slice(0, 3)
  }, [rows])

  const act = async (r, status, extra = {}) => {
    setBusyId(r.id)
    setErro('')
    const res = await setReservationStatus({ reservationId: r.id, status, ...extra })
    setBusyId(null)
    if (res.ok) {
      setRows((list) =>
        list.map((row) =>
          row.id === r.id
            ? {
                ...row,
                status,
                reason: extra.reason ?? row.reason,
                resolved_at: new Date().toISOString(),
              }
            : row,
        ),
      )
      setConfirmingId(null)
      setRejectingId(null)
      setOtherOpen(false)
      setOtherReason('')
      setConfirmQty('')
    } else {
      setErro(res.error?.split(':')[0] || 'Não foi possível actualizar.')
    }
  }

  const doConfirm = (r) => {
    const q = confirmQty.trim()
    act(r, 'confirmada', q === '' ? {} : { confirmedQuantity: q })
  }

  const doRejectOther = (r) => {
    const text = otherReason.trim()
    if (!text) {
      setErro('Escreva o motivo antes de recusar.')
      return
    }
    act(r, 'recusada', { reason: `outro:${text}` })
  }

  return (
    <>
      {rows === null && (
        <div className="portal-rows-empty" role="status">
          A carregar reservas…
        </div>
      )}

      {rows !== null && pend.length === 0 && (
        <div className="portal-rows-empty">
          <b>Tudo respondido</b>
          Não há reservas por atender. Os novos pedidos aparecem aqui sozinhos — e o prazo de
          resposta é de 72 horas.
        </div>
      )}

      {pend.map((r) => {
        const d = r.drugs || {}
        const idade = Date.now() - new Date(r.created_at).getTime()
        const stCls = idade > 48 * 3600 * 1000 ? 'bad' : 'warn'
        const meta = [
          r.requester_name,
          r.requester_phone,
          quantityDesc(r),
          r.notes ? `«${r.notes}»` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <div key={r.id} className="portal-pend-row">
            <div style={{ minWidth: 0 }}>
              <div className="portal-pend-name">{d.name || 'Medicamento'}</div>
              <div className="portal-pend-meta">{meta}</div>
            </div>
            <span className={`portal-st portal-st--${stCls}`}>
              <i />
              {quando(r.created_at)}
            </span>
            <div className="portal-res-actions">
              {confirmingId !== r.id && rejectingId !== r.id && (
                <>
                  <button
                    type="button"
                    className="btn-mini portal-act-ok"
                    disabled={busyId === r.id}
                    onClick={() => {
                      setConfirmingId(r.id)
                      setConfirmQty('')
                    }}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    className="btn-mini portal-act-no"
                    disabled={busyId === r.id}
                    onClick={() => setRejectingId(r.id)}
                  >
                    Recusar
                  </button>
                </>
              )}

              {confirmingId === r.id && (
                <div className="res-confirm-panel" style={{ width: '100%' }}>
                  <label className="res-confirm-label">
                    Unidades a separar
                    <input
                      type="number"
                      min="0"
                      className="portal-input portal-input--price"
                      value={confirmQty}
                      placeholder={String(r.quantity)}
                      onChange={(e) => setConfirmQty(e.target.value)}
                      autoFocus
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-mini portal-act-ok"
                    disabled={busyId === r.id}
                    onClick={() => doConfirm(r)}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    className="btn-mini portal-act-no"
                    onClick={() => setConfirmingId(null)}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {rejectingId === r.id && (
                <div className="res-reject-panel" style={{ width: '100%' }}>
                  {REASONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`btn-mini portal-act-no${m.id === 'outro' && otherOpen ? ' res-other-btn--open' : ''}`}
                      disabled={busyId === r.id}
                      onClick={() => {
                        if (m.id === 'outro') {
                          setOtherOpen(true)
                          setOtherReason('')
                        } else {
                          act(r, 'recusada', { reason: m.id })
                        }
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn-mini portal-act-no"
                    onClick={() => {
                      setRejectingId(null)
                      setOtherOpen(false)
                    }}
                  >
                    Cancelar
                  </button>
                  {otherOpen && (
                    <div className="res-other-box">
                      <label className="res-confirm-label">
                        Detalhe o motivo (o cliente lê isto)
                        <textarea
                          className="portal-input res-other-input"
                          rows={2}
                          maxLength={300}
                          placeholder="Ex.: só atendemos levantamento no próprio dia."
                          value={otherReason}
                          onChange={(e) => setOtherReason(e.target.value)}
                          autoFocus
                        />
                      </label>
                      <div className="res-other-actions">
                        <span className="res-other-count">{otherReason.length}/300</span>
                        <button
                          type="button"
                          className="btn-mini portal-act-no"
                          disabled={busyId === r.id || !otherReason.trim()}
                          onClick={() => doRejectOther(r)}
                        >
                          Recusar
                        </button>
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() => {
                            setOtherOpen(false)
                            setOtherReason('')
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {erro && (
        <p className="portal-error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
          {erro}
        </p>
      )}
    </>
  )
}
