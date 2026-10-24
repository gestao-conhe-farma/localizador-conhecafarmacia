import Link from 'next/link'
import AppHeader from '@/components/layout/AppHeader'
import AppFooter from '@/components/layout/AppFooter'
import HomeSearch from '@/components/home/HomeSearch'
import { getHomeSuggestions } from '@/lib/home-suggestions'
import {
  MEDICINE_CATEGORIES,
  PARAPHARMACY_TYPES,
  categoriaImagem,
  subcategoriasDe,
} from '@/lib/constants'

// A homepage deixou de ser a página de apresentação do projecto: esse
// conteúdo vive em /sobre. Aqui entra-se directo no Localizador — uma
// pergunta, a caixa, e o que as farmácias parceiras confirmaram.
// As sugestões vêm do stock real (lib/home-suggestions.js), por isso a
// página é renderizada por pedido; o cache de 10 minutos evita uma query
// por visita. Os ícones dos cards são linha simples na cor da marca, em
// public/categorias/ — um por área clínica e um por tipo de parafarmácia.

export const metadata = {
  title: 'Encontre o medicamento em Luanda e Ícolo e Bengo',
  description:
    'Pesquise o medicamento e veja em segundos quais as farmácias que o têm em stock, com confirmação das últimas 72 horas. Gratuito, sem vendas online.',
}

function plural(n, singular, plural_) {
  return `${n} ${n === 1 ? singular : plural_}`
}

export default async function Home() {
  const { categories, products, para } = await getHomeSuggestions()
  // Os cards são a taxonomia fixa: um stock que expira (72 h para
  // medicamentos) não pode fazer desaparecer a navegação da homepage. O
  // stock só decide a contagem que cada card mostra.
  const medicineLive = new Map(categories.map((c) => [c.id, c]))
  const paraLive = new Map(para.map((k) => [k.id, k]))

  return (
    <>
      <AppHeader />
      <main className="cf-shop">
        <section className="shop-hero home-hero">
          <div className="cf-wrap">
            <h1>O que está à procura?</h1>
            <HomeSearch />
          </div>
        </section>

        {categories.length > 0 && (
          <section className="sh-section">
            <div className="cf-wrap">
              <div className="home-head">
                <h2>Categorias</h2>
                <p>Medicamentos confirmados pelas farmácias parceiras, por área.</p>
              </div>
              <div className="home-row" role="list">
                {MEDICINE_CATEGORIES.map((c) => {
                  const live = medicineLive.get(c.id)
                  return (
                    <Link
                      key={c.id}
                      role="listitem"
                      className="home-card"
                      href={`/pesquisa?categoria=${c.id}`}
                    >
                      <span className="home-card-art">
                        <img
                          className="home-card-img"
                          src={categoriaImagem(c.id)}
                          alt=""
                          width={96}
                          height={96}
                          loading="lazy"
                        />
                      </span>
                      <b className="home-card-title">{c.label}</b>
                      <span className="home-card-meta">
                        {live
                          ? `${plural(live.products, 'produto', 'produtos')} · ${plural(
                              live.pharmacies,
                              'farmácia',
                              'farmácias',
                            )}`
                          : 'Sem stock confirmado agora'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {products.length > 0 && (
          <section className="sh-section">
            <div className="cf-wrap">
              <div className="home-head">
                <h2>Procurados agora</h2>
                <p>O que as farmácias confirmaram nas últimas horas.</p>
              </div>
              <div className="home-row home-row--mini" role="list">
                {products.map((p) => (
                  <Link
                    key={p.id}
                    role="listitem"
                    className="home-mini"
                    href={`/pesquisa?q=${encodeURIComponent(p.name)}`}
                  >
                    <b className="home-mini-title">{p.name}</b>
                    <span className="home-mini-meta">
                      {plural(p.pharmacies, 'farmácia', 'farmácias')}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="sh-section">
          <div className="cf-wrap">
            <div className="home-head">
              <h2>Parafarmácia</h2>
              <p>Bebé, higiene, beleza e outros cuidados — também confirmados.</p>
            </div>
            <div className="home-row" role="list">
              {PARAPHARMACY_TYPES.map((k) => {
                const live = paraLive.get(k.id)
                const subs = subcategoriasDe(k.id)
                return (
                  <Link
                    key={k.id}
                    role="listitem"
                    className="home-card"
                    href={`/pesquisa?tipo=${k.id}`}
                  >
                    <span className="home-card-art">
                      <img
                        className="home-card-img"
                        src={categoriaImagem(k.id)}
                        alt=""
                        width={96}
                        height={96}
                        loading="lazy"
                      />
                    </span>
                    <b className="home-card-title">{k.label}</b>
                    <span className="home-card-meta">
                      {live
                        ? `${plural(live.products, 'produto', 'produtos')} · ${plural(
                            live.pharmacies,
                            'farmácia',
                            'farmácias',
                          )}`
                        : 'Sem stock confirmado agora'}
                    </span>
                    {subs.length > 0 && (
                      <span className="home-card-subs">
                        {subs.map((s) => s.label).join(' · ')}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        <section className="sh-section">
          <div className="cf-wrap">
            <div className="home-strip">
              <div>
                <h2>Só o que a farmácia confirmou</h2>
                <p>
                  Medicamentos confirmados nas últimas 72 horas, parafarmácia nos últimos 30 dias.
                  Não vendemos medicamentos nem cobramos nada ao público.
                </p>
              </div>
              <div className="home-strip-links">
                <Link className="cf-btn cf-btn--ghost" href="/farmacia">
                  Farmácias da rede
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/sobre">
                  Sobre o projecto
                </Link>
                <Link className="cf-btn cf-btn--ghost" href="/farmacias/participar">
                  É farmácia?
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <AppFooter />
    </>
  )
}
