-- ============================================================
-- 0026 · Agenda do worker de webhooks (pg_cron + pg_net)
--
-- Porquê aqui e não na Vercel: o plano Hobby só aceita cron diário
-- («Hobby accounts are limited to daily cron jobs») e recusa o deploy de
-- `"* * * * *"` — mas a fila da 0025 precisa de um tick de minuto a
-- minuto, porque o backoff começa nos 5 segundos (lib/webhooks.js).
-- O agendamento passa para o lado da base de dados, onde o pg_cron já
-- corre (`expire-stale-reservations`, 0010), e o `pg_net` faz o GET
-- autenticado ao worker `app/api/cron/webhooks`.
--
-- O URL é o de produção (lib/constants.js → SITE_URL): o agendador vive
-- no cluster do Supabase e não tem pedido nenhum de onde tirar um
-- endereço relativo.
--
-- SEGREDO — passo manual, uma vez, e só depois do deploy:
--   Dashboard → Integrations → Vault → criar o segredo
--   `cron_webhook_secret` com o MESMO valor de CRON_SECRET da Vercel.
--   O valor não passa por aqui: `cron.job` é legível por quem administra
--   a base de dados e um segredo em claro neste ficheiro era um segredo
--   a mais a rodar. O job só dispara quando o segredo existir — sem ele
--   não há Bearer para apresentar e um 401 por minuto só sujava os
--   registos.
--
-- Aplicar: python scripts/apply-migration.py supabase/migrations/0026_webhook_cron.sql
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 1. Um GET por minuto ao worker
--    Idempotente: desagendar antes de (re)agendar, como na 0010.
--
--    Timeout 30 s (o pg_net é assíncrono): 20 entregas com servidores de
--    farmácia lentos não cabem nos 5 s por omissão. Quem perde o pedido
--    é o cliente HTTP, não a drenagem — essa já correu do lado do
--    worker.
--
--    `btrim(…, E' \n\r\t')` protege contra o espaço ou a linha nova que
--    vem colada quando se copia o segredo para o Vault: sem isto o
--    cabeçalho levava um Bearer inválido e o worker respondia 401 sem
--    que nada no registo explicasse porquê.
-- ------------------------------------------------------------
select cron.unschedule('webhook-deliveries')
where exists (select 1 from cron.job where jobname = 'webhook-deliveries');

select cron.schedule(
  'webhook-deliveries',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://localizador.conhecafarmacia.com/api/cron/webhooks?worker=pg_cron',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || btrim(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_webhook_secret'),
        E' \n\r\t'
      ),
      'User-Agent', 'pg_net (Supabase cron)'
    ),
    timeout_milliseconds := 30000
  ) as request_id
  where exists (
    select 1 from vault.decrypted_secrets where name = 'cron_webhook_secret'
  )
  $$
);
