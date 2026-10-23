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

import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, SITE_URL } from '@/lib/constants'
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

// ===============================================================
// A identidade dentro do e-mail
// ===============================================================

/**
 * A letra da marca: o MESMO Inter Variable das páginas públicas, servido
 * pelo site (`public/fonts/`). O `@font-face` abaixo é a parte que os
 * clientes de e-mail aceitam de forma desigual — o Gmail em webmail e o
 * Outlook desktop não vão buscar o ficheiro. Por isso a pilha de reserva
 * repete o que o site usa a seguir ao Inter: a letra do sistema, e só no
 * fim Arial. Quem não carregar a fonte continua a ver a mesma hierarquia,
 * nunca uma serifa que já não existe em lado nenhum da marca.
 */
const FONTE =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

/** O verde da marca: cabeçalho, botões e ligações. */
const VERDE = '#00493a'

const LOGO_URL = `${SITE_URL}/logo/logo-principal-branco.png`
const FONTE_URL = `${SITE_URL}/fonts/inter-latin-wght-normal.woff2`

/**
 * `<head>` comum aos três e-mails. Tudo o que é preciso para a letra da
 * marca chegar — e nada de folhas externas, que os clientes cortam.
 */
const CABECA = `<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 100 900;
        font-display: swap;
        src: url('${FONTE_URL}') format('woff2');
      }
    </style>
  </head>`

/** A faixa de topo: o logótipo branco sobre o verde da marca. */
function topo(eyebrow) {
  return `<tr>
              <td style="background:${VERDE};padding:24px 32px;">
                <img src="${LOGO_URL}" width="150" height="51" alt="Conheça Farmácia" style="display:block;width:150px;height:auto;border:0;outline:none;text-decoration:none;" />
                <p style="margin:10px 0 0;font-family:${FONTE};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9fd3bd;">${eyebrow}</p>
              </td>
            </tr>`
}

/**
 * A PRÉ-LINHA: a frase que o Gmail e o Outlook mostram a seguir ao assunto,
 * a cinzento. Sem ela, o cliente arranca com o primeiro texto do HTML e o
 * assunto fica repetido na lista de entrada. Escondida a sério (0 de
 * altura, `mso-hide:all`), para não abrir um espaço no corpo.
 */
function prelinha(texto) {
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#f7f5f1;">${escapar(texto)}</div>`
}

/**
 * O RODAPÉ: quem assina e por onde falar connosco. Sem endereço postal —
 * não há um que seja verdade —, mas com o site, a Política de Privacidade
 * (a mesma que o formulário faz aceitar) e o contacto da equipa.
 */
