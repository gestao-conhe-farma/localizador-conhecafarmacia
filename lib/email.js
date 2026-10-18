/**
 * E-mail transaccional pelo Resend.
 *
 * Porquê este módulo: o remetente integrado do Supabase Auth está limitado a
 * 2 mensagens/hora e só entrega a endereços da equipa do projecto — com ele é
 * tecnicamente impossível convidar uma farmácia (Task 6.1 do plano). O convite
 * passou a ser gerado pela Admin API (`generateLink`, que NÃO envia nada) e
 * entregue por aqui: a conta e o token continuam a ser do Supabase, só o
 * transporte é nosso.
 *
 * Sem SDK: é uma chamada HTTP e uma dependência a menos para actualizar. As
 * credenciais vivem no servidor (`RESEND_API_KEY`, `RESEND_FROM`) e nunca
 * chegam ao browser. Este ficheiro só pode ser importado do servidor.
 *
 * Códigos de erro, para a UI os traduzir:
 *   EMAIL_NAO_CONFIGURADO  falta a chave ou o remetente neste ambiente
 *   EMAIL_NAO_AUTORIZADO   o Resend recusou a chave (401/403)
 *   EMAIL_RECUSADO         o Resend recusou a mensagem (400/422: domínio por
 *                          verificar, destinatário inválido, etc.)
 *   EMAIL_LIMITE           limite de pedidos do Resend (429)
 *   EMAIL_FALHOU           rede, timeout ou 5xx — tentar de novo
 */

import { CONTACT_EMAIL, SITE_URL } from '@/lib/constants'
import { logError } from '@/lib/log'

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

/** O envio está configurado neste ambiente? (Sem chave não se tenta.) */
export function emailConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
}

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Envia um e-mail HTML + texto. Devolve `{ ok: true, id }` ou
 * `{ ok: false, error, detalhe }` — nunca lança: quem chama está a meio de
 * uma operação (a conversão de um lead) e precisa de decidir o que fica.
 */
export async function enviarEmail({ to, subject, html, text, replyTo }) {
  const chave = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!chave || !from) return { ok: false, error: 'EMAIL_NAO_CONFIGURADO' }

  let resposta
  try {
    resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Timeout e falhas de rede caem aqui. A mensagem não chegou a ser aceite
    // pelo Resend, por isso repetir é seguro (o convite gera um link novo).
    logError('email', 'O Resend não respondeu', {
      message: err?.message || String(err),
      nome: err?.name,
    })
    return { ok: false, error: 'EMAIL_FALHOU', detalhe: err?.message || 'sem resposta' }
  }

  const corpo = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    const detalhe =
      corpo?.message || corpo?.error?.message || corpo?.name || `HTTP ${resposta.status}`
    const erro =
      resposta.status === 401 || resposta.status === 403
        ? 'EMAIL_NAO_AUTORIZADO'
        : resposta.status === 429
          ? 'EMAIL_LIMITE'
          : resposta.status >= 500
            ? 'EMAIL_FALHOU'
            : 'EMAIL_RECUSADO'

    // 401/403 e 4xx são configuração: o log diz qual, para não se procurar
    // a avaria no código. Aqui não há PII — o endereço fica só no chamador.
    logError('email', 'O Resend recusou o envio', {
      status: resposta.status,
      code: erro,
      detalhe,
    })
    return { ok: false, error: erro, detalhe }
  }

  return { ok: true, id: corpo?.id || null }
}

/**
 * O e-mail de REPOSIÇÃO DE SENHA (`account.reset_password`).
 *
 * Mesmo transporte e mesma marca do convite, com uma diferença de fundo:
 * não é um primeiro acesso — é alguém que já entra e perdeu a senha. Por
 * isso o texto não fala de «definir a senha pela primeira vez» e diz o que
 * fazer se o pedido não partiu da pessoa. O link vai para
 * `/portal/recuperar/confirmar`, que o troca por sessão e mostra o
 * formulário — o mesmo mecanismo do convite, sem SMTP do Supabase à
 * mistura.
 */
