// Servidor estático mínimo (só para revisão local das maquetas).
// Uso: node _design/farmacia-2026/serve.mjs [porta]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = normalize(fileURLToPath(new URL('../../', import.meta.url)))
const port = Number(process.argv[2] || 8790)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = normalize(join(root, path.replace(/^[/\\]+/, '')))
    if (!file.startsWith(root)) throw new Error('fora da raiz')
    const info = await stat(file)
    if (info.isDirectory()) throw new Error('diretório')
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('404')
  }
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port))
