import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logWarn } from '@/lib/log'

export const dynamic = 'force-dynamic'

/**
 * Confirmação da reposição de senha — o único sítio onde o `token_hash` do
 * e-mail é trocado por sessão.
 *
 * É o irmão de `/portal/convite/confirmar`: o link traz `token_hash` (o
 * `generateLink` do Supabase devolve-o; não usamos o `action_link`, que
 * passaria pelo remetente dele), e o `verifyOtp` escreve as cookies de
 * sessão no próprio request — por isso um Route Handler e não uma página:
 * Server Components não podem escrever cookies.
 *
 * O tipo é fixado em `recovery` (e não lido do URL): um link de convite
 * não pode ser reaproveitado aqui, nem o contrário. Qualquer falha volta à
 * página com um código legível, nunca com o erro cru do fornecedor.
 */
export async function GET(request) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash') || ''
  const tipo = request.nextUrl.searchParams.get('type') || 'recovery'
  const destino = new URL('/portal/recuperar', request.url)

  if (!tokenHash || tipo !== 'recovery') {
    destino.searchParams.set('erro', 'LINK_INVALIDO')
    return NextResponse.redirect(destino)
  }

  const supabase = await createServerComponentClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })

  if (error) {
    logWarn('pharmacy-portal', 'O link de reposição de senha não foi confirmado', {
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

  // Sessão criada. A página vê o utilizador e pede a senha nova; o token
  // não aparece no URL seguinte (não fica no histórico do browser).
  destino.searchParams.set('repor', '1')
  return NextResponse.redirect(destino)
}
