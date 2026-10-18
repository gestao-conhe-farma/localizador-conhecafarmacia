'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, LogOut, Menu, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { logoutPlatform } from '@/lib/actions/platform-auth'
import { ICONES, iniciais } from '@/components/interno/navegacao'
import BotaoTema from '@/components/interno/BotaoTema'

/**
 * DRAWER da área interna — a navegação em mobile/tablet.
 *
 * Espelha o drawer do portal: painel escuro que entra pela ESQUERDA
 * (o hamburger vive na esquerda da topbar, por isso é de lá que o painel
 * sai) com mola, overlay, fecha ao navegar, com Esc e no overlay, com o
 * foco preso dentro do painel enquanto está aberto. O corpo não faz scroll
 * por baixo, e o foco volta ao hamburger quando fecha.
 *
 * O hamburger vive AQUI (e não na topbar) para o ciclo de foco ser local:
 * quem abre é quem devolve o foco.
 */
export default function InternoDrawer({
  itens = [],
  pendentes = [],
  nome,
  email,
  rotulo,
  legado,
  mfa2,
  temFactor,
}) {
  // O estado guarda a ROTA em que o drawer abriu, não um booleano: quando
  // `pathname` muda, `aberto` passa a falso sozinho e o drawer fecha ao
  // navegar sem um efeito a chamar setState (um drawer que fica aberto
  // depois de navegar esconde a página que a pessoa acabou de pedir).
  const [abertoEm, setAbertoEm] = useState(null)
  const pathname = usePathname()
  // `abertoEm !== null` é obrigatório: enquanto o `usePathname()` ainda não
  // resolveu (null no primeiro render), `null === null` abria o drawer
  // sozinho no arranque.
  const aberto = abertoEm !== null && abertoEm === pathname
  const abrir = () => setAbertoEm(pathname)
  const fechar = () => setAbertoEm(null)
  const painelRef = useRef(null)
  const botaoRef = useRef(null)

  // Scroll lock + Esc + focus trap + devolver o foco ao fechar
  useEffect(() => {
    if (!aberto) return

    // O ref é copiado para uma variável local: o cleanup corre no fim do
    // efeito e nessa altura `.current` já pode apontar para outro nó.
    const botao = botaoRef.current
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setAbertoEm(null)
        return
      }
      if (e.key === 'Tab' && painelRef.current) {
        const focaveis = painelRef.current.querySelectorAll('a[href], button:not([disabled])')
        if (!focaveis.length) return
        const primeiro = focaveis[0]
        const ultimo = focaveis[focaveis.length - 1]
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primeiro.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    painelRef.current?.focus()

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      botao?.focus()
    }
  }, [aberto])

  const ligacaoMfa = mfa2
    ? 'Segundo factor verificado'
    : temFactor
      ? 'Sessão só com senha'
      : 'Sem autenticador inscrito'

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={abrir}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        aria-controls="interno-menu-mobile"
        className="interno-menu-btn"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {aberto && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={fechar}
              className="interno-drawer-overlay"
              aria-hidden="true"
            />

            <motion.aside
              key="drawer"
              ref={painelRef}
              tabIndex={-1}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="interno-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              id="interno-menu-mobile"
            >
              <div className="interno-drawer-head">
                <Link href="/interno" aria-label="Área interna — painel">
                  <Image
                    src="/logo/logo-principal-branco.png"
                    alt="Conheça Farmácia"
                    width={132}
                    height={45}
                  />
                </Link>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar menu"
                  className="interno-drawer-close"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="interno-drawer-eyebrow">Área interna</p>

              <nav className="interno-drawer-nav" aria-label="Navegação mobile">
                {itens.map((item, i) => {
                  const Icone = ICONES[item.icone] || ICONES.painel
                  const ativo =
                    pathname === item.href ||
                    (item.href !== '/interno' && pathname.startsWith(item.href + '/'))
                  const novoGrupo = item.grupo && item.grupo !== itens[i - 1]?.grupo
                  return (
                    <Fragment key={item.href}>
                      {novoGrupo && (
                        <span className="interno-nav-section" aria-hidden="true">
                          {item.grupo}
                        </span>
                      )}
                      <Link
                        href={item.href}
                        onClick={fechar}
                        aria-current={ativo ? 'page' : undefined}
                        className={`interno-nav-item${ativo ? ' interno-nav-item--active' : ''}`}
                      >
                        <span className="interno-nav-num">{item.num}</span>
                        <Icone size={17} aria-hidden="true" />
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

              <div className="interno-drawer-foot">
                <Link
                  href="/interno/mfa"
                  onClick={fechar}
                  className={`interno-mfa-status${mfa2 ? ' interno-mfa-status--ok' : ''}`}
                >
                  {mfa2 ? (
                    <ShieldCheck size={16} className="interno-mfa-ic" aria-hidden="true" />
                  ) : (
                    <ShieldAlert size={16} className="interno-mfa-ic" aria-hidden="true" />
                  )}
                  <span className="interno-mfa-status-text">{ligacaoMfa}</span>
                  <ChevronRight size={15} className="interno-mfa-go" aria-hidden="true" />
                </Link>

                <BotaoTema />

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
                    <button
                      type="submit"
                      aria-label="Terminar sessão"
                      className="interno-side-logout"
                    >
                      <LogOut size={17} />
                    </button>
                  </form>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
