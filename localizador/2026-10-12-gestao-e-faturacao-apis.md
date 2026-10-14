# Gestão interna, facturação e APIs — análise para decidir

> **Data:** 2026-10-12
> **Pergunta:** vale a pena o Localizador passar a oferecer (1) API de ligação ao sistema de
> gestão que a farmácia já tem e (2) uma plataforma de gestão própria, com facturação?
> **Como ler isto:** a Parte 1–2 são lei e mercado (factos com fonte), a Parte 3–4 são as
> duas ideias desenhadas, a Parte 5 é a recomendação, a Parte 6 é o argumentário de venda.
> Onde não consegui confirmar, digo-o.
> **Relação com o resto da pasta:** isto **revê** a conclusão de
> `2026-09-23-gestao-farmaceutica-analise.md` ("não trazer POS/facturação") — a lei da
> facturação mudou o cálculo, e é isso que explico na Parte 2.

---

## 0. Sumário executivo

1. **As duas ideias não são o mesmo negócio.** A ideia 1 (API para ler o software que a farmácia já tem) é uma **extensão barata** do que existe. A ideia 2 (plataforma de gestão própria, com facturação) é um **negócio diferente** — vender e manter software de missão crítica, com obrigações fiscais e responsabilidade legal. A segunda não é "mais da primeira": é outro produto, outra equipa, outro suporte.

2. **A facturação é o melhor argumento de venda que apareceu até hoje, e o pior sítio para ir sem rede.** O Decreto Presidencial n.º 71/25 obriga os contribuintes do IVA (Geral e Simplificado) a emitir facturas **por software validado pela AGT**, com coimas de **7% do valor da factura** (15% se reiterado). "Não é software, é o que evita uma multa" vende sozinho. Mas **validar software na AGT é um processo próprio**, com número de certificação, assinatura, séries e SAF-T — e não encontrei fonte pública fiável de custo/prazo.

3. **Recomendação: fazer a ideia 1 agora, a ideia 2 em modo "gestão primeiro, facturação por parceria".** Ou seja: ingerir stock automaticamente (ideia 1) e, para quem não tem nada, dar **stock + validade + contagem + relatórios** (a parte de gestão que o código já tem meio construída), **sem** emitir documentos fiscais próprios na fase 1 — encaminhando a facturação para um programa já validado (parceria com KuatelaSoft/Kacennu/Vendus ou exportação CSV/SAF-T). Certificar o nosso software é um projecto de meses, não um sprint.

4. **Ninguém em Angola tem as duas peças juntas.** Há software de gestão certificado (KuatelaSoft, Naqsell, Kacennu, Vendus, Primavera/PHC, Sage X3 + SGSI) e há tentativas de localizador (Tecnofarma, Appy Saúde, SIMAF, Mecofarma/Kubinga por WhatsApp). O que não existe documentado é **um localizador com stock real alimentado por API, e um programa de gestão que publica esse stock como função nativa**. É essa a fenda.

5. **A contagem de mercado é o problema.** Em Angola as estimativas públicas andam à volta de **~2.000 farmácias licenciadas no país** (MINSA/ARMED) — e uma reportagem fala de 2.000 licenciadas **só em Luanda** mais 2.000 ilegais. Um estudo de 2018 em Malanje encontrou **7 de 20 (35%)** farmácias com computador e software de gestão. Conclusão operacional: a ideia 1 serve uma minoria formal (as que valem mais), a ideia 2 serve a maioria — mas a maioria é também a que tem menos capacidade de pagar e mais probabilidade de fechar.

6. **O dinheiro não está nas farmácias.** 100 farmácias a 15.000 Kz/mês dão ~1,5 M Kz/mês: paga o suporte, não a equipa de um ERP. A monetização realista é (a) bundlar conformidade fiscal a um preço mais alto (30.000–60.000 Kz/mês) em vez de competir com os 10.000–25.000 Kz do mercado, e (b) **vender a inteligência de rede** (procura não satisfeita, tendência de procura por zona) aos **armazenistas e à indústria** — que têm orçamento e não têm estes dados. A farmácia paga pouco; a cadeia paga bem.

7. **O risco maior não é técnico, é de identidade.** Se passarmos a ser "o sistema da farmácia", herdamos o suporte diário, a responsabilidade fiscal e o conflito de interesses com as farmácias que **não** são nossas clientes (o Localizador deixa de parecer neutro). Isto resolve-se com desenho: diretório sempre neutro, escalão gratuito, e a regra escrita de que o algoritmo não favorece clientes pagantes.

---

## 1. O que já existe hoje (inventário honesto do código)

Base: 19 migrações (`supabase/migrations/0001…0019`), Next.js 16 + Supabase, portal
self-service separado do site público.

