'use client'

import Link from 'next/link'
import Image from 'next/image'

/**
 * Rodapé das páginas do Localizador (/pesquisa, /farmacia, /sobre).
 * Distinto do Footer da homepage — mais compacto, estilo Modelo F:
 * uma linha com logo + links + redes, e linha legal por baixo.
 */
export default function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer">
      <div className="app-footer-in">
        {/* Linha 1: logo + links */}
        <div className="app-footer-top">
          <Link href="/pesquisa" className="app-footer-logo">
            <Image src="/logo/3.png" alt="Conheça Farmácia" width={88} height={30} priority />
            <span className="app-footer-product">Localizador</span>
          </Link>

          <nav className="app-footer-nav" aria-label="Navegação do rodapé">
            <Link href="/pesquisa">Pesquisar</Link>
            <Link href="/farmacia">Farmácias</Link>
            <Link href="/sobre">Sobre</Link>
            <a href="/#farmacias">É farmácia?</a>
            <a
              href="https://wa.me/244925696002?text=Olá,%20Conheça%20Farmácia"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </nav>
        </div>

        {/* Linha 2: legal — site principal e disclaimer em duas linhas */}
        <div className="app-footer-bottom">
          <p className="app-footer-legal">
            © {year} Conheça Farmácia ·{' '}
            <a href="https://conhecafarmacia.com" target="_blank" rel="noopener noreferrer">
              conhecafarmacia.com
            </a>
          </p>
          <p className="app-footer-legal">
            Um serviço de educação em saúde. Não vendemos medicamentos.
          </p>
        </div>
      </div>
    </footer>
  )
}
