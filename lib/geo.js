/**
 * Geolocalização do Localizador — distâncias e posição do cliente.
 *
 * Regras:
 *   • A posição do cliente NUNCA sai do browser. Não é enviada para o
 *     Supabase, não vai em query string, não fica em cookies — só vive em
 *     sessionStorage (desaparece ao fechar o separador) e serve para
 *     ordenar e mostrar distâncias.
 *   • Nada é pedido sem um clique: o browser só pergunta a localização
 *     quando o cliente carrega em «Perto de mim».
 *   • Quando a farmácia não tem coordenadas registadas usamos o centro do
 *     município e dizemo-lo (≈ + «centro do município»). Nunca fingimos
 *     precisão que a base não tem.
 */

const EARTH_KM = 6371

/**
 * Centro (aproximado) de cada município de Luanda — usado só como
 * fallback quando a farmácia ainda não tem lat/lng próprias.
 */
export const MUNICIPIO_CENTERS = {
  Belas: { lat: -9.005, lng: 13.16 },
  Cacuaco: { lat: -8.776, lng: 13.372 },
  Cazenga: { lat: -8.8, lng: 13.3 },
  'Ícolo e Bengo': { lat: -9.116, lng: 13.7 },
  Luanda: { lat: -8.838, lng: 13.234 },
  'Quilamba Quiaxi': { lat: -8.993, lng: 13.27 },
  Quissama: { lat: -9.55, lng: 13.6 },
  Talatona: { lat: -8.917, lng: 13.183 },
  Viana: { lat: -8.904, lng: 13.372 },
}

/** Coordenadas válidas a partir de valores possivelmente nulos/texto. */
export function toCoords(lat, lng) {
  const a = Number(lat)
  const b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a === 0 && b === 0) return null
  if (a < -90 || a > 90 || b < -180 || b > 180) return null
  return { lat: a, lng: b }
}

/** Posição a usar para uma farmácia: exacta se existir, senão o município. */
export function pharmacyPosition(pharmacy) {
  const exact = toCoords(pharmacy?.lat, pharmacy?.lng)
  if (exact) return { ...exact, approximate: false }
  const center = MUNICIPIO_CENTERS[pharmacy?.municipio]
  if (center) return { ...center, approximate: true }
  return null
}

/** Distância em km (linha recta, haversine). */
export function distanceKm(a, b) {
  if (!a || !b) return null
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_KM * Math.asin(Math.sqrt(h)) * 10) / 10
}

/** Distância legível: "350 m", "1,2 km", "18 km". */
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  if (km < 10) {
    const s = km.toFixed(1).replace('.', ',')
    return `${s.endsWith(',0') ? s.slice(0, -2) : s} km`
  }
  return `${Math.round(km)} km`
}

/** Ordena por distância, mantendo os itens sem posição no fim. */
export function sortByDistance(items, origin, positionOf) {
  if (!origin) return items
  return [...items].sort((a, b) => {
    const pa = positionOf(a)
    const pb = positionOf(b)
    const da = pa ? distanceKm(origin, pa) : null
    const db = pb ? distanceKm(origin, pb) : null
    if (da == null && db == null) return 0
    if (da == null) return 1
    if (db == null) return -1
    return da - db
  })
}

/* ------------------------------------------------------------------ */
/* Posição do cliente (browser)                                        */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'cf:localizador:posicao'

export function readStoredLocation() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return toCoords(parsed?.lat, parsed?.lng)
  } catch {
    return null
  }
}

export function storeLocation(coords) {
  if (typeof window === 'undefined' || !coords) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
  } catch {
    /* modo privado sem storage — a distância funciona só nesta página */
  }
}

export function clearStoredLocation() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nada a limpar */
  }
}

/**
 * Pede a posição ao browser. Só deve ser chamada de um gesto do
 * utilizador. Devolve { lat, lng } ou rejeita com code:
 * 'PERMISSAO' | 'INDISPONIVEL' | 'TEMPO' | 'SEM_SUPORTE'.
 */
export function requestBrowserLocation({ timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('geolocation unsupported'), { code: 'SEM_SUPORTE' }))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = toCoords(pos.coords.latitude, pos.coords.longitude)
        if (!coords) {
          reject(Object.assign(new Error('invalid coords'), { code: 'INDISPONIVEL' }))
          return
        }
        storeLocation(coords)
        resolve(coords)
      },
      (err) => {
        const code =
          err?.code === 1 ? 'PERMISSAO' : err?.code === 3 ? 'TEMPO' : 'INDISPONIVEL'
        reject(Object.assign(new Error(err?.message || code), { code }))
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 },
    )
  })
}
