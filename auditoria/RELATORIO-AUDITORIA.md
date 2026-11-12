# Relatório de auditoria de segurança — Conheça Farmácia · Localizador

**Data:** 11 de novembro de 2026
**Âmbito:** `conheca-farmacia-localizador` (site público do Localizador, portal da farmácia, consola `/interno`, API de ingestão e webhooks)
**Modo:** só leitura. Nenhum ficheiro do projeto foi alterado; este relatório é o único artefacto criado.
**Método:** revisão manual do código, das migrações SQL e da configuração. Não foi executado nenhum teste contra produção nem contra uma instância local com dados reais.

---

## 1. Resumo executivo

O projeto tem uma postura de segurança claramente acima da média para o seu tamanho: RLS activa em todas as tabelas, separação de papéis na consola, MFA obrigatório para o `gerente` da farmácia, webhooks com HMAC e proteção anti-SSRF, chaves de API guardadas com hash e pepper, livro-razão de stock append-only e nenhum segredo no repositório ou no histórico.

O problema central encontrado não é a ausência de controlos, mas **controlos que existem só na camada de UI**. O segundo factor do gerente e o perfil de balcão são verificados em `layout.js` (que protege páginas), mas as Server Actions — que são endpoints POST reais — não os revalidam. Quem tiver a password da conta da farmácia consegue escrever stock, reservas, equipa e chaves de integração sem TOTP e sem PIN.

Há um achado **grave**: as funções `SECURITY DEFINER` de stock e de webhooks foram recriadas na migração `0045` **sem qualquer `REVOKE`**, e a migração `0051` documenta, no próprio repositório, que na Supabase isso deixa o `EXECUTE` implícito com `anon` e `authenticated`. Na prática, qualquer visitante com a chave anónima pode executar `webhook_claim_due` (que devolve os segredos HMAC das farmácias) ou `log_stock_movement` (que forja o livro-razão). Falta apenas a consulta de confirmação na base de dados.

### Contagens

| Severidade | Achados | Nota |
|---|---:|---|
| 🔴 Graves | 1 | Confirmado pela construção das migrações; falta a consulta final a `has_function_privilege` |
| 🟠 Altos | 1 | Confirmado |
| 🟡 Médios | 9 | 8 confirmados; 1 depende de o seed ter sido aplicado em produção |
| 🔵 Baixos | 6 | Confirmados |
| **Total** | **17** | |

### Veredito

**Aprovado com correções obrigatórias antes de crescer.** A base de dados está bem fechada e os fluxos sensíveis (webhooks, ingestão, plataforma) foram escritos com cuidado. O que falta é **uniformizar a autorização no servidor**: hoje a UI é a fronteira de segurança em dois controlos importantes. G1 tem de ser confirmado ou descartado esta semana; A1 deve ser corrigido antes de a conta da farmácia ser partilhada por mais pessoas.

---

## 2. Arquitetura observada

- **Next.js 16.2.11** (App Router, Server Components, Server Actions), React 19, Tailwind 4.
- **Supabase** com dois schemas: `public` (site, contas, farmácias, catálogo, stock, reservas, leads) e `localizador` (subscrições, convites, auditoria, pedidos de farmácia).
- **Quatro áreas de autenticação**, cada uma com o seu cookie e o seu cliente Supabase: `conta.*` (cookie partilhado), portal da farmácia, consola `/interno`, e o site público (anon).
- **Portal da farmácia**: conta Supabase (email + password) → TOTP para `gerente` (aal2) → perfil de balcão com PIN (cookie `portal-staff` assinado por HMAC).
- **Consola `/interno`**: Supabase + `admin_users` + MFA obrigatório + motivo obrigatório em cada escrita + auditoria append-only.
- **Integrações**: API de ingestão `cfk_…` (hash + pepper, scopes, rate limit, idempotência) e webhooks de saída (HMAC Standard Webhooks, DNS fixado, idempotência em BD).
- **Operação**: cron de reconfirmação de stock e cron de entrega de webhooks, ambos com segredo dedicado; backup semanal por `pg_dump` em GitHub Actions.

---

## 3. Achados

### 🔴 G1 — Funções `SECURITY DEFINER` de stock e webhooks estão executáveis por `anon`

