# Gestão Farmacêutica — como funcionam esses apps e o que trazer para aqui

> **Data:** 2026-09-23
> **Pergunta:** como funcionam os aplicativos de gestão farmacêutica e o que podemos trazer
> para o portal, sobretudo na parte de **gestão e organização**?
> **Contexto:** este produto **não é um ERP de farmácia nem um POS**. É uma camada de
> **visibilidade + encaminhamento** para Luanda. Essa diferença decide tudo o que vem
> abaixo.

---

## Parte 1 — Como funcionam, na prática

Depois de olhar para o mercado (sistemas genéricos tipo Odoo/Vendra, verticais de
inventário e o que se faz em África — mPharma, Kasha), o padrão é sempre o mesmo: um
**núcleo transaccional** com módulos pendurados à volta.

### O mapa de módulos típico

| Módulo                           | O que faz                                                                                                              | É núcleo?                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **POS / facturação**             | Venda ao balcão, recibo, troco, integração com terminal de pagamento                                                   | Sim no ERP, **irrelevante para nós**           |
| **Inventário em tempo real**     | Saldo por produto, actualizado a cada movimento                                                                        | Sim — e nós já temos a versão simples          |
| **Lotes + validade (FEFO)**      | Cada entrada é um lote com nº de lote e validade; vende-se primeiro o que expira primeiro (_First Expired, First Out_) | Sim, é o coração de um inventário farmacêutico |
| **Alertas de validade**          | Avisos a 90/60/30 dias; quarentena de expirados                                                                        | Sim                                            |
| **Ponto de reposição (min/max)** | Limite por produto; abaixo do mínimo gera sugestão de encomenda                                                        | Sim                                            |
| **Encomendas a fornecedores**    | Lista de compras, comparação de preços, estado da encomenda                                                            | Sim no ERP                                     |
| **Receitas**                     | Registo da prescrição, dispensação, medicamentos sujeitos a receita                                                    | Sim                                            |
| **Substâncias controladas**      | Registo legal de entradas/saídas com assinatura                                                                        | Sim (obrigação regulatória)                    |
| **Multi-localização**            | Várias filiais, transferências entre elas                                                                              | Depende do porte                               |
| **Utilizadores e turnos**        | Quem fez o quê, quando; permissões por papel                                                                           | Sim                                            |
| **Auditoria / movimentos**       | Livro de entradas e saídas, imutável                                                                                   | Sim                                            |
| **Relatórios**                   | Rotação, margem, rupturas, curva ABC                                                                                   | Sim                                            |
| **EHR / interacções**            | Ligação a registo clínico, avisos de interacção                                                                        | Periferia                                      |
| **Compliance**                   | GMP, serialização, rastreabilidade de recalls                                                                          | Periferia para retalho pequeno                 |

### As três coisas que fazem um app destes ser bom (e não a lista de módulos)

1. **FEFO é a regra que organiza tudo.** Um inventário farmacêutico não é "tenho 20
   unidades" — é "tenho 20 unidades repartidas por 3 lotes, o mais antigo expira em
   Novembro". Quem só tem o número total está a gerir dinheiro que já vai perder.
2. **O software organiza por _excepções_, não por listas.** Um bom painel não mostra 200
   produtos; mostra os 7 que precisam de decisão hoje (vai expirar, acabou e vende-se
   muito, reserva à espera há 2 h).
3. **O ciclo de contagem é explícito.** Não se "mantém o stock actualizado" — faz-se
   contagens periódicas (_cycle counts_) e reconcilia-se. Isto é o oposto de esperar que
   alguém se lembre de marcar 200 toggles.

### O que os operadores africanos fizeram diferente (e é o nosso caso)

O mPharma não vendeu software de inventário — montou **inventário gerido pelo
fornecedor** (consignação), **transferências de stock entre farmácias** para salvar
produtos a expirar, e **dados agregados da rede** para prever procura. A lição: numa rede
de farmácias pequenas, o valor não está em cada farmácia gerir melhor o seu stock — está
em **agregar** o que a rede sabe e ninguém vê sozinha.

---

## Parte 2 — Onde estamos, honestamente

O que já existe (migrações 0001–0005):

| Peça                                                                                 | Estado                             |
| ------------------------------------------------------------------------------------ | ---------------------------------- |
| `drugs` (nome, molécula, forma, dose, `requires_rx`, prioridade)                     | ✅ catálogo partilhado             |
| `stock_items` (temos/não temos, quantidade, preço, `confirmed_at`, `available_from`) | ✅ um registo por farmácia+produto |
| View `stock_confirmed` com **regra das 72 h**                                        | ✅ higiene de frescura             |
| `reservations` com máquina de estados (pendente→confirmada→pronta→concluída)         | ✅                                 |
| Portal com stock, fila de reservas, perfil, sino realtime                            | ✅                                 |
| Realtime (`stock_items`, `reservations`)                                             | ✅                                 |

**As lacunas que a pesquisa expõe:**

