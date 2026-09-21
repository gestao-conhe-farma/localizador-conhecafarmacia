'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const fmtKz = (n) =>
  new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(n) + ' Kz'

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

/**
 * "Aberto agora" a partir do opening_hours guardado pelas farmácias.
 * Aceita "Seg–Sáb · 07:30–19:00" e "Todos os dias · 24 horas".
 * Só regista false quando tem a certeza — em caso de dúvida, devolve
 * null (o badge não aparece em vez de mentir).
 */
function openStatus(openingHours) {
  if (!openingHours) return null
  const h = openingHours.toLowerCase()
  if (h.includes('24')) return { open: true, label: 'Aberto 24 horas' }

  const m = h.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  const openMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const open = cur >= openMin && cur < closeMin
  return {
    open,
    label: open ? `Aberto agora · fecha às ${m[3]}:${m[4]}` : 'Fechado',
  }
}

const FORM_ICONS = {
  comprimido: (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="8" width="16" height="8" rx="4" />
      <line x1="12" y1="8" x2="12" y2="16" opacity="0.4" />
    </svg>
  ),
  injetável: (
    <svg viewBox="0 0 24 24">
      <path d="M9 3h6v4l2 3v10a1 1 0 01-1 1H8a1 1 0 01-1-1V10l2-3z" />
      <line x1="7" y1="14" x2="17" y2="14" opacity="0.4" />
    </svg>
  ),
  cápsula: (
    <svg viewBox="0 0 24 24">
      <ellipse cx="12" cy="6" rx="6" ry="2.5" />
      <path d="M6 6v12c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
    </svg>
  ),
  inalador: (
    <svg viewBox="0 0 24 24">
      <rect x="8" y="7" width="8" height="13" rx="2" />
      <path d="M10 7V4h4v3" />
    </svg>
  ),
}

function FormIcon({ form }) {
  const key = Object.keys(FORM_ICONS).find((k) =>
    (form || '').toLowerCase().includes(k)
  )
  return (
    <span className="acc-icon">
      {FORM_ICONS[key] || FORM_ICONS['comprimido']}
    </span>
  )
}

