'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  getMyStockSnapshot,
  updateStockItem,
  uploadDrugImage,
  retireStockItem,
  restoreStockItem,
} from '@/lib/actions/pharmacy-portal'
import { createClient } from '@/lib/supabase/client'
import { compressDrugImage } from '@/lib/image-compress'
import { countExpiryBuckets, expiryStatus, expirySummary, monthYear } from '@/lib/expiry'
import DrugCreateForm from '@/components/portal/DrugCreateForm'
import { setSaleOptions } from '@/lib/actions/pharmacy-portal'
import { unitLabel } from '@/lib/sale-options'
import { CloseIcon } from '@/components/ui/Icon'
import StateLabel from '@/components/portal/StateLabel'
import RestockDrawer from '@/components/portal/RestockDrawer'

/**
 * Opções de venda (0012 — fracionamento). Defaults inteligentes pela
 * forma farmacêutica: sugestão, nunca bloqueante. O default é a
 * unidade-base (pack 1) — o saldo do stock é contado nela.
 */
const UNITS = [
  { id: 'comprimido', label: 'Comprimido' },
  { id: 'lamina', label: 'Lâmina' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'frasco', label: 'Frasco' },
  { id: 'ampola', label: 'Ampola' },
  { id: 'unidade', label: 'Unidade' },
]

/** Plurais para os rótulos ("Saldo em lâminas"). */
const UNIT_PLURALS = {
  comprimido: 'comprimidos',
  lamina: 'lâminas',
  caixa: 'caixas',
  frasco: 'frascos',
  ampola: 'ampolas',
  unidade: 'unidades',
}
const pluralUnit = (u) => UNIT_PLURALS[u] || 'unidades'

/** Formas sólidas — as que têm lâminas e caixas (0016). */
const isSolidForm = (f) => /comprimido|c[aá]psula/i.test(f || '')

/** Unidade-base do item (opção padrão) — rótulos do modal. */
function defaultSaleUnit(item) {
  const def = (item.sale_options || []).find((o) => o.is_default && o.active !== false)
  return def ? def.unit : 'unidade'
}

function suggestOptions(form) {
  const f = (form || '').toLowerCase()
  if (f.includes('comprimido') || f.includes('cápsula') || f.includes('capsula')) {
    return [
      { unit: 'lamina', packSize: 1, price: '', isDefault: true, active: true },
      { unit: 'caixa', packSize: 3, price: '', isDefault: false, active: true },
    ]
  }
  if (f.includes('xarope') || f.includes('solução') || f.includes('suspens')) {
    return [{ unit: 'frasco', packSize: 1, price: '', isDefault: true, active: true }]
  }
  if (f.includes('injet') || f.includes('inject')) {
    return [{ unit: 'ampola', packSize: 1, price: '', isDefault: true, active: true }]
  }
  return [{ unit: 'unidade', packSize: 1, price: '', isDefault: true, active: true }]
}

function timeAgo(iso, now) {
  if (!iso) return null
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

const ERRORES = {
  SESSAO_EXPIRADA: 'Sessão expirada — recarregue a página e entre novamente.',
  QUANTIDADE_INVALIDA: 'Quantidade inválida (número inteiro ≥ 0).',
  PRECO_INVALIDO: 'Preço inválido.',
  DATA_INVALIDA: 'Data inválida — use o calendário.',
  MEDICAMENTO_INEXISTENTE: 'Medicamento não disponível no catálogo.',
  FALHA_GUARDAR: 'Não foi possível guardar. Tente novamente.',
  FALHA_CARREGAR: 'Não foi possível carregar o stock.',
  ITEM_INEXISTENTE: 'Item não encontrado no seu stock.',
  FALHA_RETIRAR: 'Não foi possível retirar. Tente novamente.',
  FALHA_RESTAURAR: 'Não foi possível restaurar. Tente novamente.',
}

/** Data (YYYY-MM-DD) local de hoje, para o min do input date. */
function todayIso() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Hora de montagem do módulo — Date.now() no render é impuro
// (react-hooks/purity); ao nível do módulo avalia-se uma vez, no import.
const MOUNT_NOW = Date.now()

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'in', label: 'Disponível' },
  { id: 'out', label: 'Não disponível' },
  { id: 'exp', label: 'Validade a vencer' },
  { id: 'retired', label: 'Lixeira' },
]

/** Critérios de ordenação — ids curtos, como os sci-sort-btn do principal. */
const SORTS = [
  { id: 'recent', label: 'Recentes' },
  { id: 'name', label: 'Nome' },
  { id: 'qty', label: 'Qtd.' },
  { id: 'price', label: 'Preço' },
  { id: 'expiry', label: 'Validade' },
]

/**
 * Origens (0013) — a lista pesa na decisão do cliente angolano:
 * "é português?" é pergunta de balcão. Select fechado (dados limpos,
 * tags comparáveis); se a embalagem for de outro país, fica sem
 * origem até a lista crescer — melhor nada do que texto solto.
 */
export const ORIGINS = [
  'Portugal',
  'Índia',
  'China',
  'Alemanha',
  'França',
  'Brasil',
  'EUA',
  'Reino Unido',
  'Egipto',
  'África do Sul',
  'Japão',
  'Turquia',
]

/** Quantos cards mostrar por “página” do scroll infinito. */
const PAGE_SIZE = 24

/**
 * Modal de edição rápida: abre ao alternar "temos / não temos" (e pelo
 * próprio nome da linha) para reunir quantidade, validade, "disponível
 * a partir de" e preço num só cartão, sobre um scrim que ofusca a página.
 * Guarda UMA vez — menos blur-save espalhado por inputs pequenos.
 */
