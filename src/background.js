// Service worker: recebe pedidos do painel, lê a chave/modelo do storage
// (a página nunca vê a chave) e faz streaming da resposta do modelo.
// Também resolve sozinho as continuações de turno (stop_reason "pause_turn",
// quando o loop de ferramentas do servidor atinge o teto de iterações) — o
// content script enxerga um único turno lógico.
// Três provedores: Anthropic (claude.js), Google Gemini (gemini.js) e OpenAI
// (openai.js). O provedor é inferido do id do modelo (prefixos "gemini-" e
// "gpt-") e os três clientes emitem o MESMO vocabulário de eventos — o resto
// deste arquivo não distingue.
import {
  streamClaude,
  uploadFile,
  countTokens,
  MAX_TOKENS_CHAT,
} from "./claude.js";
import {
  streamGemini,
  uploadFileGemini,
  countTokensGemini,
} from "./gemini.js";
import {
  streamOpenAI,
  uploadFileOpenAI,
  countTokensOpenAI,
} from "./openai.js";
// A Mistral não é provedor de chat — só converte peça digitalizada em texto.
// Por isso fica FORA de providerDe()/chaveDe(): trocar o modelo do chat nunca
// deve escolher um OCR.
import { ocrMistral, MISTRAL_MODELS, MISTRAL_MODEL_PADRAO } from "./mistral.js";

// Capacidades por modelo. Governam limites de páginas/contexto, as versões das
// ferramentas web, a configuração de thinking/effort aceita por cada um e o
// preço (US$ por 1M de tokens, tabela pública da Anthropic — Sonnet 5 usa o
// preço de tabela, não o promocional, para nunca subestimar). Cache de prompt:
// gravação ≈ 1,25× o preço de input (TTL 5 min); leitura ≈ 0,1×.
const MODEL_CAPS = {
  "claude-sonnet-5": {
    provider: "anthropic",
    contextTokens: 1000000,
    maxPages: 600,
    webSearch: "web_search_20260209",
    webFetch: "web_fetch_20260209",
    thinking: { type: "adaptive", display: "summarized" },
    effort: true,
    preco: { in: 3, out: 15 },
  },
  "claude-opus-4-8": {
    provider: "anthropic",
    contextTokens: 1000000,
    maxPages: 600,
    webSearch: "web_search_20260209",
    webFetch: "web_fetch_20260209",
    thinking: { type: "adaptive", display: "summarized" },
    effort: true,
    preco: { in: 5, out: 25 },
  },
  "claude-fable-5": {
    provider: "anthropic",
    contextTokens: 1000000,
    maxPages: 600,
    // fable não está na lista das variantes _20260209 — usa as básicas
    webSearch: "web_search_20250305",
    webFetch: "web_fetch_20250910",
    thinking: { type: "adaptive", display: "summarized" },
    effort: true,
    preco: { in: 10, out: 50 },
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    contextTokens: 200000,
    maxPages: 100,
    webSearch: "web_search_20250305",
    webFetch: "web_fetch_20250910",
    thinking: null, // geração anterior: sem adaptive; omitimos thinking
    effort: false, // effort retorna erro no Haiku 4.5
    preco: { in: 1, out: 5 },
  },
  // Modelos Google Gemini (Interactions API). citacoesNativas:false → o
  // system prompt pede citações
  // TEXTUAIS ("conforme a Contestação, fl. 12") e a UI mostra a nota.
  // tokensPagina: 258 (documentação oficial) — a estimativa local usa este
  // valor no lugar dos 2000/pág. da Anthropic. preco.cacheRead: tabela
  // oficial (implicit caching; não há cobrança de gravação).
  "gemini-3.6-flash": {
    provider: "gemini",
    contextTokens: 1000000,
    maxPages: 1000,
    googleSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true, // vira generation_config.thinking_level
    tokensPagina: 258,
    preco: { in: 1.5, out: 7.5, cacheRead: 0.15 },
  },
  "gemini-3.5-flash-lite": {
    provider: "gemini",
    contextTokens: 1000000,
    maxPages: 1000,
    googleSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true,
    tokensPagina: 258,
    preco: { in: 0.3, out: 2.5, cacheRead: 0.03 },
  },
  // Modelos OpenAI GPT-5.6 (Responses API). Família de três níveis: Sol
  // (topo, alias "gpt-5.6"), Terra (equilibrado) e Luna (rápido/barato). Como
  // o Gemini, a OpenAI não tem citação estruturada por página — o system
  // prompt pede citações TEXTUAIS ("na Contestação, id 123456, fl. 12") e a UI
  // mostra a nota (citacoesNativas:false). O effort vira reasoning.effort. Sem
  // limite oficial de páginas de PDF (o limite é 50 MB/request) — maxPages é
  // uma heurística de segurança. preco: US$/1M (in/out) + cacheRead (10% do
  // input, cache automático sem cobrança de gravação). Contexto 1.05M tokens.
  "gpt-5.6-sol": {
    provider: "openai",
    contextTokens: 1050000,
    maxPages: 500,
    webSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true, // vira reasoning.effort
    preco: {
      in: 5,
      out: 30,
      cacheRead: 0.5,
      limiarLongo: 272000,
      longo: { in: 10, out: 45, cacheRead: 1 },
    },
  },
  "gpt-5.6-terra": {
    provider: "openai",
    contextTokens: 1050000,
    maxPages: 500,
    webSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true,
    preco: {
      in: 2,
      out: 12,
      cacheRead: 0.2,
      limiarLongo: 272000,
      longo: { in: 4, out: 18, cacheRead: 0.4 },
    },
  },
  "gpt-5.6-luna": {
    provider: "openai",
    contextTokens: 1050000,
    maxPages: 500,
    webSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true,
    preco: {
      in: 0.2,
      out: 1.2,
      cacheRead: 0.02,
      limiarLongo: 272000,
      longo: { in: 0.4, out: 1.8, cacheRead: 0.04 },
    },
  },
};

