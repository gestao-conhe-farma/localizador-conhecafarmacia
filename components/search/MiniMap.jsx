import { toCoords } from '@/lib/geo'

const TILE = 256
const ZOOM = 15
const GRID = 3 // 3×3 tiles: o centro cai sempre na tile do meio
const SPAN = TILE * GRID

/**
 * Mapa real (tiles raster do OpenStreetMap) à volta de um ponto, com o
 * alfinete no centro. Sem biblioteca de mapas: são 9 <img> posicionadas
 * com a matemática Web Mercator — o suficiente para uma lateral de
 * 296 px, sem 150 KB de JS nem chave de API.
 *
 * A CSP (proxy.js) só deixa carregar imagens de tile.openstreetmap.org.
 * Trocar de fornecedor implica mudar o URL das tiles E a CSP.
 *
 * Sem coordenadas válidas devolve null — o chamador mostra a morada.
 */
export default function MiniMap({ lat, lng, label, zoom = ZOOM, footnote }) {
  const point = toCoords(lat, lng)
  if (!point) return null

  const z = Math.min(18, Math.max(3, Number(zoom) || ZOOM))
  const scale = 2 ** z
  const tx = ((point.lng + 180) / 360) * scale
  const rad = (point.lat * Math.PI) / 180
  const ty = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale

  const x0 = Math.floor(tx) - 1
  const y0 = Math.floor(ty) - 1
  const px = (tx - x0) * TILE
  const py = (ty - y0) * TILE

  const tiles = []
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const x = (((x0 + col) % scale) + scale) % scale
      const y = y0 + row
      if (y < 0 || y >= scale) {
        tiles.push(null)
        continue
      }
      tiles.push({
        key: `${z}/${x}/${y}`,
        src: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      })
    }
  }

  return (
    <div className="real-map">
      <div
        className="real-map-tiles"
        role="img"
        aria-label={`Mapa — ${label || 'localização'}`}
        style={{
          width: SPAN,
          height: SPAN,
          left: `calc(50% - ${px}px)`,
          top: `calc(50% - ${py}px)`,
        }}
      >
        {tiles.map((t, i) =>
          t ? (
            <img
              key={`${t.key}-${i}`}
              src={t.src}
              alt=""
              width={TILE}
              height={TILE}
              loading="lazy"
              draggable="false"
            />
          ) : (
            <span key={`empty-${i}`} className="real-map-gap" />
          ),
        )}
      </div>

      <span className="real-map-pin" aria-hidden="true">
        <i />
      </span>

      {footnote && <span className="real-map-note">{footnote}</span>}

      <a
        className="real-map-credit"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        © OpenStreetMap
      </a>
    </div>
  )
}
