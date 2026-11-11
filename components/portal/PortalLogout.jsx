'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { encerrarSessao } from '@/lib/supabase/sign-out'

/**
 * Terminar a sessão da CONTA (auth) neste navegador — distinto de
 * «sair do perfil» (0018), que só fecha o turno do dispositivo.
 * `label`/`className` deixam a página /portal/sessão usar o mesmo
 * botão com a forma das outras acções (btn-secondary).
 */
export default function PortalLogout({
  label = 'Sair',
  className = 'btn-mini portal-logout',
  role,
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      className={className}
      role={role}
      onClick={async () => {
        // Âmbito local: sair do portal não deita abaixo o site nem o interno.
        await encerrarSessao(createClient({ area: 'portal' }))
        router.replace('/portal/login')
        router.refresh()
      }}
    >
      {label}
    </button>
  )
}
