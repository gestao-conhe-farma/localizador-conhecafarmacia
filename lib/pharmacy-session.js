import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logError } from '@/lib/log'

/**
 * Sessão do portal da farmácia.
 *
 * Devolve { user, profile, pharmacy } quando há um utilizador autenticado
 * com papel 'farmacia' e a farmácia associada existe e está activa; caso
 * contrário null (o chamador decide: redirect para login ou 404).
 *
 * RLS: a leitura de admin_users/pharmacies passa pelo cliente com cookies —
 * o utilizador só vê a própria linha de admin_users ("admin_users self read")
 * e a farmácia associada.
 */
export async function getPharmacySession() {
  return getPharmacySessionVerbose().then((r) => r.session)
}

/**
 * Igual a getPharmacySession, mas nomeia a RAZÃO exacta de não haver
 * sessão (sem user / sem perfil / papel errado / farmácia inactiva).
 * Instrumentação do bug do redirect pós-login — remover quando estabilizar.
 */
export async function getPharmacySessionVerbose() {
  try {
    const supabase = await createServerComponentClient()
    // Nomeia as cookies sb-* que chegam neste request — se for vazio,
    // as cookies de sessão nunca chegaram ao servidor (descarte no
    // middleware/action). Se chegarem mas a razão for SEM_USER, o token
    // é inválido ou o getUser falhou (rede).
    const sbCookies = (await cookies())
      .getAll()
      .map((c) => c.name)
      .filter((n) => n.startsWith('sb-'))
    const base = { sbCookies }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ...base, session: null, reason: 'SEM_USER' }

    const { data: profile, error } = await supabase
      .from('admin_users')
      .select('user_id, role, pharmacy_id, display_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return { ...base, session: null, reason: 'ERRO_PERFIL', detail: error.message }
    if (!profile) return { ...base, session: null, reason: 'SEM_PERFIL' }
    if (profile.role !== 'farmacia')
      return { ...base, session: null, reason: 'PAPEL_ERRADO', detail: profile.role }
    if (!profile.pharmacy_id) return { ...base, session: null, reason: 'SEM_FARMACIA' }

    const { data: pharmacy } = await supabase
      .from('pharmacies')
      .select(
        'id, slug, name, municipio, address, phone, whatsapp, opening_hours, maps_url, verified, active',
      )
      .eq('id', profile.pharmacy_id)
      .maybeSingle()
    if (!pharmacy) return { ...base, session: null, reason: 'SEM_FARMACIA_LINHA' }
    if (!pharmacy.active) return { ...base, session: null, reason: 'FARMACIA_INACTIVA' }

    return { ...base, session: { user, profile, pharmacy }, reason: 'OK' }
  } catch (err) {
    logError('pharmacy-portal', 'Falha ao obter sessão da farmácia', {
      message: err?.message || String(err),
    })
    return {
      session: null,
      reason: 'EXCECAO',
      detail: err?.message || String(err),
      sbCookies: [],
    }
  }
}

/**
 * Guard para páginas do portal: redireciona para o login se não houver
 * sessão válida. Usar no topo de cada página server-side do portal.
 */
export async function requirePharmacySession() {
  const session = await getPharmacySession()
  if (!session) redirect('/portal/login')
  return session
}
