'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MUNICIPIOS } from '@/lib/constants'
import Notice from '@/components/ui/Notice'

/**
 * Formulário público de adesão de farmácias (/farmacias/participar).
 *
 * Os dados vão para `pharmacy_leads` e aparecem no funil do /interno. O
 * e-mail de confirmação é enviado pela rota /api/leads depois de o lead
 * estar gravado.
 *
 * Duplicados: a rota devolve 409 com `duplicate: true` e NÃO grava. Aqui
 * mostramos o aviso e só no segundo envio — com `confirm_duplicate` — o
 * pedido é registado. É o «avisar antes de enviar» escolhido para o
 * formulário; nada é perdido se a pessoa desistir.
 */
export default function PharmacyApplicationForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState('')
  const [duplicate, setDuplicate] = useState(null)
  const [pending, setPending] = useState(null)

  const limparAvisos = () => {
    if (erro) setErro('')
    if (duplicate) {
      setDuplicate(null)
      setPending(null)
    }
  }

  const enviar = async (payload) => {
    setSubmitting(true)
    setErro('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data.duplicate) {
        setDuplicate({
          campo: data.campo || 'contacto',
          mensagem: data.error || 'Já recebemos um pedido com este contacto.',
        })
        setPending(payload)
        return
      }

      if (!res.ok) {
        setErro(
          data.error ||
            'Não foi possível enviar o pedido. Tente novamente ou fale connosco por WhatsApp.',
        )
        return
      }

      // O resumo fica só nesta aba. A página de obrigado repete o que o
      // e-mail de confirmação lista (farmácia, NIF, município).
      try {
        sessionStorage.setItem(
          'adesao:resumo',
          JSON.stringify({
            farmacia: payload.pharmacy_name,
            nif: payload.nif,
            municipio: payload.municipio,
            email: payload.email,
          }),
        )
      } catch {
        /* sem storage: a página de obrigado mostra-se sem o resumo */
      }

      router.push(`/farmacias/participar/obrigado${data.emailSent === false ? '?email=0' : ''}`)
    } catch {
      setErro('Erro de rede. Verifique a sua ligação e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      pharmacy_name: fd.get('pharmacy_name')?.trim() || '',
      nif: fd.get('nif')?.trim() || '',
      license: fd.get('license')?.trim() || '',
      contact_name: fd.get('contact_name')?.trim() || '',
      role: fd.get('role')?.trim() || '',
      email: fd.get('email')?.trim() || '',
      phone: fd.get('phone')?.trim() || '',
      municipio: fd.get('municipio')?.trim() || '',
      address: fd.get('address')?.trim() || '',
      site_url: fd.get('site_url')?.trim() || '',
      social: fd.get('social')?.trim() || '',
      message: fd.get('message')?.trim() || '',
      consent: fd.get('consent') === 'on',
      website_hp: fd.get('website_hp') || '',
      company: fd.get('company') || '',
    }
    enviar(payload)
  }

  const confirmarDuplicado = () => {
    if (!pending) return
    enviar({ ...pending, confirm_duplicate: true })
  }

  return (
    <form className="lead-form apply-form" onSubmit={handleSubmit} onChange={limparAvisos}>
      <div className="apply-section form-full">
        <h2>Identificação da farmácia</h2>
        <p>Como a farmácia aparece no directório e nos documentos da parceria.</p>
      </div>

      <div className="form-full">
        <label htmlFor="pharmacy_name" className="form-label">
          Nome da farmácia *
        </label>
        <input
          id="pharmacy_name"
          name="pharmacy_name"
          required
          maxLength={160}
          autoComplete="organization"
          className="form-input"
          placeholder="Ex.: Farmácia Popular"
        />
      </div>

      <div>
        <label htmlFor="nif" className="form-label">
          NIF *
        </label>
        <input
          id="nif"
          name="nif"
          required
          maxLength={40}
          inputMode="numeric"
          className="form-input"
          placeholder="Número de identificação fiscal"
        />
      </div>

      <div>
        <label htmlFor="license" className="form-label">
          Alvará / licença *
        </label>
        <input
          id="license"
          name="license"
          required
          maxLength={80}
          className="form-input"
          placeholder="Número do alvará de funcionamento"
        />
      </div>

      <div className="apply-section form-full">
        <h2>Responsável</h2>
        <p>Quem acompanha a adesão e recebe o e-mail de confirmação.</p>
      </div>

      <div>
        <label htmlFor="contact_name" className="form-label">
          Nome do responsável *
        </label>
        <input
          id="contact_name"
          name="contact_name"
          required
          maxLength={160}
          autoComplete="name"
          className="form-input"
          placeholder="Nome de quem trata da adesão"
        />
      </div>

      <div>
        <label htmlFor="role" className="form-label">
          Cargo *
        </label>
        <input
          id="role"
          name="role"
          required
          maxLength={120}
          className="form-input"
          placeholder="Ex.: Director técnico"
        />
      </div>

      <div>
        <label htmlFor="email" className="form-label">
          E-mail *
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          className="form-input"
          placeholder="nome@farmacia.co.ao"
        />
      </div>

      <div>
        <label htmlFor="phone" className="form-label">
          Telefone / WhatsApp *
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          maxLength={40}
          autoComplete="tel"
          className="form-input"
          placeholder="+244 9xx xxx xxx"
        />
      </div>

      <div className="apply-section form-full">
        <h2>Localização</h2>
        <p>O município e a morada que o cliente vai encontrar no Localizador.</p>
      </div>

      <div>
        <label htmlFor="municipio" className="form-label">
          Município *
        </label>
        <select id="municipio" name="municipio" required className="form-select" defaultValue="">
          <option value="">Selecione…</option>
          {MUNICIPIOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="address" className="form-label">
          Morada *
        </label>
        <input
          id="address"
          name="address"
          required
          maxLength={200}
          autoComplete="street-address"
          className="form-input"
          placeholder="Rua, número, bairro"
        />
      </div>

      <div className="apply-section form-full">
        <h2>Presença digital</h2>
        <p>Opcional — ajuda-nos a confirmar a identidade da farmácia.</p>
      </div>

      <div>
        <label htmlFor="site_url" className="form-label">
          Website
        </label>
        <input
          id="site_url"
          name="site_url"
          type="text"
          maxLength={200}
          inputMode="url"
          autoComplete="url"
          className="form-input"
          placeholder="www.farmacia.co.ao"
        />
      </div>

      <div>
        <label htmlFor="social" className="form-label">
          Redes sociais
        </label>
        <input
          id="social"
          name="social"
          maxLength={200}
          className="form-input"
          placeholder="Instagram, Facebook ou ambos"
        />
      </div>

      <div className="form-full">
        <label htmlFor="message" className="form-label">
          Mensagem
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          className="form-textarea"
          placeholder="Algo que queira partilhar connosco (opcional)"
        />
      </div>

      <div className="apply-check form-full">
        <input id="consent" name="consent" type="checkbox" required />
        <label htmlFor="consent">
          Li e aceito a{' '}
          <Link href="/privacidade" target="_blank" rel="noopener noreferrer">
            Política de Privacidade
          </Link>
          . Os dados são usados apenas para avaliar e acompanhar este pedido de adesão.
        </label>
      </div>

      {duplicate && (
        <Notice tone="warn" className="form-full" role="alert">
          <p>
            <b>{duplicate.mensagem}</b> Pode enviar mesmo assim — a equipa verá os dois registos.
          </p>
          <button
            type="button"
            className="cf-btn cf-btn--primary cf-btn--sm"
            onClick={confirmarDuplicado}
            disabled={submitting}
          >
            {submitting ? 'A enviar…' : 'Enviar mesmo assim'}
          </button>
        </Notice>
      )}

      {erro && (
        <div className="form-status form-status--err form-full" role="alert">
          {erro}
        </div>
      )}

      <div className="apply-submit form-full">
        <button type="submit" className="cf-btn cf-btn--primary cf-btn--block" disabled={submitting}>
          {submitting ? 'A enviar…' : 'Enviar pedido de adesão'}
        </button>
        <p className="form-note">
          A equipa da Conheça Farmácia entra em contacto no máximo em 72 horas (horas corridas).
        </p>
      </div>

      <div className="apply-hp" aria-hidden="true">
        <label htmlFor="website_hp">Website</label>
        <input id="website_hp" name="website_hp" tabIndex={-1} autoComplete="off" />
        <label htmlFor="company">Empresa</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
    </form>
  )
}
