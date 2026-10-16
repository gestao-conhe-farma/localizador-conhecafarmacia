'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updatePharmacy } from '@/lib/actions/platform-pharmacies'
import { MUNICIPIOS } from '@/lib/constants'
import Notice from '@/components/ui/Notice'

const ERROS = {
  NOME_INVALIDO: 'O nome tem de ter pelo menos duas letras — é o que o cliente vê no Localizador.',
  MUNICIPIO_INVALIDO: 'Escolha um município da lista (o directório só cobre estes nove).',
  EMAIL_INVALIDO: 'O e-mail não parece válido.',
  URL_INVALIDO: 'O link do mapa tem de começar por http:// ou https://.',
  ID_INVALIDO: 'Pedido inválido.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  SEM_PERMISSAO: 'O seu nível não permite editar a ficha.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  FALHA: 'Não foi possível guardar. Tente de novo.',
}

/**
 * Edição da ficha da farmácia (Task 5.2, acção «Editar»).
 *
 * FormData + `useActionState`, como o login: o servidor valida campo a
 * campo e devolve o campo com erro, para a mensagem aparecer ao lado do
 * que está mal em vez de uma tarja genérica no fim. `municipio` é um
 * `select` porque a base de dados o recusa fora da lista (CHECK da 0001) —
 * é melhor não deixar escrever o que não passa.
 *
 * O slug não se edita: é a morada pública da farmácia (`/farmacia/<slug>`)
 * e mudá-la parte os links que já circulam.
 */
export default function PharmacyForm({ id, valores, onClose }) {
  const [state, formAction, pending] = useActionState(updatePharmacy, { ok: true })
  const router = useRouter()

  // Sucesso (o `mudou` só existe depois de um envio real): fecha e manda o
  // servidor redesenhar a ficha com os valores novos.
  useEffect(() => {
    if (state?.ok && typeof state.mudou === 'number') {
      router.refresh()
      onClose()
    }
  }, [state, router, onClose])

  const erroDe = (campo) =>
    state && !state.ok && state.campo === campo ? ERROS[state.error] || 'Valor inválido.' : null
  const erroGeral =
    state && !state.ok && !state.campo ? ERROS[state.error] || 'Erro inesperado.' : null

  return (
    <div
      className="interno-modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="interno-modal" role="dialog" aria-modal="true" aria-label="Editar ficha">
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />

          <div className="interno-modal-head">
            <span className="interno-modal-title">Editar ficha</span>
            <button
              type="button"
              className="interno-modal-close"
              onClick={onClose}
              disabled={pending}
              aria-label="Fechar sem guardar"
            >
              ×
            </button>
          </div>

          <div className="interno-modal-body">
            <div className="interno-form-grid">
              <label className="interno-label">
                Nome
                <input
                  className="interno-input"
                  name="name"
                  defaultValue={valores.name}
                  maxLength={120}
                  required
                />
                {erroDe('name') && <span className="interno-error">{erroDe('name')}</span>}
              </label>

              <label className="interno-label">
                Município
                <select
                  className="interno-select"
                  name="municipio"
                  defaultValue={valores.municipio}
                >
                  {MUNICIPIOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {erroDe('municipio') && (
                  <span className="interno-error">{erroDe('municipio')}</span>
                )}
              </label>

              <label className="interno-label">
                Morada
                <input
                  className="interno-input"
                  name="address"
                  defaultValue={valores.address}
                  maxLength={200}
                />
              </label>

              <label className="interno-label">
                Telefone
                <input
                  className="interno-input"
                  name="phone"
                  defaultValue={valores.phone}
                  maxLength={40}
                />
              </label>

              <label className="interno-label">
                WhatsApp
                <input
                  className="interno-input"
                  name="whatsapp"
                  defaultValue={valores.whatsapp}
                  maxLength={40}
                />
              </label>

              <label className="interno-label">
                E-mail de contacto
                <input
                  className="interno-input"
                  name="email"
                  type="email"
                  defaultValue={valores.email}
                  maxLength={160}
                />
                {erroDe('email') && <span className="interno-error">{erroDe('email')}</span>}
              </label>

              <label className="interno-label">
                Horário
                <textarea
                  className="interno-textarea"
                  name="opening_hours"
                  rows={3}
                  defaultValue={valores.opening_hours}
                  maxLength={400}
                />
                <span className="interno-hint">
                  O texto que o cliente lê no Localizador (ex.: «Seg–Sex 8h–19h · Sáb 8h–13h»).
                </span>
              </label>

              <label className="interno-label">
                Link do mapa
                <input
                  className="interno-input"
                  name="maps_url"
                  defaultValue={valores.maps_url}
                  maxLength={500}
                />
                {erroDe('maps_url') && <span className="interno-error">{erroDe('maps_url')}</span>}
              </label>
            </div>

            {erroGeral && (
              <Notice tone="danger" role="alert">
                {erroGeral}
              </Notice>
            )}

            <p className="interno-hint">
              A alteração fica na trilha de auditoria com os campos que mudaram e quem os mudou.
            </p>
          </div>

          <div className="interno-modal-acts">
            <button
              type="button"
              className="interno-btn interno-btn--ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancelar
            </button>
            <button type="submit" className="interno-btn interno-btn--primary" disabled={pending}>
              {pending ? 'A guardar…' : 'Guardar ficha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
