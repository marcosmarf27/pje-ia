// Teste de src/ner-nucleo.js com MOTOR FALSO.
//
// Cobre a parte onde o erro é silencioso: um deslocamento de uma posição
// devolve o rótulo da palavra vizinha, e o sintoma é um nome não mascarado —
// não uma exceção. O motor falso rotula pela SEQUÊNCIA DE IDS do nome-alvo, o
// que exercita a cadeia inteira (tokenizar -> janelar -> lote -> logits ->
// BIO -> offsets de caractere) sem carregar 433 MB de pesos.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const require = createRequire(import.meta.url);
const RAIZ = __RAIZ + "";
const T = require(path.join(RAIZ, "src/tokenizador.js"));
const N = require(path.join(RAIZ, "src/ner-nucleo.js"));

let ok = 0;
const falhas = [];
const eq = (a, b, q) =>
  JSON.stringify(a) === JSON.stringify(b)
    ? ok++
    : falhas.push(`${q}\n    esperado: ${JSON.stringify(b)}\n    obtido:   ${JSON.stringify(a)}`);
const verdade = (c, q) => (c ? ok++ : falhas.push(q));

const vocabTxt = readFileSync(path.join(RAIZ, "vendor/ner-modelo/vocab.txt"), "utf8");
const vocab = T.lerVocabulario(vocabTxt);
const cfg = JSON.parse(readFileSync(path.join(RAIZ, "vendor/ner-modelo/config.json"), "utf8"));
const ROTULOS = N.rotulosDe(cfg.id2label);

// ============================================================ rótulos
eq(ROTULOS.length, 13, "13 rótulos, como o config.json do modelo");
eq(ROTULOS[0], "O", "id 0 é O");
eq(ROTULOS[3], "B-PESSOA", "id 3 é B-PESSOA");
eq(ROTULOS[4], "I-PESSOA", "id 4 é I-PESSOA");
// A armadilha: as chaves do id2label são STRING e vêm FORA DE ORDEM ("10" antes
// de "2"). Ler por posição de array devolveria o rótulo errado.
eq(ROTULOS[10], "I-LEGISLACAO", "id 10 é I-LEGISLACAO mesmo com a chave fora de ordem no JSON");
eq(ROTULOS[12], "I-JURISPRUDENCIA", "id 12 é I-JURISPRUDENCIA");
eq(N.rotulosDe({ 2: "B-X" })[0], "O", "buraco no id2label vira O, não undefined");

eq(N.partirRotulo("B-PESSOA"), { prefixo: "B", tipo: "PESSOA" }, "parte B-");
eq(N.partirRotulo("I-LOCAL"), { prefixo: "I", tipo: "LOCAL" }, "parte I-");
eq(N.partirRotulo("O"), { prefixo: "O", tipo: null }, "O não tem tipo");

// ============================================================ softmax
{
  const p = N._softmaxLinha(new Float32Array([1, 2, 3]), 0, 3);
  eq(Math.round(p.reduce((a, b) => a + b, 0) * 1e6) / 1e6, 1, "softmax soma 1");
  verdade(p[2] > p[1] && p[1] > p[0], "softmax preserva a ordem");
  // Logit alto: sem subtrair o máximo, Math.exp estoura e devolve NaN — e um
  // NaN não estoura nada, ele só perde toda comparação em silêncio.
  const q = N._softmaxLinha(new Float32Array([1000, 1001]), 0, 2);
  verdade(Number.isFinite(q[0]) && Number.isFinite(q[1]), "logit alto não vira NaN");
  verdade(q[1] > q[0], "…e a ordem continua certa");
}

// ============================================================ lote
{
  const j = [{ ids: [1, 2, 3] }, { ids: [4, 5] }];
  const l = N.montarLote(j, { padId: 0 });
  eq(l.dims, [2, 3], "padding ao MAIOR da batelada, não a 512");
  eq([...l.ids].map(Number), [1, 2, 3, 4, 5, 0], "a janela curta é preenchida com o padId");
  eq([...l.mask].map(Number), [1, 1, 1, 1, 1, 0], "a máscara zera exatamente no padding");
  eq([...l.tipos].map(Number), [0, 0, 0, 0, 0, 0], "token_type_ids é tudo zero (uma sentença)");
  verdade(l.ids instanceof BigInt64Array, "os ids são BigInt64Array — o ORT Web exige int64");
  verdade(l.mask instanceof BigInt64Array, "a máscara também");
}

