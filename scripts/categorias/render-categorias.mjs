// Gera imagens 1600x1200 com fundo #FFFFFF por categoria.
// Usa o --screenshot nativo do Chrome (termina sozinho) e converte para WebP com ffmpeg.
import http from "node:http";
import { readFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "public", "categorias", "itens");
mkdirSync(outDir, { recursive: true });

const TODOS = ["frasco", "bisnaga", "boiao", "injetavel", "inalador", "pacote", "biberao", "caixa"];
const ITENS = process.argv.slice(2).length ? process.argv.slice(2) : TODOS;
const TYPES = { ".html": "text/html", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = join(root, url.pathname.replace(/^\//, ""));
  if (!file.startsWith(root) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader("Content-Type", TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const FFMPEG = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

// Assíncrono de propósito: o servidor HTTP vive neste processo e tem de
// continuar a responder enquanto o browser carrega a página.
function shot(browser, item) {
  const png = join(outDir, `${item}.png`);
  rmSync(png, { force: true });
  const url = `http://127.0.0.1:${port}/scripts/categorias/cena.html?item=${item}`;
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--window-size=1600,1200",
      "--virtual-time-budget=6000",
      `--screenshot=${png.replace(/\\/g, "/")}`,
      url,
    ], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout do browser"));
    }, 300000);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", () => {
      clearTimeout(timer);
      if (existsSync(png) && statSync(png).size > 5000) resolve(png);
      else reject(new Error("imagem não gerada"));
    });
  });
}

function toWebp(png, webp) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-i", png, "-c:v", "libwebp", "-quality", "92", webp], {
    encoding: "utf8",
  });
  if (r.status !== 0 || !existsSync(webp)) {
    throw new Error(`ffmpeg falhou: ${r.error?.message ?? r.stderr?.trim() ?? "motivo desconhecido"}`);
  }
}

let failures = 0;
let chromeFalhas = 0;
for (const item of ITENS) {
  const ordem = chromeFalhas < 2 ? [CHROME, EDGE] : [EDGE];
  let ok = false;
  for (const browser of ordem) {
    try {
      const png = await shot(browser, item);
      toWebp(png, join(outDir, `${item}.webp`));
      ok = true;
      break;
    } catch (e) {
      console.warn(`[${item}] falhou em ${browser}: ${e.message}`);
      if (browser === CHROME) chromeFalhas++;
    }
  }
  console.log(ok ? `OK ${item}` : `FALHOU ${item}`);
  if (!ok) failures++;
}

server.close();
process.exit(failures ? 1 : 0);
