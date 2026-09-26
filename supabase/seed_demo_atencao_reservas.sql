-- ============================================================
-- SEED · Dados para ver /portal/atencao e /portal/reservas "vivas"
--
-- Pré-requisitos:
--   • A farmácia demo + user já existem (scripts/create-pharmacy-user.js)
--     → slug 'farmacia-cf-central', e-mail conhecerfarmacia@gmail.com
--   • O catálogo de fármacos existe (supabase/seed_demo.sql)
--
-- O que este seed cria (na farmácia demo):
--   1. Stock em todos os estados que os painéis detectam:
--      • fresco disponível        → aparece no Localizador, sem avisos
--      • stale (>5 dias)          → secção "Stock desactualizado" em /atencao
--      • validade <30d / 30-60d / 60-90d → secção "Validade" em /atencao
--      • expirado                 → VALIDADE (escondido do Localizador)
--      • a chegar (available_from futuro)
--      • indisponível             → "Não disponível"
--   2. Reservas em TODOS os estados (pendente, confirmada, pronta,
--      concluida, recusada) → /portal/reservas mostra a fila completa.
--   3. Vendas concluídas com item esgotado (in_stock=false) → a secção
--      "Repor stock" em /atencao.
--
-- Idempotente: pode correr várias vezes (upserts por chaves únicas;
-- reservas existentes de datas anteriores são reutilizadas).
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. Garantir o catálogo necessário (nome/posologia estáveis)
-- ------------------------------------------------------------
insert into public.drugs (name, molecule, form, dosage, requires_rx, priority) values
  ('Paracetamol',   'paracetamol',   'comprimido', '500 mg',    false, 'normal'),
  ('Amoxicilina',   'amoxicilina',   'cápsula',    '500 mg',    true,  'alto'),
  ('Insulina NPH',  'insulina isofânica', 'injetável', '100 UI/ml', true, 'critico'),
  ('Salbutamol',    'salbutamol',    'inalador',   '100 mcg/dose', true, 'critico'),
  ('Metformina',    'metformina',    'comprimido', '850 mg',    true,  'alto'),
  ('Ibuprofeno',    'ibuprofeno',    'comprimido', '400 mg',    false, 'normal'),
  ('Omeprazol',     'omeprazol',     'cápsula',    '20 mg',     false, 'normal'),
  ('Loratadina',    'loratadina',    'comprimido', '10 mg',     false, 'normal'),
  ('Losartana',     'losartana',     'comprimido', '50 mg',     true,  'normal'),
  ('Azitromicina',  'azitromicina',  'comprimido', '500 mg',    true,  'alto')
on conflict (name, form, dosage) do update set
  active = true;

-- ------------------------------------------------------------
-- 1. STOCK — cada linha é um estado diferente
--    (upsert por (pharmacy_id, drug_id), como o updateStockItem)
-- ------------------------------------------------------------
insert into public.stock_items
  (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at, available_from, expires_at)
select
  p.id,
  d.id,
  s.in_stock,
  s.quantity,
  s.price,
  now() - (s.age_hours || ' hours')::interval,
  case
    when s.days_ahead is not null
    then (date_trunc('day', now()) + (s.days_ahead || ' days')::interval)::timestamptz + interval '12 hours'
    else null
  end,
  s.expires_in_days
