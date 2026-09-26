import Link from 'next/link'
import Image from 'next/image'
import PharmacyLoginForm from '@/components/portal/PharmacyLoginForm'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Portal da farmácia — entrar',
  robots: { index: false, follow: false },
}

/**
 * Login do portal — o mesmo padrão da plataforma de gestão: painel
 * estrutural escuro à esquerda (só desktop) e formulário centrado à
 * direita sobre o fundo do site. Sem header nem footer — a página é
 * só o portal. Vive FORA do route group (dashboard), cujo layout
 * valida a sessão e redireccionaria para aqui em loop.
 */
export default async function PortalLoginPage({ searchParams }) {
  const params = await searchParams
  // Versão verbosa: a mesma sonda que alimenta a caixa de debug abaixo.
  const sonda = await getPharmacySessionVerbose()
  if (sonda.session) redirect('/portal')

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-brand-bg">
      {/* Painel estrutural escuro — a mesma cor da sidebar do portal */}
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
            Localizador de Medicamentos
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
            Stock confirmado,
            <br />
            cliente certo à porta.
          </h1>
          <p className="mt-5 text-white/55 leading-relaxed max-w-md text-[15px]">
            Actualize o stock, atenda reservas e vigie validades — cinco minutos, duas a três vezes
            por semana, é tudo o que o Localizador precisa de si.
          </p>
        </div>
        <div className="flex items-center justify-between text-white/35 text-xs">
          <span>Conheça Farmácia</span>
          <span>Portal da farmácia</span>
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
              Portal da farmácia
            </p>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-lg bg-brand-primary/10 text-brand-primary">
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
                  <path d="M9.5 12l2 2 3.5-4" />
                </svg>
              </span>
              <h2 className="text-2xl font-extrabold text-brand-deep tracking-tight">Entrar</h2>
            </div>
            <p className="text-sm text-brand-deep/55 mt-3">
              Entre com as credenciais da sua farmácia.
            </p>
          </div>

          <PharmacyLoginForm />

          {/* Caixa de depuração do loop pós-login — efémera, remover quando estabilizar. */}
          {params?.motivo && (
            <p
              className="portal-hint"
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--color-brand-divider)',
                background: 'var(--color-brand-bg-alt)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
              }}
            >
              debug: motivo={params.motivo}
              {params.detalhe ? ` · detalhe=${params.detalhe}` : ''}
              {sonda ? ` · sb-cookies=[${sonda.sbCookies.join(', ') || 'nenhuma'}]` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
