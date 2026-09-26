# Localizador de Medicamentos Disponíveis — Implementation Plan

> **For agentic workers:** implementar por tarefas com checkboxes. Migrações SQL são
> aplicadas manualmente pelo utilizador no Supabase (o agente nunca executa migrações).
> Novas migrações começam em **`113`** (a última é a 112).

**Goal:** Permitir que qualquer pessoa pesquise um medicamento e veja **em que farmácias
de Luanda está disponível**, com pedido de **reserva** encaminhado à farmácia
(in-app + notificação WhatsApp), directório de farmácias, alertas de disponibilidade e
dashboard self-service para as farmácias parceiras.

**Decisiones tomadas com o owner (2026-09-19):**

| Decisão | Escolha |
|---|---|
| Âmbito geográfico | **Só Luanda** (fase 1) |
| Fluxo de compra | **Encaminhamento/reserva** (sem pagamento no site; checkout engavetado) |
| Fonte de dados | **Híbrido**: portal self-service + validação activa da equipa + expiração automática |
| Granularidade | **Misto**: binário (tem/não tem) + quantidade opcional |
| Integração no site | **Ambos**: secção standalone + bloco "Onde encontrar" na página do fármaco |
| Canal de reserva | **In-app + WhatsApp**: pedido criado no sistema, farmácia notificada por WhatsApp com link para confirmar no portal |
| Portal de farmácias | **Self-service desde o início** (papel `farmacia` no admin existente) |
| Âmbito MVP | Directório + alertas + dashboard farmácia + estatísticas (tudo, em fases) |

**Contexto:** o site (conhecafarmacia.com) é uma plataforma angolana de educação em
saúde com Next.js 16 + Supabase, i18n PT/EN completo, admin com RBAC
(`admin`/`superadmin`) e 2FA. **Não é farmácia e não vende medicamentos** — o
localizador é um serviço de informação + encaminhamento, o que reduz drasticamente a
carga regulatória (mas ver riscos legais abaixo). A tabela `public.drugs` já existe
(moléculas, slugs, PT/EN, aliases, ATC em `084`) e as páginas `/medicamentos` +
`/medicamento/[slug]` já recebem tráfego orgânico — o localizador cruza-se com elas em
vez de as duplicar.

---

## Referências (como se faz noutros países)

Pesquisado em 2026-09-19:

- **Linha 1400 + INFARMED (Portugal)** — localizador nacional de medicamentos de
  disponibilidade reduzida. Farmácias reportam stock **por web service obrigatório** ao
  regulador; o localizador é só encaminhamento, sem venda. É o modelo mais próximo do
  nosso (mas eles têm mandato legal; nós teremos de conquistar farmácias com valor).
- **mPharma (Gana/Nigéria)** — resolveu o problema dos dados **gerindo o inventário**
  das farmácias (VMI). Lição: dados fiáveis de stock são o produto mais difícil;
  quem os controla domina o mercado.
- **Consulta Remédios / Farmácias App (Brasil)** — o "stock" é o inventário do
  e-commerce da farmácia; monetizam por venda/entrega. Modelo marketplace —
  **engavetado** para nós.
- **Angola hoje**: Mecofarma, Kubinga e Appy Saúde resolvem por **WhatsApp/telefone e
  entrega própria**; ninguém publica disponibilidade real. Quem publicar stock real
  cria vantagem competitiva imediata.

**Insight central:** para medicamentos difíceis de encontrar, não é preciso real-time
de verdade. Basta **binário + timestamp da última confirmação + expiração automática +
reserva que invalida o estado**. Isto torna o problema de dados tractável sem
integração com POS/systemas de farmácia (inexistentes em Angola).

---

## Arquitectura

### Modelo de dados (migrações 113–117)

```
pharmacies 1───* pharmacy_stock *───1 drugs
     │                                   │
     │                                   └── * pharmacy_products (catálogo comercial)
     └──* reservations *───1 pharmacy_products
          └──* availability_alerts *───1 drugs
```

- **`pharmacies`** — id, slug, name, district/município, address, lat/lng, phone
  (E.164), whatsapp_number, email, opening_hours, logo_url, **partner tier**
  (`standard` | `verified`), is_active, status, is_archived + soft-delete padrão.
  RLS `admin_all` + `anon_read` (padrão do projecto).
