// Cliente da API da OpenAI (Responses API), irmão de claude.js e gemini.js.
// Emite o MESMO vocabulário de eventos que streamClaude/streamGemini — o
// background.js consome os três sem saber qual provedor está por trás:
//   {kind:"text", text}          — delta de texto da resposta
//   {kind:"thinking", text}      — delta do resumo de raciocínio ("" no início)
//   {kind:"citation", citation}  — citação (annotations url_citation → formato
//                                  web_search_result_location que a UI já trata)
//   {kind:"tool", name, input}   — o servidor executou a busca web
//   {kind:"trunc"}               — resposta cortada pelo teto de saída
//   {kind:"final", content, stopReason, containerId, usage} — fim do request
//
// FORMATOS DA RESPONSES API (developers.openai.com, GA em 2026 — sem header
// beta; a API antiga /v1/chat/completions NÃO é usada):
//  - Request: POST {base}/responses, header Authorization: Bearer <key>.
//    Body: {model, instructions, input, store:false, stream:true,
//    reasoning:{effort, summary:"auto"}, include:["reasoning.encrypted_content"],
//    max_output_tokens, tools?}. O system prompt vai em `instructions` (nível
//    superior), NÃO no input. store:false = modo STATELESS (nada é guardado no
//    servidor; o histórico inteiro é reenviado a cada request, como na
//    Anthropic e no Gemini).
//  - input (modo STATELESS): array de itens, na ORDEM original:
//    * turno do usuário: {role:"user", content:[{type:"input_text",text} |
//      {type:"input_file", file_id | (filename + file_data:"data:...;base64,")}]}
//    * turno do modelo (histórico): os PRÓPRIOS itens de `response.output`,
//      VERBATIM — {type:"reasoning", id, summary, encrypted_content} e
//      {type:"message", id, role:"assistant", status:"completed",
//      content:[{type:"output_text",text}]}. Os itens `reasoning` carregam
//      conteúdo criptografado e DEVEM voltar intactos (regra igual à do
//      thinking assinado da Anthropic e do thought_signature do Gemini), por
//      isso o `include:["reasoning.encrypted_content"]` no request.
//  - Streaming (SSE, "data: {json}"): cada evento tem um campo `type`.
//    Eventos usados: response.output_item.added (item novo: reasoning começou,
//    web_search_call…), response.output_text.delta {delta},
//    response.reasoning_summary_text.delta {delta},
//    response.output_text.annotation.added {annotation}, response.completed
//    {response}, response.incomplete {response}, response.failed {response},
//    error. O evento final (completed/incomplete) traz `response.output`
//    (itens completos) e `response.usage`.
//  - usage (response.usage): input_tokens (INCLUI cache),
//    input_tokens_details.cached_tokens, output_tokens (INCLUI reasoning),
//    output_tokens_details.reasoning_tokens.
//  - Files API: POST {base}/files (multipart: file + purpose:"user_data");
//    resposta {id}. Os arquivos persistem na conta (não expiram por padrão),
//    então o cache de sessão não precisa validar expiração (ao contrário do
//    Gemini). PDF: ≤ 50 MB por arquivo / ≤ 50 MB somados por request.
//  - countTokens: POST {base}/responses/input_tokens com o MESMO corpo do
//    /responses (model, instructions, input, tools) → {input_tokens}. É o
//    análogo gratuito ao count_tokens da Anthropic.

const API = "https://api.openai.com/v1";

// Teto de saída explícito (reasoning + texto contam juntos): generoso para a
// resposta nunca ser cortada por um default menor, e limitado para custo e
// latência previsíveis. 65.536 é folga enorme para uma minuta jurídica somada
// ao resumo de raciocínio (o máximo dos modelos 5.6 é 128.000).
const MAX_OUTPUT_TOKENS = 65536;

