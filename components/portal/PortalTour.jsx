'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Onboarding do portal — na primeira entrada do utilizador, um tour de
 * 3 passos destacado sobre as páginas REAIS: o spotlight recorta o
 * elemento-alvo (data-attribute) e a carta explica o que fazer ali.
 *
 * Passos:
 *   1. /portal            → sino de reservas na sidebar (data-tour="bell")
 *   2. /portal/atencao    → chips de filtro (data-tour="chips")
 *   3. /portal/entrada    → campo «Chegaram» (data-tour="restock-input")
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
    body: 'Este sino mostra as reservas por atender, em tempo real. Quando tocar, fica amarelo e pulsa. As reservas esperam resposta até 72 horas — o «Reservas» ao lado é onde responde.',
    placement: 'right',
  },
  {
    href: '/portal/atencao',
    target: '[data-tour="chips"]',
    title: 'O que precisa de si hoje',
    body: 'Reposições (produto vendido até esgotar), validades a vencer e stock desactualizado. Use os filtros para ir directo a um tipo — o filtro fica guardado no endereço da página.',
    placement: 'bottom',
  },
  {
    // Alvo no SUBMENU da sidebar (não na página de entrada): o passo
    // ensina onde a Entrada de stock vive — dentro de Stock. O efeito
    // abre o submenu (openSubmenu) antes de medir o alvo.
    href: '/portal/stock',
    target: '[data-tour="stock-sub"]',
    title: 'A entrada de stock vive aqui',
    body: 'Dentro do menu Stock fica a Entrada de stock — toque na seta para abrir. Chegou mercadoria? Escolha o medicamento, escreva quantas unidades chegaram e toque «Somar»: o produto volta a aparecer no Localizador.',
    placement: 'right',
    openSubmenu: true,
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

/** A carta cabe abaixo do alvo? Se não, tenta acima; senão, ao lado. */
function pickPosition(rect, placement) {
  const CARD_H = 260
  const GAP = 14
  const below = rect.vh - (rect.top + rect.height)
  const above = rect.top
  if (placement !== 'top' && below > Math.min(CARD_H, rect.vh * 0.5)) return 'bottom'
  if (placement !== 'bottom' && above > CARD_H) return 'top'
  return rect.left > rect.vw / 2 ? 'left' : 'right'
}

export default function PortalTour({ userSub }) {
  const router = useRouter()
  const [stepIdx, setStepIdx] = useState(-1) // -1 = inactivo
  const [rect, setRect] = useState(null)
  const [ready, setReady] = useState(false)

  const step = stepIdx >= 0 ? STEPS[stepIdx] : null

  const finish = useCallback(() => {
    setStepIdx(-1)
    setReady(false)
    try {
      localStorage.setItem(STORAGE_KEY(userSub), 'done')
    } catch {
      /* modo privado: o tour simplesmente volta no próximo login */
    }
  }, [userSub])

  const postpone = useCallback(() => {
    setStepIdx(-1)
    setReady(false)
    // Sem gravar: reabre na próxima sessão (ver depois).
  }, [])

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
    setReady(false)
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
    // Tenta medir várias vezes: a navegação é client-side e o alvo
    // só existe depois de a página do portal carregar. Se 3 segundos
    // não chegarem (ex.: o sino não existe porque não há reservas
    // pendentes), SALTA o passo automaticamente — o tour nunca fica
    // preso à espera de um elemento que não vai nascer.
    const skip = setTimeout(() => {
      // Último passo: termina (grava como feito); senão avança.
      if (stepIdx === STEPS.length - 1) {
        finish()
      } else {
        setStepIdx((i) => i + 1)
      }
    }, 3000)
    let tries = 0
    let raf = 0
    const attempt = () => {
      const el = document.querySelector(s.target)
      // Alvo dentro do submenu fechado mede 0 de altura — só aceita
      // quando existe E tem área visível.
      if (el && el.getBoundingClientRect().height > 0) {
        setRect(measure(el))
        setReady(true)
        clearTimeout(skip)
        return
      }
      if (!el && s.openSubmenu) {
        // Pede de novo à sidebar (o evento pode ter chegado antes de
        // o componente montar o listener).
        window.dispatchEvent(new CustomEvent('portal-tour:open-submenu'))
      }
      if (tries < 180) {
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
      clearTimeout(skip)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [stepIdx, router, remeasure, postpone, finish])

  // Inactivo ou ainda a medir o alvo: não renderiza nada (o rect pode
  // nem existir ainda — daí o return completo, sem if aninhado).
  if (stepIdx < 0 || !step || !rect || !ready) return null

  const pos = pickPosition(rect, step.placement)
  const pad = 8
  const box = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  const cardW = Math.min(320, rect.vw - 32)
  let cardStyle
  if (pos === 'bottom') {
    cardStyle = {
      width: cardW,
      top: box.top + box.height + 12,
      left: Math.max(16, Math.min(box.left, rect.vw - cardW - 16)),
    }
  } else if (pos === 'top') {
    cardStyle = {
      width: cardW,
      top: Math.max(16, box.top - 12 - 240),
      left: Math.max(16, Math.min(box.left, rect.vw - cardW - 16)),
    }
  } else {
    const left = pos === 'right' ? box.left + box.width + 12 : box.left - cardW - 12
    cardStyle = {
      width: cardW,
      top: Math.max(16, Math.min(box.top, rect.vh - 240 - 16)),
      left: Math.max(16, Math.min(left, rect.vw - cardW - 16)),
    }
  }

  const isLast = stepIdx === STEPS.length - 1

  return (
    <div className="portal-tour" role="dialog" aria-modal="true" aria-label="Tour de boas-vindas">
      {/* Spotlight: 4 sombras recortam o alvo; clique fora interrompe. */}
      <div className="portal-tour-spot" style={box} onClick={postpone} aria-hidden="true" />

      {/* Carta do passo. */}
      <div className="portal-tour-card" style={cardStyle} role="document">
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
