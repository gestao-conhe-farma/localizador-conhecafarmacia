'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PortalLogout() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="btn-mini portal-logout"
      onClick={async () => {
        await createClient().auth.signOut()
        router.replace('/portal/login')
        router.refresh()
      }}
    >
      Sair
    </button>
  )
}
