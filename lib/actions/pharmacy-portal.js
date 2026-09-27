'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { logError, logWarn } from '@/lib/log'
import { expiryStatus } from '@/lib/expiry'
import { buildReservationMessage, waLink } from '@/lib/reservation-messages'
import { createServerComponentClient } from '@/lib/supabase/server'

/**
 * Server Actions do portal da farmácia (T8).
 *
 * Todas revalidam a sessão (papel 'farmacia' + farmácia activa) e escrevem
 * com o cliente de cookies — a RLS "stock pharmacy write" garante que a
 * farmácia só toca nas suas próprias linhas, mesmo que alguém force um
 * pharmacy_id alheio no payload.
 */

function errMeta(err) {
  return {
    message: err?.message || String(err),
    code: err?.code,
    details: err?.details,
  }
}

/**
 * Stock completo da farmácia: catálogo de drugs com o estado actual do
 * stock_items ( LEFT JOIN manual — devolve também produtos nunca reportados,
 * para a farmácia poder começar a reportar do zero).
 */
export async function getMyStockSnapshot() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    const [{ data: drugs, error: e1 }, { data: stock, error: e2 }] = await Promise.all([
      supabase
        .from('drugs')
        .select('id, name, molecule, form, dosage, requires_rx, priority')
        .eq('active', true)
        .order('name'),
      // '*' (como em lib/stock.js): se uma coluna nova ainda não existir —
      // uma migração por aplicar — o painel continua a carregar e mostra o
      // resto, em vez de ficar vazio com um erro de coluna inexistente.
      supabase.from('stock_items').select('*').eq('pharmacy_id', pharmacy.id),
    ])
    if (e1) throw e1
    if (e2) throw e2

    // Opções de venda (0012): uma query por farmácia, agrupada no cliente.
    // Falha suave: sem a migração aplicada, [] em todos os itens (legado).
    let optionsByItem = new Map()
    try {
      const { data: opts } = await supabase
        .from('stock_sale_options')
        .select('id, stock_item_id, unit, pack_size, price, is_default, active, sort_order')
        .eq('pharmacy_id', pharmacy.id)
        .order('sort_order')
      for (const o of opts || []) {
        const list = optionsByItem.get(o.stock_item_id) || []
        list.push({ ...o, price: o.price != null ? Number(o.price) : null })
        optionsByItem.set(o.stock_item_id, list)
      }
    } catch (_) {
      /* migração 0012 por aplicar — segue legado */
    }

    const byDrug = new Map((stock || []).map((s) => [s.drug_id, s]))
    const items = (drugs || []).map((d) => {
      const s = byDrug.get(d.id)
      return {
        drug_id: d.id,
        name: d.name,
        molecule: d.molecule,
        form: d.form,
        dosage: d.dosage,
        requires_rx: d.requires_rx,
        priority: d.priority,
        stock_item_id: s?.id ?? null,
        in_stock: s?.in_stock ?? false,
        quantity: s?.quantity ?? null,
        price: s?.price != null ? Number(s.price) : null,
        confirmed_at: s?.confirmed_at ?? null,
        available_from: s?.available_from ?? null,
        expires_at: s?.expires_at ?? null,
        sale_options: s ? optionsByItem.get(s.id) || [] : [],
        origin: s?.origin ?? null,
        brand: s?.brand ?? null,
        image_path: s?.image_path ?? null,
      }
    })
    return { ok: true, items }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao carregar snapshot de stock', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CARREGAR' }
  }
}

/**
 * Guarda o stock de UMA apresentação (toggle temos/não temos + quantidade +
 * preço opcionais). Upsert por (pharmacy_id, drug_id) — UNIQUE na tabela.
 * quantity/price vazios ('') guardam NULL (campo opcional).
 */
