# Farmácias públicas — seis modelos para escolher

Data: 21/10/2026 · Âmbito: `/farmacia` (lista) e `/farmacia/[slug]` (página da farmácia).
Nada em `app/` foi alterado: isto é uma revisão de design em HTML autónomo.

## O que já existe hoje

- **Lista**: hero centrado (kicker + Fraunces), chips de município + «só abertas agora», grelha de 3 cartões brancos com nome em Fraunces, município/morada, «N medicamentos agora», Ligar e WhatsApp.
- **Página**: hero à esquerda (kicker, nome, morada, horário, badges de aberto/stock/verificada) com acções à direita, pesquisa dentro da farmácia, painel de críticos e acordeões por forma farmacêutica.
- **Identidade**: papel `#FFFDF9`, verde `#00493A`, acento `#0A844F`, Fraunces para títulos, Inter para texto, hairline em vez de sombra, botões pill.

## Duas rondas

### A/B/C — estrutura da decisão

| | Lista | Página da farmácia |
|---|---|---|
| **A · Índice** | números de ordem, estado e stock como numeral | catálogo com preço e ficha de contacto fixa |
| **B · Mapa** | split view lista + mapa esquemático | banda de frescura e ficha lateral |
| **C · Montra** | painel verde de destaque + cartões | «fachada» verde e prateleira com preço à frente |

### D/E/F — comportamento de loja e ficha de produto

| | Lista | Página da farmácia | Ficha (pop-up) |
|---|---|---|---|
| **D · Balcão** | filtros de loja (zona, aberto, stock, receita) e 3 produtos com preço por farmácia | barra de categorias fixa + cartões de prateleira | duas colunas: embalagem + decisão |
| **E · Busca** | produto primeiro: uma apresentação comparada entre farmácias | ficha de contacto fixa + lista densa | coluna única, acção fixa |
| **F · Ficha** | — | prateleira congelada, só como fundo | 3 variantes: duas colunas · compacta · reserva em 2 passos |

Os seis mantêm cor, tipografia, logo e tom editorial. O que muda é **o que o cliente vê primeiro** e **quanto da ficha cabe na lista**.

## O que foi extraído dos sites de referência

