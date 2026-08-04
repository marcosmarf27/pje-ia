# PJe IA — Extensão Chrome

> **Mudança de frontend? Leia `DESIGN.md` (raiz do repo) ANTES.** Ele é a fonte
> de verdade do visual — cores, tipografia, escala, raios, sombras e o
> comportamento dos componentes —, derivado do sistema desenhado no Claude
> Design. Valor novo no CSS entra primeiro como token lá, depois no código.

Extensão Chrome (Manifest V3, JavaScript puro, **sem build step**) que adiciona um painel
de chat com IA à tela de autos digitais do PJe. O usuário seleciona peças do
processo e conversa sobre elas; os PDFs são enviados diretamente à API do provedor do
modelo escolhido — **Anthropic (Claude)**, **Google (Gemini)** ou **OpenAI (GPT)**, ver as
seções "Provedor Gemini" e "Provedor OpenAI".

## Arquitetura

**Multi-PJe (default-on)**: `content_scripts`, `host_permissions` e
`web_accessible_resources` cobrem `https://*.jus.br/*` — qualquer tribunal
funciona sem nenhuma ação do usuário (decisão de produto: zero fricção; o
aviso de permissão do Chrome fica mais amplo, aceito). Como o script roda em
TODA página jus.br (login SSO, portais…), o boot do painel em `content.js`
vive em `iniciar()`, chamada só quando `#divTimeLine` existe (ou surge — SPA
do PJe novo) — sem timeline, nada é injetado no DOM. O grau e o base path
variam por tribunal (`pje.tjce.jus.br/pje1grau`, `pje1g.trf5.jus.br/pje`…):
`pje.js` deriva o base path da URL (`getBase`). `DOMINIOS_JURIDICOS` ganha o
domínio-raiz do tribunal atual em runtime (busca de jurisprudência).

Content scripts injetados nesta ordem
(cada um é um IIFE que expõe um global — não há imports entre content scripts):

| Arquivo | Global | Papel |
|---|---|---|
| `src/pje.js` | `PJE` | Acesso ao PJe: lista peças da timeline (`#divTimeLine`), baixa cada uma pelo endpoint REST autenticado por cookie de sessão. |
| `src/texto.js` | `TEXTOLIB` | Cache do TEXTO EXTRAÍDO das peças (`chrome.storage.local`, prefixo `texto:`) + o formato comum às duas fontes de extração (marcador `[fl. N]` e o mapa de offsets que devolve a folha nas citações). |
| `src/prompts.js` | `PLIB` | Biblioteca de prompts do usuário: CRUD sobre `chrome.storage.sync` (um item por prompt, `plib:<id>`) + `aoMudar` para propagação entre abas/dispositivos. |
| `src/panel.js` | `PjePanel` | Toda a UI (chat, seletor de peças, chips, popups `@` e `/`, card de progresso), isolada em **Shadow DOM**. CSS carregado de `src/panel.css` via `web_accessible_resources`. |
| `src/content.js` | — | Orquestração: downloads com concorrência 3, cache por peça, montagem dos blocos da API, conversa multi-turno, streaming via `Port`. |

O worker (`src/background.js` + `src/claude.js`, ES modules) guarda a chave da API e faz o
streaming SSE — **a chave nunca chega ao contexto da página**. Dois canais content↔worker:

- **Port** `chrome.runtime.connect({name:"claude"})` para os turnos (streaming). Tipos
  content→worker: só `chat`; worker→content: `delta`, `thinking`, `citation`,
  `tool`, `trunc`, `iter` (início de request físico — checkpoint da UI),
  `retry` (re-tentativa transitória — a UI reverte ao checkpoint para não duplicar
  texto/citações), `done {content, stopReason}`, `error`. **AUTO-RESUME**: se a porta
  cair SEM `done`/`error` (worker MV3 morto no meio do turno — acontece mesmo com
  keepalive), `stream()` em content.js reconecta e REENVIA o payload sozinho (até 2
  vezes; o turno é stateless e o prefixo está no cache de prompt). O handler
  `onReinicio` zera TODO o estado de UI do turno (o novo stream re-emite do zero).
  Não transformar esse reenvio em erro imediato (regra do turno longo em geral).
- **`chrome.runtime.sendMessage`** (request/response) para `caps` (capacidades do
  modelo — a resposta traz `{model, effort, caps}`; model+effort alimentam o SELO do
  modelo ativo `panel.setModelo` na barra de ferramentas, atualizado ao vivo pelo
  `storage.onChanged` inclusive na troca de `effort`), `upload` (Files API) e
  `countTokens` (pré-voo gratuito).

## Fluxo de um turno (protocolo v2)

`claude.js` acumula os **blocos completos** da resposta a partir do SSE (padrão dos SDKs:
`content_block_start/delta/stop`, incluindo `signature_delta` do thinking, `citations_delta`
e `input_json_delta`) e emite `{kind:"final", content, stopReason, containerId}`.
`background.js` resolve sozinho as continuações de **`pause_turn`** (reenvia
`messages + [{role:"assistant", content: parcial}]`; teto fixo `MAX_ITER` = 8) — o
content script enxerga um único turno lógico. **Erros transitórios re-tentam sozinhos**:
cada request físico ganha até 2 re-tentativas com backoff (429 espera 10 s) quando o
erro é 429/529/5xx ou queda de rede no meio do SSE (flag `retryable` posta pelo
`claude.js`). `max_tokens` é 32000 (OBRIGATÓRIO na Anthropic; 32K é o teto de saída
aceito por todos os modelos Claude).

`MODEL_CAPS` em `background.js` governa por modelo: `provider` (anthropic|gemini|openai),
`contextTokens`, `maxPages` (600 nos modelos de 1M; 100 no Haiku; 1000 no Gemini; 500 nos GPT),
versões de `web_search`/`web_fetch` (variantes `_20260209` no Sonnet 5/Opus 4.8;
básicas no Fable/Haiku), `thinking` (adaptive+summarized; omitido no Haiku) e `effort`
(não suportado no Haiku; no Gemini vira `thinking_level`). Entradas Gemini têm ainda
`citacoesNativas:false`, `tokensPagina:258` e `preco.cacheRead`.

## Provedor Gemini (Interactions API)

`src/gemini.js` é o irmão de `claude.js` (que fica INTOCADO): emite o MESMO vocabulário
de eventos (`{kind:"text"|"thinking"|"citation"|"tool"|"trunc"|"final"}`) a partir do SSE
da **Interactions API** (`POST /v1beta/interactions`, header `x-goog-api-key` +
`Api-Revision: 2026-05-20`; eventos `step.start`/`step.delta`/`interaction.completed`).
`background.js` despacha por `providerDe(model)` (prefixo `gemini-`); `content.js` e
`panel.js` só condicionam por **caps**, nunca por nome de modelo. Regras que NÃO podem
quebrar:

- **Modo stateless obrigatório** (`store:false`): o histórico interno continua nos
  blocos estilo Anthropic (com `__pecaId`) e `traduzirHistorico` em gemini.js converte
  NO REQUEST — o filtro de peças desmarcadas (`prepararEnvio`) funciona igual nos dois
  provedores. NUNCA enviar `temperature/top_p/top_k` nem terminar o `input` com turno
  do modelo (prefill → 400).
- **Wrapper `x-gemini-item`**: todo step do Gemini que não seja texto puro sem
  assinatura (thought assinado, `google_search_call/result`, texto com
  `thought_signature`) é gravado no histórico como `{type:"x-gemini-item", raw: step}`
  e devolvido VERBATIM no reenvio — thought signatures precisam voltar byte a byte
  (regra análoga ao thinking assinado da Anthropic). `sanearCitacoes`/`prepararEnvio`
  não tocam nesses blocos por construção.
- **usage normalizado** para as 4 categorias da Anthropic em gemini.js
  (`input = total_input − total_cached`; `cache_read = total_cached`;
  `cache_creation = 0`; `output` inclui thoughts) — custo, tooltip e gauge funcionam
  sem mudança. `custoUsdDe` usa `preco.cacheRead` quando existe (senão 0,1× o input,
  regra Anthropic inalterada).
- **Uploads por provedor**: a File API do Google EXPIRA em 48 h — o cache de sessão usa
  namespace `gfile:` com `{uri, exp}` validado na leitura (vencido re-sobe), e cada peça
  em `docsCache` guarda `d.fileProvider`: um `file_id` da Anthropic nunca entra num
  request Gemini (e vice-versa; `montarBlocos`/`subirPecas` conferem). PDF Gemini:
  ≤ 50 MB/1000 págs., 258 tokens/pág. Upload é resumable + poll de `state:ACTIVE`.
- **Sem citações por página no Gemini** (`citacoesNativas:false`): o system prompt
  alternativo (`SYSTEM_PROMPT_CIT_TEXTUAL` em content.js) manda citar peça e folha no
  próprio texto; `panel.setModoCitacoes("textual")` mostra o `ⓘ` (`.cite-note`)
  ao lado do selo do modelo — a nota é sobre o modelo ativo, e como parágrafo
  fixo no rodapé ela custava duas linhas em toda conversa.
  Annotations `url_citation` da busca viram citações web normais
  (`web_search_result_location`).
- **Paridade de recursos com o Gemini**: minutar (editor) e o mapa mental são chats
  comuns — sem skill, sem code execution —, então funcionam nos DOIS provedores. A
  única capacidade condicionada por caps é a citação nativa por página
  (`citacoesNativas`); nenhum recurso da UI é gated por nome de modelo.
- **Busca**: toggle Jurisprudência no Gemini declara `[{type:"google_search"}]` — sem
  `allowed_domains` (a API não suporta); a priorização de fontes .jus.br vai por
  instrução no system prompt. Custo: 5.000 buscas/mês grátis, depois US$ 14/1.000.
- **Troca de provedor no meio da conversa é BLOQUEADA** (`conversaProvider` em
  content.js): o histórico de um provedor não roda no outro (raciocínio assinado).
  `aplicarCapsNaUI` liga `ALERTA_TROCA_PROVEDOR` na troca do modelo e o envio tem
  guarda dura; "Nova conversa" (ou voltar ao modelo anterior) resolve.
- **Sem pause_turn no Gemini**: o loop de continuações de `executarTurno` sai na 1ª
  iteração; retry transitório (429/5xx, `err.retryable`) funciona igual. Stream que
  termina SEM `interaction.completed` (queda "limpa" de conexão) e status
  `failed/cancelled` LANÇAM erro retryable — resposta parcial nunca passa por
  completa.
- **Teto de saída no Gemini: `generation_config.max_output_tokens = 65536` SEMPRE
  explícito** (invariante testado) — o máximo dos dois modelos, para a resposta
  nunca ser cortada por um default menor. O campo não aparece nas páginas de docs,
  mas é o que o AI Studio gera nos exemplos oficiais da Interactions API (fonte da
  confirmação, 2026-07). NUNCA repassar o `req.max_tokens` de 32000 do caminho
  Anthropic — cortaria o teto pela metade. O `max_tokens` de 32000 continua correto
  na Anthropic (parâmetro OBRIGATÓRIO lá; 32K é o valor aceito por todos os
  modelos Claude). Cache: só
  implicit caching (automático) — `cache_control` não é gravado nos blocos quando o
  provedor é gemini (e gemini.js nem copiaria o campo).
- **Config**: chave em `chrome.storage.local.geminiApiKey` (a `apiKey` continua sendo a
  da Anthropic); `chaveDe(cfg, provider)` escolhe e dá erro claro. popup/options têm os
  DOIS campos e uma lista única de modelos com `<optgroup>`; o chip e o `refreshKey`
  olham a chave do provedor do modelo selecionado. `manifest.json` inclui
  `https://generativelanguage.googleapis.com/*`.
- countTokens Gemini: `POST /models/{model}:countTokens` com `contents` traduzidos
  (file_data/inline_data/texto; steps opacos viram texto) — aproximação aceitável, a
  guarda de 90% e o `usageReq` pós-turno corrigem.

## Provedor OpenAI (Responses API)

`src/openai.js` é o TERCEIRO irmão de `claude.js` (INTOCADO) e `gemini.js`: emite o MESMO
vocabulário de eventos (`{kind:"text"|"thinking"|"citation"|"tool"|"trunc"|"final"}`) a
partir do SSE da **Responses API** (`POST /v1/responses`, header `Authorization: Bearer`;
GA, **sem header beta** — a API antiga `/chat/completions` NÃO é usada). `background.js`
despacha por `providerDe(model)` (prefixo `gpt-`); `content.js` e `panel.js` só condicionam
por **caps**, nunca por nome de modelo. Modelos: `gpt-5.6-sol` (topo, alias "GPT-5.6"),
`gpt-5.6-terra` (equilibrado), `gpt-5.6-luna` (rápido/barato) — todos 1,05M de contexto.
Regras que NÃO podem quebrar:

- **Modo stateless obrigatório** (`store:false`): o histórico interno continua nos blocos
  estilo Anthropic (com `__pecaId`) e `traduzirHistorico` em openai.js converte NO REQUEST —
  o filtro de peças desmarcadas (`prepararEnvio`) funciona igual nos três provedores. O
  system prompt vai em `instructions` (nível superior), NÃO no `input`.
- **Itens de raciocínio criptografados**: cada item `{type:"reasoning", id, encrypted_content}`
  da resposta é gravado no histórico como `{type:"x-openai-item", raw: item}` e devolvido
  VERBATIM no reenvio — reasoning criptografado precisa voltar byte a byte (regra análoga ao
  thinking assinado da Anthropic e ao `thought_signature` do Gemini). O request declara
  `include:["reasoning.encrypted_content"]` (para o conteúdo voltar no stateless) e
  `reasoning:{effort, summary:"auto", context:"all_turns"}`. `sanearCitacoes`/`prepararEnvio`
  não tocam nesses blocos por construção. A ordem `[reasoning, message]` é preservada na
  tradução — a API exige que um item reasoning seja seguido pelo item que ele produziu.
