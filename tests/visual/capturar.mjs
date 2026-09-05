// CAPTURA DE PIXEL do painel: um PNG por tema e por estado do modo sigiloso.
//
// Irmã da `impressao.mjs`, e as duas existem porque medem coisas diferentes:
// a impressão digital prova que NENHUMA cor mudou onde não devia; a captura
// mostra o que `getComputedStyle` não sabe dizer — sombra `inset` pintada
// abaixo dos filhos, caixa 0x0 que não desenha `box-shadow`, item que foi
// parar numa terceira linha do cabeçalho. Falha de pixel só a captura mostra.
//
//   node tests/visual/capturar.mjs tests/visual/base-v0.59 8911
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url)).split(sep).join("/").replace(/[/]$/, "");
const SAIDA = process.argv[2] || "tests/visual/capturas";
const PORTA = Number(process.argv[3] || 8911);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };

// Lidos do FONTE, nunca uma lista aqui: um tema novo entra na captura sozinho.
const fonte = await readFile(join(RAIZ, "src/panel.js"), "utf8");
const TEMAS = [...fonte.match(/const TEMAS = \[([\s\S]*?)\];/)[1].matchAll(/id:\s*"([^"]*)"/g)].map((m) => m[1]);
console.log("temas encontrados no fonte: " + TEMAS.map((t) => t || "(padrao)").join(", "));

const srv = createServer(async (req, res) => {
  try {
    const p = normalize(join(RAIZ, decodeURIComponent(req.url.split("?")[0])));
    if (!p.startsWith(normalize(RAIZ))) { res.writeHead(403).end(); return; }
    const b = await readFile(p);
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => srv.listen(PORTA, "127.0.0.1", r));

const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=" + (PORTA + 1),
  "--user-data-dir=" + join(process.env.TEMP || "/tmp", "cap-" + Date.now()),
  // Headless reporta `prefers-reduced-motion: reduce` por PADRÃO: sem esta
  // linha mede-se sempre o ramo reduzido, e a captura mente sobre o que o
  // usuário vê. Armadilha nº 13 do plano.
  "--force-prefers-reduced-motion=no-preference",
  "--hide-scrollbars", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "about:blank",
], { stdio: "ignore" });

async function alvo() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PORTA + 1}/json/list`)).json();
      const pg = j.find((t) => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chrome nao respondeu");
}

const ws = new WebSocket(await alvo());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cmd = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const js = async (e) => (await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cmd("Page.enable"); await cmd("Runtime.enable");
// A FLAG `--force-prefers-reduced-motion` NAO FUNCIONA neste Chrome:
// medido, `matchMedia("(prefers-reduced-motion: reduce)").matches` continua
// `true` com ela. Quem manda de verdade e o CDP. Sem isto mede-se sempre o
// ramo reduzido, que e outro layout — e nao o que o usuario ve.
await cmd("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: process.env.REDUZIDO ? "reduce" : "no-preference" }],
});
await cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await cmd("Page.navigate", { url: `http://127.0.0.1:${PORTA}/tests/visual/painel.html` });
for (let i = 0; i < 80; i++) {
  if (await js("typeof window.__pronto === 'function' && window.__pronto()")) break;
  await new Promise((r) => setTimeout(r, 150));
}
if (!(await js("window.__pronto()"))) throw new Error("panel.css nao chegou");

mkdirSync(join(RAIZ, SAIDA), { recursive: true });
let n = 0;
for (const tema of TEMAS) {
  for (const [cena, rot] of [["off", "normal"], ["repouso", "sigilo"]]) {
    await js("window.__vazio(false)");
    await js("window.__tema(" + JSON.stringify(tema) + ")");
    await js('window.__modo("expanded")');
    await js("window.__cena(" + JSON.stringify(cena) + ")");
    await new Promise((r) => setTimeout(r, 620));
    if (process.env.DIAG) {
      const d = await js('(() => { const sr = document.getElementById("pje-ia-host").shadowRoot; const p = sr.querySelector(".panel"); const r = p.getBoundingClientRect(); return JSON.stringify({ reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, css: getComputedStyle(p).transform, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }); })()');
      console.log("  DIAG " + (tema || "padrao") + "/" + rot + " " + d);
    }
    const png = (await cmd("Page.captureScreenshot", { format: "png" })).result?.data;
    const nome = (tema || "padrao") + "-" + rot + ".png";
    writeFileSync(join(RAIZ, SAIDA, nome), Buffer.from(png, "base64"));
    n++;
  }
}
// O estado VAZIO, largo e estreito: é a região com mais componente novo na
// v0.60 e a que menos aparece numa captura de conversa cheia.
for (const [modo, rot] of [["expanded", "largo"], ["", "estreito"]]) {
  await js("window.__tema('')");
  await js("window.__vazio(true)");
  await js("window.__modo(" + JSON.stringify(modo) + ")");
  await js('window.__cena("off")');
  await new Promise((r) => setTimeout(r, 620));
  const png = (await cmd("Page.captureScreenshot", { format: "png" })).result?.data;
  writeFileSync(join(RAIZ, SAIDA, "padrao-vazio-" + rot + ".png"), Buffer.from(png, "base64"));
  n++;
}

// MOVIMENTO REDUZIDO — um retrato proprio, e nao um detalhe de acessibilidade.
// Foi esta captura que revelou que `.panel, .wrap.open .panel { transform: none }`
// dentro do `@media (prefers-reduced-motion: reduce)` vence
// `.wrap.expanded .panel { transform: translate(-50%,-50%) }` por vir depois no
// arquivo: quem pede menos movimento recebe o painel expandido DESCENTRADO,
// com o canto superior esquerdo no meio da tela. `getComputedStyle` reporta
// tudo vivo e correto; so a captura mostra.
await cmd("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
for (const [modo, rot] of [["expanded", "largo"], ["", "estreito"]]) {
  await js("window.__tema('')");
  await js("window.__vazio(false)");
  await js("window.__modo(" + JSON.stringify(modo) + ")");
  await js('window.__cena("off")');
  await new Promise((r) => setTimeout(r, 620));
  const png = (await cmd("Page.captureScreenshot", { format: "png" })).result?.data;
  writeFileSync(join(RAIZ, SAIDA, "padrao-reduzido-" + rot + ".png"), Buffer.from(png, "base64"));
  n++;
}

console.log(n + " capturas em " + SAIDA);
ws.close(); chrome.kill(); srv.close();
process.exit(0);
