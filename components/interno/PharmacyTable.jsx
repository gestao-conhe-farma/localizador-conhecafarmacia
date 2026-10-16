import Link from 'next/link'
import { describeAction } from '@/lib/platform/permissions'
import { haQuanto, pillActiva, pillPlano, textoPlano } from '@/components/interno/formatos'

/**
 * Tabela de farmácias da área interna (Task 5.1).
 *
 * As colunas operacionais só existem quando o nível as pode ver — e não é
 * aqui que isso se decide: a Server Action já devolveu uma lista SEM stock,
 * perfis, chaves e reservas para o `faturacao`. Esta condição serve só para
 * não desenhar colunas vazias; a autorização foi feita a montante, como
 * tem de ser.
 */
export default function PharmacyTable({ rows, scope }) {
  const operacao = scope?.operacao === true

  if (rows.length === 0) {
    return (
      <div className="interno-box interno-box--pad">
        <div className="interno-empty">
          <b>Nenhuma farmácia com estes filtros</b>
          <span>Limpe os filtros para ver o directório completo.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="interno-box">
      <div className="interno-table-scroll">
        <table className="interno-table">
          <thead>
            <tr>
              <th>Farmácia</th>
              <th>Estado</th>
              <th>Plano</th>
              <th>Contas</th>
              {operacao && <th>Stock confirmado</th>}
              {operacao && <th>Reservas</th>}
              {operacao && <th>Última acção</th>}
              <th aria-label="Abrir" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/interno/farmacias/${r.id}`} className="interno-table-link">
                    {r.name}
                  </Link>
                  <span className="interno-foot-sub">{r.municipio || '—'}</span>
                </td>
                <td>
                  <span className={pillActiva(r.active)}>{r.active ? 'Activa' : 'Inactiva'}</span>
                  <span className="interno-foot-sub">{r.verified ? 'Verificada' : 'Sem selo'}</span>
                </td>
                <td>
                  <span className={pillPlano(r.plano)} title={r.plano.statusLabel}>
                    {textoPlano(r.plano)}
                  </span>
                </td>
                <td>{r.contas}</td>
                {operacao && (
                  <td>
                    {r.stockUltimo ? (
                      <>
                        <span>{r.stockConfirmado} em stock</span>
                        <span className="interno-foot-sub">{haQuanto(r.stockUltimo)}</span>
                      </>
                    ) : (
                      <>
                        <span className="interno-pill interno-pill--warn">Nunca confirmou</span>
                        <span className="interno-foot-sub">sem stock reportado</span>
                      </>
                    )}
                  </td>
                )}
                {operacao && (
                  <td>
                    {r.reservasAbertas > 0 ? (
                      <span className="interno-pill interno-pill--info">
                        {r.reservasAbertas} abertas
                      </span>
                    ) : (
                      <span className="interno-foot-sub">—</span>
                    )}
                  </td>
                )}
                {operacao && (
                  <td>
                    {r.ultimaAccao ? (
                      <>
                        <span>{describeAction(r.ultimaAccao)}</span>
                        <span className="interno-foot-sub">{haQuanto(r.ultimaAccaoEm)}</span>
                      </>
                    ) : (
                      <span className="interno-foot-sub">Sem acções registadas</span>
                    )}
                  </td>
                )}
                <td>
                  <Link
                    href={`/interno/farmacias/${r.id}`}
                    className="interno-btn interno-btn--ghost interno-btn--small"
                  >
                    Abrir ficha
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
