-- ============================================================
-- 0040 · Imagem de catálogo POR MARCA (medicamento + marca)
--
-- O Localizador já mostra a foto que cada farmácia sobe (0013), item
-- a item. Isso resolve a embalagem real, mas deixa duas lacunas:
--   • quem não tem foto fica só com o pack tipográfico;
--   • a mesma caixa é fotografada N vezes, com qualidades diferentes.
--
-- Esta migração acrescenta um catálogo de imagens NOSSO, indexado por
-- (drug_id, brand_key). Só o medicamento NÃO chega: a marca é parte da
-- chave — «Ben-u-ron» e «Brufen» são o mesmo ibuprofeno e não a mesma
-- caixa. Sem marca no item de stock, não há imagem de catálogo.
--
-- brand_key = minúsculas, acentos removidos, tudo o que não é a-z0-9
-- removido. «Ben-u-ron», «BEN U RON» e «Benuron» → 'benuron';
-- «Ben-u-ron 1000» → 'benuron1000'. A normalização vive SÓ nesta
-- função: nenhum cliente JS a replica.
--
-- A farmácia MANDA: stock_items.prefers_catalogue_image decide se usa
-- a nossa imagem. true = catálogo (com fallback à foto própria se
-- ainda não houver imagem); false = só a foto própria, mesmo que
-- exista imagem nossa. Nada muda visualmente para quem já tem foto:
-- o backfill desliga a preferência nesses itens.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chave de marca
-- ------------------------------------------------------------
create or replace function public.brand_key(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(t, ''),
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^a-z0-9]', '', 'g'
  )
$$;

comment on function public.brand_key(text) is
  'Normaliza a marca para a chave de correspondência da imagem de catálogo (minúsculas, sem acentos nem pontuação).';

-- ------------------------------------------------------------
-- 2. Colunas em stock_items
--    brand_key gerada (o cliente nunca a escreve) e a preferência.
--    O backfill só corre na PRIMEIRA aplicação: reexecutar a migração
--    não pode desfazer uma escolha que a farmácia já fez.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'stock_items'
       and column_name = 'prefers_catalogue_image'
  ) then
    alter table public.stock_items
      add column brand_key text
        generated always as (public.brand_key(brand)) stored,
      add column prefers_catalogue_image boolean not null default true;

    -- Quem já tem foto própria mantém a foto até optar pelo catálogo.
    update public.stock_items
       set prefers_catalogue_image = false
     where image_path is not null;
  end if;
end $$;

create index if not exists stock_items_brand_key_idx
  on public.stock_items (drug_id, brand_key);

comment on column public.stock_items.prefers_catalogue_image is
  'true = usa a imagem de catálogo quando existe para (drug, marca); false = usa só a foto própria.';

-- ------------------------------------------------------------
-- 3. Catálogo de imagens por marca
-- ------------------------------------------------------------
create table if not exists public.drug_brand_images (
  id uuid primary key default gen_random_uuid(),
  drug_id uuid not null references public.drugs(id) on delete cascade,
  brand_key text not null,
  brand_label text not null,
  image_path text not null unique,
  image_sha text not null,
  bytes integer,
  width integer,
  height integer,
  status text not null default 'published'
    check (status in ('published', 'hidden')),
  source_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drug_brand_images_label_len check (char_length(brand_label) <= 80),
  constraint drug_brand_images_key_len check (char_length(brand_key) between 1 and 80),
  unique (drug_id, brand_key)
);

comment on table public.drug_brand_images is
  'Imagem de catálogo por medicamento + marca. Escrita só por service role (área interna); leitura pública das publicadas.';

-- A chave deriva sempre do rótulo: o cliente envia a marca como a vê,
-- e o trigger normaliza-a. Não há dois sítios a normalizar.
create or replace function public.drug_brand_images_before_write()
returns trigger
language plpgsql
as $$
begin
  new.brand_key := public.brand_key(new.brand_label);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists drug_brand_images_before_write on public.drug_brand_images;
create trigger drug_brand_images_before_write
  before insert or update on public.drug_brand_images
  for each row execute function public.drug_brand_images_before_write();

