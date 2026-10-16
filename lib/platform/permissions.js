/**
 * Matriz de permissões da área interna (Equipa Conheça Farmácia).
 *
 * Task 3.2 do plano (docs/2026-10-16-gestor-equipa-conheca-farmacia.md):
 * a tabela §3.2 transcrita para código, numa só fonte de verdade. É AQUI
 * que a autorização acontece a sério — a migração 0027 NÃO alargou a RLS
 * aos níveis internos (`is_admin()` continua a aceitar só `admin` e
 * `superadmin`), pelo que um `suporte` ou um `auditoria` vê exactamente o
 * que este módulo deixar e nada mais. Esconder um botão nunca é
 * autorização: quem chamar a Server Action por POST directo bate na mesma
 * matriz (Task 11.2 Step 5).
 *
 * DESENHO — listas de PERMITIDOS, nunca de proibidos. Cada acção declara
 * quem pode; `can()` com acção desconhecida devolve `false`. A diferença
 * aparece no dia em que alguém acrescenta um nível ou uma acção: com
 * permitidos, o novo nasce sem nada e o acesso só existe depois de escrito
 * na matriz (negado por omissão, OWASP Authorization Cheat Sheet). Com
 * proibidos, herdaria acesso por esquecimento — que é como se inventa
 * permissão sem revisão. A §3.2 diz a mesma coisa por outras palavras:
 * «não há acções fora da matriz — uma acção nova entra na matriz antes de
 * existir na UI».
 *
 * Os nomes das acções são os da §3.2 e viajam sem tradução para dois
 * sítios: o argumento de `requirePlatform()` (lib/platform/session.js) e a
 * coluna `action` de `platform_audit_log`. Não se inventa vocabulário novo
 * a meio caminho.
 *
 * Este módulo não lê ambiente, base de dados nem cookies — é decisão pura,
 * e por isso é o único destes três que se pode provar sem servidor
 * (`decideAccess` abaixo).
 */

/** Os cinco níveis internos (§3.1). `farmacia` NÃO é um deles. */
export const PLATFORM_ROLES = ['superadmin', 'onboarding', 'suporte', 'faturacao', 'auditoria']

/** Como cada nível se chama no ecrã (shell, ficha, trilha). */
export const ROLE_LABELS = {
  superadmin: 'Superadmin',
  onboarding: 'Onboarding',
  suporte: 'Suporte',
  faturacao: 'Facturação',
  auditoria: 'Auditoria',
}

/**
 * Papel legado `admin` (0001): a matriz trata-o como `superadmin`. As
 * policies das migrações 0001/0005/0012/0018/0020/0023 falam de `admin`, e
 * renomear exigiria tocar em seis migrações; o runbook proíbe criar contas
 * novas com este papel, mas uma conta que já exista não pode ficar
 * invisível para o gate — invisível é pior do que visível, porque ninguém
 * percebe por que razão «não tem acesso».
 */
const LEGACY_ROLE = { admin: 'superadmin' }

/** Papel legado normalizado, ou `null` se o papel não é da equipa CF. */
export function normalizeRole(role) {
  if (typeof role !== 'string') return null
  if (Object.hasOwn(LEGACY_ROLE, role)) return LEGACY_ROLE[role]
  return PLATFORM_ROLES.includes(role) ? role : null
}

/** É um nível interno? (`farmacia` e papéis desconhecidos: não.) */
export function isPlatformRole(role) {
  return normalizeRole(role) !== null
}

/** Rótulo do nível, já normalizado. */
export function roleLabel(role) {
  const r = normalizeRole(role)
  return r ? ROLE_LABELS[r] : null
}

/**
 * MATRIZ — acção × nível (§3.2).
 *
 * Campos:
 *   label     — frase curta para o erro e para a UI (`describeAction`).
 *   descricao — o que a acção faz, com as qualificações da §3.2 escritas
 *               (é onde vive o «só ficha comercial», o «só por pagamento»
 *               e o «sem contacto de cliente»).
 *   allow     — quem pode. Lista vazia = ninguém (não existe hoje).
 *   mfa       — exige sessão `aal2` (`ACOES_COM_MFA`).
 *   motivo    — exige motivo escrito por quem executa (`ACOES_COM_MOTIVO`),
 *               gravado em `platform_audit_log.reason`.
 *
 * As duas últimas não são enfeite de UI: `mfa` e `motivo` são avaliados no
 * servidor por `decideAccess()`, a seguir à permissão.
 */
