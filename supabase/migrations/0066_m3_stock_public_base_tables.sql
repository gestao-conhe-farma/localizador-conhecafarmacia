-- ============================================================
-- 0066 · M3 (correção) — fechar as tabelas base a `anon`
--
-- A 0063 criou `stock_public` sem as colunas sensíveis, mas manteve
-- `security_invoker` e o SELECT de `anon` em `stock_items`: qualquer
-- visitante continuava a ler `quantity`, `expires_at` e `source` por
-- `GET /rest/v1/stock_items` e a ficha pública não escondia nada.
--
-- Correção:
--   1. `stock_public` passa a correr com os direitos do owner (sem
--      `security_invoker`), para já não depender de grants a `anon` nas
--      tabelas base. O WHERE da view é mais restrito do que a policy
--      pública que existia (in_stock, não retirado, validade, frescura,
--      farmácia e medicamento activos), pelo que não alarga linhas.
--   2. `anon` perde o SELECT em `stock_items` e `stock_sale_options`.
--      `authenticated` e `service_role` mantêm-no: portal, área interna
--      e ingestão continuam a ler o stock como antes.
--
-- `drugs`, `pharmacies` e `drug_brand_images` ficam como estavam: são
-- dados públicos e a UI anónima lê-os directamente.
-- ============================================================

alter view localizador.stock_public set (security_invoker = false);

revoke select on localizador.stock_items from public, anon;
revoke select on localizador.stock_sale_options from public, anon;

grant select on localizador.stock_items to authenticated;
grant select on localizador.stock_sale_options to authenticated;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'localizador.stock_items', 'select') then
    raise exception 'M3: anon ainda lê stock_items';
  end if;
  if has_table_privilege('anon', 'localizador.stock_sale_options', 'select') then
    raise exception 'M3: anon ainda lê stock_sale_options';
  end if;
  if not has_table_privilege('authenticated', 'localizador.stock_items', 'select') then
    raise exception 'M3: authenticated perdeu stock_items';
  end if;
  if not has_table_privilege('service_role', 'localizador.stock_items', 'select') then
    raise exception 'M3: service_role perdeu stock_items';
  end if;
  if not has_table_privilege('anon', 'localizador.stock_public', 'select') then
    raise exception 'M3: anon perdeu stock_public';
  end if;
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'localizador' and c.relname = 'stock_public'
      and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'
  ) then
    raise exception 'M3: stock_public ainda é security_invoker';
  end if;
end $$;
