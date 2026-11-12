-- ============================================================
-- 0062 · Fechar as funções internas a `anon` e `authenticated` (G1)
--
-- PORQUÊ: a auditoria de 11/11/2026 encontrou as funções SECURITY
-- DEFINER de stock e webhooks recriadas no baseline (0045) SEM
-- GRANT/REVOKE. Na Supabase, `revoke ... from public` (0020/0021/0025)
-- NÃO retira o EXECUTE que os papéis `anon` e `authenticated` recebem
-- por ALTER DEFAULT PRIVILEGES — é o próprio projeto que o documenta na
-- 0051. Resultado possível: qualquer visitante com a chave anónima
-- executa `webhook_claim_due` (devolve URL e segredo HMAC) ou
-- `log_stock_movement` (forja o livro-razão).
--
-- COMO: revogar de `public`, `anon` e `authenticated` em TODAS as
-- versões que existam em `localizador` e `public` (o baseline pode ter
-- deixado cópias nos dois schemas) e devolver o EXECUTE apenas ao
-- `service_role`, que é quem as chama (cron, webhooks, portal via
-- service-role). O `postgres`/owner mantém os seus privilégios.
--
-- A lista é fechada (nomes exactos). Se uma destas funções for recriada
-- no futuro, a verificação desta migração volta a falhar num novo
-- `apply-migration` — é o alarme que faltava.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0062_revoke_internal_functions_from_clients.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Revogar de quem não é serviço
-- ------------------------------------------------------------
do $$
declare
  r record;
  nomes text[] := array[
    'log_stock_movement',
    'stock_lot_apply',
    'stock_lot_sync_expiry',
    'webhook_claim_due',
    'webhook_record_attempt',
    'webhook_replay',
    'webhook_prune'
  ];
begin
  for r in
    select p.oid::regprocedure as assinatura,
           n.nspname as schema,
           p.proname as nome
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('localizador', 'public')
       and p.proname = any (nomes)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      r.assinatura
    );
    execute format('grant execute on function %s to service_role', r.assinatura);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Verificação — nenhum cliente executa; o serviço continua a poder
-- ------------------------------------------------------------
do $$
declare
  r record;
  nomes text[] := array[
    'log_stock_movement',
    'stock_lot_apply',
    'stock_lot_sync_expiry',
    'webhook_claim_due',
    'webhook_record_attempt',
    'webhook_replay',
    'webhook_prune'
  ];
  abertas int := 0;
  sem_servico int := 0;
begin
  for r in
    select p.oid::regprocedure as assinatura, p.oid as oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('localizador', 'public')
       and p.proname = any (nomes)
  loop
    if has_function_privilege('anon', r.oid, 'execute')
       or has_function_privilege('authenticated', r.oid, 'execute') then
      abertas := abertas + 1;
      raise warning 'Função ainda executável por cliente: %', r.assinatura;
    end if;
    if not has_function_privilege('service_role', r.oid, 'execute') then
      sem_servico := sem_servico + 1;
    end if;
  end loop;

  if abertas > 0 then
    raise exception 'Ficaram % funções internas executáveis por anon/authenticated', abertas;
  end if;
  if sem_servico > 0 then
    raise exception '% funções internas sem EXECUTE para service_role', sem_servico;
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- Verificação funcional
--   scripts/test-internal-function-grants.py — consulta
--   has_function_privilege nas sete funções: anon/authenticated sem
--   EXECUTE, service_role com EXECUTE; e confirma que o cron de
--   webhooks continua a reclamar entregas.
-- ------------------------------------------------------------
