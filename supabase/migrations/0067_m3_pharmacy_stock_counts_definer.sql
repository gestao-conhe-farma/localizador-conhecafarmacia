-- ============================================================
-- 0067 · M3 (correção) — `pharmacy_stock_counts` deixa de depender
--        do SELECT de `anon` em `stock_items`
--
-- A 0066 fechou `stock_items` a `anon`, mas esta RPC pública é
-- `security invoker`: a lista de farmácias passou a receber 401
-- («permission denied for table stock_items»), porque o SQL da função
-- corria com os privilégios de quem chama.
--
-- A função só devolve a contagem de itens disponíveis por farmácia —
-- nenhum dado de stock individual — pelo que passa a `security definer`
-- com `search_path` fixo. O corpo e as regras de visibilidade são os
-- mesmos; muda só o papel com que corre.
-- ============================================================

create or replace function localizador.pharmacy_stock_counts()
returns table (pharmacy_slug text, stock_count bigint)
language sql
stable
security definer
set search_path = localizador
as $$
  select
    p.slug,
    count(s.id) as stock_count
  from localizador.pharmacies p
  join localizador.stock_items s
    on s.pharmacy_id = p.id
   and s.in_stock
   and s.retired_at is null
   and (s.available_from is null or s.available_from <= now())
   and (s.expires_at is null or s.expires_at >= current_date)
  join localizador.drugs d
    on d.id = s.drug_id
   and d.active
   and (
     (d.kind = 'medicamento' and s.confirmed_at > now() - interval '72 hours')
     or (d.kind <> 'medicamento' and s.confirmed_at > now() - interval '30 days')
   )
  where p.active
  group by p.slug
$$;

revoke execute on function localizador.pharmacy_stock_counts() from public;
grant execute on function localizador.pharmacy_stock_counts() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
do $$
declare
  n_view bigint;
  n_fn bigint;
begin
  if not has_function_privilege('anon', 'localizador.pharmacy_stock_counts()', 'execute') then
    raise exception 'M3: anon perdeu pharmacy_stock_counts';
  end if;
  if has_table_privilege('anon', 'localizador.stock_items', 'select') then
    raise exception 'M3: anon voltou a ler stock_items';
  end if;

  -- A contagem pública e a view têm de concordar (mesma regra).
  select count(*) into n_view from localizador.stock_public;
  select coalesce(sum(t.stock_count), 0) into n_fn from localizador.pharmacy_stock_counts() t;
  if n_fn <> n_view then
    raise warning 'pharmacy_stock_counts (%) diverge de stock_public (%)', n_fn, n_view;
  end if;
end $$;