- **effort** (o eixo que o usuário pediu para conferir): a escala da OpenAI é a MAIS RICA —
  `none|minimal|low|medium|high|xhigh|max` (+ um eixo separado `reasoning.mode`
  standard|pro|ultra). O suporte a `xhigh`/`max` é dependente da variante e não documentado
  por modelo (Luna/Terra podem rejeitar com 400). `EFFORT_PARA_OPENAI` em background.js mapeia
  os três níveis da extensão para o subconjunto COMUM `low/medium/high` (aceito por todos os
  provedores e todas as variantes 5.6); expor `xhigh`/`max` seria só aqui, provavelmente só no
  Sol. Anthropic/Gemini/OpenAI compartilham low/medium/high.
- **usage normalizado** para as 4 categorias da Anthropic em openai.js
  (`input = input_tokens − cached`; `cache_read = input_tokens_details.cached_tokens`;
  `cache_creation = 0`; `output = output_tokens`, que já inclui os tokens de raciocínio) —
  custo, tooltip e gauge funcionam sem mudança. `custoUsdDe` usa `preco.cacheRead` (10% do
  input; cache automático, sem cobrança de gravação).
- **Uploads por provedor**: a Files API da OpenAI (`POST /v1/files`, `purpose:"user_data"`)
  devolve um `file_id` que persiste na conta (não expira por padrão) — o cache de sessão usa
  namespace `ofile:` (sem validação de expiração, ao contrário do `gfile:` do Gemini), e cada
  peça em `docsCache` guarda `d.fileProvider`: um `file_id` da OpenAI nunca entra num request
  Anthropic/Gemini (e vice-versa; `montarBlocos`/`subirPecas` conferem). PDF: ≤ 50 MB/arquivo
  e ≤ 50 MB somados por request; fallback base64 com teto `MAX_TOTAL_B64_CHARS_OPENAI` (40 MB).
- **Sem citações por página na OpenAI** (`citacoesNativas:false`, igual ao Gemini): o system
  prompt alternativo (`SYSTEM_PROMPT_CIT_TEXTUAL`) manda citar peça e folha no próprio texto;
  `panel.setModoCitacoes("textual")` mostra o `ⓘ`. Annotations `url_citation` da busca viram
  citações web normais (`web_search_result_location`), ao vivo pelo evento
  `response.output_text.annotation.added`; `file_citation` é ignorada (sem página).
- **Busca**: toggle Jurisprudência na OpenAI declara `[{type:"web_search"}]` — sem
  `allowed_domains` (a priorização de fontes .jus.br vai por instrução no system prompt, como
  no Gemini).
- **Troca de provedor no meio da conversa é BLOQUEADA** (`conversaProvider`): o histórico de
  um provedor não roda no outro (raciocínio assinado/criptografado). `ALERTA_TROCA_PROVEDOR`
  cobre os três; "Nova conversa" resolve.
- **Sem pause_turn na OpenAI**: o loop de continuações de `executarTurno` sai na 1ª iteração;
  retry transitório (429/5xx, `err.retryable`) funciona igual. Stream que termina SEM
  `response.completed`/`response.incomplete`, ou eventos `response.failed`/`error`, LANÇAM erro
  retryable — resposta parcial nunca passa por completa. `response.incomplete` com
  `reason:max_output_tokens` vira `trunc` + stopReason `max_tokens`; recusa (`content_filter`
  ou content-part `refusal`) vira `refusal`.
- **Teto de saída na OpenAI: `max_output_tokens = 65536` SEMPRE explícito** — generoso (folga
  enorme para minuta + resumo de raciocínio; o máximo dos 5.6 é 128.000) e limitado para custo
  previsível. NUNCA repassar o `req.max_tokens` de 32000 do caminho Anthropic. Cache: só
  automático (implicit) — `cache_control` não é gravado nos blocos quando o provedor não é
  anthropic (`montarBlocos` só marca o breakpoint no Anthropic).
- **Config**: chave em `chrome.storage.local.openaiApiKey` (Anthropic = `apiKey`, Gemini =
  `geminiApiKey`); `chaveDe(cfg, provider)` escolhe e dá erro claro. popup/options têm os TRÊS
  campos e uma lista única de modelos com `<optgroup>`; o chip e o `refreshKey` olham a chave do
  provedor do modelo selecionado. `manifest.json` inclui `https://api.openai.com/*`.
- countTokens OpenAI: `POST /v1/responses/input_tokens` (mesmo corpo do `/responses`) →
  `{input_tokens}` — endpoint dedicado e exato (conta arquivos/imagens/tools), análogo ao
  count_tokens da Anthropic. A guarda de 90% fica precisa.

## Invariantes importantes

