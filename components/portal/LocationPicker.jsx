'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MUNICIPIO_CENTERS, toCoords } from '@/lib/geo'

/**
 * Mapa de escolha de localização — o mesmo mapa real da página pública
 * (tiles raster do OpenStreetMap, sem biblioteca nem chave de API: a CSP
 * do proxy.js só autoriza tile.openstreetmap.org).
 *
 * Interacção: clicar coloca o alfinete no ponto exacto; arrastar move o
 * mapa; +/− aproximam; «Marcar centro» usa o centro do que está à vista
 * (útil com teclado); «Centrar no alfinete» volta ao ponto guardado.
 *
 * O componente NÃO guarda a localização: recebe lat/lng (null = sem
 * alfinete) e devolve `{ lat, lng }` ou `null` por `onChange`. Quem grava
 * é o formulário, que envia os campos lat/lng para updatePharmacyProfile.
 *
 * Sem coordenadas o mapa abre no centro do município (ou em Luanda) e
 * mostra o território: é o convite a clicar, não um erro.
 */

const TILE = 256
const MIN_ZOOM = 4
const MAX_ZOOM = 18
const DETAIL_ZOOM = 16
const OVERVIEW_ZOOM = 13
const FALLBACK = { lat: -8.838, lng: 13.234 } // centro de Luanda
const DRAG_SLOP = 6 // px: abaixo disto é um clique, não um arrasto

/* ---------------- projecção Web Mercator (píxeis do mundo) ---------------- */

const worldSize = (zoom) => TILE * 2 ** zoom

const lngToX = (lng, zoom) => ((lng + 180) / 360) * worldSize(zoom)

const latToY = (lat, zoom) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(zoom)
}

const xToLng = (x, zoom) => (x / worldSize(zoom)) * 360 - 180

