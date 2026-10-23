import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getLeadDetalhe } from '@/lib/actions/leads'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import LeadFunnelActions from '@/components/interno/LeadFunnelActions'
import { dataCurta, dataHora, estadoLead, haQuanto, pillLead } from '@/components/interno/formatos'

export const metadata = {
  title: 'Ficha do lead — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/** Linha da ficha: rótulo + valor, com `—` quando não há dado. */
function Linha({ rotulo, children }) {
  return (
    <div className="interno-dl-row">
      <dt>{rotulo}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

export default async function LeadFichaPage({ params }) {
  const g = await requirePlatformPage('lead.read')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const { id } = await params
  const res = await getLeadDetalhe(id)

  if (!res.ok) {
    if (res.error === 'NAO_ENCONTRADO') {
      return (
        <div className="interno-page">
          <div className="interno-head">
            <div>
              <h1 className="interno-title">Lead não encontrado</h1>
              <p className="interno-sub">
                Este id não corresponde a nenhum pedido de adesão.{' '}
                <Link href="/interno/leads" className="interno-table-link">
                  Voltar aos leads
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      )
    }
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Ficha do lead</h1>
          </div>
        </div>
        <Falha titulo="Não foi possível ler a ficha" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const { lead, farmacia } = res
  const convertido = lead.status === 'onboarded'
  const ligado = Boolean(lead.pharmacy_id)

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <p className="interno-sub">
            <Link href="/interno/leads" className="interno-table-link">
              ← Leads
            </Link>
          </p>
          <h1 className="interno-title">{lead.pharmacy_name}</h1>
          <p className="interno-sub">
            <span className={pillLead(lead.status)}>{estadoLead(lead.status)}</span>{' '}
            <span className="interno-foot-sub">
              entrou {haQuanto(lead.created_at)} · {lead.municipio || 'município por indicar'}
            </span>
          </p>
        </div>
        <div className="interno-head-acts">
          {res.podeConverter && !convertido && !ligado && (
            <Link
              href={`/interno/leads/converter/${lead.id}`}
              className="interno-btn interno-btn--primary"
            >
              Converter
            </Link>
          )}
          {res.podeConverter && !convertido && ligado && (
            <Link
              href={`/interno/leads/converter/${lead.id}`}
              className="interno-btn interno-btn--primary"
            >
              Terminar conversão
            </Link>
          )}
          {ligado && (
            <Link
              href={`/interno/farmacias/${lead.pharmacy_id}`}
              className="interno-btn interno-btn--ghost"
            >
              Abrir farmácia
            </Link>
          )}
          <Link href="/interno/leads" className="interno-btn interno-btn--ghost">
            Voltar
          </Link>
        </div>
      </div>

      <div className="interno-grid2">
        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Identificação</h2>
            <span className="interno-sec-head-b">pedido de adesão</span>
          </div>
          <dl className="interno-dl">
            <Linha rotulo="Farmácia">{lead.pharmacy_name}</Linha>
            <Linha rotulo="NIF">{lead.nif}</Linha>
            <Linha rotulo="Alvará / licença">{lead.license}</Linha>
            <Linha rotulo="Município">{lead.municipio}</Linha>
            <Linha rotulo="Morada">{lead.address}</Linha>
            <Linha rotulo="Website">
              {lead.website ? (
                <a
                  className="interno-table-link"
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {lead.website}
                </a>
              ) : null}
            </Linha>
            <Linha rotulo="Redes sociais">{lead.social}</Linha>
          </dl>
        </div>

        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Responsável</h2>
            <span className="interno-sec-head-b">quem recebe o contacto</span>
          </div>
          <dl className="interno-dl">
            <Linha rotulo="Nome">{lead.contact_name}</Linha>
            <Linha rotulo="Cargo">{lead.role}</Linha>
            <Linha rotulo="E-mail">
              <a className="interno-table-link" href={`mailto:${lead.email}`}>
                {lead.email}
              </a>
            </Linha>
            <Linha rotulo="Telefone / WhatsApp">
              <a className="interno-table-link" href={`tel:${lead.phone}`}>
                {lead.phone}
              </a>
            </Linha>
            <Linha rotulo="Mensagem">
              <span className="interno-dl-text">{lead.message || '—'}</span>
            </Linha>
          </dl>
        </div>
      </div>

      <div className="interno-grid2">
        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Estado do pedido</h2>
            <span className="interno-sec-head-b">lead #{lead.id.slice(0, 8)}</span>
          </div>
          <dl className="interno-dl">
            <Linha rotulo="Estado">
              <span className={pillLead(lead.status)}>{estadoLead(lead.status)}</span>
            </Linha>
            <Linha rotulo="Entrou">
              {dataHora(lead.created_at)}
              <span className="interno-foot-sub"> {haQuanto(lead.created_at)}</span>
            </Linha>
            <Linha rotulo="Última actualização">{dataHora(lead.updated_at)}</Linha>
            <Linha rotulo="Consentimento">
              {lead.consent_at ? (
                <>
                  {dataHora(lead.consent_at)}
                  {lead.consent_version ? (
                    <span className="interno-foot-sub"> · versão {lead.consent_version}</span>
                  ) : null}
                </>
              ) : (
                '— (lead anterior ao formulário novo)'
              )}
            </Linha>
            <Linha rotulo="Farmácia criada">
              {farmacia ? (
                <Link
                  className="interno-table-link"
                  href={`/interno/farmacias/${farmacia.id}`}
                >
                  {farmacia.name}
                </Link>
              ) : (
                'ainda não'
              )}
            </Linha>
          </dl>
        </div>

        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Funil</h2>
            <span className="interno-sec-head-b">só quem tem permissão</span>
          </div>
          {res.podeMover && !convertido && !ligado ? (
            <LeadFunnelActions leadId={lead.id} estado={lead.status} />
          ) : (
            <p className="interno-dl-note">
              {convertido
                ? 'Pedido convertido — a farmácia e a conta já existem.'
                : ligado
                  ? 'A farmácia já foi criada; falta terminar a conversão.'
                  : 'Sem permissão para mover este lead.'}
            </p>
          )}
          <p className="interno-dl-note">
            Converter o lead cria a farmácia, convida o responsável e fecha o funil. O e-mail de
            confirmação ao requerente é enviado automaticamente no momento do pedido.
          </p>
        </div>
      </div>

      <p className="interno-dl-note">
        Pedido recebido a {dataCurta(lead.created_at)}. Os dados são os que a farmácia enviou no
        formulário; qualquer correcção deve ser confirmada com o responsável antes da conversão.
      </p>
    </div>
  )
}
