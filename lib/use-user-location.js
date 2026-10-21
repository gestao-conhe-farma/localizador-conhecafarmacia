'use client'

import { useCallback, useEffect, useState } from 'react'
import { clearStoredLocation, readStoredLocation, requestBrowserLocation } from '@/lib/geo'

/**
 * Posição do visitante, pedida só quando ele carrega em «Perto de mim».
 *
 * `status`: 'idle' (nunca pedimos) | 'asking' | 'ready' | 'PERMISSAO' |
 * 'INDISPONIVEL' | 'TEMPO' | 'SEM_SUPORTE'.
 *
 * A posição guardada em sessionStorage é lida depois de montar (nunca
 * durante o render): o servidor não a conhece e o HTML não pode divergir
 * do cliente na hidratação.
 */
export function useUserLocation() {
  const [location, setLocation] = useState(null)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const stored = readStoredLocation()
    if (stored) {
      setLocation(stored)
      setStatus('ready')
    }
  }, [])

  const request = useCallback(async () => {
    setStatus('asking')
    try {
      const coords = await requestBrowserLocation()
      setLocation(coords)
      setStatus('ready')
      return coords
    } catch (err) {
      setStatus(err?.code || 'INDISPONIVEL')
      return null
    }
  }, [])

  const clear = useCallback(() => {
    clearStoredLocation()
    setLocation(null)
    setStatus('idle')
  }, [])

  return { location, status, request, clear }
}
