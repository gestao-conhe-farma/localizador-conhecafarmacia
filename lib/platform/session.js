import { redirect } from 'next/navigation'
import { createServerComponentClient } from '@/lib/supabase/server'
import { logError } from '@/lib/log'
import {
  can,
  decideAccess,
  describeAction,
  isPlatformRole,
  normalizeRole,
  roleLabel,
} from '@/lib/platform/permissions'

/**
 * Sessão da ÁREA INTERNA (Equipa Conheça Farmácia) — Task 3.3 do plano
 * (docs/2026-10-16-gestor-equipa-conheca-farmacia.md).
 *
 * Espelha `lib/pharmacy-session.js` do portal da farmácia, com duas
 * diferenças que valem a pena nomear:
 *
 *   1. O PAPEL É OUTRO. Aqui só entram os cinco níveis internos; um
 *      `farmacia` sai com `PAPEL_ERRADO`. As duas sessões nunca se cruzam
 *      (risco identificado no plano: «duplicar o admin_users como
 *      identidade interna e da farmácia confunde»).
 *   2. O SEGUNDO FACTOR CONTA. A sessão traz o nível de AAL (TOTP) e as
 *      acções sensíveis exigem `aal2` — validado AQUI, no servidor, nunca
 *      só na UI.
 *
 * A leitura do próprio nível passa pela policy «admin_users self read» da
 * 0001 com o token da pessoa: não é preciso service-role para saber quem
 * é. A autorização fina é `decideAccess()` (lib/platform/permissions.js).
 *
 * Este módulo NÃO tem `'use server'`: não é um ficheiro de Server Actions
 * (exporta constantes e valores, e um `'use server'` faria o build recusar
 * tudo o que não fosse função async). É código SÓ de servidor — importa
 * `next/headers` e cookies, e nunca pode ser importado por um Client
 * Component.
 */

const COLUMNS = 'user_id, role, pharmacy_id, display_name'

/**
 * Porque é que não há sessão — os mesmos códigos que o layout passa em
 * `/interno/login?motivo=…`. Nomear a razão é o que evita o pior dos
 * ecrãs: «não tem acesso» sem dizer se faltam cookies, perfil ou nível.
 */
export const SESSION_REASONS = {
  OK: 'Sessão válida com nível da Equipa CF.',
  SEM_USER: 'Sem sessão iniciada.',
  CONTA_SUSPENSA: 'Conta suspensa pela Equipa CF.',
  ERRO_PERFIL: 'Não foi possível ler o nível desta conta.',
  SEM_PERFIL: 'Esta conta não pertence à Equipa Conheça Farmácia.',
  PAPEL_ERRADO: 'Esta é uma conta de farmácia: o acesso é em /portal.',
  EXCECAO: 'Falha inesperada ao ler a sessão.',
}

/** Acções que exigem `aal2` — reexportado do sítio onde a matriz vive. */
export { ACOES_COM_MFA } from '@/lib/platform/permissions'

/** Sessão interna, ou `null`. Usar nas páginas. */
export async function getPlatformSession() {
  const { session } = await getPlatformSessionVerbose()
  return session
}

/**
 * Igual a `getPlatformSession`, mas nomeia a RAZÃO exacta de não haver
 * sessão (o mesmo espírito de `getPharmacySessionVerbose`).
 *
 * Devolve `{ session, reason, detail? }` e nunca lança: o gate do layout
 * tem de conseguir distinguir «sem cookies» de «conta de farmácia» sem
 * precisar de um try/catch à volta.
 */
