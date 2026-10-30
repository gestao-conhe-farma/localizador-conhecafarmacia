'use server'

import { revalidatePath } from 'next/cache'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logError, logWarn } from '@/lib/log'

/**
 * SEGUNDO FACTOR da CONTA da farmácia (TOTP).
 *
 * Regra de produto:
 *   — `gerente` (perfil de balcão que manda) NÃO entra no portal sem `aal2`;
 *   — o dono da conta (`farmacia`) pode ativá-lo quando quiser.
 *
 * Quem sobe a sessão para `aal2` é o Supabase Auth (`challengeAndVerify`);
 * aqui só se recolhe o código e se traduz a resposta. O guard de todas as
 * funções é `getPharmacySession()` — a conta de farmácia activa — e não o
 * cookie de balcão: inscrever o autenticador é da CONTA, não do dispositivo.
 */

const NOME_FACTOR = 'Portal da farmácia'
const EMISSOR = 'Conheça Farmácia'

function normalizarCodigo(valor) {
  return String(valor ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
}

function codigoDoErro(error) {
  const c = String(error?.code || '')
  if (['mfa_verification_failed', 'mfa_challenge_expired', 'mfa_verification_rejected'].includes(c)) {
    return 'CODIGO_INVALIDO'
  }
  if (c === 'over_request_rate_limit' || /rate limit|too many/i.test(String(error?.message || ''))) {
    return 'DEMASIADAS_TENTATIVAS'
  }
  if (c === 'mfa_totp_enroll_not_enabled') return 'TOTP_DESLIGADO'
  if (c === 'mfa_factor_name_conflict') return 'INSCRICAO_A_MEIO'
  if (c === 'mfa_verified_factor_exists' || c === 'too_many_enrolled_mfa_factors') return 'JA_INSCRITO'
  if (c === 'insufficient_aal') return 'SESSAO_CURTA'
  return 'MFA_FALHA'
}

function paraDataUri(qr) {
  const bruto = String(qr || '')
  if (!bruto) return null
  return bruto.startsWith('data:') ? bruto : `data:image/svg+xml;utf-8,${encodeURIComponent(bruto)}`
}

/** Factores verificados da própria conta. */
async function fatoresVerificados(supabase) {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { ok: false, error: 'MFA_LEITURA' }
  return { ok: true, fatores: (data?.all || []).filter((f) => f.status === 'verified') }
}

/** Começa a inscrição: devolve o QR e o segredo (mostrados uma só vez). */
export async function iniciarInscricaoPortal() {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  try {
    const supabase = await createServerComponentClient()
    const atuais = await fatoresVerificados(supabase)
    if (!atuais.ok) return atuais
    if (atuais.fatores.some((f) => f.factor_type === 'totp')) return { ok: false, error: 'JA_INSCRITO' }

    // Inscrições abandonadas não abrem porta nenhuma e fariam colidir o nome.
    const { data: lista } = await supabase.auth.mfa.listFactors()
    for (const f of (lista?.all || []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: NOME_FACTOR,
      issuer: EMISSOR,
    })
    if (error) {
      const codigo = codigoDoErro(error)
      logError('portal', 'Inscrição TOTP não começou', { code: error.code, traduzido: codigo })
      return { ok: false, error: codigo }
    }

    return {
      ok: true,
      factorId: data.id,
      qrCode: paraDataUri(data.totp?.qr_code),
      secret: data.totp?.secret || null,
    }
  } catch (err) {
    logError('portal', 'Falha ao iniciar a inscrição TOTP', { message: err?.message || String(err) })
    return { ok: false, error: 'MFA_FALHA' }
  }
}

/** Confirma o primeiro código: ativa o factor e sobe a sessão a `aal2`. */
export async function confirmarInscricaoPortal({ factorId, code } = {}) {
  const id = String(factorId ?? '').trim().slice(0, 64)
  const digitos = normalizarCodigo(code)
  if (!id) return { ok: false, error: 'MFA_FALHA' }
  if (digitos.length !== 6) return { ok: false, error: 'CODIGO_INVALIDO' }

  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  try {
    const supabase = await createServerComponentClient()
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: digitos })
    if (error) {
      const codigo = codigoDoErro(error)
      logWarn('portal', 'Código TOTP recusado na inscrição', { code: error.code, traduzido: codigo })
      return { ok: false, error: codigo }
    }

    revalidatePath('/portal', 'layout')
    return { ok: true }
  } catch (err) {
    logError('portal', 'Falha ao confirmar a inscrição TOTP', { message: err?.message || String(err) })
    return { ok: false, error: 'MFA_FALHA' }
  }
}

