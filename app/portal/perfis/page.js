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
    <div className="min-h-dvh flex flex-col items-center justify-center gap-7 px-5 py-12 bg-brand-bg portal-auth">
      {/* Coluna de 46rem centrada na página, com o conteúdo alinhado à
          esquerda (modelo A): a marca fica acima do título serifado do
          StaffPicker. */}
      <div className="w-full max-w-[46rem] mx-auto flex flex-col gap-6">
        <div className="flex flex-col items-start text-left">
          {/* Logo com as duas versões (padrão do portal): no escuro o
              verde desaparece sobre o fundo escuro — troca para o branco. */}
          <Link href="/" aria-label="Conheça Farmácia">
            <Image
              src="/logo/logo-principal-verde.png"
              alt="Conheça Farmácia"
              width={110}
              height={38}
              priority
              className="portal-logo-green"
            />
            <Image
              src="/logo/logo-principal-branco.png"
              alt=""
              width={110}
              height={38}
              priority
              aria-hidden="true"
              className="portal-logo-white"
            />
          </Link>
        </div>

        <StaffPicker
          pharmacyName={session.pharmacy.name}
          accountName={session.profile.display_name}
        />
      </div>
    </div>
  )
}
