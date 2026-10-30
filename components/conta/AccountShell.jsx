'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ACCOUNT_URL, LOCATOR_URL, SITE_URL } from '@/lib/account-urls'
import { CloseIcon, NavIcon } from '@/components/ui/Icon'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { accountT } from '@/lib/account-i18n'

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
/**
 * A lista depende do idioma (`/pt/perfil` no site), por isso é uma função e
 * não uma constante de módulo: no topo do módulo `lang` não existe, e a
 * avaliação do ficheiro rebentava com `ReferenceError` antes do primeiro
 * render.
 */
function navGroups(lang) {
  return [
  {
    groupKey: 'conta',
    items: [
      {
        key: 'geral',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil`,
        path: '/perfil',
        exact: true,
        labelKey: 'nav.items.overview',
        icon: 'inicio',
      },
      {
        key: 'preferencias',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/preferencias`,
        path: '/perfil/preferencias',
        labelKey: 'nav.items.preferences',
        icon: 'preferencias',
      },
      {
        key: 'privacidade',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/privacidade`,
        path: '/perfil/privacidade',
        labelKey: 'nav.items.privacy',
        icon: 'privacidade',
      },
      {
        key: 'seguranca',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/seguranca`,
        path: '/perfil/seguranca',
        labelKey: 'nav.items.security',
        icon: 'seguranca',
      },
    ],
  },
  {
    // O que acontece com a conta fora das definições: inscrições em eventos
    // e o registo do que já fez. Fica separado da «Conta» porque é conteúdo,
    // não configuração.
    groupKey: 'participacao',
    items: [
      {
        key: 'eventos',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/eventos`,
        path: '/perfil/eventos',
        labelKey: 'nav.items.events',
        icon: 'reservas',
      },
      {
        key: 'atividade',
        surface: 'conta',
        href: `${ACCOUNT_URL}/perfil/atividade`,
        path: '/perfil/atividade',
        labelKey: 'nav.items.activity',
        icon: 'atividade',
      },
    ],
  },
  {
    // O que a pessoa fez no Localizador. Vive noutro host, por isso o grupo
    // existe também para o cérebro saber onde está antes de saltar.
    groupKey: 'localizador',
    items: [
      {
        key: 'guardados',
        surface: 'localizador',
        href: `${LOCATOR_URL}/guardados`,
        path: '/guardados',
        labelKey: 'nav.items.saved',
        icon: 'guardados',
      },
      {
        key: 'reservas',
        surface: 'localizador',
        href: `${LOCATOR_URL}/reservas`,
        path: '/reservas',
        labelKey: 'nav.items.reservations',
        icon: 'reservas',
      },
    ],
  },
  {
    groupKey: 'estudo',
    items: [
      {
        key: 'estudante',
        surface: 'site',
        href: `${SITE_URL}/${lang}/perfil`,
        path: '/perfil',
        exact: true,
        labelKey: 'nav.items.student',
        icon: 'estudante',
      },
      {
        key: 'definicoes',
        surface: 'site',
        href: `${SITE_URL}/${lang}/perfil/definicoes`,
        path: '/perfil/definicoes',
        labelKey: 'nav.items.settings',
        icon: 'definicoes',
      },
    ],
  },
  ]
}

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
  const t = accountT(lang)
  const NAV = navGroups(lang)
  const [navOpen, setNavOpen] = useState(false)
  // Imagem morta no rodapé: mostra as iniciais, nunca um círculo vazio.
  const [avatarQuebrado, setAvatarQuebrado] = useState(false)

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

  const nome = user.name || user.email || t('nav.kicker')
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
            aria-label={t('nav.home')}
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
          <p className="conta-side-eyebrow">{t('nav.kicker')}</p>
          <button
            type="button"
            className="conta-side-close"
            aria-label={t('nav.close')}
            onClick={closeNav}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <nav className="conta-nav" aria-label={t('nav.aria')}>
          {NAV.map((group) => (
            <div className="conta-nav-group" key={group.groupKey}>
              <span className="conta-nav-label">{t(`nav.groups.${group.groupKey}`)}</span>
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
                    <span className="conta-nav-text">{t(item.labelKey)}</span>
                  </a>
                ) : (
                  <Link key={item.key} href={item.href} {...props}>
                    <span className="conta-nav-num">{numero}</span>
                    <NavIcon name={item.icon} />
                    <span className="conta-nav-text">{t(item.labelKey)}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="conta-sidebar-foot">
          <div className="conta-foot-user">
            <span className="conta-foot-avatar" aria-hidden="true">
              {avatar && !avatarQuebrado ? (
                <img src={avatar} alt="" onError={() => setAvatarQuebrado(true)} />
              ) : (
                inicial
              )}
            </span>
            <span className="conta-foot-meta">
              <span className="conta-foot-name" title={nome}>
                {nome}
              </span>
              <button type="button" className="conta-foot-leave" onClick={sair}>
                {t('nav.logout')}
              </button>
            </span>
          </div>

          {/* As duas portas de saída da conta — o mesmo par em todos os
              hosts, para ninguém ficar preso no sítio onde entrou. */}
          <div className="conta-foot-exits">
            <a href={SITE_URL}>{t('nav.site')}</a>
            <span aria-hidden="true">·</span>
            <a href={LOCATOR_URL}>{t('nav.locator')}</a>
          </div>
        </div>
      </aside>

      <div className="conta-main" inert={navOpen}>
        <header className="conta-topbar">
          <button
            type="button"
            className="conta-menu-btn"
            aria-label={navOpen ? t('nav.close') : t('nav.open')}
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
            <span>{t('nav.kicker')}</span>
            <span className="conta-topbar-sep" aria-hidden="true">
              /
            </span>
            <strong>{active ? t(active.labelKey) : t('nav.items.overview')}</strong>
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
