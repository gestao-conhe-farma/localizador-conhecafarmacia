'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  iniciarInscricaoPortal,
  confirmarInscricaoPortal,
  confirmarCodigoPortal,
} from '@/lib/actions/pharmacy-mfa'

const ERROS = {
  CODIGO_INVALIDO: 'Código inválido ou expirado. Tente outra vez.',
  DEMASIADAS_TENTATIVAS: 'Demasiadas tentativas. Espere um minuto.',
  JA_INSCRITO: 'Esta conta já tem um autenticador ativo.',
  TOTP_DESLIGADO: 'O TOTP está desligado no projeto — fale com a equipa.',
  INSCRICAO_A_MEIO: 'Há uma inscrição por acabar. Recomece.',
  SESSAO_CURTA: 'A sessão precisa de ser confirmada outra vez. Entre novamente.',
  SEM_FACTOR: 'Esta conta ainda não tem autenticador inscrito.',
  SEM_SESSAO: 'A sessão expirou. Entre outra vez.',
  MFA_LEITURA: 'Não foi possível ler o estado do autenticador.',
  MFA_FALHA: 'Não foi possível concluir. Tente outra vez.',
}

/**
 * Dois passos num componente: inscrever (sem factor) e confirmar (sessão
 * `aal1` de uma conta que já tem factor). O código nunca é comparado aqui —
 * quem valida é o Supabase Auth, nas Server Actions.
 */
export default function PortalMfaClient({ temFactor, nivel }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState('')
  const [codigo, setCodigo] = useState('')

  // Inscrição
  const [fase, setFase] = useState(temFactor ? 'confirmar' : 'inicio')
  const [factorId, setFactorId] = useState(null)
  const [qr, setQr] = useState(null)
  const [secret, setSecret] = useState(null)

  if (nivel === 'aal2') {
    return (
      <div className="portal-card">
        <p className="portal-hint" style={{ margin: 0 }}>
          Esta sessão já está confirmada com o autenticador (aal2). Pode continuar.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => router.push('/portal')}>
          Ir para o portal
        </button>
      </div>
    )
  }

  function arrancarInscricao() {
    setErro('')
    startTransition(async () => {
      const res = await iniciarInscricaoPortal()
      if (!res.ok) {
        setErro(ERROS[res.error] || ERROS.MFA_FALHA)
        return
      }
      setFactorId(res.factorId)
      setQr(res.qrCode)
      setSecret(res.secret)
      setFase('inscrever')
    })
  }

  function submeter(e) {
    e.preventDefault()
    setErro('')
    startTransition(async () => {
      const res =
        fase === 'inscrever'
          ? await confirmarInscricaoPortal({ factorId, code: codigo })
          : await confirmarCodigoPortal({ code: codigo })

      if (!res.ok) {
        setErro(ERROS[res.error] || ERROS.MFA_FALHA)
        return
      }
      setCodigo('')
      router.replace('/portal')
      router.refresh()
    })
  }

  return (
    <div className="portal-card">
      {erro && (
        <p className="portal-error" role="alert">
          {erro}
        </p>
      )}

      {fase === 'inicio' && (
        <>
          <p className="portal-hint" style={{ marginTop: 0 }}>
            Ainda não tem autenticador nesta conta. Instale uma aplicação de códigos (Google
            Authenticator, Microsoft Authenticator, 1Password…) e ative-o aqui.
          </p>
          <button type="button" className="btn btn-primary" onClick={arrancarInscricao} disabled={pending}>
            {pending ? 'A preparar…' : 'Ativar autenticador'}
          </button>
        </>
      )}

      {fase === 'inscrever' && (
        <>
          {qr && (
            // O QR vem do GoTrue já como data-uri.
            <img src={qr} alt="Código QR para o autenticador" className="portal-qr" width={190} height={190} />
          )}
          {secret && (
            <p className="portal-hint">
              Se não conseguir ler o QR, introduza este segredo à mão:
              <br />
              <code style={{ wordBreak: 'break-all' }}>{secret}</code>
            </p>
          )}
          <form action={submeter} className="portal-form">
            <label className="portal-label">
              Código de 6 dígitos
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="portal-input"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={pending || codigo.length !== 6}>
              {pending ? 'A confirmar…' : 'Confirmar e ativar'}
            </button>
          </form>
        </>
      )}

      {fase === 'confirmar' && (
        <form action={submeter} className="portal-form">
          <p className="portal-hint" style={{ marginTop: 0 }}>
            Esta conta já tem autenticador. Introduza o código atual para confirmar esta sessão.
          </p>
          <label className="portal-label">
            Código de 6 dígitos
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="portal-input"
              required
              autoFocus
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending || codigo.length !== 6}>
            {pending ? 'A confirmar…' : 'Confirmar'}
          </button>
        </form>
      )}
    </div>
  )
}
