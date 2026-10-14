-- ============================================================
-- 0020 · Histórico de movimentos de stock (ledger append-only)
--
-- Até aqui o stock era um estado sem memória: `stock_items.quantity`
-- era o saldo e nada dizia COMO ele chegou ali. Sem histórico não há
-- auditoria, não há «quem mexeu no saldo?», nem relatório credível
-- para mostrar à farmácia (plano 2026-10-12, ponto 1 dos em falta).
--
-- Desenho (padrão de ERP — SAP material documents, Odoo stock moves,
-- ERPNext stock ledger):
--   • `stock_movements` é um LIVRO-RAZÃO: só se acrescenta, nunca se
--     edita nem se apaga. Correções fazem-se com um movimento novo.
--   • `stock_items.quantity` continua a ser o SALDO (projecção do
--     razão) — a view pública e todo o portal não mudam de forma.
--   • Cada movimento tem tipo, delta em unidades-base, saldo antes e
--     depois, motivo, autor (perfil de farmacêutico), origem do dado
--     (`source`) e uma chave de idempotência para sincronizações.
--
-- Quem escreve:
--   • `public.post_stock_change(...)` — porta ÚNICA para as acções do
--     portal, importação CSV e ingestão por API: calcula o delta,
--     aplica ao saldo e regista o movimento na MESMA transacção.
--   • `trg_reservation_log` — rasto das reservas (criada/confirmada/
--     recusada), sem mexer no saldo.
--   • `apply_reservation_stock_change` (0012) — passa a registar a
--     baixa da venda concluída.
--
-- Origem/sincronização (pontos 2 dos em falta): `stock_items` ganha
-- `source` ('portal' | 'csv' | 'api' | 'team'), `synced_at` (quando um
-- sistema externo confirmou) e `source_ref` (id externo/ficha de
-- importação). A frescura mostrada ao cliente é tratada na 0022.
--
-- Autorização: o ledger não tem INSERT/UPDATE/DELETE para anon nem
-- authenticated. A escrita passa pelas funções SECURITY DEFINER, que
-- verificam o papel do JWT (`public.request_role()`), ou pelo
-- service-role nas rotas de servidor.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0020_stock_movements.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Origem e sincronização no saldo
-- ------------------------------------------------------------
alter table public.stock_items
  add column if not exists source      text not null default 'portal',
  add column if not exists synced_at   timestamptz,
  add column if not exists source_ref  text;

do $$
begin
  alter table public.stock_items
    add constraint stock_items_source_check
    check (source in ('portal','csv','api','team'));
exception when duplicate_object then null;
end $$;

comment on column public.stock_items.source is
  'Como o saldo foi escrito pela última vez: portal (mão), csv (importação), api (sincronização), team (equipa CF).';
comment on column public.stock_items.synced_at is
  'Quando a origem externa (csv/api) confirmou este saldo. Null = escrito à mão no portal.';
comment on column public.stock_items.source_ref is
  'Referência da origem: id da importação, id externo do ERP, etc.';

-- ------------------------------------------------------------
-- 2. Papel do pedido (JWT) — usado pela autorização das funções.
--    Espelha auth.role(): as funções SECURITY DEFINER não podem usar
--    current_user (é o dono da função), então leem as claims do PostgREST.
-- ------------------------------------------------------------
create or replace function public.request_role()
returns text
language plpgsql
stable
as $$
declare
  v  text;
  vj jsonb;
begin
  v := nullif(current_setting('request.jwt.claim.role', true), '');
  if v is not null then
    return v;
  end if;
  vj := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if vj is not null then
    return coalesce(vj ->> 'role', 'anon');
  end if;
  return 'anon';
exception when others then
  return 'anon';
end;
$$;

grant execute on function public.request_role() to public;

comment on function public.request_role() is
  'Papel do JWT do pedido (anon | authenticated | service_role), legível dentro de funções SECURITY DEFINER.';

