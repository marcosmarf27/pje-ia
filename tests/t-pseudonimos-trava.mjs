// Teste de src/pseudonimos.js e src/trava.js.
//
// São os dois módulos que carregam a segurança do recurso, então o teste
// persegue os modos de falha que NÃO estouram: o rótulo que designa duas
// pessoas, a numeração invertida pela substituição, o valor que sobrevive à
// máscara, a trava que dispara sobre o texto do próprio programa.
import { createRequire } from "node:module";
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
const PSEUD = require(path.join(RAIZ, "src/pseudonimos.js")); // define globalThis.PSEUD
const TRAVA = require(path.join(RAIZ, "src/trava.js"));

let ok = 0;
const falhas = [];
const eq = (a, b, q) =>
  JSON.stringify(a) === JSON.stringify(b)
    ? ok++
    : falhas.push(`${q}\n    esperado: ${JSON.stringify(b)}\n    obtido:   ${JSON.stringify(a)}`);
const verdade = (c, q) => (c ? ok++ : falhas.push(q));
function lanca(fn, q) {
  try {
    fn();
    falhas.push(`${q} — não lançou`);
    return null;
  } catch (e) {
    ok++;
    return e;
  }
}

// =========================================================== PSEUDÔNIMOS
{
  const m = PSEUD.criarMapa("caso-1");
  eq(m.rotular("PESSOA", "MARIA DA SILVA"), "[PESSOA_1]", "primeira pessoa é PESSOA_1");
  eq(m.rotular("PESSOA", "JOÃO SOUZA"), "[PESSOA_2]", "segunda pessoa é PESSOA_2");
  eq(m.rotular("PESSOA", "MARIA DA SILVA"), "[PESSOA_1]", "a MESMA pessoa recebe o MESMO rótulo");
  // O ponto central: caixa e acento não criam pessoa nova.
  eq(m.rotular("PESSOA", "maria da silva"), "[PESSOA_1]", "caixa diferente é a mesma pessoa");
  eq(m.rotular("PESSOA", "JOAO SOUZA"), "[PESSOA_2]", "sem acento é a mesma pessoa");
  eq(m.rotular("PESSOA", "MARIA  DA   SILVA"), "[PESSOA_1]", "espaço múltiplo é a mesma pessoa");
  // Numeração é POR TIPO.
  eq(m.rotular("CPF", "529.982.247-25"), "[CPF_1]", "o CPF tem numeração própria");
  eq(m.rotular("CNJ", "0200161-20.2024.8.06.0303"), "[PROCESSO_1]", "CNJ vira rótulo PROCESSO");
  eq(m.quantos(), 4, "quatro valores distintos no mapa");
  // A reidentificação devolve a caixa ORIGINAL da primeira aparição.
  eq(m.paraValor("PESSOA_1"), "MARIA DA SILVA", "devolve a caixa original, não a normalizada");
  eq(m.paraValor("[PESSOA_2]"), "JOÃO SOUZA", "aceita o rótulo com colchetes");
  eq(m.paraValor("PESSOA_9"), null, "rótulo inexistente devolve null");
}

// ------------------------------------------- as DUAS passadas (o bug clássico)
{
  const m = PSEUD.criarMapa("caso-2");
  // Duas entidades na MESMA frase, coladas. Fundir numeração e substituição
  // inverteria os números; substituir de frente para trás deslocaria o segundo.
  const texto = "MARIA DA SILVA e JOÃO SOUZA assinaram.";
  const oc = [
    { tipo: "PESSOA", ini: 0, fim: 14 },
    { tipo: "PESSOA", ini: 17, fim: 27 },
  ];
  eq(texto.slice(0, 14), "MARIA DA SILVA", "sanidade do offset 1");
  eq(texto.slice(17, 27), "JOÃO SOUZA", "sanidade do offset 2");
  const out = PSEUD.mascarar(texto, oc, m);
  eq(out, "[PESSOA_1] e [PESSOA_2] assinaram.", "numeração na ordem de leitura, offsets intactos");
}

// Ordem de leitura mesmo com as ocorrências chegando fora de ordem.
{
  const m = PSEUD.criarMapa("caso-3");
  const texto = "ANA e BRUNO";
  const out = PSEUD.mascarar(
    texto,
    [
      { tipo: "PESSOA", ini: 6, fim: 11 },
      { tipo: "PESSOA", ini: 0, fim: 3 },
    ],
    m
  );
  eq(out, "[PESSOA_1] e [PESSOA_2]", "quem aparece primeiro no TEXTO é o _1, não quem chegou primeiro");
}

