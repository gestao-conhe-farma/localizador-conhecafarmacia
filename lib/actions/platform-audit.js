'use server'

import { createServerComponentClient } from '@/lib/supabase/server'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { ACTIONS, can, describeAction, PLATFORM_ROLES } from '@/lib/platform/permissions'
import { paraCsv } from '@/lib/audit-csv'
import { logError } from '@/lib/log'

/**
 * ECRÃ DE AUDITORIA (Phase 8 do plano
 * docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * Duas operações, dois guardas diferentes e de propósito:
 *
 *   • LER a trilha é `audit.read` sem MFA nem motivo (`requirePlatformRead`):
 *     consultar o que já está gravado não altera nada. Fechar a leitura atrás
 *     do segundo factor deixava o nível `auditoria` — que existe para revisir
 *     — a inscrição de TOTP como pré-condição para trabalhar;
 *   • EXPORTAR é `audit.export`, com MFA e motivo, e **falha fechada**: se a
 *     própria linha `audit.export` não ficar na trilha, o CSV não sai. É a
 *     única acção do projecto em que a auditoria é condição da operação em
 *     vez de ser best-effort, e a razão é simples — uma exportação sem rasto
 *     é exactamente o que esta trilha existe para impedir.
 *
 * A trilha é append-only e cresce para sempre, por isso a leitura é paginada
 * por CURSOR em `(created_at, id)` e não por `offset`: com `offset`, uma linha
 * nova a entrar entre dois pedidos empurra tudo e a página seguinte repete um
 * registo que a pessoa já leu. O par é preciso porque `created_at` sozinho
 * empata (duas acções no mesmo milissegundo) e `id` sozinho só coincide com a
 * data enquanto ninguém escrever uma linha com data recuada: a data é a
 * verdade que o ecrã mostra, o id desempata.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Linhas por página do ecrã. */
const PAGINA = 40
/** Tecto do export: acima disto pede-se um filtro, não um ficheiro maior. */
const MAX_EXPORT = 5000
/** Tamanho do lote do export (o máximo de linhas por pedido no PostgREST). */
const LOTE_EXPORT = 1000

const COLS =
  'id, created_at, actor_email, actor_role, action, table_name, record_id, pharmacy_id, reason, request_id, ip, user_agent, before, after, pharmacies ( name )'

function texto(valor, limite) {
  const t = String(valor ?? '').trim()
  return limite ? t.slice(0, limite) : t
}

function falha(mensagem, err) {
  logError('platform', mensagem, { message: err?.message || String(err), code: err?.code })
  return { ok: false, error: 'FALHA' }
}

/**
 * Meia-noite em Luanda para um `YYYY-MM-DD` (o fuso é +01:00 todo o ano, não
 * há hora de Verão). `fim` devolve o dia SEGUINTE, para o `ate` ser
 * inclusivo — «até 17/10» inclui o que aconteceu às 23h de 17/10.
 */
function meiaNoite(dia, fim = false) {
  if (!DIA_RE.test(dia)) return null
  const d = new Date(`${dia}T00:00:00+01:00`)
  if (Number.isNaN(d.getTime())) return null
  if (fim) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

/**
 * Cursor da página: `"<created_at>~<id>"`. Fora de forma → `null` (a página
 * começa do mais recente, não rebenta). O `+` do fuso viaja codificado no
 * URL pelo `URLSearchParams` e chega aqui já descodificado.
 */
function lerCursor(raw) {
  const s = texto(raw, 64)
  const m = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+[+-]\d{2}:\d{2})~(\d{1,15})$/.exec(s)
  if (!m) return null
  const id = Number(m[2])
  return Number.isSafeInteger(id) && id > 0 ? { quando: m[1], id } : null
}

/**
 * `created_at < cursor.quando OR (created_at = cursor.quando AND id < cursor.id)`
 * — o «antes» do par, na mesma ordem em que a página está ordenada.
 */
function comCursor(query, cursor) {
  if (!cursor) return query
  return query.or(
    `created_at.lt."${cursor.quando}",and(created_at.eq."${cursor.quando}",id.lt.${cursor.id})`,
  )
}

