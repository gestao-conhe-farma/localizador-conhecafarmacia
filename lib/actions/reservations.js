'use server'

import { createHash } from 'node:crypto'
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
 *   • a criação corre na RPC localizador.create_reservation (0054):
 *     trava a linha do item, valida stock_confirmed e a opção de venda
 *     e recusa quando quantity - reserved_quantity não chega. É a
 *     mesma transacção que insere a reserva, pelo que dois pedidos
 *     concorrentes sobre a última unidade não passam ambos;
 *   • chave de idempotência por submissão (0055): repetir o envio do
 *     mesmo formulário devolve a reserva já criada em vez de duplicá-la;
 *   • rate-limit por telefone: 5 tentativas/hora num contador atómico
 *     na BD (0056), como o do IP — o count + insert anterior deixava
 *     passar uma rajada concorrente;
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
  municipality,
  quantity,
  notes,
  saleOptionId,
  honeypot,
  idempotencyKey,
  pickupAt,
  pickupUntil,
}) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 80)
  if (cleanName.length < 2) return { ok: false, error: 'NOME_INVALIDO' }

  // Honeypot: campo invisível no formulário. Um bot preenche-o; uma pessoa
  // nunca o vê. Chega aqui para não depender de validação no cliente.
  if (String(honeypot || '').trim()) return { ok: false, error: 'PAYLOAD_INVALIDO' }

  const phoneNorm = normalizePhone(phone)
  if (!phoneNorm) return { ok: false, error: 'TELEFONE_INVALIDO' }

  const qty = Number.parseInt(quantity, 10)
  if (Number.isNaN(qty) || qty < 1 || qty > 10) return { ok: false, error: 'QUANTIDADE_INVALIDA' }

  if (typeof stockItemId !== 'string' || !/^[0-9a-f-]{36}$/i.test(stockItemId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  // A opção de venda é validada na RPC (pertence ao item, está activa);
  // aqui só se confirma que tem forma de id antes de a enviar.
  if (saleOptionId && (typeof saleOptionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(saleOptionId))) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  // Chave do formulário (0055). Formato fechado e curto: a RPC aplica a
  // mesma regra antes de a guardar.
  if (
    idempotencyKey &&
    (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,64}$/.test(idempotencyKey))
  ) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  // Agenda (0057): a RPC valida futuro e horizonte; aqui só se rejeita
  // uma data ilegível antes de a enviar.
  if (pickupAt && Number.isNaN(new Date(pickupAt).getTime())) {
    return { ok: false, error: 'HORARIO_INVALIDO' }
  }
  // Fim da janela (0060): a RPC valida relação e limite; aqui só se
  // rejeita uma data ilegível.
  if (pickupUntil && Number.isNaN(new Date(pickupUntil).getTime())) {
    return { ok: false, error: 'HORARIO_INVALIDO' }
  }
  const cleanNotes =
    String(notes || '')
      .trim()
      .slice(0, 300) || null

  // Texto livre e opcional — nunca é uma chave de nada, só contexto para a
  // farmácia ligar de volta.
  const cleanMunicipio =
    String(municipality || '')
      .trim()
      .slice(0, 80) || null

  try {
    // Service-role: a tabela não tem policies públicas (0035) — só o
    // servidor cria/lê reservas de clientes. Nunca expor este cliente.
    const supabase = createAdminClient()

    // Limite por IP — atómico na BD (0037) e a defesa que o telefone não
    // contorna: mudar de número é trivial, mudar de rede não. Falha aberta
    // com registo, como o resto do projecto.
    const { headers } = await import('next/headers')
    const h = await headers()
    const ip =
      h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
    const ipKey = `reserva:${createHash('md5').update(ip).digest('hex')}`
    const { data: rl, error: eRl } = await supabase
      .schema('public')
      .rpc('lead_rate_consume', { p_ip: ipKey, p_limit: 10, p_window_seconds: 3600 })
    if (eRl) {
      logWarn('reservas', 'Limite por IP indisponível', { message: eRl.message })
    } else if (rl?.allowed === false) {
      return { ok: false, error: 'LIMITE_ATINGIDO' }
    }

    // Rate-limit por telefone (0056): contador atómico na BD, como o do
    // IP. Antes era count + insert em chamadas separadas — uma rajada
    // concorrente passava o limite. A chave é o hash do telefone: a
    // tabela de janelas não guarda números em claro.
    const phoneKey = `reserva-tel:${createHash('md5').update(phoneNorm).digest('hex')}`
    const { data: rlPhone, error: ePhone } = await supabase
      .schema('localizador')
      .rpc('reservation_rate_consume', {
        p_key: phoneKey,
        p_limit: RATE_LIMIT,
        p_window_seconds: RATE_WINDOW_HOURS * 3600,
      })
    if (ePhone) {
      logWarn('reservas', 'Limite por telefone indisponível', { message: ePhone.message })
    } else if (rlPhone?.allowed === false) {
      return { ok: false, error: 'LIMITE_ATINGIDO' }
    }

    // Quem reservou com sessão iniciada passa a ver a reserva em /reservas
    // (migração 0047). Lê-se do servidor, nunca do formulário; sem sessão
    // fica null e o fluxo por token continua a ser o caminho.
    //
    // Área `site` (por omissão): a reserva nasce no site público, com a conta
    // de cliente — não com a da farmácia, que vive na cookie do portal.
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

    // Criação atómica (0054). A RPC faz o lock da linha de stock,
    // valida o item e a opção de venda e insere — tudo na mesma
    // transacção. Sem unidades livres responde INDISPONIVEL (a última
    // unidade já está presa por outra reserva).
    const { data: created, error: eCreate } = await supabase
      .schema('localizador')
      .rpc('create_reservation', {
        p_stock_item_id: stockItemId,
        p_name: cleanName,
        p_phone: phoneNorm,
        p_municipio: cleanMunicipio,
        p_quantity: qty,
        p_notes: cleanNotes,
        p_sale_option_id: saleOptionId || null,
        p_user_id: userId,
        p_idempotency_key: idempotencyKey || null,
        p_pickup_at: pickupAt || null,
        p_pickup_until: pickupUntil || null,
      })
    if (eCreate) throw eCreate
    if (!created?.ok) return { ok: false, error: created?.error || 'FALHA_CRIAR' }

    logWarn('reservas', 'Reserva criada pelo Localizador', {
      pharmacy: created.pharmacy_name,
      drug: created.drug_name,
      unit: created.sale_unit || 'legado',
      ip,
    })
    return {
      ok: true,
      reservationId: created.reservation_id,
      accessToken: created.access_token,
      drugName: created.drug_name,
      pharmacyName: created.pharmacy_name,
      saleUnit: created.sale_unit ?? null,
      salePack: created.sale_pack ?? null,
    }
  } catch (err) {
    logWarn('reservas', 'Falha ao criar reserva', errMeta(err))
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}
