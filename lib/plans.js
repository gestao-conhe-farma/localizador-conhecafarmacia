/**
 * Catálogo de planos e entitlements (migração 0028).
 *
 * Esta é a FONTE DE VERDADE da autorização por plano: preços, limites e
 * funcionalidades vivem aqui, em código, porque mudam mais depressa que o
 * schema e porque autorização em dados editáveis é autorização que se
 * muda sem revisão. Na base de dados vive só o ESTADO de cada farmácia
 * (`pharmacy_subscriptions`: que plano tem e em que ponto do ciclo está).
 *
 * Regra de ouro de `entitlements()`: um plano desconhecido resolve para o
 * MÍNIMO, nunca para o máximo. Um erro de escrita no `plan_code` tira
 * acesso a mais, nunca dá acesso a mais.
 *
 * Convenção de nomes: as funcionalidades do portal e os limites usam as
 * mesmas chaves que o plano (docs/2026-10-16-gestor-equipa-conheca-farmacia.md, §3.3/§3.4).
 */

export const ENTRY_PLAN = 'localizador'

/** Do mais baixo para o mais alto — usado para dizer qual plano desbloqueia. */
export const PLAN_ORDER = ['localizador', 'gestao', 'conformidade']

export const PLANS = {
  localizador: {
    code: 'localizador',
    nome: 'Localizador',
    precoKz: 0,
    descricao: 'Aparecer no Localizador com o stock confirmado.',
  },
  gestao: {
    code: 'gestao',
    nome: 'Gestão',
    precoKz: 15000,
    descricao: 'Gerir stock, equipa e relatórios, e ligar o sistema da farmácia.',
  },
  conformidade: {
    code: 'conformidade',
    nome: 'Conformidade',
    precoKz: 45000,
    fase: '2B',
    descricao: 'Gestão + facturação conforme, por parceiro certificado.',
  },
}

/**
 * Funcionalidades de portal que dependem do plano.
 * `plano` = o plano mais baixo que a desbloqueia (para a mensagem).
 */
export const FEATURES = {
  movimentos: {
    label: 'Movimentos',
    plano: 'gestao',
    descricao: 'O livro-razão do stock: de onde veio cada saldo e porquê.',
  },
  vendas: {
    label: 'Vendas',
    plano: 'gestao',
    descricao: 'Total estimado por dia a partir das reservas concluídas.',
  },
  desempenho: {
    label: 'Desempenho',
    plano: 'gestao',
    descricao: 'Ranking da equipa e comparação entre perfis.',
  },
  equipa: {
    label: 'Equipa',
    plano: 'gestao',
    descricao: 'Perfis do balcão com PIN, com tudo atribuído por pessoa.',
  },
  integracao: {
    label: 'Integração',
    plano: 'gestao',
    descricao: 'Chaves de API, importação CSV e webhooks para o sistema da farmácia.',
  },
}

/**
 * Limites por plano. Os valores de `gestao` são os que o código já usava
 * como constantes globais antes dos planos (MAX_WEBHOOKS = 5,
 * MAX_IMPORT_ROWS = 2000, rate_limit_per_minute = 120 na chave) — o plano
 * passa a ser quem os resolve, em vez de uma constante igual para todos.
 *
 * `features` repete FEATURES como bool para consulta directa por chave.
 */
export const LIMITS = {
  localizador: {
    apiKeys: 0,
    webhooks: 0,
    importRows: 0,
    staffProfiles: 0,
    exportsPerMonth: 0,
    movementsMonths: 0,
    ingestPerMinute: 0,
    features: {
      movimentos: false,
      vendas: false,
      desempenho: false,
      equipa: false,
      integracao: false,
    },
  },
  gestao: {
    apiKeys: 3,
    webhooks: 5,
    importRows: 2000,
    staffProfiles: 10,
    exportsPerMonth: 4,
    movementsMonths: 24,
    ingestPerMinute: 120,
    features: {
      movimentos: true,
      vendas: true,
      desempenho: true,
      equipa: true,
      integracao: true,
    },
  },
  conformidade: {
    apiKeys: 5,
    webhooks: 5,
    importRows: 2000,
    staffProfiles: 20,
    exportsPerMonth: 12,
    movementsMonths: 36,
    ingestPerMinute: 300,
    features: {
      movimentos: true,
      vendas: true,
      desempenho: true,
      equipa: true,
      integracao: true,
    },
  },
}

/** Como se chama cada limite numa frase («Não pode criar mais » + rótulo). */
export const LIMIT_LABELS = {
  apiKeys: 'chaves de API activas',
  webhooks: 'destinos de webhook',
  importRows: 'linhas por importação',
  staffProfiles: 'perfis de equipa',
  exportsPerMonth: 'exportações por mês',
  movementsMonths: 'meses de histórico de movimentos',
  ingestPerMinute: 'pedidos por minuto na API',
}

