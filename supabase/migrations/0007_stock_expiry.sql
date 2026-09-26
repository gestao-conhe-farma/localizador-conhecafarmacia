-- ============================================================
-- 0007 · Validade do stock (expires_at)
--
-- 1. `stock_items.expires_at` (date, OPCIONAL) — a validade do
--    produto que a farmácia tem em prateleira.
-- 2. A view `stock_confirmed` passa a:
--      - ESCONDER os itens já expirados — o Localizador nunca
--        encaminha um cliente para um produto fora de validade;
--      - EXPOR `expires_at`, para o público poder mostrar a
--        validade (sinal de confiança) e o portal poder avisar.
-- 3. O aviso a 90 / 60 / 30 dias é lógica de UI (lib/expiry.js):
--    aqui o que fica é o dado que o permite.
--
-- SEMÂNTICA:
--   expires_at NULL            → validade desconhecida; não filtra nada
--                                e o portal mostra "sem validade";
--   expires_at >= current_date  → ainda válido (expira HOJE ainda serve);
--   expires_at <  current_date  → expirado: sai do Localizador.
--
-- Nota: expirar NÃO muda `in_stock` nem é apanhado pelo trigger da
-- migração 0006. É a view que esconde — se a farmácia trocar o lote, o
-- produto volta sozinho a aparecer assim que a validade for corrigida.
--
-- Aplicar no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna (idempotente)
-- ------------------------------------------------------------
alter table public.stock_items
  add column if not exists expires_at date;

-- ------------------------------------------------------------
-- 2. View: expõe expires_at e esconde expirados
--    (recriada por inteiro — a definição da 0005 mantém-se, com o
--    novo campo e a nova condição)
-- ------------------------------------------------------------
drop view if exists public.stock_confirmed;

create or replace view public.stock_confirmed
with (security_invoker = true) as
select
  s.id            as stock_item_id,
  d.id            as drug_id,
  d.name          as drug_name,
  d.molecule      as drug_molecule,
  d.form          as drug_form,
  d.dosage        as drug_dosage,
  d.requires_rx   as drug_requires_rx,
  d.priority      as drug_priority,
  p.id            as pharmacy_id,
  p.slug          as pharmacy_slug,
  p.name          as pharmacy_name,
  p.municipio     as pharmacy_municipio,
  p.address       as pharmacy_address,
  p.lat           as pharmacy_lat,
  p.lng           as pharmacy_lng,
  p.phone         as pharmacy_phone,
  p.whatsapp      as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  p.verified      as pharmacy_verified,
  s.quantity,
  s.price,
  s.available_from,
  s.expires_at,
  s.confirmed_at
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)  -- esconde expirados
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
-- A coluna existe:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'stock_items'
--      and column_name = 'expires_at';
--
-- A view filtra expirados (deve devolver 0 linhas):
--   select stock_item_id, expires_at from public.stock_confirmed
--    where expires_at < current_date;
--
-- Teste de fumo (transacção descartável): marcar um item de stock com
-- validade no passado e confirmar que desaparece do Localizador:
--   begin;
--     update public.stock_items set expires_at = current_date - 1
--      where id = '<stock_item_id>';
--     select count(*) from public.stock_confirmed
--      where stock_item_id = '<stock_item_id>';   -- esperado: 0
--   rollback;
