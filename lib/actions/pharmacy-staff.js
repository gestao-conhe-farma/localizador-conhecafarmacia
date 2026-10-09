'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { logError, logWarn } from '@/lib/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  clearStaffCookie,
  getActiveStaff,
  hashPin,
  isValidPin,
  requireActiveStaff,
  requireManagerStaff,
  setStaffCookie,
  verifyPin,
} from '@/lib/staff-session'

/**
 * Server Actions dos perfis de farmacêutico (migração 0018).
 *
 * Tudo o que toca em `pharmacy_staff` passa aqui — o papel authenticated
 * não tem grants de escrita nessa tabela e o `pin_hash` nem de leitura,
 * por isso as validações (PIN, papel, farmácia) correm com o client
 * service-role depois da sessão da farmácia estar confirmada.
 *
 * A identificação de cada acção (handled_by, stock_entries.staff_id,
 * pharmacies.updated_by) vem do perfil ACTIVO — ver lib/staff-session.js.
 */

function errMeta(err) {
  return {
    message: err?.message || String(err),
    code: err?.code,
    details: err?.details,
  }
}

const ROLES = new Set(['balcao', 'gerente'])

// Colunas visíveis de pharmacy_staff (o pin_hash NUNCA sai daqui —
// nem mesmo para o service-role nesta query).
const STAFF_FIELDS = 'id, pharmacy_id, name, role, active, created_at'

function cleanName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 80) return null
  return name
}

// ---------------------------------------------------------------
// 1. Ecrã de escolha de perfil (PIN)
// ---------------------------------------------------------------

/**
 * Perfis ACTIVOS da farmácia da sessão — é o que o ecrã /portal/perfis
 * lista. Sem pin_hash: só id/nome/papel.
 * `current` devolve o perfil já activo neste dispositivo (ou null).
 */
export async function listStaffProfiles() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .select('id, name, role, active')
      .eq('pharmacy_id', session.pharmacy.id)
      .order('name')
    if (error) throw error
    const all = data || []
    const current = await getActiveStaff(session)
    // `total` distingue «farmácia ainda sem equipa» (primeira arranque,
    // pode criar aqui) de «perfis desactivados» (falar com o gerente).
    return {
      ok: true,
      staff: all.filter((s) => s.active),
      total: all.length,
      current,
    }
  } catch (err) {
    logError('staff', 'Falha ao listar perfis', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_LISTAR' }
  }
}

/**
 * Primeira arranque: a farmácia ainda não tem NENHUM perfil — a própria
 * conta (já autenticada no login) cria o perfil de gerente e entra.
 * O servidor só aceita quando a equipa está mesmo vazia; a partir daí,
 * perfis novos vêm exclusivamente de /portal/equipa (gerente dentro).
 */
