'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { openStatus } from '@/lib/opening-hours'
import { logError, logWarn } from '@/lib/log'
import { useUserLocation } from '@/lib/use-user-location'
import {
  distanceKm,
  formatDistance,
  geolocationErrorMessage,
  pharmacyPosition,
  sortByDistance,
} from '@/lib/geo'
import { PROVINCIAS, municipiosDaProvincia } from '@/lib/constants'

const ICON_SEARCH = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

/**
 * Cartão de farmácia no desenho de loja (Modelo D): a "montra" é
 * tipográfica — nome, município e quantos produtos estão confirmados —
 * em vez de uma foto que não temos. A acção leva à prateleira.
 */
function StoreCard({ pharmacy, count, distance, approximate = false }) {
  const status = openStatus(pharmacy.opening_hours)
  const open = status?.open
  // Dia de descanso: «Fechada hoje» é mais útil do que um «Fechada» que
  // sugere apenas que já passou das horas.
  const statusLabel = !status
    ? 'Horário'
    : open
      ? 'Aberta'
      : status.closedToday
        ? 'Fechada hoje'
        : 'Fechada'
  const distLabel = distance != null ? formatDistance(distance) : null
  return (
    <Link
      href={`/farmacia/${pharmacy.slug}`}
      className="pcard"
      aria-label={`${pharmacy.name} — ver prateleira`}
    >
      <div className="pcard-media">
        <div className="pcard-flags">
          {pharmacy.verified && <span className="tagchip">Verificada</span>}
          {count > 0 ? (
            <span className="tagchip">{count} em stock</span>
          ) : (
            <span className="tagchip">Sem stock</span>
          )}
        </div>
        <div className="pack">
          <span className="pack-brand">Farmácia parceira</span>
          <span className="pack-name">{pharmacy.name}</span>
          <span className="pack-dose">{pharmacy.municipio || 'Luanda'}</span>
          <span className="pack-foot">
            <span>{pharmacy.municipio || 'Luanda'}</span>
            <span>{count > 0 ? 'Confirmado hoje' : 'Aguarda stock'}</span>
          </span>
        </div>
      </div>

      <div className="pcard-body">
        <span className="pcard-name">{pharmacy.name}</span>
        <span className="pcard-meta">
          {[pharmacy.municipio, pharmacy.address].filter(Boolean).join(' · ')}
        </span>
        <div className="pcard-pricerow">
          <div>
            <span className="price" style={{ fontSize: 15 }}>
              {count > 0
                ? `${count} produto${count === 1 ? '' : 's'} confirmado${count === 1 ? '' : 's'}`
                : 'Sem stock confirmado'}
            </span>
            <div className="pcard-unit">{pharmacy.opening_hours || 'Horário não indicado'}</div>
          </div>
          <span className="pcard-fresh">
            <i className={`cf-dot${status && !open ? ' cf-dot--off' : ''}`} />
            {statusLabel}
          </span>
        </div>

        {distLabel && (
          <div className="location-row">
            <span
              className="dist-pill"
              title={
                approximate
                  ? 'Distância aproximada — a farmácia ainda não tem coordenadas exactas'
                  : 'Distância em linha recta'
              }
            >
              {approximate ? '≈' : ''} {distLabel}
            </span>
            {approximate && <span style={{ fontSize: 10.5 }}>centro do município</span>}
          </div>
        )}
      </div>

      <span className={`pcard-cta${count === 0 ? ' pcard-cta--quiet' : ''}`}>
        {count > 0 ? 'Ver prateleira' : 'Ver farmácia'}
      </span>
    </Link>
  )
}