1. **Não há lotes nem validade.** O modelo é um total binário. Uma farmácia pode ter
   produto expirado marcado como "Temos" e o Localizador encaminha o cliente para lá.
2. **Nada baixa o stock.** Concluir uma reserva não mexe em `quantity`. O stock que a
   farmácia digitou fica a mentir a partir da primeira venda.
3. **A frescura é passiva.** A regra das 72 h esconde o produto, mas não pede nada a
   ninguém. Não há contagem, nem reconfirmação em bloco.
4. **Não há reposição.** Zero sinal de "isto acabou e era procurado".
5. **Não há auditoria.** `updated_by` guarda quem tocou por último, mas não há histórico —
   com vários funcionários a partilhar a conta, não se sabe quem mudou o quê.
6. **A organização é por lista, não por excepção.** O painel mostra o catálogo inteiro.

---

## Parte 3 — O que trazer (ordenado por valor ÷ esforço)

### 🟢 Nível 1 — Pequeno esforço, muda o jogo

#### 1.1 Validade mínima por produto (`expires_at`)

Em vez de lotes completos, **um campo opcional** de validade por `stock_items`. A view
`stock_confirmed` passa a:

- **esconder** o produto se `expires_at < now()` (nunca encaminhar para stock expirado);
- **avisar** no portal a 90/60/30 dias, com contagem decrescente;
- **mostrar** ao cliente "validade: mar/2027" — sinal de confiança que nenhum concorrente
  dá.

Custo: uma coluna, uma condição na view, um bloco no StockPanel. Retorno: o maior risco
do negócio (encaminhar para produto expirado) fica fechado, e a farmácia ganha o único
controlo de validade que a folha de papel faz mal.

#### 1.2 Concluir reserva **baixa** o stock

Ao passar para `concluida`, decrementar `quantity` (e marcar `in_stock = false` a zero).
É o que liga o fluxo do cliente à gestão real: a partir daí o stock do Localizador
**converge** com a realidade em vez de derivar. Uma Server Action, uma regra.

#### 1.3 "Reconfirmar inventário" (contagem em bloco)

Botão no portal: _"Está tudo igual ao que reportei há X dias"_ → actualiza
`confirmed_at` de todos os itens activos de uma vez. Opcionalmente um fluxo de contagem:
percorrer a lista e só corrigir o que mudou.

Isto substitui a pressão dos 200 toggles por um **cycle count**. É a diferença entre um
sistema que se mantém e um que morre de fadiga.

#### 1.4 Página **"Precisa de atenção"** (fila de excepções)

Em vez do resumo passivo, uma fila única que agrega o que exige decisão:

- stock expira em < 90 dias
- stock confirmado há > 5 dias (frescura a cair)
- reservas pendentes há > 2 h
- medicamentos que a farmácia reportou mas **nunca confirmou**
- fármacos criados por ela à espera de validação da equipa CF

Tudo isto **já existe** nos dados. É a mudança de organização com melhor retorno de todo
o documento: o portal passa a dizer à farmácia o que fazer hoje.

#### 1.5 Ponto de reposição (`min_quantity`) e lista "A repor"

Campo mínimo por produto (ou um valor global por omissão). O portal gera a lista dos que
estão abaixo — a "lista de compras" que qualquer app de gestão dá. Para nós o valor é
duplo: organiza a farmácia **e** enche o Localizador de stock confirmado.

---

### 🟡 Nível 2 — Médio esforço, cria vantagem

#### 2.1 **Procura não satisfeita** — o relatório que ninguém mais pode dar

Cruzar três sinais que já temos:

- pesquisas no Localizador em que **nenhuma farmácia** tinha o produto
- reservas **recusadas** pela farmácia
- reservas **expiradas** sem resposta

Resultado: _"Nas últimas 2 semanas, 34 pessoas procuraram Insulina NPH em Viana e não
encontraram. Viana tem 6 farmácias. Quer ser a primeira a ter?"_

Nenhum ERP de farmácia oferece isto — é informação **de rede**, e é o argumento de venda
mais forte que o produto pode ter. Vale tanto para onboardar farmácias como para lhes
vender melhor (o mPharma vive disto).

#### 2.2 **Transferências entre farmácias**

Farmácia A está a expirar com 40 unidades; farmácia B acabou de esgotar e tem procura.
Sugerir transferência. É literalmente o que o mPharma faz para evitar perdas.

Versão mínima: a equipa CF vê o cruzamento e faz a ponte por WhatsApp. Versão completa:
pedido de transferência in-app, com registo.

#### 2.3 **Histórico de movimentos** (`stock_movements`)

Livro append-only: quem, quando, o quê, de que valor para que valor. Fonte para
auditoria, para o histórico do produto, e para o relatório mensal da farmácia.

#### 2.4 **Vários utilizadores por farmácia + papéis**

O schema **já permite** vários `admin_users` apontados à mesma `pharmacy_id`. Falta UI de
gestão de equipa (convidar, desactivar) e papéis simples (`responsavel` vs `operador`),
com o histórico de 2.3 a dar sentido ao resto.

