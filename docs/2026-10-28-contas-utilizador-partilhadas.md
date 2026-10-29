# Contas de utilizador partilhadas — conhecafarmacia.com ↔ localizador.conhecafarmacia.com

> **Como executar:** plano por passos, com checkbox (`- [ ]`). Cada Phase tem tarefas, os ficheiros que toca e a verificação própria. Não avançar de Phase sem a anterior verde. Verificação alinhada com o resto do projecto: `npm run build` + `npm run format` + smoke test manual (não há framework de testes neste repo).

**Goal:** uma pessoa cria conta uma vez e é a mesma conta nos dois sites. Para isso as duas bases Supabase passam a ser **uma só**, no projecto do site principal, com o Localizador num **schema Postgres separado** (`localizador`). Os dois deploys Vercel continuam separados, como está decidido — o que passa a ser comum é a base, a identidade, o remetente de e-mail e a sessão (cookie em `.conhecafarmacia.com`).

A área de conta tem **endereço próprio — `conta.conhecafarmacia.com`** — servido pelo projecto Vercel do site principal (alias de domínio, não um terceiro deploy). Quem está no Localizador e clica «A minha conta» não fica com a impressão de ter saltado para o outro site: chega à casa da conta, que é a mesma para os dois.

**Ambiente medido a 28/10/2026** (leitura directa das duas bases com os tokens de `credenciais.txt`):

|                              | Localizador `mxqhmtpshlpnbkninawt`                   | Site principal `tbqsazriorqzexjwhekw`                                                                         |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Organização / região         | `amccyijw…` · eu-west-1                              | `bryemnhg…` · eu-west-1                                                                                       |
| Plano                        | gratuito                                             | gratuito                                                                                                      |
| Tamanho da base              | **30 MB**                                            | **32 MB**                                                                                                     |
| Tabelas / views em `public`  | 25 / 2                                               | 64 / 1                                                                                                        |
| Políticas RLS                | 30 (+2 cron, 3 storage)                              | **183** (+13 storage)                                                                                         |
| Contas `auth.users`          | **5** (4 confirmadas)                                | **27** (6 confirmadas, 26 activas em 90 dias, 5 e-mail + 2 Google)                                            |
| `admin_users`                | 4 (2 `farmacia`, 2 `superadmin`)                     | 2 (1 `superadmin`, 1 `admin`)                                                                                 |
| Extensões de interesse       | `pg_cron`, `pg_net`, `pg_trgm`, `pgcrypto`, `uuid-ossp` | `pg_net`, `pgcrypto`, `uuid-ossp` — **sem `pg_cron`, sem `pg_trgm`**                                       |
| Cron jobs                    | 2 (`expire-stale-reservations` \*/15; `webhook-deliveries` \*) | —                                                                                                    |
| SMTP próprio                 | ❌ nenhum                                            | ✅ Brevo (`smtp-relay.brevo.com`, `noreplay@conhecafarmacia.com`)                                              |
| `site_url` do Auth           | `http://localhost:3000`                              | `http://www.conhecafarmacia.com` + allow list só de `www`                                                      |
| Google OAuth                 | ❌                                                    | ✅ (cliente `859225…apps.googleusercontent.com`)                                                              |
| Storage                      | `drug-images` — **0 objectos**                       | 5 buckets, 12 objectos (incl. `avatars`)                                                                      |
| E-mail dentro da app         | Resend (convites de farmácia)                        | Brevo + Edge Functions (`send-newsletter-email`, …)                                                           |

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19, Supabase (PostgreSQL 17 + RLS + Auth + Storage + Realtime), `@supabase/ssr` 0.6, Tailwind v4. Sem framework de testes.

**Repositórios:** este (`conheca-farmacia-localizador`, dono do schema `localizador`) e `../conheca-farmacia-NEXT` (`conheca-farmacia`, dono do schema `public`). Um projecto Supabase, dois donos de schema — a regra está na §3.1.

---

## 0. Levantamento — o que já existe (medido, não suposto)

### 0.1 As duas bases quase não se sobrepõem

O `drugs` do Localizador é **produto/apresentação** (`name`, `molecule`, `form`, `dosage`, `kind`, `category`, `requires_rx`); o do site principal é **monografia** (`slug`, `name_pt`, `name_en`, `class_pt`, `atc_code`, `class_id`). São 42 e 375 linhas de coisas diferentes. **Não há duplicação a limpar** — o ganho da fusão não é arrumar catálogos, é ter uma identidade.

O que colide de verdade é o nome de quatro objectos:

| Objecto                | Localizador                          | Site principal                                                     | Consequência se ficarem no mesmo schema                                  |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `admin_users`          | `user_id, role, pharmacy_id, display_name` | `user_id, role, name, email, recovery_email, gate_questions_enabled` | **escalada de privilégios** (ver §0.3)                                    |
| `drugs`                | produto (`name`, `molecule`, `form`)  | monografia (`name_pt`, `slug`, `atc_code`)                          | perda de um dos dois                                                      |
| `audit_logs` / `platform_audit_log` | trilha da plataforma     | trilha do CMS                                                      | duas trilhas misturadas                                                   |
| funções (`is_admin`, `set_updated_at`, …) | `is_admin()` aceita `admin`/`superadmin` | `is_current_user_admin()` idem                                  | um `admin` do CMS passa a ser admin da plataforma de farmácias             |

### 0.2 O que a conta de utente vai encontrar

| Peça                                  | Estado                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Contas de utente no Localizador       | **zero** — `proxy.js` di-lo por escrito: «sem sessões de utilizador nesta fase»                                     |
| Contas de utente no site principal    | 27 em `auth.users`, com `saved_items` (favoritos), `saved_item_notes`, flashcards, quiz, competições               |
| Perfil do utilizador                  | vive em `auth.users.raw_user_meta_data` (`full_name`, `display_name`, `avatar_url`, `school`, `class_name`) — **não há tabela `profiles`** |
| Botão de conta no site principal      | `components/layout/Header.jsx` lê `user_metadata.avatar_url`                                                       |
| Contas de farmácia / equipa interna   | `admin_users` + `pharmacy_staff` (PIN), guardas `lib/pharmacy-session.js`, `lib/platform/session.js`               |

### 0.3 A armadilha: `admin_users` com dois significados

- No site principal: equipa de **conteúdos** (`superadmin`/`admin`, com perguntas de gate e `recovery_email`).
- No Localizador: **farmácia** (`pharmacy_id`) e **plataforma** (`superadmin`), e é esta tabela que a RLS interroga (`is_admin()` → acesso a stock, reservas e dados de clientes).

Juntar as duas numa tabela `public.admin_users` faria com que o `admin` do CMS (1 conta hoje) passasse a ter poder sobre a plataforma de farmácias. **Não se faz.** No plano, `public.admin_users` e `localizador.admin_users` ficam separadas, sem uma única linha copiada entre elas.

### 0.4 Porque é que contas no Localizador hoje seriam impossíveis

1. **E-mail.** O projecto não tem SMTP próprio; o remetente integrado do Supabase entrega poucas mensagens por hora e só a endereços da equipa. Confirmação de conta e reposição de senha nunca chegariam a um utente.
2. **`site_url` = `localhost:3000`.** Qualquer link de e-mail apontaria para a máquina de quem desenvolve. (Isto já afecta o portal: a reposição de senha de uma farmácia está morta em produção — os convites passam pelo Resend, não pelo Auth.)
3. **Sessão sem renovação.** O `proxy.js` só trata de CSP e devolve `NextResponse.next()` sem `createServerClient`; um Server Component não pode escrever cookies, por isso o token de acesso expira ao fim de 1 h e só volta a ser gravado numa Server Action. Com contas de utente isto é um logout inesperado a meio da navegação.

### 0.5 O que o site principal já tem de reutilizável

- `saved_items` (`user_id, item_type, item_id, item_slug, item_name, item_subtitle, item_image_url`) + RLS por dono.
- Bucket `avatars` público.
- Fluxo de registo (`/[lang]/registo`), entrada, recuperação, reposição, perfil e definições — todos client-side, com `emailRedirectTo` para `/{lang}/conta-criada`.
- SMTP Brevo e Google OAuth já pagos e verificados.

---

## 1. Brainstorm — as opções que estiveram em cima da mesa

### 1.1 Juntar ou não juntar as bases

