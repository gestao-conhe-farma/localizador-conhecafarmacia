'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchPharmacyStockClient, pharmacyFromStockRow } from '@/lib/stock'
import { usePharmacyStockRealtime } from '@/lib/use-pharmacy-stock-realtime'
import { openStatus } from '@/lib/opening-hours'
import { monthYear } from '@/lib/expiry'
import { logError } from '@/lib/log'
import ReserveModal from '@/components/search/ReserveModal'
import { formatOptionLabel, formatPerBase, unitLabel } from '@/lib/sale-options'

import { fmtKzPublic as fmtKz } from '@/lib/reservation-format'

import { originCode } from '@/lib/origin-flags'

/** Etiquetas de origem/marca (0013) — reutilizadas nas duas vistas. */
function OriginBrandTags({ item }) {
  if (!item.origin && !item.brand) return null
  return (
    <div className="drug-card-origin">
      {item.brand && <span className="origin-tag origin-tag--brand">{item.brand}</span>}
      {item.origin && (
        <span className="origin-tag">
          {originCode(item.origin) && (
            <span className="origin-code">{originCode(item.origin)}</span>
          )}{' '}
          {item.origin}
        </span>
      )}
    </div>
  )
}

/**
 * Preço com opções de venda (0012): se o item tem opções, mostra uma
 * etiqueta por forma ("Lâmina · 100 Kz" / "Caixa (3 lâminas) · 300 Kz");
 * sem opções, o preço único legado como sempre.
 */
