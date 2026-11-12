-- ============================================================
-- 0060 · A janela de levantamento tem fim — e a lotação é visível
--
-- Duas pontas soltas da 0057:
--
--   1. A capacidade por bloco (`pickup_slot_capacity`) existia na
--      base e ninguém a via: o cliente escolhia uma hora sem saber
--      se estava cheia (só descobria no JANELA_CHEIA) e a farmácia
--      não tinha onde ler a ocupação. Nova RPC
--      `pickup_availability` devolve, por instante pedido, o bloco,
--      a capacidade e as reservas abertas — só contagens, nada de
--      dados de clientes.
--
--   2. O cliente escolhia `14:00–16:00` mas só `pickup_at` era
--      gravado: o fim da janela morria no formulário. Passa a haver
--      `reservations.pickup_until`, gravado pela mesma transacção.
--      O fim é o compromisso real: o cancelamento do cliente e o
--      no-show passam a contar a partir dele (com fallback para
--      `pickup_at` nas reservas antigas), e todas as superfícies
--      mostram o intervalo.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0060_pickup_window_end_and_availability.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Fim da janela
-- ------------------------------------------------------------
alter table localizador.reservations
  add column if not exists pickup_until timestamptz;

comment on column localizador.reservations.pickup_until is
  'Fim da janela de levantamento escolhida (0060). Null nas reservas da 0057–0059: o compromisso é pickup_at.';

create index if not exists reservations_open_until_idx
  on localizador.reservations (pharmacy_id, pickup_until)
  where status in ('pendente', 'confirmada', 'pronta');

-- ------------------------------------------------------------
-- 2. Lotação das janelas (leitura pública, só contagens)
-- ------------------------------------------------------------
create or replace function localizador.pickup_availability(
  p_stock_item_id uuid,
  p_starts        timestamptz[]
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public
as $$
declare
  v_pharmacy  uuid;
  v_minutes   integer;
  v_capacity  integer;
  v_start     timestamptz;
  v_slot      timestamptz;
  v_booked    integer;
  v_out       jsonb := '[]'::jsonb;
begin
  if p_stock_item_id is null or p_starts is null
     or array_length(p_starts, 1) is null then
    return '[]'::jsonb;
  end if;
  -- Um pedido não pode pedir a agenda inteira: a UI manda as 3 janelas
  -- do dia. O limite é generoso e fecha a porta a scans.
  if array_length(p_starts, 1) > 40 then
    return jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALIDO');
  end if;

  select s.pharmacy_id, ph.pickup_slot_minutes, ph.pickup_slot_capacity
    into v_pharmacy, v_minutes, v_capacity
    from localizador.stock_items s
    join localizador.pharmacies ph on ph.id = s.pharmacy_id
   where s.id = p_stock_item_id;

  if not found then
    return '[]'::jsonb;
  end if;

  v_minutes  := greatest(coalesce(v_minutes, 60), 15);
  v_capacity := greatest(coalesce(v_capacity, 5), 1);

  foreach v_start in array p_starts loop
    if v_start is null then
      continue;
    end if;

    -- O mesmo bloco que create_reservation conta (0057): alinhado por
    -- epoch, que em Angola (UTC+1, sem DST) cai na hora local certa.
    v_slot := to_timestamp(
      floor(extract(epoch from v_start) / (v_minutes * 60)) * (v_minutes * 60)
    );

    select count(*)
      into v_booked
      from localizador.reservations r
     where r.pharmacy_id = v_pharmacy
       and r.status in ('pendente', 'confirmada', 'pronta')
       and r.pickup_at >= v_slot
       and r.pickup_at < v_slot + make_interval(mins => v_minutes);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'at',       v_start,
      'slot',     v_slot,
      'minutes',  v_minutes,
      'capacity', v_capacity,
      'booked',   v_booked,
      'free',     greatest(v_capacity - v_booked, 0)
    ));
  end loop;

  return v_out;
end
$$;

revoke all on function localizador.pickup_availability(uuid, timestamptz[]) from public;
grant execute on function localizador.pickup_availability(uuid, timestamptz[])
  to anon, authenticated, service_role;

