// UM TURNO pelo OpenRouter num modelo que NÃO LÊ PDF (DeepSeek), em jsdom, com
// content.js e panel.js REAIS. O que se afirma é sobre O QUE CHEGA AO ENVIO: o
// PDF não vai (nem base64, nem file_id); o TEXTO extraído aqui — camada de
// texto da fl. 1 + OCR local da fl. 2 — vai como bloco de documento de texto.
//
// Modos: `texto` (caps aceitaPdf:false) e `nativo` (aceitaPdf:true, a
// não-regressão: o PDF vai em base64 como sempre e o OCR não roda). O 2º
// argumento `grande` troca o PDF por um de ~25 MB de base64: no modo texto ele
// PASSA (o tamanho do arquivo deixou de importar); no nativo bate no teto e a
// mensagem tem de nomear a saída (modelo de texto), não só "desmarque".
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const R = __RAIZ + "/";
const ler = (f) => fs.readFileSync(R + f, "utf8");
let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };

const MODO = process.argv[2] === "nativo" ? "nativo" : "texto";
const GRANDE = process.argv[3] === "grande";
console.log("=== OpenRouter, modelo " + (MODO === "texto" ? "de TEXTO (aceitaPdf:false)" : "que LÊ PDF") + (GRANDE ? ", PDF de ~25 MB" : "") + " ===");

const NOME_AUTOR = "ELIONEUDO EVARISTO DOS SANTOS";
const TEXTO_PECA = "Excelentissimo Senhor Doutor Juiz. " + NOME_AUTOR + " vem propor acao. Art. 186 do Codigo Civil.";
// ~25 MB de base64 válido ("A" repetido decodifica para bytes 0x00): o iframe do
// pdf.js é simulado, então os bytes nunca são interpretados.
const B64 = GRANDE ? "A".repeat(25 * 1024 * 1024) : "JVBERi0xLjQK";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='divTimeLine'></div></body></html>",
  { url: "https://pje.tjce.jus.br/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=99&ca=x",
    runScripts: "dangerously", pretendToBeVisual: true }
);
const w = dom.window;
const erros = [];
w.addEventListener("error", (e) => erros.push("error: " + (e.message || e.error)));
w.addEventListener("unhandledrejection", (e) => erros.push("rejeicao: " + (e.reason && e.reason.message || e.reason)));
const consoleReal = w.console;
w.console = Object.assign({}, consoleReal, {
  error: (...a) => erros.push("console.error: " + a.join(" ")),
  warn: (...a) => erros.push("console.warn: " + a.join(" ")),
});
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.requestIdleCallback = (fn) => w.setTimeout(fn, 0);
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!w.CSS) w.CSS = {};
w.CSS.escape = (x) => String(x);
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
w.Element.prototype.scrollIntoView = function () {};
w.URL.createObjectURL = () => "blob:teste";
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () {};
if (!w.Response) w.Response = class { constructor(b) { this._b = b; } async text() { return String(this._b); } };
w.fetch = async (u) => {
  const s = String(u);
  if (s.endsWith("panel.css")) return { ok: true, text: async () => "" };
  if (s.includes("deny-list.json")) return { ok: true, json: async () => JSON.parse(ler("src/config/deny-list.json")) };
  return { ok: true, text: async () => "", json: async () => ({}) };
};

const enviados = [];
const rpcs = [];
const CAPS = {
  provider: "openrouter", nome: "DeepSeek: DeepSeek V4 Flash 0731", contextTokens: 1310720,
  maxPages: 500, citacoesNativas: false, filesApi: false, contagemTokens: false,
  aceitaPdf: MODO !== "texto", aceitaImagem: false, effort: true, perfil: "ambos",
  preco: { in: 0.065, out: 0.18 },
};
const MODEL = "or:deepseek/deepseek-v4-flash-0731";
const store = { openrouterApiKey: "sk-or-teste", model: MODEL, memoriaCaso: false };
w.chrome = {
  runtime: {
    id: "teste",
    getURL: (p) => "chrome-extension://teste/" + p,
    getManifest: () => ({ version: "0.0.0-teste" }),
    lastError: null,
    onMessage: { addListener() {} },
    connect: () => {
      const port = {
        _msg: [],
        postMessage(m) {
          if (m && m.type === "chat") {
            enviados.push(m);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "ok" })), 0);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "done", content: [{ type: "text", text: "ok" }], stopReason: "end_turn" })), 5);
          }
        },
        disconnect() {},
        onMessage: { addListener: (f) => port._msg.push(f) },
        onDisconnect: { addListener() {} },
      };
      return port;
    },
    sendMessage: (msg, cb) => {
      rpcs.push(msg);
      const t = msg && msg.type;
      let r = { ok: true };
      if (t === "caps") r = { model: MODEL, effort: "medium", caps: CAPS, minuta: { model: MODEL, caps: CAPS, trocado: false } };
      else if (t === "countTokens") r = { tokens: null, semContagem: true, contextTokens: CAPS.contextTokens };
      else if (t === "ocrReconhecer") r = { ok: true, resultado: { texto: "Segunda folha, digitalizada: o reu compareceu.", score: 92, ms: 10, backend: "WASM x4" } };
      else if (t === "upload") r = { error: "NAO DEVIA: upload num provedor sem Files API" };
      if (cb) w.setTimeout(() => cb(r), 0);
      return Promise.resolve(r);
    },
  },
  storage: {
    local: { get: (k, cb) => cb && cb(store), set: (o, cb) => { Object.assign(store, o); if (cb) cb(); }, remove: (k, cb) => cb && cb() },
    sync: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb(), remove: (k, cb) => cb && cb(), onChanged: { addListener() {} } },
    session: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb() },
    onChanged: { addListener() {} },
  },
};

