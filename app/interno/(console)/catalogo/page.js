import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getCatalogueCoverage, getModelImageCoverage } from '@/lib/actions/platform-catalogue'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import CatalogueImages from '@/components/interno/CatalogueImages'
import ModelImagesPanel from '@/components/interno/ModelImagesPanel'
import { plural } from '@/lib/texto'

export const metadata = {
  title: 'Catálogo de imagens — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

const VISTAS = ['marcas', 'modelos']

/**
 * Catálogo de imagens em duas vistas.
 *
 * «Por marca» nasce do stock REAL das farmácias (`brand_image_coverage`): cada
 * linha é um par (medicamento, marca) que alguém vende. Sem marca não há
 * linha — e é isso que impede uma imagem de ibuprofeno de aparecer como se
 * fosse a caixa certa.
 *
 * «Por categoria» mostra as imagens-modelo genéricas — a embalagem que ocupa
 * o lugar da fotografia quando não há imagem real — e, sobretudo, quais os
 * ficheiros que ainda faltam criar em `public/produtos/`.
 */
export default async function CatalogoPage({ searchParams }) {
  const g = await requirePlatformPage('catalogue.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const params = await searchParams
  const rawVista = Array.isArray(params?.vista) ? params.vista[0] : params?.vista
  const vista = VISTAS.includes(rawVista) ? rawVista : 'marcas'

  const [res, modelos] = await Promise.all([getCatalogueCoverage(), getModelImageCoverage()])

  const sub =
    vista === 'modelos'
      ? 'As categorias de apresentação do produto: carregue a imagem-modelo de cada uma aqui e o Localizador usa-a em menos de um minuto. Enquanto uma imagem não existir, o cartão usa o recurso ao lado e nunca deixa um buraco.'
      : res.ok && (
          <>
            {plural(
              res.totais.marcas,
              'marca usada pelas farmácias',
              'marcas usadas pelas farmácias',
            )}
            {' · '}
            {plural(res.totais.comImagem, 'com imagem nossa', 'com imagem nossa')}
            {res.totais.semImagem > 0
              ? ` · ${plural(res.totais.semImagem, 'marca ainda sem imagem', 'marcas ainda sem imagem')}`
              : ''}
            . A imagem só se aplica quando o medicamento <b>e</b> a marca coincidem; a farmácia pode
            escolher a foto dela em vez da nossa.
          </>
        )

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Catálogo de imagens</h1>
          <p className="interno-sub">{sub}</p>
        </div>
      </div>

      <nav className="interno-viewtabs" aria-label="Vistas do catálogo">
        <Link
          href="/interno/catalogo"
          className={`interno-viewtab ${vista === 'marcas' ? 'interno-viewtab--active' : ''}`}
          aria-current={vista === 'marcas' ? 'page' : undefined}
        >
          Por marca
        </Link>
        <Link
          href="/interno/catalogo?vista=modelos"
          className={`interno-viewtab ${vista === 'modelos' ? 'interno-viewtab--active' : ''}`}
          aria-current={vista === 'modelos' ? 'page' : undefined}
        >
          Por categoria
        </Link>
      </nav>

      {vista === 'modelos' ? (
        modelos.ok ? (
          <ModelImagesPanel
            rows={modelos.rows}
            imagens={modelos.imagens}
            podeGerir={modelos.podeGerir}
          />
        ) : (
          <Falha
            titulo="Não foi possível ler as categorias das imagens-modelo"
            erro={modelos.error}
            detalhe={modelos.detail}
          />
        )
      ) : !res.ok ? (
        res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO' ? (
          <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
        ) : (
          <Falha titulo="Não foi possível ler o catálogo" erro={res.error} detalhe={res.detail} />
        )
      ) : (
        <CatalogueImages rows={res.rows} podeGerir={res.podeGerir} totais={res.totais} />
      )}
    </div>
  )
}
