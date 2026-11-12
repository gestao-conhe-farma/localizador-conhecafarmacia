-- ============================================================
-- 0058 · O cliente cancela a própria reserva
--
-- Até aqui só a farmácia fechava reservas. O cliente tinha o link
-- (/reserva/[id]?t=token) mas nenhuma forma de desistir: a unidade
-- ficava presa até a farmácia recusar ou o cron das 72 h vencer.
--
-- Regra:
--   • só 'pendente' é cancelável — depois de a farmácia confirmar, a
--     unidade já foi separada e a desistência passa pelo balcão;
--   • 'cancelada' é terminal (nem o portal nem o cron lhe tocam);
--   • a libertação do stock é a da 0054: o trigger
--     trg_reservation_hold vê a reserva fechada e devolve as unidades
--     a reserved_quantity, na mesma transacção. Nada de mexer em
--     quantity, que nunca desceu ao reservar.
--   • idempotente: cancelar duas vezes devolve ok na segunda.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Novo estado terminal
-- ------------------------------------------------------------
alter table localizador.reservations
  drop constraint if exists reservations_status_check;

alter table localizador.reservations
  add constraint reservations_status_check
  check (status in (
    'pendente', 'confirmada', 'pronta', 'concluida',
    'recusada', 'expirada', 'cancelada'
  ));

comment on column localizador.reservations.status is
  'pendente → confirmada | recusada | expirada | cancelada (cliente); confirmada → pronta | recusada; pronta → concluida | recusada. cancelada/expirada/concluida são terminais.';

-- ------------------------------------------------------------
-- 2. RPC de cancelamento pelo cliente
--    security definer (a tabela não tem UPDATE público desde a 0035)
--    e o token do link é a única autorização.
--
--    O SELECT ... FOR UPDATE é o que serializa com a farmácia:
--      • se o portal já mudou o estado, esta transacção espera pelo
--        lock e, ao ler, vê o estado novo (READ COMMITTED reavalia a
--        linha) — devolve NAO_CANCELAVEL em vez de atropelar;
--      • se o cancelamento chegar primeiro, o UPDATE condicional do
--        portal (where status = estado lido) deixa de encontrar a
--        linha e o atendente vê «a reserva mudou» — não conclui uma
--        reserva já cancelada.
--    Dois cliques no botão não criam dois cancelamentos: o segundo
--    encontra 'cancelada' e responde ok (idempotente).
-- ------------------------------------------------------------
create or replace function localizador.cancel_reservation(
  p_id    uuid,
  p_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = localizador, public
as $$
declare
  v_status text;
begin
  if p_id is null or p_token is null then
    return jsonb_build_object('ok', false, 'error', 'NAO_ENCONTRADO');
  end if;

  select r.status
    into v_status
    from localizador.reservations r
   where r.id = p_id
     and r.access_token = p_token
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NAO_ENCONTRADO');
  end if;

  if v_status = 'cancelada' then
    return jsonb_build_object(
      'ok', true, 'status', 'cancelada', 'idempotent', true
    );
  end if;

  if v_status <> 'pendente' then
    return jsonb_build_object(
      'ok', false, 'error', 'NAO_CANCELAVEL', 'status', v_status
    );
  end if;

  update localizador.reservations
     set status      = 'cancelada',
         reason      = 'cancelado_cliente',
         resolved_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true, 'status', 'cancelada', 'idempotent', false
  );
end
$$;

revoke all on function localizador.cancel_reservation(uuid, uuid) from public;
grant execute on function localizador.cancel_reservation(uuid, uuid)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Verificação
-- ------------------------------------------------------------
do $$
begin
  if position('cancelada' in coalesce((
       select pg_get_constraintdef(c.oid)
         from pg_constraint c
        where c.conrelid = 'localizador.reservations'::regclass
          and c.conname = 'reservations_status_check'
     ), '')) = 0 then
    raise exception 'reservations_status_check sem cancelada';
  end if;

  if position('for update' in lower(pg_get_functiondef(
       'localizador.cancel_reservation(uuid, uuid)'::regprocedure
     ))) = 0 then
    raise exception 'cancel_reservation sem FOR UPDATE';
  end if;

  if not has_function_privilege('anon', 'localizador.cancel_reservation(uuid, uuid)', 'execute') then
    raise exception 'anon sem execute em cancel_reservation';
  end if;
end $$;

commit;

-- ------------------------------------------------------------
-- Concorrência
--   scripts/test-cancel-reservation.py — cancelar liberta a unidade,
--   repetir é idempotente, token errado não encontra, reserva já
--   concluída não é cancelável e cancelar contra concluir tem um só
--   vencedor.
-- ------------------------------------------------------------
