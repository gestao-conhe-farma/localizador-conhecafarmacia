import { logError } from '@/lib/log'

/**
 * Query única sobre a view `stock_confirmed` — usada pela página server-side
 * (app/farmacia/[slug]) e pelo componente client (PharmacyStock). A ordenação
 * e o filtro por slug vivem aqui para não haver duas versões a divergir.
 */
export function queryPharmacyStock(supabase, slug) {
  return supabase
    .from('stock_confirmed')
    .select('*')
    .eq('pharmacy_slug', slug)
    .order('confirmed_at', { ascending: false })
}

/**
 * Detalhes do erro em formato plano, para o logger (inclui os campos
 * específicos do PostgREST: code/details/hint).
 */
function errorMeta(err) {
  return {
    message: err?.message || String(err),
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
  }
}

/**
 * Server-side: devolve os items de stock da farmácia ou null em caso de falha.
 * Usado em app/farmacia/[slug]/page.js (render + generateMetadata): o HTML
 * chega ao crawler com o stock e o <title> corretos, antes do browser pedir
 * qualquer coisa. Env vars em falta devolvem null (build/dev sem Supabase).
 */
export async function getPharmacyStockServer(slug) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  try {
    const { createClient: createServerClient } = await import('@supabase/supabase-js')
    const supabase = createServerClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await queryPharmacyStock(supabase, slug)
    if (error) throw error
    return data || []
  } catch (err) {
    logError('farmacia-page', 'Fetch inicial server-side falhou', { slug, ...errorMeta(err) })
    return null
  }
}

/**
 * Client-side: devolve os items de stock da farmácia, com 2 tentativas e
 * pausa curta entre elas — blips de rede são o caso comum de falha e não
 * devem penar no utilizador. Lança o último erro se ambas falharem.
 */
export async function fetchPharmacyStockClient(slug) {
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  let data = null
  let lastErr = null
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500))
    const { data: rows, error } = await queryPharmacyStock(supabase, slug)
    if (error) {
      lastErr = error
      continue
    }
    data = rows
  }
  if (!data) throw lastErr
  return data
}

/**
 * Perfil da farmácia a partir da primeira linha da view (todas as linhas de
 * um slug partilham a farmácia) — evita duplicar este mapeamento entre o
 * estado inicial e o refetch do PharmacyStock.
 */
export function pharmacyFromStockRow(p) {
  if (!p) return null
  return {
    name: p.pharmacy_name,
    municipio: p.pharmacy_municipio,
    address: p.pharmacy_address,
    lat: p.pharmacy_lat,
    lng: p.pharmacy_lng,
    maps_url: p.pharmacy_maps_url,
    opening_hours: p.pharmacy_opening_hours,
    phone: p.pharmacy_phone,
    whatsapp: p.pharmacy_whatsapp,
    verified: p.pharmacy_verified,
  }
}
