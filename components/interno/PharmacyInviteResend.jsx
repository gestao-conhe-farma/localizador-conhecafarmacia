'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resendPharmacyInvite } from '@/lib/actions/platform-pharmacies'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * «Reenviar convite» na linha de uma conta da ficha (Task 6.2, `account.resend`).
 *
 * Só aparece a quem a matriz deixa (`pode`) e só em contas com convite POR
 * ACEITAR (`conviteAceite === false`) — quem já entrou tem senha e o caminho
 * é a recuperação, não um convite novo. Quem decide a sério é o servidor:
 * esta acção relê o estado da conta antes de gerar seja o que for.
 *
 * O motivo não é um campo a mais: a matriz passou a exigi-lo nesta acção e
 * é ele que fica em `platform_audit_log.reason`. Sem isto, a pergunta «porque
 * é que esta farmácia recebeu três convites em dois dias?» não tinha
 * resposta na trilha.
 */
const MENSAGENS = {
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite reenviar convites.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. Saia e volte a entrar, confirmando o código do autenticador.',
  CONVITE_JA_ACEITE:
    'Esta conta já aceitou o convite e entra no portal. Se perdeu a senha, o caminho é a recuperação de senha — um convite novo não a resolve.',
  CONTA_NAO_ENCONTRADA:
    'A conta já não está nesta farmácia. Actualize a página para ver as contas actuais.',
  EMAIL_NAO_CONFIGURADO:
    'O envio de e-mails ainda não está configurado neste ambiente: faltam RESEND_API_KEY e/ou RESEND_FROM. Nada foi enviado.',
  EMAIL_NAO_AUTORIZADO:
    'O Resend recusou a chave do projecto (401/403). A RESEND_API_KEY está errada, foi revogada ou não tem permissão de envio. Corrigida a chave, tente de novo.',
  EMAIL_RECUSADO:
    'O Resend recusou o envio. O mais provável é o domínio de RESEND_FROM ainda não estar verificado no Resend (ou o endereço do dono ser inválido). O convite não saiu.',
  EMAIL_LIMITE:
    'O Resend travou o envio por excesso de pedidos (429) ou o Supabase recusou a geração do link. Espere um pouco e repita.',
  EMAIL_FALHOU:
    'O Resend não respondeu a tempo. O convite pode não ter saído — repita dentro de alguns minutos.',
  EMAIL_EM_USO:
    'O Supabase recusou gerar o link: já existe uma conta com este e-mail. Confirme se o convite anterior foi usado.',
  CONVITE_FALHOU: 'O link do convite não foi gerado. Nada foi enviado; tente de novo.',
  CONTA_NAO_LIGADA:
    'O e-mail pode ter saído mas a conta não ficou ligada à farmácia. Repita para ligar — não se cria uma segunda conta.',
  ID_INVALIDO: 'Pedido inválido.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  FALHA: 'Não foi possível reenviar o convite. Tente de novo.',
}

export default function PharmacyInviteResend({
  pharmacyId,
  pharmacyName,
  userId,
  email,
  nome,
  pendente,
  pode,
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  if (!pode || !pendente || !email) return null

  const enviar = (motivo) =>
    start(async () => {
      setErro(null)
      try {
        const r = await resendPharmacyInvite({ pharmacyId, userId, motivo })
        if (r?.ok) {
          setAberto(false)
          setFeito(r.email || email)
          router.refresh()
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  return (
    <>
      {/* A confirmação fica na própria célula, em texto secundário: um
          `Notice` aqui alargava a coluna «Acções» e empurrava a tabela toda.
          `interno-hint` (e não `interno-foot-sub`, que é branco translúcido
          para a sidebar escura) e `role="status"` para o leitor de ecrã. */}
      {feito && !aberto && (
        <span className="interno-hint" role="status">
          Reenviado para {feito}.
        </span>
      )}

      <button
        type="button"
        className="interno-btn interno-btn--ghost interno-btn--small"
        disabled={pending}
        onClick={() => {
          setErro(null)
          setAberto(true)
        }}
      >
        Reenviar convite
      </button>

      {aberto && (
        <ConfirmActionModal
          titulo={`Reenviar o convite a ${nome || email}?`}
          descricao={
            <>
              Sai um e-mail novo para <b>{email}</b> com um link para definir a senha. O convite
              anterior expirou ou não chegou — este substitui-o, sem apagar nada. O link vale uma
              hora.
            </>
          }
          motivoObrigatorio
          confirmLabel="Reenviar convite"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Farmácia">{pharmacyName}</LinhaResumo>
              <LinhaResumo rotulo="Conta">{email}</LinhaResumo>
              <LinhaResumo rotulo="Estado">Convite pendente → novo link</LinhaResumo>
              <LinhaResumo rotulo="Trilha">account.resend, com o motivo</LinhaResumo>
            </>
          }
          onCancel={() => setAberto(false)}
          onConfirm={(motivo) => enviar(motivo)}
        />
      )}
    </>
  )
}
