'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import { markAnnouncementsRead } from '@/lib/actions/pharmacy-announcements'
import { TONE_LABELS } from '@/lib/announcement-constants'

/**
 * Lista de avisos da equipa no portal.
 *
 * Abrir a página é LER: os avisos mostrados são marcados como lidos para a
 * farmácia (não para a pessoa — o balcão partilha o estado), e o sino
 * atualiza com `router.refresh()`. Isto é explícito no sub-cabeçalho, para
 * ninguém pensar que o número do sino é um contador de mensagens por
 * abrir que sobrevive a uma leitura.
 *
 * Só se marcam os ids que ESTA renderização mostrou: um aviso que chegue
 * depois de a página abrir continua por ler, e o sino deve dizê-lo.
 */
export default function AnnouncementsPanel({ rows }) {
  const router = useRouter()
  const [erro, setErro] = useState(null)

  const porLer = rows.filter((r) => !r.lido).map((r) => r.id)
  const chave = porLer.join('|')

  useEffect(() => {
    if (!chave) return undefined
    let vivo = true
    markAnnouncementsRead(chave.split('|'))
      .then((r) => {
        if (!vivo) return
        if (r?.ok) {
          // A sidebar não volta a renderizar com o layout: o evento é o
          // aviso para o item do menu perder o número já.
          window.dispatchEvent(new Event('portal-avisos:lidos'))
          router.refresh()
        } else {
          setErro('Não foi possível marcar os avisos como lidos. Recarregue a página.')
        }
      })
      .catch(() => {
        if (vivo) setErro('Não foi possível marcar os avisos como lidos. Recarregue a página.')
      })
    return () => {
      vivo = false
    }
  }, [chave, router])

  return (
    <>
      {erro && (
        <Notice tone="warn" role="status">
          {erro} Pode continuar a ler — o aviso fica por ler até lá.
        </Notice>
      )}

      {rows.length === 0 ? (
        <div className="portal-box">
          <div className="portal-card-body empty-state">
            <p className="empty-title">Sem avisos para já</p>
            <p className="empty-sub">
              As mensagens da equipa da Conheça Farmácia aparecem aqui. Não há nada por ler.
            </p>
          </div>
        </div>
      ) : (
        <ul className="portal-announce-list">
          {rows.map((a) => (
            <li key={a.id} className={`portal-announce${a.lido ? '' : ' portal-announce--new'}`}>
              <div className="portal-announce-top">
                <span className={`portal-announce-tone portal-announce-tone--${a.tone}`}>
                  {TONE_LABELS[a.tone] || TONE_LABELS.info}
                </span>
                <span className="portal-announce-date">{dataHora(a.publishedAt)}</span>
                {!a.lido && <span className="portal-announce-new">Novo</span>}
                {a.universal && <span className="portal-announce-scope">todas as farmácias</span>}
              </div>
              <h2 className="portal-announce-title">{a.title}</h2>
              <p className="portal-announce-body">{a.body}</p>
              {a.expiresAt && (
                <p className="portal-announce-until">Válido até {dataCurta(a.expiresAt)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Data e hora fixas em Luanda: o servidor e o browser dizem o mesmo. */
function dataHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-PT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Luanda',
  })
}

function dataCurta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Luanda',
  })
}
