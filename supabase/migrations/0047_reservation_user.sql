-- A reserva passa a saber de quem é, quando quem reservou tem conta.
--
-- `user_id` é opcional: reservar sem conta continua a funcionar (o fluxo por
-- token da 0035 não muda). Apagar a conta põe `user_id` a null e a reserva
-- fica — é um registo operacional da farmácia, não um dado pessoal do
-- utilizador a eliminar.
--
-- Quem tem sessão vê as suas reservas em /reservas por esta policy. A
-- escrita continua server-side em lib/actions/reservations.js, que lê o
-- utilizador da sessão (nunca do formulário).

alter table localizador.reservations
  add column user_id uuid references auth.users (id) on delete set null;

create index reservations_user_idx
  on localizador.reservations (user_id, created_at desc);

create policy "reservations own read" on localizador.reservations
  for select to authenticated
  using (user_id = auth.uid());
