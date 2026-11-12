#!/usr/bin/env python
"""Teste da auto-recusa de pendentes quando o stock chega a 0 (0056).

Item com 3 unidades e três reservas: duas 'pendente' e uma 'confirmada'.
Um ajuste manual leva o saldo a 0. As pendentes passam a 'recusada' com
reason 'sem_stock' e resolved_at; a 'confirmada' fica intacta (é um
compromisso da farmácia) e continua a prender a sua unidade.

Cria farmácia/fármaco/item/reservas próprios e apaga-os no fim.

Uso: python scripts/test-pending-auto-reject.py
Saída: 0 = correcto; 1 = falhou.
"""
import json
import re
import sys
import urllib.error
import urllib.request
import uuid

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-reject-0056-'


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
        create temp table _rej_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _rej_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def main():
    cleanup()

    pid, did, iid = (str(uuid.uuid4()) for _ in range(3))
    pend_a, pend_b, conf = (str(uuid.uuid4()) for _ in range(3))
    slug = SLUG_PREFIX + pid[:8]

    api(
        f"""
        begin;
        insert into localizador.pharmacies (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE REJECT 0056', 'Talatona', false, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE REJECT 0056', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 3, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0056', 3, 'portal');
        insert into localizador.reservations
          (id, stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status)
        values
          ('{pend_a}', '{iid}', '{pid}', '{did}', 'Teste Pendente A', '2449100001', 1, 'pendente'),
          ('{pend_b}', '{iid}', '{pid}', '{did}', 'Teste Pendente B', '2449100002', 1, 'pendente'),
          ('{conf}',   '{iid}', '{pid}', '{did}', 'Teste Confirmada', '2449100003', 1, 'confirmada');
        commit;
        """
    )

    before = one(
        f"select reserved_quantity as reserved from localizador.stock_items where id = '{iid}'"
    )
    print(f'Fixture: saldo 3, 2 pendentes + 1 confirmada. Unidades presas: {before.get("reserved")}')

    # Ajuste manual (service_role) que leva o saldo a 0.
    api(
        'begin; '
        "set local request.jwt.claim.role = 'service_role'; "
        f"select localizador.post_stock_change("
        f"p_pharmacy_id => '{pid}', p_drug_id => '{did}', p_type => 'ajuste', "
        f"p_set_quantity => 0, p_source => 'portal') as res; "
        'commit;'
    )

    st = one(
        f"""
        select jsonb_build_object(
          'qty',      (select quantity from localizador.stock_items where id = '{iid}'),
          'in_stock', (select in_stock from localizador.stock_items where id = '{iid}'),
          'reserved', (select reserved_quantity from localizador.stock_items where id = '{iid}'),
          'pendentes', (select count(*) from localizador.reservations
                         where stock_item_id = '{iid}' and status = 'pendente'),
          'recusadas', (select count(*) from localizador.reservations
                         where stock_item_id = '{iid}' and status = 'recusada'
                           and reason = 'sem_stock' and resolved_at is not null),
          'confirmadas', (select count(*) from localizador.reservations
                           where stock_item_id = '{iid}' and status = 'confirmada'),
          'movs',      (select count(*) from localizador.stock_movements
                         where stock_item_id = '{iid}' and movement_type = 'reserva'
                           and note = 'sem_stock')
        ) as res
        """
    ).get('res') or {}
    print(f'  depois do ajuste: {st}')

    checks = [
        ('saldo a 0', st.get('qty') == 0),
        ('in_stock false', st.get('in_stock') is False),
        ('nenhuma pendente fica aberta', st.get('pendentes') == 0),
        ('2 pendentes recusadas com sem_stock', st.get('recusadas') == 2),
        ('confirmada intacta', st.get('confirmadas') == 1),
        ('unidades presas só da confirmada', st.get('reserved') == 1),
        ('2 movimentos de recusa com sem_stock', st.get('movs') == 2),
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
