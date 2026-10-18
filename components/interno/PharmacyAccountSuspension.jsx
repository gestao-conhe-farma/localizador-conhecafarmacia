'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { suspendPharmacyAccount, unsuspendPharmacyAccount } from '@/lib/actions/platform-pharmacies'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'
import { dataHora } from '@/components/interno/formatos'
import { plural } from '@/lib/texto'

/**
 * Suspensão da CONTA da farmácia (Task 5.3 Step 3), na ficha.
 *
 * A diferença para «Desactivar farmácia» é o que este componente tem de
 * tornar óbvio: desactivar tira a farmácia do Localizador; suspender a
 * conta corta o acesso por inteiro — ban nas contas Auth, farmácia
 * inactiva e perfis do balcão inactivos. Nada é apagado, e o mesmo botão
 * repõe o acesso com o estado que a suspensão encontrou.
 *
 * Como no resto das acções sensíveis, a UI só mostra o que a matriz deixa;
 * a decisão (permissão, `aal2` e motivo) volta a ser tomada no servidor.
 */
const MENSAGENS = {
  MFA_NECESSARIO:
    'Esta acção exige o segundo factor. A sua sessão só tem senha: termine a sessão e volte a entrar, confirmando o código do autenticador.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite esta acção.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  NAO_ENCONTRADA: 'Esta farmácia já não existe.',
  JA_SUSPENSA:
    'Esta conta já está suspensa. Actualize a página para ver o estado actual antes de tentar outra vez.',
  NAO_ESTA_SUSPENSA:
    'Esta conta já não está suspensa. Actualize a página para ver o estado actual.',
  VIA_PAGAMENTO:
    'A suspensão manual é do superadmin e do onboarding. O nível de facturação suspende pela via do pagamento, no painel do plano.',
  SEM_EFEITO:
    'A operação não chegou a ficar gravada por inteiro. Actualize a página para ver o estado actual e tente de novo.',
  ID_INVALIDO: 'Pedido inválido.',
  FALHA: 'Não foi possível concluir a acção. Tente de novo.',
}

