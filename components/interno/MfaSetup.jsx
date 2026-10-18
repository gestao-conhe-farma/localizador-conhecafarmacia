'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { iniciarInscricao, confirmarInscricao, cancelarInscricao } from '@/lib/actions/platform-mfa'
import { mensagemMfa } from '@/components/interno/mfa-erros'
import Notice from '@/components/ui/Notice'
import { dataHora, haQuanto } from '@/components/interno/formatos'

/**
 * INScrever o autenticador TOTP (File Structure: `/interno/mfa`).
 *
 * Dois passos, e é o próprio ritual do TOTP que os impõe: o servidor gera um
 * segredo, o segredo vai para a app de autenticação (pelo QR ou pela chave) e
 * a única prova de que foi bem copiado é um código válido. Não há atalho —
 * «confirmar sem código» deixaria a conta com um factor que ninguém tem.
 *
 * O QUE NUNCA PASSA PELO CLIENTE: a decisão. O `secret` e o QR existem aqui
 * por um instante porque só se mostram UMA vez (o Auth não os volta a dar), e
 * o código é enviado tal e qual — quem diz se a sessão sobe para `aal2` é o
 * Supabase Auth, no servidor (`confirmarInscricao`).
 *
 * Depois de confirmar, o ecrã não desaparece: passa ao ramo «activo», que diz
 * o que ficou inscrito e qual é o nível da sessão — e o `router.refresh()` é
 * o que faz o rodapé do shell dizer «Segundo factor verificado nesta sessão»
 * sem novo login. O sucesso não se guarda em estado próprio: nesse instante a
 * acção revalida a rota, o servidor volta a ler os factores e o ramo «activo»
 * é mais verdadeiro do que qualquer coisa que este componente soubesse.
 */
