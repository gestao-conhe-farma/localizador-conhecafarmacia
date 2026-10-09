/**
 * Ícones SVG utilitários do portal — módulo único de ícones.
 *
 * Du famílias:
 *  1. Ícones utilitários (check, close, chevron, menu) — substituíram os
 *     glifos tipográficos (✓ ✕ ▾ ▸ ☰) com traço mais grosso (2.4).
 *  2. Ícones de navegação (NAV_ICONS) — os SVGs da sidebar, agora aqui
 *     para que a PortalSidebar (e qualquer futuro menu) não repita paths.
 *
 * Convenção comum: viewBox 24×24, stroke currentColor, linecap/linejoin
 * round — os ícones herdam a cor do contexto via CSS.
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

/* ── Ícones de navegação da sidebar ──────────────────────────────────
   Chave → paths. Traço mais fino (1.8), o mesmo que a sidebar usava.
   O NavIcon renderiza com as dimensões do CSS (.portal-nav-item svg). */

const NAV_PATHS = {
  inicio: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  atencao: (
    <>
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  stock: (
    <>
      <path d="M4 8h16v12H4z" />
      <path d="M9 8V5h6v3" />
      <path d="M4 13h16" />
    </>
  ),
  reservas: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  vendas: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20H2" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  ajuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.35-1 .95-1 1.7" />
      <path d="M12 16.5h.01" />
    </>
  ),
  // Chaves usadas pela página de Ajuda (HelpPanel) — ícones de tópicos.
  entrar: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9" />
      <path d="m16 7 3 3" />
    </>
  ),
  repor: (
    <>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M5 3h14" />
    </>
  ),
  detalhes: (
    <>
      <path d="M12 2 3 7l9 5 9-5-9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </>
  ),
  avisos: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </>
  ),
  // Desempenho (só gerente) — linha de tendência a subir.
  desempenho: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  // Equipa (só gerente) — dois perfis lado a lado.
  equipa: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.6 3.6-5.2 6.5-5.2s5.5 1.6 6.5 5.2" />
      <path d="M16.5 5a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.9c2 .8 3.3 2.4 3.7 5.1" />
    </>
  ),
}

const NAV_BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

/** Ícone de navegação/tópico por chave — fallback neutro (início) se inválida. */
export function NavIcon({ name, size }) {
  return (
    <svg {...NAV_BASE} {...(size ? { width: size, height: size } : {})}>
      {NAV_PATHS[name] || NAV_PATHS.inicio}
    </svg>
  )
}
