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
require(__RAIZ + "/src/pseudonimos.js");
const A = require(__RAIZ + "/src/anonimizar.js");

let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };
const lanca = (fn, nome) => { n++; try { fn(); mau++; console.log("  FALHOU (devia lancar):", nome); } catch { /* esperado */ } };
const tipos = (s, o) => A.detectar(s, o).map((x) => x.tipo).sort();
const spans = (s, o) => A.detectar(s, o).map((x) => x.tipo + ":" + s.slice(x.ini, x.fim));

console.log("=== anonimizar ===");

// --- digitos verificadores (documentos FICTICIOS, gerados para o teste)
ok(A.cpfValido("529.982.247-25") === true, "CPF valido");
ok(A.cpfValido("529.982.247-26") === false, "CPF com DV errado");
ok(A.cpfValido("111.111.111-11") === false, "CPF de digitos repetidos");
ok(A.cnpjValido("11.222.333/0001-81") === true, "CNPJ valido");
ok(A.cnpjValido("11.222.333/0001-82") === false, "CNPJ com DV errado");
ok(A._cnjValido("0001234", "56", "2020", "8", "06", "0128") === false, "CNJ com DV errado");

// O DV do CNJ e calculado sobre 18 digitos -- passa de MAX_SAFE_INTEGER, e o
// modulo tem de ser feito digito a digito. Aqui se acha o unico DV valido.
{
  let bom = null;
  for (let d = 0; d < 100; d++) {
    const dd = String(d).padStart(2, "0");
    if (A._cnjValido("0001234", dd, "2020", "8", "06", "0128")) { bom = dd; break; }
  }
  ok(bom !== null, "existe um DV valido para a sequencia", bom);
  ok(tipos("Processo 0001234-" + bom + ".2020.8.06.0128").includes("CNJ"), "CNJ com DV certo e detectado");
}

// --- DESCARTE por DV: numero com cara de CPF que nao e CPF de ninguem
ok(tipos("contrato 1.234.567.890-12 clausula 3").includes("CPF") === false,
   "sequencia com DV invalido NAO vira CPF", spans("contrato 1.234.567.890-12 clausula 3"));
ok(tipos("CPF 529.982.247-25").includes("CPF"), "CPF valido e detectado");

// --- FRONTEIRA DE DIGITO: prefixo de um numero maior nao pode virar CPF
ok(tipos("processo 05299822472512345 em juizo").includes("CPF") === false,
   "11 digitos DENTRO de um numero maior nao viram CPF", spans("processo 05299822472512345 em juizo"));

// --- CPF nao pode sair TAMBEM como telefone
ok(spans("CPF 529.982.247-25").filter((x) => x.startsWith("TELEFONE")).length === 0,
   "CPF nao dispara TELEFONE junto", spans("CPF 529.982.247-25"));

// --- telefone
ok(tipos("ligar (85) 99999-9999 hoje").includes("TELEFONE"), "telefone com DDD",
   spans("ligar (85) 99999-9999 hoje"));
ok(tipos("protocolo 12345678 anexo").includes("TELEFONE") === false,
   "8 digitos soltos nao viram telefone", spans("protocolo 12345678 anexo"));

// --- e-mail: a mascara nao pode sair pela METADE quando ha acento
{
  const t = "contato joao@exemplo.com.br favor";
  const s = A.detectar(t).filter((x) => x.tipo === "EMAIL");
  ok(s.length === 1 && t.slice(s[0].ini, s[0].fim) === "joao@exemplo.com.br", "e-mail ASCII inteiro",
     s.length ? t.slice(s[0].ini, s[0].fim) : null);
}
{
  const t = "contato jo\u00e3o@exemplo.com.br favor";
  const s = A.detectar(t).filter((x) => x.tipo === "EMAIL");
  ok(s.length === 1 && t.slice(s[0].ini, s[0].fim) === "jo\u00e3o@exemplo.com.br",
     "e-mail COM ACENTO sai inteiro, nunca jo\u00e3[EMAIL_1]",
     s.length ? t.slice(s[0].ini, s[0].fim) : null);
}

// --- CEP so com ancora de contexto, e as abreviacoes precisam ancorar
ok(tipos("intervalo 62755-000 a 62755-999").includes("CEP") === false,
   "CEP sem ancora nao dispara", spans("intervalo 62755-000 a 62755-999"));
ok(tipos("Avenida Brasil, 62755-000").includes("CEP"), "Avenida ancora");
ok(tipos("Av. Brasil, 62755-000").includes("CEP"), "Av. abreviado ancora (o caso que ja falhou)",
   spans("Av. Brasil, 62755-000"));
ok(tipos("R. das Flores, 62755-000").includes("CEP"), "R. abreviado ancora",
   spans("R. das Flores, 62755-000"));
ok(tipos("CEP 62755-000").includes("CEP"), "a propria palavra CEP ancora");

// --- OAB
ok(tipos("advogado OAB/CE 12.345").includes("OAB"), "OAB com UF", spans("advogado OAB/CE 12.345"));
ok(tipos("OAB 12345").includes("OAB"), "OAB sem UF");

// --- normalizarComIndice: o offset tem de voltar CERTO no texto ORIGINAL
{
  const t = "Jos\u00e9 ANT\u00d4NIO   da Silva";
  const { alvo, idx } = A.normalizarComIndice(t);
  ok(alvo === "jose antonio da silva", "sem acento, sem caixa, espaco colapsado", alvo);
  const de = alvo.indexOf("antonio");
  ok(t.slice(idx[de], idx[de + 7]) === "ANT\u00d4NIO", "o offset recorta o trecho ORIGINAL",
     t.slice(idx[de], idx[de + 7]));
}
{
  // ASTRAL: uma entrada por unidade UTF-16. Por code point, todo offset
  // seguinte desliza -- e o sintoma e mascara no lugar errado, nao excecao.
  const t = "\u{1F600} Maria da Silva";
  const { alvo, idx } = A.normalizarComIndice(t);
  const de = alvo.indexOf("maria");
  ok(t.slice(idx[de], idx[de + 5]) === "Maria", "offset certo DEPOIS de um caractere astral",
     t.slice(idx[de], idx[de + 5]));
}

