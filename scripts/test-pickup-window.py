#!/usr/bin/env python
"""Teste do fim da janela de levantamento e da lotação visível (0060).

Verifica, contra uma farmácia de teste (bloco de 60 min, capacidade 2):

  1. `pickup_until` é gravado, devolvido pela criação e pelo
     acompanhamento público;
  2. fim antes do início ou a mais de 4 h é recusado;
  3. `pickup_availability` conta as reservas abertas do bloco e devolve
     as vagas (livre → cheia), com `anon` autorizado a ler;
  4. não se passa da capacidade com um terceiro pedido;
  5. o cliente cancela dentro da janela (pickup_at passado, fim futuro)
     e é recusado depois do fim;
  6. o no-show só fecha 24 h depois do FIM da janela, não do início.

Cria farmácia/fármaco/item próprios e apaga-os no fim.

Uso: python scripts/test-pickup-window.py
Saída: 0 = correcto; 1 = falhou.
"""
import json
import re
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-window-0060-'
CAPACITY = 2
SLOT_MINUTES = 60


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
PHARMACIES = f"select id from localizador.pharmacies where slug like '{SLUG_PREFIX}%'"


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
        create temp table _win_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _win_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def create(item_id, key, pickup_sql, until_sql):
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Janela', '2449{uuid.uuid4().int % 10**7:07d}', 'Talatona',
          1, null, null, null, '{key}', {pickup_sql}, {until_sql}
        ) as res
        """
    )
    return rows[0]['res'] if rows else {'ok': False, 'error': 'SEM_RESPOSTA'}


def availability(item_id, starts_sql):
    rows = api(
        f"""
        select localizador.pickup_availability('{item_id}', {starts_sql}) as res
        """
    )
    return rows[0]['res'] if rows else None


def main():
    cleanup()

    pid, did, iid = (str(uuid.uuid4()) for _ in range(3))
    slug = SLUG_PREFIX + pid[:8]

    api(
        f"""
        begin;
        insert into localizador.pharmacies
          (id, slug, name, municipio, active, verified, pickup_slot_minutes, pickup_slot_capacity)
        values
          ('{pid}', '{slug}', 'TESTE WINDOW 0060', 'Talatona', true, false,
           {SLOT_MINUTES}, {CAPACITY});
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE WINDOW 0060', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 10, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0060', 10, 'portal');
        commit;
        """
    )

    slot = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(
        minute=0, second=0, microsecond=0
    )
    until = slot + timedelta(hours=2)
    at_sql = f"'{slot.isoformat()}'"
    until_sql = f"'{until.isoformat()}'"

    print(f'Fixture: bloco {SLOT_MINUTES} min, capacidade {CAPACITY}. Janela {slot:%H:%M}–{until:%H:%M}Z.')

    checks = []

    # 1. Fim da janela gravado e devolvido.
    r1 = create(iid, str(uuid.uuid4()), at_sql, until_sql)
    checks.append(('reserva com fim de janela aceite', r1.get('ok') is True))
    stored = one(
        f"""
        select jsonb_build_object(
          'until', (select pickup_until from localizador.reservations where id = '{r1.get('reservation_id')}'),
          'status_until', (select localizador.get_reservation_status('{r1.get('reservation_id')}', '{r1.get('access_token')}')->>'pickup_until'),
          'created_until', '{r1.get('pickup_until') or ''}'
        ) as res
        """
    ).get('res') or {}
    checks.append(('pickup_until igual ao pedido', bool(stored.get('until')) and stored['until'].startswith(until.strftime('%Y-%m-%dT%H:%M'))))
    checks.append(('acompanhamento devolve pickup_until', bool(stored.get('status_until'))))
    checks.append(('criação devolve pickup_until', bool(stored.get('created_until'))))

    # 2. Fins inválidos.
    igual = create(iid, str(uuid.uuid4()), at_sql, at_sql)
    checks.append(('fim igual ao início recusado', igual.get('error') == 'HORARIO_INVALIDO'))
    longo = create(iid, str(uuid.uuid4()), at_sql, f"'{slot + timedelta(hours=5)}'")
    checks.append(('fim a mais de 4 h recusado', longo.get('error') == 'HORARIO_INVALIDO'))

    # 3. Lotação: 1 de 2 ocupada na janela, 0 na seguinte.
    starts = f"array[{at_sql}, '{until.isoformat()}']::timestamptz[]"
    av = availability(iid, starts) or []
    first = av[0] if av else {}
    second = av[1] if len(av) > 1 else {}
    print(f'  lotação: {first.get("booked")}/{first.get("capacity")} livres {first.get("free")} · seguinte {second.get("booked")}/{second.get("capacity")}')
    checks.append(('lotação: 1 ocupada, 1 livre', first.get('booked') == 1 and first.get('free') == 1))
    checks.append(('bloco devolvido com minutos/capacidade', first.get('minutes') == SLOT_MINUTES and first.get('capacity') == CAPACITY))
    checks.append(('janela seguinte vazia', second.get('booked') == 0 and second.get('free') == CAPACITY))

    # 4. Encher e recusar o terceiro.
    r2 = create(iid, str(uuid.uuid4()), f"'{slot + timedelta(minutes=30)}'", f"'{slot + timedelta(minutes=90)}'")
    checks.append(('segunda reserva na mesma janela aceite', r2.get('ok') is True))
    av2 = availability(iid, f"array[{at_sql}]::timestamptz[]") or [{}]
    checks.append(('janela fica sem vagas', av2[0].get('free') == 0))
    r3 = create(iid, str(uuid.uuid4()), f"'{slot + timedelta(minutes=15)}'", f"'{slot + timedelta(minutes=45)}'")
    checks.append(('terceira recusada com JANELA_CHEIA', r3.get('error') == 'JANELA_CHEIA'))

    # 5. anon pode ler a lotação (a UI pública precisa).
    priv = one(
        "select has_function_privilege('anon', "
        "'localizador.pickup_availability(uuid, timestamptz[])', 'execute') as res"
    ).get('res')
    checks.append(('anon pode ler a lotação', priv is True))

    # 6. Cancelamento dentro da janela (início passado, fim futuro).
    inside = one(
        f"""
        insert into localizador.reservations
          (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
           quantity, status, pickup_at, pickup_until, confirmed_quantity)
        values
          ('{iid}', '{pid}', '{did}', 'Dentro da janela', '244900000001',
           1, 'confirmada', now() - interval '30 minutes', now() + interval '30 minutes', 1)
        returning id, access_token
        """
    )
    cancel_in = one(
        f"select localizador.cancel_reservation('{inside['id']}', '{inside['access_token']}') as res"
    ).get('res') or {}
    checks.append(('cancela dentro da janela', cancel_in.get('ok') is True))

    outside = one(
        f"""
        insert into localizador.reservations
          (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
           quantity, status, pickup_at, pickup_until, confirmed_quantity)
        values
          ('{iid}', '{pid}', '{did}', 'Fora da janela', '244900000002',
           1, 'confirmada', now() - interval '3 hours', now() - interval '1 minute', 1)
        returning id, access_token
        """
    )
    cancel_out = one(
        f"select localizador.cancel_reservation('{outside['id']}', '{outside['access_token']}') as res"
    ).get('res') or {}
    checks.append(('recusa cancelar depois do fim', cancel_out.get('causa') == 'fora_do_prazo'))

    # 7. No-show conta a partir do FIM.
    still = one(
        f"""
        insert into localizador.reservations
          (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
           quantity, status, pickup_at, pickup_until, confirmed_quantity)
        values
          ('{iid}', '{pid}', '{did}', 'Fim recente', '244900000003',
           1, 'confirmada', now() - interval '26 hours', now() - interval '23 hours', 1)
        returning id
        """
    )
    api('select localizador.expire_reservations()')
    st_still = one(
        f"select status from localizador.reservations where id = '{still['id']}'"
    ).get('status')
    checks.append(('23 h depois do fim ainda aberta', st_still == 'confirmada'))

    late = one(
        f"""
        insert into localizador.reservations
          (stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone,
           quantity, status, pickup_at, pickup_until, confirmed_quantity)
        values
          ('{iid}', '{pid}', '{did}', 'Fim antigo', '244900000004',
           1, 'pronta', now() - interval '28 hours', now() - interval '25 hours', 1)
        returning id
        """
    )
    api('select localizador.expire_reservations()')
    closed = one(
        f"select status, reason from localizador.reservations where id = '{late['id']}'"
    )
    checks.append(('25 h depois do fim expirada', closed.get('status') == 'expirada'))
    checks.append(('motivo nao_levantada', closed.get('reason') == 'nao_levantada'))

    print('\nVerificações:')
    for label, passed in checks:
        print(f'  {"[OK]  " if passed else "[FALHA]"} {label}')

    return 0 if all(p for _, p in checks) else 1


if __name__ == '__main__':
    code = 1
    try:
        code = main()
    finally:
        try:
            cleanup()
            print(f'\nLimpeza: farmácias de teste restantes = '
                  f'{one(f"select count(*) as n from localizador.pharmacies where slug like \'{SLUG_PREFIX}%\'").get("n")}')
        except Exception as exc:  # noqa: BLE001
            print(f'ERRO na limpeza: {exc}')
            code = 1
    sys.exit(code)
