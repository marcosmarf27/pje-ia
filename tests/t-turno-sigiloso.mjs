// UM TURNO INTEIRO com o modo sigiloso ligado, em jsdom, com o content.js e o
// panel.js REAIS. E o teste que protege o produto: a asserção não é sobre uma
// função interna, é sobre O QUE CHEGA AO ENVIO -- nenhum bloco de arquivo,
// nenhum base64, nenhuma imagem, e o nome da parte em lugar nenhum.
//
// O harness segue as quatro armadilhas que o CLAUDE.md registra:
//  (a) runScripts: "dangerously", senão os <script> não executam;
//  (b) `Response` não existe em jsdom (polyfill que herda o content-type);
//  (c) ponte por <script> para alcançar os `const` léxicos do lado do Node;
//  (d) `chrome.runtime.id` é obrigatório no stub.
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

// "normal" roda o MESMO cenario com o modo desligado -- e e' esse que prova a
// nao-regressao: nenhuma chamada do caminho novo, e a peca indo como sempre foi.
const SIGILOSO = process.argv[2] !== "normal";
// "pdf" troca a peca de texto por um PDF de duas folhas -- uma com camada de
// texto e outra digitalizada, que so o OCR le. E' o ramo de 90% dos autos.
const COMO_PDF = process.argv[3] === "pdf";
// "armafalha" faz o worker recusar o `sigiloArmar`: guarda que nao armou =
// modo que nao pode ficar ligado.
const ARMA_FALHA = process.argv[3] === "armafalha";
// "cancelar": o usuario CANCELA na caixa de conferencia e depois envia de novo.
// "semaprovar": a preferencia `sigiloAprovar` esta desligada -- sem caixa.
const CANCELAR = process.argv.includes("cancelar");
const SEM_APROVAR = process.argv.includes("semaprovar");
// "historico": um SEGUNDO turno com uma segunda peca. O nome da testemunha
// aparece na PRIMEIRA peca, mas o "NER" so' o encontra na segunda -- e' o caso
// real do mapa que cresce depois de a peca ter saido em claro. O request do 2o
// turno tem de levar o bloco antigo REMASCARADO.
const HISTORICO = process.argv.includes("historico");
// "opaco": a resposta do 1o turno traz um bloco OPACO (raciocinio do
// OpenRouter) com o nome da re' em claro. No 2o turno a conferencia local tem
// de bloquear ANTES da rede, dizer que e' o raciocinio guardado, e oferecer so'
// a conversa nova como saida que preserva o nome.
const OPACO = process.argv.includes("opaco");
// "lento": o modelo demora 4 s para o primeiro token (raciocinio longo). O
// TESTE PRINCIPAL de feedback: bolha com pontos + texto que ANDA, status,
// placeholder do campo. "erro": a porta devolve erro -- nenhuma bolha vazia
// sobrevive e o status diz o que houve.
const LENTO = process.argv.includes("lento");
const ERRO = process.argv.includes("erro");
console.log("=== turno " + (SIGILOSO ? "com" : "SEM") + " modo sigiloso, ponta a ponta (jsdom) ===");

// ---------------------------------------------------------------- os dados
const NOME_AUTOR = "ELIONEUDO EVARISTO DOS SANTOS";
const NOME_REU = "MARIA APARECIDA DE SOUZA";
const CPF_AUTOR = "529.982.247-25";
const NOME_TESTEMUNHA = "CARLOS ALBERTO LIMA";
const TEXTO_PECA =
  "Excelentissimo Senhor Doutor Juiz. " + NOME_AUTOR + ", inscrito no CPF " + CPF_AUTOR +
  ", vem propor acao em face de " + NOME_REU + ", pelos fatos a seguir. " +
  "O contrato foi firmado em 12 de marco de 2024, com fundamento no art. 186 do Codigo Civil." +
  (HISTORICO ? " A testemunha " + NOME_TESTEMUNHA + " nada viu." : "");
const TEXTO_PECA2 = "Contestacao. Em audiencia, " + NOME_TESTEMUNHA + " depos que nada viu.";

// Spans que o "NER" devolveria para esse texto (o modelo de verdade nao roda em
// node -- o que se testa aqui e' a CADEIA, e a fidelidade do modelo ja tem o
// t-ponta-a-ponta com logits reais).
function spansDoNer(texto) {
  const out = [];
  for (const nome of [NOME_AUTOR, NOME_REU]) {
    let i = texto.indexOf(nome);
    while (i !== -1) { out.push({ tipo: "PESSOA", ini: i, fim: i + nome.length, score: 0.95 }); i = texto.indexOf(nome, i + 1); }
  }
  // A testemunha so' e' "vista" pelo NER na SEGUNDA peca (a que comeca por
  // "Contestacao"): na primeira ela passa em claro, de proposito.
  if (texto.startsWith("Contestacao")) {
    const i = texto.indexOf(NOME_TESTEMUNHA);
    if (i !== -1) out.push({ tipo: "PESSOA", ini: i, fim: i + NOME_TESTEMUNHA.length, score: 0.95 });
  }
  return out;
}

