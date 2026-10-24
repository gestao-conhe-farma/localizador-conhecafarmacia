/**
 * Utilitários de horário de funcionamento — partilhados entre componentes
 * client (lista de farmácias, detalhe) e código server (página da farmácia).
 *
 * O horário é TEXTO LIVRE («Seg–Sáb · 07:30–19:00», «Todos os dias · 24
 * horas», «Seg–Sex 8h–19h · Sáb 8h–13h»). Tudo aqui é uma leitura
 * conservadora desse texto: quando não se percebe, devolve-se null e quem
 * chama não inventa — nada de esconder farmácias por engano.
 */

/** Dias da semana abertos, na ordem do `Date.getDay()` (0 = domingo). */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Nome/abreviatura do dia → índice. «2ª» é segunda, «6ª» é sexta. */
const DAY_NUMBER = {
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  2: 1,
  terca: 2,
  ter: 2,
  3: 2,
  quarta: 3,
  qua: 3,
  4: 3,
  quinta: 4,
  qui: 4,
  5: 4,
  sexta: 5,
  sex: 5,
  6: 5,
  sabado: 6,
  sab: 6,
}

const DAY_RE =
  /\b(domingo|dom|segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|[2-6])\b/g

/** «07:30–19:00», «8h–19h», «8h30–12h». */
const TIME_RE =
  /(\d{1,2})(?:\s*[:h]\s*(\d{1,2}))?\s*h?\s*[-–—]\s*(\d{1,2})(?:\s*[:h]\s*(\d{1,2}))?\s*h?/

/** «2ª» é segunda… «6ª» é sexta: ordinais passam a nomes antes de tudo. */
const ORDINAL = { 2: 'seg', 3: 'ter', 4: 'qua', 5: 'qui', 6: 'sex' }

/**
 * Minúsculas e sem acentos. Os ordinais («2ª–6ª») passam a nomes («seg–
 * sex») logo no início: sem isso, «2–6» seria lido como 02:00–06:00.
 */
const plain = (s) =>
  s
    .toLowerCase()
    .replace(/([2-6])\s*[ªº]/g, (_, d) => ORDINAL[d])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Minutos desde a meia-noite → «19:00». */
const clock = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Horas de um troço («07:30–19:00») em minutos; null se não houver. */
function timeRange(text) {
  const m = text.match(TIME_RE)
  if (!m) return null
  const open = Number(m[1]) * 60 + Number(m[2] || 0)
  const close = Number(m[3]) * 60 + Number(m[4] || 0)
  if (close <= open) return null // horário nocturno: não se adivinha
  return { open, close }
}

/**
 * Dias de um troço: «Seg–Sáb» → [1..6], «Sáb, Dom» → [6, 0]. Só se lê a
 * parte ANTES das horas, para os números do relógio não passarem por dias.
 */
function daysIn(text) {
  const t = plain(text)
  if (/todos os dias|diariamente|todo o dia/.test(t)) return ALL_DAYS

  const time = t.match(TIME_RE)
  const head = time ? t.slice(0, time.index) : t
  const nums = head.replace(DAY_RE, (m) => ` ${DAY_NUMBER[m]} `)

  const out = new Set()
  for (const part of nums.split(/[,;]|\be\b/)) {
    const range = part.match(/([0-6])\s*(?:[-–—]|a|ate)\s*([0-6])/)
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      if (from <= to) {
        for (let d = from; d <= to; d++) out.add(d)
      } else {
        // «Sáb–Dom» é 6–0: no `getDay()` a semana fecha ao domingo, por isso
        // o troço atravessa o fim da semana (6, 0) e não vai de 0 a 6 — sem
        // isto, um fim de semana lido como semana inteira escondia o fecho.
        for (let d = from; d <= 6; d++) out.add(d)
        for (let d = 0; d <= to; d++) out.add(d)
      }
    } else {
      // Só dígitos isolados: o «2» e o «4» de «24 horas» não são dias.
      for (const d of part.match(/\b[0-6]\b/g) || []) out.add(Number(d))
    }
  }
  return out.size ? [...out] : null
}

/** Semana a partir do texto: 7 posições com {open, close} ou null. */
function parseWeek(text) {
  const week = Array(7).fill(null)
  let current = null // dias do último troço que os declarou
  let sawTime = false

  for (const raw of text.split(/[·;|]/)) {
    const seg = raw.trim()
    if (!seg) continue

    const days = daysIn(seg)
    if (days) current = days
    const target = current || ALL_DAYS

    // «24 horas» não tem travessão de horas: é o dia inteiro.
    if (/24\s*h/i.test(seg)) {
      for (const d of target) week[d] = { open: 0, close: 24 * 60 }
      sawTime = true
      continue
    }

    const time = timeRange(seg)
    if (time) {
      for (const d of target) week[d] = time
      sawTime = true
    }
  }

  return sawTime ? week : null
}

/* Cache curto: o mesmo texto é lido em cada cartão de cada lista. */
const cache = new Map()

/**
 * Semana de funcionamento: 7 posições (0 = domingo), cada uma com
 * { open, close } em minutos ou null quando a farmácia está fechada nesse
 * dia. Devolve null quando o texto não permite concluir nada — quem chama
 * decide o que fazer (badge escondido, sugestões no padrão).
 */
export function openingWeek(openingHours) {
  if (!openingHours) return null
  const key = String(openingHours)
  if (cache.has(key)) return cache.get(key)
  const week = parseWeek(key)
  if (cache.size > 200) cache.clear()
  cache.set(key, week)
  return week
}

/**
 * "Aberto agora" a partir do opening_hours guardado pelas farmácias.
 * Aceita "Seg–Sáb · 07:30–19:00" e "Todos os dias · 24 horas".
 * Só regista false quando tem a certeza — em caso de dúvida, devolve
 * null (o chamador decide não mostrar badge em vez de mentir).
 */
export function openStatus(openingHours) {
  if (!openingHours) return null
  if (String(openingHours).toLowerCase().includes('24')) {
    return { open: true, label: 'Aberto 24 horas' }
  }

  const week = openingWeek(openingHours)
  if (!week) return null

  const now = new Date()
  const today = week[now.getDay()]
  // Sem horas hoje é dia de descanso — não é o mesmo que estar fora do
  // horário num dia em que a farmácia abre. Quem mostra o estado usa
  // `closedToday` para dizer «Fechado hoje» em vez de um «Fechado» seco.
  if (!today) return { open: false, closedToday: true, label: 'Fechado hoje' }

  const cur = now.getHours() * 60 + now.getMinutes()
  const open = cur >= today.open && cur < today.close
  return {
    open,
    closedToday: false,
    label: open ? `Aberto agora · fecha às ${clock(today.close)}` : 'Fechado',
  }
}

/**
 * Versão booleana para filtros — null (desconhecido) conta como não-aberta.
 */
export function isOpenNow(openingHours) {
  const s = openStatus(openingHours)
  return s ? s.open : false
}