// Provedor do modelo (prefixo do id — a lista de modelos vive nos <option>
// do popup/options; ids desconhecidos caem no default Anthropic via capsDe).
function providerDe(model) {
  if (!model) return "anthropic";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("gpt-")) return "openai";
  return "anthropic";
}

// effort salvo (high/medium/low) → thinking_level do Gemini. A escala do
// Gemini tem os mesmos três nomes (há também "minimal", que não usamos: o
// "low" já é a opção econômica equivalente ao effort baixo da Anthropic).
const EFFORT_PARA_THINKING_LEVEL = { high: "high", medium: "medium", low: "low" };

// effort salvo → reasoning.effort da OpenAI. A escala da OpenAI é a MAIS RICA
// dos três provedores: none | minimal | low | medium | high | xhigh | max (e
// ainda um eixo separado reasoning.mode standard|pro|ultra). Mapeamos os três
// níveis da extensão para o subconjunto COMUM low/medium/high — o único aceito
// por todos os provedores. A escala da OpenAI é mais rica — a documentação
// lista none|low|medium|high|xhigh|max nas TRÊS variantes 5.6 —, mas a extensão
// só expõe três níveis ao usuário (baixo/médio/alto), então mapeamos para o
// subconjunto que também existe na Anthropic e no Gemini. "Alto" = high; expor
// xhigh/max um dia é mudança de ponto único, aqui.
const EFFORT_PARA_OPENAI = { high: "high", medium: "medium", low: "low" };

