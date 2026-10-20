'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Onboarding do portal — na primeira entrada do utilizador, um tour de
 * 3 passos destacado sobre as páginas REAIS: o spotlight recorta o
 * elemento-alvo (data-attribute) e a carta explica o que fazer ali.
 *
 * Passos (5):
 *   1. /portal            → sino de reservas na sidebar (data-tour="bell")
 *   2. /portal            → perfil activo no RODAPÉ da sidebar (data-tour="staff-menu")
 *   3. /portal/atencao    → chips de filtro (data-tour="chips")
 *   4. /portal/stock      → submenu «Entrada de stock» (data-tour="stock-sub")
 *   5. /portal/stock      → botão «+ Nova entrada» (data-tour="nova-entrada")
 *
 * Alvos SEMPRE presentes no DOM (item de nav, pill, botão): antes o
 * passo 1 mirava só o badge do sino, que só existe com reservas
 * pendentes — sem ele o tour ficava 3s no escuro e saltava passos.
 *
 * Mobile/tablet (≤ 60rem): a sidebar é um drawer fechado e os alvos do
 * menu medem fora do ecrã. Os passos `inNav` pedem à shell para abrir o
 * drawer (evento `portal-tour:open-nav`) e a SHELL TRANCA-O enquanto esse
 * passo vive — a navegação do passo fecha o drawer por baixo e o destaque
 * ficava pendurado no vazio. A medição só aceita alvos VISÍVEIS no ecrã —
 * sem isto, o destaque caía no vazio e o tour não fazia sentido em
 * telemóvel. Em ecrã estreito a carta cola-se ao topo ou ao rodapé, no
 * lado oposto ao alvo.
 *
 * Estado: localStorage por utilizador (`portal-onboard:<sub>`) — quem
 * já fez não vê de novo; sessão nova do mesmo user também não. O ESC
 * interrompe; «Ver depois» reabre no próximo login (opção da última
 * carta deixa limpar o flag e rever).
 *
 * Implementação sem libs: um rect por scroll/resize via getBoundingClientRect,
 * caixa de spotlight em box-shadow gigante (rgba 0 0 0 / .65), posição da
 * carta por colisão (abaixo → acima → lateral).
 */

const STORAGE_KEY = (sub) => `portal-onboard:${sub || 'anon'}`

const STEPS = [
  {
    href: '/portal',
    target: '[data-tour="bell"]',
    title: 'Novas reservas chegam aqui',
    body: 'Este sino, no item Reservas do menu, mostra as reservas por atender em tempo real — quando há novas, acende em âmbar e pulsa. As reservas esperam resposta até 72 horas. Em telemóveis e tablets o menu é o drawer do botão ☰ (o tour abre-o por si).',
    placement: 'right',
    inNav: true,
  },
  {
    href: '/portal',
    target: '[data-tour="staff-menu"]',
    title: 'Quem está ao balcão',
    body: (
      <>
        No fundo do menu está o perfil activo — tudo o que registar fica em nome dele. Tocar no
        nome abre o menu com <b>Trocar perfil</b> (escolha + PIN) e <b>Sair do perfil</b>. O PIN e
        os seus dados vivem na página Sessão, na navegação.
      </>
    ),
    placement: 'top',
    inNav: true,
  },
  {
    href: '/portal/atencao',
    target: '[data-tour="chips"]',
    title: 'O que precisa de si hoje',
    body: 'Reposições (produto vendido até esgotar), validades a vencer e stock desactualizado. Use os filtros para ir directo a um tipo — o filtro fica guardado no endereço da página.',
    placement: 'bottom',
  },
  {
    // Alvo no SUBMENU do menu (não na página de entrada): o passo
    // ensina onde a Entrada de stock vive — dentro de Stock. O efeito
    // abre o submenu (openSubmenu) antes de medir o alvo.
    href: '/portal/stock',
    target: '[data-tour="stock-sub"]',
    title: 'A entrada de stock vive aqui',
    body: (
      <>
        Dentro do menu Stock fica a Entrada de stock — toque na seta para abrir. Chegou
        mercadoria? Escolha o medicamento, escreva quantas unidades chegaram e toque <b>Somar</b>:
        o produto volta a aparecer no Localizador.
      </>
    ),
    placement: 'right',
    openSubmenu: true,
    inNav: true,
  },
  {
    href: '/portal/stock',
    target: '[data-tour="nova-entrada"]',
    title: 'Registo rápido, em painel lateral',
    body: (
      <>
        O botão <b>+ Nova entrada</b> abre um painel lateral: pesquisa o medicamento, escreve a
        quantidade, escolhe a unidade e <b>Somar</b> — sem sair do Stock. Para detalhes (preços,
        estrutura da caixa), use a página completa no submenu.
      </>
    ),
    placement: 'bottom',
  },
]

