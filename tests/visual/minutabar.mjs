// A barra do modo minuta nos ONZE estados que decidem o desenho.
//
// Ela e o unico lugar que MEDE as duas afirmacoes centrais da v0.61.0: a altura
// da barra (era ~260px, ficou 168px com a tese preenchida) e a contagem de
// caixas ambar (eram tres, sao ZERO em todos os estados). Nenhuma das duas se
// confere por inspecao -- `getComputedStyle` responde certo sobre uma barra que
// esta alta demais, e "quantos avisos aparecem" depende de qual estado se olha.
//
//   node tests/visual/minutabar.mjs [porta]
//
// Depende do Chrome instalado, por isso o `correr.mjs` NAO o roda. O que ele
// imprime e uma tabela por estado; as capturas vao para `capturas-minutabar/`.
//
// A pagina-arnes e a `minutabar.html` ao lado: ela stuba `chrome`, carrega o
// `panel.js` real e expoe `__ligarMinuta` / `__especie` / `__tese`. O
// `__ligarMinuta` MARCA UMA PECA antes de clicar no botao -- sem isso o
// `.btn-minuta` recusa (`temMaterialParaAto`) e a barra mede 0px em todos os
// estados, que foi como este arnes comecou.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const LAB = AQUI;
const SAIDA = join(AQUI, "capturas-minutabar");
const PORTA = Number(process.argv[2] || 8983);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const srv = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const base = url.startsWith("/lab/") ? LAB : RAIZ;
    const p = normalize(join(base, url.startsWith("/lab/") ? url.slice(4) : url));
    const b = await readFile(p);
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => srv.listen(PORTA, "127.0.0.1", r));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + (PORTA + 1),
  "--user-data-dir=" + join(process.env.TEMP, "dm-" + Date.now()),
  "--hide-scrollbars", "--disable-gpu", "--no-first-run", "about:blank"], { stdio: "ignore" });
async function alvo() {
  for (let i = 0; i < 60; i++) {
    try { const j = await (await fetch("http://127.0.0.1:" + (PORTA + 1) + "/json/list")).json();
      const pg = j.find((t) => t.type === "page"); if (pg) return pg.webSocketDebuggerUrl; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  } throw new Error("sem chrome");
}
const ws = new WebSocket(await alvo());
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const cmd = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const js = async (e) => (await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cmd("Page.enable"); await cmd("Runtime.enable");
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") console.log("  ERRO: " + (m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || "?").split("\n")[0]);
});
await cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
mkdirSync(SAIDA, { recursive: true });
const tirar = async (n) => {
  const png = (await cmd("Page.captureScreenshot", { format: "png" })).result?.data;
  writeFileSync(join(SAIDA, n + ".png"), Buffer.from(png, "base64"));
};

async function cena(nome, { larg, modo, vazio, especie, tese }) {
  await cmd("Emulation.setDeviceMetricsOverride", { width: larg, height: larg > 600 ? 900 : 720, deviceScaleFactor: 1, mobile: false });
  await cmd("Page.navigate", { url: "http://127.0.0.1:" + PORTA + "/lab/minutabar.html" + (vazio ? "?vazio=1" : "") });
  for (let i = 0; i < 80; i++) { if (await js("typeof window.__pronto === 'function' && window.__pronto()")) break; await new Promise((r) => setTimeout(r, 120)); }
  if (modo) { await js('window.__modo("' + modo + '")'); await new Promise((r) => setTimeout(r, 500)); }
  await js("window.__ligarMinuta()");
  await new Promise((r) => setTimeout(r, 250));
  if (especie) await js('window.__especie("' + especie + '")');
  if (tese) await js("window.__tese(" + JSON.stringify(tese) + ")");
  await new Promise((r) => setTimeout(r, 400));
  await tirar("min-" + nome);
  const m = JSON.parse(await js("window.__medir()"));
  console.log("\n### " + nome + " (" + larg + "px" + (modo ? ", " + modo : "") + (vazio ? ", biblioteca vazia" : "") + ")");
  console.log("  barra " + m.barH + "px, blocos: " + m.blocos.join(" | "));
  console.log("  caixa modelos: " + (m.caixaModelos === null ? "AUSENTE" : JSON.stringify(m.caixaModelos) + " marcada=" + m.marcada));
  console.log("  cadastrar....: " + (m.cadastrar === null ? "ausente" : JSON.stringify(m.cadastrar)));
  console.log("  nota tese....: " + (m.notaTese === null ? "ausente" : JSON.stringify(m.notaTese)));
  console.log("  nota modelos.: " + (m.notaModelos === null ? "ausente" : JSON.stringify(m.notaModelos)));
  console.log("  quem redige..: " + (m.quemRedige === null ? "ausente" : JSON.stringify(m.quemRedige)));
  console.log("  CAIXAS AMBAR.: " + (m.caixasAmbar.length ? m.caixasAmbar.join(",") : "nenhuma") + "   Gerar " + (m.gerarLigado ? "LIGADO" : "apagado"));
}

await cena("largo-sentenca", { larg: 1280, modo: "expanded", especie: "sentenca" });
await cena("largo-com-tese", { larg: 1280, modo: "expanded", especie: "sentenca", tese: "Improcedência pela prescrição: prazo do art. 206, §5º, I, do CC, com marco em 12/03/2019." });
await cena("largo-oficio", { larg: 1280, modo: "expanded", especie: "oficio" });
await cena("largo-acordao", { larg: 1280, modo: "expanded", especie: "acordao" });
await cena("largo-ata-semmodelo", { larg: 1280, modo: "expanded", especie: "ata" });
await cena("largo-vazio", { larg: 1280, modo: "expanded", especie: "sentenca", vazio: true });
await cena("largo-despacho", { larg: 1280, modo: "expanded", especie: "despacho" });
await cena("largo-despacho-com", { larg: 1280, modo: "expanded", especie: "despacho", tese: "Cite-se o réu para contestar em 15 dias úteis." });
await cena("estreito-despacho", { larg: 460, especie: "despacho" });
await cena("estreito-sentenca", { larg: 460, especie: "sentenca" });
await cena("estreito-vazio", { larg: 460, especie: "sentenca", vazio: true });

ws.close(); chrome.kill(); srv.close(); process.exit(0);
