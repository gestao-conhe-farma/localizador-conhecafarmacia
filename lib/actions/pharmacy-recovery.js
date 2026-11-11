'use server'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerComponentClient } from '@/lib/supabase/server'
import { emailRef } from '@/lib/email-ref'
import { logError, logWarn } from '@/lib/log'

/**
 * REPOSIÇÃO DE SENHA DO PORTAL — auto-serviço, provada pelo AUTENTICADOR.
 *
 * O problema que isto resolve: a conta de farmácia perde a senha e não tem
 * como a repor (o link de recuperação é gerado pela equipa CF, e o SMTP do
 * Auth não serve). Aqui a farmácia repõe sozinha — mas só se provar que
 * ainda tem o segundo factor da conta (`aal2`). Sem TOTP inscrito não há
 * reposição por este caminho: cai para o link que a equipa envia.
 *
 * Como se prova o TOTP sem senha (o Supabase só deixa desafiar um factor
 * dentro de uma sessão autenticada):
 *   1. `generateLink({ type: 'magiclink' })` cria um token para a conta —
 *      NÃO envia e-mail nenhum e não serve de prova: o `hashed_token` fica
 *      no servidor, nunca no browser nem no URL.
 *   2. `verifyOtp` troca esse token por uma sessão `aal1` nas cookies desta
 *      Server Action.
 *   3. `challengeAndVerify` valida o código de 6 dígitos → sessão `aal2`.
 *   4. `updateUser({ password })` grava a senha nova.
 *   5. `signOut()` fecha a sessão: quem repôs a senha entra pelo login, com
 *      a senha que escolheu. Sem sessão pendurada no browser.
 *
 * A senha nunca é comparada nem guardada aqui: quem valida e grava é o
 * Supabase Auth.
 */

const MIN = 8
const MAX = 72

const UUID_NAO_INTERESSA = /[^a-z0-9@._+-]/g

function normalizarEmail(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .replace(UUID_NAO_INTERESSA, '')
    .slice(0, 200)
}

