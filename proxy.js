import { NextResponse } from 'next/server'

/**
 * Proxy (middleware) do Localizador de Medicamentos.
 *
 * Landing pública, PT-only — sem sessões de utilizador nesta fase. O papel
 * aqui é exclusivamente de segurança: gerar um nonce por pedido para a CSP
 * (o script anti-FOUC no layout usa-o) e aplicar a Content-Security-Policy
 * em todas as rotas. Quando o portal da farmácia arrancar (fase 2), a
 * protecção de rotas /admin entra aqui, como no site principal
 * (conheca-farmacia-NEXT/proxy.js).
 */
export async function proxy(request) {
  // Nonce por pedido: o layout injecta-o no script inline anti-FOUC e a CSP
  // só confia em scripts que o transportem. Sem 'unsafe-inline' nem
  // 'unsafe-eval' em script-src.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://vercel.live`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co https://vercel.live`,
    `media-src 'self' blob: https://*.supabase.co`,
    `font-src 'self'`,
    `connect-src 'self' https://*.supabase.co https://vercel.live`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-csp-nonce', nonce)

  return NextResponse.next({
    request: { headers: requestHeaders },
    headers: {
      'Content-Security-Policy': csp,
      'x-csp-nonce': nonce,
    },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
