import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError, logWarn } from '@/lib/log'

/**
 * Entrega de webhooks de stock (migração 0025, plano 2026-10-12).
 *
 * Este ficheiro é o lado APLICAÇÃO do dispatcher: assinatura, agenda de
 * tentativas, classificação de respostas e o laço que reserva entregas
 * da fila e as envia. O lado base de dados (fila, tentativas, fan-out)
 * vive na 0025.
 *
 * Assinatura — Standard Webhooks 1.0 (pesquisa de 2026-10-14):
 *   webhook-id:        <id da entrega>   (estável em todas as tentativas)
 *   webhook-timestamp: <unix segundos>   (novo em cada tentativa)
 *   webhook-signature: v1,<base64(HMAC-SHA256(segredo, id.timestamp.corpo))>
 *
 * O que se assina são os BYTES EXACTOS do corpo enviado: serializar o
 * JSON outra vez do lado de quem recebe muda espaços e a ordem das
 * chaves e a assinatura deixa de bater certo. Por isso o corpo é
 * `JSON.stringify(payload)` uma única vez e é o mesmo que vai no `body`.
 *
 * Porquê HMAC e não bcrypt/argon2 (como nas passwords): o segredo é
 * aleatório (32 bytes), não há dicionário que o adivinhe, e a
 * verificação é feita por quem recebe a cada pedido.
 *
 * Idempotência do receptor: `webhook-id` é o deduplicador. A entrega é
 * at-least-once por desenho (rede, timeouts) — repetir é normal, contar
 * duas vezes é que não.
 */

export const SECRET_PREFIX = 'whsec_'
export const SIGNATURE_VERSION = 'v1'
export const MAX_ATTEMPTS = 10
export const REQUEST_TIMEOUT_MS = 15_000
const RETRY_CAP_SECONDS = 86_400
const MIN_RETRY_SECONDS = 5

/**
 * Agenda de espera entre tentativas (exemplo da especificação, com
 * jitter na aplicação): 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 14 h,
 * 20 h, 24 h — 10 tentativas ao longo de ~75 h. Uma farmácia com a
 * internet em baixo ao fim de semana continua a receber o histórico
 * quando voltar.
 */
export const BACKOFF_SECONDS = [5, 300, 1800, 7200, 18_000, 36_000, 50_400, 72_000, 86_400]

/**
 * 4xx que não melhoram a repetir (pedido mal formado, credenciais,
 * endereço inexistente, método errado) e 3xx (não seguimos redirects:
 * um destino público pode apontar para dentro da rede). Ficam
 * 'falhado', visíveis no portal, com reenvio manual. O 408 (timeout do
 * servidor de destino) NÃO entra aqui: é transitório, repete-se. O 429
 * também repete, respeitando o Retry-After.
 */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405])

/** 410 Gone: o parceiro diz que o endereço acabou — desliga-se o destino. */
const GONE_STATUS = 410

// ---------------------------------------------------------------
// Segredo
// ---------------------------------------------------------------

/** Segredo novo: `whsec_` + 32 bytes (256 bits) em base64. */
export function generateWebhookSecret() {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64')}`
}

/**
 * Bytes do segredo. Aceita base64 e base64url (o `+`/`/` do base64
 * podem chegar trocados por `-`/`_` conforme por onde o segredo passou).
 * Devolve null se o segredo não for utilizável — nunca se assina com
 * lixo.
 */
export function secretKeyBytes(secret) {
  const raw = String(secret || '').trim()
  if (!raw) return null
  const body = raw.startsWith(SECRET_PREFIX) ? raw.slice(SECRET_PREFIX.length) : raw
  const base64 = body.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const buf = Buffer.from(base64, 'base64')
    return buf.length >= 16 ? buf : null
  } catch {
    return null
  }
}

/** Últimos 4 caracteres do segredo (dica na lista do portal). */
export function secretHint(secret) {
  const raw = String(secret || '').trim()
  return raw ? raw.slice(-4) : null
}

// ---------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------

