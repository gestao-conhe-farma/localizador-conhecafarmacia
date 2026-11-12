-- ============================================================
-- 0055 · Idempotência por submissão + mesma ordem de locks no stock
--
-- Duas correcções que pertencem ao mesmo caminho:
--
-- A. RESERVAS DUPLICADAS DO MESMO PEDIDO
--    A 0054 acabou com a dupla venda da última unidade, mas um duplo
--    clique (ou um retry depois de um timeout) com stock suficiente
--    continuava a criar duas reservas iguais. O formulário passa a
--    enviar uma chave por submissão; a mesma chave devolve a reserva
--    já criada em vez de criar outra.
--      • reservations.idempotency_key + índice único parcial com o
--        telefone — a chave sozinha não serve para devolver a reserva
--        de outra pessoa (o telefone tem de bater).
--      • create_reservation: procura a chave antes de tudo; se a
--        inserção colidir (dois pedidos com a mesma chave ao mesmo
--        tempo), apanha unique_violation e devolve a reserva que
--        ganhou.
--
-- B. ORDEM DE LOCKS ENTRE STOCK E LOTES
--    A conclusão de reserva (0053) trava stock_items e depois os
--    lotes. post_stock_change travava os lotes (stock_lot_apply) e só
--    no fim stock_items — ordem inversa, logo possibilidade de
--    deadlock entre uma venda concluída e uma edição de stock.
--    Passa a travar stock_items primeiro (FOR UPDATE) e só depois
--    mexer nos lotes. As duas passagens adquirem os locks na mesma
--    ordem.
--
-- Nota de deploy: a assinatura de create_reservation muda (9 args), por
-- isso a versão de 8 é removida. Pedidos em voo durante a migração
-- podem falhar uma vez (PGRST202); a chave só existe no cliente novo.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0055_idempotency_stock_lock_order.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chave de idempotência da submissão
-- ------------------------------------------------------------
alter table localizador.reservations
  add column if not exists idempotency_key text;

comment on column localizador.reservations.idempotency_key is
  'Chave por submissão do formulário: repetir o mesmo pedido devolve a reserva já criada, não cria outra.';

-- Par (chave, telefone): a mesma chave de outra pessoa não devolve
-- nada. Parcial para não colidir com o histórico sem chave.
create unique index if not exists reservations_idempotency_key_idx
  on localizador.reservations (idempotency_key, requester_phone)
  where idempotency_key is not null;

-- ------------------------------------------------------------
-- 2. create_reservation — 9 args, com replay idempotente
-- ------------------------------------------------------------
drop function if exists localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid);

create or replace function localizador.create_reservation(
  p_stock_item_id   uuid,
  p_name            text,
  p_phone           text,
  p_municipio       text,
  p_quantity        integer,
  p_notes           text,
  p_sale_option_id  uuid,
  p_user_id         uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_qty             integer;
  v_reserved        integer;
  v_in_stock        boolean;
  v_item            record;
  v_unit            text;
  v_pack            integer;
  v_units           integer;
  v_id              uuid;
  v_token           uuid;
  v_key             text;
  v_existing_id     uuid;
  v_existing_token  uuid;
  v_existing_item   uuid;
  v_existing_drug   text;
  v_existing_pharm  text;
  v_existing_unit   text;
  v_existing_pack   integer;
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

  -- Replay: este pedido já foi criado (duplo clique, retry depois de
  -- um timeout). Devolve a MESMA reserva, sem prender outra unidade.
  -- O telefone faz parte da procura: a chave de outra pessoa não dá
  -- acesso ao token dela.
  if v_key is not null then
    select r.id, r.access_token, r.stock_item_id,
           d.name, p.name, o.unit, o.pack_size
      into v_existing_id, v_existing_token, v_existing_item,
           v_existing_drug, v_existing_pharm, v_existing_unit, v_existing_pack
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
        'access_token', v_existing_token,
        'drug_name', v_existing_drug,
        'pharmacy_name', v_existing_pharm,
        'sale_unit', v_existing_unit,
        'sale_pack', v_existing_pack
      );
    end if;
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

  -- A regra da 0054: sem unidades livres, não nasce reserva.
  if v_in_stock is not true then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;
  if v_qty is not null and (v_qty - v_reserved) < v_units then
    return jsonb_build_object('ok', false, 'error', 'INDISPONIVEL');
  end if;

  begin
    insert into localizador.reservations (
      stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
      requester_municipio, quantity, notes, status, sale_option_id, user_id,
      idempotency_key
    ) values (
      p_stock_item_id, v_item.pharmacy_id, v_item.drug_id,
      btrim(p_name), p_phone,
      nullif(btrim(coalesce(p_municipio, '')), ''),
      p_quantity,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'pendente', p_sale_option_id, p_user_id,
      v_key
    )
    returning id, access_token into v_id, v_token;
  exception when unique_violation then
    -- Dois pedidos com a mesma chave entraram ao mesmo tempo: um
    -- inseriu, o outro caiu aqui. Devolve o que ganhou (a reserva e o
    -- incremento de reserved_quantity do outro foram revertidos).
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
    'sale_pack', v_pack
  );
