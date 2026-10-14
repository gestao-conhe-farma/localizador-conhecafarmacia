-- ============================================================
-- 0023 · Credenciais para terceiros (chaves de API, scopes, webhooks)
--
-- É o que a ideia 1 do plano 2026-10-12 pede: o sistema de gestão da
-- farmácia (ou um middleware, ou um ficheiro exportado) passa a poder
-- escrever stock no Localizador sem ninguém tocar no portal.
--
-- Desenho validado na pesquisa de 2026-10-13 (OWASP REST/Webhook,
-- Stripe, GitHub, Supabase):
--   • A chave é uma credencial RANDOM (256 bits), não uma password:
--     guarda-se HMAC-SHA-256(token, pepper) — hash rápido, porque é
--     verificado em TODOS os pedidos; bcrypt/argon2 aqui só criava
--     um DoS. O pepper vive no ambiente (nunca na BD) e o hash é
--     comparado em tempo constante.
--   • Formato com selector público: `cfk_<key_id>_<segredo>`. O
--     `key_id` é o que se indexa (busca O(1)); o segredo nunca é
--     guardado em claro nem volta a ser mostrado (uma única vez, na
--     criação).
--   • Scopes mínimos: `stock:read` e `stock:write` (sem wildcards).
--     Uma chave pertence SEMPRE a uma farmácia — o pharmacy_id vem da
--     chave, nunca do corpo do pedido.
--   • Expiração, revogação imediata, `last_used_at` e contagem de
--     pedidos para a farmácia ver o que está a acontecer.
--   • Rate-limit por chave em janela fixa, atómico no Postgres
--     (INSERT ... ON CONFLICT), com a conta a sobreviver ao 429.
--   • Log de chamadas SEM payload e SEM dados pessoais: rota, estado,
--     quantas linhas passaram/falharam, idempotência e duração.
--   • Webhooks: só CONFIGURAÇÃO nesta fase (decisão do owner,
--     2026-10-13) — o envio com fila/assinatura HMAC/retries fica para
--     a fase seguinte; não se guarda segredo nenhum enquanto não
--     houver entrega (o segredo nascerá aí, no Vault).
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0023_pharmacy_api_keys.sql
--
-- Re-executável: se uma corrida anterior falhou a meio (ou se a tabela
-- nasceu com a forma antiga), correr o ficheiro outra vez converge — ver
-- §1b (reconciliação da coluna rate_limit_per_minute).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chaves
-- ------------------------------------------------------------
create table if not exists public.pharmacy_api_keys (
  id             uuid primary key default gen_random_uuid(),
  pharmacy_id    uuid not null references public.pharmacies(id) on delete cascade,

  name           text not null check (char_length(name) between 2 and 60),
  key_id         text not null unique,   -- selector público (indexado)
  key_hash       text not null,          -- HMAC-SHA-256(token, pepper) em hex
  key_last4      text not null,          -- só para a lista do portal

  scopes         text[] not null default array['stock:write']::text[],
  -- Pedidos por minuto (janela fixa). 120 é folgado para sincronização
  -- periódica; baixa-se por chave se um parceiro abusar. O check vai
  -- como constraint nomeada mais abaixo (idempotente, ver §1b).
  rate_limit_per_minute integer not null default 120,
  active         boolean not null default true,
  revoked_at     timestamptz,
  revoked_reason text,
  expires_at     timestamptz,

  last_used_at   timestamptz,
  request_count  bigint not null default 0,

  created_by     uuid,
  created_at     timestamptz not null default now(),

  check (revoked_at is null or active = false),
  check (cardinality(scopes) >= 1),
  check (scopes <@ array['stock:read','stock:write']::text[])
);

comment on table public.pharmacy_api_keys is
  'Chaves de API por farmácia (credencial de terceiros). Só o hash HMAC vive aqui; a chave é mostrada uma única vez.';
comment on column public.pharmacy_api_keys.key_id is
  'Selector público da chave (cfk_<key_id>_<segredo>) — identifica a linha sem revelar o segredo.';

create index if not exists pharmacy_api_keys_pharmacy_idx
  on public.pharmacy_api_keys (pharmacy_id, created_at desc);

-- ------------------------------------------------------------
-- 1b. Reconciliar tabela pré-existente
--     `create table if not exists` NÃO altera tabelas já criadas: uma
--     primeira corrida interrompida (ex.: erro mais abaixo no ficheiro)
--     deixa a tabela com a forma antiga e a coluna nova nunca chega a
--     existir — foi o que fez falhar o grant de colunas com
--     "column rate_limit_per_minute does not exist". Estas duas
--     instruções tornam o ficheiro re-executável sem risco.
-- ------------------------------------------------------------
alter table public.pharmacy_api_keys
  add column if not exists rate_limit_per_minute integer not null default 120;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pharmacy_api_keys'::regclass
      and conname = 'pharmacy_api_keys_rate_limit_check'
  ) then
    alter table public.pharmacy_api_keys
      add constraint pharmacy_api_keys_rate_limit_check
      check (rate_limit_per_minute between 1 and 100000);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Rate-limit (janela fixa por chave) + verificação atómica
-- ------------------------------------------------------------
create table if not exists public.api_rate_windows (
  api_key_id   uuid not null references public.pharmacy_api_keys(id) on delete cascade,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (api_key_id, window_start)
);

comment on table public.api_rate_windows is
  'Contadores de pedidos por chave e janela (janela fixa). Limpos automaticamente.';

