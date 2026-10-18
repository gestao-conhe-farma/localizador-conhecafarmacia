import {
  BadgeCheck,
  CalendarClock,
  CalendarX,
  ChartNoAxesColumn,
  CircleCheck,
  CircleSlash,
  Handshake,
  Hourglass,
  ListFilter,
  MessageCircle,
  PackageX,
  PauseCircle,
  Presentation,
  ShieldCheck,
  Store,
  Timer,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'

/**
 * Cartões KPI da área interna — a MESMA peça do portal (`portal-kpi4`):
 * rótulo pequeno, número grande, nota por baixo, e o ícone no canto
 * superior direito. A decisão é deliberada: são os mesmos cartões, com os
 * mesmos tons, para o gestor que passa do portal para a área interna não
 * aprender duas gramáticas de «número de topo». Só muda o conteúdo.
 *
 * O ícone vem do rótulo (`ICONES`), com escape por `item.icone` e
 * `item.tom` para um KPI novo não ter de mexer neste mapa.
 */
const ICONES = {
  'Leads por atender': Users,
  Farmácias: Store,
  'Com selo': BadgeCheck,
  'Sem selo': BadgeCheck,
  'Planos a rever': CalendarClock,
  'Stock parado': PackageX,
  'Sem plano': CircleSlash,
  'Por atribuir': CircleSlash,
  'Em experiência': Timer,
  'Em graça': Hourglass,
  'Prazos terminados': CalendarX,
  Suspensos: PauseCircle,
  Activos: CircleCheck,
  'Prazos a expirar': CalendarClock,
  'A mostrar': ListFilter,
  'Por atender': Users,
  'Em conversa': MessageCircle,
  Demonstração: Presentation,
  Acordo: Handshake,
  Convertidos: UserCheck,
  Descartados: UserX,
  Membros: Users,
  'Com segundo factor': ShieldCheck,
  'Convites por aceitar': UserPlus,
}

/** Tom do ícone: só o que pede acção ganha âmbar/vermelho. */
const TONS = {
  'Leads por atender': 'amber',
  'Sem selo': 'amber',
  'Planos a rever': 'amber',
  'Stock parado': 'red',
  'Sem plano': 'amber',
  'Por atribuir': 'amber',
  'Em graça': 'amber',
  'Prazos terminados': 'red',
  Suspensos: 'red',
  'Prazos a expirar': 'amber',
  'Por atender': 'amber',
  'A mostrar': 'gray',
  'Em experiência': 'teal',
  'Em conversa': 'teal',
  Demonstração: 'teal',
  'Convites por aceitar': 'teal',
  Descartados: 'gray',
}

export default function InternoKpis({ items = [] }) {
  return (
    <div className="portal-kpi4-grid">
      {items.map((item) => {
        const Icone = ICONES[item.rotulo] || ChartNoAxesColumn
        const tom = item.tom || TONS[item.rotulo] || 'green'
        return (
          <div className="portal-kpi4" key={item.rotulo}>
            <span className={`portal-kpi4-ic portal-kpi4-ic--${tom}`} aria-hidden="true">
              <Icone />
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">{item.rotulo}</span>
              <span className="portal-kpi4-n">{item.valor}</span>
              {item.nota ? <span className="portal-kpi4-d">{item.nota}</span> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
