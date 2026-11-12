/**
 * Terminar a sessão de UMA área sem deitar abaixo as outras.
 *
 * `signOut()` sem âmbito é GLOBAL: o GoTrue invalida todos os refresh tokens
 * daquela conta, em todos os dispositivos. Com três cookies de sessão
 * independentes (lib/supabase/auth-cookie.js), isso quer dizer que sair do
 * portal apagava também a sessão do site — e a do interno, se fosse a mesma
 * conta. Quem carregava em «Sair» numa área era expulso das outras.
 *
 * `scope: 'local'` fecha só esta sessão: apaga a cookie (é o `removeItem` do
 * `@supabase/ssr`, por isso o browser fica mesmo sem ela) e não toca nos
 * refresh tokens das outras áreas.
 *
 * O que se perde: o refresh token desta sessão deixa de ser revogado no
 * servidor. Quem tiver uma cópia dele continua válido até expirar — mas quem
 * carrega em «Sair» num browser partilhado quer sair, e as outras sessões da
 * conta são problema de outro ecrã (mudar a senha, `scope: 'others'`).
 *
 * Devolve o erro (ou null) em vez de lançar: sair é o tipo de acção que tem de
 * resultar mesmo quando a rede falha — a cookie já foi limpa.
 */
export async function encerrarSessao(supabase) {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    return error || null
  } catch (err) {
    return err
  }
}

/**
 * Terminar a sessão em TODOS os dispositivos e áreas (M4 da auditoria).
 *
 * O «Sair» normal é local (acima): a cookie desaparece, mas a cópia do
 * refresh token que esteja noutro sítio — backup do perfil do browser,
 * extensão, terminal partilhado — continua válida até expirar. Num balcão
 * isso quer dizer que a sessão do turno anterior pode ser ressuscitada.
 *
 * Este é o gesto para esse caso: `signOut()` sem âmbito é global no GoTrue
 * e invalida todos os refresh tokens da conta, incluindo os do site e do
 * interno. Por isso não substitui o «Sair» — é uma opção explícita, com
 * esse custo à vista (ver /portal/sessão, «Conta»).
 */
export async function encerrarTodasSessoes(supabase) {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    return error || null
  } catch (err) {
    return err
  }
}
