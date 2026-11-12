-- ============================================================
-- 0054 · Reservar passa a prender stock (reserved_quantity)
--
-- Até aqui reservar não prendia nada: com 1 unidade em stock, dois
-- pedidos simultâneos criavam duas reservas 'pendente' válidas e a
-- farmácia tinha de recusar uma à mão (o stock só descia ao concluir,
-- 0006). A verificação era um check-then-act em JS: cada chamada
-- PostgREST é a sua própria transacção, pelo que não havia forma de a
-- tornar atómica no Server Action.
--
-- Desenho:
--   • stock_items.reserved_quantity — unidades-base presas por
--     reservas abertas (pendente/confirmada/pronta). É um contador,
--     não uma soma calculada a cada leitura: permite actualização
--     condicional atómica sem agregar reservas em cada pedido.
--   • trg_reservation_hold — mantém o contador em INSERT/UPDATE/
--     DELETE, pela diferença entre o que a reserva prendia e o que
--     prende agora. Fechar (recusada/expirada/concluida) liberta.
--     O nome faz o trigger correr antes do de baixa (ordem
--     alfabética), pelo que na conclusão a unidade é libertada antes
--     de o stock descer.
--   • create_reservation(...) — única porta de criação: trava a linha
--     do item (FOR UPDATE), valida stock_confirmed e a opção de venda
--     e recusa quando quantity - reserved_quantity < unidades
--     pedidas. Dois pedidos concorrentes serializam na linha e o
--     segundo vê o contador já actualizado.
--   • stock_confirmed.available_quantity — o que a UI mostra e limita
--     (quantity - reserved_quantity; null quando a farmácia não
--     reporta quantidade).
--
-- Backfill: as reservas abertas que já existem passam a contar, com a
-- mesma regra de unidades do trigger de conclusão (quantidade ×
-- pack_size da opção de venda).
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0054_reservation_holds.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contador de unidades presas
-- ------------------------------------------------------------
alter table localizador.stock_items
  add column if not exists reserved_quantity integer not null default 0;

alter table localizador.stock_items
  drop constraint if exists stock_items_reserved_quantity_check;
alter table localizador.stock_items
  add constraint stock_items_reserved_quantity_check check (reserved_quantity >= 0);

comment on column localizador.stock_items.reserved_quantity is
  'Unidades-base presas por reservas abertas (pendente/confirmada/pronta). quantity - reserved_quantity é o disponível.';

-- ------------------------------------------------------------
-- 2. Backfill das reservas abertas que já existem
--    Mesma conta do trigger de conclusão: a quantidade da reserva
--    (ou a confirmada, quando existe) vezes o pack_size da opção.
--    Item sem reservas abertas fica a 0. Pode ficar acima de
--    quantity (situação herdada); a criação passa a recusar até
--    haver saldo livre.
-- ------------------------------------------------------------
update localizador.stock_items s
   set reserved_quantity = coalesce((
         select sum(
                  greatest(coalesce(r.confirmed_quantity, r.quantity, 0), 0)
                  * case
                      when r.sale_option_id is null then 1
                      else greatest((
                        select o.pack_size
                          from localizador.stock_sale_options o
                         where o.id = r.sale_option_id
                      ), 1)
                    end
                )
           from localizador.reservations r
          where r.stock_item_id = s.id
            and r.status in ('pendente', 'confirmada', 'pronta')
       ), 0);

-- ------------------------------------------------------------
-- 3. Unidades que uma reserva prende (regra única para backfill,
--    trigger e leitura)
-- ------------------------------------------------------------
create or replace function localizador.reservation_hold_units(
  p_quantity    integer,
  p_confirmed   integer,
  p_sale_option uuid,
  p_status      text
) returns integer
language sql
stable
as $$
  select case
           when p_status in ('pendente', 'confirmada', 'pronta')
           then greatest(coalesce(p_confirmed, p_quantity, 0), 0)
                * greatest((
                    select o.pack_size
                      from localizador.stock_sale_options o
                     where o.id = p_sale_option
                  ), 1)
           else 0
         end
$$;

revoke all on function localizador.reservation_hold_units(integer, integer, uuid, text) from public;

