/**
 * Data e hora de levantamento — escritas no modal de reserva e lidas na
 * página de acompanhamento e no portal.
 *
 * Desde a 0057 o levantamento é a coluna `pickup_at`; as notas ficam só
 * com o texto livre do cliente. As reservas anteriores continuam a ter o
 * compromisso no início das notas:
 *
 *   Levantamento: Hoje · 14:00–16:00 | passo depois das 18h
 *
 * O separador «|» isola o levantamento da nota livre — a nota pode conter
 * «·» à vontade sem estragar a leitura. Reservas antigas (sem «|») são
 * lidas inteiras como levantamento. `pickupFromReservation` e
 * `noteFromReservation` são a porta única para as superfícies.
 */

import { formatLuanda, luandaDay } from './luanda-time'

/** Separador entre o levantamento e a nota livre do cliente. */
export const PICKUP_SEPARATOR = ' | '

/** «Hoje · 14:00–16:00» (fim opcional) — o texto que vai para as notas. */
export function pickupText(day, time, end) {
  if (!day || !time) return ''
  return `${day} · ${time}${end ? `–${end}` : ''}`
}

/** Notas da reserva: levantamento primeiro, nota do cliente depois. */
export function reservationNotes(pickup, note) {
  const head = pickup ? `Levantamento: ${pickup}` : ''
  return [head, String(note || '').trim()].filter(Boolean).join(PICKUP_SEPARATOR).slice(0, 300)
}

/**
 * Levantamento legível de uma reserva: `pickup_at` (0057) e, desde a
 * 0060, o fim da janela (`pickup_until`); senão o texto legado
 * «Levantamento: …» das notas.
 */
export function pickupFromReservation(r) {
  if (r?.pickup_at) {
    // Sempre em hora de Luanda: quem abre o link em Lisboa tem de ver a
    // hora a que a farmácia combinou, não a do seu relógio.
    const start = formatLuanda(r.pickup_at, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    if (!r.pickup_until) return start

    // O fim só repete o dia quando a janela atravessa a meia-noite (a
    // criação limita-a a 4 h, por isso é raro mas não impossível).
    const sameDay = luandaDay(r.pickup_at) === luandaDay(r.pickup_until)
    const end = formatLuanda(
      r.pickup_until,
      sameDay
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
    )
    return `${start}–${end}`
  }
  return parseReservationNotes(r?.notes).pickup
}

/** Nota livre do cliente, sem o «Levantamento: …» das reservas antigas. */
export function noteFromReservation(r) {
  return parseReservationNotes(r?.notes).note
}

/** Separa «Levantamento: …» da nota livre, para cada superfície mostrar o quê. */
export function parseReservationNotes(notes) {
  const raw = String(notes || '').trim()
  if (!raw) return { pickup: '', note: '' }
  const m = raw.match(/^Levantamento:\s*([^|]+?)\s*(?:\|\s*([\s\S]*))?$/i)
  if (!m) return { pickup: '', note: raw }
  const head = m[1].trim()
  const tail = (m[2] || '').trim()
  if (tail) return { pickup: head, note: tail }

  // Reservas antigas não tinham «|»: o levantamento e a nota ficavam
  // separados por «·». Corta-se depois da hora («Hoje · 14:00–16:00»).
  const legacy = head.match(
    /^(.+?·\s*\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?)(?:\s*·\s*([\s\S]*))?$/,
  )
  if (legacy) return { pickup: legacy[1].trim(), note: (legacy[2] || '').trim() }
  return { pickup: head, note: '' }
}
