'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isOpenNow } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'

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
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const phRes = await supabase
          .from('pharmacies')
          .select('slug, name, municipio, address, phone, whatsapp, opening_hours, verified')
          .eq('active', true)
          .order('name')
        if (phRes.error) throw phRes.error
        if (!alive) return

        // Contagens via RPC (agregação no Postgres). Fallback: ler a view
        // stock_confirmed e contar no cliente, como antes, até a migração
        // 0003 estar aplicada no projecto Supabase.
        let c = {}
        const rpcRes = await supabase.rpc('pharmacy_stock_counts')
        if (!rpcRes.error) {
          for (const row of rpcRes.data || []) c[row.pharmacy_slug] = Number(row.stock_count)
        } else {
          logWarn('pharmacy-list', 'RPC pharmacy_stock_counts falhou — a usar fallback', {
            message: rpcRes.error.message,
          })
          const stRes = await supabase.from('stock_confirmed').select('pharmacy_slug')
          if (stRes.error) throw stRes.error
          for (const row of stRes.data || []) {
            c[row.pharmacy_slug] = (c[row.pharmacy_slug] || 0) + 1
          }
        }
        if (!alive) return
        setPharmacies(phRes.data || [])
        setCounts(c)
      } catch (err) {
        logError('pharmacy-list', 'Falha ao carregar farmácias', { message: err?.message })
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const visible = useMemo(() => {
    if (!pharmacies) return []
    const list = pharmacies.filter(
      (p) =>
        (!municipio || p.municipio === municipio) &&
        (!onlyOpen || isOpenNow(p.opening_hours))
    )
    // Com stock primeiro, depois ordem alfabética
    return [...list].sort(
      (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) ||
        a.name.localeCompare(b.name, 'pt')
    )
  }, [pharmacies, counts, municipio, onlyOpen])

  const withStock = visible.filter((p) => (counts[p.slug] || 0) > 0).length

  return (
    <>
      {/* Hero — kicker editorial (Modelo F) */}
      <section className="search-hero">
        <div className="search-container">
          <p className="kicker">A rede</p>
          <h1 className="search-hero-title">Farmácias parceiras</h1>
          <p className="search-hero-sub">
            Farmácias de Luanda que confirmam o stock no Localizador — o que expira, sai
            do ar.
          </p>
        </div>
      </section>

      {/* Filtros — zona de "header" da página */}
      <section className="search-filter-section">
        <div className="search-container">
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
          <div className="ph-toolbar" style={{ marginTop: '0.6rem' }}>
            <button
              type="button"
              className={`chip${onlyOpen ? ' chip--active' : ''}`}
              aria-pressed={onlyOpen}
              onClick={() => setOnlyOpen((o) => !o)}
            >
              Só abertas agora
            </button>
          </div>
        </div>
      </section>

      {/* Conteúdo — fundo alternativo */}
      <section className="search-results-section">
        <div className="search-container">
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
                    {onlyOpen && ' · abertas agora'}
                  </span>
                </div>

                {visible.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-title">
                      {onlyOpen
                        ? `Nenhuma farmácia aberta agora${municipio ? ` em ${municipio}` : ''}`
                        : `Ainda não há farmácias em ${municipio}`}
                    </p>
                    <p className="empty-sub">
                      {onlyOpen
                        ? 'Desactive o filtro para ver toda a rede — ou confirme por WhatsApp antes de sair.'
                        : 'Estamos a crescer a rede — a sua zona será coberta em breve.'}
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
                              <span className="ph-ver flex-shrink-0">✓ Verificada</span>
                            )}
                          </div>
                          <p className="ph-card-loc">
                            {p.municipio}
                            {p.address ? ` · ${p.address}` : ''}
                          </p>
                          <div className="ph-card-foot">
                            {n > 0 ? (
                              <span className="ph-count-inline">
                                <b>{n}</b> medicamento{n !== 1 && 's'} agora
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
        </div>
      </section>
    </>
  )
}
