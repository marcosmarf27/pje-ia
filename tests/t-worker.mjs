// Teste de integração do WORKER (background.js) com `chrome` e `fetch` fakes.
// Importa o arquivo REAL a partir de um espelho com package.json type:module.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = __RAIZ + "/src";
const ESPELHO = path.join(AQUI, "espelho");

// espelho: copia src/*.js e declara type:module (background.js é ES module)
fs.rmSync(ESPELHO, { recursive: true, force: true });
fs.mkdirSync(ESPELHO, { recursive: true });
fs.writeFileSync(path.join(ESPELHO, "package.json"), '{"type":"module"}');
for (const f of fs.readdirSync(SRC)) {
  if (f.endsWith(".js")) fs.copyFileSync(path.join(SRC, f), path.join(ESPELHO, f));
}

let ok = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { fail++; console.log("FALHOU: " + msg + "\n  esperado: " + B + "\n  obtido:   " + A); }
};
const t = (c, msg) => { if (c) ok++; else { fail++; console.log("FALHOU: " + msg); } };

// ---------------------------------------------------------------- stub do chrome
const store = { local: {}, session: {} };
function area(nome) {
  return {
    get(chaves, cb) {
      const o = {};
      if (chaves == null) Object.assign(o, store[nome]);
      else if (typeof chaves === "string") o[chaves] = store[nome][chaves];
      else if (Array.isArray(chaves)) for (const k of chaves) o[k] = store[nome][k];
      else for (const k of Object.keys(chaves)) o[k] = k in store[nome] ? store[nome][k] : chaves[k];
      cb && cb(o);
      return Promise.resolve(o);
    },
    set(obj, cb) { Object.assign(store[nome], obj); cb && cb(); return Promise.resolve(); },
    remove(ks, cb) { for (const k of [].concat(ks)) delete store[nome][k]; cb && cb(); return Promise.resolve(); },
  };
}
const listeners = {};
globalThis.chrome = {
  runtime: {
    id: "teste",
    lastError: null,
    getManifest: () => ({ version: "0.54.0" }),
    getPlatformInfo: (cb) => cb && cb({}),
    onMessage: { addListener: (f) => (listeners.msg = f) },
    onConnect: { addListener: (f) => (listeners.conn = f) },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    sendMessage: async () => ({}),
  },
  storage: { local: area("local"), session: area("session") },
  action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
  offscreen: null,
};
// Node 22 já expõe globalThis.crypto (webcrypto) — nada a fazer aqui.

// -------------------------------------------------------------- fetch controlado
let rotas = {};
let chamadas = [];
globalThis.fetch = async (url, init) => {
  chamadas.push({ url: String(url), init });
  for (const k of Object.keys(rotas)) if (String(url).includes(k)) return rotas[k](url, init);
  throw new Error("rota nao stubada: " + url);
};
const jsonOk = (obj) => async () => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
const httpErro = (status, corpo) => async () => ({ ok: false, status, text: async () => corpo, json: async () => JSON.parse(corpo) });
function sseOk(linhas) {
  return async () => ({
    ok: true, status: 200,
    body: new ReadableStream({
      start(c) { const e = new TextEncoder(); for (const l of linhas) c.enqueue(e.encode(l + "\n")); c.close(); },
    }),
  });
}
const rpc = (msg) => new Promise((res) => { const r = listeners.msg(msg, {}, res); if (r !== true) res(undefined); });

// catálogo do OpenRouter (endpoint público de metadados de UM modelo)
const CATALOGO = {
  data: {
    id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5",
    context_length: 1000000,
    architecture: { input_modalities: ["text", "image", "file"] },
    supported_parameters: ["reasoning", "tools"],
    pricing: { prompt: "0.000003", completion: "0.000015" },
  },
};

await import("file:///" + path.join(ESPELHO, "background.js").replace(/\\/g, "/"));
t(typeof listeners.msg === "function", "worker registrou o onMessage");
t(typeof listeners.conn === "function", "worker registrou o onConnect");

