# Gestor da Equipa Conheça Farmácia — farmácias, contas, níveis e planos

> **Como executar:** plano por passos, com checkbox (`- [ ]`). Cada Phase tem tarefas, os ficheiros que toca e a verificação própria. Não avançar de Phase sem a anterior verde. Verificação alinhada com o resto do projecto: `npm run build` + `npm run format` + smoke test manual (não há framework de testes neste repo).

**Goal:** dar à equipa da Conheça Farmácia uma área interna onde (1) se gerem as farmácias (ficha, estado, verificação), (2) se criam as contas das farmácias por **convite** em vez de um script CLI corrido à mão, (3) se atribuem **planos** com limites e funcionalidades por nível, (4) se separam **níveis internos** por menor privilégio, e (5) **tudo o que a equipa faz fica registado** numa trilha de auditoria append-only. Hoje a equipa CF tem **zero contas** na plataforma: criação de farmácias e contas é um `node scripts/create-pharmacy-user.js` com a chave service-role de um portátil.

**Architecture:**

- **Área interna nova e separada** — `app/interno/**`, gate no layout (`getPlatformSession`) + guard em cada Server Action, no mesmo desenho do portal da farmácia (`app/portal/(dashboard)/layout.js` valida a sessão e as acções revalidam). Nunca partilha shell nem rotas com `/portal`.
- **Níveis internos em `admin_users.role`** — alargar o CHECK existente (`admin` | `farmacia`) com `superadmin`, `onboarding`, `suporte`, `faturacao`, `auditoria`. A autorização vive num módulo único (`lib/platform/permissions.js`) chamado pelas Server Actions, e **a RLS não é alargada** por causa disto: só `admin`/`superadmin` mantêm o acesso amplo da 0001, e a área interna lê e escreve por service-role (é a matriz, não a policy, que decide o que um `suporte` vê). É o mesmo espírito das validações de papel da farmácia, que vivem em `lib/actions/pharmacy-staff.js` e não em policies.
- **Planos em duas metades** — o **catálogo e os entitlements vivem em código** (`lib/plans.js`: limites, funcionalidades, preços), porque mudam mais depressa que o schema e são a fonte de verdade da autorização; o **estado por farmácia vive na base de dados** (`pharmacy_subscriptions`: plano, estado, trial, graça, notas). Não há gateway de pagamento nesta fase — o plano é atribuído à mão por `faturacao`/`superadmin` e toda a mudança é auditada.
- **Auditoria append-only** (`platform_audit_log`) desenhada com o vocabulário do projecto irmão (`action`, `table_name`, `record_id`, `user_email`, `created_at` — o mesmo que `docs/2026-06-15-admin-role-ui.md` assume), mais `actor_role`, `actor_user_id`, `pharmacy_id`, `before`/`after` jsonb, `reason` e `request_id`.
- **Nada se apaga** — farmácia, conta e perfil saem de circulação por estado (`pharmacies.active = false`, ban do user Auth, `pharmacy_staff.active = false`), nunca por `delete`.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions `'use server'`), React 19, Supabase (PostgreSQL + RLS + Auth Admin API + MFA/TOTP), Tailwind v4 (tokens em `styles/globals.css`), `createAdminClient()` (service-role) para toda a escrita privilegiada, `logWarn`/`logError` (`lib/log.js`). Sem framework de testes (`npm run build` + smoke test manual).

**Base:** `4821fbe` (16/10/2026) — 26 migrações aplicadas (`0001`…`0026`), `pg_cron` + `pg_net` activos.
**Contexto de produto (lei e mercado):** `localizador/2026-10-12-gestao-e-faturacao-apis.md` — é ele que fixa os preços de referência (5.000–25.000 Kz/mês no mercado), o escalão gratuito («quem alimenta o Localizador»), a regra da neutralidade do directório e a fronteira da facturação (2A agora, 2B por parceiro, 2C nunca sem equipa dedicada).
**Precedente de estilo e vocabulário:** `docs/2026-06-15-admin-role-ui.md` (projecto irmão) — `currentUserRole` propagado do Server parent, `ConfirmModal` em vez de `window.confirm`, «arquivar em vez de eliminar», badge com data+autor.

---

## 0. Levantamento — o que já existe (medido, não suposto)

### 0.1 Estado da base de dados (16/10/2026)

