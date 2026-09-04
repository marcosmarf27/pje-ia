// CONTRASTE REAL DE CADA TEMA, calculado sobre os tokens EFETIVOS (base +
// overrides do tema), e não sobre a presença de um token.
//
// Por que assim: a v0.58.0 tinha um teste de temas verde (23/23) que verificava
// o MECANISMO — o atributo troca, persiste, propaga. Nenhuma asserção olhava
// para a COR resultante. O Noite foi publicado sem `--surface-painel`, então o
// fundo da janela ficava BRANCO enquanto a tinta era clara; o Rosa foi
// publicado sem uma linha de CSS. Os dois defeitos são invisíveis para um teste
// de presença e gritantes para um de contraste.
//
// Alfa: um token translúcido (o tema Vidro) é COMPOSTO sobre a página do
// tribunal, que é papel branco. É assim que ele aparece na tela, e é a única
// composição honesta — medir `rgba(255,255,255,.22)` sem fundo dá um número que
// não existe em lugar nenhum.
import { readFileSync } from "node:fs";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const R = __RAIZ + "/";
// Comentários fora ANTES de parsear: um comentário que cite `--token: valor;`
// faz o `[^;]+` do regex engolir a declaração seguinte. Ver a nota longa em
// t-temas-coerencia.mjs — foi o que fez este teste medir 1,22:1 num tema certo.
const css = readFileSync(R + "src/panel.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const js = readFileSync(R + "src/panel.js", "utf8");

let ok = 0;
const falhas = [];
const eq = (c, msg) => (c ? ok++ : falhas.push(msg));

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

// ---------- cor ----------
const PAGINA = [255, 255, 255]; // a folha do PJe, atrás do painel

// GRADIENTE VIRA A LISTA DAS SUAS PARADAS, e o par é medido no PIOR caso.
// Sem isto o teste PULA em silêncio todo par cujo fundo é gradiente — e como
// `--hd` e `--surface-painel` passaram a ser gradiente em cinco dos seis temas,
// ele deixaria de medir justamente "o texto da resposta sobre o fundo da
// janela", que é o par onde o Noite estava a 1,26:1. Teste que emudece ao
// encontrar um valor que não entende é pior que teste ausente: continua verde.
function paradas(v) {
  if (!v) return [];
  if (!/gradient\(/i.test(v)) {
    const c = cor1(v);
    return c ? [c] : [];
  }
  return [...v.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/gi)].map((m) => cor1(m[0])).filter(Boolean);
}
function cor1(v) {
  if (!v) return null;
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const c = m[1].split("").map((x) => parseInt(x + x, 16));
    return [...c, 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}
// Compõe a cor sobre um fundo (source-over).
const sobre = (c, f) =>
  c[3] >= 1 ? c.slice(0, 3) : [0, 1, 2].map((i) => c[i] * c[3] + f[i] * (1 - c[3]));
const lum = (rgb) => {
  const a = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const contraste = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

// ---------- temas ----------
const bloco = js.match(/const TEMAS = \[([\s\S]*?)\];/);
const ids = [...bloco[1].matchAll(/id:\s*"([^"]*)"/g)].map((m) => m[1]);
const base = tokens(corpo("\n.wrap {"));

// Os pares que decidem se o painel é legível. Cada um é um lugar REAL da tela,
// e o fundo é a PILHA de camadas daquele lugar, do topo para o fundo.
//
// A pilha não é preciosismo: num tema translúcido a coluna de peças é um véu
// (`--surface-2`) POR CIMA da placa (`--surface-painel`), que por sua vez está
// por cima da página do tribunal. Medir o véu direto sobre a página dá um
// número que não existe na tela — e foi assim que este teste reprovou o Vidro
// em lugares corretos e o aprovou em lugares errados, na mesma execução.
// Empilhar para de adivinhar: a composição para na primeira camada OPACA.
const PARES = [
  ["--text", ["--surface-painel"], 4.5, "texto da resposta sobre o fundo da janela"],
  ["--text", ["--surface"], 4.5, "texto sobre cartão"],
  ["--text-2", ["--surface-2", "--surface-painel"], 4.5, "item da lista de peças sobre a coluna"],
  ["--muted", ["--surface-painel"], 4.5, "texto secundário sobre a janela"],
  ["--on-hd", ["--hd"], 4.5, "título do painel sobre o cabeçalho"],
  ["--on-hd-2", ["--hd"], 3.0, "número do CNJ sobre o cabeçalho"],
  ["--text-3", ["--accent-bg", "--surface-painel"], 4.5, "chip de exemplo"],
  ["--pje", ["--surface-painel"], 3.0, "acento sobre a janela"],
  ["--on-acao", ["--btn-de"], 4.5, "rótulo do botão Enviar"],
  // O MODO SIGILOSO derivado do tema. Ele é o recurso mais sensível do produto
  // — o que ele sinaliza é que os autos NÃO estão saindo em claro —, e cada
  // tema redefine a própria família `--sig-*`. Um carimbo ilegível num tema é
  // um sinal de proteção que ninguém lê.
  ["--on-hd", ["--sig-hd"], 4.5, "título sobre o cabeçalho sigiloso"],
  ["--on-hd-2", ["--sig-hd"], 3.0, "CNJ sobre o cabeçalho sigiloso"],
  ["--sig-carimbo-ink", ["--sig-carimbo-bg", "--surface-painel"], 4.5, "carimbo do sigilo"],
  ["--on-acao", ["--sig-btn-de"], 4.5, "botão Enviar no modo sigiloso"],
];

// O VIDRO TEM UM SEGUNDO CENÁRIO, e ele não é hipótese: a placa é translúcida,
// então o que está ATRÁS entra na conta. Sobre a folha branca do PDF a tinta
// escura tem folga; sobre a barra institucional do PJe (azul saturado) ou sobre
// a área cinza-escura do visualizador, a mesma placa escurece e a tinta escura
// perde contraste. Um tema que só é legível sobre um fundo é um tema que falha
// quando o usuário rola a página.
const FUNDOS_ATRAS = [
  ["a folha branca do PDF", [255, 255, 255]],
  ["a barra institucional do PJe", [10, 61, 98]],
  ["a área cinza do visualizador", [228, 233, 237]],
];

console.log("\n=== contraste por tema (tokens efetivos) ===");
for (const id of ids) {
  const nome = id || "(padrão)";
  const c = id ? corpo(`.wrap[data-tema="${id}"] {`) : "";
  if (id) eq(c !== null, `tema "${id}" NÃO tem bloco no panel.css`);
  const t = new Map(base);
  if (c) for (const [k, v] of tokens(c)) t.set(k, v);

  // Resolve a pilha até a primeira camada opaca; devolve os fundos possíveis
  // (mais de um quando alguma camada é gradiente — cada parada é um caminho).
  function fundosDaPilha(pilha, atras) {
    let acc = [atras];
    for (const k of [...pilha].reverse()) {
      const ps = paradas(t.get(k));
      if (!ps.length) return [];
      const prox = [];
      for (const base of acc) for (const c of ps) prox.push(sobre(c, base));
      acc = prox;
    }
    return acc;
  }

  const linhas = [];
  for (const [fgK, pilha, min, onde] of PARES) {
    const fgs = paradas(t.get(fgK));
    const bgs = fundosDaPilha(pilha, PAGINA);
    // Um par que não dá para medir é FALHA, não silêncio: ou o token não existe,
    // ou tem um valor que este teste não sabe ler — e nos dois casos alguém
    // precisa olhar.
    if (!fgs.length || !bgs.length) {
      eq(false, `${nome}: não deu para medir ${onde} (${fgK}=${t.get(fgK)})`);
      continue;
    }
    // O pior caminho: num gradiente diagonal o texto passa por todas as
    // paradas, e basta uma faixa ilegível para a frase ficar ilegível ali.
    let pior = Infinity;
    for (const fg of fgs) {
      for (const bg of bgs) {
        pior = Math.min(pior, contraste(sobre(fg, bg), bg));
      }
    }
    const marca = bgs.length > 1 ? " (pior parada)" : "";
    linhas.push(
      `    ${pior.toFixed(2).padStart(5)}:1  ${pior >= min ? "ok " : "RUIM"}  ${onde}${marca}`
    );
    eq(pior >= min, `${nome}: ${onde} = ${pior.toFixed(2)}:1 (mínimo ${min})`);
  }
  console.log(`\n  ${nome}`);
  for (const l of linhas) console.log(l);
}

// ---------- o pior caso do tema translúcido ----------
{
  const t = new Map(base);
  for (const [k, v] of tokens(corpo('.wrap[data-tema="vidro"] {'))) t.set(k, v);
  // NÃO é só a placa: nos modos lateral e cheia o painel encosta no topo da
  // viewport, e ali quem fica sobre a barra institucional é o CABEÇALHO. Medir
  // só o corpo aprovava um tema cujo CNJ ficava em 2,7:1 exatamente naquele
  // ponto — e quem mostrou isso foi a CAPTURA, não o teste, que é o sinal de
  // que faltava o par.
  const CAMADAS = [
    ["a placa    ", "--surface-painel", ["--text", "--muted"]],
    ["a chrome   ", "--hd", ["--on-hd", "--on-hd-2"]],
    ["o sigiloso ", "--sig-hd", ["--on-hd", "--on-hd-2"]],
  ];
  console.log("\n  vidro — o painel sobre o que estiver atrás");
  for (const [nomeF, fundo] of FUNDOS_ATRAS) {
    for (const [nomeC, camada, tintas] of CAMADAS) {
      let pior = Infinity;
      for (const bg of paradas(t.get(camada))) {
        const bgC = sobre(bg, fundo);
        for (const fgK of tintas) {
          const fg = paradas(t.get(fgK))[0];
          pior = Math.min(pior, contraste(sobre(fg, bgC), bgC));
        }
      }
      // 4,5 sobre o caso comum (a folha); 3,0 é o piso aceito nos fundos em que
      // a placa apenas passa por cima — ali o texto ainda se lê, com menos folga.
      const min = fundo[0] === 255 ? 4.5 : 3;
      console.log(`    ${pior.toFixed(2).padStart(5)}:1  ${pior >= min ? "ok " : "RUIM"}  ${nomeC} sobre ${nomeF}`);
      eq(pior >= min, `vidro: ${nomeC.trim()} sobre ${nomeF} = ${pior.toFixed(2)}:1 (mínimo ${min})`);
    }
  }
}

console.log("");
if (falhas.length) {
  for (const f of falhas) console.log("  ✗ " + f);
  console.log(`\n  ${ok} ok, ${falhas.length} FALHAS`);
  process.exit(1);
}
console.log(`  ${ok}/${ok} asserções`);