/** Geometria do alvo, medida no DOM real (rAF após navegação + imagens). */
function measure(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }
}

/** Em ecrã estreito (≤ 60rem) a sidebar é um drawer fechado. */
function isDrawerLayout() {
  return window.matchMedia('(max-width: 60rem)').matches
}

/**
 * O alvo está realmente visível no ecrã: inteiro na horizontal e pelo
 * menos parcialmente na vertical. Dentro do drawer fechado — ou a meio
 * da animação de abertura — não conta: antes bastava «atravessar» a
 * margem esquerda e o tour congelava o destaque fora do ecrã.
 */
function isOnScreen(el) {
  const r = el.getBoundingClientRect()
  return (
    r.height > 0 &&
    r.left >= -0.5 &&
    r.right <= window.innerWidth + 0.5 &&
    r.top < window.innerHeight &&
    r.bottom > 0
  )
}

/** Altura de reserva enquanto a carta ainda não foi medida. */
const CARD_H = 260

/**
 * A carta cabe abaixo do alvo? Se não, tenta acima; senão, ao lado.
 * `cardH` é a altura REAL da carta do passo (medida no DOM): com uma
 * estimativa fixa, a carta de texto longo caía por cima do próprio alvo
 * em tablet/desktop.
 */
function pickPosition(rect, placement, cardH) {
  const below = rect.vh - (rect.top + rect.height)
  const above = rect.top
  if (placement !== 'top' && below > Math.min(cardH, rect.vh * 0.5)) return 'bottom'
  if (placement !== 'bottom' && above > cardH) return 'top'
  return rect.left > rect.vw / 2 ? 'left' : 'right'
}