// ---------------------------------------------------------------- ambiente
const dom = new JSDOM(
  "<!doctype html><html><body><div id='divTimeLine'></div></body></html>",
  { url: "https://pje.tjce.jus.br/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=99&ca=x",
    runScripts: "dangerously", pretendToBeVisual: true }
);
const w = dom.window;
// Captura TUDO o que quebrar dentro do realm: sem isto, um erro no content.js
// aparece como "nada aconteceu" -- que e' o pior sintoma possivel num harness.
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
// Captura o que `baixarBlob` produziria: o relatorio de conferencia.
const baixados = [];
w.URL.createObjectURL = (blob) => { baixados.push(blob); return "blob:teste"; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () {};
// jsdom nao implementa Response; `PJE.lerAnexo` a usa e o erro pareceria bug do produto.
if (!w.Response) w.Response = class { constructor(b) { this._b = b; } async text() { return String(this._b); } };
w.fetch = async (u) => {
  const s = String(u);
  if (s.endsWith("panel.css")) return { ok: true, text: async () => "" };
  if (s.includes("deny-list.json"))
    return { ok: true, json: async () => JSON.parse(ler("src/config/deny-list.json")) };
  return { ok: true, text: async () => "", json: async () => ({}) };
};

// -------------------------------------------------------------- stub do chrome
const enviados = [];         // tudo que foi pela Port (o turno)
const rpcs = [];             // tudo que foi por sendMessage
let sigiloArmado = null;
const store = Object.assign(
  { apiKey: "sk-teste", model: "claude-sonnet-5", memoriaCaso: false },
  SEM_APROVAR ? { sigiloAprovar: false } : {}
);
w.chrome = {
  runtime: {
    id: "teste",                                  // (d) obrigatorio
    getURL: (p) => "chrome-extension://teste/" + p,
    getManifest: () => ({ version: "0.0.0-teste" }),
    lastError: null,
    onMessage: { addListener() {} },
    connect: () => {
      const port = {
        _msg: [], _dis: [],
        postMessage(m) {
          if (m && m.type === "chat") enviados.push(m);
          // responde o turno para o content nao ficar pendurado
          if (m && m.type === "chat" && ERRO) {
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "error", error: "limite de uso excedido (teste)" })), 100);
            return;
          }
          if (m && m.type === "chat" && LENTO) {
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "thinking", text: "" })), 0);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "" })), 300);
            w.setTimeout(() => w.__sondaEspera && w.__sondaEspera(), 500);
            w.setTimeout(() => w.__sondaEspera && w.__sondaEspera(), 3600);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "ok" })), 4000);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "done", content: [{ type: "text", text: "ok" }], stopReason: "end_turn" })), 4100);
            return;
          }
          if (m && m.type === "chat") {
            // thinking VAZIO primeiro (e' o que o OpenRouter manda para acender o
            // status), e uma sonda 1 ms depois: a bolha ainda tem os pontos?
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "thinking", text: "" })), 0);
            w.setTimeout(() => w.__sondaEspera && w.__sondaEspera(), 1);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "" })), 2);
            w.setTimeout(() => w.__sondaEspera && w.__sondaEspera(), 3);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "ok" })), 4);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "done", content: OPACO
              ? [{ type: "x-openrouter-item", model: "or:x", raw: { reasoning_details: [{ type: "reasoning.text", text: "Pensei em " + NOME_REU + "." }] } }, { type: "text", text: "ok" }]
              : [{ type: "text", text: "ok" }], stopReason: "end_turn" })), 5);
          }
        },
        disconnect() {},
        onMessage: { addListener: (f) => port._msg.push(f) },
        onDisconnect: { addListener: (f) => port._dis.push(f) },
      };
      return port;
    },
    sendMessage: (msg, cb) => {
      rpcs.push(msg);
      const t = msg && msg.type;
      let r = { ok: true };
      if (t === "caps") {
        r = { model: "claude-sonnet-5", effort: "medium",
              caps: { provider: "anthropic", contextTokens: 1000000, maxPages: 600, citacoesNativas: true },
              minuta: { model: "claude-sonnet-5", caps: { provider: "anthropic", contextTokens: 1000000 }, trocado: false } };
      } else if (t === "countTokens") {
        r = { tokens: 1000, contextTokens: 1000000 };
      } else if (t === "nerDetectar") {
        r = { ok: true, spans: spansDoNer(msg.payload.texto) };
      } else if (t === "sigiloArmar") {
        if (ARMA_FALHA) {
          if (cb) w.setTimeout(() => cb({ error: "o serviço da extensão não respondeu" }), 0);
          return Promise.resolve({ error: "o serviço da extensão não respondeu" });
        }
        sigiloArmado = msg; r = { ok: true, quantos: (msg.proibidos || []).length };
      } else if (t === "ocrReconhecer") {
        r = { ok: true, resultado: { texto: "Segunda folha, digitalizada: " + NOME_REU + " compareceu.", score: 92, ms: 10, backend: "WASM x4" } };
      } else if (t === "upload") {
        r = { fileId: "file_NAO_DEVIA_ACONTECER" };
      }
      if (cb) w.setTimeout(() => cb(r), 0);
      return Promise.resolve(r);
    },
  },
  storage: {
    local: {
      get: (k, cb) => cb && cb(store),
      set: (o, cb) => { Object.assign(store, o); if (cb) cb(); },
      remove: (k, cb) => cb && cb(),
    },
    sync: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb(), remove: (k, cb) => cb && cb(),
            onChanged: { addListener() {} } },
    session: { get: (k, cb) => cb && cb({}), set: (o, cb) => cb && cb() },
    onChanged: { addListener() {} },
  },
};

