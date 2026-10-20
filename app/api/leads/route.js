import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }

  // Honeypot: campos falsos preenchidos por bots → falso sucesso.
  if (clean(body.website) !== '' || clean(body.company) !== '') {
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
    contact_name: clean(body.contact_name, 160),
    role: clean(body.role, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    municipio: clean(body.municipio, 120),
    message: clean(body.message, 2000),
    user_agent: clean(request.headers.get('user-agent') || '', 300),
  }

  if (!payload.pharmacy_name || !payload.contact_name || !payload.phone || !payload.municipio) {
    return NextResponse.json(
      { error: 'Preencha os campos obrigatórios: farmácia, responsável, telefone e município.' },
      { status: 400 }
    )
  }
  if (payload.email && !EMAIL_RE.test(payload.email)) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }
  if (!PHONE_RE.test(payload.phone)) {
    return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('pharmacy_leads').insert(payload)
    if (error) {
      console.error('[leads] insert failed', { message: error.message })
      return NextResponse.json(
        { error: 'Não foi possível registar agora. Tente novamente ou fale connosco por WhatsApp.' },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('[leads] unexpected error', { message: err?.message })
    return NextResponse.json(
      { error: 'Não foi possível registar agora. Tente novamente ou fale connosco por WhatsApp.' },
      { status: 500 }
    )
  }

  // Notificação opcional (fire-and-forget) — configurar LEAD_WEBHOOK_URL.
  if (process.env.LEAD_WEBHOOK_URL) {
    fetch(process.env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pharmacy_lead', pharmacy: payload.pharmacy_name, phone: payload.phone }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
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
