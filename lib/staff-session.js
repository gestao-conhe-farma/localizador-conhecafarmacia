import { cookies } from 'next/headers'
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scryptCb)
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

/**
 * Segredo do HMAC do cookie — `STAFF_COOKIE_SECRET` quando definido.
 *
 * Sem essa variável (era o caso em produção e o login do perfil rebentava
 * em TODOS os acessos), derivamos um segredo DEDICADO da chave de serviço,
 * com separação de domínio: HMAC(service-role, "portal-staff-cookie/v1").
 * Assim a chave de infraestrutura nunca é usada directamente como
 * segredo de assinatura — quem tiver um cookie assinado não consegue
 * nada de novo a partir dele, e uma rotação da chave de serviço apenas
 * invalida os cookies de balcão (24 h, renováveis).
 *
 * Verificado de forma PREGUIÇOSA em `cookieSecret()`: um throw no topo do
 * módulo rebentava a página toda (ex.: /portal/perfis) só por importar este
 * ficheiro, mesmo antes de qualquer cookie ser assinado.
 */
let cachedSecret = null

function cookieSecret() {
  if (cachedSecret) return cachedSecret
  const dedicated = process.env.STAFF_COOKIE_SECRET
  if (dedicated) {
    cachedSecret = dedicated
    return cachedSecret
  }
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!root) {
    throw new Error(
      'staff-session: STAFF_COOKIE_SECRET em falta (e sem chave de serviço para derivar).',
    )
  }
  cachedSecret = createHmac('sha256', root).update('portal-staff-cookie/v1').digest('hex')
  return cachedSecret
}

/** Há alguma fonte de segredo? Sem ela nenhum cookie pode ser validado. */
function hasCookieSecret() {
  try {
    cookieSecret()
    return true
  } catch {
    return false
  }
}

function sign(value) {
  return createHmac('sha256', cookieSecret()).update(value).digest('hex').slice(0, 32)
}

/** `staffId.expiraEmMs.assinatura` — valida integridade e prazo. */
export function readStaffCookie(raw) {
  if (typeof raw !== 'string') return null
  // Sem segredo não há como verificar a assinatura — cookie inválido.
  // (Assinar sem segredo, em `setStaffCookie`, continua a falhar alto.)
  if (!hasCookieSecret()) return null
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
// PIN (scrypt ASSÍNCRONO) — 4 dígitos, formato `scrypt$salt$hash`
//
// scryptSync bloqueava o event loop do Node a cada verificação — com
// o bloqueio exponencial (0036) o custo passa a ser pago também por
// quem martela o PIN, por isso a derivação corre fora da thread
// principal. Chamadores: `await hashPin(pin)` / `await verifyPin(...)`.
// ---------------------------------------------------------------

export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''))
}

export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scryptAsync(String(pin), salt, 32)).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export async function verifyPin(pin, stored) {
  try {
    const [algo, salt, hash] = String(stored || '').split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const calc = await scryptAsync(String(pin), salt, 32)
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
