'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revokePharmacyInvite } from '@/lib/actions/platform-pharmacies'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * «Revogar convite» na linha de uma conta da ficha (Task 6.3 Step 2,
 * `account.revoke`).
 *
 * O caminho é para o convite que NUNCA foi aceite e já não serve — morada
 * errada ou farmácia desistida. Reenviar só emitia outro link para a mesma
 * conta; revogar apaga o `user` do Auth (e a linha de `admin_users` cai em
 * cascata), que é o único gesto que faz o convite deixar de existir.
 *
 * O componente só evita oferecer o botão onde ele não faz sentido
 * (`conviteAceite` já é um facto do servidor). Quem decide a sério é a
 * Server Action: relê a conta, confirma que é desta farmácia e recusa
 * `CONVITE_JA_ACEITE` quando a pessoa já entrou — nesse caso a conta tem
 * senha e sessões, e o caminho é suspender, não apagar.
 *
 * O resultado aparece no topo da secção «Contas» (via `?revogado=`), e não
 * na linha: a linha deixa de existir quando o `user` é apagado, por isso um
 * aviso dentro dela desaparecia com o `router.refresh()`. É também o único
 * sítio onde o aviso de trilha falhada pode ficar visível (`trilha=0`).
 */
const MENSAGENS = {
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite revogar convites.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  CONVITE_JA_ACEITE:
    'Esta conta já aceitou o convite e entra no portal. Já não é um convite pendente: para cortar o acesso, o caminho é suspender a conta — nunca apagar.',
  CONTA_NAO_ENCONTRADA:
    'A conta já não está nesta farmácia. Actualize a página para ver as contas actuais.',
  ID_INVALIDO: 'Pedido inválido.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  FALHA: 'Não foi possível revogar o convite. Tente de novo.',
}

export default function PharmacyInviteRevoke({
  pharmacyId,
  pharmacyName,
  userId,
  email,
  nome,
  pendente,
  pode,
  mfa2,
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState(null)
  const [pending, start] = useTransition()

  if (!pode || !pendente || !email) return null

  const revogar = (motivo) =>
    start(async () => {
      setErro(null)
      try {
        const r = await revokePharmacyInvite({ pharmacyId, userId, motivo })
        if (r?.ok) {
          setAberto(false)
          // `replace` e não `push`: o aviso não deve ficar no histórico como
          // se fosse uma página que a pessoa visitou.
          const q = new URLSearchParams({ revogado: r.email || email })
          if (r.auditado === false) q.set('trilha', '0')
          router.replace(`/interno/farmacias/${pharmacyId}?${q.toString()}`)
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  return (
    <>
      <button
        type="button"
        className="interno-btn interno-btn--ghost interno-btn--small"
        disabled={pending}
        onClick={() => {
          setErro(null)
          setAberto(true)
        }}
      >
        Revogar convite
      </button>

      {aberto && (
        <ConfirmActionModal
          titulo={`Revogar o convite a ${nome || email}?`}
          descricao={
            <>
              Apaga a conta por confirmar <b>{email}</b> e a linha dela nesta farmácia. O link que
              saiu por e-mail deixa de abrir. Nada disto se desfaz: se a farmácia voltar atrás, é
              preciso convidar outra vez. Esta conta nunca entrou no portal — a farmácia pode ficar
              sem nenhum acesso até ao convite seguinte.
            </>
          }
          motivoObrigatorio
          confirmLabel="Revogar convite"
          tom="danger"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Farmácia">{pharmacyName}</LinhaResumo>
              <LinhaResumo rotulo="Conta">{email}</LinhaResumo>
              <LinhaResumo rotulo="Convite">Pendente → apagado</LinhaResumo>
              <LinhaResumo rotulo="Conta Auth">apagada (admin_users em cascata)</LinhaResumo>
              <LinhaResumo rotulo="Trilha">account.revoke, com o motivo</LinhaResumo>
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
          onCancel={() => setAberto(false)}
          onConfirm={(motivo) => revogar(motivo)}
        />
      )}
    </>
  )
}
