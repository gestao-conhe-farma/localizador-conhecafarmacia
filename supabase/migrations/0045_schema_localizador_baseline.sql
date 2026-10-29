-- Baseline do schema localizador no projecto Supabase principal.
-- Gerado com pg_dump --schema=public --schema-only --no-owner --no-privileges
-- a partir da base viva do Localizador (2026-10-29) e reescrito para o
-- schema localizador. Ver docs/2026-10-28-contas-utilizador-partilhadas.md §2.
--
-- Não editar à mão: é a fotografia da base na altura da fusão. Alterações
-- novas vão em migrações próprias (0046+).

create schema if not exists localizador;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'localizador, public, extensions', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: api_rate_consume(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.api_rate_consume(p_key_id uuid, p_limit integer, p_window_seconds integer DEFAULT 60) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_window timestamptz;
  v_hits   integer;
  v_retry  integer;
begin
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'api_rate_consume: parâmetros inválidos';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into localizador.api_rate_windows (api_key_id, window_start, hits)
  values (p_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
    do update set hits = localizador.api_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista (2% dos pedidos): as janelas antigas não servem
  -- para nada e esta tabela é escrita em todos os pedidos.
  if random() < 0.02 then
    delete from localizador.api_rate_windows where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end;
$$;


--
-- Name: apply_reservation_stock_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.apply_reservation_stock_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  current_qty integer;
  taken       integer;
  new_qty     integer;
begin
  -- Só a transição PARA 'concluida' (nunca baixa duas vezes).
  if new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;

  select s.quantity into current_qty
    from localizador.stock_items s
   where s.id = new.stock_item_id;

  if not found then
    return new;
  end if;

  -- Sem quantidade reportada não há o que baixar (semântica da 0006).
  if current_qty is null then
    update localizador.stock_items
       set confirmed_at = now(),
           updated_by   = auth.uid()
     where id = new.stock_item_id;
    return new;
  end if;

  if new.sale_option_id is not null then
    taken := greatest(
      coalesce(new.confirmed_quantity, new.quantity, 0), 0
    ) * greatest(
      (select o.pack_size from localizador.stock_sale_options o
        where o.id = new.sale_option_id), 1
    );
  else
    taken := greatest(coalesce(new.confirmed_quantity, new.quantity, 0), 0);
  end if;

  new_qty := greatest(current_qty - taken, 0);

  -- Lotes (0021): a baixa sai primeiro dos lotes que expiram mais cedo.
  perform localizador.stock_lot_apply(
    new.stock_item_id, -(current_qty - new_qty), null, null, 'portal', new.id::text
  );

  update localizador.stock_items
     set quantity     = new_qty,
         in_stock     = case when new_qty <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id;

  perform localizador.log_stock_movement(
    new.pharmacy_id, new.drug_id, new.stock_item_id, 'venda',
    -(current_qty - new_qty), current_qty, new_qty,
    'portal', 'reserva concluída', new.notes, new.id::text, null,
    new.handled_by, auth.uid(), null, null,
    jsonb_build_object(
      'unidades_vendidas', current_qty - new_qty,
      'sale_option_id', new.sale_option_id
    )
  );

  return new;
end;
$$;


--
-- Name: brand_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.brand_key(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
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


--
-- Name: FUNCTION brand_key(t text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION localizador.brand_key(t text) IS 'Normaliza a marca para a chave de correspondência da imagem de catálogo (minúsculas, sem acentos nem pontuação).';


--
-- Name: can_write_drug_image(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.can_write_drug_image(path text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  pid uuid;
begin
  if path is null or path = '' then
    return false;
  end if;
  -- Prefixo malformado (não-uuid) nega em vez de rebentar: um erro de
  -- cast na policy seria um deny opaco na mesma, mas assim fica legível.
  begin
    pid := (storage.foldername(path))[1]::uuid;
  exception when others then
    return false;
  end;
  return localizador.is_admin() or localizador.is_own_pharmacy(pid);
end
$$;


--
-- Name: catalogue_image_for(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.catalogue_image_for(p_drug_id uuid, p_brand text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select bi.image_path
    from localizador.drug_brand_images bi
   where bi.drug_id = p_drug_id
     and bi.brand_key = localizador.brand_key(p_brand)
     and bi.status = 'published'
   limit 1
$$;


--
-- Name: drug_brand_images_before_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.drug_brand_images_before_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.brand_key := localizador.brand_key(new.brand_label);
  new.updated_at := now();
  return new;
end $$;


--
-- Name: enforce_sale_option_default_pack(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.enforce_sale_option_default_pack() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.is_default then
    new.pack_size := 1;
  end if;
  return new;
end
$$;


--
-- Name: get_reservation_status(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.get_reservation_status(p_id uuid, p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select exists (
    select 1 from localizador.admin_users
    where user_id = auth.uid() and role in ('admin','superadmin')
  );
$$;


--
-- Name: is_auditor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_auditor() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select exists (
    select 1 from localizador.admin_users
    where user_id = auth.uid() and role = 'auditoria'
  );
$$;


--
-- Name: is_own_pharmacy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_own_pharmacy(pid uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select exists (
    select 1 from localizador.admin_users
    where user_id = auth.uid()
      and role = 'farmacia'
      and pharmacy_id = pid
  );
$$;


--
-- Name: is_own_pharmacy_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_own_pharmacy_user() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select exists (
    select 1 from localizador.admin_users
    where user_id = auth.uid() and role = 'farmacia'
  );
$$;


--
-- Name: is_platform_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_platform_member() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select exists (
    select 1 from localizador.admin_users
    where user_id = auth.uid()
      and role in ('admin','superadmin','onboarding','suporte','faturacao','auditoria')
  );
$$;


--
-- Name: is_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.is_superadmin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  select localizador.is_admin();
$$;


--
-- Name: lead_rate_consume(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.lead_rate_consume(p_ip text, p_limit integer, p_window_seconds integer DEFAULT 3600) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_ip     text;
  v_window timestamptz;
  v_hits   integer;
  v_retry  integer;
begin
  v_ip := substr(trim(coalesce(p_ip, '')), 1, 45);
  if v_ip = '' then
    v_ip := 'unknown';
  end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'lead_rate_consume: parâmetros inválidos';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into localizador.lead_rate_windows (ip, window_start, hits)
  values (v_ip, v_window, 1)
  on conflict (ip, window_start)
    do update set hits = localizador.lead_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista (2% dos pedidos): janelas antigas não servem
  -- para nada e esta tabela é escrita em todas as submissões.
  if random() < 0.02 then
    delete from localizador.lead_rate_windows where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end;
$$;


--
-- Name: log_reservation_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.log_reservation_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform localizador.log_stock_movement(
      new.pharmacy_id, new.drug_id, new.stock_item_id, 'reserva', 0, null, null,
      'portal', 'reserva criada', null, new.id::text, null, null, null, null, null,
      jsonb_build_object('estado', new.status, 'unidades', new.quantity)
    );
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('confirmada','pronta','recusada') then
    perform localizador.log_stock_movement(
      new.pharmacy_id, new.drug_id, new.stock_item_id, 'reserva', 0, null, null,
      'portal', 'reserva ' || new.status, new.reason, new.id::text, null,
      new.handled_by, null, null, null,
      jsonb_build_object('estado', new.status, 'unidades', coalesce(new.confirmed_quantity, new.quantity))
    );
  end if;
  return new;
end;
$$;


--
-- Name: log_stock_movement(uuid, uuid, uuid, text, integer, integer, integer, text, text, text, text, text, uuid, uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.log_stock_movement(p_pharmacy_id uuid, p_drug_id uuid, p_stock_item_id uuid, p_type text, p_delta integer, p_before integer, p_after integer, p_source text DEFAULT 'portal'::text, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source_ref text DEFAULT NULL::text, p_idem text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_actor_label text DEFAULT NULL::text, p_lot_id uuid DEFAULT NULL::uuid, p_meta jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_id uuid;
  v_staff uuid;
  v_label text;
begin
  if p_idem is not null then
    select m.id into v_id
      from localizador.stock_movements m
     where m.pharmacy_id = p_pharmacy_id
       and m.idempotency_key = p_idem;
    if found then
      return v_id;
    end if;
  end if;

  -- O autor tem de pertencer à farmácia (um id forjado não entra).
  if p_staff_id is not null then
    select s.id, s.name into v_staff, v_label
      from localizador.pharmacy_staff s
     where s.id = p_staff_id and s.pharmacy_id = p_pharmacy_id;
  end if;

  insert into localizador.stock_movements (
    pharmacy_id, stock_item_id, drug_id, drug_label, lot_id,
    movement_type, quantity_delta, quantity_before, quantity_after,
    reason, note, source, source_ref, idempotency_key,
    actor_staff_id, actor_user_id, actor_label, metadata
  )
  values (
    p_pharmacy_id, p_stock_item_id, p_drug_id,
    (select d.name from localizador.drugs d where d.id = p_drug_id),
    p_lot_id,
    p_type, coalesce(p_delta, 0), p_before, p_after,
    p_reason, p_note, coalesce(p_source, 'portal'), p_source_ref, p_idem,
    v_staff, p_actor_user_id,
    coalesce(p_actor_label, v_label),
    p_meta
  )
  returning id into v_id;

  return v_id;
end;
$$;


--
-- Name: pharmacy_stock_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.pharmacy_stock_counts() RETURNS TABLE(pharmacy_slug text, stock_count bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    p.slug,
    count(s.id) as stock_count
  from localizador.pharmacies p
  join localizador.stock_items s
    on s.pharmacy_id = p.id
   and s.in_stock
   and s.retired_at is null
   and (s.available_from is null or s.available_from <= now())
   and (s.expires_at is null or s.expires_at >= current_date)
  join localizador.drugs d
    on d.id = s.drug_id
   and d.active
   and (
     (d.kind = 'medicamento' and s.confirmed_at > now() - interval '72 hours')
     or (d.kind <> 'medicamento' and s.confirmed_at > now() - interval '30 days')
   )
  where p.active
  group by p.slug
$$;


--
-- Name: platform_pharmacy_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.platform_pharmacy_overview() RETURNS TABLE(pharmacy_id uuid, slug text, name text, municipio text, active boolean, verified boolean, created_at timestamp with time zone, plan_code text, plan_status text, trial_until timestamp with time zone, grace_until timestamp with time zone, contas bigint, perfis bigint, perfis_activos bigint, chaves_activas bigint, destinos bigint, stock_confirmado bigint, stock_ultimo timestamp with time zone, reservas_abertas bigint, ultima_accao text, ultima_accao_em timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
  with
  -- Contas da farmácia: o papel 'farmacia' é o único com pharmacy_id.
  contas as (
    select au.pharmacy_id, count(*) as n
    from localizador.admin_users au
    where au.role = 'farmacia'
    group by au.pharmacy_id
  ),
  -- Perfis do balcão (0018) — total e quantos podem entrar hoje.
  perfis as (
    select s.pharmacy_id,
           count(*) as n,
           count(*) filter (where s.active) as n_activos
    from localizador.pharmacy_staff s
    group by s.pharmacy_id
  ),
  -- Chaves de API vivas (0023).
  chaves as (
    select k.pharmacy_id, count(*) as n
    from localizador.pharmacy_api_keys k
    where k.active and k.revoked_at is null
    group by k.pharmacy_id
  ),
  -- Destinos de webhook activos (0023/0025).
  destinos as (
    select w.pharmacy_id, count(*) as n
    from localizador.pharmacy_webhooks w
    where w.active
    group by w.pharmacy_id
  ),
  -- Stock: quantos itens estão confirmados dentro da janela da SUA
  -- categoria (0038: medicamentos 72 h, parafarmácia 30 dias) e quando
  -- foi a última confirmação de um item que continua em stock.
  stock as (
    select i.pharmacy_id,
           count(*) filter (
             where i.in_stock
               and exists (
                 select 1 from localizador.drugs d
                  where d.id = i.drug_id
                    and d.active
                    and (
                      (d.kind = 'medicamento'
                        and i.confirmed_at > now() - interval '72 hours')
                      or (d.kind <> 'medicamento'
                        and i.confirmed_at > now() - interval '30 days')
                    )
               )
           ) as n_confirmado,
           max(i.confirmed_at) filter (where i.in_stock) as ultimo
    from localizador.stock_items i
    group by i.pharmacy_id
  ),
  -- Reservas por atender: as três que continuam a pedir trabalho à farmácia.
  reservas as (
    select r.pharmacy_id, count(*) as n
    from localizador.reservations r
    where r.status in ('pendente', 'confirmada', 'pronta')
    group by r.pharmacy_id
  ),
  -- Última acção da equipa sobre esta farmácia (trilha da 0027).
  acoes as (
    select distinct on (a.pharmacy_id) a.pharmacy_id, a.action, a.created_at
    from localizador.platform_audit_log a
    where a.pharmacy_id is not null
    order by a.pharmacy_id, a.created_at desc
  )
  select
    p.id,
    p.slug,
    p.name,
    p.municipio,
    p.active,
    p.verified,
    p.created_at,
    s.plan_code,
    s.status,
    s.trial_until,
    s.grace_until,
    coalesce(c.n, 0),
    coalesce(f.n, 0),
    coalesce(f.n_activos, 0),
    coalesce(k.n, 0),
    coalesce(w.n, 0),
    coalesce(st.n_confirmado, 0),
    st.ultimo,
    coalesce(r.n, 0),
    a2.action,
    a2.created_at
  from localizador.pharmacies p
  left join localizador.pharmacy_subscriptions s on s.pharmacy_id = p.id
  left join contas    c  on c.pharmacy_id  = p.id
  left join perfis    f  on f.pharmacy_id  = p.id
  left join chaves    k  on k.pharmacy_id  = p.id
  left join destinos  w  on w.pharmacy_id  = p.id
  left join stock     st on st.pharmacy_id = p.id
  left join reservas  r  on r.pharmacy_id  = p.id
  left join acoes     a2 on a2.pharmacy_id = p.id
  order by p.name
$$;


--
-- Name: FUNCTION platform_pharmacy_overview(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION localizador.platform_pharmacy_overview() IS 'Uma linha por farmácia com os números que a lista da área interna mostra (0029). Agrega plano, contas, perfis, chaves, destinos, stock, reservas e a última acção da equipa — o PostgREST não faz group by e sem isto a lista arrastaria tabelas inteiras. EXECUTE só para service_role.';


--
-- Name: post_stock_change(uuid, uuid, text, integer, integer, boolean, text, text, text, text, text, uuid, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.post_stock_change(p_pharmacy_id uuid, p_drug_id uuid, p_type text, p_delta integer DEFAULT NULL::integer, p_set_quantity integer DEFAULT NULL::integer, p_in_stock boolean DEFAULT NULL::boolean, p_source text DEFAULT 'portal'::text, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source_ref text DEFAULT NULL::text, p_idem text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_lot_number text DEFAULT NULL::text, p_expires_at date DEFAULT NULL::date, p_actor_label text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
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

  -- A linha de stock pode não existir (produto nunca reportado).
  select s.id, s.quantity, s.in_stock into v_item_id, v_before, v_in_stock
    from localizador.stock_items s
   where s.pharmacy_id = p_pharmacy_id and s.drug_id = p_drug_id;
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
  -- uma entrada liga e um saldo a zero desliga (semântica actual do
  -- portal, 0006/0012).
  v_in_stock := coalesce(
    p_in_stock,
    case when v_delta > 0 then true
         when v_after = 0 then false
         else coalesce(v_in_stock, v_after > 0) end
  );

  -- Lotes/camadas (0021): o delta entra no lote indicado (entradas) ou sai
  -- dos lotes que expiram primeiro (saídas, FEFO).
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
end;
$$;


--
-- Name: protect_pharmacy_self_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.protect_pharmacy_self_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
begin
  -- Caminho privilegiado (equipa pelo servidor, ou administração da base):
  -- o selo e o estado mudam; a morada pública continua a não mudar.
  if localizador.request_role() = 'service_role'
     or (current_setting('request.jwt.claims', true) is null
         and session_user in ('postgres', 'supabase_admin')) then
    new.slug       := old.slug;
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
  end if;

  -- Caminho da farmácia (e de qualquer outro cliente): como na 0005. Um
  -- portal não se dá o selo, não se reactiva depois de suspensa e não muda
  -- a própria morada pública.
  new.slug       := old.slug;
  new.verified   := old.verified;
  new.active     := old.active;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end
$$;


--
-- Name: FUNCTION protect_pharmacy_self_update(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION localizador.protect_pharmacy_self_update() IS 'Colunas que só a equipa muda em pharmacies (0030): slug e created_at são intocáveis para todos; verified e active só passam pelo caminho privilegiado (service_role pelo PostgREST, ou ligação de administração sem claims). O portal da farmácia continua a receber os valores antigos de verified/active — a policy de UPDATE dá-lhe a linha, o trigger protege as colunas.';


--
-- Name: request_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.request_role() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v  text;
  vj jsonb;
begin
  v := nullif(current_setting('request.jwt.claim.role', true), '');
  if v is not null then
    return v;
  end if;
  vj := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if vj is not null then
    return coalesce(vj ->> 'role', 'anon');
  end if;
  return 'anon';
exception when others then
  return 'anon';
end;
$$;


--
-- Name: FUNCTION request_role(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION localizador.request_role() IS 'Papel do JWT do pedido (anon | authenticated | service_role), legível dentro de funções SECURITY DEFINER.';


--
-- Name: stock_lot_apply(uuid, integer, text, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.stock_lot_apply(p_stock_item_id uuid, p_delta integer, p_lot_number text DEFAULT NULL::text, p_expires_at date DEFAULT NULL::date, p_source text DEFAULT 'portal'::text, p_source_ref text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_pharmacy uuid;
  v_drug     uuid;
  v_lot_id   uuid;
  v_number   text;
  v_rest     integer;
  v_take     integer;
  r          record;
begin
  if coalesce(p_delta, 0) = 0 then
    return null;
  end if;

  select s.pharmacy_id, s.drug_id into v_pharmacy, v_drug
    from localizador.stock_items s
   where s.id = p_stock_item_id;
  if not found then
    return null;
  end if;

  -- Normaliza o nº de lote: '' e espaços contam como «por identificar».
  v_number := nullif(trim(coalesce(p_lot_number, '')), '');

  if p_delta > 0 then
    v_rest := p_delta;

    -- Camada existente com o mesmo lote e a mesma validade (is not
    -- distinct from: null combina com null — a camada «sem lote»).
    select l.id into v_lot_id
      from localizador.stock_lots l
     where l.stock_item_id = p_stock_item_id
       and l.lot_number is not distinct from v_number
       and l.expires_at is not distinct from p_expires_at
     order by l.created_at
     limit 1;

    if v_lot_id is null then
      insert into localizador.stock_lots (
        pharmacy_id, stock_item_id, drug_id, lot_number, expires_at,
        quantity, source, source_ref
      )
      values (
        v_pharmacy, p_stock_item_id, v_drug, v_number, p_expires_at,
        0, coalesce(p_source, 'portal'), p_source_ref
      )
      returning id into v_lot_id;
    end if;

    -- received_at só se renova quando a camada estava vazia (a entrada
    -- nova é uma recepção nova; somar a uma camada com stock mantém a
    -- data da primeira recepção).
    update localizador.stock_lots
       set quantity    = quantity + v_rest,
           received_at = case when quantity = 0 then now() else received_at end,
           source      = coalesce(p_source, source),
           source_ref  = coalesce(p_source_ref, source_ref),
           updated_at  = now()
     where id = v_lot_id;
  else
    v_rest := -p_delta;

    -- FEFO: validade mais próxima primeiro; lotes sem validade (nulls
    -- last) e, entre iguais, os mais antigos.
    for r in
      select l.id, l.quantity
        from localizador.stock_lots l
       where l.stock_item_id = p_stock_item_id
         and l.quantity > 0
       order by l.expires_at asc nulls last, l.created_at asc
    loop
      exit when v_rest <= 0;
      v_take := least(v_rest, r.quantity);
      update localizador.stock_lots
         set quantity   = quantity - v_take,
             updated_at = now()
       where id = r.id;
      v_rest := v_rest - v_take;
    end loop;

    -- Uma saída pode atravessar várias camadas: o movimento fica sem
    -- lote único (o rasto por camada vive nas quantidades).
    v_lot_id := null;
  end if;

  perform localizador.stock_lot_sync_expiry(p_stock_item_id);
  return v_lot_id;
end;
$$;


--
-- Name: stock_lot_sync_expiry(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.stock_lot_sync_expiry(p_stock_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_min date;
begin
  select min(l.expires_at) into v_min
    from localizador.stock_lots l
   where l.stock_item_id = p_stock_item_id
     and l.quantity > 0
     and l.expires_at is not null;

  -- Só escreve quando alguma camada sabe a validade: sem isso, um item
  -- com validade escrita à mão não a perde por receber stock sem lote.
  if v_min is not null then
    update localizador.stock_items
       set expires_at = v_min
     where id = p_stock_item_id
       and expires_at is distinct from v_min;
  end if;
end;
$$;


--
-- Name: stock_movements_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.stock_movements_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'stock_movements é imutável (append-only): registe um movimento novo em vez de % ', tg_op
    using errcode = 'P0001',
          hint = 'Para corrigir um saldo use post_stock_change() com um tipo de correcção.';
end;
$$;


--
-- Name: webhook_claim_due(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.webhook_claim_due(p_limit integer DEFAULT 20, p_worker text DEFAULT 'cron'::text) RETURNS TABLE(delivery_id uuid, webhook_id uuid, pharmacy_id uuid, url text, secret text, event text, payload jsonb, attempts integer, max_attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
begin
  return query
  with due as (
    select d.id
      from localizador.webhook_deliveries d
     where d.status = 'pendente'
       and d.next_attempt_at <= now()
       and (d.locked_at is null or d.locked_at < now() - interval '2 minutes')
     order by d.next_attempt_at asc
     limit greatest(least(p_limit, 100), 1)
     for update skip locked
  ), claimed as (
    update localizador.webhook_deliveries d
       set locked_at  = now(),
           locked_by  = left(coalesce(p_worker, 'cron'), 60),
           updated_at = now()
      from due
     where d.id = due.id
    returning d.*
  )
  select c.id, c.webhook_id, c.pharmacy_id, w.url, w.secret, c.event, c.payload,
         c.attempts, c.max_attempts
    from claimed c
    join localizador.pharmacy_webhooks w on w.id = c.webhook_id
   order by c.next_attempt_at asc;
end;
$$;


--
-- Name: webhook_fanout_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.webhook_fanout_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_payload  jsonb;
  v_lot      text;
  v_exp      date;
  v_hook     record;
  v_delivery uuid;
begin
  if new.movement_type = 'reserva' then
    return new;
  end if;

  -- Farmácias sem destinos (a maioria) não pagam nada por este trigger.
  if not exists (
    select 1
      from localizador.pharmacy_webhooks w
     where w.pharmacy_id = new.pharmacy_id
       and w.active
       and w.disabled_at is null
       and w.secret is not null
       and w.events @> array['stock.updated']::text[]
  ) then
    return new;
  end if;

  select l.lot_number, l.expires_at into v_lot, v_exp
    from localizador.stock_lots l
   where l.id = new.lot_id;

  -- O `id` NÃO é escrito aqui: é o id da ENTREGA (uma por destino) e
  -- tem de ser o mesmo que vai no cabeçalho `webhook-id` — é a chave de
  -- deduplicação de quem recebe. O movimento fica em `data.movement_id`.
  v_payload := jsonb_build_object(
    'event', 'stock.updated',
    'occurred_at', new.created_at,
    'pharmacy', (
      select jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name)
        from localizador.pharmacies p
       where p.id = new.pharmacy_id
    ),
    'data', jsonb_build_object(
      'movement_id', new.id,
      'drug_id', new.drug_id,
      'drug', new.drug_label,
      'movement_type', new.movement_type,
      'delta', new.quantity_delta,
      'quantity_before', new.quantity_before,
      'quantity_after', new.quantity_after,
      'reason', new.reason,
      'note', new.note,
      'source', new.source,
      'source_ref', new.source_ref,
      'lot_number', v_lot,
      'expires_at', v_exp,
      'actor', new.actor_label
    )
  );

  for v_hook in
    select w.id
      from localizador.pharmacy_webhooks w
     where w.pharmacy_id = new.pharmacy_id
       and w.active
       and w.disabled_at is null
       and w.secret is not null
       and w.events @> array['stock.updated']::text[]
  loop
    v_delivery := gen_random_uuid();
    insert into localizador.webhook_deliveries (id, pharmacy_id, webhook_id, event, payload, source_ref)
    values (
      v_delivery, new.pharmacy_id, v_hook.id, 'stock.updated',
      v_payload || jsonb_build_object('id', v_delivery),
      new.id::text
    )
    on conflict (webhook_id, event, source_ref) do nothing;
  end loop;

  return new;
end;
$$;


--
-- Name: webhook_prune(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.webhook_prune(p_days integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_deleted integer;
begin
  delete from localizador.webhook_deliveries
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
     and status in ('entregue','falhado');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


--
-- Name: webhook_record_attempt(uuid, integer, text, integer, boolean, integer, boolean, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.webhook_record_attempt(p_delivery_id uuid, p_status_code integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_ok boolean DEFAULT false, p_retry_seconds integer DEFAULT NULL::integer, p_permanent boolean DEFAULT false, p_disable boolean DEFAULT false, p_disable_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_delivery record;
  v_attempt  integer;
  v_status   text;
begin
  select * into v_delivery
    from localizador.webhook_deliveries
   where id = p_delivery_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENTREGA_NAO_EXISTE');
  end if;

  v_attempt := v_delivery.attempts + 1;

  insert into localizador.webhook_attempts (
    delivery_id, pharmacy_id, attempt, status_code, error, duration_ms
  )
  values (
    p_delivery_id, v_delivery.pharmacy_id, v_attempt, p_status_code,
    left(nullif(trim(coalesce(p_error, '')), ''), 300), p_duration_ms
  );

  if p_ok then
    v_status := 'entregue';
  elsif p_permanent or v_attempt >= v_delivery.max_attempts then
    v_status := 'falhado';
  else
    v_status := 'pendente';
  end if;

  update localizador.webhook_deliveries
     set attempts        = v_attempt,
         status          = v_status,
         response_status = p_status_code,
         last_error      = left(nullif(trim(coalesce(p_error, '')), ''), 300),
         delivered_at    = case when p_ok then now() else delivered_at end,
         next_attempt_at = case
                             when v_status = 'pendente'
                             then now() + make_interval(secs => greatest(coalesce(p_retry_seconds, 60), 5))
                             else next_attempt_at
                           end,
         locked_at       = null,
         locked_by       = null,
         updated_at      = now()
   where id = p_delivery_id;

  -- Saúde do endpoint: um sucesso limpa o contador; uma falha soma.
  if p_ok then
    update localizador.pharmacy_webhooks
       set last_success_at = now(),
           failure_count   = 0,
           updated_at      = now()
     where id = v_delivery.webhook_id;
  else
    update localizador.pharmacy_webhooks
       set last_failure_at = now(),
           failure_count   = failure_count + 1,
           updated_at      = now()
     where id = v_delivery.webhook_id;
  end if;

  -- «Gone» é a única resposta que desliga sozinha: o parceiro disse
  -- explicitamente que aquele endereço acabou. Tudo o resto fica
  -- visível no portal para a farmácia decidir.
  if p_disable then
    update localizador.pharmacy_webhooks
       set active          = false,
           disabled_at     = coalesce(disabled_at, now()),
           disabled_reason = left(coalesce(p_disable_reason, 'o destino respondeu 410 Gone'), 200),
           updated_at      = now()
     where id = v_delivery.webhook_id;
  end if;

  return jsonb_build_object(
    'ok', v_status = 'entregue',
    'status', v_status,
    'attempt', v_attempt,
    'max_attempts', v_delivery.max_attempts
  );
end;
$$;


--
-- Name: webhook_replay(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION localizador.webhook_replay(p_delivery_id uuid, p_pharmacy_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'localizador', 'public', 'extensions'
    AS $$
declare
  v_row record;
begin
  select * into v_row
    from localizador.webhook_deliveries
   where id = p_delivery_id
     and pharmacy_id = p_pharmacy_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENTREGA_NAO_EXISTE');
  end if;

  update localizador.webhook_deliveries
     set status          = 'pendente',
         -- Reenvio é uma tentativa nova de um evento antigo: dá espaço
         -- para mais algumas antes de desistir outra vez.
         max_attempts    = greatest(max_attempts, attempts + 3),
         next_attempt_at = now(),
         locked_at       = null,
         locked_by       = null,
         updated_at      = now()
   where id = p_delivery_id;

  -- Um destino desligado por 410 pode voltar a receber por decisão
  -- explícita da farmácia (reenviar é essa decisão).
  update localizador.pharmacy_webhooks
     set active = true, disabled_at = null, disabled_reason = null, updated_at = now()
   where id = v_row.webhook_id
     and disabled_at is not null;

  return jsonb_build_object('ok', true, 'delivery_id', p_delivery_id);
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.admin_users (
    user_id uuid NOT NULL,
    role text NOT NULL,
    pharmacy_id uuid,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_users_check CHECK (((role = 'farmacia'::text) = (pharmacy_id IS NOT NULL))),
    CONSTRAINT admin_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'superadmin'::text, 'onboarding'::text, 'suporte'::text, 'faturacao'::text, 'auditoria'::text, 'farmacia'::text])))
);


--
-- Name: api_rate_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.api_rate_windows (
    api_key_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE api_rate_windows; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.api_rate_windows IS 'Contadores de pedidos por chave e janela (janela fixa). Limpos automaticamente.';


--
-- Name: api_request_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.api_request_log (
    id bigint NOT NULL,
    pharmacy_id uuid,
    api_key_id uuid,
    route text NOT NULL,
    method text NOT NULL,
    status integer NOT NULL,
    items_ok integer,
    items_error integer,
    error_code text,
    idempotency_key text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE api_request_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.api_request_log IS 'Auditoria das chamadas de terceiros: rota, estado, contagens e duração. Nunca guarda payloads nem dados pessoais.';


--
-- Name: api_request_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE localizador.api_request_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_request_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE localizador.api_request_log_id_seq OWNED BY localizador.api_request_log.id;


--
-- Name: drug_brand_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.drug_brand_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drug_id uuid NOT NULL,
    brand_key text NOT NULL,
    brand_label text NOT NULL,
    image_path text NOT NULL,
    image_sha text NOT NULL,
    bytes integer,
    width integer,
    height integer,
    status text DEFAULT 'published'::text NOT NULL,
    source_note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drug_brand_images_key_len CHECK (((char_length(brand_key) >= 1) AND (char_length(brand_key) <= 80))),
    CONSTRAINT drug_brand_images_label_len CHECK ((char_length(brand_label) <= 80)),
    CONSTRAINT drug_brand_images_status_check CHECK ((status = ANY (ARRAY['published'::text, 'hidden'::text])))
);


--
-- Name: TABLE drug_brand_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.drug_brand_images IS 'Imagem de catálogo por medicamento + marca. Escrita só por service role (área interna); leitura pública das publicadas.';


--
-- Name: drugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.drugs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    molecule text,
    form text,
    dosage text,
    requires_rx boolean DEFAULT false NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_pharmacy uuid,
    kind text DEFAULT 'medicamento'::text NOT NULL,
    category text,
    CONSTRAINT drugs_category_check CHECK (((category IS NULL) OR
CASE kind
    WHEN 'medicamento'::text THEN (category = ANY (ARRAY['dor-febre'::text, 'gripe-tosse'::text, 'digestivo'::text, 'alergia'::text, 'antibioticos'::text, 'cronicos'::text, 'pele'::text, 'outros-clinicos'::text]))
    WHEN 'bebe'::text THEN (category = ANY (ARRAY['fraldas'::text, 'biberoes'::text, 'alimentacao-bebe'::text, 'cuidados-bebe'::text]))
    WHEN 'higiene'::text THEN (category = ANY (ARRAY['higiene-oral'::text, 'banho-corpo'::text, 'cuidados-intimos'::text, 'desinfeccao'::text]))
    WHEN 'beleza'::text THEN (category = ANY (ARRAY['cuidados-pele'::text, 'protecao-solar'::text, 'maquilhagem'::text, 'perfumaria'::text]))
    ELSE (category = ANY (ARRAY['primeiros-socorros'::text, 'testes'::text, 'ortopedia'::text, 'sexualidade'::text]))
END)),
    CONSTRAINT drugs_kind_check CHECK ((kind = ANY (ARRAY['medicamento'::text, 'bebe'::text, 'higiene'::text, 'beleza'::text, 'outros'::text]))),
    CONSTRAINT drugs_priority_check CHECK ((priority = ANY (ARRAY['critico'::text, 'alto'::text, 'normal'::text])))
);


--
-- Name: COLUMN drugs.active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.drugs.active IS 'Inactivo = criado por uma farmácia no portal, à espera de validação da equipa CF.';


--
-- Name: stock_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    drug_id uuid NOT NULL,
    in_stock boolean DEFAULT false NOT NULL,
    quantity integer,
    price numeric(12,2),
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    available_from timestamp with time zone,
    expires_at date,
    origin text,
    brand text,
    image_path text,
    retired_at timestamp with time zone,
    pack_laminas integer,
    pack_comprimidos integer,
    source text DEFAULT 'portal'::text NOT NULL,
    synced_at timestamp with time zone,
    source_ref text,
    reservable boolean DEFAULT true NOT NULL,
    brand_key text GENERATED ALWAYS AS (localizador.brand_key(brand)) STORED,
    prefers_catalogue_image boolean DEFAULT true NOT NULL,
    CONSTRAINT stock_items_brand_len CHECK ((char_length(brand) <= 80)),
    CONSTRAINT stock_items_origin_len CHECK ((char_length(origin) <= 60)),
    CONSTRAINT stock_items_pack_comprimidos_check CHECK (((pack_comprimidos IS NULL) OR ((pack_comprimidos >= 1) AND (pack_comprimidos <= 999)))),
    CONSTRAINT stock_items_pack_laminas_check CHECK (((pack_laminas IS NULL) OR ((pack_laminas >= 1) AND (pack_laminas <= 999)))),
    CONSTRAINT stock_items_price_check CHECK (((price IS NULL) OR (price >= (0)::numeric))),
    CONSTRAINT stock_items_quantity_check CHECK (((quantity IS NULL) OR (quantity >= 0))),
    CONSTRAINT stock_items_source_check CHECK ((source = ANY (ARRAY['portal'::text, 'csv'::text, 'api'::text, 'team'::text])))
);

ALTER TABLE ONLY localizador.stock_items REPLICA IDENTITY FULL;


--
-- Name: COLUMN stock_items.retired_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.retired_at IS 'Preenchido = item retirado do catálogo da farmácia (lixeira). Null = activo.';


--
-- Name: COLUMN stock_items.pack_laminas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.pack_laminas IS 'Lâminas por caixa (embalagem recebida) — NULL quando não se aplica.';


--
-- Name: COLUMN stock_items.pack_comprimidos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.pack_comprimidos IS 'Comprimidos por lâmina — NULL quando não se aplica.';


--
-- Name: COLUMN stock_items.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.source IS 'Como o saldo foi escrito pela última vez: portal (mão), csv (importação), api (sincronização), team (equipa CF).';


--
-- Name: COLUMN stock_items.synced_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.synced_at IS 'Quando a origem externa (csv/api) confirmou este saldo. Null = escrito à mão no portal.';


--
-- Name: COLUMN stock_items.source_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.source_ref IS 'Referência da origem: id da importação, id externo do ERP, etc.';


--
-- Name: COLUMN stock_items.prefers_catalogue_image; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_items.prefers_catalogue_image IS 'true = usa a imagem de catálogo quando existe para (drug, marca); false = usa só a foto própria.';


--
-- Name: brand_image_coverage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW localizador.brand_image_coverage WITH (security_invoker='true') AS
 SELECT d.id AS drug_id,
    d.name AS drug_name,
    s.brand_key,
    min(s.brand) AS brand_label,
    count(*) FILTER (WHERE (s.retired_at IS NULL)) AS stock_items,
    count(DISTINCT s.pharmacy_id) AS pharmacies,
    max(s.confirmed_at) AS last_confirmed,
    bi.id AS image_id,
    bi.image_path,
    bi.status
   FROM ((localizador.stock_items s
     JOIN localizador.drugs d ON ((d.id = s.drug_id)))
     LEFT JOIN localizador.drug_brand_images bi ON (((bi.drug_id = s.drug_id) AND (bi.brand_key = s.brand_key))))
  WHERE ((s.brand IS NOT NULL) AND (s.brand_key <> ''::text))
  GROUP BY d.id, d.name, s.brand_key, bi.id, bi.image_path, bi.status;


--
-- Name: lead_rate_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.lead_rate_windows (
    ip text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE lead_rate_windows; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.lead_rate_windows IS 'Contadores do formulário público de leads por IP e janela (fixa). Limpos automaticamente.';


--
-- Name: pharmacies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    municipio text NOT NULL,
    address text,
    lat numeric(9,6),
    lng numeric(9,6),
    phone text,
    whatsapp text,
    opening_hours text,
    logo_url text,
    verified boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    maps_url text,
    updated_by uuid,
    email text,
    CONSTRAINT pharmacies_municipio_check CHECK ((municipio = ANY (ARRAY['Belas'::text, 'Cacuaco'::text, 'Camama'::text, 'Cazenga'::text, 'Hoji ya Henda'::text, 'Ingombota'::text, 'Kilamba'::text, 'Kilamba Kiaxi'::text, 'Maianga'::text, 'Mulenvos'::text, 'Mussulo'::text, 'Rangel'::text, 'Samba'::text, 'Sambizanga'::text, 'Talatona'::text, 'Viana'::text, 'Bom Jesus'::text, 'Cabiri'::text, 'Cabo Ledo'::text, 'Calumbo'::text, 'Catete'::text, 'Quiçama'::text, 'Sequele'::text])))
);


--
-- Name: COLUMN pharmacies.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacies.email IS 'Email de contacto da farmácia, editável no portal (secção Informações de /portal/sessão).';


--
-- Name: pharmacy_account_suspensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_account_suspensions (
    pharmacy_id uuid NOT NULL,
    suspended_at timestamp with time zone DEFAULT now() NOT NULL,
    suspended_by uuid,
    suspended_by_email text,
    reason text NOT NULL,
    pharmacy_was_active boolean DEFAULT true NOT NULL,
    staff_active_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    accounts_banned_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT pharmacy_account_suspensions_reason_check CHECK ((length(btrim(reason)) >= 3))
);


--
-- Name: TABLE pharmacy_account_suspensions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_account_suspensions IS 'Suspensão em vigor de uma conta de farmácia (0034). Uma linha = ban nas contas Auth + farmácia/perfis inactivos; apagar a linha é repor o acesso. Guarda a fotografia necessária para repor só o que a suspensão desligou. Sem acesso para anon/authenticated.';


--
-- Name: COLUMN pharmacy_account_suspensions.pharmacy_was_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_account_suspensions.pharmacy_was_active IS '`pharmacies.active` antes da suspensão: repor acesso não reactiva uma farmácia que já estava inactiva.';


--
-- Name: COLUMN pharmacy_account_suspensions.staff_active_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_account_suspensions.staff_active_ids IS 'Perfis de balcão que estavam activos na suspensão. Só estes voltam a activo ao repor o acesso.';


--
-- Name: COLUMN pharmacy_account_suspensions.accounts_banned_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_account_suspensions.accounts_banned_ids IS 'Contas Auth que ESTA suspensão baniu. Só estes bans são levantados ao repor o acesso.';


--
-- Name: pharmacy_announcement_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_announcement_reads (
    announcement_id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    read_by uuid DEFAULT auth.uid(),
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pharmacy_announcement_reads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_announcement_reads IS 'Recibos de leitura dos avisos, POR FARMÁCIA (0032). O sino é da farmácia: o balcão inteiro partilha o estado. Append-only — não há UPDATE nem DELETE.';


--
-- Name: pharmacy_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    tone text DEFAULT 'info'::text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    published_by uuid,
    archived_at timestamp with time zone,
    archived_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pharmacy_announcements_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 4000))),
    CONSTRAINT pharmacy_announcements_expiry_check CHECK (((expires_at IS NULL) OR (expires_at > published_at))),
    CONSTRAINT pharmacy_announcements_title_check CHECK (((char_length(btrim(title)) >= 3) AND (char_length(btrim(title)) <= 120))),
    CONSTRAINT pharmacy_announcements_tone_check CHECK ((tone = ANY (ARRAY['info'::text, 'warn'::text, 'ok'::text])))
);


--
-- Name: TABLE pharmacy_announcements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_announcements IS 'Avisos da Equipa Conheça Farmácia no portal (0032). pharmacy_id nulo = todas as farmácias. Arquivar é archived_at; nunca DELETE. Escrita exclusivamente service-role (lib/actions/platform-announcements.js).';


--
-- Name: COLUMN pharmacy_announcements.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_announcements.expires_at IS 'Fim da validade do aviso. Fora do prazo deixa de aparecer no portal — a linha fica, para a equipa poder consultar o que enviou.';


--
-- Name: COLUMN pharmacy_announcements.archived_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_announcements.archived_at IS 'Retirado do portal pela equipa. Nunca se apaga: um aviso enviado é um facto.';


--
-- Name: pharmacy_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    name text NOT NULL,
    key_id text NOT NULL,
    key_hash text NOT NULL,
    key_last4 text NOT NULL,
    scopes text[] DEFAULT ARRAY['stock:write'::text] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    request_count bigint DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rate_limit_per_minute integer DEFAULT 120 NOT NULL,
    CONSTRAINT pharmacy_api_keys_check CHECK (((revoked_at IS NULL) OR (active = false))),
    CONSTRAINT pharmacy_api_keys_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60))),
    CONSTRAINT pharmacy_api_keys_rate_limit_check CHECK (((rate_limit_per_minute >= 1) AND (rate_limit_per_minute <= 100000))),
    CONSTRAINT pharmacy_api_keys_scopes_check CHECK ((cardinality(scopes) >= 1)),
    CONSTRAINT pharmacy_api_keys_scopes_check1 CHECK ((scopes <@ ARRAY['stock:read'::text, 'stock:write'::text]))
);


--
-- Name: TABLE pharmacy_api_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_api_keys IS 'Chaves de API por farmácia (credencial de terceiros). Só o hash HMAC vive aqui; a chave é mostrada uma única vez.';


--
-- Name: COLUMN pharmacy_api_keys.key_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_api_keys.key_id IS 'Selector público da chave (cfk_<key_id>_<segredo>) — identifica a linha sem revelar o segredo.';


--
-- Name: pharmacy_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_name text NOT NULL,
    contact_name text NOT NULL,
    role text,
    email text,
    phone text NOT NULL,
    municipio text,
    message text,
    user_agent text,
    status text DEFAULT 'novo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pharmacy_id uuid,
    onboarded_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    nif text,
    license text,
    address text,
    website text,
    social text,
    consent_at timestamp with time zone,
    consent_version text,
    CONSTRAINT pharmacy_leads_status_check CHECK ((status = ANY (ARRAY['novo'::text, 'em_conversa'::text, 'demonstracao'::text, 'acordo'::text, 'onboarded'::text, 'descartado'::text])))
);


--
-- Name: COLUMN pharmacy_leads.pharmacy_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.pharmacy_id IS 'Farmácia criada a partir deste lead (0031). Liga o funil ao directório e torna a conversão reentrante: com a farmácia já criada, uma nova tentativa só repete o convite e o fecho do funil.';


--
-- Name: COLUMN pharmacy_leads.onboarded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.onboarded_at IS 'Quando o lead fechou (status = onboarded). Não se deriva do status: se o status voltar atrás, a data do fecho fica.';


--
-- Name: COLUMN pharmacy_leads.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.updated_by IS 'Quem moveu o lead pela última vez (0031). A trilha tem o antes/depois e o motivo; isto é para o ecrã não ter de ir à trilha por linha.';


--
-- Name: COLUMN pharmacy_leads.nif; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.nif IS 'NIF da farmácia, declarado no formulário de adesão (0041).';


--
-- Name: COLUMN pharmacy_leads.license; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.license IS 'Número do alvará/licença de funcionamento da farmácia (0041).';


--
-- Name: COLUMN pharmacy_leads.address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.address IS 'Morada completa indicada no formulário; pré-preenche a farmácia na conversão (0041).';


--
-- Name: COLUMN pharmacy_leads.website; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.website IS 'Website da farmácia, normalizado com https:// quando o utilizador não o escreve (0041).';


--
-- Name: COLUMN pharmacy_leads.social; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.social IS 'Redes sociais / identificadores públicos da farmácia, em texto livre (0041).';


--
-- Name: COLUMN pharmacy_leads.consent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.consent_at IS 'Quando o requerente aceitou a Política de Privacidade; nulo nos leads anteriores ao formulário novo (0041).';


--
-- Name: COLUMN pharmacy_leads.consent_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_leads.consent_version IS 'Versão da Política de Privacidade aceite (0041).';


--
-- Name: pharmacy_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    name text NOT NULL,
    pin_hash text NOT NULL,
    role text DEFAULT 'balcao'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pin_attempts integer DEFAULT 0 NOT NULL,
    pin_locked_until timestamp with time zone,
    CONSTRAINT pharmacy_staff_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80))),
    CONSTRAINT pharmacy_staff_pin_attempts_check CHECK ((pin_attempts >= 0)),
    CONSTRAINT pharmacy_staff_role_check CHECK ((role = ANY (ARRAY['balcao'::text, 'gerente'::text])))
);


--
-- Name: pharmacy_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_subscriptions (
    pharmacy_id uuid NOT NULL,
    plan_code text DEFAULT 'localizador'::text NOT NULL,
    status text DEFAULT 'activo'::text NOT NULL,
    trial_until timestamp with time zone,
    grace_until timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    notes text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pharmacy_subscriptions_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'activo'::text, 'graca'::text, 'suspenso'::text, 'cancelado'::text])))
);


--
-- Name: TABLE pharmacy_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_subscriptions IS 'Estado do plano de cada farmácia (0028). Catálogo e limites em lib/plans.js; aqui vive só o estado. Escrita exclusivamente service-role (lib/actions/platform-plans.js); a farmácia lê a própria linha. Nunca se apaga uma subscrição — cancelar é `status = cancelado`.';


--
-- Name: COLUMN pharmacy_subscriptions.trial_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_subscriptions.trial_until IS 'Fim do período de experiência. Terminado sem pagamento, a farmácia desce ao plano de entrada — os dados não se apagam.';


--
-- Name: COLUMN pharmacy_subscriptions.grace_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_subscriptions.grace_until IS 'Fim do período de graça após falha de pagamento. Durante a graça não se corta nada; no fim, desce ao plano de entrada.';


--
-- Name: COLUMN pharmacy_subscriptions.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_subscriptions.notes IS 'Notas internas da equipa sobre a negociação. Fora do grant de colunas ao authenticated: a farmácia não as lê.';


--
-- Name: pharmacy_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.pharmacy_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    url text NOT NULL,
    description text,
    events text[] DEFAULT ARRAY['stock.updated'::text] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    secret text,
    secret_last4 text,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    failure_count integer DEFAULT 0 NOT NULL,
    disabled_at timestamp with time zone,
    disabled_reason text,
    CONSTRAINT pharmacy_webhooks_description_check CHECK (((description IS NULL) OR (char_length(description) <= 120))),
    CONSTRAINT pharmacy_webhooks_events_check CHECK ((cardinality(events) >= 1)),
    CONSTRAINT pharmacy_webhooks_events_check1 CHECK ((events <@ ARRAY['stock.updated'::text, 'reserva.created'::text, 'reserva.concluded'::text, 'import.finished'::text])),
    CONSTRAINT pharmacy_webhooks_failure_count_check CHECK ((failure_count >= 0)),
    CONSTRAINT pharmacy_webhooks_url_check CHECK (((url ~* '^https://'::text) AND (char_length(url) <= 500)))
);


--
-- Name: TABLE pharmacy_webhooks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.pharmacy_webhooks IS 'Destinos de webhook registados pela farmácia. Sem entrega nesta fase: o dispatcher com assinatura HMAC e fila vem a seguir.';


--
-- Name: COLUMN pharmacy_webhooks.secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_webhooks.secret IS 'Segredo HMAC do endpoint (prefixo whsec_). Mostrado uma vez no portal; fora do grant de colunas de authenticated.';


--
-- Name: COLUMN pharmacy_webhooks.failure_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_webhooks.failure_count IS 'Entregas consecutivas falhadas. Volta a 0 ao primeiro sucesso. Serve para avisar no portal sem desligar nada sozinho.';


--
-- Name: COLUMN pharmacy_webhooks.disabled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.pharmacy_webhooks.disabled_at IS 'Preenchido quando o destino se desliga sozinho (410 Gone): o sistema do parceiro diz explicitamente que o endpoint acabou.';


--
-- Name: platform_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.platform_audit_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_role text,
    actor_email text,
    action text NOT NULL,
    table_name text,
    record_id text,
    pharmacy_id uuid,
    reason text,
    request_id text,
    ip inet,
    user_agent text,
    before jsonb,
    after jsonb
);


--
-- Name: TABLE platform_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.platform_audit_log IS 'Trilha de auditoria da Equipa CF (0027). Append-only para todos os papéis que falam com a API (anon, authenticated, service_role: sem UPDATE/DELETE). O papel dono (postgres, dashboard/Management API) está fora deste cerco — inerente ao Postgres; por isso o motivo e o antes/depois são gravados na escrita, não corrigidos depois.';


--
-- Name: COLUMN platform_audit_log.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.platform_audit_log.reason IS 'Motivo escrito por quem executa. Obrigatório nas acções destrutivas (validação em lib/platform/audit.js, não no schema: a trilha nunca deve recusar registar).';


--
-- Name: COLUMN platform_audit_log.before; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.platform_audit_log.before IS 'Estado antes da alteração, apenas das chaves que mudaram (diffJson).';


--
-- Name: platform_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE localizador.platform_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE localizador.platform_audit_log_id_seq OWNED BY localizador.platform_audit_log.id;


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    drug_id uuid NOT NULL,
    requester_name text NOT NULL,
    requester_phone text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    notes text,
    status text DEFAULT 'pendente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    confirmed_quantity integer,
    client_contacted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '72:00:00'::interval),
    reason text,
    sale_option_id uuid,
    handled_by uuid,
    access_token uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT reservations_confirmed_quantity_check CHECK (((confirmed_quantity IS NULL) OR (confirmed_quantity >= 0))),
    CONSTRAINT reservations_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT reservations_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmada'::text, 'pronta'::text, 'concluida'::text, 'recusada'::text, 'expirada'::text])))
);

ALTER TABLE ONLY localizador.reservations REPLICA IDENTITY FULL;


--
-- Name: stock_sale_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_sale_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_item_id uuid NOT NULL,
    unit text NOT NULL,
    pack_size integer DEFAULT 1 NOT NULL,
    price numeric(10,2) NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_sale_options_pack_size_check CHECK ((pack_size >= 1)),
    CONSTRAINT stock_sale_options_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT stock_sale_options_unit_check CHECK ((unit = ANY (ARRAY['comprimido'::text, 'lamina'::text, 'caixa'::text, 'frasco'::text, 'ampola'::text, 'unidade'::text])))
);


--
-- Name: stock_confirmed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW localizador.stock_confirmed WITH (security_invoker='true') AS
 SELECT s.id AS stock_item_id,
    d.id AS drug_id,
    d.name AS drug_name,
    d.molecule AS drug_molecule,
    d.form AS drug_form,
    d.dosage AS drug_dosage,
    d.requires_rx AS drug_requires_rx,
    d.priority AS drug_priority,
    d.kind AS drug_kind,
    d.category AS drug_category,
    p.id AS pharmacy_id,
    p.slug AS pharmacy_slug,
    p.name AS pharmacy_name,
    p.municipio AS pharmacy_municipio,
    p.address AS pharmacy_address,
    p.lat AS pharmacy_lat,
    p.lng AS pharmacy_lng,
    p.maps_url AS pharmacy_maps_url,
    p.phone AS pharmacy_phone,
    p.whatsapp AS pharmacy_whatsapp,
    p.opening_hours AS pharmacy_opening_hours,
    p.verified AS pharmacy_verified,
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
        CASE
            WHEN s.prefers_catalogue_image THEN COALESCE(bi.image_path, s.image_path)
            ELSE s.image_path
        END AS image_path,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', o.id, 'unit', o.unit, 'pack_size', o.pack_size, 'price', o.price, 'is_default', o.is_default) ORDER BY o.sort_order, o.unit) AS jsonb_agg
           FROM localizador.stock_sale_options o
          WHERE ((o.stock_item_id = s.id) AND o.active)), '[]'::jsonb) AS sale_options,
    s.source,
    s.synced_at,
    (floor((EXTRACT(epoch FROM (now() - COALESCE(s.synced_at, s.confirmed_at))) / (60)::numeric)))::integer AS freshness_minutes,
        CASE
            WHEN (s.prefers_catalogue_image AND (bi.image_path IS NOT NULL)) THEN 'catalogo'::text
            WHEN (s.image_path IS NOT NULL) THEN 'farmacia'::text
            ELSE NULL::text
        END AS image_origin
   FROM (((localizador.stock_items s
     JOIN localizador.pharmacies p ON ((p.id = s.pharmacy_id)))
     JOIN localizador.drugs d ON ((d.id = s.drug_id)))
     LEFT JOIN localizador.drug_brand_images bi ON (((bi.drug_id = s.drug_id) AND (bi.brand_key = s.brand_key) AND (bi.status = 'published'::text))))
  WHERE (s.in_stock AND (s.retired_at IS NULL) AND ((s.available_from IS NULL) OR (s.available_from <= now())) AND ((s.expires_at IS NULL) OR (s.expires_at >= CURRENT_DATE)) AND (((d.kind = 'medicamento'::text) AND (s.confirmed_at > (now() - '72:00:00'::interval))) OR ((d.kind <> 'medicamento'::text) AND (s.confirmed_at > (now() - '30 days'::interval)))) AND p.active AND d.active);


--
-- Name: COLUMN stock_confirmed.drug_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_confirmed.drug_category IS 'Área clínica (medicamento) ou subcategoria de parafarmácia — ver 0043.';


--
-- Name: stock_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    drug_id uuid NOT NULL,
    units integer NOT NULL,
    unit text,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_entries_units_check CHECK ((units > 0))
);


--
-- Name: stock_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    kind text DEFAULT 'csv'::text NOT NULL,
    file_name text,
    rows_total integer DEFAULT 0 NOT NULL,
    rows_ok integer DEFAULT 0 NOT NULL,
    rows_error integer DEFAULT 0 NOT NULL,
    rows_skipped integer DEFAULT 0 NOT NULL,
    report jsonb,
    created_by_staff uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_imports_file_name_check CHECK (((file_name IS NULL) OR (char_length(file_name) <= 200))),
    CONSTRAINT stock_imports_kind_check CHECK ((kind = ANY (ARRAY['csv'::text, 'api'::text]))),
    CONSTRAINT stock_imports_rows_error_check CHECK ((rows_error >= 0)),
    CONSTRAINT stock_imports_rows_ok_check CHECK ((rows_ok >= 0)),
    CONSTRAINT stock_imports_rows_skipped_check CHECK ((rows_skipped >= 0)),
    CONSTRAINT stock_imports_rows_total_check CHECK ((rows_total >= 0))
);


--
-- Name: TABLE stock_imports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.stock_imports IS 'Ficha de cada importação de stock (CSV/API): contagens e relatório de linhas rejeitadas.';


--
-- Name: stock_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    stock_item_id uuid NOT NULL,
    drug_id uuid NOT NULL,
    lot_number text,
    expires_at date,
    quantity integer DEFAULT 0 NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'portal'::text NOT NULL,
    source_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_lots_lot_number_check CHECK (((lot_number IS NULL) OR ((char_length(lot_number) >= 1) AND (char_length(lot_number) <= 40)))),
    CONSTRAINT stock_lots_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT stock_lots_source_check CHECK ((source = ANY (ARRAY['portal'::text, 'csv'::text, 'api'::text, 'team'::text, 'sistema'::text])))
);


--
-- Name: TABLE stock_lots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.stock_lots IS 'Camadas de stock (item + nº de lote + validade → quantidade). A baixa é FEFO: sai primeiro o que expira mais cedo.';


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    stock_item_id uuid,
    drug_id uuid,
    drug_label text,
    lot_id uuid,
    movement_type text NOT NULL,
    quantity_delta integer DEFAULT 0 NOT NULL,
    quantity_before integer,
    quantity_after integer,
    reason text,
    note text,
    source text DEFAULT 'portal'::text NOT NULL,
    idempotency_key text,
    source_ref text,
    actor_staff_id uuid,
    actor_user_id uuid,
    actor_label text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['entrada'::text, 'venda'::text, 'ajuste'::text, 'saida'::text, 'expiracao'::text, 'devolucao'::text, 'importacao'::text, 'saldo_inicial'::text, 'reserva'::text, 'retirada'::text, 'restauro'::text]))),
    CONSTRAINT stock_movements_source_check CHECK ((source = ANY (ARRAY['portal'::text, 'csv'::text, 'api'::text, 'team'::text, 'sistema'::text])))
);


