-- ============================================================
-- FIX v2 · "Database error querying schema" (GoTrue 500)
--
-- O INSERT manual em auth.users deixou colunas a NULL e/ou sem
-- a linha correspondente em auth.identities. Qualquer query de
-- Auth (login, getUser, listUsers) falha enquanto existir uma
-- linha nestas condições — mesmo que o utilizador "novo" esteja
-- correcto, a scan da tabela inteira parte.
--
-- Aplicar no SQL Editor do dashboard do Supabase, por ordem.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DIAGNÓSTICO — ver que linhas estão partidas e como
-- ------------------------------------------------------------
select
  u.id,
  u.email,
  u.created_at,
  u.confirmation_token is null      as ct_null,
  u.recovery_token is null          as rt_null,
  u.email_change_token_new is null  as ecn_null,
  u.email_change_token_current is null as ecc_null,
  u.reauthentication_token is null as reauth_null,
  u.phone_change_token is null      as pct_null,
  (select count(*) from auth.identities i where i.user_id = u.id) as n_identities
from auth.users u
order by u.created_at desc;

-- ------------------------------------------------------------
-- 2. FIX dos NULLs (o GoTrue espera string vazia, não NULL)
-- ------------------------------------------------------------
update auth.users
   set confirmation_token = coalesce(confirmation_token, ''),
       recovery_token = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       email_change_confirm_status = coalesce(email_change_confirm_status, 0),
       reauthentication_token = coalesce(reauthentication_token, ''),
       phone_change_token = coalesce(phone_change_token, ''),
       phone = coalesce(phone, ''),
       invited_at = coalesce(invited_at, now()),
       confirmation_sent_at = coalesce(confirmation_sent_at, now()),
       recovery_sent_at = coalesce(recovery_sent_at, now()),
       email_change_sent_at = coalesce(email_change_sent_at, now()),
       reauthentication_sent_at = coalesce(reauthentication_sent_at, now()),
       phone_change_sent_at = coalesce(phone_change_sent_at, now())
 where confirmation_token is null
    or recovery_token is null
    or email_change_token_new is null
    or email_change_token_current is null
    or email_change_confirm_status is null
    or reauthentication_token is null
    or phone_change_token is null;

-- ------------------------------------------------------------
-- 3. FIX identities em falta (login por e-mail exige identity
--    do provider 'email'; o insert manual não a criou)
-- ------------------------------------------------------------
insert into auth.identities (
  user_id, provider, provider_id, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  u.id,
  'email',
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true
  ),
  now(), now(), now()
from auth.users u
where u.email is not null
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- ------------------------------------------------------------
-- 4. Se a linha do seed anterior (demo antigo) ainda existir e
--    atrapalhar, APAGÁ-LA é seguro — desde que NÃO seja a que
--    queres usar. Ver o e-mail na coluna do diagnóstico (1).
--    Descomenta e ajusta o e-mail se precisares:
-- ------------------------------------------------------------
-- delete from auth.users where email = 'demo@conhecafarmacia.com';

-- ------------------------------------------------------------
-- 5. VERIFICAÇÃO — deve devolver 0 linhas
-- ------------------------------------------------------------
select id, email
from auth.users
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change_token_current is null
   or email_change_confirm_status is null
   or reauthentication_token is null
   or phone_change_token is null
   or phone is null;