// ============================================================ 1. caps do catálogo
store.local.model = "or:anthropic/claude-sonnet-4.5";
store.local.openrouterApiKey = "sk-or-teste";
rotas = { "/api/v1/model/": jsonOk(CATALOGO) };
let r = await rpc({ type: "caps" });
eq(r.caps.provider, "openrouter", "caps.provider vem do catalogo");
eq(r.caps.contextTokens, 1000000, "janela do catalogo (nao o default de 128k)");
eq(r.caps.nome, "Anthropic: Claude Sonnet 4.5", "nome para o selo do painel");
eq(r.caps.filesApi, false, "filesApi false (nao ha upload por referencia)");
eq(r.caps.contagemTokens, false, "contagemTokens false (nao ha count_tokens)");
eq(r.caps.citacoesNativas, false, "citacoes textuais");
eq(r.model, "or:anthropic/claude-sonnet-4.5", "o id salvo mantem o prefixo or:");
t(!!r.chaveHash, "chaveHash calculado com a chave do OpenRouter");
eq(r.minuta.trocado, false, "sem sugestao de troca de modelo (perfil ambos)");

// o catálogo é consultado UMA vez e vai para o cache de sessão
const antes = chamadas.filter((c) => c.url.includes("/api/v1/model/")).length;
await rpc({ type: "caps" });
eq(chamadas.filter((c) => c.url.includes("/api/v1/model/")).length, antes, "catalogo cacheado (nao reconsulta)");
t(!!store.session["orcaps:anthropic/claude-sonnet-4.5"], "caps gravadas no storage.session");

// catálogo fora do ar → default conservador, sem derrubar nada
store.local.model = "or:outro/modelo-x";
rotas = { "/api/v1/model/": httpErro(500, "boom") };
r = await rpc({ type: "caps" });
eq(r.caps.contextTokens, 128000, "catalogo fora do ar cai no default conservador");
eq(r.caps.aceitaPdf, false, "default conservador: PDF pelo conversor gratuito");
t(!store.session["orcaps:outro/modelo-x"], "falha do catalogo NAO e cacheada");

// ==================================================== 2. countTokens sem contagem
store.local.model = "or:anthropic/claude-sonnet-4.5";
rotas = { "/api/v1/model/": jsonOk(CATALOGO) };
r = await rpc({ type: "countTokens", payload: { system: "s", messages: [] } });
eq(r.tokens, null, "countTokens devolve tokens null");
eq(r.semContagem, true, "flag semContagem para o content decidir");
eq(r.contextTokens, 1000000, "a JANELA vai junto (a guarda local precisa dela)");
t(!chamadas.some((c) => c.url.includes("input_tokens") || c.url.includes("count_tokens")), "nenhuma chamada de contagem foi tentada");

// ======================================================= 3. testarChave usa /key
chamadas = [];
rotas = { "/api/v1/key": jsonOk({ data: { label: "x" } }) };
r = await rpc({ type: "testarChave", provider: "openrouter", key: "sk-or-1" });
eq(r, { ok: true }, "chave valida");
t(chamadas[0].url === "https://openrouter.ai/api/v1/key", "usa /key, NUNCA /models (que e publico)");
t(chamadas[0].init.headers.Authorization === "Bearer sk-or-1", "manda a chave no Bearer");
rotas = { "/api/v1/key": httpErro(401, '{"error":{"code":401,"message":"no"}}') };
r = await rpc({ type: "testarChave", provider: "openrouter", key: "errada" });
eq(r.ok, false, "chave invalida e RECUSADA (o falso positivo que o /models daria)");

// =========================================================== 4. upload recusado
r = await rpc({ type: "upload", payload: { filename: "a.pdf", b64: "QQ==", mime: "application/pdf" } });
t(!!r.error && /n[aã]o recebe arquivos por refer/.test(r.error), "upload recusado com motivo: " + r.error);
t(!chamadas.some((c) => c.url.includes("api.anthropic.com")), "a chave do OpenRouter NUNCA vai para a Anthropic");

