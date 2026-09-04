// A PECA QUE SO A LISTA OFICIAL CONHECE, e o download dela.
//
// Desde a v0.38 a lista do painel vem da rota REST, que e um SUPERCONJUNTO da
// timeline e NAO injeta no #divTimeLine. `ativarPeca` procura o link por la,
// entao a peca fora do trecho rolado nunca era ativada -- e o endpoint de
// download so libera o que foi aberto na sessao JSF. Resultado: falha de
// download numa peca que existe nos autos, com a mensagem mandando "abra-a na
// linha do tempo", que e justamente o que nao da para fazer.
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
import fs from "node:fs";
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

let n = 0, mau = 0;
const ok = (c, nome, extra) => {
  n++;
  if (!c) { mau++; console.log("  FALHOU: " + nome + (extra === undefined ? "" : " " + JSON.stringify(extra))); }
};
console.log("=== peca fora da linha do tempo: o download alcanca? ===");

// TODAS as pecas do processo. A timeline comeca mostrando so as PRIMEIRAS: as
// outras chegam por lazy load quando alguem rola ate o fim -- que e o
// comportamento real do PJe.
const TODAS = ["184100101", "184100102", "184100103", "184100104", "184100105", "184100106"];
const VISIVEIS_NO_INICIO = 2;

function montar(opcoes) {
  const o = opcoes || {};
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="pageBody">' +
      '<div id="divTimeLine"><div class="eventos-timeline scroll-y"></div></div>' +
      "</div></body></html>",
    { url: "https://pje.tjce.jus.br/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=777&ca=abc",
      runScripts: "dangerously" }
  );
  const w = dom.window;
  const doc = w.document;
  const cont = doc.querySelector(".eventos-timeline");

  // O scroller: jsdom nao faz layout, entao as metricas sao declaradas a mao.
  let alturaConteudo = 400;
  Object.defineProperty(cont, "scrollHeight", { get: () => alturaConteudo, configurable: true });
  Object.defineProperty(cont, "clientHeight", { get: () => 100, configurable: true });
  let topo = 0;
  Object.defineProperty(cont, "scrollTop", {
    get: () => topo,
    set: (v) => {
      topo = v;
      // LAZY LOAD: rolar ate o fim traz a proxima leva.
      if (v >= alturaConteudo - 100 && mostradas < TODAS.length) {
        mostradas = Math.min(TODAS.length, mostradas + 2);
        alturaConteudo += 200;
        pintar();
      }
    },
    configurable: true,
  });
  Object.defineProperty(cont, "style", { value: { overflowY: "auto" }, configurable: true });
  w.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });

  let mostradas = o.timelineVazia ? 0 : VISIVEIS_NO_INICIO;
  const cliques = [];
  function pintar() {
    cont.innerHTML = "";
    for (const id of TODAS.slice(0, mostradas)) {
      const a = doc.createElement("a");
      a.textContent = id + " - Peça " + id;
      a.addEventListener("click", () => { cliques.push(id); abertas.add(id); });
      cont.appendChild(a);
    }
  }
  const abertas = new Set(o.jaAbertas || []);
  pintar();

  // O servidor: 404 enquanto a peca nao foi ABERTA na sessao (clique na
  // timeline); depois, o conteudo. E a regra stateful real do PJe.
  const pedidos = [];
  w.fetch = async (url, init) => {
    pedidos.push(String(url));
    const m = String(url).match(/download\/(?:.*\/)?(\d+)$/);
    const id = m ? m[1] : null;
    if ((init && init.method === "HEAD") || (init && init.method) === "HEAD") {
      return { ok: abertas.has(id), status: abertas.has(id) ? 200 : 404 };
    }
    if (!id || !abertas.has(id)) return { ok: false, status: 404, text: async () => "" };
    return {
      ok: true,
      status: 200,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      blob: async () => ({
        size: 40,
        type: "text/html",
        text: async () => "<p>conteudo da peca " + id + "</p>",
        slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
        arrayBuffer: async () => new TextEncoder().encode("<p>conteudo da peca " + id + "</p>").buffer,
      }),
    };
  };

  const s = doc.createElement("script");
  s.textContent = fs.readFileSync(__RAIZ + "/src/pje.js", "utf8") + "\n;window.__PJE = PJE;";
  doc.body.appendChild(s);
  return { w, PJE: w.__PJE, cont, cliques, pedidos, posicao: () => topo };
}