**Onde**
- `supabase/migrations/0045_schema_localizador_baseline.sql:523` (`log_stock_movement`), `:916` (`stock_lot_apply`), `:1014` (`stock_lot_sync_expiry`), `:1058` (`webhook_claim_due`), `:1184` (`webhook_prune`), `:1204` (`webhook_record_attempt`), `:1296` (`webhook_replay`) — o baseline **recria as funções em `localizador` sem um único `GRANT`/`REVOKE`** (o ficheiro não tem nenhuma linha `GRANT` ou `REVOKE`).
- `supabase/migrations/0020_stock_movements.sql:282`, `0021_stock_lots_fefo.sql:116/226`, `0025_webhook_delivery.sql:363/469/521/543` — as versões anteriores faziam apenas `revoke ... from public`, que a `0051` veio demonstrar ser insuficiente.
- `supabase/migrations/0051_lead_rate_consume_service_only.sql:14-17` — o próprio projeto documenta que, na Supabase, `revoke ... from public` **não** remove o `EXECUTE` que `anon` e `authenticated` recebem por `ALTER DEFAULT PRIVILEGES`; por isso é que a 0051 acrescenta `from anon, authenticated`.
- Contraste: `0029_platform_pharmacy_overview.sql:160` e `0039_interno_stock_por_categoria.sql:151` fazem o `revoke ... from public, anon, authenticated` correcto — o padrão certo existe no repo, só não foi aplicado a estas funções.

**Quem explora:** qualquer visitante. Basta a chave `anon` (que é pública, por design) e um `POST` para `/rest/v1/rpc/<função>`.

**Como**
```
POST https://<ref>.supabase.co/rest/v1/rpc/webhook_claim_due
apikey: <anon>
Content-Type: application/json

{ "p_limit": 50 }
```
Se o `EXECUTE` de `anon` ainda existir, a resposta inclui as linhas reclamadas com `url` e `secret` (o segredo HMAC de cada farmácia). O mesmo caminho permite `log_stock_movement` (forjar movimentos de qualquer farmácia, incluindo disparar webhooks) e `stock_lot_apply` (alterar lotes e validades).

**Impacto:** leitura de segredos HMAC de todas as farmácias (permite forjar webhooks válidos para os seus endpoints), corrupção do livro-razão de stock e alteração de lotes/validades. Se confirmado, sobe a **Grave**: é acesso sem conta a segredos e a escrita de dados de negócio.

**Correção** (assinaturas exactas do baseline)
```sql
revoke execute on function localizador.log_stock_movement(
  uuid, uuid, uuid, text, integer, integer, integer, text, text, text, text, text, uuid, uuid, text, uuid, jsonb
) from anon, authenticated;
revoke execute on function localizador.stock_lot_apply(uuid, integer, text, date, text, text) from anon, authenticated;
revoke execute on function localizador.stock_lot_sync_expiry(uuid) from anon, authenticated;
revoke execute on function localizador.webhook_claim_due(integer, text) from anon, authenticated;
revoke execute on function localizador.webhook_record_attempt(
  uuid, integer, text, integer, boolean, integer, boolean, boolean, text
) from anon, authenticated;
revoke execute on function localizador.webhook_replay(uuid, uuid) from anon, authenticated;
revoke execute on function localizador.webhook_prune(integer) from anon, authenticated;
-- e o mesmo para as versões que ainda existam em public
```
Confirmar antes e depois:
```sql
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname in ('localizador','public')
  and p.proname in ('log_stock_movement','stock_lot_apply','stock_lot_sync_expiry',
                    'webhook_claim_due','webhook_record_attempt','webhook_replay','webhook_prune')
  and has_function_privilege(r.rolname, p.oid, 'execute');
```
Se a consulta devolver zero linhas para `anon`, este achado fecha-se como falso positivo e passa a "bem implementado". **Confiança: alta** — a `0045` cria as funções sem `REVOKE` e a `0051` prova, com um caso real do mesmo projeto, que isso deixa `anon` executar; falta só confirmar que não houve um `ALTER DEFAULT PRIVILEGES` fora das migrações.

**Esforço:** minutos (uma migração + verificação).

---

