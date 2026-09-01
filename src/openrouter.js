// Cliente do OpenRouter (Chat Completions), QUARTO irmão de claude.js,
// gemini.js e openai.js. Emite o MESMO vocabulário de eventos que os três — o
// background.js consome os quatro sem saber qual provedor está por trás:
//   {kind:"text", text}          — delta de texto da resposta
//   {kind:"thinking", text}      — delta do raciocínio ("" no início)
//   {kind:"citation", citation}  — citação (annotations url_citation → formato
//                                  web_search_result_location que a UI já trata)
//   {kind:"tool", name, input}   — o servidor executou a busca web
//   {kind:"trunc"}               — resposta cortada pelo teto de saída
//   {kind:"final", content, stopReason, containerId, usage, custoUsd}
//
// O OpenRouter é um AGREGADOR: uma chave dá acesso a centenas de modelos de
// dezenas de provedores. Isso muda três coisas em relação aos outros clientes, e
// as três estão no desenho deste arquivo:
//
//  1. NÃO HÁ FILES API NO FLUXO DE CHAT. A Files API do OpenRouter existe (beta,
//     ids `or_file_…`), mas os arquivos do workspace são consumidos por
//     CONTAINERS/sandbox e pela *files server tool* — a página "PDF Inputs", que
//     é a autoridade sobre entrada de PDF numa chat completion, documenta só
//     `file_data` (URL pública ou data URL). Conferido em 01/09/2026. Logo, toda
//     peça em PDF viaja INLINE em base64, em TODO turno (a API é stateless), e
//     as peças do PJe não podem ir por URL porque exigem cookie de sessão.
//     Se um dia o content part aceitar `file_id`, o ponto de mudança é único:
//     `montarBlocos` (content.js) já prefere `d.fileId` quando `d.fileProvider`
//     casa com o provedor ativo — basta a cap `filesApi` deixar de ser false.
//  2. NÃO HÁ CONTAGEM DE TOKENS. Nenhum endpoint equivalente ao count_tokens da
//     Anthropic ou ao /responses/input_tokens da OpenAI. A guarda de 90% da
//     janela passa a ser calculada no content.js pela estimativa local (cap
//     `contagemTokens:false`).
//  3. O CUSTO VEM MEDIDO. `usage.cost` é o valor REAL cobrado em créditos (US$),
//     e vem em toda resposta sem precisar pedir. É isso que torna sustentável
//     oferecer centenas de modelos: não há tabela de preços a manter aqui, ao
//     contrário dos outros três provedores.
//
// FORMATOS (openrouter.ai/docs, conferidos em 01/09/2026):
//  - Request: POST {API}/chat/completions, header Authorization: Bearer <key>.
//    Corpo OpenAI-compatible: {model, messages, stream:true, reasoning?,
//    plugins?, provider?}. O system prompt é a PRIMEIRA mensagem
//    ({role:"system"}), não um campo de topo.
//  - Content parts do usuário: {type:"text"}, {type:"file", file:{filename,
//    file_data:"data:application/pdf;base64,…"}}, {type:"image_url",
//    image_url:{url:"data:image/jpeg;base64,…"}}.
//  - Streaming (SSE): "data: {json}", com linhas de comentário ": OPENROUTER
//    PROCESSING" (keep-alive) e o sentinela "[DONE]". Cada chunk traz
//    choices[0].delta com content / reasoning / reasoning_details / annotations,
//    e finish_reason no último chunk de conteúdo. O usage chega num chunk
//    próprio, ANTES do [DONE].
//  - ERRO NO MEIO DO STREAM VEM COM HTTP 200 (os headers já foram enviados):
//    {"error":{"code","message","metadata"},"choices":[{"finish_reason":"error"}]}.
//    Um 200 que só traz erro é FALHA — nunca resposta vazia.

const API = "https://openrouter.ai/api/v1";

// Identificação do app nos rankings do OpenRouter. Não carrega nada do usuário
// (nem chave, nem conteúdo dos autos) — é o endereço público da extensão.
// SEM ACENTO no título de propósito: valor de header HTTP é ISO-8859-1, e um
// "ç" ali é o tipo de coisa que falha em um navegador e passa em outro.
const APP_URL = "https://chromewebstore.google.com/detail/imgfakkieoijdhdpafjjlefcckbmbppm";
const APP_NOME = "TecJustica PJe";