| Opção | O que dá | Custo |
| --- | --- | --- |
| **A. Uma base (escolhida)** | Uma identidade, um SMTP, um OAuth, FKs entre conta e reservas/produtos, um sítio para apagar dados | Migração do schema do Localizador + janela de corte |
| B. Duas bases, login partilhado | Nada muda na base do Localizador | A validação do token passa a ser um pedido remoto ao outro projecto; **perde-se o RLS** (sem `auth.uid()` local, todas as tabelas do utente passariam a ser filtradas à mão com service-role); sem FKs entre conta e reservas |
| C. Duas bases, JWT de um projecto aceite no outro (JWKS) | Isolamento total | Não é um caminho suportado para o refresh de sessão; obriga a dois clientes e a renovar tokens no projecto de origem |
| D. Projecto Supabase novo | Base limpa | Migrar 32 contas, 183 políticas e dois conjuntos de dados sem ganho nenhum sobre A |

**Decisão: A.** O argumento decisivo não é arrumação, é integridade: «as minhas reservas» e «os meus guardados» têm de ter chave estrangeira para `reservations`/`drugs`/`pharmacies`. Só existe uma base onde isso é possível.

### 1.2 Onde juntar

Projecto do **site principal** (`tbqsazriorqzexjwhekw`): é lá que estão os 27 utilizadores reais, o Google, o Brevo e as 183 políticas. O Localizador traz 5 contas de teste e 30 MB — o lado pequeno.

### 1.3 Como separar as tabelas do Localizador

| Opção | Efeito |
| --- | --- |
| **Schema `localizador` (escolhida)** | `drugs`, `admin_users`, views e funções deixam de colidir. As **217 chamadas `.from()`** do código ficam iguais, porque o schema por omissão passa a ser definido nas 3 fábricas de cliente (`db: { schema: 'localizador' }`). Reversível com `pg_dump -n localizador`. |
| Tudo em `public` com nomes prefixados | Obriga a renomear `drugs` (23 sítios), `admin_users` (16), views, funções e 44 migrações. Muito mais superfície de erro. |

### 1.4 Sessão entre subdomínios

Só há uma forma sã: cookie de sessão no domínio pai, `Domain=.conhecafarmacia.com`. As alternativas (handoff com token num redirect, SSO caseiro) acrescentam um passo frágil e um segredo a mais. O preço aceite: **sair num site termina a sessão nos dois**, e previews `*.vercel.app` não partilham sessão.

### 1.5 Onde vive o perfil (nome, telefone, município)

| Opção | Efeito |
| --- | --- |
| **`user_metadata` do Auth (escolhida)** | É o que o site principal já usa (`full_name`, `avatar_url`, `school`). Zero migração, zero tabela nova, e o pré-preenchimento da reserva lê-o no servidor. |
| Tabela `profiles` nova | Melhor para consultas e para juntar dados de negócio, mas cria uma segunda fonte de verdade ao lado do `user_metadata` que o site principal já escreve. Fica para quando houver razão de negócio. |

---

## 2. Decisões locked in

Respostas dadas a 28/10/2026, e o que delas decorre:

1. **Base:** projecto do site principal + schema `localizador`.
2. **Funcionalidades v1 da conta no Localizador:** guardar medicamentos e farmácias, histórico de reservas, reserva com dados pré-preenchidos. **Sem alertas de stock nesta fase.**
3. **Registo:** nos dois sites, mesma conta (Localizador para utentes, site principal para profissionais).
4. **Entrada:** e-mail + senha e Google.
5. **Sessão:** partilhada, cookie `.conhecafarmacia.com`.
6. **As 5 contas do Localizador são de teste**, mas têm de continuar a funcionar durante o desenvolvimento. Decorre: migram-se **com os hashes de senha preservados** (ver Task 3.4) para não haver interrupção; as senhas reais dos utilizadores finais nunca passam por nós.
7. **Plano:** os dois projectos estão no gratuito. Consequência dura em §9.1.
8. **Janela:** 1–2 h de manutenção do Localizador em horário de pouco uso, com as duas bases a receber escritas até ao corte.
9. **Guardados do Localizador:** tabela própria `localizador.favorites`, com FKs reais para `drugs`/`pharmacies`.
10. **Apagar conta:** entra no v1 (`conta.conhecafarmacia.com/perfil/seguranca`).
11. **Backups:** os projectos ficam no **gratuito**; o `pg_dump` semanal automático passa a ser obrigatório e testado (§9.1).
12. **Tudo o que é autenticação e conta vive em `conta.conhecafarmacia.com`**, servido pelo projecto Vercel do site principal (alias de domínio, não um terceiro deploy). Os dois sites deixam de ter formulários de entrar/registar e apontam para lá; as listas de guardados e reservas ficam onde os componentes e os dados vivem. O salto entre domínios é aceite — vale mais uma implementação só do que duas a divergir.

Decisões tomadas por mim, com o porquê (podem ser revertidas sem mexer na arquitectura):

- **Perfil em `user_metadata`** (§1.5).
- **E-mail de Auth pelo Brevo** (herdado), e **Resend mantém-se para os convites de farmácia**. Não se unifica já: são fluxos diferentes e o Resend tem template e mapeamento de erros próprios (`lib/email.js`).
- **`conta.*` reutiliza os componentes do site principal** (`perfilClient`, `definicoesPageClient`, `entrarClient`, …) em vez de os reescrever, e o login continua 100% server-side — a lição do «loop após entrar» está escrita em `components/portal/PharmacyLoginForm.jsx`. No Localizador não fica nenhum formulário de autenticação: só links para `conta.*`.

---

## 3. Arquitectura alvo

```
  www.conhecafarmacia.com       ┌──────────────────────────────────────────────┐
  conta.conhecafarmacia.com ────│  Vercel: conheca-farmacia (repo NEXT)        │
  (site principal + conta)      │  Next 16 · dono do schema `public`            │
                                │  app/(identidade)/* → /entrar, /perfil…       │
                                └───────────────┬──────────────────────────────┘
                                        │  cookie sb-<ref>-auth-token
                                        │  Domain=.conhecafarmacia.com
                        ┌───────────────▼──────────────────────────────┐
                        │  Supabase tbqsazriorqzexjwhekw (eu-west-1)   │
                        │   auth  → as 32 contas, Google, Brevo        │
                        │   public       → CMS, saved_items, avatars   │
                        │   localizador  → farmácias, stock, reservas, │
                        │                  admin_users, favorites      │
                        └───────────────▲──────────────────────────────┘
                                        │
  localizador.conhecafarmacia.com       │
  ┌─────────────────────────────────────┴──────────┐
  │ Vercel: localizador-conhecafarmacia             │
  │ Next 16 · dono do schema `localizador`          │
  │ supabase-js com db.schema = 'localizador'       │
  └─────────────────────────────────────────────────┘
```

### 3.1 Regras que a fusão cria

