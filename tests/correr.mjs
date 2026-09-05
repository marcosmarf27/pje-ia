// Roda a suíte inteira.  Uso:  node correr.mjs  [--rapido]
//
// Um teste é VERMELHO quando imprime "FALHOU" ou sai com código != 0. Os testes
// deste repositório são scripts que contam asserções, não um framework, e
// "FALHOU" é a palavra que todos usam — foi ela que revelou os 16 vermelhos
// herdados quando a suíte saiu do scratchpad para cá.
//
// O catálogo é DECLARADO e não varrido: vários testes precisam de uma fixture
// no argv e o do turno sigiloso tem MODOS. Um runner que só fizesse
// `node t-*.mjs` daria esses como quebrados e ensinaria a ignorar vermelho.
// Teste novo entra aqui.
import { spawnSync } from "node:child_process";

const CATALOGO = [
  // --- unidade e coerência (rápidos) ---
  { t: "t-anonimizar" },
  { t: "t-pseudonimos" },
  { t: "t-pseudonimos-trava" },
  { t: "t-trava" },
  { t: "t-guarda" },
  { t: "t-fiacao" },
  { t: "t-nucleo" },
  { t: "t-nucleo-correr" },
  { t: "t-v56-unit" },
  { t: "t-sigilo-duas-abas" },
  { t: "t-peca-fora-da-timeline", lento: true },
  { t: "t-modelos-coerencia" },
  { t: "t-config" },
  { t: "t-worker" },
  { t: "t-openrouter" },
  { t: "t-curadoria" },
  { t: "t-temas" },
  { t: "t-template-crase" },
  { t: "t-temas-coerencia" },
  { t: "t-temas-contraste" },
  // --- com fixture no argv ---
  // O oráculo é o `tokenizers` (Rust) do HuggingFace: escritor conferido pelo
  // próprio escritor não prova nada. `fixtures/oraculo.py` regenera.
  { t: "t-tokenizador", args: ["fixtures/oraculo.json"] },
  { t: "t-tok-param", args: ["fixtures/oraculo.json"] },
  // Logits REAIS do modelo. O INT8 é o que vai no pacote; o FP32 fica porque a
  // pergunta que importa não é "os logits batem?" e sim "saem as mesmas
  // entidades?" — e a resposta tem de continuar sendo sim nos dois.
  { t: "t-ponta-a-ponta", args: ["fixtures/logits-int8.json"], lento: true },
  { t: "t-ponta-a-ponta", args: ["fixtures/logits-reais.json"], lento: true, rotulo: "t-ponta-a-ponta (fp32)" },
  { t: "t-ner-nucleo", lento: true },
  // --- integração em jsdom (lentos) ---
  { t: "t-content", lento: true },
  { t: "t-texto-local", lento: true },
  { t: "t-sigilo-56", lento: true },
  // O teste PRINCIPAL antes de qualquer release. "normal lento" e "normal erro"
  // são os de feedback: bolha que conta os segundos, nenhuma bolha vazia.
  { t: "t-turno-sigiloso", args: ["normal", "lento"], lento: true },
  { t: "t-turno-sigiloso", args: ["normal", "erro"], lento: true },
  { t: "t-turno-sigiloso", args: [], lento: true, rotulo: "t-turno-sigiloso (sigiloso)" },
  { t: "t-turno-sigiloso", args: ["historico"], lento: true },
  { t: "t-turno-sigiloso", args: ["opaco"], lento: true },
  { t: "t-turno-sigiloso", args: ["cancelar"], lento: true },
  { t: "t-turno-sigiloso", args: ["semaprovar"], lento: true },
  // --- rede (fica por último; falha aqui pode ser a internet) ---
  { t: "t-catalogo-real", rede: true },
];

const rapido = process.argv.includes("--rapido");
const alvos = CATALOGO.filter((c) => !(rapido && (c.lento || c.rede)));

let verdes = 0;
const vermelhos = [];
const inicio = Date.now();

for (const c of alvos) {
  const nome = c.rotulo || (c.t + (c.args && c.args.length ? " " + c.args.join(" ") : ""));
  process.stdout.write(nome.padEnd(34));
  const r = spawnSync(process.execPath, [c.t + ".mjs", ...(c.args || [])], {
    encoding: "utf8",
    timeout: 600000,
  });
  const saida = (r.stdout || "") + (r.stderr || "");
  const ruim = saida.includes("FALHOU") || r.status !== 0;
  // O resumo é a última linha não vazia — cada teste tem o seu formato, e
  // impor um só custaria reescrever todos por nada.
  const linhas = saida.split("\n").map((l) => l.trim()).filter(Boolean);
  const resumo = linhas.length ? linhas[linhas.length - 1].slice(0, 60) : "(sem saída)";
  if (ruim) {
    vermelhos.push({ nome, saida });
    console.log("VERMELHO  " + resumo);
  } else {
    verdes++;
    console.log("ok        " + resumo);
  }
}

const seg = Math.round((Date.now() - inicio) / 1000);
console.log("");
console.log(verdes + " verdes, " + vermelhos.length + " vermelhos, em " + seg + "s");
for (const v of vermelhos) {
  console.log("");
  console.log("--- " + v.nome + " ---");
  for (const l of v.saida.split("\n")) if (l.includes("FALHOU") || l.includes("Error")) console.log("  " + l.trim());
}
process.exit(vermelhos.length ? 1 : 0);
