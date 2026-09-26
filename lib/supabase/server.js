import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase client server-side com sessão via cookies (Next.js App Router).
 *
 * Diferente de lib/supabase/client.js (browser) e de lib/supabase/admin.js
 * (service role): este transporta a sessão do utilizador autenticado — as
 * policies de RLS veem auth.uid() e o papel 'farmacia' aplica as regras
 * de acesso por farmácia.
 *
 * Uso: em Server Components, Server Actions e Route Handlers. O cookieStore
 * do Next 15+/16 é writable em Server Actions e Route Handlers, pelo que
 * login/logout funcionam com o mesmo cliente.
 */
export async function createServerComponentClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components não podem escrever cookies — o middleware
            // (proxy.js) refresca a sessão quando necessário.
          }
        },
      },
    },
  )
}
