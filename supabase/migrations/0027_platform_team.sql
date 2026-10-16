-- ============================================================
-- 0027 · Níveis internos da Equipa Conheça Farmácia + trilha de auditoria
--
-- PORQUÊ: a equipa CF não tem hoje nenhuma conta na plataforma (medido em
-- 16/10/2026: 0 linhas em admin_users com papel de equipa) e criar
-- farmácias e contas é um `node scripts/create-pharmacy-user.js` corrido
-- à mão com a service-role de um portátil: sem rasto de quem fez o quê.
-- Esta migração dá-lhe (a) níveis internos com menor privilégio e (b) uma
-- trilha append-only onde toda a acção da equipa fica registada.
--
-- DECISÕES LOCKED IN (plano: docs/2026-10-16-gestor-equipa-conheca-farmacia.md)
--
--   • Papéis continuam em `admin_users.role`: alargar o CHECK é aditivo e
--     não pede tabela nova para 2-3 pessoas reais.
--
--   • `is_admin()` NÃO é alargado a todos os níveis internos. Passa a
--     aceitar 'admin' (legado, das 6 migrações que o referenciam) e
--     'superadmin'. Se passasse a significar «é da equipa?», um 'suporte'
--     ou um 'auditoria' ganharia, por RLS, reservas e contactos de
--     clientes — exactamente o que a matriz de permissões diz que não
--     deve ver. A autorização fina vive em lib/platform/permissions.js,
--     com a área interna a ler e a escrever por service-role.
--
--   • Os níveis novos ficam SEM acesso RLS. Quem lhes dá leitura é o
--     código. Negar por omissão também ao nível dos dados.
--
--   • Trilha append-only a sério. `service_role` tem rolbypassrls=true
--     (medido), portanto NENHUMA policy o trava: o que trava é privilégio
--     de tabela, revogado aqui. O dono da tabela (papel `postgres`, o do
--     dashboard e desta API) continua fora desse cerco — é inerente ao
--     Postgres e está documentado no comentário da tabela, em vez de ser
--     vendido como impossível.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0027_platform_team.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Papéis internos no CHECK existente
--    O nome `admin_users_role_check` foi confirmado no remoto antes de
--    escrever isto. O `drop ... if exists` com o nome errado é a
--    armadilha desta migração: falha em silêncio, o `add constraint`
--    acrescenta um SEGUNDO check e `suporte` continua a ser recusado
--    sem nada indicar porquê. O bloco 4 verifica isso e recusa terminar.
--
--    A 0001 tem um segundo check, `admin_users_check`:
--      ((role = 'farmacia') = (pharmacy_id is not null))
--    que esta migração NÃO toca — e que obriga qualquer conta interna a
--    ficar com pharmacy_id nulo (lib/actions/platform-accounts.js).
-- ------------------------------------------------------------
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('admin','superadmin','onboarding','suporte','faturacao','auditoria','farmacia'));

-- ------------------------------------------------------------
-- 2. Predicados
--    security definer como as da 0001 (evita recursão de RLS) e com
--    EXECUTE para public, porque as policies avaliam-nas com o papel
--    anon antes de haver sessão.
-- ------------------------------------------------------------

-- Qualquer nível da equipa CF (o papel legado 'admin' incluído).
create or replace function public.is_platform_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('admin','superadmin','onboarding','suporte','faturacao','auditoria')
  );
$$;

-- Só o nível alto. Mantém o nome legado `is_admin()` que as policies da
-- 0001/0005/0012/0018/0020/0023 referenciam; `is_superadmin()` é o mesmo
-- predicado com o nome explícito para código novo. Uma única lista de
-- papéis, para não divergirem.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role in ('admin','superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

-- Quem lê a trilha: o nível alto e o nível de auditoria. A matriz diz
-- `audit.read: superadmin | auditoria`; a policy acompanha-a em vez de
-- deixar a leitura da trilha ao critério de qualquer membro da equipa.
create or replace function public.is_auditor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role = 'auditoria'
  );
$$;

