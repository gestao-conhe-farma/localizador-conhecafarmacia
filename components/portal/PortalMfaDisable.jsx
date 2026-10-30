'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { desativarMfaPortal } from '@/lib/actions/pharmacy-mfa'

const ERROS = {
  SENHA_EM_FALTA: 'Introduza a palavra-passe da conta.',
  SENHA_INCORRECTA: 'Palavra-passe incorrecta.',
  SEM_SESSAO: 'A sessão expirou. Entre outra vez.',
  MFA_LEITURA: 'Não foi possível ler o estado do autenticador.',
  MFA_FALHA: 'Não foi possível desativar. Tente outra vez.',
}

/**
 * Desativar o TOTP pede a palavra-passe outra vez.
 *
 * A sessão sozinha não chega: quem a roubasse desligava o segundo factor e
 * ficava com a conta só a password. O campo é `type="password"` com
 * `autoComplete="current-password"` para os gestores de passwords não
 * oferecerem a password nova.
 */
export default function PortalMfaDisable() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')

  if (!aberto) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setAberto(true)}>
        Desativar autenticador
      </button>
    )
  }

  function submeter(e) {
    e.preventDefault()
    setErro('')
    startTransition(async () => {
      const res = await desativarMfaPortal({ password })
      if (!res.ok) {
        setErro(ERROS[res.error] || ERROS.MFA_FALHA)
        return
      }
      setPassword('')
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <form action={submeter} className="portal-form" style={{ gap: '0.5rem' }}>
      {erro && (
        <p className="portal-error" role="alert">
          {erro}
        </p>
      )}
      <label className="portal-label">
        Palavra-passe da conta
        <input
          type="password"
          className="portal-input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn-secondary" disabled={pending || !password}>
          {pending ? 'A desativar…' : 'Confirmar desativação'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setAberto(false)
            setPassword('')
            setErro('')
          }}
          disabled={pending}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