const PECA = { id: "111222", titulo: "111222 - Petição inicial" };
w.eval(`
  window.PJE = {
    dialeto: "legacy", suportado: true,
    listarDocumentos: () => ([${JSON.stringify(PECA)}]),
    lerEventos: () => [], listarMovimentacoes: async () => null,
    getIdProcesso: () => "99", getNumeroProcesso: () => "0001234-56.2020.8.06.0128",
    chaveDoCaso: () => "pje.tjce.jus.br|1|99",
    lerCabecalhoProcesso: () => ({ campos: { Classe: "Procedimento Comum" }, poloAtivo: [], poloPassivo: [] }),
    baixar: async () => ({ kind: "pdf", fmt: "pdf", b64: window.__B64, size: 1000, pages: 2 }),
    scrollAte: () => false, temNaTimeline: () => true,
    dlog: () => {}, contadorAtivacoes: () => 0, ativacaoEmVoo: () => false,
    ehTelaDeErro: () => false, carregarTimelineCompleta: async () => ({}),
    listarPelaApi: async () => null, listarPelaGrid: async () => null,
    lerAnexo: async () => null, baixarPdfOficial: async () => null,
    telaDosAutosViva: () => true, gestoJsf: () => {},
  };
  window.PLIB = { listar: async () => [], aoMudar() {}, tamanhoOk: () => true };
  window.MLIB = { CATEGORIAS: [{ id: "sentenca", rotulo: "Sentenças" }], listar: async () => [], aoMudar() {} };
  window.ZipW = function () {};
  window.PjeExport = { ordenarCronologico: (d) => d.slice() };
  window.DocxImport = undefined;
  window.CASO = {
    ler: async () => ({ caso: null, desligado: false }), salvar: async () => ({}),
    salvarConversa: async () => ({}), lerConversa: async () => null, apagarConversa: async () => {},
    pecas: async () => {}, esquecer: async () => {}, listar: async () => [],
  };
`);
w.__B64 = B64;

function carregar(arquivo) {
  const el = w.document.createElement("script");
  el.textContent = ler(arquivo);
  w.document.head.appendChild(el);
}
for (const f of ["src/pseudonimos.js", "src/anonimizar.js", "src/panel.js", "src/content.js"]) carregar(f);

// iframe do pdf.js simulado pelo CONTRATO de mensagens (ver t-turno-sigiloso)
let leiturasPdf = 0;
const obsFrame = new w.MutationObserver((muts) => {
  for (const m of muts)
    for (const nodo of m.addedNodes) {
      if (!nodo.tagName || nodo.tagName !== "IFRAME") continue;
      if (!String(nodo.src || "").includes("ocr-render.html")) continue;
      const nonce = decodeURIComponent(String(nodo.src).split("n=")[1] || "");
      Object.defineProperty(nodo, "contentWindow", {
        configurable: true,
        value: {
          postMessage(msg) {
            if (!msg || msg.__pjeia !== "ler") return;
            leiturasPdf++;
            w.setTimeout(() => w.postMessage({
              __pjeia: "lido", req: msg.req, ok: true,
              resultado: { paginas: 2, nativas: 1, precisamOcr: 1, folhas: [
                { p: 1, texto: TEXTO_PECA, estado: null },
                { p: 2, texto: "", img: "data:image/jpeg;base64,AAAA", estado: "escaneada" },
              ] },
            }, "*"), 0);
          },
        },
      });
      w.setTimeout(() => w.postMessage({ __pjeia: "render-pronto", nonce }, "*"), 0);
    }
});
obsFrame.observe(w.document.documentElement, { childList: true, subtree: true });

