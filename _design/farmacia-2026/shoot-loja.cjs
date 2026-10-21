/* Capturas dos modelos D, E e F a 1440 × 1000.
   Corre: PW=<playwright> node _design/farmacia-2026/shoot-loja.cjs */
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright');

const DIR = __dirname;
const OUT = path.join(DIR, 'shots');
const file = (name) => 'file://' + path.join(DIR, name).replace(/\\/g, '/');
const view = { width: 1440, height: 1000 };

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage({ viewport: view, deviceScaleFactor: 1 });

  async function shot(name) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shots/' + name + '.png');
  }

  async function storeOnly() {
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#lista{display:none}';
      document.head.appendChild(s);
      window.scrollTo(0, 0);
    });
  }

  // D
  await page.goto(file('modelo-d-balcao.html'));
  await shot('d-lista');
  await storeOnly();
  await page.locator('#products').scrollIntoViewIfNeeded();
  await shot('d-farmacia');
  await page.locator('#products [data-open-pdp="paracetamol"]').click();
  await shot('d-ficha');
  await page.keyboard.press('Escape');

  // E
  await page.goto(file('modelo-e-busca.html'));
  await shot('e-lista');
  await storeOnly();
  await page.locator('#shelf').scrollIntoViewIfNeeded();
  await shot('e-farmacia');
  await page.locator('#shelf [data-open-pdp="paracetamol"]').first().click();
  await shot('e-ficha');
  await page.keyboard.press('Escape');

  // F
  await page.goto(file('modelo-f-ficha.html'));
  await shot('f-v1');
  await page.locator('.vtabs [data-v="v2"]').click();
  await shot('f-v2');
  await page.locator('.vtabs [data-v="v3"]').click();
  await shot('f-v3');

  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
