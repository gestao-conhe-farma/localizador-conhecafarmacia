'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  applyStockImportChunk,
  createApiKey,
  deleteWebhook,
  finishStockImport,
  getIntegrationOverview,
  previewStockImport,
  replayDelivery,
  revokeApiKey,
  rotateWebhookSecret,
  saveWebhook,
  setWebhookActive,
  startStockImport,
  testWebhook,
} from '@/lib/actions/integration'
import { IMPORT_CHUNK } from '@/lib/csv'
import Notice from '@/components/ui/Notice'

/**
 * Integração — a página /portal/integracao (plano 2026-10-12, ideia 1).
 *
 * Quatro separadores:
 *   1. Chaves de API — criar/revogar credenciais para o sistema da
 *      farmácia (ou um middleware). A chave só é mostrada UMA vez.
 *   2. Importar stock — CSV exportado do sistema que a farmácia já tem:
 *      mapeamento de colunas, pré-visualização, aplicação por lotes e
 *      relatório de linhas rejeitadas.
 *   3. Webhooks — destino, segredo de assinatura e entrega (0025):
 *      saúde do endpoint, teste imediato e registo das tentativas.
 *   4. Chamadas — as últimas entradas por API, para ver se o parceiro
 *      está a sincronizar.
 */

const ERROS = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  SEM_PERFIL: 'Escolha o seu perfil de farmacêutico antes de continuar.',
  SEM_PERMISSAO: 'Só o gerente da farmácia pode gerir chaves e webhooks.',
  MIGRACOES_EM_FALTA:
    'As tabelas da integração ainda não existem nesta base de dados (migrações 0023/0024).',
  FALHA_CARREGAR: 'Não foi possível carregar a integração.',
  NOME_INVALIDO: 'Dê um nome à chave (2 a 60 caracteres).',
  SEM_SCOPE: 'Escolha pelo menos um scope.',
  PRAZO_INVALIDO: 'Prazo inválido.',
  FALHA_CRIAR: 'Não foi possível criar a chave.',
  FALHA_REVOGAR: 'Não foi possível revogar a chave.',
  URL_INVALIDA: 'O endereço tem de ser https:// e apontar para a internet (sem redirects).',
  URL_PRIVADA:
    'Esse endereço é de uma rede privada (ou de dentro do nosso servidor) — não é entregável.',
  DNS_NAO_RESOLVE: 'Não foi possível resolver o domínio desse endereço.',
  NAO_EXISTE: 'Este destino já não existe. Recarregue a página.',
  SEM_SEGREDO: 'Gere primeiro um segredo para este destino.',
  LIMITE_DESTINOS: 'Já tem 5 destinos registados — remova um antes de acrescentar outro.',
  PLANO_INSUFICIENTE:
    'Esta função faz parte de um plano superior ao da farmácia. Fale com a equipa da Conheça Farmácia para tratar do plano — o que já está configurado continua a funcionar.',
  FALHA_ENVIAR: 'Não foi possível enviar o teste. Veja as tentativas em baixo.',
  FALHA_REENVIAR: 'Não foi possível reenviar a entrega.',
  FALHA_GUARDAR: 'Não foi possível guardar.',
  FALHA_REMOVER: 'Não foi possível remover.',
  FICHEIRO_VAZIO: 'O ficheiro está vazio.',
  DEMASIADAS_LINHAS: 'O ficheiro tem linhas a mais (máx. 2.000) — divida-o em partes.',
  SEM_COLUNA_MEDICAMENTO:
    'Diga qual é a coluna do medicamento — sem ela não é possível casar as linhas.',
  FALHA_LER: 'Não foi possível ler o ficheiro.',
  FALHA_IMPORTAR: 'A importação falhou. Nada foi aplicado a meio: o que entrou está no histórico.',
  PAYLOAD_INVALIDO: 'Pedido inválido.',
}

/** Motivos de rejeição por linha, em português. */
const ERROS_LINHA = {
  SEM_MEDICAMENTO: 'linha sem nome de medicamento',
  MEDICAMENTO_NAO_ENCONTRADO: 'medicamento não existe no catálogo',
  MEDICAMENTO_AMBIGUO: 'nome corresponde a mais de um medicamento',
  VALIDADE_INVALIDA: 'validade ilegível (use 31/03/2027 ou 2027-03-31)',
  PRECO_INVALIDO: 'preço ilegível',
  SEM_QUANTIDADE_NEM_ESTADO: 'sem quantidade nem estado (temos/não temos)',
  QUANTIDADE_INVALIDA: 'quantidade inválida',
  FALHA_APLICAR: 'não foi possível aplicar',
  LINHA_INVALIDA: 'linha inválida',
}

const TABS = [
  { id: 'chaves', label: 'Chaves de API' },
  { id: 'csv', label: 'Importar stock' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'chamadas', label: 'Chamadas' },
]

