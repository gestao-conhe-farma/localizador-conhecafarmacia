/* Verificação dos modelos D, E e F — Playwright.
   Corre: node _design/farmacia-2026/verify-loja.cjs
   (NODE_PATH aponta para o playwright global, ver LEIA-ME) */
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright');

const DIR = __dirname;
const file = (name) => 'file://' + path.join(DIR, name).replace(/\\/g, '/');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` → esperado ${expected}, obtido ${actual}`}`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const errors = [];

  async function page(name) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(file(name));
    return p;
  }

  // ---------------- D ----------------
  const d = await page('modelo-d-balcao.html');
  check('D · 7 farmácias na lista', await d.locator('#store-list .store-card:visible').count(), 7);

  // cartão foto-primeiro: mesma anatomia em todos os produtos
  check('D · 11 cartões na prateleira', await d.locator('#products .pcard').count(), 11);
  check('D · todos têm área de imagem', await d.locator('#products .pcard > .pcard-media').count(), 11);
  check('D · todos têm acção de largura total', await d.locator('#products .pcard > .pcard-cta').count(), 11);
  check('D · todos têm preço', await d.locator('#products .pcard .pcard-pricerow .price').count(), 11);
  check(
    'D · preço por unidade',
    (await d.locator('#products [data-open-pdp="paracetamol"] .pcard-unit').innerText()).trim(),
    '47,50 Kz por comprimido',
  );
  check(
    'D · acção é reserva, não carrinho',
    (await d.locator('#products [data-open-pdp="paracetamol"] .pcard-cta').innerText()).trim().startsWith('Ver ficha e reservar'),
    true,
  );
  check(
    'D · só no balcão não promete reserva',
    (await d.locator('#products [data-open-pdp="fraldas"] .pcard-cta').innerText()).trim(),
    'Só no balcão — ver ficha',
  );
  // escopo: os cartões e a ficha — a nota da prateleira diz de propósito
  // «preço de balcão, não de carrinho».
  check(
    'D · cartões sem carrinho, cupão ou desconto',
    await d.evaluate(() =>
      /carrinho|cup[aã]o|add to cart|%\s*off/i.test(
        document.getElementById('products').innerText + document.getElementById('pdp').innerText,
      ),
    ),
    false,
  );

  await d.locator('#f-open').check();
  check('D · só abertas esconde a Aliança', await d.locator('#store-list .store-card:visible').count(), 6);

  await d.locator('#f-open').uncheck();
  await d.locator('#q').fill('insulina');
  check('D · pesquisa por produto', await d.locator('#store-list .store-card:visible').count(), 1);

  await d.locator('#q').fill('');
  await d.locator('#zones [data-zone="Talatona"]').click();
  check('D · filtro de zona', await d.locator('#store-list .store-card:visible').count(), 2);

  await d.locator('#reset').click();
  await d.locator('#store-list [data-open-pdp="paracetamol"]').first().click();
  check('D · ficha abre', await d.locator('#pdp .pdp-dialog').isVisible(), true);
  check('D · título da ficha', (await d.locator('#pdp-title').innerText()).trim(), 'Paracetamol 500 mg');
  check('D · o fundo não faz scroll', await d.evaluate(() => document.body.classList.contains('no-scroll')), true);

  await d.locator('#pdp [data-reserve]').click();
  check('D · reserva simulada', (await d.locator('#pdp [data-reserve]').innerText()).startsWith('Reserva pedida'), true);
  await d.keyboard.press('Escape');
  check('D · Esc fecha', await d.locator('#pdp').isVisible(), false);
  check('D · scroll reposto', await d.evaluate(() => document.body.classList.contains('no-scroll')), false);

  await d.locator('#products [data-open-pdp="amoxicilina"]').click();
  check('D · ficha mostra receita', await d.locator('#pdp .rx.solid').count(), 1);
  await d.keyboard.press('Shift+Tab');
  check('D · foco fica preso na ficha', await d.evaluate(() => !!document.activeElement.closest('#pdp')), true);
  await d.locator('#pdp .pdp-x').click();

  await d.locator('#products [data-open-pdp="insulina"]').click();
  check('D · cartão mapeia o produto certo', (await d.locator('#pdp-title').innerText()).trim(), 'Insulina NPH 100 UI/ml');
  await d.keyboard.press('Escape');

  await d.locator('#products [data-cat="Parafarmácia"]').count(); // sanity
  await d.locator('#cats [data-cat="Parafarmácia"]').click();
  check('D · categoria filtra a prateleira', await d.locator('#products .prod:visible').count(), 3);
  await d.locator('#q-store').fill('soro');
  check('D · pesquisa dentro da farmácia', await d.locator('#products .prod:visible').count(), 1);

  // ---------------- E ----------------
  const e = await page('modelo-e-busca.html');
  check('E · uma apresentação por omissão', await e.locator('#groups .group:visible').count(), 1);
  check('E · cartão-âncora por apresentação', await e.locator('#groups .pcard').count(), 3);
  check(
    'E · cartão mostra o intervalo da rede',
    (await e.locator('#groups .group:not([hidden]) .pcard .price').innerText()).trim(),
    '950 – 1 100 Kz',
  );
  check('E · 5 farmácias com paracetamol', await e.locator('#groups .group:visible .r:visible').count(), 5);

  await e.locator('.suggest [data-q="soro"]').click();
  check('E · sugestão troca de produto', (await e.locator('#result-title').innerText()).trim(), 'Soro');
  check('E · 3 farmácias com soro', await e.locator('#groups .group:visible .r:visible').count(), 3);

  await e.locator('.resultbar [data-filter="open"]').click();
  check('E · filtro abertas mantém 3', await e.locator('#groups .group:visible .r:visible').count(), 3);
  await e.locator('.resultbar [data-filter="all"]').click();

  await e.locator('.group:visible .openpdp').click();
  check('E · ficha abre em coluna única', await e.locator('#pdp.pdp--sheet .pdp-dialog').isVisible(), true);
  check('E · título do soro', (await e.locator('#pdp-title').innerText()).trim(), 'Soro fisiológico 0,9%');
  await e.locator('#pdp .pdp-scrim').click({ position: { x: 4, y: 4 } });
  check('E · clique no scrim fecha', await e.locator('#pdp').isVisible(), false);

  await e.locator('#q').fill('xyz');
  check('E · sem resultados mostra aviso', await e.locator('#notfound').isVisible(), true);
  await e.locator('.suggest [data-q="paracetamol"]').click();
  check('E · aviso desaparece', await e.locator('#notfound').isVisible(), false);

  await e.locator('#seq [data-cat="Críticos"]').click();
  check('E · prateleira por categoria', await e.locator('#shelf .prow:visible').count(), 3);

  // ---------------- F ----------------
  const f = await page('modelo-f-ficha.html');
  check('F · começa na variante 1', await f.locator('#v1').isVisible(), true);
  check('F · prateleira de fundo em cartões', await f.locator('.shelf .pcard').count(), 3);
  await f.locator('.vtabs [data-v="v2"]').click();
  check('F · muda para a compacta', await f.locator('#v2').isVisible(), true);
  await f.locator('#more-toggle').click();
  check('F · detalhes da compacta abrem', await f.locator('#more').isVisible(), true);

  await f.locator('.vtabs [data-v="v3"]').click();
  check('F · variante de reserva visível', await f.locator('#v3').isVisible(), true);
  await f.locator('#plus').click();
  await f.locator('#plus').click();
  check('F · quantidade 3', (await f.locator('#qty').innerText()).trim(), '3');
  check('F · total acompanha', (await f.locator('#total').innerText()).trim(), '2 850 Kz');

  await f.locator('#confirm').click();
  check('F · valida telemóvel', await f.locator('#err').isVisible(), true);
  await f.locator('#phone').fill('923114500');
  await f.locator('#confirm').click();
  check('F · confirmação troca de passo', await f.locator('#v3 .done').isVisible(), true);
  check('F · código gerado', /^SR-\d{4}$/.test((await f.locator('#code').innerText()).trim()), true);
  check('F · total no resumo', (await f.locator('#done-total').innerText()).trim(), '2 850 Kz');

  await f.keyboard.press('Escape');
  check('F · Esc fecha a ficha', await f.locator('#fdp').isVisible(), false);
  check('F · botão reabrir aparece', await f.locator('#reopen').isVisible(), true);

  check('consola sem erros', errors.length, 0);
  if (errors.length) errors.forEach((x) => console.log('  ' + x));

  await browser.close();
  console.log(failures ? `\n${failures} falha(s)` : '\nTodos os testes passaram.');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
