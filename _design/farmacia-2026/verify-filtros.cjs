/*
 * Teste de interacção dos três modelos.
 * Corre com o playwright global: NODE_PATH=$(npm root -g) node _design/farmacia-2026/verify-filtros.cjs
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const dir = __dirname;
const url = (file) => pathToFileURL(path.join(dir, file)).href;

async function visibleCount(page, selector) {
  return page.$$eval(selector, (nodes) =>
    nodes.filter((n) => n.offsetParent !== null).length
  );
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  async function open(file) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (error) => errors.push(`${file}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${file}: ${message.text()}`);
    });
    await page.goto(url(file));
    await page.waitForLoadState('load');
    return page;
  }

  // ---------- A · Índice ----------
  {
    const page = await open('modelo-a-indice.html');
    const rows = '#lista .idx-row';
    assert.equal(await visibleCount(page, rows), 7, 'A: 7 linhas à entrada');

    await page.click('#lista .toggle');
    assert.equal(await visibleCount(page, rows), 6, 'A: «só abertas» esconde a Aliança');

    await page.click('#lista .rail-links a[href="#lista"]:nth-child(2)'); // Talatona
    assert.equal(await visibleCount(page, rows), 2, 'A: Talatona tem 2 linhas');

    await page.click('#lista .rail-links a[href="#lista"]:nth-child(1)'); // Todas
    assert.equal(await visibleCount(page, rows), 6, 'A: Todas mantém o filtro de abertas');

    await page.click('#lista .toggle');
    assert.equal(await visibleCount(page, rows), 7, 'A: desligar «só abertas» repõe as 7');
    await page.close();
  }

  // ---------- B · Mapa e balcão ----------
  {
    const page = await open('modelo-b-mapa.html');
    const cards = '#lista .res-card';
    assert.equal(await visibleCount(page, cards), 7, 'B: 7 cartões à entrada');
    assert.equal(await visibleCount(page, '#lista .pin'), 7, 'B: 7 pins à entrada');

    await page.click('#lista .chips .chip:not(.js-open) >> text=Luanda');
    assert.equal(await visibleCount(page, cards), 2, 'B: Luanda tem 2 farmácias');
    assert.equal(await visibleCount(page, '#lista .pin'), 2, 'B: o mapa acompanha');

    await page.click('#lista .chip.js-open');
    assert.equal(await visibleCount(page, cards), 1, 'B: só a Kianda está aberta em Luanda');
    assert.equal(await visibleCount(page, '#lista .pin'), 1, 'B: um só pin');
    assert.equal(
      (await page.textContent('#lista .res-head span')).trim(),
      '1 farmácia',
      'B: o contador usa o singular'
    );

    await page.click('#lista .chips .chip:not(.js-open) >> text=Todos');
    await page.click('#lista .chip.js-open');
    assert.equal(await visibleCount(page, cards), 7, 'B: volta às 7');
    await page.close();
  }

  // ---------- C · Montra ----------
  {
    const page = await open('modelo-c-montra.html');
    assert.equal(await visibleCount(page, '#lista .feat'), 1, 'C: destaque à entrada');
    assert.equal(await visibleCount(page, '#lista .card'), 6, 'C: 6 cartões à entrada');

    await page.click('#lista .chips .chip >> text=Talatona');
    assert.equal(await visibleCount(page, '#lista .feat'), 1, 'C: destaque é de Talatona');
    assert.equal(await visibleCount(page, '#lista .card'), 1, 'C: Sagrada é a única de Talatona');

    await page.click('#lista .chips .chip >> text=Viana');
    assert.equal(await visibleCount(page, '#lista .feat'), 0, 'C: sem destaque em Viana');
    assert.equal(await visibleCount(page, '#lista .card'), 1, 'C: 1 cartão em Viana');

    await page.click('#lista .chips .chip >> text=Todas');
    assert.equal(await visibleCount(page, '#lista .card'), 6, 'C: volta às 6');
    await page.close();
  }

  await browser.close();

  if (errors.length) {
    console.error('Erros de consola:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('OK · filtros e mapa dos três modelos comportam-se como descrito; zero erros de consola.');
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
