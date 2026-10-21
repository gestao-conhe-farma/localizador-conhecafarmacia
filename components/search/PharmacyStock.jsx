'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchPharmacyStockClient, pharmacyFromStockRow } from '@/lib/stock'
import { usePharmacyStockRealtime } from '@/lib/use-pharmacy-stock-realtime'
import { openStatus } from '@/lib/opening-hours'
import { logError } from '@/lib/log'
import ProductCard from '@/components/search/ProductCard'
import MiniMap from '@/components/search/MiniMap'
import { useUserLocation } from '@/lib/use-user-location'
import { distanceKm, formatDistance, pharmacyPosition } from '@/lib/geo'
import { directionsHref, freshness, kindLabel, whatsappHref } from '@/lib/product-utils'

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

/** Tabs da prateleira — os críticos primeiro, o resto por categoria (0038). */
function buildTabs(items) {
  const tabs = ['Tudo']
  if (items.some((it) => it.drug_priority === 'critico')) tabs.push('Críticos')
  const kinds = [...new Set(items.map((it) => it.drug_kind || 'medicamento'))]
  for (const k of ['medicamento', 'bebe', 'higiene', 'beleza', 'outros']) {
    if (kinds.includes(k)) tabs.push(k)
  }
  return tabs
}

function tabLabel(tab) {
  if (tab === 'Tudo') return 'Tudo'
  if (tab === 'Críticos') return 'Críticos'
  return kindLabel(tab)
}

