# Guia do gestor da farmácia — Portal Conheça Farmácia

> Este guia é para **quem gere a farmácia** no Portal: configurar o catálogo
> e as formas de venda, acompanhar as vendas e manter o perfil público que
> os clientes veem no Localizador. Para o dia-a-dia do balcão (reservas,
> entradas, reposições), vê o **Guia rápido do atendente**
> (`localizador/guia-atendente-portal.md`).
>
> Dúvidas? suporte@conhecafarmacia.com — ajudamos na hora.

---

## 1. O papel do gestor vs. o papel do atendente

| O atendente (guia próprio)…     | O gestor (este guia)…                        |
| ------------------------------- | -------------------------------------------- |
| Confirma e recusa reservas      | Decide **o que vender e a que preço**        |
| Registra entradas de fornecedor | Cria **fármacos que faltam ao catálogo**     |
| Repõe stock e corrige validades | Define as **formas de venda** (lâmina/caixa) |
| Usa o portal todos os dias      | Configura e acompanha **por semana**         |

As duas funções podem ser da mesma pessoa — o portal não as separa em
contas diferentes. A divisão acima é só sobre **quando** se usa cada parte.

---

## 2. Criar produtos que faltam no catálogo (e validá-los)

Se um produto que a tua farmácia vende **não existe no catálogo**, podes
criá-lo directamente do portal:

1. Vai a **Stock**.
2. Toca em **+ Adicionar medicamento** (no cabeçalho da página).
3. Preenche:
   - **Nome** — como aparece na caixa (ex.: «Aspirina 500 mg»);
   - **Categoria** — **Medicamento** ou parafarmácia (**Bebé**, **Higiene**,
     **Beleza**, **Outros**). Muda os campos pedidos e a frescura;
   - **Forma** — comprimido, cápsula, xarope, injetável… (só medicamento);
   - **Dosagem** — ex.: 500 mg (só medicamento);
   - **Receita médica** — liga se a venda exige receita (só medicamento);
   - **Aceita reservas** — nos produtos de parafarmácia: desliga se só
     vendes ao balcão (o cliente vê «Só no balcão» e não reserva);
   - **Prioridade** — marca os **medicamentos críticos** (insulinas,
     anti-epilépticos, etc.): no Localizador aparecem em destaque no painel
     de críticos da página da farmácia.
4. Guarda.

> **Frescura por categoria:** um medicamento sem confirmação cai do
> Localizador ao fim de **72 h**; os restantes aguentam **30 dias**. A
> venda concluída renova a frescura — só o produto parado cai do ar.

**O que acontece depois:** o fármaco entra com a marca **«Aguarda
validação»** — não aparece no Localizador de imediato e só a tua farmácia
o vê.

**A validação é tua (o gerente):**

1. Abre **Stock** e toca no filtro **Aguarda validação**.
2. Na linha do medicamento pendente, toca no menu **⋯**.
3. **Validar e publicar** — o medicamento passa a visível aos clientes e
   comporta-se como qualquer outro: aparece em Stock, aceita entrada de
   stock e reservas. **Recusar fármaco** — remove o pedido (só é possível
   enquanto não tiver stock nem reservas).

Enquanto está pendente, já se pode marcar stock dele — ao publicar, o
produto aparece logo no Localizador com o stock registado. A validação do
gerente evita duplicados e erros de dosagem num catálogo partilhado por
todas as farmácias.

**Boas práticas:**

- Pesquisa **antes** de criar — o nome pode estar lá com outra grafia
  («Hidroclorotiazida» vs. «Hidroclorotiazida 25 mg»).
- Cria a **apresentação**, não a molécula solta: «Amoxicilina 500 mg cáps. »
  é útil; «Amoxicilina» genérico, não.
- Medicamento de uso contínuo (doentes crónicos)? Marca **prioridade**.

---

## 2.a. Retirar um medicamento do catálogo (Lixeira)

Se a farmácia **deixou de vender** uma apresentação — descontinuada, lote
perdido, erro de registo —, retire-a em vez de a deixar eterna como «não
disponível»:

1. Vai a **Stock** → toca no **nome** do medicamento.
2. No fundo do modal, toca em **Retirar do catálogo** (vermelho) e confirma.
3. O medicamento desaparece do Localizador e de todas as listas — e deixa
   de gerar avisos de reposição ou validade.

**A Lixeira** fica no chip «Lixeira» da barra de filtros do Stock. Lá os
itens aparecem esbatidos, com o nome riscado e o botão **Restaurar** — que
os devolve à lista como «não disponível», prontos a religar com dados.

