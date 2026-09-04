// Unidades da v0.56: deny por PREFIXO, `remover`/`proibidos.rotulo` e a
// fronteira de palavra em `conferir` — as três regras que a integração exercita
// de longe e que aqui ficam fixadas caso a caso.
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const R = __RAIZ + "/";
const ctx = { globalThis: null, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["src/pseudonimos.js", "src/anonimizar.js", "src/trava.js"]) {
  vm.runInContext(fs.readFileSync(R + f, "utf8"), ctx, { filename: f });
}
const PSEUD = ctx.PSEUD, ANON = ctx.ANON, TRAVA = ctx.TRAVA;
let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };
console.log("=== v0.56 unidades ===");

// ---- deny por prefixo, com a lista REAL do pacote
const negado = ANON.prepararDeny(JSON.parse(fs.readFileSync(R + "src/config/deny-list.json", "utf8")));
ok(negado("ORGANIZACAO", "Tribunal de Justiça do Estado do Ceará"), "TJ do Estado do Ceará é negado por prefixo");
ok(negado("ORGANIZACAO", "Ministério Público do Estado do Ceará"), "MP do Estado é negado por prefixo");
ok(negado("ORGANIZACAO", "Vara Única de Ocara"), "Vara Única de Ocara é negada (prefixo de uma palavra, lista curada)");
ok(negado("ORGANIZACAO", "VARA CRIMINAL DA COMARCA DE ITAPIPOCA"), "sem acento e em caixa alta também");
ok(negado("LOCAL", "Comarca de Ocara"), "LOCAL: comarca");
ok(!negado("ORGANIZACAO", "Varandas Construções Ltda"), "'vara' NÃO casa dentro de 'Varandas' (fronteira de palavra)");
ok(!negado("ORGANIZACAO", "TribunalX"), "'tribunal' não casa 'TribunalX'");
ok(!negado("ORGANIZACAO", "Banco Itaú Consignado S.A."), "empresa que é parte continua mascarada (sem prefixo genérico de empresa)");
ok(!negado("ORGANIZACAO", "Cooperativa Agrícola Mucambo Ltda"), "organização privada continua mascarada");
// ---- v0.57: vocabulário processual NÃO é pessoa (caso real: "ALIMENTOS", "Curatela")
ok(negado("PESSOA", "ALIMENTOS"), "'ALIMENTOS' rotulado como pessoa é negado");
ok(negado("PESSOA", "Curatela"), "'Curatela' também");
ok(negado("PESSOA", "Petição Inicial"), "e 'Petição Inicial'");
ok(!negado("PESSOA", "Antônio José Correia"), "um nome de gente continua mascarado");
ok(!negado("PESSOA", "MARIA APARECIDA DE SOUZA"), "em caixa alta também");
ok(!negado("PESSOA", "Guarda Mirim de Fortaleza"), "'guarda' só nega o valor INTEIRO, não o prefixo");
ok(!negado("PESSOA", "menor"), "'menor' NÃO está na deny (é quem o sigilo protege)");
ok(!negado("PESSOA", "Vara Silva"), "prefixo de ORGANIZATION não libera PESSOA");
ok(negado("ORGANIZACAO", "ministério público"), "a lista simples continua valendo inteira");
// cabeças que uma EMPRESA também usa NÃO liberam — o `negado` vale para o gazetteer da ficha
ok(!negado("ORGANIZACAO", "Câmara de Dirigentes Lojistas de Fortaleza"), "CDL continua mascarada (câmara só qualificada)");
ok(!negado("ORGANIZACAO", "Escola Tempo de Aprender Ltda"), "escola privada continua mascarada");
ok(!negado("ORGANIZACAO", "Fundação Bradesco"), "fundação privada continua mascarada");
ok(!negado("ORGANIZACAO", "Agência Boa de Publicidade Ltda"), "agência privada continua mascarada");
ok(!negado("ORGANIZACAO", "Sistema Fiep"), "'sistema' não é cabeça pública");
ok(!negado("ORGANIZACAO", "Central de Cobranças S.A."), "'central de' não é cabeça pública");
ok(negado("ORGANIZACAO", "Câmara Cível do TJCE"), "câmara cível é negada");
ok(negado("ORGANIZACAO", "Seção Judiciária do Ceará"), "seção judiciária é negada");
ok(negado("ORGANIZACAO", "Departamento Estadual de Trânsito"), "departamento estadual é negado");
ok(negado("ORGANIZACAO", "Agência Nacional de Telecomunicações"), "agência nacional é negada");

