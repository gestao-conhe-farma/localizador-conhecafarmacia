'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPendingReservationsCount, getAttentionCount } from '@/lib/actions/pharmacy-portal'
import { getUnreadAnnouncementCount } from '@/lib/actions/pharmacy-announcements'
import { leaveStaffProfile } from '@/lib/actions/pharmacy-staff'
import { createClient } from '@/lib/supabase/client'
import { getRestockAck } from '@/lib/restock'
import { logWarn } from '@/lib/log'
import { ChevronIcon, CloseIcon, LockIcon, NavIcon } from '@/components/ui/Icon'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { plural } from '@/lib/texto'

const NAV = [
  {
    // O dia-a-dia do balcão: o que precisa de resposta e o que se lê
    // primeiro. Os três grupos seguem a organização das plataformas de
    // gestão (contexto → operação → stock → conta), sem perder a
    // numeração e a tinta da casa.
    group: 'Operação',
    items: [
      { href: '/portal', label: 'Visão geral', icon: 'inicio' },
      // Avisos da equipa (0032) — o mesmo destino do sino da topbar. Em
      // ecrã estreito é aqui que a farmácia os encontra com o menu aberto.
      { href: '/portal/avisos', label: 'Avisos', icon: 'avisos', avisos: true },
      {
        href: '/portal/atencao',
        label: 'Atenção',
        icon: 'atencao',
        attention: true,
      },
      {
        href: '/portal/reservas',
        label: 'Reservas',
        icon: 'reservas',
        bell: true,
      },
      { href: '/portal/vendas', label: 'Vendas', icon: 'vendas', feature: 'vendas' },
      // Visível a todos (0018): o gerente vê a equipa, o balcão vê a
      // versão pessoal — o escopo é imposto no servidor.
      {
        href: '/portal/desempenho',
        label: 'Desempenho',
        icon: 'desempenho',
        feature: 'desempenho',
      },
    ],
  },
  {
    // Stock e o seu livro-razão ficam juntos: é o bloco que se abre
    // quando há uma dúvida sobre o saldo («porque é que este número está
    // assim?»). O cabeçalho navega para /portal/stock; a seta abre a
    // «Entrada de stock».
    group: 'Stock',
    items: [
      {
        href: '/portal/stock',
        label: 'Stock',
        icon: 'stock',
        filhos: [{ href: '/portal/entrada', label: 'Entrada de stock' }],
      },
      {
        href: '/portal/movimentos',
        label: 'Movimentos',
        icon: 'movimentos',
        feature: 'movimentos',
      },
    ],
  },
  {
    // O Perfil (dados da FARMÁCIA) saiu daqui para a top-bar — o nome da
    // farmácia é a sua entrada. No lugar dele fica a Sessão: os dados do
    // FARMACÊUTICO com sessão iniciada (PIN, perfil activo, trocar/sair).
    group: 'Farmácia',
    items: [
      { href: '/portal/sessao', label: 'Sessão', icon: 'perfil' },
      { href: '/portal/equipa', label: 'Equipa', icon: 'equipa', gerente: true, feature: 'equipa' },
      // Integração (0023/0024): chaves de API, importação CSV e webhooks.
      // Visível a todos — criar/revogar chaves é que exige perfil gerente
      // (a página diz isso e desactiva o que não for permitido).
      {
        href: '/portal/integracao',
        label: 'Integração',
        icon: 'integracao',
        feature: 'integracao',
      },
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
 * `staff` (0018): perfil activo do dispositivo — é o ÚNICO lugar com o
 * nome do farmacêutico (menu directo com trocar/sair; a página Sessão
 * tem o PIN e os seus dados) e esconde Equipa a quem não é gerente.
 *
 * `plan` (0028): o que a farmácia tem direito a usar. Os itens fora do
 * plano NÃO desaparecem — ficam com um cadeado e um `title` a dizer
 * porque estão fechados, porque esconder uma função que continua lá
 * deixa a farmácia a procurá-la. A autorização a sério é do servidor.
 */
export default function PortalSidebar({
  pharmacyId,
  userName,
  staff,
  plan,
  avisosPorLer = 0,
  navOpen,
  onClose,
}) {
  const pathname = usePathname()
  const [pending, setPending] = useState(0)
  const [pulse, setPulse] = useState(false)
  const [attention, setAttention] = useState(null)
  const [expiry, setExpiry] = useState(0)
  const [avisos, setAvisos] = useState(avisosPorLer)
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

  const refreshAvisos = useCallback(async () => {
    const res = await getUnreadAnnouncementCount()
    if (res?.ok) setAvisos(res.count)
  }, [])

  // Contagens iniciais + em cada navegação (fallback sem realtime). Os
  // avisos também: o layout lê o número no servidor, mas uma navegação
  // entre páginas do portal não volta a renderizar o layout.
  useEffect(() => {
    queueMicrotask(() => {
      refreshCount()
      refreshAttention()
      refreshAvisos()
    })
  }, [pathname, refreshCount, refreshAttention, refreshAvisos, pharmacyId])

  // Abrir /portal/avisos marca os avisos como lidos no painel; o painel
  // avisa por evento para o item do menu perder o número sem esperar por
  // uma navegação (o sino da topbar atualiza com o router.refresh()).
  useEffect(() => {
    const lidos = () => refreshAvisos()
    window.addEventListener('portal-avisos:lidos', lidos)
    return () => window.removeEventListener('portal-avisos:lidos', lidos)
  }, [refreshAvisos])

  // Fecha o drawer sempre que a rota muda — e também o menu do fundo
  // (trocar de perfil é uma navegação: o menu não pode seguir o clique).
  useEffect(() => {
    queueMicrotask(() => {
      onClose?.()
      setMenuAberto(false)
    })
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

  // Item fora do plano: com a aplicação dos planos ligada e sem a função,
  // fica com cadeado (o link mantém-se — a página é que explica).
  const bloqueado = (feature) =>
    Boolean(plan?.enforced && feature && plan.features?.[feature] !== true)
  // Numeração estrutural (01, 02, …) — a mesma do NavLateral do gestão.
  const flat = grupos.flatMap((g) => g.items)

  // O eyebrow ao lado do logo já diz «Localizador» (o plano de entrada tem
  // o nome da marca). O chip do plano só acrescenta informação quando o
  // nome é outro ou há um estado para comunicar — repetir «Localizador»
  // duas vezes na mesma linha era ruído, não hierarquia.
  const planoDuplicaMarca = plan?.nome === 'Localizador'
  const mostrarPlano = Boolean(plan?.nome) && (!planoDuplicaMarca || Boolean(plan?.estadoLabel))

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
            <p className="portal-side-eyebrow">Localizador</p>
            {mostrarPlano && (
              <p
                className="portal-side-plan"
                title={
                  plan.enforced
                    ? `Plano ${plan.nome} — os itens com cadeado precisam de um plano superior.`
                    : `Plano ${plan.nome}.`
                }
              >
                {planoDuplicaMarca ? plan.estadoLabel : plan.nome}
                {!planoDuplicaMarca && plan.estadoLabel ? <span> · {plan.estadoLabel}</span> : null}
              </p>
            )}
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
                    avisos={avisos}
                    locked={bloqueado(t.feature)}
                    onClose={onClose}
                  />
                )
              })}
            </div>
          ))}
        </nav>

        {/* Perfil activo no fundo — o clique abre um MENU DIRECTO com as
            DUAS opções do turno: «Trocar perfil» e «Sair do perfil»
            (0018+). O PIN e os dados do farmacêutico vivem na página
            Sessão, na navegação. */}
        <div className="portal-sidebar-foot portal-foot-wrap" ref={menuRef}>
          <button
            type="button"
            className={`portal-foot-link${menuAberto ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((a) => !a)}
            title="Opções do perfil — trocar ou sair"
            data-tour="staff-menu"
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

          {/* Tema no mobile: a top-bar não o mostra em ecrã estreito, por isso
              fica ao lado do perfil, no rodapé do drawer. Só aparece no mobile
              (CSS .portal-side-theme). */}
          <ThemeToggle className="theme-toggle--circ portal-side-theme" />

          {menuAberto && (
            <div className="portal-foot-menu" role="menu">
              <span className="portal-foot-menu-h">Perfil activo</span>
              <Link href="/portal/perfis" className="portal-foot-menu-i" role="menuitem">
                Trocar perfil
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
function NavSimples({ item, num, pending, pulse, attention, expiry, avisos, locked, onClose }) {
  const pathname = usePathname()
  const active =
    pathname === item.href || (item.href !== '/portal' && pathname.startsWith(item.href + '/'))

  return (
    <Link
      href={item.href}
      className={`portal-nav-item${active ? ' portal-nav-item--active' : ''}${locked ? ' portal-nav-item--locked' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={
        locked ? `${item.label} faz parte de um plano superior — abra para saber como` : undefined
      }
      onClick={onClose}
      // Alvo do tour no ITEM (sempre existe); o badge animado é o detalhe
      // que o passo descreve — antes vivia só no badge e, sem reservas
      // pendentes, o alvo não nascia e o tour saltava o passo 1.
      {...(item.bell ? { 'data-tour': 'bell' } : {})}
    >
      <span className="portal-nav-num">{num}</span>
      <NavIcon name={item.icon} />
      <span className="portal-nav-text">{item.label}</span>
      {locked && (
        <span className="portal-nav-lock" aria-hidden="true">
          <LockIcon size={12} />
        </span>
      )}
      {item.attention && attention > 0 && (
        <span
          className="portal-nav-badge portal-nav-badge--red"
          title={`${plural(attention, 'assunto', 'assuntos')} para hoje`}
        >
          {attention}
        </span>
      )}
      {item.attention && expiry > 0 && (
        <span
          className="portal-nav-badge portal-nav-badge--orange"
          title={`${plural(expiry, 'produto', 'produtos')} com validade a vencer ou expirados`}
        >
          {expiry}
        </span>
      )}
      {item.avisos && avisos > 0 && (
        <span
          className="portal-nav-badge portal-nav-badge--info"
          title={`${plural(avisos, 'aviso da equipa por ler', 'avisos da equipa por ler')}`}
        >
          {avisos > 9 ? '9+' : avisos}
        </span>
      )}
      {item.bell && pending > 0 && (
        <span
          className={`portal-nav-badge portal-nav-badge--amber${pulse ? ' portal-nav-badge--pulse' : ''}`}
          title={`${plural(pending, 'reserva por atender', 'reservas por atender')}`}
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
    if (grupoAtivo) queueMicrotask(() => setAberto(true))
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
        {/* A linha inteira é o link (antes só o texto de 4 letras era
            clicável — quem carregava no ícone ou no número não ia a lado
            nenhum). A seta continua a ser um botão só para o submenu. */}
        <Link
          href={item.href}
          className="portal-nav-main"
          onClick={onClose}
          aria-current={active ? 'page' : undefined}
        >
          <span className="portal-nav-num">{num}</span>
          <NavIcon name={item.icon} />
          <span className="portal-nav-text">{item.label}</span>
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
