import { createServerComponentClient } from '@/lib/supabase/server'
import { logWarn } from '@/lib/log'
import { TONES } from '@/lib/announcement-constants'

/**
 * Avisos da Equipa Conheça Farmácia no portal (migração 0032).
 *
 * A leitura é feita com o cliente da SESSÃO, e não com service-role: a RLS
 * da 0032 já limita a farmácia aos avisos dirigidos a ela (os seus + os de
 * todos), dentro do prazo e não arquivados. Um filtro a mais aqui seria
 * uma segunda regra para manter em dia; o que fica é só a ordenação e a
 * junção com os recibos de leitura.
 *
 * `unreadAnnouncementCount` é usado no layout (sino) e na sidebar — as
 * duas leituras passam por aqui para o número nunca divergir.
 */

const COLUNAS = 'id, pharmacy_id, title, body, tone, published_at, expires_at'

function alvoDaFarmacia(pharmacyId) {
  return `pharmacy_id.eq.${pharmacyId},pharmacy_id.is.null`
}

function dentroDoPrazo() {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
}

/**
 * Avisos que a farmácia vê hoje, do mais recente para o mais antigo, com
 * `lido` calculado a partir dos recibos da farmácia (não da pessoa — o
 * sino é da farmácia, como o balcão).
 *
 * Nunca lança: uma tabela por aplicar ou uma leitura falhada resolve para
 * `{ ok: false, rows: [] }`, e a página diz que não conseguiu carregar em
 * vez de rebentar o portal.
 */
export async function listPharmacyAnnouncements(pharmacyId, { limit = 80 } = {}) {
  if (!pharmacyId) return { ok: false, rows: [] }

  try {
    const supabase = await createServerComponentClient()
    const { data: anuncios, error } = await supabase
      .from('pharmacy_announcements')
      .select(COLUNAS)
      .or(alvoDaFarmacia(pharmacyId))
      .or(dentroDoPrazo())
      .order('published_at', { ascending: false })
      .limit(limit)

    if (error) {
      logWarn('avisos', 'Avisos da farmácia ilegíveis', {
        pharmacyId,
        code: error.code,
        message: error.message,
      })
      return { ok: false, rows: [] }
    }
    if (!anuncios?.length) return { ok: true, rows: [] }

    const { data: lidos, error: erroLidos } = await supabase
      .from('pharmacy_announcement_reads')
      .select('announcement_id')
      .eq('pharmacy_id', pharmacyId)
      .in(
        'announcement_id',
        anuncios.map((a) => a.id),
      )

    // Uma falha a ler recibos não esconde os avisos: mostra-os como não
    // lidos (o pior caso é o sino ficar com um número a mais, nunca um
    // aviso que não aparece).
    if (erroLidos) {
      logWarn('avisos', 'Recibos de leitura ilegíveis', {
        pharmacyId,
        code: erroLidos.code,
        message: erroLidos.message,
      })
    }
    const lidosSet = new Set((lidos || []).map((r) => r.announcement_id))

    return {
      ok: true,
      rows: anuncios.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        tone: TONES.includes(a.tone) ? a.tone : 'info',
        publishedAt: a.published_at,
        expiresAt: a.expires_at,
        universal: a.pharmacy_id === null,
        lido: lidosSet.has(a.id),
      })),
    }
  } catch (err) {
    logWarn('avisos', 'Falha ao ler os avisos da farmácia', {
      pharmacyId,
      message: err?.message || String(err),
    })
    return { ok: false, rows: [] }
  }
}

/**
 * Quantos avisos a farmácia ainda não abriu. Devolve 0 em qualquer falha:
 * um sino sem número é melhor do que um portal que não abre.
 */
export async function unreadAnnouncementCount(pharmacyId) {
  if (!pharmacyId) return 0

  try {
    const supabase = await createServerComponentClient()
    const { data: anuncios, error } = await supabase
      .from('pharmacy_announcements')
      .select('id')
      .or(alvoDaFarmacia(pharmacyId))
      .or(dentroDoPrazo())

    if (error || !anuncios?.length) {
      if (error) {
        logWarn('avisos', 'Contagem de avisos ilegível', {
          pharmacyId,
          code: error.code,
          message: error.message,
        })
      }
      return 0
    }

    const { data: lidos, error: erroLidos } = await supabase
      .from('pharmacy_announcement_reads')
      .select('announcement_id')
      .eq('pharmacy_id', pharmacyId)
      .in(
        'announcement_id',
        anuncios.map((a) => a.id),
      )

    if (erroLidos) {
      logWarn('avisos', 'Recibos de leitura ilegíveis na contagem', {
        pharmacyId,
        code: erroLidos.code,
        message: erroLidos.message,
      })
      return anuncios.length
    }

    const lidosSet = new Set((lidos || []).map((r) => r.announcement_id))
    return anuncios.reduce((n, a) => (lidosSet.has(a.id) ? n : n + 1), 0)
  } catch (err) {
    logWarn('avisos', 'Falha ao contar os avisos', {
      pharmacyId,
      message: err?.message || String(err),
    })
    return 0
  }
}
