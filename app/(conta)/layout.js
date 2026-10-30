import AccountShell from '@/components/conta/AccountShell'
import { getAccountSession } from '@/lib/account-session'
import { accountLang } from '@/lib/account-i18n'

export const dynamic = 'force-dynamic'

/**
 * Chassi das páginas de conta do Localizador (/guardados e /reservas).
 *
 * A sessão é a mesma de conta.* e do site (cookie no domínio pai). As
 * páginas continuam a chamar `requireAccount` — é lá que o `next` sabe
 * qual era a rota pedida; aqui só se lê o que a sidebar mostra.
 *
 * O idioma vem da preferência da conta (`user_metadata.lang`), a mesma que
 * o site grava no utility bar e em /perfil/preferencias.
 *
 * O route group não muda os URLs: /guardados e /reservas continuam iguais.
 */
export default async function ContaLayout({ children }) {
  const session = await getAccountSession()
  const user = session?.user
  const meta = user?.user_metadata || {}

  return (
    <AccountShell
      surface="localizador"
      lang={accountLang(user)}
      user={{
        name: meta.full_name || meta.display_name || '',
        email: user?.email || '',
        avatarUrl: meta.avatar_url || '',
      }}
    >
      {children}
    </AccountShell>
  )
}
