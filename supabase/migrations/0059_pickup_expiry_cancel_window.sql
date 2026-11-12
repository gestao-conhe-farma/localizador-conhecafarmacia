-- ============================================================
-- 0059 · O compromisso do levantamento é para cumprir
--
-- Duas pontas soltas da 0057/0058:
--
--   1. 'confirmada' e 'pronta' nunca expiravam. Quem não aparecesse
--      deixava a unidade presa para sempre: fora do Localizador,
--      dentro de reserved_quantity, sem venda e sem no-show. Agora
--      o cron fecha-as 24 h depois da hora marcada, com
--      reason='nao_levantada'.
--
--      Uma 'pendente' com a hora já passada também morre — não faz
--      sentido prender stock para um balcão onde já ninguém está
--      (2 h de tolerância, para o atraso de quem chega).
--
--   2. O cliente só podia cancelar em 'pendente'. Depois de a
--      farmácia separar o medicamento, a única saída era o no-show.
--      Passa a poder cancelar 'confirmada'/'pronta' até à hora
--      marcada — melhor saber do que guardar a caixa na prateleira.
--
-- Estado terminal e libertação de stock: os mesmos da 0054/0058.
-- `expirada` continua a ser o estado; o motivo distingue:
--   ttl            — 72 h sem resposta da farmácia (0010);
--   pickup_vencido — a hora marcada passou com a reserva pendente;
--   nao_levantada  — confirmada/pronta e ninguém apareceu em 24 h.
-- O trigger da 0006 só baixa `quantity` na transição PARA
-- 'concluida'; expirar não desconta stock nenhum — só liberta a
-- reserva (trigger da 0054) e a capacidade da janela.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Índice do scan: reservas abertas por hora de levantamento
-- ------------------------------------------------------------
create index if not exists reservations_open_pickup_idx
  on localizador.reservations (pickup_at)
  where status in ('pendente', 'confirmada', 'pronta');

-- ------------------------------------------------------------
-- 2. Expiração única, chamada pelo cron
--    security definer: o cron corre como dono, mas a função fica
--    fechada a anon/authenticated — não é uma porta de escrita.
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
       -- Pendente: TTL de 72 h, ou a hora marcada passou há mais de
       -- 2 h sem a farmácia responder.
       r.status = 'pendente'
       and (
         (r.expires_at is not null and r.expires_at < now())
         or (r.pickup_at is not null
             and r.pickup_at < now() - interval '2 hours')
       )
     )
     or (
       -- Separada e não levantada: 24 h depois da hora marcada.
       r.status in ('confirmada', 'pronta')
       and r.pickup_at is not null
       and r.pickup_at < now() - interval '24 hours'
     )
     returning 1
  )
  select count(*) into v_closed from closed;

  return v_closed;
end
$$;

-- As default privileges do schema dão execute a anon/authenticated em
-- cada função nova; esta não é uma porta pública.
revoke all on function localizador.expire_reservations()
  from public, anon, authenticated;
grant execute on function localizador.expire_reservations() to service_role;

-- O job da 0010 passa a chamar a função (uma regra, testável em SQL
-- em vez de um UPDATE inline escondido no cron). Mesmo nome e
-- cadência: nada muda para quem observa.
select cron.unschedule('expire-stale-reservations')
where exists (select 1 from cron.job where jobname = 'expire-stale-reservations');

select cron.schedule(
  'expire-stale-reservations',
  '*/15 * * * *',
  $$ select localizador.expire_reservations(); $$
);

-- ------------------------------------------------------------
-- 3. Cancelamento pelo cliente: até à hora marcada
--    'pendente' continua sempre cancelável (o cron tem 2 h de
--    tolerância; um clique dentro desse atraso não é erro).
--    'confirmada'/'pronta' só enquanto pickup_at não chegou.
--    Reservas antigas sem pickup_at (legado) mantêm-se
--    canceláveis — não há hora para comparar.
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
  v_pickup timestamptz;
begin
  if p_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'error', 'NAO_ENCONTRADO');
  end if;

  -- FOR UPDATE: serializa com o portal e com dois cliques.
  select r.status, r.pickup_at
    into v_status, v_pickup
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

  -- A hora já passou: a farmácia conta com a pessoa ao balcão. A
  -- saída é falar com eles (ou o cron fechar como não levantada).
  if v_status <> 'pendente'
     and v_pickup is not null
     and v_pickup <= now() then
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

comment on column localizador.reservations.status is
  'pendente → confirmada | recusada | expirada | cancelada (cliente); confirmada → pronta | recusada | cancelada (cliente, até à hora); pronta → concluida | recusada | cancelada (cliente, até à hora). expirada cobre ttl, pickup_vencido e nao_levantada.';

comment on column localizador.reservations.reason is
  'Motivo do fecho: sem_stock | zona | outro[:texto] | ttl | pickup_vencido | nao_levantada | cancelado_cliente.';

-- ------------------------------------------------------------
-- 4. Verificação
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'localizador'
       and p.proname = 'expire_reservations'
  ) then
    raise exception 'expire_reservations ausente';
  end if;

  if not exists (
    select 1 from cron.job
     where jobname = 'expire-stale-reservations'
       and command like '%expire_reservations%'
  ) then
    raise exception 'cron não chama expire_reservations';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'localizador'
       and indexname = 'reservations_open_pickup_idx'
  ) then
    raise exception 'índice reservations_open_pickup_idx ausente';
  end if;

  if position('pickup_at' in pg_get_functiondef(
       'localizador.cancel_reservation(uuid, uuid)'::regprocedure
     )) = 0 then
    raise exception 'cancel_reservation sem janela de levantamento';
  end if;

  if position('nao_levantada' in pg_get_functiondef(
       'localizador.expire_reservations()'::regprocedure
     )) = 0 then
    raise exception 'expire_reservations sem no-show';
  end if;

  if has_function_privilege('anon', 'localizador.expire_reservations()', 'execute') then
    raise exception 'anon não pode executar expire_reservations';
  end if;

  if not has_function_privilege('anon', 'localizador.cancel_reservation(uuid, uuid)', 'execute') then
    raise exception 'anon sem execute em cancel_reservation';
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- Concorrência e ciclos de vida
--   scripts/test-cancel-reservation.py — cancelar em confirmada/
--   pronta até à hora, recusar depois dela, corridas com o portal.
--   scripts/test-pickup-expiry.py — TTL, hora vencida, no-show de
--   24 h e stock intacto (expirar não é vender).
-- ------------------------------------------------------------
