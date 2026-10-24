export const SITE_URL = 'https://localizador.conhecafarmacia.com'
export const MAIN_SITE_URL = 'https://conhecafarmacia.com'
export const CONTACT_EMAIL = 'geral@conhecafarmacia.com'
export const CONTACT_PHONE_DISPLAY = '+244 925 696 002'
export const CONTACT_WHATSAPP = '244925696002'

/**
 * Municípios atendidos — a mesma lista do CHECK de `pharmacies` (0001).
 * Vive aqui e não no módulo de acções porque um ficheiro `'use server'` só
 * pode exportar funções async: constantes partilhadas por formulários e
 * validações têm de viver fora dele.
 */
/**
 * Categorias de produto (0038) — o catálogo `drugs` cobre medicamentos
 * e parafarmácia (bebé, higiene, beleza, outros). Os valores vivem aqui
 * (fora do 'use server') para formulários, filtros e validações usarem
 * a mesma lista que a CHECK da BD.
 */
export const KINDS = [
  { id: 'medicamento', label: 'Medicamentos' },
  { id: 'bebe', label: 'Bebé' },
  { id: 'higiene', label: 'Higiene' },
  { id: 'beleza', label: 'Beleza' },
  { id: 'outros', label: 'Outros' },
]

export const KIND_IDS = KINDS.map((k) => k.id)

/**
 * Áreas clínicas dos medicamentos (0043). O catálogo guarda o slug em
 * `drugs.category`; a homepage e os filtros mostram o label. A ordem é a
 * que a homepage apresenta.
 */
export const MEDICINE_CATEGORIES = [
  { id: 'dor-febre', label: 'Dor e febre', image: '/categorias/dor-febre.svg' },
  { id: 'gripe-tosse', label: 'Gripe e tosse', image: '/categorias/gripe-tosse.svg' },
  { id: 'digestivo', label: 'Estômago e digestivo', image: '/categorias/digestivo.svg' },
  { id: 'alergia', label: 'Alergia', image: '/categorias/alergia.svg' },
  { id: 'antibioticos', label: 'Antibióticos', image: '/categorias/antibioticos.svg' },
  { id: 'cronicos', label: 'Doenças crónicas', image: '/categorias/cronicos.svg' },
  { id: 'pele', label: 'Pele', image: '/categorias/pele.svg' },
  { id: 'outros-clinicos', label: 'Outros', image: '/categorias/outros-clinicos.svg' },
]

/** Tipos de parafarmácia — os cards da homepage e os filtros da pesquisa. */
export const PARAPHARMACY_TYPES = [
  { id: 'bebe', label: 'Bebé', image: '/categorias/bebe.svg' },
  { id: 'higiene', label: 'Higiene', image: '/categorias/higiene.svg' },
  { id: 'beleza', label: 'Beleza', image: '/categorias/beleza.svg' },
  { id: 'outros', label: 'Outros', image: '/categorias/outros.svg' },
]

/**
 * Subcategorias de parafarmácia, por tipo (`drugs.kind`). O card do tipo
 * abre esta lista na pesquisa.
 */
export const PARAPHARMACY_CATEGORIES = {
  bebe: [
    { id: 'fraldas', label: 'Fraldas' },
    { id: 'biberoes', label: 'Biberões' },
    { id: 'alimentacao-bebe', label: 'Alimentação' },
    { id: 'cuidados-bebe', label: 'Cuidados de bebé' },
  ],
  higiene: [
    { id: 'higiene-oral', label: 'Higiene oral' },
    { id: 'banho-corpo', label: 'Banho e corpo' },
    { id: 'cuidados-intimos', label: 'Cuidados íntimos' },
    { id: 'desinfeccao', label: 'Desinfecção' },
  ],
  beleza: [
    { id: 'cuidados-pele', label: 'Cuidados de pele' },
    { id: 'protecao-solar', label: 'Protecção solar' },
    { id: 'maquilhagem', label: 'Maquilhagem' },
    { id: 'perfumaria', label: 'Perfumaria' },
  ],
  outros: [
    { id: 'primeiros-socorros', label: 'Primeiros socorros' },
    { id: 'testes', label: 'Testes' },
    { id: 'ortopedia', label: 'Ortopedia' },
    { id: 'sexualidade', label: 'Sexualidade' },
  ],
}