### 🟠 A1 — O segundo factor do gerente é verificado no layout, não nas Server Actions

**Onde**
- `app/portal/(dashboard)/layout.js:42-43` — único sítio que exige `session.mfa.currentLevel === 'aal2'` para `staff.role === 'gerente'`.
- `lib/actions/pharmacy-portal.js:231` (`updateStockItem`), `:1905` (`setReservationStatus`), `:757` (`addStockUnits`), `:1285` (`validatePendingDrug`), entre outras.
- `lib/actions/pharmacy-staff.js:385` (`createStaffProfile`) e restantes acções de gestão.
- `lib/actions/integration.js` — criação de chaves de API e webhooks.
- `lib/actions/pharmacy-mfa.js:173` (`desativarMfaPortal`) — pede apenas `password` e a sessão da farmácia; não verifica `aal2` nem o papel.

**Quem explora:** quem tenha o email e a password da conta da farmácia (ex.: password partilhada, reutilizada, ou obtida por phishing), mas não o TOTP do gerente.

**Como**
1. `POST /portal/login` com email + password → sessão `aal1`.
2. A página `/portal` redireciona para `/portal/mfa`, mas as acções não passam por essa página. O atacante extrai o id da acção do bundle e faz `POST /portal` (ou qualquer rota do portal) com o header `Next-Action` e o corpo esperado, com os cookies da sessão. O Next valida a origem, não o `aal2` nem o perfil.
3. Alternativa mais simples e permanente: chamar `desativarMfaPortal` com a password. A acção faz `signInWithPassword` + `unenroll`, e a partir daí o layout deixa de pedir `aal2` porque a conta já não tem factor.

**Impacto:** o MFA do papel com mais poder no portal (o gerente, que aprova fármacos, cria perfis, gere chaves de integração e vê vendas) deixa de proteger escritas. Com a password, um atacante altera stock e reservas, cria perfis de balcão e chaves de API, e remove o factor de vez. Isto anula o controlo SEC-ATH-06 descrito na documentação do projeto.

**Correção**
- Criar um guard único, `requireManagerAal2()`, e chamá-lo no início de **todas** as acções de escrita do portal, não só nas de gerente:
  ```js
  // lib/pharmacy-session.js
  export async function requireAal2(session) {
    if (session?.mfa?.currentLevel !== 'aal2') return { ok: false, error: 'MFA_NECESSARIO' }
    return { ok: true }
  }
  ```
  Aplicar em `updateStockItem`, `setReservationStatus`, `addStockUnits`, `setSaleOptions`, `createStaffProfile`, `updateStaffProfile`, `resetStaffPin`, `createDrug`, `validatePendingDrug`, `createApiKey`, `createWebhook`, etc.
- Em `desativarMfaPortal`, exigir `aal2` **antes** de pedir a password (e não voltar a autenticar com a mesma password, que rebaixa a sessão a `aal1`). Alternativa: retirar a auto-desactivação e passar a exigir um pedido à equipa CF.
- O `layout.js` mantém-se como UX (redireccionar cedo), mas deixa de ser a fronteira.

**Esforço:** horas.

---

### 🟡 M1 — Escritas do portal não exigem perfil de balcão (o PIN não é autorização)

**Onde:** `lib/actions/pharmacy-portal.js:231` (`updateStockItem`), `:1905` (`setReservationStatus`), `:757` (`addStockUnits`), `:2044` (`markClientContacted`). Todos usam `getActiveStaff(session)` apenas para atribuir `p_staff_id`; nenhum devolve erro quando não há perfil.

**Quem explora:** quem tem a sessão da conta da farmácia mas não o PIN de um perfil.

**Como:** chamar a acção directamente com o cookie da farmácia, sem o cookie `portal-staff`. A escrita passa e fica sem autor.

**Impacto:** o PIN de 4 dígitos é apresentado como controlo de acesso ao balcão (`/portal/perfis`), mas só a UI o exige. Um terminal partilhado com a sessão aberta permite escrever sem identificar ninguém. É também o que torna A1 mais fácil de explorar.

**Correção:** em cada acção de escrita, exigir `const staff = await getActiveStaff(session); if (!staff) return { ok: false, error: 'SEM_PERFIL' }`. Para acções de gerente, `requireManagerStaff()`.

