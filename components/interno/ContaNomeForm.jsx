'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import { alterarNome } from '@/lib/actions/platform-account'

const ERROS = {
  NOME_INVALIDO: 'O nome tem de ter pelo menos duas letras.',
  NOME_LONGO: 'O nome não pode ter mais de 80 caracteres.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  FALHA: 'Não foi possível guardar o nome. Tente novamente.',
}

/**
 * Nome de exibição da conta — o que a sidebar mostra ao lado do nível.
 *
 * Também é `onSubmit` + `useTransition`, e não `<form action>`: o React 19
 * repõe o formulário depois de cada form action, e um nome recusado
 * voltava ao valor antigo no DOM sem que o estado soubesse. Assim o que a
 * pessoa escreveu fica, e o erro aparece ao lado.
 *
 * O e-mail não se edita aqui: mudá-lo exige confirmação no endereço novo e
 * é outra operação (conta, não perfil).
 */
export default function ContaNomeForm({ nome }) {
  const [state, setState] = useState({ ok: true })
  const [pending, start] = useTransition()
  const [valor, setValor] = useState(nome || '')
  const router = useRouter()

  const submeter = (e) => {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    start(async () => {
      try {
        const r = await alterarNome({}, dados)
        setState(r)
        if (r?.ok && r.actualizado) router.refresh()
      } catch {
        setState({ ok: false, error: 'FALHA' })
      }
    })
  }

  const erro = state && !state.ok ? ERROS[state.error] || 'Erro inesperado.' : null

  return (
    <form className="interno-form" onSubmit={submeter}>
      <label className="interno-label" htmlFor="conta-nome">
        Nome de utilizador
      </label>
      <input
        id="conta-nome"
        className="interno-input"
        name="nome"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        minLength={2}
        maxLength={80}
        autoComplete="name"
        placeholder="Ex.: Ana Silva"
        required
      />
      <p className="interno-hint">
        É este o nome que aparece na barra lateral e nos registos da trilha de auditoria — escreva-o
        como quer ser identificado pela equipa.
      </p>

      {erro && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
      {state?.ok && state.actualizado && (
        <Notice tone="ok" role="status">
          Nome actualizado.
        </Notice>
      )}

      <div className="interno-form-acts">
        <button type="submit" className="interno-btn interno-btn--primary" disabled={pending}>
          {pending ? 'A guardar…' : 'Guardar nome'}
        </button>
      </div>
    </form>
  )
}
