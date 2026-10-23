-- 0041 · PEDIDO DE ADESÃO DE FARMÁCIA
--
-- PORQUÊ: o formulário de /farmacias/participar recolhe a identificação
-- completa da farmácia (NIF, alvará, morada, presença digital) e o
-- consentimento da Política de Privacidade. A `pharmacy_leads` da 0001
-- só tinha nome, responsável, cargo, e-mail, telefone, município e
-- mensagem; sem estas colunas o pedido não podia ser lido nem convertido
-- no /interno com os dados que a farmácia enviou.
--
-- O que NÃO muda:
--   • a tabela continua fechada a anon/authenticated (só service role);
--   • os leads nunca se apagam; o funil mantém os estados da 0001/0031;
--   • os campos novos são opcionais na BD para não invalidar os leads que
--     já existem. A obrigatoriedade (quase todos) é validada na rota
--     /api/leads e no formulário.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0041_lead_application_fields.sql

alter table public.pharmacy_leads
  add column if not exists nif text,
  add column if not exists license text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists social text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text;

comment on column public.pharmacy_leads.nif is
  'NIF da farmácia, declarado no formulário de adesão (0041).';
comment on column public.pharmacy_leads.license is
  'Número do alvará/licença de funcionamento da farmácia (0041).';
comment on column public.pharmacy_leads.address is
  'Morada completa indicada no formulário; pré-preenche a farmácia na conversão (0041).';
comment on column public.pharmacy_leads.website is
  'Website da farmácia, normalizado com https:// quando o utilizador não o escreve (0041).';
comment on column public.pharmacy_leads.social is
  'Redes sociais / identificadores públicos da farmácia, em texto livre (0041).';
comment on column public.pharmacy_leads.consent_at is
  'Quando o requerente aceitou a Política de Privacidade; nulo nos leads anteriores ao formulário novo (0041).';
comment on column public.pharmacy_leads.consent_version is
  'Versão da Política de Privacidade aceite (0041).';

create index if not exists pharmacy_leads_email_idx
  on public.pharmacy_leads (email);

create index if not exists pharmacy_leads_phone_idx
  on public.pharmacy_leads (phone);

-- Verificação: as colunas novas existem e os privilégios continuam fechados.
do $$
declare
  v_colunas int;
begin
  select count(*) into v_colunas
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'pharmacy_leads'
    and column_name in ('nif', 'license', 'address', 'website', 'social', 'consent_at', 'consent_version');

  if v_colunas <> 7 then
    raise exception '0041: faltam colunas novas na pharmacy_leads (% de 7)', v_colunas;
  end if;

  if has_table_privilege('anon', 'public.pharmacy_leads', 'SELECT')
     or has_table_privilege('authenticated', 'public.pharmacy_leads', 'SELECT')
     or has_table_privilege('anon', 'public.pharmacy_leads', 'INSERT')
     or has_table_privilege('authenticated', 'public.pharmacy_leads', 'INSERT') then
    raise exception '0041: pharmacy_leads voltou a estar acessível a anon/authenticated';
  end if;
end $$;