- **`pharmacy_products`** — catálogo comercial: id, **pharmacy_id FK**, **drug_id FK
  NULLABLE** (links a molécula), presentation TEXT (ex.: "Varfarina 5 mg — 30 comp."),
  manufacturer, **barcode** (EAN, para matching futuro), **is_prescription** BOOLEAN
  (reservas de receituário marcadas "apresente a receita"), price_aoa NUMERIC NULL,
  status. UNIQUE (pharmacy_id, presentation) — caso de colisão: mesmo nome de
  apresentação, warehouses diferentes → slug `presentation_key` gerado
  (`lowercase-nospaces` do nome) para o UNIQUE ser robusto a espaços/case.
- **`pharmacy_stock`** — disponibilidade por (pharmacy_id, pharmacy_product_id):
  `available BOOLEAN`, `quantity INT NULL` (NULL se a farmácia não reporta
  quantidade), **confirmed_at TIMESTAMPTZ**, confirmed_by UUID, source
  (`pharmacy_portal` | `team_crm` | `api`). **Um registo por produto-farmácia**
  (UNIQUE). Nota: se quantity for relevante, é por apresentação, não por molécula.
- **`availability_alerts`** — id, **drug_id FK**, presentation TEXT NULL (opcional),
  contact_channel (`sms` | `whatsapp` | `email`), contact_value TEXT, lang, status
  (`active` | `notified` | `cancelled`), notified_at, created_ip_hash (privacidade —
  padrão `hashEmail` djb2 já existente em `lib/actions/inscription.js`).
  UNIQUE (lower(contact_value), drug_id) entre activos (parcial — `WHERE
  status='active'`).
- **`reservations`** — id, code TEXT UNIQUE (6–8 chars, ex. `CF-7K3P9`), pharmacy_id,
  pharmacy_product_id, drug_id (denormalizado para estatística), quantity,
  customer_name, customer_phone (E.164), customer_notes, **status**
  (`pending` → `confirmed` → `ready` → `completed` | `cancelled` | `expired`),
  expires_at (ex.: 24h), source (`web`), timestamps. **Expira sozinho**: migração cria
  função `expire_stale_reservations()`; chamar via `pg_cron` (extensão activa no
  Supabase; verificar com `supabase/config.toml`) a cada 15 min.
- **`pharmacy_sessions`** — autenticação das farmácias: id, pharmacy_id, token_hash,
  expires_at. **Na fase 1, as farmácias entram pelo admin Supabase Auth existente**
  (papel `farmacia` em `admin_users.role`), sem tabelas de sessão próprias.
- **`availability_audit_log`** — INSERT-only para auditoria de mudanças de stock
  (quem, quando, de quê para quê, source) — padrão do `audit_logs` existente.

### Perfis de acesso (RBAC — estende o sistema existente)

| Papel | O que pode |
|---|---|
| `superadmin` | Tudo: CRUD farmácias, apagar reservas, ver estatísticas globais |
| `admin` | Gestão de farmácias, stock, reservas (sem hard delete) |
| `farmacia` (novo) | Vê/apaga **só a sua** farmácia; actualiza **só o seu** stock; vê **só as suas** reservas e estatísticas |
| `anon` | Pesquisa pública, directório, cria reserva, cria alerta |

O papel `farmacia` vive em `admin_users.role` (tabela existente); a migração adiciona
`'farmacia'` ao CHECK, cria o user Supabase Auth por farmácia e o registo em
`admin_users` com `role='farmacia'`, `pharmacy_id` (nova coluna, FK a `pharmacies`).
O **proxy.js e AuthGuard continuam a funcionar** — passam a aceitar `farmacia` como
papel válido para as rotas do portal (ver T9). RLS com `TO authenticated USING
(pharmacy_id = auth Pharmacia própria)` via subquery — **cuidado com recursão de RLS**
(padronizado na migração `242_fix_competitions_rls_recursion.sql` deste projecto;
usar `SECURITY DEFINER` helper `current_user_pharmacy_id()`).

### Rotas (padrão do projecto: espelho PT/EN, `lib/i18n-routes.js`)

