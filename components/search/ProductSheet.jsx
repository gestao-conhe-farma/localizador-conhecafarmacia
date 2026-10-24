'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { createReservation } from '@/lib/actions/reservations'
import { openStatus, openingWeek } from '@/lib/opening-hours'
import { monthYear } from '@/lib/expiry'
import { formatOptionLabel, packStructureText, perBasePrice, unitLabel } from '@/lib/sale-options'
import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'
import { pickupText, reservationNotes } from '@/lib/pickup'
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

/* ---------------- levantamento: dia + hora ---------------- */

const DAY_MS = 24 * 60 * 60 * 1000
const pad2 = (n) => String(n).padStart(2, '0')
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Padrão quando a farmácia não tem horas legíveis (10:00–20:00). */
const DEFAULT_OPEN = 10 * 60
const DEFAULT_CLOSE = 20 * 60

/**
 * Âncoras do dia: manhã, tarde e fim da tarde. São o esqueleto que o
 * cliente reconhece — e ele pode sempre escrever outra hora no campo.
 * Cada uma é depois encaixada no horário da farmácia.
 */
const WINDOWS = [
  [10, 12],
  [14, 16],
  [18, 20],
]

/** 840 → «14:00». */
const clockText = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`

/** «Hoje» / «Amanhã» / «27 out» — o dia tal como o cliente o lê. */
function dayLabel(iso, now = new Date()) {
  if (!iso) return ''
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${iso}T00:00:00`)
  const diff = Math.round((target - today) / DAY_MS)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return target.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '')
}

/**
 * Janelas do dia escolhido.
 *
 * Hoje a lista é INTELIGENTE: a primeira sugestão começa na hora cheia
 * seguinte (nunca antes de a farmácia abrir) — às 10:00 sugere 11:00–13:00
 * e às 11:25 sugere 12:00–14:00. No fim do dia a janela encolhe até ao
 * fecho (às 18:30, numa farmácia aberta até às 20:00, sugere 19:00–20:00).
 *
 * Tudo dentro do HORÁRIO DA FARMÁCIA (`opening_hours`): as âncoras são
 * encaixadas na janela de funcionamento, as que ficariam fora dela
 * desaparecem e um dia de fecho (ex.: domingo num «Seg–Sáb») não tem
 * sugestões nenhumas. Sem horas legíveis usa-se o padrão 10:00–20:00. O
 * que já começou deixa de aparecer: uma sugestão que já passou não é
 * sugestão (para uma hora fora da lista, o campo «Hora» continua livre).
 */
