'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  bootstrapFirstProfile,
  enterStaffProfile,
  listStaffProfiles,
} from '@/lib/actions/pharmacy-staff'
import { logWarn } from '@/lib/log'

/**
 * Escolha de perfil de farmacêutico (PIN) — o «quem está ao balcão».
 *
 * Lista os perfis activos da farmácia (Server Action), escolhe-se um e
 * introduz-se o PIN de 4 dígitos; o servidor valida o scrypt e assina o
 * cookie do dispositivo (24 h). Vários dispositivos podem ficar em
 * perfis diferentes ao mesmo tempo — cada um tem o seu cookie.
 *
 * Ecrã de abertura do turno: por isso a hierarquia é a escolha, não o
 * formulário — os perfis são cartões com avatar e o PIN abre-se SOBRE
 * o perfil escolhido, sem empurrar a grelha.
 */

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  PIN_ERRADO: 'PIN incorrecto. Tente de novo.',
  PIN_INVALIDO: 'O PIN tem 4 dígitos.',
  PIN_CONFIRMACAO: 'A confirmação não coincide com o PIN.',
  NOME_INVALIDO: 'O nome tem de ter 2 a 80 caracteres.',
  JA_EXISTE_EQUIPA: 'A equipa já foi criada — recarregue a página e escolha um perfil.',
  PERFIL_INEXISTENTE: 'Este perfil já não está activo nesta farmácia.',
  FALHA_ENTRAR: 'Não foi possível entrar no perfil. Tente novamente.',
  FALHA_CRIAR: 'Não foi possível criar o perfil. Tente novamente.',
  FALHA_LISTAR: 'Não foi possível carregar os perfis.',
}

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

