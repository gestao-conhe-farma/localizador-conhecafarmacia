'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
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
 *
 * `plan` (0028) — plano da farmácia, lido no layout: mostra o chip do
 * plano e marca com cadeado o que não está incluído.
 */
export default function PortalShell({ pharmacy, userName, userSub, staff, plan, children }) {
  const [navOpen, setNavOpen] = useState(false)

  // Com o drawer aberto o toque na página NÃO navega: os pedidos de fecho
  // chegam todos por aqui (véu, ☰, X e a mudança de rota da sidebar).
  // Enquanto um passo do tour vive DENTRO do menu o drawer fica trancado:
  // a navegação do passo fecharia o drawer por baixo e o destaque ficava
  // pendurado no vazio. Trancar aqui (e não no tour) dispensa intervalos
  // de vigilância a reabrir o menu — que sobravam a correr depois do fim.
  const navLocked = useRef(false)
  const closeNav = useCallback(() => {
    if (navLocked.current) return
    setNavOpen(false)
  }, [])

  // Em ecrã largo a sidebar é fixa: não há drawer para abrir nem véu para
  // tapar. Se o estado ficar «aberto» a passar de telemóvel/tablet para
  // desktop (rodar o tablet, alargar a janela), o conteúdo ficava inerte
  // — sem cliques e sem nada visível para desbloquear.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 60rem)')
    const sync = () => {
      if (!mq.matches) setNavOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // O tour de onboarding pede para abrir/fechar o drawer quando um passo
  // tem o alvo dentro do menu (em ecrã estreito o menu é um drawer fechado
  // e os passos do tour não fariam sentido).
  useEffect(() => {
    const open = () => {
      navLocked.current = true
      setNavOpen(true)
    }
    const close = () => {
      navLocked.current = false
      setNavOpen(false)
    }
    window.addEventListener('portal-tour:open-nav', open)
    window.addEventListener('portal-tour:close-nav', close)
    return () => {
      window.removeEventListener('portal-tour:open-nav', open)
      window.removeEventListener('portal-tour:close-nav', close)
    }
  }, [])

  return (
    <div className="portal-shell">
      <PortalSidebar
        pharmacyId={pharmacy.id}
        userName={userName}
        staff={staff}
        plan={plan}
        navOpen={navOpen}
        onClose={closeNav}
      />

      {/* Com o drawer aberto o conteúdo fica inerte: sem cliques, sem foco
          por Tab (o véu por cima já bloqueia o rato). */}
      <div className="portal-main" inert={navOpen}>
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
            {/* Tema do portal na top-bar (desktop). No mobile fica na sidebar
                (ver PortalSidebar): a classe esconde este em ecrã estreito. */}
            <ThemeToggle className="theme-toggle--circ portal-topbar-theme" />
          </div>
        </header>

        {children}
      </div>

      <PortalTour userSub={userSub} />
    </div>
  )
}
