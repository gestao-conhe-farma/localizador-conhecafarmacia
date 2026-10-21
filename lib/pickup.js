/**
 * Data e hora de levantamento — escritas no modal de reserva e lidas na
 * página de acompanhamento e no portal.
 *
 * A reserva não tem coluna própria para isto (a criação pública só aceita
 * `notes`), por isso o compromisso vive no início das notas:
 *
 *   Levantamento: Hoje · 14:00–16:00 | passo depois das 18h
 *
 * O separador «|» isola o levantamento da nota livre — a nota pode conter
 * «·» à vontade sem estragar a leitura. Reservas antigas (sem «|») são
 * lidas inteiras como levantamento.
 */

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