/**
 * Assinatura `v1,<base64>` do texto `id.timestamp.corpo`.
 * Devolve null quando o segredo não serve (o chamador decide o que fazer:
 * aqui nunca se inventa uma assinatura vazia).
 */
export function signWebhook({ id, timestamp, body, secret }) {
  const key = secretKeyBytes(secret)
  if (!key) return null
  const signed = `${id}.${timestamp}.${body}`
  const mac = createHmac('sha256', key).update(signed, 'utf8').digest('base64')
  return `${SIGNATURE_VERSION},${mac}`
}

/** Verificação (tempo constante) — usada nos testes e por quem integra. */
export function verifyWebhookSignature({ id, timestamp, body, secret, header }) {
  const expected = signWebhook({ id, timestamp, body, secret })
  if (!expected || !header) return false
  const a = Buffer.from(String(expected))
  const b = Buffer.from(String(header).trim())
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Cabeçalhos de uma tentativa. */
export function webhookHeaders({ id, timestamp, signature, event, attempt }) {
  return {
    'content-type': 'application/json',
    'user-agent': 'ConhecaFarmacia-Webhooks/1.0',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': signature,
    'x-cf-event': event || 'stock.updated',
    'x-cf-attempt': String(attempt || 1),
  }
}

// ---------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------

/**
 * Segundos até à próxima tentativa. `attempt` é o número da tentativa
 * que acabou de falhar (1 = primeira). Jitter de ±20% para que uma
 * farmácia com vários eventos não crie rajadas sincronizadas.
 */
export function nextDelaySeconds(attempt, retryAfterSeconds = null) {
  const base =
    BACKOFF_SECONDS[Math.min(Math.max((attempt || 1) - 1, 0), BACKOFF_SECONDS.length - 1)] ||
    RETRY_CAP_SECONDS
  const jitter = base * (0.8 + Math.random() * 0.4)
  const honrar = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0
  const total = Math.max(base, jitter, honrar, MIN_RETRY_SECONDS)
  return Math.round(Math.min(total, RETRY_CAP_SECONDS))
}

/** `Retry-After` em segundos ou em data HTTP (as duas formas legais). */
export function parseRetryAfter(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (/^\d+$/.test(raw)) return Math.min(Number(raw), RETRY_CAP_SECONDS)
  const when = Date.parse(raw)
  if (Number.isNaN(when)) return null
  return Math.max(0, Math.min(Math.round((when - Date.now()) / 1000), RETRY_CAP_SECONDS))
}

/** O que fazer com a resposta (pesquisa 2026-10-14, tabela de estados). */
export function classifyResponse(status) {
  if (status >= 200 && status < 300) return { ok: true }
  if (status === GONE_STATUS) return { ok: false, permanent: true, disable: true }
  if (status >= 300 && status < 400) return { ok: false, permanent: true }
  if (PERMANENT_STATUS.has(status)) return { ok: false, permanent: true }
  return { ok: false, permanent: false }
}

// ---------------------------------------------------------------
// Destino seguro (OWASP SSRF)
// ---------------------------------------------------------------

/**
 * Em desenvolvimento é preciso apontar um destino para a própria
 * máquina (servidor de teste). Esta escotilha é explícita, só existe
 * fora de produção e nunca deve ser ligada a sério.
 */
function allowPrivateTargets() {
  return process.env.NODE_ENV !== 'production' && process.env.WEBHOOK_ALLOW_PRIVATE === '1'
}

/** IPv4 privado/especial? (RFC 1918 + link-local + cloud metadata + CGNAT + documentação.) */
function isPrivateIPv4(v) {
  const parts = v.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  return (
    a === 0 || // 0.0.0.0/8 — «este host»
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 — loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local / metadata de cloud
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0) || // 192.0.0.0/24 — IETF especiais (NAT64, …)
    (a === 192 && b === 2) || // 192.0.2.0/24 — documentação (TEST-NET-1)
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 — benchmark
    (a === 198 && b === 51 && parts[2] === 100) || // 198.51.100.0/24 — TEST-NET-2
    (a === 203 && b === 0 && parts[2] === 113) || // 203.0.113.0/24 — TEST-NET-3
    a >= 224 // multicast + reservados
  )
}