alter table public.drug_brand_images enable row level security;

drop policy if exists "catalogue images read published" on public.drug_brand_images;
create policy "catalogue images read published"
  on public.drug_brand_images for select to anon, authenticated
  using (status = 'published');

grant select on public.drug_brand_images to anon, authenticated;

-- Sem policies de INSERT/UPDATE/DELETE: a escrita é só da equipa, via
-- service role (createAdminClient), tal como a trilha de auditoria.

-- ------------------------------------------------------------
-- 4. Cobertura — a lista de compras de quem fotografa as caixas
--    security_invoker: os ecrãs internos leem com service role (que
--    vê tudo); a RLS de stock_items continua a valer para mais ninguém.
-- ------------------------------------------------------------
create or replace view public.brand_image_coverage
with (security_invoker = true) as
select
  d.id                                         as drug_id,
  d.name                                       as drug_name,
  s.brand_key,
  min(s.brand)                                 as brand_label,
  count(*) filter (where s.retired_at is null) as stock_items,
  count(distinct s.pharmacy_id)                as pharmacies,
  max(s.confirmed_at)                          as last_confirmed,
  bi.id                                        as image_id,
  bi.image_path,
  bi.status
from public.stock_items s
join public.drugs d on d.id = s.drug_id
left join public.drug_brand_images bi
  on bi.drug_id = s.drug_id
 and bi.brand_key = s.brand_key
where s.brand is not null
  and s.brand_key <> ''
group by d.id, d.name, s.brand_key, bi.id, bi.image_path, bi.status;

grant select on public.brand_image_coverage to authenticated;

