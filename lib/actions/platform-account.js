'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerComponentClient } from '@/lib/supabase/server'
import { getPlatformSession } from '@/lib/platform/session'
import { logError, logWarn } from '@/lib/log'

/**
 * A PRÓPRIA CONTA da equipa — `/interno/definicoes`.
 *
 * É o mesmo princípio do segundo factor (`platform-mfa.js`): estas acções
 * não passam pela matriz de permissões porque não são coisas que se fazem a
 * OUTRÉM. A autorização é ter sessão interna; o alcance é sempre o
 * `user_id` da sessão, nunca um id que venha do formulário.
 *
 * O que aqui se pode mudar: o nome (o que aparece na sidebar), a senha e as
 * outras sessões. O e-mail e o nível NÃO se mudam daqui — o e-mail exige
 * confirmação e o nível é decisão de quem gere a equipa (`team.manage`).
 * O MFA tem o seu próprio ecrã (`/interno/mfa`) e é embebido nas
 * definições, mas as acções continuam em `platform-mfa.js`.
 */

const NOME_MIN = 2
const NOME_MAX = 80
const SENHA_MIN = 8
const SENHA_MAX = 72

function texto(valor, limite) {
  return String(valor ?? '')
    .trim()
    .slice(0, limite)
}

/** Nome de exibição: espaços colapsados, para «Ana   Silva» não passar. */
function normalizarNome(valor) {
  return texto(valor, NOME_MAX + 1).replace(/\s+/g, ' ')
}

// ===============================================================
// Nome
// ===============================================================

/**
 * Muda o nome da própria conta.
 *
 * A escrita na `admin_users` usa o cliente de serviço porque só existe
 * policy de LEITURA da própria linha (0001) — e uma policy de update
 * aberta deixaria a pessoa mexer no próprio `role`/`pharmacy_id`. Aqui o
 * service role é usado com o único campo que o ecrã mostra e filtrado pelo
 * `user_id` da sessão: não há id de fora que possa apontar para outra conta.
 *
 * O `user_metadata.display_name` é actualizado a seguir para o convite e o
 * resto do Auth lerem o mesmo nome. Se essa segunda escrita falhar, o nome
 * da base já está certo e o log diz o que ficou por sincronizar.
 */