export default function PharmacyStock({ slug, initialItems = null }) {
  const [items, setItems] = useState(initialItems)
  const [pharmacy, setPharmacy] = useState(() => pharmacyFromStockRow(initialItems?.[0]))
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('Tudo')
  // Posição do visitante: só é pedida quando ele carrega no botão.
  const { location, status: locStatus, request: requestLocation } = useUserLocation()

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
      // Num refetch mantemos o stock que já está no ecrã: melhor dado
      // de há um minuto do que uma prateleira vazia.
      setError(true)
    }
  }, [slug])

  // Carga inicial só quando o servidor não entregou o stock. O efeito não
  // depende de `refetch` (que muda a cada render): repeti-lo a cada mudança
  // de `items` seria um ciclo de pedidos.
  useEffect(() => {
    if (initialItems) return
    let alive = true
    ;(async () => {
      try {
        const data = await fetchPharmacyStockClient(slug)
        if (!alive) return
        setItems(data || [])
        setPharmacy(pharmacyFromStockRow(data?.[0]))
        setError(false)
      } catch (err) {
        logError('pharmacy-stock', 'Falha ao carregar stock da farmácia', {
          slug,
          message: err?.message || String(err),
          code: err?.code,
        })
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug, initialItems])

  // Enquanto a farmácia guarda stock no portal, a prateleira actualiza-se.
  usePharmacyStockRealtime(slug, refetch)

  const tabs = useMemo(() => buildTabs(items || []), [items])
  const status = pharmacy ? openStatus(pharmacy.opening_hours) : null
  // Posição no mapa: coordenadas próprias ou, na falta delas, o centro do
  // município — sempre etiquetado como aproximado.
  const mapPos = pharmacy ? pharmacyPosition(pharmacy) : null
  const distance =
    location && mapPos ? distanceKm(location, mapPos) : null
  const distanceLabel = distance != null ? formatDistance(distance) : null

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items || [])
      .filter((it) => {
        if (tab === 'Críticos' && it.drug_priority !== 'critico') return false
        if (tab !== 'Tudo' && tab !== 'Críticos' && (it.drug_kind || 'medicamento') !== tab) {
          return false
        }
        if (!q) return true
        return (
          (it.drug_name || '').toLowerCase().includes(q) ||
          (it.drug_molecule || '').toLowerCase().includes(q) ||
          (it.brand || '').toLowerCase().includes(q)
        )
      })
      .sort(
        (a, b) =>
          Number(b.drug_priority === 'critico') - Number(a.drug_priority === 'critico') ||
          String(a.drug_name).localeCompare(String(b.drug_name), 'pt'),
      )
  }, [items, tab, query])

  const freshest = useMemo(() => {
    if (!items || items.length === 0) return null
    const newest = Math.max(...items.map((i) => new Date(i.confirmed_at).getTime()))
    return freshness(new Date(newest).toISOString())
  }, [items])

  if (items !== null && items.length === 0 && !error) {
    return (
      <div className="cf-wrap">
        <div className="sh-empty" style={{ paddingTop: 80 }}>
          <p className="sh-empty-title">Ainda sem stock confirmado</p>
          <p className="sh-empty-sub">
            Esta farmácia não tem produtos confirmados agora — medicamentos nas últimas 72 h,
            parafarmácia nos últimos 30 dias — ou o endereço não corresponde a uma farmácia parceira
            activa.
          </p>
          <p style={{ marginTop: 16 }}>
            <Link className="cf-btn cf-btn--primary" href="/farmacia">
              Ver as farmácias da rede
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const phoneHref = pharmacy?.phone ? `tel:${pharmacy.phone.replace(/\s/g, '')}` : null
  const waHref = pharmacy
    ? whatsappHref(
        pharmacy.whatsapp,
        `Olá! Encontrei a ${pharmacy.name} no Localizador da Conheça Farmácia. Podem confirmar o stock, por favor?`,
      )
    : null
  const maps = pharmacy ? directionsHref(pharmacy) : null

  return (
    <>
      {pharmacy ? (
        <section className="store-band">
          <div className="cf-wrap">
            <p className="crumbs">
              <Link href="/farmacia">Farmácias</Link>
              {pharmacy.municipio ? (
                <>
                  {' / '}
                  <Link href="/farmacia">{pharmacy.municipio}</Link>
                </>
              ) : null}
              {' / '}
              {pharmacy.name}
            </p>
            <div className="band-grid">
              <div>
                <p className="cf-kicker">
                  Farmácia parceira{pharmacy.municipio ? ` · ${pharmacy.municipio}` : ''}
                </p>
                <h1>{pharmacy.name}</h1>
                <p className="addr">
                  {[pharmacy.address, pharmacy.municipio].filter(Boolean).join(' · ') || 'Luanda'}
                </p>
                <div className="badges">
                  {status && (
                    <span>
                      <i className={`cf-dot${status.open ? ' cf-dot--on-green' : ''}`} />
                      {status.label}
                    </span>
                  )}
                  <span>
                    <i className="cf-dot cf-dot--on-green" />
                    {items ? items.length : '—'} produto{items?.length === 1 ? '' : 's'} confirmado
                    {items?.length === 1 ? '' : 's'}
                  </span>
                  {pharmacy.verified && (
                    <span>
                      <i className="cf-dot cf-dot--on-green" />
                      Verificada pela equipa
                    </span>
                  )}
                </div>
              </div>
              <div className="acts">
                {phoneHref && (
                  <a className="cf-btn cf-btn--cream cf-num" href={phoneHref}>
                    Ligar · {pharmacy.phone}
                  </a>
                )}
                {waHref && (
                  <a className="cf-btn cf-btn--on-green" href={waHref} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                )}
                {maps && (
                  <a className="cf-btn cf-btn--on-green" href={maps} target="_blank" rel="noopener noreferrer">
                    Direcções
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="store-band">
          <div className="cf-wrap">
            <p className="cf-kicker">Farmácia parceira</p>
            <h1>A carregar…</h1>
          </div>
        </section>
      )}

      <div className="cf-wrap store-grid">
        {/* Lateral do Modelo B — o mapa pequeno e os dados da farmácia
            ficam à vista o tempo todo, ao lado dos cartões. */}
        <aside className="store-aside">
          <h2>{pharmacy ? pharmacy.name : 'Farmácia parceira'}</h2>
          <p className="store-where">
            {pharmacy
              ? [pharmacy.address, pharmacy.municipio].filter(Boolean).join(', ') || 'Luanda'
              : 'A carregar dados da farmácia…'}
          </p>

          {mapPos ? (
            <MiniMap
              lat={mapPos.lat}
              lng={mapPos.lng}
              label={pharmacy?.name}
              footnote={mapPos.approximate ? 'Zona aproximada' : null}
            />
          ) : (
            <p className="location-note" style={{ marginTop: 12 }}>
              Esta farmácia ainda não tem coordenadas no mapa — use «Abrir no mapa» com a morada.
            </p>
          )}

          <div className="location-row">
            {distanceLabel ? (
              <>
                <span
                  className="dist-pill"
                  title={
                    mapPos?.approximate
                      ? 'Distância aproximada — a farmácia ainda não tem coordenadas exactas'
                      : 'Distância em linha recta'
                  }
                >
                  {mapPos?.approximate ? '≈' : ''} {distanceLabel}
                </span>
                <span style={{ fontSize: 10.5 }}>
                  {mapPos?.approximate ? 'centro do município' : 'em linha recta'}
                </span>
              </>
            ) : (
              <button
                type="button"
                className="cf-btn cf-btn--quiet cf-btn--sm"
                onClick={requestLocation}
                disabled={locStatus === 'asking'}
              >
                {locStatus === 'asking' ? 'A obter…' : 'Ver a distância até mim'}
              </button>
            )}
          </div>
          {locStatus === 'PERMISSAO' && (
            <p className="location-note">
              Sem permissão de localização — autorize nas definições do browser para ver a
              distância. A sua posição nunca é enviada para o servidor.
            </p>
          )}

          <div className="store-badges">
            {status && (
              <span>
                <i className={`cf-dot${status.open ? '' : ' cf-dot--off'}`} />
                {status.label}
              </span>
            )}
            {freshest && (
              <span>
                <i className="cf-dot" />
                Última leitura há {freshest}
              </span>
            )}
            {pharmacy?.verified && (
              <span>
                <i className="cf-dot" />
                Verificada pela equipa
              </span>
            )}
          </div>

          <dl className="store-dl">
            {pharmacy?.phone && (
              <>
                <dt>Telefone</dt>
                <dd className="cf-num">{pharmacy.phone}</dd>
              </>
            )}
            <dt>Horário</dt>
            <dd>{pharmacy?.opening_hours || 'Não indicado pela farmácia'}</dd>
            <dt>Morada</dt>
            <dd>
              {[pharmacy?.address, pharmacy?.municipio].filter(Boolean).join(', ') ||
                'Não indicada'}
            </dd>
          </dl>

          <div className="aside-actions">
            {phoneHref && (
              <a className="cf-btn cf-btn--primary cf-btn--block" href={phoneHref}>
                Ligar à farmácia
              </a>
            )}
            {maps && (
              <a
                className="cf-btn cf-btn--ghost cf-btn--block"
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir no mapa
              </a>
            )}
            {waHref && (
              <a
                className="cf-btn cf-btn--ghost cf-btn--block"
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            )}
          </div>

          <div className="aside-steps">
            <b>Como reservar</b>
            <ol>
              <li>Escolha o produto na prateleira.</li>
              <li>Confirme a quantidade e o horário de levantamento.</li>
              <li>Mostre a reserva no balcão e pague lá.</li>
            </ol>
            <p style={{ marginTop: 8 }}>
              Não há pagamento online. Sem nova confirmação, um medicamento sai do Localizador ao
              fim de <b>72 h</b> e um produto de parafarmácia ao fim de <b>30 dias</b>.
            </p>
          </div>
        </aside>

        <div>
          <div className="shelf-head">
            <div>
              <h2>Prateleira de hoje</h2>
              <p className="sub">
                {visible.length} produto{visible.length === 1 ? '' : 's'}
                {freshest ? ` · actualizado há ${freshest}` : ''}
              </p>
            </div>
            <div className="cf-field-wrap">
              <span className="cf-ico" aria-hidden="true">
                {ICON_SEARCH}
              </span>
              <label className="cf-sr" htmlFor="q-store">
                Procurar nesta prateleira
              </label>
              <input
                id="q-store"
                className="cf-field"
                type="search"
                placeholder="Procurar aqui"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="shelf-tabs" role="group" aria-label="Filtrar por categoria">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                className={`shelf-tab${tab === t ? ' shelf-tab--on' : ''}`}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {tabLabel(t)}
              </button>
            ))}
          </div>

          {error && items === null && (
            <div className="sh-empty" role="alert">
              <p className="sh-empty-title">Algo falhou</p>
              <p className="sh-empty-sub">
                Não foi possível carregar o stock desta farmácia. Tente novamente mais tarde.
              </p>
            </div>
          )}

          {!error && items === null && (
            <div className="sh-empty" role="status">
              <div className="sh-spinner" />
              <p className="sh-empty-sub">A carregar a prateleira…</p>
            </div>
          )}

          {!error && items !== null && visible.length === 0 && (
            <div className="sh-empty">
              <p className="sh-empty-title">
                {query ? `Nada encontrado para «${query}»` : 'Nada nesta prateleira'}
              </p>
              <p className="sh-empty-sub">
                Experimente outro nome ou remova o filtro — pode perguntar directamente à farmácia
                pelo WhatsApp.
              </p>
            </div>
          )}

          {!error && items !== null && visible.length > 0 && (
            <div className="shelf" style={{ marginTop: 18 }}>
              <div className="pcard-grid">
                {visible.map((it) => (
                  <ProductCard key={it.stock_item_id} item={it} />
                ))}
              </div>
            </div>
          )}

          <p className="cf-note">
            O stock é o que a farmácia escreveu no portal, e cada reserva concluída baixa o saldo no
            mesmo instante. Quando a farmácia guarda alterações, esta prateleira actualiza-se sem
            recarregar a página.
          </p>
        </div>
      </div>
    </>
  )
}
