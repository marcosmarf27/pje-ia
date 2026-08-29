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
import {
  lerCaso,
  lerConversa,
  salvarCaso,
  salvarConversa,
  apagarConversa,
  salvarPecas,
  esquecerCaso,
  esquecerTudo,
  listarCasos,
  podarCasos,
  podarAgressivo,
} from "./casodb.js";

// Capacidades por modelo. Governam limites de páginas/contexto, as versões das
// ferramentas web, a configuração de thinking/effort aceita por cada um e o
// preço (US$ por 1M de tokens, tabela pública da Anthropic — Sonnet 5 usa o
// preço de tabela, não o promocional, para nunca subestimar). Cache de prompt:
// gravação ≈ 1,25× o preço de input (TTL 5 min); leitura ≈ 0,1×.
//
// `perfil` responde "para QUE serve este modelo?" e existe para a orientação
// de uso não virar um `if (model === "...")` espalhado pela UI: `panel.js` e
// `content.js` só condicionam por **caps**, nunca por nome de modelo (é o que
// permitiu somar Gemini e OpenAI sem tocar no ramo da Anthropic), e um modelo
// novo passa a precisar só de uma linha nesta tabela.
//   analise → ler, explorar e triar os autos. Fraco para redigir.
//   redacao → produzir o expediente (minuta, despacho, ofício).
//   ambos   → serve para os dois.
// O eixo NÃO é "modelo bom/ruim": os dois trabalhos pagam metades diferentes
// da tabela de preços. Analisar autos é dominado pelo INPUT (centenas de
// páginas entram, poucos milhares de tokens saem); redigir tem o mesmo input
// mas o que se compra é o OUTPUT — e é ali que os tiers se separam. Por isso
// o mais barato para varrer costuma ser o mais fraco para escrever.
// ATENÇÃO: é o campo mais PERECÍVEL da tabela — mais que o preço. Vale como
// recomendação ("costuma render melhor"), nunca como veredito, e mora só aqui
// para uma revisão custar uma palavra por linha. Hoje apenas `gpt-5.6-luna` e
// `gemini-3.7-flash` foram MEDIDOS em uso real; o resto é inferência do tier.
const MODEL_CAPS = {
  "claude-sonnet-5": {
    provider: "anthropic",
    perfil: "ambos", // Inferido: 3/15 e citacao nativa por folha em 1M.
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
    perfil: "ambos", // Inferido: 5/25, citacao nativa.
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
    perfil: "redacao", // Inferido: 10/50 — pagar isso para LER e desperdicio; para redigir, rende.
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
    perfil: "analise", // Inferido: janela de 200k/100 pags. nao aguenta autos volumosos.
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
  // Gemini 3.7 Flash (08/2026) — o mais novo da linha Flash e o recomendado
  // do provedor. Caps IDÊNTICAS às do 3.6 (janela de 1M, teto de saída de
  // 65.536, thinking nativo), confirmadas no endpoint de modelos com chave
  // real, e o corpo da Interactions API que a extensão monta hoje passa sem
  // mudança nenhuma. PREÇO: a tabela oficial cobra o MESMO que o 3.6 —
  // US$ 1,50 / 7,50 / 0,15 —, com promocional de metade até 31/12/2026. Vale
  // aqui a regra que o Sonnet 5 já seguia: registramos o preço de TABELA, não
  // o promocional, para o rodapé nunca subestimar o custo (e para dois modelos
  // de preço igual não aparecerem com custos diferentes na mesma conversa).
  "gemini-3.7-flash": {
    provider: "gemini",
    perfil: "redacao", // MEDIDO em uso real: o melhor para expedientes.
    contextTokens: 1000000,
    maxPages: 1000,
    googleSearch: true,
    citacoesNativas: false,
    thinking: null,
    effort: true, // vira generation_config.thinking_level
    tokensPagina: 258,
    preco: { in: 1.5, out: 7.5, cacheRead: 0.15 },
  },
  "gemini-3.6-flash": {
    provider: "gemini",
    perfil: "redacao", // Inferido: mesma familia e mesmo preco da 3.7.
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
    perfil: "analise", // Inferido: 0,30/2,50 — o mais barato para varredura.
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
    perfil: "ambos", // Inferido do tier: 5/30 (10/45 acima de 272k) — caro para só ler.
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
    perfil: "ambos", // Inferido do tier: 2/12 (4/18 acima de 272k).
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
    perfil: "analise", // MEDIDO em uso real: fraco para redigir. 0,20/1,20 — imbatível para varrer autos.
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
// Modelo de fallback POR PROVEDOR. Um id desconhecido (config de uma versão
// que oferecia outro modelo) tem o provedor decidido por `providerDe` — que
// olha só o prefixo e acerta —, então cair sempre nas caps do Haiku dava um
// par incoerente: o request ia para o Google com janela de 200 mil tokens,
// guarda de 100 páginas e `citacoesNativas` ligada (o system prompt pediria
// citação por página a um modelo que não as produz).
const FALLBACK_POR_PROVEDOR = {
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-3.7-flash",
  openai: "gpt-5.6-luna",
};
function capsDe(model) {
  return MODEL_CAPS[model] || MODEL_CAPS[FALLBACK_POR_PROVEDOR[providerDe(model)]];
}

// Qual modelo sugerir a quem está no modo minuta com um modelo de perfil
// `analise`. Prefere DELIBERADAMENTE um irmão do MESMO provedor: mandar quem
// usa a OpenAI trocar para o Gemini é pedir que ele crie outra conta e cole
// outra chave só para seguir um conselho — atrito alto o bastante para o
// conselho não ser seguido. Entre os candidatos, o mais barato (o custo de
// redigir é dominado pelo output, e o degrau de preço acima de 272k tokens
// dos GPT já está embutido na comparação por `out`). Sem irmão no provedor,
// cai no melhor de qualquer um. Devolve null quando o próprio modelo já serve.
function sugestaoRedacao(model) {
  const caps = capsDe(model);
  if (!caps || caps.perfil !== "analise") return null;
  const cands = Object.entries(MODEL_CAPS).filter(([, c]) => c.perfil !== "analise");
  const mesmo = cands.filter(([, c]) => c.provider === caps.provider);
  const pool = mesmo.length ? mesmo : cands;
  if (!pool.length) return null;
  const [id] = pool.sort((a, b) => (a[1].preco.out || 0) - (b[1].preco.out || 0))[0];
  return { model: id, mesmoProvedor: mesmo.length > 0 };
}

// Override de MODELO por turno — irmão do override de `effort` (ver EFFORTS,
// mais abaixo). Aceito SÓ dentro do mesmo provedor, e isso não é zelo: as peças
// já subiram à Files API do provedor do modelo CONFIGURADO, e é com ele que
// `precisaUpload`/`fileIdValido`/`montarBlocos` (content.js) decidem se o
// arquivo pode ir por referência. Um modelo de outro provedor faria o request
// sair com file_id da API errada e morrer num 400 críptico — exatamente o que
// aqueles predicados existem para evitar. Id fora da tabela cai no configurado,
// em vez de virar um 404 da API.
function modeloDoTurno(cfg, pedido) {
  if (!pedido || !MODEL_CAPS[pedido]) return cfg.model;
  if (providerDe(pedido) !== providerDe(cfg.model)) return cfg.model;
  return pedido;
}

// Qual modelo REDIGE a minuta. Redigir é dominado pelo OUTPUT, e os modelos de
// perfil `analise` — o padrão `gpt-5.6-luna`, o `claude-haiku-4-5` que é o
// padrão Anthropic do popup, o `gemini-3.5-flash-lite` — são justamente os mais
// fracos nele. Daí a minuta rodar num irmão de redação do MESMO provedor, em
// vez do modelo do chat.
//
// O critério da preferência é "o usuário ESCOLHEU alguma coisa?", NUNCA "o
// escolhido é diferente do modelo do chat?". Fixar o próprio modelo do chat é
// escolha legítima ("quero minutar no Luna mesmo, é mais barato"), e comparar
// os dois faria o automático sobrescrevê-la em silêncio: o campo das opções
// prometeria controle e negaria justamente a opção de NÃO trocar.
// Devolve {model, fixado}: `fixado` diz que a escolha veio do usuário, e não
// do automático. A UI PRECISA distinguir os dois — a nota da barra afirma "mais
// adequado a redigir" e "custa mais", que só são verdade no automático
// (análise → redação). Quem está no Sol e fixa o Terra receberia as duas
// afirmações invertidas: o Terra não redige melhor que o Sol, e custa menos.
function modeloDaMinuta(cfg) {
  if (cfg.modeloMinuta) {
    const fixo = modeloDoTurno(cfg, cfg.modeloMinuta);
    // Só cai no automático quando a escolha não tem COMO ser honrada: id que
    // saiu da tabela, ou de provedor diferente daquele que subiu as peças.
    if (fixo === cfg.modeloMinuta) return { model: fixo, fixado: true };
  }
  const s = sugestaoRedacao(cfg.model);
  return { model: (s && s.model) || cfg.model, fixado: false };
}

// Default: GPT-5.6 Luna — 1,05M de tokens cobrem os autos inteiros sem a
// guarda de páginas estourar (o caso comum aqui) e é o mais barato dos
// modelos de janela grande: US$ 0,20/1,20 por 1M, contra 1,50/7,50 do Gemini
// Flash. Sobre o padrão anterior (Gemini 3.6 Flash) ganha-se ainda a
// **allowlist de domínios na busca**, que a OpenAI aplica no servidor e o
// Gemini não tem — no Gemini a priorização de fontes .jus.br é só instrução
// de prompt (garantia mole, ver "Prioridade das fontes na busca web").
// O que se abre mão continua sendo a citação nativa por página
// (`citacoesNativas:false` → citação textual, com o ⓘ ao lado do selo), igual
// ao padrão anterior: quem a quiser troca para um modelo Anthropic.
// ESTE VALOR TAMBÉM VIVE EM `popup.js` (`MODELO_PADRAO`), que é script
// clássico e não pode importar daqui — mudar aqui exige mudar lá, senão a
// tela de configuração passa a mostrar um modelo diferente do que a extensão
// usa (foi exatamente o bug da v0.25, hoje coberto por teste).
// Não afeta quem já usa a extensão: o "Salvar" do popup grava `model`
// sempre, então só instalação nova (storage sem `model`) cai neste default.
function getCfg() {
  return new Promise((resolve) =>
    chrome.storage.local.get(
      ["apiKey", "geminiApiKey", "openaiApiKey", "model", "effort", "modeloMinuta"],
      (v) =>
        resolve({
          apiKey: v.apiKey,
          geminiApiKey: v.geminiApiKey,
          openaiApiKey: v.openaiApiKey,
          model: v.model || "gpt-5.6-luna",
          effort: v.effort || "high",
          // "" = automático (ver modeloDaMinuta). Um id fixado aqui só vale
          // dentro do provedor do modelo do chat.
          modeloMinuta: v.modeloMinuta || "",
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

// Impressão digital da chave da API, para a memória de caso saber se um fileId
// gravado no disco ainda vale. Os arquivos da Anthropic e da OpenAI não expiram,
// mas pertencem à CONTA da chave: trocar de chave transforma todo fileId gravado
// num 404 — e, pior, num 404 que aparece no meio do histórico da conversa
// retomada, como erro críptico da API.
//
// SHA-256 truncado em 8 hex (32 bits) e calculado AQUI: a chave nunca sai do
// worker, e o que viaja ao content script é um resumo irreversível (a chave tem
// mais de 100 bits de entropia — não há dicionário a percorrer). Colisão em 32
// bits é irrelevante aqui: o custo de um falso "ainda vale" é um request que
// falha e cai no re-download, que é exatamente o caminho de recuperação.
const hashCache = new Map(); // chave crua -> hash (só em memória, morre com o worker)
async function hashDaChave(chave) {
  if (!chave) return null;
  if (hashCache.has(chave)) return hashCache.get(chave);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chave));
  const hex = [...new Uint8Array(bytes).slice(0, 4)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  hashCache.set(chave, hex);
  return hex;
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

  // Valida a chave SEM custo: cada provedor tem um endpoint de LISTAGEM DE
  // MODELOS que responde 200 com credencial boa e 401/403 com credencial ruim,
  // e não consome token nenhum. Roda aqui, e não no popup, para a chave não
  // atravessar mais um contexto do que precisa.
  if (msg.type === "testarChave") {
    const key = String(msg.key || "").trim();
    const p = msg.provider;
    const req =
      p === "gemini"
        ? ["https://generativelanguage.googleapis.com/v1beta/models", { "x-goog-api-key": key }]
        : p === "openai"
          ? ["https://api.openai.com/v1/models", { Authorization: "Bearer " + key }]
          : [
              "https://api.anthropic.com/v1/models",
              { "x-api-key": key, "anthropic-version": "2023-06-01" },
            ];
    fetch(req[0], { headers: req[1] })
      .then((r) =>
        r.ok
          ? sendResponse({ ok: true })
          : r.status === 401 || r.status === 403
            ? sendResponse({ ok: false, erro: "chave inválida ou sem permissão." })
            : sendResponse({ ok: false, erro: "o provedor respondeu " + r.status + "." })
      )
      .catch(() => sendResponse({ ok: false, erro: "sem resposta do provedor." }));
    return true; // resposta assíncrona
  }

  if (msg.type === "caps") {
    // model + effort vão junto: o painel mostra o que está ATIVO (o usuário
    // não deveria precisar confiar às cegas no que salvou nas opções).
    // `chaveHash` viaja junto porque este handler já roda no boot E a cada
    // storage.onChanged de chave/modelo — ou seja, a invalidação dos fileId
    // gravados acontece sozinha, sem um caminho novo só para isso. Chave
    // ausente vira null (o painel já está no estado "configure a chave").
    (async () => {
      const cfg = await getCfg();
      let chaveHash = null;
      try {
        chaveHash = await hashDaChave(chaveDe(cfg, providerDe(cfg.model)));
      } catch {
        /* sem chave para este provedor: nada a invalidar */
      }
      const { model: mMin, fixado: minFixado } = modeloDaMinuta(cfg);
      sendResponse({
        model: cfg.model,
        effort: cfg.effort,
        caps: capsDe(cfg.model),
        // O modelo que vai REDIGIR a minuta, com as caps DELE. As caps viajam
        // junto para o content decidir por elas — janela, páginas, citação
        // nativa — sem nunca conhecer nome de modelo, a mesma regra do campo
        // `caps` acima. É daqui que saem o gate da biblioteca de peças-modelo
        // e o anúncio na barra de minuta.
        minuta: {
          model: mMin,
          caps: capsDe(mMin),
          trocado: mMin !== cfg.model,
          fixado: minFixado,
        },
        chaveHash,
      });
    })();
    return true; // resposta assíncrona
  }

  if (msg.type === "upload") {
    (async () => {
      try {
        const cfg = await getCfg();
        const provider = providerDe(cfg.model);
        const apiKey = chaveDe(cfg, provider);
        // `exp` e `chaveHash` acompanham TODA resposta, inclusive os cache-hits:
        // é com eles que a memória de caso decide, na sessão seguinte, se o
        // fileId gravado no disco ainda serve ou se a peça precisa re-subir.
        // Antes desta rodada a expiração do Gemini existia só aqui dentro e o
        // content script recebia um URI sem prazo — o que funcionava enquanto o
        // cache morria junto com a aba, e deixaria de funcionar agora.
        const chaveHash = await hashDaChave(apiKey);
        if (provider === "gemini") {
          // namespace próprio ("gfile:") e VALIDAÇÃO de expiração na leitura:
          // a File API do Google apaga os arquivos após 48 h — um URI vencido
          // no cache derrubaria o request com erro críptico.
          const key = msg.payload.cacheKey ? "gfile:" + msg.payload.cacheKey : null;
          if (key) {
            const cached = await sessGet(key);
            if (cached && cached.uri && cached.exp > Date.now()) {
              return sendResponse({
                fileId: cached.uri,
                provider,
                exp: cached.exp,
                chaveHash,
              });
            }
          }
          const r = await uploadFileGemini({
            apiKey,
            filename: msg.payload.filename,
            b64: msg.payload.b64,
            mime: msg.payload.mime,
          });
          if (key) await sessSet(key, { uri: r.fileUri, exp: r.expiraEm });
          return sendResponse({
            fileId: r.fileUri,
            provider,
            exp: r.expiraEm,
            chaveHash,
          });
        }
        if (provider === "openai") {
          // namespace próprio ("ofile:"): um file_id da OpenAI nunca pode ser
          // lido num request Anthropic/Gemini (e vice-versa). Os arquivos da
          // OpenAI persistem na conta, então não há validação de expiração —
          // mas há a da CONTA, que é o `chaveHash`.
          const key = msg.payload.cacheKey ? "ofile:" + msg.payload.cacheKey : null;
          if (key) {
            const cached = await sessGet(key);
            if (cached) return sendResponse({ fileId: cached, provider, chaveHash });
          }
          const fileId = await uploadFileOpenAI({
            apiKey,
            filename: msg.payload.filename,
            b64: msg.payload.b64,
            mime: msg.payload.mime,
          });
          if (key) await sessSet(key, fileId);
          return sendResponse({ fileId, provider, chaveHash });
        }
        const key = msg.payload.cacheKey ? "file:" + msg.payload.cacheKey : null;
        if (key) {
          const cached = await sessGet(key);
          if (cached) return sendResponse({ fileId: cached, provider, chaveHash });
        }
        const fileId = await uploadFile({
          apiKey,
          filename: msg.payload.filename,
          b64: msg.payload.b64,
          mime: msg.payload.mime,
        });
        if (key) await sessSet(key, fileId);
        sendResponse({ fileId, provider, chaveHash });
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
        // MESMO override de modelo do `executarTurno`: o pré-voo tem de medir o
        // request que vai de fato. Sem isto a minuta seria medida na janela do
        // modelo do CHAT — no caso Haiku→Sonnet 5 são 200 mil tokens contra 1
        // milhão, e a guarda de 90% barraria minutas que cabem com folga.
        const model = modeloDoTurno(cfg, msg.payload.model);
        const provider = providerDe(model);
        const apiKey = chaveDe(cfg, provider);
        let tokens;
        if (provider === "gemini") {
          tokens = await countTokensGemini({
            apiKey,
            model,
            system: msg.payload.system,
            messages: msg.payload.messages,
          });
        } else if (provider === "openai") {
          tokens = await countTokensOpenAI({
            apiKey,
            model,
            system: msg.payload.system,
            messages: msg.payload.messages,
            tools: msg.payload.tools,
          });
        } else {
          tokens = await countTokens({
            apiKey,
            model,
            system: msg.payload.system,
            messages: msg.payload.messages,
            tools: msg.payload.tools,
            betas: msg.payload.betas,
          });
        }
        sendResponse({ tokens, contextTokens: capsDe(model).contextTokens });
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

  // ------------------------------------------------ extração de texto das peças
  //
  // O content script manda UMA peça por vez em base64; o worker garante o
  // documento offscreen e repassa. O offscreen é quem tem DOM, canvas e
  // `new Worker` — nada disso existe aqui, e o pdf.js não pode entrar na página
  // do tribunal (ver o cabeçalho de src/ocr-offscreen.js).
  //
  // O texto que volta daqui NUNCA entra no payload de um request de chat. Foi
  // exatamente isso que derrubou a extração da v0.21.0: no Gemini, que cobra 258
  // tokens fixos por página de PDF e não cobra o texto nativo, mandar o texto
  // extraído levou o contexto de 59% para 153%. O destino aqui é arquivo para o
  // usuário.
  if (msg.type === "ocrExtrair") {
    (async () => {
      try {
        await garantirOffscreen();
        const r = await chrome.runtime.sendMessage({
          alvo: "ocrOffscreen",
          tipo: "extrairPeca",
          b64: msg.payload.b64,
        });
        if (!r || !r.ok) throw new Error((r && r.erro) || "extração não respondeu");
        sendResponse({ ok: true, resultado: r.resultado });
      } catch (e) {
        sendResponse({ error: String((e && e.message) || e) });
      }
    })();
    return true;
  }

  // ------------------------------------------------ memória de caso (casodb.js)
  //
  // Cinco RPCs finos: quem sabe o que é um caso é o content script; quem sabe
  // guardá-lo é o casodb.js. O worker no meio existe por uma razão só, e ela é
  // de segurança — o banco tem de morar na origem da EXTENSÃO, não na do
  // tribunal (ver o cabeçalho de casodb.js).
  //
  // O interruptor do usuário é conferido AQUI, num ponto único: desligado, a
  // leitura devolve vazio e a escrita vira no-op silencioso. Espalhar essa
  // checagem pelo content script daria quatro lugares para esquecer um.
  if (
    msg.type === "casoLer" ||
    msg.type === "casoSalvar" ||
    msg.type === "casoPecas" ||
    msg.type === "casoEsquecer" ||
    msg.type === "casoListar" ||
    msg.type === "convLer" ||
    msg.type === "convSalvar" ||
    msg.type === "convApagar"
  ) {
    (async () => {
      try {
        const { memoriaCaso } = await new Promise((r) =>
          chrome.storage.local.get({ memoriaCaso: true }, r)
        );
        const chave = msg.chave || null;
        if (msg.type === "casoEsquecer") {
          // Apagar funciona mesmo com a memória desligada: é justamente o que
          // alguém que acabou de desligá-la quer fazer com o que ficou para trás.
          return sendResponse({
            ok: true,
            n: chave ? await esquecerCaso(chave) : await esquecerTudo(),
          });
        }
        if (msg.type === "convApagar") {
          // Apagar funciona mesmo com a memória desligada, pela mesma razão do
          // `casoEsquecer`: é o que alguém que acabou de desligá-la quer fazer.
          return sendResponse({ ok: true, n: await apagarConversa(chave, msg.convId) });
        }
        if (!memoriaCaso) return sendResponse({ ok: true, desligado: true, caso: null, casos: [] });
        if (msg.type === "casoLer") return sendResponse({ ok: true, caso: await lerCaso(chave) });
        if (msg.type === "casoListar") return sendResponse({ ok: true, casos: await listarCasos() });
        if (msg.type === "casoPecas") {
          return sendResponse({ ok: true, n: await salvarPecas(chave, msg.pecas) });
        }
        if (msg.type === "convLer") {
          return sendResponse({ ok: true, conversa: await lerConversa(chave, msg.convId) });
        }
        if (msg.type === "convSalvar") {
          const c = await salvarConversa(chave, msg.convId, msg.patch || {}, msg.base);
          return sendResponse({
            ok: true, convId: c.convId, atualizadoEm: c.atualizadoEm, ramificou: c.ramificou,
          });
        }
        const r = await salvarCaso(chave, msg.patch || {});
        sendResponse({ ok: true, atualizadoEm: r.atualizadoEm });
      } catch (e) {
        // Cota estourada é o único erro que vale uma segunda tentativa: poda
        // metade dos casos e repete UMA vez. Se falhar de novo, o content
        // script recebe `{ok:false}` e desliga a gravação naquela sessão —
        // memória de caso nunca pode derrubar um turno.
        const nome = String((e && e.name) || "");
        if (nome === "QuotaExceededError") {
          try {
            await podarAgressivo();
            if (msg.type === "casoPecas") await salvarPecas(msg.chave, msg.pecas);
            else await salvarCaso(msg.chave, msg.patch || {});
            return sendResponse({ ok: true, podado: true });
          } catch {
            return sendResponse({ ok: false, erro: "memória cheia", cheio: true });
          }
        }
        sendResponse({ ok: false, erro: String((e && e.message) || e) });
      }
    })();
    return true;
  }
});

// ---------------------------------------------------------------------------
// Aviso de novidades: a ATUALIZAÇÃO é o canal
//
// A Chrome Web Store não tem push para quem já instalou. O único canal real é
// a própria atualização (`onInstalled` com `reason === "update"`), e o único
// aviso que respeita a disciplina deste projeto — nada entre a pergunta e a
// resposta — é o BADGE do ícone: ele espera ser olhado, em vez de exigir
// atenção. Abrir uma aba sozinho foi descartado (o Chrome atualiza extensões
// em segundo plano, então a aba nasceria no meio do trabalho do usuário), e
// buscar avisos num servidor exigiria `host_permissions` novo e mudaria a
// história de privacidade da extensão.
//
// COMPARA SÓ MAJOR.MINOR, nunca o patch: foram 7 versões em dois dias
// (v0.45.0 → v0.46.2). Um badge por bump treina o usuário a ignorá-lo em uma
// semana, que é o oposto do objetivo. v0.46.1 → v0.46.2 não acende nada.
const CHAVE_AVISO = "avisoNovidades";

function marcoDe(v) {
  const [maj, min] = String(v || "").split(".");
  return maj === undefined ? null : maj + "." + (min || "0");
}

function acenderBadge() {
  try {
    chrome.action.setBadgeText({ text: "novo" });
    chrome.action.setBadgeBackgroundColor({ color: "#12729f" });
  } catch {
    /* best-effort: falhar em pintar um badge não pode derrubar nada */
  }
}

// O badge é estado da UI do navegador, não do worker: ele sobrevive à morte do
// service worker (o que resolve o caso comum), mas é ZERADO ao reiniciar o
// Chrome. Sem este `onStartup` o aviso sumiria para quem fecha o navegador
// antes de abrir o popup — justamente o usuário que atualizou e foi dormir.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(CHAVE_AVISO, (v) => {
    if (chrome.runtime.lastError) return;
    if (v && v[CHAVE_AVISO]) acenderBadge();
  });
});

// Faxina única: apaga o texto que a extração de peças (removida na v0.22.0)
// deixou gravado. Enquanto o recurso existiu, o texto extraído das peças ficava
// em chrome.storage.local sob o prefixo `texto:` — trecho dos autos no disco,
// até ~6 MB. Sem o recurso ninguém mais lê nem poda essas chaves, e elas
// ficariam para sempre ocupando a cota do `local`, que também hospeda as
// minutas (`minuta:*`) e os modelos de peça (`modelo:*`) — estourar a cota faz
// o `set` de uma minuta falhar. Roda na atualização da extensão e nunca mais.
// Junto vão a chave da Mistral e o modelo de OCR: credencial que nenhum código
// lê mais não deve continuar no disco.
chrome.runtime.onInstalled.addListener((detalhes) => {
  // `previousVersion` só existe NESTE instante — se não for gravado agora,
  // some quando o worker morrer, e o popup não teria como dizer "novidades
  // DESDE a sua versão" em vez de um "novo" genérico.
  try {
    const de = detalhes && detalhes.previousVersion;
    const para = chrome.runtime.getManifest().version;
    if (detalhes && detalhes.reason === "update" && de && marcoDe(de) !== marcoDe(para)) {
      chrome.storage.local.set({ [CHAVE_AVISO]: { de, para } }, () => {
        void chrome.runtime.lastError;
        acenderBadge();
      });
    }
  } catch {
    /* best-effort: nunca impedir a faxina abaixo de rodar */
  }
  chrome.storage.local.get(null, (tudo) => {
    if (chrome.runtime.lastError) return;
    const antigas = Object.keys(tudo || {}).filter(
      (k) => k.startsWith("texto:") || k === "mistralApiKey" || k === "ocrModel"
    );
    if (antigas.length) chrome.storage.local.remove(antigas);
  });
  // Faxina da memória de caso na atualização da extensão. A poda normal anda de
  // carona em cada gravação, mas quem parou de usar a extensão por um mês nunca
  // dispara uma — e é justamente esse o caso em que o material antigo não
  // deveria continuar no disco.
  podarCasos().catch(() => {});
});

// Mantém no máximo MAX_MAPAS mapas na sessão (cada um é o markdown inteiro de
// um processo; sem poda, uma tarde de uso encheria a cota de 10 MB).
const MAX_MAPAS = 5;
// --------------------------------------------------------------------------
// Documento offscreen da extração de texto.
//
// O Chrome permite UM documento offscreen por perfil da extensão, e
// `createDocument` lança se já houver um. Por isso a criação é idempotente E
// protegida contra corrida: duas peças pedidas ao mesmo tempo chamariam
// `createDocument` duas vezes e a segunda derrubaria o turno. A promessa em voo
// é compartilhada (`criandoOffscreen`), como no exemplo 5 do guia PP-OCRv6.
let criandoOffscreen = null;

async function garantirOffscreen() {
  // Chrome < 109 não tem a API. Degradação graciosa com motivo: o resto da
  // extensão continua funcionando, e a mensagem diz o que fazer.
  if (!chrome.offscreen) {
    throw new Error(
      "a extração de texto precisa do Chrome 109 ou mais novo — atualize o navegador"
    );
  }
  const url = chrome.runtime.getURL("src/ocr-offscreen.html");
  // `getContexts` só existe do Chrome 116 em diante; sem ele, o try/catch da
  // criação faz o mesmo trabalho (documento já existente lança e nós seguimos).
  if (chrome.runtime.getContexts) {
    const existentes = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url],
    });
    if (existentes.length) return;
  }
  if (!criandoOffscreen) {
    criandoOffscreen = chrome.offscreen
      .createDocument({
        url: "src/ocr-offscreen.html",
        reasons: ["WORKERS"],
        justification:
          "Ler a camada de texto dos PDFs das peças e rasterizar as páginas digitalizadas, no próprio dispositivo.",
      })
      .catch((e) => {
        // Corrida perdida para outra chamada: o documento existe, que é o que
        // queríamos. Qualquer outro erro sobe.
        if (!/single offscreen|already exists|Only a single/i.test(String(e && e.message))) throw e;
      })
      .finally(() => {
        criandoOffscreen = null;
      });
  }
  await criandoOffscreen;
  await esperarOffscreenPronto();
}

// `createDocument` resolve quando o DOCUMENTO existe — não quando o script dele
// está pronto. `ocr-offscreen.js` é um ES module que ainda vai resolver o import
// do pdf.js (1,7 MB), e só então registra o `onMessage`. Mandar a peça nesse
// intervalo devolve "Could not establish connection. Receiving end does not
// exist" e derruba a PRIMEIRA extração de toda sessão — o pior tipo de falha,
// porque some no segundo clique e parece intermitência de rede.
//
// É a mesma armadilha que o `extrator.js` da v0.21.0 resolvia com handshake; a
// diferença é que lá o iframe avisava, e aqui somos nós que perguntamos.
const OFFSCREEN_TENTATIVAS = 40;
const OFFSCREEN_INTERVALO_MS = 125; // 40 × 125 ms = 5 s de teto

async function esperarOffscreenPronto() {
  for (let i = 0; i < OFFSCREEN_TENTATIVAS; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ alvo: "ocrOffscreen", tipo: "ping" });
      if (r && r.ok) return;
    } catch {
      // Ainda não há quem escute — é o caso esperado nas primeiras voltas.
    }
    await new Promise((r) => setTimeout(r, OFFSCREEN_INTERVALO_MS));
  }
  throw new Error("a extração de texto não iniciou a tempo — recarregue a página e tente de novo");
}

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
// payload: {system, messages, tools?, betas?, maxTokens?, effort?, model?}
// Níveis aceitos no override de effort (o payload vem do content script, que é
// nosso, mas um valor fora da escala viraria 400 na API em vez de erro claro).
const EFFORTS = new Set(["low", "medium", "high"]);

async function executarTurno(port, payload) {
  const cfg = await getCfg();
  // O MODELO é o da configuração, SALVO quando o turno pede outro — hoje só a
  // minuta pede (ver modeloDaMinuta). Tudo abaixo deriva daqui: `capsDe`, o
  // provedor, a chave, o `baseReq.model` e — o que mais importa — o
  // `custoUsdDe` do fim, que assim cobra pela tabela do modelo que de fato
  // respondeu, sem nenhuma linha a mais.
  const model = modeloDoTurno(cfg, payload.model);
  // O effort é o da configuração, SALVO quando o turno pede outro. Turnos
  // utilitários — a triagem do "Escolher com IA" é o caso — são classificação
  // sobre metadados, não análise jurídica: com raciocínio alto o usuário espera
  // dezenas de segundos por uma lista de ids, e é disso que a qualidade da
  // escolha menos depende (depende dos SINAIS que vão na lista). O override é
  // por turno e não toca na preferência salva, que continua valendo para o chat.
  const effort = EFFORTS.has(payload.effort) ? payload.effort : cfg.effort;
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