**Esforço:** horas.

---

### 🟡 M2 — Enumeração de contas na reposição de senha

**Onde:** `lib/actions/pharmacy-recovery.js:247`, `:256`, `:271` — devolvem `SEM_CONTA` quando o email não existe ou não é de farmácia.

**Quem explora:** qualquer pessoa, sem conta.

**Como:** submeter uma lista de emails no passo 1 e observar a resposta.

**Impacto:** confirma quais emails têm conta no portal da farmácia — matéria-prima para phishing dirigido a farmácias.

**Correção:** responder sempre «Se existir conta, enviámos um código» e manter a distinção apenas nos logs internos (sem email na mensagem). O passo seguinte (código) já distingue naturalmente.

**Esforço:** minutos.

---

### 🟡 M3 — A view pública `stock_confirmed` expõe inventário exacto ao `anon`

**Onde:** definição da view em `supabase/migrations/0045_schema_localizador_baseline.sql` (~`:2145`), com `quantity`, `expires_at`, `source`, `synced_at`, `freshness_minutes`; grant de `select` a `anon` em `0001` (`:270`). O grant sobrevive às recriações da view.

**Quem explora:** qualquer visitante com a chave anónima (pública).

**Como:**
```
GET /rest/v1/stock_confirmed?select=pharmacy_name,drug_name,quantity,expires_at,source&limit=1000
```

**Impacto:** o inventário exacto de cada farmácia, a validade dos lotes e a origem do dado ficam públicos, apesar de a UI só mostrar «disponível / esgotado». É informação competitiva e de negócio que o produto decidiu não mostrar.

**Correção:** criar uma view pública só com o que a UI usa (`drug_id`, `pharmacy_id`, `in_stock`, `price`, `confirmed_at`, `freshness_minutes`) e revogar o `select` da view completa a `anon`; ou usar grants por coluna. Manter a versão completa apenas para o portal autenticado.

**Esforço:** horas.

---

### 🟡 M4 — «Sair» não revoga o refresh token no servidor

**Onde:** `lib/supabase/sign-out.js` (e os `sair` de conta, portal e plataforma) usam `scope: 'local'`; o comentário assume o risco.

**Quem explora:** quem consiga copiar o refresh token (XSS, extensão, backup de perfil do browser, terminal partilhado).

**Como:** depois de o utilizador sair, reutilizar o refresh token guardado; continua válido até expirar.

**Impacto:** uma sessão «terminada» pode ser ressuscitada. Num balcão partilhado, o token do turno anterior continua utilizável.

**Correção:** usar `signOut()` global quando a área não precisa de manter as outras sessões, ou oferecer «terminar sessão em todos os dispositivos»; encurtar a validade do refresh token no projeto Supabase; documentar a exceção onde o `local` for mesmo necessário.

**Esforço:** horas.

---

### 🟡 M5 — Login sem limite próprio e sem registo persistente de falhas

**Onde:** `lib/actions/pharmacy-portal.js` (`loginPharmacy`) e `lib/actions/platform-auth.js:51` (`loginPlatform`). Não há rate limit por IP/conta; as falhas vão para os logs da Vercel (`logWarn`), não para uma tabela consultável.

**Quem explora:** atacante com lista de passwords.

**Como:** password spraying contra o GoTrue. O limite efectivo é o do projeto Supabase (global, não por conta), e não há alarme no `/interno`.

**Impacto:** brute force/credential stuffing sem deteção; indisponibilidade de login para todos se o limite global for atingido.

**Correção:** reutilizar o padrão atómico de `lead_rate_consume` para um `auth_rate_consume(scope, chave, janela, limite)` com chaves `ip` e `conta`; gravar falhas numa tabela `auth_failures` (ou no `platform_audit_log` para a consola) e abrir alerta após N falhas.

**Esforço:** horas.

---

### 🟡 M6 — A farmácia aprova os seus próprios fármacos no catálogo público

**Onde:** `lib/actions/pharmacy-portal.js:1285` (`validatePendingDrug`) — o gerente da própria farmácia aprova o fármaco que criou, e a acção usa o cliente de serviço para o activar. O comentário acima diz que «a farmácia, sozinha, não pode activar fármacos»; o código faz exactamente isso.

