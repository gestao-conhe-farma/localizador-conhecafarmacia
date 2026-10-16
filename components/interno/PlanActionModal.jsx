'use client'

import { useEffect, useState } from 'react'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'
import { preco, prazo, textoPlano } from '@/components/interno/formatos'

/**
 * Diálogo das acções de plano (Task 7.2 Step 2) — um só componente para
 * *mudar*, *experiência*, *graça*, *suspender* e *retomar*.
 *
 * Porque um só: as cinco partilham a mesma anatomia (o que vai acontecer, o
 * antes/depois, motivo obrigatório) e diferem em dois ou três campos. Cinco
 * componentes quase iguais é a maneira mais rápida de a quinta esquecer o
 * motivo ou o antes/depois.
 *
 * O *primeiro plano* não está aqui: uma farmácia sem plano tem um ecrã
 * próprio (`/interno/planos/primeiro-plano/[id]`), porque é o único caminho
 * que CRIA a linha da 0028 — e um ecrã inteiro diz isso melhor do que um
 * diálogo.
 *
 * O motivo não é decoração: é o que fica em `platform_audit_log.reason` e o
 * que responde, meses depois, a «porque é que esta farmácia desceu de
 * plano?». O servidor recusa a acção sem ele (`MOTIVO_OBRIGATORIO`), mesmo
 * que alguém contorne este ecrã.
 */

const CONFIG = {
  mudar: {
    titulo: 'Mudar de plano',
    descricao:
      'O plano novo entra em vigor no pedido seguinte do portal. O estado (experiência, graça, suspensão) não muda: cada acção responde por uma coisa só. Uma descida nunca apaga nada — o que excede o limite fica inerte.',
    // Com o prazo terminado, a farmácia está no plano de entrada: mudar o
    // plano negociado não a faz subir sozinha, e é isso que tem de ficar
    // dito — senão parece que a acção não pegou.
    descricaoExpirado:
      'O plano negociado passa a ser este — mas o prazo da experiência terminou, e enquanto ele não for reposto a farmácia continua no plano de entrada. Para a pôr já no plano: «Retomar o plano» (fica activo desde agora) ou «Dar experiência nova».',
    confirmar: 'Mudar plano',
    tom: 'primary',
    comPlano: true,
    comNotas: true,
  },
  trial: {
    titulo: 'Iniciar período de experiência',
    descricao:
      'Acesso completo ao plano escolhido durante o prazo, sem pagamento. Acabado o prazo sem decisão, a farmácia volta ao plano de entrada — nada se apaga e o histórico fica.',
    confirmar: 'Iniciar experiência',
    tom: 'primary',
    comPlano: true,
    comPrazo: 'Fim da experiência',
    prazoOmissao: 14,
  },
  graca: {
    titulo: 'Dar período de graça',
    descricao:
      'Para pagamento atrasado: durante a graça NADA se corta — a farmácia continua com tudo o que o plano dela dá. É tempo dado, e fica registado que foi dado.',
    confirmar: 'Dar graça',
    tom: 'primary',
    comPrazo: 'Fim da graça',
    prazoOmissao: 15,
  },
  suspender: {
    titulo: 'Suspender por pagamento',
    descricao:
      'Corte por incumprimento. A farmácia fica com o plano de entrada: continua com conta, stock e histórico, e perde as funcionalidades do plano pago. Ninguém é desactivado nem apagado.',
    confirmar: 'Suspender',
    tom: 'danger',
  },
  retomar: {
    titulo: 'Retomar o plano',
    descricao:
      'Pagamento regularizado: o plano que estava guardado volta a estar em vigor, com os limites dele. Os prazos antigos são limpos (já passaram).',
    descricaoExpirado:
      'O prazo terminou e a farmácia voltou ao plano de entrada (nada se apagou). Retomar põe o plano que estava guardado outra vez em vigor, activo desde agora, com os limites dele — e limpa os prazos antigos.',
    confirmar: 'Retomar',
    tom: 'primary',
  },
}

