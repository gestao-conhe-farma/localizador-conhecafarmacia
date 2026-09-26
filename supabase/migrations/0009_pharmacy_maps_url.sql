-- ============================================================
-- 0009 · Link do Google Maps da farmácia (maps_url)
--
-- A farmácia cola o link partilhado do Google Maps no portal
-- (em vez de coordenadas lat/lng, que ninguém sabe de cor) e o
-- Localizador usa-o no botão "Google Maps" da página pública —
-- com fallback para a pesquisa por nome + morada.
--
-- SEMÂNTICA:
--   maps_url NULL  → usa o comportamento antigo (lat/lng ou pesquisa
--                    por nome + morada) — nada muda para quem nunca
--                    preencheu o campo;
--   maps_url set   → o botão abre exactamente o sítio que a farmácia
--                    escolheu (ficha do Google, pin partilhado, etc.).
--
-- A view `stock_confirmed` é recriada POR INTEIRO com a definição da
-- 0007 + a nova coluna exposta (pharmacy_maps_url). lat/lng mantêm-se
-- na tabela e na view — a página pública continua a aceitá-los como
-- fallback para farmácias antigas.
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna (idempotente)
-- ------------------------------------------------------------
alter table public.pharmacies
  add column if not exists maps_url text;

-- ------------------------------------------------------------
-- 2. View: expõe maps_url (recriada por inteiro — a definição
--    da 0007 mantém-se, com o novo campo)
-- ------------------------------------------------------------
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
  p.maps_url      as pharmacy_maps_url,
  p.phone         as pharmacy_phone,
  p.whatsapp      as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  p.verified      as pharmacy_verified,
  s.quantity,
  s.price,
  s.available_from,
  s.expires_at,
  s.confirmed_at
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)  -- esconde expirados
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
-- A coluna existe:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'pharmacies'
--      and column_name = 'maps_url';
--
-- A view expõe o campo:
--   select pharmacy_maps_url from public.stock_confirmed limit 1;
