import { normalizarTexto } from '@/lib/constants'
import { defaultOption } from '@/lib/product-utils'
import { distanceKm, pharmacyPosition } from '@/lib/geo'

/**
 * Variantes — a unidade dos resultados da pesquisa.
 *
 * Um medicamento pode ter várias marcas (Ben-u-ron, genérico) para a mesma
 * dosagem. O grupo antigo juntava-as num só card e mostrava a marca do item
 * mais barato, o que confundia: o cartão dizia «Ben-u-ron» e a tabela ao lado
 * incluía stock sem marca. Aqui a chave é `drug_id + marca`, tal como o
 * cliente as vê na prateleira.
 */
export function brandKeyOf(item) {
  return normalizarTexto(item?.brand || '')
}

export function variantKeyOf(item) {
  return `${item.drug_id}::${brandKeyOf(item)}`
}

function itemPrice(item) {
  const value = defaultOption(item)?.price ?? item?.price
  const n = Number(value)
  return value != null && Number.isFinite(n) ? n : null
}

/** Junta linhas de stock por medicamento + marca, com os totais do cartão. */
export function groupVariants(items) {
  const map = new Map()

  for (const item of items || []) {
    const key = variantKeyOf(item)
    let variant = map.get(key)
    if (!variant) {
      variant = {
        key,
        drug_id: item.drug_id,
        brand: item.brand || '',
        brandKey: brandKeyOf(item),
        drug_name: item.drug_name,
        drug_molecule: item.drug_molecule,
        drug_form: item.drug_form,
        drug_dosage: item.drug_dosage,
        drug_kind: item.drug_kind,
        drug_requires_rx: item.drug_requires_rx,
        items: [],
        pharmacies: new Set(),
        municipalities: new Map(),
        minPrice: null,
        quantity: 0,
        hasQuantity: false,
        latest: 0,
        image_path: null,
      }
      map.set(key, variant)
    }

    variant.items.push(item)
    if (item.pharmacy_name) {
      variant.pharmacies.add(item.pharmacy_name)
      const m = item.pharmacy_municipio
      if (m) variant.municipalities.set(m, (variant.municipalities.get(m) || 0) + 1)
    }

    const price = itemPrice(item)
    if (price != null && (variant.minPrice == null || price < variant.minPrice)) {
      variant.minPrice = price
    }

    if (item.quantity != null) {
      variant.hasQuantity = true
      variant.quantity += Number(item.quantity) || 0
    }

    const at = new Date(item.confirmed_at).getTime()
    if (Number.isFinite(at) && at > variant.latest) variant.latest = at
    if (!variant.image_path && item.image_path) variant.image_path = item.image_path
  }

  return [...map.values()]
}

/** Município com mais farmácias do grupo (fallback para «onde está»). */
export function mainMunicipality(variant) {
  let best = null
  for (const [name, count] of variant?.municipalities || []) {
    if (!best || count > best.count) best = { name, count }
  }
  return best?.name || null
}

/** Distância à farmácia mais próxima do grupo (null sem localização). */
export function nearestDistance(variant, location) {
  if (!location) return null
  let best = null
  for (const item of variant?.items || []) {
    const pos = pharmacyPosition({
      lat: item.pharmacy_lat,
      lng: item.pharmacy_lng,
      municipio: item.pharmacy_municipio,
    })
    const km = distanceKm(location, pos)
    if (km != null && (best == null || km < best)) best = km
  }
  return best
}

const byName = (a, b) =>
  String(a.drug_name).localeCompare(String(b.drug_name), 'pt') ||
  String(a.brand).localeCompare(String(b.brand), 'pt') ||
  String(a.drug_dosage || '').localeCompare(String(b.drug_dosage || ''), 'pt')

/**
 * Ordenação dos cards. «nome» é a predefinição: previsível e estável para
 * quem sabe o que procura. As restantes respondem a outras intenções.
 */
export function sortVariants(variants, sort) {
  const list = [...(variants || [])]
  if (sort === 'farmacias') {
    return list.sort(
      (a, b) => b.pharmacies.size - a.pharmacies.size || a.items.length - b.items.length || byName(a, b),
    )
  }
  if (sort === 'preco') {
    return list.sort(
      (a, b) =>
        (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity) ||
        b.pharmacies.size - a.pharmacies.size ||
        byName(a, b),
    )
  }
  if (sort === 'recente') {
    return list.sort((a, b) => b.latest - a.latest || byName(a, b))
  }
  return list.sort(byName)
}
