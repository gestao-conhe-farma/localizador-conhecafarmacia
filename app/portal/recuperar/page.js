import Link from 'next/link'
import Image from 'next/image'
import InvitePasswordForm from '@/components/portal/InvitePasswordForm'
import { createServerComponentClient } from '@/lib/supabase/server'
import { CONTACT_EMAIL } from '@/lib/constants'

export const metadata = {
  title: 'Portal da farmácia — repor senha',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const ERROS = {
  LINK_EXPIRADO: {
    titulo: 'Este link expirou',
    texto:
      'Os links de reposição valem uma hora. Peça um novo à equipa da Conheça Farmácia — o link antigo deixa de funcionar.',
  },
  LINK_INVALIDO: {
    titulo: 'Este link já não abre',
    texto:
      'Pode já ter sido usado para escolher a senha nova. Se é o caso, entre normalmente; se não, peça um novo link à equipa.',
  },
}

/**
 * Reposição de senha (`account.reset_password`) — a página onde o dono da
 * farmácia escolhe a senha nova depois de o link do e-mail ter sido
 * confirmado em `/portal/recuperar/confirmar`.
 *
 * Irmã de `/portal/convite`: nunca verifica o token (isso é do Route
 * Handler); só pergunta ao Supabase se há sessão. Sem sessão mostra o que
 * fazer a seguir — nunca um formulário que ia falhar.
 *
 * Vive FORA do route group (dashboard), como o login, o convite e a
 * escolha de perfil: o layout do dashboard exige perfil de balcão activo
 * e quem repõe a senha pode ainda não ter escolhido nenhum.
 */
export default async function RecuperarPage({ searchParams }) {
  const params = await searchParams
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const erro = ERROS[params?.erro] || null
  const confirmado = params?.repor === '1'

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 px-5 py-12 bg-brand-bg portal-auth">
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
          {user ? 'Reposição de senha' : 'Portal da farmácia'}
        </p>

        {user ? (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep">
              Escolher uma senha nova
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">
              {confirmado ? 'O link está confirmado. ' : ''}A conta{' '}
              <strong className="font-semibold text-brand-deep">{user.email}</strong> vai passar a
              entrar com a senha que escrever aqui. A anterior deixa de valer.
            </p>
            <InvitePasswordForm variante="recuperacao" />
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-deep">
              {erro?.titulo || 'Abra o link do e-mail'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">
              {erro?.texto ||
                'Esta página serve para repor a senha do portal. Abra o link que a equipa enviou para o e-mail da farmácia.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href="/portal/login" className="btn btn-primary text-center">
                Ir para o login
              </Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="portal-hint text-center underline">
                Pedir um novo link
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
