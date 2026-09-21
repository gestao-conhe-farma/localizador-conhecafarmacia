'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const MUNICIPIOS = [
  'Belas',
  'Cacuaco',
  'Cazenga',
  'Ícolo e Bengo',
  'Luanda',
  'Quilamba Quiaxi',
  'Quissama',
  'Talatona',
  'Viana',
]

export default function PharmacyList() {
  const [pharmacies, setPharmacies] = useState(null)
  const [counts, setCounts] = useState({})
  const [municipio, setMunicipio] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const [phRes, stRes] = await Promise.all([
          supabase
            .from('pharmacies')
            .select('slug, name, municipio, address, phone, whatsapp, verified')
            .eq('active', true)
            .order('name'),
          supabase.from('stock_confirmed').select('pharmacy_slug, confirmed_at'),
        ])
        if (phRes.error) throw phRes.error
        if (!alive) return

        setPharmacies(phRes.data || [])
        const c = {}
        for (const row of stRes.data || []) {
          c[row.pharmacy_slug] = (c[row.pharmacy_slug] || 0) + 1
        }
        setCounts(c)
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const visible = useMemo(() => {
    if (!pharmacies) return []
    const list = municipio
      ? pharmacies.filter((p) => p.municipio === municipio)
      : pharmacies
    // Com stock primeiro, depois ordem alfabética
    return [...list].sort(
      (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) ||
        a.name.localeCompare(b.name, 'pt')
    )
  }, [pharmacies, counts, municipio])

  const withStock = pharmacies
    ? pharmacies.filter((p) => (counts[p.slug] || 0) > 0).length
    : 0

  return (
    <>
      <h1 className="search-title">Farmácias parceiras</h1>
      <p className="search-sub">
        Farmácias de Luanda que confirmam o stock no Localizador — sempre com dados
        das últimas 72 horas.
      </p>

      {/* Filtro por município */}
      <div className="ph-toolbar" role="group" aria-label="Filtrar por município">
        <button
          type="button"
          className={`chip${municipio === '' ? ' chip--active' : ''}`}
          onClick={() => setMunicipio('')}
        >
          Todos
        </button>
        {MUNICIPIOS.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip${municipio === m ? ' chip--active' : ''}`}
            onClick={() => setMunicipio(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-10">
        {error && (
          <div className="empty-state" role="alert">
            <p className="empty-title">Algo falhou</p>
            <p className="empty-sub">
              Não foi possível carregar a lista de farmácias. Tente novamente.
            </p>
          </div>
        )}

        {!error && pharmacies === null && (
          <div className="empty-state" role="status">
            <div className="spinner" />
            <p className="empty-sub mt-3">A carregar…</p>
          </div>
        )}

        {!error && pharmacies !== null && (
          <>
            <div className="ph-list-head">
              <span className="ph-count">
                <strong>{visible.length}</strong> farmácia{visible.length !== 1 && 's'}
                {municipio ? ` em ${municipio}` : ' em Luanda'} ·{' '}
                <strong>{withStock}</strong> com stock confirmado agora
              </span>
            </div>

            {visible.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">Ainda não há farmácias em {municipio}</p>
                <p className="empty-sub">
                  Estamos a crescer a rede — a sua zona será coberta em breve.
                </p>
              </div>
            ) : (
              <div className="ph-grid">
                {visible.map((p) => {
                  const n = counts[p.slug] || 0
                  return (
                    <article key={p.slug} className="ph-card">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={`/farmacia/${p.slug}`}
                          className="ph-card-name"
                        >
                          {p.name}
                        </Link>
                        {p.verified && (
                          <span className="badge badge--verified flex-shrink-0">
                            Parceira
                          </span>
                        )}
                      </div>
                      <p className="ph-card-loc">
                        {p.municipio}
                        {p.address ? ` · ${p.address}` : ''}
                      </p>
                      <div className="ph-card-foot">
                        {n > 0 ? (
                          <span className="confirmed-badge">
                            <span className="confirmed-dot" />
                            {n} medicamento{n !== 1 && 's'} confirmado{n !== 1 && 's'}
                          </span>
                        ) : (
                          <span className="ph-card-hint">
                            Sem stock confirmado no momento
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          {p.phone && (
                            <a
                              href={`tel:${p.phone.replace(/\s/g, '')}`}
                              className="btn-mini btn-mini--phone"
                            >
                              Ligar
                            </a>
                          )}
                          {p.whatsapp && (
                            <a
                              href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                                'Olá! Encontrei a farmácia no Localizador da Conheça Farmácia.'
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
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
