#!/usr/bin/env python
"""Teste do rate-limit atómico por telefone (migração 0056).

Oito pedidos SIMULTÂNEOS para a mesma chave, limite 5/hora:
exactamente 5 são aceites e 3 recusados. Uma chave diferente continua a
passar. Sem o UPSERT atómico, um count + insert concorrente deixaria
passar mais do que o limite.

Uso: python scripts/test-reservation-rate-limit.py
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

LIMIT = 5
CALLS = 8
KEY_PREFIX = 'teste-rate-0056-'


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


def consume(key):
    rows = api(
        f"select localizador.reservation_rate_consume('{key}', {LIMIT}, 3600) as res"
    )
    return rows[0]['res'] if rows else {'allowed': None}


def cleanup():
    api(
        "delete from localizador.reservation_rate_windows "
        f"where rate_key like '{KEY_PREFIX}%'"
    )


def main():
    cleanup()
    key = KEY_PREFIX + str(uuid.uuid4())

    print(f'Fixture: janela {key}. {CALLS} pedidos simultâneos (limite {LIMIT})...')
    results, errs = [], []

    def run():
        try:
            results.append(consume(key))
        except Exception as exc:  # noqa: BLE001
            errs.append(str(exc))

    threads = [threading.Thread(target=run) for _ in range(CALLS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    allowed = [r for r in results if r.get('allowed') is True]
    denied = [r for r in results if r.get('allowed') is False]
    hits = sorted(int(r.get('hits') or 0) for r in results)
    print(f'  aceites: {len(allowed)} | recusados: {len(denied)} | erros: {len(errs)}')
    print(f'  hits observados: {hits}')

    checks = [
        ('8 respostas sem erro', len(results) == CALLS and not errs),
        ('exactamente 5 aceites', len(allowed) == LIMIT),
        ('exactamente 3 recusados', len(denied) == CALLS - LIMIT),
        ('incrementos atómicos 1..8', hits == list(range(1, CALLS + 1))),
    ]

    extra = consume(key)
    checks.append(('pedido seguinte continua recusado', extra.get('allowed') is False))

    other = consume(KEY_PREFIX + str(uuid.uuid4()))
    checks.append(('chave diferente tem janela própria', other.get('allowed') is True))

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
            left = api(
                "select count(*) as n from localizador.reservation_rate_windows "
                f"where rate_key like '{KEY_PREFIX}%'"
            )[0]['n']
            print(f'\nLimpeza: janelas de teste restantes = {left}')
        except Exception as exc:  # noqa: BLE001
            print('\nAVISO: limpeza falhou:', exc)
            code = 1
    sys.exit(code)