// Espelha `CAB_CTX` de src/trava.js. A duplicacao e deliberada: este e um ES
// module do worker e aquele e um IIFE que tambem roda no content script. Ha
// teste que confere que as cinco copias batem -- divergir aqui faz a guarda de
// saida nao achar a atribuicao e BLOQUEAR o turno.
const CAB_CTX = "x-pje-ctx";

function headersOpenAI(apiKey, ctx) {
  const h = {
    "content-type": "application/json",
    authorization: "Bearer " + apiKey,
  };
  // A guarda de saida do worker le e REMOVE este cabecalho.
  if (ctx) h[CAB_CTX] = ctx;
  return h;
}

// ---------------------------------------------------------------------------
// Tradução do histórico interno (blocos estilo Anthropic, o formato canônico
// da extensão) para o input stateless da Responses API. Regras:
//  - document file/base64 → item {type:"input_file"} precedido de um item de
//    texto "[Peça anexada: título]" (o input_file por file_id não tem `title`,
//    e o system prompt exige citar as peças pelo nome);
//  - document text (peças HTML) → item de texto com o título como cabeçalho;
//  - blocos do assistant: {type:"text"} viram um item {type:"message",
//    role:"assistant"}; {type:"x-openai-item", raw} é o item ORIGINAL da
//    resposta (reasoning criptografado, chamadas de busca) e volta VERBATIM.
// Campos internos/proprietários (cache_control, citations, __pecaId) nunca são
// copiados: os itens de usuário são construídos do zero.
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
            content.push({ type: "input_text", text: "[Peça anexada: " + t + "]" });
            content.push({ type: "input_file", file_id: src.file_id });
          } else if (src.type === "base64") {
            content.push({ type: "input_text", text: "[Peça anexada: " + t + "]" });
            content.push({
              type: "input_file",
              filename: "peca.pdf",
              file_data:
                "data:" + (src.media_type || "application/pdf") + ";base64," + src.data,
            });
          } else if (src.type === "text") {
            content.push({
              type: "input_text",
              text: "=== Peça: " + t + " ===\n" + (src.data || ""),
            });
          }
        } else if (b.type === "image") {
          // Anexo em imagem: na Responses API a parte é `input_image` com um
          // data URI (o mesmo formato do `file_data` que o PDF já usa aqui).
          const src = b.source || {};
          if (src.type === "base64") {
            content.push({
              type: "input_image",
              image_url: "data:" + (src.media_type || "image/jpeg") + ";base64," + src.data,
            });
          }
        } else if (b.type === "text") {
          content.push({ type: "input_text", text: b.text || "" });
        }
        // outros tipos em turno de usuário não existem no fluxo da extensão
      }
      if (content.length) input.push({ role: "user", content });
    } else {
      // turno do assistant: itens opacos (reasoning, busca) entram VERBATIM, na
      // ordem em que vieram; textos viram um item message reconstruído. A ordem
      // [reasoning, message] é preservada — a API exige que um item reasoning
      // seja seguido pelo item que ele produziu.
      let textos = [];
      const flush = () => {
        if (textos.length) {
          input.push({
            type: "message",
            role: "assistant",
            status: "completed",
            content: textos,
          });
          textos = [];
        }
      };
      const blocos =
        typeof turn.content === "string"
          ? [{ type: "text", text: turn.content }]
          : turn.content || [];
      for (const b of blocos) {
        if (!b) continue;
        if (b.type === "x-openai-item" && b.raw) {
          flush();
          input.push(b.raw);
        } else if (b.type === "text") {
          textos.push({ type: "output_text", text: b.text || "" });
        }
        // blocos de outro provedor não chegam aqui: trocar de provedor no meio
        // da conversa é bloqueado na UI
      }
      flush();
    }
  }
  return input;
}

