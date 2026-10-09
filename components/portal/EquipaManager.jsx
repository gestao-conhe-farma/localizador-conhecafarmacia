'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStaffProfile, updateStaffProfile } from '@/lib/actions/pharmacy-staff'
import { logWarn } from '@/lib/log'
import PortalDrawer from '@/components/portal/PortalDrawer'

function iniciais(nome) {
  const parts = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'F'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

/**
 * Gestão da equipa — cria e edita perfis de farmacêutico (nome, papel,
 * PIN, activo). Toda a escrita é Server Action validada (só gerente);
 * após cada sucesso o router.refresh() re-busca a lista do servidor.
 *
 * Separação de papéis (v2): esta página é GESTÃO — a lista é o assunto
 * e os formulários nunca ficam «à mostra»: criar e editar abrem num
 * drawer lateral (PortalDrawer). A ENTRADA no balcão (cartões + PIN)
 * vive em /portal/perfis e não se repete aqui.
 */

const ERRORES = {
  NOME_INVALIDO: 'O nome tem de ter 2 a 80 caracteres.',
  PIN_INVALIDO: 'O PIN tem 4 dígitos.',
  PAPEL_INVALIDO: 'Papel inválido.',
  PERFIL_INEXISTENTE: 'Este perfil já não existe.',
  NAO_PODE_DESACTIVAR_SE: 'Não pode desactivar o seu próprio perfil.',
  FALHA_CRIAR: 'Não foi possível criar o perfil.',
  FALHA_GUARDAR: 'Não foi possível guardar as alterações.',
  FALHA_LISTAR: 'Não foi possível carregar a equipa.',
}

const PAPEIS = [
  { id: 'balcao', label: 'Balcão — atende e regista' },
  { id: 'gerente', label: 'Gerente — gere equipa e vê desempenho' },
]

export default function EquipaManager({ rows, currentId, error }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  // Drawer: null = fechado · 'novo' = criação · id = edição desse perfil.
  const [drawer, setDrawer] = useState(null)

  // Form de criação (controlado — limpa após sucesso).
  const [novo, setNovo] = useState({ name: '', pin: '', role: 'balcao' })
  // Form de edição.
  const [edit, setEdit] = useState(null)

  const fecharDrawer = () => {
    setDrawer(null)
    setEditingId(null)
    setEdit(null)
    setFormError(null)
  }

  const criar = (e) => {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)
    startTransition(async () => {
      const res = await createStaffProfile(novo)
      if (res?.ok) {
        setNovo({ name: '', pin: '', role: 'balcao' })
        setOkMsg(`Perfil de ${novo.name.trim()} criado.`)
        fecharDrawer()
        router.refresh()
      } else {
        setFormError(res?.error || 'FALHA_CRIAR')
        logWarn('equipa', 'Criar perfil falhou', { error: res?.error })
      }
    })
  }

  const abrirEdicao = (row) => {
    setEditingId(row.id)
    setEdit({ name: row.name, role: row.role, active: row.active, pin: '' })
    setFormError(null)
    setOkMsg(null)
    setDrawer(row.id)
  }

  const guardar = (e) => {
    e.preventDefault()
    if (!editingId || !edit) return
    setFormError(null)
    setOkMsg(null)
    const payload = { staffId: editingId, name: edit.name, role: edit.role, active: edit.active }
    if (edit.pin) payload.pin = edit.pin
    startTransition(async () => {
      const res = await updateStaffProfile(payload)
      if (res?.ok) {
        fecharDrawer()
        setOkMsg('Alterações guardadas.')
        router.refresh()
      } else {
        setFormError(res?.error || 'FALHA_GUARDAR')
        logWarn('equipa', 'Editar perfil falhou', { error: res?.error })
      }
    })
  }

  if (error) {
    return (
      <div className="portal-box">
        <div className="portal-rows-empty">
          <b>Não foi possível carregar a equipa</b>
          {ERRORES[error] || 'Recarregue a página e tente de novo.'}
        </div>
      </div>
    )
  }

  const editando = drawer && drawer !== 'novo' && edit

  return (
    <>
      {/* Acção ocasional — o formulário vive no drawer, não na página. */}
      <div className="portal-box portal-box--pad portal-eq-new">
        <div className="portal-eq-new-bar">
          <div className="portal-eq-new-txt">
            <b>Novo farmacêutico</b>
            <span>Nome, papel e PIN de 4 dígitos — entra a seguir no ecrã de perfis.</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDrawer('novo')
              setFormError(null)
              setOkMsg(null)
            }}
          >
            + Novo perfil
          </button>
        </div>

        {!drawer && okMsg && !formError && (
          <p className="portal-hint" role="status">
            {okMsg}
          </p>
        )}
      </div>

      {/* Lista da equipa — só gestão: papel, estado e acções. */}
      <div className="portal-box portal-rows">
        <div className="portal-sec-head">
          <h2>Perfis</h2>
          <span className="portal-sec-head-b">
            {rows.length} perfil{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="portal-rows-empty">
            <b>Ainda não há perfis</b>
            Crie o primeiro perfil de farmacêutico acima.
          </div>
        ) : (
          <>
            <div className="portal-rowhead portal-cols-equipa" aria-hidden="true">
              <span />
              <span>Nome</span>
              <span>Papel</span>
              <span>Estado</span>
              <span />
            </div>

            {rows.map((row) => (
              <div key={row.id} className="portal-rowline portal-rowline--static portal-eq-row">
                <span className="portal-staff-av" aria-hidden="true">
                  {iniciais(row.name)}
                </span>
                <div className="portal-cell portal-eq-who">
                  <b>{row.name}</b>
                  <span className="sub portal-cell-mob">
                    {row.role === 'gerente' ? 'Gerente' : 'Balcão'} ·{' '}
                    {row.active ? 'Activo' : 'Inactivo'}
                    {row.id === currentId ? ' · perfil activo aqui' : ''}
                  </span>
                </div>
                <div className="portal-cell">
                  <span className="portal-pill">
                    {row.role === 'gerente' ? 'Gerente' : 'Balcão'}
                  </span>
                </div>
                <div className="portal-cell">
                  <span className={`portal-dot-state ${row.active ? '' : 'is-off'}`}>
                    {row.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="portal-cell portal-cell--right">
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => abrirEdicao(row)}
                    disabled={pending}
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Drawer — criar ou editar. Nenhum input à mostra na página. */}
      <PortalDrawer
        open={drawer === 'novo'}
        title="Novo perfil"
        hint="Nome, papel e PIN de 4 dígitos — o colega entra depois em «Trocar perfil»."
        onClose={fecharDrawer}
      >
        <form className="portal-form" onSubmit={criar}>
          <div className="portal-form-grid portal-form-grid--tight">
            <label className="portal-label">
              Nome
              <input
                className="portal-input"
                type="text"
                value={novo.name}
                onChange={(e) => setNovo((n) => ({ ...n, name: e.target.value }))}
                minLength={2}
                maxLength={80}
                placeholder="Ex.: Rosa Manuel"
                required
                autoFocus
              />
            </label>
            <label className="portal-label">
              PIN
              <input
                className="portal-input portal-input--pin"
                type="text"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={novo.pin}
                onChange={(e) =>
                  setNovo((n) => ({ ...n, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                }
                placeholder="••••"
                required
              />
            </label>
            <label className="portal-label">
              Papel
              <select
                className="portal-input"
                value={novo.role}
                onChange={(e) => setNovo((n) => ({ ...n, role: e.target.value }))}
              >
                {PAPEIS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError && (
            <p className="portal-error" role="alert">
              {ERRORES[formError] || 'Erro inesperado.'}
            </p>
          )}

          <div className="portal-staff-acts">
            <button type="button" className="btn btn-secondary" onClick={fecharDrawer}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'A guardar…' : 'Criar perfil'}
            </button>
          </div>
        </form>
      </PortalDrawer>

      <PortalDrawer
        open={Boolean(editando)}
        title={editando ? editando.name : 'Editar perfil'}
        hint="Alterações ficam registadas no log com o perfil que as fez."
        onClose={fecharDrawer}
      >
        {editando && (
          <form className="portal-form" onSubmit={guardar}>
            <div className="portal-form-grid portal-form-grid--tight">
              <label className="portal-label">
                Nome
                <input
                  className="portal-input"
                  type="text"
                  value={edit.name}
                  onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  minLength={2}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label className="portal-label">
                Papel
                <select
                  className="portal-input"
                  value={edit.role}
                  onChange={(e) => setEdit((s) => ({ ...s, role: e.target.value }))}
                >
                  {PAPEIS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-label">
                Novo PIN (opcional)
                <input
                  className="portal-input portal-input--pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={edit.pin}
                  onChange={(e) =>
                    setEdit((s) => ({
                      ...s,
                      pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                    }))
                  }
                  placeholder="manter"
                />
              </label>
            </div>

            <label className="portal-staff-active">
              <input
                type="checkbox"
                checked={edit.active}
                disabled={editando.id === currentId}
                onChange={(e) => setEdit((s) => ({ ...s, active: e.target.checked }))}
              />
              Perfil activo
              {editando.id === currentId && <span className="tiny"> (o seu)</span>}
            </label>

            {formError && (
              <p className="portal-error" role="alert">
                {ERRORES[formError] || 'Erro inesperado.'}
              </p>
            )}

            <div className="portal-staff-acts">
              <button type="button" className="btn btn-secondary" onClick={fecharDrawer}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </PortalDrawer>
    </>
  )
}
