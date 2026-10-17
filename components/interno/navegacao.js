import {
  LayoutDashboard,
  Store,
  ClipboardList,
  CreditCard,
  ScrollText,
  Settings,
  UsersRound,
} from 'lucide-react'

/**
 * Navegação da área interna — ícones e iniciais num sítio só.
 *
 * O layout (Server Component) não pode passar componentes do lucide pela
 * fronteira Server → Client: passa a CHAVE (`icone: 'painel'`) e é aqui que
 * ela vira componente. O mesmo mapa serve a sidebar e o drawer, para os dois
 * nunca divergirem num ícone.
 */
export const ICONES = {
  painel: LayoutDashboard,
  farmacias: Store,
  leads: ClipboardList,
  planos: CreditCard,
  auditoria: ScrollText,
  equipa: UsersRound,
  definicoes: Settings,
}

/** «Sonda MFA» → «SM»; uma conta sem nome cai no e-mail. */
export function iniciais(nome, email) {
  const base = String(nome || email || '?').trim()
  if (base.includes('@')) return base.slice(0, 2).toUpperCase()
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}
