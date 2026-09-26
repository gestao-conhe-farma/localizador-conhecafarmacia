/**
 * Utilitários de horário de funcionamento — partilhados entre componentes
 * client (lista de farmácias, detalhe) e código server (página da farmácia).
 */

/**
 * "Aberto agora" a partir do opening_hours guardado pelas farmácias.
 * Aceita "Seg–Sáb · 07:30–19:00" e "Todos os dias · 24 horas".
 * Só regista false quando tem a certeza — em caso de dúvida, devolve
 * null (o chamador decide não mostrar badge em vez de mentir).
 */
export function openStatus(openingHours) {
  if (!openingHours) return null
  const h = openingHours.toLowerCase()
  if (h.includes('24')) return { open: true, label: 'Aberto 24 horas' }

  const m = h.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  const openMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const open = cur >= openMin && cur < closeMin
  return {
    open,
    label: open ? `Aberto agora · fecha às ${m[3]}:${m[4]}` : 'Fechado',
  }
}

/**
 * Versão booleana para filtros — null (desconhecido) conta como não-aberta.
 */
export function isOpenNow(openingHours) {
  const s = openStatus(openingHours)
  return s ? s.open : false
}
