# TESTES — a suíte de não-regressão

Scripts completos para as verificações do plano. **Copie para o scratchpad, fora do
repositório** — o projeto deliberadamente não versiona testes (não há `package.json`; o
`CLAUDE.md` manda rodá-los fora da árvore). Mantê-los aqui como texto respeita a convenção
e ainda assim os versiona.

```bash
mkdir -p "$TMP/seeu-testes" && cd "$TMP/seeu-testes"
npm init -y >/dev/null && npm i jsdom >/dev/null
export REPO=/c/extensao_pje     # ajuste
```

---

## Armadilhas do harness (todas já produziram resultado falso)

Antes de escrever qualquer teste, leia. Estão registradas no `CLAUDE.md`:

1. **`runScripts: "dangerously"`** — sem isso os `<script>` não executam e o teste morre no
   primeiro stub.
2. **jsdom não implementa `Response`** — sem polyfill que herde o content-type do Blob,
   `lerAnexo` falha com "Response is not defined", e **o erro parece bug do produto**.
3. **`const` de script clássico não vira propriedade de `window`** — para alcançar
   `MLIB`/`PLIB`/`DocxImport`/`AUTOS` do lado do Node é preciso uma **ponte**
   (`<script>window.__X = X</script>`). Sem ela, `if (w.AUTOS)` pula o bloco em silêncio e
   o teste "passa" sem ter rodado.
4. **O host do Shadow DOM está em `document.documentElement`**, não no `body`.
5. **`kind` de peça de texto é `"text"`**, não `"texto"` (`fmt` é que vale `"texto"`).
6. **`chrome.runtime.id` é obrigatório** no stub.
7. **Conferir por COMPORTAMENTO.** Um `content.js` abortado no meio ainda monta o painel e
   lista peças — só os handlers do fim do arquivo denunciam.

---

## `harness.mjs` — base compartilhada

```js
// Base dos testes: monta um JSDOM com os stubs minimos e carrega os content
// scripts na ORDEM do manifest, como o Chrome faz.
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const REPO = process.env.REPO || "/c/extensao_pje";
export const src = (f) => fs.readFileSync(path.join(REPO, "src", f), "utf8");

export function novoDom({ comTimeline = true, dentroDeIframe = false } = {}) {
  const html = comTimeline
    ? `<!doctype html><html><body><div id="divTimeLine"></div></body></html>`
    : `<!doctype html><html><body></body></html>`;

  const dom = new JSDOM(html, {
    url: "https://pje.tjce.jus.br/pje1grau/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=123",
    runScripts: "dangerously",          // ARMADILHA 1
    pretendToBeVisual: true,
  });
  const w = dom.window;

  // ARMADILHA 2 -- sem isto, lerAnexo falha e o erro imita bug do produto.
  if (!w.Response) {
    w.Response = class {
      constructor(body, init = {}) { this._b = body; this.headers = new Map(Object.entries(init.headers || {})); }
      get ok() { return true; }
      async arrayBuffer() { return new ArrayBuffer(0); }
      async text() { return ""; }
    };
  }

  // Stubs que o boot exige.
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.requestIdleCallback = (fn) => setTimeout(fn, 0);
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (!w.CSS) w.CSS = {};
  w.CSS.escape = (s) => String(s).replace(/[^\w-]/g, "\\$&");
  w.Element.prototype.setPointerCapture = function () {};
  w.Element.prototype.releasePointerCapture = function () {};
  w.fetch = async () => new w.Response("");     // panel.css

  w.chrome = {
    runtime: {
      id: "teste",                               // ARMADILHA 6
      getURL: (p) => "chrome-extension://teste/" + p,
      sendMessage: (_m, cb) => cb && cb({ model: "gpt-5.6-luna", effort: "medium", caps: {} }),
      connect: () => ({ postMessage() {}, onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} }),
      onMessage: { addListener() {} },
      lastError: null,
    },
    storage: {
      local: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb(), remove: (_k, cb) => cb && cb() },
      sync:  { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb(), remove: (_k, cb) => cb && cb() },
      session: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb() },
      onChanged: { addListener() {} },
    },
  };

  if (dentroDeIframe) {
    // T3: simula um documento que NAO e o topo. O content.js precisa sair na
    // guarda -- e este e o teste que protege a etapa 06.
    Object.defineProperty(w, "top", { get: () => ({}), configurable: true });
  }

  return { dom, w };
}

// Carrega na ORDEM do manifest. Ponte para o Node no fim (ARMADILHA 3).
export function carregar(w, arquivos) {
  for (const f of arquivos) {
    const s = w.document.createElement("script");
    s.textContent = src(f);
    w.document.documentElement.appendChild(s);
  }
  const ponte = w.document.createElement("script");
  ponte.textContent = `
    try { window.__AUTOS = (typeof AUTOS !== "undefined") ? AUTOS : null; } catch (e) { window.__AUTOS = null; }
    try { window.__PJE   = (typeof PJE   !== "undefined") ? PJE   : null; } catch (e) { window.__PJE = null; }
    try { window.__PANEL = (typeof PjePanel !== "undefined") ? PjePanel : null; } catch (e) { window.__PANEL = null; }
  `;
  w.document.documentElement.appendChild(ponte);
}

export const ORDEM = [
  "pje.js", "autos.js", "caso.js", "zip.js", "exportar.js", "precatoria.js",
  "prompts.js", "modelos.js", "docx-importar.js", "tour.js", "panel.js", "content.js",
];
// Antes da etapa 03, remova "autos.js" da lista.

export function ok(cond, msg) {
  if (!cond) { console.error("FALHOU:", msg); process.exit(1); }
  console.log("  ok:", msg);
}
```