// Motor de leitura de PDF quando o modelo NÃO lê arquivo nativamente. O padrão
// do OpenRouter é o mistral-ocr, que é PAGO (US$ 2 por 1.000 páginas) e roda de
// novo a CADA turno — num processo de 300 folhas isso seria US$ 0,60 por
// mensagem, cobrado sem o usuário ter pedido. `cloudflare-ai` converte para
// markdown de graça; a perda é a visão da página (peça escaneada sem camada de
// texto sai vazia), e para isso a extensão já tem o OCR local.
// EXPORTADOS porque quem DECIDE entre os dois é o worker (ele é que tem as caps
// do modelo) e quem sabe o NOME que a API espera é este arquivo. Com a string
// literal repetida lá, um dia o OpenRouter renomearia a engine e sobraria uma
// das duas pontas — a clássica duplicação que só aparece em produção.
export const ENGINE_PDF_NATIVO = "native";
export const ENGINE_PDF_CONVERSOR = "cloudflare-ai";

function headersOpenRouter(apiKey) {
  return {
    "content-type": "application/json",
    authorization: "Bearer " + apiKey,
    "HTTP-Referer": APP_URL,
    "X-OpenRouter-Title": APP_NOME,
  };
}

// O id do modelo no storage leva o prefixo "or:" (ver providerDe em
// background.js); o que vai na API é o slug puro (`autor/modelo`, com as
// variantes `:free`, `:online`, `:nitro`, `:floor` quando houver). Ponto ÚNICO
// da tradução — exportado porque o catálogo de caps também precisa dele.
export function slugOpenRouter(model) {
  const m = String(model || "");
  return m.startsWith("or:") ? m.slice(3) : m;
}

