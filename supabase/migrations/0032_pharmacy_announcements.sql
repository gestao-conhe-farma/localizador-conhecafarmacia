-- ============================================================
-- 0032 · Avisos da Equipa Conheça Farmácia
--
-- PORQUÊ: o sino do portal passa a levar a uma página de avisos enviados
-- pela equipa (manutenção, campanhas, mudanças de plano). Duas peças:
--
--   • `pharmacy_announcements` — a mensagem. `pharmacy_id` nulo = TODAS as
--     farmácias; um id = só aquela. Arquivar é `archived_at`, nunca DELETE:
--     um aviso que foi enviado é um facto, e a equipa tem de o poder ler
--     depois (o mesmo princípio da 0028 para as subscrições).
--
--   • `pharmacy_announcement_reads` — o recibo de leitura POR FARMÁCIA
--     (uma linha por anúncio + farmácia, não por pessoa): o sino é da
--     farmácia e o balcão inteiro partilha o mesmo estado. `read_by`
--     guarda quem abriu primeiro, para a equipa saber que o aviso chegou
--     a alguém.
--
-- REGRAS
--
--   • A farmácia LÊ os avisos que lhe são dirigidos (os seus + os de
--     todos); não escreve anúncios. Toda a escrita de conteúdo é
--     service-role (`lib/actions/platform-announcements.js`), como nos
--     planos (0028).
--   • Arquivado ou fora do prazo (`expires_at`) deixa de aparecer na RLS:
--     retirar um aviso do portal é uma decisão que vale também para quem
--     pedir a tabela directamente, não só para a UI.
--   • Os recibos são append-only para a farmácia: só INSERT e SELECT das
--     suas próprias linhas. O DELETE fica revogado ao service_role — um
--     aviso não se «deslê».
--   • Os campos internos (`published_by`, `archived_by`, `archived_at`)
--     ficam fora do grant por coluna ao `authenticated`, como as notas da
--     0028: a farmácia vê o aviso, não o rasto de quem o geriu.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0032_pharmacy_announcements.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. O aviso
-- ------------------------------------------------------------
create table if not exists public.pharmacy_announcements (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_id   uuid references public.pharmacies(id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 3 and 120),
  body          text not null check (char_length(btrim(body)) between 1 and 4000),
  tone          text not null default 'info' check (tone in ('info','warn','ok')),
  published_at  timestamptz not null default now(),
  expires_at    timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  archived_at   timestamptz,
  archived_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Um aviso que expira antes de nascer não é um aviso: é um engano.
  constraint pharmacy_announcements_expiry_check
    check (expires_at is null or expires_at > published_at)
);

comment on table public.pharmacy_announcements is
  'Avisos da Equipa Conheça Farmácia no portal (0032). pharmacy_id nulo = todas as farmácias. Arquivar é archived_at; nunca DELETE. Escrita exclusivamente service-role (lib/actions/platform-announcements.js).';
comment on column public.pharmacy_announcements.expires_at is
  'Fim da validade do aviso. Fora do prazo deixa de aparecer no portal — a linha fica, para a equipa poder consultar o que enviou.';
comment on column public.pharmacy_announcements.archived_at is
  'Retirado do portal pela equipa. Nunca se apaga: um aviso enviado é um facto.';

create index if not exists pharmacy_announcements_feed_idx
  on public.pharmacy_announcements (pharmacy_id, published_at desc);
create index if not exists pharmacy_announcements_published_idx
  on public.pharmacy_announcements (published_at desc);

-- ------------------------------------------------------------
-- 2. O recibo de leitura — uma linha por anúncio e farmácia
-- ------------------------------------------------------------
create table if not exists public.pharmacy_announcement_reads (
  announcement_id uuid not null
    references public.pharmacy_announcements(id) on delete cascade,
  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  -- `auth.uid()` por omissão: quem abre o aviso é quem está com a sessão.
  -- O INSERT ao authenticated não recebe esta coluna (grant por coluna),
  -- por isso o browser não escolhe outro autor.
  read_by         uuid default auth.uid() references auth.users(id) on delete set null,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, pharmacy_id)
);

comment on table public.pharmacy_announcement_reads is
  'Recibos de leitura dos avisos, POR FARMÁCIA (0032). O sino é da farmácia: o balcão inteiro partilha o estado. Append-only — não há UPDATE nem DELETE.';

create index if not exists pharmacy_announcement_reads_pharmacy_idx
  on public.pharmacy_announcement_reads (pharmacy_id);

-- ------------------------------------------------------------
-- 3. RLS
--    A equipa interna vê tudo (incluindo arquivados e expirados, para o
--    ecrã /interno/avisos). A farmácia vê o que lhe é dirigido e ainda
--    está vivo. Qualquer outra conta autenticada não vê nada.
-- ------------------------------------------------------------
alter table public.pharmacy_announcements enable row level security;

