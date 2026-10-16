-- ============================================================
-- 0030 · O selo e o estado da farmácia são da EQUIPA (e só dela)
--
-- PORQUÊ: a migração 0005 protegeu `slug`, `verified`, `active` e
-- `created_at` com um trigger `before update` que repõe os valores antigos
-- em QUALQUER update da tabela (`when pg_trigger_depth() = 0`). Na altura
-- o objectivo era um só: a farmácia, pelo portal, não se dá o selo nem se
-- reactiva sozinha (a policy de UPDATE dá-lhe a linha, não as colunas —
-- licoes §3.4). Era correcto e continua a ser.
--
-- O QUE MUDOU: a área interna (/interno, 0027) passa a ser quem move
-- exactamente essas duas colunas — «Dar selo de verificada» e
-- «Desactivar farmácia, com motivo» são acções da matriz, com trilha em
-- `platform_audit_log`. Com o trigger como estava, elas escreviam no
-- servidor, o Postgres repunha o valor antigo EM SILÊNCIO e a trilha
-- ficava a registar uma mudança que nunca aconteceu — pior do que uma
-- acção que falha: uma auditoria que mente. (Medido antes desta migração:
-- linha `pharmacy.verify` na trilha, `pharmacies.verified` ainda `false`.)
--
-- COMO: o trigger deixa de travar o caminho privilegiado e continua a
-- travar o resto.
--
--   (a) o SERVIDOR da equipa — PostgREST com a service key, que é o que as
--       Server Actions internas usam: `request_role()` = 'service_role';
--   (b) a LIGAÇÃO DE ADMINISTRAÇÃO (migrações e scripts de manutenção):
--       não traz claims nenhumas e é a dona da base.
--
-- Um pedido de cliente traz SEMPRE claims — o PostgREST escreve-as em cada
-- pedido, mesmo para `anon` — e por isso (b) não se pode imitar de fora da
-- base: para um pedido da farmácia a segunda condição é sempre falsa e as
-- quatro colunas continuam a ser repostas, como na 0005.
--
-- O papel do pedido lê-se com `public.request_role()`, a função da 0020
-- criada para isto mesmo: dentro de uma função SECURITY DEFINER
-- `current_user` é o DONO da função, não quem chamou, e não serve para
-- decidir. `session_user` é a ligação real — um pedido do PostgREST entra
-- sempre como `authenticator`, mesmo depois de `set local role
-- service_role`.
--
-- `slug` e `created_at` continuam intocáveis para toda a gente (a morada
-- pública da farmácia não se muda por acção nenhuma da equipa) e
-- `updated_at = now()` mantém-se no mesmo sítio de sempre.
--
-- NOTA: o `verified`/`active` do caminho privilegiado não é «confiar no
-- servidor». As Server Actions internas voltam a ler a linha depois de
-- escrever e recusam-se a registar na trilha o que não ficou gravado
-- (lib/actions/platform-pharmacies.js) — este trigger era precisamente o
-- caso que escapava a esse cuidado.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0030_team_writes_pharmacy_state.sql
-- ============================================================

create or replace function public.protect_pharmacy_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Caminho privilegiado (equipa pelo servidor, ou administração da base):
  -- o selo e o estado mudam; a morada pública continua a não mudar.
  if public.request_role() = 'service_role'
     or (current_setting('request.jwt.claims', true) is null
         and session_user in ('postgres', 'supabase_admin')) then
    new.slug       := old.slug;
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
  end if;

  -- Caminho da farmácia (e de qualquer outro cliente): como na 0005. Um
  -- portal não se dá o selo, não se reactiva depois de suspensa e não muda
  -- a própria morada pública.
  new.slug       := old.slug;
  new.verified   := old.verified;
  new.active     := old.active;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end
$$;

comment on function public.protect_pharmacy_self_update() is
  'Colunas que só a equipa muda em pharmacies (0030): slug e created_at são intocáveis para todos; verified e active só passam pelo caminho privilegiado (service_role pelo PostgREST, ou ligação de administração sem claims). O portal da farmácia continua a receber os valores antigos de verified/active — a policy de UPDATE dá-lhe a linha, o trigger protege as colunas.';

-- ------------------------------------------------------------
-- Verificação da própria migração
-- Não basta olhar para a função: mede-se o que ela FAZ, com um pedido de
-- cada tipo. Cria-se uma farmácia de sonda, tenta-se mudar o selo, o estado
-- e o slug (a) pelo caminho privilegiado e (b) com as claims de um pedido
-- de cliente, apaga-se a sonda e só depois é que se decide se a migração
-- falhou — para que o veredicto não deixe lixo na tabela do directório.
--
-- (b) usa exactamente o que distingue um pedido de cliente: as claims.
-- Que as claims valham 'authenticated' é indiferente para o veredicto —
-- o que se está a medir é que um pedido COM claims não fica privilegiado.
-- ------------------------------------------------------------
do $$
declare
  v_id      uuid;
  v_equipa  boolean := false;
  v_cliente boolean := false;
  v_slug    text;
begin
  insert into public.pharmacies (slug, name, municipio, verified, active)
  values ('zz-sonda-trigger-0030', 'Sonda 0030 (apagar)', 'Viana', false, true)
  returning id into v_id;

  -- (a) Pedido do servidor da equipa (service key): o selo e o estado têm
  --     de pegar, e o slug continuar intocável.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update public.pharmacies
     set verified = true, active = false, slug = 'zz-sonda-trigger-hack'
   where id = v_id;

  select verified and not active and slug = 'zz-sonda-trigger-0030'
    into v_equipa
    from public.pharmacies
   where id = v_id;

  -- (b) Pedido de um cliente (o portal da farmácia): o trigger tem de
  --     repor as três colunas — e é a mesma sonda que serve de prova.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  update public.pharmacies
     set verified = false, active = true, slug = 'zz-sonda-trigger-hack'
   where id = v_id;

  select verified and not active and slug = 'zz-sonda-trigger-0030'
    into v_cliente
    from public.pharmacies
   where id = v_id;

  perform set_config('request.jwt.claims', null, true);

  select slug into v_slug from public.pharmacies where id = v_id;
  delete from public.pharmacies where id = v_id;

  if not v_equipa then
    raise exception 'Trigger 0030: o pedido da equipa (service_role) não conseguiu mudar verified/active';
  end if;

  if not v_cliente then
    raise exception 'Trigger 0030: um pedido de cliente passou a poder mudar verified/active/slug (slug=%)', v_slug;
  end if;

  if exists (select 1 from public.pharmacies where slug like 'zz-sonda-trigger%') then
    raise exception 'Trigger 0030: a sonda ficou na tabela das farmácias';
  end if;
end $$;
