/**
 * Idioma da área de conta do Localizador.
 *
 * O Localizador não tem `[lang]` no URL e não usa o `LangProvider` do site.
 * A preferência é a mesma da conta: `user_metadata.lang`, gravada em
 * /perfil/preferencias e pelo seletor do utility bar do site. Sem
 * preferência, PT — é o idioma do produto.
 *
 * O dicionário vive aqui (e não em `public/i18n`) porque só estas duas
 * páginas e o chassi o usam; é código puro, por isso serve Server e Client
 * Components sem passar por contexto.
 */

const PT = {
  nav: {
    aria: 'Secções da conta',
    home: 'A minha conta — visão geral',
    close: 'Fechar menu',
    open: 'Abrir menu',
    kicker: 'A minha conta',
    logout: 'Sair',
    site: 'Site',
    locator: 'Localizador',
    groups: {
      conta: 'Conta',
      participacao: 'Participação',
      localizador: 'Localizador',
      estudo: 'Estudo',
    },
    items: {
      overview: 'Visão geral',
      preferences: 'Preferências',
      privacy: 'Privacidade',
      security: 'Segurança',
      events: 'Eventos',
      activity: 'Atividade',
      saved: 'Guardados',
      reservations: 'Reservas',
      student: 'Perfil de estudante',
      settings: 'Definições',
    },
  },
  saved: {
    title: 'Os meus guardados',
    sub: 'Os medicamentos e as farmácias que guardou. Ficam nesta conta, nos três sítios — Localizador, site e conta.',
    error:
      'Não foi possível abrir os guardados. Tente outra vez daqui a pouco. Se continuar, a sua lista está segura — o problema é nosso, não dos itens que guardou.',
    emptyTitle: 'Ainda não guardou nada',
    emptySub:
      'Guarde um medicamento para o encontrar depressa quando precisar, ou uma farmácia de confiança para voltar ao stock dela.',
    searchDrug: 'Pesquisar medicamento',
    viewPharmacies: 'Ver farmácias',
    products: 'Produtos',
    pharmacies: 'Farmácias',
    unavailableProduct: 'Produto já não disponível',
    outOfCatalog: 'Fora do catálogo',
    stockCta: 'Ver onde está em stock',
    unavailablePharmacy: 'Farmácia já não disponível',
    partner: 'Farmácia parceira',
    outsideLocator: 'Fora do Localizador',
    verified: 'Verificada',
    shelfCta: 'Ver prateleira confirmada',
    remove: 'Remover',
    itemsOne: '{n} item',
    itemsMany: '{n} itens',
  },
  reservations: {
    title: 'As minhas reservas',
    sub: 'O estado de cada reserva é atualizado pela farmácia. As reservas feitas sem conta continuam a acompanhar-se pelo link que a farmácia envia.',
    error:
      'Não foi possível abrir as reservas. Tente outra vez daqui a pouco. As reservas na farmácia não dependem desta página — se tem um link de acompanhamento, ele continua a funcionar.',
    emptyTitle: 'Ainda não fez reservas com esta conta',
    emptySub:
      'Quando reservar um medicamento com sessão iniciada, ele fica aqui com o estado atualizado pela farmácia.',
    searchDrug: 'Pesquisar medicamento',
    viewPharmacies: 'Ver farmácias',
    history: 'Histórico',
    drugFallback: 'Medicamento',
    track: 'Acompanhar',
    viewPharmacy: 'Ver farmácia',
    one: '{n} reserva',
    many: '{n} reservas',
    status: {
      pendente: {
        label: 'Recebida',
        hint: 'A farmácia vai responder em até 72 horas.',
      },
      confirmada: {
        label: 'Confirmada',
        hint: 'A farmácia separou o produto para si.',
      },
      pronta: {
        label: 'Pronta a levantar',
        hint: 'Pode passar na farmácia.',
      },
      concluida: {
        label: 'Levantada',
        hint: 'Reserva concluída.',
      },
      recusada: {
        label: 'Não atendida',
        hint: 'A farmácia não conseguiu atender.',
      },
      expirada: {
        label: 'Expirada',
        hint: 'O prazo venceu sem resposta.',
      },
    },
  },
}

