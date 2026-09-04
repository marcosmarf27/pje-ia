// Boot + caminho de ENVIO do content.js em jsdom, com PJe e chrome falsos.
// É o teste que pega erro de ordem de inicialização (zona morta temporal) e
// regressão no fluxo mais usado do produto. Roda dois cenários: o provedor
// padrão de hoje (OpenAI) e o novo (OpenRouter).
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { fileURLToPath as __paraCaminho } from "node:url";
import { sep as __sep } from "node:path";
// Raiz do repositório, derivada deste arquivo: o teste roda de qualquer
// diretório e em qualquer sistema. Normaliza para barra normal porque os
// caminhos concatenados abaixo a usam.
const __RAIZ0 = __paraCaminho(new URL("..", import.meta.url)).split(__sep).join("/");
const __RAIZ = __RAIZ0.endsWith("/") ? __RAIZ0.slice(0, -1) : __RAIZ0;

const SRC = __RAIZ + "/src/";
const ler = (f) => fs.readFileSync(SRC + f, "utf8");

let ok = 0, fail = 0;
const eq = (a, b, m) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) ok++; else { fail++; console.log("FALHOU: " + m + "\n  esperado: " + B + "\n  obtido:   " + A); }
};
const t = (c, m) => { if (c) ok++; else { fail++; console.log("FALHOU: " + m); } };

