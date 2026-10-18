'use server'

import { revalidatePath } from 'next/cache'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { createServerComponentClient } from '@/lib/supabase/server'
import { unreadAnnouncementCount } from '@/lib/announcements'
import { logError } from '@/lib/log'

/**
 * Acções do portal para os avisos da equipa (migração 0032).
 *
 * Só existem duas: contar os que faltam abrir (para o sino e o menu) e
 * marcar como lidos. Publicar e arquivar é da equipa interna
 * (`lib/actions/platform-announcements.js`) — a farmácia não escreve
 * avisos, e a RLS da 0032 recusa qualquer INSERT em
 * `pharmacy_announcements` a um utilizador autenticado.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Contagem fresca para o sino — o layout traz a inicial, a sidebar refaz. */
export async function getUnreadAnnouncementCount() {
  const session = await getPharmacySession()
  if (!session?.pharmacy?.id) return { ok: false, error: 'SESSAO_EXPIRADA', count: 0 }

  const count = await unreadAnnouncementCount(session.pharmacy.id)
  return { ok: true, count }
}

/**
 * Marca avisos como lidos para a farmácia. A página chama isto ao abrir,
 * com os ids que mostrou — nunca «tudo o que exista»: um aviso que chegou
 * depois de a página abrir fica por ler, e o sino deve dizê-lo.
 *
 * `ignoreDuplicates` mantém o recibo original: quem lê primeiro fica com
 * o `read_by`/`read_at` (o balcão inteiro partilha o estado).
 */
export async function markAnnouncementsRead(ids) {
  const session = await getPharmacySession()
  if (!session?.pharmacy?.id) return { ok: false, error: 'SESSAO_EXPIRADA' }

  const pharmacyId = session.pharmacy.id
  const lista = Array.isArray(ids)
    ? [...new Set(ids.map((id) => String(id || '')).filter((id) => UUID_RE.test(id)))].slice(0, 200)
    : []
  if (lista.length === 0) return { ok: true, marcados: 0 }

  try {
    const supabase = await createServerComponentClient()

    // A RLS de INSERT já recusaria um aviso que não é desta farmácia (ou
    // já fora do prazo), mas essa recusa faria falhar o lote inteiro.
    // Filtrar primeiro pelos visíveis mantém o resto a funcionar.
    const { data: visiveis, error } = await supabase
      .from('pharmacy_announcements')
      .select('id')
      .in('id', lista)
      .or(`pharmacy_id.eq.${pharmacyId},pharmacy_id.is.null`)
    if (error) throw error

    const rows = (visiveis || []).map((a) => ({
      announcement_id: a.id,
      pharmacy_id: pharmacyId,
    }))
    if (rows.length === 0) return { ok: true, marcados: 0 }

    const { error: erroInsert } = await supabase
      .from('pharmacy_announcement_reads')
      .upsert(rows, { onConflict: 'announcement_id,pharmacy_id', ignoreDuplicates: true })
    if (erroInsert) throw erroInsert

    // O layout tem o número do sino: sem isto ficava com o valor antigo
    // até à navegação seguinte.
    revalidatePath('/portal', 'layout')
    revalidatePath('/portal/avisos')

    return { ok: true, marcados: rows.length }
  } catch (err) {
    logError('avisos', 'Falha ao marcar os avisos como lidos', {
      pharmacyId,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}
