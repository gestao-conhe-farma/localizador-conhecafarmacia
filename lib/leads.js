import { can } from '@/lib/platform/permissions'

/**
 * Regras do FUNIL DE LEADS que não são acções — constantes e uma decisão
 * pura, num módulo sem `'use server'`.
 *
 * Vive aqui pela mesma razão que `lib/plans.js`: um ficheiro `'use server'`
 * só pode exportar funções async, e o build recusa tudo o resto («Server
 * Actions must be async functions»). Como `lib/actions/leads.js` precisa de
 * exportar a lista do funil e `podeConverter`, e os ecrãs precisam de as
 * poder importar sem passar por uma acção, o sítio certo é este.
 *
 * Nada aqui lê ambiente, base de dados ou cookies — é vocabulário e uma
 * comparação de permissões, provável sem servidor.
 */

/** Os estados do funil, pela ordem em que acontecem (CHECK da 0001). */
export const FUNIL = ['novo', 'em_conversa', 'demonstracao', 'acordo', 'onboarded', 'descartado']

/**
 * `onboarded` não se escolhe à mão: é o resultado da conversão, e quem o
 * escreve é a operação. Mover um lead para lá por um clique punha o funil a
 * dizer que houve uma farmácia criada quando não houve.
 */
export const ESTADO_DA_CONVERSAO = 'onboarded'

/**
 * A conversão faz três coisas, e quem a executa tem de poder fazer as três.
 * A matriz descreve-as em separado (`lead.convert` diz «farmácia + convite +
 * estado», mas o que ela autoriza por si é a intenção) — pedir as três é o
 * que impede que uma divergência futura da matriz dê a alguém a capacidade
 * de convidar contas sem poder criar farmácias. `podeConverter` é usada pelo
 * ecrã E pela acção, para que o botão e o servidor decidam igual.
 */
export const ACOES_DA_CONVERSAO = ['lead.convert', 'pharmacy.create', 'account.invite']

/** Este nível pode executar a conversão inteira (as três acções)? */
export function podeConverter(role) {
  return ACOES_DA_CONVERSAO.every((acao) => can(role, acao))
}
