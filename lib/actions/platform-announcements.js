'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { can } from '@/lib/platform/permissions'
import { TONE_LABELS, TONES } from '@/lib/announcement-constants'
import { logError } from '@/lib/log'

/**
 * Avisos da Equipa Conheça Farmácia — lado INTERNO (migração 0032).
 *
 * A equipa publica uma mensagem para uma farmácia ou para todas, e pode
 * retirá-la do portal. A autorização é a matriz (`announcement.publish` /
 * `announcement.archive`: superadmin, onboarding e suporte, com motivo).
 * Nada se apaga: arquivar é `archived_at`, e os recibos de leitura ficam —
 * a equipa continua a saber o que enviou e quem abriu.
 *
 * A escrita é service-role (a RLS da 0032 não dá INSERT a authenticated) e
 * a trilha leva o conteúdo, o alvo e o motivo. Se a trilha falhar, o aviso
 * continua publicado — a resposta leva `auditado: false` e o ecrã avisa,
 * em vez de dizer que ficou tudo registado.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TITULO = 120
const MAX_CORPO = 4000
const MAX_DIAS = 365

function texto(valor) {
  return String(valor ?? '').trim()
}

function meta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}

function falha(mensagem, err) {
  logError('avisos', mensagem, meta(err))
  return { ok: false, error: 'FALHA' }
}

function maisDias(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Tudo o que o ecrã `/interno/avisos` mostra: os avisos (activos,
 * expirados e arquivados), as farmácias para o seletor de destino e as
 * contagens de leitura.
 *
 * Leitura com `requirePlatformRead`: ver a lista não exige MFA nem motivo;
 * as duas acções que escrevem é que os exigem.
 */
export async function getAnnouncementsAdmin() {
  const g = await requirePlatformRead('announcement.publish')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()
    const [avisosRes, farmaciasRes, leiturasRes] = await Promise.all([
      admin
        .from('pharmacy_announcements')
        .select(
          'id, pharmacy_id, title, body, tone, published_at, expires_at, archived_at, published_by',
        )
        .order('published_at', { ascending: false })
        .limit(120),
      admin.from('pharmacies').select('id, name, active').order('name'),
      admin.from('pharmacy_announcement_reads').select('announcement_id, pharmacy_id'),
    ])

    if (avisosRes.error) throw avisosRes.error
    if (farmaciasRes.error) throw farmaciasRes.error
    if (leiturasRes.error) throw leiturasRes.error

    const farmacias = farmaciasRes.data || []
    const nomePorId = new Map(farmacias.map((f) => [f.id, f.name]))
    const lidasPorAviso = new Map()
    for (const leitura of leiturasRes.data || []) {
      lidasPorAviso.set(
        leitura.announcement_id,
        (lidasPorAviso.get(leitura.announcement_id) || 0) + 1,
      )
    }

    const agora = Date.now()
    const rows = (avisosRes.data || []).map((a) => {
      const expirado = a.expires_at != null && new Date(a.expires_at).getTime() <= agora
      const arquivado = a.archived_at != null
      return {
        id: a.id,
        titulo: a.title,
        corpo: a.body,
        tom: TONES.includes(a.tone) ? a.tone : 'info',
        tomLabel: TONE_LABELS[a.tone] || TONE_LABELS.info,
        publicadaEm: a.published_at,
        expiraEm: a.expires_at,
        arquivadaEm: a.archived_at,
        universal: a.pharmacy_id === null,
        farmaciaId: a.pharmacy_id,
        farmaciaNome: a.pharmacy_id ? nomePorId.get(a.pharmacy_id) || null : null,
        estado: arquivado ? 'arquivado' : expirado ? 'expirado' : 'activo',
        lidas: lidasPorAviso.get(a.id) || 0,
        // Uma mensagem para todas chega a todas as farmácias da base;
        // uma dirigida a uma farmácia tem um destinatário só.
        destinatarios: a.pharmacy_id ? 1 : farmacias.length,
      }
    })

    return {
      ok: true,
      rows,
      farmacias: farmacias.map((f) => ({ id: f.id, nome: f.name, activa: f.active })),
      podePublicar: can(g.session.role, 'announcement.publish'),
      podeArquivar: can(g.session.role, 'announcement.archive'),
    }
  } catch (err) {
    return falha('Falha ao listar os avisos', err)
  }
}

/**
 * Publicar um aviso (`announcement.publish`).
 *
 * `pharmacyId` vazio/`null` = TODAS as farmácias (`pharmacy_id` nulo). O
 * prazo (`dias`) é opcional: um aviso sem prazo fica até a equipa o
 * arquivar; com prazo, a RLS deixa de o mostrar no fim, sem ninguém ter de
 * se lembrar de o retirar.
 */
