'use client'

import { useActionState } from 'react'
import { changeStaffPin } from '@/lib/actions/pharmacy-staff'

const ERRORES = {
  SEM_PERFIL: 'Sem perfil activo — escolha um perfil primeiro.',
  PIN_INVALIDO: 'O PIN actual tem 4 dígitos.',
  PIN_NOVO_INVALIDO: 'O novo PIN tem 4 dígitos.',
  PIN_IGUAL: 'O novo PIN é igual ao actual.',
  PIN_CONFIRMACAO: 'A confirmação não coincide com o novo PIN.',
  PIN_ACTUAL_ERRADO: 'O PIN actual está incorrecto.',
  FALHA_GUARDAR: 'Não foi possível guardar o PIN. Tente novamente.',
}

/**
 * Alterar o PIN do perfil activo — o gerente também o usa para
 * repor um PIN esquecido (via Equipa → Editar).
 */
export default function ChangePinForm() {
  const action = async (_prev, formData) =>
    changeStaffPin({
      currentPin: formData.get('currentPin'),
      newPin: formData.get('newPin'),
      confirmPin: formData.get('confirmPin'),
    })

  // Estado inicial vazio: sem sucesso nem erro antes do 1º envio.
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <form className="portal-form portal-form--start" action={formAction}>
      <div className="portal-form-grid portal-form-grid--pin">
        <label className="portal-label">
          PIN actual
          <input
            className="portal-input portal-input--pin"
            type="password"
            name="currentPin"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="portal-label">
          Novo PIN
          <input
            className="portal-input portal-input--pin"
            type="password"
            name="newPin"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="portal-label">
          Confirmar
          <input
            className="portal-input portal-input--pin"
            type="password"
            name="confirmPin"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            autoComplete="new-password"
            required
          />
        </label>
      </div>

      {state?.ok === false && (
        <p className="portal-error" role="alert">
          {ERRORES[state.error] || 'Erro inesperado.'}
        </p>
      )}
      {state?.ok === true && (
        <p className="portal-hint" role="status">
          PIN actualizado — use o novo da próxima vez que entrar no perfil.
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'A guardar…' : 'Alterar PIN'}
      </button>
    </form>
  )
}
