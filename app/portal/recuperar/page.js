import Link from 'next/link'
import Image from 'next/image'
import InvitePasswordForm from '@/components/portal/InvitePasswordForm'
import PortalRecoveryForm from '@/components/portal/PortalRecoveryForm'
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
 * Reposição de senha — dois caminhos na mesma página:
 *
 *   • COM sessão: o link do e-mail foi confirmado em
 *     `/portal/recuperar/confirmar` (gerado pela equipa CF) e falta só
 *     escolher a senha nova (`InvitePasswordForm`).
 *   • SEM sessão: auto-serviço (`PortalRecoveryForm`) — e-mail + código do
 *     autenticador + senha nova. É o caminho de quem perdeu a senha mas
 *     ainda tem o segundo factor; sem factor inscrito, a página diz que
 *     tem de pedir o link à equipa.
 *
 * Irmã de `/portal/convite`: o Route Handler é que troca o token por
 * sessão; aqui só se pergunta ao Supabase se há sessão.
 *
 * Vive FORA do route group (dashboard), como o login, o convite e a
 * escolha de perfil: o layout do dashboard exige perfil de balcão activo
 * e quem repõe a senha pode ainda não ter escolhido nenhum.
 */
export default async function RecuperarPage({ searchParams }) {
  const params = await searchParams
  const supabase = await createServerComponentClient({ area: 'portal' })
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
              {erro?.titulo || 'Repor a senha'}
            </h1>
            {erro ? (
              <>
                <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">{erro.texto}</p>
                <p className="mt-4 text-sm leading-relaxed text-brand-deep/60">
                  Se ainda tem o autenticador da conta, pode repor a senha aqui mesmo:
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-brand-deep/60">
                Escreva o e-mail da conta, o código de 6 dígitos do autenticador e a senha nova. O
                código prova que a conta é sua — sem ele não há reposição.
              </p>
            )}

            <PortalRecoveryForm />

            <p className="mt-6 text-center text-xs text-brand-deep/45">
              <Link href="/portal/login" className="portal-link">
                Já sei a senha — voltar ao login
              </Link>
              {' · '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="portal-link">
                Pedir ajuda
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
