"""Aplica um ficheiro SQL no projecto Supabase via Management API.

Uso: python scripts/apply-migration.py supabase/migrations/0001_initial_schema.sql

Credenciais lidas de credenciais.txt na raiz (gitignored).
"""
import json
import re
import sys
import urllib.request

MIGRATION_FILE = sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations/0001_initial_schema.sql'

# Ler credenciais do ficheiro local (fora do git)
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

print(f'A aplicar {MIGRATION_FILE} no projecto {PROJECT_REF} ({len(sql)} chars)...\n')

req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
    data=json.dumps({'query': sql}).encode('utf-8'),
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
        print(body if body else '(sem output)')
        print('\n✅ Migração aplicada com sucesso.')
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    print(f'HTTP {e.code}')
    try:
        err = json.loads(body)
        print(json.dumps(err, indent=2, ensure_ascii=False))
    except Exception:
        print(body)
    print('\n❌ Falhou — ver erro acima.')
    sys.exit(1)
