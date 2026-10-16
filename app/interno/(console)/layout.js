import { redirect } from 'next/navigation'
import InternoShell from '@/components/interno/InternoShell'
import { getPlatformSessionVerbose } from '@/lib/platform/session'
import { can } from '@/lib/platform/permissions'

// Sessão sempre fresca: nada na área interna pode ser estático.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * Gate e shell da área interna (Task 4.2 do plano).
 *
 * Espelha o layout do portal da farmácia: valida a sessão UMA vez e
 * renderiza o shell; as páginas filhas consomem a sessão. A diferença é o
 * que acontece quando não há sessão — aqui a razão viaja no URL
 * (`?motivo=`), porque as duas causas prováveis («não tenho sessão» e
 * «esta conta é de farmácia») pedem explicações diferentes.
 *
 * A navegação é construída AQUI, no servidor, a partir da matriz: um item
 * só aparece se o nível tiver a acção que a secção exige. Quando as
 * secções seguintes chegarem (leads, planos, auditoria, equipa), o filtro
 * já está no sítio — e o shell recebe só dados serializáveis.
 *
 * A área exige nível interno (a 0027 não alargou a RLS) e as páginas
 * filhas voltam a autorizar por acção: esconder o item do menu nunca foi
 * autorização.
 */
export default async function InternoLayout({ children }) {
  const { session, reason, detail } = await getPlatformSessionVerbose()
  if (!session) {
    const qs = new URLSearchParams({ motivo: reason })
    if (detail) qs.set('detalhe', detail)
    redirect(`/interno/login?${qs.toString()}`)
  }

  const { user, role, roleLabel: rotulo, legacy, mfa } = session

  // Secções que existem hoje. As restantes fases (leads, planos, auditoria,
  // equipa) entram aqui quando tiverem ecrã — um link para uma página que
  // não existe é pior do que a sua ausência.
  const secoes = [
    {
      grupo: 'Operação',
      itens: [
        { href: '/interno', label: 'Painel', acao: 'pharmacy.view' },
        { href: '/interno/farmacias', label: 'Farmácias', acao: 'pharmacy.view' },
        // A acção é `plan.change` e não `pharmacy.view`: a secção existe
        // para quem negoceia os planos (superadmin/faturacao). Quem não a
        // tem continua a ver o plano na ficha da farmácia.
        { href: '/interno/planos', label: 'Planos', acao: 'plan.change' },
      ],
    },
  ]

  const nav = secoes
    .map((g) => ({ ...g, itens: g.itens.filter((t) => can(role, t.acao)) }))
    .filter((g) => g.itens.length > 0)

  return (
    <InternoShell
      nome={session.profile?.display_name || null}
      email={user?.email || null}
      rotulo={rotulo}
      legado={legacy}
      // O nível de garantia é um facto da SESSÃO, não da UI: mostrá-lo
      // explica porque é que uma acção sensível pede o código antes de
      // deixar fazer seja o que for.
      mfa2={mfa?.currentLevel === 'aal2'}
      temFactor={mfa?.nextLevel === 'aal2'}
      nav={nav}
      pendentes={['Leads', 'Auditoria', 'Equipa']}
    >
      {children}
    </InternoShell>
  )
}
