'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getMyReservations,
  setReservationStatus,
  markClientContacted,
} from '@/lib/actions/pharmacy-portal'
import { buildReservationMessage, waLink } from '@/lib/reservation-messages'
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

/** Estado = PONTO + palavra (disciplina v2) — mapeia status → st-*. */
const ST_BY_STATUS = {
  pendente: 'warn',
  confirmada: 'ok',
  pronta: 'ok',
  concluida: 'ok',
  recusada: 'mut',
  expirada: 'bad',
}

const REJECT_REASONS = [
  { id: 'sem_stock', label: 'Sem stock' },
  { id: 'zona', label: 'Não atendemos essa zona' },
  { id: 'outro', label: 'Outro motivo' },
]

const ERRO_OUTRO_VAZIO = 'Escreva o motivo antes de recusar.'

/** Tabs sublinhadas — o antigo conjunto de chips (contagem neutra). */
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

import { fmtKz, estimateTotal, quantityDesc } from '@/lib/reservation-format'

/** Motivo legível na ficha (reason é "chave" ou "chave:texto"). */
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

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

/** Cor do ponto por estado — legenda do calendário. */
const DOT_COLOR = {
  pendente: '#d99a1e',
  confirmada: 'var(--portal-ok)',
  pronta: 'var(--portal-ok)',
  concluida: 'var(--portal-ok)',
  recusada: 'var(--portal-red)',
  expirada: 'var(--portal-red)',
}

