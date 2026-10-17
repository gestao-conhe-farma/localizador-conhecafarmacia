/**
 * Mensagens dos erros do segundo factor — num sítio só.
 *
 * Os códigos são os que `lib/actions/platform-mfa.js` (inscrição) e
 * `lib/actions/platform-auth.js` (entrada) devolvem. Os dois ecrãs mostram
 * os mesmos códigos, porque o mesmo erro aparece nos dois sítios: um código
 * de seis dígitos errado é o mesmo erro a entrar e a inscrever.
 *
 * `TOTP_DESLIGADO` e `DEMASIADAS_TENTATIVAS` merecem a frase comprida: o
 * primeiro não é falha do utilizador (o provider está desligado no projecto)
 * e o segundo não se resolve a insistir — quem insistir sobe o castigo.
 */
export const MENSAGENS_MFA = {
  MFA_FALHA: 'Não foi possível falar com o autenticador. Tente de novo.',
  MFA_LEITURA:
    'Não foi possível ler o estado do segundo factor desta conta. Recarregue a página; se persistir, o log `platform` tem o erro.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  CODIGO_INVALIDO:
    'Código incorrecto ou expirado. Veja no autenticador o código actual (muda a cada 30 segundos) e escreva-o outra vez.',
  DEMASIADAS_TENTATIVAS:
    'Demasiadas tentativas seguidas: o servidor de autenticação travou-as por precaução. Espere um minuto e tente de novo.',
  TOTP_DESLIGADO:
    'O segundo factor por TOTP está desligado neste projecto (Authentication → Multi-Factor Auth na Supabase). Sem o ligar, não há autenticador para inscrever.',
  JA_INSCRITO: 'Esta conta já tem um autenticador inscrito e activo.',
  INSCRICAO_A_MEIO:
    'Já existe uma inscrição com este nome por acabar. Descarte-a na lista abaixo e comece de novo.',
  SESSAO_CURTA:
    'A sessão precisa de ser mais recente para esta operação. Saia e volte a entrar com o código do autenticador.',
  FACTOR_DESCONHECIDO: 'Esse autenticador já não está inscrito nesta conta.',
  FACTOR_PROTEGIDO:
    'Um autenticador ACTIVO não se remove aqui — é o que impede que uma sessão roubada desligue o segundo factor. Para trocar de dispositivo, peça a quem gere o acesso da equipa.',
}

/** Mensagem de um código, com rede de segurança para códigos novos. */
export function mensagemMfa(codigo, alternativa = 'Erro inesperado.') {
  return MENSAGENS_MFA[codigo] || alternativa
}
