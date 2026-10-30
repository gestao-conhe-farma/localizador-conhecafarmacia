'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ui/ThemeToggle'
import MobileDrawer from '@/components/layout/MobileDrawer'
import AccountEntry from '@/components/conta/AccountEntry'
import GlassNavPill from '@/components/layout/GlassNavPill'

const NAV = [
  // O logótipo levava ao início, mas não havia opção explícita: quem chega a
  // /pesquisa não tinha como voltar à home pelo cabeçalho.
  { href: '/', label: 'Início' },
  { href: '/pesquisa', label: 'Pesquisar' },
  { href: '/farmacia', label: 'Farmácias' },
  { href: '/sobre', label: 'Sobre' },
]

export default function AppHeader() {
  const [navOpen, setNavOpen] = useState(false)
  const pathname = usePathname()

  // A pílula de vidro mede a aba ativa em relação ao contentor das pills.
  const pillsetRef = useRef(null)
  const activeLinkRef = useRef(null)
  // Este header é montado página a página, por isso a pílula é recriada a cada
  // navegação e só saberia da aba nova depois do carregamento. O ref permite
  // movê-la no instante do clique (ver GlassNavPill).
  const pillRef = useRef(null)

  // Fecha o menu mobile em cada navegação — ajuste durante o render
  // (padrão «You Might Not Need An Effect»): setState síncrono no
  // efeito seria cascata de renders.
  const [prevPath, setPrevPath] = useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    if (navOpen) setNavOpen(false)
  }

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  // Em fichas (medicamento, produto, termos…) nenhuma aba está ativa: sem
  // âncora a pílula tem de ficar escondida, não herdar a posição da página
  // anterior.
  const comAbaAtiva = NAV.some((item) => isActive(item.href))

  // O drawer TEM de viver FORA do <header>: o efeito push aplica um transform
  // ao header, e um ancestral com transform faz os filhos position:fixed
  // ancorarem a ele — o drawer sairia voando junto com o header. Como irmão,
  // fica ancorado à viewport (como no site principal).
  // O blur vai em estilo inline: o Lightning CSS do Turbopack estava a
  // descartar o "backdrop-filter" padrão (emitia só o -webkit-, que Chrome/
  // Firefox ignoram). Estilos inline bypassam o processador — funciona sempre.
  const glass = 'blur(14px) saturate(1.5)'

  return (
    <>
      <header
        className="app-header"
        style={{
          backdropFilter: glass,
          WebkitBackdropFilter: glass,
        }}
      >
        <div className="app-header-inner">
          <Link href="/" className="app-header-logo" aria-label="Localizador — início">
            <Image src="/logo/3.png" alt="Conheça Farmácia" width={104} height={35} priority />
            <span className="app-header-product">Localizador</span>
          </Link>

          <nav className="app-header-nav" aria-label="Navegação principal">
            <div className="pillset" ref={pillsetRef}>
              <GlassNavPill
                ref={pillRef}
                containerRef={pillsetRef}
                anchorRef={activeLinkRef}
                signature={pathname}
                comAbaAtiva={comAbaAtiva}
              />
              {NAV.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    ref={active ? activeLinkRef : null}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`app-header-link${active ? ' app-header-link--active' : ''}`}
                    onClick={(e) => pillRef.current?.saltarPara(e.currentTarget)}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </nav>

          <div className="app-header-right">
            <AccountEntry />
            <a
              href="https://conhecafarmacia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="app-header-external"
            >
              conhecafarmacia.com
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
            {/* No telemóvel o toggle sai do header (vai para a gaveta): com
                sessão iniciada, o avatar e o toggle apertavam a barra. */}
            <span className="app-header-theme">
              <ThemeToggle />
            </span>
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
