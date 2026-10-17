/**
 * Formatação da área interna — datas e «há quanto tempo», num sítio só.
 *
 * A ficha e a lista mostram as duas coisas: a data absoluta (para citar em
 * acta) e a distância (para decidir se é hoje ou se já passou tempo). Em PT
 * de Angola, com o fuso de Luanda.
 */

const TZ = 'Africa/Luanda'

/** «8/10/2026» — para colunas estreitas. */
export function dataCurta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: TZ,
  })
}

/** «8 de outubro de 2026, 14:30» — para a ficha e o histórico. */
export function dataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  })
}

/**
 * «há 3 dias», «há 2 horas», «hoje». Devolve `null` quando não há data —
 * quem chama decide o que dizer nesse caso («nunca confirmou»), porque a
 * ausência de data significa coisas diferentes em sítios diferentes.
 */
export function haQuanto(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const ms = Date.now() - t
  if (ms < 0) return 'agora'
  const min = Math.floor(ms / 60000)
  if (min < 2) return 'agora mesmo'
  if (min < 60) return `há ${min} minutos`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `há ${horas} hora${horas === 1 ? '' : 's'}`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `há ${anos} ano${anos === 1 ? '' : 's'}`
}

/** Classe da etiqueta de estado da farmácia (activa/inactiva). */
export function pillActiva(active) {
  return active ? 'interno-pill interno-pill--ok' : 'interno-pill interno-pill--off'
}

/**
 * Etiqueta do plano. O estado pesa mais que o nome: uma farmácia em graça
 * ou suspensa precisa de salto visual, mesmo que o plano seja o mesmo.
 */
export function pillPlano(plano) {
  if (!plano?.planCode) return 'interno-pill interno-pill--warn'
  if (plano.status === 'activo') return 'interno-pill interno-pill--plan'
  if (plano.status === 'trial') return 'interno-pill interno-pill--info'
  return 'interno-pill interno-pill--warn'
}

/** Texto do plano, com o estado só quando não é o «activo» normal. */
export function textoPlano(plano) {
  if (!plano?.planCode) return 'Sem plano'
  return plano.status === 'activo' ? plano.planoNome : `${plano.planoNome} · ${plano.statusLabel}`
}

/**
 * Rótulos do funil de leads. As chaves são os estados da base (CHECK da
 * 0001) e os valores o que a equipa lê — `onboarded` é «Convertido» porque
 * «onboarded» não é uma palavra que se diga ao telefone.
 */
export const ESTADOS_LEAD = {
  novo: 'Novo',
  em_conversa: 'Em conversa',
  demonstracao: 'Demonstração',
  acordo: 'Acordo',
  onboarded: 'Convertido',
  descartado: 'Descartado',
}

/** Nome do estado do funil, com rede de segurança para um estado novo. */
export function estadoLead(estado) {
  return ESTADOS_LEAD[estado] || estado || '—'
}

/**
 * Etiqueta do estado de um lead. O que pede acção salta: um lead novo é
 * âmbar (ninguém lhe tocou), um acordo está verde, e um descartado é neutro
 * de propósito — não é erro, é uma decisão tomada.
 */
export function pillLead(estado) {
  if (estado === 'novo') return 'interno-pill interno-pill--warn'
  if (estado === 'acordo') return 'interno-pill interno-pill--ok'
  if (estado === 'onboarded') return 'interno-pill interno-pill--plan'
  if (estado === 'descartado') return 'interno-pill interno-pill--off'
  return 'interno-pill interno-pill--info'
}

/** Preço do plano em kwanzas, por mês. Zero é «Grátis», não «0 Kz». */
export function preco(valor) {
  if (!valor) return 'Grátis'
  return `${new Intl.NumberFormat('pt-PT').format(valor)} Kz/mês`
}

/**
 * Prazo com a distância: «15/10/2026 (em 3 dias)», «em curso há 2 dias» ou
 * «terminou há 5 dias». É o número que decide uma conversa de cobrança — a
 * data sozinha obriga a fazer contas de cabeça.
 */
export function prazo(iso) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const dias = Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000))
  if (dias === 0) return `${dataCurta(iso)} (hoje)`
  if (dias > 0) return `${dataCurta(iso)} (em ${dias} ${dias === 1 ? 'dia' : 'dias'})`
  const passados = Math.abs(dias)
  return `${dataCurta(iso)} (terminou há ${passados} ${passados === 1 ? 'dia' : 'dias'})`
}
