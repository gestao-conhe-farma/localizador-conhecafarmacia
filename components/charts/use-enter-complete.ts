"use client";

import type { MotionValue } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Returns true once a mount-progress MotionValue reaches 1.
 * Use to swap animated MotionValue-driven props for static values after
 * enter completes — drops per-frame subscriptions during pan/hover.
 */
export function useEnterComplete(mountProgress: MotionValue<number>): boolean {
  const [complete, setComplete] = useState(() => mountProgress.get() >= 1);

  useEffect(() => {
    // Verificação inicial em microtarefa (não síncrona no efeito) +
    // subscrição: fecha a corrida «completou entre o render e o efeito»
    // sem setState em cascata.
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive && mountProgress.get() >= 1) {
        setComplete(true);
      }
    });

    const off = mountProgress.on("change", (value) => {
      if (value >= 1) {
        setComplete(true);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [mountProgress]);

  return complete;
}
