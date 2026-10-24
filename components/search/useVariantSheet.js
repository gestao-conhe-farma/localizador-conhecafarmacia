'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Parâmetros que abrem a lista de farmácias de uma variante. */
export const VARIANT_PARAM = 'variante'
export const BRAND_PARAM = 'marca'

/**
 * Lista de farmácias de um medicamento + marca, guardada no URL.
 *
 * Mesmo contrato do `useProductSheet`: abrir empurra uma entrada (o
 * «voltar» do browser fecha), fechar devolve à entrada anterior e um link
 * directo nunca sai do site. A ficha de uma farmácia concreta continua a
 * viver em `?produto=`, por cima desta camada.
 */
export function useVariantSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const drugId = searchParams.get(VARIANT_PARAM)
  const brandKey = searchParams.get(BRAND_PARAM) || ''
  const base = useRef(null)

  const href = useCallback(
    (id, brand) => {
      const params = new URLSearchParams(search)
      // Trocar de variante nunca deixa uma ficha antiga pendurada.
      params.delete('produto')
      if (id) {
        params.set(VARIANT_PARAM, id)
        if (brand) params.set(BRAND_PARAM, brand)
        else params.delete(BRAND_PARAM)
      } else {
        params.delete(VARIANT_PARAM)
        params.delete(BRAND_PARAM)
      }
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, search],
  )

  const open = useCallback(
    (variant) => {
      if (!variant?.drug_id) return
      if (base.current === null) base.current = href(null, '')
      router.push(href(variant.drug_id, variant.brandKey), { scroll: false })
    },
    [href, router],
  )

  const close = useCallback(() => {
    const back = base.current
    base.current = null
    if (back !== null && back === href(null, '')) router.back()
    else router.replace(href(null, ''), { scroll: false })
  }, [href, router])

  useEffect(() => {
    if (!drugId) base.current = null
  }, [drugId])

  return { drugId, brandKey, open, close }
}
