-- ============================================================
-- 0002 · View com drug_priority
-- A página de detalhes da farmácia agrupa os medicamentos
-- críticos (priority = 'critico') numa secção própria no topo.
-- A view stock_confirmed precisa, por isso, de expor o campo.
-- NOTA: create or replace não permite ADICIONAR colunas a uma view
-- existente (42P16) — por isso o drop prévio. A view não guarda
-- dados; o drop é seguro e as grants são recriadas abaixo.
-- ============================================================

drop view if exists public.stock_confirmed;

create or replace view public.stock_confirmed
with (security_invoker = true) as
select
  s.id            as stock_item_id,
  d.id            as drug_id,
  d.name          as drug_name,
  d.molecule      as drug_molecule,
  d.form          as drug_form,
  d.dosage        as drug_dosage,
  d.requires_rx   as drug_requires_rx,
  d.priority      as drug_priority,
  p.id            as pharmacy_id,
  p.slug          as pharmacy_slug,
  p.name          as pharmacy_name,
  p.municipio     as pharmacy_municipio,
  p.address       as pharmacy_address,
  p.lat           as pharmacy_lat,
  p.lng           as pharmacy_lng,
  p.phone         as pharmacy_phone,
  p.whatsapp      as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  p.verified      as pharmacy_verified,
  s.quantity,
  s.price,
  s.confirmed_at
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;
