'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import ThemeToggle from '@/components/ui/ThemeToggle'

const MAIN_SITE = 'https://conhecafarmacia.com'
const WHATSAPP_URL = `https://wa.me/244925696002?text=${encodeURIComponent(
  'Olá! Tenho interesse no Localizador de Medicamentos.'
)}`

export default function Header() {
  const [navOpen, setNavOpen] = useState(false)

  const closeNav = () => setNavOpen(false)

  return (
    <header>
      {/* Utility bar — barra superior escura, como no principal */}
      <div className="utility-bar">
        <div className="utility-bar-container">
          <a className="utility-brand" href="/">
            <span className="utility-dot" />
            Lançamento 2026 · Luanda
          </a>
          <div className="utility-links">
            <a href="#farmacias">Farmácias</a>
            <a href="#como-funciona">Como funciona</a>
            <a href={MAIN_SITE} target="_blank" rel="noopener noreferrer">
              conhecafarmacia.com
              <svg
                className="inline-block ml-1 -mt-0.5"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Header principal */}
      <div className="header">
        <nav className="nav-container">
          <Link href="/" className="logo">
            <Image src="/logo/3.png" alt="Conheça Farmácia" width={120} height={40} priority />
          </Link>

          <div className="nav-links">
            <a href="#o-problema">O problema</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#farmacias">Farmácias</a>
            <a href="#faq">FAQ</a>
            <a href={MAIN_SITE} target="_blank" rel="noopener noreferrer">
              conhecafarmacia.com
            </a>
          </div>

          <div className="header-right">
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
        </nav>

        {/* Menu mobile simples */}
        {navOpen && (
          <div className="md:hidden border-t border-brand-divider/40 bg-brand-bg px-6 pb-4 pt-2">
            <a href="#o-problema" onClick={closeNav} className="block py-2.5 text-brand-deep font-medium">
              O problema
            </a>
            <a href="#como-funciona" onClick={closeNav} className="block py-2.5 text-brand-deep font-medium">
              Como funciona
            </a>
            <a href="#farmacias" onClick={closeNav} className="block py-2.5 text-brand-deep font-medium">
              Farmácias
            </a>
            <a href="#faq" onClick={closeNav} className="block py-2.5 text-brand-deep font-medium">
              FAQ
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-2.5 text-brand-accent font-semibold"
            >
              Falar no WhatsApp →
            </a>
          </div>
        )}
      </div>
    </header>
  )
}