// ------------------------------------------------------------- stubs da casa
const PECA = { id: "111222", titulo: "111222 - Petição inicial de " + NOME_AUTOR };
const PECA2 = { id: "111223", titulo: "111223 - Contestação" };
w.eval(`
  window.__PJE = {
    dialeto: "legacy", suportado: true,
    listarDocumentos: () => (${HISTORICO} ? [${JSON.stringify(PECA)}, ${JSON.stringify(PECA2)}] : [${JSON.stringify(PECA)}]),
    lerEventos: () => [],
    listarMovimentacoes: async () => null,
    getIdProcesso: () => "99",
    getNumeroProcesso: () => "0001234-56.2020.8.06.0128",
    chaveDoCaso: () => "pje.tjce.jus.br|1|99",
    lerCabecalhoProcesso: () => ({
      campos: { Classe: "Procedimento Comum" },
      poloAtivo: [{ nome: ${JSON.stringify(NOME_AUTOR)}, documento: ${JSON.stringify(CPF_AUTOR)}, tipoDocumento: "CPF", representantes: [] }],
      poloPassivo: [{ nome: ${JSON.stringify(NOME_REU)}, tipoDocumento: "CPF", representantes: [] }],
    }),
    baixar: async (id) => (String(id) === "111223"
      ? { kind: "text", fmt: "texto", text: ${JSON.stringify(TEXTO_PECA2)} }
      : ${COMO_PDF}
      ? { kind: "pdf", fmt: "pdf", b64: "JVBERi0xLjQK", size: 1000, pages: 2 }
      : { kind: "text", fmt: "texto", text: ${JSON.stringify(TEXTO_PECA)} }),
    scrollAte: () => false, temNaTimeline: () => true,
    dlog: () => {}, contadorAtivacoes: () => 0, ativacaoEmVoo: () => false,
    ehTelaDeErro: () => false, carregarTimelineCompleta: async () => ({}),
    listarPelaApi: async () => null, listarPelaGrid: async () => null,
    lerAnexo: async () => null, baixarPdfOficial: async () => null,
    telaDosAutosViva: () => true, gestoJsf: () => {},
  };
  window.PJE = window.__PJE;
  window.PLIB = { listar: async () => [], aoMudar() {}, tamanhoOk: () => true };
  window.MLIB = { CATEGORIAS: [{ id: "sentenca", rotulo: "Sentenças" }], listar: async () => [], aoMudar() {} };
  window.ZipW = function () {};
  window.PjeExport = { ordenarCronologico: (d) => d.slice() };
  window.DocxImport = undefined;
  window.__gravado = { caso: [], conversa: [] };
  window.CASO = {
    ler: async () => ({ caso: null, desligado: false }),
    salvar: async (chave, patch) => { window.__gravado.caso.push(patch); return {}; },
    salvarConversa: async (chave, id, patch) => { window.__gravado.conversa.push(patch); return {}; },
    lerConversa: async () => null,
    apagarConversa: async () => {},
    pecas: async () => {},
    esquecer: async () => {},
    listar: async () => [],
  };
`);

// ---------------------------------------------------------- carrega os scripts
function carregar(arquivo) {
  const el = w.document.createElement("script");
  el.textContent = ler(arquivo);
  w.document.head.appendChild(el);
}
for (const f of ["src/pseudonimos.js", "src/anonimizar.js", "src/panel.js", "src/content.js"]) carregar(f);
// (c) ponte: `const PSEUD` e' declaracao lexica e nao vira propriedade de window
carregar_ponte();
function carregar_ponte() {
  const el = w.document.createElement("script");
  el.textContent = "window.__PSEUD = PSEUD; window.__ANON = ANON;";
  w.document.head.appendChild(el);
}
ok(typeof w.__PSEUD === "object", "pseudonimos.js carregou no realm da pagina");
ok(typeof w.__ANON === "object", "anonimizar.js carregou no realm da pagina");

// O iframe do pdf.js nao carrega em jsdom (src chrome-extension://). Aqui ele e'
// simulado pelo CONTRATO de mensagens que `garantirRender`/`lerPdfNoFrame` usam
// -- `render-pronto` com o nonce, e a resposta `lido` ao pedido `ler`. Assim o
// teste exercita o ramo PDF de verdade: o laco por folha, o OCR da digitalizada
// e o `delete f.img`.
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
            w.setTimeout(() => w.postMessage({
              __pjeia: "lido", req: msg.req, ok: true,
              resultado: {
                paginas: 2, nativas: 1, precisamOcr: 1,
                folhas: [
                  { p: 1, texto: TEXTO_PECA, estado: null },
                  { p: 2, texto: "", img: "data:image/jpeg;base64,AAAA", estado: "escaneada" },
                ],
              },
            }, "*"), 0);
          },
        },
      });
      w.setTimeout(() => w.postMessage({ __pjeia: "render-pronto", nonce }, "*"), 0);
    }
});
obsFrame.observe(w.document.documentElement, { childList: true, subtree: true });

let statusAposToggle = "";
const esperar = (ms) => new Promise((r) => w.setTimeout(r, ms));
const host = w.document.documentElement.querySelector("div");
const raiz = [...w.document.documentElement.children].map((e) => e.shadowRoot).find(Boolean)
  || (() => { for (const e of w.document.querySelectorAll("*")) if (e.shadowRoot) return e.shadowRoot; })();
ok(!!raiz, "o painel montou um Shadow DOM");

await esperar(60);

const $ = (sel) => raiz.querySelector(sel);

// ------------------------------------------------------------------ o teste
ok(!!$(".tgl-sigilo"), "o botão do modo sigiloso existe na barra");
ok($(".selo-sigilo") && $(".selo-sigilo").hidden, "o selo começa escondido (modo desligado)");

// O clique TEM de acontecer também quando `ARMA_FALHA` — é ele que exercita o
// caminho de falha. (Uma substituição em massa já apagou este `if` uma vez e o
// cenário passou 13/14 sem NUNCA ter clicado no botão: as asserções de "botão
// solto" e "selo escondido" davam certo porque nada tinha acontecido. Falso
// positivo de teste é pior que teste vermelho.)
if (SIGILOSO) {
  $(".tgl-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(200);
  ok($(".tgl-sigilo").getAttribute("aria-pressed") === String(!ARMA_FALHA),
     ARMA_FALHA ? "o botão VOLTA a solto quando a guarda não arma" : "o botão fica pressionado");
  ok($(".selo-sigilo").hidden === ARMA_FALHA,
     ARMA_FALHA ? "o selo não fica aceso" : "o selo aparece");
  statusAposToggle = (($(".status") || {}).textContent || "");
  if (!ARMA_FALHA) {
    ok(rpcs.some((m) => m.type === "sigiloArmar"), "a guarda de saída foi ARMADA no worker",
       rpcs.map((m) => m.type));
  }
} else {
  // NAO clica: o modo tem de nascer desligado e ficar desligado.
  ok($(".tgl-sigilo").getAttribute("aria-pressed") === "false", "o botão nasce solto");
  ok(!rpcs.some((m) => m.type === "sigiloArmar"), "nada foi armado no worker",
     rpcs.map((m) => m.type));
}

// marca a peça
await esperar(80);
const cb = raiz.querySelector('.doclist input[type="checkbox"]');
ok(!!cb, "a peça apareceu na lista");
if (cb) { cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true })); }
await esperar(80);

