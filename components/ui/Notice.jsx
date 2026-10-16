import { CloseIcon, NoticeIcon } from '@/components/ui/Icon'

/**
 * Aviso — a ÚNICA receita de aviso do sistema (portal e site público).
 *
 * Substitui os quatro estilos que existiam espalhados (a «regra» da
 * Ajuda, a nota da Atenção, os banners do Stock e o painel de críticos do
 * Localizador): superfície com a tinta semântica do tom + contorno do
 * mesmo tom + ícone + texto de alto contraste. Nada de barra lateral.
 *
 * O tom muda a TINTA, nunca a forma — e a cor não é o único sinal: cada
 * tom tem um ícone de forma diferente e o texto diz o que se passa
 * («Validade: …»), para quem não distingue cores ler o mesmo aviso.
 *
 * Props:
 *   tone     'warn' (padrão) · 'danger' · 'ok'
 *   icon     chave de ícone (por omissão a do tom), ou `null` para o omitir
 *   title    rótulo (eyebrow) do aviso — usado pelos painéis
 *   large    aviso com conteúdo próprio (listas): respira mais
 *   band     linha de 3px na base — âncora dos avisos-regra da Ajuda
 *   as       'details' para um aviso que abre/fecha (com `summary`)
 *   onDismiss  mostra o X (avisos dispensáveis do Stock)
 *   role     'status' ou 'alert' quando o aviso aparece sozinho no ecrã
 */
const TONE_ICON = { warn: 'alerta', danger: 'erro', ok: 'ok' }

export default function Notice({
  tone = 'warn',
  icon,
  title,
  large = false,
  band = false,
  as = 'div',
  summary,
  onDismiss,
  dismissLabel = 'Dispensar este aviso',
  role,
  className = '',
  children,
}) {
  const classes = [
    'notice',
    tone !== 'warn' ? `notice--${tone}` : '',
    large ? 'notice--lg' : '',
    band ? 'notice--band' : '',
    as === 'details' ? 'notice--details' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const iconName = icon === null ? null : icon || TONE_ICON[tone] || TONE_ICON.warn
  const iconEl = iconName ? (
    <span className="notice-ic" aria-hidden="true">
      <NoticeIcon name={iconName} />
    </span>
  ) : null

  if (as === 'details') {
    return (
      <details className={classes}>
        <summary className="notice-sum">
          {iconEl}
          {summary}
        </summary>
        {children}
      </details>
    )
  }

  return (
    <div className={classes} role={role}>
      {iconEl}
      <div className="notice-body">
        {title && <p className="notice-title">{title}</p>}
        {children}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="notice-close"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  )
}
