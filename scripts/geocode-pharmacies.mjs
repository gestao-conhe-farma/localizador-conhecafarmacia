#!/usr/bin/env node
/**
 * Geocodifica as moradas das farmácias e preenche lat/lng.
 *
 * Fonte: Nominatim (OpenStreetMap) — o mesmo mapa que a página pública
 * usa, sem chave de API. A política de uso público pede identificação e
 * no máximo 1 pedido por segundo, e é isso que este script faz
 * (User-Agent próprio + pausa entre pedidos).
 *
 * REGRA PRINCIPAL: o script não adivinha. Só escreve quando o resultado
 * é inequívoco; tudo o que seja duvidoso fica no relatório de AMBÍGUAS
 * para alguém confirmar (no portal: Perfil → Latitude/Longitude, ou no
 * Google Maps).
 *
 * Uso:
 *   # simulação (por omissão — não escreve nada)
 *   node --env-file=.env.local scripts/geocode-pharmacies.mjs
 *
 *   # escrever as coordenadas das que ficaram inequívocas
 *   node --env-file=.env.local scripts/geocode-pharmacies.mjs --apply
 *
 *   # rever todas (mesmo as que já têm coordenadas), ou só uma
 *   node --env-file=.env.local scripts/geocode-pharmacies.mjs --all
 *   node --env-file=.env.local scripts/geocode-pharmacies.mjs --slug=farmacia-sao-rafael
 *
 *   # relatório legível por máquina (para colar noutro sítio)
 *   node --env-file=.env.local scripts/geocode-pharmacies.mjs --json
 *
 * Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (service role porque é um trabalho de operação, fora do RLS do portal)
 */

import { createClient } from '@supabase/supabase-js'
import { MUNICIPIO_CENTERS, distanceKm, toCoords } from '../lib/geo.js'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
// A política do Nominatim exige um User-Agent que identifique a aplicação
// e uma forma de contacto. Este é o domínio público do projecto.
const USER_AGENT = 'localizador-conhecafarmacia-geocode/1.0 (+https://localizador.conhecafarmacia.com)'
const MIN_INTERVAL_MS = 1100 // < 1 pedido/segundo, como a política pede
const ANGOLA = { minLat: -18.5, maxLat: -4.2, minLng: 11.4, maxLng: 24.1 }
// Acima disto, os candidatos são sítios diferentes — não é a mesma morada.
const AMBIGUOUS_SPREAD_KM = 1.5
// Um resultado com uma caixa maior do que isto é uma cidade/estrada, não
// um sítio: o alfinete cairia num ponto arbitrário.
const MAX_AREA_SPAN_KM = 12
// A farmácia diz "Talatona" e o resultado pode dizer "Belas" (Talatona
// nasceu de Belas), por isso o município não é comparado por texto —
// comparamos a distância ao centro do município declarado.
const MAX_FROM_CENTER_KM = 45

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Um só relógio para todos os pedidos: seja qual for o caminho (query
// principal ou fallback), nunca passam dois pedidos a menos de 1,1 s.
let lastCall = 0
async function paced(fn) {
  if (lastCall) {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
  }
  lastCall = Date.now()
  return fn()
}

/* ---------------------------------------------------------------- */
/* Args                                                             */
/* ---------------------------------------------------------------- */
function parseArgs(argv) {
  const args = {}
  const FLAGS = new Set(['apply', 'all', 'json', 'help'])
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const raw = a.slice(2)
    // Aceita --slug=x (forma habitual) e --slug x.
    const eq = raw.indexOf('=')
    if (eq !== -1) {
      args[raw.slice(0, eq)] = raw.slice(eq + 1)
      continue
    }
    if (FLAGS.has(raw)) {
      args[raw] = true
    } else {
      args[raw] = argv[++i]
    }
  }
  return args
}

const args = parseArgs(process.argv)

if (args.help) {
  console.log(
    'Uso: node --env-file=.env.local scripts/geocode-pharmacies.mjs ' +
      '[--apply] [--all] [--slug=…] [--limit=N] [--json]',
  )
  process.exit(0)
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !SERVICE_KEY) {
  console.error(
    'ERRO: faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Corre com as variáveis do projecto, por exemplo:\n' +
      '  node --env-file=.env.local scripts/geocode-pharmacies.mjs',
  )
  process.exit(1)
}

const admin = createClient(URL_BASE, SERVICE_KEY, {
  // Um projecto, dois schemas desde a fusão: as farmácias estão em
  // `localizador`, não em `public`.
  db: { schema: 'localizador' },
  auth: { autoRefreshToken: false, persistSession: false },
})

