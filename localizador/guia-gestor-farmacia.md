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

| O atendente (guia próprio)… | O gestor (este guia)… |
|---|---|
| Confirma e recusa reservas | Decide **o que vender e a que preço** |
| Registra entradas de fornecedor | Cria **fármacos que faltam ao catálogo** |
| Repõe stock e corrige validades | Define as **formas de venda** (lâmina/caixa) |
| Usa o portal todos os dias | Configura e acompanha **por semana** |

As duas funções podem ser da mesma pessoa — o portal não as separa em
contas diferentes. A divisão acima é só sobre **quando** se usa cada parte.

---

## 2. Criar fármacos que faltam no catálogo

O catálogo do Localizador é gerido pela equipa Conheça Farmácia, mas se um
medicamento que a tua farmácia vende **não existe no catálogo**, podes
pedir a criação:

1. Vai a **Stock**.
2. Toca em **+ Adicionar medicamento** (no cabeçalho da página).
3. Preenche:
   - **Nome** — como aparece na caixa (ex.: «Aspirina 500 mg»);
   - **Forma** — comprimido, cápsula, xarope, injetável…;
   - **Dosagem** — ex.: 500 mg;
   - **Receita médica** — liga se a venda exige receita;
   - **Prioridade** — marca os **medicamentos críticos** (insulinas,
     anti-epilépticos, etc.): no Localizador aparecem em destaque no painel
     de críticos da página da farmácia.
4. Guarda.

**O que acontece depois:** o fármaco fica **inactivo** — não aparece no
Localizador de imediato. A equipa valida (evita duplicados e erros de
dosagem) e activa. Quando activo, comporta-se como qualquer medicamento:
aparece em Stock, aceita entrada de stock e reservas.

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

Vai a **Stock** → toca no **nome** do medicamento → secção **«Como vende
este medicamento?»** no modal.

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

| Forma | Contém | Preço | O que o cliente vê |
|---|---|---|---|
| Lâmina *(padrão)* | 1 | 100 Kz | `Lâmina · 100 Kz` |
| Caixa | 3 | 300 Kz | `Caixa (3 lâminas) · 300 Kz ≈ 100 Kz/lâmina` |

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

| Pergunta | Onde olhar |
|---|---|
| Estou a vender mais ou menos que antes? | A faixa de tendência do relatório (vs. período anterior) |
| Vale a pena ter este produto sempre em stock? | Vendas 30/90 dias + avisos de reposição repetidos |
| Os meus preços competem? | /pesquisa (anónima) — vê quem leva o «Melhor preço» |
| A equipa está a atender rápido? | Tempo entre criação e estado «confirmada» nas reservas |

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

## 6. Rotina recomendada do gestor

| Frequência | Acção |
|---|---|
| **Semanal** | Vendas (5 min) — tendência vs. semana anterior, melhor dia |
| **Semanal** | Atenção — validar que os atendentes resolveram os avisos |
| **Mensal** | Formas de venda — há itens ainda só com preço único? |
| **Mensal** | Fichas de stock — origem, marca e foto dos itens mais vendidos |
| **Trimestral** | Checklist do perfil público (secção 5) |
| **Trimestral** | Lixeira — confirmar que o que foi retirado é mesmo para retirar |
| **Pontual** | Criar fármaco em falta no catálogo (secção 2) |

---

## Resumo — as alavancas do gestor

| Alavanca | Onde | Impacto |
|---|---|---|
| Formas de venda (lâmina/caixa) | Stock → modal → «Como vende…» | Comparabilidade e confiança no preço |
| Prioridade nos críticos | + Adicionar medicamento / stock | Destaque no painel de críticos |
| Origem e marca | Stock → modal | O cliente decide mais rápido (e pesquisa pela marca!) |
| Foto da embalagem | Stock → modal → Foto | Confirma a apresentação certa (na câmara do telemóvel: botão «Tirar foto» no upload) |
| Horário e Maps | Perfil | «Aberto agora» correcto = cliente que chega e compra |
| Vendas + tendência | Vendas | Decide repor, promover ou descontinuar |
| Retirar descontinuados | Stock → modal → «Retirar do catálogo» (Lixeira) | Lista limpa; avisos só para o que interessa |

> **A regra de fundo:** o Localizador mostra quem confirmou stock recente,
> com preço claro e ficha completa. Tudo o que é falta de informação é
> cliente que desiste a meio — ou pior, que desconfia. As secções acima
> são exactamente as informações que faltam.
