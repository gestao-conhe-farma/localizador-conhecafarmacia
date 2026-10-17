import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getLeadParaConversao } from '@/lib/actions/leads'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import LeadConvertForm from '@/components/interno/LeadConvertForm'
import LeadConvertResult from '@/components/interno/LeadConvertResult'
import { dataHora, estadoLead, haQuanto, pillLead } from '@/components/interno/formatos'

export const metadata = {
  title: 'Converter lead — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * O ECRÃ DA CONVERSÃO (Task 5.3 Step 2) — onde um lead do site passa a ser
 * uma farmácia com dono.
 *
 * É um ecrã e não um diálogo porque a operação faz três coisas: cria a
 * farmácia, convida o dono e fecha o funil. Cada uma tem consequências
 * próprias (a farmácia aparece no Localizador, o dono recebe um e-mail, o
 * funil deixa de pedir seguimento), e quem as dispara tem de as ver antes.
 *
 * A página exige `lead.convert`, que é a acção que o formulário executa —
 * e o SERVIDOR exige ainda `pharmacy.create` e `account.invite`
 * (`podeConverter`), porque a matriz descreve-as em separado e uma
 * divergência futura não pode dar a alguém o convite sem a farmácia.
 *
 * Quando o lead já aponta para uma farmácia mas o funil está aberto, o ecrã
 * muda de sentido: não é uma conversão, é a CONCLUSÃO dela. Dizer isso em
 * vez de deixar clicar outra vez é o que evita a segunda farmácia.
 */
export default async function ConverterLeadPage({ params }) {
  const g = await requirePlatformPage('lead.convert')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const { id } = await params
  const res = await getLeadParaConversao(id)

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    const naoExiste = res.error === 'NAO_ENCONTRADO'
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <p className="interno-sub">
              <Link href="/interno/leads" className="interno-table-link">
                ← Leads
              </Link>
            </p>
            <h1 className="interno-title">{naoExiste ? 'Lead não encontrado' : 'Conversão'}</h1>
            <p className="interno-sub">
              {naoExiste
                ? 'Este id não corresponde a nenhum lead do funil.'
                : 'Não foi possível preparar a conversão.'}
            </p>
          </div>
        </div>
        {!naoExiste && (
          <Falha
            titulo="Não foi possível preparar a conversão"
            erro={res.error}
            detalhe={res.detail}
          />
        )}
      </div>
    )
  }

  const { lead, farmacia, jaConvertido, conversao, tentativa, municipios, podeConverter } = res

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <p className="interno-sub">
            <Link href="/interno/leads" className="interno-table-link">
              ← Leads
            </Link>
          </p>
          <h1 className="interno-title">
            {jaConvertido
              ? 'Conversão concluída'
              : farmacia
                ? 'Terminar a conversão'
                : 'Converter lead'}
          </h1>
          <p className="interno-sub">
            <b>{lead.pharmacy_name}</b> · {lead.contact_name} ·{' '}
            <span className={pillLead(lead.status)}>{estadoLead(lead.status)}</span>
            {lead.municipio ? ` · ${lead.municipio}` : ''}
          </p>
        </div>
      </div>
      <div className="interno-box interno-box--pad">
        <dl className="interno-dl">
          <div className="interno-dl-row">
            <dt>Entrou pelo site</dt>
            <dd>
              {dataHora(lead.created_at)}
              <span className="interno-foot-sub"> {haQuanto(lead.created_at)}</span>
            </dd>
          </div>
          <div className="interno-dl-row">
            <dt>Contacto</dt>
            <dd>
              {lead.phone}
              {lead.email ? ` · ${lead.email}` : ''}
              {lead.role ? <span className="interno-foot-sub"> {lead.role}</span> : null}
            </dd>
          </div>
          {lead.message && (
            <div className="interno-dl-row">
              <dt>Mensagem</dt>
              <dd>{lead.message}</dd>
            </div>
          )}
          {lead.onboarded_at && (
            <div className="interno-dl-row">
              <dt>Fechou</dt>
              <dd>
                {dataHora(lead.onboarded_at)}
                <span className="interno-foot-sub"> {haQuanto(lead.onboarded_at)}</span>
              </dd>
            </div>
          )}
        </dl>
        <p className="interno-dl-note">
          Converter é UMA operação auditada: farmácia, convite ao dono e fecho do funil acontecem
          com o mesmo <span className="interno-mono">requestId</span> em `platform_audit_log`.
        </p>
      </div>{' '}
      {jaConvertido ? (
        // O resultado lido da TRILHA: os passos com o actor e a hora de cada
        // um, e o pedido que os liga. Não é decoração — é a resposta a «o que
        // é que esta operação fez?» para quem abre o ecrã dias depois, e
        // também para o próprio ecrã se redesdobrar logo a seguir a gravar
        // (a acção chama `revalidatePath`, e um painel que vivesse só no
        // estado do formulário desaparecia nesse instante).
        <LeadConvertResult
          passos={conversao?.registos?.length ? conversao.registos : []}
          requestId={conversao?.requestId}
          resumo={
            <>
              <b>{farmacia ? farmacia.name : lead.pharmacy_name}</b> está no directório desde{' '}
              {dataHora(conversao?.quando || lead.onboarded_at || lead.updated_at)} e o funil está
              fechado. Repetir aqui criaria uma conta nova sem razão — o convite, se for preciso,
              reenvia-se a partir da ficha.
            </>
          }
          nota={
            conversao?.reason
              ? `Motivo gravado na trilha: «${conversao.reason}».`
              : 'Os registos da operação ficam ligados pelo mesmo pedido na trilha de auditoria.'
          }
          acao={
            <div className="interno-form-acts">
              {farmacia && (
                <Link
                  href={`/interno/farmacias/${farmacia.id}`}
                  className="interno-btn interno-btn--primary"
                >
                  Abrir a ficha
                </Link>
              )}
              <Link href="/interno/leads" className="interno-btn interno-btn--ghost">
                Voltar ao funil
              </Link>
            </div>
          }
        />
      ) : !podeConverter ? (
        <SemPermissao acao="pharmacy.create + account.invite" rotulo={g.session?.roleLabel}>
          <span>
            Converter um lead cria a farmácia e convida o dono. O seu nível tem `lead.convert` mas
            não as duas permissões que a operação executa.
          </span>
        </SemPermissao>
      ) : (
        <LeadConvertForm
          lead={lead}
          farmacia={farmacia}
          jaConvertido={jaConvertido}
          tentativa={tentativa}
          municipios={municipios}
        />
      )}
    </div>
  )
}
