import { cookies } from 'next/headers'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { logError } from '@/lib/log'

/**
 * Perfil de farmacêutico activo (migração 0018).
 *
 * Vários balcões usam perfis diferentes em simultâneo — CADA DISPOSITIVO
 * tem o seu cookie `portal-staff` (assinado no servidor), válido 24 h.
 * O cookie identifica; a BD confirma (farmácia + activo) — um cookie
 * forjado ou um perfil desactivado nunca passa.
 *
 * O PIN nunca sai daqui em claro: vive em pharmacy_staff.pin_hash
 * (scrypt(salt)) e as colunas não têm grant de SELECT para o papel
 * authenticated — a validação corre com o client service-role.
 */

export const STAFF_COOKIE = 'portal-staff'
const STAFF_TTL_MS = 24 * 60 * 60 * 1000 // turno de 24 h — renovável ao trocar de perfil

/** Segredo do HMAC do cookie: preferido dedicado, senão a service key. */
function cookieSecret() {
  const secret = process.env.STAFF_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('staff-session: defina STAFF_COOKIE_SECRET ou SUPABASE_SERVICE_ROLE_KEY')
  }
  return secret
}

function sign(value) {
  return createHmac('sha256', cookieSecret()).update(value).digest('hex').slice(0, 32)
}

/** `staffId.expiraEmMs.assinatura` — valida integridade e prazo. */
export function readStaffCookie(raw) {
  if (typeof raw !== 'string') return null
  const [id, exp, sig, ...rest] = raw.split('.')
  if (!id || !exp || !sig || rest.length > 0) return null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const expected = `${id}.${exp}.${sign(`${id}.${exp}`)}`
  const a = Buffer.from(raw)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Number(exp) < Date.now()) return null
  return id
}

export async function setStaffCookie(staffId) {
  const exp = String(Date.now() + STAFF_TTL_MS)
  const value = `${staffId}.${exp}.${sign(`${staffId}.${exp}`)}`
  const store = await cookies()
  store.set(STAFF_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STAFF_TTL_MS / 1000,
  })
}

export async function clearStaffCookie() {
  const store = await cookies()
  store.delete(STAFF_COOKIE)
}

// ---------------------------------------------------------------
// PIN (scrypt) — 4 dígitos, formato `scrypt$salt$hash`
// ---------------------------------------------------------------

export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''))
}

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(pin), salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPin(pin, stored) {
  try {
    const [algo, salt, hash] = String(stored || '').split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const calc = scryptSync(String(pin), salt, 32)
    const want = Buffer.from(hash, 'hex')
    return calc.length === want.length && timingSafeEqual(calc, want)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------
// Perfil activo
// ---------------------------------------------------------------

/**
 * Lê o cookie e devolve o perfil ACTIVO da farmácia da sessão.
 * Null quando: sem sessão, cookie ausente/inválido/expirado, perfil
 * pertence a outra farmácia ou já não está activo.
 *
 * @param {object} [session] — sessão já obtida (evita re-ler); senão lê.
 */
export async function getActiveStaff(session) {
  try {
    const sess = session || (await getPharmacySession())
    if (!sess) return null
    const store = await cookies()
    const staffId = readStaffCookie(store.get(STAFF_COOKIE)?.value)
    if (!staffId) return null

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pharmacy_staff')
      .select('id, pharmacy_id, name, role, active, created_at')
      .eq('id', staffId)
      .eq('pharmacy_id', sess.pharmacy.id)
      .maybeSingle()
    if (error) throw error
    if (!data || !data.active) return null
    return data
  } catch (err) {
    logError('staff-session', 'Falha ao ler perfil de farmacêutico', {
      message: err?.message || String(err),
    })
    return null
  }
}

/**
 * Guard para páginas que exigem perfil activo — sem perfil o utilizador
 * nunca chega ao portal: vai ao ecrã de escolha com PIN.
 */
export async function requireActiveStaff() {
  const staff = await getActiveStaff()
  if (!staff) {
    const { redirect } = await import('next/navigation')
    redirect('/portal/perfis')
  }
  return staff
}

/** Guard extra para páginas/acções exclusivas de gerente. */
export async function requireManagerStaff() {
  const staff = await requireActiveStaff()
  if (staff.role !== 'gerente') {
    const { redirect } = await import('next/navigation')
    redirect('/portal')
  }
  return staff
}
