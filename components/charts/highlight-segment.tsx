"use client";

import { type MotionValue, motion } from "motion/react";
import { type RefObject, useCallback, useId, useSyncExternalStore } from "react";

// Hover-highlight overlay: re-strokes the base path `d`, clipped to a vertical
// band whose x/width spring to track the hovered point, so only the segment
// around the dot shows brighter. The band comes from `useHighlightSegment`;
// because the bright stroke reuses the base `d`, it follows whatever curve is
// drawn (see `highlight-segment-bounds.ts` for the band-extent caveat).

export interface HighlightSegmentProps {
  /** Ref to the rendered base stroke `<path>` — its `d` is re-used verbatim. */
  pathRef: RefObject<SVGPathElement | null>;
  /** Whether to render (caller gates on showHighlight + active + loaded). */
  visible: boolean;
  stroke: string;
  strokeWidth: number;
  /** Plot height — the clip band spans it fully. */
  height: number;
  /** Spring-eased left edge of the clip band (px). */
  x: MotionValue<number>;
  /** Spring-eased width of the clip band (px). */
  width: MotionValue<number>;
}

export function HighlightSegment({
  pathRef,
  visible,
  stroke,
  strokeWidth,
  height,
  x,
  width,
}: HighlightSegmentProps) {
  const clipId = useId();
  // O `d` do traço-base vive no DOM (o traço anima por MotionValues, não
  // há prop com o valor). Lê-se via snapshot externo em vez de
  // `pathRef.current` no render: a snapshot é re-lida a cada render
  // (dados novos) e a subscrição aos springs refresca-a no hover.
  const subscribeD = useCallback(
    (notify: () => void) => {
      const offX = x.on("change", notify);
      const offW = width.on("change", notify);
      return () => {
        offX();
        offW();
      };
    },
    [x, width]
  );
  const d = useSyncExternalStore(
    subscribeD,
    () => (visible ? (pathRef.current?.getAttribute("d") ?? null) : null),
    () => null
  );
  if (!visible || d == null) {
    return null;
  }
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <motion.rect height={height} width={width} x={x} y={0} />
        </clipPath>
      </defs>
      <motion.path
        animate={{ opacity: 1 }}
        clipPath={`url(#${clipId})`}
        d={d}
        exit={{ opacity: 0 }}
        fill="none"
        initial={{ opacity: 0 }}
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      />
    </>
  );
}

HighlightSegment.displayName = "HighlightSegment";

export default HighlightSegment;