// Entidade longa no fim: substituir de trás para frente não pode encurtar nada.
{
  const m = PSEUD.criarMapa("caso-4");
  const orgao = "MINISTÉRIO PÚBLICO DO ESTADO DO CEARÁ";
  const texto = "réu: X; autor: " + orgao;
  const ini = texto.indexOf(orgao);
  const out = PSEUD.mascarar(texto, [{ tipo: "ORGANIZACAO", ini, fim: ini + orgao.length }], m);
  eq(out, "réu: X; autor: [ORGANIZACAO_1]", "substituição no fim preserva o começo");
}

// ------------------------------------------------------------ sobreposição
{
  const r = PSEUD._resolverSobreposicao([
    { tipo: "PESSOA", ini: 0, fim: 5, score: 0.9 },
    { tipo: "PESSOA", ini: 0, fim: 14, score: 0.5 },
  ]);
  eq(r.length, 1, "sobreposição resolve para um");
  eq(r[0].fim, 14, "fica o intervalo mais LONGO, não o de maior score");
}
{
  const r = PSEUD._resolverSobreposicao([
    { tipo: "PESSOA", ini: 0, fim: 5, score: 0.4 },
    { tipo: "CPF", ini: 0, fim: 5, score: 0.99 },
  ]);
  eq(r.length, 1, "empate de tamanho resolve para um");
  eq(r[0].tipo, "CPF", "…e o desempate é o score");
}
{
  const r = PSEUD._resolverSobreposicao([
    { tipo: "A", ini: 0, fim: 5 },
    { tipo: "B", ini: 5, fim: 9 },
  ]);
  eq(r.length, 2, "intervalos que só se tocam NÃO são sobreposição");
}

// ----------------------------------------------------------- reidentificar
{
  const m = PSEUD.criarMapa("caso-5");
  const texto = "MARIA DA SILVA move ação contra JOÃO SOUZA, CPF 529.982.247-25.";
  const mask = PSEUD.mascarar(
    texto,
    [
      { tipo: "PESSOA", ini: 0, fim: 14 },
      { tipo: "PESSOA", ini: 32, fim: 42 },
      { tipo: "CPF", ini: 48, fim: 62 },
    ],
    m
  );
  verdade(!mask.includes("MARIA"), "o nome sumiu do texto mascarado");
  verdade(!mask.includes("529.982"), "o CPF sumiu do texto mascarado");
  const volta = PSEUD.reidentificar(mask, m);
  eq(volta.texto, texto, "ida e volta reconstrói o texto original byte a byte");
  eq(volta.trocados, 3, "três rótulos restaurados");
  eq(volta.desconhecidos, 0, "nenhum desconhecido");
}

// Rótulo que o mapa não conhece FICA COMO ESTÁ — apagá-lo comeria texto de uma
// peça que vai ao PJe assinada.
{
  const m = PSEUD.criarMapa("caso-6");
  m.rotular("PESSOA", "ANA");
  const r = PSEUD.reidentificar("Vi [PESSOA_1] e [PESSOA_7] e [CPF_3].", m);
  eq(r.texto, "Vi ANA e [PESSOA_7] e [CPF_3].", "rótulo desconhecido é preservado, não apagado");
  eq(r.desconhecidos, 2, "…e é contado, para o chamador poder avisar");
}

// ------------------------------------------------------------------ hidratar
{
  const m = PSEUD.criarMapa("caso-7");
  m.rotular("PESSOA", "ANA");
  m.rotular("CPF", "111.444.777-35");
  m.rotular("PESSOA", "BRUNO");
  const bruto = JSON.parse(JSON.stringify(m.serializar()));
  const m2 = PSEUD.hidratar(bruto);
  eq(m2.paraValor("PESSOA_1"), "ANA", "hidratar preserva o número 1");
  eq(m2.paraValor("PESSOA_2"), "BRUNO", "hidratar preserva o número 2");
  eq(m2.paraValor("CPF_1"), "111.444.777-35", "…e a numeração POR TIPO");
  eq(m2.processo, "caso-7", "hidratar preserva o processo (a trava do editor depende disso)");
  eq(m2.rotular("PESSOA", "ana"), "[PESSOA_1]", "e continua reconhecendo quem já estava lá");
}

// -------------------------------------------------------------- conferir
{
  const m = PSEUD.criarMapa("caso-8");
  m.rotular("PESSOA", "MARIA DA SILVA");
  eq(PSEUD.conferir("[PESSOA_1] compareceu.", m).ok, true, "texto limpo passa");
  eq(
    PSEUD.conferir("[PESSOA_1] compareceu, disse Maria da Silva.", m).ok,
    false,
    "valor sobrevivente é pego mesmo com outra caixa"
  );
}

// ================================================================= TRAVA
const CORPO = (o) => JSON.stringify(o);

