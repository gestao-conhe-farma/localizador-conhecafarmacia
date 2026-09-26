'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePharmacyProfile } from '@/lib/actions/pharmacy-portal'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página.',
  NADA_PARA_GUARDAR: 'Não há alterações para guardar.',
  MAPS_URL_INVALIDO:
    'O link do Google Maps deve começar por https:// — cole o link partilhado do Maps.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
}

const MUNICIPIOS_HINT =
  'O município é definido pela equipa Conheça Farmácia — se mudou de zona, fale connosco.'

/**
 * Edição do perfil (ponto 3): morada, contactos, horário e localização,
 * em secções numeradas — a mesma linguagem da página de definições da
 * plataforma de gestão (número à esquerda, réguas finas, sem cartão
 * a amontoar tudo). Campos empilhados (um por linha).
 *
 * A localização deixou de ser lat/lng (coordenadas que ninguém sabe de
 * cor): a farmácia cola o link partilhado do Google Maps (migração 0009)
 * e o Localizador usa-o no botão "Google Maps" da página pública.
 * Slug, nome, município e selo "verificada" ficam sob gestão da equipa.
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

  const secoes = [
    {
      num: '01',
      titulo: 'Morada e horário',
      descricao:
        'O que o cliente vê antes de sair de casa — mantenha o horário sempre actualizado.',
      corpo: (
        <>
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
            Horário de atendimento
            <input
              name="openingHours"
              className="portal-input"
              defaultValue={pharmacy.opening_hours || ''}
              placeholder="Seg–Sáb · 07:30–19:00"
            />
          </label>
          <p className="portal-hint">
            Nome, município e selo «verificada» são geridos pela equipa Conheça Farmácia.
          </p>
        </>
      ),
    },
    {
      num: '02',
      titulo: 'Contactos',
      descricao: 'O telefone aparece na página pública; o WhatsApp recebe as mensagens de reserva.',
      corpo: (
        <>
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
          </label>
        </>
      ),
    },
    {
      num: '03',
      titulo: 'Localização no mapa',
      descricao:
        'Cole o link do Google Maps da farmácia — é ele que abre quando o cliente toca em «Google Maps» no Localizador.',
      corpo: (
        <>
          <label className="portal-label">
            Link do Google Maps
            <input
              name="mapsUrl"
              type="url"
              className="portal-input"
              defaultValue={pharmacy.maps_url || ''}
              placeholder="https://maps.app.goo.gl/…"
            />
          </label>
          <p className="portal-hint">
            No Google Maps: pesquise a farmácia → «Partilhar» → copie o link e cole aqui. Sem link,
            usamos a morada para o cliente encontrar.
          </p>
        </>
      ),
    },
  ]

  return (
    <form className="portal-form portal-profile" onSubmit={submit}>
      {secoes.map((s) => (
        <section key={s.num} className="portal-secao">
          <span className="portal-secao-sec-num">{s.num}</span>
          <div className="min-w-0">
            <h2 className="portal-secao-h2">{s.titulo}</h2>
            <p className="portal-secao-desc">{s.descricao}</p>
            <div className="portal-secao-corpo portal-form-stack">{s.corpo}</div>
          </div>
        </section>
      ))}

      <p className="portal-hint">{MUNICIPIOS_HINT}</p>

      {toast && (
        <p className={toast.type === 'ok' ? 'portal-toast' : 'portal-error'} role="status">
          {toast.text}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
        {saving ? 'A guardar…' : 'Guardar alterações'}
      </button>
    </form>
  )
}
