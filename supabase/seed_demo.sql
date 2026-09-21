-- ============================================================
-- Localizador de Medicamentos — SEED DE DEMONSTRAÇÃO
-- Dados inventados para visualizar o produto real (/pesquisa,
-- /farmacia/[slug]) enquanto as farmácias não são onboarded.
--
-- IDEMPOTENTE: pode ser corrido quantas vezes se quiser
-- (on conflict do update). As datas de confirmed_at são
-- recalculadas em cada execução.
--
-- IMPORTANTE: apagar quando as farmácias reais entrarem
-- (drop seed: delete from pharmacies where slug like 'farmacia-%demo%').
-- Aplicar via SQL Editor ou Management API.
-- ============================================================

-- 0. Remover a farmácia de teste antiga (do primeiro smoke test)
delete from public.pharmacies where slug = 'farmacia-demostracao';

-- ------------------------------------------------------------
-- 1. Farmácias fictícias (on conflict → actualiza dados)
-- ------------------------------------------------------------
insert into public.pharmacies (slug, name, municipio, address, phone, whatsapp, opening_hours, verified, active) values
  ('farmacia-nossa-senhora-da-muxima',
   'Farmácia Nossa Senhora da Muxima', 'Luanda',
   'Rua Amílcar Cabral, nº 45, Ingombota',
   '+244 923 111 405', '+244 923 111 405', 'Seg–Sáb · 07:30–19:00', true, true),
  ('farmacia-hospital-central',
   'Farmácia do Hospital Central', 'Luanda',
   'Av. 4 de Fevereiro, Ingombota',
   '+244 926 205 318', '+244 926 205 318', 'Todos os dias · 24 horas', true, true),
  ('farmacia-vida-nova-viana',
   'Farmácia Vida Nova', 'Viana',
   'Rua da Missão, nº 210, Viana',
   '+244 924 770 132', '+244 924 770 132', 'Seg–Sáb · 08:00–18:30', true, true),
  ('farmacia-quirimbambas-talatona',
   'Farmácia Quirimbambas', 'Talatona',
   'Via S8, Talatona Sul',
   '+244 934 118 926', '+244 934 118 926', 'Seg–Sáb · 08:00–20:00', false, true),
  ('farmacia-sao-paulo-cazenga',
   'Farmácia São Paulo', 'Cazenga',
   'Rua São Paulo, nº 12, Cazenga',
   '+244 921 664 508', '+244 921 664 508', 'Seg–Sáb · 07:30–18:00', false, true),
  ('farmacia-mirim-belas',
   'Farmácia Mirim', 'Belas',
   'Rua da Samba, Luanda Sul, Belas',
   '+244 925 340 779', '+244 925 340 779', 'Todos os dias · 08:00–21:00', true, true)
on conflict (slug) do update set
  name          = excluded.name,
  municipio     = excluded.municipio,
  address       = excluded.address,
  phone         = excluded.phone,
  whatsapp      = excluded.whatsapp,
  opening_hours = excluded.opening_hours,
  verified      = excluded.verified,
  active        = excluded.active,
  updated_at    = now();

-- ------------------------------------------------------------
-- 2. Catálogo de medicamentos (18 moléculas alvo)
-- ------------------------------------------------------------
insert into public.drugs (name, molecule, form, dosage, requires_rx, priority) values
  ('Insulina NPH',      'insulina isofânica',    'injetável',  '100 UI/ml',    true,  'critico'),
  ('Salbutamol',        'salbutamol',            'inalador',   '100 mcg/dose', true,  'critico'),
  ('Ceftriaxona',       'ceftriaxona',           'injetável',  '1 g',          true,  'critico'),
  ('Carbamazepina',     'carbamazepina',         'comprimido', '200 mg',       true,  'alto'),
  ('Amoxicilina',       'amoxicilina',           'cápsula',    '500 mg',       true,  'alto'),
  ('Metformina',        'metformina',            'comprimido', '850 mg',       true,  'alto'),
  ('Sintrom',           'acenocumarol',          'comprimido', '4 mg',         true,  'alto'),
  ('Azitromicina',      'azitromicina',          'comprimido', '500 mg',       true,  'alto'),
  ('Paracetamol',       'paracetamol',           'comprimido', '500 mg',       false, 'normal'),
  ('Ibuprofeno',        'ibuprofeno',            'comprimido', '400 mg',       false, 'normal'),
  ('Ácido Fólico',      'ácido fólico',          'comprimido', '5 mg',         false, 'normal'),
  ('Losartana',         'losartana',             'comprimido', '50 mg',        true,  'normal'),
  ('Omeprazol',         'omeprazol',             'cápsula',    '20 mg',        false, 'normal'),
  ('Atenolol',          'atenolol',              'comprimido', '50 mg',        true,  'normal'),
  ('Metronidazol',      'metronidazol',          'comprimido', '250 mg',       true,  'normal'),
  ('Hidroclorotiazida', 'hidroclorotiazida',     'comprimido', '25 mg',        true,  'normal'),
  ('Glibenclamida',     'glibenclamida',         'comprimido', '5 mg',         true,  'normal'),
  ('Loratadina',        'loratadina',            'comprimido', '10 mg',        false, 'normal')
on conflict (name, form, dosage) do update set
  molecule    = excluded.molecule,
  requires_rx = excluded.requires_rx,
  priority    = excluded.priority,
  active      = true;