-- Devolve {allowed, hits, limit, retry_after}. O incremento acontece
-- mesmo quando o pedido é recusado (a conta não se repõe por dizer não).
create or replace function public.api_rate_consume(
  p_key_id          uuid,
  p_limit           integer,
  p_window_seconds  integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.api_rate_windows (api_key_id, window_start, hits)
  values (p_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
    do update set hits = public.api_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista (2% dos pedidos): as janelas antigas não servem
  -- para nada e esta tabela é escrita em todos os pedidos.
  if random() < 0.02 then
    delete from public.api_rate_windows where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end;
$$;

revoke execute on function public.api_rate_consume(uuid, integer, integer) from public;
grant execute on function public.api_rate_consume(uuid, integer, integer) to service_role;

-- ------------------------------------------------------------
-- 3. Log de chamadas (auditoria sem PII nem payload)
-- ------------------------------------------------------------
create table if not exists public.api_request_log (
  id              bigserial primary key,
  pharmacy_id     uuid references public.pharmacies(id) on delete cascade,
  api_key_id      uuid references public.pharmacy_api_keys(id) on delete set null,
  route           text not null,
  method          text not null,
  status          integer not null,
  items_ok        integer,
  items_error     integer,
  error_code      text,
  idempotency_key text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

comment on table public.api_request_log is
  'Auditoria das chamadas de terceiros: rota, estado, contagens e duração. Nunca guarda payloads nem dados pessoais.';

create index if not exists api_request_log_pharmacy_idx
  on public.api_request_log (pharmacy_id, created_at desc);

-- ------------------------------------------------------------
-- 4. Endpoints de webhook (configuração; entrega numa fase seguinte)
-- ------------------------------------------------------------
create table if not exists public.pharmacy_webhooks (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  url         text not null
              check (url ~* '^https://' and char_length(url) <= 500),
  description text check (description is null or char_length(description) <= 120),
  events      text[] not null default array['stock.updated']::text[],
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (cardinality(events) >= 1),
  check (events <@ array['stock.updated','reserva.created','reserva.concluded','import.finished']::text[])
);

comment on table public.pharmacy_webhooks is
  'Destinos de webhook registados pela farmácia. Sem entrega nesta fase: o dispatcher com assinatura HMAC e fila vem a seguir.';

create index if not exists pharmacy_webhooks_pharmacy_idx
  on public.pharmacy_webhooks (pharmacy_id);

-- ------------------------------------------------------------
-- 5. RLS e privilégios
--    Leitura pela própria farmácia (portal) e equipa CF; escrita
--    apenas via service-role nas Server Actions/rotas de servidor.
--    key_hash fica FORA do grant de colunas (como o pin_hash na 0018).
-- ------------------------------------------------------------
alter table public.pharmacy_api_keys enable row level security;
alter table public.api_rate_windows   enable row level security;
alter table public.api_request_log   enable row level security;
alter table public.pharmacy_webhooks enable row level security;

-- api_rate_windows fica com RLS LIGADO e SEM políticas (ninguém lê
-- contadores pelo PostgREST); só a função api_rate_consume — security
-- definer, do dono da tabela, que por isso não passa pelas políticas —
-- lhe toca. É o que o aviso do SQL editor da Supabase pede.

drop policy if exists "api keys pharmacy read" on public.pharmacy_api_keys;
create policy "api keys pharmacy read"
  on public.pharmacy_api_keys for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

drop policy if exists "api log pharmacy read" on public.api_request_log;
create policy "api log pharmacy read"
  on public.api_request_log for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

drop policy if exists "webhooks pharmacy read" on public.pharmacy_webhooks;
create policy "webhooks pharmacy read"
  on public.pharmacy_webhooks for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.pharmacy_api_keys from anon, authenticated;
revoke all on public.api_rate_windows  from anon, authenticated;
revoke all on public.api_request_log   from anon, authenticated;
revoke all on public.pharmacy_webhooks from anon, authenticated;

grant select (
  id, pharmacy_id, name, key_id, key_last4, scopes, rate_limit_per_minute, active,
  revoked_at, revoked_reason, expires_at, last_used_at, request_count, created_at
) on public.pharmacy_api_keys to authenticated;

grant select on public.api_request_log   to authenticated, service_role;
grant select on public.pharmacy_webhooks to authenticated, service_role;

-- ============================================================
-- Verificação (depois de aplicar):
--   select to_regclass('public.pharmacy_api_keys') as chaves,
--          to_regclass('public.api_rate_windows')  as rate,
--          to_regclass('public.api_request_log')   as log,
--          to_regclass('public.pharmacy_webhooks') as hooks;
--
--   -- key_hash não é legível pelo papel authenticated (esperado: false)
--   select has_column_privilege('authenticated','public.pharmacy_api_keys','key_hash','select');
--   select has_column_privilege('authenticated','public.pharmacy_api_keys','rate_limit_per_minute','select');
--
--   -- RLS ligado em todas as tabelas novas (esperado: rls = true nas 4)
--   select c.relname, c.relrowsecurity as rls
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in ('pharmacy_api_keys','api_rate_windows','api_request_log','pharmacy_webhooks')
--   order by 1;
--
--   -- rate-limit: 3 pedidos com limite 2 → 3º recusado
--   begin;
--     select public.api_rate_consume('<api_key_id>', 2) as p1;
--     select public.api_rate_consume('<api_key_id>', 2) as p2;
--     select public.api_rate_consume('<api_key_id>', 2) as p3;  -- allowed=false
--   rollback;
-- ============================================================
