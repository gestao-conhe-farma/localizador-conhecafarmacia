/**
 * Gera as pré-visualizações dos E-MAILS TRANSACCIONAIS.
 *
 * Uso: node scripts/render-emails.mjs
 *
 * Porquê um script: as pré-visualizações em `_design/emails/` têm de ser o
 * e-mail VERDADEIRO, não uma cópia desenhada à parte que envelhece sozinha.
 * Em vez de reescrever o HTML aqui, o script importa `lib/email.js` (o mesmo
 * módulo que a aplicação usa) e grava o que cada função devolve.
 *
 * O truque é o alias `@/`: o Node não o conhece. O módulo é copiado para
 * `node_modules/.cache/email-preview/` com os dois imports trocados — as
 * constantes pelo ficheiro real e o `logError` por um no-op — e importado
 * daí. Nada no código da aplicação muda por causa disto.
 *
 * Saída:
 *   _design/emails/01-pedido-adesao.html   (+ .txt)
 *   _design/emails/02-convite-farmacia.html (+ .txt)
 *   _design/emails/03-recuperacao-senha.html (+ .txt)
 *   _design/emails/index.html              (galeria — escrita à mão)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'email-preview')
const OUT = path.join(ROOT, '_design', 'emails')

await mkdir(CACHE, { recursive: true })
await mkdir(OUT, { recursive: true })

// 1. Constantes reais (o mesmo ficheiro que a app importa).
const constants = await readFile(path.join(ROOT, 'lib', 'constants.js'), 'utf8')
await writeFile(path.join(CACHE, 'constants.mjs'), constants, 'utf8')

// 2. Cópia de lib/email.js com os imports resolvidos.
let source = await readFile(path.join(ROOT, 'lib', 'email.js'), 'utf8')
source = source
  .replace("from '@/lib/constants'", "from './constants.mjs'")
  .replace("import { logError } from '@/lib/log'", 'const logError = () => {}')
await writeFile(path.join(CACHE, 'email.mjs'), source, 'utf8')

const { emailPedidoAdesao, emailConvite, emailRecuperacao } = await import(
  `${pathToFileURL(path.join(CACHE, 'email.mjs')).href}?t=${Date.now()}`
)
const { SITE_URL } = await import(pathToFileURL(path.join(CACHE, 'constants.mjs')).href)

/**
 * As pré-visualizações abrem em `file://` e não têm servidor: o logótipo e
 * a fonte, que no e-mail vão por URL absoluto do site, aqui apontam para
 * `public/`. O que é ENVIADO continua a ser o URL absoluto — só o ficheiro
 * local é reescrito.
 */
function paraPrevisualizacao(html) {
  return html
    .replaceAll(`${SITE_URL}/logo/`, '../../public/logo/')
    .replaceAll(`${SITE_URL}/fonts/`, '../../public/fonts/')
}

// Dados de exemplo — nomes e links verosímeis, sem dados de ninguém real.
const EXEMPLOS = [
  {
    ficheiro: '01-pedido-adesao',
    titulo: 'Pedido de adesão recebido',
    quando: 'Assim que a farmácia envia o formulário de /farmacias/participar',
    para: 'Quem preencheu o formulário (e-mail do responsável)',
    fonte: 'emailPedidoAdesao() · chamada por /api/leads',
    template: emailPedidoAdesao({
      nome: 'Maria Domingos',
      farmacia: 'Farmácia Nossa Senhora da Saúde',
      nif: '5000123456',
      municipio: 'Luanda',
    }),
  },
  {
    ficheiro: '02-convite-farmacia',
    titulo: 'Convite para o portal',
    quando: 'Quando a equipa converte o lead em farmácia, no /interno',
    para: 'O dono/responsável convidado a gerir a farmácia',
    fonte: 'emailConvite() · chamada na conversão do lead',
    template: emailConvite({
      nome: 'Maria Domingos',
      farmacia: 'Farmácia Nossa Senhora da Saúde',
      link: 'https://localizador.conhecafarmacia.com/portal/convite?token=exemplo-de-token',
    }),
  },
  {
    ficheiro: '03-recuperacao-senha',
    titulo: 'Reposição de senha',
    quando: 'Quando a farmácia pede para repor a senha em /portal/recuperar',
    para: 'O responsável da conta que pediu a reposição',
    fonte: 'emailRecuperacao() · chamada em /portal/recuperar',
    template: emailRecuperacao({
      nome: 'Maria Domingos',
      farmacia: 'Farmácia Nossa Senhora da Saúde',
      link: 'https://localizador.conhecafarmacia.com/portal/recuperar/confirmar?token=exemplo-de-token',
    }),
  },
]

for (const e of EXEMPLOS) {
  await writeFile(
    path.join(OUT, `${e.ficheiro}.html`),
    paraPrevisualizacao(e.template.html),
    'utf8',
  )
  await writeFile(path.join(OUT, `${e.ficheiro}.txt`), e.template.text, 'utf8')
  console.log(`✓ ${e.ficheiro}.html — «${e.template.subject}»`)
}

console.log(`\n${EXEMPLOS.length} modelos escritos em _design/emails/.`)
