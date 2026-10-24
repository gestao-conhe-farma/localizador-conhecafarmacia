-- ============================================================
-- 0043 · CATEGORIAS DE PRODUTO E CATÁLOGO DE PARAFARMÁCIA
--
-- PORQUÊ: a homepage passou a mostrar categorias (medicamentos por área
-- clínica) e uma secção de parafarmácia. O modelo da 0038 só tinha o
-- tipo (`drugs.kind`); faltava a categoria dentro de cada tipo e faltava
-- catálogo de parafarmácia — sem produtos, o portal não tinha o que
-- publicar e as secções ficavam vazias.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. `drugs.category` — slug da área clínica (medicamento) ou da
--      subcategoria de parafarmácia, com CHECK que amarra o slug ao kind;
--   2. backfill das categorias dos medicamentos que já existem;
--   3. catálogo de parafarmácia (bebé, higiene, beleza, outros);
--   4. stock de DEMONSTRAÇÃO desses produtos em todas as farmácias
--      activas, com preços de exemplo — é o que enche as secções da
--      homepage hoje. As farmácias substituem pelo stock real no portal
--      (o preço e a confirmação ficam por cima destes valores);
--   5. view `stock_confirmed` recriada FIEL à 0040 + `drug_category`.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0043_categorias_e_parafarmacia.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna e CHECK por tipo
-- ------------------------------------------------------------
alter table public.drugs
  add column if not exists category text;

alter table public.drugs
  drop constraint if exists drugs_category_check;

alter table public.drugs
  add constraint drugs_category_check check (
    category is null
    or case kind
         when 'medicamento' then category in (
           'dor-febre', 'gripe-tosse', 'digestivo', 'alergia',
           'antibioticos', 'cronicos', 'pele', 'outros-clinicos'
         )
         when 'bebe' then category in (
           'fraldas', 'biberoes', 'alimentacao-bebe', 'cuidados-bebe'
         )
         when 'higiene' then category in (
           'higiene-oral', 'banho-corpo', 'cuidados-intimos', 'desinfeccao'
         )
         when 'beleza' then category in (
           'cuidados-pele', 'protecao-solar', 'maquilhagem', 'perfumaria'
         )
         else category in (
           'primeiros-socorros', 'testes', 'ortopedia', 'sexualidade'
         )
       end
  );

create index if not exists drugs_category_idx
  on public.drugs (kind, category) where category is not null;

-- ------------------------------------------------------------
-- 2. Categorias dos medicamentos que já existem
--    (quem não estiver na lista fica sem categoria — a homepage só
--     mostra áreas com stock, por isso não aparece um card vazio.)
-- ------------------------------------------------------------
update public.drugs
   set category = case lower(name)
                    when 'paracetamol'        then 'dor-febre'
                    when 'ibuprofeno'         then 'dor-febre'
                    when 'naproxeno'          then 'dor-febre'
                    when 'amoxicilina'        then 'antibioticos'
                    when 'azitromicina'       then 'antibioticos'
                    when 'ceftriaxona'        then 'antibioticos'
                    when 'loratadina'         then 'alergia'
                    when 'omeprazol'          then 'digestivo'
                    when 'metformina'         then 'cronicos'
                    when 'hidroclorotiazida'  then 'cronicos'
                    when 'carbamazepina'      then 'cronicos'
                    else category
                  end
 where kind = 'medicamento';

-- ------------------------------------------------------------
-- 3. Catálogo de parafarmácia
--    form/dosage sempre preenchidos: o UNIQUE de drugs é
--    (name, form, dosage) e NULLs não colidem — sem isto, reexecutar a
--    migração duplicava o catálogo.
-- ------------------------------------------------------------
insert into public.drugs (name, form, dosage, kind, category, requires_rx, priority)
values
  -- bebé
  ('Fraldas Dodot Sensitive', 'pacote', 'T3', 'bebe', 'fraldas', false, 'normal'),
  ('Fraldas Huggies Ultra Confort', 'pacote', 'T4', 'bebe', 'fraldas', false, 'normal'),
  ('Toalhitas Dodot Aqua', 'embalagem', '56 unidades', 'bebe', 'cuidados-bebe', false, 'normal'),
  ('Biberão Nuby', 'unidade', '250 ml', 'bebe', 'biberoes', false, 'normal'),
  ('Leite NAN 1', 'lata', '400 g', 'bebe', 'alimentacao-bebe', false, 'normal'),
  ('Pomada Bepanthene', 'bisnaga', '30 g', 'bebe', 'cuidados-bebe', false, 'normal'),
  -- higiene
  ('Pasta de dentes Colgate Total', 'bisnaga', '75 ml', 'higiene', 'higiene-oral', false, 'normal'),
  ('Escova de dentes Oral-B', 'unidade', 'média', 'higiene', 'higiene-oral', false, 'normal'),
  ('Gel de banho Dove', 'frasco', '250 ml', 'higiene', 'banho-corpo', false, 'normal'),
  ('Desodorizante Rexona', 'roll-on', '50 ml', 'higiene', 'banho-corpo', false, 'normal'),
  ('Sabonete Protex', 'unidade', '90 g', 'higiene', 'banho-corpo', false, 'normal'),
  ('Álcool etílico 70%', 'frasco', '500 ml', 'higiene', 'desinfeccao', false, 'normal'),
  -- beleza
  ('Creme Nivea', 'boião', '150 ml', 'beleza', 'cuidados-pele', false, 'normal'),
  ('Gel de limpeza facial Neutrogena', 'frasco', '150 ml', 'beleza', 'cuidados-pele', false, 'normal'),
  ('Protector solar Nivea Sun FPS 50', 'frasco', '200 ml', 'beleza', 'protecao-solar', false, 'normal'),
  ('Batom Matte Essence', 'unidade', '3,5 g', 'beleza', 'maquilhagem', false, 'normal'),
  ('Perfume Essência Orquídea', 'frasco', '50 ml', 'beleza', 'perfumaria', false, 'normal'),
  -- outros
  ('Soro fisiológico', 'frasco', '500 ml', 'outros', 'primeiros-socorros', false, 'normal'),
  ('Compressas esterilizadas', 'pacote', '10 unidades', 'outros', 'primeiros-socorros', false, 'normal'),
  ('Teste de gravidez', 'unidade', '1 teste', 'outros', 'testes', false, 'normal'),
  ('Preservativos Durex', 'caixa', '3 unidades', 'outros', 'sexualidade', false, 'normal')
