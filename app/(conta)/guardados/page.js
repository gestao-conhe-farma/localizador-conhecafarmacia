import Link from 'next/link'
import { requireAccount } from '@/lib/account-session'
import { toggleFavorito } from '@/lib/actions/account'
import { kindLabel } from '@/lib/product-utils'
import { accountLang, accountT } from '@/lib/account-i18n'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Os meus guardados — Conheça Farmácia',
  robots: { index: false, follow: false },
}

const drugMeta = (drug) => [drug?.molecule, drug?.form, drug?.dosage].filter(Boolean).join(' · ')

/**
 * Guardados da conta: produtos (catálogo) e farmácias.
 *
 * Lê `localizador.favorites` com o cliente de sessão — a policy
 * `user_id = auth.uid()` é a autoridade. O embed de `drugs`/`pharmacies`
 * pode vir nulo quando o catálogo desactivou o item; nesse caso a linha
 * mostra «já não disponível» em vez de desaparecer sem explicação (o
 * favorito continua a existir até a pessoa o remover).
 *
 * A apresentação é a do chassi comum: um painel por grupo, linhas
 * separadas por hairline. Os cartões grandes ficaram no passado — a lista
 * lê-se como uma tabela, que é o que ela é.
 *
 * O idioma vem da preferência da conta (`lib/account-i18n`), a mesma que o
 * site e o perfil gravam — o Localizador não tem `[lang]` no URL.
 */
export default async function GuardadosPage() {
  const { supabase, user } = await requireAccount('/guardados')
  const t = accountT(accountLang(user))

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
    <main className="cf-shop conta-page">
      <header className="conta-page-head">
        <div>
          <p className="conta-kicker">{t('nav.kicker')}</p>
          <h1 className="conta-title">{t('saved.title')}</h1>
          <p className="conta-sub">{t('saved.sub')}</p>
        </div>
        {total > 0 && (
          <div className="conta-head-acts">
            <span className="conta-tag">
              {t(total === 1 ? 'saved.itemsOne' : 'saved.itemsMany', { n: total })}
            </span>
          </div>
        )}
      </header>

      {error ? (
        <div className="conta-alert conta-alert--bad" role="alert">
          {t('saved.error')}
        </div>
      ) : total === 0 ? (
        <section className="conta-panel">
          <div className="conta-empty">
            <p className="conta-empty-title">{t('saved.emptyTitle')}</p>
            <p className="conta-empty-sub">{t('saved.emptySub')}</p>
            <p className="conta-empty-acts">
              <Link className="conta-btn conta-btn--primary" href="/pesquisa">
                {t('saved.searchDrug')}
              </Link>
              <Link className="conta-btn conta-btn--ghost" href="/farmacia">
                {t('saved.viewPharmacies')}
              </Link>
            </p>
          </div>
        </section>
      ) : (
        <>
          {drugs.length > 0 && (
            <section className="conta-panel" aria-labelledby="conta-produtos">
              <div className="conta-panel-head">
                <h2 id="conta-produtos" className="conta-panel-title">
                  {t('saved.products')}
                </h2>
                <span className="conta-panel-count">{drugs.length}</span>
              </div>
              <ul className="conta-rows">
                {drugs.map((f) => (
                  <FavoriteRow
                    key={f.id}
                    kind="drug"
                    id={f.drug_id}
                    title={f.drugs?.name || t('saved.unavailableProduct')}
                    kicker={f.drugs ? kindLabel(f.drugs.kind) : t('saved.outOfCatalog')}
                    meta={drugMeta(f.drugs)}
                    href={f.drugs ? `/pesquisa?q=${encodeURIComponent(f.drugs.name)}` : null}
                    cta={t('saved.stockCta')}
                    removeLabel={t('saved.remove')}
                  />
                ))}
              </ul>
            </section>
          )}

          {pharmacies.length > 0 && (
            <section className="conta-panel" aria-labelledby="conta-farmacias">
              <div className="conta-panel-head">
                <h2 id="conta-farmacias" className="conta-panel-title">
                  {t('saved.pharmacies')}
                </h2>
                <span className="conta-panel-count">{pharmacies.length}</span>
              </div>
              <ul className="conta-rows">
                {pharmacies.map((f) => (
                  <FavoriteRow
                    key={f.id}
                    kind="pharmacy"
                    id={f.pharmacy_id}
                    title={f.pharmacies?.name || t('saved.unavailablePharmacy')}
                    kicker={f.pharmacies ? t('saved.partner') : t('saved.outsideLocator')}
                    meta={[
                      f.pharmacies?.municipio,
                      f.pharmacies?.verified ? t('saved.verified') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    href={f.pharmacies ? `/farmacia/${f.pharmacies.slug}` : null}
                    cta={t('saved.shelfCta')}
                    removeLabel={t('saved.remove')}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function FavoriteRow({ kind, id, title, kicker, meta, href, cta, removeLabel }) {
  return (
    <li className="conta-row">
      <div className="conta-row-main">
        <span className="conta-row-kicker">{kicker}</span>
        {href ? (
          <Link className="conta-row-title" href={href}>
            {title}
          </Link>
        ) : (
          <span className="conta-row-title">{title}</span>
        )}
        {meta && <span className="conta-row-meta">{meta}</span>}
      </div>

      <div className="conta-row-acts">
        {href && (
          <Link className="conta-btn conta-btn--ghost conta-btn--sm" href={href}>
            {cta}
          </Link>
        )}
        <form action={toggleFavorito}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <button className="conta-remove" type="submit">
            {removeLabel}
          </button>
        </form>
      </div>
    </li>
  )
}
