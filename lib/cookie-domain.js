/**
 * Domínio da cookie de sessão, decidido CONTRA O HOST do pedido.
 *
 * `NEXT_PUBLIC_COOKIE_DOMAIN` diz qual é o domínio pai (`.conhecafarmacia.com`),
 * mas quem valida o valor é o browser: um `Domain` que não é sufixo do host
 * actual é recusado em silêncio, o `Set-Cookie` desaparece e a pessoa fica
 * sem sessão. É isso que acontece em `localhost` e em qualquer preview
 * `*.vercel.app`.
 *
 * Por isso a variável pode estar definida em Production **e** Preview: só é
 * aplicada quando o host pertence mesmo ao domínio. Sem esta guarda, definir
 * a variável em Preview partia o login nas previews — que é o oposto do que
 * a partilha de sessão existe para fazer.
 *
 * Módulo puro (sem `next/headers`, sem `window`): é importado pelo cliente
 * de browser, pelo cliente de servidor e pelo proxy.
 */
const CONFIGURADO = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '').trim()

/** `host` pode vir com porta (`localhost:3000`); o `Domain` nunca leva porta. */
export function cookieDomainFor(host) {
  if (!CONFIGURADO) return undefined

  const actual = String(host || '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .trim()
  if (!actual) return undefined

  const pai = CONFIGURADO.replace(/^\./, '').toLowerCase()
  return actual === pai || actual.endsWith(`.${pai}`) ? CONFIGURADO : undefined
}
