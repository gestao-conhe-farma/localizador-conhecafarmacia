'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ui/ThemeToggle'
import MobileDrawer from '@/components/layout/MobileDrawer'

const NAV = [
  { href: '/pesquisa', label: 'Pesquisar' },
  { href: '/farmacia', label: 'Farmácias' },
  { href: '/sobre', label: 'Sobre' },
]

export default function AppHeader() {
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()

  // Fecha o menu mobile em cada navegação
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  const isActive = (href) =>
    pathname === href || pathname.startsWith(href + '/')

  // O drawer TEM de viver FORA do <header>: o efeito push aplica um transform
  // ao header, e um ancestral com transform faz os filhos position:fixed
  // ancorarem a ele — o drawer sairia voando junto com o header. Como irmão,
  // fica ancorado à viewport (como no site principal).
  return (
    <>
      <header className="app-header">
      <div className="app-header-inner">
        <Link href="/pesquisa" className="app-header-logo" aria-label="Localizador — início">
          <Image src="/logo/3.png" alt="Conheça Farmácia" width={104} height={35} priority />
          <span className="app-header-product">Localizador</span>
        </Link>

        <nav className="app-header-nav" aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`app-header-link${isActive(item.href) ? ' app-header-link--active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-header-right">
          <a
            href="https://conhecafarmacia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="app-header-external"
          >
            conhecafarmacia.com
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
          <ThemeToggle />
          <button
            className="hamburger"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={navOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
      </header>

      <MobileDrawer open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  )
}