comment on function localizador.pickup_availability(uuid, timestamptz[]) is
  'Ocupação dos blocos de levantamento de um item (0060): capacidade, reservas abertas e vagas. Só contagens.';

-- ------------------------------------------------------------
-- 3. create_reservation — 11 args, com fim de janela
-- ------------------------------------------------------------
drop function if exists localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz);

create or replace function localizador.create_reservation(
  p_stock_item_id   uuid,
  p_name            text,
  p_phone           text,
  p_municipio       text,
  p_quantity        integer,
  p_notes           text,
  p_sale_option_id  uuid,
  p_user_id         uuid,
  p_idempotency_key text,
  p_pickup_at       timestamptz,
  p_pickup_until    timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_qty           integer;
  v_reserved      integer;
  v_in_stock      boolean;
  v_item          record;
  v_unit          text;
  v_pack          integer;
  v_units         integer;
  v_id            uuid;
  v_token         uuid;
  v_key           text;
  v_existing_id   uuid;
  v_existing_tok  uuid;
  v_existing_item uuid;
  v_existing_drug text;
  v_existing_ph   text;
  v_existing_unit text;
  v_existing_pack integer;
  v_slot_minutes  integer;
  v_capacity      integer;
  v_slot          timestamptz;
  v_booked        integer;
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

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is not null and v_key !~ '^[A-Za-z0-9._:-]{8,64}$' then
    return jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALIDO');
  end if;

  -- Replay: o mesmo pedido (duplo clique, retry) devolve a reserva já
  -- criada, sem gastar outra unidade nem outra vaga.
  if v_key is not null then
    select r.id, r.access_token, r.stock_item_id,
           d.name, p.name, o.unit, o.pack_size
      into v_existing_id, v_existing_tok, v_existing_item,
           v_existing_drug, v_existing_ph, v_existing_unit, v_existing_pack
      from localizador.reservations r
      join localizador.drugs d      on d.id = r.drug_id
      join localizador.pharmacies p on p.id = r.pharmacy_id
      left join localizador.stock_sale_options o on o.id = r.sale_option_id
     where r.idempotency_key = v_key
       and r.requester_phone = p_phone;

    if found then
      if v_existing_item <> p_stock_item_id then
        return jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALIDO');
      end if;
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'reservation_id', v_existing_id,
        'access_token', v_existing_tok,
        'drug_name', v_existing_drug,
        'pharmacy_name', v_existing_ph,
        'sale_unit', v_existing_unit,
        'sale_pack', v_existing_pack
      );
    end if;
  end if;

  -- Agenda: futura e dentro do horizonte de 14 dias da UI.
  if p_pickup_at is null
     or p_pickup_at < now()
     or p_pickup_at > now() + interval '14 days' then
    return jsonb_build_object('ok', false, 'error', 'HORARIO_INVALIDO');
  end if;

  -- Fim da janela (0060): depois do início, no máximo 4 h (a UI sugere
  -- 2 h) e dentro do mesmo horizonte. Um valor fora disto é pedido
  -- adulterado, não uma janela.
  if p_pickup_until is not null
     and (
       p_pickup_until <= p_pickup_at
       or p_pickup_until > p_pickup_at + interval '4 hours'
       or p_pickup_until > now() + interval '14 days'
     ) then
    return jsonb_build_object('ok', false, 'error', 'HORARIO_INVALIDO');
  end if;

  -- Ponto de serialização do stock: duas criações concorrentes do mesmo
  -- item esperam aqui uma pela outra.
  select s.quantity, s.reserved_quantity, s.in_stock
    into v_qty, v_reserved, v_in_stock
    from localizador.stock_items s
   where s.id = p_stock_item_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;

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

  if v_in_stock is not true then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;
  if v_qty is not null and (v_qty - v_reserved) < v_units then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;

  -- Capacidade da janela: lock por (farmácia, bloco) antes de contar.
  select ph.pickup_slot_minutes, ph.pickup_slot_capacity
    into v_slot_minutes, v_capacity
    from localizador.pharmacies ph
   where ph.id = v_item.pharmacy_id;

  v_slot_minutes := greatest(coalesce(v_slot_minutes, 60), 15);
  v_capacity     := greatest(coalesce(v_capacity, 5), 1);

  v_slot := to_timestamp(
    floor(extract(epoch from p_pickup_at) / (v_slot_minutes * 60)) * (v_slot_minutes * 60)
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'pickup:' || v_item.pharmacy_id::text || ':' || v_slot::text, 0
  ));

  select count(*)
    into v_booked
    from localizador.reservations r
   where r.pharmacy_id = v_item.pharmacy_id
     and r.status in ('pendente', 'confirmada', 'pronta')
     and r.pickup_at >= v_slot
     and r.pickup_at < v_slot + make_interval(mins => v_slot_minutes);

  if v_booked >= v_capacity then
    return jsonb_build_object('ok', false, 'error', 'JANELA_CHEIA');
  end if;

  begin
    insert into localizador.reservations (
      stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
      requester_municipio, quantity, notes, status, sale_option_id, user_id,
      idempotency_key, pickup_at, pickup_until
    ) values (
      p_stock_item_id, v_item.pharmacy_id, v_item.drug_id,
      btrim(p_name), p_phone,
      nullif(btrim(coalesce(p_municipio, '')), ''),
      p_quantity,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'pendente', p_sale_option_id, p_user_id,
      v_key, p_pickup_at, p_pickup_until
    )
    returning id, access_token into v_id, v_token;
  exception when unique_violation then
    select r.id, r.access_token
      into v_id, v_token
      from localizador.reservations r
     where r.idempotency_key = v_key
       and r.requester_phone = p_phone;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALIDO');
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'reservation_id', v_id,
      'access_token', v_token,
      'drug_name', v_item.drug_name,
      'pharmacy_name', v_item.pharmacy_name,
      'sale_unit', v_unit,
      'sale_pack', v_pack
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reservation_id', v_id,
    'access_token', v_token,
    'drug_name', v_item.drug_name,
    'pharmacy_name', v_item.pharmacy_name,
    'sale_unit', v_unit,
    'sale_pack', v_pack,
    'pickup_at', p_pickup_at,
    'pickup_until', p_pickup_until
  );
