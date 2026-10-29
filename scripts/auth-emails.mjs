#!/usr/bin/env node
/**
 * Modelos de e-mail de autenticação da Conheça Farmácia (Task 6.11).
 *
 * O texto destes e-mails vive no serviço de auth da Supabase, não na base de
 * dados nem no repositório — e isso fazia com que a cópia só existisse no
 * painel, sem histórico e sem revisão. Este ficheiro passa a ser a fonte: o
 * script aplica-o pela Management API e o `git log` mostra o que mudou.
 *
 * Duas regras de conteúdo, que são a razão de ele existir:
 *
 *   1. A CONTA É UMA SÓ. Desde a fusão, a mesma conta serve o site e o
 *      Localizador. Um e-mail que prometa «anotações em qualquer página do
 *      site» ou «progresso no teu perfil» está a vender um dos produtos a
 *      quem se registou pelo outro.
 *   2. PORTUGUÊS EM TUDO. Os modelos que ninguém tinha tocado (mudança de
 *      e-mail, convite, reautenticação, avisos de segurança) saíam em inglês
 *      por omissão da Supabase.
 *
 * Correr (o token é o mesmo dos outros scripts de administração):
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… SUPABASE_PROJECT_REF=tbqs… \
 *     node scripts/auth-emails.mjs
 *
 * Sem `SUPABASE_ACCESS_TOKEN` o script só imprime o que faria — é o modo
 * seguro para rever a cópia sem tocar em produção.
 */

const REF = process.env.SUPABASE_PROJECT_REF
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

const FONTE = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const LOGO = 'https://conhecafarmacia.com/logo/logo-principal-verde.png'
const VERDE = '#0a844f'

const escapar = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Parágrafo do corpo. */
function p(html, { margin = '0 0 10px 0', tamanho = 14, cor = '#555555' } = {}) {
  return `<p style="margin:${margin};font-size:${tamanho}px;color:${cor};line-height:1.6;font-family:${FONTE}">${html}</p>`
}

/** Lista com marcadores — o bloco «o que a conta te dá». */
function lista(itens) {
  return itens
    .map(
      (item, i) => `
                      <tr>
                        <td width="20" valign="top" style="padding-top:3px">
                          <span style="color:${VERDE};font-size:14px;font-weight:600">&bull;</span>
                        </td>
                        <td valign="top" style="padding-left:8px">
                          ${p(item, { margin: i === itens.length - 1 ? '0' : '0 0 10px 0', tamanho: 13 })}
                        </td>
                      </tr>`,
    )
    .join('')
}

/**
 * O esqueleto de todos os e-mails: mesma moldura, mesma tipografia, mesmo
 * rodapé. O que muda é o que está dentro.
 */
function modelo({ titulo, intro, cta = null, itens = null, destaque = null, nota = '' }) {
  const blocoCta = cta
    ? `
          <!-- CTA -->
          <tr>
            <td style="padding:40px 40px ${nota ? '0' : '40px'} 40px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg,#00493a 0%,${VERDE} 100%);color:#ffffff;padding:16px 48px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;font-family:${FONTE};letter-spacing:0.3px">
                      ${cta.texto}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : ''

  const blocoDestaque = destaque
    ? `
          <tr>
            <td style="padding:28px 40px 0 40px">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f5;border:1px solid #e2ece5;border-radius:8px">
                <tr>
                  <td align="center" style="padding:20px">
                    <span style="font-size:30px;letter-spacing:8px;color:#00493a;font-weight:700;font-family:'Courier New',monospace">${destaque}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : ''

  const blocoItens = itens
    ? `
          <!-- O QUE A CONTA DÁ -->
          <tr>
            <td style="padding:32px 40px 32px 40px;border-top:1px solid #f0f0f0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 0 16px 0">
                    <p style="margin:0;font-size:11px;color:${VERDE};text-transform:uppercase;letter-spacing:2px;font-weight:600;font-family:${FONTE}">
                      Com a mesma conta
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0">${lista(itens)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : ''

  const blocoNota = nota
    ? `
          <!-- NOTA -->
          <tr>
            <td style="padding:${cta || destaque ? '24px' : '8px'} 40px 32px 40px">
              ${p(nota, { margin: '0', tamanho: 13, cor: '#999999' })}
            </td>
          </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapar(titulo)} - Conheça Farmácia</title>
