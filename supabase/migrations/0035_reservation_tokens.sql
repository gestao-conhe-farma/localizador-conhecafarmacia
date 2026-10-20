-- ============================================================
-- 0035 · Reservas: fecha leitura/escrita pública, token por reserva
--
-- Corrige CRÍTICO 1 + CRÍTICO 2:
--   1. A policy "reservations public read by id" (0011) era
--      `USING (true)` — qualquer pessoa com a anon key lia TODAS as
--      reservas (nome + telefone dos clientes). Removida.
--   2. A policy "reservations public insert" (0001, WITH CHECK true)
--      permitia INSERT directo no PostgREST, contornando a validação
--      do Server Action (stock_confirmed, opção de venda, rate-limit).
--      Removida — a criação passa a correr no servidor com
--      service-role (lib/actions/reservations.js).
--
-- Novo modelo:
--   • reservations.access_token (uuid, único, não-adivinhável) — o
--     segredo do link de acompanhamento. Gerado pelo Postgres no
--     INSERT (default gen_random_uuid()); o Server Action devolve-o
--     uma vez e o URL passa a /reserva/[id]?t=[token].
--   • Leitura pública da tabela: NENHUMA. Resta só a policy da
--     farmácia/equipa (is_admin / is_own_pharmacy).
--   • Acompanhamento do cliente: RPC security definer
--     get_reservation_status(p_id, p_token) — só devolve a reserva
--     quando o token bate certo, e NUNCA devolve requester_phone.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna do token (idempotente + backfill)
-- ------------------------------------------------------------
alter table public.reservations
  add column if not exists access_token uuid not null default gen_random_uuid();

-- Linhas anteriores a esta migração já ficam preenchidas pelo default
-- acima; esta correcção cobre o caso de a coluna já existir sem default.
update public.reservations
   set access_token = gen_random_uuid()
 where access_token is null;

alter table public.reservations
  alter column access_token set default gen_random_uuid();

alter table public.reservations
  alter column access_token set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_access_token_unique'
  ) then
    alter table public.reservations
      add constraint reservations_access_token_unique unique (access_token);
  end if;
end $$;

create index if not exists reservations_access_token_idx
  on public.reservations (access_token);

-- ------------------------------------------------------------
-- 2. Fechar as portas públicas
-- ------------------------------------------------------------
drop policy if exists "reservations public insert" on public.reservations;
drop policy if exists "reservations public read by id" on public.reservations;

-- ------------------------------------------------------------
-- 3. RPC de acompanhamento (o único acesso anónimo às reservas)
-- ------------------------------------------------------------
create or replace function public.get_reservation_status(p_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_id is null or p_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', r.id,
    'status', r.status,
    'quantity', r.quantity,
    'confirmed_quantity', r.confirmed_quantity,
    'reason', r.reason,
    'notes', r.notes,
    'created_at', r.created_at,
    'resolved_at', r.resolved_at,
    'requester_name', r.requester_name,
    'sale_option_id', r.sale_option_id,
    'drug', jsonb_build_object(
      'name', d.name,
      'form', d.form,
      'dosage', d.dosage
    ),
    'pharmacy', jsonb_build_object(
      'name', p.name,
      'phone', p.phone,
      'whatsapp', p.whatsapp,
      'address', p.address,
      'municipio', p.municipio
    ),
    'sale_option', case
      when o.id is null then null
      else jsonb_build_object(
        'unit', o.unit,
        'pack_size', o.pack_size,
        'price', o.price
      )
    end,
    'stock_item', jsonb_build_object(
      'origin', s.origin,
      'brand', s.brand,
      'image_path', s.image_path,
      'pack_laminas', s.pack_laminas,
      'pack_comprimidos', s.pack_comprimidos
    )
  )
  into result
  from public.reservations r
  join public.drugs d on d.id = r.drug_id
  join public.pharmacies p on p.id = r.pharmacy_id
  left join public.stock_sale_options o on o.id = r.sale_option_id
  left join public.stock_items s on s.id = r.stock_item_id
  where r.id = p_id
    and r.access_token = p_token;

  return result;
end
$$;

revoke all on function public.get_reservation_status(uuid, uuid) from public;
grant execute on function public.get_reservation_status(uuid, uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Verificação
-- ------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'reservations';
--   → esperado: só "reservations pharmacy read" + "reservations pharmacy update".
-- select column_name, column_default from information_schema.columns
--  where table_name = 'reservations' and column_name = 'access_token';
-- select has_function_privilege('anon', 'public.get_reservation_status(uuid, uuid)', 'execute');
