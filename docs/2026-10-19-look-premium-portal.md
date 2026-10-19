# Look premium do portal — decisões de acabamento

Data: 19/10/2026. Âmbito: `styles/globals.css` e, quando necessário, os componentes do portal. Sem alterações de lógica, dados ou rotas.

## Referência medida

Medido por `getComputedStyle` no portal (modo escuro) e comparado com o painel do Supabase (modo escuro):

| Elemento | Antes (portal) | Depois (portal) | Referência (Supabase) |
|---|---|---|---|
| Botão primário / secundário | pílula `999px` | `8px` | `8px` |
| Campo de pesquisa da secção | pílula `999px` | `8px` | campos de 6–8px |
| Cartões (`.portal-box`, `.portal-kpi`) | `16px` | `12px` | `~10.7px` |
| Painéis internos | `12px` | sem alteração | — |
| Filtros/chips | pílula | sem alteração (são seletores, não ações) | — |

## Cores

- Verde primário: `#00493a` em claro e em escuro (antes, o escuro era `#005c4a`, que não coincidia com a decisão). O texto branco sobre `#00493a` mantém contraste acima de 4,5:1.
- Fundos e superfícies do modo escuro mantêm-se (`#0a0f0d` fundo, `#151c19` cartões).

## Números

- `font-variant-numeric: tabular-nums` já está em `.portal-kpi-n`; mantém-se.

## Estados de carregamento

- Classe utilitária `.portal-skeleton` (bloco animado, com `prefers-reduced-motion` a desligar a animação), disponível para os componentes que mostram "A carregar…".

## Fora de âmbito

- Substituir todos os 999px dos cabeçalhos de secção e chips por raios menores.
- Reescrever a hierarquia de cores da sidebar.
