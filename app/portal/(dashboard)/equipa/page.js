import { requireManagerStaff } from '@/lib/staff-session'
import { listTeam } from '@/lib/actions/pharmacy-staff'
import EquipaManager from '@/components/portal/EquipaManager'

export const metadata = {
  title: 'Portal da farmácia — equipa',
  robots: { index: false, follow: false },
}

/**
 * Gestão da equipa (só gerentes) — perfis simples do balcão com PIN.
 * A escrita em pharmacy_staff passa exclusivamente pelas Server Actions
 * (o papel authenticated não tem grants na tabela); aqui só se monta a
 * lista devolvida pela acção `listTeam`.
 */
export default async function EquipaPage() {
  await requireManagerStaff()
  const team = await listTeam()

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Equipa</h1>
          <p className="portal-page-sub">
            Perfis do balcão com PIN de 4 dígitos — cada farmacêutico entra com o seu e fica-lhe
            tudo registado.
          </p>
        </div>
      </div>

      <EquipaManager
        rows={team.ok ? team.staff : []}
        currentId={team.ok ? team.currentId : null}
        error={team.ok ? null : team.error}
      />
    </div>
  )
}
