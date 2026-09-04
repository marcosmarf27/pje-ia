// DUAS ABAS NO MESMO PROCESSO, com o modo sigiloso ligado.
//
// O defeito que este teste fixa: `mapaSigilo` e uma variavel por ABA, hidratada
// UMA vez no boot, e `salvarCaso` grava o campo `sigilo` inteiro com spread
// raso -- last-write-wins. Duas abas partem do mesmo mapa, as duas dao o
// proximo numero a pessoas DIFERENTES, e a segunda gravacao apaga a primeira.
// O texto ja saiu com o rotulo; o mapa no disco passa a devolver outro nome.
// E a mesma familia do defeito em que `hidratar` renumerava -- e o preco e o
// mesmo: um nome trocado numa minuta que vai ao PJe assinada.
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const require = createRequire(import.meta.url);
const PSEUD = require(__RAIZ + "/src/pseudonimos.js");

let n = 0, mau = 0;
const ok = (c, nome, extra) => {
  n++;
  if (!c) { mau++; console.log("  FALHOU: " + nome + (extra === undefined ? "" : " " + JSON.stringify(extra))); }
};
console.log("=== duas abas no mesmo processo: o mapa de pseudonimos ===");

const base = { processo: "p1", itens: [] };
{
  const m = PSEUD.hidratar(base);
  m.rotular("PESSOA", "JOAO DA SILVA");
  base.itens = m.serializar().itens;
}
ok(base.itens.length === 1 && base.itens[0].n === 1, "o mapa base tem Joao como PESSOA_1");

// ---------------------------------------------------------------- a corrida
// As duas abas hidratam o MESMO mapa e cada uma acha uma pessoa nova.
const abaA = PSEUD.hidratar(base);
const abaB = PSEUD.hidratar(base);
const rotA = abaA.rotular("PESSOA", "MARIA DE SOUZA");
const rotB = abaB.rotular("PESSOA", "PEDRO ALVES");
ok(rotA === "[PESSOA_2]", "aba A da o 2 para Maria", rotA);
ok(rotB === "[PESSOA_2]", "aba B da o MESMO 2 para Pedro -- e a colisao", rotB);

// A grava primeiro (e o texto dela ja saiu com [PESSOA_2] = Maria).
const gravadoPorA = abaA.serializar();

// B funde ANTES de gravar, que e o conserto.
const f = PSEUD.fundir(gravadoPorA, abaB.serializar());
ok(f.renumerados.length === 1, "a fusao reporta UMA renumeracao", f.renumerados);
// Acesso defensivo porque a asserção acima pode ter falhado: um teste que
// MORRE no meio deixa de exercitar o resto, e foi o que aconteceu ao mutar
// `absorver` -- uma falha aparecia onde havia quatro. Isto não mascara nada:
// `undefined !== "[PESSOA_2]"` continua sendo uma falha.
const r0 = f.renumerados[0] || {};
ok(r0.de === "[PESSOA_2]" && r0.para === "[PESSOA_3]",
  "Pedro sai do 2 (ocupado por Maria) e vai para o 3", r0);
ok(f.mapa.paraValor("[PESSOA_2]") === "MARIA DE SOUZA",
  "o 2 continua sendo de Maria -- o rotulo que JA SAIU nao muda de dono",
  f.mapa.paraValor("[PESSOA_2]"));
ok(f.mapa.paraValor("[PESSOA_3]") === "PEDRO ALVES", "Pedro resolve pelo 3");
ok(f.mapa.paraValor("[PESSOA_1]") === "JOAO DA SILVA", "Joao segue no 1");
ok(f.mapa.quantos() === 3, "ninguem se perdeu na fusao", f.mapa.quantos());

// ------------------------------------------------- as duas acharam a MESMA
{
  const a = PSEUD.hidratar(base), b = PSEUD.hidratar(base);
  a.rotular("PESSOA", "MARIA DE SOUZA");
  b.rotular("PESSOA", "MARIA DE SOUZA");
  const g = PSEUD.fundir(a.serializar(), b.serializar());
  ok(g.renumerados.length === 0, "mesma pessoa nas duas abas: nada a renumerar", g.renumerados);
  ok(g.mapa.quantos() === 2, "e nada duplicado", g.mapa.quantos());
}

