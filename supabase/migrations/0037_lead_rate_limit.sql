-- ============================================================
-- 0037 · MÉDIO 1 — rate-limit do formulário de leads na BD
--
-- A rota /api/leads limitava em memória (Map por instância
-- serverless): cada instância da Vercel tinha o seu contador e o
-- restart limpava tudo — bastava espalhar submissões para contornar.
-- O limite passa a atómico na BD, no mesmo modelo do
-- api_rate_consume (0023): janela fixa + upsert com incremento.
--
-- Chave: o IP do cliente (texto, até 45 chars para IPv6). Sem RLS a
-- abrir: tabela com RLS ligado e SEM policies (só a função
-- security definer, só service_role a executa).
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0037_lead_rate_limit.sql
-- ============================================================

create table if not exists public.lead_rate_windows (
  ip           text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (ip, window_start)
);

comment on table public.lead_rate_windows is
  'Contadores do formulário público de leads por IP e janela (fixa). Limpos automaticamente.';

-- Devolve {allowed, hits, limit, retry_after}. O incremento acontece
-- mesmo quando o pedido é recusado (a conta não se repõe por dizer não).
create or replace function public.lead_rate_consume(
  p_ip              text,
  p_limit           integer,
  p_window_seconds  integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.lead_rate_windows (ip, window_start, hits)
  values (v_ip, v_window, 1)
  on conflict (ip, window_start)
    do update set hits = public.lead_rate_windows.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer,
    1
  );

  -- Limpeza oportunista (2% dos pedidos): janelas antigas não servem
  -- para nada e esta tabela é escrita em todas as submissões.
  if random() < 0.02 then
    delete from public.lead_rate_windows where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', v_retry
  );
end;
$$;

revoke execute on function public.lead_rate_consume(text, integer, integer) from public;
grant execute on function public.lead_rate_consume(text, integer, integer) to service_role;

alter table public.lead_rate_windows enable row level security;

-- RLS ligado SEM policies: ninguém lê contadores pelo PostgREST; só a
-- função acima (security definer) toca na tabela.
revoke all on public.lead_rate_windows from anon, authenticated;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
-- select public.lead_rate_consume('9.9.9.9', 5) as p1;
-- select public.lead_rate_consume('9.9.9.9', 5) as p2; -- hits = 2
-- select * from public.lead_rate_windows where ip = '9.9.9.9';
-- (limpar o teste: delete from public.lead_rate_windows where ip = '9.9.9.9';)
