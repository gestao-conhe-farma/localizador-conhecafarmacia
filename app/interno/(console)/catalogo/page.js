import { requirePlatformPage } from '@/lib/platform/session'
import { getCatalogueCoverage } from '@/lib/actions/platform-catalogue'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import CatalogueImages from '@/components/interno/CatalogueImages'
import { plural } from '@/lib/texto'

export const metadata = {
  title: 'Catálogo de imagens — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Catálogo de imagens por marca (0040).
 *
 * A lista nasce do stock REAL das farmácias (`brand_image_coverage`): cada
 * linha é um par (medicamento, marca) que alguém vende. Sem marca não há
 * linha — e é isso que impede uma imagem de ibuprofeno de aparecer como se
 * fosse a caixa certa.
 */
export default async function CatalogoPage() {
  const g = await requirePlatformPage('catalogue.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const res = await getCatalogueCoverage()

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Catálogo de imagens</h1>
            <p className="interno-sub">Imagens por medicamento e marca.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler o catálogo" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Catálogo de imagens</h1>
          <p className="interno-sub">
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
          </p>
        </div>
      </div>

      <CatalogueImages rows={res.rows} podeGerir={res.podeGerir} totais={res.totais} />
    </div>
  )
}
