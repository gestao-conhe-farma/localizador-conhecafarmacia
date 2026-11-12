'use server'

import { createHash } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerComponentClient } from '@/lib/supabase/server'
import { encerrarSessao } from '@/lib/supabase/sign-out'
import { emailRef } from '@/lib/email-ref'
import { logError, logWarn } from '@/lib/log'
import {
  RECOVERY_MARKER as MARCADOR,
  RECOVERY_MARKER_TTL_MS as MARCADOR_TTL_MS,
  assinaturaMarcador,
  verifyRecoveryMarker,
} from '@/lib/recovery-marker'

/**
 * REPOSIÇÃO DE SENHA DO PORTAL — assistente em quatro passos.
 *
 *   1. e-mail  — existe conta de FARMÁCIA com este endereço? A pergunta é
 *                feita antes de enviar nada: o projecto é partilhado com o
 *                site principal e com o interno, e um e-mail de lá também
 *                existe em `auth.users` — `signInWithOtp` mandava-lhe o
 *                código, ou seja, a reposição do portal servia contas de
 *                outras áreas. A pertença lê-se em `localizador.admin_users
 *                (role 'farmacia' com farmácia), que é o que o portal exige
 *                para entrar.
 *   2. código  — o código de 8 dígitos do e-mail → sessão `aal1`.
 *   3. TOTP    — só para contas com autenticador: sobe a sessão a `aal2`.
 *   4. senha   — `updateUser({ password })` e fecho da sessão.
 *
 * Porque é que o código do e-mail não substitui o autenticador: prova acesso
 * à caixa de correio, que é o mesmo canal do link de recuperação. Uma conta
 * com TOTP continua a precisar do código do autenticador, e é o Supabase que
 * o exige — `updateUser({ password })` responde `insufficient_aal` em `aal1`.
 * O passo 4 volta a verificar isso no servidor: o `passo` vem do formulário e
 * não é uma autorização.
 *
 * Toda a decisão de «que passo mostrar» é do servidor: cada resposta traz
 * `etapa`, e o cliente limita-se a desenhá-la. Nada de estado de segurança
 * no browser.
 */

const MIN = 8
const MAX = 72

/** `mailer_otp_length` do projecto é 8; o TOTP do autenticador é 6. */
const DIGITOS_EMAIL = 8
const DIGITOS_TOTP = 6

/**
 * Marca a reposição em curso (M7 da auditoria).
 *
 * Sem ela, uma sessão `aal1` nesta página podia ser a de qualquer pessoa já
 * autenticada — e essa vê o formulário do link da equipa, não o assistente.
 * Chamar `definirSenha` directamente com essa sessão saltava o código do
 * e-mail; ter o cookie escrito e nunca lido não provava nada.
 *
 * O valor é ASSINADO e ligado ao utilizador: `userId.expiraMs.hmac`, com o
 * segredo derivado da chave de serviço e separação de domínio. Um valor
 * forjado pelo browser (o atacante tem sessão, logo pode escrever cookies)
 * não passa na assinatura, e um marcador emitido para outra conta não serve.
 * Uso único: é apagado quando a senha é guardada e expira em 15 minutos.
 */


const UUID_NAO_INTERESSA = /[^a-z0-9@._+-]/g

function normalizarEmail(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .replace(UUID_NAO_INTERESSA, '')
    .slice(0, 200)
}

