// IMPRESSÃO DIGITAL do painel: para CADA elemento da árvore sombra, as
// propriedades de cor computadas. É a única prova de que o saneamento dos
// literais (`#fff` -> token) não mudou um pixel do tema padrão — inspecionar
// um diff de 50 substituições à mão não prova nada.
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url)).split(sep).join("/").replace(/[/]$/, "");
const ARQ = process.argv[2];
const PORTA = Number(process.argv[3] || 8901);
const COMPARAR = process.argv[4];
// Tema a fotografar; vazio = o padrão. É por aqui que a impressão digital do
// visual ANTIGO passa a ser tirada com TEMA=institucional, na v0.60.
const TEMA = process.env.TEMA || "";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

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
  "--user-data-dir=" + join(process.env.TEMP, "imp-" + Date.now()),
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

const PROPS = ["backgroundColor", "backgroundImage", "color", "borderTopColor", "borderRightColor",
  "borderBottomColor", "borderLeftColor", "boxShadow", "outlineColor", "fill", "stroke"];

const COLETA = `(() => {
  const sr = document.getElementById("pje-ia-host").shadowRoot;
  const props = ${JSON.stringify(PROPS)};
  const out = [];
  const caminho = (el) => {
    const p = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== sr) {
      let s = n.tagName.toLowerCase();
      if (n.className && typeof n.className === "string") s += "." + n.className.trim().split(/\\s+/).join(".");
      const irmaos = n.parentNode ? [...n.parentNode.children].filter((x) => x.tagName === n.tagName) : [];
      if (irmaos.length > 1) s += ":" + (irmaos.indexOf(n) + 1);
      p.unshift(s);
      n = n.parentNode instanceof ShadowRoot ? null : n.parentNode;
    }
    return p.join(">");
  };
  for (const el of sr.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const v = {};
    for (const p of props) v[p] = cs[p];
    out.push([caminho(el), v]);
  }
  return JSON.stringify(out);
})()`;

// Vários estados: um retrato só não cobre o que muda com a classe do modo.
const retratos = {};
for (const [nome, cena, modo, vazio] of [
  ["normal-largo", "off", "expanded"],
  ["sigilo-largo", "repouso", "expanded"],
  ["normal-estreito", "off", ""],
  ["sigilo-estreito", "repouso", ""],
  ["vazio-largo", "off", "expanded", true],
  ["vazio-estreito", "off", "", true],
]) {
  await js("window.__vazio(" + (vazio ? "true" : "false") + ")");
  await js("window.__tema(" + JSON.stringify(TEMA) + ")");
  await js(`window.__modo(${JSON.stringify(modo)})`);
  await js(`window.__cena(${JSON.stringify(cena)})`);
  await new Promise((r) => setTimeout(r, 480));
  retratos[nome] = JSON.parse(await js(COLETA));
}

if (COMPARAR && existsSync(COMPARAR)) {
  const antes = JSON.parse(readFileSync(COMPARAR, "utf-8"));
  let dif = 0, iguais = 0, faltando = 0;
  for (const nome of Object.keys(retratos)) {
    const a = new Map(antes[nome] || []);
    for (const [cam, v] of retratos[nome]) {
      const va = a.get(cam);
      if (!va) { faltando++; continue; }
      for (const p of PROPS) {
        if (va[p] !== v[p]) {
          if (dif < 40) console.log(`  DIF ${nome}  ${cam}\n      ${p}: "${va[p]}" -> "${v[p]}"`);
          dif++;
        } else iguais++;
      }
    }
  }
  console.log(`\n=== ${iguais} propriedades IGUAIS, ${dif} diferentes, ${faltando} elementos novos/ausentes ===`);
  console.log(dif === 0 ? "TEMA PADRÃO INTACTO" : "HÁ REGRESSÃO — investigar as linhas acima");
} else {
  writeFileSync(ARQ, JSON.stringify(retratos));
  const n = Object.values(retratos).reduce((a, r) => a + r.length, 0);
  console.log(`impressão gravada em ${ARQ}: ${n} elementos x ${PROPS.length} propriedades`);
}

ws.close(); chrome.kill(); srv.close();
process.exit(0);
