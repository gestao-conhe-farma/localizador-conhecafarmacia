# Checklist de Onboarding de Farmácias (Localizador de Medicamentos)

> **Documento operacional (T11 do plano `docs/superpowers/plans/2026-09-19-localizador-medicamentos.md`).**
> Uso interno da equipa Conheça Farmácia. Um exemplar deste checklist **por farmácia**,
> preenchido pelo responsável do recrutamento. Duplicar a secção "Ficha" para cada
> nova farmácia ou usar como base de linha no CRM/Airtable da equipa.

---

## Pré-requisitos (antes de contactar a primeira farmácia)

- [ ] **MVP funcional** com seed de 5–10 farmácias de teste (plano T1) — nunca
      recrutar com produto não funcional
- [ ] **One-pager** finalizado (ver `docs/LOCALIZADOR_ONE_PAGER_PARCERIA_FARMACIAS.md`),
      exportado em PDF, com contactos reais
- [ ] **Conta de farmácia modelo** criada (user Supabase Auth + `admin_users` com
      papel `farmacia`) para usar na demonstração
- [ ] **Lista-alvo preparada**: 20–30 farmácias de Luanda priorizadas por (a)
      probabilidade de ter medicamentos difíceis de encontrar (farmácias hospitalares,
      de referência, grandes superfícies), (b) presença digital e (c) contacto
      acessível
- [ ] **Script de contacto** ensaiado (ver anexo A abaixo)
- [ ] Definir **responsável interno** por farmácia (a relação é pessoal — quem
      recruta acompanha)

---

## Ficha da farmácia — `[NOME DA FARMÁCIA]`

**Responsável do recrutamento:** `[nome]` · **Data de início:** `[data]` · **Estado:**
`[prospecto | em conversa | demonstração | acordo verbal | onboarded | activa | churn]`

### Etapa 1 — Primeiro contacto

- [ ] Contacto inicial feito (visita presencial preferida; alternativa: WhatsApp/e-mail
      com one-pager em anexo)
- [ ] Interlocutor certo identificado: **director técnico / farmacêutico responsável**
      (não é o balcão nem o segurança — pedir directamente o director técnico)
- [ ] Registado no CRM: nome do interlocutor, cargo, melhor canal e hora de contacto,
      objeções iniciais

**Critério para avançar:** interlocutor certo disse que quer ver a demonstração.

### Etapa 2 — Reunião/demonstração (20–30 min)

- [ ] Demonstração feita **no telemóvel do interlocutor** (não no nosso): abrir o
      localizador público → procurar um medicamento difícil de encontrar → mostrar
      resultado com stock confirmado; depois abrir o portal da farmácia modelo e
      actualizar 2 stock em tempo real, mostrar a mudança no telemóvel dele
- [ ] Mostrar a **regra de 72h** (stock sem actualização deixa de aparecer como
      confirmado) — expectativa definida no dia 1, evita frustração depois
- [ ] Explicado o modelo sem comissão e sem venda (a farmácia vende, nós encaminhamos)
- [ ] Questões de privacidade respondidas: contacto do cliente só para a farmácia da
      reserva; nenhum dado partilhado com terceiros
- [ ] **Acordo verbal** sobre: frequência de actualização (2–3×/semana), prazo de
      resposta a reservas (<24h), pessoa responsável pelas actualizações

**Critério para avançar:** acordo verbal + nome da pessoa que vai actualizar.

### Etapa 3 — Setup técnico (nossa responsabilidade, <24h após acordo)

- [ ] Criar farmácia no admin (`/admin/localizador`): nome, slug, município, morada,
      GPS (colher no Google Maps durante a visita), telefone, WhatsApp, horário,
      logo se existir
- [ ] Criar **apresentações iniciais**: os 10–20 medicamentos que a farmácia confirma
      ter normalmente (do catálogo de moléculas-alvo; usar autocomplete da tabela
      `drugs` para o `drug_id`)
