/**
 * Imagens-modelo por categoria de apresentação — o que ocupa o lugar da
 * fotografia enquanto a farmácia (ou o catálogo) não tem a embalagem real.
 *
 * A categoria vem da FORMA como a farmácia a escreveu (`drug_form`, texto
 * livre: «comprimido», «bisnaga», «frasco»…) e, quando ela não chega, do
 * nome e do tipo de produto (`drug_kind`). Nada aqui é gravado na base:
 * é uma leitura do que já existe, para que substituir um ficheiro em
 * `public/produtos/` mude o Localizador inteiro sem migração.
 *
 * REGRA DE HONESTIDADE: a imagem-modelo é genérica — sem nome nem marca.
 * O nome do produto continua a vir do texto do cartão, nunca da imagem.
 *
 * Cada categoria tem uma cadeia de recurso: se `gotas.webp` ainda não
 * existir, tenta `frasco.webp` e, por fim, `caixa.webp`. Assim as imagens
 * podem ser produzidas aos poucos, sem deixar buracos na grelha.
 */

const DIR = '/produtos'
const EXTENSOES = ['webp', 'png']

/**
 * Imagens-modelo CARREGADAS pela equipa (área interna) vivem no Storage —
 * em produção a pasta `public/` do deployment é só de leitura. O nome é
 * determinístico (`modelos/<slug>.jpg`), por isso o cartão sabe onde
 * procurar sem tabela nem manifesto; o upload é sempre convertido para
 * JPEG no browser (um só formato, um só caminho).
 */
const STORAGE_BUCKET = 'drug-images'
const STORAGE_DIR = 'modelos'

export function modelStoragePath(slug) {
  return `${STORAGE_DIR}/${slug}.jpg`
}