--
-- Name: TABLE stock_movements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.stock_movements IS 'Livro-razão de stock, só de acrescento. Correções = movimentos novos (nunca update/delete).';


--
-- Name: COLUMN stock_movements.quantity_delta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.stock_movements.quantity_delta IS 'Unidades-base (positivo entra, negativo sai). Somado ao saldo dá o saldo seguinte.';


--
-- Name: webhook_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.webhook_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    attempt integer NOT NULL,
    status_code integer,
    error text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_attempts_attempt_check CHECK ((attempt >= 1))
);


--
-- Name: TABLE webhook_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.webhook_attempts IS 'Uma linha por tentativa de entrega (estado, duração, erro curto). É o «registo das tentativas» que o portal mostra.';


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE localizador.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pharmacy_id uuid NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 10 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    response_status integer,
    last_error text,
    delivered_at timestamp with time zone,
    source_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_deliveries_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT webhook_deliveries_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 50))),
    CONSTRAINT webhook_deliveries_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'entregue'::text, 'falhado'::text])))
);


--
-- Name: TABLE webhook_deliveries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE localizador.webhook_deliveries IS 'Fila de entregas de webhook (outbox). O corpo fica congelado aqui: um retry entrega o mesmo evento, não o estado de hoje.';


--
-- Name: COLUMN webhook_deliveries.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.webhook_deliveries.id IS 'Identificador estável do evento: é o `webhook-id` enviado em todas as tentativas (chave de deduplicação do receptor).';


