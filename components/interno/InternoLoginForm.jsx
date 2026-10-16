'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { loginPlatform } from '@/lib/actions/platform-auth'
import Notice from '@/components/ui/Notice'

const ERRORES = {
  CAMPOS_EM_FALTA: 'Preencha o e-mail e a senha.',
  CREDENCIAIS: 'Credenciais incorrectas. Verifique o e-mail e a senha.',
  SEM_ACESSO_INTERNO:
    'Esta conta não pertence à Equipa Conheça Farmácia. Se é uma conta de farmácia, entre em /portal/login.',
  MFA_SEM_FACTOR:
    'Esta conta exige segundo factor e não tem autenticador inscrito. Peça a um superadmin para repor o acesso.',
  MFA_FALHA: 'Não foi possível iniciar a verificação em dois passos. Tente de novo.',
  MFA_CODIGO: 'Código incorrecto ou expirado. Escreva o código actual do autenticador.',
  FALHA_ENTRAR: 'Não foi possível entrar. Verifique a ligação e tente novamente.',
}

/**
 * Login da área interna (Task 4.1 do plano) — em dois passos, dentro da
 * mesma Server Action:
 *
 *   1. e-mail + senha. Se a conta tiver TOTP inscrito, o servidor devolve
 *      `MFA_NECESSARIO` com o desafio aberto;
 *   2. o código de seis dígitos, que sobe a sessão para `aal2` — o nível
 *      que as acções sensíveis exigem.
 *
 * O passo 2 substitui os campos: a sessão já está iniciada nesse momento e
 * não volta a pedir a senha (o formulário é reposto pelo React entre
 * envios, e pedir de novo o que o servidor já aceitou era só atrito).
 */
export default function InternoLoginForm() {
  const [state, formAction, pending] = useActionState(loginPlatform, { ok: true })
  const pedeCodigo = state?.error === 'MFA_NECESSARIO' || state?.error === 'MFA_CODIGO'
  const erro = state && !state.ok && !pedeCodigo ? ERRORES[state.error] : null

  return (
    <form className="interno-form" action={formAction}>
      {pedeCodigo ? (
        <>
          <p className="interno-hint">
            Passo 2 de 2 — conta <b>{state.email || 'de equipa'}</b>. Escreva o código de seis
            dígitos do autenticador.
          </p>
          <input type="hidden" name="factorId" value={state.factorId || ''} />
          <input type="hidden" name="challengeId" value={state.challengeId || ''} />
          <label className="interno-label">
            Código do autenticador
            <input
              type="text"
              name="code"
              className="interno-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              autoFocus
              required
            />
          </label>

          {state?.error === 'MFA_CODIGO' && (
            <Notice tone="danger" role="alert">
              {ERRORES.MFA_CODIGO}
            </Notice>
          )}

          <button type="submit" className="interno-btn interno-btn--primary" disabled={pending}>
            {pending ? 'A confirmar…' : 'Confirmar código'}
          </button>

          <p className="interno-hint">
            <Link href="/interno/login" className="interno-table-link">
              É outra conta? Voltar ao início
            </Link>
          </p>
        </>
      ) : (
        <>
          <label className="interno-label">
            E-mail
            <input
              type="email"
              name="email"
              className="interno-input"
              autoComplete="email"
              defaultValue={state?.email || ''}
              required
            />
          </label>
          <label className="interno-label">
            Senha
            <input
              type="password"
              name="password"
              className="interno-input"
              autoComplete="current-password"
              required
            />
          </label>

          {erro && (
            <Notice tone="danger" role="alert">
              {erro}
            </Notice>
          )}

          <button type="submit" className="interno-btn interno-btn--primary" disabled={pending}>
            {pending ? 'A entrar…' : 'Entrar'}
          </button>

          <p className="interno-hint">
            Conta de farmácia? O acesso é no{' '}
            <Link href="/portal/login" className="interno-table-link">
              portal da farmácia
            </Link>
            .
          </p>
        </>
      )}
    </form>
  )
}