export async function bootstrapFirstProfile({ name, pin, confirmPin } = {}) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'NOME_INVALIDO' }
  if (!isValidPin(pin)) return { ok: false, error: 'PIN_INVALIDO' }
  if (String(confirmPin || '') !== String(pin)) return { ok: false, error: 'PIN_CONFIRMACAO' }

  try {
    const admin = createAdminClient()
    const { count, error: eCount } = await admin
      .from('pharmacy_staff')
      .select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', session.pharmacy.id)
    if (eCount) throw eCount
    if ((count || 0) > 0) return { ok: false, error: 'JA_EXISTE_EQUIPA' }

    const { data, error } = await admin
      .from('pharmacy_staff')
      .insert({
        pharmacy_id: session.pharmacy.id,
        name: clean,
        pin_hash: hashPin(pin),
        role: 'gerente',
      })
      .select('id')
      .single()
    if (error) throw error

    await setStaffCookie(data.id)
    revalidatePath('/portal', 'layout')
    redirect('/portal')
  } catch (err) {
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    logError('staff', 'Falha no primeiro perfil', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}

/**
 * Entrar num perfil: valida o PIN contra o scrypt guardado e assina o
 * cookie do dispositivo (24 h). Vários dispositivos podem estar em
 * perfis diferentes ao mesmo tempo — cada um tem o seu cookie.
 */
export async function enterStaffProfile({ staffId, pin } = {}) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  if (typeof staffId !== 'string' || !/^[0-9a-f-]{36}$/i.test(staffId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }
  if (!isValidPin(pin)) return { ok: false, error: 'PIN_INVALIDO' }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .select('id, pin_hash, active')
      .eq('id', staffId)
      .eq('pharmacy_id', session.pharmacy.id)
      .maybeSingle()
    if (error) throw error
    if (!data || !data.active) return { ok: false, error: 'PERFIL_INEXISTENTE' }
    if (!verifyPin(pin, data.pin_hash)) {
      logWarn('staff', 'PIN errado no ecrã de perfis', {
        slug: session.pharmacy.slug,
        staffId,
      })
      return { ok: false, error: 'PIN_ERRADO' }
    }

    await setStaffCookie(data.id)
    revalidatePath('/portal', 'layout')
    redirect('/portal')
  } catch (err) {
    // redirect() lança NEXT_REDIRECT — deve propagar, não virar erro.
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    logError('staff', 'Falha ao entrar no perfil', {
      slug: session.pharmacy.slug,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_ENTRAR' }
  }
}

/**
 * Sair do perfil activo (o dispositivo volta ao ecrã de escolha).
 * A sessão da farmácia permanece — só o perfil do balcão é limpo.
 */
export async function leaveStaffProfile() {
  await clearStaffCookie()
  revalidatePath('/portal', 'layout')
  redirect('/portal/perfis')
}

// ---------------------------------------------------------------
// 2. PIN do perfil activo
// ---------------------------------------------------------------

/**
 * Alterar o próprio PIN: exige o PIN actual (quem acaba de entrar
 * no perfil sabe-o) e confirmação da nova chave. A troca invalida
 * imediatamente o PIN anterior — os outros dispositivos continuam
 * com a sessão até expirar (o cookie identifica, não o PIN).
 */
export async function changeStaffPin({ currentPin, newPin, confirmPin } = {}) {
  const staff = await getActiveStaff()
  if (!staff) return { ok: false, error: 'SEM_PERFIL' }
  if (!isValidPin(currentPin)) return { ok: false, error: 'PIN_INVALIDO' }
  if (!isValidPin(newPin)) return { ok: false, error: 'PIN_NOVO_INVALIDO' }
  if (newPin === currentPin) return { ok: false, error: 'PIN_IGUAL' }
  if (String(confirmPin || '') !== String(newPin)) return { ok: false, error: 'PIN_CONFIRMACAO' }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .select('pin_hash')
      .eq('id', staff.id)
      .maybeSingle()
    if (error) throw error
    if (!data || !verifyPin(currentPin, data.pin_hash)) {
      // Tentativa com PIN actual errado — registada para o gerente poder
      // ver tentativas suspeitas nos logs (não há bloqueio, por opção).
      logWarn('staff', 'PIN actual errado ao alterar PIN', {
        staffId: staff.id,
        name: staff.name,
      })
      return { ok: false, error: 'PIN_ACTUAL_ERRADO' }
    }
    const { error: eUp } = await admin
      .from('pharmacy_staff')
      .update({ pin_hash: hashPin(newPin), updated_at: new Date().toISOString() })
      .eq('id', staff.id)
    if (eUp) throw eUp
    logWarn('staff', 'PIN alterado', { staffId: staff.id, name: staff.name })
    return { ok: true }
  } catch (err) {
    logError('staff', 'Falha ao alterar PIN', { staffId: staff.id, ...errMeta(err) })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

// ---------------------------------------------------------------
// 3. Equipa (só gerente)
// ---------------------------------------------------------------

/**
 * Todos os perfis da farmácia (activos e inactivos) — a tabela de
 * gestão da equipa. Exige perfil ACTIVO com papel 'gerente'.
 */
export async function listTeam() {
  const manager = await requireManagerStaff()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .select(STAFF_FIELDS)
      .eq('pharmacy_id', manager.pharmacy_id)
      .order('active', { ascending: false })
      .order('name')
    if (error) throw error
    return { ok: true, staff: data || [], currentId: manager.id }
  } catch (err) {
    logError('staff', 'Falha ao listar equipa', {
      staffId: manager.id,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_LISTAR' }
  }
}

/** Criar perfil (gerente define nome, PIN e papel). */
export async function createStaffProfile({ name, pin, role } = {}) {
  const manager = await requireManagerStaff()
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: 'NOME_INVALIDO' }
  if (!isValidPin(pin)) return { ok: false, error: 'PIN_INVALIDO' }
  const roleV = ROLES.has(role) ? role : 'balcao'

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .insert({
        pharmacy_id: manager.pharmacy_id,
        name: clean,
        pin_hash: hashPin(pin),
        role: roleV,
      })
      .select('id')
      .single()
    if (error) throw error
    revalidatePath('/portal/equipa')
    return { ok: true, id: data.id }
  } catch (err) {
    logError('staff', 'Falha ao criar perfil', {
      manager: manager.id,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_CRIAR' }
  }
}

/**
 * Editar perfil: nome, papel, activo e/ou PIN novo (opcional — só é
 * gravado se enviado). O próprio gerente não se pode desactivar
 * (deixaria a farmácia sem ninguém para gerir a equipa).
 */
export async function updateStaffProfile({ staffId, name, pin, role, active } = {}) {
  const manager = await requireManagerStaff()
  if (typeof staffId !== 'string' || !/^[0-9a-f-]{36}$/i.test(staffId)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  const patch = { updated_at: new Date().toISOString() }
  if (name !== undefined) {
    const clean = cleanName(name)
    if (!clean) return { ok: false, error: 'NOME_INVALIDO' }
    patch.name = clean
  }
  if (role !== undefined) {
    if (!ROLES.has(role)) return { ok: false, error: 'PAPEL_INVALIDO' }
    patch.role = role
  }
  if (active !== undefined) {
    if (staffId === manager.id && active === false) {
      return { ok: false, error: 'NAO_PODE_DESACTIVAR_SE' }
    }
    patch.active = Boolean(active)
  }
  if (pin !== undefined && pin !== '') {
    if (!isValidPin(pin)) return { ok: false, error: 'PIN_INVALIDO' }
    patch.pin_hash = hashPin(pin)
  }

  try {
    const admin = createAdminClient()
    const { data: target } = await admin
      .from('pharmacy_staff')
      .select('id')
      .eq('id', staffId)
      .eq('pharmacy_id', manager.pharmacy_id)
      .maybeSingle()
    if (!target) return { ok: false, error: 'PERFIL_INEXISTENTE' }

    const { error } = await admin.from('pharmacy_staff').update(patch).eq('id', staffId)
    if (error) throw error
    revalidatePath('/portal/equipa')
    return { ok: true }
  } catch (err) {
    logError('staff', 'Falha ao actualizar perfil', {
      manager: manager.id,
      staffId,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}

// ---------------------------------------------------------------
// 4. Desempenho — gerente vê a equipa; o balcão vê só o seu turno
// ---------------------------------------------------------------

/**
 * Desempenho por farmacêutico — ranking e tabela avançada de /portal/desempenho.
 *
 * Fonte: reservas movidas na janela (2× o período — actual + anterior
 * para a comparação) agregadas por `handled_by` (0018), mais as entradas
 * de stock (`stock_entries`) no mesmo período. Quem tratou da reserva
 * antes da migração 0018 aparece como «Não atribuído».
 *
 * Além das vendas, cada linha traz o movimento do balcão: reservas
 * TRATADAS (qualquer transição), RECUSADAS e EXPIRADAS — o gerente lê
 * quem trabalhou e quem deixou reservas cair.
 *
 * @param {object} [opts]
 * @param {number} [opts.days] — janela em dias (7/30/90; default 30)
 * @param {string} [opts.onlyStaffId] — restringe o relatório a UM perfil
 *   (versão pessoal do balcão: só as suas vendas, sem colegas).
 */
export async function getPerformanceReport({ days = 30, onlyStaffId = null } = {}) {
  const staff = await requireActiveStaff()
  // Papel: o gerente lê a equipa toda (ou um recorte, se pedir); o balcão
  // NUNCA vê colegas — o escopo fecha-se aqui, no servidor.
  if (staff.role !== 'gerente') onlyStaffId = staff.id
  const manager = staff
  const window = [7, 30, 90].includes(days) ? days : 30
  const DAY = 24 * 3600 * 1000
  const now = Date.now()
  const fetchFrom = new Date(now - 2 * window * DAY).toISOString()
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
  const curStart = isoDay(now - (window - 1) * DAY) // 1º dia do período actual
  const prevStart = isoDay(now - (2 * window - 1) * DAY) // 1º dia do anterior

  try {
    const admin = createAdminClient()
    const [rStaff, rSales, rEntries] = await Promise.all([
      admin
        .from('pharmacy_staff')
        .select('id, name, role, active')
        .eq('pharmacy_id', manager.pharmacy_id)
        .order('name'),
      admin
        .from('reservations')
        .select(
          'status, quantity, confirmed_quantity, resolved_at, handled_by, stock_sale_options(price)',
        )
        .eq('pharmacy_id', manager.pharmacy_id)
        .gte('resolved_at', fetchFrom)
        .order('resolved_at', { ascending: false })
        .limit(3000),
      admin
        .from('stock_entries')
        .select('units, staff_id, created_at')
        .eq('pharmacy_id', manager.pharmacy_id)
        .gte('created_at', fetchFrom)
        .order('created_at', { ascending: false })
        .limit(3000),
    ])
    if (rStaff.error) throw rStaff.error
    if (rSales.error) throw rSales.error
    if (rEntries.error) throw rEntries.error

    // Agregação em memória (volumes pequenos, limite 3000).
    const acc = new Map()
    const slot = (id) => {
      if (!acc.has(id)) {
        acc.set(id, {
          value: 0,
          count: 0,
          units: 0,
          prevValue: 0,
          prevCount: 0,
          treated: 0,
          refused: 0,
          expired: 0,
          entries: 0,
          entryUnits: 0,
          unpriced: 0,
        })
      }
      return acc.get(id)
    }

    for (const r of rSales.data || []) {
      const day = String(r.resolved_at || '').slice(0, 10)
      if (!day) continue
      const key = r.handled_by || null // null = «Não atribuído»
      const a = slot(key)
      const qty = r.confirmed_quantity ?? r.quantity ?? 0
      const price = r.stock_sale_options?.price
      const value = price != null ? Math.round(qty * Number(price) * 100) / 100 : null

      // Movimento do balcão (janela actual): TODA a reserva que passou
      // por um perfil conta como tratada; recusadas e expiradas ficam à
      // parte — o gerente vê quem recusou e quem deixou cair.
      if (day >= curStart && key) {
        a.treated += 1
        if (r.status === 'recusada') a.refused += 1
        else if (r.status === 'expirada') a.expired += 1
      }

      if (r.status !== 'concluida') continue

      if (day >= curStart) {
        a.count += 1
        a.units += qty
        if (value == null) a.unpriced += 1
        else a.value += value
      } else if (day >= prevStart) {
        a.prevCount += 1
        if (value != null) a.prevValue += value
      }
    }

    for (const e of rEntries.data || []) {
      const day = String(e.created_at || '').slice(0, 10)
      if (!day || day < curStart) continue
      const a = slot(e.staff_id || null)
      a.entries += 1
      a.entryUnits += e.units || 0
    }

    const rows = []
    for (const s of rStaff.data || []) {
      // Versão pessoal do balcão: só o perfil activo, sem colegas.
      if (onlyStaffId && s.id !== onlyStaffId) continue
      const a = acc.get(s.id) || null
      if (!a) continue // sem actividade no período — o ranking é de quem trabalhou
      acc.delete(s.id)
      rows.push({ id: s.id, name: s.name, role: s.role, active: s.active, ...norm(a) })
    }
    // Restos: perfis apagados ou histórico pré-0018 (handled_by null).
    // Na versão pessoal não entram — são sempre de outro perfil.
    if (!onlyStaffId) {
      for (const [id, a] of acc) {
        if (a.count === 0 && a.entries === 0) continue
        const known = (rStaff.data || []).find((s) => s.id === id)
        rows.push({
          id: id,
          name: known?.name || 'Não atribuído',
          role: known?.role || null,
          active: known?.active ?? null,
          ...norm(a),
        })
      }
    }
    rows.sort((x, y) => y.value - x.value || y.count - x.count)

    const tot = rows.reduce(
      (t, r) => ({
        value: t.value + r.value,
        count: t.count + r.count,
        units: t.units + r.units,
        prevValue: t.prevValue + r.prevValue,
        prevCount: t.prevCount + r.prevCount,
        treated: t.treated + r.treated,
        refused: t.refused + r.refused,
        expired: t.expired + r.expired,
        entries: t.entries + r.entries,
        entryUnits: t.entryUnits + r.entryUnits,
      }),
      {
        value: 0,
        count: 0,
        units: 0,
        prevValue: 0,
        prevCount: 0,
        treated: 0,
        refused: 0,
        expired: 0,
        entries: 0,
        entryUnits: 0,
      },
    )

    return {
      ok: true,
      window,
      scope: onlyStaffId ? 'self' : 'team',
      rows,
      totals: {
        ...tot,
        value: Math.round(tot.value * 100) / 100,
        prevValue: Math.round(tot.prevValue * 100) / 100,
        ticket: tot.count > 0 ? Math.round((tot.value / tot.count) * 100) / 100 : 0,
      },
    }
  } catch (err) {
    logError('staff', 'Falha ao gerar desempenho', {
      staff: manager.id,
      ...errMeta(err),
    })
    return { ok: false, error: 'FALHA_RELATORIO' }
  }
}

/** Redonda e calcula o ticket médio + tendência vs. período anterior. */
function norm(a) {
  const value = Math.round(a.value * 100) / 100
  const prevValue = Math.round(a.prevValue * 100) / 100
  return {
    value,
    count: a.count,
    units: a.units,
    prevValue,
    prevCount: a.prevCount,
    treated: a.treated,
    refused: a.refused,
    expired: a.expired,
    entries: a.entries,
    entryUnits: a.entryUnits,
    unpriced: a.unpriced,
    ticket: a.count > 0 ? Math.round((a.value / a.count) * 100) / 100 : 0,
    pct: prevValue > 0 ? Math.round(((value - prevValue) / prevValue) * 100) : null,
  }
}