</head>
<body style="margin:0;padding:0;background-color:#fafafa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa">
    <tr>
      <td align="center" style="padding:48px 20px">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:2px;overflow:hidden;border:1px solid #e8e8e8">

          <!-- CABEÇALHO -->
          <tr>
            <td style="padding:48px 40px 40px 40px;text-align:center;border-bottom:1px solid #f0f0f0">
              <img src="${LOGO}" alt="Conheça Farmácia" width="180" style="display:block;margin:0 auto 20px;height:auto" />
              <h1 style="margin:0 0 8px 0;font-size:26px;color:#1a1a1a;font-weight:700;font-family:${FONTE};letter-spacing:-0.5px">
                ${escapar(titulo)}
              </h1>
              ${p(intro, { margin: '0', tamanho: 15, cor: '#888888' })}
            </td>
          </tr>
${blocoCta}${blocoDestaque}${blocoItens}${blocoNota}
          <!-- RODAPÉ -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f0f0f0;text-align:center">
              <p style="margin:0;font-size:12px;color:#999999;font-family:${FONTE}">Conheça Farmácia &mdash; Conhecimento que conecta.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const AVISO_SEGURANCA =
  'Se não reconheces esta alteração, repõe a palavra-passe em conta.conhecafarmacia.com e fala com a equipa.'

/**
 * Os treze modelos. `chave` é o sufixo usado pela Management API:
 * `mailer_subjects_<chave>` e `mailer_templates_<chave>_content`.
 */
