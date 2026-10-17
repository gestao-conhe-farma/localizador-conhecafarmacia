import { requirePlatformSession } from '@/lib/platform/session'
import { getMfaFatores } from '@/lib/actions/platform-mfa'
import { dataHora } from '@/components/interno/formatos'
import MfaSetup from '@/components/interno/MfaSetup'
import ContaNomeForm from '@/components/interno/ContaNomeForm'
import ContaSenhaForm from '@/components/interno/ContaSenhaForm'
import SessoesAcoes from '@/components/interno/SessoesAcoes'
import Notice from '@/components/ui/Notice'

export const metadata = {
  title: 'Definições — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * DEFINIÇÕES da própria conta (`/interno/definicoes`).
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
 *
 * O MFA é embebido (o mesmo `MfaSetup` de `/interno/mfa`, com a mesma
 * leitura de factores): a página de definições é onde a pessoa procura as
 * opções da conta, e mandá-la para outro ecrã para inscrever o autenticador
 * era um desvio sem motivo. A rota `/interno/mfa` continua a existir para os
 * links do shell.
 */
export default async function DefinicoesPage() {
  const session = await requirePlatformSession()
  const mfa = await getMfaFatores()

  const { user, profile, roleLabel, legacy, mfa: estadoMfa } = session
  const aal2 = estadoMfa?.currentLevel === 'aal2'
  const temFactor = estadoMfa?.nextLevel === 'aal2'

  const estadoSegundoFactor = aal2
    ? 'verificado nesta sessão'
    : temFactor
      ? 'inscrito, sessão só com senha'
      : 'sem autenticador'

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Definições</h1>
          <p className="interno-sub">
            A sua conta na Equipa Conheça Farmácia: nome, senha, segundo factor e sessões. O que
            aqui se muda é seu; o que se muda aos outros fica nas secções da equipa.
          </p>
        </div>
        <div className="interno-head-acts">
          <span className={`interno-pill ${aal2 ? 'interno-pill--ok' : 'interno-pill--warn'}`}>
            {estadoSegundoFactor}
          </span>
        </div>
      </div>

      <div className="interno-grid2">
        <section className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Perfil</h2>
            <span className="interno-sec-head-b">nome de utilizador</span>
          </div>
          <ContaNomeForm nome={profile?.display_name || ''} />
        </section>

        <section className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Conta</h2>
            <span className="interno-sec-head-b">só leitura</span>
          </div>
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
            O e-mail não se muda aqui: alterá-lo exige confirmar o endereço novo. O nível é decidido
            por quem gere a equipa — peça a revisão a um superadmin.
          </p>
        </section>
      </div>

      <section className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>Senha</h2>
          <span className="interno-sec-head-b">8–72 caracteres</span>
        </div>
        <ContaSenhaForm />
      </section>

      <div id="segundo-factor">
        {mfa.ok ? (
          <MfaSetup
            nivel={estadoMfa?.currentLevel ?? null}
            verificado={mfa.verificado}
            porAcabar={mfa.porAcabar}
          />
        ) : (
          <div className="interno-box interno-box--pad">
            <Notice
              tone="danger"
              role="alert"
              title="Não foi possível ler o estado do segundo factor"
            >
              Recarregue a página e tente de novo. Se persistir, veja o log <code>platform</code>.
            </Notice>
          </div>
        )}
      </div>

      <section className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>Sessões</h2>
          <span className="interno-sec-head-b">esta mantém-se</span>
        </div>
        <SessoesAcoes />
      </section>
    </div>
  )
}
