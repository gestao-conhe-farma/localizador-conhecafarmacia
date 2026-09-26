'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { loginPharmacy } from '@/lib/actions/pharmacy-portal'

const ERRORES = {
  CREDENCIAIS: 'Credenciais incorrectas. Verifique o e-mail e a senha.',
  CAMPOS_EM_FALTA: 'Preencha o e-mail e a senha.',
  SEM_ACESSO_PORTAL: 'Esta conta não tem acesso ao portal — fale com a equipa Conheça Farmácia.',
  FALHA_ENTRAR: 'Não foi possível entrar. Verifique a ligação e tente novamente.',
}

/**
 * Login do portal — 100% server-side (Server Action `loginPharmacy`):
 * as cookies de sessão são escritas pelo próprio servidor, que as vê
 * logo no request seguinte. O antigo signInWithPassword no browser
 * guardava a sessão só no cliente e o servidor voltava a redireccionar
 * para o login (o "loop após entrar").
 */
export default function PharmacyLoginForm() {
  const [state, formAction, pending] = useActionState(loginPharmacy, { ok: true })

  return (
    <form className="portal-form" action={formAction}>
      <label className="portal-label">
        E-mail
        <input type="email" name="email" className="portal-input" autoComplete="email" required />
      </label>
      <label className="portal-label">
        Senha
        <input
          type="password"
          name="password"
          className="portal-input"
          autoComplete="current-password"
          required
        />
      </label>

      {state && !state.ok && (
        <p className="portal-error" role="alert">
          {ERRORES[state.error] || 'Erro inesperado.'}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'A entrar…' : 'Entrar'}
      </button>

      <p className="portal-hint">
        Não tem conta? A sua farmácia recebe as credenciais da equipa Conheça Farmácia durante o
        onboarding.{' '}
        <Link href="/sobre" className="portal-link">
          Fale connosco
        </Link>
        .
      </p>
    </form>
  )
}
