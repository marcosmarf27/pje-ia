// Teste do cliente OpenRouter com fetch fake. Roda fora do navegador.
const MOD = new URL("../src/openrouter.js", import.meta.url).href;
let ok = 0, fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { ok++; } else { fail++; console.log("FALHOU: " + msg + "\n  esperado: " + B + "\n  obtido:   " + A); }
};
const t = (cond, msg) => { if (cond) ok++; else { fail++; console.log("FALHOU: " + msg); } };

function sse(linhas) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) { for (const l of linhas) c.enqueue(enc.encode(l + "\n")); c.close(); },
  });
}
function respOk(linhas) { return { ok: true, status: 200, body: sse(linhas) }; }
function respErro(status, corpo) {
  return { ok: false, status, text: async () => corpo };
}
let ultimoBody = null, ultimasHeaders = null, ultimaUrl = null;
function fakeFetch(resposta) {
  return async (url, init) => {
    ultimaUrl = url;
    if (init && init.body) ultimoBody = JSON.parse(init.body);
    if (init && init.headers) ultimasHeaders = init.headers;
    return typeof resposta === "function" ? resposta(url, init) : resposta;
  };
}
async function coletar(gen) {
  const evs = [];
  for await (const e of gen) evs.push(e);
  return evs;
}

const { streamOpenRouter, slugOpenRouter, capsDoCatalogoOpenRouter, _internos } = await import(MOD);

// ---------------------------------------------------------------- 1. caminho feliz
globalThis.fetch = fakeFetch(respOk([
  ": OPENROUTER PROCESSING",
  "",
  'data: {"id":"gen-1","model":"anthropic/claude-sonnet-4.5","choices":[{"index":0,"delta":{"content":"Ola"},"finish_reason":null}]}',
  ": OPENROUTER PROCESSING",
  'data: {"id":"gen-1","choices":[{"index":0,"delta":{"content":" mundo"},"finish_reason":null}]}',
  'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  'data: {"id":"gen-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":50,"total_tokens":1050,"cost":0.0123,"prompt_tokens_details":{"cached_tokens":400,"cache_write_tokens":100}}}',
  "data: [DONE]",
]));
let evs = await coletar(streamOpenRouter({
  apiKey: "k", model: "or:anthropic/claude-sonnet-4.5", system: "SYS",
  messages: [{ role: "user", content: [{ type: "text", text: "oi" }] }],
}));
eq(evs.filter(e => e.kind === "text").map(e => e.text), ["Ola", " mundo"], "deltas de texto");
const fin = evs.find(e => e.kind === "final");
t(!!fin, "evento final existe");
eq(fin.stopReason, "end_turn", "stopReason end_turn");
eq(fin.content, [{ type: "text", text: "Ola mundo" }], "blocos do final");
eq(fin.usage, { input_tokens: 500, cache_read_input_tokens: 400, cache_creation_input_tokens: 100, output_tokens: 50 }, "usage normalizado");
eq(fin.custoUsd, 0.0123, "custo MEDIDO vem do usage.cost");
t(ultimaUrl === "https://openrouter.ai/api/v1/chat/completions", "URL do endpoint");

// -------------------------------------------------- 2. invariantes do corpo do request
eq(ultimoBody.provider, { data_collection: "deny" }, "provider.data_collection deny SEMPRE");
t(!("max_tokens" in ultimoBody), "NUNCA manda max_tokens (restringiria o roteamento)");
t(ultimoBody.stream === true, "stream: true");
eq(ultimoBody.model, "anthropic/claude-sonnet-4.5", "prefixo or: nao vai para a API");
eq(ultimoBody.messages[0], { role: "system", content: "SYS" }, "system e a 1a mensagem");
const compress = ultimoBody.plugins.find(p => p.id === "context-compression");
eq(compress, { id: "context-compression", enabled: false }, "compressao de contexto DESLIGADA");
const parser = ultimoBody.plugins.find(p => p.id === "file-parser");
eq(parser, { id: "file-parser", pdf: { engine: "native" } }, "engine padrao native");
t(!ultimoBody.plugins.some(p => p.id === "web"), "sem plugin web quando nao ha tools");
t(!("reasoning" in ultimoBody), "sem reasoning quando nao ha effort");
eq(ultimasHeaders["X-OpenRouter-Title"], "TecJustica PJe", "titulo do app SEM acento (header e ISO-8859-1)");
t(/^Bearer /.test(ultimasHeaders.authorization), "Authorization Bearer");

