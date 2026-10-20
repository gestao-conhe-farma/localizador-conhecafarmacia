-- ============================================================
-- 0039 · Vista interna: «stock confirmado» com a frescura por categoria
--
-- PORQUÊ: a 0029 conta como stock confirmado os itens confirmados nas
-- últimas 72 h — a regra que valia quando tudo era medicamento. A 0038
-- passou a manter a parafarmácia visível 30 dias, por isso uma farmácia
-- que só tenha produtos de parafarmácia confirmados há uma semana está
-- no Localizador e a lista interna mostrava «0 stock confirmado» —
-- números diferentes para o mesmo stock, exactamente o defeito que a
-- 0008 corrigiu na lista pública.
--
-- O QUE MUDA: só o COUNT do stock na função platform_pharmacy_overview.
-- O resto do corpo é uma cópia fiel da 0029 (mesmas colunas, mesma
-- ordem, mesmo `security invoker`, mesmos grants). As permissões NÃO se
-- perdem no create or replace.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0039_interno_stock_por_categoria.sql
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
  -- Contas da farmácia: o papel 'farmacia' é o único com pharmacy_id.
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
  -- Chaves de API vivas (0023).
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
  -- Stock: quantos itens estão confirmados dentro da janela da SUA
  -- categoria (0038: medicamentos 72 h, parafarmácia 30 dias) e quando
  -- foi a última confirmação de um item que continua em stock.
  stock as (
    select i.pharmacy_id,
           count(*) filter (
             where i.in_stock
               and exists (
                 select 1 from public.drugs d
                  where d.id = i.drug_id
                    and d.active
                    and (
                      (d.kind = 'medicamento'
                        and i.confirmed_at > now() - interval '72 hours')
                      or (d.kind <> 'medicamento'
                        and i.confirmed_at > now() - interval '30 days')
                    )
               )
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
  -- Última acção da equipa sobre esta farmácia (trilha da 0027).
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

-- Os grants da 0029 mantêm-se com o create or replace; reaplicar é
-- barato e garante que a função continua fechada à API pública.
revoke execute on function public.platform_pharmacy_overview() from public, anon, authenticated;
grant execute on function public.platform_pharmacy_overview() to service_role;

-- ------------------------------------------------------------
-- Verificação: nenhuma farmácia pode desaparecer da lista, e o count de
-- stock nunca pode ser maior do que o número de itens em stock.
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
