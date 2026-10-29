import Notice from '@/components/ui/Notice'
import { dataHora, haQuanto } from '@/components/interno/formatos'

/**
 * Alertas de sistema no topo do painel (0048).
 *
 * Desenha-se a partir do que `getSystemAlerts()` devolveu, e só isso: não
 * há estado no cliente nem botão de fechar. Um alerta de backup fecha-se
 * quando o backup volta a correr bem, e é o workflow que o fecha.
 *
 * `falhou` existe para o caso incómodo: não conseguir LER os alertas não é
 * a mesma coisa que não haver nenhum, e tratá-los como iguais é deixar um
 * backup partido passar por um dia calmo.
 */
export default function AlertasSistema({ alertas = [], falhou = false }) {
  if (falhou) {
    return (
      <div className="interno-alertas">
        <Notice tone="warn" title="Não foi possível verificar os alertas de sistema">
          O painel não conseguiu ler os alertas abertos. Isto não quer dizer que esteja tudo bem —
          quer dizer que ninguém sabe. Veja os Actions do repositório antes de concluir o contrário.
        </Notice>
      </div>
    )
  }

  if (!alertas.length) return null

  return (
    <div className="interno-alertas">
      {alertas.map((a) => (
        <Notice key={a.id} tone="danger" role="alert" title={a.title}>
          {a.body ? <p>{a.body}</p> : null}
          <p className="interno-foot-sub">
            Aberto {haQuanto(a.opened_at) || dataHora(a.opened_at)}
            {a.body ? '' : ` — ${dataHora(a.opened_at)}`}
            {a.url ? (
              <>
                {' · '}
                <a href={a.url} target="_blank" rel="noreferrer">
                  ver a execução
                </a>
              </>
            ) : null}
          </p>
        </Notice>
      ))}
    </div>
  )
}
