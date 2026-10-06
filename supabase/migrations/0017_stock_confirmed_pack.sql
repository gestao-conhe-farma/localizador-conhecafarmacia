-- ============================================================
-- 0017 · Estrutura da caixa no Localizador (view stock_confirmed)
--
-- A 0016 adicionou pack_laminas / pack_comprimidos a stock_items,
-- mas a view pública não os expunha — o modal de reserva do cliente
-- não consegue mostrar «caixa com 10 lâminas de 10 comprimidos».
-- Esta migração recria a view FIEL à da 0014 (mesmas colunas, mesma
-- ordem, mesmo WHERE) com as duas colunas novas junto ao preço.
--
-- NOTA (lição da 0014): CREATE OR REPLACE VIEW não altera o
-- conjunto de colunas (42P16) — por isso DROP VIEW + CREATE VIEW.
-- Views não armazenam dados; os grants reaplicam-se a seguir.
-- ============================================================

drop view if exists public.stock_confirmed;

create view public.stock_confirmed
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
  s.pack_laminas,      -- 0017: lâminas por caixa (estrutura da embalagem)
  s.pack_comprimidos,  -- 0017: comprimidos por lâmina
  s.available_from,
  s.expires_at,
  s.confirmed_at,
  s.origin,
  s.brand,
  s.image_path,
  coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'unit', o.unit,
                'pack_size', o.pack_size,
                'price', o.price,
                'is_default', o.is_default
              ) order by o.sort_order, o.unit)
     from public.stock_sale_options o
     where o.stock_item_id = s.id and o.active),
    '[]'::jsonb
  ) as sale_options
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and s.retired_at is null
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)
  and s.confirmed_at > now() - interval '72 hours'
  and p.active
  and d.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ============================================================
-- Verificação (depois de aplicar):
--   select pack_laminas, pack_comprimidos from stock_confirmed limit 3;
--   select count(*) from stock_confirmed;  -- deve manter-se igual
-- ============================================================
