#!/usr/bin/env python
"""Teste do cancelamento da reserva pelo cliente (0058).

Cobre:
  • cancelar uma reserva pendente devolve a unidade ao stock
    (reserved_quantity volta a 0);
  • cancelar outra vez é idempotente (ok, sem segundo efeito);
  • token errado não encontra a reserva e não mexe em nada;
  • reserva concluída pela farmácia não é cancelável;
  • dois cancelamentos simultâneos: um efectivo e um replay;
  • cancelar contra concluir (UPDATE condicional, como o portal):
    um só vencedor, nunca stock negativo nem baixa dupla;
  • confirmada/pronta cancelável até à hora marcada (0059);
  • pronta com a hora já passada → NAO_CANCELAVEL (causa
    fora_do_prazo), unidade continua presa.

Cria farmácia/fármaco/item próprios e apaga-os no fim.

Uso: python scripts/test-cancel-reservation.py
Saída: 0 = correcto; 1 = falhou.
"""
import json
import re
import sys
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-cancel-0058-'
PHARMACIES = f"select id from localizador.pharmacies where slug like '{SLUG_PREFIX}%'"


def load_creds():
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    token = re.search(r'Access Token[^\n]*\n\s*(sbp_[A-Za-z0-9]+)', txt) or re.search(
        r'(sbp_[A-Za-z0-9]{20,})', txt
    )
    url = re.search(
        r'NEXT_PUBLIC_SUPABASE_URL\s*=\s*https://([a-z0-9]+)\.supabase\.co', txt
    ) or re.search(r'https://([a-z0-9]{16,})\.supabase\.co', txt)
    if not token or not url:
        print('ERRO: token/URL do Supabase nao encontrados em credenciais.txt')
        sys.exit(1)
    return token.group(1), url.group(1)


TOKEN, REF = load_creds()


def api(sql, timeout=120):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': sql}).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {TOKEN}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            return json.loads(body) if body.strip() else []
    except urllib.error.HTTPError as err:
        detail = err.read().decode('utf-8', 'replace')
        raise RuntimeError(f'HTTP {err.code}: {detail[:800]}') from None


def one(sql, timeout=120):
    rows = api(sql, timeout)
    return rows[0] if rows else {}


def cleanup():
    api(
        f"""
        begin;
        set local session_replication_role = replica;
        create temp table _can_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _can_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def create(item_id, hours):
    phone = '2449' + str(uuid.uuid4().int % 10**7).zfill(7)
    key = str(uuid.uuid4())
    pickup = (datetime.now(timezone.utc) + timedelta(hours=hours)).replace(
        minute=0, second=0, microsecond=0
    )
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Cancelar', '{phone}', 'Talatona', 1, null, null, null,
          '{key}', '{pickup.isoformat()}', null
        ) as res
        """
    )
    res = rows[0]['res']
    if not res.get('ok'):
        raise RuntimeError(f'falha a criar reserva: {res}')
    return res['reservation_id'], res['access_token']


def cancel(rid, token):
    rows = api(
        f"select localizador.cancel_reservation('{rid}', '{token}') as res"
    )
    return rows[0]['res']


def set_row(rid, assignments):
    """Ajusta campos da reserva directamente (para montar o cenário)."""
    api(f"update localizador.reservations set {assignments} where id = '{rid}'")


def conclude(rid):
    """Imita o portal: UPDATE condicional ao estado lido."""
    return one(
        f"""
        with u as (
          update localizador.reservations
             set status = 'concluida', resolved_at = now()
           where id = '{rid}' and status = 'pendente'
           returning 1
        )
        select count(*) as n from u
        """
    ).get('n', 0)


def state(rid, item):
    return one(
        f"""
        select jsonb_build_object(
          'status',   (select status from localizador.reservations where id = '{rid}'),
          'reason',   (select reason from localizador.reservations where id = '{rid}'),
          'resolved', (select resolved_at is not null from localizador.reservations where id = '{rid}'),
          'qty',      (select quantity from localizador.stock_items where id = '{item}'),
          'reserved', (select reserved_quantity from localizador.stock_items where id = '{item}')
        ) as res
        """
    ).get('res') or {}