// ---- proibidos() leva rótulo; remover() tira e devolve o valor; numeração não fecha
const m = PSEUD.criarMapa("p1");
ok(m.rotular("PESSOA", "JOÃO DA SILVA") === "[PESSOA_1]", "1º rótulo");
ok(m.rotular("ORGANIZACAO", "Cooperativa X") === "[ORGANIZACAO_1]", "org");
ok(m.rotular("PESSOA", "MARIA SOUZA") === "[PESSOA_2]", "2º rótulo");
const pr = m.proibidos();
ok(pr.every((p) => /^\[[A-Z]+_\d+\]$/.test(p.rotulo)), "todo proibido leva rótulo", pr);
ok(m.liberar("[ORGANIZACAO_1]") === "Cooperativa X", "liberar devolve o valor");
ok(m.paraValor("[ORGANIZACAO_1]") === "Cooperativa X", "o rótulo liberado CONTINUA resolvendo (minuta antiga)");
ok(!m.proibidos().some((p) => p.valor === "Cooperativa X"), "e sai da lista da guarda");
ok(m.tabela().find((i) => i.rotulo === "[ORGANIZACAO_1]").liberado === true, "a tabela marca o liberado");
ok(m.liberar("[ORGANIZACAO_9]") === null, "liberar rótulo inexistente devolve null");
ok(PSEUD.reidentificar("[ORGANIZACAO_1] e [PESSOA_1]", m).texto === "Cooperativa X e JOÃO DA SILVA", "reidentificar resolve o liberado");
ok(m.rotular("ORGANIZACAO", "Outra Org") === "[ORGANIZACAO_2]", "o número liberado NÃO é reaproveitado (maior + 1)");
ok(m.liberar("[PESSOA_1]") === "JOÃO DA SILVA", "liberar pessoa");
ok(m.rotular("PESSOA", "Terceira Pessoa") === "[PESSOA_3]", "próxima pessoa nasce depois do maior, não no buraco");
ok(m.quantos() === 3, "quantos conta só o PROTEGIDO (2 liberados fora)", m.quantos());
// hidratar preserva números E a marca de liberado
const h = PSEUD.hidratar(m.serializar());
ok(h.paraValor("[PESSOA_2]") === "MARIA SOUZA" && h.paraValor("[PESSOA_3]") === "Terceira Pessoa", "hidratar preserva a numeração");
ok(h.paraValor("[PESSOA_1]") === "JOÃO DA SILVA" && !h.proibidos().some((p) => p.valor === "JOÃO DA SILVA"),
   "hidratar preserva o liberado: resolve, mas não vai à guarda");
ok(h.quantos() === 3, "quantos após hidratar", h.quantos());

// ---- VARIANTES do mesmo nome recebem o MESMO rótulo
const mv = PSEUD.criarMapa("p3");
ok(mv.rotular("ORGANIZACAO", "BANCO BRADESCO") === "[ORGANIZACAO_1]", "org 1ª forma");
ok(mv.rotular("ORGANIZACAO", "Banco Bradesco S.A.") === "[ORGANIZACAO_1]", "'S.A.' é a mesma organização");
ok(mv.rotular("ORGANIZACAO", "BANCO BRADESCO S/A") === "[ORGANIZACAO_1]", "'S/A' idem");
// Nome MAIOR que contém o já mapeado ("Banco Bradesco Cartões") funde com ele
// quando é a única candidata: no processo é a mesma parte, e quatro rótulos
// para o mesmo banco era o que fazia o modelo ver quatro requeridas.
ok(mv.rotular("ORGANIZACAO", "Banco Bradesco Cartões S.A.") === "[ORGANIZACAO_1]", "nome maior contendo o mapeado funde (única candidata)");
ok(mv.rotular("PESSOA", "MARIA JOSÉ DA SILVA") === "[PESSOA_1]", "pessoa 1ª forma");
ok(mv.rotular("PESSOA", "Maria Jose Silva") === "[PESSOA_1]", "sem acento e sem 'da' é a mesma pessoa");
ok(mv.rotular("PESSOA", "JOSÉ DA SILVA") === "[PESSOA_1]", "sobrenome composto único no mapa → mesma pessoa");
ok(mv.rotular("PESSOA", "Maria") === "[PESSOA_2]", "um nome só NUNCA funde (ambíguo por natureza)");
ok(mv.rotular("PESSOA", "JOÃO CARLOS DA SILVA") === "[PESSOA_3]", "outra pessoa");
ok(mv.rotular("PESSOA", "Carlos da Silva") === "[PESSOA_3]", "trecho contido só em uma → funde");
ok(mv.rotular("PESSOA", "da Silva") === "[PESSOA_4]", "'silva' (1 token útil) não funde");
const pv = mv.proibidos().filter((p) => p.rotulo === "[ORGANIZACAO_1]").map((p) => p.valor);
ok(pv.includes("BANCO BRADESCO") && pv.includes("Banco Bradesco S.A.") && pv.includes("BANCO BRADESCO S/A"),
   "proibidos() traz TODAS as formas vistas, sob o mesmo rótulo", pv);