-- ------------------------------------------------------------
-- 3. O livro-razão
-- ------------------------------------------------------------
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),

  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  -- Ruptura intencional (on delete set null): o histórico tem de
  -- sobreviver ao desaparecimento da linha de stock/fármaco.
  stock_item_id   uuid references public.stock_items(id) on delete set null,
  drug_id         uuid references public.drugs(id) on delete set null,
  drug_label      text,   -- nome do medicamento À DATA (o catálogo muda)
  lot_id          uuid,   -- lote/camada (FK criada na 0021)

  movement_type   text not null check (movement_type in (
                    'entrada',        -- recepção/reposição (aumenta)
                    'venda',          -- baixa automática de reserva concluída
                    'ajuste',         -- correcção manual de saldo (contagem)
                    'saida',          -- quebra/perda/doação (motivo obrigatório)
                    'expiracao',      -- baixa por validade
                    'devolucao',      -- devolução ao fornecedor
                    'importacao',     -- saldo reposto por CSV/sincronização
                    'saldo_inicial',  -- corte de histórico (arranque do razão)
                    'reserva',        -- evento de reserva (não mexe no saldo)
                    'retirada',       -- retirar do catálogo (lixeira)
                    'restauro'        -- restaurar da lixeira
                  )),

  -- Delta em unidades-base (mesma unidade do saldo). 0 nos eventos
  -- que não mexem no saldo (reserva/retirada/restauro).
  quantity_delta  integer not null default 0,
  quantity_before integer,
  quantity_after  integer,

  reason          text,   -- motivo (para 'saida' é obrigatório na app)
  note            text,   -- texto livre curto do atendente

  -- Origem do dado: de onde veio este movimento.
  source          text not null default 'portal'
                  check (source in ('portal','csv','api','team','sistema')),

  -- Idempotência das sincronizações: o mesmo evento repetido
  -- (timeout, retry, ficheiro reenviado) não conta duas vezes.
  idempotency_key text,
  source_ref      text,   -- id externo / id da importação / id da reserva

  actor_staff_id  uuid references public.pharmacy_staff(id) on delete set null,
  actor_user_id   uuid,   -- utilizador auth (equipa CF) que escreveu
  actor_label     text,   -- nome do autor ou da chave de API, à data

  metadata        jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.stock_movements is
  'Livro-razão de stock, só de acrescento. Correções = movimentos novos (nunca update/delete).';
comment on column public.stock_movements.quantity_delta is
  'Unidades-base (positivo entra, negativo sai). Somado ao saldo dá o saldo seguinte.';

create index if not exists stock_movements_pharmacy_time_idx
  on public.stock_movements (pharmacy_id, created_at desc);

create index if not exists stock_movements_item_time_idx
  on public.stock_movements (stock_item_id, created_at desc);

create index if not exists stock_movements_drug_time_idx
  on public.stock_movements (pharmacy_id, drug_id, created_at desc);

