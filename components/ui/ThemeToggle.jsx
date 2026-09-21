'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()

  // A classe base .theme-toggle é SEMPRE mantida — é dela que vêm as regras
  // de visibilidade dos ícones sol/lua. Classes extra (ex.: drawer-theme-toggle)
  // apenas sobrepõem cor/estilo.
  return (
    <button
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      onClick={toggleTheme}
      onMouseDown={(e) => e.preventDefault()}
      aria-label="Alternar modo escuro"
      type="button"
    >
      <svg className="sun-icon" viewBox="0 0 24 24" width="20" height="20">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg className="moon-icon" viewBox="0 0 24 24" width="20" height="20">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  )
}
