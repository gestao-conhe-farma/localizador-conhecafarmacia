'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPendingReservationsCount, getAttentionCount } from '@/lib/actions/pharmacy-portal'
import { leaveStaffProfile } from '@/lib/actions/pharmacy-staff'
import { createClient } from '@/lib/supabase/client'
import { getRestockAck } from '@/lib/restock'
import { logWarn } from '@/lib/log'
import { ChevronIcon, CloseIcon, NavIcon } from '@/components/ui/Icon'

const NAV = [
  {
    group: 'Gestão',
    items: [
      { href: '/portal', label: 'Visão geral', icon: 'inicio' },
      {
        href: '/portal/atencao',
        label: 'Atenção',
        icon: 'atencao',
        attention: true,
      },
      {
        // Grupo com submenu (padrão NavLateral do gestão): o cabeçalho
        // navega para /portal/stock; a seta abre a «Entrada de stock».
        href: '/portal/stock',
        label: 'Stock',
        icon: 'stock',
        filhos: [{ href: '/portal/entrada', label: 'Entrada de stock' }],
      },
      {
        href: '/portal/reservas',
        label: 'Reservas',
        icon: 'reservas',
        bell: true,
      },
      { href: '/portal/vendas', label: 'Vendas', icon: 'vendas' },
      // Visível a todos (0018): o gerente vê a equipa, o balcão vê a
      // versão pessoal — o escopo é imposto no servidor.
      { href: '/portal/desempenho', label: 'Desempenho', icon: 'desempenho' },
    ],
  },
  {
    group: 'Farmácia',
    items: [
      { href: '/portal/perfil', label: 'Perfil', icon: 'perfil' },
      { href: '/portal/equipa', label: 'Equipa', icon: 'equipa', gerente: true },
      { href: '/portal/ajuda', label: 'Ajuda', icon: 'ajuda' },
    ],
  },
]

