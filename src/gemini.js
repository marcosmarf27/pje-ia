// Cliente da API do Google Gemini (Interactions API), irmão de claude.js.
// Emite o MESMO vocabulário de eventos que streamClaude — o background.js
// consome os dois sem saber qual provedor está por trás:
//   {kind:"text", text}          — delta de texto da resposta
//   {kind:"thinking", text}      — delta do resumo de raciocínio
//   {kind:"citation", citation}  — citação (annotations url_citation → formato
//                                  web_search_result_location que a UI já trata)
//   {kind:"tool", name, input}   — o servidor executou google_search
//   {kind:"trunc"}               — resposta cortada pelo teto de saída
//   {kind:"final", content, stopReason, containerId, usage} — fim do request
//
// FORMATOS DA INTERACTIONS API (extraídos da documentação oficial via skill
// gemini-api-dev — ai.google.dev/gemini-api/docs/*.md.txt, 2026-07):
//  - Request: POST {v1beta}/interactions, headers x-goog-api-key +
//    Api-Revision: 2026-05-20 (fixa o schema novo, com "steps").
//    Body: {model, system_instruction, input, store:false, stream:true,
//    tools?, generation_config:{thinking_level}}. PROIBIDO: temperature/
//    top_p/top_k e terminar o input com turno do modelo (prefill) → 400.
//    TETO DE SAÍDA: enviamos generation_config.max_output_tokens = 65536
//    EXPLÍCITO — o limite máximo dos modelos (3.7 Flash, 3.6 Flash e 3.5
//    Flash-Lite; o do 3.7 conferido no endpoint de modelos em 13/08/2026),
//    para a resposta nunca ser cortada por um default menor. O campo não
//    está nas páginas de docs, mas é o que o próprio AI Studio gera nos
//    exemplos oficiais da Interactions API (confirmado em 2026-07). NUNCA
//    repassar o req.max_tokens do caminho Anthropic (32000): cortaria o
//    teto pela metade.
//  - input (modo STATELESS, o nosso): array com turnos
//    {type:"user_input", content:[{type:"text",text} | {type:"document",
//    uri|data, mime_type}]} e, para o histórico do modelo, os próprios STEPS
//    recebidos na resposta, VERBATIM: {type:"model_output", content:[...]},
//    {type:"thought", summary:[...], signature}, {type:"google_search_call"},
//    {type:"google_search_result"}… Blocos thought carregam assinatura
//    criptografada e DEVEM voltar intactos (regra igual à da Anthropic).
//  - Streaming (SSE, "data: {json}" terminando em "data: [DONE]"):
//    event_type = interaction.created | interaction.status_update |
//    step.start {index, step} | step.delta {index, delta} | step.stop {index} |
//    interaction.completed {interaction}. Deltas: {type:"text", text},
//    {type:"thought_summary", content:{type:"text",text}},
//    {type:"thought_signature", signature}.
//  - usage (em interaction.usage): total_tokens, total_input_tokens (INCLUI os
//    cacheados), total_output_tokens, total_thought_tokens, total_cached_tokens.
//  - Annotations: dentro de model_output.content[].annotations —
//    {type:"url_citation", url, title, start_index, end_index}.
//  - File API: upload resumable em /upload/v1beta/files (headers
//    X-Goog-Upload-*), resposta {file:{name, uri, state, expirationTime}};
//    arquivos EXPIRAM EM 48 H; PDF ≤ 50 MB / 1000 páginas (258 tokens/pág.).
//  - countTokens: POST /v1beta/models/{model}:countTokens
//    {contents:[{role:"user"|"model", parts:[{text}|{file_data}|{inline_data}]}]}
//    → {totalTokens}.

const API = "https://generativelanguage.googleapis.com/v1beta";
const API_UPLOAD = "https://generativelanguage.googleapis.com/upload/v1beta";
// Margem de 1 h sob as 48 h oficiais: um upload "quase vencido" nunca entra
// num request que chegaria à API depois de expirado.
const UPLOAD_TTL_MS = 47 * 60 * 60 * 1000;

// Espelha `CAB_CTX` de src/trava.js. A duplicacao e deliberada: este e um ES
// module do worker e aquele e um IIFE que tambem roda no content script. Ha
// teste que confere que as cinco copias batem -- divergir aqui faz a guarda de
// saida nao achar a atribuicao e BLOQUEAR o turno.
const CAB_CTX = "x-pje-ctx";

function headersGemini(apiKey, ctx) {
  const h = {
    "content-type": "application/json",
    "x-goog-api-key": apiKey,
    "Api-Revision": "2026-05-20",
  };
  // A guarda de saida do worker le e REMOVE este cabecalho.
  if (ctx) h[CAB_CTX] = ctx;
  return h;
}

