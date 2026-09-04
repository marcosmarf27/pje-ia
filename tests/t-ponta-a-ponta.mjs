// Cadeia INTEIRA com a saida REAL do modelo: tokenizacao -> janela -> layout do
// lote -> indexacao dos logits -> agregacao por palavra -> BIO -> offset de
// caractere -> mascara -> trava. O motor devolve os logits que o ONNX produziu
// de verdade (gravados por logits-reais.py), entao nada aqui e simulado exceto
// o transporte.
//
// E o teste que so ficou possivel depois de exportar o modelo, e o unico que
// exercita os elos que erram em SILENCIO: um deslocamento de uma posicao na
// indexacao dos logits devolve o rotulo do token vizinho, e o sintoma e um nome
// que nao foi mascarado.
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
const T = require(__RAIZ + "/src/tokenizador.js");
const N = require(__RAIZ + "/src/ner-nucleo.js");
const P = require(__RAIZ + "/src/pseudonimos.js");
const A = require(__RAIZ + "/src/anonimizar.js");
const TR = require(__RAIZ + "/src/trava.js");

let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };

console.log("=== ponta a ponta, com logits REAIS do modelo ===");

const vocab = T.lerVocabulario(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/vocab.txt", "utf8"));
const cfg = JSON.parse(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/config.json", "utf8"));
const rotulos = N.rotulosDe(cfg.id2label);
const casos = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const denyBruto = JSON.parse(fs.readFileSync(__RAIZ + "/src/config/deny-list.json", "utf8"));
const negado = A.prepararDeny(denyBruto);

// O que o modelo tem de reencontrar, INTEIRO. Sao os nomes que a referencia por
// subtoken quebrou em pedacos ('J','O','A','O CARLOS PEREIRA') -- e e a
// agregacao por palavra que os remonta.
const ESPERADO = [
  { pessoas: ["JOAO CARLOS PEREIRA", "Maria Aparecida de Souza"] },
  { pessoas: ["Ana Beatriz Lima", "Ricardo Mendes Filho", "Carlos Alberto Nogueira"] },
  { pessoas: ["Elioneudo Evaristo dos Santos", "Fernanda Oliveira"] },
  { pessoas: ["MARIA DA CONCEIÇÃO ARAÚJO", "José Antônio Gonçalves", "Ana Lúcia Barroso"] },
];

for (let k = 0; k < casos.length; k++) {
  const c = casos[k];
  const texto = c.texto;
  console.log("\n--- caso " + (k + 1) + " ---");

  // 1) a janela do JS tem de ser a MESMA que o Python alimentou ao ONNX
  const toks = T.tokenizar(texto, vocab);
  const jan = T.janelas(toks, vocab, {});
  ok(jan.length === 1, "cabe numa janela so (o caso e curto de proposito)", jan.length);
  ok(JSON.stringify(jan[0].ids) === JSON.stringify(c.ids),
     "os ids do JS batem com os que foram ao modelo", { js: jan[0].ids.length, py: c.ids.length });

  // 2) motor que devolve os logits REAIS
  const plano = new Float32Array(c.logits.length * rotulos.length);
  for (let i = 0; i < c.logits.length; i++)
    for (let j = 0; j < rotulos.length; j++) plano[i * rotulos.length + j] = c.logits[i][j];
  const motor = async (tens) => {
    ok(tens.dims[0] === 1 && tens.dims[1] === c.ids.length, "o lote tem a forma esperada", tens.dims);
    return plano;
  };

  const spansNer = await N.correr(texto, vocab, motor, { tokenizador: T, rotulos, tamLote: 1 });
  const achados = spansNer.map((s) => s.tipo + ":" + texto.slice(s.ini, s.fim));
  console.log("  NER:", JSON.stringify(achados));

  // 3) toda PESSOA esperada aparece INTEIRA, num span so
  for (const p of ESPERADO[k].pessoas) {
    ok(spansNer.some((s) => s.tipo === "PESSOA" && texto.slice(s.ini, s.fim) === p),
       "achou '" + p + "' inteiro, num span so", achados.filter((x) => x.startsWith("PESSOA")));
  }

  // 4) nada de fragmento de uma letra -- era o sintoma da agregacao errada
  const fragmentos = spansNer.filter((s) => s.tipo === "PESSOA" && s.fim - s.ini <= 2);
  ok(fragmentos.length === 0, "nenhum fragmento de PESSOA com 1-2 caracteres",
     fragmentos.map((s) => texto.slice(s.ini, s.fim)));

  // 5) o que a politica PRESERVA nao pode virar mascara
  const fundidos = A.fundir(spansNer, A.detectar(texto), { texto, negado });
  const tiposFinais = [...new Set(fundidos.map((s) => s.tipo))].sort();
  console.log("  apos politica+deny:", JSON.stringify(tiposFinais));
  ok(!tiposFinais.includes("TEMPO"), "TEMPO nao e mascarado (prazo e o eixo do produto)");
  ok(!tiposFinais.includes("LEGISLACAO"), "LEGISLACAO nao e mascarada (e a fundamentacao)");
  if (/art\. 155/.test(texto))
    ok(!fundidos.some((s) => texto.slice(s.ini, s.fim).includes("155")), "o artigo 155 sobrevive");

  // 6) mascara + pos-condicao da peca
  const mapa = P.criarMapa("caso-" + k);
  const mascarado = P.mascarar(texto, fundidos, mapa);
  console.log("  mascarado:", JSON.stringify(mascarado.slice(0, 150) + (mascarado.length > 150 ? "..." : "")));
  for (const p of ESPERADO[k].pessoas)
    ok(!mascarado.includes(p), "'" + p + "' sumiu do texto mascarado");
  ok(P.conferir(mascarado, mapa).ok === true, "pos-condicao da peca passa");

  // 7) a TRAVA sobre o payload que iria a API
  const payload = { model: "gpt-5.6-luna", messages: [{ role: "user", content: [{ type: "text", text: mascarado }] }] };
  n++;
  try { TR.carimbar(payload, mapa.proibidos()); } catch (e) { mau++; console.log("  FALHOU: a trava bloqueou o texto MASCARADO:", e.message); }
  // e com o texto CRU ela tem de bloquear
  n++;
  try {
    TR.carimbar({ messages: [{ content: [{ type: "text", text: texto }] }] }, mapa.proibidos());
    mau++; console.log("  FALHOU: a trava DEIXOU passar o texto cru");
  } catch (e) { if (!e.vazamento) { mau++; console.log("  FALHOU: erro errado", e.message); } }

  // 8) a reidentificacao devolve o texto original
  const volta = P.reidentificar(mascarado, mapa);
  for (const p of ESPERADO[k].pessoas)
    ok(volta.texto.includes(p), "'" + p + "' volta na reidentificacao");
  ok(volta.desconhecidos === 0, "nenhum rotulo desconhecido na volta", volta);
}

console.log(`\n  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