// req: {apiKey, model, system, messages, tools?, effort?}
// Campos do caminho Anthropic (betas, container, thinking, output_config,
// max_tokens) são simplesmente ignorados — em especial max_tokens (32000):
// aqui o teto é MAX_OUTPUT_TOKENS (ver o cabeçalho do arquivo).
export async function* streamOpenAI(req) {
  const body = {
    model: req.model,
    instructions: req.system,
    input: traduzirHistorico(req.messages),
    store: false,
    stream: true,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // conteúdo de raciocínio criptografado volta no histórico (stateless):
    // precisa vir para poder ser reenviado verbatim nos turnos seguintes.
    include: ["reasoning.encrypted_content"],
  };
  if (req.effort) {
    // summary:"auto" liga o RESUMO de raciocínio no stream (o "pensando…" da
    // UI). context:"all_turns" faz o modelo usar o raciocínio de todos os
    // turnos reenviados.
    body.reasoning = { effort: req.effort, summary: "auto", context: "all_turns" };
  }
  if (req.tools && req.tools.length) body.tools = req.tools;

  const resp = await fetch(API + "/responses", {
    method: "POST",
    headers: headersOpenAI(req.apiKey, req.ctx),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = new Error(await friendlyHttpErrorOpenAI(resp));
    err.status = resp.status;
    // transitórios: o chamador re-tenta o MESMO request com backoff
    err.retryable = resp.status === 429 || resp.status >= 500;
    throw err;
  }

  // A resposta final (response.completed/incomplete) traz `output` (os itens
  // completos) e `usage` — essa é a versão oficial que guardamos no histórico.
  let respostaFinal = null;
  let statusFinal = null;

  for await (const ev of sseEvents(resp)) {
    const tipo = ev.type || "";
    if (tipo === "response.output_text.delta") {
      yield { kind: "text", text: ev.delta || "" };
    } else if (tipo === "response.reasoning_summary_text.delta") {
      yield { kind: "thinking", text: ev.delta || "" };
    } else if (tipo === "response.output_item.added") {
      const it = ev.item || {};
      if (it.type === "reasoning") {
        // sinaliza o início do raciocínio (mesma convenção do claude.js: um
        // thinking "" acende o indicador "Raciocinando…" na UI)
        yield { kind: "thinking", text: "" };
      } else if (it.type === "web_search_call") {
        const q =
          (it.action && it.action.query) ||
          (it.action && it.action.queries && it.action.queries[0]) ||
          null;
        yield { kind: "tool", name: "web_search", input: { query: q } };
      }
    } else if (tipo === "response.output_text.annotation.added") {
      // citações da busca chegam ao vivo, no ponto do texto. Só url_citation
      // (web) — a citação de arquivo (file_citation) não tem página e, no modo
      // textual, o próprio modelo escreve a peça/folha no corpo do texto.
      const a = ev.annotation || {};
      if (a.type === "url_citation") {
        yield {
          kind: "citation",
          citation: {
            type: "web_search_result_location",
            url: a.url,
            title: a.title,
          },
        };
      }
    } else if (tipo === "response.completed") {
      respostaFinal = ev.response || null;
      statusFinal = "completed";
    } else if (tipo === "response.incomplete") {
      respostaFinal = ev.response || null;
      statusFinal = "incomplete";
    } else if (tipo === "response.failed") {
      const e = ev.response && ev.response.error;
      const err = new Error((e && e.message) || "a API da OpenAI encerrou o turno com falha — tente de novo");
      err.retryable = /server_error|rate_limit|overloaded|timeout/i.test(
        (e && (e.type || e.code)) || ""
      );
      throw err;
    } else if (tipo === "error") {
      const e = ev.error || ev;
      const err = new Error((e && e.message) || "erro no stream da API da OpenAI");
      err.retryable = /server_error|rate_limit|overloaded|timeout/i.test(
        (e && (e.type || e.code)) || ""
      );
      throw err;
    }
  }

  // Stream encerrado SEM o evento de conclusão: conexão caiu de forma "limpa"
  // no meio do turno (proxy, rede) — a resposta parcial não pode passar por
  // completa. Erro re-tentável: o executarTurno re-tenta o mesmo request (o
  // prefixo está no cache automático da OpenAI, custa pouco).
  if (!respostaFinal) {
    // O SSE terminou sem `response.completed/incomplete` — a conexão caiu no
    // meio. Continua re-tentável (o worker repete 2×); esta mensagem só chega ao
    // usuário DEPOIS de as tentativas se esgotarem, então aponta o próximo passo
    // real: com muitas peças o request fica grande e a queda se repete, logo
    // reduzir o conjunto costuma ser o que resolve — não só "tentar de novo".
    const err = new Error(
      "a conexão com a OpenAI caiu antes de a resposta terminar. Se persistir, costuma " +
        "ser o tamanho do envio: reduza as peças selecionadas (use os degraus “chave”/" +
        "“principais” ou o ✨ Escolher com IA) e tente de novo."
    );
    err.retryable = true;
    throw err;
  }

  const output = Array.isArray(respostaFinal.output) ? respostaFinal.output : [];
  const stopReason = mapStopReason(respostaFinal, statusFinal);
  if (stopReason === "max_tokens") yield { kind: "trunc" };

  yield {
    kind: "final",
    content: itensParaBlocos(output),
    stopReason,
    containerId: null,
    usage: normalizarUsage(respostaFinal.usage),
  };
}

// Converte os itens de output da OpenAI nos blocos que a extensão guarda no
// histórico:
//  - message do assistant só de texto (output_text) → blocos {type:"text"}
//    comuns (compatíveis com sanearCitacoes, transcript e o fallback do
//    content.js); as annotations ficam só na UI (regra igual à das citações da
//    Anthropic e das annotations do Gemini);
//  - qualquer outro item (reasoning criptografado, web_search_call, message
//    com recusa) → {type:"x-openai-item", raw} — wrapper OPACO que
//    prepararEnvio e sanearCitacoes não tocam; traduzirHistorico devolve o raw
//    verbatim.
function itensParaBlocos(output) {
  const blocos = [];
  for (const it of output) {
    if (!it) continue;
    const soTexto =
      it.type === "message" &&
      Array.isArray(it.content) &&
      it.content.length > 0 &&
      it.content.every((c) => c && c.type === "output_text");
    if (soTexto) {
      for (const c of it.content) blocos.push({ type: "text", text: c.text || "" });
    } else {
      blocos.push({ type: "x-openai-item", raw: it });
    }
  }
  return blocos;
}

// status da resposta → vocabulário de stop_reason que a extensão já trata. A
// OpenAI não tem pause_turn: o loop de continuação do background sai
// naturalmente na primeira iteração.
function mapStopReason(resp, statusFinal) {
  // recusa explícita: um item message com content de tipo "refusal"
  const output = Array.isArray(resp.output) ? resp.output : [];
  for (const it of output) {
    if (it && it.type === "message" && Array.isArray(it.content)) {
      if (it.content.some((c) => c && c.type === "refusal")) return "refusal";
    }
  }
  if (statusFinal === "incomplete") {
    const motivo =
      (resp.incomplete_details && resp.incomplete_details.reason) || "";
    if (/content_filter|safety/i.test(motivo)) return "refusal";
    return "max_tokens"; // max_output_tokens (o caso comum de incomplete)
  }
  return "end_turn";
}

// usage da OpenAI → as 4 categorias estilo Anthropic que custo/gauge/tooltip
// já consomem. input_tokens INCLUI os cacheados; o cache automático não tem
// "gravação" cobrada à parte (cache_creation = 0). output_tokens já inclui os
// tokens de raciocínio.
function normalizarUsage(u) {
  if (!u) return null;
  const cached = (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0;
  const input = Math.max(0, (u.input_tokens || 0) - cached);
  return {
    input_tokens: input,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
    output_tokens: u.output_tokens || 0,
  };
}

// Itera os eventos SSE ("data: {...}") do corpo da resposta (mesmo parser do
// claude.js/gemini.js — o framing SSE é idêntico; a Responses API não manda
// [DONE], termina o stream após response.completed, mas tratamos [DONE] por
// segurança).
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
// Upload à Files API da OpenAI (multipart em uma etapa). Devolve o file_id. Os
// arquivos persistem na conta (sem expiração por padrão), então o chamador
// guarda só o id no cache de sessão — sem validação de expiração.
// ---------------------------------------------------------------------------
export async function uploadFileOpenAI({ apiKey, filename, b64, mime, ctx }) {
  const mimeType = mime || "application/pdf";
  const blob = await (await fetch("data:" + mimeType + ";base64," + b64)).blob();
  const fd = new FormData();
  // purpose "user_data": o valor para documentos de entrada da Responses API
  fd.append("purpose", "user_data");
  fd.append("file", blob, filename || "documento.pdf");
  const resp = await fetch(API + "/files", {
    method: "POST",
    // Atribuição para a guarda de saída (ver CAB_CTX). Sem content-type: o
    // FormData define o boundary do multipart.
    headers: Object.assign({ authorization: "Bearer " + apiKey }, ctx ? { [CAB_CTX]: ctx } : {}),
    body: fd,
  });
  if (!resp.ok) throw new Error(await friendlyHttpErrorOpenAI(resp));
  const j = await resp.json();
  if (!j || !j.id) throw new Error("a Files API da OpenAI não retornou o id do arquivo");
  return j.id;
}

// ---------------------------------------------------------------------------
// Contagem de tokens (endpoint dedicado /responses/input_tokens — mesmo corpo
// do /responses). Conta exatamente entrada + arquivos/imagens + schemas das
// tools. A guarda de 90% da janela e o usage pós-turno usam este número.
// ---------------------------------------------------------------------------
export async function countTokensOpenAI({ apiKey, model, system, messages, tools, ctx }) {
  const body = {
    model,
    instructions: system,
    input: traduzirHistorico(messages),
  };
  if (tools && tools.length) body.tools = tools;
  const resp = await fetch(API + "/responses/input_tokens", {
    method: "POST",
    headers: headersOpenAI(apiKey, ctx),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await friendlyHttpErrorOpenAI(resp));
  const j = await resp.json();
  return (j && (j.input_tokens || j.total_tokens)) || 0;
}

// Converte respostas de erro da API da OpenAI em mensagens claras em português.
export async function friendlyHttpErrorOpenAI(resp) {
  let apiMsg = "";
  try {
    const j = await resp.json();
    apiMsg = (j && j.error && j.error.message) || "";
  } catch {
    /* corpo não-JSON */
  }
  const low = apiMsg.toLowerCase();

  if (resp.status === 401) {
    return "Chave da API da OpenAI inválida. Confira a chave nas configurações da extensão.";
  }
  if (resp.status === 403) {
    return "Chave da API da OpenAI sem permissão para este recurso ou região. Confira em platform.openai.com.";
  }
  if (resp.status === 429 && (low.includes("quota") || low.includes("billing") || low.includes("insufficient"))) {
    return "Sua conta OpenAI está sem crédito ou atingiu a cota. Adicione crédito em platform.openai.com → Billing.";
  }
  if (resp.status === 400 && (low.includes("context") || low.includes("maximum") || low.includes("too many tokens"))) {
    return "As peças selecionadas excedem o contexto do modelo. Desmarque algumas peças ou inicie uma nova conversa.";
  }
  if (resp.status === 429) {
    return "Limite de requisições da API da OpenAI atingido. Aguarde alguns instantes e tente de novo.";
  }
  if (resp.status === 413 || (resp.status === 400 && low.includes("too large"))) {
    return "As peças selecionadas são grandes demais para uma única análise. Desmarque algumas e tente novamente.";
  }
  if (resp.status >= 500) {
    return "A API da OpenAI está sobrecarregada no momento. Tente novamente em instantes.";
  }
  return "Erro da API da OpenAI (" + resp.status + ")" + (apiMsg ? ": " + apiMsg.slice(0, 240) : "");
}
