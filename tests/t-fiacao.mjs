// Invariantes de FIACAO da anonimizacao: as coisas que nenhum teste de unidade
// pega porque nao estao dentro de funcao nenhuma -- constante duplicada que
// divergiu, arquivo que ficou de fora do manifest, cliente que esqueceu de
// mandar a atribuicao. Todas sao erros silenciosos: a extensao carrega e o
// recurso simplesmente nao funciona, ou pior, funciona errado.
import fs from "node:fs";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const R = __RAIZ + "/";
const ler = (p) => fs.readFileSync(R + p, "utf8");
let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };

console.log("=== fiacao da anonimizacao ===");

// --- 1) CAB_CTX: cinco copias, um valor
{
  const arquivos = ["src/trava.js", "src/claude.js", "src/gemini.js", "src/openai.js", "src/openrouter.js"];
  const valores = arquivos.map((f) => {
    const m = ler(f).match(/CAB_CTX\s*=\s*"([^"]+)"/);
    return { f, v: m && m[1] };
  });
  ok(valores.every((x) => x.v), "as cinco copias declaram CAB_CTX", valores);
  ok(new Set(valores.map((x) => x.v)).size === 1,
     "e as cinco valem o MESMO (divergir faz a guarda bloquear todo turno)", valores);
}

// --- 2) os quatro clientes MANDAM a atribuicao no chat
{
  const esperado = {
    "src/claude.js": "headers(req.apiKey, req.betas, req.ctx)",
    "src/gemini.js": "headersGemini(req.apiKey, req.ctx)",
    "src/openai.js": "headersOpenAI(req.apiKey, req.ctx)",
    "src/openrouter.js": "headersOpenRouter(req.apiKey, req.ctx)",
  };
  for (const [f, trecho] of Object.entries(esperado))
    ok(ler(f).includes(trecho), f + " manda req.ctx no chat", trecho);
}

// --- 3) o worker propaga o ctx no turno e no pre-voo
{
  const bg = ler("src/background.js");
  ok(/ctx:\s*payload\.chaveCaso/.test(bg), "executarTurno poe o ctx no baseReq");
  ok((bg.match(/ctx:\s*msg\.payload\.chaveCaso/g) || []).length === 3,
     "os TRES caminhos de countTokens propagam o ctx (o pre-voo manda o mesmo corpo do turno)",
     (bg.match(/ctx:\s*msg\.payload\.chaveCaso/g) || []).length);
  ok(bg.includes("instalarGuardaDeSaida();"), "a guarda e instalada no carregamento do modulo");
  ok(/import "\.\/pseudonimos\.js";/.test(bg) && /import "\.\/trava\.js";/.test(bg),
     "o worker importa pseudonimos e trava (a normalizacao tem de ser a MESMA)");
}

// --- 4) manifest: os content scripts novos, ANTES do content.js
{
  const m = JSON.parse(ler("manifest.json"));
  const js = m.content_scripts[0].js;
  for (const f of ["src/pseudonimos.js", "src/anonimizar.js"])
    ok(js.includes(f), "manifest declara " + f, js);
  ok(js.indexOf("src/pseudonimos.js") < js.indexOf("src/content.js"), "pseudonimos vem antes do content.js");
  ok(js.indexOf("src/anonimizar.js") < js.indexOf("src/content.js"), "anonimizar vem antes do content.js");
  // Os do NER NAO sao content script: rodam no Web Worker do offscreen, e por
  // isso nao podem pesar em toda pagina jus.br.
  for (const f of ["src/tokenizador.js", "src/ner-nucleo.js", "src/ner-worker.js"])
    ok(!js.includes(f), f + " NAO e content script (roda no worker do offscreen)");
  ok(m.permissions.includes("offscreen"), "permissao offscreen declarada");
  ok(m.cross_origin_embedder_policy && m.cross_origin_opener_policy,
     "COEP/COOP declarados (sem eles o ORT cai para UMA thread)");
  for (const f of js) ok(fs.existsSync(R + f), "existe: " + f);
}

