-- ============================================================
-- Localizador de Medicamentos — Conheça Farmácia
-- Migração inicial (fase 1: leads; fases 2–3 preparadas)
--
-- Aplicar no SQL Editor do dashboard do Supabase
-- (projecto mxqhmtpshlpnbkninawt) ou via supabase db push.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensões
-- ------------------------------------------------------------
create extension if not exists pg_trgm; -- busca fuzzy por nome de medicamento

-- ============================================================
-- HELPERS (security definer para evitar recursão de RLS)
-- Definidos antes das policies, que referenciam estas funções.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_own_pharmacy(pid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role = 'farmacia'
      and pharmacy_id = pid
  );
$$;

-- ------------------------------------------------------------
-- 1. Farmácias
-- ------------------------------------------------------------
create table if not exists public.pharmacies (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  municipio     text not null check (municipio in (
                  'Belas','Cacuaco','Cazenga','Ícolo e Bengo','Luanda',
                  'Quilamba Quiaxi','Quissama','Talatona','Viana')),
  address       text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  phone         text,
  whatsapp      text,
  opening_hours text,
  logo_url      text,
  verified      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Utilizadores admin (equipa + farmácias)
--    Papéis: 'admin' (equipa CF) | 'farmacia' (utilizador da farmácia)
-- ------------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin','farmacia')),
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  display_name text,
  created_at  timestamptz not null default now(),
  check ((role = 'farmacia') = (pharmacy_id is not null))
);

-- ------------------------------------------------------------
-- 3. Catálogo de medicamentos (moléculas-alvo)
-- ------------------------------------------------------------
create table if not exists public.drugs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,          -- nome comercial mais comum
  molecule      text,                   -- DCI / molécula
  form          text,                   -- comprimido, injetável, xarope…
  dosage        text,                   -- 10 mg, 100 UI/ml…
  requires_rx   boolean not null default false, -- sujeito a receita
  priority      text not null default 'normal' check (priority in ('critico','alto','normal')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (name, form, dosage)
);

create index if not exists drugs_name_trgm_idx on public.drugs using gin (name gin_trgm_ops);

-- ------------------------------------------------------------
-- 4. Stock confirmado pelas farmácias
--    Regra de ouro: só aparece como "confirmado" se confirmed_at
--    tiver menos de 72 horas (visto na view public_stock).
-- ------------------------------------------------------------
create table if not exists public.stock_items (
  id           uuid primary key default gen_random_uuid(),
  pharmacy_id  uuid not null references public.pharmacies(id) on delete cascade,
  drug_id      uuid not null references public.drugs(id) on delete cascade,
  in_stock     boolean not null default false,
  quantity     integer check (quantity is null or quantity >= 0), -- opcional
  price        numeric(12,2) check (price is null or price >= 0), -- opcional
  confirmed_at timestamptz not null default now(),
  updated_by   uuid references public.admin_users(user_id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (pharmacy_id, drug_id)
);

create index if not exists stock_items_drug_idx on public.stock_items (drug_id) where in_stock;
create index if not exists stock_items_pharmacy_idx on public.stock_items (pharmacy_id);

-- ------------------------------------------------------------
-- 5. Reservas (fase 3)
--    Estado: pendente | confirmada | pronta | concluida | recusada
--    Privacidade: phone só visível à farmácia da reserva (RLS abaixo).
-- ------------------------------------------------------------
create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  drug_id     uuid not null references public.drugs(id) on delete cascade,
  requester_name  text not null,
  requester_phone text not null,
  quantity    integer not null default 1 check (quantity > 0),
  notes       text,
  status      text not null default 'pendente'
              check (status in ('pendente','confirmada','pronta','concluida','recusada')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists reservations_pharmacy_status_idx
  on public.reservations (pharmacy_id, status);

-- ------------------------------------------------------------
-- 6. Leads de farmácias (fase 1 — formulário da landing)
--    Escrito apenas via service role (route handler /api/leads).
-- ------------------------------------------------------------
create table if not exists public.pharmacy_leads (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_name text not null,
  contact_name  text not null,
  role          text,
  email         text,
  phone         text not null,
  municipio     text,
  message       text,
  user_agent    text,
  status        text not null default 'novo'
                check (status in ('novo','em_conversa','demonstracao','acordo','onboarded','descartado')),
  created_at    timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.pharmacies      enable row level security;
alter table public.admin_users     enable row level security;
alter table public.drugs           enable row level security;
alter table public.stock_items     enable row level security;
alter table public.reservations    enable row level security;
alter table public.pharmacy_leads  enable row level security;

-- admin_users: o utilizador vê a própria linha; admins vêem tudo.
create policy "admin_users self read"
  on public.admin_users for select
  using (auth.uid() = user_id or public.is_admin());

-- Farmácias activas são públicas (perfil público do localizador).
create policy "pharmacies public read active"
  on public.pharmacies for select
  using (active or public.is_admin());

-- Escrita de farmácias: só equipa admin (service role no onboarding).
create policy "pharmacies admin write"
  on public.pharmacies for all
  using (public.is_admin()) with check (public.is_admin());

-- Catálogo: leitura pública; escrita só admin.
create policy "drugs public read"
  on public.drugs for select using (active or public.is_admin());
create policy "drugs admin write"
  on public.drugs for all
  using (public.is_admin()) with check (public.is_admin());

-- Stock: leitura pública (a view aplica a regra 72h); escrita só
-- pelo utilizador da própria farmácia ou pela equipa.
create policy "stock public read"
  on public.stock_items for select using (true);
create policy "stock pharmacy write"
  on public.stock_items for all
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id))
  with check (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

-- Reservas: criar é público (formulário); ler/atender só a farmácia
-- ou a equipa. Contacto do cliente nunca exposto a terceiros.
create policy "reservations public insert"
  on public.reservations for insert with check (true);
create policy "reservations pharmacy read"
  on public.reservations for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));
create policy "reservations pharmacy update"
  on public.reservations for update
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id))
  with check (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

-- Leads: SEM policy pública — só service role escreve/lê.
-- (RLS activo sem policies = deny all para anon/authenticated.)

-- ============================================================
-- VIEW PÚBLICA DO LOCALIZADOR (regra das 72 horas)
-- Só expõe stock confirmado nas últimas 72h de farmácias activas.
-- A busca da fase 2 lê exclusivamente desta view.
-- ============================================================
create or replace view public.stock_confirmed
with (security_invoker = false) as
select
  s.id            as stock_item_id,
  d.id            as drug_id,
  d.name          as drug_name,
  d.molecule      as drug_molecule,
  d.form          as drug_form,
  d.dosage        as drug_dosage,
  d.requires_rx   as drug_requires_rx,
  p.id            as pharmacy_id,
  p.slug          as pharmacy_slug,
  p.name          as pharmacy_name,
  p.municipio     as pharmacy_municipio,
  p.address       as pharmacy_address,
  p.lat           as pharmacy_lat,
  p.lng           as pharmacy_lng,
  p.phone         as pharmacy_phone,
  p.whatsapp      as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  s.quantity,
  s.price,
  s.confirmed_at
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ============================================================
-- SEED MÍNIMO (exemplos; ajustar no piloto)
-- ============================================================
insert into public.drugs (name, molecule, form, dosage, requires_rx, priority) values
  ('Insulina NPH', 'insulina isofânica', 'injetável', '100 UI/ml', true, 'critico'),
  ('Carbamazepina', 'carbamazepina', 'comprimido', '200 mg', true, 'alto'),
  ('Ácido Fólico', 'ácido fólico', 'comprimido', '5 mg', false, 'normal')
on conflict (name, form, dosage) do nothing;