export const ACTIONS = {
  'pharmacy.view': {
    label: 'Ver a ficha da farmácia',
    descricao:
      'Ficha, stock, reservas, integração e histórico da farmácia. O âmbito dentro da ficha é dado por `viewScope()`.',
    allow: ['superadmin', 'onboarding', 'suporte', 'faturacao', 'auditoria'],
  },
  'pharmacy.create': {
    label: 'Criar farmácia',
    descricao: 'Criar a ficha de uma farmácia nova. A conta do dono é convidada à parte.',
    allow: ['superadmin', 'onboarding'],
  },
  'pharmacy.update': {
    label: 'Editar a ficha da farmácia',
    descricao: 'Nome, morada, contactos, horário e mapa.',
    allow: ['superadmin', 'onboarding'],
  },
  'pharmacy.verify': {
    label: 'Confirmar o selo «verificada»',
    descricao: 'O selo é confiança pública do directório: quem o dá tem de ser da equipa.',
    allow: ['superadmin', 'onboarding'],
  },
  'pharmacy.activate': {
    label: 'Activar a farmácia',
    descricao: 'Volta a pôr a farmácia (e o stock dela) em circulação.',
    allow: ['superadmin', 'onboarding'],
  },
  'pharmacy.deactivate': {
    label: 'Desactivar a farmácia',
    descricao:
      'Tira a farmácia do directório e o stock dela do alcance do cliente. Nada é apagado.',
    allow: ['superadmin', 'onboarding'],
    mfa: true,
    motivo: true,
  },
  'stock.confirm_by_phone': {
    label: 'Confirmar stock por telefone',
    descricao:
      'Grava stock com origem `team` quando a farmácia confirma por telefone (migração 0022) — um dado que a farmácia não escreveu.',
    allow: ['superadmin', 'onboarding', 'suporte'],
  },
  'account.invite': {
    label: 'Convidar a conta da farmácia',
    descricao:
      'Convite por e-mail para o dono criar a própria senha. Nada de senhas escolhidas por nós.',
    allow: ['superadmin', 'onboarding'],
    motivo: true,
  },
  'account.resend': {
    label: 'Reenviar o convite',
    descricao:
      'Volta a chamar o convite quando o anterior expirou (não se apaga nada para reenviar).',
    allow: ['superadmin', 'onboarding'],
  },
  'account.revoke': {
    label: 'Revogar um convite pendente',
    descricao:
      'Só para convite por aceitar e com a morada errada ou a farmácia desistida: apagar um user pendente arrasta a linha de `admin_users` em cascata.',
    allow: ['superadmin', 'onboarding'],
    mfa: true,
    motivo: true,
  },
  'account.suspend': {
    label: 'Suspender a conta',
    descricao:
      'Ban na conta Auth + farmácia/perfis inactivos (um ban não corta sessões já emitidas). O `faturacao` usa-o apenas pela via do pagamento: suspende o plano, não desactiva a farmácia (`pharmacy.deactivate` está fora do seu alcance).',
    allow: ['superadmin', 'onboarding', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'account.unsuspend': {
    label: 'Repor a conta suspensa',
    descricao: 'Desfaz a suspensão: tira o ban e reactiva farmácia/perfis.',
    allow: ['superadmin', 'onboarding', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'account.reset_password': {
    label: 'Reenviar a recuperação de senha',
    descricao: 'Manda ao e-mail do dono o caminho de reposição. Nunca define senha por ele.',
    allow: ['superadmin', 'onboarding'],
    motivo: true,
  },
  'account.transfer_ownership.request': {
    label: 'Pedir a transferência de titularidade',
    descricao:
      'Abre o processo (dois passos). A §3.2 diz «✅ (pede)» ao `onboarding`: pedir não é aprovar.',
    allow: ['superadmin', 'onboarding'],
    mfa: true,
    motivo: true,
  },
  'account.transfer_ownership.approve': {
    label: 'Aprovar a transferência de titularidade',
    descricao:
      'Fecha o processo. Só o nível alto aprova, e a aprovação tem de ser de OUTRA pessoa (`separacaoDeFuncoes`).',
    allow: ['superadmin'],
    mfa: true,
    motivo: true,
  },
  'plan.assign': {
    label: 'Atribuir o primeiro plano',
    descricao: 'Põe uma farmácia sem plano em `trial` ou `activo`.',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'plan.change': {
    label: 'Mudar de plano',
    descricao:
      'Subida ou descida. Uma descida nunca apaga nada: o que excede o limite fica inerte.',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'plan.trial': {
    label: 'Iniciar período de experiência',
    descricao: 'Acesso de `gestao` completo com prazo (`trial_until`).',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'plan.grace': {
    label: 'Dar período de graça',
    descricao:
      'Pagamento atrasado: nada se corta no período de graça (`grace_until`, 15 dias por omissão).',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'plan.suspend': {
    label: 'Suspender por pagamento',
    descricao:
      'Corte por incumprimento: a farmácia fica em `localizador`, nunca sem conta nem sem histórico.',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'plan.resume': {
    label: 'Retomar o plano',
    descricao: 'Devolve o plano em vigor depois de regularizado.',
    allow: ['superadmin', 'faturacao'],
    mfa: true,
    motivo: true,
  },
  'audit.read': {
    label: 'Ler a trilha de auditoria',
    descricao: 'Trilha completa, com actor, papel, farmácia, motivo e antes/depois.',
    allow: ['superadmin', 'auditoria'],
  },
  'audit.export': {
    label: 'Exportar a trilha',
    descricao:
      'Exportar é uma acção sensível: o próprio export deixa registo na trilha (`action = audit.export`).',
    allow: ['superadmin', 'auditoria'],
    mfa: true,
    motivo: true,
  },
  'team.manage': {
    label: 'Gerir os níveis internos da equipa',
    descricao:
      'Criar conta interna e mudar níveis. Ninguém se promove (`podeMexerNoNivel`) e o último `superadmin` não sai (verificação em SQL).',
    allow: ['superadmin'],
    mfa: true,
    motivo: true,
  },
  'lead.read': {
    label: 'Ler o funil de leads',
    descricao: '`pharmacy_leads` por estado. O `suporte` lê — não arrasta o funil.',
    allow: ['superadmin', 'onboarding', 'suporte'],
  },
  'lead.update': {
    label: 'Mover um lead no funil',
    descricao: 'Muda o estado (`novo → em_conversa → …`).',
    allow: ['superadmin', 'onboarding'],
  },
  'lead.convert': {
    label: 'Converter um lead em farmácia',
    descricao: 'Farmácia + convite ao dono + estado `onboarded`, numa operação auditada.',
    allow: ['superadmin', 'onboarding'],
  },
}

/** A acção existe na matriz? `null` quando não (inclui gralhas). */
export function actionInfo(action) {
  return Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null
}

/** Pode este nível executar esta acção? Acção desconhecida → `false`. */
export function can(role, action) {
  const r = normalizeRole(role)
  const acao = actionInfo(action)
  if (!r || !acao) return false
  return acao.allow.includes(r)
}

/** Frase para a mensagem de erro («Não tem permissão para: <label>»). */
export function describeAction(action) {
  return actionInfo(action)?.label || action
}

/** As acções deste nível — a sidebar e o shell nascem daqui, não de uma lista à parte. */
export function actionsForRole(role) {
  return Object.keys(ACTIONS).filter((action) => can(role, action))
}

/** A linha da matriz (para o ecrã da equipa). */
export function rolesForAction(action) {
  return [...(actionInfo(action)?.allow || [])]
}

/** Acções que exigem sessão `aal2` (TOTP verificado nesta sessão). */
export const ACOES_COM_MFA = new Set(
  Object.keys(ACTIONS).filter((action) => ACTIONS[action].mfa === true),
)

/** Acções que exigem motivo escrito por quem executa. */
export const ACOES_COM_MOTIVO = new Set(
  Object.keys(ACTIONS).filter((action) => ACTIONS[action].motivo === true),
)

export function requiresMfa(action) {
  return actionInfo(action)?.mfa === true
}

export function requiresMotivo(action) {
  return actionInfo(action)?.motivo === true
}

/**
 * ÂMBITO DENTRO DA FICHA (`pharmacy.view`, §3.2).
 *
 * As qualificações das células «só ficha comercial» (faturacao) e «sem
 * contacto de cliente» (auditoria) são permissões a sério, e não detalhe de
 * UI: quem monta a resposta da ficha tem de as consultar antes de a enviar.
 * Dois cortes independentes:
 *
 *   operacao — stock, reservas, entregas de webhook, chamadas de API. O
 *     `faturacao` tem a ficha COMERCIAL (plano e contactos de facturação),
 *     não o dia-a-dia da farmácia (§3.1: «não deve ter dados
 *     clínicos/operacionais»);
 *   contacto — nome e telefone de quem reservou. O `auditoria` lê a ficha
 *     para poder julgar o que a equipa fez, e não para conhecer clientes —
 *     é o mesmo corte que o comentário da 0001 faz («Contacto do cliente
 *     nunca exposto a terceiros»).
 *
 * Nível ilegível: os dois cortes caem para `false` (falhar para o mínimo).
 */
export function viewScope(role) {
  const r = normalizeRole(role)
  return {
    operacao: r === 'superadmin' || r === 'onboarding' || r === 'suporte' || r === 'auditoria',
    contacto: r === 'superadmin' || r === 'onboarding' || r === 'suporte',
  }
}

// ---------------------------------------------------------------
// Regras estruturais (§3.2, «Regras estruturais»)
// Funções puras para que a regra viva num sítio só: a Server Action
// compara ids e delega aqui, em vez de reescrever a regra (e de a
// reescrever mal).
// ---------------------------------------------------------------

/**
 * «Quem pede não aprova» — a transferência de titularidade tem duas
 * aprovações de pessoas diferentes (NIST AC-3(2) / separação de funções).
 * Sem um dos lados não há dupla aprovação: devolve `false`.
 */
export function separacaoDeFuncoes(pediuUserId, aprovaUserId) {
  if (!pediuUserId || !aprovaUserId) return false
  return pediuUserId !== aprovaUserId
}

/**
 * «Ninguém se promove»: `team.manage` nunca altera o próprio nível. Não
 * impede o resto da regra (o último `superadmin` não sai) — essa é uma
 * consulta ao estado da tabela e vive na acção, em SQL.
 */
export function podeMexerNoNivel(actorUserId, alvoUserId) {
  if (!actorUserId || !alvoUserId) return false
  return actorUserId !== alvoUserId
}

// ---------------------------------------------------------------
// A DECISÃO
// ---------------------------------------------------------------

/**
 * Traduz «quem é» + «o que quer fazer» na resposta que o servidor devolve:
 * `{ ok: true }` ou `{ ok: false, error }` com um dos quatro códigos —
 * `SEM_SESSAO`, `SEM_PERMISSAO`, `MFA_NECESSARIO`, `MOTIVO_OBRIGATORIO`.
 *
 * Pura de propósito: o I/O (cookies, `admin_users`, nível de AAL) fica em
 * lib/platform/session.js, que delega aqui. Assim as quatro recusas
 * provam-se sem base de dados, e a ordem delas não se perde numa refactor
 * de sessão.
 *
 * ORDEM (é deliberada):
 *   1. sessão — sem ela não há nada a dizer;
 *   2. permissão — antes do MFA, para que uma acção fora do alcance do
 *      nível não chegue a pedir o segundo factor (pedir TOTP a quem não
 *      pode fazer a acção revela que a acção existe);
 *   3. MFA — falha FECHADA: nível ilegível não é `aal2` (ver session.js);
 *   4. motivo — por último, e sempre a seguir às outras: pedir texto a
 *      quem já foi recusado seria uma mensagem a mais para nada.
 */
export function decideAccess(sessao, action, { reason } = {}) {
  if (!sessao || !isPlatformRole(sessao.role)) {
    return { ok: false, error: 'SEM_SESSAO' }
  }

  const acao = actionInfo(action)
  if (!acao || !can(sessao.role, action)) {
    return {
      ok: false,
      error: 'SEM_PERMISSAO',
      acao: describeAction(action),
      role: normalizeRole(sessao.role),
    }
  }

  if (acao.mfa && sessao.mfa?.currentLevel !== 'aal2') {
    return {
      ok: false,
      error: 'MFA_NECESSARIO',
      acao: acao.label,
      mfa: {
        currentLevel: sessao.mfa?.currentLevel ?? null,
        nextLevel: sessao.mfa?.nextLevel ?? null,
      },
    }
  }

  if (acao.motivo && !String(reason ?? '').trim()) {
    return { ok: false, error: 'MOTIVO_OBRIGATORIO', acao: acao.label }
  }

  return { ok: true }
}
