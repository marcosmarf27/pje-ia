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

console.log("=== ner-nucleo ===");

// --- id2label com CHAVES STRING E FORA DE ORDEM (o caso do config.json real)
{
  const r = N.rotulosDe({ "0": "O", "10": "I-LEGISLACAO", "2": "I-ORGANIZACAO", "1": "B-ORGANIZACAO" });
  ok(r[10] === "I-LEGISLACAO" && r[2] === "I-ORGANIZACAO" && r[1] === "B-ORGANIZACAO",
     "le por INDICE, nao por posicao do array", r);
  ok(r[3] === "O" && r[9] === "O", "buraco vira O, nao undefined", r);
}
{
  const cfg = JSON.parse(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/config.json", "utf8"));
  const r = N.rotulosDe(cfg.id2label);
  ok(r.length === 13 && r[0] === "O" && r[12] === "I-JURISPRUDENCIA", "config REAL do modelo", r);
}

// --- softmax nao estoura em logit alto
{
  const p = N._softmaxLinha([1000, 1001, 999], 0, 3);
  ok(p.every((x) => Number.isFinite(x)), "sem NaN com logits altos", p);
  ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9, "soma 1");
}

// --- BIO malformado: I- SEM B- antes ABRE, nunca descarta
{
  const e = N.entidadesDasPalavras([
    { ini: 0, fim: 4, rotulo: "I-PESSOA", score: 0.9 },
    { ini: 5, fim: 10, rotulo: "I-PESSOA", score: 0.8 },
  ]);
  ok(e.length === 1 && e[0].tipo === "PESSOA" && e[0].ini === 0 && e[0].fim === 10,
     "I- sem B- abre a entidade (nao perde a pessoa)", e);
}
{
  const e = N.entidadesDasPalavras([
    { ini: 0, fim: 4, rotulo: "B-PESSOA", score: 0.9 },
    { ini: 5, fim: 9, rotulo: "I-LOCAL", score: 0.8 },
  ]);
  ok(e.length === 2 && e[0].tipo === "PESSOA" && e[1].tipo === "LOCAL", "I-Y com X aberto fecha X e abre Y", e);
}
{
  const e = N.entidadesDasPalavras([
    { ini: 0, fim: 4, rotulo: "B-PESSOA", score: 0.9 },
    { ini: 5, fim: 9, rotulo: "B-PESSOA", score: 0.8 },
  ]);
  ok(e.length === 2, "B- fecha o anterior e abre outro (duas pessoas vizinhas)", e);
}

// --- agregacao por PALAVRA: "O so vence quando TODOS dizem O"
{
  const toks = [{ ini: 0, fim: 2, sub: false }, { ini: 2, fim: 5, sub: true }];
  const p = N.agregarPalavras(toks, [
    { rotulo: "B-PESSOA", score: 0.70 },
    { rotulo: "O", score: 0.80 },          // O com score MAIOR
  ]);
  ok(p.length === 1 && p[0].rotulo === "B-PESSOA", "O com score maior NAO apaga a pessoa", p);
  ok(p[0].ini === 0 && p[0].fim === 5, "palavra cobre os dois subtokens", p);
}
{
  const toks = [{ ini: 0, fim: 2, sub: false }, { ini: 2, fim: 5, sub: true }];
  const p = N.agregarPalavras(toks, [{ rotulo: "O", score: 0.9 }, { rotulo: "O", score: 0.6 }]);
  ok(p[0].rotulo === "O", "todos O -> O");
}
{
  const toks = [{ ini: 0, fim: 2, sub: false }, { ini: 2, fim: 5, sub: true }];
  const p = N.agregarPalavras(toks, [
    { rotulo: "B-PESSOA", score: 0.60 }, { rotulo: "B-LOCAL", score: 0.90 },
  ]);
  ok(p[0].rotulo === "B-LOCAL", "entre sensiveis, vence o MAIOR score", p);
}

// --- montarLote: padding ao maior, padId respeitado, mask zerada no padding
{
  const j = [{ ids: [1, 2, 3] }, { ids: [4, 5] }];
  const L = N.montarLote(j, { padId: 7 });
  ok(L.dims[0] === 2 && L.dims[1] === 3, "padding ao MAIOR da batelada, nao 512", L.dims);
  ok(L.ids[5] === 7n, "usa o padId dado, nao 0 hardcoded", String(L.ids[5]));
  ok(L.mask[5] === 0n && L.mask[4] === 1n, "mask zerada so no padding");
  ok(Array.from(L.tipos).every((x) => x === 0n), "token_type_ids todo zero");
  ok(L.ids instanceof BigInt64Array, "int64 em BigInt64Array (o ORT exige)");
}

// --- FRONTEIRA: marca, nao descarta
{
  const firme = { tipo: "PESSOA", ini: 10, fim: 20, score: 0.9 };
  const borda = { tipo: "PESSOA", ini: 15, fim: 20, score: 0.8, naBorda: true };
  const r = N.fundirJanelas([firme, borda]);
  ok(r.length === 1 && r[0].ini === 10 && r[0].fim === 20, "borda CAI quando ha firme cruzando", r);
  ok(r[0].naBorda === undefined, "a marca interna nao vaza para quem consome", r[0]);
}
{
  // o caso que a v1 errava: SO a borda viu o nome
  const borda = { tipo: "PESSOA", ini: 15, fim: 25, score: 0.8, naBorda: true };
  const outra = { tipo: "PESSOA", ini: 90, fim: 99, score: 0.9 };
  const r = N.fundirJanelas([borda, outra]);
  ok(r.length === 2, "borda SOBREVIVE quando nenhuma firme a cobre", r);
  ok(r.some((s) => s.ini === 15 && s.fim === 25), "a deteccao unica nao foi apagada", r);
}
{
  // duas bordas que se cruzam e nenhuma firme: ficam as duas (a uniao e do pseudonimos)
  const r = N.fundirJanelas([
    { tipo: "PESSOA", ini: 0, fim: 10, score: 0.7, naBorda: true },
    { tipo: "PESSOA", ini: 6, fim: 16, score: 0.7, naBorda: true },
  ]);
  ok(r.length === 2, "duas bordas cruzadas sem firme ficam as duas", r);
}
{
  const r = N.dedup([
    { tipo: "PESSOA", ini: 1, fim: 5, score: 0.5 },
    { tipo: "PESSOA", ini: 1, fim: 5, score: 0.9 },
  ]);
  ok(r.length === 1 && r[0].score === 0.9, "duplicata exata: fica a de maior score", r);
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
