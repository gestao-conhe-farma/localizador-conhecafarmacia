'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAccountSession } from '@/lib/account-session'
import { logWarn } from '@/lib/log'

/**
 * Acções da conta de utente neste repositório.
 *
 * Entrar, registar e recuperar NÃO existem aqui: vivem em
 * conta.conhecafarmacia.com (docs/2026-10-28). Só fica o que precisa de
 * correr do lado deste sítio — terminar sessão (a cookie é do domínio pai,
 * por isso um só signOut limpa os três hosts) e guardar/remover favoritos.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Termina a sessão partilhada e volta à home. */
export async function sair() {
  const session = await getAccountSession()
  if (session) {
    const { error } = await session.supabase.auth.signOut()
    if (error) logWarn('conta', 'Falha ao terminar sessão', { message: error.message })
  }
  revalidatePath('/', 'layout')
  redirect('/')
}

/**
 * Guarda ou remove um favorito (produto ou farmácia).
 *
 * A escrita é feita com o cliente de sessão, nunca com service-role: é a
 * policy `user_id = auth.uid()` que manda. O toggle é atómico o suficiente
 * para o uso real (um clique) e os índices únicos por alvo impedem
 * duplicados mesmo com dois separadores abertos.
 *
 * Chamada como form action (`<form action={toggleFavorito}>`) ou a partir de
 * um botão cliente; devolve `{ ok, saved }`/`{ ok: false, error }`.
 */
export async function toggleFavorito(formData) {
  const kind = String(formData.get('kind') || '')
  const id = String(formData.get('id') || '')

  if ((kind !== 'drug' && kind !== 'pharmacy') || !UUID_RE.test(id)) {
    return { ok: false, error: 'PAYLOAD_INVALIDO' }
  }

  const session = await getAccountSession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  const { supabase, user } = session
  const column = kind === 'drug' ? 'drug_id' : 'pharmacy_id'

  try {
    const { data: existing, error: eFind } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq(column, id)
      .maybeSingle()
    if (eFind) throw eFind

    if (existing) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id)
      if (error) throw error
      revalidatePath('/guardados')
      return { ok: true, saved: false }
    }

    const { error } = await supabase.from('favorites').insert({ user_id: user.id, [column]: id })
    if (error) throw error
    revalidatePath('/guardados')
    return { ok: true, saved: true }
  } catch (err) {
    logWarn('conta', 'Falha ao guardar favorito', {
      kind,
      id,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA_GUARDAR' }
  }
}
