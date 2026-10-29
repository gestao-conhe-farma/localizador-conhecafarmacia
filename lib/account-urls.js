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

/**
 * O site principal — onde vive o perfil de estudante. A área de conta
 * atravessa os três hosts, por isso a navegação comum precisa das origens
 * completas, não de caminhos relativos.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.conhecafarmacia.com'
).replace(/\/$/, '')

/** Este produto. */
export const LOCATOR_URL = (
  process.env.NEXT_PUBLIC_LOCATOR_ORIGIN || 'https://localizador.conhecafarmacia.com'
).replace(/\/$/, '')

/** Link de entrada com o caminho de volta já resolvido. */
export function entrarHref(nextUrl) {
  const next = nextUrl || `${LOCATOR_URL}/`
  return `${ACCOUNT_URL}/entrar?next=${encodeURIComponent(next)}`
}
