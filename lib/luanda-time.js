/**
 * Tempo de Luanda — a hora a que a farmácia abre, fecha e entrega.
 *
 * Angola é UTC+1 sem horário de verão, mas o browser de quem reserva
 * pode estar em qualquer fuso: um cliente em Lisboa (UTC+0 no inverno)
 * a marcar 10:00 estava a gravar 11:00 em Luanda, e a página de
 * acompanhamento mostrava a hora do visitante em vez da da farmácia.
 *
 * Aqui a conversão é explícita em ambos os sentidos:
 *   • `luandaWallToInstant(dia, hora)` — «13-11 10:00 em Luanda» → instante
 *     UTC, que é o que vai para `pickup_at`;
 *   • `luandaDay` / `luandaMinutes` / `luandaWeekday` — o calendário e o
 *     relógio de Luanda, para decidir «hoje», «já passou» e se abre.
 *
 * Tudo por `Intl` com `timeZone` fixo (não por offset hardcoded): se o
 * fuso mudar, muda num sítio só.
 */

export const LUANDA_TZ = 'Africa/Luanda'

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: LUANDA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const pad2 = (n) => String(n).padStart(2, '0')

/** Peças do calendário/relógio de Luanda para um instante. */
export function luandaParts(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input)
  const out = {}
  for (const p of PARTS.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  // Alguns motores devolvem 24 para a meia-noite (hourCycle h24).
  if (out.hour === 24) out.hour = 0
  return out
}

/** «2026-11-13» — o dia de Luanda em que o instante cai. */
export function luandaDay(input = new Date()) {
  const p = luandaParts(input)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/** Minutos desde a meia-noite em Luanda (14:35 → 875). */
export function luandaMinutes(input = new Date()) {
  const p = luandaParts(input)
  return p.hour * 60 + p.minute
}

/** Dia da semana de uma data «YYYY-MM-DD» (0 = domingo), sem fuso à mistura. */
export function luandaWeekday(day) {
  const [y, m, d] = String(day).split('-').map(Number)
  if (!y || !m || !d) return NaN
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Offset de Luanda (minutos) no instante dado. */
function offsetMinutes(date) {
  const p = luandaParts(date)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/**
 * «2026-11-13» + «10:00» (hora de parede em Luanda) → instante UTC.
 *
 * Duas passagens: a primeira estima o offset, a segunda confirma-o já no
 * instante certo (importa se um dia o fuso deixar de ser fixo).
 */
export function luandaWallToInstant(day, time = '00:00') {
  const [y, m, d] = String(day || '')
    .split('-')
    .map(Number)
  const [hh, mm] = String(time || '00:00')
    .split(':')
    .map(Number)
  if (!y || !m || !d || !Number.isFinite(hh)) return new Date(NaN)
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  let instant = wall - offsetMinutes(new Date(wall)) * 60000
  instant = wall - offsetMinutes(new Date(instant)) * 60000
  return new Date(instant)
}

/** Formatação com o fuso de Luanda — nunca o do visitante. */
export function formatLuanda(input, options = {}) {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-PT', { timeZone: LUANDA_TZ, ...options })
}
