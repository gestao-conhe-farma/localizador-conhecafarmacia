import IntegrationPanel from '@/components/portal/IntegrationPanel'

export const metadata = {
  title: 'Portal da farmácia — integração',
  robots: { index: false, follow: false },
}

/**
 * Integração (plano 2026-10-12, ideia 1) — chaves de API, importação
 * CSV, webhooks e as últimas chamadas de terceiros.
 *
 * Página própria porque é assunto de instalação/configuração (não do
 * turno): abre-se quando se liga o sistema da farmácia ao Localizador e
 * volta-se a ela quando há que rever uma chave ou ver se o parceiro
 * está a sincronizar.
 */
export default function PortalIntegrationPage() {
  return (
    <div className="portal-page">
      <IntegrationPanel />
    </div>
  )
}
