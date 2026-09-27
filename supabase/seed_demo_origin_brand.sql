-- ============================================================
-- Seed demo · Origem e marca (0013) para o stock existente
--
-- Preenche origin/brand de alguns itens de stock de demonstração
-- para o Localizador mostrar tags, pesquisa por marca funcionar
-- e o WhatsApp levar «origem Portugal» logo no primeiro teste.
--
-- Idempotente: só toca nos itens ainda sem origem.
-- ------------------------------------------------------------
-- IMPORTANTE: os itens abaixo são por pharmacy_id — ajusta o slug
-- se a tua farmácia demo for outra (por omissão: farmacia-cf-central).
-- ------------------------------------------------------------

-- Paracetamol → Ben-u-ron, Portugal
update public.stock_items s
set origin = 'Portugal', brand = 'Ben-u-ron'
from public.pharmacies p, public.drugs d
where p.id = s.pharmacy_id
  and d.id = s.drug_id
  and p.slug = 'farmacia-cf-central'
  and d.name ilike 'Paracetamol%'
  and s.origin is null;

-- Ibuprofeno → Brufen, Índia
update public.stock_items s
set origin = 'Índia', brand = 'Brufen'
from public.pharmacies p, public.drugs d
where p.id = s.pharmacy_id
  and d.id = s.drug_id
  and p.slug = 'farmacia-cf-central'
  and d.name ilike 'Ibuprofeno%'
  and s.origin is null;

-- Amoxicilina → Amoxil, Índia
update public.stock_items s
set origin = 'Índia', brand = 'Amoxil'
from public.pharmacies p, public.drugs d
where p.id = s.pharmacy_id
  and d.id = s.drug_id
  and p.slug = 'farmacia-cf-central'
  and d.name ilike 'Amoxicilina%'
  and s.origin is null;

-- Insulina → Lantus, França
update public.stock_items s
set origin = 'França', brand = 'Lantus'
from public.pharmacies p, public.drugs d
where p.id = s.pharmacy_id
  and d.id = s.drug_id
  and p.slug = 'farmacia-cf-central'
  and d.name ilike 'Insulina%'
  and s.origin is null;

-- ------------------------------------------------------------
-- Verificação:
--   select d.name, s.brand, s.origin
--   from stock_items s join drugs d on d.id = s.drug_id
--   where s.brand is not null;
-- ------------------------------------------------------------
