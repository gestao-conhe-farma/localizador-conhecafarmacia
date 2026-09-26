/**
 * Acks de reposição (localStorage).
 *
 * "Este produto ficou sem stock por causa de uma reserva concluída —
 * quero ser lembrado de repor?" A farmácia pode responder "não repor"
 * a um item; o ack (por farmácia + fármaco) guarda essa decisão para o
 * aviso não reaparecer a cada carregamento. Guarda-se a DATA da
 * decisão: se depois houver outra venda, o aviso volta — uma decisão
 * "não repor" vale até à próxima venda daquele produto.
 *
 * localStorage e não DB: é um estado de UI pessoal (a decisão "não
 * repor" não deve ser imposto aos colegas de balcão), sem migração, e
 * expira sozinho com a próxima venda. Se o browser mudar, o aviso
 * volta — inconveniente pequeno, migração evitada.
 */

const KEY = 'cf-restock-acks'

function readAll() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(all) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage cheio/bloqueado: o aviso apenas volta a aparecer — inofensivo
  }
}

/** Timestamp (ms) do ack de um item, ou null se não houver. */
export function getRestockAck(pharmacyId, drugId) {
  const all = readAll()
  const v = all[pharmacyId]?.[drugId]
  return typeof v === 'number' ? v : null
}

/** Regista/actualiza o ack "não repor" de um item. */
export function setRestockAck(pharmacyId, drugId) {
  const all = readAll()
  const row = all[pharmacyId] || {}
  row[drugId] = Date.now()
  all[pharmacyId] = row
  writeAll(all)
}

/** Remove o ack (ex.: a farmácia repôs e quer voltar a ser avisada). */
export function clearRestockAck(pharmacyId, drugId) {
  const all = readAll()
  if (all[pharmacyId]) {
    delete all[pharmacyId][drugId]
    if (Object.keys(all[pharmacyId]).length === 0) delete all[pharmacyId]
    writeAll(all)
  }
}
