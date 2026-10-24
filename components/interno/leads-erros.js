/**
 * Mensagens dos erros das acções do funil — num sítio só.
 *
 * Os códigos são os que `lib/actions/leads.js` devolve (mais os da matriz e
 * os que qualquer acção interna pode devolver antes de chegar ao funil).
 * O ecrã dos leads e o formulário da conversão mostram os mesmos códigos:
 * dois mapas separados divergiam à primeira mensagem nova.
 *
 * Os erros `EMAIL_*` merecem frases compridas: são configuração do envio
 * (Resend) e quem os vê pela primeira vez não tem como saber que o problema
 * não é do código nem do endereço do dono.
 */
export const MENSAGENS_LEAD = {
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO:
    'O seu nível não permite esta acção: converter um lead cria uma farmácia e uma conta, e são precisas as duas permissões.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  ID_INVALIDO: 'Pedido inválido.',
  NAO_ENCONTRADO: 'Este lead já não existe.',
  JA_CONVERTIDO: 'Este lead já foi convertido — a farmácia existe e o funil está fechado.',
  ESTADO_INVALIDO: 'Esse estado não existe no funil.',
  ESTADO_RESERVADO:
    '«Convertido» não se escolhe à mão: é o resultado da conversão, e é lá que a farmácia e o convite nascem.',
  FARMACIA_JA_CRIADA:
    'A farmácia deste lead já foi criada (o convite não chegou a sair). Repita a conversão para terminar — não vai criar uma segunda farmácia.',
  NOME_INVALIDO: 'O nome tem de ter pelo menos duas letras — é o que o cliente vê no Localizador.',
  MUNICIPIO_INVALIDO: 'Escolha um dos municípios da lista (Luanda ou Ícolo e Bengo).',
  TELEFONE_INVALIDO: 'O telefone é obrigatório — é por onde a equipa fala com a farmácia.',
  EMAIL_INVALIDO: 'O e-mail de contacto da farmácia não parece válido.',
  EMAIL_DONO_INVALIDO: 'O e-mail do dono é obrigatório — é para lá que vai o convite.',
  NOME_DONO_INVALIDO: 'Escreva o nome de quem vai receber o convite.',
  URL_INVALIDO: 'O link do mapa tem de começar por http:// ou https://.',
  EMAIL_EM_USO:
    'Já existe uma conta com este e-mail. O caminho é a reposição de senha (fase das contas), não um convite novo.',
  EMAIL_NAO_CONFIGURADO:
    'O envio de e-mails ainda não está configurado neste ambiente: faltam RESEND_API_KEY e/ou RESEND_FROM. A farmácia ficou criada; assim que a chave estiver no servidor, repita a conversão para o convite sair.',
  EMAIL_NAO_AUTORIZADO:
    'O Resend recusou a chave do projecto (401/403). A RESEND_API_KEY está errada, foi revogada ou não tem permissão de envio. A farmácia ficou criada: corrigida a chave, repita a conversão — não cria uma segunda farmácia.',
  EMAIL_RECUSADO:
    'O Resend recusou o envio da mensagem. O mais provável é o domínio de RESEND_FROM ainda não estar verificado no Resend (ou o endereço do dono ser inválido). O convite não chegou a sair; repita depois de corrigir.',
  EMAIL_LIMITE:
    'O Resend travou o envio por excesso de pedidos (429) ou o Supabase recusou a geração do link. O que ficou feito está feito (a farmácia existe e o lead aponta para ela): espere um pouco e repita — a operação continua de onde parou, sem criar uma segunda farmácia.',
  CONVITE_FALHOU:
    'O convite não saiu. A farmácia ficou criada; repita a conversão para o tentar outra vez.',
  CONTA_NAO_LIGADA:
    'A conta foi convidada mas não ficou ligada à farmácia. O convite existe em `auth.users`; repita para ligar.',
  FALHA: 'Não foi possível concluir a operação. Tente de novo.',
}

/** Mensagem de um código, com rede de segurança para códigos novos. */
export function mensagemLead(codigo, alternativa = 'Erro inesperado.') {
  return MENSAGENS_LEAD[codigo] || alternativa
}
