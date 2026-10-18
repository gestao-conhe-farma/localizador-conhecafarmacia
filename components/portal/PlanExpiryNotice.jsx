import Notice from '@/components/ui/Notice'
import { CONTACT_EMAIL, CONTACT_WHATSAPP } from '@/lib/constants'
import { planInfo } from '@/lib/plans'
import { DIAS_ALERTA, diasAte } from '@/lib/platform/subscriptions'

/**
 * Aviso de prazo do plano no portal — experiência ou período de graça a
 * terminar (ou já terminado), com os dias que faltam e o caminho para
 * retomar.
 *
 * Vive no layout, por cima de todas as páginas: o prazo é da FARMÁCIA e
 * não de uma secção, e quem está no stock no dia em que a experiência
 * acaba tem de o saber sem ir à procura. O servidor já leu a subscrição
 * (layout) e passa-a aqui — este componente não vai à base.
 *
 * Não aparece para planos activos nem para suspensões: uma suspensão é uma
 * decisão da equipa e explica-se no portão de cada função (PlanGate), com
 * o mesmo endereço de contacto. Aqui só entra o que tem DATA a chegar ao
 * fim. Falhar para o mínimo também aqui: sem data legível, o prazo conta
 * como terminado (`prazoVencido`) e o aviso diz «terminou» em vez de
 * inventar dias.
 */
export default function PlanExpiryNotice({ sub }) {
  if (!sub?.status || (sub.status !== 'trial' && sub.status !== 'graca')) return null

  const fimEm = sub.status === 'trial' ? sub.trialUntil : sub.graceUntil
  if (!fimEm) {
    // `trial`/`graca` sem data é um prazo sem fim — o `effectivePlanOf`
    // trata-o como terminado. Dizê-lo é melhor do que um aviso vazio.
    return <AvisoVencido sub={sub} />
  }

  const dias = diasAte(fimEm)
  if (dias === null || sub.prazoVencido) return <AvisoVencido sub={sub} />
  // `dias === 0` é «termina hoje» (menos de 24 h), não um prazo vencido.
  if (dias > DIAS_ALERTA) return null

  const planoNome = planInfo(sub.planCode).nome
  const eGraca = sub.status === 'graca'
  const quando = dataLonga(fimEm)
  const contagem =
    dias === 1 ? 'termina amanhã' : dias === 0 ? 'termina hoje' : `termina em ${dias} dias`

  return (
    <div className="portal-plan-alert">
      <Notice
        tone="warn"
        title={eGraca ? `Período de graça — ${contagem}` : `Experiência — ${contagem}`}
        role="status"
      >
        <p>
          {eGraca
            ? `O período de graça do plano ${planoNome} vai até ${quando}.`
            : `O plano ${planoNome} está em experiência até ${quando}.`}{' '}
          {eGraca
            ? 'Para manter tudo a funcionar depois dessa data, regularize com a equipa da Conheça Farmácia.'
            : 'Para continuar com o plano depois dessa data, fale com a equipa da Conheça Farmácia.'}{' '}
          <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>{' '}
          · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          Se o prazo terminar sem renovação, o portal volta ao plano Localizador. O stock, as
          reservas e tudo o que já registou ficam guardados — nada se apaga.
        </p>
      </Notice>
    </div>
  )
}

/**
 * O prazo já passou (ou não tem data legível). O texto diz o que está em
 * vigor HOJE e como retomar — «retomar» é uma conversa com a equipa, não
 * um botão: não há pagamento nem auto-serviço no portal, e inventar um
 * botão que não faz nada seria pior do que dizer a verdade.
 */
function AvisoVencido({ sub }) {
  const planoAtribuido = planInfo(sub.planCode).nome
  const planoAtual = sub.plan?.nome || planInfo(sub.effectivePlan).nome
  const eGraca = sub.status === 'graca'

  return (
    <div className="portal-plan-alert">
      <Notice
        tone="warn"
        title={
          eGraca
            ? 'Período de graça terminado — como retomar'
            : 'Experiência terminada — como retomar'
        }
        role="status"
      >
        <p>
          {eGraca
            ? `O período de graça do plano ${planoAtribuido} terminou e o portal está no plano ${planoAtual}.`
            : `A experiência do plano ${planoAtribuido} terminou e o portal está no plano ${planoAtual}.`}{' '}
          Nada do que registou se perdeu.
        </p>
        <p>
          Para retomar o plano, fale com a equipa da Conheça Farmácia:{' '}
          <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>{' '}
          · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Notice>
    </div>
  )
}

/** «25 de outubro» — a data do fim, no fuso de Luanda (o do utilizador). */
function dataLonga(iso) {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Luanda',
  })
}
