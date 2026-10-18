'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setPharmacyActive, setPharmacyVerified } from '@/lib/actions/platform-pharmacies'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import PharmacyForm from '@/components/interno/PharmacyForm'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * Acções do cabeçalho da ficha (Task 5.2): Editar, Verificar e
 * Activar/Desactivar.
 *
 * Duas regras que este componente respeita e não decide:
 *
 *   • o que aparece é o que a matriz deixa (`acoes` vem pronto do
 *     servidor) — mas a autorização a sério volta a acontecer na Server
 *     Action, que é quem assina o que fica na trilha;
 *   • as acções sensíveis pedem o SEGUNDO FACTOR, e quem tem a palavra
 *     final é o `aal2` da sessão no servidor. Se a sessão só tem senha, o
 *     diálogo diz isso ANTES de a pessoa escrever o motivo — uma recusa
 *     anunciada é melhor do que uma recusa depois do trabalho feito.
 */
const MENSAGENS = {
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite esta acção.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  CONTA_SUSPENSA:
    'Esta conta está suspensa. Reponha o acesso no bloco «Contas da farmácia» — activar a farmácia sozinha não devolve o portal.',
  // A base de dados não confirmou a gravação (trigger, permissão, corrida):
  // dizer «feito» quando não ficou feito era o erro que esta área não pode
  // ter — quem desactiva uma farmácia tem de saber que ela ficou mesmo
  // fora do Localizador.
  SEM_EFEITO:
    'A alteração não chegou a ficar gravada. Actualize a página para ver o estado actual e tente de novo.',
  ID_INVALIDO: 'Pedido inválido.',
  FALHA: 'Não foi possível concluir a acção. Tente de novo.',
}

export default function PharmacyActions({ id, nome, active, verified, acoes, valores }) {
  const router = useRouter()
  const [modal, setModal] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, start] = useTransition()

  const correr = (fn) =>
    start(async () => {
      setErro(null)
      setAviso(null)
      try {
        const r = await fn()
        if (r?.ok) {
          setModal(null)
          router.refresh()
          if (r.mudou === 0) setAviso('Não havia nada para mudar.')
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  const pedeMfa = !acoes.mfa2

  return (
    <>
      {acoes.editar && (
        <button
          type="button"
          className="interno-btn interno-btn--ghost"
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('editar')
          }}
        >
          Editar ficha
        </button>
      )}

      {acoes.verificar && (
        <button
          type="button"
          className="interno-btn interno-btn--ghost"
          disabled={pending}
          onClick={() => correr(() => setPharmacyVerified(id, !verified))}
        >
          {verified ? 'Retirar selo' : 'Dar selo de verificada'}
        </button>
      )}

      {acoes.estado && (
        <button
          type="button"
          className={
            active ? 'interno-btn interno-btn--danger' : 'interno-btn interno-btn--primary'
          }
          disabled={pending}
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('estado')
          }}
        >
          {active ? 'Desactivar farmácia' : 'Activar farmácia'}
        </button>
      )}

      {/* O erro do servidor aparece DENTRO do diálogo quando há diálogo
          aberto — mostrar o mesmo aviso duas vezes (no cabeçalho e no
          modal) faz parecer que houve dois erros. */}
      {erro && !modal && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
      {aviso && !modal && <Notice tone="ok">{aviso}</Notice>}

      {modal === 'editar' && (
        <PharmacyForm id={id} valores={valores} onClose={() => setModal(null)} />
      )}

      {modal === 'estado' && active && (
        <ConfirmActionModal
          titulo={`Desactivar ${nome}?`}
          descricao="A farmácia sai do Localizador e o stock dela deixa de aparecer na pesquisa. O portal da farmácia corta o acesso no pedido seguinte. Nada é apagado: o stock, as reservas e as contas ficam à espera de uma reactivação."
          motivoObrigatorio
          confirmLabel="Desactivar"
          tom="danger"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Estado">Activa → Inactiva</LinhaResumo>
              <LinhaResumo rotulo="Directório">
                {verified ? 'sai com selo de verificada' : 'sai do directório'}
              </LinhaResumo>
              <LinhaResumo rotulo="Plano">mantém-se (nada desce automaticamente)</LinhaResumo>
            </>
          }
          aviso={
            pedeMfa ? (
              <Notice tone="warn">
                A sua sessão só tem senha. O servidor vai recusar esta acção com
                <b> MFA_NECESSARIO</b> até confirmar o código do autenticador — saia e volte a
                entrar.
              </Notice>
            ) : null
          }
          onCancel={() => setModal(null)}
          onConfirm={(motivo) => correr(() => setPharmacyActive(id, false, motivo))}
        />
      )}

      {modal === 'estado' && !active && (
        <ConfirmActionModal
          titulo={`Activar ${nome}?`}
          descricao="A farmácia volta ao Localizador e o stock que já tinha volta a ser servido aos clientes. O portal da farmácia volta a aceitar sessões."
          confirmLabel="Activar"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Estado">Inactiva → Activa</LinhaResumo>
              <LinhaResumo rotulo="Selo">
                {verified ? 'mantém o selo' : 'continua sem selo'}
              </LinhaResumo>
            </>
          }
          onCancel={() => setModal(null)}
          onConfirm={() => correr(() => setPharmacyActive(id, true))}
        />
      )}
    </>
  )
}