// ---------------------------------------------------------------------------
// Tradução do histórico interno (blocos estilo Anthropic, o formato canônico
// da extensão) para o input stateless da Interactions API. Regras:
//  - document file/base64 → item {type:"document"} precedido de um item de
//    texto "[Peça anexada: título]" (o document do Gemini não tem `title`, e
//    o system prompt exige citar as peças pelo nome);
//  - document text → item de texto com o título como cabeçalho;
//  - blocos do assistant: {type:"text"} viram model_output; {type:
//    "x-gemini-item", raw} é o step ORIGINAL do Gemini (thought assinado,
//    chamadas de busca) e volta VERBATIM — nunca tocar no raw.
// Campos internos/proprietários (cache_control, citations, __pecaId) nunca
// são copiados: os itens são construídos do zero.
// ---------------------------------------------------------------------------
function traduzirHistorico(messages) {
  const input = [];
  for (const turn of messages || []) {
    if (turn.role === "user") {
      const content = [];
      const blocos =
        typeof turn.content === "string"
          ? [{ type: "text", text: turn.content }]
          : turn.content || [];
      for (const b of blocos) {
        if (!b) continue;
        if (b.type === "document") {
          const t = b.title || "peça do processo";
          const src = b.source || {};
          if (src.type === "file") {
            content.push({ type: "text", text: "[Peça anexada: " + t + "]" });
            content.push({
              type: "document",
              uri: src.file_id,
              mime_type: "application/pdf",
            });
          } else if (src.type === "base64") {
            content.push({ type: "text", text: "[Peça anexada: " + t + "]" });
            content.push({
              type: "document",
              data: src.data,
              mime_type: src.media_type || "application/pdf",
            });
          } else if (src.type === "text") {
            content.push({
              type: "text",
              text: "=== Peça: " + t + " ===\n" + (src.data || ""),
            });
          }
        } else if (b.type === "image") {
          // Anexo em imagem (foto do BO, print de conversa). O content part da
          // Interactions API é `{type:"image", data, mime_type}` — irmão do
          // `document`, e não uma variante dele (Data Model da API, seção
          // "Content types"). O rótulo com título e id vai no bloco de texto
          // que `montarBlocos` emite ao lado deste.
          const src = b.source || {};
          if (src.type === "base64") {
            content.push({
              type: "image",
              data: src.data,
              mime_type: src.media_type || "image/jpeg",
            });
          }
        } else if (b.type === "text") {
          content.push({ type: "text", text: b.text || "" });
        }
        // outros tipos em turno de usuário não existem no fluxo da extensão
      }
      if (content.length) input.push({ type: "user_input", content });
    } else {
      // turno do assistant: agrupa textos em model_output; steps originais
      // do Gemini (x-gemini-item) entram verbatim, na ordem em que vieram
      let textos = [];
      const flush = () => {
        if (textos.length) {
          input.push({ type: "model_output", content: textos });
          textos = [];
        }
      };
      const blocos =
        typeof turn.content === "string"
          ? [{ type: "text", text: turn.content }]
          : turn.content || [];
      for (const b of blocos) {
        if (!b) continue;
        if (b.type === "x-gemini-item" && b.raw) {
          flush();
          input.push(b.raw);
        } else if (b.type === "text") {
          textos.push({ type: "text", text: b.text || "" });
        }
        // blocos de outro provedor (thinking/tool da Anthropic) não chegam
        // aqui: trocar de provedor no meio da conversa é bloqueado na UI
      }
      flush();
    }
  }
  // A API devolve 400 se o request terminar com turno do modelo (prefill
  // proibido). No fluxo normal o último turno é sempre do usuário — falhar
  // alto aqui é melhor que um 400 críptico.
  const ultimo = input[input.length - 1];
  if (ultimo && ultimo.type !== "user_input") {
    throw new Error(
      "o histórico termina em um turno do modelo — a API do Gemini não aceita esse formato"
    );
  }
  return input;
}

// Teto de saída dos modelos Gemini suportados (65.536) — sempre explícito
// no request para a resposta nunca ser cortada por um default menor.
const MAX_OUTPUT_TOKENS = 65536;

