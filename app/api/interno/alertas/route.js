import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/log'

/**
 * Porta de entrada dos alertas de sistema (0048).
 *
 * Quem chama é o GitHub Actions, não uma pessoa: o `backup-db` posta aqui
 * quando falha e posta outra vez quando volta a correr bem. Não há ecrã de
 * escrita nem Server Action — um alerta que depende de alguém se lembrar de
 * o abrir não serve para nada.
 *
 * Duas regras que valem a pena escrever:
 *
 *   1. O SEGREDO É OBRIGATÓRIO. Sem `INTERNO_ALERT_SECRET` configurado o
 *      endpoint recusa tudo, incluindo em desenvolvimento: aqui não há
 *      dados de demonstração, e um alerta falso no /interno é pior do que
 *      nenhum.
 *   2. O `state=ok` FECHA. Uma execução verde resolve os alertas abertos
 *      desse tipo, com `resolved_by = 'auto'`. É o que faz o aviso
 *      desaparecer da área interna sem ninguém tocar em nada.
 */

export const dynamic = 'force-dynamic'

const KINDS = new Set(['backup'])
const ESTADOS = new Set(['ok', 'failed'])

const LIMITES = {
  title: 160,
  body: 2000,
  url: 500,
  dedupe: 80,
}

function autorizado(request) {
  const secret = process.env.INTERNO_ALERT_SECRET
  if (!secret) return false
  // Tempo constante, como o cron dos webhooks: `===` aborta no primeiro byte
  // diferente e entrega a distância de Hamming a quem medir a resposta.
  const a = Buffer.from(request.headers.get('authorization') || '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Texto aparado e cortado ao limite, ou `null` quando não veio nada. */
function limpo(valor, campo) {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  return texto.slice(0, LIMITES[campo])
}

function recusa(mensagem, status = 400) {
  return NextResponse.json({ error: mensagem }, { status })
}

export async function POST(request) {
  if (!autorizado(request)) return recusa('Não autorizado', 401)

  let corpo
  try {
    corpo = await request.json()
  } catch {
    return recusa('Corpo inválido')
  }

  const kind = String(corpo?.kind ?? '').trim()
  if (!KINDS.has(kind)) return recusa('Tipo de alerta desconhecido')

  const estado = String(corpo?.state ?? '').trim()
  if (!ESTADOS.has(estado)) return recusa('Estado inválido: use `ok` ou `failed`')

  try {
    const admin = createAdminClient()

    // Execução verde: fecha o que estiver aberto deste tipo.
    if (estado === 'ok') {
      const { data, error } = await admin
        .from('system_alerts')
        .update({ resolved_at: new Date().toISOString(), resolved_by: 'auto' })
        .eq('kind', kind)
        .is('resolved_at', null)
        .select('id')

      if (error) {
        logError('platform', 'Alerta do sistema não fechou', {
          kind,
          code: error.code,
          message: error.message,
        })
        return recusa('Falhou a escrita', 500)
      }
      return NextResponse.json({ ok: true, fechados: data?.length ?? 0 })
    }

    // Falha: um alerta por tipo, não um por execução. Dois avisos iguais no
    // ecrã ensinam a ignorar o terceiro.
    const { data: abertos, error: erroLeitura } = await admin
      .from('system_alerts')
      .select('id, opened_at')
      .eq('kind', kind)
      .is('resolved_at', null)
      .limit(1)

    if (erroLeitura) {
      logError('platform', 'Alerta do sistema não leu os abertos', {
        kind,
        code: erroLeitura.code,
        message: erroLeitura.message,
      })
      return recusa('Falhou a leitura', 500)
    }
    if (abertos?.length) {
      return NextResponse.json({ ok: true, jaAberto: true, desde: abertos[0].opened_at })
    }

    const titulo = limpo(corpo?.title, 'title') || 'O backup semanal falhou'
    const { error: erroEscrita } = await admin.from('system_alerts').insert({
      kind,
      title: titulo,
      body: limpo(corpo?.body, 'body'),
      url: limpo(corpo?.url, 'url'),
      dedupe: limpo(corpo?.dedupe, 'dedupe'),
    })

    if (erroEscrita) {
      logError('platform', 'Alerta do sistema não foi escrito', {
        kind,
        code: erroEscrita.code,
        message: erroEscrita.message,
      })
      return recusa('Falhou a escrita', 500)
    }

    return NextResponse.json({ ok: true, aberto: true })
  } catch (err) {
    logError('platform', 'Alerta do sistema rebentou', {
      kind,
      message: err?.message || String(err),
    })
    return recusa('Falha inesperada', 500)
  }
}