function windowsFor(iso, now = new Date(), openingHours = '') {
  const week = openingWeek(openingHours)
  const weekday = new Date(`${iso}T00:00:00`).getDay()
  const day = week ? week[weekday] : null
  if (week && !day) return [] // farmácia fechada nesse dia
  const openMin = day ? day.open : DEFAULT_OPEN
  const closeMin = day ? day.close : DEFAULT_CLOSE
  const today = iso === isoDay(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Primeira janela: a hora cheia seguinte — 09:30 → 10:00 · 10:00 → 11:00
  // · 11:25 → 12:00 — nunca antes de a farmácia abrir. Num dia futuro é a
  // hora de abertura (ou as 10:00, se abrir antes).
  const firstStart = Math.max(
    Math.ceil(openMin / 60) * 60,
    today ? Math.ceil((nowMin + 1) / 60) * 60 : DEFAULT_OPEN,
  )
  const firstEnd = Math.min(firstStart + 120, closeMin)
  const head =
    firstEnd - firstStart >= 60
      ? [{ from: clockText(firstStart), to: clockText(firstEnd) }]
      : []

  // Âncoras encaixadas no horário e só depois da primeira janela — sem
  // sobreposições nem horas em que a farmácia está fechada.
  const after = head.length ? firstEnd : null
  const tail = WINDOWS.map(([from, to]) => ({
    from: Math.max(from * 60, openMin),
    to: Math.min(to * 60, closeMin),
  }))
    .filter((w) => w.to - w.from >= 60) // menos de 1h não é janela
    .filter((w) => (after != null ? w.from >= after : w.from > nowMin || !today))
    .map((w) => ({ from: clockText(w.from), to: clockText(w.to) }))

  // Três sugestões cabem na grelha; mais do que isso empurraria o
  // formulário para baixo sem acrescentar escolha real.
  return [...head, ...tail].slice(0, 3)
}

/** Rótulo do levantamento + se a hora já passou (15 min de tolerância). */
function describePickup(date, time, end, now = new Date()) {
  if (!date || !time) return { label: '', past: false }
  const at = new Date(`${date}T${time}:00`)
  return {
    label: pickupText(dayLabel(date, now), time, end),
    past: at.getTime() < now.getTime() + 15 * 60 * 1000,
  }
}

const EMPTY_PICKUP = { date: '', time: '', end: '', label: '', past: false }
const EMPTY_BOUNDS = { min: '', max: '' }

/**
 * Primeiro levantamento possível: hoje, se ainda houver janela aberta;
 * senão o primeiro dia (aberto) com janelas — um domingo de fecho não
 * recebe uma sugestão que a farmácia não conseguiria cumprir. Corre só no
 * cliente.
 */
function initialPickup(now = new Date(), openingHours = '') {
  const bounds = {
    min: isoDay(now),
    max: isoDay(new Date(now.getTime() + 14 * DAY_MS)),
  }
  for (let i = 0; i < 14; i++) {
    const iso = isoDay(new Date(now.getTime() + i * DAY_MS))
    const first = windowsFor(iso, now, openingHours)[0]
    if (!first) continue
    return {
      pickup: {
        date: iso,
        time: first.from,
        end: first.to,
        ...describePickup(iso, first.from, first.to, now),
      },
      bounds,
    }
  }
  return { pickup: EMPTY_PICKUP, bounds }
}

const NO_SUBSCRIBE = () => () => {}

/**
 * «Já montou?» sem setState num efeito: o servidor vê `false` e o cliente
 * passa a `true` na primeira renderização após a hidratação. É o gatilho
 * para derivar datas do relógio do browser só do lado do cliente.
 */
function useMounted() {
  return useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  )
}