export default function PortalTour({ userSub }) {
  const router = useRouter()
  const [stepIdx, setStepIdx] = useState(-1) // -1 = inactivo
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)
  // Altura REAL da carta (o texto é diferente em cada passo): o mesmo
  // componente decide a colocação com ela — nunca tapa o alvo.
  const cardRef = useRef(null)
  const [cardH, setCardH] = useState(0)

  const step = stepIdx >= 0 ? STEPS[stepIdx] : null

  const finish = useCallback(() => {
    setStepIdx(-1)
    setReady(false)
    // O drawer que o tour abriu para os passos do menu volta a fechar.
    window.dispatchEvent(new CustomEvent('portal-tour:close-nav'))
    try {
      localStorage.setItem(STORAGE_KEY(userSub), 'done')
    } catch {
      /* modo privado: o tour simplesmente volta no próximo login */
    }
  }, [userSub])

  const postpone = useCallback(() => {
    setStepIdx(-1)
    setReady(false)
    window.dispatchEvent(new CustomEvent('portal-tour:close-nav'))
    // Sem gravar: reabre na próxima sessão (ver depois).
  }, [])

  // «Rever tour» na página de Ajuda: limpa o flag do utilizador e
  // recomeça do passo 0. Por evento window — a Ajuda não precisa de
  // receber userSub nem o setter do tour através do shell.
  useEffect(() => {
    const restart = () => {
      try {
        localStorage.removeItem(STORAGE_KEY(userSub))
      } catch {
        /* sem storage: o tour simplesmente reabre */
      }
      setStepIdx(0)
    }
    window.addEventListener('portal-tour:restart', restart)
    return () => window.removeEventListener('portal-tour:restart', restart)
  }, [userSub])

  // Dispara uma vez: já fez o tour? Se não, começa no passo 0.
  useEffect(() => {
    if (!userSub) return
    let done = false
    try {
      done = localStorage.getItem(STORAGE_KEY(userSub)) === 'done'
    } catch {
      /* sem storage: mostra o tour (deixa escolher) */
    }
    if (!done) {
      const t = setTimeout(() => setStepIdx(0), 600) // deixa o shell assentar
      return () => clearTimeout(t)
    }
  }, [userSub])

  const remeasure = useCallback(() => {
    if (stepIdx < 0) return
    const el = document.querySelector(STEPS[stepIdx].target)
    if (!el) return
    setRect(measure(el))
    setReady(true)
  }, [stepIdx])

  // Navega para a página do passo e mede o alvo quando existir.
  useEffect(() => {
    if (stepIdx < 0) return
    queueMicrotask(() => setReady(false))
    const s = STEPS[stepIdx]
    if (!window.location.pathname.startsWith(s.href)) {
      router.push(s.href)
    }
    // Passos com openSubmenu: pede à sidebar para abrir o submenu do
    // Stock (o alvo vive lá dentro — fechado, tem max-height: 0 e o
    // rect mediria zero). A sidebar ouve este evento window.
    if (s.openSubmenu) {
      window.dispatchEvent(new CustomEvent('portal-tour:open-submenu'))
    }
    // Passos com alvo NO MENU: em ecrã estreito o menu é um drawer
    // fechado — abre-o (a shell ouve o evento) para o destaque fazer
    // sentido. Nos restantes passos garante que o drawer fecha.
    if (s.inNav && isDrawerLayout()) {
      window.dispatchEvent(new CustomEvent('portal-tour:open-nav'))
    } else {
      window.dispatchEvent(new CustomEvent('portal-tour:close-nav'))
    }
    // Tenta medir várias vezes: a navegação é client-side e o alvo
    // só existe depois de a página do portal carregar (em mobile com rede
    // lenta, os painéis mostram spinner até o feed chegar). Se 8 segundos
    // não chegarem, SALTA o passo automaticamente — o tour nunca fica
    // preso à espera de um elemento que não vai nascer.
    const skip = setTimeout(() => {
      // Último passo: termina (grava como feito); senão avança.
      if (stepIdx === STEPS.length - 1) {
        finish()
      } else {
        setStepIdx((i) => i + 1)
      }
    }, 8000)
    // Medição: o alvo nasce depois da navegação client-side e mexe-se
    // enquanto o drawer ou o submenu abre (animação). O ciclo segue-o frame
    // a frame e PÁRA quando o rect assenta — sem temporizadores de
    // vigilância a correr depois do passo: quem mantém o menu aberto através
    // da navegação é a shell, não um intervalo. `cancelled` corta o ciclo
    // mesmo que reste um frame marcado.
    let cancelled = false
    let tries = 0
    let raf = 0
    let last = null
    const attempt = () => {
      if (cancelled) return
      const el = document.querySelector(s.target)
      // Alvo ainda fechado: re-pede o que o passo precisa. O submenu do
      // Stock mede zero fechado e reabre com um evento da sidebar; os
      // alvos do menu só aparecem no ecrã com o drawer aberto — de quem o
      // abre (e mantém aberto através da navegação) trata a shell.
      if (s.openSubmenu && !(el && el.getBoundingClientRect().height > 0)) {
        window.dispatchEvent(new CustomEvent('portal-tour:open-submenu'))
      }
      // Só aceita o alvo quando existe, tem área visível E está dentro
      // do ecrã: dentro do drawer fechado até mede altura, mas vive fora
      // do ecrã (translateX) — sem esta checagem o destaque caía no vazio.
      if (el && isOnScreen(el)) {
        const now = measure(el)
        setRect(now)
        setReady(true)
        clearTimeout(skip)
        // Assentou (o mesmo rect em dois frames seguidos)? Pára: o destaque
        // está no alvo e o ciclo não fica a correr sem motivo.
        const settled =
          last &&
          last.top === now.top &&
          last.left === now.left &&
          last.width === now.width &&
          last.height === now.height
        last = now
        if (settled) return
      }
      // ~16,7 ms por frame → 480 tentativas ≈ os mesmos 8 s do skip:
      // a janela de procura e a de skip correm juntas.
      if (tries < 480) {
        tries += 1
        raf = requestAnimationFrame(attempt)
      }
    }
    raf = requestAnimationFrame(attempt)
    const onKey = (e) => {
      if (e.key === 'Escape') postpone()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      cancelled = true
      clearTimeout(skip)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [stepIdx, router, remeasure, postpone, finish])

  // Mede a carta depois de cada render (só actualiza quando muda de
  // tamanho, por isso não há ciclo). Antes do return para respeitar a
  // ordem dos hooks. Sem deps de propósito: [cardH] falharia medições
  // cuja mudança ainda não está no estado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight || 0
    if (h && h !== cardH) setCardH(h)
  })

  // Inactivo ou ainda a medir o alvo: não renderiza nada (o rect pode
  // nem existir ainda — daí o return completo, sem if aninhado).
  if (stepIdx < 0 || !step || !rect || !ready) return null

  const pad = 8
  const box = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  const cardW = Math.min(320, rect.vw - 32)
  const reserve = cardH || CARD_H
  let cardStyle
  if (rect.vw < 640) {
    // Ecrã estreito (telemóvel): a carta cola-se ao lado oposto ao alvo,
    // centrada — a colisão lateral não cabe num ecrã de 390 px.
    const alvoEmBaixo = rect.top + rect.height / 2 > rect.vh / 2
    cardStyle = {
      width: rect.vw - 32,
      left: 16,
      ...(alvoEmBaixo ? { top: 16 } : { bottom: 16 }),
    }
  } else {
    const pos = pickPosition(rect, step.placement, reserve)
    if (pos === 'bottom') {
      cardStyle = {
        width: cardW,
        top: box.top + box.height + 12,
        left: Math.max(16, Math.min(box.left, rect.vw - cardW - 16)),
      }
    } else if (pos === 'top') {
      cardStyle = {
        width: cardW,
        top: Math.max(16, box.top - 12 - reserve),
        left: Math.max(16, Math.min(box.left, rect.vw - cardW - 16)),
      }
    } else {
      const left = pos === 'right' ? box.left + box.width + 12 : box.left - cardW - 12
      cardStyle = {
        width: cardW,
        top: Math.max(16, Math.min(box.top, rect.vh - reserve - 16)),
        left: Math.max(16, Math.min(left, rect.vw - cardW - 16)),
      }
    }
  }

  const isLast = stepIdx === STEPS.length - 1

  return (
    <div className="portal-tour" role="dialog" aria-modal="true" aria-label="Tour de boas-vindas">
      {/* Spotlight: 4 sombras recortam o alvo; clique fora interrompe. */}
      <div className="portal-tour-spot" style={box} onClick={postpone} aria-hidden="true" />

      {/* Carta do passo. */}
      <div className="portal-tour-card" ref={cardRef} style={cardStyle} role="document">
        <p className="portal-tour-step">
          Passo {stepIdx + 1} de {STEPS.length}
        </p>
        <h2 className="portal-tour-title">{step.title}</h2>
        <p className="portal-tour-body">{step.body}</p>
        <div className="portal-tour-actions">
          <button
            type="button"
            className="portal-tour-btn portal-tour-btn--ghost"
            onClick={postpone}
          >
            Ver depois
          </button>
          <div className="portal-tour-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`portal-tour-dot${i === stepIdx ? ' is-on' : ''}`} />
            ))}
          </div>
          <button
            type="button"
            className="portal-tour-btn portal-tour-btn--main"
            onClick={() => (isLast ? finish() : setStepIdx(stepIdx + 1))}
          >
            {isLast ? 'Concluir tour' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}
