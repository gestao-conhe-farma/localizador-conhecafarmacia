import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { can } from '@/lib/platform/permissions'
import { listPharmacies } from '@/lib/actions/platform-pharmacies'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import { haQuanto, pillPlano, textoPlano } from '@/components/interno/formatos'

export const metadata = {
  title: 'Painel — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Painel de entrada da área interna.
 *
 * Não é um ecrã de estatísticas: é a resposta a «o que é que precisa de mim
 * hoje?». Por isso o que fica em cima não é o total de farmácias — é o que
 * está fora do normal: farmácias sem selo, stock parado, planos em graça,
 * trial ou suspensos. Tudo o que está aqui é o que a lista já calcula, sem
 * nenhuma leitura nova.
 */
export default async function InternoPainelPage() {
  const g = await requirePlatformPage('pharmacy.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const res = await listPharmacies({})
  if (!res.ok) {
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Painel</h1>
            <p className="interno-sub">Estado do directório e do que precisa de atenção.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler as farmácias" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const { rows, totais, scope } = res

  // «Precisa de atenção»: uma linha por motivo, com o que fazer a seguir.
  const atencao = []
  for (const r of rows) {
    if (!r.active) continue // uma farmácia desactivada de propósito não é um pedido de ajuda
    if (!r.verified) {
      atencao.push({
        id: `${r.id}-selo`,
        farmacia: r,
        motivo: 'Sem selo de verificada',
        nota: 'Confirme os dados da ficha e dê o selo — é o que separa a farmácia na pesquisa.',
      })
    }
    if (r.plano.status === 'graca' || r.plano.status === 'suspenso') {
      atencao.push({
        id: `${r.id}-plano`,
        farmacia: r,
        motivo: `Plano em ${r.plano.statusLabel.toLowerCase()}`,
        nota: 'Ver o prazo e falar com quem trata da cobrança.',
      })
    }
    if (r.plano.status === 'trial') {
      atencao.push({
        id: `${r.id}-trial`,
        farmacia: r,
        motivo: 'Em período de experiência',
        nota: 'A experiência acaba: decidir com a farmácia se fica no plano pago.',
      })
    }
    if (scope.operacao && r.stockParado) {
      atencao.push({
        id: `${r.id}-stock`,
        farmacia: r,
        motivo: r.stockUltimo
          ? `Stock sem actualização (${haQuanto(r.stockUltimo)})`
          : 'Nunca confirmou stock',
        nota: 'Sem confirmação recente a farmácia sai da pesquisa com «confirmado».',
      })
    }
  }

  const kpis = [
    {
      rotulo: 'Farmácias',
      valor: totais.total,
      nota: `${totais.activas} activas · ${totais.inativas} inactivas`,
    },
    { rotulo: 'Com selo', valor: totais.verificadas, nota: `${totais.semSelo} sem selo` },
    {
      rotulo: 'Planos a rever',
      valor: totais.emGraca,
      nota: 'graça, experiência ou suspensos',
    },
    ...(scope.operacao
      ? [{ rotulo: 'Stock parado', valor: totais.stockParado, nota: 'sem confirmação recente' }]
      : []),
    { rotulo: 'Sem plano', valor: totais.semPlano, nota: 'sem linha de subscrição' },
  ]

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Painel</h1>
          <p className="interno-sub">
            O directório e o que precisa de atenção. As acções ficam todas registadas na trilha.
          </p>
        </div>
        <div className="interno-head-acts">
          {/* Os planos são a outra metade do trabalho do dia e têm ecrã
              próprio (`plan.change`): quem não negoceia planos não vê o
              atalho, e o KPI «Planos a rever» continua a dizer o mesmo. */}
          {can(g.session?.role, 'plan.change') && (
            <Link href="/interno/planos" className="interno-btn interno-btn--ghost">
              Ver planos
            </Link>
          )}
          <Link href="/interno/farmacias" className="interno-btn interno-btn--primary">
            Ver farmácias
          </Link>
        </div>
      </div>

      <div className="interno-grid3">
        {kpis.map((k) => (
          <div key={k.rotulo} className="interno-box interno-box--pad">
            <span className="interno-sec-head-b">{k.rotulo}</span>
            <b className="interno-title">{k.valor}</b>
            <span className="interno-foot-sub">{k.nota}</span>
          </div>
        ))}
      </div>

      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Precisa de atenção</h2>
          <span className="interno-sec-head-b">{atencao.length} ponto(s)</span>
        </div>

        {atencao.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Nada pendente</b>
              <span>
                Nenhuma farmácia activa está sem selo, com stock parado ou com plano a rever.
              </span>
            </div>
          </div>
        ) : (
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Farmácia</th>
                  <th>Motivo</th>
                  <th>O que fazer</th>
                  <th>Plano</th>
                  <th aria-label="Abrir" />
                </tr>
              </thead>
              <tbody>
                {atencao.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/interno/farmacias/${a.farmacia.id}`}
                        className="interno-table-link"
                      >
                        {a.farmacia.name}
                      </Link>
                      <span className="interno-foot-sub">{a.farmacia.municipio || '—'}</span>
                    </td>
                    <td>{a.motivo}</td>
                    <td>
                      <span className="interno-foot-sub">{a.nota}</span>
                    </td>
                    <td>
                      <span className={pillPlano(a.farmacia.plano)}>
                        {textoPlano(a.farmacia.plano)}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/interno/farmacias/${a.farmacia.id}`}
                        className="interno-btn interno-btn--ghost interno-btn--small"
                      >
                        Abrir ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