function isPrivateAddress(ip) {
  const v = String(ip || '')
  if (isIP(v) === 6) {
    const low = v.toLowerCase()
    // IPv4 mapeado (::ffff:a.b.c.d) — vale o IPv4 embutido, não o invólucro.
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    if (low === '::' || low === '::1') return true
    if (low.startsWith('fc') || low.startsWith('fd')) return true // fc00::/7 — unique local
    // fe80::/10 — link-local (fe80…febf: só os 10 primeiros bits contam).
    const first = parseInt(low.split(':')[0] || '0', 16)
    if (Number.isFinite(first) && (first & 0xffc0) === 0xfe80) return true
    if (low.startsWith('ff')) return true // ff00::/8 — multicast
    if (low.startsWith('64:ff9b:')) return true // NAT64 bem-conhecido
    return false
  }
  return isPrivateIPv4(v)
}

const BLOCKED_HOST_SUFFIX = [
  '.local',
  '.internal',
  '.localhost',
  '.home.arpa',
  '.lan',
  '.localdomain',
  '.corp',
]

/**
 * O endereço é entregável? Regras: https, sem credenciais embutidas,
 * FQDN público (nomes de uma só etiqueta resolvem por domínios de
 * pesquisa — quase sempre para dentro), A/AAAA todos públicos.
 *
 * Devolve { ok, ips } — os endereços VALIDADOS, para o POST ligar a
 * um deles em vez de resolver de novo (é isso que fecha o DNS
 * rebinding: entre esta validação e o POST o DNS pode mudar de
 * público para privado). { ok:false, error } quando não entrega.
 */
export async function checkDeliverableUrl(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || '').trim())
  } catch {
    return { ok: false, error: 'URL_INVALIDA' }
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'URL_INVALIDA' }
  if (url.username || url.password) return { ok: false, error: 'URL_INVALIDA' }
  if (url.href.length > 500) return { ok: false, error: 'URL_INVALIDA' }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (allowPrivateTargets()) {
    // Desenvolvimento: sem filtro, mas com os IPs resolvidos UMA vez —
    // o POST usa os mesmos (o rebinding também morde localmente).
    try {
      if (isIP(host)) return { ok: true, ips: [{ address: host, family: isIP(host) }] }
      const addresses = await lookup(host, { all: true })
      if (!addresses.length) return { ok: false, error: 'DNS_NAO_RESOLVE' }
      return { ok: true, ips: addresses }
    } catch {
      return { ok: false, error: 'DNS_NAO_RESOLVE' }
    }
  }

  if (host === 'localhost' || BLOCKED_HOST_SUFFIX.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'URL_PRIVADA' }
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) return { ok: false, error: 'URL_PRIVADA' }
    return { ok: true, ips: [{ address: host, family: isIP(host) }] }
  }
  // Nome de uma só etiqueta («http://intranet/»): resolve pelo domínio
  // de pesquisa da rede — para dentro, quase de certeza. Exige FQDN.
  if (!host.includes('.')) return { ok: false, error: 'URL_PRIVADA' }

  let addresses
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    return { ok: false, error: 'DNS_NAO_RESOLVE' }
  }
  if (!addresses.length) return { ok: false, error: 'DNS_NAO_RESOLVE' }
  if (addresses.some((a) => isPrivateAddress(a.address))) return { ok: false, error: 'URL_PRIVADA' }
  return { ok: true, ips: addresses }
}

// ---------------------------------------------------------------
// Uma tentativa
// ---------------------------------------------------------------

const LIMPAR = (text, max = 300) =>
  String(text || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max)

/**
 * POST HTTPS ligado ao IP VALIDADO (anti DNS-rebinding).
 *
 * O `fetch` global resolve o DNS outra vez no momento do POST — um
 * domínio que era público na validação pode ser privado nessa altura
 * (é o ataque). Aqui o socket abre-se para o IP que o
 * `checkDeliverableUrl` já aprovou (`lookup` fixo que só devolve esse
 * IP), enquanto o Host e o SNI seguem com os ORIGINAIS — o certificado
 * é verificado contra o nome do URL, não contra o IP.
 *
 * Sem redirects (o https não segue sozinho): um 3xx é lido como
 * resposta normal e classificado a seguir, como antes.
 * Devolve { status, headers, text } ou lança em erro de rede/timeout.
 */
