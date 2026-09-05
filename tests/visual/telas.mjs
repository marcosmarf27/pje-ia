// CAPTURA DAS TELAS SATÉLITES — popup, opções, ajuda, editor, modelos, mapa.
//
// O `capturar.mjs` fotografa o PAINEL, que vive em Shadow DOM dentro da página
// do tribunal. Estas são páginas de extensão comuns, e elas compartilham a
// paleta por `ui.css` — o que significa que uma troca de token no `panel.css`
// que não seja espelhada ali produz duas identidades visuais no mesmo produto,
// sem nenhum teste acusando.
//
// Cada uma recebe um stub mínimo de `chrome` ANTES dos scripts da página: sem
// ele o `popup.js` morre no primeiro `chrome.storage.local.get` e a captura sai
// de uma tela pela metade — que é pior que captura nenhuma, porque parece um
// defeito de layout.
//
//   node tests/visual/telas.mjs tests/visual/capturas-telas 8981
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url)).split(sep).join("/").replace(/[/]$/, "");
const SAIDA = process.argv[2] || "tests/visual/capturas-telas";
const PORTA = Number(process.argv[3] || 8981);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

// O stub e injetado por `Page.addScriptToEvaluateOnNewDocument`, que roda ANTES
// de qualquer script da pagina — e e por isso que ele funciona: um `<script>`
// injetado depois chegaria tarde.
const STUB = `
(() => {
  const dados = {
    apiKey: "sk-ant-exemplo-000", model: "gpt-5.6-luna", effort: "medium",
    tema: "", memoriaCaso: true, avisoGridVisto: true,
  };
  const area = {
    get(c, cb) {
      let out = {};
      if (Array.isArray(c)) { for (const k of c) if (k in dados) out[k] = dados[k]; }
      else if (c && typeof c === "object") { out = Object.assign({}, c); for (const k of Object.keys(c)) if (k in dados) out[k] = dados[k]; }
      else if (typeof c === "string" && c in dados) out[c] = dados[c];
      if (cb) cb(out);
      return Promise.resolve(out);
    },
    set(o, cb) { Object.assign(dados, o || {}); if (cb) cb(); return Promise.resolve(); },
    remove(c, cb) { for (const k of [].concat(c || [])) delete dados[k]; if (cb) cb(); return Promise.resolve(); },
  };
  window.chrome = {
    runtime: {
      id: "arnes", getURL: (p) => "/" + p, openOptionsPage() {},
      sendMessage: (m, cb) => { if (cb) cb({ ok: true }); return Promise.resolve({ ok: true }); },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: "0.60.0" }),
    },
    storage: { local: area, sync: area, session: area, onChanged: { addListener() {} } },
    tabs: { create() {} },
  };
})();
`;

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
  "--user-data-dir=" + join(process.env.TEMP || "/tmp", "telas-" + Date.now()),
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

await cmd("Page.enable"); await cmd("Runtime.enable");
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params?.exceptionDetails;
    console.log("    ERRO: " + (d?.exception?.description || d?.text || "?").split("\n")[0]);
  }
});
await cmd("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

mkdirSync(join(RAIZ, SAIDA), { recursive: true });
// O popup tem largura FIXA de 460px (o Chrome aceita ate 800x600); as demais
// sao paginas de aba comum.
const TELAS = [
  ["popup", "src/popup.html", 460, 640],
  ["opcoes", "src/options.html", 1100, 900],
  ["ajuda", "src/help.html", 1100, 900],
  ["editor", "src/editor.html", 1100, 900],
  ["modelos", "src/modelos.html", 1100, 900],
  ["novidades", "src/changelog.html", 1100, 900],
];
for (const [nome, caminho, w, h] of TELAS) {
  await cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cmd("Page.navigate", { url: `http://127.0.0.1:${PORTA}/${caminho}` });
  await new Promise((r) => setTimeout(r, 900));
  const png = (await cmd("Page.captureScreenshot", { format: "png" })).result?.data;
  writeFileSync(join(RAIZ, SAIDA, nome + ".png"), Buffer.from(png, "base64"));
  console.log("  " + nome + " (" + w + "x" + h + ")");
}

console.log(TELAS.length + " telas em " + SAIDA);
ws.close(); chrome.kill(); srv.close();
process.exit(0);
