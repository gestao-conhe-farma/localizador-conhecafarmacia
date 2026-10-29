import Link from 'next/link'
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
 * `user_id = auth.uid()` é a autoridade. O embed de `drugs`/`pharmacies`
 * pode vir nulo quando o catálogo desactivou o item; nesse caso a linha
 * mostra «já não disponível» em vez de desaparecer sem explicação (o
 * favorito continua a existir até a pessoa o remover).
 *
 * A apresentação é a do chassi comum: um painel por grupo, linhas
 * separadas por hairline. Os cartões grandes ficaram no passado — a lista
 * lê-se como uma tabela, que é o que ela é.
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
    <main className="cf-shop conta-page">
      <header className="conta-page-head">
        <div>
          <p className="conta-kicker">A minha conta</p>
          <h1 className="conta-title">Os meus guardados</h1>
          <p className="conta-sub">
            Os medicamentos e as farmácias que guardou. Ficam nesta conta, nos três sítios —
            Localizador, site e conta.
          </p>
        </div>
        {total > 0 && (
          <div className="conta-head-acts">
            <span className="conta-tag">{plural(total, 'item', 'itens')}</span>
          </div>
        )}
      </header>

      {error ? (
        <div className="conta-alert conta-alert--bad" role="alert">
          Não foi possível abrir os guardados. Tente outra vez daqui a pouco. Se continuar, a sua
          lista está segura — o problema é nosso, não dos itens que guardou.
        </div>
      ) : total === 0 ? (
        <section className="conta-panel">
          <div className="conta-empty">
            <p className="conta-empty-title">Ainda não guardou nada</p>
            <p className="conta-empty-sub">
              Guarde um medicamento para o encontrar depressa quando precisar, ou uma farmácia de
              confiança para voltar ao stock dela.
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
        <>
          {drugs.length > 0 && (
            <section className="conta-panel" aria-labelledby="conta-produtos">
              <div className="conta-panel-head">
                <h2 id="conta-produtos" className="conta-panel-title">
                  Produtos
                </h2>
                <span className="conta-panel-count">{drugs.length}</span>
              </div>
              <ul className="conta-rows">
                {drugs.map((f) => (
                  <FavoriteRow
                    key={f.id}
                    kind="drug"
                    id={f.drug_id}
                    title={f.drugs?.name || 'Produto já não disponível'}
                    kicker={f.drugs ? kindLabel(f.drugs.kind) : 'Fora do catálogo'}
                    meta={drugMeta(f.drugs)}
                    href={f.drugs ? `/pesquisa?q=${encodeURIComponent(f.drugs.name)}` : null}
                    cta="Ver onde está em stock"
                  />
                ))}
              </ul>
            </section>
          )}

          {pharmacies.length > 0 && (
            <section className="conta-panel" aria-labelledby="conta-farmacias">
              <div className="conta-panel-head">
                <h2 id="conta-farmacias" className="conta-panel-title">
                  Farmácias
                </h2>
                <span className="conta-panel-count">{pharmacies.length}</span>
              </div>
              <ul className="conta-rows">
                {pharmacies.map((f) => (
                  <FavoriteRow
                    key={f.id}
                    kind="pharmacy"
                    id={f.pharmacy_id}
                    title={f.pharmacies?.name || 'Farmácia já não disponível'}
                    kicker={f.pharmacies ? 'Farmácia parceira' : 'Fora do Localizador'}
                    meta={[f.pharmacies?.municipio, f.pharmacies?.verified ? 'Verificada' : null]
                      .filter(Boolean)
                      .join(' · ')}
                    href={f.pharmacies ? `/farmacia/${f.pharmacies.slug}` : null}
                    cta="Ver prateleira confirmada"
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

function FavoriteRow({ kind, id, title, kicker, meta, href, cta }) {
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
            Remover
          </button>
        </form>
      </div>
    </li>
  )
}
