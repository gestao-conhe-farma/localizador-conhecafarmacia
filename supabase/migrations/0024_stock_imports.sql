-- ============================================================
-- 0024 · Importações de stock (CSV) — ficha, contagens e relatório
--
-- O caminho que resolve 80% dos casos reais (plano 2026-10-12, ideia 1,
-- passo 4): a farmácia exporta o stock do sistema que já tem, mapeia as
-- colunas no portal e nós ingerimos. Cada importação fica registada com
-- o que entrou, o que falhou e porquê — sem isso, um ficheiro de 400
-- linhas com 12 erros era impossível de explicar a quem o enviou.
--
-- Ligação ao livro-razão: cada linha aplicada gera um movimento
-- (`source = 'csv'`, `source_ref = <id desta ficha>`), pelo que o
-- histórico mostra exactamente o que aquela importação fez.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0024_stock_imports.sql
-- ============================================================

create table if not exists public.stock_imports (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,

  kind             text not null default 'csv' check (kind in ('csv','api')),
  file_name        text check (file_name is null or char_length(file_name) <= 200),

  rows_total       integer not null default 0 check (rows_total >= 0),
  rows_ok          integer not null default 0 check (rows_ok >= 0),
  rows_error       integer not null default 0 check (rows_error >= 0),
  rows_skipped     integer not null default 0 check (rows_skipped >= 0),

  -- Relatório curto por linha com erro: [{linha, referencia, erro}].
  -- Limitado a 100 entradas na aplicação (o resto conta-se em rows_error).
  report           jsonb,

  -- Quem importou (perfil de farmacêutico activo, quando há).
  created_by_staff uuid references public.pharmacy_staff(id) on delete set null,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

comment on table public.stock_imports is
  'Ficha de cada importação de stock (CSV/API): contagens e relatório de linhas rejeitadas.';

create index if not exists stock_imports_pharmacy_idx
  on public.stock_imports (pharmacy_id, created_at desc);

-- ------------------------------------------------------------
-- RLS — a farmácia vê as suas importações; escrita só via
-- service-role nas Server Actions (a mesma regra das chaves).
-- ------------------------------------------------------------
alter table public.stock_imports enable row level security;

drop policy if exists "imports pharmacy read" on public.stock_imports;
create policy "imports pharmacy read"
  on public.stock_imports for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.stock_imports from anon, authenticated;
grant select on public.stock_imports to authenticated, service_role;

-- ============================================================
-- Verificação (depois de aplicar):
--   select to_regclass('public.stock_imports') as importacoes;
--   select policyname from pg_policies where tablename = 'stock_imports';
-- ============================================================