--
-- Name: COLUMN webhook_deliveries.source_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN localizador.webhook_deliveries.source_ref IS 'Origem do evento (movimento/importação). Impede que o mesmo evento entre duas vezes na fila do mesmo destino.';


--
-- Name: api_request_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_request_log ALTER COLUMN id SET DEFAULT nextval('localizador.api_request_log_id_seq'::regclass);


--
-- Name: platform_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.platform_audit_log ALTER COLUMN id SET DEFAULT nextval('localizador.platform_audit_log_id_seq'::regclass);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (user_id);


--
-- Name: api_rate_windows api_rate_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_rate_windows
    ADD CONSTRAINT api_rate_windows_pkey PRIMARY KEY (api_key_id, window_start);


--
-- Name: api_request_log api_request_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_request_log
    ADD CONSTRAINT api_request_log_pkey PRIMARY KEY (id);


--
-- Name: drug_brand_images drug_brand_images_drug_id_brand_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drug_brand_images
    ADD CONSTRAINT drug_brand_images_drug_id_brand_key_key UNIQUE (drug_id, brand_key);


--
-- Name: drug_brand_images drug_brand_images_image_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drug_brand_images
    ADD CONSTRAINT drug_brand_images_image_path_key UNIQUE (image_path);


--
-- Name: drug_brand_images drug_brand_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drug_brand_images
    ADD CONSTRAINT drug_brand_images_pkey PRIMARY KEY (id);


