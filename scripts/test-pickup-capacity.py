#!/usr/bin/env python
"""Teste da agenda de levantamento com capacidade por janela (0057).

Farmácia com capacidade 2 por bloco de 60 min. Quatro pedidos
SIMULTÂNEOS para a mesma hora: exactamente 2 passam e 2 recebem
JANELA_CHEIA. Uma hora diferente aceita; datas no passado, a mais de 14
dias ou em falta recebem HORARIO_INVALIDO.

Cria farmácia/fármaco/item próprios e apaga-os no fim.

Uso: python scripts/test-pickup-capacity.py
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

SLUG_PREFIX = 'teste-pickup-0057-'
CAPACITY = 2
CALLS = 4


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
        create temp table _pick_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _pick_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def create(item_id, phone, key, pickup_sql):
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Pickup', '{phone}', 'Talatona', 1, null, null, null,
          '{key}', {pickup_sql}, null
        ) as res
        """
    )
    return rows[0]['res'] if rows else {'ok': False, 'error': 'SEM_RESPOSTA'}


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
          ('{pid}', '{slug}', 'TESTE PICKUP 0057', 'Talatona', true, false, 60, {CAPACITY});
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE PICKUP 0057', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 10, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0057', 10, 'portal');
        commit;
        """
    )

    slot = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(
        minute=0, second=0, microsecond=0
    )
    pickup_sql = f"'{slot.isoformat()}'"
    other_slot = slot + timedelta(hours=1)

    print(f'Fixture: capacidade {CAPACITY} por bloco. Janela {slot.isoformat()}.')
    print(f'{CALLS} pedidos simultâneos para a mesma hora...')

    results, errs = [], []

    def run():
        try:
            results.append(create(iid, '2449' + str(uuid.uuid4().int % 10**7).zfill(7), str(uuid.uuid4()), pickup_sql))
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=run) for _ in range(CALLS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    ok = [r for r in results if r.get('ok')]
    cheia = [r for r in results if r.get('error') == 'JANELA_CHEIA']
    print(f'  aceites: {len(ok)} | JANELA_CHEIA: {len(cheia)} | erros: {len(errs)}')

    st = one(
        f"""
        select jsonb_build_object(
          'total',    (select count(*) from localizador.reservations where stock_item_id = '{iid}'),
          'com_hora', (select count(*) from localizador.reservations
                        where stock_item_id = '{iid}' and pickup_at = {pickup_sql}),
          'reserved', (select reserved_quantity from localizador.stock_items where id = '{iid}')
        ) as res
        """
    ).get('res') or {}
    print(f'  estado: {st}')

    checks = [
        ('4 respostas sem erro', len(results) == CALLS and not errs),
        (f'exactamente {CAPACITY} aceites', len(ok) == CAPACITY),
        (f'{CALLS - CAPACITY} recusados com JANELA_CHEIA', len(cheia) == CALLS - CAPACITY),
        ('2 reservas com a hora marcada', st.get('com_hora') == CAPACITY),
        ('unidades presas = 2', st.get('reserved') == CAPACITY),
    ]

    outro = create(iid, '2449' + str(uuid.uuid4().int % 10**7).zfill(7), str(uuid.uuid4()), f"'{other_slot.isoformat()}'")
    checks.append(('janela seguinte aceita', outro.get('ok') is True))

    passado = create(iid, '2449' + str(uuid.uuid4().int % 10**7).zfill(7), str(uuid.uuid4()), "now() - interval '1 hour'")
    checks.append(('hora no passado recusada', passado.get('error') == 'HORARIO_INVALIDO'))

    longe = create(iid, '2449' + str(uuid.uuid4().int % 10**7).zfill(7), str(uuid.uuid4()), "now() + interval '20 days'")
    checks.append(('mais de 14 dias recusado', longe.get('error') == 'HORARIO_INVALIDO'))

    sem_hora = create(iid, '2449' + str(uuid.uuid4().int % 10**7).zfill(7), str(uuid.uuid4()), 'null')
    checks.append(('sem hora recusado', sem_hora.get('error') == 'HORARIO_INVALIDO'))

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