/** URL pública da imagem-modelo carregada — null quando não há ambiente. */
export function modelStorageUrl(slug) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${modelStoragePath(slug)}`
}

/**
 * Famílias de produto reconhecidas pelo NOME (ou pela forma, quando a
 * própria forma já diz o que é). Vêm antes das formas de embalagem:
 * «Pasta de dentes … bisnaga» é higiene oral, não um creme.
 */
const FAMILIAS = [
  { slug: 'fraldas', palavras: ['fralda', 'fraldas'] },
  {
    slug: 'toalhitas',
    palavras: ['toalhita', 'toalhitas', 'lenco umedecido', 'lencos umedecidos'],
  },
  { slug: 'biberao', palavras: ['biberao', 'biberoes', 'chupeta', 'chupetas'] },
  { slug: 'lata', palavras: ['leite em po', 'leite', 'lata de leite', 'formula infantil'] },
  {
    slug: 'higiene-oral',
    palavras: [
      'escova',
      'escovas',
      'pasta de dentes',
      'pasta dentifrica',
      'pasta dentaria',
      'creme dental',
      'dentifrico',
      'fio dental',
      'elixir oral',
      'enxaguante',
    ],
  },
  { slug: 'sabonete', palavras: ['sabonete', 'sabonetes', 'sabao', 'saboes'] },
  {
    slug: 'desodorizante',
    palavras: ['desodorizante', 'desodorantes', 'desodorante', 'roll on', 'antitranspirante'],
  },
  {
    slug: 'batom',
    palavras: ['batom', 'batons', 'maquilha', 'maquilhagem', 'rimel', 'blush', 'sombra'],
  },
  {
    slug: 'perfume',
    palavras: ['perfume', 'perfumes', 'eau de parfum', 'eau de toilette', 'colonia'],
  },
  { slug: 'teste', palavras: ['teste', 'testes', 'teste de gravidez', 'teste de ovulacao'] },
  { slug: 'preservativo', palavras: ['preservativo', 'preservativos', 'camisaozinho'] },
  {
    slug: 'penso',
    palavras: [
      'compressa',
      'compressas',
      'penso',
      'pensos',
      'adesivo',
      'adesivos',
      'ligadura',
      'ligaduras',
      'gaze',
      'gazes',
    ],
  },
  {
    slug: 'dispositivo',
    palavras: [
      'termometro',
      'termometros',
      'esfigmomanometro',
      'tensiometro',
      'seringa',
      'seringas',
      'luva',
      'luvas',
      'mascara',
      'mascaras',
      'algodao',
    ],
  },
  {
    slug: 'alcool',
    palavras: ['alcool', 'alcool etilico', 'desinfetante', 'antisseptico', 'agua oxigenada'],
  },
  { slug: 'soro', palavras: ['soro', 'soro fisiologico', 'ringer', 'solucao salina'] },
]

/** Formas de embalagem — como o produto se apresenta na prateleira. */
const FORMAS = [
  {
    slug: 'comprimido',
    palavras: [
      'comprimido',
      'comprimidos',
      'comprime',
      'comprimes',
      'capsula',
      'capsulas',
      'dragea',
      'drageas',
      'pastilha',
      'pastilhas',
      'tablete',
      'tabletes',
      'blister',
    ],
  },
  {
    slug: 'gotas',
    palavras: ['gotas', 'gota', 'conta gotas', 'colirio', 'colirios', 'oftalmico'],
  },
  {
    slug: 'xarope',
    palavras: [
      'xarope',
      'xaropes',
      'solucao oral',
      'solucao',
      'suspensao',
      'suspensao oral',
      'elixir',
      'emulsao',
      'liquido oral',
    ],
  },
  {
    slug: 'injetavel',
    palavras: [
      'injetavel',
      'injetaveis',
      'injectavel',
      'ampola',
      'ampolas',
      'vial',
      'vials',
      'frasco ampola',
    ],
  },
  {
    slug: 'supositorio',
    palavras: ['supositorio', 'supositorios', 'ovulo', 'ovulos', 'ovulo vaginal'],
  },
  {
    slug: 'po-sache',
    palavras: ['po', 'pos', 'saqueta', 'saquetas', 'sache', 'saches', 'granulado', 'po soluvel'],
  },
  {
    slug: 'bisnaga',
    palavras: [
      'bisnaga',
      'bisnagas',
      'tubo',
      'tubos',
      'pomada',
      'pomadas',
      'creme',
      'cremes',
      'gel',
      'geis',
      'unguento',
      'locao',
    ],
  },
  { slug: 'boiao', palavras: ['boiao', 'boioes', 'pote', 'potes', 'vaso', 'tarro'] },
  { slug: 'inalador', palavras: ['inalador', 'inaladores', 'bombinha', 'nebulizador'] },
  { slug: 'spray', palavras: ['spray', 'sprays', 'aerossol', 'spray nasal'] },
  { slug: 'frasco', palavras: ['frasco', 'frascos', 'flacone', 'flaconete'] },
  { slug: 'lata', palavras: ['lata', 'latas'] },
  { slug: 'pacote', palavras: ['pacote', 'pacotes', 'embalagem', 'embalagens', 'saquinho'] },
  { slug: 'caixa', palavras: ['caixa', 'caixas', 'cartonagem'] },
]

/** Último recurso por tipo de produto, quando não há forma reconhecível. */
const POR_TIPO = {
  medicamento: 'caixa',
  bebe: 'pacote',
  higiene: 'frasco',
  beleza: 'frasco',
  outros: 'caixa',
}

/**
 * Nomes para humanos, na ordem em que o ecrã `/interno/catalogo` os mostra:
 * primeiro as dez essenciais (cobrem o catálogo todo), depois os refinamentos.
 */
const CATEGORIAS = [
  { slug: 'comprimido', label: 'Comprimidos e cápsulas', essencial: true },
  { slug: 'frasco', label: 'Frasco de líquido', essencial: true },
  { slug: 'bisnaga', label: 'Bisnaga / pomada', essencial: true },
  { slug: 'boiao', label: 'Boião / creme', essencial: true },
  { slug: 'injetavel', label: 'Injetável (ampola/vial)', essencial: true },
  { slug: 'inalador', label: 'Inalador', essencial: true },
  { slug: 'pacote', label: 'Pacote flexível', essencial: true },
  { slug: 'lata', label: 'Lata (leite em pó)', essencial: true },
  { slug: 'biberao', label: 'Biberão', essencial: true },
  { slug: 'caixa', label: 'Caixa genérica (último recurso)', essencial: true },
  { slug: 'gotas', label: 'Gotas / colírio', essencial: false },
  { slug: 'xarope', label: 'Xarope com copo dosador', essencial: false },
  { slug: 'spray', label: 'Spray', essencial: false },
  { slug: 'alcool', label: 'Álcool / desinfetante', essencial: false },
  { slug: 'soro', label: 'Soro (balão/frasco)', essencial: false },
  { slug: 'desodorizante', label: 'Desodorizante (roll-on)', essencial: false },
  { slug: 'perfume', label: 'Perfume', essencial: false },
  { slug: 'supositorio', label: 'Supositório', essencial: false },
  { slug: 'po-sache', label: 'Pó / saqueta', essencial: false },
  { slug: 'fraldas', label: 'Fraldas', essencial: false },
  { slug: 'toalhitas', label: 'Toalhitas', essencial: false },
  { slug: 'penso', label: 'Pensos e compressas', essencial: false },
  { slug: 'higiene-oral', label: 'Higiene oral (escova/pasta)', essencial: false },
  { slug: 'sabonete', label: 'Sabonete', essencial: false },
  { slug: 'batom', label: 'Batom', essencial: false },
  { slug: 'teste', label: 'Teste (gravidez/ovulação)', essencial: false },
  { slug: 'preservativo', label: 'Preservativos', essencial: false },
  { slug: 'dispositivo', label: 'Dispositivo médico', essencial: false },
]

/** Recurso de cada categoria — a primeira que existir em disco ganha. */
const RECURSO = {
  gotas: ['frasco'],
  xarope: ['frasco'],
  spray: ['frasco'],
  alcool: ['frasco'],
  soro: ['frasco'],
  desodorizante: ['frasco'],
  perfume: ['frasco'],
  supositorio: ['caixa'],
  'po-sache': ['pacote'],
  fraldas: ['pacote'],
  toalhitas: ['pacote'],
  penso: ['pacote'],
  'higiene-oral': ['bisnaga'],
  sabonete: ['caixa'],
  batom: ['caixa'],
  teste: ['caixa'],
  preservativo: ['caixa'],
  dispositivo: ['caixa'],
  lata: ['pacote'],
  biberao: ['pacote'],
}

function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function contem(texto, palavras) {
  const alvo = ` ${normalizar(texto)} `
  return palavras.some((p) => alvo.includes(` ${p} `))
}

/**
 * Categoria de apresentação do item — o slug do ficheiro em `public/produtos/`.
 * Nunca devolve null: sem nada reconhecível, cai no tipo e, por fim, em `caixa`.
 */
export function modelSlug(item) {
  if (!item) return 'caixa'
  const nome = item.drug_name || item.name || ''
  const forma = item.drug_form || item.form || ''
  const tudo = `${nome} ${forma}`

  for (const familia of FAMILIAS) {
    if (contem(tudo, familia.palavras)) return familia.slug
  }
  for (const regra of FORMAS) {
    if (contem(forma, regra.palavras)) return regra.slug
  }
  for (const regra of FORMAS) {
    if (contem(nome, regra.palavras)) return regra.slug
  }
  return POR_TIPO[item.drug_kind || item.kind] || 'caixa'
}

/**
 * Caminhos a tentar, por ordem: a imagem carregada no Storage, o
 * `<slug>.<ext>` de `public/produtos/`, e depois as categorias de recurso
 * até `caixa`. O componente de imagem avança na lista a cada 404 — não é
 * preciso manifesto nem ajustar código quando um ficheiro novo aparece.
 */
export function modelImageCandidates(item) {
  const principal = modelSlug(item)
  const slugs = [principal, ...(RECURSO[principal] || []), 'caixa']
  const vistos = new Set()
  const caminhos = []

  for (const slug of slugs) {
    if (vistos.has(slug)) continue
    vistos.add(slug)
    // A carregada pela equipa ganha ao ficheiro que venha no código.
    const carregada = modelStorageUrl(slug)
    if (carregada) caminhos.push(carregada)
    caminhos.push(...modelFilePaths(slug))
  }
  return caminhos
}

/** Ficheiros estáticos de UMA categoria, por prioridade de formato. */
export function modelFilePaths(slug) {
  return EXTENSOES.map((ext) => `${DIR}/${slug}.${ext}`)
}

/**
 * Todas as categorias, com recurso, para o ecrã interno de cobertura.
 * A ordem é a de `CATEGORIAS`: essenciais primeiro.
 */
export function modelCategoryList() {
  return CATEGORIAS.map((c) => ({ ...c, recurso: RECURSO[c.slug] || [] }))
}
