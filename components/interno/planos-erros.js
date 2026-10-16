/**
 * Mensagens dos erros das acções de plano — num sítio só.
 *
 * Os códigos são os que `lib/actions/platform-plans.js` devolve (mais os da
 * matriz, que qualquer acção pode devolver antes de chegar ao plano). O
 * painel da ficha, o diálogo e o ecrã do primeiro plano mostram todos os
 * mesmos códigos: três mapas separados divergiam à primeira mensagem nova.
 */
export const MENSAGENS_PLANO = {
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite mexer em planos.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  JA_TEM_PLANO: 'Esta farmácia já tem plano — use «Mudar de plano» ou «Iniciar experiência».',
  SEM_PLANO: 'Esta farmácia ainda não tem plano. Comece pelo primeiro plano.',
  PLANO_INVALIDO: 'Esse plano não existe no catálogo.',
  PRAZO_INVALIDO: 'O prazo tem de ser um número de dias entre 1 e 365.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  ID_INVALIDO: 'Pedido inválido.',
  SEM_EFEITO:
    'A alteração não chegou a ficar gravada. Actualize a página para ver o estado actual e tente de novo.',
  FALHA: 'Não foi possível gravar o plano. Tente de novo.',
}

/** Mensagem de um código, com uma rede de segurança para códigos novos. */
export function mensagemPlano(codigo, alternativa = 'Erro inesperado.') {
  return MENSAGENS_PLANO[codigo] || alternativa
}