on conflict (name, form, dosage) do update
  set kind = excluded.kind,
      category = excluded.category,
      active = true;

-- ------------------------------------------------------------
-- 4. Stock de demonstração nas farmácias activas
--    Preços em kwanzas, só para as secções não nascerem vazias. A
--    farmácia sobrepõe no portal (mesma linha: pharmacy_id + drug_id).
-- ------------------------------------------------------------
insert into public.stock_items (pharmacy_id, drug_id, in_stock, quantity, price, confirmed_at)
select p.id, d.id, true, v.quantity, v.price, now()
  from public.pharmacies p
  join (
    values
      ('Fraldas Dodot Sensitive', 'pacote', 'T3', 24, 7500.00),
      ('Fraldas Huggies Ultra Confort', 'pacote', 'T4', 18, 8900.00),
      ('Toalhitas Dodot Aqua', 'embalagem', '56 unidades', 30, 2400.00),
      ('Biberão Nuby', 'unidade', '250 ml', 12, 3200.00),
      ('Leite NAN 1', 'lata', '400 g', 10, 9800.00),
      ('Pomada Bepanthene', 'bisnaga', '30 g', 15, 3500.00),
      ('Pasta de dentes Colgate Total', 'bisnaga', '75 ml', 40, 1900.00),
      ('Escova de dentes Oral-B', 'unidade', 'média', 35, 1200.00),
      ('Gel de banho Dove', 'frasco', '250 ml', 22, 2800.00),
      ('Desodorizante Rexona', 'roll-on', '50 ml', 28, 2100.00),
      ('Sabonete Protex', 'unidade', '90 g', 60, 700.00),
      ('Álcool etílico 70%', 'frasco', '500 ml', 45, 1500.00),
      ('Creme Nivea', 'boião', '150 ml', 20, 3900.00),
      ('Gel de limpeza facial Neutrogena', 'frasco', '150 ml', 10, 4500.00),
      ('Protector solar Nivea Sun FPS 50', 'frasco', '200 ml', 14, 8900.00),
      ('Batom Matte Essence', 'unidade', '3,5 g', 16, 2500.00),
      ('Perfume Essência Orquídea', 'frasco', '50 ml', 6, 12000.00),
      ('Soro fisiológico', 'frasco', '500 ml', 50, 900.00),
      ('Compressas esterilizadas', 'pacote', '10 unidades', 40, 1100.00),
      ('Teste de gravidez', 'unidade', '1 teste', 25, 2500.00),
      ('Preservativos Durex', 'caixa', '3 unidades', 30, 1800.00)
  ) as v(name, form, dosage, quantity, price) on true
  join public.drugs d
    on d.name = v.name and d.form = v.form and d.dosage = v.dosage
 where p.active
on conflict (pharmacy_id, drug_id) do update
  set in_stock = true,
      quantity = excluded.quantity,
      price = excluded.price,
      confirmed_at = now();

-- ------------------------------------------------------------
-- 5. stock_confirmed — recriação FIEL à 0040 + drug_category
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
  d.category      as drug_category,
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

comment on column public.stock_confirmed.drug_category is
  'Área clínica (medicamento) ou subcategoria de parafarmácia — ver 0043.';

-- ------------------------------------------------------------
-- 6. Verificação
-- ------------------------------------------------------------
do $$
declare
  v_sem_categoria int;
  v_para int;
  v_farmacias_com_para int;
begin
  select count(*) into v_sem_categoria
    from public.drugs
   where kind = 'medicamento' and category is null;

  select count(*) into v_para
    from public.drugs
   where kind <> 'medicamento';

  select count(distinct s.pharmacy_id) into v_farmacias_com_para
    from public.stock_items s
    join public.drugs d on d.id = s.drug_id
   where d.kind <> 'medicamento' and s.in_stock;

  if v_para = 0 then
    raise exception '0043: catálogo de parafarmácia vazio';
  end if;

  raise notice '0043: % medicamento(s) sem área, % produto(s) de parafarmácia, % farmácia(s) com parafarmácia publicada',
    v_sem_categoria, v_para, v_farmacias_com_para;
end $$;
