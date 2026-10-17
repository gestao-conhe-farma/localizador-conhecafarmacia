import Link from 'next/link'
import Image from 'next/image'
import InvitePasswordForm from '@/components/portal/InvitePasswordForm'
import { createServerComponentClient } from '@/lib/supabase/server'
import { CONTACT_EMAIL } from '@/lib/constants'

export const metadata = {
  title: 'Portal da farmácia — definir senha',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const ERROS = {
  LINK_EXPIRADO: {
    titulo: 'Este convite expirou',
    texto:
      'Os convites valem uma hora. Peça à equipa da Conheça Farmácia um novo — o link antigo deixa de funcionar.',
  },
  LINK_INVALIDO: {
    titulo: 'Este link já não abre',
    texto:
      'Pode já ter sido usado para definir a senha. Se é o caso, entre normalmente; se não, peça um novo convite à equipa.',
  },
}

/**
 * Aceitação do convite (Task 6.2 Step 2) — a página onde o dono da farmácia
 * define a PRÓPRIA senha.
 *
 * O token chega por `/portal/convite/confirmar`, que o troca por sessão e
 * redirecciona para aqui sem o hash no URL. Esta página nunca verifica o
 * token: só pergunta ao Supabase se há sessão. Sem sessão, mostra o que
 * fazer a seguir (o link expirou? já foi usado?) — nunca um formulário
 * que iria falhar.
 *
 * Vive FORA do route group (dashboard), como o login e a escolha de perfil:
 * o layout do dashboard exige perfil de balcão activo e, logo depois do
 * convite, ainda não existe nenhum.
 */
export default async function ConvitePage({ searchParams }) {
  const params = await searchParams
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const erro = ERROS[params?.erro] || null
  const confirmado = params?.convite === '1'

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 px-5 py-12 bg-brand-bg">
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

      <div className="w-full max-w-md rounded-xl border border-brand-line bg-brand-card p-8 shadow-soft">
        <p className="text-[10.5px] tracking-[0.24em] uppercase font-bold text-brand-accent">
          {user ? 'Primeiro acesso' : 'Portal da farmácia'}
        </p>

        {user ? (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep">
              Definir a sua senha
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">
              {confirmado ? 'O convite está confirmado. ' : ''}A conta{' '}
              <strong className="font-semibold text-brand-deep">{user.email}</strong> já tem acesso
              ao portal da sua farmácia. Escolha a senha com que vai entrar — é a única vez que lhe
              pedimos isto.
            </p>
            <InvitePasswordForm />
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep">
              {erro?.titulo || 'Abra o link do convite'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">
              {erro?.texto ||
                'Esta página serve para aceitar o convite enviado por e-mail à farmácia. Abra o link que recebeu para definir a sua senha.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href="/portal/login" className="btn btn-primary text-center">
                Ir para o login
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="portal-hint text-center underline">
                Pedir um novo convite
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
