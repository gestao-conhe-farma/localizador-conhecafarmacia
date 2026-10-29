-- Guardados de conta no Localizador: produtos e farmácias.
--
-- Tabela própria e não public.saved_items (que é genérica de propósito, sem
-- FKs) porque um favorito aqui tem de morrer com o produto/farmácia que
-- aponta. A conta é a mesma dos dois sites; as listas são de cada produto.
--
-- A escrita é sempre feita com o cliente de sessão (nunca service-role): é a
-- policy que decide, com auth.uid(). Apagar a conta em conta.* dispara o
-- cascade e leva os favoritos com ela.

create table localizador.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drug_id uuid references localizador.drugs (id) on delete cascade,
  pharmacy_id uuid references localizador.pharmacies (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_one_target check (num_nonnulls(drug_id, pharmacy_id) = 1)
);

create unique index favorites_unique_drug
  on localizador.favorites (user_id, drug_id)
  where drug_id is not null;

create unique index favorites_unique_pharmacy
  on localizador.favorites (user_id, pharmacy_id)
  where pharmacy_id is not null;

alter table localizador.favorites enable row level security;

create policy "favorites own select" on localizador.favorites
  for select to authenticated
  using (user_id = auth.uid());

create policy "favorites own insert" on localizador.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "favorites own delete" on localizador.favorites
  for delete to authenticated
  using (user_id = auth.uid());
