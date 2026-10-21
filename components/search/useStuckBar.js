'use client'

import { useEffect, useState } from 'react'

/**
 * «A caixa de pesquisa original já saiu por baixo do header?» — medido no
 * scroll (um rAF por frame), para a barra compacta fixa entrar e sair.
 *
 * `minScroll` evita que a barra pisque durante o scroll suave para o topo
 * logo depois de uma pesquisa; `offset` é a altura do header fixo (64 px)
 * com uma folga.
 */
export function useStuckBar(ref, { offset = 72, minScroll = 80 } = {}) {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      setStuck(window.scrollY > minScroll && el.getBoundingClientRect().bottom <= offset)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref, offset, minScroll])

  return stuck
}