def main():
    cleanup()

    pid, did, did2, iid, iid2 = (str(uuid.uuid4()) for _ in range(5))
    slug = SLUG_PREFIX + pid[:8]

    api(
        f"""
        begin;
        insert into localizador.pharmacies
          (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE CANCEL 0058', 'Talatona', true, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE CANCEL 0058', 'medicamento', true);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did2}', 'TESTE CANCEL 0058 B', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 3, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0058', 3, 'portal');
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid2}', '{pid}', '{did2}', true, 3, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid2}', '{did2}', 'TESTE-0058-B', 3, 'portal');
        commit;
        """
    )

    checks = []

    # 1. Pendente → cancelada, unidade de volta.
    rid, tok = create(iid, 3)
    before = state(rid, iid)
    res = cancel(rid, tok)
    after = state(rid, iid)
    print(f'1. cancelar pendente: {res} | antes {before} | depois {after}')
    checks += [
        ('cancelamento aceite', res.get('ok') is True and res.get('status') == 'cancelada'),
        ('estado cancelada', after.get('status') == 'cancelada'),
        ('motivo cancelado_cliente', after.get('reason') == 'cancelado_cliente'),
        ('resolved_at preenchido', after.get('resolved') is True),
        ('1 unidade presa antes', before.get('reserved') == 1),
        ('stock libertado (0 preso)', after.get('reserved') == 0),
        ('quantity intacta (3)', after.get('qty') == 3),
    ]

    # 2. Repetir é idempotente.
    again = cancel(rid, tok)
    again_state = state(rid, iid)
    print(f'2. repetir: {again} | {again_state}')
    checks += [
        ('segundo cancelamento ok', again.get('ok') is True),
        ('marcado como replay', again.get('idempotent') is True),
        ('continua cancelada', again_state.get('status') == 'cancelada'),
        ('não prende stock', again_state.get('reserved') == 0),
    ]

    # 3. Token errado.
    rid3, tok3 = create(iid, 4)
    wrong = cancel(rid3, str(uuid.uuid4()))
    wrong_state = state(rid3, iid)
    print(f'3. token errado: {wrong} | {wrong_state}')
    checks += [
        ('token errado recusado', wrong.get('error') == 'NAO_ENCONTRADO'),
        ('reserva intacta', wrong_state.get('status') == 'pendente'),
        ('stock continua preso', wrong_state.get('reserved') == 1),
    ]
    cancel(rid3, tok3)

    # 4. Concluída pela farmácia não é cancelável.
    rid4, tok4 = create(iid, 5)
    n = conclude(rid4)
    late = cancel(rid4, tok4)
    late_state = state(rid4, iid)
    print(f'4. já concluída (update={n}): {late} | {late_state}')
    checks += [
        ('conclusão aplicada', n == 1),
        ('cancelamento recusado', late.get('error') == 'NAO_CANCELAVEL'),
        ('estado devolvido', late.get('status') == 'concluida'),
        ('continua concluida', late_state.get('status') == 'concluida'),
        ('stock baixou (3 → 2)', late_state.get('qty') == 2),
        ('nada preso', late_state.get('reserved') == 0),
    ]

    # 5. Dois cancelamentos simultâneos.
    rid5, tok5 = create(iid, 6)
    results5, errs5 = [], []

    def run_cancel():
        try:
            results5.append(cancel(rid5, tok5))
        except Exception as exc:  # noqa: BLE001
            errs5.append(str(exc))

    threads = [threading.Thread(target=run_cancel) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    s5 = state(rid5, iid)
    print(f'5. dois cancelamentos: {results5} | {s5}')
    checks += [
        ('sem erros', not errs5 and len(results5) == 2),
        ('os dois ok', all(r.get('ok') for r in results5)),
        ('um efectivo e um replay', sum(1 for r in results5 if r.get('idempotent') is False) == 1),
        ('stock coerente', s5.get('status') == 'cancelada' and s5.get('reserved') == 0),
    ]

    # 6. Corrida: cancelar contra concluir (UPDATE condicional do portal).
    rid6, tok6 = create(iid, 7)
    outcome = {}

    def run_cancel6():
        outcome['cancel'] = cancel(rid6, tok6)

    def run_conclude6():
        outcome['concluded'] = conclude(rid6)

    ta = threading.Thread(target=run_cancel6)
    tb = threading.Thread(target=run_conclude6)
    ta.start()
    tb.start()
    ta.join()
    tb.join()
    s6 = state(rid6, iid)
    print(f'6. corrida cancelar/concluir: {outcome} | {s6}')
    won_cancel = outcome.get('cancel', {}).get('ok') is True and outcome.get('concluded') == 0
    won_conclude = (
        outcome.get('cancel', {}).get('error') == 'NAO_CANCELAVEL'
        and outcome.get('concluded') == 1
    )
    checks += [
        ('um só vencedor', won_cancel or won_conclude),
        (
            'estado final coerente',
            (won_cancel and s6.get('status') == 'cancelada' and s6.get('qty') == 2)
            or (won_conclude and s6.get('status') == 'concluida' and s6.get('qty') == 1),
        ),
        ('nunca preso negativo', s6.get('reserved') == 0),
    ]

    # 7. Confirmada: ainda pode desistir até à hora marcada.
    rid7, tok7 = create(iid2, 8)
    set_row(rid7, "status = 'confirmada'")
    before7 = state(rid7, iid2)
    res7 = cancel(rid7, tok7)
    after7 = state(rid7, iid2)
    print(f'7. cancelar confirmada: {res7} | antes {before7} | depois {after7}')
    checks += [
        ('confirmada cancelável até à hora', res7.get('ok') is True),
        ('estado cancelada', after7.get('status') == 'cancelada'),
        ('stock libertado', after7.get('reserved') == 0),
        ('quantity intacta (3)', after7.get('qty') == 3),
    ]

    # 8. Pronta com a hora passada: a farmácia conta com a pessoa.
    rid8, tok8 = create(iid2, 9)
    set_row(rid8, "status = 'pronta', pickup_at = now() - interval '2 hours'")
    late8 = cancel(rid8, tok8)
    s8 = state(rid8, iid2)
    print(f'8. cancelar pronta fora do prazo: {late8} | {s8}')
    checks += [
        ('recusado', late8.get('error') == 'NAO_CANCELAVEL'),
        ('causa fora_do_prazo', late8.get('causa') == 'fora_do_prazo'),
        ('continua pronta', s8.get('status') == 'pronta'),
        ('unidade ainda presa', s8.get('reserved') == 1),
    ]

    # 9. Pronta dentro do prazo: cancelável.
    rid9, tok9 = create(iid2, 10)
    set_row(rid9, "status = 'pronta'")
    res9 = cancel(rid9, tok9)
    s9 = state(rid9, iid2)
    print(f'9. cancelar pronta no prazo: {res9} | {s9}')
    checks += [
        ('pronta cancelável antes da hora', res9.get('ok') is True),
        # A rid8 (pronta fora do prazo) continua a prender uma unidade.
        ('libertou a própria unidade', s9.get('reserved') == 1),
    ]

    print('\nVerificações:')
    for label, passed in checks:
        print(f'  {"[OK]  " if passed else "[FALHA]"} {label}')

    return 0 if all(p for _, p in checks) else 1


if __name__ == '__main__':
    code = 1
    try:
        code = main()
    except Exception as exc:  # noqa: BLE001
        print('ERRO:', exc)
        code = 1
    finally:
        try:
            cleanup()
            left = one(
                f"select count(*) as n from localizador.pharmacies where slug like '{SLUG_PREFIX}%'"
            ).get('n')
            print(f'\nLimpeza: farmácias de teste restantes = {left}')
        except Exception as exc:  # noqa: BLE001
            print('\nAVISO: limpeza falhou:', exc)
            code = 1
    sys.exit(code)
