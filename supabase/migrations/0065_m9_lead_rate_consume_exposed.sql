-- ============================================================
-- 0065 · M9 — `lead_rate_consume` fechada também no schema exposto
--
-- A 0051 revogou o EXECUTE em `public.lead_rate_consume`, mas a função
-- que o PostgREST expõe vive em `localizador` (schema do Accept-Profile
-- usado pela app). A cópia de `localizador` continuou com
-- `{=X, anon=X, authenticated=X}`: qualquer visitante com a anon key
-- podia chamar a RPC e gastar o contador de um IP alheio, bloqueando
-- submissões legítimas de leads e reservas (o mesmo risco que a 0051
-- quis eliminar).
--
-- Esta migração fecha todas as cópias de 3 argumentos, seja qual for o
-- schema, para não repetir o desencontro de nomes. Só `service_role`
-- fica com EXECUTE — é o único chamador (`/api/leads`,
-- `lib/actions/reservations.js`, `lib/actions/pharmacy-recovery.js`,
-- todos com `createAdminClient()`).
-- ============================================================

do $$
declare
  v_fn record;
  v_fechadas integer := 0;
begin
  for v_fn in
    select p.oid::regprocedure as assinatura, n.nspname as schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'lead_rate_consume'
      and pg_get_function_identity_arguments(p.oid) = 'p_ip text, p_limit integer, p_window_seconds integer'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn.assinatura);
    execute format('grant execute on function %s to service_role', v_fn.assinatura);
    v_fechadas := v_fechadas + 1;
  end loop;

  if v_fechadas = 0 then
    raise exception 'M9: lead_rate_consume(text,integer,integer) não encontrada';
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação: a cópia do schema exposto tem de estar fechada.
-- ------------------------------------------------------------
do $$
declare
  v_fn regprocedure := to_regprocedure('localizador.lead_rate_consume(text,integer,integer)');
begin
  if v_fn is null then
    raise exception 'M9: localizador.lead_rate_consume não existe';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'M9: anon ainda executa lead_rate_consume';
  end if;
  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'M9: authenticated ainda executa lead_rate_consume';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'M9: service_role perdeu o acesso a lead_rate_consume';
  end if;
end $$;
