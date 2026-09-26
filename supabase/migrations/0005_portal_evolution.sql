-- ============================================================
-- 0005 · Portal da farmácia — evolução (feedback do owner)
--
-- 1. available_from: "disponível a partir de [data]" — stock que
--    a farmácia marca como "chega dia X". A view stock_confirmed
--    passa a expor o campo; enquanto available_from for futuro,
--    o item NÃO conta como disponível para o público (a regra
--    das 72h mantém-se).
-- 2. Farmácias podem criar fármacos no portal (apresentações
--    em falta no catálogo) — ficam inactivos até a equipa
--    validar (moderação simples, sem fila dedicada).
-- 3. A farmácia pode editar o próprio perfil (morada, contactos,
--    horário, GPS) — sem tocar em verified/active/slug.
-- 4. Reservas entram na publication realtime (sino do portal).
-- 5. updated_at das pharmacies mantido por trigger.
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. available_from em stock_items
-- ------------------------------------------------------------
alter table public.stock_items
  add column if not exists available_from timestamptz;

-- ------------------------------------------------------------
-- 2. Policies de auto-gestão da farmácia
--    (podia ser tudo com is_own_pharmacy(); policies separadas
--    deixam as regras legíveis: update = só campos próprios;
--    insert de fármacos = sempre inactivo, moderação da equipa)
-- ------------------------------------------------------------

-- 2a. A farmácia edita o próprio perfil (não verified/active/slug/id)
drop policy if exists "pharmacy self update profile" on public.pharmacies;

create policy "pharmacy self update profile"
  on public.pharmacies for update
  using (public.is_own_pharmacy(id))
  with check (public.is_own_pharmacy(id));

-- Trigger: protege colunas sensíveis + mantém updated_at
create or replace function public.protect_pharmacy_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.slug          := old.slug;
  new.verified      := old.verified;
  new.active        := old.active;
  new.created_at    := old.created_at;
  new.updated_at    := now();
  return new;
end
$$;

drop trigger if exists trg_pharmacy_self_update on public.pharmacies;
create trigger trg_pharmacy_self_update
  before update on public.pharmacies
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.protect_pharmacy_self_update();

-- 2b. Fármacos criados por farmácias: inactivos até validação
-- NOTA: usa EXISTS inline em vez de função — evita problemas de
-- resolução de funções na expressão da policy. Sem recursão de RLS:
-- a policy de admin_users só invoca is_admin() (security definer).
drop policy if exists "pharmacy create drug" on public.drugs;

create policy "pharmacy create drug"
  on public.drugs for insert
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.role = 'farmacia'
    ) and not active
  );

-- ------------------------------------------------------------
-- 3. View stock_confirmed: expõe available_from + trata a
--    disponibilidade futura (um item com chegada marcada para
--    o futuro não aparece como "confirmado")
-- ------------------------------------------------------------
drop view if exists public.stock_confirmed;

create or replace view public.stock_confirmed
with (security_invoker = true) as
select
  s.id            as stock_item_id,
  d.id            as drug_id,
  d.name          as drug_name,
  d.molecule      as drug_molecule,
  d.form          as drug_form,
  d.dosage        as drug_dosage,
  d.requires_rx   as drug_requires_rx,
  d.priority      as drug_priority,
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
  p.verified      as pharmacy_verified,
  s.quantity,
  s.price,
  s.available_from,
  s.confirmed_at
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and (s.available_from is null or s.available_from <= now())
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Realtime das reservas (sino do portal)
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end
$$;

alter table public.reservations replica identity full;

-- ------------------------------------------------------------
-- 5. Nota para a equipa (comentário, sem efeito funcional)
-- ------------------------------------------------------------
comment on column public.drugs.active is
  'Inactivo = criado por uma farmácia no portal, à espera de validação da equipa CF.';
