-- ============================================================
-- 0053 · Concluir reserva: lock da linha de stock + baixa atómica
--
-- O BUG (trigger da 0006/0012/0020):
--
--   select s.quantity into current_qty ...        -- sem FOR UPDATE
--   new_qty := greatest(current_qty - taken, 0);
--   update ... set quantity = new_qty ...         -- valor absoluto
--
-- Duas conclusões SIMULTÂNEAS de reservas DIFERENTES sobre o mesmo
-- item (saldo 5, 1 unidade cada) liam ambas 5. A primeira escrevia 4
-- e fazia commit; a segunda, já bloqueada no UPDATE, escrevia também
-- 4. Perdia-se uma baixa:
--
--   • saldo final 4 em vez de 3 — o stock real e o reportado divergem;
--   • in_stock podia ficar true com 0 unidades (a view só olha para
--     in_stock, não para quantity > 0) — item fantasma no Localizador;
--   • os dois movimentos ficavam "5 → 4" e a invariante
--     stock = soma dos deltas partia-se.
--
-- O guard `old.status = 'concluida'` não cobria este caso: protege a
-- MESMA reserva de ser concluída duas vezes, não duas reservas
-- distintas sobre o mesmo item.
--
-- A CORREÇÃO (restrita a este trigger):
--   1. SELECT ... FOR UPDATE — a segunda conclusão espera pela
--      primeira e, em READ COMMITTED, relê a versão já actualizada
--      da linha (EvalPlanQual). O saldo lido é o saldo real.
--   2. UPDATE com expressão (quantity - taken) e RETURNING — o valor
--      gravado e o valor que vai para o livro-razão são o mesmo; já
--      não dependem de um cálculo feito antes da escrita.
--   3. in_stock derivado do saldo já descontado, na mesma instrução.
--
-- Fica fora do âmbito desta migração o mesmo anti-padrão em
-- post_stock_change (edição manual/API de stock), que continua a ler
-- e a escrever o saldo em passos separados.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0053_reservation_stock_lock.sql
-- ============================================================

create or replace function localizador.apply_reservation_stock_change()
returns trigger
language plpgsql
security definer
set search_path = localizador, public, extensions
as $$
declare
  current_qty integer;
  taken       integer;
  new_qty     integer;
begin
  -- Só a transição PARA 'concluida' (nunca baixa duas vezes).
  if new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;

  -- Lock da linha de stock: serializa conclusões concorrentes do
  -- mesmo item. Sem isto, duas reservas liam o mesmo saldo e a
  -- segunda escrita apagava a baixa da primeira (lost update).
  select s.quantity into current_qty
    from localizador.stock_items s
   where s.id = new.stock_item_id
     for update;

  if not found then
    return new;
  end if;

  -- Sem quantidade reportada não há o que baixar (semântica da 0006).
  if current_qty is null then
    update localizador.stock_items
       set confirmed_at = now(),
           updated_by   = auth.uid()
     where id = new.stock_item_id;
    return new;
  end if;

  if new.sale_option_id is not null then
    taken := greatest(
      coalesce(new.confirmed_quantity, new.quantity, 0), 0
    ) * greatest(
      (select o.pack_size from localizador.stock_sale_options o
        where o.id = new.sale_option_id), 1
    );
  else
    taken := greatest(coalesce(new.confirmed_quantity, new.quantity, 0), 0);
  end if;

  -- Baixa atómica: o desconto é aplicado sobre o saldo que está na
  -- linha (já travada acima) e o RETURNING devolve o resultado real.
  update localizador.stock_items
     set quantity     = greatest(quantity - taken, 0),
         in_stock     = case when quantity - taken <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id
  returning quantity into new_qty;

  -- Lotes (0021): FEFO, pelo delta que o UPDATE aplicou de facto.
  perform localizador.stock_lot_apply(
    new.stock_item_id, -(current_qty - new_qty), null, null, 'portal', new.id::text
  );

  perform localizador.log_stock_movement(
    new.pharmacy_id, new.drug_id, new.stock_item_id, 'venda',
    -(current_qty - new_qty), current_qty, new_qty,
    'portal', 'reserva concluída', new.notes, new.id::text, null,
    new.handled_by, auth.uid(), null, null,
    jsonb_build_object(
      'unidades_vendidas', current_qty - new_qty,
      'sale_option_id', new.sale_option_id
    )
  );

  return new;
end
$$;

-- ------------------------------------------------------------
-- Verificação estrutural
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'localizador.reservations'::regclass
       and tgname = 'trg_reservation_stock_decrement'
  ) then
    raise exception 'trigger trg_reservation_stock_decrement ausente';
  end if;

  -- O corpo tem de conter o lock; um create or replace futuro que o
  -- remova volta a partir este teste em vez de falhar em silêncio.
  if position('for update' in lower(pg_get_functiondef(
       'localizador.apply_reservation_stock_change()'::regprocedure))) = 0 then
    raise exception 'apply_reservation_stock_change sem FOR UPDATE';
  end if;
end $$;

-- ------------------------------------------------------------
-- Verificação de concorrência
--   O teste corre com duas sessões reais (ver
--   scripts/test-reservation-race.py); em transacção descartável:
--
--   begin;
--     -- saldo 5, duas reservas de 1 unidade (ids :a e :b)
--     update localizador.reservations set status = 'concluida' where id = :a;
--     -- noutra sessão, ao mesmo tempo:
--     --   update ... where id = :b;
--     select quantity from localizador.stock_items where id = :item;  -- 3
--   rollback;
-- ------------------------------------------------------------