---

## T1 — boot

```js
// t1-boot.mjs -- o content.js sobe INTEIRO e monta o painel.
// Pega erro de ordem de inicializacao (a zona morta temporal), que e o modo de
// falha da troca PJE. -> AUTOS.
import { novoDom, carregar, ORDEM, ok } from "./harness.mjs";

const { w } = novoDom();
carregar(w, ORDEM);
await new Promise((r) => setTimeout(r, 300));

// ARMADILHA 4 -- o host vive em documentElement, nao no body.
const host = [...w.document.documentElement.children].find((e) => e.shadowRoot);
ok(!!host, "o host do Shadow DOM foi anexado");

const sr = host.shadowRoot;
ok(!!sr.querySelector(".doclist"), "a lista de pecas existe");
ok(!!sr.querySelector(".send"), "o botao de enviar existe");

// ARMADILHA 7 -- conferir por COMPORTAMENTO: um content.js abortado no meio
// ainda monta o painel. So os handlers do FIM do arquivo denunciam.
ok(typeof w.__AUTOS === "object" && w.__AUTOS, "o global AUTOS existe");
ok(typeof w.__AUTOS.listarDocumentos === "function", "AUTOS cumpre o contrato");

console.log("T1 OK");
```

> **Reforço recomendado:** simular arrastar / Shift+clique / botão direito sobre `.docrow`
> e conferir que a seleção em faixa responde. É o que prova que os handlers do fim de
> `content.js` subiram — e foi exatamente esse bloco que uma zona morta temporal já
> derrubou inteiro, sem erro visível.

---

## T2 — caminho do envio

```js
// t2-envio.mjs -- marcar peca -> baixar -> chegar ao worker com o conteudo.
import { novoDom, carregar, ORDEM, ok } from "./harness.mjs";

const { w } = novoDom();

const enviados = [];
w.chrome.runtime.connect = () => ({
  postMessage: (m) => enviados.push(m),
  onMessage: { addListener() {} },
  onDisconnect: { addListener() {} },
  disconnect() {},
});
w.chrome.storage.local.get = (_k, cb) => cb && cb({ apiKey: "sk-teste", model: "gpt-5.6-luna" });
w.chrome.runtime.sendMessage = (m, cb) => {
  if (m.type === "countTokens") return cb && cb({ input_tokens: 1000 });
  if (m.type === "upload") return cb && cb({ fileId: "file-x", exp: 0 });
  return cb && cb({ model: "gpt-5.6-luna", effort: "medium", caps: { contextTokens: 1000000, maxPages: 500 } });
};

// A timeline precisa ter uma peca no formato "123456 - Nome".
w.document.querySelector("#divTimeLine").innerHTML =
  '<a href="#">184100639 - Contestacao</a>';

carregar(w, ORDEM);
await new Promise((r) => setTimeout(r, 400));

// ARMADILHA 5 -- kind e "text", nao "texto". Com o valor errado a peca e
// recusada, o request sai sem o documento, e o sintoma imita um bug real.
w.__AUTOS.baixar = async () => ({ kind: "text", fmt: "html", text: "TEOR-DA-PECA-TESTE", pages: 1 });

const host = [...w.document.documentElement.children].find((e) => e.shadowRoot);
const sr = host.shadowRoot;

const cb = sr.querySelector('.doclist input[type="checkbox"]');
ok(!!cb, "a peca apareceu na lista");
cb.click();

const ta = sr.querySelector("textarea");
ta.value = "Do que trata esta peca?";
ta.dispatchEvent(new w.Event("input", { bubbles: true }));
sr.querySelector(".send").click();

await new Promise((r) => setTimeout(r, 1500));

const status = (sr.querySelector(".status") || {}).textContent || "";
ok(!/Lendo a lista oficial|Exportacao em andamento/i.test(status), "sem recusa de fila");

const chat = enviados.find((m) => m && m.type === "chat");
ok(!!chat, "um {type:'chat'} foi enviado ao worker");
ok(JSON.stringify(chat).includes("TEOR-DA-PECA-TESTE"), "o teor da peca esta no payload");

console.log("T2 OK");
```

---

## T3 — o iframe da grid ⚠ (o portão da Etapa 06)