/** Subcategorias de um tipo de parafarmácia (vazio para medicamentos). */
export function subcategoriasDe(kind) {
  return PARAPHARMACY_CATEGORIES[kind] || []
}

/** Compara texto sem acentos nem maiúsculas ("Bebé" = "bebe"). */
export function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Todas as categorias pesquisáveis: áreas clínicas, tipos de parafarmácia
 * e subcategorias. `tipo` diz que filtro aplicar (`?categoria=`, `?tipo=`
 * ou `?tipo=…&sub=…`).
 */
export function categoriasParaPesquisa() {
  return [
    ...MEDICINE_CATEGORIES.map((c) => ({ ...c, tipo: 'categoria' })),
    ...PARAPHARMACY_TYPES.map((t) => ({ ...t, tipo: 'tipo' })),
    ...Object.entries(PARAPHARMACY_CATEGORIES).flatMap(([kind, subs]) =>
      subs.map((s) => ({ ...s, tipo: 'sub', kind, image: categoriaImagem(kind) })),
    ),
  ]
}

/** Categoria que corresponde ao texto escrito (ex.: «febre» → Dor e febre). */
export function melhorCategoria(termo) {
  const q = normalizarTexto(termo)
  if (q.length < 2) return null
  const todas = categoriasParaPesquisa()
  const exacta = todas.find((c) => normalizarTexto(c.label) === q)
  if (exacta) return exacta
  const comeca = todas.find((c) => normalizarTexto(c.label).startsWith(q))
  if (comeca) return comeca
  return todas.find((c) => normalizarTexto(c.label).includes(q)) || null
}

/** Imagem do card de uma categoria ou tipo de parafarmácia. */
export function categoriaImagem(id) {
  return (
    MEDICINE_CATEGORIES.find((c) => c.id === id)?.image ||
    PARAPHARMACY_TYPES.find((c) => c.id === id)?.image ||
    '/categorias/outros.svg'
  )
}

/** Label de uma categoria — de medicamento ou de parafarmácia. */
export function categoriaLabel(id) {
  return (
    MEDICINE_CATEGORIES.find((c) => c.id === id)?.label ||
    Object.values(PARAPHARMACY_CATEGORIES)
      .flat()
      .find((c) => c.id === id)?.label ||
    null
  )
}

export function kindLabel(id) {
  return (KINDS.find((k) => k.id === id) || {}).label || 'Outros'
}

/**
 * Províncias cobertas e os seus municípios, pela divisão
 * político-administrativa em vigor desde 1 de Janeiro de 2025:
 *   • Luanda — 16 municípios (a capital passou a ser Ingombota);
 *   • Ícolo e Bengo — província criada na reforma, com 7 municípios
 *     (capital Catete).
 *
 * A ordem é a que os filtros mostram. Os valores são os que vivem na
 * coluna `pharmacies.municipio` (CHECK da 0042), por isso não mudam sem
 * uma migração.
 */
export const PROVINCIAS = [
  {
    nome: 'Luanda',
    municipios: [
      'Belas',
      'Cacuaco',
      'Camama',
      'Cazenga',
      'Hoji ya Henda',
      'Ingombota',
      'Kilamba',
      'Kilamba Kiaxi',
      'Maianga',
      'Mulenvos',
      'Mussulo',
      'Rangel',
      'Samba',
      'Sambizanga',
      'Talatona',
      'Viana',
    ],
  },
  {
    nome: 'Ícolo e Bengo',
    municipios: ['Bom Jesus', 'Cabiri', 'Cabo Ledo', 'Calumbo', 'Catete', 'Quiçama', 'Sequele'],
  },
]

/** Lista plana — validações, formulários e o CHECK da base de dados. */
export const MUNICIPIOS = PROVINCIAS.flatMap((p) => p.municipios)

/** Municípios de uma província (vazio quando o nome não é conhecido). */
export function municipiosDaProvincia(provincia) {
  return (PROVINCIAS.find((p) => p.nome === provincia) || {}).municipios || []
}