grant execute on function public.is_platform_member() to public;
grant execute on function public.is_admin() to public;
grant execute on function public.is_superadmin() to public;
grant execute on function public.is_auditor() to public;

-- ------------------------------------------------------------
-- 3. Trilha de auditoria
--    Vocabulário intencionalmente igual ao `audit_logs` do projecto irmão
--    (action, table_name, record_id, actor_email, created_at), mais o que
--    este lado precisa: papel do actor, farmácia visada, motivo, pedido e
--    o antes/depois em jsonb para o ecrã poder mostrar a diferença.
--
--    `on delete set null` nos actores: apagar um utilizador (por exemplo
--    um convite pendente revogado) NUNCA pode apagar a trilha.
-- ------------------------------------------------------------
create table if not exists public.platform_audit_log (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role    text,
  actor_email   text,
  action        text not null,
  table_name    text,
  record_id     text,
  pharmacy_id   uuid references public.pharmacies(id) on delete set null,
  reason        text,
  request_id    text,
  ip            inet,
  user_agent    text,
  before        jsonb,
  after         jsonb
);

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);
create index if not exists platform_audit_log_pharmacy_idx
  on public.platform_audit_log (pharmacy_id, created_at desc);
create index if not exists platform_audit_log_actor_idx
  on public.platform_audit_log (actor_user_id, created_at desc);

alter table public.platform_audit_log enable row level security;

drop policy if exists "platform_audit_log read high levels" on public.platform_audit_log;
create policy "platform_audit_log read high levels"
  on public.platform_audit_log for select
  using (public.is_superadmin() or public.is_auditor());

-- Privilégios. Não basta a policy: service_role tem rolbypassrls e passaria
-- por cima dela, por isso o UPDATE/DELETE tem de ser revogado a sério.
-- (Em projectos Supabase as tabelas novas em public nascem com ALL para
-- service_role — medido na 0023 — daí o revoke explícito.)
revoke all on public.platform_audit_log from anon, authenticated, service_role;
grant select on public.platform_audit_log to authenticated;      -- policy acima decide as linhas
grant select, insert on public.platform_audit_log to service_role; -- escreve só o servidor
revoke update, delete on public.platform_audit_log from service_role;

comment on table public.platform_audit_log is
  'Trilha de auditoria da Equipa CF (0027). Append-only para todos os papéis que falam com a API (anon, authenticated, service_role: sem UPDATE/DELETE). O papel dono (postgres, dashboard/Management API) está fora deste cerco — inerente ao Postgres; por isso o motivo e o antes/depois são gravados na escrita, não corrigidos depois.';
comment on column public.platform_audit_log.reason is
  'Motivo escrito por quem executa. Obrigatório nas acções destrutivas (validação em lib/platform/audit.js, não no schema: a trilha nunca deve recusar registar).';
comment on column public.platform_audit_log.before is
  'Estado antes da alteração, apenas das chaves que mudaram (diffJson).';

-- ------------------------------------------------------------
-- 4. Verificação da própria migração
--    Se ficou um check antigo por cima (nome diferente do esperado), isto
--    rebenta aqui em vez de deixar uma base que parece migrada e recusa
--    'suporte' na primeira conta da equipa.
-- ------------------------------------------------------------
do $$
declare
  n_ok     int;
  n_velhos int;
begin
  select
    count(*) filter (
      where pg_get_constraintdef(c.oid) like '%ANY (ARRAY%'
        and pg_get_constraintdef(c.oid) like '%superadmin%'
    ),
    count(*) filter (
      where pg_get_constraintdef(c.oid) like '%ANY (ARRAY%'
        and pg_get_constraintdef(c.oid) not like '%superadmin%'
    )
  into n_ok, n_velhos
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  where cl.relname = 'admin_users' and c.contype = 'c';

  if n_velhos > 0 then
    raise exception
      'Ficou um CHECK antigo de papeis em admin_users a recusar os niveis novos (o drop constraint errou o nome)';
  end if;

  if n_ok <> 1 then
    raise exception
      'Esperava exactamente um CHECK de papeis com superadmin em admin_users, encontrei %', n_ok;
  end if;
end $$;
