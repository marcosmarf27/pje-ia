// Coerencia das listas de modelos: as DUAS telas oferecem o mesmo conjunto;
// todo id direto tem caps, nome no selo e perfil no popup; o padrao de cada
// cartao e' o primeiro <option> do seu grupo; os defaults batem.
import fs from "node:fs";
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

// SO o <select id="model">, e nao o HTML inteiro. Varrer tudo estava certo
// enquanto a tela tinha um <select> so; desde que a v0.58.0 acrescentou o
// seletor de TEMAS ao options.html, o regex solto trazia "noite", "papel",
// "vidro", "toga" e "rosa" junto com os ids de modelo, e o teste acusava
// entre as duas telas uma divergencia que nao existia. Recorte por indexOf e
// nao por regex: o conteudo do bloco tem aspas e sinais que um [^]*? faria
// atravessar o </select> errado num HTML com dois selects.
const MARCA_INI = "<select id=\"model\">";
const MARCA_FIM = "</select>";
const selDeModelo = (html) => {
  const i = html.indexOf(MARCA_INI);
  const j = html.indexOf(MARCA_FIM, i);
  if (i < 0 || j < 0) throw new Error("nao achei o select de modelo -- o HTML mudou de forma");
  return html.slice(i, j);
};
const opts = (html) => [...selDeModelo(html).matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
const popup = opts(ler("src/popup.html"));
const options = opts(ler("src/options.html"));
ok(JSON.stringify(popup) === JSON.stringify(options), "popup e options oferecem os MESMOS ids na MESMA ordem", { popup, options });

const bg = ler("src/background.js");
const capsIds = [...bg.matchAll(/^\s{2}"([a-z0-9.\-]+)": \{\s*$/gm)].map((m) => m[1]);
const panel = ler("src/panel.js");
const nomes = [...panel.matchAll(/^\s+"([a-z0-9.\-]+)": "[^"]+",\s*$/gm)].map((m) => m[1]);
const pj = ler("src/popup.js");
const perfis = [...pj.matchAll(/^\s+"([a-z0-9.\-]+)": "(analise|redacao|ambos)",\s*$/gm)].map((m) => m[1]);
for (const id of popup) {
  if (id.startsWith("or:")) continue;
  ok(capsIds.includes(id), "MODEL_CAPS tem " + id, capsIds);
  ok(nomes.includes(id), "NOMES_MODELO tem " + id);
  ok(perfis.includes(id), "PERFIS do popup tem " + id);
}
// defaults
const padraoBg = (bg.match(/model: v\.model \|\| "([^"]+)"/) || [])[1];
const padraoPopup = (pj.match(/const MODELO_PADRAO = "([^"]+)"/) || [])[1];
ok(padraoBg && padraoBg === padraoPopup, "default do worker == MODELO_PADRAO do popup", { padraoBg, padraoPopup });
ok(popup[0] === padraoPopup, "o default e' o PRIMEIRO <option>", popup[0]);
// PADRAO por cartao = primeiro option do grupo
const padraoCard = Object.fromEntries([...pj.matchAll(/^\s+(anthropic|gemini|openai|openrouter): "([^"]+)",\s*$/gm)].map((m) => [m[1], m[2]]));
const html = ler("src/popup.html");
for (const [prov, id] of Object.entries(padraoCard)) {
  const grupo = html.match(new RegExp('<optgroup label="[^"]*" data-prov="' + prov + '"[^>]*>\\s*<option value="([^"]+)"'));
  ok(grupo && grupo[1] === id, "cartao " + prov + " aponta para o 1o option do grupo", { esperado: grupo && grupo[1], id });
}
const fb = Object.fromEntries([...bg.matchAll(/^\s+(anthropic|gemini|openai): "([^"]+)",\s*$/gm)].map((m) => [m[1], m[2]]));
for (const [prov, id] of Object.entries(fb)) ok(capsIds.includes(id), "FALLBACK_POR_PROVEDOR." + prov + " existe em MODEL_CAPS", id);
ok(fb.gemini === "gemini-3.8-flash", "fallback do Gemini e' o 3.8");
console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
