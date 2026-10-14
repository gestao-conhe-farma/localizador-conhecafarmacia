import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Chaves de API para terceiros (migração 0023).
 *
 * Formato: `cfk_<key_id>_<segredo>`
 *   • `cfk`     — prefixo reconhecível (scanners de segredos e humanos).
 *   • `key_id`  — selector PÚBLICO, 10 caracteres base64url: é o que se
 *                 indexa na BD para encontrar a chave em O(1) sem
 *                 revelar o segredo. Não é prova de identidade.
 *   • segredo   — 32 bytes aleatórios (~256 bits) em base64url. É a parte
 *                 secreta; nunca é guardada em claro.
 *
 * O que fica na BD é `HMAC-SHA-256(token, pepper)`. Porquê hash rápido
 * (e não bcrypt/argon2 como nas passwords): a chave é aleatória, logo não
 * é adivinhável por dicionário, e é verificada em TODOS os pedidos — um
 * hash lento aí só servia para transformar pedidos normais num DoS. O
 * pepper vive no ambiente (`API_KEY_PEPPER`), nunca na BD, e a comparação
 * é em tempo constante.
 *
 * A chave em claro só existe no momento da criação (é devolvida uma vez).
 */

export const KEY_PREFIX = 'cfk'

// key_id: 10 chars base64url · segredo: 43 chars base64url (32 bytes)
const TOKEN_RE = /^cfk_([A-Za-z0-9_-]{10})_([A-Za-z0-9_-]{43})$/

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Segredo do HMAC: dedicado, senão a service key (nunca sai do servidor). */
function pepper() {
  const secret = process.env.API_KEY_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('api-keys: defina API_KEY_PEPPER (ou SUPABASE_SERVICE_ROLE_KEY) no ambiente')
  }
  return secret
}

/**
 * Gera uma chave nova. Devolve o token (a mostrar UMA vez) e as partes que
 * ficam na BD: selector, hash e últimos 4 caracteres (dica na lista).
 */
export function generateApiKey() {
  const keyId = b64url(randomBytes(8)).slice(0, 10)
  const secret = b64url(randomBytes(32))
  const token = `${KEY_PREFIX}_${keyId}_${secret}`
  return { token, keyId, last4: secret.slice(-4), hash: hashApiKey(token) }
}

/** HMAC-SHA-256(token, pepper) em hex — o que a BD guarda. */
export function hashApiKey(token) {
  return createHmac('sha256', pepper()).update(String(token)).digest('hex')
}

/** Comparação em tempo constante com o hash guardado. */
export function verifyApiKeyHash(token, storedHash) {
  try {
    const a = Buffer.from(hashApiKey(token), 'hex')
    const b = Buffer.from(String(storedHash || ''), 'hex')
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Separa o token nas suas partes. Devolve `{ keyId }` (o suficiente para
 * procurar a linha) ou null se o formato não for o nosso — um token
 * estranho nunca deve chegar à BD.
 */
export function parseApiKey(raw) {
  const m = TOKEN_RE.exec(String(raw || '').trim())
  if (!m) return null
  return { keyId: m[1] }
}

/** A chave tem o scope pedido? (lista fechada, sem wildcards) */
export function hasScope(scopes, scope) {
  return Array.isArray(scopes) && scopes.includes(scope)
}

/** Texto para a lista do portal: `cfk_ab12cd34••••••••a1b2`. */
export function maskKey(keyId, last4) {
  return `${KEY_PREFIX}_${keyId}••••••••${last4 || ''}`
}

/** Extrai a chave do pedido: `Authorization: Bearer …` ou `x-api-key`. */
export function keyFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim())
  if (bearer) return bearer[1].trim()
  return (request.headers.get('x-api-key') || '').trim() || null
}
