#!/usr/bin/env python
"""Teste da criação atómica de reservas (migração 0054).

Cenário: um item com UMA unidade e cinco pedidos simultâneos.

  • exactamente 1 reserva criada; as outras 4 com INDISPONIVEL;
  • reserved_quantity = 1 e available_quantity = 0 na vista;
  • um sexto pedido (sequencial) continua a ser recusado;
  • recusar a reserva liberta a unidade (reserved 0, available 1);
  • concluir baixa o stock (1 → 0), põe in_stock false e liberta o
    contador.

Cria farmácia/fármaco/item/reservas próprios e apaga-os no fim
(finally). Só a transacção de limpeza usa `session_replication_role =
replica`, para remover o histórico append-only da fixture.

Uso: python scripts/test-reservation-holds.py
Saída: 0 = tudo correcto; 1 = falhou.
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

SLUG_PREFIX = 'teste-reservas-0054-'
CALLS = 5


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
    sql = f"""
    begin;
    set local session_replication_role = replica;
    create temp table _th_drugs on commit drop as
      select distinct s.drug_id as id
        from localizador.stock_items s
        join localizador.pharmacies p on p.id = s.pharmacy_id
       where p.slug like '{SLUG_PREFIX}%';
    delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
    delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
    delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
    delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
    delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
    delete from localizador.drugs              where id in (select id from _th_drugs);
    delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
    commit;
    """
    api(sql)


def state(item_id):
    return one(
        f"""
        select jsonb_build_object(
          'qty',        (select quantity from localizador.stock_items where id = '{item_id}'),
          'reserved',   (select reserved_quantity from localizador.stock_items where id = '{item_id}'),
          'in_stock',   (select in_stock from localizador.stock_items where id = '{item_id}'),
          'available',  (select available_quantity from localizador.stock_confirmed where stock_item_id = '{item_id}'),
          'reservas',   (select count(*) from localizador.reservations
                          where stock_item_id = '{item_id}'
                            and status in ('pendente','confirmada','pronta')),
          'total',      (select count(*) from localizador.reservations where stock_item_id = '{item_id}'),
          'mismatch',   (select count(*) from (
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


def create(item_id, n):
    phone = '2449' + str(uuid.uuid4().int % 10**7).zfill(7)
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Holds {n}', '{phone}', 'Talatona', 1, null, null, null, null,
          now() + interval '2 hours', null
        ) as res
        """
    )
    return rows[0]['res'] if rows else {'ok': False, 'error': 'SEM_RESPOSTA'}


def main():
    cleanup()

    pid, did, iid = (str(uuid.uuid4()) for _ in range(3))
    slug = SLUG_PREFIX + pid[:8]

    # Farmacia activa: stock_confirmed (e a RPC) só aceitam o que está
    # à venda agora. Vive poucos segundos e o nome marca-a como teste.
    api(
        f"""
        begin;
        insert into localizador.pharmacies (id, slug, name, municipio, active, verified)
        values ('{pid}', '{slug}', 'TESTE RESERVAS 0054', 'Talatona', true, false);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE RESERVAS 0054', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 1, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0054', 1, 'portal');
        commit;
        """
    )

    print(f'Fixture: item {iid} com 1 unidade. {CALLS} pedidos simultâneos...')

    results, errs = [], []

    def run(n):
        try:
            results.append(create(iid, n))
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=run, args=(n,)) for n in range(1, CALLS + 1)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    ok = [r for r in results if r.get('ok')]
    indisponivel = [r for r in results if r.get('error') == 'INDISPONIVEL']
    print(f'  criadas: {len(ok)} | INDISPONIVEL: {len(indisponivel)} | erros: {len(errs)}')

    st = state(iid)
    print(f'  estado: {st}')

    checks = []
    checks.append(('exactamente 1 reserva criada', len(ok) == 1 and len(results) == CALLS))
    checks.append(('4 pedidos recusados por falta de stock', len(indisponivel) == CALLS - 1))
    checks.append(('reserved_quantity = 1', st.get('reserved') == 1))
    checks.append(('available_quantity = 0', st.get('available') == 0))
    checks.append(('1 reserva aberta', st.get('reservas') == 1))
    checks.append(('contador coerente em toda a base', st.get('mismatch') == 0))

    if not ok:
        print('\n[FALHOU] nenhuma reserva criada — nada mais a testar.')
        return 1

    rid = ok[0]['reservation_id']

    extra = create(iid, 99)
    checks.append(('pedido seguinte continua recusado', extra.get('error') == 'INDISPONIVEL'))

    # A farmácia recusa: a unidade volta a ficar livre.
    api(
        f"update localizador.reservations set status = 'recusada', reason = 'outro:teste 0054' "
        f"where id = '{rid}'"
    )
    st = state(iid)
    print(f'  após recusar: {st}')
    checks.append(('recusar liberta (reserved = 0)', st.get('reserved') == 0))
    checks.append(('available volta a 1', st.get('available') == 1))

    again = create(iid, 100)
    checks.append(('unidade libertada aceita nova reserva', again.get('ok') is True))

    if again.get('ok'):
        api(f"update localizador.reservations set status = 'concluida' where id = '{again['reservation_id']}'")
        st = state(iid)
        print(f'  após concluir: {st}')
        checks.append(('concluir baixa o stock (1 → 0)', st.get('qty') == 0))
        checks.append(('concluir põe in_stock false', st.get('in_stock') is False))
        checks.append(('concluir liberta o contador', st.get('reserved') == 0))

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
