'use client'

import Link from 'next/link'
import { useFavorites } from '@/components/conta/FavoritesProvider'
import { sair } from '@/lib/actions/account'
import { ACCOUNT_URL, entrarHref } from '@/lib/account-urls'

/**
 * Entrada de conta do Localizador.
 *
 * Não há formulários de autenticação neste sítio: sem sessão, isto é um link
 * para a entrada em `conta.*` com o caminho de volta; com sessão, é o avatar
 * com as duas listas e a saída. A sessão já foi lida pelo `FavoritesProvider`,
 * por isso o cabeçalho não faz um pedido extra só para saber o nome.
 *
 * `variant="drawer"` desenha as mesmas acções como linhas da gaveta móvel.
 */
export default function AccountEntry({ variant = 'header', onNavigate = null }) {
  const favoritos = useFavorites()

  // Este componente nunca desenha no servidor (`ready` só fica verdadeiro
  // depois de o provider ler a sessão), por isso ler o URL aqui não provoca
  // mismatch: o `?next=` devolve a pessoa à página onde estava.
  if (!favoritos?.ready) return null
  const aqui = typeof window === 'undefined' ? '' : window.location.href

  const utilizador = favoritos.user
  const entrar = entrarHref(aqui || undefined)

  if (!utilizador) {
    if (variant === 'drawer') {
      return (
        <li>
          <Link href={entrar} onClick={onNavigate}>
            Entrar na conta
          </Link>
        </li>
      )
    }
    return (
      <a href={entrar} className="acct-entry">
        Entrar
      </a>
    )
  }

  const inicial = (utilizador.email || '?').trim().charAt(0).toUpperCase()
  const ligacoes = [
    { href: '/guardados', label: 'Os meus guardados' },
    { href: '/reservas', label: 'As minhas reservas' },
    { href: `${ACCOUNT_URL}/perfil`, label: 'A minha conta', externo: true },
  ]

  if (variant === 'drawer') {
    return (
      <>
        {ligacoes.map((ligacao) => (
          <li key={ligacao.href}>
            {ligacao.externo ? (
              <a href={ligacao.href} onClick={onNavigate}>
                {ligacao.label} &rarr;
              </a>
            ) : (
              <Link href={ligacao.href} onClick={onNavigate}>
                {ligacao.label}
              </Link>
            )}
          </li>
        ))}
        <li>
          <form action={sair}>
            <button type="submit" className="acct-drawer-leave">
              Sair
            </button>
          </form>
        </li>
      </>
    )
  }

  return (
    <details className="acct-menu">
      <summary className="acct-avatar" aria-label={`Conta de ${utilizador.email}`} title="A conta">
        {inicial}
      </summary>
      <div className="acct-menu-panel">
        <p className="acct-menu-mail">{utilizador.email}</p>
        {ligacoes.map((ligacao) =>
          ligacao.externo ? (
            <a key={ligacao.href} href={ligacao.href} className="acct-menu-item">
              {ligacao.label}
            </a>
          ) : (
            <Link key={ligacao.href} href={ligacao.href} className="acct-menu-item">
              {ligacao.label}
            </Link>
          ),
        )}
        <form action={sair}>
          <button type="submit" className="acct-menu-item acct-menu-leave">
            Sair
          </button>
        </form>
      </div>
    </details>
  )
}
