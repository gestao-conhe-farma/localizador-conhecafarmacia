'use client'

import { useEffect, useState } from 'react'

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

export default function GlassNavPill({ containerRef, anchorRef, signature }) {
  const [box, setBox] = useState(null)

  useEffect(() => {
    const measure = () => {
      const host = containerRef.current
      const anchor = anchorRef.current
      if (!host || !anchor) {
        setBox(null)
        return
      }
      const h = host.getBoundingClientRect()
      const a = anchor.getBoundingClientRect()
      // Em mobile a nav está `display: none` — sem medidas não há nada a pintar.
      if (a.width === 0 || h.width === 0) {
        setBox(null)
        return
      }
      setBox({
        x: a.left - h.left,
        y: a.top - h.top,
        width: a.width,
        height: a.height,
      })
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
