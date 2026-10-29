# Imagens-modelo dos produtos

O que aparece no lugar da fotografia quando a farmácia (ou o catálogo) ainda
não tem a embalagem real. Uma imagem **por categoria de apresentação**, sem
nome nem marca — o nome do produto continua a vir do texto do cartão.

## Especificação do ficheiro

| | |
|---|---|
| Dimensões | **1600 × 1200 px** (4:3) |
| Fundo | branco sólido `#FFFFFF` (não transparente) |
| Produto | centrado, ocupando ~80 % da altura, margem igual em todos |
| Texto / logótipos | nenhum |
| Formato | **WebP**, qualidade 85 (`.png` também é aceite) |
| Peso | até ~300 KB |
| Nome | exatamente o `slug` da categoria, minúsculas: `comprimido.webp` |

O ficheiro pode ser maior do que 1600 px — a app reduz para 800 px no lado
maior ao publicar (`lib/image-compress.js`). Nunca entregar abaixo de
1200 px de largura.

## Essenciais — 10 imagens que cobrem o catálogo todo

| Ficheiro | Desenhar | Cobre hoje | Recurso |
|---|---|---|---|
| `comprimido.webp` | Cartela/blister de comprimidos sobre uma caixinha de cartão | 16 produtos (comprimidos e cápsulas) | `caixa` |
| `frasco.webp` | Frasco de plástico com rótulo branco e tampa roscada | xaropes, géis, loções, álcool, soro | `caixa` |
| `bisnaga.webp` | Bisnaga/tubo em pé, tampa para baixo | cremes, pomadas, pasta de dentes | `caixa` |
| `boiao.webp` | Boião largo com tampa roscada | creme facial | `caixa` |
| `injetavel.webp` | Ampola de vidro + seringa (ou vial com agulha) | Ceftriaxona, Insulina | `caixa` |
| `inalador.webp` | Inalador pressurizado («bombinha») com bocal | Salbutamol | `caixa` |
| `pacote.webp` | Pacote flexível em pé, fecho superior | fraldas, toalhitas, compressas | `caixa` |
| `lata.webp` | Lata cilíndrica com tampa de plástico | leite em pó | `pacote` |
| `biberao.webp` | Biberão com tetina e escala graduada | Biberão Nuby | `pacote` |
| `caixa.webp` | Caixa de cartão genérica, sem qualquer marca | último recurso universal | — |

**`caixa.webp` é obrigatório**: é o fim de todas as cadeias. Sem ele, um
produto sem forma reconhecível volta à embalagem tipográfica.

## Refinamentos — 18 opcionais

Substituem o essencial correspondente assim que o ficheiro existir. Nenhum é
necessário para o sistema funcionar; cada um melhora a leitura da grelha.

| Ficheiro | Desenhar | Recurso |
|---|---|---|
| `gotas.webp` | Frasco pequeno com conta-gotas | `frasco` |
| `xarope.webp` | Frasco com copo dosador ao lado | `frasco` |
| `spray.webp` | Frasco com válvula de spray | `frasco` |
| `alcool.webp` | Frasco âmbar de álcool/desinfetante | `frasco` |
| `soro.webp` | Bolsa/frasco de soro fisiológico com tubo | `frasco` |
| `desodorizante.webp` | Roll-on em pé | `frasco` |
| `perfume.webp` | Frasco de vidro com tampa (perfume) | `frasco` |
| `supositorio.webp` | Cartela alongada de supositórios | `caixa` |
| `po-sache.webp` | Saqueta de pó, bordo rasgado | `pacote` |
| `fraldas.webp` | Pacote de fraldas (foto de bebé na frente) | `pacote` |
| `toalhitas.webp` | Pacote de toalhitas com aba | `pacote` |
| `penso.webp` | Compressas/adesivos empilhados | `pacote` |
| `higiene-oral.webp` | Escova de dentes + bisnaga de pasta | `bisnaga` |
| `sabonete.webp` | Barra de sabonete com embalagem | `caixa` |
| `batom.webp` | Batom aberto em pé | `caixa` |
| `teste.webp` | Caixa de teste com stick | `caixa` |
| `preservativo.webp` | Caixa pequena de preservativos | `caixa` |
| `dispositivo.webp` | Termómetro digital / dispositivo médico | `caixa` |

## Como o ficheiro é escolhido

`lib/product-models.js` lê a forma escrita pela farmácia (`drug_form`), o
nome do produto e o tipo (`drug_kind`) — nesta ordem: família de produto,
forma de embalagem, forma no nome, tipo. Depois tenta os ficheiros por
ordem (`<categoria>.webp` → `<categoria>.png` → recurso → `caixa`) e, se
nenhum existir, mostra a embalagem tipográfica.

Não é preciso mexer em código para publicar uma imagem nova: basta copiar o
ficheiro com o nome certo para esta pasta.
