import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { drainDue, pruneDeliveries } from '@/lib/webhooks'

/**
 * Worker das entregas de webhook (0025) — plano 2026-10-12, ideia 1.
 *
 *   GET /api/cron/webhooks?limit=20&worker=vercel   (Authorization: Bearer CRON_SECRET)
 *
 * O que faz: reserva da fila as entregas que já passaram da hora
 * (`webhook_claim_due`), envia-as com assinatura HMAC
 * (`webhook-id`/`webhook-timestamp`/`webhook-signature`), regista cada
 * tentativa (`webhook_record_attempt`) e marca a próxima com backoff +
 * jitter. No fim, limpa entregas com mais de 30 dias.
 *
 * QUEM CHAMA ISTO: o pg_cron do próprio Supabase (migração 0026) — um
 * GET por minuto através do `pg_net`, com o segredo lido do Vault. O
 * agendamento não vive no `vercel.json` porque o plano Hobby só aceita
 * cron diário («Hobby accounts are limited to daily cron jobs») e recusa
 * o deploy de `"* * * * *"` — e a fila da 0025 precisa do minuto, já que
 * o backoff começa nos 5 segundos.
 *
 * Qualquer outro agendador que faça GET a este endereço com o cabeçalho
 * acima (cron-job.org, GitHub Actions, ou o Vercel Cron num plano pago)
 * serve igual — a rota não sabe quem a chamou; o `?worker=` existe só
 * para os registos dizerem de onde veio.
 *
 * SEM CRON_SECRET o endereço responde 401 sempre: sem segredo definido
 * não há forma de distinguir o agendador de um estranho, e um worker
 * aberto seria um canhão de pedidos apontado aos servidores das
 * farmácias.
 *
 * A entrega também é acelerada no caminho quente: a ingestão por API
 * chama a mesma drenagem logo após aplicar um movimento (`after()` no
 * route handler), para o parceiro receber em segundos em vez de no
 * próximo ciclo do cron.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Comparação do segredo em tempo constante: `===` em strings aborta no
 *  primeiro byte diferente e entrega a distância de Hamming a quem medir
 *  o tempo de resposta. Comprimentos diferentes chumbam sem comparar. */
function autorizado(request) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function correr(request) {
  if (!autorizado(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'NAO_AUTORIZADO',
        message: 'Falta CRON_SECRET no ambiente ou o cabeçalho Authorization: Bearer …',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const url = new URL(request.url)
  const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10)
  const worker = (url.searchParams.get('worker') || 'cron').slice(0, 40)

  const resumo = await drainDue({ limit: Number.isNaN(limit) ? 20 : limit, worker })
  const apagadas = await pruneDeliveries(30)

  return NextResponse.json(
    { ...resumo, pruned: apagadas, at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function GET(request) {
  return correr(request)
}

export async function POST(request) {
  return correr(request)
}
