import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getPharmacyDetalhe } from '@/lib/actions/platform-pharmacies'
import { can, describeAction } from '@/lib/platform/permissions'
import { catalogoPlanos } from '@/lib/plans'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import PharmacyActions from '@/components/interno/PharmacyActions'
import PlanPanel from '@/components/interno/PlanPanel'
import {
  dataCurta,
  dataHora,
  haQuanto,
  pillActiva,
  pillPlano,
  textoPlano,
} from '@/components/interno/formatos'

export const metadata = {
  title: 'Ficha da farmácia — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

const RESERVA_ESTADOS = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  pronta: 'Pronta',
  concluida: 'Concluída',
  recusada: 'Recusada',
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

/**
 * Ficha da farmácia (Task 5.2).
 *
 * Os blocos aparecem por ordem de quem liga: primeiro a IDENTIFICAÇÃO e o
 * ESTADO (o que se lê ao atender o telefone), depois o plano e as contas, e
 * só no fim a operação e o histórico. Os blocos operacionais só existem
 * quando o nível os pode ver — a decisão é do servidor
 * (`viewScope`/`getPharmacyDetalhe`), e esta página limita-se a não
 * desenhar o que não recebeu.
 *
 * As acções do cabeçalho são a única parte interactiva: cada uma autoriza
 * outra vez no servidor e deixa linha na trilha.
 */
export default async function FarmaciaFichaPage({ params }) {
  const g = await requirePlatformPage('pharmacy.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const { id } = await params
  const res = await getPharmacyDetalhe(id)

  if (!res.ok) {
    if (res.error === 'NAO_ENCONTRADA') {
      return (
        <div className="interno-page">
          <div className="interno-head">
            <div>
              <h1 className="interno-title">Farmácia não encontrada</h1>
              <p className="interno-sub">
                Este id não corresponde a nenhuma farmácia.{' '}
                <Link href="/interno/farmacias" className="interno-table-link">
                  Voltar à lista
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
            <h1 className="interno-title">Ficha da farmácia</h1>
          </div>
        </div>
        <Falha titulo="Não foi possível ler a ficha" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const { farmacia, plano, contas, scope, notas, podeVerNotas } = res
  const s = g.session
  const operacao = scope.operacao === true

  const acoes = {
    editar: can(s.role, 'pharmacy.update'),
    verificar: can(s.role, 'pharmacy.verify'),
    estado: can(s.role, farmacia.active ? 'pharmacy.deactivate' : 'pharmacy.activate'),
    mfa2: s.mfa?.currentLevel === 'aal2',
  }

  // As acções de plano vêm da mesma matriz: uma farmácia sem plano só vê o
  // caminho do primeiro plano, e quem não negoceia planos não vê nenhuma.
  const acoesPlano = {
    atribuir: can(s.role, 'plan.assign'),
    mudar: can(s.role, 'plan.change'),
    trial: can(s.role, 'plan.trial'),
    graca: can(s.role, 'plan.grace'),
    suspender: can(s.role, 'plan.suspend'),
    retomar: can(s.role, 'plan.resume'),
    mfa2: s.mfa?.currentLevel === 'aal2',
  }

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <p className="interno-sub">
            <Link href="/interno/farmacias" className="interno-table-link">
              ← Farmácias
            </Link>
          </p>
          <h1 className="interno-title">{farmacia.name}</h1>
          <p className="interno-sub">
            <span className={pillActiva(farmacia.active)}>
              {farmacia.active ? 'Activa' : 'Inactiva'}
            </span>{' '}
            <span
              className={
                farmacia.verified
                  ? 'interno-pill interno-pill--ok'
                  : 'interno-pill interno-pill--warn'
              }
            >
              {farmacia.verified ? 'Verificada' : 'Sem selo'}
            </span>{' '}
            <span className={pillPlano(plano)}>{textoPlano(plano)}</span>
          </p>
        </div>
        <div className="interno-head-acts">
          <PharmacyActions
            id={farmacia.id}
            nome={farmacia.name}
            active={farmacia.active}
            verified={farmacia.verified}
            acoes={acoes}
            valores={{
              name: farmacia.name,
              municipio: farmacia.municipio,
              address: farmacia.address || '',
              phone: farmacia.phone || '',
              whatsapp: farmacia.whatsapp || '',
              email: farmacia.email || '',
              opening_hours: farmacia.opening_hours || '',
              maps_url: farmacia.maps_url || '',
            }}
          />
        </div>
      </div>

      {/* ---- Identificação ---- */}
      <div className="interno-grid2">
        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Identificação</h2>
            <span className="interno-sec-head-b">{farmacia.slug}</span>
          </div>
          <dl className="interno-dl">
            <Linha rotulo="Nome">{farmacia.name}</Linha>
            <Linha rotulo="Município">{farmacia.municipio}</Linha>
            <Linha rotulo="Morada">{farmacia.address}</Linha>
            <Linha rotulo="Telefone">{farmacia.phone}</Linha>
            <Linha rotulo="WhatsApp">{farmacia.whatsapp}</Linha>
            <Linha rotulo="E-mail">{farmacia.email}</Linha>
            <Linha rotulo="Horário">{farmacia.opening_hours}</Linha>
            <Linha rotulo="Mapa">
              {farmacia.maps_url ? (
                <a
                  className="interno-table-link"
                  href={farmacia.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  abrir no Google Maps
                </a>
              ) : null}
            </Linha>
            <Linha rotulo="Criada">
              {dataCurta(farmacia.created_at)}
              <span className="interno-foot-sub"> {haQuanto(farmacia.created_at)}</span>
            </Linha>
            <Linha rotulo="Actualizada">{dataHora(farmacia.updated_at)}</Linha>
            <Linha rotulo="Página pública">
              <Link
                className="interno-table-link"
                href={`/farmacia/${farmacia.slug}`}
                target="_blank"
              >
                /farmacia/{farmacia.slug}
              </Link>
            </Linha>
          </dl>
          <p className="interno-dl-note">
            O nome, a morada e o horário são o que o cliente final vê no Localizador. Uma farmácia
            inactiva desaparece do directório e o stock dela sai da pesquisa.
          </p>
        </div>

        {/* ---- Estado e plano ---- */}
        <div className="interno-box interno-box--pad">
          <div className="interno-sec-head">
            <h2>Estado e plano</h2>
            <span className="interno-sec-head-b">0028</span>
          </div>
          <dl className="interno-dl">
            <Linha rotulo="Estado">
              <span className={pillActiva(farmacia.active)}>
                {farmacia.active
                  ? 'Activa — visível no Localizador'
                  : 'Inactiva — fora do directório'}
              </span>
            </Linha>
            <Linha rotulo="Selo">{farmacia.verified ? 'Verificada pela equipa' : 'Sem selo'}</Linha>
            <Linha rotulo="Plano">
              <span className={pillPlano(plano)}>{textoPlano(plano)}</span>
            </Linha>
            {plano.trialUntil && (
              <Linha rotulo="Fim da experiência">
                {dataCurta(plano.trialUntil)}
                {plano.expirado && <span className="interno-foot-sub"> — terminou</span>}
              </Linha>
            )}
            {plano.graceUntil && (
              <Linha rotulo="Fim da graça">
                {dataCurta(plano.graceUntil)}
                {plano.expirado && <span className="interno-foot-sub"> — terminou</span>}
              </Linha>
            )}
            {/* O plano ATRIBUÍDO e o plano EM VIGOR são coisas diferentes
                sempre que um prazo terminou ou há suspensão — e é a segunda
                que a farmácia vive. Sem esta linha, a ficha dizia «Gestão»
                de uma farmácia que o portal já tratava como Localizador. */}
            {plano.temPlano && plano.emVigor !== plano.planCode && (
              <Linha rotulo="Em vigor">
                <span className="interno-pill interno-pill--warn">{plano.emVigorNome}</span>
                <span className="interno-foot-sub">
                  {plano.expirado ? ' — o prazo terminou' : ' — suspenso por pagamento'}
                </span>
              </Linha>
            )}
            <Linha rotulo="Plano desde">{dataCurta(plano.startedAt)}</Linha>
            <Linha rotulo="Plano actualizado">{dataHora(plano.updatedAt)}</Linha>
            {operacao && (
              <>
                <Linha rotulo="Contas">{contas.length}</Linha>
                <Linha rotulo="Perfis do balcão">
                  {res.perfis.length} ({res.perfis.filter((p) => p.active).length} activos)
                </Linha>
                <Linha rotulo="Chaves de API activas">
                  {res.integracao.chaves.filter((k) => k.active && !k.revokedAt).length}
                </Linha>
                <Linha rotulo="Destinos de webhook">{res.integracao.destinos.length}</Linha>
                <Linha rotulo="Reservas abertas">
                  {
                    res.operacao.reservas.filter(
                      (r) => r.status !== 'concluida' && r.status !== 'recusada',
                    ).length
                  }
                </Linha>
              </>
            )}
            {podeVerNotas && <Linha rotulo="Notas internas">{notas || '—'}</Linha>}
          </dl>
          {/* Acções de plano (Task 7.2 Step 2): uma farmácia SEM plano tem
              aqui o caminho para o ecrã do primeiro plano; as outras têm
              mudar, experiência, graça, suspender e retomar. */}
          <PlanPanel
            id={farmacia.id}
            nome={farmacia.name}
            plano={plano}
            planos={catalogoPlanos()}
            acoes={acoesPlano}
            notas={notas}
          />
        </div>
      </div>

      {/* ---- Contas ---- */}
      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Contas da farmácia</h2>
          <span className="interno-sec-head-b">{contas.length} conta(s)</span>
        </div>
        {contas.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Esta farmácia não tem conta</b>
              <span>
                Ninguém entra no portal em nome dela. O convite é enviado pela equipa (fase
                seguinte) — até lá, a ficha fica pronta e o stock pode continuar a ser alimentado
                por API.
              </span>
            </div>
          </div>
        ) : (
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nome</th>
                  <th>Convite</th>
                  <th>Último acesso</th>
                  <th>Criada</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.userId}>
                    <td>
                      <span>{c.email || '—'}</span>
                      {c.banido && <span className="interno-pill interno-pill--off">Suspensa</span>}
                    </td>
                    <td>{c.displayName || '—'}</td>
                    <td>
                      {c.conviteAceite ? (
                        <span className="interno-pill interno-pill--ok">Aceite</span>
                      ) : (
                        <span className="interno-pill interno-pill--info">Pendente</span>
                      )}
                    </td>
                    <td>
                      {c.ultimoAcesso ? (
                        <>
                          <span>{dataCurta(c.ultimoAcesso)}</span>
                          <span className="interno-foot-sub">{haQuanto(c.ultimoAcesso)}</span>
                        </>
                      ) : (
                        <span className="interno-foot-sub">nunca entrou</span>
                      )}
                    </td>
                    <td>{dataCurta(c.criadaEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Perfis do balcão (0018) ---- */}
      {operacao && (
        <div className="interno-box">
          <div className="interno-sec-head">
            <h2>Perfis do balcão</h2>
            <span className="interno-sec-head-b">só leitura — a farmácia é que gere</span>
          </div>
          {res.perfis.length === 0 ? (
            <div className="interno-box--pad">
              <div className="interno-empty">
                <b>Sem perfis criados</b>
                <span>A farmácia ainda não atribuiu o balcão a ninguém (perfis com PIN).</span>
              </div>
            </div>
          ) : (
            <div className="interno-table-scroll">
              <table className="interno-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Papel</th>
                    <th>Estado</th>
                    <th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {res.perfis.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.role === 'gerente' ? 'Gerente' : 'Balcão'}</td>
                      <td>
                        <span
                          className={
                            p.active
                              ? 'interno-pill interno-pill--ok'
                              : 'interno-pill interno-pill--off'
                          }
                        >
                          {p.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>{dataCurta(p.criadoEm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Integração (0023/0024/0025) ---- */}
      {operacao && (
        <div className="interno-box">
          <div className="interno-sec-head">
            <h2>Integração</h2>
            <span className="interno-sec-head-b">chaves, destinos e chamadas</span>
          </div>
          <div className="interno-box--pad">
            {res.integracao.chaves.length === 0 && res.integracao.destinos.length === 0 ? (
              <div className="interno-empty">
                <b>Sem integração ligada</b>
                <span>Nem chaves de API nem destinos de webhook registados.</span>
              </div>
            ) : (
              <dl className="interno-dl">
                {res.integracao.chaves.map((k) => (
                  <Linha key={k.id} rotulo={`Chave · ${k.name}`}>
                    <code>••••{k.last4}</code>{' '}
                    <span
                      className={
                        k.active && !k.revokedAt
                          ? 'interno-pill interno-pill--ok'
                          : 'interno-pill interno-pill--off'
                      }
                    >
                      {k.revokedAt ? 'Revogada' : k.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span className="interno-foot-sub">
                      {' '}
                      {k.requestCount} pedidos · último{' '}
                      {k.lastUsedAt ? haQuanto(k.lastUsedAt) : 'nunca usado'}
                    </span>
                  </Linha>
                ))}
                {res.integracao.destinos.map((w) => (
                  <Linha key={w.id} rotulo="Destino de webhook">
                    <code>{w.url}</code>{' '}
                    <span className="interno-foot-sub">{w.events.join(', ')}</span>
                  </Linha>
                ))}
              </dl>
            )}
            <p className="interno-dl-note">
              A equipa lê esta informação para responder a pedidos; alterar chaves ou destinos é a
              farmácia que faz, no portal dela.
            </p>
          </div>
        </div>
      )}

      {/* ---- Operação: stock e reservas ---- */}
      {operacao && (
        <div className="interno-grid2">
          <div className="interno-box">
            <div className="interno-sec-head">
              <h2>Stock confirmado</h2>
              <span className="interno-sec-head-b">
                {res.operacao.stockUltimo ? haQuanto(res.operacao.stockUltimo) : 'nunca confirmou'}
              </span>
            </div>
            {res.operacao.stock.length === 0 ? (
              <div className="interno-box--pad">
                <div className="interno-empty">
                  <b>Nada em stock</b>
                  <span>Nenhum produto marcado como disponível nesta farmácia.</span>
                </div>
              </div>
            ) : (
              <div className="interno-table-scroll">
                <table className="interno-table">
                  <thead>
                    <tr>
                      <th>Medicamento</th>
                      <th>Qtd</th>
                      <th>Confirmação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.operacao.stock.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <span>{i.medicamento}</span>
                          <span className="interno-foot-sub">
                            {[i.forma, i.dosagem].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </td>
                        <td>{i.quantity ?? '—'}</td>
                        <td>
                          <span>{dataCurta(i.confirmedAt)}</span>
                          <span className="interno-foot-sub">{haQuanto(i.confirmedAt)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="interno-box">
            <div className="interno-sec-head">
              <h2>Reservas recentes</h2>
              <span className="interno-sec-head-b">
                {scope.contacto ? 'com contacto de quem reservou' : 'sem contacto de cliente'}
              </span>
            </div>
            {res.operacao.reservas.length === 0 ? (
              <div className="interno-box--pad">
                <div className="interno-empty">
                  <b>Sem reservas</b>
                  <span>Nenhuma reserva registada nesta farmácia.</span>
                </div>
              </div>
            ) : (
              <div className="interno-table-scroll">
                <table className="interno-table">
                  <thead>
                    <tr>
                      <th>Medicamento</th>
                      {scope.contacto && <th>Cliente</th>}
                      <th>Estado</th>
                      <th>Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.operacao.reservas.map((r) => (
                      <tr key={r.id}>
                        <td>{r.medicamento}</td>
                        {scope.contacto && (
                          <td>
                            <span>{r.requesterName}</span>
                            <span className="interno-foot-sub">{r.requesterPhone}</span>
                          </td>
                        )}
                        <td>
                          <span className="interno-pill interno-pill--info">
                            {RESERVA_ESTADOS[r.status] || r.status}
                          </span>
                        </td>
                        <td>
                          <span>{dataCurta(r.criadaEm)}</span>
                          <span className="interno-foot-sub">{haQuanto(r.criadaEm)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Histórico: a trilha desta farmácia ---- */}
      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Histórico</h2>
          <span className="interno-sec-head-b">
            {operacao ? 'trilha de auditoria desta farmácia' : 'acções da equipa sobre a ficha'}
          </span>
        </div>
        {res.historico.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Sem acções registadas</b>
              <span>Ainda não houve nenhuma acção da equipa sobre esta farmácia.</span>
            </div>
          </div>
        ) : (
          <div className="interno-box--pad">
            <div className="interno-audit">
              {res.historico.map((h) => {
                const chaves = new Set([
                  ...Object.keys(h.before || {}),
                  ...Object.keys(h.after || {}),
                ])
                return (
                  <div key={h.id} className="interno-audit-row">
                    <span className="interno-audit-when">{dataHora(h.quando)}</span>
                    <span className="interno-audit-actor">
                      {h.actorEmail || 'conta apagada'}
                      {h.actorRole ? ` · ${h.actorRole}` : ''}
                    </span>
                    <span className="interno-audit-action">{describeAction(h.action)}</span>
                    {h.reason && <span className="interno-audit-reason">{h.reason}</span>}
                    {chaves.size > 0 && (
                      <span className="interno-audit-diff">
                        {[...chaves].map((k) => (
                          <b key={k}>
                            {k}: {JSON.stringify(h.before?.[k] ?? null)} →{' '}
                            {JSON.stringify(h.after?.[k] ?? null)}
                          </b>
                        ))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
