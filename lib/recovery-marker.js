import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Marcador assinado da reposição de senha do portal (M7).
 *
 * O cookie diz «esta sessão passou pelo código do e-mail para este
 * utilizador». Tem de ser verificável no servidor, porque quem tem uma
 * sessão de portal pode escrever cookies no browser — um simples `'1'`
 * era forjável e não provava nada.
 *
 * Formato: `userId.expiraMs.hmac`, com o segredo derivado da chave de
 * serviço e separação de domínio (a chave nunca é usada directamente
 * como segredo). Vive fora de `lib/actions/pharmacy-recovery.js` porque
 * esse ficheiro é `'use server'` — só pode exportar acções — e a página
 * `/portal/recuperar` também precisa de validar o marcador.
 */

export const RECOVERY_MARKER = 'portal_recuperacao'
export const RECOVERY_MARKER_TTL_MS = 15 * 60 * 1000

function secret() {
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!root) throw new Error('recovery-marker: SUPABASE_SERVICE_ROLE_KEY em falta.')
  return createHmac('sha256', root).update('portal-recovery-marker/v1').digest()
}

export function assinaturaMarcador(payload) {
  return createHmac('sha256', secret()).update(String(payload)).digest('hex')
}

/**
 * `raw` é válido para `userId`?
 * Falha fechado em qualquer anomalia (sem valor, formato, conta errada,
 * expirado, assinatura inválida ou segredo indisponível).
 */
export function verifyRecoveryMarker(raw, userId) {
  try {
    if (typeof raw !== 'string' || !raw || !userId) return false
    const [id, exp, sig, ...rest] = raw.split('.')
    if (!id || !exp || !sig || rest.length > 0) return false
    if (id !== String(userId)) return false
    if (Number(exp) < Date.now()) return false
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(assinaturaMarcador(`${id}.${exp}`), 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
