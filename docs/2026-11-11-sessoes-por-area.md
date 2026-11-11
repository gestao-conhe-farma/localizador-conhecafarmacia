# Sessões por área (site · portal · interno) e o âmbito do logout

> **Para quem mexe no auth.** Não é um plano: é a referência do que existe hoje e porquê. Se mudares a área de um cliente Supabase, o logout, ou o proxy, lê isto primeiro — os erros aqui são silenciosos (a pessoa aparece como anónima, ou é expulsa de outra área, sem erro nenhum).

**Contexto:** o Localizador vive num projecto Supabase só (`tbqsazriorqzexjwhekw`, schema `localizador`) partilhado com o site principal — ver `docs/2026-10-28-contas-utilizador-partilhadas.md`. Uma base, um par de chaves, **três áreas autenticadas** no mesmo browser.

---

## 1. As três áreas

| Área | Onde | Cookie |
| --- | --- | --- |
| `site` | site público (`/`, `/medicamento`, `/farmacia`, `/reservas`) e `/conta` | `sb-<ref>-auth-token` |
| `portal` | `/portal` (portal da farmácia) | `sb-<ref>-portal-auth-token` |
| `interno` | `/interno` (consola da equipa CF) | `sb-<ref>-interno-auth-token` |

`<ref>` é a primeira etiqueta do `NEXT_PUBLIC_SUPABASE_URL` (`tbqsazriorqzexjwhekw`).

**A regra que isto serve:** as três podem ser contas diferentes, ao mesmo tempo, no mesmo browser. Antes, as três escreviam em `sb-<ref>-auth-token` e cada login apagava o anterior — daí o sintoma «entro no interno e saio do portal».

O `site` mantém o nome histórico de propósito: é a cookie que `www`/`conta` já usam no domínio partilhado, e mudá-la deitava fora sessões de utilizadores reais sem ganho nenhum.

---

## 2. Onde vive a decisão

`lib/supabase/auth-cookie.js` — **fonte única** do nome:

```js
nomeCookieAuth('site')    // sb-tbqsazriorqzexjwhekw-auth-token
nomeCookieAuth('portal')  // sb-tbqsazriorqzexjwhekw-portal-auth-token
nomeCookieAuth('interno') // sb-tbqsazriorqzexjwhekw-interno-auth-token
ehCookieAuth(name, area)  // aceita o cookie e as fatias `.0`, `.1`, …
```

Funciona porque o `@supabase/ssr` usa `cookieOptions.name` como *storage key* (`createBrowserClient.js`, `createServerClient.js`). Sem esse nome, deriva o nome do URL do projecto e todas as áreas colidem.

Dois detalhes do `@supabase/ssr` que não se vêem:

- A sessão **não cabe num cookie** (~3,3 KB): é partida em `…-auth-token.0`, `…-auth-token.1`. Por isso é que `ehCookieAuth` compara prefixo, e nunca `name === base`.
- O `name` é removido das opções de gravação antes do `cookieStore.set` — passá-lo em `cookieOptions` não suja os atributos do cookie.

---

## 3. Quem usa que área

| Ficheiro | Área |
| --- | --- |
| `lib/supabase/server.js` · `client.js` | não decidem: recebem `{ area }`, por omissão `'site'` |
| `proxy.js` | renova as três |
| `app/portal/**`, `components/portal/**`, `lib/pharmacy-session.js`, `lib/announcements.js`, `lib/actions/pharmacy-*.js`, `lib/actions/integration.js` | `portal` |
| `lib/platform/session.js`, `lib/platform/subscriptions.js`, `lib/actions/platform-*.js` | `interno` |
| `lib/account-session.js`, `lib/actions/account.js`, `lib/actions/reservations.js`, `components/conta/**`, `components/search/**`, `components/reservation/**`, `lib/stock.js` (browser), `lib/use-pharmacy-stock-realtime.js` | `site` (por omissão) |

Excepções que parecem erradas e não são:

- **`lib/actions/reservations.js`** usa `site`: a reserva nasce no site público, com a conta de cliente — não com a da farmácia.
- **`lib/platform/subscriptions.js`** é `portal`, apesar do caminho `platform/`: quem chama `getSubscription` é o layout do portal, o `PlanGate`, `/portal/equipa` e `/portal/desempenho`. (Já esteve `interno` por engano e o portal caía no plano de entrada por ler uma cookie que não existe — RLS nega, `falha: true`, sem erro visível.)
- **`app/api/ingest/stock/route.js`** obtém a subscrição com o cliente admin (service role) — a área não conta.

Regra prática: **quem cria cliente escolhe a área**. Se um helper novo chamar `createServerComponentClient()` sem área, está a dizer `site` — e no portal isso é uma sessão anónima, não um erro.

---

## 4. O proxy renova as três

`proxy.js` percorre `AREAS_COM_SESSAO = ['site', 'portal', 'interno']`, e para cada área cuja cookie esteja no pedido cria um cliente e chama `auth.getUser()` (é o que valida o JWT e força a renovação).

Dois cuidados já implementados:

1. Os `Set-Cookie` das três são recolhidos em `aGravar` e escritos **uma vez** no fim. Cada `setAll` construía uma `NextResponse.next()` nova e levava consigo os cookies da área anterior.
2. A gravação mantém o `Domain` do domínio pai (`lib/cookie-domain.js`), senão a renovação valia só no host actual e a sessão partia ao saltar para `conta.*`.

