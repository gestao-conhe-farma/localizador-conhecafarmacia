'use client'

import { useEffect, useRef, useState } from 'react'
import { modelImageCandidates } from '@/lib/product-models'

/**
 * Imagem-modelo da categoria — o lugar da fotografia quando não há
 * embalagem real. Avança na cadeia de ficheiros a cada 404 (`gotas` →
 * `frasco` → `caixa`) e, se nenhum existir, mostra o que recebeu em
 * `children`: a embalagem tipográfica com os dados reais.
 *
 * O `onError` sozinho não chega: quando o ficheiro já falhou antes de o
 * React ligar o handler (cache negativa do browser), o evento perde-se e
 * a moldura ficava vazia. O efeito confirma no DOM que a imagem carregou
 * de facto (`naturalWidth`), e só então desiste.
 *
 * `alt=""` de propósito: o nome do produto já está no cartão ao lado;
 * repeti-lo aqui só faria o leitor de ecrã dizer a mesma coisa duas vezes.
 */
export default function CategoryPhoto({ item, className, children }) {
  const [indice, setIndice] = useState(0)
  const ref = useRef(null)
  const candidatos = modelImageCandidates(item)

  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth === 0) setIndice((i) => i + 1)
  }, [indice])

  if (indice >= candidatos.length) return children

  return (
    <img
      ref={ref}
      className={className}
      src={candidatos[indice]}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIndice((i) => i + 1)}
    />
  )
}