| Rota PT | Rota EN | Descrição |
|---|---|---|
| `/localizador` | `/medicine-finder` | Pesquisa de fármaco → lista de farmácias com disponibilidade |
| `/farmacias` | `/pharmacies` | Directório de farmácias de Luanda (com filtros por município) |
| `/farmacia/[slug]` | `/pharmacy/[slug] | Página pública da farmácia (morada, horas, mapa, produtos reportados) |
| `/localizador/reserva/[code]` | `/medicine-finder/reservation/[code]` | Estado da reserva (consultável pelo cliente) |
| `/alertas` | `/alerts` | Criar/gerir alertas de disponibilidade |

Adicionar a `PT_TO_EN` em `lib/i18n-routes.js`: `localizador: 'medicine-finder'`,
`farmacias: 'pharmacies'`, `farmacia: 'pharmacy'`, `alertas: 'alerts'`.
Admin: `/admin/localizador/` (farmácias, stock, reservas, estatísticas) e
`/admin/farmacia/` (dashboard da farmácia parceira).

### Fluxo de reserva (in-app + WhatsApp)

1. Utilizador pesquisa → vê farmácias com `available=true AND confirmed_at > now() -
   INTERVAL '72 hours'` (configurável).
2. Clica "Reservar" → formulário (nome, telefone E.164, quantidade, notas, consent).
3. Server Action `createReservation` (zod, rate-limit por IP como nas inscrições):
   gera code, INSERT `status='pending'`, `expires_at = now() + 24h`.
4. **Notificação WhatsApp**: como não há infra de WhatsApp Business, fase 1 usa
   **deep link `wa.me` para o número da farmácia com mensagem pré-preenchida**
   (código da reserva, medicamento, quantidade, telefone do cliente) mostrada ao
   utilizador ("Envia esta mensagem para a farmácia") + **a reserva aparece
   imediatamente no portal da farmácia**. A farmácia confirma no portal; o utilizador
   vê o estado em `/localizador/reserva/[code]` (e por SMS opcional — ver fase 3).
5. Farmácia atende: entrega ou recolha no balcão. **Pagamento sempre no balcão** —
   nunca no site (fase 1).

**Nota honesta sobre a notificação:** o "in-app + WhatsApp" verdadeiro (API WhatsApp
Business, mensagens automáticas) requer aprovação Meta + custo por conversa — está
**engavetado** para a fase 3. Na fase 1 o deep link wa.me é gerado pelo cliente
(página de confirmação da reserva) e a farmácia é alertada ao entrar no portal +
SMS/e-mail da equipa para reservas não confirmadas em X horas.

### Cadência de actualização de stock (híbrido)

- **Farmácia** actualiza no portal: toggles "temos/não temos" por apresentação +
  quantidade opcional; `confirmed_at = now()`, `source='pharmacy_portal'`.
- **Equipa** (admin) pode actualizar por qualquer farmácia: `source='team_crm'`
  (contactos WhatsApp/telefone registados em `availability_audit_log`).
- **Expiração automática**: a pesquisa pública só mostra `confirmed_at` < 72h; UI
  mostra "confirmado há 3 dias" quando > 24h (badge de frescura) e "sem confirmação
  recente" quando expirado. A farmácia vê "stock desactualizado" no dashboard como
  chamada à acção.
- **Real-time no site**: `supabase.realtime` subscription no client da pesquisa
  (mudanças em `pharmacy_stock` reflectem sem refresh). Baixo custo, alto valor
  percebido — mas é **fase 2** (o binário + timestamp já resolve).

### Integração com as páginas existentes

- Página `/medicamento/[slug]` ganha secção **"Onde encontrar em Luanda"** (Server
  Component fetch das farmácias com stock recente + CTA para o localizador).
- O localizador pesquisa **na tabela `drugs` existente** (nome, aliases, classe) +
  `pharmacy_products.presentation` — não duplica catálogo.
- **Matching molécula↔produto**: farmácias raramente usam DCI. Estratégia: no
  onboarding, a equipa associa cada apresentação à molécula em `drugs` (campo
  `drug_id`); o admin tem autocomplete de fármacos; apresentações sem match ficam
  visíveis só no directório da farmácia (não no localizador), com fila
  "produtos por associar" para a equipa tratar.

---

## Fases

### Fase 1 — MVP (semanas 1–4, funcional em Luanda)

- [ ] **T1 — Migração 113** `supabase/migrations/113_localizador_schema.sql`:
      `pharmacies`, `pharmacy_products`, `pharmacy_stock`, `reservations`,
      `availability_alerts`, `availability_audit_log` + RLS + índices
      (`pharmacy_stock(drug_id)`, GIN trgm em `presentation`, etc.) + helper
      `SECURITY DEFINER` `current_user_pharmacy_id()` + CHECK de papel `farmacia`.
      Seed piloto: 5–10 farmácias reais de Luanda + produtos das 10 moléculas-alvo.
- [ ] **T2 — Migração 114** `114_admin_users_farmacia_role.sql`: CHECK role +
      coluna `pharmacy_id` em `admin_users` + RLS para o papel farmácia.
- [ ] **T3 — Server Actions** `lib/actions/localizador.js` (novo):
      - Público: `searchAvailability(drugSlugOrQuery, municipality)`,
        `createReservation(...)`, `createAvailabilityAlert(...)`,
        `getReservationByCode(code)`.
      - Farmácia: `updateStock(...)`, `getMyPharmacy()`, `getMyReservations()`,
        `getMyStockSnapshot()`.
      - Admin: `upsertPharmacy`, `upsertPharmacyProduct`, `updateStockAsTeam`,
        `listReservations(filter)`, `getLocalizadorStats()`.
      - Padrão do projecto: zod, `throwCode(code, detail)` + legacy
        `throw new Error('duplicate')` paralelo, logInscriptionError-style telemetry
        (hash de contacto, sem PII), rate-limit por IP.
- [ ] **T4 — i18n** `public/i18n/{pt,en}.json`: secções `localizador_page.*`,
      `farmacias_page.*`, `farmacia_page.*`, `reserva_page.*`, `alertas_page.*` +
      blocos `${feature}_error.codes` para as 4 features (padrão de 3 camadas).
- [ ] **T5 — Rotas públicas** PT + EN (padrão espelho, `export const dynamic =
      'force-dynamic'`, `generateMetadata` com alternates, `loading.jsx`):
      localizador (pesquisa + resultados), directório, página farmácia, estado da
      reserva, alertas. Clients usam `useLang()`; zero `t()` atravessando RSC.
- [ ] **T6 — Página do fármaco**: secção "Onde encontrar em Luanda" em
      `medicamentoDetailClient` (Server fetch + componente pequeno; badge de frescura
      do stock; CTA para o localizador).
- [ ] **T7 — Admin localizador** (páginas sob `app/[lang]/(admin)/localizador/`):
      CRUD farmácias, gestão de produtos por farmácia + fila "produtos por
      associar", actualização de stock como equipa, lista de reservas com filtros.
- [ ] **T8 — Portal da farmácia** (páginas sob `app/[lang]/(admin)/farmacia/`):
      login com papel `farmacia`, snapshot do stock (toggles + quantidade), fila de
      reservas (confirmar/pronto/concluir), banner "stock desactualizado".
- [ ] **T9 — Proxy/AuthGuard**: aceitar papel `farmacia` nas rotas de portal;
      redirect correcto para `/{lang}/admin/login`; testar hardening.
- [ ] **T10 — MVP enxuto de estatísticas** (dentro do admin, sem `pg_cron` ainda):
      contagens simples — top 20 fármacos pesquisados, reservas por estado,
      farmácias activas, taxa de resposta das farmácias. Tabela
      `search_queries_log` (drug_slug, ts, municipality) alimenta "mais procurados".
- [ ] **T11 — Módulo de recrutamento (não-código)**: one-pager de parceria, script
      de contacto, checklist de onboarding (criar user, formação 20 min via
      WhatsApp, materiais). Aparece no plano como T11 porque o MVP não existe sem
      farmácias dentro.
      **Documentos já redigidos:**
      - `docs/LOCALIZADOR_ONE_PAGER_PARCERIA_FARMACIAS.md` (pitch + objeções + canais)
      - `docs/LOCALIZADOR_CHECKLIST_ONBOARDING_FARMACIAS.md` (ficha por farmácia,
        5 etapas, script de contacto, métricas do módulo)

### Fase 2 — Robustez e real-time (semanas 5–8, pós-validação do piloto)

- [ ] **T12 — Realtime**: subscription Supabase Realtime no client do localizador
      (mudanças de stock sem refresh) + optimistic UI.
- [ ] **T13 — `pg_cron` + expiração server-side**: `expire_stale_reservations()` a
      cada 15 min; alertas de stock desactualizado para farmácias (digest diário por
      e-mail via Brevo, reutilizando `supabase/functions/_shared/brevo.ts`).
- [ ] **T14 — Alertas notificados**: quando stock passa a disponível, marcar alertas
      activos como `notified` e enviar por canal escolhido (e-mail via Brevo na
      fase 1; SMS/WhatsApp engavetado).
- [ ] **T15 — Geolocalização**: ordenar farmácias por distância (fórmula haversine
      em Postgres, sem PostGIS na fase 2) + "farmácias perto de mim" no client.
- [ ] **T16 — Onboarding self-service melhorado**: import de catálogo por CSV da
      farmácia; import de stock inicial em massa.
- [ ] **T17 — Estatísticas avançadas**: tendências de procura por semana, mapa de
      cobertura por município, comparativo entre farmácias.

### Fase 3 — Engavetado (implementar só se/ quando fizer sentido)

- [ ] **T18 — Checkout/pagamento**: venda directa, Multicaixa Express/Paypay/
      Stripe-Angola, logística de entrega. **Só** com assessoria legal (regulação
      de venda online de medicamentos em Angola) e volume que justifique.
- [ ] **T19 — API WhatsApp Business Cloud API**: notificações automáticas bidireccionais
      (reserva confirmada, pronta, etc.). Requer aprovação Meta + custos por
      conversa. Pré-requisito: volume de reservas que justifique.
- [ ] **T20 — Integração POS**: integração directa com software de farmácia local
      (se existir adopter) ou web service de reporte automático (modelo INFARMED).
- [ ] **T21 — Expansão geográfica**: Benguela, Huambo, Lubango — replicar playbook
      de recrutamento de Luanda.
- [ ] **T22 — Expansão de catálogo**: das 10 moléculas-alvo para o essencial
      (modelo OMS) + OTC comum, mantendo qualidade de dados como critério de
      inclusão (melhor 500 produtos bem mantidos que 5000 estagnados).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Farmácias não actualizam stock (o risco #1 do projecto) | Expiração a 72h + badge de frescura + digest semanal de farmácias inactivas + equipa valida por WhatsApp (híbrido) + stat "taxa de resposta" visível no admin |
| Farmácias não respondem a reservas | SLA visível: reservas não confirmadas em 4h disparam alerta para a equipa; stat "taxa de resposta" por farmácia; tier `verified` só para quem responde |
| Dados errados (stock diz que tem, não tem) | Binário + timestamp (nunca prometer quantidade exacta); disclaimer "confirme por telefone antes de deslocar"; audit log permite rastrear fonte do erro |
| Matching molécula↔produto incorrecto | Fila de revisão + campo drug_id nullable + reporte de erros pelo utilizador ("este produto não é X") — fase 2 |
| Recursão de RLS no papel farmácia | Helper `SECURITY DEFINER` (padrão da migração 242 deste projecto) |
| Concorrência com Mecofarma/Appy Saúde | Não competir em entrega — competir em **informação** (stock real + reserva). Diretório é público; farmácias não-parceiras aparecem sem stock (só contacto) |
| Regulação (venda online de medicamentos) | Fase 1 não vende nada — é directório + reserva + encaminhamento. Confirmar com advogado angolano antes da fase 3 (checkout) |
| LGPD/privacidade de contactos (telefone do cliente) | Telefone só visível à farmácia da reserva; hash djb2 nos logs; consentimento explícito no formulário; política de privacidade actualizada (página já existe em `035_privacy_sections.sql`) |

---

## Open questions (decidir durante a implementação, não bloqueiam T1)

1. **Nome público da funcionalidade**: "Localizador" vs "Onde Encontrar" vs outro —
   afecta UI copy e SEO. Decidir antes de T4 (i18n).
2. **Moléculas-alvo do piloto**: lista das 10–20 mais procuradas/difíceis em Luanda
   (ex.: insulinas, anticonvulsivantes, antipsicóticos, quimioterápicos orais,
   imunoglobulinas?). Validar com farmacêuticos parceiros antes do seed.
3. **Preço visível?** Se `price_aoa` for reportado, mostrar no localizador ou só na
   página da farmácia? (Risco de guerra de preços / leis de preços máximos.)
4. **SMS da equipa**: plataforma para alertas internos de reservas não respondidas
   (fase 1 pode ser só e-mail digest; SMS é fase 2).
5. **Domínio das farmácias-parceiras**: login no admin existente
   (`/pt/admin/...`) é aceitável para farmácias externas, ou criar subdomínio
   `farmacias.conhecafarmacia.com`? (Fase 2 se sim; afecta vercel.json/CSP.)

---

## Métricas de sucesso do piloto (Luanda, 8 semanas)

- ≥ 15 farmácias activas (≥1 actualização de stock/semana)
- ≥ 60% das reservas confirmadas pela farmácia em < 4h
- ≥ 200 pesquisas/semana no localizador
- Top 10 fármacos-alvo com ≥ 3 farmácias com stock confirmado < 72h
- NPS informal com 5 farmácias-parceiras ≥ 8/10