| Peça                                                                                                       | Estado | Porquê interessa a esta análise                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `pharmacies`, `admin_users` (papel `farmacia`)                                                             | ✅     | a farmácia já tem conta própria — é a base de 															qualquer API com credencial por cliente |
| `drugs` (molécula, forma, dose, `requires_rx`, prioridade)                                                 | ✅     | catálogo canónico onde o stock de terceiros se 															tem de pendurar                        |
| `stock_items` (quantidade, preço, `confirmed_at`, `expires_at`, `origin`, `brand`, `pack_*`, `retired_at`) | ✅     | é aqui que a API de ingestão vai escrever                                             |
| View `stock_confirmed` com **regra das 72 h** + expirados escondidos                                       | ✅     | a semântica de frescura já existe — falta a 															origem e a confiança por fonte            |
| `reservations` com máquina de estados + baixa automática de stock                                          | ✅     | a reserva já mexe no saldo: é o "movimento" que 															faz o stock convergir                 |
| `pharmacy_staff` (0018) + PIN por perfil + sessão 24 h                                                     | ✅     | multi-utilizador por farmácia já resolvido 															(turnos, quem fez o quê)                   |
| Portal: stock, entrada, reservas, vendas, desempenho, equipa, atenção, perfil, sessão                      | ✅     | já é "software de gestão de stock", só não se 															chama assim                             |
| Realtime (sino de reservas, stock) + CSP com `wss://*.supabase.co`                                         | ✅     | a infra para "actualização sem trabalho" existe                                       |
| **Histórico de movimentos** (`stock_movements`)                                                            | ❌     | sem ele não há auditoria nem relatório credível 															para a farmácia                       |
| **Origem/sincronização do dado** (`source`, `synced_at`, `source_ref`)                                     | ❌     | sem isto, não se distingue stock escrito à mão 															de stock vindo de API                  |
| **Credenciais para terceiros** (chaves de API, scopes, webhooks)                                           | ❌     | é o que a ideia 1 pede                                                                |
| **Lotes/FEFO** (só existe validade por item)                                                               | ❌     | limita-nos a vendas pequenas; aceitável no 															piloto                                     |
| **Facturação/AGT**                                                                                         | ❌     | nada: nem documentos, nem séries, nem 															assinatura, nem SAF-T                           |

**Leitura:** metade da ideia 2 já está construída. O que falta na ideia 2 é exactamente a
parte carregada (POS de balcão rápido, lotes, facturação validada). O que falta na ideia 1 é
pequeno: credenciais, coluna de origem, endpoint de ingestão e a frescura por fonte.

---

## 2. Angola: o que a lei obriga (e o que ainda não sei)

### 2.1 O regime em vigor

