'use client'

import Link from 'next/link'
import { useState } from 'react'
import PortalSidebar from '@/components/portal/PortalSidebar'
import PortalSearch from '@/components/portal/PortalSearch'
import PortalTour from '@/components/portal/PortalTour'
import ThemeToggle from '@/components/ui/ThemeToggle'

/**
 * Shell do portal (padrão da plataforma de gestão): sidebar verde de
 * altura total à esquerda com o logo branco do site no topo e o
 * utilizador no fundo; top-bar dentro da coluna de conteúdo ao lado.
 * Fundo e conteúdo partilham a mesma cor (bg-alt); mobile: drawer.
 *
 * O nome do FARMACÊUTICO vive só na sidebar (rodapé) — a top-bar fica
 * com a identidade da farmácia: o nome é a ENTRADA de /portal/perfil
 * (dados da farmácia), separando de vez as duas fichas: farmácia no
 * perfil, farmacêutico com sessão iniciada em /portal/sessao.
 *
 * O tour de onboarding vive aqui — dentro do shell, por cima de tudo,
 * porque navega entre as páginas reais do portal.
 *
 * `staff` (0018) segue para a sidebar, que mostra o perfil activo.
 */
export default function PortalShell({ pharmacy, userName, userSub, staff, children }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="portal-shell">
      <PortalSidebar
        pharmacyId={pharmacy.id}
        userName={userName}
        staff={staff}
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

          {/* Pesquisa global (v2): pill central do mockup, agora a
              funcionar — páginas, medicamentos e reservas (PortalSearch). */}
          <PortalSearch />

          <div className="portal-topbar-right">
            {/* O nome da farmácia é a ENTRADA de /portal/perfil: aqui
                vivem os dados da farmácia (morada, contacto, horário).
                O nome do farmacêutico com sessão iniciada não aparece
                na top-bar — vive no rodapé da sidebar. */}
            <Link
              href="/portal/perfil"
              className="portal-topbar-name"
              title="Dados da farmácia — perfil público, contacto e horário"
              data-tour="pharmacy-profile"
            >
              <span className="portal-topbar-name-txt">{pharmacy.name}</span>
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
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
            {/* v2 «Premium Calmo»: tema do portal alternável na top-bar
                (mesmo provider do site público; noite/dia num clique). */}
            <ThemeToggle className="theme-toggle--circ" />
          </div>
        </header>

        {children}
      </div>

      <PortalTour userSub={userSub} />
    </div>
  )
}
