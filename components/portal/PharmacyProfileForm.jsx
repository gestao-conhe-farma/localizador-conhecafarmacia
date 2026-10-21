'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePharmacyProfile } from '@/lib/actions/pharmacy-portal'
import LocationPicker from '@/components/portal/LocationPicker'
import SettingsSection from '@/components/ui/SettingsSection'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  NADA_PARA_GUARDAR: 'Não há alterações para guardar.',
  EMAIL_INVALIDO: 'O email da farmácia não parece válido (ex.: geral@farmacia.com).',
  MAPS_URL_INVALIDO:
    'O link do Google Maps deve começar por https:// — cole o link partilhado do Maps.',
  COORDENADAS_INVALIDAS:
    'Coordenadas inválidas. Latitude entre -90 e 90 e longitude entre -180 e 180 (ex.: -8,838 / 13,234).',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
}

/**
 * Perfil da FARMÁCIA (v2 «Premium Calmo»): painéis hairline do mock —
 * Identificação (gerida pela equipa CF, campos desactivados), Contacto e
 * localização (form-grid de 2 colunas; Maps a toda a largura) e Horário.
 * O «Guardar» é o único botão sólido e vive no cabeçalho, à direita.
 *
 * Esta página é o par de /portal/sessão: aqui os dados da FARMÁCIA
 * (nome público, contacto, morada, horário); lá os do farmacêutico com
 * sessão iniciada. O email da farmácia entra aqui (migração 0019) —
 * antes só existia no drawer «Editar informações» da sessão.
 *
 * A localização tem duas portas: o mapa (clique = alfinete = lat/lng) e
 * os campos de coordenadas, para quem já as tem à mão. Ambas escrevem no
 * mesmo par de campos controlados que vai no FormData. O link partilhado
 * do Google Maps (migração 0009) continua a ser o botão da página
 * pública. Slug, nome, município e selo «verificada» ficam sob gestão da
 * equipa.
 */

