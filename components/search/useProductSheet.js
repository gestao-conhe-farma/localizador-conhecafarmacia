'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Parâmetro que abre a ficha de um produto sobre a página actual. */
export const PRODUCT_PARAM = 'produto'

/**
 * Ficha do produto guardada no URL — partilhável e com o «voltar» do
 * browser a fechar o cartão.
 *
 * - Abrir EMPURRA uma entrada (`?produto=id`): o voltar do browser fecha.
 * - Trocar de produto DENTRO do cartão substitui a entrada — navegar nas
 *   alternativas não empilha fichas, o «voltar» continua a fechar.
 * - Fechar volta atrás quando a entrada anterior é a nossa página sem o
 *   parâmetro; num link partilhado (sem histórico) substitui o URL, para
 *   nunca sair do site.
 */
export function useProductSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const openId = searchParams.get(PRODUCT_PARAM)
  // URL da página sem o parâmetro — a entrada a que «fechar» volta.
  const base = useRef(null)

  const href = useCallback(
    (id) => {
      const params = new URLSearchParams(search)
      if (id) params.set(PRODUCT_PARAM, id)
      else params.delete(PRODUCT_PARAM)
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, search],
  )

  const open = useCallback(
    (id) => {
      if (!id || id === openId) return
      if (base.current === null) base.current = href(null)
      router.push(href(id), { scroll: false })
    },
    [href, openId, router],
  )

  const swap = useCallback(
    (id) => {
      if (!id || id === openId) return
      if (base.current === null) base.current = href(null)
      router.replace(href(id), { scroll: false })
    },
    [href, openId, router],
  )

  const close = useCallback(() => {
    const back = base.current
    base.current = null
    if (back !== null && back === href(null)) router.back()
    else router.replace(href(null), { scroll: false })
  }, [href, router])

  // O «voltar» do browser (ou um link directo) fecha o cartão sem deixar
  // pendurada a referência à entrada que tínhamos empurrado.
  useEffect(() => {
    if (!openId) base.current = null
  }, [openId])

  return { openId, open, swap, close }
}
