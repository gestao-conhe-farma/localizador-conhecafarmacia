import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client.
 *
 * Bypasses Row Level Security — use ONLY from Route Handlers / Server Actions
 * where the caller has already been authorized or the route is intentionally
 * public-but-hardened (ex.: /api/leads com honeypot + rate limit + validação).
 * Never import this from a Client Component or expose the service role key to
 * the browser.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from the server environment.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('createAdminClient: NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceKey) {
    throw new Error('createAdminClient: SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