const CAMPOS = [
  { id: 'drug', label: 'Medicamento' },
  { id: 'quantity', label: 'Quantidade' },
  { id: 'in_stock', label: 'Temos / não temos' },
  { id: 'lot', label: 'Lote' },
  { id: 'expires', label: 'Validade' },
  { id: 'price', label: 'Preço' },
]

const SCOPES = [
  { id: 'stock:write', label: 'stock:write', hint: 'escrever stock (o caso normal)' },
  { id: 'stock:read', label: 'stock:read', hint: 'ler o stock actual (reconciliação)' },
]

// Só 'stock.updated' é emitido nesta fase (0025): os outros nomes que a
// 0023 já permite na coluna ficam para quando houver mesmo quem os envie.
const EVENTOS = [
  {
    id: 'stock.updated',
    hint: 'cada movimento de stock: entrada, venda, ajuste, saída, importação',
  },
]

function quando(iso) {
  if (!iso) return 'nunca'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-PT') : '—')

export default function IntegrationPanel() {
  const [tab, setTab] = useState('chaves')
  const [data, setData] = useState(null)
  const [erro, setErro] = useState(null)

  const carregar = async () => {
    const res = await getIntegrationOverview()
    setData(res)
    setErro(res.ok ? null : res.error)
  }

  useEffect(() => {
    carregar()
  }, [])

  return (
    <section className="portal-section">
      <header className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Integração</h1>
          <p className="portal-page-sub">
            Ligue o sistema de gestão da farmácia ao Localizador: o stock passa a actualizar-se
            sozinho (e o Localizador mostra que é automático). Também pode importar um ficheiro CSV
            do seu programa actual.
          </p>
        </div>
      </header>

      <div className="portal-chips" role="tablist" aria-label="Secções da integração">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`portal-chip${tab === t.id ? ' portal-chip--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'chaves' && data?.keys?.length ? (
              <span className="portal-chip-n">{data.keys.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {erro && (
        <Notice tone="danger" role="alert">
          {ERROS[erro] || ERROS.FALHA_CARREGAR}
        </Notice>
      )}

      {!data && !erro && (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      )}

      {data?.ok && tab === 'chaves' && <Chaves data={data} onChanged={carregar} />}
      {data?.ok && tab === 'csv' && <Importar onChanged={carregar} />}
      {data?.ok && tab === 'webhooks' && <Webhooks data={data} onChanged={carregar} />}
      {data?.ok && tab === 'chamadas' && <Chamadas data={data} />}
    </section>
  )
}

/* ════════════════ 1. Chaves ════════════════ */

function Chaves({ data, onChanged }) {
  const [nome, setNome] = useState('')
  const [scopes, setScopes] = useState(['stock:write'])
  const [dias, setDias] = useState('365')
  const [msg, setMsg] = useState(null)
  const [nova, setNova] = useState(null) // { token, key }
  const [pending, startTransition] = useTransition()

  const criar = (e) => {
    e.preventDefault()
    if (pending) return
    setMsg(null)
    startTransition(async () => {
      const res = await createApiKey({
        name: nome,
        scopes,
        expiresInDays: dias === 'nunca' ? null : Number(dias),
      })
      if (res.ok) {
        setNova({ token: res.token, key: res.key })
        setNome('')
        await onChanged()
      } else {
        setMsg({ type: 'err', text: ERROS[res.error] || ERROS.FALHA_CRIAR })
      }
    })
  }

  const revogar = (id, nomeChave) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Revogar a chave «${nomeChave}»? Os pedidos com ela deixam de funcionar imediatamente.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const res = await revokeApiKey({ id, reason: 'revogada no portal' })
      if (res.ok) await onChanged()
      else setMsg({ type: 'err', text: ERROS[res.error] || ERROS.FALHA_REVOGAR })
    })
  }

  return (
    <>
      {nova && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>Guarde esta chave agora</h2>
            <span className="portal-card-hint">só é mostrada uma vez</span>
          </div>
          <div className="portal-card-body">
            <p className="portal-card-sub">
              Copie-a para o sistema da farmácia (ou para o sítio onde guarda credenciais). Por
              segurança não voltamos a mostrá-la — se se perder, cria-se outra.
            </p>
            <TokenBox token={nova.token} />
            <ExemploChave token={nova.token} nome={nova.key?.name} />
          </div>
        </div>
      )}

      <div className="portal-box">
        <div className="portal-card-head">
          <h2>Chaves da farmácia</h2>
          <span className="portal-card-hint">
            {data.canManage ? 'criar e revogar' : 'só o gerente pode alterar'}
          </span>
        </div>
        <div className="portal-card-body">
          {data.keys.length === 0 ? (
            <div className="portal-rows-empty">
              <b>Ainda não há chaves</b>
              Crie uma chave e entregue-a ao programa de gestão (ou a quem o instala). O stock passa
              a aparecer no Localizador sem ninguém mexer no portal.
            </div>
          ) : (
            <div className="portal-feed">
              {data.keys.map((k) => (
                <div key={k.id} className="portal-citem">
                  <div className="portal-citem-top">
                    <b className="portal-citem-name">{k.name}</b>
                    <span className="portal-citem-time">
                      {k.revoked_at
                        ? 'revogada'
                        : k.expires_at && new Date(k.expires_at).getTime() < Date.now()
                          ? 'expirada'
                          : k.expires_at
                            ? `expira ${dia(k.expires_at)}`
                            : 'sem prazo'}
                    </span>
                  </div>
                  <div className="portal-citem-meta">
                    <code className="portal-badge">
                      cfk_{k.key_id}••••••••{k.key_last4}
                    </code>
                    {(k.scopes || []).map((s) => (
                      <span key={s} className="portal-badge portal-badge--info">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="portal-citem-foot">
                    <span className="sub">
                      último uso {quando(k.last_used_at)} · {k.request_count || 0} pedidos
                    </span>
                    {!k.revoked_at && data.canManage && (
                      <button
                        type="button"
                        className="portal-act"
                        disabled={pending}
                        onClick={() => revogar(k.id, k.name)}
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.canManage && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>Nova chave</h2>
          </div>
          <form className="portal-form portal-form-grid" onSubmit={criar}>
            <label className="portal-label">
              Nome (para reconhecer na lista)
              <input
                className="portal-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="KuatelaSoft · servidor da loja"
                maxLength={60}
                required
              />
            </label>

            <fieldset className="portal-label">
              Permissões
              <div className="portal-chips">
                {SCOPES.map((s) => {
                  const on = scopes.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      className={`portal-chip${on ? ' portal-chip--active' : ''}`}
                      onClick={() =>
                        setScopes((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                        )
                      }
                      title={s.hint}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className="portal-label">
              Validade
              <select
                className="portal-input"
                value={dias}
                onChange={(e) => setDias(e.target.value)}
              >
                <option value="90">90 dias (recomendado para começar)</option>
                <option value="180">180 dias</option>
                <option value="365">1 ano</option>
                <option value="nunca">sem prazo</option>
              </select>
            </label>

            <div className="portal-form-stack">
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? 'A criar…' : 'Criar chave'}
              </button>
              {msg && <p className="portal-error">{msg.text}</p>}
            </div>
          </form>
        </div>
      )}

      <div className="portal-box portal-box--pad">
        <div className="portal-card-head">
          <h2>Como o sistema da farmácia envia o stock</h2>
          <span className="portal-card-hint">POST /api/ingest/stock</span>
        </div>
        <div className="portal-card-body">
          <p className="portal-card-sub">
            Uma reposição por medicamento (<code>mode: &quot;set&quot;</code>) é o mais simples: o
            valor enviado passa a ser o saldo. Envie <code>idempotency_key</code> para que uma
            repetição (rede, recomeço do serviço) não conte duas vezes.
          </p>
          <pre className="portal-pre">{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/ingest/stock \\
  -H "Authorization: Bearer cfk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "idempotency_key": "erp-2026-10-13-001",
    "source_ref": "ErpFarmacia/loja-1",
    "items": [
      { "drug": "Paracetamol", "form": "comprimido", "dosage": "500 mg",
        "mode": "set", "quantity": 24, "price": 1500,
        "lot_number": "L2401", "expires_at": "2027-03-31" }
    ]
  }'`}</pre>
          <p className="portal-card-hint">
            Lote e validade só se aplicam às entradas: quando o saldo sobe, o stock passa a saber o
            que expira primeiro. Numa baixa, a saída segue o FEFO e o lote enviado é ignorado, com
            um aviso <code>LOTE_IGNORADO</code> por linha na resposta.
          </p>
        </div>
      </div>
    </>
  )
}

