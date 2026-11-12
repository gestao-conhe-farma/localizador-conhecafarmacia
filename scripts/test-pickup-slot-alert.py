#!/usr/bin/env python
"""Teste do aviso de bloco de levantamento cheio (0061).

Contra uma farmácia de teste (bloco de 60 min, capacidade 1):

  1. a reserva que enche o bloco cria UM aviso com o bloco e a
     capacidade certos;
  2. o aviso nasce fechado? não — `seen_at` nulo, portanto aparece na fila;
  3. um segundo pedido no mesmo bloco é recusado (JANELA_CHEIA) e não
     duplica o aviso;
  4. outro bloco enche e avisa à parte;
  5. marcar como visto tira-o dos avisos abertos sem apagar a linha;
  6. `anon` não lê avisos e `authenticated` não cria avisos.

Cria farmácia/fármaco/item próprios e apaga-os no fim.

Uso: python scripts/test-pickup-slot-alert.py
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

SLUG_PREFIX = 'teste-alert-0061-'
CAPACITY = 1
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
        create temp table _alert_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.pickup_slot_alerts where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _alert_drugs);
        delete from localizador.pharmacies         where slug like '{SLUG_PREFIX}%';
        commit;
        """
    )


def create(item_id, pickup_sql):
    rows = api(
        f"""
        select localizador.create_reservation(
          '{item_id}', 'Teste Alerta', '2449{uuid.uuid4().int % 10**7:07d}', 'Talatona',
          1, null, null, null, '{uuid.uuid4()}', {pickup_sql}, null
        ) as res
        """
    )
    return rows[0]['res'] if rows else {'ok': False, 'error': 'SEM_RESPOSTA'}


def alerts(pid):
    return api(
        f"""
        select id, slot, capacity, seen_at
          from localizador.pickup_slot_alerts
         where pharmacy_id = '{pid}'
         order by slot
        """
    )


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
          ('{pid}', '{slug}', 'TESTE ALERTA 0061', 'Talatona', true, false,
           {SLOT_MINUTES}, {CAPACITY});
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE ALERTA 0061', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 10, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0061', 10, 'portal');
        commit;
        """
    )

    base = (datetime.now(timezone.utc) + timedelta(hours=3)).replace(
        minute=0, second=0, microsecond=0
    )
    print(f'Fixture: bloco {SLOT_MINUTES} min, capacidade {CAPACITY}. Blocos {base:%H:%M}Z e {base + timedelta(hours=1):%H:%M}Z.')

    checks = []

    # 1. O pedido que enche o bloco.
    r1 = create(iid, f"'{base.isoformat()}'")
    checks.append(('reserva que enche o bloco aceite', r1.get('ok') is True))
    rows = alerts(pid)
    checks.append(('aviso criado', len(rows) == 1))
    if rows:
        a = rows[0]
        # A API serializa o timestamptz no fuso da sessão: compara-se o
        # instante, não o texto.
        slot_at = datetime.fromisoformat(a['slot'].replace('Z', '+00:00'))
        checks.append(('aviso aponta ao bloco certo', abs((slot_at - base).total_seconds()) < 1))
        checks.append(('aviso guarda a capacidade', a['capacity'] == CAPACITY))
        checks.append(('aviso por ler', a['seen_at'] is None))

    # 2. Segundo pedido no mesmo bloco: recusado, sem segundo aviso.
    r2 = create(iid, f"'{base + timedelta(minutes=15)}'")
    checks.append(('segundo pedido recusado com JANELA_CHEIA', r2.get('error') == 'JANELA_CHEIA'))
    checks.append(('não duplica o aviso', len(alerts(pid)) == 1))

    # 3. Outro bloco enche e avisa à parte.
    later = base + timedelta(hours=2)
    r3 = create(iid, f"'{later.isoformat()}'")
    checks.append(('segundo bloco aceite', r3.get('ok') is True))
    rows = alerts(pid)
    checks.append(('dois avisos, um por bloco', len(rows) == 2))
    checks.append(('blocos distintos', len({r['slot'] for r in rows}) == len(rows)))

    # 4. privilégios / políticas.
    checks.append((
        'anon não lê avisos',
        one("select has_table_privilege('anon', 'localizador.pickup_slot_alerts', 'SELECT') as res").get('res') is False,
    ))
    checks.append((
        'authenticated não cria avisos',
        one("select has_table_privilege('authenticated', 'localizador.pickup_slot_alerts', 'INSERT') as res").get('res') is False,
    ))
    policies = one(
        """select count(*) as n from pg_policies
            where schemaname = 'localizador'
              and tablename = 'pickup_slot_alerts'"""
    ).get('n')
    checks.append(('duas policies (ler e visto)', policies == 2))

    # 5. «Marcar como visto»: sai dos abertos, a linha fica.
    first_id = alerts(pid)[0]['id']
    api(
        f"""update localizador.pickup_slot_alerts
               set seen_at = now()
             where id = '{first_id}'"""
    )
    open_rows = api(
        f"""select id from localizador.pickup_slot_alerts
             where pharmacy_id = '{pid}' and seen_at is null"""
    )
    checks.append(('visto sai dos avisos abertos', len(open_rows) == 1))
    checks.append(('a linha não é apagada', len(alerts(pid)) == 2))

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
