/**
 * Formatação de reservas — quantidade e valor estimado num módulo
 * único, consumido por todas as superfícies (Localizador, portal,
 * acompanhamento público, mensagens de WhatsApp).
 *
 * Antes destas funções viverem aqui, havia 5 cópias de fmtKz,
 * 3 de estimateTotal e variantes de descrição de quantidade em
 * ReservationStatus / reservation-messages / ReservationsQueue /
 * ReservationDetailModal — qualquer ajuste de regra era um passeio
 * por 4 ficheiros. Agora: um sítio.
 */

/** Moeda angolana — 2 casas (estimativas com fraccionamento dão décimos). */
export const fmtKz = (n) =>
  new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n) + ' Kz'

/** Moeda para preços públicos — sem casas (100 Kz lê-se melhor que 100,00 Kz). */
export const fmtKzPublic = (n) =>
  new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n) + ' Kz'

/**
 * Valor ESTIMADO da reserva (0012): quantidade (confirmada, se houver)
 * × preço da opção de venda. É estimativa — o final é o do balcão.
 *
 * @returns {number|null} null = sem opção com preço (reserva legada):
 *   não há de onde vir um valor fiável, mostrar zero seria mentir.
 */
export function estimateTotal(r) {
  const opt = r.stock_sale_options
  if (!opt || opt.price == null) return null
  const qty = r.confirmed_quantity ?? r.quantity
  if (qty == null) return null
  return Math.round(qty * Number(opt.price) * 100) / 100
}

/** Rótulos das unidades de venda — o mesmo do lib/sale-options.js. */
const UNIT_LABELS = {
  comprimido: 'comprimido',
  lamina: 'lâmina',
  caixa: 'caixa',
  frasco: 'frasco',
  ampola: 'ampola',
  unidade: 'unidade',
}

/** Rótulo legível da unidade («lâmina», não o id «lamina»). */
export function unitLabelLower(unit) {
  return UNIT_LABELS[unit] || unit
}

/**
 * Descrição do que foi reservado, com a forma de venda (0012):
 * «1 caixa (cada uma com 3 unidades)» ou «5 lâminas». Sem opção:
 * «2 unidades». Usa confirmed_quantity quando existe — a quantidade
 * que a farmácia realmente confirmou.
 */
export function quantityDesc(r) {
  const q = r.confirmed_quantity ?? r.quantity ?? 1
  const opt = r.stock_sale_options
  if (!opt) return `${q} unidade${q !== 1 ? 's' : ''}`
  const label = unitLabelLower(opt.unit)
  if ((opt.pack_size ?? 1) > 1) {
    // Estrutura física (0016): «1 caixa com 10 lâminas de 10
    // comprimidos» em vez do genérico «(cada uma com 10 unidades)» —
    // o cliente lê a embalagem real. Sem estrutura registada, o texto
    // antigo continua (nunca inventa).
    const lam = Number(r.stock_items?.pack_laminas) || null
    const comp = Number(r.stock_items?.pack_comprimidos) || null
    if (opt.unit === 'caixa' && lam) {
      return `${q} ${label}${q !== 1 ? 's' : ''} com ${lam} lâmina${lam !== 1 ? 's' : ''}${
        comp ? ` de ${comp} comprimidos` : ''
      }`
    }
    return `${q} ${label}${q !== 1 ? 's' : ''} (cada uma com ${opt.pack_size} unidades)`
  }
  return `${q} ${label}${q !== 1 && !label.endsWith('s') ? 's' : ''}`
}

/**
 * Linha de quantidade para o acompanhamento público — quando a
 * confirmação foi parcial, mostra as duas: «Confirmado: 2 caixas
 * (pediu 3)». Igual à quantityLine antiga do ReservationStatus.
 */
export function quantityLine(r) {
  if (r.confirmed_quantity != null && r.confirmed_quantity !== r.quantity) {
    return `Confirmado: ${quantityDesc(r)} (pediu ${r.quantity})`
  }
  return `Quantidade: ${quantityDesc(r)}`
}

/** «≈ 300 Kz (a confirmar no balcão)» — linha das mensagens oficiais. */
export function estimateLine(r) {
  const total = estimateTotal(r)
  return total != null ? `≈ ${fmtKz(total)} (a confirmar no balcão)` : null
}
