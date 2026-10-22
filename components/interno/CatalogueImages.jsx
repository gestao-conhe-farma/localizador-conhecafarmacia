'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import { compressDrugImage } from '@/lib/image-compress'
import {
  removeBrandImage,
  setBrandImageStatus,
  uploadBrandImage,
} from '@/lib/actions/platform-catalogue'

const MENSAGENS = {
  ID_INVALIDO: 'Registo inválido. Actualize a página e repita.',
  MARCA_INVALIDA: 'A marca não pode ficar vazia.',
  FICHEIRO_INVALIDO: 'Escolha um ficheiro de imagem.',
  FICHEIRO_GRANDE: 'A imagem passou dos 2 MB mesmo depois de comprimida.',
  TIPO_INVALIDO: 'Só JPEG, PNG ou WebP.',
  SEM_PERMISSAO: 'O seu nível não pode gerir o catálogo.',
  SEM_SESSAO: 'Sessão expirada — volte a entrar.',
  NAO_ENCONTRADA: 'Esta imagem já não existe. Actualize a página.',
  FALHA: 'Não foi possível concluir. Tente de novo.',
}

/**
 * Gestão das imagens de catálogo (0040).
 *
 * Cada linha é uma marca que alguma farmácia usa para um medicamento — não
 * uma marca inventada aqui. O upload comprime no browser (800 px JPEG, o
 * mesmo helper do portal), o servidor volta a validar tipo/tamanho, e a
 * chave (medicamento + marca) é calculada em SQL.
 */
