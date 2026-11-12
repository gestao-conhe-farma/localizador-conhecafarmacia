import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { refreshDemoStock } from '@/lib/demo-stock'
import { logError } from '@/lib/log'

// A Vercel dispara este endpoint pelo cron definido em vercel.json. Fora da
// Vercel também se pode chamar à mão:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://localizador.conhecafarmacia.com/api/cron/reconfirmar-stock
export const dynamic = 'force-dynamic'

function authorized(request) {
  const secret = process.env.CRON_SECRET
  // Sem segredo configurado, o endpoint só corre em desenvolvimento — em
  // produção recusa-se a fazer alterações à base de dados.
  if (!secret) return process.env.NODE_ENV !== 'production'
  // B3: tempo constante, como os restantes crons — `===` aborta no
  // primeiro byte diferente e expõe a distância de Hamming a quem medir.
  const a = Buffer.from(request.headers.get('authorization') || '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await refreshDemoStock()
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
  } catch (err) {
    logError('cron-stock', 'Reconfirmação do stock de demonstração falhou', {
      message: err?.message,
    })
    return NextResponse.json({ error: 'Falhou a reconfirmação do stock' }, { status: 500 })
  }
}