function TokenBox({ token }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="portal-chips">
      <code className="portal-badge portal-badge--warn" style={{ wordBreak: 'break-all' }}>
        {token}
      </code>
      <button
        type="button"
        className="portal-act portal-act--primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(token)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          } catch {
            setCopiado(false)
          }
        }}
      >
        {copiado ? 'Copiada ✓' : 'Copiar'}
      </button>
    </div>
  )
}

function ExemploChave({ token, nome }) {
  return (
    <Notice as="details" summary={`Ver exemplo de envio para «${nome || 'a chave'}»`}>
      <pre className="portal-pre">{`curl -X POST /api/ingest/stock \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"drug":"Paracetamol","quantity":24}]}'`}</pre>
    </Notice>
  )
}

/* ════════════════ 2. Importar CSV ════════════════ */

function Importar({ onChanged }) {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)
  const [mapping, setMapping] = useState(null)
  const [mode, setMode] = useState('set')
  const [msg, setMsg] = useState(null)
  const [progress, setProgress] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef(null)

  const lerFicheiro = async (file) => {
    if (!file) return
    setMsg(null)
    setResultado(null)
    const text = await file.text()
    setCsvText(text)
    setFileName(file.name)
    const res = await previewStockImport({ csvText: text })
    if (res.ok) {
      setPreview(res)
      setMapping(res.mapping)
    } else {
      setPreview(null)
      setMsg({ type: 'err', text: ERROS[res.error] || ERROS.FALHA_LER })
    }
  }

  const rePreview = async (novoMapping) => {
    const res = await previewStockImport({ csvText, mapping: novoMapping })
    if (res.ok) {
      setPreview(res)
      setMapping(res.mapping)
    } else {
      setMsg({ type: 'err', text: ERROS[res.error] || ERROS.FALHA_LER })
    }
  }

  const aplicar = () => {
    if (!preview || pending) return
    setMsg(null)
    setResultado(null)
    startTransition(async () => {
      const started = await startStockImport({ fileName, rowsTotal: preview.rowsTotal })
      if (!started.ok) {
        setMsg({ type: 'err', text: ERROS[started.error] || ERROS.FALHA_IMPORTAR })
        return
      }
      const { importId } = started
      const totals = { ok: 0, duplicado: 0, erro: 0, ignoradas: 0 }
      const report = []
      let from = 0

      while (from < preview.rowsTotal) {
        const chunk = await applyStockImportChunk({
          importId,
          csvText,
          mapping,
          mode,
          from,
        })
        if (!chunk.ok) {
          setMsg({ type: 'err', text: ERROS[chunk.error] || ERROS.FALHA_IMPORTAR })
          break
        }
        totals.ok += chunk.counts.ok || 0
        totals.duplicado += chunk.counts.duplicado || 0
        totals.erro += chunk.counts.erro || 0
        for (const r of chunk.results || []) {
          if (r.status === 'erro' && report.length < 100) {
            report.push({ linha: r.line, referencia: r.name, erro: r.error })
          }
        }
        from += chunk.applied || chunk.results?.length || IMPORT_CHUNK
        setProgress({ from: Math.min(from, preview.rowsTotal), total: preview.rowsTotal })
        if (chunk.done) break
      }

      const fim = await finishStockImport({ importId, totals, report, fileName })
      setProgress(null)
      setResultado({ totals, report, ok: fim.ok })
      if (!fim.ok) setMsg({ type: 'err', text: ERROS[fim.error] || ERROS.FALHA_GUARDAR })
      await onChanged()
    })
  }

  const limpar = () => {
    setCsvText('')
    setFileName('')
    setPreview(null)
    setMapping(null)
    setResultado(null)
    setMsg(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <div className="portal-box portal-box--pad">
        <div className="portal-card-head">
          <h2>1. Escolher o ficheiro</h2>
          <span className="portal-card-hint">CSV exportado do programa da farmácia</span>
        </div>
        <div className="portal-card-body">
          <p className="portal-card-sub">
            O ficheiro deve ter uma coluna com o nome do medicamento (o resto é opcional:
            quantidade, temos/não temos, lote, validade, preço). Aceita <code>;</code> ou{' '}
            <code>,</code> como separador, e datas em <code>31/03/2027</code> ou{' '}
            <code>2027-03-31</code>.
          </p>
          <input
            ref={inputRef}
            className="portal-input"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(e) => lerFicheiro(e.target.files?.[0])}
          />
          {fileName && (
            <p className="portal-card-hint">
              {fileName} · {preview ? `${preview.rowsTotal} linhas` : 'a ler…'}
            </p>
          )}
        </div>
      </div>

      {preview && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>2. Dizer o que é cada coluna</h2>
            <span className="portal-card-hint">separador «{preview.delimiter}»</span>
          </div>
          <div className="portal-card-body">
            <div className="portal-form-grid">
              {CAMPOS.map((c) => (
                <label key={c.id} className="portal-label">
                  {c.label}
                  <select
                    className="portal-input"
                    value={mapping?.[c.id] ?? -1}
                    onChange={(e) => {
                      const novo = { ...(mapping || {}), [c.id]: Number(e.target.value) }
                      setMapping(novo)
                      rePreview(novo)
                    }}
                  >
                    <option value={-1}>— não usar —</option>
                    {preview.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="portal-box">
          <div className="portal-card-head">
            <h2>3. Pré-visualização</h2>
            <span className="portal-card-hint">
              {preview.counts.ok} prontas · {preview.counts.erro} com problema
            </span>
          </div>
          <div className="portal-card-body">
            <div className="portal-feed">
              {preview.preview.map((r) => (
                <div key={r.line} className="portal-citem">
                  <div className="portal-citem-top">
                    <b className="portal-citem-name">{r.drug || r.name || '(sem nome)'}</b>
                    <span className="portal-citem-time">linha {r.line}</span>
                  </div>
                  <div className="portal-citem-meta">
                    {r.status === 'ok' ? (
                      <>
                        <span className="portal-badge portal-badge--ok">pronta</span>
                        {r.quantity != null && <span className="sub">quantidade {r.quantity}</span>}
                        {r.in_stock != null && (
                          <span className="sub">{r.in_stock ? 'temos' : 'não temos'}</span>
                        )}
                        {r.lot && <span className="sub">lote {r.lot}</span>}
                        {r.expires && <span className="sub">validade {dia(r.expires)}</span>}
                        {r.price != null && <span className="sub">preço {r.price}</span>}
                      </>
                    ) : (
                      <span className="portal-badge portal-badge--warn">
                        {ERROS_LINHA[r.error] || r.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {preview.rowsTotal > preview.preview.length && (
              <p className="portal-card-hint">
                A mostrar as primeiras {preview.preview.length} de {preview.rowsTotal} linhas.
              </p>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>4. Aplicar</h2>
          </div>
          <div className="portal-card-body">
            <div className="portal-chips" role="group" aria-label="Como aplicar as quantidades">
              <button
                type="button"
                aria-pressed={mode === 'set'}
                className={`portal-chip${mode === 'set' ? ' portal-chip--active' : ''}`}
                onClick={() => setMode('set')}
              >
                Repor saldo (o ficheiro manda)
              </button>
              <button
                type="button"
                aria-pressed={mode === 'delta'}
                className={`portal-chip${mode === 'delta' ? ' portal-chip--active' : ''}`}
                onClick={() => setMode('delta')}
              >
                Somar ao saldo actual
              </button>
            </div>

            <div className="portal-form-stack">
              <button
                className="btn btn-primary"
                type="button"
                disabled={pending}
                onClick={aplicar}
              >
                {pending ? 'A importar…' : `Aplicar ${preview.counts.ok} linhas`}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={pending}
                onClick={limpar}
              >
                Escolher outro ficheiro
              </button>
              {progress && (
                <p className="portal-card-hint">
                  {progress.from} de {progress.total} linhas processadas…
                </p>
              )}
              {msg && <p className="portal-error">{msg.text}</p>}
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>Resultado</h2>
            <span className="portal-card-hint">fica também no histórico de movimentos</span>
          </div>
          <div className="portal-card-body">
            <p className="portal-card-sub">
              {resultado.totals.ok} linhas aplicadas · {resultado.totals.duplicado} já estavam
              aplicadas (repetições) · {resultado.totals.erro} rejeitadas.
            </p>
            {resultado.report.length > 0 && (
              <div className="portal-feed">
                {resultado.report.map((r, i) => (
                  <div key={`${r.linha}-${i}`} className="portal-citem">
                    <div className="portal-citem-top">
                      <b className="portal-citem-name">{r.referencia || '(sem nome)'}</b>
                      <span className="portal-citem-time">linha {r.linha}</span>
                    </div>
                    <div className="portal-citem-meta">
                      <span className="portal-badge portal-badge--warn">
                        {ERROS_LINHA[r.erro] || r.erro}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ════════════════ 3. Webhooks ════════════════ */

function Webhooks({ data, onChanged }) {
  const [url, setUrl] = useState('')
  const [desc, setDesc] = useState('')
  const [eventos, setEventos] = useState(EVENTOS.map((e) => e.id))
  const [novo, setNovo] = useState(null) // segredo mostrado uma vez
  const [msg, setMsg] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [pending, startTransition] = useTransition()

  const guardar = (e) => {
    e.preventDefault()
    if (pending) return
    setMsg(null)
    startTransition(async () => {
      const res = await saveWebhook({ url, description: desc, events: eventos })
      if (res.ok) {
        setNovo({ secret: res.secret, url: res.webhook?.url })
        setUrl('')
        setDesc('')
        setAviso(null)
        await onChanged()
      } else {
        setMsg({ type: 'err', text: ERROS[res.error] || ERROS.FALHA_GUARDAR })
      }
    })
  }

  /** Acções do destino e das entregas: sempre com resultado visível. */
  const correr = (fn, aoSucesso) => {
    if (pending) return
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (res?.ok) {
        if (aoSucesso) setAviso(aoSucesso(res))
        await onChanged()
      } else {
        setAviso(null)
        setMsg({ type: 'err', text: ERROS[res?.error] || ERROS.FALHA_GUARDAR })
      }
    })
  }

  return (
    <>
      {novo && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>Guarde o segredo agora</h2>
            <span className="portal-card-hint">só é mostrado uma vez</span>
          </div>
          <div className="portal-card-body">
            <p className="portal-card-sub">
              É este segredo que assina cada entrega para{' '}
              <b style={{ wordBreak: 'break-all' }}>{novo.url}</b>. Guarde-o no sistema da farmácia
              (ou onde guarda credenciais): por segurança não voltamos a mostrá-lo — se se perder,
              gera-se outro.
            </p>
            <TokenBox token={novo.secret} />
            <ExemploWebhook segredo={novo.secret} />
            <div className="portal-form-stack">
              <button type="button" className="btn btn-secondary" onClick={() => setNovo(null)}>
                Já guardei o segredo
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="portal-box portal-box--pad">
        <div className="portal-card-head">
          <h2>Destinos registados</h2>
          <span className="portal-card-hint">
            entrega assinada · tentativas automáticas até 3 dias
          </span>
        </div>
        <div className="portal-card-body">
          <p className="portal-card-sub">
            Cada mudança de stock sai daqui já assinada (HMAC-SHA256) para o endereço da farmácia.
            Quem recebe confirma a assinatura e usa o <code>webhook-id</code> para não contar duas
            vezes. Uma resposta falhada é repetida com espera crescente — se o servidor estiver em
            baixo ao fim de semana, recebe o histórico quando voltar.
          </p>
          {data.webhooks.length === 0 ? (
            <div className="portal-rows-empty">
              <b>Nenhum destino registado</b>
              Se o fornecedor do sistema de gestão já souber o endereço a usar, deixe-o aqui.
            </div>
          ) : (
            <div className="portal-feed">
              {data.webhooks.map((w) => (
                <div key={w.id} className="portal-citem">
                  <div className="portal-citem-top">
                    <b className="portal-citem-name" style={{ wordBreak: 'break-all' }}>
                      {w.url}
                    </b>
                    <span className="portal-citem-time">
                      {w.disabled_at
                        ? 'desligado pelo sistema deles'
                        : w.active
                          ? `a entregar desde ${quando(w.created_at)}`
                          : 'pausado'}
                    </span>
                  </div>
                  <div className="portal-citem-meta">
                    <span
                      className={`portal-badge ${
                        w.active && !w.disabled_at ? 'portal-badge--ok' : 'portal-badge--warn'
                      }`}
                    >
                      {w.disabled_at ? 'parado' : w.active ? 'activo' : 'pausado'}
                    </span>
                    {(w.events || []).map((ev) => (
                      <span key={ev} className="portal-badge portal-badge--info">
                        {ev}
                      </span>
                    ))}
                    {w.description && <span className="sub">{w.description}</span>}
                  </div>
                  <div className="portal-citem-meta">
                    {w.secret_last4 ? (
                      <span className="sub">segredo …{w.secret_last4}</span>
                    ) : (
                      <span className="portal-badge portal-badge--warn">sem segredo</span>
                    )}
                    <span className="sub">
                      último sucesso {quando(w.last_success_at)} · última falha{' '}
                      {quando(w.last_failure_at)}
                    </span>
                    {w.failure_count > 0 && (
                      <span className="portal-badge portal-badge--warn">
                        {w.failure_count} falhas seguidas
                      </span>
                    )}
                  </div>
                  {w.disabled_reason && (
                    <p className="portal-card-hint" style={{ wordBreak: 'break-all' }}>
                      Desligado: {w.disabled_reason}
                    </p>
                  )}
                  {data.canManage && (
                    <div className="portal-citem-foot">
                      {w.secret_last4 ? (
                        <button
                          type="button"
                          className="portal-act portal-act--primary"
                          disabled={pending}
                          onClick={() =>
                            correr(
                              () => testWebhook({ id: w.id }),
                              (res) =>
                                res.delivered
                                  ? {
                                      type: 'ok',
                                      text: `Respondeu ${res.status} em ${res.durationMs} ms — a entrega está ligada.`,
                                    }
                                  : {
                                      type: 'err',
                                      text: `O sistema deles respondeu: ${res.error || res.status || 'sem resposta'}`,
                                    },
                            )
                          }
                        >
                          Enviar teste
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="portal-act portal-act--primary"
                          disabled={pending}
                          onClick={() =>
                            correr(
                              () => rotateWebhookSecret({ id: w.id }),
                              (res) => setNovo({ secret: res.secret, url: res.url }),
                            )
                          }
                        >
                          Gerar segredo
                        </button>
                      )}
                      {!(w.active && !w.disabled_at) && (
                        <button
                          type="button"
                          className="portal-act"
                          disabled={pending}
                          onClick={() => correr(() => setWebhookActive({ id: w.id, active: true }))}
                        >
                          Activar
                        </button>
                      )}
                      {w.active && !w.disabled_at && (
                        <button
                          type="button"
                          className="portal-act"
                          disabled={pending}
                          onClick={() =>
                            correr(() => setWebhookActive({ id: w.id, active: false }))
                          }
                        >
                          Pausar
                        </button>
                      )}
                      {w.secret_last4 && (
                        <button
                          type="button"
                          className="portal-act"
                          disabled={pending}
                          onClick={() =>
                            correr(
                              () => rotateWebhookSecret({ id: w.id }),
                              (res) => setNovo({ secret: res.secret, url: res.url }),
                            )
                          }
                        >
                          Novo segredo
                        </button>
                      )}
                      <button
                        type="button"
                        className="portal-act"
                        disabled={pending}
                        onClick={() => {
                          if (
                            typeof window !== 'undefined' &&
                            !window.confirm(
                              `Remover o destino ${w.url}? As entregas pendentes desaparecem com ele.`,
                            )
                          ) {
                            return
                          }
                          correr(() => deleteWebhook({ id: w.id }))
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {aviso && (
            <p className={aviso.type === 'ok' ? 'portal-hint' : 'portal-error'}>{aviso.text}</p>
          )}
        </div>
      </div>

      <Entregas data={data} pending={pending} correr={correr} />

      {data.canManage && (
        <div className="portal-box portal-box--pad">
          <div className="portal-card-head">
            <h2>Registar destino</h2>
          </div>
          <form className="portal-form portal-form-grid" onSubmit={guardar}>
            <label className="portal-label">
              Endereço (https)
              <input
                className="portal-input"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sistema-da-farmacia.ao/hooks/localizador"
                required
              />
            </label>
            <label className="portal-label">
              Nota (opcional)
              <input
                className="portal-input"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Servidor da loja · fornecido pela KuatelaSoft"
                maxLength={120}
              />
            </label>
            <fieldset className="portal-label">
              Eventos
              <div className="portal-chips">
                {EVENTOS.map((ev) => {
                  const on = eventos.includes(ev.id)
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      aria-pressed={on}
                      className={`portal-chip${on ? ' portal-chip--active' : ''}`}
                      onClick={() =>
                        setEventos((prev) =>
                          prev.includes(ev.id) ? prev.filter((x) => x !== ev.id) : [...prev, ev.id],
                        )
                      }
                      title={ev.hint}
                    >
                      {ev.id}
                    </button>
                  )
                })}
              </div>
              <span className="portal-card-hint">
                Avisos de reservas e de importação entram numa fase seguinte.
              </span>
            </fieldset>
            <div className="portal-form-stack">
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? 'A guardar…' : 'Registar'}
              </button>
              {msg && <p className="portal-error">{msg.text}</p>}
            </div>
          </form>
        </div>
      )}
    </>
  )
}

/*
 * Últimas entregas: o que saiu, o que o servidor deles respondeu e o que
 * se segue. É o «registo das tentativas» a que a farmácia tem direito —
 * sem isto, «não recebemos nada» era impossível de responder.
 */
function Entregas({ data, pending, correr }) {
  const entregas = data.deliveries || []
  const tentativasPorEntrega = useMemo(() => {
    const mapa = new Map()
    for (const t of data.attempts || []) {
      const lista = mapa.get(t.delivery_id) || []
      lista.push(t)
      mapa.set(t.delivery_id, lista)
    }
    for (const lista of mapa.values()) lista.sort((a, b) => b.attempt - a.attempt)
    return mapa
  }, [data.attempts])

  const pendentes = entregas.filter((d) => d.status === 'pendente').length
  const falhadas = entregas.filter((d) => d.status === 'falhado').length

  return (
    <div className="portal-box portal-box--pad">
      <div className="portal-card-head">
        <h2>Últimas entregas</h2>
        <span className="portal-card-hint">
          {entregas.length} recentes · {pendentes} à espera · {falhadas} falhadas
        </span>
      </div>
      <div className="portal-card-body">
        {entregas.length === 0 ? (
          <div className="portal-rows-empty">
            <b>Ainda não saiu nada</b>
            Assim que o stock mudar (portal, CSV ou API), o evento entra aqui com hora, estado e
            resposta.
          </div>
        ) : (
          <div className="portal-feed">
            {entregas.slice(0, 12).map((d) => (
              <Entrega
                key={d.id}
                entrega={d}
                tentativas={tentativasPorEntrega.get(d.id) || []}
                podeGerir={data.canManage}
                pending={pending}
                correr={correr}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Entrega({ entrega: d, tentativas, podeGerir, pending, correr }) {
  const dados = d.payload?.data || {}
  const resumo =
    d.event === 'webhook.test'
      ? dados.message || 'teste do portal'
      : `${dados.drug || 'medicamento'}${dados.movement_type ? ` · ${dados.movement_type}` : ''}${
          dados.delta != null && dados.delta !== 0
            ? ` ${dados.delta > 0 ? '+' : ''}${dados.delta}`
            : ''
        }`
  const ultima = tentativas[0]
  const resultado =
    d.status === 'entregue'
      ? `entregue ${quando(d.delivered_at || d.created_at)}`
      : d.status === 'falhado'
        ? 'sem mais tentativas'
        : `próxima ${quando(d.next_attempt_at)}`

  return (
    <div className="portal-citem">
      <div className="portal-citem-top">
        <b className="portal-citem-name">{resumo}</b>
        <span className="portal-citem-time">{quando(d.created_at)}</span>
      </div>
      <div className="portal-citem-meta">
        <span
          className={`portal-badge ${
            d.status === 'entregue'
              ? 'portal-badge--ok'
              : d.status === 'falhado'
                ? 'portal-badge--warn'
                : 'portal-badge--info'
          }`}
        >
          {d.status}
        </span>
        <span className="sub">
          {d.attempts}/{d.max_attempts} tentativas · {resultado}
        </span>
        {d.response_status != null && <span className="sub">HTTP {d.response_status}</span>}
        {ultima?.duration_ms != null && <span className="sub">{ultima.duration_ms} ms</span>}
        {d.event === 'webhook.test' && (
          <span className="portal-badge portal-badge--info">teste</span>
        )}
      </div>
      {d.last_error && (
        <p className="portal-card-hint" style={{ wordBreak: 'break-word' }}>
          {d.last_error}
        </p>
      )}
      {tentativas.length > 0 && (
        <Notice as="details" summary={`Ver as ${tentativas.length} tentativas`}>
          <div className="portal-feed">
            {tentativas.map((t) => (
              <div key={t.id} className="portal-citem-meta">
                <span className="sub">#{t.attempt}</span>
                <span className="sub">
                  {t.status_code != null ? `HTTP ${t.status_code}` : 'sem resposta'}
                </span>
                {t.duration_ms != null && <span className="sub">{t.duration_ms} ms</span>}
                <span className="sub">{quando(t.created_at)}</span>
                {t.error && <span className="sub">{t.error}</span>}
              </div>
            ))}
          </div>
        </Notice>
      )}
      {podeGerir && (d.status === 'falhado' || d.status === 'entregue') && (
        <div className="portal-citem-foot">
          <button
            type="button"
            className="portal-act"
            disabled={pending}
            onClick={() =>
              correr(
                () => replayDelivery({ id: d.id }),
                (res) => {
                  if (res.delivered === true)
                    return { type: 'ok', text: 'Reenviado — o destino aceitou.' }
                  if (res.delivered === false)
                    return {
                      type: 'err',
                      text: `Continua a falhar: ${res.error || 'sem resposta'}`,
                    }
                  // Na fila, mas ainda não tentada (a drenagem apanha só as primeiras):
                  // não afirmamos nem sucesso nem falha.
                  return { type: 'ok', text: 'Reenvio na fila — o resultado aparece nas entregas.' }
                },
              )
            }
          >
            Reenviar
          </button>
        </div>
      )}
    </div>
  )
}

/*
 * Como o sistema da farmácia confirma que o pedido é nosso. O código
 * aparece no portal porque é isto que o programador deles vai colar —
 * poupa uma ida e volta por email e evita «não sabemos verificar».
 */
function ExemploWebhook({ segredo }) {
  const exemplo = `const crypto = require('node:crypto')

const chave = Buffer.from('${segredo || 'whsec_…'}'.replace('whsec_', ''), 'base64')
const assinado =
  req.headers['webhook-id'] + '.' +
  req.headers['webhook-timestamp'] + '.' +
  corpoCru            // o corpo tal como chegou, sem reserializar

const esperado = 'v1,' + crypto.createHmac('sha256', chave).update(assinado).digest('base64')

if (esperado !== req.headers['webhook-signature']) return res.status(401).end()

// 1) recusar timestamps com mais de 5 minutos
// 2) guardar o webhook-id e ignorar repetidos (a entrega é at-least-once)
res.status(200).end()`

  return (
    <Notice as="details" summary="Como o sistema da farmácia confirma a assinatura">
      <pre className="portal-pre">{exemplo}</pre>
    </Notice>
  )
}

/* ════════════════ 4. Chamadas ════════════════ */

function Chamadas({ data }) {
  const resumo = useMemo(() => {
    const calls = data.calls || []
    const hoje = calls.filter(
      (c) => new Date(c.created_at).toDateString() === new Date().toDateString(),
    )
    return {
      total: calls.length,
      hoje: hoje.length,
      erros: calls.filter((c) => (c.status || 0) >= 400).length,
    }
  }, [data.calls])

  return (
    <div className="portal-box">
      <div className="portal-card-head">
        <h2>Últimas chamadas de terceiros</h2>
        <span className="portal-card-hint">
          {resumo.total} registadas · {resumo.hoje} hoje · {resumo.erros} com erro
        </span>
      </div>
      <div className="portal-card-body">
        {(data.calls || []).length === 0 ? (
          <div className="portal-rows-empty">
            <b>Ainda não há chamadas</b>
            Quando o sistema da farmácia enviar stock pela chave de API, cada envio fica registado
            aqui (rota, estado, quantas linhas passaram) — sem guardar os dados enviados.
          </div>
        ) : (
          <div className="portal-feed">
            {data.calls.map((c) => (
              <div key={c.id} className="portal-citem">
                <div className="portal-citem-top">
                  <b className="portal-citem-name">
                    {c.method} {String(c.route || '').replace('/api/ingest/', '· ')}
                  </b>
                  <span className="portal-citem-time">{quando(c.created_at)}</span>
                </div>
                <div className="portal-citem-meta">
                  <span
                    className={`portal-badge ${
                      c.status < 300 ? 'portal-badge--ok' : 'portal-badge--warn'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.items_ok != null && <span className="sub">{c.items_ok} linhas aplicadas</span>}
                  {c.items_error ? <span className="sub">{c.items_error} rejeitadas</span> : null}
                  {c.duration_ms != null && <span className="sub">{c.duration_ms} ms</span>}
                  {c.error_code && <span className="sub">código {c.error_code}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
