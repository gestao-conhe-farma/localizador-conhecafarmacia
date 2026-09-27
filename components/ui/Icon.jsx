/**
 * Ícones SVG utilitários do portal — substituem os glifos tipográficos
 * (✓ ✕ ▾ ▸ ☰) com o mesmo estilo de traço dos ícones da sidebar
 * (stroke 2, linecap round, 24×24 de viewBox).
 */

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function CheckIcon({ size = 12 }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export function CloseIcon({ size = 12 }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function ChevronIcon({ size = 12, dir = 'down' }) {
  const rotate = { down: 0, right: -90 }
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      className="ui-chevron"
      style={{ transform: `rotate(${rotate[dir] || 0}deg)` }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function MenuIcon({ size = 18 }) {
  return (
    <svg {...BASE} width={size} height={size}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}
