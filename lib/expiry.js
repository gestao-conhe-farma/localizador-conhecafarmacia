/**
 * Validade do stock (`stock_items.expires_at`, uma DATE 'YYYY-MM-DD').
 *
 * Partilhado pelo portal (avisos a 90/60/30 dias) e pela página pública
 * (mostrar a validade) — uma única definição de "expira quando" para os
 * dois lados não divergirem.
 *
 * Notas de fuso: uma validade é uma data, não um instante. Fazer
 * `new Date('2027-03-31')` interpreta como meia-noite UTC e pode mostrar o
 * dia anterior num fuso a oeste (Luanda é UTC+1, mas a regra vale para
 * qualquer um) — por isso aqui as datas são partidas à mão, sem Date.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Limiares de aviso, do mais urgente para o mais folgado. */
export const EXPIRY_WINDOWS = [30, 60, 90]

/** 'YYYY-MM-DD' → mês/ano legível ('mar/2027'). */
export function monthYear(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [ano, mes] = iso.slice(0, 10).split('-')
  const nome = MESES[Number(mes) - 1]
  return nome ? `${nome}/${ano}` : null
}

/**
 * Dias de calendário até à validade (negativo = já expirou).
 * `null` quando não há validade registada — os consumidores mostram
 * "sem validade" em vez de inventarem um número.
 *
 * A conta é em DIAS DE CALENDÁRIO, não em horas: uma validade que termina
 * hoje são 0 dias ("Expira hoje"), não "0,4 dias arredondado para 1". O
 * round absorve a mudança de hora legal nos fusos que a têm.
 */
export function daysUntilExpiry(iso, now = Date.now()) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  const validade = new Date(ano, mes - 1, dia)
  if (Number.isNaN(validade.getTime())) return null
  const d = new Date(now)
  const inicioHoje = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((validade.getTime() - inicioHoje.getTime()) / 86400000)
}

function comDias(dias) {
  if (dias === 0) return 'Expira hoje'
  return `Expira em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

/**
 * Nível de alerta de uma validade:
 *   null       → sem validade registada
 *   'expired'  → já expirou (escondido no Localizador)
 *   '30'|'60'|'90' → expira dentro da respectiva janela
 *   'ok'       → expira mais tarde; `label` mostra só mês/ano
 */
export function expiryStatus(iso, now = Date.now()) {
  const dias = daysUntilExpiry(iso, now)
  if (dias == null) return null
  if (dias < 0) return { days: dias, level: 'expired', label: 'Expirado' }
  if (dias <= 30) return { days: dias, level: '30', label: comDias(dias) }
  if (dias <= 60) return { days: dias, level: '60', label: comDias(dias) }
  if (dias <= 90) return { days: dias, level: '90', label: comDias(dias) }
  return { days: dias, level: 'ok', label: `Validade ${monthYear(iso)}` }
}

/** O item precisa de atenção (expira na janela ou já expirou)? */
export function needsExpiryAttention(iso, now = Date.now()) {
  const st = expiryStatus(iso, now)
  return Boolean(st && st.level !== 'ok')
}

/** Contagem por janela, para o resumo do portal. */
export function countExpiryBuckets(items, now = Date.now()) {
  const buckets = { expired: 0, 30: 0, 60: 0, 90: 0 }
  for (const it of items || []) {
    if (it && it.in_stock === false) continue // fora de stock: não interessa
    const st = expiryStatus(it?.expires_at, now)
    if (st && st.level !== 'ok') buckets[st.level] += 1
  }
  return buckets
}

/** Resumo em português para o banner do portal (null se não houver nada). */
export function expirySummary(buckets) {
  if (!buckets) return null
  const partes = []
  if (buckets.expired) {
    partes.push(`${buckets.expired} já expirou${buckets.expired !== 1 ? 'ram' : ''}`)
  }
  if (buckets['30']) partes.push(`${buckets['30']} em menos de 30 dias`)
  if (buckets['60']) partes.push(`${buckets['60']} em menos de 60 dias`)
  if (buckets['90']) partes.push(`${buckets['90']} em menos de 90 dias`)
  if (partes.length === 0) return null
  return partes.join(' · ')
}