// "Deixar livre": afrouxa ao MÁXIMO o filtro de conteúdo CONFIGURÁVEL do Gemini.
// Autos descrevem violência, crimes, drogas, abuso — conteúdo jurídico legítimo
// que o filtro barra por padrão. BLOCK_NONE em todas as categorias é o mais
// permissivo aceito de forma universal (o threshold "OFF" não existe em todos os
// modelos). ATENÇÃO: isto NÃO afeta a camada NÃO-configurável do Google (o "400
// blocked for an unspecified policy reason") — essa não há como desligar; para
// conteúdo barrado ali, a saída segue sendo trocar para um modelo Claude.
const SAFETY_LIVRE = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
];
// AUTOCURA: se a Interactions API não aceitar `safety_settings` (400 nomeando o
// campo), reenviamos SEM ele e paramos de mandá-lo — o Gemini nunca pode
// quebrar por causa de um campo que a versão da API não conhece.
//
// A DESCOBERTA VIVE EM `chrome.storage.session`, e não só nesta variável de
// módulo, por um motivo MEDIDO: em 13/08/2026 o Google removeu
// `safety_settings` da Gemini API (a recusa diz que o parâmetro só existe no
// "Gemini Enterprise Agent Platform"), e a recusa vale para TODOS os modelos —
// conferido no 3.7 e no 3.6. Ou seja, a autocura deixou de ser o caso raro para
// o qual foi escrita e passou a valer para todo request. Como o worker MV3 morre
// a cada ~30 s de ociosidade, uma variável de módulo re-aprende a cada turno: o
// usuário pagava 400 + reenvio do corpo INTEIRO quase sempre — barato quando as
// peças vão por `uri` da Files API, caro no fallback base64, em que dezenas de
// MB sobem duas vezes. Com a memória de sessão o preço cai para UMA vez por
// sessão do navegador.
//
// `session` e não `local` de propósito: sobrevive à morte do worker (que é o que
// resolve o problema) e morre com o navegador (que é a granularidade certa para
// re-testar — sem lógica de expiração e sem gravar nada permanente no disco de
// quem usa). E a maquinaria continua de pé: se o campo voltar a ser aceito, a
// sessão seguinte volta a mandá-lo sozinha, sem precisar de release.
const CHAVE_SAFETY_OFF = "geminiSafetyIndisponivel";
let safetyGeminiSuportado = true;
let safetyConsultado = false; // já lemos o storage nesta vida do worker?

// Best-effort dos DOIS lados: sem `chrome` (é assim que este arquivo é testado
// fora do navegador) ou com o storage indisponível, o comportamento degrada
// exatamente para o de antes — no pior caso, um reenvio. Falha aqui não pode
// derrubar um turno, que é o oposto do que esta função existe para evitar.
function sessaoDaExtensao() {
  try {
    const c = globalThis.chrome;
    return (c && c.storage && c.storage.session) || null;
  } catch {
    return null;
  }
}
async function carregarSafetyDaSessao() {
  if (safetyConsultado) return;
  safetyConsultado = true;
  const sess = sessaoDaExtensao();
  if (!sess) return;
  try {
    const v = await new Promise((resolve) => sess.get([CHAVE_SAFETY_OFF], resolve));
    if (v && v[CHAVE_SAFETY_OFF]) safetyGeminiSuportado = false;
  } catch {
    /* segue mandando o campo — no pior caso, um reenvio */
  }
}
function lembrarSafetyIndisponivel() {
  const sess = sessaoDaExtensao();
  if (!sess) return;
  try {
    sess.set({ [CHAVE_SAFETY_OFF]: true });
  } catch {
    /* idem: a descoberta se perde, o turno não */
  }
}