const yToLat = (y, zoom) => {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(zoom)
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const round6 = (v) => Math.round(v * 1e6) / 1e6
const fmt = (v) => v.toFixed(5)

export default function LocationPicker({ lat, lng, municipio = '', onChange }) {
  const pin = toCoords(lat, lng)
  const pinLat = pin?.lat ?? null
  const pinLng = pin?.lng ?? null

  const [center, setCenter] = useState(() => pin || MUNICIPIO_CENTERS[municipio] || FALLBACK)
  const [zoom, setZoom] = useState(() => (pin ? DETAIL_ZOOM : OVERVIEW_ZOOM))
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const surfaceRef = useRef(null)
  const dragRef = useRef(null)

  // As tiles são posicionadas em píxeis: precisamos da largura real.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const view = useMemo(() => {
    if (!size.w || !size.h) return null
    const left = lngToX(center.lng, zoom) - size.w / 2
    const top = latToY(center.lat, zoom) - size.h / 2
    const count = 2 ** zoom
    const x0 = Math.floor(left / TILE)
    const x1 = Math.floor((left + size.w) / TILE)
    const y0 = Math.floor(top / TILE)
    const y1 = Math.floor((top + size.h) / TILE)
    const tiles = []
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= count) continue
      for (let x = x0; x <= x1; x++) {
        const wrapped = ((x % count) + count) % count
        tiles.push({
          key: `${zoom}/${wrapped}/${y}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
          x: x * TILE - left,
          y: y * TILE - top,
        })
      }
    }
    return { left, top, tiles }
  }, [center, zoom, size])

  // Coordenadas que chegam de fora (escritas no formulário): se o
  // alfinete caiu fora do ecrã, o mapa vai ter com ele. Ajuste feito no
  // render — é o padrão do React para estado derivado de props; um
  // efeito aqui só somava renders em cascata.
  const [seenPin, setSeenPin] = useState({ lat: pinLat, lng: pinLng })
  if (seenPin.lat !== pinLat || seenPin.lng !== pinLng) {
    setSeenPin({ lat: pinLat, lng: pinLng })
    if (pin && view) {
      const x = lngToX(pin.lng, zoom) - view.left
      const y = latToY(pin.lat, zoom) - view.top
      const margin = 24
      if (x < margin || y < margin || x > size.w - margin || y > size.h - margin) {
        setCenter({ lat: pin.lat, lng: pin.lng })
      }
    }
  }

  const panBy = (dx, dy) => {
    setCenter((c) => ({
      lng: xToLng(lngToX(c.lng, zoom) - dx, zoom),
      lat: clamp(yToLat(latToY(c.lat, zoom) - dy, zoom), -85, 85),
    }))
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      // Falha em alguns browsers se o ponteiro já não estiver activo;
      // sem captura o arrasto continua enquanto estiver sobre o mapa.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* sem captura — o arrasto funciona dentro do mapa */
    }
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }
    setDragging(true)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!dx && !dy) return
    drag.x = e.clientX
    drag.y = e.clientY
    drag.moved += Math.abs(dx) + Math.abs(dy)
    panBy(dx, dy)
  }

  const endDrag = (e) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (drag.moved > DRAG_SLOP || !view) return // foi um arrasto
    const rect = e.currentTarget.getBoundingClientRect()
    const x = view.left + (e.clientX - rect.left)
    const y = view.top + (e.clientY - rect.top)
    onChange({ lat: round6(yToLat(y, zoom)), lng: round6(xToLng(x, zoom)) })
  }

  const cancelDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 160 : 64
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      panBy(step, 0)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      panBy(-step, 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      panBy(0, step)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      panBy(0, -step)
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      setZoom((z) => Math.min(MAX_ZOOM, z + 1))
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      setZoom((z) => Math.max(MIN_ZOOM, z - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onChange({ lat: round6(center.lat), lng: round6(center.lng) })
    }
  }

  const markCenter = () => onChange({ lat: round6(center.lat), lng: round6(center.lng) })

  const focusPin = () => {
    if (!pin) return
    setCenter({ lat: pin.lat, lng: pin.lng })
    setZoom((z) => Math.max(z, DETAIL_ZOOM))
  }

  const pinX = pin && view ? lngToX(pin.lng, zoom) - view.left : null
  const pinY = pin && view ? latToY(pin.lat, zoom) - view.top : null

  return (
    <div className="map-picker">
      <div
        ref={surfaceRef}
        className={`map-picker__surface${dragging ? ' is-dragging' : ''}`}
        role="application"
        aria-label="Mapa — clique para marcar a localização da farmácia"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
        onKeyDown={onKeyDown}
      >
        {view?.tiles.map((tile) => (
          <img
            key={tile.key}
            className="map-picker__tile"
            src={tile.src}
            alt=""
            width={TILE}
            height={TILE}
            draggable="false"
            loading="lazy"
            style={{ transform: `translate(${tile.x}px, ${tile.y}px)` }}
          />
        ))}

        {pinX != null && (
          <span
            className="map-picker__pin"
            style={{ transform: `translate(${pinX}px, ${pinY}px)` }}
            aria-hidden="true"
          >
            <i />
          </span>
        )}

        <div className="map-picker__zoom">
          <button
            type="button"
            aria-label="Aproximar"
            title="Aproximar"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Afastar"
            title="Afastar"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
          >
            −
          </button>
        </div>

        {pin && (
          <span className="map-picker__readout">
            {fmt(pin.lat)} · {fmt(pin.lng)}
          </span>
        )}

        <a
          className="map-picker__credit"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          © OpenStreetMap
        </a>
      </div>

      <div className="map-picker__bar">
        <span className="map-picker__hint">
          Clique no mapa para pôr o alfinete no ponto exacto. Arraste para mover; setas e{' '}
          <kbd>+</kbd>/<kbd>−</kbd> também funcionam com o mapa focado.
        </span>
        <div className="map-picker__actions">
          <button type="button" className="map-picker__action" onClick={markCenter}>
            Marcar centro
          </button>
          <button type="button" className="map-picker__action" onClick={focusPin} disabled={!pin}>
            Centrar no alfinete
          </button>
          <button
            type="button"
            className="map-picker__action map-picker__action--danger"
            onClick={() => onChange(null)}
            disabled={!pin}
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}
