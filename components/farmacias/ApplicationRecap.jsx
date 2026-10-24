'use client'

import { useSyncExternalStore } from 'react'

/**
 * O RESUMO DO PEDIDO na página de obrigado.
 *
 * O e-mail de confirmação repete Farmácia, NIF e Município para a pessoa
 * poder corrigir um erro antes de a equipa telefonar. Esta página faz o
 * mesmo — sem pôr dados no URL nem em cookies: o formulário guarda o
 * resumo em `sessionStorage` antes de navegar e este componente lê-o.
 *
 * Se não houver resumo (visita directa, modo privado, storage cheio),
 * não desenha nada: a página continua a fazer sentido sozinha.
 *
 * `useSyncExternalStore` e não `useEffect` + `setState`: ler o storage no
 * efeito obrigava a uma segunda renderização em cascata, e o snapshot do
 * servidor (`null`) permite a hidratação sem desencontro.
 */
const CHAVE = 'adesao:resumo'

/** O `sessionStorage` não emite eventos: não há nada a subscrever. */
function subscrever() {
  return () => {}
}

function ler() {
  try {
    return sessionStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

export default function ApplicationRecap({ enviado = true }) {
  const guardado = useSyncExternalStore(subscrever, ler, () => null)

  let resumo = null
  try {
    resumo = guardado ? JSON.parse(guardado) : null
  } catch {
    resumo = null
  }

  if (!resumo) return null

  const linhas = [
    ['Farmácia', resumo.farmacia],
    ['NIF', resumo.nif],
    ['Município', resumo.municipio],
  ].filter(([, valor]) => String(valor || '').trim())

  if (linhas.length === 0) return null

  const email = String(resumo.email || '').trim()

  return (
    <section className="apply-recap" aria-label="Resumo do pedido enviado">
      <h3>O que recebemos</h3>
      <dl>
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <p>
        {email && (
          <>
            {enviado ? 'A confirmação seguiu para ' : 'A confirmação deveria seguir para '}
            <b>{email}</b>
            {enviado ? '. ' : ', mas não chegou a sair. '}
          </>
        )}
        É o mesmo resumo que segue nesse e-mail. Se algum dado estiver errado, responda-lhe ou fale
        connosco antes de as 72 horas terminarem.
      </p>
    </section>
  )
}