export default function PharmacyList() {
  const [pharmacies, setPharmacies] = useState(null)
  const [counts, setCounts] = useState({})
  const [provincia, setProvincia] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  // Posição do visitante (só depois de ele pedir) e o filtro «perto de mim».
  const {
    location,
    status: locStatus,
    permission: geoPermission,
    request: requestLocation,
  } = useUserLocation()
  const [nearMe, setNearMe] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const phRes = await supabase
          .from('pharmacies')
          .select(
            'slug, name, municipio, address, phone, whatsapp, opening_hours, verified, lat, lng',
          )
          .eq('active', true)
          .order('name')
        if (phRes.error) throw phRes.error
        if (!alive) return

        // Contagens via RPC (agregação no Postgres). Fallback: ler a view
        // stock_confirmed e contar no cliente, até a migração 0003 estar
        // aplicada no projecto Supabase.
        const c = {}
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
    const q = query.trim().toLowerCase()
    // Província é o primeiro filtro; o município, quando escolhido, é mais
    // estreito. Sem nenhum dos dois, entra a rede toda.
    const daProvincia = provincia ? municipiosDaProvincia(provincia) : null
    const list = pharmacies.filter(
      (p) =>
        (!municipio || p.municipio === municipio) &&
        (!daProvincia || daProvincia.includes(p.municipio)) &&
        (!onlyOpen || openStatus(p.opening_hours)?.open === true) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.municipio || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)),
    )
    // Com stock primeiro, depois ordem alfabética.
    const byStock = [...list].sort(
      (a, b) => (counts[b.slug] || 0) - (counts[a.slug] || 0) || a.name.localeCompare(b.name, 'pt'),
    )
    // «Perto de mim» ganha à ordem por stock: quem pediu distância quer a
    // mais próxima primeiro, mesmo que tenha menos produtos.
    return nearMe && location ? sortByDistance(byStock, location, pharmacyPosition) : byStock
  }, [pharmacies, counts, provincia, municipio, onlyOpen, query, nearMe, location])

  const toggleNear = async () => {
    if (nearMe) {
      setNearMe(false)
      return
    }
    if (location) {
      setNearMe(true)
      return
    }
    const coords = await requestLocation()
    if (coords) setNearMe(true)
  }

  const withStock = visible.filter((p) => (counts[p.slug] || 0) > 0).length

  return (
    <>
      <section className="shop-hero shop-hero--tools">
        <div className="cf-wrap shop-hero-grid shop-hero-grid--solo">
          <div>
            <p className="cf-kicker">A rede</p>
            <h1>
              Farmácias que
              <br />
              dizem <em>o que têm.</em>
            </h1>
            <p className="shop-hero-sub">
              As farmácias parceiras que confirmam o stock no portal — e o que está disponível
              agora.
            </p>

            {/* Pesquisa e municípios no cabeçalho, como em /pesquisa: a
                caixa e os chips vivem no hero, não na barra da lista. */}
            <div className="shop-search shop-search--live">
              <div className="cf-field-wrap">
                <span className="cf-ico" aria-hidden="true">
                  {ICON_SEARCH}
                </span>
                <label className="cf-sr" htmlFor="q-store">
                  Procurar farmácia
                </label>
                <input
                  id="q-store"
                  className="cf-field"
                  type="search"
                  placeholder="Nome, município ou morada"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="sh-toolbar" role="group" aria-label="Filtrar por província">
              <span className="sh-toolbar-label">Província</span>
              <button
                type="button"
                className={`cf-chip${provincia === '' ? ' cf-chip--on' : ''}`}
                onClick={() => {
                  setProvincia('')
                  setMunicipio('')
                }}
              >
                Todas
              </button>
              {PROVINCIAS.map((p) => (
                <button
                  key={p.nome}
                  type="button"
                  className={`cf-chip${provincia === p.nome ? ' cf-chip--on' : ''}`}
                  onClick={() => {
                    setProvincia(provincia === p.nome ? '' : p.nome)
                    setMunicipio('')
                  }}
                >
                  {p.nome}
                </button>
              ))}
            </div>

            {/* Os municípios só aparecem depois de escolher a província. */}
            {provincia ? (
              <div
                className="sh-toolbar sh-toolbar--sub"
                role="group"
                aria-label="Filtrar por município"
              >
                <span className="sh-toolbar-label">Município</span>
                <button
                  type="button"
                  className={`cf-chip${municipio === '' ? ' cf-chip--on' : ''}`}
                  onClick={() => setMunicipio('')}
                >
                  Todos
                </button>
                {municipiosDaProvincia(provincia).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cf-chip${municipio === m ? ' cf-chip--on' : ''}`}
                    onClick={() => setMunicipio(municipio === m ? '' : m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="sh-section">
        <div className="cf-wrap">
          <div className="sh-bar">
            <div className="sh-bar-l">
              <h2>Prateleiras da rede</h2>
              <span className="sh-bar-sub">
                {pharmacies === null
                  ? 'a carregar…'
                  : `${visible.length} farmácia${visible.length === 1 ? '' : 's'}${
                      municipio ? ` em ${municipio}` : provincia ? ` em ${provincia}` : ' na rede'
                    } · ${withStock} com stock confirmado agora`}
              </span>
            </div>
            <div className="sh-filters">
              <button
                type="button"
                className={`cf-chip${!onlyOpen ? ' cf-chip--on' : ''}`}
                onClick={() => setOnlyOpen(false)}
              >
                Todas
              </button>
              <button
                type="button"
                className={`cf-chip${onlyOpen ? ' cf-chip--on' : ''}`}
                aria-pressed={onlyOpen}
                onClick={() => setOnlyOpen((o) => !o)}
              >
                Abertas agora
              </button>
              <button
                type="button"
                className={`cf-chip${nearMe ? ' cf-chip--on' : ''}`}
                aria-pressed={nearMe}
                onClick={toggleNear}
                disabled={locStatus === 'asking'}
                title="Ordenar pela distância à sua localização actual"
              >
                {locStatus === 'asking' ? 'A obter…' : 'Perto de mim'}
              </button>
            </div>
          </div>

          {locStatus === 'PERMISSAO' && (
            <p className="location-note">
              {geolocationErrorMessage(locStatus, geoPermission)} A lista continua ordenada por
              stock.
            </p>
          )}
          {(locStatus === 'INDISPONIVEL' ||
            locStatus === 'TEMPO' ||
            locStatus === 'SEM_SUPORTE') && (
            <p className="location-note">
              {geolocationErrorMessage(locStatus)} A rede continua disponível por ordem de stock.
            </p>
          )}
          {nearMe && location && (
            <p className="location-note">
              Distâncias em linha recta a partir de si, calculadas no browser — a sua posição não é
              enviada para nenhum servidor. O «≈» marca as farmácias que ainda não têm coordenadas
              próprias (usamos o centro do município).
            </p>
          )}

          {error && (
            <div className="sh-empty" role="alert">
              <p className="sh-empty-title">Algo falhou</p>
              <p className="sh-empty-sub">
                Não foi possível carregar a lista de farmácias. Tente novamente.
              </p>
            </div>
          )}

          {!error && pharmacies === null && (
            <div className="sh-empty" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A carregar farmácias…</p>
            </div>
          )}

          {!error && pharmacies !== null && visible.length === 0 && (
            <div className="sh-empty">
              <p className="sh-empty-title">
                {onlyOpen
                  ? `Nenhuma farmácia aberta agora${
                      municipio ? ` em ${municipio}` : provincia ? ` em ${provincia}` : ''
                    }`
                  : `Ainda não há farmácias em ${municipio || provincia || 'Luanda'}`}
              </p>
              <p className="sh-empty-sub">
                {onlyOpen
                  ? 'Desactive o filtro para ver toda a rede — ou confirme por WhatsApp antes de sair.'
                  : 'Estamos a crescer a rede — a sua zona será coberta em breve.'}
              </p>
            </div>
          )}

          {!error && pharmacies !== null && visible.length > 0 && (
            <div className="pcard-grid" style={{ marginTop: 26 }}>
              {visible.map((p) => {
                const pos = nearMe && location ? pharmacyPosition(p) : null
                return (
                  <StoreCard
                    key={p.slug}
                    pharmacy={p}
                    count={counts[p.slug] || 0}
                    distance={pos ? distanceKm(location, pos) : null}
                    approximate={Boolean(pos?.approximate)}
                  />
                )
              })}
            </div>
          )}

          <div className="sh-cta">
            <div>
              <h3>É farmácia e não aparece nesta lista?</h3>
              <p>
                As parceiras do lançamento confirmam o stock no portal em segundos e aparecem aqui
                de imediato — gratuitamente. O Localizador é um serviço da Conheça Farmácia.
              </p>
            </div>
            <Link className="cf-btn cf-btn--primary" href="/farmacias/participar">
              Quero participar
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