1. **Um projecto, dois donos de schema.** Este repositório é a fonte de verdade de tudo o que vive em `localizador.*`; o repositório do site principal é a fonte de verdade de `public.*`. Nenhum dos dois corre `supabase db push` sobre migrações do outro. As migrações do Localizador passam a declarar `set search_path = localizador, public, auth` no topo.
2. **Nenhuma linha atravessa `public.admin_users` ↔ `localizador.admin_users`.** São tabelas de papéis diferentes, com RLS e funções próprias.
3. **As chaves são únicas.** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` passam a ser as mesmas nos dois projectos Vercel e nos dois `.env.local`. Uma rotação de chave toca em quatro sítios — está no runbook (§8).
4. **Uma conta de utente não é um perfil de farmácia.** Quem se regista como utente não tem linha em `localizador.admin_users`; `getPharmacySession()` devolve `SEM_PERFIL` e `/portal` continua fechado. O mesmo para `/interno` (`getPlatformSessionVerbose` → `SEM_PERFIL`, e o MFA continua a ser exigido).

### 3.2 Cliente por omissão (`db.schema`)

`@supabase/supabase-js` aceita o schema por omissão no cliente. É isto que evita tocar nas 217 chamadas:

```js
createClient(url, key, { db: { schema: 'localizador' }, auth: { … } })
```

Consequências a tratar explicitamente:

- `.from('stock_items')` → `localizador.stock_items` (nada a fazer no código).
- Acesso a tabelas do site principal, se algum dia for preciso, passa a ser explícito: `.schema('public').from('saved_items')`.
- `.rpc('…')` (17 chamadas) resolve no schema por omissão → as funções têm de ser movidas para `localizador` e manter `security definer` com `set search_path = localizador, public`.
- **Realtime não usa o schema por omissão**: as 3 subscrições passam a declarar `schema: 'localizador'` (`components/portal/PortalSidebar.jsx`, `components/portal/ReservationsQueue.jsx`, `lib/use-pharmacy-stock-realtime.js`).
- O schema tem de estar **exposto na API** (Settings → API → Exposed schemas), senão o PostgREST responde 404 a tudo.

### 3.3 Sessão partilhada — os cinco sítios onde se ganha ou perde

1. **Cliente browser** (dois repos): `createBrowserClient(url, key, { cookieOptions: { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN } })`.
2. **Cliente servidor** (dois repos): no `setAll`, cada `cookieStore.set(name, value, { ...options, domain })`. Sem isto, o cookie gravado por uma Server Action fica *host-only* e o outro subdomínio não o vê.
3. **Renovação no proxy do Localizador** (Phase 4): `createServerClient` dentro do `proxy.js`, `await getUser()` e devolver a resposta com os `Set-Cookie` — o padrão documentado do `@supabase/ssr`. O early-return de `request.method !== 'GET'` mantém-se (é ele que protege o `Set-Cookie` das Server Actions).
4. **Redirect allow list do Auth**: acrescentar `https://conta.conhecafarmacia.com/**`, `https://localizador.conhecafarmacia.com/**`, `http://localhost:3000/**` e `http://localhost:3001/**`. O Google não precisa de mudança (o callback é sempre `https://<ref>.supabase.co/auth/v1/callback`).
5. **Confirmação e reposição**: **uma só** rota `/auth/confirm`, em `conta.conhecafarmacia.com`, que troca o código PKCE (`exchangeCodeForSession`) e segue para `next`. Os formulários de `conta.*` (os únicos do sistema) passam `emailRedirectTo` para lá; os templates continuam a usar `{{ .ConfirmationURL }}`, por isso não é preciso mexer-lhes. Um destino só evita ter a mesma troca de código escrita em dois projectos.

> Limitação herdada: com PKCE, o link de confirmação só funciona no browser onde o registo começou (a cookie do *code verifier* vive lá). Quem abrir o e-mail noutro telemóvel vê o ecrã de erro — a saída é entrar e pedir reenvio. O site principal tem hoje a mesma limitação.

### 3.4 E-mail

- Auth: Brevo do site principal (herdado). Remetente `noreplay@conhecafarmacia.com`, já com SPF/DKIM.
- Convites de farmácia: Resend (`lib/email.js`) — não muda.
- Templates: manter os actuais (já têm a marca e o logótipo de `conhecafarmacia.com`). Actualizar o texto para «Conheça Farmácia» sem prometer «flashcards» a quem veio do Localizador.

### 3.5 `conta.conhecafarmacia.com` — a casa da conta

**Porque é um alias e não um terceiro projecto.** Um deploy novo trazia um terceiro `.env`, uma terceira CSP, um terceiro `proxy.js` e um terceiro sítio onde o login pode partir — para servir páginas que já existem no site principal. Um alias de domínio no mesmo projecto Vercel dá o mesmo endereço com zero código a mais. O cookie de sessão já cobre `conta.*` (é `.conhecafarmacia.com`), por isso quem chega do Localizador já está autenticado.

**O que vive lá** (e o que não vive):

| Em `conta.*`                                       | Fica no site onde o objecto existe                                  |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `/entrar`, `/registar`, `/recuperar`, `/repor-senha` | — (os dois sites apontam para cá; não há formulários locais) |
| `/auth/confirm` (confirmação de e-mail, troca de e-mail, reposição) | — |
| `/perfil` (nome, telefone, município, foto)          | `/guardados` no Localizador (produtos e farmácias)                  |
| `/perfil/seguranca` (senha, sessões, apagar conta)   | `/[lang]/guardados` no site principal (monografias, classes, artigos) |
| Hub: ligações para as duas listas e para as reservas | `/reservas` no Localizador (histórico com estado)                   |

A razão de as listas ficarem nos sites é prática: os cartões de produto e de farmácia (`ProductCard`, `ProductSheet`) e o formato das reservas (`lib/reservation-format.js`) vivem lá. Trazê-los para `conta.*` seria duplicar UI numa terceira linguagem visual — e a duplicação é o que envelhece mal.

**Entrar e registar só existem em `conta.*`.** Os dois sites perdem os formulários: «Entrar» é um link para `conta.*/entrar?next=<URL de volta>`. Uma implementação só, com as mensagens de erro, o Google e o rate-limit num sítio. O parâmetro `next` é validado em `conta.*` contra uma allow list de hosts (`*.conhecafarmacia.com` e caminhos relativos) — sem isso, `next` é um *open redirect*. Depois de entrar, `next` devolve a pessoa ao produto que estava a ver.

No Localizador, o menu de conta fica: «Entrar» (→ `conta.*/entrar?next=…`) sem sessão; com sessão, avatar/iniciais, «Os meus guardados», «As minhas reservas», «A minha conta» (→ `conta.*/perfil`) e «Sair» (Server Action local, `signOut` — sem salto).

**As páginas de conta do site principal redireccionam.** `/[lang]/entrar`, `/[lang]/registo`, `/[lang]/esqueci-palavra-passe`, `/[lang]/repor-palavra-passe`, `/[lang]/conta-criada`, `/[lang]/perfil` e `/[lang]/perfil/definicoes` passam a 308 para o equivalente em `conta.*` — senão voltam a existir dois formulários e duas áreas de conta. `/[lang]/guardados` e `/[lang]/anotacoes` **ficam**: são funcionalidades de conteúdo (notas por item, flashcards), não conta — o hub em `conta.*` liga a elas.

**Rotas na raiz, sem `[lang]`.** `conta.conhecafarmacia.com/perfil`, não `/pt/perfil`. As páginas de `app/(identidade)/` são invólucros finos sobre os componentes que o site principal já tem (`perfilClient.jsx`, `definicoesPageClient.jsx`, `entrarClient.jsx`, …), com `LangContext` fixo em `pt` — sem reescrever o perfil e sem duas versões da mesma página.

**O host é uma porta, nos dois sentidos.** Fora de `conta.*`, as rotas de conta redireccionam para lá (308): `conhecafarmacia.com/entrar` → `conta.conhecafarmacia.com/entrar`. Dentro de `conta.*`, só as rotas de conta existem: `/` vai para `/perfil` (ou `/entrar` sem sessão) e qualquer outro caminho — incluindo `/[lang]/…` — volta para `https://www.conhecafarmacia.com/<path>`, para o site de marketing nunca aparecer debaixo do endereço da conta. Os caminhos antigos (`/pt/perfil`, `/pt/entrar`, …) continuam a funcionar por via do 308 definido acima, por isso os marcadores não se partem.

**Custo aceite:** as páginas de conta têm o desenho do site principal, não o do Localizador — a identidade visual é a mesma família, mas não é o mesmo código de estilos. A alternativa (um terceiro projecto com o desenho do Localizador) custa um deploy, um `.env` e um CSP a mais para servir o mesmo perfil.

**Indexação:** nenhuma rota de `(identidade)` é indexável (`noindex, nofollow` na metadata e `X-Robots-Tag`), e nenhum link público aponta para lá excepto «Entrar» e «A minha conta».

---

## 4. Modelo de dados da conta no Localizador

### 4.1 `localizador.favorites`

```sql
create table localizador.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drug_id uuid references localizador.drugs(id) on delete cascade,
  pharmacy_id uuid references localizador.pharmacies(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_one_target check (num_nonnulls(drug_id, pharmacy_id) = 1)
);
create unique index favorites_unique_drug on localizador.favorites (user_id, drug_id) where drug_id is not null;
create unique index favorites_unique_pharmacy on localizador.favorites (user_id, pharmacy_id) where pharmacy_id is not null;
```

RLS: `select/insert/delete` só com `user_id = auth.uid()`. Sem `update`. Escrita sempre com o cliente de sessão (nunca service-role), para a policy ser a autoridade.

Porquê tabela própria e não `public.saved_items`: a `saved_items` do site principal é genérica de propósito (`item_id` sem FK) e serve monografias, classes e artigos. Reaproveitá-la aqui significaria `item_type = 'localizador_drug'` e perder integridade referencial — um produto apagado deixaria favoritos órfãos. A conta é a mesma; as listas são de cada site, como as de qualquer par de produtos diferentes.

### 4.2 `localizador.reservations.user_id`

