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
  Rússia: 'RU',
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

/**
 * Grupos do filtro de origem da pesquisa. Os rótulos são os do dia-a-dia
 * em Angola («português», «indiano», «russo»), não os nomes dos países:
 * é assim que o cliente pergunta pelo medicamento.
 */
export const ORIGIN_FILTERS = [
  { id: 'pt', label: 'Português' },
  { id: 'in', label: 'Indiano' },
  { id: 'ru', label: 'Russo' },
  { id: 'outros', label: 'Outros' },
]

/** Minúsculas e sem acentos — «Índia» e «india» são a mesma origem. */
const fold = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/**
 * Grupo de uma origem tal como está guardada no stock (texto da lista do
 * portal, mas também tolera o que venha de importações: «Russia»,
 * «Federação Russa»). Devolve null quando a origem não foi indicada —
 * um filtro escolhido só mostra o que a farmácia declarou.
 */
export function originGroup(origin) {
  const t = fold(origin)
  if (!t) return null
  if (t.includes('portugal') || t.includes('portugues')) return 'pt'
  if (t.includes('india') || t.includes('indian')) return 'in'
  if (t.includes('russia') || t.includes('russa') || t.includes('russo')) return 'ru'
  return 'outros'
}
