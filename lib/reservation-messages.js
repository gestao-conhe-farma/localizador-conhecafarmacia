/**
 * Templates de mensagem WhatsApp por estado da reserva.
 *
 * O portal não envia mensagens — prepara-as. O atendente toca no link
 * wa.me e a mensagem certa sai pronta no WhatsApp da própria farmácia.
 * Isto vive em lib (não no Server Action) porque a página de
 * acompanhamento público também precisa dos textos.
 *
 * Regras dos textos: curto (SMS/WA corta ~4096 chars), sem jargão do
 * sistema, nome da farmácia sempre presente, e a recusa nunca deixa o
 * cliente sem caminho — leva sempre ao Localizador.
 */

// Em dev o URL não existe em .env — derivamos do VERCEL_URL ou caímos
// para localhost para os links wa.me continuarem a apontar ao site certo.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '') ||
  'http://localhost:3000'

/** Link do Localizador pré-preenchido com o medicamento. */
function searchUrl(drugName) {
  return `${SITE_URL}/pesquisa?q=${encodeURIComponent(drugName || '')}`
}

/** Link de acompanhamento da reserva. */
export function trackingUrl(reservationId) {
  return `${SITE_URL}/reserva/${reservationId}`
}

/**
 * Descrição legível do que foi reservado: "2 × lâmina" ou
 * "1 caixa (3 lâminas)" — com a opção (0012) quando existe.
 */
function whatWasReserved(r) {
  const qtd = r.confirmed_quantity ?? r.quantity ?? 1
  if (!r.saleUnit) return `${qtd} unidade${qtd !== 1 ? 's' : ''}`
  const unit = r.saleUnit
  if ((r.salePack ?? 1) > 1) {
    return `${qtd} ${unit}${qtd !== 1 ? 's' : ''} (cada uma com ${r.salePack} ${r.saleBaseUnit || 'un.'})`
  }
  return `${qtd} ${unit}${qtd !== 1 && !unit.endsWith('s') ? 's' : ''}`
}

/**
 * Origem/marca (0013) — "de Ben-u-ron, origem Portugal": a origem pesa
 * na decisão do cliente angolano, e o nome da marca confirma que é a
 * apresentação certa. Opcional: reservas de itens sem origem ficam
 * como estavam.
 */
function originLine(r) {
  const parts = []
  if (r.brand) parts.push(`de ${r.brand}`)
  if (r.origin) parts.push(`origem ${r.origin}`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

const fmtKz = (n) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n) + ' Kz'

/**
 * Valor estimado da reserva (0012): quantidade × preço da opção.
 * Só faz sentido com opção de venda com preço — legado fica sem
 * montante (não há de onde vir um valor fiável). Linha com a ressalva
 * do balcão: o Localizador informa, não factura.
 *
 * @returns {string|null} "≈ 300 Kz (a confirmar no balcão)" | null
 */
function estimateLine(r) {
  if (r.saleUnitPrice == null) return null
  const qtd = r.confirmed_quantity ?? r.quantity
  if (qtd == null) return null
  const total = Math.round(qtd * Number(r.saleUnitPrice) * 100) / 100
  return `≈ ${fmtKz(total)} (a confirmar no balcão)`
}

/**
 * Mensagem por estado.
 *
 * @param {object} r — linha da reserva (id, requester_name, quantity,
 *   confirmed_quantity, drugName, pharmacyName, reason, saleUnit, salePack,
 *   saleBaseUnit, saleUnitPrice)
 * @returns {{ text: string } | null} null = estado sem mensagem
 *   (concluida: o levantamento já aconteceu, nada a dizer).
 */
export function buildReservationMessage(r) {
  const nome = (r.requester_name || '').split(/\s+/)[0] || 'cliente'
  const qtdPedida = r.quantity ?? 1
  const qtdConfirmada = r.confirmed_quantity ?? qtdPedida
  const parcial = qtdConfirmada !== qtdPedida
  const oQue = whatWasReserved(r)
  const valor = estimateLine(r)

  switch (r.status) {
    case 'confirmada': {
      const ajuste = parcial
        ? `⚠️ Nota: temos ${qtdConfirmada} de ${qtdPedida} que pediu — as restantes ainda não chegaram.`
        : ''
      return {
        text: [
          `Olá, ${nome}! Boa notícia: a sua reserva de ${r.drugName} (${oQue}${originLine(r)}) na ${r.pharmacyName} está confirmada. ✅`,
          ajuste,
          valor,
          `Guarde este link para acompanhar: ${trackingUrl(r.id)}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      }
    }

    case 'pronta':
      return {
        text: [
          `Olá, ${nome}! A sua reserva de ${r.drugName} (${oQue}${originLine(r)}) na ${r.pharmacyName} já está pronta para levantamento. 🏃`,
          valor,
          `Esperamos por si! Acompanhe aqui: ${trackingUrl(r.id)}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      }

    case 'recusada': {
      const motivos = {
        sem_stock: 'de momento não temos este medicamento em stock',
        zona: 'não conseguimos atender a sua zona de levantamento',
        outro: 'não vamos poder atender esta reserva',
      }
      // Detalhe escrito pelo atendente na recusa "outro motivo"
      // ("outro:<texto>") — a explicação entra na mensagem, sempre que
      // exista: o cliente merece o porquê, não um "não" seco.
      const detail = String(r.reason || '')
        .split(':')
        .slice(1)
        .join(':')
        .trim()
      const motivo = motivos[r.reason?.split(':')[0]] || motivos.outro
      return {
        text: [
          `Olá, ${nome}! Infelizmente a sua reserva de ${r.drugName} na ${r.pharmacyName} não poderá ser atendida: ${motivo}.`,
          detail ? `Nota da farmácia: ${detail}.` : null,
          `Pode procurar noutras farmácias aqui: ${searchUrl(r.drugName)}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      }
    }

    case 'expirada':
      return {
        text: [
          `Olá, ${nome}! A sua reserva de ${r.drugName} na ${r.pharmacyName} expirou sem resposta (o prazo era de 72 horas).`,
          `Ainda tem interesse? Fale connosco ou pesquise aqui: ${searchUrl(r.drugName)}`,
        ].join('\n\n'),
      }

    default:
      return null
  }
}

/** Link wa.me completo (o telefone vai limpo, só dígitos). */
export function waLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits || !message) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
