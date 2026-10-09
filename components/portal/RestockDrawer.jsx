'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { addStockUnits, getMyStockSnapshot } from '@/lib/actions/pharmacy-portal'
import { expiryStatus, monthYear } from '@/lib/expiry'
import PortalDrawer from '@/components/portal/PortalDrawer'
import StateLabel from '@/components/portal/StateLabel'
import {
  PLURALS,
  buildOptions,
  defaultUnit,
  isSolid,
  physicalParts,
  unitOptions,
} from '@/components/portal/RestockPanel'

/**
 * «+ Nova entrada» — a versão RÁPIDA da entrada de stock, em drawer a
 * partir de /portal/stock. A página completa /portal/entrada (deep-links,
 * preços, estrutura detalhada) fica intacta; aqui o atendente pesquisa,
 * escolhe o medicamento, escreve o que chegou e soma — sem a página
 * mudar de sítio.
 *
 * Usa EXACTAMENTE as mesmas regras do RestockPanel (helpers exportados
 * de lá): unidade de chegada, estrutura da caixa (0016) e validação de
 * `addStockUnits` — uma só fonte de verdade para os dois caminhos.
 */

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  QUANTIDADE_INVALIDA: 'Quantidade inválida — indique quantas unidades chegaram (≥ 1).',
  PAYLOAD_INVALIDO: 'Pedido inválido.',
  MEDICAMENTO_INEXISTENTE: 'Medicamento não disponível no catálogo.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
  FALHA_CARREGAR: 'Não foi possível carregar o stock.',
  PACK_INVALIDO: 'Estrutura da caixa inválida — use números de 1 a 999.',
  UNIDADE_INVALIDA: 'Unidade de entrada inválida.',
  PRECO_INVALIDO: 'Preço inválido numa das formas de venda.',
  DEFAULT_MULTIPLO: 'Só uma forma de venda pode ser a padrão.',
}

function estadoDe(it) {
  const expiry = expiryStatus(it.expires_at)
  const out = !it.in_stock || (it.quantity ?? 0) === 0
  if (out) return { cls: 'mut', txt: 'Sem stock' }
  if (expiry && expiry.level === 'expired') return { cls: 'bad', txt: 'Expirado' }
  if (expiry && expiry.level !== 'ok') return { cls: 'warn', txt: expiry.label }
  return { cls: 'ok', txt: 'Disponível' }
}