export function emailRecuperacao({ nome, farmacia, link }) {
  const nomeSeguro = escapar(nome || 'Olá')
  const farmaciaSegura = escapar(farmacia || 'a sua farmácia')
  const linkSeguro = escapar(link)
  const assunto = `Repor a senha da conta — ${farmacia || 'Conheça Farmácia'}`

  const html = `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f7f5f1;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#003528;padding:24px 32px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:0.02em;color:#ffffff;">Conheça Farmácia</p>
                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9fd3bd;">Portal da farmácia</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#002a32;">Repor a senha de ${farmaciaSegura}.</h1>
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33413d;">Olá, ${nomeSeguro}.</p>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33413d;">A equipa da Conheça Farmácia enviou-lhe o caminho para escolher uma senha nova. A senha antiga deixa de valer assim que guardar a nova.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#00493a;border-radius:8px;">
                      <a href="${linkSeguro}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Escolher nova senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#5b6a65;">Se o botão não abrir, copie este endereço para o navegador:</p>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#00493a;word-break:break-all;">
                  <a href="${linkSeguro}" style="color:#00493a;">${linkSeguro}</a>
                </p>
                <p style="margin:0;padding-top:16px;border-top:1px solid #e3e0d8;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7a8681;">O link vale uma hora e só pode ser usado uma vez. Se não pediu a reposição, ignore este e-mail e avise a equipa: ${escapar(CONTACT_EMAIL)}.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a948f;">Conheça Farmácia · ${escapar(SITE_URL.replace('localizador.', ''))}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `Repor a senha de ${farmacia}`,
    '',
    `Olá, ${nome}.`,
    '',
    'A equipa da Conheça Farmácia enviou-lhe o caminho para escolher uma senha nova.',
    'A senha antiga deixa de valer assim que guardar a nova.',
    '',
    'Escolher nova senha:',
    link,
    '',
    'O link vale uma hora e só pode ser usado uma vez.',
    `Se não pediu a reposição, ignore este e-mail e avise a equipa: ${CONTACT_EMAIL}.`,
    '',
    'Conheça Farmácia',
  ].join('\n')

  return { subject: assunto, html, text }
}

/**
 * O e-mail de convite ao dono da farmácia.
 *
 * HTML de e-mail é tabela e estilo em linha, de propósito: o Gmail e o
 * Outlook desktop não carregam folhas externas nem respeitam `flex`. O
 * texto simples vai sempre — é o que sobrevive a clientes que bloqueiam
 * HTML e o que os filtros de spam preferem.
 */
export function emailConvite({ nome, farmacia, link }) {
  const nomeSeguro = escapar(nome)
  const farmaciaSegura = escapar(farmacia)
  const linkSeguro = escapar(link)
  const assunto = `Convite para gerir a ${farmacia} — Conheça Farmácia`

  const html = `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f7f5f1;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#003528;padding:24px 32px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:0.02em;color:#ffffff;">Conheça Farmácia</p>
                <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9fd3bd;">Portal de gestão</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#002a32;">A ${farmaciaSegura} está pronta para começar.</h1>
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33413d;">Olá, ${nomeSeguro}.</p>
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33413d;">A equipa da Conheça Farmácia criou o acesso da sua farmácia ao portal de gestão. Stock, reservas e avisos de validade ficam num sítio só — e o stock confirmado aparece no Localizador.</p>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33413d;">Defina a sua senha para entrar. É a única vez que lhe pedimos isto.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#00493a;border-radius:8px;">
                      <a href="${linkSeguro}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Aceitar convite e definir senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#5b6a65;">Se o botão não abrir, copie este endereço para o navegador:</p>
                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#00493a;word-break:break-all;">
                  <a href="${linkSeguro}" style="color:#00493a;">${linkSeguro}</a>
                </p>
                <p style="margin:0;padding-top:16px;border-top:1px solid #e3e0d8;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7a8681;">Este link é pessoal e expira. Se já não precisar dele, ignore este e-mail. Para renovar o convite, fale com a equipa: ${escapar(CONTACT_EMAIL)}.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a948f;">Conheça Farmácia · ${escapar(SITE_URL.replace('localizador.', ''))}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `A ${farmacia} está pronta para começar.`,
    '',
    `Olá, ${nome}.`,
    '',
    'A equipa da Conheça Farmácia criou o acesso da sua farmácia ao portal de gestão.',
    'Stock, reservas e avisos de validade ficam num sítio só — e o stock confirmado',
    'aparece no Localizador.',
    '',
    'Defina a sua senha para entrar:',
    link,
    '',
    'Este link é pessoal e expira. Se já não precisar dele, ignore este e-mail.',
    `Para renovar o convite, fale com a equipa: ${CONTACT_EMAIL}.`,
    '',
    'Conheça Farmácia',
  ].join('\n')

  return { subject: assunto, html, text }
}
