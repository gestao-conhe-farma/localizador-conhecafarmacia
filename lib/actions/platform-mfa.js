'use server'

import { revalidatePath } from 'next/cache'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logError, logWarn } from '@/lib/log'

/**
 * SEGUNDO FACTOR da equipa CF — a inscrição do autenticador TOTP
 * (`/interno/mfa`, File Structure do plano).
 *
 * O login já sabia PEDIR o código (Task 4.1): `signInWithPassword` →
 * `challenge` → `verify`, em dois passos na mesma Server Action. O que
 * faltava era o caminho para uma conta vir a ter factor: sem ele, o TOTP
 * era inscrito à mão na consola do Supabase e a área interna não tinha como
 * cumprir o «TOTP obrigatório» da §«MFA das contas internas» — e uma sessão
 * `aal2` nunca era exercida em lado nenhum.
 *
 * TRÊS DECISÕES que valem a pena nomear:
 *
 *   1. O CÓDIGO NUNCA É VALIDADO AQUI. Quem sobe a sessão para `aal2` é o
 *      Supabase Auth, num `challengeAndVerify` no servidor. Este módulo
 *      recolhe seis dígitos e traduz a resposta — não compara nada.
 *   2. NADA FICA REGISTADO NA TRILHA, e é de propósito: `platform_audit_log`
 *      guarda acções DA MATRIZ (§3.2) e não existe acção para «inscrever o
 *      meu autenticador». Registar aqui uma acção fora da matriz abria
 *      exactamente a porta que o Phase 3 fechou. O rasto fica onde fica o do
 *      login: no Auth (`auth.mfa_factors.created_at`,
 *      `auth.users.last_sign_in_at`) e, para o que falhar, no log `platform`.
 *   3. BACKUP DO DISPOSITIVO NÃO É SELF-SERVICE. Este ecrã inscreve; não
 *      remove um factor VERIFICADO. Tirar o segundo factor a quem já o tem é
 *      o gesto clássico de quem roubou uma sessão (rebaixar a conta), e uma
 *      conta de equipa que troque de telefone passa por quem lhe gere o
 *      acesso (`team.manage`). O que aqui se pode descartar é uma inscrição
 *      POR ACABAR — que não abre porta nenhuma.
 */

/** Nome que o autenticador mostra na lista de códigos. */
const NOME_FACTOR = 'Equipa Conheça Farmácia'
const EMISSOR = 'Conheça Farmácia'

function cliente() {
  return createServerComponentClient()
}

function texto(valor, limite = 200) {
  return String(valor ?? '')
    .trim()
    .slice(0, limite)
}

