import Notice from '@/components/ui/Notice'

/**
 * O RESULTADO da conversão de um lead — os passos da operação, o pedido que
 * os liga e o caminho para a ficha.
 *
 * Vive à parte porque aparece em DOIS sítios que têm de dizer o mesmo:
 *
 *   1. no formulário, imediatamente a seguir a gravar (quem converteu vê o
 *      que ficou feito sem esperar por um redesdobrar da página);
 *   2. na página, sempre que um lead já convertido é aberto outra vez — e aí
 *      os passos vêm da TRILHA, não da memória de quem converteu.
 *
 * O segundo caso é o que dá sentido à peça: uma Server Action que chama
 * `revalidatePath` redesenha a página, e o resultado que só existisse no
 * estado do formulário desaparecia no instante seguinte. Mostrado a partir
 * dos registos, o ecrã continua a explicar a operação seis meses depois, com
 * o actor e a hora de cada passo.
 *
 * Componente sem hooks e sem imports de servidor: é desenhado tanto por um
 * Client Component (o formulário) como por um Server Component (a página).
 */
const ROTULOS = {
  'pharmacy.create': 'Farmácia criada',
  'account.invite': 'Dono convidado',
  'lead.convert': 'Funil fechado',
}

/** Nota curta por acção — o que ficou feito, em concreto. */
function notaDaAcao(r) {
  if (r.action === 'pharmacy.create') return r.slug ? `/farmacia/${r.slug}` : 'Entrou no directório'
  if (r.action === 'account.invite')
    return r.email ? `Convite para ${r.email}` : 'Convite por e-mail'
  if (r.action === 'lead.convert') return 'Lead em «Convertido», com a data do fecho'
  return ''
}

export default function LeadConvertResult({
  passos,
  requestId,
  farmaciaId,
  titulo = 'Operação concluída',
  resumo,
  nota,
  acao,
}) {
  return (
    <div className="interno-box interno-box--pad">
      <Notice tone="ok" role="status" title={titulo}>
        {resumo}
      </Notice>

      <ol className="interno-steps">
        {passos.map((p, i) => (
          <li key={p.chave || i} className="interno-step interno-step--ok">
            <span className="interno-step-num">{i + 1}</span>
            <span className="interno-step-text">
              <b>{p.titulo || ROTULOS[p.action] || p.action}</b>
              <span className="interno-foot-sub">{notaDaAcao(p)}</span>
              {(p.quando || p.actorEmail) && (
                <span className="interno-foot-sub">
                  {p.quando
                    ? new Date(p.quando).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' })
                    : ''}
                  {p.actorEmail ? ` · ${p.actorEmail}` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {requestId ? (
        <p className="interno-hint">
          Pedido: <span className="interno-mono">{requestId}</span> — é este o fio que liga os
          registos na trilha de auditoria: <b>pharmacy.create</b>, <b>account.invite</b> e{' '}
          <b>lead.convert</b> com o mesmo identificador.
        </p>
      ) : null}

      {nota ? <p className="interno-hint">{nota}</p> : null}

      {acao}
    </div>
  )
}
