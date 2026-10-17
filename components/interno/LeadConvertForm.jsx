'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { convertLead } from '@/lib/actions/leads'
import { mensagemLead } from '@/components/interno/leads-erros'
import Notice from '@/components/ui/Notice'
import LeadConvertResult from '@/components/interno/LeadConvertResult'
import { dataCurta } from '@/components/interno/formatos'

/**
 * CONVERTER UM LEAD (Task 5.3 Step 2) — o formulário do ecrã
 * `/interno/leads/converter/[id]`.
 *
 * O ecrã existe à parte, como o primeiro plano, porque a operação CRIA
 * três coisas ao mesmo tempo: uma farmácia no directório, uma conta de
 * dono (convite) e o fecho do funil. Isso não é um diálogo de confirmação —
 * é uma decisão com dados pelo meio, e o formulário mostra-os todos antes
 * de deixar avançar.
 *
 * O que vem PRÉ-PREENCHIDO é o lead: nome, município, telefone, e-mail e a
 * mensagem que a farmácia escreveu. A equipa não volta a escrever o que o
 * formulário da landing já recolheu — corrige só o que estiver mal. Os dois
 * campos que o lead NÃO tem são os do dono (nome e e-mail de quem recebe o
 * convite): o formulário da landing pergunta por um responsável, não por
 * um titular, e é por isso que aqui se pedem.
 *
 * Depois de gravar, o ecrã não volta ao formulário: mostra os TRÊS passos
 * com o estado de cada um e o `requestId` que os liga na trilha. É a
 * resposta à pergunta «o que é que esta operação fez?» — e a única forma de
 * quem executa confirmar que os três registos são o mesmo pedido.
 *
 * `jaConvertido` / `farmacia` sem fecho: o servidor liga o lead à farmácia
 * ANTES de convidar, para que um convite falhado não crie uma segunda
 * farmácia. Quando isso acontece, o ecrã diz «terminar conversão» e o
 * formulário volta a pedir só o que falta.
 *
 * Sem aviso de segundo factor, ao contrário do formulário do primeiro
 * plano: `lead.convert` não está em `ACOES_COM_MFA` (o que a matriz exige
 * aqui é o motivo). Anunciar uma recusa que o servidor não vai dar é pior
 * do que não anunciar nada — quem lesse isto ia terminar a sessão para
 * nada.
 */
