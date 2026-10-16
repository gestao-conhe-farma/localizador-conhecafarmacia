-- ============================================================
-- 0029 · Vista de conjunto por farmácia (área interna da equipa)
--
-- PORQUÊ: a lista de farmácias da área interna precisa de, por farmácia,
-- o plano e o estado, as contas, os perfis, as chaves e os destinos de
-- integração, o stock confirmado e a última confirmação, as reservas
-- abertas e a última acção da equipa. São seis tabelas diferentes e o
-- PostgREST não agrega (`group by` não existe na API): sem isto, a lista
-- teria de arrastar TODAS as linhas de cada tabela para contar no
-- JavaScript — e a última confirmação de stock nem assim sairia correcta
-- (um `limit` sobre as linhas mais recentes não diz nada sobre uma
-- farmácia sem confirmações). É o mesmo problema que a 0003 resolveu para
-- a lista pública, resolvido da mesma maneira: a agregação no Postgres.
--
-- CIRCUNSTÂNCIA: é uma função de LEITURA da equipa, e por isso o EXECUTE
-- é revogado a `public`/`anon`/`authenticated` e concedido só ao
-- `service_role`. A área interna lê com o cliente service-role e decide
-- pelo código (lib/platform/permissions.js) — a RLS não foi alargada aos
-- níveis internos na 0027, e esta função não é a brecha por onde isso
-- entraria. `security invoker` (o default) de propósito: quem a chama é o
-- `service_role`, que tem rolbypassrls; não há aqui privilégio novo.
--
-- NOTA DE NOMES: os parâmetros de saída (`returns table`) são variáveis no
-- corpo da função, por isso todas as colunas são referenciadas
-- QUALIFICADAS (`p.name`, `c.n`) — qualificar é o que evita a ambiguidade
-- entre `name` de saída e `p.name` de origem.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0029_platform_pharmacy_overview.sql
-- ============================================================

