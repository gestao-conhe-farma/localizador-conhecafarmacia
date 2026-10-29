-- Alertas de sistema na área interna. O primeiro é o backup semanal.
--
-- O `.github/workflows/backup-db.yml` é o único backup que existe (§9.1 de
-- docs/2026-10-28-contas-utilizador-partilhadas.md). Um backup que parte em
-- silêncio é pior do que não ter nenhum, por isso o workflow avisa este
-- sítio quando falha e volta a fechá-lo quando corre bem — o alerta
-- desaparece sozinho na primeira execução verde, sem ninguém carregar em
-- nada.
--
-- Quem ESCREVE é `/api/interno/alertas`, com o segredo
-- `INTERNO_ALERT_SECRET` e o cliente service-role. Quem LÊ é `/interno`,
-- também com service-role. Não há policies de propósito: é estado
-- operacional da equipa, não é dado de farmácia, e não há nada disto que
-- deva ser alcançável com o token de um utilizador.

create table localizador.system_alerts (
  id uuid primary key default gen_random_uuid(),
  -- 'backup' hoje. O check não fecha a porta a um segundo tipo amanhã.
  kind text not null,
  title text not null,
  body text,
  url text,
  -- Origem do aviso (o run do GitHub Actions). Repetir o mesmo aviso duas
  -- vezes — retry do workflow, por exemplo — não cria duas linhas.
  dedupe text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- 'auto' quando foi uma execução verde a fechar. Não há botão de fechar
  -- à mão: quem resolve um backup é o backup, não uma pessoa.
  resolved_by text
);

create unique index system_alerts_dedupe_idx
  on localizador.system_alerts (kind, dedupe)
  where dedupe is not null;

-- O ecrã só pergunta pelos abertos, do mais recente para o mais antigo.
create index system_alerts_abertos_idx
  on localizador.system_alerts (kind, opened_at desc)
  where resolved_at is null;

alter table localizador.system_alerts enable row level security;

revoke all on localizador.system_alerts from anon, authenticated;

comment on table localizador.system_alerts is
  'Alertas operacionais da equipa (0048): escritos por /api/interno/alertas e lidos em /interno, sempre com service-role. Sem policies.';
