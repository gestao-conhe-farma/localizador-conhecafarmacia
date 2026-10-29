'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Schema onde vivem os dados do Localizador desde a fusão com o site
 * principal (docs/2026-10-28-contas-utilizador-partilhadas.md): um projecto
 * Supabase, um par de chaves, dois schemas. `public` é o site; `localizador`
 * é este produto.
 */
export const DB_SCHEMA = 'localizador'

/**
 * A sessão é a mesma em `www`, `localizador` e `conta`: a cookie vive no
 * domínio pai. Em dev fica vazia — o browser recusa um `Domain` que não é
 * sufixo do host.
 */
const cookieOptions = process.env.NEXT_PUBLIC_COOKIE_DOMAIN
  ? { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN }
  : undefined

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { db: { schema: DB_SCHEMA }, ...(cookieOptions ? { cookieOptions } : {}) },
  )
}
