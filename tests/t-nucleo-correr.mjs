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

let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };

console.log("=== ner-nucleo: correr() com motor falso ===");
const vocab = T.lerVocabulario(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/vocab.txt", "utf8"));
const cfg = JSON.parse(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/config.json", "utf8"));
const rotulos = N.rotulosDe(cfg.id2label);
const iB = rotulos.indexOf("B-PESSOA"), iI = rotulos.indexOf("I-PESSOA"), iO = 0;
// Motor falso: rotula PESSOA onde a SEQUENCIA DE IDS do nome aparecer na janela.
// Casar por texto de token nao serve -- "ELIONEUDO EVARISTO" vira ["E","##L","##IO",
// "##N","##E","##U","##DO","E","##VA",...], e o "E" sozinho aparece no texto inteiro.
// A sequencia de ids e deterministica e imita o que um modelo de fato reconhece.
function fazMotor(nome, lotes) {
  const alvo = T.tokenizar(nome, vocab).map((t) => t.id);
  return async (tens) => {
    const [B, L] = tens.dims;
    lotes.push(B);
    const out = new Float32Array(B * L * rotulos.length);
    for (let b = 0; b < B; b++) {
      const linha = [];
      for (let i = 0; i < L; i++) linha.push(Number(tens.ids[b * L + i]));
      const marca = new Array(L).fill(0);   // 0=O, 1=B, 2=I
      for (let i = 0; i + alvo.length <= L; i++) {
        let bate = true;
        for (let k = 0; k < alvo.length; k++) if (linha[i + k] !== alvo[k]) { bate = false; break; }
        if (!bate) continue;
        if (tens.mask[b * L + i] !== 1n) continue;
        marca[i] = 1;
        for (let k = 1; k < alvo.length; k++) marca[i + k] = 2;
      }
      for (let i = 0; i < L; i++) {
        const escolhido = marca[i] === 1 ? iB : marca[i] === 2 ? iI : iO;
        out[((b * L + i) * rotulos.length) + escolhido] = 8;  // logit alto na classe escolhida
      }
    }
    return out;
  };
}

// --- OFFSET GLOBAL: o recorte pelos offsets tem de devolver o nome
{
  const texto =
    "Trata-se de acao penal em que figura como reu ELIONEUDO EVARISTO, qualificado nos autos. " +
    "A denuncia narra que no dia dos fatos o acusado teria praticado a conduta descrita. " +
    "Em audiencia, a testemunha confirmou a versao. Ao fim, ELIONEUDO EVARISTO foi ouvido. " +
    "O Ministerio Publico requereu a condenacao nos termos da denuncia oferecida em juizo. " +
    "A defesa, por sua vez, pediu a absolvicao por insuficiencia de provas nos autos.";
  const lotes = [];
  const spans = await N.correr(texto, vocab, fazMotor("ELIONEUDO EVARISTO", lotes), {
    tokenizador: T, rotulos, uteis: 24, over: 16, tamLote: 2,
  });
  const toks = T.tokenizar(texto, vocab);
  const jan = T.janelas(toks, vocab, { uteis: 24, over: 16 });
  ok(jan.length > 3, "o texto gerou varias janelas (o caso que importa)", jan.length);
  const recortes = spans.map((s) => texto.slice(s.ini, s.fim));
  ok(spans.length === 2, "achou as DUAS ocorrencias, sem duplicar entre janelas", recortes);
  ok(recortes.every((r) => r === "ELIONEUDO EVARISTO"), "o recorte pelo offset devolve o nome INTEIRO", recortes);
  ok(spans.every((s) => s.tipo === "PESSOA"), "tipo correto");
  ok(spans[0].ini < spans[1].ini, "vem em ordem de leitura");
}

// --- o mesmo nome visto por DUAS janelas sobrepostas continua UM span
{
  const miolo = "palavra ".repeat(30);
  const texto = miolo + "MARIA SILVA " + miolo;
  const spans = await N.correr(texto, vocab, fazMotor("MARIA SILVA", []), {
    tokenizador: T, rotulos, uteis: 20, over: 10, tamLote: 4,
  });
  ok(spans.length === 1, "um span so, apesar da sobreposicao das janelas",
     spans.map((s) => texto.slice(s.ini, s.fim)));
  ok(texto.slice(spans[0].ini, spans[0].fim) === "MARIA SILVA", "nome inteiro",
     spans.length ? texto.slice(spans[0].ini, spans[0].fim) : null);
}

// --- CANCELAMENTO no meio: devolve o parcial, sem lancar
{
  const texto = "palavra ".repeat(400) + "MARIA";
  const lotes = [];
  let chamadas = 0;
  const spans = await N.correr(texto, vocab, fazMotor("MARIA", lotes), {
    tokenizador: T, rotulos, uteis: 24, over: 8, tamLote: 2,
    cancelado: () => ++chamadas >= 2,
  });
  ok(lotes.length === 2, "parou depois do 2o lote", lotes.length);
  ok(Array.isArray(spans), "devolve array em vez de lancar", spans.length);
}

// --- progresso
{
  const passos = [];
  await N.correr("palavra ".repeat(120), vocab, fazMotor("ZZZINEXISTENTE", []), {
    tokenizador: T, rotulos, uteis: 24, over: 8, tamLote: 2,
    aoAndar: (f, t) => passos.push([f, t]),
  });
  ok(passos.length > 0, "aoAndar foi chamado", passos);
  ok(passos[passos.length - 1][0] === passos[passos.length - 1][1], "termina em N/N", passos[passos.length - 1]);
}

// --- texto vazio nao quebra
{
  const spans = await N.correr("", vocab, fazMotor("ZZZINEXISTENTE", []), { tokenizador: T, rotulos });
  ok(spans.length === 0, "texto vazio devolve []", spans);
}


// --- INVARIANTE DA SOBREPOSICAO: ela tem de ser MAIOR que a entidade.
// Este teste PASSA POR FALHAR: com over menor que o nome, a deteccao some por
// completo -- nenhuma janela ve o nome inteiro, e a regra `naBorda` do
// ner-nucleo nao salva, porque nao ha o que marcar. Existe para que ninguem
// baixe JANELA_OVER "para economizar inferencia" sem ver o preco.
{
  const texto =
    "Trata-se de acao penal em que figura como reu ELIONEUDO EVARISTO, qualificado nos autos. " +
    "A denuncia narra que no dia dos fatos o acusado teria praticado a conduta descrita.";
  const nToks = T.tokenizar("ELIONEUDO EVARISTO", vocab).length;
  ok(nToks === 12, "o nome tem 12 tokens (WordPiece parte nome proprio em letras)", nToks);

  const curto = await N.correr(texto, vocab, fazMotor("ELIONEUDO EVARISTO", []), {
    tokenizador: T, rotulos, uteis: 24, over: 8, tamLote: 2,
  });
  ok(curto.length === 0, "over(8) < entidade(12): a deteccao SOME -- e este e o ponto",
     curto.map((x) => texto.slice(x.ini, x.fim)));

  const folgado = await N.correr(texto, vocab, fazMotor("ELIONEUDO EVARISTO", []), {
    tokenizador: T, rotulos, uteis: 24, over: 16, tamLote: 2,
  });
  ok(folgado.length === 1, "over(16) > entidade(12): acha", folgado.length);
  ok(T.JANELA_OVER > nToks * 4, "o padrao do arquivo (64) tem folga larga sobre um nome composto",
     T.JANELA_OVER);
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
