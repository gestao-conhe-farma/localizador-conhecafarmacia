'use client'

import { useEffect, useRef, useState, useActionState } from 'react'
import Link from 'next/link'
import { CONTACT_EMAIL } from '@/lib/constants'
import { reporSenhaPortal } from '@/lib/actions/pharmacy-recovery'

const ERROS = {
  EMAIL_INVALIDO: 'Escreva o e-mail da conta do portal.',
  SEM_CONTA:
    'Não há nenhuma conta do portal com este e-mail. Confirme o endereço ou fale com a equipa Conheça Farmácia.',
  CODIGO_INVALIDO: 'Código incorrecto. Confirme os 8 dígitos do último e-mail.',
  CODIGO_EXPIRADO: 'Este código já expirou. Peça um novo e use o mais recente.',
  TOTP_INVALIDO: 'Código do autenticador incorrecto. Tente outra vez.',
  TOTP_NECESSARIO: 'Falta confirmar o código do autenticador antes de escolher a senha.',
  SEM_FACTOR:
    'Esta conta pede o autenticador, mas não há nenhum inscrito. Fale com a equipa Conheça Farmácia.',
  SEM_ACESSO_PORTAL:
    'Esta conta não é uma conta de farmácia do portal. Fale com a equipa Conheça Farmácia.',
  SENHA_CURTA: 'A senha tem de ter pelo menos 8 caracteres.',
  SENHA_LONGA: 'A senha não pode ter mais de 72 caracteres.',
  SENHAS_DIFERENTES: 'As duas senhas não coincidem.',
  SENHA_IGUAL: 'A senha nova tem de ser diferente da actual.',
  SENHA_FALHOU: 'Não foi possível guardar a senha. Tente novamente.',
  SESSAO_EXPIRADA: 'A verificação expirou. Comece outra vez pelo e-mail.',
  DEMASIADAS_TENTATIVAS: 'Demasiadas tentativas. Espere alguns minutos antes de tentar outra vez.',
  ESPERAR: 'Já enviámos um código há pouco. Espere um minuto e peça outro.',
  FALHA: 'Não foi possível concluir. Tente novamente.',
}

/**
 * Reposição de senha em quatro passos — e-mail, código do e-mail, código do
 * autenticador (só para contas que o têm) e senha nova.
 *
 * A etapa NÃO é decidida aqui: cada resposta da Server Action traz `etapa` e
 * é isso que se desenha. Um passo que o browser inventasse não abria nada —
 * o passo seguinte confirma no servidor o que precisa (sessão `aal2`, perfil
 * de farmácia) antes de agir.
 */
export default function PortalRecoveryForm({ etapaInicial = 'email', emailInicial = '' } = {}) {
  const [state, formAction, pending] = useActionState(reporSenhaPortal, {
    ok: true,
    etapa: etapaInicial,
    email: emailInicial,
  })
  const [email, setEmail] = useState(emailInicial)
  // Voltar atrás («usar outro e-mail») é navegação local; o próximo envio
  // traz uma etapa nova e o servidor volta a mandar.
  const [etapaPedida, setEtapaPedida] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    setEtapaPedida(null)
  }, [state])

  const emailAtual = state?.email || email
  const etapa = etapaPedida || state?.etapa || etapaInicial

  if (state?.feito) {
    return (
      <div className="mt-5 flex flex-col gap-4">
        <p className="portal-hint" style={{ margin: 0 }}>
          Senha alterada. A anterior deixou de valer e a verificação desta reposição já foi fechada
          — entra com a senha nova.
        </p>
        <Link href="/portal/login" className="btn btn-primary text-center">
          Entrar com a senha nova
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {etapa === 'email' && (
        <form ref={formRef} className="portal-form" action={formAction}>
          <input type="hidden" name="passo" value="email" />
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
              autoFocus
            />
          </label>

          {state && !state.ok && (
            <p className="portal-error" role="alert">
              {ERROS[state.error] || 'Erro inesperado.'}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'A verificar…' : 'Continuar'}
          </button>
        </form>
      )}

      {etapa === 'codigo' && (
        <form className="portal-form" action={formAction}>
          <input type="hidden" name="passo" value="codigo" />
          <input type="hidden" name="email" value={emailAtual} />

          <p className="portal-hint" style={{ margin: 0 }}>
            Enviámos um código de 8 dígitos para <strong>{emailAtual}</strong>. Verifique também o
            spam.
          </p>

          <label className="portal-label">
            Código do e-mail
            <input
              type="text"
              name="codigo"
              className="portal-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              minLength={8}
              pattern="[0-9]{8}"
              placeholder="8 dígitos"
              style={{ letterSpacing: '0.35em', fontVariantNumeric: 'tabular-nums' }}
              required
              autoFocus
            />
          </label>

          {state && !state.ok && (
            <p className="portal-error" role="alert">
              {ERROS[state.error] || 'Erro inesperado.'}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'A confirmar…' : 'Confirmar código'}
          </button>
        </form>
      )}

      {etapa === 'codigo' && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <form action={formAction}>
            <input type="hidden" name="passo" value="email" />
            <input type="hidden" name="email" value={emailAtual} />
            <button
              type="submit"
              className="portal-link bg-transparent p-0 underline-offset-4 hover:underline"
              disabled={pending}
            >
              Reenviar código
            </button>
          </form>
          <button
            type="button"
            className="portal-link bg-transparent p-0 underline-offset-4 hover:underline"
            onClick={() => {
              setEtapaPedida('email')
              setEmail(emailAtual)
            }}
          >
            Usar outro e-mail
          </button>
        </div>
      )}

      {etapa === 'totp' && (
        <form className="portal-form" action={formAction}>
          <input type="hidden" name="passo" value="totp" />
          <input type="hidden" name="email" value={emailAtual} />

          <p className="portal-hint" style={{ margin: 0 }}>
            O e-mail está confirmado. Falta o código do autenticador desta conta — abre a aplicação
            (Google Authenticator, Microsoft Authenticator, 1Password…) e escreve os 6 dígitos.
          </p>

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
              style={{ letterSpacing: '0.35em', fontVariantNumeric: 'tabular-nums' }}
              required
              autoFocus
            />
          </label>

          {state && !state.ok && (
            <p className="portal-error" role="alert">
              {ERROS[state.error] || 'Erro inesperado.'}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'A confirmar…' : 'Confirmar'}
          </button>
        </form>
      )}

      {etapa === 'senha' && (
        <form className="portal-form" action={formAction}>
          <input type="hidden" name="passo" value="senha" />
          <input type="hidden" name="email" value={emailAtual} />

          <p className="portal-hint" style={{ margin: 0 }}>
            Identidade confirmada. Escolha a senha nova de <strong>{emailAtual}</strong> — no fim
            volta ao login para entrar com ela.
          </p>

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
              autoFocus
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
            {pending ? 'A guardar…' : 'Guardar senha'}
          </button>
        </form>
      )}

      <p className="portal-hint">
        O código do e-mail chega em segundos e vale uma hora. Não tem acesso ao e-mail nem ao
        autenticador?{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="portal-link">
          Fale connosco
        </a>
        .
      </p>
    </div>
  )
}
