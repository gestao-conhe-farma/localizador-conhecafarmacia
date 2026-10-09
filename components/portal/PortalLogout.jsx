'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Terminar a sessão da CONTA (auth) neste navegador — distinto de
 * «sair do perfil» (0018), que só fecha o turno do dispositivo.
 * `label`/`className` deixam a página /portal/sessão usar o mesmo
 * botão com a forma das outras acções (btn-secondary).
 */
export default function PortalLogout({ label = 'Sair', className = 'btn-mini portal-logout' }) {
  const router = useRouter()
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await createClient().auth.signOut()
        router.replace('/portal/login')
        router.refresh()
      }}
    >
      {label}
    </button>
  )
}
