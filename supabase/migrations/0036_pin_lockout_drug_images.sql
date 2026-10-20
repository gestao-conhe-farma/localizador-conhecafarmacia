-- ============================================================
-- 0036 · ALTO 1 (PIN sem limite) + ALTO 2 (drug-images falha)
--
-- ALTO 1 — o PIN de 4 dígitos (10 000 combinações) aceitava tentativas
-- ilimitadas em `enterStaffProfile`. Novas colunas de contador +
-- bloqueio: a aplicação incrementa `pin_attempts` a cada falha e grava
-- `pin_locked_until` com espera exponencial; o sucesso repõe a zero.
--
-- ALTO 2 — as policies de 0013 exigiam
-- `(storage.foldername(name))[1] = auth.uid()::text`, mas a aplicação
-- grava em `<pharmacy_id>/<drug_id>.<ext>` (o id da FARMÁCIA, não o
-- uid do login) — a escrita legítima era sempre negada. A policy passa
-- a validar o vínculo real: o prefixo tem de ser a farmácia do
-- utilizador (`is_own_pharmacy`) ou a equipa (`is_admin`).
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0036_pin_lockout_drug_images.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contador de tentativas + bloqueio do PIN
-- ------------------------------------------------------------
alter table public.pharmacy_staff
  add column if not exists pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pharmacy_staff_pin_attempts_check'
  ) then
    alter table public.pharmacy_staff
      add constraint pharmacy_staff_pin_attempts_check check (pin_attempts >= 0);
  end if;
end $$;

-- Colunas de segurança: invisíveis ao PostgREST autenticado, como o
-- pin_hash (0018) — só o service-role as lê/escreve.
revoke all on public.pharmacy_staff from anon, authenticated;
grant select (id, pharmacy_id, name, role, active, created_at, updated_at)
  on public.pharmacy_staff to authenticated;

-- ------------------------------------------------------------
-- 2. Vínculo real farmácia↔objecto no bucket drug-images
-- ------------------------------------------------------------
create or replace function public.can_write_drug_image(path text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if path is null or path = '' then
    return false;
  end if;
  -- Prefixo malformado (não-uuid) nega em vez de rebentar: um erro de
  -- cast na policy seria um deny opaco na mesma, mas assim fica legível.
  begin
    pid := (storage.foldername(path))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.is_admin() or public.is_own_pharmacy(pid);
end
$$;

revoke all on function public.can_write_drug_image(text) from public;
grant execute on function public.can_write_drug_image(text) to authenticated, service_role;

drop policy if exists "drug images pharmacy write" on storage.objects;
drop policy if exists "drug images pharmacy update" on storage.objects;
drop policy if exists "drug images pharmacy delete" on storage.objects;

-- Escrita: o primeiro segmento do caminho é a farmácia de quem sobe.
create policy "drug images pharmacy write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'drug-images'
  and public.can_write_drug_image(name)
);

create policy "drug images pharmacy update"
on storage.objects for update to authenticated
using (
  bucket_id = 'drug-images'
  and public.can_write_drug_image(name)
)
with check (
  bucket_id = 'drug-images'
  and public.can_write_drug_image(name)
);

create policy "drug images pharmacy delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'drug-images'
  and public.can_write_drug_image(name)
);

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_name = 'pharmacy_staff'
--    and column_name in ('pin_attempts', 'pin_locked_until');
-- select policyname, cmd from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and policyname like 'drug images%';
-- select has_function_privilege('authenticated', 'public.can_write_drug_image(text)', 'execute');
