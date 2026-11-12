-- ============================================================
-- 0063 · M3 — a view pública deixa de expor o inventário exacto
--
-- A `stock_confirmed` mostra `quantity`, `expires_at`, `source` e
-- `synced_at` a quem tenha a anon key (pública), apesar de o Localizador
-- só precisar de dizer «disponível / esgotado». Quantidade exacta,
-- validade dos lotes e origem do dado são informação de negócio da
-- farmácia e não têm de estar na Internet.
--
-- Correção:
--   1. nova view `stock_public` com as colunas que a UI lê, sem as quatro
--      sensíveis (e sem `available_quantity`, que também revelaria o saldo);
--   2. `anon` perde o SELECT na view completa; `authenticated` mantém-no
--      (portal e área interna continuam a ver o stock como antes);
--   3. a view pública mantém `security_invoker`, para continuar sujeita à
--      RLS das tabelas base — não é uma porta aberta nova.
--
-- A UI já trata a ausência destes campos: a ficha usa o limite de 10
-- quando não há quantidade e mostra «Não indicada» na validade; os
-- cartões escondem a contagem de unidades.
-- ============================================================

create or replace view localizador.stock_public
with (security_invoker = 'true') as
select
  s.id as stock_item_id,
  d.id as drug_id,
  d.name as drug_name,
  d.molecule as drug_molecule,
  d.form as drug_form,
  d.dosage as drug_dosage,
  d.requires_rx as drug_requires_rx,
  d.priority as drug_priority,
  d.kind as drug_kind,
  d.category as drug_category,
  p.id as pharmacy_id,
  p.slug as pharmacy_slug,
  p.name as pharmacy_name,
  p.municipio as pharmacy_municipio,
  p.address as pharmacy_address,
  p.lat as pharmacy_lat,
  p.lng as pharmacy_lng,
  p.maps_url as pharmacy_maps_url,
  p.phone as pharmacy_phone,
  p.whatsapp as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  p.verified as pharmacy_verified,
  s.price,
  s.pack_laminas,
  s.pack_comprimidos,
  s.available_from,
  s.confirmed_at,
  s.reservable,
  s.origin,
  s.brand,
  case
    when s.prefers_catalogue_image then coalesce(bi.image_path, s.image_path)
    else s.image_path
  end as image_path,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'unit', o.unit,
          'pack_size', o.pack_size,
          'price', o.price,
          'is_default', o.is_default
        )
        order by o.sort_order, o.unit
      )
      from localizador.stock_sale_options o
      where o.stock_item_id = s.id and o.active
    ),
    '[]'::jsonb
  ) as sale_options,
  (floor(extract(epoch from (now() - coalesce(s.synced_at, s.confirmed_at))) / 60))::integer
    as freshness_minutes,
  case
    when s.prefers_catalogue_image and bi.image_path is not null then 'catalogo'::text
    when s.image_path is not null then 'farmacia'::text
    else null::text
  end as image_origin
from localizador.stock_items s
join localizador.pharmacies p on p.id = s.pharmacy_id
join localizador.drugs d on d.id = s.drug_id
left join localizador.drug_brand_images bi
  on bi.drug_id = s.drug_id and bi.brand_key = s.brand_key and bi.status = 'published'
where s.in_stock
  and s.retired_at is null
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)
  and (
    (d.kind = 'medicamento' and s.confirmed_at > now() - interval '72 hours')
    or (d.kind <> 'medicamento' and s.confirmed_at > now() - interval '30 days')
  )
  and p.active
  and d.active;

comment on view localizador.stock_public is
  'View pública do Localizador (M3): só o que a UI mostra. Sem quantity, expires_at, source ou synced_at.';

-- A view nova nasce com os grants por omissão; fixá-los explicitamente.
revoke all on localizador.stock_public from public, anon, authenticated;
grant select on localizador.stock_public to anon, authenticated;

-- A view completa fica só para quem tem sessão (portal/interno). O
-- `public` também sai: o Supabase concede por omissão e o revoke a `anon`
-- sozinho não fecharia a porta a um role herdado.
revoke select on localizador.stock_confirmed from public, anon;
grant select on localizador.stock_confirmed to authenticated;

-- ------------------------------------------------------------
-- Verificação (falha a migração se a porta ficar aberta)
-- ------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'localizador.stock_confirmed', 'select') then
    raise exception 'M3: anon ainda consegue ler stock_confirmed';
  end if;
  if not has_table_privilege('anon', 'localizador.stock_public', 'select') then
    raise exception 'M3: anon não consegue ler stock_public';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'localizador'
      and table_name = 'stock_public'
      and column_name in ('quantity', 'expires_at', 'source', 'synced_at')
  ) then
    raise exception 'M3: stock_public expõe uma coluna sensível';
  end if;
end $$;