- **Decreto Presidencial n.º 71/25, de 20 de Março de 2025** — novo Regime Jurídico das
  Facturas e documentos fiscalmente relevantes; em vigor desde **20/09/2025**. Revogou o
  **DP n.º 292/18** e o **DP n.º 144/23** (auto-facturação); do **DP n.º 312/18** derrogou
  apenas os n.os 1 e 5 do art. 2.º (dizer que "revogou o 312/18" é impreciso).
  [Texto do diploma](https://angolex.com/paginas/decreto-presidencial/regime-juridico-das-facturas-71a-25a.html) ·
  [alerta da EY](https://www.ey.com/pt_ao/technical/tax-alerts/novo-regime-juridico-das-facturas)

- **Software validado pela AGT é obrigatório** para todos os contribuintes dos regimes
  **Geral e Simplificado do IVA** (art. 7.º). O **Regime de Exclusão** pode usar blocos
  impressos por gráfica autorizada ou o Portal do Contribuinte (limite de ~300 documentos/ano).

- **Facturação electrónica** (transmissão à AGT) é uma obrigação **separada e faseada**
  (art. 37.º): grandes contribuintes e fornecedores do Estado já desde **1/1/2026** (com
  período transitório anunciado de 1/10 a 31/12/2025); os restantes contribuintes dos regimes
  Geral e Simplificado apontam para **~21/09/2026** pela leitura do art. 37.º + Decreto
  Executivo n.º 683/25, mas guias de fornecedores (Cegid) indicam **1/1/2027**. **Não
  consegui confirmar em texto legal acessível** qual das duas datas é a definitiva —
  a confirmar com contabilista/AGT antes de prometer nada.

- **Operações ≥ 25.000.000 Kz** têm de ser documentadas por factura electrónica **ou**
  emitidas no Portal do Contribuinte (art. 38.º).

- **Documento jurídico para venda paga no acto:** **Factura-Recibo (FR)**. "Venda a dinheiro
  (VD)" não aparece como tipo autónomo no novo regime; na API da AGT os tipos documentados
  incluem **FR** e **TV** (talão de venda). As farmácias que continuam a dizer "VD" precisam
  de migrar a linguagem.
  [Documentação da API da AGT](https://quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica/1/servicos/registar.html)

### 2.2 Coimas (art. 35.º) — são o argumento comercial

| Incumprimento                                                  | Coima                                            |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Factura não emitida                                            | **7% do valor** (15% se reiterado, >5 operações) |
| Emitida por software **não validado** / série não comunicada   | considerada **não emitida** → 7% / 15%           |
| Erros de preço/NIF/endereço/programa validado                  | 5% do valor da factura                           |
| Outros requisitos obrigatórios                                 | 1% do valor                                      |
| Emissão fora de prazo (regra geral: até ao 5.º dia útil)       | 0,2% do valor                                    |
| Falha de submissão SAF-T imputável ao **produtor do software** | 600.000 Kz por período                           |

Há **redução de 50% na primeira violação**. Uma factura de 1 M Kz errada custa 70.000 Kz.
É assim que se vende: uma farmácia que factura 20 M Kz/mês arrisca mais em multas do que
paga de software num ano.

### 2.3 O que é preciso para o nosso software ser aceite

Da documentação técnica da AGT (e do art. 22.º–23.º do DP 71/25):

1. Registar o **produtor/software** (nome exacto + versão) e obter o **número de
   validação/certificação** — é ele que vai impresso em cada documento.
2. **Par de chaves RSA** (≥2048 bits, PEM); a chave privada é do produtor, a pública vai à
   AGT; **assinatura JWS/RS256** do documento e da informação do software.
3. **Estabelecimentos cadastrados** e **séries de numeração** pedidas por estabelecimento/ano/
   tipo de documento (a AGT devolve o código da série autorizada).
4. API de registo de facturas: **POST em JSON**, processamento **assíncrono** (recebe-se um
   `requestID` e faz-se _polling_ do estado final; até 30 documentos por pedido). Receber
   `requestID` **não** é ter a factura aceite — o software tem de guardar o estado e tratar
   rejeições.
5. **SAF-T (AO)** e comunicação de inventários (até 15/02) e de contabilidade (até 10/04)
   continuam a existir **em paralelo** à API — não são a mesma coisa.
6. Documentação técnica auditável: funcionalidades, ciclos operativos, controlos, mecanismos
   de integridade, dicionário de dados, backups.

**Não consegui confirmar:** custo oficial e prazo de certificação, lista fechada de
documentos de candidatura, casos de teste, e o XSD actual do SAF-T. Antes de anunciar
"certificado pela AGT", tem de haver validação formal **para o nome e versão exactos** do
produto. Anunciar sem isso é risco de multa e de reputação.

### 2.4 Outras regras que limitam o desenho

- **Nunca apagar** documentos emitidos; numeração sequencial e cronológica (art. 3.º).
- **Integridade e rastreabilidade**: logs de acesso, detecção de alteração não autorizada,
  exportação controlada para a AGT (arts. 22.º–23.º).
- **Privacidade**: a compra de um medicamento ligada a uma pessoa é **dado sensível** ao
  abrigo da **Lei n.º 22/11** (tratamento automatizado de dados pessoais, notificação à APD,
  regras reforçadas para dados de saúde, transferência internacional se o alojamento for
  fora de Angola). O Localizador deve continuar a ingerir **apenas produto/quantidade**, nunca
  histórico de vendas nem prescrições.
  [Lei n.º 22/11](https://lex.ao/docs/assembleia-nacional/2011/lei-n-o-22-11-de-17-de-junho/)

**Implicação directa para a ideia 1:** ler stock é barato em risco; ler vendas de clientes
não é. Escrever em tabelas fiscais de um programa certificado (séries, hashes, facturas) é a
linha que nunca se deve cruzar — mesmo que tecnicamente se consiga.

---

## 3. Mercado: com quem se compete (e com quanto)

Pesquisa de 2026-10-12, por produto:

| Produto                                                   | Farmacêutico?                                       | AGT                                               | Integração                                            | Preço anunciado                 |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| **KuatelaSoft** (7US)                                     | Sim, explícito (lotes, validade, POS)               | Declara certificação                              | **API REST + SDK + webhooks**                         | 10.000 / 15.000 / 20.000 Kz/mês |
| **Naqsell Farmácias**                                     | Sim (lotes, validade, multi-farmácia)               | Declara conformidade                              | API só no Enterprise                                  | 15.000 / 25.000 Kz/mês          |
| **Kacennu**                                               | Genérico multi-negócio (sector farmacêutico citado) | Declara **FE/229/AGT/2026**                       | API "em disponibilização"; desktop **SQLite** offline | 5.500 Kz/mês +                  |
| **Vendus** (Cegid)                                        | POS retalho (lotes só no Pro)                       | **Validado n.º 142/AGT**                          | API/webservice, cloud                                 | ~6.333 Kz/mês                   |
| **Primavera / PHC** (Cegid)                               | ERP generalista                                     | Declara certificação                              | API por módulos (documentação pública)                | sem preço público               |
| **Sage X3 + SGSI Local Angola**                           | ERP médio/grande                                    | Declara certificação + SAF-T-AO                   | Web API REST/SOAP                                     | sem preço público               |
| **SAP Business One**                                      | ERP                                                 | Referência histórica 96/AGT/2019 (não confirmada) | Service Layer API                                     | sem preço público               |
| **Zua Developer**                                         | Sim (software de farmácia angolano)                 | Não confirmado                                    | Não encontrado                                        | orçamento                       |
| **Tecnofarma**                                            | Sim + **localizador/marketplace**                   | Não confirmado                                    | Não encontrado                                        | sem preço público               |
| **Tecnofarma / SIMAF / Appy Saúde / Mecofarma / Kubinga** | Localizador ou entrega por WhatsApp                 | n/a                                               | n/a                                                   | n/a                             |

O que isto diz:

- **O preço de referência é baixo: 5.000–25.000 Kz/mês** (≈5–25 €). Não há espaço para
  software "premium" por preço — há espaço por **volume** e por **canal**.
- **Já existe concorrência certificada a fazer POS + lotes + validade.** Se a ideia 2 for
  "mais um software de farmácia", entra-se a perder: eles têm certificação, preço e clientes.
- **O que ninguém demonstra ter é o stock a alimentar um localizador público.** É aqui que o
  activo da Conheça Farmácia (tráfego orgânico, marca, procura registada) se transforma em
  vantagem que o software de gestão puro não compra.
- **A ARMED/SIREMA existem** (registo de medicamentos, licenciamento) mas são registo
  regulatório — não são stock de farmácia nem API pública utilizável.
- **Não encontrei dados fiáveis de quota, satisfação ou queixas** dos produtos angolanos; os
  depoimentos são dos próprios fornecedores. Não se deve desenhar estratégia sobre eles.

---

## 4. As duas ideias, desenhadas

### 4.1 Ideia 1 — API que liga o sistema de gestão da farmácia ao Localizador

**Objectivo:** o stock aparece no Localizador sem trabalho manual. A farmácia não faz nada
depois de ligar.

**As vias de integração, por ordem de preferência** (não é uma lista de desejos: é a ordem em
que se deve tentar, porque cada uma abaixo aumenta o risco e o custo de manutenção):

| #   | Via                                                                                                                                         | Quando                                            | Esforço                                                                           | Risco                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | **API pública do fornecedor** (KuatelaSoft, Vendus, Primavera, Sage, SAP B1)                                                                | quando o fornecedor tem API e aceita o integrador | médio (um adaptador por produto, reutilizado em todas as farmácias desse produto) | baixo — contrato documentado                                                                    |
| 2   | **Exportação programada (CSV/Excel) + pasta vigiada/sFTP**                                                                                  | sistemas sem API mas com relatórios               | **baixo** — é o caminho para começar                                              | médio — ficheiros repetidos/parciais (resolver com checksum, nome determinístico, idempotência) |
| 3   | **Agente local (middleware na loja)** que lê a base de dados **só de leitura** (SQL Server, Firebird, MySQL, Postgres) e envia para a cloud | POS antigo, sem API nem exportação fiável         | alto (instalação, actualização, suporte remoto)                                   | médio-alto — esquemas mudam, fornecedor pode não gostar                                         |
| 4   | **CDC/triggers** na base do ERP                                                                                                             | último recurso                                    | muito alto                                                                        | alto — mexe no sistema certificado do cliente                                                   |

**Regras de desenho que não se negociam:**

- O agente **só inicia ligações de saída** (HTTPS). Nada de abrir portas na rede da farmácia.
- **Fila local persistente** (SQLite/ficheiro) para sobreviver a quedas de net e de energia;
  envio em lotes com **backoff exponencial + jitter**; `event_id` por evento para
  **idempotência** (repetição após timeout não duplica).
- **Credenciais por farmácia**, só-leitura, rotáveis, num cofre (nunca no browser, nunca em
  logs). Conta de serviço limitada a vistas/colunas de stock — sem clientes, sem prescrições,
  sem facturas.
- **Nunca escrever** no núcleo fiscal do software certificado (séries, hashes, documentos).
- **A reconciliação é obrigatória**: ao reconectar, primeiro a fila, depois um _snapshot_
  completo (a fila evita perdas, o snapshot corrige lacunas).

**Contrato de dados (mínimo, para não voltar a mexer):**

```
loja/farmácia · SKU de origem · nome apresentação · molécula (opcional)
quantidade (ou booleano tem/não tem) · preço (opcional) · validade (opcional)
lote (opcional) · origem/versão do dado · source_seq · lido_em
```

**Frescura e confiança** — a mudança mais importante no produto:

| Origem do stock        | Frescura mostrada ao cliente  | Selo                     |
| ---------------------- | ----------------------------- | ------------------------ |
| API/sincronizado       | "actualizado há 6 minutos"    | **Automático**           |
| Portal (manual)        | "confirmado hoje / há 2 dias" | Confirmado pela farmácia |
| Equipa CF (telefone)   | "confirmado há 3 dias"        | Verificado por telefone  |
| Sem confirmação > 72 h | não aparece                   | —                        |

Isto responde ao risco histórico do projecto ("farmácias não actualizam"): a API compra
frescura, e a frescura é vendável ao cliente final.

**Esforço, por ordem de implementação (mapeado a este repo):**

1. `stock_items.source` (`portal | api | team`), `synced_at`, `source_ref`; view
   `stock_confirmed` passa a expor a origem e a calcular frescura por fonte. _(1 migração)_
2. Tabela `pharmacy_api_keys` (hash da chave, farmácia, scopes, `last_used_at`, revogável) —
   nunca em claro. _(1 migração)_
3. Endpoint de ingestão (Route Handler/Edge Function) autenticado por chave, com
   **upsert idempotente**, validação por zod e limite de taxa; grava em `stock_items` com
   `source='api'`. _(1 ficheiro + testes)_
4. Importador **CSV** (o caminho que funciona hoje, sem depender de fornecedor): mapeamento
   de colunas no portal, pré-visualização, relatório de linhas rejeitadas. **É este que
   resolve 80% dos casos reais.**
5. Adaptadores por fornecedor, um a um, só quando há uma farmácia real a pedir.
6. `stock_movements` (append-only) para auditoria e para o relatório mensal da farmácia.

**Custo/benefício:** isto não muda a empresa — aumenta a densidade e a frescura do
Localizador, que é o activo. É o passo certo para os próximos 2–3 meses.

### 4.2 Ideia 2 — plataforma de gestão própria (com facturação)

Três versões possíveis, do mais barato ao mais caro. **Escolher bem aqui decide tudo.**

**Versão 2A — gestão sem facturação (recomendada na fase 1).**
Stock + validade + contagem + reservas + movimentos + relatórios + equipa/PIN, ligado ao
Localizador. É praticamente o que já existe (ver Parte 1) mais o que falta (movimentos,
lotes simples, reposição, PWA/mobile). **Não emite documentos fiscais** → zero exposição à
AGT. Para a farmácia, é "organizar o stock e aparecer no Localizador de graça".

**Versão 2B — gestão + facturação por parceria (recomendada a seguir).**
A farmácia emite no programa **já validado** (por exemplo KuatelaSoft, que tem API, ou
Vendus/Vendus-like); nós integramos-nos para ler o que foi vendido e baixar o stock, e
exportamos/importamos o que for preciso. Não temos número de certificação nem SAF-T próprio.
Modelo comercial: **integração com parceiro certificado** (angariamos a farmácia, o parceiro
factura, nós ganhamos no localizador + no serviço). Mais lento em receita directa, muito mais
rápido em risco.

**Versão 2C — software de facturação certificado nosso.**
POS de balcão, séries por estabelecimento, chaves RSA/JWS, registo de facturas na AGT com
_polling_, SAF-T, inventários, contabilidade, cópias de segurança, **funcionar offline e
sincronizar** (essencial em Angola: só ~43% de electrificação urbana, cortes frequentes e
tarifas de dados caras).

É um projecto **grande e regulado**, com consequências de outra natureza:

- um erro fiscal é uma multa **do cliente** (7–15% do valor da factura) e um problema de
  imagem nosso;
- exige suporte imediato (a farmácia não pode facturar = a farmácia não vende);
- exige parecer jurídico, e provavelmente um parceiro com experiência de certificação;
- obriga a manter, versionar e **re-certificar** ao ritmo da AGT (o diploma é de 2025; a fase
  alargada ainda está a chegar e vai mexer nos requisitos).

**Baliza realista:** 2A em semanas, 2B em 2–4 meses (depende do parceiro), 2C em 6–12 meses
com pelo menos uma pessoa dedicada só a conformidade. E, antes de 2C, confirmar com a AGT o
processo, o custo e a versão do SAF-T — **nada disso é público hoje**.

**O que acontece a quem ignora isto:** a fase alargada da facturação electrónica (~2026/2027)
vai obrigar a maior parte das farmácias formais a mexer no software. É uma janela de
substituição de sistemas que abre uma vez por década. Ou entramos nela com uma proposta
clara, ou o mercado é todo capturado por quem já está certificado.

---

## 5. Recomendação

**Fazer as duas, mas nunca ao mesmo tempo, e nunca escondendo o que são.**

1. **Agora (0–3 meses): Ideia 1, em modo "frescura".** Ingestão por CSV primeiro, API
   depois; origem e `synced_at` no stock; frescura por fonte visível ao cliente; adaptadores
   por fornecedor só quando há farmácia real a pedir. Métrica: % de stock com <24 h de
   idade.
2. **Em paralelo (0–6 meses): Ideia 2A, em modo "organizar".** Completar o que já existe:
   movimentos, lotes simples, reposição, contagem em bloco, PWA mobile. **Sem** emitir
   documentos fiscais. Preço baixo, escalão gratuito para quem alimenta o Localizador.
   Métrica: farmácias que fazem ≥1 contagem/semana.
3. **Quando houver 30–50 farmácias activas (6–12 meses): Ideia 2B.** Escolher um parceiro
   certificado com API, assinar integração, e passar a oferecer o pacote "stock + localizador
   - facturação conforme" — com o argumento das coimas. Métrica: conversão de farmácias sem
     software para o pacote.
4. **Só depois, com tracção e capital: 2C.** Aí sim, certificação própria — mas apenas se a
   procura do pacote justificar a equipa dedicada. Alternativa estratégica: **comprar ou
   licenciar** um software já validado em vez de o construir.

**Regra de ouro para o conflito de interesses:** o directório do Localizador mantém-se
**neutro e gratuito** — farmácias não clientes aparecem com contacto, apenas sem stock.
Publicar a regra. Sem isso, o activo mais valioso (a confiança do utilizador) passa a ser
percebido como publicidade disfarçada.

**Nota contrária (para não se tomar por certeza):** há um argumento honesto para **não**
fazer 2C nunca — é o argumento de `2026-09-23-gestao-farmaceutica-analise.md` (Parte 5):
"o que ganha é ser a camada que faz a farmácia vender mais e que não exige disciplina diária".
Vender software de missão crítica muda a natureza da empresa e a economia (suporte 1-para-1
não escala) para um mercado que paga 5.000–25.000 Kz/mês. Se a equipa é pequena, 2A+2B é o
limite sensato.

---

## 6. Como convencer as farmácias

### 6.1 Os sete argumentos, por ordem de força

1. **"Isto evita uma multa, não é uma despesa."** Multa = 7% do valor da factura (15%
   reiterado); software validado é obrigatório para quem está no IVA Geral/Simplificado.
   Comparação que fecha conversas: **uma multa de uma factura grande paga anos de software.**
2. **"Não vai perder produto"** (validade). Aviso a 90/60/30 dias + esconder expirados do
   Localizador. Ninguém quer ser a farmácia que encaminhou um cliente para um produto
   expirado.
3. **"Os clientes vêm ter consigo"** — o Localizador mostra-a a quem **já está a procurar**
   aquele medicamento naquela zona. Isto é diferente de "estar na internet".
4. **"Não tem trabalho nenhum"** (API/sincronização). É o argumento decisivo para quem já
   tem software: não há dupla entrada de dados.
5. **"Vê o que a sua zona procura e não encontra"** (procura não satisfeita). Nenhum ERP
   consegue dar isto: é informação de rede. Usar como **isco** de reunião, não como
   funcionalidade de catálogo.
6. **"Sabe quem fez o quê"** (turnos + PIN + movimentos). Para o dono com 4 funcionários no
   balcão, isto vale mais do que qualquer painel bonito.
7. **"Funciona no telemóvel, e sem internet não perde o que registou."** Crítico em Angola.

### 6.2 Segmentação (não são o mesmo cliente)

| Perfil                                                     | O que quer                                               | Oferta certa                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Farmácia formal com software** (ERP legal, contabilista) | nada de trabalho extra; conformidade                     | **Ideia 1** (API/CSV) + integração de facturação; o localizador é bónus                  |
| **Farmácia pequena sem software**                          | não perder dinheiro, não perder produto, não ser multada | **2A** (stock/validade/contagem) grátis ou barato; facturação depois, via parceiro       |
| **Grupos / redes (2–10 lojas)**                            | controlo central, comparação                             | preço por loja, painel de grupo, transferências entre lojas                              |
| **Armazenistas / distribuidores**                          | saber onde há ruptura, vender mais                       | **dados agregados** (procura não satisfeita, rupturas por zona) — o cliente que paga bem |

### 6.3 Objeções reais e respostas

- **"Já tenho sistema."** Óptimo — então não lhe vendemos sistema, ligamos o seu (CSV hoje,
  API quando o fornecedor tiver). Mostrar o stock a aparecer no Localizador em 10 minutos é a
  demonstração inteira.
- **"Não tenho tempo para pôr produtos."** Importação por CSV + nós fazemos a primeira
  ligação ao catálogo de moléculas; e o essencial (10–20 moléculas críticas) resolve a
  primeira semana.
- **"Os meus dados são meus."** Termos escritos: leitura só de produto/quantidade, sem dados
  de clientes nem prescrições; exportação a qualquer momento; acesso revogável. Cumprir a
  Lei 22/11 (notificação à APD, minimização) é argumento, não só obrigação.
- **"Não quero que os clientes comparem preços."** Preço é **opcional** por item — e é o
  próprio localizador que gera a visita; mostrar preço aumenta conversão, mas a escolha é da
  farmácia.
- **"E se o sistema ficar offline?"** Modo offline + fila: o que registar não se perde.
- **"Quanto é que isto me dá em dinheiro?"** Aqui há que ser honesto: se não houver medição,
  isto é conversa. Medir desde a primeira farmácia: visitas geradas, reservas recebidas,
  reservas concluídas, valor estimado. O relatório mensal é o argumento de renovação.
- **"Porque é que eu hei-de confiar em vocês?"** Conheça Farmácia é marca de saúde com
  tráfego, e não vende medicamentos — não é concorrente. Dizer isto explicitamente.

### 6.4 Canais (por onde se chega lá de facto)

1. **Armazenistas e distribuidores** — já visitam todas as farmácias e têm relação
   financeira. Um distribuidor que ofereça "o seu stock no Localizador" é um canal
   multiplicador; e o distribuidor fica com o relatório de procura. **(o canal mais
   subestimado)**
2. **Contabilistas** — são quem vai dizer à farmácia que tem de mudar o software por causa
   da AGT. Uma rede de 10 contabilistas vale mais do que 100 chamadas frias.
3. **ARMED/associações e eventos do sector** (e a lista de farmácias licenciadas como base de
   recrutamento).
4. **WhatsApp** — o canal onde a farmácia realmente responde; onboarding em 20 minutos por
   chamada, com ecrã partilhado.
5. **A própria procura**: mostrar a farmácias de uma zona o relatório "34 pessoas procuraram
   X em Viana e não encontraram" — é porta que se abre sozinha.

### 6.5 Piloto (8 semanas, 10 farmácias) com critérios de decisão

| Métrica                                         | Alvo   | Go/no-go                        |
| ----------------------------------------------- | ------ | ------------------------------- |
| Farmácias com ≥1 actualização/semana            | ≥ 7/10 | < 4 = repensar                  |
| Stock com < 24 h de idade (média)               | ≥ 60%  | < 30% = integração não chegou   |
| Farmácias que aceitam ligar o sistema (CSV/API) | ≥ 5/10 | < 2 = hipótese errada           |
| Reservas confirmadas em < 4 h                   | ≥ 60%  | < 40% = problema de confiança   |
| Farmácias dispostas a pagar (2A)                | ≥ 4/10 | < 2 = preço/valor mal calibrado |
| Disposição para pagar pela conformidade (2B)    | ≥ 3/10 | < 2 = adiar facturação          |

O piloto serve para responder a **uma** pergunta: a farmácia paga por software quando o
Localizador já lhe dá visibilidade? Se a resposta for não, o negócio é dados para a cadeia,
não SaaS para a farmácia — e é melhor saber isso em 8 semanas do que em 18 meses.

---

## 7. Riscos, honestamente

| Risco                                                        | Gravidade          | Mitigação                                                                                                       |
| ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Prometer facturação conforme e falhar (validação AGT)        | **muito alta**     | não anunciar "certificado" antes de validação formal; 2A/2B primeiro; parecer jurídico                          |
| Coima do cliente por erro nosso (7–15%)                      | alta               | via parceiro certificado; testes com valores reais; seguros/contrato com limitação de responsabilidade          |
| Responsabilidade sobre dados de saúde (Lei 22/11)            | alta               | ingerir só produto/quantidade; notificação APD; minimização; alojamento e transferência internacional revistos  |
| Suporte humano 1-para-1 não escala (o pior risco económico)  | alta               | self-service, CSV, onboarding em 20 min, base de conhecimento, horário de suporte definido desde o início       |
| Ler/escrever na base de um software certificado do cliente   | alta               | só leitura, só API/vista oficial, autorização escrita da farmácia e do fornecedor; nunca tocar no núcleo fiscal |
| Percepção de que o Localizador favorece clientes pagantes    | alta (estratégica) | diretório neutro e gratuito, regra publicada, escalão gratuito                                                  |
| Concorrência local já certificada (preço 5–25 Kz mil/mês)    | média              | não competir em preço; competir em rede + localizador + frescura de dados                                       |
| Dados errados de terceiros (stock velho vendido como fresco) | média              | frescura por fonte visível; margem de segurança na quantidade; "confirme por telefone"                          |
| Dependência de um fornecedor de ERP (muda API/preços)        | média              | adaptadores isolados atrás de um contrato interno único; preferir duas vias por fornecedor                      |
| Internet/energia instáveis                                   | média              | agente com fila local; PWA; baixo consumo de dados; modo offline no POS (se 2C)                                 |
| Fase alargada da e-facturação adiada (2026 → 2027)           | baixa              | vender por ondas usando as duas datas como intervalo, não como certeza                                          |

---

## 8. O que confirmar com a AGT / contabilista antes de prometer

1. Data efectiva da fase alargada para os regimes Geral e Simplificado (**~21/09/2026** pelo
   art. 37.º vs **1/1/2027** segundo fornecedores).
2. Processo, documentação, custo e prazo de **validação do software do produtor**; ambiente de
   testes; requisitos de versão.
3. **Custo/limite** do Portal do Contribuinte para pequenos contribuintes e condições da
   autorização prévia para quem está no regime Geral/Simplificado.
4. **XSD/versão actual do SAF-T (AO)** e periodicidade exigida após adesão à facturação
   electrónica.
5. Requisitos gráficos do **QR/código digital** e se o número de certificação tem de constar
   em todos os tipos de documento.
6. Enquadramento da farmácia típica: regime de IVA, tratamento por artigo (medicamentos
   isentos? taxas?), IEC quando aplicável.
7. Se um software validado pode ser **lido por terceiros** por API (e se o produtor mantém a
   validação) — para a ideia 1/2B.
8. Obrigação de contabilista certificado (notícia de 2025, não confirmada em fonte oficial).

---

## 9. Próximos passos concretos (a começar pelo código)

1. **Migração `0020_stock_api_source.sql`:** `stock_items.source` (`'portal' | 'api' | 'team'`),
   `synced_at`, `source_ref`; recriar `stock_confirmed` com origem e frescura por fonte.
2. **Migração `0021_pharmacy_api_keys.sql`:** chaves hasheadas por farmácia, scopes
   (`stock:read`, `stock:write`), `last_used_at`, revogação, RLS (só `is_own_pharmacy` +
   admin) — escrita apenas via service role.
3. **`app/api/ingest/stock/route.js`** (ou Edge Function): autenticação por chave, zod,
   upsert idempotente, rate-limit, log de auditoria sem PII. Testar com uma farmácia real,
   não com um mock.
4. **Importador CSV no portal** (`/portal/entrada` ou novo `/portal/integracao`):
   mapeamento de colunas, pré-visualização, relatório de erros, primeira importação assistida.
5. **`stock_movements`** (append-only) + primeiro "relatório de valor": o que a farmácia
   ganhou por estar no Localizador (visitas, reservas, concluídas).
6. **Relatório de "procura não satisfeita" por município** — o isco comercial, e o único
   activo que nenhum ERP consegue copiar.

---

## 10. Fontes

**Lei e AGT**

- [DP n.º 71/25 — texto integral (AngoLEX)](https://angolex.com/paginas/decreto-presidencial/regime-juridico-das-facturas-71a-25a.html) ·
  [PDF (MINFIN)](https://www.ucm.minfin.gov.ao/cs/groups/public/documents/document/aw40/otu2/~edisp/minfin4956210.pdf)
- [EY — Novo Regime Jurídico das Facturas](https://www.ey.com/pt_ao/technical/tax-alerts/novo-regime-juridico-das-facturas) ·
  [EY — Decreto Executivo n.º 683/25](https://www.ey.com/pt_ao/technical/tax-alerts/estrutura-de-dados-do-software-e-do-modelo-de-faturacao-electronica) ·
  [EY — e-facturação desde 1/1/2026](https://www.ey.com/pt_ao/technical/tax-alerts/facturacao-electronica-a-partir-de-1-de-janeiro-de-2026)
- [KPMG — adiamento anunciado pela AGT](https://kpmg.com/ao/pt/insights/tax-news/prazo-implementacao-faturacao-electronica.html)
- [Cegid — calendário, penalidades e FAQ operacionais](https://www.cegid.com/ao/o-que-e-a-facturacao-electronica/)
- API da AGT: [introdução](https://quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica/1/index.html) ·
  [chaves e certificados](https://quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica/1/gestao.html) ·
  [registar factura](https://quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica/1/servicos/registar.html) ·
  [séries](https://quiosqueagt.minfin.gov.ao/doc-agt/faturacao-electronica/1/servicos/solicitar.html)
- [Lei n.º 22/11 — protecção de dados pessoais](https://lex.ao/docs/assembleia-nacional/2011/lei-n-o-22-11-de-17-de-junho/)
- [Portal AGT — IVA](https://agt.minfin.gov.ao/PortalAGT/#!/iva/imposto-sobre-o-valor-acrescentado/o-iva) ·
  [Imposto Industrial](https://portaldocontribuinte.minfin.gov.ao/impostos-e-taxas/imposto-industrial) ·
  [IEC](https://portaldocontribuinte.minfin.gov.ao/impostos-e-taxas/imposto-especial-consumos)

**Mercado e concorrência**

- [KuatelaSoft Farmácias](https://www.kuatelasoft.co.ao/farmacias/) ·
  [Naqsell Farmácias](https://www.farma.naqsell.co.ao/) · [Naqsell](https://www.naqsell.co.ao/) ·
  [Kacennu](https://kacennu.ao/) · [Vendus Angola](https://www.vendus.co.ao/) ·
  [Cegid PHC Angola](https://www.cegid.com/ao/produtos/cegid-phc-software-gestao/) ·
  [SGSI (Sage X3 Local Angola)](https://sgsi.co.ao/) ·
  [Zua Developer](https://www.zuadeveloper.co/software-de-software-gestao-de-farmacia?lang=en) ·
  [Tecnofarma](https://www.tecnofarma.ao/) · [Appy Saúde](https://www.appysaude.co.ao/) ·
  [SIMAF](https://www.simaf.digital/)
- [MINSA — licenciamento de farmácias (~2.000 licenciadas)](https://minsa.gov.ao/web/noticias/minsa-licenciamento-de-farm%C3%A1cias-gera-debate-metodol%C3%B3gico) ·
  [Expansão — farmácias ilegais em Luanda](https://expansao.co.ao/angola/detalhe/agencia-reguladora-quer-fechar-mais-de-duas-mil-farmacias-ilegais-em-luanda-61489.html)
- [Chimbuco et al., Community Pharmacy Services in Malanje (35% com software)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8938818/) ·
  [MINSA — SIREMA](https://minsa.gov.ao/web/noticias/minsa-armed-lan%C3%A7a-sistema-de-registo-de-medicamentos-em-angola) ·
  [ARMED](https://www.armed.gov.ao/) · [MINSA — CECOMA](https://minsa.gov.ao/web/noticias/minsa-cecoma-refor%C3%A7a-abastecimento-de-medicamentos-em-todo-o-pa%C3%ADs)
- [DataReportal — Digital 2024: Angola](https://datareportal.com/reports/digital-2024-angola) ·
  [U.S. Trade.gov — Healthcare](https://www.trade.gov/country-commercial-guides/angola-healthcare) ·
  [U.S. Trade.gov — Energy (electrificação)](https://www.trade.gov/country-commercial-guides/angola-energy) ·
  [Banco Mundial — PADA](https://www.worldbank.org/en/news/factsheet/2024/06/27/inclusive-digitalization-in-eastern-and-southern-africa-program-afe-angola) ·
  [INAPEM — Envolver](http://envolver.inapem.gov.ao/pt/projecto)
- Pagamentos: [MULTICAIXA — gateway online](https://multicaixa.ao/pt/oferta/canais/comerciantes/gateway-de-pagamentos-online/) ·
  [CIAM — movimentos 2024](https://www.ciam.gov.ao/ao/noticia/3792) ·
  [Economia & Mercado — Multicaixa Express](https://economiaemercado.com/artigo/multicaixa-express-como-instrumento-de-inclusao-financeira)

**Integração e arquitectura**

- [Google Merchant API — inventários locais](https://developers.google.com/merchant/api/guides/inventories/overview) ·
  [Local Inventory app (POS compatíveis)](https://support.google.com/business/answer/13738641?hl=en) ·
  [BestRx Local Inventory](https://www.bestrx.com/local-inventory-on-google)
- [Glovo Local Shops — API e SFTP/CSV](https://qcommerce.developer.glovoapp.com/en/documentation/introduction) ·
  [Delivery Hero — POS](https://developers.deliveryhero.com/documentation/pos.html) ·
  [Deliveroo Partner Platform](https://api-docs.deliveroo.com/docs/introduction) ·
  [Uber Eats Marketplace API](https://developer.uber.com/docs/eats/introduction)
- [SQL Server CDC](https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-data-capture-sql-server?view=sql-server-ver17) ·
  [Debezium MySQL](https://debezium.io/documentation/reference/stable/connectors/mysql.html) ·
  [Supabase Realtime — Postgres Changes vs Broadcast](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) ·
  [Supabase — chaves](https://supabase.com/docs/guides/getting-started/api-keys)
- [OWASP — Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) ·
  [AWS — retries idempotentes](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) ·
  [AWS — backoff exponencial e jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

---

_Documento informativo, não é parecer jurídico nem fiscal. Os pontos da Parte 8 têm de ser
confirmados pela AGT e por um contabilista angolano antes de qualquer promessa comercial._
