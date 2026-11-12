#!/usr/bin/env python
"""Teste da ordem de locks do stock (migração 0055).

Cenário 1 — cinco entradas simultâneas de +1 num item com saldo 10.
  Com `post_stock_change` a ler e a escrever o saldo sem lock, todas
  liam 10 e escreviam 11 (saldo final 11, movimentos "10→11" cinco
  vezes). Com o FOR UPDATE, serializam: 15 e a cadeia 10→11→…→15.

Cenário 2 — conclusão de reserva concorrente com uma entrada de stock.
  A entrada (+2) segura a transacção ~2 s; a conclusão (1 unidade)
  entra a meio. As duas passagens travam stock_items primeiro, por isso
  não há deadlock nem perda: 5 → 7 (entrada) → 6 (venda).

Cria farmácia/fármaco/item/reserva próprios e apaga-os no fim.

Uso: python scripts/test-stock-lock-order.py
Saída: 0 = correcto; 1 = falhou.
"""
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-stock-0055-'


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
        create temp table _lock_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _lock_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def change_sql(pid, did, body, hold=0):
    # service_role: post_stock_change aceita o caminho privilegiado.
    return (
        'begin; '
        "set local request.jwt.claim.role = 'service_role'; "
        f'select localizador.post_stock_change({body}) as res; '
        + (f'select pg_sleep({hold}); ' if hold else '')
        + 'commit;'
    )


def state(iid, pid, did):
    return one(
        f"""
        select jsonb_build_object(
          'qty',      (select quantity from localizador.stock_items where id = '{iid}'),
          'lots',     (select coalesce(sum(quantity), 0) from localizador.stock_lots where stock_item_id = '{iid}'),
          'in_stock', (select in_stock from localizador.stock_items where id = '{iid}'),
          'reserved', (select reserved_quantity from localizador.stock_items where id = '{iid}'),
          'entradas', (select coalesce(jsonb_agg(
                          jsonb_build_object('antes', quantity_before, 'depois', quantity_after)
                          order by created_at), '[]'::jsonb)
                         from localizador.stock_movements
                        where stock_item_id = '{iid}' and movement_type = 'entrada'),
          'vendas',   (select coalesce(jsonb_agg(
                          jsonb_build_object('antes', quantity_before, 'depois', quantity_after)
                          order by created_at), '[]'::jsonb)
                         from localizador.stock_movements
                        where stock_item_id = '{iid}' and movement_type = 'venda'),
          'mismatch', (select count(*) from (
                          select s.id
                            from localizador.stock_items s
                            left join (
                              select r.stock_item_id,
                                     sum(localizador.reservation_hold_units(
                                           r.quantity, r.confirmed_quantity, r.sale_option_id, r.status
                                         )) as units
                                from localizador.reservations r
                               group by r.stock_item_id
                            ) h on h.stock_item_id = s.id
                           where s.reserved_quantity <> coalesce(h.units, 0)
                        ) x)
        ) as res
        """
    ).get('res') or {}


def main():
    cleanup()

    pid, did, iid, rid = (str(uuid.uuid4()) for _ in range(4))
    slug = SLUG_PREFIX + pid[:8]

    api(
        f"""
        begin;
        insert into localizador.pharmacies (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE LOCKS 0055', 'Talatona', false, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE LOCKS 0055', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 10, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0055', 10, 'portal');
        insert into localizador.reservations
          (id, stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status)
        values ('{rid}', '{iid}', '{pid}', '{did}', 'Teste Locks', '2449000000', 1, 'pronta');
        commit;
        """
    )

    checks = []

    # ---------- cenário 1: 5 entradas simultâneas ----------
    print('Cenário 1: 5 entradas simultâneas de +1 (saldo 10)...')
    results, errs = [], []

    def add_one():
        try:
            rows = api(change_sql(pid, did, f"p_pharmacy_id => '{pid}', p_drug_id => '{did}', p_type => 'entrada', p_delta => 1, p_source => 'api'"))
            results.append(rows[0]['res'] if rows else {})
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=add_one) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    st = state(iid, pid, did)
    entradas = sorted((m['antes'], m['depois']) for m in (st.get('entradas') or []))
    print(f'  saldo: {st.get("qty")} | entradas: {entradas} | erros: {len(errs)}')

    checks.append(('5 entradas aceites', len(results) == 5 and not errs))
    checks.append(('saldo 15 (nenhuma perda)', st.get('qty') == 15))
    checks.append(('lotes acompanham o saldo', st.get('lots') == 15))
    checks.append((
        'livro-razão encadeado 10→11→…→15',
        entradas == [(10, 11), (11, 12), (12, 13), (13, 14), (14, 15)],
    ))

    # ---------- cenário 2: entrada a segurar, conclusão a meio ----------
    print('Cenário 2: conclusão concorrente com entrada de +2 (saldo 5)...')
    api(change_sql(pid, did, f"p_pharmacy_id => '{pid}', p_drug_id => '{did}', p_type => 'ajuste', p_set_quantity => 5, p_source => 'portal'"))

    errs.clear()
    out = {}

    def hold_entry():
        try:
            out['entrada'] = api(change_sql(
                pid, did,
                f"p_pharmacy_id => '{pid}', p_drug_id => '{did}', p_type => 'entrada', p_delta => 2, p_source => 'api'",
                hold=2,
            ))
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    def conclude():
        time.sleep(0.4)
        try:
            out['venda'] = api(
                'begin; '
                f"update localizador.reservations set status = 'concluida' where id = '{rid}'; "
                'commit;'
            )
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=hold_entry), threading.Thread(target=conclude)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    st = state(iid, pid, did)
    vendas = [(m['antes'], m['depois']) for m in (st.get('vendas') or [])]
    entradas = sorted((m['antes'], m['depois']) for m in (st.get('entradas') or []))
    print(f'  saldo: {st.get("qty")} | lotes: {st.get("lots")} | entradas: {entradas} | vendas: {vendas} | erros: {len(errs)}')

    checks.append(('sem deadlock nem erro', not errs))
    checks.append(('saldo 6 (5 + 2 - 1)', st.get('qty') == 6))
    checks.append(('lotes a acompanhar (6)', st.get('lots') == 6))
    checks.append(('entrada 5→7 registada', (5, 7) in entradas))
    checks.append(('venda 7→6 registada', (7, 6) in vendas))
    checks.append(('contador de reservas coerente', st.get('mismatch') == 0))
    checks.append(('reserva libertou o stock preso', st.get('reserved') == 0))

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