// ---------------------------------------------------------------------------
// Tradução do histórico interno (blocos estilo Anthropic, o formato canônico da
// extensão) para as mensagens OpenAI-compatible do OpenRouter. Regras:
//  - document base64 → {type:"file"} com data URL, PRECEDIDO de um bloco de
//    texto "[Peça anexada: título]" — o content part de arquivo não tem campo
//    de título, e é por esse rótulo que o **id** da peça chega ao modelo (a
//    regra peça·id·folha vale aqui como nas outras saídas);
//  - document text (peças HTML/RTF) → bloco de texto com o título no cabeçalho;
//  - image → {type:"image_url"} com data URL;
//  - assistant: os blocos {type:"text"} viram a string `content`, e o
//    {type:"x-openrouter-item"} devolve o `reasoning_details` — mas SÓ quando o
//    modelo do turno é o mesmo que o produziu (ver a nota do round-trip abaixo).
// Campos internos (cache_control, citations, __pecaId) nunca são copiados: os
// itens de usuário são construídos do zero.
// ---------------------------------------------------------------------------
function traduzirHistorico(messages, modelAtual) {
  const out = [];
  for (const turn of messages || []) {
    const blocos =
      typeof turn.content === "string"
        ? [{ type: "text", text: turn.content }]
        : turn.content || [];

    if (turn.role === "user") {
      const content = [];
      for (const b of blocos) {
        if (!b) continue;
        if (b.type === "document") {
          const t = b.title || "peça do processo";
          const src = b.source || {};
          if (src.type === "base64") {
            content.push({ type: "text", text: "[Peça anexada: " + t + "]" });
            content.push({
              type: "file",
              file: {
                filename: nomeArquivoDe(t),
                file_data:
                  "data:" + (src.media_type || "application/pdf") + ";base64," + src.data,
              },
            });
          } else if (src.type === "text") {
            content.push({ type: "text", text: "=== Peça: " + t + " ===\n" + (src.data || "") });
          } else if (src.type === "file") {
            // Referência da Files API de OUTRO provedor. Não deveria chegar aqui
            // (montarBlocos só a produz quando `fileProvider` casa com o provedor
            // ativo, e no OpenRouter ele nunca casa), mas mandar um `file_id`
            // estranho seria um 400 críptico: vira aviso de texto, para o modelo
            // saber que a peça foi citada e não veio.
            content.push({
              type: "text",
              text: "[Peça " + t + " não pôde ser anexada nesta conversa — peça ao usuário para marcá-la de novo.]",
            });
          }
        } else if (b.type === "image") {
          const src = b.source || {};
          if (src.type === "base64") {
            content.push({
              type: "image_url",
              image_url: {
                url: "data:" + (src.media_type || "image/jpeg") + ";base64," + src.data,
              },
            });
          }
        } else if (b.type === "text") {
          content.push({ type: "text", text: b.text || "" });
        }
      }
      if (content.length) out.push({ role: "user", content });
    } else {
      // Turno do assistant. O texto é PORTÁVEL entre modelos (é só string); o
      // raciocínio, não — daí o guard de modelo.
      let texto = "";
      let detalhes = null;
      for (const b of blocos) {
        if (!b) continue;
        if (b.type === "text") {
          texto += b.text || "";
        } else if (b.type === "x-openrouter-item" && b.raw) {
          // ROUND-TRIP DO RACIOCÍNIO, e o campo `model` do bloco não é enfeite.
          // A regra do OpenRouter é que "a sequência de blocos de raciocínio
          // precisa bater com o que o modelo gerou"; devolver o raciocínio de um
          // modelo a OUTRO é, na melhor hipótese, ignorado. Como um agregador
          // hospeda Claude, Gemini e GPT sob o MESMO provedor, `conversaProvider`
          // (content.js) não barra essa troca — quem a torna segura é este
          // filtro. Efeito colateral bom: trocar de modelo dentro do OpenRouter
          // no meio da conversa funciona, perdendo só o raciocínio anterior.
          // Omitir o `reasoning_details` é SEMPRE seguro (nada quebra; o modelo
          // perde contexto de raciocínio) — é a saída de emergência se algum
          // provedor passar a recusar o formato.
          if (b.model && modelAtual && b.model !== modelAtual) continue;
          if (b.raw.reasoning_details && b.raw.reasoning_details.length) {
            detalhes = (detalhes || []).concat(b.raw.reasoning_details);
          }
        }
      }
      // Turno sem texto E sem raciocínio não vira mensagem: um assistant vazio é
      // rejeitado por parte dos provedores.
      if (!texto && !detalhes) continue;
      const msg = { role: "assistant", content: texto };
      if (detalhes) msg.reasoning_details = detalhes;
      out.push(msg);
    }
  }
  return out;
}