from public.pharmacies p
cross join (values
  -- nome              | in_stock | qty  | price   | age_h | days_ahead | expires_in_days
  ('Paracetamol',       true,      40,   500.00,   2,      null,       null),          -- fresco, sem avisos
  ('Ibuprofeno',        true,      25,   1200.00,  4,      null,       null),          -- fresco
  ('Amoxicilina',       true,      8,    3500.00,  170,    null,       null),          -- ~7 dias → STALE
  ('Loratadina',        true,      15,   1500.00,  200,    null,       null),          -- ~8 dias → STALE
  ('Losartana',         true,      12,   2800.00,  3,      null,       current_date - 3), -- EXPIRADO
  ('Insulina NPH',      true,      6,    8500.00,  1,      null,       current_date + 20), -- <30 dias
  ('Salbutamol',        true,      10,   4200.00,  1,      null,       current_date + 45), -- 30-60 dias
  ('Omeprazol',         true,      18,   1900.00,  1,      null,       current_date + 80), -- 60-90 dias
  ('Metformina',        true,      22,   2400.00,  1,      10,         null),          -- a chegar em 10 dias
  ('Azitromicina',      false,     null, null,     96,     null,       null)           -- não disponível
) as s(name, in_stock, quantity, price, age_hours, days_ahead, expires_in_days)
join public.drugs d on d.name = s.name
where p.slug = 'farmacia-cf-central'
on conflict (pharmacy_id, drug_id) do update
  set in_stock      = excluded.in_stock,
      quantity      = excluded.quantity,
      price         = excluded.price,
      confirmed_at  = excluded.confirmed_at,
      available_from = excluded.available_from,
      expires_at    = excluded.expires_at;

-- ------------------------------------------------------------
-- 2. RESERVAS — todos os estados, ligadas ao stock da farmácia
--    requester_phone: os números (244...) são fictícios.
-- ------------------------------------------------------------
do $$
declare
  v_pharmacy uuid;
  v_item record;
  v_rid uuid;
