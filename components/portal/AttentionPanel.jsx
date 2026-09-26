'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getMyAttentionFeed, updateStockItem } from '@/lib/actions/pharmacy-portal'
import { getRestockAck, setRestockAck } from '@/lib/restock'
import { expiryStatus, monthYear } from '@/lib/expiry'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página.',
  QUANTIDADE_INVALIDA: 'Quantidade inválida (número inteiro ≥ 0).',
  PRECO_INVALIDO: 'Preço inválido.',
  DATA_INVALIDA: 'Data inválida — use o calendário.',
  MEDICAMENTO_INEXISTENTE: 'Medicamento não disponível no catálogo.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
  FALHA_CARREGAR: 'Não foi possível carregar os avisos.',
}

function timeAgo(iso) {
  if (!iso) return null
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

/** 'YYYY-MM-DDTHH:mm:ss' (+Z?) do Postgres → 'YYYY-MM-DD' para o input date. */
function asDateInput(v) {
  return v ? String(v).slice(0, 10) : ''
}

const RESTOCK_HINT =
  'Repondo, o produto volta a aparecer no Localizador imediatamente (confirme que o lote está na prateleira). «Repor na entrada» soma as unidades recebidas ao saldo; «Repor sem qtd.» apenas religa o produto.'

/**
 * "Precisa de Atenção" — tudo o que exige decisão da farmácia hoje,
 * agregado numa página com acções por linha:
 *
 *  • REPOSIÇÃO — produtos que saíram do ar porque uma reserva concluída
 *    esgotou o stock (trigger 0006). Acção: repôr (religa o item) ou
 *    "não repor" (ack local, o aviso volta na próxima venda).
 *  • VALIDADE — em stock e expirados / 30 / 60 / 90 dias (lib/expiry).
 *    Acção: corrigir validade (ex.: lote novo) ou desligar o item.
 *  • STALE — confirmado há mais de 5 dias. Acção: reconfirmar.
 */
export default function AttentionPanel({ pharmacyId }) {
  const [feed, setFeed] = useState(null)
  const [busy, setBusy] = useState(null) // `${kind}:${drug_id}`
  const [toast, setToast] = useState('')
  const [acksReady, setAcksReady] = useState(false)
  const [dismissed, setDismissed] = useState({})

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 4000)
  }

  const load = useCallback(async () => {
    const res = await getMyAttentionFeed()
    if (res.ok) setFeed(res.feed)
    else {
      setFeed({ restock: [], expiry: [], stale: [] })
      setToast(ERRORES[res.error] || ERRORES.FALHA_CARREGAR)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      // Acks são estado do browser: só depois de lidos é que se pode
      // decidir o que mostrar, sem flash de itens já dispensados. Tudo
      // assíncrono (microtask) — setState síncrono no corpo do effect
      // é sinalizado pelo react-hooks/set-state-in-effect.
      load()
      setDismissed({})
      setAcksReady(true)
    })
  }, [load, pharmacyId])

  const isDismissed = useCallback(
    (it) => {
      if (!acksReady || !pharmacyId) return false
      const ack = getRestockAck(pharmacyId, it.drug_id)
      return Boolean(ack) || Boolean(dismissed[it.drug_id])
    },
    [acksReady, dismissed, pharmacyId],
  )

  const restock = useMemo(
    () => (feed ? feed.restock.filter((it) => !isDismissed(it)) : []),
    [feed, isDismissed],
  )
  const expiry = feed?.expiry || []
  const stale = feed?.stale || []

  const total = restock.length + expiry.length + stale.length

  /** Guarda por fármaco — o mesmo caminho do StockPanel, com todos os campos. */
  const save = async (it, patch) => {
    setBusy(`${it.kind}:${it.drug_id}`)
    setToast('')
    const next = { ...it, ...patch }
    const res = await updateStockItem({
      drugId: it.drug_id,
      inStock: next.in_stock,
      quantity: next.quantity ?? '',
      price: next.price ?? '',
      availableFrom: asDateInput(next.available_from),
      expiresAt: asDateInput(next.expires_at),
    })
    setBusy(null)
    if (res.ok) {
      flash('Guardado — visível no Localizador imediatamente.')
      await load() // re-agrega: o item resolvido sai do feed
    } else {
      setToast(ERRORES[res.error] || 'Erro inesperado.')
    }
  }

  /** "Não repor": esconde o aviso neste browser e guarda o ack. */
  const dismissRestock = (it) => {
    setDismissed((d) => ({ ...d, [it.drug_id]: true }))
    if (!pharmacyId) return
    try {
      setRestockAck(pharmacyId, it.drug_id)
    } catch {
      // sem storage: só o esconder-desta-vez
    }
  }

  if (feed === null) {
    return (
      <section className="portal-section">
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      </section>
    )
  }

  return (
    <section className="portal-section">
      {/* Padrão único do portal: cabeçalho compacto, sem hero. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Precisa de atenção</h1>
          <p className="portal-page-sub">
            {total > 0 ? (
              <>
                <b>{total}</b> assunto{total !== 1 && 's'} para hoje — resolva da lista para zerar o
                sino.
              </>
            ) : (
              'Nada para hoje — tudo em ordem.'
            )}
          </p>
        </div>
      </div>

      <div className="portal-section-head">
        <h2 className="portal-h2">Assuntos do dia</h2>
        <span className="portal-count">
          {total > 0 ? (
            <>
              <b>{total}</b> assunto{total !== 1 && 's'} para hoje
            </>
          ) : (
            'Nada para hoje'
          )}
        </span>
      </div>

      {total === 0 && (
        <div className="empty-state">
          <p className="empty-title">Tudo em ordem</p>
          <p className="empty-sub">
            Não há produtos esgotados por vendas, validades a vencer nem stock desactualizado. Volte
            amanhã — os avisos aparecem aqui sozinhos.
          </p>
        </div>
      )}

      {/* ── REPOSIÇÃO ─────────────────────────────────────────── */}
      {restock.length > 0 && (
        <>
          <div className="portal-attention-group-head">
            <h3 className="portal-attention-h3">Repor stock — vendido até esgotar</h3>
            <p className="portal-attention-sub">
              Estes produtos saíram do Localizador porque uma reserva concluída levou as últimas
              unidades. Quem procura hoje não os encontra.
            </p>
          </div>
          {restock.map((it) => (
            <div key={it.drug_id} className="portal-attention-row portal-attention-row--restock">
              <div className="portal-attention-main">
                <span className="portal-attention-name">
                  {it.name}
                  {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
                </span>
                <span className="portal-attention-meta">
                  {[it.form, it.dosage].filter(Boolean).join(' · ')}
                  {it.soldQuantity != null && ` · última venda: ${it.soldQuantity}×`}
                  {it.when && ` · ${timeAgo(it.when)}`}
                </span>
                <div className="portal-attention-form">
                  {/* Repor agora passa pela Entrada de stock: deep-link com
                      ?q= pré-filtra a lista no medicamento e o foco vai ao
                      campo «Chegaram» — o fluxo de mercadoria recebida é
                      somar ao saldo, não sobrescrever. */}
                  <Link
                    href={`/portal/entrada?q=${encodeURIComponent(it.name)}`}
                    className="btn-mini portal-act-ok"
                  >
                    Repor na entrada →
                  </Link>
                  <button
                    type="button"
                    className="btn-mini portal-act-ok"
                    disabled={busy === `restock:${it.drug_id}`}
                    onClick={() => save(it, { in_stock: true })}
                  >
                    {busy === `restock:${it.drug_id}` ? '…' : 'Repor sem qtd.'}
                  </button>
                  <button
                    type="button"
                    className="btn-mini portal-act-no"
                    onClick={() => dismissRestock(it)}
                  >
                    Não repor
                  </button>
                </div>
                <p className="portal-attention-hint">{RESTOCK_HINT}</p>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── VALIDADE ──────────────────────────────────────────── */}
      {expiry.length > 0 && (
        <>
          <div className="portal-attention-group-head">
            <h3 className="portal-attention-h3">Validade — 90 / 60 / 30 dias e expirados</h3>
            <p className="portal-attention-sub">
              Validade passada esconde o produto do Localizador (view stock_confirmed). Corrija o
              lote ou desligue o item até repor.
            </p>
          </div>
          {expiry.map((it) => (
            <div key={it.drug_id} className="portal-attention-row portal-attention-row--expiry">
              <div className="portal-attention-main">
                <span className="portal-attention-name">
                  {it.name}
                  {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
                </span>
                <span className="portal-attention-meta">
                  {[it.form, it.dosage].filter(Boolean).join(' · ')}
                  {it.quantity != null && ` · ${it.quantity} em prateleira`}
                  {it.expires_at && ` · validade registada: ${monthYear(it.expires_at)}`}
                </span>
                <span
                  className={`expiry-tag expiry-tag--${expiryStatus(it.expires_at)?.level || it.level}`}
                >
                  {expiryStatus(it.expires_at)?.label || 'Expirado'}
                </span>
                <div className="portal-attention-form">
                  <input
                    type="date"
                    className="portal-input portal-input--date"
                    aria-label={`Nova validade de ${it.name}`}
                    title="Nova validade (lote novo)"
                    defaultValue={asDateInput(it.expires_at)}
                    onBlur={(e) => {
                      const v = e.target.value
                      if (v === asDateInput(it.expires_at)) return
                      save(it, { expires_at: v || null })
                    }}
                  />
                  <button
                    type="button"
                    className="btn-mini portal-act-no"
                    disabled={busy === `expiry:${it.drug_id}`}
                    onClick={() => save(it, { in_stock: false })}
                  >
                    Já não disponível
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── STALE ─────────────────────────────────────────────── */}
      {stale.length > 0 && (
        <>
          <div className="portal-attention-group-head">
            <h3 className="portal-attention-h3">Stock desactualizado — mais de 5 dias</h3>
            <p className="portal-attention-sub">
              Confirmado há mais de 5 dias: sai de «confirmado» no Localizador. Um clique volta a
              pôr o produto no ar.
            </p>
          </div>
          {stale.map((it) => (
            <div key={it.drug_id} className="portal-attention-row portal-attention-row--stale">
              <div className="portal-attention-main">
                <span className="portal-attention-name">
                  {it.name}
                  {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
                </span>
                <span className="portal-attention-meta">
                  {[it.form, it.dosage].filter(Boolean).join(' · ')}
                  {it.quantity != null && ` · ${it.quantity} em prateleira`}
                  {` · confirmado ${timeAgo(it.confirmed_at)}`}
                </span>
                <div className="portal-attention-form">
                  <button
                    type="button"
                    className="btn-mini portal-act-ok"
                    disabled={busy === `stale:${it.drug_id}`}
                    onClick={() => save(it, { in_stock: true })}
                  >
                    {busy === `stale:${it.drug_id}` ? '…' : 'Reconfirmar agora'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}
    </section>
  )
}
