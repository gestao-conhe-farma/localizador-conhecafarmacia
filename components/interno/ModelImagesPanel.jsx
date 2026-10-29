'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Notice from '@/components/ui/Notice'
import { modelFilePaths } from '@/lib/product-models'
import { plural } from '@/lib/texto'
import { removeModelImage, uploadModelImage } from '@/lib/actions/platform-catalogue'

const MENSAGENS = {
  CATEGORIA_INVALIDA: 'Categoria desconhecida. Actualize a página e repita.',
  FICHEIRO_INVALIDO: 'Escolha um ficheiro de imagem.',
  FICHEIRO_GRANDE: 'A imagem passou dos 2 MB mesmo depois de convertida.',
  TIPO_INVALIDO: 'A conversão para JPEG falhou neste browser. Tente outro ficheiro.',
  SEM_PERMISSAO: 'O seu nível não pode gerir o catálogo.',
  SEM_SESSAO: 'Sessão expirada — volte a entrar.',
  FALHA: 'Não foi possível concluir. Tente de novo.',
}

/** Lado maior da imagem-modelo: a especificação pede 1600 × 1200. */
const LADO_MAX = 1600

/**
 * Converte para JPEG antes de enviar: um só formato, um só caminho
 * (`modelos/<slug>.jpg`), o mesmo que o cartão do Localizador tenta
 * primeiro. O fundo é pintado de branco — um PNG transparente ficaria
 * com fundo preto ao virar JPEG.
 */
async function paraJpeg(file) {
  if (file.type === 'image/jpeg' && file.size <= 800 * 1024) return file
  if (typeof document === 'undefined') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * escala))
    const h = Math.max(1, Math.round(bitmap.height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close?.()
  }
}

/**
 * Cobertura das imagens-modelo por categoria.
 *
 * Duas fontes, de propósito:
 *   • as CARREGADAS vêm do servidor (Storage) — é o que a equipa sobe aqui;
 *   • as que vivem em `public/produtos/` são confirmadas pelo BROWSER, com
 *     o mesmo `fetch` HEAD que o cartão do Localizador faz: `public/` é
 *     servido pelo CDN e não é uma pasta que o servidor possa listar.
 *
 * O que aqui diz «presente» é exactamente o que o cliente recebe.
 */
