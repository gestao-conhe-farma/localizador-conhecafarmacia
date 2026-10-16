-- ============================================================
-- 0028 · Plano de cada farmácia (estado por farmácia)
--
-- PORQUÊ: o catálogo de planos e os entitlements vivem em código
-- (lib/plans.js: preços, limites e funcionalidades), porque mudam mais
-- depressa que o schema e são a fonte de verdade da autorização. O que
-- vive aqui é o ESTADO de cada farmácia: que plano tem, em que ponto do
-- ciclo está (trial, activo, graça, suspenso, cancelado) e as notas
-- internas de quem negocia.
--
-- DECISÕES LOCKED IN (plano: docs/2026-10-16-gestor-equipa-conheca-farmacia.md)
--
--   • `plan_code` NÃO tem CHECK, de propósito: um plano novo em
--     lib/plans.js não pode obrigar a uma migração. Um código
--     desconhecido resolve para os limites do plano de entrada por
--     `entitlements()` — falha para o mínimo, nunca para o máximo.
--
--   • `status` TEM CHECK: são quatro estados fechados, e um erro de
--     escrita num deles é um erro de negócio que interessa apanhar.
--
--   • Ninguém se sobe de plano por si: `authenticated` só tem SELECT da
--     própria linha; toda a escrita é service-role
--     (lib/actions/platform-plans.js), como o PIN da equipa na 0018.
--
--   • `notes` e `updated_by` são de uso interno e ficam FORA do grant de
--     colunas ao `authenticated` (mesma técnica do pin_hash na 0018):
--     a farmácia lê o seu plano e o seu estado, não os comentários que a
--     equipa escreve sobre ela.
--
--   • Nada se apaga: sair do serviço pago é `cancelado` (e volta ao plano
--     de entrada), nunca DELETE. O DELETE é revogado ao service_role para
--     que a regra esteja no schema, e não só na cabeça de quem escreve o
--     código. (Se uma farmácia for eliminada pelo dono da base de dados,
--     a FK `on delete cascade` leva a linha atrás — isso é o dono.)
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0028_pharmacy_subscriptions.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Uma linha por farmácia
--    `updated_at` é escrito pela aplicação que altera o plano (a
--    convenção deste projecto é não ter trigger de updated_at; ver 0018).
-- ------------------------------------------------------------
create table if not exists public.pharmacy_subscriptions (
  pharmacy_id  uuid primary key references public.pharmacies(id) on delete cascade,
  plan_code    text not null default 'localizador',
  status       text not null default 'activo'
               check (status in ('trial','activo','graca','suspenso','cancelado')),
  trial_until  timestamptz,
  grace_until  timestamptz,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  notes        text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists pharmacy_subscriptions_plan_idx
  on public.pharmacy_subscriptions (plan_code, status);

comment on table public.pharmacy_subscriptions is
  'Estado do plano de cada farmácia (0028). Catálogo e limites em lib/plans.js; aqui vive só o estado. Escrita exclusivamente service-role (lib/actions/platform-plans.js); a farmácia lê a própria linha. Nunca se apaga uma subscrição — cancelar é `status = cancelado`.';
comment on column public.pharmacy_subscriptions.notes is
  'Notas internas da equipa sobre a negociação. Fora do grant de colunas ao authenticated: a farmácia não as lê.';
comment on column public.pharmacy_subscriptions.trial_until is
  'Fim do período de experiência. Terminado sem pagamento, a farmácia desce ao plano de entrada — os dados não se apagam.';
comment on column public.pharmacy_subscriptions.grace_until is
  'Fim do período de graça após falha de pagamento. Durante a graça não se corta nada; no fim, desce ao plano de entrada.';

-- ------------------------------------------------------------
-- 2. Só a farmácia lê a sua linha
--    Aqui a policy é mais larga que a da trilha (0027) de propósito: um
--    plano é metadado comercial, não contacto de cliente nem reserva. A
--    matriz dá as ESCRITAS de plano a superadmin e faturacao; a leitura
--    segue a ficha da farmácia, que toda a equipa consulta.
-- ------------------------------------------------------------
alter table public.pharmacy_subscriptions enable row level security;

drop policy if exists "subscriptions read own or team" on public.pharmacy_subscriptions;
create policy "subscriptions read own or team"
  on public.pharmacy_subscriptions for select
  using (public.is_platform_member() or public.is_own_pharmacy(pharmacy_id));

-- Escrita: NENHUMA policy para authenticated — service-role dentro das
-- Server Actions. Um plano não se sobe por pedido do browser.

-- ------------------------------------------------------------
-- 3. Privilégios
--    O service_role tem rolbypassrls (medido na 0027), por isso a policy
--    não o trava: quem trava é o grant. As tabelas novas nascem com ALL
--    para service_role, daí o revoke explícito.
-- ------------------------------------------------------------
revoke all on public.pharmacy_subscriptions from anon, authenticated, service_role;

-- A farmácia vê o plano, o estado e os prazos. Não vê `notes` nem
-- `updated_by` (grant por coluna, como o pin_hash na 0018).
grant select (pharmacy_id, plan_code, status, trial_until, grace_until,
              started_at, ended_at, updated_at)
  on public.pharmacy_subscriptions to authenticated;

grant select, insert, update on public.pharmacy_subscriptions to service_role;
revoke delete on public.pharmacy_subscriptions from service_role;

-- ------------------------------------------------------------
-- 4. Backfill
--    Todas as farmácias existentes entram no plano de entrada, activo e
--    sem prazo: o directório é neutro e a entrada é gratuita. Idempotente
--    (`on conflict do nothing`), para não reescrever um plano atribuído à
--    mão se isto voltar a correr.
-- ------------------------------------------------------------
insert into public.pharmacy_subscriptions (pharmacy_id, plan_code, status)
select id, 'localizador', 'activo' from public.pharmacies
on conflict (pharmacy_id) do nothing;

-- ------------------------------------------------------------
-- 5. Verificação da própria migração
--    Se o backfill falhou (ou o revoke do DELETE não pegou), rebenta aqui
--    em vez de deixar uma base que parece migrada e deixa uma farmácia sem
--    plano atribuível.
-- ------------------------------------------------------------
do $$
declare
  sem_plano int;
  aberturas int;
begin
  select count(*) into sem_plano
  from public.pharmacies p
  left join public.pharmacy_subscriptions s on s.pharmacy_id = p.id
  where s.pharmacy_id is null;

  if sem_plano > 0 then
    raise exception 'Backfill incompleto: % farmacia(s) sem linha de subscricao', sem_plano;
  end if;

  select count(*) into aberturas
  from unnest(array['anon','authenticated']) r
  where has_table_privilege(r, 'public.pharmacy_subscriptions', 'INSERT')
     or has_table_privilege(r, 'public.pharmacy_subscriptions', 'UPDATE')
     or has_table_privilege(r, 'public.pharmacy_subscriptions', 'DELETE');

  if aberturas > 0 then
    raise exception 'Privilegios de escrita abertos a anon/authenticated em pharmacy_subscriptions';
  end if;

  if has_table_privilege('service_role', 'public.pharmacy_subscriptions', 'DELETE') then
    raise exception 'service_role ainda tem DELETE em pharmacy_subscriptions (subscricoes nunca se apagam)';
  end if;
end $$;
