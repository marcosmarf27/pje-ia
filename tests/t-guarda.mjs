// Testa a GUARDA DE SAIDA do worker sem carregar o background.js inteiro (ele e'
// um ES module que fala com indexedDB e chrome.* no topo). O bloco e EXTRAIDO do
// fonte real por varredura de marcadores -- nunca copiado, senao a copia
// divergiria do original no primeiro ajuste, que e' o defeito que o teste existe
// para pegar.
//
// A guarda e' ASSINCRONA: antes de decidir ela espera a restauracao do estado
// vindo do `storage.session`, porque o service worker MV3 morre a cada ~30 s de
// ociosidade e renasceria com o Map VAZIO -- e o atalho `if (!sigilo.size)`
// liberaria tudo justamente na janela em que a guarda mais precisa existir.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const fonte = fs.readFileSync(__RAIZ + "/src/background.js", "utf8");
const de = fonte.indexOf("const HOSTS_PROVEDOR");
const ate = fonte.indexOf("instalarGuardaDeSaida();");
if (de < 0 || ate < 0) { console.log("FALHOU: nao achei o bloco da guarda no background.js"); process.exit(1); }
const bloco = fonte.slice(de, ate + "instalarGuardaDeSaida();".length);

let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };

console.log("=== guarda de saida (worker) ===");

// `storage.session` FALSO, compartilhado entre os contextos: e' por ele que se
// simula a morte e o renascimento do worker.
const disco = {};
function novoContexto() {
  const c = { console, URL, TextEncoder, TextDecoder, Request, Headers, URLSearchParams, ArrayBuffer };
  c.globalThis = c;
  c.chrome = {
    storage: {
      session: {
        get: async (k) => (k in disco ? { [k]: disco[k] } : {}),
        set: async (o) => { Object.assign(disco, o); },
      },
    },
  };
  vm.createContext(c);
  for (const f of ["src/pseudonimos.js", "src/trava.js"])
    vm.runInContext(fs.readFileSync(__RAIZ + "/" + f, "utf8"), c, { filename: f });
  c.saidas = [];
  c.fetch = (entrada, init) => { c.saidas.push({ entrada, init }); return Promise.resolve({ ok: true }); };
  // `const` dentro de runInContext NAO vira propriedade do contexto (a mesma
  // armadilha do `const MLIB` em jsdom que o CLAUDE.md registra).
  vm.runInContext(bloco + ";globalThis.__sigilo = sigilo; globalThis.__CTX = CTX_CONFIG;", c, { filename: "guarda" });
  return c;
}

const ctxVm = novoContexto();
ok(typeof ctxVm.TRAVA === "object" && typeof ctxVm.PSEUD === "object", "TRAVA e PSEUD publicados no contexto");
const sigilo = ctxVm.__sigilo;
const CTX_CONFIG = ctxVm.__CTX;
const CAB = ctxVm.TRAVA.CAB_CTX;
ok(CAB === "x-pje-ctx", "o nome do cabecalho e o esperado", CAB);

const PROIB = [{ tipo: "PESSOA", valor: "Elioneudo Evaristo" }];
const chamar = (url, init, c) => (c || ctxVm).fetch(url, init);

async function bloqueia(fn, nome) {
  n++;
  try { await fn(); mau++; console.log("  FALHOU (devia bloquear):", nome); }
  catch (e) {
    if (!e.vazamento) { mau++; console.log("  FALHOU (erro errado):", nome, e.message); }
    else if (e.retryable !== false) { mau++; console.log("  FALHOU (marcou retryable):", nome); }
  }
}
async function passa(fn, nome) {
  n++;
  try { await fn(); } catch (e) { mau++; console.log("  FALHOU (nao devia bloquear):", nome, e.message); }
}

const corpoLimpo = JSON.stringify({ messages: [{ content: [{ type: "text", text: "o reu [PESSOA_1] confessou" }] }] });
const corpoSujo = JSON.stringify({ messages: [{ content: [{ type: "text", text: "o reu Elioneudo Evaristo confessou" }] }] });

