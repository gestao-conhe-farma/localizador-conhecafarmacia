import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import AccountNav from '@/components/conta/AccountNav'
import { requireAccount } from '@/lib/account-session'
import { toggleFavorito } from '@/lib/actions/account'
import { kindLabel } from '@/lib/product-utils'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Os meus guardados — Conheça Farmácia',
  robots: { index: false, follow: false },
}

const drugMeta = (drug) => [drug?.molecule, drug?.form, drug?.dosage].filter(Boolean).join(' · ')

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Guardados da conta: produtos (catálogo) e farmácias.
 *
 * Lê `localizador.favorites` com o cliente de sessão — a policy
 * `user_id = auth.uid()` é a autoridade, aqui não há filtro a fingir. O
 * embed de `drugs`/`pharmacies` pode vir nulo quando o catálogo desactivou
 * o item; nesse caso o cartão mostra «já não disponível» em vez de
 * desaparecer sem explicação (o favorito continua a existir até a pessoa o
 * remover).
 */
export default async function GuardadosPage() {
  const { supabase, user } = await requireAccount('/guardados')

  const { data, error } = await supabase
    .from('favorites')
    .select(
      'id, created_at, drug_id, pharmacy_id, drugs(id, name, molecule, form, dosage, kind, active), pharmacies(id, slug, name, municipio, verified, active)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const favorites = data || []
  const drugs = favorites.filter((f) => f.drug_id)
  const pharmacies = favorites.filter((f) => f.pharmacy_id)
  const total = favorites.length

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <div className="cf-wrap acct-wrap">
          <AccountNav active="guardados" />

          <div className="sh-bar">
            <div className="sh-bar-l">
              <h1 className="acct-title">Os meus guardados</h1>
              {total > 0 && <span className="sh-bar-sub">{plural(total, 'item', 'itens')}</span>}
            </div>
          </div>

          {error ? (
            <div className="sh-empty">
              <p className="sh-empty-title">Não foi possível abrir os guardados</p>
              <p className="sh-empty-sub">
                Tente outra vez daqui a pouco. Se continuar, a sua lista está segura — o problema é
                nosso, não dos itens que guardou.
              </p>
            </div>
          ) : total === 0 ? (
            <div className="sh-empty">
              <p className="sh-empty-title">Ainda não guardou nada</p>
              <p className="sh-empty-sub">
                Guarde um medicamento para o encontrar depressa quando precisar, ou uma farmácia de
                confiança para voltar ao stock dela. Fica tudo nesta conta, nos dois sites.
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
            <>
              {drugs.length > 0 && (
                <section className="acct-sec" aria-labelledby="acct-produtos">
                  <h2 id="acct-produtos" className="acct-sec-title">
                    Produtos <span className="acct-sec-count">{drugs.length}</span>
                  </h2>
                  <div className="acct-grid">
                    {drugs.map((f) => (
                      <FavoriteCard
                        key={f.id}
                        kind="drug"
                        id={f.drug_id}
                        title={f.drugs?.name || 'Produto já não disponível'}
                        kicker={f.drugs ? kindLabel(f.drugs.kind) : 'Fora do catálogo'}
                        meta={drugMeta(f.drugs)}
                        href={f.drugs ? `/pesquisa?q=${encodeURIComponent(f.drugs.name)}` : null}
                        note="Ver onde está em stock"
                      />
                    ))}
                  </div>
                </section>
              )}

              {pharmacies.length > 0 && (
                <section className="acct-sec" aria-labelledby="acct-farmacias">
                  <h2 id="acct-farmacias" className="acct-sec-title">
                    Farmácias <span className="acct-sec-count">{pharmacies.length}</span>
                  </h2>
                  <div className="acct-grid">
                    {pharmacies.map((f) => (
                      <FavoriteCard
                        key={f.id}
                        kind="pharmacy"
                        id={f.pharmacy_id}
                        title={f.pharmacies?.name || 'Farmácia já não disponível'}
                        kicker={f.pharmacies ? 'Farmácia parceira' : 'Fora do Localizador'}
                        meta={[
                          f.pharmacies?.municipio,
                          f.pharmacies?.verified ? 'Verificada' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        href={f.pharmacies ? `/farmacia/${f.pharmacies.slug}` : null}
                        note="Ver prateleira confirmada"
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <AppFooter />
    </>
  )
}

function FavoriteCard({ kind, id, title, kicker, meta, href, note }) {
  return (
    <article className="acct-card">
      <div className="acct-card-body">
        <span className="acct-card-kicker">{kicker}</span>
        {href ? (
          <Link className="acct-card-title" href={href}>
            {title}
          </Link>
        ) : (
          <span className="acct-card-title">{title}</span>
        )}
        {meta && <span className="acct-card-meta">{meta}</span>}
        {href && <span className="acct-card-note">{note}</span>}
      </div>

      <form action={toggleFavorito} className="acct-card-foot">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <button className="acct-remove" type="submit">
          Remover
        </button>
      </form>
    </article>
  )
}
