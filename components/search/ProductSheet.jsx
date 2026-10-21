'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createReservation } from '@/lib/actions/reservations'
import { openStatus } from '@/lib/opening-hours'
import { monthYear } from '@/lib/expiry'
import { formatOptionLabel, packStructureText, perBasePrice, unitLabel } from '@/lib/sale-options'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'
import {
  activeOptions,
  defaultOption,
  directionsHref,
  drugImageUrl,
  freshness,
  kindLabel,
  priceOf,
  productHref,
  quantityText,
  whatsappHref,
} from '@/lib/product-utils'

const ERRORES = {
  NOME_INVALIDO: 'Escreva o seu nome (pelo menos 2 letras).',
  TELEFONE_INVALIDO: 'Telemóvel inválido — indique 9 dígitos (ex.: 923 114 500).',
  QUANTIDADE_INVALIDA: 'Quantidade entre 1 e 10.',
  INDISPONIVEL: 'Este item já não está disponível — volte à prateleira da farmácia.',
  NAO_RESERVAVEL: 'Este produto só está disponível no balcão — passe na farmácia.',
  OPCAO_INVALIDA: 'Forma de venda já não disponível — escolha outra.',
  LIMITE_ATINGIDO: 'Muitas reservas seguidas. Tente novamente mais tarde.',
  FALHA_CRIAR: 'Não foi possível criar a reserva. Tente novamente.',
  PAYLOAD_INVALIDO: 'Não foi possível criar a reserva. Tente novamente.',
}

/**
 * Janelas de levantamento — as próximas horas cheias, hoje e amanhã. A
 * farmácia confirma a hora ao responder; nada aqui promete um horário
 * que a farmácia não aceitou.
 */
function pickupSlots(now = new Date()) {
  const slots = []
  const push = (dayOffset, start, end) => {
    const d = new Date(now)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(start, 0, 0, 0)
    if (d.getTime() < now.getTime() + 45 * 60 * 1000) return
    const day = dayOffset === 0 ? 'Hoje' : dayOffset === 1 ? 'Amanhã' : ''
    slots.push({
      value: `${day} · ${String(start).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00`,
      day,
      range: `${String(start).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`,
      hint:
        dayOffset === 0
          ? 'Hoje, antes de fechar'
          : dayOffset === 1
            ? 'Abre às 08:00'
            : 'Depois do trabalho',
    })
  }
  for (const [s, e] of [
    [10, 12],
    [14, 16],
    [18, 20],
  ]) {
    push(0, s, e)
  }
  for (const [s, e] of [
    [8, 10],
    [12, 14],
    [18, 20],
  ]) {
    push(1, s, e)
  }
  return slots.slice(0, 4)
}