// --- 1) SEM sigilo armado: tudo passa
ctxVm.saidas.length = 0;
await passa(() => chamar("https://api.openai.com/v1/responses", { body: corpoSujo, headers: { [CAB]: "p1" } }),
            "sem sigilo armado, ate corpo com nome passa");
ok(ctxVm.saidas.length === 1, "a requisicao chegou ao fetch real");

// --- 2) host que NAO e de provedor nunca entra na guarda
sigilo.set("p1", { proibidos: PROIB, isentas: [] });
ctxVm.saidas.length = 0;
await passa(() => chamar("https://pje.tjce.jus.br/pje1grau/algo", { body: corpoSujo }),
            "host do tribunal passa mesmo com sigilo armado");

// --- 3) provedor + sigilo armado
await bloqueia(() => chamar("https://api.openai.com/v1/responses", { body: corpoSujo, headers: { [CAB]: "p1" } }),
               "corpo com o nome CRU e bloqueado");
await passa(() => chamar("https://api.openai.com/v1/responses", { body: corpoLimpo, headers: { [CAB]: "p1" } }),
            "corpo MASCARADO passa");

// --- 4) o cabecalho de atribuicao NUNCA chega ao provedor
ctxVm.saidas.length = 0;
const h = { "content-type": "application/json", [CAB]: "p1" };
await chamar("https://api.openai.com/v1/responses", { body: corpoLimpo, headers: h });
ok(!(CAB in h), "o cabecalho foi REMOVIDO do objeto de headers", Object.keys(h));
ok(ctxVm.saidas.length === 1 && !(CAB in ctxVm.saidas[0].init.headers), "e nao chegou ao fetch real");

// --- 5) outro processo, sem sigilo: passa
await passa(() => chamar("https://api.anthropic.com/v1/messages", { body: corpoSujo, headers: { [CAB]: "p2" } }),
            "processo SEM sigilo passa, mesmo com outro armado");

// --- 6) FAIL CLOSED: provedor sem atribuicao, havendo sigilo armado
await bloqueia(() => chamar("https://api.anthropic.com/v1/messages", { body: corpoLimpo }),
               "requisicao SEM ctx e bloqueada (o cliente que esquecer falha, nao vaza)");

// --- 7) o ctx de configuracao nunca esta em sigilo
await passa(() => chamar("https://api.openai.com/v1/models", { headers: { [CAB]: CTX_CONFIG } }),
            "CTX_CONFIG passa (testar chave nao leva nada dos autos)");
ok(!sigilo.has(CTX_CONFIG), "CTX_CONFIG nunca entra no Map de sigilo");

// --- 8) ESTRUTURAL: nada binario sai sob sigilo
vm.runInContext("globalThis.FormData = class FormData {};"
  + "globalThis.__fd = new FormData(); globalThis.__ab = new ArrayBuffer(8);", ctxVm);
await bloqueia(() => chamar("https://api.anthropic.com/v1/files", { body: ctxVm.__fd, headers: { [CAB]: "p1" } }),
               "FormData e bloqueado sem nem olhar dentro");
await bloqueia(() => chamar("https://api.openai.com/v1/files", { body: ctxVm.__ab, headers: { [CAB]: "p1" } }),
               "ArrayBuffer e bloqueado");
await bloqueia(() => chamar("https://api.openai.com/v1/responses",
                            { body: JSON.stringify({ content: [{ source: { type: "file", file_id: "f1" } }] }), headers: { [CAB]: "p1" } }),
               "bloco file_id no JSON e bloqueado");
await bloqueia(() => chamar("https://api.openai.com/v1/responses",
                            { body: JSON.stringify({ content: [{ type: "image", source: { type: "base64", data: "AAA" } }] }), headers: { [CAB]: "p1" } }),
               "imagem em base64 e bloqueada");

// --- 9) corpo que nao da para inspecionar nao passa por nao dar para inspecionar
await bloqueia(() => chamar("https://api.openai.com/v1/responses", { body: "isto nao e json", headers: { [CAB]: "p1" } }),
               "corpo nao-JSON e bloqueado (falha fechada)");
await bloqueia(() => chamar("https://api.openai.com/v1/responses",
                            { body: new ctxVm.URLSearchParams({ a: "b" }), headers: { [CAB]: "p1" } }),
               "URLSearchParams e bloqueado (tipo que a verificacao nao inspeciona)");