function normalizarDigitos(valor, maximo) {
  return String(valor ?? '')
    .replace(/\D/g, '')
    .slice(0, maximo)
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

/** Limite por conta e por IP — o ataque real é adivinhar código de um alvo. */
async function dentroDosLimites(admin, ambito, email, porConta, porIp) {
  const ip = await ipDoPedido()
  const [contaOk, ipOk] = await Promise.all([
    dentroDoLimite(admin, chaveLimite(`recovery-${ambito}-conta`, email), porConta, 3600),
    dentroDoLimite(admin, chaveLimite(`recovery-${ambito}-ip`, ip), porIp, 3600),
  ])
  return contaOk && ipOk
}

/** Escreve/renova o marcador para `userId`; sem `userId`, apaga-o. */
async function marcarReposicao(userId) {
  const store = await cookies()
  if (!userId) {
    store.set(MARCADOR, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/portal',
      maxAge: 0,
    })
    return
  }
  const exp = String(Date.now() + MARCADOR_TTL_MS)
  const payload = `${userId}.${exp}`
  store.set(MARCADOR, `${payload}.${assinaturaMarcador(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/portal',
    maxAge: MARCADOR_TTL_MS / 1000,
  })
}

/**
 * Esta sessão passou pelo código do e-mail para `userId`? Falha fechado: sem
 * cookie, com assinatura inválida, expirado ou de outra conta, é `false`.
 */
async function reposicaoDe(userId) {
  try {
    const raw = (await cookies()).get(MARCADOR)?.value
    return verifyRecoveryMarker(raw, userId)
  } catch {
    return false
  }
}

/**
 * Só contas do PORTAL repõem por aqui — o interno tem o seu caminho.
 *
 * `role = 'farmacia'` **e** farmácia associada: um `superadmin` de plataforma
 * mora na mesma tabela com `pharmacy_id` nulo e não é conta de portal.
 */
async function perfilDeFarmacia(admin, userId) {
  const { data, error } = await admin
    .from('admin_users')
    .select('role, pharmacy_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    logError('pharmacy-portal', 'Reposição de senha: perfil ilegível', {
      userId,
      message: error.message,
    })
    return { ok: false, error: 'FALHA' }
  }
  if (!data || data.role !== 'farmacia' || !data.pharmacy_id) {
    return { ok: false, error: 'SEM_ACESSO_PORTAL' }
  }
  return { ok: true }
}

/**
 * `userId` de um e-mail. O schema `localizador` não guarda endereços (só
 * `user_id`); a correspondência vive em `auth.users`, e é o admin API que a
 * dá sem uma varredura por SQL.
 *
 * Devolve `null` quando não há conta e `undefined` quando a leitura falhou —
 * as duas coisas parecem iguais ao utilizador e são muito diferentes aqui:
 * «não existe» é uma resposta, «não consegui ver» não pode virar
 * «não existe».
 */
async function idDoEmail(admin, email) {
  try {
    for (let pagina = 1; pagina <= 5; pagina += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
      if (error) throw error
      const encontrado = (data?.users || []).find(
        (u) => String(u.email || '').toLowerCase() === email,
      )
      if (encontrado) return encontrado.id
      if (!data?.nextPage || data.nextPage <= pagina) return null
    }
    return null
  } catch (err) {
    logError('pharmacy-portal', 'Reposição de senha: contas ilegíveis', {
      message: err?.message || String(err),
    })
    return undefined
  }
}

async function factoTotp(supabase) {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { error }
  const factor = (data?.all || []).find(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  )
  return { factor: factor || null }
}

function pareceLimiteDePedidos(err) {
  const codigo = String(err?.code || '')
  return (
    codigo === 'over_request_rate_limit' ||
    codigo === 'over_email_send_rate_limit' ||
    /rate limit|too many/i.test(String(err?.message || ''))
  )
}

/**
 * Códigos de erro que a UI traduz:
 *   EMAIL_INVALIDO · SEM_CONTA · CODIGO_INVALIDO · CODIGO_EXPIRADO ·
 *   TOTP_INVALIDO · TOTP_NECESSARIO · SEM_FACTOR · SEM_ACESSO_PORTAL ·
 *   SENHA_CURTA · SENHA_LONGA · SENHAS_DIFERENTES · SENHA_IGUAL ·
 *   SENHA_FALHOU · SESSAO_EXPIRADA · DEMASIADAS_TENTATIVAS · ESPERAR · FALHA
 *
 * `etapa` diz sempre onde a pessoa está: um erro não a faz recuar sem querer.
 */
export async function reporSenhaPortal(prevState, formData) {
  const passo = String(formData?.get('passo') || 'email')
  const email = normalizarEmail(formData?.get('email'))

  try {
    const admin = createAdminClient()

    if (passo === 'email') return await pedirCodigo(admin, email)
    if (passo === 'codigo') return await confirmarCodigoEmail(admin, email, formData)
    if (passo === 'totp') return await confirmarTotp(email, formData)
    if (passo === 'senha') return await definirSenha(admin, email, formData)

    return { ok: false, error: 'FALHA', etapa: 'email' }
  } catch (err) {
    logError('pharmacy-portal', 'Falha na reposição de senha do portal', {
      passo,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA', etapa: prevState?.etapa || 'email' }
  }
}

// ---------------------------------------------------------------- passo 1
async function pedirCodigo(admin, email) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'EMAIL_INVALIDO', etapa: 'email' }
  }

  // 4 e-mails por hora e por conta: chega para reenviar, não chega para
  // encher uma caixa de correio. O projecto inteiro só tem 30/h.
  if (!(await dentroDosLimites(admin, 'email', email, 4, 20))) {
    return { ok: false, error: 'DEMASIADAS_TENTATIVAS', etapa: 'email' }
  }

  // A pertença ao portal decide-se ANTES do envio: sem isto, um e-mail do
  // site principal ou do interno recebia o código e entrava no assistente.
  const userId = await idDoEmail(admin, email)
  if (userId === undefined) return { ok: false, error: 'FALHA', etapa: 'email' }
  if (!userId) {
    logWarn('pharmacy-portal', 'Reposição de senha pedida para conta inexistente', {
      emailRef: emailRef(email),
    })
    return { ok: false, error: 'SEM_CONTA', etapa: 'email' }
  }

  const perfil = await perfilDeFarmacia(admin, userId)
  if (!perfil.ok) {
    if (perfil.error === 'FALHA') return { ok: false, error: 'FALHA', etapa: 'email' }
    logWarn('pharmacy-portal', 'Reposição de senha pedida para conta de outra área', {
      emailRef: emailRef(email),
    })
    return { ok: false, error: 'SEM_CONTA', etapa: 'email' }
  }

  const supabase = await createServerComponentClient({ area: 'portal' })
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (error) {
    // Corrida perdida: a conta desapareceu entre a verificação e o envio.
    if (error.code === 'otp_disabled' || /signups not allowed/i.test(error.message || '')) {
      logWarn('pharmacy-portal', 'Reposição de senha: conta desapareceu antes do envio', {
        emailRef: emailRef(email),
      })
      return { ok: false, error: 'SEM_CONTA', etapa: 'email' }
    }
    // O GoTrue só deixa reenviar para a mesma conta depois de um minuto;
    // «demasiadas tentativas» seria mentira e assustaria sem razão.
    if (error.code === 'over_email_send_rate_limit' || /once every|\bseconds\b/i.test(error.message || '')) {
      return { ok: false, error: 'ESPERAR', etapa: 'email', email }
    }
    if (pareceLimiteDePedidos(error)) {
      return { ok: false, error: 'DEMASIADAS_TENTATIVAS', etapa: 'email', email }
    }
    logError('pharmacy-portal', 'Não foi possível enviar o código de reposição', {
      emailRef: emailRef(email),
      code: error.code,
      message: error.message,
    })
    return { ok: false, error: 'FALHA', etapa: 'email' }
  }

  logWarn('pharmacy-portal', 'Código de reposição enviado', { emailRef: emailRef(email) })
  return { ok: true, etapa: 'codigo', email, digitos: DIGITOS_EMAIL }
}

// ---------------------------------------------------------------- passo 2
async function confirmarCodigoEmail(admin, email, formData) {
  const codigo = normalizarDigitos(formData?.get('codigo'), DIGITOS_EMAIL)

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'EMAIL_INVALIDO', etapa: 'email' }
  }
  if (codigo.length !== DIGITOS_EMAIL) {
    return { ok: false, error: 'CODIGO_INVALIDO', etapa: 'codigo', email }
  }
  if (!(await dentroDosLimites(admin, 'codigo', email, 10, 30))) {
    return { ok: false, error: 'DEMASIADAS_TENTATIVAS', etapa: 'codigo', email }
  }

  const supabase = await createServerComponentClient({ area: 'portal' })
  const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })

  if (error || !data?.user?.id) {
    const expirou = error?.code === 'otp_expired' || /expired/i.test(error?.message || '')
    logWarn('pharmacy-portal', 'Código de reposição recusado', {
      emailRef: emailRef(email),
      code: error?.code,
    })
    if (pareceLimiteDePedidos(error)) {
      return { ok: false, error: 'DEMASIADAS_TENTATIVAS', etapa: 'codigo', email }
    }
    return { ok: false, error: expirou ? 'CODIGO_EXPIRADO' : 'CODIGO_INVALIDO', etapa: 'codigo', email }
  }

  const perfil = await perfilDeFarmacia(admin, data.user.id)
  if (!perfil.ok) {
    await encerrarSessao(supabase)
    return { ok: false, error: perfil.error, etapa: 'email' }
  }

  await marcarReposicao(data.user.id)

  const { factor, error: errFatores } = await factoTotp(supabase)
  if (errFatores) {
    logError('pharmacy-portal', 'Reposição de senha: factores ilegíveis', {
      userId: data.user.id,
      message: errFatores.message,
    })
    return { ok: false, error: 'FALHA', etapa: 'codigo', email }
  }

  logWarn('pharmacy-portal', 'Reposição de senha: e-mail confirmado', {
    userId: data.user.id,
    comTotp: Boolean(factor),
  })
  return {
    ok: true,
    etapa: factor ? 'totp' : 'senha',
    email,
    digitos: factor ? DIGITOS_TOTP : undefined,
  }
}

// ---------------------------------------------------------------- passo 3
async function confirmarTotp(email, formData) {
  const codigo = normalizarDigitos(formData?.get('codigo'), DIGITOS_TOTP)
  const supabase = await createServerComponentClient({ area: 'portal' })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'SESSAO_EXPIRADA', etapa: 'email' }
  if (!(await reposicaoDe(user.id))) {
    return { ok: false, error: 'REPOSICAO_NAO_INICIADA', etapa: 'email' }
  }

  const { factor, error } = await factoTotp(supabase)
  if (error) {
    logError('pharmacy-portal', 'Reposição de senha: factores ilegíveis', {
      userId: user.id,
      message: error.message,
    })
    return { ok: false, error: 'FALHA', etapa: 'totp', email }
  }
  // Conta sem autenticador (inscreveu-o noutro separador, por exemplo):
  // não há nada a provar — segue para a senha.
  if (!factor) return { ok: true, etapa: 'senha', email }

  if (codigo.length !== DIGITOS_TOTP) {
    return { ok: false, error: 'TOTP_INVALIDO', etapa: 'totp', email }
  }

  const { error: errCodigo } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: codigo,
  })
  if (errCodigo) {
    logWarn('pharmacy-portal', 'Reposição de senha recusada: código TOTP', {
      userId: user.id,
      code: errCodigo.code,
    })
    if (pareceLimiteDePedidos(errCodigo)) {
      return { ok: false, error: 'DEMASIADAS_TENTATIVAS', etapa: 'totp', email }
    }
    return { ok: false, error: 'TOTP_INVALIDO', etapa: 'totp', email }
  }

  return { ok: true, etapa: 'senha', email }
}

// ---------------------------------------------------------------- passo 4
async function definirSenha(admin, email, formData) {
  const password = String(formData?.get('password') ?? '')
  const confirmacao = String(formData?.get('password2') ?? '')

  const supabase = await createServerComponentClient({ area: 'portal' })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'SESSAO_EXPIRADA', etapa: 'email' }

  if (!(await reposicaoDe(user.id))) {
    return { ok: false, error: 'REPOSICAO_NAO_INICIADA', etapa: 'email' }
  }

  const perfil = await perfilDeFarmacia(admin, user.id)
  if (!perfil.ok) {
    await encerrarSessao(supabase)
    await marcarReposicao(null)
    return { ok: false, error: perfil.error, etapa: 'email' }
  }

  if (password.length < MIN) return { ok: false, error: 'SENHA_CURTA', etapa: 'senha', email }
  if (password.length > MAX) return { ok: false, error: 'SENHA_LONGA', etapa: 'senha', email }
  if (password !== confirmacao) {
    return { ok: false, error: 'SENHAS_DIFERENTES', etapa: 'senha', email }
  }

  // O `passo` do formulário não é autorização: se a conta tem factor, esta
  // sessão tem de estar em `aal2` — senão o Supabase recusa e a mensagem
  // seria um «tente outra vez» sem saída.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
    return { ok: false, error: 'TOTP_NECESSARIO', etapa: 'totp', email }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    logError('pharmacy-portal', 'Reposição de senha não guardada', {
      userId: user.id,
      code: error.code,
      message: error.message,
    })
    if (error.code === 'insufficient_aal') {
      return { ok: false, error: 'TOTP_NECESSARIO', etapa: 'totp', email }
    }
    if (/different from the old|same (as the )?(old|current) password/i.test(error.message || '')) {
      return { ok: false, error: 'SENHA_IGUAL', etapa: 'senha', email }
    }
    return { ok: false, error: 'SENHA_FALHOU', etapa: 'senha', email }
  }

  // Sem sessão pendurada: quem repôs entra pelo login, com a senha nova.
  await encerrarSessao(supabase)
  await marcarReposicao(null)

  logWarn('pharmacy-portal', 'Senha do portal reposta', {
    userId: user.id,
    emailRef: emailRef(email || user.email || ''),
  })

  return { ok: true, feito: true, etapa: 'fim', email }
}
