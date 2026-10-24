'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { isOpenNow, openStatus } from '@/lib/opening-hours'
import { defaultOption, freshness, priceOf, quantityText } from '@/lib/product-utils'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'
import { distanceKm, formatDistance, pharmacyPosition } from '@/lib/geo'

const ICON_CLOSE = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)

const priceNumber = (item) => {
  const value = defaultOption(item)?.price ?? item?.price
  const n = Number(value)
  return Number.isFinite(n) ? n : Infinity
}

const positionOf = (item) =>
  pharmacyPosition({
    lat: item.pharmacy_lat,
    lng: item.pharmacy_lng,
    municipio: item.pharmacy_municipio,
  })

/**
 * Passo 1 do fluxo de resultados: as farmácias de uma variante.
 *
 * Os filtros aqui são locais — preço, abertas agora e município/mais perto —
 * porque só fazem sentido para esta marca/dosagem. A localização global da
 * pesquisa (província/município) já está aplicada nos itens recebidos.
 */
export default function VariantSheet({
  variant,
  onClose,
  onOpenItem,
  location,
  onRequestLocation,
  locating = false,
  locationError = '',
}) {
  const cardRef = useRef(null)
  const closeRef = useRef(null)
  const restoreRef = useRef(null)
  const [maxPrice, setMaxPrice] = useState(null)
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [municipio, setMunicipio] = useState('')
  const [order, setOrder] = useState('preco')

  const prices = useMemo(
    () => variant.items.map(priceNumber).filter(Number.isFinite),
    [variant],
  )
  const minPrice = prices.length ? Math.min(...prices) : null
  const topPrice = prices.length ? Math.max(...prices) : null
  const cap = maxPrice ?? topPrice
  const step = topPrice > 20000 ? 500 : topPrice > 5000 ? 250 : 50

  const municipalities = useMemo(() => {
    const counts = new Map()
    for (const item of variant.items) {
      const m = item.pharmacy_municipio
      if (m) counts.set(m, (counts.get(m) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt'))
  }, [variant])

  const rows = useMemo(() => {
    const list = variant.items.filter((item) => {
      if (maxPrice != null && priceNumber(item) > maxPrice) return false
      if (onlyOpen && !isOpenNow(item.pharmacy_opening_hours)) return false
      if (municipio && item.pharmacy_municipio !== municipio) return false
      return true
    })
    if (order === 'perto' && location) {
      return [...list].sort(
        (a, b) =>
          (distanceKm(location, positionOf(a)) ?? Infinity) -
          (distanceKm(location, positionOf(b)) ?? Infinity),
      )
    }
    return [...list].sort((a, b) => priceNumber(a) - priceNumber(b))
  }, [variant, maxPrice, onlyOpen, municipio, order, location])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusables = [
        ...card.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    restoreRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      const restore = restoreRef.current
      if (restore && typeof restore.focus === 'function') restore.focus()
    }
  }, [onClose])

  const askNear = async () => {
    if (location) {
      setOrder('perto')
      return
    }
    const coords = await onRequestLocation?.()
    if (coords) setOrder('perto')
  }

  const dose = [variant.drug_form, variant.drug_dosage].filter(Boolean).join(' · ')

  return (
    <div
      className="pdp-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="pdp-modal__card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Farmácias com ${variant.drug_name}`}
      >
        <div className="pdp-modal__bar">
          <span className="pdp-modal__tag">Farmácias com stock</span>
          <button
            type="button"
            className="pdp-modal__close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Fechar lista de farmácias"
            title="Fechar (Esc)"
          >
            {ICON_CLOSE}
          </button>
        </div>

        <div className="pdp-modal__body">
          <div className="vsheet-body">
          <header className="vsheet-head">
            <p className="vsheet-eyebrow">{variant.brand || 'Sem marca'}</p>
            <h2>{variant.drug_name}</h2>
            <p className="vsheet-sub">
              {dose ? `${dose} · ` : ''}
              {variant.pharmacies.size} {variant.pharmacies.size === 1 ? 'farmácia' : 'farmácias'}
              {minPrice != null ? ` · desde ${fmtKz(minPrice)}` : ''}
            </p>
          </header>

          <div className="vsheet-tools">
            {topPrice > minPrice ? (
              <label className="vsheet-price">
                <span>
                  Preço até <b>{fmtKz(cap)}</b>
                </span>
                <input
                  type="range"
                  min={minPrice}
                  max={topPrice}
                  step={step}
                  value={cap}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMaxPrice(v >= topPrice ? null : v)
                  }}
                  aria-label="Preço máximo"
                />
              </label>
            ) : null}

            <button
              type="button"
              className={`cf-chip${onlyOpen ? ' cf-chip--on' : ''}`}
              aria-pressed={onlyOpen}
              onClick={() => setOnlyOpen((v) => !v)}
            >
              Abertas agora
            </button>

            <button
              type="button"
              className={`cf-chip${order === 'perto' ? ' cf-chip--on' : ''}`}
              aria-pressed={order === 'perto'}
              onClick={askNear}
              disabled={locating}
            >
              {locating ? 'A obter posição…' : 'Mais perto'}
            </button>
          </div>

          {municipalities.length > 1 ? (
            <div className="sh-toolbar sh-toolbar--sub" role="group" aria-label="Filtrar por município">
              <span className="sh-toolbar-label">Município</span>
              <button
                type="button"
                className={`cf-chip${municipio === '' ? ' cf-chip--on' : ''}`}
                onClick={() => setMunicipio('')}
              >
                Todos
              </button>
              {municipalities.map(([name]) => (
                <button
                  key={name}
                  type="button"
                  className={`cf-chip${municipio === name ? ' cf-chip--on' : ''}`}
                  aria-pressed={municipio === name}
                  onClick={() => setMunicipio(municipio === name ? '' : name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          {locationError ? (
            <p className="vsheet-note" role="status">
              {locationError}
            </p>
          ) : null}

          {rows.length === 0 ? (
            <div className="sh-empty">
              <p className="sh-empty-title">Nenhuma farmácia com estes filtros</p>
              <p className="sh-empty-sub">
                Aumente o preço máximo, desligue «abertas agora» ou escolha outro município.
              </p>
            </div>
          ) : (
            <div className="e-rows">
              <div className="e-head">
                <span>Farmácia</span>
                <span>Horário</span>
                <span>Confirmação</span>
                <span style={{ textAlign: 'right' }}>Preço</span>
                <span />
              </div>
              {rows.map((item) => {
                const st = openStatus(item.pharmacy_opening_hours)
                const price = priceOf(item)
                const km = location ? distanceKm(location, positionOf(item)) : null
                const qty = quantityText(item)
                return (
                  <div key={item.stock_item_id} className="e-row">
                    <div className="e-who">
                      <b>{item.pharmacy_name}</b>
                      <span>
                        {[
                          item.pharmacy_municipio,
                          km != null ? formatDistance(km) : null,
                          qty,
                          item.origin ? `Origem: ${item.origin}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span className="e-hrs">
                      <i className={`cf-dot${st && !st.open ? ' cf-dot--off' : ''}`} />
                      {st ? st.label : item.pharmacy_opening_hours || 'Horário não indicado'}
                    </span>
                    <span className="e-fresh">
                      <i className="cf-dot" />
                      {freshness(item.confirmed_at) ? `há ${freshness(item.confirmed_at)}` : 'agora'}
                    </span>
                    <span className="e-price price">{price.label}</span>
                    <span className="e-go">
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        onClick={() => onOpenItem(item.stock_item_id)}
                      >
                        Ver ficha
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
