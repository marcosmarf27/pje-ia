// Confere src/tokenizador.js contra o ORACULO (tokenizers, Rust, do HuggingFace).
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const require = createRequire(import.meta.url);
const T = require(process.argv[3] || __RAIZ + "/src/tokenizador.js");

const vocab = T.lerVocabulario(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/vocab.txt", "utf8"));
const casos = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// O oraculo indexa por CODE POINT (Python); o JS por unidade UTF-16.
function mapaCpParaUtf16(s) {
  const m = [];
  let u = 0;
  for (const ch of s) { m.push(u); u += ch.length; }
  m.push(u); // sentinela para offsets que vao ate o fim
  return m;
}

let ok = 0, falhas = [];
for (const c of casos) {
  const m = mapaCpParaUtf16(c.texto);
  const esperado = {
    ids: c.ids,
    tokens: c.tokens,
    offsets: c.offsets.map(([a, b]) => [m[a], m[b]]),
  };
  // O JS tem de PRODUZIR o canonico a partir do bruto -- e o paraCanonico que
  // faz isso, e alimenta-lo com o texto ja composto nao o testaria.
  const canon = T.paraCanonico(c.bruto);
  if (canon !== c.texto) {
    falhas.push({ texto: c.bruto, esperado: { canonico: c.texto }, obtido: { canonico: canon } });
    continue;
  }
  const meus = T.tokenizar(canon, vocab);
  const obtido = {
    ids: meus.map((t) => t.id),
    tokens: meus.map((t) => t.tok),
    offsets: meus.map((t) => [t.ini, t.fim]),
  };
  const iguais =
    JSON.stringify(esperado.ids) === JSON.stringify(obtido.ids) &&
    JSON.stringify(esperado.tokens) === JSON.stringify(obtido.tokens) &&
    JSON.stringify(esperado.offsets) === JSON.stringify(obtido.offsets);
  if (iguais) { ok++; continue; }
  falhas.push({ texto: c.texto, esperado, obtido });
}

console.log(`tokenizador vs oraculo: ${ok}/${casos.length} casos identicos`);
for (const f of falhas) {
  console.log("\n--- DIVERGENCIA ---");
  console.log("texto:", JSON.stringify(f.texto));
  if (JSON.stringify(f.esperado.tokens) !== JSON.stringify(f.obtido.tokens)) {
    console.log("  tokens oraculo:", JSON.stringify(f.esperado.tokens));
    console.log("  tokens  nossos:", JSON.stringify(f.obtido.tokens));
  }
  if (JSON.stringify(f.esperado.ids) !== JSON.stringify(f.obtido.ids)) {
    console.log("  ids oraculo:", JSON.stringify(f.esperado.ids));
    console.log("  ids  nossos:", JSON.stringify(f.obtido.ids));
  }
  if (JSON.stringify(f.esperado.offsets) !== JSON.stringify(f.obtido.offsets)) {
    console.log("  offsets oraculo:", JSON.stringify(f.esperado.offsets));
    console.log("  offsets  nossos:", JSON.stringify(f.obtido.offsets));
    // mostra o que cada offset RECORTA, que e o que importa para a mascara
    console.log("  recorte oraculo:", JSON.stringify(f.esperado.offsets.map(([a,b])=>f.texto.slice(a,b))));
    console.log("  recorte  nossos:", JSON.stringify(f.obtido.offsets.map(([a,b])=>f.texto.slice(a,b))));
  }
}
process.exit(falhas.length ? 1 : 0);
