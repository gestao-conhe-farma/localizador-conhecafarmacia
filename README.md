# Localizador de Medicamentos — Conheça Farmácia

> **localizador.conhecafarmacia.com** — um website gratuito onde qualquer pessoa
> pesquisa o medicamento e vê, em segundos, quais as farmácias de Luanda que o
> têm em stock. Projecto irmão de [conhecafarmacia.com](https://conhecafarmacia.com),
> alojado em separado para não sobrecarregar a máquina do site principal.

## Estado actual — Fase 1 (landing de lançamento)

- Landing pública com a apresentação do projecto, compromissos e FAQ
- Formulário de pré-adesão para farmácias interessadas (leads em Supabase)
- Mesma identidade visual do site principal (Next.js 16 + React 19 + Tailwind v4)
- PT apenas

## Roadmap

- **Fase 2** — busca read-only: pesquisar medicamento → farmácias com stock confirmado
- **Fase 3** — reservas + portal da farmácia (actualizar stock, fila de reservas)
- O schema Supabase completo (drugs, pharmacies, stock, reservas, admin_users)
  já está preparado em `supabase/migrations/`

## Desenvolvimento

```bash
cp .env.local.example .env.local   # preencher as chaves
npm install
npm run dev
```

Build de produção: `npm run build` · Deploy: push para `main` (Vercel).

## Estrutura

```
app/                  # App Router (PT, sem [lang])
components/layout/    # Header, Footer, MobileDrawer
components/providers/ # ThemeProvider (dark mode)
lib/supabase/         # clients browser/server/admin
supabase/migrations/  # schema completo do Localizador
localizador/          # docs de produto (apresentação, one-pager, checklist)
```

## Segurança

CSP com nonce por pedido em `proxy.js` (convenção Next 16), security headers
em `next.config.mjs` + `vercel.json`, chaves de serviço apenas server-side.

---

**Conheça Farmácia** — conhecafarmacia.com · geral@conhecafarmacia.com · +244 925 696 002
