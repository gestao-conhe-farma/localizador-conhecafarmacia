/**
 * Leitura de CSV para a importação de stock (plano 2026-10-12, ideia 1).
 *
 * Regras que nascem de olhar para o que as farmácias exportam de verdade:
 *   • separador: `;` (Excel PT) ou `,` (exportações web) ou TAB — detectado
 *     na primeira linha, com aspas respeitadas;
 *   • números: `1.234,56` e `1,234.56` são os dois formatos possíveis —
 *     o último separador manda na parte decimal;
 *   • datas: `31/03/2027`, `31-03-2027`, `2027-03-31` e `03/2027` (mês/ano,
 *     que vira o ÚLTIMO dia do mês — a validade de um medicamento vale até
 *     ao fim do mês indicado);
 *   • cabeçalhos: nomes conhecidos em PT/EN são adivinhados, mas o
 *     utilizador confirma sempre o mapeamento no portal.
 *
 * Sem dependências: um parser de ~60 linhas evita puxar um pacote que
 * depois ninguém quer manter, e o que é nosso fica testável.
 */

const DELIMS = [';', ',', '\t', '|']

/**
 * Linhas aplicadas por pedido na importação: mantém cada chamada ao
 * servidor curta (uma chamada gigante expira antes de acabar) e dá
 * progresso visível a quem está a importar.
 */
export const IMPORT_CHUNK = 100

/** Delimitador mais provável: conta fora de aspas na primeira linha útil. */
export function detectDelimiter(text) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r?\n/).find((l) => l.trim() !== '') || ''
  let best = ';'
  let bestCount = -1
  for (const d of DELIMS) {
    let count = 0
    let inQuotes = false
    for (const c of firstLine) {
      if (c === '"') inQuotes = !inQuotes
      else if (!inQuotes && c === d) count += 1
    }
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

/** Parser RFC4180 (aspas, aspas duplas escapadas, CRLF). */
export function parseCsv(text, delimiter) {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const delim = delimiter || detectDelimiter(src)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c).trim() !== ''))
  if (headerIdx === -1) return { delimiter: delim, headers: [], rows: [] }

  const headers = rows[headerIdx].map((h) => String(h).trim())
  // Linhas totalmente vazias não são erro (nem contam para o relatório):
  // `line` é o número da linha NO FICHEIRO, para a farmácia a encontrar.
  const data = []
  for (let idx = headerIdx + 1; idx < rows.length; idx++) {
    const r = rows[idx]
    if (!r.some((c) => String(c).trim() !== '')) continue
    data.push({ line: idx + 1, cells: headers.map((_, c) => String(r[c] ?? '').trim()) })
  }

  return { delimiter: delim, headers, rows: data }
}

/** Normaliza cabeçalho: sem acentos, sem pontuação, minúsculas. */
function normHeader(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const FIELDS = {
  drug: [
    'medicamento',
    'produto',
    'nome',
    'name',
    'descricao',
    'artigo',
    'drug',
    'designacao',
    'apresentacao',
    'nome produto',
    'product',
  ],
  quantity: [
    'quantidade',
    'qtd',
    'qty',
    'quantity',
    'stock',
    'saldo',
    'existencia',
    'unidades',
    'quantidade stock',
    'qtd stock',
    'quant',
  ],
  in_stock: ['disponivel', 'disponibilidade', 'temos', 'estado', 'in stock', 'situacao', 'tem'],
  lot: ['lote', 'lot', 'batch', 'numero lote', 'n lote', 'lote n', 'batch number'],
  expires: [
    'validade',
    'expira',
    'expiry',
    'expires',
    'data validade',
    'validade lote',
    'exp',
    'expiration',
  ],
  price: ['preco', 'price', 'pvp', 'valor', 'preco venda', 'preco unitario'],
  unit: ['unidade', 'un', 'unit', 'medida', 'unidade medida'],
}

/**
 * Adivinha o mapeamento coluna→campo. Devolve índices (-1 = não mapeado).
 * Igualdade normalizada ganha a "contém" — cabeçalhos compostos ainda
 * casam, mas um campo explícito nunca é roubado por outro.
 */
export function guessMapping(headers) {
  const norm = headers.map(normHeader)
  const used = new Set()
  const mapping = {}

  for (const [field, synonyms] of Object.entries(FIELDS)) {
    let idx = -1
    for (const syn of synonyms) {
      const s = normHeader(syn)
      const exact = norm.findIndex((h, i) => !used.has(i) && h === s)
      if (exact !== -1) {
        idx = exact
        break
      }
    }
    if (idx === -1) {
      for (const syn of synonyms) {
        const s = normHeader(syn)
        const partial = norm.findIndex(
          (h, i) => !used.has(i) && (h.includes(s) || s.includes(h)) && h !== '',
        )
        if (partial !== -1) {
          idx = partial
          break
        }
      }
    }
    mapping[field] = idx
    if (idx !== -1) used.add(idx)
  }
  return mapping
}

/** Número em formato PT/EN. Devolve null quando não há número. */
export function parseNumber(raw) {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  s = s.replace(/\s|\u00a0/g, '').replace(/[^\d.,-]/g, '')
  if (!s || s === '-' || s === '.' || s === ',') return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Inteiro (quantidades): 12,5 → 12; sem número → null. */
export function parseQuantity(raw) {
  const n = parseNumber(raw)
  return n == null ? null : Math.trunc(n)
}

const pad = (v) => String(v).padStart(2, '0')

function isoOf(y, m, d) {
  const yy = Number(y)
  const mm = Number(m)
  const dd = Number(d)
  if (!yy || !mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `${String(yy).padStart(4, '0')}-${pad(mm)}-${pad(dd)}`
}

/**
 * Data de validade em qualquer dos formatos que aparecem nos exports.
 * `MM/AAAA` (mês/ano) vira o último dia do mês: é o que significa em
 * medicamentos — «vale até ao fim de Março».
 */
export function parseDateValue(raw) {
  const s = String(raw || '').trim()
  if (!s) return null

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return isoOf(m[1], m[2], m[3])

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return isoOf(y, m[2], m[1])
  }

  m = /^(\d{1,2})[/\-.](\d{4})$/.exec(s)
  if (m) {
    const y = Number(m[2])
    const mo = Number(m[1])
    if (!y || mo < 1 || mo > 12) return null
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    return isoOf(y, mo, lastDay)
  }

  return null
}

/** «sim/não», «1/0», «temos/esgotado», «disponível». */
export function parseBoolean(raw) {
  const s = normHeader(raw)
  if (!s) return null
  if (['1', 'sim', 's', 'true', 'verdadeiro', 'temos', 'disponivel', 'yes', 'y', 'ok'].includes(s))
    return true
  if (['0', 'nao', 'n', 'false', 'falso', 'esgotado', 'indisponivel', 'no', 'x'].includes(s))
    return false
  return null
}

/** Nome normalizado para casar com o catálogo (sem acentos, sem ruído). */
export function normalizeName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
