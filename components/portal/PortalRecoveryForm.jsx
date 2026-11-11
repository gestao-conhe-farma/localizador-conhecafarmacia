'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/constants'
import { reporSenhaPortal } from '@/lib/actions/pharmacy-recovery'

const ERROS = {
  EMAIL_INVALIDO: 'Escreva o e-mail da conta do portal.',
  CODIGO_INVALIDO: 'Código inválido ou expirado. Abra o autenticador e tente outra vez.',
  SENHA_CURTA: 'A senha tem de ter pelo menos 8 caracteres.',
  SENHA_LONGA: 'A senha não pode ter mais de 72 caracteres.',
  SENHAS_DIFERENTES: 'As duas senhas não coincidem.',
  SENHA_IGUAL: 'A senha nova tem de ser diferente da actual.',
  SENHA_FALHOU: 'Não foi possível guardar a senha. Tente novamente.',
  SEM_FACTOR:
    'Esta conta ainda não tem verificação em dois passos activa, por isso a reposição por aqui não é possível. Peça à equipa Conheça Farmácia um link de reposição.',
  SEM_ACESSO_PORTAL:
    'Esta conta não é uma conta de farmácia do portal. Fale com a equipa Conheça Farmácia.',
  DEMASIADAS_TENTATIVAS: 'Demasiadas tentativas. Espere alguns minutos antes de tentar outra vez.',
  DADOS_INVALIDOS: 'Não foi possível validar esses dados. Confirme o e-mail e o código.',
  FALHA: 'Não foi possível concluir. Tente novamente.',
}

/**
 * Reposição de senha em auto-serviço: e-mail + código do autenticador +
 * senha nova, num só passo. O código é a prova de que quem repõe ainda tem
 * a conta — não é um enfeite. Quem valida é o Supabase Auth, na Server
 * Action; aqui só se recoleta o código e se traduzem os erros.
 */
export default function PortalRecoveryForm() {
  const [state, formAction, pending] = useActionState(reporSenhaPortal, { ok: true })
  const [email, setEmail] = useState('')

  if (state?.feito) {
    return (
      <div className="mt-5 flex flex-col gap-4">
        <p className="portal-hint" style={{ margin: 0 }}>
          Senha alterada. A anterior deixou de valer e a sessão desta reposição já foi fechada.
        </p>
        <Link href="/portal/login" className="btn btn-primary text-center">
          Entrar com a senha nova
        </Link>
      </div>
    )
  }

  return (
    <form className="portal-form mt-5" action={formAction}>
      <label className="portal-label">
        E-mail da conta
        <input
          type="email"
          name="email"
          className="portal-input"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="portal-label">
        Código do autenticador
        <input
          type="text"
          name="codigo"
          className="portal-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          minLength={6}
          pattern="[0-9]{6}"
          placeholder="6 dígitos"
          required
        />
      </label>

      <label className="portal-label">
        Senha nova
        <input
          type="password"
          name="password"
          className="portal-input"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />
      </label>

      <label className="portal-label">
        Repetir a senha nova
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
          {ERROS[state.error] || 'Erro inesperado.'}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'A repor…' : 'Repor a senha'}
      </button>

      <p className="portal-hint">
        O código é o que a aplicação de autenticação (Google Authenticator, Microsoft Authenticator,
        1Password…) mostra para esta conta. Não tem o autenticador?{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="portal-link">
          Fale connosco
        </a>
        .
      </p>
    </form>
  )
}