--
-- Name: drugs drugs_name_form_dosage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drugs
    ADD CONSTRAINT drugs_name_form_dosage_key UNIQUE (name, form, dosage);


--
-- Name: drugs drugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drugs
    ADD CONSTRAINT drugs_pkey PRIMARY KEY (id);


--
-- Name: lead_rate_windows lead_rate_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.lead_rate_windows
    ADD CONSTRAINT lead_rate_windows_pkey PRIMARY KEY (ip, window_start);


--
-- Name: pharmacies pharmacies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacies
    ADD CONSTRAINT pharmacies_pkey PRIMARY KEY (id);


--
-- Name: pharmacies pharmacies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacies
    ADD CONSTRAINT pharmacies_slug_key UNIQUE (slug);


--
-- Name: pharmacy_account_suspensions pharmacy_account_suspensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_account_suspensions
    ADD CONSTRAINT pharmacy_account_suspensions_pkey PRIMARY KEY (pharmacy_id);


--
-- Name: pharmacy_announcement_reads pharmacy_announcement_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcement_reads
    ADD CONSTRAINT pharmacy_announcement_reads_pkey PRIMARY KEY (announcement_id, pharmacy_id);


--
-- Name: pharmacy_announcements pharmacy_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcements
    ADD CONSTRAINT pharmacy_announcements_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_api_keys pharmacy_api_keys_key_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_api_keys
    ADD CONSTRAINT pharmacy_api_keys_key_id_key UNIQUE (key_id);


