import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { listPharmacies } from '@/lib/actions/platform-pharmacies'
import { PROVINCIAS } from '@/lib/constants'
import { PLAN_ORDER, planInfo } from '@/lib/plans'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import InternoKpis from '@/components/interno/Kpis'
import PharmacyTable from '@/components/interno/PharmacyTable'

export const metadata = {
  title: 'Farmácias — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

const ESTADOS = [
  { valor: 'ativa', rotulo: 'Activas' },
  { valor: 'inativa', rotulo: 'Inactivas' },
]

const SELOS = [
  { valor: 'com', rotulo: 'Com selo' },
  { valor: 'sem', rotulo: 'Sem selo' },
]

const STOCK = [
  { valor: 'fresco', rotulo: 'Confirmado nas últimas 72 h' },
  { valor: 'parado', rotulo: 'Parado há mais de 5 dias' },
]

/**
 * Lista de farmácias (Task 5.1).
 *
 * Os filtros são um formulário GET comum: sem estado de cliente, sem
 * JavaScript a mais, e com o resultado a poder ser guardado em marcador —
 * «a lista das farmácias sem stock fresco» é um link que se manda a um
 * colega. Os valores chegam por `searchParams` e são validados na acção
 * (um valor desconhecido simplesmente não filtra nada).
 *
 * Toda a leitura passa por `listPharmacies`, que autoriza e devolve só os
 * campos que o nível pode ver.
 */
export default async function FarmaciasPage({ searchParams }) {
  const g = await requirePlatformPage('pharmacy.view')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const params = await searchParams
  const filtros = {
    municipio: typeof params?.municipio === 'string' ? params.municipio : '',
    estado: typeof params?.estado === 'string' ? params.estado : '',
    selo: typeof params?.selo === 'string' ? params.selo : '',
    plano: typeof params?.plano === 'string' ? params.plano : '',
    stock: typeof params?.stock === 'string' ? params.stock : '',
  }
  const algumFiltro = Object.values(filtros).some(Boolean)

  const res = await listPharmacies(filtros)

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Farmácias</h1>
          <p className="interno-sub">
            O directório completo, com plano, contas e frescura do stock. Abra a ficha para editar,
            verificar ou desactivar — cada acção fica na trilha com o motivo.
          </p>
        </div>
        {/* Atalho para o trabalho do dia. Só aparece a quem pode VER stock:
            o `faturacao` não tem o campo no payload e o filtro devolver-lhe-ia
            uma lista vazia — parece avaria, é falta de âmbito. */}
        {res.ok && res.scope.operacao && (
          <div className="interno-head-acts">
            <Link href="/interno/farmacias?stock=parado" className="interno-btn interno-btn--ghost">
              Stock parado
            </Link>
          </div>
        )}
      </div>

      {!res.ok ? (
        <Falha titulo="Não foi possível ler as farmácias" erro={res.error} detalhe={res.detail} />
      ) : (
        <>
          {/* Os números primeiro, os controlos depois: quem abre a lista
              quer saber «quantas são» antes de escolher um filtro, e o
              cartão de filtros empurrava-os para fora do ecrã. */}
          <InternoKpis
            items={[
              {
                rotulo: 'Farmácias',
                valor: res.totais.total,
                nota: `${res.totais.activas} activas · ${res.totais.inativas} inactivas`,
              },
              {
                rotulo: 'Sem selo',
                valor: res.totais.semSelo,
                nota: 'dados por confirmar na ficha',
              },
              {
                rotulo: 'A mostrar',
                valor: res.rows.length,
                nota: algumFiltro ? 'com os filtros escolhidos' : 'sem filtros',
              },
            ]}
          />

          <div className="interno-box">
            <form className="interno-filters" method="get">
              <label className="interno-filter">
                <span className="interno-filter-label">Município</span>
                <select
                  className="interno-select"
                  name="municipio"
                  defaultValue={filtros.municipio}
                >
                  <option value="">Todos</option>
                  {PROVINCIAS.map((p) => (
                    <optgroup key={p.nome} label={p.nome}>
                      {p.municipios.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="interno-filter">
                <span className="interno-filter-label">Estado</span>
                <select className="interno-select" name="estado" defaultValue={filtros.estado}>
                  <option value="">Todas</option>
                  {ESTADOS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.rotulo}
                    </option>
                  ))}
                </select>
              </label>

              <label className="interno-filter">
                <span className="interno-filter-label">Selo</span>
                <select className="interno-select" name="selo" defaultValue={filtros.selo}>
                  <option value="">Todos</option>
                  {SELOS.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>

              <label className="interno-filter">
                <span className="interno-filter-label">Plano</span>
                <select className="interno-select" name="plano" defaultValue={filtros.plano}>
                  <option value="">Todos</option>
                  {PLAN_ORDER.map((codigo) => (
                    <option key={codigo} value={codigo}>
                      {planInfo(codigo).nome}
                    </option>
                  ))}
                  <option value="sem">Sem plano</option>
                </select>
              </label>

              {res.scope.operacao && (
                <label className="interno-filter">
                  <span className="interno-filter-label">Stock</span>
                  <select className="interno-select" name="stock" defaultValue={filtros.stock}>
                    <option value="">Todos</option>
                    {STOCK.map((s) => (
                      <option key={s.valor} value={s.valor}>
                        {s.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button type="submit" className="interno-btn interno-btn--ghost interno-btn--small">
                Filtrar
              </button>
              {algumFiltro && (
                <Link
                  href="/interno/farmacias"
                  className="interno-btn interno-btn--ghost interno-btn--small"
                >
                  Limpar
                </Link>
              )}
            </form>
          </div>

          <PharmacyTable rows={res.rows} scope={res.scope} />
        </>
      )}
    </div>
  )
}
