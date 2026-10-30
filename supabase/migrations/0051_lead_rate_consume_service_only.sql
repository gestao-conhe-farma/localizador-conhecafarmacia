-- ============================================================
-- 0051 · `lead_rate_consume` deixa de ser chamável pelo browser
--
-- A 0037 revogou o EXECUTE a PUBLIC, mas o Supabase concede EXECUTE a
-- `anon` e `authenticated` por omissão nas funções novas — por isso a
-- função continuava a responder a quem tenha a anon key (pública). Com
-- esse acesso, um atacante pode encher o contador de um IP alheio e
-- bloquear submissões legítimas de leads e de reservas.
--
-- Só o service_role chama: `/api/leads` e `lib/actions/reservations.js`
-- usam `createAdminClient()`.
-- ============================================================

revoke execute on function public.lead_rate_consume(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.lead_rate_consume(text, integer, integer)
  to service_role;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
-- select has_function_privilege('anon', 'public.lead_rate_consume(text,integer,integer)', 'execute') as anon,
--        has_function_privilege('authenticated', 'public.lead_rate_consume(text,integer,integer)', 'execute') as autenticado,
--        has_function_privilege('service_role', 'public.lead_rate_consume(text,integer,integer)', 'execute') as servico;
--   → esperado: false, false, true.
