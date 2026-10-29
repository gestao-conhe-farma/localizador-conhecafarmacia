/**
 * Casa da conta — `conta.conhecafarmacia.com`.
 *
 * Vive num módulo sem dependências de servidor (`next/headers`) porque o
 * precisam os dois lados: `lib/account-session.js` no servidor e os botões de
 * conta no cliente, que montam o `?next=` com o URL actual.
 */
export const ACCOUNT_URL = (
  process.env.NEXT_PUBLIC_CONTA_URL || 'https://conta.conhecafarmacia.com'
).replace(/\/$/, '')

/** Link de entrada com o caminho de volta já resolvido. */
export function entrarHref(nextUrl) {
  const next = nextUrl || 'https://localizador.conhecafarmacia.com/'
  return `${ACCOUNT_URL}/entrar?next=${encodeURIComponent(next)}`
}
