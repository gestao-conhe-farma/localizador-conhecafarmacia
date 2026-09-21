'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

export default function PharmacyStock({ slug }) {
  const [pharmacy, setPharmacy] = useState(null)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data, error: err } = await supabase
          .from('stock_confirmed')
          .select('*')
          .eq('pharmacy_slug', slug)
          .order('drug_name')
        if (err) throw err
        if (!alive) return
        setItems(data || [])
        if (data && data.length > 0) {
          const p = data[0]
          const ph = {
            name: p.pharmacy_name,
            municipio: p.pharmacy_municipio,
            address: p.pharmacy_address,
            opening_hours: p.pharmacy_opening_hours,
            phone: p.pharmacy_phone,
            whatsapp: p.pharmacy_whatsapp,
          }
          setPharmacy(ph)
          document.title = `${ph.name} — Localizador de Medicamentos`
        }
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

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
      {/* Hero */}
      <section className="pharmacy-hero">
        <div className="pharmacy-hero-inner">
          <div>
            {pharmacy ? (
              <>
                <h1 className="pharmacy-name">{pharmacy.name}</h1>
                <p className="pharmacy-loc">
                  {pharmacy.municipio}
                  {pharmacy.address ? ` · ${pharmacy.address}` : ''}
                  {pharmacy.opening_hours ? ` · ${pharmacy.opening_hours}` : ''}
                </p>
              </>
            ) : (
              <>
                <div className="skeleton-line" style={{ width: 260, height: 28 }} />
                <div className="skeleton-line mt-2" style={{ width: 180, height: 14 }} />
              </>
            )}
          </div>
          {pharmacy && (
            <div className="pharmacy-badges">
              <span className="badge badge--verified">Stock confirmado pela farmácia</span>
              {pharmacy.phone && (
                <a
                  href={`tel:${pharmacy.phone.replace(/\s/g, '')}`}
                  className="btn-mini btn-mini--phone"
                >
                  {pharmacy.phone}
                </a>
              )}
              {pharmacy.whatsapp && (
                <a
                  href={`https://wa.me/${pharmacy.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-mini btn-mini--wa"
                >
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Stock */}
      <section className="stock-section">
        <h2 className="text-xl font-bold text-brand-deep mb-6">
          Medicamentos com stock confirmado
        </h2>

        {error && (
          <div className="empty-state" role="alert">
            <p className="empty-title">Algo falhou</p>
            <p className="empty-sub">
              Não foi possível carregar o stock. Tente novamente mais tarde.
            </p>
          </div>
        )}

        {!error && items === null && (
          <div className="stock-list p-10" role="status">
            <div className="spinner" />
          </div>
        )}

        {!error && items !== null && items.length > 0 && (
          <div className="stock-list">
            {items.map((it) => (
              <div key={it.stock_item_id} className="stock-row">
                <div>
                  <div className="stock-row-name">{it.drug_name}</div>
                  <div className="stock-row-meta">
                    {[it.drug_form, it.drug_dosage].filter(Boolean).join(' · ')}
                    {it.drug_requires_rx && ' · receita médica'}
                  </div>
                </div>
                <span className="stock-confirmed-at">
                  <span className="confirmed-dot" />
                  Confirmado {timeAgo(it.confirmed_at)}
                </span>
              </div>
            ))}
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
      </section>
    </>
  )
}
