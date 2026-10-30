'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export const THEME_MODES = ['light', 'dark', 'system']

const ThemeContext = createContext({
  theme: 'light',
  mode: 'system',
  isDark: false,
  toggleTheme: () => {},
  setMode: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function readSharedTheme() {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('cf-theme='))
    ?.slice('cf-theme='.length)
  return THEME_MODES.includes(value) ? value : null
}

const mediaDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** 'system' segue o aparelho; claro/escuro são escolhas explícitas. */
export function resolveTheme(mode, prefersDark = mediaDark()) {
  if (mode === 'system') return prefersDark ? 'dark' : 'light'
  return mode === 'dark' ? 'dark' : 'light'
}

function persistTheme(mode) {
  try {
    localStorage.setItem('theme', mode)
  } catch {}

  const hostname = window.location.hostname
  const domain =
    hostname === 'conhecafarmacia.com' || hostname.endsWith('.conhecafarmacia.com')
      ? '; Domain=.conhecafarmacia.com'
      : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `cf-theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`
}

function initialMode() {
  if (typeof window === 'undefined') return 'light'
  const cookie = readSharedTheme()
  if (cookie) return cookie
  try {
    const stored = localStorage.getItem('theme')
    if (THEME_MODES.includes(stored)) return stored
  } catch {}
  // Sem escolha guardada, segue-se o aparelho — é o que 'system' significa.
  return 'system'
}

export default function ThemeProvider({ children }) {
  // A cookie no domínio pai partilha a escolha entre www, conta e Localizador.
  // localStorage mantém compatibilidade com preferências antigas e localhost.
  const [mode, setModeState] = useState(initialMode)
  // O tema resolvido é derivado: com «sistema», basta ouvir o aparelho.
  const [systemDark, setSystemDark] = useState(mediaDark)
  const theme = resolveTheme(mode, systemDark)

  function setMode(nextMode) {
    if (!THEME_MODES.includes(nextMode)) return
    setModeState(nextMode)
    persistTheme(nextMode)
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    persistTheme(mode)

    const syncTheme = () => {
      const sharedTheme = readSharedTheme()
      if (sharedTheme && sharedTheme !== mode) {
        setModeState(sharedTheme)
        persistTheme(sharedTheme)
      }
    }
    const onVisibilityChange = () => {
      if (!document.hidden) syncTheme()
    }
    // Trocar a aparência do aparelho aplica-se sem recarregar a página.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMediaChange = () => setSystemDark(media.matches)

    window.addEventListener('focus', syncTheme)
    document.addEventListener('visibilitychange', onVisibilityChange)
    media.addEventListener('change', onMediaChange)

    return () => {
      window.removeEventListener('focus', syncTheme)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      media.removeEventListener('change', onMediaChange)
    }
  }, [mode])

  const toggleTheme = () => {
    setMode(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider
      value={{ theme, mode, isDark: theme === 'dark', toggleTheme, setMode }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