// O título da peça vem dos autos ("123456 - Petição Inicial | fls. 30") e vira
// nome de arquivo no request. Só o que é seguro em nome de arquivo, com teto:
// o campo é informativo para o parser, não um caminho.
function nomeArquivoDe(titulo) {
  const limpo = String(titulo || "peca")
    // Escapes ASCII, NUNCA os caracteres crus: um byte 0x00 no fonte faz o
    // git tratar o arquivo inteiro como BINARIO (o diff some, e o ripgrep
    // pula o arquivo nas buscas) -- a regra do CLAUDE.md, que ja custou um
    // commit de 247 linhas revisado as cegas.
    .replace(/[\/:*?"<>|\u0000-\u001f]+/g, "-")
    .trim()
    .slice(0, 80);
  return (limpo || "peca") + ".pdf";
}

// req: {apiKey, model, system, messages, tools?, effort?, pdfEngine?}
// Campos do caminho Anthropic (betas, container, thinking, output_config,
// max_tokens) são ignorados — em especial `max_tokens`, ver a nota abaixo.
export async function* streamOpenRouter(req) {
  const slug = slugOpenRouter(req.model);
  const body = {
    model: slug,
    messages: [],
    stream: true,
    // PRIVACIDADE DO ROTEAMENTO. Quem escolhe o provedor final é o OpenRouter, e
    // parte deles armazena os prompts para treino. Aqui trafegam AUTOS — este
    // campo é o que mantém verdadeira a promessa da caixa de privacidade da
    // extensão e o que o art. 19 da Res. CNJ 615 cobra de quem usa IA externa.
    // Custo: pode não sobrar provedor para um modelo, e aí a API responde 503 —
    // por isso a mensagem daquele status cita esta política pelo nome.
    provider: { data_collection: "deny" },
    plugins: [],
  };

  // O system prompt é a primeira MENSAGEM (padrão OpenAI), não um campo de topo.
  if (req.system) body.messages.push({ role: "system", content: req.system });
  for (const m of traduzirHistorico(req.messages, slug)) body.messages.push(m);

  // COMPRESSÃO DE CONTEXTO DESLIGADA, EXPLICITAMENTE. O OpenRouter só a liga por
  // padrão em endpoints de ≤ 8k de contexto — nenhum modelo que interessa aqui —,
  // mas o que ela faz é DESCARTAR o meio do prompt quando não cabe. Num pacote de
  // autos isso é perder peças em silêncio, que é o modo de falha que este projeto
  // trata como o pior. Uma linha para nunca depender do default.
  body.plugins.push({ id: "context-compression", enabled: false });
  // Leitura de PDF: `native` (o próprio modelo lê o arquivo) quando ele aceita
  // entrada de arquivo; senão o conversor gratuito. Nunca o pago por omissão.
  body.plugins.push({ id: "file-parser", pdf: { engine: req.pdfEngine || ENGINE_PDF_NATIVO } });

  // Busca web. O content.js manda o MESMO shape do caminho OpenAI
  // ({type:"web_search", filters:{allowed_domains}}) e a tradução para o plugin
  // mora aqui — é o cliente que conhece o dialeto do provedor.
  const busca = (req.tools || []).find((t) => t && t.type === "web_search");
  if (busca) {
    const dominios =
      (busca.filters && busca.filters.allowed_domains) || busca.allowed_domains || null;
    const plug = { id: "web", max_results: 5 };
    // ATENÇÃO: aqui a allowlist é garantia MOLE. A doc diz que o suporte a
    // include_domains "varia por engine", e o OpenRouter escolhe a engine. É a
    // mesma situação do google_search do Gemini: quem expressa a PRIORIDADE das
    // fontes é o PROMPT_BUSCA, e o vazamento de fonte fora da lista fica visível
    // no rodapé da bolha (nivelFonte). Não prometer garantia dura na UI.
    if (dominios && dominios.length) plug.include_domains = dominios;
    body.plugins.push(plug);
  }

  if (req.effort) body.reasoning = { effort: req.effort };

  // SEM `max_tokens`, e isto INVERTE a regra dos clientes Gemini e OpenAI (que o
  // mandam sempre explícito). Aqui ele não protege: o roteador só encaminha a
  // provedores capazes de devolver o tamanho pedido, então um teto generoso
  // RESTRINGE o roteamento — pode sobrar menos provedor, ou nenhum. Resposta
  // cortada continua sinalizada, por finish_reason "length" → {kind:"trunc"}.

  const resp = await fetch(API + "/chat/completions", {
    method: "POST",
    headers: headersOpenRouter(req.apiKey),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = new Error(await friendlyHttpErrorOpenRouter(resp));
    err.status = resp.status;
    // transitórios: o chamador re-tenta o MESMO request com backoff. 408 (timeout
    // do OpenRouter) e 502/503 (modelo fora do ar / sem provedor elegível) entram
    // porque costumam passar na tentativa seguinte, com outro provedor.
    err.retryable = resp.status === 429 || resp.status === 408 || resp.status >= 500;
    throw err;
  }

  let texto = "";
  let detalhes = []; // reasoning_details acumulados
  let finish = null;
  let usage = null;
  let modeloReal = slug;
  let acendeuThinking = false;
  const urlsCitadas = new Set(); // annotations chegam repetidas a cada delta

  for await (const ev of sseEvents(resp)) {
    // ERRO NO MEIO DO STREAM: chega com HTTP 200, porque os headers já foram
    // enviados. Tratar como sucesso vazio entregaria uma bolha em branco.
    if (ev.error) {
      const e = ev.error;
      const err = new Error(mensagemErroOpenRouter(Number(e.code) || 0, e.message || ""));
      err.status = Number(e.code) || 0;
      err.retryable = err.status === 429 || err.status === 408 || err.status >= 500;
      throw err;
    }
    if (ev.model) modeloReal = ev.model;
    if (ev.usage) usage = ev.usage;
    const ch = (ev.choices && ev.choices[0]) || null;
    if (!ch) continue;
    if (ch.finish_reason) finish = ch.finish_reason;
    const d = ch.delta || {};

    if (typeof d.content === "string" && d.content) {
      texto += d.content;
      yield { kind: "text", text: d.content };
    }
    if (typeof d.reasoning === "string" && d.reasoning) {
      acendeuThinking = true;
      yield { kind: "thinking", text: d.reasoning };
    }
    if (Array.isArray(d.reasoning_details) && d.reasoning_details.length) {
      // O indicador "Raciocinando…" da UI acende com um thinking vazio (mesma
      // convenção do claude.js). Modelos que só mandam o raciocínio ESTRUTURADO
      // (sem o campo `reasoning` em texto puro) ficariam sem nenhum sinal na tela.
      if (!acendeuThinking) {
        acendeuThinking = true;
        yield { kind: "thinking", text: "" };
      }
      detalhes = mesclarReasoning(detalhes, d.reasoning_details);
    }
    if (Array.isArray(d.annotations)) {
      for (const a of d.annotations) {
        if (!a || a.type !== "url_citation" || !a.url_citation) continue;
        const u = a.url_citation.url || "";
        if (!u || urlsCitadas.has(u)) continue;
        urlsCitadas.add(u);
        // A busca foi usada: o content.js liga `buscaNaConversa` por este evento
        // e a bolha ganha o rodapé de fontes.
        if (urlsCitadas.size === 1) {
          yield { kind: "tool", name: "web_search", input: { query: null } };
        }
        yield {
          kind: "citation",
          citation: {
            type: "web_search_result_location",
            url: u,
            title: a.url_citation.title || u,
          },
        };
      }
      // As annotations do tipo "file" (o resultado do file-parser, que poderia
      // ser reenviado para não re-parsear o PDF) são ignoradas de propósito nesta
      // versão: com engine `native` elas não existem, e guardá-las exigiria
      // gravar o conteúdo parseado da peça no histórico.
    }
  }

  // Stream encerrado sem finish_reason: a conexão caiu "limpa" no meio do turno.
  // Resposta parcial não pode passar por completa (mesma regra do openai.js).
  if (!finish) {
    const err = new Error(
      "a conexão com o OpenRouter caiu antes de a resposta terminar. Se persistir, costuma " +
        "ser o tamanho do envio: neste provedor as peças vão inteiras a cada mensagem, então " +
        "reduza as peças selecionadas (use os degraus “chave”/“principais” ou o ✨ Escolher " +
        "com IA) e tente de novo."
    );
    err.retryable = true;
    throw err;
  }

  const stopReason = mapStopReason(finish);
  if (stopReason === "max_tokens") yield { kind: "trunc" };

  const blocos = [];
  if (texto) blocos.push({ type: "text", text: texto });
  if (detalhes.length) {
    // Bloco OPACO, irmão do x-gemini-item e do x-openai-item: `prepararEnvio` e
    // `sanearCitacoes` (content.js) não o tocam por construção (não tem
    // `__pecaId` nem `type:"text"`). O `model` é o que a RESPOSTA reportou — com
    // fallback de modelo o OpenRouter pode ter atendido por outro, e gravar o
    // pedido faria o turno seguinte devolver raciocínio de quem não o produziu.
    blocos.push({ type: "x-openrouter-item", model: modeloReal, raw: { reasoning_details: detalhes } });
  }

  yield {
    kind: "final",
    content: blocos,
    stopReason,
    containerId: null,
    usage: normalizarUsage(usage),
    // O CUSTO VEM MEDIDO, não calculado por tabela: `usage.cost` é o que a conta
    // do usuário foi debitada, em US$. `executarTurno` prefere este valor quando
    // ele existe. É o que dispensa manter preço de centenas de modelos.
    custoUsd: usage && typeof usage.cost === "number" ? usage.cost : null,
  };
}

// Os deltas de `reasoning_details` chegam em pedaços. Mesclar por `index` quando
// ele existe (é o campo que o OpenRouter usa para ordenar os blocos) e, na falta
// dele, por posição de chegada. Strings são CONCATENADAS (o texto do raciocínio
// vem fatiado); os demais campos ficam com o último valor não-vazio — `signature`
// e `data` (raciocínio criptografado) precisam voltar íntegros.
function mesclarReasoning(acc, novos) {
  const out = acc.slice();
  for (const n of novos) {
    if (!n) continue;
    const i = typeof n.index === "number" ? n.index : out.length;
    const alvo = out[i] || {};
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (v == null) continue;
      if (typeof v === "string" && typeof alvo[k] === "string" && k !== "type" && k !== "id" && k !== "format") {
        alvo[k] = alvo[k] + v;
      } else {
        alvo[k] = v;
      }
    }
    out[i] = alvo;
  }
  // Buracos no array (índices que nunca chegaram) quebrariam o reenvio.
  return out.filter(Boolean);
}

// finish_reason do OpenRouter → o vocabulário de stop_reason que a extensão já
// trata. Não há pause_turn aqui: o loop de continuações do background sai
// naturalmente na primeira iteração.
function mapStopReason(finish) {
  if (finish === "length") return "max_tokens";
  if (finish === "content_filter") return "refusal";
  return "end_turn";
}

// usage do OpenRouter → as 4 categorias estilo Anthropic que custo, gauge e
// tooltip já consomem. `prompt_tokens` INCLUI os cacheados.
function normalizarUsage(u) {
  if (!u) return null;
  const det = u.prompt_tokens_details || {};
  const cached = det.cached_tokens || 0;
  const gravados = det.cache_write_tokens || 0;
  return {
    input_tokens: Math.max(0, (u.prompt_tokens || 0) - cached - gravados),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: gravados,
    output_tokens: u.completion_tokens || 0,
  };
}

// Itera os eventos SSE do corpo da resposta. Igual ao dos outros clientes, com
// UMA diferença que não pode cair: o OpenRouter manda linhas de COMENTÁRIO
// (": OPENROUTER PROCESSING") como keep-alive, e elas precisam ser puladas antes
// do JSON.parse — sem isso o stream morre no primeiro keep-alive de um turno
// longo, que é justamente o caso dos autos grandes.
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
      if (!line || line.startsWith(":")) continue; // keep-alive / comentário SSE
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
// Catálogo: as capacidades de um modelo, do endpoint PÚBLICO de metadados.
//
// É o que permite ao usuário colar QUALQUER slug do OpenRouter sem que a
// extensão precise de uma tabela de centenas de modelos para envelhecer. Sem
// chave de propósito: o endpoint é público, e assim o campo funciona antes
// mesmo de a chave ser salva.
// ---------------------------------------------------------------------------
// TOKENS POR PÁGINA DE PDF, por autor do slug — e esta é a única coisa que a
// extensão afirma sobre um modelo do OpenRouter sem perguntar ao catálogo.
//
// Por que precisa existir: o catálogo publica preço e janela, mas NÃO diz
// quantos tokens uma página de PDF consome, e esse número varia 8× entre
// famílias. A estimativa local do content.js usa 2000/página (o valor da
// Anthropic, de onde a heurística nasceu). Nos outros três provedores errar aí
// é inofensivo, porque o `count_tokens` corrige antes da guarda de 90%. AQUI
// NÃO HÁ count_tokens: a guarda roda sobre a estimativa, e ela é o MAIOR entre
// a medição exata do turno anterior e o chute local — então um chute alto
// NUNCA é desmentido. Com 2000/página, um Gemini de 1M seria barrado em ~450
// folhas ocupando 12% da janela de verdade: recusa antecipada exatamente no
// caso de uso principal desta extensão.
//
// REGRA para mexer aqui: só entra número com FONTE. O 258 do Google é o mesmo
// que MODEL_CAPS já usa no Gemini direto (documentação oficial) — não é dado
// novo, é o mesmo modelo alcançado por outro caminho. Sem fonte, fica de fora
// e vale o padrão do content.js, que é o conservador (estima mais, barra antes).
// google: 532 — MEDIDO com chave real em 01/09/2026, três vezes, com PDFs de
// densidade diferente (o valor não muda com o conteúdo: o Gemini cobra a
// PÁGINA, não o texto). A documentação do Google diz 258, e é o que
// `MODEL_CAPS` usa no caminho DIRETO — aqui é o dobro, e a medição manda:
// pela rota do OpenRouter o número é outro. Não mexer no 258 do Gemini direto
// por causa deste: são caminhos diferentes, medidos separadamente.
const TOKENS_PAGINA_POR_AUTOR = { google: 532 };

export async function capsDoCatalogoOpenRouter(model) {
  const slug = slugOpenRouter(model);
  const resp = await fetch(API + "/model/" + slug, { headers: { accept: "application/json" } });
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(
        'o modelo "' + slug + '" não existe no OpenRouter. Confira o identificador em ' +
          "openrouter.ai/models (ele tem o formato autor/modelo)."
      );
    }
    throw new Error(await friendlyHttpErrorOpenRouter(resp));
  }
  const j = await resp.json();
  const d = (j && j.data) || {};
  const arq = d.architecture || {};
  const entradas = arq.input_modalities || [];
  const params = d.supported_parameters || [];
  const ctx = Number(d.context_length) || 200000;
  return {
    provider: "openrouter",
    // O eixo "para que serve" (analise/redacao/ambos) não existe no catálogo e
    // não se infere de metadados: fica em "ambos", que é o valor que NÃO produz
    // sugestão de troca de modelo na minuta.
    perfil: "ambos",
    nome: d.name || slug,
    contextTokens: ctx,
    // HEURÍSTICA DECLARADA: o OpenRouter não publica limite de páginas de PDF por
    // request (o limite real é o do provedor upstream, que ele escolhe). Estes
    // números vêm dos tetos conhecidos dos provedores diretos, escalados pela
    // janela. Errar para MENOS aqui custa uma recusa antes do envio; errar para
    // mais custa um erro críptico depois de subir dezenas de MB.
    maxPages: ctx >= 900000 ? 500 : ctx >= 300000 ? 200 : 100,
    // Sem Citations API: o system prompt pede citação TEXTUAL (peça, id, folha),
    // como no Gemini e na OpenAI.
    citacoesNativas: false,
    // Não há Files API no fluxo de chat (ver o cabeçalho): as peças vão inline.
    filesApi: false,
    // Não há endpoint de contagem de tokens: a guarda de 90% usa a estimativa
    // local (content.js).
    contagemTokens: false,
    aceitaPdf: entradas.indexOf("file") >= 0,
    aceitaImagem: entradas.indexOf("image") >= 0,
    thinking: null,
    effort: params.indexOf("reasoning") >= 0,
    // Só vai no objeto quando há fonte: `undefined` faz o content.js cair no
    // padrão dele, e um campo presente com valor errado é pior que ausente.
    tokensPagina: TOKENS_PAGINA_POR_AUTOR[String(slug).split("/")[0]],
    preco: precoDoCatalogo(d.pricing),
  };
}

