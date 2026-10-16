'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMyMovements } from '@/lib/actions/pharmacy-portal'

/**
 * Histórico de movimentos (`stock_movements`, migração 0020) — a página
 * /portal/movimentos.
 *
 * É o livro-razão da farmácia: cada entrada, venda, ajuste, importação,
 * quebra e retirada, com autor, motivo e saldo antes/depois. Só se lê —
 * o ledger é append-only por desenho (correcções = movimentos novos).
 *
 * A lista é paginada por «Carregar mais» (o servidor devolve 60 de cada
 * vez): o histórico de uma farmácia cresce todos os dias e a página
 * nunca deve trazer tudo.
 */

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  MIGRACOES_EM_FALTA: 'O histórico ainda não está disponível nesta base de dados.',
  FALHA_CARREGAR: 'Não foi possível carregar o histórico. Tente novamente.',
  // O plano pode mudar com a página já aberta (o servidor recusa sempre).
  PLANO_INSUFICIENTE:
    'Esta função faz parte de um plano superior ao da farmácia. Fale com a equipa da Conheça Farmácia para tratar do plano — o que já está configurado continua a funcionar.',
}

const WINDOWS = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
  { id: 365, label: '1 ano' },
]

const TIPOS = [
  { id: null, label: 'Tudo' },
  { id: 'entrada', label: 'Entradas' },
  { id: 'venda', label: 'Vendas' },
  { id: 'ajuste', label: 'Ajustes' },
  { id: 'saida', label: 'Saídas' },
  { id: 'importacao', label: 'Importações' },
  { id: 'reserva', label: 'Reservas' },
]

/** Rótulo e tom de cada tipo do livro-razão. */
const META = {
  entrada: { label: 'Entrada', badge: 'portal-badge--ok' },
  venda: { label: 'Venda', badge: 'portal-badge--info' },
  ajuste: { label: 'Ajuste', badge: 'portal-badge--warn' },
  saida: { label: 'Saída', badge: 'portal-badge--warn' },
  expiracao: { label: 'Expirou', badge: 'portal-badge--off' },
  devolucao: { label: 'Devolução', badge: 'portal-badge--off' },
  importacao: { label: 'Importação', badge: 'portal-badge--info' },
  saldo_inicial: { label: 'Saldo inicial', badge: 'portal-badge--off' },
  reserva: { label: 'Reserva', badge: 'portal-badge--off' },
  retirada: { label: 'Retirada', badge: 'portal-badge--off' },
  restauro: { label: 'Restauro', badge: 'portal-badge--ok' },
}

const FONTES = {
  portal: 'portal',
  csv: 'importação CSV',
  api: 'sincronização automática',
  team: 'equipa Conheça Farmácia',
  sistema: 'corte inicial',
}

function quando(iso) {
  const t = new Date(iso).getTime()
  if (!t) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  if (s < 7 * 86400) return `há ${Math.round(s / 86400)} d`
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
}

const nInt = (v) => new Intl.NumberFormat('pt-PT').format(Number(v) || 0)

