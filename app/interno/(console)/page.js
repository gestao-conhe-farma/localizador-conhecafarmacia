import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { can } from '@/lib/platform/permissions'
import { listPharmacies } from '@/lib/actions/platform-pharmacies'
import { getLeadsResumo } from '@/lib/actions/leads'
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
 * trial ou suspensos, e os leads que entraram pelo site e ninguém tocou.
 * Tudo o que está aqui é o que a lista já calcula, mais uma contagem de
 * leads (sem trazer linhas) — nenhuma leitura cara.
 */
export default async function InternoPainelPage() {
  const g = await requirePlatformPage('pharmacy.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  // O funil só se lê para quem o pode ler: um nível sem `lead.read` (o
  // `faturacao`) continua a ver o painel das farmácias, sem o número que
  // não lhe pertence.
  const podeVerLeads = can(g.session?.role, 'lead.read')
  const [res, leads] = await Promise.all([
    listPharmacies({}),
    podeVerLeads ? getLeadsResumo() : Promise.resolve(null),
  ])
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

  // Leads por atender: um lead novo é uma farmácia à espera de resposta, e
  // é trabalho do dia tanto quanto uma farmácia sem selo. Fica no topo da
  // lista de atenção, antes das farmácias, porque tem prazo — quem espera
  // três dias escolhe outra farmácia.
  const leadsPorAtender = leads?.ok ? leads.porAtender : 0
  const leadsFalhou = Boolean(leads && !leads.ok)

  // «Precisa de atenção»: uma linha por motivo, com o que fazer a seguir.
  // Cada linha traz o próprio destino (`href`/`acao`) porque nem tudo o que
  // precisa de atenção é uma ficha de farmácia — um lead do site precisa do
  // funil, e a tabela desenha os dois sem ramificar.
  const atencao = []

  // Leads primeiro: quem espera resposta escolhe outra farmácia, e é o
  // único ponto desta lista com prazo a correr.
  if (podeVerLeads && !leadsFalhou && leadsPorAtender > 0) {
    atencao.push({
      id: 'leads-por-atender',
      nome: `${leadsPorAtender} ${leadsPorAtender === 1 ? 'lead' : 'leads'} por atender`,
      municipio: null,
      href: '/interno/leads',
      acao: 'Abrir o funil',
      motivo: 'Ninguém lhes tocou ainda',
      nota: 'Cada lead é uma farmácia que se candidatou pelo site — o trabalho é ligar ou converter.',
      plano: null,
    })
  }

  for (const r of rows) {
    if (!r.active) continue // uma farmácia desactivada de propósito não é um pedido de ajuda
    const destino = {
      nome: r.name,
      municipio: r.municipio,
      href: `/interno/farmacias/${r.id}`,
      acao: 'Abrir ficha',
      plano: r.plano,
    }
    if (!r.verified) {
      atencao.push({
        ...destino,
        id: `${r.id}-selo`,
        motivo: 'Sem selo de verificada',
        nota: 'Confirme os dados da ficha e dê o selo — é o que separa a farmácia na pesquisa.',
      })
    }
    if (r.plano.status === 'graca' || r.plano.status === 'suspenso') {
      atencao.push({
        ...destino,
        id: `${r.id}-plano`,
        motivo: `Plano em ${r.plano.statusLabel.toLowerCase()}`,
        nota: 'Ver o prazo e falar com quem trata da cobrança.',
      })
    }
    if (r.plano.status === 'trial') {
      atencao.push({
        ...destino,
        id: `${r.id}-trial`,
        motivo: 'Em período de experiência',
        nota: 'A experiência acaba: decidir com a farmácia se fica no plano pago.',
      })
    }
    if (scope.operacao && r.stockParado) {
      atencao.push({
        ...destino,
        id: `${r.id}-stock`,
        motivo: r.stockUltimo
          ? `Stock sem actualização (${haQuanto(r.stockUltimo)})`
          : 'Nunca confirmou stock',
        nota: 'Sem confirmação recente a farmácia sai da pesquisa com «confirmado».',
      })
    }
  }

  const kpis = [
    ...(podeVerLeads
      ? [
          {
            rotulo: 'Leads por atender',
            valor: leadsFalhou ? '—' : leadsPorAtender,
            nota: leadsFalhou ? 'falha ao contar (ver log)' : 'entraram pelo site, sem resposta',
          },
        ]
      : []),
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
          {/* Os leads são a outra porta de entrada e têm ecrã próprio
              (`lead.read`): quem os lê vê o atalho com o número que ainda
              não foi tocado — é o que faz abrir o funil. */}
          {podeVerLeads && (
            <Link href="/interno/leads" className="interno-btn interno-btn--ghost">
              Ver leads{!leadsFalhou && leadsPorAtender > 0 ? ` (${leadsPorAtender})` : ''}
            </Link>
          )}
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
                Nenhum lead à espera de resposta e nenhuma farmácia activa sem selo, com stock
                parado ou com plano a rever.
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
                      <Link href={a.href} className="interno-table-link">
                        {a.nome}
                      </Link>
                      {a.municipio && <span className="interno-foot-sub">{a.municipio}</span>}
                    </td>
                    <td>{a.motivo}</td>
                    <td>
                      <span className="interno-foot-sub">{a.nota}</span>
                    </td>
                    <td>
                      {a.plano ? (
                        <span className={pillPlano(a.plano)}>{textoPlano(a.plano)}</span>
                      ) : (
                        <span className="interno-foot-sub">—</span>
                      )}
                    </td>
                    <td>
                      <Link
                        href={a.href}
                        className="interno-btn interno-btn--ghost interno-btn--small"
                      >
                        {a.acao}
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
