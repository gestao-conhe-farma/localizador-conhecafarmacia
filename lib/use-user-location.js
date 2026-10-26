'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { clearStoredLocation, readStoredLocation, requestBrowserLocation } from '@/lib/geo'

/**
 * Posição do visitante, pedida só quando ele carrega em «Perto de mim».
 *
 * `status`: 'idle' (nunca pedimos) | 'asking' | 'ready' | 'PERMISSAO' |
 * 'INDISPONIVEL' | 'TEMPO' | 'SEM_SUPORTE'.
 *
 * `permission`: estado da permissão no browser ('granted' | 'denied' |
 * 'prompt' | 'unknown'). Distingue «site bloqueado» de «a caixa de
 * permissão não chegou a aparecer» — o erro 1 cobre os dois.
 *
 * A posição vem do sessionStorage — estado EXTERNO ao React. É lida com
 * useSyncExternalStore (instantâneo do servidor a `null`), por isso a
 * hidratação bate certo SEM ler a storage durante o render do servidor e
 * sem setState dentro de um efeito de montagem. O instantâneo do cliente
 * é memoizado porque a storage devolve um objecto novo a cada leitura —
 * um valor novo a cada render faria o React entrar em ciclo.
 */

const listeners = new Set()
let cache = null
let cached = false

function snapshot() {
  if (!cached) {
    cache = readStoredLocation()
    cached = true
  }
  return cache
}

function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Esquece o valor lido e avisa quem observa (mudou a sessionStorage). */
function refresh() {
  cache = null
  cached = false
  for (const listener of listeners) listener()
}

export function useUserLocation() {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null)
  // Posição pedida agora ao browser — pode existir sem storage (modo
  // privado), por isso vive em estado próprio e tem prioridade.
  const [own, setOwn] = useState(null)
  const [status, setStatus] = useState('idle')
  const [permission, setPermission] = useState('unknown')

  const location = own || stored

  const request = useCallback(async () => {
    setStatus('asking')
    try {
      const coords = await requestBrowserLocation()
      setOwn(coords)
      setStatus('ready')
      refresh()
      return coords
    } catch (err) {
      setStatus(err?.code || 'INDISPONIVEL')
      setPermission(err?.permission || 'unknown')
      return null
    }
  }, [])

  const clear = useCallback(() => {
    clearStoredLocation()
    setOwn(null)
    setStatus('idle')
    refresh()
  }, [])

  // Sem pedido nem resultado guardado o estado é 'idle'; assim que há
  // posição (própria ou da sessão) passa a 'ready'.
  const effectiveStatus = status !== 'idle' ? status : location ? 'ready' : 'idle'

  return { location, status: effectiveStatus, permission, request, clear }
}
