/**
 * Compressão de imagem no cliente — para fotos de embalagens tiradas
 * com a câmara do telemóvel (frequentemente 3-8 MB) caberem no limite
 * de 2 MB do upload sem depender de o utilizador «comprimir antes».
 *
 * Desenha a imagem num <canvas> com máx. 800px no lado maior e exporta
 * como JPEG (qualidade 0.82). PNE/transparentes não fazem sentido em
 * foto de embalagem — a saída é sempre JPEG (o bucket aceita).
 *
 * Falha suave: se algo não funcionar (browser antigo, EXIF exotic),
 * devolve o ficheiro original — a validação de 2 MB server-side segue
 * a valer como rede de segurança.
 */

const MAX_SIDE = 800
const QUALITY = 0.82

export async function compressDrugImage(file) {
  // Já pequena o suficiente: não reencoda (evita perder qualidade à toa).
  if (file.size <= 300 * 1024 && file.type === 'image/jpeg') return file
  // Não é imagem processável (ou é PNG/WebP pequeno): deixa como está.
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // browser sem createImageBitmap — segue o original
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  try {
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file // compressão não compensou
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
