-- ============================================================
-- 0068 · M9 — RPCs internas sem EXECUTE para `anon`
--
-- A varredura do schema exposto mostrou três funções com grant a
-- `anon` que não são para o browser:
--
--   * `post_stock_change` — escreve stock. Tem guarda interna
--     (`request_role()` + `is_own_pharmacy`), mas o próprio comentário
--     da função diz «um anon nunca chega aqui (sem execute grant)»: o
--     grant contradizia a intenção. Só portal/equipa (authenticated) e
--     rotas de servidor (service_role) a chamam.
--     Testar o papel antes de recusar não é o mesmo que não deixar
--     chegar: fechar o grant remove a superfície.
--
--   * `platform_pharmacy_overview` — agrega contas, perfis, chaves e
--     reservas de TODAS as farmácias. É chamada com `createAdminClient()`
--     (service_role); `anon` e `authenticated` não precisam dela.
--
--   * `reservation_hold_units` — helper de cálculo usado dentro de
--     funções `security definer`. Deixou de funcionar para `anon` quando
--     a 0066 fechou `stock_sale_options`; o revoke torna a intenção
--     explícita.
-- ============================================================

do $$
declare
  v_alvo text;
  v_fn regprocedure;
  v_fechadas integer := 0;
begin
  foreach v_alvo in array array[
    'post_stock_change',
    'platform_pharmacy_overview',
    'reservation_hold_units'
  ]
  loop
    for v_fn in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'localizador' and p.proname = v_alvo
    loop
      execute format('revoke execute on function %s from public, anon', v_fn);
      v_fechadas := v_fechadas + 1;
    end loop;
  end loop;

  if v_fechadas < 3 then
    raise exception 'M9: esperava 3 funções, encontrei %', v_fechadas;
  end if;
end $$;

-- A visão agregada da plataforma é só da equipa interna (service_role).
revoke execute on function localizador.platform_pharmacy_overview() from authenticated;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
do $$
declare
  v_alvo text;
  v_fn regprocedure;
begin
  foreach v_alvo in array array[
    'post_stock_change',
    'platform_pharmacy_overview',
    'reservation_hold_units'
  ]
  loop
    for v_fn in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'localizador' and p.proname = v_alvo
    loop
      if has_function_privilege('anon', v_fn, 'execute') then
        raise exception 'M9: anon ainda executa %', v_alvo;
      end if;
    end loop;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'localizador.post_stock_change(uuid,uuid,text,integer,integer,boolean,text,text,text,text,text,uuid,text,date,text)',
    'execute'
  ) then
    raise exception 'M9: authenticated perdeu post_stock_change';
  end if;
  if not has_function_privilege('service_role', 'localizador.platform_pharmacy_overview()', 'execute') then
    raise exception 'M9: service_role perdeu platform_pharmacy_overview';
  end if;
end $$;