/**
 * Só valores que a base reconhece passam. Um filtro inválido não é erro (o
 * ecrã não deve explodir por causa de um URL editado à mão): simplesmente não
 * filtra — a mesma regra da lista de farmácias.
 */
function normalizarFiltros(input = {}) {
  const acao = texto(input.acao, 80)
  const nivel = texto(input.nivel, 40)
  const farmacia = texto(input.farmacia, 40)
  const actor = texto(input.actor, 120).replace(/[^a-zA-Z0-9@._+\-]/g, '')
  const de = texto(input.de, 10)
  const ate = texto(input.ate, 10)

  return {
    acao: Object.hasOwn(ACTIONS, acao) ? acao : '',
    nivel: nivel === 'admin' || PLATFORM_ROLES.includes(nivel) ? nivel : '',
    farmacia: UUID_RE.test(farmacia) ? farmacia : '',
    actor,
    de: DIA_RE.test(de) && meiaNoite(de) ? de : '',
    ate: DIA_RE.test(ate) && meiaNoite(ate) ? ate : '',
  }
}

/** Aplica os filtros a uma query da trilha (o `select` já vem de fora). */
function comFiltros(query, filtros) {
  let q = query
  if (filtros.acao) q = q.eq('action', filtros.acao)
  if (filtros.nivel) q = q.eq('actor_role', filtros.nivel)
  if (filtros.farmacia) q = q.eq('pharmacy_id', filtros.farmacia)
  if (filtros.actor) q = q.ilike('actor_email', `%${filtros.actor}%`)
  if (filtros.de) q = q.gte('created_at', meiaNoite(filtros.de))
  if (filtros.ate) q = q.lt('created_at', meiaNoite(filtros.ate, true))
  return q
}

function linha(r) {
  return {
    id: Number(r.id),
    quando: r.created_at,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
    action: r.action,
    acaoRotulo: describeAction(r.action),
    table: r.table_name,
    recordId: r.record_id,
    // A farmácia pode ter sido apagada (FK `on delete set null`): a trilha
    // guarda o registo, não o nome. O ecrã mostra o que houver.
    pharmacyId: r.pharmacy_id,
    farmacia: r.pharmacies?.name || null,
    reason: r.reason,
    requestId: r.request_id,
    ip: r.ip,
    userAgent: r.user_agent,
    before: r.before,
    after: r.after,
  }
}

// ===============================================================
// Leitura (o ecrã)
// ===============================================================

/**
 * Uma página da trilha, do mais recente para o mais antigo.
 *
 * LEITURA COM O CLIENTE DA SESSÃO, não com service-role: a trilha passa
 * pelas policies como qualquer outra tabela — `platform_audit_log read high
 * levels` (superadmin/auditoria) mais a restritiva `aal2` da 0052. O
 * service-role já não a contorna; sem segundo factor confirmado, a leitura
 * é recusada aqui, com `MFA_NECESSARIO` para o ecrã explicar o que falta.
 *
 * O `total` é do conjunto FILTRADO (é o que o cabeçalho mostra), e vem do
 * `count` do mesmo pedido; a página em si leva `PAGINA + 1` linhas para saber
 * se há mais sem uma segunda consulta.
 */
