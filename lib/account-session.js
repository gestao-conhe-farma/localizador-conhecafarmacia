import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@/lib/supabase/server'

/**
 * A conta de utente é uma só nos dois sites e vive em `conta.*`
 * (docs/2026-10-28-contas-utilizador-partilhadas.md). Este repositório não
 * tem ecrãs de entrar/registar: quando falta sessão, manda-se a pessoa para
 * lá com o caminho de volta.
 *
 * A auth do portal da farmácia (lib/pharmacy-session.js, lib/staff-session.js)
 * não passa por aqui: são papéis diferentes, com cookies diferentes.
 */

/** Casa da conta. Em dev aponta para o site principal em localhost. */
export const ACCOUNT_URL = (
  process.env.NEXT_PUBLIC_CONTA_URL || 'https://conta.conhecafarmacia.com'
).replace(/\/$/, '')

/**
 * Utilizador autenticado + cliente com a sessão dele, ou null.
 *
 * `cache` deduplica dentro do mesmo pedido: o cabeçalho, a página e um botão
 * de guardar podem perguntar todos — a validação do JWT corre uma vez.
 * `getUser()` e não `getSession()`: a segunda confia no cookie sem o validar.
 */
export const getAccountSession = cache(async () => {
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { supabase, user } : null
})

/** URL absoluto deste pedido — o `next` atravessa domínios. */
async function absoluteUrl(path) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return new URL(path, configured).href

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || 'http'
  return `${proto}://${host}${path}`
}

/** Link para entrar em `conta.*`, com o caminho de volta já resolvido. */
export async function entrarUrl(nextPath) {
  const next = await absoluteUrl(nextPath)
  return `${ACCOUNT_URL}/entrar?next=${encodeURIComponent(next)}`
}

/**
 * Garante sessão ou manda entrar. Devolve sempre `{ supabase, user }` para
 * quem chama não repetir a leitura.
 */
export async function requireAccount(nextPath) {
  const session = await getAccountSession()
  if (session) return session

  redirect(await entrarUrl(nextPath))
}
