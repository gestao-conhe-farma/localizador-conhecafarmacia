'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatform, requirePlatformRead } from '@/lib/platform/session'
import { logPlatformAudit, newRequestId } from '@/lib/platform/audit'
import { can, isPlatformRole, normalizeRole, roleLabel } from '@/lib/platform/permissions'
import { logError, logWarn } from '@/lib/log'

/**
 * GESTÃO DA EQUIPA CF — lista de membros e reposição do segundo factor
 * (Phase 9 do plano docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * O caso que isto resolve: uma pessoa da equipa perdeu o telefone onde tinha
 * o autenticador. Sem reposição, ficava de fora para sempre — e o caminho
 * «fácil» seria inscrever outro factor por cima, que é exactamente o gesto
 * de quem roubou uma sessão. A reposição é, por isso, uma acção sobre
 * OUTRÉM: quem a executa tem de ser superadmin, com `aal2` e motivo, e o
 * servidor recusa quando o alvo é a própria conta.
 *
 * TRÊS DECISÕES que valem a pena nomear:
 *
 *   1. APAGAR UM FACTOR VERIFICADO TERMINA AS SESSÕES DO ALVO. É o contrato
 *      da Admin API (`auth.admin.mfa.deleteFactor`): o GoTrue revoga todas as
 *      sessões activas quando o factor apagado estava verificado. É o que se
 *      quer — quem perdeu o telefone também perdeu as sessões dele — e o
 *      motivo de a operação ser registada com `after.sessoes = 'terminadas'`.
 *   2. SÓ SE APAGAM FACTORES VERIFICADOS. Uma inscrição por acabar não abre
 *      porta nenhuma e o próprio membro a pode descartar em
 *      `/interno/mfa`; apagá-la aqui seria mexer no que não está a impedir
 *      ninguém de entrar.
 *   3. A TRILHA É BEST-EFFORT, como no resto da área interna, mas o ecrã
 *      NÃO DIZ «registado» quando não ficou. `logPlatformAudit` nunca lança
 *      nem bloqueia a operação (contrato do módulo); por isso o resultado
 *      leva `auditado` e a UI mostra um aviso próprio quando é `false`, em
 *      vez de um «feito» que esconderia a falta de rasto.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function texto(valor, limite = 200) {
  return String(valor ?? '')
    .trim()
    .slice(0, limite)
}

function banidoAte(user) {
  if (!user?.banned_until) return false
  const quando = new Date(user.banned_until)
  return !Number.isNaN(quando.getTime()) && quando > new Date()
}

/** Factores verificados de um utilizador do Auth (o que dá acesso). */
function verificadosDe(user) {
  return (user?.factors || []).filter((f) => f.status === 'verified')
}

function falhaLeitura(mensagem, err) {
  logError('platform', mensagem, {
    code: err?.code,
    message: err?.message || String(err),
  })
  return { ok: false, error: 'FALHA' }
}

// ===============================================================
// Leitura
// ===============================================================

/**
 * Membros da Equipa CF, com o estado da conta Auth de cada um.
 *
 * A lista vem de `admin_users` (é a tabela que diz quem é da equipa) e o
 * e-mail, o último acesso e os factores vêm da Admin API — um por um, e não
 * por `listUsers`: a partir de algumas centenas de contas de farmácia, uma
 * página de 200 deixaria membros da equipa de fora sem ninguém dar por isso.
 * A equipa é pequena; N chamadas por id são o preço de não perder ninguém.
 *
 * A leitura é `requirePlatformRead('team.reset_mfa')`: ver a lista é do
 * mesmo nível que repor o factor, mas não exige `aal2` — o ecrã tem de
 * poder dizer a quem ainda só tem senha que a acção vai pedir o código.
 */
export async function getTeam() {
  const g = await requirePlatformRead('team.reset_mfa')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()

    const { data: contas, error } = await admin
      .from('admin_users')
      .select('user_id, role, display_name, created_at')
      .neq('role', 'farmacia')
      .order('created_at')
    if (error) return falhaLeitura('Não foi possível ler a equipa', error)

    const membros = (contas || []).filter((c) => isPlatformRole(c.role))

    const auth = await Promise.all(
      membros.map(async (c) => {
        const { data, error: err } = await admin.auth.admin.getUserById(c.user_id)
        if (err) {
          logWarn('platform', 'Conta da equipa ilegível no Auth', {
            userId: c.user_id,
            code: err.code,
            message: err.message,
          })
          return null
        }
        return data?.user || null
      }),
    )

    const eu = g.session.user?.id
    const podeAgir = can(g.session.role, 'team.reset_mfa')

    const rows = membros.map((c, i) => {
      const user = auth[i]
      const role = normalizeRole(c.role)
      const fatores = verificadosDe(user)
      const suspenso = banidoAte(user)
      const proprio = c.user_id === eu

      return {
        userId: c.user_id,
        nome: c.display_name || null,
        email: user?.email || null,
        role,
        rotulo: roleLabel(role) || c.role,
        legado: c.role !== role,
        criadoEm: c.created_at || null,
        ultimoAcesso: user?.last_sign_in_at || null,
        convitePendente: Boolean(user) && !user.email_confirmed_at,
        suspenso,
        fatores: fatores.length,
        ultimoDesafio:
          fatores
            .map((f) => f.last_challenged_at || null)
            .filter(Boolean)
            .sort()
            .at(-1) || null,
        // O botão é uma cortesia da UI; a autorização a sério é a Server
        // Action. `podeRepor` só evita oferecer um caminho que o servidor
        // vai recusar (o próprio membro, quem não tem factor, conta suspensa).
        podeRepor: podeAgir && !proprio && !suspenso && fatores.length > 0,
        proprio,
      }
    })

    return {
      ok: true,
      rows,
      total: rows.length,
      ativos: rows.filter((r) => r.fatores > 0).length,
      semFactor: rows.filter((r) => r.fatores === 0).length,
      pendentes: rows.filter((r) => r.convitePendente).length,
      podeRepor: podeAgir,
      mfa2: g.session.mfa?.currentLevel === 'aal2',
    }
  } catch (err) {
    return falhaLeitura('Falha ao ler a equipa', err)
  }
}

