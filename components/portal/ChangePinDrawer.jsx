'use client'

import { useState } from 'react'
import PortalDrawer from '@/components/portal/PortalDrawer'
import ChangePinForm from '@/components/portal/ChangePinForm'

/**
 * «Alterar PIN» em drawer — a página /sessão fica sem campos à mostra:
 * o formulário abre no painel lateral (mesmo padrão da Equipa e do
 * «+ Nova entrada») e fecha com ✕, Esc ou clique fora.
 */
export default function ChangePinDrawer() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Alterar PIN
      </button>

      <PortalDrawer
        open={open}
        title="Alterar PIN"
        hint="PIN de 4 dígitos do perfil activo — erros ficam registados em log, sem bloqueio."
        onClose={() => setOpen(false)}
      >
        <ChangePinForm />
      </PortalDrawer>
    </>
  )
}