// --- 5) a ponte offscreen existe dos dois lados
{
  const off = ler("src/ocr-offscreen.js"), bg = ler("src/background.js");
  ok(off.includes('msg.tipo === "nerDetectar"'), "offscreen atende nerDetectar");
  ok(off.includes('msg.tipo === "nerFechar"'), "offscreen atende nerFechar");
  ok(off.includes('new Worker(chrome.runtime.getURL("src/ner-worker.js"), { type: "module" })'),
     "offscreen cria o Web Worker do NER como MODULO");
  ok(off.includes("nerWorker.terminate()"), "e o TERMINA (a memoria do WASM nao encolhe sozinha)");
  ok(bg.includes('msg.type === "nerDetectar"'), "worker roteia nerDetectar");
  ok(bg.includes('msg.type === "sigiloArmar"') && bg.includes('msg.type === "sigiloDesarmar"'),
     "worker atende armar/desarmar sigilo");
}

// --- 6) os arquivos do modelo que sao CONTRATO estao versionados; o .onnx nao
{
  for (const f of ["vendor/ner-modelo/config.json", "vendor/ner-modelo/vocab.txt",
                   "vendor/ner-modelo/tokenizer_config.json", "vendor/ner-modelo/PROCEDENCIA.md",
                   "src/config/deny-list.json", "src/config/context-words.json"])
    ok(fs.existsSync(R + f), "existe: " + f);
  const gi = ler(".gitignore");
  ok(gi.includes("vendor/ner-modelo/model.onnx"), ".gitignore exclui o model.onnx (passa dos 100 MB do GitHub)");
  ok(ler("empacotar.ps1").includes("Get-FileHash"), "empacotar.ps1 confere o hash do modelo");
}

// --- 7) o ner-worker importa o ORT como MODULO, nao o bundle IIFE do OCR
{
  const w = ler("src/ner-worker.js");
  ok(w.includes('from "../vendor/ort/ort.bundle.min.mjs"'),
     "ner-worker importa o ORT como modulo (`window` nao existe num Web Worker)");
  ok(fs.existsSync(R + "vendor/ort/ort.bundle.min.mjs"), "o bundle do ORT esta no pacote");
  // O .wasm e compartilhado com o OCR: o bundle referencia a MESMA compilacao.
  const refs = [...new Set((ler("vendor/ort/ort.bundle.min.mjs").match(/ort-wasm[a-z0-9.-]*/g) || []))];
  ok(refs.includes("ort-wasm-simd-threaded.jsep.wasm"), "referencia a variante jsep, a mesma do OCR", refs);
  ok(fs.existsSync(R + "vendor/ort/ort-wasm-simd-threaded.jsep.wasm"), "o .wasm esta no pacote");
}

// --- 8) MS_SAIDA (panel.js) espelha --dur-2 (panel.css)
// Constante duplicada neste projeto vem com teste (MODELO_PADRAO, CAB_CTX,
// MAX_MINUTAS_UI). Divergir aqui e cosmetico -- desmontar o layout cedo demais
// aparece como um salto no fim da saida --, mas cosmetico invisivel e como
// esses pares comecam a apodrecer.
{
  const js = ler("src/panel.js"), css = ler("src/panel.css");
  const a = js.match(/const MS_SAIDA = (\d+);/);
  const b = css.match(/--dur-2:\s*(\d+)ms/);
  ok(!!a && !!b, "MS_SAIDA e --dur-2 existem", a && b && [a[1], b[1]]);
  ok(a && b && a[1] === b[1],
     `MS_SAIDA (${a && a[1]}) espelha --dur-2 (${b && b[1]})`);
  // MS_COLAPSO tem FOLGA sobre --dur-3: ele so precisa cobrir a transicao.
  const c = js.match(/const MS_COLAPSO = (\d+);/);
  const d = css.match(/--dur-3:\s*(\d+)ms/);
  ok(!!c && !!d, "MS_COLAPSO e --dur-3 existem", c && d && [c[1], d[1]]);
  ok(c && d && Number(c[1]) >= Number(d[1]),
     `MS_COLAPSO (${c && c[1]}) cobre --dur-3 (${d && d[1]})`);
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