export default function PharmacyAccountSuspension({
  id,
  nome,
  suspensao,
  contas,
  perfisActivos,
  farmaciaActiva,
  acoes,
}) {
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
          if (r.auditado === false) {
            setAviso(
              'A conta ficou alterada, mas a trilha de auditoria NÃO registou a operação. Avise quem mantém a área interna e registe o caso: a alteração é real e o motivo não ficou gravado.',
            )
          }
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  // Sem suspensão e sem permissão para suspender, não há nada a dizer.
  if (!suspensao && !acoes.suspender) return null

  const abrir = (qual) => {
    setErro(null)
    setAviso(null)
    setModal(qual)
  }

  return (
    <>
      {suspensao ? (
        <div className="interno-conta-suspensao">
          <div className="interno-conta-suspensao-info">
            <span>
              <span className="interno-pill interno-pill--off">Conta suspensa</span>{' '}
              <b>desde {dataHora(suspensao.quando)}</b>
            </span>
            <span>
              <b>Motivo:</b> {suspensao.motivo}
            </span>
            <span>
              {plural(
                suspensao.contasBanidas,
                'conta banida por esta suspensão',
                'contas banidas por esta suspensão',
              )}{' '}
              ·{' '}
              {plural(
                suspensao.perfisInactivos,
                'perfil do balcão desactivado',
                'perfis do balcão desactivados',
              )}
              {suspensao.por ? ` · por ${suspensao.por}` : ''}
            </span>
          </div>
          {acoes.repor && (
            <button
              type="button"
              className="interno-btn interno-btn--primary"
              disabled={pending}
              onClick={() => abrir('repor')}
            >
              Repor acesso
            </button>
          )}
        </div>
      ) : (
        <div className="interno-conta-suspensao">
          <div className="interno-conta-suspensao-info">
            <b>Conta e acesso</b>
            <span>
              Suspender corta o acesso por inteiro: ban nas contas, farmácia fora do Localizador e
              perfis do balcão inactivos. O stock, as reservas e o histórico ficam guardados.
            </span>
          </div>
          <button
            type="button"
            className="interno-btn interno-btn--danger"
            disabled={pending}
            onClick={() => abrir('suspender')}
          >
            Suspender conta
          </button>
        </div>
      )}

      {erro && !modal && (
        <div className="interno-box--pad">
          <Notice tone="danger" role="alert">
            {erro}
          </Notice>
        </div>
      )}
      {aviso && !modal && (
        <div className="interno-box--pad">
          <Notice tone="warn" role="alert">
            {aviso}
          </Notice>
        </div>
      )}

      {modal === 'suspender' && (
        <ConfirmActionModal
          titulo={`Suspender a conta de ${nome}?`}
          descricao="Corta o acesso da farmácia por inteiro: ban nas contas de acesso, farmácia inactiva (sai do Localizador) e perfis do balcão inactivos. Nada é apagado — o stock, as reservas e o histórico ficam à espera de uma reposição."
          motivoObrigatorio
          confirmLabel="Suspender conta"
          tom="danger"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Contas">
                {contas === 0
                  ? 'sem contas — nada a banir'
                  : `${plural(contas, 'conta', 'contas')} → banidas`}
              </LinhaResumo>
              <LinhaResumo rotulo="Portal">
                corta no pedido seguinte, incluindo sessões já emitidas
              </LinhaResumo>
              <LinhaResumo rotulo="Perfis do balcão">
                {perfisActivos > 0
                  ? `${plural(perfisActivos, 'activo', 'activos')} → inactivos`
                  : 'nenhum activo — mantém-se'}
              </LinhaResumo>
              <LinhaResumo rotulo="Farmácia">
                {farmaciaActiva
                  ? 'activa → inactiva (sai do Localizador)'
                  : 'já inactiva — mantém-se'}
              </LinhaResumo>
              <LinhaResumo rotulo="Plano">
                mantém-se (isto não é uma suspensão de plano)
              </LinhaResumo>
            </>
          }
          aviso={
            !acoes.mfa2 ? (
              <Notice tone="warn">
                A sua sessão só tem senha. O servidor vai recusar esta acção com
                <b> MFA_NECESSARIO</b> até confirmar o código do autenticador — saia e volte a
                entrar.
              </Notice>
            ) : null
          }
          onCancel={() => setModal(null)}
          onConfirm={(motivo) => correr(() => suspendPharmacyAccount({ pharmacyId: id, motivo }))}
        />
      )}

      {modal === 'repor' && suspensao && (
        <ConfirmActionModal
          titulo={`Repor o acesso de ${nome}?`}
          descricao="Levanta o ban das contas que esta suspensão baniu, reactiva a farmácia (se estava activa antes) e repõe apenas os perfis que estavam activos na altura. O motivo fica na trilha."
          motivoObrigatorio
          confirmLabel="Repor acesso"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Contas">
                {plural(suspensao.contasBanidas, 'conta desta suspensão', 'contas desta suspensão')}{' '}
                → sem ban
              </LinhaResumo>
              <LinhaResumo rotulo="Perfis do balcão">
                {plural(suspensao.perfisInactivos, 'perfil reposto', 'perfis repostos')}
              </LinhaResumo>
              <LinhaResumo rotulo="Farmácia">
                {suspensao.farmaciaEstavaActiva
                  ? 'volta a activa (estava activa antes)'
                  : 'mantém-se inactiva (já estava antes da suspensão)'}
              </LinhaResumo>
            </>
          }
          aviso={
            !acoes.mfa2 ? (
              <Notice tone="warn">
                A sua sessão só tem senha. O servidor vai recusar esta acção com
                <b> MFA_NECESSARIO</b> até confirmar o código do autenticador — saia e volte a
                entrar.
              </Notice>
            ) : null
          }
          onCancel={() => setModal(null)}
          onConfirm={(motivo) => correr(() => unsuspendPharmacyAccount({ pharmacyId: id, motivo }))}
        />
      )}
    </>
  )
}