// pricing do catálogo é US$ POR TOKEN, em string; a tabela da extensão é US$ por
// 1M. Serve só para a estimativa antes do turno — o custo do rodapé vem MEDIDO
// no usage.
function precoDoCatalogo(p) {
  if (!p) return { in: 0, out: 0 };
  // ARREDONDA em 6 casas: o catálogo publica o preço POR TOKEN em string
  // ("0.0000002"), e multiplicar por 1e6 em ponto flutuante devolve
  // 0.19999999999999998 em vez de 0.2. Nada quebra com isso — no OpenRouter o
  // custo do rodapé vem MEDIDO do usage —, mas um número desses vazando para a
  // tela seria ruído que ninguém sabe explicar.
  const n = (v) => (v == null ? 0 : Math.round(Number(v) * 1e6 * 1e6) / 1e6) || 0;
  const preco = { in: n(p.prompt), out: n(p.completion) };
  if (p.input_cache_read != null) preco.cacheRead = n(p.input_cache_read);
  return preco;
}

// ---------------------------------------------------------------------------
// Erros. O corpo é lido como TEXTO uma vez e só então convertido (a mesma
// disciplina do gemini.js: `Response` só pode ser consumida uma vez, e
// `resp.json()` com `resp.text()` no catch lança "body stream already read"
// justamente no caso não-JSON que o fallback existe para cobrir).
// ---------------------------------------------------------------------------
export async function friendlyHttpErrorOpenRouter(resp) {
  let bruto = "";
  try {
    bruto = await resp.text();
  } catch {
    /* corpo ilegível */
  }
  let msg = "";
  let meta = null;
  try {
    const j = JSON.parse(bruto);
    msg = (j && j.error && j.error.message) || "";
    meta = (j && j.error && j.error.metadata) || null;
  } catch {
    msg = bruto.slice(0, 240);
  }
  return mensagemErroOpenRouter(resp.status, msg, meta);
}

