/**
 * Tons dos avisos (0032) — constantes partilhadas pelo portal, pelo
 * compositor interno e pelo leitor de servidor.
 *
 * Vive fora de `lib/announcements.js` de propósito: esse módulo importa o
 * cliente de servidor (`next/headers`) e não pode entrar num componente
 * cliente. Aqui só há dados, e os dois lados leem os mesmos rótulos.
 */
export const TONES = ['info', 'warn', 'ok']

export const TONE_LABELS = {
  info: 'Informativo',
  warn: 'Atenção',
  ok: 'Bom saber',
}
