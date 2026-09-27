'use client'

import { useState } from 'react'
import PortalSidebar from '@/components/portal/PortalSidebar'
import PortalTour from '@/components/portal/PortalTour'

/**
 * Shell do portal (padrão da plataforma de gestão): sidebar verde de
 * altura total à esquerda com o logo branco do site no topo e o
 * utilizador no fundo; top-bar dentro da coluna de conteúdo ao lado,
 * com o nome da farmácia (onde antes estava o utilizador).
 * Fundo e conteúdo partilham a mesma cor (bg-alt); mobile: drawer.
 *
 * O tour de onboarding vive aqui — dentro do shell, por cima de tudo,
 * porque navega entre as páginas reais do portal.
 */
export default function PortalShell({ pharmacy, userName, userSub, children }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="portal-shell">
      <PortalSidebar
        pharmacyId={pharmacy.id}
        userName={userName}
        navOpen={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="portal-main">
        <header className="portal-topbar">
          <button
            type="button"
            className="portal-menu-btn"
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

          {/* Redirecionamento para o site principal — lado esquerdo da top-bar. */}
          <a
            className="portal-ext"
            href="https://conhecafarmacia.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            conhecafarmacia.com
            {/* Única seta do portal: sinaliza saída para o site principal. */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>

          <div className="portal-topbar-right">
            {/* O nome da farmácia ocupa o lugar do utilizador na top-bar. */}
            <span className="portal-topbar-name">{pharmacy.name}</span>
          </div>
        </header>

        {children}
      </div>

      <PortalTour userSub={userSub} />
    </div>
  )
}
