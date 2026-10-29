'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requirePlatformRead } from '@/lib/platform/session'
import { logError } from '@/lib/log'

/**
 * Alertas de sistema da área interna (0048).
 *
 * O primeiro — e por agora o único — é o backup semanal. Quem os escreve é
 * o GitHub Actions, pelo endpoint `/api/interno/alertas`; aqui só se lê o
 * que está aberto, para o painel de entrada.
 *
 * `requirePlatformRead` e não `requirePlatform`: ver o aviso não é uma
 * acção sensível nem pede motivo. E a leitura é service-role porque a
 * tabela não tem policies — é estado operacional, não dado de farmácia.
 *
 * Uma falha NUNCA se disfarça de «não há alertas»: sem alertas e sem
 * conseguir ler os alertas são coisas opostas, e a segunda é a única que
 * esconde um backup partido. Por isso devolve `{ ok: false }` e o painel
 * diz que não conseguiu verificar.
 */
export async function getSystemAlerts() {
  const g = await requirePlatformRead('pharmacy.view')
  if (!g.ok) return g

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('system_alerts')
      .select('id, kind, title, body, url, opened_at')
      .is('resolved_at', null)
      .order('opened_at', { ascending: false })
      .limit(5)

    if (error) {
      logError('platform', 'Alertas do sistema não leram', {
        code: error.code,
        message: error.message,
      })
      return { ok: false, error: 'FALHA' }
    }

    return { ok: true, rows: data ?? [] }
  } catch (err) {
    logError('platform', 'Alertas do sistema rebentaram', {
      message: err?.message || String(err),
    })
    return { ok: false, error: 'FALHA' }
  }
}
