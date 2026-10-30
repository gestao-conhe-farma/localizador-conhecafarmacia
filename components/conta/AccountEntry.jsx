'use client'

import { useEffect, useRef, useState } from 'react'
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
export default function AccountEntry({ variant = 'header', onNavigate = null }) {
  const favoritos = useFavorites()
  const [aberto, setAberto] = useState(false)
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

  if (!favoritos?.ready) return null
  const aqui = typeof window === 'undefined' ? '' : window.location.href

  const utilizador = favoritos.user
  const entrar = entrarHref(aqui || undefined)
  const email = (utilizador?.email || '').trim()
  const nomeConta = utilizador?.name || (email ? email.split('@')[0] : 'A minha conta')
  // A fotografia carregada na conta manda; o identicon é só o recurso para
  // quem ainda não tem uma — a mesma prioridade do site principal.
  const avatar =
    utilizador?.avatarUrl ||
    (email
      ? `https://www.gravatar.com/avatar/${encodeURIComponent(email.toLowerCase())}?d=identicon&s=64`
      : null)

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
        {avatar ? (
          <img src={avatar} alt="" className="profile-avatar" width={32} height={32} />
        ) : (
          <div className="profile-avatar-placeholder">
            <User size={18} aria-hidden="true" />
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