**Quem explora:** gerente da farmácia.

**Como:** `createDrug` → `validatePendingDrug` com `decision: 'aprovar'` → o fármaco fica `active` e visível a todos.

**Impacto:** o catálogo público passa a aceitar nomes de produtos sem revisão da equipa CF, ao contrário do que a documentação promete. Risco de informação de saúde incorrecta e de poluição do catálogo.

**Correção:** remover a aprovação do lado da farmácia (deixar só `recusar`/pedir alterações) e criar uma acção de plataforma `drug.approve` com a permissão `catalogue.manage`; ou assumir explicitamente que a moderação é da farmácia e corrigir os comentários/documentação.

**Esforço:** horas.

---

### 🟡 M7 — O cookie `MARCADOR` da reposição é escrito e nunca verificado

**Onde:** `lib/actions/pharmacy-recovery.js:50` (`MARCADOR = 'portal_recuperacao'`), `:112` (`marcarReposicao`), `:328` e `:444`. Nenhum passo lê o valor para autorizar `definirSenha`/`confirmarTotp`.

**Quem explora:** quem tenha uma sessão válida do portal (ex.: terminal deixado aberto).

**Como:** chamar directamente `definirSenha` com a nova password, sem passar pelo código de email. O marcador existe mas não é consultado.

**Impacto:** o passo «prova de posse do email» pode ser saltado por quem já tem sessão; a recuperação deixa de provar o que diz provar.

**Correção:** ler o marcador em `definirSenha` e `confirmarTotp` e exigir o valor que `marcarReposicao` escreveu; ou remover o cookie e basear a autorização num token assinado de uso único emitido no passo do código.

**Esforço:** minutos.

---

### 🟡 M8 — Credencial de demonstração com o email institucional (a confirmar)

**Onde:** `supabase/seed_demo_portal.sql:42` — «E-mail/senha do demo: `geral@conhecafarmacia.com` / `Demo2026!`», e a secção 3 liga esse utilizador a uma farmácia de demonstração.

**Quem explora:** qualquer pessoa que leia o repositório (se o seed tiver sido aplicado a produção).

**Como:** login com essas credenciais.

**Impacto:** se a conta existir em produção com essa password, é uma conta de farmácia com credenciais publicadas no código.

**Correção:** confirmar em `auth.users` se `geral@conhecafarmacia.com` existe e, se existir, rodar a password e remover o acesso de farmácia; usar um email de demonstração dedicado (`demo@…`) e nunca o institucional. **Confiança: a confirmar** — depende de o seed ter sido aplicado fora do ambiente local.

**Esforço:** minutos.

---

### 🟡 M9 — Não há testes de integração para autorização, RLS e webhooks

**Onde:** o repositório não tem ficheiros de teste (0 detectados).

**Impacto:** regressões em policies, grants ou guards passam despercebidas; A1 e G1 teriam sido apanhados por um teste de duas contas. É a razão pela qual os achados de autorização se acumulam sem ninguém notar.

**Correção:** testes de integração contra Supabase local com dois utilizadores (A e B) e uma farmácia, cobrindo: leitura cruzada de reservas/favoritos/stock, escrita directa em tabelas fechadas, execução de RPCs por `anon`, e o fluxo `aal1` → acção (deve falhar). Corre em CI.

**Esforço:** dias.

---

### 🔵 B1 — Injeção de filtros PostgREST na busca pública

**Onde:** `components/search/DrugSearch.jsx:134` — `term` vindo de `?q=` é interpolado em `.or(...)`.

**Como:** `?q=x,drug_name.ilike.%25` altera a expressão `or` enviada ao PostgREST. O alcance é a view pública de fármacos.

**Impacto:** alteração da semântica do filtro e leitura de fármacos inactivos se a view não filtrar (a policy filtra; o impacto real é baixo). **Correção:** remover `,()."` do termo e escapar `%_\`, ou construir o `or` a partir de tokens validados. **Esforço:** minutos.

---

### 🔵 B2 — O optimizador de imagens aceita qualquer `*.supabase.co`

**Onde:** `next.config.mjs:18` — `hostname: '*.supabase.co'`.

**Como:** `/_next/image?url=https://outro-projecto.supabase.co/storage/v1/object/public/...` faz o servidor buscar e cachear ficheiros de projetos alheios.

