'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { logoutPlatform } from '@/lib/actions/platform-auth'
import ThemeToggle from '@/components/ui/ThemeToggle'

/**
 * Shell da área interna — distinto do shell do portal de propósito.
 *
 * O portal da farmácia e a área da equipa nunca se confundem: aqui a faixa
 * lateral é verde escura sobre fundo claro, a numeração estrutural (01, 02…)
 * mantém-se, e o nível da pessoa está SEMPRE à vista (no topo e no rodapé).
 * Quem entra nas duas portas no mesmo dia precisa de saber onde está.
 *
 * O rodapé diz o estado do segundo factor, porque é ele que decide se as
 * acções sensíveis (desactivar uma farmácia, mexer em planos, exportar a
 * trilha) passam ou pedem o código do autenticador. Não é decoração: é a
 * explicação antecipada de uma recusa que o servidor ia dar.
 *
 * A navegação vem pronta do layout (filtrada pela matriz no servidor) —
 * este componente não conhece permissões, só desenha o que recebe.
 */
export default function InternoShell({
  nome,
  email,
  rotulo,
  legado,
  mfa2,
  temFactor,
  nav,
  pendentes = [],
  children,
}) {
  const pathname = usePathname()

  const ativo = (href) =>
    pathname === href || (href !== '/interno' && pathname.startsWith(href + '/'))

  let numero = 0

  return (
    <div className="interno-shell">
      <aside className="interno-side">
        <div className="interno-side-brand">
          <Link href="/interno" aria-label="Área interna — painel">
            <Image
              src="/logo/logo-principal-branco.png"
              alt="Conheça Farmácia"
              width={132}
              height={45}
              priority
            />
          </Link>
          <p className="interno-side-eyebrow">Equipa Conheça Farmácia</p>
          <p className="interno-side-role" title="O nível decide o que cada pessoa pode fazer">
            {rotulo}
            {legado ? ' · papel legado' : ''}
          </p>
        </div>

        <nav className="interno-nav" aria-label="Secções da área interna">
          {nav.map((grupo) => (
            <div key={grupo.grupo} className="interno-nav-group">
              <span className="interno-nav-label">{grupo.grupo}</span>
              {grupo.itens.map((item) => {
                numero += 1
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`interno-nav-item${ativo(item.href) ? ' interno-nav-item--active' : ''}`}
                    aria-current={ativo(item.href) ? 'page' : undefined}
                  >
                    <span className="interno-nav-num">{String(numero).padStart(2, '0')}</span>
                    <span className="interno-nav-text">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}

          {pendentes.length > 0 && (
            <div className="interno-nav-group">
              <span className="interno-nav-label">Brevemente</span>
              <p className="interno-foot-sub">{pendentes.join(' · ')}</p>
            </div>
          )}
        </nav>

        <div className="interno-side-foot">
          <span className="interno-foot-name">{nome || 'Conta de equipa'}</span>
          <span className="interno-foot-sub">{email}</span>
          <span className="interno-foot-sub">
            {mfa2
              ? 'Segundo factor verificado nesta sessão'
              : temFactor
                ? 'Sessão só com senha — as acções sensíveis pedem o código do autenticador'
                : 'Sem autenticador inscrito'}
          </span>
          <form action={logoutPlatform}>
            <button
              type="submit"
              className="interno-btn interno-btn--ghost interno-btn--onDark interno-btn--small"
            >
              Terminar sessão
            </button>
          </form>
        </div>
      </aside>

      <div className="interno-main">
        <header className="interno-top">
          <span className="interno-side-eyebrow">Área interna</span>
          <div className="interno-top-right">
            {!mfa2 && (
              <span
                className="interno-pill interno-pill--warn"
                title="Desactivar farmácias, mexer em planos, gerir níveis e exportar a trilha exigem o código do autenticador"
              >
                Só senha
              </span>
            )}
            <span className="interno-top-user">{rotulo}</span>
            <ThemeToggle className="theme-toggle--circ" />
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}
