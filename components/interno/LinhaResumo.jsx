/**
 * Linha do resumo antes/depois, dentro do diálogo de confirmação.
 *
 * Vive separada porque é usada por componentes cliente (a ficha da
 * farmácia e, a seguir, o painel de planos) e precisa de continuar a ser
 * uma peça de apresentação sem lógica: o resumo diz o que vai mudar, e a
 * mudança a sério é sempre do servidor.
 */
export function LinhaResumo({ rotulo, children }) {
  return (
    <div className="interno-dl-row">
      <dt>{rotulo}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

export default LinhaResumo