--
-- Name: pharmacy_api_keys pharmacy_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_api_keys
    ADD CONSTRAINT pharmacy_api_keys_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_leads pharmacy_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_leads
    ADD CONSTRAINT pharmacy_leads_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_staff pharmacy_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_staff
    ADD CONSTRAINT pharmacy_staff_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_subscriptions pharmacy_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_subscriptions
    ADD CONSTRAINT pharmacy_subscriptions_pkey PRIMARY KEY (pharmacy_id);


--
-- Name: pharmacy_webhooks pharmacy_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_webhooks
    ADD CONSTRAINT pharmacy_webhooks_pkey PRIMARY KEY (id);


--
-- Name: platform_audit_log platform_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.platform_audit_log
    ADD CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_access_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_access_token_unique UNIQUE (access_token);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: stock_entries stock_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_entries
    ADD CONSTRAINT stock_entries_pkey PRIMARY KEY (id);


--
-- Name: stock_imports stock_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_imports
    ADD CONSTRAINT stock_imports_pkey PRIMARY KEY (id);


--
-- Name: stock_items stock_items_pharmacy_id_drug_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_items
    ADD CONSTRAINT stock_items_pharmacy_id_drug_id_key UNIQUE (pharmacy_id, drug_id);


--
-- Name: stock_items stock_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_items
    ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);


