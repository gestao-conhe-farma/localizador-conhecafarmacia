/**
 * Smoke test — Opções de venda (migração 0012)
 *
 * Valida, de ponta a ponta, o circuito do preço:
 *   A. Helpers puros (preço por unidade-base, total estimado, formatação)
 *   B. Template de WhatsApp com montante (confirmada, parcial, legado)
 *   C. Dedução de stock na BD com pack_size (rollback — zero efeitos):
 *        1 caixa (pack 3) → baixa 3
 *        reserva legada   → baixa quantidade simples
 *        ajuste da farmácia → baixa confirmed_quantity × pack
 *        recusa           → não baixa
 *        dupla conclusão  → não baixa duas vezes
 *
 * Uso:
 *   node --env-file=.env.local scripts/smoke-sale-options.js
 *
 * Sem .env.local: secção C é omitida (helpers e templates correm sempre).
 * Exit code 0 = tudo verde; 1 = algum falhou (lista no fim).
 */
const { createClient } = require('@supabase/supabase-js')
const {
  perBasePrice,
  formatPerBase,
  comparableOption,
} = require('../lib/sale-options.js')
const { buildReservationMessage } = require('../lib/reservation-messages.js')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

// ------------------------------------------------------------
// A. Helpers puros — o normalizador justo entre unidades
// ------------------------------------------------------------
console.log('\nA. Helpers de preço (lib/sale-options.js)')

check('perBasePrice: caixa pack 3 @ 300 = 100', perBasePrice({ pack_size: 3, price: 300 }) === 100)
check('perBasePrice: lâmina pack 1 @ 100 = 100', perBasePrice({ pack_size: 1, price: 100 }) === 100)
check(
  'perBasePrice: arredonda a cêntimos (330/3 = 110)',
  perBasePrice({ pack_size: 3, price: 330 }) === 110,
)
check(
  'perBasePrice: fracionado (250/3 = 83.33)',
  perBasePrice({ pack_size: 3, price: 250 }) === 83.33,
)
check('perBasePrice: pack 0 → null', perBasePrice({ pack_size: 0, price: 100 }) === null)
check('perBasePrice: sem preço → null', perBasePrice({ pack_size: 3 }) === null)
check('perBasePrice: null/undefined → null', perBasePrice(null) === null)
check(
  'formatPerBase: pack 1 não repete o unitário',
  formatPerBase({ pack_size: 1, price: 100 }, 'Lâmina') === null,
)
check(
  'formatPerBase: caixa mostra ≈ Kz/lâmina',
  formatPerBase({ pack_size: 3, price: 300 }, 'Lâmina') === '≈ 100 Kz/lâmina',
)
check(
  'comparableOption: escolhe a default',
  comparableOption([
    { unit: 'caixa', pack_size: 3, is_default: false },
    { unit: 'lamina', pack_size: 1, is_default: true },
  ]).unit === 'lamina',
)

// ------------------------------------------------------------
// B. Templates de WhatsApp com montante
// ------------------------------------------------------------
console.log('\nB. Templates de WhatsApp (lib/reservation-messages.js)')

const base = {
  id: '6719ce17-8b4e-4ba2-88a1-d92fc4acd60e',
  requester_name: 'Maria Ildefonso',
  drugName: 'Paracetamol',
  pharmacyName: 'Farmácia CF Central',
  quantity: 1,
  saleUnit: 'caixa',
  salePack: 3,
  saleBaseUnit: 'lamina',
  saleUnitPrice: 300,
}

const confirmada = buildReservationMessage({ ...base, status: 'confirmada' })
check(
  'confirmada inclui ≈ 300 Kz (a confirmar no balcão)',
  confirmada?.text.includes('≈ 300 Kz (a confirmar no balcão)') === true,
)

const parcial = buildReservationMessage({
  ...base,
  status: 'confirmada',
  quantity: 3,
  confirmed_quantity: 2,
})
check(
  'parcial usa a quantidade CONFIRMADA (2 × 300 = 600)',
  parcial?.text.includes('≈ 600 Kz') === true,
)

const pronta = buildReservationMessage({ ...base, status: 'pronta' })
check('pronta também leva o montante', pronta?.text.includes('≈ 300 Kz') === true)

const recusada = buildReservationMessage({
  ...base,
  status: 'recusada',
  reason: 'sem_stock',
})
check('recusada NÃO leva montante', recusada?.text.includes('Kz (a confirmar') === false)

const legado = buildReservationMessage({
  id: base.id,
  requester_name: 'Maria',
  drugName: 'Paracetamol',
  pharmacyName: 'CF Central',
  quantity: 2,
  status: 'confirmada',
})
check('legado sem opção NÃO inventa montante', legado?.text.includes('≈') === false)

// ------------------------------------------------------------
// C. Dedução de stock com pack_size (BD, transação com rollback)
// ------------------------------------------------------------
async function dbScenarios() {
  // SQL arbitrário via Management API (o mesmo mecanismo de
  // scripts/query.py) — token no credenciais.txt (gitignored).
  const fs = require('fs')
  let token = null
  let projectRef = null
  try {
    const txt = fs.readFileSync('credenciais.txt', 'utf-8')
    token = (txt.match(/(sbp_\w+)/) || [])[1]
    projectRef = (txt.match(/https:\/\/(\w+)\.supabase\.co/) || [])[1]
  } catch (_) {
    /* ficheiro ausente */
  }
  if (!token || !projectRef) {
    console.log('\nC. Dedução de stock (BD) — SKIPPED (credenciais.txt sem token/ref)')
    return
  }

  const runSql = async (query) => {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      },
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SQL ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }

  console.log('\nC. Dedução de stock com pack_size (BD, rollback)')
  await runDbScenarios(runSql)
}

