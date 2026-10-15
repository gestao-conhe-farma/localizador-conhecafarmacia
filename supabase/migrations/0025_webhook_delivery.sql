-- ============================================================
-- 0025 · Entrega de webhooks de stock (fila, assinatura, tentativas)
--
-- A 0023 deixou os destinos REGISTADOS mas sem entrega («o dispatcher
-- com assinatura HMAC e fila vem a seguir»). Esta migração liga a
-- entrega — plano 2026-10-12, ideia 1 (chaves para terceiros).
--
-- Desenho validado na pesquisa de 2026-10-14 (Standard Webhooks 1.0,
-- Stripe/Svix/GitHub, OWASP SSRF):
--   • FILA DURÁVEL (outbox), não envio dentro do pedido que originou o
--     evento: um POST a um servidor de farmácia pode demorar 15 s ou
--     estar em baixo. Quem escreve stock (portal, CSV, API) só insere
--     no livro-razão; a entrega é de outro processo. É o que garante
--     que uma venda no balcão nunca falha por causa de um webhook.
--   • O evento nasce do MESMO sítio que já é a porta única de escrita
--     (`stock_movements`, 0020): o trigger vê TODAS as origens —
--     portal, CSV, API e baixas de reservas — sem tocar em nenhuma
--     delas.
--   • PAYLOAD CONGELADO na fila: o que o receptor recebe é o que o
--     movimento dizia no momento, não o estado de hoje. Um retry de
--     amanhã entrega o mesmo corpo (é o mesmo evento).
--   • IDEMPOTÊNCIA: `webhook-id` = id da entrega, estável em todas as
--     tentativas; quem recebe deduplica por ele (entrega at-least-once).
--   • ASSINATURA estilo Standard Webhooks: `webhook-signature:
--     v1,<base64(HMAC-SHA256(segredo, id.timestamp.corpo))>`, com
--     `webhook-timestamp` renovado a cada tentativa (janela anti-replay
--     de 5 min do lado de quem recebe).
--   • TENTATIVAS guardadas uma a uma (`webhook_attempts`): a farmácia
--     vê no portal o que o servidor dela respondeu, não só «falhou».
--   • SEGREDO por endpoint, mostrado UMA vez. Fica FORA do grant de
--     colunas do papel `authenticated` (como o key_hash na 0023): o
--     portal só o lê nas Server Actions com service-role, e é preciso
--     em claro para assinar.
--
-- Quem faz as tentativas: `app/api/cron/webhooks` (rota de servidor,
-- service-role, autorizada por CRON_SECRET) que chama
-- `webhook_claim_due` → POST → `webhook_record_attempt`. A agenda de
-- espera entre tentativas vive na aplicação (lib/webhooks.js), não aqui.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0025_webhook_delivery.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Segredo e saúde do endpoint
--    `secret` NULL = destino registado antes desta migração (ficou sem
--    segredo): o portal pede para gerar um antes de o ligar à fila.
--    Nunca se entrega a um endpoint sem segredo — melhor nada do que
--    um POST que o receptor não consegue verificar.
-- ------------------------------------------------------------
alter table public.pharmacy_webhooks
  add column if not exists secret           text,
  -- Últimos 4 caracteres do segredo: é o que o portal mostra na lista
  -- (como o key_last4 das chaves de API) para a farmácia reconhecer qual
  -- dos segredos está em uso sem voltar a revelá-lo.
  add column if not exists secret_last4     text,
  add column if not exists last_success_at  timestamptz,
  add column if not exists last_failure_at  timestamptz,
  add column if not exists failure_count    integer not null default 0,
  add column if not exists disabled_at      timestamptz,
  add column if not exists disabled_reason  text;