begin
  select id into v_pharmacy from public.pharmacies where slug = 'farmacia-cf-central';
  if v_pharmacy is null then
    raise exception 'Farmácia não existe — corre primeiro scripts/create-pharmacy-user.js ou cria-a com o slug correspondente';
  end if;

  -- 2a. PENDENTES (3) — a fila urgente de /reservas
  for v_item in
    select si.id as stock_item_id, si.drug_id, d.name
    from public.stock_items si
    join public.drugs d on d.id = si.drug_id
    where si.pharmacy_id = v_pharmacy and si.in_stock = true
      and d.name in ('Paracetamol', 'Salbutamol', 'Insulina NPH')
    order by d.name
  loop
    select id into v_rid from public.reservations
      where pharmacy_id = v_pharmacy and drug_id = v_item.drug_id
        and status = 'pendente' and requester_name = 'Ana Ferreira'
        and v_item.name = 'Paracetamol'
      limit 1;
    if v_rid is null and v_item.name = 'Paracetamol' then
      insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, notes, status, created_at)
      values (v_item.stock_item_id, v_pharmacy, v_item.drug_id, 'Ana Ferreira', '+244923000001', 2,
              'Para a minha mãe, posso levantar amanhã de manhã?', 'pendente', now() - interval '35 minutes');
    elsif v_rid is null and v_item.name = 'Salbutamol' then
      insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, notes, status, created_at)
      values (v_item.stock_item_id, v_pharmacy, v_item.drug_id, 'Carlos Moutinho', '+244923000002', 1,
              'Urgente — criança de 6 anos.', 'pendente', now() - interval '2 hours');
    end if;
    v_rid := null;
  end loop;

  -- 2b. PENDENTE adicional (Loratadina)
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, created_at)
  select si.id, v_pharmacy, si.drug_id, 'Domingos Sebastião', '+244923000003', 1, 'pendente', now() - interval '5 hours'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Loratadina' and si.in_stock = true
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'pendente'
  );

  -- 2c. CONFIRMADA (1) — Insulina NPH
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, notes, status, created_at)
  select si.id, v_pharmacy, si.drug_id, 'Marta Kiala', '+244923000004', 1,
         'Confirmado por telefone, vem hoje às 17h.', 'confirmada', now() - interval '6 hours'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Insulina NPH' and si.in_stock = true
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'confirmada'
  );

  -- 2d. PRONTA PARA RECOLHA (1) — Ibuprofeno
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, created_at, resolved_at)
  select si.id, v_pharmacy, si.drug_id, 'Jorge Bengui', '+244923000005', 3, 'pronta', now() - interval '26 hours', now() - interval '1 hour'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Ibuprofeno' and si.in_stock = true
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'pronta'
  );

  -- 2e. RECUSADA (1) — Metformina (a chegar; ainda não há stock fisico)
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, notes, status, created_at, resolved_at)
  select si.id, v_pharmacy, si.drug_id, 'Rosa Nguvulu', '+244923000006', 2,
         'Sem stock fisico — sugerida outra farmácia.', 'recusada', now() - interval '3 days', now() - interval '3 days'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Metformina'
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'recusada'
  );

  -- 2f. CONCLUÍDA (1) — Omeprazol, venda recente sem esgotar
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, created_at, resolved_at)
  select si.id, v_pharmacy, si.drug_id, 'Tomás Almeida', '+244923000007', 1, 'concluida', now() - interval '2 days', now() - interval '2 days'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Omeprazol' and si.in_stock = true
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'concluida'
      and r.resolved_at > now() - interval '1 day'
  );

  -- 2g. CONCLUÍDA COM ESGOTAMENTO (2) — gera a secção REPOSIÇÃO em /atencao
  --     O trigger da 0006 (trg_reservation_stock_decrement) baixa o stock
  --     ao concluir; aqui simulamos o resultado final directamente:
  --     resolvida há 2h (muito recente — fica no topo da lista de reposição)
  --     e há 3 dias.
  --     NOTA: as reservas ficam a apontar para itens cujo stock real é o
  --     da secção 1 (não zero) — o painel de reposição usa a linha de
  --     stock mais recente, por isso repetir estes fármacos aqui
  --     "desligaria" o estado fresco da secção 1. Em vez disso criamos
  --     ESTAS reservas contra itens de um fármaco extra, "Ceftriaxona",
  --     que não está na secção 1.
  insert into public.drugs (name, molecule, form, dosage, requires_rx, priority)
  values ('Ceftriaxona', 'ceftriaxona', 'injetável', '1 g', true, 'critico')
  on conflict (name, form, dosage) do update set active = true;

  insert into public.stock_items (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at)
  select v_pharmacy, d.id, false, null, 9800.00, now() - interval '8 days'
  from public.drugs d where d.name = 'Ceftriaxona' and d.dosage = '1 g'
  on conflict (pharmacy_id, drug_id) do update
    set in_stock = false, quantity = null, confirmed_at = excluded.confirmed_at;

  -- Reserva concluída (há 2 horas) — a mais recente da fila de reposição
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, created_at, resolved_at)
  select si.id, v_pharmacy, si.drug_id, 'Esperança Domingos', '+244923000008', 5, 'concluida', now() - interval '3 hours', now() - interval '2 hours'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Ceftriaxona' and si.in_stock = false
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.drug_id = si.drug_id and r.status = 'concluida'
  );

  -- 2h. HISTÓRICO — algumas concluídas antigas (dão realismo à fila)
  insert into public.reservations (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status, created_at, resolved_at)
  select si.id, v_pharmacy, si.drug_id, 'Cliente Antigo', '+244923000009', 1, 'concluida', now() - interval '10 days', now() - interval '10 days'
  from public.stock_items si join public.drugs d on d.id = si.drug_id
  where si.pharmacy_id = v_pharmacy and d.name = 'Paracetamol' and si.in_stock = true
  and not exists (
    select 1 from public.reservations r
    where r.pharmacy_id = v_pharmacy and r.requester_name = 'Cliente Antigo'
  );

  raise notice 'Seed de atenção/reservas aplicado à farmácia demo.';
end $$;

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
-- Stock por estado:
select d.name, si.in_stock, si.quantity, si.price, si.confirmed_at, si.available_from, si.expires_at
from public.stock_items si
join public.pharmacies p on p.id = si.pharmacy_id
join public.drugs d on d.id = si.drug_id
where p.slug = 'farmacia-cf-central'
order by d.name;

-- Reservas por estado:
select status, count(*) from public.reservations r
join public.pharmacies p on p.id = r.pharmacy_id
where p.slug = 'farmacia-cf-central'
group by status order by status;
