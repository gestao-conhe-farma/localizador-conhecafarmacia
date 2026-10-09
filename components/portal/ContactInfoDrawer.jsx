'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PortalDrawer from '@/components/portal/PortalDrawer'
import { updatePharmacyProfile } from '@/lib/actions/pharmacy-portal'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  NADA_PARA_GUARDAR: 'Não há alterações para guardar.',
  EMAIL_INVALIDO: 'O email não parece válido (ex.: nome@dominio.com).',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
}

/**
 * «Editar informações» — drawer lateral da secção Informações de
 * /portal/sessão: nome, telefone, email e whatsapp da farmácia num só
 * painel (nenhum campo à mostra na página). Guarda pela mesma Server
 * Action do /portal/perfil (updatePharmacyProfile) — com `name` e
 * `email` novos (migração 0019).
 */
export default function ContactInfoDrawer({ pharmacy, accountEmail }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok' | 'err', text }
  const [form, setForm] = useState({
    name: pharmacy?.name || '',
    phone: pharmacy?.phone || '',
    email: pharmacy?.email || accountEmail || '',
    whatsapp: pharmacy?.whatsapp || '',
  })

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setMsg(null)
  }

  const fechar = () => {
    setOpen(false)
    setMsg(null)
  }

  const submeter = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setMsg(null)
    const res = await updatePharmacyProfile({
      name: form.name,
      phone: form.phone,
      email: form.email,
      whatsapp: form.whatsapp,
    })
    setSaving(false)
    if (res.ok) {
      setMsg({ type: 'ok', text: 'Guardado — informações actualizadas.' })
      router.refresh()
    } else {
      setMsg({ type: 'err', text: ERRORES[res.error] || 'Erro inesperado.' })
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Editar informações
      </button>

      <PortalDrawer
        open={open}
        title="Editar informações"
        hint="Nome e contacto da farmácia — o que o cliente usa para falar consigo."
        onClose={fechar}
      >
        <form className="portal-form" onSubmit={submeter}>
          <label className="portal-label">
            Nome
            <input
              className="portal-input"
              type="text"
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={set('name')}
              placeholder="Nome da farmácia"
              required
              autoFocus
            />
          </label>
          <label className="portal-label">
            Telefone
            <input
              className="portal-input"
              type="tel"
              maxLength={40}
              value={form.phone}
              onChange={set('phone')}
              placeholder="+244 9xx xxx xxx"
            />
          </label>
          <label className="portal-label">
            Email
            <input
              className="portal-input"
              type="email"
              maxLength={120}
              value={form.email}
              onChange={set('email')}
              placeholder="nome@dominio.com"
            />
          </label>
          <label className="portal-label">
            WhatsApp (só números)
            <input
              className="portal-input"
              type="tel"
              inputMode="numeric"
              maxLength={20}
              value={form.whatsapp}
              onChange={(e) => {
                setForm((f) => ({ ...f, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 20) }))
                setMsg(null)
              }}
              placeholder="2449XXXXXXXX"
            />
            <span className="portal-hint">Usado nos botões «falar com a farmácia».</span>
          </label>

          {msg && (
            <p className={msg.type === 'ok' ? 'portal-hint' : 'portal-error'} role="status">
              {msg.text}
            </p>
          )}

          <div className="portal-staff-acts">
            <button type="button" className="btn btn-secondary" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
          </div>
        </form>
      </PortalDrawer>
    </>
  )
}
