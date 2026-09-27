-- ============================================================
-- 0014 · Retirada de stock — «lixeira» do portal
--
-- Duas situações distintas que o portal não separava:
--   • «Não temos» (in_stock=false): o produto volta amanhã — fica
--     na lista normal como desligado.
--   • RETIRADO (retired_at preenchido): apagado definitivo do
--     catálogo da farmácia — descontinuado, lote perdido, erro de
--     registo. Não aparece na lista de stock, apenas na lixeira.
--
-- Desenho: soft-delete (coluna retired_at), NÃO DELETE — preserva
-- histórico (updated_by, reservas antigas que referenciam o item)
-- e é reversível (restaurar da lixeira = limpar retired_at).
--
-- A view stock_confirmed é recriada FIEL à da 0013 (mesmas colunas,
-- mesma ordem — including opening_hours/verified) com um filtro
-- novo: retirados nunca aparecem no Localizador, mesmo que alguém
-- marque in_stock=true num item retirado por engano.
--
-- NOTA TÉCNICA: CREATE OR REPLACE VIEW não permite alterar o
-- conjunto de colunas (erro 42P16 «cannot drop columns from view»
-- — a definição nova acrescentava s.in_stock que a 0013 não
-- expunha com esse nome). Por isso: DROP VIEW + CREATE VIEW.
-- Seguro: views não têm dados; grants reaplicadas a seguir.
-- ============================================================

alter table public.stock_items
  add column if not exists retired_at timestamptz;

comment on column public.stock_items.retired_at is
  'Preenchido = item retirado do catálogo da farmácia (lixeira). Null = activo.';

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
  and s.retired_at is null          -- 0014: retirados nunca no Localizador
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)
  and s.confirmed_at > now() - interval '72 hours'
  and p.active
  and d.active;

grant select on public.stock_confirmed to anon, authenticated;

-- Índice parcial: lixeira de uma farmácia (consulta do portal).
create index if not exists stock_items_retired_idx
  on public.stock_items (pharmacy_id, retired_at)
  where retired_at is not null;

-- ------------------------------------------------------------
-- Verificação:
--   select count(*) from stock_confirmed;               -- Localizador intacto
--   select retired_at from stock_items limit 1;         -- coluna existe
--   select indexname from pg_indexes
--     where tablename='stock_items' and indexname like '%retired%';
-- ------------------------------------------------------------
