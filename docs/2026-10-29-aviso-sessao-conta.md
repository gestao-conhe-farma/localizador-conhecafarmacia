# Aviso interno — a sessão antiga deixa de valer (Task 6.12)

Texto para circular pela equipa (WhatsApp / e-mail interno). Escrito a 29/10/2026,
para acompanhar o corte da Task 7.3.

---

## Para a equipa

**A conta mudou de casa: todos voltam a entrar uma vez.**

Desde o corte de 29/10, as contas vivem no projecto principal e a sessão passou
a ser partilhada entre `www.conhecafarmacia.com`, `conta.conhecafarmacia.com` e
`localizador.conhecafarmacia.com`. Quem estava com sessão aberta no site antigo
vai ser **desligado uma vez** e tem de entrar de novo — agora em
`conta.conhecafarmacia.com`.

O que **não** muda:

- A **palavra-passe é a mesma**. Ninguém precisa de a repor.
- Nada se perdeu: guardados, anotações, reservas e histórico continuam na conta.
- Depois de entrarem uma vez, a mesma sessão serve os três endereços — já não
  há um login para o site e outro para o Localizador.
- Quem entra com o Google continua a entrar com o Google.

## O que dizer a quem se queixar de ter sido desligado

> «Foi uma mudança única, no dia 29. A sua palavra-passe é a mesma — entre em
> conta.conhecafarmacia.com com o e-mail e a palavra-passe de sempre. Se não se
> lembrar dela, use “Esqueci-me da palavra-passe” e recebe um e-mail em minutos.»

Se a pessoa disser que **o e-mail de reposição não chegou**:

1. confirmar que o endereço está bem escrito;
2. verificar a pasta de spam (o remetente mudou);
3. se continuar a falhar, escalar para quem trata da conta — o envio fica
   registado em `auth.users.recovery_sent_at` e dá para confirmar se saiu.

## O que **não** dizer

- Não prometer que «não volta a acontecer»: uma sessão nova volta a ser pedida
  sempre que se muda de domínio de cookie.
- Não pedir a palavra-passe a ninguém, em nenhum canal. A reposição é sempre
  por e-mail, a partir de `conta.conhecafarmacia.com`.
