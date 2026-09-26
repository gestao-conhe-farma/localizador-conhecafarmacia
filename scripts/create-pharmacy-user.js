#!/usr/bin/env node
/**
 * Cria (ou actualiza) um utilizador do portal da farmácia — o caminho
 * OFICIAL, numa só operação:
 *
 *   1. Cria o user de auth via Supabase Admin API
 *      (nunca INSERT directo em auth.users — deixa colunas de token a NULL
 *      e quebra o GoTrue: "Database error querying schema" em todos os
 *      logins do projecto, ver supabase/fix_auth_users_nulls.sql)
 *   2. Garante a farmácia (cria-a se o slug não existir)
 *   3. Cria/actualiza a linha em admin_users (role='farmacia' + pharmacy_id)
 *
 * Credenciais lidas do .env.local (SUPABASE_SERVICE_ROLE_KEY — server-side
 * apenas, nunca exposta ao browser).
 *
 * Uso:
 *   node --env-file=.env.local scripts/create-pharmacy-user.js \
 *     --email farmacia1@exemplo.ao \
 *     --password 'SenhaSegura1!' \
 *     --name 'Ana Silva' \
 *     --pharmacy-slug farmacia-ana \
 *     --pharmacy-name 'Farmácia Ana' \
 *     [--pharmacy-municipio Viana] \
 *     [--pharmacy-address 'Rua X, 12'] \
 *     [--pharmacy-phone '+244900000000'] \
 *     [--pharmacy-whatsapp '244900000000'] \
 *     [--pharmacy-hours 'Seg–Sáb · 08:00–18:00'] \
 *     [--reset-password]   # redefine a senha se o e-mail já existir
 *
 * Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const { createClient } = require('@supabase/supabase-js')

// ------------------------------------------------------------
// Args
// ------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      if (key === 'reset-password') {
        args[key] = true
      } else {
        args[key] = argv[++i]
      }
    }
  }
  return args
}

const args = parseArgs(process.argv)

const required = ['email', 'password', 'pharmacy-slug', 'pharmacy-name']
const missing = required.filter((k) => !args[k])
if (missing.length) {
  console.error('ERRO: faltam argumentos obrigatórios:', missing.map((m) => `--${m}`).join(', '))
  console.error('\nExemplo:')
  console.error(
    '  node --env-file=.env.local scripts/create-pharmacy-user.js \\\n' +
      "    --email farmacia1@exemplo.ao --password 'SenhaSegura1!' \\\n" +
      "    --name 'Ana Silva' --pharmacy-slug farmacia-ana --pharmacy-name 'Farmácia Ana'\n",
  )
  process.exit(1)
}

const EMAIL = args.email.trim().toLowerCase()
const PASSWORD = args.password
const DISPLAY_NAME = args.name || 'Utilizador Farmácia'
const SLUG = args['pharmacy-slug'].trim().toLowerCase()
const MUNICIPIOS_VALIDOS = [
  'Belas', 'Cacuaco', 'Cazenga', 'Ícolo e Bengo', 'Luanda',
  'Quilamba Quiaxi', 'Quissama', 'Talatona', 'Viana',
]
const MUNICIPIO = args['pharmacy-municipio'] || 'Luanda'
if (!MUNICIPIOS_VALIDOS.includes(MUNICIPIO)) {
  console.error(`ERRO: município "${MUNICIPIO}" inválido. Válidos: ${MUNICIPIOS_VALIDOS.join(', ')}`)
  process.exit(1)
}
if (PASSWORD.length < 8) {
  console.error('ERRO: a senha deve ter pelo menos 8 caracteres.')
  process.exit(1)
}

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('ERRO: define NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}
// Cliente ADMIN (service role): bypassa RLS — operação de provisionamento.
const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ------------------------------------------------------------
// 1. Farmácia (garantir que existe)
// ------------------------------------------------------------
async function ensurePharmacy() {
  const { data: existing } = await admin
    .from('pharmacies')
    .select('id, slug, name, active')
    .eq('slug', SLUG)
    .maybeSingle()

  if (existing) {
    console.log(`✔ Farmácia já existe: ${existing.name} (${existing.slug}) — id ${existing.id}`)
    if (!existing.active) {
      const { error } = await admin.from('pharmacies').update({ active: true }).eq('id', existing.id)
      if (error) throw new Error('Falhou ao reactivar farmácia: ' + error.message)
      console.log('  · reactivada (estava inactiva)')
    }
    return existing.id
  }

  const { data: created, error } = await admin
    .from('pharmacies')
    .insert({
      slug: SLUG,
      name: args['pharmacy-name'],
      municipio: MUNICIPIO,
      address: args['pharmacy-address'] || null,
      phone: args['pharmacy-phone'] || null,
      whatsapp: args['pharmacy-whatsapp'] || null,
      opening_hours: args['pharmacy-hours'] || null,
      verified: true,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw new Error('Falhou ao criar farmácia: ' + error.message)
  console.log(`✔ Farmácia criada: ${args['pharmacy-name']} (${SLUG}) — id ${created.id}`)
  return created.id
}

// ------------------------------------------------------------
// 2. User de auth (Admin API — NUNCA INSERT em auth.users)
// ------------------------------------------------------------
async function ensureAuthUser() {
  // Procurar por e-mail: a Admin API falha se a tabela tiver uma linha
  // partida; nesse caso, correr primeiro supabase/fix_auth_users_nulls.sql.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 500 })
  if (listErr) {
    throw new Error(
      `Admin API não consegue listar users (${listErr.message}). ` +
        'Há provavelmente uma linha partida em auth.users — ' +
        'correr supabase/fix_auth_users_nulls.sql e tentar de novo.',
    )
  }
  const existing = list.users.find((u) => (u.email || '').toLowerCase() === EMAIL)

  if (existing) {
    if (args['reset-password']) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
      })
      if (error) throw new Error('Falhou ao redefinir senha: ' + error.message)
      console.log(`✔ Senha redefinida para ${EMAIL} (--reset-password)`)
    } else {
      console.log(`✔ User de auth já existe: ${EMAIL} — id ${existing.id}`)
    }
    if (!existing.email_confirmed_at) {
      await admin.auth.admin.updateUserById(existing.id, { email_confirm: true })
      console.log('  · e-mail confirmado (auto-confirm)')
    }
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true, // portal não exige verificação de e-mail no piloto
    user_metadata: { display_name: DISPLAY_NAME },
  })
  if (error) throw new Error('Falhou ao criar user de auth: ' + error.message)
  console.log(`✔ User de auth criado: ${EMAIL} — id ${data.user.id}`)
  return data.user.id
}

// ------------------------------------------------------------
// 3. admin_users (role farmacia + vínculo à farmácia)
// ------------------------------------------------------------
async function ensureAdminUser(userId, pharmacyId) {
  const { error } = await admin.from('admin_users').upsert(
    { user_id: userId, role: 'farmacia', pharmacy_id: pharmacyId, display_name: DISPLAY_NAME },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error('Falhou ao criar admin_users: ' + error.message)
  console.log(`✔ admin_users garantido: role='farmacia' → farmácia ${SLUG}`)
}

// ------------------------------------------------------------
// Main + verificação final (a mesma cadeia que o portal valida)
// ------------------------------------------------------------
;(async () => {
  try {
    const pharmacyId = await ensurePharmacy()
    const userId = await ensureAuthUser()
    await ensureAdminUser(userId, pharmacyId)

    // Verificação: replicar a cadeia de getPharmacySession com um login real.
    const { data: session, error: sessErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: EMAIL,
    })
    if (!sessErr && session?.properties?.hashed_token) {
      console.log('\n✅ Pronto para o piloto:')
      console.log(`   Login em:  /portal/login`)
      console.log(`   E-mail:    ${EMAIL}`)
      console.log(`   Senha:     ${args['reset-password'] ? PASSWORD : '(a existente; usar --reset-password para repor)'}`)
      console.log(`   Farmácia:  ${SLUG}`)
      console.log(`   Página pública: /farmacia/${SLUG}`)
    }
  } catch (err) {
    console.error('\n❌ ' + err.message)
    process.exit(1)
  }
})()