-- ------------------------------------------------------------
-- 4. Trigger que mantém o contador
--    UPDATE aplica só a diferença (o caso comum: pendente →
--    confirmada/pronta não mexe; concluida/recusada/expirada
--    liberta). Mudar de item devolve ao antigo e leva ao novo.
--    DELETE devolve.
-- ------------------------------------------------------------
create or replace function localizador.apply_reservation_hold()
returns trigger
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_old   integer := 0;
  v_new   integer := 0;
  v_delta integer;
begin
  if tg_op <> 'INSERT' then
    v_old := localizador.reservation_hold_units(
      old.quantity, old.confirmed_quantity, old.sale_option_id, old.status
    );
  end if;
  if tg_op <> 'DELETE' then
    v_new := localizador.reservation_hold_units(
      new.quantity, new.confirmed_quantity, new.sale_option_id, new.status
    );
  end if;

  if tg_op = 'DELETE' then
    update localizador.stock_items
       set reserved_quantity = greatest(reserved_quantity - v_old, 0)
     where id = old.stock_item_id;
    return null;
  end if;

  if tg_op = 'UPDATE' and old.stock_item_id is distinct from new.stock_item_id then
    update localizador.stock_items
       set reserved_quantity = greatest(reserved_quantity - v_old, 0)
     where id = old.stock_item_id;
    update localizador.stock_items
       set reserved_quantity = reserved_quantity + v_new
     where id = new.stock_item_id;
    return null;
  end if;

  v_delta := v_new - v_old;
  if v_delta <> 0 then
    update localizador.stock_items
       set reserved_quantity = greatest(reserved_quantity + v_delta, 0)
     where id = new.stock_item_id;
  end if;

  return null;
end
$$;

revoke all on function localizador.apply_reservation_hold() from public;

drop trigger if exists trg_reservation_hold on localizador.reservations;

create trigger trg_reservation_hold
  after insert
     or update of status, quantity, confirmed_quantity, sale_option_id, stock_item_id
     or delete
  on localizador.reservations
  for each row
  execute function localizador.apply_reservation_hold();

-- ------------------------------------------------------------
-- 5. Criação atómica — a única porta que cria reservas
--    O lock da linha do item serializa pedidos concorrentes; a
--    disponibilidade é lida já com o lock preso. A reserva é
--    inserida na mesma transacção e o trigger acima prende as
--    unidades.
-- ------------------------------------------------------------
create or replace function localizador.create_reservation(
  p_stock_item_id  uuid,
  p_name           text,
  p_phone          text,
  p_municipio      text,
  p_quantity       integer,
  p_notes          text,
  p_sale_option_id uuid,
  p_user_id        uuid
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_qty      integer;
  v_reserved integer;
  v_in_stock boolean;
  v_item     record;
  v_unit     text;
  v_pack     integer;
  v_units    integer;
  v_id       uuid;
  v_token    uuid;
begin
  if p_name is null or length(btrim(p_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'NOME_INVALIDO');
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{9,15}$' then
    return jsonb_build_object('ok', false, 'error', 'TELEFONE_INVALIDO');
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    return jsonb_build_object('ok', false, 'error', 'QUANTIDADE_INVALIDA');
  end if;

  -- Ponto de serialização: duas criações concorrentes do mesmo item
  -- esperam aqui uma pela outra.
  select s.quantity, s.reserved_quantity, s.in_stock
    into v_qty, v_reserved, v_in_stock
    from localizador.stock_items s
   where s.id = p_stock_item_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;

  -- O item tem de estar à venda AGORA e aceitar reservas (view da 0038).
  select *
    into v_item
    from localizador.stock_confirmed
   where stock_item_id = p_stock_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;
  if v_item.reservable is not true then
    return jsonb_build_object('ok', false, 'error', 'NAO_RESERVAVEL');
  end if;

  if p_sale_option_id is not null then
    select o.unit, o.pack_size
      into v_unit, v_pack
      from localizador.stock_sale_options o
     where o.id = p_sale_option_id
       and o.stock_item_id = p_stock_item_id
       and o.active;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'OPCAO_INVALIDA');
    end if;
  end if;

  v_units := p_quantity * coalesce(v_pack, 1);

  -- A regra que faltava: sem unidades livres, não nasce reserva.
  if v_in_stock is not true then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;
  if v_qty is not null and (v_qty - v_reserved) < v_units then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;

  insert into localizador.reservations (
    stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
    requester_municipio, quantity, notes, status, sale_option_id, user_id
  ) values (
    p_stock_item_id, v_item.pharmacy_id, v_item.drug_id,
    btrim(p_name), p_phone,
    nullif(btrim(coalesce(p_municipio, '')), ''),
    p_quantity,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'pendente', p_sale_option_id, p_user_id
  )
  returning id, access_token into v_id, v_token;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_id,
    'access_token', v_token,
    'drug_name', v_item.drug_name,
    'pharmacy_name', v_item.pharmacy_name,
    'sale_unit', v_unit,
    'sale_pack', v_pack
  );