const EMAILS = {
  confirmation: {
    assunto: 'Confirma a tua conta',
    html: modelo({
      titulo: 'Confirma a tua conta',
      intro: 'Falta um clique para ativares a tua conta Conheça Farmácia.',
      cta: { texto: 'Confirmar a conta', url: '{{ .ConfirmationURL }}' },
      itens: [
        '<strong>Uma conta</strong> para a Conheça Farmácia e para o Localizador de Medicamentos',
        '<strong>Guardar</strong> medicamentos e conteúdos para consultares depois',
        '<strong>Acompanhar</strong> as tuas reservas, com o estado em cada farmácia',
      ],
      nota: 'Se não pediste esta conta, ignora este e-mail: sem este clique não fica nada ativo.',
    }),
  },

  recovery: {
    assunto: 'Repõe a tua palavra-passe',
    html: modelo({
      titulo: 'Repor a palavra-passe',
      intro: 'Recebemos um pedido para repor a palavra-passe da tua conta Conheça Farmácia.',
      cta: { texto: 'Criar nova palavra-passe', url: '{{ .ConfirmationURL }}' },
      nota: 'Se não pediste isto, ignora este e-mail: a palavra-passe atual continua a valer. A tua conta está segura.',
    }),
  },

  magic_link: {
    assunto: 'O teu link de acesso',
    html: modelo({
      titulo: 'Entrar sem palavra-passe',
      intro: 'Clica no botão para entrares na tua conta Conheça Farmácia.',
      cta: { texto: 'Entrar na conta', url: '{{ .ConfirmationURL }}' },
      nota: 'O link vale uma vez e expira em poucos minutos. Se não pediste, ignora este e-mail.',
    }),
  },

  email_change: {
    assunto: 'Confirma a mudança de e-mail',
    html: modelo({
      titulo: 'Confirma o novo e-mail',
      intro:
        'Pediste para mudar o e-mail da tua conta de {{ .Email }} para {{ .NewEmail }}.',
      cta: { texto: 'Confirmar o novo e-mail', url: '{{ .ConfirmationURL }}' },
      nota:
        'Enquanto não confirmares, a conta continua a usar {{ .Email }}. Se não pediste a mudança, ignora este e-mail.',
    }),
  },

  invite: {
    assunto: 'Convite para a Conheça Farmácia',
    html: modelo({
      titulo: 'Criaram uma conta para ti',
      intro:
        'Foi criada uma conta Conheça Farmácia com este endereço. Define a palavra-passe para entrares.',
      cta: { texto: 'Aceitar o convite', url: '{{ .ConfirmationURL }}' },
      nota: 'Se não estavas à espera deste convite, ignora este e-mail — a conta fica por ativar.',
    }),
  },

  reauthentication: {
    assunto: 'Confirma que és tu',
    html: modelo({
      titulo: 'Confirma que és tu',
      intro: 'Para continuares, introduz este código na página onde estavas.',
      destaque: '{{ .Token }}',
      nota:
        'O código expira em poucos minutos e só serve uma vez. Se não foste tu, muda a palavra-passe.',
    }),
  },

  password_changed_notification: {
    assunto: 'A palavra-passe foi alterada',
    html: modelo({
      titulo: 'A palavra-passe foi alterada',
      intro: 'A palavra-passe da conta {{ .Email }} foi alterada agora.',
      nota: AVISO_SEGURANCA,
    }),
  },

  email_changed_notification: {
    assunto: 'O e-mail da conta foi alterado',
    html: modelo({
      titulo: 'O e-mail foi alterado',
      intro: 'O e-mail da conta foi alterado de {{ .OldEmail }} para {{ .Email }}.',
      nota: AVISO_SEGURANCA,
    }),
  },

  phone_changed_notification: {
    assunto: 'O telefone da conta foi alterado',
    html: modelo({
      titulo: 'O telefone foi alterado',
      intro: 'O número associado à conta {{ .Email }} passou a ser {{ .Phone }}.',
      nota: AVISO_SEGURANCA,
    }),
  },

  mfa_factor_enrolled_notification: {
    assunto: 'Novo segundo fator ativado',
    html: modelo({
      titulo: 'Novo segundo fator ativado',
      intro:
        'Foi ativado um segundo fator ({{ .FactorType }}) na conta {{ .Email }}. A partir de agora, entrar vai pedir esse código.',
      nota: AVISO_SEGURANCA,
    }),
  },

  mfa_factor_unenrolled_notification: {
    assunto: 'Segundo fator removido',
    html: modelo({
      titulo: 'Segundo fator removido',
      intro:
        'O segundo fator ({{ .FactorType }}) foi removido da conta {{ .Email }}. A conta volta a entrar só com a palavra-passe.',
      nota: AVISO_SEGURANCA,
    }),
  },

  identity_linked_notification: {
    assunto: 'Nova forma de entrar ligada',
    html: modelo({
      titulo: 'Nova forma de entrar ligada',
      intro:
        'Foi ligada uma nova forma de entrar ({{ .Provider }}) à conta {{ .Email }}.',
      nota: AVISO_SEGURANCA,
    }),
  },

  identity_unlinked_notification: {
    assunto: 'Forma de entrar removida',
    html: modelo({
      titulo: 'Forma de entrar removida',
      intro:
        'A forma de entrar ({{ .Provider }}) foi desligada da conta {{ .Email }}. Deixa de servir para entrar nesta conta.',
      nota: AVISO_SEGURANCA,
    }),
  },
}

async function aplicar(chave, { assunto, html }) {
  const corpo = {
    [`mailer_subjects_${chave}`]: assunto,
    [`mailer_templates_${chave}_content`]: html,
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  })
  const texto = await r.text()
  return { chave, status: r.status, resposta: texto.slice(0, 200) }
}

if (!TOKEN || !REF) {
  console.log('Sem SUPABASE_ACCESS_TOKEN ou SUPABASE_PROJECT_REF — nada foi alterado.')
  for (const [chave, { assunto }] of Object.entries(EMAILS)) {
    console.log(`  ${chave}: «${assunto}» (${EMAILS[chave].html.length} bytes)`)
  }
  process.exit(0)
}

let falhas = 0
for (const [chave, email] of Object.entries(EMAILS)) {
  const { status, resposta } = await aplicar(chave, email)
  const ok = status === 200 || status === 201
  if (!ok) falhas++
  console.log(`${ok ? '✓' : '✗'} ${chave} (${status})${ok ? '' : ` ${resposta}`}`)
}

console.log(
  falhas === 0
    ? `\n${Object.keys(EMAILS).length} modelos aplicados.`
    : `\n${falhas} modelo(s) falharam.`,
)
process.exit(falhas === 0 ? 0 : 1)
