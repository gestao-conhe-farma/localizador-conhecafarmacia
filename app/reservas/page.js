import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import AccountNav from '@/components/conta/AccountNav'
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
      'id, status, created_at, quantity, confirmed_quantity, access_token, drugs(name, form, dosage), pharmacies(name, slug), stock_sale_options(unit, pack_size)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const reservations = data || []

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap acct-wrap">
          <AccountNav active="reservas" />

          <div className="sh-bar">
            <div className="sh-bar-l">
              <h1 className="acct-title">As minhas reservas</h1>
              {reservations.length > 0 && (
                <span className="sh-bar-sub">
                  {reservations.length === 1 ? '1 reserva' : `${reservations.length} reservas`}
                </span>
              )}
            </div>
          </div>

          {error ? (
            <div className="sh-empty">
              <p className="sh-empty-title">Não foi possível abrir as reservas</p>
              <p className="sh-empty-sub">
                Tente outra vez daqui a pouco. As reservas na farmácia não dependem desta página —
                se tem um link de acompanhamento, ele continua a funcionar.
              </p>
            </div>
          ) : reservations.length === 0 ? (
            <div className="sh-empty">
              <p className="sh-empty-title">Ainda não fez reservas com esta conta</p>
              <p className="sh-empty-sub">
                Quando reservar um medicamento com sessão iniciada, ele fica aqui com o estado
                atualizado pela farmácia. Reservas feitas sem conta continuam a acompanhar-se pelo
                link que a farmácia envia.
              </p>
              <p className="acct-empty-acts">
                <Link className="cf-btn cf-btn--primary" href="/pesquisa">
                  Pesquisar medicamento
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Ver farmácias
                </Link>
              </p>
            </div>
          ) : (
            <ul className="acct-rows">
              {reservations.map((r) => {
                const status = STATUS[r.status] || { label: r.status, tone: 'muted', hint: '' }
                const drug = r.drugs?.name || 'Medicamento'
                const presentation = [r.drugs?.form, r.drugs?.dosage].filter(Boolean).join(' ')
                return (
                  <li key={r.id} className="acct-row">
                    <div className="acct-row-main">
                      <span className={`acct-pill acct-pill--${status.tone}`}>{status.label}</span>
                      <span className="acct-row-title">
                        {drug}
                        {presentation && <span className="acct-row-pres"> · {presentation}</span>}
                      </span>
                      <span className="acct-row-meta">
                        {[r.pharmacies?.name, quantityDesc(r), fmtDate(r.created_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {status.hint && <span className="acct-row-hint">{status.hint}</span>}
                    </div>

                    <div className="acct-row-acts">
                      {r.access_token && (
                        <a
                          className="cf-btn cf-btn--ghost cf-btn--sm"
                          href={trackingUrl(r.id, r.access_token)}
                        >
                          Acompanhar
                        </a>
                      )}
                      {r.pharmacies?.slug && (
                        <Link
                          className="cf-btn cf-btn--quiet cf-btn--sm"
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
          )}
        </div>
      </main>
      <AppFooter />
    </>
  )
}
