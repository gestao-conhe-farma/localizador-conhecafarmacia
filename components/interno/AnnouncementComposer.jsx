'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import { publishAnnouncement } from '@/lib/actions/platform-announcements'
import { TONE_LABELS, TONES } from '@/lib/announcement-constants'

/**
 * Compositor de avisos da equipa (0032).
 *
 * O destino é uma escolha explícita: «Todas as farmácias» ou uma farmácia.
 * O prazo é opcional — sem prazo, o aviso fica até ser arquivado; com
 * prazo, a RLS deixa de o mostrar no fim, sem ninguém ter de se lembrar.
 *
 * O motivo é interno e vai para a trilha (`platform_audit_log.reason`):
 * o aviso é uma comunicação nossa a um cliente, e três meses depois tem de
 * ser possível saber porque é que ele saiu.
 */
export default function AnnouncementComposer({ farmacias = [] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [alvo, setAlvo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [tom, setTom] = useState('info')
  const [dias, setDias] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  const tituloValido = titulo.trim().length >= 3
  const corpoValido = corpo.trim().length >= 1
  const motivoValido = motivo.trim().length >= 3
  const podeSubmeter = tituloValido && corpoValido && motivoValido && !pending

  const limpar = () => {
    setAlvo('')
    setTitulo('')
    setCorpo('')
    setTom('info')
    setDias('')
    setMotivo('')
  }

  const submeter = (e) => {
    e.preventDefault()
    setErro(null)
    setFeito(null)
    start(async () => {
      try {
        const r = await publishAnnouncement({
          pharmacyId: alvo || null,
          title: titulo,
          body: corpo,
          tone: tom,
          dias: dias || undefined,
          motivo,
        })
        if (r?.ok) {
          setFeito(r)
          setAberto(false)
          limpar()
          router.refresh()
          return
        }
        setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })
  }

  return (
    <div className="interno-aviso-composer">
      {feito && (
        <Notice tone={feito.auditado === false ? 'warn' : 'ok'} role="status">
          Aviso publicado para <b>{feito.alvo}</b>.
          {feito.auditado === false
            ? ' A trilha NÃO registou a publicação — avise quem mantém a área interna, porque o aviso já está no portal.'
            : ' Ficou registado na trilha com o motivo.'}
        </Notice>
      )}

      {!aberto ? (
        <div className="interno-head-acts">
          <button
            type="button"
            className="interno-btn interno-btn--primary"
            onClick={() => {
              setErro(null)
              setFeito(null)
              setAberto(true)
            }}
          >
            + Novo aviso
          </button>
        </div>
      ) : (
        <form className="interno-box interno-box--pad interno-form" onSubmit={submeter}>
          <div>
            <h2 className="interno-section-title">Novo aviso à farmácia</h2>
            <p className="interno-hint">
              O aviso aparece no sino do portal da farmácia e na página Avisos. O corpo guarda as
              quebras de linha tal como forem escritas.
            </p>
          </div>

          <div className="interno-form-grid">
            <label className="interno-field">
              <span className="interno-label">Destino</span>
              <select
                className="interno-select"
                value={alvo}
                disabled={pending}
                onChange={(e) => setAlvo(e.target.value)}
              >
                <option value="">Todas as farmácias</option>
                {farmacias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.activa ? '' : ' (inactiva)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="interno-field">
              <span className="interno-label">Tom</span>
              <select
                className="interno-select"
                value={tom}
                disabled={pending}
                onChange={(e) => setTom(e.target.value)}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="interno-field">
              <span className="interno-label">Mostrar até</span>
              <select
                className="interno-select"
                value={dias}
                disabled={pending}
                onChange={(e) => setDias(e.target.value)}
              >
                <option value="">Sem prazo — até ser arquivado</option>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
              </select>
            </label>
          </div>

          <label className="interno-field">
            <span className="interno-label">Título — até 120 caracteres</span>
            <input
              className="interno-input"
              value={titulo}
              maxLength={120}
              disabled={pending}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Manutenção programada no sábado"
            />
          </label>

          <label className="interno-field">
            <span className="interno-label">Mensagem — até 4000 caracteres</span>
            <textarea
              className="interno-textarea"
              rows={5}
              value={corpo}
              maxLength={4000}
              disabled={pending}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="O que a farmácia precisa de saber e o que fazer a seguir."
            />
          </label>

          <label className="interno-field">
            <span className="interno-label">Motivo — fica na trilha de auditoria</span>
            <textarea
              className="interno-textarea"
              rows={2}
              value={motivo}
              maxLength={600}
              disabled={pending}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: aviso de manutenção pedido pela equipa técnica; comunicação de nova tabela de preços."
            />
          </label>

          {erro && (
            <Notice tone="danger" role="alert">
              {erro}
            </Notice>
          )}

          <div className="interno-form-acts">
            <button
              type="button"
              className="interno-btn interno-btn--ghost"
              disabled={pending}
              onClick={() => {
                setAberto(false)
                setErro(null)
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="interno-btn interno-btn--primary"
              disabled={!podeSubmeter}
            >
              {pending ? 'A publicar…' : 'Publicar aviso'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const MENSAGENS = {
  TITULO_INVALIDO: 'O título precisa de 3 a 120 caracteres.',
  CORPO_INVALIDO: 'A mensagem não pode ficar vazia (máximo 4000 caracteres).',
  TOM_INVALIDO: 'Tom inválido — escolha informativo, atenção ou bom saber.',
  PRAZO_INVALIDO: 'Prazo inválido — use um número de dias entre 1 e 365.',
  ID_INVALIDO: 'A farmácia escolhida não é válida. Actualize a página e repita.',
  NAO_ENCONTRADA: 'A farmácia escolhida já não existe. Actualize a página.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — fica na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não pode publicar avisos.',
  SEM_SESSAO: 'Sessão expirada — volte a entrar.',
  FALHA: 'Não foi possível publicar o aviso. Tente de novo.',
}
