import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getSubscriptions, getPlanHistory } from '@/lib/actions/platform-plans'
import { describeAction } from '@/lib/platform/permissions'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import InternoKpis from '@/components/interno/Kpis'
import {
  dataHora,
  haQuanto,
  pillActiva,
  pillPlano,
  prazo,
  textoPlano,
} from '@/components/interno/formatos'

export const metadata = {
  title: 'Planos — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Ecrã dos planos (Task 7.2 Step 1).
 *
 * Não é uma lista de planos — o catálogo está na ficha de cada farmácia e no
 * ecrã do primeiro plano. Aqui está o ESTADO de todas: quem ainda não tem
 * plano (o trabalho por fazer), quem está em experiência ou graça e até
 * quando, quem está suspenso por pagamento, e o que a equipa andou a mudar.
 *
 * A ordem da tabela é por urgência e não por alfabeto: prazos a expirar em
 * primeiro (é o que decide uma conversa de cobrança), depois os estados que
 * pedem decisão (experiência, graça, suspensão) e só no fim o resto. Uma
 * lista alfabética enterra o que precisa de atenção no meio de nove linhas
 * iguais.
 */
const ORDEM_ESTADO = { trial: 0, graca: 1, suspenso: 2, cancelado: 3, activo: 4 }

function chave(r) {
  // Prazo terminado é o mais urgente: já mexeu no que a farmácia tem, e é
  // uma conversa de cobrança que está atrasada. Depois o que vai terminar.
  const urgente = r.plano.expirado ? 0 : r.plano.aExpirar ? 1 : 2
  const estado = r.plano.status ? (ORDEM_ESTADO[r.plano.status] ?? 9) : 9
  const dias = r.plano.diasParaFim === null ? 9999 : r.plano.diasParaFim
  return [urgente, estado, dias, r.name.toLowerCase()]
}

function ordenar(a, b) {
  const ka = chave(a)
  const kb = chave(b)
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] < kb[i]) return -1
    if (ka[i] > kb[i]) return 1
  }
  return 0
}

/**
 * O antes/depois da trilha, só com o que mudou e um campo por linha.
 *
 * Listar as chaves de `before`+`after` mostrava também o que NÃO mudou
 * («estado: "activo" → "activo"», em todas as mudanças de plano) e juntava
 * dois campos sem separador nenhum («… → "activo"graça_ate: …»), que é
 * exactamente como não se lê um diff. `null` imprime-se como `null` porque
 * também é informação: é a diferença entre «não havia prazo» e «o prazo foi
 * limpo».
 */
function diffPlano(before, after) {
  const b = before || {}
  const a = after || {}
  const valor = (v) => (v === undefined || v === null ? 'null' : JSON.stringify(v))
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((campo) => valor(b[campo]) !== valor(a[campo]))
    .map((campo) => ({ campo, antes: valor(b[campo]), depois: valor(a[campo]) }))
}

