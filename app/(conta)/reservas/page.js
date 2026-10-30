import Link from 'next/link'
import { requireAccount } from '@/lib/account-session'
import { trackingUrl } from '@/lib/reservation-messages'
import { quantityDesc } from '@/lib/reservation-format'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'As minhas reservas — Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Estados como o cliente os lê — os mesmos rótulos do acompanhamento
 * público (components/reservation/ReservationStatus.jsx), para a pessoa não
 * ver dois nomes para a mesma coisa conforme o ecrã.
 */
const STATUS = {
  pendente: { label: 'Recebida', tone: 'pend', hint: 'A farmácia vai responder em até 72 horas.' },
  confirmada: { label: 'Confirmada', tone: 'ok', hint: 'A farmácia separou o produto para si.' },
  pronta: { label: 'Pronta a levantar', tone: 'ok', hint: 'Pode passar na farmácia.' },
  concluida: { label: 'Levantada', tone: 'muted', hint: 'Reserva concluída.' },
  recusada: { label: 'Não atendida', tone: 'bad', hint: 'A farmácia não conseguiu atender.' },
  expirada: { label: 'Expirada', tone: 'bad', hint: 'O prazo venceu sem resposta.' },
}

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('pt-PT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Luanda',
      })
    : ''

/**
 * Histórico de reservas da conta.
 *
 * A leitura é a policy `user_id = auth.uid()` (migração 0047) — a tabela
 * continua fechada ao público, e o acesso por token (/reserva/[id]?t=…)
 * não passa por aqui. Reservas feitas sem sessão não aparecem: não há como
 * provar que são desta pessoa, e o token é o único caminho para elas.
 */
export default async function ReservasPage() {
  const { supabase, user } = await requireAccount('/reservas')

  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, status, created_at, quantity, confirmed_quantity, requester_municipio, access_token, drugs(name, form, dosage), pharmacies(name, slug), stock_sale_options(unit, pack_size)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const reservations = data || []

  return (
    <main className="cf-shop conta-page">
      <header className="conta-page-head">
        <div>
          <p className="conta-kicker">A minha conta</p>
          <h1 className="conta-title">As minhas reservas</h1>
          <p className="conta-sub">
            O estado de cada reserva é atualizado pela farmácia. As reservas feitas sem conta
            continuam a acompanhar-se pelo link que a farmácia envia.
          </p>
        </div>
        {reservations.length > 0 && (
          <div className="conta-head-acts">
            <span className="conta-tag">
              {reservations.length === 1 ? '1 reserva' : `${reservations.length} reservas`}
            </span>
          </div>
        )}
      </header>

      {error ? (
        <div className="conta-alert conta-alert--bad" role="alert">
          Não foi possível abrir as reservas. Tente outra vez daqui a pouco. As reservas na farmácia
          não dependem desta página — se tem um link de acompanhamento, ele continua a funcionar.
        </div>
      ) : reservations.length === 0 ? (
        <section className="conta-panel">
          <div className="conta-empty">
            <p className="conta-empty-title">Ainda não fez reservas com esta conta</p>
            <p className="conta-empty-sub">
              Quando reservar um medicamento com sessão iniciada, ele fica aqui com o estado
              atualizado pela farmácia.
            </p>
            <p className="conta-empty-acts">
              <Link className="conta-btn conta-btn--primary" href="/pesquisa">
                Pesquisar medicamento
              </Link>
              <Link className="conta-btn conta-btn--ghost" href="/farmacia">
                Ver farmácias
              </Link>
            </p>
          </div>
        </section>
      ) : (
        <section className="conta-panel" aria-labelledby="conta-reservas">
          <div className="conta-panel-head">
            <h2 id="conta-reservas" className="conta-panel-title">
              Histórico
            </h2>
            <span className="conta-panel-count">{reservations.length}</span>
          </div>
          <ul className="conta-rows">
            {reservations.map((r) => {
              const status = STATUS[r.status] || { label: r.status, tone: 'muted', hint: '' }
              const drug = r.drugs?.name || 'Medicamento'
              const presentation = [r.drugs?.form, r.drugs?.dosage].filter(Boolean).join(' ')
              return (
                <li key={r.id} className="conta-row">
                  <div className="conta-row-main">
                    <span className={`acct-pill acct-pill--${status.tone}`}>{status.label}</span>
                    <span className="conta-row-title">
                      {drug}
                      {presentation && <span className="acct-row-pres"> · {presentation}</span>}
                    </span>
                    <span className="conta-row-meta">
                      {[
                        r.pharmacies?.name,
                        r.requester_municipio,
                        quantityDesc(r),
                        fmtDate(r.created_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {status.hint && <span className="conta-row-note">{status.hint}</span>}
                  </div>

                  <div className="conta-row-acts">
                    {r.access_token && (
                      <a
                        className="conta-btn conta-btn--ghost conta-btn--sm"
                        href={trackingUrl(r.id, r.access_token)}
                      >
                        Acompanhar
                      </a>
                    )}
                    {r.pharmacies?.slug && (
                      <Link
                        className="conta-btn conta-btn--ghost conta-btn--sm"
                        href={`/farmacia/${r.pharmacies.slug}`}
                      >
                        Ver farmácia
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