```js
// t3-iframe-grid.mjs -- O TESTE MAIS IMPORTANTE DESTA RODADA.
//
// `listarPelaGrid` abre um iframe com a PROPRIA URL dos autos -- e la dentro
// existe #divTimeLine. Com all_frames:true (etapa 06) o content script passa a
// rodar nesse iframe. Se a guarda falhar, nasce um painel inteiro num frame
// invisivel: observers, porta para o worker e requisicao de caps, a cada leitura
// da grid.
//
// O defeito e SILENCIOSO -- nao aparece na tela, nao emite erro, e so se
// manifesta como consumo dobrado. Este teste e a unica coisa entre o projeto e
// ele.
import { novoDom, carregar, ORDEM, ok } from "./harness.mjs";

// Documento COM timeline (como o iframe da grid) mas que NAO e o topo.
const { w } = novoDom({ comTimeline: true, dentroDeIframe: true });

ok(w.top !== w.self, "o cenario e mesmo de um documento nao-topo");

carregar(w, ORDEM);
await new Promise((r) => setTimeout(r, 400));

const host = [...w.document.documentElement.children].find((e) => e.shadowRoot);
ok(!host, "NENHUM painel foi montado num documento que nao e o topo");

// O script RODOU (a flag existe) mas saiu na guarda -- e essa a prova de que a
// protecao e a guarda, e nao a ausencia de injecao.
ok(w.__pjeIaLoaded === true, "o content.js rodou e saiu na guarda (nao foi por nao ter sido injetado)");

console.log("T3 OK");
```

> **Depois da Etapa 05**, acrescente a asserção de que a guarda passa pelo adaptador:
> `ok(w.__AUTOS.ehDocumentoDosAutos() === false, "o adaptador nega este documento")`.

---

## T4 — contrato

```js
// t4-contrato-autos.mjs -- congela o contrato que content.js consome.
// Nao testa comportamento: gera o INVENTARIO, para diff contra o baseline.
import fs from "node:fs";
import path from "node:path";

const REPO = process.env.REPO || "/c/extensao_pje";
const fonte = fs.readFileSync(path.join(REPO, "src", "content.js"), "utf8");

// Ignora linhas de comentario -- o que interessa e o que o codigo CHAMA.
const metodos = new Set();
for (const linha of fonte.split("\n")) {
  if (/^\s*(\/\/|\*)/.test(linha)) continue;
  for (const m of linha.matchAll(/\b(?:PJE|AUTOS)\.([A-Za-z_$][\w$]*)/g)) metodos.add(m[1]);
}
console.log([...metodos].sort().join("\n"));
```

Uso:

```bash
node t4-contrato-autos.mjs > baseline-contrato.txt   # antes da etapa 04
node t4-contrato-autos.mjs > contrato-depois.txt     # depois
diff baseline-contrato.txt contrato-depois.txt && echo "CONTRATO IDENTICO"
```

---

## Checklist de smoke manual no PJe

Nenhum teste automatizado substitui isto. Rodar **depois de cada etapa que toca o PJe**
(04, 05, 06):

- [ ] Painel monta **uma vez** (um launcher, um painel)
- [ ] Lista de peças aparece e as cores das categorias estão certas
- [ ] Marcar peça → enviar → resposta **com citação clicável**
- [ ] Clicar na citação leva à peça na timeline
- [ ] **Arrastar** marca faixa · **Shift+clique** estende · **botão direito** abre o `.selmenu`
- [ ] `⟳ Carregar tudo` funciona **e não duplica painel** (o caminho do iframe)
- [ ] `⬇ Baixar .zip` gera arquivo que abre
- [ ] `✍️ Minutar` abre o editor
- [ ] `🧠 Mapa mental` abre
- [ ] Preview no hover mostra o PDF
- [ ] Medidor de contexto e custo aparecem no rodapé
- [ ] "Nova conversa" limpa; reabrir o processo **retoma** da memória de caso
- [ ] Console **sem erro novo**

---

## ESLint descartável (obrigatório após renomeação em massa)

```bash
npm i eslint >/dev/null
npx eslint --no-eslintrc --env browser,es2022 --parser-options ecmaVersion:2022 \
  --rule '{"no-undef":"error","no-unused-vars":"warn"}' \
  --global chrome --global PJE --global AUTOS --global SEEU --global PjePanel \
  --global PLIB --global MLIB --global ZipW --global PjeExport --global DocxImport \
  --global CASO --global PjeTour --global PjePrecatoria \
  "$REPO/src/content.js" "$REPO/src/autos.js" "$REPO/src/seeu.js"
```

> `node --check` **não pega variável inexistente**. Foi assim que um `ehPdf` sobrevivente
> de uma renomeação derrubou a exportação `.zip` inteira em runtime. **Não pule.**
>
> Falsos positivos esperados e ignoráveis: o `typeof module !== "undefined"` dos rodapés de
> teste e os `var X = (function(){…})()` consumidos por outro arquivo.

**Não deixe a configuração do ESLint no repositório** — o projeto não tem `package.json`.