export async function getAuditLog(input = {}) {
  const g = await requirePlatformRead('audit.read')
  if (!g.ok) return g

  // SEC-ATH-06: a trilha diz quem fez o quê e com que dados — é o registo que
  // uma sessão roubada mais quer ler. Só se lê com `aal2`.
  if (g.session.mfa?.currentLevel !== 'aal2') {
    return { ok: false, error: 'MFA_NECESSARIO', acao: describeAction('audit.read') }
  }

  const filtros = normalizarFiltros(input)
  const cursor = lerCursor(input.cursor)

  try {
    const supabase = await createServerComponentClient()
    const pagina = comCursor(
      comFiltros(supabase.from('platform_audit_log').select(COLS, { count: 'exact' }), filtros),
      cursor,
    )

    const [paginaRes, farmaciasRes] = await Promise.all([
      pagina
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGINA + 1),
      supabase.from('pharmacies').select('id, name').order('name'),
    ])
    if (paginaRes.error) throw paginaRes.error
    if (farmaciasRes.error) throw farmaciasRes.error

    const todas = paginaRes.data || []
    const temMais = todas.length > PAGINA
    const rows = todas.slice(0, PAGINA).map(linha)
    const ultima = rows[rows.length - 1]

    return {
      ok: true,
      rows,
      total: paginaRes.count ?? rows.length,
      temMais,
      proximoCursor: temMais && ultima ? `${ultima.quando}~${ultima.id}` : null,
      filtros,
      filtroActivo: Object.values(filtros).some(Boolean),
      // Catálogo dos filtros: as acções vêm da MATRIZ, não de uma lista à
      // parte — uma acção nova aparece aqui no dia em que nasce.
      acoes: Object.entries(ACTIONS).map(([chave, info]) => ({
        chave,
        rotulo: info.label,
      })),
      farmacias: (farmaciasRes.data || []).map((f) => ({ id: f.id, nome: f.name })),
      podeExportar: can(g.session.role, 'audit.export'),
      mfa2: g.session.mfa?.currentLevel === 'aal2',
    }
  } catch (err) {
    return falha('Falha ao ler a trilha de auditoria', err)
  }
}

// ===============================================================
// Exportação (auditada)
// ===============================================================

/**
 * Lê o conjunto filtrado em LOTES, por cursor (`id`), até ao tecto.
 *
 * Offset aqui era pior do que no ecrã: um export de 5.000 linhas em cinco
 * pedidos, com uma linha nova a entrar pelo meio, repetia uma linha em cada
 * pedido seguinte. Com `id < último_lido` cada linha sai uma vez.
 */
async function lerParaExport(client, filtros) {
  const rows = []
  let cursor = null
  while (rows.length < MAX_EXPORT) {
    const q = comCursor(comFiltros(client.from('platform_audit_log').select(COLS), filtros), cursor)
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(Math.min(LOTE_EXPORT, MAX_EXPORT - rows.length))
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    const ultima = data[data.length - 1]
    cursor = { quando: ultima.created_at, id: Number(ultima.id) }
    if (data.length < LOTE_EXPORT) break
  }
  return rows
}

/**
 * CSV da trilha, com o PRÓPRIO export registado antes de sair.
 *
 * `after` leva os filtros aplicados e o número de linhas: quem lê a trilha
 * seis meses depois consegue reconstruir o que foi levado sem ter o ficheiro.
 * Se a escrita falhar, devolve `TRILHA_FALHOU` e **não** devolve CSV — é a
 * única falha fechada do módulo (ver o comentário do topo).
 */
export async function exportAuditCsv(input = {}) {
  const g = await requirePlatform('audit.export', { reason: input.motivo })
  if (!g.ok) return g

  const filtros = normalizarFiltros(input)

  try {
    // Também com a sessão (a acção já exige `aal2` e motivo pela matriz):
    // exportar lê a mesma trilha que o ecrã.
    const supabase = await createServerComponentClient()
    const brutas = await lerParaExport(supabase, filtros)
    const truncado = brutas.length >= MAX_EXPORT
    const rows = brutas.map(linha)
    const csv = paraCsv(rows)

    const requestId = newRequestId()
    const registo = await logPlatformAudit({
      action: 'audit.export',
      table: 'platform_audit_log',
      before: null,
      after: {
        formato: 'csv',
        filtros,
        linhas: rows.length,
        // O tecto é informação da operação: um export parcial tem de se
        // distinguir de um export completo quando for lido na trilha.
        truncado,
        limite: MAX_EXPORT,
      },
      reason: texto(input.motivo, 400),
      session: g.session,
      requestId,
    })
    if (!registo.ok) {
      logError('platform', 'Export da trilha abortado: não ficou registado', {
        linhas: rows.length,
        code: registo.code || registo.error,
      })
      return { ok: false, error: 'TRILHA_FALHOU' }
    }

    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Luanda' })
    return {
      ok: true,
      csv,
      filename: `trilha-auditoria-${dia}${truncado ? '-parcial' : ''}.csv`,
      linhas: rows.length,
      truncado,
      limite: MAX_EXPORT,
      registoId: registo.id,
    }
  } catch (err) {
    return falha('Falha ao exportar a trilha de auditoria', err)
  }
}
