import { requirePlatformPage } from '@/lib/platform/session'
import { getTeam } from '@/lib/actions/platform-team'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import InternoKpis from '@/components/interno/Kpis'
import TeamTable from '@/components/interno/TeamTable'

export const metadata = {
  title: 'Equipa — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * GESTÃO DA EQUIPA (`/interno/equipa`, Phase 9 Steps 1 e 2 do plano).
 *
 * Duas acções sobre OUTRA pessoa, ambas de superadmin: mudar o nível
 * (`team.manage`) e repor o segundo factor perdido (`team.reset_mfa`). As
 * duas pedem `aal2` e motivo e deixam linha na trilha; as duas recusam a
 * própria conta.
 *
 * A reposição não é um atalho de conveniência: é o caminho de quem perdeu o
 * telefone SEM abrir a porta a quem roubou uma sessão. E a mudança de nível
 * também não: é uma autorização. O servidor recusa ainda o último
 * superadmin, para a área interna nunca ficar sem ninguém que a governe.
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
            <b> Mudar o nível</b> altera o que a pessoa pode fazer na área interna;{' '}
            <b>repor o segundo factor</b> é para quem perdeu o telefone — apaga o autenticador,
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

      <InternoKpis
        items={[
          { rotulo: 'Membros', valor: res.total, nota: 'contas da Equipa CF' },
          {
            rotulo: 'Com segundo factor',
            valor: res.ativos,
            nota: `${res.semFactor} sem autenticador`,
          },
          {
            rotulo: 'Convites por aceitar',
            valor: res.pendentes,
            nota: 'ainda sem primeiro acesso',
          },
        ]}
      />

      <div className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>Níveis internos</h2>
          <span className="interno-sec-head-b">motivo + trilha</span>
        </div>
        <p className="interno-dl-note" style={{ borderTop: 0, paddingTop: 0 }}>
          O nível define o que cada pessoa pode fazer na área interna. A mudança pede o segundo
          factor e um motivo, e fica em <b>Auditoria</b> com o antes/depois. Ninguém muda o próprio
          nível, e o último <b>superadmin</b> não sai: promova outra pessoa antes de descer esse
          nível. O papel legado <b>admin</b> conta como superadmin.
        </p>
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
        podeGerir={res.podeGerir}
        mfa2={res.mfa2}
      />
    </div>
  )
}
