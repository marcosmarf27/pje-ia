// Cliente da API da Anthropic (chamada direta do navegador, via service worker).
// Faz streaming SSE e ACUMULA os blocos de conteúdo da resposta (padrão dos SDKs):
// os blocos completos precisam voltar intactos ao histórico para citações,
// ferramentas de servidor, continuação de turno (pause_turn) e blocos thinking
// (que carregam assinatura criptográfica e não podem ser alterados no reenvio).
//
// Eventos emitidos:
//   {kind:"text", text}          — delta de texto da resposta
//   {kind:"thinking", text}      — delta do resumo de raciocínio ("" no início)
//   {kind:"citation", citation}  — citação anexada ao bloco de texto corrente
//   {kind:"tool", name}          — o servidor começou a executar uma ferramenta
//   {kind:"trunc"}               — resposta cortada por max_tokens
//   {kind:"final", content, stopReason, containerId, usage} — fim do request

// max_tokens é OBRIGATÓRIO na Anthropic; 32K é o teto de saída aceito por
// todos os modelos Claude.
export const MAX_TOKENS_CHAT = 32000;

// Beta usada pela extensão (referência: docs da API, 2026).
export const BETA_FILES = "files-api-2025-04-14";

const API = "https://api.anthropic.com/v1";

// Espelha `CAB_CTX` de src/trava.js. A duplicacao e deliberada: este e um ES
// module do worker e aquele e um IIFE que tambem roda no content script. Ha
// teste que confere que as cinco copias batem -- divergir aqui faz a guarda de
// saida nao achar a atribuicao e BLOQUEAR o turno.
const CAB_CTX = "x-pje-ctx";

function headers(apiKey, betas, ctx) {
  const h = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    // Necessário para chamar a API direto do navegador.
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (betas && betas.length) h["anthropic-beta"] = betas.join(",");
  // A guarda de saida do worker le e REMOVE este cabecalho; ele nunca chega
  // a API. E por ele que ela sabe de que processo e a requisicao.
  if (ctx) h[CAB_CTX] = ctx;
  return h;
}