Os `POST` saem cedo e sem headers: é na resposta da Server Action que vive o `Set-Cookie` do login.

---

## 5. Logout: âmbito local

`lib/supabase/sign-out.js`:

```js
encerrarSessao(supabase) // signOut({ scope: 'local' })
```

`signOut()` sem âmbito é **global**: revoga todos os refresh tokens da conta. Com três áreas, isso expulsava a mesma pessoa das outras duas. `local` limpa a cookie desta área e revoga só esta sessão.

Usado em: logout do portal (`PortalLogout`), do site (`AccountShell`, `sair`), do interno (`logoutPlatform`) e nos fechos de sessão a meio do login (`platform-auth.js`, `pharmacy-portal.js`) e da reposição de senha por TOTP (`pharmacy-recovery.js`).

**O que se abre mão:** o refresh token desta sessão não é revogado no servidor — quem tivesse uma cópia dele continua válido até expirar. Para expulsar de todos os dispositivos há «mudar a senha», que usa `signOut({ scope: 'others' })` em `lib/actions/platform-account.js` — esse fica como está, é o objectivo dele.

---

## 5.1 Reposição de senha: uma área, um formulário

As três áreas partilham `auth.users`, mas não partilham a porta de entrada — e a reposição tem de seguir a mesma regra. **Cada área só repõe as suas contas:**

| Pedido feito em | Aceita | Recusa (sem enviar nada) |
| --- | --- | --- |
| Site (`conta.*/recuperar`) | contas que **não** estão em `localizador.admin_users` | farmácia e plataforma |
| Portal (`/portal/recuperar`) | `localizador.admin_users` com `role = 'farmacia'` **e** `pharmacy_id` | contas do site e da plataforma |
| Interno | senha definida pela plataforma (`platform-account.js`) — não há reposição por e-mail | — |

O portal verifica a pertença **antes** de enviar (`idDoEmail` + `perfilDeFarmacia`, em `lib/actions/pharmacy-recovery.js`). Antes usava o `otp_disabled` do `signInWithOtp` como oráculo, e isso só provava que o e-mail existia em `auth.users` — um e-mail do site recebia o código e entrava no assistente.

No site, o pedido passou a ser uma Server Action (`pedirReposicaoSenha`, em `lib/actions/auth.js`) precisamente para poder fazer esta pergunta antes do `resetPasswordForEmail`; no cliente, `auth.resetPasswordForEmail` enviava para qualquer e-mail do projecto. A resposta é sempre `{ success: true }` — o formulário do site nunca revelou se um e-mail tem conta, e um «esta conta é de outra área» seria um oráculo novo.

A consequência a ter em conta: uma pessoa com conta nas duas áreas (ex.: o e-mail de serviço) repara a senha **no portal**, e a senha nova vale para as duas — é a mesma identidade. Não há reposição dupla porque não há duas contas.

---

## 6. Como acrescentar uma área

1. `lib/supabase/auth-cookie.js`: nada a fazer se o nome seguir o padrão (`sb-<ref>-<area>-auth-token`).
2. `proxy.js`: juntar a área a `AREAS_COM_SESSAO`.
3. Passar `{ area: '<nova>' }` em todos os `createServerComponentClient`/`createClient` dessa área — e em cada helper que crie cliente por dentro.
4. Avisar que **as sessões existentes dessa área caem uma vez**: o cookie antigo deixa de ser lido. Não há forma de migrar sem correr JS antes do primeiro pedido do servidor.

---

## 7. Como verificar sem browser

Os clientes são Node puros — um cookie jar de `Map` chega para provar isolamento, execução e âmbito de logout. Sem `next/headers`, reproduz-se a regra de nomes e usa-se `createServerClient`:

```js
const jar = () => {
  const store = new Map()
  return {
    store,
    cookies: {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) value ? store.set(name, value) : store.delete(name)
      },
    },
  }
}
```

Casos que já foram verificados assim e valem a pena repetir depois de mexer:

- três logins em três áreas → três pares de cookies, e cada cliente lê o seu utilizador;
- `encerrarSessao` no portal → a cookie do portal desaparece e `getUser()` no site continua a devolver o utilizador;
- `signOut()` global (controlo) → o site fica sem sessão, provando que a diferença é mesmo o âmbito.

Sintoma a vigiar nos logs: `insufficient_aal`, `PGRST301`/`42501` (RLS) e utilizadores a aparecer como anónimos numa área — quase sempre é uma área trocada, não um problema de credenciais.

---

## 8. Limitações conhecidas

- `eslint`/`next build` não terminam neste ambiente de desenvolvimento; a validação real é o build da Vercel. Localmente usa-se `esbuild` por ficheiro para sintaxe.
- MFA (`aal2`) é por conta, não por área: quem tem TOTP tem de o confirmar em cada área onde entra.
- Uma conta com TOTP **não** repõe a senha pelo link de e-mail (`insufficient_aal`, sessão `aal1`). Esse caminho é `/portal/recuperar`, com o código do autenticador — ver `lib/actions/pharmacy-recovery.js`.