**Impacto:** consumo de banda/cache e uso do domínio como proxy de imagens. **Correção:** limitar ao ref do projeto. **Esforço:** minutos.

---

### 🔵 B3 — Segredo do cron de reconfirmação comparado com `===`

**Onde:** `app/api/cron/reconfirmar-stock/route.js:16`.

**Impacto:** canal lateral de tempo, impraticável por rede, mas é uma inconsistência face ao outro cron (que usa `timingSafeEqual`). **Correção:** reutilizar o helper do `/api/interno/alertas`. **Esforço:** minutos.

---

### 🔵 B4 — Upload valida o MIME declarado pelo cliente

**Onde:** `lib/actions/pharmacy-portal.js:~602` (`file.type`) e `lib/actions/platform-catalogue.js:~192/286`.

**Impacto:** é possível guardar bytes arbitrários com `Content-Type: image/jpeg` num bucket público; o `nosniff` e o content-type impedem execução no browser, mas o bucket passa a alojar ficheiros não-imagem. **Correção:** sniff de magic bytes e re-encode server-side; limite de dimensões. **Esforço:** horas.

---

### 🔵 B5 — Logs com dados pessoais

**Onde:** `lib/actions/reservations.js` (IP, telefone, nome), `pharmacy-portal.js` (nomes de balcão), `leads` (email referenciado por hash — bem).

**Impacto:** retenção de PII nos logs da Vercel sem política definida. **Correção:** reduzir ao mínimo, mascarar telefone/email e definir retenção. **Esforço:** horas.

---

### 🔵 B6 — `/api/leads` revela se um contacto já é lead

**Onde:** `app/api/leads/route.js` — resposta `duplicate`.

**Impacto:** confirmação de que um email/telefone já contactou a plataforma, com limite de 5/hora por IP. **Correção:** responder sempre `ok` e tratar o duplicado em silêncio. **Esforço:** minutos.

---

## 4. Matriz de autorização

| Recurso | `anon` | Utilizador A | Utilizador B | Farmácia X | Farmácia Y | Staff de balcão | Consola | Superadmin |
|---|---|---|---|---|---|---|---|---|
| `drugs` activos | ler | ler | ler | ler | ler | ler | ler | ler |
| `drugs` pendentes | — | — | — | só os seus | só os seus | — | ler | ler |
| `stock_items` | ler (só activos, 0050) | ler | ler | ler/escrever os seus | — | escrever via portal (com perfil) | ler | ler |
| `stock_confirmed` | ler (inclui `quantity` — M3) | ler | ler | ler | ler | ler | ler | ler |
| `reservations` | — | só as suas (token) | — | só as suas | — | via portal | ler | ler |
| `favorites` | — | próprios | próprios | — | — | — | — | — |
| `pharmacy_leads` | — | — | — | — | — | — | ler/gerir | ler/gerir |
| `pharmacy_staff` | — | — | — | ler os seus | — | ler | ler | ler |
| `pharmacy_api_keys` | — | — | — | ler (sem hash) | — | — | gerir | gerir |
| `pharmacy_webhooks` | — | — | — | ler (sem segredo) | — | — | gerir | gerir |
| `webhook_deliveries` | — | — | — | ler os seus | — | — | ler | ler |
| `stock_movements` | — | — | — | ler os seus | — | — | ler | ler |
| `pharmacy_subscriptions` | — | — | — | ler a sua (sem `notes`) | — | — | ler | ler |
| `admin_users` | — | ler-se | ler-se | ler-se | ler-se | ler-se | listar | listar |
| `platform_audit_log` | — | — | — | — | — | — | ler (aal2) | ler (aal2) |

**Conclusão:** a matriz está correta em quase tudo. As exceções são M1 (o staff de balcão na tabela é o que a UI diz, não o que o servidor exige) e M3 (o `anon` vê mais colunas do que a UI mostra).

---

## 5. Invariantes de negócio verificados

