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
 * Um item de stock concreto (a ficha do produto) a partir da view.
 * O id é o `stock_item_id` — o mesmo que a busca e a prateleira usam nos
 * links, para a ficha abrir sempre o item que o cliente viu.
 */
export function queryStockItem(supabase, id) {
  return supabase.from('stock_confirmed').select('*').eq('stock_item_id', id).maybeSingle()
}

/** Todas as farmácias com o mesmo produto (as alternativas da ficha). */
export function queryDrugItems(supabase, drugId) {
  return supabase
    .from('stock_confirmed')
    .select('*')
    .eq('drug_id', drugId)
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
      // Um projecto, dois schemas desde a fusão: as views do Localizador
      // (`stock_confirmed`) vivem em `localizador`, não em `public`.
      db: { schema: 'localizador' },
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
 * Server-side: a ficha de um produto e as alternativas (outras farmácias
 * com o mesmo medicamento). Devolve null quando o item não existe ou
 * quando não há Supabase configurado — a página mostra o estado vazio.
 */
export async function getProductServer(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !id) return null
  try {
    const { createClient: createServerClient } = await import('@supabase/supabase-js')
    const supabase = createServerClient(url, anonKey, {
      // Como acima: `stock_confirmed` vive em `localizador` desde a fusão.
      db: { schema: 'localizador' },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: item, error } = await queryStockItem(supabase, id)
    if (error) throw error
    if (!item) return null

    const { data: siblings, error: eSib } = await queryDrugItems(supabase, item.drug_id)
    if (eSib) throw eSib
    const alternatives = (siblings || []).filter((row) => row.stock_item_id !== item.stock_item_id)
    return { item, alternatives }
  } catch (err) {
    logError('produto-page', 'Fetch server-side falhou', { id, ...errorMeta(err) })
    return null
  }
}

/**
 * Server-side: todos os itens de um medicamento, de todas as farmácias que o
 * confirmaram. É a página `/medicamento/<id>` — a lista de quem tem aquele
 * medicamento, que o hub da conta liga a partir de um guardado.
 *
 * Devolve `[]` (e não null) quando o medicamento não tem stock: a página mostra
 * o estado vazio com uma pesquisa à mão, em vez de um 404 — o medicamento pode
 * voltar amanhã.
 */
export async function getDrugStockServer(drugId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !drugId) return null
  try {
    const { createClient: createServerClient } = await import('@supabase/supabase-js')
    const supabase = createServerClient(url, anonKey, {
      db: { schema: 'localizador' },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await queryDrugItems(supabase, drugId)
    if (error) throw error
    return data || []
  } catch (err) {
    logError('medicamento-page', 'Fetch server-side falhou', { drugId, ...errorMeta(err) })
    return null
  }
}

/**
 * Client-side: a ficha de um produto e as alternativas — o mesmo par que
 * `getProductServer` devolve, para a ficha abrir em cartão sobre a pesquisa
 * sem um round-trip ao servidor nem um novo render da página.
 */
export async function fetchProductClient(id) {
  if (!id) return null
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: item, error } = await queryStockItem(supabase, id)
  if (error) throw error
  if (!item) return null
  const { data: siblings, error: eSib } = await queryDrugItems(supabase, item.drug_id)
  if (eSib) throw eSib
  return {
    item,
    alternatives: (siblings || []).filter((row) => row.stock_item_id !== item.stock_item_id),
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