function iniciais(nome) {
  const parts = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'U'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

/**
 * Sidebar verde do portal — mesmo padrão do NavLateral da plataforma
 * de gestão: numeração estrutural (01, 02…) à esquerda de cada item,
 * submenu com seta (chevron) que roda ao abrir, filhos indentados.
 * O grupo abre sozinho quando uma rota filha está activa.
 *
 * Os SVGs de navegação vivem em components/ui/Icon.jsx (NAV_ICONS) —
 * a NAV aqui só referencia a chave.
 *
 * Contagens: realtime de `reservations` + refetch ao navegar;
 * atenção desconta as reposições dispensadas neste browser.
 *
 * `staff` (0018): perfil activo do dispositivo — alimenta o fundo
 * (avatar/nome → MENU DIRECTO com trocar/sair/PIN) e esconde
 * Desempenho/Equipa a quem não é gerente.
 */
export default function PortalSidebar({ pharmacyId, userName, staff, navOpen, onClose }) {
  const pathname = usePathname()
  const [pending, setPending] = useState(0)
  const [pulse, setPulse] = useState(false)
  const [attention, setAttention] = useState(null)
  const [expiry, setExpiry] = useState(0)
  // Menu directo do rodapé (trocar perfil / sair / sessão).
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef(null)

  const refreshCount = useCallback(async () => {
    const res = await getPendingReservationsCount()
    if (res.ok) {
      setPending((prev) => {
        if (res.count > prev) {
          setPulse(true)
          setTimeout(() => setPulse(false), 1200)
        }
        return res.count
      })
    }
  }, [])

  const refreshAttention = useCallback(async () => {
    const res = await getAttentionCount()
    if (!res.ok) return
    const dismissed = (res.restockItems || []).filter(
      (r) => pharmacyId && getRestockAck(pharmacyId, r.drug_id),
    ).length
    setAttention(res.count - dismissed)
    setExpiry(res.expiryCount || 0)
  }, [pharmacyId])

  // Contagens iniciais + em cada navegação (fallback sem realtime)
  useEffect(() => {
    refreshCount()
    refreshAttention()
  }, [pathname, refreshCount, refreshAttention, pharmacyId])

  // Fecha o drawer sempre que a rota muda — e também o menu do fundo
  // (trocar de perfil é uma navegação: o menu não pode seguir o clique).
  useEffect(() => {
    onClose?.()
    setMenuAberto(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Fecha o menu ao clicar fora dele ou premir Escape.
  useEffect(() => {
    if (!menuAberto) return undefined
    const fora = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setMenuAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [menuAberto])

  // Realtime: qualquer movimento em reservas refresca o sino
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('portal-sidebar-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        refreshCount()
        // Uma reserva concluída pode criar um aviso de reposição —
        // a contagem de atenção acompanha o sino.
        refreshAttention()
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('portal-sidebar', 'Realtime de reservas indisponível', { status })
        }
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshCount, refreshAttention])

  // Navegação filtrada: Equipa só existe para gerentes.
  const grupos = NAV.map((g) => ({
    ...g,
    items: g.items.filter((t) => !t.gerente || staff?.role === 'gerente'),
  }))
  // Numeração estrutural (01, 02, …) — a mesma do NavLateral do gestão.
  const flat = grupos.flatMap((g) => g.items)

  return (
    <>
      {/* Véu por baixo do drawer mobile */}
      {navOpen && <div className="portal-scrim" onClick={onClose} aria-hidden="true" />}

      {/* v2 «Premium Calmo»: portal-sidebar-v2 ativa a versão CLARA do
          painel (branco + hairline no tema claro; cartão no escuro) —
          sem ela, continuaria o verde escuro antigo. */}
      <aside
        className={`portal-sidebar portal-sidebar-v2${navOpen ? ' portal-sidebar--open' : ''}`}
      >
        {/* Logo branco do site público + eyebrow, como no gestão. O
            eyebrow passa para a MESMA linha do logo (0018+): o bloco
            encolhe e a navegação sobe. */}
        <div className="portal-side-brand">
          <div className="portal-side-brand-main">
            <Link href="/portal" className="portal-side-logo-link" aria-label="Portal — início">
              {/* v2: sidebar clara → logo VERDE em dia; mantém o branco em
                  escuro (a régua branca das duas versões fica em CSS). */}
              <Image
                src="/logo/logo-principal-verde.png"
                alt="Conheça Farmácia"
                width={150}
                height={51}
                priority
                className="portal-logo-green"
              />
              <Image
                src="/logo/logo-principal-branco.png"
                alt=""
                width={150}
                height={51}
                priority
                aria-hidden="true"
                className="portal-logo-white"
              />
            </Link>
            <p className="portal-side-eyebrow">Portal da farmácia</p>
          </div>
          {/* Só visível no mobile, quando a sidebar é drawer: cobre o botão
              ☰ da top-bar, por isso precisa de fechar próprio. */}
          <button
            type="button"
            className="portal-side-close"
            aria-label="Fechar menu"
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <nav className="portal-nav" aria-label="Secções do portal">
          {grupos.map((group) => (
            <div key={group.group} className="portal-nav-group">
              <span className="portal-nav-label">{group.group}</span>
              {group.items.map((t) => {
                // num global contínuo entre grupos (01, 02, 03…)
                const num = String(flat.indexOf(t) + 1).padStart(2, '0')
                if (t.filhos?.length) {
                  return (
                    <NavGrupo
                      key={t.href}
                      item={t}
                      num={num}
                      pathname={pathname}
                      onClose={onClose}
                    />
                  )
                }
                return (
                  <NavSimples
                    key={t.href}
                    item={t}
                    num={num}
                    pending={pending}
                    pulse={pulse}
                    attention={attention}
                    expiry={expiry}
                    onClose={onClose}
                  />
                )
              })}
            </div>
          ))}
        </nav>

        {/* Perfil activo no fundo — o clique abre um MENU DIRECTO com
            «Trocar perfil», «Sair do perfil» e «Sessão/PIN» (0018+): o
            balcão escolhe sem sair da página que está a ver. */}
        <div className="portal-sidebar-foot portal-foot-wrap" ref={menuRef}>
          <button
            type="button"
            className={`portal-foot-link${menuAberto ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((a) => !a)}
            title="Opções do perfil — trocar ou sair"
          >
            <span className="portal-foot-avatar" aria-hidden="true">
              {iniciais(staff?.name || userName)}
            </span>
            <span className="portal-foot-meta">
              <span className="portal-foot-name">{staff?.name || userName || 'Utilizador'}</span>
              <span className="portal-foot-sub">
                {(staff?.role === 'gerente' ? 'Gerente' : staff ? 'Balcão' : 'Perfil') +
                  ' · trocar ou sair'}
              </span>
            </span>
            <ChevronIcon size={13} dir={menuAberto ? 'down' : 'right'} />
          </button>

          {menuAberto && (
            <div className="portal-foot-menu" role="menu">
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
      </aside>
    </>
  )
}

/** Item simples — link directo com número, ícone, badges. */
function NavSimples({ item, num, pending, pulse, attention, expiry, onClose }) {
  const pathname = usePathname()
  const active =
    pathname === item.href || (item.href !== '/portal' && pathname.startsWith(item.href + '/'))

  return (
    <Link
      href={item.href}
      className={`portal-nav-item${active ? ' portal-nav-item--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClose}
      // Alvo do tour no ITEM (sempre existe); o badge animado é o detalhe
      // que o passo descreve — antes vivia só no badge e, sem reservas
      // pendentes, o alvo não nascia e o tour saltava o passo 1.
      {...(item.bell ? { 'data-tour': 'bell' } : {})}
    >
      <span className="portal-nav-num">{num}</span>
      <NavIcon name={item.icon} />
      <span className="portal-nav-text">{item.label}</span>
      {item.attention && attention > 0 && (
        <span
          className="portal-nav-badge portal-nav-badge--red"
          title={`${attention} assunto(s) para hoje`}
        >
          {attention}
        </span>
      )}
      {item.attention && expiry > 0 && (
        <span
          className="portal-nav-badge portal-nav-badge--orange"
          title={`${expiry} produto(s) com validade a vencer ou expirados`}
        >
          {expiry}
        </span>
      )}
      {item.bell && pending > 0 && (
        <span
          className={`portal-nav-badge portal-nav-badge--amber${pulse ? ' portal-nav-badge--pulse' : ''}`}
          title={`${pending} reserva(s) por atender`}
        >
          {pending}
        </span>
      )}
    </Link>
  )
}

/**
 * Item de grupo com submenu — padrão NavLateral do gestão: o cabeçalho
 * navega para o destino principal (Stock); a seta ao lado abre/fecha
 * os filhos (Entrada de stock). Abre sozinho quando uma rota filha
 * está activa e nunca fecha sozinho ao navegar dentro dele.
 */
function NavGrupo({ item, num, pathname, onClose }) {
  const grupoAtivo = item.filhos.some((f) => pathname.startsWith(f.href))
  const [aberto, setAberto] = useState(grupoAtivo)

  useEffect(() => {
    if (grupoAtivo) setAberto(true)
  }, [grupoAtivo])

  // O tour de onboarding pede para abrir o submenu (passo 3 — o alvo
  // vive aqui dentro e fechado mede 0 de altura).
  useEffect(() => {
    const open = () => setAberto(true)
    window.addEventListener('portal-tour:open-submenu', open)
    return () => window.removeEventListener('portal-tour:open-submenu', open)
  }, [])

  const active = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <div>
      <div className={`portal-nav-item${active || grupoAtivo ? ' portal-nav-item--active' : ''}`}>
        <span className="portal-nav-num">{num}</span>
        <NavIcon name={item.icon} />
        <Link href={item.href} className="portal-nav-text" onClick={onClose}>
          {item.label}
        </Link>
        <button
          type="button"
          className="portal-nav-toggle"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-label={aberto ? `Fechar submenu de ${item.label}` : `Abrir submenu de ${item.label}`}
        >
          <ChevronIcon size={14} dir={aberto ? 'down' : 'right'} />
        </button>
      </div>

      {/* Sempre montado — a animação de altura faz o abrir/fechar via
          max-height (grid-template-rows em CSS grid seria alternativa).
          aria-hidden esconde dos leitores de ecrã quando fechado. */}
      <div
        className={`portal-nav-sub${aberto ? ' portal-nav-sub--open' : ''}`}
        aria-hidden={!aberto}
        data-tour="stock-sub"
      >
        {item.filhos.map((f) => {
          const subAtivo = pathname === f.href || pathname.startsWith(f.href + '/')
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`portal-nav-subitem${subAtivo ? ' portal-nav-subitem--active' : ''}`}
              aria-current={subAtivo ? 'page' : undefined}
              tabIndex={aberto ? 0 : -1}
              onClick={onClose}
            >
              {f.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
