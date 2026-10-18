'use client'

import { useActionState } from 'react'
import { definirSenhaConvite } from '@/lib/actions/pharmacy-invite'

const ERRORES = {
  SENHA_CURTA: 'A senha tem de ter pelo menos 8 caracteres.',
  SENHA_LONGA: 'A senha não pode ter mais de 72 caracteres.',
  SENHAS_DIFERENTES: 'As duas senhas não coincidem.',
  SENHA_IGUAL: 'A senha nova tem de ser diferente da actual.',
  SEM_SESSAO:
    'O link expirou. Abra outra vez o link do e-mail ou peça um novo à equipa Conheça Farmácia.',
  SENHA_FALHOU: 'Não foi possível guardar a senha. Tente novamente.',
  FALHA: 'Não foi possível concluir. Tente novamente.',
}

export default function InvitePasswordForm({ variante = 'convite' } = {}) {
  const [state, formAction, pending] = useActionState(definirSenhaConvite, { ok: true })
  // A MESMA acção serve os dois caminhos (convite e reposição): em ambos há
  // sessão e o pedido é «escolher a senha desta conta». Só o texto muda —
  // duplicar a acção era duplicar a validação e o `updateUser`.
  const recuperacao = variante === 'recuperacao'

  return (
    <form className="portal-form mt-6" action={formAction}>
      <label className="portal-label">
        Senha
        <input
          type="password"
          name="password"
          className="portal-input"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          autoFocus
        />
      </label>
      <label className="portal-label">
        Repetir a senha
        <input
          type="password"
          name="password2"
          className="portal-input"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />
      </label>

      {state && !state.ok && (
        <p className="portal-error" role="alert">
          {ERRORES[state.error] || 'Erro inesperado.'}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'A guardar…' : recuperacao ? 'Guardar senha e entrar' : 'Entrar no portal'}
      </button>

      <p className="portal-hint">
        Guarde a senha num sítio seguro. É com ela que entra no portal — o e-mail serve para
        recuperar o acesso, não para entrar.
      </p>
    </form>
  )
}
