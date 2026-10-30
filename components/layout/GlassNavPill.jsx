'use client'

import { useEffect, useImperativeHandle, useState } from 'react'

/**
 * Indicador «liquid glass» das abas do header — porte do efeito do projeto
 * vandilson-neto (`components/ui/LiquidGlass.tsx`), sem dependências novas:
 *
 *   · um filtro SVG (feTurbulence → feDisplacementMap) aplicado por
 *     `backdrop-filter: url(#…)` refrata o que está atrás da pílula;
 *   · o vinco de vidro vem do gradiente e das arestas internas brancas;
 *   · a pílula mede a aba ativa e desliza com uma transição de mola (CSS,
 *     desligada em prefers-reduced-motion).
 *
 * O `backdrop-filter` vai em estilo inline de propósito: o Lightning CSS do
 * Turbopack descarta a propriedade padrão quando vê a versão prefixada, e o
 * Chromium ficava sem refração.
 */

const FILTER_ID = 'nav-glass-filter'

/**
 * Última caixa medida, partilhada entre montagens.
 *
 * O cabeçalho do Localizador é montado em cada página (não num layout
 * partilhado), por isso cada navegação cria uma pílula nova. Sem esta memória
 * ela nascia no canto esquerdo (`translate(0, 0)`) e deslizava sempre da
 * esquerda para a direita — mesmo quando a aba nova ficava à esquerda — e só
 * depois da página nova estar pintada. Guardando a última caixa, a pílula da
 * página seguinte nasce já na aba anterior e desliza daí para a nova, como
 * acontece no site principal, onde o header persiste entre páginas.
 */
let ultimaCaixa = null

const medir = (host, ancora) => {
  if (!host || !ancora) return null
  const h = host.getBoundingClientRect()
  const a = ancora.getBoundingClientRect()
  // Em mobile a nav está `display: none` — sem medidas não há nada a pintar.
  if (a.width === 0 || h.width === 0) return null
  return {
    x: a.left - h.left,
    y: a.top - h.top,
    width: a.width,
    height: a.height,
  }
}

export default function GlassNavPill({ containerRef, anchorRef, signature, comAbaAtiva = true, ref }) {
  // Arranca da última posição conhecida (a aba ativa da página anterior): é
  // dela que a transição parte. Numa primeira visita — ou numa página sem
  // nenhuma aba ativa (ficha de medicamento, termos…) — não há memória a usar:
  // `box` fica nulo e a pílula entra com o fade em vez de deslizar.
  const [box, setBox] = useState(() => (comAbaAtiva ? ultimaCaixa : null))

  useEffect(() => {
    const measure = () => {
      const next = medir(containerRef.current, anchorRef.current)
      if (!next) {
        setBox(null)
        return
      }
      ultimaCaixa = next
      setBox(next)
    }

    measure()
    window.addEventListener('resize', measure)
    // A troca de fonte muda a largura dos rótulos.
    document.fonts?.ready.then(measure).catch(() => {})
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (observer && containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [containerRef, anchorRef, signature])

  // Salto imediato: no Localizador a navegação troca a página inteira (header
  // incluído), por isso a aba nova só seria medida depois do carregamento.
  // Aqui a pílula parte para a aba clicada no próprio clique, e a memória
  // entrega-a à página seguinte já na posição certa.
  useImperativeHandle(
    ref,
    () => ({
      saltarPara(el) {
        const next = medir(containerRef.current, el)
        if (!next) return
        ultimaCaixa = next
        setBox(next)
      },
    }),
    [containerRef]
  )

  return (
    <>
      <span
        aria-hidden="true"
        className="nav-glass"
        data-ready={box ? '' : undefined}
        style={
          box
            ? {
                width: box.width,
                height: box.height,
                transform: `translate(${box.x}px, ${box.y}px)`,
              }
            : { opacity: 0 }
        }
      >
        <span
          aria-hidden="true"
          className="nav-glass-refract"
          style={{
            backdropFilter: `url(#${FILTER_ID})`,
            WebkitBackdropFilter: 'blur(6px) saturate(1.2)',
          }}
        />
      </span>

      <svg className="nav-glass-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter
            id={FILTER_ID}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05 0.05"
              numOctaves="1"
              seed="1"
              result="turbulence"
            />
            <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurredNoise"
              scale="40"
              xChannelSelector="R"
              yChannelSelector="B"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="3" />
          </filter>
        </defs>
      </svg>
    </>
  )
}