export async function updateStockItem({
  drugId,
  inStock,
  quantity,
  price,
  availableFrom,
  expiresAt,
  origin,
  brand,
  imagePath,
}) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy, user } = session

  if (typeof drugId !== 'string' || !/^[0-9a-f-]{36}$/i.test(drugId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  const qty = quantity === '' || quantity == null ? null : Number.parseInt(quantity, 10)
  if (qty != null && (Number.isNaN(qty) || qty < 0)) {
    return { ok: false, error: 'QUANTIDADE_INVALIDA' }
  }
  const priceNum = price === '' || price == null ? null : Math.round(Number(price) * 100) / 100
  if (priceNum != null && (Number.isNaN(priceNum) || priceNum < 0)) {
    return { ok: false, error: 'PRECO_INVALIDO' }
  }
  // "Disponível a partir de" — data ISO (YYYY-MM-DD) opcional. Guardada a
  // meio-dia UTC para não deslocar por fuso ao comparar com now().
  let availableFromTs = null
  if (availableFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) {
      return { ok: false, error: 'DATA_INVALIDA' }
    }
    availableFromTs = `${availableFrom}T12:00:00Z`
  }
  // Validade ("expira em") — DATE 'YYYY-MM-DD' opcional. Guardada como data
  // (não instante): a validade de um medicamento é um dia, não uma hora, e
  // isso evita desvios de fuso nas comparações com current_date na view.
  // Datas no passado são aceites: a farmácia pode estar a registar stock que
  // já expirou — e isso esconde-o do Localizador, que é o efeito desejado.
  let expiresAtDate = null
  if (expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
      return { ok: false, error: 'DATA_INVALIDA' }
    }
    expiresAtDate = expiresAt
  }

  // Origem e marca (0013) — texto livre curto, opcionais. Trim + limite:
  // a BD tem CHECKs de comprimento, validamos aqui para erro legível.
  const ORIGINS = new Set([
    'Portugal',
    'Índia',
    'China',
    'Alemanha',
    'França',
    'Brasil',
    'EUA',
    'Reino Unido',
    'Egipto',
    'África do Sul',
    'Japão',
    'Turquia',
  ])
  const originVal = typeof origin === 'string' ? origin.trim().slice(0, 60) : ''
  if (originVal && !ORIGINS.has(originVal)) {
    return { ok: false, error: 'ORIGEM_INVALIDA' }
  }
  const brandVal = typeof brand === 'string' ? brand.trim().slice(0, 80) : ''

  // image_path (0013): path no bucket 'drug-images' — TEM de começar pelo
  // prefixo da própria farmácia, senão alguém podia apontar a foto de
  // outro item/farmácia. Vazio = remover a foto.
  let imagePathVal = null
  if (typeof imagePath === 'string' && imagePath.trim()) {
    const p = imagePath.trim()
    if (!p.startsWith(`${pharmacy.id}/`)) {
      return { ok: false, error: 'IMAGEM_INVALIDA' }
    }
    imagePathVal = p
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    // Confirmar que o drug existe e está activo (evita FK error cru).
    const { data: drug } = await supabase
      .from('drugs')
      .select('id')
      .eq('id', drugId)
      .eq('active', true)
      .maybeSingle()
    if (!drug) return { ok: false, error: 'MEDICAMENTO_INEXISTENTE' }

    const { error } = await supabase.from('stock_items').upsert(
      {
        pharmacy_id: pharmacy.id,
        drug_id: drugId,
        in_stock: Boolean(inStock),
        quantity: qty,
        price: priceNum,
        available_from: availableFromTs,
        expires_at: expiresAtDate,
        // Origem/marca/foto: só enviadas quando o chamador as trouxe no
        // patch (os caminhos antigos — toggle na fila, reconfirmar stale —
        // não passam undefined para dentro e apagar o que estava).
        ...(origin !== undefined && { origin: originVal || null }),
        ...(brand !== undefined && { brand: brandVal || null }),
        ...(imagePath !== undefined && { image_path: imagePathVal }),
        confirmed_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'pharmacy_id,drug_id' },
    )
    if (error) throw error

    revalidatePath('/portal')
    revalidatePath('/portal/stock')
    return { ok: true }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao guardar stock', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

/**
 * Upload da foto da embalagem (0013). O ficheiro vai para o bucket
 * público 'drug-images' sob <pharmacy_id>/<drug_id>.<ext> — a policy de
 * Storage (mesma migração) só deixa a farmácia escrever no SEU prefixo,
 * e a action valida tipo/tamanho antes de tocar no Storage.
 * Devolve o path a guardar em stock_items.image_path.
 */
export async function uploadDrugImage({ drugId, file }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  if (typeof drugId !== 'string' || !/^[0-9a-f-]{36}$/i.test(drugId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'FICHEIRO_INVALIDO' }
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: 'FICHEIRO_GRANDE' }
  }
  const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (!OK_TYPES.has(file.type)) {
    return { ok: false, error: 'TIPO_INVALIDO' }
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${pharmacy.id}/${drugId}.${ext}`

    // upsert: true — nova foto do mesmo drug substitui a anterior (o nome
    // é determinístico, não há acumulação de ficheiros órfãos).
    const { error } = await supabase.storage
      .from('drug-images')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (error) {
      logError('pharmacy-portal', 'Falha no upload da imagem', {
        slug: pharmacy.slug,
        ...errMeta(error),
      })
      return { ok: false, error: 'FALHA_UPLOAD' }
    }
    return { ok: true, path }
  } catch (err) {
    logError('pharmacy-portal', 'Falha no upload da imagem', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_UPLOAD' }
  }
}

/**
 * Entrada de stock (reposição): SOMA unidades recebidas ao saldo actual
 * de uma apresentação — o complemento da baixa automática das reservas.
 *
 * Regras:
 *  • units tem de ser inteiro ≥ 1 (uma entrada de 0 não é uma entrada).
 *  • Soma sobre o quantity guardado (NULL conta como 0 — item nunca
 *    quantificado): 12 + 10 = 22.
 *  • A entrada RELIGA o item (in_stock true) e refresca confirmed_at —
 *    saiu da prateleira para a prateleira, o Localizador volta a vê-lo
 *    como confirmado e o aviso "stock desactualizado" desaparece.
 *  • Preço/validade/chegada NÃO são tocados — corrigir esses campos é
 *    trabalho do modal de stock (updateStockItem). A entrada só mexe
 *    no saldo.
 */
export async function addStockUnits({ drugId, units }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy, user } = session

  if (typeof drugId !== 'string' || !/^[0-9a-f-]{36}$/i.test(drugId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const add = Number.parseInt(units, 10)
  if (Number.isNaN(add) || add < 1 || add > 100000) {
    return { ok: false, error: 'QUANTIDADE_INVALIDA' }
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    // Linha actual (pode não existir — produto nunca reportado). RLS garante
    // que só se lê as linhas da própria farmácia.
    const { data: current, error: e1 } = await supabase
      .from('stock_items')
      .select('id, quantity, in_stock')
      .eq('pharmacy_id', pharmacy.id)
      .eq('drug_id', drugId)
      .maybeSingle()
    if (e1) throw e1

    // O drug tem de estar activo no catálogo (mesmo guard do updateStockItem).
    const { data: drug } = await supabase
      .from('drugs')
      .select('id')
      .eq('id', drugId)
      .eq('active', true)
      .maybeSingle()
    if (!drug) return { ok: false, error: 'MEDICAMENTO_INEXISTENTE' }

    const prevQty = current?.quantity != null ? Number(current.quantity) : 0
    const newQty = prevQty + add

    const payload = {
      pharmacy_id: pharmacy.id,
      drug_id: drugId,
      in_stock: true,
      quantity: newQty,
      confirmed_at: new Date().toISOString(),
      updated_by: user.id,
    }
    // Upsert parcial: sem price/available_from/expires_at no payload, o
    // INSERT (linha nova) guarda os defaults e o UPDATE preserva o que a
    // farmácia já tinha registado (o upsert do Supabase só sobrescreve as
    // colunas presentes).
    const { error } = await supabase
      .from('stock_items')
      .upsert(payload, { onConflict: 'pharmacy_id,drug_id' })
    if (error) throw error

    revalidatePath('/portal')
    revalidatePath('/portal/stock')
    revalidatePath('/portal/entrada')
    return { ok: true, previous: prevQty, added: add, total: newQty }
  } catch (err) {
    logError('pharmacy-portal', 'Falha na entrada de stock', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

/**
 * Substitui as opções de venda de UM item (0012 — "como vende este
 * medicamento"). Delete + insert: a lista é pequena (1–3 linhas) e o
 * modelo é "a farmácia descreveu de novo", não um diff.
 *
 * options: [{ unit, packSize, price, isDefault, active }]
 * Lista vazia = voltar ao modo legado (preço único de stock_items).
 */
export async function setSaleOptions({ drugId, options }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  if (typeof drugId !== 'string' || !/^[0-9a-f-]{36}$/i.test(drugId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  const UNITS = new Set(['comprimido', 'lamina', 'caixa', 'frasco', 'ampola', 'unidade'])
  const clean = []
  for (const o of Array.isArray(options) ? options.slice(0, 6) : []) {
    const unit = String(o?.unit || '').trim()
    if (!UNITS.has(unit)) return { ok: false, error: 'UNIDADE_INVALIDA' }
    const packSize = Number.parseInt(o?.packSize ?? 1, 10)
    if (Number.isNaN(packSize) || packSize < 1) return { ok: false, error: 'PACK_INVALIDO' }
    const price = Number(o?.price)
    if (Number.isNaN(price) || price < 0) return { ok: false, error: 'PRECO_INVALIDO' }
    clean.push({
      unit,
      packSize,
      price,
      isDefault: Boolean(o?.isDefault),
      active: o?.active !== false,
    })
  }
  // No máximo um default; se houver opções activas e nenhum default marcado,
  // a primeira activa torna-se default (a unidade-base tem de existir).
  const activeRows = clean.filter((o) => o.active)
  if (activeRows.length > 0) {
    const marked = activeRows.filter((o) => o.isDefault)
    if (marked.length > 1) return { ok: false, error: 'DEFAULT_MULTIPLO' }
    if (marked.length === 0) activeRows[0].isDefault = true
    for (const o of clean) {
      if (o.isDefault) o.packSize = 1 // o default é a unidade-base
    }
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    // O item tem de ser DA farmácia (a RLS protege de novo, mas o erro
    // é mais claro assim) e tem de existir.
    const { data: item, error: eItem } = await supabase
      .from('stock_items')
      .select('id')
      .eq('pharmacy_id', pharmacy.id)
      .eq('drug_id', drugId)
      .maybeSingle()
    if (eItem) throw eItem
    if (!item) return { ok: false, error: 'MEDICAMENTO_INEXISTENTE' }

    const { error: eDel } = await supabase
      .from('stock_sale_options')
      .delete()
      .eq('stock_item_id', item.id)
    if (eDel) throw eDel

    if (clean.length > 0) {
      const { error: eIns } = await supabase.from('stock_sale_options').insert(
        clean.map((o, i) => ({
          stock_item_id: item.id,
          unit: o.unit,
          pack_size: o.packSize,
          price: o.price,
          is_default: o.isDefault,
          active: o.active,
          sort_order: i,
        })),
      )
      if (eIns) throw eIns
    }

    revalidatePath('/portal/stock')
    revalidatePath(`/farmacia/${pharmacy.slug}`)
    return { ok: true }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao guardar opções de venda', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

/**
 * Fila de reservas da farmácia (mais recentes primeiro).
 */
export async function getMyReservations() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, status, quantity, confirmed_quantity, notes, reason, requester_name, requester_phone, created_at, resolved_at, expires_at, client_contacted_at, drug_id, stock_item_id, sale_option_id, drugs(name, form, dosage, requires_rx), stock_sale_options(unit, pack_size, price)',
      )
      .eq('pharmacy_id', pharmacy.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    const rows = data || []

    // Opções de venda dos itens reservados (0012): para descrever o pack
    // com a unidade-base certa ("caixa (3 lâminas)", não "3 un.").
    // Origem/marca (0013) vão junto: o WhatsApp diz "origem Portugal".
    const itemIds = [...new Set(rows.map((r) => r.stock_item_id).filter(Boolean))]
    let optionsByItem = new Map()
    let stockById = new Map()
    if (itemIds.length > 0) {
      try {
        const { data: opts, error: eOpts } = await supabase
          .from('stock_sale_options')
          .select('id, stock_item_id, unit, pack_size, is_default')
          .in('stock_item_id', itemIds)
        if (!eOpts) {
          for (const o of opts || []) {
            const list = optionsByItem.get(o.stock_item_id) || []
            list.push(o)
            optionsByItem.set(o.stock_item_id, list)
          }
        }
      } catch (_) {
        /* 0012 por aplicar — cards mostram quantidade simples */
      }
      try {
        const { data: stockRows } = await supabase
          .from('stock_items')
          .select('id, origin, brand')
          .in('id', itemIds)
        for (const s of stockRows || []) stockById.set(s.id, s)
      } catch (_) {
        /* 0013 por aplicar — sem origem na mensagem */
      }
    }

    return {
      ok: true,
      reservations: rows.map((r) => {
        const s = stockById.get(r.stock_item_id)
        return {
          ...r,
          item_options: optionsByItem.get(r.stock_item_id) || [],
          origin: s?.origin ?? null,
          brand: s?.brand ?? null,
        }
      }),
      pharmacyName: pharmacy.name,
    }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao carregar reservas', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CARREGAR' }
  }
}

/**
 * Muda o estado de uma reserva. Só os movimentos legais do fluxo são
 * aceites: pendente → confirmada | recusada; confirmada → pronta |
 * recusada; pronta → concluida | recusada. 'expirada' só via cron
 * (migração 0010) — nunca pela UI.
 */
const TRANSITIONS = {
  pendente: ['confirmada', 'recusada'],
  confirmada: ['pronta', 'recusada'],
  pronta: ['concluida', 'recusada'],
}

/** Motivos de recusa fechados (a UI oferece os mesmos, mais texto livre). */
const REJECT_REASONS = new Set(['sem_stock', 'zona', 'outro'])

/**
 * Cria um fármaco a pedido da farmácia (apresentação em falta no
 * catálogo). Fica INACTIVO até a equipa validar — os clientes não
 * vêem fármacos inactivos (policy "drugs public read").
 */
export async function createDrug({ name, molecule, form, dosage, requiresRx }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  const cleanName = (name || '').trim().slice(0, 160)
  if (cleanName.length < 2) return { ok: false, error: 'NOME_INVALIDO' }
  const cleanMolecule = (molecule || '').trim().slice(0, 160) || null
  const cleanForm = (form || '').trim().slice(0, 80) || null
  const cleanDosage = (dosage || '').trim().slice(0, 80) || null

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    // Se já existe no catálogo (activo), devolve o existente para vincular.
    const { data: existing } = await supabase
      .from('drugs')
      .select('id')
      .eq('name', cleanName)
      .eq('form', cleanForm)
      .eq('dosage', cleanDosage)
      .maybeSingle()
    if (existing) return { ok: true, drugId: existing.id, existed: true }

    // Sem .select(): o fármaco entra inactivo e a policy de SELECT
    // ("drugs public read") não o deixa ler de volta — o RETURNING
    // falharia com "violates row-level security". O id não é preciso.
    const { error } = await supabase.from('drugs').insert({
      name: cleanName,
      molecule: cleanMolecule,
      form: cleanForm,
      dosage: cleanDosage,
      requires_rx: Boolean(requiresRx),
      priority: 'normal',
      active: false, // moderação: a equipa CF activa após validar
    })
    if (error) throw error

    logWarn('pharmacy-portal', 'Fármaco criado por farmácia (aguarda validação)', {
      slug: pharmacy.slug,
      drug: cleanName,
    })
    return { ok: true, existed: false }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao criar fármaco', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}

/**
 * A farmácia edita o próprio perfil. O trigger protect_pharmacy_self_update
 * (migração 0005) impede alterar slug/verified/active e mantém updated_at.
 */
export async function updatePharmacyProfile({ address, phone, whatsapp, openingHours, mapsUrl }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  const patch = {}
  const addressV = (address || '').trim().slice(0, 300)
  if (addressV) patch.address = addressV
  const phoneV = (phone || '').trim().slice(0, 40)
  if (phoneV) patch.phone = phoneV
  const whatsappV = (whatsapp || '').replace(/\D/g, '').slice(0, 20)
  if (whatsappV) patch.whatsapp = whatsappV
  const hoursV = (openingHours || '').trim().slice(0, 120)
  if (hoursV) patch.opening_hours = hoursV
  // Link do Google Maps (migração 0009): a farmácia cola o link partilhado
  // do sítio — o Localizador usa-o no botão "Google Maps" da página pública.
  const mapsUrlV = (mapsUrl || '').trim().slice(0, 500)
  if (mapsUrlV) {
    if (!/^https?:\/\//i.test(mapsUrlV)) return { ok: false, error: 'MAPS_URL_INVALIDO' }
    patch.maps_url = mapsUrlV
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'NADA_PARA_GUARDAR' }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const { error } = await supabase.from('pharmacies').update(patch).eq('id', pharmacy.id)
    if (error) throw error
    revalidatePath('/portal/perfil')
    revalidatePath(`/farmacia/${pharmacy.slug}`)
    return { ok: true }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao actualizar perfil', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

/**
 * Constroi o feed "Precisa de Atenção": tudo o que exige uma decisão da
 * farmácia hoje, em três secções.
 *
 * 1. REPOSIÇÃO — produtos marcados como "temos" que deixaram de o estar
 *    quando uma reserva foi CONCLUÍDA (trigger da 0006 baixa o stock e
 *    desliga o item ao chegar a zero). Sem isto, a farmácia só descobre
 *    quando o próximo cliente pergunta — o produto sai do Localizador e
 *    a procura perde-se em silêncio.
 * 2. VALIDADE — itens em stock que expiram nas janelas 90/60/30 dias ou
 *    já expiraram (lib/expiry.js; expirados estão escondidos no
 *    Localizador pela view da 0007).
 * 3. STALE — itens em stock confirmados há mais de 5 dias (o mesmo
 *    limite que o StockPanel avisa): saem de "confirmado" na view.
 *
 * Devolve feeds pequenos e já resolvidos (nomes incluídos) — a página
 * não volta a tocar na base de dados.
 */
async function buildAttentionFeed(supabase, pharmacy) {
  const STALE_MS = 5 * 24 * 3600 * 1000

  // Reposição: a última venda concluída por fármaco, só as que deixaram
  // o item fora do ar (in_stock false ou a linha de stock desapareceu).
  const { data: concluidas, error: e1 } = await supabase
    .from('reservations')
    .select(
      'id, quantity, resolved_at, drug_id, stock_item_id, drugs(name, form, dosage), stock_items(in_stock, quantity, price, available_from, expires_at)',
    )
    .eq('pharmacy_id', pharmacy.id)
    .eq('status', 'concluida')
    .order('resolved_at', { ascending: false })
    .limit(100)
  if (e1) throw e1

  const latestSale = new Map()
  for (const r of concluidas || []) {
    if (!r.drug_id || latestSale.has(r.drug_id)) continue // só a venda mais recente
    const s = Array.isArray(r.stock_items) ? r.stock_items[0] : r.stock_items
    if (s && s.in_stock !== false) continue // já reposto — sem aviso
    latestSale.set(r.drug_id, {
      kind: 'restock',
      drug_id: r.drug_id,
      stock_item_id: r.stock_item_id,
      name: r.drugs?.name || 'Medicamento',
      form: r.drugs?.form || null,
      dosage: r.drugs?.dosage || null,
      soldQuantity: r.quantity,
      stockQuantity: s?.quantity ?? null,
      // Guardados para o painel REENVIAR tudo ao repor — o upsert do
      // updateStockItem substitui a linha inteira e sem estes valores
      // apagaria preço/validade/chegada que a farmácia já tinha registado.
      price: s?.price != null ? Number(s.price) : null,
      available_from: s?.available_from ?? null,
      expires_at: s?.expires_at ?? null,
      when: r.resolved_at,
    })
  }

  // Stock da farmácia — para validade e stale.
  const { data: stock, error: e2 } = await supabase
    .from('stock_items')
    .select('id, drug_id, in_stock, quantity, price, confirmed_at, available_from, expires_at')
    .eq('pharmacy_id', pharmacy.id)
  if (e2) throw e2

  const rows = stock || []
  const needNames = new Set()
  const expiryItems = []
  const staleItems = []
  for (const s of rows) {
    if (!s.in_stock) continue // validade de produto que já não há não interessa
    const st = expiryStatus(s.expires_at)
    if (st && st.level !== 'ok') {
      needNames.add(s.drug_id)
      expiryItems.push({
        kind: 'expiry',
        drug_id: s.drug_id,
        stock_item_id: s.id,
        quantity: s.quantity,
        price: s.price != null ? Number(s.price) : null,
        available_from: s.available_from,
        expires_at: s.expires_at,
        days: st.days,
        level: st.level,
      })
    }
    if (s.confirmed_at && Date.now() - new Date(s.confirmed_at).getTime() > STALE_MS) {
      needNames.add(s.drug_id)
      staleItems.push({
        kind: 'stale',
        drug_id: s.drug_id,
        stock_item_id: s.id,
        quantity: s.quantity,
        price: s.price != null ? Number(s.price) : null,
        available_from: s.available_from,
        expires_at: s.expires_at,
        confirmed_at: s.confirmed_at,
      })
    }
  }

  // Nomes só dos fármacos que precisam de atenção (não o catálogo inteiro).
  const ids = [...new Set([...needNames, ...latestSale.keys()])]
  const drugById = new Map()
  if (ids.length > 0) {
    const { data: drugs, error: e3 } = await supabase
      .from('drugs')
      .select('id, name, form, dosage, requires_rx')
      .in('id', ids)
    if (e3) throw e3
    for (const d of drugs || []) drugById.set(d.id, d)
  }
  // A venda mais recente já traz nome da reserva; complementa com o
  // catálogo quando a reserva antiga tem dados incompletos.
  const restock = [...latestSale.values()].map((r) => {
    const d = drugById.get(r.drug_id)
    return d
      ? { ...r, name: d.name || r.name, form: d.form || r.form, dosage: d.dosage || r.dosage }
      : r
  })
  for (const list of [expiryItems, staleItems]) {
    for (const it of list) {
      const d = drugById.get(it.drug_id)
      if (d) {
        it.name = d.name
        it.form = d.form
        it.dosage = d.dosage
        it.requires_rx = d.requires_rx
      }
    }
  }

  // Mais urgente primeiro: expirados e <30 dias no topo do seu grupo;
  // reposição da venda mais recente no topo do dele.
  const levelOrder = { expired: 0, 30: 1, 60: 2, 90: 3 }
  expiryItems.sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.days - b.days,
  )
  staleItems.sort((a, b) => new Date(a.confirmed_at) - new Date(b.confirmed_at))
  restock.sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))

  return { restock, expiry: expiryItems, stale: staleItems }
}

/**
 * Feed completo da página "Precisa de Atenção".
 */
export async function getMyAttentionFeed() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const feed = await buildAttentionFeed(supabase, session.pharmacy)
    return { ok: true, feed }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao carregar feed de atenção', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CARREGAR' }
  }
}

/**
 * Contagem leve para a tab "Atenção" (mesmos critérios do feed).
 */
export async function getAttentionCount() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const feed = await buildAttentionFeed(supabase, session.pharmacy)
    return {
      ok: true,
      count: feed.restock.length + feed.expiry.length + feed.stale.length,
      // As reposições vão à parte: a tab desconta as que esta farmácia
      // dispensou neste browser (acks em lib/restock.js).
      restockItems: feed.restock.map((r) => ({ drug_id: r.drug_id, when: r.when })),
      // Expirados e validade a vencer contam à parte: a sidebar mostra um
      // badge próprio de validade (laranja), separado do vermelho de
      // reposição — são urgências diferentes com acções diferentes.
      expiryCount: feed.expiry.length,
    }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao contar itens de atenção', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CONTAR' }
  }
}

/**
 * Contagem de reservas por atender (para o sino, sem carregar a fila).
 */
export async function getPendingReservationsCount() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const { count, error } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', session.pharmacy.id)
      .eq('status', 'pendente')
    if (error) throw error
    return { ok: true, count: count ?? 0 }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao contar reservas pendentes', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CONTAR' }
  }
}

/**
 * Mini-relatório de vendas — total estimado por dia a partir das
 * reservas CONCLUÍDAS (a única transição que representa uma venda:
 * o cliente levantou e o trigger baixou o stock).
 *
 * "Estimado" porque o valor usa o preço da opção de venda (0012) no
 * momento da consulta — o final é o do balcão. Reservas legadas sem
 * opção não entram no montante (não há preço de onde vir sem mentir),
 * mas contam nas quantidades.
 *
 * Dias sem vendas não vêm da BD — o componente completa-os com zero
 * para o gráfico mostrar buracos honestos em vez de colapsar o eixo.
 *
 * @param {number} days — janela em dias (7/30/90; default 30)
 */
export async function getSalesReport({ days = 30 } = {}) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  const window = [7, 30, 90].includes(days) ? days : 30
  // Janela em UTC: resolved_at é timestamptz e a agregação é por data
  // UTC — consistente entre server e cliente (o dia "de hoje" do gráfico
  // segue a mesma referência que a BD grava).
  //
  // Comparação de períodos: busca o DOBRO da janela — o período atual
  // (últimos `window` dias) e o anterior (os `window` dias antes dele),
  // para o gestor ver a tendência sem exportar nada.
  const fetchFrom = new Date(Date.now() - 2 * window * 24 * 3600 * 1000).toISOString()
  const DAY = 24 * 3600 * 1000
  const now = Date.now()
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
  const curStart = isoDay(now - (window - 1) * DAY) // 1º dia do período atual
  const prevStart = isoDay(now - (2 * window - 1) * DAY) // 1º dia do anterior

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const { data, error } = await supabase
      .from('reservations')
      .select(
        'quantity, confirmed_quantity, resolved_at, sale_option_id, stock_sale_options(price)',
      )
      .eq('pharmacy_id', pharmacy.id)
      .eq('status', 'concluida')
      .gte('resolved_at', fetchFrom)
      .order('resolved_at', { ascending: false })
      .limit(2000)
    if (error) throw error

    // Agrega em memória: pouco volume (limite 2000), flexível para
    // computar montante e unidades na mesma passagem.
    const byDay = new Map()
    let totalValue = 0
    let totalCount = 0
    let unpricedCount = 0
    // Período anterior (comparação de tendência).
    let prevValue = 0
    let prevCount = 0
    for (const r of data || []) {
      const day = String(r.resolved_at || '').slice(0, 10)
      if (!day) continue
      const qty = r.confirmed_quantity ?? r.quantity ?? 0
      const price = r.stock_sale_options?.price
      const value = price != null ? Math.round(qty * Number(price) * 100) / 100 : null

      if (day >= curStart) {
        if (value == null) unpricedCount += 1
        else totalValue += value
        totalCount += 1
        const bucket = byDay.get(day) || { value: 0, count: 0, units: 0 }
        bucket.value += value ?? 0
        bucket.count += 1
        bucket.units += qty
        byDay.set(day, bucket)
      } else if (day >= prevStart) {
        if (value != null) prevValue += value
        prevCount += 1
      }
    }

    return {
      ok: true,
      window,
      totalValue: Math.round(totalValue * 100) / 100,
      totalCount,
      unpricedCount,
      // Comparação de períodos (esta janela vs. a anterior, mesmo tamanho).
      prev: { totalValue: Math.round(prevValue * 100) / 100, totalCount: prevCount },
      days: [...byDay.entries()] // ["2026-09-24", { value, count, units }]
        .sort((a, b) => a[0].localeCompare(b[0])),
    }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao gerar relatório de vendas', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_RELATORIO' }
  }
}

/**
 * Rasto de comunicação (migração 0010): marca que o atendente abriu o
 * WhatsApp do cliente. Fire-and-forget do card — falhar não bloqueia
 * nada, é só o "✓ avisado" na ficha.
 */
export async function markClientContacted({ reservationId }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }

  if (typeof reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()
    const { error } = await supabase
      .from('reservations')
      .update({ client_contacted_at: new Date().toISOString() })
      .eq('id', reservationId)
      .eq('pharmacy_id', session.pharmacy.id)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao marcar contacto', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_ACTUALIZAR' }
  }
}

/**
 * Muda o estado de uma reserva e devolve o template de WhatsApp pronto
 * para o atendente avisar o cliente (o portal não envia — prepara).
 *
 * @param {object} opts
 * @param {string} opts.reason      — motivo da recusa (sem_stock | zona | outro[:texto])
 * @param {number} opts.confirmedQuantity — unidades efectivamente separadas (0 = recusa implícita)
 */
export async function setReservationStatus({ reservationId, status, reason, confirmedQuantity }) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const { pharmacy } = session

  if (typeof reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  const allowed = Object.values(TRANSITIONS).flat()
  if (!allowed.includes(status)) return { ok: false, error: 'ESTADO_INVALIDO' }

  // Recusa: motivo fechado opcional + texto livre curto. 'expirada' é
  // reason interna do cron — nunca aceite da UI.
  let reasonValue = null
  if (status === 'recusada') {
    const key = (reason || 'outro').split(':')[0].trim()
    if (!REJECT_REASONS.has(key)) return { ok: false, error: 'MOTIVO_INVALIDO' }
    const detail = (reason || '').split(':').slice(1).join(':').trim().slice(0, 300)
    reasonValue = detail ? `${key}:${detail}` : key
  }

  // Ajuste de quantidade (0010): unidades efectivamente separadas. Só faz
  // sentido a caminhar para frente (confirmar/pronta); 0 → recusa implícita
  // por falta de stock, com reason automático.
  let confirmedQty = null
  if (confirmedQuantity !== undefined && confirmedQuantity !== null && confirmedQuantity !== '') {
    confirmedQty = Number.parseInt(confirmedQuantity, 10)
    if (Number.isNaN(confirmedQty) || confirmedQty < 0) {
      return { ok: false, error: 'QUANTIDADE_INVALIDA' }
    }
    if (confirmedQty === 0 && status === 'confirmada') {
      status = 'recusada'
      reasonValue = 'sem_stock'
      confirmedQty = null
    }
  }

  try {
    const { createServerComponentClient } = await import('@/lib/supabase/server')
    const supabase = await createServerComponentClient()

    // O .eq('pharmacy_id') é redundância defensiva sobre a RLS: uma farmácia
    // nunca deve conseguir mover reservas de outra.
    const { data: current, error: e1 } = await supabase
      .from('reservations')
      .select(
        'id, status, stock_item_id, quantity, requester_name, requester_phone, drugs(name), pharmacies(name)',
      )
      .eq('id', reservationId)
      .eq('pharmacy_id', pharmacy.id)
      .maybeSingle()
    if (e1) throw e1
    if (!current) return { ok: false, error: 'RESERVA_INEXISTENTE' }

    const legal = TRANSITIONS[current.status] || []
    if (!legal.includes(status)) {
      return { ok: false, error: `MOVIMENTO_INVALIDO:${current.status}->${status}` }
    }

    // O decremento do stock NÃO está aqui: é o trigger
    // trg_reservation_stock_decrement (migração 0006, actualizada na 0010
    // para usar confirmed_quantity) que o faz, na mesma transacção deste
    // UPDATE — atómico e impossível de contornar.
    const patch = { status, resolved_at: new Date().toISOString() }
    if (reasonValue) patch.reason = reasonValue
    if (confirmedQty != null) patch.confirmed_quantity = confirmedQty
    const { error } = await supabase
      .from('reservations')
      .update(patch)
      .eq('id', reservationId)
      .eq('pharmacy_id', pharmacy.id)
    if (error) throw error

    revalidatePath('/portal')
    revalidatePath('/portal/reservas')

    // Template de WhatsApp já montado — o card usa-o no botão "Avisar
    // cliente". Nenhum envio acontece aqui: o atendente toca no wa.me.
    let waTemplate = null
    const msg = buildReservationMessage({
      id: reservationId,
      status,
      reason: reasonValue,
      quantity: current.quantity,
      confirmed_quantity: confirmedQty,
      requester_name: current.requester_name,
      drugName: current.drugs?.name,
      pharmacyName: current.pharmacies?.name,
    })
    if (msg) waTemplate = waLink(current.requester_phone, msg.text)

    // Concluir é a única transição que altera o stock — devolver o saldo
    // resultante para o portal poder dizer à farmácia o que aconteceu
    // ("restam 3" / "esgotado"). Só leitura, depois do trigger já ter corrido.
    if (status === 'concluida' && current.stock_item_id) {
      const { data: item } = await supabase
        .from('stock_items')
        .select('quantity, in_stock')
        .eq('id', current.stock_item_id)
        .maybeSingle()
      revalidatePath(`/farmacia/${pharmacy.slug}`)
      return { ok: true, stock: item || null, waTemplate }
    }

    return { ok: true, waTemplate }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao actualizar reserva', {
      slug: pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_ACTUALIZAR' }
  }
}

/**
 * Login do portal, server-side.
 *
 * Antes era signInWithPassword no browser: o @supabase/ssr guardava as
 * cookies de sessão no cliente, mas o servidor nem sempre as via a tempo
 * (desincronização browser↔servidor) — o utilizador entrava e voltava a
 * ser redireccionado para o login. Autenticando AQUI, as cookies de
 * sessão são escritas pelo próprio request do servidor: quando o
 * layout do portal ler a sessão, ela já está lá.
 *
 * Nota: por ser uma Server Action usada com useActionState, a assinatura
 * é (estadoAnterior, formData) e `redirect()` em caso de sucesso é a
 * forma correcta de navegar — lança NEXT_REDIRECT por baixo.
 */
export async function loginPharmacy(_prevState, formData) {
  const email = String(formData?.get('email') || '').trim()
  const password = String(formData?.get('password') || '')
  if (!email || !password) return { ok: false, error: 'CAMPOS_EM_FALTA' }

  try {
    const supabase = await createServerComponentClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      logWarn('pharmacy-portal', 'Login falhou', { email, message: error.message })
      return {
        ok: false,
        error: error.message === 'Invalid login credentials' ? 'CREDENCIAIS' : 'FALHA_ENTRAR',
      }
    }

    // Papel e farmácia activa validados server-side antes de entrar —
    // sem o cliente precisar de adivinhar para onde vai.
    const session = await getPharmacySession()
    if (!session) {
      await supabase.auth.signOut()
      return { ok: false, error: 'SEM_ACESSO_PORTAL' }
    }

    revalidatePath('/portal', 'layout')
    redirect('/portal')
  } catch (err) {
    // redirect() lança NEXT_REDIRECT — deve propagar, não virar erro.
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    logError('pharmacy-portal', 'Falha no login do portal', errMeta(err))
    return { ok: false, error: 'FALHA_ENTRAR' }
  }
}
