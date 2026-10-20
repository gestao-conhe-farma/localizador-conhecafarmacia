'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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
 * Modelo editorial A (_design/portal-reimaginado/A-editorial.html):
 * eyebrow + título serif grande + lead; grelha de cartões brancos
 * (avatar, nome serif, papel e chip de estado) e o PIN revelado SOBRE o
 * perfil escolhido, num painel centrado com uma caixa de PIN — nenhum
 * campo à mostra até ser preciso. «Em uso» marca o perfil que já está
 * activo neste dispositivo.
 *
 * O campo usa `inputMode="numeric"`: no telemóvel abre o teclado
 * numérico, no PC escreve-se no teclado físico (ou no leitor do balcão).
 *
 * Vários dispositivos podem ficar em perfis diferentes ao mesmo tempo —
 * cada um tem o seu cookie (24 h), assinado pelo servidor depois de o
 * scrypt validar o PIN.
 */

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  PIN_ERRADO: 'PIN incorrecto. Tente de novo.',
  PIN_BLOQUEADO: 'Demasiadas tentativas. Aguarde antes de tentar novamente.',
  PIN_INVALIDO: 'O PIN tem 4 dígitos.',
  PIN_CONFIRMACAO: 'A confirmação não coincide com o PIN.',
  NOME_INVALIDO: 'O nome tem de ter 2 a 80 caracteres.',
  JA_EXISTE_EQUIPA: 'A equipa já foi criada — recarregue a página e escolha um perfil.',
  PERFIL_INEXISTENTE: 'Este perfil já não está activo nesta farmácia.',
  FALHA_ENTRAR: 'Não foi possível entrar no perfil. Tente novamente.',
  FALHA_CRIAR: 'Não foi possível criar o perfil. Tente novamente.',
  FALHA_LISTAR: 'Não foi possível carregar os perfis.',
}

