/**
 * CSV da trilha de auditoria (Task 8.2).
 *
 * Módulo PURO, ao lado de `lib/csv.js`: não lê ambiente, não toca na base e
 * não importa nada do Next — é por isso que o formato se pode provar à parte
 * (as aspas, o `;`, o BOM) sem levantar um servidor. A acção
 * `exportAuditCsv` só decide QUE linhas levar; COMO as escrever é aqui.
 *
 * Formato, e porquê:
 *   • `;` — é o separador que o Excel em português espera e o primeiro que o
 *     leitor deste projecto detecta;
 *   • tudo entre aspas, com as internas duplicadas — um motivo com «;» ou uma
 *     mudança de linha deixa de partir a coluna;
 *   • CRLF no fim de cada linha (RFC 4180);
 *   • BOM UTF-8 — mas acrescentado no DOWNLOAD (`AuditExport`), não aqui:
 *     o texto atravessa a serialização da Server Action e um U+FEFF inicial
 *     não sobrevive à viagem (medido: o blob saía 3 bytes mais curto). No
 *     ficheiro o BOM está lá, que é o que o Excel lê.
 *
 * As linhas chegam já mapeadas (`lib/actions/platform-audit.js`), com nomes de
 * campo do ecrã: este módulo não sabe — nem tem de saber — o que é `before`
 * em jsonb.
 */

export const CABECALHO = [
  'id',
  'quando',
  'actor_email',
  'actor_nivel',
  'acao',
  'acao_rotulo',
  'tabela',
  'registo',
  'farmacia',
  'farmacia_id',
  'motivo',
  'pedido',
  'ip',
  'navegador',
  'antes',
  'depois',
]

/**
 * Célula de texto: vazia fica vazia; o resto vai sempre entre aspas.
 * Guarda anti-fórmula (injeção de CSV): valores a começar por `=`, `+`,
 * `-`, `@`, tab ou CR levam um apóstrofo inicial — o Excel/LibreOffice
 * mostra o texto tal qual em vez de o executar como fórmula. O apóstrofo
 * é marcador de «texto literal» na folha, não aparece no valor visível.
 */
export function celula(valor) {
  if (valor == null || valor === '') return ''
  let s = String(valor)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/** Célula de JSON (`before`/`after`): `null` é vazio, não a palavra «null». */
export function jsonCelula(valor) {
  if (valor == null) return ''
  return celula(JSON.stringify(valor))
}

/** Linhas mapeadas → texto CSV completo, com BOM e CRLF. */
export function paraCsv(rows) {
  const linhas = [CABECALHO.map(celula).join(';')]
  for (const r of rows) {
    linhas.push(
      [
        r.id,
        celula(r.quando),
        celula(r.actorEmail),
        celula(r.actorRole),
        celula(r.action),
        celula(r.acaoRotulo),
        celula(r.table),
        celula(r.recordId),
        celula(r.farmacia),
        celula(r.pharmacyId),
        celula(r.reason),
        celula(r.requestId),
        celula(r.ip),
        celula(r.userAgent),
        jsonCelula(r.before),
        jsonCelula(r.after),
      ].join(';'),
    )
  }
  return `${linhas.join('\r\n')}\r\n`
}
