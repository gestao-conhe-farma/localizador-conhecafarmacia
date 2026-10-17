import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logWarn } from '@/lib/log'

export const dynamic = 'force-dynamic'

/**
 * Confirmação do convite — o único ponto onde o token é trocado por sessão.
 *
 * O link do e-mail traz `token_hash` (o `generateLink` devolve-o; não é o
 * `action_link` do Supabase, que passaria pelo remetente dele). Aqui o
 * hash é verificado pelo `verifyOtp`, que escreve as cookies de sessão no
 * próprio request — por isso é um Route Handler e não a página: Server
 * Components não podem escrever cookies, e a página seguinte já tem de
 * encontrar a pessoa autenticada para lhe pedir a senha.
 *
 * Qualquer falha volta à página com um código, nunca com o erro cru do
 * fornecedor: «expirado» e «inválido» pedem acções diferentes.
 */
export async function GET(request) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash') || ''
  const tipo = request.nextUrl.searchParams.get('type') || 'invite'
  const destino = new URL('/portal/convite', request.url)

  if (!tokenHash || tipo !== 'invite') {
    destino.searchParams.set('erro', 'LINK_INVALIDO')
    return NextResponse.redirect(destino)
  }

  const supabase = await createServerComponentClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })

  if (error) {
    logWarn('pharmacy-portal', 'O convite não foi confirmado', {
      message: error.message,
      code: error.code,
      status: error.status,
    })
    destino.searchParams.set(
      'erro',
      /expir|invalid|used/i.test(error.message || '') ? 'LINK_EXPIRADO' : 'LINK_INVALIDO',
    )
    return NextResponse.redirect(destino)
  }

  // Sessão criada. A página vê o utilizador e pede a senha; o token já não
  // aparece no URL seguinte (não fica no histórico do browser).
  destino.searchParams.set('convite', '1')
  return NextResponse.redirect(destino)
}
