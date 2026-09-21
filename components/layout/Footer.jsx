'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Footer({
  contactPhone = '+244 925 696 002',
  contactEmail = 'geral@conhecafarmacia.com',
  mainSite = 'https://conhecafarmacia.com',
}) {
  return (
    <footer className="footer">
      <div className="container-center">
        <div className="footer-grid">
          {/* Brand */}
          <div className="footer-logo">
            <Image
              src="/logo/logo-principal-branco.png"
              alt="Conheça Farmácia"
              width={120}
              height={40}
            />
            <p className="text-white/70 text-sm mt-4 max-w-xs">
              Localizador de Medicamentos — aproximar as pessoas do medicamento certo, com
              informação em que se pode confiar.
            </p>
          </div>

          {/* Navegação */}
          <div className="footer-links">
            <h4>Navegação</h4>
            <ul>
              <li><a href="/pesquisa" className="text-white/70 hover:text-brand-accent transition-colors text-sm">Pesquisar medicamentos</a></li>
              <li><a href="/#o-problema" className="text-white/70 hover:text-brand-accent transition-colors text-sm">O problema</a></li>
              <li><a href="/#como-funciona" className="text-white/70 hover:text-brand-accent transition-colors text-sm">Como funciona</a></li>
              <li><a href="/#farmacias" className="text-white/70 hover:text-brand-accent transition-colors text-sm">Farmácias</a></li>
              <li><a href="/#faq" className="text-white/70 hover:text-brand-accent transition-colors text-sm">FAQ</a></li>
            </ul>
          </div>

          {/* Contacto */}
          <div className="footer-links">
            <h4>Contacto</h4>
            <ul>
              <li>Luanda, Angola</li>
              <li>
                <a href={`mailto:${contactEmail}`} className="text-white/70 hover:text-brand-accent transition-colors text-sm">
                  {contactEmail}
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/244925696002?text=Olá,%20Conheça%20Farmácia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70 hover:text-brand-accent transition-colors text-sm"
                >
                  {contactPhone} (chamadas e WhatsApp)
                </a>
              </li>
            </ul>
          </div>

          {/* Redes sociais */}
          <div className="footer-links">
            <h4>Redes sociais</h4>
            <ul>
              <li>
                <a href="https://www.facebook.com/conhecafarmacia" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-brand-accent transition-colors text-sm">
                  Facebook
                </a>
              </li>
              <li>
                <a href="https://www.instagram.com/conhecafarmacia" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-brand-accent transition-colors text-sm">
                  Instagram
                </a>
              </li>
              <li>
                <a href="https://www.tiktok.com/conhecafarmaciaofficial" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-brand-accent transition-colors text-sm">
                  TikTok
                </a>
              </li>
              <li>
                <a href="https://www.linkedin.com/company/conhecafarmacia" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-brand-accent transition-colors text-sm">
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} Conheça Farmácia ·{' '}
            <a href={mainSite} target="_blank" rel="noopener noreferrer" className="hover:text-brand-accent">
              conhecafarmacia.com
            </a>{' '}
            · Um serviço de educação em saúde. Não vendemos medicamentos.
          </p>
        </div>
      </div>
    </footer>
  )
}
