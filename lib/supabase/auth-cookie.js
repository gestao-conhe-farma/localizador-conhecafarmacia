/**
 * Onde cada sessão do Supabase vive.
 *
 * O `@supabase/ssr` deriva o nome do cookie do URL do projecto
 * (`sb-<ref>-auth-token`) e, por omissão, um único nome serve o site inteiro.
 * Num mesmo browser isso significa uma sessão só: entrar no portal da farmácia
 * apagava a do interno, e vice-versa — cada login escrevia por cima do cookie
 * do outro.
 *
 * Aqui cada área autenticada pode ter o seu nome, para as duas conviverem:
 *
 *  - `site`  — site público, `/conta` e `/portal` (nome histórico, para não
 *              deitar fora as sessões que os farmacêuticos já têm abertas);
 *  - `interno` — a consola `/interno`, agora em cookie próprio.
 */
const SUFIXO = '-auth-token'

function referenciaDoProjecto() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    return host.split('.')[0] || 'supabase'
  } catch {
    return 'supabase'
  }
}

/**
 * Nome do cookie (ou da primeira fatia, quando a sessão não cabe num só) para
 * uma área. Tem de ser igual no browser, no servidor e no proxy: é a única
 * coisa que os liga.
 */
export function nomeCookieAuth(area = 'site') {
  const ref = referenciaDoProjecto()
  return area === 'interno' ? `sb-${ref}-interno${SUFIXO}` : `sb-${ref}${SUFIXO}`
}

/** Verdadeiro para o cookie da área e para as fatias `.0`, `.1`, … */
export function ehCookieAuth(name, area = 'site') {
  const base = nomeCookieAuth(area)
  return name === base || name.startsWith(`${base}.`)
}
