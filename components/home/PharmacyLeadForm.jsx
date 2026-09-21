'use client'

import { useState } from 'react'

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
  'Outra província',
]

export default function PharmacyLeadForm() {
  const [status, setStatus] = useState(null) // null | 'ok' | 'err'
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setStatus(null)
    setMessage('')

    const fd = new FormData(e.target)
    const payload = {
      pharmacy_name: fd.get('pharmacy_name')?.trim() || '',
      contact_name: fd.get('contact_name')?.trim() || '',
      role: fd.get('role')?.trim() || '',
      email: fd.get('email')?.trim() || '',
      phone: fd.get('phone')?.trim() || '',
      municipio: fd.get('municipio')?.trim() || '',
      message: fd.get('message')?.trim() || '',
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        setStatus('ok')
        setMessage(
          'Recebemos o seu interesse. A nossa equipa entra em contacto nos próximos dias — obrigado!'
        )
        e.target.reset()
      } else {
        setStatus('err')
        setMessage(data.error || 'Não foi possível enviar. Tente novamente ou fale connosco por WhatsApp.')
      }
    } catch {
      setStatus('err')
      setMessage('Erro de rede. Verifique a sua ligação e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-14 mx-auto max-w-3xl bg-brand-card rounded-[24px] border border-brand-divider/40 p-7 md:p-10 shadow-soft">
      <h3 className="text-2xl md:text-3xl font-bold text-brand-deep text-center">
        Quero que a minha farmácia participe
      </h3>
      <p className="mt-3 mb-8 text-sm text-brand-deep/60 text-center">
        Preencha os dados e a nossa equipa entra em contacto. A adesão do lançamento é
        gratuita e as primeiras farmácias ficam em destaque.
      </p>

      <form className="lead-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="pharmacy_name" className="form-label">Nome da farmácia *</label>
          <input id="pharmacy_name" name="pharmacy_name" required className="form-input" placeholder="Ex.: Farmácia Popular" />
        </div>
        <div>
          <label htmlFor="municipio" className="form-label">Município *</label>
          <select id="municipio" name="municipio" required className="form-select">
            <option value="">Selecione…</option>
            {MUNICIPIOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contact_name" className="form-label">Nome do responsável *</label>
          <input id="contact_name" name="contact_name" required className="form-input" placeholder="Quem actualizaria o stock?" />
        </div>
        <div>
          <label htmlFor="role" className="form-label">Cargo</label>
          <input id="role" name="role" className="form-input" placeholder="Ex.: Director técnico" />
        </div>
        <div>
          <label htmlFor="email" className="form-label">E-mail</label>
          <input id="email" name="email" type="email" className="form-input" placeholder="opcional" />
        </div>
        <div>
          <label htmlFor="phone" className="form-label">Telefone / WhatsApp *</label>
          <input id="phone" name="phone" required className="form-input" placeholder="+244 9xx xxx xxx" />
        </div>
        <div className="form-full">
          <label htmlFor="message" className="form-label">Mensagem</label>
          <textarea id="message" name="message" rows="3" className="form-textarea" placeholder="Algo que queira partilhar (opcional)" />
        </div>

        {status && (
          <div className={`form-full form-status ${status === 'ok' ? 'form-status--ok' : 'form-status--err'}`} role="status">
            {message}
          </div>
        )}

        <div className="form-full flex flex-col items-center gap-3">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? 'A enviar…' : 'Quero participar — enviar'}
          </button>
          <p className="form-note text-center">
            Os seus dados são usados apenas para o contacto de parceria. Nunca partilhados
            com terceiros.
          </p>
        </div>
      </form>
    </div>
  )
}
