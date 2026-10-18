'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetMemberMfa, setMemberLevel } from '@/lib/actions/platform-team'
import { PLATFORM_ROLES, ROLE_LABELS } from '@/lib/platform/permissions'
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

/**
 * Erros da mudança de nível. Herdam as mensagens comuns (MFA, motivo,
 * sessão) e só substituem as que são próprias desta acção — a recusa de
 * permissão diz «mudar níveis», não «repor o segundo factor».
 */
const MENSAGENS_NIVEL = {
  ...MENSAGENS,
  SEM_PERMISSAO: 'O seu nível não permite mudar níveis da equipa.',
  PROPRIO_NIVEL:
    'Não pode mudar o seu próprio nível: peça a outro superadmin. Promover-se seria contornar a matriz de permissões.',
  ULTIMO_SUPERADMIN:
    'Este é o último superadmin da equipa. Promova outra pessoa antes de descer este nível — a área interna não pode ficar sem ninguém que a governe.',
  NIVEL_INVALIDO: 'Nível desconhecido. Escolha um dos cinco níveis da matriz.',
  NAO_E_MEMBRO: 'Esta conta não é da Equipa Conheça Farmácia.',
  CONTA_ILEGIVEL: 'Não foi possível ler a conta no Auth. Tente de novo.',
  NIVEL_MUDOU:
    'O nível desta pessoa mudou entretanto. Actualize a página para ver o estado actual e repita.',
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

export default function TeamTable({ rows, podeRepor, podeGerir, mfa2 }) {
  const router = useRouter()
  const [alvo, setAlvo] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, start] = useTransition()

  // Mudança de nível: uma escolha por linha (o `<select>` não muda nada
  // sozinho) e o mesmo diálogo de confirmação com motivo.
  const [escolhas, setEscolhas] = useState({})
  const [alvoNivel, setAlvoNivel] = useState(null)
  const [erroNivel, setErroNivel] = useState(null)
  const [avisoNivel, setAvisoNivel] = useState(null)
  const [pendingNivel, startNivel] = useTransition()

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

  const mudarNivel = (motivo) => {
    const { row, novo } = alvoNivel
    startNivel(async () => {
      setErroNivel(null)
      setAvisoNivel(null)
      try {
        const r = await setMemberLevel({ userId: row.userId, role: novo, motivo })
        if (r?.ok) {
          setAlvoNivel(null)
          setEscolhas((prev) => ({ ...prev, [row.userId]: '' }))
          router.refresh()
          if (!r.mudou) {
            setAvisoNivel(`O nível de ${row.nome || row.email || 'membro'} já era ${r.para}.`)
          } else if (r.auditado === false) {
            setAvisoNivel(
              `Nível de ${row.nome || row.email || 'membro'} mudado de ${r.de} para ${r.para}, mas a trilha NÃO registou a operação. Avise quem mantém a área interna e registe o caso — a mudança já vale.`,
            )
          } else {
            setAvisoNivel(
              `Nível de ${row.nome || row.email || 'membro'} mudado de ${r.de} para ${r.para} e registado na trilha.`,
            )
          }
          return
        }
        setErroNivel(MENSAGENS_NIVEL[r?.error] || 'Erro inesperado.')
      } catch {
        setErroNivel(MENSAGENS_NIVEL.FALHA)
      }
    })
  }

  return (
    <>
      {aviso && (
        <Notice tone={aviso.includes('NÃO registou') ? 'warn' : 'ok'} role="status">
          {aviso}
        </Notice>
      )}

      {avisoNivel && (
        <Notice tone={avisoNivel.includes('NÃO registou') ? 'warn' : 'ok'} role="status">
          {avisoNivel}
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
                  {(podeRepor || podeGerir) && <th aria-label="Acções" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td data-rotulo="Pessoa">
                      <b>{row.nome || row.email || 'Sem nome'}</b>
                      {row.nome && row.email && (
                        <span className="interno-foot-sub">{row.email}</span>
                      )}
                      {row.proprio && <span className="interno-foot-sub">é a sua conta</span>}
                    </td>
                    <td data-rotulo="Nível">
                      {row.rotulo}
                      {row.legado && <span className="interno-foot-sub">papel legado</span>}
                    </td>
                    <td data-rotulo="Segundo factor">
                      {estadoMfa(row)}
                      {row.ultimoDesafio && (
                        <span className="interno-foot-sub">
                          último código {haQuanto(row.ultimoDesafio)}
                        </span>
                      )}
                    </td>
                    <td data-rotulo="Último acesso">
                      {row.ultimoAcesso ? (
                        <>
                          <span>{dataCurta(row.ultimoAcesso)}</span>
                          <span className="interno-foot-sub">{haQuanto(row.ultimoAcesso)}</span>
                        </>
                      ) : (
                        <span className="interno-foot-sub">nunca entrou</span>
                      )}
                    </td>
                    {(podeRepor || podeGerir) && (
                      <td data-rotulo="Acções">
                        <div className="interno-invite-acts">
                          {row.podeMudarNivel && (
                            <>
                              <select
                                className="interno-select interno-select--small"
                                aria-label={`Mudar o nível de ${row.nome || row.email || 'membro'}`}
                                value={escolhas[row.userId] || ''}
                                disabled={pendingNivel || pending}
                                onChange={(e) => {
                                  setErroNivel(null)
                                  setAvisoNivel(null)
                                  setEscolhas((prev) => ({
                                    ...prev,
                                    [row.userId]: e.target.value,
                                  }))
                                }}
                              >
                                <option value="">Mudar nível para…</option>
                                {PLATFORM_ROLES.filter((r) => r !== row.role).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                              {escolhas[row.userId] && (
                                <button
                                  type="button"
                                  className="interno-btn interno-btn--ghost interno-btn--small"
                                  disabled={pendingNivel || pending}
                                  onClick={() => {
                                    setErroNivel(null)
                                    setAvisoNivel(null)
                                    setAlvoNivel({ row, novo: escolhas[row.userId] })
                                  }}
                                >
                                  Mudar para {ROLE_LABELS[escolhas[row.userId]]}
                                </button>
                              )}
                            </>
                          )}
                          {podeRepor ? (
                            row.proprio ? (
                              <span className="interno-foot-sub" title="Peça a outro superadmin">
                                a sua conta
                              </span>
                            ) : row.podeRepor ? (
                              <button
                                type="button"
                                className="interno-btn interno-btn--ghost interno-btn--small"
                                disabled={pending || pendingNivel}
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
                            )
                          ) : null}
                        </div>
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

      {alvoNivel && (
        <ConfirmActionModal
          titulo={`Mudar o nível de ${alvoNivel.row.nome || alvoNivel.row.email || 'membro'}?`}
          descricao="O nível define o que esta pessoa pode fazer na área interna. A mudança passa a valer no pedido seguinte, porque a autorização é relida do papel gravado, não de uma sessão antiga. A própria conta e o último superadmin ficam de fora — o servidor recusa ambos."
          motivoObrigatorio
          confirmLabel="Mudar nível"
          tom={alvoNivel.row.role === 'superadmin' ? 'danger' : 'primary'}
          pending={pendingNivel}
          erro={erroNivel}
          resumo={
            <>
              <LinhaResumo rotulo="Membro">{alvoNivel.row.nome || alvoNivel.row.email}</LinhaResumo>
              <LinhaResumo rotulo="Nível">
                {alvoNivel.row.rotulo} → {ROLE_LABELS[alvoNivel.novo]}
              </LinhaResumo>
              <LinhaResumo rotulo="Trilha">team.manage, com o motivo</LinhaResumo>
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
          onCancel={() => setAlvoNivel(null)}
          onConfirm={mudarNivel}
        />
      )}
    </>
  )
}
