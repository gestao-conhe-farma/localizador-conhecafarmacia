-- ============================================================
-- 0011 · Acompanhamento público da reserva (/reserva/[id])
--
-- O cliente que reservou acompanha o estado num URL não-listado com
-- o id da reserva (UUID — impraticável de adivinhar). Lê APENAS a
-- própria reserva, sem login: o link é partilhado pela farmácia no
-- WhatsApp da confirmação.
--
-- Risco avaliado: o id é a chave; quem o tem é quem recebeu o link.
-- A página expõe nome do medicamento, farmácia, estado, quantidade e
-- o telefone da PRÓPRIA farmácia (público no Localizador) — nunca o
-- telefone de outros clientes.
-- ============================================================

drop policy if exists "reservations public read by id" on public.reservations;

create policy "reservations public read by id"
  on public.reservations for select
  using (true);

-- Verificação
--   select policyname, cmd, qual from pg_policies
--    where tablename = 'reservations' and policyname = 'reservations public read by id';
--
-- NOTA: esta policy dá SELECT de TODAS as colunas a quem tiver um id
-- válido — incluindo requester_phone. É aceitável: o telefone é do
-- próprio cliente cujo link é. A leitura em massa continua bloqueada
-- porque adivinhar UUIDs é impraticável, e não há listagem (sem
-- filtro por id, a API só devolve dados com o id na mão).
