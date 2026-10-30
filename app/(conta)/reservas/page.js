import Link from 'next/link'
import { requireAccount } from '@/lib/account-session'
import { trackingUrl } from '@/lib/reservation-messages'
import { quantityDesc } from '@/lib/reservation-format'
import { accountLang, accountLocale, accountT } from '@/lib/account-i18n'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'As minhas reservas — Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Estados como o cliente os lê — os mesmos rótulos do acompanhamento
 * público (components/reservation/ReservationStatus.jsx), para a pessoa não
 * ver dois nomes para a mesma coisa conforme o ecrã. O texto vem do
 * dicionário da conta, por isso segue o idioma escolhido.
 */
const TONS = {
  pendente: 'pend',
  confirmada: 'ok',
  pronta: 'ok',
  concluida: 'muted',
  recusada: 'bad',
  expirada: 'bad',
}

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
  const lang = accountLang(user)
  const t = accountT(lang)
  const locale = accountLocale(lang)

  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Africa/Luanda',
        })
      : ''

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
          <p className="conta-kicker">{t('nav.kicker')}</p>
          <h1 className="conta-title">{t('reservations.title')}</h1>
          <p className="conta-sub">{t('reservations.sub')}</p>
        </div>
        {reservations.length > 0 && (
          <div className="conta-head-acts">
            <span className="conta-tag">
              {t(reservations.length === 1 ? 'reservations.one' : 'reservations.many', {
                n: reservations.length,
              })}
            </span>
          </div>
        )}
      </header>

      {error ? (
        <div className="conta-alert conta-alert--bad" role="alert">
          {t('reservations.error')}
        </div>
      ) : reservations.length === 0 ? (
        <section className="conta-panel">
          <div className="conta-empty">
            <p className="conta-empty-title">{t('reservations.emptyTitle')}</p>
            <p className="conta-empty-sub">{t('reservations.emptySub')}</p>
            <p className="conta-empty-acts">
              <Link className="conta-btn conta-btn--primary" href="/pesquisa">
                {t('reservations.searchDrug')}
              </Link>
              <Link className="conta-btn conta-btn--ghost" href="/farmacia">
                {t('reservations.viewPharmacies')}
              </Link>
            </p>
          </div>
        </section>
      ) : (
        <section className="conta-panel" aria-labelledby="conta-reservas">
          <div className="conta-panel-head">
            <h2 id="conta-reservas" className="conta-panel-title">
              {t('reservations.history')}
            </h2>
            <span className="conta-panel-count">{reservations.length}</span>
          </div>
          <ul className="conta-rows">
            {reservations.map((r) => {
              const tone = TONS[r.status] || 'muted'
              // Estado desconhecido (novo no backoffice): mostra o slug em vez
              // de uma linha vazia.
              const label = t(`reservations.status.${r.status}.label`)
              const hint = t(`reservations.status.${r.status}.hint`)
              const statusLabel = label.startsWith('reservations.') ? r.status : label
              const statusHint = hint.startsWith('reservations.') ? '' : hint
              const drug = r.drugs?.name || t('reservations.drugFallback')
              const presentation = [r.drugs?.form, r.drugs?.dosage].filter(Boolean).join(' ')
              return (
                <li key={r.id} className="conta-row">
                  <div className="conta-row-main">
                    <span className={`acct-pill acct-pill--${tone}`}>{statusLabel}</span>
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
                    {statusHint && <span className="conta-row-note">{statusHint}</span>}
                  </div>

                  <div className="conta-row-acts">
                    {r.access_token && (
                      <a
                        className="conta-btn conta-btn--ghost conta-btn--sm"
                        href={trackingUrl(r.id, r.access_token)}
                      >
                        {t('reservations.track')}
                      </a>
                    )}
                    {r.pharmacies?.slug && (
                      <Link
                        className="conta-btn conta-btn--ghost conta-btn--sm"
                        href={`/farmacia/${r.pharmacies.slug}`}
                      >
                        {t('reservations.viewPharmacy')}
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
