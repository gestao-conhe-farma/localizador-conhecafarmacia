'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import PortalSidebar from '@/components/portal/PortalSidebar'
import PortalSearch from '@/components/portal/PortalSearch'
import PortalTour from '@/components/portal/PortalTour'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { leaveStaffProfile } from '@/lib/actions/pharmacy-staff'

/**
 * Shell do portal (padrão da plataforma de gestão): sidebar verde de
 * altura total à esquerda com o logo branco do site no topo e o
 * utilizador no fundo; top-bar dentro da coluna de conteúdo ao lado,
 * com o nome da farmácia (onde antes estava o utilizador).
 * Fundo e conteúdo partilham a mesma cor (bg-alt); mobile: drawer.
 *
 * O tour de onboarding vive aqui — dentro do shell, por cima de tudo,
 * porque navega entre as páginas reais do portal.
 *
 * `staff` (0018): o perfil activo aparece na top-bar (avatar + nome +
 * papel) em TODAS as páginas — o clique leva à sessão (trocar/sair).
 */
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

export default function PortalShell({ pharmacy, userName, userSub, staff, children }) {
  const [navOpen, setNavOpen] = useState(false)
  // Menu directo do perfil na top-bar — /sessão só se chega daqui (ou
  // pelo menu do rodapé da sidebar), nunca por navegação directa.
  const [staffMenu, setStaffMenu] = useState(false)
  const staffMenuRef = useRef(null)
  const pathname = usePathname()

  // Fecha ao clicar fora, premir Esc ou navegar de rota (mesmo
  // contrato do menu do rodapé da sidebar).
  useEffect(() => {
    if (!staffMenu) return undefined
    const fora = (e) => {
      if (staffMenuRef.current && !staffMenuRef.current.contains(e.target)) setStaffMenu(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setStaffMenu(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [staffMenu])

  useEffect(() => {
    setStaffMenu(false)
  }, [pathname])

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
            {/* Perfil activo do balcão — visível em todas as páginas.
                O clique abre o MENU DIRECTO (trocar / sessão / sair):
                /sessão deixa de ser destino directo da pill. */}
            {staff && (
              <div className="portal-topbar-staff-wrap" ref={staffMenuRef}>
                <button
                  type="button"
                  className="portal-topbar-staff"
                  aria-haspopup="menu"
                  aria-expanded={staffMenu}
                  title="Opções do perfil — trocar ou sair"
                  data-tour="staff-menu"
                  onClick={() => setStaffMenu((a) => !a)}
                >
                  <span className="portal-topbar-staff-av" aria-hidden="true">
                    {iniciais(staff.name)}
                  </span>
                  <span className="portal-topbar-staff-meta">
                    <b>{staff.name}</b>
                    <span>{staff.role === 'gerente' ? 'Gerente' : 'Balcão'}</span>
                  </span>
                </button>

                {staffMenu && (
                  <div className="portal-foot-menu portal-foot-menu--top" role="menu">
                    <span className="portal-foot-menu-h">Sessão do perfil</span>
                    <Link href="/portal/perfis" className="portal-foot-menu-i" role="menuitem">
                      Trocar perfil
                    </Link>
                    <Link href="/portal/sessao" className="portal-foot-menu-i" role="menuitem">
                      Sessão e PIN
                    </Link>
                    <form action={leaveStaffProfile} className="portal-foot-menu-form">
                      <button type="submit" className="portal-foot-menu-i" role="menuitem">
                        Sair do perfil
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
            {/* O nome da farmácia ocupa o lugar do utilizador na top-bar. */}
            <span className="portal-topbar-name">{pharmacy.name}</span>
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
