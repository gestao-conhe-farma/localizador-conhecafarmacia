'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { can } from '@/lib/platform/permissions'
import { logError } from '@/lib/log'

/**
 * Catálogo de imagens por marca (0040) — lado INTERNO.
 *
 * A chave é (drug_id, brand_key): o medicamento sozinho não chega. A
 * normalização da marca acontece em SQL (`brand_key`/`upsert_brand_image`);
 * este módulo só envia o rótulo como a pessoa o escreveu.
 *
 * Porque service role: a tabela não tem policies de escrita — a equipa é o
 * único escritor, tal como na trilha de auditoria. A leitura pública das
 * imagens publicadas é feita pela policy de SELECT (0040).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024

function texto(valor) {
  return String(valor ?? '').trim()
}

function meta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}

function falha(mensagem, err) {
  logError('catalogo', mensagem, meta(err))
  return { ok: false, error: 'FALHA' }
}

function imageUrl(path) {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return base ? `${base}/storage/v1/object/public/drug-images/${path}` : null
}

function revalidarPublico() {
  revalidatePath('/pesquisa')
  revalidatePath('/farmacia')
  revalidatePath('/produto')
}

/**
 * Cobertura para o ecrã `/interno/catalogo`: as marcas que as farmácias
 * realmente usam, com a imagem (ou a falta dela). Sem imagem primeiro e,
 * dentro dessas, as que chegam a mais farmácias — é a lista de compras de
 * quem vai fotografar caixas.
 */
export async function getCatalogueCoverage() {
  const g = await requirePlatformRead('catalogue.view')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('brand_image_coverage')
      .select(
        'drug_id, drug_name, brand_key, brand_label, stock_items, pharmacies, last_confirmed, image_id, image_path, status',
      )
      .order('image_path', { ascending: true, nullsFirst: true })
      .order('pharmacies', { ascending: false })
      .order('stock_items', { ascending: false })
      .limit(400)
    if (error) throw error

    const rows = (data || []).map((r) => ({
      drugId: r.drug_id,
      drugName: r.drug_name,
      brandKey: r.brand_key,
      brandLabel: r.brand_label,
      stockItems: Number(r.stock_items) || 0,
      pharmacies: Number(r.pharmacies) || 0,
      lastConfirmed: r.last_confirmed,
      imageId: r.image_id,
      imageUrl: imageUrl(r.image_path),
      status: r.image_id ? r.status : 'sem_imagem',
    }))

    const comImagem = rows.filter((r) => r.imageId).length
    return {
      ok: true,
      rows,
      podeGerir: can(g.session.role, 'catalogue.manage'),
      totais: {
        marcas: rows.length,
        comImagem,
        semImagem: rows.length - comImagem,
        farmacias: rows.reduce((soma, r) => soma + r.pharmacies, 0),
      },
    }
  } catch (err) {
    return falha('Falha ao ler a cobertura do catálogo', err)
  }
}

/**
 * Carregar/substituir a imagem de uma marca. O ficheiro já chega comprimido
 * do browser (`compressDrugImage`); aqui valida-se de novo — o cliente não
 * é autoridade sobre tipo nem tamanho.
 */
