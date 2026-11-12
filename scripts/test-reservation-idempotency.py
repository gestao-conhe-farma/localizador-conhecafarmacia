#!/usr/bin/env python
"""Teste da idempotência por submissão (migração 0055).

Item com 2 unidades. Dois pedidos SIMULTÂNEOS com a mesma chave (mesmo
telefone) têm de produzir UMA só reserva, com a mesma id nas duas
respostas. Repetir a chave depois (retry) devolve a mesma reserva.
Chave nova cria a segunda reserva.

Cria farmácia/fármaco/item/reservas próprios e apaga-os no fim
(finally). Só a limpeza usa `session_replication_role = replica`.

Uso: python scripts/test-reservation-idempotency.py
Saída: 0 = correcto; 1 = falhou.
"""
import json
import re
import sys
import threading
import urllib.error
import urllib.request
import uuid

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-idem-0055-'


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


def api(sql, timeout=150):
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


def one(sql, timeout=150):
    rows = api(sql, timeout)
    return rows[0] if rows else {}


def cleanup():
    api(
        f"""
        begin;
        set local session_replication_role = replica;
        create temp table _idem_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _idem_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def create(item_id, phone, key=None):
    key_sql = 'null' if key is None else f"'{key}'"
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Idem', '{phone}', 'Talatona', 1, null, null, null, {key_sql},
          now() + interval '2 hours', null
        ) as res
        """
    )
    return rows[0]['res'] if rows else {'ok': False, 'error': 'SEM_RESPOSTA'}


def main():
    cleanup()

    pid, did, iid = (str(uuid.uuid4()) for _ in range(3))
    slug = SLUG_PREFIX + pid[:8]
    phone = '2449' + str(uuid.uuid4().int % 10**7).zfill(7)
    key = str(uuid.uuid4())

    api(
        f"""
        begin;
        insert into localizador.pharmacies (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE IDEMPOTENCIA 0055', 'Talatona', true, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE IDEMPOTENCIA 0055', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 2, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0055', 2, 'portal');
        commit;
        """
    )

    print(f'Fixture: item {iid} com 2 unidades. Mesma chave em paralelo...')

    results, errs = [], []

    def run():
        try:
            results.append(create(iid, phone, key))
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=run) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    ok = [r for r in results if r.get('ok')]
    ids = {r.get('reservation_id') for r in ok}
    replay = [r for r in ok if r.get('idempotent')]
    print(f'  respostas ok: {len(ok)} | ids distintos: {len(ids)} | replay: {len(replay)} | erros: {len(errs)}')

    st = one(
        f"""
        select jsonb_build_object(
          'total',     (select count(*) from localizador.reservations where stock_item_id = '{iid}'),
          'reserved',  (select reserved_quantity from localizador.stock_items where id = '{iid}'),
          'available', (select available_quantity from localizador.stock_confirmed where stock_item_id = '{iid}')
        ) as res
        """
    ).get('res') or {}
    print(f'  estado: {st}')

    checks = []
    checks.append(('as duas respostas ok', len(ok) == 2 and not errs))
    checks.append(('uma só reserva criada', st.get('total') == 1))
    checks.append(('as duas respostas têm a mesma id', len(ids) == 1))
    checks.append(('segunda resposta marcada como replay', len(replay) == 1))
    checks.append(('reserved_quantity = 1', st.get('reserved') == 1))
    checks.append(('available_quantity = 1', st.get('available') == 1))

    if ok:
        winner = next(iter(ids))
        again = create(iid, phone, key)
        checks.append(('retry da mesma chave devolve a mesma id', again.get('reservation_id') == winner))
        checks.append(('retry não cria reserva nova', (one(
            f"select count(*) as n from localizador.reservations where stock_item_id = '{iid}'"
        ).get('n')) == 1))

        other = create(iid, phone, str(uuid.uuid4()))
        checks.append(('chave nova cria a segunda reserva', other.get('ok') is True and other.get('reservation_id') != winner))
        st = one(
            f"""
            select jsonb_build_object(
              'total',     (select count(*) from localizador.reservations where stock_item_id = '{iid}'),
              'reserved',  (select reserved_quantity from localizador.stock_items where id = '{iid}'),
              'available', (select available_quantity from localizador.stock_confirmed where stock_item_id = '{iid}')
            ) as res
            """
        ).get('res') or {}
        checks.append(('duas reservas, stock preso', st.get('total') == 2 and st.get('reserved') == 2))
        checks.append(('sem unidades livres', st.get('available') == 0))

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
