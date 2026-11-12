-- ============================================================
-- 0056 · P2 fechado: rate-limit atómico por telefone + auto-recusa
--
-- A. RATE-LIMIT POR TELEFONE ATÓMICO
--    O limite de 5/hora era contado com um count seguido de insert em
--    chamadas separadas: uma rajada concorrente lia o mesmo total e
--    passava toda. Passa a haver um contador por janela fixa, com
--    UPSERT ... DO UPDATE SET hits = hits + 1 RETURNING — o mesmo
--    padrão do limite por IP (lead_rate_consume).
--
--    A chave é o hash do telefone (o formulário envia só o hash): a
--    tabela de janelas não guarda números em claro. O limite continua
--    a ser 5 por hora, agora contando TENTATIVAS (como o IP), não só
--    reservas criadas.
--
-- B. AUTO-RECUSAR PENDENTES QUANDO O STOCK CHEGA A 0
--    Uma reserva pendente podia ficar à espera de um produto que já
--    não existe (a conclusão de outra reserva, ou um ajuste manual,
--    levava o saldo a 0 e a pendente continuava aberta). Um trigger
--    em stock_items fecha as pendentes desse item com
--    reason = 'sem_stock' e resolved_at — o cliente vê a recusa em vez
--    de esperar indefinidamente, e o contador de unidades presas
--    liberta-as (0054).
--
--    Só 'pendente': 'confirmada'/'pronta' são compromissos que a
--    farmácia já assumiu e resolve à mão.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0056_p2_rate_limit_auto_reject.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela de janelas do limite por telefone
-- ------------------------------------------------------------
create table if not exists localizador.reservation_rate_windows (
  rate_key     text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  constraint reservation_rate_windows_pkey primary key (rate_key, window_start)
);

comment on table localizador.reservation_rate_windows is
  'Contadores do limite de reservas por telefone (janela fixa). A chave é o hash do número; limpos oportunisticamente pela própria função.';

create index if not exists reservation_rate_windows_start_idx
  on localizador.reservation_rate_windows (window_start);

alter table localizador.reservation_rate_windows enable row level security;
revoke all on localizador.reservation_rate_windows from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Contador atómico
-- ------------------------------------------------------------
create or replace function localizador.reservation_rate_consume(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer default 3600
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  v_key    text;
  v_window timestamptz;
  v_hits   integer;
  v_retry  integer;
begin
  v_key := substr(trim(coalesce(p_key, '')), 1, 80);
  if v_key = '' then
    v_key := 'unknown';
  end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'reservation_rate_consume: parâmetros inválidos';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  -- Atómico: o incremento e a leitura são a mesma instrução.
  insert into localizador.reservation_rate_windows (rate_key, window_start, hits)
  values (v_key, v_window, 1)
  on conflict (rate_key, window_start)
    do update set hits = localizador.reservation_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista (2% dos pedidos): janelas antigas não servem.
  if random() < 0.02 then
    delete from localizador.reservation_rate_windows
     where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end
$$;

revoke all on function localizador.reservation_rate_consume(text, integer, integer) from public;
grant execute on function localizador.reservation_rate_consume(text, integer, integer)
  to service_role;

-- ------------------------------------------------------------
-- 3. Auto-recusa das pendentes quando o saldo chega a 0
-- ------------------------------------------------------------
create or replace function localizador.reject_pending_on_empty_stock()
returns trigger
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
begin
  update localizador.reservations
     set status      = 'recusada',
         reason      = 'sem_stock',
         resolved_at = now()
   where stock_item_id = new.id
     and status = 'pendente';
  return null;
end
$$;

revoke all on function localizador.reject_pending_on_empty_stock() from public;

drop trigger if exists trg_reject_pending_on_empty_stock on localizador.stock_items;

create trigger trg_reject_pending_on_empty_stock
  after update of quantity on localizador.stock_items
  for each row
  when (
    new.quantity is not null
    and new.quantity <= 0
    and old.quantity is distinct from new.quantity
  )
  execute function localizador.reject_pending_on_empty_stock();

-- ------------------------------------------------------------
-- 4. Fecho único dos pendentes que já estão parados a zero
--    Mesma regra que passa a ser automática. Idempotente (só toca em
--    pendentes com quantity = 0); item sem quantidade reportada
--    (null) não é tocado.
-- ------------------------------------------------------------
update localizador.reservations r
   set status      = 'recusada',
       reason      = 'sem_stock',
       resolved_at = now()
  from localizador.stock_items s
 where s.id = r.stock_item_id
   and s.quantity = 0
   and r.status = 'pendente';

-- ------------------------------------------------------------
-- 5. Verificação
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'localizador.stock_items'::regclass
       and tgname = 'trg_reject_pending_on_empty_stock'
  ) then
    raise exception 'trigger trg_reject_pending_on_empty_stock ausente';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'localizador'
       and p.proname = 'reservation_rate_consume'
  ) then
    raise exception 'função reservation_rate_consume ausente';
  end if;

  if position('reservation_rate_windows' in pg_get_functiondef(
       'localizador.reservation_rate_consume(text, integer, integer)'::regprocedure
     )) = 0 then
    raise exception 'reservation_rate_consume não usa a tabela de janelas';
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação de concorrência
--   scripts/test-reservation-rate-limit.py — 8 pedidos em paralelo com
--     limite 5 → exactamente 5 allowed, 3 recusados.
--   scripts/test-pending-auto-reject.py — pendentes fechadas com
--     sem_stock quando o saldo vai a 0; confirmada intacta.
-- ------------------------------------------------------------
