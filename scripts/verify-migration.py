"""Verifica uma migração SQL SEM a aplicar: corre o ficheiro dentro de uma
transacção e faz ROLLBACK no fim.

Uso: python scripts/verify-migration.py supabase/migrations/0020_stock_movements.sql

Serve para confirmar sintaxe, referências a colunas/tabelas e o corpo das
funções antes de o owner aplicar a migração a sério. A base de dados fica
exactamente como estava (o Postgres faz DDL transaccional).

Credenciais lidas de credenciais.txt na raiz (gitignored) — mesmo padrão do
apply-migration.py/query.py.
"""
import json
import re
import sys
import urllib.request

# Consola do Windows (cp1252) não imprime acentos dos avisos — forçar UTF-8.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

MIGRATION_FILE = sys.argv[1] if len(sys.argv) > 1 else None
if not MIGRATION_FILE:
    print('Uso: python scripts/verify-migration.py supabase/migrations/0020_stock_movements.sql')
    sys.exit(1)

with open('credenciais.txt', 'r', encoding='utf-8') as f:
    txt = f.read()

token = re.search(r'Access Token:\s*\r?\n\s*(sbp_\w+)', txt)
url_m = re.search(r'(NEXT_PUBLIC_SUPABASE_URL=https://(\w+)\.supabase\.co)', txt)
if not token or not url_m:
    print('ERRO: token ou project ref não encontrados em credenciais.txt')
    sys.exit(1)

ACCESS_TOKEN = token.group(1)
PROJECT_REF = url_m.group(2)

with open(MIGRATION_FILE, 'r', encoding='utf-8') as f:
    sql = f.read()

print(f'A verificar {MIGRATION_FILE} em {PROJECT_REF} ({len(sql)} chars) — begin/rollback...\n')

# A migração corre numa transacção própria e é revertida no fim. O
# "raise exception" com um marcador confirma que o SQL chegou ao fim sem
# erro e obriga a transacção a fechar (rollback implícito no erro), pelo
# que NADA fica gravado mesmo que algo corra mal a meio.
wrapped = (
    'begin;\n'
    + sql
    + "\nraise exception 'VERIFICACAO_OK (rollback propositado)';"
)

req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
    data=json.dumps({'query': wrapped}).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {ACCESS_TOKEN}',
        'Content-Type': 'application/json',
    },
    method='POST',
)

try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode('utf-8')
        print(f'HTTP {resp.status}')
        print('(o aviso seguinte e o rollback propositado)')
        print(body if body else '(sem output)')
        print('\n⚠️  Sem o marcador esperado — confirmar manualmente se o SQL correu até ao fim.')
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    if 'VERIFICACAO_OK' in body:
        print('[OK] Migracao valida: correu ate ao fim da transaccao e foi revertida.')
        print('     (base de dados intacta - nada foi aplicado).')
        sys.exit(0)
    print(f'[FALHOU] HTTP {e.code}')
    try:
        err = json.loads(body)
        print(json.dumps(err, indent=2, ensure_ascii=False))
    except Exception:
        print(body)
    sys.exit(1)