async function existe(src) {
  const abortar = new AbortController()
  const timer = setTimeout(() => abortar.abort(), 5000)
  try {
    const r = await fetch(src, { method: 'HEAD', cache: 'no-store', signal: abortar.signal })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Cadeia de recurso de uma categoria, sem repetir o próprio slug nem `caixa`. */
function cadeiaDe(row) {
  const vistos = new Set([row.slug])
  const cadeia = []
  for (const slug of [...row.recurso, 'caixa']) {
    if (vistos.has(slug)) continue
    vistos.add(slug)
    cadeia.push(slug)
  }
  return cadeia
}

/** Carimbo do Storage no URL: substituir a imagem muda o endereço. */
function versao(iso) {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

export default function ModelImagesPanel({ rows = [], imagens = {}, podeGerir = false }) {
  const router = useRouter()
  const [estado, setEstado] = useState({})
  const [busy, setBusy] = useState(null)
  const [erro, setErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, start] = useTransition()

  // Só se sonda o que ainda não está no Storage.
  const assinatura = useMemo(
    () =>
      rows
        .filter((r) => !imagens[r.slug])
        .map((r) => r.slug)
        .join(','),
    [rows, imagens],
  )

  useEffect(() => {
    let vivo = true
    const slugs = assinatura ? assinatura.split(',') : []

    // Cada categoria aparece assim que é confirmada — a vista não espera
    // pelo último ficheiro para dizer o que já sabe.
    for (const slug of slugs) {
      ;(async () => {
        for (const src of modelFilePaths(slug)) {
          if (!vivo) return
          if (await existe(src)) {
            if (vivo) setEstado((s) => ({ ...s, [slug]: { presente: true, src } }))
            return
          }
        }
        if (vivo) setEstado((s) => ({ ...s, [slug]: { presente: false } }))
      })()
    }

    return () => {
      vivo = false
    }
  }, [assinatura])

  const conhecida = (r) => Boolean(imagens[r.slug]) || Boolean(estado[r.slug])
  const presenteDe = (r) => Boolean(imagens[r.slug]) || Boolean(estado[r.slug]?.presente)

  const verificando = rows.some((r) => !conhecida(r))
  const prontas = rows.filter(presenteDe)
  const faltamEssenciais = rows.filter((r) => r.essencial && conhecida(r) && !presenteDe(r))
  const faltamRefinamentos = rows.filter((r) => !r.essencial && conhecida(r) && !presenteDe(r))

  const enviar = async (row, file) => {
    if (!file) return
    setErro(null)
    setAviso(null)
    setBusy(row.slug)
    try {
      const jpeg = await paraJpeg(file)
      const r = await uploadModelImage({ slug: row.slug, file: jpeg })
      if (!r?.ok) {
        setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
        return
      }
      setAviso(
        r.auditado === false
          ? `${row.label}: imagem ${r.substituiu ? 'substituída' : 'carregada'}, mas a trilha NÃO registou a operação. Avise quem mantém a área interna.`
          : `${row.label}: imagem ${r.substituiu ? 'substituída' : 'carregada'}. O Localizador já a usa.`,
      )
      start(() => router.refresh())
    } catch {
      setErro(MENSAGENS.FALHA)
    } finally {
      setBusy(null)
    }
  }

  const remover = (row) => {
    setErro(null)
    setAviso(null)
    setBusy(row.slug)
    start(async () => {
      try {
        const r = await removeModelImage({ slug: row.slug })
        if (!r?.ok) {
          setErro(MENSAGENS[r?.error] || MENSAGENS.FALHA)
          return
        }
        setAviso(`${row.label}: imagem carregada apagada. A categoria volta ao ficheiro do código.`)
        router.refresh()
      } catch {
        setErro(MENSAGENS.FALHA)
      } finally {
        setBusy(null)
      }
    })
  }

  const grupos = [
    {
      titulo: 'Essenciais',
      nota: 'os dez que cobrem o catálogo todo',
      lista: rows.filter((r) => r.essencial),
    },
    {
      titulo: 'Refinamentos',
      nota: 'entram sozinhos quando o ficheiro existir',
      lista: rows.filter((r) => !r.essencial),
    },
  ]

  return (
    <div className="interno-box" style={{ marginBottom: 22 }}>
      <div className="interno-sec-head">
        <h2>Imagens-modelo por categoria</h2>
        <span className="interno-sec-head-b">
          {verificando ? 'a verificar ficheiros…' : `${prontas.length} de ${rows.length} presentes`}
        </span>
      </div>

      {aviso && (
        <div className="interno-box--pad" style={{ paddingBottom: 0 }}>
          <Notice tone={aviso.includes('NÃO registou') ? 'warn' : 'ok'} role="status">
            {aviso}
          </Notice>
        </div>
      )}
      {erro && (
        <div className="interno-box--pad" style={{ paddingBottom: 0 }}>
          <Notice tone="danger" role="alert">
            {erro}
          </Notice>
        </div>
      )}

      <div className="interno-box--pad interno-models-intro">
        <div className="interno-models-nums">
          <div className="interno-models-num">
            <b>{verificando ? '—' : prontas.length}</b>
            <span>presentes</span>
          </div>
          <div
            className={`interno-models-num ${faltamEssenciais.length ? 'interno-models-num--falta' : ''}`}
          >
            <b>{verificando ? '—' : faltamEssenciais.length}</b>
            <span>essenciais em falta</span>
          </div>
          <div className="interno-models-num">
            <b>{verificando ? '—' : faltamRefinamentos.length}</b>
            <span>refinamentos em falta</span>
          </div>
        </div>

        {verificando ? (
          <p className="interno-models-note">A confirmar cada ficheiro em public/produtos/…</p>
        ) : faltamEssenciais.length ? (
          <div className="interno-models-note">
            <b>Falta criar primeiro:</b>{' '}
            <span className="interno-models-chips">
              {faltamEssenciais.map((r) => (
                <code key={r.slug}>{r.slug}.jpg</code>
              ))}
            </span>
            {faltamRefinamentos.length > 0 && (
              <> · os {faltamRefinamentos.length} refinamentos podem esperar.</>
            )}
          </div>
        ) : faltamRefinamentos.length ? (
          <p className="interno-models-note">
            Todas as essenciais estão na pasta. Os {faltamRefinamentos.length} refinamentos em falta
            descem ao recurso ao lado e, no fim, à caixa genérica — nunca deixam um buraco no
            cartão.
          </p>
        ) : (
          <p className="interno-models-note">
            Todas as categorias têm imagem. Qualquer uma pode ser substituída aqui — o Localizador
            passa a usar a nova em menos de um minuto.
          </p>
        )}
      </div>

      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="interno-models-group">
          <div className="interno-models-group-head">
            <h3>{grupo.titulo}</h3>
            <span>{grupo.nota}</span>
          </div>
          <div className="interno-models-grid">
            {grupo.lista.map((row) => {
              const carregada = imagens[row.slug]
              const est = estado[row.slug]
              const presente = Boolean(carregada) || Boolean(est?.presente)
              const src = carregada?.url
                ? `${carregada.url}?v=${versao(carregada.updatedAt)}`
                : est?.src
              const ocupado = busy === row.slug || pending
              return (
                <div
                  key={row.slug}
                  className={`interno-model-card ${conhecida(row) && !presente ? 'interno-model-card--falta' : ''}`}
                >
                  <div className="interno-model-media">
                    {presente && src ? (
                      <img src={src} alt={`Imagem-modelo de ${row.label}`} loading="lazy" />
                    ) : (
                      <span className="interno-model-placeholder">
                        {conhecida(row) ? 'sem ficheiro' : 'a verificar'}
                      </span>
                    )}
                  </div>
                  <div className="interno-model-body">
                    <b className="interno-model-name">{row.label}</b>
                    <code className="interno-model-file">
                      {row.slug}.{carregada ? 'jpg' : 'webp'}
                    </code>
                    <span className="interno-foot-sub">
                      {cadeiaDe(row).length
                        ? `sem ele: ${cadeiaDe(row).join(' → ')}`
                        : 'sem recurso — fica em branco'}
                    </span>
                    <span className="interno-model-foot">
                      <span className="interno-foot-sub">
                        {row.produtos
                          ? plural(row.produtos, 'produto', 'produtos')
                          : 'nenhum produto'}
                      </span>
                      {!conhecida(row) ? (
                        <span className="interno-pill">a verificar</span>
                      ) : carregada ? (
                        <span className="interno-pill interno-pill--ok">carregada</span>
                      ) : presente ? (
                        <span className="interno-pill interno-pill--ok">no código</span>
                      ) : (
                        <span
                          className={`interno-pill ${row.essencial ? 'interno-pill--warn' : 'interno-pill--off'}`}
                        >
                          {row.essencial ? 'em falta' : 'opcional'}
                        </span>
                      )}
                    </span>

                    {podeGerir && (
                      <div className="interno-model-acts">
                        <label className="interno-btn interno-btn--ghost interno-catalogue-file">
                          {busy === row.slug
                            ? 'A carregar…'
                            : carregada
                              ? 'Substituir'
                              : 'Carregar'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={ocupado}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              enviar(row, f)
                            }}
                          />
                        </label>
                        {carregada && (
                          <button
                            type="button"
                            className="interno-btn interno-btn--ghost"
                            disabled={ocupado}
                            onClick={() => remover(row)}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="interno-catalogue-foot">
        {podeGerir ? (
          <>
            Carregue o ficheiro no cartão da categoria — é convertido para JPEG, guardado no Storage
            e usado pelo Localizador em menos de um minuto. A especificação (1600 × 1200, fundo
            branco, sem texto) está em <code>public/produtos/LEIA-ME.md</code>; um ficheiro em{' '}
            <code>public/produtos/</code> continua a servir como alternativa, sem carregar nada.
          </>
        ) : (
          <>
            O seu nível só consulta. Quem pode gerir o catálogo carrega o ficheiro no cartão da
            categoria. A especificação (1600 × 1200, fundo branco, sem texto) está em{' '}
            <code>public/produtos/LEIA-ME.md</code>.
          </>
        )}
      </div>
    </div>
  )
}