function normalizarCodigo(valor) {
  return String(valor ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
}

function chaveLimite(prefixo, valor) {
  return `${prefixo}:${createHash('sha256').update(String(valor), 'utf8').digest('hex').slice(0, 32)}`
}

/**
 * Contador atómico na base (0037), o mesmo dos leads e das reservas.
 * Falha ABERTA com registo: um problema no contador não pode trancar a
 * reposição de senha de uma farmácia inteira.
 */
async function dentroDoLimite(admin, chave, limite, janelaSegundos) {
  try {
    const { data, error } = await admin
      .schema('public')
      .rpc('lead_rate_consume', { p_ip: chave, p_limit: limite, p_window_seconds: janelaSegundos })
    if (error) {
      logWarn('pharmacy-portal', 'Limite da reposição de senha indisponível', {
        message: error.message,
      })
      return true
    }
    return data?.allowed !== false
  } catch (err) {
    logWarn('pharmacy-portal', 'Limite da reposição de senha falhou', {
      message: err?.message || String(err),
    })
    return true
  }
}

async function ipDoPedido() {
  const h = await headers()
  return h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
}

/**
 * Códigos de erro para a UI:
 *   EMAIL_INVALIDO · CODIGO_INVALIDO · SENHA_CURTA · SENHA_LONGA ·
 *   SENHAS_DIFERENTES · SENHA_IGUAL · SENHA_FALHOU · SEM_FACTOR ·
 *   SEM_ACESSO_PORTAL · DEMASIADAS_TENTATIVAS · DADOS_INVALIDOS · FALHA
 */
export async function reporSenhaPortal(_prevState, formData) {
  const email = normalizarEmail(formData?.get('email'))
  const codigo = normalizarCodigo(formData?.get('codigo'))
  const password = String(formData?.get('password') ?? '')
  const confirmacao = String(formData?.get('password2') ?? '')

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'EMAIL_INVALIDO' }
  if (codigo.length !== 6) return { ok: false, error: 'CODIGO_INVALIDO' }
  if (password.length < MIN) return { ok: false, error: 'SENHA_CURTA' }
  if (password.length > MAX) return { ok: false, error: 'SENHA_LONGA' }
  if (password !== confirmacao) return { ok: false, error: 'SENHAS_DIFERENTES' }

  let supabase = null
  let comSessao = false

  try {
    const admin = createAdminClient()

    // Dois contadores: por IP (uma rede a tentar várias contas) e por
    // conta (o ataque real — adivinhar 6 dígitos de um alvo conhecido).
    // 8 tentativas/hora por conta tornam o espaço de 10^6 inútil.
    const ip = await ipDoPedido()
    const [ipOk, contaOk] = await Promise.all([
      dentroDoLimite(admin, chaveLimite('recovery-ip', ip), 20, 3600),
      dentroDoLimite(admin, chaveLimite('recovery-conta', email), 8, 3600),
    ])
    if (!ipOk || !contaOk) return { ok: false, error: 'DEMASIADAS_TENTATIVAS' }

    // Token de sessão da conta — gerado no servidor e nunca entregue a
    // quem pede. `magiclink` recusa (404) contas que não existem.
    const { data: link, error: errLink } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (errLink) {
      logWarn('pharmacy-portal', 'Reposição de senha para conta inexistente ou ilegível', {
        emailRef: emailRef(email),
        code: errLink.code,
        status: errLink.status,
      })
      // Mesma resposta para «não existe» e «não deu»: não se confirma
      // que endereços têm conta no portal.
      return { ok: false, error: 'DADOS_INVALIDOS' }
    }

    const tokenHash = link?.properties?.hashed_token
    if (!tokenHash) {
      logError('pharmacy-portal', 'Reposição de senha sem token', { emailRef: emailRef(email) })
      return { ok: false, error: 'FALHA' }
    }

    supabase = await createServerComponentClient({ area: 'portal' })
    const { data: sessao, error: errOtp } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
    if (errOtp || !sessao?.user?.id) {
      logError('pharmacy-portal', 'Reposição de senha: token não abriu sessão', {
        emailRef: emailRef(email),
        code: errOtp?.code,
        message: errOtp?.message,
      })
      return { ok: false, error: 'FALHA' }
    }
    comSessao = true

    // Só contas do PORTAL repõem por aqui. Uma conta da equipa CF (interno)
    // tem o seu próprio caminho e não se mistura com o da farmácia.
    const { data: perfil, error: errPerfil } = await admin
      .from('admin_users')
      .select('role')
      .eq('user_id', sessao.user.id)
      .maybeSingle()
    if (errPerfil) {
      logError('pharmacy-portal', 'Reposição de senha: perfil ilegível', {
        userId: sessao.user.id,
        message: errPerfil.message,
      })
      return { ok: false, error: 'FALHA' }
    }
    if (!perfil || perfil.role !== 'farmacia') return { ok: false, error: 'SEM_ACESSO_PORTAL' }

    // O segundo factor é o que autoriza a reposição — a posse do e-mail
    // sozinha não chega (o e-mail é público e o SMTP não é prova).
    const { data: fatores, error: errFatores } = await supabase.auth.mfa.listFactors()
    if (errFatores) {
      logError('pharmacy-portal', 'Reposição de senha: factores ilegíveis', {
        userId: sessao.user.id,
        message: errFatores.message,
      })
      return { ok: false, error: 'FALHA' }
    }

    const factor = (fatores?.all || []).find(
      (f) => f.factor_type === 'totp' && f.status === 'verified',
    )
    if (!factor) return { ok: false, error: 'SEM_FACTOR' }

    const { error: errCodigo } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: codigo,
    })
    if (errCodigo) {
      const c = String(errCodigo.code || '')
      logWarn('pharmacy-portal', 'Reposição de senha recusada: código TOTP', {
        userId: sessao.user.id,
        code: errCodigo.code,
      })
      if (c === 'over_request_rate_limit' || /rate limit|too many/i.test(String(errCodigo.message))) {
        return { ok: false, error: 'DEMASIADAS_TENTATIVAS' }
      }
      return { ok: false, error: 'CODIGO_INVALIDO' }
    }

    const { error: errSenha } = await supabase.auth.updateUser({ password })
    if (errSenha) {
      logError('pharmacy-portal', 'Reposição de senha não guardada', {
        userId: sessao.user.id,
        code: errSenha.code,
        message: errSenha.message,
      })
      if (/different from the old|same (as the )?(old|current) password/i.test(errSenha.message || '')) {
        return { ok: false, error: 'SENHA_IGUAL' }
      }
      return { ok: false, error: 'SENHA_FALHOU' }
    }

    logWarn('pharmacy-portal', 'Senha do portal reposta com segundo factor', {
      userId: sessao.user.id,
      emailRef: emailRef(email),
    })

    return { ok: true, feito: true }
  } catch (err) {
    logError('pharmacy-portal', 'Falha na reposição de senha do portal', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  } finally {
    // A sessão criada só existia para provar o factor. Fechá-la sempre —
    // inclusive quando algo falha a meio — impede que um erro deixe o
    // browser autenticado numa conta cuja senha ninguém escolheu.
    if (comSessao && supabase) {
      try {
        await supabase.auth.signOut()
      } catch (err) {
        logError('pharmacy-portal', 'Sessão de reposição não fechada', {
          message: err?.message || String(err),
        })
      }
    }
  }
}
