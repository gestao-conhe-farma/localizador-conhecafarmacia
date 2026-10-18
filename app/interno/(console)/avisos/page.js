import { requirePlatformPage } from '@/lib/platform/session'
import { getAnnouncementsAdmin } from '@/lib/actions/platform-announcements'
import SemPermissao from '@/components/interno/SemPermissao'
import Falha from '@/components/interno/Falha'
import AnnouncementsAdmin from '@/components/interno/AnnouncementsAdmin'
import { plural } from '@/lib/texto'

export const metadata = {
  title: 'Avisos — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Avisos da equipa (0032) — o sítio de onde saem as mensagens do sino do
 * portal. Publicar e retirar exigem `announcement.publish` /
 * `announcement.archive` (superadmin, onboarding, suporte) e a página
 * volta a autorizar por acção: esconder o item do menu não é autorização.
 */
export default async function AvisosPage() {
  const g = await requirePlatformPage('announcement.publish')
  if (!g.ok) return <SemPermissao acao={g.acao} rotulo={g.session?.roleLabel} />

  const res = await getAnnouncementsAdmin()

  if (!res.ok) {
    if (res.error === 'SEM_PERMISSAO' || res.error === 'SEM_SESSAO') {
      return <SemPermissao acao={res.acao} rotulo={g.session?.roleLabel} />
    }
    return (
      <div className="interno-page">
        <div className="interno-head">
          <div>
            <h1 className="interno-title">Avisos</h1>
            <p className="interno-sub">Mensagens da equipa no portal das farmácias.</p>
          </div>
        </div>
        <Falha titulo="Não foi possível ler os avisos" erro={res.error} detalhe={res.detail} />
      </div>
    )
  }

  const activos = res.rows.filter((r) => r.estado === 'activo').length
  const porLer = res.rows.filter((r) => r.estado === 'activo' && r.lidas === 0).length

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Avisos</h1>
          <p className="interno-sub">
            Mensagens da equipa no sino do portal —{' '}
            {plural(activos, 'aviso no portal', 'avisos no portal')}
            {porLer > 0 ? `, ${porLer} sem qualquer leitura` : ''}. Retirar um aviso não apaga nada:
            a linha e as leituras ficam aqui.
          </p>
        </div>
      </div>

      <AnnouncementsAdmin
        rows={res.rows}
        farmacias={res.farmacias}
        podePublicar={res.podePublicar}
        podeArquivar={res.podeArquivar}
      />
    </div>
  )
}