export default function RestockDrawer({ open, onClose }) {
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [qty, setQty] = useState('')
  const [unitSel, setUnitSel] = useState({})
  const [packs, setPacks] = useState({})
  const [msg, setMsg] = useState(null) // { type: 'ok' | 'err', text }
  const [pending, startTransition] = useTransition()

  // Snapshot carrega na primeira abertura (mesma fonte do /entrada).
  useEffect(() => {
    if (!open || items !== null) return undefined
    let alive = true
    getMyStockSnapshot().then((res) => {
      if (!alive) return
      if (res.ok) setItems(res.items)
      else {
        setItems([])
        setMsg({ type: 'err', text: ERRORES[res.error] || ERRORES.FALHA_CARREGAR })
      }
    })
    return () => {
      alive = false
    }
  }, [open, items])

  // Ao fechar, volta ao estado de pesquisa (reabrir é sempre o mesmo).
  useEffect(() => {
    if (open) return
    setQ('')
    setSel(null)
    setQty('')
    setMsg(null)
  }, [open])

  const filtered = useMemo(() => {
    const list = items || []
    const s = q.trim().toLowerCase()
    if (!s) return list.slice(0, 40)
    return list
      .filter(
        (it) =>
          it.name?.toLowerCase().includes(s) ||
          it.molecule?.toLowerCase().includes(s) ||
          [it.form, it.dosage].filter(Boolean).join(' ').toLowerCase().includes(s),
      )
      .slice(0, 40)
  }, [items, q])

  const submeter = (e) => {
    e.preventDefault()
    if (!sel || pending) return
    const raw = qty.trim()
    const n = Number.parseInt(raw, 10)
    if (!raw || Number.isNaN(n) || n < 1) {
      setMsg({ type: 'err', text: ERRORES.QUANTIDADE_INVALIDA })
      return
    }
    const id = sel.drug_id
    const solid = isSolid(sel.form)
    const unit = unitSel[id] || defaultUnit(sel)
    const pack = packs[id] || {}
    const lam = Number(pack.lam ?? sel.pack_laminas ?? '') || null
    const comp = Number(pack.comp ?? sel.pack_comprimidos ?? '') || null
    // Caixas sem estrutura conhecida: há como converter? (mesma regra
    // do painel completo — em vez de somar às cegas, pede a informação).
    const hasCaixaOpt = (sel.sale_options || []).some((o) => o.unit === 'caixa')
    if (unit === 'caixa' && solid && !hasCaixaOpt && !lam) {
      setMsg({
        type: 'err',
        text: 'Indique as lâminas por caixa (campo abaixo) para registar caixas.',
      })
      return
    }
    const options = buildOptions(sel, { unit, pack, priceMap: {} })
    const baseUnit = (options.find((o) => o.isDefault && o.active) || options[0]).unit
    const parts = physicalParts(n, unit, lam, comp, solid)

    startTransition(async () => {
      const res = await addStockUnits({
        drugId: id,
        units: n,
        unit,
        ...(solid && {
          packLaminas: pack.lam ?? sel.pack_laminas ?? '',
          packComprimidos: pack.comp ?? sel.pack_comprimidos ?? '',
        }),
        options,
      })
      if (res.ok) {
        setItems((list) =>
          (list || []).map((row) =>
            row.drug_id === id ? { ...row, in_stock: true, quantity: res.total } : row,
          ),
        )
        setSel((s) => (s ? { ...s, in_stock: true, quantity: res.total } : s))
        setQty('')
        const desc = parts.length ? parts.join(' · ') : `${n} ${PLURALS[unit].toLowerCase()}`
        setMsg({
          type: 'ok',
          text: `+${desc} de ${sel.name} — saldo agora em ${res.total} ${PLURALS[baseUnit].toLowerCase()}.`,
        })
      } else {
        setMsg({ type: 'err', text: ERRORES[res.error] || ERRORES.FALHA_GUARDAR })
      }
    })
  }

  const selSolid = sel ? isSolid(sel.form) : false
  const selPack = sel ? packs[sel.drug_id] || {} : {}
  const qtyN = Number.parseInt(qty.trim(), 10)
  const selUnit = sel ? unitSel[sel.drug_id] || defaultUnit(sel) : null
  const preview = (() => {
    if (!sel || !(qtyN >= 1)) return ''
    const lam = Number(selPack.lam ?? sel.pack_laminas ?? '') || null
    const comp = Number(selPack.comp ?? sel.pack_comprimidos ?? '') || null
    const optList = buildOptions(sel, { unit: selUnit, pack: selPack, priceMap: {} })
    const chosen = optList.find((o) => o.unit === selUnit)
    const factor = chosen ? Number(chosen.packSize) || 1 : 1
    const baseUnit = (optList.find((o) => o.isDefault && o.active) || optList[0]).unit
    const parts = physicalParts(qtyN, selUnit, lam, comp, selSolid)
    return parts.length
      ? `${parts.join(' · ')} · +${qtyN * factor} no saldo`
      : `+${qtyN * factor} ${PLURALS[baseUnit].toLowerCase()}`
  })()

  return (
    <PortalDrawer
      open={open}
      title="Nova entrada de stock"
      hint="Pesquise o medicamento, diga o que chegou — o saldo soma sem sair do Stock."
      onClose={onClose}
    >
      {items === null ? (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      ) : !sel ? (
        <>
          <input
            className="portal-input"
            type="search"
            placeholder="Pesquisar medicamento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Pesquisar medicamento para registar entrada"
            autoFocus
          />

          {msg?.type === 'err' && (
            <p className="portal-error" role="alert">
              {msg.text}
            </p>
          )}

          <div className="portal-drw-list">
            {filtered.length === 0 && (
              <div className="portal-rows-empty">
                <b>Nada encontrado</b>
                Tente outro termo de pesquisa.
              </div>
            )}
            {filtered.map((it) => (
              <button
                key={it.drug_id}
                type="button"
                className="portal-drw-item"
                onClick={() => {
                  setSel(it)
                  setQty('')
                  setMsg(null)
                }}
              >
                <span className="portal-drw-who">
                  <b>{it.name}</b>
                  <span className="sub">
                    {[it.form, it.dosage].filter(Boolean).join(' · ')}
                    {it.expires_at ? ` · val. ${monthYear(it.expires_at)}` : ''}
                  </span>
                </span>
                <span className="portal-drw-bal">
                  <b>{it.in_stock ? (it.quantity ?? 0) : 0}</b>
                  <span>em stock</span>
                </span>
                <StateLabel st={estadoDe(it).cls} label={estadoDe(it).txt} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <form className="portal-form" onSubmit={submeter}>
          <div className="portal-drw-sel">
            <span>
              <b>{sel.name}</b>
              <span>{[sel.form, sel.dosage].filter(Boolean).join(' · ') || '—'}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                setSel(null)
                setMsg(null)
              }}
            >
              Trocar
            </button>
          </div>

          <label className="restock-field">
            <span className="restock-field-k">Chegaram</span>
            <div className="restock-qty">
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className="portal-input restock-input"
                placeholder="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-label={`Unidades recebidas de ${sel.name}`}
                disabled={pending}
                autoFocus
              />
              <select
                className="portal-input restock-unit"
                value={selUnit}
                onChange={(e) => setUnitSel((u) => ({ ...u, [sel.drug_id]: e.target.value }))}
                aria-label={`Unidade em que chegou ${sel.name}`}
                disabled={pending}
              >
                {unitOptions(sel).map((u) => (
                  <option key={u} value={u}>
                    {PLURALS[u]}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* 0016 — estrutura da caixa, só nas formas sólidas. */}
          {selSolid && qty !== '' && (
            <span className="restock-pack">
              Caixa com
              <input
                type="number"
                min="1"
                max="999"
                inputMode="numeric"
                className="portal-input portal-input--price"
                value={selPack.lam ?? sel.pack_laminas ?? ''}
                onChange={(e) =>
                  setPacks((p) => ({
                    ...p,
                    [sel.drug_id]: { ...p[sel.drug_id], lam: e.target.value },
                  }))
                }
                aria-label={`Lâminas por caixa de ${sel.name}`}
                disabled={pending}
              />
              lâminas ·
              <input
                type="number"
                min="1"
                max="999"
                inputMode="numeric"
                className="portal-input portal-input--price"
                value={selPack.comp ?? sel.pack_comprimidos ?? ''}
                onChange={(e) =>
                  setPacks((p) => ({
                    ...p,
                    [sel.drug_id]: { ...p[sel.drug_id], comp: e.target.value },
                  }))
                }
                aria-label={`Comprimidos por lâmina de ${sel.name}`}
                disabled={pending}
              />
              comprimidos/lâmina
            </span>
          )}

          {preview && <span className="restock-preview">{preview}</span>}

          {msg && (
            <p className={msg.type === 'ok' ? 'portal-hint' : 'portal-error'} role="status">
              {msg.text}
            </p>
          )}

          <div className="portal-staff-acts">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'A somar…' : 'Somar ao saldo'}
            </button>
          </div>
        </form>
      )}
    </PortalDrawer>
  )
}