end
$$;

revoke all on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz, timestamptz)
  to service_role;

-- ------------------------------------------------------------
-- 4. Acompanhamento devolve o fim da janela
-- ------------------------------------------------------------
create or replace function localizador.get_reservation_status(p_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
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
    'pickup_at', r.pickup_at,
    'pickup_until', r.pickup_until,
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
  from localizador.reservations r
  join localizador.drugs d on d.id = r.drug_id
  join localizador.pharmacies p on p.id = r.pharmacy_id
  left join localizador.stock_sale_options o on o.id = r.sale_option_id
  left join localizador.stock_items s on s.id = r.stock_item_id
  left join localizador.drug_brand_images bi
    on bi.drug_id = s.drug_id
   and bi.brand_key = s.brand_key
   and bi.status = 'published'
  where r.id = p_id
    and r.access_token = p_token;

  return result;
end
$$;

revoke all on function localizador.get_reservation_status(uuid, uuid) from public;
grant execute on function localizador.get_reservation_status(uuid, uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Cancelamento: o prazo é o FIM da janela (fallback pickup_at)
-- ------------------------------------------------------------
create or replace function localizador.cancel_reservation(
  p_id    uuid,
  p_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public
as $$
declare
  v_status text;
  v_until  timestamptz;
begin
  if p_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'error', 'NAO_ENCONTRADO');
  end if;

  -- FOR UPDATE: serializa com o portal e com dois cliques.
  select r.status, coalesce(r.pickup_until, r.pickup_at)
    into v_status, v_until
    from localizador.reservations r
   where r.id = p_id
     and r.access_token = p_token
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NAO_ENCONTRADO');
  end if;

  if v_status = 'cancelada' then
    return jsonb_build_object(
      'ok', true, 'status', 'cancelada', 'idempotent', true
    );
  end if;

  if v_status not in ('pendente', 'confirmada', 'pronta') then
    return jsonb_build_object(
      'ok', false, 'error', 'NAO_CANCELAVEL', 'status', v_status
    );
  end if;

  -- A janela já fechou: a farmácia conta com a pessoa ao balcão. A
  -- saída é falar com eles (ou o cron fechar como não levantada).
  if v_status <> 'pendente'
     and v_until is not null
     and v_until <= now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'NAO_CANCELAVEL',
      'status', v_status,
      'causa', 'fora_do_prazo'
    );
  end if;

  update localizador.reservations
     set status      = 'cancelada',
         reason      = 'cancelado_cliente',
         resolved_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true, 'status', 'cancelada', 'idempotent', false
  );