export async function uploadBrandImage({ drugId, brandLabel, file, sourceNote } = {}) {
  const g = await requirePlatform('catalogue.manage')
  if (!g.ok) return g

  if (typeof drugId !== 'string' || !UUID_RE.test(drugId)) {
    return { ok: false, error: 'ID_INVALIDO' }
  }
  const marca = texto(brandLabel).slice(0, 80)
  if (marca.length < 1) return { ok: false, error: 'MARCA_INVALIDA' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'FICHEIRO_INVALIDO' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'FICHEIRO_GRANDE' }
  if (!OK_TYPES.has(file.type)) return { ok: false, error: 'TIPO_INVALIDO' }

  try {
    const admin = createAdminClient()
    const bytes = Buffer.from(await file.arrayBuffer())
    const sha = createHash('sha256').update(bytes).digest('hex')
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    // O hash no nome muda o URL quando a imagem muda: o CDN não serve a
    // versão anterior a partir do mesmo caminho.
    const path = `catalogue/${drugId}/${sha.slice(0, 16)}.${ext}`

    const up = await admin.storage.from('drug-images').upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    })
    if (up.error) throw up.error

    const { data, error } = await admin.rpc('upsert_brand_image', {
      p_drug_id: drugId,
      p_brand_label: marca,
      p_image_path: path,
      p_image_sha: sha,
      p_bytes: bytes.length,
      p_source_note: texto(sourceNote).slice(0, 200) || null,
      p_created_by: g.session.user?.id || null,
    })
    if (error) {
      // A linha não ficou: o objecto novo não deve ficar órfão no bucket.
      await admin.storage
        .from('drug-images')
        .remove([path])
        .catch(() => {})
      throw error
    }

    const linha = Array.isArray(data) ? data[0] : data
    const anterior = linha?.previous_path
    if (anterior && anterior !== path) {
      await admin.storage
        .from('drug-images')
        .remove([anterior])
        .catch(() => {})
    }

    const registo = await logPlatformAudit({
      action: 'catalogue.image.publish',
      table: 'drug_brand_images',
      recordId: linha?.id || null,
      before: anterior ? { image_path: anterior } : null,
      after: { drug_id: drugId, marca, image_path: path, sha },
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath('/interno/catalogo')
    revalidarPublico()
    return { ok: true, path, auditado: registo.ok, substituiu: Boolean(anterior) }
  } catch (err) {
    return falha('Falha ao carregar a imagem de catálogo', err)
  }
}

/** Ocultar/repôr sem apagar o objecto: o efeito é imediato no Localizador. */
export async function setBrandImageStatus({ id, status } = {}) {
  const g = await requirePlatform('catalogue.manage')
  if (!g.ok) return g
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }
  if (status !== 'published' && status !== 'hidden') {
    return { ok: false, error: 'ESTADO_INVALIDO' }
  }

  try {
    const admin = createAdminClient()
    const { data: antes, error: e1 } = await admin
      .from('drug_brand_images')
      .select('id, drug_id, brand_key, brand_label, status, image_path')
      .eq('id', id)
      .maybeSingle()
    if (e1) throw e1
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADA' }
    if (antes.status === status) return { ok: true, mudou: false }

    const { error } = await admin.from('drug_brand_images').update({ status }).eq('id', id)
    if (error) throw error

    const registo = await logPlatformAudit({
      action: status === 'hidden' ? 'catalogue.image.hide' : 'catalogue.image.publish',
      table: 'drug_brand_images',
      recordId: id,
      before: { status: antes.status },
      after: { status, drug_id: antes.drug_id, marca: antes.brand_label },
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath('/interno/catalogo')
    revalidarPublico()
    return { ok: true, mudou: true, auditado: registo.ok }
  } catch (err) {
    return falha('Falha ao mudar o estado da imagem', err)
  }
}

/** Apagar a imagem: o item de stock cai para a foto própria (ou nenhuma). */
export async function removeBrandImage({ id } = {}) {
  const g = await requirePlatform('catalogue.manage')
  if (!g.ok) return g
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const { data: antes, error: e1 } = await admin
      .from('drug_brand_images')
      .select('id, drug_id, brand_label, image_path')
      .eq('id', id)
      .maybeSingle()
    if (e1) throw e1
    if (!antes) return { ok: false, error: 'NAO_ENCONTRADA' }

    const { error } = await admin.from('drug_brand_images').delete().eq('id', id)
    if (error) throw error

    // Só depois de a BD deixar de apontar para o objecto é que se apaga o
    // ficheiro — ao contrário, uma falha a meio deixava a vista com um URL
    // morto.
    await admin.storage
      .from('drug-images')
      .remove([antes.image_path])
      .catch(() => {})

    const registo = await logPlatformAudit({
      action: 'catalogue.image.remove',
      table: 'drug_brand_images',
      recordId: id,
      before: { drug_id: antes.drug_id, marca: antes.brand_label, image_path: antes.image_path },
      after: null,
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath('/interno/catalogo')
    revalidarPublico()
    return { ok: true, auditado: registo.ok }
  } catch (err) {
    return falha('Falha ao remover a imagem de catálogo', err)
  }
}