do $$
begin
  alter table public.pharmacy_webhooks
    add constraint pharmacy_webhooks_failure_count_check check (failure_count >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.pharmacy_webhooks.secret is
  'Segredo HMAC do endpoint (prefixo whsec_). Mostrado uma vez no portal; fora do grant de colunas de authenticated.';
comment on column public.pharmacy_webhooks.failure_count is
  'Entregas consecutivas falhadas. Volta a 0 ao primeiro sucesso. Serve para avisar no portal sem desligar nada sozinho.';
comment on column public.pharmacy_webhooks.disabled_at is
  'Preenchido quando o destino se desliga sozinho (410 Gone): o sistema do parceiro diz explicitamente que o endpoint acabou.';

-- ------------------------------------------------------------
-- 2. Fila de entregas (outbox) — uma linha por (evento, destino)
--    'pendente' → à espera de tentativa (ou de retry)
--    'entregue' → 2xx; 'falhado' → tentativas esgotadas ou erro
--                 permanente (4xx que não melhora a repetir); fica
--                 visível e com reenvio manual no portal.
-- ------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  webhook_id      uuid not null references public.pharmacy_webhooks(id) on delete cascade,

  event           text not null,
  payload         jsonb not null,

  status          text not null default 'pendente'
                  check (status in ('pendente','entregue','falhado')),

  attempts        integer not null default 0 check (attempts >= 0),
  max_attempts    integer not null default 10 check (max_attempts between 1 and 50),

  -- Quando toca a próxima tentativa (agenda com backoff na aplicação).
  next_attempt_at timestamptz not null default now(),
  -- Reserva da linha pelo worker (evita duas tentativas ao mesmo tempo);
  -- uma reserva antiga expira sozinha na função de claim.
  locked_at       timestamptz,
  locked_by       text,

  response_status integer,
  last_error      text,
  delivered_at    timestamptz,

  -- Rasto da origem (id do movimento, id da importação…). Serve também
  -- para NÃO duplicar a entrega do mesmo evento ao mesmo destino.
  source_ref      text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.webhook_deliveries is
  'Fila de entregas de webhook (outbox). O corpo fica congelado aqui: um retry entrega o mesmo evento, não o estado de hoje.';
comment on column public.webhook_deliveries.id is
  'Identificador estável do evento: é o `webhook-id` enviado em todas as tentativas (chave de deduplicação do receptor).';
comment on column public.webhook_deliveries.source_ref is
  'Origem do evento (movimento/importação). Impede que o mesmo evento entre duas vezes na fila do mesmo destino.';

-- O worker pergunta sempre «o que está pendente e já passou da hora».
create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status = 'pendente';

create index if not exists webhook_deliveries_hook_idx
  on public.webhook_deliveries (webhook_id, created_at desc);

create index if not exists webhook_deliveries_pharmacy_idx
  on public.webhook_deliveries (pharmacy_id, created_at desc);

-- Um evento, uma vez por destino.
-- Índice UNIQUE completo (sem WHERE): o `on conflict (webhook_id, event,
-- source_ref)` do trigger só é aceite com um índice que corresponda
-- exactamente a estas colunas — um índice parcial obrigaria a repetir o
-- predicado no insert. Entregas de teste (source_ref null) não colidem:
-- em SQL, NULL nunca é igual a NULL num índice único.
drop index if exists public.webhook_deliveries_event_idx;
create unique index if not exists webhook_deliveries_event_idx
  on public.webhook_deliveries (webhook_id, event, source_ref);

-- ------------------------------------------------------------
-- 3. Registo das tentativas — o que a farmácia vê no portal
-- ------------------------------------------------------------
create table if not exists public.webhook_attempts (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,

  attempt     integer not null check (attempt >= 1),
  status_code integer,
  -- Mensagem curta e SEGURA (nunca o corpo da resposta inteiro): é
  -- texto de outro servidor, mostrado no portal.
  error       text,
  duration_ms integer,

  created_at  timestamptz not null default now()
);

comment on table public.webhook_attempts is
  'Uma linha por tentativa de entrega (estado, duração, erro curto). É o «registo das tentativas» que o portal mostra.';

create index if not exists webhook_attempts_delivery_idx
  on public.webhook_attempts (delivery_id, attempt);

-- ------------------------------------------------------------
-- 4. RLS e privilégios
--    Leitura pela própria farmácia (portal) e equipa CF; escrita só
--    service-role (worker e Server Actions). O segredo fica de fora do
--    grant de colunas, como o key_hash na 0023.
-- ------------------------------------------------------------
alter table public.webhook_deliveries enable row level security;
alter table public.webhook_attempts   enable row level security;

drop policy if exists "webhook deliveries pharmacy read" on public.webhook_deliveries;
create policy "webhook deliveries pharmacy read"
  on public.webhook_deliveries for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

drop policy if exists "webhook attempts pharmacy read" on public.webhook_attempts;
create policy "webhook attempts pharmacy read"
  on public.webhook_attempts for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.webhook_deliveries from anon, authenticated;
revoke all on public.webhook_attempts   from anon, authenticated;

grant select on public.webhook_deliveries to authenticated, service_role;
grant select on public.webhook_attempts   to authenticated, service_role;

-- O segredo NÃO entra no grant de colunas de `authenticated` (o papel
-- do portal lê a tabela pelo PostgREST). O service_role mantém a tabela
-- inteira — é ele que assina.
revoke select on public.pharmacy_webhooks from authenticated;
grant select (
  id, pharmacy_id, url, description, events, active, created_by,
  created_at, updated_at, secret_last4, last_success_at, last_failure_at,
  failure_count, disabled_at, disabled_reason
) on public.pharmacy_webhooks to authenticated;

grant select on public.pharmacy_webhooks to service_role;

-- ------------------------------------------------------------
-- 5. Fan-out: cada movimento de stock entra na fila dos destinos
--    activos dessa farmácia. O trigger é AFTER INSERT no livro-razão,
--    por isso não atrasa nem altera a escrita do stock (e um erro aqui
--    aborta a transacção do movimento — a fila é parte do mesmo
--    compromisso, como o próprio movimento).
--
--    Eventos de RESERVA (movement_type = 'reserva', delta 0) ficam de
--    fora: não são mudança de saldo, e encher o parceiro de avisos que
--    não mexem em stock é a forma mais rápida de ele desligar tudo.
-- ------------------------------------------------------------
create or replace function public.webhook_fanout_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      from public.pharmacy_webhooks w
     where w.pharmacy_id = new.pharmacy_id
       and w.active
       and w.disabled_at is null
       and w.secret is not null
       and w.events @> array['stock.updated']::text[]
  ) then
    return new;
  end if;

  select l.lot_number, l.expires_at into v_lot, v_exp
    from public.stock_lots l
   where l.id = new.lot_id;

  -- O `id` NÃO é escrito aqui: é o id da ENTREGA (uma por destino) e
  -- tem de ser o mesmo que vai no cabeçalho `webhook-id` — é a chave de
  -- deduplicação de quem recebe. O movimento fica em `data.movement_id`.
  v_payload := jsonb_build_object(
    'event', 'stock.updated',
    'occurred_at', new.created_at,
    'pharmacy', (
      select jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name)
        from public.pharmacies p
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
      from public.pharmacy_webhooks w
     where w.pharmacy_id = new.pharmacy_id
       and w.active
       and w.disabled_at is null
       and w.secret is not null
       and w.events @> array['stock.updated']::text[]
  loop
    v_delivery := gen_random_uuid();
    insert into public.webhook_deliveries (id, pharmacy_id, webhook_id, event, payload, source_ref)
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

drop trigger if exists trg_webhook_fanout_movement on public.stock_movements;
create trigger trg_webhook_fanout_movement
  after insert on public.stock_movements
  for each row
  execute function public.webhook_fanout_movement();

-- ------------------------------------------------------------
-- 6. Portas do worker
-- ------------------------------------------------------------

-- 6a. Reservar as entregas que já passaram da hora. A reserva (locked)
--     expira em 2 minutos: um worker que morra a meio não deixa a fila
--     presa, e dois workers ao mesmo tempo não enviam o mesmo evento
--     (um deles não vê a linha — `skip locked`).
create or replace function public.webhook_claim_due(
  p_limit  integer default 20,
  p_worker text default 'cron'
)
returns table (
  delivery_id  uuid,
  webhook_id   uuid,
  pharmacy_id  uuid,
  url          text,
  secret       text,
  event        text,
  payload      jsonb,
  attempts     integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select d.id
      from public.webhook_deliveries d
     where d.status = 'pendente'
       and d.next_attempt_at <= now()
       and (d.locked_at is null or d.locked_at < now() - interval '2 minutes')
     order by d.next_attempt_at asc
     limit greatest(least(p_limit, 100), 1)
     for update skip locked
  ), claimed as (
    update public.webhook_deliveries d
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
    join public.pharmacy_webhooks w on w.id = c.webhook_id
   order by c.next_attempt_at asc;
end;
$$;

revoke execute on function public.webhook_claim_due(integer, text) from public;
grant execute on function public.webhook_claim_due(integer, text) to service_role;

-- 6b. Registar o resultado de uma tentativa e decidir o que se segue.
--     `p_retry_seconds` vem da aplicação (agenda com jitter, medida em
--     lib/webhooks.js); `p_permanent` marca os 4xx/3xx que não vale a
--     pena repetir; `p_disable` (410 Gone) desliga o destino.
create or replace function public.webhook_record_attempt(
  p_delivery_id   uuid,
  p_status_code   integer default null,
  p_error         text default null,
  p_duration_ms   integer default null,
  p_ok            boolean default false,
  p_retry_seconds integer default null,
  p_permanent     boolean default false,
  p_disable       boolean default false,
  p_disable_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_attempt  integer;
  v_status   text;
begin
  select * into v_delivery
    from public.webhook_deliveries
   where id = p_delivery_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENTREGA_NAO_EXISTE');
  end if;

  v_attempt := v_delivery.attempts + 1;

  insert into public.webhook_attempts (
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

  update public.webhook_deliveries
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
    update public.pharmacy_webhooks
       set last_success_at = now(),
           failure_count   = 0,
           updated_at      = now()
     where id = v_delivery.webhook_id;
  else
    update public.pharmacy_webhooks
       set last_failure_at = now(),
           failure_count   = failure_count + 1,
           updated_at      = now()
     where id = v_delivery.webhook_id;
  end if;

  -- «Gone» é a única resposta que desliga sozinha: o parceiro disse
  -- explicitamente que aquele endereço acabou. Tudo o resto fica
  -- visível no portal para a farmácia decidir.
  if p_disable then
    update public.pharmacy_webhooks
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

revoke execute on function public.webhook_record_attempt(
  uuid, integer, text, integer, boolean, integer, boolean, boolean, text
) from public;
grant execute on function public.webhook_record_attempt(
  uuid, integer, text, integer, boolean, integer, boolean, boolean, text
) to service_role;

-- 6c. Reenvio manual (portal). Só dentro da própria farmácia: o
--     pharmacy_id é comparado, nunca confiado.
create or replace function public.webhook_replay(
  p_delivery_id uuid,
  p_pharmacy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
    from public.webhook_deliveries
   where id = p_delivery_id
     and pharmacy_id = p_pharmacy_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ENTREGA_NAO_EXISTE');
  end if;

  update public.webhook_deliveries
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
  update public.pharmacy_webhooks
     set active = true, disabled_at = null, disabled_reason = null, updated_at = now()
   where id = v_row.webhook_id
     and disabled_at is not null;

  return jsonb_build_object('ok', true, 'delivery_id', p_delivery_id);
end;
$$;

revoke execute on function public.webhook_replay(uuid, uuid) from public;
grant execute on function public.webhook_replay(uuid, uuid) to service_role;

-- 6d. Retenção: entregas e tentativas antigas saem (30 dias), como na
--     pesquisa (payloads de eventos não são arquivo eterno).
create or replace function public.webhook_prune(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.webhook_deliveries
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
     and status in ('entregue','falhado');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.webhook_prune(integer) from public;
grant execute on function public.webhook_prune(integer) to service_role;

-- ============================================================
-- Verificação (depois de aplicar):
--   -- 1. Tabelas e trigger criados
--   select to_regclass('public.webhook_deliveries') as entregas,
--          to_regclass('public.webhook_attempts')   as tentativas;
--   select tgname from pg_trigger
--    where tgrelid = 'public.stock_movements'::regclass
--      and tgname = 'trg_webhook_fanout_movement';
--
--   -- 2. O segredo NÃO é legível pelo papel do portal (esperado: false)
--   select has_column_privilege('authenticated','public.pharmacy_webhooks','secret','select');
--
--   -- 3. RLS ligado nas duas tabelas novas (esperado: rls = true)
--   select c.relname, c.relrowsecurity as rls
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in ('webhook_deliveries','webhook_attempts');
--
--   -- 4. Fan-out a funcionar (teste descartável, com um destino activo):
--   begin;
--     insert into public.pharmacy_webhooks (pharmacy_id, url, secret)
--       values ('<pharmacy_id>', 'https://exemplo.test/hook', 'whsec_teste');
--     select public.post_stock_change('<pharmacy_id>','<drug_id>','entrada', 1, null, null,
--              'portal','teste',null,null,'verificacao-0025');
--     select event, status, payload->'data'->>'drug' as medicamento
--       from public.webhook_deliveries order by created_at desc limit 1;
--   rollback;
-- ============================================================
