'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'

/**
 * Alternador de tema da moldura interna (topbar e drawer).
 *
 * Os dois ícones e os dois rótulos estão SEMPRE no markup e é o CSS que
 * mostra um de cada vez (`html.dark`). A tentação é escolher o ícone a
 * partir de `theme` — mas o tema só é conhecido no cliente (localStorage),
 * o servidor renderiza sempre o mesmo, e o React acusava hydration
 * mismatch no ícone. É a mesma técnica do `ThemeToggle` global.
 */
export default function BotaoTema({ variante = 'claro' }) {
  const { toggleTheme } = useTheme()
  const noDrawer = variante === 'drawer'
  const tamanho = noDrawer ? 17 : 19

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Alternar modo escuro"
      className={noDrawer ? 'interno-drawer-theme' : `interno-tema interno-tema--${variante}`}
    >
      <span className="interno-tema-ic interno-tema-ic--sol" aria-hidden="true">
        <Sun size={tamanho} />
      </span>
      <span className="interno-tema-ic interno-tema-ic--lua" aria-hidden="true">
        <Moon size={tamanho} />
      </span>
      {noDrawer && (
        <>
          <span className="interno-tema-rotulo interno-tema-rotulo--sol">Tema claro</span>
          <span className="interno-tema-rotulo interno-tema-rotulo--lua">Tema escuro</span>
        </>
      )}
    </button>
  )
}
