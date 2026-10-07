'use client'

import { useState } from 'react'

/**
 * Estado da linha da tabela (disciplina v2): PONTO + palavra, sempre
 * dentro da coluna própria. Os rótulos longos («Pronta · aguarda
 * levantamento», «Recusada · Motivo: só levantamento no próprio dia»)
 * encodem-se com reticências para a coluna não partir o alinhamento:
 * no desktop o texto completo aparece ao passar o rato (title) e em
 * mobile o toque desdobra a linha e o texto completo fica visível.
 */
export default function StateLabel({ st = 'mut', label }) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className={`portal-st portal-st--${st} portal-st--clip${open ? ' is-open' : ''}`}
      title={label}
      onClick={(e) => {
        // O clique só desdobra o texto — a linha (abrir modal/ficha)
        // continua acessível pelo resto da célula e pelo kebab.
        e.stopPropagation()
        setOpen((v) => !v)
      }}
    >
      <i />
      <span className="portal-st-t">{label}</span>
    </span>
  )
}
