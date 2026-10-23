'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { can } from '@/lib/platform/permissions'
import { FUNIL, ESTADO_DA_CONVERSAO, podeConverter } from '@/lib/leads'
import { MUNICIPIOS } from '@/lib/constants'
import { convidarDono } from '@/lib/invites'
import { logError } from '@/lib/log'

/**
 * FUNIL DE LEADS na área interna — Phase 5.3 do plano
 * (docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * A `pharmacy_leads` (0001) existia desde o início e não tinha quem a lesse:
 * o formulário da landing escrevia e mais nada. O que este módulo traz é a
 * CONVERSÃO — e a conversão é uma OPERAÇÃO, não três escritas separadas:
 *
 *      criar a farmácia  →  convidar o dono  →  fechar o funil
 *
 * As três coisas acontecem com o MESMO `requestId` (`newRequestId()`), e é
 * isso que as liga na trilha: quem lê `platform_audit_log` seis meses depois
 * vê três linhas com o mesmo pedido e sabe que foram um gesto só. Sem isso,
 * um `pharmacy.create` órfão e um `account.invite` sem pai seriam
 * indistinguíveis de duas acções soltas — e a pergunta que se faz ao
 * telefone («de que lead veio esta conta?») não teria resposta.
 *
 * O que a operação NÃO faz, de propósito: atribuir um plano. A farmácia
 * nasce sem subscrição — está no plano de entrada, aparece em «Primeiro
 * plano por atribuir» no ecrã dos planos, e o plano é atribuído com as
 * regras dele (`plan.assign`, com MFA e motivo). Uma operação, uma decisão.
 *
 * Três regras do resto da área interna, sem excepção:
 *   1. a autorização é a matriz, no SERVIDOR, antes de qualquer escrita;
 *   2. a operação é REENTRANTE: com a farmácia já criada, uma segunda
 *      tentativa repete o convite e o fecho em vez de criar outra farmácia
 *      (é o que `pharmacy_id` no lead existe para permitir);
 *   3. nada se apaga e nada fica a meio em silêncio: se o convite falhar, a
 *      resposta e a trilha dizem o que ficou feito e o funil NÃO fecha.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// O funil, o estado reservado da conversão e `podeConverter` vivem em
// `lib/leads.js`: este ficheiro é `'use server'` e só pode exportar funções
// async (o build recusa o resto com «Server Actions must be async
// functions»). Não se reexportam daqui — quem precisa deles importa-os
// dali, e as leituras já devolvem `funil`/`podeConverter` prontos.
const LIMITES = {
  name: 120,
  municipio: 40,
  address: 200,
  phone: 40,
  whatsapp: 40,
  email: 160,
  opening_hours: 400,
  maps_url: 500,
  emailDono: 160,
  nomeDono: 120,
}

/** Colunas da farmácia que a conversão devolve (as que a ficha mostra). */
const COLS_FARMACIA =
  'id, slug, name, municipio, address, phone, whatsapp, email, opening_hours, maps_url, verified, active, created_at'

const COLS_LEAD =
  'id, pharmacy_name, nif, license, address, contact_name, role, email, phone, municipio, website, social, message, consent_at, consent_version, status, created_at, updated_at, onboarded_at, pharmacy_id'

function texto(valor, limite) {
  const t = String(valor ?? '').trim()
  return limite ? t.slice(0, limite) : t
}

function erroMeta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}

function falha(mensagem, err) {
  logError('platform', mensagem, erroMeta(err))
  return { ok: false, error: 'FALHA' }
}

function lerLead(admin, leadId) {
  return admin
    .from('pharmacy_leads')
    .select(COLS_LEAD)
    .eq('id', leadId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error
      return data || null
    })
}

function lerFarmacia(admin, id) {
  return admin
    .from('pharmacies')
    .select(COLS_FARMACIA)
    .eq('id', id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error
      return data || null
    })
}

/**
 * Morada pública da farmácia a partir do nome: `/farmacia/<slug>`. O slug é
 * único na tabela (0001) e não se muda depois (partia os links que já
 * circulam), por isso aqui resolve-se a colisão antes de tentar escrever —
 * duas farmácias com o mesmo nome em municípios diferentes são normais, e
 * «farmacia-x-2» é melhor do que um erro que a equipa não sabe explicar.
 */