/** "90 s" → "2 min"; "45 s" fica como está — espera do bloqueio do PIN. */
function formatEspera(sec) {
  const s = Number(sec) || 0
  if (s < 60) return `${s} s`
  const m = Math.ceil(s / 60)
  return m >= 60 ? '1 hora' : `${m} min`
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
  // Detalhe do erro (retryAfterSec no bloqueio, restantes no PIN errado).
  const [errorInfo, setErrorInfo] = useState(null)
  const [pending, startTransition] = useTransition()
  // Primeira arranque: farmácia sem nenhum perfil → criar gerente aqui.
  const [primeiro, setPrimeiro] = useState({ name: '', pin: '', confirm: '' })
  // O campo do PIN recebe o foco ao abrir o painel — teclado físico,
  // leitores do balcão e teclado numérico do telemóvel escrevem nele.
  const pinRef = useRef(null)

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

  // Painel do PIN aberto: foco directo no campo.
  useEffect(() => {
    if (selected) pinRef.current?.focus()
  }, [selected])

  const escolher = (s) => {
    setSelected(s)
    setPin('')
    setError(null)
    setErrorInfo(null)
    if (!s) pinRef.current?.blur()
  }

  // Entrada no perfil com um PIN explícito — o 4.º dígito digitado
  // submete sozinho; o botão Entrar continua disponível (e o Enter).
  const entrar = (pinValue) => {
    if (!selected || pending || pinValue.length !== 4) return
    setError(null)
    setErrorInfo(null)
    startTransition(async () => {
      try {
        const res = await enterStaffProfile({ staffId: selected.id, pin: pinValue })
        // Sucesso = redirect do servidor (NEXT_REDIRECT) — não volta aqui.
        if (res && !res.ok) {
          setError(res.error || 'FALHA_ENTRAR')
          setErrorInfo(res)
        }
      } catch (err) {
        if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
        logWarn('perfis', 'Entrada no perfil falhou', { message: err?.message })
        setError('FALHA_ENTRAR')
      }
    })
  }

  const submeter = (e) => {
    e.preventDefault()
    entrar(pin)
  }

  const aoDigitarPin = (e) => {
    const next = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(next)
    entrar(next)
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
      {/* Cabeçalho editorial (modelo A): eyebrow, título serif grande e
          uma linha que explica o gesto — tocar no perfil revela o PIN. */}
      <header className="portal-staff-head">
        <p className="portal-staff-eyebrow">Acesso ao balcão</p>
        <h1 className="portal-staff-title">Quem está ao balcão?</h1>
        <p className="portal-staff-lead">
          Toque num perfil para revelar o PIN — as vendas, reservas e entradas deste dispositivo
          ficam em seu nome.
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
        <form className="portal-staff-panel" onSubmit={criarPrimeiro}>
          <div className="portal-sec-head">
            <h2>Criar o primeiro perfil</h2>
            <span className="portal-sec-head-b">gerente</span>
          </div>
          <p className="portal-hint">
            Ainda não há perfis nesta farmácia — crie o perfil de gerente para começar a gerir a
            equipa.
          </p>
          <div className="portal-form-grid">
            <label className="portal-label" htmlFor="primeiro-nome">
              Nome do gerente
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
            </label>
            <label className="portal-label" htmlFor="primeiro-pin">
              PIN (4 dígitos)
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
            </label>
            <label className="portal-label" htmlFor="primeiro-confirm">
              Confirmar PIN
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
                  setPrimeiro((p) => ({
                    ...p,
                    confirm: e.target.value.replace(/\D/g, '').slice(0, 4),
                  }))
                }
                required
              />
            </label>
          </div>
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

      {/* Grelha de perfis — cartões como no modelo A: avatar, nome serif,
          papel e o chip de estado; o cartão escolhido ganha o anel da
          marca e os outros esbatem-se. */}
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
                    {s.role === 'gerente' ? 'Gerente' : 'Balcão'}
                  </span>
                  <span
                    className={`portal-chip ${
                      isCurrent ? 'portal-chip--ok' : 'portal-chip--mute portal-chip--nodot'
                    }`}
                  >
                    {isCurrent ? 'Em uso' : 'Activo'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* PIN — painel centrado do modelo: quem entra, caixa do PIN e
              «Entrar». */}
          {selected && (
            <form className="portal-staff-pin-card" onSubmit={submeter}>
              <div className="portal-staff-pin-who">
                <span className="portal-staff-av portal-staff-av--lg" aria-hidden="true">
                  {iniciais(selected.name)}
                </span>
                <span className="portal-staff-pin-who-meta">
                  <b>{selected.name}</b>
                  <span>{selected.role === 'gerente' ? 'Gerente' : 'Balcão'}</span>
                </span>
                <button
                  type="button"
                  className="portal-staff-pin-back"
                  aria-label="Fechar e escolher outro perfil"
                  onClick={() => escolher(null)}
                >
                  ✕
                </button>
              </div>

              <label className="portal-staff-pin-label" htmlFor="pin-campo">
                Introduza o PIN
              </label>
              <input
                id="pin-campo"
                ref={pinRef}
                className="portal-input portal-input--pin portal-staff-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                pattern="\d{4}"
                placeholder="••••"
                value={pin}
                onChange={aoDigitarPin}
                disabled={pending}
              />
              <p className="sr-only" aria-live="polite">
                {pin.length} de 4 dígitos introduzidos
              </p>

              {error && (
                <p className="portal-error" role="alert">
                  {error === 'PIN_BLOQUEADO' && errorInfo?.retryAfterSec
                    ? `Demasiadas tentativas — aguarde ${formatEspera(errorInfo.retryAfterSec)} antes de tentar de novo.`
                    : ERRORES[error] || 'Erro inesperado.'}
                  {error === 'PIN_ERRADO' &&
                    errorInfo?.restantes != null &&
                    errorInfo.restantes <= 2 &&
                    ` ${errorInfo.restantes > 0 ? `Restam ${errorInfo.restantes} tentativa${errorInfo.restantes === 1 ? '' : 's'} antes do bloqueio temporário.` : 'A próxima falha bloqueia temporariamente.'}`}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary portal-staff-pin-go"
                disabled={pending || pin.length !== 4}
              >
                {pending ? 'A entrar…' : 'Entrar'}
              </button>
              <p className="portal-staff-pin-note">
                Após 5 tentativas erradas, o perfil bloqueia temporariamente (1 min, depois o
                dobro). Tentativas erradas ficam registadas em log.
              </p>
            </form>
          )}

          {!selected && error && (
            <p className="portal-error" role="alert">
              {ERRORES[error] || 'Erro inesperado.'}
            </p>
          )}
        </div>
      )}

      <footer className="portal-staff-screen-foot">
        {pharmacyName} · sessão iniciada como <b>{accountName}</b> — cada dispositivo guarda o seu
        perfil por 24 h.
      </footer>
    </div>
  )
}
