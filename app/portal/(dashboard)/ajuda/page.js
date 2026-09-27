import HelpPanel from '@/components/portal/HelpPanel'

export const metadata = {
  title: 'Portal da farmácia — ajuda',
  robots: { index: false, follow: false },
}

/**
 * Ajuda do portal — o guia do atendente dentro da app: acordeão por
 * tema, pesquisa simples e o resumo de 30 segundos no fundo.
 */
export default function PortalHelpPage() {
  return (
    <div className="portal-page">
      <HelpPanel />
    </div>
  )
}
