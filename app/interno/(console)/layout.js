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

  // Secções que existem hoje. Uma fase nova entra aqui quando tiver ecrã —
  // um link para uma página que não existe é pior do que a sua ausência.
  //
  // Lista PLANA e numerada, como na plataforma de gestão: o ícone viaja como
  // CHAVE (`icone`) porque um componente do lucide não atravessa a fronteira
  // Server → Client, e o número é a posição na lista já FILTRADA — um item
  // que o nível não tem não deixa um buraco na numeração.
  const secoes = [
    {
      href: '/interno',
      label: 'Painel',
      grupo: 'Operação',
      acao: 'pharmacy.view',
      icone: 'painel',
    },
    {
      href: '/interno/farmacias',
      label: 'Farmácias',
      grupo: 'Operação',
      acao: 'pharmacy.view',
      icone: 'farmacias',
    },
    // Os leads são a porta de entrada das farmácias: quem os lê vê a
    // secção, e é pela mesma acção que a página autoriza. Quem só vê
    // farmácias não perde nada por não a ter.
    {
      href: '/interno/leads',
      label: 'Leads',
      grupo: 'Operação',
      acao: 'lead.read',
      icone: 'leads',
    },
    // Avisos (0032): a equipa que fala com as farmácias publica aqui as
    // mensagens do sino do portal. A mesma acção autoriza o ecrã.
    {
      href: '/interno/avisos',
      label: 'Avisos',
      grupo: 'Comunicação',
      acao: 'announcement.publish',
      icone: 'avisos',
    },
    // A acção é `plan.change` e não `pharmacy.view`: a secção existe
    // para quem negoceia os planos (superadmin/faturacao). Quem não a
    // tem continua a ver o plano na ficha da farmácia.
    {
      href: '/interno/planos',
      label: 'Planos',
      grupo: 'Negócio',
      acao: 'plan.change',
      icone: 'planos',
    },
    // A trilha é a secção de quem a pode LER (`audit.read`: superadmin e
    // auditoria). O export é outra acção (com MFA e motivo) e vive dentro
    // da página — não é uma secção à parte.
    {
      href: '/interno/auditoria',
      label: 'Auditoria',
      grupo: 'Governança',
      acao: 'audit.read',
      icone: 'auditoria',
    },
    // A equipa é de quem repõe o segundo factor (`team.reset_mfa`): a
    // reposição é o gesto que a secção existe para servir. Mudar níveis é
    // `team.manage` e ainda não tem ecrã — o nível lê-se aqui.
    {
      href: '/interno/equipa',
      label: 'Equipa',
      grupo: 'Governança',
      acao: 'team.reset_mfa',
      icone: 'equipa',
    },
  ].filter((item) => can(role, item.acao))

  // Definições fica FORA do filtro, e é o único item assim: as secções
  // acima são acções sobre outrém e existem só para quem as pode fazer;
  // esta é a própria conta (nome, senha, MFA, sessões), e todos os níveis
  // têm uma. O número continua a ser a posição na lista já filtrada.
  const nav = [
    ...secoes,
    {
      href: '/interno/definicoes',
      label: 'Definições',
      grupo: 'Conta',
      icone: 'definicoes',
    },
  ].map((item, i) => ({ ...item, num: String(i + 1).padStart(2, '0') }))

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
      pendentes={[]}
    >
      {children}
    </InternoShell>
  )
}