--
-- Name: stock_lots stock_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_lots
    ADD CONSTRAINT stock_lots_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_sale_options stock_sale_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_sale_options
    ADD CONSTRAINT stock_sale_options_pkey PRIMARY KEY (id);


--
-- Name: stock_sale_options stock_sale_options_stock_item_id_unit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_sale_options
    ADD CONSTRAINT stock_sale_options_stock_item_id_unit_key UNIQUE (stock_item_id, unit);


--
-- Name: webhook_attempts webhook_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_attempts
    ADD CONSTRAINT webhook_attempts_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: api_request_log_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_request_log_pharmacy_idx ON localizador.api_request_log USING btree (pharmacy_id, created_at DESC);


--
-- Name: drugs_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drugs_category_idx ON localizador.drugs USING btree (kind, category) WHERE (category IS NOT NULL);


--
-- Name: drugs_created_by_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drugs_created_by_pharmacy_idx ON localizador.drugs USING btree (created_by_pharmacy);


--
-- Name: drugs_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drugs_kind_idx ON localizador.drugs USING btree (kind);


--
-- Name: drugs_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drugs_name_trgm_idx ON localizador.drugs USING gin (name public.gin_trgm_ops);


--
-- Name: pharmacy_announcement_reads_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_announcement_reads_pharmacy_idx ON localizador.pharmacy_announcement_reads USING btree (pharmacy_id);


