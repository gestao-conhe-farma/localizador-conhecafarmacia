import Link from 'next/link'
import {
  activeOptions,
  cardMeta,
  drugImageUrl,
  freshness,
  kindLabel,
  priceOf,
  productHref,
  quantityText,
} from '@/lib/product-utils'
import { formatOptionLabel, unitLabel } from '@/lib/sale-options'

/**
 * Cartão de produto (Modelo D) — o mesmo na prateleira da farmácia, na
 * cabeça de cada grupo da busca (variante `flat`) e nas alternativas.
 *
 * Regra de honestidade: quando a farmácia não fotografou a embalagem, o
 * lugar da foto é ocupado pela embalagem tipográfica com os dados reais
 * (marca, nome, forma, quantidade) — nunca por uma imagem inventada.
 */
export default function ProductCard({ item, flat = false, ctaLabel, priceLabel, onOpen = null }) {
  if (!item) return null
  const photo = drugImageUrl(item.image_path)
  const opts = activeOptions(item)
  const price = priceOf(item)
  const qty = quantityText(item)
  const kind = item.drug_kind || 'medicamento'
  const showKind = kind !== 'medicamento'
  const label = ctaLabel || (item.reservable === false ? 'Ver ficha' : 'Ver ficha e reservar')

  // Com `onOpen`, o cartão abre a ficha em modal sobre a lista em vez de
  // navegar. Ctrl/Cmd/Shift/clique do meio continuam a abrir a rota numa
  // nova aba — o href não é decorativo.
  const openProps = onOpen
    ? {
        onClick: (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          onOpen(item.stock_item_id)
        },
      }
    : null

  return (
    <Link
      href={productHref(item.stock_item_id)}
      className={`pcard${flat ? ' pcard--flat' : ''}`}
      aria-label={`${item.drug_name} — ${label}`}
      {...openProps}
    >
      <div className="pcard-media">
        <div className="pcard-flags">
          {showKind && <span className="tagchip">{kindLabel(kind)}</span>}
          {item.drug_requires_rx ? (
            <span className="tagchip tagchip--rx">Receita</span>
          ) : (
            <span className="tagchip">Venda livre</span>
          )}
          {item.reservable === false && <span className="tagchip">Balcão</span>}
        </div>

        {photo ? (
          <img
            className="cf-photo"
            src={photo}
            alt={`Embalagem de ${item.drug_name} — ${item.pharmacy_name}`}
            loading="lazy"
          />
        ) : (
          <div className="pack">
            <span className="pack-brand">{item.brand || item.pharmacy_name}</span>
            <span className="pack-name">{item.drug_name}</span>
            {item.drug_form && <span className="pack-dose">{item.drug_form}</span>}
            <span className="pack-foot">
              <span>{presentation(item) || kindLabel(kind)}</span>
              <span>{qty || 'Confirmado'}</span>
            </span>
          </div>
        )}
      </div>

      <div className="pcard-body">
        <span className="pcard-name">{item.drug_name}</span>
        <span className="pcard-meta">
          {[cardMeta(item), qty].filter(Boolean).join(' · ') || item.pharmacy_name}
        </span>

        <div className="pcard-pricerow">
          <div>
            <span className="price">{priceLabel || price.label}</span>
            {price.per && <div className="pcard-unit">{price.per}</div>}
          </div>
          <span className="pcard-fresh">
            <i className="cf-dot" />
            {freshness(item.confirmed_at) || 'agora'}
          </span>
        </div>

        {opts.length > 1 && (
          <div className="pcard-unit" style={{ marginTop: 4 }}>
            {opts
              .map((o) => formatOptionLabel(o, unitLabel(opts.find((x) => x.is_default)?.unit)))
              .join(' · ')}
          </div>
        )}
      </div>

      <span className="pcard-cta">{label}</span>
    </Link>
  )
}

/** Apresentação curta para a etiqueta da embalagem tipográfica. */
function presentation(item) {
  return [item?.drug_form, item?.drug_dosage].filter(Boolean).join(' · ')
}