// ------------------------------------------- 3. engine de PDF quando nao ha leitura nativa
globalThis.fetch = fakeFetch(respOk(['data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}', "data: [DONE]"]));
await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [], pdfEngine: "cloudflare-ai" }));
eq(ultimoBody.plugins.find(p => p.id === "file-parser").pdf.engine, "cloudflare-ai", "engine gratuito quando o modelo nao le PDF");

// --------------------------------------------------------- 4. busca web -> plugin "web"
globalThis.fetch = fakeFetch(respOk(['data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}', "data: [DONE]"]));
await coletar(streamOpenRouter({
  apiKey: "k", model: "or:a/b", messages: [], effort: "high",
  tools: [{ type: "web_search", filters: { allowed_domains: ["stf.jus.br", "stj.jus.br"] } }],
}));
eq(ultimoBody.plugins.find(p => p.id === "web"), { id: "web", max_results: 5, include_domains: ["stf.jus.br", "stj.jus.br"] }, "tool web_search vira plugin web com include_domains");
eq(ultimoBody.reasoning, { effort: "high" }, "effort vira reasoning.effort");

// ------------------------------------------------ 5. reasoning + annotations + citacoes
globalThis.fetch = fakeFetch(respOk([
  'data: {"choices":[{"delta":{"reasoning":"pen"},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"reasoning":"sando"},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"reasoning_details":[{"index":0,"type":"reasoning.text","text":"pen","format":"anthropic"}]},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"reasoning_details":[{"index":0,"text":"sando","signature":"SIG"}]},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"content":"R","annotations":[{"type":"url_citation","url_citation":{"url":"https://stj.jus.br/x","title":"STJ"}}]},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url_citation":{"url":"https://stj.jus.br/x","title":"STJ"}}]},"finish_reason":"stop"}]}',
  "data: [DONE]",
]));
evs = await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] }));
eq(evs.filter(e => e.kind === "thinking").map(e => e.text), ["pen", "sando"], "thinking sai do campo reasoning");
eq(evs.filter(e => e.kind === "citation").length, 1, "citacao repetida nao duplica");
eq(evs.find(e => e.kind === "citation").citation, { type: "web_search_result_location", url: "https://stj.jus.br/x", title: "STJ" }, "formato da citacao web");
eq(evs.filter(e => e.kind === "tool").length, 1, "um evento de tool (liga buscaNaConversa)");
const bloco = evs.find(e => e.kind === "final").content.find(b => b.type === "x-openrouter-item");
eq(bloco.raw.reasoning_details, [{ index: 0, type: "reasoning.text", text: "pensando", format: "anthropic", signature: "SIG" }], "reasoning_details mesclados por indice");
eq(bloco.model, "a/b", "bloco carimba o modelo que produziu o raciocinio");

// ------------------------------- 6. thinking "" acende o indicador com raciocinio estruturado
globalThis.fetch = fakeFetch(respOk([
  'data: {"choices":[{"delta":{"reasoning_details":[{"index":0,"type":"reasoning.encrypted","data":"AAA"}]},"finish_reason":null}]}',
  'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
  "data: [DONE]",
]));
evs = await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] }));
eq(evs.filter(e => e.kind === "thinking").map(e => e.text), [""], "thinking vazio acende a UI quando so ha details");

// ------------------------------------------------- 7. erro no MEIO do stream com HTTP 200
globalThis.fetch = fakeFetch(respOk([
  'data: {"choices":[{"delta":{"content":"parcial"},"finish_reason":null}]}',
  'data: {"id":"g","error":{"code":429,"message":"Rate limit exceeded"},"choices":[{"finish_reason":"error"}]}',
  "data: [DONE]",
]));
let erro = null;
try { await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] })); } catch (e) { erro = e; }
t(!!erro, "erro mid-stream com HTTP 200 LANCA (nao vira resposta vazia)");
t(erro && erro.retryable === true, "429 mid-stream e retryable");
t(erro && /Limite de requisi/.test(erro.message), "mensagem traduzida do 429: " + (erro && erro.message));

// --------------------------------------------------- 8. stream que morre sem finish_reason
globalThis.fetch = fakeFetch(respOk(['data: {"choices":[{"delta":{"content":"meio"},"finish_reason":null}]}']));
erro = null;
try { await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] })); } catch (e) { erro = e; }
t(!!erro && erro.retryable === true, "stream sem finish_reason = erro retryable");

