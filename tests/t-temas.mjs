// Fiação dos TEMAS do painel, em jsdom com o panel.js REAL.
//
// O que este teste existe para pegar: a armadilha do CALLBACK SÍNCRONO. O stub
// de `chrome.storage.local.get` chama o callback na hora, então uma
// `aplicarTema` declarada DEPOIS do `get` cairia na zona morta temporal e o
// tema salvo nunca seria aplicado — sem erro visível, só um painel que ignora
// a preferência. Foi assim com `docsOcultas`, `guiaAberta` e `launcherUsado`.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const SRC = __RAIZ + "/src/";
let n = 0;
let ruins = 0;
const ok = (c, msg, extra) => {
  n++;
  if (!c) {
    ruins++;
    console.log("  FALHA: " + msg + (extra !== undefined ? "  [" + extra + "]" : ""));
  }
};

function montar(temaSalvo) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="divTimeLine"></div></body></html>`,
    { runScripts: "dangerously", pretendToBeVisual: true, url: "https://pje.tjce.jus.br/pje1grau/x.seam?idProcesso=99" }
  );
  const w = dom.window;
  const gravado = {};
  const dados = temaSalvo === undefined ? {} : { tema: temaSalvo };
  const area = {
    // SÍNCRONO de propósito: é assim que o stub se comporta e é essa a armadilha.
    get(ch, cb) {
      const out = {};
      if (Array.isArray(ch)) for (const k of ch) if (k in dados) out[k] = dados[k];
      else if (ch && typeof ch === "object") Object.assign(out, ch, dados);
      if (cb) cb(out);
      return Promise.resolve(out);
    },
    set(o, cb) { Object.assign(dados, o); Object.assign(gravado, o); if (cb) cb(); return Promise.resolve(); },
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
  return { w, raiz, wrap: raiz.querySelector(".wrap"), painel: w.__painel, gravado, dados };
}

console.log("=== temas do painel (jsdom, panel.js real) ===");

// --- 1. o tema SALVO e' aplicado no mount (a armadilha do callback sincrono)
{
  const { wrap } = montar("noite");
  ok(wrap.getAttribute("data-tema") === "noite",
     "o tema salvo e' aplicado no mount", wrap.getAttribute("data-tema"));
}

// --- 2. sem tema salvo, nenhum atributo (o padrao e' a ausencia)
{
  const { wrap } = montar(undefined);
  ok(!wrap.hasAttribute("data-tema"),
     "sem preferencia, o painel fica no tema padrao (sem atributo)");
}

// --- 3. restaurar NAO regrava (senao toda aba dispara onChanged no boot)
{
  const { gravado } = montar("papel");
  ok(!("tema" in gravado), "restaurar o tema nao regrava no storage");
}

// --- 4. valor invalido cai no padrao, nao quebra
{
  const { wrap } = montar("ceu-de-brigadeiro");
  ok(!wrap.hasAttribute("data-tema"), "tema desconhecido cai no padrao");
}

// --- 5. a caixa abre com os cinco temas e marca o corrente
{
  const { w, raiz, wrap } = montar("toga");
  raiz.querySelector(".hd .tema").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const cx = raiz.querySelector(".temabox");
  ok(!!cx, "o botao do cabecalho abre a caixa de temas");
  const itens = cx ? cx.querySelectorAll(".tm-i") : [];
  ok(itens.length === 6, "a caixa lista os seis temas", itens.length);
  const marcado = [...itens].filter((b) => b.getAttribute("aria-checked") === "true");
  ok(marcado.length === 1 && marcado[0].dataset.tema === "toga",
     "o tema corrente vem marcado", marcado.map((b) => b.dataset.tema).join(","));
  ok(raiz.querySelector(".hd .tema").getAttribute("aria-expanded") === "true",
     "o botao anuncia que a caixa esta aberta");

  // --- 6. escolher troca o atributo E grava
  const { gravado } = { gravado: null };
  itens[2].dispatchEvent(new w.MouseEvent("click", { bubbles: true })); // papel
  ok(wrap.getAttribute("data-tema") === "papel", "escolher troca o tema", wrap.getAttribute("data-tema"));
  ok(!raiz.querySelector(".temabox"), "a caixa fecha ao escolher");
  void gravado;
}

// --- 7. escolher GRAVA a preferencia
{
  const { w, raiz, gravado } = montar(undefined);
  raiz.querySelector(".hd .tema").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const itens = raiz.querySelectorAll(".temabox .tm-i");
  itens[1].dispatchEvent(new w.MouseEvent("click", { bubbles: true })); // noite
  ok(gravado.tema === "noite", "escolher grava a preferencia", JSON.stringify(gravado));
}

// --- 8. setTema (o caminho do storage.onChanged) aplica SEM regravar:
//        quem recebe a notificacao nao e' quem escolheu, e regravar poria as
//        abas em pingue-pongue.
{
  const { wrap, painel, gravado } = montar(undefined);
  painel.setTema("vidro");
  ok(wrap.getAttribute("data-tema") === "vidro", "setTema aplica o tema");
  ok(!("tema" in gravado), "setTema NAO regrava (evita pingue-pongue entre abas)");
  painel.setTema("");
  ok(!wrap.hasAttribute("data-tema"), "setTema('') volta ao padrao");
}

// --- 9. Esc fecha a caixa
{
  const { w, raiz } = montar(undefined);
  raiz.querySelector(".hd .tema").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(!!raiz.querySelector(".temabox"), "caixa aberta antes do Esc");
  w.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok(!raiz.querySelector(".temabox"), "Esc fecha a caixa de temas");
}

// --- 10. o tema NAO interfere no modo sigiloso: sao eixos ortogonais
{
  const { raiz, wrap, painel } = montar("noite");
  painel.setSigiloso(true, 12);
  ok(wrap.getAttribute("data-tema") === "noite" && wrap.classList.contains("sigiloso"),
     "tema e modo sigiloso convivem no mesmo .wrap");
  ok(!raiz.querySelector(".sigbar"), "a faixa antiga nao existe mais");
  const carimbo = raiz.querySelector(".hd .sigselo");
  ok(carimbo && !carimbo.hidden, "o carimbo aparece no cabecalho");
  ok(/12/.test(carimbo.textContent), "o carimbo mostra a contagem", carimbo.textContent.trim());
  painel.setSigiloProgresso({ feitas: 3, total: 9, detalhe: "fl. 4" });
  ok(/3\/9/.test(carimbo.textContent) && /fl\. 4/.test(carimbo.textContent),
     "o carimbo mostra o progresso da anonimizacao", carimbo.textContent.trim());
  painel.setSigiloProgresso(null);
  ok(/12/.test(carimbo.textContent) && !/3\/9/.test(carimbo.textContent),
     "voltar ao repouso restaura a contagem", carimbo.textContent.trim());
  painel.setSigiloso(false);
  ok(raiz.querySelector(".hd .sigselo").hidden, "desligar esconde o carimbo");
}

console.log("  " + (n - ruins) + "/" + n + " asseroes");
process.exit(ruins ? 1 : 0);