// --- 10) a URL tambem e conferida, e DECODIFICADA
await bloqueia(() => chamar("https://api.openai.com/v1/files/Elioneudo%20Evaristo", { headers: { [CAB]: "p1" } }),
               "nome percent-encoded na URL e bloqueado");

// --- 11) `Request` como PRIMEIRO argumento: corpo e cabecalho vao DENTRO dele
{
  const req = new ctxVm.Request("https://api.openai.com/v1/responses",
    { method: "POST", body: corpoSujo, headers: { [CAB]: "p1" } });
  await bloqueia(() => chamar(req), "Request com o corpo dentro e inspecionado e bloqueado");
}
{
  const req = new ctxVm.Request("https://api.openai.com/v1/responses",
    { method: "POST", body: corpoLimpo, headers: { [CAB]: "p1" } });
  await passa(() => chamar(req), "Request com corpo mascarado passa");
  ok(!req.headers.get(CAB), "e o cabecalho de atribuicao foi removido do Request");
}

// --- 12) desarmar devolve o caminho normal
sigilo.delete("p1");
await passa(() => chamar("https://api.openai.com/v1/responses", { body: corpoSujo, headers: { [CAB]: "p1" } }),
            "depois de desarmar, volta a passar");

// --- 13) a mensagem de erro NUNCA carrega o valor
sigilo.set("p1", { proibidos: PROIB, isentas: [] });
n++;
try { await chamar("https://api.openai.com/v1/responses", { body: corpoSujo, headers: { [CAB]: "p1" } }); mau++; }
catch (e) { if (/elioneudo/i.test(e.message)) { mau++; console.log("  FALHOU: a mensagem VAZOU o valor"); } }

// --- 14) isentas: o texto constante do proprio programa nao dispara
sigilo.set("p3", { proibidos: [{ tipo: "ORGANIZACAO", valor: "Brasil" }], isentas: ["Voce e um assistente juridico do Brasil."] });
await passa(() => chamar("https://api.openai.com/v1/responses",
                         { body: JSON.stringify({ system: "Voce e um assistente juridico do Brasil." }), headers: { [CAB]: "p3" } }),
            "isentas cobre o system do proprio programa");
await bloqueia(() => chamar("https://api.openai.com/v1/responses",
                            { body: JSON.stringify({ system: "Voce e um assistente juridico do Brasil.", u: "moro no Brasil" }), headers: { [CAB]: "p3" } }),
               "mas nao cobre o texto do usuario");

// --- 15) O WORKER MORRE E RENASCE: a guarda tem de voltar armada.
// E' o caso que o `if (!sigilo.size)` liberava em silencio -- e o worker MV3
// morre a cada ~30 s de ociosidade, entao ele nao e' raro: e' o normal.
{
  vm.runInContext("persistirSigilo();", ctxVm);
  await new Promise((r) => setTimeout(r, 10));
  ok(disco.sigiloArmado && Object.keys(disco.sigiloArmado).length >= 2,
     "o estado armado foi PERSISTIDO no storage.session", Object.keys(disco.sigiloArmado || {}));

  const renascido = novoContexto();   // worker novo: Map em memoria VAZIO
  ok(renascido.__sigilo.size === 0, "o worker renasce com o Map vazio (o fato que causava o buraco)");
  n++;
  try {
    await renascido.fetch("https://api.openai.com/v1/responses", { body: corpoSujo, headers: { [CAB]: "p1" } });
    mau++; console.log("  FALHOU: o worker renascido DEIXOU PASSAR o corpo com o nome cru");
  } catch (e) {
    if (!e.vazamento) { mau++; console.log("  FALHOU (erro errado no worker renascido):", e.message); }
  }
  ok(renascido.__sigilo.size >= 2, "e ele restaurou o estado do storage.session", renascido.__sigilo.size);
  await passa(() => chamar("https://api.openai.com/v1/responses", { body: corpoLimpo, headers: { [CAB]: "p1" } }, renascido),
              "o worker renascido segue deixando passar o que esta mascarado");
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
