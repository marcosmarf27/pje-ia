// Telas de configuração (popup.html e options.html, servidas pelo MESMO
// popup.js) + PARIDADE das tabelas que vivem duplicadas por necessidade.
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const SRC = __RAIZ + "/src/";
const ler = (f) => fs.readFileSync(SRC + f, "utf8");
let ok = 0, fail = 0;
const eq = (a, b, m) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { fail++; console.log("FALHOU: " + m + "\n  esperado: " + B + "\n  obtido:   " + A); }
};
const t = (c, m) => { if (c) ok++; else { fail++; console.log("FALHOU: " + m); } };

// ---------------------------------------------------------------- paridade
// As tabelas abaixo são duplicadas DE PROPÓSITO (o worker é ES module e o
// popup.js é script clássico), então o teste extrai as duas dos FONTES e exige
// que batam. Repetir os valores aqui criaria uma terceira cópia para divergir.
const bg = ler("background.js");
const pj = ler("popup.js");
const pn = ler("panel.js");

const idsCaps = [...bg.matchAll(/^ {2}"([a-z0-9.\-:/]+)": \{$/gim)].map((m) => m[1]);
t(idsCaps.length >= 10, "MODEL_CAPS extraído do fonte (" + idsCaps.length + " modelos)");
t(!idsCaps.some((i) => i.startsWith("or:")), "NENHUM modelo do OpenRouter em MODEL_CAPS (as caps vêm do catálogo)");

const defaultWorker = (bg.match(/model: v\.model \|\| "([^"]+)"/) || [])[1];
const defaultPopup = (pj.match(/const MODELO_PADRAO = "([^"]+)"/) || [])[1];
eq(defaultPopup, defaultWorker, "MODELO_PADRAO do popup == default do getCfg (o bug da v0.25)");

const perfis = [...pj.matchAll(/^ {2}"([a-z0-9.\-:/]+)": "(analise|redacao|ambos)",$/gim)].map((m) => m[1]);
const nomes = [...pn.matchAll(/^ {4}"([a-z0-9.\-:/]+)": "/gim)].map((m) => m[1]);

for (const arq of ["popup.html", "options.html"]) {
  const html = ler(arq);
  // SO os <option> do <select id="model">. Varrer o HTML inteiro estava certo
  // enquanto a tela tinha um <select> so; a v0.58.0 acrescentou o seletor de
  // TEMAS ao options.html e o regex solto passou a cobrar de "noite", "papel",
  // "vidro", "toga" e "rosa" uma entrada em MODEL_CAPS, um perfil em popup.js e
  // um nome no selo -- 15 vermelhos sobre um produto correto.
  const iSel = html.indexOf("<select id=\"model\">");
  const fSel = html.indexOf("</select>", iSel);
  if (iSel < 0 || fSel < 0) throw new Error("nao achei o select de modelo -- o HTML mudou de forma");
  const opts = [...html.slice(iSel, fSel).matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  const modelos = opts.filter((v) => v && v !== "or:*");
  const diretos = modelos.filter((v) => !v.startsWith("or:"));
  const doOr = modelos.filter((v) => v.startsWith("or:"));
  t(diretos.length > 0 && doOr.length > 0, arq + ": tem modelos diretos e do OpenRouter");
  for (const m of diretos) {
    t(idsCaps.includes(m), arq + ": <option> " + m + " tem entrada em MODEL_CAPS");
    t(perfis.includes(m), arq + ": <option> " + m + " tem perfil em popup.js");
    t(nomes.includes(m), arq + ": <option> " + m + " tem nome no selo do painel");
  }
  for (const m of doOr) {
    t(/^or:[^/\s]+\/[^\s]+$/.test(m), arq + ": id do OpenRouter bem formado: " + m);
  }
  t(opts.includes("or:*"), arq + ": tem a opção 'Outro modelo'");
  eq(opts[0], defaultWorker, arq + ": o 1º <option> é o modelo padrão (fallback do navegador)");
  // cartões de provedor
  const provs = [...html.matchAll(/data-prov="([a-z]+)"/g)].map((m) => m[1]);
  for (const p of ["openai", "anthropic", "gemini", "openrouter"]) {
    t(provs.filter((x) => x === p).length >= 3, arq + ": provedor " + p + " tem cartão, chave e optgroup");
  }
  t(html.includes('id="openrouterApiKey"'), arq + ": campo da chave do OpenRouter");
  t(html.includes('id="orSlug"'), arq + ": campo do identificador livre");
}

// PROVS do popup.js precisa listar os quatro (o contador "N de 4" sai dele)
const provsJs = (pj.match(/const PROVS = \[([^\]]+)\]/) || [])[1] || "";
for (const p of ["anthropic", "gemini", "openai", "openrouter"])
  t(provsJs.includes('"' + p + '"'), "PROVS do popup.js inclui " + p);

// ------------------------------------------------------- comportamento da tela
async function abrir(arquivo, storage) {
  const html = ler(arquivo).replace(/<script src="[^"]*"><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "chrome-extension://t/" + arquivo });
  const w = dom.window;
  const store = Object.assign({}, storage);
  const gravados = [];
  w.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (m, cb) => cb && cb({ ok: true }),
      openOptionsPage: () => {},
    },
    storage: {
      local: {
        get: (chaves, cb) => {
          const o = {};
          for (const k of [].concat(chaves)) o[k] = store[k];
          cb(o);
        },
        set: (o, cb) => { gravados.push(o); Object.assign(store, o); cb && cb(); },
        remove: (k, cb) => cb && cb(),
      },
    },
    action: { setBadgeText: () => {} },
  };
  const s = w.document.createElement("script");
  s.textContent = ler("popup.js");
  w.document.head.appendChild(s);
  await new Promise((r) => setTimeout(r, 30));
  return { w, d: w.document, gravados, store };
}

// 1) chave e cartão do OpenRouter aparecem quando o modelo é dele
{
  const { d } = await abrir("popup.html", { model: "or:anthropic/claude-sonnet-5", openrouterApiKey: "sk-or-1" });
  eq(d.getElementById("provR").getAttribute("aria-selected"), "true", "cartão do OpenRouter aceso pelo modelo salvo");
  eq(d.getElementById("keyR").hidden, false, "seção da chave do OpenRouter visível");
  eq(d.getElementById("keyO").hidden, true, "seção da OpenAI escondida");
  eq(d.getElementById("chipText").textContent, "Pronto para usar — Claude Sonnet 5", "chip nomeia o modelo do OpenRouter");
  t(/4 de 4|1 de 4/.test(d.getElementById("provCount").textContent), "contador diz 'de 4': " + d.getElementById("provCount").textContent);
  eq(d.getElementById("orSlugRow").hidden, true, "campo livre oculto num modelo da lista");
}

// 2) chip avisa quando falta a chave do provedor escolhido
{
  const { d } = await abrir("popup.html", { model: "or:x-ai/grok-4.6" });
  t(/Falta a chave da OpenRouter/.test(d.getElementById("chipText").textContent), "chip cobra a chave do OpenRouter: " + d.getElementById("chipText").textContent);
}

// 3) modelo colado à mão (fora da lista) volta como "Outro" + campo preenchido
{
  const { d } = await abrir("popup.html", { model: "or:qwen/qwen3-max", openrouterApiKey: "k" });
  eq(d.getElementById("model").value, "or:*", "modelo fora da lista seleciona 'Outro'");
  eq(d.getElementById("orSlug").value, "qwen/qwen3-max", "campo livre preenchido com o slug salvo");
  eq(d.getElementById("orSlugRow").hidden, false, "campo livre visível");
  eq(d.getElementById("provR").getAttribute("aria-selected"), "true", "cartão do OpenRouter aceso mesmo com id fora da lista");
}

// 4) salvar com o campo livre: normaliza URL, recusa vazio, nunca grava "or:*"
{
  const { d, gravados } = await abrir("popup.html", { model: "gpt-5.6-luna", openaiApiKey: "k" });
  d.getElementById("model").value = "or:*";
  d.getElementById("model").dispatchEvent(new d.defaultView.Event("change", { bubbles: true }));
  eq(d.getElementById("orSlugRow").hidden, false, "escolher 'Outro' revela o campo");
  // vazio: não grava nada
  d.getElementById("save").click();
  await new Promise((r) => setTimeout(r, 10));
  eq(gravados.length, 0, "salvar sem identificador NÃO grava (nem a chave, para nada se perder)");
  t(/Informe o identificador/.test(d.getElementById("saveStatus").textContent), "diz o que falta: " + d.getElementById("saveStatus").textContent);
  // URL colada da página do modelo
  d.getElementById("orSlug").value = "https://openrouter.ai/anthropic/claude-sonnet-4.6";
  d.getElementById("save").click();
  await new Promise((r) => setTimeout(r, 10));
  eq(gravados.length, 1, "com identificador válido, grava");
  eq(gravados[0].model, "or:anthropic/claude-sonnet-4.6", "URL colada vira o id com prefixo or:");
  eq(d.getElementById("orSlug").value, "anthropic/claude-sonnet-4.6", "campo devolvido normalizado");
  t(gravados[0].openaiApiKey === "k", "as outras chaves seguem sendo gravadas");
  t("openrouterApiKey" in gravados[0], "a chave do OpenRouter entra no objeto salvo");
}

// 5) identificador malformado é recusado
{
  const { d, gravados } = await abrir("popup.html", { model: "gpt-5.6-luna" });
  d.getElementById("model").value = "or:*";
  d.getElementById("orSlug").value = "claude sonnet";
  d.getElementById("save").click();
  await new Promise((r) => setTimeout(r, 10));
  eq(gravados.length, 0, "identificador sem barra é recusado");
}

// 6) o seletor de minutas não oferece o marcador "Outro"
{
  const { d } = await abrir("options.html", { model: "or:anthropic/claude-sonnet-5", openrouterApiKey: "k" });
  const mm = d.getElementById("modeloMinuta");
  const vals = [...mm.querySelectorAll("option")].map((o) => o.value);
  t(!vals.includes("or:*"), "o marcador 'Outro' NÃO é clonado para o seletor de minutas");
  t(vals.includes("or:anthropic/claude-opus-5"), "os modelos do OpenRouter aparecem no seletor de minutas");
  t(vals.every((v) => v === "" || v.startsWith("or:")), "só o provedor ativo é oferecido para a minuta");
}

// 7) a página de opções funciona igual (mesmo script, elementos exclusivos sob if)
{
  const { d } = await abrir("options.html", { model: "gpt-5.6-luna", openaiApiKey: "k" });
  eq(d.getElementById("provO").getAttribute("aria-selected"), "true", "options.html: cartão do provedor ativo");
  eq(d.getElementById("keyR").hidden, true, "options.html: chave do OpenRouter escondida com modelo GPT");
}

// 8) o marcador "Outro modelo" NÃO é um modelo: o chip não pode dizer que está
//    pronto, e digitar o identificador tem de repintar a tela na hora.
{
  const { d } = await abrir("popup.html", { model: "or:anthropic/claude-sonnet-5", openrouterApiKey: "k" });
  const chip = d.getElementById("chip"), txt = d.getElementById("chipText");
  const mudar = (el, ev) => el.dispatchEvent(new d.defaultView.Event(ev, { bubbles: true }));
  d.getElementById("model").value = "or:*";
  mudar(d.getElementById("model"), "change");
  t(/Falta o identificador/.test(txt.textContent), "chip cobra o identificador com 'Outro' escolhido: " + txt.textContent);
  t(/warn/.test(chip.className), "chip fica em aviso (a chave existe, o modelo nao)");
  // digitar o slug repinta a tela sem precisar salvar
  const campo = d.getElementById("orSlug");
  campo.value = "x-ai/grok-4.20";
  mudar(campo, "input");
  t(txt.textContent === "Pronto para usar — x-ai/grok-4.20", "digitar o identificador deixa o chip pronto: " + txt.textContent);
  t(/ok/.test(chip.className), "chip volta a ok");
  // o rotulo do Automatico da minuta nao pode virar parenteses vazios
  campo.value = "";
  mudar(campo, "input");
  const auto = d.getElementById("modeloMinuta").options[0];
  t(!/\(\)/.test(auto.textContent), "o rotulo Automatico nao fica com parenteses vazios: " + auto.textContent);
}

console.log("\n" + ok + " OK, " + fail + " falhas");
process.exit(fail ? 1 : 0);
