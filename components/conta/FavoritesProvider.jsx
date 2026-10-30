'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toggleFavorito } from '@/lib/actions/account'
import { entrarHref } from '@/lib/account-urls'

/**
 * Guardados da conta, uma leitura por página.
 *
 * O botão de guardar aparece em cartões, na ficha e na farmácia; se cada um
 * perguntasse à base, uma grelha de 24 cartões fazia 24 pedidos. Aqui a lista
 * de ids é lida uma vez (`favorites` só devolve as linhas do próprio, a policy
 * manda) e o resto é `Set` em memória.
 *
 * Sem sessão não há leitura nenhuma: `ready` fica verdadeiro com `user` nulo e
 * o botão de guardar manda entrar em `conta.*` com o caminho de volta.
 */
const FavoritesContext = createContext(null)

const chave = (kind, id) => `${kind}:${id}`

export default function FavoritesProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null, keys: [] })

  useEffect(() => {
    let vivo = true

    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!vivo) return
      if (!user) {
        setState({ ready: true, user: null, keys: [] })
        return
      }

      const { data } = await supabase
        .from('favorites')
        .select('drug_id, pharmacy_id')
        .eq('user_id', user.id)

      if (!vivo) return
      // O nome e a fotografia vivem em `user_metadata` (é lá que o hub da
      // conta grava o upload). Sem eles, o header do Localizador caía sempre
      // no avatar de iniciais e a fotografia só aparecia no site principal.
      setState({
        ready: true,
        user: {
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.display_name || '',
          avatarUrl: user.user_metadata?.avatar_url || '',
        },
        keys: (data || [])
          .map((row) =>
            row.drug_id ? chave('drug', row.drug_id) : chave('pharmacy', row.pharmacy_id),
          )
          .filter((key) => !key.endsWith(':null')),
      })
    })().catch(() => {
      if (vivo) setState((s) => ({ ...s, ready: true }))
    })

    return () => {
      vivo = false
    }
  }, [])

  const value = useMemo(() => {
    const guardados = new Set(state.keys)

    return {
      ready: state.ready,
      user: state.user,
      isSaved: (kind, id) => Boolean(id) && guardados.has(chave(kind, id)),
      async toggle(kind, id) {
        if (!id) return

        // Sem sessão, guardar é entrar: o destino volta a esta página.
        if (!state.user) {
          window.location.href = entrarHref(window.location.href)
          return
        }

        const key = chave(kind, id)
        const estava = guardados.has(key)

        // Optimista: o botão responde ao clique, o servidor confirma depois.
        setState((s) => ({
          ...s,
          keys: estava ? s.keys.filter((k) => k !== key) : [...s.keys, key],
        }))

        const dados = new FormData()
        dados.set('kind', kind)
        dados.set('id', id)
        const res = await toggleFavorito(dados)

        if (!res?.ok) {
          setState((s) => ({
            ...s,
            keys: estava ? [...s.keys, key] : s.keys.filter((k) => k !== key),
          }))
          if (res?.error === 'SEM_SESSAO') window.location.href = entrarHref(window.location.href)
        }
      },
    }
  }, [state])

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

/** `null` fora do provider — os componentes degradam para «sem botão». */
export function useFavorites() {
  return useContext(FavoritesContext)
}
