import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Rate limiting simples em memória por IP (por instância serverless).
// Suficiente para o volume esperado de uma landing; para escala real,
// migrar para Upstash Redis ou similar.
const WINDOW_MS = 60 * 60 * 1000 // 1 hora
const MAX_PER_WINDOW = 5
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const entry = hits.get(ip) || { count: 0, start: now }
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0
    entry.start = now
  }
  entry.count += 1
  hits.set(ip, entry)
  return entry.count > MAX_PER_WINDOW
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

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Muitas submissões. Tente novamente mais tarde ou fale connosco por WhatsApp.' },
      { status: 429 }
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