- [ ] Marcar o stock inicial **junto com o interlocutor** (ligação ou presencial):
      é a primeira actualização, serve de formação
- [ ] Criar conta do portal: user Supabase Auth (email institucional ou do
      interlocutor) + `admin_users` com `role='farmacia'` e `pharmacy_id` correcto
- [ ] Enviar credenciais + link do portal por WhatsApp **e** guardar cópia da senha
      temporária para o primeiro login
- [ ] Teste de ponta a ponta feito: login da farmácia → actualizar 1 stock → visível
      no localizador público

### Etapa 4 — Formação do utilizador da farmácia (20 min)

- [ ] Login no portal (`/[lang]/admin/farmacia`) com a conta dele, no telemóvel dele
- [ ] Ecrã de stock: alternar "temos/não temos", quantidade opcional, guardar
- [ ] Fila de reservas: confirmar → pronto → concluído; recusar quando não tem
- [ ] Banner "stock desactualizado": o que significa e o que fazer
- [ ] Alteração de senha feita (primeiro login)
- [ ] Contato directo de suporte dado (WhatsApp do responsável interno — suporte
      humano nos primeiros 30 dias)

### Etapa 5 — follow-up e estabilização (30 dias)

- [ ] **Dia 2:** verificar se fez a 2.ª actualização sem nosso incentivo
- [ ] **Dia 7:** chamada de 5 min — primeira reserva que recebeu? Foi fácil? Alguma
      funcionalidade em falta?
- [ ] **Dia 14:** verificar taxa de resposta a reservas no admin (alvo: ≥80% em 24h)
- [ ] **Dia 30:** chamada de revisão — estatísticas da farmácia mostradas
      (pesquisas dos seus medicamentos, reservas); pedir depoimento se estiver satisfeito
- [ ] Estado alterado para **`activa`** no CRM (critério: ≥1 actualização/semana
      durante 4 semanas consecutivas)
- [ ] Se inactiva em qualquer momento: reengajar por WhatsApp; 2 falhas seguidas →
      escalar para decisão de manter/despromover `verified`

---

## Anexo A — Script de primeiro contacto (WhatsApp, adaptar para visita)

> Bom dia, [nome]. Falo com o director técnico da [farmácia]?
> Sou o [nome], da **Conheça Farmácia** — o site de educação farmacêutica angolano.
> Estamos a lançar um **localizador gratuito de medicamentos** que mostra ao público
> em que farmácias de Luanda estão os remédios difíceis de encontrar.
> As farmácias parceiras do lançamento aparecem em destaque **sem qualquer custo nem
> comissão** — o doente chega ao vosso balcão já decidido a comprar.
> Posso mostrar em 20 minutos como funciona? Levo tudo ao vosso balcão.

**Variação por e-mail:** mesma estrutura, assunto "Parceria gratuita: seja encontrado
por doentes que procuram [medicamento] em Luanda", anexo one-pager em PDF.

**Nota:** nas primeiras 10 farmácias, priorizar **visita presencial** — taxa de
conversão esperada muito superior e permite colher GPS/logo/morada no local.

---

## Anexo B — Métricas do módulo de recrutamento (revisão quinzenal)

| Métrica | Alvo piloto |
|---|---|
| Farmácias contactadas (acumul.) | ≥ 30 |
| Taxa conversão visita→demonstração | ≥ 40% |
| Demonstração→acordo verbal | ≥ 50% |
| Acordo→onboarded (<24h) | 100% |
| Farmácias activas (≥1 act./semana) | ≥ 15 na semana 8 |
| Taxa de resposta a reservas | ≥ 60% em <4h |
| Churn nas primeiras 8 semanas | < 20% |

**Regra de corte:** se a taxa de actualização espontânea (sem incentivo da equipa)
for < 50% após 30 dias, o modelo "self-service + validação activa" precisa de
ajuste antes de escalar — voltar ao plano (fase 2, T13: digest automático) ou
reforçar o acompanhamento humano.
