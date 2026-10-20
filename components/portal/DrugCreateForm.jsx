'use client'

import { useState } from 'react'
import { createDrug, setStockReservable } from '@/lib/actions/pharmacy-portal'
import { KINDS } from '@/lib/constants'

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página.',
  NOME_INVALIDO: 'Indique o nome do medicamento.',
  FALHA_CRIAR: 'Não foi possível criar. Tente novamente.',
}

/**
 * Criação de fármacos (ponto 1): nome, molécula (DCI), forma
 * farmacêutica, gramagem/dosagem e se exige receita médica.
 *
 * O fármaco entra INACTIVO no catálogo — o gerente da farmácia valida
 * antes de ficar visível ao público (evita duplicados e erros de
 * ortografia no catálogo partilhado por todas as farmácias).
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
  // Categoria (0038): medicamentos têm receita/dose; parafarmácia
  // (bebé, higiene…) tem o interruptor de reserva.
  const [kind, setKind] = useState('medicamento')

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    const fd = new FormData(e.currentTarget)
    const cleanKind = KINDS.some((k) => k.id === fd.get('kind')) ? fd.get('kind') : 'medicamento'
    const res = await createDrug({
      name: fd.get('name'),
      molecule: fd.get('molecule'),
      form: fd.get('form'),
      dosage: fd.get('dosage'),
      requiresRx: cleanKind === 'medicamento' && fd.get('requiresRx') === 'on',
      kind: cleanKind,
    })
    // Reserva opcional (0038): a farmácia decide na criação se o produto
    // de parafarmácia aceita reservas — omissão: aceita.
    // Só numa criação nova: se o produto já existia, o interruptor do
    // formulário não deve mudar a configuração que a farmácia já tem.
    if (
      res.ok &&
      !res.existed &&
      res.drugId &&
      cleanKind !== 'medicamento' &&
      fd.get('reservable') !== 'on'
    ) {
      await setStockReservable({ drugId: res.drugId, reservable: false })
    }
    setSaving(false)
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: res.existed
          ? 'Este produto já existe no catálogo — procure-o na lista de stock.'
          : (
            <>
              Adicionado ao catálogo — já aparece na lista de stock com a marca{' '}
              <b>Aguarda validação</b>; pode marcar o stock dele já. Fica visível aos clientes
              depois de o gerente validar.
            </>
          ),
      })
      e.target.reset()
      // O select é controlado: reset() não lhe chega — volta ao medicamento
      // para o próximo produto não nascer com a categoria do anterior.
      setKind('medicamento')
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
          + Produto em falta no catálogo
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
          <h2 className="portal-h2">Novo produto</h2>
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
            Categoria
            <select
              name="kind"
              className="portal-input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.id === 'medicamento' ? 'Medicamento' : `Parafarmácia — ${k.label.toLowerCase()}`}
                </option>
              ))}
            </select>
          </label>
          {/* Só o medicamento usa os campos clínicos; um produto de
              parafarmácia não tem molécula nem dosagem — ficam vazios
              (a CHECK da BD aceita-os a null). */}
          {kind === 'medicamento' && (
            <>
              <label className="portal-label">
                Molécula (DCI)
                <input
                  name="molecule"
                  className="portal-input"
                  placeholder="Ex.: varfarina sódica"
                />
              </label>
              <label className="portal-label">
                Forma farmacêutica
                <input name="form" className="portal-input" placeholder="Ex.: comprimido" />
              </label>
              <label className="portal-label">
                Gramagem / dosagem
                <input
                  name="dosage"
                  className="portal-input"
                  placeholder="Ex.: 5 mg · cx 30 comp."
                />
              </label>
            </>
          )}
          {kind === 'medicamento' ? (
            <label className="portal-label portal-label--check">
              <input name="requiresRx" type="checkbox" />
              Exige receita médica
            </label>
          ) : (
            <label className="portal-label portal-label--check">
              <input name="reservable" type="checkbox" defaultChecked />
              Aceita reservas no Localizador
            </label>
          )}
        </div>

        {feedback && (
          <p className={feedback.type === 'ok' ? 'portal-toast' : 'portal-error'} role="status">
            {feedback.text}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-small" disabled={saving}>
          {saving ? 'A guardar…' : 'Adicionar ao Catálogo'}
        </button>
      </form>
    </section>
  )
}