// ===============================================================
// Reposição do segundo factor
// ===============================================================

/**
 * Repõe o segundo factor de um membro que perdeu o telefone: apaga os
 * factores TOTP VERIFICADOS dele e registra a operação na trilha.
 *
 * Recusas, por ordem:
 *   ID_INVALIDO      — o id não é um uuid;
 *   PROPRIO_FACTOR   — a própria conta (repor o próprio factor é o caminho
 *                      de quem roubou a sessão; o par certo é um colega);
 *   NAO_E_MEMBRO     — não há linha de equipa (ou é conta de farmácia);
 *   CONTA_ILEGIVEL   — o Auth não respondeu por esta conta;
 *   CONTA_SUSPENSA   — conta banida não entra, portanto não há factor a
 *                      repor sem primeiro decidir a suspensão;
 *   MFA_ILEGIVEL     — não foi possível listar os factores;
 *   SEM_FACTOR       — não há factor verificado (nada a repor).
 *
 * Depois de apagar, a trilha grava antes/depois com os factores que existiam
 * e o estado das sessões. Se a gravação falhar, a resposta continua `ok`
 * (a remoção aconteceu e não se desfaz) mas leva `auditado: false` — o ecrã
 * mostra-o como aviso, nunca como sucesso limpo.
 */
export async function resetMemberMfa({ userId, motivo } = {}) {
  const g = await requirePlatform('team.reset_mfa', { reason: motivo })
  if (!g.ok) return g

  const alvoId = texto(userId, 64)
  if (!UUID_RE.test(alvoId)) return { ok: false, error: 'ID_INVALIDO' }
  if (g.session.user?.id === alvoId) return { ok: false, error: 'PROPRIO_FACTOR' }

  try {
    const admin = createAdminClient()

    const { data: conta, error: erroConta } = await admin
      .from('admin_users')
      .select('user_id, role, display_name, pharmacy_id')
      .eq('user_id', alvoId)
      .maybeSingle()
    if (erroConta) return falhaLeitura('Não foi possível ler o membro da equipa', erroConta)
    if (!conta || conta.pharmacy_id || !isPlatformRole(conta.role)) {
      return { ok: false, error: 'NAO_E_MEMBRO' }
    }

    const { data: dadosAuth, error: erroAuth } = await admin.auth.admin.getUserById(alvoId)
    const alvo = dadosAuth?.user || null
    if (erroAuth || !alvo) {
      logWarn('platform', 'Reposição de MFA: conta do alvo ilegível', {
        userId: alvoId,
        code: erroAuth?.code,
        message: erroAuth?.message,
      })
      return { ok: false, error: 'CONTA_ILEGIVEL' }
    }
    if (banidoAte(alvo)) return { ok: false, error: 'CONTA_SUSPENSA' }

    const { data: lista, error: erroLista } = await admin.auth.admin.mfa.listFactors({
      userId: alvoId,
    })
    if (erroLista) {
      logWarn('platform', 'Reposição de MFA: factores ilegíveis', {
        userId: alvoId,
        code: erroLista.code,
        message: erroLista.message,
      })
      return { ok: false, error: 'MFA_ILEGIVEL' }
    }

    const verificados = (lista?.factors || []).filter((f) => f.status === 'verified')
    if (verificados.length === 0) return { ok: false, error: 'SEM_FACTOR' }

    const removidos = []
    let falhou = null
    for (const factor of verificados) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: alvoId })
      if (error) {
        logError('platform', 'Não foi possível apagar um factor de MFA do membro', {
          userId: alvoId,
          factorId: factor.id,
          code: error.code,
          message: error.message,
        })
        falhou = factor
        break
      }
      removidos.push(factor)
    }

    const registo = await logPlatformAudit({
      action: 'team.reset_mfa',
      table: 'admin_users',
      recordId: alvoId,
      before: {
        mfa: 'activo',
        fatores: verificados.map((f) => ({
          tipo: f.factor_type,
          nome: f.friendly_name || null,
          criado: f.created_at || null,
        })),
        sessoes: 'activas',
      },
      after: {
        // Factores que ficaram: nenhum quando tudo correu, os que sobraram
        // quando uma remoção falhou a meio.
        mfa: falhou ? 'activo' : 'por_inscrever',
        fatores: verificados.slice(removidos.length).map((f) => ({
          tipo: f.factor_type,
          nome: f.friendly_name || null,
          criado: f.created_at || null,
        })),
        sessoes: removidos.length ? 'terminadas' : 'mantidas',
      },
      reason: motivo,
      session: g.session,
      requestId: newRequestId(),
    })

    revalidatePath('/interno/equipa')
    revalidatePath('/interno/auditoria')

    if (falhou) {
      return {
        ok: false,
        error: 'REPOSTO_A_MEIO',
        removidos: removidos.length,
        auditado: registo.ok,
      }
    }

    return {
      ok: true,
      removidos: removidos.length,
      nome: conta.display_name || alvo.email || null,
      email: alvo.email || null,
      auditado: registo.ok,
    }
  } catch (err) {
    return falhaLeitura('Falha ao repor o segundo factor do membro', err)
  }
}