/** Só dígitos: os autenticadores escrevem «123 456» e a colagem traz espaços. */
function normalizarCodigo(valor) {
  return String(valor ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
}

/** Tradução dos erros do GoTrue nos códigos que o ecrã sabe explicar. */
function codigoDoErro(error) {
  const c = String(error?.code || '')
  const msg = String(error?.message || '')
  if (
    c === 'mfa_verification_failed' ||
    c === 'mfa_challenge_expired' ||
    c === 'mfa_verification_rejected'
  ) {
    return 'CODIGO_INVALIDO'
  }
  if (c === 'over_request_rate_limit' || /rate limit|too many/i.test(msg))
    return 'DEMASIADAS_TENTATIVAS'
  if (c === 'mfa_totp_enroll_not_enabled') return 'TOTP_DESLIGADO'
  if (c === 'mfa_factor_name_conflict') return 'INSCRICAO_A_MEIO'
  if (c === 'mfa_verified_factor_exists' || c === 'too_many_enrolled_mfa_factors')
    return 'JA_INSCRITO'
  if (c === 'insufficient_aal') return 'SESSAO_CURTA'
  return 'MFA_FALHA'
}

/**
 * O QR pronto a pôr num `<img src>`: o GoTrue já o devolve como data-uri, mas
 * se uma versão futura devolver o SVG em bruto, o prefixo entra aqui — nunca
 * duplicado, que era o que deixava a imagem sem renderizar.
 */
function paraDataUri(qr) {
  const bruto = String(qr || '')
  if (!bruto) return null
  return bruto.startsWith('data:') ? bruto : `data:image/svg+xml;utf-8,${encodeURIComponent(bruto)}`
}

/** Uma linha de factor, com os nomes que o ecrã usa (a tabela tem outros). */
function paraEcra(f) {
  return {
    id: f.id,
    nome: f.friendly_name || 'Autenticador sem nome',
    tipo: f.factor_type,
    verificado: f.status === 'verified',
    criadoEm: f.created_at || null,
    ultimoDesafio: f.last_challenged_at || null,
  }
}

// ===============================================================
// Leitura
// ===============================================================

/**
 * Os factores da PRÓPRIA conta, para o ecrã saber em que estado está: sem
 * factor nenhum, com uma inscrição a meio, ou já com um autenticador activo.
 *
 * `listFactors()` devolve `all` (tudo, incluindo o que ficou por verificar) e
 * atalhos só com o que está verificado — é a lista completa que o ecrã
 * precisa, porque uma inscrição abandonada tem de ser visível para poder ser
 * descartada.
 */
export async function getMfaFatores() {
  try {
    const supabase = await cliente()
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      logWarn('platform', 'Não foi possível listar os factores de MFA da conta', {
        code: error.code,
        message: error.message,
      })
      return { ok: false, error: 'MFA_LEITURA' }
    }

    const fatores = (data?.all || []).map(paraEcra)
    return {
      ok: true,
      fatores,
      verificado: fatores.find((f) => f.verificado) || null,
      porAcabar: fatores.filter((f) => !f.verificado),
    }
  } catch (err) {
    logError('platform', 'Falha ao ler os factores de MFA da conta', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'MFA_LEITURA' }
  }
}

// ===============================================================
// Inscrição
// ===============================================================

/**
 * Começa uma inscrição TOTP e devolve o que só se pode mostrar UMA vez: o
 * `secret` e o código QR que o contém.
 *
 * Antes de inscrever, descarta as inscrições POR ACABAR da própria conta (só
 * as não verificadas — nunca uma activa): são tentativas abandonadas que não
 * dão acesso a nada e que fariam a inscrição nova colidir com o nome do
 * factor (`mfa_factor_name_conflict`). O ecrã mostra-as e deixa descartá-las
 * à mão; aqui limpa-se o resto para que «Começar» funcione sempre.
 *
 * Esta função NÃO devolve um desafio: quem quiser confirmar o código chama
 * `confirmarInscricao()`, que abre o desafio e verifica na mesma chamada
 * (`challengeAndVerify`) — um desafio guardado no cliente é um desafio que
 * expira entre dois cliques e um estado a mais para manter.
 */
export async function iniciarInscricao() {
  try {
    const supabase = await cliente()

    const { data: sessao } = await supabase.auth.getUser()
    if (!sessao?.user) return { ok: false, error: 'SEM_SESSAO' }

    const { data: atuais, error: errLista } = await supabase.auth.mfa.listFactors()
    if (errLista) {
      logWarn('platform', 'Inscrição de MFA: factores ilegíveis', { message: errLista.message })
      return { ok: false, error: 'MFA_FALHA' }
    }

    const todos = atuais?.all || []
    if (todos.some((f) => f.factor_type === 'totp' && f.status === 'verified')) {
      // Já tem: uma conta com dois TOTP activos é um backup a mais sem
      // ninguém a saber qual é qual. Trocar de telefone passa por quem gere
      // o acesso da equipa.
      return { ok: false, error: 'JA_INSCRITO' }
    }

    for (const f of todos.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
      if (error) {
        logWarn('platform', 'Não foi possível descartar a inscrição de MFA por acabar', {
          message: error.message,
        })
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: NOME_FACTOR,
      issuer: EMISSOR,
    })
    if (error) {
      const codigo = codigoDoErro(error)
      logError('platform', 'A inscrição do autenticador não começou', {
        code: error.code,
        message: error.message,
        traduzido: codigo,
      })
      return { ok: false, error: codigo, detalhe: error.message }
    }

    return {
      ok: true,
      factorId: data.id,
      // `qr_code` já vem do GoTrue como data-uri completo
      // (`data:image/svg+xml;utf-8,<svg…>`), apesar de a documentação antiga
      // do supabase-js mostrar um prefixo a juntar à mão. Juntar outro dava
      // um `data:` dentro de um `data:` — e a imagem ficava partida. Só se
      // acrescenta o prefixo se ele faltar. O `secret` fica para quem não
      // consegue ler o QR.
      qrCode: paraDataUri(data.totp?.qr_code),
      secret: data.totp?.secret || null,
      uri: data.totp?.uri || null,
      nome: data.friendly_name || NOME_FACTOR,
    }
  } catch (err) {
    logError('platform', 'Falha ao iniciar a inscrição do autenticador', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'MFA_FALHA' }
  }
}