// req: {apiKey, model, system, messages, tools?, thinkingLevel?}
// Campos do caminho Anthropic (betas, container, thinking, output_config,
// max_tokens) são simplesmente ignorados — em especial max_tokens (32000):
// aqui o teto é MAX_OUTPUT_TOKENS (ver o cabeçalho do arquivo).
export async function* streamGemini(req) {
  // Histórico traduzido UMA vez — reusado se precisar re-montar o corpo sem
  // safety_settings no fallback de autocura abaixo.
  const input = traduzirHistorico(req.messages);
  const generation_config = { max_output_tokens: MAX_OUTPUT_TOKENS };
  if (req.thinkingLevel) generation_config.thinking_level = req.thinkingLevel;

  // Monta e SERIALIZA o corpo (uma vez por chamada — `JSON.stringify` duas vezes
  // custa caro no fallback base64, com peça inline de dezenas de MB). `incluiSafety`
  // liga o afrouxamento do filtro configurável (ver SAFETY_LIVRE).
  function prepararCorpo(incluiSafety) {
    const body = {
      model: req.model,
      system_instruction: req.system,
      input,
      store: false,
      stream: true,
      generation_config,
    };
    if (req.tools && req.tools.length) body.tools = req.tools;
    if (incluiSafety) body.safety_settings = SAFETY_LIVRE;
    let corpoJson;
    try {
      corpoJson = JSON.stringify(body);
    } catch (e) {
      console.error("[PJe IA] Gemini: request não serializável:", e);
      throw new Error("Falha ao montar o request para a API do Google.");
    }
    // Radiografia da FORMA no console do service worker (só tipos e KB; nenhum
    // conteúdo de peça é impresso — NÃO despejar o body: carrega trecho dos autos).
    try {
      console.log(
        "[PJe IA] Gemini request: " +
          (corpoJson.length / 1024).toFixed(0) + " KB | itens: " +
          (body.input || [])
            .map((it) => {
              if (it.type === "user_input" || it.type === "model_output") {
                return it.type + "(" + (it.content || []).map((c) => c.type).join("+") + ")";
              }
              return it.type + (it.signature ? "[sig]" : "");
            })
            .join(" > ")
      );
    } catch {
      /* console indisponível */
    }
    return corpoJson;
  }

  const enviar = (incluiSafety) =>
    fetch(API + "/interactions", {
      method: "POST",
      headers: headersGemini(req.apiKey, req.ctx),
      body: prepararCorpo(incluiSafety),
    });

  // A descoberta gravada na sessão precisa estar carregada ANTES do primeiro
  // envio — é ela que evita repetir o 400 + reenvio a cada vida do worker.
  await carregarSafetyDaSessao();
  let resp = await enviar(safetyGeminiSuportado);
  if (!resp.ok) {
    let apiMsg = await lerCorpoErroGemini(resp);
    // AUTOCURA do safety_settings: só quando o erro fala do CAMPO. Um bloqueio
    // de política comum ("blocked for an unspecified policy reason") não fala,
    // então não dispara um segundo envio dos autos (caro) à toa.
    //
    // O casamento é por `/safety/`, e não pelo literal `safety_settings`, porque
    // a API recusa o campo em pelo menos QUATRO redações e só a primeira traz o
    // nome em snake_case: campo desconhecido ("Unknown name \"safety_settings\""),
    // valor de enum inválido ("Unknown value at 'safety_settings[4].category'" —
    // o caso real de `HARM_CATEGORY_CIVIC_INTEGRITY`, que nem toda versão
    // conhece), threshold restrito ("Safety setting threshold ... restricted",
    // com espaço e maiúscula) e a ATUAL, de 13/08/2026 ("The parameter
    // 'safety_settings' is not available on the Gemini API but it is available
    // on the Gemini Enterprise Agent Platform") — esta última em TODOS os
    // modelos. Errar aqui não custa um recurso: um 400 não reconhecido deixaria
    // a extensão sem responder nada. O preço do casamento largo é, no pior caso,
    // UM reenvio por sessão do navegador (ver a memória de sessão acima).
    if (resp.status === 400 && safetyGeminiSuportado && /safety/i.test(apiMsg)) {
      safetyGeminiSuportado = false;
      lembrarSafetyIndisponivel();
      console.debug("[PJe IA] Gemini: safety_settings não aceito — reenviando sem o campo e desativando nesta sessão do navegador");
      resp = await enviar(false);
      if (!resp.ok) apiMsg = await lerCorpoErroGemini(resp);
    }
    if (!resp.ok) {
      const err = new Error(mensagemErroGemini(resp.status, apiMsg));
      err.status = resp.status;
      // transitórios: o chamador re-tenta o MESMO request com backoff
      err.retryable = resp.status === 429 || resp.status >= 500;
      throw err;
    }
  }

  // Acumula os STEPS do turno (indexados por ev.index). interaction.completed
  // pode trazer os steps completos — quando traz, eles são a versão oficial.
  const steps = [];
  let interacaoFinal = null;

  for await (const ev of sseEvents(resp)) {
    const tipo = ev.event_type || "";
    if (tipo === "step.start") {
      const s = structuredClone(ev.step || {});
      steps[ev.index] = s;
      if (s.type === "google_search_call") {
        const q = s.arguments && s.arguments.queries && s.arguments.queries[0];
        yield { kind: "tool", name: "web_search", input: { query: q } };
      }
    } else if (tipo === "step.delta") {
      const s = steps[ev.index] || (steps[ev.index] = { type: "model_output" });
      const d = ev.delta || {};
      if (d.type === "text") {
        // anexa ao último item de texto do model_output (ou cria o primeiro)
        if (!Array.isArray(s.content)) s.content = [];
        let alvo = s.content[s.content.length - 1];
        if (!alvo || alvo.type !== "text") {
          alvo = { type: "text", text: "" };
          s.content.push(alvo);
        }
        alvo.text = (alvo.text || "") + (d.text || "");
        yield { kind: "text", text: d.text || "" };
      } else if (d.type === "thought_summary") {
        const t = (d.content && d.content.text) || "";
        if (!Array.isArray(s.summary)) s.summary = [];
        let alvo = s.summary[s.summary.length - 1];
        if (!alvo || alvo.type !== "text") {
          alvo = { type: "text", text: "" };
          s.summary.push(alvo);
        }
        alvo.text = (alvo.text || "") + t;
        if (s.type === "model_output") s.type = "thought";
        yield { kind: "thinking", text: t };
      } else if (d.type === "thought_signature") {
        // assinatura criptografada: precisa voltar INTACTA no reenvio
        s.signature = (s.signature || "") + (d.signature || "");
      }
      // deltas desconhecidos: ignorados (o interaction.completed traz a
      // versão oficial dos steps quando o schema evolui)
    } else if (tipo === "interaction.completed") {
      interacaoFinal = ev.interaction || null;
    } else if (tipo === "error" || ev.error) {
      const m =
        (ev.error && (ev.error.message || ev.error.status)) ||
        "erro no stream da API do Gemini";
      const err = new Error(String(m));
      err.retryable = /unavailable|internal|overloaded|resource_exhausted/i.test(
        String(m)
      );
      throw err;
    }
  }

  // Stream encerrado SEM o interaction.completed: conexão caiu de forma
  // "limpa" no meio do turno (proxy, rede) — a resposta parcial não pode
  // passar por completa. Erro re-tentável: o executarTurno re-tenta o mesmo
  // request com backoff (o prefixo está no implicit cache, custa pouco).
  if (!interacaoFinal) {
    const err = new Error(
      "o stream da API do Gemini terminou sem o evento de conclusão — tente de novo"
    );
    err.retryable = true;
    throw err;
  }

  // Steps oficiais: os do interaction.completed quando presentes; senão os
  // acumulados dos deltas.
  const oficiais =
    interacaoFinal && Array.isArray(interacaoFinal.steps) && interacaoFinal.steps.length
      ? interacaoFinal.steps
      : steps.filter(Boolean);

  // Annotations (url_citation) chegam nos itens de texto do model_output —
  // normalizadas para o formato web que infoCitacao/chaveCitacao já tratam.
  for (const s of oficiais) {
    if (!s || s.type !== "model_output" || !Array.isArray(s.content)) continue;
    for (const item of s.content) {
      for (const a of (item && item.annotations) || []) {
        if (a && a.type === "url_citation") {
          yield {
            kind: "citation",
            citation: {
              type: "web_search_result_location",
              url: a.url,
              title: a.title,
            },
          };
        }
      }
    }
  }

  const status = (interacaoFinal && interacaoFinal.status) || "completed";
  if (/^(failed|error|cancelled)$/i.test(status)) {
    // turno encerrado com falha do lado do servidor: melhor lançar (e deixar
    // o retry do background agir) do que devolver um "end_turn" mudo
    const err = new Error("a API do Gemini encerrou o turno com falha — tente de novo");
    err.retryable = true;
    throw err;
  }
  if (/max[_ ]?tokens|length/i.test(status)) yield { kind: "trunc" };

  yield {
    kind: "final",
    content: stepsParaBlocos(oficiais),
    stopReason: mapStopReason(status),
    containerId: null,
    usage: normalizarUsage(interacaoFinal && interacaoFinal.usage),
  };
}

