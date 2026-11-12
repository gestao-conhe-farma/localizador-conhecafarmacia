/**
 * Guard do segundo factor para ESCRITAS do portal (achado A1 da auditoria).
 *
 * O layout do portal exige `aal2` ao gerente, mas um layout protege
 * PÁGINAS — as Server Actions são endpoints POST e não passam por ele.
 * Sem esta revalidação, quem tiver a password da conta escreve stock,
 * reservas, equipa e chaves de integração sem TOTP.
 *
 * Regra:
 *   • perfil de balcão não tem factor próprio (o TOTP é da conta, do
 *     gerente) — não se exige `aal2` a quem está a atender;
 *   • gerente exige `aal2` NESTA sessão;
 *   • sem perfil identificado não se sabe o papel → falha fechado. É o
 *     que impede o contorno óbvio: chamar a acção sem o cookie
 *     `portal-staff` para o guard não encontrar o gerente.
 *
 * O perfil é também o que dá nome ao autor da escrita (M1 da auditoria):
 * `portalWriteGate` recusa sem perfil em vez de gravar sem autor.
 *
 * Vive num módulo sem imports de Next para poder ser exercitado por
 * `scripts/smoke-portal-mfa.js`.
 */

export const MFA_NECESSARIO = 'MFA_NECESSARIO'

/**
 * @param {object|null} session — sessão da farmácia (com `mfa.currentLevel`)
 * @param {object|null} staff — perfil de balcão activo (com `role`)
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function managerMfaGate(session, staff) {
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }

  if (staff?.role === 'balcao') return { ok: true }
  if (session.mfa?.currentLevel === 'aal2') return { ok: true }

  // Gerente em `aal1`, ou perfil desconhecido: não se escreve.
  return { ok: false, error: MFA_NECESSARIO }
}

/**
 * Guard das ESCRITAS do portal: perfil de balcão obrigatório (M1) e, para
 * gerente, `aal2` nesta sessão (A1).
 *
 * Sem perfil não há autor para o movimento nem prova de que quem está ao
 * terminal é um farmacêutico — o PIN de 4 dígitos deixaria de significar
 * algo. `bootstrapFirstProfile` fica de fora: corre quando ainda não existe
 * equipa nenhuma para validar.
 *
 * @param {object|null} session
 * @param {object|null} staff
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function portalWriteGate(session, staff) {
  if (!session) return { ok: false, error: 'SESSAO_EXPIRADA' }
  if (!staff) return { ok: false, error: 'SEM_PERFIL' }
  return managerMfaGate(session, staff)
}
