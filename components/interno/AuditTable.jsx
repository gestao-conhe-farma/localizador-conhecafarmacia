'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { dataHora, haQuanto } from '@/components/interno/formatos'
import { roleLabel } from '@/lib/platform/permissions'

/**
 * Tabela da trilha de auditoria, com o antes/depois expansível (Task 8.1).
 *
 * Porque é um Client Component: o detalhe abre e fecha sem um pedido ao
 * servidor. As linhas chegam já prontas do servidor (a página autoriza e lê),
 * por isso aqui não há decisões de permissão — só apresentação.
 *
 * Uma linha aberta de cada vez: quem está a comparar dois registos quer os
 * dois à vista, e cinco diffs abertos ao mesmo tempo são uma parede de JSON
 * onde já não se sabe qual é qual.
 */
function valor(valor) {
  if (valor === undefined) return '—'
  if (typeof valor === 'string') return JSON.stringify(valor)
  return JSON.stringify(valor)
}

/** Só os campos que mudaram — alguns registos antigos guardam chaves iguais. */
function camposDoDiff(before, after) {
  const b = before || {}
  const a = after || {}
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (campo) => valor(b[campo]) !== valor(a[campo]),
  )
}

function Detalhe({ r }) {
  const campos = camposDoDiff(r.before, r.after)

  return (
    <div className="interno-audit-detail-in">
      <dl className="interno-dl">
        <div className="interno-dl-row">
          <dt>Quando</dt>
          <dd>{dataHora(r.quando)}</dd>
        </div>
        <div className="interno-dl-row">
          <dt>Autor</dt>
          <dd>
            {r.actorEmail || 'conta apagada'}
            {r.actorRole ? (
              <span className="interno-foot-sub"> · {roleLabel(r.actorRole) || r.actorRole}</span>
            ) : null}
          </dd>
        </div>
        <div className="interno-dl-row">
          <dt>Acção</dt>
          <dd>
            <code className="interno-audit-action">{r.action}</code>{' '}
            <span className="interno-hint">{r.acaoRotulo}</span>
          </dd>
        </div>
        <div className="interno-dl-row">
          <dt>Farmácia</dt>
          <dd>
            {r.pharmacyId ? (
              <Link href={`/interno/farmacias/${r.pharmacyId}`} className="interno-table-link">
                {r.farmacia || r.pharmacyId}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="interno-dl-row">
          <dt>Tabela / registo</dt>
          <dd>
            {r.table ? <code>{r.table}</code> : '—'}
            {r.recordId ? <span className="interno-foot-sub"> · {r.recordId}</span> : null}
          </dd>
        </div>
        <div className="interno-dl-row">
          <dt>Pedido</dt>
          <dd>
            <code>{r.requestId || '—'}</code>
          </dd>
        </div>
        {(r.ip || r.userAgent) && (
          <div className="interno-dl-row">
            <dt>Origem</dt>
            <dd>
              {r.ip || '—'}
              {r.userAgent ? <span className="interno-foot-sub"> · {r.userAgent}</span> : null}
            </dd>
          </div>
        )}
        <div className="interno-dl-row">
          <dt>Motivo</dt>
          <dd>{r.reason || <span className="interno-hint">sem motivo registado</span>}</dd>
        </div>
      </dl>

      {campos.length === 0 ? (
        <p className="interno-hint">
          Este registo não tem antes/depois: é a marca de uma acção sem alteração de campos (ou de
          uma linha escrita antes de o diff existir).
        </p>
      ) : (
        <div className="interno-table-scroll">
          <table className="interno-diff-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => (
                <tr key={campo}>
                  <td>{campo}</td>
                  <td>{valor(r.before?.[campo])}</td>
                  <td>{valor(r.after?.[campo])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AuditTable({ rows }) {
  const [aberto, setAberto] = useState(null)

  return (
    <div className="interno-table-scroll">
      <table className="interno-table">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Autor</th>
            <th>Acção</th>
            <th>Alvo</th>
            <th>Motivo</th>
            <th aria-label="Detalhe" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expandido = aberto === r.id
            return (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    <span>{dataHora(r.quando)}</span>
                    <span className="interno-foot-sub">{haQuanto(r.quando)}</span>
                  </td>
                  <td>
                    <span>{r.actorEmail || 'conta apagada'}</span>
                    <span className="interno-foot-sub">
                      {roleLabel(r.actorRole) || r.actorRole || '—'}
                    </span>
                  </td>
                  <td>
                    <code className="interno-audit-action">{r.action}</code>
                    <span className="interno-foot-sub">{r.acaoRotulo}</span>
                  </td>
                  <td>
                    {r.pharmacyId ? (
                      <Link
                        href={`/interno/farmacias/${r.pharmacyId}`}
                        className="interno-table-link"
                      >
                        {r.farmacia || 'farmácia'}
                      </Link>
                    ) : (
                      <span className="interno-foot-sub">{r.table || '—'}</span>
                    )}
                    {r.recordId && <span className="interno-foot-sub">{r.recordId}</span>}
                  </td>
                  <td>
                    {r.reason ? (
                      <span className="interno-audit-reason">{r.reason}</span>
                    ) : (
                      <span className="interno-foot-sub">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="interno-btn interno-btn--ghost interno-btn--small"
                      aria-expanded={expandido}
                      aria-controls={`auditoria-detalhe-${r.id}`}
                      onClick={() => setAberto(expandido ? null : r.id)}
                    >
                      {expandido ? 'Fechar' : 'Detalhe'}
                    </button>
                  </td>
                </tr>
                {expandido && (
                  <tr id={`auditoria-detalhe-${r.id}`} className="interno-audit-detail">
                    <td colSpan={6}>
                      <Detalhe r={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
