'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ui/ThemeToggle'

const LINKS = [
  { href: '/pesquisa', label: 'Pesquisar', path: 'pesquisa' },
  { href: '/farmacia', label: 'Farmácias', path: 'farmacia' },
  { href: '/sobre', label: 'Sobre', path: 'sobre' },
]

export default function MobileDrawer({ open, onClose }) {
  const pathname = usePathname()

  // Fecha com a tecla Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // body.drawer-open: efeito push + bloqueio de scroll (via CSS, como no principal)
  useEffect(() => {
    if (open) {
      document.body.classList.add('drawer-open')
    } else {
      document.body.classList.remove('drawer-open')
    }
    return () => document.body.classList.remove('drawer-open')
  }, [open])

  const isActive = (path) => {
    const seg = pathname.split('/')[1] || ''
    return seg === path ? 'drawer-link-active' : ''
  }

  return (
    <>
      <div className={`drawer-overlay${open ? ' active' : ''}`} onClick={onClose} />
      <nav
        className={`mobile-drawer${open ? ' open' : ''}`}
        aria-label="Menu"
        inert={!open}
      >
        <button className="drawer-close" onClick={onClose} aria-label="Fechar menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="drawer-logo">
          <Image
            src="/logo/logo-principal-branco.png"
            alt="Conheça Farmácia"
            width={120}
            height={40}
          />
        </div>

        <ul className="drawer-links">
          {LINKS.map((l) => (
            <li key={l.path}>
              <Link href={l.href} className={isActive(l.path)} onClick={onClose}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href="https://conhecafarmacia.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              conhecafarmacia.com &rarr;
            </a>
          </li>
        </ul>

        <div className="drawer-footer">
          <div className="drawer-footer-row">
            <span className="drawer-brand-mini">Conheça Farmácia</span>
            <ThemeToggle className="drawer-theme-toggle" />
          </div>
        </div>
      </nav>
    </>
  )
}