create or replace function public.platform_pharmacy_overview()
returns table (
  pharmacy_id     uuid,
  slug            text,
  name            text,
  municipio       text,
  active          boolean,
  verified        boolean,
  created_at      timestamptz,
  plan_code       text,
  plan_status     text,
  trial_until     timestamptz,
  grace_until     timestamptz,
  contas          bigint,
  perfis          bigint,
  perfis_activos  bigint,
  chaves_activas  bigint,
  destinos        bigint,
  stock_confirmado bigint,
  stock_ultimo    timestamptz,
  reservas_abertas bigint,
  ultima_accao    text,
  ultima_accao_em timestamptz
)
language sql
stable
set search_path = public
as $$
  with
  -- Contas da farmácia: o papel 'farmacia' é o único com pharmacy_id (a
  -- 0001 garante-o no próprio CHECK de `admin_users`).
  contas as (
    select au.pharmacy_id, count(*) as n
    from public.admin_users au
    where au.role = 'farmacia'
    group by au.pharmacy_id
  ),
  -- Perfis do balcão (0018) — total e quantos podem entrar hoje.
  perfis as (
    select s.pharmacy_id,
           count(*) as n,
           count(*) filter (where s.active) as n_activos
    from public.pharmacy_staff s
    group by s.pharmacy_id
  ),
  -- Chaves de API vivas (0023): activas e não revogadas. A chave revogada
  -- fica na lista da ficha mas não conta para o limite do plano.
  chaves as (
    select k.pharmacy_id, count(*) as n
    from public.pharmacy_api_keys k
    where k.active and k.revoked_at is null
    group by k.pharmacy_id
  ),
  -- Destinos de webhook activos (0023/0025).
  destinos as (
    select w.pharmacy_id, count(*) as n
    from public.pharmacy_webhooks w
    where w.active
    group by w.pharmacy_id
  ),
  -- Stock: quantos itens estão confirmados DENTRO da janela de 72 h (a
  -- mesma regra do Localizador, 0008) e quando foi a última confirmação de
  -- um item que continua em stock — é esta data que diz se a farmácia está
  -- a alimentar o directório ou parada.
  stock as (
    select i.pharmacy_id,
           count(*) filter (
             where i.in_stock and i.confirmed_at > now() - interval '72 hours'
           ) as n_confirmado,
           max(i.confirmed_at) filter (where i.in_stock) as ultimo
    from public.stock_items i
    group by i.pharmacy_id
  ),
  -- Reservas por atender: as três que continuam a pedir trabalho à farmácia.
  reservas as (
    select r.pharmacy_id, count(*) as n
    from public.reservations r
    where r.status in ('pendente', 'confirmada', 'pronta')
    group by r.pharmacy_id
  ),
  -- Última acção da equipa sobre esta farmácia (trilha da 0027). Por
  -- farmácia, a mais recente — `distinct on` é o atalho do Postgres para
  -- isto e evita uma segunda passagem pela tabela.
  acoes as (
    select distinct on (a.pharmacy_id) a.pharmacy_id, a.action, a.created_at
    from public.platform_audit_log a
    where a.pharmacy_id is not null
    order by a.pharmacy_id, a.created_at desc
  )
  select
    p.id,
    p.slug,
    p.name,
    p.municipio,
    p.active,
    p.verified,
    p.created_at,
    -- Sem linha de subscrição (migração 0028 por aplicar, ou farmácia
    -- criada à mão) o resultado é NULL e a lista mostra «sem plano»: é a
    -- diferença entre «não tem» e «tem o plano de entrada», e a equipa
    -- precisa de ver as duas.
    s.plan_code,
    s.status,
    s.trial_until,
    s.grace_until,
    coalesce(c.n, 0),
    coalesce(f.n, 0),
    coalesce(f.n_activos, 0),
    coalesce(k.n, 0),
    coalesce(w.n, 0),
    coalesce(st.n_confirmado, 0),
    st.ultimo,
    coalesce(r.n, 0),
    a2.action,
    a2.created_at
  from public.pharmacies p
  left join public.pharmacy_subscriptions s on s.pharmacy_id = p.id
  left join contas    c  on c.pharmacy_id  = p.id
  left join perfis    f  on f.pharmacy_id  = p.id
  left join chaves    k  on k.pharmacy_id  = p.id
  left join destinos  w  on w.pharmacy_id  = p.id
  left join stock     st on st.pharmacy_id = p.id
  left join reservas  r  on r.pharmacy_id  = p.id
  left join acoes     a2 on a2.pharmacy_id = p.id
  order by p.name
$$;

-- Só a equipa, e só pelo servidor. `anon`/`authenticated` não chamam isto:
-- a leitura interna é do service-role e a autorização é a matriz em código.
revoke execute on function public.platform_pharmacy_overview() from public, anon, authenticated;
grant execute on function public.platform_pharmacy_overview() to service_role;

comment on function public.platform_pharmacy_overview() is
  'Uma linha por farmácia com os números que a lista da área interna mostra (0029). Agrega plano, contas, perfis, chaves, destinos, stock, reservas e a última acção da equipa — o PostgREST não faz group by e sem isto a lista arrastaria tabelas inteiras. EXECUTE só para service_role.';

-- ------------------------------------------------------------
-- Verificação da própria migração
-- Uma farmácia sem linha não é tolerada: a lista perderia farmácias em
-- silêncio. E o EXECUTE aberto a `authenticated` seria uma leitura interna
-- exposta à API pública — as duas coisas rebentam aqui.
-- ------------------------------------------------------------
do $$
declare
  n_farmacias int;
  n_linhas    int;
  aberturas   int;
begin
  select count(*) into n_farmacias from public.pharmacies;
  select count(*) into n_linhas from public.platform_pharmacy_overview();

  if n_linhas <> n_farmacias then
    raise exception 'platform_pharmacy_overview devolveu % linhas para % farmacias', n_linhas, n_farmacias;
  end if;

  select count(*) into aberturas
  from unnest(array['anon', 'authenticated']) r
  where has_function_privilege(r, 'public.platform_pharmacy_overview()', 'EXECUTE');

  if aberturas > 0 then
    raise exception 'platform_pharmacy_overview executavel por anon/authenticated';
  end if;
end $$;