// Converte os steps do Gemini nos blocos que a extensão guarda no histórico:
//  - model_output só de texto e SEM assinatura → blocos {type:"text"} comuns
//    (compatíveis com sanearCitacoes, transcript e o fallback do content.js);
//  - qualquer outro step (thought assinado, buscas, texto com assinatura) →
//    {type:"x-gemini-item", raw} — wrapper OPACO que prepararEnvio e
//    sanearCitacoes não tocam; traduzirHistorico devolve o raw verbatim.
// Um step de busca só tem valor no reenvio se carregar o que a API produziu:
// as `queries` na chamada, o payload no resultado. Sem isso é casca do
// `step.start` — não informa o modelo e faz a API recusar o request.
function ehStepDeBusca(s) {
  const t = s && s.type;
  return t === "google_search_call" || t === "google_search_result";
}
function ehStepDeBuscaOco(s) {
  if (!ehStepDeBusca(s)) return false;
  const temAlgo =
    // As queries da chamada aparecem em `arguments.queries` — é de lá que o
    // `step.start` as lê para montar o status "Pesquisando jurisprudência: …".
    // Olhar só a raiz (`s.queries`) dava um falso "oco" numa chamada COMPLETA e
    // a jogava fora do histórico, que é o oposto do que esta guarda existe para
    // fazer. As duas formas contam, porque o schema não é o mesmo nos steps do
    // `interaction.completed` e nos acumulados dos deltas.
    (s.arguments && Array.isArray(s.arguments.queries) && s.arguments.queries.length) ||
    (Array.isArray(s.queries) && s.queries.length) ||
    (Array.isArray(s.content) && s.content.length) ||
    (Array.isArray(s.results) && s.results.length) ||
    (s.search_suggestions && String(s.search_suggestions).length);
  return !temAlgo;
}