// ------------------------------------------------ variantes do mesmo nome
// A canonicalizacao vale na fusao como vale no `rotular`: uma aba viu a forma
// curta e a outra a longa, e as duas sao a mesma parte.
{
  const a = PSEUD.hidratar(base), b = PSEUD.hidratar(base);
  a.rotular("ORGANIZACAO", "BANCO BRADESCO");
  b.rotular("ORGANIZACAO", "Banco Bradesco S.A.");
  const g = PSEUD.fundir(a.serializar(), b.serializar());
  ok(g.renumerados.length === 0, "variante do mesmo nome nao renumera", g.renumerados);
  const formas = g.mapa.proibidos().filter((x) => x.rotulo === "[ORGANIZACAO_1]").map((x) => x.valor);
  ok(formas.includes("BANCO BRADESCO") && formas.includes("Banco Bradesco S.A."),
    "as DUAS formas vao para a guarda -- ela procura literais", formas);
}

// --------------------------------------------------------- o liberado manda
// Liberar e decisao do usuario, e a uniao preserva as duas abas.
{
  const a = PSEUD.hidratar(base), b = PSEUD.hidratar(base);
  a.rotular("ORGANIZACAO", "MINISTERIO PUBLICO ESTADUAL");
  a.liberar("[ORGANIZACAO_1]");
  b.rotular("ORGANIZACAO", "MINISTERIO PUBLICO ESTADUAL");
  const g = PSEUD.fundir(a.serializar(), b.serializar());
  const proib = g.mapa.proibidos().map((x) => x.valor);
  ok(!proib.includes("MINISTERIO PUBLICO ESTADUAL"),
    "o que uma aba liberou continua liberado depois da fusao", proib);
}

// ------------------------------------------------------- NAO-REGRESSAO
// Fundir com o disco VAZIO tem de dar exatamente o que `hidratar` ja dava --
// e' o caminho de 100% das sessoes de uma aba so.
{
  const local = PSEUD.hidratar(base);
  local.rotular("PESSOA", "ANA LIMA");
  local.rotular("CPF", "123.456.789-09");
  const so = local.serializar();
  const g = PSEUD.fundir({ processo: "p1", itens: [] }, so);
  ok(g.renumerados.length === 0, "disco vazio nao renumera nada");
  ok(JSON.stringify(g.mapa.serializar()) === JSON.stringify(so),
    "e o mapa sai byte a byte igual ao local");
}
{
  const g = PSEUD.fundir(base, { processo: "p1", itens: [] });
  ok(JSON.stringify(g.mapa.serializar().itens) === JSON.stringify(base.itens),
    "local vazio devolve o gravado intacto");
}

// -------------------------------------- numeracao ESPARSA nao vira colisao
// Um item apagado deixa buraco ({1,3}); o buraco e' numero LIVRE, e usa-lo e'
// correto. O que nao pode e reusar numero OCUPADO.
{
  const esparso = { processo: "p1", itens: [
    { tipo: "PESSOA", n: 1, valor: "UM", liberado: false, formas: [] },
    { tipo: "PESSOA", n: 3, valor: "TRES", liberado: false, formas: [] },
  ] };
  const local = { processo: "p1", itens: [
    { tipo: "PESSOA", n: 2, valor: "DOIS", liberado: false, formas: [] },
  ] };
  const g = PSEUD.fundir(esparso, local);
  ok(g.renumerados.length === 0, "numero livre no buraco e aproveitado");
  ok(g.mapa.paraValor("[PESSOA_2]") === "DOIS" && g.mapa.paraValor("[PESSOA_3]") === "TRES",
    "e nada se desloca");
}


// ==========================================================================
// O COMPARE-AND-SWAP no banco do worker, com um IndexedDB de verdade.
//
// A fusão acima é o algoritmo; isto é a ATOMICIDADE. Sem ela, as duas abas
// leem o mesmo estado, as duas fundem contra ele e a segunda gravação apaga a
// primeira do mesmo jeito -- a fusão sozinha só encurtaria a janela.
// ==========================================================================
await import("fake-indexeddb/auto");
const DB = await import(new URL("../src/casodb.js", import.meta.url).href);

const CH = "pje.tjce.jus.br|1|4242";

// rev 0 -> 1: a primeira gravação de um caso novo.
{
  const r = await DB.salvarCaso(CH, { sigilo: { ligado: true, mapa: { itens: [] }, rev: 1 } }, 0);
  ok(!r.conflitoSigilo, "base 0 num caso novo grava sem conflito");
  const c = await DB.lerCaso(CH);
  ok(c && c.sigilo && c.sigilo.rev === 1, "e a revisão foi para 1", c && c.sigilo && c.sigilo.rev);
}

