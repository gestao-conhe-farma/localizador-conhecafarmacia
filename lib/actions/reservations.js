'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logWarn } from '@/lib/log'

/**
 * Cria uma reserva a partir do Localizador.
 *
 * Pós-0035: NÃO há policy pública de INSERT nem de SELECT em
 * `reservations` — o PostgREST directo nega tudo para anon. A criação
 * corre aqui no servidor com service-role (bypass RLS), depois de
 * validar tudo; a leitura pelo cliente faz-se só via RPC
 * `get_reservation_status(id, token)`.
 *
 * Defesas (todas no servidor, nunca confiando no cliente):
 *   • item tem de existir na view stock_confirmed (activo, fresco,
 *     available_from <= now, validade não expirada) — não se reserva
 *     o que não está à venda;
 *   • rate-limit por telefone: 5 reservas/hora (contado com
 *     service-role — com a RLS fechada o cliente anon já não consegue
 *     contar sozinho);
 *   • normalização do telefone: dígitos, 9–15 (formato E.164 sem '+').
 *   • o token de acompanhamento (access_token) é gerado pelo Postgres
 *     (default gen_random_uuid) e devolvido uma única vez — o URL
 *     passa a /reserva/[id]?t=[token].
 */

const RATE_LIMIT = 5
const RATE_WINDOW_HOURS = 1

function errMeta(err) {
  return { message: err?.message || String(err) }
}

/** Normaliza o telefone: só dígitos, entre 9 e 15. */
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  return digits
}
export async function createReservation({
  stockItemId,
  name,
  phone,
  quantity,
  notes,
  saleOptionId,
}) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 80)
  if (cleanName.length < 2) return { ok: false, error: 'NOME_INVALIDO' }

  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return { ok: false, error: 'TELEFONE_INVALIDO' }

  const qty = Number.parseInt(quantity, 10)
  if (Number.isNaN(qty) || qty < 1 || qty > 10) return { ok: false, error: 'QUANTIDADE_INVALIDA' }

  if (typeof stockItemId !== 'string' || !/^[0-9a-f-]{36}$/i.test(stockItemId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const cleanNotes =
    String(notes || '')
      .trim()
      .slice(0, 300) || null

  try {
    // Service-role: a tabela não tem policies públicas (0035) — só o
    // servidor cria/lê reservas de clientes. Nunca expor este cliente.
    const supabase = createAdminClient()

    // Rate-limit por telefone — fonte da verdade é a tabela.
    const since = new Date(Date.now() - RATE_WINDOW_HOURS * 3600 * 1000).toISOString()
    const { count, error: eRate } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('requester_phone', phoneNorm)
      .gte('created_at', since)
    if (eRate) throw eRate
    if ((count ?? 0) >= RATE_LIMIT) {
      return { ok: false, error: 'LIMITE_ATINGIDO' }
    }

    // O item tem de estar confirmado e à venda AGORA (view da 0008,
    // com frescura por categoria desde a 0038: 72 h medicamentos,
    // 30 dias parafarmácia; validade não expirada, available_from <= now).
    // A coluna `reservable` vem na própria view (0038) — uma query só,
    // e a regra vive no item de stock: se a farmácia desligou a reserva,
    // o servidor recusa, seja qual for a categoria. Antes da migração a
    // view não tem a coluna (PGRST204) e cai-se para a leitura sem ela.
    const base = 'stock_item_id, pharmacy_id, drug_id, drug_name, pharmacy_name'
    let rItem = await supabase
      .from('stock_confirmed')
      .select(`${base}, reservable`)
      .eq('stock_item_id', stockItemId)
      .maybeSingle()
    if (rItem.error && rItem.error.code === 'PGRST204') {
      rItem = await supabase
        .from('stock_confirmed')
        .select(base)
        .eq('stock_item_id', stockItemId)
        .maybeSingle()
    }
    if (rItem.error) throw rItem.error
    const item = rItem.data
    if (!item) return { ok: false, error: 'INDISPONIVEL' }
    if (item.reservable === false) return { ok: false, error: 'NAO_RESERVAVEL' }

    // Opção de venda (0012): tem de pertencer ao item e estar activa —
    // nunca confiar no id vindo do cliente sem verificar.
    let optionRow = null
    if (saleOptionId) {
      if (typeof saleOptionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(saleOptionId)) {
        return { ok: false, error: 'PAYLOAD_INVALIDO' }
      }
      const { data: opt, error: eOpt } = await supabase
        .from('stock_sale_options')
        .select('id, unit, pack_size, active, stock_item_id')
        .eq('id', saleOptionId)
        .maybeSingle()
      if (eOpt) throw eOpt
      if (!opt || !opt.active || opt.stock_item_id !== stockItemId) {
        return { ok: false, error: 'OPCAO_INVALIDA' }
      }
      optionRow = opt
    }

    // Quem reservou com sessão iniciada passa a ver a reserva em /reservas
    // (migração 0047). Lê-se do servidor, nunca do formulário; sem sessão
    // fica null e o fluxo por token continua a ser o caminho.
    let userId = null
    try {
      const session = await createServerComponentClient()
      const {
        data: { user },
      } = await session.auth.getUser()
      userId = user?.id || null
    } catch {
      // Sessão ilegível não pode impedir a reserva de existir.
    }

    const { data: inserted, error: eInsert } = await supabase
      .from('reservations')
      .insert({
        stock_item_id: item.stock_item_id,
        pharmacy_id: item.pharmacy_id,
        drug_id: item.drug_id,
        requester_name: cleanName,
        requester_phone: phoneNorm,
        quantity: qty,
        notes: cleanNotes,
        status: 'pendente',
        sale_option_id: optionRow ? optionRow.id : null,
        user_id: userId,
      })
      .select('id, access_token')
      .single()
    if (eInsert) throw eInsert

    const { headers } = await import('next/headers')
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconhecido'
    logWarn('reservas', 'Reserva criada pelo Localizador', {
      pharmacy: item.pharmacy_name,
      drug: item.drug_name,
      unit: optionRow ? optionRow.unit : 'legado',
      ip,
    })
    return {
      ok: true,
      reservationId: inserted.id,
      accessToken: inserted.access_token,
      drugName: item.drug_name,
      pharmacyName: item.pharmacy_name,
      saleUnit: optionRow ? optionRow.unit : null,
      salePack: optionRow ? optionRow.pack_size : null,
    }
  } catch (err) {
    logWarn('reservas', 'Falha ao criar reserva', errMeta(err))
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}