function stepsParaBlocos(oficiais) {
  const blocos = [];
  // Steps de busca são TUDO OU NADA no turno. Um `google_search_result` sem a
  // chamada que o produziu (ou o inverso) é um par quebrado no histórico — o
  // mesmo tipo de request malformado que a guarda abaixo existe para evitar.
  // No caso que originou o bug os dois vinham ocos juntos, mas basta a API
  // preencher um e não o outro para a decisão peça a peça produzir o órfão.
  const buscaIncompleta = oficiais.some(ehStepDeBuscaOco);
  for (const s of oficiais) {
    if (!s) continue;
    // Step de ferramenta OCO não volta ao histórico. Quando o
    // `interaction.completed` não traz os steps, caímos nos acumulados do
    // `step.start`, que são ESQUELETOS: `{id, signature:"", type}` — os deltas
    // preenchem texto e a assinatura do thought, mas nunca as `queries` da
    // busca nem os resultados. Reenviar essa casca é o que fazia o 2º turno
    // devolver 400 de corpo vazio (rejeição na borda), e como os steps ficam
    // no histórico para sempre, desligar a Jurisprudência depois não adiantava.
    // Confirmado contra a API real: step de busca COMPLETO volta e dá 200; a
    // casca dá 400 — com ou sem a assinatura vazia.
    if (buscaIncompleta && ehStepDeBusca(s)) continue;
    // Só achata para texto puro o que for REALMENTE puro. Tudo o mais volta
    // verbatim — foi assim que o reenvio funcionou em teste contra a API real.
    // Duas condições que faltavam e quebravam o 2º turno COM busca ligada:
    //  - `annotations`: com google_search, as partes de texto do model_output
    //    carregam as url_citation (é delas que saem as fontes na bolha).
    //    Achatar descartava-as, e o histórico do turno seguinte deixava de ser
    //    o que o modelo produziu.
    //  - `length > 0`: `[].every()` é `true` por vacuidade, então um
    //    model_output de conteúdo vazio passava por "texto puro" e sumia do
    //    histórico inteiro, em vez de voltar como o step que era.
    const soTexto =
      s.type === "model_output" &&
      !s.signature &&
      Array.isArray(s.content) &&
      s.content.length > 0 &&
      s.content.every(
        (it) =>
          it &&
          it.type === "text" &&
          !it.signature &&
          !it.thought_signature &&
          !it.annotations
      );
    if (soTexto) {
      for (const it of s.content) {
        // annotations ficam só na UI (mesma regra das citations da Anthropic)
        blocos.push({ type: "text", text: it.text || "" });
      }
    } else {
      blocos.push({ type: "x-gemini-item", raw: s });
    }
  }
  return blocos;
}

// status da Interaction → vocabulário de stop_reason que a extensão já trata.
// O Gemini não tem pause_turn: o loop de continuação do background sai
// naturalmente na primeira iteração.
function mapStopReason(status) {
  const s = String(status || "").toLowerCase();
  if (/max[_ ]?tokens|length/.test(s)) return "max_tokens";
  if (/safety|recitation|blocklist|prohibited|spii/.test(s)) return "refusal";
  return "end_turn";
}

// usage do Gemini → as 4 categorias estilo Anthropic que custo/gauge/tooltip
// já consomem. total_input_tokens INCLUI os cacheados; o implicit caching não
// tem "gravação" cobrada à parte (cache_creation = 0).
function normalizarUsage(u) {
  if (!u) return null;
  const cached = u.total_cached_tokens || 0;
  const input = Math.max(0, (u.total_input_tokens || 0) - cached);
  const output = (u.total_output_tokens || 0) + (u.total_thought_tokens || 0);
  return {
    input_tokens: input,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
    output_tokens: output,
  };
}

// Itera os eventos SSE ("data: {...}") do corpo da resposta (mesmo parser do
// claude.js — o framing SSE é idêntico, inclusive o [DONE] final).
async function* sseEvents(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      yield ev;
    }
  }
}

