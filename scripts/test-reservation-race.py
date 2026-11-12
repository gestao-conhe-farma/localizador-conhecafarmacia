#!/usr/bin/env python
"""Teste de concorrência da conclusão de reservas (migração 0053).

Duas reservas DIFERENTES de 1 unidade sobre o mesmo item com saldo 5
são concluídas ao mesmo tempo, em duas sessões reais do Postgres
(Management API, pedidos independentes — confirmado por pg_backend_pid
distinto):

  • ANTES da 0053 — lost update: o saldo fica 4 (uma baixa perdida) e
    os dois movimentos registam 5→4; os lotes ficam a 3, pelo que item
    e camadas divergem;
  • DEPOIS da 0053 — saldo 3, lotes 3, movimentos 5→4 e 4→3.

O teste corre contra a base real, mas cria uma farmácia/fármaco/item/
reservas próprios e apaga-os no fim (finally), mesmo que falhe. Para
remover o histórico append-only da fixture usa `session_replication_role
= replica`, local à transacção de limpeza.

Uso: python scripts/test-reservation-race.py
Saída: 0 = correto (saldo 3); 1 = bug reproduzido ou erro.
"""
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

# Consola do Windows (cp1252) não imprime as setas/acentos do relatório:
# sem isto o teste passava e saía com código 1 ao imprimir o resultado.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SLUG_PREFIX = 'teste-concorrencia-0053-'
HOLD_SECONDS = 2.0


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


PHARMACIES = f"select id from localizador.pharmacies where slug like '{SLUG_PREFIX}%'"


def cleanup():
    """Apaga tudo o que o teste criou (idempotente, também pré-limpeza)."""
    sql = f"""
    begin;
    set local session_replication_role = replica;
    create temp table _race_drugs on commit drop as
      select distinct s.drug_id as id
        from localizador.stock_items s
        join localizador.pharmacies p on p.id = s.pharmacy_id
       where p.slug like '{SLUG_PREFIX}%';
    delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
    delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
    delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
    delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
    delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
    delete from localizador.drugs              where id in (select id from _race_drugs);
    delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
    commit;
    """
    api(sql)


def race(reservation_a, reservation_b):
    """Duas conclusões concorrentes em sessões distintas."""
    out, errs = {}, {}

    def run_a():
        try:
            out['a'] = api(
                'begin; '
                f"update localizador.reservations set status = 'concluida' where id = '{reservation_a}'; "
                f'select pg_sleep({HOLD_SECONDS}); '
                'commit;'
            )
        except Exception as exc:  # noqa: BLE001 - reportar, não esconder
            errs['a'] = str(exc)

    def run_b():
        time.sleep(0.4)  # entra enquanto A ainda está a segurar a transacção
        try:
            out['b'] = api(
                'begin; '
                f"update localizador.reservations set status = 'concluida' where id = '{reservation_b}'; "
                'commit;'
            )
        except Exception as exc:  # noqa: BLE001
            errs['b'] = str(exc)

    threads = [threading.Thread(target=run_a), threading.Thread(target=run_b)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out, errs


def main():
    # Reexecutável: limpa restos de uma execução anterior.
    cleanup()

    pid, did, iid, rid_a, rid_b = (str(uuid.uuid4()) for _ in range(5))
    slug = SLUG_PREFIX + pid[:8]
    phone_a = '2449' + str(int(rid_a.replace('-', '')[:7], 16)).zfill(7)[:7]
    phone_b = '2449' + str(int(rid_b.replace('-', '')[:7], 16)).zfill(7)[:7]

    print(f'Fixture: farmácia {slug}, item {iid}, saldo 5, duas reservas de 1.')

    api(
        f"""
        begin;
        insert into localizador.pharmacies (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE CONCORRENCIA 0053', 'Talatona', false, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE CONCORRENCIA 0053', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 5, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0053', 5, 'portal');
        insert into localizador.reservations
          (id, stock_item_id, pharmacy_id, drug_id, requester_name, requester_phone, quantity, status)
        values
          ('{rid_a}', '{iid}', '{pid}', '{did}', 'Teste Corrida A', '{phone_a}', 1, 'pronta'),
          ('{rid_b}', '{iid}', '{pid}', '{did}', 'Teste Corrida B', '{phone_b}', 1, 'pronta');
        commit;
        """
    )

    print(f'A concluir as duas reservas em paralelo (A segura ~{HOLD_SECONDS}s)...')
    _, errs = race(rid_a, rid_b)
    if errs:
        print('ERRO na corrida:', errs)

    res = one(
        f"""
        select jsonb_build_object(
          'qty',        (select quantity  from localizador.stock_items where id = '{iid}'),
          'in_stock',   (select in_stock from localizador.stock_items where id = '{iid}'),
          'lots',       (select coalesce(sum(quantity), 0) from localizador.stock_lots where stock_item_id = '{iid}'),
          'concluidas', (select count(*) from localizador.reservations
                          where id in ('{rid_a}', '{rid_b}') and status = 'concluida'),
          'movs',       (select coalesce(jsonb_agg(
                            jsonb_build_object('antes', quantity_before, 'depois', quantity_after, 'delta', quantity_delta)
                            order by created_at), '[]'::jsonb)
                          from localizador.stock_movements
                         where stock_item_id = '{iid}' and movement_type = 'venda')
        ) as res
        """
    ).get('res') or {}

    qty = res.get('qty')
    lots = res.get('lots')
    movs = res.get('movs') or []
    pares = sorted((m.get('antes'), m.get('depois')) for m in movs)
    soma = sum(int(m.get('delta') or 0) for m in movs)

    print('\nResultado:')
    print(f'  saldo do item : {qty} (esperado 3)')
    print(f'  soma dos lotes: {lots} (esperado 3)')
    print(f'  in_stock      : {res.get("in_stock")} (esperado true)')
    print(f'  concluídas    : {res.get("concluidas")} (esperado 2)')
    print(f'  movimentos    : {movs}')
    print(f'  soma dos deltas: {soma} (esperado -2)')

    ok = (
        not errs
        and qty == 3
        and lots == 3
        and res.get('in_stock') is True
        and res.get('concluidas') == 2
        and len(movs) == 2
        and soma == -2
        and pares == [(4, 3), (5, 4)]
    )

    if ok:
        print('\n[PASS] Baixa atómica: saldo 3, lotes 3, livro-razão 5→4 e 4→3.')
    elif qty == 4:
        print('\n[FALHOU] Lost update reproduzido: o saldo ficou 4 em vez de 3')
        print('         (as duas conclusões leram 5 e escreveram 4).')
        if lots != qty:
            print(f'         Extra: lotes a {lots} e item a {qty} — divergência entre item e camadas.')
    else:
        print('\n[FALHOU] Estado inesperado (ver valores acima).')

    return 0 if ok else 1


if __name__ == '__main__':
    code = 1
    try:
        code = main()
    except Exception as exc:  # noqa: BLE001 - limpar sempre antes de sair
        print('ERRO:', exc)
        code = 1
    finally:
        try:
            cleanup()
            leftovers = one(
                f"select count(*) as n from localizador.pharmacies where slug like '{SLUG_PREFIX}%'"
            ).get('n')
            print(f'\nLimpeza: farmácias de teste restantes = {leftovers}')
        except Exception as exc:  # noqa: BLE001
            print('\nAVISO: limpeza falhou:', exc)
            code = 1
    sys.exit(code)
