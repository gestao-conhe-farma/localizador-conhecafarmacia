/**
 * Tipo real de uma imagem, lido dos primeiros bytes (B4).
 *
 * O `Content-Type` do upload é declarado pelo cliente: um ficheiro
 * arbitrário pode chegar como `image/jpeg` e ficar guardado no bucket
 * público. A assinatura do formato (magic bytes) é a única parte que o
 * cliente não escolhe. Cobre os três formatos que o produto aceita.
 *
 * Não importa `node:*`: corre também em runtime de browser, se um dia
 * for preciso validar antes de enviar.
 */
export function detectImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg'
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'image/png'
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  ) {
    return 'image/webp'
  }

  return null
}