// ---------------------------------------------------------------------------
// Upload à File API do Gemini (protocolo resumable em duas etapas) + poll até
// o arquivo ficar ACTIVE. Devolve {fileUri, expiraEm} — o chamador guarda a
// expiração no cache (48 h oficiais; usamos 47 h de margem).
// ---------------------------------------------------------------------------
export async function uploadFileGemini({ apiKey, filename, b64, mime, ctx }) {
  const mimeType = mime || "application/pdf";
  const blob = await (await fetch("data:" + mimeType + ";base64," + b64)).blob();

  // etapa 1: "start" — devolve a URL de upload no header x-goog-upload-url
  const start = await fetch(API_UPLOAD + "/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "content-type": "application/json",
      // Atribuição para a guarda de saída (ver CAB_CTX): sem ela um upload
      // legítimo de OUTRO processo seria bloqueado por falta de ctx sempre
      // que qualquer aba tivesse sigilo armado.
      ...(ctx ? { [CAB_CTX]: ctx } : {}),
    },
    body: JSON.stringify({ file: { display_name: filename || "documento.pdf" } }),
  });
  if (!start.ok) throw new Error(await friendlyHttpErrorGemini(start));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("a File API do Google não retornou a URL de upload");

  // etapa 2: bytes + finalize
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      // Atribuição para a guarda de saída (ver CAB_CTX): sem ela um upload
      // legítimo de OUTRO processo seria bloqueado por falta de ctx sempre
      // que qualquer aba tivesse sigilo armado.
      ...(ctx ? { [CAB_CTX]: ctx } : {}),
    },
    body: blob,
  });
  if (!up.ok) throw new Error(await friendlyHttpErrorGemini(up));
  const j = await up.json();
  const file = (j && j.file) || {};
  if (!file.uri) throw new Error("a File API do Google não retornou o URI do arquivo");

  // PDFs ficam em PROCESSING por alguns segundos antes de poderem ser usados
  let estado = file.state;
  const fim = Date.now() + 60000;
  while (estado === "PROCESSING" && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 2000));
    const meta = await fetch(API + "/" + file.name, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!meta.ok) break;
    const m = await meta.json();
    estado = m && m.state;
  }
  if (estado === "FAILED") {
    throw new Error("o processamento do arquivo falhou na File API do Google — tente de novo");
  }
  if (estado === "PROCESSING") {
    throw new Error("a File API do Google demorou demais para processar o arquivo — tente de novo");
  }

  return { fileUri: file.uri, expiraEm: Date.now() + UPLOAD_TTL_MS };
}

