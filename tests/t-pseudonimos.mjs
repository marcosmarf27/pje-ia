import { createRequire } from "node:module";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const require = createRequire(import.meta.url);
const P = require(__RAIZ + "/src/pseudonimos.js");

let n = 0, mau = 0;
const ok = (cond, nome, extra) => { n++; if (!cond) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };
const lanca = (fn, nome) => { n++; try { fn(); mau++; console.log("  FALHOU (devia lancar):", nome); } catch { /* esperado */ } };

console.log("=== pseudonimos ===");

// --- normalizacao: e a MESMA que a trava usa, e a ligadura e o caso caro
ok(P.normalizar("JOSÉ") === P.normalizar("josé"), "caixa nao importa");
ok(P.normalizar("José") === P.normalizar("Jose"), "acento nao importa");
ok(P.normalizar("\ufb01lipe") === "filipe", "ligadura ﬁ decompoe (NFKD)", P.normalizar("\ufb01lipe"));
ok(P.normalizar("a   b") === "a b", "espaco colapsa");

// --- DUAS PASSADAS: numerar em ordem de LEITURA, substituir de TRAS PARA FRENTE
{
  const t = "Reu: JOAO. Autor: MARIA.";
  const m = P.criarMapa("p1");
  // ocorrencias em ordem INVERTIDA de proposito: a ordem do array nao pode mandar
  const out = P.mascarar(t, [
    { tipo: "PESSOA", ini: t.indexOf("MARIA"), fim: t.indexOf("MARIA") + 5 },
    { tipo: "PESSOA", ini: t.indexOf("JOAO"), fim: t.indexOf("JOAO") + 4 },
  ], m);
  ok(out === "Reu: [PESSOA_1]. Autor: [PESSOA_2].", "numeracao segue a LEITURA, nao o array", out);
  ok(m.paraValor("PESSOA_1") === "JOAO", "PESSOA_1 e o primeiro do texto");
}

// --- entidades COLADAS: o caso que pegou o bug do irmao
{
  const t = "JOAOMARIA";
  const m = P.criarMapa("p1");
  const out = P.mascarar(t, [
    { tipo: "PESSOA", ini: 0, fim: 4 },
    { tipo: "PESSOA", ini: 4, fim: 9 },
  ], m);
  ok(out === "[PESSOA_1][PESSOA_2]", "entidades coladas nao se corrompem", out);
}

// --- mesmo valor em caixas diferentes = MESMO rotulo
{
  const t = "JOSE falou. Jose assinou.";
  const m = P.criarMapa("p1");
  const out = P.mascarar(t, [
    { tipo: "PESSOA", ini: 0, fim: 4 },
    { tipo: "PESSOA", ini: t.indexOf("Jose assinou"), fim: t.indexOf("Jose assinou") + 4 },
  ], m);
  ok(out === "[PESSOA_1] falou. [PESSOA_1] assinou.", "mesma pessoa, mesmo rotulo", out);
  ok(m.quantos() === 1, "conta UMA pessoa");
}

// --- sobreposicao vira UNIAO, e nao descobre texto
{
  const r = P._resolverSobreposicao([
    { tipo: "A", ini: 0, fim: 10, score: 0.5 },
    { tipo: "B", ini: 6, fim: 20, score: 0.9 },
  ]);
  ok(r.length === 1 && r[0].ini === 0 && r[0].fim === 20, "uniao cobre os dois", r);
}
{
  // TRES encadeados: a uniao tem de varrer 0..12
  const r = P._resolverSobreposicao([
    { tipo: "A", ini: 0, fim: 5 }, { tipo: "B", ini: 3, fim: 8 }, { tipo: "C", ini: 7, fim: 12 },
  ]);
  ok(r.length === 1 && r[0].ini === 0 && r[0].fim === 12, "tres encadeados viram UM intervalo 0..12", r);
}

// --- offset invalido LANCA (falha fechada)
lanca(() => P.mascarar("abc", [{ tipo: "PESSOA", ini: 2, fim: 1 }], P.criarMapa()), "fim <= ini");
lanca(() => P.mascarar("abc", [{ tipo: "PESSOA", ini: 0, fim: 99 }], P.criarMapa()), "fim > tamanho");
lanca(() => P.mascarar("abc", [{ tipo: "PESSOA", ini: -1, fim: 2 }], P.criarMapa()), "ini negativo");

// --- reidentificar
{
  const m = P.criarMapa("p1");
  m.rotular("PESSOA", "MARIA DA SILVA");
  const r = P.reidentificar("Intime-se [PESSOA_1] e [PESSOA_9].", m);
  ok(r.texto === "Intime-se MARIA DA SILVA e [PESSOA_9].", "desconhecido fica como esta", r.texto);
  ok(r.trocados === 1 && r.desconhecidos === 1, "conta trocados e desconhecidos", r);
}
{
  const m = P.criarMapa("p1");
  for (let i = 1; i <= 12; i++) m.rotular("PESSOA", "Pessoa numero " + i);
  const r = P.reidentificar("[PESSOA_12]", m);
  ok(r.texto === "Pessoa numero 12", "numero de dois digitos casa", r.texto);
}