| Invariante | Estado | Evidência |
|---|---|---|
| Stock nunca negativo | ✅ | `apply_stock_movement` usa `greatest(...,0)` e o saldo só muda por RPC. |
| Toda a alteração de stock tem movimento | ⚠️ | Pela app sim; a policy `stock pharmacy write` permite `update` directo em `stock_items`, que salta o livro-razão. |
| Reserva não se conclui duas vezes | ✅ | Trigger só dispara na transição para `concluida` e verifica o estado anterior. |
| Reserva não pode ser lida por terceiros | ✅ | RLS + RPC com token; `access_token` não está em listagens públicas. |
| Preço mostrado é o preço guardado | ✅ | `stock_sale_options` e snapshot na reserva. |
| Farmácia não muda de dono nem de slug | ✅ | `protect_pharmacy_self_update`. |
| Staff só vê a sua farmácia | ✅ | `is_own_pharmacy` em todas as leituras. |
| Só o dono da plataforma cria superadmins | ✅ | Matriz fechada + último superadmin protegido. |
| Webhook entregue uma só vez por evento | ✅ | Unique `(webhook_id, event, source_ref)` + idempotency key. |
| Segredo HMAC nunca sai para o browser | ✅ | Colunas excluídas do grant de `select`. |
| Suspensão de farmácia repõe só o que desactivou | ✅ | Acção guarda o estado anterior e repõe-no. |
| Chave de API nunca é recuperável | ✅ | Só hash + prefixo visível; rotação invalida a anterior. |
| `service_role` nunca chega ao cliente | ✅ | Só em `lib/supabase/admin.js`, importado por route handlers/actions. |

O único invariante assinalado é o do livro-razão: a app escreve sempre por RPC, mas a RLS ainda permite `update` directo em `stock_items` à farmácia. Não é escalada entre farmácias (o `with check` exige `is_own_pharmacy`), mas permite saltar a auditoria e os webhooks.

---

## 6. O que está bem implementado

