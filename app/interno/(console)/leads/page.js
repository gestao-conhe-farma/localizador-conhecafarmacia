import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getLeads } from '@/lib/actions/leads'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import LeadFunnelActions from '@/components/interno/LeadFunnelActions'
import InternoKpis from '@/components/interno/Kpis'
import { dataCurta, estadoLead, haQuanto, pillLead } from '@/components/interno/formatos'

export const metadata = {
  title: 'Leads — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * O funil de leads (Task 5.3 Step 1).
 *
 * A `pharmacy_leads` era uma tabela órfã: o formulário da landing escrevia
 * lá e ninguém a lia. Aqui ela ganha duas coisas — a ordem e o dono.
 *
 * A ORDEM é a de quem telefona: o trabalho de hoje primeiro («Por atender»,
 * os leads que ninguém tocou), e só depois o resto do funil por ordem de
 * proximidade do fecho (acordo → demonstração → em conversa → convertidos →
 * descartados). Uma lista por data enterra um acordo de ontem por baixo de
 * cinco contactos novos.
 *
 * O DONO vem da TRILHA: cada linha diz quem mexeu no lead pela última vez,
 * quando e porquê, porque é isso que a pergunta «quem falou com esta
 * farmácia?» exige — e é o que a trilha existe para responder. Ler a trilha
 * uma vez para todas as linhas é o que mantém o ecrã barato.
 */
const ORDEM_FUNIL = { acordo: 0, demonstracao: 1, em_conversa: 2, onboarded: 3, descartado: 4 }

function ordenar(a, b) {
  const oa = ORDEM_FUNIL[a.estado] ?? 9
  const ob = ORDEM_FUNIL[b.estado] ?? 9
  if (oa !== ob) return oa - ob
  // Dentro do mesmo estado, o mais recente primeiro: é o que ainda está quente.
  return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
}

/** Uma linha da tabela. O mesmo desenho para o trabalho de hoje e para o funil. */
function Linha({ lead, podeMover, podeConverter }) {
  const convertido = lead.estado === 'onboarded'
  const ligado = Boolean(lead.pharmacyId)
  const mudanca = lead.ultimaMudanca

  return (
    <tr>
      <td data-rotulo="Farmácia">
        <b>{lead.farmaciaNome}</b>
        <span className="interno-foot-sub">
          {lead.contacto}
          {lead.papel ? ` · ${lead.papel}` : ''}
        </span>
      </td>
      <td data-rotulo="Município">{lead.municipio || '—'}</td>
      <td data-rotulo="Estado">
        <span className={pillLead(lead.estado)}>{estadoLead(lead.estado)}</span>
        {ligado && !convertido && (
          <span className="interno-foot-sub"> farmácia criada, convite por sair</span>
        )}
      </td>
      <td data-rotulo="Contacto">
        <span className="interno-foot-sub">
          {lead.telefone}
          {lead.email ? ` · ${lead.email}` : ''}
        </span>
      </td>
      <td data-rotulo="Última mudança">
        {mudanca ? (
          <>
            {haQuanto(mudanca.quando)}
            <span className="interno-foot-sub"> {mudanca.actorEmail || 'conta apagada'}</span>
            {mudanca.reason && <span className="interno-foot-sub"> — {mudanca.reason}</span>}
          </>
        ) : (
          <span className="interno-foot-sub">
            entrou {haQuanto(lead.criadoEm)} — ainda sem mexer
          </span>
        )}
      </td>
      <td data-rotulo="Entrou">
        {dataCurta(lead.criadoEm)}
        {lead.onboardedEm && (
          <span className="interno-foot-sub"> fechou {haQuanto(lead.onboardedEm)}</span>
        )}
      </td>
      <td data-rotulo="Acções" className="interno-table-acts">
        <div className="interno-row-acts interno-row-acts--lead">
          {/* Converter é a acção que CRIA (farmácia + conta + funil): tem
              ecrã próprio, como o primeiro plano — não é um diálogo. */}
          {podeConverter && !convertido && !ligado && (
            <Link
              href={`/interno/leads/converter/${lead.id}`}
              className="interno-btn interno-btn--primary interno-btn--small"
            >
              Converter
            </Link>
          )}
          {podeConverter && !convertido && ligado && (
            <Link
              href={`/interno/leads/converter/${lead.id}`}
              className="interno-btn interno-btn--primary interno-btn--small"
            >
              Terminar conversão
            </Link>
          )}
          {convertido && lead.pharmacyId && (
            <Link
              href={`/interno/farmacias/${lead.pharmacyId}`}
              className="interno-btn interno-btn--ghost interno-btn--small"
            >
              Abrir ficha
            </Link>
          )}
          {podeMover && !convertido && !ligado && (
            <LeadFunnelActions leadId={lead.id} estado={lead.estado} />
          )}
        </div>
      </td>
    </tr>
  )
}

export default async function LeadsPage({ searchParams }) {
  const g = await requirePlatformPage('lead.read')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const params = await searchParams
  const res = await getLeads({ estado: params?.estado })

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Leads</h1>
            <p className="interno-sub">O funil de farmácias, do primeiro contacto ao convite.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler o funil" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const { rows, totais, filtro, podeMover, podeConverter } = res
  const porAtender = rows.filter((r) => r.estado === 'novo')
  const resto = rows.filter((r) => r.estado !== 'novo').sort(ordenar)

  const kpis = [
    { rotulo: 'Por atender', valor: totais.porEstado.novo, nota: 'ninguém lhes tocou ainda' },
    { rotulo: 'Em conversa', valor: totais.porEstado.em_conversa, nota: 'contacto feito' },
    { rotulo: 'Demonstração', valor: totais.porEstado.demonstracao, nota: 'viram o produto' },
    { rotulo: 'Acordo', valor: totais.porEstado.acordo, nota: 'prontos para converter' },
    {
      rotulo: 'Convertidos',
      valor: totais.porEstado.onboarded,
      nota: 'farmácia e convite criados',
    },
    {
      rotulo: 'Descartados',
      valor: totais.porEstado.descartado,
      nota: 'sem seguimento — ficam registados',
    },
  ]

  const tabela = (linhas) => (
    <div className="interno-table-scroll">
      <table className="interno-table interno-table--leads">
        <thead>
          <tr>
            <th>Farmácia</th>
            <th>Município</th>
            <th>Estado</th>
            <th>Contacto</th>
            <th>Última mudança</th>
            <th>Entrou</th>
            <th aria-label="Acções" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <Linha key={l.id} lead={l} podeMover={podeMover} podeConverter={podeConverter} />
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Leads</h1>
          <p className="interno-sub">
            O funil das farmácias que se candidataram pelo site. Converter um lead cria a farmácia,
            convida o dono e fecha o funil — três registos, um pedido só, na trilha.
          </p>
        </div>
        <div className="interno-head-acts">
          <Link href="/interno/farmacias" className="interno-btn interno-btn--ghost">
            Ver farmácias
          </Link>
        </div>
      </div>

      <InternoKpis items={kpis} />

      <div className="interno-box">
        <form className="interno-filters" method="get">
          <label className="interno-filter">
            <span className="interno-filter-label">Estado</span>
            <select className="interno-select" name="estado" defaultValue={filtro || ''}>
              <option value="">Todos</option>
              {res.funil.map((estado) => (
                <option key={estado} value={estado}>
                  {estadoLead(estado)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="interno-btn interno-btn--ghost interno-btn--small">
            Filtrar
          </button>
          {filtro && (
            <Link
              href="/interno/leads"
              className="interno-btn interno-btn--ghost interno-btn--small"
            >
              Limpar
            </Link>
          )}
        </form>
      </div>

      {filtro ? (
        <div className="interno-box">
          <div className="interno-sec-head">
            <h2>
              Leads em <b>{estadoLead(filtro)}</b>
            </h2>
            <span className="interno-sec-head-b">{rows.length}</span>
          </div>
          {rows.length === 0 ? (
            <div className="interno-box--pad">
              <div className="interno-empty">
                <b>Nenhum lead neste estado</b>
                <span>Mude o filtro acima para ver o resto do funil.</span>
              </div>
            </div>
          ) : (
            tabela(rows)
          )}
        </div>
      ) : (
        <>
          {/* O trabalho do dia. Tal como no ecrã dos planos, o que precisa de
              alguém tem secção própria em vez de estar no meio da lista. */}
          <div className="interno-box">
            <div className="interno-sec-head">
              <h2>Por atender</h2>
              <span className="interno-sec-head-b">{porAtender.length}</span>
            </div>
            {porAtender.length === 0 ? (
              <div className="interno-box--pad">
                <div className="interno-empty">
                  <b>Nada por atender</b>
                  <span>
                    Todos os leads que entraram pelo site já foram tocados. Os novos aparecem aqui,
                    por ordem de chegada.
                  </span>
                </div>
              </div>
            ) : (
              tabela(porAtender)
            )}
          </div>

          <div className="interno-box">
            <div className="interno-sec-head">
              <h2>Funil</h2>
              <span className="interno-sec-head-b">{resto.length}</span>
            </div>
            {resto.length === 0 ? (
              <div className="interno-box--pad">
                <div className="interno-empty">
                  <b>O funil está vazio</b>
                  <span>
                    Quando a equipa mover um lead (<b>Em conversa</b>, <b>Acordo</b>…), ele aparece
                    aqui até ser convertido ou descartado.
                  </span>
                </div>
              </div>
            ) : (
              tabela(resto)
            )}
          </div>
        </>
      )}
    </div>
  )
}