```sql
alter table localizador.reservations
  add column user_id uuid references auth.users(id) on delete set null;
create index reservations_user_idx on localizador.reservations (user_id, created_at desc);
```

- `user_id` é **opcional**: a reserva continua a funcionar sem conta (é o fluxo de hoje, com tokens em `reservation_tokens`, migração 0035).
- Quem tem sessão vê as suas em `localizador.conhecafarmacia.com/reservas` por policy `user_id = auth.uid()`; o acesso por token público não muda.
- A escrita continua server-side em `lib/actions/reservations.js`, que passa a anexar `user_id` quando há sessão (lido no servidor, nunca do formulário).

### 4.3 Perfil

`user_metadata`: `full_name` (já usado), `phone` (novo, E.164 `+244…`), `municipality` (novo). O formulário de reserva pré-preenche nome e telefone a partir daqui; o utilizador pode sempre alterá-los nessa reserva (o valor gravado na reserva é o do formulário).

### 4.4 Apagar conta

Pedido do próprio em `conta.conhecafarmacia.com/perfil/seguranca` → Server Action com service-role: `auth.admin.deleteUser(id)`. O `on delete cascade` de `favorites` limpa os guardados; `reservations.user_id` fica `null` (a reserva é um registo operacional da farmácia e **não** se apaga). Registo na trilha da plataforma não é preciso (não é acção da equipa); o `logWarn` com `emailRef` chega.

---

## 5. File Structure

### Criar (este repositório)

```
.github/workflows/backup-db.yml                              # dump semanal (único backup do plano gratuito)
supabase/migrations/0045_schema_localizador_baseline.sql   # clone do schema public → localizador
supabase/migrations/0046_user_favorites.sql
supabase/migrations/0047_reservation_user.sql
supabase/RUNBOOK-fusao-bases.md                            # comandos de migração e de corte
lib/account-session.js                                     # getAccountSession() + requireAccount() (redirecciona para conta.*)
lib/actions/account.js                                     # sair, toggleFavorito — entrar/registar vivem em conta.*
app/guardados/page.js    app/reservas/page.js              # as duas listas, no sítio onde os componentes vivem
components/conta/AccountMenu.jsx  components/conta/FavoriteButton.jsx
```

### Modificar (este repositório)

```
lib/supabase/client.js  lib/supabase/server.js  lib/supabase/admin.js   # db.schema + cookie domain
proxy.js                                                                # renovação de sessão (GET) + CSP actual
components/layout/Header.jsx  components/layout/MobileDrawer.jsx         # entrada de conta
components/search/ProductCard.jsx  ProductSheet.jsx  VariantCard.jsx     # botão guardar
app/farmacia/[slug]/page.js                                             # botão guardar farmácia
app/reserva/page.js  lib/actions/reservations.js                        # pré-preenchimento + user_id
app/privacidade/page.js  app/termos/page.js                             # cláusulas de conta
.env.local.example                                                      # novas variáveis
```

### Criar (repositório `conheca-farmacia-NEXT`)

```
app/(identidade)/layout.js                     # LangContext fixo em pt + metadata noindex
app/(identidade)/entrar/page.js  registar/page.js  recuperar/page.js  repor-senha/page.js
app/(identidade)/auth/confirm/route.js         # troca do código PKCE — destino único dos e-mails
app/(identidade)/perfil/page.js  perfil/seguranca/page.js
```

### Modificar (repositório `conheca-farmacia-NEXT`)

```
lib/supabase/client.js  lib/supabase/server.js  lib/supabase/server-anon.js  # cookieOptions.domain
proxy.js                                                                     # idem no setAll + ramo do host conta.*
.env.local.example                                                           # NEXT_PUBLIC_COOKIE_DOMAIN
```

### Não modificar

`lib/pharmacy-session.js`, `lib/platform/session.js`, `lib/staff-session.js`, `lib/platform/permissions.js` — os guardas por papel já recusam uma conta de utente sem linha em `admin_users`, e é isso que se quer.

---

## Phase 1 — Pré-voo e rede de segurança

- [ ] **Task 1.1:** Confirmar que os dois projectos estão na mesma conta de utilizador Supabase (ou convidar a conta de gestão para a organização `bryemnhg…`), para que o corte não dependa de dois logins.
- [ ] **Task 1.2:** Exportar as duas bases antes de tocar em nada:
      `pg_dump "$URL_LOCALIZADOR" -Fc -f backup-localizador-2026-10-28.dump`
      `pg_dump "$URL_PRINCIPAL" -Fc -f backup-principal-2026-10-28.dump`
      Guardar fora do repositório.
- [ ] **Task 1.3:** Medir a deriva entre o repositório e a base viva do Localizador (25 tabelas + 2 views vs. as 44 migrações). O que existir em produção e não estiver nas migrações entra no baseline da Phase 2.
- [ ] **Task 1.4:** Confirmar no painel do projecto principal: extensões `pg_cron` e `pg_trgm` activáveis; `localizador` pode ser acrescentado aos *Exposed schemas* (limite de schemas do PostgREST).
- [x] **Task 1.5 (a rede que fica para sempre):** criar `.github/workflows/backup-db.yml` — **feito a 29/10** (`0 3 * * 0`, artefacto de 90 dias, falha sem o segredo). — `schedule` semanal (domingo, 03:00) + `workflow_dispatch`, `pg_dump -Fc` de `public` + `localizador` para artefacto com retenção de 90 dias. É o único backup que existe no plano gratuito (§9.1).
      **A ligação** (29/10) é o *session pooler* em `aws-0-eu-west-1.pooler.supabase.com:5432` com o papel `backup_dumper` — não a connection string directa, que só responde em IPv6 e os runners não têm IPv6, e não a password do `postgres`. O papel foi criado para isto: `LOGIN` + `pg_read_all_data` + `BYPASSRLS`, sem `CREATEDB`, sem escrita; sobrevive à rotação da password do `postgres`. O URL está em `credenciais.txt` (fora do git).
      **O segredo está criado** (29/10, `SUPABASE_DB_URL`) e o workflow correu à mão logo a seguir, verde nas 6 etapas: artefacto `localizador-db-2026-10-29` com 26 tabelas de `localizador` e 64 de `public` (90 entradas de dados), retenção até 27/01/2027. **Falta só definir quem recebe o alerta quando o job falhar** (§11.3) — sem isso, um backup que parte em silêncio é pior do que não ter.
- [x] **Task 1.6:** Testar o restauro **antes** de confiar nele — **feito a 29/10**, num dump real do projecto principal (2,7 MB):
      `pg_restore --no-owner --no-privileges -d <scratch> backup.dump` → **64 tabelas de `public` e 26 de `localizador`** criadas, dados carregados, 20 erros de três espécies, nenhum deles um defeito do dump:
      1. `schema "public" already exists` — o destino já tem o esquema; inofensivo.
      2. `schema "supabase_functions"`, `operator class public.gin_trgm_ops` — schemas geridos pela Supabase que não fazem parte do dump, de propósito.
      3. **17 × `violates foreign key constraint … _user_id_fkey`** (`favorites`, `saved_items`, `admin_users`, `quiz_attempts`, `platform_audit_log`, …) — as linhas cujo dono é um utilizador referenciam `auth.users`, que **não está no backup**. Isto é a limitação real e fica registada: **o restauro tem de ser para dentro de um projecto Supabase e as linhas de `auth.users` têm de lá estar antes**; num Postgres nu, essas 17 tabelas ficam com o esquema criado e sem as linhas dos utilizadores. Para o cenário que o backup serve — desfazer uma migração má — chega; para o cenário «o projecto morreu» não chega, e é uma decisão em aberto se `auth.users` passa a entrar no dump (§9.2).

**Verificação:** os dois `.dump` abrem com `pg_restore -l` e listam as tabelas esperadas (26 de `localizador` e 64 de `public`); o dump do projecto principal foi restaurado num esquema limpo com o resultado descrito na Task 1.6. O workflow correu no GitHub a 29/10 (`success`, run `40890830637`), o artefacto foi descarregado e verificado: 26 + 64 tabelas, 90 entradas de dados, arquivo lido até ao fim. O que **não** está provado: o restauro contra `auth.users` povoada e o cron semanal (a primeira execução agendada é domingo, 01/11).

---

## Phase 2 — Schema `localizador` no projecto principal (sem tráfego)