/* ---------------------------------------------------------------- */
/* Geocodificação                                                   */
/* ---------------------------------------------------------------- */
async function geocode(query) {
  return paced(async () => {
    const url = new URL(NOMINATIM)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '5')
    url.searchParams.set('countrycodes', 'ao')
    url.searchParams.set('accept-language', 'pt')

    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        })
        // 429/5xx: vale a pena uma segunda tentativa depois de respirar.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`Nominatim HTTP ${res.status}`)
          await sleep(2500)
          continue
        }
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
        return await res.json()
      } catch (err) {
        lastErr = err
        await sleep(1500)
      }
    }
    throw lastErr || new Error('Nominatim indisponível')
  })
}

/** Sem acentos e em minúsculas — para comparar partes da morada. */
function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Pedidos a tentar, do mais específico para o mais largo.
 *
 * A morada da farmácia já traz bairro e município ("Rua X, Ingombota,
 * Luanda") e o script acrescenta município e país — sem deduplicar,
 * ficava "…, Luanda, Luanda, Angola" e o Nominatim devolvia zero. O
 * segundo pedido larga o número da porta (a rua costuma estar mapeada
 * quando o número não está).
 */
function buildQueries(pharmacy) {
  const add = (parts) => {
    const seen = new Set()
    const out = []
    for (const raw of parts) {
      const part = String(raw || '').trim()
      if (!part) continue
      const key = fold(part)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(part)
    }
    return out.join(', ')
  }

  const addressParts = String(pharmacy.address || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  const full = add([...addressParts, pharmacy.municipio, 'Angola'])
  const street = addressParts[0] || ''
  const wide = add([street, pharmacy.municipio, 'Angola'])
  return [...new Set([full, wide])].filter(Boolean)
}

/** Extensão da caixa do resultado, em km (o maior dos dois lados). */
function bboxSpanKm(result) {
  const bb = result?.boundingbox
  if (!Array.isArray(bb) || bb.length !== 4) return 0
  const [south, north, west, east] = bb.map(Number)
  if ([south, north, west, east].some((n) => !Number.isFinite(n))) return 0
  const latSpan = Math.abs(north - south) * 111
  const midLat = (north + south) / 2
  const lngSpan = Math.abs(east - west) * 111 * Math.abs(Math.cos((midLat * Math.PI) / 180))
  return Math.max(latSpan, lngSpan)
}

/**
 * Palavras que identificam a rua numa morada ("Rua da Samba" → samba).
 * Stopwords de via e preposições ficam de fora; tokens com dígitos contam
 * mesmo sendo curtos ("via s8" → s8), porque são o que distingue a rua.
 */
const STREET_STOPWORDS = new Set([
  'rua', 'avenida', 'av', 'via', 'travessa', 'estrada', 'largo', 'praca', 'praça',
  'da', 'de', 'do', 'das', 'dos', 'e', 'no', 'nr', 'numero', 'número', 'n', 'sn',
])

function streetTokens(address) {
  return fold(String(address || '').split(',')[0])
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STREET_STOPWORDS.has(t) && (t.length >= 3 || /\d/.test(t)))
}

/** O resultado fala da mesma rua? (algum token distintivo aparece no nome) */
function mentionsStreet(displayName, tokens) {
  if (tokens.length === 0) return false
  const hay = fold(displayName)
  return tokens.some((t) => hay.includes(t))
}

function insideAngola(c) {
  return (
    c.lat >= ANGOLA.minLat &&
    c.lat <= ANGOLA.maxLat &&
    c.lng >= ANGOLA.minLng &&
    c.lng <= ANGOLA.maxLng
  )
}

/**
 * Decide se o resultado é seguro. Devolve
 * { status, chosen, candidates, spread, fromCenter, note }.
 */
function analyse(pharmacy, results) {
  const candidates = (results || [])
    .map((r) => {
      const c = toCoords(r.lat, r.lon)
      if (!c) return null
      const center = MUNICIPIO_CENTERS[pharmacy.municipio]
      return {
        lat: c.lat,
        lng: c.lng,
        label: r.display_name || '',
        // jsonv2 usa `category`; `class` é o nome antigo do campo.
        type: `${r.category || r.class || '?'}/${r.type || '?'}`,
        span: Math.round(bboxSpanKm(r) * 10) / 10,
        fromCenter: center ? distanceKm(center, c) : null,
      }
    })
    .filter(Boolean)

  if (candidates.length === 0) {
    return { status: 'sem_resultado', chosen: null, candidates }
  }

  const chosen = candidates[0]
  let spread = 0
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const d = distanceKm(candidates[i], candidates[j])
      if (d != null && d > spread) spread = d
    }
  }
  spread = Math.round(spread * 10) / 10

  const base = { chosen, candidates, spread, fromCenter: chosen.fromCenter }

  if (!insideAngola(chosen)) {
    return { ...base, status: 'fora_de_angola', note: 'Fora de Angola — morada provavelmente incompleta.' }
  }
  if (chosen.fromCenter != null && chosen.fromCenter > MAX_FROM_CENTER_KM) {
    return {
      ...base,
      status: 'longe_do_municipio',
      note: `${chosen.fromCenter} km do centro de ${pharmacy.municipio}.`,
    }
  }
  // O Nominatim é difuso: "Via S8, Talatona" devolveu ruas de Talatona que
  // não são a Via S8. Se nenhum token da rua aparece no resultado, não é
  // a mesma morada — por muito perto que fique.
  if (!mentionsStreet(chosen.label, streetTokens(pharmacy.address))) {
    return {
      ...base,
      status: 'nome_diferente',
      note: 'O resultado não refere o nome da rua da morada.',
    }
  }
  if (spread > AMBIGUOUS_SPREAD_KM) {
    return {
      ...base,
      status: 'ambigua',
      note: `${candidates.length} candidatos a ${spread} km uns dos outros.`,
    }
  }
  if (chosen.span > MAX_AREA_SPAN_KM) {
    return {
      ...base,
      status: 'area_grande',
      note: `Resultado é uma área/estrada com ${chosen.span} km — alfinete cairia num ponto arbitrário.`,
    }
  }
  return { ...base, status: 'ok', note: null }
}