async function montar(cenario) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="divTimeLine">
         <a href="#" id="lk1">184100639 - Petição Inicial</a>
         <a href="#" id="lk2">184100640 - Contestação</a>
       </div>
     </body></html>`,
    { runScripts: "dangerously", url: "https://pje.tjce.jus.br/pje1grau/x.seam?idProcesso=99" }
  );
  const w = dom.window;

  // --- APIs que o jsdom não tem
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.requestIdleCallback = (f) => w.setTimeout(f, 0);
  w.cancelIdleCallback = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.CSS = { escape: (s) => String(s) };
  w.Element.prototype.setPointerCapture = function () {};
  w.Element.prototype.releasePointerCapture = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.animate = function () { return { cancel() {}, finished: Promise.resolve() }; };
  // jsdom não implementa Response: `PJE.lerAnexo` e o fetch do CSS dependem dela
  w.Response = globalThis.Response;
  w.fetch = async () => ({ ok: true, text: async () => "/* css */", json: async () => ({}) });

  // --- chrome
  const store = { local: Object.assign({ model: cenario.model }, cenario.storage || {}), session: {} };
  const enviadosPorta = [];
  const rpcVistos = [];
  const portas = [];
  function areaGet(nome) {
    return (chaves, cb) => {
      const o = {};
      if (chaves == null) Object.assign(o, store[nome]);
      else if (typeof chaves === "string") o[chaves] = store[nome][chaves];
      else if (Array.isArray(chaves)) for (const k of chaves) o[k] = store[nome][k];
      else for (const k of Object.keys(chaves)) o[k] = k in store[nome] ? store[nome][k] : chaves[k];
      cb && cb(o);
    };
  }
  w.chrome = {
    runtime: {
      id: "teste",
      lastError: null,
      getManifest: () => ({ version: "0.54.0" }),
      getURL: (p) => "chrome-extension://teste/" + p,
      sendMessage: (msg, cb) => {
        rpcVistos.push(msg);
        let resp = {};
        if (msg.type === "caps") resp = cenario.caps;
        else if (msg.type === "countTokens") resp = cenario.countTokens || { tokens: 100, contextTokens: 1000000 };
        else if (msg.type === "upload") resp = { fileId: "file_x", provider: cenario.caps.caps.provider, chaveHash: "aa" };
        else if (msg.type === "casoLer") resp = { ok: true, caso: null };
        else if (msg.type === "convLer") resp = { ok: true, conversa: null };
        else if (msg.type === "casoListar") resp = { ok: true, casos: [] };
        else if (msg.type === "casoSalvar" || msg.type === "convSalvar" || msg.type === "casoPecas")
          resp = { ok: true, atualizadoEm: 1, convId: "c1" };
        cb && cb(resp);
      },
      connect: () => {
        const p = {
          _msgs: [],
          postMessage(m) {
            enviadosPorta.push(m);
            if (m.type === "chat") {
              // responde um turno mínimo e completo
              setTimeout(() => {
                p._onMsg.forEach((f) => f({ type: "iter" }));
                p._onMsg.forEach((f) => f({ type: "delta", text: "resposta" }));
                p._onMsg.forEach((f) =>
                  f({ type: "done", content: [{ type: "text", text: "resposta" }], stopReason: "end_turn",
                      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                      usageReq: { input_tokens: 10, output_tokens: 5 }, custoUsd: 0.01 })
                );
              }, 0);
            }
          },
          _onMsg: [], _onDis: [],
          onMessage: { addListener: (f) => p._onMsg.push(f) },
          onDisconnect: { addListener: (f) => p._onDis.push(f) },
          disconnect() {},
        };
        portas.push(p);
        return p;
      },
    },
    storage: {
      local: { get: areaGet("local"), set: (o, cb) => { Object.assign(store.local, o); cb && cb(); }, remove: (k, cb) => { cb && cb(); } },
      sync: { get: areaGet("session"), set: (o, cb) => cb && cb(), remove: (k, cb) => cb && cb() },
      session: { get: areaGet("session"), set: (o, cb) => { Object.assign(store.session, o); cb && cb(); } },
      onChanged: { addListener: () => {} },
    },
  };

  // --- stubs dos globais de content script (PJE e as bibliotecas)
  const baixadas = [];
  w.__stub = {
    PJE: {
      dialeto: () => "legacy",
      suportado: () => true,
      dlog: () => {},
      gestoJsf: () => {},
      contadorAtivacoes: () => 0,
      ativacaoEmVoo: () => false,
      ehTelaDeErro: () => false,
      telaDosAutosViva: () => true,
      getIdProcesso: () => "99",
      getNumeroProcesso: () => "0000001-02.2026.8.06.0001",
      chaveDoCaso: () => "pje.tjce.jus.br|1|99",
      listarDocumentos: () => [
        { id: "184100639", titulo: "184100639 - Petição Inicial" },
        { id: "184100640", titulo: "184100640 - Contestação" },
      ],
      listarPelaApi: async () => null,
      listarPelaGrid: async () => null,
      carregarTimelineCompleta: async () => ({ total: 2 }),
      listarMovimentacoes: async () => null,
      lerEventos: () => [],
      lerCabecalhoProcesso: () => null,
      scrollAte: () => true,
      temNaTimeline: () => true,
      baixar: async (id) => {
        baixadas.push(id);
        // A PRIMEIRA peça é PDF de propósito: é o único tipo que passa pela
        // Files API, então é ela que distingue o caminho por REFERÊNCIA (os três
        // provedores diretos) do caminho INLINE (OpenRouter). A segunda é texto
        // — `kind:"text"`, NUNCA "texto" (`fmt` é que vale "texto"/"html"/"rtf");
        // com o valor errado a peça cai em semConteudo e o request sai sem ela.
        // Peça em IMAGEM sob demanda: é o anexo em foto (BO fotografado,
        // print), que a extensão trata como prova de primeira classe.
        if (cenario.imagem && id === "184100640")
          return { kind: "img", fmt: "jpeg", b64: "/9j/4AAQSkZJRg==", size: 14, mime: "image/jpeg", w: 800, h: 600 };
        if (id === "184100639")
          return { kind: "pdf", fmt: "pdf", b64: "QkFTRTY0REFQRUNB", size: 12, pages: cenario.pages || 3 };
        return { kind: "text", fmt: "html", text: "CONTEUDO DA PECA " + id, size: 30 };
      },
      baixarPdfOficial: async () => null,
      // LÊ o arquivo de verdade. Enquanto devolvia `null`, o anexo era
      // registrado sem conteúdo e nenhum teste conseguia provar que ele CHEGA
      // ao request — o chip aparecia na tela e o payload saía sem o documento.
      // Um stub que sempre falha faz o teste passar por vacuidade.
      lerAnexo: async (file) => ({
        kind: "text",
        fmt: "texto",
        text: await file.text(),
        size: file.size || 0,
      }),
    },
    PLIB: { TETO: 8000, listar: async () => [], aoMudar: () => {}, novoId: () => "p1", salvar: async () => {}, excluir: async () => {}, bytesDe: () => 0 },
    MLIB: {
      CATEGORIAS: [{ id: "sentenca", rotulo: "Sentenças" }],
      TETO: 60000, listar: async () => [], aoMudar: () => {}, novoId: () => "m1",
      salvar: async () => {}, excluir: async () => {}, bytesDe: () => 0,
      rotuloCategoria: () => "Sentenças", fichaImportada: () => ({}), medirFicha: () => 0,
      marcarDuplicados: () => [], salvarLote: async () => ({ ok: [], erros: [] }),
    },
    ZipW: function () {},
    PjeExport: { montarZip: async () => new w.Blob([]), ordenarCronologico: (d) => d, montarZipTexto: async () => new w.Blob([]), montarZipPrecatorias: async () => new w.Blob([]) },
    PjePrecatoria: { achar: () => [] },
  };
  const ponte = w.document.createElement("script");
  ponte.textContent =
    "var PJE=window.__stub.PJE, PLIB=window.__stub.PLIB, MLIB=window.__stub.MLIB," +
    "ZipW=window.__stub.ZipW, PjeExport=window.__stub.PjeExport, PjePrecatoria=window.__stub.PjePrecatoria," +
    "CASO=undefined;";
  w.document.head.appendChild(ponte);

  const erros = [];
  w.addEventListener("error", (e) => erros.push(String(e.error || e.message)));
  for (const f of ["panel.js", "content.js"]) {
    const s = w.document.createElement("script");
    s.textContent = ler(f);
    w.document.head.appendChild(s);
  }
  await new Promise((r) => setTimeout(r, 60));
  return { w, dom, erros, enviadosPorta, rpcVistos, baixadas, store };
}

function shadow(w) {
  const host = [...w.document.documentElement.children].find((e) => e.shadowRoot);
  return host && host.shadowRoot;
}

// ============================================================================
const CAPS_OPENAI = {
  model: "gpt-5.6-luna", effort: "high",
  caps: { provider: "openai", contextTokens: 1050000, maxPages: 500, citacoesNativas: false, effort: true, preco: { in: 0.2, out: 1.2 } },
  minuta: { model: "gpt-5.6-terra", caps: { provider: "openai", contextTokens: 1050000, maxPages: 500 }, trocado: true, fixado: false },
  chaveHash: "aa",
};
const CAPS_OR = {
  model: "or:anthropic/claude-sonnet-5", effort: "high",
  caps: {
    provider: "openrouter", nome: "Anthropic: Claude Sonnet 5", contextTokens: 1000000,
    maxPages: 500, citacoesNativas: false, filesApi: false, contagemTokens: false,
    aceitaPdf: true, effort: true, preco: { in: 2, out: 10 },
  },
  minuta: { model: "or:anthropic/claude-sonnet-5", caps: { provider: "openrouter", contextTokens: 1000000, maxPages: 500 }, trocado: false, fixado: false },
  chaveHash: "aa",
};

async function cenarioEnvio(nome, cfg) {
  const amb = await montar(cfg);
  const { w, erros, enviadosPorta, rpcVistos, baixadas } = amb;
  const sr = shadow(w);
  t(!!sr, nome + ": painel montou no Shadow DOM");
  eq(erros, [], nome + ": nenhum erro de boot (zona morta temporal)");

  // a lista de peças chegou ao painel
  const rows = sr.querySelectorAll(".docrow");
  t(rows.length === 2, nome + ": 2 peças na lista (obtido " + rows.length + ")");

  // COMPORTAMENTO: os handlers do FIM do content.js subiram? (um arquivo
  // abortado no meio ainda monta o painel e lista as peças)
  t(typeof sr.querySelector(".doclist").onpointerdown !== "undefined", nome + ": doclist existe");

  // marca a 1ª peça e envia
  const cb = sr.querySelector('.docrow input[type="checkbox"]');
  cb.checked = true;
  cb.dispatchEvent(new w.Event("change", { bubbles: true }));
  const ta = sr.querySelector("textarea.in");
  ta.value = "resuma o processo";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  const btn = sr.querySelector(".send");
  console.log("   [dbg " + nome + "] send disabled=" + btn.disabled +
    " | selecionados=" + sr.querySelectorAll('.docrow input:checked').length +
    " | textarea=" + JSON.stringify(ta.value) +
    " | configurado=" + !sr.querySelector(".wrap").classList.contains("nokey"));
  btn.click();
  await new Promise((r) => setTimeout(r, 250));
  console.log("   [dbg " + nome + "] status=" + JSON.stringify((sr.querySelector(".status")||{}).textContent) +
    " | msgs=" + sr.querySelectorAll(".msg").length +
    " | portaMsgs=" + JSON.stringify(enviadosPorta.map(m=>m.type)) +
    " | rpc=" + JSON.stringify(rpcVistos.map(m=>m.type)));

  const status = (sr.querySelector(".status") || {}).textContent || "";
  t(!/Lendo a lista oficial|Exportação em andamento|Marque uma peça/.test(status), nome + ": envio não foi recusado pela fila (status: " + status + ")");
  t(baixadas.includes("184100639"), nome + ": PJE.baixar chamado para a peça marcada");
  const chat = enviadosPorta.find((m) => m.type === "chat");
  t(!!chat, nome + ": mensagem {type:'chat'} foi para o worker");
  const corpo = JSON.stringify(chat && chat.payload);
  t(!/__pecaId/.test(corpo), nome + ": __pecaId não vaza no payload");
  const doc = (((chat || {}).payload || {}).messages || [])
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .find((b) => b && b.type === "document");
  t(!!doc, nome + ": bloco document da peça no payload");
  return { amb, sr, chat, rpcVistos, doc };
}

// ---------------------------------------------- cenário A: OpenAI (não-regressão)
{
  const { rpcVistos, doc } = await cenarioEnvio("[OpenAI]", { model: "gpt-5.6-luna", storage: { openaiApiKey: "sk-o" }, caps: CAPS_OPENAI });
  t(rpcVistos.some((m) => m.type === "countTokens"), "[OpenAI]: pré-voo count_tokens rodou (comportamento de hoje)");
  t(rpcVistos.some((m) => m.type === "upload"), "[OpenAI]: upload à Files API foi tentado (comportamento de hoje)");
  eq(doc && doc.source && doc.source.type, "file", "[OpenAI]: PDF vai por REFERÊNCIA (file_id)");
}

// ------------------------------------------------- cenário B: OpenRouter (novo)
{
  const { rpcVistos, chat, doc } = await cenarioEnvio("[OpenRouter]", {
    model: "or:anthropic/claude-sonnet-5", storage: { openrouterApiKey: "sk-or" }, caps: CAPS_OR,
  });
  t(!rpcVistos.some((m) => m.type === "upload"), "[OpenRouter]: NENHUM upload tentado (cap filesApi:false)");
  eq(doc && doc.source && doc.source.type, "base64", "[OpenRouter]: PDF vai INLINE em base64");
  eq(doc && doc.source && doc.source.data, "QkFTRTY0REFQRUNB", "[OpenRouter]: os bytes da peça estão no payload");
  const ct = rpcVistos.filter((m) => m.type === "countTokens");
  t(ct.length === 0, "[OpenRouter]: pré-voo NÃO vai ao worker (cap contagemTokens:false) — " + ct.length + " chamadas");
  t(!!chat, "[OpenRouter]: o turno saiu mesmo sem contagem de tokens");
}

// -------------------------- cenário C: guarda de contexto pela estimativa local
{
  // janela minúscula: a estimativa local (peça + histórico + system) passa de 90%
  const capsPequeno = JSON.parse(JSON.stringify(CAPS_OR));
  capsPequeno.caps.contextTokens = 1000;
  const amb = await montar({ model: "or:anthropic/claude-sonnet-5", storage: { openrouterApiKey: "sk-or" }, caps: capsPequeno });
  const sr = shadow(amb.w);
  const cb = sr.querySelector('.docrow input[type="checkbox"]');
  cb.checked = true;
  cb.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
  const ta = sr.querySelector("textarea.in");
  ta.value = "resuma";
  ta.dispatchEvent(new amb.w.Event("input", { bubbles: true }));
  sr.querySelector(".send").click();
  await new Promise((r) => setTimeout(r, 250));
  const alerta = (sr.querySelector(".alertbar") || {}).textContent || "";
  const chat = amb.enviadosPorta.find((m) => m.type === "chat");
  t(!chat, "[guarda]: turno BARRADO antes de sair (a rede de 90% sobrevive sem count_tokens)");
  t(/contexto|estimativa/i.test(alerta), "[guarda]: alerta de contexto cheio na tela: " + alerta.slice(0, 80));
}

// ------------- cenário D: tokensPagina do catálogo evita a recusa ANTECIPADA
// O espelho do cenário C. Sem `tokensPagina`, a estimativa local conta 2000
// tokens por página de PDF (o número da Anthropic) e, como no OpenRouter a
// guarda roda sobre `max(exato, estimativa)`, esse chute NUNCA é desmentido por
// um count_tokens. Um Gemini de 1M seria barrado com 480 folhas — que ocupam
// 124 mil tokens de verdade, 12% da janela.
//   sem a cap: 480 x 2000 = 960.000 > 90% de 1.048.576 (943.718) -> BARRADO
//   com a cap: 480 x  258 = 123.840 -> passa com folga
// 480 fica abaixo do maxPages (500) de propósito: quem tem de decidir aqui é a
// guarda de contexto, não a de páginas.
{
  const base = JSON.parse(JSON.stringify(CAPS_OR));
  base.caps.contextTokens = 1048576;
  base.caps.nome = "Google: Gemini 3.7 Flash";
  base.model = "or:google/gemini-3.7-flash";
  const semCap = JSON.parse(JSON.stringify(base));
  const comCap = JSON.parse(JSON.stringify(base));
  comCap.caps.tokensPagina = 258; // o que capsDoCatalogoOpenRouter passa a devolver

  for (const [rotulo, caps, esperaEnvio] of [
    ["sem tokensPagina", semCap, false],
    ["com tokensPagina=258", comCap, true],
  ]) {
    const amb = await montar({
      model: "or:google/gemini-3.7-flash",
      storage: { openrouterApiKey: "sk-or" },
      caps,
      pages: 480,
    });
    const sr = shadow(amb.w);
    const cb = sr.querySelector('.docrow input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
    const ta = sr.querySelector("textarea.in");
    ta.value = "houve prescricao?";
    ta.dispatchEvent(new amb.w.Event("input", { bubbles: true }));
    sr.querySelector(".send").click();
    await new Promise((r) => setTimeout(r, 300));
    const foi = !!amb.enviadosPorta.find((m) => m.type === "chat");
    t(
      foi === esperaEnvio,
      "[480 folhas, " + rotulo + "]: esperado " +
        (esperaEnvio ? "o turno SAIR" : "o turno ser BARRADO") +
        ", obtido " + (foi ? "saiu" : "barrado")
    );
  }
}

// ------- cenário E: a cap `aceitaImagem` deixou de ser escrita-e-nunca-lida
// Ela existia em background.js e openrouter.js e NINGUÉM a consumia: inofensivo
// enquanto todo modelo ofertado era multimodal, e um erro no dia em que a lista
// ganhou um modelo de TEXTO PURO (os mais baratos do catálogo do OpenRouter são
// assim). Mandar a imagem daria 400 do provedor — ou, pior, o silêncio de quem
// descarta a parte que não entende, e o modelo responderia sobre uma prova que
// nunca viu. O aviso vai por canal PRÓPRIO: reenviar não resolve, trocar de
// modelo sim.
{
  for (const [rotulo, aceita, esperaImagem] of [
    ["modelo de texto puro", false, false],
    ["modelo multimodal", true, true],
  ]) {
    const caps = JSON.parse(JSON.stringify(CAPS_OR));
    caps.caps.aceitaImagem = aceita;
    const amb = await montar({
      model: "or:deepseek/deepseek-v4-flash",
      storage: { openrouterApiKey: "sk-or" },
      caps,
      imagem: true,
    });
    const sr = shadow(amb.w);
    for (const cb of sr.querySelectorAll('.docrow input[type="checkbox"]')) {
      cb.checked = true;
      cb.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
    }
    const ta = sr.querySelector("textarea.in");
    ta.value = "o que mostra a foto?";
    ta.dispatchEvent(new amb.w.Event("input", { bubbles: true }));
    sr.querySelector(".send").click();
    await new Promise((r) => setTimeout(r, 300));
    const chat = amb.enviadosPorta.find((m) => m.type === "chat");
    t(!!chat, "[" + rotulo + "]: o turno sai (a imagem nao pode derrubar o envio)");
    const blocos = JSON.stringify((chat && chat.payload && chat.payload.messages) || []);
    const temImagem = /"type":"image"/.test(blocos);
    t(temImagem === esperaImagem,
      "[" + rotulo + "]: bloco de imagem no payload = " + temImagem + " (esperado " + esperaImagem + ")");
    // e o rótulo "[Peça anexada como imagem: …]" não pode sobrar sozinho:
    // anunciaria ao modelo um anexo que não foi
    const temRotulo = /Peça anexada como imagem/.test(blocos);
    t(temRotulo === esperaImagem,
      "[" + rotulo + "]: o rotulo do anexo acompanha a imagem (nunca sobra sozinho)");
    if (!esperaImagem) {
      const txt = sr.textContent || "";
      // A v0.56.0 MUDOU o desenho deste caminho, e esta asserção é da v0.54.
      // Naquela versão a peça em imagem era BARRADA quando o modelo não lia
      // imagem, e o canal `semSuporte` avisava na tela ("não lê imagens").
      // Hoje ela não é barrada: `precisaTextoLocal` a manda para o OCR local
      // e ela entra como bloco de TEXTO — a mesma decisão que fez o PDF ir por
      // texto extraído para um modelo que não lê PDF. Não há falha a reportar,
      // porque a peça ENTROU; o que o teste cobra agora é que ela não suma.
      // (Em jsdom não há OCR, então o texto é o marcador de degradação — que
      // é justamente o que o modelo precisa ler para não concluir "não consta".)
      const doc = /"type":"document"/.test(blocos);
      t(doc, "[" + rotulo + "]: a peca entra por TEXTO (nunca some em silencio)");
      t(/não lê o arquivo original|Página/.test(blocos),
        "[" + rotulo + "]: o bloco de texto diz ao modelo o que aconteceu com a peca");
      t(!/envio anterior expirou/.test(txt), "[" + rotulo + "]: NAO usa a dica errada (reenviar nao resolve)");
    }
  }
}


// ------- cenário F: MINUTA a partir de ARQUIVO ANEXADO, sem peça marcada
// Ate a v0.58 a minuta recusava com "Marque as pecas que devem embasar a
// minuta" -- com o chip do arquivo na tela. E o defeito nao era so a guarda: o
// system afirmava "Processo em analise: X" e mandava a ficha com os titulares
// de cada polo, entao um ato redigido a partir de um contrato anexado sairia
// com as partes do processo ABERTO NA TELA. Um ato com as partes erradas e o
// pior defeito possivel num documento assinado -- e sai plausivel.
{
  const amb = await montar({ model: "gpt-5.6-luna", storage: { openaiApiKey: "sk-o" }, caps: CAPS_OPENAI });
  const sr = shadow(amb.w);

  const inp = sr.querySelector(".attach-input");
  t(!!inp, "[minuta+anexo]: o input de anexo existe");
  const arq = new amb.w.File(["CONTRATO DE LOCACAO. Clausula 1: o valor e mil reais."],
    "contrato.txt", { type: "text/plain" });
  Object.defineProperty(inp, "files", { value: [arq], configurable: true });
  inp.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));

  const btnMinuta = sr.querySelector(".btn-minuta");
  t(!!btnMinuta, "[minuta+anexo]: o botao de minutar existe");
  btnMinuta.click();
  await new Promise((r) => setTimeout(r, 60));
  // Especie de REGIME LIVRE (oficio): nao exige tese. A exigencia da Res. CNJ
  // 615 e outro eixo e ja tem teste proprio.
  const selAto = sr.querySelector(".minutabar select");
  if (selAto) {
    const livre = [...selAto.options].find((o) => /of[ií]cio/i.test(o.textContent || ""));
    if (livre) {
      selAto.value = livre.value;
      selAto.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
    }
  }
  await new Promise((r) => setTimeout(r, 40));

  const send = sr.querySelector(".send");
  t(!send.disabled, "[minuta+anexo]: o botao Gerar NAO fica desabilitado sem peca marcada");
  send.click();
  await new Promise((r) => setTimeout(r, 600));

  const chat = amb.enviadosPorta.find((m) => m.type === "chat");
  t(!!chat, "[minuta+anexo]: o turno SAI -- era isto que a guarda barrava");
  if (chat) {
    const corpo = JSON.stringify(chat.payload.messages || []);
    const sys = String(chat.payload.system || "");
    t(/CONTRATO DE LOCACAO/.test(corpo), "[minuta+anexo]: o conteudo do arquivo esta no request");
    t(/NENHUMA peça dos autos/.test(sys),
      "[minuta+anexo]: o system diz que nao ha peca dos autos -- a premissa que evita o ato com as partes erradas");
    t(!/Processo em análise/.test(sys),
      "[minuta+anexo]: e NAO afirma o processo da tela como objeto");
    t(/contexto de trabalho/.test(sys), "[minuta+anexo]: o processo da tela entra como CONTEXTO");
    t(/arquivo anexado/.test(corpo),
      "[minuta+anexo]: a forma de citar um anexo (sem id de peca) vai no pedido");
    t(!/use exatamente estes ids/.test(corpo),
      "[minuta+anexo]: e a lista de ids de peca NAO aparece quando nao ha peca");
  }
}

// ------- cenário G: NÃO-REGRESSÃO da minuta com peça marcada
{
  const amb = await montar({ model: "gpt-5.6-luna", storage: { openaiApiKey: "sk-o" }, caps: CAPS_OPENAI });
  const sr = shadow(amb.w);
  for (const cb of sr.querySelectorAll('.docrow input[type="checkbox"]')) {
    cb.checked = true;
    cb.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
  }
  sr.querySelector(".btn-minuta").click();
  await new Promise((r) => setTimeout(r, 60));
  const selAto = sr.querySelector(".minutabar select");
  if (selAto) {
    const livre = [...selAto.options].find((o) => /of[ií]cio/i.test(o.textContent || ""));
    if (livre) {
      selAto.value = livre.value;
      selAto.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
    }
  }
  await new Promise((r) => setTimeout(r, 40));
  sr.querySelector(".send").click();
  await new Promise((r) => setTimeout(r, 600));
  const chat = amb.enviadosPorta.find((m) => m.type === "chat");
  t(!!chat, "[minuta normal]: o turno sai");
  if (chat) {
    const corpo = JSON.stringify(chat.payload.messages || []);
    const sys = String(chat.payload.system || "");
    t(/Processo em análise/.test(sys), "[minuta normal]: o system volta a afirmar o processo");
    t(!/NENHUMA peça dos autos/.test(sys), "[minuta normal]: sem a premissa de so-anexos");
    t(/use exatamente estes ids/.test(corpo), "[minuta normal]: a lista de ids esta la");
    t(!/arquivo anexado/.test(corpo), "[minuta normal]: e nada sobre anexo");
  }
}


// ------- cenário H: MAPA MENTAL a partir de ARQUIVO ANEXADO, sem peça marcada
// Espelha o cenário F. O mapa usa `systemPromptAtual()`, e `soAnexosNoContexto()`
// ja da TRUE quando nao ha peca marcada nem no historico -- entao a premissa
// vem de graca; o que precisava mudar era a guarda e o fluxo de dados.
{
  const amb = await montar({ model: "gpt-5.6-luna", storage: { openaiApiKey: "sk-o" }, caps: CAPS_OPENAI });
  const sr = shadow(amb.w);
  const inp = sr.querySelector(".attach-input");
  const arq = new amb.w.File(["PROCESSO DE OUTRA VARA. Autor: Fulano."], "outro.txt", { type: "text/plain" });
  Object.defineProperty(inp, "files", { value: [arq], configurable: true });
  inp.dispatchEvent(new amb.w.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));

  const btnMapa = sr.querySelector(".btn-mapa");
  t(!!btnMapa, "[mapa+anexo]: o botao de mapa existe");
  btnMapa.click();
  await new Promise((r) => setTimeout(r, 60));
  const mapabar = sr.querySelector(".mapabar");
  t(mapabar && !mapabar.hidden, "[mapa+anexo]: o modo mapa LIGA sem peca marcada");
  sr.querySelector(".send").click();
  await new Promise((r) => setTimeout(r, 600));

  const chat = amb.enviadosPorta.find((m) => m.type === "chat");
  t(!!chat, "[mapa+anexo]: o turno sai");
  if (chat) {
    const corpo = JSON.stringify(chat.payload.messages || []);
    const sys = String(chat.payload.system || "");
    t(/PROCESSO DE OUTRA VARA/.test(corpo), "[mapa+anexo]: o conteudo do arquivo esta no request");
    t(/arquivo anexado/.test(corpo), "[mapa+anexo]: a forma de citar um anexo vai no pedido");
    t(!/use exatamente estes ids/.test(corpo), "[mapa+anexo]: sem lista de ids de peca");
    t(/contexto de trabalho|NÃO é o objeto/.test(sys),
      "[mapa+anexo]: o system trata o processo da tela como contexto");
  }
}

console.log("\n" + ok + " OK, " + fail + " falhas");
process.exit(fail ? 1 : 0);
