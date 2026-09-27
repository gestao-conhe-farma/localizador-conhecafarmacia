'use client'

import { useEffect, useState } from 'react'
import { createReservation } from '@/lib/actions/reservations'
import { formatOptionLabel, unitLabel, perBasePrice } from '@/lib/sale-options'

const ERRORES_BASE = {
  NOME_INVALIDO: 'Escreva o seu nome (pelo menos 2 letras).',
  TELEFONE_INVALIDO: 'Telefone inválido — 9 a 15 dígitos (ex.: 923000000).',
  QUANTIDADE_INVALIDA: 'Quantidade entre 1 e 10.',
  INDISPONIVEL: 'Este item já não está disponível — refresque a pesquisa.',
  OPCAO_INVALIDA: 'Forma de venda já não disponível — escolha outra.',
  LIMITE_ATINGIDO: 'Muitas reservas seguidas. Tente novamente mais tarde.',
  FALHA_CRIAR: 'Não foi possível criar a reserva. Tente novamente.',
}
const ERRORES = { ...ERRORES_BASE, PAYLOAD_INVALIDO: ERRORES_BASE.FALHA_CRIAR }

const fmt = (n) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(Number(n))

/** Código do país da origem (0013) — o mesmo de DrugSearch/PharmacyStock. */
import { originCode } from '@/lib/origin-flags'