function postPinnedHttps({ rawUrl, ip, family, headers, body, timeoutMs }) {
  const u = new URL(String(rawUrl))
  const port = u.port ? Number(u.port) : 443
  const hostHeader = u.port && u.port !== '443' ? `${u.hostname}:${u.port}` : u.hostname
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const done = (fn, arg) => {
      if (settled) return
      settled = true
      fn(arg)
    }
    let req
    try {
      req = httpsRequest(
        {
          hostname: ip,
          port,
          path: `${u.pathname || '/'}${u.search || ''}`,
          method: 'POST',
          headers: { ...headers, host: hostHeader },
          // SNI + verificação do certificado contra o nome original.
          servername: u.hostname,
          // DNS fixo: o hostname do URL nunca é resolvido aqui.
          lookup: (_host, _opts, cb) => cb(null, ip, family === 6 ? 6 : 4),
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            const rawHeaders = res.headers || {}
            done(resolvePromise, {
              status: res.statusCode || 0,
              headers: {
                get: (name) => {
                  const v = rawHeaders[String(name || '').toLowerCase()]
                  return Array.isArray(v) ? v[0] : (v ?? null)
                },
              },
              text: async () => Buffer.concat(chunks).toString('utf8'),
            })
          })
          res.on('error', (e) => done(rejectPromise, e))
        },
      )
    } catch (e) {
      done(rejectPromise, e)
      return
    }
    req.on('timeout', () => {
      const e = new Error(`sem resposta em ${Math.round(timeoutMs / 1000)} s`)
      e.name = 'TimeoutError'
      req.destroy(e)
    })
    req.on('error', (e) => done(rejectPromise, e))
    req.end(body)
  })
}

/**
 * Entrega UMA tentativa. Nunca lança: devolve sempre um resultado com
 * o que a fila precisa de saber (ok, estado, erro curto, retry_after).
 */
