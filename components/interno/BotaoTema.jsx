'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'

/**
 * Alternador de tema da área interna — vive SÓ no rodapé do drawer (o
 * menu mobile). A topbar deixou de o mostrar: em ecrã estreito o drawer
 * já é o sítio do tema, e no desktop o botão vivia numa barra que, sem
 * ele, não teria conteúdo (excepto o aviso de segundo factor).
 *
 * Os dois ícones e os dois rótulos estão SEMPRE no markup e é o CSS que
 * mostra um de cada vez (`html.dark`). A tentação é escolher o ícone a
 * partir de `theme` — mas o tema só é conhecido no cliente (localStorage),
 * o servidor renderiza sempre o mesmo, e o React acusava hydration
 * mismatch no ícone. É a mesma técnica do `ThemeToggle` global.
 */
export default function BotaoTema() {
  const { toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Alternar modo escuro"
      className="interno-drawer-theme"
    >
      <span className="interno-tema-ic interno-tema-ic--sol" aria-hidden="true">
        <Sun size={17} />
      </span>
      <span className="interno-tema-ic interno-tema-ic--lua" aria-hidden="true">
        <Moon size={17} />
      </span>
      <span className="interno-tema-rotulo interno-tema-rotulo--sol">Tema claro</span>
      <span className="interno-tema-rotulo interno-tema-rotulo--lua">Tema escuro</span>
    </button>
  )
}
