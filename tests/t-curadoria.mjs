// CURADORIA DA LISTA DO OPENROUTER, validada contra o catálogo PÚBLICO.
//
// Os <option> do OpenRouter são o único lugar onde a extensão afirma algo sobre
// um modelo de terceiro (as caps vêm do catálogo em runtime). Uma afirmação
// dessas envelhece sozinha — foi assim que `x-ai/grok-4.6` entrou na lista com
// o rótulo "1M tokens" tendo 500 mil. Este teste lê os ids do HTML REAL e
// confere na API pública, com o critério de CADA grupo (o atributo `data-pdf`).
//
// Precisa de rede. Sem ela, avisa e sai com 0 (não é regressão de código).
import fs from "node:fs";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const SRC = __RAIZ + "/src/";
let ok = 0, fail = 0;
const t = (c, m) => { if (c) ok++; else { fail++; console.log("FALHOU: " + m); } };

function grupos(arq) {
  const html = fs.readFileSync(SRC + arq, "utf8");
  const out = {};
  for (const g of html.matchAll(/<optgroup[^>]*data-prov="openrouter"[^>]*data-pdf="(\w+)"[\s\S]*?<\/optgroup>/g)) {
    out[g[1]] = [...g[0].matchAll(/<option value="(or:[^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
  }
  return { html, out, bruto: html.match(/<optgroup[^>]*data-prov="openrouter"[\s\S]*<\/optgroup>/)[0] };
}
const P = grupos("popup.html"), O = grupos("options.html");
t(P.bruto === O.bruto, "popup.html e options.html oferecem o MESMO bloco, byte a byte");
for (const k of ["nativo", "conversor", "livre"]) t(!!P.out[k], "existe o grupo data-pdf=" + k);
t(P.out.livre.length === 1 && P.out.livre[0][0] === "or:*", "o grupo 'livre' tem só o marcador Outro modelo");
t(P.out.nativo.length >= 6, "o grupo nativo tem >= 6 modelos (tem " + P.out.nativo.length + ")");
t(P.out.conversor.length >= 1, "o grupo conversor tem >= 1 modelo (tem " + P.out.conversor.length + ")");
t(!P.out.nativo.concat(P.out.conversor).some(([id]) => id === "or:*"),
  "o marcador Outro NÃO aparece nos grupos que afirmam capacidades");

let cat = null;
try { const r = await fetch("https://openrouter.ai/api/v1/models"); if (r.ok) cat = (await r.json()).data; } catch { /**/ }
if (!cat) {
  console.log("\n(sem rede: os critérios contra o catálogo não foram verificados)");
  console.log(ok + " OK, " + fail + " falhas");
  process.exit(fail ? 1 : 0);
}

const CONFIAVEIS = ["OpenAI", "Google", "Google AI Studio", "Anthropic", "xAI", "Azure",
  "Amazon Bedrock", "Claude Platform on AWS", "Google Vertex", "Meta", "DeepSeek", "Z.AI",
  "Together", "Fireworks", "Cloudflare", "DeepInfra"];

for (const grupo of ["nativo", "conversor"]) {
  console.log("\n--- grupo " + grupo + " ---");
  for (const [id, rotulo] of P.out[grupo]) {
    const slug = id.slice(3);
    const m = cat.find((x) => x.id === slug);
    t(!!m, "existe no catálogo: " + slug);
    if (!m) continue;
    const im = (m.architecture && m.architecture.input_modalities) || [];
    const ctx = m.context_length || 0;
    // CRITÉRIO 1, comum aos dois grupos: cabe um processo inteiro.
    t(ctx >= 1000000, slug + ": janela >= 1M (tem " + (ctx / 1e6).toFixed(2) + "M)");
    // CRITÉRIO 2, o que separa os grupos.
    if (grupo === "nativo") {
      t(im.includes("file"), slug + ": lê PDF nativamente (modalidades: " + im.join("+") + ")");
    } else {
      t(!im.includes("file"),
        slug + ": está no grupo do conversor e de fato NÃO lê arquivo — se passar a ler, mude de grupo");
      // O rótulo do grupo do conversor PROMETE sobre imagem, porque ali a
      // diferença é sentida (anexo em foto é prova). A promessa tem de bater.
      const dizQueLe = /(?<!NÃO )lê imagens/.test(rotulo);
      const dizQueNao = /NÃO lê imagens/.test(rotulo);
      t(dizQueLe || dizQueNao, slug + ": o rótulo diz se lê imagens (é a diferença que se sente): " + rotulo);
      if (dizQueLe) t(im.includes("image"), slug + ': o rótulo diz "lê imagens" e o catálogo confirma');
      if (dizQueNao) t(!im.includes("image"), slug + ': o rótulo diz "NÃO lê imagens" e o catálogo confirma');
    }
    t((m.supported_parameters || []).includes("tools"), slug + ": aceita tools (a busca de jurisprudência depende disso)");
    // o RÓTULO não pode prometer mais janela do que existe
    const prom = /([\d,]+)M tokens/.exec(rotulo);
    if (prom) {
      const pedido = Number(prom[1].replace(",", "."));
      t(pedido <= ctx / 1e6 + 0.01, slug + ": o rótulo promete " + prom[1] + "M e o modelo tem " + (ctx / 1e6).toFixed(2) + "M");
    }
    console.log("   " + slug.padEnd(32) + (ctx / 1e6).toFixed(2) + "M  " +
      ((Number(m.pricing.prompt) * 1e6).toFixed(3) + "/" + (Number(m.pricing.completion) * 1e6).toFixed(3)).padStart(15) +
      "  " + im.join("+"));
  }
}

// CRITÉRIO 3: quem serve, e uptime. Vale para os dois grupos — é ele que torna
// improvável o 503 de "nenhum provedor sem retenção de dados".
console.log("");
for (const grupo of ["nativo", "conversor"]) {
  for (const [id] of P.out[grupo]) {
    const slug = id.slice(3);
    let eps = null;
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models/" + slug + "/endpoints");
      if (r.ok) eps = ((await r.json()).data || {}).endpoints || [];
    } catch { /**/ }
    if (!eps || !eps.length) { console.log("   (sem dados de endpoint para " + slug + ")"); continue; }
    const provs = [...new Set(eps.map((e) => e.provider_name))];
    const up = Math.max(...eps.map((e) => e.uptime_last_1d || 0));
    t(provs.some((p) => CONFIAVEIS.includes(p)),
      slug + ": tem fabricante/nuvem grande entre os " + provs.length + " provedores");
    t(up >= 95, slug + ": uptime de 24 h >= 95% (" + up.toFixed(1) + "%)");
  }
}

console.log("\n" + ok + " OK, " + fail + " falhas");
process.exit(fail ? 1 : 0);
