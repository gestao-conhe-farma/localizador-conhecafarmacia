/**
 * Smoke test — guard do segundo factor nas escritas do portal (A1).
 *
 * O layout exige `aal2` ao gerente, mas as Server Actions não passam por
 * layouts. `lib/portal-mfa.js` é a regra que os actions chamam; aqui
 * exercita-se a matriz de decisão sem precisar de browser:
 *
 *   balcão (sem TOTP próprio)  → escreve mesmo em aal1
 *   gerente em aal1            → MFA_NECESSARIO
 *   gerente em aal2            → escreve
 *   sem perfil (cookie cortado) → falha fechado em aal1
 *   sem sessão                 → SESSAO_EXPIRADA
 *
 * Uso: node scripts/smoke-portal-mfa.mjs
 * Exit code 0 = tudo verde; 1 = algum falhou.
 */
import { managerMfaGate, portalWriteGate } from '../lib/portal-mfa.js'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

const aal1 = { mfa: { currentLevel: 'aal1' } }
const aal2 = { mfa: { currentLevel: 'aal2' } }
const semNivel = { mfa: { currentLevel: null } }
const balcao = { role: 'balcao' }
const gerente = { role: 'gerente' }

console.log('\nGuard managerMfaGate (lib/portal-mfa.js)')

check('sem sessão → SESSAO_EXPIRADA', managerMfaGate(null, null).error === 'SESSAO_EXPIRADA')
check('balcão em aal1 escreve', managerMfaGate(aal1, balcao).ok === true)
check(
  'gerente em aal1 é recusado',
  managerMfaGate(aal1, gerente).ok === false && managerMfaGate(aal1, gerente).error === 'MFA_NECESSARIO',
)
check('gerente em aal2 escreve', managerMfaGate(aal2, gerente).ok === true)
check('nível ilegível não abre a escrita', managerMfaGate(semNivel, gerente).ok === false)
check('sem perfil não escreve mesmo em aal2 (M1)', portalWriteGate(aal2, null).error === 'SEM_PERFIL')
check(
  'escrita sem sessão é recusada',
  portalWriteGate(null, balcao).error === 'SESSAO_EXPIRADA',
)
check('escrita de balcão em aal1 passa (M1 + A1)', portalWriteGate(aal1, balcao).ok === true)
check(
  'escrita de gerente em aal1 é recusada',
  portalWriteGate(aal1, gerente).error === 'MFA_NECESSARIO',
)

const failed = results.filter((r) => !r.ok)
console.log(`\n═══ RESULTADO: ${results.length - failed.length}/${results.length} passaram ═══`)
if (failed.length > 0) {
  for (const f of failed) console.log(`  ❌ ${f.name}`)
  process.exit(1)
}
