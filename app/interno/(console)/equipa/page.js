import { requirePlatformPage } from '@/lib/platform/session'
import { getTeam } from '@/lib/actions/platform-team'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import TeamTable from '@/components/interno/TeamTable'

export const metadata = {
  title: 'Equipa — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * GESTÃO DA EQUIPA (`/interno/equipa`, Phase 9 Step 1 do plano).
 *
 * A secção é de quem pode repor um segundo factor (`team.reset_mfa`,
 * superadmin): é isso que aqui se faz. O nível de cada pessoa aparece em
 * modo de leitura — mudá-lo é `team.manage` (Step 2), que ainda não tem
 * ecrã, e um botão a fingir que não faz nada era pior do que a ausência.
 *
 * A reposição não é um atalho de conveniência: é o caminho de quem perdeu o
 * telefone SEM abrir a porta a quem roubou uma sessão. Por isso o servidor
 * recusa a própria conta (o par certo é um colega) e a acção pede `aal2` e
 * motivo, deixando linha na trilha.
 */
export default async function EquipaPage() {
  const g = await requirePlatformPage('team.reset_mfa')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const res = await getTeam()

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Equipa</h1>
            <p className="interno-sub">Quem entra na área interna e com que segundo factor.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler a equipa" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Equipa</h1>
          <p className="interno-sub">
            As pessoas da Equipa Conheça Farmácia, o nível de cada uma e o estado do autenticador.
            <b> Repor o segundo factor</b> é para quem perdeu o telefone: apaga o autenticador,
            termina as sessões dessa pessoa e deixa-a voltar a entrar com a senha para inscrever um
            novo.
          </p>
        </div>
        <div className="interno-head-acts">
          <span className={`interno-pill ${res.mfa2 ? 'interno-pill--ok' : 'interno-pill--warn'}`}>
            {res.mfa2 ? 'sessão com MFA' : 'sessão só com senha'}
          </span>
        </div>
      </div>

      <div className="interno-grid3">
        <div className="interno-box interno-box--pad">
          <span className="interno-sec-head-b">Membros</span>
          <b className="interno-title">{res.total}</b>
          <span className="interno-foot-sub">contas da Equipa CF</span>
        </div>
        <div className="interno-box interno-box--pad">
          <span className="interno-sec-head-b">Com segundo factor</span>
          <b className="interno-title">{res.ativos}</b>
          <span className="interno-foot-sub">{res.semFactor} sem autenticador</span>
        </div>
        <div className="interno-box interno-box--pad">
          <span className="interno-sec-head-b">Convites por aceitar</span>
          <b className="interno-title">{res.pendentes}</b>
          <span className="interno-foot-sub">ainda sem primeiro acesso</span>
        </div>
      </div>

      <div className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>Reposição do segundo factor</h2>
          <span className="interno-sec-head-b">MFA + motivo + trilha</span>
        </div>
        <p className="interno-dl-note" style={{ borderTop: 0, paddingTop: 0 }}>
          O aviso de «telefone perdido» chega por fora do sistema: confirme a identidade de quem
          pede antes de repor. A operação fica em <b>Auditoria</b> com o seu e-mail, o motivo e os
          factores que existiam. A própria conta nunca pode ser reposta aqui — se for a única
          <b> superadmin</b> e perdeu o telefone, o caminho é o script de bootstrap, no servidor.
        </p>
      </div>

      <TeamTable
        rows={res.rows}
        podeRepor={res.podeRepor}
        mfa2={res.mfa2}
        eu={g.session.user?.id || null}
      />
    </div>
  )
}