export default function ProductSheet({ item, alternatives = [] }) {
  const [mode, setMode] = useState('ficha') // ficha → quando → contacto → feito
  const [quantity, setQuantity] = useState(1)
  const [optionId, setOptionId] = useState(() => defaultOption(item)?.id || null)
  const [slot, setSlot] = useState('')
  const [slots, setSlots] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const panelRef = useRef(null)

  const opts = activeOptions(item)
  const option = useMemo(
    () => opts.find((o) => o.id === optionId) || defaultOption(item),
    [opts, optionId, item],
  )
  const price = priceOf(item, option)
  const photo = drugImageUrl(item.image_path)
  const status = openStatus(item.pharmacy_opening_hours)
  const qtyAvailable = Number(item.quantity)
  const maxQty = Number.isFinite(qtyAvailable) && qtyAvailable > 0 ? Math.min(10, qtyAvailable) : 10
  const packText = packStructureText(item.pack_laminas, item.pack_comprimidos)
  const unit = unitLabel(option?.unit || defaultOption(item)?.unit || 'unidade').toLowerCase()
  const estimate =
    option?.price != null ? Math.round(quantity * Number(option.price) * 100) / 100 : null

  // As janelas dependem da hora do browser: só depois de montar, para o
  // HTML do servidor não divergir do cliente.
  useEffect(() => {
    const list = pickupSlots()
    setSlots(list)
    setSlot((current) => current || list[0]?.value || '')
  }, [])

  // Ao mudar de passo, o painel volta ao topo e o título recebe o foco —
  // quem navega por teclado não fica perdido no fim do formulário.
  useEffect(() => {
    if (mode === 'ficha') return
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    panelRef.current?.querySelector('h2')?.focus?.()
  }, [mode])

  const phoneHref = item.pharmacy_phone ? `tel:${item.pharmacy_phone.replace(/\s/g, '')}` : null
  const waHref = whatsappHref(
    item.pharmacy_whatsapp,
    `Olá! Vi no Localizador que a ${item.pharmacy_name} tem ${item.drug_name} em stock. Podem confirmar, por favor?`,
  )
  const maps = directionsHref({
    name: item.pharmacy_name,
    address: item.pharmacy_address,
    municipio: item.pharmacy_municipio,
    lat: item.pharmacy_lat,
    lng: item.pharmacy_lng,
    maps_url: item.pharmacy_maps_url,
  })

  const startReserve = () => {
    setError('')
    setMode('quando')
  }

  const submit = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) {
      setError(ERRORES.TELEFONE_INVALIDO)
      return
    }
    setBusy(true)
    setError('')
    const notes = [`Levantamento: ${slot || 'a combinar'}`, note.trim()]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300)
    const res = await createReservation({
      stockItemId: item.stock_item_id,
      name,
      phone,
      quantity,
      notes,
      saleOptionId: option?.id || null,
    })
    setBusy(false)
    if (res.ok) {
      setCreated(res)
      setMode('feito')
    } else {
      setError(ERRORES[res.error] || 'Erro inesperado.')
    }
  }

  const trackHref = created
    ? `/reserva/${created.reservationId}?t=${created.accessToken}`
    : '#'

  return (
    <div className="pdp-page">
      <div className="pdp-media">
        {photo ? (
          <img
            className="cf-photo"
            src={photo}
            alt={`Embalagem de ${item.drug_name} — ${item.pharmacy_name}`}
          />
        ) : (
          <div className="pack">
            <span className="pack-brand">{item.brand || item.pharmacy_name}</span>
            <span className="pack-name">{item.drug_name}</span>
            {item.drug_form && <span className="pack-dose">{item.drug_form}</span>}
            <span className="pack-foot">
              <span>{item.drug_dosage || kindLabel(item.drug_kind)}</span>
              <span>{unit}</span>
            </span>
          </div>
        )}
        <p className="pack-cap">
          {photo
            ? 'Fotografia enviada pela farmácia.'
            : 'Embalagem representada por tipografia — a farmácia ainda não fotografou este produto.'}
        </p>

        {(item.brand || item.origin) && (
          <div className="pdp-form" style={{ marginTop: 0 }}>
            <b style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Origem
            </b>
            {[item.brand, item.origin].filter(Boolean).join(' · ')}
          </div>
        )}

        <div className="stamp">
          <i className="cf-dot" />
          <span>
            <b>Confirmado pela farmácia</b>
            <br />
            Stock escrito no portal {freshness(item.confirmed_at) ? `há ${freshness(item.confirmed_at)}` : 'agora'}.
          </span>
        </div>
      </div>

      <div className="pdp-main" ref={panelRef}>
        {mode === 'ficha' && (
          <>
            <div className="pdp-crumb">
              <Link href="/farmacia">Farmácias</Link>
              <span>/</span>
              <Link href={`/farmacia/${item.pharmacy_slug}`}>
                <b>{item.pharmacy_name}</b>
              </Link>
              <span>/</span>
              <span>{kindLabel(item.drug_kind)}</span>
            </div>

            <div className="pdp-kicker">
              <span className="cf-badge">{kindLabel(item.drug_kind)}</span>
              {item.drug_requires_rx ? (
                <span className="cf-rx">Receita médica</span>
              ) : (
                <span className="cf-badge cf-badge--muted">Venda livre</span>
              )}
              {item.drug_priority === 'critico' && (
                <span className="cf-badge cf-badge--muted">Prioridade crítica</span>
              )}
              <span className="cf-fresh">
                <i className="cf-dot" />
                {item.pharmacy_name} · há {freshness(item.confirmed_at) || '1 min'}
              </span>
            </div>

            <h2 className="pdp-title" tabIndex={-1}>
              {item.drug_name}
            </h2>
            <p className="pdp-form">
              {[item.drug_form, item.drug_dosage].filter(Boolean).join(' · ') || kindLabel(item.drug_kind)}
              <span className="sep">·</span>
              {quantityText(item) || 'Stock confirmado'}
              {item.drug_molecule && (
                <>
                  <span className="sep">·</span>
                  {item.drug_molecule}
                </>
              )}
            </p>

            <div className="pdp-buy">
              <div>
                <span className="price price--xl">{price.label}</span>
                {price.per && <div className="cf-unit">{price.per}</div>}
              </div>
              <div className="pdp-avail">
                <b>{quantityText(item) || 'Disponível agora'}</b>
                Actualizado há {freshness(item.confirmed_at) || '1 min'}
                <br />
                {status ? status.label : item.pharmacy_opening_hours || 'Horário não indicado'}
              </div>
            </div>

            {opts.length > 1 && (
              <div className="sh-filters" style={{ marginTop: 14 }}>
                {opts.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`cf-chip${option?.id === o.id ? ' cf-chip--on' : ''}`}
                    onClick={() => setOptionId(o.id)}
                    aria-pressed={option?.id === o.id}
                  >
                    {formatOptionLabel(o, unitLabel(defaultOption(item)?.unit))}
                    {o.price != null && <span className="cf-chip__n">{fmtKz(o.price)}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="pdp-actions">
              {item.reservable === false ? (
                <>
                  <span className="cf-btn cf-btn--ghost" aria-disabled="true">
                    Só disponível no balcão
                  </span>
                  {phoneHref && (
                    <a className="cf-btn cf-btn--primary" href={phoneHref}>
                      Ligar à farmácia
                    </a>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="cf-btn cf-btn--primary" onClick={startReserve}>
                    Reservar para levantar
                  </button>
                  {phoneHref && (
                    <a className="cf-btn cf-btn--ghost" href={phoneHref}>
                      Ligar
                    </a>
                  )}
                </>
              )}
            </div>
            <p className="pdp-terms">
              Reserva gratuita · pagamento no balcão
              {waHref && (
                <>
                  {' · '}
                  <a href={waHref} target="_blank" rel="noopener noreferrer">
                    falar por WhatsApp
                  </a>
                </>
              )}
            </p>

            <dl className="quick">
              <div>
                <dt>Forma</dt>
                <dd>{item.drug_form || '—'}</dd>
              </div>
              <div>
                <dt>Dosagem</dt>
                <dd>{item.drug_dosage || '—'}</dd>
              </div>
              <div>
                <dt>Embalagem</dt>
                <dd>
                  {packText || formatOptionLabel(option || {}, unitLabel(defaultOption(item)?.unit))}
                </dd>
              </div>
              <div>
                <dt>Dispensa</dt>
                <dd>{item.drug_requires_rx ? 'Com receita médica' : 'Sem receita'}</dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>{monthYear(item.expires_at) || 'Não indicada'}</dd>
              </div>
              <div>
                <dt>Preço por {unit}</dt>
                <dd>
                  {(() => {
                    const per = perBasePrice(option)
                    return per != null ? fmtKz(per) : '—'
                  })()}
                </dd>
              </div>
            </dl>

            {item.drug_molecule && (
              <div className="pdp-sec">
                <h3>Princípio activo</h3>
                <p>{item.drug_molecule}</p>
              </div>
            )}

            <div className="pdp-sec">
              <h3>Dados da farmácia</h3>
              <p>
                <Link href={`/farmacia/${item.pharmacy_slug}`} style={{ fontWeight: 600 }}>
                  {item.pharmacy_name}
                </Link>
                {item.pharmacy_municipio ? ` · ${item.pharmacy_municipio}` : ''}
                {item.pharmacy_address ? ` · ${item.pharmacy_address}` : ''}
                <br />
                {item.pharmacy_opening_hours || 'Horário não indicado'}
                {item.pharmacy_phone ? ` · ${item.pharmacy_phone}` : ''}
              </p>
              <div className="pdp-actions" style={{ marginTop: 12 }}>
                {maps && (
                  <a
                    className="cf-btn cf-btn--ghost cf-btn--sm"
                    href={maps}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Direcções
                  </a>
                )}
                <Link className="cf-btn cf-btn--ghost cf-btn--sm" href={`/farmacia/${item.pharmacy_slug}`}>
                  Ver prateleira completa
                </Link>
              </div>
            </div>

            <div className="pdp-sec">
              <h3>O que o Localizador mostra</h3>
              <p>
                Só dados que a farmácia confirmou: preço, quantidade e frescura do stock. O
                Localizador não dá indicações clínicas nem substitui o farmacêutico — na dúvida,
                fale com a farmácia antes de reservar.
              </p>
            </div>

            {alternatives.length > 0 && (
              <div className="pdp-alt">
                <h3>Também disponível em</h3>
                {alternatives.slice(0, 6).map((alt) => {
                  const altPrice = priceOf(alt)
                  return (
                    <div key={alt.stock_item_id} className="alt-row">
                      <div className="nm">
                        {alt.pharmacy_name}
                        <div className="sub">
                          {[alt.pharmacy_municipio, quantityText(alt)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="where">
                        <b className="cf-num">{altPrice.label}</b>
                        <div>há {freshness(alt.confirmed_at) || '1 min'}</div>
                      </div>
                      <Link className="cf-btn cf-btn--ghost cf-btn--sm" href={productHref(alt.stock_item_id)}>
                        Ver
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {(mode === 'quando' || mode === 'contacto') && (
          <>
            <div className="res-steps">
              <span className={mode === 'quando' ? 'on' : ''}>1 · Levantamento</span>
              <i />
              <span className={mode === 'contacto' ? 'on' : ''}>2 · Confirmação</span>
            </div>

            <h2 className="res-title" tabIndex={-1}>
              {mode === 'quando' ? `Reservar ${item.drug_name}` : 'Como confirmamos?'}
            </h2>

            <div className="res-which">
              <div>
                <div className="nm">{item.drug_name}</div>
                <div className="sub">
                  {[formatOptionLabel(option || {}, unitLabel(defaultOption(item)?.unit)), item.pharmacy_name]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="right">
                <div className="price cf-num">{price.label}</div>
                <div className="cf-unit">por {unit}</div>
              </div>
            </div>

            {mode === 'quando' ? (
              <>
                <span className="res-label">Quantidade</span>
                <div className="res-stepper" role="group" aria-label="Quantidade">
                  <button
                    type="button"
                    aria-label="Diminuir"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    −
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button
                    type="button"
                    aria-label="Aumentar"
                    onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                    disabled={quantity >= maxQty}
                  >
                    +
                  </button>
                </div>
                <span className="res-hint">
                  Máximo {maxQty} {unit}
                  {maxQty === 1 ? '' : 's'} por reserva.
                </span>

                <span className="res-label">Quando passa?</span>
                <div className="res-slots">
                  {slots.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`res-slot${slot === s.value ? ' res-slot--on' : ''}`}
                      aria-pressed={slot === s.value}
                      onClick={() => setSlot(s.value)}
                    >
                      <span className="res-tag">{s.day}</span>
                      <b className="cf-num">{s.range}</b>
                      {s.hint}
                    </button>
                  ))}
                  {slots.length === 0 && (
                    <p className="sh-empty-sub" style={{ gridColumn: '1 / -1' }}>
                      A preparar as janelas de hoje…
                    </p>
                  )}
                </div>

                <div className="res-summary">
                  <span>Estimativa a pagar no balcão</span>
                  <b className="cf-num">{estimate != null ? fmtKz(estimate) : 'No balcão'}</b>
                </div>
                <div className="res-actions">
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    onClick={() => setMode('contacto')}
                  >
                    Continuar
                  </button>
                  <button type="button" className="cf-btn cf-btn--quiet" onClick={() => setMode('ficha')}>
                    Voltar à ficha
                  </button>
                </div>
                <p className="res-legal">
                  A farmácia confirma a hora ao responder à reserva. Não há pagamento online.
                </p>
              </>
            ) : (
              <>
                <span className="res-label">Os seus dados</span>
                <div className="res-fields">
                  <input
                    className="cf-field cf-field--square"
                    type="text"
                    placeholder="Nome"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Nome"
                  />
                  <input
                    className="cf-field cf-field--square"
                    type="tel"
                    inputMode="tel"
                    placeholder="923 000 000"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-label="Telemóvel"
                  />
                </div>

                <span className="res-label">Nota para a farmácia (opcional)</span>
                <input
                  className="cf-field cf-field--square"
                  type="text"
                  placeholder="Ex.: passo depois das 18h"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="Nota para a farmácia"
                />

                {error && (
                  <p className="res-err" role="alert">
                    {error}
                  </p>
                )}

                <div className="res-done-rows">
                  <div>
                    <span>Produto</span>
                    <b>{item.drug_name}</b>
                  </div>
                  <div>
                    <span>Quantidade</span>
                    <b>
                      {quantity} {unit}
                      {quantity === 1 ? '' : 's'}
                    </b>
                  </div>
                  <div>
                    <span>Levantamento</span>
                    <b>{slot || 'A combinar com a farmácia'}</b>
                  </div>
                  <div>
                    <span>Total no balcão</span>
                    <b className="cf-num">{estimate != null ? fmtKz(estimate) : 'No balcão'}</b>
                  </div>
                </div>

                <div className="res-actions">
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    onClick={submit}
                    disabled={busy || name.trim().length < 2}
                  >
                    {busy ? 'A reservar…' : 'Confirmar reserva'}
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--quiet"
                    onClick={() => {
                      setError('')
                      setMode('quando')
                    }}
                  >
                    Voltar
                  </button>
                </div>
                <p className="res-legal">
                  Usamos o seu nome e telemóvel apenas para esta reserva. A farmácia responde pelo
                  mesmo número — sem pagamento online.
                </p>
              </>
            )}
          </>
        )}

        {mode === 'feito' && created && (
          <div className="res-done">
            <div className="res-steps">
              <span>1 · Levantamento</span>
              <i />
              <span className="on">2 · Confirmação</span>
            </div>
            <h2 className="res-title" tabIndex={-1}>
              Reserva guardada
            </h2>
            <p style={{ marginTop: 10 }}>
              A {created.pharmacyName} recebeu o pedido e vai responder pelo telefone. Guarde o link
              de acompanhamento — é por ele que vê o estado da reserva.
            </p>

            <div className="res-link">
              <span>Link de acompanhamento</span>
              <a href={trackHref}>{trackHref}</a>
            </div>

            <div className="res-done-rows">
              <div>
                <span>Produto</span>
                <b>{created.drugName}</b>
              </div>
              <div>
                <span>Quantidade</span>
                <b>
                  {created.saleUnit
                    ? `${quantity} ${unitLabel(created.saleUnit).toLowerCase()}${quantity === 1 ? '' : 's'}`
                    : quantity}
                </b>
              </div>
              <div>
                <span>Levantamento</span>
                <b>{slot || 'A combinar com a farmácia'}</b>
              </div>
              <div>
                <span>Total no balcão</span>
                <b className="cf-num">{estimate != null ? fmtKz(estimate) : 'No balcão'}</b>
              </div>
            </div>

            <div className="res-actions">
              <a className="cf-btn cf-btn--primary" href={trackHref}>
                Acompanhar reserva
              </a>
              <Link className="cf-btn cf-btn--ghost" href={`/farmacia/${item.pharmacy_slug}`}>
                Voltar à prateleira
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