export default function CatalogueImages({ rows = [], podeGerir = false, totais }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [soSem, setSoSem] = useState(false)
  const [origem, setOrigem] = useState('')
  const [busy, setBusy] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [aRemover, setARemover] = useState(null)
  const [pending, start] = useTransition()

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (soSem && r.imageId) return false
      if (!termo) return true
      return `${r.drugName} ${r.brandLabel}`.toLowerCase().includes(termo)
    })
  }, [rows, q, soSem])

  const enviar = async (row, file) => {
    if (!file) return
    setErro(null)
    setAviso(null)
    setBusy(row.brandKey)
    try {
      const comprimida = await compressDrugImage(file)
      const r = await uploadBrandImage({
        drugId: row.drugId,
        brandLabel: row.brandLabel,
        file: comprimida,
        sourceNote: origem,
      })
      if (!r?.ok) {
        setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
        return
      }
      const acao = r.substituiu ? 'substituída' : 'carregada'
      setAviso(
        r.auditado === false
          ? `Imagem de ${row.brandLabel} ${acao}, mas a trilha NÃO registou a operação. Avise quem mantém a área interna.`
          : `Imagem de ${row.brandLabel} ${acao}. Já é a que os clientes vêem, quando a farmácia usa o catálogo.`,
      )
      router.refresh()
    } catch {
      setErro(MENSAGENS.FALHA)
    } finally {
      setBusy(null)
    }
  }

  const alternar = (row) => {
    setErro(null)
    setAviso(null)
    setBusy(row.brandKey)
    start(async () => {
      try {
        const r = await setBrandImageStatus({
          id: row.imageId,
          status: row.status === 'published' ? 'hidden' : 'published',
        })
        if (!r?.ok) {
          setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
          return
        }
        setAviso(
          row.status === 'published'
            ? `Imagem de ${row.brandLabel} oculta — os clientes voltam a ver a foto da farmácia.`
            : `Imagem de ${row.brandLabel} reposta no catálogo.`,
        )
        router.refresh()
      } catch {
        setErro(MENSAGENS.FALHA)
      } finally {
        setBusy(null)
      }
    })
  }

  const remover = () => {
    if (!aRemover) return
    setErro(null)
    setAviso(null)
    start(async () => {
      try {
        const r = await removeBrandImage({ id: aRemover.imageId })
        if (!r?.ok) {
          setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
          return
        }
        setAviso(`Imagem de ${aRemover.brandLabel} apagada. O ficheiro saiu do Storage.`)
        setARemover(null)
        router.refresh()
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
      {erro && (
        <Notice tone="danger" role="alert">
          {erro}
        </Notice>
      )}

      <div className="interno-box">
        <div className="interno-filters">
          <label className="interno-filter">
            <span className="interno-filter-label">Procurar</span>
            <input
              className="interno-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Medicamento ou marca"
            />
          </label>
          <label className="interno-filter">
            <span className="interno-filter-label">Proveniência (opcional)</span>
            <input
              className="interno-input"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              placeholder="Ex.: site do fabricante"
              maxLength={200}
              disabled={!podeGerir}
            />
          </label>
          <label className="interno-filter interno-catalogue-check">
            <span className="interno-filter-label">Filtro</span>
            <span className="interno-catalogue-check-row">
              <input type="checkbox" checked={soSem} onChange={(e) => setSoSem(e.target.checked)} />
              Só sem imagem
            </span>
          </label>
        </div>

        {lista.length === 0 ? (
          <div className="interno-box--pad">
            <div className="interno-empty">
              <b>Nada para mostrar</b>
              <span>
                {rows.length === 0
                  ? 'Ainda não há marcas no stock das farmácias. A lista nasce do stock real: sem marca escrita, não há imagem de catálogo.'
                  : 'Nenhuma marca corresponde a este filtro.'}
              </span>
            </div>
          </div>
        ) : (
          <div className="interno-table-scroll">
            <table className="interno-table">
              <thead>
                <tr>
                  <th>Imagem</th>
                  <th>Medicamento</th>
                  <th>Marca</th>
                  <th>Cobertura</th>
                  {podeGerir && <th aria-label="Acções" />}
                </tr>
              </thead>
              <tbody>
                {lista.map((row) => (
                  <tr key={`${row.drugId}:${row.brandKey}`}>
                    <td data-rotulo="Imagem">
                      <div className="interno-catalogue-imgcell">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt={`Imagem de catálogo de ${row.brandLabel}`}
                            className="interno-catalogue-thumb"
                            loading="lazy"
                          />
                        ) : (
                          <span className="interno-pill interno-pill--off">sem imagem</span>
                        )}
                        {row.status === 'hidden' && (
                          <span className="interno-pill interno-pill--warn">oculta</span>
                        )}
                      </div>
                    </td>
                    <td data-rotulo="Medicamento">
                      <b>{row.drugName}</b>
                    </td>
                    <td data-rotulo="Marca">{row.brandLabel}</td>
                    <td data-rotulo="Cobertura">
                      <span>{row.pharmacies} farmácias</span>
                      <span className="interno-foot-sub">{row.stockItems} itens em stock</span>
                    </td>
                    {podeGerir && (
                      <td data-rotulo="Acções">
                        <div className="interno-row-acts">
                          <label className="interno-btn interno-btn--ghost interno-catalogue-file">
                            {busy === row.brandKey
                              ? 'A carregar…'
                              : row.imageId
                                ? 'Substituir'
                                : 'Carregar'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={busy === row.brandKey}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                e.target.value = ''
                                enviar(row, f)
                              }}
                            />
                          </label>
                          {row.imageId && (
                            <>
                              <button
                                type="button"
                                className="interno-btn interno-btn--ghost"
                                disabled={busy === row.brandKey}
                                onClick={() => alternar(row)}
                              >
                                {row.status === 'published' ? 'Ocultar' : 'Repor'}
                              </button>
                              <button
                                type="button"
                                className="interno-btn interno-btn--ghost"
                                disabled={busy === row.brandKey}
                                onClick={() => setARemover(row)}
                              >
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="interno-catalogue-foot">
          {lista.length} de {totais?.marcas ?? rows.length} marcas · a imagem só se aplica quando o
          medicamento e a marca coincidem.
        </div>
      </div>

      {aRemover && (
        <ConfirmActionModal
          titulo="Remover imagem de catálogo"
          descricao={`A imagem de ${aRemover.brandLabel} (${aRemover.drugName}) sai do catálogo e do Storage. As farmácias passam a mostrar a foto própria — ou nenhuma.`}
          confirmLabel="Remover"
          tom="danger"
          pending={pending}
          onCancel={() => {
            if (!pending) setARemover(null)
          }}
          onConfirm={remover}
        />
      )}
    </>
  )
}