// ------------------------------------------------------------- 9. finish_reason "length"
globalThis.fetch = fakeFetch(respOk([
  'data: {"choices":[{"delta":{"content":"cortado"},"finish_reason":"length"}]}',
  "data: [DONE]",
]));
evs = await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] }));
t(evs.some(e => e.kind === "trunc"), "length emite trunc");
eq(evs.find(e => e.kind === "final").stopReason, "max_tokens", "length -> max_tokens");

// -------------------------------------------------- 10. content_filter -> refusal
globalThis.fetch = fakeFetch(respOk(['data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}', "data: [DONE]"]));
evs = await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] }));
eq(evs.find(e => e.kind === "final").stopReason, "refusal", "content_filter -> refusal");

// ------------------------------------------------------------------ 11. erros HTTP
const casos = [
  [401, '{"error":{"code":401,"message":"No auth"}}', /inv\u00e1lida/i, false],
  [402, '{"error":{"code":402,"message":"Insufficient credits"}}', /cr\u00e9ditos/i, false],
  [403, '{"error":{"code":403,"message":"flagged","metadata":{"reasons":["violence"]}}}', /modera/i, false],
  [503, '{"error":{"code":503,"message":"No provider"}}', /armazenem/i, true],
  [500, "upstream boom", /indispon/i, true],
];
for (const [st, corpo, re, retry] of casos) {
  globalThis.fetch = fakeFetch(respErro(st, corpo));
  erro = null;
  try { await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] })); } catch (e) { erro = e; }
  t(!!erro && re.test(erro.message), "HTTP " + st + " traduzido: " + (erro && erro.message));
  t(!!erro && erro.retryable === retry, "HTTP " + st + " retryable=" + retry);
}
globalThis.fetch = fakeFetch(respErro(400, "texto puro, nao JSON"));
erro = null;
try { await coletar(streamOpenRouter({ apiKey: "k", model: "or:a/b", messages: [] })); } catch (e) { erro = e; }
t(!!erro && /texto puro/.test(erro.message), "corpo nao-JSON sobrevive (lido como texto uma vez)");

// -------------------------------------------------------- 12. traducao do historico
const { traduzirHistorico } = _internos;
const hist = traduzirHistorico([
  { role: "user", content: [
    { type: "document", title: "123456 - Contesta\u00e7\u00e3o", source: { type: "base64", media_type: "application/pdf", data: "QUJD" }, citations: { enabled: true }, __pecaId: "123456", cache_control: { type: "ephemeral" } },
    { type: "document", title: "7 - Senten\u00e7a", source: { type: "text", media_type: "text/plain", data: "TEXTO" }, __pecaId: "7" },
    { type: "text", text: "[Pe\u00e7a anexada como imagem: 9 - Foto]", __pecaId: "9" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "SU1H" }, __pecaId: "9" },
    { type: "text", text: "resuma" },
  ] },
  { role: "assistant", content: [
    { type: "text", text: "resposta" },
    { type: "x-openrouter-item", model: "a/b", raw: { reasoning_details: [{ type: "reasoning.text", text: "pensei" }] } },
  ] },
], "a/b");
const cru = JSON.stringify(hist);
t(!/__pecaId/.test(cru), "__pecaId NUNCA vaza para a API");
t(!/cache_control/.test(cru), "cache_control nao vaza");
t(!/citations/.test(cru), "citations nao vaza");
eq(hist[0].content[0], { type: "text", text: "[Pe\u00e7a anexada: 123456 - Contesta\u00e7\u00e3o]" }, "rotulo com o id ANTES do arquivo");
eq(hist[0].content[1].type, "file", "PDF vira content part file");
eq(hist[0].content[1].file.file_data, "data:application/pdf;base64,QUJD", "PDF em data URL");
eq(hist[0].content[2], { type: "text", text: "=== Pe\u00e7a: 7 - Senten\u00e7a ===\nTEXTO" }, "peca de texto vira bloco de texto");
eq(hist[0].content[4], { type: "image_url", image_url: { url: "data:image/jpeg;base64,SU1H" } }, "imagem vira image_url");
eq(hist[1].content, "resposta", "assistant vira string");
eq(hist[1].reasoning_details, [{ type: "reasoning.text", text: "pensei" }], "reasoning volta com o MESMO modelo");
const outro = traduzirHistorico([{ role: "assistant", content: [
  { type: "text", text: "resposta" },
  { type: "x-openrouter-item", model: "a/b", raw: { reasoning_details: [{ type: "reasoning.text", text: "pensei" }] } },
] }], "google/gemini-3-pro");
t(!("reasoning_details" in outro[0]), "reasoning NAO volta quando o modelo mudou");
eq(outro[0].content, "resposta", "o TEXTO continua indo mesmo com modelo trocado");
const semTexto = traduzirHistorico([{ role: "assistant", content: [] }], "a/b");
eq(semTexto, [], "assistant vazio nao vira mensagem");
const orfa = traduzirHistorico([{ role: "user", content: [
  { type: "document", title: "5 - X", source: { type: "file", file_id: "file_abc" }, __pecaId: "5" },
] }], "a/b");
t(/n\u00e3o p\u00f4de ser anexada/.test(JSON.stringify(orfa)), "file_id de outro provedor vira aviso, nunca 400 criptico");

