"""Executa uma query SQL no projecto Supabase via Management API e
imprime o resultado em JSON.

Uso: python scripts/query.py "select * from pg_policies where tablename='drugs'"
Credenciais lidas de credenciais.txt na raiz (gitignored).
"""
import json
import re
import sys
import urllib.request

SQL = sys.argv[1] if len(sys.argv) > 1 else 'select 1'

with open('credenciais.txt', 'r', encoding='utf-8') as f:
    txt = f.read()

token = re.search(r'Access Token:\s*\r?\n\s*(sbp_\w+)', txt)
url_m = re.search(r'(NEXT_PUBLIC_SUPABASE_URL=https://(\w+)\.supabase\.co)', txt)
if not token or not url_m:
    print('ERRO: token ou project ref não encontrados em credenciais.txt')
    sys.exit(1)

ACCESS_TOKEN = token.group(1)
PROJECT_REF = url_m.group(2)

req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
    data=json.dumps({'query': SQL}).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {ACCESS_TOKEN}',
        'Content-Type': 'application/json',
    },
    method='POST',
)

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode('utf-8')
        print(body if body else '[]')
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}:', e.read().decode('utf-8', errors='replace'))
    sys.exit(1)
