'use client'

import { drugImageUrl } from '@/lib/product-utils'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'
import { formatDistance } from '@/lib/geo'
import { mainMunicipality } from '@/lib/variants'

function placeLabel(variant, distance) {
  if (distance != null) return `a ${formatDistance(distance)}`
  const main = mainMunicipality(variant)
  if (!main) return null
  const others = variant.municipalities.size - 1
  return others > 0 ? `${main} +${others}` : main
}

/**
 * Card de resultado: um medicamento numa marca e dosagem.
 *
 * A resposta principal — quantas farmácias têm, desde que preço, quantas
 * unidades e onde — fica à vista. O clique abre a lista de farmácias; não
 * esconde o essencial atrás do modal.
 */
export default function VariantCard({ variant, distance = null, onOpen }) {
  if (!variant) return null
  const photo = drugImageUrl(variant.image_path)
  const place = placeLabel(variant, distance)
  const dose = [variant.drug_form, variant.drug_dosage].filter(Boolean).join(' · ')
  const count = variant.pharmacies.size
  const label = `${variant.drug_name}${variant.brand ? ` ${variant.brand}` : ''} — ${count} farmácia${
    count === 1 ? '' : 's'
  }`

  return (
    <button
      type="button"
      className="vcard"
      onClick={() => onOpen(variant)}
      aria-label={`Ver farmácias com ${label}`}
    >
      <span className="vcard-media">
        {photo ? (
          <img className="vcard-photo" src={photo} alt="" loading="lazy" />
        ) : (
          <span className="vcard-pack">
            <span className="vcard-pack-brand">{variant.brand || 'Sem marca'}</span>
            <span className="vcard-pack-name">{variant.drug_name}</span>
            {dose ? <span className="vcard-pack-dose">{dose}</span> : null}
          </span>
        )}
      </span>

      <span className="vcard-body">
        <span className="vcard-eyebrow">{variant.brand || 'Sem marca'}</span>
        <span className="vcard-name">{variant.drug_name}</span>
        {dose ? <span className="vcard-dose">{dose}</span> : null}

        <span className="vcard-stats">
          <span className="vcard-stat">
            <b>{count}</b> {count === 1 ? 'farmácia' : 'farmácias'}
          </span>
          {variant.minPrice != null ? (
            <span className="vcard-stat">
              desde <b>{fmtKz(variant.minPrice)}</b>
            </span>
          ) : null}
          {variant.hasQuantity ? (
            <span className="vcard-stat">
              <b>{variant.quantity}</b> un.
            </span>
          ) : null}
          {place ? <span className="vcard-stat vcard-stat--place">{place}</span> : null}
        </span>

        {variant.drug_requires_rx ? <span className="tagchip tagchip--rx">Receita</span> : null}
      </span>
    </button>
  )
}
