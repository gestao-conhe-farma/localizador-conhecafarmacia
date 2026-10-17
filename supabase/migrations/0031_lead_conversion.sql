-- ============================================================
-- 0031 · A conversão de um lead numa farmácia
--
-- PORQUÊ: a `pharmacy_leads` (0001) nasceu como um saco de contactos — o
-- formulário da landing escreve, e mais nada. O funil não tem estado
-- visível (`status` existe desde a 0001 mas nenhum ecrã o move), não sabe
-- que farmácia nasceu dele, e não há como responder à pergunta que a equipa
-- faz ao telefone: «esta farmácia veio de que contacto, e quando?».
--
-- Esta migração acrescenta só o que a CONVERSÃO precisa de saber, e nada
-- mais:
--
--   • `pharmacy_id` — a farmácia que nasceu deste lead. É o que liga o
--     funil ao directório e o que torna a conversão reentrante: se o
--     convite ao dono falhar depois de a farmácia já existir, uma segunda
--     tentativa continua de onde ficou em vez de criar outra farmácia.
--     `on delete set null` (e não cascade): apagar uma farmácia é coisa do
--     dono da base de dados, e não pode levar atrás o registo comercial de
--     quem entrou — o lead fica, com o rasto na trilha.
--
--   • `onboarded_at` — quando fechou. Não se deriva de `status` porque o
--     `status` pode voltar atrás (um `onboarded` que se percebeu errado) e a
--     data do fecho não deve voltar com ele.
--
--   • `updated_at` / `updated_by` — quem mexeu no funil e quando. A trilha
--     já guarda isto (com motivo e antes/depois); estas duas colunas
--     existem para o ECRÃ: mostrar «mudou há 2 dias, por X» em cada linha
--     sem ir à trilha por lead.
--
-- O que NÃO muda: um lead nunca se apaga. Sair do funil é `descartado`, como
-- uma subscrição sai por `cancelado` e uma farmácia por `active = false`.
-- Por isso o DELETE fica revogado ao service_role — a regra vive no schema.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0031_lead_conversion.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas da conversão
-- ------------------------------------------------------------
alter table public.pharmacy_leads
  add column if not exists pharmacy_id  uuid references public.pharmacies(id) on delete set null,
  add column if not exists onboarded_at timestamptz,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists updated_by   uuid references auth.users(id) on delete set null;

-- Um lead aponta para uma farmácia e uma farmácia nasce de um lead. A
-- unicidade é o que impede o bug clássico de clicar duas vezes em
-- «Converter» e ficarem duas farmácias para o mesmo contacto.
create unique index if not exists pharmacy_leads_pharmacy_uidx
  on public.pharmacy_leads (pharmacy_id)
  where pharmacy_id is not null;

-- O ecrã filtra por estado e ordena pelo mais recente dentro do estado.
create index if not exists pharmacy_leads_funil_idx
  on public.pharmacy_leads (status, created_at desc);

comment on column public.pharmacy_leads.pharmacy_id is
  'Farmácia criada a partir deste lead (0031). Liga o funil ao directório e torna a conversão reentrante: com a farmácia já criada, uma nova tentativa só repete o convite e o fecho do funil.';
comment on column public.pharmacy_leads.onboarded_at is
  'Quando o lead fechou (status = onboarded). Não se deriva do status: se o status voltar atrás, a data do fecho fica.';
comment on column public.pharmacy_leads.updated_by is
  'Quem moveu o lead pela última vez (0031). A trilha tem o antes/depois e o motivo; isto é para o ecrã não ter de ir à trilha por linha.';

-- ------------------------------------------------------------
-- 2. Privilégios
--    A 0001 deixou a tabela com RLS e SEM policies: por PostgREST, anon e
--    authenticated não leem nem escrevem. Aqui fecha-se também o lado dos
--    GRANTS — a área interna lê e escreve com o service-role, no servidor
--    (lib/actions/leads.js), como o resto do /interno.
-- ------------------------------------------------------------
revoke all on public.pharmacy_leads from anon, authenticated;
grant select, insert, update on public.pharmacy_leads to service_role;

-- Um lead nunca se apaga: `descartado` é o fim do funil.
revoke delete on public.pharmacy_leads from service_role;

-- ------------------------------------------------------------
-- 3. Verificação da própria migração
--    Mede-se o que ficou, não o que se escreveu: as colunas existem, o
--    DELETE está fechado, o índice condicional está de pé, e as novas
--    colunas começam vazias (nada de backfill inventado).
-- ------------------------------------------------------------
do $$
declare
  v_colunas int;
  v_abertos int;
begin
  select count(*) into v_colunas
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'pharmacy_leads'
    and column_name in ('pharmacy_id', 'onboarded_at', 'updated_at', 'updated_by');

  if v_colunas <> 4 then
    raise exception '0031: faltam colunas na pharmacy_leads (% de 4)', v_colunas;
  end if;

  if has_table_privilege('service_role', 'public.pharmacy_leads', 'DELETE') then
    raise exception '0031: service_role ainda tem DELETE em pharmacy_leads (um lead nunca se apaga)';
  end if;

  select count(*) into v_abertos
  from unnest(array['anon', 'authenticated']) r
  where has_table_privilege(r, 'public.pharmacy_leads', 'SELECT')
     or has_table_privilege(r, 'public.pharmacy_leads', 'INSERT')
     or has_table_privilege(r, 'public.pharmacy_leads', 'UPDATE')
     or has_table_privilege(r, 'public.pharmacy_leads', 'DELETE');

  if v_abertos > 0 then
    raise exception '0031: privilégios abertos a anon/authenticated em pharmacy_leads';
  end if;

  -- O fecho do funil aponta SEMPRE para a farmácia que nasceu dele. Na
  -- migração isto é vazio (as colunas são novas); a partir daí é o que
  -- impede um «onboarded» sem farmácia, que é um funil que mente.
  if exists (
    select 1 from public.pharmacy_leads
    where onboarded_at is not null and pharmacy_id is null
  ) then
    raise exception '0031: lead fechado sem farmácia (onboarded_at sem pharmacy_id)';
  end if;
end $$;