export default function PharmacyStock({ slug }) {
  const [pharmacy, setPharmacy] = useState(null)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [openForms, setOpenForms] = useState({}) //{} = primeira secção aberta por defeito

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data, error: err } = await supabase
          .from('stock_confirmed')
          .select('*')
          .eq('pharmacy_slug', slug)
          .order('confirmed_at', { ascending: false })
        if (err) throw err
        if (!alive) return
        setItems(data || [])
        if (data && data.length > 0) {
          const p = data[0]
          setPharmacy({
            name: p.pharmacy_name,
            municipio: p.pharmacy_municipio,
            address: p.pharmacy_address,
            lat: p.pharmacy_lat,
            lng: p.pharmacy_lng,
            opening_hours: p.pharmacy_opening_hours,
            phone: p.pharmacy_phone,
            whatsapp: p.pharmacy_whatsapp,
            verified: p.pharmacy_verified,
          })
          document.title = `${p.pharmacy_name} — Localizador de Medicamentos`
        }
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

  // Agrupar por forma farmacêutica; críticos destacados à parte
  const { criticals, groups } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (items || []).filter(
      (it) =>
        !q ||
        it.drug_name.toLowerCase().includes(q) ||
        (it.drug_molecule || '').toLowerCase().includes(q)
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

  //farmácia inexistente ou sem stock confirmado no momento
  if (items !== null && items.length === 0 && !error) {
    return (
      <div className="search-page">
        <div className="empty-state">
          <p className="empty-title">Ainda sem stock confirmado</p>
          <p className="empty-sub">
            Esta farmácia não tem medicamentos confirmados nas últimas 72 horas — ou o
            endereço não corresponde a uma farmácia parceira activa.
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
      {/* HERO */}
      <section className="ph-hero">
        <div className="ph-hero-inner">
          <div>
            {pharmacy ? (
              <>
                <h1 className="ph-name">{pharmacy.name}</h1>
                <p className="ph-loc">
                  {pharmacy.municipio}
                  {pharmacy.address ? ` · ${pharmacy.address}` : ''}
                  {pharmacy.opening_hours ? ` · ${pharmacy.opening_hours}` : ''}
                </p>
                <div className="ph-badges">
                  {pharmacy.verified && (
                    <span className="badge badge--verified">✓ Verificada pela equipa</span>
                  )}
                  {status && (
                    <span
                      className={`badge ${status.open ? 'badge--open' : 'badge--closed'}`}
                    >
                      <span className="confirmed-dot" />
                      {status.label}
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
                <a href={`tel:${pharmacy.phone.replace(/\s/g, '')}`} className="btn btn-small btn-primary">
                  Ligar: {pharmacy.phone}
                </a>
              )}
              {(pharmacy.lat && pharmacy.lng) || pharmacy.address ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    pharmacy.lat && pharmacy.lng
                      ? `${pharmacy.lat},${pharmacy.lng}`
                      : `${pharmacy.name} ${pharmacy.address} ${pharmacy.municipio}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-small btn-secondary"
                >
                  Ver no Google Maps
                </a>
              ) : null}
              {pharmacy.whatsapp && (
                <a
                  href={`https://wa.me/${pharmacy.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                    'Olá! Encontrei a farmácia no Localizador da Conheça Farmácia.'
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
      </section>

      {/* PESQUISA IN-PAGE — zona de "header" */}
      <section className="search-filter-section" style={{ padding: '1.25rem 0' }}>
        <div className="search-container">
          <div className="search-box">
            <span className="search-box-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              {/* CRÍTICOS EM STOCK */}
              {criticals.length > 0 && !query && (
                <section className="crit-section">
                  <div className="crit-head">
                    <h2 className="section-title">Críticos em stock</h2>
                    <span className="crit-note">prioridade máxima</span>
                    <span className="section-sub">medicamentos que mais faltam em Luanda</span>
                  </div>
                  <div className="crit-grid">
                    {criticals.map((it) => (
                      <article key={it.stock_item_id} className="dcard">
                        <div className="dcard-body">
                          <div className="dcard-top">
                            <h3 className="dcard-name">{it.drug_name}</h3>
                            {it.drug_requires_rx && (
                              <span className="rx-badge">Receita médica</span>
                            )}
                          </div>
                          <p className="dcard-meta">
                            {[it.drug_form, it.drug_dosage].filter(Boolean).join(' · ')}
                          </p>
                          <div className="dcard-foot">
                            <div>
                              {it.price != null && <div className="dcard-price">{fmtKz(it.price)}</div>}
                              <span className="stock-confirmed-at">
                                <span className="confirmed-dot" />
                                Confirmado {timeAgo(it.confirmed_at)}
                              </span>
                            </div>
                            {it.pharmacy_whatsapp && (
                              <a
                                href={`https://wa.me/${it.pharmacy_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `Olá! Vi no Localizador que têm ${it.drug_name} em stock. Podem confirmar, por favor?`
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
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* ACCORDIONS POR FORMA */}
              {groups.length > 0 && (
                <div className="ph-accordions">
                  {groups.map(([form, list], gi) => {
                    const isOpen = openForms[form] ?? gi === 0
                    return (
                      <div key={form} className={`acc${isOpen ? ' acc--open' : ''}`}>
                        <button
                          type="button"
                          className="acc-head"
                          onClick={() => setOpenForms((o) => ({ ...o, [form]: !(o[form] ?? gi === 0) }))}
                          aria-expanded={isOpen}
                        >
                          <FormIcon form={form} />
                          <span className="acc-title">
                            <span className="acc-name">{form}</span>
                          </span>
                          <span className="acc-count">
                            {list.length} medicamento{list.length !== 1 && 's'}
                          </span>
                          <svg className="acc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                    <span className="rx-badge rx-badge--inline">Receita médica</span>
                                  )}
                                </div>
                                <div className="stock-row-meta">
                                  {it.drug_dosage ? `${it.drug_dosage} · ` : ''}
                                  <span className="stock-confirmed-at">
                                    <span className="confirmed-dot" />
                                    Confirmado {timeAgo(it.confirmed_at)}
                                  </span>
                                </div>
                              </div>
                              <div className="stock-side">
                                {it.price != null && <span className="dcard-price">{fmtKz(it.price)}</span>}
                                {it.pharmacy_whatsapp && (
                                  <a
                                    href={`https://wa.me/${it.pharmacy_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                      `Olá! Vi no Localizador que têm ${it.drug_name} em stock. Podem confirmar, por favor?`
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