**Não disponível ≠ retirado:** «não disponível» é «não tenho agora, volto a
ter»; retirado é «não vendo mais». Usa a retirada para o segundo caso — é
o que mantém a lista de stock limpa para o dia-a-dia da equipa.

---

## 3. Formas de venda — lâmina ou caixa?

**Esta é a configuração que mais influencia a venda.** Em Angola vende-se de
tudo: a lâmina, a caixa inteira, às vezes o comprimido solto. O cliente tem
de saber **o que o preço significa**.

### Onde configurar

Vai a **Stock** → toca no **nome** do medicamento → sectores do modal
(no padrão do menu lateral: **Medicamento**, **Stock**, **Preços e formas
de venda**, **Apresentação**). A configuração vive no sector **Preços e
formas de venda** — aí preenches também a **estrutura da caixa** (lâminas
por caixa e comprimidos por lâmina), que a Entrada de stock usa para
converter e calcular o total de comprimidos.

### Como funciona o modelo

Cada medicamento pode ter **várias formas de venda**, cada uma com:

- **Unidade** — comprimido, lâmina, caixa, frasco, ampola, unidade;
- **Contém** — quantas unidades-base a forma tem (ex.: caixa «contém 3»
  lâminas);
- **Preço** — o preço DESSA forma (ex.: lâmina 100 Kz, caixa 300 Kz);
- **Padrão** — a unidade-base do saldo (uma só pode ser padrão);
- **Oferece** — liga/desliga sem apagar (a caixa esgotou? desliga a caixa,
  continua a vender a lâmina).

### Exemplo concreto (o caso clássico)

| Forma             | Contém | Preço  | O que o cliente vê                           |
| ----------------- | ------ | ------ | -------------------------------------------- |
| Lâmina _(padrão)_ | 1      | 100 Kz | `Lâmina · 100 Kz`                            |
| Caixa             | 3      | 300 Kz | `Caixa (3 lâminas) · 300 Kz ≈ 100 Kz/lâmina` |

O **saldo do stock é contado na unidade padrão** (a lâmina, no exemplo).
Quando uma reserva leva 1 caixa, o sistema baixa automaticamente **3**
(1 × 3 = 3 lâminas). Ninguém precisa de calcular nada à mão.

### Regras que o sistema impõe

- **Só uma forma pode ser padrão** — e a padrão tem sempre «contém 1».
- **Preço por forma** — o preço do modal geral (Kz) só se usa quando não
  há formas definidas.
- **Melhor preço justo** — no Localizador, o selo «Melhor preço» compara
  o preço **por unidade-base** entre farmácias. Uma caixa a 300 Kz compete
  de igual com lâminas a 100 Kz. Se cobrasses 330 Kz pela caixa de 3, o
  cliente veria «≈ 110 Kz/lâmina» e entenderia que está a pagar mais.

### Sugestões automáticas

No modal, o botão **«+ Sugerir formas de venda»** pré-preenche pela forma
farmacêutica:

- Comprimido/cápsula → lâmina (padrão) + caixa;
- Xarope/solução → frasco;
- Injetável → ampola;
- Outros → unidade.

Depois é só preencher os preços.

**Sem formas de venda definidas?** O medicamento usa o preço único do
modal — funciona, mas o cliente vê só «250 Kz» sem saber se é da lâmina ou
da caixa. **Configurar formas é o que faz a tua farmácia comparável e
confiável no Localizador.**

---

## 3.b. Equipa e PINs

A página **Equipa** (só o gerente vê) gere quem trabalha na farmácia:
cada colega tem um **perfil** (Gerente ou Balcão) e um **PIN de 4
dígitos** para entrar no turno.

- **Adicionar colega** — nome, papel e PIN inicial. O colega pode mudar
  o PIN na página **Sessão**.
- **Desactivar perfil** — quem sai da farmácia: o perfil deixa de aparecer
  na escolha e o histórico dos registos mantém-se.
- **Papéis:** o gerente valida medicamentos e gere a equipa; o balcão
  atende, repõe e regista. O resto é igual para todos.
- **PIN perdido?** Repõe o PIN do perfil na página Equipa — e pede ao
  colega para o mudar em Sessão.

---

## 4. Relatório de vendas

Vai a **Vendas** no menu. O relatório conta só **reservas concluídas** —
a única transição que é uma venda real (o cliente levantou, o stock baixou).

### O que vês