drop policy if exists "announcements read targeted or team" on public.pharmacy_announcements;
create policy "announcements read targeted or team"
  on public.pharmacy_announcements for select
  using (
    public.is_platform_member()
    or (
      (pharmacy_id is null or public.is_own_pharmacy(pharmacy_id))
      and archived_at is null
      and (expires_at is null or expires_at > now())
    )
  );

-- Escrita: NENHUMA policy para authenticated — service-role dentro das
-- Server Actions. A farmácia não publica avisos.

alter table public.pharmacy_announcement_reads enable row level security;

drop policy if exists "announcement reads own or team" on public.pharmacy_announcement_reads;
create policy "announcement reads own or team"
  on public.pharmacy_announcement_reads for select
  using (public.is_platform_member() or public.is_own_pharmacy(pharmacy_id));

-- O INSERT só vale para um aviso VISÍVEL para esta farmácia (o mesmo
-- filtro da policy de cima), para não se criar recibos de avisos que
-- nunca lhe foram mostrados. A subconsulta corre com os direitos de quem
-- insere e a RLS de `pharmacy_announcements` já a deixa ver esta linha.
drop policy if exists "announcement reads insert own" on public.pharmacy_announcement_reads;
create policy "announcement reads insert own"
  on public.pharmacy_announcement_reads for insert to authenticated
  with check (
    public.is_own_pharmacy(pharmacy_id)
    and exists (
      select 1
      from public.pharmacy_announcements a
      where a.id = announcement_id
        and (a.pharmacy_id is null or a.pharmacy_id = pharmacy_id)
        and a.archived_at is null
        and (a.expires_at is null or a.expires_at > now())
    )
  );

-- ------------------------------------------------------------
-- 4. Privilégios
-- ------------------------------------------------------------
revoke all on public.pharmacy_announcements from anon, authenticated, service_role;

-- A farmácia vê o conteúdo e o prazo. Não vê `published_by`, `archived_*`
-- nem `created_at` (grant por coluna, como as notas na 0028).
grant select (id, pharmacy_id, title, body, tone, published_at, expires_at)
  on public.pharmacy_announcements to authenticated;

grant select, insert, update on public.pharmacy_announcements to service_role;
revoke delete on public.pharmacy_announcements from service_role;

revoke all on public.pharmacy_announcement_reads from anon, authenticated, service_role;

grant select (announcement_id, pharmacy_id, read_at)
  on public.pharmacy_announcement_reads to authenticated;
-- Sem `read_by`/`read_at`: o default `auth.uid()`/`now()` preenche-os, e o
-- browser não escolhe o autor nem a hora.
grant insert (announcement_id, pharmacy_id)
  on public.pharmacy_announcement_reads to authenticated;

grant select, insert, update on public.pharmacy_announcement_reads to service_role;
revoke delete on public.pharmacy_announcement_reads from service_role;

-- ------------------------------------------------------------
-- 5. Verificação da própria migração
-- ------------------------------------------------------------
do $$
declare
  aberturas int;
  policies int;
begin
  -- anon e authenticated não escrevem anúncios.
  select count(*) into aberturas
  from unnest(array['anon','authenticated']) r
  where has_table_privilege(r, 'public.pharmacy_announcements', 'INSERT')
     or has_table_privilege(r, 'public.pharmacy_announcements', 'UPDATE')
     or has_table_privilege(r, 'public.pharmacy_announcements', 'DELETE');

  if aberturas > 0 then
    raise exception 'Escrita aberta a anon/authenticated em pharmacy_announcements';
  end if;

  -- A farmácia insere recibos (só as colunas públicas), mas não os altera
  -- nem apaga.
  if not has_column_privilege('authenticated', 'public.pharmacy_announcement_reads', 'announcement_id', 'INSERT') then
    raise exception 'A farmácia não consegue marcar um aviso como lido (sem INSERT)';
  end if;
  if has_table_privilege('authenticated', 'public.pharmacy_announcement_reads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.pharmacy_announcement_reads', 'DELETE') then
    raise exception 'Recibos de leitura alteráveis/apagáveis pela farmácia';
  end if;

  -- Anúncios e recibos nunca se apagam, nem pelo service_role.
  if has_table_privilege('service_role', 'public.pharmacy_announcements', 'DELETE')
     or has_table_privilege('service_role', 'public.pharmacy_announcement_reads', 'DELETE') then
    raise exception 'service_role ainda tem DELETE em avisos (0032 proíbe apagar)';
  end if;

  select count(*) into policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('pharmacy_announcements', 'pharmacy_announcement_reads');

  if policies < 3 then
    raise exception 'Faltam policies de avisos (% encontradas, esperadas 3)', policies;
  end if;
end $$;