// A aba B ainda acha que a revisão é 0. A gravação dela É RECUSADA.
{
  const r = await DB.salvarCaso(
    CH,
    { sigilo: { ligado: true, mapa: { itens: [{ tipo: "PESSOA", n: 9, valor: "DA ABA B" }] }, rev: 1 } },
    0
  );
  ok(r.conflitoSigilo, "base velha é recusada -- é isto que impede o apagão");
  ok(r.sigilo && r.sigilo.rev === 1, "e a resposta traz o que está no disco, para fundir", r.sigilo && r.sigilo.rev);
  const c = await DB.lerCaso(CH);
  ok(!JSON.stringify(c.sigilo.mapa).includes("DA ABA B"), "o mapa da aba B NÃO entrou por cima");
}

// O RESTO do patch passa mesmo com o sigilo recusado: perder o download de uma
// peça por causa de um conflito de mapa seria trocar um problema por outro.
{
  const r = await DB.salvarCaso(
    CH,
    { sigilo: { ligado: true, mapa: { itens: [] }, rev: 1 }, ficha: { classe: "Execução Penal" } },
    0
  );
  ok(r.conflitoSigilo, "conflito no sigilo");
  const c = await DB.lerCaso(CH);
  ok(c.ficha && c.ficha.classe === "Execução Penal", "e a ficha (aditiva) foi gravada assim mesmo");
}

// Com a base CERTA, a aba B grava.
{
  const r = await DB.salvarCaso(CH, { sigilo: { ligado: true, mapa: { itens: [] }, rev: 2 } }, 1);
  ok(!r.conflitoSigilo, "com a base atualizada, grava");
  const c = await DB.lerCaso(CH);
  ok(c.sigilo.rev === 2, "revisão 2");
}

// NÃO-REGRESSÃO: sem `baseSigilo`, o comportamento é o de sempre
// (last-write-wins), que é o certo para os campos aditivos e para todo chamador
// que não é o mapa de sigilo.
{
  const r = await DB.salvarCaso(CH, { sigilo: { ligado: false, mapa: { itens: [] }, rev: 99 } });
  ok(!r.conflitoSigilo, "sem baseSigilo não há conflito a detectar");
  const c = await DB.lerCaso(CH);
  ok(c.sigilo.rev === 99, "e grava por cima, como antes desta mudança", c.sigilo.rev);
}
{
  const r = await DB.salvarCaso(CH, { pecas: { "1": { titulo: "x" } } }, undefined);
  ok(!r.conflitoSigilo, "patch sem sigilo nunca conflita");
}

// ==========================================================================
// A reescrita dos rótulos no texto já mascarado, extraída do content.js REAL.
// Cadeia 2->3 e 3->4 numa passada só: duas passadas fariam a segunda pegar o
// que a primeira acabou de escrever.
// ==========================================================================
{
  const fonte = fs.readFileSync(__RAIZ + "/src/content.js", "utf8");
  const i = fonte.indexOf("function reescreverRotulos(");
  ok(i > 0, "achei reescreverRotulos no content.js");
  let nivel = 0, fim = i;
  for (let k = fonte.indexOf("{", i); k < fonte.length; k++) {
    if (fonte[k] === "{") nivel++;
    else if (fonte[k] === "}") { nivel--; if (!nivel) { fim = k + 1; break; } }
  }
  const fn = new Function("return (" + fonte.slice(i, fim) + ")")();
  const de = new Map([["[PESSOA_2]", "[PESSOA_3]"], ["[PESSOA_3]", "[PESSOA_4]"]]);
  ok(
    fn("réu [PESSOA_2] e testemunha [PESSOA_3], CPF [CPF_1]", de) ===
      "réu [PESSOA_3] e testemunha [PESSOA_4], CPF [CPF_1]",
    "a cadeia é reescrita numa passada, e o que não mudou fica"
  );
  ok(fn("nada aqui", de) === "nada aqui", "texto sem rótulo passa intacto");
}

console.log("  " + n + "/" + n + " asserções" + (mau ? " (" + mau + " FALHARAM)" : ""));
process.exit(mau ? 1 : 0);