// ================================================= agregação por palavra
{
  // "Jo" + "##ão": o argmax dos dois discorda, e vence o de MAIOR score.
  const tokens = [
    { ini: 0, fim: 2, sub: false },
    { ini: 2, fim: 5, sub: true },
  ];
  const p1 = N.agregarPalavras(tokens, [
    { rotulo: "O", score: 0.6 },
    { rotulo: "B-PESSOA", score: 0.95 },
  ]);
  eq(p1.length, 1, "os dois subtokens viram UMA palavra");
  eq(p1[0].rotulo, "B-PESSOA", "vence o subtoken de maior score");
  eq([p1[0].ini, p1[0].fim], [0, 5], "…e a palavra cobre os dois");
  const p2 = N.agregarPalavras(tokens, [
    { rotulo: "B-PESSOA", score: 0.99 },
    { rotulo: "O", score: 0.51 },
  ]);
  eq(p2[0].rotulo, "B-PESSOA", "o de maior score vence também quando é o primeiro");
}

// ==================================================== recomposição BIO
{
  const P = (rotulo, ini, fim, score) => ({ rotulo, ini, fim, score: score == null ? 0.9 : score });
  const t = (ps) => N.entidadesDasPalavras(ps).map((e) => [e.tipo, e.ini, e.fim]);

  eq(t([P("B-PESSOA", 0, 5), P("I-PESSOA", 6, 11)]), [["PESSOA", 0, 11]], "B + I vira uma entidade");
  eq(t([P("B-PESSOA", 0, 5), P("O", 6, 8), P("B-PESSOA", 9, 14)]),
     [["PESSOA", 0, 5], ["PESSOA", 9, 14]], "O separa duas entidades");
  eq(t([P("B-PESSOA", 0, 5), P("B-PESSOA", 6, 11)]),
     [["PESSOA", 0, 5], ["PESSOA", 6, 11]], "B seguido de B abre entidade nova");
  eq(t([P("B-PESSOA", 0, 5), P("I-LOCAL", 6, 11)]),
     [["PESSOA", 0, 5], ["LOCAL", 6, 11]], "I de outro tipo fecha e abre");
  // A regra que mais importa: sequência malformada é o caso NORMAL. Descartar
  // um I-PESSOA órfão é perder uma pessoa EM SILÊNCIO.
  eq(t([P("I-PESSOA", 0, 5), P("I-PESSOA", 6, 11)]),
     [["PESSOA", 0, 11]], "I órfão ABRE entidade em vez de ser descartado");
  eq(t([P("O", 0, 1)]), [], "só O não produz entidade");
  eq(t([]), [], "lista vazia não produz entidade");
  // Entidade aberta no fim da lista é FECHADA.
  eq(t([P("O", 0, 1), P("B-PESSOA", 2, 7)]), [["PESSOA", 2, 7]], "entidade no fim é fechada");
  // O score é a média das palavras.
  const e = N.entidadesDasPalavras([P("B-PESSOA", 0, 5, 0.8), P("I-PESSOA", 6, 11, 0.6)]);
  eq(Math.round(e[0].score * 100) / 100, 0.7, "o score da entidade é a média das palavras");
  verdade(!("soma" in e[0]) && !("n" in e[0]), "os acumuladores internos não vazam no resultado");
}

// =============================================== decodificar com logits
// Monta logits sintéticos: a linha t recebe um pico no rótulo desejado.
function logitsDe(seq, nRot) {
  const L = seq.length;
  const out = new Float32Array(L * nRot);
  for (let i = 0; i < L; i++) {
    for (let k = 0; k < nRot; k++) out[i * nRot + k] = k === seq[i] ? 8 : 0;
  }
  return out;
}
{
  const janela = {
    ini: 0,
    tokens: [
      { tok: "MARIA", id: 1, ini: 0, fim: 5, sub: false },
      { tok: "veio", id: 2, ini: 6, fim: 10, sub: false },
    ],
    ids: [101, 1, 2, 102],
  };
  // [CLS]=O, MARIA=B-PESSOA(3), veio=O(0), [SEP]=O
  const lg = logitsDe([0, 3, 0, 0], 13);
  const r = N.decodificarJanela(janela, lg, ROTULOS, {});
  eq(r.length, 1, "acha uma entidade");
  eq([r[0].tipo, r[0].ini, r[0].fim], ["PESSOA", 0, 5], "…com os offsets de CARACTERE do token");
  verdade(r[0].score > 0.9, "…e score alto, vindo do softmax");
}
// Os especiais são pulados por CONSTRUÇÃO: um pico no [CLS] não vira entidade.
{
  const janela = {
    ini: 0,
    tokens: [{ tok: "x", id: 1, ini: 0, fim: 1, sub: false }],
    ids: [101, 1, 102],
  };
  const lg = logitsDe([3, 0, 3], 13); // pico no CLS e no SEP, nada no token
  eq(N.decodificarJanela(janela, lg, ROTULOS, {}).length, 0, "pico no [CLS]/[SEP] não vira entidade");
}

