/*
 * Regenera as capturas dos modelos: lista, página da farmácia e galeria.
 * Corre com o playwright global: NODE_PATH=$(npm root -g)/@playwright/cli/node_modules node _design/farmacia-2026/shoot.cjs
 */
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const dir = __dirname;
const shots = path.join(dir, 'shots');
const url = (file) => pathToFileURL(path.join(dir, file)).href;

(async () => {
  await fs.mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  for (const [prefix, file] of [
    ['a', 'modelo-a-indice.html'],
    ['b', 'modelo-b-mapa.html'],
    ['c', 'modelo-c-montra.html'],
  ]) {
    await page.goto(url(file));
    await page.waitForLoadState('load');
    await page.screenshot({ path: path.join(shots, `${prefix}-lista.png`) });

    await page.addStyleTag({ content: '#lista{display:none}' });
    await page.screenshot({ path: path.join(shots, `${prefix}-farmacia.png`) });
  }

  await page.goto(url('index.html'));
  await page.waitForLoadState('load');
  await page.screenshot({ path: path.join(shots, 'index.png') });

  await browser.close();
  console.log('OK · capturas escritas em _design/farmacia-2026/shots');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
