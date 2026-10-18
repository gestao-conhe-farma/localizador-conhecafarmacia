/**
 * Secção de definições — título FORA do cartão, como no Supabase
 * («General settings» por cima, o cartão das opções por baixo).
 *
 * O cartão é só a superfície: as classes `settings-card--pad` (padding
 * uniforme) e o conteúdo específico de cada área decidem o resto. Isto
 * evita repetir a mesma composição em três páginas e mantém o ritmo
 * vertical igual no portal e no interno.
 */
export default function SettingsSection({
  title,
  hint,
  id,
  children,
  className = '',
  cardClassName = '',
}) {
  return (
    <section className={`settings-section${className ? ` ${className}` : ''}`} id={id}>
      <div className="settings-section-head">
        <h2>{title}</h2>
        {hint ? <span className="settings-section-hint">{hint}</span> : null}
      </div>
      <div className={`settings-card${cardClassName ? ` ${cardClassName}` : ''}`}>{children}</div>
    </section>
  )
}
