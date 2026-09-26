-- ============================================================
-- SEED · Conta de demonstração do portal da farmácia (T8)
--
-- Cria:
--   1. Uma farmácia de demonstração (se o slug não existir)
--   2. Um utilizador Supabase Auth (demo@conhecafarmacia.com)
--   3. O registo admin_users com role='farmacia'
--   4. 3 linhas de stock de exemplo (2 disponíveis)
--
-- Aplicar no SQL Editor do dashboard do Supabase
-- (auth.users só é manipulável via SQL comSupabase Admin /
--  Management API — ver nota no fim).
-- ============================================================

-- 1. Farmácia de demonstração -----------------------------------------------
insert into public.pharmacies (slug, name, municipio, address, phone, whatsapp, opening_hours, verified, active)
values (
  'farmacia-demo-central',
  'Farmácia Demonstração Central',
  'Luanda',
  'Rua Rainha Ginga 45, Ingombota',
  '+244925696002',
  '244925696002',
  'Seg–Sáb · 07:30–19:00',
  true,
  true
)
on conflict (slug) do nothing;

-- 2. Utilizador Supabase Auth -----------------------------------------------
-- ⚠️ NÃO INSERIR auth.users POR SQL DIRECTO: deixa colunas de token a NULL
-- que quebram o GoTrue ("Database error querying schema" em TODOS os logins,
-- ver supabase/fix_auth_users_nulls.sql para o fix).
--
-- Criar o user por uma destas vias e depois correr a secção 3:
--   a) Dashboard: Authentication > Users > "Add user" > "Create new user"
--      (e-mail + senha + "Auto Confirm User"); ou
--   b) Admin API (service role):
--      POST {SUPABASE_URL}/auth/v1/admin/users
--      { "email": "...", "password": "...", "email_confirm": true }
--
-- E-mail/senha do demo: geral@conhecafarmacia.com / Demo2026!
-- O user_id é resolvido por e-mail na secção 3 — não é preciso conhecê-lo aqui.
create extension if not exists pgcrypto;

-- 3. admin_users com papel farmacia -----------------------------------------
insert into public.admin_users (user_id, role, pharmacy_id, display_name)
select
  u.id,
  'farmacia',
  p.id,
  'Farmacêutico Demo'
from auth.users u, public.pharmacies p
where u.email = 'geral@conhecafarmacia.com'
  and p.slug = 'farmacia-demo-central'
on conflict (user_id) do update
  set role = 'farmacia',
      pharmacy_id = excluded.pharmacy_id,
      display_name = excluded.display_name;

-- 4. Stock de exemplo (2 confirmados agora, 1 fora) -------------------------
insert into public.stock_items (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at)
select
  p.id,
  d.id,
  s.in_stock,
  s.quantity,
  s.price,
  case when s.in_stock then now() else now() - interval '96 hours' end
from public.pharmacies p
cross join (values
  ('Insulina NPH', true, 12, 8500.00),
  ('Carbamazepina', true, 30, 3200.00),
  ('Ácido Fólico', false, null, null)
) as s(name, in_stock, quantity, price)
join public.drugs d on d.name = s.name
where p.slug = 'farmacia-demo-central'
on conflict (pharmacy_id, drug_id) do update
  set in_stock = excluded.in_stock,
      quantity = excluded.quantity,
      price = excluded.price,
      confirmed_at = excluded.confirmed_at;
