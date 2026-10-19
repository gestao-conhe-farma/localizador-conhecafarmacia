'use client'

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import { TooltipBox } from './tooltip/tooltip-box'
import { TooltipContent, type TooltipRow } from './tooltip/tooltip-content'

export interface RadarTooltipMetric {
  key: string
  label: string
}

export interface RadarTooltipProps {
  /** Eixos do radar — o mesmo array passado a `RadarChart`. */
  metrics: RadarTooltipMetric[]
  /** Linhas do tooltip para o eixo em foco (formato `TooltipRow` do @bklit). */
  rowsFor: (metricIndex: number) => TooltipRow[]
  /** O gráfico (`RadarChart`) — o tooltip ancora-se ao container. */
  children: ReactNode
  className?: string
}

interface PointerState {
  metricIndex: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Tooltip do radar com a mesma superfície e anatomia do `ChartTooltip` do
 * @bklit (ver docs/utility/tooltip): painel `TooltipBox` com `--chart-tooltip-*`,
 * cabeçalho com o eixo e linhas com ponto de cor + rótulo muted + valor à
 * direita. O radar não é um gráfico cartesiano, por isso o eixo em foco é
 * resolvido pela posição do ponteiro e o painel é composto com os mesmos
 * primitivos exportados pelo registry.
 */
export function RadarTooltip({ metrics, rowsFor, children, className }: RadarTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<PointerState | null>(null)

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      const svg = container?.querySelector('svg')
      if (!container || !svg || metrics.length === 0) return

      const chart = svg.getBoundingClientRect()
      const bounds = container.getBoundingClientRect()
      const center = chart.width / 2
      const x = event.clientX - chart.left
      const y = event.clientY - chart.top
      const distance = Math.hypot(x - center, y - center)

      // Perto do centro os eixos ainda não se distinguem — evita ruído.
      if (distance < Math.max(24, chart.width * 0.1)) {
        setPointer(null)
        return
      }

      const angle = Math.atan2(y - center, x - center)
      let metricIndex = 0
      let smallest = Number.POSITIVE_INFINITY

      metrics.forEach((_, index) => {
        const metricAngle = (index * Math.PI * 2) / metrics.length - Math.PI / 2
        const difference = Math.abs(
          Math.atan2(Math.sin(angle - metricAngle), Math.cos(angle - metricAngle)),
        )
        if (difference < smallest) {
          smallest = difference
          metricIndex = index
        }
      })

      setPointer({
        metricIndex,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        width: bounds.width,
        height: bounds.height,
      })
    },
    [metrics],
  )

  return (
    <div
      className={cn('relative', className)}
      onPointerLeave={() => setPointer(null)}
      onPointerMove={handlePointerMove}
      ref={containerRef}
    >
      {children}
      {pointer ? (
        <TooltipBox
          containerHeight={pointer.height}
          containerRef={containerRef}
          containerWidth={pointer.width}
          visible
          x={pointer.x}
          y={pointer.y}
        >
          <TooltipContent
            rows={rowsFor(pointer.metricIndex)}
            title={metrics[pointer.metricIndex]?.label}
          />
        </TooltipBox>
      ) : null}
    </div>
  )
}

export default RadarTooltip
