'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import Notice from '@/components/ui/Notice'

/**
 * Sugestão de segundo factor para contas que entram só com senha.
 *
 * Não é um bloqueio: quem perdeu a senha e nunca inscreveu o autenticador
 * passou a poder repor por código de e-mail (lib/actions/pharmacy-recovery.js),
 * e essa conta continua a ser mais frágil do que as outras. O aviso diz
 * isso uma vez, com um X para quem já decidiu — e volta a aparecer noutro
 * browser, porque a decisão fica no armazenamento local e não na conta: um
 * nudge de segurança que se esconde para sempre num portátil partilhado não
 * estava a fazer nada.
 */
const CHAVE = 'portal.mfa.sugestao'

// Sem subscrição: a decisão muda por esta instância (o X) ou na próxima
// visita. Um aviso não precisa de reagir a outros separadores.
const semSubscricao = () => () => {}

function lerDispensado() {
  try {
    return window.localStorage.getItem(CHAVE) === '1'
  } catch {
    // Sem armazenamento (modo privado antigo): mostra-se, e o X só vale
    // para esta página. Melhor do que rebentar o portal por causa disto.
    return false
  }
}

export default function MfaSuggestion({ temAutenticador = false }) {
  // No servidor (e na hidratação) conta como dispensado, para o aviso não
  // aparecer e desaparecer; no cliente lê a decisão guardada. Sem efeito
  // nem setState no corpo — nada de renders em cascata.
  const dispensado = useSyncExternalStore(semSubscricao, lerDispensado, () => true)
  const [fechadoAqui, setFechadoAqui] = useState(false)

  if (temAutenticador || fechadoAqui || dispensado) return null

  return (
    <div className="portal-plan-alert">
      <Notice
        tone="warn"
        title="Protege a conta com a verificação em dois passos"
        role="status"
        onDismiss={() => {
          try {
            window.localStorage.setItem(CHAVE, '1')
          } catch {
            // idem: o aviso volta na próxima visita, sem estragar nada.
          }
          setFechadoAqui(true)
        }}
      >
        <p>
          Esta conta entra só com a senha. Com o autenticador, quem descobrir a senha continua sem
          conseguir entrar.{' '}
          <Link href="/portal/mfa">Activar a verificação em dois passos</Link> — leva um minuto e
          podes fechar este aviso sem activar.
        </p>
      </Notice>
    </div>
  )
}