- **Assistant no histórico é SEMPRE array de blocos** (`response.content` completo), nunca
  string: a API exige thinking assinado intacto e os blocos de ferramenta/citações nos
  turnos seguintes. Em fallback (sem blocos), texto puro com os placeholders de citação
  removidos. **Citações NUNCA voltam à API**: a resposta traz campos que o request
  rejeita (`file_id` em `page_location` → 400 "Extra inputs are not permitted") e,
  pior, a API revalida os `document_index` contra o layout do request atual — com o
  anexo incremental essa revalidação falha (400 "Invalid citation indices: Document
  not found for placeholder citation", sempre na 2ª mensagem). Por isso o campo
  `citations` é REMOVIDO dos blocos de texto do assistant antes de qualquer reenvio:
  `sanearCitacoes` (content.js) ao gravar no histórico e `stripCitacoes`
  (background.js) nas continuações `pause_turn`. A UI mantém as citações
  renderizadas do turno; o modelo segue vendo o texto integral.
- **Um só tipo de request** (não há mais o caminho de skill/`.docx`): *chat/busca* —
  documentos + citações + web tools quando o toggle "Jurisprudência" está ligado. Uma
  vez usadas na conversa, as web tools seguem declaradas nos turnos seguintes mesmo com
  o toggle desligado (`buscaNaConversa`): trocar o conjunto de tools invalidaria o cache
  de prefixo e arriscaria rejeição do histórico com blocos de ferramenta. Minuta e mapa
  são o MESMO tipo de request de chat, apenas isolados (não entram em `conversation`).
  As versões `_20260209` dos web tools já embutem execução de código — **nunca** declare
  `code_execution` junto delas.
- **Peças vão por `file_id` (Files API)**: upload único pelo worker com cache em
  `chrome.storage.session` (chave `idProcesso:idPeca:tamanho`); beta
  `files-api-2025-04-14` em todos os requests de chat. Base64 inline é só fallback de
  upload (aí vale o teto `MAX_TOTAL_B64_CHARS` de 24 MB).
- **Guardas de processo grande**: contagem de páginas por heurística no binário do PDF
  (`pje.js`) bloqueia acima de `MODEL_CAPS.maxPages` ANTES do envio; `count_tokens`
  (gratuito) estima o contexto e bloqueia acima de 90% da janela — e recebe as
  MESMAS tools/betas do turno (histórico com blocos de ferramenta exige as tools
  declaradas também no count_tokens, senão o pré-voo falha mudo e o medidor some).
  Tratar também `stop_reason: model_context_window_exceeded`.
- **Citações**: `citations:{enabled:true}` em TODOS os blocos document (regra da API:
  tudo-ou-nada); peças HTML viram document com source text (citáveis por
  `char_location`). No stream, `citations_delta` gera marcadores por **placeholder PUA**
  (`\uE000<n>\uE001` — sempre como escapes ASCII no código, nunca o caractere cru) que
  atravessam o escape-first do `renderMd` e viram `<sup>` só DEPOIS do escape. PDFs
  escaneados sem camada de texto não são citáveis (degradação graciosa).
  `infoCitacao` devolve `{label, id?, url?, trecho?}`: o **id sai como campo
  próprio**, nunca colado no rótulo — é ele que o painel usa para transformar a
  linha do rodapé num botão `.cite-go`, que reusa `onVerNaTimeline` →
  `PJE.scrollAte(id)` (mesmo caminho do botão "ver na timeline" das peças, via
  `irParaPeca`). O handler é DELEGADO no container de mensagens: as bolhas são
  re-renderizadas a cada delta do stream e um listener por linha morreria no
  primeiro token seguinte. O `id` só entra no DOM se casar `^\d+$` (vem do título
  da peça, que é conteúdo dos autos). `char_location` (peças HTML) não tem página:
  a citação leva `trecho` (o `cited_text`) como única âncora. `chaveCitacao` NÃO
  usa o id — a dedup por `document_index` é por turno e está correta.

- **Fonte de verdade da seleção de peças**: os checkboxes de `.doclist` em `panel.js`.
  Chips da barra de contexto, contador `x/y no contexto` (pill no cabeçalho da lista,
  em duas linhas: título+pill+«, depois a busca + o segmented control
  `principais|todas`), popup `@` e mensagens são
  *projeções* desse estado — nunca guarde seleção em outro lugar.
- **DUAS rotas de download, nesta ordem** (`urlsDownload` em pje.js):
  1. **COMPLETA** — `.../download/{TRIBUNAL}/{grau}/{idProcesso}/{idDocumento}`, com a
     sigla derivada do host (o rótulo antes de `jus.br`: `pje.tjce.jus.br` → `TJCE`).
     Serve os **dois tipos** de peça.
  2. **CURTA** — `.../download/{idDocumento}`: existe por retrocompatibilidade e **só
     funciona para PDF**. Em peça HTML o servidor devolve **200 com casca vazia** —
     sem o contexto do processo ele não sabe montar o documento. Era daí que vinha boa
     parte das "peças vazias" que só a ativação resolvia.

  `baixar()` aceita a primeira rota que devolva **corpo ÚTIL** — não basta HTTP 200,
  justamente por causa da casca. Hosts sem sigla clara (`*.cloud.pje.jus.br`) usam só a
  curta.
- **Download do PJe é stateful**: o endpoint REST só libera peças já "abertas" na sessão
  JSF. Quando nenhuma rota devolve corpo útil, `pje.js` simula o clique na timeline (A4J)
  e faz poll com HEAD até liberar, e tenta as rotas de novo. As ativações são
  **serializadas** (`activationChain`) — o JSF não tolera dois submits simultâneos na
  mesma view. A ativação depende de a peça estar NA TIMELINE, o que pode não valer para
  peças que só a grid conhece; a falha dela não interrompe o fluxo. Cada download loga
  `[PJe IA] peça …` no console da página (F12) para diagnóstico.
- **TRÊS formatos de peça** (`lerCorpo`): **PDF** (digitalizados e anexos), **HTML**
  (editor atual) e **RTF** (editor antigo, comum em processos migrados). O tipo é
  decidido pelo content-type E pela **assinatura no binário** (`%PDF-` ou `{\rtf`),
  porque o PJe legado serve os dois como `octet-stream` — confiar só no header mandaria
  RTF/PDF para o ramo de texto. O RTF passa por `rtfParaTexto`, um extrator próprio (sem
  biblioteca): poda os grupos que não são conteúdo (`\fonttbl`, `\colortbl`, `\info`,
  destinos `\*`), resolve `\'XX` pela CP1252 (onde vivem os acentos e o travessão),
  `\uN` com o fallback pulado, e converte `\par`/`\tab`. Sem isso a peça chegava ao
  modelo como `{\rtf1\ansi\deff0{\fonttbl…` — milhares de tokens de marcação e nenhum
  texto legível.
- **Peças de encaminhamento são normais no PJe**: petições cujo conteúdo integral é algo
  como `<p>Em Anexo</p>` (o teor real está nos anexos "Documento de Comprovação"
  protocolados junto). Não é falha de download — o system prompt instrui o modelo a
  explicar isso e sugerir marcar os anexos.
- **Anexo incremental de peças** (`pecasNaConversa`): cada peça entra no histórico UMA
  única vez; a cada turno só o DELTA (peças ainda não enviadas) é anexado. Reanexar
  tudo a cada mudança de seleção duplicava páginas/tokens no request (os blocos já
  enviados fazem parte do prefixo cacheado) e estourava os limites já no segundo envio.
- **Desmarcar peça LIBERA contexto** (`prepararEnvio` em content.js): a API é
  stateless — o histórico inteiro é remontado a cada request —, então cada bloco
  `document` carrega o campo interno `__pecaId` e, no envio, `prepararEnvio(msgs,
  ativos)` filtra os blocos das peças desmarcadas e remove `__pecaId` (a API rejeita
  campos extras; o teste do scratchpad confirma que ele nunca vaza). Blocos do
  assistant (thinking assinado, ferramentas) NUNCA são tocados. `conversation` guarda
  o turno CRU (com `__pecaId`); re-marcar a peça faz os blocos voltarem sem reanexar
  (ela segue em `pecasNaConversa`). Custo aceito: mudar a seleção invalida o cache de
  prefixo daquele ponto em diante. As guardas de páginas/tokens contam o request que
  VAI de fato (só peças ativas + histórico filtrado).
- **Feedback de contexto em três camadas** (o usuário precisa saber quando encheu):
  (1) medidor `panel.setContexto` (tokens/páginas vs. limites), atualizado no envio e
  DINAMICAMENTE ao marcar/desmarcar peças — inclusive ANTES do primeiro envio, em
  DUAS sub-camadas, porque o clique não pode esperar download nem rede:
  (1a) estimativa LOCAL instantânea (0 ms, `estimativaLocalTokens`): PDF ≈ páginas ×
  2000 tokens, texto ≈ chars/3,5 sobre o que já está em `docsCache` (o tipo vem de
  `lerCorpo` em `pje.js`: content-type + assinatura `%PDF-` nos primeiros 1024
  bytes — PDF servido como octet-stream não pode cair no ramo de texto, que
  desperdiçaria ~17 mil tokens de lixo binário; HTML honra o charset do header
  ao decodificar); peças ainda sem download aparecem como
  "N peça(s) sem medir" (`pendentes` no gauge) — nunca fingir precisão;
  (1b) refinamento em segundo plano (debounce 900 ms): `baixarQuieto` (concorrência
  3, progresso peça a peça re-alimentando a estimativa local) → `subirPecas`
  (upload à Files API já na medição: count_tokens referencia por file_id, payload
  mínimo, e o envio reaproveia — prefetch completo) → count_tokens corrige o número.
  GUARDA de escala: acima de `LIMIAR_PREFETCH` (12) peças sem cache (ex.: "todas"
  marcadas), o refinamento NÃO dispara downloads — a ativação JSF do PJe é
  serializada e levaria minutos; fica a estimativa parcial e a medição completa
  acontece no envio. `estSeq` descarta respostas atrasadas e `ultimaChaveEst`
  (ids ordenados + tamanho da conversa) evita re-medir nos refreshs da timeline —
  a chave é limpa sempre que o alerta liga, para a próxima mudança re-medir.
  Durante um turno (`busy`) o handler de seleção retorna cedo: refreshs da
  timeline do PJe disparam `syncSelection` sem mudança real e sobrescreveriam
  a medição oficial do envio. Se o count_tokens do envio falhar (ex.: 429 —
  o motivo agora vai ao console), o fallback re-pinta a estimativa local com
  o cache já cheio (sem isso o medidor congelava no retrato do clique, "N
  peça(s) sem medir"). Após o turno, `atualizarGaugePosTurno` usa o
  `usageReq` (usage do ÚLTIMO request físico — a soma das iterações
  `pause_turn` serve para custo, mas duplicaria o tamanho do contexto) como
  medição EXATA, de graça, e memoriza `ultimaChaveEst`;
  (2) bloqueio a >90% da janela em `estimarContexto` (erro com flag `ctxCheio`);
  (3) barra de alerta persistente `panel.setAlerta` (`.alertbar`, `role="alert"`, com
  botão ⟲) ligada quando o envio é bloqueado ou em `model_context_window_exceeded` —
  diferente do `.status` (transitório), só some quando a conversa volta a caber
  (desmarcar peças re-estima e limpa sozinha) ou em "Nova conversa". Compaction
  server-side foi avaliada e descartada: resumiria as próprias peças, matando as
  citações por página — a saída certa aqui é tirar/incluir peças do request.
- **Custo por resposta** (`registrarCusto` em content.js + `.custo` no painel): a
  API não devolve valor monetário — só o `usage` (tokens por categoria). O
  acumulador SSE de `claude.js` captura o usage (entrada no `message_start`,
  saída no `message_delta`); `executarTurno` (background.js) SOMA o usage de
  todas as iterações `pause_turn` (um turno lógico = vários requests físicos) e
  calcula `custoUsd` pela tabela `MODEL_CAPS[model].preco` (US$/1M tokens; cache
  write 1,25× o input, cache read 0,1×; Sonnet 5 usa preço de tabela, não o
  promocional). **Preço em DEGRAU**: quando a entrada da tabela traz
  `limiarLongo` + `longo` (hoje só os GPT-5.6: acima de **272 mil tokens de
  input** a OpenAI cobra 2× input e 1,5× output pelo request INTEIRO, não só
  pelo excedente), `custoUsdDe` troca de tarifa. Como o limiar é POR REQUEST
  FÍSICO, `executarTurno` soma **custos**, não tokens: calcular no fim sobre o
  `usoTotal` faria duas iterações de 200k cruzarem um limiar que nenhuma delas
  cruzou. Modelos sem `longo` seguem lineares — Anthropic e Gemini inalterados.
  Este degrau importa muito aqui: mandar os autos completos passa de 272k com
  facilidade (é o motivo de existir o modelo de 1M), e sem ele o rodapé mostraria
  metade do custo real justamente nos processos volumosos. O `done` leva
  `usage`+`custoUsd`; o content acumula
  `custoConversaUsd` (zera em "Nova conversa") e `panel.setCusto` mostra no
  rodapé ("nesta resposta • na conversa", tooltip com o detalhamento).
- **Prompt caching**: `montarBlocos()` marca o último bloco com
  `cache_control: {type: "ephemeral"}` e `stripOldCacheControl()` remove breakpoints
  antigos do histórico (a API aceita no máx. 4).
- **Limite de payload**: 24 MB de base64 (`MAX_TOTAL_B64_CHARS`) com folga sob o limite de
  32 MB da API. `montarBlocos()` lança erro amigável se exceder — por isso
  `panel.endPrep()` (confirmação "peças anexadas") só é chamado **depois** de montar os
  blocos.
- **Turnos desfeitos em erro**: em falha ou resposta vazia, `content.js` faz `pop()` do
  turno do usuário e remove as peças do turno de `pecasNaConversa`, para permitir nova
  tentativa limpa.
- **Keepalive do service worker (MV3)**: o Chrome mata o worker após ~30 s sem eventos
  de extensão — fatal em turnos longos que ficam muito tempo sem emitir SSE (raciocínio
  extenso, busca na web) com
  longos silêncios no SSE (sintoma: "conexão com o serviço interrompida"). Durante um
  turno, `background.js` chama `chrome.runtime.getPlatformInfo` a cada 20 s
  (`manterVivo`) e `content.js` manda `{type:"ping"}` pela porta; o handler do Port
  ignora tipos desconhecidos. Não remova nenhum dos dois lados.
- **Markdown seguro**: `renderMd()` em `panel.js` **escapa primeiro, formata depois**.
  Qualquer mudança ali precisa preservar essa ordem (a resposta do modelo pode conter
  conteúdo dos autos).
- **Blocos `document` levam `title`** (título da peça, no formato `"123456 - Nome"`)
  — exigência do system prompt, e o único canal pelo qual o **id** da peça viaja:
  a Citations API devolve esse mesmo texto em `document_title`, de onde
  `infoCitacao` (content.js) o extrai de volta. Nunca enviar o título "limpo".
- **Rastreabilidade peça · id · folha é a mesma nas QUATRO saídas** (chat Anthropic,
  chat Gemini, minuta/editor, mapa mental): o id é o número que abre o título da peça e é
  por ele que o usuário a reencontra na timeline do PJe — citar só o nome não serve.
  `PROMPT_INICIO` (compartilhado pelos dois provedores) exige nome + id; o
  `SYSTEM_PROMPT_CIT_TEXTUAL`, o `SUFIXO_MINUTA` e o `SUFIXO_MAPA` usam o mesmo
  formato literal `(Peça, id 123456, fl. 7)`. Ao editar um deles, editar os quatro.
- **Contexto do caso no system** (`contextoDoProcesso` em content.js): número CNJ
  (`PJE.getNumeroProcesso`) e data de hoje. Sem o CNJ o mapa mental titulava com
  número inventado; sem a data, prazos e "situação atual" saíam calculados contra o
  conhecimento congelado do modelo. Ambos entram por `systemPromptAtual()` — o mesmo
  ponto único do `customPrompt` —, então alcançam chat, minuta, mapa e count_tokens
  nos dois provedores de uma vez. A data muda o system uma vez por dia, o que é
  inofensivo: o cache é ephemeral de 5 min e a virada nunca cai numa janela viva.

## Busca de peças e orientações (panel.js)

- **"Carregar todas as peças" tenta DUAS rotas, nesta ordem** (detalhes e
  armadilhas em `docs/pje-tela-documentos.md`):
  1. **`PJE.listarPelaGrid`** — a tela "Documentos" do PJe, uma grid tabular
     paginada, lida num **iframe oculto same-origin** (nunca uma aba: isso
     custaria as permissões `tabs`+`scripting`, que mudam o aviso de instalação
     da Web Store). Dentro do iframe clicamos no link real e deixamos o próprio
     `A4J.AJAX.Submit` do PJe montar o POST. Ela traz o **tipo oficial** da peça,
     data e autor da juntada e — o ponto principal — o **total de páginas**, que
     é o oráculo de completude: `incompleto = paginasLidas < paginas`. Tudo é
     best-effort e devolve `null` em qualquer falha, inclusive
     `X-Frame-Options`. A grid é mesclada à timeline por `mesclarDocs`
     (content.js): a timeline manda na ORDEM, a grid acrescenta o que faltou e o
     `tipo`. `categoriaDe` (panel.js) classifica pelo **`tipo` antes do título**.
  2. **`PJE.carregarTimelineCompleta`** (fallback) — a rota por scroll descrita
     abaixo. Ela continua indispensável: é a única quando a grid não existe ou
     mudou de layout no tribunal X. Mas note que o "parou de crescer" dela é um
     heurístico TEMPORAL — lista parcial passa por completa sem erro.
- **A rota por scroll** (`PJE.carregarTimelineCompleta`): a timeline do PJe
  carrega as peças sob demanda (scroll infinito) — em processos maiores, só o
  trecho já rolado existe no DOM e, portanto, na lista do painel. O botão rola o container da
  timeline programaticamente até o fim. Scroller por heurística em 3 níveis:
  (1) primeiro DESCENDENTE rolável da timeline que contenha links — o caso
  real do TJCE (`div.eventos-timeline.scroll-y`; o `#divTimeLine` e TODOS os
  ancestrais têm overflow visible, e o `#pageBody`, único ancestral com
  overflow:auto, fica com scrollHeight == clientHeight — armadilha que
  derrubou a v1, que só olhava ancestrais); (2) ancestral rolável; (3) a
  janela. Timeline e scroller são RE-LOCALIZADOS a cada rodada — o re-render
  A4J que anexa as peças substitui os nós, e referência guardada viraria
  no-op. Aguarda cada leva do servidor até a lista parar de crescer por 2
  rodadas (teto 90 s);
  o MutationObserver da timeline repovoa a lista ao vivo e, ao final, a
  rolagem volta para onde estava. NÃO clica em nada (zero efeito A4J/JSF,
  não toca na `activationChain` — por isso também não precisa de guarda de
  `busy`); a rolagem programática dispara o evento scroll nativo que o lazy
  load escuta. Feedback pela própria dica (`panel.setTimelineTip({texto,
  carregando})`); reentrada bloqueada em content.js (`carregandoTimeline`).
  A mensagem de falha do "ver na timeline" aponta para este botão.
- **Busca na lista de peças** (`.docsearch`/`filtrarDocs`): filtra por título sem
  acentos (`row.dataset.busca = norm(titulo)`), só esconde/mostra linhas (`row.hidden`
  — depende da regra global `[hidden]{display:none !important}` do panel.css); os
  checkboxes seguem sendo a fonte de verdade (peça marcada e filtrada continua
  marcada). "todas" respeita o filtro ativo (marca/desmarca só as visíveis). O
  checkbox "principais" (`.chk-main`) marca/desmarca só as peças com categoria
  destacada (`.docrow:not(.cat-outro)`) — mesmo contrato do "todas": respeita o
  filtro e o estado dele é recalculado em `syncSelection`. Esc
  limpa; `setDocs` re-aplica o filtro após re-renderizar a lista.
- **Orientações no estado vazio** (`showEmptyHint`) — **progressive disclosure em
  quatro camadas**, nesta ordem: (1) três passos (`.passos`: marcar → pedir →
  conferir a origem), em coluna única e em 3 colunas SÓ no `.expanded` (na janela
  livre larga sobram ~420px de chat, e três cartões ali ficam com duas palavras
  por linha); (2) chips de exemplo (`EXEMPLOS`) que **preenchem** o campo — nunca
  enviam: sem peça marcada o envio falharia e a primeira experiência do usuário
  seria um erro; (3) `<details class="guia">` FECHADO por padrão (estado em
  `chrome.storage.local.guiaAberta`, restaurado depois de `showEmptyHint` existir
  — mesma armadilha do `docsOcultas`) com três parágrafos: não é agente autônomo,
  a lista pode vir incompleta, o contexto é limitado; (4) botão "Guia completo,
  modelos e preços →" abrindo `src/help.html` (por isso ele está em
  `web_accessible_resources`). **A referência que envelhece — tabela de modelos,
  preços, fluxo recomendado, dicas de cache — vive SÓ no `help.html`**: o painel
  aponta, não recita. Era duplicata integral e a origem da parede de ~380
  palavras. Manter os DOIS links (TecJustiça MCP https://mcp.tecjustica.com/ e a
  demonstração PJe-CE https://pjece.tecjustica.com/) dentro do `<details>`.
- **Aviso da timeline incompleta**: em repouso é só o ícone `⚠️` (`.tip-i`) —
  o aviso de duas linhas era permanente e competia com a própria lista. O
  `.tip-txt` **continua sempre no DOM com o texto padrão** (é ele que o
  hover/`:focus` no ícone revela, via `:has()`): esvaziá-lo faria o hover
  mostrar nada. O ícone é `role="note" tabindex="0"` com `aria-label` — sem
  isso o aviso sumiria para quem navega por teclado, já que conteúdo em
  `display:none` não é anunciado. `setTimelineTip` liga `.carregando` quando há
  progresso e, na mensagem FINAL (que chega com `carregando:false` e nunca mais
  é reescrita pelo content.js), agenda a volta ao repouso em 12 s — sem esse
  prazo o resultado ficaria fixo pelo resto da sessão, devolvendo à coluna as
  duas linhas que esta rodada tirou.

## Modos de layout, preview no hover e "ver na timeline" (panel.js/pje.js)

- **Modos de layout** (classes no `.wrap`): flutuante → `expanded` (modal central com
  backdrop) → `expanded full` (tela cheia), o modo `lateral` (sidebar colada à
  direita, página do PJe visível e CLICÁVEL ao lado — sem backdrop; `lateral` e
  `expanded` são mutuamente exclusivas) e o modo `livre` (janela solta: arrasta pelo
  cabeçalho, redimensiona pela alça nativa `resize:both` do canto — sem backdrop;
  com ≥740px de largura DO PAINEL ganha `.livre-wide` — alternada por
  `atualizarLivreLargo` no ResizeObserver e na entrada do modo, pois media query
  mede a viewport, não o painel — e a lista de peças vira coluna lateral como no
  expandido, com legenda).
  Transições centralizadas em `aplicarModo()`
  (não voltar aos handlers inline); a preferência persiste em
  `chrome.storage.local.layoutModo` (tela cheia é transitória: persiste "expandido")
  e é restaurada no `mount()`. Botões no header: `.side` entre `.expand` e `.free`;
  `.free` antes de `.fs`.
- **Modo livre — invariante da geometria**: left/top/width/height vivem em INLINE
  styles no `.panel` (inline vence classe) e são LIMPOS em toda saída do modo
  (`limparGeoLivre` em `aplicarModo` e no fechar) — sem isso deformariam o
  expandido/lateral/flutuante. A captura (`salvarGeoLivre`) acontece ANTES de
  remover a classe `.livre` (sem ela o `.panel` volta a `position:absolute` e o
  rect muda) e em três gatilhos: pointerup do arrasto, ResizeObserver (não dispara
  em janela ocluída — mesmo motivo do setTimeout do "ver na timeline") e
  saída do modo/fechar (cinto-e-suspensório do resize). Persistência em
  `chrome.storage.local.livreGeo` (debounce 400 ms); restauração no `mount` com
  clamp à viewport (o cabeçalho fica sempre alcançável). Os helpers são definidos
  ANTES do restore do layout (stub de teste chama o callback do storage
  sincronamente — mesma armadilha do `docsOcultas`). O arrasto ignora
  `closest("button")` (os botões do header continuam clicáveis) e o
  `setPointerCapture` fica em try/catch.
- **Ocultar a lista de peças** — disponível em TODOS os modos, com TRÊS
  affordances sincronizadas por `setDocsOcultas` — o botão do header
  sozinho passava despercebido (ícone parecido com o do modo lateral):
  (a) botão `.docsvis` no header, cujo ícone TROCA com o estado (chevron ←
  dentro do retângulo = recolher; → = exibir; `SVG.docshide`/`SVG.docsshow`);
  (b) botão `.docs-fold` («) no cabeçalho da própria coluna de peças;
  (c) `.docs-rail` ("Peças do processo" + badge `x/y`, alimentada
  em `syncSelection`) que fica NO LUGAR da lista recolhida e a reabre — a
  lista nunca some sem deixar rastro. Alterna `docs-collapsed` no `.wrap` →
  `.wrap.docs-collapsed .docs {display:none}` — mais espaço para o chat. A rail
  é **horizontal** (faixa no topo) onde a lista era faixa (flutuante, lateral,
  livre estreito) e **vertical** onde era coluna (`.expanded`, `.livre-wide`):
  duas regras no CSS sobre o MESMO elemento. É no flutuante que recolher mais
  rende — ~180px devolvidos ao chat.
  É puramente VISUAL: os checkboxes seguem no DOM (fonte de verdade da seleção),
  então chips, popup `@`, contador e envio funcionam com a lista oculta. Persiste
  em `chrome.storage.local.docsOcultas`, restaurada num `get` próprio DEPOIS de
  `setDocsOcultas` existir (stub de teste pode chamar o callback sincronamente);
  alternar fecha o preview (a âncora do popover some da tela).
- **"Ver na timeline"** (botão `.d-ver` em cada docrow, aparece no hover):
  `PJE.scrollAte(id)` rola a `#divTimeLine` até a peça com flash de ~2s — o estilo
  do flash é injetado no DOM da PÁGINA (`#pje-ia-flash-style`), pois o alvo vive
  fora do Shadow DOM. `scrollAte` NÃO clica no link (zero efeito A4J/JSF, não toca
  na `activationChain`) e retorna `false` quando a peça não está na timeline (o
  content mostra orientação no `.status`). No modal (expandido/cheia) o clique troca
  para o lateral ANTES de rolar — a página estava coberta. O handler é DELEGADO no
  `.doclist` e usa `preventDefault`+`stopPropagation`: a row é um `<label>`; sem
  isso o clique alternaria o checkbox (fonte de verdade da seleção) e dispararia o
  `change`. Callback: `panel.onVerNaTimeline(cb)`.
- **Preview de peça no hover** (só nos modos expandido/cheia/lateral/livre): popover ÚNICO
  `.preview` no Shadow DOM, debounce de intenção de 400 ms, posicionado pela
  `getBoundingClientRect` da row (direita quando cabe; senão esquerda — caso do
  lateral). O conteúdo vem SEMPRE do `docsCache` via `panel.onPreview(cb)` (callback
  SÍNCRONO) — **o hover NUNCA baixa nada**: o download do PJe é serializado na
  sessão JSF (~5,6 s/peça + clique na timeline como efeito colateral) e passadas de
  mouse travariam a extensão. Cache-miss mostra aviso + botão "Abrir documento"
  (rótulo de ABRIR, não "baixar" — decisão de UX; internamente segue sendo download)
  (`panel.onPreviewBaixar` → `PJE.baixar`, bloqueado durante `busy`; alimenta o
  MESMO `docsCache` que o envio reaproveita — prefetch de graça). O popover é
  REDIMENSIONÁVEL (`resize: both`; o tamanho persiste na sessão via inline
  width/height — a altura é zerada nos conteúdos compactos por `modoCompact`, e
  `posicionarPreview` usa a largura REAL quando há tamanho manual) e o embed de
  PDF usa a toolbar NATIVA do viewer do Chrome (zoom −/+, páginas; sem
  `#toolbar=0`) — Ctrl+scroll também faz zoom. O fechamento por mouseleave é
  SUSPENSO enquanto houver botão do mouse pressionado dentro do popover
  (`previewInteragindo`): no arrasto da alça de resize o ponteiro escapa do
  popover e o timer de 250 ms o fecharia na mão do usuário. PDF: no máximo UM
  blob URL vivo, revogado em todo fechamento/re-render; acima de 15 MB não
  decodifica no hover (o `atob` travaria a UI) — só metadados + "Abrir em nova aba"
  (posse do URL transferida, revogação com 30 s de folga). Texto: `textContent`,
  nunca innerHTML (conteúdo dos autos). CSP hostil da página (embed de `blob:`
  barrado) é detectada pelo evento `securitypolicyviolation` no `document` → flag de
  sessão + fallback com metadados ("Abrir em nova aba" escapa: navegação de topo não
  é governada pela CSP da página). TODOS os listeners são delegados no `.doclist`
  (as rows são recriadas a cada `setDocs`, que chama `hidePreview()`; `filtrarDocs`,
  `aplicarModo`, scroll da lista e Esc também fecham — o Esc do preview faz
  `stopPropagation` para não cancelar o modo minuta junto).

## Exportação das peças em `.zip` (zip.js + exportar.js + content.js)

Botão **⬇ Baixar .zip** na faixa `.docs-tip`, irmão de "⟳ Carregar todas as peças"
(as duas são ações sobre a lista INTEIRA; a `.toolbar` já estava apertada com cinco
botões em 484px). Existe para trabalhar os autos **fora** da extensão — no Claude
Code, num script, num arquivo de caso. Regras que não podem quebrar:

- **Sem a permissão `downloads`**, pela MESMA razão que fez a grid virar iframe: ela
  muda o aviso de instalação da Web Store numa extensão já publicada. Blob + âncora
  `download` (`baixarBlob` em content.js, o caminho que o mapa e a minuta já usavam)
  resolve, e como o resultado é **um** arquivo não há a enxurrada de downloads que a
  API `chrome.downloads` evitaria. A revogação do object URL tem 120 s de folga — o
  Chrome lê o blob DEPOIS do clique e um zip de centenas de MB demora a gravar.
- **`src/zip.js` (`ZipW`) é um escritor de ZIP próprio**, ~200 linhas: cabeçalho
  local + diretório central + EOCD, CRC-32 tabelado e deflate pela
  `CompressionStream("deflate-raw")` nativa. Vendorizar (JSZip/fflate) traria
  30–100 KB e um terceiro para auditar, para resolver a parte fácil. Sem Zip64
  (tetos de 4 GB e 65.535 entradas, com erro claro). **Cada entrada vira um Blob
  assim que é produzida** e o arquivo final é `new Blob(partes)`: concatenar num
  Uint8Array mataria a aba num processo grande. Deflate só no que ENCOLHE — PDF já
  é contêiner deflacionado, e `montarZip` passa `comprimir:false` nele.
- **`src/exportar.js` (`PjeExport`) é PURO**: não conhece `docsCache`, `PJE` nem o
  painel — recebe `docs`, a `ficha` e um `obter(id)`. É o que permite testá-lo fora
  do navegador (o ZIP gerado é validado pelo `zipfile` do Python, um leitor
  independente — escritor conferido pelo próprio leitor não prova nada).
- **`NNN_Titulo-limpo_ID.ext`**: o `NNN` é a posição CRONOLÓGICA no processo (não o
  índice do laço), para a ordenação alfabética da pasta coincidir com a ordem dos
  autos; o `ID` fica no nome porque **o nome do arquivo é o único metadado que
  sobrevive a sair da ferramenta**. O prefixo `123456 - ` do título é removido
  (`\d{6,}`, mesmo limiar do regex da timeline) para o id não aparecer duas vezes.
  **Peça que falha CONSOME o seu número** e a pasta fica com um salto (…002,
  004…). O salto é mantido de propósito — renumerar desalinharia a ordem —, mas
  não pode ficar mudo: a falha é gravada COM a `ordem`, e o `indice.txt` e o
  `LEIA-ME.md` dizem que o salto é a peça que faltou, não erro de contagem.
- **A ordem cronológica tem duas fontes e o critério vai ESCRITO no índice**: a data
  de juntada (só existe quando a grid foi lida) é dado; a inversa da ordem da tela é
  PREMISSA (o PJe lista do mais recente para o mais antigo). Peça sem data mantém a
  posição relativa — mover para um extremo seria inventar cronologia.
- **Três arquivos de metadados**, e o ZIP se explica sozinho no destino:
  `LEIA-ME.md` (convenção de nomes, formato de citação `(Título, id 123456, fl. 7)`,
  limites conhecidos), `indice.txt` (ficha do processo + **uma linha por peça**,
  campos separados por `" | "`, SEM truncar — uma tabela alinhada com dez campos só
  caberia cortando o nome de quem juntou a peça, que é justamente o que se pergunta
  a um índice) e `indice.json`. O formato de citação aqui é a **QUINTA** saída da
  regra peça·id·folha — ao editar `PROMPT_INICIO`/`SYSTEM_PROMPT_CIT_TEXTUAL`/
  `SUFIXO_MINUTA`/`SUFIXO_MAPA`, editar este também.
- **Ficha do processo** (`PJE.lerCabecalhoProcesso`): raspa `#maisDetalhes`
  (`dl.dl-horizontal` em blocos IRMÃOS — órgão julgador, cargo e competência vivem
  em `<dl>` próprios, por isso varre TODOS) e `#poloAtivo`/`#poloPassivo`. O titular
  sai do `<td>` com as `<ul>` REMOVIDAS de um clone; sem isso o nome do advogado
  colaria no da parte. `parsePessoa` corta o nome no primeiro `" - CPF|CNPJ|OAB"`,
  nunca no primeiro hífen (quebraria "BANCO ITAU CONSIGNADO S.A." e sobrenomes
  compostos). Tudo best-effort: falha vira `null` e a exportação segue sem a ficha.
- **`lerLinhas` guarda as colunas desconhecidas em `extras`**: a grid varia por
  tribunal (sigilo, matéria, órgão…) e um parser que só lê as cinco colunas
  conhecidas joga fora exatamente o que aquele tribunal tem de particular.
  `mesclarDocs` (content.js) **precisa repassar `extras`** junto de
  `tipo`/`juntadoEm`/`juntadoPor`: a peça que está nas DUAS fontes é o caso
  comum, e deixar o campo de fora ali fazia ele sobreviver só nas peças que a
  timeline não alcançou — o inverso do que ele existe para resolver.
- **Segredo de justiça vira banner no topo** do `LEIA-ME.md` e do `indice.txt`, e
  `segredoDeJustica` no JSON — muda como o pacote deve ser tratado, então não pode
  ser mais uma linha no meio da ficha.
- **Concorrência**: a exportação e qualquer turno disputariam a MESMA sessão JSF
  (o download do PJe é serializado). `exportando` bloqueia envio/minuta/mapa
  (`bloqueadoPelaExportacao`), o download do preview e — o caso não óbvio — a
  **camada 2 da estimativa dinâmica**: as ativações da exportação mexem na timeline,
  o que dispara `syncSelection` o tempo todo, e o refinamento sairia baixando peças
  em paralelo. A camada 1 (estimativa local) continua, que é de graça. A guarda é
  **recíproca com "⟳ Carregar todas as peças"**: a rota 1 (grid) faz submits A4J
  dentro do iframe, então ela recusa enquanto `exportando` e a exportação recusa
  enquanto `carregandoTimeline` — é o único outro caminho que mexe no JSF sem
  passar por `bloqueadoPelaExportacao`.
- **Cancelável**: `startPrep(items, {titulo, fim, onCancelar})` ganha um botão
  Cancelar quando há `onCancelar` (300 peças a ~5,6 s são ~28 min). O
  `sinal.cancelado` é conferido no topo de cada peça **e uma vez depois do
  laço**: cancelar durante a ÚLTIMA peça escaparia da guarda do topo e entregaria
  o download assim mesmo. No
  `setPrepState`, o estado **`erro` também adianta o contador** — sem isso a barra
  de uma exportação com falhas nunca chegaria ao fim. Sem `opts`, o card é byte a
  byte o do preparo de envio.
- **Teto de 600 MB** (`TETO_BYTES`): o conteúdo vive em `docsCache` como base64
  (~1,33× os bytes) e é materializado em Uint8Array ao zipar. Estourar mata a aba
  sem dizer por quê; a mensagem manda exportar em levas marcando parte das peças.

## Extração de texto das peças (pdf.js + Mistral OCR)

Peça em PDF pode ir à IA como **texto** em vez do binário. **Dois níveis**, e o
roteamento é o coração do recurso:

```
peça
 ├─ HTML / RTF ............ já é texto, nada a fazer
 └─ PDF
     ├─ tem camada de texto? → pdf.js LOCAL · US$ 0 · nada sai do navegador
     └─ digitalizada ......... Mistral OCR · US$ 0,002/pág · usuário confirma
```

**Por que isso existe.** Anthropic e OpenAI cobram a página de PDF como texto **+
imagem** (~2.300 tok/pág; a comparação oficial da Anthropic é 3 páginas = ~7.000
tokens com visão contra ~1.000 sem). O Gemini cobra **258 tokens de tabela** por
página e não cobra o texto nativo — **ali extrair PIORA o custo em ~3×**. Por isso o
veredito é **por MODELO, nunca por provedor**: `gpt-5.6-sol` economiza 40% e
`gpt-5.6-luna` fica 5× mais caro, sendo o mesmo provedor. `ocrEconomiza(caps)` em
`background.js` DERIVA isso do preço (não é campo escrito à mão) e o tooltip do botão
diz a verdade do modelo ativo — inclusive quando ela é "aqui não compensa".

O ganho maior nem é custo: peça extraída **não conta para `MODEL_CAPS.maxPages`**
(`paginasDe` a ignora), então processo de 300 páginas passa a caber no Haiku, cujo
teto é 100.

Regras que não podem quebrar:

- **É tudo ADITIVO.** A entrada do `docsCache` não muda de forma — só ganha `txt`,
  `txtFolhas`, `txtUsar`, `txtFonte`, `txtChave`. Enquanto `txtUsar` for falso,
  `montarBlocos`/`subirPecas`/`paginasDe`/preview/exportação enxergam o que sempre
  enxergaram. Em `montarBlocos` a mudança é **um `if` antes** do ramo PDF; os três
  ramos existentes não tiveram uma linha alterada, e isso é verificável no diff.
- **`claude.js`/`gemini.js`/`openai.js` INTOCADOS**: o bloco emitido é o mesmo
  `{type:"document", source:{type:"text"}}` que peças HTML/RTF já produzem desde
  sempre, e que os três clientes já traduzem.
- **A regra peça·id·folha sobrevive por DUAS camadas.** Com texto, a citação da
  Anthropic vira `char_location`, sem página. (a) `TEXTOLIB.montar` insere
  `[fl. N]` entre as folhas — resolve Gemini/OpenAI, que já citam textualmente;
  (b) o mapa de offsets `[{p, ini, fim}]` volta a produzir a folha em
  `infoCitacao`, por busca binária (`TEXTOLIB.folhaDoOffset`), reusando o id que o
  `document_title` já carrega. **O mapa consultado é o do texto ENVIADO**
  (`txtFolhasEnviadas`, gravado por `montarBlocos`): o corte é em **fronteira de
  folha**, senão a citação viria com a folha errada — pior que sem folha.
- **`src/extrator.html` é página OCULTA em iframe**, e é o único contexto onde o
  pdf.js abre um `Worker` de verdade. No content script, 1,64 MB carregariam em toda
  página `jus.br`; no service worker MV3 não há `new Worker` (rodaria na própria
  thread) e o PDF só chegaria lá em base64. O ArrayBuffer vai **transferable**, cópia
  zero. Silêncio do iframe (COEP) é tratado como falha: a peça segue como PDF.
- **Ordem de leitura não é garantida** pelo `getTextContent()` — ele emite na ordem do
  content stream. `textoDaPagina` reagrupa por geometria (y decrescente em bandas,
  x crescente) e insere espaço nas lacunas de posicionamento (sem isso sai
  "otextoficaassim"). **Não** passar `disableNormalization`: a normalização de
  ligaduras é o que se quer.
- **Poda do carimbo do PJe em DOIS critérios** (`podarRepetidas`): literal (pega
  "Assinado eletronicamente por…") e por padrão numérico **exigindo densidade de
  dígitos ≥15%** (pega "Num. 141516180 - Pág. 3"). Sem a densidade, "conteúdo da
  folha 1/2/3…" colapsaria numa chave só e o texto REAL seria apagado.
- **Classificação nativo × digitalizado é de graça** (`analisarPdf` em `pje.js`, na
  mesma varredura latin1 de `contarPaginas`): `bytes/página > 80 KB` resolve a
  maioria; refina com `/DCTDecode`, `/CCITTFaxDecode`, `/Subtype /Image` e `/Font`.
  **`/Font` sozinho é positivo FRACO** — o carimbo de assinatura do PJe tem `/Font`
  mesmo num PDF 100% escaneado. Errar para "nativo" é barato (o pdf.js devolve pouco
  texto e a peça cai no OCR); errar para "escaneado" gastaria dinheiro à toa.
- **Cache em `chrome.storage.local`** (`TEXTOLIB`, prefixo `texto:`), porque OCR
  custa e `session` faria repagar. Chave `texto:<proc>:<peca>:<tamanho>` — o tamanho
  invalida sozinho se a peça for substituída. Poda DUPLA: 7 dias e orçamento de ~6 MB
  (o `local` tem ~10 e já hospeda `minuta:*` e `modelo:*`; estourar faria o `set`
  falhar e derrubaria a gravação de uma minuta). **Religar peça já extraída não
  repaga** — `extrairPeca` devolve do cache antes de chamar qualquer API.
- **Peça já em `pecasNaConversa` não troca de forma**: o bloco antigo permanece nos
  turnos passados, que a API remonta inteiros. "Nova conversa" resolve.
- **Sem permissão nova** além de `host_permissions` para `api.mistral.ai`. Nada de
  `unlimitedStorage` nem `offscreen` — mudariam o aviso de instalação.
- **Só PDF entra no fluxo.** HTML e RTF do editor do PJe já SÃO texto: `onExtraivel`
  devolve `null` neles, `extraiveis` os conta em `jaTexto` e o lote os marca `done`
  sem erro. Oferecer extração numa peça que já é texto é ruído puro.
- **A linha de status (`.extrai-bar`) conta a seleção INTEIRA, não o cache.** A
  primeira versão só olhava peças já baixadas — marcar "todas" fazia a opção de
  extrair sumir, o oposto do esperado, e foi a maior fonte de confusão no primeiro
  teste real. Peça não baixada é candidata; o tipo dela só se sabe depois, e isso vai
  no `title` (`naoMedidas`), não na tela. Ela escreve **duas versões no DOM**
  (`.eb-full`/`.eb-short`, padrão do medidor `.g-*`) pelo critério **inverso** ao
  dele: no `.expanded`/`.livre-wide` a lista de peças vira coluna de ~310px e a
  frase longa truncava exatamente no custo — o número que decide se vale extrair.
- **Trabalho pendente tem TRÊS estados, não dois** (`extracaoFalhou`, um Map
  `id → motivo` em content.js): feito, a fazer e **impossível**. Sem o terceiro, a
  peça que devolve 404 no PJe voltava a `pendentes` a cada recálculo e a faixa
  prometia "⌁ Extrair 1" para sempre, cada clique repetindo o mesmo erro — foi o
  defeito mais visível do segundo teste real. O registro governa só o LOTE: o botão
  da própria peça segue disponível como **retentativa deliberada** (e o `title` diz
  o motivo da falha anterior). Digitalizada sem chave de OCR conta em
  `indisponiveis` pela mesma razão — some da soma faria a aritmética da faixa não
  fechar.
- **O painel recebe a LISTA de alvos, nunca reconta** (`setExtracaoAviso({ids})`).
  Quando `content.js` contava e `panel.js` rederivava o alvo do clique por outro
  caminho, as duas contas divergiam: o botão dizia "Extrair 44" e processava zero.
  Uma fonte, uma verdade.
- **O lote presta contas no CHAT** (`panel.mostrarRelatorioExtracao`), não no
  `.status`. Uma operação que levou minutos e pode ter custado dinheiro não pode
  terminar sem rastro — o card de progresso some. O relatório separa **por via**
  (leitura local grátis × OCR pago, com o custo) e diz quantas **já eram texto e
  não precisaram de nada**: era a pergunta "não sei se ele está lendo só os PDFs".
  Peça sabidamente texto fica **fora do card de progresso** pelo mesmo motivo —
  vê-la virar ✓ afirma um trabalho que não houve. Mesmo contrato do
  `mostrarFalhasPecas`.
- **Decisão sobre conjunto misto oferece a saída segura como ação PRIMÁRIA**
  (`confirmarVisual` com o 5º parâmetro `alt`): "Extrair só as N sem imagem" na
  frente, "Extrair todas" subordinada. Aplicar sim-ou-não em bloco foi o que
  transformou documentos de identidade em texto ilegível — e o modelo perdeu a
  imagem, que era todo o conteúdo deles. Peça ainda não baixada **não tem como ser
  classificada** (o download acontece dentro do lote), então ali o diálogo só avisa
  e dá a estimativa de espera; a rede de segurança é o desfazer.
- **`baixando` ≠ `loading` no card de progresso.** Baixar do PJe leva ~5,6 s/peça e
  ler o texto leva menos de meio segundo. Rotular a espera do tribunal como
  "extraindo" faz o usuário culpar a extração — e foi o que aconteceu. O lote loga no
  console quanto foi de cada etapa.
- **O pdf.js é pré-aquecido** (`aquecerExtrator`, em `requestIdleCallback`) assim que
  a extração vira possível. São 1,64 MB: criado só no primeiro clique, a PRIMEIRA
  peça pagava o carregamento inteiro e a leitura parecia lenta sem ser.
- UX: a palavra é **"extrair o texto"**, nunca "OCR" (nome de implementação; fica no
  help). Os rótulos dos pacotes dizem o CONTEÚDO — `⬇ Documentos (.zip)` × `⬇ Texto
  (.zip)` —, porque "Baixar .zip" ao lado de "Texto (.zip)" não deixava claro se o
  primeiro extraía. Só um estado vira marca permanente na row: a peça que **já vai
  como texto** (`.d-emtexto`, verde `--ok`/`--ok-bg`). Ela chegou a ser removida
  (43 de 44 peças com o mesmo glifo vira muro) e **voltou**: sem ela, terminar a
  extração de UMA peça não mudava nada na tela — não havia como saber se
  funcionou, e o uso peça a peça, que é o principal, ficava sem confirmação
  nenhuma. Muro honesto vence estado invisível. O botão de **desfazer tem ícone
  próprio** (`SVG.voltarDoc`): reusar o glifo de extrair fazia o botão parecer
  oferecer a mesma ação de novo. O `.d-extrai` fica levemente visível
  (`opacity: .4`) nas rows **marcadas** — invisível até o hover, ninguém o
  descobria e a extração parecia existir só em lote.
- **O preview mostra o que o modelo vê, e é onde se desfaz.** As abas
  Documento/Texto levam a marca `•` (`.pv-uso`) na versão que **vai para a IA** —
  sem ela as duas parecem alternativas equivalentes. O botão "Voltar ao documento"
  vive no rodapé do preview além do ícone da row: é olhando o texto que se
  descobre que ele não presta (um RG digitalizado vira poucas linhas ilegíveis), e
  a saída tem de estar na tela onde o problema aparece. "Refazer com OCR" mora no
  mesmo rodapé, e só quando a leitura foi LOCAL e há chave: ninguém pede OCR antes
  de ver que o texto grátis não serviu.
- **UMA via na interface: o OCR do Mistral.** A escolha entre leitura local e OCR
  chegou a estar espalhada em cinco lugares, e o sintoma foi o usuário perguntando
  *"eu estou usando o Mistral ou não?"* diante de um botão escrito "Extrair".
  **Ter de perguntar isso já é o defeito.** Com chave configurada o botão diz
  `Extrair com OCR · ≈ US$ 0,28` e não há segunda opção; sem chave, o texto
  explica que a leitura sai pelo navegador e só funciona em peça com texto
  próprio. O `pdf.js` continua no código como caminho de quem não configurou a
  chave — ali não há escolha a oferecer, só um jeito de conseguir o texto.
  **Consequência no custo**: com chave, `extraiveis` soma as páginas de TODAS as
  pendentes em `paginasOcr`, não só das digitalizadas — senão a faixa anunciaria
  um preço menor do que o que vai ser cobrado.
- **A caixa de confirmação MEDE a própria altura** (`confirmarVisual`). Ela usava
  um `130` fixo para se afastar da borda inferior; com quatro linhas de texto a
  caixa passava disso e os botões ficavam abaixo da tela — o usuário via a
  pergunta e não via as respostas. E como o painel vive no rodapé da página, esse
  era o caso COMUM. Agora mede o `getBoundingClientRect` depois de inserir, abre
  ACIMA da âncora quando não cabe abaixo, e o CSS tem `max-height: calc(100vh -
  16px)` como rede de segurança para janelas muito baixas.
- **O selo de formato (`.d-fmt`: PDF/HTML/RTF) é o que torna a regra visível.**
  Só PDF aceita extração, e dizer isso em prosa não resolve: o selo responde de
  relance onde o OCR faz sentido. Aparece só depois do download (o formato vem do
  content-type + assinatura no binário) e some quando a peça já vai como texto,
  porque aí quem manda é a marca verde.
- **Comparação lado a lado** (`src/texto.html?k=…&cmp=1`): PDF original à esquerda,
  texto extraído à direita, cada coluna com rolagem própria. Texto extraído só é
  confiável se der para bater contra o original, e conferir alternando de aba é o
  mesmo que não conferir. O binário viaja **pelo worker** (`{type:"guardarPdfCmp"}`
  → `chrome.storage.session`, chave única `cmp:pdf` sobrescrita): o content script
  NÃO pode escrever na sessão — ela só aceita contexto confiável e o projeto não
  chama `setAccessLevel` —, e do content o `set` falharia calado. Mesma razão pela
  qual o mapa mental grava por RPC. Teto de 8 MB de base64 (a cota da sessão é
  ~10 MB); acima disso a página abre só com o texto e explica.

## Tolerância a falha de download (invariante do envio)

Peça que falha ao baixar **não interrompe o turno**. O PJe devolve 404 em peças que
existem na lista mas não têm download servível (atos ordinatórios de sistema anterior,
por exemplo), e uma única dessas abortava a análise inteira: o usuário desmarcava,
reenviava, e caía na seguinte.

`baixarSelecionadas` devolve `{ok, falhas}` em vez de lançar; o envio segue com `ok` e
**só as peças que realmente entraram** vão para `pecasNaConversa` (as que falharam
continuam elegíveis na próxima tentativa). `montarBlocos` pula id sem cache por
construção — um `TypeError` ali derrubaria o turno por causa de uma peça. Minuta e mapa
seguem a mesma regra. Só quando **nenhuma** peça baixa é que o turno falha.

O relatório vai para o CHAT (`panel.mostrarFalhasPecas`), não para o `.status`
(transitório) nem para a `.alertbar` (que é para o que impede de continuar): a análise
seguiu, e o usuário precisa poder ler com calma o que faltou e por quê.

## Seleção em faixa na lista de peças (panel.js)

Marcar 40 petições em sequência não pode custar 40 cliques. Três gestos, todos sobre os
MESMOS checkboxes (fonte de verdade) e todos respeitando o **filtro ativo** (só rows
visíveis, como o "todas" e o "principais"):

- **arrastar** — marca/desmarca a faixa por onde o ponteiro passa. Exigiu
  `user-select: none` na `.docrow`: sem isso o gesto pintava a lista de azul de
  seleção de TEXTO e não marcava nada. Exceção: `.d-id` continua `user-select: text`
  (o número da peça se copia para procurar no PJe) — **e a exceção reintroduziu o
  bug**: o ponteiro cruzando os ids começava a selecionar texto e o arrasto morria.
  A classe `.arrastando` no `.doclist` (posta no pointerdown, tirada no pointerup)
  suspende o `user-select` de TODOS os descendentes durante o gesto; parado, o id
  volta a ser copiável. A row de ORIGEM é marcada no primeiro `pointerover` de
  outra row (`origemMarcada`): o `<label>` só a alterna quando o gesto vira clique,
  então arrastar da peça 1 até a 5 marcava 2,3,4,5 e deixava de fora justamente
  aquela onde o dedo começou.
- **Shift+clique** — do último item tocado até este. `preventDefault` no
  `pointerdown`, senão o `<label>` alternaria só a row clicada.
- **botão direito** — menu com "daqui para baixo/cima", que resolve quando o outro
  extremo está fora da tela.

`ancoraSel` é zerada em `setDocs` e em `filtrarDocs`: os índices são posicionais e
deixam de valer quando a lista muda. **`.selmenu` e `.confirmbox` são
`position: fixed`** — o `.wrap` é um container de tamanho ZERO (quem tem dimensão é o
`.panel`), então posicionar por dentro dele joga o elemento para fora da tela.

## Popup de menção `@` (panel.js)

Detecção por regex do token `@busca` antes do caret (`findMentionToken`); busca ignora
acentos via `norm()` (NFD + remoção de diacríticos). Ao selecionar, o token é removido do
texto e o checkbox correspondente é alternado. Detalhes fáceis de quebrar:

- As linhas do popup usam `mousedown` + `preventDefault()` (não `click`) para agir antes
  do `blur` do textarea.
- `Enter`/`Tab` com popup aberto selecionam; só com popup fechado o `Enter` envia.
- `updateMention()` é chamado em `input`, `click`, `keyup` (setas/Home/End) e em
  `setDocs()` — todos os caminhos que movem o caret ou mudam a lista.
- Cap de `MENTION_MAX` itens com linha "… e mais N peças" quando excede.
- **Busca visível** (`.mention-q`): um campo de busca FALSO (lupa + texto +
  cursor piscando + contador "N peças") entre o cabeçalho e a lista espelha
  a query digitada após o `@` — a digitação continua no textarea (não é um
  input; `aria-hidden`, atualizado em `renderMention` via `mention.query`/
  `mention.total`). Sem ele ninguém descobria que dava para filtrar.
- **Busca sem resultado NÃO fecha o popup** (até 20 chars de query): mostra o
  estado vazio ("nenhuma peça…") — o campo de busca sumir no meio da digitação
  parecia travamento. ACIMA de 20 chars sem resultado o popup FECHA: o usuário
  está escrevendo a frase (um "@" que não é peça), não buscando — sem isso o
  popup ficava aberto re-renderizando a cada tecla até o fim da mensagem.
  Com a lista vazia o teclado é liberado (só Esc é capturado): Enter ENVIA a
  mensagem normalmente — capturá-lo bloquearia mensagens com "@algo" que não
  é peça — e as setas movem o caret.
- **Cursor falso do campo de busca**: reiniciado a cada `renderMention`
  (`style.animation = "none"` + reflow + limpa) — fica SÓLIDO enquanto se
  digita e pisca só parado, como um cursor real; `.mq-t` usa `white-space:
  pre` e a query CRUA (sem trim) para o espaço final mover o cursor; no
  vazio o `order` põe o cursor ANTES do placeholder.

## Biblioteca de prompts — popup `/` e chip (prompts.js + panel.js)

Prompts reutilizáveis do usuário (título + texto): digitar `/` no campo abre um popup
com os prompts salvos; selecionar liga um CHIP na `.promptbar` (faixa fundida ao topo
da `.inrow`) e o texto do prompt PRECEDE a mensagem **no envio**. CRUD num modal
(`.plib`) dentro do Shadow DOM, aberto pelo botão `✦ Prompts` da barra de ferramentas
ou pelas linhas de ação do próprio popup. Regras que não podem quebrar:

- **Gatilho só no INÍCIO da mensagem** (`findSlashToken`, regex `^\s*\/([^/@\n]*)$`
  sobre o texto antes do caret): a barra é onipresente em texto jurídico
  (`01/02/2026`, `art. 5º/CF`, `e/ou`) — a regra do `@` (dispara após espaço) geraria
  falso positivo a cada frase. Um segundo `/` ou um `@` na query fecham o popup por
  construção. Ambos os popups nunca abrem juntos: os tokens são disjuntos.
- **A concatenação acontece no PAINEL** (`montarTextoEnvio`, `prompt + "\n\n" + texto`;
  campo vazio envia o prompt sozinho): `sendCb`/`minutaCb`/`mapaCb` seguem recebendo
  `(texto, ids)` e **content.js/protocolo/histórico não mudam em nada**. A bolha do
  usuário mostra o texto combinado de propósito — é o que foi à API.
- **Um prompt por mensagem**: `promptAtivo` é objeto único; escolher outro substitui o
  chip; o envio o consome (`setPromptAtivo(null)`), e "Nova conversa" também o solta.
- **`storage.sync`, um item por prompt** (`plib:<id>`): a cota é de 8.192 B POR ITEM —
  `PLIB.tamanhoOk` valida os bytes REAIS com `TextEncoder` (não `.length`: texto
  jurídico é acentuado, multibyte) e o `set` sempre confere `chrome.runtime.lastError`
  (cota total/rate-limit). `AREA` em prompts.js é o único ponto de troca sync↔local —
  trocar não migra os dados. O `aoMudar` filtra a área `sync` + prefixo, sem colidir
  com o `storage.onChanged` de `"local"` do content.js.
- **Espelho do popup `@`**: rows usam `mousedown`+`preventDefault` (o blur do textarea
  fecha em 120 ms), `updateSlash` roda nos MESMOS 4 gatilhos (`input`, `click`, `keyup`
  de setas, `blur`) e o bloco do `/` no `keydown` vem ANTES do `@` e do Enter genérico.
  Sem resultado na busca o teclado é liberado (Enter envia a mensagem que começa com
  "/" literal); as ações fixas seguem clicáveis pelo mouse.
- **Esc em cascata**: `/` → `@` → modal (o keydown do `.plib-card` faz
  `stopPropagation`, senão cancelaria o modo minuta junto) → modo minuta.
- **Exclusão em dois cliques** ("excluir" → "excluir?"), nunca `confirm()` nativo: o
  dialog da página vive fora do Shadow DOM e congela a extensão.
- **minuta + prompt convivem**: com chip ativo e campo vazio, o botão `.btn-minuta` NÃO
  injeta a `INSTRUCAO_MINUTA_PADRAO` (o prompt já é a instrução da minuta).
- `PLIB` ausente (harness sem o content script) esconde o botão e desliga a feature
  em silêncio — nada quebra.

## Minuta e editor de texto — página `src/editor.html`

Substitui o antigo `.docx` por skill da Anthropic (removido: era a maior fonte de
complexidade — code execution, `container`, três betas, keepalive dedicado — e só rodava
no Claude). Agora o modelo devolve **markdown** e a extensão o abre num **editor WYSIWYG**
(Jodit) numa aba própria; o `.docx` é gerado **no cliente**, igual nos dois provedores.

Botão "✍️ Minutar" liga o **modo minuta** (`setMinutaMode` em `panel.js`), clone exato do
contrato do modo mapa: instrução padrão editável no campo, faixa `.minutabar`, Enviar vira
"✍️ Gerar minuta", ✕/Esc/segundo clique cancelam. Mutuamente exclusivo com o mapa; "Nova
conversa" desliga ambos. O turno (`panel.onMinuta` → handler em `content.js`) é um **chat
comum** (sem tools/skills/`container`) — por isso funciona nos dois provedores. Regras:

- **Request isolado, como o mapa**: `prepararEnvio([{role:"user", content:[...blocos,
  instrucao + SUFIXO_MINUTA + lista de ids]}], null)`. Não entra em `conversation` nem em
  `pecasNaConversa` — gerar uma minuta não altera a conversa em andamento.
- **`SUFIXO_MINUTA` é prescritivo de propósito** (mesma razão do `SUFIXO_MAPA`): só
  Markdown, sem preâmbulo nem cerca ```` ``` ````, um `#` (nome do ato) e `##` nas seções;
  prosa em parágrafos, não bullets; **origem obrigatória** `(Título da peça, id 123456,
  fl. 7)` — o documento circula FORA da extensão, sem citação nativa nem timeline para
  conferir; nada inventado (o que falta vira `[COMPLETAR: …]`); sem assinatura/cabeçalho de
  tribunal (o PJe já põe). A lista explícita de ids vai no texto (sem ela o modelo inventa
  o id). `limparMarkdownMinuta` tira cerca e preâmbulo que escapem.
- **Canal de dados = `chrome.storage.local`** (não `session` como o mapa): a minuta precisa
  sobreviver ao fechar o navegador, e o content script acessa `local` direto — **sem RPC
  nova no worker**. `guardarMinuta` grava `minuta:<id>` com `{md, titulo, processo,
  criadoEm, atualizadoEm}` — **o Markdown CRU, não HTML** —, poda para os 10 mais recentes e
  descarta acima de 7 dias, e devolve a URL `src/editor.html?id=…`. ISTO GRAVA TRECHO DOS
  AUTOS NO DISCO (a única persistência do gênero na extensão): daí a poda dupla, o botão
  "Descartar", a lista de recuperação e as notas no `PRIVACY.md`/`help.html`.
- **Conversão Markdown→HTML é do `MinutaMd` (`src/minuta-md.js`), NÃO do `renderMd` do
  chat**: o renderMd do painel é o renderizador de BALÃO — achata listas aninhadas e junta
  parágrafos com `<br>`, inaceitável num documento. O `MinutaMd` (parser dedicado, testado)
  faz **listas aninhadas reais** (pilha por indentação), tabelas com alinhamento, parágrafos
  de verdade, títulos no nível certo (# → h1) e o mesmo *escape-first* de segurança (o texto
  vem dos autos). A conversão roda na PÁGINA do editor (script normal, sem a limitação de
  content script) na 1ª abertura; o HTML editado é gravado de volta e reusado depois.
- **Recuperação de rascunhos** (`listarRascunhos` em editor.js): sem uma lista, o rascunho
  ficaria órfão no disco. O botão "🗂 Rascunhos" abre um dropdown com os `minuta:*` (mais
  recente primeiro); `editor.html` SEM `?id` vira a própria lista (modo-lista); o popup e
  **Configurações → Suas bibliotecas** têm a porta de entrada "📝 Minhas minutas".
  No modo-lista some a barra de ferramentas E o próprio botão "🗂 Rascunhos"
  (`.modo-lista .acoes .grupo`): a página inteira já É a lista, e o dropdown repetia o
  mesmo conteúdo por cima dela. O `.drop` é ancorado à **direita** (`right: 0`) porque o
  `.drop-wrap` fica no canto direito do cabeçalho — com `left: 0` os 280px de largura
  saíam da janela e o painel aparecia cortado. O estado vazio da PÁGINA é próprio
  (`vazioPaginaHtml`, com orientação e links), diferente do compacto do dropdown, e o
  texto do rodapé é reescrito: o padrão fala de "Descartar" e de conferir citações,
  instruções do editor que não existem numa tela que só lista.
- **Card no chat, aba no clique** (`panel.mostrarCardMinuta`, clone do `mostrarCardMapa`): a
  bolha vira card "Minuta gerada" com "Abrir no editor" (`window.open` no clique — a resposta
  demora e o gesto do "Gerar" já expirou; navegação de topo é imune à CSP do tribunal) e
  "Baixar .md". Depois de `mostrarCardMinuta` NÃO se chama `updateAssistant` nesse elemento.
- **Oferta em respostas de chat comuns** (`panel.adicionarAcaoEditor`): ao fim de um turno
  normal, uma ação "Abrir no editor" abaixo da bolha (irmã do `.body`, sobrevive a
  `updateAssistant`). Vira botão em DESTAQUE quando `pareceMinuta(text)` (a **primeira
  heurística de intenção** do projeto: VERBO de redação + ESPÉCIE de peça, com VETO para
  pedidos de leitura) reconhece um pedido de peça redigida — a heurística NÃO toca no
  request nem no system prompt, só a proeminência do botão.

### A página do editor (`src/editor.html`/`.js`/`.css` + `src/editor-docx.js`)

- **Jodit** (`vendor/jodit.min.js`, global `Jodit`, MIT) monta a barra FORA da folha (config
  `toolbar: "#barra"`): a largura da folha é A4 e a barra na folha quebraria em duas filas.
  A largura A4 vive no `.folha-wrap`, não no `.jodit-container` — o Jodit escreve
  `max-width:100%;width:auto` no style inline do container, e inline vence classe.
  Tipografia forense (Times 12, 1,5, justificado, recuo 1,25 cm) no `.jodit-wysiwyg`, e
  `@media print` esconde topo/barra e imprime só a folha.
- **`.docx` no cliente** (`vendor/docx.iife.js`, global `docx`, MIT): `EditorDocx.gerarBlob`
  em `editor-docx.js` percorre o DOM do conteúdo (via `DOMParser`, que não executa scripts —
  o HTML teve origem no modelo) e monta `Paragraph`/`TextRun`/`Table` com page setup A4 +
  margens 3/2 cm, numeração declarada e estilos de título; `docx.Packer.toBlob()` → Blob +
  `<a download>` (sem permissão `downloads`). **Editar `editor.css` e `editor-docx.js`
  juntos**: as medidas forenses estão nos dois e precisam bater (o que se vê é o que se
  imprime/exporta).
- **Copiar formatado**: `navigator.clipboard.write` com `ClipboardItem text/html+text/plain`
  (exige `"clipboardWrite"` no manifest), com fallback de `execCommand("copy")` sobre uma
  seleção na própria página. **Descartar** é exclusão em dois cliques (nunca `confirm()`
  nativo, que congela a página).
- **CSP da extensão veta scripts externos** (`script-src 'self'`): o Jodit em config PADRÃO
  puxa o `ace` (modo código) e o `js-beautify` de cdnjs — ambos bloqueados. Por isso o
  `montarEditor` fixa `beautifyHTML:false`, `sourceEditor:"area"` e **remove o botão
  `source`**: o editor de minutas é WYSIWYG puro, sem visão de HTML cru (que também não
  faria sentido para o usuário). Não reintroduzir o botão `source`.
- `vendor/` é **intocado**; nenhum bundle entra em página de tribunal. `src/editor.html`
  está em `web_accessible_resources` (aberto de `*.jus.br`); os subrecursos não precisam.

## Biblioteca de modelos de peças (`modelos.js` + `panel.js` + `content.js`)

Peças-modelo do usuário (sentenças, decisões, despachos, ofícios, atas, mandados) para
o assistente **imitar a forma** ao gerar minutas. `src/modelos.js` expõe o global `MLIB`,
irmão do `PLIB`, com diferenças de propósito:

- **`chrome.storage.local`, um item por modelo** (`modelo:<id>`), NÃO `sync`: uma
  peça-modelo (mesmo real) passa dos 8.192 B/item do sync. `AREA` é o único ponto de
  troca; o `aoMudar` filtra área `local` + prefixo `modelo:` para não colidir com o
  `onChanged` de config do content.js nem com o do `PLIB` (área `sync`). Cada item tem
  **categoria** (a espécie) e descrição além de título + texto. Teto por item
  `TETO_BYTES` = 60000 (barreira de sanidade, não da API — local não tem cota por item).
- **Gated a modelos de 1M tokens** (`setModelosHabilitado` no painel, chamado por
  `aplicarCapsNaUI` com `caps.contextTokens >= 1000000`): a minuta manda os autos
  inteiros + vários modelos, o que só cabe nas janelas de 1M — no Haiku (200k) o botão
  **📚 Modelos** e o seletor da minuta somem (a minuta comum segue funcionando). Ao vivo
  na troca de modelo; fecha o modal se ele estiver aberto quando desabilita.
- **Seleção por CATEGORIA, não por modelo** (decisão de produto): o seletor da
  `.minutabar` escolhe uma espécie e `modelosMinutaSelecionados()` reúne TODOS os modelos
  daquela categoria (ordenados por recência) até dois tetos — `MODELOS_MAX_ENVIO` (12) e
  `MODELOS_TETO_CHARS` (180000, ~45k tokens; o 1º sempre entra). Corte avisado no console
  (sem cap silencioso). A categoria é pré-selecionada por `detectarCategoria` (espelha o
  agrupamento de `MINUTA_ESPECIE`); o usuário pode trocar. Passa via `minutaCb(t, sel,
  modelos)` — a assinatura ganhou o 3º arg, e sem modelos o comportamento é byte a byte
  o de antes.
- **Moldura anti-contaminação** (`molduraModelos` em content.js): o(s) modelo(s) entram
  como **um bloco de texto** (nunca `document`/`file_id` — não é peça dos autos, não é
  citável) e é o **PRIMEIRO** do content da minuta (antes das peças, no prefixo
  cacheado). Vai em **XML** (`<modelos_de_referencia>` com `<modelo n="i">`), não
  Markdown, porque o conteúdo interno é Markdown e a tag é a única fronteira que o modelo
  não confunde com a resposta. A instrução manda **analisar, escolher a base mais
  adequada e reaproveitar estrutura e LINGUAGEM** das outras, mas **nenhum FATO** (nomes,
  valores, datas, dispositivos) — esses saem só das peças do processo em tela; o que
  faltar vira `[COMPLETAR: …]`. Tags `<modelo…>` acidentais no texto do usuário são
  removidas (regex `limpar`) para não quebrar a moldura — o `<` comum do texto jurídico é
  preservado.
- **Página própria `src/modelos.html`** (+ `modelos-page.js`/`.css`), alcançável por
  **Configurações → Suas bibliotecas**, pelo rodapé do popup e pelo estado vazio de
  `editor.html`: cadastrar modelos é tarefa de PREPARAÇÃO e não deveria exigir uma aba
  de autos aberta só para chegar ao modal do painel. A camada de dados é a MESMA
  (`MLIB`), então o que se cadastra ali aparece no painel na hora (`aoMudar`), e não há
  esquema novo. A página **não** precisa entrar em `web_accessible_resources`: só é
  aberta de contextos de extensão (options/popup/editor), nunca de uma página `jus.br`.
  A lista é **agrupada por categoria** (a etiqueta repetida em cada linha competia com
  o título, e a categoria é o eixo em que se pensa aqui — é por ela que a minuta
  seleciona); a linha inteira abre a edição; excluir segue em dois cliques.
- **Funciona nos DOIS provedores** (a minuta é chat comum, sem gating por nome de
  modelo) e grava **trecho de outros processos no disco** (como os rascunhos de minuta):
  daí a nota no `PRIVACY.md`/`help.html` e a exclusão fácil na biblioteca (dois cliques,
  nunca `confirm()` nativo). O modal `.mlib` reaproveita todo o visual do `.plib`
  **carregando as duas classes** (`class="mlib plib"`, `mlib-card plib-card`…) — por
  isso o bloco `.mlib` tem de continuar DEPOIS do `.plib` no template: os seletores do
  PLIB são `$(".plib")`/`$(".plib-card")`/`$(".plib-cnt")` sem escopo, devolvem o
  PRIMEIRO match e passariam a apontar para o modal errado se a ordem invertesse. Os
  handlers de lista dos dois são delegados e escopados no próprio `.*-list`, então só a
  ordem no DOM segura essa fronteira.

## Mapa mental (markmap) — página `src/mapa.html`

Botão "🧠 Mapa mental" na barra de ferramentas liga o **modo mapa** (`setMapaMode` em
`panel.js`), clone exato do contrato do modo minuta: instrução padrão editável no
campo, faixa `.mapabar`, Enviar vira "🧠 Gerar mapa", ✕/Esc/segundo clique cancelam.
Os dois modos são **mutuamente exclusivos** (ligar um desliga o outro) e "Nova conversa"
desliga ambos. O turno (`panel.onMapa` → handler em `content.js`) é um **chat comum**:
sem tools, sem skills, sem `container` — por isso funciona nos dois provedores. Regras
que não podem quebrar:

- **Request isolado, como a minuta**: `prepararEnvio([{role:"user", content:[...blocos,
  instrucao + SUFIXO_MAPA]}], null)`. Não entra em `conversation` nem em
  `pecasNaConversa` — gerar um mapa não altera a conversa em andamento.
- **`SUFIXO_MAPA` é prescritivo de propósito** (mesma razão do `SUFIXO_MINUTA`): só
  Markdown, sem preâmbulo nem cerca ```, um único `#`, `##` nos eixos, listas `-` com
  até 3 níveis, itens curtos com peça/folha entre parênteses, nada de tabela/HTML.
  `limparMarkdownMapa` ainda tira cerca e preâmbulo que escapem.
- **Nova aba, não overlay**: `markmap-view` exige `d3` GLOBAL (~340 KB), content
  scripts do manifest não podem ser ES modules e `import()` dinâmico no content script
  fica exposto à CSP do tribunal (a mesma que barra o embed `blob:` do preview). A
  página `src/mapa.html` é `chrome-extension://`, carrega `vendor/d3.min.js` +
  `vendor/markmap-view.js` por `<script>` e não pesa nada nas páginas do PJe. Ela está
  em `web_accessible_resources` porque o `window.open` parte do content script.
- **A aba NÃO abre sozinha**: o card no chat (`panel.mostrarCardMapa`) tem o botão
  "Abrir mapa" — a resposta demora minutos e o gesto do "Gerar" já expirou; abrir
  direto cairia no bloqueador de pop-ups.
- **Canal de dados**: o content manda `{type:"guardarMapa"}` ao worker, que grava em
  `chrome.storage.session` (`mapa:<id>`, poda nos 5 mais recentes) e devolve o `id`; a
  página lê direto (contexto confiável). Some ao fechar o navegador — é o esperado.
- **`vendor/` é intocado** (d3 7.9.0 ISC + markmap-view 0.18.12 MIT, com
  `LICENSES.md`). **Não** vendorizar `markmap-lib`: arrasta katex/highlight.js/prismjs
  (~311 KB) e busca assets em CDN. A árvore `IPureNode` (`{content, children}`) sai de
  `mdParaArvore()` em `mapa.js` — ~70 linhas que entendem títulos e listas.
- **`content` do nó é HTML**: `mapa.js` duplica `escapeHtml` + `inlineMd` do `panel.js`
  (não dá para importar um IIFE de content script) e mantém a ordem **escape → formata**.
  O texto vem dos autos; sem isso um `<img onerror>` numa petição executaria.
- **Primeiro desenho com `duration: 0`**: as transições do d3 rodam em
  `requestAnimationFrame`, que o Chrome CONGELA em aba de segundo plano — com animação,
  abrir o mapa numa aba sem foco deixava os nós presos, invisíveis. A animação volta
  logo após o `fit()`; `duracaoSegura()` repete a regra na troca de nível e o
  `visibilitychange` redesenha + reenquadra ao voltar para a aba.
- `[hidden] { display: none !important }` em `mapa.css` pelo MESMO motivo do
  `panel.css`: o `.aviso` usa `display:flex` e cobria o mapa inteiro.
- **Riqueza visual do nó** (o `content` do markmap é HTML, e é isso que sustenta
  tudo abaixo): cada eixo é classificado por `EIXOS` (regex sobre o título sem
  acento, mesma técnica das `CATEGORIAS` do painel) e ganha **ícone SVG + cor**;
  a cor DESCE para todos os descendentes via `payload.cor` (a função `color` do
  markmap lê o payload — foi por isso que `colorFreezeLevel` saiu). A decoração
  roda em `decorarEixos()` DEPOIS de montar a árvore: durante a leitura não se
  sabe ainda quem virou raiz, e o título do processo acabava com ícone de eixo.
- **Realces do vocabulário processual** (`realces`): `fl.`/`fls.`, `id <n>`, datas,
  `R$` e `art./súmula` viram pílulas coloridas. Rodam ENTRE o escape e o
  `inlineMd` — o texto ainda não tem tags nesse ponto, então nenhum atributo é
  corrompido; trechos entre crases saem de cena por placeholders PUA
  (`…`, sempre escapados no código) para um `art. 5º` escrito como
  código não virar pílula dentro do `<code>`.
- **Etiqueta de origem** (`origemNoRodape`): a referência final do item —
  `(Contestação, id 123461, fl. 61)` — sai do meio da frase e vira `.mm-src` em
  linha própria. Citar peça, **id** e **folha** é requisito do recurso (é assim
  que o usuário reencontra a peça na timeline), e o subtítulo da página mostra
  `N/M com peça e folha` para expor quando o modelo não cumpriu.
- **Tabelas**: bloco Markdown `|…|` + separador vira UM nó com `<table class="mm-tab">`
  (partes, linha do tempo, valores). Sem `markmap-lib` no meio: o parser detecta o
  bloco e monta o HTML.
- A lista de peças (id + título) vai EXPLÍCITA no texto do request, além do `title`
  de cada bloco `document` — sem ela o modelo inventa ou omite o id.
- Recolhimento inicial: `initialExpandLevel: 2` (raiz + eixos). Os botões de detalhe
  re-`setData` sobre um **clone** da árvore — depois do primeiro render ela carrega
  `state`/`fold` e o nível não seria reaplicado. `colorFreezeLevel: 2` dá uma cor por
  eixo, na paleta das categorias de peças. Não há exportação de SVG: o
  `foreignObject` (que é o que dá as pílulas e tabelas) não sobrevive fora do
  navegador — a saída visual é a impressão/PDF, com `beforeprint` → `mm.fit()`
  para nada sair cortado.

## Desenvolvimento e teste

- **ARMADILHA DA ZONA MORTA TEMPORAL no `content.js`** (já derrubou o painel
  inteiro uma vez): o arquivo é um IIFE gigante que REGISTRA callbacks no painel
  centenas de linhas antes de declarar o estado que eles leem, e chama
  `refresh()` no meio — que roda `panel.setDocs` → `aplicarExtracaoNasRows` →
  `onExtraivel` de forma **síncrona**. Todo `const`/`let` do escopo do IIFE
  declarado DEPOIS de `refresh()` e lido por um desses callbacks lança
  `Cannot access before initialization` dentro do `setDocs`, que **aborta e leva
  junto o resto do content.js** — sumiram a seleção em faixa e a extração de uma
  vez, sem nenhum sintoma que apontasse para a causa. Estado lido por callback
  vive no TOPO, junto do `const panel`. Duas defesas: `extraivelSeguro` no
  painel (try/catch em volta do callback do content — a lista de peças não pode
  morrer por um recurso acessório) e o lint do scratchpad, que lista os
  candidatos e detecta a classe inteira.
- Não há bundler. Valide sintaxe com `node --check src/*.js`.
- **Testar o BOOT do content.js sem PJe** (o único teste que pega erro de ordem
  de inicialização): HTML com `#divTimeLine` no DOM, stubs de `chrome`, `PJE`
  (a superfície real é `listarDocumentos`, não `listar`), `TEXTOLIB`, `PLIB`,
  `MLIB` (**precisa de `CATEGORIAS`**, que o `mount` itera), `ZipW` e
  `PjeExport`; `eval` do `panel.js` e depois do `content.js`. Conferir por
  COMPORTAMENTO que os handlers do fim do arquivo subiram — arrastar marca a
  faixa, Shift+clique estende, botão direito abre o `.selmenu` —, porque um
  `content.js` abortado no meio ainda monta o painel e lista as peças. Testes de unidade fora do
  navegador no scratchpad da sessão: `renderMd` (escape-first + citações) roda com
  `eval` do `panel.js`; o acumulador SSE de `claude.js` roda com `fetch` fake devolvendo
  um `ReadableStream` de eventos simulados (chat com citação, `pause_turn`);
  `_findSlashToken`/`_montarTextoEnvio` (gatilho `/` e merge prompt+texto) também saem
  do `eval` do `panel.js`, e `PLIB` roda com um stub de `chrome.storage.sync`
  (get/set/remove + `onChanged` manual). `mdParaArvore` (mapa mental) roda em `vm` com
  stub de `document`/`chrome` — `mapa.js` expõe `window.__mapa` ANTES dos `return` de
  erro justamente para isso; o teste cobre aninhamento por indentação, fences, listas
  numeradas e o **escape de HTML vindo dos autos**.
- **Testar a página do mapa sem PJe**: HTML no scratchpad que stub
  `chrome.storage.session.get` devolvendo `{md, titulo, processo}`, carregue
  `vendor/d3.min.js` + `vendor/markmap-view.js` + `src/mapa.js` e abra com `?id=demo`
  por HTTP local. Atenção ao testar por automação: em aba de segundo plano o
  `visibilityState` fica `hidden` e as transições do d3 congelam — o que se vê na tela
  pode ser um estado intermediário, não um bug de layout.
- **Testar a UI sem PJe**: criar um HTML que stub `window.chrome`
  (`runtime.getURL`, `storage.local.get`, `storage.sync` completo — sem ele a
  biblioteca de prompts fica invisível —, `runtime.connect`) e carregue
  `src/prompts.js` + `src/panel.js`,
  servido por HTTP local (fetch do CSS falha em `file://`). Chamar `PjePanel.mount()`,
  `setConfigured(true)`, `setDocs([...])` com peças fictícias. As APIs `startPrep` /
  `setPrepState` / `endPrep` / `addMessage` permitem simular todo o fluxo visual.
- Para testar no PJe de verdade: recarregar a extensão em `chrome://extensions` e
  recarregar a aba do processo (o content script tem guard `window.__pjeIaLoaded`).

## Categorias de peças (destaque visual)

`CATEGORIAS` em `panel.js` classifica cada título por regex **sobre o texto normalizado
sem acentos** (`norm()`): decisões (dourado), audiências (verde), petições (azul),
provas (violeta), outros (neutro). Cobre o vocabulário criminal (IP, APF, flagrante,
corpo de delito, interrogatório, pronúncia, cota/promoção ministerial, mídia…) e cível
(reconvenção, exceção, acordo, quesitos, estudo psicossocial…). A primeira regra que
casar vence — cuidado com sobreposições, todas testadas no teste de categorias do
scratchpad (58 títulos reais):
- "ata notarial" é prova — lookahead negativo na regra de audiências;
- "cumprimento de sentença" é fase/petição das PARTES — lookbehind negativo em
  `sentenca` na regra de decisões (senão "Impugnação ao Cumprimento de Sentença"
  viraria decisão), e o termo aparece explícito na regra de petições;
- "acordo" (petição) NÃO casa dentro de "acordao" (decisão): o `\b` não existe entre
  "acordo" e o "a" seguinte — seguro manter os dois;
- "mídia" sozinha é prova, mas "mídia da audiência" cai em audiências (regra anterior);
- "manifestação sobre o laudo" é petição (regra de petições vem antes da de provas). As cores vivem em variáveis `--cat-*` no `panel.css` e aparecem na lista
lateral (dot + peso da fonte), nos chips e no popup `@`; a legenda só é exibida no modo
expandido.

## Convenções

- Comentários e strings de UI em português do Brasil (com acentuação correta).
- **Visual: `DESIGN.md` manda.** O parágrafo abaixo é histórico e os valores nele
  estão desatualizados (a paleta migrou para `#12729f`, petições virou roxo e
  provas magenta). Em qualquer conflito, vale o DESIGN.md — tokens, componentes,
  restrições da plataforma e o porquê de as fontes não virem de CDN.
- Identidade visual: paleta do próprio PJe — azul-petróleo `#0078aa` (`--pje`, cor
  da barra do PJe/TJCE), escurecido `#005f88` (`--pje-2`, gradientes/hover/balão do
  usuário — texto branco sobre `#0078aa` puro passa AA por pouco, por isso texto
  longo usa o tom escuro), azul claro `#62a9c7` (`--pje-soft`, medidores), fundos
  frios `#f6f9fb`, títulos em Georgia serif. Variáveis CSS no topo de `panel.css`
  (`.wrap`) e espelhadas em `ui.css` (`:root`, popup/opções/ajuda — HTMLs têm
  referências inline a `var(--pje-2)`). Cores semânticas preservadas: categorias
  `--cat-*`, verde de sucesso, laranja da `.alertbar`/gauge crítico.
- **Escala tipográfica em variáveis** (`--fs-nano|micro|meta|ui|body|lg|lead`, no
  mesmo bloco `.wrap`): sete degraus inteiros no lugar dos 13 tamanhos com
  meios-pixels que existiam antes — variação de tamanho sem intenção é o que faz
  a interface "parecer poluída" mesmo com cada elemento correto. `--fs-nano` (10px)
  é só para numerais e teclas (`.d-id`, `kbd`, sobrescrito da citação). Ritmo
  vertical em `--sp-1..4`. **Não reintroduzir literais de `font-size`** em px no
  painel; `em` relativos (markdown das mensagens) continuam corretos.
- **Rodapé em duas linhas** (`.toolbar` + `.metarow`): a faixa de ferramentas
  perdeu o rótulo `.ctxlab` (os botões se autodescrevem; em 484px ele custava
  ~22% da linha) e recebeu à direita a `.metarow` com medidor, custo, selo do
  modelo e o `ⓘ` — antes eram três blocos empilhados. `.tools` usa
  `flex: 0 1 auto`: com `flex:1;min-width:0` os botões encolhiam abaixo do
  conteúdo e viravam uma coluna de quatro linhas quando a `.metarow` disputava
  espaço. Medidor e custo escrevem **duas versões no DOM** (`.g-full`/`.g-short`,
  escolhidas pelo CSS conforme `.expanded`) — nenhum dado acionável vira só
  tooltip, e a linha não estoura no painel estreito. Os atalhos de teclado
  (`.hint-key`) aparecem com o campo em foco ou enquanto a conversa está vazia
  (classe `.novato` no `.ft`, posta por `showEmptyHint`), com revelação
  `grid-template-rows: 0fr→1fr` (anima sem reservar espaço morto).
- **Popup × página de opções** (`popup.html`, `options.html`, ambos servidos pelo
  MESMO `popup.js`): o popup é o console rápido (largura **460px** — o Chrome
  aceita até 800×600, e com 340 o nome do modelo era cortado no meio) e a página
  de opções é a versão com as explicações longas, aberta pelo link "Configuração
  completa" (`chrome.runtime.openOptionsPage`). Regras que não podem quebrar:
  - **Todo elemento que existe em só uma das páginas é opcional no `popup.js`**
    (`if (el)`): `boxA`/`boxG`/`firstRun`/`abrirOpcoes` são exclusivos do popup e
    quebrariam a página de opções se acessados direto. Os IDs compartilhados
    (`apiKey`, `geminiApiKey`, `model`, `effort`, `customPrompt`, `save`,
    `saveStatus`, `chip`, `chipText`, `togglePw`, `togglePwG`) precisam existir
    **nas duas**.
  - **Progressive disclosure por ESTADO, como no painel**: as chaves são
    `<details class="keybox">` — a que falta para o modelo ativo abre sozinha, a
    que já está salva vira uma linha de estado (cada campo aberto custa ~99px dos
    600px de altura que o popup do Chrome tem). Os passos "Como usar"
    (`#firstRun`) só aparecem enquanto NENHUMA chave foi salva, e o critério é o
    que está **salvo**, não o que está sendo digitado — sumir no meio da
    digitação seria um salto de layout no meio da tarefa.
  - **`.kstate` (ponto + "configurada") não pode ser escopado em `label.field`**:
    no popup o mesmo elemento vive dentro de um `<summary>`. O chip do topo fala
    só do provedor do modelo ativo; são os `.kstate` que dizem o estado das duas
    chaves de uma vez.
- Modelos da API: manter os IDs do `popup.html`/`options.html` alinhados aos aliases
  atuais da Anthropic (`claude-haiku-4-5` é o default em `background.js` — rápido e
  barato; todas as features funcionam nele; a janela menor de 200 mil tokens/100 págs. é o custo
  aceito, com o Sonnet 5 de 1M oferecido para autos volumosos) e do Google
  (`gemini-3.6-flash`, `gemini-3.5-flash-lite` — GA na Interactions API), e a tabela
  `MODEL_CAPS` sincronizada com os docs (limites, versões de tools, thinking/effort).
- Config no `chrome.storage.local`: `apiKey` (Anthropic), `geminiApiKey` (Google),
  `mistralApiKey` + `ocrModel` (extração de peças digitalizadas — NÃO é provedor de chat,
  fica fora de `providerDe`/`chaveDe`),
  `model`, `effort` (baixo/médio/alto — `output_config.effort` na Anthropic, omitido
  nos modelos sem suporte; `generation_config.thinking_level` no Gemini) e
  `customPrompt` (instruções personalizadas do usuário — persona/preferências,
  textarea no popup/options, máx. 4000 chars).
- **Instruções personalizadas** (`customPrompt`): anexadas por `systemPromptAtual()`
  em content.js DEPOIS das regras-base, com rótulo "siga-as no que não conflitar
  com as regras acima" (a âncora de não-invenção permanece autoritativa). Ponto
  ÚNICO de injeção → alcança chat, minuta, mapa e count_tokens nos DOIS
  provedores (Anthropic `system` / Gemini `system_instruction`, repasse verbatim
  do worker). INVARIANTE: campo vazio ⇒ prompt byte a byte idêntico ao padrão
  *dado o mesmo processo e o mesmo dia* (o sufixo de `contextoDoProcesso` — CNJ +
  data — é anterior e independente do `customPrompt`). Editar no meio da conversa só invalida o
  cache de prefixo (sem guarda de "Nova conversa" — o system não faz parte do
  histórico); o `storage.onChanged` atualiza a variável e zera `ultimaChaveEst`,
  e `estimativaLocalTokens` soma o tamanho do texto ao chute do system.
- Alternar o toggle de busca ou trocar de modelo invalida o cache de prompt daquele ponto
  em diante (comportamento aceito). Arquivos enviados à Files API persistem na conta
  (100 GB por organização) — "limpar uploads" é melhoria futura registrada.