function slugDe(nome) {
  return (
    texto(nome, 120)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'farmacia'
  )
}

async function slugLivre(admin, nome) {
  const base = slugDe(nome)
  const { data, error } = await admin.from('pharmacies').select('slug').ilike('slug', `${base}%`)
  if (error) throw error

  const usados = new Set((data || []).map((r) => r.slug))
  if (!usados.has(base)) return base
  for (let i = 2; i < 50; i += 1) {
    const tentativa = `${base}-${i}`
    if (!usados.has(tentativa)) return tentativa
  }
  // Cinquenta farmácias com o mesmo nome é improvável; a data resolve o
  // resto sem nunca falhar a operação por causa disto.
  return `${base}-${Date.now().toString(36)}`
}

// ===============================================================
// Leituras
// ===============================================================

/**
 * O funil (Task 5.3 Step 1): os leads por estado, e a última mudança de cada
 * um — «quem mudou o quê e quando» sai da TRILHA, que é onde isso vive.
 *
 * Ler a trilha uma vez para todos os leads (e não uma vez por lead) é o que
 * mantém isto numa consulta: as acções `lead.*` são poucas e recentes por
 * natureza, e o ecrã mostra as últimas cem.
 */
export async function getLeads({ estado } = {}) {
  const g = await requirePlatformRead('lead.read')
  if (!g.ok) return g

  const filtro = FUNIL.includes(texto(estado)) ? texto(estado) : null

  try {
    const admin = createAdminClient()
    const [leadsRes, trilhaRes] = await Promise.all([
      (filtro
        ? admin.from('pharmacy_leads').select(COLS_LEAD).eq('status', filtro)
        : admin.from('pharmacy_leads').select(COLS_LEAD)
      ).order('created_at', { ascending: false }),
      admin
        .from('platform_audit_log')
        .select('id, created_at, actor_email, action, reason, record_id, before, after, request_id')
        .like('action', 'lead.%')
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (leadsRes.error) throw leadsRes.error
    if (trilhaRes.error) throw trilhaRes.error

    // Última mudança por lead. A trilha vem ordenada do mais recente, por
    // isso o primeiro que aparece para cada id é o que fica.
    const porLead = new Map()
    for (const h of trilhaRes.data || []) {
      if (!porLead.has(h.record_id)) porLead.set(h.record_id, h)
    }

    const rows = (leadsRes.data || []).map((l) => {
      const h = porLead.get(l.id) || null
      return {
        id: l.id,
        farmaciaNome: l.pharmacy_name,
        nif: l.nif || null,
        licenca: l.license || null,
        endereco: l.address || null,
        contacto: l.contact_name,
        papel: l.role || null,
        email: l.email || null,
        telefone: l.phone,
        municipio: l.municipio || null,
        website: l.website || null,
        social: l.social || null,
        mensagem: l.message || null,
        consentimentoEm: l.consent_at || null,
        consentimentoVersao: l.consent_version || null,
        estado: l.status,
        criadoEm: l.created_at,
        mudadoEm: l.updated_at || l.created_at,
        onboardedEm: l.onboarded_at || null,
        pharmacyId: l.pharmacy_id || null,
        ultimaMudanca: h
          ? {
              quando: h.created_at,
              actorEmail: h.actor_email,
              action: h.action,
              reason: h.reason,
              requestId: h.request_id,
              de: h.before?.estado ?? h.before?.status ?? null,
              para: h.after?.estado ?? h.after?.status ?? null,
            }
          : null,
      }
    })

    const conta = (fn) => (leadsRes.data || []).filter(fn).length
    const totais = { total: rows.length, porAtender: 0, porEstado: {} }
    for (const e of FUNIL) totais.porEstado[e] = conta((l) => l.status === e)
    // «Por atender» é o trabalho do dia: os que ainda não foram tocados.
    totais.porAtender = totais.porEstado.novo

    return {
      ok: true,
      rows,
      totais,
      funil: FUNIL,
      filtro,
      podeMover: can(g.session.role, 'lead.update'),
      podeConverter: podeConverter(g.session.role),
    }
  } catch (err) {
    return falha('Falha ao ler o funil de leads', err)
  }
}

/**
 * A FICHA de um lead: os dados completos que o formulário de adesão
 * recolheu, para a equipa ler antes de telefonar ou converter.
 *
 * Autorização separada da conversão: quem tem `lead.read` pode abrir a
 * ficha, mesmo que não possa converter. O ecrã usa as flags devolvidas
 * para esconder as acções que o servidor recusaria.
 */
export async function getLeadDetalhe(leadId) {
  const g = await requirePlatformRead('lead.read')
  if (!g.ok) return g
  if (!UUID_RE.test(String(leadId || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const lead = await lerLead(admin, leadId)
    if (!lead) return { ok: false, error: 'NAO_ENCONTRADO' }

    const farmacia = lead.pharmacy_id ? await lerFarmacia(admin, lead.pharmacy_id) : null

    return {
      ok: true,
      lead,
      farmacia,
      podeMover: can(g.session.role, 'lead.update'),
      podeConverter: podeConverter(g.session.role),
    }
  } catch (err) {
    return falha('Falha ao ler a ficha do lead', err)
  }
}

/**
 * SÓ OS NÚMEROS do funil, para o painel.
 *
 * O painel responde a «o que precisa de mim hoje?» e não tem de carregar o
 * funil inteiro (nem ler a trilha) para isso: aqui contam-se as linhas por
 * estado com `head: true`, sem trazer uma única linha. É a diferença entre
 * um ecrã de entrada leve e um que arrasta duas tabelas para mostrar cinco
 * números.
 */
export async function getLeadsResumo() {
  const g = await requirePlatformRead('lead.read')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()
    const contagens = await Promise.all(
      FUNIL.map((estado) =>
        admin
          .from('pharmacy_leads')
          .select('id', { count: 'exact', head: true })
          .eq('status', estado)
          .then(({ count, error }) => {
            if (error) throw error
            return [estado, count || 0]
          }),
      ),
    )

    const porEstado = Object.fromEntries(contagens)
    return {
      ok: true,
      // «Por atender» é o que o painel mostra: um lead novo é uma farmácia
      // a pedir resposta, e é o único estado em que ninguém fez nada.
      porAtender: porEstado.novo || 0,
      porEstado,
      total: Object.values(porEstado).reduce((a, b) => a + b, 0),
    }
  } catch (err) {
    return falha('Falha ao contar os leads do funil', err)
  }
}

/**
 * A OPERAÇÃO tal como a trilha a gravou (Task 5.3 Step 2).
 *
 * O resultado de uma conversão não se reconstrói de memória: o ecrã pode ser
 * reaberto dias depois (ou redesenhado pela própria acção, que chama
 * `revalidatePath`), e o que tem de aparecer é o que ficou registado — quem,
 * quando e com que pedido. Duas consultas: a linha do fecho (`lead.convert`)
 * dá o `request_id` da operação, e as linhas desse pedido são os passos.
 *
 * Sem `lead.convert` não há operação concluída: devolve `null` e quem chama
 * mostra a tentativa a meio em vez de um resultado inventado.
 */
async function operacaoNaTrilha(admin, leadId) {
  const { data: fecho, error } = await admin
    .from('platform_audit_log')
    .select('request_id, created_at, actor_email, reason')
    .eq('record_id', leadId)
    .eq('action', 'lead.convert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!fecho?.request_id) return null

  const { data: registos, error: errRegistos } = await admin
    .from('platform_audit_log')
    .select('action, created_at, actor_email, record_id, reason, before, after')
    .eq('request_id', fecho.request_id)
    .order('created_at', { ascending: true })
  if (errRegistos) throw errRegistos

  return {
    requestId: fecho.request_id,
    quando: fecho.created_at,
    actorEmail: fecho.actor_email,
    reason: fecho.reason,
    // Nomes do ecrã, não os da tabela: a página e o formulário desenham a
    // mesma lista, e traduzir aqui evita que cada um o faça à sua maneira.
    // O `after` de cada registo traz o que aquele passo mudou (slug, e-mail,
    // estado do funil) — é de lá que sai a nota curta de cada linha.
    registos: (registos || []).map((r) => ({
      action: r.action,
      quando: r.created_at,
      actorEmail: r.actor_email,
      recordId: r.record_id,
      slug: r.after?.slug || null,
      email: r.after?.email || null,
    })),
  }
}

/**
 * A TENTATIVA A MEIO: farmácia criada, convite por sair. Só existe quando o
 * lead já aponta para uma farmácia e o funil NÃO fechou — e o registo
 * `pharmacy.create` diz quando e por quem, que é o que falta a quem chega
 * depois para saber se pode repetir sem medo.
 */
async function tentativaNaTrilha(admin, pharmacyId) {
  const { data, error } = await admin
    .from('platform_audit_log')
    .select('action, created_at, actor_email, request_id, reason')
    .eq('pharmacy_id', pharmacyId)
    .eq('action', 'pharmacy.create')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // Nomes do ecrã (o formulário é um Client Component e não deve saber as
  // colunas da tabela).
  return {
    action: data.action,
    quando: data.created_at,
    actorEmail: data.actor_email,
    reason: data.reason,
    requestId: data.request_id,
  }
}

/**
 * O que o ecrã da conversão precisa: o lead, os municípios da lista e — se
 * já foi convertido — a farmácia que nasceu dele, para o ecrã dizer isso em
 * vez de deixar alguém clicar outra vez.
 */
export async function getLeadParaConversao(leadId) {
  const g = await requirePlatformRead('lead.convert')
  if (!g.ok) return g
  if (!UUID_RE.test(String(leadId || ''))) return { ok: false, error: 'ID_INVALIDO' }

  try {
    const admin = createAdminClient()
    const lead = await lerLead(admin, leadId)
    if (!lead) return { ok: false, error: 'NAO_ENCONTRADO' }

    const farmacia = lead.pharmacy_id ? await lerFarmacia(admin, lead.pharmacy_id) : null
    const jaConvertido = lead.status === ESTADO_DA_CONVERSAO

    const [conversao, tentativa] = await Promise.all([
      farmacia ? operacaoNaTrilha(admin, leadId) : null,
      farmacia && !jaConvertido ? tentativaNaTrilha(admin, farmacia.id) : null,
    ])

    return {
      ok: true,
      lead,
      farmacia,
      // Sem farmácia: é o caminho normal. Com farmácia: a operação ficou a
      // meio (o convite não saiu) ou já terminou — o ecrã distingue os dois
      // pelo estado do lead.
      jaConvertido,
      // O que a OPERAÇÃO fez, lido da trilha: com o pedido que liga os
      // registos e cada passo com o seu actor e a sua hora.
      conversao,
      tentativa,
      municipios: MUNICIPIOS,
      podeConverter: podeConverter(g.session.role),
    }
  } catch (err) {
    return falha('Falha ao preparar a conversão', err)
  }
}

// ===============================================================
// Escrita
// ===============================================================

/**
 * CONVERTER UM LEAD (Task 5.3 Step 2): farmácia + convite ao dono + funil
 * fechado, numa operação com um só `requestId` na trilha.
 *
 * A ordem importa e é a do plano: cria-se a farmácia primeiro porque o
 * convite precisa dela (o `admin_users` liga a conta à farmácia) e porque um
 * convite sem farmácia não teria onde levar o dono. Se o convite falhar, o
 * que fica é uma farmácia criada e um funil ABERTO — a resposta di-lo, a
 * trilha tem o `pharmacy.create` com o `requestId` desta operação, e uma
 * segunda tentativa REPETE só o que falta (o lead já aponta para a farmácia).
 */
export async function convertLead(input = {}) {
  const g = await requirePlatform('lead.convert', { reason: input.motivo })
  if (!g.ok) return g
  if (!podeConverter(g.session.role)) return { ok: false, error: 'SEM_PERMISSAO' }

  const leadId = texto(input.leadId)
  if (!UUID_RE.test(leadId)) return { ok: false, error: 'ID_INVALIDO' }

  const campos = {}
  for (const campo of Object.keys(LIMITES)) {
    campos[campo] = texto(input[campo], LIMITES[campo])
  }

  if (campos.name.length < 2) return { ok: false, error: 'NOME_INVALIDO', campo: 'name' }
  if (!MUNICIPIOS.includes(campos.municipio)) {
    return { ok: false, error: 'MUNICIPIO_INVALIDO', campo: 'municipio' }
  }
  if (!campos.phone) return { ok: false, error: 'TELEFONE_INVALIDO', campo: 'phone' }
  if (campos.email && !EMAIL_RE.test(campos.email)) {
    return { ok: false, error: 'EMAIL_INVALIDO', campo: 'email' }
  }
  if (!EMAIL_RE.test(campos.emailDono)) {
    return { ok: false, error: 'EMAIL_DONO_INVALIDO', campo: 'emailDono' }
  }
  if (campos.nomeDono.length < 2) {
    return { ok: false, error: 'NOME_DONO_INVALIDO', campo: 'nomeDono' }
  }
  if (campos.maps_url && !/^https?:\/\//i.test(campos.maps_url)) {
    return { ok: false, error: 'URL_INVALIDO', campo: 'maps_url' }
  }

  // UMA operação: o mesmo id em todos os registos que ela deixar.
  const requestId = newRequestId()
  const agora = new Date().toISOString()

  try {
    const admin = createAdminClient()
    const lead = await lerLead(admin, leadId)
    if (!lead) return { ok: false, error: 'NAO_ENCONTRADO' }
    if (lead.status === ESTADO_DA_CONVERSAO && lead.pharmacy_id) {
      return { ok: false, error: 'JA_CONVERTIDO', pharmacyId: lead.pharmacy_id }
    }

    // 1. A farmácia — ou a que já ficou criada numa tentativa anterior.
    let farmacia = lead.pharmacy_id ? await lerFarmacia(admin, lead.pharmacy_id) : null
    let criada = false

    if (!farmacia) {
      const slug = await slugLivre(admin, campos.name)
      const { data, error } = await admin
        .from('pharmacies')
        .insert({
          slug,
          name: campos.name,
          municipio: campos.municipio,
          address: campos.address,
          phone: campos.phone,
          whatsapp: campos.whatsapp,
          email: campos.email,
          opening_hours: campos.opening_hours,
          maps_url: campos.maps_url,
          // Nasce sem selo (o selo confirma-se na ficha) e visível: a
          // farmácia passou a existir, e o painel já a vai pedir — «sem
          // selo» é exactamente o que a equipa tem de resolver a seguir.
          verified: false,
          active: true,
        })
        .select(COLS_FARMACIA)
        .single()
      if (error) throw error
      farmacia = data
      criada = true

      await logPlatformAudit({
        action: 'pharmacy.create',
        table: 'pharmacies',
        recordId: farmacia.id,
        pharmacyId: farmacia.id,
        before: null,
        after: {
          nome: farmacia.name,
          slug: farmacia.slug,
          municipio: farmacia.municipio,
          telefone: farmacia.phone,
          email: farmacia.email || null,
        },
        reason: input.motivo,
        session: g.session,
        requestId,
      })

      // A ligação grava-se JÁ: é o que torna a segunda tentativa segura
      // (sem ela, um convite falhado criava outra farmácia no clique
      // seguinte). O funil só fecha no fim, e é isso que fica no registo
      // `lead.convert`.
      const { error: errLigacao } = await admin
        .from('pharmacy_leads')
        .update({
          pharmacy_id: farmacia.id,
          updated_at: agora,
          updated_by: g.session?.user?.id ?? null,
        })
        .eq('id', leadId)
      if (errLigacao) throw errLigacao
    }

    // 2. O convite ao dono.
    const convite = await convidarDono({
      admin,
      farmacia,
      email: campos.emailDono,
      nome: campos.nomeDono,
    })
    if (!convite.ok) {
      return {
        ok: false,
        error: convite.error,
        detalhe: convite.detalhe || null,
        requestId,
        // Fica explícito o que aconteceu: a equipa tem de saber se pode
        // repetir sem medo (pode — a farmácia não se cria duas vezes).
        parcial: true,
        farmacia: {
          id: farmacia.id,
          slug: farmacia.slug,
          name: farmacia.name,
          criada,
        },
      }
    }

    await logPlatformAudit({
      action: 'account.invite',
      table: 'admin_users',
      recordId: convite.userId,
      pharmacyId: farmacia.id,
      before: null,
      after: {
        email: convite.email,
        nome: campos.nomeDono,
        papel: 'farmacia',
        farmacia: farmacia.slug,
      },
      reason: input.motivo,
      session: g.session,
      requestId,
    })

    // 3. Fecha o funil.
    const depois = { estado: ESTADO_DA_CONVERSAO, onboarded_at: agora, pharmacy_id: farmacia.id }
    const { error: errFunil } = await admin
      .from('pharmacy_leads')
      .update({
        status: ESTADO_DA_CONVERSAO,
        onboarded_at: agora,
        updated_at: agora,
        updated_by: g.session?.user?.id ?? null,
      })
      .eq('id', leadId)
    if (errFunil) throw errFunil

    await logPlatformAudit({
      action: 'lead.convert',
      table: 'pharmacy_leads',
      recordId: leadId,
      pharmacyId: farmacia.id,
      before: {
        estado: lead.status,
        onboarded_at: lead.onboarded_at ?? null,
        pharmacy_id: lead.pharmacy_id ?? null,
      },
      after: depois,
      reason: input.motivo,
      session: g.session,
      requestId,
    })

    revalidatePath('/interno')
    revalidatePath('/interno/leads')
    revalidatePath('/interno/farmacias')
    revalidatePath(`/interno/farmacias/${farmacia.id}`)

    return {
      ok: true,
      requestId,
      criada,
      farmacia: {
        id: farmacia.id,
        slug: farmacia.slug,
        name: farmacia.name,
        municipio: farmacia.municipio,
      },
      convite: { userId: convite.userId, email: convite.email },
      lead: { id: leadId, estado: ESTADO_DA_CONVERSAO, onboardedEm: agora },
    }
  } catch (err) {
    return falha('Falha ao converter o lead', err)
  }
}

/**
 * Mover um lead no funil (`novo → em_conversa → … → descartado`).
 *
 * `onboarded` está FORA dos estados que se escolhem: é o resultado da
 * conversão, e um clique a pôr lá um lead sem farmácia fazia o funil mentir.
 * A resposta diz isso com todas as letras, e o ecrã esconde o estado.
 *
 * Um lead já ligado a uma farmácia também não se move: a conversão ficou a
 * meio (o convite não saiu) e o caminho é repeti-la, não arrastar o funil
 * para outro lado.
 */
export async function moveLead({ leadId, status, nota } = {}) {
  const g = await requirePlatform('lead.update', { reason: nota })
  if (!g.ok) return g

  const id = texto(leadId)
  if (!UUID_RE.test(id)) return { ok: false, error: 'ID_INVALIDO' }

  const novo = texto(status)
  if (!FUNIL.includes(novo)) return { ok: false, error: 'ESTADO_INVALIDO' }
  if (novo === ESTADO_DA_CONVERSAO) return { ok: false, error: 'ESTADO_RESERVADO' }

  try {
    const admin = createAdminClient()
    const lead = await lerLead(admin, id)
    if (!lead) return { ok: false, error: 'NAO_ENCONTRADO' }
    if (lead.status === novo) return { ok: true, mudou: 0, lead: { id, estado: lead.status } }
    if (lead.pharmacy_id)
      return { ok: false, error: 'FARMACIA_JA_CRIADA', pharmacyId: lead.pharmacy_id }

    const agora = new Date().toISOString()
    const { error } = await admin
      .from('pharmacy_leads')
      .update({ status: novo, updated_at: agora, updated_by: g.session?.user?.id ?? null })
      .eq('id', id)
    if (error) throw error

    await logPlatformAudit({
      action: 'lead.update',
      table: 'pharmacy_leads',
      recordId: id,
      before: { estado: lead.status, onboarded_at: lead.onboarded_at ?? null },
      after: { estado: novo, onboarded_at: lead.onboarded_at ?? null },
      reason: nota,
      session: g.session,
    })

    revalidatePath('/interno')
    revalidatePath('/interno/leads')

    return { ok: true, mudou: 1, lead: { id, estado: novo } }
  } catch (err) {
    return falha('Falha ao mover o lead no funil', err)
  }
}
