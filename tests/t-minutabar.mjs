// A BARRA DE MINUTA, em jsdom com o panel.js REAL.
//
// Ela não tinha teste nenhum — foi o que a rodada da v0.61.0 descobriu ao
// reconstruí-la: nem a linha de peças-modelo, nem os avisos, nem o gate do
// botão. O `grep` por `.minuta-modelo-sel` só achava a CÓPIA regenerada em
// `tests/espelho/`, que o `t-worker` produz e ninguém assere. Uma feature que
// atravessa duas versões sem cobertura é uma feature em que a próxima edição
// acerta ou erra sem nada acusar.
//
// O que ele fixa, e que é o desenho da v0.61.0:
//  (a) a categoria de peças-modelo é DERIVADA da espécie do ato — não há mais
//      um segundo <select> perguntando o que a linha de cima já respondeu;
//  (b) `acordao` cai em `decisao` (a única espécie cuja categoria difere);
//  (c) nenhuma caixa de aviso ÂMBAR no estado normal — eram três;
//  (d) o gate do botão Enviar continua vindo da Res. CNJ 615: sem tese, apagado.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";

const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;
const SRC = __RAIZ + "/src/";

// Lê o panel.css para saber se a classe declara fundo próprio. É a única forma
// honesta em jsdom, que não computa `var()`: o teste pergunta ao ESTILO, não a
// um valor que o ambiente não sabe resolver.
//
// E ele vive AQUI, no topo, e não junto do consumidor: a primeira versão o
// declarava ~15 linhas DEPOIS do único ponto que o usa, e o teste morreu com
// "Cannot access 'CSS' before initialization" — a zona morta temporal que o
// CLAUDE.md registra para o `content.js`, reproduzida no arquivo que existe
// para pegar esse tipo de coisa.
const CSS = readFileSync(SRC + "panel.css", "utf-8");
function regraTemFundo(sel) {
  const m = CSS.match(new RegExp("\\" + sel + "\\s*\\{([^}]*)\\}"));
  return !!m && /background:/.test(m[1]);
}

let n = 0;
let ruins = 0;
const ok = (c, msg, extra) => {
  n++;
  if (!c) {
    ruins++;
    console.log("  FALHA: " + msg + (extra !== undefined ? "  [" + extra + "]" : ""));
  }
};

// Peças-modelo por categoria. O `id` no valor NÃO é enfeite: `MLIB.listar`
// descarta a entrada sem ele, e um fixture sem `id` daria uma biblioteca vazia
// com cara de biblioteca cheia — falso negativo convincente.
function semear(quantos) {
  const dados = {};
  const agora = Date.now();
  let i = 0;
  for (const [cat, n] of Object.entries(quantos || {})) {
    for (let k = 0; k < n; k++) {
      const id = "m" + ++i;
      dados["modelo:" + id] = {
        id,
        titulo: "Modelo " + id,
        categoria: cat,
        descricao: "",
        texto: "Vistos etc. Modelo de referência.",
        criadoEm: agora - i * 1000,
        atualizadoEm: agora - i * 1000,
      };
    }
  }
  return dados;
}