// ====================================================== 5. turno completo pela porta
chamadas = [];
rotas = {
  "/api/v1/model/": jsonOk(CATALOGO),
  "/chat/completions": sseOk([
    ": OPENROUTER PROCESSING",
    'data: {"model":"anthropic/claude-sonnet-4.5","choices":[{"delta":{"content":"Resposta"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":900,"completion_tokens":100,"cost":0.042,"prompt_tokens_details":{"cached_tokens":0}}}',
    "data: [DONE]",
  ]),
};
const enviados = [];
const port = { name: "claude", postMessage: (m) => enviados.push(m), onMessage: { addListener: (f) => (port._f = f) } };
listeners.conn(port);
await new Promise((res) => {
  const orig = port.postMessage;
  port.postMessage = (m) => { orig(m); if (m.type === "done" || m.type === "error") res(); };
  port._f({ type: "chat", payload: { system: "SYS", messages: [{ role: "user", content: [{ type: "text", text: "oi" }] }] } });
});
const done = enviados.find((m) => m.type === "done");
t(!!done, "turno terminou com done: " + JSON.stringify(enviados.filter((m) => m.type === "error")));
eq(done.custoUsd, 0.042, "custo MEDIDO (usage.cost) chega ao content, nao o calculado por tabela");
eq(done.content, [{ type: "text", text: "Resposta" }], "conteudo do turno");
eq(enviados.filter((m) => m.type === "delta").map((m) => m.text), ["Resposta"], "deltas na porta");
const corpo = JSON.parse(chamadas.find((c) => c.url.includes("/chat/completions")).init.body);
eq(corpo.model, "anthropic/claude-sonnet-4.5", "prefixo or: removido no request");
eq(corpo.provider, { data_collection: "deny" }, "politica de privacidade no request do turno");
eq(corpo.plugins.find((p) => p.id === "file-parser").pdf.engine, "native", "engine native (o catalogo diz que aceita arquivo)");
eq(corpo.reasoning, { effort: "high" }, "effort padrao alto vira reasoning.effort");
t(!("max_tokens" in corpo), "sem max_tokens");
const auth = chamadas.find((c) => c.url.includes("/chat/completions")).init.headers.authorization;
eq(auth, "Bearer sk-or-teste", "chave do OpenRouter no turno");

// =============================== 6. NÃO-REGRESSÃO: os três provedores diretos
store.local.model = "gpt-5.6-luna";
store.local.openaiApiKey = "sk-openai";
rotas = { "/v1/responses/input_tokens": jsonOk({ input_tokens: 1234 }) };
r = await rpc({ type: "caps" });
eq(r.caps.provider, "openai", "GPT continua caindo no provedor openai");
eq(r.caps.contextTokens, 1050000, "caps do GPT vem da tabela, intocada");
eq(r.minuta.model, "gpt-5.6-terra", "sugestao de redacao do GPT preservada");
r = await rpc({ type: "countTokens", payload: { system: "s", messages: [] } });
eq(r.tokens, 1234, "countTokens da OpenAI continua funcionando");
store.local.model = "claude-haiku-4-5";
store.local.apiKey = "sk-ant";
rotas = { "api.anthropic.com/v1/models": jsonOk({ data: [] }) };
r = await rpc({ type: "caps" });
eq(r.caps.provider, "anthropic", "Claude intocado");
eq(r.caps.maxPages, 100, "caps do Haiku da tabela");
r = await rpc({ type: "testarChave", provider: "anthropic", key: "sk-ant" });
eq(r, { ok: true }, "testarChave da Anthropic continua pela listagem de modelos");
store.local.model = "gemini-3.7-flash";
r = await rpc({ type: "caps" });
eq(r.caps.provider, "gemini", "Gemini intocado");
eq(r.caps.tokensPagina, 258, "tokensPagina do Gemini preservado");

// ============================================ 7. modeloMinuta fixado no OpenRouter
store.local.model = "or:anthropic/claude-sonnet-4.5";
store.local.modeloMinuta = "or:openai/gpt-5.2";
rotas = { "/api/v1/model/": jsonOk(CATALOGO) };
r = await rpc({ type: "caps" });
eq(r.minuta.model, "or:openai/gpt-5.2", "modelo de minuta fixado no OpenRouter e honrado");
eq(r.minuta.fixado, true, "marcado como escolha do usuario");
store.local.modeloMinuta = "gpt-5.6-terra"; // outro provedor: recusado
r = await rpc({ type: "caps" });
eq(r.minuta.model, "or:anthropic/claude-sonnet-4.5", "modelo de OUTRO provedor e recusado (peças/uploads não cruzam)");
store.local.modeloMinuta = "";

console.log("\n" + ok + " OK, " + fail + " falhas");
process.exit(fail ? 1 : 0);