end
$$;

revoke all on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text) from public;
grant execute on function localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text)
  to service_role;

-- ------------------------------------------------------------
-- 3. post_stock_change — o item é travado antes dos lotes
--    Mesma ordem da conclusão de reserva (0053): stock_items →
--    stock_lots. Sem isto, uma venda concluída e uma edição de stock
--    podiam esperar uma pela outra em ciclo (deadlock).
-- ------------------------------------------------------------
create or replace function localizador.post_stock_change(
  p_pharmacy_id  uuid,
  p_drug_id      uuid,
  p_type         text,
  p_delta        integer default null,
  p_set_quantity integer default null,
  p_in_stock     boolean default null,
  p_source       text default 'portal',
  p_reason       text default null,
  p_note         text default null,
  p_source_ref   text default null,
  p_idem         text default null,
  p_staff_id     uuid default null,
  p_lot_number   text default null,
  p_expires_at   date default null,
  p_actor_label  text default null
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_item_id  uuid;
  v_before   integer;
  v_after    integer;
  v_delta    integer;
  v_in_stock boolean;
  v_id       uuid;
  v_dup      boolean := false;
  v_role     text := localizador.request_role();
  v_qty      integer;
  v_lot_id   uuid;
begin
  -- Autorização: service_role (rotas de servidor validadas) ou a própria
  -- farmácia / equipa CF. Um anon nunca chega aqui (sem execute grant).
  if v_role <> 'service_role' then
    if not (localizador.is_admin() or localizador.is_own_pharmacy(p_pharmacy_id)) then
      return jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
    end if;
  end if;

  if p_type not in ('entrada','venda','ajuste','saida','expiracao','devolucao',
                    'importacao','saldo_inicial','reserva','retirada','restauro') then
    return jsonb_build_object('ok', false, 'error', 'TIPO_INVALIDO');
  end if;
  if coalesce(p_set_quantity, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'QUANTIDADE_INVALIDA');
  end if;
  if p_set_quantity is null and p_delta is null then
    return jsonb_build_object('ok', false, 'error', 'SEM_DELTA');
  end if;
  if p_type = 'saida' and coalesce(p_reason, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'MOTIVO_OBRIGATORIO');
  end if;

  -- Idempotência: o mesmo evento não conta duas vezes.
  if p_idem is not null then
    select m.id into v_id
      from localizador.stock_movements m
     where m.pharmacy_id = p_pharmacy_id and m.idempotency_key = p_idem;
    if found then
      select s.quantity into v_qty from localizador.stock_items s where s.id = (
        select m.stock_item_id from localizador.stock_movements m where m.id = v_id
      );
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'movement_id', v_id,
        'quantity', coalesce(v_qty, 0), 'before', null, 'after', coalesce(v_qty, 0), 'delta', 0
      );
    end if;
  end if;

  -- ORDEM DE LOCKS: stock_items primeiro, lotes depois — igual à
  -- conclusão de reserva (0053). A linha pode não existir.
  select s.id, s.quantity, s.in_stock into v_item_id, v_before, v_in_stock
    from localizador.stock_items s
   where s.pharmacy_id = p_pharmacy_id and s.drug_id = p_drug_id
     for update;

  if not found then
    insert into localizador.stock_items (pharmacy_id, drug_id)
      values (p_pharmacy_id, p_drug_id)
      returning id, quantity, in_stock into v_item_id, v_before, v_in_stock;
  end if;

  v_before := coalesce(v_before, 0);

  if p_set_quantity is not null then
    v_after := p_set_quantity;
    v_delta := v_after - v_before;
  else
    v_after := greatest(v_before + p_delta, 0);
    v_delta := v_after - v_before;
  end if;

  -- Estado temos/não temos: explícito quando o chamador o traz; senão
  -- uma entrada liga e um saldo a zero desliga (semântica do portal,
  -- 0006/0012).
  v_in_stock := coalesce(
    p_in_stock,
    case when v_delta > 0 then true
         when v_after = 0 then false
         else coalesce(v_in_stock, v_after > 0) end
  );

  -- Lotes/camadas (0021): o delta entra no lote indicado (entradas) ou
  -- sai dos lotes que expiram primeiro (saídas, FEFO). A linha do item
  -- já está travada por este bloco.
  v_lot_id := localizador.stock_lot_apply(
    v_item_id, v_delta, p_lot_number, p_expires_at, p_source, p_source_ref
  );

  update localizador.stock_items
     set quantity     = v_after,
         in_stock     = v_in_stock,
         confirmed_at = now(),
         source       = coalesce(p_source, 'portal'),
         synced_at    = case when p_source in ('api','csv') then now() else synced_at end,
         source_ref   = coalesce(p_source_ref, source_ref),
         updated_by   = coalesce(auth.uid(), updated_by)
   where id = v_item_id;

  v_id := localizador.log_stock_movement(
    p_pharmacy_id, p_drug_id, v_item_id, p_type, v_delta, v_before, v_after,
    p_source, p_reason, p_note, p_source_ref, p_idem, p_staff_id, auth.uid(),
    p_actor_label, v_lot_id, null
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', v_dup, 'movement_id', v_id,
    'quantity', v_after, 'before', v_before, 'after', v_after, 'delta', v_delta
  );
