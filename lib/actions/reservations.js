'use server'

import { createServerComponentClient } from '@/lib/supabase/server'
import { logWarn } from '@/lib/log'

/**
 * Cria uma reserva a partir do Localizador (fase 5 do plano WhatsApp-
 * first). A policy "reservations public insert" já permitia o INSERT —
 * o que faltava era esta porta de entrada.
 *
 * Defesas (a policy é com check true, a validação vive toda aqui):
 *   • item tem de existir na view stock_confirmed (activo, fresco,
 *     available_from <= now, validade não expirada) — não se reserva
 *     o que não está à venda;
 *   • rate-limit por IP: 5 reservas/hora na tabela reservation_rate
 *     (evita encher a fila de uma farmácia com lixo);
 *   • normalização do telefone: dígitos, 9–15 (formato E.164 sem '+').
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
    const supabase = await createServerComponentClient()

    // Rate-limit por IP — as header vêm do request do Server Action.
    // (sem middleware: a tabela é a fonte da verdade, sem estado em RAM)
    const { headers } = await import('next/headers')
    const h = await headers()
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconhecido'
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

    // O item tem de estar confirmado e à venda AGORA (view da 0008:
    // frescura <= 72h, validade não expirada, available_from <= now).
    const { data: item, error: eItem } = await supabase
      .from('stock_confirmed')
      .select('stock_item_id, pharmacy_id, drug_id, drug_name, pharmacy_name')
      .eq('stock_item_id', stockItemId)
      .maybeSingle()
    if (eItem) throw eItem
    if (!item) return { ok: false, error: 'INDISPONIVEL' }

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
      })
      .select('id')
      .single()
    if (eInsert) throw eInsert

    logWarn('reservas', 'Reserva criada pelo Localizador', {
      pharmacy: item.pharmacy_name,
      drug: item.drug_name,
      unit: optionRow ? optionRow.unit : 'legado',
      ip,
    })
    return {
      ok: true,
      reservationId: inserted.id,
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