export default function ProductSheet({
  item,
  alternatives = [],
  modal = false,
  onOpenItem = null,
}) {
  const [mode, setMode] = useState('ficha') // ficha → quando → contacto → feito
  const [quantity, setQuantity] = useState(1)
  const [optionId, setOptionId] = useState(() => defaultOption(item)?.id || null)
  // Levantamento completo: dia + hora (a hora pode vir de uma sugestão ou
  // ser escrita pelo cliente) e, nas sugestões, a hora de fim da janela.
  // O rótulo («Hoje · 14:00–16:00») e o «já passou» calculam-se nos
  // eventos/efeito: o relógio não corre durante o render.
  // null = ainda automático (primeira janela possível); depois guarda a
  // escolha do cliente. Os valores automáticos são DERIVADOS do relógio
  // no render (mounted), nunca escritos num efeito de montagem.
  const [picked, setPicked] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  // «Copiar link»: confirmação curta no próprio botão (sem toast).
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
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

  // As datas dependem do relógio do browser: só depois de montar, para o
  // HTML do servidor não divergir do cliente. O dia começa em hoje (ou
  // amanhã, se as janelas de hoje já fecharam).
  const mounted = useMounted()
  const auto = useMemo(
    () => (mounted ? initialPickup(new Date(), item.pharmacy_opening_hours) : null),
    [mounted, item.pharmacy_opening_hours],
  )
  const pickup = picked || auto?.pickup || EMPTY_PICKUP
  const bounds = auto?.bounds || EMPTY_BOUNDS
  // As janelas seguem sempre o dia escolhido — derivadas, sem estado próprio.
  const slots = pickup.date ? windowsFor(pickup.date, new Date(), item.pharmacy_opening_hours) : []

  // Fechada agora e a primeira sugestão já não é hoje (fecho do dia, dia de
  // descanso): a ficha explica porque é que o levantamento não pode ser já.
  const closedNote =
    status?.open === false && auto?.pickup.date && auto.pickup.date !== auto.bounds.min
      ? auto.pickup
      : null

  // Dia escolhido sem funcionamento (ex.: domingo num «Seg–Sáb»).
  const week = openingWeek(item.pharmacy_opening_hours)
  const closedDay = Boolean(
    week && pickup.date && !week[new Date(`${pickup.date}T00:00:00`).getDay()],
  )

  const chooseDate = (iso) => {
    if (!iso) return
    // A janela escolhida era de outro dia: fica só a hora escrita.
    const next = { date: iso, time: pickup.time, end: '' }
    setPicked({ ...next, ...describePickup(next.date, next.time, next.end) })
  }

  const chooseWindow = (w) => {
    const next = { date: pickup.date, time: w.from, end: w.to }
    setPicked({ ...next, ...describePickup(next.date, next.time, next.end) })
  }

  const changeTime = (time) => {
    const next = { date: pickup.date, time, end: '' }
    setPicked({ ...next, ...describePickup(next.date, next.time, next.end) })
  }

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

  /** Link da ficha aberta — no cartão é o URL com `?produto=`; na rota
   *  /produto/[id] é a própria página. Lido no clique, não no render. */
  const copyLink = async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // Contexto sem Clipboard API (http antigo) — cópia pelo textarea.
      try {
        const el = document.createElement('textarea')
        el.value = url
        el.setAttribute('readonly', '')
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        ok = document.execCommand('copy')
        document.body.removeChild(el)
      } catch {
        ok = false
      }
    }
    // Sem cópia não há confirmação falsa: o botão fica como está.
    if (!ok) return
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2200)
  }

  useEffect(() => () => clearTimeout(copyTimer.current), [])

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
    const notes = reservationNotes(pickup.label || 'a combinar', note)
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

  const trackHref = created ? `/reserva/${created.reservationId}?t=${created.accessToken}` : '#'

  return (
    <div className={`pdp-page${modal ? ' pdp-page--modal' : ''}`}>
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
            Stock escrito no portal{' '}
            {freshness(item.confirmed_at) ? `há ${freshness(item.confirmed_at)}` : 'agora'}.
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
              {[item.drug_form, item.drug_dosage].filter(Boolean).join(' · ') ||
                kindLabel(item.drug_kind)}
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
              <button
                type="button"
                className={`cf-btn cf-btn--ghost pdp-share${copied ? ' pdp-share--done' : ''}`}
                onClick={copyLink}
              >
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>
              <span className="cf-sr" role="status">
                {copied ? 'Link copiado para a área de transferência.' : ''}
              </span>
            </div>
            {/* O aviso de receita é um bloco próprio, com o mesmo respiro que
                o botão tem até às informações de lâminas e caixa (.sh-filters /
                chips) acima — não é letra miúda encostada à acção. */}
            {item.drug_requires_rx && <p className="pdp-rx">Sujeito a receita médica.</p>}

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
                  {packText ||
                    formatOptionLabel(option || {}, unitLabel(defaultOption(item)?.unit))}
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
                <Link
                  className="cf-btn cf-btn--ghost cf-btn--sm"
                  href={`/farmacia/${item.pharmacy_slug}`}
                >
                  Ver prateleira completa
                </Link>
              </div>
            </div>

            <div className="pdp-sec">
              <h3>Observação</h3>
              <p>
                O Localizador não dá indicações clínicas nem substitui o farmacêutico — na dúvida,
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
                      {onOpenItem ? (
                        <button
                          type="button"
                          className="cf-btn cf-btn--ghost cf-btn--sm"
                          onClick={() => onOpenItem(alt.stock_item_id)}
                        >
                          Ver
                        </button>
                      ) : (
                        <Link
                          className="cf-btn cf-btn--ghost cf-btn--sm"
                          href={productHref(alt.stock_item_id)}
                        >
                          Ver
                        </Link>
                      )}
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
                  {[
                    formatOptionLabel(option || {}, unitLabel(defaultOption(item)?.unit)),
                    item.pharmacy_name,
                  ]
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

                {/* Dia e hora completos: o cliente marca o dia que quiser
                    (até 14 dias) e a hora exacta a que passa. */}
                <div className="res-when">
                  <label className="res-when-field">
                    <span>Dia</span>
                    <input
                      className="cf-field cf-field--square"
                      type="date"
                      min={bounds.min}
                      max={bounds.max}
                      value={pickup.date}
                      onChange={(e) => chooseDate(e.target.value)}
                      aria-label="Dia do levantamento"
                    />
                  </label>
                  <label className="res-when-field">
                    <span>Hora</span>
                    <input
                      className="cf-field cf-field--square cf-num"
                      type="time"
                      value={pickup.time}
                      onChange={(e) => changeTime(e.target.value)}
                      aria-label="Hora do levantamento"
                    />
                  </label>
                </div>

                {closedNote && (
                  <p className="res-closed">
                    <b>A farmácia está fechada agora.</b> A primeira sugestão é{' '}
                    {dayLabel(closedNote.date)} —{' '}
                    <span className="cf-num">
                      {closedNote.time}
                      {closedNote.end ? `–${closedNote.end}` : ''}
                    </span>
                    .
                  </p>
                )}

                {/* Janelas do DIA escolhido — hoje começam na hora cheia
                    seguinte. */}
                <div className="res-slots">
                  {slots.map((w) => {
                    const on = pickup.time === w.from && pickup.end === w.to
                    return (
                      <button
                        key={w.from}
                        type="button"
                        className={`res-slot${on ? ' res-slot--on' : ''}`}
                        aria-pressed={on}
                        onClick={() => chooseWindow(w)}
                      >
                        <span className="res-tag">Sugestão</span>
                        <b className="cf-num">
                          {w.from}–{w.to}
                        </b>
                        A farmácia confirma ao responder
                      </button>
                    )
                  })}
                  {/* Dia de fecho: a nota abaixo já explica; a grelha não
                      precisa de repetir a mesma frase. */}
                  {slots.length === 0 && !closedDay && (
                    <p className="sh-empty-sub" style={{ gridColumn: '1 / -1' }}>
                      {pickup.date
                        ? 'As janelas de hoje já fecharam — escolha amanhã ou escreva a hora no campo acima.'
                        : 'A preparar as janelas do dia…'}
                    </p>
                  )}
                </div>

                <p
                  className={`res-when-note${
                    pickup.past || closedDay ? ' res-when-note--bad' : ''
                  }`}
                >
                  {closedDay
                    ? 'A farmácia não abre nesse dia — escolha outro dia.'
                    : pickup.past
                      ? 'Essa hora já passou — escolha outra.'
                      : pickup.label
                        ? `Marcado: ${pickup.label}`
                        : 'Escolha o dia e a hora a que passa pela farmácia.'}
                </p>

                <div className="res-summary">
                  <span>Estimativa a pagar no balcão</span>
                  <b className="cf-num">{estimate != null ? fmtKz(estimate) : 'No balcão'}</b>
                </div>
                <div className="res-actions">
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    onClick={() => setMode('contacto')}
                    disabled={!pickup.label || pickup.past || closedDay}
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--ghost"
                    onClick={() => setMode('ficha')}
                  >
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
                    <b>{pickup.label || 'A combinar com a farmácia'}</b>
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
                <b>{pickup.label || 'A combinar com a farmácia'}</b>
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
