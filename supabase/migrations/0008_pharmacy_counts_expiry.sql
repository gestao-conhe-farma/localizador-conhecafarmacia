-- ============================================================
-- 0008 · A contagem pública da lista de farmácias ignora expirados
--
-- A RPC `pharmacy_stock_counts` (0003) agrega `stock_items`
-- directamente e não conhece `expires_at` (0007 é posterior): uma
-- farmácia cujo único stock confirmado já tinha expirado aparecia na
-- lista com «3 medicamentos agora» — e a página dela mostrava 0, porque
-- a view stock_confirmed esconde expirados. A contagem tem de seguir a
-- MESMA regra da view.
--
-- SEMÂNTICA (a da 0007):
--   expires_at NULL            → conta (validade desconhecida não filtra);
--   expires_at >= current_date → conta (expira HOJE ainda serve);
--   expires_at <  current_date → NÃO conta (expirado: sai do Localizador).
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

create or replace function public.pharmacy_stock_counts()
returns table (pharmacy_slug text, stock_count bigint)
language sql
stable
as $$
  select
    p.slug,
    count(s.id) as stock_count
  from public.pharmacies p
  join public.stock_items s
    on s.pharmacy_id = p.id
   and s.in_stock
   and s.confirmed_at > now() - interval '72 hours'
   and (s.expires_at is null or s.expires_at >= current_date)  -- esconde expirados
  where p.active
  group by p.slug
$$;

grant execute on function public.pharmacy_stock_counts() to anon, authenticated;

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
-- Nenhum item contado pode estar expirado (deve devolver 0 linhas):
--   with contadas as (
--     select pharmacy_slug,
--            count(s.id) as stock_count
--       from public.pharmacies p
--       join public.stock_items s on s.pharmacy_id = p.id
--      where p.active and s.in_stock
--        and s.confirmed_at > now() - interval '72 hours'
--        and (s.expires_at is null or s.expires_at >= current_date)
--      group by pharmacy_slug
--   )
--   select * from contadas;
--
-- Teste de fumo (transacção descartável): expirar todo o stock de uma
-- farmácia e confirmar que ela sai da contagem:
--   begin;
--     update public.stock_items
--        set expires_at = current_date - 1
--      where pharmacy_id = '<pharmacy_id>';
--     select * from public.pharmacy_stock_counts()
--      where pharmacy_slug = '<slug>';   -- esperado: 0 linhas
--   rollback;