const esperar = (ms) => new Promise((r) => w.setTimeout(r, ms));
const raiz = (() => { for (const e of w.document.querySelectorAll("*")) if (e.shadowRoot) return e.shadowRoot; })();
ok(!!raiz, "o painel montou um Shadow DOM");
await esperar(120);
const $ = (sel) => raiz.querySelector(sel);

const cb = raiz.querySelector('.doclist input[type="checkbox"]');
ok(!!cb, "a peça apareceu na lista");
if (cb) { cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true })); }
await esperar(80);

const ta = $(".inrow textarea") || raiz.querySelector("textarea");
ta.value = "Resuma a peça.";
ta.dispatchEvent(new w.Event("input", { bubbles: true }));
$(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await esperar(GRANDE ? 6000 : 2500);

const status = (($(".status") || {}).textContent || "");
const corpo = JSON.stringify(enviados[0] || {});

if (MODO === "nativo" && GRANDE) {
  ok(enviados.length === 0, "NADA foi enviado: o PDF de 25 MB passa do teto do modelo nativo", enviados.length);
  ok(/acima do limite/.test(status), "o status explica o teto", status.slice(0, 200));
  ok(/OpenRouter/.test(status), "a mensagem diz que é o OpenRouter que recebe o PDF inteiro", status.slice(0, 260));
  ok(/modelo de texto|DeepSeek/.test(status), "a mensagem aponta a SAÍDA (modelo de texto)", status.slice(0, 300));
  ok(/DeepSeek V4 Flash 0731/.test(status), "e nomeia o modelo ativo", status.slice(0, 200));
} else {
  if (enviados.length !== 1) {
    console.log("  DIAG status :", JSON.stringify(status));
    console.log("  DIAG rpcs   :", JSON.stringify(rpcs.map((m) => m.type)));
  }
  ok(enviados.length === 1, "um turno foi enviado", enviados.length);
  ok(!rpcs.some((m) => m.type === "upload"), "NENHUM upload foi tentado (sem Files API)");
  ok(!/"type":"file"/.test(corpo), "nenhum bloco file_id no payload");
}

if (MODO === "texto" && enviados.length) {
  ok(!/"type":"base64"/.test(corpo), "NENHUM bloco base64 no payload: o PDF não foi");
  ok(!corpo.includes(B64.slice(0, 12)) || !GRANDE, "o base64 do PDF grande não está no corpo");
  ok(rpcs.some((m) => m.type === "ocrReconhecer"), "a folha digitalizada passou pelo OCR LOCAL", rpcs.map((m) => m.type));
  ok(leiturasPdf === 1, "o pdf.js leu a peça UMA vez", leiturasPdf);
  const p = enviados[0].payload;
  const docs = [];
  for (const m of p.messages || []) for (const b of Array.isArray(m.content) ? m.content : []) if (b && b.type === "document") docs.push(b);
  ok(docs.length === 1, "um bloco document no request", docs.length);
  const d = docs[0] || {};
  ok(d.source && d.source.type === "text", "o document é de TEXTO", d.source && d.source.type);
  const txt = (d.source && d.source.data) || "";
  ok(txt.includes("Excelentissimo Senhor Doutor Juiz"), "a camada de texto da fl. 1 chegou");
  ok(txt.includes("Segunda folha, digitalizada"), "o texto do OCR da fl. 2 chegou");
  ok(/## Página 1/.test(txt) && /## Página 2/.test(txt), "as folhas vão numeradas (a citação por folha continua possível)");
  ok(!/\[ATENÇÃO: este documento é longo/.test(txt), "o texto NÃO foi cortado (cabe folgado na janela)");
  ok(d.title === PECA.titulo, "o title do bloco é o título da peça (é por ele que o id viaja)", d.title);
  ok(!/data:image/.test(corpo), "nenhum data URL de página vazou");
  // o medidor de contexto mede TEXTO agora, não páginas × 2000 tokens
  const gauge = (($(".g-full") || {}).textContent || "") + (($(".g-short") || {}).textContent || "");
  ok(gauge.length > 0, "o medidor de contexto está pintado", gauge);
}

if (MODO === "nativo" && !GRANDE && enviados.length) {
  ok(/"type":"base64"/.test(corpo), "NÃO-REGRESSÃO: o modelo que lê PDF recebe o base64 como sempre");
  ok(!rpcs.some((m) => m.type === "ocrReconhecer"), "e o OCR local NÃO rodou", rpcs.map((m) => m.type));
  ok(leiturasPdf === 0, "o pdf.js não foi acionado", leiturasPdf);
}

const relevantes = erros.filter((e) => !/memória|memoria|casodb|CASO/.test(e));
ok(relevantes.length === 0, "nenhum erro/aviso inesperado dentro do realm", relevantes.slice(0, 6));
console.log("  " + (n - mau) + "/" + n + " asseroes");
process.exit(mau ? 1 : 0);
