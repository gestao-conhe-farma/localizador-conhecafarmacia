#!/usr/bin/env python
"""Testes de integração de autorização/RLS/RPC (achado M9).

Corre contra a base real com a chave pública (anon) e com a chave de
serviço, e simula um utilizador autenticado sem linhas para provar as
policies. Cobre o que os testes unitários não vêem:

  * `anon` só lê a view pública e não vê as colunas sensíveis (M3);
  * tabelas fechadas (reservas, equipa, chaves, webhooks, contadores de
    login, auditoria) não devolvem linhas a `anon`;
  * RPCs internas recusam `anon` (G1) e as públicas continuam a
    responder (a 0062 não fechou o que a UI usa);
  * um `authenticated` sem linhas não vê reservas, favoritos nem
    `admin_users`, e não escreve em tabelas fechadas (M9);
  * `service_role` continua a poder consumir o rate limit de login (M5).

O guard do segundo factor (`aal1` a escrever no portal) tem teste
próprio, sem rede: `node scripts/smoke-portal-mfa.mjs`.

Uso: python scripts/test-authorization.py
Saída: 0 = tudo passou; 1 = falhou.
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

TABELAS_FECHADAS = [
    'reservations',
    'favorites',
    'pharmacy_staff',
    'admin_users',
    'pharmacy_api_keys',
    'webhook_deliveries',
    'stock_movements',
    'stock_items',
    'stock_sale_options',
    'auth_failures',
    'auth_rate_windows',
    'platform_audit_log',
]

RPC_INTERNAS = [
    ('webhook_claim_due', {'p_limit': 1, 'p_worker': 'teste-m9'}),
    ('lead_rate_consume', {'p_ip': '203.0.113.9', 'p_limit': 5}),
    ('auth_rate_consume', {'p_scope': 'teste', 'p_chave': 'm9', 'p_limit': 5}),
    ('platform_pharmacy_overview', {}),
]


def ler_chaves(nome):
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    return [v.strip().strip('"').strip("'") for v in re.findall(rf'{nome}\s*=\s*([^\s#]+)', txt)]


def carregar():
    with open('credenciais.txt', 'r', encoding='utf-8') as f:
        txt = f.read()
    token = re.search(r'(sbp_[A-Za-z0-9]{20,})', txt)
    ref = re.search(r'https://([a-z0-9]{16,})\.supabase\.co', txt)
    if not token or not ref:
        print('ERRO: token/URL do Supabase nao encontrados em credenciais.txt')
        sys.exit(1)
    ref = ref.group(1)

    # O bloco do projecto começa em «Access Token do <prefixo>»; as chaves
    # novas (sb_publishable_/sb_secret_) são as válidas.
    marca = re.search(rf'Access Token do {re.escape(ref[:6])}', txt)
    bloco = txt[marca.start():] if marca else txt
    anon = re.search(r'NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(sb_publishable_[A-Za-z0-9_-]{20,})', bloco)
    servico = re.search(r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*(sb_secret_[A-Za-z0-9_-]{20,})', bloco)
    if not anon or not servico:
        print('ERRO: chaves novas do projecto nao encontradas em credenciais.txt')
        sys.exit(1)
    return token.group(1), ref, anon.group(1), servico.group(1)


TOKEN, REF, ANON, SERVICO = carregar()


def sql(query, timeout=60):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=json.dumps({'query': query}).encode('utf-8'),
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode('utf-8', 'replace')
            return json.loads(body) if body.strip() else []
    except urllib.error.HTTPError as err:
        raise RuntimeError(err.read().decode('utf-8', 'replace')[:300]) from None


def rest(tabela, query, chave, metodo='GET', corpo=None, timeout=30):
    headers = {
        'apikey': chave,
        'Accept-Profile': 'localizador',
        'Content-Type': 'application/json',
        'Content-Profile': 'localizador',
    }
    if chave.startswith('eyJ'):
        headers['Authorization'] = f'Bearer {chave}'
    req = urllib.request.Request(
        f'https://{REF}.supabase.co/rest/v1/{tabela}?{query}',
        data=json.dumps(corpo).encode('utf-8') if corpo is not None else None,
        headers=headers,
        method=metodo,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode('utf-8', 'replace')


def rpc(funcao, payload, chave, timeout=30):
    return rest(f'rpc/{funcao}', '', chave, metodo='POST', corpo=payload, timeout=timeout)


def sql_como_authenticated(select_sql):
    """Executa um SELECT como um utilizador autenticado sem linhas."""
    return sql(
        f"""
        begin;
        set local role authenticated;
        select set_config(
          'request.jwt.claims',
          '{{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}}',
          true
        );
        {select_sql};
        rollback;
        """
    )


def main():
    checks = []

    def check(nome, ok, detalhe=''):
        checks.append((nome, bool(ok)))
        print(f'  {"[OK]  " if ok else "[FALHA]"} {nome}{"" if ok else " — " + str(detalhe)[:160]}')

    print(f'Projecto: {REF}\n')

    # ---- M3: view pública certa, view completa fechada a anon ----
    status, corpo = rest('stock_public', 'select=*&limit=1', ANON)
    linha = (json.loads(corpo) if status == 200 and corpo.strip() else [{}])
    linha = linha[0] if linha else {}
    check('anon lê stock_public', status == 200 and isinstance(linha, dict), f'HTTP {status}')
    check(
        'stock_public não expõe colunas sensíveis',
        not ({'quantity', 'expires_at', 'source', 'synced_at'} & set(linha)),
        sorted(set(linha) & {'quantity', 'expires_at', 'source', 'synced_at'}),
    )
    for coluna in ('quantity', 'expires_at', 'source', 'synced_at'):
        st, _ = rest('stock_public', f'select={coluna}&limit=1', ANON)
        check(f'anon não lê stock_public.{coluna}', st in (400, 401, 403), f'HTTP {st}')

    st, corpo = rest('stock_confirmed', 'select=drug_id&limit=1', ANON)
    check('anon não lê stock_confirmed', st in (401, 403, 404), f'HTTP {st} {corpo[:80]}')

    # ---- RLS: tabelas fechadas sem linhas para anon ----
    for tabela in TABELAS_FECHADAS:
        st, corpo = rest(tabela, 'select=*&limit=1', ANON)
        vazio = False
        if st == 200:
            try:
                vazio = json.loads(corpo or '[]') == []
            except ValueError:
                vazio = False
        check(f'anon sem acesso a {tabela}', st in (401, 403, 404) or vazio, f'HTTP {st} {corpo[:60]}')

    # ---- RPCs: internas fechadas, pública aberta ----
    for funcao, payload in RPC_INTERNAS:
        st, corpo = rpc(funcao, payload, ANON)
        check(f'anon não executa {funcao}', st in (401, 403, 404), f'HTTP {st} {corpo[:80]}')

    rows = sql(
        """select p.proname
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'localizador'
             and p.proname in ('post_stock_change', 'reservation_hold_units')
             and has_function_privilege('anon', p.oid, 'execute')"""
    )
    check('anon não executa funções de escrita de stock', rows == [], rows)

    st, corpo = rpc('pharmacy_stock_counts', {}, ANON)
    check('RPC pública pharmacy_stock_counts responde', st == 200, f'HTTP {st} {corpo[:80]}')

    # ---- Utilizador autenticado sem linhas: policies de isolamento ----
    for tabela, etiqueta in (
        ('reservations', 'reservas'),
        ('favorites', 'favoritos'),
        ('admin_users', 'perfis'),
    ):
        try:
            rows = sql_como_authenticated(f'select count(*)::int as n from localizador.{tabela}')
            n = rows[0]['n'] if rows else None
            check(f'autenticado sem linhas não vê {etiqueta}', n == 0, rows)
        except RuntimeError as err:
            check(f'autenticado sem linhas não vê {etiqueta}', False, err)

    # Escrita directa numa tabela fechada tem de ser recusada.
    try:
        sql_como_authenticated(
            "insert into localizador.system_alerts (kind, title) values ('teste-m9', 'teste')"
        )
        check('autenticado não escreve em system_alerts', False, 'o insert passou')
    except RuntimeError as err:
        check('autenticado não escreve em system_alerts', 'permission denied' in str(err), err)

    # ---- M5: service_role consome o contador; anon não ----
    chave_teste = f'm9-{REF[:6]}'
    st, corpo = rpc(
        'auth_rate_consume',
        {'p_scope': 'teste', 'p_chave': chave_teste, 'p_limit': 3, 'p_window_seconds': 60},
        SERVICO,
    )
    ok = st == 200
    if ok:
        try:
            ok = json.loads(corpo).get('allowed') is True
        except ValueError:
            ok = False
    check('service_role executa auth_rate_consume', ok, f'HTTP {st} {corpo[:80]}')
    try:
        sql(f"delete from localizador.auth_rate_windows where scope = 'teste' and chave = '{chave_teste}'")
    except RuntimeError:
        pass

    # ---- Resultado ----
    falhas = [n for n, ok in checks if not ok]
    print(f'\n═══ RESULTADO: {len(checks) - len(falhas)}/{len(checks)} passaram ═══')
    if falhas:
        for n in falhas:
            print(f'  ❌ {n}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