// --- hidratar preserva a numeracao (o que a reidentificacao depende)
{
  const m = P.criarMapa("p1");
  m.rotular("PESSOA", "ANA"); m.rotular("PESSOA", "BRUNO"); m.rotular("CPF", "111");
  const bruto = m.serializar();
  const h = P.hidratar(bruto);
  ok(h.paraValor("PESSOA_1") === "ANA" && h.paraValor("PESSOA_2") === "BRUNO", "densa: preserva");
  ok(h.paraValor("CPF_1") === "111", "outro tipo preserva");
}
{
  // FORA DE ORDEM no arquivo
  const h = P.hidratar({ processo: "p1", itens: [
    { rotulo: "[PESSOA_2]", tipo: "PESSOA", n: 2, valor: "BRUNO" },
    { rotulo: "[PESSOA_1]", tipo: "PESSOA", n: 1, valor: "ANA" },
  ] });
  ok(h.paraValor("PESSOA_1") === "ANA" && h.paraValor("PESSOA_2") === "BRUNO", "fora de ordem: preserva",
     [h.paraValor("PESSOA_1"), h.paraValor("PESSOA_2")]);
}
{
  // COM LACUNA (n: 1 e 3) -- o comentario diz "desde que ela seja densa"
  const h = P.hidratar({ processo: "p1", itens: [
    { rotulo: "[PESSOA_1]", tipo: "PESSOA", n: 1, valor: "ANA" },
    { rotulo: "[PESSOA_3]", tipo: "PESSOA", n: 3, valor: "CARLA" },
  ] });
  ok(h.paraValor("PESSOA_3") === "CARLA", "com LACUNA: PESSOA_3 continua sendo CARLA",
     { p1: h.paraValor("PESSOA_1"), p2: h.paraValor("PESSOA_2"), p3: h.paraValor("PESSOA_3") });
}

// --- conferir: pos-condicao por peca
{
  const m = P.criarMapa("p1");
  m.rotular("PESSOA", "MARIA DA SILVA");
  ok(P.conferir("Intime-se [PESSOA_1].", m).ok === true, "mascarado passa");
  ok(P.conferir("Intime-se MARIA DA SILVA.", m).ok === false, "nome cru e pego");
  ok(P.conferir("Intime-se maria da silva.", m).ok === false, "caixa diferente e pega");
}


// --- REGRESSAO: hidratar preserva o n, e a numeracao seguinte nao COLIDE
{
  const h = P.hidratar({ processo: "p1", itens: [
    { rotulo: "[PESSOA_1]", tipo: "PESSOA", n: 1, valor: "ANA" },
    { rotulo: "[PESSOA_3]", tipo: "PESSOA", n: 3, valor: "CARLA" },
  ] });
  ok(h.paraValor("PESSOA_2") === null, "PESSOA_2, que nunca existiu, NAO resolve", h.paraValor("PESSOA_2"));
  // a proxima pessoa nao pode nascer como PESSOA_3 (colidiria com CARLA)
  const r = h.rotular("PESSOA", "DENISE");
  ok(r === "[PESSOA_4]", "proximo numero e MAIOR+1, nao TAMANHO+1", r);
  ok(h.paraValor("PESSOA_3") === "CARLA", "CARLA sobreviveu a chegada de DENISE");
  ok(h.paraValor("PESSOA_4") === "DENISE", "DENISE tem rotulo proprio");
}
{
  // item gravado SEM numero: cai na numeracao normal, nunca e descartado
  const h = P.hidratar({ processo: "p1", itens: [{ tipo: "PESSOA", valor: "ELIAS" }] });
  ok(h.paraValor("PESSOA_1") === "ELIAS", "item sem n nao se perde", h.tabela());
}
{
  // reidentificacao de um texto ja mascarado sobrevive ao round-trip com lacuna
  const h = P.hidratar({ processo: "p1", itens: [
    { tipo: "PESSOA", n: 1, valor: "ANA" }, { tipo: "PESSOA", n: 3, valor: "CARLA" },
  ] });
  ok(P.reidentificar("[PESSOA_3] assinou", h).texto === "CARLA assinou",
     "o texto ja mascarado volta com a pessoa CERTA", P.reidentificar("[PESSOA_3] assinou", h).texto);
}


// --- caso DEGENERADO declarado no codigo: mesmo valor sob dois numeros
{
  const h = P.hidratar({ processo: "p1", itens: [
    { tipo: "PESSOA", n: 1, valor: "JOSÉ" },
    { tipo: "PESSOA", n: 4, valor: "José" },   // mesmo valor normalizado
  ] });
  ok(h.paraValor("PESSOA_1") === "JOSÉ", "vence o PRIMEIRO");
  ok(h.paraValor("PESSOA_4") === null, "o segundo numero nao resolve (comportamento declarado)");
  ok(h.quantos() === 1, "conta UMA pessoa, nao duas");
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