/** Coordenada escrita à mão: aceita vírgula decimal, vazio = null. */
function parseCoord(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(',', '.')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export default function PharmacyProfileForm({ pharmacy, accountEmail = '' }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'ok'|'err', text }
  // Coordenadas controladas: o mapa e os campos escrevem no mesmo sítio.
  const [coords, setCoords] = useState(() => ({
    lat: pharmacy.lat ?? '',
    lng: pharmacy.lng ?? '',
  }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setToast(null)
    const fd = new FormData(e.currentTarget)
    const res = await updatePharmacyProfile({
      address: fd.get('address') || '',
      phone: fd.get('phone') || '',
      email: fd.get('email') || '',
      whatsapp: fd.get('whatsapp') || '',
      openingHours: fd.get('openingHours') || '',
      mapsUrl: fd.get('mapsUrl') || '',
      lat: coords.lat,
      lng: coords.lng,
    })
    setSaving(false)
    if (res.ok) {
      setToast({ type: 'ok', text: 'Guardado — a página pública já está actualizada.' })
      router.refresh()
    } else {
      setToast({ type: 'err', text: ERRORES[res.error] || 'Erro inesperado.' })
    }
  }

  return (
    <form className="portal-form" onSubmit={submit}>
      {/* Cabeçalho da página com a única acção primária (como o mock). */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Perfil da farmácia</h1>
          <p className="portal-page-sub">
            Dados da <b>farmácia</b> — os que o cliente vê na página pública no Localizador. Os
            dados do <b>farmacêutico com sessão iniciada</b> estão em{' '}
            <Link href="/portal/sessao">Sessão</Link>.
          </p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>

      {/* Painel 1 — Identificação: gerida pela equipa CF. */}
      <SettingsSection title="Identificação" hint="Nome e verificação são geridos pela equipa CF">
        <div className="portal-card-body">
          <div className="portal-form-grid">
            <label className="portal-label">
              Nome público
              <input className="portal-input" value={pharmacy.name || ''} disabled readOnly />
            </label>
            <label className="portal-label">
              Estado
              <input
                className="portal-input"
                value={
                  pharmacy.verified
                    ? 'Verificada · activa no Localizador'
                    : 'A aguardar verificação'
                }
                disabled
                readOnly
              />
            </label>
          </div>
        </div>
      </SettingsSection>

      {/* Painel 2 — Contacto e localização. */}
      <SettingsSection title="Contacto e localização">
        <div className="portal-card-body">
          <div className="portal-form-grid">
            <label className="portal-label">
              Morada
              <input
                name="address"
                className="portal-input"
                defaultValue={pharmacy.address || ''}
                placeholder="Rua, número, bairro"
              />
            </label>
            <label className="portal-label">
              Município
              <input className="portal-input" value={pharmacy.municipio || ''} disabled readOnly />
            </label>
            <label className="portal-label">
              Telefone
              <input
                name="phone"
                className="portal-input"
                defaultValue={pharmacy.phone || ''}
                placeholder="+244 9xx xxx xxx"
              />
            </label>
            <label className="portal-label">
              Email
              <input
                name="email"
                type="email"
                className="portal-input"
                defaultValue={pharmacy.email || accountEmail}
                placeholder="geral@farmacia.com"
              />
              <span className="portal-hint">Usado nas respostas automáticas ao cliente</span>
            </label>
            <label className="portal-label">
              WhatsApp (só números)
              <input
                name="whatsapp"
                className="portal-input"
                defaultValue={pharmacy.whatsapp || ''}
                placeholder="2449XXXXXXXX"
              />
              <span className="portal-hint">
                Usado nos botões <b>falar com a farmácia</b>
              </span>
            </label>
          </div>

          {/* Par de coordenadas: meia largura cada, com a explicação
              por baixo a toda a largura (no restante grid ficava
              espremida numa coluna de 200px). */}
          <div className="portal-coord-row">
            <label className="portal-label">
              Latitude
              <input
                name="lat"
                className="portal-input"
                inputMode="decimal"
                value={coords.lat}
                onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
                placeholder="-8,838"
              />
            </label>
            <label className="portal-label">
              Longitude
              <input
                name="lng"
                className="portal-input"
                inputMode="decimal"
                value={coords.lng}
                onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
                placeholder="13,234"
              />
            </label>
            <span className="portal-hint">
              Clique no mapa abaixo — o alfinete preenche estes dois campos. Também pode colar as
              coordenadas do Google Maps (botão direito sobre o alfinete → copiar). Vazio = centro
              do município.
            </span>
          </div>

          <div className="map-picker-field">
            <span className="portal-label">Localização no mapa</span>
            <LocationPicker
              lat={parseCoord(coords.lat)}
              lng={parseCoord(coords.lng)}
              municipio={pharmacy.municipio}
              onChange={(point) =>
                setCoords(
                  point ? { lat: String(point.lat), lng: String(point.lng) } : { lat: '', lng: '' },
                )
              }
            />
          </div>
          <label className="portal-label" style={{ marginBottom: 0 }}>
            Link do Google Maps
            <input
              name="mapsUrl"
              type="url"
              className="portal-input"
              defaultValue={pharmacy.maps_url || ''}
              placeholder="https://maps.app.goo.gl/…"
            />
            <span className="portal-hint">
              No Google Maps: pesquise a farmácia → <b>Partilhar</b> → copie o link e cole aqui. Sem
              link, usamos a morada para o cliente encontrar.
            </span>
          </label>
        </div>
      </SettingsSection>

      {/* Painel 3 — Horário de atendimento. */}
      <SettingsSection title="Horário de atendimento">
        <div className="portal-card-body">
          <label className="portal-label" style={{ marginBottom: 0 }}>
            Horário
            <input
              name="openingHours"
              className="portal-input"
              defaultValue={pharmacy.opening_hours || ''}
              placeholder="Seg–Sáb · 07:30–19:00"
            />
            <span className="portal-hint">
              Texto livre — aparece no Localizador e alimenta a indicação <b>aberto agora</b>.
            </span>
          </label>
        </div>
      </SettingsSection>

      <p className="portal-hint" style={{ marginTop: '0.875rem' }}>
        O município é definido pela equipa Conheça Farmácia — se mudou de zona, fale connosco.
      </p>

      {toast && (
        <p className={toast.type === 'ok' ? 'portal-toast' : 'portal-error'} role="status">
          {toast.text}
        </p>
      )}
    </form>
  )
}
