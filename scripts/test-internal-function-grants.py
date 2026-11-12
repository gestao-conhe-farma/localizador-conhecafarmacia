#!/usr/bin/env python
"""Teste dos grants das funções internas (achado G1 / migração 0062).

Verifica, contra a base real:

  1. nenhuma das sete funções internas é executável por `anon`;
  2. idem para `authenticated`;
  3. `service_role` continua a poder executá-las (cron, webhooks, portal);
  4. pela REST, com a chave ANÓNIMA, `webhook_claim_due` é recusada;
  5. pela REST, com a chave de SERVIÇO, a mesma chamada responde 200 e
     devolve lista vazia (`p_limit = 0`) — o cron não ficou sem a função.

Nota sobre as chaves: `credenciais.txt` tem blocos de mais do que um
projecto e o Access Token (`sbp_...`) é da API de gestão, não um JWT do
PostgREST. Por isso o teste lê o `ref` de dentro de cada chave e usa a
anónima/serviço que pertence a este projecto — a primeira chave do
ficheiro era de outro e dava 401.

Uso: python scripts/test-internal-function-grants.py
Saída: 0 = correcto; 1 = falhou.
"""
import base64
import json
import re
import sys
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FUNCOES = [
    'log_stock_movement',
    'stock_lot_apply',
    'stock_lot_sync_expiry',
    'webhook_claim_due',
    'webhook_record_attempt',
    'webhook_replay',
    'webhook_prune',
]

SQL_LISTA = ', '.join(f"'{f}'" for f in FUNCOES)


def chaves(nome):
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    return [
        v.strip().strip('"').strip("'")
        for v in re.findall(rf'{nome}\s*=\s*([^\s#]+)', txt)
    ]


def chaves_do_bloco(ref):
    """Chaves do bloco cujo Access Token é deste projecto.

    O ficheiro tem blocos de mais do que um projecto e as chaves novas
    (`sb_publishable_` / `sb_secret_`) não são JWT — não trazem `ref` no
    payload. O bloco do projecto é delimitado pelas linhas «Access Token
    do <ref>».
    """
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    # A etiqueta do ficheiro é abreviada («Access Token do tbqsaz»), não o ref
    # completo — procurar pelo prefixo do ref.
    marca = re.search(rf'Access Token do {re.escape(ref[:6])}', txt)
    inicio = marca.start() if marca else -1
    if inicio < 0:
        return [], []
    fim = txt.find('Access Token', inicio + 1)
    bloco = txt[inicio : fim if fim > 0 else len(txt)]
    ler = lambda nome: [
        v.strip().strip('"').strip("'")
        for v in re.findall(rf'{nome}\s*=\s*([^\s#]+)', bloco)
    ]
    return ler('NEXT_PUBLIC_SUPABASE_ANON_KEY'), ler('SUPABASE_SERVICE_ROLE_KEY')


def ref_do_jwt(chave):
    """O payload de uma chave Supabase (JWT) traz o project ref."""
    try:
        payload = chave.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get('ref')
    except Exception:
        return None


def carregar():
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    token = re.search(r'Access Token[^\n]*\n\s*(sbp_[A-Za-z0-9]+)', txt) or re.search(
        r'(sbp_[A-Za-z0-9]{20,})', txt
    )
    url = re.search(r'https://([a-z0-9]{16,})\.supabase\.co', txt)
    if not token or not url:
        print('ERRO: token/URL do Supabase nao encontrados em credenciais.txt')
        sys.exit(1)
    ref = url.group(1)

    # Preferência: chaves novas do bloco deste projecto (as JWT antigas foram
    # revogadas quando o projecto passou às API keys novas e davam 401);
    # depois JWT cujo `ref` coincide; por fim a primeira do bloco.
    anon_bloco, servico_bloco = chaves_do_bloco(ref)
    anon_novo = next(
        (c for c in anon_bloco if c.startswith('sb_publishable_') and len(c) > 20), None
    )
    servico_novo = next(
        (c for c in servico_bloco if c.startswith('sb_secret_') and len(c) > 20), None
    )
    anon = next((c for c in chaves('NEXT_PUBLIC_SUPABASE_ANON_KEY') if ref_do_jwt(c) == ref), None)
    servico = next((c for c in chaves('SUPABASE_SERVICE_ROLE_KEY') if ref_do_jwt(c) == ref), None)
    return (
        token.group(1),
        ref,
        anon_novo or anon or (anon_bloco[0] if anon_bloco else None),
        servico_novo or servico or (servico_bloco[0] if servico_bloco else None),
    )


