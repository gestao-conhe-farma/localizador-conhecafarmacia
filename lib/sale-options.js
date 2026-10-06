/**
 * Formatação das opções de venda (0012) para o público.
 *
 * Regra do Localizador: o cliente tem de saber sempre O QUE o preço
 * significa. "Lâmina" com pack 1 mostra só o nome; caixa com pack 3
 * mostra "Caixa (3 lâminas)". Unidades da base ficam no parênteses.
 */

const UNIT_LABELS = {
  comprimido: 'Comprimido',
  lamina: 'Lâmina',
  caixa: 'Caixa',
  frasco: 'Frasco',
  ampola: 'Ampola',
  unidade: 'Unidade',
}

export function unitLabel(unit) {
  return UNIT_LABELS[unit] || unit
}

/**
 * Etiqueta completa de uma opção: "Lâmina" ou "Caixa (3 lâminas)".
 * baseLabel = o nome da unidade-base (da opção default), para o pack.
 */
export function formatOptionLabel(option, baseLabel) {
  const label = unitLabel(option.unit)
  const pack = option.pack_size ?? 1
  if (pack <= 1) return label
  return `${label} (${pack} ${baseLabel ? baseLabel.toLowerCase() : 'un.'})`
}

/**
 * A opção "comparável" de um item para o selo Melhor preço: a default
 * (unidade-base). Melhor preço só se compara entre a MESMA unidade —
 * nunca lâmina vs. caixa (o erro clássico que o 0012 corrige).
 */
export function comparableOption(saleOptions) {
  if (!Array.isArray(saleOptions) || saleOptions.length === 0) return null
  return saleOptions.find((o) => o.is_default) || saleOptions[0]
}

/**
 * Preço por UNIDADE-BASE de uma opção — o normalizador justo entre
 * formas de venda diferentes da mesma coisa. Caixa (3 lâminas) a 300 Kz
 * ≈ 100 Kz/lâmina, igual à lâmina solta a 100 Kz: o cliente vê que não
 * há penalização (ou que há) por comprar a caixa inteira.
 *
 * @returns number|null — null se preço/pack indisponíveis ou pack < 1
 */
export function perBasePrice(option) {
  if (!option) return null
  const pack = Number(option.pack_size)
  const price = Number(option.price)
  if (!Number.isFinite(pack) || pack < 1 || !Number.isFinite(price) || price < 0) return null
  return Math.round((price / pack) * 100) / 100
}

/**
 * Sufixo "≈ X Kz/un." para a etiqueta — só quando faz sentido, i.e.
 * a opção contém mais de uma unidade-base (a solta já É o preço
 * unitário; repetir seria ruído).
 */
export function formatPerBase(option, baseLabel) {
  const per = perBasePrice(option)
  if (per == null || (option.pack_size ?? 1) <= 1) return null
  const v = Number.isInteger(per) ? String(per) : per.toFixed(2)
  return `≈ ${v} Kz/${(baseLabel || 'un.').toLowerCase()}`
}

/**
 * Estrutura da caixa (0016) em texto — «Caixa com 10 lâminas de 10
 * comprimidos — 100 comprimidos no total.» Usada no modal de reserva
 * e no acompanhamento público.
 *
 * @returns string|null — null quando nada está registado; o chamador
 *   esconde a linha. Nunca inventa informação de embalagem.
 */
export function packStructureText(packLaminas, packComprimidos) {
  const lam = Number(packLaminas) || null
  const comp = Number(packComprimidos) || null
  if (!lam && !comp) return null
  if (lam && comp) {
    return `Caixa com ${lam} lâminas de ${comp} comprimidos — ${lam * comp} comprimidos no total.`
  }
  if (lam) return `Caixa com ${lam} lâminas.`
  return `Cada lâmina traz ${comp} comprimidos.`
}