end
$$;

revoke all on function localizador.cancel_reservation(uuid, uuid) from public;
grant execute on function localizador.cancel_reservation(uuid, uuid)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 6. No-show: 24 h depois do fim da janela (fallback pickup_at)
-- ------------------------------------------------------------
create or replace function localizador.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = localizador, public
as $$
declare
  v_closed integer;
begin
  with closed as (
    update localizador.reservations r
       set status      = 'expirada',
           reason      = case
                           when r.status = 'pendente'
                                and r.expires_at is not null
                                and r.expires_at < now() then 'ttl'
                           when r.status = 'pendente' then 'pickup_vencido'
                           else 'nao_levantada'
                         end,
           resolved_at = now()
     where (
       r.status = 'pendente'
       and (
         (r.expires_at is not null and r.expires_at < now())
         or (coalesce(r.pickup_until, r.pickup_at) is not null
             and coalesce(r.pickup_until, r.pickup_at) < now() - interval '2 hours')
       )
     )
     or (
       r.status in ('confirmada', 'pronta')
       and coalesce(r.pickup_until, r.pickup_at) is not null
       and coalesce(r.pickup_until, r.pickup_at) < now() - interval '24 hours'
     )
     returning 1
  )
  select count(*) into v_closed from closed;

  return v_closed;
end
$$;

revoke all on function localizador.expire_reservations()
  from public, anon, authenticated;
grant execute on function localizador.expire_reservations() to service_role;

comment on column localizador.reservations.status is
  'pendente → confirmada | recusada | expirada | cancelada (cliente); confirmada → pronta | recusada | cancelada (cliente, até ao fim da janela); pronta → concluida | recusada | cancelada (cliente, até ao fim da janela). expirada cobre ttl, pickup_vencido e nao_levantada.';

-- ------------------------------------------------------------
-- 7. Verificação
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'localizador' and table_name = 'reservations'
       and column_name = 'pickup_until'
  ) then
    raise exception 'reservations.pickup_until ausente';
  end if;

  if position('pickup_until' in pg_get_functiondef(
       'localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz, timestamptz)'::regprocedure
     )) = 0 then
    raise exception 'create_reservation sem pickup_until';
  end if;

  if position('pickup_until' in pg_get_functiondef(
       'localizador.get_reservation_status(uuid, uuid)'::regprocedure
     )) = 0 then
    raise exception 'get_reservation_status sem pickup_until';
  end if;

  if position('coalesce(r.pickup_until, r.pickup_at)' in pg_get_functiondef(
       'localizador.cancel_reservation(uuid, uuid)'::regprocedure
     )) = 0 then
    raise exception 'cancel_reservation não usa o fim da janela';
  end if;

  if position('coalesce(r.pickup_until, r.pickup_at)' in pg_get_functiondef(
       'localizador.expire_reservations()'::regprocedure
     )) = 0 then
    raise exception 'expire_reservations não usa o fim da janela';
  end if;

  if not has_function_privilege(
       'anon',
       'localizador.pickup_availability(uuid, timestamptz[])',
       'execute'
     ) then
    raise exception 'anon sem execute em pickup_availability';
  end if;

  if has_function_privilege('anon', 'localizador.expire_reservations()', 'execute') then
    raise exception 'anon não pode executar expire_reservations';
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- Verificação funcional
--   scripts/test-pickup-window.py — fim da janela gravado e devolvido,
--   fim inválido recusado, lotação por bloco (livre/cheia), anon pode
--   ler a lotação, cancelamento dentro da janela e no-show 24 h depois
--   do fim.
-- ------------------------------------------------------------
