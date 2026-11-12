-- ============================================================
-- 0064 · M5 — limite de tentativas de login e registo de falhas
--
-- O login da farmácia e da área interna não tinha limite próprio: o
-- único travão era o limite global do GoTrue (por projecto, não por
-- conta), e as falhas só existiam nos logs da Vercel. Um ataque de
-- password spraying podia correr sem alarme e, no limite, fechar o login
-- a toda a gente.
--
-- Esta migração acrescenta:
--   1. `auth_rate_windows` — contadores atómicos por (scope, chave), no
--      mesmo padrão de `lead_rate_windows` (0037);
--   2. `auth_failures` — registo consultável das falhas, com hash do
--      e-mail e do IP (nunca o endereço em claro);
--   3. `auth_rate_consume(scope, chave, limite, janela)` — a única porta
--      para os contadores, `security definer` e só para service_role.
--
-- As duas tabelas ficam com RLS e sem grants a clientes: o browser nunca
-- lê contadores nem falhas.
-- ============================================================

create table if not exists localizador.auth_rate_windows (
  scope text not null,
  chave text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (scope, chave, window_start)
);

create table if not exists localizador.auth_failures (
  id bigint generated always as identity primary key,
  -- 'portal' | 'interno' — separa os dois logins.
  scope text not null,
  -- SHA-256 do e-mail normalizado: dá para correlacionar sem guardar PII.
  email_ref text not null,
  ip_hash text,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists auth_failures_conta_idx
  on localizador.auth_failures (scope, email_ref, created_at desc);

alter table localizador.auth_rate_windows enable row level security;
alter table localizador.auth_failures enable row level security;

revoke all on localizador.auth_rate_windows from public, anon, authenticated;
revoke all on localizador.auth_failures from public, anon, authenticated;

create or replace function localizador.auth_rate_consume(
  p_scope text,
  p_chave text,
  p_limit integer,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = localizador
as $$
declare
  v_scope text;
  v_chave text;
  v_window timestamptz;
  v_hits integer;
  v_retry integer;
begin
  v_scope := substr(trim(coalesce(p_scope, '')), 1, 20);
  v_chave := substr(trim(coalesce(p_chave, '')), 1, 80);
  if v_scope = '' or v_chave = '' then
    raise exception 'auth_rate_consume: scope/chave em falta';
  end if;
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'auth_rate_consume: parâmetros inválidos';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into localizador.auth_rate_windows (scope, chave, window_start, hits)
  values (v_scope, v_chave, v_window, 1)
  on conflict (scope, chave, window_start)
    do update set hits = localizador.auth_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista: janelas antigas não servem para nada.
  if random() < 0.02 then
    delete from localizador.auth_rate_windows where window_start < now() - interval '1 day';
    delete from localizador.auth_failures where created_at < now() - interval '90 days';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end;
$$;

revoke execute on function localizador.auth_rate_consume(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function localizador.auth_rate_consume(text, text, integer, integer)
  to service_role;

-- ------------------------------------------------------------
-- Verificação (falha a migração se a porta ficar aberta)
-- ------------------------------------------------------------
do $$
begin
  if has_function_privilege(
    'anon', 'localizador.auth_rate_consume(text,text,integer,integer)', 'execute'
  ) then
    raise exception 'M5: anon consegue executar auth_rate_consume';
  end if;
  if has_table_privilege('anon', 'localizador.auth_failures', 'select') then
    raise exception 'M5: anon consegue ler auth_failures';
  end if;
  if has_table_privilege('authenticated', 'localizador.auth_rate_windows', 'select') then
    raise exception 'M5: authenticated consegue ler auth_rate_windows';
  end if;
end $$;