/**
 * O CATÁLOGO PRONTO PARA ECRÃ: por plano, o nome, o preço, o que abre
 * (rótulos de `FEATURES`) e os limites com rótulo (`LIMIT_LABELS`).
 *
 * Vive aqui — e não numa lista escrita dentro de um componente — para que
 * um plano novo neste ficheiro apareça sozinho no ecrã do primeiro plano e
 * no diálogo de mudança de plano. Os ecrãs (ficha, planos, primeiro plano)
 * e as Server Actions leem todos daqui.
 */
export function catalogoPlanos() {
  return PLAN_ORDER.map((code) => {
    const info = planInfo(code)
    const ent = entitlements(code)
    return {
      code,
      nome: info.nome,
      precoKz: info.precoKz,
      descricao: info.descricao,
      fase: info.fase ?? null,
      funcionalidades: Object.entries(FEATURES)
        .filter(([chave]) => ent.features[chave] === true)
        .map(([, f]) => f.label),
      limites: Object.keys(LIMIT_LABELS)
        .filter((chave) => typeof ent[chave] === 'number' && ent[chave] > 0)
        .map((chave) => ({ chave, rotulo: LIMIT_LABELS[chave], valor: ent[chave] })),
    }
  })
}

/**
 * ENTITLEMENTS — o que um plano pode.
 * Sem argumento devolve o plano de entrada (ver regra de ouro acima).
 */
export function entitlements(planCode) {
  return LIMITS[planCode] || LIMITS[ENTRY_PLAN]
}

/** Ficha do plano (nome, preço) — para o chip do portal e para a área interna. */
export function planInfo(planCode) {
  return PLANS[planCode] || PLANS[ENTRY_PLAN]
}

export function hasFeature(planCode, feature) {
  return entitlements(planCode).features[feature] === true
}

/**
 * Tecto de pedidos/minuto da ingestão por API.
 *
 * O limite da chave é o tecto TÉCNICO; o do plano é o de NEGÓCIO. Uma
 * chave que já existe continua a sincronizar mesmo num plano sem
 * integração (`ingestPerMinute === 0` quer dizer «não se vende», não
 * «zero pedidos»): descer de plano nunca tranca o que está a correr, e o
 * que impede integrações NOVAS é o guard de `createApiKey`. Nos planos que
 * vendem integração, vale o menor dos dois limites.
 *
 * Com o interruptor desligado, só o tecto técnico da chave conta.
 */
export function ingestLimitFor(planCode, technicalLimit, enforced = PLANS_ENFORCED) {
  const technical = technicalLimit > 0 ? technicalLimit : 120
  if (!enforced) return technical
  const planLimit = entitlements(planCode).ingestPerMinute
  if (!planLimit) return technical
  return Math.min(technical, planLimit)
}

/** O plano mais baixo que desbloqueia esta funcionalidade (ou null). */
export function planNeededForFeature(feature) {
  const wanted = FEATURES[feature]?.plano
  if (!wanted) return null
  return PLAN_ORDER.includes(wanted) ? wanted : null
}

/** O plano mais baixo cujo limite chega para `need` unidades. */
export function planNeededForLimit(limitKey, need) {
  for (const code of PLAN_ORDER) {
    if (entitlements(code)[limitKey] >= need) return code
  }
  return null
}

/**
 * INTERRUPTOR DOS PLANOS.
 *
 * Os planos são aplicados POR OMISSÃO (`PLANS_ENFORCED=false` desliga).
 *
 * Decisão registada em 16/10/2026 pelo dono do produto: as farmácias do
 * piloto ficam no plano de entrada e a aplicação passa a valer como está
 * desenhada — Movimentos, Vendas, Desempenho, Equipa e Integração são
 * funções do plano Gestão, e quem as quiser sobe de plano. As chaves
 * existentes NÃO são revogadas e a ingestão que já está a correr não é
 * cortada: uma descida de plano nunca tranca o que já existe. Por isso
 * `ingestPerMinute` só limita planos que vendem integração; uma chave
 * antiga num plano sem ela mantém o limite técnico da própria chave
 * (`app/api/ingest/stock/route.js`). Integrações NOVAS continuam fechadas
 * (`apiKeys` = 0).
 *
 * `PLANS_ENFORCED=false` no ambiente desliga tudo de imediato e sem
 * deploy — é a saída de emergência se um cliente pagante ficar bloqueado
 * por engano (a seguir ao desligar, corrige-se `pharmacy_subscriptions` e
 * volta a ligar-se).
 */
export const PLANS_ENFORCED = process.env.PLANS_ENFORCED !== 'false'
