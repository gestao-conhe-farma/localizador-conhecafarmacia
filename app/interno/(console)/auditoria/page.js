import Link from 'next/link'
import { requirePlatformPage } from '@/lib/platform/session'
import { getAuditLog } from '@/lib/actions/platform-audit'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import AuditTable from '@/components/interno/AuditTable'
import AuditExport from '@/components/interno/AuditExport'
import { plural } from '@/lib/texto'

export const metadata = {
  title: 'Auditoria — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Ecrã da trilha (Task 8.1).
 *
 * Os filtros são um formulário GET — sem estado de cliente, com o resultado
 * a poder ser guardado em marcador e enviado a um colega (a mesma decisão da
 * lista de farmácias). Toda a leitura passa por `getAuditLog`, que autoriza
 * por `audit.read`.
 *
 * O ecrã não oferece apagar, editar nem «limpar» a trilha: a tabela é
 * append-only e esta é a única vista que a mostra por inteiro. É por isso que
 * a exportação é a acção sensível daqui — levar dados para fora é o que fica
 * registado.
 */
const GRUPOS = {
  pharmacy: 'Farmácia',
  stock: 'Stock',
  account: 'Conta',
  plan: 'Plano',
  lead: 'Leads',
  audit: 'Auditoria',
  team: 'Equipa',
}

function agruparAcoes(acoes) {
  const mapa = new Map()
  for (const a of acoes) {
    const grupo = GRUPOS[a.chave.split('.')[0]] || 'Outras'
    if (!mapa.has(grupo)) mapa.set(grupo, [])
    mapa.get(grupo).push(a)
  }
  return [...mapa.entries()]
}

/** Link para uma página da trilha com os filtros actuais. */
function hrefCom(filtros, cursor) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v)
  if (cursor) qs.set('cursor', String(cursor))
  const s = qs.toString()
  return s ? `/interno/auditoria?${s}` : '/interno/auditoria'
}

export default async function AuditoriaPage({ searchParams }) {
  const g = await requirePlatformPage('audit.read')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const params = await searchParams
  const res = await getAuditLog({
    acao: params?.acao,
    nivel: params?.nivel,
    farmacia: params?.farmacia,
    actor: params?.actor,
    de: params?.de,
    ate: params?.ate,
    cursor: params?.cursor,
  })

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    // A trilha exige segundo factor (0052 + matriz). Em vez de uma tabela
    // vazia sem explicação, diz-se o que falta e onde se resolve.
    if (res.error === 'MFA_NECESSARIO') {
      return (
        <div className="interno-page">
          <div className="interno-head">
            <div>
              <h1 className="interno-title">Auditoria</h1>
              <p className="interno-sub">A trilha só é legível com o segundo factor confirmado.</p>
            </div>
          </div>
          <div className="interno-box interno-box--pad">
            <p className="interno-hint">
              Esta sessão entrou só com a palavra-passe. A leitura da trilha passou a exigir uma
              sessão <b>aal2</b> — o código do autenticador confirmado nesta sessão. Se já tem o
              autenticador ativo, termine a sessão e volte a entrar para introduzir o código.
            </p>
            <p className="interno-hint" style={{ marginTop: 12 }}>
              <Link href="/interno/mfa">Ver o estado do segundo factor</Link>
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Auditoria</h1>
            <p className="interno-sub">A trilha de tudo o que a equipa faz na plataforma.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler a trilha" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const { rows, total, temMais, proximoCursor, filtros, filtroActivo } = res
  // O cursor é `"<created_at>~<id>"` (ver `lerCursor`): basta saber se veio
  // algum para oferecer o regresso à primeira página.
  const emPaginaAnterior = Boolean(params?.cursor)

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Auditoria</h1>
          <p className="interno-sub">
            Quem fez o quê, quando, sobre que farmácia e porquê. A trilha é append-only: não há aqui
            editar nem apagar — só ler, filtrar e exportar (com registo do próprio export).
          </p>
        </div>
        <div className="interno-head-acts">
          <AuditExport filtros={filtros} pode={res.podeExportar} mfa2={res.mfa2} />
        </div>
      </div>

      <div className="interno-box">
        <form className="interno-filters" method="get">
          <label className="interno-filter">
            <span className="interno-filter-label">Acção</span>
            <select className="interno-select" name="acao" defaultValue={filtros.acao}>
              <option value="">Todas</option>
              {agruparAcoes(res.acoes).map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((a) => (
                    <option key={a.chave} value={a.chave}>
                      {a.rotulo} ({a.chave})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="interno-filter">
            <span className="interno-filter-label">Nível</span>
            <select className="interno-select" name="nivel" defaultValue={filtros.nivel}>
              <option value="">Todos</option>
              <option value="superadmin">Superadmin</option>
              <option value="onboarding">Onboarding</option>
              <option value="suporte">Suporte</option>
              <option value="faturacao">Facturação</option>
              <option value="auditoria">Auditoria</option>
              {/* Papel legado (0001): aparece na trilha como está na base,
                  e um filtro que não o conhecesse escondia registos reais. */}
              <option value="admin">admin (legado)</option>
            </select>
          </label>

          <label className="interno-filter">
            <span className="interno-filter-label">Farmácia</span>
            <select className="interno-select" name="farmacia" defaultValue={filtros.farmacia}>
              <option value="">Todas</option>
              {res.farmacias.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="interno-filter">
            <span className="interno-filter-label">Autor</span>
            <input
              className="interno-input"
              type="search"
              name="actor"
              defaultValue={filtros.actor}
              placeholder="e-mail, mesmo parcial"
            />
          </label>

          <label className="interno-filter">
            <span className="interno-filter-label">De</span>
            <input className="interno-input" type="date" name="de" defaultValue={filtros.de} />
          </label>

          <label className="interno-filter">
            <span className="interno-filter-label">Até</span>
            <input className="interno-input" type="date" name="ate" defaultValue={filtros.ate} />
          </label>

          <button type="submit" className="interno-btn interno-btn--ghost interno-btn--small">
            Filtrar
          </button>
          {filtroActivo && (
            <Link
              href="/interno/auditoria"
              className="interno-btn interno-btn--ghost interno-btn--small"
            >
              Limpar
            </Link>
          )}
        </form>
      </div>

      <div className="interno-box">
        <div className="interno-sec-head">
          <h2>{filtroActivo ? 'Trilha filtrada' : 'Trilha completa'}</h2>
          <span className="interno-sec-head-b">
            {plural(total, 'registo', 'registos')}
            {filtroActivo ? ' com estes filtros' : ''}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>{filtroActivo ? 'Nenhum registo com estes filtros' : 'A trilha está vazia'}</b>
              <span>
                {filtroActivo
                  ? 'Alargue o período ou tire um dos filtros — o que aqui aparece é o que a equipa fez, não o que o produto sonha.'
                  : 'Ainda não houve nenhuma acção da equipa. A primeira aparece aqui com actor, motivo e antes/depois.'}
              </span>
            </div>
          </div>
        ) : (
          <AuditTable rows={rows} />
        )}

        {(emPaginaAnterior || temMais) && (
          <div className="interno-filters">
            {emPaginaAnterior && (
              <Link
                href={hrefCom(filtros)}
                className="interno-btn interno-btn--ghost interno-btn--small"
              >
                ← Mais recentes
              </Link>
            )}
            {temMais && (
              <Link
                href={hrefCom(filtros, proximoCursor)}
                className="interno-btn interno-btn--ghost interno-btn--small"
              >
                Mais antigos →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