// ------------------------------------------------------------------ 13. slug e catalogo
eq(slugOpenRouter("or:anthropic/claude-sonnet-4.5"), "anthropic/claude-sonnet-4.5", "slug tira o prefixo");
eq(slugOpenRouter("anthropic/claude-sonnet-4.5"), "anthropic/claude-sonnet-4.5", "slug sem prefixo passa");
globalThis.fetch = fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ data: {
  id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5", context_length: 1000000,
  architecture: { input_modalities: ["text", "image", "file"] },
  supported_parameters: ["tools", "reasoning", "max_tokens"],
  pricing: { prompt: "0.000003", completion: "0.000015", input_cache_read: "0.0000003" },
} }) }));
const caps = await capsDoCatalogoOpenRouter("or:anthropic/claude-sonnet-4.5");
eq(caps.provider, "openrouter", "caps.provider");
eq(caps.nome, "Anthropic: Claude Sonnet 4.5", "nome vem do catalogo (o selo precisa dele)");
eq(caps.contextTokens, 1000000, "contextTokens do catalogo");
eq(caps.maxPages, 500, "maxPages heuristico para 1M");
eq(caps.aceitaPdf, true, "aceitaPdf por input_modalities");
eq(caps.effort, true, "effort por supported_parameters");
eq(caps.filesApi, false, "filesApi SEMPRE false");
eq(caps.contagemTokens, false, "contagemTokens SEMPRE false");
eq(caps.citacoesNativas, false, "citacoesNativas SEMPRE false");
eq(caps.perfil, "ambos", "perfil ambos (nao sugere troca na minuta)");
eq(caps.preco, { in: 3, out: 15, cacheRead: 0.3 }, "preco convertido para US$/1M");
// tokensPagina: a única cap que NÃO vem do catálogo (ele não publica esse
// número). Sem ela, a guarda de 90% do OpenRouter — que roda sobre a estimativa
// local e nunca é desmentida por um count_tokens — barraria um Gemini de 1M com
// ~450 folhas ocupando 12% da janela real.
eq(caps.tokensPagina, undefined, "sem fonte, tokensPagina fica AUSENTE (o content.js usa o padrao conservador)");
globalThis.fetch = fakeFetch(async () => ({ ok: true, status: 200, json: async () => ({ data: {
  id: "google/gemini-3.7-flash", name: "Google: Gemini 3.7 Flash", context_length: 1048576,
  architecture: { input_modalities: ["text", "image", "file"] },
  supported_parameters: ["tools", "reasoning"],
  pricing: { prompt: "0.00000075", completion: "0.00000375" },
} }) }));
const capsG = await capsDoCatalogoOpenRouter("or:google/gemini-3.7-flash");
eq(capsG.tokensPagina, 532, "Google: 532 tokens/pagina (MEDIDO no OpenRouter; a doc diz 258, que vale para a API direta)");
eq(_internos.TOKENS_PAGINA_POR_AUTOR.google, 532, "a tabela por autor esta exposta e tem a entrada do Google");
eq(Object.keys(_internos.TOKENS_PAGINA_POR_AUTOR).length, 1, "so entra autor COM FONTE (hoje, um)");

globalThis.fetch = fakeFetch(async () => ({ ok: false, status: 404, text: async () => '{"error":{"code":404,"message":"nope"}}' }));
erro = null;
try { await capsDoCatalogoOpenRouter("or:nao/existe"); } catch (e) { erro = e; }
t(!!erro && /n\u00e3o existe no OpenRouter/.test(erro.message), "404 do catalogo diz o que fazer");

console.log("\n" + ok + " OK, " + fail + " falhas");
process.exit(fail ? 1 : 0);