function montar(quantos) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="divTimeLine"></div></body></html>`,
    { runScripts: "dangerously", pretendToBeVisual: true, url: "https://pje.tjce.jus.br/pje1grau/x.seam?idProcesso=99" }
  );
  const w = dom.window;
  const dados = semear(quantos);
  const area = {
    get(ch, cb) {
      let out = {};
      if (ch === null || ch === undefined) out = Object.assign({}, dados);
      else if (Array.isArray(ch)) { for (const k of ch) if (k in dados) out[k] = dados[k]; }
      else if (ch && typeof ch === "object") { out = Object.assign({}, ch); for (const k of Object.keys(ch)) if (k in dados) out[k] = dados[k]; }
      else if (typeof ch === "string" && ch in dados) out[ch] = dados[ch];
      if (cb) cb(out);
      return Promise.resolve(out);
    },
    set(o, cb) { Object.assign(dados, o); if (cb) cb(); return Promise.resolve(); },
    remove(k, cb) { for (const x of [].concat(k)) delete dados[x]; if (cb) cb(); return Promise.resolve(); },
  };
  w.chrome = {
    runtime: { getURL: (p) => "chrome-extension://x/" + p, openOptionsPage() {}, lastError: null },
    storage: { local: area, sync: area, onChanged: { addListener() {} } },
  };
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.requestIdleCallback = (f) => setTimeout(f, 0);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (!w.CSS) w.CSS = {};
  w.CSS.escape = (s) => String(s);
  w.Element.prototype.setPointerCapture = () => {};
  w.Element.prototype.releasePointerCapture = () => {};
  w.fetch = () => Promise.resolve({ text: () => Promise.resolve("") });

  for (const f of ["prompts.js", "modelos.js", "panel.js"]) {
    const el = w.document.createElement("script");
    el.textContent = readFileSync(SRC + f, "utf-8");
    w.document.body.appendChild(el);
  }
  const el = w.document.createElement("script");
  el.textContent = "window.__painel = PjePanel.mount();";
  w.document.body.appendChild(el);

  const raiz = w.document.getElementById("pje-ia-host").shadowRoot;
  const painel = w.__painel;
  painel.setConfigured(true);
  painel.setDocs([
    { id: "185463738", titulo: "185463738 - Peticao inicial", tipo: "Peticao Inicial" },
    { id: "212239678", titulo: "212239678 - Contestacao", tipo: "Contestacao" },
  ]);
  painel.setModelosHabilitado(true);

  const q = (s) => raiz.querySelector(s);
  // O botão recusa sem material (`temMaterialParaAto`, v0.59.0), então marcar
  // uma peça faz parte de ligar o modo — não é conveniência do arnês.
  const ligar = () => {
    const c = q(".doclist input[type=checkbox]");
    if (c && !c.checked) { c.checked = true; c.dispatchEvent(new w.Event("change", { bubbles: true })); }
    q(".btn-minuta").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  };
  const especie = (v) => {
    const s = q(".minuta-ato-sel");
    s.value = v;
    s.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const tese = (t) => {
    const a = q(".mt-txtarea");
    a.value = t;
    a.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  return { w, raiz, painel, q, ligar, especie, tese };
}

console.log("=== barra de minuta (jsdom, panel.js real) ===");

// --- 1. a caixa de peças-modelo é DERIVADA da espécie ----------------------
{
  const { q, ligar, especie } = montar({ sentenca: 3, despacho: 1 });
  ligar();
  especie("sentenca");
  ok(!q(".minuta-modelo").hidden, "com 3 sentenças cadastradas a caixa aparece");
  ok(/\b3\b/.test(q(".mm-txt").textContent),
     "o rótulo conta as peças-modelo da categoria", q(".mm-txt").textContent);
  ok(q(".mm-chk").checked, "nasce MARCADA: seguir os próprios modelos é o mecanismo");
  ok(q(".mm-add").hidden, "havendo modelos, o convite para cadastrar fica escondido");

  especie("despacho");
  ok(!q(".minuta-modelo").hidden, "trocar a espécie troca o conjunto, sem gesto a mais");
  ok(!/\b3\b/.test(q(".mm-txt").textContent),
     "a contagem da categoria anterior não sobrevive à troca", q(".mm-txt").textContent);
  ok(/a minha peça-modelo/.test(q(".mm-txt").textContent),
     "UMA peça-modelo se diz no singular e SEM o número — \"as minhas 1\" é robô falando",
     q(".mm-txt").textContent);
}

// --- 2. `acordao` usa a categoria `decisao` --------------------------------
// A única espécie cuja categoria difere do próprio valor. Errar aqui não dá
// erro nenhum: a minuta sai sem os modelos, calada.
{
  const { q, ligar, especie } = montar({ decisao: 2 });
  ligar();
  especie("acordao");
  ok(!q(".minuta-modelo").hidden,
     "acórdão enxerga os modelos de DECISÃO (MLIB agrupa 'Decisões, votos e acórdãos')");
  ok(/\b2\b/.test(q(".mm-txt").textContent), "com a contagem certa", q(".mm-txt").textContent);

  especie("sentenca");
  ok(q(".minuta-modelo").hidden, "sentença, sem modelos de sentença: a caixa some");
  ok(!q(".mm-add").hidden, "e o convite para cadastrar aparece no lugar");
  ok(/Senten/i.test(q(".mm-add .lbl").textContent),
     "o convite NOMEIA a espécie — cadastrar 'peças-modelo' em abstrato não diz de quê",
     q(".mm-add .lbl").textContent);
}

// --- 3. biblioteca vazia: some o campo, fica a affordance ------------------
// REVISÃO DE DECISÃO da v0.61.0. A regra anterior era "a linha NUNCA some por
// biblioteca vazia", para quem nunca cadastrou não concluir que a feature não
// existe. O que garante isso agora é o convite, não um campo sem opção.
{
  const { q, ligar, especie } = montar({});
  ligar();
  especie("sentenca");
  ok(q(".minuta-modelo").hidden, "biblioteca vazia: nenhum campo de modelos");
  ok(!q(".mm-add").hidden, "mas a affordance CONTINUA — o convite para cadastrar");
}

// --- 4. ZERO caixa âmbar no estado normal ---------------------------------
// Eram três: "informe a tese" (que acusava o usuário antes de ele fazer nada),
// "nenhuma categoria escolhida" (que avisava sobre o PADRÃO) e a nota do
// modelo redator. Nenhuma delas dizia que algo estava errado.
{
  const { w, q, ligar, especie } = montar({ sentenca: 2 });
  ligar();
  especie("sentenca");
  const ambar = [".mt-nota", ".mm-nota", ".perfil-nota"].filter((sel) => {
    const e = q(sel);
    if (!e || e.hidden) return false;
    // jsdom não resolve `var()`, então a pergunta é se a REGRA declara fundo —
    // é isso que distingue a caixa de aviso do texto de apoio.
    return /warn-bg/.test(w.getComputedStyle(e).backgroundColor || "") ||
           regraTemFundo(sel);
  });
  ok(ambar.length === 0, "nenhuma caixa de aviso no estado normal", ambar.join(","));
  ok(!q(".mt-nota").hidden, "a explicação da tese CONTINUA visível — ela virou apoio, não sumiu");
  ok(q(".mm-nota").hidden, "e a nota de modelos fica calada: 'nenhuma categoria' não existe mais");
}

// --- 5. o gate da Resolução CNJ 615 continua de pé -------------------------
// É a razão de a barra existir, e nenhuma simplificação de layout pode afrouxá-lo.
{
  const { q, ligar, especie, tese } = montar({ sentenca: 1 });
  ligar();
  especie("sentenca");
  ok(q(".send").disabled, "sentença sem tese: Gerar minuta APAGADO");
  tese("curta");
  ok(q(".send").disabled, "tese de 5 caracteres não destrava (mínimo de existência)");
  tese("Improcedência pela prescrição do art. 206, §5º, I, do CC.");
  ok(!q(".send").disabled, "com a tese, o botão liga");
  ok(!q(".mt-nota").hidden === false || q(".mt-nota").hidden,
     "e a linha de apoio se cala quando não há mais o que explicar");

  especie("oficio");
  ok(q(".minuta-tese").hidden, "ofício é regime livre: o campo de tese nem aparece");
  ok(!q(".send").disabled, "e o botão fica ligado sem tese nenhuma");
}

// --- 6. a saída para quem ainda não tem a tese -----------------------------
// Bloquear sem alternativa empurra a escrever qualquer coisa só para destravar
// — o oposto do que a exigência existe para conseguir.
{
  const { q, ligar, especie, tese } = montar({});
  ligar();
  especie("sentenca");
  ok(!q(".mt-analise").hidden, "sem tese, 'Analisar o que é cabível' está à mão");
  tese("Improcedência pela prescrição do art. 206, §5º, I, do CC.");
  ok(q(".mt-analise").hidden, "com a tese escrita, a saída some — seria convite a jogá-la fora");
}

// --- 7. desligar o modo devolve a caixa a MARCADA --------------------------
// Desmarcar vale para AQUELE ato. Uma preferência que sobrevivesse faria a
// minuta seguinte sair sem os modelos sem ninguém ter pedido.
{
  const { q, ligar, especie } = montar({ sentenca: 2 });
  ligar();
  especie("sentenca");
  q(".mm-chk").checked = false;
  q(".minutabar-x").click();
  ligar();
  especie("sentenca");
  ok(q(".mm-chk").checked, "religar o modo devolve a caixa a marcada");
}

console.log(ruins ? `  ${ruins} de ${n} FALHARAM` : `  ${n}/${n} asserções`);
if (typeof process !== "undefined") process.exit(ruins ? 1 : 0);