/** Placeholder SVG (data-URI) para itens sem foto — o mesmo do Localizador. */
const drugPlaceholder = (name) => {
  const letter = (name || '?').trim().charAt(0).toUpperCase()
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><rect width='72' height='72' rx='12' fill='%23f0eee9'/><text x='36' y='47' font-family='Georgia,serif' font-size='32' fill='%2300493a' text-anchor='middle'>${letter}</text></svg>`
  return `data:image/svg+xml,${svg}`
}

/** URL do bucket público — o mesmo que a view stock_confirmed expõe. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * Modal de reserva do lado do cliente — o fecho do ciclo (fase 5 do
 * plano). Sucesso devolve o link de acompanhamento /reserva/[id]: é
 * esse link que o cliente guarda e que a farmácia usa nas mensagens.
 */
export default function ReserveModal({ item, onClose, onCreated }) {
  // item: { stock_item_id, drug_name, drug_form, drug_dosage, pharmacy_name, pharmacy_municipio }
  // Opções de venda do item (0012). A default vem pré-seleccionada.
  const opts = (item.sale_options || []).filter((o) => o.active !== false)
  const defaultOpt = opts.find((o) => o.is_default) || opts[0] || null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [optionId, setOptionId] = useState(defaultOpt ? defaultOpt.id : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await createReservation({
      stockItemId: item.stock_item_id,
      name,
      phone,
      quantity,
      notes,
      saleOptionId: optionId || null,
    })
    setBusy(false)
    if (res.ok) {
      setCreated(res)
      onCreated?.(res)
    } else {
      setError(ERRORES[res.error] || 'Erro inesperado.')
    }
  }

  return (
    <div
      className="stock-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-modal-title"
    >
      <div className="stock-modal-scrim" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal-card">
        <div className="portal-section-head" style={{ marginBottom: 0 }}>
          <h3 id="reserve-modal-title" className="portal-h2">
            {created ? 'Reserva criada' : `Reservar ${item.drug_name}`}
          </h3>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
            aria-label="Fechar"
          >
            Fechar
          </button>
        </div>

        {created ? (
          <div className="res-success">
            <p className="res-success-title">
              A {created.pharmacyName} vai responder em até 72 horas.
              {created.saleUnit
                ? ` Reservou ${created.salePack > 1 ? `${created.salePack} ` : ''}${created.saleUnit}${created.salePack > 1 ? 's' : ''}.`
                : ''}
            </p>
            <p className="res-success-sub">
              Guarde este link para acompanhar a reserva — também pode copiá-lo ou enviá-lo a
              alguém:
            </p>
            <div className="res-success-link-row">
              <input
                readOnly
                className="portal-input"
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/reserva/${created.reservationId}`}
                onFocus={(e) => e.target.select()}
                aria-label="Link de acompanhamento da reserva"
              />
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(`${window.location.origin}/reserva/${created.reservationId}`)
                    .catch(() => {})
                }}
              >
                Copiar
              </button>
            </div>
            <a href={`/reserva/${created.reservationId}`} className="btn btn-secondary">
              Acompanhar agora
            </a>
          </div>
        ) : (
          <form className="portal-form" onSubmit={submit}>
            <p className="stock-modal-state">
              {item.pharmacy_name}
              {item.pharmacy_municipio ? ` · ${item.pharmacy_municipio}` : ''} — a farmácia responde
              em até 72 horas.
            </p>

            {/* Foto + origem/marca (0013) — o cliente reconhece a caixa e
                confirma a apresentação antes de reservar. Sem foto, um
                placeholder com a inicial (o mesmo do card do Localizador).
                Layout lado a lado quando há qualquer ficha visual. */}
            {(item.image_path || item.brand || item.origin) && (
              <div className="res-visual">
                <img
                  src={
                    item.image_path
                      ? `${supabaseUrl}/storage/v1/object/public/drug-images/${item.image_path}`
                      : drugPlaceholder(item.drug_name)
                  }
                  alt={
                    item.image_path
                      ? `Embalagem de ${item.drug_name} — ${item.pharmacy_name}`
                      : `${item.drug_name} — sem foto da embalagem`
                  }
                  className="res-visual-img"
                />
                <div className="res-visual-tags">
                  {item.brand && <span className="origin-tag origin-tag--brand">{item.brand}</span>}
                  {item.origin && (
                    <span className="origin-tag">
                      {originCode(item.origin) && (
                        <span className="origin-code">{originCode(item.origin)}</span>
                      )}{' '}
                      {item.origin}
                    </span>
                  )}
                  {!item.image_path && (
                    <span className="res-visual-hint">
                      A farmácia ainda não fotografou a caixa.
                    </span>
                  )}
                </div>
              </div>
            )}

            {opts.length > 0 && (
              <label className="portal-label">
                Quero
                <select
                  className="portal-input"
                  value={optionId || ''}
                  onChange={(e) => setOptionId(e.target.value || null)}
                >
                  {opts.map((o) => {
                    const per = perBasePrice(o)
                    const v = per != null && Number.isInteger(per) ? per : per?.toFixed(2)
                    return (
                      <option key={o.id} value={o.id}>
                        {formatOptionLabel(o, unitLabel(defaultOpt?.unit))}
                        {o.price != null ? ` — ${o.price} Kz` : ''}
                        {per != null && (o.pack_size ?? 1) > 1
                          ? ` (≈ ${v} Kz/${(defaultOpt ? unitLabel(defaultOpt.unit) : 'un.').toLowerCase()})`
                          : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}

            <div className="portal-form-grid portal-form-grid--three">
              <label className="portal-label">
                O seu nome
                <input
                  type="text"
                  className="portal-input"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="portal-label">
                Telefone (WhatsApp se tiver)
                <input
                  type="tel"
                  className="portal-input"
                  required
                  inputMode="tel"
                  placeholder="9XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="portal-label">
                Quantidade
                <input
                  type="number"
                  className="portal-input"
                  min="1"
                  max="10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
            </div>

            <label className="portal-label">
              Nota para a farmácia (opcional)
              <textarea
                className="portal-input"
                rows={2}
                maxLength={300}
                placeholder="Ex.: preciso para amanhã de manhã"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            {error && (
              <p className="res-form-error" role="alert">
                {error}
              </p>
            )}

            {/* Valor justo, à vista: preço unitário da opção escolhida e
                total estimado ao vivo com a quantidade. Legado sem opções:
                usa o preço único do item, se existir. */}
            {(() => {
              const sel = opts.find((o) => o.id === optionId) || null
              const unitPrice = sel ? sel.price : item.price
              const pack = sel ? (sel.pack_size ?? 1) : 1
              if (unitPrice == null) return null
              const q = Number.parseInt(quantity, 10)
              const total = Number.isFinite(q) && q >= 1 ? q * Number(unitPrice) : null
              const per = sel && pack > 1 ? perBasePrice(sel) : null
              const v = per != null && !Number.isInteger(per) ? per.toFixed(2) : per
              const baseName = (defaultOpt ? unitLabel(defaultOpt.unit) : 'un.').toLowerCase()
              return (
                <p className="res-price-line">
                  {total != null ? (
                    <>
                      Valor estimado: <b>{fmt(total)} Kz</b>
                      {sel && (
                        <span className="res-price-detail">
                          {' '}
                          ({quantity || 0} × {fmt(unitPrice)} Kz)
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      Preço: <b>{fmt(unitPrice)} Kz</b>
                    </>
                  )}
                  {per != null && (
                    <span className="res-price-detail">
                      {' '}
                      ≈ {v} Kz/{baseName}
                    </span>
                  )}
                  <span className="res-price-detail"> · a confirmar no balcão</span>
                </p>
              )
            })()}

            <div className="stock-modal-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'A reservar…' : 'Confirmar reserva'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
