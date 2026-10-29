'use client'

import { createBrowserClient } from '@supabase/ssr'
import { cookieDomainFor } from '@/lib/cookie-domain'

/**
 * Schema onde vivem os dados do Localizador desde a fusão com o site
 * principal (docs/2026-10-28-contas-utilizador-partilhadas.md): um projecto
 * Supabase, um par de chaves, dois schemas. `public` é o site; `localizador`
 * é este produto.
 */
export const DB_SCHEMA = 'localizador'

/**
 * A sessão é a mesma em `www`, `localizador` e `conta`: a cookie vive no
 * domínio pai.
 *
 * O `Domain` só entra quando o host pertence mesmo a esse domínio — a
 * decisão está em `lib/cookie-domain.js`, porque um `Domain` que não é
 * sufixo do host é recusado em silêncio pelo browser (é o que acontece em
 * `localhost` e nas previews `*.vercel.app`).
 */
export function createClient() {
  const dominio = cookieDomainFor(
    typeof window === 'undefined' ? null : window.location.hostname,
  )
  const cookieOptions = dominio ? { domain: dominio } : undefined

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: DB_SCHEMA }, ...(cookieOptions ? { cookieOptions } : {}) },
  )
}
