import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError, logWarn } from '@/lib/log'
import { requiresMotivo } from '@/lib/platform/permissions'

/**
 * Escritor da trilha de auditoria da Equipa CF — Task 3.4 do plano
 * (docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * Escreve em `public.platform_audit_log` (migração 0027) com o cliente
 * service-role: a tabela é append-only para todos os papéis que falam com a
 * API (o `update`/`delete` foi revogado até ao `service_role`, que tem
 * rolbypassrls e passaria por cima de qualquer policy), e por isso a
 * escrita existe SÓ aqui, no servidor.
 *
 * CONTRATO — as duas regras deste módulo:
 *
 *   1. NUNCA LANÇA. A acção principal não pode falhar por causa da
 *      auditoria: suspender uma farmácia tem de acontecer mesmo que a
 *      trilha esteja em baixo. Tudo o que dê errado é apanhado, registado
 *      com `logError('platform', …)` e devolvido como `{ ok: false }` —
 *      porque uma auditoria EM FALTA tem de ser visível, e um catch mudo
 *      era a pior das duas falhas.
 *   2. ESCREVE O QUE ACONTECEU, não o que devia ter acontecido. Não valida
 *      o motivo como condição de escrita (isso é feito antes, em
 *      `requirePlatform`): se a acção se realizou e o motivo faltou, o
 *      registo sem motivo é a prova de que faltou, e é melhor do que
 *      nenhum registo. O comentário da coluna `reason` na 0027 diz
 *      exactamente isto.
 *
 * Só código de servidor: importa `node:crypto`, o cliente service-role e
 * `next/headers`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Identificador da OPERAÇÃO, para ligar vários registos entre si (converter
 * um lead grava farmácia + convite + plano: três linhas, um pedido).
 * Quem executa a operação chama isto uma vez e passa-o a todos os
 * `logPlatformAudit` da mesma operação; se não passar nada, o escritor usa
 * o `x-request-id`/`x-vercel-id` que já venha no pedido.
 */
export function newRequestId() {
  return randomUUID()
}

/**
 * Serialização canónica, só para comparar: a mesma ordem de chaves em
 * qualquer objecto, para que dois valores iguais comparem igual
 * independentemente da ordem em que o Postgres devolveu as colunas.
 */