// --- gazetteer da ficha
{
  const ficha = {
    numero: "0001234-56.2020.8.06.0128",
    poloAtivo: [{
      nome: "MARIA DA SILVA", documento: "529.982.247-25", tipoDocumento: "CPF",
      representantes: [{ nome: "JOAO ADVOGADO", oab: "OAB/CE 12.345" }],
    }],
    poloPassivo: [{ nome: "BANCO EXEMPLO S.A.", documento: "11.222.333/0001-81", tipoDocumento: "CNPJ" }],
  };
  const g = A.gazetteerDaFicha(ficha);
  ok(g.some((x) => x.tipo === "PESSOA" && x.valor === "MARIA DA SILVA"), "titular com CPF vira PESSOA", g);
  ok(g.some((x) => x.tipo === "ORGANIZACAO" && x.valor === "BANCO EXEMPLO S.A."),
     "titular com CNPJ vira ORGANIZACAO");
  ok(g.some((x) => x.tipo === "PESSOA" && x.valor === "JOAO ADVOGADO"), "representante entra");

  const t = "A autora Maria da Silva alega. O reu, Banco Exemplo S.A., contesta.";
  const achados = A.detectar(t, { ficha });
  ok(achados.some((x) => t.slice(x.ini, x.fim) === "Maria da Silva"),
     "gazetteer acha o nome em OUTRA CAIXA", achados.map((x) => x.tipo + ":" + t.slice(x.ini, x.fim)));
  ok(achados.filter((x) => x.origem === "ficha").every((x) => x.score === 1), "ficha tem score 1");
}
{
  // FRONTEIRA: uma parte chamada "Ana" nao pode mascarar "Fernanda"
  const ficha = { poloAtivo: [{ nome: "Ana", tipoDocumento: "CPF" }] };
  const t = "a testemunha Fernanda depos";
  ok(A.detectar(t, { ficha }).length === 0, "Ana nao casa dentro de Fernanda", spans(t, { ficha }));
}

// --- deny list, com o ALIAS PESSOA->PERSON
{
  const negado = A.prepararDeny({
    "*": ["banco do brasil"], PERSON: ["juiz de direito"], ORGANIZATION: ["ministerio publico"],
  });
  ok(negado("ORGANIZACAO", "Banco do Brasil") === true, "lista geral nega");
  ok(negado("PESSOA", "Juiz de Direito") === true, "alias PESSOA -> PERSON");
  ok(negado("ORGANIZACAO", "Minist\u00e9rio P\u00fablico") === true, "alias ORGANIZACAO -> ORGANIZATION, com acento");
  ok(negado("PESSOA", "Maria da Silva") === false, "nome comum nao e negado");
  ok(negado("PESSOA", "") === true, "vazio e negado");
}
{
  // a deny list REAL do repositorio carrega e nega o que promete
  const bruto = JSON.parse(fs.readFileSync(__RAIZ + "/src/config/deny-list.json", "utf8"));
  const negado = A.prepararDeny(bruto);
  ok(negado("ORGANIZACAO", "Banco do Brasil") === true, "deny real: Banco do Brasil");
  ok(negado("PESSOA", "advogado") === true, "deny real: advogado");
  ok(negado("PESSOA", "Elioneudo Evaristo") === false, "deny real nao nega nome proprio");
}

// --- politica
ok(A.POLITICA_PADRAO.TEMPO === false, "TEMPO preservado (prazo e o eixo do produto)");
ok(A.POLITICA_PADRAO.LEGISLACAO === false, "LEGISLACAO preservada (e a fundamentacao)");
ok(A.POLITICA_PADRAO.JURISPRUDENCIA === false, "JURISPRUDENCIA preservada");
ok(A.POLITICA_PADRAO.PESSOA === true, "PESSOA mascarada");
{
  const cfg = JSON.parse(fs.readFileSync(__RAIZ + "/vendor/ner-modelo/config.json", "utf8"));
  ok(A.conferirPolitica(A.POLITICA_PADRAO, cfg.id2label) === true,
     "a politica cobre TODOS os rotulos do modelo REAL");
}
lanca(() => A.conferirPolitica(A.POLITICA_PADRAO, { "1": "B-PROFISSAO" }),
      "rotulo desconhecido vira recusa explicita");
ok(tipos("CPF 529.982.247-25", { politica: Object.assign({}, A.POLITICA_PADRAO, { CPF: false }) })
     .includes("CPF") === false, "politica CPF:false desliga o padrao");

// --- fundir: politica e deny valem TAMBEM para o que vem do NER
{
  const t = "o Ministerio Publico e Maria";
  const doNer = [{ tipo: "ORGANIZACAO", ini: 2, fim: 21 }, { tipo: "PESSOA", ini: 24, fim: 29 }];
  const negado = A.prepararDeny({ ORGANIZATION: ["ministerio publico"] });
  const r = A.fundir(doNer, [], { texto: t, negado });
  ok(r.length === 1 && r[0].tipo === "PESSOA", "deny list corta o span do NER", r);
  ok(r[0].origem === "ner" && r[0].score === 0.5, "span do NER ganha origem e score padrao", r[0]);
}
ok(A.fundir([{ tipo: "TEMPO", ini: 0, fim: 5 }], [], { texto: "hoje " }).length === 0,
   "politica corta TEMPO do NER");

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
