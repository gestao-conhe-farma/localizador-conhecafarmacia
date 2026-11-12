-- ============================================================
-- 0061 · Avisar a farmácia quando um bloco de levantamento enche
--
-- PORQUÊ: desde a 0057 a capacidade por bloco existe e desde a 0060 é
-- visível — mas só a quem já está a olhar para a agenda. Quando o último
-- lugar de um bloco é ocupado, a farmácia precisa de saber sem ter de
-- fazer contas: é o sinal de que aquele intervalo fechou e de que os
-- próximos clientes vão ser recusados com JANELA_CHEIA.
--
-- COMO: um trigger AFTER INSERT em `reservations` conta as reservas
-- abertas do bloco e, ao atingir a capacidade, grava uma linha em
-- `pickup_slot_alerts`. O aviso nasce na MESMA transacção da reserva:
-- se a reserva não ficar gravada, o aviso também não.
--
--   • Uma linha por (farmácia, bloco) — `unique` + `on conflict do
--     nothing`. Um bloco que enche, esvazia e volta a encher não repete
--     o aviso; o que interessa é o facto de ter estado cheio.
--   • O trigger é só de INSERT: os movimentos de estado do portal
--     (0096/0010) nunca abrem reservas novas num bloco, e o cancelamento
--     só liberta lugares.
--   • `seen_at` é o «marcar como visto» da fila. A farmácia não apaga
--     avisos (sem DELETE); a linha fica como histórico da ocupação.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0061_pickup_slot_full_alerts.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. O aviso
-- ------------------------------------------------------------
create table if not exists localizador.pickup_slot_alerts (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references localizador.pharmacies(id) on delete cascade,
  -- Início do bloco, já alinhado como em create_reservation (0057/0060).
  slot        timestamptz not null,
  capacity    integer not null check (capacity >= 1),
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (pharmacy_id, slot)
);

comment on table localizador.pickup_slot_alerts is
  'Blocos de levantamento que encheram (0061). Um por farmácia e bloco; seen_at é o «visto» da fila. Nunca se apaga pela farmácia.';
comment on column localizador.pickup_slot_alerts.slot is
  'Início do bloco alinhado por epoch com pickup_slot_minutes — o mesmo cálculo de create_reservation e pickup_availability.';

create index if not exists pickup_slot_alerts_open_idx
  on localizador.pickup_slot_alerts (pharmacy_id, slot)
  where seen_at is null;

-- ------------------------------------------------------------
-- 2. O trigger: ao encher, avisar
-- ------------------------------------------------------------
create or replace function localizador.alert_full_pickup_slot()
returns trigger
language plpgsql
security definer
set search_path = localizador, public
as $$
declare
  v_minutes  integer;
  v_capacity integer;
  v_slot     timestamptz;
  v_booked   integer;
begin
  if new.pickup_at is null
     or new.status not in ('pendente', 'confirmada', 'pronta') then
    return new;
  end if;

  select ph.pickup_slot_minutes, ph.pickup_slot_capacity
    into v_minutes, v_capacity
    from localizador.pharmacies ph
   where ph.id = new.pharmacy_id;

  if not found then
    return new;
  end if;

  v_minutes  := greatest(coalesce(v_minutes, 60), 15);
  v_capacity := greatest(coalesce(v_capacity, 5), 1);

  v_slot := to_timestamp(
    floor(extract(epoch from new.pickup_at) / (v_minutes * 60)) * (v_minutes * 60)
  );

  select count(*)
    into v_booked
    from localizador.reservations r
   where r.pharmacy_id = new.pharmacy_id
     and r.status in ('pendente', 'confirmada', 'pronta')
     and r.pickup_at >= v_slot
     and r.pickup_at < v_slot + make_interval(mins => v_minutes);

  -- `>=`: o bloco pode já ter sido dado como cheio e a reserva anterior
  -- ter sido cancelada — voltar a encher merece na mesma o aviso? Não:
  -- a linha existe e o unique impede repetir. O `>=` garante que o
  -- último lugar também avisa.
  if v_booked >= v_capacity then
    insert into localizador.pickup_slot_alerts (pharmacy_id, slot, capacity)
    values (new.pharmacy_id, v_slot, v_capacity)
    on conflict (pharmacy_id, slot) do nothing;
  end if;

  return new;
end
$$;

drop trigger if exists trg_pickup_slot_alert on localizador.reservations;
create trigger trg_pickup_slot_alert
  after insert on localizador.reservations
  for each row
  execute function localizador.alert_full_pickup_slot();

-- ------------------------------------------------------------
-- 3. RLS — cada farmácia vê e fecha os seus avisos
-- ------------------------------------------------------------
alter table localizador.pickup_slot_alerts enable row level security;

drop policy if exists "pickup alerts own read" on localizador.pickup_slot_alerts;
create policy "pickup alerts own read"
  on localizador.pickup_slot_alerts for select
  using (localizador.is_own_pharmacy(pharmacy_id));

drop policy if exists "pickup alerts own seen" on localizador.pickup_slot_alerts;
create policy "pickup alerts own seen"
  on localizador.pickup_slot_alerts for update
  using (localizador.is_own_pharmacy(pharmacy_id))
  with check (localizador.is_own_pharmacy(pharmacy_id));

-- ------------------------------------------------------------
-- 4. Privilégios
-- ------------------------------------------------------------
revoke all on localizador.pickup_slot_alerts from anon, authenticated, service_role;

grant select (id, pharmacy_id, slot, capacity, seen_at, created_at)
  on localizador.pickup_slot_alerts to authenticated;
-- Só o «visto»: a farmácia não reescreve o bloco nem a capacidade.
grant update (seen_at) on localizador.pickup_slot_alerts to authenticated;

grant select, insert, update on localizador.pickup_slot_alerts to service_role;
revoke delete on localizador.pickup_slot_alerts from service_role;

-- ------------------------------------------------------------
-- 5. Verificação
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_pickup_slot_alert'
       and tgrelid = 'localizador.reservations'::regclass
  ) then
    raise exception 'trigger trg_pickup_slot_alert ausente';
  end if;

  if has_table_privilege('anon', 'localizador.pickup_slot_alerts', 'SELECT') then
    raise exception 'anon consegue ler os avisos de bloco cheio';
  end if;

  if has_table_privilege('authenticated', 'localizador.pickup_slot_alerts', 'INSERT') then
    raise exception 'authenticated pode criar avisos de bloco cheio';
  end if;

  if has_table_privilege('authenticated', 'localizador.pickup_slot_alerts', 'DELETE')
     or has_table_privilege('service_role', 'localizador.pickup_slot_alerts', 'DELETE') then
    raise exception 'avisos de bloco cheio apagáveis';
  end if;

  if not has_column_privilege(
       'authenticated',
       'localizador.pickup_slot_alerts',
       'seen_at',
       'UPDATE'
     ) then
    raise exception 'a farmácia não consegue marcar o aviso como visto';
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- Verificação funcional
--   scripts/test-pickup-slot-alert.py — encher um bloco cria UM aviso,
--   a repetição não duplica, o segundo bloco avisa à parte, a farmácia
--   marca como visto e o aviso deixa de estar aberto.
-- ------------------------------------------------------------