/* ---------------------------------------------------------------- */
/* Main                                                             */
/* ---------------------------------------------------------------- */
const STATUS_LABEL = {
  ok: 'ok',
  ambigua: 'AMBÍGUA',
  area_grande: 'ÁREA GRANDE',
  longe_do_municipio: 'LONGE DO MUNICÍPIO',
  fora_de_angola: 'FORA DE ANGOLA',
  sem_resultado: 'SEM RESULTADO',
  nome_diferente: 'NOME DIFERENTE',
  sem_morada: 'SEM MORADA',
  ja_tinha: 'já tinha coordenadas',
  erro: 'ERRO',
}

const WRITABLE = new Set(['ok'])

async function main() {
  const { data, error } = await admin
    .from('pharmacies')
    .select('id, slug, name, municipio, address, lat, lng, active')
    .order('name')
  if (error) throw new Error('Falha a ler farmácias: ' + error.message)

  let list = data || []
  if (args.slug) list = list.filter((p) => p.slug === args.slug)
  // O limite conta farmácias geocodificadas (não linhas já resolvidas).
  const limit = Number(args.limit) || 0

  const rows = []
  let geocoded = 0

  for (const pharmacy of list) {
    const hasCoords = toCoords(pharmacy.lat, pharmacy.lng)
    if (hasCoords && !args.all) {
      rows.push({ pharmacy, status: 'ja_tinha', coords: hasCoords, candidates: [] })
      continue
    }
    if (!pharmacy.address || pharmacy.address.trim().length < 5) {
      rows.push({ pharmacy, status: 'sem_morada', coords: null, candidates: [] })
      continue
    }
    if (limit && geocoded >= limit) continue
    geocoded += 1

    const queries = buildQueries(pharmacy)
    let usedQuery = queries[0]
    try {
      let results = []
      // Do pedido completo para o simplificado; o primeiro com resultados
      // manda. Só se ambos falharem é que fica «sem resultado».
      for (const q of queries) {
        usedQuery = q
        results = await geocode(q)
        if (Array.isArray(results) && results.length > 0) break
      }
      rows.push({ pharmacy, query: usedQuery, queries, ...analyse(pharmacy, results) })
    } catch (err) {
      rows.push({
        pharmacy,
        query: usedQuery,
        queries,
        status: 'erro',
        note: err?.message || String(err),
        candidates: [],
      })
    }
  }

  /* ---------------------------- escrita --------------------------- */
  let written = 0
  const writeFailures = []
  if (args.apply) {
    for (const row of rows) {
      if (!WRITABLE.has(row.status) || !row.chosen) continue
      const { error: upErr } = await admin
        .from('pharmacies')
        .update({
          lat: Math.round(row.chosen.lat * 1e6) / 1e6,
          lng: Math.round(row.chosen.lng * 1e6) / 1e6,
        })
        .eq('id', row.pharmacy.id)
      if (upErr) writeFailures.push(`${row.pharmacy.slug}: ${upErr.message}`)
      else written += 1
    }
  }

  /* --------------------------- relatório -------------------------- */
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          applied: Boolean(args.apply),
          written,
          writeFailures,
          results: rows.map((r) => ({
            slug: r.pharmacy.slug,
            name: r.pharmacy.name,
            municipio: r.pharmacy.municipio,
            address: r.pharmacy.address,
            query: r.query || null,
            status: r.status,
            note: r.note || null,
            coords: r.chosen ? { lat: r.chosen.lat, lng: r.chosen.lng } : null,
            spreadKm: r.spread ?? null,
            candidates: (r.candidates || []).map((c) => ({
              label: c.label,
              type: c.type,
              lat: c.lat,
              lng: c.lng,
              fromCenter: c.fromCenter,
            })),
          })),
        },
        null,
        2,
      ),
    )
    if (writeFailures.length) process.exitCode = 1
    return
  }

  console.log(
    `\nGeocodificação de farmácias — ${args.apply ? 'A ESCREVER' : 'simulação (nada é guardado)'}\n` +
      `Fonte: Nominatim/OpenStreetMap · ${list.length} farmácia(s) na lista · 1 pedido/segundo\n`,
  )

  for (const row of rows) {
    const p = row.pharmacy
    const label = STATUS_LABEL[row.status] || row.status
    // Só as inequívocas mostram coordenadas ao lado do nome: nas
    // ambíguas isso lia-se como «vai escrever esta».
    const coords =
      row.chosen && row.status === 'ok'
        ? ` → ${row.chosen.lat.toFixed(6)}, ${row.chosen.lng.toFixed(6)} (nível ${row.chosen.type})`
        : ''
    console.log(`· ${p.slug} — ${p.name} (${p.municipio})`)
    console.log(`  ${label}${coords}${row.note ? ` — ${row.note}` : ''}`)
    if (p.address) console.log(`  morada: ${p.address}`)
    if (row.query && row.queries && row.query !== row.queries[0]) {
      console.log(`  pedido simplificado: ${row.query}`)
    }
  }

  const pending = rows.filter(
    (r) => r.status !== 'ok' && r.status !== 'ja_tinha' && r.status !== 'sem_morada',
  )
  if (pending.length) {
    console.log('\n─── Por confirmar (não escritas) ─────────────────────────')
    for (const row of pending) {
      console.log(`\n${row.pharmacy.slug} · ${row.pharmacy.name} · ${STATUS_LABEL[row.status]}`)
      if (row.query) console.log(`  pedido: ${row.query}`)
      for (const c of row.candidates || []) {
        const from = c.fromCenter != null ? ` · ${c.fromCenter} km do centro` : ''
        console.log(`    - [${c.type}] ${c.label}`)
        console.log(
          `      ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} · caixa ${c.span} km${from}`,
        )
      }
      console.log('  → confirmar no portal (Perfil → Latitude/Longitude) ou no Google Maps.')
    }
  }

  console.log(
    '\nNota: os resultados de nível de rua/estrada (tertiary, secondary…) põem o\n' +
      'alfinete no eixo da rua, não no número da porta. É muito melhor do que o\n' +
      'centro do município, mas se quiseres o ponto exacto confirma no Google Maps\n' +
      'e cola as coordenadas no portal.',
  )

  const count = (status) => rows.filter((r) => r.status === status).length
  console.log('\n─── Resumo ───────────────────────────────────────────────')
  console.log(`  inequívocas:        ${count('ok')}`)
  console.log(`  ambíguas:           ${count('ambigua')}`)
  console.log(`  área grande:        ${count('area_grande')}`)
  console.log(`  longe do município: ${count('longe_do_municipio')}`)
  console.log(`  fora de Angola:     ${count('fora_de_angola')}`)
  console.log(`  sem resultado:      ${count('sem_resultado')}`)
  console.log(`  nome diferente:     ${count('nome_diferente')}`)
  console.log(`  sem morada:         ${count('sem_morada')}`)
  console.log(`  já tinham:          ${count('ja_tinha')}`)
  console.log(`  erros:              ${count('erro')}`)
  if (args.apply) {
    console.log(`  escritas agora:     ${written}`)
    for (const f of writeFailures) console.log(`  ⚠ falhou: ${f}`)
  } else {
    console.log('\n  Simulação: corre outra vez com --apply para guardar as inequívocas.')
  }
  if (writeFailures.length) process.exitCode = 1
}

main().catch((err) => {
  console.error('\n❌ ' + (err?.message || String(err)))
  process.exit(1)
})
