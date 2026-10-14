'use client'

import { useState } from 'react'

/**
 * Estado da linha da tabela (disciplina v2): PONTO + palavra, sempre
 * dentro da coluna própria. Os rótulos longos («Pronta · aguarda
 * levantamento», «Recusada · Motivo: só levantamento no próprio dia»)
 * encodem-se com reticências para a coluna não partir o alinhamento:
 * no desktop o texto completo aparece ao passar o rato (title) e em
 * mobile o toque desdobra a linha e o texto completo fica visível.
 *
 * `label` é o texto que cabe na coluna («Pronta · aguarda…»); `full`,
 * quando existe, é o texto completo — vai para o title e para o
 * desdobrar, para a coluna não crescer nem empurrar as seguintes.
 */
export default function StateLabel({ st = 'mut', label, full }) {
  const [open, setOpen] = useState(false)
  // Desdobrado mostra o texto completo; fechado, o curto da coluna.
  const texto = open && full ? full : label

  return (
    <span
      className={`portal-st portal-st--${st} portal-st--clip${open ? ' is-open' : ''}`}
      title={full || label}
      onClick={(e) => {
        // O clique só desdobra o texto — a linha (abrir modal/ficha)
        // continua acessível pelo resto da célula e pelo kebab.
        e.stopPropagation()
        setOpen((v) => !v)
      }}
    >
      <i />
      <span className="portal-st-t">{texto}</span>
    </span>
  )
}
