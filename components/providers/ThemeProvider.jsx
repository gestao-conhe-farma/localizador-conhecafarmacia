'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function readSharedTheme() {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('cf-theme='))
    ?.slice('cf-theme='.length)
  return value === 'dark' || value === 'light' ? value : null
}

function persistTheme(theme) {
  try {
    localStorage.setItem('theme', theme)
  } catch {}

  const hostname = window.location.hostname
  const domain =
    hostname === 'conhecafarmacia.com' || hostname.endsWith('.conhecafarmacia.com')
      ? '; Domain=.conhecafarmacia.com'
      : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `cf-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`
}

export default function ThemeProvider({ children }) {
  // A cookie no domínio pai partilha a escolha entre www, conta e Localizador.
  // localStorage mantém compatibilidade com preferências antigas e localhost.
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    const cookie = readSharedTheme()
    if (cookie) return cookie
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') return stored
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    persistTheme(theme)

    const syncTheme = () => {
      const sharedTheme = readSharedTheme()
      if (sharedTheme && sharedTheme !== theme) setTheme(sharedTheme)
    }
    const onVisibilityChange = () => {
      if (!document.hidden) syncTheme()
    }

    window.addEventListener('focus', syncTheme)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('focus', syncTheme)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    persistTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
