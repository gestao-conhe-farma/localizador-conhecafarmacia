-- ============================================================
-- 0018 · Perfis de farmacêutico (PIN) + atribuição de registos
--
-- 1. pharmacy_staff: perfis simples por farmácia — cada farmacêutico
--    escolhe o seu perfil ao atender (PIN de 4 dígitos); vários
--    dispositivos usam perfis diferentes em simultâneo (cookie por
--    dispositivo, assinado no servidor).
-- 2. Atribuição: reservas/vendas (handled_by), entradas de stock
--    (tabela stock_entries) e alterações do perfil da farmácia
--    (updated_by) passam a ficar em nome do farmacêutico activo.
-- 3. Desempenho: as agregações do gerente leem handled_by.
--
-- Segurança do PIN:
--   · pin_hash vive numa coluna SEM grant de SELECT para
--     anon/authenticated — nunca sai do servidor via PostgREST;
--     as Server Actions validam o PIN com o client service-role.
--   · pharmacy_staff tem RLS com policy de SELECT (própria farmácia,
--     para os FKs e para os nomes nas listas) mas SEM grants de
--     INSERT/UPDATE/DELETE para o papel authenticated — toda a
--     escrita passa pelas Server Actions validadas (sessão + papel
--     gerente para a gestão de equipa).
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0018_pharmacy_staff.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Perfis de farmacêutico
-- ------------------------------------------------------------
create table if not exists public.pharmacy_staff (
  id           uuid primary key default gen_random_uuid(),
  pharmacy_id  uuid not null references public.pharmacies(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 80),
  pin_hash     text not null, -- scrypt(salt:hash) — nunca o PIN em claro
  role         text not null default 'balcao'
               check (role in ('balcao','gerente')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists pharmacy_staff_pharmacy_idx
  on public.pharmacy_staff (pharmacy_id);

-- ------------------------------------------------------------
-- 2. Colunas de atribuição
--    handled_by: quem moveu a reserva pela última vez — no caso de
--    'concluida' é quem registou a VENDA. Histórico pré-0018 fica
--    a null = «não atribuído» (decidido com o owner).
--    updated_by: quem editou o perfil da farmácia.
-- ------------------------------------------------------------
alter table public.reservations
  add column if not exists handled_by uuid
    references public.pharmacy_staff(id) on delete set null;

alter table public.pharmacies
  add column if not exists updated_by uuid
    references public.pharmacy_staff(id) on delete set null;

-- ------------------------------------------------------------
-- 3. Log de entradas/reposições de stock (com autor)
--    O stock_items continua a ser o saldo corrente; esta tabela é
--    o histórico — permite atribuir entradas e, mais tarde,
--    relatórios por farmacêutico.
-- ------------------------------------------------------------
create table if not exists public.stock_entries (
  id           uuid primary key default gen_random_uuid(),
  pharmacy_id  uuid not null references public.pharmacies(id) on delete cascade,
  drug_id      uuid not null references public.drugs(id) on delete cascade,
  units        integer not null check (units > 0), -- unidades-base somadas
  unit         text,                              -- unidade escolhida (comprimido, caixa…)
  staff_id     uuid references public.pharmacy_staff(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists stock_entries_pharmacy_idx
  on public.stock_entries (pharmacy_id, created_at desc);

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
alter table public.pharmacy_staff enable row level security;
alter table public.stock_entries  enable row level security;

-- 4a. Leitura de nomes/papéis pela própria farmácia (listas do
--     portal e FKs como handled_by). O pin_hash fica DE FORA do
--     grant de SELECT — vê-se na coluna 5 abaixo.
drop policy if exists "pharmacy_staff select own pharmacy" on public.pharmacy_staff;
create policy "pharmacy_staff select own pharmacy"
  on public.pharmacy_staff for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

-- Escrita: NENHUMA policy para authenticated — só service-role dentro
-- das Server Actions (PIN, papel e gestão validados na aplicação).

-- 4b. stock_entries: a farmácia lê e escreve as suas entradas.
drop policy if exists "stock_entries pharmacy read" on public.stock_entries;
create policy "stock_entries pharmacy read"
  on public.stock_entries for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

drop policy if exists "stock_entries pharmacy insert" on public.stock_entries;
create policy "stock_entries pharmacy insert"
  on public.stock_entries for insert
  with check (public.is_own_pharmacy(pharmacy_id));

-- ------------------------------------------------------------
-- 5. Privileges: pin_hash invisível ao PostgREST autenticado;
--    authenticated mantém só o SELECT de colunas não-sensíveis
--    (necessário aos embeds da API e à validação dos FKs).
--    INSERT/UPDATE/DELETE em pharmacy_staff: revoked — escrita
--    exclusivamente via service-role nas Server Actions.
-- ------------------------------------------------------------
revoke all on public.pharmacy_staff from anon, authenticated;
grant select (id, pharmacy_id, name, role, active, created_at, updated_at)
  on public.pharmacy_staff to authenticated;
