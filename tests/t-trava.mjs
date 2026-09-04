import { createRequire } from "node:module";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const require = createRequire(import.meta.url);
// ORDEM IMPORTA: trava.js le globalThis.PSEUD na CHAMADA.
require(__RAIZ + "/src/pseudonimos.js");
const TR = require(__RAIZ + "/src/trava.js");

let n = 0, mau = 0;
const ok = (c, nome, extra) => { n++; if (!c) { mau++; console.log("  FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra)); } };
const bloqueia = (fn, nome) => { n++; try { fn(); mau++; console.log("  FALHOU (devia bloquear):", nome); } catch (e) { if (!e.vazamento) { mau++; console.log("  FALHOU (erro errado):", nome, e.message); } } };
const passa = (fn, nome) => { n++; try { fn(); } catch (e) { mau++; console.log("  FALHOU (nao devia bloquear):", nome, e.message); } };

console.log("=== trava ===");
const PROIB = [{ tipo: "PESSOA", valor: "Elioneudo Evaristo" }, { tipo: "CPF", valor: "123.456.789-09" }];
const car = (p, opts) => TR.carimbar(p, PROIB, opts);

// --- o basico
bloqueia(() => car({ messages: [{ content: "o reu Elioneudo Evaristo confessou" }] }), "nome cru no corpo");
passa(() => car({ messages: [{ content: "o reu [PESSOA_1] confessou" }] }), "texto mascarado passa");
bloqueia(() => car({ messages: [{ content: "ELIONEUDO EVARISTO" }] }), "caixa alta e pega");
bloqueia(() => car({ messages: [{ content: "elioneudo  evaristo" }] }), "espaco duplo e pego (normalizacao colapsa)");

// --- FRONTEIRA DE PALAVRA: "Ana" nao pode bloquear "Fernanda"
passa(() => TR.carimbar({ t: "Fernanda Silva" }, [{ tipo: "PESSOA", valor: "Ana" }]), "Ana nao casa dentro de Fernanda");
bloqueia(() => TR.carimbar({ t: "a parte Ana Silva" }, [{ tipo: "PESSOA", valor: "Ana" }]), "Ana isolada e pega");

// --- O QUE O COMENTARIO DIZ TER FECHADO: o escape do JSON
bloqueia(() => car({ m: "o reu Elioneudo\nEvaristo confessou" }), "nome partido por QUEBRA DE LINHA");
bloqueia(() => car({ m: "Elioneudo\tEvaristo" }), "nome partido por TABULACAO");
bloqueia(() => car({ m: 'disse "Elioneudo Evaristo" ontem' }), "nome entre ASPAS");

// --- nome partido entre DOIS CAMPOS (a 3a passada, da concatenacao)
bloqueia(() => car({ blocos: [{ text: "Elioneudo" }, { text: "Evaristo" }] }), "nome partido entre dois blocos");

// --- as CHAVES do objeto tambem sao conferidas
bloqueia(() => car({ "Elioneudo Evaristo": 1 }), "valor proibido como CHAVE");

// --- ISENTAS: o texto constante do proprio programa nao pode disparar
{
  const proib = [{ tipo: "ORGANIZACAO", valor: "Brasil" }];
  const sys = "Voce e um assistente juridico do Brasil.";
  bloqueia(() => TR.carimbar({ s: sys }, proib), "sem isentar, 'Brasil' do nosso system bloqueia");
  passa(() => TR.carimbar({ s: sys }, proib, { isentas: [sys] }), "com isentas, nao bloqueia");
  bloqueia(() => TR.carimbar({ s: sys, u: "moro no Brasil" }, proib, { isentas: [sys] }),
           "isenta cobre SO a regiao literal, nao o texto do usuario");
}

// --- MINIMO_VERIFICAVEL: valor curto demais nao dispara
passa(() => TR.carimbar({ t: "no ar" }, [{ tipo: "X", valor: "ar" }]), "valor de 2 letras e ignorado");
ok(TR.pesoVerificavel("123.456.789-09") === 11, "peso conta so letra/digito");
ok(TR.pesoVerificavel("S.A.") === 2, "S.A. tem peso 2");

// --- RECUSA ESTRUTURAL
bloqueia(() => car({ content: [{ type: "document", source: { type: "file", file_id: "f1" } }] }), "file_id no payload");
bloqueia(() => car({ content: [{ type: "document", source: { type: "base64", data: "AAA" } }] }), "base64 no payload");
bloqueia(() => car({ content: [{ type: "image", source: { type: "base64", data: "AAA" } }] }), "imagem no payload");
passa(() => car({ content: [{ type: "text", text: "so texto" }] }), "so texto passa");

// --- O CARIMBO: snapshot, nao referencia
{
  const p = { m: "tudo limpo aqui" };
  const marca = car(p);
  ok(TR.estaCarimbado(marca), "carimbo reconhecido");
  ok(marca.corpo === JSON.stringify(p), "carimbo leva o CORPO verificado");
  p.m = "agora com Elioneudo Evaristo";       // muta DEPOIS de carimbar
  ok(marca.corpo.indexOf("Elioneudo") === -1, "mutar o payload depois NAO muda o corpo carimbado");
  n++; try { marca.corpo = "outro"; } catch { /* strict: lanca */ }
  ok(marca.corpo !== "outro", "corpo do carimbo e imutavel (frozen)");
}
ok(TR.estaCarimbado({ corpo: "x" }) === false, "objeto fabricado a mao NAO passa por carimbado");
ok(TR.estaCarimbado(null) === false, "null nao e carimbado");

// --- a mensagem de erro NUNCA mostra o valor
{
  n++;
  try { car({ m: "Elioneudo Evaristo" }); mau++; console.log("  FALHOU: devia bloquear"); }
  catch (e) {
    if (/elioneudo/i.test(e.message)) { mau++; console.log("  FALHOU: a mensagem VAZOU o valor:", e.message); }
    else if (e.tipo !== "PESSOA") { mau++; console.log("  FALHOU: nao reportou o tipo:", e.tipo); }
  }
}

// --- sem PSEUD, LANCA em vez de passar em silencio
{
  const salvo = globalThis.PSEUD;
  delete globalThis.PSEUD;
  n++;
  try { car({ m: "qualquer coisa" }); mau++; console.log("  FALHOU: passou SEM a normalizacao compartilhada"); }
  catch (e) { if (!/pseudonimos/.test(e.message)) { mau++; console.log("  FALHOU: erro errado:", e.message); } }
  globalThis.PSEUD = salvo;
}

// --- colherStrings separa textos de chaves (a 3a passada nao pode intercalar chave)
{
  const r = TR.colherStrings({ c: [{ text: "Maria" }, { text: "Silva" }] });
  ok(r.textos.join(" ") === "Maria Silva", "concatenacao junta so os VALORES", r.textos);
  ok(r.chaves.includes("text") && r.chaves.includes("c"), "chaves colhidas a parte", r.chaves);
}

console.log(`  ${n - mau}/${n} asseroes`);
process.exit(mau ? 1 : 0);
