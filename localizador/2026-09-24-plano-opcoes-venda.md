# Opções de venda (fracionamento) — Plano completo

> Data: 2026-09-24 · Origem: pedido do owner — "lâmina ou caixa? o cliente tem de saber
> o que o preço significa". Validado contra ERPs do mercado (secção 8).

## 1. O problema

O `stock_items` tem um único `price` e um `quantity` sem unidade:

- Farmácia A vende **lâmina** a 100 Kz; Farmácia B vende a **caixa** a 300 Kz. O Localizador
  compara preços incomparáveis e o selo "Melhor preço" pode estar a mentir.
- `quantity: 30` não diz nada (30 o quê?) — e o trigger de conclusão subtrai às cegas.
- O caso real (lâmina 8 comp. = 100 Kz · caixa c/ 3 lâminas = 300 Kz) exige **mais de um
  preço por produto na mesma farmácia** — impossível com uma coluna.

## 2. Desenho validado (padrão da indústria)

**Estoque único na unidade-base + opções de venda com pack_size.**
Nada de saldo por opção (ledgers divergentes — a dor documentada do Odoo).

```
stock_items.quantity        → saldo NA UNIDADE-BASE (a da opção is_default)
stock_sale_options:
  id             uuid pk default gen_random_uuid()
  stock_item_id  uuid fk → stock_items on delete cascade
  unit           text not null  — 'comprimido'|'lamina'|'caixa'|'frasco'|'ampola'|'unidade'
  pack_size      int not null default 1 check (pack_size >= 1)
                 — quantas UNIDADES-BASE esta forma de venda contém
  price          numeric(10,2) not null check (price >= 0)
  is_default     bool not null default false
  active         bool not null default true   — "ofereço esta forma" (não é saldo!)
  sort_order     int not null default 0
  created_at     timestamptz default now()
  unique (stock_item_id, unit)          — uma opção por forma de venda
  unique partial (stock_item_id) where is_default  — exatamente um default
reservations.sale_option_id uuid null fk → stock_sale_options on delete set null
```

Regras:

- **Unidade-base** = a da opção `is_default` (normalmente a mais fracionada: lâmina).
  O `pack_size` do default é sempre 1.
- `reservations.confirmed_quantity`/`quantity` continuam a ser contados em unidades-base
  quando a reserva tem `sale_option_id`; sem opção, comportamento actual (legado).
- Fallback legado intacto: farmácia sem opções usa `stock_items.price` como hoje.

## 3. Exemplo do owner

Lâmina 8 comprimidos = 100 Kz · Caixa (3 lâminas) = 300 Kz · saldo 10 lâminas:

```
opção default: (lamina, pack_size 1, 100 Kz)
opção extra:   (caixa,  pack_size 3, 300 Kz)
```

- Cliente reserva **1 caixa** → baixa 3 (10 → 7)
- Cliente reserva **2 lâminas** → baixa 2 (7 → 5)
- Nunca diverge: um único ledger.

## 4. Migração 0012 · `supabase/migrations/0012_stock_sale_options.sql`

Idempotente (padrão do projecto):

1. `create table if not exists stock_sale_options` + constraints + índices
2. `alter table reservations add column if not exists sale_option_id uuid references …`
3. **View `stock_confirmed` recriada** com `left join lateral` agregando as opções
   activas como `sale_options jsonb` (unit, pack_size, price, is_default) — itens sem
   opções continuam a sair com `sale_options = '[]'`
4. **Policies**: público lê opções de itens visíveis (via exists na view de
   pharmacies activas); farmácia escreve só as suas (`is_own_pharmacy(stock_item_id)`)
5. **Trigger `apply_reservation_stock_change` (v3)**: quando a reserva tem
   `sale_option_id`, a quantidade a baixar = `quantidade × pack_size` da opção;
   senão, semântica actual (0010). `security definer`, `create or replace`
6. Grant select para anon/authenticated

## 5. Fatia 2 · Portal (gestão)

**Server Actions** (`lib/actions/pharmacy-portal.js`):

- `getMyStockSnapshot` passa a trazer `sale_options` por item (uma query extra à
  tabela nova filtrada por `pharmacy_id` — join no cliente)
- Nova `setSaleOptions({ drugId, options })`: substitui as opções do item do
  `pharmacy_id` da sessão (delete + insert numa transacção lógica; valida units
  contra lista fechada, pack_size ≥ 1, preço ≥ 0, exatamente um default se houver
  opções activas). Upsert do `stock_items` permanece intocado

**UI** (`components/portal/StockPanel.jsx` — modal de edição existente):

- Secção nova "Como vende este medicamento?" — linhas editáveis
  `[unidade ▾] [contém __ unidades-base] [preço Kz] [oferecer ✓]`
- Botão "+ adicionar forma de venda"; primeira linha activa = default
- **Defaults inteligentes pela forma farmacêutica**: comprimido/cápsula → sugere
  lâmina (1) + caixa (3); xarope/xarope pediátrico → frasco (1); injetável → ampola (1);
  inalador → unidade (1). Sugestão — nunca bloqueante
- Sem opções preenchidas = comportamento de hoje (preço único legado)

## 6. Fatia 3 · Localizador (público)

**Exibição** (`DrugSearch.jsx` + `PharmacyStock.jsx`):

- Etiquetas por opção: `Lâmina · 100 Kz` / `Caixa (3 lâminas) · 300 Kz`
  (formatação: `pack_size > 1` → "Contém N unidades-base" entre parênteses)
- Legado sem opções: preço simples como hoje
- **"Melhor preço"**: só compara a MESMA unidade entre farmácias (compara a opção
  default de cada farmácia; se as unidades diferem, o selo não aparece)

**Reserva por opção** (`ReserveModal.jsx` + `lib/actions/reservations.js`):

- Se o item tem opções, o modal mostra um selector "Quero: [lâmina ▾] × 2"
  (unidades do pedido = quantidade × pack_size convertida no servidor)
- `createReservation` aceita `saleOptionId` (valida que pertence ao item e está
  activo), guarda na reserva e devolve no resumo
- Template WhatsApp do portal passa a mostrar a opção ("2 × lâmina")

## 7. Validação

1. Teste rollback da 0012 (padrão dos anteriores)
2. Cenários do trigger v3: reserva de caixa baixa pack_size × qtd; reserva legada
   inalterada; recusa não baixa; dupla conclusão não duplica
3. Prettier + rotas (portal, /pesquisa, farmácia, /reserva/[id])
4. E2E: reservar 1 caixa → verificar saldo −3 no stock

## 8. Base da pesquisa (2026-09-24)

- **Inovafarma**: "Fração de Venda, Qtde por Embalagem e Preço de Venda" no cadastro;
  venda por "Unidade Fracionada" ou "Caixa/Embalagem" — estoque único
- **Nex/Nextar**: "Unidade de Medida" + flag "Permite fracionamento" — estoque único
- **Odoo**: UoM com factores de conversão (1 caixa = 3 blísteres = 24 comp.); dor
  documentada: dedução manual desincronizada entre embalagens — o que evitamos
- **Angola** (Kuatelasoft, Naqsell, ZS): gestão clássica sem docs de fracionamento;
  **Tecnofarma.ao** já anuncia "localize, compare preços, reserve em tempo real" —
  validação de mercado; clareza de preço por unidade é diferenciador

## 9. Fora do âmbito desta fase

- Preços por lote/validade; gestão de caixas fechadas vs. abertas (inventário físico)
- Integração POS; relatórios de curva ABC por opção de venda
