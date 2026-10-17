'use client'

import { useState, useTransition } from 'react'
import { exportAuditCsv } from '@/lib/actions/platform-audit'
import ConfirmActionModal from '@/components/interno/ConfirmActionModal'
import Notice from '@/components/ui/Notice'
import { LinhaResumo } from '@/components/interno/LinhaResumo'

/**
 * Exportação da trilha (`audit.export`) — Task 8.2.
 *
 * Duas coisas que este botão não faz sozinho, de propósito:
 *
 *   • não decide permissões: `pode` vem da matriz e o servidor volta a
 *     autorizar (com MFA e motivo) antes de ler uma única linha;
 *   • não inventa o ficheiro: o CSV chega pronto do servidor, que o só
 *     devolve DEPOIS de gravar `audit.export` na própria trilha. Se a
 *     gravação falhar, a resposta é `TRILHA_FALHOU` e não há download — um
 *     export sem rasto é o que a trilha existe para impedir.
 *
 * O aviso de segundo factor aparece ANTES de a pessoa escrever o motivo: a
 * recusa é anunciada, não descoberta depois do trabalho feito (a mesma regra
 * das acções da ficha da farmácia).
 */
const ROTULOS = {
  acao: 'Acção',
  nivel: 'Nível',
  farmacia: 'Farmácia',
  actor: 'Autor',
  de: 'De',
  ate: 'Até',
}

const MENSAGENS = {
  MOTIVO_OBRIGATORIO: 'Escreva o motivo — é ele que fica gravado na trilha de auditoria.',
  SEM_PERMISSAO: 'O seu nível não permite exportar a trilha.',
  SEM_SESSAO: 'A sessão terminou. Entre de novo.',
  MFA_NECESSARIO:
    'O export exige o segundo factor. Saia e volte a entrar, confirmando o código do autenticador.',
  TRILHA_FALHOU:
    'O export não saiu porque não ficou registado na trilha. Sem rasto não há ficheiro: tente de novo.',
  FALHA: 'Não foi possível exportar a trilha. Tente de novo.',
}

function resumoFiltros(filtros) {
  const partes = Object.entries(filtros)
    .filter(([, v]) => v)
    .map(([k, v]) => `${ROTULOS[k] || k}: ${v}`)
  return partes.length ? partes.join(' · ') : 'sem filtros — a trilha inteira'
}

function descarregar(csv, filename) {
  // O BOM entra AQUI, não no servidor: um U+FEFF inicial não sobrevive à
  // serialização da Server Action (o blob saía três bytes mais curto) e sem
  // ele o Excel em PT abre os acentos como mojibake. No ficheiro fica igual.
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revogar no fim do ciclo de vida do clique; revogar logo a seguir pode
  // cancelar o download em alguns browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function AuditExport({ filtros, pode, mfa2 }) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState(null)
  const [feito, setFeito] = useState(null)
  const [pending, start] = useTransition()

  if (!pode) return null

  const exportar = (motivo) =>
    start(async () => {
      setErro(null)
      try {
        const r = await exportAuditCsv({ ...filtros, motivo })
        if (r?.ok) {
          descarregar(r.csv, r.filename)
          setAberto(false)
          setFeito(r)
          return
        }
        setErro(MENSAGENS[r?.error] || 'Erro inesperado.')
      } catch {
        setErro(MENSAGENS.FALHA)
      }
    })

  return (
    <>
      <button
        type="button"
        className="interno-btn interno-btn--ghost"
        disabled={pending}
        onClick={() => {
          setErro(null)
          setAberto(true)
        }}
      >
        Exportar CSV
      </button>

      {feito && !aberto && (
        <span className="interno-hint" role="status">
          {feito.linhas} linha(s) exportada(s)
          {feito.truncado ? ` — tecto de ${feito.limite} atingido, estreite os filtros` : ''}.
          Registado na trilha.
        </span>
      )}

      {aberto && (
        <ConfirmActionModal
          titulo="Exportar a trilha filtrada?"
          descricao={
            <>
              Sai um ficheiro CSV com as linhas que os filtros deixam passar (até <b>5 000</b>). O
              export fica registado na própria trilha com o seu e-mail, a hora e o motivo que
              escrever abaixo.
            </>
          }
          motivoObrigatorio
          confirmLabel="Exportar CSV"
          pending={pending}
          erro={erro}
          resumo={
            <>
              <LinhaResumo rotulo="Filtros">{resumoFiltros(filtros)}</LinhaResumo>
              <LinhaResumo rotulo="Formato">CSV (Excel, ponto e vírgula)</LinhaResumo>
              <LinhaResumo rotulo="Trilha">audit.export, com o motivo</LinhaResumo>
            </>
          }
          aviso={
            !mfa2 ? (
              <Notice tone="warn">
                A sua sessão só tem senha. O servidor vai recusar este export com
                <b> MFA_NECESSARIO</b> até confirmar o código do autenticador — saia e volte a
                entrar.
              </Notice>
            ) : null
          }
          onCancel={() => setAberto(false)}
          onConfirm={(motivo) => exportar(motivo)}
        />
      )}
    </>
  )
}
