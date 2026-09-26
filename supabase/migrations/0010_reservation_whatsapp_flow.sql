-- ============================================================
-- 0010 · Fluxo de reservas WhatsApp-first
--
-- Três peças, na ordem em que o fluxo as usa:
--   1. TTL de 72h — pendentes sem resposta tornam-se 'expirada'
--      automaticamente (pg_cron a cada 15 min). A farmácia vê o
--      que morreu por silêncio em vez de acumular fantasmas.
--   2. confirmed_quantity — a farmácia pode confirmar com menos
--      unidades do que as pedidas ("só tenho 1 de 2"). O trigger
--      da 0006 passa a baixar o stock pela quantidade confirmada
--      quando existir (coalesce(confirmed_quantity, quantity)).
--   3. client_contacted_at — rasto mínimo de comunicação: marcado
--      quando o atendente abre o WhatsApp do cliente. Sem gateway
--      de SMS, é o que permite saber "esta reserva já foi avisada?".
--
-- + reason text: motivo da recusa/expiração, reutilizado pelo
--   template de WhatsApp e pela página de acompanhamento.
--
-- Aplicar no SQL Editor do dashboard ou via scripts/apply-migration.py.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas novas (idempotente)
-- ------------------------------------------------------------
alter table public.reservations
  add column if not exists confirmed_quantity integer,
  add column if not exists client_contacted_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists reason text;

-- quantity confirmada, quando existe, obedece à mesma regra da pedida.
alter table public.reservations
  drop constraint if exists reservations_confirmed_quantity_check;
alter table public.reservations
  add constraint reservations_confirmed_quantity_check
  check (confirmed_quantity is null or confirmed_quantity >= 0);

-- ------------------------------------------------------------
-- 2. Novo estado 'expirada' no CHECK
--    O CHECK antigo (0001) tem nome gerado — recria-se com nome
--    próprio para o drop ser determinístico.
-- ------------------------------------------------------------
alter table public.reservations
  drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pendente','confirmada','pronta','concluida','recusada','expirada'));

-- ------------------------------------------------------------
-- 3. Backfill do TTL nas pendentes já existentes
--    Reservas criadas antes da migração: o prazo conta a partir de
--    agora (não de created_at, que já passou de 72h à procura).
--    Preencher created_at + 72h pisaria reservas antigas com prazo
--    já vencido e o primeiro run do cron expiraria tudo de uma vez.
-- ------------------------------------------------------------
update public.reservations
   set expires_at = now() + interval '72 hours'
 where status = 'pendente'
   and expires_at is null;

-- Default para futuras: o Server Action também define, mas o default
-- protege inserções directas (SQL, integrções futuras).
alter table public.reservations
  alter column expires_at set default now() + interval '72 hours';

-- ------------------------------------------------------------
-- 4. Função de expiração + pg_cron (a cada 15 min)
--    UPDATE directo, sem função por-linha: um scan indexado resolve.
--    Realtime: a tabela já está na publication (0005) — a expiração
--    em massa chega à fila ao vivo.
-- ------------------------------------------------------------
-- Índice do scan do cron: só pendentes, só as colunas do WHERE.
create index if not exists reservations_pendentes_ttl_idx
  on public.reservations (expires_at)
  where status = 'pendente';

create extension if not exists pg_cron;

-- Idempotente: desagendar antes de (re)agendar.
select cron.unschedule('expire-stale-reservations')
where exists (select 1 from cron.job where jobname = 'expire-stale-reservations');

select cron.schedule(
  'expire-stale-reservations',
  '*/15 * * * *',
  $$
  update public.reservations
     set status      = 'expirada',
         reason      = coalesce(reason, 'ttl'),
         resolved_at = now()
   where status = 'pendente'
     and expires_at is not null
     and expires_at < now()
  $$
);

-- ------------------------------------------------------------
-- 5. Trigger da 0006 — baixa stock pela quantidade confirmada
--    create or replace mantém o trigger existente; só a lógica muda.
--    Mudança: taken = coalesce(confirmed_quantity, quantity) — a
--    farmácia separou X, é X que sai do stock.
-- ------------------------------------------------------------
create or replace function public.apply_reservation_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    from public.stock_items s
   where s.id = new.stock_item_id;

  if not found then
    return new;
  end if;

  -- Sem quantidade reportada não há o que baixar (semântica da 0006).
  if current_qty is null then
    update public.stock_items
       set confirmed_at = now(),
           updated_by   = auth.uid()
     where id = new.stock_item_id;
    return new;
  end if;

  -- NOVO (0010): a quantidade efetivamente separada — o ajuste da
  -- farmácia ("só tenho 1 de 2") é o que conta, não o pedido original.
  taken   := greatest(coalesce(new.confirmed_quantity, new.quantity, 0), 0);
  new_qty := greatest(current_qty - taken, 0);

  update public.stock_items
     set quantity     = new_qty,
         in_stock     = case when new_qty <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id;

  return new;
end
$$;

-- ------------------------------------------------------------
-- 6. Verificação
-- ------------------------------------------------------------
--   select conname from pg_constraint
--    where conrelid = 'public.reservations'::regclass
--      and conname in ('reservations_status_check','reservations_confirmed_quantity_check');
--
--   select jobname, schedule from cron.job where jobname = 'expire-stale-reservations';
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.reservations'::regclass
--      and tgname = 'trg_reservation_stock_decrement';
