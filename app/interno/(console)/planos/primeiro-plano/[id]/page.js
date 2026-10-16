import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getPrimeiroPlano } from '@/lib/actions/platform-plans'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import FirstPlanForm from '@/components/interno/FirstPlanForm'
import { dataHora, haQuanto, pillActiva } from '@/components/interno/formatos'

export const metadata = {
  title: 'Primeiro plano — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * O ECRÃ DO PRIMEIRO PLANO — o passo que uma farmácia recém-criada
 * atravessa (Task 7.1/7.2, §4.1).
 *
 * Existe à parte, e não como mais um diálogo na ficha, por três razões:
 *
 *   1. é o único caminho que CRIA a linha da 0028 — não muda estado
 *      nenhum, dá o primeiro. Confundir os dois num só botão levava a
 *      reescrever planos por cima de decisões já tomadas;
 *   2. a decisão é maior do que um clique: qual plano, experiência ou
 *      activo, com que prazo. Cabe num ecrã e não num modal;
 *   3. uma farmácia criada hoje não tem histórico para mostrar. O que ela
 *      tem é isto: escolher por onde começa. Toda a página serve essa
 *      decisão, sem ruído.
 *
 * A página exige `plan.assign`, que é exactamente a acção que o formulário
 * executa — quem não a tem não vê o ecrã (e a Server Action recusa na
 * mesma).
 */
export default async function PrimeiroPlanoPage({ params }) {
  const g = await requirePlatformPage('plan.assign')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const { id } = await params
  const res = await getPrimeiroPlano(id)

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">
              {res.error === 'NAO_ENCONTRADA' ? 'Farmácia não encontrada' : 'Primeiro plano'}
            </h1>
            <p className="interno-sub">
              {res.error === 'NAO_ENCONTRADA' ? 'Este id não corresponde a nenhuma farmácia. ' : ''}
              <Link href="/interno/planos" className="interno-table-link">
                Voltar aos planos
              </Link>
              .
            </p>
          </div>
        </div>
        {res.error !== 'NAO_ENCONTRADA' && (
          <Falha titulo="Não foi possível preparar o plano" erro={res.error} detalhe={res.detail} />
        )}
      </div>
    )
  }

  const { farmacia, plano, planos, padroes } = res
  const mfa2 = g.session?.mfa?.currentLevel === 'aal2'

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <p className="interno-sub">
            <Link href="/interno/planos" className="interno-table-link">
              ← Planos
            </Link>
          </p>
          <h1 className="interno-title">Primeiro plano</h1>
          <p className="interno-sub">
            <b>{farmacia.name}</b> · {farmacia.municipio} ·{' '}
            <span className={pillActiva(farmacia.active)}>
              {farmacia.active ? 'Activa' : 'Inactiva'}
            </span>{' '}
            {plano.temPlano ? '' : '· sem plano atribuído'}
          </p>
        </div>
      </div>

      {plano.temPlano ? (
        <div className="interno-box interno-box--pad">
          <div className="interno-empty">
            <b>Esta farmácia já tem plano</b>
            <span>
              {plano.planoNome} · {plano.statusLabel}
              {plano.fimEm ? ` (fim em ${new Date(plano.fimEm).toLocaleDateString('pt-PT')})` : ''}.
              O primeiro plano é só para quem ainda não tem nenhum — para mudar de plano ou dar
              experiência, o sítio é a ficha.
            </span>
          </div>
          <div className="interno-form-acts">
            <Link
              href={`/interno/farmacias/${farmacia.id}`}
              className="interno-btn interno-btn--primary"
            >
              Abrir a ficha
            </Link>
            <Link href="/interno/planos" className="interno-btn interno-btn--ghost">
              Ver todos os planos
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="interno-box interno-box--pad">
            <dl className="interno-dl">
              <div className="interno-dl-row">
                <dt>Criada</dt>
                <dd>
                  {dataHora(farmacia.created_at)}
                  <span className="interno-foot-sub"> {haQuanto(farmacia.created_at)}</span>
                </dd>
              </div>
              <div className="interno-dl-row">
                <dt>Selo</dt>
                <dd>{farmacia.verified ? 'Verificada pela equipa' : 'Ainda sem selo'}</dd>
              </div>
              <div className="interno-dl-row">
                <dt>Enquanto não tiver plano</dt>
                <dd>
                  O portal dela funciona no plano de entrada ({padroes.diasTrial} dias de
                  experiência por omissão).
                </dd>
              </div>
            </dl>
            <p className="interno-dl-note">
              O primeiro plano cria a linha da subscrição (0028) e entra na trilha com o motivo. É
              reversível: uma experiência pode acabar, uma suspensão pode voltar — nada se apaga.
            </p>
          </div>

          <div className="interno-box interno-box--pad">
            <div className="interno-sec-head">
              <h2>Atribuir o primeiro plano</h2>
              <span className="interno-sec-head-b">plan.assign</span>
            </div>
            <FirstPlanForm
              id={farmacia.id}
              nome={farmacia.name}
              planos={planos}
              padroes={padroes}
              mfa2={mfa2}
            />
          </div>
        </>
      )}
    </div>
  )
}
