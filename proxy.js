import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy (middleware) do Localizador de Medicamentos.
 *
 * Duas responsabilidades, ambas nos GET (documentos):
 *
 *  1. Renovar a sessão partilhada do Supabase. O cookie é do domínio pai
 *     (`.conhecafarmacia.com`), por isso a mesma sessão que nasce em
 *     `conta.*` serve este sítio. Server Components não podem escrever
 *     cookies; é aqui que o `setAll` grava o token renovado.
 *  2. Gerar um nonce por pedido para a CSP (o script anti-FOUC no layout
 *     usa-o) e aplicar a Content-Security-Policy em todas as rotas.
 *
 * Os POST (Server Actions — login do portal, stock, guardados) continuam a
 * sair cedo e sem headers: reconstruir o request aqui podia deixar cair o
 * Set-Cookie da action, e é nele que vive a sessão.
 */

/** Cookie de sessão no domínio pai, para valer nos três hosts. */
const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined

/** Só vale a pena ir ao Supabase se houver cookie de sessão para renovar. */
const hasAuthCookie = (cookies) => cookies.some((c) => c.name.startsWith('sb-'))

export async function proxy(request) {
  if (request.method !== 'GET') return NextResponse.next()

  // Nonce por pedido: o layout injecta-o no script inline anti-FOUC e a CSP
  // só confia em scripts que o transportem. Sem 'unsafe-inline' nem
  // 'unsafe-eval' em script-src.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Em desenvolvimento o React precisa de 'unsafe-eval' (React Refresh/HMR e
  // reconstrução de callstacks — “React requires eval() in development mode”).
  // Em produção a CSP mantém-se estrita, sem unsafe-eval.
  const isDev = process.env.NODE_ENV === 'development'

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''} https://vercel.live`,
    `style-src 'self' 'unsafe-inline'`,
    // tile.openstreetmap.org: as tiles do mapa da página da farmácia
    // (components/search/MiniMap.jsx). Sem este host na lista, a CSP
    // bloqueia as imagens e o mapa fica em branco.
    `img-src 'self' data: blob: https://*.supabase.co https://tile.openstreetmap.org https://vercel.live`,
    `media-src 'self' blob: https://*.supabase.co`,
    `font-src 'self'`,
    // `wss://*.supabase.co` é obrigatório: o cliente Realtime (sino de
    // reservas da sidebar) abre um WebSocket — sem ele na lista, a CSP
    // recusava a ligação e o sino nunca recebia eventos em tempo real.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-csp-nonce', nonce)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  if (hasAuthCookie(request.cookies.getAll())) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        db: { schema: 'localizador' },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            // O request tem de ver o token novo para esta renderização…
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value)
            }
            response = NextResponse.next({ request: { headers: requestHeaders } })
            // …e o browser recebê-lo com o Domain do pai, senão a renovação
            // só valia neste host e a sessão partia ao saltar para conta.*.
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(
                name,
                value,
                cookieDomain ? { ...options, domain: cookieDomain } : options,
              )
            }
          },
        },
      },
    )

    // getUser (e não getSession) valida o JWT no servidor e é o que força a
    // renovação. Um erro aqui não bloqueia a página: o utilizador aparece
    // como anónimo e o cabeçalho mostra «Entrar».
    await supabase.auth.getUser()
  }

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-csp-nonce', nonce)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
