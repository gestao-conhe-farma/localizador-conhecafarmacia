import Link from 'next/link'

/**
 * Mini-sidebar das definições — o padrão do Supabase replicado nas duas
 * áreas: um título curto («Definições») e grupos de opções, com o item
 * activo pintado como um bloco suave.
 *
 * `key` identifica a opção activa; nos separadores do interno o destino é
 * a MESMA rota com `?tab=`, por isso não se pode inferir do pathname. Nas
 * páginas com rotas próprias (portal) o `key` continua a ser explícito —
 * assim o componente nunca adivinha e os dois lados comportam-se igual.
 *
 * É um componente de servidor (sem estado): a navegação é só links. No
 * telemóvel o CSS transforma a coluna numa fila horizontal de separadores.
 */
export default function SettingsNav({
  title = 'Definições',
  groups = [],
  active = null,
  label = 'Opções de definições',
}) {
  return (
    <nav className="settings-nav" aria-label={label}>
      {title ? <p className="settings-nav-title">{title}</p> : null}

      {groups.map((group) => (
        <div className="settings-nav-group" key={group.label || group.items[0]?.href}>
          {group.label ? <span className="settings-nav-label">{group.label}</span> : null}
          {group.items.map((item) => {
            const selected = item.key ? item.key === active : Boolean(item.active)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`settings-nav-item${selected ? ' settings-nav-item--active' : ''}`}
                aria-current={selected ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="settings-nav-badge">{item.badge}</span> : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
