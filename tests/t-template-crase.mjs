// NENHUMA CRASE DENTRO DO TEMPLATE DE MARKUP DO PAINEL.
//
// Este teste existe porque o defeito aconteceu DUAS VEZES na mesma sessão, e o
// modo de falha é dos piores que há:
//
//   wrap.innerHTML = `
//     <!-- ... quem alterna é o `data-view` do `.main` ... -->
//   `;
//
// A crase do comentário ENCERRA o template literal. O que vem depois deixa de
// ser texto e passa a ser expressão JavaScript, então `data` vira um
// identificador inexistente. E o sintoma não aponta para cá:
//
//   - `node --check` PASSA numa das formas (a string fecha e reabre, e o
//     resultado continua sintaticamente válido) e o erro só nasce em runtime
//     como `ReferenceError: rail is not defined`;
//   - na outra forma o erro é `SyntaxError: Unexpected identifier 'data'`,
//     numa linha que é um COMENTÁRIO HTML — e ninguém procura defeito de
//     sintaxe dentro de um comentário;
//   - e no navegador o painel simplesmente não monta. O arnês visual dizia
//     "panel.css nao chegou", apontando para a folha de estilo, que estava
//     perfeita.
//
// A convenção do projeto é escrever muito comentário, e comentar código com
// crase é o hábito natural de quem escreve Markdown o dia inteiro. Por isso a
// regra não pode depender de disciplina: ela precisa de teste.
//
// A REGRA: dentro de `wrap.innerHTML = \`...\`` não existe crase. Para citar um
// seletor ou um atributo ali, escreva o nome cru (.main, data-view) ou use
// aspas. Fora do template, comentar com crase continua sendo o estilo do
// arquivo — este teste não olha para lá.
import { readFileSync } from "node:fs";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

let ok = 0;
const falhas = [];
const eq = (c, m) => (c ? ok++ : falhas.push(m));

const fonte = readFileSync(__RAIZ + "/src/panel.js", "utf8");

// O template começa na atribuição e termina na primeira linha que só contém a
// crase de fechamento seguida de ponto e vírgula. Achar o fim por contagem de
// crases seria circular — é justamente a contagem que está em questão.
const ABRE = "wrap.innerHTML = `";
const i = fonte.indexOf(ABRE);
eq(i >= 0, "o template de markup do painel foi encontrado");
if (i < 0) {
  console.log(falhas.join("\n"));
  process.exit(1);
}
const corpo = fonte.slice(i + ABRE.length);
const linhas = corpo.split("\n");
const dentro = [];
// O FIM e a linha que ENCERRA o template, e ela nao e uma linha so com a
// crase: no panel.js o template fecha em `    </div>` seguido de crase e
// ponto e virgula. Procurar a linha isolada nao casava nada, o laco varria
// o arquivo INTEIRO e o teste acusava duzentas "crases no template" que
// eram comentarios normais do resto do arquivo — um teste que grita em
// tudo e um teste que ninguem le.
for (const l of linhas) {
  if (l.trimEnd().endsWith("`;")) break;
  dentro.push(l);
}
eq(dentro.length > 200, `o template tem ${dentro.length} linhas (esperado: centenas)`);

const maus = [];
dentro.forEach((l, n) => {
  if (l.includes("`")) maus.push((n + 1) + ": " + l.trim().slice(0, 96));
});
eq(
  maus.length === 0,
  "CRASE dentro do template de markup — ela ENCERRA a string:\n    " + maus.join("\n    ")
);

// A mesma armadilha vale para os OUTROS templates longos do arquivo. Aqui só o
// principal é coberto; os demais são pequenos e nascem de uma expressão só.

console.log("=== crase no template do painel ===");
if (falhas.length) {
  for (const f of falhas) console.log("  FALHA: " + f);
  console.log(`  ${ok} ok, ${falhas.length} FALHAS`);
  process.exit(1);
}
console.log(`  ${ok}/${ok} asserções — nenhuma crase nas ${dentro.length} linhas do template`);