- [x] **Task 2.1:** Clonar o schema a partir da base viva (não das migrações — a base é a verdade):

      pg_dump "$URL_LOCALIZADOR" --schema=public --schema-only --no-owner --no-privileges > localizador_schema.sql
      sed -i 's/\bpublic\./localizador./g; s/SET search_path = public/SET search_path = localizador, public/g' localizador_schema.sql

- [x] **Task 2.2:** No projecto principal: `create extension if not exists pg_trgm; create extension if not exists pg_cron;` e `create schema if not exists localizador;` antes de aplicar o ficheiro. Confirmar que os índices `gin_trgm_ops` (busca por nome) entram.
- [x] **Task 2.3:** Privilégios e default privileges do schema novo (`anon`, `authenticated`, `service_role`), iguais aos que a 0001 dava em `public`. Sem isto, o PostgREST responde `permission denied` a tudo.
- [x] **Task 2.4:** Views (`stock_confirmed`, `brand_image_coverage`): `alter view … set (security_invoker = true)` para a RLS do chamador valer (é a recomendação do Supabase e evita que a view fure as políticas).
- [x] **Task 2.5:** Funções com `security definer`: garantir `set search_path = localizador, public` em todas — em especial as que a RLS chama. Funções de trigger em `auth.users` não existem hoje em nenhum dos dois projectos (verificado); não criar agora.
- [x] **Task 2.6:** Expor o schema: Settings → API → Exposed schemas = `public, storage, graphql_public, localizador`. Verificar com `curl "$URL/rest/v1/drugs?select=id&limit=1" -H "apikey: $ANON" -H "Accept-Profile: localizador"`.
- [x] **Task 2.7:** Realtime: `alter publication supabase_realtime add table localizador.reservations, localizador.stock_items;` e confirmar `realtime` habilitado nas tabelas.
- [x] **Task 2.8:** Guardar o resultado como `0045_schema_localizador_baseline.sql` neste repositório (com um cabeçalho a dizer que é um clone do schema a 28/10/2026 e que as migrações 0001–0044 ficam como história, não como executáveis).

**Verificação:** no projecto principal, `\dt localizador.*` lista as 25 tabelas, `\dv` as 2 views, `pg_policies` conta 30 no schema `localizador`, e a consulta do Task 2.6 devolve linhas.

---

## Phase 3 — Dados e contas de teste

- [x] **Task 3.1:** Copiar os dados na ordem de dependências (farmácias → produtos/marcas → stock → reservas → campanhas):

      pg_dump "$URL_LOCALIZADOR" --data-only --schema=public --disable-triggers > localizador_dados.sql
      sed -i 's/\bpublic\./localizador./g' localizador_dados.sql
      psql "$URL_PRINCIPAL" -f localizador_dados.sql

- [x] **Task 3.2:** Repor sequências (`setval`) e comparar contagens tabela a tabela entre origem e destino (9 farmácias, 246 stock_items, 42 drugs, 28 reservas, 48 lotes, 63 movimentos, 8 opções de venda, 9 subscrições, 2 leads, 2 chaves de API, 3 perfis de balcão).
- [x] **Task 3.3:** Recriar os 2 cron jobs (`expire-stale-reservations` `*/15 * * * *`; `webhook-deliveries` `* * * * *`) com os comandos a apontar para `localizador.*`. **Não copiar `cron.job` do dump** — recriar à mão para garantir o schema certo. Confirmar `cron.job_run_details` a verde depois do corte.
- [x] **Task 3.4:** As 5 contas de teste. Preservar o `id` (as linhas de `admin_users` e de `pharmacy_staff` dependem dele) e o hash bcrypt:
      criar em `auth.users` do projecto principal as 5 linhas (id, `encrypted_password`, `email_confirmed_at`, `raw_app_meta_data`, `aud`) + `auth.identities` correspondentes; alternativamente `auth.admin.createUser` e `update localizador.admin_users set user_id = …`. Como são contas de teste, qualquer dos caminhos serve; o primeiro é o que mantém as senhas actuais e não pára o desenvolvimento. Registar no runbook que foi feito assim e que **não é o caminho para contas reais**.
- [x] **Task 3.5:** Storage: criar o bucket `drug-images` (público) no projecto principal. Está vazio (0 objectos) — não há URLs para reescrever. Confirmar que nenhuma coluna de `localizador.*` guarda URLs do antigo projecto (`select count(*) from localizador.drug_brand_images where image_url like '%mxqhmtpsh%'` → 0).
- [ ] **Task 3.6:** Smoke test em SQL: login de uma conta de teste, leitura de stock com a sua sessão, e uma reserva de teste criada e apagada.

**Verificação:** contagens iguais às da origem; as 5 contas entram no portal (`/portal`) com as senhas de teste; os cron jobs correm sem erro.

---

## Phase 4 — Código do Localizador a apontar para o novo projecto

- [x] **Task 4.1:** As três fábricas de cliente (`lib/supabase/client.js`, `server.js`, `admin.js`) recebem `db: { schema: 'localizador' }`. O `server.js` passa a acrescentar `domain` no `setAll`.
- [x] **Task 4.2:** `proxy.js` — renovação de sessão nos GET, sem perder o nonce da CSP nem o early-return dos POST.
- [x] **Task 4.3:** As 3 subscrições Realtime passam a `schema: 'localizador'`.
- [ ] **Task 4.4:** Variáveis de ambiente (`.env.local` e Vercel → Production + Preview): URL/anon/service-role do projecto principal, `NEXT_PUBLIC_COOKIE_DOMAIN=.conhecafarmacia.com` (vazio em dev), `SUPABASE_DB_URL` novo para os scripts. Manter `RESEND_*` e `STAFF_COOKIE_SECRET`. — **Feito, menos o `SUPABASE_DB_URL`**, que continua por definir.
- [ ] **Task 4.5:** Testar no portátil contra o projecto novo: pesquisa, ficha de produto, página de farmácia, reserva pública por token, login do portal, stock, fila de reservas em tempo real, equipa/PIN, `/interno`.
- [x] **Task 4.6:** Verificação estática: `npm run lint`, `npm run build`, e um `grep` final por `public.` em SQL/migrações novas e por `schema: 'public'` no código.

**Verificação:** o portal faz login com uma conta de teste, o sino de reservas recebe um evento realtime, e `/interno` continua a exigir MFA.

---

## Phase 5 — Conta de utente no Localizador (produto)

- [x] **Task 5.1 (migração 0046):** `localizador.favorites` + RLS + índices (§4.1).
- [x] **Task 5.2 (migração 0047):** `reservations.user_id` + índice + policy de leitura própria (§4.2).
- [x] **Task 5.3:** `lib/account-session.js` — `getAccountSession()` (só `getUser()`, sem papel) para o cabeçalho, o botão de guardar e a reserva; e `requireAccount(nextPath)` que redireciona para `https://conta.conhecafarmacia.com/entrar?next=<URL absoluta de volta>`. Não há ecrãs de autenticação neste repo.
- [x] **Task 5.4:** `lib/actions/account.js` — só `sair` (`signOut` + `revalidatePath`) e `toggleFavorito` (insert/delete com o cliente de sessão; sem sessão devolve `SEM_SESSAO` e a UI navega para `conta.*/entrar?next=…`). Entrar, registar e recuperar **não existem aqui**.
- [x] **Task 5.5:** Cabeçalho e menu móvel: «Entrar» e «Criar conta» como links absolutos para `conta.*`; com sessão, avatar/iniciais + menu («Os meus guardados», «As minhas reservas», «A minha conta», «Sair»). Server Component lê a sessão; ao cliente só vão nome/iniciais.
- [x] **Task 5.6:** `/guardados` (produtos e farmácias) e `/reservas` (histórico com estado e link para o token público), ambos com `requireAccount()` e vazio-desenhado («ainda não guardou nada» com caminho de volta à pesquisa). São as duas únicas páginas de conta neste repo.
- [x] **Task 5.7:** Botão «Guardar» em `ProductCard`, `ProductSheet`, `VariantCard` e na ficha da farmácia. — `VariantCard` ficou de fora: o cartão inteiro é um `<button>`, e um botão dentro de outro não é HTML válido. O guardar aparece no cartão de produto, na ficha e no cabeçalho da farmácia.
- [x] **Task 5.8:** Reserva: pré-preencher nome/telefone de `user_metadata`, anexar `user_id` no servidor, e um bloco «Estas são as suas reservas» quando há sessão.
- [x] **Task 5.9:** Privacidade e termos: secção de conta (que dados guardamos, base legal, como apagar), com o caminho `conta.conhecafarmacia.com/perfil/seguranca`.

