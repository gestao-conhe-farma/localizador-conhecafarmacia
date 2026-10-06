-- ============================================================
-- 0016 · Estrutura de embalagem no stock (entrada de stock)
--
-- Na entrada de stock, o atendente precisa dizer o que chegou de
-- forma real: "3 caixas, cada caixa com 10 lâminas de 10
-- comprimidos" — não um número solto. Estas duas colunas guardam a
-- estrutura da embalagem POR item de stock (cada farmácia vende o
-- que comprou; a estrutura é da mercadoria dela):
--
--   pack_laminas     → lâminas que vêm na caixa      (ex.: 10)
--   pack_comprimidos → comprimidos que há em cada lâmina (ex.: 10)
--
-- Total de comprimidos por caixa = pack_laminas × pack_comprimidos.
-- Ambas opcionais (NULL = não definido / não se aplica — xaropes,
-- ampolas). Não confundir com stock_sale_options.pack_size: lá é
-- "quanto vale 1 unidade na unidade-base" (serve para converter e
-- precificar); aqui é a descrição física da caixa que chegou, usada
-- para mostrar o total de comprimidos e para a conversão na entrada.
-- ============================================================

alter table public.stock_items
  add column if not exists pack_laminas integer
    check (pack_laminas is null or pack_laminas between 1 and 999),
  add column if not exists pack_comprimidos integer
    check (pack_comprimidos is null or pack_comprimidos between 1 and 999);

comment on column public.stock_items.pack_laminas is
  'Lâminas por caixa (embalagem recebida) — NULL quando não se aplica.';
comment on column public.stock_items.pack_comprimidos is
  'Comprimidos por lâmina — NULL quando não se aplica.';

-- ============================================================
-- Verificação (depois de aplicar):
--   select pack_laminas, pack_comprimidos from stock_items limit 1;
-- ============================================================