-- Uma chave de idempotência, uma vez por farmácia.
create unique index if not exists stock_movements_idem_idx
  on public.stock_movements (pharmacy_id, idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------------------
-- 4. Append-only a sério: nada de UPDATE nem DELETE — nem para o
--    service role (que de outro modo podia «limpar» o histórico).
--    NOTA: apagar uma farmácia exige apagar o histórico primeiro; é
--    uma decisão consciente (o cascade falha com o trigger).
-- ------------------------------------------------------------
create or replace function public.stock_movements_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements é imutável (append-only): registe um movimento novo em vez de % ', tg_op
    using errcode = 'P0001',
          hint = 'Para corrigir um saldo use post_stock_change() com um tipo de correcção.';
end;
$$;

drop trigger if exists trg_stock_movements_append_only on public.stock_movements;
create trigger trg_stock_movements_append_only
  before update or delete on public.stock_movements
  for each row
  execute function public.stock_movements_append_only();

-- ------------------------------------------------------------
-- 5. RLS — a farmácia lê o seu histórico; a equipa CF lê tudo.
--    Sem policies de escrita: só funções SECURITY DEFINER escrevem.
-- ------------------------------------------------------------
alter table public.stock_movements enable row level security;

drop policy if exists "movements pharmacy read" on public.stock_movements;
create policy "movements pharmacy read"
  on public.stock_movements for select
  using (public.is_admin() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Escrita: log_stock_movement (evento) e post_stock_change (saldo)
-- ------------------------------------------------------------

-- 6a. Registo de um movimento JÁ calculado (usado pelo trigger das
--     reservas e internamente pelo post_stock_change). Devolve o id;
--     com chave de idempotência repetida devolve o movimento original.
create or replace function public.log_stock_movement(
  p_pharmacy_id   uuid,
  p_drug_id       uuid,
  p_stock_item_id uuid,
  p_type          text,
  p_delta         integer,
  p_before        integer,
  p_after         integer,
  p_source        text default 'portal',
  p_reason        text default null,
  p_note          text default null,
  p_source_ref    text default null,
  p_idem          text default null,
  p_staff_id      uuid default null,
  p_actor_user_id uuid default null,
  p_actor_label   text default null,
  p_lot_id        uuid default null,
  p_meta          jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_staff uuid;
  v_label text;
begin
  if p_idem is not null then
    select m.id into v_id
      from public.stock_movements m
     where m.pharmacy_id = p_pharmacy_id
       and m.idempotency_key = p_idem;
    if found then
      return v_id;
    end if;
  end if;

  -- O autor tem de pertencer à farmácia (um id forjado não entra).
  if p_staff_id is not null then
    select s.id, s.name into v_staff, v_label
      from public.pharmacy_staff s
     where s.id = p_staff_id and s.pharmacy_id = p_pharmacy_id;
  end if;

  insert into public.stock_movements (
    pharmacy_id, stock_item_id, drug_id, drug_label, lot_id,
    movement_type, quantity_delta, quantity_before, quantity_after,
    reason, note, source, source_ref, idempotency_key,
    actor_staff_id, actor_user_id, actor_label, metadata
  )
  values (
    p_pharmacy_id, p_stock_item_id, p_drug_id,
    (select d.name from public.drugs d where d.id = p_drug_id),
    p_lot_id,
    p_type, coalesce(p_delta, 0), p_before, p_after,
    p_reason, p_note, coalesce(p_source, 'portal'), p_source_ref, p_idem,
    v_staff, p_actor_user_id,
    coalesce(p_actor_label, v_label),
    p_meta
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_stock_movement(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text, text, text, uuid, uuid, text, uuid, jsonb
) from public;

-- 6a-bis. Distribuição do delta pelos lotes (FEFO).
--   Na 0020 é um no-op: os lotes só existem a partir da 0021, que
--   substitui esta função (mesma assinatura) pela versão real.
--   Contrato: devolve o id do lote afectado quando o delta entra num
--   único lote (entradas); null quando a saída se reparte por vários.
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
begin
  return null;
end;
$$;

revoke execute on function public.stock_lot_apply(uuid, integer, text, date, text, text) from public;

-- 6b. Porta única de escrita do saldo (portal, importação e API).
--     Devolve jsonb: {ok, quantity, before, after, movement_id, duplicate}
--     ou {ok:false, error} quando a validação/autorização falha.
create or replace function public.post_stock_change(
  p_pharmacy_id   uuid,
  p_drug_id       uuid,
  p_type          text,
  p_delta         integer default null,
  p_set_quantity  integer default null,
  p_in_stock      boolean default null,
  p_source        text default 'portal',
  p_reason        text default null,
  p_note          text default null,
  p_source_ref    text default null,
  p_idem          text default null,
  p_staff_id      uuid default null,
  p_lot_number    text default null,   -- lote que entrou (opcional)
  p_expires_at    date default null,   -- validade do lote que entrou (opcional)
  p_actor_label   text default null    -- autor textual (ex.: nome da chave de API)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id  uuid;
  v_before   integer;
  v_after    integer;
  v_delta    integer;
  v_in_stock boolean;
  v_id       uuid;
  v_dup      boolean := false;
  v_role     text := public.request_role();
  v_qty      integer;
  v_lot_id   uuid;
begin
  -- Autorização: service_role (rotas de servidor validadas) ou a própria
  -- farmácia / equipa CF. Um anon nunca chega aqui (sem execute grant).
  if v_role <> 'service_role' then
    if not (public.is_admin() or public.is_own_pharmacy(p_pharmacy_id)) then
      return jsonb_build_object('ok', false, 'error', 'SEM_PERMISSAO');
    end if;
  end if;

  if p_type not in ('entrada','venda','ajuste','saida','expiracao','devolucao',
                    'importacao','saldo_inicial','reserva','retirada','restauro') then
    return jsonb_build_object('ok', false, 'error', 'TIPO_INVALIDO');
  end if;
  if coalesce(p_set_quantity, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'QUANTIDADE_INVALIDA');
  end if;
  if p_set_quantity is null and p_delta is null then
    return jsonb_build_object('ok', false, 'error', 'SEM_DELTA');
  end if;
  if p_type = 'saida' and coalesce(p_reason, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'MOTIVO_OBRIGATORIO');
  end if;

  -- Idempotência: o mesmo evento não conta duas vezes.
  if p_idem is not null then
    select m.id into v_id
      from public.stock_movements m
     where m.pharmacy_id = p_pharmacy_id and m.idempotency_key = p_idem;
    if found then
      select s.quantity into v_qty from public.stock_items s where s.id = (
        select m.stock_item_id from public.stock_movements m where m.id = v_id
      );
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'movement_id', v_id,
        'quantity', coalesce(v_qty, 0), 'before', null, 'after', coalesce(v_qty, 0), 'delta', 0
      );
    end if;
  end if;

  -- A linha de stock pode não existir (produto nunca reportado).
  select s.id, s.quantity, s.in_stock into v_item_id, v_before, v_in_stock
    from public.stock_items s
   where s.pharmacy_id = p_pharmacy_id and s.drug_id = p_drug_id;
  if not found then
    insert into public.stock_items (pharmacy_id, drug_id)
      values (p_pharmacy_id, p_drug_id)
      returning id, quantity, in_stock into v_item_id, v_before, v_in_stock;
  end if;

  v_before := coalesce(v_before, 0);

  if p_set_quantity is not null then
    v_after := p_set_quantity;
    v_delta := v_after - v_before;
  else
    v_after := greatest(v_before + p_delta, 0);
    v_delta := v_after - v_before;
  end if;

  -- Estado temos/não temos: explícito quando o chamador o traz; senão
  -- uma entrada liga e um saldo a zero desliga (semântica actual do
  -- portal, 0006/0012).
  v_in_stock := coalesce(
    p_in_stock,
    case when v_delta > 0 then true
         when v_after = 0 then false
         else coalesce(v_in_stock, v_after > 0) end
  );

  -- Lotes/camadas (0021): o delta entra no lote indicado (entradas) ou sai
  -- dos lotes que expiram primeiro (saídas, FEFO).
  v_lot_id := public.stock_lot_apply(
    v_item_id, v_delta, p_lot_number, p_expires_at, p_source, p_source_ref
  );

  update public.stock_items
     set quantity     = v_after,
         in_stock     = v_in_stock,
         confirmed_at = now(),
         source       = coalesce(p_source, 'portal'),
         synced_at    = case when p_source in ('api','csv') then now() else synced_at end,
         source_ref   = coalesce(p_source_ref, source_ref),
         updated_by   = coalesce(auth.uid(), updated_by)
   where id = v_item_id;

  v_id := public.log_stock_movement(
    p_pharmacy_id, p_drug_id, v_item_id, p_type, v_delta, v_before, v_after,
    p_source, p_reason, p_note, p_source_ref, p_idem, p_staff_id, auth.uid(),
    p_actor_label, v_lot_id, null
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', v_dup, 'movement_id', v_id,
    'quantity', v_after, 'before', v_before, 'after', v_after, 'delta', v_delta
  );
end;
$$;

revoke execute on function public.post_stock_change(
  uuid, uuid, text, integer, integer, boolean, text, text, text, text, text, uuid, text, date, text
) from public;
grant execute on function public.post_stock_change(
  uuid, uuid, text, integer, integer, boolean, text, text, text, text, text, uuid, text, date, text
) to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Rasto das reservas — eventos que não mexem no saldo
--    ('concluida' fica registada no movimento 'venda' com o delta,
--    escrito pelo trigger apply_reservation_stock_change).
-- ------------------------------------------------------------
create or replace function public.log_reservation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_stock_movement(
      new.pharmacy_id, new.drug_id, new.stock_item_id, 'reserva', 0, null, null,
      'portal', 'reserva criada', null, new.id::text, null, null, null, null, null,
      jsonb_build_object('estado', new.status, 'unidades', new.quantity)
    );
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('confirmada','pronta','recusada') then
    perform public.log_stock_movement(
      new.pharmacy_id, new.drug_id, new.stock_item_id, 'reserva', 0, null, null,
      'portal', 'reserva ' || new.status, new.reason, new.id::text, null,
      new.handled_by, null, null, null,
      jsonb_build_object('estado', new.status, 'unidades', coalesce(new.confirmed_quantity, new.quantity))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservation_log on public.reservations;
create trigger trg_reservation_log
  after insert or update on public.reservations
  for each row
  execute function public.log_reservation_event();

-- ------------------------------------------------------------
-- 8. A baixa da venda passa a registar movimento (mesma versão da
--    0012, só com o registo acrescentado).
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
    taken := greatest(
      coalesce(new.confirmed_quantity, new.quantity, 0), 0
    ) * greatest(
      (select o.pack_size from public.stock_sale_options o
        where o.id = new.sale_option_id), 1
    );
  else
    taken := greatest(coalesce(new.confirmed_quantity, new.quantity, 0), 0);
  end if;

  new_qty := greatest(current_qty - taken, 0);

  -- Lotes (0021): a baixa sai primeiro dos lotes que expiram mais cedo.
  perform public.stock_lot_apply(
    new.stock_item_id, -(current_qty - new_qty), null, null, 'portal', new.id::text
  );

  update public.stock_items
     set quantity     = new_qty,
         in_stock     = case when new_qty <= 0 then false else in_stock end,
         confirmed_at = now(),
         updated_by   = auth.uid()
   where id = new.stock_item_id;

  perform public.log_stock_movement(
    new.pharmacy_id, new.drug_id, new.stock_item_id, 'venda',
    -(current_qty - new_qty), current_qty, new_qty,
    'portal', 'reserva concluída', new.notes, new.id::text, null,
    new.handled_by, auth.uid(), null, null,
    jsonb_build_object(
      'unidades_vendidas', current_qty - new_qty,
      'sale_option_id', new.sale_option_id
    )
  );

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 9. Corte de histórico: um movimento 'saldo_inicial' por linha de
--    stock com quantidade conhecida, para a soma dos deltas fechar
--    com o saldo actual. Só corre uma vez (tabela vazia).
--    NOTA: stock_entries (0018) fica como log de reposições; as
--    entradas anteriores a este corte já estão dentro do saldo e não
--    são replicadas (evita contar duas vezes).
-- ------------------------------------------------------------
insert into public.stock_movements (
  pharmacy_id, stock_item_id, drug_id, drug_label,
  movement_type, quantity_delta, quantity_before, quantity_after,
  reason, source, note
)
select
  s.pharmacy_id, s.id, s.drug_id, d.name,
  'saldo_inicial', s.quantity, 0, s.quantity,
  'corte inicial do histórico', 'sistema',
  'Saldo registado no arranque do livro-razão (2026-10-13).'
from public.stock_items s
join public.drugs d on d.id = s.drug_id
where s.quantity is not null
  and not exists (select 1 from public.stock_movements limit 1);

-- ============================================================
-- Verificação (depois de aplicar):
--   select count(*) from public.stock_movements;                  -- ≥ nº de itens
--   select movement_type, count(*) from public.stock_movements group by 1;
--   select s.quantity, sum(m.quantity_delta) as soma
--     from public.stock_items s join public.stock_movements m on m.stock_item_id = s.id
--    where m.movement_type <> 'reserva' group by 1, s.id limit 5;  -- soma == quantity
--
--   -- append-only (esperado: erro)
--   update public.stock_movements set note = 'x' where true;
-- ============================================================
