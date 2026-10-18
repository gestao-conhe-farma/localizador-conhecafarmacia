import Link from 'next/link'
import { requireActiveStaff } from '@/lib/staff-session'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { leaveStaffProfile } from '@/lib/actions/pharmacy-staff'
import ChangePinDrawer from '@/components/portal/ChangePinDrawer'
import PortalLogout from '@/components/portal/PortalLogout'
import PortalSettingsNav from '@/components/portal/PortalSettingsNav'
import SettingsSection from '@/components/ui/SettingsSection'

export const metadata = {
  title: 'Portal da farmácia — sessão',
  robots: { index: false, follow: false },
}

function iniciais(nome) {
  const parts = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'F'
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

/** Data legível do perfil — «8 de outubro de 2026». */
function desde(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Sessão do FARMACÊUTICO que está ao balcão — o par de /portal/perfil:
 * aqui é a PESSOA com sessão iniciada neste dispositivo (perfil activo,
 * PIN, conta); lá é a FARMÁCIA (nome público, contacto, morada, horário).
 *
 * A página passou a viver dentro da gramática de definições: a
 * mini-sidebar à esquerda (Perfil · Sessão) e, à direita, os títulos das
 * secções FORA dos cartões — «Informações», «Segurança», «Conta» — como
 * no Supabase. O hero verde do perfil activo mantém-se: é o protagonista
 * da sessão, não uma opção de configuração.
 */
export default async function StaffSessionPage() {
  const staff = await requireActiveStaff()
  const session = await getPharmacySession()
  const pharmacy = session?.pharmacy || null
  const isManager = staff.role === 'gerente'

  return (
    <div className="settings-layout">
      <PortalSettingsNav active="sessao" />

      <div className="settings-content">
        <div className="portal-page-head">
          <div>
            <h1 className="portal-page-title">Sessão</h1>
            <p className="portal-page-sub">
              Dados do <b>farmacêutico com sessão iniciada</b> neste dispositivo — troque de perfil,
              altere o PIN ou feche o turno. Os dados da <b>farmácia</b> estão em{' '}
              <Link href="/portal/perfil">Perfil</Link>.
            </p>
          </div>
        </div>

        {/* ---- Protagonista: cartão verde escuro do modelo editorial --- */}
        <div className="portal-id-card portal-id-card--dark">
          <span className="portal-id-av" aria-hidden="true">
            {iniciais(staff.name)}
          </span>

          <div className="portal-id-meta">
            <span className="portal-id-eb">Perfil activo</span>
            <span className="portal-id-role">
              <i className={isManager ? 'is-on' : undefined} />
              {isManager ? 'Gerente' : 'Balcão'} · activo
            </span>
            <b className="portal-id-name">{staff.name}</b>
            <span className="portal-id-note">
              Os registos de vendas, reservas e entradas deste dispositivo ficam em seu nome até
              trocar de perfil.
            </span>
          </div>

          <div className="portal-id-acts">
            <Link href="/portal/perfis" className="btn btn-primary">
              Trocar perfil
            </Link>
            <form action={leaveStaffProfile}>
              <button type="submit" className="btn btn-secondary">
                Sair do perfil
              </button>
            </form>
          </div>
        </div>

        {/* ---- Informações: dados do FARMACÊUTICO (o perfil activo) ----
             A farmácia (nome, telefone, email, whatsapp) fica em /perfil —
             aqui só o que identifica quem está ao balcão. */}
        <SettingsSection
          title="Informações"
          hint="farmacêutico com sessão iniciada"
          cardClassName="settings-card--pad"
        >
          <dl className="sess-info">
            <div className="sess-info-row">
              <dt>Nome</dt>
              <dd>{staff.name || '—'}</dd>
            </div>
            <div className="sess-info-row">
              <dt>Papel</dt>
              <dd>
                <span className="sess-info-chip">{isManager ? 'Gerente' : 'Balcão'}</span>
              </dd>
            </div>
            <div className="sess-info-row">
              <dt>Farmácia</dt>
              <dd>{pharmacy?.name || '—'}</dd>
            </div>
            <div className="sess-info-row">
              <dt>Estado</dt>
              <dd>
                <span className="sess-info-on">
                  <i aria-hidden="true" />
                  Activo
                </span>
              </dd>
            </div>
            <div className="sess-info-row">
              <dt>Desde</dt>
              <dd>{desde(staff.created_at)}</dd>
            </div>
          </dl>
          <p className="sess-info-note">
            Nome e papel do perfil são geridos pela farmácia em «Equipa». Os dados da farmácia (nome
            público, telefone, email e WhatsApp) editam-se em{' '}
            <Link href="/portal/perfil">Perfil</Link> — o mesmo link do nome da farmácia na barra de
            cima.
          </p>
        </SettingsSection>

        {/* ---- Segurança · Conta: títulos fora, cartões com a mesma
               altura e a acção assente no fundo. ---------------------- */}
        <div className="settings-pair">
          <SettingsSection
            title="Segurança"
            hint="PIN de 4 dígitos"
            className="sess-card"
            cardClassName="settings-card--pad"
          >
            <div className="sess-card-body">
              <p className="sess-card-text">
                O PIN abre este perfil neste dispositivo. Tentativas erradas ficam registadas em log
                — não há bloqueio de conta.
              </p>
              <div className="sess-card-act">
                <ChangePinDrawer />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Conta"
            hint="neste navegador"
            className="sess-card"
            cardClassName="settings-card--pad"
          >
            <div className="sess-card-body">
              <p className="sess-card-text">
                Terminar a sessão fecha também o perfil activo. Para trocar de pessoa sem fechar a
                conta, use «Trocar perfil» no cartão de cima.
              </p>
              <div className="sess-card-act">
                <PortalLogout className="btn btn-secondary" label="Terminar sessão da conta" />
              </div>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}
