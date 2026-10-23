import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailPedidoAdesao, enviarEmail } from '@/lib/email'
import { CONTACT_EMAIL, MUNICIPIOS } from '@/lib/constants'
import { logError } from '@/lib/log'

// Rate limiting ATÓMICO na BD (migração 0037, `lead_rate_consume`):
// janela fixa por IP, incremento num upsert — sobrevive a N
// instâncias serverless e a restarts, ao contrário do Map em memória
// que aqui vivia antes (cada instância contava sozinha: bastava
// espalhar submissões para contornar o limite).
//
// O Map em memória fica só como FALLBACK para quando a 0037 ainda não
// foi aplicada ou a BD falha — com log, nunca silencioso.
const WINDOW_SECONDS = 60 * 60 // 1 hora
const MAX_PER_WINDOW = 5
const fallbackHits = new Map()

// Versão da Política de Privacidade aceite no formulário. Muda quando o
// documento mudar; fica gravada com o lead para se saber a que texto a
// pessoa consentiu.
const PRIVACY_VERSION = '1.0'

function fallbackRateLimited(ip) {
  const now = Date.now()
  const entry = fallbackHits.get(ip) || { count: 0, start: now }
  if (now - entry.start > WINDOW_SECONDS * 1000) {
    entry.count = 0
    entry.start = now
  }
  entry.count += 1
  fallbackHits.set(ip, entry)
  return entry.count > MAX_PER_WINDOW
}

/**
 * IP do cliente: `x-real-ip` primeiro — a Vercel escreve-o com o IP
 * real da ligação (o cliente não o forja: o edge sobrepõe o que vier
 * no pedido). Só depois o primeiro de `x-forwarded-for`, que o
 * cliente PODE prefixar com lixo («fake, real»).
 */
function clientIp(request) {
  const real = (request.headers.get('x-real-ip') || '').trim()
  if (real) return real
  const fwd = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
  return fwd || 'unknown'
}

