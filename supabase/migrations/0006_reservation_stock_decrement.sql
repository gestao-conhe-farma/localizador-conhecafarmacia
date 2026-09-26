-- ============================================================
-- 0006 · Concluir uma reserva baixa o stock
--
-- Quando uma reserva passa a 'concluida', o stock da farmácia é
-- decrementado NA MESMA TRANSAÇÃO e o produto passa a "não temos"
-- quando chega a zero. Sem isto, o stock reportado no Localizador
-- divergia da realidade a partir da 1.ª venda: a farmácia tinha de
-- se lembrar de corrigir a quantidade à mão.
--
-- Porquê um TRIGGER e não código no Server Action:
--   1. Atómico — ou a reserva fica concluída E o stock baixa, ou
--      nada acontece (nunca um estado a meio);
--   2. Não contornável — dispara por qualquer caminho de escrita
--      (portal, admin, SQL), não só pelo formulário do portal;
--   3. Íntegro — a INVARIANTE "stock ∝ vendas" vive junto ao dado,
--      como as policies de RLS, e não depende de disciplina do
--      chamador.
--
-- SEMÂNTICA:
--   quantity NULL  → a farmácia não reporta quantidades: não há
--                    nada fiável a subtrair, o campo fica NULL e
--                    in_stock mantém-se (só se refresca a frescura);
--   quantity 0     → esgotado: in_stock = false (sai do Localizador);
--   quantity < 0   → clamp a 0 (nunca fica negativo, mesmo que a
--                    reserva seja maior do que o saldo reportado).
--
-- confirmed_at é refrescado (a contagem foi tocada agora mesmo,
-- logo o item continua "confirmado" no Localizador) e updated_by
-- registado. Recusar ou preparar uma reserva NÃO mexe no stock —
-- só a conclusão é que é uma saída real.
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função do trigger
--    security definer: o UPDATE em stock_items tem de acontecer
--    mesmo que o chamador seja um admin (que não é "dono" do
--    stock). O gatilho só corre a partir de um UPDATE já
--    autorizado pela RLS de reservations, por isso não abre
--    caminho a escritas não autorizadas.
-- ------------------------------------------------------------
create or replace function public.apply_reservation_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty integer;
  taken       integer;
  new_qty     integer;
begin
  -- Só interessa a transição PARA 'concluida' (um UPDATE que
  -- mantenha 'concluida' não pode voltar a baixar o stock).
  if new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;

  select s.quantity into current_qty
    from public.stock_items s
   where s.id = new.stock_item_id;

  -- Item removido entretanto: nada a actualizar.
  if not found then
    return new;
  end if;

  -- Sem quantidade reportada não há o que baixar.
  if current_qty is null then
    update public.stock_items
       set confirmed_at = now(),
           updated_by   = auth.uid()
     where id = new.stock_item_id;
    return new;
  end if;

  taken   := greatest(coalesce(new.quantity, 0), 0);
  new_qty := greatest(current_qty - taken, 0);

  update public.stock_items
     set quantity     = new_qty,
         in_stock     = case when new_qty <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id;

  return new;
end
$$;

-- ------------------------------------------------------------
-- 2. Trigger (idempotente)
--    "after update of status" limita o disparo às escritas que
--    mexem mesmo no estado — não às que só corrigem as notas.
-- ------------------------------------------------------------
drop trigger if exists trg_reservation_stock_decrement on public.reservations;

create trigger trg_reservation_stock_decrement
  after update of status on public.reservations
  for each row
  execute function public.apply_reservation_stock_change();

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
-- O trigger deve existir:
--   select tgname from pg_trigger
--    where tgrelid = 'public.reservations'::regclass
--      and tgname = 'trg_reservation_stock_decrement';
--
-- Teste de fumo (numa transacção descartável, com o JWT da farmácia):
--   begin;
--     select id, status, quantity, stock_item_id
--       from public.reservations where status = 'pronta' limit 1;
--     -- anotar o saldo, concluir a reserva e confirmar que baixou:
--     update public.reservations set status = 'concluida' where id = '<id>';
--     select quantity, in_stock from public.stock_items where id = '<stock_item_id>';
--   rollback;
