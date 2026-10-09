import Link from 'next/link'
import { requireActiveStaff } from '@/lib/staff-session'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { leaveStaffProfile } from '@/lib/actions/pharmacy-staff'
import ChangePinDrawer from '@/components/portal/ChangePinDrawer'
import PortalLogout from '@/components/portal/PortalLogout'

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
 * Sessão do perfil activo — acessível SÓ pelo menu do nome (top-bar ou
 * rodapé da sidebar), nunca por item de navegação.
 *
 * Modelo editorial (ref. imagem 9): hero VERDE ESCURO em cima (eyebrow
 * mint + nome serif grande + chip de papel + acções); a seguir o cartão
 * INFORMAÇÕES com os dados do FARMACÊUTICO do perfil activo — os dados
 * da farmácia vivem em /portal/perfil; por baixo DUAS cartões brancas
 * lado a lado (Segurança · Conta), com a mesma altura e a acção no
 * fundo. O PIN abre em drawer, nunca à mostra na página.
 */
export default async function StaffSessionPage() {
  const staff = await requireActiveStaff()
  const session = await getPharmacySession()
  const pharmacy = session?.pharmacy || null
  const isManager = staff.role === 'gerente'

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Sessão</h1>
          <p className="portal-page-sub">
            Quem está a trabalhar neste dispositivo — troque de perfil, altere o PIN ou feche o
            turno.
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
      <div className="portal-box portal-box--pad">
        <div className="portal-sec-head">
          <h2>Informações</h2>
          <span className="portal-sec-head-b">perfil do farmacêutico</span>
        </div>
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
          Nome e papel do perfil são geridos pela farmácia — os dados da farmácia (telefone, email e
          WhatsApp) editam-se em <Link href="/portal/perfil">Perfil</Link>.
        </p>
      </div>

      {/* ---- Duas cartões brancas lado a lado (padrão da imagem 9):
             hero escuro em cima, painéis claros em baixo — mesma altura,
             acção alinhada no fundo dos dois. */}
      <div className="sess-grid">
        <div className="portal-box portal-box--pad sess-card">
          <div className="portal-sec-head">
            <h2>Segurança</h2>
            <span className="portal-sec-head-b">PIN de 4 dígitos</span>
          </div>
          <div className="sess-card-body">
            <p className="sess-card-text">
              O PIN abre este perfil neste dispositivo. Tentativas erradas ficam registadas em log —
              não há bloqueio de conta.
            </p>
            <div className="sess-card-act">
              <ChangePinDrawer />
            </div>
          </div>
        </div>

        <div className="portal-box portal-box--pad sess-card">
          <div className="portal-sec-head">
            <h2>Conta</h2>
            <span className="portal-sec-head-b">neste navegador</span>
          </div>
          <div className="sess-card-body">
            <p className="sess-card-text">
              Terminar a sessão fecha também o perfil activo. Para trocar de pessoa sem fechar a
              conta, use «Trocar perfil» no cartão de cima.
            </p>
            <div className="sess-card-act">
              <PortalLogout className="btn btn-secondary" label="Terminar sessão da conta" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
