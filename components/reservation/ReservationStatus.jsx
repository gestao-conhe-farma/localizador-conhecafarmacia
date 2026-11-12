'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CloseIcon, CheckIcon } from '@/components/ui/Icon'
import { trackingUrl } from '@/lib/reservation-messages'

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
  pickup_vencido: 'A hora de levantamento passou antes de a farmácia responder.',
  nao_levantada: 'Não chegou a levantar a reserva dentro do prazo.',
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

import { originCode } from '@/lib/origin-flags'
import { fmtKz, estimateTotal, quantityDesc, quantityLine } from '@/lib/reservation-format'
import { noteFromReservation, pickupFromReservation } from '@/lib/pickup'
import { packStructureText } from '@/lib/sale-options'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * Estado da reserva para o cliente — pós-0035, via RPC
 * `get_reservation_status(id, token)` com o token do URL (?t=).
 *
 * Sem token válido, nada é devolvido: o id sozinho já não abre nada,
 * porque a policy pública de leitura foi removida. O RPC nunca devolve
 * requester_phone — só os dados da própria reserva.
 */
export default function ReservationStatus({ reservationId }) {
  const searchParams = useSearchParams()
  const token = searchParams.get('t') || ''
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  // Lightbox da foto da embalagem — tocar na miniatura abre em grande.
  const [zoom, setZoom] = useState(false)
  // Feedback do «Copiar mensagem».
  const [copied, setCopied] = useState(false)
  // 0058: cancelamento pelo cliente — só em 'pendente'.
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  // Validação do link durante o render (não no efeito): setState
  // síncrono no corpo do efeito causa renders em cascata (lint).
  const linkOk = UUID_RE.test(reservationId || '') && UUID_RE.test(token || '')

  // Recarregar fora do ciclo do polling (ex.: a farmácia mexeu enquanto
  // o cliente tentava cancelar). Muda a chave; o efeito volta a correr.
  const [reloadKey, setReloadKey] = useState(0)
  // Instante do último fetch: o render não pode chamar Date.now()
  // (impuro); a janela de cancelamento compara com este valor.
  const [fetchedAt, setFetchedAt] = useState(0)

  useEffect(() => {
    if (!linkOk) return
    const supabase = createClient()
    let alive = true

    const fetchOnce = async () => {
      const { data, error: e } = await supabase.rpc('get_reservation_status', {
        p_id: reservationId,
        p_token: token,
      })
      if (!alive) return
      if (e) {
        setError('Não foi possível carregar a reserva.')
        return
      }
      if (!data) {
        setError('Reserva não encontrada — confirme o link que recebeu.')
        return
      }
      // O RPC devolve chaves achatadas (drug/pharmacy/sale_option/
      // stock_item); o resto do componente fala o dialecto antigo dos
      // embeds (drugs/pharmacies/stock_sale_options/stock_items).
      setR({
        ...data,
        drugs: data.drug || null,
        pharmacies: data.pharmacy || null,
        stock_sale_options: data.sale_option || null,
        stock_items: data.stock_item || null,
      })
      setFetchedAt(Date.now())
    }

    fetchOnce()
    // Sem Realtime para anon (a tabela não tem SELECT público): polling
    // leve a cada 20 s — o estado muda quando a farmácia mexe.
    const timer = setInterval(fetchOnce, 20000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [reservationId, token, linkOk, reloadKey])

  // Esc fecha o lightbox.
  useEffect(() => {
    if (!zoom) return
    const onKey = (e) => {
      if (e.key === 'Escape') setZoom(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  // 0058: o RPC é a autoridade (token + FOR UPDATE). O botão só evita o
  // clique duplo acidental; se a farmácia mexeu entretanto, recarrega
  // em vez de mostrar um cancelamento que não aconteceu.
  const doCancel = async () => {
    if (canceling) return
    setCanceling(true)
    setCancelError('')
    const supabase = createClient()
    const { data, error: e } = await supabase.rpc('cancel_reservation', {
      p_id: reservationId,
      p_token: token,
    })
    setCanceling(false)
    if (e || !data?.ok) {
      let msg = 'Não foi possível cancelar a reserva. Tente novamente.'
      if (data?.error === 'NAO_CANCELAVEL') {
        msg =
          data?.causa === 'fora_do_prazo'
            ? 'O horário de levantamento já passou — fale com a farmácia.'
            : 'A farmácia já actualizou esta reserva. Veja o estado abaixo.'
      }
      setCancelError(msg)
      if (data?.error === 'NAO_CANCELAVEL') setReloadKey((n) => n + 1)
      return
    }
    setConfirmCancel(false)
    setR(
      (prev) =>
        prev && {
          ...prev,
          status: 'cancelada',
          reason: 'cancelado_cliente',
          resolved_at: new Date().toISOString(),
        },
    )
  }

  const shownError = !linkOk
    ? 'Link de acompanhamento inválido — abra o link completo que recebeu da farmácia.'
    : error
  if (shownError) {
    return (
      <div className="res-track-card">
        <p className="res-track-estado res-track-estado--erro">{shownError}</p>
        <a href="/pesquisa" className="cf-btn cf-btn--primary">
          Ir ao Localizador
        </a>
      </div>
    )
  }

  if (!r) {
    return (
      <div className="sh-empty" role="status">
        <div className="sh-spinner" />
        <p className="sh-empty-sub">A carregar a reserva…</p>
      </div>
    )
  }

  // 0057: o levantamento vem de pickup_at; reservas antigas caem para o
  // texto «Levantamento: …» que ficou nas notas.
  const pickup = pickupFromReservation(r)
  const freeNote = noteFromReservation(r)
  // 0059/0060: confirmada/pronta cancelável até ao FIM da janela
  // escolhida (fallback `pickup_at` nas reservas antigas); depois disso
  // a reserva é da farmácia (ou o cron fecha como não levantada).
  // Pendente continua sempre cancelável — o RPC é a autoridade.
  const pickupAt = r.pickup_at ? new Date(r.pickup_at) : null
  const pickupUntil = r.pickup_until ? new Date(r.pickup_until) : null
  const cancelCutoff = pickupUntil || pickupAt
  const canCancel =
    r.status === 'pendente' ||
    ((r.status === 'confirmada' || r.status === 'pronta') &&
      (!cancelCutoff || cancelCutoff.getTime() > fetchedAt))

  const stepIndex = STEPS.findIndex((s) => s.id === r.status)
  const recusada = r.status === 'recusada'
  const expirada = r.status === 'expirada'
  const cancelada = r.status === 'cancelada'
  const waNumber = r.pharmacies?.whatsapp || r.pharmacies?.phone
  // Foto da embalagem (0013) — o mesmo ficheiro do bucket que o card do
  // Localizador e o modal de reserva mostram. URL público do Storage.
  const supabaseUrl = createClient().supabaseUrl
  const photoUrl = r.stock_items?.image_path
    ? `${supabaseUrl}/storage/v1/object/public/drug-images/${r.stock_items.image_path}`
    : null
  // Mensagem de contacto pré-preenchida — leva a origem/marca (0013)
  // para o atendente saber de imediato qual a apresentação reservada:
  // "Paracetamol 500 mg (de Ben-u-ron, origem Portugal)".
  const originBits = [r.stock_items?.brand, r.stock_items?.origin].filter(Boolean)
  const drugDesc = originBits.length
    ? `${r.drugs?.name || 'medicamento'} (de ${originBits.join(', origem ')})`
    : r.drugs?.name || 'medicamento'
  // Estrutura da caixa (0016/0017) — o cliente vê o que a embalagem
  // contém («Caixa com 10 lâminas de 10 comprimidos — 100 no total»).
  const packText = packStructureText(r.stock_items?.pack_laminas, r.stock_items?.pack_comprimidos)
  // Quantidade e valor pela formatação única (lib/reservation-format) —
  // o atendente recebe a reserva completa na primeira mensagem.
  const waTotal = estimateTotal(r)
  const waMessage = [
    `Olá! Tenho uma reserva de ${drugDesc} — ${quantityDesc(r)}.`,
    waTotal != null ? `Valor estimado: ${fmtKz(waTotal)} (a confirmar no balcão).` : '',
    `Levantamento em nome de ${r.requester_name}.`,
    `Link da reserva: ${trackingUrl(r.id, token)}`,
  ]
    .filter(Boolean)
    .join(' ')
  const waLinkHref = waNumber
    ? `https://wa.me/${String(waNumber).replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
    : null

  return (
    <div className="res-track-card">
      <div className="res-track-head">
        {/* Foto/placeholder ao lado do nome — o cliente reconhece a caixa
            que reservou, como no modal. Placeholder com a inicial quando
            a farmácia ainda não fotografou. */}
        {photoUrl ? (
          <button
            type="button"
            className="res-track-photo-btn"
            onClick={() => setZoom(true)}
            title="Ver a embalagem em tamanho grande"
            aria-label="Ver a embalagem em tamanho grande"
          >
            <img
              src={photoUrl}
              alt={`Embalagem de ${r.drugs?.name || 'medicamento'}`}
              className="drug-card-img drug-card-img--track"
              loading="lazy"
            />
          </button>
        ) : (
          <span className="drug-card-img drug-card-img--track drug-card-img--ph" aria-hidden="true">
            {(r.drugs?.name || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <p className="res-track-eyebrow">Reserva na {r.pharmacies?.name}</p>
          <h1 className="res-track-title">{r.drugs?.name || 'Medicamento'}</h1>
          <p className="res-track-meta">
            {[r.drugs?.form, r.drugs?.dosage, r.pharmacies?.municipio].filter(Boolean).join(' · ')}
            {r.pharmacies?.address ? ` · ${r.pharmacies.address}` : ''}
          </p>

          {/* Estrutura da caixa (0016/0017) — mesma linha do modal de
              reserva: o cliente confirma o que a embalagem contém. */}
          {packText && <p className="res-track-pack">{packText}</p>}

          {/* Origem/marca (0013) — o cliente confirma a apresentação que
              reservou, do mesmo modo que no modal e no WhatsApp. */}
          {(r.stock_items?.brand || r.stock_items?.origin) && (
            <div className="drug-card-origin">
              {r.stock_items?.brand && (
                <span className="origin-tag origin-tag--brand">{r.stock_items.brand}</span>
              )}
              {r.stock_items?.origin && (
                <span className="origin-tag">
                  {originCode(r.stock_items.origin) && (
                    <span className="origin-code">{originCode(r.stock_items.origin)}</span>
                  )}{' '}
                  {r.stock_items.origin}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* O dia e a hora que o cliente marcou — logo abaixo do cabeçalho,
          porque é o que ele quer confirmar ao abrir o link. */}
      {pickup && (
        <p className="res-track-pickup">
          <span>Levantamento pretendido</span>
          <b>{pickup}</b>
        </p>
      )}

      {cancelada ? (
        <div className="res-track-estado res-track-estado--neutro">
          <b>Reserva cancelada por si</b>
          <p>O medicamento voltou a ficar disponível. Pode reservar outra vez quando quiser.</p>
          <a
            href={`/pesquisa?q=${encodeURIComponent(r.drugs?.name || '')}`}
            className="cf-btn cf-btn--primary"
          >
            Procurar noutras farmácias
          </a>
        </div>
      ) : recusada || expirada ? (
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
            className="cf-btn cf-btn--primary"
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
      {freeNote && <p className="res-track-note">A sua nota: “{freeNote}”</p>}

      {/* 0058/0059: cancelar enquanto pendente, ou em confirmada/pronta
          até à hora marcada. Depois de cancelada o bloco desaparece. */}
      {canCancel && (
        <div className="res-track-cancel">
          {confirmCancel ? (
            <>
              <p className="res-track-cancel-q">
                {r.status === 'pendente'
                  ? 'Cancelar esta reserva? O medicamento volta a ficar disponível na farmácia.'
                  : 'A farmácia já separou este medicamento. Se cancelar, ele volta a ficar disponível — se for só um atraso, fale com eles.'}
              </p>
              <div className="res-track-cancel-actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--primary"
                  onClick={doCancel}
                  disabled={canceling}
                >
                  {canceling ? 'A cancelar…' : 'Sim, cancelar'}
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--ghost"
                  onClick={() => setConfirmCancel(false)}
                  disabled={canceling}
                >
                  Voltar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => setConfirmCancel(true)}
            >
              Cancelar reserva
            </button>
          )}
          {cancelError && (
            <p className="res-track-cancel-erro" role="alert">
              {cancelError}
            </p>
          )}
        </div>
      )}

      {waMessage && !['concluida', 'cancelada'].includes(r.status) && (
        <div className="res-track-contact">
          {waLinkHref && (
            <a
              href={waLinkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="cf-btn cf-btn--ghost res-track-wa"
            >
              Falar com a {r.pharmacies?.name} no WhatsApp
            </a>
          )}
          {/* Ligar directamente — para quem prefere a chamada ao chat.
              Usa o whatsapp se existir, senão o telefone fixo. */}
          {waNumber && (
            <a
              href={`tel:${String(waNumber).replace(/[^\d+]/g, '')}`}
              className="cf-btn cf-btn--ghost res-track-call"
            >
              Ligar
            </a>
          )}
          {/* Copiar para outro canal (SMS, email) — o texto é
              o mesmo do link wa.me. Cai para textarea em browsers sem
              navigator.clipboard (HTTP puro, por ex.). */}
          <button
            type="button"
            className="cf-btn cf-btn--ghost res-track-copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(waMessage)
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              } catch {
                setCopied(false)
                // fallback silencioso: o utilizador copia à mão
                window.prompt('Copie a mensagem:', waMessage)
              }
            }}
          >
            {copied ? (
              <>
                <CheckIcon /> Copiado
              </>
            ) : (
              'Copiar mensagem'
            )}
          </button>
        </div>
      )}

      {/* Lightbox da embalagem — simples: scrim, imagem centrada e
          fechar por toque fora, no botão ou na tecla Esc. */}
      {zoom && photoUrl && (
        <div
          className="res-track-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Embalagem de ${r.drugs?.name || 'medicamento'}`}
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            className="res-track-lightbox-close"
            aria-label="Fechar"
            onClick={() => setZoom(false)}
          >
            <CloseIcon size={16} />
          </button>
          <img
            src={photoUrl}
            alt={`Embalagem de ${r.drugs?.name || 'medicamento'}`}
            className="res-track-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
