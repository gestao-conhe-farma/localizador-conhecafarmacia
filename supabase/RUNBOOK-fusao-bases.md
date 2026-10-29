# Runbook — fusão das bases do Localizador

Estado a 29/10/2026: **schema e dados já estão no projecto principal**. O que
falta é o corte de tráfego. Plano completo em
`docs/2026-10-28-contas-utilizador-partilhadas.md`.

Projecto principal: `tbqsazriorqzexjwhekw` (site + conta + schema
`localizador`). Projecto antigo: `mxqhmtpshlpnbkninawt` (só leitura daqui para
a frente; pausar, não apagar, durante 30 dias).

## O que já está feito (não repetir)

- Baseline `0045_schema_localizador_baseline.sql` aplicado: 25 tabelas, 2
  views, 30 funções, 30 policies, 7 triggers, `pg_trgm` e `pg_cron`.
- `0046_user_favorites.sql` e `0047_reservation_user.sql` aplicados
  (`localizador.favorites`, `localizador.reservations.user_id`).
- Dados copiados; contagens iguais às da origem e 0 FKs órfãs.
- PostgREST expõe `public, localizador, graphql_public`; privilégios e default
  privileges para `anon`, `authenticated` e `service_role`.
- `localizador.stock_items` e `localizador.reservations` na publicação
  `supabase_realtime`.
- Bucket `drug-images` (público, 2 MB, jpeg/png/webp).
- 5 contas de teste: 3 com o mesmo `id` e hash; 2 já existiam no site e
  ficaram com o `id` do site (`conhecerfarmacia@gmail.com`,
  `baptistalimab@gmail.com`) — essas usam a palavra-passe do site principal.

## Corte (Task 7.3)

Feito a 29/10/2026 pelo CLI (Vercel + Management API do Supabase).

1. **Variáveis de ambiente — feito.** Projecto Vercel `localizador-conhecafarmacia`
   (equipa `gestao-conhecafarmacia`), Production **e** Preview:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://tbqsazriorqzexjwhekw.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon do projecto principal>
   SUPABASE_SERVICE_ROLE_KEY=<service role do projecto principal>
   NEXT_PUBLIC_CONTA_URL=https://conta.conhecafarmacia.com
   NEXT_PUBLIC_COOKIE_DOMAIN=.conhecafarmacia.com   # só Production; vazio em Development
   ```

   `NEXT_PUBLIC_COOKIE_DOMAIN` fica **fora de Preview**: em `*.vercel.app` o
   browser recusa o domínio pai e o login deixa de funcionar nas previews.
   `NEXT_PUBLIC_*` é inlined no build e qualquer variável da Vercel só chega a
   um deployment novo: **sem deploy, o corte não existe**.

2. **Cron jobs — feito** (base `tbqs…`, via `cron.schedule`):
   `expire-stale-reservations` (`*/15 * * * *`, `localizador.reservations`) e
   `webhook-deliveries` (`* * * * *`, `net.http_get` para
   `/api/cron/webhooks?worker=pg_cron`).

   O segredo `cron_webhook_secret` **não existia** no Vault do projecto antigo —
   e por isso o job `webhook-deliveries` de lá devolvia `0 rows` a cada minuto
   desde sempre (o `where exists` cortava o GET). Nunca houve entrega de
   webhook por cron em produção, e `public.webhook_deliveries` estava vazia.

   Em vez de copiar, **gerou-se um segredo novo** (`crypto.randomBytes(32)`,
   64 hex) e ficou nos dois lados: `CRON_SECRET` na Vercel (Production e
   Preview, tipo Secret) e `cron_webhook_secret` no Vault do projecto novo.
   Os dois valores têm de continuar iguais — para os verificar, comparar
   `md5(decrypted_secret)` com a hash do valor da Vercel.

3. **Falta: o deploy.** Até haver um deployment novo, produção serve a base
   antiga com o `CRON_SECRET` antigo, e o job `webhook-deliveries` regista
   **401** por minuto (é o esperado; pára no deploy). Se o corte for adiado
   mais de um dia, desagendar até lá: `select cron.unschedule('webhook-deliveries');`

4. Testar, por esta ordem: `/pesquisa` → `/produto/<id>` → `/farmacia/<slug>` →
   reserva pública → login do portal → `/portal/stock` → realtime →
   `/interno` (MFA) → `conta.*/entrar` → `/guardados` → `/reservas`.
   Confirmar também `select status_code from net._http_response order by created desc limit 3;`
   na base nova: depois do deploy tem de dar **200**.

## Verificação rápida em SQL

```sql
-- contagens por tabela (comparar com o projecto antigo)
select relname,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from localizador.%I', relname),
                           false, true, '')))[1]::text::int as linhas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'localizador' and c.relkind = 'r'
 order by 1;

-- nada aponta para o projecto antigo
select count(*) from localizador.drug_brand_images where image_path like '%mxqhmtpsh%';
select count(*) from localizador.pharmacies where logo_url like '%mxqhmtpsh%';
```

## Notas de dados do corte

- Contagens iguais à origem em todas as tabelas. As diferenças de `user_id`
  (reservas) e `actor_user_id` (movimentos) são o remapeamento deliberado de
  contas — ver `_temp/fusao/id-map.json` (as 2 contas que já existiam no site).
- `confirmed_at` é a única coisa que se move sozinha: a reconfirmação diária
  (03:00) reescreve-o. No dia do corte, 238 das 246 linhas da base nova ficaram
  com o valor de 29/10 03:23 (uma passagem de reconfirmação correu contra ela),
  enquanto na origem 237 dessas linhas ainda tinham 28/10 03:23. A linha que a
  origem reconfirmou depois da cópia (`d383e4ca…`) foi sincronizada à mão para
  o valor da origem.

## Rollback

Repor as variáveis antigas na Vercel do Localizador e redeploy. A base antiga
fica intacta (pausada) durante 30 dias — não apagar antes disso.
