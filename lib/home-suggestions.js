import { KINDS, MEDICINE_CATEGORIES, subcategoriasDe } from '@/lib/constants'
import { logError } from '@/lib/log'

/**
 * Sugestões da homepage — categorias, produtos e parafarmácia que
 * existem mesmo.
 *
 * PORQUÊ: a homepage mostra o que se pode procurar. Uma lista fixa no
 * código arriscava mandar o visitante para uma pesquisa vazia; por isso
 * tudo sai do stock confirmado. A query é pequena e fica em cache de
 * processo durante 10 minutos: a homepage é renderizada por pedido (o
 * layout raiz lê `headers()`), e sem cache cada visita custava uma ida à
 * base de dados.
 */

// 10 minutos é seguro: a janela de confirmação é de 72 h (medicamentos)
// e 30 dias (parafarmácia), por isso a lista não muda ao segundo.
const TTL_MS = 10 * 60 * 1000
const MAX_PRODUCTS = 12

let cached = { at: 0, value: null }

function labelFor(kind) {
  return (KINDS.find((k) => k.id === kind) || {}).label || 'Outros'
}

async function fetchSuggestions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { categories: [], products: [], para: [] }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, anonKey, {
    // Um projecto, dois schemas desde a fusão: `stock_confirmed` vive em
    // `localizador`, não em `public`.
    db: { schema: 'localizador' },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // `select('*')` e não a lista de colunas: a homepage não pode rebentar
  // entre a publicação do código e a aplicação da migração 0043 (quando
  // `drug_category` ainda não existe). Sem a coluna, as categorias ficam
  // simplesmente vazias.
  const { data, error } = await supabase
    .from('stock_confirmed')
    .select('*')
    .order('confirmed_at', { ascending: false })
    .limit(400)
  if (error) throw error

  const rows = (data || []).filter((r) => r?.drug_id)

  // Um produto por medicamento: quantas farmácias o confirmam é o que
  // interessa a quem chega — não a apresentação de cada farmácia.
  const byDrug = new Map()
  for (const row of rows) {
    const entry = byDrug.get(row.drug_id) || {
      id: row.drug_id,
      name: row.drug_name,
      kind: row.drug_kind || 'medicamento',
      category: row.drug_category || null,
      pharmacies: new Set(),
    }
    if (row.pharmacy_name) entry.pharmacies.add(row.pharmacy_name)
    byDrug.set(row.drug_id, entry)
  }
  const all = [...byDrug.values()]

  const products = all
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      category: p.category,
      kindLabel: labelFor(p.kind),
      pharmacies: p.pharmacies.size,
    }))
    .sort(
      (a, b) => b.pharmacies - a.pharmacies || String(a.name).localeCompare(String(b.name), 'pt'),
    )
    .slice(0, MAX_PRODUCTS)

  // Áreas clínicas — só as que têm stock agora.
  const categoriesById = new Map()
  for (const p of all) {
    if (p.kind !== 'medicamento' || !p.category) continue
    const entry = categoriesById.get(p.category) || {
      id: p.category,
      products: 0,
      pharmacies: new Set(),
    }
    entry.products += 1
    for (const name of p.pharmacies) entry.pharmacies.add(name)
    categoriesById.set(p.category, entry)
  }
  const categories = MEDICINE_CATEGORIES.map((c) => {
    const found = categoriesById.get(c.id)
    return found
      ? { id: c.id, label: c.label, products: found.products, pharmacies: found.pharmacies.size }
      : null
  }).filter(Boolean)

  // Parafarmácia — cards por tipo, cada um com as subcategorias reais.
  const para = KINDS.filter((k) => k.id !== 'medicamento')
    .map((kind) => {
      const items = all.filter((p) => p.kind === kind.id)
      if (items.length === 0) return null
      const pharmacies = new Set()
      for (const p of items) for (const name of p.pharmacies) pharmacies.add(name)
      const subcategories = subcategoriasDe(kind.id)
        .map((sub) => {
          const inSub = items.filter((p) => p.category === sub.id)
          if (inSub.length === 0) return null
          const names = new Set()
          for (const p of inSub) for (const name of p.pharmacies) names.add(name)
          return {
            id: sub.id,
            label: sub.label,
            products: inSub.length,
            pharmacies: names.size,
          }
        })
        .filter(Boolean)
      return {
        id: kind.id,
        label: labelFor(kind.id),
        products: items.length,
        pharmacies: pharmacies.size,
        subcategories,
      }
    })
    .filter(Boolean)

  return { categories, products, para }
}

export async function getHomeSuggestions() {
  if (cached.value && Date.now() - cached.at < TTL_MS) return cached.value
  try {
    const value = await fetchSuggestions()
    cached = { at: Date.now(), value }
    return value
  } catch (err) {
    logError('homepage', 'Sugestões do stock falharam', { message: err?.message })
    // Falha de rede não pode deixar a homepage sem hero: devolve o que
    // houver em cache (mesmo velho) ou listas vazias.
    return cached.value || { categories: [], products: [], para: [] }
  }
}
