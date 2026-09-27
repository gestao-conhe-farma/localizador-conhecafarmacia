'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getMyStockSnapshot,
  updateStockItem,
  uploadDrugImage,
  retireStockItem,
  restoreStockItem,
} from '@/lib/actions/pharmacy-portal'
import { createClient } from '@/lib/supabase/client'
import { compressDrugImage } from '@/lib/image-compress'
import { countExpiryBuckets, expiryStatus, expirySummary } from '@/lib/expiry'
import DrugCreateForm from '@/components/portal/DrugCreateForm'
import { setSaleOptions } from '@/lib/actions/pharmacy-portal'
import { CloseIcon } from '@/components/ui/Icon'

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
              sale_options: opts,
              origin,
              brand,
              image_path: imagePath,
            })
          }}
        >
          <div className="portal-form-grid portal-form-grid--three">
            <label className="portal-label">
              Caixas / unidades
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
          </div>

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

          {/* Como vende este medicamento? (0012) — só faz sentido com
              stock; para item esgotado as opções esperam a reposição. */}
          <div className="sale-opts">
            <div className="sale-opts-head">
              <b>Como vende este medicamento?</b>
              <span className="sale-opts-hint">
                Ex.: lâmina 100 Kz · caixa com 3 lâminas 300 Kz. O saldo acima é contado na unidade
                marcada como padrão.
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
                — vai para a Lixeira (restaurável). Separdo por linha. */}
            <button
              type="button"
              className="stock-retire-btn"
              disabled={saving}
              onClick={() => {
                if (
                  window.confirm(
                    `Retirar "${item.name}" do seu catálogo?\n\nO medicamento desaparece do Localizador e fica na Lixeira, onde pode ser restaurado.`,
                  )
                ) {
                  onRetire(item)
                }
              }}
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
  const [filter, setFilter] = useState('all')
  // Ordenação do grid — 'recent' é a de sempre: disponíveis primeiro.
  const [sort, setSort] = useState('recent')
  const [savingId, setSavingId] = useState(null)
  const [toast, setToast] = useState('')
  // Item em edição no modal (null = fechado).
  const [editing, setEditing] = useState(null)
  // "Agora" vive em estado — Date.now() no render é impuro (react-hooks/
  // purity) e o relógio vem de graça: os "Confirmado há X min" refrescam
  // sozinhos a cada minuto. (setState só no interval, nunca síncrono no
  // effect — react-hooks/set-state-in-effect.)
  const [now, setNow] = useState(MOUNT_NOW)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Scroll infinito: quantos cards do resultado filtrado já se mostram.
  // Reinicia quando a pesquisa/filtro muda (o resultado é outro).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)
  // Reset do contador assíncrono (microtask) — setState síncrono no corpo
  // do effect é sinalizado pelo react-hooks/set-state-in-effect.
  useEffect(() => {
    queueMicrotask(() => setVisibleCount(PAGE_SIZE))
  }, [query, filter, sort])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || items === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => n + PAGE_SIZE)
        }
      },
      { rootMargin: '600px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [items])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await getMyStockSnapshot()
      if (alive && res.ok) setItems(res.items)
      else if (alive) setItems([])
    })()
    return () => {
      alive = false
    }
  }, [])

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
  const stale = (items || []).some(
    (it) =>
      it.in_stock &&
      it.confirmed_at &&
      now - new Date(it.confirmed_at).getTime() > 5 * 24 * 3600 * 1000,
  )

  // Aviso de validade a 90 / 60 / 30 dias (e já expirados). Só conta o que
  // está marcado como "temos" — validade de produto que já não há não interessa.
  const expiryBuckets = useMemo(() => countExpiryBuckets(items), [items])
  const expiryMessage = expirySummary(expiryBuckets)

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

  /** RETIRAR (lixeira, 0014): confirma, marca retired_at, remove da lista. */
  const retire = async (it) => {
    if (
      !window.confirm(
        `Retirar "${it.name}" do seu catálogo?\n\nO medicamento desaparece do Localizador e desta lista — fica na Lixeira, onde pode ser restaurado.`,
      )
    ) {
      return
    }
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
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          + Adicionar medicamento
        </button>
      </div>

      {stale && (
        <div className="portal-banner" role="status">
          O seu stock está desactualizado — actualize para voltar a aparecer como «confirmado» no
          Localizador.
        </div>
      )}

      {expiryMessage && (
        <div className="portal-banner portal-banner--danger" role="alert">
          Validade: {expiryMessage}. Os produtos com validade passada deixam de aparecer no
          Localizador até a validade ser corrigida.
        </div>
      )}

      {/* Toolbar única — pesquisa à esquerda, chips ao lado e ordenação
          à direita, numa só linha (padrão único do portal). */}
      <div className="portal-toolbar">
        <div className="stock-search-wrap">
          <span className="stock-search-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="search"
            className="portal-input portal-search"
            placeholder="Pesquisar medicamento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar medicamento no painel"
          />
        </div>
        <div className="portal-chips" role="group" aria-label="Filtrar medicamentos por estado">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`portal-chip${filter === f.id ? ' portal-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <span className="portal-chip-n">{counts[f.id]}</span>
            </button>
          ))}
        </div>

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

      {items === null && (
        <div className="empty-state" role="status">
          <div className="spinner" />
        </div>
      )}

      {items !== null && filtered.length === 0 && (
        <div className="empty-state">
          <p className="empty-sub">
            {query ? 'Nada encontrado para esta pesquisa.' : 'Sem medicamentos no catálogo.'}
          </p>
        </div>
      )}

      {!compact && filtered.length > visibleCount && (
        <p className="stock-grid-count" role="status">
          A mostrar {visibleCount} de {filtered.length} medicamentos
        </p>
      )}

      {!compact && (
        <div className="stock-grid">
          {filtered.slice(0, visibleCount).map((it) => {
            const expiry = expiryStatus(it.expires_at)
            const coming = it.available_from && new Date(it.available_from).getTime() > now
            // Card na Lixeira: só nome, meta e o botão de restaurar.
            if (it.retired_at) {
              return (
                <article key={it.drug_id} className="stock-card stock-card--retired">
                  <div className="stock-card-top">
                    <span className="stock-card-name-btn stock-card-name--static">{it.name}</span>
                    {it.requires_rx && <span className="rx-badge">Receita</span>}
                  </div>
                  <p className="stock-card-meta">
                    {[it.form, it.dosage].filter(Boolean).join(' · ')}
                  </p>
                  <div className="stock-card-foot">
                    <span className="stock-card-hint">Retirado do catálogo</span>
                    <button
                      type="button"
                      className="portal-toggle"
                      disabled={savingId === it.drug_id}
                      onClick={() => restore(it)}
                    >
                      {savingId === it.drug_id ? '…' : 'Restaurar'}
                    </button>
                  </div>
                </article>
              )
            }
            return (
              <article
                key={it.drug_id}
                className={`stock-card${it.in_stock ? ' stock-card--in' : ''}${
                  coming ? ' stock-card--coming' : ''
                }`}
              >
                <div className="stock-card-top">
                  <button
                    type="button"
                    className="stock-card-name-btn"
                    onClick={() => setEditing(it)}
                    title="Editar quantidade, validade e preço"
                  >
                    {it.name}
                  </button>
                  {it.requires_rx && <span className="rx-badge">Receita</span>}
                </div>

                <p className="stock-card-meta">
                  {[it.form, it.dosage].filter(Boolean).join(' · ')}
                </p>

                {/* Estado: disponível / a chegar / não disponível — o mesmo
                    papel da linha "N medicamentos agora" do ph-card. */}
                <div className="stock-card-tags">
                  {it.in_stock && it.quantity != null && it.quantity !== '' && (
                    <span className="stock-tag">{it.quantity} un.</span>
                  )}
                  {it.in_stock && it.price != null && it.price !== '' && (
                    <span className="stock-tag">{it.price} Kz</span>
                  )}
                  {coming && (
                    <span className="portal-eta stock-tag--eta">
                      Chega{' '}
                      {new Date(it.available_from).toLocaleDateString('pt-PT', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  )}
                  {it.in_stock && !coming && expiry && (
                    <span className={`expiry-tag expiry-tag--${expiry.level} stock-tag--expiry`}>
                      {expiry.label}
                    </span>
                  )}
                </div>

                <div className="stock-card-foot">
                  {it.in_stock && !coming && it.confirmed_at && (
                    <span className="stock-confirmed-at">
                      <span className="confirmed-dot" />
                      Confirmado {timeAgo(it.confirmed_at, now)}
                    </span>
                  )}
                  {!it.in_stock && <span className="stock-card-hint">Sem stock registado</span>}
                  <button
                    type="button"
                    className={`portal-toggle${it.in_stock ? ' portal-toggle--on' : ''}`}
                    disabled={savingId === it.drug_id}
                    onClick={() => setEditing(it)}
                    aria-pressed={it.in_stock}
                  >
                    {savingId === it.drug_id ? '…' : it.in_stock ? 'Disponível' : 'Não disponível'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Sentinela do scroll infinito — fica após o grid; quando entra no
          viewport (com 600px de antecedência), a próxima página carrega. */}
      {!compact && filtered.length > visibleCount && (
        <div ref={sentinelRef} className="stock-grid-sentinel" aria-hidden="true">
          <div className="spinner" />
        </div>
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
            <DrugCreateForm embedded onCreated={() => setEditing(null)} />
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
            retire(it)
          }}
        />
      )}
    </section>
  )
}
