-- ============================================================
-- 0012 · Opções de venda (fracionamento: comprimido/lâmina/caixa)
--
-- Padrão validado pela indústria (Inovafarma, Nex, Odoo — ver
-- localizador/2026-09-24-plano-opcoes-venda.md): UM ledger de estoque
-- na unidade-base + N formas de venda com pack_size e preço próprio.
--
--   • stock_items.quantity  → saldo NA UNIDADE-BASE (a da opção default)
--   • stock_sale_options    → "como a farmácia vende": unidade, pack_size
--                             (quantas unidades-base contém) e preço próprio
--   • reservations.sale_option_id → reserva de uma forma de venda; NULL =
--                             legado (comportamento 0006/0010 intacto)
--
-- Exemplo do owner: lâmina 8 comp. = 100 Kz · caixa c/ 3 lâminas = 300 Kz
--   default: (lamina, pack 1, 100) · extra: (caixa, pack 3, 300)
--   Reservar 1 caixa → baixa 3 do saldo. 2 lâminas → baixa 2.
--
-- Aplicar via SQL Editor ou scripts/apply-migration.py. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela das opções de venda
-- ------------------------------------------------------------
create table if not exists public.stock_sale_options (
  id            uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  unit          text not null check (unit in
                  ('comprimido','lamina','caixa','frasco','ampola','unidade')),
  pack_size     integer not null default 1 check (pack_size >= 1),
  price         numeric(10,2) not null check (price >= 0),
  is_default    boolean not null default false,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (stock_item_id, unit)
);

-- Exatamente UM default por item (índice único parcial).
create unique index if not exists stock_sale_options_default_idx
  on public.stock_sale_options (stock_item_id)
  where is_default;

create index if not exists stock_sale_options_item_idx
  on public.stock_sale_options (stock_item_id)
  where active;

-- O default é sempre a unidade-base: pack_size 1 (o saldo é contado nela).
drop trigger if exists trg_sale_option_default_pack on public.stock_sale_options;
create or replace function public.enforce_sale_option_default_pack()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    new.pack_size := 1;
  end if;
  return new;
end
$$;
create trigger trg_sale_option_default_pack
  before insert or update on public.stock_sale_options
  for each row
  execute function public.enforce_sale_option_default_pack();

-- ------------------------------------------------------------
-- 2. Reservas ligadas a uma opção de venda
-- ------------------------------------------------------------
alter table public.reservations
  add column if not exists sale_option_id uuid
    references public.stock_sale_options(id) on delete set null;

-- ------------------------------------------------------------
-- 3. View stock_confirmed recriada — expõe sale_options (jsonb)
--    left join lateral: itens sem opções continuam a sair (legado)
--    com sale_options = '[]'. Recriação igual à da 0009 + agregado.
-- ------------------------------------------------------------
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
  p.maps_url      as pharmacy_maps_url,
  p.phone         as pharmacy_phone,
  p.whatsapp      as pharmacy_whatsapp,
  p.opening_hours as pharmacy_opening_hours,
  p.verified      as pharmacy_verified,
  s.quantity,
  s.price,
  s.available_from,
  s.expires_at,
  s.confirmed_at,
  coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'unit', o.unit,
                'pack_size', o.pack_size,
                'price', o.price,
                'is_default', o.is_default
              ) order by o.sort_order, o.unit)
     from public.stock_sale_options o
     where o.stock_item_id = s.id and o.active),
    '[]'::jsonb
  ) as sale_options
from public.stock_items s
join public.pharmacies p on p.id = s.pharmacy_id
join public.drugs d      on d.id = s.drug_id
where s.in_stock
  and (s.available_from is null or s.available_from <= now())
  and (s.expires_at is null or s.expires_at >= current_date)
  and s.confirmed_at > now() - interval '72 hours'
  and p.active;

grant select on public.stock_confirmed to anon, authenticated;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
alter table public.stock_sale_options enable row level security;

-- Público lê opções de itens cuja farmácia está activa (o stock em si
-- já tem a sua própria policy "stock public read").
drop policy if exists "sale options public read" on public.stock_sale_options;
create policy "sale options public read"
  on public.stock_sale_options for select
  using (
    exists (
      select 1 from public.stock_items si
      join public.pharmacies p on p.id = si.pharmacy_id
      where si.id = stock_sale_options.stock_item_id and p.active
    )
  );

-- Farmácia escreve só as opções dos SEUS itens.
drop policy if exists "sale options pharmacy write" on public.stock_sale_options;
create policy "sale options pharmacy write"
  on public.stock_sale_options for all
  using (
    exists (
      select 1 from public.stock_items si
      where si.id = stock_sale_options.stock_item_id
        and public.is_own_pharmacy(si.pharmacy_id)
    )
  )
  with check (
    exists (
      select 1 from public.stock_items si
      where si.id = stock_sale_options.stock_item_id
        and public.is_own_pharmacy(si.pharmacy_id)
    )
  );

-- ------------------------------------------------------------
-- 5. Trigger do decremento (v3) — reserva por opção
--    Com sale_option_id: baixa quantidade × pack_size da opção.
--    Sem: semântica da 0010 (confirmed_quantity/quantity, em unidades
--    da unidade-base quando a farmácia usa opções — legado, senão).
-- ------------------------------------------------------------
create or replace function public.apply_reservation_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty integer;
  taken       integer;
  new_qty     integer;
begin
  -- Só a transição PARA 'concluida' (nunca baixa duas vezes).
  if new.status <> 'concluida' or old.status = 'concluida' then
    return new;
  end if;

  select s.quantity into current_qty
    from public.stock_items s
   where s.id = new.stock_item_id;

  if not found then
    return new;
  end if;

  -- Sem quantidade reportada não há o que baixar (semântica da 0006).
  if current_qty is null then
    update public.stock_items
       set confirmed_at = now(),
           updated_by   = auth.uid()
     where id = new.stock_item_id;
    return new;
  end if;

  if new.sale_option_id is not null then
    -- Reserva por opção: quantidade pedida × pack_size da opção
    -- (1 caixa com pack 3 → baixa 3 unidades-base).
    taken := greatest(
      coalesce(new.confirmed_quantity, new.quantity, 0), 0
    ) * greatest(
      (select o.pack_size from public.stock_sale_options o
        where o.id = new.sale_option_id), 1
    );
  else
    -- Legado (0010): confirmed_quantity, senão a quantidade pedida.
    taken := greatest(coalesce(new.confirmed_quantity, new.quantity, 0), 0);
  end if;

  new_qty := greatest(current_qty - taken, 0);

  update public.stock_items
     set quantity     = new_qty,
         in_stock     = case when new_qty <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id;

  return new;
end
$$;

-- ------------------------------------------------------------
-- 6. Verificação
-- ------------------------------------------------------------
--   select count(*) from information_schema.tables
--    where table_name='stock_sale_options';                        -- 1
--
--   select policyname from pg_policies where tablename='stock_sale_options';
--     → "sale options public read" | "sale options pharmacy write"
--
--   select sale_options from stock_confirmed limit 1;              -- jsonb
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.reservations'::regclass
--      and tgname = 'trg_reservation_stock_decrement';             -- mantém