// Custo estimado (US$) do usage de UM request físico, pela tabela do modelo.
// A API não devolve valor monetário — só as contagens de tokens por categoria.
//
// Preço em DEGRAU (`preco.limiarLongo` + `preco.longo`): a OpenAI cobra 2× o
// input e 1,5× o output quando o request passa de 272 mil tokens de entrada, e
// a tarifa maior vale para o request INTEIRO, não só para o excedente. Isso não
// é detalhe aqui: mandar os autos completos passa desse limiar com facilidade —
// é justamente por isso que se escolhe um modelo de 1M —, e sem o degrau o
// rodapé mostraria metade do custo real. Por isso esta função recebe o usage de
// UM request (quem chama soma os custos, não os tokens): somar as iterações de
// pause_turn antes de decidir o degrau cruzaria o limiar sem que nenhum request
// isolado o tivesse cruzado. Modelos sem `longo` na tabela seguem lineares —
// nada muda para Anthropic e Gemini.
function custoUsdDe(usage, preco) {
  if (!usage || !preco) return null;
  const inputDoRequest =
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
  const tab =
    preco.longo && preco.limiarLongo && inputDoRequest > preco.limiarLongo
      ? Object.assign({}, preco, preco.longo)
      : preco;
  // cache read: preço próprio quando a tabela do modelo define (Gemini/OpenAI);
  // senão a regra da Anthropic (0,1× o input) — resultado idêntico ao atual.
  const cacheRead = tab.cacheRead != null ? tab.cacheRead : tab.in * 0.1;
  return (
    ((usage.input_tokens || 0) * tab.in +
      (usage.cache_creation_input_tokens || 0) * tab.in * 1.25 +
      (usage.cache_read_input_tokens || 0) * cacheRead +
      (usage.output_tokens || 0) * tab.out) /
    1e6
  );
}
// Quanto uma página de peça jurídica pesa já convertida em texto (~2.800 chars
// ÷ 3,5 chars/token, as mesmas constantes que content.js usa na estimativa).
const TOKENS_PAGINA_TEXTO = 800;
// Preço do OCR por página, na tabela mais barata da Mistral. Serve só para o
// veredito abaixo; o custo real cobrado sai de MISTRAL_MODELS.
const OCR_USD_PAGINA = 0.002;

// O OCR PAGO compensa financeiramente neste modelo?
//
// Derivado do preço, não escrito à mão em cada entrada, porque a resposta muda
// por MODELO e não por provedor — `gpt-5.6-sol` economiza 40% e `gpt-5.6-luna`
// fica 5× mais caro, sendo o mesmo provedor. E no Gemini a conta inverte de
// vez: lá a página de PDF custa 258 tokens de tabela (com o texto nativo de
// graça), menos do que os ~800 do mesmo conteúdo em texto — extrair AUMENTA o
// custo. A UI usa isto para dizer a verdade do modelo ativo em vez de vender
// economia que não existe.
//
// A extração LOCAL (pdf.js) é grátis e não passa por aqui: ela sempre vale.
function ocrEconomiza(caps) {
  const tokensPdf = caps.tokensPagina || 2000;
  const preco = (caps.preco && caps.preco.in) || 0;
  const economiaPorPagina = ((tokensPdf - TOKENS_PAGINA_TEXTO) * preco) / 1e6;
  return economiaPorPagina > OCR_USD_PAGINA;
}

function capsDe(model) {
  const base = MODEL_CAPS[model] || MODEL_CAPS["claude-haiku-4-5"];
  return Object.assign({}, base, { ocrEconomiza: ocrEconomiza(base) });
}

// Default: Haiku 4.5 — mais rápido e ~3× mais barato que o Sonnet 5; todas as
// features funcionam nele. O custo funcional é a janela menor (200 mil tokens,
// 100 págs. de PDF) — para autos volumosos o usuário troca para o Sonnet 5
// (1M) no popup/opções; o MODEL_CAPS e o medidor cuidam dos limites.
function getCfg() {
  return new Promise((resolve) =>
    chrome.storage.local.get(
      ["apiKey", "geminiApiKey", "openaiApiKey", "mistralApiKey", "model", "effort", "ocrModel"],
      (v) =>
        resolve({
          apiKey: v.apiKey,
          geminiApiKey: v.geminiApiKey,
          openaiApiKey: v.openaiApiKey,
          mistralApiKey: v.mistralApiKey,
          model: v.model || "claude-haiku-4-5",
          effort: v.effort || "high",
          ocrModel: MISTRAL_MODELS[v.ocrModel] ? v.ocrModel : MISTRAL_MODEL_PADRAO,
        })
    )
  );
}