// ---------------------------------------------------------------------------
// Contagem de tokens (endpoint countTokens do generateContent — a Interactions
// API não tem um próprio). Aproximação honesta: documents viram file_data/
// inline_data (contagem real de páginas), textos viram parts de texto e steps
// opacos (x-gemini-item) são serializados como texto. A guarda de 90% da
// janela absorve a imprecisão; o usage pós-turno corrige de graça.
// ---------------------------------------------------------------------------
export async function countTokensGemini({ apiKey, model, system, messages, ctx }) {
  const contents = [];
  if (system) contents.push({ role: "user", parts: [{ text: system }] });
  for (const turn of messages || []) {
    const role = turn.role === "assistant" ? "model" : "user";
    const parts = [];
    const blocos =
      typeof turn.content === "string"
        ? [{ type: "text", text: turn.content }]
        : turn.content || [];
    for (const b of blocos) {
      if (!b) continue;
      if (b.type === "text") {
        parts.push({ text: b.text || "" });
      } else if (b.type === "document") {
        const src = b.source || {};
        if (src.type === "file") {
          parts.push({
            file_data: { file_uri: src.file_id, mime_type: "application/pdf" },
          });
        } else if (src.type === "base64") {
          parts.push({
            inline_data: {
              mime_type: src.media_type || "application/pdf",
              data: src.data,
            },
          });
        } else if (src.type === "text") {
          parts.push({ text: src.data || "" });
        }
      } else if (b.type === "image") {
        // countTokens usa o endpoint do generateContent, cujo vocabulário é
        // `inline_data` — a imagem entra aqui como qualquer outra mídia.
        const src = b.source || {};
        if (src.type === "base64") {
          parts.push({
            inline_data: { mime_type: src.media_type || "image/jpeg", data: src.data },
          });
        }
      } else if (b.type === "x-gemini-item") {
        // aproximação: o conteúdo textual do step (ou o JSON, limitado)
        parts.push({ text: textoDeStep(b.raw) });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  const resp = await fetch(API + "/models/" + model + ":countTokens", {
    method: "POST",
    headers: headersGemini(apiKey, ctx),
    body: JSON.stringify({ contents }),
  });
  if (!resp.ok) throw new Error(await friendlyHttpErrorGemini(resp));
  const j = await resp.json();
  return (j && (j.totalTokens || j.total_tokens)) || 0;
}

function textoDeStep(s) {
  if (!s) return "";
  const pedacos = [];
  for (const it of s.content || s.summary || []) {
    if (it && typeof it.text === "string") pedacos.push(it.text);
  }
  if (pedacos.length) return pedacos.join("\n");
  try {
    return JSON.stringify(s).slice(0, 4000);
  } catch {
    return "";
  }
}

// Lê o corpo de erro de uma Response do Google UMA vez (o corpo de uma Response
// só pode ser consumido uma vez — `resp.json()` + `resp.text()` no catch lança
// "body stream already read") e devolve a mensagem da API. Também loga
// status/URL: a única pista de QUAL endpoint recusou (stream /interactions vs.
// pré-voo :countTokens). Separado de `mensagemErroGemini` para o stream poder
// INSPECIONAR o corpo (detectar a rejeição de `safety_settings`) sem reler.
export async function lerCorpoErroGemini(resp) {
  let apiMsg = "";
  let bruto = "";
  try {
    bruto = await resp.text();
  } catch {
    /* corpo já consumido ou indisponível */
  }
  try {
    const j = bruto ? JSON.parse(bruto) : null;
    // A API do Google devolve o erro em DUAS formas: o objeto {error:{message}}
    // e, em alguns endpoints, um ARRAY [{error:{message}}]. Sem tratar o array,
    // `apiMsg` ficava vazio e o usuário via só "Erro da API do Google (400)".
    const raiz = Array.isArray(j) ? j.find((x) => x && x.error) || {} : j || {};
    apiMsg = (raiz.error && (raiz.error.message || raiz.error.status)) || "";
    // Último recurso: corpo JSON com forma inesperada. Melhor mostrar um trecho
    // cru do que engolir a única pista que existe.
    if (!apiMsg && j) apiMsg = JSON.stringify(j).slice(0, 240);
  } catch {
    // corpo não-JSON: ainda assim pode ter texto útil (HTML de proxy, etc.)
    apiMsg = bruto.slice(0, 240);
  }
  try {
    console.error(
      "[PJe IA] Gemini HTTP " + resp.status + " em " + resp.url + " — corpo: " + (apiMsg || "(vazio)")
    );
  } catch {
    /* console indisponível */
  }
  return apiMsg;
}

// Converte status + corpo (já lido) em mensagem clara em português.
function mensagemErroGemini(status, apiMsg) {
  const resp = { status }; // as ramificações abaixo comparam resp.status
  const low = (apiMsg || "").toLowerCase();

  if (resp.status === 400 && (low.includes("api key not valid") || low.includes("api_key_invalid"))) {
    return "Chave da API do Google inválida. Confira a chave Gemini nas configurações da extensão.";
  }
  if (resp.status === 401 || resp.status === 403) {
    return "Chave da API do Google sem permissão para este recurso. Confira a chave em aistudio.google.com.";
  }
  if (
    resp.status === 400 &&
    (low.includes("token count") || low.includes("exceeds the maximum") || low.includes("context"))
  ) {
    return "As peças selecionadas excedem o contexto do modelo. Desmarque algumas peças ou inicie uma nova conversa.";
  }
  // Filtro de CONTEÚDO do Google (não é erro da extensão nem das peças): autos
  // descrevem violência, crimes, drogas etc. e o Gemini barra na borda, ANTES de
  // o modelo ver. É determinístico pelo conteúdo — por isso não é re-tentável
  // (o chamador não repete) — e a camada de "unspecified policy" costuma ser a
  // NÃO-configurável (safety_settings não a afrouxam). A saída prática é trocar
  // de provedor ou reduzir/isolar a peça que dispara o filtro.
  if (
    resp.status === 400 &&
    (low.includes("policy") ||
      low.includes("prohibited") ||
      (low.includes("blocked") && low.includes("modify your input")))
  ) {
    return (
      "O Google bloqueou esta análise no filtro de conteúdo dele — as peças descrevem " +
      "fatos que a política do Gemini barra. Não é falha da extensão. Para seguir: use " +
      "um modelo Claude (Anthropic) nesta análise (ele não aplica esse bloqueio a " +
      "conteúdo jurídico), ou envie menos peças por vez para descobrir qual dispara o filtro."
    );
  }
  if (resp.status === 429) {
    return (
      "Limite de requisições da API do Google atingido (no plano gratuito a cota é pequena). " +
      "Aguarde alguns instantes e tente de novo."
    );
  }
  if (resp.status === 413 || (resp.status === 400 && low.includes("too large"))) {
    return "As peças selecionadas são grandes demais para uma única análise. Desmarque algumas e tente novamente.";
  }
  if (resp.status === 503 || resp.status >= 500) {
    return "A API do Google está sobrecarregada no momento. Tente novamente em instantes.";
  }
  return "Erro da API do Google (" + resp.status + ")" + (apiMsg ? ": " + apiMsg.slice(0, 240) : "");
}

// Assinatura preservada para os call sites (upload/countTokens): lê o corpo e
// monta a mensagem num passo só.
export async function friendlyHttpErrorGemini(resp) {
  return mensagemErroGemini(resp.status, await lerCorpoErroGemini(resp));
}