// ------------------------------------------------------- regra de fronteira
{
  const janela = {
    ini: 0,
    tokens: [
      { tok: "A", id: 1, ini: 0, fim: 1, sub: false },
      { tok: "B", id: 2, ini: 2, fim: 3, sub: false },
      { tok: "C", id: 3, ini: 4, fim: 5, sub: false },
    ],
    ids: [101, 1, 2, 3, 102],
  };
  const lg = logitsDe([0, 3, 0, 3, 0], 13); // A e C são PESSOA
  const semVizinha = N.decodificarJanela(janela, lg, ROTULOS, {});
  eq(semVizinha.length, 2, "sem vizinha, as duas pontas ficam");
  eq(semVizinha.some((e) => e.naBorda), false, "…e nenhuma é marcada");
  // MARCA, não descarta: quem decide é fundirJanelas, que já viu todas.
  const comEsq = N.decodificarJanela(janela, lg, ROTULOS, { temVizinhaEsq: true });
  eq(comEsq.map((e) => [e.ini, !!e.naBorda]), [[0, true], [4, false]],
     "com vizinha à ESQUERDA, a entidade da borda esquerda é MARCADA, não descartada");
  const comDir = N.decodificarJanela(janela, lg, ROTULOS, { temVizinhaDir: true });
  eq(comDir.map((e) => [e.ini, !!e.naBorda]), [[0, false], [4, true]],
     "com vizinha à DIREITA, a da borda direita é MARCADA");
}

// ------------------------------------------------------------ fundirJanelas
// A regra que a primeira versão errava: a borda só cai quando existe uma
// detecção FIRME cobrindo o mesmo trecho. Sem ela, descartar apagaria a ÚNICA
// detecção que havia — e o nome sairia inteiro, em claro.
{
  const borda = { tipo: "PESSOA", ini: 0, fim: 5, score: 0.8, naBorda: true };
  const firme = { tipo: "PESSOA", ini: 0, fim: 12, score: 0.9 };
  const r1 = N.fundirJanelas([borda, firme]);
  eq(r1.map((e) => [e.ini, e.fim]), [[0, 12]], "a truncada CAI quando há uma firme cobrindo");
  const r2 = N.fundirJanelas([borda]);
  eq(r2.map((e) => [e.ini, e.fim]), [[0, 5]], "…mas FICA quando ninguém mais a viu");
  eq(r2[0].naBorda, undefined, "a marca de trabalho não vaza para quem consome os spans");
  // Firme longe não protege: ela tem de CRUZAR a borda para justificá-la fora.
  const longe = { tipo: "PESSOA", ini: 40, fim: 50, score: 0.9 };
  eq(N.fundirJanelas([borda, longe]).length, 2, "firme que não cruza a borda não a descarta");
  // Duas bordas vizinhas e nenhuma firme: ficam as duas, e a UNIÃO é feita
  // depois, na hora de mascarar (a direção segura).
  const b2 = { tipo: "PESSOA", ini: 3, fim: 9, score: 0.7, naBorda: true };
  eq(N.fundirJanelas([borda, b2]).length, 2, "duas bordas que se cruzam ficam as duas");
}

// ==================================================================== dedup
{
  const d = N.dedup([
    { tipo: "PESSOA", ini: 0, fim: 5, score: 0.7 },
    { tipo: "PESSOA", ini: 0, fim: 5, score: 0.9 },
    { tipo: "PESSOA", ini: 8, fim: 12, score: 0.6 },
  ]);
  eq(d.length, 2, "duplicata exata some");
  eq(d[0].score, 0.9, "…e fica a de maior score");
  eq(d.map((x) => x.ini), [0, 8], "o resultado sai ordenado por posição");
}

// ================================================ ponta a ponta com motor falso
// O motor falso procura a SEQUÊNCIA DE IDS do nome-alvo em cada linha do lote e
// rotula exatamente aquelas posições. Isso exercita tokenizar -> janelar ->
// lote -> logits -> BIO -> offsets, e o que se confere no fim é o intervalo de
// CARACTERE no texto original.
function motorFalso(idsAlvo, nRot) {
  return async (tensores) => {
    const [B, L] = tensores.dims;
    const out = new Float32Array(B * L * nRot);
    for (let b = 0; b < B; b++) {
      const linha = [];
      for (let i = 0; i < L; i++) linha.push(Number(tensores.ids[b * L + i]));
      for (let i = 0; i + idsAlvo.length <= L; i++) {
        let bate = true;
        for (let k = 0; k < idsAlvo.length; k++) if (linha[i + k] !== idsAlvo[k]) { bate = false; break; }
        if (!bate) continue;
        for (let k = 0; k < idsAlvo.length; k++) {
          const rot = k === 0 ? 3 : 4; // B-PESSOA / I-PESSOA
          out[(b * L + i + k) * nRot + rot] = 9;
        }
      }
    }
    return out;
  };
}

