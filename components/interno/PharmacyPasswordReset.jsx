'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendPharmacyPasswordReset } from '@/lib/actions/platform-pharmacies'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * «Repor senha» na linha de uma conta já aceite (`account.reset_password`).
 *
 * O par do «Reenviar convite»: quem ainda não aceitou recebe um convite;
 * quem já entra e perdeu a senha recebe um link de recuperação. Só
 * aparece nas contas confirmadas — no convite pendente o caminho é o
 * outro, e o servidor recusa com `CONVITE_PENDENTE` se o estado mudou
 * entretanto.
 *
 * A senha nunca é escolhida por nós: o servidor gera o token e entrega o
 * link ao e-mail da conta; esta célula só pede o motivo (que fica na
 * trilha) e mostra o resultado.
 */
const MENSAGENS = {
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite repor senhas.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. Saia e volte a entrar, confirmando o código do autenticador.',
  CONTA_NAO_ENCONTRADA:
    'A conta já não está nesta farmácia. Actualize a página para ver as contas actuais.',
  CONVITE_PENDENTE:
    'Esta conta ainda não aceitou o convite. Use «Reenviar convite» — a recuperação é para quem já entrou.',
  CONTA_SUSPENSA:
    'A conta está suspensa. Repor o acesso é outra operação: use «Repor acesso» no topo da ficha.',
  EMAIL_NAO_CONFIGURADO:
    'O envio de e-mails ainda não está configurado neste ambiente: faltam RESEND_API_KEY e/ou RESEND_FROM. Nada foi enviado.',
  EMAIL_NAO_AUTORIZADO:
    'O Resend recusou a chave do projecto (401/403). Corrigida a chave, tente de novo.',
  EMAIL_RECUSADO:
    'O Resend recusou o envio. O mais provável é o domínio de RESEND_FROM ainda não estar verificado. O link não saiu.',
  EMAIL_LIMITE:
    'O Resend ou o Supabase travou o pedido por excesso de tentativas (429). Espere um pouco e repita.',
  EMAIL_FALHOU:
    'O Resend não respondeu a tempo. O link pode não ter saído — repita dentro de minutos.',
  LINK_FALHOU: 'O link de reposição não foi gerado. Nada foi enviado; tente de novo.',
  ID_INVALIDO: 'Pedido inválido.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  FALHA: 'Não foi possível enviar a reposição de senha. Tente de novo.',
}

export default function PharmacyPasswordReset({
  pharmacyId,
  pharmacyName,
  userId,
  email,
  nome,
  confirmada,
  pode,
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  if (!pode || !confirmada || !email) return null

  const enviar = (motivo) =>
    start(async () => {
      setErro(null)
      try {
        const r = await sendPharmacyPasswordReset({ pharmacyId, userId, motivo })
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
      {feito && !aberto && (
        <span className="interno-hint" role="status">
          Link enviado para {feito}.
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
        Repor senha
      </button>

      {aberto && (
        <ConfirmActionModal
          titulo={`Repor a senha de ${nome || email}?`}
          descricao={
            <>
              Sai um e-mail para <b>{email}</b> com um link para escolher uma senha nova. Nós não
              vemos nem escolhemos a senha: o link vale uma hora e só pode ser usado uma vez. A
              senha actual continua a valer até a pessoa guardar a nova.
            </>
          }
          motivoObrigatorio
          confirmLabel="Enviar link de reposição"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Farmácia">{pharmacyName}</LinhaResumo>
              <LinhaResumo rotulo="Conta">{email}</LinhaResumo>
              <LinhaResumo rotulo="Estado">conta confirmada → link de recuperação</LinhaResumo>
              <LinhaResumo rotulo="Trilha">account.reset_password, com o motivo</LinhaResumo>
            </>
          }
          onCancel={() => setAberto(false)}
          onConfirm={(motivo) => enviar(motivo)}
        />
      )}
    </>
  )
}
