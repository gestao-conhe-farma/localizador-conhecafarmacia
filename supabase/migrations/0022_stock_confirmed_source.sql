-- ============================================================
-- 0022 · Origem e frescura do stock no Localizador
--
-- A 0020 passou a guardar DE ONDE vem o saldo (`stock_items.source`:
-- portal | csv | api | team) e QUANDO foi sincronizado (`synced_at`).
-- Faltava expô-lo ao Localizador para o cliente perceber a diferença
-- entre «a farmácia disse às 10h» e «o sistema da farmácia confirmou
-- há 6 minutos» — é essa a promessa da ideia 1 do plano 2026-10-12
-- (a API compra frescura, e a frescura é vendável).
--
-- Decisão do owner (2026-10-13): a REGRA DAS 72 HORAS não muda — o
-- corte de visibilidade é o mesmo para todas as origens; o que muda é
-- o SELO mostrado. Stock automático com dois dias continua visível
-- (a farmácia pode sincronizar de 2 em 2 dias), mas nunca se apresenta
-- como se fosse escrito agora.
--
-- Recriação fiel à 0017 (mesmas colunas, mesma ordem, mesmo WHERE),
-- com TRÊS colunas novas no fim:
--   • source              — portal | csv | api | team
--   • synced_at           — quando a origem externa confirmou (null no portal)
--   • freshness_minutes   — minutos desde a última confirmação, para o selo
--
-- NOTA (lição da 0014/0017): CREATE OR REPLACE VIEW não altera o
-- conjunto de colunas (42P16) — DROP VIEW + CREATE VIEW. Views não
-- armazenam dados; os grants reaplicam-se a seguir.
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
  s.pack_laminas,
  s.pack_comprimidos,
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
  ) as sale_options,
  -- 0022: origem e frescura (selo do Localizador).
  s.source,
  s.synced_at,
  floor(extract(epoch from (now() - coalesce(s.synced_at, s.confirmed_at))) / 60)::integer
    as freshness_minutes
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

comment on column public.stock_confirmed.source is
  'Como o saldo foi escrito: portal (mão), csv (importação), api (sincronização), team (equipa CF).';
comment on column public.stock_confirmed.freshness_minutes is
  'Minutos desde a última confirmação (synced_at em csv/api, confirmed_at no resto) — usada no selo do Localizador.';

-- ============================================================
-- Verificação (depois de aplicar):
--   select source, freshness_minutes, count(*)
--     from public.stock_confirmed group by 1, 2 order by 3 desc limit 10;
--   select count(*) from public.stock_confirmed;   -- igual ao valor antes
-- ============================================================