- **Total estimado** da janela (7 / 30 / 90 dias — chips no topo);
- **Reservas concluídas** — quantas vendas;
- **Melhor dia** — o dia com maior valor na janela;
- **Tendência** — faixa com a comparação vs. o período anterior de igual
  tamanho (↑ verde a subir, ↓ vermelho a descer), com o montante anterior
  e as reservas de cada período. Sem vendas no período anterior, mostra
  «sem base para tendência» — honestidade estatística em vez de +∞%;
- **Gráfico de barras** por dia — dias sem vendas aparecem a zero (traço
  base), o eixo nunca colapsa.

### Como ler os números

- O valor usa o **preço da forma de venda confirmada** — se o cliente pediu
  3 caixas e a farmácia confirmou 2, a conta é 2 × preço da caixa.
- Reservas **sem formas de venda** (legado) contam na contagem de vendas e
  unidades, mas **não no montante** — não há preço fiável de onde vir. Se
  a nota de rodapé diz «X de Y reservas não entram no montante», configura
  as formas de venda: os próximos dias ficam completos.
- É **estimado, não facturação** — o final é o apurado no balcão. Usa o
  relatório para **tendências**: que dias vendem mais, o efeito de uma
  promoção, se vale a pena repor um produto que roda rápido.

### Decisões que o relatório suporta

| Pergunta                                      | Onde olhar                                               |
| --------------------------------------------- | -------------------------------------------------------- |
| Estou a vender mais ou menos que antes?       | A faixa de tendência do relatório (vs. período anterior) |
| Vale a pena ter este produto sempre em stock? | Vendas 30/90 dias + avisos de reposição repetidos        |
| Os meus preços competem?                      | /pesquisa (anónima) — vê quem leva o «Melhor preço»      |
| A equipa está a atender rápido?               | Tempo entre criação e estado «confirmada» nas reservas   |

---

## 5. O perfil público da farmácia

Tudo o que está no **Perfil** aparece ao cliente na página da tua farmácia
no Localizador (`/farmacia/o-teu-slug`). É a tua montra — mantém-na viva.

### O que podes editar

- **Endereço** — como o cliente chega a pé/de carro (rua, número, referência);
- **Telefone** e **WhatsApp** — o WhatsApp alimenta os botões «falar com a
  farmácia» e as mensagens prontas das reservas;
- **Horário de atendimento** — texto livre (ex.: «Seg–Sex 08:00–18:00 ·
  Sáb 08:00–13:00»). Alimenta a indicação **«aberto agora»** do Localizador
  — mantém-no correcto, senão o cliente aparece à porta fechada;
- **Link do Google Maps** — cola o link partilhado do sítio exacto
  (Google Maps → Partilhar → Copiar link). Aparece como botão «Ver no
  mapa» na página pública.

### O que a equipa gere (e porquê)

- **Nome público e verificação** — a verificação ✓ é o que distingue a
  farmácia real de um perfil qualquer. Fala com a equipa se o nome mudar.
- **Slug** — o endereço da tua página (`/farmacia/…`). Fixo, por
  estabilidade dos links.

### Checklist do perfil (5 minutos, uma vez por trimestre)

1. O telefone/WhatsApp ainda são os mesmos?
2. O horário mudou (inverno, férias, feriados)?
3. O link do Maps aponta para a entrada certa?
4. Há itens de stock **sem origem/marca/foto**? (Stock → abre o item →
   preenche. Fichas completas vendem mais.)
5. A foto da embalagem de cada item está actualizada?

---

## 6. Desempenho — quem vende o quê

A página **Desempenho** mede a equipa pelo que cada perfil **registou**:
**reservas concluídas** (o cliente levantou — a venda real) e **entradas de
stock**, nas janelas de **7 / 30 / 90 dias**, com a tendência face ao
período anterior de igual tamanho.

### O que só o gerente vê

- **Ranking de vendas** — barras por perfil (valor estimado, vendas e ticket
  médio);
- **Partilha das vendas** — a fatia de cada um no total da equipa;
- **Tabela avançada** — valor, nº de vendas, ticket, unidades, entradas,
  reservas tratadas, recusas/expiradas e a tendência de cada perfil;
- **Comparação lado a lado** — escolhe dois perfis e vê as métricas face a
  face.

O **balcão** vê a mesma página em versão pessoal: só as suas vendas, sem
colegas à vista (o escopo é imposto no servidor, não pelo ecrã).

### Como ler (e o que fazer com os números)

