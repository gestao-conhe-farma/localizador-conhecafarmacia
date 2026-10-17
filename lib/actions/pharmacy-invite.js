'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logError } from '@/lib/log'

/**
 * O último passo do convite: o dono define a PRÓPRIA senha.
 *
 * O token já foi confirmado em `/portal/convite/confirmar` (Route Handler),
 * que é o único sítio onde as cookies de sessão podem ser escritas antes de
 * a página renderizar. Aqui só existe sessão — e é isso que autoriza a
 * mudança: sem `getUser()` não há senha nenhuma para definir.
 *
 * O mínimo de 8 caracteres é nosso (o Supabase aceita 6 por omissão); não
 * há regras de composição porque elas empurram as pessoas para «Password1!».
 * O tecto de 72 bytes é do bcrypt do Supabase — acima disso a senha é
 * truncada em silêncio, e é melhor dizê-lo do que deixar a pessoa pensar
 * que a segunda metade conta.
 */

const MIN = 8
const MAX = 72

export async function definirSenhaConvite(_prevState, formData) {
  const password = String(formData?.get('password') ?? '')
  const confirmacao = String(formData?.get('password2') ?? '')

  if (password.length < MIN) return { ok: false, error: 'SENHA_CURTA' }
  if (password.length > MAX) return { ok: false, error: 'SENHA_LONGA' }
  if (password !== confirmacao) return { ok: false, error: 'SENHAS_DIFERENTES' }

  try {
    const supabase = await createServerComponentClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Sem sessão o token não foi confirmado (ou expirou entre os dois
    // pedidos). Não se cria sessão aqui: `updateUser` sem utilizador
    // autenticado não teria a quem aplicar a senha.
    if (!user) return { ok: false, error: 'SEM_SESSAO' }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      logError('pharmacy-portal', 'A senha do convite não foi guardada', {
        userId: user.id,
        message: error.message,
        code: error.code,
      })
      return { ok: false, error: 'SENHA_FALHOU' }
    }

    revalidatePath('/portal', 'layout')
    redirect('/portal')
  } catch (err) {
    // redirect() lança NEXT_REDIRECT — tem de propagar.
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    logError('pharmacy-portal', 'Falha ao definir a senha do convite', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}
