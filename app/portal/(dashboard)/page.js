import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPharmacySessionVerbose } from '@/lib/pharmacy-session'
import { openStatus } from '@/lib/opening-hours'

export const metadata = {
  title: 'Portal da farmácia — visão geral',
  robots: { index: false, follow: false },
}

/**
 * Visão geral (redesign): resumo do dia SEM a lista de stock — ela inteira
 * vivia aqui e tornava a página pesada. Cada área tem a sua página no menu
 * lateral; o estado de abertura passa a viver no cartão do perfil.
 */
export default async function PortalOverviewPage() {
  const { session, reason, detail } = await getPharmacySessionVerbose()
  if (!session) {
    // Mesma conduta do layout — e nunca desestruturar null (era o crash).
    console.log('[portal-debug] visão geral sem sessão:', reason, detail || '')
    const qs = new URLSearchParams({ motivo: reason })
    if (detail) qs.set('detalhe', detail)
    redirect(`/portal/login?${qs.toString()}`)
  }
  const { pharmacy } = session
  const status = openStatus(pharmacy.opening_hours)

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Visão geral</h1>
          <p className="portal-page-sub">
            Tudo o que pede decisão hoje — o resto vive no menu à esquerda.
          </p>
        </div>
        <Link href="/portal/stock" className="btn btn-primary">
          + Adicionar medicamento
        </Link>
      </div>

      <div className="portal-cards-row">
        <Link href="/portal/atencao" className="portal-card-link">
          <span className="portal-card-k">Atenção</span>
          <span className="portal-card-title">Precisa de atenção</span>
          <span className="portal-card-sub">
            Reposição após vendas, validades a vencer e stock desactualizado — num só lugar.
          </span>
        </Link>
        <Link href="/portal/stock" className="portal-card-link">
          <span className="portal-card-k">Stock</span>
          <span className="portal-card-title">Gerir medicamentos</span>
          <span className="portal-card-sub">
            Pesquisa, filtros por estado e edição por linha — sem lista infinita.
          </span>
        </Link>
        <Link href="/portal/reservas" className="portal-card-link">
          <span className="portal-card-k">Reservas</span>
          <span className="portal-card-title">Fila de clientes</span>
          <span className="portal-card-sub">
            Confirmar, preparar, concluir — ou recusar com um clique.
          </span>
        </Link>
        <Link href="/portal/perfil" className="portal-card-link">
          <span className="portal-card-k">Perfil</span>
          <span className="portal-card-title">Dados da farmácia</span>
          <span className="portal-card-sub">
            {status ? status.label : 'Morada, horário, contacto e localização.'}
          </span>
        </Link>
      </div>

      <p className="portal-page-hint">
        A sua página pública:{' '}
        <Link href={`/farmacia/${pharmacy.slug}`}>/farmacia/{pharmacy.slug}</Link>
      </p>
    </div>
  )
}
