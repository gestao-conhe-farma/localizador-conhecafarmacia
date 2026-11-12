"""Aplica um ficheiro SQL no projecto Supabase via Management API.

Uso: python scripts/apply-migration.py supabase/migrations/0001_initial_schema.sql

Credenciais lidas de credenciais.txt na raiz (gitignored).
"""
import json
import re
import sys
import urllib.request

# Consola do Windows (cp1252) não sabe imprimir o ✅ nem os acentos do
# relatório: sem isto o script rebentava DEPOIS de aplicar a migração e
# saía com código 1, fazendo parecer que falhou.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

MIGRATION_FILE = sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations/0001_initial_schema.sql'

# Ler credenciais do ficheiro local (fora do git)
with open('credenciais.txt', 'r', encoding='utf-8') as f:
    txt = f.read()

# O ficheiro de credenciais mudou de formato ao longo do tempo (a
# etiqueta do token já teve texto a seguir aos dois-pontos e o valor na
# linha seguinte): aceitar as duas formas em vez de falhar em silêncio.
token = re.search(r'Access Token[^\n]*\n\s*(sbp_[A-Za-z0-9]+)', txt) or re.search(
    r'(sbp_[A-Za-z0-9]{20,})', txt
)
url_m = re.search(
    r'NEXT_PUBLIC_SUPABASE_URL\s*=\s*https://([a-z0-9]+)\.supabase\.co', txt
) or re.search(r'https://([a-z0-9]{16,})\.supabase\.co', txt)
if not token or not url_m:
    print('ERRO: token ou project ref não encontrados em credenciais.txt')
    sys.exit(1)

ACCESS_TOKEN = token.group(1)
PROJECT_REF = url_m.group(1)

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