export async function alterarNome(_prevState, formData) {
  const session = await getPlatformSession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  const nome = normalizarNome(formData?.get('nome'))
  if (nome.length < NOME_MIN) return { ok: false, error: 'NOME_INVALIDO', campo: 'nome' }
  if (nome.length > NOME_MAX) return { ok: false, error: 'NOME_LONGO', campo: 'nome' }

  if (nome === (session.profile?.display_name || '')) {
    return { ok: true, actualizado: false, nome }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('admin_users')
      .update({ display_name: nome })
      .eq('user_id', session.user.id)
    if (error) throw error

    const supabase = await createServerComponentClient()
    const { error: errMeta } = await supabase.auth.updateUser({ data: { display_name: nome } })
    if (errMeta) {
      logWarn('platform', 'O nome ficou na base mas não no metadata do Auth', {
        userId: session.user.id,
        message: errMeta.message,
      })
    }

    // O layout lê o nome para o rodapé da sidebar; sem isto o ecrã seguinte
    // continuava a mostrar o antigo até um reload.
    revalidatePath('/interno', 'layout')
    return { ok: true, actualizado: true, nome }
  } catch (err) {
    logError('platform', 'Falha ao mudar o nome da conta', {
      userId: session.user.id,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}

// ===============================================================
// Senha
// ===============================================================

/**
 * Muda a senha, exigindo a actual.
 *
 * A senha actual é confirmada num cliente DESCARTÁVEL (sem cookies, sem
 * persistência), e não no cliente da sessão: um `signInWithPassword` no
 * cliente da sessão substituía o token e podia baixar a sessão de `aal2`
 * para `aal1` a meio da mudança. O cliente descartável prova a credencial e
 * é deitado fora — sem `signOut()`, cujo âmbito por omissão é GLOBAL e
 * terminaria também a sessão que está a ser usada (e todas as outras).
 *
 * A senha nova nunca é registada em log. Só o código do erro.
 */
export async function alterarSenha(_prevState, formData) {
  const session = await getPlatformSession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  const atual = String(formData?.get('atual') ?? '')
  const nova = String(formData?.get('nova') ?? '')
  const confirmar = String(formData?.get('confirmar') ?? '')

  if (!atual || !nova) return { ok: false, error: 'CAMPOS_EM_FALTA' }
  if (nova.length < SENHA_MIN) return { ok: false, error: 'SENHA_CURTA', campo: 'nova' }
  if (nova.length > SENHA_MAX) return { ok: false, error: 'SENHA_LONGA', campo: 'nova' }
  if (nova !== confirmar) return { ok: false, error: 'SENHAS_DIFERENTES', campo: 'confirmar' }
  if (nova === atual) return { ok: false, error: 'SENHA_IGUAL', campo: 'nova' }

  const email = session.user?.email
  if (!email) return { ok: false, error: 'FALHA' }

  try {
    const verificador = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
    const { error: errCredencial } = await verificador.auth.signInWithPassword({
      email,
      password: atual,
    })

    if (errCredencial) {
      if (
        errCredencial.status === 429 ||
        /rate limit|too many/i.test(errCredencial.message || '')
      ) {
        return { ok: false, error: 'DEMASIADAS_TENTATIVAS' }
      }
      if (/invalid login credentials/i.test(errCredencial.message || '')) {
        return { ok: false, error: 'SENHA_ACTUAL_ERRADA', campo: 'atual' }
      }
      logWarn('platform', 'Não foi possível confirmar a senha actual', {
        userId: session.user.id,
        message: errCredencial.message,
      })
      return { ok: false, error: 'FALHA' }
    }

    const supabase = await createServerComponentClient()
    const { error } = await supabase.auth.updateUser({ password: nova })
    if (error) {
      const c = String(error.code || '')
      if (c === 'same_password') return { ok: false, error: 'SENHA_IGUAL', campo: 'nova' }
      if (c === 'weak_password') return { ok: false, error: 'SENHA_FRACA', campo: 'nova' }
      if (error.status === 429 || /rate limit|too many/i.test(error.message || '')) {
        return { ok: false, error: 'DEMASIADAS_TENTATIVAS' }
      }
      logError('platform', 'A senha da conta não foi alterada', {
        userId: session.user.id,
        code: error.code,
        message: error.message,
      })
      return { ok: false, error: 'FALHA' }
    }

    return { ok: true, mudou: true }
  } catch (err) {
    logError('platform', 'Falha ao alterar a senha da conta', {
      userId: session.user.id,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}

// ===============================================================
// Sessões
// ===============================================================

/**
 * Termina as OUTRAS sessões, mantendo esta.
 *
 * É o gesto certo depois de uma senha partilhada ou de um portátil perdido:
 * o token desta sessão continua a servir, os restantes deixam de renovar.
 * Terminar TAMBÉM esta seria sair — e para isso já existe o botão do rodapé;
 * um botão que faz as duas coisas com o mesmo nome era uma armadilha.
 */
export async function terminarOutrasSessoes() {
  const session = await getPlatformSession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }

  try {
    const supabase = await createServerComponentClient()
    // `others` não dispara SIGNED_OUT e não toca nas cookies desta sessão.
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) {
      logWarn('platform', 'Não foi possível terminar as outras sessões', {
        userId: session.user.id,
        message: error.message,
      })
      return { ok: false, error: 'FALHA' }
    }
    return { ok: true, terminadas: true }
  } catch (err) {
    logError('platform', 'Falha ao terminar as outras sessões', {
      userId: session.user.id,
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}