function clean(v, max = 200) {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+()\d\s-]{7,20}$/
const SITE_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}([/?#].*)?$/i

/** O website é opcional; quando vem sem protocolo, guarda-se com https. */
function normalizeSite(v) {
  const s = clean(v, 200)
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

/**
 * Um segundo pedido com o mesmo e-mail ou telefone não é erro: é uma
 * pessoa a insistir. A rota devolve 409 com `duplicate: true` e NÃO grava;
 * o formulário mostra o aviso e, se a pessoa confirmar, reenvia com
 * `confirm_duplicate: true` e aí grava. Assim o aviso acontece antes de
 * existir um segundo registo, como pedido.
 */
async function duplicateLead(admin, email, phone) {
  if (email) {
    const { data, error } = await admin
      .from('pharmacy_leads')
      .select('id')
      .eq('email', email)
      .limit(1)
    if (error) throw error
    if (data?.length) return 'email'
  }

  if (phone) {
    const { data, error } = await admin
      .from('pharmacy_leads')
      .select('id')
      .eq('phone', phone)
      .limit(1)
    if (error) throw error
    if (data?.length) return 'phone'
  }

  return null
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  // Honeypot: campos falsos preenchidos por bots → falso sucesso. O campo
  // real do website chama-se `site_url`; este `website_hp` é só armadilha.
  if (clean(body.website_hp) !== '' || clean(body.company) !== '') {
    return NextResponse.json({ ok: true })
  }

  const ip = clientIp(request)

  const tooMany = await exceedsLimit(ip)
  if (tooMany) {
    return NextResponse.json(
      { error: 'Muitas submissões. Tente novamente mais tarde ou fale connosco por WhatsApp.' },
      { status: 429, headers: { 'Retry-After': String(WINDOW_SECONDS) } },
    )
  }

  const payload = {
    pharmacy_name: clean(body.pharmacy_name, 160),
    nif: clean(body.nif, 40),
    license: clean(body.license, 80),
    contact_name: clean(body.contact_name, 160),
    role: clean(body.role, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    municipio: clean(body.municipio, 120),
    address: clean(body.address, 200),
    website: normalizeSite(body.site_url),
    social: clean(body.social, 200),
    message: clean(body.message, 2000),
    user_agent: clean(request.headers.get('user-agent') || '', 300),
  }

  if (
    !payload.pharmacy_name ||
    !payload.nif ||
    !payload.license ||
    !payload.contact_name ||
    !payload.role ||
    !payload.email ||
    !payload.phone ||
    !payload.municipio ||
    !payload.address
  ) {
    return NextResponse.json(
      {
        error:
          'Preencha os campos obrigatórios: farmácia, NIF, alvará, responsável, cargo, e-mail, telefone, município e morada.',
      },
      { status: 400 },
    )
  }
  if (!MUNICIPIOS.includes(payload.municipio)) {
    return NextResponse.json({ error: 'Município inválido.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(payload.email)) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }
  if (!PHONE_RE.test(payload.phone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
  }
  if (payload.website && !SITE_RE.test(payload.website)) {
    return NextResponse.json({ error: 'Website inválido.' }, { status: 400 })
  }
  if (body.consent !== true) {
    return NextResponse.json(
      { error: 'É necessário aceitar a Política de Privacidade para enviar o pedido.' },
      { status: 400 },
    )
  }

  let admin
  try {
    admin = createAdminClient()

    const duplicate = await duplicateLead(admin, payload.email, payload.phone)
    if (duplicate && body.confirm_duplicate !== true) {
      return NextResponse.json(
        {
          error:
            duplicate === 'email'
              ? 'Já recebemos um pedido com este e-mail.'
              : 'Já recebemos um pedido com este telefone.',
          duplicate: true,
          campo: duplicate,
        },
        { status: 409 },
      )
    }

    const { error } = await admin.from('pharmacy_leads').insert({
      ...payload,
      consent_at: new Date().toISOString(),
      consent_version: PRIVACY_VERSION,
    })
    if (error) {
      console.error('[leads] insert failed', { message: error.message })
      return NextResponse.json(
        { error: 'Não foi possível registar agora. Tente novamente ou fale connosco por WhatsApp.' },
        { status: 500 },
      )
    }
  } catch (err) {
    console.error('[leads] unexpected error', { message: err?.message })
    return NextResponse.json(
      { error: 'Não foi possível registar agora. Tente novamente ou fale connosco por WhatsApp.' },
      { status: 500 },
    )
  }

  // Confirmação ao requerente — só depois de o lead estar gravado. Se o
  // Resend falhar, o pedido NÃO se perde: fica no /interno e a resposta
  // diz `emailSent: false` para a página de sucesso avisar.
  let emailSent = false
  try {
    const template = emailPedidoAdesao({
      nome: payload.contact_name,
      farmacia: payload.pharmacy_name,
      nif: payload.nif,
      municipio: payload.municipio,
    })
    const envio = await enviarEmail({
      to: payload.email,
      ...template,
      replyTo: CONTACT_EMAIL,
    })
    emailSent = envio.ok === true
    if (!emailSent) {
      logError('leads', 'Confirmação de adesão não enviada', {
        erro: envio.error,
        detalhe: envio.detalhe,
      })
    }
  } catch (err) {
    logError('leads', 'Confirmação de adesão falhou', { message: err?.message })
  }

  // Notificação opcional (fire-and-forget) — configurar LEAD_WEBHOOK_URL.
  if (process.env.LEAD_WEBHOOK_URL) {
    fetch(process.env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pharmacy_lead',
        pharmacy: payload.pharmacy_name,
        municipio: payload.municipio,
        phone: payload.phone,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, emailSent })
}

/**
 * Verdadeiro quando o IP já esgotou a janela. Caminho principal: RPC
 * atómico; fallback em memória (pré-0037 ou BD em baixo), com log.
 */
async function exceedsLimit(ip) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('lead_rate_consume', {
      p_ip: ip,
      p_limit: MAX_PER_WINDOW,
      p_window_seconds: WINDOW_SECONDS,
    })
    if (error) throw error
    return data?.allowed === false
  } catch (err) {
    console.error('[leads] rate RPC falhou, fallback em memória', { message: err?.message })
    return fallbackRateLimited(ip)
  }
}
