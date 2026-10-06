-- ============================================================
-- 0015 · Fármacos criados pela farmácia: visibilidade pendente
--
-- Problema: "Adicionar ao Catálogo" cria o fármaco com active=false
-- (moderação — o público não vê), mas a policy de SELECT
-- ("drugs public read" = active ou admin) escondia a linha até da
-- PRÓPRIA farmácia que o criou. Resultado: o fármaco não aparecia
-- na lista de stock, e a farmácia não lhe podia marcar stock.
--
-- Desenho: a farmácia vê (e só ela vê) os fármacos INACTIVOS que
-- ELA criou — pendentes de validação da equipa Conheça Farmácia.
--   • público/anon  → só active (inalterado)
--   • outras farmácias → só active (não poluem umas às outras)
--   • a criadora   → active + os seus pendentes
-- Quando a equipa valida (active=true), tudo volta ao normal e
-- created_by_pharmacy fica como trilha de auditoria.
-- ============================================================

alter table public.drugs
  add column if not exists created_by_pharmacy uuid
    references public.pharmacies(id) on delete set null;

create index if not exists drugs_created_by_pharmacy_idx
  on public.drugs (created_by_pharmacy);

-- Leitura: active (como sempre) + os pendentes DESTA farmácia.
drop policy if exists "drugs public read" on public.drugs;
create policy "drugs public read"
  on public.drugs for select
  using (
    active
    or public.is_admin()
    or public.is_own_pharmacy(created_by_pharmacy)
  );

-- Inserção: a farmácia só cria fármacos inactivos que ficam marcados
-- como seus (created_by_pharmacy obrigatório e da própria sessão).
-- Admin continua a inserir pela "drugs admin write".
drop policy if exists "pharmacy create drug" on public.drugs;
create policy "pharmacy create drug"
  on public.drugs for insert
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and au.role = 'farmacia'
    )
    and not active
    and public.is_own_pharmacy(created_by_pharmacy)
  );

-- ============================================================
-- Verificação (depois de aplicar, com sessão da farmácia):
--   select id, name, active, created_by_pharmacy
--   from drugs where created_by_pharmacy is not null;
--   -- o fármaco criado deve aparecer (active = false)
-- Com papel anon NÃO deve aparecer:
--   (client anónimo) select * from drugs where active = false;  → []
-- ============================================================