export async function publishAnnouncement({
  pharmacyId,
  title,
  body,
  tone = 'info',
  dias,
  motivo,
} = {}) {
  const g = await requirePlatform('announcement.publish', { reason: motivo })
  if (!g.ok) return g

  const titulo = texto(title)
  const corpo = String(body ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const tom = texto(tone) || 'info'
  const alvo = texto(pharmacyId)

  if (titulo.length < 3 || titulo.length > MAX_TITULO)
    return { ok: false, error: 'TITULO_INVALIDO' }
  if (corpo.length < 1 || corpo.length > MAX_CORPO) return { ok: false, error: 'CORPO_INVALIDO' }
  if (!TONES.includes(tom)) return { ok: false, error: 'TOM_INVALIDO' }
  if (alvo && !UUID_RE.test(alvo)) return { ok: false, error: 'ID_INVALIDO' }

  let diasFinal = null
  if (dias !== undefined && dias !== null && dias !== '') {
    const n = Number(dias)
    if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS) return { ok: false, error: 'PRAZO_INVALIDO' }
    diasFinal = n
  }

  try {
    const admin = createAdminClient()
    let farmacia = null
    if (alvo) {
      const { data, error } = await admin
        .from('pharmacies')
        .select('id, name')
        .eq('id', alvo)
        .maybeSingle()
      if (error) throw error
      if (!data) return { ok: false, error: 'NAO_ENCONTRADA' }
      farmacia = data
    }

    const publicadoEm = new Date().toISOString()
    const { data, error } = await admin
      .from('pharmacy_announcements')
      .insert({
        pharmacy_id: farmacia?.id || null,
        title: titulo,
        body: corpo,
        tone: tom,
        published_at: publicadoEm,
        expires_at: diasFinal ? maisDias(diasFinal) : null,
        published_by: g.session.user?.id || null,
      })
      .select('id, pharmacy_id, title, tone, published_at, expires_at')
      .maybeSingle()

    if (error) throw error
    if (!data) return { ok: false, error: 'SEM_EFEITO' }

    const registo = await logPlatformAudit({
      action: 'announcement.publish',
      table: 'pharmacy_announcements',
      recordId: data.id,
      pharmacyId: farmacia?.id || null,
      before: null,
      after: {
        titulo,
        corpo,
        tom,
        alvo: farmacia?.name || 'Todas as farmácias',
        expira_em: data.expires_at,
      },
      reason: motivo,
      session: g.session,
      requestId: newRequestId(),
    })

    // O layout do portal tem o sino: revalidar o layout inteiro faz o
    // número novo aparecer na próxima página, sem esperar por um deploy.
    revalidatePath('/interno/avisos')
    revalidatePath('/portal', 'layout')
    revalidatePath('/portal/avisos')

    return {
      ok: true,
      id: data.id,
      alvo: farmacia?.name || 'Todas as farmácias',
      auditado: registo.ok,
    }
  } catch (err) {
    return falha('Falha ao publicar o aviso', err)
  }
}

/**
 * Retirar um aviso do portal (`announcement.archive`). Não apaga: a linha,
 * o conteúdo e os recibos ficam para consulta, e o aviso deixa de aparecer
 * à farmácia pela RLS (não só pela UI).
 */
export async function archiveAnnouncement({ id, motivo } = {}) {
  const g = await requirePlatform('announcement.archive', { reason: motivo })
  if (!g.ok) return g

  const avisoId = texto(id)
  if (!UUID_RE.test(avisoId)) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const { data: antes, error: erroLeitura } = await admin
      .from('pharmacy_announcements')
      .select('id, pharmacy_id, title, archived_at')
      .eq('id', avisoId)
      .maybeSingle()
    if (erroLeitura) throw erroLeitura
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADO' }
    if (antes.archived_at) return { ok: true, mudou: false }

    const { data: depois, error } = await admin
      .from('pharmacy_announcements')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: g.session.user?.id || null,
      })
      .eq('id', avisoId)
      .is('archived_at', null)
      .select('id, pharmacy_id, title, archived_at')
      .maybeSingle()
    if (error) throw error
    if (!depois) {
      // Outra pessoa arquivou entre a leitura e a escrita: o resultado é o
      // pedido, e não um erro — mas não se grava uma segunda linha falsa
      // na trilha.
      return { ok: true, mudou: false }
    }

    const registo = await logPlatformAudit({
      action: 'announcement.archive',
      table: 'pharmacy_announcements',
      recordId: avisoId,
      pharmacyId: antes.pharmacy_id,
      before: { arquivado: false, titulo: antes.title },
      after: { arquivado: true, titulo: antes.title },
      reason: motivo,
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath('/interno/avisos')
    revalidatePath('/portal', 'layout')
    revalidatePath('/portal/avisos')

    return { ok: true, mudou: true, auditado: registo.ok }
  } catch (err) {
    return falha('Falha ao arquivar o aviso', err)
  }
}