end
$$;

revoke all on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid) from public;
grant execute on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid)
  to service_role;

-- ------------------------------------------------------------
-- 6. Vista pública com o disponível real
--    DROP + CREATE (CREATE OR REPLACE não acrescenta colunas). O
--    corpo é fiel ao da 0050, com available_quantity a seguir a
--    quantity.
-- ------------------------------------------------------------
drop view if exists localizador.stock_confirmed;

create view localizador.stock_confirmed
with (security_invoker = true) as
select
  s.id                    as stock_item_id,
  d.id                    as drug_id,
  d.name                  as drug_name,
  d.molecule              as drug_molecule,
  d.form                  as drug_form,
  d.dosage                as drug_dosage,
  d.requires_rx           as drug_requires_rx,
  d.priority              as drug_priority,
  d.kind                  as drug_kind,
  d.category              as drug_category,
  p.id                    as pharmacy_id,
  p.slug                  as pharmacy_slug,
  p.name                  as pharmacy_name,
  p.municipio             as pharmacy_municipio,
  p.address               as pharmacy_address,
  p.lat                   as pharmacy_lat,
  p.lng                   as pharmacy_lng,
  p.maps_url              as pharmacy_maps_url,
  p.phone                 as pharmacy_phone,
  p.whatsapp              as pharmacy_whatsapp,
  p.opening_hours         as pharmacy_opening_hours,
  p.verified              as pharmacy_verified,
  s.quantity,
  -- 0054: o que já está preso por reservas abertas não é oferecido.
  case
    when s.quantity is null then null
    else greatest(s.quantity - s.reserved_quantity, 0)
  end                     as available_quantity,
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
  end                     as image_path,
  coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', o.id,
               'unit', o.unit,
               'pack_size', o.pack_size,
               'price', o.price,
               'is_default', o.is_default
             ) order by o.sort_order, o.unit)
      from localizador.stock_sale_options o
     where o.stock_item_id = s.id and o.active
  ), '[]'::jsonb)         as sale_options,
  s.source,
  s.synced_at,
  floor(extract(epoch from (now() - coalesce(s.synced_at, s.confirmed_at))) / 60)::integer
                          as freshness_minutes,
  case
    when s.prefers_catalogue_image and bi.image_path is not null then 'catalogo'
    when s.image_path is not null then 'farmacia'
    else null
  end                     as image_origin
from localizador.stock_items s
join localizador.pharmacies p on p.id = s.pharmacy_id
join localizador.drugs d      on d.id = s.drug_id
left join localizador.drug_brand_images bi
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

grant select on localizador.stock_confirmed to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Verificação da própria migração
-- ------------------------------------------------------------
do $$
declare
  n integer;
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'localizador.reservations'::regclass
       and tgname = 'trg_reservation_hold'
  ) then
    raise exception 'trigger trg_reservation_hold ausente';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'localizador'
       and table_name = 'stock_confirmed'
       and column_name = 'available_quantity'
  ) then
    raise exception 'stock_confirmed sem available_quantity';
  end if;

  -- Contador coerente com as reservas abertas em toda a base.
  select count(*) into n
    from localizador.stock_items s
    left join (
      select r.stock_item_id,
             sum(localizador.reservation_hold_units(
                   r.quantity, r.confirmed_quantity, r.sale_option_id, r.status
                 )) as units
        from localizador.reservations r
       group by r.stock_item_id
    ) h on h.stock_item_id = s.id
   where s.reserved_quantity <> coalesce(h.units, 0);

  if n > 0 then
    raise exception 'reserved_quantity incoerente em % item(ns) de stock', n;
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação de concorrência
--   scripts/test-reservation-holds.py: 5 pedidos simultâneos para a
--   última unidade → exactamente 1 reserva, 4 INDISPONIVEL;
--   recusar liberta; concluir baixa o stock e liberta.
-- ------------------------------------------------------------
