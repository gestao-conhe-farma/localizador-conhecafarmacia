-- ============================================================
-- 0038 · Categorias de produto, reserva opcional e frescura por categoria
--
-- As farmácias vendem mais do que medicamentos (cremes, produtos de
-- bebé, higiene, beleza). Esses produtos entram no MESMO catálogo e
-- na MESMA máquina de stock/reservas — sem tabelas paralelas:
--
--   • drugs.kind — 'medicamento' (omissão) | 'bebe' | 'higiene' |
--     'beleza' | 'outros'. Colunas de medicamento (molécula, dose,
--     receita) continuam opcionais e simplesmente ficam vazias.
--   • stock_items.reservable — por farmácia e por produto: o gerente
--     decide se o item aceita reservas do Localizador (omissão: sim).
--
-- FRESCURA POR CATEGORIA (decisão do owner, 2026-10-20):
--   • medicamento  → visível até 72 h sem confirmação (regra actual,
--     promessa pública do Localizador);
--   • resto        → visível até 30 dias sem confirmação.
-- A venda concluída já renova a frescura (trigger da 0006) — só o
-- produto parado cai do ar.
--
-- O que esta migração toca:
--   1. Colunas novas (com omissões: linhas antigas = medicamento,
--      reservável — nada muda para o que já existe);
--   2. View stock_confirmed recriada FIEL à da 0022 + drug_kind,
--      reservable e o predicado de frescura por categoria;
--   3. pharmacy_stock_counts() (0008) com o MESMO predicado
--      (junta drugs para ler o kind).
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas novas
-- ------------------------------------------------------------
alter table public.drugs
  add column if not exists kind text not null default 'medicamento'
  check (kind in ('medicamento', 'bebe', 'higiene', 'beleza', 'outros'));

create index if not exists drugs_kind_idx on public.drugs (kind);

alter table public.stock_items
  add column if not exists reservable boolean not null default true;

-- ------------------------------------------------------------
-- 2. View stock_confirmed — recriação fiel à 0022, com TRÊS
--    diferenças: drug_kind, reservable e frescura por categoria.
--    (DROP + CREATE: CREATE OR REPLACE não muda colunas — 42P16.)
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
  and (
    (d.kind = 'medicamento' and s.confirmed_at > now() - interval '72 hours')
    or (d.kind <> 'medicamento' and s.confirmed_at > now() - interval '30 days')
  )
  and p.active
  and d.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Contagem pública — o MESMO predicado da view (inclui o join
--    a drugs para ler o kind).
-- ------------------------------------------------------------
create or replace function public.pharmacy_stock_counts()
returns table (pharmacy_slug text, stock_count bigint)
language sql
stable
as $$
  select
    p.slug,
    count(s.id) as stock_count
  from public.pharmacies p
  join public.stock_items s
    on s.pharmacy_id = p.id
   and s.in_stock
   and s.retired_at is null
   and (s.available_from is null or s.available_from <= now())
   and (s.expires_at is null or s.expires_at >= current_date)
  join public.drugs d
    on d.id = s.drug_id
   and d.active
   and (
     (d.kind = 'medicamento' and s.confirmed_at > now() - interval '72 hours')
     or (d.kind <> 'medicamento' and s.confirmed_at > now() - interval '30 days')
   )
  where p.active
  group by p.slug
$$;

grant execute on function public.pharmacy_stock_counts() to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Verificação da própria migração
--    A contagem pública TEM de dar o mesmo que a view (é a mesma
--    regra): se divergirem, a lista de farmácias mostraria um número
--    e a página da farmácia outro — foi exactamente o bug da 0008.
-- ------------------------------------------------------------
do $$
declare
  na_view   bigint;
  na_conta  bigint;
begin
  select count(*) into na_view from public.stock_confirmed;
  select coalesce(sum(t.stock_count), 0) into na_conta
    from public.pharmacy_stock_counts() t;

  -- Aviso e não excepção: a view é security_invoker, por isso uma
  -- sessão sem BYPASSRLS pode contá-la a menos — não é razão para
  -- bloquear a migração, mas fica visível no output.
  if na_conta <> na_view then
    raise warning 'pharmacy_stock_counts (%) diverge de stock_confirmed (%)', na_conta, na_view;
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação (depois de aplicar):
--   select column_name from information_schema.columns
--    where table_name = 'drugs' and column_name = 'kind';
--   select column_name from information_schema.columns
--    where table_name = 'stock_items' and column_name = 'reservable';
--   select count(*) from stock_confirmed;
--   select drug_kind, count(*) from stock_confirmed group by 1;
-- ------------------------------------------------------------
