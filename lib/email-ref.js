import { createHash } from 'node:crypto'

/**
 * Referência opaca de um e-mail para LOGS (server-only — importa
 * `node:crypto`, nunca importar de Client Components).
 *
 * Os logs de tentativas falhadas precisam de correlacionar («o mesmo
 * endereço falhou 20 vezes?»), mas o endereço em claro é PII que fica
 * nos registos da plataforma. O hash SHA-256 truncado resolve os dois:
 * estável por endereço, irreversível na prática. Normalizado antes do
 * hash para `Teste@X.com` e `teste@x.com` contarem como um só.
 */
export function emailRef(email) {
  const norm = String(email || '')
    .trim()
    .toLowerCase()
  if (!norm) return null
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 12)
}