function mensagemErroOpenRouter(status, apiMsg, meta) {
  const low = String(apiMsg || "").toLowerCase();
  if (status === 401) {
    return "Chave da API do OpenRouter inválida. Confira a chave nas configurações da extensão (openrouter.ai/settings/keys).";
  }
  if (status === 402) {
    return "Sua conta do OpenRouter está sem créditos. Adicione créditos em openrouter.ai/settings/credits e tente de novo.";
  }
  if (status === 403) {
    const razoes = meta && Array.isArray(meta.reasons) ? meta.reasons.join(", ") : "";
    return (
      "O provedor recusou o conteúdo por política de moderação" +
      (razoes ? " (" + razoes + ")" : "") +
      ". Autos costumam descrever fatos que os filtros marcam; trocar de modelo nas opções " +
      "costuma resolver."
    );
  }
  if (status === 408) {
    return "O OpenRouter não recebeu resposta do provedor a tempo. Tente de novo em instantes.";
  }
  if (status === 429) {
    return "Limite de requisições atingido no OpenRouter. Aguarde alguns instantes e tente de novo.";
  }
  if (status === 502) {
    return "O modelo escolhido está fora do ar no provedor. Tente de novo, ou escolha outro modelo nas opções.";
  }
  if (status === 503) {
    // ESTA mensagem cita a política pelo nome, e não é zelo: a extensão manda
    // `data_collection: "deny"` em todo request, e é ela que pode deixar um
    // modelo sem nenhum provedor elegível. Sem dizer isso, o usuário vê "sem
    // provedor" num modelo que a página do OpenRouter mostra disponível.
    return (
      "Nenhum provedor do OpenRouter atende a este pedido agora. A extensão exige provedores " +
      "que NÃO armazenem os dados enviados (as peças são de processo judicial), e nem todo " +
      "modelo tem um. Escolha outro modelo nas opções."
    );
  }
  if (status === 400 && (low.includes("context") || low.includes("token") || low.includes("too long"))) {
    return "As peças selecionadas excedem o contexto do modelo. Desmarque algumas peças ou inicie uma nova conversa.";
  }
  if (status === 413 || (status === 400 && low.includes("too large"))) {
    return "As peças selecionadas são grandes demais para uma única análise. Desmarque algumas e tente novamente.";
  }
  if (status >= 500) {
    return "O OpenRouter está indisponível no momento. Tente novamente em instantes.";
  }
  return "Erro do OpenRouter (" + status + ")" + (apiMsg ? ": " + String(apiMsg).slice(0, 240) : "");
}

// Rodapé de teste: permite carregar este módulo fora do navegador (Node) para os
// testes com `fetch` fake, como os irmãos já fazem.
export const _internos = {
  traduzirHistorico,
  mesclarReasoning,
  normalizarUsage,
  mapStopReason,
  precoDoCatalogo,
  mensagemErroOpenRouter,
  nomeArquivoDe,
  TOKENS_PAGINA_POR_AUTOR,
};