**Verificação:** «Entrar» no Localizador leva a `conta.*/entrar` e, depois de entrar, devolve à página de onde veio; guardar um produto e uma farmácia e vê-los em `/guardados`; reservar sem conta e com conta; «A minha conta» abre `conta.*/perfil`; apagar a conta em `conta.*/perfil/seguranca` e confirmar que os favoritos desaparecem e a reserva fica com `user_id = null`.

---

## Phase 6 — Casa da conta (`conta.`) e sessão partilhada

- [x] **Task 6.1:** Vercel → projecto `conheca-farmacia` → Settings → Domains: adicionar `conta.conhecafarmacia.com` e criar o CNAME no DNS. **Não** criar projecto novo: mesmo deploy, mesmo `.env`, mesma CSP.
- [ ] **Task 6.2:** `app/(identidade)/` — rotas na raiz (`entrar`, `registar`, `recuperar`, `repor-senha`, `perfil`, `perfil/seguranca`, `auth/confirm`) como invólucros finos sobre os componentes que já existem (`entrarClient.jsx`, `registoClient.jsx`, `esqueciClient.jsx`, `reporClient.jsx`, `perfilClient.jsx`, `definicoesPageClient.jsx`), com `LangContext` fixo em `pt`. Passam a ser **os únicos** formulários de autenticação do sistema. O `/perfil` recebe o hub: ligações para `/guardados` do Localizador, `/[lang]/guardados` do site, `/reservas` e `/perfil/seguranca`.
- [x] **Task 6.3:** `saveNext()` — validação do `next` (só caminhos relativos e hosts `*.conhecafarmacia.com`), usada no `/entrar`, no `/registar` e no `/auth/confirm`. É a defesa contra *open redirect* agora que o parâmetro atravessa domínios.
- [x] **Task 6.4:** `proxy.js` — o ramo `if (!SUPPORTED_LANGS.includes(lang)) return NextResponse.next()` passa a: (a) renovar a sessão também nas rotas de `(identidade)`; (b) no host `conta.*`, mandar `/` para `/perfil` (ou `/entrar` sem sessão) e 308 qualquer outro caminho para `https://www.conhecafarmacia.com/<path>`; (c) nos outros hosts, 308 as rotas de conta para `https://conta.conhecafarmacia.com/<path>`. O ramo `/[lang]` e o nonce da CSP não se tocam — é a parte do ficheiro que serve o site todo.
- [x] **Task 6.5:** `app/(identidade)/auth/confirm/route.js` — `exchangeCodeForSession(code)` e `redirect(saveNext(next) || '/perfil')`; erro → `/entrar?motivo=LINK_INVALIDO`.
- [ ] **Task 6.6:** Redireccionar as páginas de conta antigas do site: `/[lang]/entrar`, `/[lang]/registo`, `/[lang]/esqueci-palavra-passe`, `/[lang]/repor-palavra-passe`, `/[lang]/conta-criada`, `/[lang]/perfil`, `/[lang]/perfil/definicoes` → 308 para `conta.*`. Em `/[lang]/perfil/definicoes` manter o antigo caminho a apontar para `/perfil/seguranca` (não partir marcadores). `/[lang]/guardados` e `/[lang]/anotacoes` ficam.
- [x] **Task 6.7:** `noindex` em todas as rotas de `(identidade)` (`robots` na metadata + `X-Robots-Tag` em `vercel.json`). — Feito a 29/10: o `vercel.json` passou a cobrir `/entrar`, `/registar`, `/recuperar`, `/perfil`, `/perfil/:path*` e `/auth/:path*`.
- [x] **Task 6.8:** `lib/supabase/client.js` com `cookieOptions.domain`; `server.js` e `server-anon.js` com `domain` no `setAll`; `proxy.js` idem na renovação.
- [ ] **Task 6.9:** `NEXT_PUBLIC_COOKIE_DOMAIN=.conhecafarmacia.com` em Production/Preview (vazio em dev, onde `localhost` partilha cookie entre portas).
- [x] **Task 6.10:** Supabase → URL Configuration: `https://conta.conhecafarmacia.com/**`, `https://localizador.conhecafarmacia.com/**`, `https://www.conhecafarmacia.com/**`, `http://localhost:3000/**`, `http://localhost:3001/**`. Mudar `site_url` para `https://conta.conhecafarmacia.com` depois de confirmar que todos os fluxos passam `emailRedirectTo` explícito.
- [ ] **Task 6.11:** Templates de confirmação/recuperação: texto neutro («a sua conta Conheça Farmácia»), sem prometer funcionalidades de um só site.
- [ ] **Task 6.12:** Aviso interno: a sessão antiga (*host-only*) deixa de valer — todos voltam a entrar uma vez, e agora por `conta.*`.

**Verificação:** registar em `conta.*` e confirmar pelo e-mail; repor senha a partir do link; apagar conta; `www/entrar` e `localizador/entrar` levam a `conta.*` e o `next` devolve ao sítio certo (testar também um `next` externo e confirmar que é recusado); abrir `conta.*/perfil` vindo do Localizador já autenticado; sair no Localizador e confirmar que os três hosts ficaram sem sessão; nenhuma rota de conta indexável (`curl -I` mostra `X-Robots-Tag`).

---

## Phase 7 — Corte e rollback

- [ ] **Task 7.1:** Janela combinada (1–2 h, pouco uso). Anunciar no portal («manutenção breve»).
- [ ] **Task 7.2:** Congelar escritas no Localizador antigo (modo manutenção no Vercel, ou `alter database … allow_connections`), correr a cópia delta final (`pg_dump --data-only` das tabelas que mudaram) e comparar contagens.
- [x] **Task 7.3:** Trocar as variáveis nos dois projectos Vercel e fazer redeploy. (Localizador feito a 29/10; o site principal já estava no `tbqs…`.) Ordem: Localizador primeiro, site principal depois (o site principal não pode ficar à espera do schema novo).
- [ ] **Task 7.4:** Smoke test em produção, por esta ordem: pesquisa → produto → farmácia → reserva pública → login do portal → stock → realtime → `/interno` (MFA) → registo de utente → confirmação por e-mail → `conta.*/perfil` → guardados → reserva com sessão → sessão partilhada nos três hosts.
- [ ] **Task 7.5:** Deixar o projecto antigo **pausado, não apagado**, durante 30 dias. Só depois `delete project`.
- [ ] **Task 7.6:** Rollback (se necessário): repor as variáveis antigas nos dois Vercel, redeploy, e reactivar o projecto antigo. As escritas feitas no destino durante a janela perdem-se — é a razão de o corte ser feito com o site em manutenção.

**Verificação:** os sete passos do Task 7.4 a verde em produção, e `cron.job_run_details` a mostrar as duas execuções do dia sem erro.

---

## 8. Runbook: rotação de chaves (passa a ser obrigatório)

Depois da fusão há **um** par de chaves para os dois sites. Ordem para não haver janela de erro:

1. Criar as chaves novas no Supabase (JWT secret rotation só se for mesmo necessário).
2. Actualizar `.env.local` dos dois repositórios.
3. Actualizar Vercel → Localizador (Production + Preview) e redeploy.
4. Actualizar Vercel → Site principal (Production + Preview) e redeploy.
5. `SUPABASE_SERVICE_ROLE_KEY` nova invalida os cookies de balcão derivados (`STAFF_COOKIE_SECRET` ausente) — 24 h, renováveis; ou definir `STAFF_COOKIE_SECRET` próprio para isolar esta rotação.

---

## 9. Riscos e limites

### 9.1 O plano gratuito passa a ser um risco de negócio

- **Sem backups automáticos.** Ficou decidido manter o gratuito, por isso **o `pg_dump` semanal deixa de ser higiene e passa a ser o único backup que existe** (Task 1.5): GitHub Actions, domingo às 03:00, artefacto com 90 dias de retenção, mais um dump manual antes de cada migração. Um backup que nunca foi restaurado não é um backup — o restauro faz parte da Task 1.6 e repete-se uma vez por trimestre.
- **Perda máxima aceite:** 7 dias de reservas e de stock. Se essa perda passar a doer, a conversa do Pro (≈25 USD/mês, backups diários de 7 dias) volta — mas com números, não com medo.
- **5 GB de egress por mês, partilhados.** O Localizador serve imagens de `public/produtos/` pela Vercel (não conta), mas cada pesquisa conta contra a API. Vigiar em Reports → Usage.
- **50 000 MAU** partilhados — folgado hoje; a métrica só conta utilizadores autenticados.
- **Pausa por inactividade** (7 dias) deixa de ser teórica: se o site principal cair por uma semana, o Localizador cai com ele. Monitorização (Vercel + um ping diário) passa a ser necessária.
- **Um único ponto de falha**: uma migração mal aplicada derruba os dois sites. É o preço da identidade única, e é a razão de as migrações passarem a ter backup obrigatório.