| Medida                                      | Valor                               | O que significa                                                                                              |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pharmacies`                                | **9** (9 activas, **7** `verified`) | o directório real do piloto — **2 farmácias ainda sem selo**, que é trabalho de `onboarding` na área interna |
| `admin_users` role `admin`                  | **0**                               | **ninguém da equipa CF tem conta** — a área interna nasce do zero                                            |
| `admin_users` role `farmacia`               | **2**                               | duas contas de farmácia (de 9 farmácias)                                                                     |
| `pharmacy_staff`                            | **1**                               | o multi-utilizador com PIN existe mas quase não é usado                                                      |
| `pharmacy_leads`                            | **1** (0 `onboarded`)               | o funil de farmácias é hoje uma tabela sem ecrã                                                              |
| `pharmacy_api_keys`                         | **2**                               | já há integração a correr em produção                                                                        |
| `pharmacy_webhooks`                         | **0**                               | nenhum destino registado ainda                                                                               |
| Tabelas `audit_logs` / planos / subscrições | **não existem**                     | a trilha de auditoria e os planos são para criar                                                             |

### 0.2 Como nasce hoje uma conta de farmácia

`scripts/create-pharmacy-user.js` (CLI, service-role do `.env.local`): cria/garante a farmácia → cria o user Auth pela **Admin API** (`createUser` com `email_confirm: true` e senha escolhida pelo operador) → faz upsert em `admin_users` (`role='farmacia'` + `pharmacy_id`). Verifica no fim com um `generateLink` de magiclink.

Problemas que isto cria (é o motivador deste plano):

- exige a **chave service-role num portátil** e não deixa rasto de quem fez o quê;
- a senha inicial é escolhida por nós e enviada fora de banda (WhatsApp) — o dono da farmácia nunca prova que controla o e-mail;
- não há caminho para **suspender, repor acesso ou transferir a titularidade** sem voltar ao terminal;
- nada liga a farmácia a um **plano**, porque planos não existem.

### 0.3 Funções do portal da farmácia e quem as pode usar hoje

Roles existentes: `admin_users.role = 'farmacia'` (conta da farmácia, 1 ↔ 1 farmácia) e `pharmacy_staff.role = 'balcao' | 'gerente'` (perfil com PIN, sessão de 24 h no dispositivo).

| Função                                       | Rota                 | Balcão       | Gerente        | Notas de código                                                        |
| -------------------------------------------- | -------------------- | ------------ | -------------- | ---------------------------------------------------------------------- |
| Visão geral / calendário do mês              | `/portal`            | ✅           | ✅             | —                                                                      |
| Atenção (fila de avisos)                     | `/portal/atencao`    | ✅           | ✅             | —                                                                      |
| Stock (edição, validades, retirar)           | `/portal/stock`      | ✅           | ✅             | `isManager` passado ao `StockPanel` (validação de fármacos só gerente) |
| Entrada de stock                             | `/portal/entrada`    | ✅           | ✅             | —                                                                      |
| Movimentos (livro-razão)                     | `/portal/movimentos` | ✅           | ✅             | `stock_movements` (0020)                                               |
| Reservas                                     | `/portal/reservas`   | ✅           | ✅             | —                                                                      |
| Vendas                                       | `/portal/vendas`     | ✅           | ✅             | —                                                                      |
| Desempenho                                   | `/portal/desempenho` | só o próprio | ✅ equipa toda | ranking, partilha, comparação — gates `isManager`                      |
| Equipa (perfis + PIN)                        | `/portal/equipa`     | ❌           | ✅             | `createStaffProfile` exige gerente                                     |
| Integração (chaves, CSV, webhooks, chamadas) | `/portal/integracao` | ❌           | ✅             | `canManage = staff.role === 'gerente'`                                 |
| Sessão (PIN, trocar perfil)                  | `/portal/sessao`     | ✅           | ✅             | —                                                                      |
| Ajuda                                        | `/portal/ajuda`      | ✅           | ✅             | —                                                                      |

**Leitura:** o portal já tem a tríade de produto (stock + validade + reservas + atribuição por pessoa). O que falta é a dimensão que este plano introduz: **o que a farmácia tem direito a usar depende do plano**, e a equipa CF não tem sequer um sítio para o decidir.

### 0.4 Limites que já existem no código (matéria-prima dos planos)

| Limite                              | Valor hoje                                        | Onde                                                           |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Destinos de webhook por farmácia    | `MAX_WEBHOOKS = 5`                                | `lib/actions/integration.js`                                   |
| Linhas por importação CSV           | `MAX_IMPORT_ROWS = 2000`                          | `lib/actions/integration.js`                                   |
| Tamanho do lote de importação       | `IMPORT_CHUNK = 100`                              | `lib/csv.js`                                                   |
| Pedidos por minuto por chave de API | `rate_limit_per_minute = 120` (coluna, por chave) | `0023_pharmacy_api_keys.sql`, consumido por `api_rate_consume` |
| Validade máxima de uma chave        | `MAX_KEY_DAYS = 3650`                             | `lib/actions/integration.js`                                   |
| Tentativas de entrega de webhook    | `MAX_ATTEMPTS = 10`                               | `lib/webhooks.js`                                              |
| Lado máximo da imagem de produto    | `MAX_SIDE = 800`                                  | `lib/image-compress.js`                                        |
| Confirmação de stock «fresca»       | 72 h / 5 dias                                     | view `stock_confirmed`, `lib/expiry.js`                        |

Todos estes valores são hoje **constantes globais, iguais para todas as farmácias** — é exactamente essa a costura onde os planos entram: passam a ser resolvidos por `entitlements(plan_code)` em vez de constantes.

### 0.5 O que não existe e este plano traz

1. **Conta interna** para a equipa CF (0 hoje) e níveis internos com menor privilégio.
2. **Área interna**: lista e ficha de farmácia, ecrã de contas, ecrã de planos, ecrã de auditoria.
3. **Convite** como caminho oficial de criação de conta (o CLI fica só para bootstrap e desenvolvimento).
4. **Planos** (`localizador` / `gestao` / `conformidade`) com entitlements aplicados no servidor.
5. **Trilha de auditoria** de tudo o que a equipa faz.
6. **Funil de farmácias** com ecrã (a `pharmacy_leads` deixa de ser uma tabela órfã) e conversão lead → farmácia + conta num clique.
7. **Ciclo de vida** da conta e da farmácia: convite, reenvio, reposição de senha, suspensão, transferência de titularidade — todos auditados, nenhum com `delete`.

---

## 1. Brainstorm — as opções que estiveram em cima da mesa

### 1.1 Onde vive o gestor

| Opção                                                                     | Prós                                                                                                                                                             | Contras                                                                                                                              | Veredicto     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| A. **Área interna neste repo** (`app/interno/**`)                         | os dados vivem aqui (farmácias, contas, stock, reservas, chaves, planos); uma sessão, um deploy; reutiliza tokens, `createAdminClient`, padrão de Server Actions | mais superfície num repo que também serve o público                                                                                  | **Escolhida** |
| B. No site principal (conhecafarmacia.com), que já tem admin + audit_logs | reutiliza um admin a sério                                                                                                                                       | projecto e base de dados **diferentes**; obrigaria a API entre produtos ou a duplicar o modelo; o staff da farmácia não existe lá    | Rejeitada     |
| C. Ferramenta de terceiros (Retool/Appsmith)                              | rápido para ver dados                                                                                                                                            | fora do controlo deixa a autorização fora do código, sem RLS nem auditoria nossa; mais um fornecedor com acesso a dados de farmácias | Rejeitada     |

### 1.2 Como modelar os níveis internos

| Opção                                                      | Prós                                                                                                                          | Contras                                                                     | Veredicto                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| A. **Alargar `admin_users.role`** com os 5 níveis internos | sem tabela nova; `is_admin()` já existe e passa a `is_platform_member()`; é o que o projecto irmão faz (`admin`/`superadmin`) | mistura «tipo de identidade» e «nível» na mesma coluna                      | **Escolhida** (com matriz fina em código) |
| B. Tabela `platform_members` + `platform_roles`            | separação limpa, N papéis por pessoa                                                                                          | tabela e políticas novas para 2–3 pessoas reais; mais um join em cada guard | Adiada (Out of Scope)                     |
| C. Enum de permissões em JSON por utilizador               | flexível                                                                                                                      | ilegível, impossível de auditar, tentação de permissões ad-hoc              | Rejeitada                                 |

### 1.3 Como modelar planos

| Opção                                                             | Prós                                                                                  | Contras                                                                                                           | Veredicto             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| A. **Entitlements em código, estado em tabela**                   | muda preço/limite sem migração; um só lugar a ler (`lib/plans.js`); testável no build | exige deploy para mudar um limite                                                                                 | **Escolhida**         |
| B. Catálogo em tabela (`plans`, `plan_features`) editável no ecrã | a equipa muda limites sem deploy                                                      | risco de a autorização ficar em dados editáveis por humanos; mais RLS e mais UI para nada                         | Rejeitada na fase 1   |
| C. SDK de facturação (Stripe/Entitlements)                        | ciclo de cobrança a sério                                                             | o mercado paga 5.000–25.000 Kz/mês e não há gateway usado; trazer um fornecedor externo agora é custo sem receita | Adiada (Out of Scope) |

### 1.4 Como criar a conta da farmácia

| Opção                                                                           | Prós                                                                                      | Contras                                                                                                           | Veredicto             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| A. **Convite por e-mail** (`inviteUserByEmail`) — o dono define a própria senha | prova que controla o e-mail; nenhuma senha passa por nós; o link expira (1 h por omissão) | depende de SMTP configurado (ver risco R2)                                                                        | **Escolhida**         |
| B. `createUser({ email_confirm: true })` + senha gerada por nós (como o script) | independente de e-mail                                                                    | a senha viaja fora de banda; a farmácia nunca prova o e-mail; contas órfãs                                        | Só para bootstrap/dev |
| C. Auto-registo da farmácia (signup público)                                    | escala                                                                                    | destrói a curadoria do directório (farmácias a sério verificadas por nós) e enche o sistema de contas por validar | Rejeitada             |

---

## 2. Decisões locked in

| Decisão                              | Escolha                                                                                                                                                                           | Razão                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onde vive a área interna             | **`app/interno/**`neste repo**, route group`(console)` com gate no layout                                                                                                         | uma base de dados, uma sessão, um deploy; `/portal` fica intocado                                                                                                                                                                                                                                                                                                                                                                                                        |
| Nomes das rotas                      | `/interno`, `/interno/login`, `/interno/farmacias`, `/interno/farmacias/[id]`, `/interno/leads`, `/interno/planos`, `/interno/auditoria`, `/interno/equipa`, `/interno/mfa`       | PT, sem ambiguidade com `/portal/equipa` (que é a equipa **da farmácia**). **Não há página de contas solta**: uma conta é sempre de uma farmácia e vive na ficha dela                                                                                                                                                                                                                                                                                                    |
| Níveis internos                      | `superadmin`, `onboarding`, `suporte`, `faturacao`, `auditoria` na coluna `admin_users.role` (CHECK alargado na 0027)                                                             | menor privilégio e separação de funções sem tabelas novas; alinha com o `admin`/`superadmin` do projecto irmão                                                                                                                                                                                                                                                                                                                                                           |
| Onde se decide o que cada nível pode | **`lib/platform/permissions.js`** (matriz declarativa `can(role, action)`), chamada nas Server Actions                                                                            | uma só fonte de verdade; o detalhe fica testável em código em vez de disperso por policies                                                                                                                                                                                                                                                                                                                                                                               |
| `is_admin()` (predicado RLS)         | passa a `role in ('admin','superadmin')` — só o **nível alto** mantém o acesso amplo da 0001                                                                                      | a área interna lê e escreve com **service-role**; alargar a RLS a `suporte`/`auditoria` daria acesso a reservas e contactos de clientes a quem a matriz diz que não deve vê-los. Negar por omissão também ao nível dos dados                                                                                                                                                                                                                                             |
| Papel legado `admin`                 | mantido e **equivalente a `superadmin`** (`can()` aceita os dois)                                                                                                                 | a 0001 e as policies das 0005/0012/0018/0020/0023 falam de `admin`; renomear exigiria tocar em seis migrações. O runbook proíbe criar contas novas com `role='admin'`                                                                                                                                                                                                                                                                                                    |
| MFA das contas internas              | **TOTP obrigatório**; acções destrutivas/de plano exigem sessão **`aal2`** validada no servidor                                                                                   | CIS Control 6 (MFA para administração); TOTP do Supabase Auth existe em todos os planos                                                                                                                                                                                                                                                                                                                                                                                  |
| Planos: catálogo                     | **`lib/plans.js`** — código: `localizador` (0 Kz), `gestao` (15.000 Kz/mês), `conformidade` (45.000 Kz/mês, fase 2B)                                                              | preços e limites mudam depressa; a autorização não pode viver em dados editáveis                                                                                                                                                                                                                                                                                                                                                                                         |
| Planos: estado                       | **`pharmacy_subscriptions`** (1 linha por farmácia): `plan_code`, `status` (`trial`/`activo`/`graca`/`suspenso`/`cancelado`), `trial_until`, `grace_until`, `notes`, `updated_by` | histórico de negócio em dados; nenhuma migração por novo preço                                                                                                                                                                                                                                                                                                                                                                                                           |
| Sem gateway de pagamento             | Atribuição **manual** por `faturacao`/`superadmin`; estado e notas no ecrã                                                                                                        | o mercado paga por transferência/multicaixa e não há checkout; cobrança é Out of Scope                                                                                                                                                                                                                                                                                                                                                                                   |
| `notes` e `updated_by` da subscrição | fora do grant de colunas ao `authenticated` (**grant por coluna**, como o `pin_hash` na 0018)                                                                                     | «nunca mostradas à farmácia» deixa de ser intenção e passa a ser permissão — a farmácia lê o plano e os prazos, não o comentário que a equipa escreve sobre ela                                                                                                                                                                                                                                                                                                          |
| Apagar uma subscrição                | **impossível** para todos os papéis da API (`delete` revogado no `service_role`)                                                                                                  | cancelar é `status = cancelado` e voltar ao plano de entrada; a regra fica no schema em vez de depender da disciplina de quem escreve o código                                                                                                                                                                                                                                                                                                                           |
| Aplicação dos entitlements           | **No servidor, sempre** — `requireEntitlement(pharmacyId, feature)` nas Server Actions do portal + estados de UI para não oferecer o que não existe                               | esconder botões não é autorização (OWASP); o servidor decide                                                                                                                                                                                                                                                                                                                                                                                                             |
| Interruptor dos planos               | **aplicados por omissão**; `PLANS_ENFORCED=false` no ambiente desliga tudo de imediato e sem deploy                                                                               | implementado como opt-in durante a verificação (as 9 farmácias do piloto estão no plano de entrada e duas têm integração a correr, e eu não ia cortar funções a quem as usa hoje por causa de um deploy). **Decidido pelo dono do produto em 16/10/2026:** as farmácias ficam no plano de entrada e a aplicação vale como desenhada — o interruptor volta a ser o que o plano dizia, com a decisão de dados a sustentá-lo. Desligar continua a ser a saída de emergência |
| Auditoria                            | **`platform_audit_log`** append-only: sem `update`/`delete` para ninguém, `select` só para `is_platform_member()`; escrita exclusivamente via service-role                        | os registos que auditam não podem ser editáveis por quem audita; vocabulário igual ao `audit_logs` do projecto irmão                                                                                                                                                                                                                                                                                                                                                     |
| Eliminar                             | **Nunca.** Farmácia sai de circulação por `active=false`; conta Auth por ban (`ban_duration`) + `active=false`; perfis por `active=false`                                         | preserva histórico (stock, reservas, movimentos) e cumpre «nunca apagar» do lado fiscal                                                                                                                                                                                                                                                                                                                                                                                  |
| Suspensão efetiva                    | **Ban + `pharmacies.active=false`** (o gate do portal já exige farmácia activa) e/ou desactivar perfis                                                                            | um ban não invalida sessões já emitidas — a segunda peça é o que corta o acesso de facto                                                                                                                                                                                                                                                                                                                                                                                 |
| Impersonação («entrar como»)         | **Fora de âmbito na v1** — o suporte lê pela ficha interna (auditado)                                                                                                             | o risco de uma sessão em nome do cliente não se paga; se voltar, entra com ticket, TTL, banner visível e actor/subject separados na trilha                                                                                                                                                                                                                                                                                                                               |
| Transferir titularidade              | Convite para o novo dono + desactivar o anterior, em **duas aprovações** (quem pede ≠ quem aprova)                                                                                | acção de alto impacto (NIST AC-3(2) / separação de funções)                                                                                                                                                                                                                                                                                                                                                                                                              |
| Redes / grupos (2–10 lojas)          | Fora de âmbito; a coluna `admin_users.pharmacy_id` fica 1↔1 e a migração futura é uma tabela `pharmacy_members`                                                                   | não construir multi-loja sem o primeiro cliente de grupo (o roadmap fala dele, mas não existe)                                                                                                                                                                                                                                                                                                                                                                           |
| Farmácias não clientes               | Aparecem no directório com contacto e **sem stock**; nenhum plano muda ranking, frescura ou posição                                                                               | a regra de ouro do roadmap: sem isso o activo (confiança) passa a publicidade disfarçada                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 3. Níveis e permissões

### 3.1 Níveis internos (Equipa CF)

| Nível        | Para quê                        | Pode                                                                                                         | Não deve ter                                                                                                                          |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `superadmin` | fundador/proprietário           | tudo o que a matriz define, incluindo gerir níveis internos e exportar a trilha                              | uso diário em contas partilhadas (o login é individual e com MFA); e **não** pode apagar nada — «eliminar» não existe em nenhum nível |
| `onboarding` | quem traz farmácias para dentro | criar farmácia, editar ficha, verificar, convidar/reenviar/revogar conta, activar/desactivar, converter lead | mexer em planos, ver auditoria completa, exportar em massa                                                                            |
| `suporte`    | responder a pedidos             | ler ficha, stock, reservas, entregas de webhook, chamadas de API; confirmar stock «por telefone»             | alterar ficha, contas, planos; exportar                                                                                               |
| `faturacao`  | dinheiro                        | ver ficha comercial, atribuir/mudar plano, trial, graça, suspender por pagamento, notas internas             | ver dados clínicos/operacionais (reservas com contacto), gerir contas ou níveis                                                       |
| `auditoria`  | quem revê                       | ler a trilha completa e exportá-la (com registo do próprio export)                                           | alterar qualquer coisa — inclusive a trilha                                                                                           |
| `farmacia`   | (existente) conta da farmácia   | o portal da farmácia                                                                                         | nada da área interna                                                                                                                  |

### 3.2 Matriz acção × nível (a autorização que vai em `permissions.js`)

| Acção                                           | superadmin  | onboarding | suporte  | faturacao             | auditoria                    |
| ----------------------------------------------- | ----------- | ---------- | -------- | --------------------- | ---------------------------- |
| `pharmacy.view` (ler ficha, stock, reservas)    | ✅          | ✅         | ✅       | só ficha comercial    | ✅ (sem contacto de cliente) |
| `pharmacy.create`                               | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `pharmacy.update` (ficha)                       | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `pharmacy.verify` (selo verificado)             | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `pharmacy.activate` / `deactivate`              | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `stock.confirm_by_phone` (origem `team`)        | ✅          | ✅         | ✅       | ❌                    | ❌                           |
| `account.invite` / `account.resend`             | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `account.revoke` (convite pendente)             | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `account.suspend` / `unsuspend`                 | ✅          | ✅         | ❌       | ✅ (só por pagamento) | ❌                           |
| `account.reset_password` (reenviar recuperação) | ✅          | ✅         | ❌       | ❌                    | ❌                           |
| `account.transfer_ownership`                    | ✅ (aprova) | ✅ (pede)  | ❌       | ❌                    | ❌                           |
| `plan.assign` / `plan.change` / `plan.trial`    | ✅          | ❌         | ❌       | ✅                    | ❌                           |
| `audit.read`                                    | ✅          | ❌         | ❌       | ❌                    | ✅                           |
| `audit.export`                                  | ✅          | ❌         | ❌       | ❌                    | ✅ (fica registado)          |
| `team.manage` (níveis internos)                 | ✅          | ❌         | ❌       | ❌                    | ❌                           |
| `team.reset_mfa` (repor o factor de outro)      | ✅          | ❌         | ❌       | ❌                    | ❌                           |
| `lead.*` (funil)                                | ✅          | ✅         | ✅ (ler) | ❌                    | ❌                           |

Regras estruturais: **ninguém se promove** (`team.manage` não altera o próprio nível nem o último `superadmin`), **quem pede não aprova** a transferência de titularidade, e **não há acções fora da matriz** — uma acção nova entra na matriz antes de existir na UI. A reposição do segundo factor nasceu como acção própria (`team.reset_mfa`) e não como um alargamento de `team.manage`: repor o factor de quem perdeu o telefone é uma operação diferente de mudar níveis, e separá-las deixa o dia em que um `onboarding` tiver de a fazer sem lhe dar o resto.

### 3.3 Funções da farmácia por plano

| Função                                                           | `localizador` (grátis) | `gestao` | `conformidade` |
| ---------------------------------------------------------------- | ---------------------- | -------- | -------------- |
| Stock, validade, retirar/repor, Atenção, Reservas, Perfil, Ajuda | ✅                     | ✅       | ✅             |
| Entrada de stock completa (preços, estrutura da caixa)           | ✅                     | ✅       | ✅             |
| Movimentos (livro-razão)                                         | ❌                     | ✅       | ✅             |
| Vendas e Desempenho (relatórios)                                 | ❌                     | ✅       | ✅             |
| Equipa com PIN (perfis, atribuição por pessoa)                   | ❌                     | ✅       | ✅             |
| Integração: chaves de API, CSV, webhooks                         | ❌                     | ✅       | ✅             |
| Lotes/FEFO e validade por lote                                   | ❌                     | ✅       | ✅             |
| Facturação conforme (parceiro certificado)                       | ❌                     | ❌       | ✅ (fase 2B)   |
| Selo de origem no cliente final (API/CSV «automático»)           | ✅                     | ✅       | ✅             |
| Aparecer no directório                                           | ✅ (sempre)            | ✅       | ✅             |

Nota de desenho: o tier grátis é **de entrada no Localizador** (o que alimenta o directório), não uma demo com prazo. O pago é **gestão da farmácia** (atribuição por pessoa, relatórios, integração). Isto segue a recomendação do roadmap («escalão gratuito para quem alimenta o Localizador») e evita a armadilha de transformar o piloto numa prova gratuita de 14 dias.

### 3.4 Limites por plano (com os valores que já existem no código)

| Limite                        | `localizador` | `gestao` | `conformidade` | Hoje                                      |
| ----------------------------- | ------------- | -------- | -------------- | ----------------------------------------- |
| Chaves de API activas         | 0             | 3        | 5              | sem limite por plano                      |
| Destinos de webhook           | 0             | 5        | 5              | `MAX_WEBHOOKS = 5`                        |
| Pedidos/min por chave         | —             | 120      | 300            | `rate_limit_per_minute = 120` (por chave) |
| Linhas por importação CSV     | 0             | 2000     | 2000           | `MAX_IMPORT_ROWS = 2000`                  |
| Perfis de equipa (PIN)        | 0             | 10       | 20             | sem limite                                |
| Retenção de `stock_movements` | —             | 24 meses | 36 meses       | sem expurgo                               |
| Exportações do portal         | 0/mês         | 4/mês    | 12/mês         | não existe                                |

---

## 4. Planos: catálogo, ciclo de vida e aplicação

### 4.1 Catálogo (código, não tabela)

```js
// lib/plans.js
export const PLANS = {
  localizador: {
    nome: 'Localizador',
    precoKz: 0,
    ciclo: 'mes',
    ordem: 1,
    descricao: 'Aparecer no Localizador com stock confirmado.',
  },
  gestao: {
    nome: 'Gestão',
    precoKz: 15_000,
    ciclo: 'mes',
    ordem: 2,
    descricao: 'Gerir stock, equipa e relatórios; ligar o sistema da farmácia.',
  },
  conformidade: {
    nome: 'Conformidade',
    precoKz: 45_000,
    ciclo: 'mes',
    ordem: 3,
    fase: '2B',
    descricao: 'Gestão + facturação conforme, por parceiro certificado.',
  },
}
```

Preços ancorados no mercado angolano (5.000–25.000 Kz/mês) e na recomendação de _bundlar_ conformidade num escalão mais alto (30.000–60.000 Kz/mês) — `localizador/2026-10-12-gestao-e-faturacao-apis.md`, Parte 6.

### 4.2 Ciclo de vida da subscrição

| Estado      | Significado                                                     | Efeito no portal                                         | Como se sai                                       |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| `trial`     | piloto/degustação com prazo (`trial_until`)                     | acesso de `gestao` completo                              | passa a `activo` (paga) ou a `localizador` no fim |
| `activo`    | plano em vigor                                                  | entitlements do plano                                    | mudança de plano planeada                         |
| `graca`     | pagamento falhado/atrasado (`grace_until`, 15 dias por omissão) | **nada se corta** no período de graça                    | volta a `activo` ou cai para `localizador`        |
| `suspenso`  | corte por decisão humana (abuso, incumprimento grave)           | só leitura no portal + stock sai do directório após 72 h | `activo` ou `localizador`                         |
| `cancelado` | saiu do serviço pago                                            | fica em `localizador` (nunca perde conta nem histórico)  | re-`activo`                                       |

**Regras que não se negociam:** a descida de plano **nunca apaga dados** (o que excede o limite fica visível mas inerte até caber, no espírito do «sem apagar dados automaticamente» do Stripe); a farmácia **nunca** desaparece do directório por causa de plano — `localizador` é sempre possível; e o stock existente continua a ser servido aos clientes depois de uma descida.

**Decidido em 17/10/2026 — o prazo é uma linha, não um aviso.** Um `trial` ou uma `graca` com o prazo no passado põem a farmácia no plano de entrada **na hora**, na leitura (`effectivePlanOf` em [lib/platform/subscriptions.js](lib/platform/subscriptions.js)), sem job agendado e sem escrever nada na base. O `status` fica como está: é o que diz à equipa porque é que a farmácia desceu, e é o que faz «retomar» devolver exactamente o que ela tinha (`plan_code` intacto durante toda a suspensão). Os dados não se perdem, e o portal explica o motivo em vez de deixar a farmácia a adivinhar («O período de experiência terminou, por isso o portal voltou ao plano Localizador»). Uma data **em falta** conta como terminada — falhar para o mínimo, nunca para o máximo, como o código de plano desconhecido. Isto mantém a promessa que o ecrã do primeiro plano faz a quem negocia e que o comentário da 0028 já dizia — antes desta decisão a farmácia ficava com o plano pago para sempre, porque não havia nada que lesse o prazo.

### 4.3 Aplicação no servidor

```js
// lib/plans.js
export function entitlements(planCode) {
  return LIMITS[planCode] ?? LIMITS.localizador // falha para o mínimo, nunca para o máximo
}
```

- `lib/platform/subscriptions.js` → `getSubscription(pharmacyId)` (service-role) + `requireEntitlement(pharmacyId, feature, n)` devolvendo `{ ok: false, error: 'PLANO_INSUFICIENTE' }`, no mesmo formato dos guards da farmácia (`{ ok, error }`).
- Chamado **nas Server Actions** do portal (chaves, webhooks, CSV, perfis, relatórios) e nos Route Handlers (`/api/ingest/stock`, que passa a usar `entitlements(plan).ingestPerMinute` em vez do `120` fixo da chave).
- Na UI, a função bloqueada não desaparece em silêncio: aparece com o cadeado, **o nome do plano que a desbloqueia** e o contacto comercial (é a única publicidade interna que se admite — vender de dentro do produto, sem tocar no directório público).
- `PLANS_ENFORCED=false` no ambiente faz `requireEntitlement` devolver sempre `ok: true` (interruptor de emergência, sem deploy).

---

## 5. Práticas de gestão adoptadas (e de onde vêm)

| Prática                                                              | Como aparece neste plano                                                                                        | Fonte                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Menor privilégio + negar por omissão                                 | 5 níveis internos; matriz fechada; acção nova entra na matriz antes de existir                                  | OWASP Authorization Cheat Sheet       |
| Contexto de tenant validado no servidor, nunca no pedido do cliente  | `pharmacyId` vem sempre da sessão/BD, nunca de um ID enviado pelo browser; guards por acção                     | OWASP Multi-Tenant Security           |
| Separação de funções e dupla aprovação                               | transferência de titularidade (pede ≠ aprova), exportações registadas, `faturacao` não vê dados operacionais    | NIST SP 800-53 AC-3(2)                |
| Provisionamento de cliente como fluxo único e observável             | farmácia + conta + plano + auditoria numa operação com resultado registado                                      | AWS SaaS Lens (tenant onboarding)     |
| Primeira conta do cliente por convite, com prova de posse do e-mail  | `inviteUserByEmail` + escolha de senha pelo dono; sem senhas partilhadas                                        | OWASP Forgot Password · Supabase Auth |
| Suporte sem «entrar como»                                            | leitura pela ficha interna, auditada; impersonação fora de âmbito v1                                            | WorkOS Impersonation · Microsoft GDAP |
| Trilha de auditoria imutável e com contexto                          | `platform_audit_log` append-only, com actor, papel, tenant, antes/depois, motivo                                | OWASP Logging                         |
| Revisão periódica de acessos                                         | revisão trimestral dos níveis internos (superadmin/suporte) e anual da RBAC; sem revogação automática em saídas | CIS Control 6                         |
| Entitlements como fonte de autorização (feature flags não autorizam) | `lib/plans.js` consultado no servidor; flags só para lançamento gradual                                         | Stripe Entitlements                   |
| Limites com unidade, janela e comportamento definidos                | tabela §3.4 (por minuto, por mês, por farmácia) e mensagens de limite claras                                    | Stripe — billing alerts/limits        |
| Falha de pagamento com graça e sem apagar                            | `graca` 15 dias → `localizador`, nunca `delete`                                                                 | Stripe — subscription lifecycle       |
| MFA para administração                                               | TOTP obrigatório; `aal2` exigido nas acções destrutivas                                                         | CIS Control 6 · Supabase MFA          |

---

## File Structure

### Criar

| Path                                                                                                                                                         | Responsabilidade                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0027_platform_team.sql`                                                                                                                 | CHECK de `admin_users.role` alargado; `is_platform_member()`/`is_superadmin()`; tabela `platform_audit_log` (append-only) + grants/RLS |
| `supabase/migrations/0028_pharmacy_subscriptions.sql`                                                                                                        | `pharmacy_subscriptions` + backfill (`localizador`/`activo` para as 9) + índices                                                       |
| `lib/plans.js`                                                                                                                                               | catálogo, preços, `entitlements()`/`LIMITS` por plano (fonte de verdade dos limites)                                                   |
| `lib/platform/session.js`                                                                                                                                    | `getPlatformSession()` (role + MFA), `requirePlatform(action)`, redireccionamento para `/interno/login`                                |
| `lib/platform/permissions.js`                                                                                                                                | matriz `ACTIONS` + `can(role, action)` + `describeAction()` (para a mensagem de erro)                                                  |
| `lib/platform/audit.js`                                                                                                                                      | `logPlatformAudit({ action, table, recordId, pharmacyId, before, after, reason })` (service-role, best-effort, nunca lança)            |
| `lib/platform/subscriptions.js`                                                                                                                              | `getSubscription`, `setPlan`, `requireEntitlement`                                                                                     |
| `lib/actions/platform-pharmacies.js`                                                                                                                         | Server Actions: criar/editar/verificar/activar/desactivar farmácia; converter lead                                                     |
| `lib/actions/platform-accounts.js`                                                                                                                           | Server Actions: convidar, reenviar, revogar, suspender, repor senha, transferir titularidade                                           |
| `lib/actions/platform-plans.js`                                                                                                                              | Server Actions: atribuir plano, trial, graça, suspender por pagamento                                                                  |
| `lib/actions/platform-team.js`                                                                                                                               | Server Actions: criar/alterar nível interno (com protecção do último `superadmin`)                                                     |
| `lib/actions/platform-audit.js`                                                                                                                              | Server Actions: ler a trilha filtrada (cursor `created_at`+`id`) e exportar CSV com `audit.export` e falha fechada                     |
| `lib/audit-csv.js`                                                                                                                                           | construção do CSV da trilha (16 colunas, `;`, aspas duplicadas, CRLF), pura e testável, ao lado de `lib/csv.js`                        |
| `app/interno/login/page.js`                                                                                                                                  | login da equipa CF (email+senha, TOTP, estados de erro explícitos)                                                                     |
| `app/interno/(console)/layout.js`                                                                                                                            | gate da área interna + shell                                                                                                           |
| `app/interno/(console)/page.js`                                                                                                                              | painel de entrada (farmácias por estado, leads, subscrições em graça, últimas acções)                                                  |
| `app/interno/(console)/farmacias/page.js`                                                                                                                    | lista com filtros (município, estado, plano, frescura do stock)                                                                        |
| `app/interno/(console)/farmacias/[id]/page.js`                                                                                                               | ficha: dados, contactos, contas, perfis, chaves/webhooks, stock recente, reservas, plano, acções                                       |
| `app/interno/(console)/leads/page.js`                                                                                                                        | funil `pharmacy_leads` + conversão em farmácia/conta                                                                                   |
| `app/interno/(console)/planos/page.js`                                                                                                                       | subscrições: plano, estado, trial/graça, histórico de mudanças                                                                         |
| `app/interno/(console)/auditoria/page.js`                                                                                                                    | trilha com filtros (actor, acção, farmácia, período) + export CSV auditado                                                             |
| `app/interno/(console)/equipa/page.js`                                                                                                                       | níveis internos, MFA de cada conta, convites pendentes                                                                                 |
| `app/interno/(console)/mfa/page.js`                                                                                                                          | inscrição TOTP (`enroll`/`challenge`/`verify`)                                                                                         |
| `components/interno/InternoShell.jsx`                                                                                                                        | shell (sidebar/top-bar) da área interna, tokens do portal                                                                              |
| `components/interno/PharmacyTable.jsx`, `PharmacyForm.jsx`, `AccountPanel.jsx`, `PlanPanel.jsx`, `AuditTable.jsx`, `LeadTable.jsx`, `ConfirmActionModal.jsx` | UI da área interna (o `ConfirmActionModal` mostra **o motivo obrigatório** e o resumo antes/depois)                                    |

### Modificar

| Path                                                                              | Mudança                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/create-pharmacy-user.js`                                                 | passa a aceitar `--platform-role superadmin\|onboarding\|suporte\|faturacao\|auditoria` (cria conta CF, sem `pharmacy_id`) e `--invite`; mantém-se como bootstrap/dev (a UI passa a ser o caminho oficial). Cabeçalho actualizado. |
| `lib/actions/integration.js`                                                      | `MAX_WEBHOOKS`/`MAX_IMPORT_ROWS` deixam de ser constantes globais e passam a `entitlements(plan)` (com o valor actual como fallback); `LIMITE_DESTINOS` ganha mensagem com o plano que desbloqueia                                 |
| `app/api/ingest/stock/route.js`                                                   | rate-limit por chave passa a considerar `entitlements(plan).ingestPerMinute` (o `rate_limit_per_minute` da chave é o teto técnico, o plano é o de negócio)                                                                         |
| `app/portal/(dashboard)/equipa/page.js` + `components/portal/EquipaManager.jsx`   | estado de plano insuficiente (cadeado + plano) em vez de formulário                                                                                                                                                                |
| `app/portal/(dashboard)/movimentos/page.js`, `vendas`, `desempenho`, `integracao` | idem: gate por entitlement com aviso claro                                                                                                                                                                                         |
| `app/portal/(dashboard)/layout.js`                                                | lê a subscrição uma vez e passa-a ao shell (a sidebar mostra o plano no rodapé)                                                                                                                                                    |
| `components/portal/PortalSidebar.jsx`                                             | chip do plano + itens bloqueados com cadeado (nunca escondidos sem explicação)                                                                                                                                                     |
| `proxy.js`                                                                        | (/interno não precisa de regra própria — o gate é no layout; só confirmar que o CSP com nonce cobre a área nova)                                                                                                                   |

### Já criado/alterado (16/10/2026 — Phases 3.1–3.4 + 7.3)

| Path                                                                                | O que é                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/plans.js` (novo)                                                               | catálogo (`PLANS`, `FEATURES`, `LIMITS`), `entitlements()`/`hasFeature()`/`planNeededFor*` e o interruptor `PLANS_ENFORCED`                             |
| `lib/platform/subscriptions.js` (novo)                                              | `getSubscription` (cliente da sessão, colunas explícitas), `requireEntitlement`, `allow`, `STATUS_LABELS`                                               |
| `lib/platform/permissions.js` (novo)                                                | matriz §3.2 (27 acções × 5 níveis), `can`/`describeAction`/`viewScope`, `ACOES_COM_MFA`/`ACOES_COM_MOTIVO` e a decisão pura `decideAccess()`            |
| `lib/platform/session.js` (novo)                                                    | `getPlatformSession(Verbose)` (nível + MFA + conta suspensa), `requirePlatform(action, { reason })`, `requirePlatformSession()`/`requirePlatformPage()` |
| `lib/platform/audit.js` (novo)                                                      | `logPlatformAudit` (service-role, best-effort, nunca lança), `diffJson`, `newRequestId`                                                                 |
| `components/portal/PlanGate.jsx` (novo)                                             | portão de página (default) + `PlanBlocked` para as páginas que decidem antes de ir buscar dados                                                         |
| `app/portal/(dashboard)/layout.js`                                                  | lê a subscrição uma vez e passa `plan` ao shell (só dados serializáveis; `PLANS_ENFORCED` vem do servidor porque não é `NEXT_PUBLIC_*`)                 |
| `components/portal/{PortalShell,PortalSidebar}.jsx`                                 | plumbing de `plan` + chip do plano + cadeado e `title` nos itens fora do plano                                                                          |
| `app/portal/(dashboard)/{movimentos,vendas,integracao}/page.js`                     | `PlanGate` em volta do painel                                                                                                                           |
| `app/portal/(dashboard)/{equipa,desempenho}/page.js`                                | lêem a subscrição e devolvem `PlanBlocked` **antes** de ir buscar dados                                                                                 |
| `lib/actions/{integration,pharmacy-portal,pharmacy-staff}.js`                       | guardas `requireEntitlement` nas 7 acções (a autorização a sério)                                                                                       |
| `components/portal/{EquipaManager,MovementsPanel,SalesReport,IntegrationPanel}.jsx` | `PLANO_INSUFICIENTE` no mapa de mensagens (erro explicado, não «Erro inesperado»)                                                                       |
| `components/ui/Icon.jsx`                                                            | `LockIcon`                                                                                                                                              |
| `styles/globals.css`                                                                | `.portal-side-plan`, `.portal-nav-item--locked`, `.portal-nav-lock` (+ versões v2)                                                                      |
| `scripts/create-pharmacy-user.js`                                                   | `ensureSubscription()` — o caminho oficial de onboarding passa a deixar o plano de entrada criado                                                       |

### Não modificar (reutilizar)

- `lib/supabase/{server,admin}.js`, `lib/log.js`, `lib/pharmacy-session.js`, `lib/staff-session.js` — a sessão da farmácia e a sessão interna são coisas distintas e ficam separadas
- `components/portal/*` (exceto o shell e as páginas com gates) — a área interna tem os seus componentes
- `styles/globals.css` — os tokens e as classes `portal-*` são reutilizados; classes novas só se faltar alguma peça de tabela/estado
- `supabase/migrations/0001…0026` — a 0027 e a 0028 são aditivas
- `app/portal/**` (rotas e Server Actions existentes) — nenhuma rota muda de sítio
- O directório público (`app/farmacia/**`, `components/search/**`) — **nenhum** plano pode alterar o que o cliente final vê

---

## Phase 1 — Migração 0027: níveis internos + trilha de auditoria

> **ESTADO: FEITA em 16/10/2026** — `supabase/migrations/0027_platform_team.sql` aplicada no projecto `mxqhmtpshlpnbkninawt` (HTTP 201, `exit=0`) e **aplicada segunda vez** para provar idempotência (1 check de papéis, 4 helpers, 1 policy, 0 linhas na trilha). Provas medidas na secção «Resultado» no fim da Task 1.3. Nenhum ficheiro da aplicação foi tocado — só a base de dados.

### Task 1.1: Confirmar o estado real antes de escrever SQL

- [x] **Step 1: Correr e guardar o resultado** (`python scripts/query.py "<sql>"`):

```sql
-- 1.1.1 — os CHECK de admin_users (esperado: DOIS — o do papel e o que
--         amarra role='farmacia' a pharmacy_id; guardar os dois NOMES)
select c.conname, pg_get_constraintdef(c.oid) as definicao
from pg_constraint c join pg_class cl on cl.oid = c.conrelid
where cl.relname = 'admin_users' and c.contype = 'c';

-- 1.1.2 — quantas contas internas existem (esperado: 0)
select role, count(*) from public.admin_users group by role;

-- 1.1.3 — confirmar que o projecto irmão não tem nada aqui (evitar colisão de nomes)
select to_regclass('public.audit_logs') as audit_logs, to_regclass('public.platform_audit_log') as nova;
```

- [x] **Step 2:** `admin_users_role_check` = `CHECK (role = ANY (ARRAY['admin','farmacia']))` e `admin_users_check` = `CHECK ((role = 'farmacia') = (pharmacy_id IS NOT NULL))` — **os dois nomes eram os esperados**, logo o `drop constraint` do Step seguinte acerta. Contas: `farmacia` = 2, `admin` = 0. Colisões: `audit_logs`, `platform_audit_log` e `pharmacy_subscriptions` devolveram `null`. **Sem desvios** — o aviso seguinte é a regra geral, não um problema encontrado: Não inventar nomes de constraint. E se o nome desse CHECK **não** for `admin_users_role_check`, corrigir o `drop constraint` do Step seguinte: com o nome errado o `drop ... if exists` falha em silêncio, o `add constraint` acrescenta um **segundo** CHECK e a migração parece passar enquanto continua a recusar `suporte`.

### Task 1.2: Escrever a migração (não aplicar ainda)

**Files:** Create: `supabase/migrations/0027_platform_team.sql`

- [x] **Step 1: Escrever o ficheiro** — escrito e aplicado. O SQL abaixo é o **desenho** que foi para o repositório (roles, helpers, predicate da policy, grants e bloco de verificação são os mesmos); o ficheiro entregue tem os comentários por extenso e é ele a fonte de verdade: [0027_platform_team.sql](supabase/migrations/0027_platform_team.sql).

```sql
-- 0027 · Níveis internos da Equipa CF + trilha de auditoria
-- Aditiva e idempotente. Aplicar:
--   python scripts/apply-migration.py supabase/migrations/0027_platform_team.sql

-- A) Alargar o CHECK de papéis. 'admin' mantém-se (compatibilidade com
--    contas existentes e com o projecto irmão); os níveis novos são os
--    que a matriz de lib/platform/permissions.js usa.
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('admin','superadmin','onboarding','suporte','faturacao','auditoria','farmacia'));

-- B) Quem é da equipa CF (todos os níveis internos) e quem é superadmin.
create or replace function public.is_platform_member()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('admin','superadmin','onboarding','suporte','faturacao','auditoria')
  );
$$;

-- O nível alto, com o nome explícito para código novo; `is_admin()`
-- (bloco C) é o mesmo predicado com o nome legado que as policies já
-- referenciam. Uma única lista de papéis, para não divergirem.
create or replace function public.is_superadmin()
returns boolean language sql security definer set search_path = public as $$
  select public.is_admin();
$$;

-- Quem lê a trilha: o nível alto e o de auditoria — a matriz diz
-- `audit.read: superadmin | auditoria`, e a policy acompanha-a.
create or replace function public.is_auditor()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role = 'auditoria'
  );
$$;

grant execute on function public.is_platform_member() to public;
grant execute on function public.is_superadmin() to public;
grant execute on function public.is_auditor() to public;

-- C) is_admin() continua a existir (as policies da 0001, 0005, 0012, 0018,
--    0020 e 0023 usam-no) e passa a aceitar o nível alto: 'admin' legado
--    e 'superadmin'. Os níveis de leitura/operação (onboarding, suporte,
--    faturacao, auditoria) NÃO ganham acesso RLS: quem lhes dá leitura é
--    a matriz em lib/platform/permissions.js, com a área interna a ler e
--    a escrever por service-role. Alargar aqui a RLS daria a estes níveis
--    reservas, contactos de clientes e escrita em farmácias sem passar
--    pela matriz.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role in ('admin','superadmin')
  );
$$;

-- E) NOTA: a 0001 tem um CHECK de tabela
--      check ((role = 'farmacia') = (pharmacy_id is not null))
--    que esta migração NÃO toca. Consequência directa: uma conta interna
--    (qualquer dos 5 níveis) tem de ficar com pharmacy_id = null, e uma
--    conta de farmácia tem de o ter preenchido. lib/actions/platform-accounts.js
--    nunca escreve pharmacy_id em contas internas.

-- D) Trilha de auditoria append-only.
create table if not exists public.platform_audit_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role   text,
  actor_email  text,
  action       text not null,              -- ex.: 'pharmacy.create'
  table_name   text,
  record_id    text,
  pharmacy_id  uuid references public.pharmacies(id) on delete set null,
  reason       text,                       -- motivo obrigatório nas acções destrutivas
  request_id   text,
  ip           inet,
  user_agent   text,
  before       jsonb,
  after        jsonb
);

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);
create index if not exists platform_audit_log_pharmacy_idx
  on public.platform_audit_log (pharmacy_id, created_at desc);
create index if not exists platform_audit_log_actor_idx
  on public.platform_audit_log (actor_user_id, created_at desc);

alter table public.platform_audit_log enable row level security;

drop policy if exists "platform_audit_log read high levels" on public.platform_audit_log;
create policy "platform_audit_log read high levels"
  on public.platform_audit_log for select
  using (public.is_superadmin() or public.is_auditor());

-- Privilégios. A policy NÃO basta: `service_role` tem rolbypassrls=true
-- (medido: select rolbypassrls from pg_roles → true), portanto passa por
-- cima de qualquer policy. O que trava é privilégio de tabela — e as
-- tabelas novas em public nascem com ALL para service_role (medido na
-- 0023), daí o revoke explícito ter de incluir o service_role.
revoke all on public.platform_audit_log from anon, authenticated, service_role;
grant select on public.platform_audit_log to authenticated;        -- a policy decide as linhas
grant select, insert on public.platform_audit_log to service_role; -- escreve só o servidor
revoke update, delete on public.platform_audit_log from service_role;

comment on table public.platform_audit_log is
  'Trilha de auditoria da Equipa CF (0027). Append-only para todos os papéis que falam com a API (anon, authenticated, service_role: sem UPDATE/DELETE — provado, não só listado). O papel dono (postgres, dashboard/Management API) fica fora deste cerco: inerente ao Postgres, e a razão pela qual o motivo e o antes/depois são gravados na escrita em vez de corrigidos depois.';
comment on column public.platform_audit_log.reason is
  'Motivo escrito por quem executa. Obrigatório nas acções destrutivas (validado em lib/platform/audit.js, não no schema: a trilha nunca deve recusar registar).';

-- Verificação da própria migração: se ficou um CHECK antigo por cima (nome
-- diferente do esperado), rebenta aqui em vez de deixar uma base que parece
-- migrada e recusa 'suporte' na primeira conta da equipa.
do $$
declare n_ok int; n_velhos int;
begin
  select
    count(*) filter (where pg_get_constraintdef(c.oid) like '%ANY (ARRAY%'
                       and pg_get_constraintdef(c.oid) like '%superadmin%'),
    count(*) filter (where pg_get_constraintdef(c.oid) like '%ANY (ARRAY%'
                       and pg_get_constraintdef(c.oid) not like '%superadmin%')
  into n_ok, n_velhos
  from pg_constraint c join pg_class cl on cl.oid = c.conrelid
  where cl.relname = 'admin_users' and c.contype = 'c';

  if n_velhos > 0 then
    raise exception 'Ficou um CHECK antigo de papeis em admin_users a recusar os niveis novos';
  end if;
  if n_ok <> 1 then
    raise exception 'Esperava um CHECK de papeis com superadmin, encontrei %', n_ok;
  end if;
end $$;
```

- [x] **Step 2:** Confirmado no ficheiro: (A) CHECK do papel alargado, (B) os **três** helpers (`is_platform_member`, `is_superadmin`, `is_auditor`), (C) `is_admin()` redefinido a incluir `superadmin`, (D) tabela + índices + grants sem `update`/`delete`, (E) a nota do CHECK `(role = 'farmacia') = (pharmacy_id is not null)`. Acrescentado no fim da migração um bloco `do $$ … $$` que **recusa terminar** se tiver ficado um CHECK antigo por cima — a armadilha do nome errado deixa de ser silenciosa.
- [x] **Step 3:** Aplicar com `python scripts/apply-migration.py supabase/migrations/0027_platform_team.sql`. Nota do ambiente: o script imprime um `✅` no fim — se o terminal estiver em cp1252 o emoji falha **depois** de aplicar (HTTP 201); já corrigido com `sys.stdout.reconfigure(encoding='utf-8')`.

### Task 1.3: Validar a 0027

- [x] **Step 1:** `select pg_get_constraintdef(oid) from pg_constraint where conname = 'admin_users_role_check';` → os 7 papéis listados.
- [x] **Step 2:** Os quatro predicados corridos **sem sessão** (`auth.uid()` é null) → `equipa`, `admin`, `super` e `auditoria` todos `false`.
- [x] **Step 3:** `insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-000000000000','suporte')` → erro **23503** (`admin_users_user_id_fkey`), **não 23514**: o CHECK aceita `suporte`.
- [x] **Step 4:** Append-only provado por **negação real**, não por listagem de grants.

**Resultado (16/10/2026, projecto `mxqhmtpshlpnbkninawt`)**

| Prova                        | Comando                                                                  | Resultado                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Papéis no CHECK              | `pg_get_constraintdef`                                                   | `ARRAY['admin','superadmin','onboarding','suporte','faturacao','auditoria','farmacia']`                                 |
| `admin_users_check` intacto  | idem                                                                     | `((role = 'farmacia') = (pharmacy_id IS NOT NULL))` — a migração não lhe tocou                                          |
| Predicados sem sessão        | `select is_platform_member(), is_admin(), is_superadmin(), is_auditor()` | `false, false, false, false`                                                                                            |
| CHECK aceita os níveis novos | insert com uid inexistente                                               | `23503` (FK) — nunca `23514` (CHECK)                                                                                    |
| Escrita do servidor          | `begin; set local role service_role; insert …; rollback;`                | **passa** (1 linha visível antes do rollback)                                                                           |
| **`update` negado**          | `set local role service_role; update platform_audit_log …`               | **42501 `permission denied for table platform_audit_log`**                                                              |
| **`delete` negado**          | `set local role service_role; delete from platform_audit_log`            | **42501 `permission denied for table platform_audit_log`**                                                              |
| Leitura de nível baixo       | `set local role authenticated; select count(*)`                          | `0` linhas (a policy pede `is_superadmin()` ou `is_auditor()`)                                                          |
| Privilégios finais           | `has_table_privilege`                                                    | `anon`: nada · `authenticated`: só SELECT · `service_role`: SELECT+INSERT (sem UPDATE/DELETE) · `postgres` (dono): tudo |
| Trilha limpa                 | `select count(*) from platform_audit_log`                                | `0` — as provas correram dentro de transacções com `rollback`, logo não ficou resíduo para apagar                       |
| Idempotência                 | segunda aplicação da 0027                                                | HTTP 201, `exit=0`, sem duplicar check/helper/policy                                                                    |

Duas notas honestas que saíram daqui:

1. O `set role service_role` funciona porque o papel `postgres` é **membro** de `service_role` (medido em `pg_auth_members`) — é o que torna a prova de negação possível em vez de uma leitura de catálogo. E é preciso negá-la por _grant_, porque `service_role` tem `rolbypassrls = true`: a policy sozinha não travava nada.
2. O papel dono (`postgres`, o do dashboard e desta API) tem UPDATE/DELETE sobre a trilha. Não há `REVOKE` que o trave — é inerente ao Postgres. É por isso que o motivo e o antes/depois são gravados **na escrita**, e não corrigíveis depois, e está dito no comentário da tabela em vez de ficar subentendido.

---

## Phase 2 — Migração 0028: subscrições por farmácia

> **ESTADO: FEITA em 16/10/2026** — `supabase/migrations/0028_pharmacy_subscriptions.sql` aplicada (HTTP 201, `exit=0`) e **aplicada segunda vez** para provar idempotência (9 linhas, 1 policy, 2 índices = PK + `plan_idx`). Backfill completo: as 9 farmácias em `localizador`/`activo`, nenhuma sem plano. Provas medidas na Task 2.1 Step 2. Continua sem haver ficheiro da aplicação tocado — só a base de dados.

### Task 2.1: Escrever a migração

**Files:** Create: `supabase/migrations/0028_pharmacy_subscriptions.sql`

- [x] **Step 1: Escrever o ficheiro** — escrito e aplicado. Como na 0027: o SQL abaixo é o **desenho**; o ficheiro entregue é a fonte de verdade — [0028_pharmacy_subscriptions.sql](supabase/migrations/0028_pharmacy_subscriptions.sql).

```sql
-- 0028 · Plano de cada farmácia (estado) — o catálogo vive em lib/plans.js
-- Aditiva e idempotente.

create table if not exists public.pharmacy_subscriptions (
  pharmacy_id  uuid primary key references public.pharmacies(id) on delete cascade,
  plan_code    text not null default 'localizador',   -- sem CHECK: um plano novo não pede migração
  status       text not null default 'activo'
               check (status in ('trial','activo','graca','suspenso','cancelado')),
  trial_until  timestamptz,
  grace_until  timestamptz,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  notes        text,                                   -- notas internas (nunca mostradas à farmácia)
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists pharmacy_subscriptions_plan_idx
  on public.pharmacy_subscriptions (plan_code, status);

alter table public.pharmacy_subscriptions enable row level security;

-- Policy mais larga que a da trilha (0027), de propósito: um plano é
-- metadado comercial, não contacto de cliente nem reserva. As ESCRITAS de
-- plano são de superadmin/faturacao; a leitura segue a ficha da farmácia.
drop policy if exists "subscriptions read own or team" on public.pharmacy_subscriptions;
create policy "subscriptions read own or team"
  on public.pharmacy_subscriptions for select
  using (public.is_platform_member() or public.is_own_pharmacy(pharmacy_id));

revoke all on public.pharmacy_subscriptions from anon, authenticated, service_role;

-- A farmácia vê o plano, o estado e os prazos. `notes` (comentário interno
-- da equipa sobre a negociação) e `updated_by` ficam FORA do grant, por
-- coluna — a mesma técnica com que a 0018 esconde o pin_hash da equipa.
grant select (pharmacy_id, plan_code, status, trial_until, grace_until,
              started_at, ended_at, updated_at)
  on public.pharmacy_subscriptions to authenticated;

grant select, insert, update on public.pharmacy_subscriptions to service_role;
-- Nada se apaga: sair do serviço pago é `cancelado`. A regra fica no schema,
-- e não só na cabeça de quem escreve o código.
revoke delete on public.pharmacy_subscriptions from service_role;

-- Backfill: todas as farmácias existentes entram no plano de entrada,
-- activo e sem prazo (o directório é neutro e gratuito).
insert into public.pharmacy_subscriptions (pharmacy_id, plan_code, status)
select id, 'localizador', 'activo' from public.pharmacies
on conflict (pharmacy_id) do nothing;

-- A migração verifica-se a si própria: se o backfill falhou, se ficou
-- escrita aberta a anon/authenticated, ou se o revoke do DELETE não pegou
-- no service_role, rebenta aqui em vez de deixar uma base que parece
-- migrada e uma farmácia sem plano atribuível.
do $$
declare sem_plano int; aberturas int;
begin
  select count(*) into sem_plano
  from public.pharmacies p
  left join public.pharmacy_subscriptions s on s.pharmacy_id = p.id
  where s.pharmacy_id is null;
  if sem_plano > 0 then
    raise exception 'Backfill incompleto: % farmacia(s) sem linha de subscricao', sem_plano;
  end if;

  select count(*) into aberturas
  from unnest(array['anon','authenticated']) r
  where has_table_privilege(r,'public.pharmacy_subscriptions','INSERT')
     or has_table_privilege(r,'public.pharmacy_subscriptions','UPDATE')
     or has_table_privilege(r,'public.pharmacy_subscriptions','DELETE');
  if aberturas > 0 then
    raise exception 'Privilegios de escrita abertos a anon/authenticated';
  end if;

  if has_table_privilege('service_role','public.pharmacy_subscriptions','DELETE') then
    raise exception 'service_role ainda tem DELETE (subscricoes nunca se apagam)';
  end if;
end $$;
```

- [x] **Step 2:** Aplicar e validar

**Resultado (16/10/2026, projecto `mxqhmtpshlpnbkninawt`)**

| Prova                                   | Comando                                                                 | Resultado                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Backfill completo                       | `count(*)` na tabela / left join com `pharmacies`                       | `9` linhas, `0` farmácias sem plano                                  |
| Distribuição                            | `group by plan_code, status`                                            | `localizador/activo` = **9**                                         |
| `status` inválido recusado              | `update … set status='foo'`                                             | **23514** `pharmacy_subscriptions_status_check`                      |
| Plano novo **não** pede migração        | `update … set plan_code='plano_futuro_sem_migracao'`                    | **passa** (por desenho: sem CHECK no `plan_code`)                    |
| `graca` + `trial_until` aceites         | `update … set status='graca', trial_until=now()+interval '30 days'`     | **passa**                                                            |
| Colunas visíveis à farmácia             | `has_column_privilege('authenticated', …, 'SELECT')`                    | as 8 colunas do plano: `true`                                        |
| **`notes` fora do alcance da farmácia** | `has_column_privilege('authenticated', …, 'notes', 'SELECT')`           | `false` — e `select notes` como `authenticated` devolve **42501**    |
| `updated_by` fora do alcance            | idem para `updated_by`                                                  | `false` (o `service_role` lê as duas: `true`)                        |
| Leitura permitida sem sessão            | `set local role authenticated; select pharmacy_id, plan_code, status …` | **0 linhas** (a policy exige membro da equipa ou a própria farmácia) |
| Escrita do servidor                     | `set local role service_role; update … set status='graca' …`            | **passa**                                                            |
| **`DELETE` negado**                     | `set local role service_role; delete from pharmacy_subscriptions`       | **42501 `permission denied for table pharmacy_subscriptions`**       |
| Estado final intacto                    | `group by plan_code, status` depois de todas as provas                  | `localizador/activo` = 9 — tudo dentro de transacções com `rollback` |
| Idempotência                            | segunda aplicação da 0028                                               | HTTP 201, `exit=0`, sem duplicar policy/índice/linha                 |

Uma nota de alcance que a medição obrigou a corrigir: `has_table_privilege('authenticated', …, 'SELECT')` devolve **`false`**, porque o grant é por coluna — e é por isso que a prova boa aqui é `has_column_privilege` (coluna a coluna) e o `select notes` a falhar com 42501, não a listagem de privilégios de tabela. Sem isso, o ecrã «privilégios» diria que a farmácia não lê nada, e a farmácia lê oito colunas.

---

## Phase 3 — `lib/plans.js` e `lib/platform/*`

> **ESTADO: FEITA (16/10/2026)** — `lib/plans.js` (Task 3.1), `lib/platform/subscriptions.js` (que o File Structure previa mas o Phase não listava como tarefa) e as **Tasks 3.2–3.4** (`permissions`, `session`, `audit`), o núcleo da área interna. A evidência desta última passagem está no fim do Phase.
>
> Nota de âmbito: estes três módulos ainda **não têm quem os chame** — a primeira chamada chega na Phase 4 (o gate do `/interno`). Por isso o `npm run build` não os compila sequer (não estão no grafo de módulos): a prova deles foi feita a executar, não a compilar (ver a tabela abaixo).

### Task 3.1: `lib/plans.js` (catálogo + entitlements)

- [x] **Step 1:** `PLANS` (§4.1), `FEATURES` (§3.3), `LIMITS` (§3.4), `entitlements(planCode)` com fallback para `localizador`, `hasFeature`, `planNeededForFeature` e `planNeededForLimit`. `PLANS_ENFORCED` lê `process.env.PLANS_ENFORCED !== 'false'` (aplicado por omissão, como o plano dizia), depois da decisão de 16/10/2026 sobre o plano das farmácias do piloto — durante a verificação esteve opt-in, para eu poder medir os dois modos sem que um deploy cortasse funções a quem as usa hoje.
- [x] **Step 2:** `npm run build` → **0 erros** (`PIPESTATUS=0`), com as 17 rotas do portal listadas. `lib/plans.js` só expõe preços e limites — nenhum segredo.
- [x] **Step extra (não previsto no plano):** `lib/platform/subscriptions.js` lê a subscrição com o cliente da sessão (RLS + grant por coluna) e nomeia EXPLICITAMENTE as colunas em vez de `*` — o `*` falharia com 42501 por causa do grant por coluna da 0028. Sem linha ou com erro resolve para o plano de entrada (`falha: true`), nunca para o plano acima.

### Task 3.2: `lib/platform/permissions.js`

- [x] **Step 1:** Matriz declarativa com as 28 acções da tabela §3.2. Desvios do enunciado, todos deliberados: (a) chamam-se `PLATFORM_ROLES` e **não** `ROLES`, porque é o mesmo nome que a sessão da farmácia usa para o que _não_ é isto; (b) cada acção declara `allow: [níveis]` (lista de PERMITIDOS) em vez de `{ role: true|false }` — é a mesma informação sem 5 booleanos por linha, e o que importa é que uma acção nova nasce sem ninguém e um nível novo nasce sem nada (negar por omissão); (c) além de `can`/`describeAction`, exporta `actionsForRole` (a sidebar nasce da matriz) e `rolesForAction` (o ecrã da equipa); (d) as duas qualificações das células — «só ficha comercial» (`faturacao`) e «sem contacto de cliente» (`auditoria`) — não são detalhe de UI e por isso existem como código: `viewScope(role)` devolve `{ operacao, contacto }`.
- [x] **Step 2:** Regras estruturais no módulo, como funções puras: `podeMexerNoNivel(actor, alvo)` (ninguém se promove) e `separacaoDeFuncoes(pediu, aprova)` (quem pede não aprova). O `account.transfer_ownership` foi **partido em dois** — `.request` (`superadmin`+`onboarding`) e `.approve` (`superadmin`) — para que «pede ≠ aprova» seja uma permissão e não um comentário. A outra metade da regra (o último `superadmin` não sai) é uma consulta ao estado da tabela e fica na acção, em SQL (Phase 9).
- [x] **Ponto extra:** a ORDEM das recusas é código, não acaso: permissão **antes** de MFA (pedir TOTP a quem não pode fazer a acção revelaria que a acção existe) e motivo por último. Está em `decideAccess()` — função **pura** que recebe `{ role, mfa }` e devolve a decisão, para que as quatro recusas se provem sem base de dados nem cookies (a sessão fica em `session.js`, que lhe passa o resultado).

### Task 3.3: `lib/platform/session.js`

- [x] **Step 1:** `getPlatformSession()` (e `getPlatformSessionVerbose()`, que nomeia a razão: `SEM_USER`, `CONTA_SUSPENSA`, `ERRO_PERFIL`, `SEM_PERFIL`, `PAPEL_ERRADO`, `EXCECAO`). A leitura do próprio nível passa pela policy «admin_users self read» da 0001 com o token da pessoa — não precisa de service-role para saber quem é. O papel **gravado** viaja na sessão ao lado do normalizado (`roleRaw`): decidir usa o normalizado, auditar guarda o que está na base. **Ponto extra medido no caminho:** se o `banned_until` vier no user, a sessão não existe (`CONTA_SUSPENSA`) — um ban não corta sessões já emitidas, e esta era a segunda peça que faltava do lado interno.
- [x] **Step 2:** `requirePlatform(action, { reason })` — a mesma decisão do enunciado, com a avaliação movida para `decideAccess()` (Task 3.2) e um quarto código acrescentado: `MOTIVO_OBRIGATORIO`, para as acções da lista `ACOES_COM_MOTIVO`. É aqui que a exigência de motivo passa a ser estrutural: acontece **antes** da escrita e no mesmo sítio para todas as acções, para que nenhuma se esqueça dela (e a trilha, essa, nunca recusa registar — ver 3.4).
- [x] **Step 3:** `ACOES_COM_MFA` derivado da matriz (um `mfa: true` por acção, sem lista à parte que possa divergir dela): `pharmacy.deactivate`, `account.suspend`, `account.unsuspend`, `account.revoke`, `account.transfer_ownership.*`, `plan.assign|change|trial|grace|suspend|resume`, `team.manage`, `team.reset_mfa` e `audit.export` (15). Validado no servidor por `getAuthenticatorAssuranceLevel()`, nunca só na UI — e **falha FECHADA**: se a leitura do nível falhar, o nível fica `null` (≠ `aal2`) e a acção sensível é recusada.
- [x] **Cuidado com a forma do código do enunciado:** o `'use server'` que ele mostra no topo faria o build **recusar** o ficheiro (um módulo `'use server'` só pode exportar funções async, e isto exporta a matriz, `SESSION_REASONS` e valores). Estes três módulos são código SÓ de servidor (importam `next/headers`, cookies e `node:crypto`) **sem** essa directiva — como `lib/pharmacy-session.js`. As Server Actions de verdade vivem em `lib/actions/*`.
- [x] **Guardas de página:** `requirePlatformSession()` (sem sessão → `redirect('/interno/login?motivo=…')`, fora de qualquer try/catch — `redirect()` funciona lançando) e `requirePlatformPage(action)`, que em vez de redireccionar devolve `SEM_PERMISSAO` para o ecrã explicar (Task 4.2 Step 3).

### Task 3.4: `lib/platform/audit.js`

- [x] **Step 1:** `logPlatformAudit({ action, table, recordId, pharmacyId, before, after, reason, session, requestId, request })` com service-role; `try/catch` que nunca lança; `logError('platform', …)` se a escrita falhar — uma auditoria em falta tem de ser visível. Dois extras que o contrato pediu: `session` (o actor vem de `requirePlatform`; sem ela, o escritor lê a sessão, porque um registo sem dono não serve) e `requestId` (ligar os 3-4 registos da MESMA operação — converter um lead grava farmácia + convite + estado do funil).
- [x] **Step 2:** `diffJson(before, after)` guarda só as chaves alteradas, com serialização canónica (ordem de chaves e aninhamento não contam como mudança). Três casos explícitos além do diff: criar (`before: null`), remover (`after: null`) e «nada mudou» (`{}`, que é informação).
- [x] **Escritas sintéticas com guardas de propósito:** `ip` (`inet`) e `pharmacy_id` (FK) são validados antes da inserção — um cabeçalho ou um id com lixo fazia falhar a INSERÇÃO e perder-se-ia a linha inteira, que é exactamente o que não pode acontecer numa trilha. Lixo → campo nulo, registo escrito (medido, ver abaixo).
- [x] **Motivo em falta não apaga o rasto:** o escritor não recusa registar por falta de motivo — grava `reason: null` e deixa um `logWarn`, porque o registo sem motivo é a prova de que o motivo faltou. A exigência vive antes, em `requirePlatform`.

**Evidência (16/10/2026) — executado, não só compilado**

| Prova                                     | Como                                                                                | Resultado                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Matriz §3.2, célula a célula              | script node: a tabela §3.2 transcrita **de novo** à mão e comparada com `can()`     | **135 células** (27 acções × 5 níveis), **0 divergências**; acção inexistente e `constructor` → `false`                                                                                                |
| Papel legado e conta de farmácia          | o mesmo script                                                                      | `admin` → superadmin (alcança `team.manage`); `farmacia`, `''`, `'SuperAdmin'`, `7`, `{}` → sem sessão                                                                                                 |
| Decisão de acesso                         | `decideAccess()` com sessões sintéticas                                             | as 4 recusas **com a ordem certa**: permissão vence sobre MFA, MFA vence sobre motivo; AAL ilegível → `MFA_NECESSARIO` (falha fechada); motivo `'   '` → `MOTIVO_OBRIGATORIO`                          |
| Sessão real sem cookies                   | rota temporária `/api/sonda-tmp` (apagada no fim)                                   | `SEM_USER` (`Auth session missing!`)                                                                                                                                                                   |
| Sessão real de **farmácia**               | a mesma rota, com as cookies da conta de farmácia do piloto que está no browser     | **`PAPEL_ERRADO`** (`farmacia`) — o portal e a área interna não se cruzam                                                                                                                              |
| Sessão real de **equipa**                 | conta descartável `sonda-interno@…` (`superadmin`, criada e apagada nesta passagem) | `reason: OK`, `role: superadmin`, `roleRaw: superadmin`; **`mfa.currentLevel = 'aal1'`**, `metodos: [password]` — a chamada `getAuthenticatorAssuranceLevel()` devolve a forma documentada neste stack |
| MFA a travar a sério                      | `requirePlatform('plan.change')` e `('team.manage')` com essa sessão `aal1`         | **`MFA_NECESSARIO`**, com o nível actual no erro (é a metade da Task 11.2 Step 6 que já se pode medir)                                                                                                 |
| Permissão a deixar passar                 | `requirePlatform('audit.read')` com a mesma sessão                                  | `ok: true`                                                                                                                                                                                             |
| Acção fora da matriz                      | `requirePlatform('plan.everything')`                                                | `SEM_PERMISSAO` (a mensagem cita a acção)                                                                                                                                                              |
| Trilha: escrita real                      | 5 escritas sintéticas do próprio `logPlatformAudit` pelo service-role               | `action`, `table_name`, `record_id`, FK da farmácia, `host(ip)`, `user_agent`, `request_id` e `before`/`after` **só com as chaves que mudaram** (um campo igual dos dois lados ficou de fora)          |
| Acentos do motivo                         | `select reason = 'sonda de verificação — apagar'`                                   | `true`                                                                                                                                                                                                 |
| Actor na trilha                           | escrita com a sessão da conta descartável                                           | `actor_user_id`, `actor_role='superadmin'`, `actor_email` — o papel **gravado**                                                                                                                        |
| Cabeçalho hostil não perde o registo      | `x-forwarded-for: 999.999.999.999` + `pharmacyId: abc-invalido`                     | `ip` e `pharmacy_id` nulos e a linha **escrita** (`ok: true`) — era isto que a guarda existe para evitar                                                                                               |
| Vários saltos de proxy                    | `x-forwarded-for: 10.0.0.7, 70.41.3.18`                                             | guarda o primeiro (`10.0.0.7`)                                                                                                                                                                         |
| Trilha nunca recusa nem lança             | `logPlatformAudit({ table: … })` sem `action`                                       | `{ ok: false, error: 'SEM_ACAO' }`, sem excepção e **sem linha**                                                                                                                                       |
| Append-only confirmado (Task 11.4 Step 9) | `set local role service_role; update/delete` na trilha                              | **42501 permission denied** nos dois — a linha que o escritor grava não se corrige depois                                                                                                              |
| Limpeza                                   | linhas e conta descartável apagadas (papel dono da tabela)                          | trilha **0**, contas internas **0**, 2 contas de farmácia, 9 farmácias, 9 subscrições — o estado de partida                                                                                            |

**Limitação desta passagem:** uma sessão **`aal2`** a atravessar o portão não foi exercida — exige uma conta interna com TOTP inscrito, e o ecrã de inscrição (`/interno/mfa`). O ramo estava coberto no teste puro (`decideAccess` com `aal2` → `ok`), mas não com um segundo factor real. _(Resolvido a 17/10/2026: o ecrã de inscrição existe e uma sessão `aal2` real foi exercida — ver Task 4.1.1.)_

---

## Phase 4 — Área interna: rotas, sessão e shell

> **ESTADO: FEITA (16/10/2026; segundo factor a 17/10/2026)** — login em dois passos, inscrição do autenticador TOTP, gate, shell e a área de farmácias (lista + ficha + edição + verificação + desactivar com motivo), tudo percorrido no browser com uma conta descartável e uma farmácia descartável, ambas apagadas no fim. Evidência no fim do Phase 5.

### Task 4.1: Login da equipa

- [x] **Step 1:** `app/interno/login/page.js` + `components/interno/InternoLoginForm.jsx`: email+senha e, quando a conta tem TOTP inscrito (`nextLevel === 'aal2'`), o código de seis dígitos no passo 2 — os dois passos **na mesma Server Action** (`lib/actions/platform-auth.js`), para que a sessão seja escrita no servidor (o `signInWithPassword` no browser guardava a sessão só no cliente e o servidor voltava a mandar para o login). Mensagens explícitas para `CREDENCIAIS`, `SEM_ACESSO_INTERNO`, `MFA_SEM_FACTOR`, `MFA_CODIGO` e `MFA_NECESSARIO`.
- [x] **Step 2:** `/interno` no `disallow` de `app/robots.js` e `robots: { index: false }` no metadata das duas páginas internas. Nenhum link público aponta para lá (a área não aparece em sitemap nem em navegação do site).

### Task 4.1.1: Inscrição do autenticador TOTP — FEITA em 17/10/2026

> O login já sabia **pedir** o código, mas não havia caminho para uma conta vir a **ter** factor: o TOTP era inscrito à mão na consola do Supabase e uma sessão `aal2` nunca era exercida em lado nenhum. Esta passagem fecha esse caminho — e é ela que dá sentido ao «TOTP obrigatório» da §«MFA das contas internas».

- [x] **Step 1:** `app/interno/(console)/mfa/page.js` + `components/interno/MfaSetup.jsx` + `lib/actions/platform-mfa.js`: `listFactors` para o estado da conta, `enroll` para o segredo/QR e `challengeAndVerify` para confirmar. **O código nunca é comparado na app** — quem sobe a sessão para `aal2` é o Supabase Auth, no servidor (a mesma regra do login). O ecrã tem três ramos: sem factor («Começar a inscrição»), a confirmar (QR + chave, mostrados **uma vez**) e activo (o que ficou inscrito e o nível da sessão).
- [x] **Step 2:** O caminho para a resolver está onde o problema é anunciado: o rodapé do `InternoShell` e o aviso `Só senha` do topo passaram a ser **links** para `/interno/mfa`. Mostrar um estado que anuncia uma recusa sem levar a quem a resolve é só queixa.
- [x] **Step 3 (decisões que o enunciado não fixava):** (a) **nada vai para a trilha** — `platform_audit_log` guarda acções da matriz §3.2 e não existe acção para «inscrever o meu autenticador»; o rasto fica no Auth (`mfa_factors`, `last_sign_in_at`) e no log `platform` para o que falhar; (b) **um factor verificado não se remove daqui** — só inscrições **por acabar** podem ser descartadas (não dão acesso a nada), porque apagar o segundo factor a quem já o tem é o gesto clássico de quem roubou uma sessão; trocar de telefone passa por `team.manage`; (c) começar uma inscrição descarta as inscrições por acabar da própria conta, para o nome do factor não colidir; (d) os erros do GoTrue são traduzidos num sítio só (`components/interno/mfa-erros.js`), partilhado com o login, porque o mesmo código errado é o mesmo erro a entrar e a inscrever.

**Evidência (17/10/2026, projecto `mxqhmtpshlpnbkninawt`) — percorrido no browser**

| Prova                | Como                                                                      | Resultado                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conta sem factor     | `/interno/mfa` com conta descartável `sonda-mfa@…` (`superadmin`, `aal1`) | ramo «Inscrever o autenticador»; rodapé «Sem autenticador inscrito — inscrever agora» e aviso `Só senha` no topo                                                                                       |
| Inscrição            | _Começar a inscrição_                                                     | QR **renderizado** (`img` com `naturalWidth > 0`) e chave de 32 caracteres; o factor fica `unverified` até ao código                                                                                   |
| Código errado        | `092188` (de outra inscrição)                                             | «Código incorrecto ou expirado…» com o detalhe do Auth; a inscrição continua de pé e o factor continua por verificar                                                                                   |
| Código certo         | TOTP calculado do segredo (RFC 6238)                                      | ecrã «Segundo factor activo», `Nível desta sessão: aal2`, rodapé «Segundo factor verificado nesta sessão» e o aviso `Só senha` **desaparece** — a sessão subiu sem novo login                          |
| Inscrição por acabar | factor `unverified` criado fora da UI                                     | aparece em «Inscrições por acabar» com «começada há X»; _Descartar_ remove-o (`cancelarInscricao`) e a lista fica vazia                                                                                |
| Login em dois passos | terminar sessão → e-mail+senha                                            | «Passo 2 de 2 — conta sonda-mfa@…»; código errado (`000000`) mostra «Código incorrecto ou expirado» e mantém o passo; código certo entra em `/interno` **`aal2`** (rodapé confirma, sem aviso no topo) |
| Fecho do ciclo       | `aal2` na sessão                                                          | as acções sensíveis deixam de receber `MFA_NECESSARIO` — era a única coisa que a Phase 3 não podia exercer                                                                                             |
| Limpeza              | conta de sonda + factores                                                 | conta Auth e linha em `admin_users` apagadas; base de volta a 9 farmácias, 9 subscrições, 0 contas internas                                                                                            |

**Dois defeitos encontrados na verificação (corrigidos nesta passagem)**

1. **O QR não renderizava.** O `enroll` do GoTrue devolve `qr_code` **já** como data-uri (`data:image/svg+xml;utf-8,<svg…>`), e o componente juntava-lhe outro prefixo — um `data:` dentro de um `data:`, imagem partida (o `alt` era o que se via). Corrigido com `paraDataUri()` em `lib/actions/platform-mfa.js`: usa o valor tal e qual quando já é data-uri e só prefixa o SVG em bruto.
2. **Hydration mismatch no «há X minutos».** `MfaSetup` é um Client Component e `haQuanto()` depende do instante do render: o servidor dizia «há 3 minutos» e o cliente «há 2», e o React regenerava a árvore. As distâncias passaram a estar em elementos com `suppressHydrationWarning`; as datas absolutas (`dataHora`, fuso fixo de Luanda) são determinísticas e ficaram como estavam.

Aproveitou-se para corrigir o **layout do campo do código** (a etiqueta é um `<label>` inline e o campo, estreito, cabia ao lado do texto em vez de ficar por baixo — `.interno-input--code` passou a `display: block`) e para **tirar o `interno-foot-sub` dos cartões claros**: essa classe é branca translúcida, serve a sidebar escura e tornava o texto dos passos quase ilegível sobre o fundo claro (passou a `interno-hint`).

### Task 4.2: Gate e shell

- [x] **Step 1:** `app/interno/(console)/layout.js` espelha o do portal: `getPlatformSessionVerbose()` → sem sessão, `redirect('/interno/login?motivo=…&detalhe=…')`; `export const dynamic = 'force-dynamic'`. A navegação nasce da matriz no servidor (um item só existe se o nível tiver a acção) e o `role` está no topo e no rodapé.
- [x] **Step 2:** `components/interno/InternoShell.jsx` com sidebar (Painel, Farmácias) e a lista «Brevemente» — um link para uma página que não existe é pior do que a sua ausência. _(Actualizado a 17/10/2026: a sidebar tem agora Painel · Farmácias · Leads · Planos e «Brevemente» ficou só com Auditoria · Equipa; os Leads entram pela acção `lead.read`, por isso um nível sem ela não vê a secção.)_ Tokens/classes próprios da área interna (`styles/globals.css`, secção `interno-*`); **não** reutiliza `PortalShell`. O rodapé diz o estado do segundo factor («Sem autenticador inscrito» / «Sessão só com senha» / «Segundo factor verificado nesta sessão»), e o topo mostra o aviso `Só senha` quando é esse o caso. _(Actualizado a 17/10/2026: `/interno/definicoes` reúne o nome de utilizador, a senha, o segundo factor (o mesmo `MfaSetup`, embebido) e o fecho das outras sessões; a entrada «Definições» existe para todos os níveis porque é a própria conta e não uma acção da matriz.)_ _(Actualizado a 17/10/2026: a moldura passou a ser a da plataforma de gestão — `components/interno/InternoShell.jsx` + `InternoDrawer.jsx` + `BotaoTema.jsx` e o mapa `navegacao.js`; sidebar escura de 16rem com ícones, numeração 01…, avatar/iniciais e saída em ícone, topbar fina no desktop e topbar escura de 4rem no mobile com drawer pela direita — mola, overlay, Esc, foco preso e fecho ao navegar. A navegação passou a lista plana com `icone`, e o hamburger vive no próprio drawer para o ciclo de foco ser local. O estado do segundo factor continua a ser o link para `/interno/mfa`.)_
- [ ] **Step 3 (por fazer):** smoke com uma conta de nível `suporte` a confirmar na UI que só vê o que a matriz permite. O `suporte` **tem** `pharmacy.view` (vê a lista e a ficha, com os cortes de `viewScope`), mas não tem editar/verificar/desactivar — a verificação desta passagem foi feita com `superadmin`, e a matriz em si está coberta pelo teste das 135 células do Phase 3.

---

## Phase 5 — Farmácias: lista, ficha e edição

### Task 5.1: Lista

- [x] **Step 1:** `app/interno/(console)/farmacias/page.js` (Server) → `listPharmacies(filtros)` em `lib/actions/platform-pharmacies.js` com filtros (município, estado, selo, plano — incluindo «sem plano» — e stock fresco/parado) e contagens de topo. A agregação vive na base de dados: `platform_pharmacy_overview()` (migração **0029**), porque o PostgREST não faz `group by` e sem ela a lista arrastaria seis tabelas inteiras para contar linhas.
- [x] **Step 2:** `components/interno/PharmacyTable.jsx`: farmácia, município, estado, selo, plano, contas, stock confirmado (com a janela de 72 h do Localizador), reservas abertas, última acção e link para a ficha. As colunas operacionais só entram no payload quando `viewScope(role).operacao` é `true` — um `faturacao` não recebe stock nem reservas.

### Task 5.2: Ficha

- [x] **Step 1:** `app/interno/(console)/farmacias/[id]/page.js` com os blocos: **Identificação** (nome, slug, município, morada, contactos, horário, mapa, página pública), **Estado e plano** (activa/inactiva, selo, plano e prazos, contas, perfis, chaves, destinos, reservas, notas internas), **Contas da farmácia** (e-mail e estado do Auth, convite aceite ou por aceitar), **Perfis do balcão** (só leitura), **Integração**, **Stock confirmado**, **Reservas recentes** (contacto só com `viewScope.contacto`) e **Histórico** (trilha dessa farmácia, com o antes/depois e o motivo).
- [x] **Step 2:** Acções no cabeçalho — _Editar ficha_, _Dar/Retirar selo_ e _Desactivar/Activar farmácia_ — com `ConfirmActionModal` e **motivo obrigatório** na desactivação. **Pendente nesta fase:** _Confirmar stock por telefone_ (`stock.confirm_by_phone`, grava `stock_items` com `source='team'`) não foi construído nesta passagem; a matriz já tem a acção e a 0022 já tem a origem, falta o formulário.

### Task 5.3: Conversão de lead — FEITA em 17/10/2026

> A `pharmacy_leads` existia desde a 0001 sem quem a lesse: o formulário da landing escrevia e
> mais nada. Esta passagem dá-lhe a ordem (o funil), o dono (quem mexeu, pela trilha) e — o que
> interessa — a **conversão**: farmácia, convite ao dono e funil fechado numa só operação, com o
> mesmo `requestId` na trilha.

- [x] **Step 1:** `app/interno/(console)/leads/page.js`: o funil por estado, com os KPIs, o filtro por estado e a coluna **Última mudança** lida da TRILHA (quem, quando e com que motivo) — uma leitura só para todos os leads, não uma por lead. Duas decisões que o enunciado não fixava: a lista abre com o **trabalho do dia** («Por atender», os leads que ninguém tocou) e só depois o resto do funil por proximidade do fecho (`acordo → demonstração → em conversa → convertidos → descartados`) — uma lista por data enterra um acordo de ontem por baixo de cinco contactos novos; e mover um lead é um gesto de linha (`LeadFunnelActions.jsx`: `select` + nota opcional + botão), não um diálogo com motivo obrigatório — um modal a cada mudança de estado faz a equipa inventar motivos ou não mexer no funil. O que a trilha guarda é o antes/depois, quem e quando; a nota, quando existe, é o motivo.
- [x] **Step 2:** Botão **Converter** → ecrã próprio, `/interno/leads/converter/[id]` (`LeadConvertForm.jsx`), com os dados do lead **pré-preenchidos** (nome, município, telefone, e-mail de contacto, mensagem) e os dois campos que o lead não tem — nome e e-mail do **dono**. Ao gravar, `convertLead()` cria a farmácia, convida o dono e fecha o funil, tudo com o mesmo `requestId` (`newRequestId()`), e o ecrã passa a mostrar os **três passos lidos da trilha** com o actor, a hora e o pedido que os liga.
- [x] **Fora do enunciado (decidido na passagem):** (a) a operação é **reentrante** — o `pharmacy_leads.pharmacy_id` (0031) grava-se assim que a farmácia existe, por isso um convite falhado não cria uma segunda farmácia na tentativa seguinte (e um índice único parcial garante-o também na base); (b) `onboarded` **não se escolhe à mão** (`ESTADO_RESERVADO`): é o resultado da conversão, e um clique a pôr lá um lead sem farmácia faria o funil mentir; (c) `lead.convert` passa a exigir **motivo** no envelope — a operação inclui `account.invite`, que a matriz já o exige, e sem isto um POST directo a `convertLead` escapava à exigência que o convite sozinho tem; (d) a conversão pede as **três** acções (`lead.convert` + `pharmacy.create` + `account.invite`) via `podeConverter()`, partilhada pelo ecrã e pela acção, para que o botão e o servidor decidam igual.
- [x] **Migração **0031\*\*: `pharmacy_id` (FK, `on delete set null` — apagar uma farmácia não pode levar atrás o registo comercial de quem entrou), `onboarded_at` (não derivado do `status`, que pode voltar atrás), `updated_at`/`updated_by`, o índice único parcial do `pharmacy_id` e o `(status, created_at desc)` do funil. O `DELETE` fica revogado ao `service_role`: um lead nunca se apaga, sai por `descartado`.

---

**Evidência (16/10/2026, projecto `mxqhmtpshlpnbkninawt`) — percorrido no browser, não só compilado**

| Prova                                     | Como                                                                                                       | Resultado                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                                     | `npm run build`                                                                                            | **0 erros** (`exit=0`), com `/interno`, `/interno/login`, `/interno/farmacias` e `/interno/farmacias/[id]` na tabela de rotas; `prettier --check` limpo nos ficheiros desta passagem          |
| Agregação da lista                        | `platform_pharmacy_overview()` (0029)                                                                      | uma linha por farmácia (`9` farmácias → `9` linhas, verificado dentro da própria migração) e a lista mostra plano, contas, stock confirmado nas últimas 72 h, reservas abertas e última acção |
| Filtros e contagens                       | lista com município/estado/selo/plano/stock                                                                | `10` farmácias (9 + a de teste), `3 sem selo`, `10 a mostrar`; filtros a reduzir a lista sem perder os totais                                                                                 |
| Login em dois passos                      | conta descartável com TOTP inscrito                                                                        | passo 2 («Passo 2 de 2») com `factorId`/`challengeId` no formulário; com o código, a sessão entra **`aal2`** e o shell mostra «Segundo factor verificado nesta sessão»                        |
| Edição da ficha                           | _Editar ficha_ → WhatsApp + horário                                                                        | gravado na base **e** na ficha redesenhada; linha na trilha com o actor, o papel e as duas chaves alteradas (`whatsapp`, `opening_hours`)                                                     |
| Verificação (selo)                        | _Dar selo de verificada_                                                                                   | `verified = true` e selo visível na ficha (depois do defeito 1, abaixo)                                                                                                                       |
| **Recusa por falta de segundo factor**    | _Desactivar farmácia_ **com motivo escrito**, sessão `aal1`                                                | mensagem «Esta acção exige o segundo factor…», **0 linhas na trilha** e `active` intacto na base — a acção não acontece _e_ não deixa rasto de que aconteceu                                  |
| Desactivar com motivo                     | o mesmo diálogo, sessão `aal2`                                                                             | `active = false` e trilha `pharmacy.deactivate` com `reason` (e o antes/depois de `active`)                                                                                                   |
| Corte do directório                       | `GET /farmacia/teste-ficha-interno` com a farmácia inactiva                                                | «esta farmácia não existe» — sai do Localizador; a ficha de produção continua a render no mesmo pedido de controlo                                                                            |
| Corte do portal                           | login em `/portal/login` com a conta da farmácia inactiva                                                  | «Esta conta não tem acesso ao portal — fale com a equipa Conheça Farmácia.»                                                                                                                   |
| Activar                                   | _Activar farmácia_ (sem motivo, não é destrutiva)                                                          | `active = true`, trilha `pharmacy.activate`                                                                                                                                                   |
| **O caminho do cliente continua travado** | pedido `authenticated` (token real da farmácia, sem passar pela UI) a tentar `verified`, `active` e `slug` | **1 linha actualizada** (a RLS deixou a farmácia escrever na sua linha) e os **três campos iguais aos de origem** — o trigger repôs-os                                                        |
| Gate a nomear a razão                     | `/interno/farmacias` com cookies de uma conta entretanto apagada                                           | `redirect` para `/interno/login?motivo=SEM_USER` com «Sem sessão iniciada.» no ecrã                                                                                                           |
| Limpeza                                   | conta interna + conta de farmácia + farmácia de teste + as linhas da trilha                                | `9` farmácias, `9` subscrições, `2` contas de farmácia, `0` contas internas, trilha `0` — o estado de partida                                                                                 |

**Defeitos encontrados e corrigidos nesta passagem (3)**

1. **O trigger da 0005 repunha `verified`/`active` em silêncio.** A acção _Dar selo_ escrevia, o Postgres repunha o valor antigo e a trilha ficava a registar uma mudança que nunca aconteceu — medido: linha `pharmacy.verify` na trilha com `pharmacies.verified` ainda `false`. Pior do que uma acção que falha: uma auditoria que mente. Corrigido na migração **0030**: o caminho privilegiado (`service_role` pelo PostgREST, ou a ligação de administração sem claims) passa a poder mudar as duas colunas; qualquer pedido **com claims** — o portal da farmácia — continua a recebê-las repostas, como na 0005. `slug` e `created_at` continuam intocáveis para todos. A migração mede as duas direcções com uma farmácia de sonda e apaga-a antes de decidir se passou. **E as Server Actions deixaram de confiar na escrita:** `setPharmacyVerified`/`setPharmacyActive` lêem a linha de volta e devolvem `SEM_EFEITO` (com log) se o valor gravado não for o pedido, para que a trilha nunca seja mais optimista do que a base.
2. **A página de login tratava uma sessão `aal1` como sessão completa.** A action devolvia `MFA_NECESSARIO` com o desafio aberto, o React redesenhava a rota e a página — ao ver cookies de sessão — redireccionava para `/interno`. O passo do código nunca aparecia: uma conta **com** TOTP inscrito entrava só com a senha, e a única coisa a travá-la era a recusa das acções sensíveis. Corrigido com `mfa.pendente` em `lib/platform/session.js` (`nextLevel === 'aal2'` **e** `currentLevel !== 'aal2'`) e a página a mandar embora apenas sessões completas (para uma conta sem factor inscrito, `aal1` já é o máximo dela).
3. **A migração 0019 (`pharmacies.email`) nunca tinha sido aplicada a este projecto.** O portal escreve nessa coluna desde a fase do perfil (`updatePharmacyProfile`, 0019) — ou seja, «Guardar» em `/portal/sessão` falhava com `Could not find the 'email' column of 'pharmacies' in the schema cache`. Aplicada nesta passagem (é idempotente: `add column if not exists`), o que também desbloqueia o e-mail de contacto na ficha da área interna.

**Limitações desta passagem:** (a) o smoke com um nível `suporte` (Task 4.2 Step 3) não foi feito — a verificação foi com `superadmin`; (b) _Confirmar stock por telefone_ (Task 5.2 Step 2) não foi construída; (c) a linha de trilha falsa que o defeito 1 deixou foi removida com o resto das linhas da conta de sonda, para não ficar na trilha de produção um registo de uma mudança que não aconteceu.

### Evidência da Phase 5.3 (17/10/2026, projecto `mxqhmtpshlpnbkninawt`) — a OPERAÇÃO medida na trilha

Quatro leads de sonda (`Farmácia Sonda …`, criados por SQL e apagados no fim) e uma conta interna
`superadmin` descartável (`sonda-conversao@…`, sem TOTP — `lead.convert` não está em
`ACOES_COM_MFA`, pede motivo; **conta e leads apagados no fim**). Percorrido no browser.

| Prova                                          | Como                                                                        | Resultado                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funil (Step 1)                                 | `/interno/leads` com 3 leads em `novo`                                      | KPIs (por atender 3, convertidos 0), filtro por estado e as duas secções («Por atender» primeiro). Cada linha com contacto, `última mudança` e o bloco de mover                                                                                                             |
| Mover no funil                                 | _«Mover para… → Em conversa»_ + nota, na linha                              | `status='em_conversa'` e `lead.update` na trilha com `before={estado:novo}` / `after={estado:em_conversa}` e o motivo da nota; a lista passou a mostrar «agora mesmo · sonda-conversao@… — Contacto feito por telefone; pediram proposta.» na coluna Última mudança         |
| `onboarded` não se escolhe                     | o `select` da linha                                                         | a opção **«Convertido» não existe** (só `em_conversa`, `demonstracao`, `acordo`, `descartado`) → `ESTADO_RESERVADO` no servidor é o mesmo que a UI mostra                                                                                                                   |
| Converter (Step 2)                             | _Converter_ → ecrã com o lead pré-preenchido                                | nome, município (Talatona), telefone, e-mail e a mensagem do lead vieram do formulário da landing; o botão só abre com o **motivo** escrito                                                                                                                                 |
| **A operação, numa trilha só**                 | gravar com um endereço da equipa                                            | **`pharmacy.create` + `account.invite` + `lead.convert` com o MESMO `request_id`** (`370b77ce-…`), o mesmo motivo nos três e `actor_role=superadmin`; `pharmacy_leads.status='onboarded'`, `onboarded_at` preenchido e `pharmacy_id` a apontar para a farmácia criada       |
| O ecrã do resultado                            | o mesmo ecrã, redesdobrado pela acção                                       | os **três passos com actor e hora** lidos da trilha e o `requestId` em `interno-mono` — a informação sobrevive ao `revalidatePath` (ver defeito 2)                                                                                                                          |
| **Convite a meio**                             | converter um lead cujo dono é uma conta **já existente**                    | `EMAIL_EM_USO`: **farmácia criada, funil ABERTO** (o lead já aponta para a farmácia) e **uma** linha na trilha (`pharmacy.create`, `b091409a-…`); o ecrã muda para _«Terminar a conversão»_ com o aviso `CONVERSÃO A MEIO`                                                  |
| **A segunda tentativa não duplica a farmácia** | repetir a conversão do mesmo lead, com outro endereço                       | `account.invite` + `lead.convert` com um `request_id` NOVO (`8606dd1b-…`) e **nenhum `pharmacy.create`** — a farmácia é a MESMA (`b160a862-…`) da tentativa anterior. É a reentrância: 2 leads e 3 tentativas → **3** `pharmacy.create` no total e 0 farmácias duplicadas   |
| **O limite do remetente**                      | converter um lead cujo dono é um endereço **fora da equipa** (`@gmail.com`) | `EMAIL_LIMITE` com o detalhe do fornecedor à vista: `email rate limit exceeded` — o limite de **2 mensagens/hora** do remetente integrado (Task 6.1). Só a linha `pharmacy.create` na trilha; o funil ficou aberto, com o aviso a dizer por quem e quando a farmácia nasceu |
| O caminho de volta                             | a mesma lead, `/interno/leads`                                              | «Farmácia criada, convite por sair» na coluna do estado e o botão _Terminar conversão_ em vez de _Converter_                                                                                                                                                                |
| Convite não aceite                             | `auth.users` depois do caminho feliz                                        | `dono-feliz@conhecafarmacia.com` criado com `email_confirmed_at = null` (o convite confirmou o Step 3 da Task 6.2 de passagem)                                                                                                                                              |
| `npm run build` + `eslint`                     | build completo, depois das correcções                                       | **0 erros**, com `/interno/leads` e `/interno/leads/converter/[id]` na tabela de rotas; `prettier` limpo nos ficheiros desta passagem                                                                                                                                       |
| Limpeza                                        | farmácias, leads, contas e as 8 linhas de trilha da sonda                   | `9` farmácias, `9` subscrições, `2` contas de farmácia, `1` lead (o anterior à passagem), trilha `5` (só os `plan.*` da Phase 7), `0` utilizadores `sonda` — o estado de partida                                                                                            |

**Defeitos encontrados e corrigidos nesta passagem (2, ambos meus)**

1. **O aviso de segundo factor anunciava uma recusa que o servidor não ia dar.** O formulário nasceu a copiar o do primeiro plano e dizia «O servidor vai recusar com `MFA_NECESSARIO`» — mas `lead.convert` **não** está em `ACOES_COM_MFA` (o que a matriz aqui exige é o motivo). Medido com a sessão `aal1` da sonda: a operação passava. Quem lesse o aviso terminava a sessão para nada; o aviso saiu e ficou um comentário a dizer porquê.
2. **O resultado da operação desaparecia no instante seguinte a gravar.** O painel dos três passos e o `requestId` viviam só no estado do formulário, e a acção chama `revalidatePath` — o Next redesdobra a rota, o ramo do servidor passa a ser «já convertido» e o formulário é desmontado: o ecrã mostrava «Este lead já foi convertido» e **nunca** mostrava o `requestId`. Corrigido com `LeadConvertResult.jsx` (um só painel) e — o que interessa — com os passos a serem lidos da **TRILHA** (`operacaoNaTrilha()`: o `request_id` do `lead.convert`, e as linhas desse pedido são os passos). O resultado passou a ser durável: reabrir o lead dias depois mostra a mesma operação, com actor e hora.
3. **A tradução dos erros do convite não cobria o erro mais provável.** O ramo medido no fim não foi o endereço recusado pelo remetente integrado e sim o **limite de envio** (`over_email_send_rate_limit`, 429), que caía no genérico «o convite não saiu». Acrescentado `EMAIL_LIMITE` com a explicação (2/hora, esperar e repetir sem duplicar, SMTP próprio como solução) e o **detalhe do fornecedor à vista** no aviso — sem ele a equipa ia procurar a avaria no sítio errado.

**Limitações desta passagem:** (a) o ramo `EMAIL_NAO_AUTORIZADO` (o remetente integrado a recusar um endereço fora da equipa) **não foi observado**: o limite de 2/hora chegou primeiro e o ramo ficou por exercer — o que se mediu foi o do limite, que é o que acontece hoje na prática; (b) a conversão exige uma sessão interna real, por isso a medição foi feita no browser com uma conta descartável `superadmin` (`aal1`) — os níveis `onboarding`/`suporte` não foram percorridos; (c) os `pharmacy.create`/`lead.convert`/`lead.update` de sonda **foram removidos da trilha** (papel dono da tabela) para não deixar na trilha de produção registos de farmácias que já não existem — o `service_role` não os consegue apagar, e é de propósito (append-only).

---

## Phase 6 — Contas: convite e ciclo de vida

### Task 6.1: Envio de e-mail pelo Resend (bloqueante)

> **DECISÃO (17/10/2026): Resend, entregue pelo código — não pelo remetente do Supabase.**
> O remetente integrado do Auth está limitado a **2 mensagens/hora** e só entrega a
> endereços da equipa do projecto: com ele é tecnicamente impossível convidar uma
> farmácia. O convite passou a ser gerado por `generateLink` (tipo `invite`) — que
> cria/reaproveita a conta por confirmar e devolve o link **sem
> enviar nada** — e a mensagem é entregue por `POST https://api.resend.com/emails`
> (`lib/email.js`). A conta e o token continuam a ser do Supabase Auth; só o
> transporte e o template são nossos. Medido em 17/10/2026: uma segunda chamada a
> `generateLink` para o mesmo endereço devolve o **mesmo** `user.id` e um
> `action_link` novo — por isso um envio falhado repete-se sem apagar nada.
>
> **Porque não uma Edge Function:** o convite nasce numa Server Action e o envio
> tem de partilhar o `request_id` da operação, o log e o deploy com ela. A Edge
> Function só seria necessária para o _Send Email Hook_ (todos os e-mails do Auth),
> e o único e-mail que o produto envia hoje é o convite. Para os e-mails do Auth
> que venham a existir (reposição de senha), o caminho continua a ser o SMTP
> próprio — Step 5.

- [x] **Step 1:** Trocar `inviteUserByEmail` por `generateLink` + Resend em `convidarDono` (`lib/actions/leads.js`), com template em PT (`emailConvite`) e erros traduzidos (`EMAIL_NAO_CONFIGURADO`, `EMAIL_NAO_AUTORIZADO`, `EMAIL_RECUSADO`, `EMAIL_LIMITE`, `EMAIL_FALHOU`). O estado parcial é o mesmo de antes: farmácia criada, funil aberto, conversão repetível.
- [x] **Step 2:** **Verificar o domínio no Resend** (Domains → Add domain → `conhecafarmacia.com`) e publicar os registos DNS (SPF/DKIM) que ele mostrar. Sem domínio verificado, o Resend só entrega ao endereço da própria conta, a partir de `onboarding@resend.dev` — não serve para convidar farmácias. _(Domínio já verificado na conta Resend, 17/10/2026.)_
- [ ] **Step 3:** Criar a API key no Resend com permissão **Sending access** e pôr no ambiente: `RESEND_API_KEY` (secreta, só no servidor) e `RESEND_FROM` (`Conheça Farmácia <nao-responder@conhecafarmacia.com>`, no domínio verificado). Em `.env.local` e nas variáveis do projecto na Vercel (Production e Preview); depois, redeploy. _(Feito em `.env.local` a 17/10/2026; falta a Vercel.)_
- [x] **Step 4:** Verificar a entrega real (Gmail + Outlook + um endereço .ao) e medir o tempo até chegar. Confirmar que o link abre `/portal/login` com o convite válido. Guardar o resultado aqui (nota datada). _(Envio real a `geral@conhecafarmacia.com` pelo próprio `lib/email.js` a 17/10/2026: id `01a149d4-efaa-7b80-b81f-0988aa0acb7a`, `last_event=delivered`, remetente no domínio verificado. O clique no link ainda depende da página de aceitação — Task 6.2 Step 2, por fazer.)_
- [ ] **Step 5 (só para e-mails do Auth que não sejam convites):** quando existir reposição de senha (`resetPasswordForEmail`), configurar SMTP próprio em _Authentication → Emails → SMTP Settings_: host `smtp.resend.com`, port `465`, user `resend`, password = a mesma API key, sender no domínio verificado. O limite inicial sobe para **30/hora**, ajustável em _Authentication → Rate Limits_. O template **Invite user** do Auth deixa de ser usado — o convite é o nosso.

### Task 6.2: Convidar

- [ ] **Step 1:** `invitePharmacyAccount({ pharmacyId, email, displayName, reason })`: guard `requirePlatform('account.invite')` → cria/garante farmácia → `admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { display_name } })` → upsert em `admin_users` (`role='farmacia'`, `pharmacy_id`) → `logPlatformAudit`. Devolve `{ ok: true, invitedAt }` ou `{ ok: false, error }` com códigos (`EMAIL_EM_USO`, `FARMACIA_INACTIVA`, `SEM_PERMISSAO`).
- [x] **Step 2:** Página de aceitação em `/portal/convite`: o link do e-mail traz `token_hash` e aponta para `/portal/convite/confirmar`, um Route Handler que troca o token por sessão (`verifyOtp({ type: 'invite' })`) e redirecciona sem o hash no URL; a página pede a senha e a Server Action `definirSenhaConvite` grava-a com `auth.updateUser({ password })`. Nada de senhas escolhidas por nós; o link é nosso, não o `action_link` do Supabase (o fragmento dele não é legível no servidor).
- [ ] **Step 3:** Testar o caminho feliz com um e-mail real e confirmar em `auth.users` que `email_confirmed_at` só é preenchido quando o convite é aceite.

> **Verificação do Step 2 (17/10/2026):** link com `token_hash` de uma conta de sonda aberto no browser → `/portal/convite/confirmar` trocou o token por sessão e redireccionou para `/portal/convite?convite=1` sem o hash no URL; a senha definida no formulário levou a `/portal` (e daí a `/portal/perfis`, por a farmácia ainda não ter perfis de balcão). `email_confirmed_at` ficou preenchido e um `signInWithPassword` posterior com a senha escolhida funcionou. Um `token_hash` inválido devolve `?erro=LINK_EXPIRADO` e a página explica que o convite expirou. Conta, linha em `admin_users` e ficheiros de sonda apagados. **Falta** o Step 3: o mesmo percurso a partir de um e-mail recebido numa caixa real.

### Task 6.3: Reenviar, revogar, suspender, repor, transferir

- [x] **Step 1 (17/10/2026):** **Reenviar** na ficha da farmácia, pela acção `account.resend`. O botão vive na linha da conta com convite **por aceitar** (`components/interno/PharmacyInviteResend.jsx`), pede motivo (`ConfirmActionModal`) e chama `resendPharmacyInvite` (`lib/actions/platform-pharmacies.js`). A geração do link e a entrega pelo Resend saíram de `lib/actions/leads.js` para **`lib/invites.js`** (`convidarDono`), partilhado com a conversão: um reenvio e um convite inicial não podem divergir no `type` do `generateLink` nem no `admin_users`. O servidor relê a conta (tem de ser **desta** farmácia) e recusa `CONVITE_JA_ACEITE` quando `email_confirmed_at` já existe — nesse caso o caminho é a reposição de senha. `account.resend` passou a `motivo: true` na matriz, e a trilha grava `account.resend` com `reason`, `request_id` e `before/after` (`convite: pendente → reenviado`). _Verificado no browser a 17/10/2026 com conta de sonda: o modal só destrava com motivo; o envio devolveu `ok` e a linha apareceu no Histórico com o motivo; com a conta confirmada **entre abrir e confirmar**, o servidor recusou com a mensagem inline e **sem** segunda linha na trilha. Contas, farmácia e linhas de teste apagadas._
- [x] **Step 2 (18/10/2026):** **Revogar convite pendente**, pela acção `account.revoke` (matriz já com `mfa` + `motivo`). O botão vive na mesma célula de «Reenviar convite», só nas contas com convite **por aceitar** (`components/interno/PharmacyInviteRevoke.jsx`), e chama `revokePharmacyInvite` (`lib/actions/platform-pharmacies.js`). O servidor relê a conta e confirma que é **desta** farmácia; recusa `CONVITE_JA_ACEITE` quando `email_confirmed_at`/`confirmed_at`/`last_sign_in_at` existem (nunca se apaga uma conta que já entrou — aí o caminho é suspender) e `account.revoke` exige `aal2`. O `deleteUser` apaga só o `user` do Auth; a linha de `admin_users` cai pela FK `on delete cascade` (0001) e nada mais é tocado — a conta pendente nunca teve dados de negócio. A trilha grava `account.revoke` com `reason`, `request_id`, o `before` completo (e-mail, nome, `convite: pendente`, farmácia) e `after: null`. A confirmação no ecrã vive no URL (`?revogado=…`, e `&trilha=0` quando a trilha falha), porque a linha apagada desaparece no `router.refresh()` e um aviso dentro dela desaparecia com ela. _Verificado no browser a 18/10/2026 com uma farmácia e quatro contas de sonda (já apagadas): `superadmin` em `aal2` revogou o convite → **0** `auth.users`, **0** `admin_users` e **1** linha `account.revoke` com o motivo; com o convite aceite **depois** de a página abrir, o servidor recusou com a mensagem inline e a conta ficou intacta (**0** linha nova na trilha); numa sessão só com senha (`aal1`) o mesmo clique devolveu `MFA_NECESSARIO`, também sem apagar nada. Contas, farmácia e a linha de sonda removidas — trilha de volta às 5 linhas._
- [ ] **Step 3:** **Suspender**: `updateUserById(userId, { ban_duration: '876000h' })` **e** `admin_users`/farmacia em estado inactivo. Um ban não mata sessões já emitidas — o corte efetivo é o `pharmacies.active = false` que `getPharmacySession` já exige, mais `pharmacy_staff.active = false` se aplicável. **Nunca** `delete`.
- [ ] **Step 4:** **Repor acesso**: `resetPasswordForEmail` no e-mail do dono (auditado com motivo).
- [ ] **Step 5:** **Transferir titularidade**: convite ao novo dono → confirmação → desactivar a conta antiga; exige `team.manage`-like dupla aprovação (pede `onboarding`, aprova `superadmin`) e motivo.

---

## Phase 7 — Planos: atribuir, mudar, gravar estado

> **ESTADO: FEITA em 16/10/2026** — o ciclo completo (primeiro plano, experiência, graça,
> suspensão e retoma) percorrido no browser com uma farmácia de sonda, medida por SQL na
> `pharmacy_subscriptions` e na trilha. A sonda foi apagada no fim (9 farmácias, 9
> subscrições, como antes); ficam **registos `plan.*` na trilha** sem farmácia associada —
> é de propósito, a trilha é append-only, e o `actor_email` fica gravado.
>
> **Segunda passagem, 17/10/2026** — o **fim do prazo** passou a valer (decisão do §4.2):
> experiência ou graça terminadas põem a farmácia no plano de entrada na leitura, e o painel
> da ficha ganhou o caminho de volta. Medido com uma segunda sonda (declarada na tabela
> abaixo), também apagada no fim.

### Task 7.1: Server Actions

- [x] **Step 1:** `lib/actions/platform-plans.js`: `assignPlan({ pharmacyId, planCode, modo, dias, notas, motivo })`, `startTrial({ pharmacyId, planCode, dias, motivo })`, `startGrace({ pharmacyId, dias, motivo })`, `suspendForBilling({ pharmacyId, motivo })`, `resumePlan({ pharmacyId, motivo })` e `changePlan(...)`. Todas com `requirePlatform(...)` (matriz + `aal2` + motivo) e `logPlatformAudit` com `before`/`after` (`plano`, `estado`, `experiencia_ate`, `graca_ate`, `notas`). **Duas decisões face ao enunciado:** o prazo pede-se em **dias** (1–365), não em data absoluta — quem negoceia diz «20 dias de graça», e a data calcula-se num sítio só; e o `plan_code` **não muda** durante uma suspensão (o que desce é o plano _em vigor_), para que retomar devolva exactamente o que a farmácia tinha.
- [x] **Step 2:** `getSubscriptions()` (todas as farmácias, **incluindo as que ainda não têm plano**) e `getPlanHistory(pharmacyId, limite)` (trilha filtrada por acção `plan.*`), para o ecrã. Há ainda `getPrimeiroPlano(pharmacyId)`, que serve o ecrã do primeiro plano.

### Task 7.2: Ecrã

- [x] **Step 1:** `app/interno/(console)/planos/page.js`: KPIs (por atribuir, em experiência, em graça, **prazos terminados**, suspensos, activos, prazos a expirar — os seis primeiros particionam as farmácias: um prazo vencido não conta como «em experiência»), a secção **«Primeiro plano por atribuir»** (as farmácias recém-criadas, que é onde se vê quem entrou e ainda não tem plano), a tabela de subscrições — ordenada por **urgência** e não por alfabeto (prazo **terminado**, depois o que vai terminar, depois o que pede decisão) — com prazo, notas internas e histórico do antes/depois.
- [x] **Step 2:** `PlanPanel.jsx` na ficha da farmácia (mudar plano, iniciar experiência, dar graça, suspender por pagamento, retomar) com `PlanActionModal.jsx` — um só diálogo para as cinco acções, porque partilham a anatomia (o que vai acontecer, antes/depois, motivo obrigatório). Uma farmácia **sem** plano não se resolve num diálogo: o botão é um link para `/interno/planos/primeiro-plano/[id]` (`FirstPlanForm.jsx`), o único caminho que cria a linha da 0028.

**Evidência (16/10/2026, farmácia de sonda `teste-planos-interno`, já apagada)**

| Prova                                             | Como                                                                                                                        | Resultado                                                                                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primeiro plano                                    | `/interno/planos` → «Atribuir o primeiro plano» → ecrã do primeiro plano, Gestão em experiência de 10 dias com nota interna | linha criada na 0028 (`plan_code=gestao`, `status=trial`, `trial_until`+10 d, `notes` gravadas) e `plan.assign` na trilha com `before: null`, o `after` completo e o motivo                         |
| Experiência → graça                               | ficha → «Dar graça», 20 dias                                                                                                | `status=graca`, `grace_until`+20 d, `trial_until` limpo; `plan.grace` com `trial → graca`                                                                                                           |
| Graça → suspensão                                 | «Suspender por pagamento»                                                                                                   | `status=suspenso` e **`plan_code` intacto** (`gestao`); `plan.suspend` com `graca → suspenso`                                                                                                       |
| **O corte chega ao produto**                      | portal da farmácia com o plano suspenso                                                                                     | Movimentos bloqueado, com o nome da função, o plano que a abre e o contacto                                                                                                                         |
| Retoma                                            | «Retomar plano»                                                                                                             | `status=activo`, prazos limpos; `plan.resume` com `suspenso → activo`; o portal volta a abrir Movimentos **sem nova sessão**                                                                        |
| **O servidor recusa, não só a página**            | sessão só com senha (`Só senha` no topo), «Dar graça» com motivo                                                            | «Esta acção exige o segundo factor…»: **0** alterações na base e **0** registos novos na trilha (4 antes, 4 depois)                                                                                 |
| Leitura sem segundo factor                        | `/interno/planos` na mesma sessão de senha                                                                                  | ecrã completo, KPIs e histórico — ver defeito 1                                                                                                                                                     |
| Painel de entrada                                 | `/interno` com a farmácia suspensa                                                                                          | «Planos a rever: 1» e três pontos de atenção para a mesma farmácia (stock, plano, selo)                                                                                                             |
| **O prazo terminado desce o plano** (17/10)       | sonda nova com `gestao`/`trial` e `trial_until` **dois dias no passado** → portal                                           | chip «Localizador · experiência terminada» e Movimentos bloqueado com «O período de experiência terminou, por isso o portal voltou ao plano Localizador»                                            |
| **É o prazo, não o estado** (17/10)               | a MESMA linha, só com `trial_until` movido para +5 dias (um `update` em SQL)                                                | chip «Gestão · Em experiência» e Movimentos **aberto** — o `status` é o mesmo (`trial`); o que mudou foi a data                                                                                     |
| Ecrãs internos com o prazo terminado (17/10)      | `/interno/planos` e a ficha da mesma farmácia                                                                               | KPI «Prazos terminados: 1» com «Em experiência: 0» (não conta o que já acabou), linha com «em vigor: Localizador» e chip «terminado» no prazo, ficha com «Em vigor: Localizador — o prazo terminou» |
| Ouvir a sonda no portal depois de retomar (17/10) | «Retomar plano» na ficha com o prazo terminado                                                                              | `status=activo`, prazos limpos, `plan.resume` com `trial → activo`; o portal voltou a abrir Movimentos com o chip «Gestão» — o caminho de volta existe e funciona                                   |
| `npm run build`                                   | build completo                                                                                                              | **0 erros**; `prettier --check` limpo nos ficheiros desta passagem                                                                                                                                  |
| Limpeza                                           | apagar as 3 contas de sonda e a farmácia                                                                                    | 9 farmácias, 9 subscrições, 2 contas — como antes da verificação                                                                                                                                    |

**Defeito encontrado e corrigido na segunda passagem (17/10):** com o prazo terminado, o painel da ficha **não oferecia caminho de volta**. O botão «Iniciar experiência» só aparecia quando o estado não era `trial` (ou seja, escondido exactamente no caso em que ele faz sentido) e «Retomar plano» só existia para `suspenso` — por isso quem enfrentasse uma experiência terminada podia mudar o plano e nada aconteceria, porque o prazo velho continuava a mandar. Corrigido: «Retomar plano» aparece com o prazo terminado (e o diálogo explica que o plano negociado volta a vigor, activo desde agora), o botão passa a «Dar experiência nova», e o painel diz por escrito o que aconteceu e quais são as duas saídas. Ficou também uma decisão de código: `fichaPlano` passou a viver em `lib/platform/subscriptions.js`, ao lado da regra do que está em vigor — estava duplicada em `platform-plans.js` e `platform-pharmacies.js`, que é como a ficha diria «Gestão» de uma farmácia que o portal já tratava como Localizador.

**Defeito encontrado e corrigido durante a verificação:** as **leituras** do ecrã dos planos exigiam `aal2`. A matriz marca `plan.change` com MFA (é uma acção de dinheiro) e o guard de leitura reutilizava o de escrita, por isso `/interno/planos` ficava inutilizável numa sessão só com senha — precisamente o caso do `faturacao`, que tem `plan.change` mas pode não ter autenticador inscrito. Corrigido com `requirePlatformRead()` em [lib/platform/session.js](lib/platform/session.js): ler um plano não pede segundo factor; **escrever** continua a pedir, e o servidor recusa (medido acima). Aproveitou-se para o antes/depois do histórico passar a mostrar **só o que mudou, um campo por linha** — inline, `… → "activo"graça_ate: …` lê-se como um só campo.

### Task 7.3: Aplicar os entitlements no portal (a parte que muda o produto)

> **ESTADO: FEITA em 16/10/2026** — portão de plano em 5 páginas, guardas de servidor em 7 acções e chip do plano na sidebar. Verificado ponta a ponta no browser com uma farmácia de teste descartável (criada e apagada no fim; as 9 de produção não foram tocadas).

- [x] **Step 1:** `requireEntitlement(pharmacyId, feature, need)` em [lib/platform/subscriptions.js](lib/platform/subscriptions.js): atende funcionalidades (chave de `FEATURES`) e limites numéricos (`need` contra `entitlements[chave]`), e com o interruptor desligado devolve `ok: true` sem ler a base de dados.
- [x] **Step 2 (com uma excepção deliberada):** guardas em `createApiKey` (`apiKeys`), `saveWebhook` (`webhooks`), `previewStockImport`/`startStockImport` (`importRows`), `createStaffProfile` (`staffProfiles`), `getMyMovements` (`movimentos`), `getSalesReport` (`vendas`), `getPerformanceReport`/`listTeam` (`desempenho`/`equipa`). **Não** foi tocado o `app/api/ingest/stock/route.js`: fechar a ingestão por plano pararia a sincronização das 2 chaves que estão a correr em produção. **Decidido em 16/10/2026:** fica aberta por agora, mesmo com as farmácias no plano de entrada — o limite `ingestPerMinute` já existe no catálogo, é só ligá-lo quando se quiser.
- [x] **Step 3:** `components/portal/PlanGate.jsx` (server component) com o estado bloqueado: diz a funcionalidade, o plano que a abre, que **nada se perdeu** e o contacto (`CONTACT_EMAIL`/`CONTACT_WHATSAPP` de `lib/constants.js`). Na sidebar, o item fora do plano **não desaparece**: fica esbatido com cadeado e um `title` que explica.
- [x] **Step 4:** Ciclo testado com dados reais, e por medição:

**Evidência (16/10/2026, farmácia de teste `teste-planos-portal`, já apagada)**

| Prova                                        | Como                                                                                                                   | Resultado                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chip do plano no portal                      | `document.querySelector('.portal-side-plan')`                                                                          | `Localizador` — e, com a farmácia em `gestao`, `Gestão`                                                                                                                              |
| Itens fora do plano                          | DOM da sidebar, plano de entrada                                                                                       | 5 travados com cadeado (Movimentos, Vendas, Desempenho, Equipa, Integração) e `title` «faz parte de um plano superior»; livres: Visão geral, Atenção, Stock, Reservas, Sessão, Ajuda |
| Página bloqueada                             | `/portal/movimentos` e `/portal/integracao`                                                                            | estado «Função do plano Gestão» com o contacto e «voltar à visão geral» — em **duas** farmácias diferentes (a de teste e a de produção que já tinha sessão no browser)               |
| **O servidor recusa, não só a página**       | plano lido como `gestao`, painel aberto, plano mudado para `localizador` na base de dados, e clique em **Criar chave** | mensagem «Esta função faz parte de um plano superior…» e **0 chaves** criadas (conferido por SQL)                                                                                    |
| Ramo dos limites numéricos                   | o mesmo com a Equipa e `createStaffProfile` (`staffProfiles` = 0 no plano de entrada)                                  | recusa do servidor, **1 perfil** na farmácia (só o de origem); a página recarregou para o estado do plano                                                                            |
| Interruptor a desligar (saída de emergência) | servidor reiniciado com `PLANS_ENFORCED=false`                                                                         | Integração e Equipa renderizam normais, 0 cadeados, chip «Plano Localizador» — o portal volta ao comportamento anterior sem deploy de código                                         |
| Modo por omissão (aplicado)                  | servidor sem variável nenhuma                                                                                          | `/portal/movimentos` bloqueado e 5 itens com cadeado, como desenhado — confirma que a decisão de 16/10/2026 ficou a valer sem depender de configuração                               |
| `npm run build`                              | build completo                                                                                                         | **0 erros**; `prettier --check` limpo nos ficheiros desta passagem                                                                                                                   |
| Limpeza                                      | apagar user + farmácia de teste                                                                                        | contagens de volta ao original: 9 farmácias, 9 subscrições, 1 perfil, 2 chaves, 2 contas                                                                                             |

**Defeito encontrado e corrigido durante a verificação:** com a página já aberta, os painéis de Equipa, Movimentos e Vendas mostravam **«Erro inesperado.»** em vez de explicarem o plano (o mapa de erros desses três componentes não conhecia `PLANO_INSUFICIENTE`). Corrigido nos três, e a página Desempenho passou a devolver o próprio estado do plano quando a acção é recusada, em vez de «recarregue e tente de novo» — que recarregado dava exactamente o mesmo.

---

## Phase 8 — Auditoria: ecrã e exportação

### Task 8.1: Ecrã

- [x] **Step 1 (17/10/2026):** `app/interno/(console)/auditoria/page.js` (só `superadmin`/`auditoria`, por `audit.read`): filtros GET por **acção** (select agrupado, alimentado pela matriz), **nível**, **farmácia**, **autor** (e-mail parcial) e **período** (de/até, inclusivo, meia-noite de Luanda); colunas tempo, autor (e-mail + nível), acção (chave + rótulo), alvo (farmácia com link, ou tabela/registo), motivo e detalhe expansível (`AuditTable`, Client Component) com autor, pedido, IP/user-agent e a tabela **antes/depois** campo a campo (JSON mono, `—` quando a chave não existia). A secção entra na sidebar pelo mesmo filtro da matriz e saiu dos «Brevemente»; `Definições` continua a ser o único item fora do filtro.
- [x] **Step 2 (17/10/2026):** Paginação por **cursor composto** `(created_at, id)`, codificado no URL como `<created_at>~<id>` e aplicado com `created_at < c OR (created_at = c AND id < c.id)`. `id` sozinho não chega: ordena pela data e desempata pelo id, porque a data é a verdade que o ecrã mostra e duas acções podem cair no mesmo instante. O export usa o mesmo cursor (ver 8.2).

### Task 8.2: Exportação (auditada)

- [x] **Step 1 (17/10/2026):** Export CSV com `requirePlatform('audit.export')` (MFA + motivo) e **registo na própria trilha** (`action='audit.export'`, `after={ formato, filtros, linhas, truncado, limite }`, com `request_id`). Em vez de streaming — a decisão do enunciado — o ficheiro é construído em memória com um **tecto de 5 000 linhas** (`MAX_EXPORT`): o export é uma acção de equipa, não um dump, e acima disso o caminho é estreitar os filtros (o CSV leva `-parcial` no nome e `truncado: true` na trilha). Duas consequências assumidas: (a) **falha fechada** — se a linha `audit.export` não ficar gravada, o servidor devolve `TRILHA_FALHOU` e **não entrega CSV**; é a única operação do projecto onde a auditoria é condição e não best-effort, porque um export sem rasto é o que a trilha existe para impedir; (b) o **BOM UTF-8** é acrescentado no download (`AuditExport`), não no servidor: um `U+FEFF` inicial não sobrevive à serialização da Server Action (medido: o blob saía 3 bytes mais curto). O formato (16 colunas, `;`, aspas duplicadas, CRLF, JSON no antes/depois) vive em `lib/audit-csv.js`, puro e testável, ao lado do leitor `lib/csv.js`; a acção só decide QUE linhas levar.
- [ ] **Step 2:** Retenção: definir e documentar (proposta: **5 anos** para acções de conta/plano, 24 meses para leitura; nada de apagar antes disso). Não há prazo universal — a decisão fica escrita no plano.

> **Verificação (17/10/2026):** conta de sonda `superadmin` + farmácia + 55 linhas sintéticas (acções, níveis, farmácias e datas variados; motivos com `;`, aspas e acentos), com 5 linhas reais já na trilha. No browser: a sidebar passou a mostrar **05 Auditoria**; 60 registos, 40 por página, **mais recente primeiro pela data** (o fixture tinha ids em ordem inversa à data — e a página ordenou pela data, como devia); «Mais antigos» levou o cursor `2026-10-08T19:51:48.807+00:00~62` e a segunda página começou em `registo-36`, sem repetir nem saltar nenhum; filtros por acção (11), autor (27) e período 15–16/10 (12) bateram com o total do cabeçalho; o detalhe mostrou autor, pedido, origem e o diff `plan_code: "localizador" → "gestao"`.
> Export com sessão `aal1` → o diálogo avisou do segundo factor e o servidor recusou com `MFA_NECESSARIO`; **nenhuma** linha `audit.export` foi escrita. Inscrito um TOTP real (código calculado do segredo), a sessão passou a `aal2` e o export filtrado por `plan.change` entregou **11 linhas**: blob de 4 365 bytes a começar em `EF BB BF`, 12 linhas de CSV (cabeçalho + 11), `;`, aspas e acentos intactos; a linha `audit.export` apareceu na trilha com motivo, `request_id` e `after.filtros`/`after.linhas=11`. Com a conta `faturacao`, a secção não aparece na sidebar e o URL directo devolve «Sem permissão». Contas, farmácia e linhas sintéticas apagadas (trilha de volta às 5 originais). O **formato do CSV** foi ainda provado à parte, em Node, com ida-e-volta pelo `parseCsv` (`lib/csv.js`): 16 colunas, BOM `EF BB BF`, CRLF, motivo com `;`/aspas/quebra de linha e JSON aninhado no antes/depois.

---

## Phase 9 — Equipa CF (níveis internos)

- [x] **Step 1 (17/10/2026):** `app/interno/(console)/equipa/page.js` (`team.reset_mfa`, superadmin): pessoas, nível, último acesso, MFA activo (factores verificados) e convites pendentes. A leitura é `requirePlatformRead('team.reset_mfa')` (sem `aal2`) e a lista vem de `admin_users` filtrada por `role <> 'farmacia'`, com o estado Auth buscado **por id** (`getUserById`) e não por `listUsers`: a partir de algumas centenas de contas de farmácia, uma página de 200 deixaria membros de fora sem aviso. A secção entrou na sidebar como **06 Equipa** e os «Brevemente» ficaram vazios.
- [x] **Step 1a — reposição do segundo factor (pedido a seguir ao Phase 8):** `lib/actions/platform-team.js` — `resetMemberMfa` exige `requirePlatform('team.reset_mfa')` (MFA + motivo), recusa a **própria conta** (`PROPRIO_FACTOR`), conta de farmácia (`NAO_E_MEMBRO`), conta suspensa (`CONTA_SUSPENSA`) e conta sem factor verificado (`SEM_FACTOR`), e apaga só os factores **verificados** (`admin.auth.admin.mfa.deleteFactor`), o que termina as sessões do alvo — é esse o contrato da Admin API. Depois grava `team.reset_mfa` na trilha com os factores que existiam, o número removido e `sessoes: 'terminadas'`; se a gravação falhar, a resposta continua `ok` (a remoção não se desfaz) mas leva `auditado: false` e o ecrã mostra um aviso, nunca um sucesso limpo. O caso de uma remoção a meio devolve `REPOSTO_A_MEIO` com o que ficou. O ecrã explica antes de abrir o diálogo que a identidade de quem pede tem de ser confirmada por fora (o pedido não vem do sistema) e que a única conta superadmin sem telefone se resolve pelo script de bootstrap.
- [ ] **Step 2:** Criar/alterar nível com `requirePlatform('team.manage')` + MFA, proibindo: alterar o próprio nível, e remover/desactivar o **último** `superadmin` (verificação em SQL antes do update).

**Verificação (17/10/2026, contas de sonda, já apagadas)**

| Prova                          | Como                                                                                                           | Resultado                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão `aal1` não repõe nada   | conta `superadmin` com TOTP, login só com senha, `/interno/equipa` por URL directo, motivo escrito e confirmar | diálogo mostrou o aviso de segundo factor e o servidor respondeu `MFA_NECESSARIO`; o alvo ficou com **1 factor**, a trilha com **0** linhas `team.reset_mfa`                                                                              |
| Ninguém repõe o próprio factor | POST directo à Server Action (id do manifesto de dev) com o `userId` do próprio actor e sessão `aal2`          | `{"ok":false,"error":"PROPRIO_FACTOR"}` — a regra vive no servidor, não só na ausência do botão                                                                                                                                           |
| Reposição a sério              | sessão `aal2`, mesmo diálogo com motivo                                                                        | ecrã passou a **Sem autenticador**, contadores 1/1; na base: **0** factores e **0** sessões do alvo; linha `team.reset_mfa` com actor, papel, motivo, `request_id` e `before.fatores`/`after.fatores: []`/`sessoes: activas → terminadas` |
| Recuperação do alvo            | login do alvo com a senha, sem passo de código                                                                 | entrou em `/interno` com «Sem autenticador — inscrever» (pode inscrever um novo); `/interno/equipa` mostrou **Sem permissão** (nível `suporte`)                                                                                           |
| Limpeza                        | `deleteUser` das duas contas + remoção das linhas de teste                                                     | 0 contas de equipa, 5 linhas de trilha (as originais)                                                                                                                                                                                     |
| Checks                         | `npm run build`; `eslint` e `prettier --check` nos ficheiros alterados                                         | build **exit 0**; eslint **0**; prettier limpo                                                                                                                                                                                            |

Não exercido: `CONTA_SUSPENSA`, `NAO_E_MEMBRO` e `SEM_FACTOR` (os botões não os oferecem; as guardas estão na acção, pela ordem descrita). O caminho `REPOSTO_A_MEIO` também não foi forçado — exigiria falhar uma remoção a meio de dois factores.

- [ ] **Step 3:** Convite de membro da equipa pelo mesmo `inviteUserByEmail`, mas com `role` definido **antes** do primeiro login e MFA exigido no primeiro acesso.
- [ ] **Step 4:** Nota de partida pequena: semear apenas **um** `superadmin`. Os restantes níveis existem na matriz mas ficam por atribuir até haver uma segunda pessoa — a matriz é a garantia de que, quando ela chegar, não se inventa permissão no dia.

---

## Phase 10 — Bootstrap da primeira conta interna

### Task 10.1: Script

- [ ] **Step 1:** `scripts/create-pharmacy-user.js` passa a aceitar `--platform-role` (cria `admin_users` sem `pharmacy_id`) e `--invite` (usa `inviteUserByEmail` em vez de senha passada por nós). Actualizar o cabeçalho de uso e o `--help` implícito do parser.
- [ ] **Step 2:** Correr o bootstrap: `node --env-file=.env.local scripts/create-pharmacy-user.js --email <email do fundador> --invite --platform-role superadmin --name '<nome>'` e aceitar o convite.
- [ ] **Step 3:** Confirmar `select role from admin_users where role <> 'farmacia'` → 1 linha `superadmin`; e que `is_platform_member()` devolve `true` nessa sessão.

### Task 10.2: Runbook (documentação operacional)

- [ ] **Step 1:** Escrever o runbook em `localizador/` (ou secção própria no fim deste ficheiro, na implementação): criar superadmin, convidar farmácia, converter lead, mudar plano, dar graça, suspender, repor acesso, transferir titularidade, reverter um plano errado (`PLANS_ENFORCED=false` + correcção em `pharmacy_subscriptions`), e o que fazer se a trilha não registar (ver log `platform`).
- [ ] **Step 2:** Actualizar `localizador/2026-10-12-gestao-e-faturacao-apis.md` com uma linha a apontar para este plano (a ideia 2A deixou de ser «falta isto» e passa a ter equipa interna e planos).

---

## Phase 11 — Verificação end-to-end (smoke test)

### Task 11.1: Caminho feliz (superadmin, com MFA)

- [ ] **Step 1:** `/interno/login` com a conta `superadmin` → pede TOTP → entra no painel.
- [ ] **Step 2:** Criar uma farmácia de teste (`--platform-role` inexistente na UI), **convidar** um e-mail real → aceitar o convite → definir senha → entrar em `/portal/login` e confirmar que a farmácia vê o portal em `localizador` (sem Movimentos, Vendas, Desempenho, Equipa, Integração).
- [ ] **Step 3:** Mudar a farmácia de teste para `gestao` (motivo preenchido) → recarregar o portal → as funções aparecem; **conferir a trilha**: `select action, actor_role, reason, before, after from platform_audit_log order by created_at desc limit 5;`.
- [ ] **Step 4:** Desactivar a farmácia → confirmar que o portal da farmácia corta o acesso (não só esconde) e que `/farmacia/<slug>` deixa de mostrar stock.

### Task 11.2: Permissões (o teste que costuma falhar)

- [ ] **Step 5:** Entrar com uma conta `suporte`: confirmar que **não** vê Farmácias→editar, contas, planos, auditoria; e que chamar as Server Actions por POST directo (`invitePharmacyAccount`, `assignPlan`) devolve `SEM_PERMISSAO` e **regista** a tentativa.
- [ ] **Step 6:** Repetir com `faturacao` (vê plano, não vê reservas) e com `auditoria` (vê trilha, não altera nada; tentar exportar sem MFA → `MFA_NECESSARIO`).

### Task 11.3: Limites

- [x] **Step 7 (parcial, medido):** na farmácia de teste com plano de entrada — **criar chave de API → `PLANO_INSUFICIENTE`** e **criar perfil de equipa → `PLANO_INSUFICIENTE`** (o ramo dos limites numéricos), sem nada criado (conferido por SQL). Ficou por exercer o caminho do **CSV** (`importRows`): a importação é um fluxo de vários passos no painel e o guard é o mesmo código já provado nas duas chaves acima.
- [ ] **Step 8:** Numa farmácia `gestao`: criar 2 chaves (ok) e a 6ª de webhook → `LIMITE_DESTINOS` com mensagem a nomear o plano. (Não exercido: o teto de 5 destinos do `gestao` é o mesmo valor que a constante antiga já aplicava, e levantar 6 webhooks a sério criaria destinos falsos.)

### Task 11.4: Auditoria e integridade

- [ ] **Step 9:** Confirmar no SQL Editor que `update`/`delete` em `platform_audit_log` falham mesmo em `service_role`.
- [ ] **Step 10:** Confirmar que cada acção das Tasks 11.1–11.3 tem linha na trilha com actor, papel, farmácia e motivo (nas destrutivas).

---

## Phase 12 — Commit + push

- [ ] **Step 1:** `git status` → confirmar exatamente os ficheiros das tabelas _Criar_/_Modificar_ (e nenhum do portal público).
- [ ] **Step 2:** `npm run format` + `npm run build` → 0 erros.
- [ ] **Step 3:** Apresentar o diff por concern (o utilizador quer revisão antes do push): 1) migrações 0027/0028 e o seu teste no SQL Editor; 2) `lib/plans.js` + `lib/platform/*`; 3) área interna (`app/interno/**` + `components/interno/**`); 4) bootstrap/script; 5) gates de entitlements no portal da farmácia.
- [ ] **Step 4:** Commits separados por concern (não monolítico), ex.: `feat(db): 0027 níveis internos + trilha de auditoria`, `feat(db): 0028 subscrições por farmácia`, `feat(platform): planos, permissões e sessão interna`, `feat(interno): área interna (farmácias, contas, planos, auditoria)`, `feat(portal): entitlements por plano`, `feat(scripts): bootstrap de conta interna`.
- [ ] **Step 5:** Push **só com autorização** (e depois do deploy de produção voltar a estar verde: o cron passou para `pg_cron`/`pg_net` na 0026).

---

## Risk & Rollback

| Risco                                                                                                                               | Mitigação                                                                                                                                                                                                                                        | Rollback                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alargar o CHECK de `admin_users.role` deixa alguém sem acesso                                                                       | Não há contas internas hoje (0 medidas); `is_admin()` continua a aceitar `admin`; os 2 utilizadores `farmacia` não são tocados                                                                                                                   | `alter table … add constraint` de volta ao CHECK antigo (as linhas `farmacia`/`admin` continuam válidas)                                                                                          |
| O `drop constraint if exists` erra o nome e ficam **dois** CHECK em cima (a migração parece passar mas `suporte` continua recusado) | Task 1.1 Step 1 lê `c.conname` antes de escrever SQL; Task 1.3 Step 3 prova que o erro de um insert é 23503 (FK) e não 23514 (CHECK)                                                                                                             | Correr `alter table public.admin_users drop constraint <nome-extra>;` e repetir o teste                                                                                                           |
| Alguém cria uma conta nova com o papel legado `admin` «para testar» e escapa à matriz                                               | O runbook proíbe `role='admin'` em contas novas; `can()` trata `admin` como `superadmin`, por isso a conta é visível como nível alto e não como invisível                                                                                        | Repor o papel correcto com `update admin_users set role='superadmin' where user_id=…` (com MFA e registo na trilha)                                                                               |
| E-mails de convite não chegam (domínio do Resend por verificar, chave inválida, ou limite do fornecedor)                            | Task 6.1 é bloqueante: domínio verificado no Resend e entrega testada **antes** de convidar clientes; o convite já não usa o remetente do Supabase (o limite de 2/hora deixou de se aplicar — o Resend dá 100/dia e 3.000/mês no plano gratuito) | Enquanto não estiver testado, validar o fluxo com o endereço da própria conta Resend (único destino aceite por `onboarding@resend.dev`); nenhum convite a cliente antes da verificação do domínio |
| Gating corta um cliente pagante por engano                                                                                          | `PLANS_ENFORCED=false` desliga os gates sem deploy; mensagem de erro diz qual plano falta; subida/descida de plano auditada com antes/depois                                                                                                     | Desligar o interruptor, corrigir `pharmacy_subscriptions`, voltar a ligar                                                                                                                         |
| Um `suporte` ganha poderes por engano                                                                                               | Matriz fechada em código (uma acção nova entra na matriz antes da UI); guards em todas as Server Actions; teste 11.2 passa por POST directo                                                                                                      | Alterar a matriz (1 linha) e redeploy; a trilha mostra quem fez o quê                                                                                                                             |
| Perder o último `superadmin` (ficar sem equipa)                                                                                     | Verificação SQL que impede remover/desactivar o último `superadmin`; bootstrap documentado no script                                                                                                                                             | Recriar o superadmin pelo script (Phase 10)                                                                                                                                                       |
| Ban não mata sessões activas                                                                                                        | Suspensão = ban **e** farmácia/ perfil inactivos (`getPharmacySession` já exige farmácia activa)                                                                                                                                                 | Reactivar farmácia/perfis; o ban mantém-se até decisão                                                                                                                                            |
| Convite apagado por engano arrasta `admin_users` em cascata                                                                         | Revogar só user Auth **pendente** (nunca confirmado); nunca apagar conta com histórico; regra escrita no runbook                                                                                                                                 | Reconvidar o mesmo e-mail e religar a `pharmacy_id`                                                                                                                                               |
| Auditoria cresce sem limite                                                                                                         | Índices por data/farmácia/actor; paginação por cursor; política de retenção definida (Phase 8)                                                                                                                                                   | Expurgo por `pg_cron` (job novo) se o volume doer — nunca `update`/`delete` manual                                                                                                                |
| Token de sessão interna roubado dá acesso a dados de clientes                                                                       | A RLS **não** foi alargada aos níveis de leitura (só `admin`/`superadmin`); a leitura de `suporte`/`auditoria` passa por código que decide o que devolve, e as respostas não são cacheadas (`dynamic = 'force-dynamic'`, `no-store`)             | Revogar o nível (volta a `farmacia`/inactivo) e `/interno/login` corta no acesso seguinte; a trilha mostra o que foi lido e exportado                                                             |
| Duplicar o `admin_users` como identidade interna e da farmácia confunde                                                             | A área interna só olha para `role <> 'farmacia'`; o portal só entra com `role='farmacia'` (já validado em `lib/pharmacy-session.js`)                                                                                                             | Manter as duas sessões separadas (`lib/pharmacy-session.js` vs `lib/platform/session.js`) — nunca cruzar                                                                                          |
| Adicionar 5 níveis internos para 1 pessoa                                                                                           | Semear só `superadmin`; níveis existem na matriz mas ficam por atribuir                                                                                                                                                                          | Ignorar os níveis extra até haver a segunda pessoa                                                                                                                                                |

---

## Out of Scope (deferido, com o porquê)

- **Gateway de pagamento** (Multicaixa/transferência/Stripe): o mercado paga 5.000–25.000 Kz/mês e a cobrança é manual hoje; só faz sentido com o primeiro cliente pago e volume.
- **Facturação/AGT**: é a fase 2B/C do roadmap (`localizador/2026-10-12-gestao-e-faturacao-apis.md`) — outro produto, outra equipa, certificação própria. O plano `conformidade` existe só como catálogo.
- **Impersonação («entrar como a farmácia»)**: risco alto para o valor; se voltar, exige ticket, TTL, banner visível e actor/subject separados na trilha.
- **Redes/grupos (2–10 lojas)** e preço por loja: primeiro cliente de grupo; a migração futura é uma tabela `pharmacy_members` (N contas ↔ N farmácias) e o `admin_users.pharmacy_id` fica 1↔1 por agora.
- **Auto-registo de farmácias**: destrói a curadoria do directório; a entrada é por convite depois do funil.
- **Tabelas `plans`/`plan_features` editáveis no ecrã**: o código é a fonte de verdade nesta fase.
- **MFA obrigatório em todas as acções** (agora só nas sensíveis) e **SSO** para a equipa CF.
- **Dupla aprovação para eliminação de pacotes de dados e exportações em massa** (só a transferência de titularidade a tem nesta fase).
- **Renomear `scripts/create-pharmacy-user.js` para `create-user.js`** (fica a extensão com `--platform-role`).
- **PWA/offline da área interna** e **expurgo automático da trilha** por `pg_cron`.
- **Migrar o funil para CRM externo** (HubSpot/Linear): a `pharmacy_leads` já tem os estados certos; integrar antes disso é custo.

---

## Fontes

**Segurança e desenho de acessos**

- [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) · [Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) · [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) · [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NIST SP 800-53 (AC-3(2), autorização dupla)](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) · [texto do controlo AC-3(2)](https://grcacademy.io/nist-800-53/controls/ac-3-2/)
- [CIS Control 6 — Access Control](https://cas.docs.cisecurity.org/en/latest/source/Controls6/)
- [AWS SaaS Lens — onboarding de tenants](https://wa.aws.amazon.com/saas.question.OPS_3.en.html)
- [WorkOS — Impersonation](https://workos.com/docs/authkit/impersonation) · [Microsoft — GDAP (acesso de parceiro granular)](https://learn.microsoft.com/en-us/partner-center/customers/gdap-introduction)
- [Google Cloud — service accounts](https://docs.cloud.google.com/iam/docs/service-account-overview)
- [AWS S3 Object Lock (WORM)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) · [CloudTrail — integridade de logs](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html)

**Planos, entitlements e cobrança**

- [Stripe — Entitlements](https://docs.stripe.com/billing/entitlements) · [Billing alerts/limites](https://docs.stripe.com/api/billing/alert) · [Alterar preço/subscrição](https://docs.stripe.com/billing/subscriptions/change-price) · [Ciclo de subscrição e `past_due`](https://docs.stripe.com/billing/subscriptions/overview) · [Webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

**Supabase (Auth, convites, MFA, ban)**

- [Users — convites e validade](https://supabase.com/docs/guides/auth/users) · [`inviteUserByEmail`](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) · [`generateLink`](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) · [`resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) · [`createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser) · [`updateUserById` (ban)](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [TOTP e fluxo de MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp) · [AAL e enforcement](https://supabase.com/docs/guides/auth/auth-mfa) · [`getAuthenticatorAssuranceLevel`](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel)
- [Rate limits de e-mail](https://supabase.com/docs/guides/auth/rate-limits) · [SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp) · [Templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

**Contexto interno do projecto**

- `localizador/2026-10-12-gestao-e-faturacao-apis.md` — preços de referência, escalão gratuito, neutralidade do directório, fases 2A/2B/2C
- `docs/2026-06-15-admin-role-ui.md` — vocabulário e padrão (role prop, ConfirmModal, arquivar em vez de eliminar, trilha com autor)
- Código medido em 16/10/2026: `0001_initial_schema.sql`, `0018_pharmacy_staff.sql`, `0022`, `0023`, `0025`, `0026`, `lib/pharmacy-session.js`, `lib/staff-session.js`, `lib/actions/{pharmacy-staff,integration,pharmacy-portal}.js`, `scripts/create-pharmacy-user.js`
