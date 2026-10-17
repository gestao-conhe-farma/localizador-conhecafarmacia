'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetMemberMfa } from '@/lib/actions/platform-team'
import { dataCurta, haQuanto } from '@/components/interno/formatos'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * Tabela da equipa e reposição do segundo factor (Phase 9).
 *
 * A decisão de QUEM pode repor não é tomada aqui: `rows[].podeRepor` e
 * `podeRepor` vêm prontos do servidor, e a Server Action volta a autorizar
 * (matriz + `aal2` + motivo). Este componente só evita oferecer um botão
 * que o servidor ia recusar — por exemplo, na própria linha de quem está a
 * usar o ecrã.
 *
 * O mesmo vale para o aviso de MFA: a sessão só com senha é um facto que o
 * servidor já leu, e o diálogo di-lo ANTES de a pessoa escrever o motivo.
 */

const MENSAGENS = {
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite repor o segundo factor de um membro.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  PROPRIO_FACTOR:
    'Não pode repor o seu próprio segundo factor: peça a outro superadmin. Repor o próprio factor é o caminho de quem roubou uma sessão.',
  NAO_E_MEMBRO: 'Esta conta não é da Equipa Conheça Farmácia.',
  CONTA_ILEGIVEL: 'Não foi possível ler a conta no Auth. Tente de novo.',
  CONTA_SUSPENSA:
    'A conta está suspensa. Decida primeiro a suspensão — uma conta banida não entra.',
  MFA_ILEGIVEL: 'Não foi possível ler os factores desta conta. Tente de novo.',
  SEM_FACTOR: 'Esta conta não tem nenhum autenticador verificado — não há nada a repor.',
  REPOSTO_A_MEIO:
    'Só uma parte dos factores foi apagada. Confirme na lista o estado actual e tente de novo; a operação ficou na trilha.',
  ID_INVALIDO: 'Pedido inválido.',
  FALHA: 'Não foi possível concluir a acção. Tente de novo.',
}

function estadoMfa(row) {
  if (row.suspenso) return <span className="interno-pill interno-pill--off">Conta suspensa</span>
  if (row.convitePendente)
    return <span className="interno-pill interno-pill--info">Convite pendente</span>
  if (row.fatores === 0)
    return <span className="interno-pill interno-pill--warn">Sem autenticador</span>
  return (
    <span className="interno-pill interno-pill--ok">
      Activo · {row.fatores} factor{row.fatores === 1 ? '' : 'es'}
    </span>
  )
}

export default function TeamTable({ rows, podeRepor, mfa2 }) {
  const router = useRouter()
  const [alvo, setAlvo] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, start] = useTransition()

  const correr = (motivo) =>
    start(async () => {
      setErro(null)
      setAviso(null)
      try {
        const r = await resetMemberMfa({ userId: alvo.userId, motivo })
        if (r?.ok) {
          setAlvo(null)
          router.refresh()
          if (r.auditado === false) {
            setAviso(
              `Segundo factor de ${r.nome || r.email || 'membro'} reposto, mas a trilha NÃO registou a operação. Avise quem mantém a área interna e registe o caso — o membro já pode entrar e inscrever um autenticador novo.`,
            )
          } else {
            setAviso(
              `Segundo factor de ${r.nome || r.email || 'membro'} reposto e registado na trilha. As sessões dele foram terminadas: entre com a senha e inscreva um autenticador novo.`,
            )
          }
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  return (
    <>
      {aviso && (
        <Notice tone={aviso.includes('NÃO registou') ? 'warn' : 'ok'} role="status">
          {aviso}
        </Notice>
      )}

      {rows.length === 0 ? (
        <div className="interno-box interno-box--pad">
          <div className="interno-empty">
            <b>Nenhuma conta de equipa</b>
            <span>
              A área interna ainda não tem membros. O bootstrap cria a primeira conta superadmin.
            </span>
          </div>
        </div>
      ) : (
        <div className="interno-box">
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Nível</th>
                  <th>Segundo factor</th>
                  <th>Último acesso</th>
                  {podeRepor && <th aria-label="Acções" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      <b>{row.nome || row.email || 'Sem nome'}</b>
                      {row.nome && row.email && (
                        <span className="interno-foot-sub">{row.email}</span>
                      )}
                      {row.proprio && <span className="interno-foot-sub">é a sua conta</span>}
                    </td>
                    <td>
                      {row.rotulo}
                      {row.legado && <span className="interno-foot-sub">papel legado</span>}
                    </td>
                    <td>
                      {estadoMfa(row)}
                      {row.ultimoDesafio && (
                        <span className="interno-foot-sub">
                          último código {haQuanto(row.ultimoDesafio)}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.ultimoAcesso ? (
                        <>
                          <span>{dataCurta(row.ultimoAcesso)}</span>
                          <span className="interno-foot-sub">{haQuanto(row.ultimoAcesso)}</span>
                        </>
                      ) : (
                        <span className="interno-foot-sub">nunca entrou</span>
                      )}
                    </td>
                    {podeRepor && (
                      <td>
                        {row.proprio ? (
                          <span className="interno-foot-sub" title="Peça a outro superadmin">
                            a sua conta
                          </span>
                        ) : row.podeRepor ? (
                          <button
                            type="button"
                            className="interno-btn interno-btn--ghost interno-btn--small"
                            disabled={pending}
                            onClick={() => {
                              setErro(null)
                              setAviso(null)
                              setAlvo(row)
                            }}
                          >
                            Repor segundo factor
                          </button>
                        ) : (
                          <span className="interno-foot-sub">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {erro && !alvo && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}

      {alvo && (
        <ConfirmActionModal
          titulo={`Repor o segundo factor de ${alvo.nome || alvo.email || 'membro'}?`}
          descricao="O autenticador actual deixa de existir e as sessões abertas desta pessoa são terminadas. Nada mais é alterado: a conta, o nível e o e-mail ficam como estão. A pessoa volta a entrar com a senha e inscreve um autenticador novo em /interno/mfa."
          motivoObrigatorio
          confirmLabel="Repor segundo factor"
          tom="danger"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Membro">{alvo.nome || alvo.email}</LinhaResumo>
              <LinhaResumo rotulo="Nível">{alvo.rotulo}</LinhaResumo>
              <LinhaResumo rotulo="Autenticador">
                {alvo.fatores} factor{alvo.fatores === 1 ? '' : 'es'} verificado
                {alvo.fatores === 1 ? '' : 's'} → nenhum
              </LinhaResumo>
              <LinhaResumo rotulo="Sessões">terminadas</LinhaResumo>
              <LinhaResumo rotulo="Próximo acesso">
                senha + inscrição de um autenticador novo
              </LinhaResumo>
            </>
          }
          aviso={
            !mfa2 ? (
              <Notice tone="warn">
                A sua sessão só tem senha. O servidor vai recusar esta acção com
                <b> MFA_NECESSARIO</b> até confirmar o código do autenticador — saia e volte a
                entrar antes de continuar.
              </Notice>
            ) : null
          }
          onCancel={() => setAlvo(null)}
          onConfirm={correr}
        />
      )}
    </>
  )
}