`designlang@12.4.0` correu sobre [pharmeasy.in](https://pharmeasy.in) e [farmacosmo.com](https://www.farmacosmo.com), com captura de componentes e tokens. Saída completa em `_design/designlang/` (8+ ficheiros por site: design language, tokens W3C, Tailwind, CSS vars, preview, screenshots).

| Padrão observado | Onde | Como aparece nos modelos |
|---|---|---|
| Cartão com desconto, rating, preço antigo, preço e botão de adicionar | Farmacosmo (badge `-26,78%`, 4.9/102, `€27.50` → `€20.14`) | D: minis com preço e frescura; E: comparação de preço; D/F: cartões de prateleira |
| Ficha com preço, preço unitário e «IVA incluído» | PharmEasy (`₹16.73/glucometer test strips`, `Inclusive of all taxes`) | preço + `47,50 Kz por comprimido · IVA incluído` nas fichas D/E |
| Tamanhos/embalagens alternativos com preço próprio | PharmEasy (10/50/100 unidades) | E/F: alternativas na ficha; F3: quantidade 1–5 |
| Validade e conservação como dados de decisão | PharmEasy (`Expires on or after`, `Storage Information`) | «Conservação» na ficha; detalhes fechados por omissão em F2 |
| Receita, não-retornável, pagamento na entrega | PharmEasy | badge `Receita`; «pagamento no balcão»; sem carrinho |
| Estimativa de entrega | Farmacosmo (`2-5 working days`) | **substituída** por janela de levantamento (F3) — o projecto não entrega |
| Rating e reviews | ambos | **não copiado**: não temos reviews reais, e inventá-las seria mentira |
| Pontos, descontos por quantidade, tabela nutricional | Farmacosmo | **não copiado**: fora do âmbito do Localizador |

O que **não** foi copiado de propósito: as cores de ambos (Farmacosmo azul `#0D3464` + amarelo `#FECE00`; PharmEasy teal `#10847E`), o carrinho, o header mega-menu, e o padrão de rating com estrelas. A paleta do projecto ficou intacta.

## O cartão de prateleira

A captura do PharmEasy mostrou a anatomia que faltava: **imagem grande → nome → marca → embalagem → preço → acção de largura total**, tudo num cartão vertical com uma hairline. Foi essa a estrutura adoptada em `loja.css` (`.pcard`), traduzida para a marca:

| Da referência | No cartão |
|---|---|
| Foto do produto sobre fundo neutro | área de imagem 4:3 em papel (`--paper-2`), com a embalagem tipográfica dentro — ou a foto real, quando a farmácia a tiver (`image_path`) |
| Badge de desconto sobre a imagem | `tagchip` com categoria e `Receita` — informação, não promoção |
| Título truncado a 2 linhas | `.pcard-name` com `line-clamp:2` |
| «By BRAND» em micro-caps | marca dentro da embalagem (não duplicada no corpo) |
| `₹16.73/strip` | `.pcard-unit`: `47,50 Kz por comprimido`, calculado a partir do preço e da embalagem |
| `Add to Cart` a toda a largura | `Ver ficha e reservar` — e `Só no balcão` quando `reservable` é falso |
| Preço antigo, `% OFF`, cupão, entrega | **removidos**: não há promoções, cupões nem entrega no Localizador. `.price-was` e `.save` saíram do CSS |

Onde aparece: prateleira do **D** (11 cartões, 3 colunas), âncora de cada apresentação no **E** (`.pcard--flat`, com o intervalo da rede) e a prateleira de fundo do **F**. O cartão inteiro é o botão — a banda verde é a acção visível — e abre a ficha no pop-up.

**Custos de acessibilidade medidos na fonte, não herdados:** PharmEasy 62% (5 pares com contraste insuficiente), Farmacosmo 41% (34 pares). Os modelos usam a paleta do projecto, que já passa nos pares que usamos; não copiámos nenhum par reprovado.

## Ficheiros

| Ficheiro | Papel |
|---|---|
| `index.html` | Galeria com as capturas e o que cada modelo propõe |
| `modelo-a-indice.html` · `modelo-b-mapa.html` · `modelo-c-montra.html` | Primeira ronda |
| `modelo-d-balcao.html` · `modelo-e-busca.html` · `modelo-f-ficha.html` | Segunda ronda (loja + ficha) |
| `loja.css` | Tokens, header, botões, chips, preço, embalagem tipográfica, cartão de produto (`.pcard`) e sistema de modal |
| `pdp.js` | Ficha de produto partilhada por D e E: dados, foco, Esc, scrim, reserva simulada |
| `shots/` | Capturas a 1440 × 1000 (`a-`, `b-`, `c-`, `d-`, `e-`, `f-`) |
| `shoot.cjs` · `shoot-loja.cjs` | Regeneram as capturas da primeira e da segunda ronda |
| `verify-filtros.cjs` · `verify-loja.cjs` | Testes Playwright dos filtros, do mapa, das fichas e da consola |
| `assets/` | Logo e fontes (Fraunces/Inter) embutidos localmente |
| `_design/designlang/` | Extração bruta dos dois sites (não é entregável do site) |

Cada modelo tem as duas páginas: `#lista` e `#farmacia`. Abre `index.html` no browser, ou corre `node _design/farmacia-2026/serve.mjs` e visita `http://127.0.0.1:8790/_design/farmacia-2026/index.html`.

## A ficha de produto

O pop-up existe porque a página da farmácia já tem muita informação: abrir uma rota nova para cada medicamento perdia o contexto da prateleira e o botão «voltar». A ficha:

- escurece e **torna inerte** o que está atrás (scrim + `aria-modal`, scroll do body bloqueado);
- prende o foco, fecha com **Esc**, com o **✕** e com clique fora, e devolve o foco ao cartão que a abriu;
- mostra preço, unidade, frescura, stock, indicações, como tomar, conservação e aviso;
- tem **alternativas** e **«onde mais há»**, para não obrigar a fechar e recomeçar;
- simula a reserva: botão passa a «Reserva pedida · SR-####» e aparece um toast. Não há chamada ao servidor.

F3 leva o padrão mais longe: quantidade (1–5), janela de levantamento, telemóvel validado (9 dígitos) e ecrã de confirmação com código. É o comportamento de loja que o projecto ainda não tem — mas o fluxo real já existe em `/reserva`.

## Como foi verificado

```bash
PW=$(npm root -g)/@playwright/cli/node_modules/playwright \
  node _design/farmacia-2026/verify-loja.cjs
```

50 asserções, exit 0, zero erros de consola:

- **D**: 7 → 6 com «só abertas»; pesquisa «insulina» → 1; Talatona → 2; ficha abre com título certo; reserva muda o botão; Esc fecha e repõe o scroll; amoxicilina mostra receita e Shift+Tab mantém o foco dentro da ficha; insulina abre a ficha certa; categoria → 3; pesquisa interna → 1.
- **D · cartão**: 11 cartões, todos com área de imagem, preço e acção de largura total; `47,50 Kz por comprimido`; acção diz «Ver ficha e reservar»; fraldas dizem «Só no balcão»; zero menções a carrinho, cupão ou desconto no cartão e na ficha.
- **E**: 1 apresentação e 5 farmácias por omissão; 3 cartões-âncora; o cartão mostra `950 – 1 100 Kz`; sugestão «soro» → 3 farmácias; filtro de abertas; ficha em coluna única com o título certo; scrim fecha; termo inválido mostra aviso e desaparece ao voltar; categoria → 3.
- **F**: arranca em F1; 3 cartões na prateleira de fundo; F2 abre detalhes; F3 quantidade 3 e total 2 850 Kz; telemóvel vazio é recusado; confirmação gera código `SR-####`; Esc fecha e mostra «Reabrir».

As capturas da segunda ronda foram geradas pelo mesmo Chrome headless a 1440 × 1000.

## Limites, sem rodeios

- **`pharmamarket.eu` não foi extraído**: devolveu 403 / «Just a moment…» (Cloudflare) ao browser automatizado e ao `curl`. Não foi usado como referência, e não há tokens dele neste trabalho.
- **Não há fotografias de produtos nem de farmácias no projecto.** As embalagens são placas tipográficas assumidas, com a legenda «sem fotografia». Preferi isso a desenhar embalagens falsas ou usar imagens de banco.
- **Preços, stock, horários e farmácias são de demonstração** — o mesmo conjunto em todos os modelos, para a comparação ser honesta. As reservas são simuladas no browser; nenhum dado é gravado.
- **Sem entrega, sem carrinho, sem reviews.** São comportamentos centrais nos sites extraídos, mas o Localizador não os tem; imitá-los no protótipo criaria expectativas falsas.
- **Desktop only na revisão** (1440). Há media queries, mas não foram validadas em telemóvel.
- **Distância continua ausente**, apesar de a base ter `lat`/`lng`: a query pública actual não a devolve, e inventá-la seria fingir.
- O mapa do modelo B continua a ser um **esboço declarado**, não geografia real.

## Dados usados

Sete farmácias com nomes, municípios e moradas plausíveis de Luanda; o stock detalhado da Farmácia São Rafael (11 produtos nesta ronda), com preços em kwanza; e dez fichas de produto completas em `pdp.js` (indicações, dose, conservação, aviso, alternativas). Nada disto é dado real.