// req: {apiKey, model, system, messages, max_tokens?, tools?, container?,
//       thinking?, output_config?, betas?}
export async function* streamClaude(req) {
  const body = {
    model: req.model,
    max_tokens: req.max_tokens || MAX_TOKENS_CHAT,
    stream: true,
    system: req.system,
    messages: req.messages,
  };
  if (req.tools && req.tools.length) body.tools = req.tools;
  if (req.container) body.container = req.container;
  if (req.thinking) body.thinking = req.thinking;
  if (req.output_config) body.output_config = req.output_config;

  const resp = await fetch(API + "/messages", {
    method: "POST",
    headers: headers(req.apiKey, req.betas, req.ctx),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = new Error(await friendlyHttpError(resp));
    err.status = resp.status;
    // transitórios: o chamador pode re-tentar o MESMO request com backoff
    err.retryable = resp.status === 429 || resp.status === 529 || resp.status >= 500;
    throw err;
  }

  const blocks = []; // indexados por ev.index
  let stopReason = null;
  let containerId = null;
  let usage = null;

  for await (const ev of sseEvents(resp)) {
    switch (ev.type) {
      case "message_start": {
        if (ev.message) {
          usage = ev.message.usage || usage;
          if (ev.message.container) containerId = ev.message.container.id;
        }
        break;
      }
      case "content_block_start": {
        const b = structuredClone(ev.content_block || {});
        blocks[ev.index] = b;
        if (b.type === "thinking") yield { kind: "thinking", text: "" };
        if (b.type === "server_tool_use" || b.type === "tool_use") {
          b.__pj = ""; // o input chega fatiado via input_json_delta
          yield { kind: "tool", name: b.name || b.type };
        }
        break;
      }
      case "content_block_delta": {
        const b = blocks[ev.index];
        const d = ev.delta;
        if (!b || !d) break;
        if (d.type === "text_delta") {
          b.text = (b.text || "") + d.text;
          yield { kind: "text", text: d.text };
        } else if (d.type === "thinking_delta") {
          b.thinking = (b.thinking || "") + d.thinking;
          yield { kind: "thinking", text: d.thinking };
        } else if (d.type === "signature_delta") {
          // assinatura do bloco thinking: precisa voltar intacta no reenvio
          b.signature = (b.signature || "") + d.signature;
        } else if (d.type === "citations_delta") {
          if (!Array.isArray(b.citations)) b.citations = [];
          b.citations.push(d.citation);
          yield { kind: "citation", citation: d.citation };
        } else if (d.type === "input_json_delta") {
          b.__pj = (b.__pj || "") + (d.partial_json || "");
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[ev.index];
        if (b && b.__pj !== undefined) {
          try {
            b.input = b.__pj ? JSON.parse(b.__pj) : {};
          } catch {
            b.input = {};
          }
          delete b.__pj;
          // input completo da ferramenta (ex.: a consulta da busca) — permite
          // à UI mostrar O QUE está sendo pesquisado, não só que há busca
          if (b.type === "server_tool_use" || b.type === "tool_use") {
            yield { kind: "tool", name: b.name || b.type, input: b.input };
          }
        }
        break;
      }
      case "message_delta": {
        if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage) usage = Object.assign(usage || {}, ev.usage);
        if (ev.delta && ev.delta.stop_reason === "max_tokens") yield { kind: "trunc" };
        break;
      }
      case "error": {
        // erro emitido NO MEIO do stream (ex.: overloaded_error durante o
        // code execution) — sobrecarga/erro interno são re-tentáveis
        const tipo = (ev.error && ev.error.type) || "";
        const err = new Error((ev.error && ev.error.message) || "erro no stream da API");
        err.retryable = /overloaded|api_error|internal/.test(tipo);
        throw err;
      }
    }
  }

  yield {
    kind: "final",
    content: blocks.filter(Boolean).map(limparBloco),
    stopReason,
    containerId,
    usage,
  };
}

// Remove campos internos do acumulador antes de expor o bloco.
function limparBloco(b) {
  if (b && b.__pj !== undefined) {
    const c = Object.assign({}, b);
    delete c.__pj;
    return c;
  }
  return b;
}

// Itera os eventos SSE (linhas "data: {...}") do corpo da resposta.
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

// Sobe um arquivo para a Files API e devolve o file_id. O conteúdo passa a ser
// referenciado por id nas mensagens (payloads pequenos, sem teto de 24 MB).
export async function uploadFile({ apiKey, filename, b64, mime, ctx }) {
  // decodificação nativa do base64 (rápida mesmo para PDFs grandes)
  const blob = await (await fetch("data:" + (mime || "application/pdf") + ";base64," + b64)).blob();
  const fd = new FormData();
  fd.append("file", blob, filename || "documento.pdf");
  const resp = await fetch(API + "/files", {
    method: "POST",
    headers: {
      // sem content-type: o FormData define o boundary do multipart
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA_FILES,
      // Atribuição para a guarda de saída (ver CAB_CTX). Sem ela um upload
      // legítimo de OUTRO processo seria bloqueado por falta de ctx sempre
      // que qualquer aba tivesse sigilo armado.
      ...(ctx ? { [CAB_CTX]: ctx } : {}),
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: fd,
  });
  if (!resp.ok) throw new Error(await friendlyHttpError(resp));
  const j = await resp.json();
  if (!j || !j.id) throw new Error("a Files API não retornou o id do arquivo");
  return j.id;
}

// Baixa um arquivo da Files API e devolve {b64, mime}.
export async function downloadFile({ apiKey, fileId }) {
  const resp = await fetch(API + "/files/" + fileId + "/content", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA_FILES,
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  if (!resp.ok) throw new Error(await friendlyHttpError(resp));
  const mime = resp.headers.get("content-type") || "application/octet-stream";
  const buf = await resp.arrayBuffer();
  return { b64: bufToB64(buf), mime };
}

// Metadados de um arquivo da Files API (para obter o filename original).
export async function fileMetadata({ apiKey, fileId }) {
  const resp = await fetch(API + "/files/" + fileId, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": BETA_FILES,
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  if (!resp.ok) throw new Error(await friendlyHttpError(resp));
  return resp.json();
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Conta os tokens de um request (endpoint gratuito) — pré-voo antes do envio.
export async function countTokens(req) {
  const body = { model: req.model, system: req.system, messages: req.messages };
  // histórico com blocos de ferramenta exige as tools declaradas também aqui
  if (req.tools && req.tools.length) body.tools = req.tools;
  const resp = await fetch(API + "/messages/count_tokens", {
    method: "POST",
    headers: headers(req.apiKey, req.betas, req.ctx),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await friendlyHttpError(resp));
  const j = await resp.json();
  return (j && j.input_tokens) || 0;
}

// Converte respostas de erro da API em mensagens claras em português.
async function friendlyHttpError(resp) {
  let apiMsg = "";
  try {
    const j = await resp.json();
    apiMsg = (j && j.error && j.error.message) || "";
  } catch {
    /* corpo não-JSON */
  }
  const low = apiMsg.toLowerCase();

  if (resp.status === 401) {
    return "Chave de API inválida. Confira a chave nas configurações da extensão.";
  }
  if (resp.status === 400 && (low.includes("credit") || low.includes("billing"))) {
    return "Sua conta Anthropic está sem crédito. Adicione créditos em console.anthropic.com → Billing.";
  }
  if (resp.status === 400 && low.includes("prompt is too long")) {
    return "As peças selecionadas excedem o contexto do modelo. Desmarque algumas peças ou inicie uma nova conversa.";
  }
  if (
    resp.status === 400 &&
    /\bpage/.test(low) &&
    (low.includes("exceed") || low.includes("limit") || low.includes("maximum") || low.includes("too many"))
  ) {
    return (
      "As peças selecionadas somam mais páginas de PDF do que o modelo aceita por análise. " +
      "Desmarque algumas peças e analise por partes. (detalhe da API: " + apiMsg.slice(0, 200) + ")"
    );
  }
  if (resp.status === 429) {
    return "Limite de requisições atingido. Aguarde alguns instantes e tente de novo.";
  }
  // restrito a 413/400: "exceeds"/"too large" em outros status têm outra causa
  if (resp.status === 413 || (resp.status === 400 && low.includes("too large"))) {
    return "As peças selecionadas são grandes demais para uma única análise. Desmarque algumas e tente novamente.";
  }
  if (resp.status === 529 || resp.status >= 500) {
    return "A API da Anthropic está sobrecarregada no momento. Tente novamente em instantes.";
  }
  return "Erro da API (" + resp.status + ")" + (apiMsg ? ": " + apiMsg.slice(0, 240) : "");
}

export { friendlyHttpError, headers as apiHeaders, API as API_BASE };
