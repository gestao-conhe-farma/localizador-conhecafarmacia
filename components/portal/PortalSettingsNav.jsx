import SettingsNav from '@/components/ui/SettingsNav'

/**
 * Opções de definições do portal — as duas páginas da própria conta.
 *
 * A mini-sidebar fica num componente só para /perfil e /sessao nunca
 * divergirem num rótulo ou numa ordem. «Equipa» e «Integração» continuam
 * na navegação principal: são gestão da farmácia, não definições da
 * conta, e misturá-las aqui fazia a coluna crescer sem necessidade.
 */
const GROUPS = [
  {
    label: 'Farmácia',
    items: [{ key: 'perfil', href: '/portal/perfil', label: 'Perfil' }],
  },
  {
    label: 'Pessoa',
    items: [{ key: 'sessao', href: '/portal/sessao', label: 'Sessão' }],
  },
]

export default function PortalSettingsNav({ active }) {
  return <SettingsNav active={active} groups={GROUPS} />
}
