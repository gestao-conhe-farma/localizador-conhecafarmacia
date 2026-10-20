"use client";

import { motion, useSpring } from "motion/react";
import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { type SpringConfig, useChartConfig } from "../chart-config-context";
import { chartCssVars } from "../chart-context";

export interface TooltipBoxProps {
  /** X position in pixels (relative to container) */
  x: number;
  /** Y position in pixels (relative to container) */
  y: number;
  /** Whether the tooltip is visible */
  visible: boolean;
  /** Container ref for portal rendering */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Container width for flip detection */
  containerWidth: number;
  /** Container height for bounds clamping */
  containerHeight: number;
  /** Offset from the target position */
  offset?: number;
  /** Custom class name */
  className?: string;
  /** Tooltip content */
  children: React.ReactNode;
  /** Override left position (bypasses internal calculation) */
  left?: number | ReturnType<typeof useSpring>;
  /** Override top position (bypasses internal calculation) */
  top?: number | ReturnType<typeof useSpring>;
  /** Force flip direction (for custom positioning) */
  flipped?: boolean;
  /** Per-chart override; falls back to `ChartConfigProvider.tooltipBoxSpring`. */
  springConfig?: SpringConfig;
  /** Animate panel position with a spring. Default: true */
  animate?: boolean;
  /** Fade/scale the panel on show. Default: true */
  entrance?: boolean;
  /** Inline styles for the inner tooltip panel. */
  panelStyle?: React.CSSProperties;
  /**
   * Tooltip panel background color (CSS variable or color value).
   * Default: `var(--chart-tooltip-background)`.
   */
  backgroundColor?: string;
}

// Inner-only-on-visible so `useSpring` initializes at the cursor's actual x/y
// instead of (0, 0) on first hover.
export function TooltipBox(props: TooltipBoxProps) {
  // O portal precisa do nó real (só existe no cliente após commit):
  // lê-se a ref no efeito e guarda-se em estado (sem cascata — só
  // atualiza quando o nó muda).
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const seenContainerRef = useRef<HTMLDivElement | null>(null);
  const { containerRef } = props;

  // Sem deps de propósito: apanha remontagens do contentor; o guard
  // seenContainerRef impede ciclos (só escreve quando o nó muda).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const node = containerRef.current;
    if (node !== seenContainerRef.current) {
      seenContainerRef.current = node;
      setContainer(node);
    }
  });

  if (!container) {
    return null;
  }
  if (!props.visible) {
    return null;
  }
  return <TooltipBoxInner {...props} container={container} />;
}

function TooltipBoxInner({
  x,
  y,
  containerWidth,
  containerHeight,
  offset = 16,
  className = "",
  children,
  left: leftOverride,
  top: topOverride,
  flipped: flippedOverride,
  springConfig,
  animate = true,
  entrance = true,
  panelStyle,
  backgroundColor = chartCssVars.tooltipBackground,
  container,
}: Omit<TooltipBoxProps, "visible" | "containerRef"> & {
  container: HTMLElement;
}) {
  const { tooltipBoxSpring } = useChartConfig();
  const effectiveSpring = springConfig ?? tooltipBoxSpring;

  const tooltipRef = useRef<HTMLDivElement>(null);
  // Tamanho medido do painel (a leitura faz-se no layout effect,
  // nunca com a ref durante o render).
  const [measuredSize, setMeasuredSize] = useState({ w: 180, h: 80 });
  const [staticPosition, setStaticPosition] = useState({ left: x, top: y });

  const tw = measuredSize.w;
  const th = measuredSize.h;
  const shouldFlipX = x + tw + offset > containerWidth;
  const targetX = shouldFlipX ? x - offset - tw : x + offset;
  const targetY = Math.max(
    offset,
    Math.min(y - th / 2, containerHeight - th - offset)
  );

  const animatedLeft = useSpring(targetX, effectiveSpring);
  const animatedTop = useSpring(targetY, effectiveSpring);

  if (animate && leftOverride === undefined) {
    animatedLeft.set(targetX);
  }
  if (animate && topOverride === undefined) {
    animatedTop.set(targetY);
  }

  useLayoutEffect(() => {
    if (!tooltipRef.current) {
      return;
    }
    const el = tooltipRef.current;
    const w = el.offsetWidth > 0 ? el.offsetWidth : measuredSize.w;
    const h = el.offsetHeight > 0 ? el.offsetHeight : measuredSize.h;
    setMeasuredSize((prev) =>
      prev.w === w && prev.h === h ? prev : { w, h }
    );
    const w2 = w;
    const h2 = h;
    const flip = x + w2 + offset > containerWidth;
    const tx = flip ? x - offset - w2 : x + offset;
    const ty = Math.max(
      offset,
      Math.min(y - h2 / 2, containerHeight - h2 - offset)
    );
    if (!animate) {
      setStaticPosition({ left: tx, top: ty });
      return;
    }
    if (leftOverride === undefined) {
      animatedLeft.set(tx);
    }
    if (topOverride === undefined) {
      animatedTop.set(ty);
    }
  }, [
    x,
    y,
    containerWidth,
    containerHeight,
    offset,
    leftOverride,
    topOverride,
    animate,
    animatedLeft,
    animatedTop,
    measuredSize,
  ]);

  const prevFlipRef = useRef(shouldFlipX);
  const [flipKey, setFlipKey] = useState(0);

  useEffect(() => {
    if (prevFlipRef.current !== shouldFlipX) {
      setFlipKey((k) => k + 1);
      prevFlipRef.current = shouldFlipX;
    }
  }, [shouldFlipX]);

  const finalLeft = animate
    ? (leftOverride ?? animatedLeft)
    : staticPosition.left;
  const finalTop = animate ? (topOverride ?? animatedTop) : staticPosition.top;
  const isFlipped = flippedOverride ?? shouldFlipX;
  const transformOrigin = isFlipped ? "right top" : "left top";

  const panelClassName = cn(
    "min-w-[140px] overflow-hidden rounded-xl border border-border/70 text-chart-tooltip-foreground shadow-lg shadow-black/5",
    panelStyle?.backgroundColor === undefined &&
      backgroundColor === chartCssVars.tooltipBackground &&
      "bg-chart-tooltip-background",
    panelStyle?.backdropFilter === undefined && "backdrop-blur-md"
  );
  const panelStyleResolved = {
    transformOrigin,
    ...(panelStyle?.backgroundColor === undefined && {
      backgroundColor,
    }),
    ...panelStyle,
  };

  if (!entrance) {
    return createPortal(
      <div
        className={cn("pointer-events-none absolute z-50", className)}
        ref={tooltipRef}
        style={{ left: staticPosition.left, top: staticPosition.top }}
      >
        <div className={panelClassName} style={panelStyleResolved}>
          {children}
        </div>
      </div>,
      container
    );
  }

  return createPortal(
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("pointer-events-none absolute z-50", className)}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      ref={tooltipRef}
      style={{ left: finalLeft, top: finalTop }}
      transition={{ duration: 0.1 }}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1, x: 0 }}
        className={panelClassName}
        initial={{ scale: 0.85, opacity: 0, x: isFlipped ? 20 : -20 }}
        key={flipKey}
        style={panelStyleResolved}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {children}
      </motion.div>
    </motion.div>,
    container
  );
}

TooltipBox.displayName = "TooltipBox";

export default TooltipBox;
