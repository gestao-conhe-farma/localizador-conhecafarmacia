'use client'

import { useFavorites } from '@/components/conta/FavoritesProvider'

const ICON_SAVE = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

const ICON_SAVED = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

/**
 * Guardar/remover um medicamento ou uma farmácia.
 *
 * `compact` é o botão de ícone que se sobrepõe à fotografia do cartão; a
 * versão com texto vive na ficha e no cabeçalho da farmácia. O estado vem do
 * `FavoritesProvider` (uma leitura por página) e a escrita vai pela Server
 * Action `toggleFavorito`, com o cliente de sessão.
 */
export default function FavoriteButton({
  kind,
  id,
  label = 'Guardar',
  compact = false,
  className = '',
}) {
  const favoritos = useFavorites()
  if (!favoritos?.ready || !id) return null

  const guardado = favoritos.isSaved(kind, id)
  const texto = guardado ? 'Guardado' : label

  return (
    <button
      type="button"
      onClick={(event) => {
        // Dentro de um cartão que é um link: o clique é para guardar, não
        // para abrir a ficha.
        event.preventDefault()
        event.stopPropagation()
        favoritos.toggle(kind, id)
      }}
      aria-pressed={guardado}
      aria-label={`${texto}: ${kind === 'drug' ? 'medicamento' : 'farmácia'}`}
      title={texto}
      className={`fav-btn${guardado ? ' fav-btn--on' : ''}${
        compact ? ' fav-btn--compact' : ''
      } ${className}`.trim()}
    >
      {guardado ? ICON_SAVED : ICON_SAVE}
      {!compact && <span>{texto}</span>}
    </button>
  )
}
