'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

/**
 * Lê o chip activo do URL (?tipo=restock|expiry|stale) — o filtro
 * persiste ao partilhar o link ou recarregar a página. Valor inválido
 * ou ausente cai em «Todos».
 */
function filterFromUrl() {
  if (typeof window === 'undefined') return 'all'
  const v = new URLSearchParams(window.location.search).get('tipo')
  return ['restock', 'expiry', 'stale'].includes(v) ? v : 'all'
}
import {
  getMyAttentionFeed,
  updateStockItem,
  getPendingReservationsCount,
} from '@/lib/actions/pharmacy-portal'
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
 * Estrutura da caixa no aviso de reposição (0016) — o que o atendente
 * vai repor: «caixa com 10 lâminas de 10 comprimidos (100 no total)».
 * '' quando a estrutura não está registada — nunca inventa informação.
 */
function restockPackSuffix(it) {
  const lam = Number(it.pack_laminas) || null
  const comp = Number(it.pack_comprimidos) || null
  if (!lam && !comp) return ''
  if (lam && comp) {
    return ` · caixa com ${lam} lâminas de ${comp} comprimidos (${lam * comp} no total)`
  }
  if (lam) return ` · caixa com ${lam} lâminas`
  return ` · lâmina com ${comp} comprimidos`
}

/**
 * "Precisa de Atenção" — tudo o que exige decisão da farmácia hoje.
 *
 * v2 «Premium Calmo» (padrão aprovado, refs 4/6): KPIs do dia em cima
 * (reservas · reposição · validade · desactualizado), por baixo UMA
 * caixa «Fila de hoje» ordenada por urgência — sem grupos, com tabs
 * sublinhadas e UM botão sólido por linha (o resto é ghost neutro).
 *
 *  • REPOSIÇÃO — saíram do Localizador quando uma reserva concluída
 *    esgotou o stock (trigger 0006).
 *  • VALIDADE — expirados / 30 / 60 / 90 dias (lib/expiry).
 *  • STALE — confirmado há mais de 5 dias.
 * A lógica (acks por browser, save por fármaco, deep-links ?q=/ ?drug=,
 * filtro no URL) é a mesma de sempre — mudou só a roupa.
 */
