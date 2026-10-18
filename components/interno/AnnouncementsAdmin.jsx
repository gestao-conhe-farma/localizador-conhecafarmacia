'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import AnnouncementComposer from '@/components/interno/AnnouncementComposer'
import { archiveAnnouncement } from '@/lib/actions/platform-announcements'
import { dataCurta, haQuanto } from '@/components/interno/formatos'

const MENSAGENS = {
  ID_INVALIDO: 'Aviso inválido. Actualize a página e repita.',
  NAO_ENCONTRADO: 'Este aviso já não existe. Actualize a página.',
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — fica na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não pode retirar avisos.',
  SEM_SESSAO: 'Sessão expirada — volte a entrar.',
  FALHA: 'Não foi possível retirar o aviso. Tente de novo.',
}

const ESTADO = {
  activo: { label: 'No portal', classe: 'interno-pill interno-pill--ok' },
  expirado: { label: 'Fora do prazo', classe: 'interno-pill interno-pill--off' },
  arquivado: { label: 'Arquivado', classe: 'interno-pill interno-pill--off' },
}

function excerto(corpo) {
  const t = String(corpo || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 140 ? `${t.slice(0, 137)}…` : t
}

/**
 * Lista dos avisos enviados, com o destino e quantas farmácias abriram.
 *
 * «Arquivar» não apaga: tira o aviso do portal (`archived_at`) e deixa a
 * linha na base para consulta. É uma acção com motivo (a matriz exige-o),
 * por isso passa pelo mesmo ConfirmActionModal das outras acções internas.
 */
export default function AnnouncementsAdmin({
  rows = [],
  farmacias = [],
  podePublicar = false,
  podeArquivar = false,
}) {
  const router = useRouter()
  const [alvo, setAlvo] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, start] = useTransition()

  const confirmar = (motivo) => {
    if (!alvo) return
    start(async () => {
      setErro(null)
      try {
        const r = await archiveAnnouncement({ id: alvo.id, motivo })
        if (r?.ok) {
          setAlvo(null)
          router.refresh()
          setAviso(
            r.mudou
              ? r.auditado === false
                ? 'Aviso retirado do portal, mas a trilha NÃO registou a operação. Avise quem mantém a área interna.'
                : 'Aviso retirado do portal e registado na trilha. A linha continua aqui para consulta.'
              : 'Este aviso já estava arquivado — nada mudou.',
          )
          return
        }
        setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })
  }

  return (
    <>
      {aviso && (
        <Notice tone={aviso.includes('NÃO registou') ? 'warn' : 'ok'} role="status">
          {aviso}
        </Notice>
      )}

      {podePublicar && <AnnouncementComposer farmacias={farmacias} />}

      {rows.length === 0 ? (
        <div className="interno-box interno-box--pad">
          <div className="interno-empty">
            <b>Ainda não há avisos</b>
            <span>
              Publique o primeiro: ele aparece no sino do portal de todas as farmácias (ou só na
              farmácia escolhida).
            </span>
          </div>
        </div>
      ) : (
        <div className="interno-box">
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Publicado</th>
                  <th>Aviso</th>
                  <th>Destino</th>
                  <th>Leituras</th>
                  <th>Estado</th>
                  {podeArquivar && <th aria-label="Acções" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const estado = ESTADO[a.estado] || ESTADO.activo
                  return (
                    <tr key={a.id}>
                      <td data-rotulo="Publicado">
                        <span>{dataCurta(a.publicadaEm)}</span>
                        <span className="interno-foot-sub">{haQuanto(a.publicadaEm)}</span>
                      </td>
                      <td data-rotulo="Aviso">
                        <b>{a.titulo}</b>
                        <span className="interno-foot-sub">{a.tomLabel}</span>
                        <span className="interno-foot-sub interno-aviso-copy">
                          {excerto(a.corpo)}
                        </span>
                      </td>
                      <td data-rotulo="Destino">
                        {a.universal ? 'Todas as farmácias' : a.farmaciaNome || 'Farmácia removida'}
                      </td>
                      <td data-rotulo="Leituras">
                        {a.destinatarios > 0 ? `${a.lidas} de ${a.destinatarios}` : `${a.lidas}`}
                        <span className="interno-foot-sub">
                          {a.lidas === 0 ? 'ninguém abriu' : 'abriram o aviso'}
                        </span>
                      </td>
                      <td data-rotulo="Estado">
                        <span className={estado.classe}>{estado.label}</span>
                        {a.expiraEm && a.estado === 'activo' && (
                          <span className="interno-foot-sub">até {dataCurta(a.expiraEm)}</span>
                        )}
                        {a.arquivadaEm && (
                          <span className="interno-foot-sub">{dataCurta(a.arquivadaEm)}</span>
                        )}
                      </td>
                      {podeArquivar && (
                        <td data-rotulo="Acções">
                          {a.estado === 'activo' ? (
                            <button
                              type="button"
                              className="interno-btn interno-btn--ghost interno-btn--small"
                              onClick={() => {
                                setErro(null)
                                setAlvo(a)
                              }}
                            >
                              Retirar
                            </button>
                          ) : (
                            <span className="interno-foot-sub">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alvo && (
        <ConfirmActionModal
          titulo="Retirar o aviso do portal"
          descricao="O aviso deixa de aparecer no sino e na página Avisos desta farmácia. Nada é apagado: a linha e as leituras ficam aqui para consulta."
          resumo={
            <>
              <dt>Aviso</dt>
              <dd>{alvo.titulo}</dd>
              <dt>Destino</dt>
              <dd>{alvo.universal ? 'Todas as farmácias' : alvo.farmaciaNome || 'Farmácia'}</dd>
              <dt>Leituras</dt>
              <dd>
                {alvo.lidas} de {alvo.destinatarios || alvo.lidas}
              </dd>
            </>
          }
          motivoObrigatorio
          confirmLabel="Retirar do portal"
          tom="danger"
          pending={pending}
          erro={erro}
          onCancel={() => {
            if (pending) return
            setAlvo(null)
            setErro(null)
          }}
          onConfirm={confirmar}
        />
      )}
    </>
  )
}