export default function StaffPicker({ pharmacyName, accountName }) {
  const [list, setList] = useState(null) // null = a carregar
  const [total, setTotal] = useState(null)
  const [current, setCurrent] = useState(null)
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [pending, startTransition] = useTransition()
  // Primeira arranque: farmácia sem nenhum perfil → criar gerente aqui.
  const [primeiro, setPrimeiro] = useState({ name: '', pin: '', confirm: '' })

  useEffect(() => {
    let alive = true
    listStaffProfiles().then((res) => {
      if (!alive) return
      if (res?.ok) {
        setList(res.staff)
        setTotal(res.total)
        setCurrent(res.current)
      } else {
        setList([])
        setTotal(null)
        setError(res?.error || 'FALHA_LISTAR')
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const escolher = (s) => {
    setSelected(s)
    setPin('')
    setError(null)
  }

  const submeter = (e) => {
    e.preventDefault()
    if (!selected || pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await enterStaffProfile({ staffId: selected.id, pin })
        // Sucesso = redirect do servidor (NEXT_REDIRECT) — não volta aqui.
        if (res && !res.ok) setError(res.error || 'FALHA_ENTRAR')
      } catch (err) {
        if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
        logWarn('perfis', 'Entrada no perfil falhou', { message: err?.message })
        setError('FALHA_ENTRAR')
      }
    })
  }

  const criarPrimeiro = (e) => {
    e.preventDefault()
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await bootstrapFirstProfile({
          name: primeiro.name,
          pin: primeiro.pin,
          confirmPin: primeiro.confirm,
        })
        if (res && !res.ok) setError(res.error || 'FALHA_CRIAR')
      } catch (err) {
        if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
        logWarn('perfis', 'Primeiro perfil falhou', { message: err?.message })
        setError('FALHA_CRIAR')
      }
    })
  }

  return (
    <div className="portal-staff-screen">
      {/* Cabeçalho — a escolha é o assunto da página, não um detalhe
          dentro de uma caixa: título serif + quem está logado. */}
      <header className="portal-staff-head">
        <p className="portal-staff-eyebrow">{pharmacyName}</p>
        <h1 className="portal-staff-title">Quem está ao balcão?</h1>
        <p className="portal-staff-lead">
          Escolha o seu perfil — tudo o que registar a partir daqui fica em seu nome.
        </p>
      </header>

      {/* Perfil já activo — continuar é o caminho mais curto. */}
      {current && !selected && (
        <Link href="/portal" className="portal-staff-continue">
          <span className="portal-staff-av" aria-hidden="true">
            {iniciais(current.name)}
          </span>
          <span className="portal-staff-continue-meta">
            <b>{current.name}</b>
            <span>Perfil activo — continue o turno</span>
          </span>
          <span className="portal-staff-continue-go">Continuar →</span>
        </Link>
      )}

      {list === null && (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      )}

      {/* Primeira arranque — a farmácia cria aqui o seu gerente. */}
      {list !== null && list.length === 0 && total === 0 && (
        <form
          className="portal-box portal-box--pad portal-staff-bootstrap"
          onSubmit={criarPrimeiro}
        >
          <div className="portal-sec-head">
            <h2>Criar o primeiro perfil</h2>
            <span className="portal-sec-head-b">gerente</span>
          </div>
          <p className="portal-hint">
            Ainda não há perfis nesta farmácia — crie o perfil de gerente para começar a gerir a
            equipa.
          </p>
          <label className="portal-label" htmlFor="primeiro-nome">
            Nome do gerente
          </label>
          <input
            id="primeiro-nome"
            className="portal-input"
            type="text"
            minLength={2}
            maxLength={80}
            placeholder="Ex.: Rosa Manuel"
            value={primeiro.name}
            onChange={(e) => setPrimeiro((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <label className="portal-label" htmlFor="primeiro-pin">
            PIN (4 dígitos)
          </label>
          <input
            id="primeiro-pin"
            className="portal-input portal-input--pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            placeholder="••••"
            value={primeiro.pin}
            onChange={(e) =>
              setPrimeiro((p) => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))
            }
            required
          />
          <label className="portal-label" htmlFor="primeiro-confirm">
            Confirmar PIN
          </label>
          <input
            id="primeiro-confirm"
            className="portal-input portal-input--pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            placeholder="••••"
            value={primeiro.confirm}
            onChange={(e) =>
              setPrimeiro((p) => ({ ...p, confirm: e.target.value.replace(/\D/g, '').slice(0, 4) }))
            }
            required
          />
          {error && (
            <p className="portal-error" role="alert">
              {ERRORES[error] || 'Erro inesperado.'}
            </p>
          )}
          <div className="portal-staff-acts">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || primeiro.pin.length !== 4 || primeiro.confirm !== primeiro.pin}
            >
              {pending ? 'A criar…' : 'Criar e entrar'}
            </button>
          </div>
        </form>
      )}

      {list !== null && list.length === 0 && total !== null && total !== 0 && (
        <div className="portal-box">
          <div className="portal-rows-empty">
            <b>Sem perfis de farmacêutico</b>
            Peça ao gerente da farmácia para criar o seu perfil em Equipa.
          </div>
        </div>
      )}

      {/* Grelha de perfis — cartões com avatar, não botões de lista:
          o balcão escolhe de relance, de pé, sem ler. */}
      {list !== null && list.length > 0 && (
        <div className="portal-staff-screen-body">
          <div className="portal-staff-grid portal-staff-grid--pick">
            {list.map((s) => {
              const isCurrent = current?.id === s.id
              const isSel = selected?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`portal-staff-card${isSel ? ' is-sel' : ''}${
                    selected && !isSel ? ' is-dim' : ''
                  }`}
                  aria-pressed={isSel}
                  onClick={() => escolher(s)}
                >
                  <span className="portal-staff-av portal-staff-av--xl" aria-hidden="true">
                    {iniciais(s.name)}
                  </span>
                  <span className="portal-staff-card-name">{s.name}</span>
                  <span className="portal-staff-card-role">
                    {/* Papel como chip redondo (novo modelo); o perfil
                        já activo neste dispositivo ganha o chip verde
                        «Em uso» — gestão fica em /equipa. */}
                    <span className="portal-pill">
                      {s.role === 'gerente' ? 'Gerente' : 'Balcão'}
                    </span>
                    {isCurrent && <span className="portal-pill portal-pill--ok">Em uso</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {/* PIN — abre sobre a grelha, com o rosto de quem entra. */}
          {selected && (
            <form className="portal-staff-pin-card" onSubmit={submeter}>
              <div className="portal-staff-pin-who">
                <span className="portal-staff-av portal-staff-av--lg" aria-hidden="true">
                  {iniciais(selected.name)}
                </span>
                <div className="portal-staff-pin-who-meta">
                  <b>{selected.name}</b>
                  <span>
                    {selected.role === 'gerente' ? 'Gerente' : 'Balcão'} · PIN de 4 dígitos
                  </span>
                </div>
                <button
                  type="button"
                  className="portal-staff-pin-back"
                  onClick={() => escolher(null)}
                >
                  Trocar
                </button>
              </div>

              <input
                className="portal-input portal-input--pin portal-input--pin-lg"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                pattern="\d{4}"
                placeholder="••••"
                aria-label={`PIN de ${selected.name}`}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                autoFocus
              />

              {error && (
                <p className="portal-error" role="alert">
                  {ERRORES[error] || 'Erro inesperado.'}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary portal-staff-pin-go"
                disabled={pending || pin.length !== 4}
              >
                {pending ? 'A entrar…' : 'Entrar no perfil'}
              </button>
            </form>
          )}

          {selected && error && (
            <p className="portal-error" role="alert">
              {ERRORES[error] || 'Erro inesperado.'}
            </p>
          )}

          {!selected && error && (
            <p className="portal-error" role="alert">
              {ERRORES[error] || 'Erro inesperado.'}
            </p>
          )}
        </div>
      )}

      <footer className="portal-staff-screen-foot">
        Sessão iniciada como <b>{accountName}</b> · cada dispositivo guarda o seu perfil por 24 h.
      </footer>
    </div>
  )
}
