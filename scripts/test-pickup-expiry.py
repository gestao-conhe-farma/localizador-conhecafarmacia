#!/usr/bin/env python
"""Teste da expiração por hora de levantamento (0059).

Cobre:
  • pendente com a hora marcada passada há mais de 2 h → expirada
    (reason pickup_vencido), unidade devolvida;
  • pendente com o TTL de 72 h vencido → expirada (reason ttl);
  • pendente futura e pendente com 1 h de atraso (tolerância) ficam
    intactas;
  • confirmada não levantada há 30 h → expirada (nao_levantada),
    unidade devolvida e `quantity` NÃO desce (expirar não é vender);
  • pronta dentro das 24 h de tolerância fica; passadas 25 h expira;
  • correr a função outra vez não mexe no que já fechou;
  • infra: o cron chama expire_reservations e o índice existe.

Cria farmácia/fármaco/item próprios e apaga-os no fim.

Uso: python scripts/test-pickup-expiry.py
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

SLUG_PREFIX = 'teste-expiry-0059-'
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
        create temp table _exp_drugs on commit drop as
          select distinct s.drug_id as id
            from localizador.stock_items s
            join localizador.pharmacies p on p.id = s.pharmacy_id
           where p.slug like '{SLUG_PREFIX}%';
        delete from localizador.stock_movements    where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_lots         where pharmacy_id in ({PHARMACIES});
        delete from localizador.reservations       where pharmacy_id in ({PHARMACIES});
        delete from localizador.stock_items        where pharmacy_id in ({PHARMACIES});
        delete from localizador.platform_audit_log where pharmacy_id in ({PHARMACIES});
        delete from localizador.drugs              where id in (select id from _exp_drugs);
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
          '{item_id}', 'Teste Expirar', '{phone}', 'Talatona', 1, null, null, null,
          '{key}', '{pickup.isoformat()}', null
        ) as res
        """
    )
    res = rows[0]['res']
    if not res.get('ok'):
        raise RuntimeError(f'falha a criar reserva: {res}')
    return res['reservation_id'], res['access_token']


def set_row(rid, assignments):
    api(f"update localizador.reservations set {assignments} where id = '{rid}'")


def expire():
    rows = api('select localizador.expire_reservations() as n')
    return rows[0]['n']


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

    pid, did, iid = (str(uuid.uuid4()) for _ in range(3))
    slug = SLUG_PREFIX + pid[:8]

    api(
        f"""
        begin;
        insert into localizador.pharmacies
          (id, slug, name, municipio, active, verified,
           pickup_slot_minutes, pickup_slot_capacity)
        values ('{pid}', '{slug}', 'TESTE EXPIRY 0059', 'Talatona', true, false, 60, 10);
        insert into localizador.drugs (id, name, kind, active)
        values ('{did}', 'TESTE EXPIRY 0059', 'medicamento', true);
        insert into localizador.stock_items (id, pharmacy_id, drug_id, in_stock, quantity, source)
        values ('{iid}', '{pid}', '{did}', true, 6, 'portal');
        insert into localizador.stock_lots (pharmacy_id, stock_item_id, drug_id, lot_number, quantity, source)
        values ('{pid}', '{iid}', '{did}', 'TESTE-0059', 6, 'portal');
        commit;
        """
    )

    checks = []

    # 1. Pendente com a hora passada há 3 h (tolerância é 2 h) → expira.
    rid1, _ = create(iid, 2)
    set_row(rid1, "pickup_at = now() - interval '3 hours'")
    before1 = state(rid1, iid)
    expire()
    after1 = state(rid1, iid)
    print(f'1. pendente fora de hora: antes {before1} | depois {after1}')
    checks += [
        ('expirada', after1.get('status') == 'expirada'),
        ('motivo pickup_vencido', after1.get('reason') == 'pickup_vencido'),
        ('resolved_at preenchido', after1.get('resolved') is True),
        ('unidade presa antes', before1.get('reserved') == 1),
        ('unidade libertada', after1.get('reserved') == 0),
        ('quantity intacta (6)', after1.get('qty') == 6),
    ]

    # 2. TTL de 72 h vencido, hora de levantamento ainda futura → ttl.
    rid2, _ = create(iid, 3)
    set_row(rid2, "expires_at = now() - interval '1 hour'")
    expire()
    after2 = state(rid2, iid)
    print(f'2. TTL vencido: {after2}')
    checks += [
        ('expirada por ttl', after2.get('status') == 'expirada' and after2.get('reason') == 'ttl'),
        ('unidade libertada', after2.get('reserved') == 0),
    ]

    # 3. Pendente futura e pendente com 1 h de atraso ficam.
    rid3, _ = create(iid, 4)
    rid4, _ = create(iid, 5)
    set_row(rid4, "pickup_at = now() - interval '1 hour'")
    expire()
    s3 = state(rid3, iid)
    s4 = state(rid4, iid)
    print(f'3. dentro da tolerância: futura {s3} | atraso 1h {s4}')
    checks += [
        ('pendente futura intacta', s3.get('status') == 'pendente'),
        ('atraso de 1h intacto', s4.get('status') == 'pendente'),
    ]

    # 4. Confirmada e ninguém apareceu há 30 h → nao_levantada, sem baixa.
    rid5, _ = create(iid, 6)
    set_row(rid5, "status = 'confirmada', pickup_at = now() - interval '30 hours'")
    before5 = state(rid5, iid)
    expire()
    after5 = state(rid5, iid)
    print(f'4. confirmada não levantada: antes {before5} | depois {after5}')
    checks += [
        ('expirada', after5.get('status') == 'expirada'),
        ('motivo nao_levantada', after5.get('reason') == 'nao_levantada'),
        ('stock não foi vendido (6)', after5.get('qty') == 6),
        ('uma unidade a menos presa', after5.get('reserved') == before5.get('reserved') - 1),
    ]

    # 5. Pronta há 2 h → dentro das 24 h, fica.
    rid6, _ = create(iid, 7)
    set_row(rid6, "status = 'pronta', pickup_at = now() - interval '2 hours'")
    expire()
    s6 = state(rid6, iid)
    print(f'5. pronta há 2h: {s6}')
    checks += [('pronta intacta dentro das 24h', s6.get('status') == 'pronta')]

    # 6. Pronta há 25 h → expira como não levantada.
    rid7, _ = create(iid, 8)
    set_row(rid7, "status = 'pronta', pickup_at = now() - interval '25 hours'")
    expire()
    s7 = state(rid7, iid)
    print(f'6. pronta há 25h: {s7}')
    checks += [
        ('expirada', s7.get('status') == 'expirada' and s7.get('reason') == 'nao_levantada'),
    ]

    # 7. Segunda chamada não mexe no que já fechou.
    snapshot = {rid: state(rid, iid).get('status') for rid in (rid1, rid2, rid5, rid6, rid7)}
    expire()
    again = {rid: state(rid, iid).get('status') for rid in snapshot}
    print(f'7. segunda chamada: {again}')
    checks += [('fechos idempotentes', again == snapshot)]

    # 8. Infra: cron e índice.
    job = one(
        "select command from cron.job where jobname = 'expire-stale-reservations'"
    )
    idx = one(
        """
        select count(*) as n from pg_indexes
         where schemaname = 'localizador'
           and indexname = 'reservations_open_pickup_idx'
        """
    )
    print(f'8. cron: {job} | índice: {idx}')
    checks += [
        ('cron chama a função', 'expire_reservations' in (job.get('command') or '')),
        ('índice presente', idx.get('n') == 1),
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
