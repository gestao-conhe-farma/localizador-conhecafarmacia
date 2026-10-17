import Link from 'next/link'
import { requirePlatformSession } from '@/lib/platform/session'
import { getMfaFatores } from '@/lib/actions/platform-mfa'
import Falha from '@/components/interno/Falha'
import MfaSetup from '@/components/interno/MfaSetup'

export const metadata = {
  title: 'Segundo factor — Equipa Conheça Farmácia',
  robots: { index: false, follow: false },
}

/**
 * SEGUNDO FACTOR da conta (File Structure: `/interno/mfa`).
 *
 * Vive dentro de `(console)` — depois da sessão, não antes dela: inscrever um
 * autenticador exige estar autenticado (é a própria conta que ganha o
 * factor), e é o layout do grupo que garante a sessão. A porta de entrada é o
 * rodapé do shell, cujo estado do segundo factor é um link para aqui — o
 * sítio onde o problema é anunciado é o sítio onde ele se resolve.
 *
 * O ECRÃ NÃO PEDE PERMISSÃO DA MATRIZ, e não é esquecimento: não há acção
 * §3.2 para «inscrever o meu autenticador». Todas as acções da matriz são
 * coisas que uma pessoa faz A outras (farmácias, contas, planos); esta é a
 * pessoa a tratar da própria conta, como o login. A autorização aqui é estar
 * dentro da equipa — e é por isso que a inscrição não entra na trilha
 * (ver `lib/actions/platform-mfa.js`).
 *
 * O nível de garantia e a lista de factores vêm de sítios diferentes de
 * propósito: o nível é um facto da SESSÃO (`getPlatformSessionVerbose`, que
 * o layout já leu) e os factores são um facto da CONTA (`listFactors`, no
 * Auth). O ecrã precisa dos dois para dizer a frase útil — «o autenticador
 * está inscrito, mas esta sessão ainda só tem senha».
 */
export default async function InternoMfaPage() {
  const session = await requirePlatformSession()
  const res = await getMfaFatores()

  const nivel = session?.mfa?.currentLevel ?? null
  const temFactor = session?.mfa?.nextLevel === 'aal2'

  return (
    <div className="interno-page">
      <div className="interno-head">
        <div>
          <h1 className="interno-title">Segundo factor</h1>
          <p className="interno-sub">
            O autenticador da sua conta nesta área. A senha entra; o código do autenticador{' '}
            <b>autoriza</b> — é o que separa ler de executar.
          </p>
        </div>
        <div className="interno-head-acts">
          <Link href="/interno" className="interno-btn interno-btn--ghost">
            Voltar ao painel
          </Link>
        </div>
      </div>

      {!res.ok ? (
        <Falha
          titulo="Não foi possível ler o estado do segundo factor"
          erro={res.error}
          detalhe={res.detail}
        />
      ) : (
        <>
          {temFactor && nivel !== 'aal2' && (
            <div className="interno-box interno-box--pad">
              <p className="interno-hint">
                Esta conta tem autenticador inscrito e esta sessão entrou só com senha. A entrada
                normal pede o código a seguir à senha — se chegou aqui assim, termine a sessão e
                volte a entrar para confirmar o código.
              </p>
            </div>
          )}

          <MfaSetup nivel={nivel} verificado={res.verificado} porAcabar={res.porAcabar} />

          <div className="interno-box interno-box--pad">
            <p className="interno-hint">
              Porque é que isto existe: as acções sensíveis da área interna (desactivar uma
              farmácia, suspender uma conta, mexer em planos, gerir níveis, exportar a trilha)
              exigem sessão <b>aal2</b> — senha e código confirmados na MESMA sessão. É a exigência
              do CIS Control 6 para administração, e a única forma de a cumprir sem partilhar
              senhas.
            </p>
            <p className="interno-hint">
              Entrar e inscrever o autenticador não ficam na trilha de auditoria: a trilha guarda as
              acções da matriz de permissões, e estas são da própria conta. O registo está no
              Supabase Auth (factores, último acesso) e, para o que falhar, no log{' '}
              <code>platform</code>.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