ok(mv.paraValor("[ORGANIZACAO_1]") === "BANCO BRADESCO", "paraValor devolve a PRIMEIRA forma");
const hv = PSEUD.hidratar(mv.serializar());
ok(hv.proibidos().filter((p) => p.rotulo === "[ORGANIZACAO_1]").length === 4, "hidratar preserva as formas", hv.proibidos().filter((p) => p.rotulo === "[ORGANIZACAO_1]").map((p) => p.valor));
ok(hv.rotular("ORGANIZACAO", "banco bradesco ltda") === "[ORGANIZACAO_1]", "depois de hidratar, a variante nova ainda funde");
ok(mv.quantos() === 5, "quantos conta ENTIDADES, não formas", mv.quantos());

// ---- conferir com fronteira de palavra (mesma regra da trava)
const m2 = PSEUD.criarMapa("p2");
m2.rotular("PESSOA", "Ana");
m2.rotular("PESSOA", "Carlos Eduardo");
ok(PSEUD.conferir("Fernanda compareceu e Carlos Eduardo Lima faltou".replace("Carlos Eduardo", "[PESSOA_2]"), m2).ok,
   "'Ana' dentro de 'Fernanda' NÃO reprova a peça");
const c2 = PSEUD.conferir("Depoimento de Ana sobre o fato", m2);
ok(!c2.ok && c2.tipo === "PESSOA" && c2.rotulo === "[PESSOA_1]", "'Ana' solta reprova e diz o rótulo", c2);
ok(!PSEUD.conferir("carlos eduardo assinou", m2).ok, "sem caixa e sem acento continua pegando");
ok(PSEUD.conferir("[PESSOA_2] assinou", m2).ok, "texto mascarado passa");
// e a trava concorda
let lanc = null;
try { TRAVA.verificarSaida("Fernanda compareceu", m2.proibidos(), []); } catch (e) { lanc = e; }
ok(lanc === null, "a trava também deixa 'Fernanda' passar");
try { TRAVA.verificarSaida("a Ana compareceu", m2.proibidos(), []); } catch (e) { lanc = e; }
ok(lanc && lanc.vazamento && lanc.rotulo === "[PESSOA_1]" && lanc.tipo === "PESSOA",
   "a trava bloqueia e o erro carrega o RÓTULO (nunca o valor)", lanc && { rotulo: lanc.rotulo, msg: lanc.message });
ok(lanc && !lanc.message.includes("Ana"), "a mensagem do erro não leva o valor");

// ---- v0.56.1: LIBERADO sai em claro em QUALQUER forma; sobras não escrevem no mapa
{
  const ml = PSEUD.criarMapa("p4");
  ok(ml.rotular("ORGANIZACAO", "BANCO BRADESCO") === "[ORGANIZACAO_1]", "org mapeada");
  ok(ml.rotular("ORGANIZACAO", "Banco Bradesco S.A.") === "[ORGANIZACAO_1]", "variante funde");
  ok(ml.formasDe("[ORGANIZACAO_1]").length === 2, "formasDe devolve as duas formas", ml.formasDe("[ORGANIZACAO_1]"));
  ok(ml.liberar("[ORGANIZACAO_1]") === "BANCO BRADESCO", "liberar");
  ok(ml.rotular("ORGANIZACAO", "BANCO BRADESCO") === null, "rotular o liberado devolve null (não mascara)");
  ok(ml.rotular("ORGANIZACAO", "Banco Bradesco S.A.") === null, "e a VARIANTE do liberado também sai em claro");
  ok(ml.rotular("ORGANIZACAO", "Banco Bradesco Cartões S.A.") === null, "e a forma maior que fundiria com ele");
  ok(PSEUD.mascarar("X BANCO BRADESCO S/A Y", [{ tipo: "ORGANIZACAO", ini: 2, fim: 19 }], ml) === "X BANCO BRADESCO S/A Y",
     "mascarar deixa o liberado em claro");
  ok(ml.rotular("ORGANIZACAO", "Outro Banco") === "[ORGANIZACAO_2]", "organização nova continua ganhando rótulo");
  // hidratar preserva: o liberado continua devolvendo null
  const hl = PSEUD.hidratar(ml.serializar());
  ok(hl.rotular("ORGANIZACAO", "Banco Bradesco S.A.") === null, "após hidratar, a variante do liberado segue em claro");
  ok(hl.paraValor("[ORGANIZACAO_1]") === "BANCO BRADESCO", "e o rótulo ainda resolve (minuta antiga)");
  // o gazetteer do mapa carrega o rótulo (é o que `sobrasDoMapa` lê sem escrever no mapa)
  const mg = PSEUD.criarMapa("p5");
  mg.rotular("PESSOA", "JOSÉ DA SILVA");
  const ach = ANON.acharGazetteer("Foi JOSÉ DA SILVA quem assinou.", mg.proibidos());
  ok(ach.length === 1 && ach[0].rotulo === "[PESSOA_1]", "acharGazetteer devolve o rótulo do item do mapa", ach);
  const achFicha = ANON.acharGazetteer("JOSÉ DA SILVA", [{ tipo: "PESSOA", valor: "JOSÉ DA SILVA" }]);
  ok(achFicha.length === 1 && !("rotulo" in achFicha[0]), "item da ficha (sem rótulo) não ganha a chave", achFicha);
}
console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
