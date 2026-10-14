-- ============================================================
-- 0021 · Lotes / camadas de stock + baixa FEFO
--
-- Até aqui a validade era UM campo do item (`stock_items.expires_at`):
-- não se sabia que a farmácia tinha 3 caixas de um lote que expira em
-- Março e 2 de outro que expira em Junho — e ao vender saía sempre do
-- monte indiferenciado (plano 2026-10-12, ponto 4 dos em falta).
--
-- Desenho (padrão Odoo lots / SAP batch / OpenBoxes — validado na
-- pesquisa de 2026-10-13):
--   • `stock_lots` é uma CAMADA de stock: (item, nº de lote, validade)
--     → quantidade em unidades-base. Cada entrada cria/engorda uma
--     camada; uma saída consome primeiro o que expira mais cedo
--     (FEFO — first-expired, first-out), repartindo entre camadas se
--     for preciso.
--   • O saldo do item (`stock_items.quantity`) continua a ser o total
--     (soma das camadas) — o Localizador e todo o portal não mudam de
--     forma. Quem escreve é o MESMO `post_stock_change` (0020).
--   • Sem nº de lote disponível não se inventa: a camada fica com
--     `lot_number = null` («por identificar») e, se tiver validade,
--     continua a participar no FEFO pela validade. É explícito em vez
--     de misturar stock identificado com stock anónimo.
--   • `stock_items.expires_at` passa a ser a validade de REFERÊNCIA:
--     sincronizada com a camada que expira mais cedo (quando alguma
--     tem validade). Sem validade em camada nenhuma, o valor manual
--     do portal mantém-se (não se apaga o que a farmácia escreveu).
--
-- Substitui `public.stock_lot_apply` (o stub da 0020) pela versão real.
-- O trigger da reserva concluída (0020) já a chama — logo a venda passa
-- a baixar por FEFO sem mais nenhuma alteração no portal.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0021_stock_lots_fefo.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela das camadas
-- ------------------------------------------------------------
create table if not exists public.stock_lots (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_id   uuid not null references public.pharmacies(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  drug_id       uuid not null references public.drugs(id) on delete cascade,

  -- Nº de lote do fabricante (GS1 AI 10). Null = por identificar.
  lot_number    text check (lot_number is null or char_length(lot_number) between 1 and 40),
  -- Validade do lote. Null = validade desconhecida (não filtra nada).
  expires_at    date,

  -- Quantidade em unidades-base (a mesma unidade do saldo do item).
  quantity      integer not null default 0 check (quantity >= 0),

  received_at   timestamptz not null default now(),
  source        text not null default 'portal'
                check (source in ('portal','csv','api','team','sistema')),
  source_ref    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.stock_lots is
  'Camadas de stock (item + nº de lote + validade → quantidade). A baixa é FEFO: sai primeiro o que expira mais cedo.';

-- Camadas com stock de um item (leitura do portal e cálculo do FEFO).
create index if not exists stock_lots_item_idx
  on public.stock_lots (stock_item_id)
  where quantity > 0;

-- Mapa de validades por farmácia (relatório de validade próxima e FEFO).
create index if not exists stock_lots_expiry_idx
  on public.stock_lots (pharmacy_id, expires_at)
  where quantity > 0;

-- ------------------------------------------------------------
-- 2. RLS — leitura pela própria farmácia (e equipa CF). Sem escrita
--    directa: as camadas mexem-se pelas funções SECURITY DEFINER.
-- ------------------------------------------------------------
alter table public.stock_lots enable row level security;

drop policy if exists "lots pharmacy read" on public.stock_lots;
create policy "lots pharmacy read"
  on public.stock_lots for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.stock_lots from anon, authenticated;
grant select on public.stock_lots to authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Validade de referência do item = a da camada mais próxima
-- ------------------------------------------------------------
create or replace function public.stock_lot_sync_expiry(p_stock_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min date;
begin
  select min(l.expires_at) into v_min
    from public.stock_lots l
   where l.stock_item_id = p_stock_item_id
     and l.quantity > 0
     and l.expires_at is not null;

  -- Só escreve quando alguma camada sabe a validade: sem isso, um item
  -- com validade escrita à mão não a perde por receber stock sem lote.
  if v_min is not null then
    update public.stock_items
       set expires_at = v_min
     where id = p_stock_item_id
       and expires_at is distinct from v_min;
  end if;
end;
$$;

revoke execute on function public.stock_lot_sync_expiry(uuid) from public;

-- ------------------------------------------------------------
-- 4. Motor FEFO — substitui o stub da 0020
--    Entrada (delta > 0): engorda a camada do mesmo (lote, validade)
--    ou cria uma nova. Saída (delta < 0): consome por ordem de
--    validade (sem validade fica para o fim), depois por antiguidade.
-- ------------------------------------------------------------
create or replace function public.stock_lot_apply(
  p_stock_item_id uuid,
  p_delta         integer,
  p_lot_number    text default null,
  p_expires_at    date default null,
  p_source        text default 'portal',
  p_source_ref    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy uuid;
  v_drug     uuid;
  v_lot_id   uuid;
  v_number   text;
  v_rest     integer;
  v_take     integer;
  r          record;
begin
  if coalesce(p_delta, 0) = 0 then
    return null;
  end if;

  select s.pharmacy_id, s.drug_id into v_pharmacy, v_drug
    from public.stock_items s
   where s.id = p_stock_item_id;
  if not found then
    return null;
  end if;

  -- Normaliza o nº de lote: '' e espaços contam como «por identificar».
  v_number := nullif(trim(coalesce(p_lot_number, '')), '');

  if p_delta > 0 then
    v_rest := p_delta;

    -- Camada existente com o mesmo lote e a mesma validade (is not
    -- distinct from: null combina com null — a camada «sem lote»).
    select l.id into v_lot_id
      from public.stock_lots l
     where l.stock_item_id = p_stock_item_id
       and l.lot_number is not distinct from v_number
       and l.expires_at is not distinct from p_expires_at
     order by l.created_at
     limit 1;

    if v_lot_id is null then
      insert into public.stock_lots (
        pharmacy_id, stock_item_id, drug_id, lot_number, expires_at,
        quantity, source, source_ref
      )
      values (
        v_pharmacy, p_stock_item_id, v_drug, v_number, p_expires_at,
        0, coalesce(p_source, 'portal'), p_source_ref
      )
      returning id into v_lot_id;
    end if;

    -- received_at só se renova quando a camada estava vazia (a entrada
    -- nova é uma recepção nova; somar a uma camada com stock mantém a
    -- data da primeira recepção).
    update public.stock_lots
       set quantity    = quantity + v_rest,
           received_at = case when quantity = 0 then now() else received_at end,
           source      = coalesce(p_source, source),
           source_ref  = coalesce(p_source_ref, source_ref),
           updated_at  = now()
     where id = v_lot_id;
  else
    v_rest := -p_delta;

    -- FEFO: validade mais próxima primeiro; lotes sem validade (nulls
    -- last) e, entre iguais, os mais antigos.
    for r in
      select l.id, l.quantity
        from public.stock_lots l
       where l.stock_item_id = p_stock_item_id
         and l.quantity > 0
       order by l.expires_at asc nulls last, l.created_at asc
    loop
      exit when v_rest <= 0;
      v_take := least(v_rest, r.quantity);
      update public.stock_lots
         set quantity   = quantity - v_take,
             updated_at = now()
       where id = r.id;
      v_rest := v_rest - v_take;
    end loop;

    -- Uma saída pode atravessar várias camadas: o movimento fica sem
    -- lote único (o rasto por camada vive nas quantidades).
    v_lot_id := null;
  end if;

  perform public.stock_lot_sync_expiry(p_stock_item_id);
  return v_lot_id;
end;
$$;

revoke execute on function public.stock_lot_apply(uuid, integer, text, date, text, text) from public;
grant execute on function public.stock_lot_apply(uuid, integer, text, date, text, text)
  to service_role;

-- ------------------------------------------------------------
-- 5. Corte: o saldo que já existe passa a ser uma camada
--    (lote por identificar + validade de referência do item). Assim
--    o FEFO funciona desde a primeira venda e a soma das camadas
--    fecha com o saldo do item. Só corre uma vez.
-- ------------------------------------------------------------
insert into public.stock_lots (
  pharmacy_id, stock_item_id, drug_id, lot_number, expires_at,
  quantity, source, source_ref, received_at
)
select
  s.pharmacy_id, s.id, s.drug_id, null, s.expires_at,
  s.quantity, coalesce(s.source, 'portal'), s.source_ref, coalesce(s.created_at, now())
from public.stock_items s
where s.quantity is not null
  and s.quantity > 0
  and not exists (
    select 1 from public.stock_lots l where l.stock_item_id = s.id
  );

-- ============================================================
-- Verificação (depois de aplicar):
--   -- 1. Camadas criadas e a fechar com o saldo
--   select count(*) from public.stock_lots;                       -- ≥ itens com saldo
--   select count(*) from (
--     select s.id from public.stock_items s
--      join public.stock_lots l on l.stock_item_id = s.id
--     group by s.id, s.quantity having sum(l.quantity) <> coalesce(s.quantity,0)
--   ) x;                                                          -- 0 divergências
--
--   -- 2. FEFO: com 2 camadas (Março=3, Junho=5) a baixa de 4 tem de
--   --    deixar Março a 0 e Junho a 4. Teste descartável:
--   begin;
--     select public.stock_lot_apply('<stock_item_id>', 3, 'L-MAR', '2027-03-31');
--     select public.stock_lot_apply('<stock_item_id>', 5, 'L-JUN', '2027-06-30');
--     select public.stock_lot_apply('<stock_item_id>', -4, null, null);
--     select lot_number, quantity from public.stock_lots
--      where stock_item_id = '<stock_item_id>' order by expires_at;
--   rollback;
-- ============================================================
