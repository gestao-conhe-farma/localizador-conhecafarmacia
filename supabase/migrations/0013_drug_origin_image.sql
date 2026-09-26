-- ============================================================
-- 0013 · Origem e imagem do medicamento (por item de stock)
--
-- A origem é factor de decisão forte em Angola: "é português?",
-- "é indiano?" pesa na confiança e no preço aceite. Também serve
-- de proxy de qualidade quando o cliente não conhece a marca.
--
-- Modelo: ORIGEM e MARCA vivem no stock_items (por apresentação
-- que a farmácia vende), NÃO no catálogo drugs — o mesmo fármaco
-- pode ser vendido em versões de origens diferentes por farmácias
-- diferentes, e quem sabe é quem tem a caixa na mão.
--
-- IMAGEM: uma foto por item de stock (a embalagem real que está
-- na prateleira), guardada no Storage público bucket 'drug-images'
-- sob caminho por farmácia. image_url guarda o path público.
--
-- Tudo OPCIONAL: itens sem origem/marca/foto continuam a funcionar
-- como hoje (legado) — zero backfill.
-- ------------------------------------------------------------

-- 1. Colunas em stock_items ------------------------------------------
alter table public.stock_items
  add column if not exists origin text,
  add column if not exists brand text,
  add column if not exists image_path text;

-- Origem fechada por checklist + livre: a farmácia escolhe da lista
-- (pt/india/...) ou escreve outro país — como a impressora de origem
-- na embalagem varia ("Made in EUA", "Product of India").
-- CHECK leve: só formato, não conteúdo.
alter table public.stock_items
  add constraint stock_items_origin_len check (char_length(origin) <= 60),
  add constraint stock_items_brand_len check (char_length(brand) <= 80);

-- 2. Bucket Storage público ------------------------------------------
-- Idempotente: insere só se não existir. Público de leitura (o
-- Localizador mostra a foto a visitantes anónimos); escrita só para
-- farmácias autenticadas (policy abaixo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drug-images',
  'drug-images',
  true,
  2097152, -- 2 MB — foto de embalagem não precisa de mais
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Escrita: a farmácia só sobe/apaga no SEU prefixo drug-images/<pharmacy_id>/.
-- A leitura é pública (bucket public).
create policy "drug images pharmacy write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'drug-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "drug images pharmacy update"
on storage.objects for update to authenticated
using (
  bucket_id = 'drug-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "drug images pharmacy delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'drug-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. View stock_confirmed recriada — expõe origin/brand/image_path.
--    Definição idêntica à da 0012 + as três colunas novas.
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
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- 4. RLS de stock_items: as policies existentes já cobrem (o upsert
--    da farmácia passa a incluir as colunas novas sem alteração de
--    policy — "stock pharmacy write" é por linha). Nada a fazer.

-- ------------------------------------------------------------
-- Verificação:
--   select origin, brand, image_path from stock_confirmed limit 1;
--   select id, public from storage.buckets where id = 'drug-images';
-- ------------------------------------------------------------
