import Link from 'next/link'
import { ACCOUNT_URL } from '@/lib/account-session'

/**
 * Cabeçalho comum de /guardados e /reservas.
 *
 * Só estas duas listas vivem neste repositório; o perfil, a segurança e o
 * resto da conta estão em `conta.*` e abrem noutro host — daí o link
 * absoluto com `target` implícito (navegação normal, mesma aba).
 */
const TABS = [
  { href: '/guardados', id: 'guardados', label: 'Guardados' },
  { href: '/reservas', id: 'reservas', label: 'Reservas' },
]

export default function AccountNav({ active }) {
  return (
    <nav className="acct-nav" aria-label="A minha conta">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`acct-nav-link${active === tab.id ? ' acct-nav-link--on' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
      <a className="acct-nav-link acct-nav-link--out" href={`${ACCOUNT_URL}/perfil`}>
        A minha conta
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>
    </nav>
  )
}