/** Confirma o código de uma sessão que já tem factor inscrito (aal1 → aal2). */
export async function confirmarCodigoPortal({ code } = {}) {
  const digitos = normalizarCodigo(code)
  if (digitos.length !== 6) return { ok: false, error: 'CODIGO_INVALIDO' }

  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  try {
    const supabase = await createServerComponentClient()
    const lista = await fatoresVerificados(supabase)
    if (!lista.ok) return lista

    const factor = lista.fatores.find((f) => f.factor_type === 'totp')
    if (!factor) return { ok: false, error: 'SEM_FACTOR' }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: digitos,
    })
    if (error) {
      const codigo = codigoDoErro(error)
      logWarn('portal', 'Código TOTP recusado', { code: error.code, traduzido: codigo })
      return { ok: false, error: codigo }
    }

    revalidatePath('/portal', 'layout')
    return { ok: true }
  } catch (err) {
    logError('portal', 'Falha ao confirmar o código TOTP', { message: err?.message || String(err) })
    return { ok: false, error: 'MFA_FALHA' }
  }
}

/**
 * Desativa o autenticador da própria conta (`farmacia`).
 *
 * REAUTENTICAÇÃO OBRIGATÓRIA: desligar o segundo factor é o gesto clássico
 * de quem roubou uma sessão (rebaixar a conta para só password). Pedir a
 * palavra-passe outra vez faz com que a sessão sozinha não baste — é o que
 * a OWASP recomenda para mudanças de factor e o que o Supabase chama de
 * «reautenticar antes de alterar credenciais».
 *
 * A password é confirmada pelo próprio Supabase (`signInWithPassword`); não
 * é comparada aqui. Nota: esse sign-in emite uma sessão `aal1` nova (o
 * segundo factor deixa de estar confirmado) — irrelevante, porque a conta
 * vai ficar sem factor a seguir.
 */
export async function desativarMfaPortal({ password } = {}) {
  const session = await getPharmacySession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  const senha = String(password ?? '')
  if (senha.length < 6) return { ok: false, error: 'SENHA_EM_FALTA' }

  try {
    // Reautenticação: a mesma conta, com a password que ela conhece.
    const supabase = await createServerComponentClient()
    const { error: senhaErrada } = await supabase.auth.signInWithPassword({
      email: session.user?.email || '',
      password: senha,
    })
    if (senhaErrada) {
      logWarn('portal', 'Desativação de TOTP recusada: password incorrecta', {
        code: senhaErrada.code,
      })
      return { ok: false, error: 'SENHA_INCORRECTA' }
    }

    const lista = await fatoresVerificados(supabase)
    if (!lista.ok) return lista

    for (const f of lista.fatores) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
      if (error) {
        logError('portal', 'Não foi possível remover o factor TOTP', { code: error.code })
        return { ok: false, error: 'MFA_FALHA' }
      }
    }

    revalidatePath('/portal', 'layout')
    return { ok: true }
  } catch (err) {
    logError('portal', 'Falha ao remover o factor TOTP', { message: err?.message || String(err) })
    return { ok: false, error: 'MFA_FALHA' }
  }
}