- **RLS em todas as tabelas** (25 no baseline), incluindo as de plataforma; nenhuma tabela com dados reais ficou sem policy.
- **Reservas fechadas**: RLS sem leitura pública, RPC por token, `access_token` só devolvido ao criador.
- **Webhooks**: HMAC Standard Webhooks, verificação de assinatura, DNS resolvido e fixado (anti-SSRF), recusa de IPs privados, idempotência em BD, retry com backoff.
- **Chaves de API**: hash com pepper, prefixo para identificação, scopes, rate limit atómico, idempotência por linha; o `pharmacy_id` vem sempre da chave, nunca do corpo.
- **Consola**: matriz de permissões fechada por listas de permitidos, `viewScope` que corta operação/contacto, MFA obrigatório, motivo obrigatório, auditoria append-only, último superadmin protegido, reposição de suspensões conservadora.
- **Portal**: todas as acções filtram por `pharmacy.id` da sessão; `is_own_pharmacy` na BD; uploads com limites; PIN com scrypt e lockout exponencial; MFA com recovery codes.
- **Site**: CSP por nonce, HSTS, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`; nenhum `dangerouslySetInnerHTML` com dados de utilizador (só o anti-FOUC estático).
- **Segredos**: `.env.local` e `credenciais.txt` ignorados e fora do histórico; nenhuma chave no código; `NEXT_PUBLIC_*` só URL/anon/conta/domínio de cookie; `npm audit --omit=dev` sem vulnerabilidades (150 deps de produção).
- **Operação**: backup semanal com verificação de tabelas e alarme no `/interno`; cron com segredo dedicado; ingestão separada do site.
- **Documentação**: as decisões de segurança estão escritas nas migrações (ex.: a nota da 0051 sobre o grant implícito) — raro e valioso.

---

## 7. Não foi possível verificar

1. **Grants e policies em produção.** Tudo o que diga respeito a `has_function_privilege`, `pg_policies` e `information_schema.role_table_grants` vive na base. O código mostra o que as migrações *pretendem*; só a consulta do ponto 3/G1 confirma o estado real. Executar antes de fechar G1.
2. **Se a conta `geral@conhecafarmacia.com` existe em produção com a password do seed** (M8). Verificar em Authentication → Users e, se existir, rodar a password e remover o vínculo a `admin_users`.
3. **Se o nonce chega aos scripts do framework em produção.** `proxy.js:72` define `x-csp-nonce` no pedido, mas a documentação do Next espera também o header `Content-Security-Policy` no pedido para propagar o nonce; não encontrei referência ao nome `x-csp-nonce` no runtime instalado. Se a hidratação funciona em produção sem violações, está resolvido; se aparecerem erros de CSP na consola, é aqui. Testar com o site publicado.
4. **Limites e expiração do Supabase Auth** (rate limit de login, validade do refresh token). São configuração de projeto, não código.
5. **Prova de restauro do backup.** O workflow tem os comandos e a retention, mas não há registo de um restauro real; a documentação pede um por trimestre.
6. **Separação de ambientes.** Não é possível saber, pelo repositório, se o projeto Supabase de produção é distinto do de desenvolvimento, nem se as chaves de serviço estão separadas.
7. **Comportamento em runtime** (CSP, cookies, redireccionamentos, MFA). A auditoria foi estática; não houve execução contra a aplicação.

---

## 8. Plano de correção

### Antes de crescer (esta semana)
1. **G1** — Correr a consulta de confirmação e aplicar já a migração de `revoke execute ... from anon, authenticated`; não esperar pela confirmação para fechar a porta. (minutos)
2. **A1** — Guard `aal2` em todas as acções de escrita do portal; exigir `aal2` para desactivar MFA. (horas)
3. **M1** — Exigir perfil de balcão em todas as escritas. (horas)
4. **M2** — Resposta uniforme na reposição de senha. (minutos)
5. **M8** — Verificar/rodar a credencial de demonstração. (minutos)

### Antes de escalar farmácias
6. **M3** — Reduzir a view pública ao que a UI mostra. (horas)
7. **M4** — Revogação de sessão no logout / «terminar tudo». (horas)
8. **M5** — Rate limit de login por IP e conta + registo de falhas. (horas)
9. **M6** — Decidir e documentar quem modera fármacos; alinhar código e comentários. (horas)
10. **M7** — Verificar o marcador de reposição. (minutos)

### Endurecimento contínuo
11. **M9** — Testes de integração de autorização/RLS/RPC em CI. (dias)
12. **B1–B6** — Correções pontuais. (horas no total)
13. Rever a CSP em produção e a prova de restauro do backup. (horas)

---

## 9. Candidatos descartados

Ficam registados para que ninguém os volte a investigar sem motivo:

- **Segredos no repositório/histórico.** `.env.local` e `credenciais.txt` estão no `.gitignore`; `git log --all -- .env*` não devolve nada; não há padrões de chaves no código. Descartado.
- **SQL injection clássica.** Todas as queries usam o cliente Supabase (parametrizado). O único ponto de interpolação é o filtro PostgREST da busca pública (B1), sem acesso a dados privados.
- **XSS armazenado.** Não há `dangerouslySetInnerHTML` com dados de utilizador; anúncios e descrições são renderizados como texto. Descartado.
- **CSRF nas Server Actions.** O Next valida `Origin`/`Host`; o `proxy.js` não interfere. Descartado.
- **Open redirect.** Todos os `redirect()` usam destinos fixos ou validados. Descartado.
- **SSRF nos webhooks.** DNS resolvido e fixado, IPs privados recusados, HTTPS obrigatório. Descartado.
- **Webhook replay/duplicado.** Unique por evento e chave de idempotência. Descartado.
- **`service_role` no browser.** Só em módulos server-only. Descartado.
- **Conta de plataforma sem MFA.** `requirePlatform` verifica `aal2`; as páginas que só lêem usam `requirePlatformPage`. Descartado.
- **Farmácia a escrever noutra farmácia.** `is_own_pharmacy` no `using` e no `with check`; testado por leitura da policy. Descartado.
- **Pagamentos/checkout.** Não existe cobrança online; os planos são geridos manualmente. Secção não aplicável.
- **Conteúdo pago/vídeo.** Não existe. Secção não aplicável.
- **Numeração fiscal.** Não há facturação. Secção não aplicável.

---

*Auditoria estática, sem alterações ao projeto. O relatório está em `auditoria/RELATORIO-AUDITORIA.md`.*