function StockEditModal({ item, saving, onClose, onSave, onSaveOptions, onRetire }) {
  // Estado local por campo — o modal é efémero (recriado a cada abertura),
  // por isso inicializar a partir do item é seguro.
  const [quantity, setQuantity] = useState(item.quantity != null ? String(item.quantity) : '')
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '')
  const [expiresAt, setExpiresAt] = useState(item.expires_at ? item.expires_at.slice(0, 10) : '')
  const [availableFrom, setAvailableFrom] = useState(
    item.available_from ? item.available_from.slice(0, 10) : '',
  )
  // Estrutura da caixa (0016) — lâminas/caixa e comprimidos/lâmina.
  const [packLaminas, setPackLaminas] = useState(
    item.pack_laminas != null ? String(item.pack_laminas) : '',
  )
  const [packComprimidos, setPackComprimidos] = useState(
    item.pack_comprimidos != null ? String(item.pack_comprimidos) : '',
  )
  const lamN = Number.parseInt(packLaminas, 10) || null
  const compN = Number.parseInt(packComprimidos, 10) || null
  // Origem/marca/foto (0013).
  const [origin, setOrigin] = useState(item.origin || '')
  const [brand, setBrand] = useState(item.brand || '')
  const [imagePath, setImagePath] = useState(item.image_path || '')
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  // URL público da foto actual — deriva do path no bucket (o mesmo que a
  // view stock_confirmed expõe ao Localizador).
  const supabaseUrl = createClient().supabaseUrl
  const imageUrl = imagePath
    ? `${supabaseUrl}/storage/v1/object/public/drug-images/${imagePath}`
    : null
  // Mensagem de feedback do upload — LOCAL ao modal: o setToast do pai
  // não existe aqui (o erro «setToast is not defined» era isto) e o
  // toast do pai ficava debaixo do scrim, invisível.
  const [fileMsg, setFileMsg] = useState('')

  /** Upload com compressão client-side (máx. 800px JPEG) — partilhado
   *  pelo input de galeria e pelo da câmara. */
  const handleImageFile = async (f) => {
    if (!f) return
    setUploading(true)
    setFileMsg('')
    const compressed = await compressDrugImage(f)
    const up = await uploadDrugImage({ drugId: item.drug_id, file: compressed })
    setUploading(false)
    if (up.ok) {
      setImagePath(up.path)
      setFileMsg(
        compressed !== f
          ? `Foto carregada (${Math.round(compressed.size / 1024)} KB, comprimida) — guarda para publicar.`
          : 'Foto carregada — guarda para publicar.',
      )
    } else {
      setFileMsg(
        up.error === 'FICHEIRO_GRANDE'
          ? 'Imagem acima de 2 MB mesmo após compressão — tenta outra foto.'
          : up.error === 'TIPO_INVALIDO'
            ? 'Só JPEG, PNG ou WebP.'
            : 'Não foi possível carregar a foto.',
      )
    }
  }
  // Opções de venda (0012). Sem opções registadas: começa vazio — o
  // botão "sugerir formas de venda" preenche com defaults pela forma.
  const [opts, setOpts] = useState(
    (item.sale_options || []).map((o) => ({
      unit: o.unit,
      packSize: String(o.pack_size ?? 1),
      price: o.price != null ? String(o.price) : '',
      isDefault: Boolean(o.is_default),
      active: o.active !== false,
    })),
  )
  const inStock = item.in_stock

  // Esc fecha; guardar é explícito (ou "marcar como não disponível", que
  // não precisa de campos — ver onSave no pai).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="stock-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-modal-title"
    >
      <div className="stock-modal-scrim" onClick={onClose} aria-hidden="true" />
      <div className="stock-modal-card">
        <div className="portal-section-head" style={{ marginBottom: 0 }}>
          <h3 id="stock-modal-title" className="portal-h2">
            {item.name}
            {item.requires_rx && <span className="rx-badge rx-badge--inline">Receita</span>}
          </h3>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
            aria-label="Fechar sem guardar"
          >
            Fechar
          </button>
        </div>

        <p className="stock-modal-state">
          Estado: <b>{inStock ? 'disponível' : 'não disponível'}</b>
          {inStock
            ? ' — confirme os detalhes abaixo.'
            : ' — pode guardar já, ou preencher para quando voltar a haver stock.'}
        </p>

        <form
          className="portal-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSave({
              quantity,
              price,
              expires_at_input: expiresAt,
              expires_at: expiresAt || null,
              available_from_input: availableFrom,
              available_from: availableFrom || null,
              packLaminas,
              packComprimidos,
              sale_options: opts,
              origin,
              brand,
              image_path: imagePath,
            })
          }}
        >
          {/* Sectores no padrão dos grupos da sidebar — o que é do
              fármaco, do saldo, do dinheiro e da apresentação. */}
          <div className="modal-sector">Medicamento</div>
          <p className="stock-modal-info">
            {[item.molecule, item.form, item.dosage].filter(Boolean).join(' · ') ||
              'Sem detalhes no catálogo.'}
          </p>
          <p className="portal-hint">
            Ficha do catálogo partilhado — para corrigir nome ou gramagem, fale com a equipa Conheça
            Farmácia.
          </p>

          <div className="modal-sector">Stock</div>
          <div className="portal-form-grid portal-form-grid--three">
            <label className="portal-label">
              {`Saldo em ${pluralUnit(defaultSaleUnit(item))}`}
              <input
                type="number"
                min="0"
                className="portal-input"
                placeholder="Ex.: 12"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="portal-label">
              Validade
              <input
                type="date"
                className="portal-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
            <label className="portal-label">
              Disponível a partir de
              <input
                type="date"
                className="portal-input"
                min={todayIso()}
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
              />
            </label>
          </div>

          <div className="modal-sector">Preços e formas de venda</div>
          <div className="portal-form-grid portal-form-grid--three">
            <label className="portal-label">
              Preço (Kz)
              <input
                type="number"
                min="0"
                step="0.01"
                className="portal-input"
                placeholder="Ex.: 2500"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            {/* Estrutura da caixa (0016) — só nas formas sólidas. */}
            {isSolidForm(item.form) && (
              <label className="portal-label">
                Lâminas por caixa
                <input
                  type="number"
                  min="1"
                  max="999"
                  className="portal-input"
                  placeholder="Ex.: 10"
                  value={packLaminas}
                  onChange={(e) => setPackLaminas(e.target.value)}
                />
              </label>
            )}
            {isSolidForm(item.form) && (
              <label className="portal-label">
                Comprimidos por lâmina
                <input
                  type="number"
                  min="1"
                  max="999"
                  className="portal-input"
                  placeholder="Ex.: 10"
                  value={packComprimidos}
                  onChange={(e) => setPackComprimidos(e.target.value)}
                />
              </label>
            )}
          </div>
          {isSolidForm(item.form) && (lamN || compN) && (
            <p className="portal-hint">
              {lamN && compN
                ? `1 caixa = ${lamN} lâminas = ${lamN * compN} comprimidos.`
                : lamN
                  ? `1 caixa = ${lamN} lâminas.`
                  : `1 lâmina = ${compN} comprimidos.`}
            </p>
          )}

          <div className="modal-sector">Apresentação</div>
          {/* Origem e marca (0013) — a origem pesa na decisão em Angola.
              Marca livre ("Panadol", "Ben-u-ron"), origem da lista. */}
          <div className="portal-form-grid portal-form-grid--three">
            <label className="portal-label">
              Origem
              <select
                className="portal-input"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                <option value="">— não indicada —</option>
                {ORIGINS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-label">
              Marca
              <input
                type="text"
                className="portal-input"
                placeholder="Ex.: Ben-u-ron"
                maxLength={80}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </label>
            <label className="portal-label">
              Foto da embalagem
              {imageUrl && (
                <span className="stock-img-preview">
                  <img
                    src={imageUrl}
                    alt={`Embalagem de ${item.name}`}
                    className="stock-img-preview-img"
                  />
                  <button
                    type="button"
                    className="stock-img-preview-remove"
                    disabled={removing || saving}
                    title="Remover a foto deste medicamento"
                    onClick={async () => {
                      setRemoving(true)
                      try {
                        // Apaga do Storage e limpa o path. O item só perde a
                        // foto no Localizador após «Guardar» — mas remover
                        // aqui evita subir o modal para nada.
                        await createClient()
                          .storage.from('drug-images')
                          .remove([imagePath])
                          .catch(() => {})
                        setImagePath('')
                        setFileMsg('Foto removida — guarda para aplicar.')
                      } finally {
                        setRemoving(false)
                      }
                    }}
                  >
                    {removing ? '…' : <CloseIcon />}
                  </button>
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="portal-input"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = '' // permite reescolher o mesmo ficheiro
                  handleImageFile(f)
                }}
              />
              {/* Câmara directa no telemóvel — abre a app da câmara
                  (câmara traseira) sem passar pela galeria. */}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="portal-input portal-input--camera"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  handleImageFile(f)
                }}
              />
              {uploading && <span className="portal-hint">A carregar…</span>}
              {!uploading && fileMsg && <span className="portal-hint">{fileMsg}</span>}
            </label>
          </div>

          {/* Formas de venda (0012) — só faz sentido com
              stock; para item esgotado as opções esperam a reposição. */}
          <div className="sale-opts">
            <div className="sale-opts-head">
              <b>Formas de venda</b>
              <span className="sale-opts-hint">
                A farmácia decide se vende por lâmina, por caixa ou ambas — só as formas marcadas
                «ofereço» aparecem ao cliente. Ex.: lâmina 100 Kz · caixa com 10 lâminas 950 Kz. O
                saldo conta-se na unidade marcada como padrão.
              </span>
            </div>
            {opts.length === 0 ? (
              <button
                type="button"
                className="portal-chip sale-opts-add"
                onClick={() => setOpts(suggestOptions(item.form))}
              >
                + Sugerir formas de venda
              </button>
            ) : (
              <>
                {opts.map((o, i) => (
                  <div key={i} className="sale-opts-row">
                    <select
                      className="portal-input sale-opts-unit"
                      value={o.unit}
                      onChange={(e) =>
                        setOpts((list) =>
                          list.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                        )
                      }
                      aria-label="Forma de venda"
                    >
                      {UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <label className="sale-opts-pack">
                      contém
                      <input
                        type="number"
                        min="1"
                        className="portal-input portal-input--price"
                        value={o.packSize}
                        disabled={o.isDefault}
                        onChange={(e) =>
                          setOpts((list) =>
                            list.map((x, j) => (j === i ? { ...x, packSize: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="portal-input portal-input--price"
                      placeholder="Preço Kz"
                      value={o.price}
                      onChange={(e) =>
                        setOpts((list) =>
                          list.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)),
                        )
                      }
                      aria-label="Preço desta forma"
                    />
                    <label className="sale-opts-default">
                      <input
                        type="radio"
                        name="sale-opts-default"
                        checked={o.isDefault}
                        onChange={() =>
                          setOpts((list) =>
                            list.map((x, j) => ({
                              ...x,
                              isDefault: j === i,
                              packSize: j === i ? 1 : x.packSize,
                            })),
                          )
                        }
                      />
                      padrão
                    </label>
                    <label className="sale-opts-active">
                      <input
                        type="checkbox"
                        checked={o.active}
                        onChange={(e) =>
                          setOpts((list) =>
                            list.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)),
                          )
                        }
                      />
                      ofereço
                    </label>
                    <button
                      type="button"
                      className="sale-opts-rm"
                      aria-label="Remover forma de venda"
                      onClick={() => setOpts((list) => list.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {opts.length < 4 && (
                  <button
                    type="button"
                    className="portal-chip sale-opts-add"
                    onClick={() =>
                      setOpts((list) => [
                        ...list,
                        { unit: 'caixa', packSize: '', price: '', isDefault: false, active: true },
                      ])
                    }
                  >
                    + adicionar forma de venda
                  </button>
                )}
              </>
            )}
          </div>

          <div className="stock-modal-actions">
            {/* Alternar o estado a partir do modal também guarda os campos. */}
            <button
              type="button"
              className={`portal-toggle${inStock ? '' : ' portal-toggle--on'}`}
              disabled={saving}
              onClick={() =>
                onSave({
                  quantity,
                  price,
                  expires_at_input: expiresAt,
                  expires_at: expiresAt || null,
                  available_from_input: availableFrom,
                  available_from: availableFrom || null,
                  in_stock: !inStock,
                })
              }
              aria-pressed={inStock}
            >
              Marcar como {inStock ? 'não disponível' : 'disponível'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar'}
            </button>
            {/* Retirar (0014): Remove o medicamento do catálogo da farmácia
                — vai para a Lixeira (restaurável). Abre a confirmação
                estilizada (ConfirmRetire). */}
            <button
              type="button"
              className="stock-retire-btn"
              disabled={saving}
              onClick={() => onRetire(item)}
            >
              Retirar do catálogo
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Confirmação de retirada (0014) — modal estilizado no lugar do
 * window.confirm nativo: título claro, nome do medicamento em destaque,
 * explicação do que acontece (desaparece do Localizador, fica na
 * Lixeira restaurável) e os dois caminhos: Cancelar / Retirar.
 */
function ConfirmRetire({ item, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="stock-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-retire-title"
    >
      <div className="stock-modal-scrim" onClick={onCancel} aria-hidden="true" />
      <div className="stock-modal-card confirm-retire-card">
        <div className="confirm-retire-icon" aria-hidden="true">
          <CloseIcon size={18} />
        </div>
        <h3 id="confirm-retire-title" className="confirm-retire-title">
          Retirar do catálogo?
        </h3>
        <p className="confirm-retire-name">{item.name}</p>
        <p className="confirm-retire-body">
          O medicamento desaparece do <b>Localizador</b> e das suas listas de stock. Fica guardado
          na <b>Lixeira</b>, onde pode ser restaurado quando quiser.
        </p>
        <div className="confirm-retire-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn confirm-retire-confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'A retirar…' : 'Retirar do catálogo'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Ecrã de stock: uma linha por medicamento do catálogo, com o toggle
 * "temos / não temos" e o modal de detalhe (quantidade, validade,
 * disponibilidade e preço — ponto 2, para stock que ainda vai chegar).
 * Guarda por linha (Server Action).
 *
 * Redesign: toolbar centrada (pesquisa + chips + botão de novo fármaco)
 * e edição concentrada num popup que ofusca a página ao alternar o estado.
 */
export default function StockPanel({ compact = false }) {
  const [items, setItems] = useState(null)
  const [query, setQuery] = useState('')
  // Deep-link da pesquisa global da top-bar (`?q=Paracetamol`) — o
  // resultado da pesquisa abre aqui isolado na lista.
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q')
  useEffect(() => {
    if (urlQ) setQuery(urlQ)
  }, [urlQ])
  const [filter, setFilter] = useState('all')
  // Ordenação do grid — 'recent' é a de sempre: disponíveis primeiro.
  const [sort, setSort] = useState('recent')
  const [savingId, setSavingId] = useState(null)
  const [toast, setToast] = useState('')
  // Item em edição no modal (null = fechado).
  const [editing, setEditing] = useState(null)
  // «+ Nova entrada» — drawer rápido a partir do Stock (a página
  // /portal/entrada com os deep-links fica intacta).
  const [restockOpen, setRestockOpen] = useState(false)
  // Item pendente de confirmação de retirada (ConfirmRetire).
  const [confirming, setConfirming] = useState(null)
  // "Agora" vive em estado — Date.now() no render é impuro (react-hooks/
  // purity) e o relógio vem de graça: os "Confirmado há X min" refrescam
  // sozinhos a cada minuto. (setState só no interval, nunca síncrono no
  // effect — react-hooks/set-state-in-effect.)
  const [now, setNow] = useState(MOUNT_NOW)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Paginação (refs 4/6 do mock): 24 linhas por página, botões
  // ‹ Anterior / Próxima › no fim da caixa. Reinicia quando a
  // pesquisa/filtro muda (o resultado é outro).
  const [page, setPage] = useState(0)
  // Menu kebab aberto (id do item) — fecha com o backdrop ou outra escolha.
  const [kebabId, setKebabId] = useState(null)
  // Reset da página em microtask — setState síncrono no corpo do
  // effect é sinalizado pelo react-hooks/set-state-in-effect.
  useEffect(() => {
    queueMicrotask(() => setPage(0))
  }, [query, filter, sort])

  // Carregamento único — o effect inicial e o refetch pós-criação
  // ("Adicionar ao Catálogo") partilham-no, para o fármaco recém-criado
  // aparecer na lista sem recarregar a página.
  const load = useCallback(async () => {
    const res = await getMyStockSnapshot()
    if (res.ok) setItems(res.items)
    else setItems([])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    const rows = items.filter((it) => {
      // Retirados (0014) só aparecem no chip Lixeira — nunca na lista
      // normal, nem em «Todos», nem em «Não disponível».
      const retirado = Boolean(it.retired_at)
      if (filter !== 'retired' && retirado) return false
      if (filter === 'retired') {
        if (!retirado) return false
        if (
          q &&
          !it.name.toLowerCase().includes(q) &&
          !(it.molecule || '').toLowerCase().includes(q)
        ) {
          return false
        }
        return true
      }
      if (
        q &&
        !it.name.toLowerCase().includes(q) &&
        !(it.molecule || '').toLowerCase().includes(q)
      ) {
        return false
      }
      if (filter === 'in') return it.in_stock
      if (filter === 'out') return !it.in_stock
      if (filter === 'exp') {
        // Mesma fonte das tags de validade — inclui expirados e as janelas 90/60/30.
        const s = it.in_stock ? expiryStatus(it.expires_at) : null
        return s != null && s.level !== 'ok'
      }
      return true
    })
    const cmp = {
      recent: (a, b) => {
        // De sempre: disponíveis primeiro (o que a farmácia geriu fica à mão).
        return Number(b.in_stock) - Number(a.in_stock)
      },
      name: (a, b) => (a.name || '').localeCompare(b.name || '', 'pt'),
      qty: (a, b) => {
        // Descendente e sem stock (null) ao fundo.
        return (b.quantity ?? -1) - (a.quantity ?? -1)
      },
      price: (a, b) => (b.price ?? -1) - (a.price ?? -1),
      expiry: (a, b) => {
        // O mais próximo de vencer primeiro; sem validade ao fundo.
        if (!a.expires_at) return 1
        if (!b.expires_at) return -1
        return String(a.expires_at).localeCompare(String(b.expires_at))
      },
    }[sort]
    return [...rows].sort(cmp)
  }, [items, query, filter, sort])

  // Contagens dos chips — sobre a lista COMPLETA (não a filtrada), para
  // funcionarem como atalhos de "quantos há em cada estado".
  const counts = useMemo(() => {
    const c = { all: 0, in: 0, out: 0, exp: 0, retired: 0 }
    for (const it of items || []) {
      if (it.retired_at) {
        c.retired += 1
        continue // retirados não contam nos chips do catálogo
      }
      c.all += 1
      if (it.in_stock) {
        c.in += 1
        const s = expiryStatus(it.expires_at)
        if (s != null && s.level !== 'ok') c.exp += 1
      } else {
        c.out += 1
      }
    }
    return c
  }, [items])

  const stockCount = (items || []).filter((it) => it.in_stock).length

  // Paginação da lista — fatia do resultado já filtrado/ordenado.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const pgFrom = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const pgTo = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)
  // Itens desactualizados — a CONTAGEM, para o banner voltar quando a
  // situação piora (o fecho (X) guarda a baseline, não dispensa para sempre).
  const staleCount = (items || []).filter(
    (it) =>
      it.in_stock &&
      it.confirmed_at &&
      now - new Date(it.confirmed_at).getTime() > 5 * 24 * 3600 * 1000,
  ).length
  const stale = staleCount > 0

  // Aviso de validade a 90 / 60 / 30 dias (e já expirados). Só conta o que
  // está marcado como "temos" — validade de produto que já não há não interessa.
  const expiryBuckets = useMemo(() => countExpiryBuckets(items), [items])
  const expiryMessage = expirySummary(expiryBuckets)

  // ── Acks dos banners (localStorage, estado de UI pessoal) ──
  // Fechar (X) grava a "baseline" da situação naquele momento; o banner
  // SÓ volta se a situação piorar (mais desactualizados, mais expirados).
  // Se a situação melhorar, a baseline recalcula — o próximo agravamento
  // volta a avisar. Nada disto impõe a decisão aos colegas: é por browser.
  const [bannerAcks, setBannerAcks] = useState({})
  useEffect(() => {
    try {
      setBannerAcks(JSON.parse(window.localStorage.getItem('cf-stock-banner-acks') || '{}'))
    } catch {
      /* sem storage: banners sempre visíveis — inofensivo */
    }
  }, [])
  const dismissBanner = (kind, data) => {
    const next = { ...bannerAcks, [kind]: { ...data, ts: Date.now() } }
    setBannerAcks(next)
    try {
      window.localStorage.setItem('cf-stock-banner-acks', JSON.stringify(next))
    } catch {
      /* sem storage: fecha só para esta sessão */
    }
  }
  // Baseline recalcula quando a situação MELHORA (senão, fechado com 2
  // expirados, um novo expirado depois de corrigir os 2 ficava escondido).
  useEffect(() => {
    const a = bannerAcks.expiry
    if (!a) return
    if (
      (expiryBuckets.expired || 0) < (a.expired || 0) ||
      (expiryBuckets['30'] || 0) < (a['30'] || 0) ||
      (expiryBuckets['60'] || 0) < (a['60'] || 0) ||
      (expiryBuckets['90'] || 0) < (a['90'] || 0)
    ) {
      const next = { ...bannerAcks }
      delete next.expiry
      setBannerAcks(next)
      try {
        window.localStorage.setItem('cf-stock-banner-acks', JSON.stringify(next))
      } catch {
        /* noop */
      }
    }
  }, [expiryBuckets, bannerAcks])
  useEffect(() => {
    const a = bannerAcks.stale
    if (!a) return
    if (staleCount < (a.count || 0)) {
      const next = { ...bannerAcks }
      delete next.stale
      setBannerAcks(next)
      try {
        window.localStorage.setItem('cf-stock-banner-acks', JSON.stringify(next))
      } catch {
        /* noop */
      }
    }
  }, [staleCount, bannerAcks])
  // Visibilidade: banner visível se NÃO fechado, ou se a situação piorou
  // em relação à baseline guardada no fecho.
  const showStale = stale && (!bannerAcks.stale || staleCount > (bannerAcks.stale.count || 0))
  const showExpiry =
    Boolean(expiryMessage) &&
    (() => {
      const a = bannerAcks.expiry
      if (!a) return true
      return (
        (expiryBuckets.expired || 0) > (a.expired || 0) ||
        (expiryBuckets['30'] || 0) > (a['30'] || 0) ||
        (expiryBuckets['60'] || 0) > (a['60'] || 0) ||
        (expiryBuckets['90'] || 0) > (a['90'] || 0)
      )
    })()

  const save = async (it, patch) => {
    const next = { ...it, ...patch }
    setSavingId(it.drug_id)
    setToast('')
    // As datas são opcionais e podem não vir no patch (ex.: mudar só a
    // quantidade). Nesse caso reenvia-se o valor actual — e não '' — senão a
    // data seria apagada sem o utilizador lhe ter tocado.
    const asDateInput = (v) => (v ? String(v).slice(0, 10) : '')
    const res = await updateStockItem({
      drugId: it.drug_id,
      inStock: next.in_stock,
      quantity: next.quantity ?? '',
      price: next.price ?? '',
      availableFrom: patch.available_from_input ?? asDateInput(it.available_from),
      expiresAt: patch.expires_at_input ?? asDateInput(it.expires_at),
      // Origem/marca/foto só viajam quando o patch as trouxe (o modal
      // envia sempre; os toggles da fila/atenção nunca) — evita apagar
      // o que estava num guardado que não tocou nestes campos.
      ...(patch.origin !== undefined && { origin: patch.origin }),
      ...(patch.brand !== undefined && { brand: patch.brand }),
      ...(patch.image_path !== undefined && { imagePath: patch.image_path }),
      // Estrutura da caixa (0016) — só quando o patch a trouxe (o modal
      // envia sempre; os toggles da fila/atenção nunca).
      ...(patch.packLaminas !== undefined && { packLaminas: patch.packLaminas }),
      ...(patch.packComprimidos !== undefined && { packComprimidos: patch.packComprimidos }),
    })
    setSavingId(null)
    if (res.ok) {
      setItems((list) =>
        list.map((row) =>
          row.drug_id === it.drug_id
            ? {
                ...next,
                origin: patch.origin !== undefined ? patch.origin || null : row.origin,
                brand: patch.brand !== undefined ? patch.brand || null : row.brand,
                image_path:
                  patch.image_path !== undefined ? patch.image_path || null : row.image_path,
                ...(patch.packLaminas !== undefined && {
                  pack_laminas: patch.packLaminas === '' ? null : Number(patch.packLaminas),
                }),
                ...(patch.packComprimidos !== undefined && {
                  pack_comprimidos:
                    patch.packComprimidos === '' ? null : Number(patch.packComprimidos),
                }),
                confirmed_at: new Date().toISOString(),
                stock_item_id: row.stock_item_id || 'x',
              }
            : row,
        ),
      )
      setToast('Guardado — visível no Localizador imediatamente.')
      setTimeout(() => setToast(''), 2500)
      return true
    }
    setToast(ERRORES[res.error] || 'Erro inesperado.')
    return false
  }

  /**
   * RETIRAR (lixeira, 0014) — a confirmação é o modal ConfirmRetire
   * (estilizado), que chama isto. Sem window.confirm duplo.
   */
  const retire = async (it) => {
    setSavingId(it.drug_id)
    setToast('')
    const res = await retireStockItem({ drugId: it.drug_id })
    setSavingId(null)
    if (res.ok) {
      setItems((list) =>
        list.map((row) =>
          row.drug_id === it.drug_id
            ? { ...row, retired_at: new Date().toISOString(), in_stock: false }
            : row,
        ),
      )
      setToast(`"${it.name}" retirado — visível na Lixeira.`)
      setTimeout(() => setToast(''), 3000)
    } else {
      setToast(ERRORES[res.error] || 'Erro inesperado.')
    }
  }

  /** RESTAURAR da lixeira: volta à lista como «não disponível». */
  const restore = async (it) => {
    setSavingId(it.drug_id)
    setToast('')
    const res = await restoreStockItem({ drugId: it.drug_id })
    setSavingId(null)
    if (res.ok) {
      setItems((list) =>
        list.map((row) =>
          row.drug_id === it.drug_id ? { ...row, retired_at: null, in_stock: false } : row,
        ),
      )
      setToast(`"${it.name}" restaurado — religue no modal quando quiser.`)
      setTimeout(() => setToast(''), 3000)
    } else {
      setToast(ERRORES[res.error] || 'Erro inesperado.')
    }
  }

  /** Guarda a partir do modal e fecha-o se correu bem. */
  const saveFromModal = async (it, patch) => {
    const ok = await save(it, patch)
    if (!ok) return
    // Opções de venda (0012): gravação separada da linha de stock —
    // falhar opções não desfaz o stock. Fecha se ambas passarem.
    if (patch.sale_options && it.stock_item_id) {
      const res = await setSaleOptions({
        drugId: it.drug_id,
        options: patch.sale_options,
      })
      if (!res.ok) {
        setToast(
          res.error === 'UNIDADE_INVALIDA'
            ? 'Forma de venda inválida.'
            : res.error === 'PRECO_INVALIDO'
              ? 'Preço de uma forma de venda inválido.'
              : res.error === 'PACK_INVALIDO'
                ? '“Contém” tem de ser ≥ 1.'
                : res.error === 'DEFAULT_MULTIPLO'
                  ? 'Só uma forma pode ser padrão.'
                  : 'Não foi possível guardar as formas de venda.',
        )
        return
      }
      setItems((list) =>
        list.map((row) =>
          row.drug_id === it.drug_id
            ? {
                ...row,
                sale_options: patch.sale_options.map((o, i) => ({
                  id: `tmp-${i}`,
                  stock_item_id: row.stock_item_id,
                  unit: o.unit,
                  pack_size: Number(o.packSize) || 1,
                  price: o.price === '' ? null : Number(o.price),
                  is_default: o.isDefault,
                  active: o.active,
                })),
              }
            : row,
        ),
      )
    }
    setEditing(null)
  }

  return (
    <section className="portal-section">
      {/* Padrão único do portal (mockup padrao-unico.html): cabeçalho
          compacto à esquerda com a acção primária à direita — sem hero
          gigante; a página começa a trabalhar logo. */}
      <div className="portal-page-head">
        <div>
          <h1 className="portal-page-title">Stock</h1>
          <p className="portal-page-sub">
            <b>{stockCount}</b> de {items ? items.length : '…'} medicamentos marcados como
            “disponível” — visível no Localizador agora.
          </p>
        </div>
        <div className="portal-page-head-acts">
          <button
            type="button"
            className="btn btn-secondary"
            data-tour="nova-entrada"
            onClick={() => setRestockOpen(true)}
          >
            + Nova entrada
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + Adicionar medicamento
          </button>
        </div>
      </div>

      {/* Drawer de entrada rápida — formulário fora da página. */}
      <RestockDrawer open={restockOpen} onClose={() => setRestockOpen(false)} />

      {showStale && (
        <div className="portal-banner" role="status">
          <span>
            {staleCount === 1
              ? 'O seu stock está desactualizado — actualize para voltar a aparecer como «confirmado» no Localizador.'
              : `${staleCount} produtos com stock desactualizado — actualize para voltarem a aparecer como «confirmados» no Localizador.`}
          </span>
          <button
            type="button"
            className="portal-banner-close"
            aria-label="Dispensar este lembrete (volta se a situação piorar)"
            title="Dispensar — volta se a situação piorar"
            onClick={() => dismissBanner('stale', { count: staleCount })}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {showExpiry && (
        <div className="portal-banner portal-banner--danger" role="alert">
          <span>
            Validade: {expiryMessage}. Os produtos com validade passada deixam de aparecer no
            Localizador até a validade ser corrigida.
          </span>
          <button
            type="button"
            className="portal-banner-close"
            aria-label="Dispensar este lembrete (volta se a situação piorar)"
            title="Dispensar — volta se a situação piorar"
            onClick={() => dismissBanner('expiry', { ...expiryBuckets })}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* KPIs de resumo (refs 4/6): contagens REAIS do snapshot —
          ícone à esquerda, estado = ponto + palavra à direita. */}
      {!compact && (
        <div className="portal-kpi4-grid">
          <div className="portal-kpi4">
            <span className="portal-kpi4-ic portal-kpi4-ic--green" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h16v12H4z" />
                <path d="M9 8V5h6v3" />
                <path d="M4 13h16" />
              </svg>
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">Disponíveis</span>
              <span className="portal-kpi4-n">{counts.in}</span>
              <span className="portal-kpi4-d">de {counts.all} no catálogo</span>
            </span>
            <span className="portal-st portal-st--ok">
              <i />
              no Localizador
            </span>
          </div>

          <div className="portal-kpi4">
            <span className="portal-kpi4-ic portal-kpi4-ic--gray" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">Sem stock</span>
              <span className="portal-kpi4-n">{counts.out}</span>
              <span className="portal-kpi4-d">de {counts.all} no catálogo</span>
            </span>
            <span className="portal-st portal-st--mut">
              <i />
              ocultos
            </span>
          </div>

          <div className="portal-kpi4">
            <span className="portal-kpi4-ic portal-kpi4-ic--amber" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">Validade a vencer</span>
              <span className="portal-kpi4-n">{counts.exp}</span>
              <span className="portal-kpi4-d">nos próximos 90 dias (ou já passada)</span>
            </span>
            {counts.exp > 0 ? (
              <span className="portal-st portal-st--strong">
                <i />
                rever
              </span>
            ) : (
              <span className="portal-st portal-st--ok">
                <i />
                em dia
              </span>
            )}
          </div>

          <div className="portal-kpi4">
            <span className="portal-kpi4-ic portal-kpi4-ic--amber" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
            </span>
            <span className="portal-kpi4-txt">
              <span className="portal-kpi4-k">Desactualizados</span>
              <span className="portal-kpi4-n">{staleCount}</span>
              <span className="portal-kpi4-d">sem reconfirmar há mais de 5 dias</span>
            </span>
            {staleCount > 0 ? (
              <span className="portal-st portal-st--warn">
                <i />
                reconfirmar
              </span>
            ) : (
              <span className="portal-st portal-st--ok">
                <i />
                em dia
              </span>
            )}
          </div>
        </div>
      )}

      {/* Caixa da lista (o .box do mock): cabeçalho com pesquisa e
          ordenação, tabs sublinhadas com contagens, linhas arejadas
          com kebab por linha e paginação no fim. */}
      {!compact && (
        <div className="portal-box">
          <div className="portal-sec-head">
            <h2>Medicamentos</h2>
            <div className="portal-sec-tools">
              <label className="portal-sec-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  placeholder="Pesquisar por nome ou forma…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Pesquisar medicamento no painel"
                />
              </label>
              <div
                className="stock-sort inline-flex rounded-full border overflow-hidden"
                role="group"
                aria-label="Ordenar medicamentos"
              >
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`stock-sort-btn ${sort === s.id ? 'active' : ''}`}
                    onClick={() => setSort(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs sublinhadas no lugar dos chips — contagem neutra ao
              lado do rótulo (disciplina do v2: sem chip colorido). */}
          <div
            className="portal-undertabs"
            role="group"
            aria-label="Filtrar medicamentos por estado"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? 'active' : ''}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <span className="portal-cnt">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {items === null && (
            <div className="empty-state" role="status">
              <div className="spinner" />
            </div>
          )}

          {items !== null && filtered.length === 0 && (
            <div className="portal-rows-empty">
              <b>{query ? 'Nada encontrado' : 'Sem medicamentos'}</b>
              {query
                ? `Nada encontrado para “${query}” — experimente outro nome ou forma farmacêutica.`
                : 'Sem medicamentos no catálogo. Use «+ Adicionar medicamento» para criar o primeiro.'}
            </div>
          )}

          {!compact && pageItems.length > 0 && (
            <>
              {/* Cabeçalho das colunas — rótulos micro sobre as linhas. */}
              <div className="portal-rowhead portal-cols-stock" aria-hidden="true">
                <span>Medicamento</span>
                <span>Estado</span>
                <span>Qtd.</span>
                <span>Formas de venda</span>
                <span>Validade</span>
                <span />
              </div>
              {pageItems.map((it) => {
                const expiry = expiryStatus(it.expires_at)
                const coming = it.available_from && new Date(it.available_from).getTime() > now

                // Menu kebab aberto para este item?
                const kebabOpen = kebabId === it.drug_id
                const kebab = (
                  <div className="portal-kebab-wrap">
                    <button
                      type="button"
                      className="portal-kebab"
                      aria-label={`Opções de ${it.name}`}
                      aria-expanded={kebabOpen}
                      onClick={(e) => {
                        e.stopPropagation()
                        setKebabId(kebabOpen ? null : it.drug_id)
                      }}
                    >
                      ⋯
                    </button>
                    {kebabOpen && (
                      <div className="portal-kebab-menu" role="menu">
                        {it.retired_at ? (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={savingId === it.drug_id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setKebabId(null)
                              restore(it)
                            }}
                          >
                            {savingId === it.drug_id ? '…' : 'Restaurar da lixeira'}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation()
                                setKebabId(null)
                                setEditing(it)
                              }}
                            >
                              Editar quantidade e preço
                            </button>
                            <Link
                              href={`/portal/entrada?drug=${it.drug_id}`}
                              role="menuitem"
                              onClick={() => setKebabId(null)}
                            >
                              Registar entrada de stock
                            </Link>
                            <button
                              type="button"
                              role="menuitem"
                              className="portal-kebab-danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                setKebabId(null)
                                setConfirming(it)
                              }}
                            >
                              Retirar do catálogo
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )

                // Lixeira (0014): linha simples com restaurar no kebab.
                if (it.retired_at) {
                  return (
                    <div
                      key={it.drug_id}
                      className="portal-rowline portal-cols-stock portal-rowline--static"
                    >
                      <div className="portal-cell">
                        <b>{it.name}</b>
                        <span className="sub">
                          {[it.form, it.dosage].filter(Boolean).join(' · ')}
                          {it.requires_rx ? ' · Receita' : ''}
                        </span>
                      </div>
                      <div className="portal-cell">
                        <StateLabel st="mut" label="Na lixeira" />
                      </div>
                      <div className="portal-cell">
                        <span className="strong">—</span>
                      </div>
                      <div className="portal-cell">
                        <span className="tiny">
                          Retirado{' '}
                          <span
                            title={`Retirado em ${new Date(it.retired_at).toLocaleString('pt-PT', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`}
                          >
                            {timeAgo(it.retired_at, now)}
                          </span>
                        </span>
                      </div>
                      <div className="portal-cell">
                        <span className="dim">—</span>
                      </div>
                      {kebab}
                    </div>
                  )
                }

                // Linha normal — clique abre o modal de edição (o "drawer"
                // do mock); o kebab vive à direita e não abre o modal.
                const st = (() => {
                  if (coming) {
                    return {
                      cls: 'warn',
                      txt: `Chega ${new Date(it.available_from).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}`,
                    }
                  }
                  if (it.in_stock) return { cls: 'ok', txt: 'Disponível' }
                  return { cls: 'mut', txt: 'Sem stock' }
                })()

                return (
                  <div
                    key={it.drug_id}
                    className="portal-rowline portal-cols-stock"
                    role="button"
                    tabIndex={0}
                    title="Editar quantidade, validade e preço"
                    onClick={() => setEditing(it)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEditing(it)
                      }
                    }}
                  >
                    <div className="portal-cell">
                      <b>
                        {it.name}
                        {it.requires_rx && <span className="rx-badge"> Receita</span>}
                        {it.pending && (
                          <span
                            className="pending-badge"
                            title="Criado por esta farmácia — visível aos clientes após validação da equipa Conheça Farmácia."
                          >
                            {' '}
                            Aguarda validação
                          </span>
                        )}
                      </b>
                      <span className="sub">
                        {[it.form, it.dosage].filter(Boolean).join(' · ')}
                        {it.in_stock && !coming && it.confirmed_at
                          ? ` · confirmado ${timeAgo(it.confirmed_at, now)}`
                          : ''}
                      </span>
                    </div>

                    <div className="portal-cell">
                      <StateLabel st={st.cls} label={st.txt} />
                    </div>

                    <div className="portal-cell">
                      <span className="strong">
                        {it.in_stock && it.quantity != null && it.quantity !== ''
                          ? it.quantity
                          : '—'}
                      </span>
                    </div>

                    {/* Formas de venda em pills neutras + preço quando há. */}
                    <div className="portal-cell">
                      {(it.sale_options || [])
                        .filter((o) => o.active !== false)
                        .slice(0, 3)
                        .map((o) => (
                          <span key={o.id} className="portal-pill">
                            {unitLabel(o.unit)}
                            {o.price != null ? ` ${o.price}` : ''}
                          </span>
                        ))}
                      {(it.sale_options || []).filter((o) => o.active !== false).length === 0 &&
                        it.in_stock &&
                        it.price != null &&
                        it.price !== '' && <span className="portal-pill">{it.price} Kz</span>}
                    </div>

                    {/* Validade — texto âmbar só quando exige leitura. */}
                    <div className="portal-cell">
                      {it.in_stock && !coming && expiry && expiry.level !== 'ok' ? (
                        <span className={`expiry-tag expiry-tag--${expiry.level}`}>
                          {expiry.level === 'expired' ? 'Expirado' : expiry.label}
                        </span>
                      ) : (
                        <span className="dim">{monthYear(it.expires_at) || '—'}</span>
                      )}
                    </div>

                    {kebab}
                  </div>
                )
              })}
            </>
          )}

          {/* Paginação (refs 4/6): contagem à esquerda, ‹ › à direita. */}
          {!compact && filtered.length > 0 && (
            <div className="portal-pgbar">
              <span className="portal-pginfo">
                A mostrar {pgFrom}–{pgTo} de {filtered.length}
                {filter !== 'all'
                  ? ` (${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()})`
                  : ''}
              </span>
              {pageCount > 1 && (
                <div className="portal-pgbtns">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => {
                      setPage(safePage - 1)
                      window.scrollTo({ top: 0 })
                    }}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => {
                      setPage(safePage + 1)
                      window.scrollTo({ top: 0 })
                    }}
                  >
                    Próxima →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backdrop do menu kebab — tocar fora fecha. */}
      {kebabId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          aria-hidden="true"
          onClick={() => setKebabId(null)}
        />
      )}

      {toast && (
        <p className="portal-toast" role="status">
          {toast}
        </p>
      )}

      {editing === 'new' && (
        <div
          className="stock-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-modal-new-title"
        >
          <div className="stock-modal-scrim" onClick={() => setEditing(null)} aria-hidden="true" />
          <div className="stock-modal-card">
            <div className="portal-section-head" style={{ marginBottom: 0 }}>
              <h3 id="stock-modal-new-title" className="portal-h2">
                Novo medicamento
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setEditing(null)}
                aria-label="Fechar"
              >
                Fechar
              </button>
            </div>
            <DrugCreateForm
              embedded
              onCreated={() => {
                setEditing(null)
                load() // o novo fármaco entra já na lista
              }}
            />
          </div>
        </div>
      )}

      {editing && editing !== 'new' && (
        <StockEditModal
          item={editing}
          saving={savingId != null}
          onClose={() => setEditing(null)}
          onSave={(patch) => saveFromModal(editing, patch)}
          onRetire={(it) => {
            setEditing(null)
            setConfirming(it)
          }}
        />
      )}

      {confirming && (
        <ConfirmRetire
          item={confirming}
          busy={savingId === confirming.drug_id}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const it = confirming
            setConfirming(null)
            retire(it)
          }}
        />
      )}
    </section>
  )
}