{
  const NOME = "MARIA DA SILVA";
  const idsAlvo = T.tokenizar(NOME, vocab).map((t) => t.id);
  const texto = T.paraCanonico("Compareceu " + NOME + " para a audiência de hoje.");
  const r = await N.correr(texto, vocab, motorFalso(idsAlvo, 13), {
    tokenizador: T,
    rotulos: ROTULOS,
    padId: 0,
  });
  eq(r.length, 1, "acha o nome uma vez");
  eq(texto.slice(r[0].ini, r[0].fim), NOME, "e o intervalo aponta EXATAMENTE para o nome no texto original");
  eq(r[0].tipo, "PESSOA", "com o tipo certo");
}

// Texto LONGO, várias janelas, e o nome ATRAVESSANDO a fronteira entre elas.
// É o caso que a sobreposição existe para resolver: sem ela, o nome sai pela
// metade ou some.
{
  const NOME = "ELIONEUDO EVARISTO";
  const idsAlvo = T.tokenizar(NOME, vocab).map((t) => t.id);
  const enchimento = "palavra ".repeat(400);
  // Posiciona o nome perto do fim da primeira janela útil (384 tokens).
  const texto = T.paraCanonico(enchimento + NOME + " " + enchimento);
  const toks = T.tokenizar(texto, vocab);
  const js = T.janelas(toks, vocab, {});
  verdade(js.length >= 2, `o texto gera várias janelas (${js.length})`);
  const r = await N.correr(texto, vocab, motorFalso(idsAlvo, 13), {
    tokenizador: T,
    rotulos: ROTULOS,
    padId: 0,
    uteis: 384,
    over: 64,
  });
  eq(r.length, 1, "o nome é achado UMA vez, mesmo aparecendo em duas janelas");
  eq(texto.slice(r[0].ini, r[0].fim), NOME, "…e inteiro, não truncado pela fronteira");
}

// Lote: o resultado não pode depender do tamanho da batelada.
{
  const NOME = "JOAQUIM BARBOSA";
  const idsAlvo = T.tokenizar(NOME, vocab).map((t) => t.id);
  const texto = T.paraCanonico(("blá ".repeat(300)) + NOME + (" blá".repeat(300)));
  const a = await N.correr(texto, vocab, motorFalso(idsAlvo, 13), { tokenizador: T, rotulos: ROTULOS, tamLote: 1 });
  const b = await N.correr(texto, vocab, motorFalso(idsAlvo, 13), { tokenizador: T, rotulos: ROTULOS, tamLote: 8 });
  eq(a, b, "lote de 1 e lote de 8 dão o MESMO resultado (o padding não contamina)");
  eq(a.length, 1, "…e é uma entidade só");
}

// Texto vazio e sem entidade.
{
  const vazio = await N.correr("", vocab, motorFalso([999999], 13), { tokenizador: T, rotulos: ROTULOS });
  eq(vazio, [], "texto vazio devolve lista vazia");
  const nada = await N.correr("nada aqui", vocab, motorFalso([999999], 13), { tokenizador: T, rotulos: ROTULOS });
  eq(nada, [], "texto sem entidade devolve lista vazia");
}

// Cancelamento entre bateladas.
{
  const NOME = "MARIA";
  const idsAlvo = T.tokenizar(NOME, vocab).map((t) => t.id);
  const texto = T.paraCanonico(("blá ".repeat(2000)) + NOME);
  let chamadas = 0;
  const r = await N.correr(texto, vocab, (t) => { chamadas++; return motorFalso(idsAlvo, 13)(t); }, {
    tokenizador: T,
    rotulos: ROTULOS,
    tamLote: 1,
    cancelado: () => chamadas >= 2,
  });
  eq(chamadas, 2, "o cancelamento para o laço entre bateladas");
  verdade(Array.isArray(r), "…e devolve o que já achou, em vez de lançar");
}

// -------------------------------------------------------------------- relatório
console.log(`\n${ok} asserções passaram`);
if (falhas.length) {
  console.log(`\n${falhas.length} FALHAS:\n`);
  for (const f of falhas) console.log("  - " + f);
  process.exit(1);
}
console.log("tudo verde");
