import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import InternoLoginForm from '@/components/interno/InternoLoginForm'
import { SESSION_REASONS, getPlatformSessionVerbose } from '@/lib/platform/session'

export const metadata = {
  title: 'Equipa Conheça Farmácia — entrar',
  // Área interna: nunca indexável (o /robots.txt também a fecha).
  robots: { index: false, follow: false },
}

/**
 * Login da EQUIPA (não é o login da farmácia — esse é /portal/login).
 *
 * Vive fora do route group `(console)`, cujo layout exige sessão: se
 * estivesse lá dentro, o layout redirecionava o próprio login para si
 * mesmo. Mesma decisão do portal.
 *
 * O `?motivo=` chega do gate (`requirePlatformSession`) e é traduzido por
 * `SESSION_REASONS` — o ecrã diz PORQUE é que a pessoa não entrou (sem
 * sessão, conta de farmácia, conta suspensa), em vez de a deixar a
 * adivinhar entre duas portas de login parecidas.
 */
export default async function InternoLoginPage({ searchParams }) {
  const params = await searchParams
  const { session } = await getPlatformSessionVerbose()

  // Uma sessão a MEIO (senha dada, código do autenticador por confirmar) não
  // conta como «já entrado»: com `session` a bastar, a página redireccionava
  // para /interno assim que a Server Action do passo 1 lhe punha as cookies
  // — e o passo 2, que a action devolvia, nunca chegava a aparecer. Quem
  // manda embora é uma sessão completa para a conta (sem factor inscrito,
  // `aal1` já é o máximo dela).
  if (session && !session.mfa?.pendente) redirect('/interno')

  const motivo = typeof params?.motivo === 'string' ? params.motivo : null
  const motivoTexto = motivo && motivo !== 'OK' ? SESSION_REASONS[motivo] || null : null
  const faltaCodigo = Boolean(session?.mfa?.pendente)

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-brand-bg">
      {/* Painel estrutural escuro — a mesma cara do login do portal, com a
          identidade da EQUIPA à vista: são duas portas diferentes e é
          preciso que se distingam à primeira olhadela. */}
      <div className="hidden lg:flex flex-col justify-between bg-[#003528] text-white p-12">
        <Link href="/" aria-label="Conheça Farmácia">
          <Image
            src="/logo/logo-principal-branco.png"
            alt="Conheça Farmácia"
            width={150}
            height={51}
            priority
          />
        </Link>
        <div>
          <p className="text-[10.5px] tracking-[0.24em] uppercase font-bold text-brand-accent mb-4">
            Equipa Conheça Farmácia
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
            Gerir farmácias,
            <br />
            planos e contas.
          </h1>
          <p className="mt-5 text-white/55 leading-relaxed max-w-md text-[15px]">
            Área interna. Tudo o que aqui se faz fica registado numa trilha de auditoria — quem,
            quando, o que mudou e porquê.
          </p>
        </div>
        <div className="flex items-center justify-between text-white/35 text-xs">
          <span>Conheça Farmácia</span>
          <span>Área interna</span>
        </div>
      </div>

      {/* Formulário — centrado, sobre o fundo do site */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10 flex flex-col items-center">
            <Image
              src="/logo/logo-principal-verde.png"
              alt="Conheça Farmácia"
              width={110}
              height={38}
              priority
            />
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-accent">
              Área interna
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-brand-deep tracking-tight">Entrar</h2>
            <p className="text-sm text-brand-deep/55 mt-3">
              Conta individual da equipa. O segundo factor (autenticador TOTP) é pedido a seguir à
              senha, quando a conta o tem inscrito.
            </p>
          </div>

          {motivoTexto && (
            <div className="mb-5 text-sm rounded-xl border border-brand-divider bg-brand-bg-alt px-4 py-3 text-brand-deep/75">
              {motivoTexto}
            </div>
          )}

          {faltaCodigo && (
            <div className="mb-5 text-sm rounded-xl border border-brand-divider bg-brand-bg-alt px-4 py-3 text-brand-deep/75">
              Esta conta tem segundo factor inscrito. Entre com o e-mail e a senha e confirme o
              código do autenticador no passo seguinte.
            </div>
          )}

          <InternoLoginForm />
        </div>
      </div>
    </div>
  )
}
