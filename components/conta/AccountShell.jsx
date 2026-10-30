'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_URL, LOCATOR_URL, SITE_URL } from '@/lib/account-urls'
import { CloseIcon, NavIcon } from '@/components/ui/Icon'
import ThemeToggle from '@/components/ui/ThemeToggle'

/**
 * Chassi das páginas de conta — a mesma peça nos três hosts (conta.*, site
 * e Localizador).
 *
 * Herda a estrutura do PortalShell: sidebar de altura total à esquerda,
 * top-bar dentro da coluna de conteúdo e drawer em ecrã estreito. A versão
 * clara é a do portal v2 (branco + hairline + números estruturais), para a
 * conta não parecer um produto diferente do portal que a farmácia usa.
 *
 * Uma só lista nos três sítios: as secções vivem em hosts diferentes e os
 * itens atravessam-nos com URLs absolutas. `surface` diz onde estamos e é
 * o que evita que «Visão geral» (`/perfil` em conta.*) e «Perfil de
 * estudante» (`/pt/perfil` no site) se acendam ao mesmo tempo.
 */
const NAV = [
  {
    group: 'Conta',
    items: [
      {
        key: 'geral',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil`,
        path: '/perfil',
        exact: true,
        label: 'Visão geral',
        icon: 'inicio',
      },
      {
        key: 'guardados',
        surface: 'localizador',
        href: `${LOCATOR_URL}/guardados`,
        path: '/guardados',
        label: 'Guardados',
        icon: 'guardados',
      },
      {
        key: 'reservas',
        surface: 'localizador',
        href: `${LOCATOR_URL}/reservas`,
        path: '/reservas',
        label: 'Reservas',
        icon: 'reservas',
      },
      {
        key: 'eventos',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/eventos`,
        path: '/perfil/eventos',
        label: 'Eventos',
        icon: 'reservas',
      },
      {
        key: 'seguranca',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/seguranca`,
        path: '/perfil/seguranca',
        label: 'Segurança',
        icon: 'seguranca',
      },
    ],
  },
  {
    group: 'Estudo',
    items: [
      {
        key: 'estudante',
        surface: 'site',
        href: `${SITE_URL}/pt/perfil`,
        path: '/perfil',
        exact: true,
        label: 'Perfil de estudante',
        icon: 'estudante',
      },
      {
        key: 'definicoes',
        surface: 'site',
        href: `${SITE_URL}/pt/perfil/definicoes`,
        path: '/perfil/definicoes',
        label: 'Definições',
        icon: 'definicoes',
      },
    ],
  },
]

function iniciais(nome, email) {
  const parts = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) {
    return String(email || 'U').trim().charAt(0).toUpperCase() || 'U'
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export default function AccountShell({ user = {}, surface = 'localizador', lang = 'pt', children }) {
  const pathname = usePathname() || '/'
  const [navOpen, setNavOpen] = useState(false)

  const prefix = surface === 'site' ? `/${lang}` : ''
  const isActive = useCallback(
    (item) => {
      if (item.surface !== surface) return false
      const target = `${prefix}${item.path}`
      if (item.exact) return pathname === target
      return pathname === target || pathname.startsWith(`${target}/`)
    },
    [pathname, prefix, surface],
  )

  const flat = NAV.flatMap((group) => group.items)
  const active = flat.find(isActive)

  const closeNav = useCallback(() => setNavOpen(false), [])

  // Em ecrã largo a sidebar é fixa: se o estado ficar «aberto» ao passar do
  // telemóvel para o desktop, o conteúdo ficava inerte sem nada para fechar.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 60rem)')
    const sync = () => {
      if (!mq.matches) setNavOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Fecha o drawer em cada navegação e com Escape. `queueMicrotask` evita
  // o setState síncrono dentro do efeito (o mesmo padrão da PortalSidebar).
  useEffect(() => {
    queueMicrotask(() => setNavOpen(false))
  }, [pathname])

  useEffect(() => {
    if (!navOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  // Com a gaveta aberta, o conteúdo por trás não desliza.
  useEffect(() => {
    if (!navOpen) return undefined
    document.body.classList.add('conta-nav-open')
    return () => document.body.classList.remove('conta-nav-open')
  }, [navOpen])

  async function sair() {
    try {
      await createClient().auth.signOut()
    } catch {
      // Mesmo que o pedido falhe, a pessoa pediu para sair.
    }
    window.location.href = `${ACCOUNT_URL}/entrar`
  }

  const nome = user.name || user.email || 'A minha conta'
  const avatar = user.avatarUrl || null
  const inicial = iniciais(user.name, user.email)

  return (
    <div className="conta-shell">
      {navOpen && <div className="conta-scrim" onClick={closeNav} aria-hidden="true" />}

      <aside className={`conta-sidebar${navOpen ? ' conta-sidebar--open' : ''}`}>
        <div className="conta-side-brand">
          <Link
            href={`${ACCOUNT_URL}/perfil`}
            className="conta-side-logo"
            aria-label="A minha conta — visão geral"
          >
            <Image
              src="/logo/logo-principal-verde.png"
              alt="Conheça Farmácia"
              width={150}
              height={51}
              priority
              className="conta-logo-green"
            />
            <Image
              src="/logo/logo-principal-branco.png"
              alt=""
              width={150}
              height={51}
              priority
              aria-hidden="true"
              className="conta-logo-white"
            />
          </Link>
          <p className="conta-side-eyebrow">A minha conta</p>
          <button
            type="button"
            className="conta-side-close"
            aria-label="Fechar menu"
            onClick={closeNav}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <nav className="conta-nav" aria-label="Secções da conta">
          {NAV.map((group) => (
            <div className="conta-nav-group" key={group.group}>
              <span className="conta-nav-label">{group.group}</span>
              {group.items.map((item) => {
                const numero = String(flat.indexOf(item) + 1).padStart(2, '0')
                const ativo = isActive(item)
                const externo = item.surface !== surface
                const props = {
                  className: `conta-nav-item${ativo ? ' conta-nav-item--active' : ''}`,
                  'aria-current': ativo ? 'page' : undefined,
                  onClick: closeNav,
                }
                return externo ? (
                  <a key={item.key} href={item.href} {...props}>
                    <span className="conta-nav-num">{numero}</span>
                    <NavIcon name={item.icon} />
                    <span className="conta-nav-text">{item.label}</span>
                  </a>
                ) : (
                  <Link key={item.key} href={item.href} {...props}>
                    <span className="conta-nav-num">{numero}</span>
                    <NavIcon name={item.icon} />
                    <span className="conta-nav-text">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="conta-sidebar-foot">
          <div className="conta-foot-user">
            <span className="conta-foot-avatar" aria-hidden="true">
              {avatar ? <img src={avatar} alt="" /> : (
                inicial
              )}
            </span>
            <span className="conta-foot-meta">
              <span className="conta-foot-name" title={nome}>
                {nome}
              </span>
              <button type="button" className="conta-foot-leave" onClick={sair}>
                Sair
              </button>
            </span>
          </div>

          {/* As duas portas de saída da conta — o mesmo par em todos os
              hosts, para ninguém ficar preso no sítio onde entrou. */}
          <div className="conta-foot-exits">
            <a href={SITE_URL}>Site</a>
            <span aria-hidden="true">·</span>
            <a href={LOCATOR_URL}>Localizador</a>
          </div>
        </div>
      </aside>

      <div className="conta-main" inert={navOpen}>
        <header className="conta-topbar">
          <button
            type="button"
            className="conta-menu-btn"
            aria-label={navOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {navOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>

          <p className="conta-topbar-crumb">
            <span>A minha conta</span>
            <span className="conta-topbar-sep" aria-hidden="true">
              /
            </span>
            <strong>{active?.label || 'Visão geral'}</strong>
          </p>

          <div className="conta-topbar-right">
            <ThemeToggle className="theme-toggle--circ" />
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}