// A trava vê o corpo INTEIRO, inclusive os campos que não são a peça.
{
  const proibidos = [{ tipo: "PESSOA", valor: "MARIA DA SILVA" }];
  const e = lanca(
    () => TRAVA.verificarSaida(CORPO({ system: "Processo em análise de MARIA DA SILVA." }), proibidos),
    "nome no SYSTEM é bloqueado (é o canal da ficha, o mais fácil de esquecer)"
  );
  verdade(e && e.vazamento === true, "o erro é marcado como vazamento");
  verdade(e && !e.message.includes("MARIA"), "a MENSAGEM DE ERRO NÃO CONTÉM O VALOR");
  verdade(e && e.message.includes("PESSOA"), "…mas diz o tipo");
  verdade(e && typeof e.posicao === "number", "…e a posição aproximada");
}
{
  const proibidos = [{ tipo: "PESSOA", valor: "MARIA DA SILVA" }];
  lanca(
    () =>
      TRAVA.verificarSaida(
        CORPO({ messages: [{ content: [{ type: "document", title: "12345 - Contestação de MARIA DA SILVA" }] }] }),
        proibidos
      ),
    "nome no TITLE de um bloco é bloqueado"
  );
}
// Caixa e acento não escapam.
{
  lanca(
    () => TRAVA.verificarSaida(CORPO({ t: "compareceu JOÃO" }), [{ tipo: "PESSOA", valor: "joão" }]),
    "JOÃO no corpo é pego por joão na lista"
  );
  lanca(
    () => TRAVA.verificarSaida(CORPO({ t: "compareceu JOAO" }), [{ tipo: "PESSOA", valor: "João" }]),
    "JOAO sem acento é pego por João na lista"
  );
}

// FRONTEIRA DE PALAVRA — sem isso a trava dispara sempre e é desligada.
{
  TRAVA.verificarSaida(CORPO({ t: "Fernanda compareceu" }), [{ tipo: "PESSOA", valor: "Ana" }]);
  ok++; // não lançou, que é o esperado
  lanca(
    () => TRAVA.verificarSaida(CORPO({ t: "Ana compareceu" }), [{ tipo: "PESSOA", valor: "Ana" }]),
    "…mas Ana sozinha É bloqueada"
  );
}

// MÍNIMO VERIFICÁVEL — valor curto demais é ignorado, e isso é um buraco DITO.
{
  TRAVA.verificarSaida(CORPO({ t: "o Sá veio" }), [{ tipo: "PESSOA", valor: "Sá" }]);
  ok++;
  eq(TRAVA.pesoVerificavel("S.A."), 2, "pontuação não conta para o mínimo");
  eq(TRAVA.pesoVerificavel("529.982.247-25"), 11, "um CPF formatado tem 11 verificáveis");
}

// ISENTAS — o texto constante do próprio programa não pode disparar a trava.
{
  const SYSTEM = "Responda sempre em português do Brasil, citando a peça e a folha.";
  const proibidos = [{ tipo: "LOCAL", valor: "Brasil" }];
  // Sem isentar: dispara sobre o nosso próprio texto (o incidente do irmão).
  lanca(
    () => TRAVA.verificarSaida(CORPO({ system: SYSTEM }), proibidos),
    "sem isenção, a trava dispara sobre o texto do próprio programa"
  );
  // Isentando a constante: passa.
  TRAVA.verificarSaida(CORPO({ system: SYSTEM }), proibidos, [SYSTEM]);
  ok++;
  // Mas o MESMO valor fora da região isenta continua bloqueando.
  lanca(
    () => TRAVA.verificarSaida(CORPO({ system: SYSTEM, t: "mora no Brasil" }), proibidos, [SYSTEM]),
    "…e o mesmo valor FORA da região isenta continua bloqueando"
  );
}

// RECUSA ESTRUTURAL
{
  lanca(
    () => TRAVA.recusarBinarios({ messages: [{ content: [{ type: "document", source: { type: "file", file_id: "x" } }] }] }),
    "bloco source.type:file é recusado"
  );
  lanca(
    () => TRAVA.recusarBinarios({ content: [{ type: "document", source: { type: "base64", data: "AAA" } }] }),
    "bloco source.type:base64 é recusado"
  );
  const e = lanca(
    () => TRAVA.recusarBinarios({ content: [{ type: "image", source: { type: "base64", data: "AAA" } }] }),
    "bloco de imagem é recusado"
  );
  verdade(e && !e.message.includes("AAA"), "a recusa não vaza o conteúdo do bloco");
  // O caminho legítimo do modo sigiloso passa.
  TRAVA.recusarBinarios({
    content: [{ type: "document", source: { type: "text", media_type: "text/plain", data: "[PESSOA_1] veio" } }],
  });
  ok++;
}