--
-- Name: pharmacy_announcements_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_announcements_feed_idx ON localizador.pharmacy_announcements USING btree (pharmacy_id, published_at DESC);


--
-- Name: pharmacy_announcements_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_announcements_published_idx ON localizador.pharmacy_announcements USING btree (published_at DESC);


--
-- Name: pharmacy_api_keys_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_api_keys_pharmacy_idx ON localizador.pharmacy_api_keys USING btree (pharmacy_id, created_at DESC);


--
-- Name: pharmacy_leads_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_leads_email_idx ON localizador.pharmacy_leads USING btree (email);


--
-- Name: pharmacy_leads_funil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_leads_funil_idx ON localizador.pharmacy_leads USING btree (status, created_at DESC);


--
-- Name: pharmacy_leads_pharmacy_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pharmacy_leads_pharmacy_uidx ON localizador.pharmacy_leads USING btree (pharmacy_id) WHERE (pharmacy_id IS NOT NULL);


--
-- Name: pharmacy_leads_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_leads_phone_idx ON localizador.pharmacy_leads USING btree (phone);


--
-- Name: pharmacy_staff_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_staff_pharmacy_idx ON localizador.pharmacy_staff USING btree (pharmacy_id);


--
-- Name: pharmacy_subscriptions_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_subscriptions_plan_idx ON localizador.pharmacy_subscriptions USING btree (plan_code, status);


--
-- Name: pharmacy_webhooks_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pharmacy_webhooks_pharmacy_idx ON localizador.pharmacy_webhooks USING btree (pharmacy_id);


--
-- Name: platform_audit_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_audit_log_actor_idx ON localizador.platform_audit_log USING btree (actor_user_id, created_at DESC);


--
-- Name: platform_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_audit_log_created_idx ON localizador.platform_audit_log USING btree (created_at DESC);


--
-- Name: platform_audit_log_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_audit_log_pharmacy_idx ON localizador.platform_audit_log USING btree (pharmacy_id, created_at DESC);


--
-- Name: reservations_access_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservations_access_token_idx ON localizador.reservations USING btree (access_token);


--
-- Name: reservations_pendentes_ttl_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservations_pendentes_ttl_idx ON localizador.reservations USING btree (expires_at) WHERE (status = 'pendente'::text);


--
-- Name: reservations_pharmacy_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservations_pharmacy_status_idx ON localizador.reservations USING btree (pharmacy_id, status);


--
-- Name: stock_entries_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_entries_pharmacy_idx ON localizador.stock_entries USING btree (pharmacy_id, created_at DESC);


--
-- Name: stock_imports_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_imports_pharmacy_idx ON localizador.stock_imports USING btree (pharmacy_id, created_at DESC);


--
-- Name: stock_items_brand_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_brand_key_idx ON localizador.stock_items USING btree (drug_id, brand_key);


--
-- Name: stock_items_drug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_drug_idx ON localizador.stock_items USING btree (drug_id) WHERE in_stock;


--
-- Name: stock_items_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_pharmacy_idx ON localizador.stock_items USING btree (pharmacy_id);


--
-- Name: stock_items_retired_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_items_retired_idx ON localizador.stock_items USING btree (pharmacy_id, retired_at) WHERE (retired_at IS NOT NULL);


--
-- Name: stock_lots_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_expiry_idx ON localizador.stock_lots USING btree (pharmacy_id, expires_at) WHERE (quantity > 0);


--
-- Name: stock_lots_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_lots_item_idx ON localizador.stock_lots USING btree (stock_item_id) WHERE (quantity > 0);


--
-- Name: stock_movements_drug_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_drug_time_idx ON localizador.stock_movements USING btree (pharmacy_id, drug_id, created_at DESC);