// --------------------------- a MEDIÇÃO não pode mutar o mapa, e tem de mascarar
// `refinarContexto` roda no debounce de 900 ms da mudança de seleção, SEM envio.
// Ela monta um request prospectivo com o system (que carrega a ficha do
// processo, com os nomes das partes). Duas coisas têm de valer ao mesmo tempo:
// o que vai ao `countTokens` está MASCARADO (senão a guarda de saída bloquearia
// o pré-voo) e o mapa de reidentificação NÃO cresceu (senão o artefato mais
// sensível da extensão vai ao disco por um clique de checkbox).
if (SIGILOSO && !ARMA_FALHA) {
  await esperar(1400);   // passa o debounce de 900 ms
  // Sob sigilo, o refinamento pela REDE (`count_tokens`) NAO pode rodar enquanto
  // a peça não estiver mascarada: ele é uma requisição ao provedor com o corpo
  // do request dentro. A camada LOCAL continua (não sai da máquina).
  const ctAntes = rpcs.filter((m) => m.type === "countTokens");
  ok(ctAntes.length === 0,
     "o count_tokens NAO roda antes do mascaramento (seria enviar o original para contar)",
     rpcs.map((m) => m.type));
  const ct = ctAntes.pop();
  if (ct) {
    const sys = JSON.stringify(ct.payload.system || "");
    ok(!sys.includes(NOME_AUTOR), "o system da MEDIÇÃO vai mascarado", sys.slice(0, 120));
    ok(!sys.includes("0001234-56.2020.8.06.0128"), "e sem o número do processo");
    ok(/\[PESSOA_\d+\]/.test(sys) || /\[PROCESSO_\d+\]/.test(sys),
       "o system da medição traz rótulos", sys.slice(0, 160));
  }
  // o mapa gravado até aqui é o do toggle (vazio): a medição não escreveu nele
  const gravAte = (w.__gravado.caso || []).filter((x) => x && x.sigilo);
  const maior = gravAte.reduce((a, x) => Math.max(a, (x.sigilo.mapa.itens || []).length), 0);
  ok(maior === 0, "o mapa NÃO cresceu com a medição (nada foi gravado por um clique)", maior);
}

