'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getMyReservations,
  setReservationStatus,
  markClientContacted,
} from '@/lib/actions/pharmacy-portal'
import { buildReservationMessage, waLink, trackingUrl } from '@/lib/reservation-messages'
import { logWarn } from '@/lib/log'
import ReservationDetailModal from '@/components/portal/ReservationDetailModal'
import { CheckIcon } from '@/components/ui/Icon'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página.',
  ESTADO_INVALIDO: 'Estado inválido.',
  MOTIVO_INVALIDO: 'Motivo de recusa inválido.',
  QUANTIDADE_INVALIDA: 'Quantidade inválida (0 ou mais).',
  RESERVA_INEXISTENTE: 'Reserva não encontrada.',
  FALHA_ACTUALIZAR: 'Não foi possível actualizar. Tente novamente.',
  FALHA_CARREGAR: 'Não foi possível carregar as reservas.',
}

const BADGES = {
  pendente: { label: 'Pendente', cls: 'portal-badge--warn' },
  confirmada: { label: 'Confirmada', cls: 'portal-badge--info' },
  pronta: { label: 'Pronta p/ recolha', cls: 'portal-badge--info' },
  concluida: { label: 'Concluída', cls: 'portal-badge--ok' },
  recusada: { label: 'Recusada', cls: 'portal-badge--off' },
  expirada: { label: 'Expirada', cls: 'portal-badge--off' },
}

const REJECT_REASONS = [
  { id: 'sem_stock', label: 'Sem stock' },
  { id: 'zona', label: 'Não atendemos essa zona' },
  { id: 'outro', label: 'Outro motivo' },
]

const ERRO_OUTRO_VAZIO = 'Escreva o motivo antes de recusar.'

/** Chips de filtro — o mesmo padrão dos FILTERS do StockPanel. */
const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'ativas', label: 'A decorrer' },
  { id: 'resolvidas', label: 'Resolvidas' },
]