export async function getPlatformSessionVerbose() {
  try {
    const supabase = await createServerComponentClient()
    const { data, error: userError } = await supabase.auth.getUser()
    const user = data?.user
    // Sem user: cookies ausentes, token inválido OU conta em ban (o
    // GoTrue responde com erro a um user banido). O detalhe fica no
    // `detail` para o log; o ecrã mostra o motivo genérico.
    if (!user) return { session: null, reason: 'SEM_USER', detail: userError?.message || null }

    // Ban na conta (Phase 6.3: suspender = ban + farmácia/perfis inactivos).
    // O Supabase corta sessões NOVAS de uma conta banida, mas não as já
    // emitidas — por isso, se o `banned_until` vier no user, a porta
    // fecha-se também aqui, em vez de ficar aberta até ao token expirar.
    const banidoAte = user.banned_until ? new Date(user.banned_until) : null
    if (banidoAte && !Number.isNaN(banidoAte.getTime()) && banidoAte > new Date()) {
      return { session: null, reason: 'CONTA_SUSPENSA', detail: user.banned_until }
    }

    // Colunas nomeadas, não `*`: o gate só precisa de saber quem é e que
    // nível tem. A policy «admin_users self read» (0001) deixa ler a
    // própria linha; mais nada.
    const { data: profile, error } = await supabase
      .from('admin_users')
      .select(COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return { session: null, reason: 'ERRO_PERFIL', detail: error.message }
    if (!profile) return { session: null, reason: 'SEM_PERFIL' }
    if (!isPlatformRole(profile.role)) {
      return { session: null, reason: 'PAPEL_ERRADO', detail: profile.role }
    }

    const role = normalizeRole(profile.role)
    const mfa = await getMfaState(supabase)

    return {
      session: {
        user,
        profile,
        role,
        // O papel GRAVADO, tal como está na base (`admin` legado incluído):
        // é este que a trilha guarda em `actor_role`. O normalizado serve
        // para decidir; o gravado serve para auditar.
        roleRaw: profile.role,
        roleLabel: roleLabel(role),
        legacy: profile.role !== role,
        mfa,
      },
      reason: 'OK',
    }
  } catch (err) {
    logError('platform', 'Falha ao obter a sessão da área interna', {
      message: err?.message || String(err),
    })
    return { session: null, reason: 'EXCECAO', detail: err?.message || String(err) }
  }
}

/**
 * Nível de garantia da própria sessão (TOTP).
 *
 * `getAuthenticatorAssuranceLevel()` sem argumento lê o JWT da sessão
 * actual: `aal1` = só password/e-mail, `aal2` = segundo factor verificado
 * nesta sessão. `nextLevel === 'aal2'` significa que a conta TEM factor
 * verificado mas ainda o não confirmou nesta sessão — é o que o ecrã de
 * login usa para pedir o código.
 *
 * Falha de leitura → `currentLevel: null`, ou seja «não sei»; e
 * `decideAccess` recusa as acções sensíveis com `MFA_NECESSARIO`. É falhar
 * FECHADO de propósito: uma sessão interna roubada não pode ganhar poder de
 * suspender farmácias só porque o nível de AAL não respondeu.
 */
async function getMfaState(supabase) {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      logError('platform', 'Não foi possível ler o nível de MFA da sessão', {
        message: error.message,
      })
      return {
        currentLevel: null,
        nextLevel: null,
        verificado: false,
        pendente: false,
        erro: error.message,
      }
    }
    const currentLevel = data?.currentLevel ?? null
    const nextLevel = data?.nextLevel ?? null
    return {
      currentLevel,
      nextLevel,
      verificado: currentLevel === 'aal2',
      // A conta TEM factor verificado e esta sessão ainda não o confirmou:
      // há um passo por fazer. É este o estado que distingue «entrou» de
      // «entrou a meio» — e o que impede a página de login de tratar uma
      // sessão aal1 como sessão completa (era por aí que o passo do código
      // desaparecia: a action devolvia MFA_NECESSARIO, o React redesenhava
      // a rota e a página via uma sessão e mandava para /interno).
      pendente: nextLevel === 'aal2' && currentLevel !== 'aal2',
      metodos: data?.currentAuthenticationMethods ?? [],
      erro: null,
    }
  } catch (err) {
    logError('platform', 'Excepção ao ler o nível de MFA da sessão', {
      message: err?.message || String(err),
    })
    return {
      currentLevel: null,
      nextLevel: null,
      verificado: false,
      pendente: false,
      erro: err?.message || String(err),
    }
  }
}

/**
 * GUARD DE PÁGINA: sem sessão vai para o login, com o motivo no URL. Usar
 * no topo de cada página/shell da área interna (`/interno/(console)`).
 *
 * O `redirect` fica fora de qualquer try/catch: `redirect()` funciona
 * lançando (NEXT_REDIRECT), e um catch à volta engolia-o — armadilha já
 * conhecida neste projecto.
 */
export async function requirePlatformSession() {
  const { session, reason } = await getPlatformSessionVerbose()
  if (!session) redirect(`/interno/login?motivo=${reason}`)
  return session
}

/**
 * GUARD DE ACÇÃO (o que interessa): permissão + MFA + motivo, avaliados no
 * servidor por `decideAccess()`.
 *
 * Devolve `{ ok: true, session }` ou `{ ok: false, error, acao? }` com
 * `SEM_SESSAO` | `SEM_PERMISSAO` | `MFA_NECESSARIO` | `MOTIVO_OBRIGATORIO`
 * — no formato `{ ok, error }` do resto do projecto, para a Server Action
 * poder devolvê-lo à UI tal e qual.
 *
 * `reason` é o motivo escrito por quem executa: nas acções da lista
 * `ACOES_COM_MOTIVO` é obrigatório e vai parar a `platform_audit_log`. A
 * verificação vive aqui (e não no schema) para que a trilha nunca recuse
 * registar — ver o comentário da coluna `reason` na migração 0027.
 */
export async function requirePlatform(action, { reason } = {}) {
  const session = await getPlatformSession()
  const decisao = decideAccess(session, action, { reason })
  if (!decisao.ok) return decisao
  return { ok: true, session }
}

/**
 * GUARD DE LEITURA: sessão + permissão, SEM MFA e SEM motivo.
 *
 * Existe porque a matriz descreve ACÇÕES: `plan.change` exige `aal2` e
 * motivo porque MUDA o plano de uma farmácia. LER o estado dos planos não
 * é isso, e tratá-lo como se fosse fechava o ecrã dos planos a quem ainda
 * não confirmou o código do autenticador — um ecrã que só mostra dados a
 * quem tem o nível para os ver (o mesmo `can()` da página).
 *
 * A regra que fica: as leituras usam este guard, as escritas usam
 * `requirePlatform`. Se um dia a matriz ganhar acções de leitura próprias
 * (`plan.read`), é aqui que elas entram.
 */
export async function requirePlatformRead(action) {
  const session = await getPlatformSession()
  if (!session) return { ok: false, error: 'SEM_SESSAO' }
  if (action && !can(session.role, action)) {
    return { ok: false, error: 'SEM_PERMISSAO', acao: describeAction(action) }
  }
  return { ok: true, session }
}

/**
 * GUARD DE PÁGINA COM PERMISSÃO: sessão (redirecciona se não houver) e, se
 * a página exigir uma acção, devolve `SEM_PERMISSAO` para o ecrã mostrar —
 * em vez de redireccionar, porque quem chegou aqui por URL directo precisa
 * de saber porquê (Task 4.2 Step 3).
 */
export async function requirePlatformPage(action) {
  const session = await requirePlatformSession()
  if (action && !can(session.role, action)) {
    return { ok: false, error: 'SEM_PERMISSAO', acao: describeAction(action), session }
  }
  return { ok: true, session }
}
