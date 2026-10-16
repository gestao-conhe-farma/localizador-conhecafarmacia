import Link from 'next/link'
import Notice from '@/components/ui/Notice'
import { getPharmacySession } from '@/lib/pharmacy-session'
import { getSubscription } from '@/lib/platform/subscriptions'
import { FEATURES, PLANS, PLANS_ENFORCED } from '@/lib/plans'
import { CONTACT_EMAIL, CONTACT_WHATSAPP } from '@/lib/constants'

/**
 * Portão de plano das páginas do portal (server component).
 *
 * Uso: `<PlanGate feature="movimentos"><MovementsPanel /></PlanGate>` no
 * page.js. A página não desaparece nem dá 404: explica o que é, em que
 * plano vive e como se desbloqueia — esconder uma função sem dizer porquê
 * é pior que dizê-lo (e a decisão de produto foi não vender de dentro do
 * directório público; aqui dentro é legítimo).
 *
 * Isto é a camada de UI. A autorização a sério está no servidor: as
 * Server Actions que alimentam estas páginas chamam `requireEntitlement`
 * antes de ler ou escrever, e devolvem `PLANO_INSUFICIENTE` a quem lhes
 * fale directamente.
 */
export default async function PlanGate({ feature, children }) {
  const spec = FEATURES[feature]
  // Chave inválida no código: não bloquear por engano — deixar passar e
  // deixar a leitura apanhar o erro.
  if (!spec) return children
  if (!PLANS_ENFORCED) return children

  const session = await getPharmacySession()
  // Sem sessão o layout já redireccionou; não bloquear duas vezes.
  if (!session) return children

  const sub = await getSubscription(session.pharmacy.id)
  if (sub.entitlements.features[feature] === true) return children

  return <PlanBlocked feature={feature} sub={sub} />
}

/**
 * O estado bloqueado, isolado: as páginas que já levam dados do servidor
 * (Desempenho, Equipa) lêem a subscrição uma vez, decidem com `allow()` e
 * devolvem isto ANTES de ir buscar os dados — em vez de fazer o trabalho
 * todo para depois o esconder.
 */
export function PlanBlocked({ feature, sub }) {
  const spec = FEATURES[feature]
  if (!spec) return null

  const planoNecessario = PLANS[spec.plano]?.nome || spec.plano
  const planoAtual = sub?.plan?.nome || 'Localizador'
  const suspenso = sub?.status === 'suspenso' || sub?.status === 'cancelado'
  // Prazo terminado: não é uma decisão contra a farmácia, é o fim do que
  // estava combinado — e o texto tem de dizer isso, porque é o que explica
  // «porque é que funcionava ontem e hoje não».
  const vencido = sub?.prazoVencido === true
  const prazoNome = sub?.status === 'graca' ? 'período de graça' : 'período de experiência'

  return (
    <div className="portal-page">
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">{spec.label}</h1>
          <p className="portal-page-sub">{spec.descricao}</p>
        </div>
      </div>

      <Notice tone="warn" large title={`Função do plano ${planoNecessario}`}>
        <p>
          {vencido
            ? `O ${prazoNome} terminou, por isso o portal voltou ao plano ${planoAtual}.`
            : suspenso
              ? `A sua subscrição está ${sub?.status === 'suspenso' ? 'suspensa' : 'cancelada'}, por isso o portal está no plano ${planoAtual}.`
              : `Esta parte do portal abre com o plano ${planoNecessario}. A farmácia está no plano ${planoAtual}.`}{' '}
          Nada do que já registou se perdeu — os dados continuam guardados e voltam a aparecer
          quando o plano mudar.
        </p>
        <p>
          Para tratar do plano fale com a equipa da Conheça Farmácia:{' '}
          <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>{' '}
          · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          O stock, as reservas e o Localizador continuam a funcionar normalmente:{' '}
          <Link href="/portal">voltar à visão geral</Link>.
        </p>
      </Notice>
    </div>
  )
}