export async function deliverOnce({
  id,
  url,
  secret,
  payload,
  event,
  attempt = 1,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const started = Date.now()
  const check = await checkDeliverableUrl(url)
  if (!check.ok) {
    return { ok: false, status: null, error: check.error, durationMs: Date.now() - started }
  }

  // O corpo é serializado UMA vez: é este texto — e não uma segunda
  // serialização — que a assinatura cobre.
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signWebhook({ id, timestamp, body, secret })
  if (!signature) {
    return {
      ok: false,
      status: null,
      error: 'SEGREDO_EM_FALTA',
      durationMs: Date.now() - started,
    }
  }

  // Liga ao primeiro IP aprovado na validação — nunca resolve de novo.
  const peer = check.ips && check.ips[0]
  if (!peer) {
    return { ok: false, status: null, error: 'DNS_NAO_RESOLVE', durationMs: Date.now() - started }
  }

  try {
    const res = await postPinnedHttps({
      rawUrl: url,
      ip: peer.address,
      family: peer.family,
      headers: webhookHeaders({ id, timestamp, signature, event, attempt }),
      body,
      timeoutMs,
    })

    const cls = classifyResponse(res.status)
    const durationMs = Date.now() - started

    if (cls.ok) return { ok: true, status: res.status, durationMs }

    // Corpo da resposta só para o erro, curto e limpo (é texto de outro
    // servidor e vai ser mostrado no portal).
    let detail = ''
    try {
      detail = LIMPAR(await res.text(), 200)
    } catch {
      detail = ''
    }
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'))

    return {
      ok: false,
      status: res.status,
      error: detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`,
      durationMs,
      permanent: cls.permanent,
      disable: cls.disable,
      retryAfter,
    }
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return {
      ok: false,
      status: null,
      error: timeout ? `sem resposta em ${Math.round(timeoutMs / 1000)} s` : LIMPAR(e?.message),
      durationMs: Date.now() - started,
    }
  }
}

// ---------------------------------------------------------------
// Laço do worker
// ---------------------------------------------------------------

/**
 * Reserva as entregas que já passaram da hora e envia-as uma a uma.
 * Devolve um resumo (o que a rota /api/cron/webhooks responde e o que
 * os logs registam). Nunca lança: uma entrega má não pode parar a fila.
 */
export async function drainDue({ limit = 20, worker = 'cron' } = {}) {
  const started = Date.now()
  const resumo = { ok: true, worker, claimed: 0, delivered: 0, failed: 0, results: [] }
  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    logError('webhooks', 'Sem cliente service-role para entregar', { message: e?.message })
    return { ...resumo, ok: false, error: 'SEM_ADMIN' }
  }

  let fila = []
  try {
    const { data, error } = await admin.rpc('webhook_claim_due', {
      p_limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
      p_worker: String(worker).slice(0, 60),
    })
    if (error) throw error
    fila = data || []
  } catch (e) {
    logError('webhooks', 'Falha ao reservar entregas', { message: e?.message, code: e?.code })
    return { ...resumo, ok: false, error: 'FALHA_FILA' }
  }

  resumo.claimed = fila.length

  for (const d of fila) {
    const attempt = (d.attempts || 0) + 1
    let result
    try {
      result = await deliverOnce({
        id: d.delivery_id,
        url: d.url,
        secret: d.secret,
        payload: d.payload,
        event: d.event,
        attempt,
      })
    } catch (e) {
      // Blindagem final: nem um bug aqui pode deixar a entrega reservada.
      result = { ok: false, status: null, error: LIMPAR(e?.message), durationMs: 0 }
    }

    const retrySeconds = result.ok ? null : nextDelaySeconds(attempt, result.retryAfter)

    try {
      await admin.rpc('webhook_record_attempt', {
        p_delivery_id: d.delivery_id,
        p_status_code: result.status ?? null,
        p_error: result.error ?? null,
        p_duration_ms: result.durationMs ?? null,
        p_ok: !!result.ok,
        p_retry_seconds: retrySeconds,
        p_permanent: !!result.permanent,
        p_disable: !!result.disable,
        p_disable_reason: result.disable ? 'o destino respondeu 410 Gone' : null,
      })
    } catch (e) {
      logError('webhooks', 'Falha ao registar a tentativa', {
        entrega: d.delivery_id,
        message: e?.message,
      })
    }

    if (result.ok) resumo.delivered += 1
    else resumo.failed += 1

    resumo.results.push({
      id: d.delivery_id,
      event: d.event,
      attempt,
      ok: !!result.ok,
      status: result.status ?? null,
      error: result.error ?? null,
      permanent: !!result.permanent,
      next_in_seconds: retrySeconds,
      url: d.url,
    })
  }

  resumo.ms = Date.now() - started

  if (resumo.delivered || resumo.failed) {
    logWarn('webhooks', 'Entregas processadas', {
      worker,
      entregues: resumo.delivered,
      falhadas: resumo.failed,
      ms: resumo.ms,
    })
  }
  return resumo
}

/** Retenção: chamado pelo worker uma vez por execução (barato). */
export async function pruneDeliveries(days = 30) {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('webhook_prune', { p_days: days })
    if (error) throw error
    return data || 0
  } catch (e) {
    logError('webhooks', 'Falha ao limpar entregas antigas', { message: e?.message })
    return 0
  }
}

/** Cabeçalhos + corpo de exemplo, para o portal mostrar o que sai. */
export function sampleDelivery({ id, event, payload, secret, timestamp }) {
  const body = JSON.stringify(payload)
  const ts = timestamp || Math.floor(Date.now() / 1000)
  const signature =
    signWebhook({ id, timestamp: ts, body, secret }) || `${SIGNATURE_VERSION},<sem segredo>`
  return {
    body,
    timestamp: ts,
    signature,
    headers: webhookHeaders({ id, timestamp: ts, signature, event, attempt: 1 }),
  }
}
