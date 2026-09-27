/**
 * Origem dos medicamentos (0013) — país → código ISO.
 *
 * Antes eram bandeiras emoji; agora é o CÓDIGO do país em texto
 * (PT, IN, CN…) renderizado num selo pequeno — funciona igual em
 * qualquer browser/telemóvel (Windows sem emoji flags, por exemplo),
 * é neutro e legível num só glifo curto.
 */

export const ORIGIN_CODES = {
  Portugal: 'PT',
  Índia: 'IN',
  China: 'CN',
  Alemanha: 'DE',
  França: 'FR',
  Brasil: 'BR',
  EUA: 'US',
  'Reino Unido': 'GB',
  Egipto: 'EG',
  'África do Sul': 'ZA',
  Japão: 'JP',
  Turquia: 'TR',
}

/** Código curto do país («PT») — fallback neutro «·» se desconhecido. */
export function originCode(o) {
  return ORIGIN_CODES[o] || null
}