export default function MfaSetup({ nivel, verificado, porAcabar = [], embedded = false }) {
  const router = useRouter()
  const [inscricao, setInscricao] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [aTrabalhar, start] = useTransition()

  const aal2 = nivel === 'aal2'

  const correr = (fn) => {
    setErro(null)
    setDetalhe(null)
    start(async () => {
      try {
        const r = await fn()
        if (r?.ok) return r
        setErro(r?.error || 'MFA_FALHA')
        setDetalhe(r?.detalhe || null)
        return null
      } catch {
        setErro('MFA_FALHA')
        return null
      }
    })
  }

  const comecar = () =>
    correr(async () => {
      const r = await iniciarInscricao()
      if (r?.ok) setInscricao(r)
      return r
    })

  const confirmar = (e) => {
    e.preventDefault()
    correr(async () => {
      const r = await confirmarInscricao({ factorId: inscricao?.factorId, code: codigo })
      if (r?.ok) {
        // Sem estado de «feito» próprio: a acção revalida a rota, o servidor
        // volta a ler os factores e este ecrã passa ao ramo «activo» — que já
        // diz o que mudou e qual é o nível da sessão. Guardar aqui a boa
        // notícia era escrevê-la em dois sítios e vê-la desaparecer no
        // redesdobrar, como aconteceu na conversão de leads.
        setInscricao(null)
        setCodigo('')
        router.refresh()
      }
      return r
    })
  }

  const descartar = (factorId) =>
    correr(async () => {
      const r = await cancelarInscricao({ factorId })
      if (r?.ok) {
        setInscricao(null)
        setCodigo('')
        router.refresh()
      }
      return r
    })

  const aviso = erro ? (
    <Notice tone="danger" role="alert">
      {mensagemMfa(erro)}
      {detalhe && <span className="interno-hint"> detalhe: {detalhe}</span>}
    </Notice>
  ) : null

  // ---- Já inscrito: o ecrã passa a ser o sítio onde se lê o estado ----
  if (verificado) {
    return (
      <div className="interno-box interno-box--pad">
        <Notice tone={aal2 ? 'ok' : 'warn'} role="status" title="Segundo factor activo">
          O autenticador <b>{verificado.nome}</b> está inscrito nesta conta
          {verificado.criadoEm ? ` desde ${dataHora(verificado.criadoEm)}` : ''}.
          {aal2
            ? ' Esta sessão já confirmou o código: as acções sensíveis deixam de o pedir.'
            : ' Esta sessão só tem senha — confirme o código na entrada para que as acções sensíveis passem.'}
        </Notice>

        <dl className="interno-dl">
          <div className="interno-dl-row">
            <dt>Autenticador</dt>
            <dd>{verificado.nome}</dd>
          </div>
          <div className="interno-dl-row">
            <dt>Inscrito</dt>
            <dd>
              {dataHora(verificado.criadoEm)}
              {verificado.criadoEm ? (
                /* «há X» depende do instante em que é calculado: o servidor e o
                   cliente não o calculam no mesmo milissegundo, e o React
                   acusava hydration mismatch. A data absoluta ao lado é fixa
                   (fuso de Luanda) e não precisa disto. */
                <span className="interno-hint" suppressHydrationWarning>
                  {' '}
                  {haQuanto(verificado.criadoEm)}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="interno-dl-row">
            <dt>Último código</dt>
            <dd>
              {verificado.ultimoDesafio ? (
                <>
                  {dataHora(verificado.ultimoDesafio)} (
                  <span suppressHydrationWarning>{haQuanto(verificado.ultimoDesafio)}</span>)
                </>
              ) : (
                'desde a inscrição, nenhum'
              )}
            </dd>
          </div>
          <div className="interno-dl-row">
            <dt>Nível desta sessão</dt>
            <dd>
              {aal2 ? (
                'aal2 — segundo factor confirmado'
              ) : (
                <>
                  aal1 — só senha.{' '}
                  <Link href="/interno/login" className="interno-table-link">
                    Confirmar o código
                  </Link>
                </>
              )}
            </dd>
          </div>
        </dl>

        <p className="interno-hint">
          Trocar de telefone ou de aplicação passa por quem gere o acesso da equipa: um autenticador
          activo não se remove daqui, para que uma sessão roubada não possa desligar o segundo
          factor. Se perdeu o dispositivo, peça a reposição do acesso.
        </p>
      </div>
    )
  }

  // ---- A confirmar: o QR e o segredo só existem neste ecrã, uma vez ----
  if (inscricao) {
    return (
      <div className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>Confirmar o autenticador</h2>
          <span className="interno-sec-head-b">challenge + verify</span>
        </div>

        <ol className="interno-steps">
          <li className="interno-step">
            <span className="interno-step-num">1</span>
            <span className="interno-step-text">
              <b>Leia o código QR</b>
              <span className="interno-hint">
                Abra a aplicação de autenticação (Google Authenticator, Authy, 1Password…) e
                adicione uma conta lendo o código ao lado.
              </span>
            </span>
          </li>
          <li className="interno-step">
            <span className="interno-step-num">2</span>
            <span className="interno-step-text">
              <b>Escreva o código de seis dígitos</b>
              <span className="interno-hint">
                É a prova de que o segredo ficou bem guardado do seu lado. Enquanto não entrar um
                código válido, a conta continua sem segundo factor.
              </span>
            </span>
          </li>
        </ol>

        <div className="interno-qr-row">
          {inscricao.qrCode ? (
            /* A acção já devolve o QR pronto a usar (`paraDataUri` em
               `lib/actions/platform-mfa.js`): o GoTrue entrega-o como
               data-uri e o prefixo só se acrescenta quando falta. */
            <img
              className="interno-qr"
              alt="Código QR do autenticador"
              width={180}
              height={180}
              src={inscricao.qrCode}
            />
          ) : (
            <span className="interno-hint">
              O servidor não devolveu código QR — use a chave abaixo.
            </span>
          )}

          <div className="interno-qr-lado">
            <span className="interno-label">Chave do autenticador</span>
            <code className="interno-mono interno-secret">{inscricao.secret || '—'}</code>
            <span className="interno-hint">
              Se a aplicação não conseguir ler o QR, escreva esta chave à mão. É a única vez que ela
              aparece: quem a tiver pode gerar os seus códigos.
            </span>
            {inscricao.nome && (
              <span className="interno-hint">
                No autenticador vai aparecer como <b>{inscricao.nome}</b>.
              </span>
            )}
          </div>
        </div>

        <form className="interno-form" onSubmit={confirmar}>
          <label className="interno-label">
            Código do autenticador
            <input
              className="interno-input interno-input--code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              value={codigo}
              autoFocus
              disabled={aTrabalhar}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </label>

          {aviso}

          <div className="interno-form-acts">
            <button
              type="button"
              className="interno-btn interno-btn--ghost"
              disabled={aTrabalhar}
              onClick={() => descartar(inscricao.factorId)}
            >
              Descartar esta inscrição
            </button>
            <button
              type="submit"
              className="interno-btn interno-btn--primary"
              disabled={aTrabalhar || codigo.replace(/\D/g, '').length !== 6}
            >
              {aTrabalhar ? 'A confirmar…' : 'Confirmar e activar'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ---- Sem factor: começar ----
  return (
    <>
      <div className="interno-box interno-box--pad">
        {/* Embutido em /interno/definicoes, o título já está FORA do cartão
            («Segundo factor»): repeti-lo aqui fazia o cartão começar com
            dois títulos para a mesma coisa. */}
        {!embedded && (
          <div className="interno-sec-head">
            <h2>Inscrever o autenticador</h2>
            <span className="interno-sec-head-b">TOTP obrigatório</span>
          </div>
        )}

        <p className="interno-hint">
          O segundo factor é <b>obrigatório</b> para contas da equipa: as acções sensíveis
          (desactivar uma farmácia, mexer em planos, gerir níveis internos, exportar a trilha)
          exigem uma sessão
          <b> aal2</b> — ou seja, a senha <b>e</b> o código do autenticador confirmados na mesma
          sessão. Sem autenticador inscrito, a sua conta entra e lê, mas não executa essas acções.
        </p>

        <p className="interno-hint">
          Precisa de uma aplicação de autenticação TOTP (Google Authenticator, Authy, 1Password,
          Aegis…). A inscrição mostra um código QR e uma chave; escolha uma das duas formas.
        </p>

        {aviso}

        <div className="interno-form-acts">
          <button
            type="button"
            className="interno-btn interno-btn--primary"
            disabled={aTrabalhar}
            onClick={comecar}
          >
            {aTrabalhar ? 'A preparar…' : 'Começar a inscrição'}
          </button>
        </div>

        {porAcabar.length > 0 && (
          <div className="interno-mfa-pendentes">
            <span className="interno-label">Inscrições por acabar</span>
            <ul className="interno-mfa-lista">
              {porAcabar.map((f) => (
                <li key={f.id}>
                  <span className="interno-step-text">
                    <b>{f.nome}</b>
                    <span className="interno-hint">
                      começada <span suppressHydrationWarning>{haQuanto(f.criadoEm)}</span> — o
                      código QR já não se pode mostrar outra vez
                    </span>
                  </span>
                  <button
                    type="button"
                    className="interno-btn interno-btn--ghost interno-btn--small"
                    disabled={aTrabalhar}
                    onClick={() => descartar(f.id)}
                  >
                    Descartar
                  </button>
                </li>
              ))}
            </ul>
            <span className="interno-hint">
              Uma inscrição por acabar não dá acesso a nada: o código nunca foi confirmado. Fica
              aqui para não colidir com a inscrição nova.
            </span>
          </div>
        )}
      </div>
    </>
  )
}