TOKEN, REF, ANON, SERVICO = carregar()


def api(sql, timeout=60):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': sql}).encode('utf-8'),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8')
            return json.loads(body) if body.strip() else []
    except urllib.error.HTTPError as err:
        raise RuntimeError(f'HTTP {err.code}: {err.read().decode("utf-8", "replace")[:400]}') from None


def rpc(funcao, payload, chave, timeout=30):
    """POST /rest/v1/rpc/<funcao> com a chave indicada (anon ou serviço)."""
    headers = {
        'apikey': chave,
        'Content-Type': 'application/json',
        'Accept-Profile': 'localizador',
        'Content-Profile': 'localizador',
    }
    # Só as chaves JWT (legado, `eyJ...`) vão também no Authorization; as
    # novas `sb_publishable_`/`sb_secret_` autenticam pelo `apikey`.
    if chave.startswith('eyJ'):
        headers['Authorization'] = f'Bearer {chave}'
    req = urllib.request.Request(
        f'https://{REF}.supabase.co/rest/v1/rpc/{funcao}',
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode('utf-8', 'replace')


def main():
    checks = []
    print(f'Projecto: {REF}')
    print(f'Chave anonima deste projecto: {"encontrada" if ANON else "NAO encontrada"}')
    print(f'Chave de servico deste projecto: {"encontrada" if SERVICO else "NAO encontrada"}')

    rows = api(
        f"""
        select n.nspname as schema, p.proname,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as autenticado,
               has_function_privilege('service_role', p.oid, 'execute') as servico
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('localizador', 'public')
           and p.proname in ({SQL_LISTA})
         order by 1, 2
        """
    )

    nomes = {r['proname'] for r in rows}
    checks.append(('as sete funções existem', nomes == set(FUNCOES)))
    if nomes != set(FUNCOES):
        print(f'  encontradas: {sorted(nomes)}')

    for r in rows:
        etiqueta = f"{r['schema']}.{r['proname']}"
        checks.append((f'{etiqueta}: anon sem EXECUTE', r['anon'] is False))
        checks.append((f'{etiqueta}: authenticated sem EXECUTE', r['autenticado'] is False))
        checks.append((f'{etiqueta}: service_role com EXECUTE', r['servico'] is True))

    # 4. O caminho real do ataque, com a chave anónima (JWT deste projecto).
    if ANON:
        status, corpo = rpc('webhook_claim_due', {'p_limit': 1, 'p_worker': 'teste-auditoria'}, ANON)
        checks.append(('REST anon recusa webhook_claim_due', status in (401, 403, 404)))
        print(f'  REST anon: HTTP {status} {corpo[:120]}')
    else:
        print('  (chave anonima deste projecto ausente em credenciais.txt — teste REST omitido)')

    # 5. A mesma chamada com a chave de serviço: o cron continua a funcionar.
    if SERVICO:
        status, corpo = rpc(
            'webhook_claim_due', {'p_limit': 0, 'p_worker': 'teste-auditoria'}, SERVICO
        )
        ok = status == 200 and corpo.strip() in ('[]', '')
        checks.append(('REST service_role executa webhook_claim_due', ok))
        print(f'  REST servico: HTTP {status} {corpo[:80]}')
    else:
        try:
            out = api("select localizador.webhook_claim_due(0, 'teste-auditoria') as res")
            checks.append(('service_role executa webhook_claim_due (gestão)', isinstance(out, list)))
        except RuntimeError as err:
            checks.append(('service_role executa webhook_claim_due (gestão)', False))
            print(f'  erro: {err}')

    print('\nVerificações:')
    for label, passed in checks:
        print(f'  {"[OK]  " if passed else "[FALHA]"} {label}')

    return 0 if all(p for _, p in checks) else 1


if __name__ == '__main__':
    sys.exit(main())