const EN = {
  nav: {
    aria: 'Account sections',
    home: 'My account — overview',
    close: 'Close menu',
    open: 'Open menu',
    kicker: 'My account',
    logout: 'Sign out',
    site: 'Site',
    locator: 'Locator',
    groups: {
      conta: 'Account',
      participacao: 'Participation',
      localizador: 'Locator',
      estudo: 'Study',
    },
    items: {
      overview: 'Overview',
      preferences: 'Preferences',
      privacy: 'Privacy',
      security: 'Security',
      events: 'Events',
      activity: 'Activity',
      saved: 'Saved',
      reservations: 'Reservations',
      student: 'Student profile',
      settings: 'Settings',
    },
  },
  saved: {
    title: 'My saved items',
    sub: 'The medicines and pharmacies you saved. They live in this account, across all three sites — Locator, site and account.',
    error:
      'We could not open your saved items. Try again in a moment. If it persists, your list is safe — the problem is ours, not the items you saved.',
    emptyTitle: 'You have not saved anything yet',
    emptySub:
      'Save a medicine to find it quickly when you need it, or a pharmacy you trust to go back to its stock.',
    searchDrug: 'Search medicine',
    viewPharmacies: 'View pharmacies',
    products: 'Products',
    pharmacies: 'Pharmacies',
    unavailableProduct: 'Product no longer available',
    outOfCatalog: 'Not in the catalogue',
    stockCta: 'See where it is in stock',
    unavailablePharmacy: 'Pharmacy no longer available',
    partner: 'Partner pharmacy',
    outsideLocator: 'Not in the Locator',
    verified: 'Verified',
    shelfCta: 'See confirmed shelf',
    remove: 'Remove',
    itemsOne: '{n} item',
    itemsMany: '{n} items',
  },
  reservations: {
    title: 'My reservations',
    sub: 'Each reservation status is updated by the pharmacy. Reservations made without an account can still be tracked through the link the pharmacy sends.',
    error:
      'We could not open your reservations. Try again in a moment. The reservations at the pharmacy do not depend on this page — if you have a tracking link, it still works.',
    emptyTitle: 'You have not made reservations with this account yet',
    emptySub:
      'When you reserve a medicine while signed in, it shows up here with the status updated by the pharmacy.',
    searchDrug: 'Search medicine',
    viewPharmacies: 'View pharmacies',
    history: 'History',
    drugFallback: 'Medicine',
    track: 'Track',
    viewPharmacy: 'View pharmacy',
    one: '{n} reservation',
    many: '{n} reservations',
    status: {
      pendente: {
        label: 'Received',
        hint: 'The pharmacy will reply within 72 hours.',
      },
      confirmada: {
        label: 'Confirmed',
        hint: 'The pharmacy has set the product aside for you.',
      },
      pronta: {
        label: 'Ready for pickup',
        hint: 'You can collect it at the pharmacy.',
      },
      concluida: {
        label: 'Collected',
        hint: 'Reservation completed.',
      },
      recusada: {
        label: 'Declined',
        hint: 'The pharmacy could not fulfil it.',
      },
      expirada: {
        label: 'Expired',
        hint: 'The deadline passed without a reply.',
      },
    },
  },
}

const DICTS = { pt: PT, en: EN }

/** Idioma da conta a partir dos metadados da sessão. Sem preferência, PT. */
export function accountLang(user) {
  const meta = user?.user_metadata || {}
  const escolhido = meta.lang || meta.preferred_lang || meta.idioma
  return escolhido === 'en' ? 'en' : 'pt'
}

/** Locale para datas — `en-GB` mantém o dia antes do mês. */
export function accountLocale(lang) {
  return lang === 'en' ? 'en-GB' : 'pt-PT'
}

function lookup(dict, key, params) {
  const partes = String(key).split('.')
  let valor = dict
  for (const parte of partes) {
    if (valor && typeof valor === 'object' && parte in valor) valor = valor[parte]
    else return key
  }
  if (typeof valor !== 'string') return key
  if (!params) return valor
  return valor.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`))
}

/**
 * Tradutor. Devolve `t(chave, params)` — chaves pontuadas, `{n}` substituído.
 * Chave em falta devolve a própria chave (nunca rebenta a página).
 */
export function accountT(lang) {
  const dict = DICTS[lang === 'en' ? 'en' : 'pt']
  return (key, params) => lookup(dict, key, params)
}