function PriceWithOptions({ item, fmt }) {
  const opts = item.sale_options || []
  if (opts.length === 0) {
    return item.price != null ? <span className="price">{fmt(item.price)}</span> : null
  }
  const baseOpt = opts.find((o) => o.is_default)
  const baseLabel = baseOpt ? unitLabel(baseOpt.unit) : null
  return (
    <div className="sale-tags">
      {opts.map((o) => {
        const per = formatPerBase(o, baseLabel)
        return (
          <span key={o.id} className="sale-tag">
            {formatOptionLabel(o, baseLabel)}
            {o.price != null && <b> · {fmt(o.price)}</b>}
            {per && <i> {per}</i>}
          </span>
        )
      })}
    </div>
  )
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

export default function PharmacyStock({ slug, initialItems = null }) {
  // initialItems vem do servidor (página server-side): o HTML já contém o
  // stock — sem flash de spinner. Se null (fetch falhou/omisso), o cliente
  // busca como antes.
  const [items, setItems] = useState(initialItems)
  const [pharmacy, setPharmacy] = useState(() => pharmacyFromStockRow(initialItems?.[0]))
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [openForms, setOpenForms] = useState({}) //{} = primeira secção aberta por defeito
  // Item com modal de reserva aberto (null = fechado).
  const [reserving, setReserving] = useState(null)

  // Refetch partilhado: carga inicial (se o server-side falhou/omitiu) e
  // refetch em resposta a eventos Realtime — a mesma lógica para os dois.
  const refetch = useCallback(async () => {
    try {
      const data = await fetchPharmacyStockClient(slug)
      setItems(data || [])
      setPharmacy(pharmacyFromStockRow(data?.[0]))
      setError(false)
    } catch (err) {
      logError('pharmacy-stock', 'Falha ao carregar stock da farmácia', {
        slug,
        message: err?.message || String(err),
        code: err?.code,
        details: err?.details,
      })
      // Só marca erro se ainda não haver nada para mostrar — em refetches
      // Realtime mantemos os dados actuais (melhor dado velho que página em branco).
      setError((had) => had || items === null)
    }
  }, [slug, items])

  useEffect(() => {
    // Hidratado pelo servidor — nada a fazer (mas refetch leve se o utilizador
    // navegar de volta e os dados tiverem >5 min, mantendo a frescura da 72h)
    if (initialItems) return
    refetch()
  }, [slug, initialItems, refetch])

  // T12: refresca sem reload quando a farmácia guarda stock no portal
  usePharmacyStockRealtime(slug, refetch)

  // Agrupar por forma farmacêutica; críticos destacados à parte
  const { criticals, groups } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (items || []).filter(
      (it) =>
        !q ||
        it.drug_name.toLowerCase().includes(q) ||
        (it.drug_molecule || '').toLowerCase().includes(q),
    )
    const crit = []
    const byForm = new Map()
    for (const it of filtered) {
      if (it.drug_priority === 'critico') crit.push(it)
      const key = it.drug_form || 'Outros'
      if (!byForm.has(key)) byForm.set(key, [])
      byForm.get(key).push(it)
    }
    return { criticals: crit, groups: [...byForm.entries()] }
  }, [items, query])

  const status = pharmacy ? openStatus(pharmacy.opening_hours) : null

  // Confirmação mais recente de todas — alimenta o dot do hero com dado real
  const freshestLabel = useMemo(() => {
    if (!items || items.length === 0) return null
    const min = Math.min(...items.map((i) => new Date(i.confirmed_at).getTime()))
    return timeAgo(new Date(min).toISOString())
  }, [items])

  // farmácia inexistente ou sem stock confirmado no momento
  if (items !== null && items.length === 0 && !error) {
    return (
      <div className="search-page">
        <div className="empty-state">
          <p className="empty-title">Ainda sem stock confirmado</p>
          <p className="empty-sub">
            Esta farmácia não tem medicamentos confirmados nas últimas 72 horas — ou o endereço não
            corresponde a uma farmácia parceira activa.
          </p>
          <Link href="/pesquisa" className="btn btn-primary">
            Ir para a pesquisa
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* HERO — kicker + título serif + status em dots (Modelo F) */}
      <section className="ph-hero">
        <div className="ph-hero-inner">
          <div>
            {pharmacy ? (
              <>
                <p className="kicker">Farmácia parceira · {pharmacy.municipio}</p>
                <h1 className="ph-name">{pharmacy.name}</h1>
                <p className="ph-loc">
                  {pharmacy.address ? `${pharmacy.address} · ` : ''}
                  {pharmacy.opening_hours || ''}
                </p>
                <div className="ph-badges">
                  {status && (
                    <span className={status.open ? 'badge--open' : 'badge--closed'}>
                      <i className={status.open ? 'dot-g' : 'dot-r'} />
                      {status.label}
                    </span>
                  )}
                  {freshestLabel && (
                    <span>
                      <i className="dot-g" />
                      Stock confirmado {freshestLabel}
                    </span>
                  )}
                  {pharmacy.verified && (
                    <span>
                      <i className="dot-g" />
                      Verificada pela equipa
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="skeleton-line" style={{ width: 260, height: 28 }} />
                <div className="skeleton-line mt-2" style={{ width: 180, height: 14 }} />
              </>
            )}
          </div>
          {pharmacy && (
            <div className="ph-actions">
              {pharmacy.phone && (
                <a
                  href={`tel:${pharmacy.phone.replace(/\s/g, '')}`}
                  className="btn btn-small btn-primary"
                >
                  Ligar: {pharmacy.phone}
                </a>
              )}
              {pharmacy.maps_url || (pharmacy.lat && pharmacy.lng) || pharmacy.address ? (
                <a
                  href={
                    pharmacy.maps_url ||
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      pharmacy.lat && pharmacy.lng
                        ? `${pharmacy.lat},${pharmacy.lng}`
                        : `${pharmacy.name} ${pharmacy.address} ${pharmacy.municipio}`,
                    )}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-maps"
                >
                  Google Maps
                </a>
              ) : null}
              {pharmacy.whatsapp && (
                <a
                  href={`https://wa.me/${pharmacy.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                    'Olá! Encontrei a farmácia no Localizador da Conheça Farmácia.',
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-small btn-wa"
                >
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>

        {/* Pesquisa in-page — parte do hero, sem linha a separar */}
        <div className="ph-hero-search">
          <div className="search-box">
            <span className="search-box-icon" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Pesquisar dentro desta farmácia…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Pesquisar medicamento nesta farmácia"
            />
          </div>
        </div>
      </section>

      {/* CONTEÚDO — fundo alternativo */}
      <section className="search-results-section">
        <div className="search-container">
          {error && (
            <div className="empty-state" role="alert">
              <p className="empty-title">Algo falhou</p>
              <p className="empty-sub">
                Não foi possível carregar o stock. Tente novamente mais tarde.
              </p>
            </div>
          )}

          {!error && items === null && (
            <div className="empty-state" role="status">
              <div className="spinner" />
            </div>
          )}

          {!error && items !== null && (
            <>
              {/* CRÍTICOS — painel verde-água com borda esquerda (meio-termo A×D) */}
              {criticals.length > 0 && !query && (
                <section className="crit-section">
                  <div className="crit-panel">
                    <p className="crit-k">Críticos em stock — prioridade máxima</p>
                    {criticals.map((it) => (
                      <div key={it.stock_item_id} className="crit-item">
                        <div>
                          <div className="crit-name">
                            {it.drug_name}
                            {it.drug_requires_rx && (
                              <span className="rx-badge rx-badge--inline">Receita médica</span>
                            )}
                          </div>
                          <OriginBrandTags item={it} />
                          <div className="crit-meta">
                            {[it.drug_form, it.drug_dosage].filter(Boolean).join(' · ')}
                            {it.price != null ? ` · confirmado ${timeAgo(it.confirmed_at)}` : ''}
                            {/* Validade só como mês/ano — sinal de confiança,
                                nunca "expira em X dias" para o cliente. */}
                            {it.expires_at && (
                              <>
                                {' · '}
                                <span className="expiry-tag expiry-tag--ok">
                                  Validade {monthYear(it.expires_at)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="crit-side">
                          <PriceWithOptions item={it} fmt={fmtKz} />
                          <button
                            type="button"
                            className="btn-mini btn-mini--wa"
                            title="Reservar e levantar na farmácia"
                            onClick={() => setReserving(it)}
                          >
                            Reservar
                          </button>
                          {it.pharmacy_whatsapp && (
                            <a
                              href={`https://wa.me/${it.pharmacy_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                `Olá! Vi no Localizador que têm ${it.drug_name} em stock. Podem confirmar, por favor?`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-mini btn-mini--wa"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ACCORDIONS EDITORIAIS — secções planas separadas por hairlines */}
              {groups.length > 0 && (
                <div className="ph-accordions">
                  {groups.map(([form, list], gi) => {
                    const isOpen = openForms[form] ?? gi === 0
                    return (
                      <div key={form} className={`acc${isOpen ? ' acc--open' : ''}`}>
                        <button
                          type="button"
                          className="acc-head"
                          onClick={() =>
                            setOpenForms((o) => ({ ...o, [form]: !(o[form] ?? gi === 0) }))
                          }
                          aria-expanded={isOpen}
                        >
                          <span className="acc-name">
                            {form.charAt(0).toUpperCase() + form.slice(1)}
                          </span>
                          <span className="acc-count">
                            {list.length} medicamento{list.length !== 1 && 's'}
                          </span>
                          <svg
                            className="acc-chev"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        <div className="acc-body">
                          {list.map((it) => (
                            <div key={it.stock_item_id} className="stock-row">
                              <div>
                                <div className="stock-row-name">
                                  {it.drug_name}
                                  {it.drug_requires_rx && (
                                    <span className="rx-badge rx-badge--inline">
                                      Receita médica
                                    </span>
                                  )}
                                </div>
                                <OriginBrandTags item={it} />
                                <div className="stock-row-meta">
                                  {it.drug_dosage ? `${it.drug_dosage} · ` : ''}
                                  <span className="stock-confirmed-at">
                                    <span className="confirmed-dot" />
                                    Confirmado {timeAgo(it.confirmed_at)}
                                  </span>
                                  {it.expires_at && (
                                    <>
                                      {' · '}
                                      <span className="expiry-tag expiry-tag--ok">
                                        Validade {monthYear(it.expires_at)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="stock-side">
                                <PriceWithOptions item={it} fmt={fmtKz} />
                                <button
                                  type="button"
                                  className="btn-mini btn-mini--wa"
                                  title="Reservar e levantar na farmácia"
                                  onClick={() => setReserving(it)}
                                >
                                  Reservar
                                </button>
                                {it.pharmacy_whatsapp && (
                                  <a
                                    href={`https://wa.me/${it.pharmacy_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                      `Olá! Vi no Localizador que têm ${it.drug_name} em stock. Podem confirmar, por favor?`,
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-mini btn-mini--wa"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Pesquisa sem resultados dentro da farmácia */}
              {!error && items !== null && criticals.length === 0 && groups.length === 0 && (
                <div className="empty-state">
                  <p className="empty-title">Nada encontrado para &laquo;{query}&raquo;</p>
                  <p className="empty-sub">
                    Tente outro nome — ou pergunte à farmácia directamente pelo WhatsApp.
                  </p>
                </div>
              )}

              {/* Modal de reserva — o mesmo do /pesquisa. */}
              {reserving && <ReserveModal item={reserving} onClose={() => setReserving(null)} />}

              {/* CTA */}
              <div className="search-cta">
                <p className="search-cta-title">É farmácia e quer aparecer aqui?</p>
                <p className="search-cta-sub">
                  Junte-se às parceiras do lançamento do Localizador — gratuitamente.
                </p>
                <a href="/#farmacias" className="btn btn-primary">
                  Quero participar
                </a>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}
