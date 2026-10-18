import Notice from '@/components/ui/Notice'
import AnnouncementsPanel from '@/components/portal/AnnouncementsPanel'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { listPharmacyAnnouncements } from '@/lib/announcements'

export const metadata = {
  title: 'Portal da farmácia — avisos',
  robots: { index: false, follow: false },
}

/**
 * Avisos da Equipa Conheça Farmácia (0032).
 *
 * A página vive no shell do portal — o sino da topbar e o item do menu
 * levam aqui. A leitura usa a sessão da farmácia: a RLS só devolve os
 * avisos dirigidos a ela (os seus + os de todos), dentro do prazo e não
 * arquivados. O painel marca-os como lidos ao abrir.
 */
export default async function PortalAnnouncementsPage() {
  const { pharmacy } = await getPharmacySession()
  const res = await listPharmacyAnnouncements(pharmacy.id)
  const porLer = res.rows.filter((r) => !r.lido).length

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Avisos</h1>
          <p className="portal-page-sub">
            Mensagens da equipa Conheça Farmácia para a sua farmácia.
            {res.ok && res.rows.length > 0
              ? porLer > 0
                ? ` ${porLer} por ler — abrir esta página marca-os como lidos.`
                : ' Está tudo lido.'
              : ''}
          </p>
        </div>
      </div>

      {!res.ok ? (
        <Notice tone="warn" title="Não foi possível carregar os avisos" role="status">
          <p>
            Tente recarregar a página. Se continuar, fale com a equipa da Conheça Farmácia — os
            avisos não se perderam.
          </p>
        </Notice>
      ) : (
        <AnnouncementsPanel rows={res.rows} />
      )}
    </div>
  )
}
