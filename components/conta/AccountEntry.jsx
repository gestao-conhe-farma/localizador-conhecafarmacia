'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Bookmark, CalendarCheck, LogOut, User } from 'lucide-react'
import { useFavorites } from '@/components/conta/FavoritesProvider'
import { sair } from '@/lib/actions/account'
import { ACCOUNT_URL, entrarHref } from '@/lib/account-urls'

/**
 * Entrada de conta do Localizador.
 *
 * Não há formulários de autenticação neste sítio: sem sessão, isto é um link
 * para a entrada em `conta.*` com o caminho de volta; com sessão, é o avatar
 * com as listas da conta e a saída. A sessão já foi lida pelo
 * `FavoritesProvider`, por isso o cabeçalho não faz um pedido extra só para
 * saber o nome.
 *
 * O avatar e o cartão são os do site principal — mesmas classes, mesmo par de
 * acções e o mesmo fecho por toque fora/Escape. `variant="drawer-links"`
 * desenha as listas como linhas da gaveta e `variant="drawer"` desenha o par
 * Perfil/Terminar Sessão no rodapé, como no drawer do principal.
 */
/** O URL não muda sem navegação, e a navegação remonta a página. */
const subscreverNada = () => () => {}
const urlAtual = () => window.location.href

export default function AccountEntry({ variant = 'header', onNavigate = null }) {
  const favoritos = useFavorites()
  const [aberto, setAberto] = useState(false)
  const [avatarQuebrado, setAvatarQuebrado] = useState(false)
  // O URL de regresso só existe no cliente. Lido durante o render, o href
  // saía diferente no servidor e no browser e a home acusava desencontro de
  // hidratação. `useSyncExternalStore` dá '' no servidor e o URL real no
  // cliente, sem um `setState` dentro de um efeito.
  const aqui = useSyncExternalStore(subscreverNada, urlAtual, () => '')
  const menuRef = useRef(null)

  // Fecha ao clicar/tocar fora e com Escape. O `<details>` nativo não fechava
  // sozinho e o cartão ficava aberto por cima da página.
  useEffect(() => {
    if (!aberto) return undefined

    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setAberto(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setAberto(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [aberto])

  // A sessão só é conhecida no cliente, dentro de um efeito. Devolver `null`
  // até lá deixava o servidor sem este nó e, quando o efeito corria a meio da
  // hidratação, o cliente já desenhava o link — o nó extra empurrava o resto do
  // cabeçalho e a React acusava desencontro (#418, home do Localizador). Até
  // estar pronta, a entrada lê-se como «sem sessão»: é o que o servidor
  // também desenha, e quem tem sessão vê o avatar entrar logo a seguir.
  const utilizador = favoritos?.ready ? favoritos.user : null
  const entrar = entrarHref(aqui || undefined)
  const email = (utilizador?.email || '').trim()
  const nomeConta = utilizador?.name || (email ? email.split('@')[0] : 'A minha conta')
  // A fotografia carregada na conta manda. Sem ela, as iniciais — o
  // identicon do Gravatar parecia uma imagem que não carregou.
  const avatar = utilizador?.avatarUrl || null
  const iniciais = (() => {
    const parts = String(utilizador?.name || email || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'U'
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
  })()

  if (!utilizador) {
    if (variant === 'drawer') {
      return (
        <div className="drawer-auth-links">
          <a href={entrar} className="drawer-auth-link" onClick={onNavigate}>
            <User size={18} aria-hidden="true" />
            Entrar na conta
          </a>
        </div>
      )
    }
    if (variant === 'drawer-links') return null
    return (
      <a href={entrar} className="acct-entry">
        Entrar
      </a>
    )
  }

  if (variant === 'drawer') {
    return (
      <div className="drawer-auth-links">
        <a href={`${ACCOUNT_URL}/perfil`} className="drawer-auth-link" onClick={onNavigate}>
          <User size={18} aria-hidden="true" />
          Perfil
        </a>
        <form action={sair} className="drawer-auth-form">
          <button type="submit" className="drawer-auth-link drawer-auth-logout">
            <LogOut size={18} aria-hidden="true" />
            Terminar Sessão
          </button>
        </form>
      </div>
    )
  }

  if (variant === 'drawer-links') {
    return (
      <>
        <li>
          <Link href="/guardados" onClick={onNavigate}>
            Os meus guardados
          </Link>
        </li>
        <li>
          <Link href="/reservas" onClick={onNavigate}>
            As minhas reservas
          </Link>
        </li>
      </>
    )
  }

  return (
    <div className="profile-wrapper" ref={menuRef}>
      <button
        type="button"
        className="profile-btn"
        onClick={() => setAberto((o) => !o)}
        aria-expanded={aberto}
        aria-haspopup="true"
        aria-label="Perfil"
      >
        {avatar && !avatarQuebrado ? (
          <img
            src={avatar}
            alt=""
            className="profile-avatar"
            width={32}
            height={32}
            onError={() => setAvatarQuebrado(true)}
          />
        ) : (
          <div
            className="profile-avatar-placeholder"
            style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.02em' }}
            aria-hidden="true"
          >
            {iniciais}
          </div>
        )}
      </button>

      <div className={`profile-dropdown${aberto ? ' is-open' : ''}`}>
        <div className="profile-dropdown-header">
          <span className="profile-dropdown-name">{nomeConta}</span>
          <span className="profile-dropdown-email">{email}</span>
        </div>
        <div className="profile-dropdown-divider" />
        <Link href="/guardados" className="profile-dropdown-item" onClick={() => setAberto(false)}>
          <Bookmark size={16} aria-hidden="true" />
          Guardados
        </Link>
        <Link href="/reservas" className="profile-dropdown-item" onClick={() => setAberto(false)}>
          <CalendarCheck size={16} aria-hidden="true" />
          Reservas
        </Link>
        <a
          href={`${ACCOUNT_URL}/perfil`}
          className="profile-dropdown-item"
          onClick={() => setAberto(false)}
        >
          <User size={16} aria-hidden="true" />
          Perfil
        </a>
        <div className="profile-dropdown-divider" />
        <form action={sair}>
          <button type="submit" className="profile-dropdown-item profile-dropdown-logout">
            <LogOut size={16} aria-hidden="true" />
            Terminar Sessão
          </button>
        </form>
      </div>
    </div>
  )
}