function rodape() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px auto 0;max-width:560px;">
            <tr>
              <td align="center" style="font-family:${FONTE};font-size:12px;line-height:1.7;color:#8a948f;">
                <p style="margin:0;">Conheça Farmácia · Localizador de Medicamentos</p>
                <p style="margin:6px 0 0;">
                  <a href="${escapar(SITE_URL)}" style="color:${VERDE};text-decoration:none;">localizador.conhecafarmacia.com</a>
                  &nbsp;·&nbsp;
                  <a href="${escapar(SITE_URL)}/privacidade" style="color:${VERDE};text-decoration:none;">Política de Privacidade</a>
                  &nbsp;·&nbsp;
                  <a href="mailto:${escapar(CONTACT_EMAIL)}" style="color:${VERDE};text-decoration:none;">${escapar(CONTACT_EMAIL)}</a>
                </p>
                <p style="margin:6px 0 0;">${escapar(CONTACT_PHONE_DISPLAY)}</p>
              </td>
            </tr>
          </table>`
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
 * A CONFIRMAÇÃO DE RECEPÇÃO de um pedido de adesão de farmácia.
 *
 * Não é um convite: é a resposta imediata a quem preencheu o formulário
 * público. Diz o que foi recebido, promete o contacto da equipa em 72
 * horas (horas corridas) e dá o caminho para falar connosco antes disso.
 * O prazo é o mesmo que a página de sucesso mostra — uma promessa só,
 * escrita nos dois sítios.
 */
export function emailPedidoAdesao({ nome, farmacia, nif, municipio }) {
  const nomeSeguro = escapar(nome || 'Olá')
  const farmaciaSegura = escapar(farmacia || 'a sua farmácia')
  // Assunto curto: no telemóvel só cabem ~40 caracteres. O nome do
  // remetente já diz «Conheça Farmácia»; repeti-lo no assunto só cortava
  // o que interessa (a farmácia).
  const assunto = `Pedido recebido — ${farmacia || 'a sua farmácia'}`

  // Os dados que a farmácia submeteu, repetidos de volta: se a morada ou o
  // NIF vierem errados, é aqui que ela dá por isso — antes de a equipa
  // telefonar. Só entra o que existe (leads antigos podem não ter NIF).
  const detalhes = [
    ['Farmácia', farmacia],
    ['NIF', nif],
    ['Município', municipio],
  ].filter(([, valor]) => String(valor ?? '').trim())

  const detalhesHtml = detalhes.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e3e0d8;">
                  ${detalhes
                    .map(
                      ([rotulo, valor]) => `<tr>
                    <td style="padding:11px 0;border-bottom:1px solid #e3e0d8;font-family:${FONTE};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#7a8681;width:38%;vertical-align:top;">${rotulo}</td>
                    <td style="padding:11px 0;border-bottom:1px solid #e3e0d8;font-family:${FONTE};font-size:14px;line-height:1.5;color:#002a32;">${escapar(valor)}</td>
                  </tr>`,
                    )
                    .join('')}
                </table>`
    : ''

  const html = `<!doctype html>
<html lang="pt">
${CABECA}
  <body style="margin:0;padding:0;background:#f7f5f1;">
    ${prelinha('Pedido recebido. Analisamos os dados e entraremos em contacto no máximo em 72 horas.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:12px;overflow:hidden;">
            ${topo('Localizador de Medicamentos')}
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:24px;line-height:1.3;color:#002a32;">Pedido recebido.</h1>
                <p style="margin:0 0 12px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">Olá, ${nomeSeguro}.</p>
                <p style="margin:0 0 12px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">Recebemos o pedido de adesão da <b>${farmaciaSegura}</b> ao Localizador de Medicamentos.</p>
                ${detalhesHtml}
                <p style="margin:0 0 24px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">A equipa da Conheça Farmácia vai analisar os dados e entra em contacto no máximo em <b>72 horas</b> (horas corridas).</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#f2f8f4;border-left:3px solid #00493a;padding:14px 16px;font-family:${FONTE};font-size:13px;line-height:1.6;color:#33413d;">
                      Se precisar de falar connosco antes disso: <b>${escapar(CONTACT_EMAIL)}</b> · <b>${escapar(CONTACT_PHONE_DISPLAY)}</b>.
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-family:${FONTE};font-size:13px;line-height:1.6;color:#5b6a65;">Não é necessário responder a este e-mail. O pedido ficou registado na nossa área interna.</p>
              </td>
            </tr>
          </table>
          ${rodape()}
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    'Pedido recebido.',
    '',
    `Olá, ${nome}.`,
    '',
    `Recebemos o pedido de adesão da ${farmacia} ao Localizador de Medicamentos.`,
    '',
    ...detalhes.map(([rotulo, valor]) => `${rotulo}: ${valor}`),
    '',
    'A equipa da Conheça Farmácia vai analisar os dados e entra em contacto no máximo em',
    '72 horas (horas corridas).',
    '',
    `Se precisar de falar connosco antes disso: ${CONTACT_EMAIL} · ${CONTACT_PHONE_DISPLAY}.`,
    '',
    'Não é necessário responder a este e-mail. O pedido ficou registado na nossa área interna.',
    '',
    'Conheça Farmácia',
    SITE_URL,
    `Política de Privacidade: ${SITE_URL}/privacidade`,
  ].join('\n')

  return { subject: assunto, html, text }
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
  const assunto = `Repor a senha — ${farmacia || 'Conheça Farmácia'}`

  const html = `<!doctype html>
