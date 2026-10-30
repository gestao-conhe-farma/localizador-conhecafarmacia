import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { createServerComponentClient } from '@/lib/supabase/server'
import PortalMfaClient from '@/components/portal/PortalMfaClient'

export const metadata = {
  title: 'Verificação em dois passos — Portal da farmácia',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Segundo factor do portal — fora do route group `(dashboard)`.
 *
 * Vive fora do gate do portal de propósito: um `gerente` sem autenticador
 * inscrito é reenviado para aqui pelo layout (que exige `aal2`), e se esta
 * página estivesse lá dentro o redirect fechava-se em ciclo. Aqui basta a
 * sessão da conta de farmácia (`getPharmacySession`), que é `aal1`.
 */
export default async function PortalMfaPage() {
  const session = await getPharmacySession()
  if (!session) redirect('/portal/login')

  const supabase = await createServerComponentClient()
  const [{ data: aal }, { data: fatores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])

  const verificados = (fatores?.all || []).filter(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  )

  return (
    <div className="min-h-dvh grid place-items-center bg-brand-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/logo/logo-principal-verde.png"
            alt="Conheça Farmácia"
            width={110}
            height={38}
            priority
          />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-accent">
            Portal da farmácia
          </p>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-brand-deep">
            Verificação em dois passos
          </h1>
          <p className="mt-3 text-sm text-brand-deep/55">
            O perfil de <b>gerente</b> só entra no portal com o código do autenticador. O dono da
            conta pode ativá-lo quando quiser.
          </p>
        </div>

        <PortalMfaClient
          temFactor={verificados.length > 0}
          nivel={aal?.currentLevel || 'aal1'}
        />

        <p className="mt-8 text-center text-xs text-brand-deep/45">
          <Link href="/portal" className="portal-link">
            Tentar entrar no portal
          </Link>
          {' · '}
          <Link href="/portal/login" className="portal-link">
            Trocar de conta
          </Link>
        </p>
      </div>
    </div>
  )
}