export default async function PlanosPage() {
  const g = await requirePlatformPage('plan.change')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const [subs, historico] = await Promise.all([getSubscriptions(), getPlanHistory(null, 15)])

  if (!subs.ok) {
    // Uma recusa da matriz explica-se com o ecrã de permissão; «recarregue e
    // tente de novo» só faz sentido para uma falha a sério.
    if (subs.error === 'SEM_PERMISSAO' || subs.error === 'SEM_SESSAO') {
      return <SemPermissao acao={subs.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Planos</h1>
            <p className="interno-sub">
              Estado do plano de cada farmácia e o que precisa de decisão.
            </p>
          </div>
        </div>
        <Falha
          titulo="Não foi possível ler as subscrições"
          erro={subs.error}
          detalhe={subs.detail}
        />
      </div>
    )
  }

  const { rows, totais, podeAtribuir } = subs
  const semPlano = rows.filter((r) => !r.plano.temPlano)
  const comPlano = rows.filter((r) => r.plano.temPlano).sort(ordenar)
  const nomePorId = new Map(rows.map((r) => [r.id, r.name]))

  // A soma dos seis primeiros é o total de farmácias: cada uma está num
  // estado só (um prazo vencido não conta como «em experiência» — a
  // farmácia já está no plano de entrada).
  const kpis = [
    {
      rotulo: 'Por atribuir',
      valor: totais.semPlano,
      nota: 'sem plano — a primeira coisa a fazer',
    },
    { rotulo: 'Em experiência', valor: totais.trial, nota: 'a correr, dentro do prazo' },
    { rotulo: 'Em graça', valor: totais.graca, nota: 'pagamento atrasado, nada cortado' },
    {
      rotulo: 'Prazos terminados',
      valor: totais.vencidos,
      nota: 'experiência ou graça fora do prazo — já no plano de entrada',
    },
    { rotulo: 'Suspensos', valor: totais.suspensos, nota: 'por pagamento — plano de entrada' },
    { rotulo: 'Activos', valor: totais.activos, nota: 'plano em vigor, sem prazos' },
    {
      rotulo: 'Prazos a expirar',
      valor: totais.aExpirar,
      nota: 'experiência ou graça a acabar nos próximos 7 dias',
    },
  ]

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Planos</h1>
          <p className="interno-sub">
            Quem tem plano, em que ponto do ciclo está e até quando. As acções ficam na ficha da
            farmácia — cada uma com motivo e antes/depois na trilha.
          </p>
        </div>
        <div className="interno-head-acts">
          <Link href="/interno/farmacias" className="interno-btn interno-btn--ghost">
            Ver farmácias
          </Link>
        </div>
      </div>

      <InternoKpis items={kpis} />

      {/* ---- Por atribuir: o primeiro plano das farmácias recém-criadas ---- */}
      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Primeiro plano por atribuir</h2>
          <span className="interno-sec-head-b">{semPlano.length}</span>
        </div>
        {semPlano.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Todas as farmácias têm plano</b>
              <span>
                Quando uma farmácia nova for criada, aparece aqui até alguém lhe atribuir o primeiro
                plano — em experiência ou activo.
              </span>
            </div>
          </div>
        ) : (
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Farmácia</th>
                  <th>Município</th>
                  <th>Estado</th>
                  <th>Criada</th>
                  <th aria-label="Atribuir" />
                </tr>
              </thead>
              <tbody>
                {semPlano.map((r) => (
                  <tr key={r.id}>
                    <td data-rotulo="Farmácia">
                      <Link href={`/interno/farmacias/${r.id}`} className="interno-table-link">
                        {r.name}
                      </Link>
                      <span className="interno-foot-sub">{r.slug}</span>
                    </td>
                    <td data-rotulo="Município">{r.municipio || '—'}</td>
                    <td data-rotulo="Estado">
                      <span className={pillActiva(r.active)}>
                        {r.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td data-rotulo="Criada">
                      {haQuanto(r.criadaEm) || '—'}
                      <span className="interno-foot-sub"> sem plano desde então</span>
                    </td>
                    <td data-rotulo="Atribuir">
                      {podeAtribuir ? (
                        <Link
                          href={`/interno/planos/primeiro-plano/${r.id}`}
                          className="interno-btn interno-btn--primary interno-btn--small"
                        >
                          Atribuir o primeiro plano
                        </Link>
                      ) : (
                        <span className="interno-foot-sub">sem permissão para atribuir</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Subscrições ---- */}
      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Subscrições</h2>
          <span className="interno-sec-head-b">
            {comPlano.length} de {totais.total}
          </span>
        </div>
        {comPlano.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Nenhuma farmácia tem plano</b>
              <span>Atribua o primeiro plano na secção acima.</span>
            </div>
          </div>
        ) : (
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Farmácia</th>
                  <th>Plano</th>
                  <th>Estado</th>
                  <th>Prazo</th>
                  <th>Notas internas</th>
                  <th>Alterado</th>
                  <th aria-label="Abrir" />
                </tr>
              </thead>
              <tbody>
                {comPlano.map((r) => (
                  <tr key={r.id}>
                    <td data-rotulo="Farmácia">
                      <Link href={`/interno/farmacias/${r.id}`} className="interno-table-link">
                        {r.name}
                      </Link>
                      <span className="interno-foot-sub">
                        {r.municipio || '—'}
                        {r.active ? '' : ' · inactiva'}
                      </span>
                    </td>
                    <td data-rotulo="Plano">
                      <span className={pillPlano(r.plano)}>{textoPlano(r.plano)}</span>
                    </td>
                    <td data-rotulo="Estado">
                      {r.plano.statusLabel}
                      {r.plano.emVigor && r.plano.emVigor !== r.plano.planCode && (
                        <span className="interno-foot-sub"> em vigor: {r.plano.emVigorNome}</span>
                      )}
                    </td>
                    <td data-rotulo="Prazo">
                      {r.plano.fimEm ? (
                        <>
                          {prazo(r.plano.fimEm)}
                          {r.plano.expirado && (
                            <>
                              {' '}
                              <span className="interno-pill interno-pill--warn">terminado</span>
                            </>
                          )}
                          {r.plano.aExpirar && (
                            <>
                              {' '}
                              <span className="interno-pill interno-pill--warn">a expirar</span>
                            </>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-rotulo="Notas internas">
                      {r.notas ? (
                        <span className="interno-foot-sub" title={r.notas}>
                          {r.notas.length > 70 ? `${r.notas.slice(0, 70)}…` : r.notas}
                        </span>
                      ) : (
                        <span className="interno-foot-sub">—</span>
                      )}
                    </td>
                    <td data-rotulo="Alterado">
                      {r.plano.updatedAt ? (
                        <>
                          {dataHora(r.plano.updatedAt)}
                          <span className="interno-foot-sub"> {haQuanto(r.plano.updatedAt)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-rotulo="Abrir">
                      <Link
                        href={`/interno/farmacias/${r.id}`}
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

      {/* ---- Últimas alterações de plano (trilha `plan.*`) ---- */}
      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>Últimas alterações de plano</h2>
          <span className="interno-sec-head-b">trilha de auditoria</span>
        </div>
        {!historico.ok ? (
          <div className="interno-box--pad">
            <Falha
              titulo="Não foi possível ler o histórico"
              erro={historico.error}
              detalhe={historico.detail}
            />
          </div>
        ) : historico.rows.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Sem alterações registadas</b>
              <span>Ainda ninguém atribuiu nem mudou planos.</span>
            </div>
          </div>
        ) : (
          <div className="interno-box--pad">
            <div className="interno-audit">
              {historico.rows.map((h) => {
                const mudancas = diffPlano(h.before, h.after)
                return (
                  <div key={h.id} className="interno-audit-row">
                    <span className="interno-audit-when">{dataHora(h.quando)}</span>
                    <span className="interno-audit-actor">
                      {h.actorEmail || 'conta apagada'}
                      {h.actorRole ? ` · ${h.actorRole}` : ''}
                    </span>
                    <span className="interno-audit-action">
                      {describeAction(h.action)}
                      {h.pharmacyId && nomePorId.get(h.pharmacyId)
                        ? ` — ${nomePorId.get(h.pharmacyId)}`
                        : ''}
                    </span>
                    {h.reason && <span className="interno-audit-reason">{h.reason}</span>}
                    {mudancas.length > 0 && (
                      <span className="interno-audit-diff">
                        {mudancas.map((m) => (
                          <b key={m.campo}>
                            {m.campo}: {m.antes} → {m.depois}
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
