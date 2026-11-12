/**
 * Smoke test — marcador assinado da reposição de senha (M7).
 *
 * A página e as acções exigem `userId.expiraMs.hmac`; um `'1'` forjado,
 * um marcador de outra conta, um expirado ou um valor adulterado têm de
 * ser recusados. Usa a mesma chave de serviço do ambiente, como em
 * runtime.
 *
 * Uso: node scripts/smoke-recovery-marker.mjs
 */
import {
  RECOVERY_MARKER_TTL_MS,
  assinaturaMarcador,
  verifyRecoveryMarker,
} from '../lib/recovery-marker.js'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const now = Date.now()
const valido = (userId, exp = now + RECOVERY_MARKER_TTL_MS) => {
  const payload = `${userId}.${exp}`
  return `${payload}.${assinaturaMarcador(payload)}`
}

console.log('\nMarcador da reposição (lib/recovery-marker.js)')

check('marcador válido é aceite', verifyRecoveryMarker(valido(userA), userA) === true)
check('marcador de outra conta é recusado', verifyRecoveryMarker(valido(userA), userB) === false)
check('marcador expirado é recusado', verifyRecoveryMarker(valido(userA, now - 1), userA) === false)
check(
  "o antigo '1' é recusado",
  verifyRecoveryMarker('1', userA) === false,
)
check(
  'assinatura adulterada é recusada',
  verifyRecoveryMarker(`${userA}.${now + 60000}.${'0'.repeat(64)}`, userA) === false,
)
check(
  'valor com partes a mais é recusado',
  verifyRecoveryMarker(`${valido(userA)}.extra`, userA) === false,
)
check('cookie ausente é recusado', verifyRecoveryMarker(undefined, userA) === false)
check('sem utilizador é recusado', verifyRecoveryMarker(valido(userA), null) === false)

const failed = results.filter((r) => !r.ok)
console.log(`\n═══ RESULTADO: ${results.length - failed.length}/${results.length} passaram ═══`)
if (failed.length > 0) {
  for (const f of failed) console.log(`  ❌ ${f.name}`)
  process.exit(1)
}
