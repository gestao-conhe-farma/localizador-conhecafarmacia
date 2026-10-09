import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getPharmacySession } from '@/lib/pharmacy-session'
import StaffPicker from '@/components/portal/StaffPicker'

export const metadata = {
  title: 'Portal da farmácia — escolher perfil',
  robots: { index: false, follow: false },
}

// Sessão sempre fresca: os perfis mudam durante o turno.
export const dynamic = 'force-dynamic'

/**
 * Ecrã de escolha de perfil de farmacêutico — cada balcão/dispositivo
 * entra com o SEU perfil (PIN de 4 dígitos); os registos passam a ficar
 * em nome de quem está activo.
 *
 * Vive FORA do route group (dashboard), como o login: o layout do
 * dashboard exige perfil activo e redireccionaria para aqui em loop.
 * É também o destino do «Trocar perfil» e de «Sair do perfil».
 */
export default async function StaffProfilesPage() {
  const session = await getPharmacySession()
  if (!session) redirect('/portal/login')

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 bg-brand-bg">
      {/* Container alargado (novo modelo): a grelha de cartões passa a
          ler-se em 3 colunas — a escolha é o assunto da página. */}
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-8 text-center">
          <Link href="/" aria-label="Conheça Farmácia">
            <Image
              src="/logo/logo-principal-verde.png"
              alt="Conheça Farmácia"
              width={110}
              height={38}
              priority
            />
          </Link>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-accent">
            Portal da farmácia
          </p>
        </div>

        <StaffPicker
          pharmacyName={session.pharmacy.name}
          accountName={session.profile.display_name}
        />
      </div>
    </div>
  )
}
