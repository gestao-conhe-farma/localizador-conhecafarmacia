-- ============================================================
-- 0003 · Contagens de stock por farmácia (RPC)
-- A lista de farmácias precisava de TODAS as linhas de
-- stock_confirmed para contar no JavaScript. Esta função faz a
-- agregação no Postgres e devolve apenas slug + contagem.
--
-- security invoker (default): respeita a RLS das tabelas
-- subjacentes, tal como a view stock_confirmed.
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
  where p.active
  group by p.slug
$$;

grant execute on function public.pharmacy_stock_counts() to anon, authenticated;
