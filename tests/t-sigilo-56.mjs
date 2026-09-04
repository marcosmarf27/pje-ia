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
const COMO_PDF = false;
// "armafalha" faz o worker recusar o `sigiloArmar`: guarda que nao armou =
// modo que nao pode ficar ligado.
const ARMA_FALHA = false;
const BLOQUEAR = process.argv[3] === "bloqueio";
console.log("=== v0.56: gazetteer do mapa, deny por prefixo e liberação " + (BLOQUEAR ? "(com bloqueio)" : "") + " ===");

// ---------------------------------------------------------------- os dados
const NOME_AUTOR = "ELIONEUDO EVARISTO DOS SANTOS";
const NOME_REU = "MARIA APARECIDA DE SOUZA";
const CPF_AUTOR = "529.982.247-25";
const ORG_PRIVADA = "Cooperativa Agricola Mucambo Ltda";
const ORG_PUBLICA = "Tribunal de Justica do Estado do Ceara";
const TEXTO_PECA =
  "Excelentissimo Senhor Doutor Juiz. " + NOME_AUTOR + ", inscrito no CPF " + CPF_AUTOR +
  ", vem propor acao em face de " + NOME_REU + " e de " + ORG_PRIVADA + ", pelos fatos a seguir. " +
  "Distribuida perante o " + ORG_PUBLICA + ". " +
  "O contrato foi firmado em 12 de marco de 2024, com fundamento no art. 186 do Codigo Civil.";
// A SEGUNDA peça repete a organização e o réu, mas o "NER" dela NÃO os vê
// (marcador NERCEGO): é o caso real do modelo que acha na contestação e deixa
// passar na réplica. Sem o gazetteer do mapa, a pós-condição da peça a
// reprovava e ela saía do turno como "não pôde ser baixada".
const TEXTO_PECA2 =
  "NERCEGO Replica. A re " + NOME_REU + " e a " + ORG_PRIVADA + " nao impugnaram os fatos.";
// A TERCEIRA peça é o caso que ainda reprovava depois do gazetteer do mapa: o
// valor NASCE nesta peça (o NER marca "Banco Bradesco" uma vez) e reaparece no
// mesmo texto em forma que o NER não marcou ("BANCO BRADESCO S.A."). Só a
// segunda passada (mascarar até convergir) cobre a repetição.
const TEXTO_PECA3 =
  "NEROBANCO Contrato. O credor Banco Bradesco cobra a divida; a instituicao BANCO BRADESCO S.A. e' a beneficiaria.";

