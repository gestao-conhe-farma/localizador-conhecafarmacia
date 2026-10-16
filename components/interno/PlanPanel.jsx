'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  changePlan,
  resumePlan,
  startGrace,
  startTrial,
  suspendForBilling,
} from '@/lib/actions/platform-plans'
import PlanActionModal from '@/components/interno/PlanActionModal'
import { mensagemPlano } from '@/components/interno/planos-erros'
import Notice from '@/components/ui/Notice'
import { dataCurta } from '@/components/interno/formatos'

/**
 * Acções de plano na ficha da farmácia (Task 7.2 Step 2).
 *
 * Duas decisões que valem a pena nomear:
 *
 *   • uma farmácia SEM plano não se resolve num diálogo — o botão é um
 *     LINK para o ecrã do primeiro plano (`/interno/planos/primeiro-plano/
 *     [id]`), que é o único caminho que cria a linha da 0028. É o caminho
 *     da farmácia recém-criada, e por isso tem ecrã próprio;
 *   • o que aparece é o que a matriz permite (`acoes` vem pronto do
 *     servidor), mas quem decide é a Server Action, que volta a autorizar,
 *     exige `aal2` e motivo, e assina o que fica na trilha.
 */

export default function PlanPanel({ id, nome, plano, planos = [], acoes = {}, notas = null }) {
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
        setErro(mensagemPlano(r?.error))
      } catch {
        setErro(mensagemPlano('FALHA'))
      }
    })

  const suspenso = plano?.status === 'suspenso'
  const temPlano = plano?.temPlano === true
  // Prazo terminado (experiência ou graça fora do prazo): a farmácia JÁ está
  // no plano de entrada e nada foi apagado — o que ela precisa é de um
  // caminho de volta, e é por isso que «Retomar o plano» aparece aqui e
  // «Iniciar experiência» reaparece (com um prazo novo).
  const vencido = plano?.expirado === true

  return (
    <div className="interno-plan-acts">
      {vencido && (
        <Notice tone="warn">
          O {plano.status === 'graca' ? 'período de graça' : 'período de experiência'} terminou a{' '}
          <b>{dataCurta(plano.fimEm)}</b> e desde então a farmácia está no plano de entrada — o
          plano negociado ficou guardado e nada se apagou. <b>Retomar o plano</b> põe-no em vigor
          outra vez; <b>Iniciar experiência</b> dá-lhe um prazo novo.
        </Notice>
      )}

      {/* Uma farmácia recém-criada não tem plano: o caminho é o ecrã do
          primeiro plano, não um diálogo. */}
      {!temPlano && acoes.atribuir && (
        <Link
          href={`/interno/planos/primeiro-plano/${id}`}
          className="interno-btn interno-btn--primary"
        >
          Atribuir o primeiro plano
        </Link>
      )}

      {temPlano && acoes.mudar && (
        <button
          type="button"
          className="interno-btn interno-btn--primary"
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('mudar')
          }}
        >
          Mudar de plano
        </button>
      )}

      {temPlano && acoes.trial && (plano.status !== 'trial' || vencido) && (
        <button
          type="button"
          className="interno-btn interno-btn--ghost"
          disabled={pending}
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('trial')
          }}
        >
          {vencido ? 'Dar experiência nova' : 'Iniciar experiência'}
        </button>
      )}

      {temPlano && acoes.graca && plano.status !== 'graca' && (
        <button
          type="button"
          className="interno-btn interno-btn--ghost"
          disabled={pending}
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('graca')
          }}
        >
          Dar graça
        </button>
      )}

      {temPlano && (suspenso || vencido) && acoes.retomar && (
        <button
          type="button"
          className="interno-btn interno-btn--primary"
          disabled={pending}
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('retomar')
          }}
        >
          Retomar plano
        </button>
      )}

      {temPlano && !suspenso && acoes.suspender && (
        <button
          type="button"
          className="interno-btn interno-btn--danger"
          disabled={pending}
          onClick={() => {
            setErro(null)
            setAviso(null)
            setModal('suspender')
          }}
        >
          Suspender por pagamento
        </button>
      )}

      {erro && !modal && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}
      {aviso && !modal && <Notice tone="ok">{aviso}</Notice>}

      {modal === 'mudar' && (
        <PlanActionModal
          modo="mudar"
          planoActual={plano}
          planos={planos}
          notasActuais={notas}
          pending={pending}
          erro={erro}
          mfa2={acoes.mfa2}
          onCancel={() => setModal(null)}
          onConfirm={({ planCode, notas: n, motivo }) =>
            correr(() => changePlan({ pharmacyId: id, planCode, notas: n, motivo }))
          }
        />
      )}

      {modal === 'trial' && (
        <PlanActionModal
          modo="trial"
          planoActual={plano}
          planos={planos}
          pending={pending}
          erro={erro}
          mfa2={acoes.mfa2}
          onCancel={() => setModal(null)}
          onConfirm={({ planCode, dias, motivo }) =>
            correr(() => startTrial({ pharmacyId: id, planCode, dias, motivo }))
          }
        />
      )}

      {modal === 'graca' && (
        <PlanActionModal
          modo="graca"
          planoActual={plano}
          planos={planos}
          pending={pending}
          erro={erro}
          mfa2={acoes.mfa2}
          onCancel={() => setModal(null)}
          onConfirm={({ dias, motivo }) =>
            correr(() => startGrace({ pharmacyId: id, dias, motivo }))
          }
        />
      )}

      {modal === 'suspender' && (
        <PlanActionModal
          modo="suspender"
          planoActual={plano}
          planos={planos}
          pending={pending}
          erro={erro}
          mfa2={acoes.mfa2}
          onCancel={() => setModal(null)}
          onConfirm={({ motivo }) => correr(() => suspendForBilling({ pharmacyId: id, motivo }))}
        />
      )}

      {modal === 'retomar' && (
        <PlanActionModal
          modo="retomar"
          planoActual={plano}
          planos={planos}
          pending={pending}
          erro={erro}
          mfa2={acoes.mfa2}
          onCancel={() => setModal(null)}
          onConfirm={({ motivo }) => correr(() => resumePlan({ pharmacyId: id, motivo }))}
        />
      )}

      <p className="interno-hint">
        {temPlano
          ? 'Cada alteração de plano fica na trilha com o motivo e o antes/depois. Nada se apaga: uma suspensão é reversível e o histórico fica.'
          : `${nome} ainda não tem plano atribuído. Enquanto não tiver, o portal dela funciona no plano de entrada.`}
      </p>
    </div>
  )
}