<html lang="pt">
${CABECA}
  <body style="margin:0;padding:0;background:#f7f5f1;">
    ${prelinha('O link para escolher uma nova senha vale uma hora e só pode ser usado uma vez.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:12px;overflow:hidden;">
            ${topo('Portal da farmácia')}
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:24px;line-height:1.3;color:#002a32;">Repor a senha de ${farmaciaSegura}.</h1>
                <p style="margin:0 0 12px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">Olá, ${nomeSeguro}.</p>
                <p style="margin:0 0 24px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">A equipa da Conheça Farmácia enviou-lhe o caminho para escolher uma senha nova. A senha antiga deixa de valer assim que guardar a nova.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#00493a;border-radius:8px;">
                      <a href="${linkSeguro}" style="display:inline-block;padding:14px 24px;font-family:${FONTE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Escolher nova senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-family:${FONTE};font-size:13px;line-height:1.6;color:#5b6a65;">Se o botão não abrir, copie este endereço para o navegador:</p>
                <p style="margin:0 0 24px;font-family:${FONTE};font-size:12px;line-height:1.5;color:#00493a;word-break:break-all;">
                  <a href="${linkSeguro}" style="color:#00493a;">${linkSeguro}</a>
                </p>
                <p style="margin:0;padding-top:16px;border-top:1px solid #e3e0d8;font-family:${FONTE};font-size:12px;line-height:1.6;color:#7a8681;">O link vale uma hora e só pode ser usado uma vez. Se não pediu a reposição, ignore este e-mail e avise a equipa: ${escapar(CONTACT_EMAIL)}.</p>
              </td>
            </tr>
          </table>
          ${rodape()}
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
    SITE_URL,
    `Política de Privacidade: ${SITE_URL}/privacidade`,
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
  const assunto = `Convite para o portal — ${farmacia}`

  const html = `<!doctype html>
<html lang="pt">
${CABECA}
  <body style="margin:0;padding:0;background:#f7f5f1;">
    ${prelinha('A conta da sua farmácia está criada. Defina a senha para entrar no portal.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:12px;overflow:hidden;">
            ${topo('Portal de gestão')}
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:24px;line-height:1.3;color:#002a32;">A ${farmaciaSegura} está pronta para começar.</h1>
                <p style="margin:0 0 12px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">Olá, ${nomeSeguro}.</p>
                <p style="margin:0 0 12px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">A equipa da Conheça Farmácia criou o acesso da sua farmácia ao portal de gestão. Stock, reservas e avisos de validade ficam num sítio só — e o stock confirmado aparece no Localizador.</p>
                <p style="margin:0 0 24px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#33413d;">Defina a sua senha para entrar. É a única vez que lhe pedimos isto.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#00493a;border-radius:8px;">
                      <a href="${linkSeguro}" style="display:inline-block;padding:14px 24px;font-family:${FONTE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Aceitar convite e definir senha</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-family:${FONTE};font-size:13px;line-height:1.6;color:#5b6a65;">Se o botão não abrir, copie este endereço para o navegador:</p>
                <p style="margin:0 0 24px;font-family:${FONTE};font-size:12px;line-height:1.5;color:#00493a;word-break:break-all;">
                  <a href="${linkSeguro}" style="color:#00493a;">${linkSeguro}</a>
                </p>
                <p style="margin:0;padding-top:16px;border-top:1px solid #e3e0d8;font-family:${FONTE};font-size:12px;line-height:1.6;color:#7a8681;">Este link vale uma hora e só pode ser usado uma vez. Se já não precisar dele, ignore este e-mail; para renovar o convite, fale com a equipa: ${escapar(CONTACT_EMAIL)}.</p>
              </td>
            </tr>
          </table>
          ${rodape()}
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
    'Este link vale uma hora e só pode ser usado uma vez.',
    'Se já não precisar dele, ignore este e-mail.',
    `Para renovar o convite, fale com a equipa: ${CONTACT_EMAIL}.`,
    '',
    'Conheça Farmácia',
    SITE_URL,
    `Política de Privacidade: ${SITE_URL}/privacidade`,
  ].join('\n')

  return { subject: assunto, html, text }
}
