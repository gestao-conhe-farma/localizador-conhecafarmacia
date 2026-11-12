-- ============================================================
-- 0057 · P3: agenda de levantamento com capacidade por janela
--
-- A janela de levantamento vivia como texto no início das notas
-- («Levantamento: Hoje · 14:00–16:00 | nota»), sem nada que a
-- validasse ou limitasse. Passa a ser dado:
--
--   • reservations.pickup_at — o dia/hora escolhidos pelo cliente;
--   • pharmacies.pickup_slot_minutes — tamanho do bloco (omissão 60);
--   • pharmacies.pickup_slot_capacity — reservas abertas por bloco
--     (omissão 5).
--
-- create_reservation passa a exigir pickup_at (futuro, até 14 dias),
-- calcula o bloco, trava-o com um advisory lock por (farmácia, bloco)
-- e conta as reservas abertas antes de inserir. Dois pedidos
-- simultâneos para a última vaga serializam e o segundo recebe
-- JANELA_CHEIA.
--
-- Os blocos são calculados por epoch (múltiplos de slot_minutes). Angola
-- é UTC+1 sem horário de verão, por isso o bloco alinha com a hora local
-- (:00 / :30).
--
-- Notas antigas continuam legíveis (o acompanhamento e o portal caem
-- para o texto «Levantamento: …» quando pickup_at é null); reservas
-- novas já não escrevem o levantamento em notes.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0057_pickup_agenda.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Configuração da agenda por farmácia
-- ------------------------------------------------------------
alter table localizador.pharmacies
  add column if not exists pickup_slot_minutes integer not null default 60,
  add column if not exists pickup_slot_capacity integer not null default 5;

alter table localizador.pharmacies
  drop constraint if exists pharmacies_pickup_slot_minutes_check;
alter table localizador.pharmacies
  add constraint pharmacies_pickup_slot_minutes_check
  check (pickup_slot_minutes between 15 and 240);

alter table localizador.pharmacies
  drop constraint if exists pharmacies_pickup_slot_capacity_check;
alter table localizador.pharmacies
  add constraint pharmacies_pickup_slot_capacity_check
  check (pickup_slot_capacity between 1 and 100);

comment on column localizador.pharmacies.pickup_slot_minutes is
  'Duração do bloco de levantamento, em minutos (0057).';
comment on column localizador.pharmacies.pickup_slot_capacity is
  'Reservas abertas aceites por bloco de levantamento (0057).';

-- ------------------------------------------------------------
-- 2. Coluna do levantamento + índice da contagem por bloco
-- ------------------------------------------------------------
alter table localizador.reservations
  add column if not exists pickup_at timestamptz;

comment on column localizador.reservations.pickup_at is
  'Dia/hora de levantamento escolhidos pelo cliente. Null em reservas anteriores à 0057 (o texto vive em notes).';

create index if not exists reservations_pickup_idx
  on localizador.reservations (pharmacy_id, pickup_at)
  where status in ('pendente', 'confirmada', 'pronta');

-- ------------------------------------------------------------
-- 3. create_reservation — 10 args, com validação e capacidade
-- ------------------------------------------------------------
drop function if exists localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text);

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
  p_pickup_at       timestamptz
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

  -- Agenda (0057): futura e dentro do horizonte de 14 dias da UI.
  if p_pickup_at is null
     or p_pickup_at < now()
     or p_pickup_at > now() + interval '14 days' then
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
      idempotency_key, pickup_at
    ) values (
      p_stock_item_id, v_item.pharmacy_id, v_item.drug_id,
      btrim(p_name), p_phone,
      nullif(btrim(coalesce(p_municipio, '')), ''),
      p_quantity,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'pendente', p_sale_option_id, p_user_id,
      v_key, p_pickup_at
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
    'pickup_at', p_pickup_at
  );
end
$$;

revoke all on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz) from public;
grant execute on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz)
  to service_role;

-- ------------------------------------------------------------
-- 4. Acompanhamento público devolve o levantamento
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
-- 5. Verificação
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'localizador' and table_name = 'reservations'
       and column_name = 'pickup_at'
  ) then
    raise exception 'reservations.pickup_at ausente';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'localizador' and indexname = 'reservations_pickup_idx'
  ) then
    raise exception 'índice reservations_pickup_idx ausente';
  end if;

  if position('pickup_at' in pg_get_functiondef(
       'localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz)'::regprocedure
     )) = 0 then
    raise exception 'create_reservation sem pickup_at';
  end if;

  if position('pg_advisory_xact_lock' in pg_get_functiondef(
       'localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text, timestamptz)'::regprocedure
     )) = 0 then
    raise exception 'create_reservation sem lock da janela';
  end if;

  if position('pickup_at' in pg_get_functiondef(
       'localizador.get_reservation_status(uuid, uuid)'::regprocedure
     )) = 0 then
    raise exception 'get_reservation_status sem pickup_at';
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação de concorrência
--   scripts/test-pickup-capacity.py — 4 pedidos para a mesma janela,
--   capacidade 2 → 2 aceites e 2 JANELA_CHEIA; janela diferente aceita;
--   datas inválidas recusadas.
-- ------------------------------------------------------------
