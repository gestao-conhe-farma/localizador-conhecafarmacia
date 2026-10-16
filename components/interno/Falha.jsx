import Notice from '@/components/ui/Notice'

/**
 * Estado de falha da área interna.
 *
 * Uma leitura que falha NUNCA se disfarça de lista vazia: «não há
 * farmácias» e «não consegui ler as farmácias» levam a decisões opostas, e
 * a segunda é a única que se resolve a tentar de novo. O código do erro
 * fica à vista porque é ele que diz se o problema é uma migração por
 * aplicar (`SEM_VISTA`) ou outra coisa.
 */
export default function Falha({ titulo = 'Não foi possível ler os dados', erro, detalhe }) {
  return (
    <div className="interno-box interno-box--pad">
      <Notice tone="danger" role="alert" title={titulo}>
        {erro === 'SEM_VISTA' ? (
          <>
            A vista por farmácia (migração 0029) ainda não está aplicada nesta base de dados. O ecrã
            volta a funcionar assim que a migração correr — não há dados perdidos.
          </>
        ) : erro === 'SEM_SESSAO' || erro === 'SEM_PERMISSAO' ? (
          <>A sessão da equipa não tem acesso a esta leitura.</>
        ) : (
          <>Recarregue a página e tente de novo. Se persistir, o log `platform` tem o erro.</>
        )}
        {erro ? <span className="interno-foot-sub"> código: {erro}</span> : null}
        {detalhe ? <span className="interno-foot-sub"> detalhe: {detalhe}</span> : null}
      </Notice>
    </div>
  )
}
