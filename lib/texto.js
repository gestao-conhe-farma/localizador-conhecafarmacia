/**
 * Concordância de número no que a interface escreve.
 *
 * «1 conta» e «3 contas», «1 perfil» e «2 perfis» — o par escreve-se no
 * sítio onde a frase nasce e a função só escolhe a forma. Sem isto, a
 * alternativa era `conta(s)`, que é o que se lê num formulário por acabar.
 *
 * O número leva o separador de milhares de pt-PT (1 500), como o resto dos
 * contadores da plataforma.
 */
export function plural(n, singular, muitos) {
  const valor = Number(n) || 0
  const numero = new Intl.NumberFormat('pt-PT').format(valor)
  return `${numero} ${valor === 1 ? singular : muitos}`
}
