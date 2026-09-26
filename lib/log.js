/**
 * Logging estruturado — um formato único para os erros que antes eram
 * engolidos por catch vazios. Em produção (Vercel) os logs aparecem no
 * painel; no browser saem na consola. Se um dia se instalar Sentry,
 * basta envolver aqui.
 */

function emit(level, scope, message, meta) {
  const fn = level === 'error' ? console.error : console.warn
  // Imprimir o meta sempre que exista — a heurística antiga (> 2 chaves no
  // payload) escondia a mensagem real do erro na consola (mostrava só `{}`).
  if (meta && Object.keys(meta).length > 0) {
    fn(`[${scope}] ${message}`, meta)
  } else {
    fn(`[${scope}] ${message}`)
  }
}

export function logError(scope, message, meta) {
  emit('error', scope, message, meta)
}

export function logWarn(scope, message, meta) {
  emit('warn', scope, message, meta)
}