export default function MovementsPanel() {
  const [days, setDays] = useState(30)
  const [tipo, setTipo] = useState(null)
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)

  const carregar = useCallback(
    async ({ append = false } = {}) => {
      if (append) setMore(true)
      else setLoading(true)
      const res = await getMyMovements({
        days,
        type: tipo,
        q: q.trim() || null,
        limit: 60,
        offset: append ? rows.length : 0,
      })
      if (res.ok) {
        setData(res)
        setRows((prev) => (append ? [...prev, ...res.movements] : res.movements))
      } else {
        setData(res)
        if (!append) setRows([])
      }
      setLoading(false)
      setMore(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, tipo, q],
  )

  // Recarrega do zero quando muda o filtro; a pesquisa tem um atraso
  // curto para não disparar um pedido por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => carregar(), q ? 350 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, tipo, q])

  const s = data?.summary
  const total = data?.total ?? 0
  const podeMais = rows.length > 0 && rows.length < total

  return (
    <section className="portal-section">
      <header className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Movimentos</h1>
          <p className="portal-page-sub">
            O livro de stock da farmácia: cada entrada, venda, ajuste e importação — com autor,
            motivo e saldo antes/depois. Só se acrescenta: uma correcção é um movimento novo.
          </p>
        </div>
        <div className="portal-page-head-acts">
          <div className="portal-chips" role="group" aria-label="Escolher período">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`portal-chip${days === w.id ? ' portal-chip--active' : ''}`}
                aria-pressed={days === w.id}
                onClick={() => setDays(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {s && (
        <div className="portal-kpis portal-kpis--3">
          <div className="portal-kpi">
            <div className="portal-kpi-top">
              <span className="portal-kpi-k">Unidades que entraram</span>
            </div>
            <span className="portal-kpi-n">{nInt(s.entradas)}</span>
            <span className="portal-kpi-s">entradas e importações no período</span>
          </div>
          <div className="portal-kpi">
            <div className="portal-kpi-top">
              <span className="portal-kpi-k">Unidades que saíram</span>
            </div>
            <span className="portal-kpi-n">{nInt(s.saidas)}</span>
            <span className="portal-kpi-s">vendas, ajustes e saídas</span>
          </div>
          <div className="portal-kpi">
            <div className="portal-kpi-top">
              <span className="portal-kpi-k">Vendas registadas</span>
            </div>
            <span className="portal-kpi-n">{nInt(s.vendas)}</span>
            <span className="portal-kpi-s">
              {nInt(s.ajustes)} ajustes · {nInt(s.reservas)} eventos de reserva
            </span>
          </div>
        </div>
      )}

      {/* O corte inicial não é mercadoria recebida — fica como nota, para
          os números de cima baterem certo com o que a farmácia viveu. */}
      {s && s.corte > 0 && (
        <p className="portal-foot-note">
          O livro começa com o saldo do corte inicial ({nInt(s.corte)} unidades que já estavam em
          stock) — não conta como entrada de mercadoria.
        </p>
      )}

      <div className="portal-toolbar">
        <div className="portal-chips" role="group" aria-label="Filtrar por tipo">
          {TIPOS.map((t) => (
            <button
              key={String(t.id)}
              type="button"
              className={`portal-chip${tipo === t.id ? ' portal-chip--active' : ''}`}
              aria-pressed={tipo === t.id}
              onClick={() => setTipo(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="portal-sec-tools">
          <input
            className="portal-input portal-sec-search"
            type="search"
            placeholder="Pesquisar medicamento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Pesquisar movimentos por medicamento"
          />
        </div>
      </div>

      {loading && (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      )}

      {!loading && data && !data.ok && (
        <div className="empty-state">
          <p className="empty-sub">{ERRORES[data.error] || ERRORES.FALHA_CARREGAR}</p>
        </div>
      )}

      {!loading && data?.ok && rows.length === 0 && (
        <div className="portal-box">
          <div className="portal-rows-empty">
            <b>Sem movimentos neste filtro</b>
            Assim que houver entradas, vendas ou uma importação, o histórico aparece aqui.
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="portal-box portal-box--pad">
          <div className="portal-feed">
            {rows.map((m) => {
              const meta = META[m.movement_type] || { label: m.movement_type, badge: '' }
              const d = Number(m.quantity_delta || 0)
              return (
                <div key={m.id} className="portal-citem">
                  <div className="portal-citem-top">
                    <b className="portal-citem-name">{m.drug_label || 'Medicamento'}</b>
                    <span className="portal-citem-time">{quando(m.created_at)}</span>
                  </div>
                  <div className="portal-citem-meta">
                    <span className={`portal-badge ${meta.badge}`}>{meta.label}</span>
                    {d !== 0 && (
                      <span className={`portal-st ${d > 0 ? 'portal-st--ok' : 'portal-st--mut'}`}>
                        {d > 0 ? `+${nInt(d)}` : `−${nInt(Math.abs(d))}`}
                      </span>
                    )}
                    {m.quantity_before != null && m.quantity_after != null && d !== 0 && (
                      <span className="sub">
                        saldo {nInt(m.quantity_before)} → {nInt(m.quantity_after)}
                      </span>
                    )}
                    <span className="sub">{FONTES[m.source] || m.source}</span>
                  </div>
                  <div className="portal-citem-foot">
                    {m.reason && <span>{m.reason}</span>}
                    {m.actor_label ? <span className="sub">por {m.actor_label}</span> : null}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="portal-pgbar">
            <span className="portal-pginfo">
              A mostrar {rows.length} de {total} movimentos · mais recentes no topo
            </span>
            {podeMais && (
              <span className="portal-pgbtns">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={more}
                  onClick={() => carregar({ append: true })}
                >
                  {more ? 'A carregar…' : 'Carregar mais'}
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
