'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Fragment } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronRight, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react'
import { logoutPlatform } from '@/lib/actions/platform-auth'
import { ICONES, iniciais } from '@/components/interno/navegacao'
import InternoDrawer from '@/components/interno/InternoDrawer'

/**
 * Shell da área interna — a mesma moldura da plataforma de gestão:
 * sidebar escura de 16rem no desktop, topbar fina por cima do conteúdo,
 * topbar escura de 16 no mobile com o logo ao centro e drawer pela direita.
 *
 * O que se mantém DESTA área: a navegação vem pronta do servidor (filtrada
 * pela matriz) e o estado do segundo factor é um link para `/interno/mfa`
 * — um aviso que anuncia uma recusa tem de levar a quem a resolve.
 *
 * O nível (`rotulo`) vive no rodapé da sidebar, ao lado do nome, como na
 * plataforma de gestão: quem entra nas duas portas no mesmo dia precisa de
 * saber onde está sem procurar.
 */
export default function InternoShell({
  nome,
  email,
  rotulo,
  legado,
  mfa2,
  temFactor,
  nav = [],
  pendentes = [],
  children,
}) {
  const pathname = usePathname()

  const ativo = (href) =>
    pathname === href || (href !== '/interno' && pathname.startsWith(href + '/'))

  // Contexto da topbar (padrão Vercel): a secção actual lê-se ao lado do
  // nome da área, em vez de uma faixa vazia quando o MFA já está feito.
  // `/interno/mfa` não é uma secção da NAV — é a conta.
  const secaoAtual =
    pathname === '/interno/mfa'
      ? 'Segundo factor'
      : nav.find((item) => ativo(item.href))?.label || 'Painel'

  const estadoMfa = mfa2
    ? 'Segundo factor verificado'
    : temFactor
      ? 'Sessão só com senha'
      : 'Sem autenticador — inscrever'

  const tituloMfa = mfa2
    ? 'As acções sensíveis desta sessão estão autorizadas.'
    : temFactor
      ? 'As acções sensíveis pedem o código do autenticador nesta sessão. Saia e volte a entrar para o confirmar.'
      : 'As acções sensíveis exigem um autenticador TOTP. Inscreva-o aqui.'

  return (
    <div className="interno-shell">
      {/* Sidebar estrutural — desktop */}
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
          <p className="interno-side-eyebrow">Área interna</p>
        </div>

        <nav className="interno-nav" aria-label="Secções da área interna">
          {nav.map((item, i) => {
            const Icone = ICONES[item.icone] || ICONES.painel
            const novoGrupo = item.grupo && item.grupo !== nav[i - 1]?.grupo
            return (
              <Fragment key={item.href}>
                {novoGrupo && (
                  <span className="interno-nav-section" aria-hidden="true">
                    {item.grupo}
                  </span>
                )}
                <Link
                  href={item.href}
                  className={`interno-nav-item${ativo(item.href) ? ' interno-nav-item--active' : ''}`}
                  aria-current={ativo(item.href) ? 'page' : undefined}
                >
                  <span className="interno-nav-num">{item.num}</span>
                  <Icone size={16} aria-hidden="true" />
                  <span className="interno-nav-text">{item.label}</span>
                </Link>
              </Fragment>
            )
          })}

          {pendentes.length > 0 && (
            <div className="interno-nav-group">
              <span className="interno-nav-label">Brevemente</span>
              <p className="interno-foot-sub">{pendentes.join(' · ')}</p>
            </div>
          )}
        </nav>

        <div className="interno-side-foot">
          <Link
            href="/interno/mfa"
            className={`interno-mfa-status${mfa2 ? ' interno-mfa-status--ok' : ''}`}
            title={tituloMfa}
          >
            {mfa2 ? (
              <ShieldCheck size={16} className="interno-mfa-ic" aria-hidden="true" />
            ) : (
              <ShieldAlert size={16} className="interno-mfa-ic" aria-hidden="true" />
            )}
            <span className="interno-mfa-status-text">{estadoMfa}</span>
            <ChevronRight size={15} className="interno-mfa-go" aria-hidden="true" />
          </Link>

          <div className="interno-side-user">
            <span className="interno-avatar">{iniciais(nome, email)}</span>
            <span className="interno-user-text" title={email || undefined}>
              <span className="interno-user-name">{nome || 'Conta de equipa'}</span>
              <span className="interno-user-role">
                {rotulo}
                {legado ? ' · papel legado' : ''}
              </span>
            </span>
            <form action={logoutPlatform}>
              <button type="submit" aria-label="Terminar sessão" className="interno-side-logout">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="interno-main">
        {/* Topbar mobile — escura, com o drawer à esquerda e o logo ao centro */}
        <header className="interno-mobile-top">
          <InternoDrawer
            itens={nav}
            pendentes={pendentes}
            nome={nome}
            email={email}
            rotulo={rotulo}
            legado={legado}
            mfa2={mfa2}
            temFactor={temFactor}
          />
          <Link href="/interno" className="interno-mobile-logo" aria-label="Área interna — painel">
            <Image
              src="/logo/logo-principal-branco.png"
              alt="Conheça Farmácia"
              width={132}
              height={45}
              priority
            />
          </Link>
          <div className="interno-mobile-acts">
            <Link
              href="/interno/mfa"
              aria-label={`Segundo factor: ${estadoMfa}`}
              title={tituloMfa}
              className={`interno-mobile-mfa${mfa2 ? ' interno-mobile-mfa--ok' : ''}`}
            >
              {mfa2 ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
            </Link>
          </div>
        </header>

        {/* Topbar desktop — contexto da secção + estado do segundo factor.
            O tema vive no rodapé do drawer (como no mobile). A topbar
            mantém-se mesmo com o aal2 confirmado: o contexto é útil e o
            estado verde fecha o circuito de confiança. */}
        <header className="interno-top">
          <div className="interno-top-context">
            <span className="interno-top-crumb">Interno</span>
            <ChevronRight size={13} className="interno-top-sep" aria-hidden="true" />
            <span className="interno-top-current">{secaoAtual}</span>
          </div>
          <div className="interno-top-right">
            <Link
              href="/interno/mfa"
              className={`interno-pill ${mfa2 ? 'interno-pill--ok' : 'interno-pill--warn'} interno-pill--link`}
              title={tituloMfa}
            >
              <i aria-hidden="true" />
              {mfa2 ? 'MFA verificado' : temFactor ? 'Só senha' : 'Sem MFA'}
            </Link>
          </div>
        </header>

        <main className="interno-main-content">{children}</main>
      </div>
    </div>
  )
}
