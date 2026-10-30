-- ============================================================
-- 0050 · `stock_items` deixa de ser um espelho do inventário
--
-- A policy "stock public read" da baseline (0045) era `USING (true)`:
-- com a anon key, qualquer visitante lia a tabela inteira — itens já
-- retirados (`retired_at`), stock de farmácias suspensas (`active = false`)
-- e colunas internas (`source`, `source_ref`, `confirmed_at`, `updated_by`).
-- A superfície pública é a view `stock_confirmed`; a tabela só precisa de
-- servir quem vê a prateleira daquela farmácia.
--
-- O portal não perde nada: "stock pharmacy write" é uma policy ALL e
-- continua a deixar a farmácia ler as suas próprias linhas, incluindo as
-- que estão na lixeira.
-- ============================================================

drop policy if exists "stock public read" on localizador.stock_items;

create policy "stock public read" on localizador.stock_items
  for select to anon, authenticated
  using (
    retired_at is null
    and exists (
      select 1
        from localizador.pharmacies p
       where p.id = stock_items.pharmacy_id
         and p.active
    )
  );

-- ------------------------------------------------------------
-- Verificação
-- ------------------------------------------------------------
-- select qual from pg_policies
--  where schemaname = 'localizador'
--    and tablename = 'stock_items'
--    and policyname = 'stock public read';
--   → esperado: um EXISTS com p.active e retired_at IS NULL.
