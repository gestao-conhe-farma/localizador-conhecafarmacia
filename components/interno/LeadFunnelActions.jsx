'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moveLead } from '@/lib/actions/leads'
import { mensagemLead } from '@/components/interno/leads-erros'
import Notice from '@/components/ui/Notice'
import { ESTADOS_LEAD } from '@/components/interno/formatos'

/**
 * Mover um lead no funil (Task 5.3 Step 1) — um controlo por linha.
 *
 * É um `<select>` e um botão, não um diálogo: mover um lead é escrever o que
 * já se sabe («falei com eles, estão a pensar»), e um diálogo com motivo
 * obrigatório para cada passo punha a equipa a inventar motivos ou a não
 * mexer no funil — as duas coisas piores do que um estado sem nota. O que
 * fica na trilha é o antes/depois, quem e quando; a nota é opcional e existe
 * para quem quer deixar o porquê.
 *
 * `onboarded` NÃO está na lista de propósito: esse estado é o resultado da
 * conversão, e escolhê-lo à mão punha o funil a dizer que houve uma farmácia
 * criada quando não houve (o servidor recusa-o de qualquer maneira —
 * `ESTADO_RESERVADO` —, e aqui evita-se que a opção exista).
 */
export default function LeadFunnelActions({ leadId, estado }) {
  const router = useRouter()
  const [novo, setNovo] = useState('')
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(false)
  const [aMover, start] = useTransition()

  const destinos = Object.keys(ESTADOS_LEAD).filter((e) => e !== estado && e !== 'onboarded')

  const mover = () => {
    if (!novo) return
    setErro(null)
    start(async () => {
      try {
        const r = await moveLead({ leadId, status: novo, nota })
        if (r?.ok) {
          setFeito(true)
          setNota('')
          setNovo('')
          router.refresh()
          return
        }
        setErro(mensagemLead(r?.error))
      } catch {
        setErro(mensagemLead('FALHA'))
      }
    })
  }

  if (feito) {
    return (
      <Notice tone="ok" role="status">
        Movido para <b>{ESTADOS_LEAD[novo] || 'novo estado'}</b>.
      </Notice>
    )
  }

  return (
    <div className="interno-funnel-move">
      <select
        className="interno-select interno-select--small"
        aria-label="Mover para"
        value={novo}
        disabled={aMover}
        onChange={(e) => setNovo(e.target.value)}
      >
        <option value="">Mover para…</option>
        {destinos.map((d) => (
          <option key={d} value={d}>
            {ESTADOS_LEAD[d]}
          </option>
        ))}
      </select>
      <input
        className="interno-input interno-input--small"
        type="text"
        maxLength={120}
        placeholder="nota (opcional)"
        aria-label="Nota para a trilha"
        value={nota}
        disabled={aMover}
        onChange={(e) => setNota(e.target.value)}
      />
      <button
        type="button"
        className="interno-btn interno-btn--ghost interno-btn--small"
        onClick={mover}
        disabled={aMover || !novo}
      >
        {aMover ? 'A mover…' : 'Mover'}
      </button>
      {erro && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
    </div>
  )
}