export default function LeadConvertForm({ lead, farmacia, jaConvertido, tentativa, municipios }) {
  const router = useRouter()

  const [vals, setVals] = useState({
    name: lead.pharmacy_name || '',
    municipio: municipios.includes(lead.municipio) ? lead.municipio : '',
    address: '',
    phone: lead.phone || '',
    whatsapp: '',
    email: lead.email || '',
    opening_hours: '',
    maps_url: '',
    emailDono: lead.email || '',
    nomeDono: lead.contact_name || '',
  })
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState(null)
  const [campo, setCampo] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }))

  const submeter = (e) => {
    e.preventDefault()
    setErro(null)
    setCampo(null)
    setDetalhe(null)
    start(async () => {
      try {
        const r = await convertLead({ leadId: lead.id, motivo, ...vals })
        if (r?.ok) {
          // SEM `router.refresh()` aqui, ao contrário da falha parcial: o
          // refresh re-renderizava a página no ramo «já convertido» e
          // desmontava este formulário — o painel dos três passos e o
          // `requestId` apareciam e desapareciam no mesmo instante, que é
          // precisamente a informação que quem converteu veio buscar. A
          // lista do funil fica fresca na mesma: a acção revalida
          // `/interno/leads` e os links abaixo levam para lá.
          setFeito(r)
          return
        }
        setErro(r?.error || 'FALHA')
        setCampo(r?.campo || null)
        // A mensagem do fornecedor, quando existe: é ela que distingue
        // «limite de envio» de «endereço recusado», e sem ela a equipa ia
        // procurar a avaria no sítio errado.
        setDetalhe(r?.detalhe || null)
        // Falha parcial é informação, não erro genérico: a farmácia ficou
        // criada e a equipa tem de saber que pode repetir sem medo.
        if (r?.parcial) router.refresh()
      } catch {
        setErro('FALHA')
      }
    })
  }

  /**
   * « (por <quem>, em <data>)» a partir do registo `pharmacy.create` da
   * trilha — o que quem repete precisa de saber para perceber se foi um
   * colega ou uma tentativa própria, e quando.
   */
  const ondeCriada = (t) => {
    if (!t) return ''
    const quem = t.actorEmail ? `por ${t.actorEmail}` : null
    const quando = t.quando ? `em ${dataCurta(t.quando)}` : null
    const partes = [quem, quando].filter(Boolean).join(', ')
    return partes ? ` (${partes})` : ''
  }

  const erroDe = (c) => (campo === c ? mensagemLead(erro) : null)
  const geral = erro && !campo ? mensagemLead(erro) : null
  const faltaMotivo = motivo.trim().length < 3

  // ---- Resultado imediato: os passos, com o pedido que os liga ----
  // O mesmo painel que a página desenha a partir da trilha (e que fica no
  // ecrã quando a acção revalida a rota).
  if (feito) {
    return (
      <LeadConvertResult
        passos={[
          {
            action: feito.criada ? 'pharmacy.create' : 'pharmacy.create',
            slug: feito.farmacia.slug,
            titulo: feito.criada ? 'Farmácia criada' : 'Farmácia já existia',
          },
          { action: 'account.invite', email: feito.convite.email },
          { action: 'lead.convert' },
        ]}
        requestId={feito.requestId}
        resumo={
          <>
            <b>{feito.farmacia.name}</b> entrou no directório e a conta do dono foi convidada. As
            três acções ficaram na trilha com o <b>mesmo pedido</b> — é isso que as mantém juntas.
          </>
        }
        nota="O e-mail do convite leva o dono a definir a própria senha; nada fica à espera de um clique nosso."
        acao={
          <div className="interno-form-acts">
            <Link
              href={`/interno/farmacias/${feito.farmacia.id}`}
              className="interno-btn interno-btn--primary"
            >
              Abrir a ficha
            </Link>
            <Link href="/interno/leads" className="interno-btn interno-btn--ghost">
              Voltar ao funil
            </Link>
          </div>
        }
      />
    )
  }

  return (
    <form className="interno-form" onSubmit={submeter}>
      <div className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>A farmácia</h2>
          <span className="interno-sec-head-b">pharmacy.create</span>
        </div>
        <p className="interno-hint">
          Preenchido a partir do formulário do site (entrou {dataCurta(lead.created_at)}). Corrija o
          que estiver mal — o que aqui ficar é o que o cliente lê no Localizador.
        </p>

        <div className="interno-form-grid">
          <label className="interno-label">
            Nome
            <input
              className="interno-input"
              value={vals.name}
              maxLength={120}
              required
              disabled={pending}
              onChange={set('name')}
            />
            {erroDe('name') && <span className="interno-error">{erroDe('name')}</span>}
          </label>

          <label className="interno-label">
            Município
            <select
              className="interno-select"
              value={vals.municipio}
              disabled={pending}
              onChange={set('municipio')}
            >
              <option value="">Escolher…</option>
              {municipios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {erroDe('municipio') && <span className="interno-error">{erroDe('municipio')}</span>}
          </label>

          <label className="interno-label">
            Telefone
            <input
              className="interno-input"
              value={vals.phone}
              maxLength={40}
              disabled={pending}
              onChange={set('phone')}
            />
            {erroDe('phone') && <span className="interno-error">{erroDe('phone')}</span>}
          </label>

          <label className="interno-label">
            WhatsApp
            <input
              className="interno-input"
              value={vals.whatsapp}
              maxLength={40}
              disabled={pending}
              onChange={set('whatsapp')}
            />
          </label>

          <label className="interno-label">
            E-mail de contacto
            <input
              className="interno-input"
              type="email"
              value={vals.email}
              maxLength={160}
              disabled={pending}
              onChange={set('email')}
            />
            {erroDe('email') && <span className="interno-error">{erroDe('email')}</span>}
          </label>

          <label className="interno-label">
            Morada
            <input
              className="interno-input"
              value={vals.address}
              maxLength={200}
              disabled={pending}
              onChange={set('address')}
            />
          </label>
        </div>

        <div className="interno-form-grid">
          <label className="interno-label">
            Horário
            <textarea
              className="interno-textarea"
              rows={2}
              value={vals.opening_hours}
              maxLength={400}
              placeholder="Seg–Sex 8h–19h · Sáb 8h–13h"
              disabled={pending}
              onChange={set('opening_hours')}
            />
          </label>

          <label className="interno-label">
            Link do mapa
            <input
              className="interno-input"
              value={vals.maps_url}
              maxLength={500}
              placeholder="https://maps.google.com/…"
              disabled={pending}
              onChange={set('maps_url')}
            />
            {erroDe('maps_url') && <span className="interno-error">{erroDe('maps_url')}</span>}
          </label>
        </div>

        {lead.message && (
          <p className="interno-hint">
            Mensagem do contacto: <em>«{lead.message}»</em>
          </p>
        )}
      </div>

      <div className="interno-box interno-box--pad">
        <div className="interno-sec-head">
          <h2>O dono</h2>
          <span className="interno-sec-head-b">account.invite</span>
        </div>
        <p className="interno-hint">
          Quem recebe o convite cria a <b>própria</b> senha por e-mail — nenhuma senha passa por
          nós. A conta fica logo ligada a esta farmácia.
        </p>

        <div className="interno-form-grid">
          <label className="interno-label">
            Nome do dono
            <input
              className="interno-input"
              value={vals.nomeDono}
              maxLength={120}
              disabled={pending}
              onChange={set('nomeDono')}
            />
            {erroDe('nomeDono') && <span className="interno-error">{erroDe('nomeDono')}</span>}
          </label>

          <label className="interno-label">
            E-mail do dono
            <input
              className="interno-input"
              type="email"
              value={vals.emailDono}
              maxLength={160}
              disabled={pending}
              onChange={set('emailDono')}
            />
            {erroDe('emailDono') && <span className="interno-error">{erroDe('emailDono')}</span>}
          </label>
        </div>
      </div>

      <div className="interno-box interno-box--pad">
        <label className="interno-label">
          Motivo — fica na trilha de auditoria
          <textarea
            className="interno-textarea"
            rows={2}
            value={motivo}
            disabled={pending}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: acordo fechado por telefone; dono pediu para começar já."
          />
          <span className="interno-hint">
            O motivo acompanha os três registos da operação — é a mesma decisão.
          </span>
        </label>
      </div>

      {farmacia && !jaConvertido && (
        <Notice tone="warn" title="Conversão a meio">
          A farmácia <b>{farmacia.name}</b> já foi criada numa tentativa anterior
          {ondeCriada(tentativa)} e o convite não saiu. Repetir aqui <b>não</b> cria uma segunda
          farmácia: liga-se ao que já existe e tenta só o convite.
          {tentativa?.reason
            ? ` O motivo da primeira tentativa ficou na trilha: «${tentativa.reason}».`
            : ''}
        </Notice>
      )}

      {geral && (
        <Notice tone="danger" role="alert">
          {geral}
          {detalhe && <span className="interno-foot-sub"> detalhe: {detalhe}</span>}
        </Notice>
      )}

      <div className="interno-form-acts">
        <Link href="/interno/leads" className="interno-btn interno-btn--ghost">
          Cancelar
        </Link>
        <button
          type="submit"
          className="interno-btn interno-btn--primary"
          disabled={pending || faltaMotivo || !vals.name || !vals.municipio}
        >
          {pending ? 'A converter…' : 'Converter e convidar o dono'}
        </button>
      </div>
    </form>
  )
}
