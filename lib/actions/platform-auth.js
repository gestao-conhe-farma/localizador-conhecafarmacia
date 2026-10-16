'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerComponentClient } from '@/lib/supabase/server'
import { getPlatformSessionVerbose } from '@/lib/platform/session'
import { logError, logWarn } from '@/lib/log'

/**
 * Entrar e sair da ÁREA INTERNA (Equipa Conheça Farmácia) — Task 4.1 do
 * plano (docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * Sessão 100% server-side, como no portal da farmácia: a Server Action
 * escreve as cookies e o servidor vê-as no pedido seguinte. O
 * `signInWithPassword` no browser guardava a sessão só no cliente e o
 * servidor voltava a mandar para o login — foi esse o loop que o portal
 * já corrigiu e que não vale a pena repetir aqui.
 *
 * SEGUNDO FACTOR (TOTP), em dois passos na MESMA acção:
 *   1. e-mail + senha → `signInWithPassword`; a seguir lê o nível de
 *      garantia. Se a conta TEM factor verificado mas esta sessão só tem
 *      a senha (`nextLevel === 'aal2'` e `currentLevel !== 'aal2'`), abre
 *      um `challenge` e devolve `MFA_NECESSARIO` com o factor e o desafio;
 *   2. o código → `verify` e só aí é que se entra.
 *
 * O código NUNCA é validado no cliente: o que a UI faz é recolher seis
 * dígitos; quem decide se a sessão sobe para `aal2` é o Supabase Auth, no
 * servidor. E é o `aal2` da sessão (não um estado da UI) que
 * `requirePlatform` exige nas acções sensíveis.
 *
 * NÃO se registra na trilha `platform_audit_log`: entrar não é uma acção
 * da matriz (§3.2) e o princípio do módulo é que não há acções fora dela.
 * O que fica registado são as tentativas falhadas, no log (scope
 * `platform`), e os acessos no próprio Auth (`last_sign_in_at`).
 */

function texto(valor, limite = 200) {
  return String(valor ?? '')
    .trim()
    .slice(0, limite)
}

/**
 * Fecha o passo de autenticação: confirma que a conta que acabou de entrar
 * é mesmo da equipa (nível interno e farmácia activa não se aplicam aqui)
 * e só depois navega. Sem esta verificação, uma conta de farmácia entrava
 * na área interna e o layout expulsava-a de seguida — com o ecrã de erro
 * errado.
 */
async function entrar(supabase) {
  const { session } = await getPlatformSessionVerbose()
  if (!session) {
    // Não é da equipa (ou a conta está suspensa): fecha a sessão que se
    // acabou de abrir — meia sessão não serve para nada.
    await supabase.auth.signOut()
    return { ok: false, error: 'SEM_ACESSO_INTERNO' }
  }
  revalidatePath('/interno', 'layout')
  redirect('/interno')
}

export async function loginPlatform(_prevState, formData) {
  const email = texto(formData?.get('email'), 160).toLowerCase()
  const password = String(formData?.get('password') || '')
  // Só dígitos: os autenticadores escrevem «123 456» e a colagem traz
  // espaços — o código em si é sempre de seis dígitos.
  const code = String(formData?.get('code') || '').replace(/\D/g, '')
  const factorId = texto(formData?.get('factorId'), 64)
  const challengeId = texto(formData?.get('challengeId'), 64)

  try {
    const supabase = await createServerComponentClient()

    // ---- Passo 2: o código do autenticador ----
    if (code) {
      if (!factorId) return { ok: false, error: 'FALHA_ENTRAR' }
      let cid = challengeId
      if (!cid) {
        // Desafio expirado (ou nunca chegou): abre-se outro e pede-se o
        // código outra vez, em vez de deixar o ecrã preso.
        const { data, error } = await supabase.auth.mfa.challenge({ factorId })
        if (error) {
          logWarn('platform', 'Não foi possível abrir o desafio de MFA', { message: error.message })
          return { ok: false, error: 'MFA_FALHA' }
        }
        cid = data.id
      }
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: cid, code })
      if (error) {
        logWarn('platform', 'Código de segundo factor recusado', {
          email,
          message: error.message,
        })
        // `challengeId: null` de propósito: o próximo envio abre um desafio
        // novo (um código de um desafio expirado nunca entra).
        return { ok: false, error: 'MFA_CODIGO', factorId, challengeId: null }
      }
      return entrar(supabase)
    }

    // ---- Passo 1: e-mail + senha ----
    if (!email || !password) return { ok: false, error: 'CAMPOS_EM_FALTA' }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      logWarn('platform', 'Login da equipa falhou', { email, message: error.message })
      return {
        ok: false,
        error: error.message === 'Invalid login credentials' ? 'CREDENCIAIS' : 'FALHA_ENTRAR',
      }
    }

    // A conta tem segundo factor? Se sim, esta sessão ainda é `aal1` e não
    // vale para as acções sensíveis — pede-se o código ANTES de entrar.
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalErr) {
      logWarn('platform', 'Nível de garantia ilegível no login', { message: aalErr.message })
      await supabase.auth.signOut()
      return { ok: false, error: 'FALHA_ENTRAR' }
    }

    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const { data: fatores } = await supabase.auth.mfa.listFactors()
      const totp = (fatores?.totp || []).find((f) => f.status === 'verified')
      if (!totp) {
        logWarn('platform', 'Conta pede segundo factor sem TOTP verificado', { email })
        await supabase.auth.signOut()
        return { ok: false, error: 'MFA_SEM_FACTOR' }
      }
      const { data: desafio, error: desafioErr } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      })
      if (desafioErr) {
        logWarn('platform', 'Falha ao abrir o desafio de MFA', { message: desafioErr.message })
        await supabase.auth.signOut()
        return { ok: false, error: 'MFA_FALHA' }
      }
      return {
        ok: false,
        error: 'MFA_NECESSARIO',
        factorId: totp.id,
        challengeId: desafio.id,
        email,
      }
    }

    return entrar(supabase)
  } catch (err) {
    // redirect() lança NEXT_REDIRECT — tem de propagar, não virar erro.
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    logError('platform', 'Falha no login da área interna', { message: err?.message || String(err) })
    return { ok: false, error: 'FALHA_ENTRAR' }
  }
}

/** Terminar a sessão da equipa e voltar ao login. */
export async function logoutPlatform() {
  try {
    const supabase = await createServerComponentClient()
    await supabase.auth.signOut()
  } catch (err) {
    logError('platform', 'Falha ao terminar a sessão interna', {
      message: err?.message || String(err),
    })
  }
  revalidatePath('/interno', 'layout')
  redirect('/interno/login')
}
