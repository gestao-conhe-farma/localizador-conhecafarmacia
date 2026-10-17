'use client'

import { useActionState } from 'react'
import Notice from '@/components/ui/Notice'
import { terminarOutrasSessoes } from '@/lib/actions/platform-account'

/**
 * «Terminar as outras sessões» — o gesto de quem desconfia que a conta foi
 * usada noutro sítio. Não termina esta: sair é o botão do rodapé, e juntar
 * as duas coisas debaixo do mesmo nome era uma armadilha.
 */
export default function SessoesAcoes() {
  const [state, formAction, pending] = useActionState(terminarOutrasSessoes, { ok: true })
  const erro = state && !state.ok ? 'Não foi possível terminar as outras sessões.' : null

  return (
    <form className="interno-form" action={formAction}>
      <p className="interno-hint">
        Se entrou noutro computador ou desconfia que alguém usou a conta, termine as restantes
        sessões. Esta mantém-se aberta — para sair também, use o botão do rodapé.
      </p>

      {erro && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
      {state?.ok && state.terminadas && (
        <Notice tone="ok" role="status">
          As outras sessões foram terminadas.
        </Notice>
      )}

      <div className="interno-form-acts">
        <button type="submit" className="interno-btn interno-btn--ghost" disabled={pending}>
          {pending ? 'A terminar…' : 'Terminar as outras sessões'}
        </button>
      </div>
    </form>
  )
}