-- ------------------------------------------------------------
-- 3. Stock confirmado
--    Idades MISTURADAS de propósito:
--    • frescas (<72h)  → aparecem no localizador
--    • expiradas (>72h)→ NÃO aparecem (valida a regra das 72h)
-- ------------------------------------------------------------
insert into public.stock_items (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at)
select
  p.id,
  d.id,
  true,
  v.quantity,
  v.price,
  now() - v.age
from (values
  -- Farmácia Nossa Senhora da Muxima — 4 frescas + 1 expirada
  ('farmacia-nossa-senhora-da-muxima', 'Insulina NPH',  'injetável',  '100 UI/ml',  4::int,   8500.00::numeric, interval '35 minutes'),
  ('farmacia-nossa-senhora-da-muxima', 'Paracetamol',   'comprimido', '500 mg',     120,       500.00,           interval '2 hours'),
  ('farmacia-nossa-senhora-da-muxima', 'Amoxicilina',   'cápsula',    '500 mg',     40,       4500.00,           interval '5 hours'),
  ('farmacia-nossa-senhora-da-muxima', 'Losartana',     'comprimido', '50 mg',      60,       3500.00,           interval '26 hours'),
  ('farmacia-nossa-senhora-da-muxima', 'Carbamazepina', 'comprimido', '200 mg',     null,     5200.00,           interval '96 hours'),

  -- Farmácia do Hospital Central — 4 frescas + 1 expirada
  ('farmacia-hospital-central',        'Insulina NPH',  'injetável',  '100 UI/ml',  12,       8200.00,           interval '1 hour'),
  ('farmacia-hospital-central',        'Carbamazepina', 'comprimido', '200 mg',     25,       5400.00,           interval '3 hours'),
  ('farmacia-hospital-central',        'Omeprazol',     'cápsula',    '20 mg',      80,       2500.00,           interval '8 hours'),
  ('farmacia-hospital-central',        'Salbutamol',    'inalador',   '100 mcg/dose', 15,     4200.00,           interval '30 hours'),
  ('farmacia-hospital-central',        'Ácido Fólico',  'comprimido', '5 mg',       null,      800.00,           interval '100 hours'),

  -- Farmácia Vida Nova — 4 frescas + 1 expirada
  ('farmacia-vida-nova-viana',         'Paracetamol',   'comprimido', '500 mg',     200,       450.00,           interval '15 minutes'),
  ('farmacia-vida-nova-viana',         'Metformina',    'comprimido', '850 mg',     35,       2800.00,           interval '4 hours'),
  ('farmacia-vida-nova-viana',         'Ácido Fólico',  'comprimido', '5 mg',       90,        750.00,           interval '20 hours'),
  ('farmacia-vida-nova-viana',         'Atenolol',      'comprimido', '50 mg',      18,       2800.00,           interval '40 hours'),
  ('farmacia-vida-nova-viana',         'Amoxicilina',   'cápsula',    '500 mg',     null,     4800.00,           interval '80 hours'),

  -- Farmácia Quirimbambas — 3 frescas (SEM insulina → útil p/ fase 3 "não temos") + 1 expirada
  ('farmacia-quirimbambas-talatona',   'Losartana',     'comprimido', '50 mg',      45,       3200.00,           interval '2 hours'),
  ('farmacia-quirimbambas-talatona',   'Hidroclorotiazida','comprimido','25 mg',     30,       2200.00,           interval '2 hours'),
  ('farmacia-quirimbambas-talatona',   'Sintrom',       'comprimido', '4 mg',       null,     7800.00,           interval '10 hours'),
  ('farmacia-quirimbambas-talatona',   'Paracetamol',   'comprimido', '500 mg',     60,        600.00,           interval '5 days'),

  -- Farmácia São Paulo — 3 frescas + 1 expirada
  ('farmacia-sao-paulo-cazenga',       'Paracetamol',   'comprimido', '500 mg',     150,       400.00,           interval '5 hours'),
  ('farmacia-sao-paulo-cazenga',       'Amoxicilina',   'cápsula',    '500 mg',     22,       4600.00,           interval '12 hours'),
  ('farmacia-sao-paulo-cazenga',       'Metronidazol',  'comprimido', '250 mg',     55,       1500.00,           interval '18 hours'),
  ('farmacia-sao-paulo-cazenga',       'Ibuprofeno',    'comprimido', '400 mg',     null,     1300.00,           interval '90 hours'),

  -- Farmácia Mirim — 4 frescas + 1 expirada
  ('farmacia-mirim-belas',             'Insulina NPH',  'injetável',  '100 UI/ml',  6,        8800.00,           interval '50 minutes'),
  ('farmacia-mirim-belas',             'Paracetamol',   'comprimido', '500 mg',     80,        550.00,           interval '3 hours'),
  ('farmacia-mirim-belas',             'Ibuprofeno',    'comprimido', '400 mg',     40,       1200.00,           interval '9 hours'),
  ('farmacia-mirim-belas',             'Glibenclamida', 'comprimido', '5 mg',       20,       2600.00,           interval '24 hours'),
  ('farmacia-mirim-belas',             'Losartana',     'comprimido', '50 mg',      null,     3800.00,           interval '4 days')
) as v(pharmacy_slug, drug_name, drug_form, drug_dosage, quantity, price, age)
join public.pharmacies p
  on p.slug = v.pharmacy_slug
join public.drugs d
  on d.name = v.drug_name and d.form = v.drug_form and d.dosage = v.drug_dosage
on conflict (pharmacy_id, drug_id) do update set
  in_stock     = true,
  quantity     = excluded.quantity,
  price        = excluded.price,
  confirmed_at = excluded.confirmed_at;
