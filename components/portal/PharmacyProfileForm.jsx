'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePharmacyProfile } from '@/lib/actions/pharmacy-portal'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  NADA_PARA_GUARDAR: 'Não há alterações para guardar.',
  MAPS_URL_INVALIDO:
    'O link do Google Maps deve começar por https:// — cole o link partilhado do Maps.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
}

/**
 * Perfil (v2 «Premium Calmo»): painéis hairline do mock — Identificação
 * (gerida pela equipa CF, campos desactivados), Contacto e localização
 * (form-grid de 2 colunas; Maps a toda a largura) e Horário. O «Guardar»
 * é o único botão sólido e vive no cabeçalho da página, à direita.
 *
 * A localização é o link partilhado do Google Maps (migração 0009) — o
 * Localizador usa-o no botão «Google Maps» da página pública. Slug,
 * nome, município e selo «verificada» ficam sob gestão da equipa.
 */
export default function PharmacyProfileForm({ pharmacy }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null) // { type: 'ok'|'err', text }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setToast(null)
    const fd = new FormData(e.currentTarget)
    const res = await updatePharmacyProfile({
      address: fd.get('address') || '',
      phone: fd.get('phone') || '',
      whatsapp: fd.get('whatsapp') || '',
      openingHours: fd.get('openingHours') || '',
      mapsUrl: fd.get('mapsUrl') || '',
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
            Os dados abaixo são os que o cliente vê na página pública da farmácia no Localizador.
          </p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      </div>

      {/* Painel 1 — Identificação: gerida pela equipa CF. */}
      <div className="portal-box" style={{ marginBottom: '0.875rem' }}>
        <div className="portal-card-head">
          <h2>Identificação</h2>
          <span className="portal-card-hint">Nome e verificação são geridos pela equipa CF</span>
        </div>
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
      </div>

      {/* Painel 2 — Contacto e localização. */}
      <div className="portal-box" style={{ marginBottom: '0.875rem' }}>
        <div className="portal-card-head">
          <h2>Contacto e localização</h2>
        </div>
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
              WhatsApp (só números)
              <input
                name="whatsapp"
                className="portal-input"
                defaultValue={pharmacy.whatsapp || ''}
                placeholder="2449XXXXXXXX"
              />
              <span className="portal-hint">Usado nos botões «falar com a farmácia»</span>
            </label>
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
              No Google Maps: pesquise a farmácia → «Partilhar» → copie o link e cole aqui. Sem
              link, usamos a morada para o cliente encontrar.
            </span>
          </label>
        </div>
      </div>

      {/* Painel 3 — Horário de atendimento. */}
      <div className="portal-box">
        <div className="portal-card-head">
          <h2>Horário de atendimento</h2>
        </div>
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
              Texto livre — aparece no Localizador e alimenta a indicação «aberto agora».
            </span>
          </label>
        </div>
      </div>

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