-- ------------------------------------------------------------
-- 5. Pré-visualização de uma marca ainda não guardada (portal)
--    O modal do stock chama isto enquanto a pessoa escreve a marca;
--    devolve só o caminho publicado, ou null.
-- ------------------------------------------------------------
create or replace function public.catalogue_image_for(p_drug_id uuid, p_brand text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select bi.image_path
    from public.drug_brand_images bi
   where bi.drug_id = p_drug_id
     and bi.brand_key = public.brand_key(p_brand)
     and bi.status = 'published'
   limit 1
$$;

revoke all on function public.catalogue_image_for(uuid, text) from public;
grant execute on function public.catalogue_image_for(uuid, text)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. stock_confirmed — recriação FIEL à 0038, com a resolução
--    A ordem das colunas existentes não muda; `image_origin` entra no
--    fim (CREATE OR REPLACE não altera o conjunto de colunas — 42P16).
-- ------------------------------------------------------------
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
  d.kind          as drug_kind,
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
  s.reservable,
  s.origin,
  s.brand,
  -- 0040: a imagem que o cliente vê. Preferência ligada → catálogo,
  -- com fallback à foto da farmácia; preferência desligada → só a foto.
  case
    when s.prefers_catalogue_image then coalesce(bi.image_path, s.image_path)
    else s.image_path
  end             as image_path,
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
    as freshness_minutes,
  case
    when s.prefers_catalogue_image and bi.image_path is not null then 'catalogo'
    when s.image_path is not null then 'farmacia'
    else null
  end             as image_origin
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
left join public.drug_brand_images bi
  on bi.drug_id = s.drug_id
 and bi.brand_key = s.brand_key
 and bi.status = 'published'
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

grant select on public.stock_confirmed to anon, authenticated;

comment on column public.stock_confirmed.image_origin is
  'De onde vem a imagem mostrada: catalogo (0040) ou farmacia (foto do item).';

-- ------------------------------------------------------------
-- 7. Acompanhamento público da reserva — a MESMA resolução
--    Sem isto, o cliente veria a foto antiga na página da reserva
--    enquanto o Localizador já mostrava a do catálogo.
-- ------------------------------------------------------------
create or replace function public.get_reservation_status(p_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_id is null or p_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'quantity', r.quantity,
    'confirmed_quantity', r.confirmed_quantity,
    'reason', r.reason,
    'notes', r.notes,
    'created_at', r.created_at,
    'resolved_at', r.resolved_at,
    'requester_name', r.requester_name,
    'sale_option_id', r.sale_option_id,
    'drug', jsonb_build_object(
      'name', d.name,
      'form', d.form,
      'dosage', d.dosage
    ),
    'pharmacy', jsonb_build_object(
      'name', p.name,
      'phone', p.phone,
      'whatsapp', p.whatsapp,
      'address', p.address,
      'municipio', p.municipio
    ),
    'sale_option', case
      when o.id is null then null
      else jsonb_build_object(
        'unit', o.unit,
        'pack_size', o.pack_size,
        'price', o.price
      )
    end,
    'stock_item', jsonb_build_object(
      'origin', s.origin,
      'brand', s.brand,
      'image_path', case
        when s.prefers_catalogue_image then coalesce(bi.image_path, s.image_path)
        else s.image_path
      end,
      'image_origin', case
        when s.prefers_catalogue_image and bi.image_path is not null then 'catalogo'
        when s.image_path is not null then 'farmacia'
        else null
      end,
      'pack_laminas', s.pack_laminas,
      'pack_comprimidos', s.pack_comprimidos
    )
  )
  into result
  from public.reservations r
  join public.drugs d on d.id = r.drug_id
  join public.pharmacies p on p.id = r.pharmacy_id
  left join public.stock_sale_options o on o.id = r.sale_option_id
  left join public.stock_items s on s.id = r.stock_item_id
  left join public.drug_brand_images bi
    on bi.drug_id = s.drug_id
   and bi.brand_key = s.brand_key
   and bi.status = 'published'
  where r.id = p_id
    and r.access_token = p_token;

  return result;
end
$$;

revoke all on function public.get_reservation_status(uuid, uuid) from public;
grant execute on function public.get_reservation_status(uuid, uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 8. Upsert usado pela área interna (service role)
--    A chave é calculada AQUI, no único sítio que normaliza marcas.
--    Devolve o caminho anterior para o action poder apagar o objecto
--    substituído depois de a BD já apontar para o novo.
-- ------------------------------------------------------------
create or replace function public.upsert_brand_image(
  p_drug_id uuid,
  p_brand_label text,
  p_image_path text,
  p_image_sha text,
  p_bytes integer default null,
  p_width integer default null,
  p_height integer default null,
  p_source_note text default null,
  p_created_by uuid default null
)
returns table (id uuid, brand_key text, previous_path text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_key text := public.brand_key(p_brand_label);
  v_previous text;
  v_id uuid;
begin
  if p_drug_id is null or v_key = '' then
    raise exception 'marca_invalida' using errcode = '22023';
  end if;

  select bi.image_path into v_previous
    from public.drug_brand_images bi
   where bi.drug_id = p_drug_id
     and bi.brand_key = v_key;

  insert into public.drug_brand_images as bi
    (drug_id, brand_key, brand_label, image_path, image_sha,
     bytes, width, height, source_note, created_by, status)
  values
    (p_drug_id, v_key, btrim(p_brand_label), p_image_path, p_image_sha,
     p_bytes, p_width, p_height, p_source_note, p_created_by, 'published')
  on conflict (drug_id, brand_key) do update
    set brand_label = excluded.brand_label,
        image_path = excluded.image_path,
        image_sha = excluded.image_sha,
        bytes = excluded.bytes,
        width = excluded.width,
        height = excluded.height,
        source_note = coalesce(excluded.source_note, bi.source_note),
        status = 'published'
  returning bi.id into v_id;

  return query select v_id, v_key, v_previous;
end
$$;

revoke all on function public.upsert_brand_image(uuid, text, text, text, integer, integer, integer, text, uuid)
  from public;
grant execute on function public.upsert_brand_image(uuid, text, text, text, integer, integer, integer, text, uuid)
  to service_role;

-- ------------------------------------------------------------
-- Verificação (correr depois de aplicar).
--   select public.brand_key('Ben-u-ron'), public.brand_key('BEN U RON');
--   select count(*) from public.stock_confirmed;                -- igual a antes
--   select column_name from information_schema.columns
--    where table_name = 'stock_confirmed' and column_name = 'image_origin';
--   select count(*) from public.drug_brand_images;              -- 0 no arranque
-- ------------------------------------------------------------