export default function PlanActionModal({
  modo,
  planoActual,
  planos = [],
  notasActuais = null,
  pending = false,
  erro = null,
  mfa2 = true,
  onCancel,
  onConfirm,
}) {
  const cfg = CONFIG[modo] || CONFIG.mudar
  const descricao =
    planoActual?.expirado && cfg.descricaoExpirado ? cfg.descricaoExpirado : cfg.descricao
  const [planCode, setPlanCode] = useState(planoActual?.planCode || planos[0]?.code || '')
  const [dias, setDias] = useState(String(cfg.prazoOmissao ?? 14))
  const [notas, setNotas] = useState(notasActuais || '')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCancel, pending])

  const faltaMotivo = motivo.trim().length < 3
  const diasNum = Number(dias)
  const prazoInvalido = cfg.comPrazo && (!Number.isInteger(diasNum) || diasNum < 1 || diasNum > 365)

  const escolhido = planos.find((p) => p.code === planCode) || null
  const vaiPara = planoActual?.temPlano ? textoPlano(planoActual) : 'Sem plano'

  return (
    <div
      className="interno-modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
    >
      <div className="interno-modal" role="dialog" aria-modal="true" aria-label={cfg.titulo}>
        <div className="interno-modal-head">
          <span className="interno-modal-title">{cfg.titulo}</span>
          <button
            type="button"
            className="interno-modal-close"
            onClick={onCancel}
            disabled={pending}
            aria-label="Fechar sem aplicar"
          >
            ×
          </button>
        </div>

        <div className="interno-modal-body">
          <p>{descricao}</p>

          <dl className="interno-dl">
            <LinhaResumo rotulo="Plano">
              {cfg.comPlano ? `${vaiPara} → ${escolhido?.nome || '—'}` : vaiPara}
            </LinhaResumo>
            {cfg.comPrazo && (
              <LinhaResumo rotulo={cfg.comPrazo}>
                {prazoInvalido
                  ? '—'
                  : prazo(new Date(Date.now() + diasNum * 86400000).toISOString())}
              </LinhaResumo>
            )}
            {modo === 'suspender' && (
              <LinhaResumo rotulo="Em vigor depois">
                Plano de entrada — conta, stock e histórico ficam
              </LinhaResumo>
            )}
            {modo === 'retomar' && (
              <LinhaResumo rotulo="Em vigor depois">
                {planoActual?.planCode
                  ? `${planoActual.planoNome} · Activo`
                  : 'Plano atribuído — activo'}
              </LinhaResumo>
            )}
          </dl>

          {cfg.comPlano && (
            <div>
              <span className="interno-label">Plano</span>
              <div className="interno-choices">
                {planos.map((p) => {
                  const on = p.code === planCode
                  return (
                    <label
                      key={p.code}
                      className={`interno-choice interno-choice--slim${on ? ' interno-choice--on' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`plano-${modo}`}
                        value={p.code}
                        checked={on}
                        disabled={pending}
                        onChange={() => setPlanCode(p.code)}
                      />
                      <span className="interno-choice-name">{p.nome}</span>
                      <span className="interno-choice-price">{preco(p.precoKz)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {cfg.comPrazo && (
            <label className="interno-label">
              Dias
              <input
                className="interno-input"
                type="number"
                min={1}
                max={365}
                value={dias}
                disabled={pending}
                onChange={(e) => setDias(e.target.value)}
              />
              <span className="interno-hint">
                {cfg.prazoOmissao} dias por omissão. O fim fica gravado e o ecrã dos planos avisa
                quando estiver a chegar.
              </span>
            </label>
          )}

          {cfg.comNotas && (
            <label className="interno-label">
              Notas internas (opcional)
              <textarea
                className="interno-textarea"
                rows={2}
                value={notas}
                maxLength={600}
                disabled={pending}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ex.: acordado por telefone com o dono; factura de Outubro em atraso…"
              />
              <span className="interno-hint">
                Notas de negociação: ficam guardadas no plano e a farmácia não as lê.
              </span>
            </label>
          )}

          <label className="interno-label">
            Motivo — fica na trilha de auditoria
            <textarea
              className="interno-textarea"
              rows={2}
              value={motivo}
              autoFocus
              disabled={pending}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: pedido do dono por telefone; experiência de 14 dias combinada no onboarding…"
            />
          </label>

          {!mfa2 && (
            <Notice tone="warn">
              A sua sessão só tem senha. O servidor vai recusar esta acção com <b>MFA_NECESSARIO</b>{' '}
              até confirmar o código do autenticador — saia e volte a entrar.
            </Notice>
          )}

          {erro && (
            <Notice tone="danger" role="alert">
              {erro}
            </Notice>
          )}
        </div>

        <div className="interno-modal-acts">
          <button
            type="button"
            className="interno-btn interno-btn--ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={
              cfg.tom === 'danger'
                ? 'interno-btn interno-btn--danger'
                : 'interno-btn interno-btn--primary'
            }
            onClick={() =>
              onConfirm({
                planCode: cfg.comPlano ? planCode : undefined,
                dias: cfg.comPrazo ? diasNum : undefined,
                notas: cfg.comNotas ? notas : undefined,
                motivo,
              })
            }
            disabled={pending || faltaMotivo || prazoInvalido}
          >
            {pending ? 'A aplicar…' : cfg.confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
