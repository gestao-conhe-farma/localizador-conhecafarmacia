import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9444
const ORIGIN = 'https://localizador.conhecafarmacia.com'
const PROFILE = '/tmp/cfgeo-profile'

fs.rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
)

async function getJson(path) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`)
      if (r.ok) return await r.json()
    } catch {}
    await sleep(500)
  }
  throw new Error('Chrome not reachable')
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method) this.events.push(msg)
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
}

const version = await getJson('/json/version')
const browser = new CDP(new WebSocket(version.webSocketDebuggerUrl))
await new Promise((r) => browser.ws.addEventListener('open', r))

await browser.send('Browser.grantPermissions', {
  origin: ORIGIN,
  permissions: ['geolocation'],
})
await browser.send('Emulation.setGeolocationOverride', {
  latitude: -8.838,
  longitude: 13.234,
  accuracy: 25,
})

const target = await browser.send('Target.createTarget', { url: 'about:blank' })
const pages = await getJson('/json/list')
const pageInfo = pages.find((p) => p.id === target.targetId)
const page = new CDP(new WebSocket(pageInfo.webSocketDebuggerUrl))
await new Promise((r) => page.ws.addEventListener('open', r))

page.ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map((a) => a.value ?? a.description).join(' ')
    console.log('[console]', msg.params.type, args)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('[exception]', JSON.stringify(msg.params.exceptionDetails).slice(0, 500))
  }
})

await page.send('Runtime.enable')
await page.send('Page.enable')
await page.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
})
await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await page.send('Emulation.setUserAgentOverride', {
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  platform: 'Linux armv8l',
})

await page.send('Page.navigate', { url: `${ORIGIN}/pesquisa?q=paracetamol` })
await sleep(7000)

const evalJs = async (expression) => {
  const r = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return r.result?.value
}

console.log('title:', await evalJs('document.title'))
console.log(
  'geolocation native:',
  await evalJs(
    `new Promise((res) => navigator.geolocation.getCurrentPosition(
       (p) => res('OK ' + p.coords.latitude.toFixed(3)),
       (e) => res('ERR ' + e.code + ' ' + e.message),
       { timeout: 15000 }))`,
  ),
)

const clickText = async (text, scope = 'button, a') => {
  return evalJs(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(scope)})]
      .find((b) => b.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!el) return 'NOT FOUND'
    el.click()
    return 'clicked: ' + el.textContent.trim().slice(0, 40)
  })()`)
}

console.log('filters:', await clickText('filtros'))
await sleep(800)
console.log('near:', await clickText('perto de mim'))
await sleep(3500)

const state = await evalJs(`(() => {
  const near = [...document.querySelectorAll('button')].find((b) => /localiza|perto/i.test(b.textContent))
  const note = document.querySelector('.sh-filter-note, .location-note')
  const cards = [...document.querySelectorAll('.vcard')].slice(0, 3).map((c) => c.innerText.replace(/\\n+/g, ' | '))
  return {
    url: location.href,
    nearButton: near?.textContent.trim(),
    note: note?.textContent.trim() || null,
    bodyHasKm: /\\b\\d+([.,]\\d+)?\\s*km\\b/.test(document.body.innerText),
    cards,
  }
})()`)
console.log(JSON.stringify(state, null, 2))

await browser.send('Browser.close')
chrome.kill()
