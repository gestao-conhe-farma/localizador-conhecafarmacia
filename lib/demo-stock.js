import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Stock de demonstração — reconfirmação automática.
 *
 * O Localizador só mostra medicamentos confirmados nas últimas 72 h. No
 * ambiente de demonstração não há farmácia a confirmar stock todos os dias,
 * por isso o cron diário renova estas confirmações. É intencionalmente
 * limitado às farmácias de demonstração: uma farmácia real que entre na
 * rede fica de fora e continua a obedecer à regra das 72 h.
 *
 * Ao acrescentar um ambiente de demonstração novo, juntar aqui o slug.
 */
export const DEMO_PHARMACY_SLUGS = Object.freeze([
  'farmacia-vida-nova-viana',
  'farmacia-quirimbambas-talatona',
  'farmacia-sao-paulo-cazenga',
  'farmacia-mirim-belas',
  'farmacia-teste-portal',
  'farmacia-nossa-senhora-da-muxima',
  'farmacia-demo-central',
  'farmacia-hospital-central',
  'farmacia-cf-central',
])

// Reconfirmar a cada 48 h: um cron diário nunca deixa um item chegar às
// 72 h (o pior caso é ~71 h) e a etiqueta de frescura continua honesta.
const REFRESH_AFTER_HOURS = 48

/**
 * Renova `confirmed_at` do stock em falta das farmácias de demonstração.
 * Itens confirmados há menos de 48 h não são tocados.
 *
 * @returns {Promise<{ pharmacies: number, updated: number }>}
 */
export async function refreshDemoStock() {
  const supabase = createAdminClient()
  const now = new Date()
  const cutoff = new Date(now.getTime() - REFRESH_AFTER_HOURS * 3600_000).toISOString()

  const { data: pharmacies, error: pharmaciesError } = await supabase
    .from('pharmacies')
    .select('id')
    .in('slug', DEMO_PHARMACY_SLUGS)
  if (pharmaciesError) throw pharmaciesError

  const ids = (pharmacies || []).map((p) => p.id)
  if (ids.length === 0) return { pharmacies: 0, updated: 0 }

  const { data: updated, error } = await supabase
    .from('stock_items')
    .update({ confirmed_at: now.toISOString() })
    .in('pharmacy_id', ids)
    .eq('in_stock', true)
    .lt('confirmed_at', cutoff)
    .select('id')
  if (error) throw error

  return { pharmacies: ids.length, updated: updated?.length ?? 0 }
}