end
$$;

-- ------------------------------------------------------------
-- 4. Verificação estrutural
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'localizador'
       and indexname = 'reservations_idempotency_key_idx'
  ) then
    raise exception 'índice de idempotência ausente';
  end if;

  if position('idempotency_key' in pg_get_functiondef(
       'localizador.create_reservation(uuid, text, text, text, integer, text, uuid, uuid, text)'::regprocedure
     )) = 0 then
    raise exception 'create_reservation sem idempotency_key';
  end if;

  if position('for update' in lower(pg_get_functiondef(
       'localizador.post_stock_change(uuid, uuid, text, integer, integer, boolean, text, text, text, text, text, uuid, text, date, text)'::regprocedure
     ))) = 0 then
    raise exception 'post_stock_change sem FOR UPDATE (ordem de locks)';
  end if;

  -- Uma reserva antiga sem chave não pode quebrar o índice parcial.
  select count(*) into v_n
    from localizador.reservations
   where idempotency_key is not null;
  raise notice 'reservas com chave de idempotência: %', v_n;
end $$;

-- ------------------------------------------------------------
-- Verificação de concorrência
--   scripts/test-reservation-idempotency.py — mesma chave em paralelo
--     → uma só reserva, mesma id; chave nova → reserva nova.
--   scripts/test-stock-lock-order.py — 5 ajustes simultâneos sem perda
--     e conclusão concorrente com entrada de stock.
-- ------------------------------------------------------------
