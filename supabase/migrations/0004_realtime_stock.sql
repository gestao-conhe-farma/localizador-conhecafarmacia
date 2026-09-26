-- ============================================================
-- 0004 · Realtime para o stock (T12 do plano do localizador)
-- O componente da página da farmácia subscreve mudanças em
-- stock_items via Supabase Realtime e refresca a lista sem
-- reload. O Realtime só publica tabelas — views como
-- stock_confirmed não são suportadas — por isso subscrevemos
-- a tabela base e refetchamos a view em resposta ao evento.
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- Idempotente: só adiciona se ainda não estiver na publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stock_items'
  ) then
    alter publication supabase_realtime add table public.stock_items;
  end if;
end
$$;

-- O client do Realtime (anon) precisa de REPLICA IDENTITY para receber os
-- valores antigos/novos das colunas nos eventos UPDATE/DELETE.
alter table public.stock_items replica identity full;