- **Reservas tratadas** = as que passaram por um perfil no período (inclui
  recusadas e expiradas). **Recusas** = recusadas + expiradas sem
  levantamento: se o número sobe sempre no mesmo perfil, há ali um problema
  de atendimento — ou de stock.
- **Entradas** contam os registos de stock em nome de cada perfil — repor o
  stock também é trabalho e aparece aqui.
- O que foi registado antes de existir perfil activo conta como **Não
  atribuído**.

> Usa isto para **conversas curtas e semanais**, não para castigar: quem vê a
> sua barra subir repõe stock e atende mais depressa.

---

## 7. Integração — ligar o sistema da farmácia

Se a farmácia já usa um **sistema de gestão** (ERP), não vale a pena
escrever o stock duas vezes: a página **Integração** liga o sistema ao
Localizador.

### As três vias (da mais automática à mais simples)

1. **Chave de API** (`cfk_…`) — o sistema da farmácia envia o stock por
   `POST /api/ingest/stock`, com a chave no cabeçalho `Authorization`.
   Criar e revogar chaves é do **gerente** (a página diz quando não tens
   permissão).
2. **Importação de stock por CSV** — exportas do sistema e importas aqui:
   escolher o ficheiro → dizer o que é cada coluna → pré-visualização →
   aplicar. Sem programação, dá para fazer de semana a semana.
3. **Webhooks** — regista um endereço teu para receber os avisos de
   alteração de stock (`stock.updated`) e confirma em **Últimas entregas**
   que estão a chegar.

> **A chave aparece uma vez só.** Ao criá-la, copia-a logo para o sistema da
> farmácia; se a perder, cria outra e revoga a antiga.

As **últimas chamadas de terceiros** mostram o que entrou, o que foi
recusado e o que falhou — é o primeiro sítio a olhar quando o stock não
sincroniza. Numa reposição, o mais simples é enviar `mode: "set"` (o valor
enviado passa a ser o saldo) com um `idempotency_key`, para uma repetição de
rede não contar duas vezes.

---

## 8. Rotina recomendada do gestor

| Frequência     | Acção                                                           |
| -------------- | --------------------------------------------------------------- |
| **Semanal**    | Vendas (5 min) — tendência vs. semana anterior, melhor dia      |
| **Semanal**    | Desempenho — quem atendeu o quê e onde estão as recusas         |
| **Semanal**    | Atenção — validar que os atendentes resolveram os avisos        |
| **Mensal**     | Formas de venda — há itens ainda só com preço único?            |
| **Mensal**     | Fichas de stock — origem, marca e foto dos itens mais vendidos  |
| **Trimestral** | Checklist do perfil público (secção 5)                          |
| **Trimestral** | Lixeira — confirmar que o que foi retirado é mesmo para retirar |
| **Trimestral** | Integração — a chave de API ou o CSV ainda sincronizam?         |
| **Pontual**    | Criar fármaco em falta no catálogo (secção 2)                   |
| **Pontual**    | Validar medicamentos criados pela equipa («Aguarda validação»)  |

---

## Resumo — as alavancas do gestor

| Alavanca                       | Onde                                            | Impacto                                                                              |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Formas de venda (lâmina/caixa) | Stock → modal → «Formas de venda»               | Comparabilidade e confiança no preço                                                 |
| Prioridade nos críticos        | + Adicionar medicamento / stock                 | Destaque no painel de críticos                                                       |
| Origem e marca                 | Stock → modal                                   | O cliente decide mais rápido (e pesquisa pela marca!)                                |
| Foto da embalagem              | Stock → modal → Foto                            | Confirma a apresentação certa (na câmara do telemóvel: botão «Tirar foto» no upload) |
| Horário e Maps                 | Perfil                                          | «Aberto agora» correcto = cliente que chega e compra                                 |
| Vendas + tendência             | Vendas                                          | Decide repor, promover ou descontinuar                                               |
| Retirar descontinuados         | Stock → modal → «Retirar do catálogo» (Lixeira) | Lista limpa; avisos só para o que interessa                                          |
| Desempenho por perfil          | Desempenho                                      | Onde está o tempo perdido: recusas, expiradas e stock a faltar                       |
| Sistema da farmácia ligado     | Integração (chave de API ou CSV)                | O stock deixa de depender de alguém se lembrar de o escrever                         |

> **A regra de fundo:** o Localizador mostra quem confirmou stock recente,
> com preço claro e ficha completa. Tudo o que é falta de informação é
> cliente que desiste a meio — ou pior, que desconfia. As secções acima
> são exactamente as informações que faltam.
