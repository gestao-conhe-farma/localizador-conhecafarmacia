'use client'

import { useState, useTransition } from 'react'
import Notice from '@/components/ui/Notice'
import { alterarSenha } from '@/lib/actions/platform-account'

const ERROS = {
  CAMPOS_EM_FALTA: 'Preencha a senha actual e a nova.',
  SENHA_CURTA: 'A senha nova tem de ter pelo menos 8 caracteres.',
  SENHA_LONGA: 'A senha não pode ter mais de 72 caracteres.',
  SENHAS_DIFERENTES: 'A confirmação não coincide com a senha nova.',
  SENHA_IGUAL: 'A senha nova tem de ser diferente da actual.',
  SENHA_ACTUAL_ERRADA: 'A senha actual não está correcta.',
  SENHA_FRACA: 'O servidor recusou a senha por ser demasiado fraca. Use uma mais longa.',
  DEMASIADAS_TENTATIVAS: 'Demasiadas tentativas. Espere um momento e tente novamente.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  FALHA: 'Não foi possível alterar a senha. Tente novamente.',
}

/**
 * Mudança de senha com prova da actual.
 *
 * O `onSubmit` + `useTransition` (em vez de `<form action={…}>`) é
 * deliberado: o React 19 repõe o formulário depois de cada form action, e
 * um erro na senha actual apagava a nova e a confirmação — e, como os
 * campos são controlados, o DOM ficava vazio enquanto o estado ainda tinha
 * o texto, sem re-render que os voltasse a pintar. Chamando a acção à mão,
 * nada é reposto: uma tentativa falhada mantém o que estava escrito, e o
 * sucesso limpa os três campos no próprio callback.
 *
 * Os `autoComplete` dizem ao gestor de senhas qual é qual (actual vs nova),
 * e o tecto de 72 é o do bcrypt do Supabase (acima disso a senha é
 * truncada em silêncio).
 */
export default function ContaSenhaForm() {
  const [state, setState] = useState({ ok: true })
  const [pending, start] = useTransition()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')

  const submeter = (e) => {
    e.preventDefault()
    const dados = new FormData(e.currentTarget)
    start(async () => {
      try {
        const r = await alterarSenha({}, dados)
        setState(r)
        if (r?.ok && r.mudou) {
          setAtual('')
          setNova('')
          setConfirmar('')
        }
      } catch {
        setState({ ok: false, error: 'FALHA' })
      }
    })
  }

  const erro = state && !state.ok ? ERROS[state.error] || 'Erro inesperado.' : null
  const erroDe = (campo) => (state && !state.ok && state.campo === campo ? erro : null)

  return (
    <form className="interno-form" onSubmit={submeter}>
      <label className="interno-label" htmlFor="conta-senha-atual">
        Senha actual
      </label>
      <input
        id="conta-senha-atual"
        className="interno-input"
        name="atual"
        type="password"
        autoComplete="current-password"
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
        required
      />
      {erroDe('atual') && <span className="interno-error">{erroDe('atual')}</span>}

      <div className="interno-form-grid">
        <div className="interno-field">
          <label className="interno-label" htmlFor="conta-senha-nova">
            Senha nova
          </label>
          <input
            id="conta-senha-nova"
            className="interno-input"
            name="nova"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            required
          />
          {erroDe('nova') && <span className="interno-error">{erroDe('nova')}</span>}
        </div>

        <div className="interno-field">
          <label className="interno-label" htmlFor="conta-senha-confirmar">
            Repetir a nova
          </label>
          <input
            id="conta-senha-confirmar"
            className="interno-input"
            name="confirmar"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
          />
          {erroDe('confirmar') && <span className="interno-error">{erroDe('confirmar')}</span>}
        </div>
      </div>

      <p className="interno-hint">
        Pelo menos 8 caracteres. As outras sessões abertas continuam válidas depois da mudança —
        pode terminá-las na secção «Sessões», aqui em baixo.
      </p>

      {erro && !state?.campo && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
      {state?.ok && state.mudou && (
        <Notice tone="ok" role="status">
          Senha alterada. A partir da próxima entrada, use a senha nova.
        </Notice>
      )}

      <div className="interno-form-acts">
        <button type="submit" className="interno-btn interno-btn--primary" disabled={pending}>
          {pending ? 'A alterar…' : 'Alterar senha'}
        </button>
      </div>
    </form>
  )
}