#### 2.5 **Estatísticas da farmácia**

Visualizações da página, reservas recebidas/concluídas, taxa de conversão, top produtos
procurados nela. Retenção: a farmácia fica porque **vê resultado**.

#### 2.6 **PWA / telemóvel primeiro**

Os funcionários usam telemóvel no balcão, não um portátil. O portal é hoje desktop-first.
PWA instalável + tolerância a rede fraca (o realtime já degrada bem) é grande parte do
ganho de adopção.

---

### 🔵 Nível 3 — Grande, para depois da rede existir

- **Lotes completos (`stock_batches`)** com nº de lote e FEFO real, quando houver
  volume ou exigência regulatória
- **Registo de substâncias controladas** (obrigação legal, com assinatura)
- **Multi-filial / grupos** com painel de grupo e transferências
- **Encomendas agregadas** — juntar a procura de várias farmácias numa encomenda e
  negociar preço. É o modelo mPharma; faz sentido quando a rede tiver força
- **Códigos de barras / leitura por QR** para contagens rápidas
- **Conversão reserva → venda** com histórico comercial

---

## Parte 4 — As minhas apostas (se fosse só escolher três)

1. **Validade mínima (1.1) + não baixar stock de expirado.** Protege o cliente,
   protege a farmácia e resolve a maior falha de confiança deste tipo de produto. Cabe
   numa tarde.
2. **Concluir reserva baixa o stock (1.2) + contagem em bloco (1.3).** Sem isto, o stock
   do Localizador degrada-se sozinho e o produto morre de dados velhos — exactamente o
   problema que ele existe para resolver.
3. **Procura não satisfeita (2.1).** É a única funcionalidade que **só existe porque a
   rede existe**, e transforma dados mortos em argumento comercial.

A fila de excepções (1.4) viria logo a seguir — não muda o negócio, mas muda a
experiência de quem lá entra todos os dias.

---

## Parte 5 — O que **não** trazer (deliberadamente)

| Não trazer                         | Porquê                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| POS / facturação                   | Não é o nosso negócio; duplica o que a farmácia já tem e cria obrigações fiscais                |
| Contabilidade / margens / IVA      | Idem                                                                                            |
| Prescrição electrónica             | Regulado, pesado, e não temos médicos na equação                                                |
| Interacções medicamentosas         | Precisa de base farmacológica clínica e responsabilidade clínica                                |
| Stock completo em tempo real (ERP) | Exige disciplina de dados que mata a adoção; a regra das 72 h + contagem é melhor para o piloto |
| Serialização / GMP                 | Escala industrial, irrelevante para retalho                                                     |

O erro clássico aqui é tentar ser "o sistema da farmácia". O que ganha é ser **a camada
que faz a farmácia vender mais** e que **não exige disciplina diária** para continuar a
funcionar.

---

## Parte 6 — Sequência sugerida

| Ordem | Item                                             | Impacto            | Esforço     |
| ----- | ------------------------------------------------ | ------------------ | ----------- |
| 1     | Concluir reserva baixa o stock                   | Alto               | Baixo       |
| 2     | Validade (`expires_at`) + view esconde expirados | Alto               | Baixo       |
| 3     | Fila "Precisa de atenção"                        | Alto               | Baixo-Médio |
| 4     | Reconfirmar inventário em bloco                  | Alto               | Baixo       |
| 5     | Ponto de reposição + lista "A repor"             | Médio              | Baixo       |
| 6     | Procura não satisfeita                           | Alto (estratégico) | Médio       |
| 7     | Histórico de movimentos + vários utilizadores    | Médio              | Médio       |
| 8     | Estatísticas da farmácia                         | Médio              | Médio       |
| 9     | PWA / telemóvel                                  | Alto (adoção)      | Médio       |
| 10    | Transferências entre farmácias                   | Médio              | Médio-Alto  |

Os quatro primeiros são a diferença entre "um formulário que a farmácia preenche" e "a
ferramenta com que a farmácia organiza o dia".

---

## Referências consultadas (2026-09-23)

- _Pharmacy Inventory Management: Streamline Operations_ — ASC Software (inventário em tempo real, reaprovisionamento automático, lotes, validade, multi-localização)
- _Top 7 Features for Pharmacy Inventory Systems_ — OSP Labs (e-prescrição, alertas SMS, multi-loja, gestão de utilizadores, validade)
- _Best Pharmacy Management Software 2026_ — EloERP (módulos: receitas, inventário, validade, facturação, compliance, POS)
- _FEFO: First Expired, First Out_ — mrpeasy / ASC Software (a lógica que organiza o inventário farmacêutico)
- _Using technology to improve access to medicines in Ghana_ — Transform Health (mPharma: risco de expiração, prevenção de ruturas, **transferência de stock** entre farmácias)
- _mPharma — data-driven insights platform_ (painel de indicadores para farmacêuticos)
- _African Pharmacy Distribution and Retail 2026_ (inventário gerido pelo fornecedor, consignação, dados agregados)
