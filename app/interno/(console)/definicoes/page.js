import { requirePlatformSession } from '@/lib/platform/session'
import { getMfaFatores } from '@/lib/actions/platform-mfa'
import { dataHora } from '@/components/interno/formatos'
import MfaSetup from '@/components/interno/MfaSetup'
import ContaNomeForm from '@/components/interno/ContaNomeForm'
import ContaSenhaForm from '@/components/interno/ContaSenhaForm'
import SessoesAcoes from '@/components/interno/SessoesAcoes'
import Notice from '@/components/ui/Notice'
import SettingsNav from '@/components/ui/SettingsNav'
import SettingsSection from '@/components/ui/SettingsSection'

export const metadata = {
  title: 'Definições — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const TABS = ['geral', 'seguranca', 'sessoes']

const NAV = [
  {
    label: 'Conta',
    items: [
      { key: 'geral', href: '/interno/definicoes', label: 'Geral' },
      { key: 'seguranca', href: '/interno/definicoes?tab=seguranca', label: 'Segurança' },
      { key: 'sessoes', href: '/interno/definicoes?tab=sessoes', label: 'Sessões' },
    ],
  },
]

/**
 * DEFINIÇÕES da própria conta (`/interno/definicoes`).
 *
 * A página segue a organização do Supabase: uma mini-sidebar com as
 * opções da conta e, à direita, uma secção de cada vez com o título FORA
 * do cartão («Geral», «Segurança», «Sessões»). Os separadores vivem no
 * `?tab=` para a navegação continuar a ser do servidor — cada opção é um
 * link, o estado activo vem da query e não há JavaScript a inventar uma
 * segunda navegação dentro da página.
 *
 * Não pede permissão da matriz pela mesma razão que `/interno/mfa`: a matriz
 * descreve o que uma pessoa faz A OUTRÉM. Tratar do próprio nome, da própria
 * senha e do próprio autenticador é estar dentro da equipa, não uma acção
 * sobre farmácias, contas ou planos. A autorização é a sessão — e o alcance
 * de cada Server Action é sempre o `user_id` dessa sessão.
 *
 * O que NÃO se muda aqui: e-mail (exige confirmação no endereço novo) e
 * nível (é decisão de quem gere a equipa, `team.manage`). O ecrã diz isso em
 * vez de esconder os campos e deixar a dúvida.
 */
export default async function DefinicoesPage({ searchParams }) {
  const session = await requirePlatformSession()
  const mfa = await getMfaFatores()

  const params = await searchParams
  const rawTab = Array.isArray(params?.tab) ? params.tab[0] : params?.tab
  const tab = TABS.includes(rawTab) ? rawTab : 'geral'

  const { user, profile, roleLabel, legacy, mfa: estadoMfa } = session
  const aal2 = estadoMfa?.currentLevel === 'aal2'
  const temFactor = estadoMfa?.nextLevel === 'aal2'

  const estadoSegundoFactor = aal2
    ? 'verificado nesta sessão'
    : temFactor
      ? 'inscrito, sessão só com senha'
      : 'sem autenticador'

  const cabecalho =
    tab === 'seguranca'
      ? {
          titulo: 'Segurança',
          sub: 'A senha e o segundo factor desta conta. O autenticador é obrigatório para as acções sensíveis da equipa.',
        }
      : tab === 'sessoes'
        ? {
            titulo: 'Sessões',
            sub: 'Terminar as sessões abertas noutros dispositivos não apaga o histórico nem a trilha de auditoria. Esta mantém-se aberta.',
          }
        : {
            titulo: 'Geral',
            sub: 'A sua conta na Equipa Conheça Farmácia: nome, e-mail, nível e segundo factor. O que aqui se muda é seu; o que se muda aos outros fica nas secções da equipa.',
          }

  return (
    <div className="settings-layout">
      <SettingsNav active={tab} groups={NAV} />

      <div className="settings-content">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">{cabecalho.titulo}</h1>
            <p className="interno-sub">{cabecalho.sub}</p>
          </div>
          <div className="interno-head-acts">
            <span className={`interno-pill ${aal2 ? 'interno-pill--ok' : 'interno-pill--warn'}`}>
              {estadoSegundoFactor}
            </span>
          </div>
        </div>
        {tab === 'geral' && (
          <>
            <SettingsSection
              title="Perfil"
              hint="nome de utilizador"
              cardClassName="settings-card--pad"
            >
              <ContaNomeForm nome={profile?.display_name || ''} />
            </SettingsSection>

            <SettingsSection title="Conta" hint="só leitura" cardClassName="settings-card--pad">
              <dl className="interno-dl">
                <div className="interno-dl-row">
                  <dt>E-mail</dt>
                  <dd>{user?.email || '—'}</dd>
                </div>
                <div className="interno-dl-row">
                  <dt>Nível</dt>
                  <dd>
                    {roleLabel}
                    {legacy ? ' · papel legado' : ''}
                  </dd>
                </div>
                <div className="interno-dl-row">
                  <dt>Na equipa desde</dt>
                  <dd>{user?.created_at ? dataHora(user.created_at) : '—'}</dd>
                </div>
                <div className="interno-dl-row">
                  <dt>Último acesso</dt>
                  <dd>{user?.last_sign_in_at ? dataHora(user.last_sign_in_at) : '—'}</dd>
                </div>
                <div className="interno-dl-row">
                  <dt>Segundo factor</dt>
                  <dd>{estadoSegundoFactor}</dd>
                </div>
              </dl>
              <p className="interno-hint">
                O e-mail não se muda aqui: alterá-lo exige confirmar o endereço novo. O nível é
                decidido por quem gere a equipa — peça a revisão a um superadmin.
              </p>
            </SettingsSection>
          </>
        )}
        {tab === 'seguranca' && (
          <>
            <SettingsSection
              title="Senha"
              hint="8–72 caracteres"
              cardClassName="settings-card--pad"
            >
              <ContaSenhaForm />
            </SettingsSection>

            <SettingsSection id="segundo-factor" title="Segundo factor" hint={estadoSegundoFactor}>
              {mfa.ok ? (
                <MfaSetup
                  nivel={estadoMfa?.currentLevel ?? null}
                  verificado={mfa.verificado}
                  porAcabar={mfa.porAcabar}
                  embedded
                />
              ) : (
                <div className="settings-card--pad">
                  <Notice
                    tone="danger"
                    role="alert"
                    title="Não foi possível ler o estado do segundo factor"
                  >
                    Recarregue a página e tente de novo. Se persistir, veja o log{' '}
                    <code>platform</code>.
                  </Notice>
                </div>
              )}
            </SettingsSection>
          </>
        )}{' '}
        {tab === 'sessoes' && (
          /* O título da secção é o próprio H1 desta opção — repeti-lo
             por cima do cartão dava dois «Sessões» seguidos. O padrão
             «título fora do cartão» continua cumprido pelo cabeçalho. */
          <div className="settings-card settings-card--pad">
            <SessoesAcoes />
          </div>
        )}
      </div>
    </div>
  )
}