// Spans que o "NER" devolveria para esse texto (o modelo de verdade nao roda em
// node -- o que se testa aqui e' a CADEIA, e a fidelidade do modelo ja tem o
// t-ponta-a-ponta com logits reais).
function spansDoNer(texto) {
  const out = [];
  if (texto.includes("NERCEGO")) return out;
  if (texto.includes("NEROBANCO")) {
    const i = texto.indexOf("Banco Bradesco");
    return [{ tipo: "ORGANIZACAO", ini: i, fim: i + "Banco Bradesco".length, score: 0.9 }];
  }
  for (const org of [ORG_PRIVADA, ORG_PUBLICA]) {
    let i = texto.indexOf(org);
    while (i !== -1) { out.push({ tipo: "ORGANIZACAO", ini: i, fim: i + org.length, score: 0.9 }); i = texto.indexOf(org, i + 1); }
  }
  for (const nome of [NOME_AUTOR, NOME_REU]) {
    let i = texto.indexOf(nome);
    while (i !== -1) { out.push({ tipo: "PESSOA", ini: i, fim: i + nome.length, score: 0.95 }); i = texto.indexOf(nome, i + 1); }
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
const store = { apiKey: "sk-teste", model: "claude-sonnet-5", memoriaCaso: false };
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
          if (m && m.type === "chat" && BLOQUEAR && enviados.length === 1) {
            w.setTimeout(() => port._msg.forEach((f) => f({
              type: "error", error: 'um valor do tipo "ORGANIZACAO" ([ORGANIZACAO_1]) apareceria no que seria enviado (posição 5637); nada foi enviado',
              vazamento: true, rotulo: "[ORGANIZACAO_1]", tipo: "ORGANIZACAO" })), 5);
          } else if (m && m.type === "chat") {
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "delta", text: "A autora [PESSOA_1] cobra da [ORGANIZACAO_1]." })), 0);
            w.setTimeout(() => port._msg.forEach((f) => f({ type: "done", content: [{ type: "text", text: "A autora [PESSOA_1] cobra da [ORGANIZACAO_1]." }], stopReason: "end_turn" })), 5);
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
const PECA2 = { id: "111223", titulo: "111223 - Réplica" };
const PECA3 = { id: "111224", titulo: "111224 - Contrato" };
w.eval(`
  window.__PJE = {
    dialeto: "legacy", suportado: true,
    listarDocumentos: () => ([${JSON.stringify(PECA)}, ${JSON.stringify(PECA2)}, ${JSON.stringify(PECA3)}]),
    lerEventos: () => [],
    listarMovimentacoes: async () => null,
    getIdProcesso: () => "99",
    getNumeroProcesso: () => "0001234-56.2020.8.06.0128",
    chaveDoCaso: () => "pje.tjce.jus.br|1|99",
    lerCabecalhoProcesso: () => ({
      campos: { Classe: "Procedimento Comum", Assunto: "Cobranca contra " + ${JSON.stringify(ORG_PRIVADA)}, "Órgão julgador": "Vara Unica de Ocara" },
      poloAtivo: [{ nome: ${JSON.stringify(NOME_AUTOR)}, documento: ${JSON.stringify(CPF_AUTOR)}, tipoDocumento: "CPF", representantes: [] }],
      poloPassivo: [{ nome: ${JSON.stringify(NOME_REU)}, tipoDocumento: "CPF", representantes: [] }],
    }),
    baixar: async (id) => ({ kind: "text", fmt: "texto",
      text: String(id) === "111223" ? ${JSON.stringify(TEXTO_PECA2)} : String(id) === "111224" ? ${JSON.stringify(TEXTO_PECA3)} : ${JSON.stringify(TEXTO_PECA)} }),
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
$(".tgl-sigilo").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await esperar(200);
ok($(".tgl-sigilo").getAttribute("aria-pressed") === "true", "o modo ligou");

// marca as DUAS peças
await esperar(80);
const cbs = [...raiz.querySelectorAll('.doclist input[type="checkbox"]')];
ok(cbs.length === 3, "as três peças estão na lista", cbs.length);
for (const c of cbs) { c.checked = true; c.dispatchEvent(new w.Event("change", { bubbles: true })); }
await esperar(80);

const ta = $(".inrow textarea") || raiz.querySelector("textarea");
const PERGUNTA = "A " + ORG_PRIVADA + " pagou?";
ta.value = PERGUNTA;
ta.dispatchEvent(new w.Event("input", { bubbles: true }));
$(".send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
// A conferencia humana fica entre a mascara e a rede: aprova-se aqui.
{
  let caixa = null;
  for (let t = 0; t < 4000 && !caixa; t += 50) {
    const b = $(".sigok");
    if (b && !b.hidden) caixa = b; else await esperar(50);
  }
  ok(!!caixa, "a caixa de conferencia apareceu");
  ok(enviados.length === 0, "nada foi pela porta antes da aprovacao", enviados.length);
  const rows = raiz.querySelectorAll(".sigok .sk-row");
  ok(rows.length === 3, "as TRES pecas do turno estao na caixa", rows.length);
  const textos = [...raiz.querySelectorAll(".sigok .sk-txt")].map((e) => e.textContent).join("\n");
  ok(!textos.includes(ORG_PRIVADA) && /\[ORGANIZACAO_\d+\]/.test(textos), "os textos da caixa ja saem mascarados");
  ok(textos.includes(ORG_PUBLICA), "e o orgao publico (deny por prefixo) aparece em claro na caixa");
  $(".sigok-ok").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(2500);
}

ok(enviados.length === 1, "um turno foi enviado", enviados.length);
const corpo = JSON.stringify(enviados[0] || {});
const p = enviados[0] && enviados[0].payload;

// ---- (a) a organização que o NER achou na PEÇA some também do SYSTEM (ficha)
ok(!corpo.includes(ORG_PRIVADA), "a organização privada NÃO aparece em lugar nenhum do payload");
ok(/\[ORGANIZACAO_\d+\]/.test(JSON.stringify(p && p.system || "")),
   "o system (ficha do processo) traz o RÓTULO da organização, não o nome",
   String(p && p.system || "").slice(0, 200));
ok(/\[ORGANIZACAO_\d+\]/.test(JSON.stringify(p && p.messages || [])), "e o texto da peça também");
const ultimaMsg = p && p.messages && p.messages[p.messages.length - 1];
ok(!JSON.stringify(ultimaMsg || {}).includes(ORG_PRIVADA), "a pergunta digitada saiu mascarada");

// ---- (b) órgão público casa a deny por PREFIXO e sai em claro
ok(corpo.includes(ORG_PUBLICA), "o Tribunal (prefixo 'tribunal de justiça' na deny) sai EM CLARO");
ok(corpo.includes("Vara Unica de Ocara"), "o órgão julgador (prefixo 'vara') sai em claro na ficha");

// ---- (c) a peça cujo NER não viu nada NÃO foi descartada: o mapa a cobriu
const falhas = raiz.querySelectorAll(".falhas");
ok(falhas.length === 0, "nenhum relatório de peça de fora (a réplica passou pelo gazetteer do mapa)",
   [...falhas].map((f) => f.textContent.slice(0, 160)));
ok(corpo.includes("Replica") && !corpo.toUpperCase().includes(NOME_REU),
   "a réplica entrou e o nome do réu nela foi mascarado pelo mapa");

// ---- (c2) o valor que NASCE na peça e se repete nela em outra forma: converge
ok(corpo.includes("Contrato") && !/banco bradesco/i.test(corpo),
   "a 3ª peça entrou e NENHUMA das formas de 'Banco Bradesco' saiu em claro (mascarar até convergir)");

// ---- (e) o contador do card nunca passa do total (done → anon → done)
const prepN = raiz.querySelector(".prep-n");
if (prepN) {
  const [a, b] = prepN.textContent.split("/").map(Number);
  ok(a <= b, "o contador do card não passa do total", prepN.textContent);
}

// ---- (d) bloqueio da guarda → decisão local → liberar → reenvio
if (BLOQUEAR) {
  const bolha = raiz.querySelector(".sigilo-bloqueio");
  ok(!!bolha, "a bolha de bloqueio apareceu na conversa");
  if (bolha) {
    ok(bolha.textContent.includes(ORG_PRIVADA), "ela mostra o VALOR resolvido localmente", bolha.textContent.slice(0, 200));
    ok(!!bolha.querySelector(".sb-liberar"), "com o botão de liberar");
    ok(!!bolha.querySelector(".sb-aud"), "e o de ver a auditoria");
  }
  ok(ta.value === PERGUNTA, "o texto digitado VOLTOU ao campo", ta.value);
  // AS SAIDAS QUE PRESERVAM O NOME: quem nao quer liberar precisa ter opcao.
  ok(/dado pessoal\?/.test(bolha.textContent), "a bolha faz a PERGUNTA: este valor e' um dado pessoal?", bolha.textContent.slice(0, 300));
  ok(!!bolha.querySelector(".sb-proteger .sb-mascarar"), "cartao 'e' dado pessoal' com Manter protegido e reenviar");
  ok(!!bolha.querySelector(".sb-soltar .sb-liberar"), "cartao 'nao e' dado pessoal' com Liberar e reenviar");
  ok(!!bolha.querySelector(".sb-soltar .sb-global input"), "com a opcao 'tambem nos outros processos'");
  ok(!bolha.querySelector(".sb-nova"), "SEM 'Nova conversa' quando ha' saida que preserva o nome");
  ok(!!bolha.querySelector(".sb-sec .sb-aud"), "e o 'Ver o que foi mascarado' na linha secundaria");
  const ordem = [...bolha.querySelectorAll(".sb-acts .sb-card")].map((b) => b.className);
  ok(/sb-proteger/.test(ordem[0]) && /sb-soltar/.test(ordem[1]), "manter protegido vem ANTES de liberar", ordem);
  ok(raiz.querySelectorAll(".msg.user").length === 0, "a bolha do usuário do turno bloqueado saiu do transcript",
     raiz.querySelectorAll(".msg.user").length);
  ok(!/^Erro:/.test((($(".status") || {}).textContent || "")), "o status não trata como erro de rede");

  const antesLib = enviados.length;
  bolha.querySelector(".sb-liberar").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await esperar(2500);
  ok(enviados.length === antesLib + 1, "a mensagem foi REENVIADA sozinha depois de liberar", enviados.length);
  const corpo2 = JSON.stringify(enviados[enviados.length - 1] || {});
  ok(corpo2.includes(ORG_PRIVADA), "e agora a organização sai EM CLARO no payload");
  ok(!corpo2.includes(NOME_AUTOR) && !corpo2.includes(CPF_AUTOR), "sem mexer no resto da máscara");
  ok(!/\[ORGANIZACAO_1\]/.test(corpo2), "o rótulo liberado sumiu do texto das peças");
  ok(sigiloArmado && !sigiloArmado.proibidos.some((x) => x.valor === ORG_PRIVADA),
     "a guarda foi re-armada SEM o valor liberado");
  const g = w.__gravado.caso.filter((x) => x && x.sigilo && x.sigilo.liberados);
  ok(g.length >= 1 && g[g.length - 1].sigilo.liberados.some((v) => /cooperativa agricola/.test(v)),
     "a liberação foi gravada no casodb junto do mapa", g.length && g[g.length - 1].sigilo.liberados);
  ok(((g.slice(-1)[0] || {sigilo:{mapa:{}}}).sigilo.mapa.itens || []).some((i) => i.valor === ORG_PRIVADA && i.liberado === true),
     "e o item ficou no mapa gravado, MARCADO como liberado");
  ok(raiz.querySelectorAll(".msg.user").length === 1, "a conversa tem UMA pergunta do usuário (não duas)");
}

// ---- (r) a RESPOSTA aparece REIDENTIFICADA na tela, e o transcript guarda o rótulo
{
  const bolhas = raiz.querySelectorAll(".msg.assistant");
  const ultima = bolhas[bolhas.length - 1];
  ok(!!ultima, "há bolha do assistente");
  const marcas = ultima ? [...ultima.querySelectorAll("mark.reid")] : [];
  ok(marcas.some((m) => m.textContent === NOME_AUTOR), "o nome do autor aparece restaurado na bolha", marcas.map((m) => m.textContent));
  ok(!/\[PESSOA_1\]/.test(ultima ? ultima.textContent : ""), "o rótulo cru não aparece na tela");
  ok(ultima && ultima.__entry && /\[PESSOA_1\]/.test(ultima.__entry.text), "mas o transcript guarda o rótulo (foi o que saiu)");
  const bu = raiz.querySelector(".msg.user");
  // No cenário normal o nome vem por MARCA (foi mascarado e restaurado na tela);
  // no de bloqueio ele foi LIBERADO e sai em claro, sem marca. Nos dois, o
  // usuário lê o nome.
  ok(bu && (bu.textContent || "").includes(ORG_PRIVADA), "a pergunta do usuário mostra o nome (restaurado ou liberado)");
  if (!BLOQUEAR) ok(bu && [...bu.querySelectorAll("mark.reid")].some((m) => m.textContent === ORG_PRIVADA), "e no modo normal ele vem como marca de reidentificação");
}

if (erros.length) {
  console.log("  --- erros/avisos dentro do realm ---");
  for (const e of erros.slice(0, 14)) console.log("   ", e);
}
console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