// Chave do provedor do modelo atual, com erro claro quando falta.
function chaveDe(cfg, provider) {
  if (provider === "gemini") {
    if (!cfg.geminiApiKey) {
      throw new Error(
        "configure sua chave da API do Google Gemini nas opções da extensão (o modelo escolhido é Gemini)"
      );
    }
    return cfg.geminiApiKey;
  }
  if (provider === "openai") {
    if (!cfg.openaiApiKey) {
      throw new Error(
        "configure sua chave da API da OpenAI nas opções da extensão (o modelo escolhido é GPT)"
      );
    }
    return cfg.openaiApiKey;
  }
  if (!cfg.apiKey) {
    throw new Error("configure sua ANTHROPIC_API_KEY nas opções da extensão");
  }
  return cfg.apiKey;
}

// Cache (sessão do navegador) de uploads na Files API: peça já enviada não
// sobe de novo, mesmo que a aba recarregue. Chave: idProcesso:idPeca:tamanho.
function sessGet(key) {
  return new Promise((resolve) =>
    chrome.storage.session.get([key], (v) => resolve(v[key]))
  );
}
function sessSet(key, value) {
  return new Promise((resolve) => chrome.storage.session.set({ [key]: value }, resolve));
}

// Mensagens avulsas (request/response): configuração, capacidades do modelo,
// upload de peças e contagem de tokens. O canal de streaming continua no Port.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (msg.type === "caps") {
    // model + effort vão junto: o painel mostra o que está ATIVO (o usuário
    // não deveria precisar confiar às cegas no que salvou nas opções).
    // `ocrPronto` diz se a chave da Mistral existe — é o que liga o NÍVEL 2 da
    // extração na UI. Sem ela, a peça digitalizada simplesmente não oferece o
    // botão (mesmo contrato do PLIB ausente escondendo "Prompts").
    getCfg().then(({ model, effort, mistralApiKey }) =>
      sendResponse({
        model,
        effort,
        caps: capsDe(model),
        ocrPronto: !!mistralApiKey,
      })
    );
    return true; // resposta assíncrona
  }

  // OCR de UMA peça digitalizada (nível 2 da extração; o nível 1 é o pdf.js na
  // página src/extrator.html e não passa pelo worker). Um request por peça: o
  // content script orquestra a fila, e cada sendMessage reseta o timer de
  // ociosidade do worker — mais o manterVivo abaixo, para a peça de 300 páginas
  // que demora mais que os ~30 s do MV3.
  if (msg.type === "ocr") {
    (async () => {
      const parar = manterVivo();
      try {
        const cfg = await getCfg();
        if (!cfg.mistralApiKey) {
          throw new Error(
            "configure sua chave da API da Mistral nas opções da extensão para extrair o texto de peças digitalizadas"
          );
        }
        const r = await ocrMistral({
          apiKey: cfg.mistralApiKey,
          model: cfg.ocrModel,
          b64: msg.payload.b64,
          paginas: msg.payload.paginas,
        });
        sendResponse(r);
      } catch (e) {
        sendResponse({
          error: String((e && e.message) || e),
          retryable: !!(e && e.retryable),
        });
      } finally {
        parar();
      }
    })();
    return true;
  }

  if (msg.type === "upload") {
    (async () => {
      try {
        const cfg = await getCfg();
        const provider = providerDe(cfg.model);
        const apiKey = chaveDe(cfg, provider);
        if (provider === "gemini") {
          // namespace próprio ("gfile:") e VALIDAÇÃO de expiração na leitura:
          // a File API do Google apaga os arquivos após 48 h — um URI vencido
          // no cache derrubaria o request com erro críptico.
          const key = msg.payload.cacheKey ? "gfile:" + msg.payload.cacheKey : null;
          if (key) {
            const cached = await sessGet(key);
            if (cached && cached.uri && cached.exp > Date.now()) {
              return sendResponse({ fileId: cached.uri, provider });
            }
          }
          const r = await uploadFileGemini({
            apiKey,
            filename: msg.payload.filename,
            b64: msg.payload.b64,
            mime: msg.payload.mime,
          });
          if (key) await sessSet(key, { uri: r.fileUri, exp: r.expiraEm });
          return sendResponse({ fileId: r.fileUri, provider });
        }
        if (provider === "openai") {
          // namespace próprio ("ofile:"): um file_id da OpenAI nunca pode ser
          // lido num request Anthropic/Gemini (e vice-versa). Os arquivos da
          // OpenAI persistem na conta, então não há validação de expiração.
          const key = msg.payload.cacheKey ? "ofile:" + msg.payload.cacheKey : null;
          if (key) {
            const cached = await sessGet(key);
            if (cached) return sendResponse({ fileId: cached, provider });
          }
          const fileId = await uploadFileOpenAI({
            apiKey,
            filename: msg.payload.filename,
            b64: msg.payload.b64,
            mime: msg.payload.mime,
          });
          if (key) await sessSet(key, fileId);
          return sendResponse({ fileId, provider });
        }
        const key = msg.payload.cacheKey ? "file:" + msg.payload.cacheKey : null;
        if (key) {
          const cached = await sessGet(key);
          if (cached) return sendResponse({ fileId: cached, provider });
        }
        const fileId = await uploadFile({
          apiKey,
          filename: msg.payload.filename,
          b64: msg.payload.b64,
          mime: msg.payload.mime,
        });
        if (key) await sessSet(key, fileId);
        sendResponse({ fileId, provider });
      } catch (e) {
        sendResponse({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  if (msg.type === "countTokens") {
    (async () => {
      try {
        const cfg = await getCfg();
        const provider = providerDe(cfg.model);
        const apiKey = chaveDe(cfg, provider);
        let tokens;
        if (provider === "gemini") {
          tokens = await countTokensGemini({
            apiKey,
            model: cfg.model,
            system: msg.payload.system,
            messages: msg.payload.messages,
          });
        } else if (provider === "openai") {
          tokens = await countTokensOpenAI({
            apiKey,
            model: cfg.model,
            system: msg.payload.system,
            messages: msg.payload.messages,
            tools: msg.payload.tools,
          });
        } else {
          tokens = await countTokens({
            apiKey,
            model: cfg.model,
            system: msg.payload.system,
            messages: msg.payload.messages,
            tools: msg.payload.tools,
            betas: msg.payload.betas,
          });
        }
        sendResponse({ tokens, contextTokens: capsDe(cfg.model).contextTokens });
      } catch (e) {
        sendResponse({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  // Guarda o markdown de um mapa mental para a página src/mapa.html abrir.
  // Vai por storage.session (some ao fechar o navegador, não polui o local) e
  // é o worker quem grava: a página é contexto confiável e lê direto, e o
  // content script não precisa de acesso à área session.
  if (msg.type === "guardarMapa") {
    (async () => {
      try {
        const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
        await sessSet("mapa:" + id, {
          md: msg.payload.md,
          titulo: msg.payload.titulo,
          processo: msg.payload.processo,
          ts: Date.now(),
        });
        await podarMapas();
        sendResponse({ id });
      } catch (e) {
        sendResponse({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
});

// Mantém no máximo MAX_MAPAS mapas na sessão (cada um é o markdown inteiro de
// um processo; sem poda, uma tarde de uso encheria a cota de 10 MB).
const MAX_MAPAS = 5;
function podarMapas() {
  return new Promise((resolve) =>
    chrome.storage.session.get(null, (tudo) => {
      const chaves = Object.keys(tudo || {})
        .filter((k) => k.startsWith("mapa:"))
        .sort((a, b) => (tudo[b].ts || 0) - (tudo[a].ts || 0));
      const sobrando = chaves.slice(MAX_MAPAS);
      if (!sobrando.length) return resolve();
      chrome.storage.session.remove(sobrando, resolve);
    })
  );
}

// Remove o campo citations dos blocos de texto antes de reenviar conteúdo do
// assistant à API: citações reenviadas são rejeitadas (400 "Extra inputs" /
// "Invalid citation indices"). Bloco de texto sem citações é sempre válido.
function stripCitacoes(blocks) {
  return blocks.map((b) => {
    if (!b || b.type !== "text" || b.citations == null) return b;
    const c = Object.assign({}, b);
    delete c.citations;
    return c;
  });
}

// Teto de continuações pause_turn de um turno lógico. Era configurável por
// payload enquanto a geração de .docx precisava de mais rodadas de execução
// de código; hoje todo turno é chat e 8 basta com folga.
const MAX_ITER = 8;

// Erros transitórios que valem nova tentativa do MESMO request: 429/529/5xx
// (flag retryable vinda do claude.js) e quedas de rede no meio do SSE.
function erroRetryavel(e) {
  if (e && e.retryable) return true;
  const msg = String((e && e.message) || e).toLowerCase();
  return (
    e instanceof TypeError ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("err_")
  );
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Executa um turno completo (com continuações pause_turn), emitindo o progresso
// pelo Port. Retorna {content, stopReason}; lança erro em falha ou recusa.
// payload: {system, messages, tools?, betas?, maxTokens?}
async function executarTurno(port, payload) {
  const cfg = await getCfg();
  const { model, effort } = cfg;
  const caps = capsDe(model);
  const provider = caps.provider || "anthropic";
  const apiKey = chaveDe(cfg, provider);
  // Os três clientes emitem o mesmo vocabulário de eventos — daqui em diante
  // o turno não distingue provedor (nem o Gemini nem a OpenAI emitem
  // pause_turn, então o loop de continuações sai naturalmente na primeira
  // iteração para eles).
  const streamFn =
    provider === "gemini"
      ? streamGemini
      : provider === "openai"
        ? streamOpenAI
        : streamClaude;

  const baseReq = {
    apiKey,
    model,
    system: payload.system,
    max_tokens: payload.maxTokens || MAX_TOKENS_CHAT,
  };
  if (payload.tools && payload.tools.length) baseReq.tools = payload.tools;
  if (provider === "gemini") {
    // Gemini: sem betas/thinking/output_config; o effort vira thinking_level.
    if (caps.effort) {
      baseReq.thinkingLevel = EFFORT_PARA_THINKING_LEVEL[effort] || "medium";
    }
  } else if (provider === "openai") {
    // OpenAI: sem betas/thinking/output_config; o effort vira reasoning.effort.
    if (caps.effort) {
      baseReq.effort = EFFORT_PARA_OPENAI[effort] || "medium";
    }
  } else {
    if (payload.betas && payload.betas.length) baseReq.betas = payload.betas;
    if (caps.thinking) baseReq.thinking = caps.thinking;
    if (caps.effort) baseReq.output_config = { effort };
  }

  let messages = payload.messages;
  let contentAcumulado = [];
  let stopReason = null;
  // Um turno lógico pode ser vários requests físicos (continuações pause_turn):
  // o CUSTO correto é a SOMA dos usage de todas as iterações; já o TAMANHO do
  // contexto é o usage do ÚLTIMO request (cada iteração reenvia o prefixo —
  // somar duplicaria a contagem).
  const usoTotal = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let usoUltimo = null;
  // O custo é somado POR REQUEST, não calculado no fim sobre `usoTotal`: com
  // preço em degrau (OpenAI, acima de 272k de input) o tier é decidido pelo
  // tamanho de CADA request físico. Somar os tokens antes cruzaria o limiar
  // com duas iterações pequenas e cobraria o dobro indevidamente.
  let custoTotal = null;

  // Um turno lógico = até MAX_ITER requests físicos (continuações
  // pause_turn). Cada request físico ganha até 2 RE-TENTATIVAS em erro
  // transitório (429/529/5xx/queda de rede): "iter" marca o checkpoint na UI
  // e "retry" manda descartar o parcial da tentativa que falhou — sem isso o
  // texto duplicaria na tela.
  for (let iteracao = 0; iteracao < MAX_ITER; iteracao++) {
    const req = Object.assign({}, baseReq, { messages });
    postar(port, { type: "iter" });

    let final = null;
    for (let tentativa = 0; ; tentativa++) {
      try {
        for await (const ev of streamFn(req)) {
          if (ev.kind === "text") postar(port, { type: "delta", text: ev.text });
          else if (ev.kind === "thinking")
            postar(port, { type: "thinking", text: ev.text });
          else if (ev.kind === "citation")
            postar(port, { type: "citation", citation: ev.citation });
          else if (ev.kind === "tool")
            postar(port, { type: "tool", name: ev.name, input: ev.input });
          else if (ev.kind === "trunc") postar(port, { type: "trunc" });
          else if (ev.kind === "final") final = ev;
        }
        break; // request físico concluído
      } catch (e) {
        if (tentativa >= 2 || !erroRetryavel(e)) throw e;
        console.debug("[PJe IA] erro transitório, re-tentando:", String(e && e.message));
        postar(port, { type: "retry" });
        // 429 merece espera maior (janela de rate limit); demais, backoff curto
        await espera(e && e.status === 429 ? 10000 : tentativa === 0 ? 2000 : 6000);
      }
    }
    if (!final) throw new Error("o stream terminou sem resposta completa — tente de novo");

    contentAcumulado = contentAcumulado.concat(final.content);
    stopReason = final.stopReason;
    if (final.usage) {
      for (const k of Object.keys(usoTotal)) usoTotal[k] += final.usage[k] || 0;
      usoUltimo = final.usage;
      const c = custoUsdDe(final.usage, caps.preco);
      if (c != null) custoTotal = (custoTotal || 0) + c;
    }
    if (stopReason !== "pause_turn") break;
    // o servidor pausou o loop de ferramentas: reenvia com o turno parcial.
    // As citações NÃO voltam no reenvio: a API rejeita citações em conteúdo
    // de assistant (campos extras e revalidação de índices) — mesma regra do
    // histórico multi-turno no content script.
    messages = payload.messages.concat([
      { role: "assistant", content: stripCitacoes(contentAcumulado) },
    ]);
  }

  if (stopReason === "refusal") {
    throw new Error("o modelo recusou responder este conteúdo");
  }
  return {
    content: contentAcumulado,
    stopReason,
    usage: usoTotal,
    usageReq: usoUltimo,
    custoUsd: custoTotal,
  };
}

// Impede o Chrome de matar o service worker durante um turno longo: o MV3
// encerra o worker após ~30 s sem eventos de extensão, e um turno longo pode
// ficar em silêncio por muito tempo (raciocínio extenso, busca na web).
// Chamar uma API de extensão de tempos em tempos reseta o timer de ociosidade.
function manterVivo() {
  // 15 s (não 20): margem maior sobre o teto de ~30 s de ociosidade — o
  // ping do content script pode atrasar com a aba em segundo plano
  // (throttling de timers de página), então o worker não depende só dele.
  const t = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 15000);
  return () => clearInterval(t);
}

// postMessage tolerante: a aba pode ter fechado a porta no meio do stream.
function postar(port, m) {
  try {
    port.postMessage(m);
  } catch {
    /* porta já desconectada */
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "claude") return;

  port.onMessage.addListener((msg) => {
    // "ping": heartbeat do content script. Além de resetar o timer de
    // ociosidade do worker (o próprio recebimento já faz isso), RESPONDEMOS com
    // "pong" — é a prova de vida que o watchdog do content usa para distinguir
    // "worker vivo porém quieto" (turno longo) de "worker zumbi" (porta aberta,
    // mas o worker não executa mais). Worker morto não responde → o content
    // reconecta e reenvia o turno (stateless).
    if (msg && msg.type === "ping") return postar(port, { type: "pong" });
    // qualquer outro tipo desconhecido só serve de keepalive
    if (!msg || msg.type !== "chat") return;

    const parar = manterVivo();
    executarTurno(port, msg.payload)
      .then((r) =>
        postar(port, {
          type: "done",
          content: r.content,
          stopReason: r.stopReason,
          usage: r.usage || null,
          usageReq: r.usageReq || null,
          custoUsd: r.custoUsd == null ? null : r.custoUsd,
        })
      )
      .catch((e) =>
        postar(port, { type: "error", error: String((e && e.message) || e) })
      )
      .finally(parar);
  });
});