### 9.2 Riscos técnicos

| Risco                                                  | Mitigação                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Escalada de privilégios por `admin_users`               | Schemas separados; nenhuma linha copiada entre eles; teste explícito de que um `admin` do CMS não entra em `/interno` |
| RLS partida na mudança de schema (políticas com `public.`) | Task 2.5 + teste de acesso por papel antes do corte (stock com sessão de farmácia, leitura anónima negada) |
| Views a furar a RLS                                     | `security_invoker = true` (Task 2.4)                                                                    |
| Realtime silencioso                                      | `schema: 'localizador'` nas 3 subscrições + publicação `supabase_realtime` (Task 2.7)                    |
| Cookies grande/partidos                                 | `@supabase/ssr` já fragmenta; testar login com sessão Google (JWT maior) nos três hosts                   |
| Terceiro host para manter                                | Alias no mesmo projecto Vercel, não um deploy novo; DNS + allow list + `noindex` na Phase 6              |
| `next` a atravessar domínios (open redirect)              | `saveNext()` com allow list de hosts e caminhos relativos (Task 6.3); testar um `next` externo no smoke test |
| Link de confirmação aberto noutro dispositivo           | Limitação do PKCE; mensagem clara + reenvio                                                             |
| Sessões antigas invalidadas no corte                    | Aviso interno; é um logout único                                                                        |
| Deriva entre migrações e base viva                      | Task 1.3 antes de tudo; o baseline vem da base, não das migrações                                       |
| `auth.users` fora do dump                               | O backup actual (`public` + `localizador`) restaura tudo menos as 17 tabelas com FK a `auth.users`: num projecto novo, essas linhas são recusadas (Task 1.6). Serve para desfazer uma migração má; **não** serve para «o projecto morreu». Decidir se `auth.users` passa a entrar no dump |
| Duas equipas, uma base                                  | Regra §3.1: cada repo é dono do seu schema; nenhum `db push` cruzado                                    |

---

## 10. Fora de âmbito (de propósito)

- Alertas de stock por e-mail (foi decidido deixar para depois; exige cron de correspondência e um novo tipo de e-mail).
- Unificar o catálogo: ligar `localizador.drugs` (produto) a `public.drugs` (monografia) por `molecule`/ATC. É o próximo passo natural, mas é um projecto próprio e não bloqueia contas.
- Unificar identidades de farmácia e de utente (um dono de farmácia que também guarda produtos) — hoje já é possível tecnicamente (mesma `auth.users`), mas não há UI que o explique.
- Trazer `/[lang]/guardados` e `/[lang]/anotacoes` para `conta.*` — ficam no site enquanto as notas por item e os cartões de conteúdo só existirem lá.
- Unificar o login do portal da farmácia (`/portal/login`) com `conta.*` — é outra identidade (`localizador.admin_users` + papel + PIN de balcão). O portal fica onde está, e um utente autenticado que lá chegue continua a bater em `SEM_PERFIL`.
- Passkeys, 2FA para utentes, telefone/SMS.

---

## 11. Decisões fechadas (28/10/2026)

| Decisão                  | Ficou assim                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| Guardados do Localizador | `localizador.favorites` com FKs reais (§4.1)                                      |
| Apagar conta             | entra no v1, em `conta.*/perfil/seguranca` (§4.4)                                  |
| Área de conta            | `conta.conhecafarmacia.com` como alias do projecto do site principal; entrar, registar e gestão **só** lá; as listas ficam nos sites |
| Backups                  | gratuito mantido + `pg_dump` semanal obrigatório e restauro testado (§9.1, Task 1.5–1.6) |

Fica por confirmar no arranque da Phase 1 (não muda a arquitectura):

1. A conta Supabase que hoje vê os dois projectos é a mesma, ou é preciso convidar um segundo utilizador para a organização `bryemnhg…`?
2. Em desenvolvimento, o Localizador passa a correr em `localhost:3001` (o site principal fica no `3000`) — confirmar que isso não choca com nenhum script ou hábito.
3. Quem recebe o alerta quando o workflow semanal de backup falhar (e-mail do GitHub Actions para que endereço).

---

## 12. Estado da implementação — hub de conta (29/10/2026)

Feito no repositório `conheca-farmacia-NEXT` (é ele que serve `conta.*`):

- **`app/(identidade)/`** na raiz, sem `[lang]`: `entrar`, `registar`, `recuperar`, `auth/confirm`, `auth/reset`, `perfil`, `perfil/seguranca`. Layout próprio (marca + caminho de volta, sem chrome de marketing) e `noindex` em todas.
- **Formulários reutilizados**, não copiados: `entrarClient`, `registoClient`, `esqueciClient` e `reporClient` mudaram para `components/auth/` (`EntrarForm`, `RegistoForm`, `EsqueciForm`, `ReporForm`) e ganharam `basePath`, `nextUrl`, `confirmPath` e `resetPath` com valores por omissão que mantêm o site a funcionar. As páginas `/[lang]/*` só mudaram o import.
- **`proxy.js`**: regras de host nos dois sentidos (`conta.*` só serve a conta; o resto volta para o site; `www` envia as páginas antigas de conta para `conta.*` com o `search` preservado) e CSP + renovação de sessão também nas rotas de conta.
- **Sessão partilhada**: `NEXT_PUBLIC_COOKIE_DOMAIN` no cliente browser, no cliente servidor e no proxy.
- **`safeNext()`** (`lib/account-next.js`): allow list de hosts e caminhos relativos; `cf-next` (cookie de 10 min) para o `next` sobreviver ao Google OAuth.
- **`deleteMyAccount`** (`lib/actions/account.js`): service-role só no servidor, confirmação escrita exigida dos dois lados e recusa de contas da equipa interna.

Desvios ao plano, e porquê:

1. **Não há `/repor-senha`.** O link de reposição cai em `/auth/reset` → `/perfil/seguranca`, que já tem o formulário da nova senha ao lado das outras opções. Um ecrã a mais seria o mesmo formulário num sítio a mais.
2. **O hub é uma página nova, não o `perfilClient`.** Aquele perfil é o do estudante (quizzes, competições, turma, pré-visualização de guardados) e vive no site; o hub é transversal aos dois produtos. `/[lang]/perfil` e `/[lang]/perfil/definicoes` **continuam a existir** (o hub liga ao «Perfil de estudante»), o que contraria a Task 6.6 — a decisão fica para quando o hub tiver as estatísticas.
3. **`NEXT_PUBLIC_COOKIE_DOMAIN` só em Production.** Em Preview (`*.vercel.app`) o browser recusa o domínio pai e o login deixa de funcionar.

Por fazer (não é código):

- Adicionar `conta.conhecafarmacia.com` ao projecto Vercel do site principal + CNAME no DNS.
- Supabase → URL Configuration: `https://conta.conhecafarmacia.com/**` (sem isto, o Google e os e-mails podem ser recusados; o fallback para `www` ainda é recuperado pelo 308, que preserva o `code`).
- Os links do hub para `/guardados` e `/reservas` do Localizador dependem do corte (Phase 7): o código está feito e testado localmente contra a base nova.
- Lint e build por correr (o dev server está a usar a máquina). Até agora: parse/format dos 21 ficheiros novos e alterados, sem erros.

---

## 13. Estado da fusão no Localizador (29/10/2026)

Feito no projecto Supabase principal (`tbqs…`) e no repositório do Localizador. **O corte foi feito** no mesmo dia (Task 7.3): produção serve a base nova desde o commit `6ade639`.

**Base**

