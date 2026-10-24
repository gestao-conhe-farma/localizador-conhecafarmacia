'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { melhorCategoria } from '@/lib/constants'

const ICON_SEARCH = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

/**
 * Caixa de pesquisa da homepage. Não faz pedidos: leva o termo para
 * /pesquisa?q=…, onde a pesquisa acontece de facto. Assim a homepage
 * fica leve em redes lentas e há um só sítio que fala com a base de
 * dados (a página de pesquisa).
 */
export default function HomeSearch() {
  const [term, setTerm] = useState('')
  const router = useRouter()

  return (
    <form
      className="shop-search home-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const q = term.trim()
        if (!q) {
          router.push('/pesquisa')
          return
        }
        // Quem escreve «febre» ou «bebé» procura um grupo, não um nome de
        // produto: leva o filtro no URL para a pesquisa abrir já certa.
        const grupo = melhorCategoria(q)
        if (grupo?.tipo === 'categoria') {
          router.push(`/pesquisa?categoria=${grupo.id}`)
        } else if (grupo?.tipo === 'tipo') {
          router.push(`/pesquisa?tipo=${grupo.id}`)
        } else if (grupo?.tipo === 'sub') {
          router.push(`/pesquisa?tipo=${grupo.kind}&sub=${grupo.id}`)
        } else {
          router.push(`/pesquisa?q=${encodeURIComponent(q)}`)
        }
      }}
    >
      <div className="cf-field-wrap">
        <label className="cf-sr" htmlFor="home-q">
          Procurar medicamento
        </label>
        {/* type="text" e não "search": o Edge desenha uma lupa dentro
            do campo, à esquerda do texto. Aqui a caixa é limpa. */}
        <input
          id="home-q"
          className="cf-field"
          type="text"
          inputMode="search"
          value={term}
          placeholder="paracetamol, soro, fraldas…"
          autoComplete="off"
          onChange={(e) => setTerm(e.target.value)}
        />
        <button type="submit" className="search-go" aria-label="Procurar" title="Procurar">
          {ICON_SEARCH}
        </button>
      </div>
    </form>
  )
}
