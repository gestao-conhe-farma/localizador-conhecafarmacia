import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/log'

/**
 * Limite de tentativas de login (M5).
 *
 * Dois contadores por tentativa — conta e IP — na função atómica
 * `auth_rate_consume` (0064). A chave da conta é um hash do e-mail: o
 * limite funciona sem guardar o endereço, e a mensagem devolvida ao
 * browser é sempre a mesma, para não revelar se a conta existe.
 *
 * Falhas ficam em `auth_failures` (hash de e-mail e IP) e, a partir de
 * `ALERTA_MIN` na mesma janela, abrem um alerta em `system_alerts` — o
 * painel de entrada do /interno passa a mostrá-lo.
 *
 * O rate limit é defesa em profundidade, não a única barreira: se a
 * tabela/função não existir (migração por aplicar, ambiente local), a
 * autenticação segue e o erro fica no log. Falhar aberto aqui evita
 * trancar toda a gente fora por causa de um deploy a meio.
 */

const CONTA = { limit: 10, window: 900 }
const IP = { limit: 40, window: 900 }
const ALERTA_MIN = 5
const ALERTA_JANELA_MIN = 15

/** Hash estável e curto de uma chave (e-mail, IP, …). */
export function authKey(value) {
  return createHash('sha256')
    .update(`auth-rate/v1:${String(value ?? '').trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
}

async function ipHash() {
  try {
    const h = await headers()
    const raw =
      h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
    return raw ? authKey(`ip:${raw}`) : null
  } catch {
    return null
  }
}

/**
 * Consome uma tentativa. Devolve `{ ok: true }` ou
 * `{ ok: false, retryAfter }` (segundos).
 */
export async function checkAuthRate(scope, email) {
  try {
    const admin = createAdminClient()
    const alvos = [{ chave: authKey(`conta:${scope}:${email}`), ...CONTA }]
    const ip = await ipHash()
    if (ip) alvos.push({ chave: ip, ...IP })

    let retryAfter = 0
    for (const alvo of alvos) {
      const { data, error } = await admin.rpc('auth_rate_consume', {
        p_scope: scope,
        p_chave: alvo.chave,
        p_limit: alvo.limit,
        p_window_seconds: alvo.window,
      })
      if (error) {
        logError('auth-rate', 'Contador de login ilegível — a deixar passar', {
          scope,
          message: error.message,
        })
        return { ok: true }
      }
      if (data && data.allowed === false) {
        retryAfter = Math.max(retryAfter, Number(data.retry_after) || alvo.window)
      }
    }

    return retryAfter > 0 ? { ok: false, retryAfter } : { ok: true }
  } catch (err) {
    logError('auth-rate', 'Limite de login rebentou — a deixar passar', {
      scope,
      message: err?.message || String(err),
    })
    return { ok: true }
  }
}

/**
 * Regista uma falha e, ao atingir o limiar, abre um alerta no /interno.
 * Nunca lança: uma falha a registar não pode mudar a resposta ao login.
 */
export async function recordAuthFailure({ scope, email, motivo }) {
  try {
    const admin = createAdminClient()
    const emailRef = authKey(`email:${email}`)
    const ip = await ipHash()

    await admin.from('auth_failures').insert({
      scope,
      email_ref: emailRef,
      ip_hash: ip,
      motivo: String(motivo ?? '').slice(0, 200),
    })

    const since = new Date(Date.now() - ALERTA_JANELA_MIN * 60000).toISOString()
    const { count } = await admin
      .from('auth_failures')
      .select('id', { count: 'exact', head: true })
      .eq('scope', scope)
      .eq('email_ref', emailRef)
      .gte('created_at', since)

    if ((count || 0) < ALERTA_MIN) return

    // Um alerta por conta/hora: repetir o ataque não enche o painel.
    const dedupe = `auth:${scope}:${emailRef}:${new Date().toISOString().slice(0, 13)}`
    const { data: existente } = await admin
      .from('system_alerts')
      .select('id')
      .eq('kind', 'auth')
      .eq('dedupe', dedupe)
      .maybeSingle()
    if (existente) return

    await admin.from('system_alerts').insert({
      kind: 'auth',
      title: 'Tentativas de login repetidas',
      body: `${count} falhas em ${ALERTA_JANELA_MIN} min no login ${scope === 'portal' ? 'do portal' : 'da área interna'}.`,
      dedupe,
    })
  } catch (err) {
    logError('auth-rate', 'Falha ao registar tentativa de login', {
      scope,
      message: err?.message || String(err),
    })
  }
}