// CARIMBO
{
  const m = PSEUD.criarMapa("caso-9");
  m.rotular("PESSOA", "MARIA DA SILVA");
  const bom = {
    system: "Cite a peça e a folha.",
    messages: [{ role: "user", content: [{ type: "text", text: "[PESSOA_1] pediu isto" }] }],
  };
  const c = TRAVA.carimbar(bom, m.proibidos());
  verdade(TRAVA.estaCarimbado(c), "o payload limpo sai carimbado");
  eq(c.corpo, JSON.stringify(bom), "o carimbo carrega o SNAPSHOT verificado, não o objeto");
  verdade(!TRAVA.estaCarimbado({ corpo: c.corpo }), "objeto feito à mão NÃO passa por carimbado");
  verdade(!TRAVA.estaCarimbado(null), "null não é carimbado");
  lanca(
    () => TRAVA.carimbar({ system: "de MARIA DA SILVA" }, m.proibidos()),
    "carimbar recusa payload com vazamento"
  );

  // O BYPASS DO CARIMBO: mutar o objeto DEPOIS de verificado.
  // Com o carimbo guardando a referência, dava para verificar um payload limpo,
  // trocar o conteúdo por um nome em claro, e `estaCarimbado` continuar true.
  bom.messages[0].content[0].text = "MARIA DA SILVA pediu isto";
  verdade(
    !c.corpo.includes("MARIA DA SILVA"),
    "mutar o objeto DEPOIS do carimbo não muda o corpo verificado"
  );
  verdade(Object.isFrozen(c), "o carimbo é congelado — não dá para reatribuir o corpo");
  const antes = c.corpo;
  try { c.corpo = '{"system":"MARIA DA SILVA"}'; } catch { /* strict mode lança */ }
  eq(c.corpo, antes, "…e a tentativa de reatribuir não pega");
}

// Valor PARTIDO entre dois campos: não é substring de nenhum deles nem do JSON
// cru (o `","` fica no meio), mas a API recebe as duas partes do mesmo jeito.
{
  const proibidos = [{ tipo: "PESSOA", valor: "Maria Silva" }];
  lanca(
    () => TRAVA.carimbar({ c: [{ text: "Maria" }, { text: "Silva" }] }, proibidos),
    "nome partido entre dois blocos de texto é bloqueado"
  );
}

// Offsets inválidos: FALHA FECHADA. `slice` é permissivo e a máscara
// simplesmente não aconteceria, sem erro — documento não anonimizado com cara
// de anonimizado.
{
  const m = PSEUD.criarMapa("caso-off");
  const t = "Maria Silva";
  for (const [oc, q] of [
    [{ tipo: "PESSOA", ini: 6, fim: 2 }, "fim menor que ini"],
    [{ tipo: "PESSOA", ini: -2, fim: 5 }, "ini negativo"],
    [{ tipo: "PESSOA", ini: 50, fim: 60 }, "intervalo fora do texto"],
    [{ tipo: "PESSOA", ini: 0, fim: 60 }, "fim além do texto"],
    [{ tipo: "PESSOA", ini: 1.5, fim: 5 }, "ini não inteiro"],
  ]) {
    const e = lanca(() => PSEUD.mascarar(t, [oc], m), `mascarar LANÇA com ${q}`);
    verdade(e && !e.message.includes("Maria"), `…e o erro não vaza o trecho (${q})`);
  }
  eq(PSEUD.mascarar(t, [{ tipo: "PESSOA", ini: 0, fim: 11 }], m), "[PESSOA_1]", "o caso válido segue funcionando");
}

// NFKD: a ligadura tipográfica que o OCR produz tem de casar o nome normal.
{
  eq(PSEUD.normalizar("ﬁlipe"), "filipe", "a ligadura ﬁ normaliza para fi (NFKD)");
  lanca(
    () => TRAVA.verificarSaida(CORPO({ t: "o ﬁlipe veio" }), [{ tipo: "PESSOA", valor: "filipe" }]),
    "…e a trava pega o nome escrito com ligadura"
  );
}

// A trava exige o normalizador compartilhado — sem ele, falha ALTO.
{
  const salvo = globalThis.PSEUD;
  globalThis.PSEUD = undefined;
  const e = lanca(
    () => TRAVA.verificarSaida("{}", [{ tipo: "X", valor: "abcdef" }]),
    "sem pseudonimos.js a trava LANÇA em vez de passar em silêncio"
  );
  verdade(e && /pseudonimos/.test(e.message), "…e o erro diz o que falta");
  globalThis.PSEUD = salvo;
}

// -------------------------------------------------------------------- relatório
console.log(`\n${ok} asserções passaram`);
if (falhas.length) {
  console.log(`\n${falhas.length} FALHAS:\n`);
  for (const f of falhas) console.log("  - " + f);
  process.exit(1);
}
console.log("tudo verde");