/**
 * Confirma o código do autenticador e sobe a SESSÃO para `aal2`.
 *
 * Um desafio novo por tentativa (`challengeAndVerify`): um código de um
 * desafio expirado nunca entra, e o utilizador que se engana a escrever
 * tenta outra vez sem ter de recomeçar a inscrição — o factor continua
 * por verificar e a inscrição continua de pé.
 */
export async function confirmarInscricao({ factorId, code } = {}) {
  const id = texto(factorId, 64)
  const digitos = normalizarCodigo(code)
  if (!id) return { ok: false, error: 'MFA_FALHA' }
  if (digitos.length !== 6) return { ok: false, error: 'CODIGO_INVALIDO' }

  try {
    const supabase = await cliente()

    const { data: sessao } = await supabase.auth.getUser()
    if (!sessao?.user) return { ok: false, error: 'SEM_SESSAO' }

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: id,
      code: digitos,
    })
    if (error) {
      const codigo = codigoDoErro(error)
      logWarn('platform', 'Código do autenticador recusado na inscrição', {
        code: error.code,
        message: error.message,
        traduzido: codigo,
      })
      return { ok: false, error: codigo, detalhe: error.message }
    }

    // A sessão desta resposta é `aal2` e as cookies do servidor já a levam
    // (o cliente é o do servidor): o shell tem de ser redesdobrado para o
    // dizer, e é isto que faz as acções sensíveis passarem a valer sem novo
    // login.
    revalidatePath('/interno', 'layout')

    return {
      ok: true,
      nivel: 'aal2',
      // O nível de garantia que o Auth devolveu (o mesmo que a sessão usa).
      metodos: (data?.user?.factors || []).map((f) => f.factor_type),
    }
  } catch (err) {
    logError('platform', 'Falha ao confirmar o código do autenticador', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'MFA_FALHA' }
  }
}

/**
 * Descarta uma inscrição POR ACABAR (o QR que ninguém leu, o código que não
 * entrou). NÃO remove um factor verificado: isso é o caminho de quem perdeu o
 * telefone e tem de passar por quem gere o acesso da equipa (`team.manage`) —
 * uma remoção self-service de segundo factor é o gesto clássico de quem
 * roubou uma sessão.
 */
export async function cancelarInscricao({ factorId } = {}) {
  const id = texto(factorId, 64)
  if (!id) return { ok: false, error: 'MFA_FALHA' }

  try {
    const supabase = await cliente()

    const { data: atuais, error: errLista } = await supabase.auth.mfa.listFactors()
    if (errLista) return { ok: false, error: 'MFA_FALHA' }

    const alvo = (atuais?.all || []).find((f) => f.id === id)
    if (!alvo) return { ok: false, error: 'FACTOR_DESCONHECIDO' }
    if (alvo.status === 'verified') return { ok: false, error: 'FACTOR_PROTEGIDO' }

    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    if (error) {
      logError('platform', 'Não foi possível descartar a inscrição por acabar', {
        code: error.code,
        message: error.message,
      })
      return { ok: false, error: 'MFA_FALHA' }
    }

    revalidatePath('/interno/mfa')
    return { ok: true }
  } catch (err) {
    logError('platform', 'Falha ao descartar a inscrição por acabar', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'MFA_FALHA' }
  }
}