function canonico(valor) {
  if (valor === undefined) return 'undefined'
  if (valor === null) return 'null'
  if (valor instanceof Date) return JSON.stringify(valor.toISOString())
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`
  if (typeof valor === 'object') {
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor)
}

/**
 * Só as chaves que mudaram (Task 3.4 Step 2). Uma alteração de plano grava
 * `plan_code` e `status` — não a linha inteira, que é o que torna o
 * «antes/depois» legível no ecrã da auditoria.
 *
 * Devolve `{ before, after }` já preparados para as duas colunas:
 *   • dois objectos → interseção das chaves com valor diferente;
 *   • só `after` (criação) → `before: null` e o objecto completo;
 *   • só `before` (remoção/desligar) → o objecto completo e `after: null`;
 *   • iguais → `{}` dos dois lados, que é a informação de que nada mudou.
 */
export function diffJson(before, after) {
  if (before == null && after == null) return { before: null, after: null }
  if (before == null) return { before: null, after: after ?? null }
  if (after == null) return { before: before ?? null, after: null }

  const antes = {}
  const depois = {}
  const chaves = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const chave of chaves) {
    if (canonico(before[chave]) === canonico(after[chave])) continue
    if (Object.hasOwn(before, chave)) antes[chave] = before[chave]
    if (Object.hasOwn(after, chave)) depois[chave] = after[chave]
  }
  return { before: antes, after: depois }
}

/**
 * `platform_audit_log.ip` é `inet`: um valor que o Postgres não aceite faz
 * falhar a INSERÇÃO — e com ela perder-se-ia a linha toda por causa de um
 * cabeçalho. Guarda-se `null` quando não parece um IP, em vez de arriscar
 * o registo.
 */
function normalizarIp(raw) {
  const valor = String(raw ?? '').trim()
  if (!valor || valor.length > 45) return null

  // IPv4, com a porta opcional que alguns proxies acrescentam («1.2.3.4:5678»).
  const v4 = valor.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d+)?$/)
  if (v4) {
    const octetos = v4.slice(1, 5)
    const valido = octetos.every((o) => Number(o) <= 255 && String(Number(o)) === o)
    return valido ? octetos.join('.') : null
  }

  // IPv6: só hex e ':', com pelo menos dois separadores. Verificar a forma
  // completa (e não apenas os caracteres) obrigaria a reescrever o
  // parser do Postgres; o que importa aqui é não lhe entregar lixo.
  if (/^[0-9a-f:]+$/i.test(valor) && valor.split(':').length >= 3) return valor

  return null
}

/** Chave estrangeira: ou é uuid, ou é nulo (o registo não se perde por isso). */
function uuidOuNulo(valor, campo) {
  if (valor == null || valor === '') return null
  const texto = String(valor)
  if (!UUID_RE.test(texto)) {
    logWarn('platform', `Trilha: ${campo} sem formato de uuid — registado sem ele`, {
      valor: texto,
    })
    return null
  }
  return texto
}

/** Cabeçalhos do pedido, quando existem. Fora de um pedido: tudo nulo. */
async function contextoDoPedido() {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    return {
      ip: normalizarIp(String(h.get('x-forwarded-for') || '').split(',')[0]),
      userAgent: h.get('user-agent') || null,
      requestId: h.get('x-request-id') || h.get('x-vercel-id') || null,
    }
  } catch {
    // Sem âmbito de pedido (script, cron, teste): a trilha continua, sem
    // os campos que dependem do pedido.
    return { ip: null, userAgent: null, requestId: null }
  }
}

/**
 * Registar uma acção da Equipa CF. Best-effort: devolve sempre um objecto,
 * nunca lança.
 *
 * @param {object}   entrada
 * @param {string}   entrada.action      — acção da matriz (`lib/platform/permissions.js`)
 * @param {string}   [entrada.table]     — tabela tocada (`platform_audit_log.table_name`)
 * @param {string}   [entrada.recordId]  — id do registo tocado (texto)
 * @param {string}   [entrada.pharmacyId]— farmácia visada (uuid)
 * @param {object}   [entrada.before]    — estado antes (só as chaves que interessam)
 * @param {object}   [entrada.after]     — estado depois (só as chaves que interessam)
 * @param {string}   [entrada.reason]    — motivo escrito por quem executa
 * @param {object}   [entrada.session]   — sessão de `requirePlatform` (actor + papel)
 * @param {string}   [entrada.requestId] — id da operação (`newRequestId()`)
 * @param {object}   [entrada.request]   — `{ ip, userAgent, requestId }` já lidos
 */
export async function logPlatformAudit({
  action,
  table = null,
  recordId = null,
  pharmacyId = null,
  before = null,
  after = null,
  reason = null,
  session = null,
  requestId = null,
  request = null,
} = {}) {
  try {
    if (!action || typeof action !== 'string') {
      logWarn('platform', 'Trilha ignorou um registo sem `action`', {
        table,
        recordId,
      })
      return { ok: false, error: 'SEM_ACAO' }
    }

    // A sessão vem de quem já a leu (`requirePlatform` devolve-a). Sem ela,
    // lê-se aqui — o actor em falta seria um registo sem dono.
    let sessao = session
    if (!sessao) {
      const { getPlatformSession } = await import('@/lib/platform/session')
      sessao = await getPlatformSession()
    }

    const info = request || (await contextoDoPedido())

    const motivo = reason == null ? '' : String(reason).trim()
    if (requiresMotivo(action) && !motivo) {
      // Não se recusa o registo (regra 2 do contrato) — mas uma acção
      // sensível sem motivo significa que alguém contornou
      // `requirePlatform`, e isso fica no log.
      logWarn('platform', 'Acção sensível registada sem motivo', { action })
    }

    const { before: antes, after: depois } = diffJson(before, after)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('platform_audit_log')
      .insert({
        actor_user_id: sessao?.user?.id ?? null,
        // O papel GRAVADO (não o normalizado): a trilha tem de dizer o que
        // estava na base quando a acção aconteceu.
        actor_role: sessao?.roleRaw ?? sessao?.profile?.role ?? null,
        actor_email: sessao?.user?.email ?? null,
        action,
        table_name: table,
        record_id: recordId == null ? null : String(recordId),
        pharmacy_id: uuidOuNulo(pharmacyId, 'pharmacyId'),
        reason: motivo || null,
        request_id: requestId || info.requestId || null,
        ip: info.ip ?? null,
        user_agent: info.userAgent ?? null,
        before: antes,
        after: depois,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      logError('platform', 'A trilha não registou a acção', {
        action,
        code: error.code,
        message: error.message,
      })
      return { ok: false, error: 'FALHA_NA_TRILHA', code: error.code }
    }

    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    logError('platform', 'A trilha não registou a acção', {
      action,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA_NA_TRILHA' }
  }
}
