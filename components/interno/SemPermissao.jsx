import Link from 'next/link'

/**
 * Ecrã de recusa da área interna.
 *
 * Existe para o caso de quem chega por URL directo a uma secção que o seu
 * nível não abre (Task 4.2 Step 3): a página diz o que faltava fazer, e não
 * desaparece em silêncio nem mostra um 404 que parece avaria. Diz também o
 * nível em que a pessoa está — a pergunta seguinte é sempre «e eu sou o
 * quê?».
 */
export default function SemPermissao({ acao, rotulo, children }) {
  return (
    <div className="interno-page">
      <div className="interno-box interno-box--pad">
        <div className="interno-empty">
          <b>Sem permissão para esta secção</b>
          <span>
            O seu nível{rotulo ? ` (${rotulo})` : ''} não inclui <b>{acao}</b>.
          </span>
          <span>
            Peça a um superadmin para rever o seu nível, ou volte ao{' '}
            <Link href="/interno" className="interno-table-link">
              painel
            </Link>
            .
          </span>
          {children}
        </div>
      </div>
    </div>
  )
}
