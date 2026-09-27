'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { getPendingReservationsCount, getAttentionCount } from '@/lib/actions/pharmacy-portal'
import { createClient } from '@/lib/supabase/client'
import { getRestockAck } from '@/lib/restock'
import { logWarn } from '@/lib/log'
import PortalLogout from '@/components/portal/PortalLogout'
import { ChevronIcon } from '@/components/ui/Icon'

const NAV = [
  {
    group: 'Gestão',
    items: [
      {
        href: '/portal',
        label: 'Visão geral',
        icon: (
          <>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </>
        ),
      },
      {
        href: '/portal/atencao',
        label: 'Atenção',
        icon: (
          <>
            <path d="M12 3 2.5 20h19L12 3z" />
            <path d="M12 10v4" />
            <path d="M12 17.5h.01" />
          </>
        ),
        attention: true,
      },
      {
        // Grupo com submenu (padrão NavLateral do gestão): o cabeçalho
        // navega para /portal/stock; a seta abre a «Entrada de stock».
        href: '/portal/stock',
        label: 'Stock',
        icon: (
          <>
            <path d="M4 8h16v12H4z" />
            <path d="M9 8V5h6v3" />
            <path d="M4 13h16" />
          </>
        ),
        filhos: [{ href: '/portal/entrada', label: 'Entrada de stock' }],
      },
      {
        href: '/portal/reservas',
        label: 'Reservas',
        icon: (
          <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 3v4M16 3v4" />
          </>
        ),
        bell: true,
      },
      {
        href: '/portal/vendas',
        label: 'Vendas',
        icon: (
          <>
            <path d="M4 20V10" />
            <path d="M10 20V4" />
            <path d="M16 20v-8" />
            <path d="M22 20H2" />
          </>
        ),
      },
    ],
  },
  {
    group: 'Farmácia',
    items: [
      {
        href: '/portal/perfil',
        label: 'Perfil da farmácia',
        icon: (
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </>
        ),
      },
      {
        href: '/portal/ajuda',
        label: 'Ajuda',
        icon: (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.35-1 .95-1 1.7" />
            <path d="M12 16.5h.01" />
          </>
        ),
      },
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
 * Contagens: realtime de `reservations` + refetch ao navegar;
 * atenção desconta as reposições dispensadas neste browser.
 */
export default function PortalSidebar({ pharmacyId, userName, navOpen, onClose }) {
  const pathname = usePathname()
  const [pending, setPending] = useState(0)
  const [pulse, setPulse] = useState(false)
  const [attention, setAttention] = useState(null)
  const [expiry, setExpiry] = useState(0)

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

  // Fecha o drawer sempre que a rota muda
  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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

  // Numeração estrutural (01, 02, …) — a mesma do NavLateral do gestão.
  const flat = NAV.flatMap((g) => g.items)

  return (
    <>
      {/* Véu por baixo do drawer mobile */}
      {navOpen && <div className="portal-scrim" onClick={onClose} aria-hidden="true" />}

      <aside className={`portal-sidebar${navOpen ? ' portal-sidebar--open' : ''}`}>
        {/* Logo branco do site público + eyebrow, como no gestão. */}
        <div className="portal-side-brand">
          <div className="portal-side-brand-main">
            <Link href="/portal" className="portal-side-logo-link" aria-label="Portal — início">
              <Image
                src="/logo/logo-principal-branco.png"
                alt="Conheça Farmácia"
                width={150}
                height={51}
                priority
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="portal-nav" aria-label="Secções do portal">
          {NAV.map((group) => (
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

        {/* Utilizador + sair no fundo da sidebar, como no gestão. */}
        <div className="portal-sidebar-foot">
          <span className="portal-foot-avatar" aria-hidden="true">
            {iniciais(userName)}
          </span>
          <span className="portal-foot-meta">{userName || 'Utilizador'}</span>
          <PortalLogout />
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
    >
      <span className="portal-nav-num">{num}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {item.icon}
      </svg>
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

  const active = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <div>
      <div className={`portal-nav-item${active || grupoAtivo ? ' portal-nav-item--active' : ''}`}>
        <span className="portal-nav-num">{num}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {item.icon}
        </svg>
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

      {aberto && (
        <div className="portal-nav-sub">
          {item.filhos.map((f) => {
            const subAtivo = pathname === f.href || pathname.startsWith(f.href + '/')
            return (
              <Link
                key={f.href}
                href={f.href}
                className={`portal-nav-subitem${subAtivo ? ' portal-nav-subitem--active' : ''}`}
                aria-current={subAtivo ? 'page' : undefined}
                onClick={onClose}
              >
                {f.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