async function runDbScenarios(runSql) {
  const withOpts = `
    begin;
    -- cenário: farmácia com stock 30 lâminas, lâmina (default) + caixa (pack 3)
    insert into public.pharmacies (slug, name, municipio, address, phone, opening_hours, verified, active)
    values ('smoke-0012', 'Smoke 0012', 'Luanda', 'x', '923000000', '8-18', false, true);
    insert into public.drugs (name, molecule, form, dosage, requires_rx, priority, active)
    values ('SmokeDrug12', 'x', 'comprimido', '1 mg', false, 'normal', true);
    insert into public.stock_items (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at)
    select p.id, d.id, true, 30, 100, now() from public.pharmacies p, public.drugs d
     where p.slug='smoke-0012' and d.name='SmokeDrug12';
    insert into public.stock_sale_options (stock_item_id, unit, pack_size, price, is_default, active)
    select s.id, 'lamina', 1, 100, true, true from public.stock_items s
      join public.pharmacies p on p.id=s.pharmacy_id where p.slug='smoke-0012';
    insert into public.stock_sale_options (stock_item_id, unit, pack_size, price, is_default, active)
    select s.id, 'caixa', 3, 300, false, true from public.stock_items s
      join public.pharmacies p on p.id=s.pharmacy_id where p.slug='smoke-0012';
  `
  const close = `rollback;`
  const stockOf = `
    select s.quantity as estoque from public.stock_items s
      join public.pharmacies p on p.id=s.pharmacy_id where p.slug='smoke-0012';
  `

  // 1. Reserva de 1 caixa (pack 3) → baixa 3
  const cases = [
    {
      name: '1 caixa (pack 3) baixa 3 → estoque 27',
      expect: 27,
      sql: `insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, sale_option_id)
       select s.id, s.pharmacy_id, s.drug_id, 'T1', '923000001', 1, 'pronta', o.id
         from public.stock_items s join public.pharmacies p on p.id=s.pharmacy_id
         join public.stock_sale_options o on o.stock_item_id=s.id and o.unit='caixa'
        where p.slug='smoke-0012';
      update public.reservations set status='concluida' where requester_name='T1';`,
    },
    {
      name: 'reserva legada baixa quantidade simples → 28',
      expect: 28,
      sql: `insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status)
       select s.id, s.pharmacy_id, s.drug_id, 'T2', '923000002', 2, 'pronta'
         from public.stock_items s join public.pharmacies p on p.id=s.pharmacy_id
        where p.slug='smoke-0012';
      update public.reservations set status='concluida' where requester_name='T2';`,
    },
    {
      name: 'ajuste para 2 caixas baixa 2×3=6 → 24',
      expect: 24,
      sql: `insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, sale_option_id)
       select s.id, s.pharmacy_id, s.drug_id, 'T3', '923000003', 3, 'pronta', o.id
         from public.stock_items s join public.pharmacies p on p.id=s.pharmacy_id
         join public.stock_sale_options o on o.stock_item_id=s.id and o.unit='caixa'
        where p.slug='smoke-0012';
      update public.reservations set status='concluida', confirmed_quantity=2 where requester_name='T3';`,
    },
    {
      name: 'recusa não mexe no stock → 30',
      expect: 30,
      sql: `insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, sale_option_id)
       select s.id, s.pharmacy_id, s.drug_id, 'T4', '923000004', 2, 'confirmada', o.id
         from public.stock_items s join public.pharmacies p on p.id=s.pharmacy_id
         join public.stock_sale_options o on o.stock_item_id=s.id and o.unit='caixa'
        where p.slug='smoke-0012';
      update public.reservations set status='recusada', reason='sem_stock' where requester_name='T4';`,
    },
    {
      name: 're-concluir não baixa de novo → 27',
      expect: 27,
      sql: `insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, sale_option_id)
       select s.id, s.pharmacy_id, s.drug_id, 'T5', '923000005', 1, 'pronta', o.id
         from public.stock_items s join public.pharmacies p on p.id=s.pharmacy_id
         join public.stock_sale_options o on o.stock_item_id=s.id and o.unit='caixa'
        where p.slug='smoke-0012';
      update public.reservations set status='concluida' where requester_name='T5';
      update public.reservations set status='concluida' where requester_name='T5';`,
    },
  ]

  for (const c of cases) {
    try {
      // Migração 0012 precisa de estar aplicada (tabela + trigger v3).
      // NOTA: a API devolve só o ÚLTIMO result set ([{estoque: N}]).
      const out = await runSql(withOpts + c.sql + stockOf + close)
      const estoque = Array.isArray(out) ? out[0]?.estoque : null
      check(c.name, estoque === c.expect, `obteve ${JSON.stringify(out)}`)
    } catch (e) {
      check(c.name, false, e.message)
    }
  }
}

// ------------------------------------------------------------
;(async () => {
  await dbScenarios()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n═══ RESULTADO: ${results.length - failed.length}/${results.length} passaram ═══`)
  if (failed.length > 0) {
    console.log('\nFalhas:')
    for (const f of failed) console.log(`  ❌ ${f.name}`)
    process.exit(1)
  }
})().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