export default function AttentionPanel({ pharmacyId }) {
  const [feed, setFeed] = useState(null)
  const [busy, setBusy] = useState(null) // `${kind}:${drug_id}`
  const [toast, setToast] = useState('')
  const [acksReady, setAcksReady] = useState(false)
  const [dismissed, setDismissed] = useState({})
  const [pending, setPending] = useState(0) // reservas por atender (KPI)

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
    // Contagem de reservas para o KPI do topo — falha não pode
    // estragar o feed, por isso isolada.
    try {
      const pend = await getPendingReservationsCount()
      if (pend?.ok) setPending(pend.count)
    } catch {
      // KPI fica a 0 até ao próximo load
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

  const expiredCount = useMemo(
    () =>
      expiry.filter((it) => (expiryStatus(it.expires_at)?.level || it.level) === 'expired').length,
    [expiry],
  )

  // Tabs sublinhadas (antes chips) — a contagem continua neutra ao
  // lado do rótulo, nunca colorida. O activo vive no URL (?tipo=)
  // para partilhar/recarregar sem perder o filtro.
  const [typeFilter, setTypeFilter] = useState(filterFromUrl)
  const tabs = [
    { id: 'all', label: 'Todos', n: total },
    { id: 'restock', label: 'Reposição', n: restock.length },
    { id: 'expiry', label: 'Validade', n: expiry.length },
    { id: 'stale', label: 'Desactualizado', n: stale.length },
  ]

  /**
   * Fila única por urgência (ordem do mockup): expirados → reposição →
   * validade (dias asc) → desactualizado. Com filtro activo, só esse
   * tipo (com a sua ordem natural).
   */
  const fila = useMemo(() => {
    const out = []
    if (typeFilter === 'all' || typeFilter === 'expiry') {
      for (const it of expiry) {
        const st = expiryStatus(it.expires_at)
        const lvl = st?.level || it.level
        out.push({
          tipo: 'expiry',
          it,
          st,
          urg: lvl === 'expired' ? 0 : 2 + Math.max(0, st?.days ?? 9999) / 10000,
        })
      }
    }
    if (typeFilter === 'all' || typeFilter === 'restock') {
      for (const it of restock) out.push({ tipo: 'restock', it, urg: 1 })
    }
    if (typeFilter === 'all' || typeFilter === 'stale') {
      for (const it of stale) out.push({ tipo: 'stale', it, urg: 3 })
    }
    return out.sort((a, b) => a.urg - b.urg)
  }, [typeFilter, expiry, restock, stale])

  /**
   * Nota neutra única por baixo das tabs — as explicações que antes
   * viviam em títulos de grupo. Só o que não é óbvio sobrevive aqui.
   */
  const nota =
    typeFilter === 'expiry'
      ? {
          b: 'Validade:',
          t: 'Validade passada esconde o produto do Localizador (view stock_confirmed). Corrija o lote ou desligue o item até repor.',
        }
      : typeFilter === 'stale'
        ? {
            b: 'Desactualizado:',
            t: 'Confirmado há mais de 5 dias: sai de «confirmado» no Localizador. Um clique volta a pôr o produto no ar.',
          }
        : restock.length > 0
          ? { b: 'Como repor:', t: RESTOCK_HINT }
          : null

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

  /** KPI do dia — ícone à esquerda, número, delta neutro, estado à direita. */
  const kpis = [
    {
      k: 'Reservas por atender',
      n: pending,
      d: 'prazo de resposta: 72 h',
      ic: 'amber',
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      ),
      st: pending > 0 ? ['warn', `${pending} por atender`] : ['ok', 'em dia'],
    },
    {
      k: 'Para repor',
      n: restock.length,
      d: 'fora do Localizador até repor',
      ic: 'red',
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8h16v12H4z" />
          <path d="M9 8V5h6v3" />
          <path d="M4 13h16" />
        </svg>
      ),
      st:
        restock.length > 0
          ? ['bad', restock.length === 1 ? 'urgente' : 'urgentes']
          : ['ok', 'em dia'],
    },
    {
      k: 'Validade a vencer',
      n: expiry.length,
      d: 'janelas 90 / 60 / 30 dias e expirados',
      ic: 'amber',
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
      st:
        expiredCount > 0
          ? ['bad', `${expiredCount} já expirou${expiredCount !== 1 ? 'ram' : ''}`]
          : expiry.length > 0
            ? ['warn', 'a vencer']
            : ['ok', 'em dia'],
    },
    {
      k: 'Stock desactualizado',
      n: stale.length,
      d: 'confirmado há mais de 5 dias',
      ic: 'gray',
      svg: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      ),
      st: stale.length > 0 ? ['mut', 'reconfirmar'] : ['ok', 'em dia'],
    },
  ]

  /** Uma linha da fila — nome+meta · ponto+palavra · quando · acções. */
  const renderRow = ({ tipo, it, st }) => {
    const key = `${tipo}:${it.drug_id}`
    const metaBase = [it.form, it.dosage].filter(Boolean).join(' · ')

    if (tipo === 'restock') {
      return (
        <div key={key} className="portal-atr">
          <div className="portal-atr-main">
            <span className="portal-atr-name">
              {it.name}
              {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
            </span>
            <span className="portal-atr-meta">
              {metaBase}
              {it.soldQuantity != null && ` · última venda: ${it.soldQuantity}×`}
              {restockPackSuffix(it)}
            </span>
          </div>
          <span className="portal-st portal-st--bad" title="Saiu do Localizador">
            <i />
            Saiu do Localizador
          </span>
          <span className="portal-atr-when">{timeAgo(it.when) || '—'}</span>
          <div className="portal-atr-actions">
            {/* Repor agora passa pela Entrada de stock: deep-link com
                ?q= pré-filtra a lista no medicamento e o foco vai ao
                campo «Chegaram» — o fluxo de mercadoria recebida é
                somar ao saldo, não sobrescrever. Único sólido da linha. */}
            <Link
              href={`/portal/entrada?q=${encodeURIComponent(it.name)}`}
              className="portal-act portal-act--primary"
            >
              Repor na entrada →
            </Link>
            <button
              type="button"
              className="portal-act"
              disabled={busy === `restock:${it.drug_id}`}
              onClick={() => save(it, { in_stock: true })}
            >
              {busy === `restock:${it.drug_id}` ? '…' : 'Repor sem qtd.'}
            </button>
            <button type="button" className="portal-act" onClick={() => dismissRestock(it)}>
              Não repor
            </button>
          </div>
        </div>
      )
    }

    if (tipo === 'expiry') {
      const lvl = st?.level || it.level
      const estado =
        lvl === 'expired' || !st
          ? { cls: 'bad', txt: st?.label || 'Expirado' }
          : lvl === '30'
            ? { cls: 'strong', txt: st.label }
            : { cls: 'warn', txt: st.label }
      const quando =
        lvl === 'expired' && st ? `expirou há ${Math.abs(st.days)} d` : monthYear(it.expires_at)

      return (
        <div key={key} className="portal-atr">
          <div className="portal-atr-main">
            <span className="portal-atr-name">
              {it.name}
              {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
            </span>
            <span className="portal-atr-meta">
              {metaBase}
              {it.quantity != null && ` · ${it.quantity} em prateleira`}
              {it.expires_at && ` · validade registada: ${monthYear(it.expires_at)}`}
            </span>
          </div>
          <span className={`portal-st portal-st--${estado.cls}`}>
            <i />
            {estado.txt}
          </span>
          <span className="portal-atr-when">{quando || '—'}</span>
          <div className="portal-atr-actions">
            {/* Corrigir validade agora passa pela Entrada de stock:
                deep-link por id (?drug=) isola a linha, força o
                filtro «Todos» e destaca-a — o lote novo que chegou
                soma-se aí, e a validade edifica-se no modal de stock. */}
            <Link
              href={`/portal/entrada?drug=${it.drug_id}`}
              className="portal-act portal-act--primary"
            >
              Corrigir na entrada →
            </Link>
            <input
              type="date"
              className="portal-input portal-input--date"
              aria-label={`Nova validade de ${it.name}`}
              title="Nova validade (lote novo) — guarda logo ao mudar"
              defaultValue={asDateInput(it.expires_at)}
              onBlur={(e) => {
                const v = e.target.value
                if (v === asDateInput(it.expires_at)) return
                save(it, { expires_at: v || null })
              }}
            />
            <button
              type="button"
              className="portal-act"
              disabled={busy === `expiry:${it.drug_id}`}
              onClick={() => save(it, { in_stock: false })}
            >
              Já não disponível
            </button>
          </div>
        </div>
      )
    }

    // stale
    return (
      <div key={key} className="portal-atr">
        <div className="portal-atr-main">
          <span className="portal-atr-name">
            {it.name}
            {it.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
          </span>
          <span className="portal-atr-meta">
            {metaBase}
            {it.quantity != null && ` · ${it.quantity} em prateleira`}
          </span>
        </div>
        <span className="portal-st portal-st--mut">
          <i />
          Desactualizado
        </span>
        <span className="portal-atr-when">
          {it.confirmed_at ? `confirmado ${timeAgo(it.confirmed_at)}` : '—'}
        </span>
        <div className="portal-atr-actions">
          <button
            type="button"
            className="portal-act portal-act--primary"
            disabled={busy === `stale:${it.drug_id}`}
            onClick={() => save(it, { in_stock: true })}
          >
            {busy === `stale:${it.drug_id}` ? '…' : 'Reconfirmar agora'}
          </button>
        </div>
      </div>
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

      {/* KPIs do dia (padrão refs 4/6): ícone à esquerda + estado à
          direita — só pontos e palavras, nunca chips coloridos. */}
      <div className="portal-kpi4-grid">
        {kpis.map((c) => (
          <div key={c.k} className="portal-kpi4">
            <span className={`portal-kpi4-ic portal-kpi4-ic--${c.ic}`} aria-hidden="true">
              {c.svg}
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">{c.k}</span>
              <span className="portal-kpi4-n">{c.n}</span>
              <span className="portal-kpi4-d">{c.d}</span>
            </span>
            <span className={`portal-st portal-st--${c.st[0]}`}>
              <i />
              {c.st[1]}
            </span>
          </div>
        ))}
      </div>

      {/* Fila de hoje — UMA caixa, ordenada por urgência (antes eram
          três grupos separados; a urgência lê-se pela linha). */}
      <div className="portal-box">
        <div className="portal-sec-head">
          <h2>Fila de hoje</h2>
          <div className="portal-sec-tools">
            <span className="portal-sec-head-b">ordenada por urgência</span>
          </div>
        </div>

        {/* Tabs sublinhadas no lugar dos chips — a contagem fica neutra
            ao lado do rótulo. O activo vive no URL (?tipo=). */}
        <div
          className="portal-undertabs"
          role="group"
          aria-label="Filtrar assuntos por tipo"
          data-tour="chips"
        >
          {tabs.map((c) => (
            <button
              key={c.id}
              type="button"
              className={typeFilter === c.id ? 'active' : ''}
              aria-pressed={typeFilter === c.id}
              onClick={() => {
                setTypeFilter(c.id)
                // Sincroniza o URL sem navegar: history direto (sem
                // router.push) para não refetch nem re-render da página.
                const url = new URL(window.location.href)
                if (c.id === 'all') url.searchParams.delete('tipo')
                else url.searchParams.set('tipo', c.id)
                window.history.replaceState(null, '', url)
              }}
            >
              {c.label} <span className="portal-cnt">{c.n}</span>
            </button>
          ))}
        </div>

        {nota && total > 0 && (
          <div className="portal-box-note">
            <p className="portal-note">
              <b>{nota.b}</b> {nota.t}
            </p>
          </div>
        )}

        {fila.length > 0 ? (
          fila.map(renderRow)
        ) : (
          <div className="portal-rows-empty">
            <b>Tudo em ordem</b>
            Não há produtos esgotados por vendas, validades a vencer nem stock desactualizado. Volte
            amanhã — os avisos aparecem aqui sozinhos.
          </div>
        )}
      </div>

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}
    </section>
  )
}
