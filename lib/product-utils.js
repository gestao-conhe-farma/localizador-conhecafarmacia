/**
 * Peças comuns do Localizador no desenho de loja (Modelos D/E/F).
 *
 * A prateleira da farmácia, a busca por produto e a ficha partilham os
 * MESMOS rótulos, o mesmo preço e a mesma frescura — sem três versões a
 * divergir. Nada aqui inventa dados: o que a view stock_confirmed não
 * traz (fotografia, validade, quantidade) simplesmente desaparece.
 */

import { fmtKzPublic } from '@/lib/reservation-format'
import { perBasePrice, unitLabel } from '@/lib/sale-options'

export const DRUG_IMAGES_BUCKET = 'drug-images'

/** URL pública da foto da embalagem — null quando a farmácia não fotografou. */
export function drugImageUrl(imagePath) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!imagePath || !base) return null
  return `${base}/storage/v1/object/public/${DRUG_IMAGES_BUCKET}/${imagePath}`
}

/** Categorias de produto (0038) — o mesmo vocabulário do portal. */
const KIND_LABELS = {
  medicamento: 'Medicamento',
  bebe: 'Bebé',
  higiene: 'Higiene',
  beleza: 'Beleza',
  outros: 'Outros',
}

/** Rótulo curto da categoria — "Medicamento" é a omissão da 0038. */
export function kindLabel(kind) {
  return KIND_LABELS[kind] || 'Produto'
}

/** Frescura em texto curto: "12 min", "3 h", "2 d". */
export function freshness(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}

/** "há 12 min" — a forma usada nas frases. */
export function freshnessPhrase(iso) {
  const f = freshness(iso)
  return f ? `há ${f}` : ''
}

/** Opções de venda activas (0012) — a default primeiro. */
export function activeOptions(item) {
  const opts = (item?.sale_options || []).filter((o) => o.active !== false)
  return [...opts].sort((a, b) => Number(b.is_default) - Number(a.is_default))
}

export function defaultOption(item) {
  const opts = activeOptions(item)
  return opts.find((o) => o.is_default) || opts[0] || null
}

/**
 * Preço a mostrar: o da opção escolhida (ou da default) e o preço por
 * unidade-base quando a embalagem traz mais de uma.
 *
 * @returns {{ label: string, per: string|null, option: object|null }}
 */
export function priceOf(item, option = null) {
  const opt = option || defaultOption(item)
  if (opt && opt.price != null) {
    const base = defaultOption(item)
    const per = perBasePrice(opt)
    return {
      label: fmtKzPublic(opt.price),
      per:
        per != null && Number(opt.pack_size ?? 1) > 1
          ? `≈ ${fmtKzPublic(per)}/${unitLabel(base?.unit || opt.unit).toLowerCase()}`
          : null,
      option: opt,
    }
  }
  if (item?.price != null) return { label: fmtKzPublic(item.price), per: null, option: null }
  return { label: 'Preço no balcão', per: null, option: null }
}

/** Apresentação em texto: "Comprimido · 500 mg". */
export function presentation(item) {
  return [item?.drug_form, item?.drug_dosage].filter(Boolean).join(' · ')
}

/** Linha secundária do cartão: marca e apresentação (sem repetir o nome). */
export function cardMeta(item) {
  const parts = []
  if (item?.brand) parts.push(item.brand)
  const pres = presentation(item)
  if (pres) parts.push(pres)
  return parts.join(' · ')
}

/** Quantidade em texto: "18 caixas", "1 frasco" — null quando não há. */
export function quantityText(item) {
  const q = Number(item?.quantity)
  if (!Number.isFinite(q) || q <= 0) return null
  const unit = defaultOption(item)?.unit
  const base = unit ? unitLabel(unit).toLowerCase() : 'unidade'
  const plural = base.endsWith('s') ? base : `${base}s`
  return `${q} ${q === 1 ? base : plural}`
}

/** Link interno do produto (ficha do item de stock concreto). */
export function productHref(stockItemId) {
  return `/produto/${stockItemId}`
}

/** Link WhatsApp com uma mensagem já escrita. */
export function whatsappHref(number, message) {
  if (!number) return null
  return `https://wa.me/${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

/** Link de direcções: maps_url da farmácia ou coordenadas/morada. */
export function directionsHref(pharmacy) {
  if (pharmacy?.maps_url) return pharmacy.maps_url
  const q =
    pharmacy?.lat && pharmacy?.lng
      ? `${pharmacy.lat},${pharmacy.lng}`
      : `${pharmacy?.name || ''} ${pharmacy?.address || ''} ${pharmacy?.municipio || ''}`.trim()
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
