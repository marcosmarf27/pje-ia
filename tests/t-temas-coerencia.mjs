// Cada tema OFERECIDO na UI tem de EXISTIR no CSS e redefinir os tokens sem os
// quais o painel fica com metade da cara do tema anterior.
//
// Este teste existe porque a v0.58.0 publicou o tema "Rosa" com o `<option>`,
// o changelog e as notas da release — e ZERO byte de CSS. Escolher Rosa punha
// `data-tema="rosa"` no wrap e não mudava nada. O `t-temas.mjs` passava 23/23
// porque testava o MECANISMO (o atributo trocou? persiste? propaga?) e nunca
// o CONTEÚDO (existe paleta do outro lado?). Mesmo defeito do teste que lia
// `.sigbar .sb-n` com `|| {}`: verde sem testar.
import { readFileSync } from "node:fs";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const R = __RAIZ + "/";
// COMENTÁRIOS SÃO REMOVIDOS ANTES DE PARSEAR, e isto não é zelo: um comentário
// que cite `--token: valor;` faz o `[^;]+` do regex de declaração engolir tudo
// até o próximo `;` — isto é, a DECLARAÇÃO seguinte. Foi assim que este teste
// afirmou que o Noite não redefinia `--surface-painel` (ele redefine) e mediu
// 1,22:1 num tema correto. Parser ingênuo mente com a cara de quem acerta.
const cssBruto = readFileSync(R + "src/panel.css", "utf8");
const css = cssBruto.replace(/\/\*[\s\S]*?\*\//g, "");
const js = readFileSync(R + "src/panel.js", "utf8");
const html = readFileSync(R + "src/options.html", "utf8");

let ok = 0;
const falhas = [];
const eq = (c, msg) => (c ? ok++ : falhas.push(msg));

// Corpo de uma regra, por contagem de chaves (regex não-guloso morre nos
// blocos que contêm `}` em comentários).
function corpo(sel) {
  const i = css.indexOf(sel);
  if (i < 0) return null;
  const j = css.indexOf("{", i);
  let d = 0;
  for (let k = j; k < css.length; k++) {
    if (css[k] === "{") d++;
    else if (css[k] === "}" && --d === 0) return css.slice(j + 1, k);
  }
  return null;
}
const tokens = (t) =>
  new Map([...t.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

// ---- os temas que a UI oferece, lidos do FONTE (nunca uma lista aqui) ----
const bloco = js.match(/const TEMAS = \[([\s\S]*?)\];/);
eq(!!bloco, "TEMAS não encontrado em panel.js");
const ids = [...bloco[1].matchAll(/id:\s*"([^"]*)"/g)].map((m) => m[1]);
eq(ids.length >= 6, `TEMAS tem ${ids.length} entradas`);
eq(ids[0] === "", "o primeiro tema é o padrão (id vazio)");

// A página de opções oferece exatamente os mesmos. Duas listas que divergem
// dão um tema escolhível numa tela e inexistente na outra.
const sel = html.match(/<select id="tema">([\s\S]*?)<\/select>/);
eq(!!sel, "select#tema não existe em options.html");
const idsHtml = [...sel[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]);
eq(
  JSON.stringify(ids) === JSON.stringify(idsHtml),
  `painel ${JSON.stringify(ids)} != opções ${JSON.stringify(idsHtml)}`
);

// ---- o contrato de cada tema ----
const base = tokens(corpo("\n.wrap {"));
eq(base.size > 100, `bloco .wrap base tem ${base.size} tokens`);

// Os DOIS que nenhum tema pode herdar: `--surface-painel` pinta o FUNDO DA
// JANELA — `.msgs`, `.main` e `.content` não declaram fundo e herdam dele, e
// era ele que faltava no Noite (tinta clara sobre papel branco, 1,26:1) — e
// `--hd` é o cabeçalho, a primeira coisa que se vê de um tema.
//
// `--surface` e `--text` NÃO entram: um tema de chrome sobre corpo claro
// legitimamente os herda do base (é o caso do Vidro, cujas bolhas são sólidas
// de propósito para o texto do tribunal não passar por trás da resposta). Quem
// responde por legibilidade é o t-temas-contraste, que mede a cor RESULTANTE em
// vez de exigir a presença de um token.
const OBRIGATORIOS = ["--hd", "--surface-painel"];

for (const id of ids.filter((x) => x)) {
  const c = corpo(`.wrap[data-tema="${id}"] {`);
  eq(c !== null, `tema "${id}" NÃO tem bloco no panel.css`);
  if (c === null) continue;
  const t = tokens(c);
  for (const k of OBRIGATORIOS) {
    eq(t.has(k), `tema "${id}" não redefine ${k}`);
  }
  // Um token declarado duas vezes no mesmo bloco é SILENCIOSO e a última
  // vence: foi assim que o Vidro ficou com o CNJ em 1,3:1.
  const dup = [...c.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  const rep = [...new Set(dup.filter((x, i) => dup.indexOf(x) !== i))];
  eq(rep.length === 0, `tema "${id}" declara duas vezes: ${rep.join(", ")}`);
  // A amostra do seletor de temas tem de ser a cara do tema: a primeira cor é
  // a chrome. Amostra que mente é pior que amostra nenhuma.
  const li = js.indexOf(`id: "${id}"`);
  const linha = li < 0 ? "" : js.slice(li, js.indexOf(String.fromCharCode(10), li));
  const am = linha.match(/#[0-9a-f]{6}/i);
  const hd = t.get("--hd") || "";
  if (am && /^#[0-9a-f]{6}$/i.test(hd)) {
    eq(
      am[0].toLowerCase() === hd.toLowerCase(),
      `tema "${id}": amostra ${am[0]} != --hd ${hd}`
    );
  }
}

// ---- o Vidro é vidro em TODOS os modos ----
// A v0.58.0 desligava o desfoque em `.full` alegando que "não há nada atrás".
// É falso por mecanismo: atrás do `.panel` a página do tribunal continua
// pintada, e `backdrop-filter` a alcança. O usuário rejeitou a degradação.
const full = corpo('.wrap[data-tema="vidro"].full {');
eq(
  !full || !/--vidro-desfoque:\s*none/.test(full),
  "o Vidro desliga o desfoque em tela cheia"
);
eq(
  /\.wrap\[data-tema="vidro"\] \.panel \{[^}]*backdrop-filter/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")),
  "o .panel do Vidro não declara backdrop-filter"
);

console.log(`\n=== coerência dos temas ===`);
if (falhas.length) {
  for (const f of falhas) console.log("  ✗ " + f);
  console.log(`\n  ${ok} ok, ${falhas.length} FALHAS`);
  process.exit(1);
}
console.log(`  ${ok}/${ok} asserções`);