- Schema `localizador` criado a partir do dump da base viva (25 tabelas, 2 views, 30 funções, 30 policies, 7 triggers), com `pg_trgm` e `pg_cron` instalados. Baseline em `supabase/migrations/0045_schema_localizador_baseline.sql`.
- Dados copiados tabela a tabela; contagens iguais às da origem (9 farmácias, 42 produtos, 246 `stock_items`, 28 reservas, 48 lotes, 63 movimentos, 9 subscrições, 3 perfis de balcão, 2 chaves). 50 FKs verificadas, 0 órfãs. Sequências repostas.
- Schema exposto no PostgREST (`public, localizador, graphql_public`), privilégios e default privileges para `anon`/`authenticated`/`service_role`, e `localizador.stock_items`/`reservations` na publicação `supabase_realtime`.
- Bucket `drug-images` recriado com os mesmos limites do original (público, 2 MB, jpeg/png/webp).
- Contas: 3 das 5 copiadas com o mesmo `id` e o mesmo hash bcrypt; as outras 2 já existiam no site principal com outro `id` e o mesmo e-mail, por isso ficaram com a conta do site (id do destino) e o dump foi reescrito — `conhecerfarmacia@gmail.com` e `baptistalimab@gmail.com`. Consequência: nessas duas, a palavra-passe passa a ser a do site principal.

**Código (Localizador)**

- `lib/supabase/client.js`, `server.js` e `admin.js` com `db: { schema: 'localizador' }`; cookie partilhada via `NEXT_PUBLIC_COOKIE_DOMAIN`; `proxy.js` renova a sessão nos GET sem perder o nonce da CSP.
- `lib/account-session.js` (`getAccountSession`, `requireAccount`, `entrarUrl`) e `lib/actions/account.js` (`sair`, `toggleFavorito`).
- `/guardados` e `/reservas` (Server Components, `force-dynamic`, `noindex`), com `components/conta/AccountNav.jsx` e estilos `.acct-*` em `styles/loja.css`. Vazio-desenhado em ambas, com caminho de volta à pesquisa.
- `lib/actions/reservations.js` passa a anexar `user_id` lido da sessão no servidor (a reserva sem conta continua igual).
- As 3 subscrições Realtime usam o schema `localizador`.

**Verificado localmente** (dev server contra a base nova): `/guardados` e `/reservas` redireccionam para `conta.*/entrar?next=…` sem sessão; com sessão de uma conta de teste, `/guardados` lista produto e farmácia e `/reservas` mostra a reserva com estado e link de acompanhamento; RLS recusa insert sem `user_id = auth.uid()`; remover o favorito volta ao vazio.

**Corte — feito a 29/10/2026**

1. Vercel → projecto do Localizador (`localizador-conhecafarmacia`, Production e Preview): URL/anon/service-role do `tbqs…`, `NEXT_PUBLIC_CONTA_URL` e `NEXT_PUBLIC_COOKIE_DOMAIN` (só Production). Feito pelo CLI, verificado com `vercel env pull`.
2. Os 2 cron jobs (Task 3.3) criados no `tbqs…` com `localizador.*` nos comandos. O segredo do job de webhooks **não existia** no Vault do projecto antigo — o job de lá devolvia `0 rows` desde sempre. Em vez de copiar, gerou-se um novo e ficou nos dois lados (`CRON_SECRET` na Vercel + `cron_webhook_secret` no Vault).
3. Deploy por push do `main`; `/pesquisa`, `/produto/<id>`, `/farmacia/<slug>`, `/medicamento/<id>`, `/sobre`, `/portal/login` a 200 com dados da base nova; `/guardados` e `/reservas` a mandar para `conta.*/entrar`; `net._http_response` a 200 em cada minuto.
4. Bug apanhado no corte: `getProductServer`, `getPharmacyStockServer` e as sugestões da homepage criavam o cliente cru do `supabase-js` e procuravam a view `stock_confirmed` em `public` — a ficha e a prateleira saíam vazias no HTML inicial. Corrigido em `lib/stock.js`, `lib/home-suggestions.js` e `scripts/geocode-pharmacies.mjs` (commit `969ce4b`).
5. `confirmed_at` alinhado com a origem nas 238 linhas que a reconfirmação diária tinha mexido; comparação campo a campo das 5 tabelas de catálogo: 0 diferenças, fora o remapeamento de contas.

**Falta fora do plano de código:** `SUPABASE_DB_URL` novo para os scripts e para o backup semanal (Task 1.5) e pausar o projecto antigo (Task 7.5).

---

## 14. Estado a 29/10/2026, fim do dia — o que falta do plano

**Concluído depois do §13**

- `conta.*` redesenhado: fora o cabeçalho de produto, barra neutra com a marca e dois destinos, e o hub passou a listar os guardados com «ver no site» (só quando há monografia) e «ver farmácias». Commit `4c2b3a1`, no branch `security/i18n-audit-fixes` do `conheca-farmacia-NEXT` — **ainda não está no `main`**: o `main` local está 419 commits atrás do `origin/main` e o merge pede resolução manual em `proxy.js` e `styles/globals.css`.
- `/medicamento/<id>` no Localizador (commit `22fab67`, em produção): destino do «ver farmácias» e primeira página do produto cujo URL não depende de um item de stock.

**Fechado a 29/10, ao fim do dia**

- **Task 6.10** — `site_url` em `https://conta.conhecafarmacia.com`; `uri_allow_list` com as 10 entradas, incluindo `https://localizador.conhecafarmacia.com/**` e os `localhost:3000/3001`. Commit `ec126af`.
- **Task 6.7** — `X-Robots-Tag: noindex, nofollow` em `/entrar`, `/registar`, `/recuperar`, `/perfil`, `/perfil/:path*` e `/auth/:path*` (`vercel.json`, mesmo commit).
- **Tasks 1.5 e 1.6** — backup semanal *e* restauro testado; detalhe e limites na Task 1.6. Papel `backup_dumper` criado no `tbqs…` (só leitura), segredo `SUPABASE_DB_URL` criado no GitHub e o workflow já correu verde (artefacto de 29/10). **Falta só quem recebe o alerta de falha** (§11.3).
- **Tasks 5.5, 5.7 e 5.8** — Localizador: `AccountEntry` no cabeçalho e na gaveta, `FavoritesProvider` + `FavoriteButton` na ficha, no cartão e na farmácia, reserva pré-preenchida e «ver as minhas reservas». O `VariantCard` ficou de fora de propósito: o cartão inteiro é um `<button>` e um botão dentro de outro não é HTML válido.
- **Task 5.9** — secção 12 da privacidade e secção 9 dos termos, com índices renumerados.
- **O merge para o `main` do `conheca-farmacia-NEXT`** — feito por `git push HEAD:main`, fast-forward `afeb780..ec126af`. Não houve conflito: o `origin/main` era ancestral do branch (0 commits de atraso), ao contrário do que o §14 dizia. O `main` local também ficou em `ec126af`.

**Por fazer, por ordem sugerida**

1. **Task 6.6** — 308 das páginas de conta antigas do site. Continua consciente e por fazer (§12, desvio 2): `/[lang]/perfil` e `/[lang]/perfil/definicoes` mantêm-se enquanto o hub não tiver as estatísticas do estudante.
2. **Tasks 6.11 e 6.12** — texto dos e-mails de confirmação/reposição sem prometer funcionalidades de um só site, e aviso interno de que a sessão antiga (*host-only*) deixa de valer.
3. **Tasks 7.1, 7.2, 7.4 e 7.5** — o smoke test de produção de hoje cobriu as páginas públicas, o redirect de `/guardados`, os webhooks e o worker a 200; **não** cobriu entrar, guardar com sessão, reservar com sessão nem o realtime do portal. E o projecto antigo continua por pausar.
4. **Decisão nova: `auth.users` entra no dump?** — o restauro mostrou que as linhas com dono ficam de fora sem `auth.users` (Task 1.6). Como o backup serve hoje para desfazer uma migração má, não faz falta; se passar a servir para «o projecto morreu», tem de entrar. Decidir antes de precisar dele.
5. **Build do `conheca-farmacia-NEXT` por verificar nesta máquina** — o `next build` falha aqui só em `next/font/google` (sem rede para `fonts.googleapis.com`), que é anterior a estas alterações; o `eslint` dos ficheiros tocados está limpo. A Vercel tem rede e é quem julga.

**Catálogo do site ↔ catálogo do Localizador (§10 revisto a 29/10)**

Deixa de estar «fora de âmbito». Fica decidido usar o **ATC** — que já existe nos 364 medicamentos do site — como chave de correspondência, e **deixar a parafarmácia de fora**, por não ter monografia. Próximo passo: `localizador.drug_links` (site_drug_id, catalogue_drug_id, atc_code, confidence, source) com seed por ATC e nome normalizado, e revisão humana dos 18 casamentos que hoje existem por nome.
