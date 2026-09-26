'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPharmacyStockClient } from '@/lib/stock'
import { logWarn } from '@/lib/log'

/**
 * Realtime (T12): subscreve mudanças na tabela `stock_items` e refresca o
 * stock da farmácia sem reload. O Supabase Realtime só publica tabelas —
 * a view `stock_confirmed` não é subscritível — por isso o evento serve de
 * "sino" e a lista é refetchada da view (a regra das 72 h e os joins ficam
 * no Postgres, sem duplicar lógica no cliente).
 *
 * O hook também funciona no caso "sem dados iniciais" (items === []):
 * uma farmácia que confirme o 1.º produto ganha a lista na hora, sem
 * o utilizador recarregar.
 *
 * Debounce de 2 s: a farmácia costuma guardar o stock inteiro de uma vez
 * (dezenas de rows num só UPDATE em lote) — refetch uma única vez.
 */
export function usePharmacyStockRealtime(slug, refetch) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!slug) return undefined

    const supabase = createClient()
    const channel = supabase
      .channel(`stock-${slug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_items',
          // Sem filtro server-side: pharmacy_id é um UUID que o cliente não
          // tem no momento da subscrição (a view expõe o slug). No piloto o
          // volume de eventos é baixo; o refetch re-filtra pelo slug na view.
        },
        () => {
          clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => {
            refetch()
          }, 2000)
        },
      )
      .subscribe((status) => {
        // A subscription é um extra — falha de Realtime (rate limit, proxy
        // corporativo, websockets bloqueados) degrada para o comportamento
        // actual (refetch no próximo reload) sem ruído na consola.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logWarn('pharmacy-stock', 'Realtime indisponível — a usar dados estáticos', {
            slug,
            status,
          })
        }
      })

    return () => {
      clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [slug, refetch])
}