// ------------------------------------------------------- o caso do defeito
{
  const a = montar();
  ok(a.PJE.listarDocumentos().length === VISIVEIS_NO_INICIO,
    "a timeline comeca parcial (lazy load), como no PJe");
  ok(!a.PJE.temNaTimeline("184100106"), "a peca 184100106 NAO esta na timeline");
  a.cont.scrollTop = 0; // fixa a posicao de leitura do usuario
  const corpo = await a.PJE.baixar("184100106").catch((e) => ({ erro: e.message }));
  ok(corpo && !corpo.erro, "a peca 184100106 BAIXA -- era isto que falhava", corpo && corpo.erro);
  ok(a.cliques.includes("184100106"), "ela foi ativada na timeline (o clique A4J aconteceu)");
  ok(a.posicao() === 0, "e a rolagem do usuario volta para onde estava", a.posicao());
}

// --------------------------------------- NAO-REGRESSAO: peca ja visivel
// O caminho de 100% das pecas do trecho carregado nao pode mudar: sem rolagem,
// sem varredura, exatamente como antes.
{
  const a = montar();
  const antesDeTudo = a.PJE.listarDocumentos().length;
  const corpo = await a.PJE.baixar("184100101").catch((e) => ({ erro: e.message }));
  ok(corpo && !corpo.erro, "peca visivel baixa normalmente");
  ok(a.PJE.listarDocumentos().length === antesDeTudo,
    "e a timeline NAO foi rolada por causa dela", a.PJE.listarDocumentos().length);
}

// ------------------------------- peca que nao existe: a MENSAGEM mudou
// Ela mandava "abra-a na linha do tempo do processo" -- o laco sem saida, uma
// orientacao impossivel para uma peca que nao esta la.
{
  const a = montar();
  let msg = "";
  await a.PJE.baixar("184100999").catch((e) => { msg = e.message; });
  ok(msg.length > 0, "peca inexistente ainda falha");
  ok(!/abra-a na linha do tempo/.test(msg),
    "e NAO manda mais abrir na linha do tempo uma peca que nao esta la", msg);
  ok(/lista oficial/.test(msg) && /Passe o mouse/.test(msg),
    "a mensagem diz o que houve e o que da para fazer", msg);
}

// ------------------------------------ a varredura vale para TODAS as pecas
// Sem esta memoria, cada peca inalcancavel de um lote custaria uma varredura
// inteira (ate 90 s cada).
{
  const a = montar();
  await a.PJE.baixar("184100998").catch(() => {});
  const rolagens1 = a.PJE.listarDocumentos().length;
  const antes = a.pedidos.length;
  await a.PJE.baixar("184100997").catch(() => {});
  ok(a.PJE.listarDocumentos().length === rolagens1,
    "a segunda peca inalcancavel nao roda outra varredura");
  ok(a.pedidos.length - antes <= 4,
    "e so gasta os requests de download, nao uma timeline inteira", a.pedidos.length - antes);
}


// ------------------- o RE-RENDER transitorio nao pode envenenar a memoria
// O mesmo A4J que traz as pecas RE-RENDERIZA a timeline, e durante a troca o
// #divTimeLine nao existe. Se a varredura sair dali dizendo "completa", a
// memoria `timelineVarridaAteOFim` liga -- e ela NUNCA volta: um soluco de
// re-render tornaria toda peca fora da timeline inalcancavel pelo resto da
// sessao, sem sintoma. E a mesma familia do falso positivo do `telaMorta`.
{
  const a = montar();
  const doc = a.w.document;
  const tl = doc.querySelector("#divTimeLine");
  const pai = tl.parentNode;
  // Some com a timeline no meio da primeira rolagem e devolve logo depois.
  let jaSumiu = false;
  const original = doc.querySelector.bind(doc);
  doc.querySelector = (sel) => {
    if (sel === "#divTimeLine" && !jaSumiu) {
      jaSumiu = true;
      return null; // o retrato tirado durante o re-render
    }
    return original(sel);
  };
  await a.PJE.baixar("184100996").catch(() => {});
  doc.querySelector = original;
  if (!tl.parentNode) pai.appendChild(tl);

  // A peca seguinte TEM de disparar uma varredura de verdade -- e achar.
  const corpo = await a.PJE.baixar("184100106").catch((e) => ({ erro: e.message }));
  ok(corpo && !corpo.erro,
    "depois de um re-render transitorio, a busca ainda funciona", corpo && corpo.erro);
}

console.log("  " + n + "/" + n + " asserções" + (mau ? " (" + mau + " FALHARAM)" : ""));
process.exit(mau ? 1 : 0);
