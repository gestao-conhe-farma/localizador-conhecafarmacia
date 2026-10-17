import { SITE_URL } from '@/lib/constants'
import { emailConfigurado, emailConvite, enviarEmail } from '@/lib/email'
import { logError } from '@/lib/log'

/**
 * O CONVITE AO DONO da farmácia — o mesmo para a conversão de um lead
 * (`lib/actions/leads.js`) e para o reenvio na ficha (`platform-pharmacies.js`).
 *
 * Vive fora das Server Actions de propósito: as duas portas fazem a MESMA
 * coisa (gerar o link e entregá-lo), e duplicar isto era a maneira mais
 * fácil de o reenvio passar a gerar um link diferente do convite — com o
 * `type` errado na rota de confirmação ou sem o `admin_users` que dá acesso
 * ao portal.
 *
 * O e-mail NÃO sai pelo Supabase. `generateLink` só cria (ou reaproveita) a
 * conta por confirmar e devolve o token; a entrega é feita pelo Resend, que
 * não tem o limite de 2 mensagens/hora nem a restrição de destinatários do
 * remetente integrado (Task 6.1 do plano). Isso também nos deixa escrever o
 * e-mail em português e com a marca, em vez de depender do template do Auth.
 *
 * O LINK também é nosso: em vez do `action_link` (que passa pelo
 * `/auth/v1/verify` do Supabase e devolveria a sessão num fragmento que o
 * servidor não lê), usamos o `hashed_token` e apontamos para
 * `/portal/convite/confirmar`, onde o `verifyOtp` escreve as cookies e a
 * pessoa define a senha na página seguinte.
 *
 * Se o envio falhar, a conta fica criada mas POR CONFIRMAR e o link não
 * chegou a ninguém: repetir a operação volta a chamar `generateLink`, que
 * devolve um link novo para a mesma conta (medido em 17/10/2026 — segunda
 * chamada devolve o mesmo `user.id` e um `action_link` novo), e reenvia.
 * É exactamente isso que o «Reenviar convite» faz.
 *
 * Os erros são traduzidos em códigos porque a equipa tem de saber o que
 * fazer a seguir: e-mail já com conta (reposição de senha), falha de
 * configuração do Resend, e o resto (a investigar).
 */
export async function convidarDono({ admin, farmacia, email, nome }) {
  // Sem chave não se cria a conta: um convite gerado e não entregue deixaria
  // um utilizador por confirmar à espera de um e-mail que nunca saiu. O erro
  // é de configuração e a mensagem diz qual variável falta.
  if (!emailConfigurado()) return { ok: false, error: 'EMAIL_NAO_CONFIGURADO' }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { display_name: nome } },
  })

  if (error) {
    const msg = String(error.message || '')
    if (/already|registered|exists/i.test(msg))
      return { ok: false, error: 'EMAIL_EM_USO', detalhe: msg }
    if (
      error.status === 429 ||
      error.code === 'over_request_rate_limit' ||
      /rate limit|too many/i.test(msg)
    ) {
      return { ok: false, error: 'EMAIL_LIMITE', detalhe: msg }
    }
    logError('platform', 'O convite ao dono não foi gerado', { email, ...erroMeta(error) })
    return { ok: false, error: 'CONVITE_FALHOU', detalhe: msg }
  }

  const userId = data?.user?.id
  const tokenHash = data?.properties?.hashed_token
  const link = tokenHash
    ? `${SITE_URL}/portal/convite/confirmar?token_hash=${encodeURIComponent(tokenHash)}&type=invite`
    : null
  if (!userId || !link) {
    logError('platform', 'O convite não devolveu utilizador e token', {
      email,
      userId: !!userId,
      token: !!tokenHash,
    })
    return { ok: false, error: 'CONVITE_FALHOU', detalhe: 'sem utilizador ou token na resposta' }
  }

  // A entrega é nossa. O link é pessoal: vai só para o endereço do dono.
  const mensagem = emailConvite({ nome: nome || email, farmacia: farmacia.name, link })
  const envio = await enviarEmail({ to: email, ...mensagem })
  if (!envio.ok) {
    logError('platform', 'O convite foi gerado mas o e-mail não saiu', {
      email,
      userId,
      code: envio.error,
      detalhe: envio.detalhe || null,
    })
    return { ok: false, error: envio.error, detalhe: envio.detalhe || null }
  }

  // A linha que dá acesso: sem ela o convite criava uma conta sem portal.
  // Num reenvio a linha já existe — o upsert mantém-na e não apaga o nome
  // que lá está quando o chamador não traz nenhum.
  const { error: errLigacao } = await admin.from('admin_users').upsert(
    {
      user_id: userId,
      role: 'farmacia',
      pharmacy_id: farmacia.id,
      ...(nome ? { display_name: nome } : {}),
    },
    { onConflict: 'user_id' },
  )
  if (errLigacao) {
    logError('platform', 'A conta convidada não ficou ligada à farmácia', {
      userId,
      pharmacyId: farmacia.id,
      ...erroMeta(errLigacao),
    })
    return { ok: false, error: 'CONTA_NAO_LIGADA', detalhe: errLigacao.message }
  }

  return { ok: true, userId, email }
}

function erroMeta(err) {
  return { message: err?.message || String(err), code: err?.code, details: err?.details }
}
