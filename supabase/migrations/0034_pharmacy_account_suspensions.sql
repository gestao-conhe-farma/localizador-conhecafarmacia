-- ============================================================
-- 0034 · Suspensão da conta da farmácia (ban + farmácia/perfis inactivos)
--
-- PORQUÊ: a ficha interna já desactiva a farmácia (`pharmacy.deactivate`),
-- mas isso é só a vitrina: o acesso ao portal continua vivo enquanto a
-- conta Auth e os perfis do balcão não forem cortados. A suspensão da
-- conta (Phase 6.3 / Task 5.3 Step 3) é a operação completa — ban nas
-- contas Auth, `pharmacies.active = false` e `pharmacy_staff.active =
-- false` — e precisa de ser REVERSÍVEL sem adivinhar o que estava activo
-- antes.
--
-- PORQUE É QUE ESTA TABELA EXISTE (e a trilha não chega):
--   `platform_audit_log` é a memória do que aconteceu; esta tabela é o
--   estado operacional do que FALTA desfazer. Guarda a fotografia mínima
--   do momento da suspensão:
--
--     • `pharmacy_was_active`  — repor acesso não pode reactivar uma
--       farmácia que já estava inactiva por outra razão;
--     • `staff_active_ids`     — só os perfis que estavam activos voltam
--       a estar activos (os que a farmácia desligou de propósito ficam
--       desligados);
--     • `accounts_banned_ids`  — só se levanta o ban que ESTA suspensão
--       aplicou; uma conta já banida por outro motivo não é desbanida
--       por acidente.
--
--   Uma linha = uma suspensão em vigor. Repor o acesso apaga a linha; a
--   trilha continua a guardar as duas operações (account.suspend e
--   account.unsuspend), com motivo, actor e antes/depois.
--
-- Acesso: service-role apenas. Não há policy porque não há leitura nem
-- escrita para `anon`/`authenticated`: o portal da farmácia nunca vê esta
-- tabela, e a equipa lê-a pelo servidor.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0034_pharmacy_account_suspensions.sql
-- ============================================================

create table if not exists public.pharmacy_account_suspensions (
  pharmacy_id        uuid primary key references public.pharmacies(id) on delete cascade,
  suspended_at       timestamptz not null default now(),
  suspended_by       uuid references auth.users(id) on delete set null,
  suspended_by_email text,
  reason             text not null,
  pharmacy_was_active boolean not null default true,
  staff_active_ids   uuid[] not null default '{}',
  accounts_banned_ids uuid[] not null default '{}',
  constraint pharmacy_account_suspensions_reason_check
    check (length(btrim(reason)) >= 3)
);

alter table public.pharmacy_account_suspensions enable row level security;

-- Nem o service_role fica com DELETE/UPDATE implícito de um grant antigo:
-- a linha só é criada e apagada pela Server Action, que é quem sabe manter
-- farmácia/perfis/contas coerentes com ela.
revoke all on public.pharmacy_account_suspensions from anon, authenticated, service_role;
grant select, insert, update, delete on public.pharmacy_account_suspensions to service_role;

comment on table public.pharmacy_account_suspensions is
  'Suspensão em vigor de uma conta de farmácia (0034). Uma linha = ban nas contas Auth + farmácia/perfis inactivos; apagar a linha é repor o acesso. Guarda a fotografia necessária para repor só o que a suspensão desligou. Sem acesso para anon/authenticated.';
comment on column public.pharmacy_account_suspensions.pharmacy_was_active is
  '`pharmacies.active` antes da suspensão: repor acesso não reactiva uma farmácia que já estava inactiva.';
comment on column public.pharmacy_account_suspensions.staff_active_ids is
  'Perfis de balcão que estavam activos na suspensão. Só estes voltam a activo ao repor o acesso.';
comment on column public.pharmacy_account_suspensions.accounts_banned_ids is
  'Contas Auth que ESTA suspensão baniu. Só estes bans são levantados ao repor o acesso.';

-- ------------------------------------------------------------
-- Verificação da própria migração
-- Confirma que a tabela existe e que nenhum papel de cliente lhe toca.
-- ------------------------------------------------------------
do $$
declare
  n_linhas int;
begin
  if to_regclass('public.pharmacy_account_suspensions') is null then
    raise exception '0034: a tabela pharmacy_account_suspensions não foi criada';
  end if;

  if has_table_privilege('anon', 'public.pharmacy_account_suspensions', 'select')
     or has_table_privilege('authenticated', 'public.pharmacy_account_suspensions', 'select') then
    raise exception '0034: anon/authenticated conseguem ler a tabela de suspensões';
  end if;

  if not has_table_privilege('service_role', 'public.pharmacy_account_suspensions', 'select') then
    raise exception '0034: service_role não consegue ler a tabela de suspensões';
  end if;

  select count(*) into n_linhas from public.pharmacy_account_suspensions;
  if n_linhas <> 0 then
    raise exception '0034: a tabela nova já tinha % linha(s)', n_linhas;
  end if;
end $$;