/**
 * Fila de reservas (v2 «Premium Calmo»): KPIs do dia, caixa única com
 * cabeçalho (pesquisa + alternador), tabs sublinhadas, linhas arejadas
 * com UM sólido por linha + kebab, e vista calendário com painel do dia.
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
  // Recusa em curso (id) — mostra as opções de motivo inline.
  const [rejectingId, setRejectingId] = useState(null)
  // Texto livre do motivo "outro" — o atendente detalha porquê, e o
  // texto chega ao cliente na página de acompanhamento e no WhatsApp.
  const [otherReason, setOtherReason] = useState('')
  // Recusa "outro motivo" aberta (id) — mostra a caixa de texto.
  const [otherOpen, setOtherOpen] = useState(null)
  // Confirmação em curso (id) — mini-prompt de quantidade separado.
  const [confirmingId, setConfirmingId] = useState(null)
  const [confirmQty, setConfirmQty] = useState('')
  // Reserva aberta no modal de detalhe (null = fechado).
  const [detailId, setDetailId] = useState(null)
  // Vista lista/calendário (viewtoggle do mock) + pesquisa no cabeçalho.
  const [view, setView] = useState('lista')
  const [q, setQ] = useState('')
  // Menu kebab aberto (id da linha).
  const [kebabId, setKebabId] = useState(null)
  // Calendário: mês/selector resolvidos depois de montar — Date.now()
  // no render é impuro (react-hooks/purity), o effect preenche-os.
  const [cal, setCal] = useState(null) // { y, m, sel }
  useEffect(() => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    setCal({
      y: d.getFullYear(),
      m: d.getMonth(),
      sel: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    })
  }, [])
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
      // Estrutura da caixa (0016) — «1 caixa com 10 lâminas».
      packLaminas: r.stock_items?.pack_laminas ?? null,
      packComprimidos: r.stock_items?.pack_comprimidos ?? null,
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
    const qq = confirmQty.trim()
    const extra = qq === '' ? {} : { confirmedQuantity: qq }
    const res = await act(r.id, 'confirmada', extra)
    if (res.ok) setConfirmQty('')
  }

  /**
   * Recusa "outro motivo": exige o texto — "não vamos poder atender"
   * sem dizer porquê deixa o cliente sem resposta. Envia "outro:<texto>"
   * (o formato que o action já aceita e a página de acompanhamento lê).
   */
  const doRejectOther = (r) => {
    const text = otherReason.trim()
    if (!text) {
      flash(ERRO_OUTRO_VAZIO)
      return
    }
    act(r.id, 'recusada', { reason: `outro:${text}` })
  }

  /** Contagens das tabs — sobre a lista completa, como no StockPanel. */
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
    const needle = q.trim().toLowerCase()
    // Mais recentes primeiro dentro de cada filtro.
    return rows
      .filter(match)
      .filter((r) => {
        if (!needle) return true
        const d = r.drugs || {}
        return [d.name, r.requester_name, r.requester_phone].some((v) =>
          String(v || '')
            .toLowerCase()
            .includes(needle),
        )
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [rows, filter, q])

  /** Painel inline de confirmação (quantidade) — usado na linha e no dia. */
  const confirmPanel = (r) =>
    confirmingId !== r.id ? null : (
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
    )

  /** Painel inline de recusa (motivos) — usado na linha e no dia. */
  const rejectPanel = (r) =>
    rejectingId !== r.id ? null : (
      <div className="res-reject-panel">
        {REJECT_REASONS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`btn-mini portal-act-no${
              m.id === 'outro' && otherOpen === r.id ? ' res-other-btn--open' : ''
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
      </div>
    )

  if (rows === null) {
    return (
      <div className="empty-state" role="status">
        <div className="spinner" />
      </div>
    )
  }

  // ── KPIs do dia (dados REAIS da fila, sem deltas inventados) ──
  const pendentes = rows.filter((r) => r.status === 'pendente')
  const maisAntiga = pendentes.length
    ? pendentes.reduce((a, b) => (new Date(a.created_at) < new Date(b.created_at) ? a : b))
    : null
  const expiradas = rows.filter((r) => r.status === 'expirada')
  const kpis = [
    {
      k: 'Por atender agora',
      n: counts.pendente,
      d: maisAntiga ? `o mais antigo ${when(maisAntiga.created_at)}` : 'fila vazia',
      ic: 'amber',
      st: counts.pendente > 0 ? ['warn', 'responder em 72 h'] : ['ok', 'em dia'],
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      ),
    },
    {
      k: 'A decorrer',
      n: counts.ativas,
      d: 'confirmadas ou prontas',
      ic: 'green',
      st: counts.ativas > 0 ? ['ok', 'em preparação'] : ['mut', 'nenhuma'],
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ),
    },
    {
      k: 'Resolvidas',
      n: counts.resolvidas,
      d: 'concluídas, recusadas e expiradas',
      ic: 'green',
      st: ['ok', 'fechadas'],
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      k: 'Expiradas',
      n: expiradas.length,
      d: 'passaram de 72 h sem resposta',
      ic: 'red',
      st: expiradas.length > 0 ? ['bad', 'rever prazo'] : ['ok', 'nenhuma'],
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      ),
    },
  ]

  // ── Calendário: reservas agrupadas por dia de criação ──
  const byDay = {}
  for (const r of rows) {
    const iso = String(r.created_at || '').slice(0, 10)
    if (!iso) continue
    ;(byDay[iso] = byDay[iso] || []).push(r)
  }
  const calCells = (() => {
    if (!cal) return []
    const first = new Date(cal.y, cal.m, 1)
    const startDow = (first.getDay() + 6) % 7 // Segunda = 0
    const daysIn = new Date(cal.y, cal.m + 1, 0).getDate()
    const prevDays = new Date(cal.y, cal.m, 0).getDate()
    const cells = []
    for (let i = startDow - 1; i >= 0; i -= 1) {
      cells.push({ d: prevDays - i, mut: true })
    }
    const p = (n) => String(n).padStart(2, '0')
    for (let d = 1; d <= daysIn; d += 1) {
      const iso = `${cal.y}-${p(cal.m + 1)}-${p(d)}`
      cells.push({ d, iso, items: byDay[iso] || [], sel: iso === cal.sel })
    }
    let next = 1
    while (cells.length % 7 !== 0) {
      cells.push({ d: next, mut: true })
      next += 1
    }
    return cells
  })()
  const dayItems = cal ? byDay[cal.sel] || [] : []
  const dayStats = {
    pend: dayItems.filter((r) => r.status === 'pendente').length,
    ok: dayItems.filter((r) => ['confirmada', 'pronta', 'concluida'].includes(r.status)).length,
    ref: dayItems.filter((r) => ['recusada', 'expirada'].includes(r.status)).length,
  }

  const viewToggle = (
    <div className="portal-viewtoggle" title="Mudar vista">
      <button
        type="button"
        className={view === 'lista' ? 'on' : ''}
        aria-label="Vista lista"
        onClick={() => setView('lista')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>
      <button
        type="button"
        className={view === 'cal' ? 'on' : ''}
        aria-label="Vista calendário"
        onClick={() => setView('cal')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      </button>
    </div>
  )

  /** Linha da vista lista (cols-res) — UM sólido + kebab; painéis
      inline ocupam a largura toda por baixo. */
  const renderRow = (r) => {
    const d = r.drugs || {}
    const resolved = ['concluida', 'recusada', 'expirada'].includes(r.status)
    const rejecting = rejectingId === r.id
    const confirming = confirmingId === r.id
    const panels = rejecting || confirming
    const st = ST_BY_STATUS[r.status] || 'mut'
    const estadoTxt = {
      pendente: ttlLabel(r.expires_at) || 'Pendente',
      confirmada: r.client_contacted_at ? 'Confirmada · cliente avisado' : 'Confirmada',
      pronta: 'Pronta · aguarda levantamento',
      concluida: 'Concluída',
      recusada: `Recusada${reasonLabel(r.reason) ? ` · ${reasonLabel(r.reason)}` : ''}`,
      expirada: 'Expirada',
    }[r.status]
    const kebabOpen = kebabId === r.id

    return (
      <div
        key={r.id}
        className={`portal-rowline portal-cols-res${panels ? ' portal-rowline--static' : ''}`}
        role="button"
        tabIndex={0}
        title="Ver detalhes da reserva"
        onClick={() => {
          if (!panels) setDetailId(r.id)
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !panels) {
            e.preventDefault()
            setDetailId(r.id)
          }
        }}
      >
        <div className="portal-cell">
          <b>{d.name || 'Medicamento'}</b>
          <span className="sub">
            {[r.requester_name, r.requester_phone, quantityDesc(r)].filter(Boolean).join(' · ')}
            {r.notes ? ` · “${r.notes}”` : ''}
          </span>
        </div>

        <div className="portal-cell">
          <span className={`portal-st portal-st--${st}`}>
            <i />
            {estadoTxt}
          </span>
        </div>

        <div className="portal-cell">
          <span className="strong">
            {estimateTotal(r) != null ? `≈ ${fmtKz(estimateTotal(r))}` : '—'}
          </span>
        </div>

        <div className="portal-cell">
          <span className="tiny">{when(r.created_at)}</span>
        </div>

        <div
          className="portal-res-actions"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* UM botão sólido por linha: a próxima acção do fluxo. */}
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
          {r.status === 'pronta' && !rejecting && (
            <button
              type="button"
              className="btn-mini portal-act-ok"
              disabled={busyId === r.id}
              onClick={() => act(r.id, 'concluida')}
            >
              Concluída
            </button>
          )}

          {/* Kebab: detalhes, WhatsApp e recusar (quando faz sentido). */}
          <div className="portal-kebab-wrap">
            <button
              type="button"
              className="portal-kebab"
              aria-label={`Opções da reserva de ${r.requester_name || d.name || 'cliente'}`}
              aria-expanded={kebabOpen}
              onClick={() => setKebabId(kebabOpen ? null : r.id)}
            >
              ⋯
            </button>
            {kebabOpen && (
              <div className="portal-kebab-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setKebabId(null)
                    setDetailId(r.id)
                  }}
                >
                  Ver detalhes
                </button>
                {r.requester_phone &&
                  ['pendente', 'confirmada', 'pronta', 'recusada', 'expirada'].includes(
                    r.status,
                  ) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setKebabId(null)
                        openWhatsApp(r)
                      }}
                    >
                      WhatsApp ao cliente
                    </button>
                  )}
                {!resolved && r.status !== 'pendente' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="portal-kebab-danger"
                    onClick={() => {
                      setKebabId(null)
                      setRejectingId(r.id)
                    }}
                  >
                    Recusar reserva
                  </button>
                )}
                {resolved && (
                  <span style={{ padding: '0.5rem 0.625rem', fontSize: '0.7188rem' }}>
                    Resolvida {r.resolved_at ? when(r.resolved_at) : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {panels && (
          <div
            className="portal-res-inline"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {confirmPanel(r)}
            {rejectPanel(r)}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="portal-section">
      {/* Cabeçalho compacto — sem hero. */}
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

      {/* KPIs do dia (padrão refs 4/6): ícone à esquerda + estado. */}
      <div className="portal-kpi4-grid">
        {kpis.map((c) => (
          <div key={c.k} className="portal-kpi4">
            <span className={`portal-kpi4-ic portal-kpi4-ic--${c.ic}`} aria-hidden="true">
              {c.svg}
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">{c.k}</span>
              <span className="portal-kpi4-n">{c.n}</span>
              <span className="portal-kpi4-d">{c.d}</span>
            </span>
            <span className={`portal-st portal-st--${c.st[0]}`}>
              <i />
              {c.st[1]}
            </span>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="portal-box">
          <div className="portal-rows-empty">
            <b>Ainda não há reservas</b>
            Quando um cliente reservar pelo Localizador, aparece aqui — e é bom responder em menos
            de 72 horas.
          </div>
        </div>
      ) : view === 'lista' ? (
        <div className="portal-box">
          <div className="portal-sec-head">
            <h2>Todas as reservas</h2>
            <div className="portal-sec-tools">
              <label className="portal-sec-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  placeholder="Pesquisar por cliente ou medicamento…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Pesquisar reservas"
                />
              </label>
              {viewToggle}
            </div>
          </div>

          {/* Tabs sublinhadas — contagem neutra ao lado do rótulo. */}
          <div className="portal-undertabs" role="group" aria-label="Filtrar reservas por estado">
            {FILTERS.map((f) => (
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

          {filtered.length === 0 ? (
            <div className="portal-rows-empty">
              <b>Nenhuma reserva neste estado</b>
              {q
                ? `Nada para “${q}” — experimente outro nome ou cliente.`
                : 'Mude de tab para ver as outras reservas.'}
            </div>
          ) : (
            filtered.map(renderRow)
          )}

          {filtered.length > 0 && (
            <div className="portal-pgbar">
              <span className="portal-pginfo">
                A mostrar {filtered.length} de {counts.all} reservas · mais recentes no topo
              </span>
            </div>
          )}
        </div>
      ) : (
        /* ══ Vista Calendário — reservas por dia + painel do dia ══ */
        <div className="portal-box">
          <div className="portal-sec-head">
            <h2>Calendário de reservas</h2>
            <div className="portal-sec-tools">
              <span className="portal-sec-head-b">clique num dia para o abrir</span>
              {viewToggle}
            </div>
          </div>
          <div className="portal-rescal">
            <div className="portal-rescal-left">
              <div className="portal-calhead">
                <b>{cal ? `${MESES[cal.m]} ${cal.y}` : ' '}</b>
                <div className="portal-calnav">
                  <button
                    type="button"
                    aria-label="Mês anterior"
                    onClick={() =>
                      setCal((c) => {
                        if (!c) return c
                        const d = new Date(c.y, c.m - 1, 1)
                        return { ...c, y: d.getFullYear(), m: d.getMonth() }
                      })
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Mês seguinte"
                    onClick={() =>
                      setCal((c) => {
                        if (!c) return c
                        const d = new Date(c.y, c.m + 1, 1)
                        return { ...c, y: d.getFullYear(), m: d.getMonth() }
                      })
                    }
                  >
                    ›
                  </button>
                </div>
                <div className="portal-cal-legend">
                  <span>
                    <i style={{ background: '#d99a1e' }} /> por atender
                  </span>
                  <span>
                    <i style={{ background: 'var(--portal-ok)' }} /> atendida
                  </span>
                  <span>
                    <i style={{ background: 'var(--portal-red)' }} /> recusada
                  </span>
                </div>
              </div>
              <div className="portal-calwk">
                {DOW.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div className="portal-calgrid">
                {calCells.map((c, i) =>
                  c.mut ? (
                    <button key={i} className="portal-cald portal-cald--mut" disabled>
                      <span className="cdn">{c.d}</span>
                    </button>
                  ) : (
                    <button
                      key={i}
                      className={`portal-cald${c.sel ? ' portal-cald--sel' : ''}`}
                      onClick={() => setCal((cur) => ({ ...cur, sel: c.iso }))}
                    >
                      <span className="cdn">{c.d}</span>
                      <span className="portal-caldots">
                        {c.items.slice(0, 4).map((r) => (
                          <i key={r.id} style={{ background: DOT_COLOR[r.status] }} />
                        ))}
                      </span>
                      {c.items.length > 4 && (
                        <span className="portal-calmore">+{c.items.length - 4}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="portal-rescal-right">
              <div className="portal-calside-title">
                {cal
                  ? `${new Date(cal.y, cal.m, Number(cal.sel.slice(8, 10))).toLocaleDateString(
                      'pt-PT',
                      { weekday: 'long' },
                    )}, ${Number(cal.sel.slice(8, 10))} de ${MESES[cal.m]}`
                  : ' '}
              </div>
              <div className="portal-calside-sub">
                {dayItems.length
                  ? `${dayItems.length} reserva${dayItems.length > 1 ? 's' : ''} · ${dayStats.pend} por atender · ${dayStats.ok} atendida${dayStats.ok !== 1 ? 's' : ''}${dayStats.ref ? ` · ${dayStats.ref} recusada${dayStats.ref > 1 ? 's' : ''}` : ''}`
                  : 'Sem reservas neste dia'}
              </div>

              <div className="portal-cal-daylist">
                {dayItems.length === 0 && (
                  <div className="portal-cal-empty">
                    Sem reservas neste dia.
                    <br />
                    Os pedidos aparecem aqui quando os clientes reservarem.
                  </div>
                )}
                {dayItems.map((r) => {
                  const d = r.drugs || {}
                  const st = ST_BY_STATUS[r.status] || 'mut'
                  const hora = new Date(r.created_at).toLocaleTimeString('pt-PT', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  return (
                    <div key={r.id} className="portal-citem">
                      <div className="portal-citem-top">
                        <button
                          type="button"
                          className="portal-citem-name"
                          onClick={() => setDetailId(r.id)}
                        >
                          {d.name || 'Medicamento'}
                        </button>
                        <span className="portal-citem-time">
                          <span className={`portal-st portal-st--${st}`}>
                            <i />
                            {BADGES[r.status]?.label || r.status}
                          </span>
                          · {hora}
                        </span>
                      </div>
                      <div className="portal-citem-meta">
                        {[r.requester_name, quantityDesc(r)].filter(Boolean).join(' · ')}
                      </div>
                      <div className="portal-citem-foot">
                        {r.status === 'pendente' && confirmPanel(r)}
                        {r.status === 'pendente' && rejectPanel(r)}
                        {r.status === 'pendente' &&
                          confirmingId !== r.id &&
                          rejectingId !== r.id && (
                            <>
                              <button
                                type="button"
                                className="btn-mini portal-act-no"
                                onClick={() => setRejectingId(r.id)}
                              >
                                Recusar
                              </button>
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
                            </>
                          )}
                        {r.status !== 'pendente' && (
                          <span className="portal-card-hint">
                            {BADGES[r.status]?.label || r.status} · {when(r.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop do menu kebab — tocar fora fecha. */}
      {kebabId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          aria-hidden="true"
          onClick={() => setKebabId(null)}
        />
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