function when(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

/** Horas que faltam (ou passaram) para o TTL de 72h. */
function ttlLabel(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'prazo vencido'
  const h = Math.floor(ms / 3600000)
  if (h >= 1) return `responde em até ${h} h`
  return `responde em até ${Math.max(1, Math.round(ms / 60000))} min`
}

/**
 * O que dizer à farmácia depois de concluir: concluir baixa o stock
 * (trigger da migração 0006), por isso vale a pena mostrar o resultado.
 */
function concludedMessage(stock) {
  if (!stock) return 'Reserva concluída.'
  if (stock.in_stock === false) {
    return 'Reserva concluída — sem unidades. O produto saiu do Localizador.'
  }
  if (stock.quantity != null) return `Reserva concluída — restam ${stock.quantity} em stock.`
  return 'Reserva concluída — o stock foi actualizado.'
}

import { fmtKz, estimateTotal } from '@/lib/reservation-format'

/**
 * Descrição completa do que foi reservado (0012): "1 caixa (3 lâminas)"
 * — pack_size e unidade-base incluídos; "2 × lâmina" para pack 1.
 */
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

/** Motivo legível na ficha do card (reason é "chave" ou "chave:texto"). */
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

/**
 * Fila de reservas em cards — o mesmo padrão visual do StockPanel:
 * chips de filtro com contagens, grid responsivo de cartões e as acções
 * no pé do card.
 *
 * Fluxo WhatsApp-first (o portal não envia — prepara): cada transição
 * devolve o link wa.me com a mensagem já montada; ao tocar, o atendente
 * envia do WhatsApp da própria farmácia e marcamos client_contacted_at.
 * Realtime: a fila refresca sozinha (canal filtrado por pharmacy_id).
 */
export default function ReservationsQueue() {
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')
  // Recusa em curso (id) — mostra as opções de motivo no card.
  const [rejectingId, setRejectingId] = useState(null)
  // Texto livre do motivo "outro" — o atendente detalha porquê, e o
  // texto chega ao cliente na página de acompanhamento e no WhatsApp.
  const [otherReason, setOtherReason] = useState('')
  // Recusa "outro motivo" aberta (id) — mostra a caixa de texto no card.
  const [otherOpen, setOtherOpen] = useState(null)
  // Confirmação em curso (id) — mini-prompt de quantidade separada.
  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmQty, setConfirmQty] = useState('')
  // Reserva aberta no modal de detalhe (null = fechado).
  const [detailId, setDetailId] = useState(null)
  // Links wa.me por reserva (montados no cliente a partir dos dados).
  const pharmacyNameRef = useRef('')

  /** Mensagem de sucesso que se apaga sozinha (o mesmo toast serve de erro). */
  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 4000)
  }

  const load = useCallback(async () => {
    const res = await getMyReservations()
    if (res.ok) {
      setRows(res.reservations)
      pharmacyNameRef.current = res.pharmacyName || ''
    } else {
      setRows([])
      setToast(ERRORES[res.error] || ERRORES.FALHA_CARREGAR)
    }
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: INSERT/UPDATE em reservations desta farmácia refresca a fila.
  // Debounce 500 ms — a expiração do cron pode tocar muitas linhas de uma vez.
  useEffect(() => {
    const supabase = createClient()
    let pharmacyId = null
    let timer = null
    const channel = supabase
      .channel('portal-reservations-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        clearTimeout(timer)
        timer = setTimeout(load, 500)
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('portal-reservas', 'Realtime da fila indisponível', { status })
        }
      })
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [load])

  const act = async (id, status, extra = {}) => {
    setBusyId(id)
    setToast('')
    const res = await setReservationStatus({ reservationId: id, status, ...extra })
    setBusyId(null)
    if (res.ok) {
      setRows((list) =>
        list.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                reason: extra.reason ?? r.reason,
                resolved_at: new Date().toISOString(),
              }
            : r,
        ),
      )
      setRejectingId(null)
      setConfirmingId(null)
      setOtherOpen(null)
      if (status === 'concluida') flash(concludedMessage(res.stock))
      // O template de WhatsApp devolvido pelo action abre no toque do
      // botão "Avisar cliente" — aqui só confirmamos o estado.
      return res
    }
    setToast(ERRORES[res.error]?.split(':')[0] || 'Erro inesperado.')
    load() // re-sincroniza se o movimento foi rejeitado
    return res
  }

  /** Abre o WhatsApp do cliente com a mensagem do estado e marca o contacto. */
  const openWhatsApp = (r) => {
    const msg = buildReservationMessage({
      id: r.id,
      status: r.status,
      reason: r.reason,
      quantity: r.quantity,
      confirmed_quantity: r.confirmed_quantity,
      requester_name: r.requester_name,
      drugName: r.drugs?.name,
      pharmacyName: pharmacyNameRef.current,
      saleUnit: r.stock_sale_options?.unit,
      salePack: r.stock_sale_options?.pack_size,
      saleUnitPrice: r.stock_sale_options?.price,
      saleBaseUnit: (r.item_options || []).find((o) => o.is_default && o.id !== r.sale_option_id)
        ?.unit,
      // Origem/marca (0013) — entram na mensagem ao cliente.
      origin: r.origin,
      brand: r.brand,
    })
    const link = msg ? waLink(r.requester_phone, msg.text) : null
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
    markClientContacted({ reservationId: r.id })
      .then((res) => {
        if (res.ok) {
          setRows((list) =>
            list.map((row) =>
              row.id === r.id ? { ...row, client_contacted_at: new Date().toISOString() } : row,
            ),
          )
        }
      })
      .catch(() => {}) // fire-and-forget: o rasto não pode bloquear o envio
  }

  /** Confirma com ajuste de quantidade (vazio = confirmar tudo). */
  const doConfirm = async (r) => {
    const q = confirmQty.trim()
    const extra = q === '' ? {} : { confirmedQuantity: q }
    const res = await act(r.id, 'confirmada', extra)
    if (res.ok) setConfirmQty('')
  }

  /**
   * Recusa "outro motivo": exige o texto — "não vamos poder atender"
   * sem dizer porquê deixa o cliente sem resposta. Envia "outro:<texto>"
   * (o formato que o action já aceita e a página de acompanhamento lê).
   */
  const doRejectOther = async (r) => {
    const text = otherReason.trim()
    if (!text) {
      flash(ERRO_OUTRO_VAZIO)
      return
    }
    const res = await act(r.id, 'recusada', { reason: `outro:${text}` })
    if (res.ok) setOtherReason('')
  }

  /** Contagens dos chips — sobre a lista completa, como no StockPanel. */
  const counts = useMemo(() => {
    const c = { all: 0, pendente: 0, ativas: 0, resolvidas: 0 }
    for (const r of rows || []) {
      c.all += 1
      if (r.status === 'pendente') c.pendente += 1
      else if (r.status === 'confirmada' || r.status === 'pronta') c.ativas += 1
      else c.resolvidas += 1
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const match = {
      all: () => true,
      pendente: (r) => r.status === 'pendente',
      ativas: (r) => r.status === 'confirmada' || r.status === 'pronta',
      resolvidas: (r) =>
        r.status === 'concluida' || r.status === 'recusada' || r.status === 'expirada',
    }[filter]
    // Mais recentes primeiro dentro de cada filtro.
    return rows.filter(match).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [rows, filter])

  if (rows === null) {
    return (
      <div className="empty-state" role="status">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <section className="portal-section">
      {/* Padrão único do portal: cabeçalho compacto, sem hero. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Reservas</h1>
          <p className="portal-page-sub">
            {counts.pendente > 0 ? (
              <>
                <b>{counts.pendente}</b> por atender — responda em menos de 72 horas para não
                expirarem.
              </>
            ) : (
              'Nenhuma reserva por atender.'
            )}
          </p>
        </div>
      </div>

      {/* Toolbar única — filtros numa linha, à esquerda. */}
      <div className="portal-toolbar portal-toolbar--left">
        <div className="portal-chips" role="group" aria-label="Filtrar reservas por estado">
          {FILTERS.map((f) => (
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

      {rows.length === 0 && (
        <div className="empty-state">
          <p className="empty-sub">
            Ainda não há reservas. Quando um cliente reservar pelo Localizador, aparece aqui — e é
            bom responder em menos de 72 horas.
          </p>
        </div>
      )}

      {rows.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-sub">Nenhuma reserva neste estado.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="stock-grid">
          {filtered.map((r) => {
            const badge = BADGES[r.status] || { label: r.status, cls: '' }
            const d = r.drugs || {}
            const resolved = ['concluida', 'recusada', 'expirada'].includes(r.status)
            const rejecting = rejectingId === r.id
            const confirming = confirmingId === r.id
            const contactado = r.client_contacted_at != null
            return (
              <article
                key={r.id}
                className={`res-card${r.status === 'pendente' ? ' res-card--urgent' : ''}`}
              >
                <div className="stock-card-top">
                  <button
                    type="button"
                    className="stock-card-name-btn"
                    onClick={() => setDetailId(r.id)}
                    title="Ver detalhes da reserva"
                  >
                    {d.name || 'Medicamento'}
                  </button>
                  <span className={`portal-badge ${badge.cls}`}>{badge.label}</span>
                </div>

                <p className="stock-card-meta">{[d.form, d.dosage].filter(Boolean).join(' · ')}</p>

                <div className="stock-card-tags">
                  <span className="stock-tag">
                    {saleOptionInfo(r) ||
                      (r.confirmed_quantity != null && r.confirmed_quantity !== r.quantity
                        ? `${r.confirmed_quantity} de ${r.quantity}×`
                        : `${r.quantity}×`)}
                  </span>
                  {estimateTotal(r) != null && (
                    <span className="stock-tag res-tag-price">≈ {fmtKz(estimateTotal(r))}</span>
                  )}
                  <span className="stock-tag">{when(r.created_at)}</span>
                  {r.requester_name && <span className="stock-tag">{r.requester_name}</span>}
                  {r.requester_phone && (
                    <a className="stock-tag res-tag-phone" href={`tel:${r.requester_phone}`}>
                      {r.requester_phone}
                    </a>
                  )}
                </div>

                {r.notes && <p className="res-card-note">“{r.notes}”</p>}
                {reasonLabel(r.reason) && r.status !== 'recusada' && (
                  <p className="res-card-note">{reasonLabel(r.reason)}</p>
                )}
                {r.status === 'pendente' && r.expires_at && (
                  <p className="res-card-note">⏳ {ttlLabel(r.expires_at)}</p>
                )}

                <div className="stock-card-foot">
                  {resolved ? (
                    <span className="stock-card-hint">
                      Resolvida {r.resolved_at ? when(r.resolved_at) : ''}
                      {reasonLabel(r.reason) ? ` · ${reasonLabel(r.reason)}` : ''}
                    </span>
                  ) : (
                    <span className={`stock-card-hint${contactado ? ' res-hint-ok' : ''}`}>
                      {contactado ? (
                        <>
                          <CheckIcon /> cliente avisado
                        </>
                      ) : (
                        'A aguardar a sua resposta'
                      )}
                    </span>
                  )}
                  <div className="portal-res-actions">
                    {/* Detalhes — ficha completa no pop-up */}
                    <button
                      type="button"
                      className="btn-mini res-details-btn"
                      onClick={() => setDetailId(r.id)}
                    >
                      Detalhes
                    </button>
                    {/* Transições */}
                    {r.status === 'pendente' && !confirming && !rejecting && (
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
                    {r.status === 'confirmada' && !rejecting && (
                      <button
                        type="button"
                        className="btn-mini portal-act-ok"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'pronta')}
                      >
                        Pronta
                      </button>
                    )}
                    {r.status === 'pronta' && (
                      <button
                        type="button"
                        className="btn-mini portal-act-ok"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'concluida')}
                      >
                        Concluída
                      </button>
                    )}

                    {/* Recusa com motivo — painel inline no card */}
                    {rejecting && (
                      <div className="res-reject-panel">
                        {REJECT_REASONS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`btn-mini portal-act-no${
                              m.id === 'outro' && otherOpen ? ' res-other-btn--open' : ''
                            }`}
                            disabled={busyId === r.id}
                            onClick={() => {
                              if (m.id === 'outro') {
                                // Abre a caixa de texto em vez de recusar logo.
                                setOtherOpen((cur) => (cur === r.id ? null : r.id))
                                setOtherReason('')
                              } else {
                                act(r.id, 'recusada', { reason: m.id })
                              }
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                        {otherOpen === r.id && (
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
                                  setOtherOpen(null)
                                  setOtherReason('')
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn-mini portal-act-no"
                          onClick={() => {
                            setRejectingId(null)
                            setOtherOpen(null)
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    {/* Confirmação com ajuste de quantidade — painel inline */}
                    {confirming && (
                      <div className="res-confirm-panel">
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

                    {/* WhatsApp: avisar o cliente (após transição relevante) */}
                    {['confirmada', 'pronta', 'recusada', 'expirada'].includes(r.status) && (
                      <button
                        type="button"
                        className="btn-mini res-wa-btn"
                        title="Abrir WhatsApp com a mensagem pronta"
                        onClick={() => openWhatsApp(r)}
                      >
                        WhatsApp
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}

      {/* Pop-up de detalhe — o mesmo padrão do modal de stock. A reserva
          vem sempre de rows (dados mais recentes, incluindo optimistic
          updates), nunca do snapshot do clique. */}
      {detailId &&
        (() => {
          const detail = rows.find((r) => r.id === detailId)
          return detail ? (
            <ReservationDetailModal
              reservation={detail}
              pharmacyName={pharmacyNameRef.current}
              busy={busyId === detail.id}
              onClose={() => setDetailId(null)}
              onWhatsApp={() => openWhatsApp(detail)}
            />
          ) : null
        })()}
    </section>
  )
}
