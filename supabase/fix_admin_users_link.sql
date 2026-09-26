-- ============================================================
-- Liga o utilizador real (criado no dashboard) à farmácia demo
-- com papel 'farmacia'. Correr depois do fix_auth_users_nulls.sql.
-- ============================================================

insert into public.admin_users (user_id, role, pharmacy_id, display_name)
select
  u.id,
  'farmacia',
  p.id,
  'Farmacêutico Demo'
from auth.users u, public.pharmacies p
where u.email = 'conhecerfarmacia@gmail.com'
  and p.slug = 'farmacia-demo-central'
on conflict (user_id) do update
  set role = 'farmacia',
      pharmacy_id = excluded.pharmacy_id,
      display_name = excluded.display_name;

-- Confirmação: deve devolver 1 linha com role='farmacia'
select u.email, a.role, p.slug as pharmacy
from public.admin_users a
join auth.users u on u.id = a.user_id
join public.pharmacies p on p.id = a.pharmacy_id;