// escreve e envia
const ta = $(".inrow textarea") || raiz.querySelector("textarea");
ok(!!ta, "o campo de mensagem existe");
const PERGUNTA = "O que " + NOME_AUTOR + " alegou?";
// A sonda da espera: registrada antes do envio, lida pelo stub da porta.
const sondas = [];
w.__sondaEspera = () => sondas.push({
  dots: !!raiz.querySelector(".msg.assistant .dots"),
  vazia: [...raiz.querySelectorAll(".msg.assistant")].some((m) => !m.textContent.trim() && !m.querySelector(".dots")),
  status: (($(".status") || {}).textContent || ""),
  bolha: ((raiz.querySelector(".msg.assistant .wait-t") || {}).textContent || ""),
  placeholder: ta.placeholder,
  travado: ta.disabled,
});
ta.value = PERGUNTA;
ta.dispatchEvent(new w.Event("input", { bubbles: true }));
$(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

// ------------------------- a CONFERENCIA HUMANA fica entre a mascara e a rede
async function esperarSigok(max = 4000) {
  for (let t = 0; t < max; t += 50) {
    const b = $(".sigok");
    if (b && !b.hidden) return b;
    await esperar(50);
  }
  return null;
}
const rpcsRede = () => rpcs.filter((m) => m.type === "countTokens" || m.type === "upload").map((m) => m.type);
if (SIGILOSO && !ARMA_FALHA && !SEM_APROVAR) {
  const caixa = await esperarSigok();
  ok(!!caixa, "a caixa de conferencia APARECEU depois do mascaramento");
  ok(enviados.length === 0, "e NADA foi pela porta antes da aprovacao", enviados.length);
  ok(rpcsRede().length === 0, "nem count_tokens nem upload antes da aprovacao", rpcsRede());
  const rows = raiz.querySelectorAll(".sigok .sk-row");
  ok(rows.length === 1, "ela lista a peca deste turno (1)", rows.length);
  const txt = $(".sigok .sk-txt");
  ok(txt && txt.hidden, "o texto comeca recolhido");
  const ver = $(".sigok .sk-ver");
  if (ver) ver.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(txt && !txt.hidden, "e abre no clique em Ver o texto");
  ok(txt && /\[PESSOA_\d+\]/.test(txt.textContent), "o texto mostrado traz os rotulos", (txt || {}).textContent);
  ok(txt && !txt.textContent.includes(NOME_AUTOR), "e nao traz o nome em claro");
  ok(txt && txt.querySelectorAll("mark.aud-rot").length >= 1, "as marcas sao as mesmas da auditoria (mark.aud-rot)");
  ok(/1 peça/.test(($(".sigok-resumo") || {}).textContent || ""), "o resumo fala de 1 peca", ($(".sigok-resumo") || {}).textContent);
  ok(/Enviar 1 peça/.test(($(".sigok-ok") || {}).textContent || ""), "o botao diz quantas pecas saem");
  if (CANCELAR) {
    $(".sigok-cancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await esperar(400);
    ok($(".sigok").hidden, "a caixa fechou");
    ok(enviados.length === 0, "nada foi enviado depois do cancelamento", enviados.length);
    ok(ta.value === PERGUNTA, "o texto digitado VOLTOU ao campo", ta.value);
    ok(raiz.querySelectorAll(".msg.user").length === 0, "a bolha do usuario saiu do transcript");
    const st = (($(".status") || {}).textContent || "");
    ok(!/^Erro:/.test(st) && /cancelad/i.test(st), "o status diz que foi cancelado, nao erro", st);
    // A AUDITORIA nao pode afirmar "enviada" sobre a peca cancelada.
    $(".selo-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await esperar(50);
    ok(raiz.querySelectorAll(".audbox .aud-peca").length === 0,
       "a auditoria NAO lista a peca cancelada como enviada", raiz.querySelectorAll(".audbox .aud-peca").length);
    $(".selo-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await esperar(50);
    // A FUGA pelo refinamento: a peca esta mascarada no cache e NAO aprovada.
    // Mexer na selecao dispara o `refinarContexto` (debounce 900 ms), que
    // manda count_tokens ao provedor -- com o texto que o usuario acabou de
    // recusar. Tem de ficar mudo.
    const antesCt = rpcsRede().length;
    cb.checked = false; cb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await esperar(150);
    cb.checked = true; cb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await esperar(1500);
    ok(rpcsRede().length === antesCt, "trocar a selecao NAO manda count_tokens com texto nao aprovado", rpcsRede());
    // envia de novo: a caixa tem de voltar (as pecas continuam esperando)
    const nerAntes = rpcs.filter((m) => m.type === "nerDetectar" || m.type === "ocrReconhecer").length;
    ta.value = PERGUNTA;
    ta.dispatchEvent(new w.Event("input", { bubbles: true }));
    $(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const caixa2 = await esperarSigok();
    ok(!!caixa2, "no reenvio a caixa aparece DE NOVO");
    ok(enviados.length === 0, "e ainda nada foi pela porta", enviados.length);
    ok(rpcs.filter((m) => m.type === "nerDetectar" || m.type === "ocrReconhecer").length === nerAntes,
       "sem refazer NER nem OCR (a peca ja estava mascarada no cache)");
  } else {
    // EDITAR de dentro da caixa: abre o editor de revisao por cima, o texto
    // regravado e' o que a caixa mostra e o que vai no request.
    const ed = $(".sigok .sk-edit");
    ok(!!ed, "cada peca tem o botao Editar");
    ed.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await esperar(80);
    const editor = raiz.querySelector(".sig-edit");
    ok(!!editor, "o editor de revisao abriu por cima da caixa");
    if (editor) {
      const eta = editor.querySelector(".se-ta");
      ok(eta && /\[PESSOA_\d+\]/.test(eta.value), "o editor abre com o texto mascarado");
      eta.value = eta.value + " EDITADO-NA-CAIXA";
      editor.querySelector(".se-usar").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      await esperar(200);
      ok(!raiz.querySelector(".sig-edit"), "o editor fechou ao usar o texto");
      ok(!$(".sigok").hidden, "e a caixa de conferencia continua aberta");
      const txt2 = $(".sigok .sk-txt");
      ok(txt2 && txt2.textContent.includes("EDITADO-NA-CAIXA"), "a linha da peca repintou com o texto editado");
    }
  }
  $(".sigok-ok").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(2500);
  ok($(".sigok").hidden, "a caixa fechou ao aprovar");
  if (!CANCELAR) ok(JSON.stringify(enviados[0] || {}).includes("EDITADO-NA-CAIXA"), "o request leva o texto EDITADO na caixa");
  // A CONTAGEM mora no CARIMBO do cabecalho (`.sigselo .ss-n`) desde que a
  // `.sigbar` de largura inteira foi removida. O seletor antigo (`.sigbar
  // .sb-n`) continuava "passando" -- comparava "" com "" e nao testava nada.
  // Teste que para de testar em silencio e' pior que teste que quebra.
  ok(!raiz.querySelector(".sigbar"), "a faixa de largura inteira nao existe mais");
  ok(!$(".sigselo").hidden, "o carimbo do cabecalho esta' visivel no modo sigiloso");
  const contagem = () => (($(".sigselo .ss-n") || {}).textContent || "");
  const protegidosAntes = contagem();
  ok(/\d/.test(protegidosAntes), "o carimbo mostra a contagem de dados protegidos", protegidosAntes);
  $(".selo-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(50);
  ok(raiz.querySelectorAll(".audbox .aud-peca").length === 1,
     "depois de aprovar e enviar, a auditoria lista a peca (1)", raiz.querySelectorAll(".audbox .aud-peca").length);
  ok(contagem() === protegidosAntes,
     "abrir a auditoria NAO muda a contagem de dados protegidos (repintura e' read-only)", protegidosAntes);
  ok(!!raiz.querySelector(".audbox .aud-liberar"), "a tabela oferece 'nao e' dado pessoal' por linha");
  $(".selo-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(50);
} else {
  await esperar(LENTO ? 5000 : 2500);
  if (LENTO) {
    // O TESTE PRINCIPAL DE FEEDBACK (regra do usuario, 02/09/2026): durante uma
    // espera longa a tela tem de dizer, onde o olho esta', que esta' esperando.
    ok(sondas.length === 2, "duas sondas durante a espera lenta", sondas.length);
    ok(sondas.every((x) => x.dots), "a bolha mantem os pontos durante toda a espera", sondas);
    ok(sondas.every((x) => /Analisando|Raciocinando/.test(x.bolha)), "a bolha DIZ que esta' analisando/raciocinando", sondas.map((x) => x.bolha));
    ok(/\d+ s/.test(sondas[1].bolha), "e o relogio anda dentro da bolha (segundos)", sondas[1].bolha);
    ok(/\d+ s/.test(sondas[1].status), "e na linha de status", sondas[1].status);
    ok(sondas.every((x) => /Aguardando/.test(x.placeholder)), "o campo diz 'Aguardando a resposta'", sondas.map((x) => x.placeholder));
    ok(sondas.every((x) => x.travado), "e esta' travado enquanto espera");
    const bolhaFim = raiz.querySelector(".msg.assistant");
    ok(bolhaFim && /ok/.test(bolhaFim.textContent) && !bolhaFim.querySelector(".wait-t"), "no fim a bolha tem a resposta e o texto de espera sumiu");
    ok(!/Aguardando/.test(ta.placeholder) && !ta.disabled, "o campo voltou ao normal", ta.placeholder);
    ok(!(($(".status") || {}).textContent || ""), "e o status esvaziou");
  }
  if (ERRO) {
    ok(enviados.length === 1, "o turno foi enviado");
    ok(raiz.querySelectorAll(".msg.assistant").length === 0, "NENHUMA bolha vazia sobrou depois do erro");
    ok(/^Erro:/.test((($(".status") || {}).textContent || "")), "o status diz que houve erro", ($(".status") || {}).textContent);
    ok(/limite de uso/.test((($(".status") || {}).textContent || "")), "com a mensagem do provedor");
    ok(!ta.disabled && !/Aguardando/.test(ta.placeholder), "o campo voltou ao normal para tentar de novo");
    ok(raiz.querySelectorAll(".msg.user").length === 1, "a pergunta continua na tela");
    if (erros.length) for (const e of erros.slice(0, 6)) console.log("   ", e);
    console.log(`  ${n - mau}/${n} asseroes`);
    process.exit(mau ? 1 : 0);
  }
  if (SIGILOSO && SEM_APROVAR) {
    ok($(".sigok") && $(".sigok").hidden, "com a preferencia desligada a caixa NAO aparece");
  }
  if (!SIGILOSO) ok($(".sigok") && $(".sigok").hidden, "no modo normal a caixa nunca aparece");
}

// ------------------------------------------------------------- as asserções
ok(sondas.length >= 2, "a sonda da espera rodou durante o raciocinio vazio e o delta vazio", sondas.length);
ok(sondas.every((x) => x.dots), "a bolha do assistente MANTEM os tres pontos ate' o primeiro texto", sondas);
ok(!sondas.some((x) => x.vazia), "nenhuma bolha em branco durante a espera", sondas);
ok(sondas.every((x) => /Analisando|Raciocinando/.test(x.status)), "o status diz que esta' esperando o modelo", sondas.map((x) => x.status));
if (enviados.length !== 1) {
  console.log("  DIAG status :", JSON.stringify(($(".status") || {}).textContent));
  console.log("  DIAG alerta :", JSON.stringify(($(".alertbar") || {}).textContent));
  console.log("  DIAG send   : disabled=" + ($(".send") || {}).disabled);
  console.log("  DIAG marcadas:", raiz.querySelectorAll(".doclist input:checked").length);
  console.log("  DIAG rpcs   :", JSON.stringify(rpcs.map((m) => m.type)));
}
ok(enviados.length === 1, "um turno foi enviado", enviados.length);
const corpo = JSON.stringify(enviados[0] || {});

if (enviados.length && !SIGILOSO) {
  // ---------------- NAO-REGRESSAO: com o modo desligado, tudo como antes ------
  ok(!rpcs.some((m) => m.type === "sigiloArmar"), "NENHUM sigiloArmar durante o turno normal",
     rpcs.map((m) => m.type));
  ok(!rpcs.some((m) => m.type === "nerDetectar"), "NENHUMA chamada ao NER");
  ok(!rpcs.some((m) => m.type === "nerFechar"), "NENHUM fechamento de NER");
  // A peca vai com o texto ORIGINAL -- e' peca de texto neste harness, entao o
  // que se confere e' que ela NAO foi mascarada.
  ok(corpo.includes(NOME_AUTOR), "o nome vai NORMALMENTE (o modo está desligado)");
  ok(corpo.includes(CPF_AUTOR), "o CPF vai normalmente");
  ok(!/\[PESSOA_\d+\]/.test(corpo), "nenhum rótulo de anonimização no payload");
  ok(enviados[0].payload.chaveCaso === "pje.tjce.jus.br|1|99",
     "a chave do processo viaja mesmo no modo normal (é a atribuição da guarda)",
     enviados[0].payload.chaveCaso);
  ok(corpo.includes("Excelentissimo Senhor Doutor Juiz"), "o corpo da peça chegou ao modelo");
  ok(/"title":"111222 - Petição inicial de ELIONEUDO/.test(corpo) || corpo.includes("111222"),
     "o título vai inteiro");
}

if (enviados.length && SIGILOSO && !ARMA_FALHA) {
  // 1) NADA de arquivo, base64 ou imagem
  ok(!/"type":"file"/.test(corpo), "nenhum bloco de arquivo (file_id) no payload");
  ok(!/"type":"base64"/.test(corpo), "nenhum bloco base64 no payload");
  ok(!/"type":"image"/.test(corpo), "nenhuma imagem no payload");
  ok(!rpcs.some((m) => m.type === "upload"), "NENHUM upload foi tentado", rpcs.filter((m) => m.type === "upload").length);

  // 2) o nome, o CPF e o CNJ NAO aparecem em lugar nenhum do que sai
  ok(!corpo.includes(NOME_AUTOR), "o nome do autor sumiu do payload");
  ok(!corpo.toUpperCase().includes(NOME_REU), "o nome do réu sumiu do payload");
  ok(!corpo.includes(CPF_AUTOR), "o CPF sumiu do payload");
  ok(!corpo.includes("0001234-56.2020.8.06.0128"), "o número CNJ sumiu do payload");

  // 3) e o texto CHEGOU, mascarado
  ok(/\[PESSOA_\d+\]/.test(corpo), "o payload traz rótulos [PESSOA_n]");
  ok(/\[CPF_\d+\]/.test(corpo), "o CPF virou rótulo [CPF_n]");
  ok(corpo.includes("art. 186"), "a LEGISLAÇÃO foi preservada (não é dado pessoal)");
  ok(corpo.includes("12 de marco de 2024") || corpo.includes("12 de março de 2024"),
     "a DATA foi preservada (prazo é o eixo do produto)");

  // 4) o titulo da peca tambem foi mascarado
  const p = enviados[0].payload;
  const blocos = JSON.stringify(p.messages || []);
  ok(!blocos.includes(NOME_AUTOR), "o title do bloco não carrega o nome");

  // 5) a guarda foi armada com a lista CHEIA antes do envio
  ok(sigiloArmado && sigiloArmado.proibidos && sigiloArmado.proibidos.length >= 3,
     "a guarda foi armada com os valores originais",
     sigiloArmado ? sigiloArmado.proibidos.map((x) => x.tipo) : null);
  ok(sigiloArmado && (sigiloArmado.isentas || []).length >= 1,
     "as isenções do texto do próprio programa foram enviadas");
  ok(p.chaveCaso === "pje.tjce.jus.br|1|99", "o payload leva a chave do processo (atribuição)", p.chaveCaso);

  // 6) o CONTEUDO da peca chegou de fato (nao e' um payload vazio que "passa")
  ok(/Excelentissimo Senhor Doutor Juiz/.test(corpo), "o corpo da peça chegou ao modelo");
}

// ---------------------------------------------------- o SEGUNDO turno (historico)
if (HISTORICO && SIGILOSO && !ARMA_FALHA && !CANCELAR) {
  const corpo1 = JSON.stringify(enviados[0] || {});
  ok(corpo1.includes(NOME_TESTEMUNHA), "(premissa) no 1o turno a testemunha saiu EM CLARO -- o NER nao a viu");
  const cb2 = [...raiz.querySelectorAll('.doclist input[type="checkbox"]')][1];
  ok(!!cb2, "a segunda peca esta na lista");
  cb2.checked = true; cb2.dispatchEvent(new w.Event("change", { bubbles: true }));
  await esperar(80);
  ta.value = "E a testemunha?";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  $(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  if (!SEM_APROVAR) {
    const caixa2 = await esperarSigok();
    ok(!!caixa2, "2o turno: a caixa de conferencia aparece para a peca nova");
    ok(raiz.querySelectorAll(".sigok .sk-row").length === 1, "e lista so' a peca NOVA (1)");
    $(".sigok-ok").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  }
  await esperar(2500);
  ok(enviados.length === 2, "o 2o turno foi enviado", enviados.length);
  const corpo2 = JSON.stringify(enviados[1] || {});
  ok(!corpo2.includes(NOME_TESTEMUNHA), "o nome aprendido na 2a peca NAO sai em claro em lugar nenhum -- nem no bloco antigo");
  const msgs2 = (enviados[1] && enviados[1].payload && enviados[1].payload.messages) || [];
  const doc1 = msgs2[0] && Array.isArray(msgs2[0].content) && msgs2[0].content.find((b) => b.type === "document");
  const txt1 = doc1 && doc1.source && doc1.source.data || "";
  ok(/\[PESSOA_\d+\] nada viu/.test(txt1), "o bloco da 1a peca (turno anterior) foi REMASCARADO com o rotulo da testemunha", txt1.slice(-80));
  ok(!raiz.querySelector(".sigilo-bloqueio"), "nenhuma bolha de bloqueio apareceu");
  // A medicao (refinarContexto) tambem remascara -- e NAO pode gravar rotulo
  // novo: o mapa gravado tem exatamente os rotulos dos envios.
  const gravAte2 = (w.__gravado.caso || []).filter((x) => x && x.sigilo);
  const itens2 = gravAte2.length ? (gravAte2[gravAte2.length - 1].sigilo.mapa.itens || []) : [];
  ok(itens2.some((i) => i.valor === NOME_TESTEMUNHA), "o mapa gravado conhece a testemunha (aprendida na 2a peca)");
}

// ------------------------------------------------ o SEGUNDO turno (bloco opaco)
// O raciocinio do OpenRouter com o nome da re' em claro e' OMITIDO da copia de
// saida (a doc diz que omitir `reasoning_details` e' sempre seguro): o turno
// SAI, sem bolha, e o request nao leva nem o item nem o nome.
if (OPACO && SIGILOSO && !ARMA_FALHA && !CANCELAR) {
  ta.value = "E depois?";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  const antes = enviados.length;
  $(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(2500);
  ok(enviados.length === antes + 1, "2o turno: FOI enviado (o opaco contaminado e' descartado, nao bloqueia)", enviados.length);
  const corpo2 = JSON.stringify(enviados[enviados.length - 1] || {});
  ok(!corpo2.includes("x-openrouter-item") && !corpo2.includes("reasoning_details"), "o item de raciocinio contaminado NAO foi no request");
  ok(!corpo2.includes(NOME_REU), "e o nome da re' nao aparece em lugar nenhum");
  ok(corpo2.includes('"ok"'), "o texto da resposta anterior continua no historico");
  ok(!raiz.querySelector(".sigilo-bloqueio"), "nenhuma bolha de bloqueio apareceu");
  // e o que esta' GRAVADO nao mudou: `conversation` continua com o item
  const gravados = (w.__gravado.conversa || []).filter((c) => c && Array.isArray(c.conversation));
  const ult = gravados[gravados.length - 1];
  ok(!ult || JSON.stringify(ult.conversation).includes("x-openrouter-item"), "a conversa gravada mantem o item (so' a copia de saida o omite)");
}

if (erros.length) {
  console.log("  --- erros/avisos dentro do realm ---");
  for (const e of erros.slice(0, 14)) console.log("   ", e);
}
// ---------------------------------------------- ramo PDF e persistencia
if (SIGILOSO && COMO_PDF && !ARMA_FALHA && enviados.length) {
  ok(rpcs.some((m) => m.type === "ocrReconhecer"), "a folha digitalizada passou pelo OCR local",
     rpcs.map((m) => m.type));
  ok(corpo.includes("Página 1") && corpo.includes("Página 2"), "as DUAS folhas entraram no texto");
  ok(corpo.includes("Segunda folha, digitalizada"), "o texto do OCR chegou ao modelo");
  ok(!corpo.toUpperCase().includes(NOME_REU), "o nome que veio do OCR também foi mascarado");
  ok(!/data:image/.test(corpo), "nenhum data URL de página vazou para o payload");
  ok(!/JVBERi/.test(corpo), "o base64 do PDF não está no payload");
}

if (SIGILOSO && !ARMA_FALHA) {
  const g = w.__gravado || { caso: [], conversa: [] };
  const comSigilo = g.caso.filter((x) => x && x.sigilo);
  ok(comSigilo.length >= 1, "o mapa de reidentificação foi GRAVADO no casodb", g.caso.length);
  const ultimo = comSigilo[comSigilo.length - 1];
  if (ultimo) {
    ok(ultimo.sigilo.ligado === true, "o modo ligado foi gravado");
    ok(Array.isArray(ultimo.sigilo.mapa.itens) && ultimo.sigilo.mapa.itens.length >= 3,
       "o mapa gravado tem os itens", ultimo.sigilo.mapa.itens.length);
    ok(ultimo.sigilo.mapa.itens.every((i) => i.rotulo && i.tipo && i.n && i.valor),
       "cada item gravado tem rótulo, tipo, número e valor");
  }
  // o snapshot da CONVERSA leva o modo -- e `false` precisa sobreviver ao `??`
  const conv = g.conversa[g.conversa.length - 1];
  ok(conv && "conversaSigilosa" in conv, "o snapshot da conversa carrega o modo",
     conv ? Object.keys(conv).slice(0, 12) : null);
  if (conv) ok(conv.conversaSigilosa === true, "e ele vale true nesta conversa", conv.conversaSigilosa);
} else {
  const g = w.__gravado || { conversa: [] };
  const conv = g.conversa[g.conversa.length - 1];
  ok(conv && conv.conversaSigilosa === false,
     "no modo normal o snapshot grava FALSE (não undefined) — é o que o `??` preserva",
     conv ? conv.conversaSigilosa : null);
}

if (ARMA_FALHA) {
  ok(/NÃO foi ligado/.test(statusAposToggle),
     "o status explica que o modo não foi ligado", statusAposToggle.slice(0, 90));
  ok(!/\[PESSOA_/.test(JSON.stringify(enviados)),
     "o turno que saiu NÃO está anonimizado pela metade — o modo ficou desligado");
  ok(!rpcs.some((m) => m.type === "nerDetectar"),
     "e o NER nem foi acionado (o modo não ligou)");
}

// ------------------------------------------------ AUDITORIA (a prova)
if (SIGILOSO && !ARMA_FALHA && enviados.length) {
  const selo = $(".selo-sigilo");
  ok(selo && selo.tagName === "BUTTON", "o selo é um BOTÃO (ele abre a auditoria)", selo && selo.tagName);
  selo.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(60);
  const cx = raiz.querySelector(".audbox");
  ok(!!cx, "a caixa de auditoria abre");
  if (cx) {
    const txt = cx.textContent || "";
    // Os chips falam PORTUGUÊS, não o `id2label` do modelo: "2 pessoas", nunca
    // "PESSOA 2" (que aparece sem cedilha em ORGANIZACAO e lê como typo).
    ok(/\d+ pessoas?/.test(txt), "o resumo mostra os tipos em português", txt.slice(0, 90));
    ok(!/ORGANIZACAO\s*\d/.test(txt), "e nunca o rótulo técnico cru nos chips");
    // A MARCA no texto enviado é o que transforma a lista em prova: cada rótulo
    // destacado, com o valor original no title.
    const marcas = cx.querySelectorAll(".aud-rot");
    ok(marcas.length >= 1, "o texto enviado traz as marcas destacadas", marcas.length);
    ok([...marcas].some((m) => (m.title || "").includes(NOME_AUTOR)),
       "e o title da marca diz o que estava ali");
    ok(cx.querySelectorAll(".aud-peca").length >= 1, "a peça anonimizada aparece na lista");
    // o TEXTO ENVIADO tem de estar na caixa -- e' a prova
    const pre = cx.querySelector(".aud-texto");
    ok(!!pre, "a caixa carrega o texto que foi enviado");
    ok(pre && /\[PESSOA_\d+\]/.test(pre.textContent), "e ele está mascarado",
       pre ? pre.textContent.slice(0, 80) : null);
    ok(pre && !pre.textContent.includes(NOME_AUTOR), "sem o nome real no texto enviado");
    // a CHAVE aparece na tela (e so na tela)
    ok(cx.querySelectorAll(".aud-map").length >= 1, "a tabela de reidentificação aparece");
    ok(txt.includes(NOME_AUTOR), "a chave mostra o valor ORIGINAL (é para isso que ela serve)");
    ok(/n[ãa]o acompanha o relat[óo]rio/i.test(txt), "e a caixa avisa que ela não vai no relatório");

    // o RELATORIO
    baixados.length = 0;
    const bt = cx.querySelector(".aud-baixar");
    ok(!!bt && !bt.disabled, "o botão de baixar o relatório está ativo");
    bt.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await esperar(60);
    ok(baixados.length === 1, "o relatório foi gerado", baixados.length);
    if (baixados.length) {
      const rel = await baixados[0].text();
      ok(rel.includes("Relatório de conferência"), "o relatório tem cabeçalho");
      ok(/\[PESSOA_\d+\]/.test(rel), "ele traz o texto MASCARADO que foi enviado");
      ok(rel.includes("Excelentissimo Senhor Doutor Juiz"), "com o conteúdo integral, não um resumo");
      // e NADA de original: nem nome, nem CPF, nem CNJ, nem a tabela
      ok(!rel.includes(NOME_AUTOR), "o relatório NÃO contém o nome do autor");
      ok(!rel.toUpperCase().includes(NOME_REU), "nem o do réu");
      ok(!rel.includes(CPF_AUTOR), "nem o CPF");
      ok(!rel.includes("0001234-56.2020.8.06.0128"), "nem o número do processo");
      ok(!/PESSOA_1.*ELIONEUDO/s.test(rel), "e NÃO leva a tabela de reidentificação");
      ok(/n[ãa]o faz parte deste relat[óo]rio/i.test(rel), "ele diz que a tabela ficou de fora");
      ok(/conferência final é humana/.test(rel), "e declara o limite da conferência");
    }
  }
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