--
-- Name: stock_movements_idem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_movements_idem_idx ON localizador.stock_movements USING btree (pharmacy_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: stock_movements_item_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_item_time_idx ON localizador.stock_movements USING btree (stock_item_id, created_at DESC);


--
-- Name: stock_movements_pharmacy_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_pharmacy_time_idx ON localizador.stock_movements USING btree (pharmacy_id, created_at DESC);


--
-- Name: stock_sale_options_default_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_sale_options_default_idx ON localizador.stock_sale_options USING btree (stock_item_id) WHERE is_default;


--
-- Name: stock_sale_options_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_sale_options_item_idx ON localizador.stock_sale_options USING btree (stock_item_id) WHERE active;


--
-- Name: webhook_attempts_delivery_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_attempts_delivery_idx ON localizador.webhook_attempts USING btree (delivery_id, attempt);


--
-- Name: webhook_deliveries_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_due_idx ON localizador.webhook_deliveries USING btree (next_attempt_at) WHERE (status = 'pendente'::text);


--
-- Name: webhook_deliveries_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_deliveries_event_idx ON localizador.webhook_deliveries USING btree (webhook_id, event, source_ref);


--
-- Name: webhook_deliveries_hook_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_hook_idx ON localizador.webhook_deliveries USING btree (webhook_id, created_at DESC);


--
-- Name: webhook_deliveries_pharmacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_pharmacy_idx ON localizador.webhook_deliveries USING btree (pharmacy_id, created_at DESC);


--
-- Name: drug_brand_images drug_brand_images_before_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER drug_brand_images_before_write BEFORE INSERT OR UPDATE ON localizador.drug_brand_images FOR EACH ROW EXECUTE FUNCTION localizador.drug_brand_images_before_write();


--
-- Name: pharmacies trg_pharmacy_self_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pharmacy_self_update BEFORE UPDATE ON localizador.pharmacies FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION localizador.protect_pharmacy_self_update();


--
-- Name: reservations trg_reservation_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reservation_log AFTER INSERT OR UPDATE ON localizador.reservations FOR EACH ROW EXECUTE FUNCTION localizador.log_reservation_event();


--
-- Name: reservations trg_reservation_stock_decrement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reservation_stock_decrement AFTER UPDATE OF status ON localizador.reservations FOR EACH ROW EXECUTE FUNCTION localizador.apply_reservation_stock_change();


--
-- Name: stock_sale_options trg_sale_option_default_pack; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_option_default_pack BEFORE INSERT OR UPDATE ON localizador.stock_sale_options FOR EACH ROW EXECUTE FUNCTION localizador.enforce_sale_option_default_pack();


--
-- Name: stock_movements trg_stock_movements_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movements_append_only BEFORE DELETE OR UPDATE ON localizador.stock_movements FOR EACH ROW EXECUTE FUNCTION localizador.stock_movements_append_only();


--
-- Name: stock_movements trg_webhook_fanout_movement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_webhook_fanout_movement AFTER INSERT ON localizador.stock_movements FOR EACH ROW EXECUTE FUNCTION localizador.webhook_fanout_movement();


--
-- Name: admin_users admin_users_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.admin_users
    ADD CONSTRAINT admin_users_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE SET NULL;


--
-- Name: admin_users admin_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: api_rate_windows api_rate_windows_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_rate_windows
    ADD CONSTRAINT api_rate_windows_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES localizador.pharmacy_api_keys(id) ON DELETE CASCADE;


--
-- Name: api_request_log api_request_log_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_request_log
    ADD CONSTRAINT api_request_log_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES localizador.pharmacy_api_keys(id) ON DELETE SET NULL;


--
-- Name: api_request_log api_request_log_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.api_request_log
    ADD CONSTRAINT api_request_log_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: drug_brand_images drug_brand_images_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drug_brand_images
    ADD CONSTRAINT drug_brand_images_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE CASCADE;


--
-- Name: drugs drugs_created_by_pharmacy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.drugs
    ADD CONSTRAINT drugs_created_by_pharmacy_fkey FOREIGN KEY (created_by_pharmacy) REFERENCES localizador.pharmacies(id) ON DELETE SET NULL;


--
-- Name: pharmacies pharmacies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacies
    ADD CONSTRAINT pharmacies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES localizador.pharmacy_staff(id) ON DELETE SET NULL;


--
-- Name: pharmacy_account_suspensions pharmacy_account_suspensions_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_account_suspensions
    ADD CONSTRAINT pharmacy_account_suspensions_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_account_suspensions pharmacy_account_suspensions_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_account_suspensions
    ADD CONSTRAINT pharmacy_account_suspensions_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_announcement_reads pharmacy_announcement_reads_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcement_reads
    ADD CONSTRAINT pharmacy_announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES localizador.pharmacy_announcements(id) ON DELETE CASCADE;


--
-- Name: pharmacy_announcement_reads pharmacy_announcement_reads_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcement_reads
    ADD CONSTRAINT pharmacy_announcement_reads_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_announcement_reads pharmacy_announcement_reads_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcement_reads
    ADD CONSTRAINT pharmacy_announcement_reads_read_by_fkey FOREIGN KEY (read_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_announcements pharmacy_announcements_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcements
    ADD CONSTRAINT pharmacy_announcements_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_announcements pharmacy_announcements_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcements
    ADD CONSTRAINT pharmacy_announcements_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_announcements pharmacy_announcements_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_announcements
    ADD CONSTRAINT pharmacy_announcements_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_api_keys pharmacy_api_keys_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_api_keys
    ADD CONSTRAINT pharmacy_api_keys_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_leads pharmacy_leads_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_leads
    ADD CONSTRAINT pharmacy_leads_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE SET NULL;


--
-- Name: pharmacy_leads pharmacy_leads_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_leads
    ADD CONSTRAINT pharmacy_leads_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_staff pharmacy_staff_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_staff
    ADD CONSTRAINT pharmacy_staff_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_subscriptions pharmacy_subscriptions_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_subscriptions
    ADD CONSTRAINT pharmacy_subscriptions_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: pharmacy_subscriptions pharmacy_subscriptions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_subscriptions
    ADD CONSTRAINT pharmacy_subscriptions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pharmacy_webhooks pharmacy_webhooks_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.pharmacy_webhooks
    ADD CONSTRAINT pharmacy_webhooks_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: platform_audit_log platform_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.platform_audit_log
    ADD CONSTRAINT platform_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_audit_log platform_audit_log_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.platform_audit_log
    ADD CONSTRAINT platform_audit_log_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES localizador.pharmacy_staff(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_sale_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_sale_option_id_fkey FOREIGN KEY (sale_option_id) REFERENCES localizador.stock_sale_options(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.reservations
    ADD CONSTRAINT reservations_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES localizador.stock_items(id) ON DELETE CASCADE;


--
-- Name: stock_entries stock_entries_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_entries
    ADD CONSTRAINT stock_entries_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE CASCADE;


--
-- Name: stock_entries stock_entries_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_entries
    ADD CONSTRAINT stock_entries_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: stock_entries stock_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_entries
    ADD CONSTRAINT stock_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES localizador.pharmacy_staff(id) ON DELETE SET NULL;


--
-- Name: stock_imports stock_imports_created_by_staff_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_imports
    ADD CONSTRAINT stock_imports_created_by_staff_fkey FOREIGN KEY (created_by_staff) REFERENCES localizador.pharmacy_staff(id) ON DELETE SET NULL;


--
-- Name: stock_imports stock_imports_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_imports
    ADD CONSTRAINT stock_imports_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: stock_items stock_items_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_items
    ADD CONSTRAINT stock_items_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE CASCADE;


--
-- Name: stock_items stock_items_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_items
    ADD CONSTRAINT stock_items_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: stock_items stock_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_items
    ADD CONSTRAINT stock_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES localizador.admin_users(user_id) ON DELETE SET NULL;


--
-- Name: stock_lots stock_lots_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_lots
    ADD CONSTRAINT stock_lots_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE CASCADE;


--
-- Name: stock_lots stock_lots_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_lots
    ADD CONSTRAINT stock_lots_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: stock_lots stock_lots_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_lots
    ADD CONSTRAINT stock_lots_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES localizador.stock_items(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_actor_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_movements
    ADD CONSTRAINT stock_movements_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES localizador.pharmacy_staff(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_movements
    ADD CONSTRAINT stock_movements_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES localizador.drugs(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_movements
    ADD CONSTRAINT stock_movements_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_movements
    ADD CONSTRAINT stock_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES localizador.stock_items(id) ON DELETE SET NULL;


--
-- Name: stock_sale_options stock_sale_options_stock_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.stock_sale_options
    ADD CONSTRAINT stock_sale_options_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES localizador.stock_items(id) ON DELETE CASCADE;


--
-- Name: webhook_attempts webhook_attempts_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_attempts
    ADD CONSTRAINT webhook_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES localizador.webhook_deliveries(id) ON DELETE CASCADE;


--
-- Name: webhook_attempts webhook_attempts_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_attempts
    ADD CONSTRAINT webhook_attempts_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES localizador.pharmacies(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY localizador.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES localizador.pharmacy_webhooks(id) ON DELETE CASCADE;


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users admin_users self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_users self read" ON localizador.admin_users FOR SELECT USING (((auth.uid() = user_id) OR localizador.is_admin()));


--
-- Name: pharmacy_announcement_reads announcement reads insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcement reads insert own" ON localizador.pharmacy_announcement_reads FOR INSERT TO authenticated WITH CHECK (localizador.is_own_pharmacy(pharmacy_id));


--
-- Name: pharmacy_announcement_reads announcement reads own or team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcement reads own or team" ON localizador.pharmacy_announcement_reads FOR SELECT USING ((localizador.is_platform_member() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: pharmacy_announcements announcements read targeted or team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "announcements read targeted or team" ON localizador.pharmacy_announcements FOR SELECT USING ((localizador.is_platform_member() OR (((pharmacy_id IS NULL) OR localizador.is_own_pharmacy(pharmacy_id)) AND (archived_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now())))));


--
-- Name: pharmacy_api_keys api keys pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "api keys pharmacy read" ON localizador.pharmacy_api_keys FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: api_request_log api log pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "api log pharmacy read" ON localizador.api_request_log FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: api_rate_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.api_rate_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: api_request_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.api_request_log ENABLE ROW LEVEL SECURITY;

--
-- Name: drug_brand_images catalogue images read published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "catalogue images read published" ON localizador.drug_brand_images FOR SELECT TO authenticated, anon USING ((status = 'published'::text));


--
-- Name: drug_brand_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.drug_brand_images ENABLE ROW LEVEL SECURITY;

--
-- Name: drugs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.drugs ENABLE ROW LEVEL SECURITY;

--
-- Name: drugs drugs admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "drugs admin write" ON localizador.drugs USING (localizador.is_admin()) WITH CHECK (localizador.is_admin());


--
-- Name: drugs drugs public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "drugs public read" ON localizador.drugs FOR SELECT USING ((active OR localizador.is_admin() OR localizador.is_own_pharmacy(created_by_pharmacy)));


--
-- Name: stock_imports imports pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "imports pharmacy read" ON localizador.stock_imports FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: lead_rate_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.lead_rate_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_lots lots pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lots pharmacy read" ON localizador.stock_lots FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: stock_movements movements pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "movements pharmacy read" ON localizador.stock_movements FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: pharmacies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacies ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacies pharmacies admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pharmacies admin write" ON localizador.pharmacies USING (localizador.is_admin()) WITH CHECK (localizador.is_admin());


--
-- Name: pharmacies pharmacies public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pharmacies public read active" ON localizador.pharmacies FOR SELECT USING ((active OR localizador.is_admin()));


--
-- Name: drugs pharmacy create drug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pharmacy create drug" ON localizador.drugs FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM localizador.admin_users au
  WHERE ((au.user_id = auth.uid()) AND (au.role = 'farmacia'::text)))) AND (NOT active) AND localizador.is_own_pharmacy(created_by_pharmacy)));


--
-- Name: pharmacies pharmacy self update profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pharmacy self update profile" ON localizador.pharmacies FOR UPDATE USING (localizador.is_own_pharmacy(id)) WITH CHECK (localizador.is_own_pharmacy(id));


--
-- Name: pharmacy_account_suspensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_account_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_announcement_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_announcement_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_staff pharmacy_staff select own pharmacy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pharmacy_staff select own pharmacy" ON localizador.pharmacy_staff FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: pharmacy_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.pharmacy_webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.platform_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_audit_log platform_audit_log read high levels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform_audit_log read high levels" ON localizador.platform_audit_log FOR SELECT USING ((localizador.is_superadmin() OR localizador.is_auditor()));


--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations reservations pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reservations pharmacy read" ON localizador.reservations FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: reservations reservations pharmacy update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reservations pharmacy update" ON localizador.reservations FOR UPDATE USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id))) WITH CHECK ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: stock_sale_options sale options pharmacy write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sale options pharmacy write" ON localizador.stock_sale_options USING ((EXISTS ( SELECT 1
   FROM localizador.stock_items si
  WHERE ((si.id = stock_sale_options.stock_item_id) AND localizador.is_own_pharmacy(si.pharmacy_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM localizador.stock_items si
  WHERE ((si.id = stock_sale_options.stock_item_id) AND localizador.is_own_pharmacy(si.pharmacy_id)))));


--
-- Name: stock_sale_options sale options public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sale options public read" ON localizador.stock_sale_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (localizador.stock_items si
     JOIN localizador.pharmacies p ON ((p.id = si.pharmacy_id)))
  WHERE ((si.id = stock_sale_options.stock_item_id) AND p.active))));


--
-- Name: stock_items stock pharmacy write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stock pharmacy write" ON localizador.stock_items USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id))) WITH CHECK ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: stock_items stock public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stock public read" ON localizador.stock_items FOR SELECT USING (true);


--
-- Name: stock_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_entries stock_entries pharmacy insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stock_entries pharmacy insert" ON localizador.stock_entries FOR INSERT WITH CHECK (localizador.is_own_pharmacy(pharmacy_id));


--
-- Name: stock_entries stock_entries pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stock_entries pharmacy read" ON localizador.stock_entries FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: stock_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_lots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_lots ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_sale_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.stock_sale_options ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_subscriptions subscriptions read own or team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subscriptions read own or team" ON localizador.pharmacy_subscriptions FOR SELECT USING ((localizador.is_platform_member() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: webhook_attempts webhook attempts pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "webhook attempts pharmacy read" ON localizador.webhook_attempts FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: webhook_deliveries webhook deliveries pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "webhook deliveries pharmacy read" ON localizador.webhook_deliveries FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- Name: webhook_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.webhook_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE localizador.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: pharmacy_webhooks webhooks pharmacy read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "webhooks pharmacy read" ON localizador.pharmacy_webhooks FOR SELECT USING ((localizador.is_admin() OR localizador.is_own_pharmacy(pharmacy_id)));


--
-- PostgreSQL database dump complete
--


