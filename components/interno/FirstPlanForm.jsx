'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { assignPlan } from '@/lib/actions/platform-plans'
import { mensagemPlano } from '@/components/interno/planos-erros'
import Notice from '@/components/ui/Notice'
import { preco } from '@/components/interno/formatos'

/**
 * PRIMEIRO PLANO de uma farmácia recém-criada (Task 7.1/7.2).
 *
 * É o formulário do ecrã `/interno/planos/primeiro-plano/[id]`: escolher o
 * plano, decidir entre EXPERIÊNCIA (com prazo) e ACTIVO (desde já), deixar
 * nota interna e escrever o motivo. A acção é `plan.assign` — a única que
 * cria a linha da 0028 — e por isso este ecrã existe à parte: quem chega
 * aqui está a fazer a primeira coisa que uma farmácia precisa de ter, e não
 * a mexer num plano que já existe.
 *
 * O catálogo vem do servidor (`lib/plans.js` via `getPrimeiroPlano`), já
 * com o que cada plano abre e os limites — o formulário não repete preços
 * nem listas de funcionalidades.
 *
 * Depois de gravar não se volta ao formulário: mostra-se o que ficou
 * atribuído e os dois sítios para onde ir a seguir (a ficha, os planos).
 */
export default function FirstPlanForm({ id, nome, planos = [], padroes = {}, mfa2 = true }) {
  const router = useRouter()
  const [planCode, setPlanCode] = useState(planos[0]?.code || '')
  const [modo, setModo] = useState('trial')
  const [dias, setDias] = useState(String(padroes.diasTrial ?? 14))
  const [notas, setNotas] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  const escolhido = planos.find((p) => p.code === planCode) || null
  const trial = modo === 'trial'
  const diasNum = Number(dias)
  const prazoInvalido = trial && (!Number.isInteger(diasNum) || diasNum < 1 || diasNum > 365)
  const faltaMotivo = motivo.trim().length < 3

  const submeter = (e) => {
    e.preventDefault()
    setErro(null)
    start(async () => {
      try {
        const r = await assignPlan({
          pharmacyId: id,
          planCode,
          modo,
          dias: trial ? diasNum : undefined,
          notas,
          motivo,
        })
        if (r?.ok) {
          setFeito(r.plano)
          router.refresh()
          return
        }
        setErro(mensagemPlano(r?.error))
      } catch {
        setErro(mensagemPlano('FALHA'))
      }
    })
  }

  if (feito) {
    return (
      <div className="interno-box interno-box--pad">
        <Notice tone="ok" role="status">
          Plano atribuído a <b>{nome}</b>: {feito.planoNome}
          {feito.status === 'trial'
            ? ` em experiência até ${new Date(feito.trialUntil).toLocaleDateString('pt-PT')}`
            : ' activo'}
          . Ficou registado na trilha com o motivo.
        </Notice>
        <div className="interno-form-acts">
          <Link href={`/interno/farmacias/${id}`} className="interno-btn interno-btn--primary">
            Abrir a ficha
          </Link>
          <Link href="/interno/planos" className="interno-btn interno-btn--ghost">
            Ver todos os planos
          </Link>
        </div>
        <p className="interno-hint">
          {feito.status === 'trial'
            ? 'A experiência está no ecrã dos planos com o fim em destaque. Acabado o prazo sem decisão, a farmácia volta ao plano de entrada.'
            : 'O plano está em vigor no portal da farmácia a partir do pedido seguinte.'}
        </p>
      </div>
    )
  }

  return (
    <form className="interno-form" onSubmit={submeter}>
      <div>
        <span className="interno-label">Plano</span>
        <div className="interno-choices">
          {planos.map((p) => {
            const on = p.code === planCode
            return (
              <label key={p.code} className={`interno-choice${on ? ' interno-choice--on' : ''}`}>
                <input
                  type="radio"
                  name="plano"
                  value={p.code}
                  checked={on}
                  disabled={pending}
                  onChange={() => setPlanCode(p.code)}
                />
                <span className="interno-choice-name">{p.nome}</span>
                <span className="interno-choice-price">{preco(p.precoKz)}</span>
                <span className="interno-hint">{p.descricao}</span>
                {p.funcionalidades.length > 0 && (
                  <ul className="interno-choice-list">
                    {p.funcionalidades.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                {p.limites.length > 0 && (
                  <span className="interno-choice-limits">
                    {p.limites.map((l) => `${l.rotulo}: ${l.valor}`).join(' · ')}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <span className="interno-hint">
          O plano de entrada é gratuito e é onde a farmácia fica se nada for decidido — a descida é
          sempre possível e nunca apaga dados.
        </span>
      </div>

      <div>
        <span className="interno-label">Como começa</span>
        <div className="interno-choices">
          <label
            className={`interno-choice interno-choice--slim${trial ? ' interno-choice--on' : ''}`}
          >
            <input
              type="radio"
              name="modo"
              value="trial"
              checked={trial}
              disabled={pending}
              onChange={() => setModo('trial')}
            />
            <span className="interno-choice-name">Período de experiência</span>
            <span className="interno-hint">
              Acesso completo com prazo ({padroes.diasTrial} dias por omissão)
            </span>
          </label>
          <label
            className={`interno-choice interno-choice--slim${!trial ? ' interno-choice--on' : ''}`}
          >
            <input
              type="radio"
              name="modo"
              value="activo"
              checked={!trial}
              disabled={pending}
              onChange={() => setModo('activo')}
            />
            <span className="interno-choice-name">Activo desde já</span>
            <span className="interno-hint">Sem prazo — a farmácia fica no plano escolhido</span>
          </label>
        </div>
      </div>

      {trial && (
        <label className="interno-label">
          Dias de experiência
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
            O fim fica gravado e o ecrã dos planos avisa quando estiver a chegar.
          </span>
        </label>
      )}

      <label className="interno-label">
        Notas internas (opcional)
        <textarea
          className="interno-textarea"
          rows={2}
          value={notas}
          maxLength={600}
          disabled={pending}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ex.: acordado no onboarding; facturação combinada com o dono…"
        />
        <span className="interno-hint">A farmácia não lê estas notas.</span>
      </label>

      <label className="interno-label">
        Motivo — fica na trilha de auditoria
        <textarea
          className="interno-textarea"
          rows={2}
          value={motivo}
          disabled={pending}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: farmácia criada hoje, entra em experiência de 14 dias combinada por telefone."
        />
      </label>

      {!mfa2 && (
        <Notice tone="warn">
          A sua sessão só tem senha. O servidor vai recusar esta acção com <b>MFA_NECESSARIO</b> até
          confirmar o código do autenticador — saia e volte a entrar.
        </Notice>
      )}

      {erro && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}

      <div className="interno-form-acts">
        <button
          type="submit"
          className="interno-btn interno-btn--primary"
          disabled={pending || prazoInvalido || faltaMotivo || !planCode}
        >
          {pending ? 'A atribuir…' : 'Atribuir o primeiro plano'}
        </button>
        <span className="interno-hint">
          {escolhido
            ? `Fica em «${escolhido.nome}»${trial ? ` em experiência por ${diasNum || '—'} dias` : ' activo'} e a alteração entra na trilha com o seu e-mail.`
            : 'Escolha um plano para continuar.'}
        </span>
      </div>
    </form>
  )
}
