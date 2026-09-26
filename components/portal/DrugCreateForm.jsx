'use client'

import { useState } from 'react'
import { createDrug } from '@/lib/actions/pharmacy-portal'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página.',
  NOME_INVALIDO: 'Indique o nome do medicamento.',
  FALHA_CRIAR: 'Não foi possível criar. Tente novamente.',
}

/**
 * Criação de fármacos (ponto 1): nome, molécula (DCI), forma
 * farmacêutica, gramagem/dosagem e se exige receita médica.
 *
 * O fármaco entra INACTIVO no catálogo — a equipa Conheça Farmácia
 * valida antes de ficar visível ao público (evita duplicados e erros
 * de ortografia no catálogo partilhado por todas as farmácias).
 * A farmácia pode, isso sim, marcar o stock dele logo após criar.
 *
 * Dois modos: autónomo (botão que abre o formulário na própria secção)
 * e `embedded` (só o formulário, dentro do modal da página de stock —
 * `onCreated` fecha o popup após sucesso).
 */
export default function DrugCreateForm({ embedded = false, onCreated } = {}) {
  // Começa fechado. A reabertura automática em erro do modo autónomo
  // acontece no próprio submit (abaixo) — sem useEffect com setState
  // síncrono (react-hooks/set-state-in-effect).
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type, text }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    const fd = new FormData(e.currentTarget)
    const res = await createDrug({
      name: fd.get('name'),
      molecule: fd.get('molecule'),
      form: fd.get('form'),
      dosage: fd.get('dosage'),
      requiresRx: fd.get('requiresRx') === 'on',
    })
    setSaving(false)
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: res.existed
          ? 'Este medicamento já existe no catálogo — procure-o na lista acima.'
          : 'Pedido enviado. Pode já marcar o stock dele na lista acima; o medicamento fica visível ao público após validação da equipa.',
      })
      e.target.reset()
      // No modal do stock, sucesso fecha o popup (a mensagem ia ficar
      // presa dentro dele — a lista já mostra o fármaco para marcar stock).
      if (embedded && onCreated) onCreated()
    } else {
      // Reabre o formulário colapsado para o erro ficar visível.
      setOpen(true)
      setFeedback({ type: 'err', text: ERRORES[res.error] || 'Erro inesperado.' })
    }
  }

  if (!open && !embedded) {
    return (
      <section className="portal-section">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(true)}>
          + Medicamento em falta no catálogo
        </button>
      </section>
    )
  }

  return (
    <section className="portal-section">
      {/* O cabeçalho/fechar são do modo autónomo — no modal do stock o
          cartão já traz título e botão fechar seus. */}
      {!embedded && (
        <div className="portal-section-head">
          <h2 className="portal-h2">Novo medicamento</h2>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        </div>
      )}

      <form className="portal-form" onSubmit={submit}>
        <div className="portal-form-grid portal-form-grid--three">
          <label className="portal-label">
            Nome comercial *
            <input name="name" className="portal-input" required placeholder="Ex.: Varfarina" />
          </label>
          <label className="portal-label">
            Molécula (DCI)
            <input name="molecule" className="portal-input" placeholder="Ex.: varfarina sódica" />
          </label>
          <label className="portal-label">
            Forma farmacêutica
            <input name="form" className="portal-input" placeholder="Ex.: comprimido" />
          </label>
          <label className="portal-label">
            Gramagem / dosagem
            <input name="dosage" className="portal-input" placeholder="Ex.: 5 mg · cx 30 comp." />
          </label>
          <label className="portal-label portal-label--check">
            <input name="requiresRx" type="checkbox" />
            Exige receita médica
          </label>
        </div>

        {feedback && (
          <p className={feedback.type === 'ok' ? 'portal-toast' : 'portal-error'} role="status">
            {feedback.text}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
          {saving ? 'A enviar…' : 'Pedir ao catálogo'}
        </button>
      </form>
    </section>
  )
}
