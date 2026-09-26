'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STEPS = [
  { id: 'pendente', label: 'Recebida', hint: 'A farmácia vai responder em até 72 horas.' },
  { id: 'confirmada', label: 'Confirmada', hint: 'A farmácia separou o medicamento para si.' },
  {
    id: 'pronta',
    label: 'Pronta para levantamento',
    hint: 'Pode passar na farmácia a qualquer momento.',
  },
  { id: 'concluida', label: 'Levantada', hint: 'Reserva concluída. Obrigado!' },
]

const REJECT_LABELS = {
  sem_stock: 'De momento não temos o medicamento em stock.',
  zona: 'Não conseguimos atender a sua zona de levantamento.',
  outro: 'Não vamos poder atender esta reserva.',
  ttl: 'O prazo de 72 horas venceu sem resposta.',
}

/**
 * Detalhe escrito pela farmácia na recusa "outro motivo"
 * (formato "outro:<texto>") — é a explicação que o atendente
 * escreveu para o cliente ler. Sem texto: cai no rótulo geral.
 */
function rejectDetail(reason) {
  if (!reason) return null
  const [key, ...rest] = String(reason).split(':')
  if (key.trim() !== 'outro' || rest.length === 0) return null
  return rest.join(':').trim() || null
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * O que foi pedido/confirmado, com a forma de venda (0012) quando
 * existe: "1 caixa (3 lâminas)" — nunca um número solto sem unidade.
 */
function quantityLine(r) {
  const opt = r.stock_sale_options
  const base = opt ? opt.unit : null
  const pack = opt ? (opt.pack_size ?? 1) : 1

  const desc = (q) => {
    if (!opt) return `${q} unidade${q !== 1 ? 's' : ''}`
    if (pack > 1) return `${q} ${opt.unit}${q !== 1 ? 's' : ''} (${pack} ${base || 'un.'} cada)`
    return `${q} ${opt.unit}${q !== 1 ? 's' : ''}`
  }

  if (r.confirmed_quantity != null && r.confirmed_quantity !== r.quantity) {
    return `Confirmado: ${desc(r.confirmed_quantity)} (pediu ${desc(r.quantity)})`
  }
  return `Quantidade: ${desc(r.quantity)}`
}

const fmtKz = (n) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n) + ' Kz'

/**
 * Preço total ESTIMADO da reserva (0012): quantidade da opção × preço
 * da opção. É uma estimativa — o preço final é o do balcão; a farmácia
 * pode ajustar a quantidade na confirmação (usa confirmed_quantity).
 *
 * @returns {number|null} null = sem opção de venda ou preço indisponível
 *   (reservas legadas não mostram preço — não há de onde vir)
 */
function estimateTotal(r) {
  const opt = r.stock_sale_options
  if (!opt || opt.price == null) return null
  const qty = r.confirmed_quantity ?? r.quantity
  if (qty == null) return null
  return Math.round(qty * Number(opt.price) * 100) / 100
}

/**
 * Estado da reserva para o cliente — leitura directa por id (RLS da
 * migração 0011). Recusas mostram sempre o caminho seguinte: procurar
 * no Localizador ou falar com a farmácia pelo WhatsApp dela.
 */
export default function ReservationStatus({ reservationId }) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(reservationId || '')) {
      setError('Link de acompanhamento inválido.')
      return
    }
    const supabase = createClient()
    let alive = true

    const fetchOnce = async () => {
      const { data, error: e } = await supabase
        .from('reservations')
        .select(
          'id, status, quantity, confirmed_quantity, reason, notes, created_at, resolved_at, requester_name, sale_option_id, drugs(name, form, dosage), pharmacies(name, phone, whatsapp, address, municipio), stock_sale_options(unit, pack_size, price)',
        )
        .eq('id', reservationId)
        .maybeSingle()
      if (!alive) return
      if (e) {
        setError('Não foi possível carregar a reserva.')
        return
      }
      if (!data) {
        setError('Reserva não encontrada — confirme o link que recebeu.')
        return
      }
      setR(data)
    }

    fetchOnce()
    // Realtime leve: o estado muda quando a farmácia mexe — sem F5.
    const channel = supabase
      .channel(`reserva-${reservationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: `id=eq.${reservationId}`,
        },
        () => fetchOnce(),
      )
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [reservationId])

  if (error) {
    return (
      <div className="res-track-card">
        <p className="res-track-estado res-track-estado--erro">{error}</p>
        <a href="/pesquisa" className="btn btn-primary">
          Ir ao Localizador
        </a>
      </div>
    )
  }

  if (!r) {
    return (
      <div className="empty-state" role="status">
        <div className="spinner" />
      </div>
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.id === r.status)
  const recusada = r.status === 'recusada'
  const expirada = r.status === 'expirada'
  const waNumber = r.pharmacies?.whatsapp || r.pharmacies?.phone
  const waLinkHref = waNumber
    ? `https://wa.me/${String(waNumber).replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! Tenho uma reserva de ${r.drugs?.name} (levantamento em nome de ${r.requester_name}).`,
      )}`
    : null

  return (
    <div className="res-track-card">
      <p className="res-track-eyebrow">Reserva na {r.pharmacies?.name}</p>
      <h1 className="res-track-title">{r.drugs?.name || 'Medicamento'}</h1>
      <p className="res-track-meta">
        {[r.drugs?.form, r.drugs?.dosage, r.pharmacies?.municipio].filter(Boolean).join(' · ')}
        {r.pharmacies?.address ? ` · ${r.pharmacies.address}` : ''}
      </p>

      {recusada || expirada ? (
        <div className="res-track-estado res-track-estado--ruim">
          <b>{expirada ? 'Reserva expirada' : 'Reserva não atendida'}</b>
          <p>
            {(() => {
              const detail = rejectDetail(r.reason)
              if (detail) return `A farmácia explica: “${detail}”`
              return (
                REJECT_LABELS[r.reason?.split(':')[0]] || 'Contacte a farmácia para mais detalhes.'
              )
            })()}
          </p>
          <a
            href={`/pesquisa?q=${encodeURIComponent(r.drugs?.name || '')}`}
            className="btn btn-primary"
          >
            Procurar noutras farmácias
          </a>
        </div>
      ) : (
        <ol className="res-track-steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`res-track-step${i < stepIndex ? ' done' : ''}${i === stepIndex ? ' current' : ''}`}
            >
              <span className="res-track-dot" aria-hidden="true" />
              <div>
                <b>{s.label}</b>
                {i === stepIndex && <p>{s.hint}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="res-track-meta">
        Pedido em {fmtDate(r.created_at)}
        {' · '}
        {quantityLine(r)}
        {r.resolved_at ? ` · Resolvida em ${fmtDate(r.resolved_at)}` : ''}
      </p>

      {estimateTotal(r) != null && (
        <p className="res-track-price">
          Valor estimado: <b>{fmtKz(estimateTotal(r))}</b>
          <span className="res-track-price-note"> a confirmar no balcão</span>
        </p>
      )}
      {r.notes && <p className="res-track-note">A sua nota: “{r.notes}”</p>}

      {waLinkHref && r.status !== 'concluida' && (
        <a
          href={waLinkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary res-track-wa"
        >
          Falar com a {r.pharmacies?.name} no WhatsApp
        </a>
      )}
    </div>
  )
}
