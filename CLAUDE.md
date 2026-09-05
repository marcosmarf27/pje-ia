# PJe IA — Extensão Chrome

> **Mudança de frontend? Leia `DESIGN.md` (raiz do repo) ANTES.** Ele é a fonte
> de verdade do visual — cores, tipografia, escala, raios, sombras e o
> comportamento dos componentes —, derivado do sistema desenhado no Claude
> Design. Valor novo no CSS entra primeiro como token lá, depois no código.

Extensão Chrome (Manifest V3, JavaScript puro, **sem build step**) que adiciona um painel
de chat com IA à tela de autos digitais do PJe. O usuário seleciona peças do
processo e conversa sobre elas; os PDFs são enviados diretamente à API do provedor do
modelo escolhido — **Anthropic (Claude)**, **Google (Gemini)**, **OpenAI (GPT)** ou
**OpenRouter** (agregador: uma chave, centenas de modelos), ver as seções
"Provedor Gemini", "Provedor OpenAI" e "Provedor OpenRouter".

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

**Portão de dialeto (`PJE.dialeto`/`PJE.suportado`)**: tudo acima descreve o PJe
**1.x (JSF/Seam)** — `idProcesso` na querystring, peças como links `123456 - Nome`
em `#divTimeLine`, rotas sob `/{base}/seam/resource/rest/pje-legacy/`. O **PJe KZ**
(frontend novo, base path `pjekz`; relatado no TRT2) não tem nada disso: o id vive
no PATH e a árvore `seam` não existe, então `getIdProcesso()` devolve `null`,
`listarPelaApi`/`listarPelaGrid` saem na PRIMEIRA linha e a lista chega vazia — com
`chaveDoCaso()` nulo, o que ainda desliga a memória de caso. Hoje isso só **se
anuncia** (`panel.setNaoSuportado`: bloco `.naosup` na coluna, degraus e botões da
`.docs-tip` desabilitados, `.sel-nota` suprimida). Regras:
- **Todo caminho de KZ fica ATRÁS do portão**, para os tribunais suportados
  seguirem no ramo `legacy` byte a byte — mesma disciplina do condicionamento por
  `caps` (nunca por nome de modelo) que permitiu somar Gemini e OpenAI.
- **Sinal POSITIVO (o base path), nunca "a lista veio vazia"**: a timeline é lazy,
  e um heurístico de falha acusaria o tribunal legado cuja timeline ainda não
  carregou — trocaria silêncio por afirmação falsa.
- **Não dar fallback genérico ao `getIdProcesso()`** (ler o id do path): `null` ali
  é intencional, e um id adivinhado produziria chave de caso errada (agrupando
  processos distintos) e URL de download inventada. O fallback tem de nascer
  DENTRO do portão.
- **O aviso NÃO pode morar no estado vazio da lista** (foi a 1ª versão, e o teste
  pegou): ele dependeria de a lista chegar vazia — verdade no KZ de hoje, mas
  premissa. Um único link que casasse o padrão da timeline o faria sumir.
- A `.docs` é `flex column` com `max-height: 264px` no flutuante e o `.doclist`
  reserva 96px no `.estreito`: sem `.naosup{flex:0 0 auto}` + `min-height:0` no
  `.doclist`, a faixa estoura e a `.docs-tip` vai parar DENTRO do chat (só a
  captura headless mostra).

Content scripts injetados nesta ordem
(cada um é um IIFE que expõe um global — não há imports entre content scripts):

| Arquivo | Global | Papel |
|---|---|---|
| `src/pje.js` | `PJE` | Acesso ao PJe: lista peças da timeline (`#divTimeLine`), baixa cada uma pelo endpoint REST autenticado por cookie de sessão. |
| `src/caso.js` | `CASO` | Cliente RPC da memória de caso (o banco vive no worker, `casodb.js`). Toda função devolve valor NEUTRO em vez de lançar. Ver "Memória de caso". |
| `src/prompts.js` | `PLIB` | Biblioteca de prompts do usuário: CRUD sobre `chrome.storage.sync` (um item por prompt, `plib:<id>`) + `aoMudar` para propagação entre abas/dispositivos. |
| `src/docx-importar.js` | `DocxImport` | Leitor de `.docx` sem biblioteca (ZIP à mão + `DecompressionStream` + `DOMParser` sobre `word/document.xml`) e leitura em LOTE. Ver "Importar peças-modelo de .docx". |
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
- **Step de busca OCO nunca volta ao histórico, e os de busca são TUDO OU NADA**
  (`ehStepDeBuscaOco`/`stepsParaBlocos`): quando o `interaction.completed` não traz
  os steps, o fallback são os acumulados do `step.start`, que são ESQUELETOS
  (`{id, signature:"", type}` — os deltas preenchem texto e a assinatura do
  thought, nunca as `queries` nem os resultados). Reenviar essa casca é o que
  fazia o 2º turno devolver **400 de corpo vazio**, e como os steps ficam no
  histórico para sempre, desligar a Jurisprudência depois não adiantava — só
  "Nova conversa". Duas armadilhas na guarda: (a) as queries da chamada vivem em
  **`arguments.queries`** (é de lá que o `step.start` as lê para o status), então
  olhar só `s.queries` marcava uma chamada COMPLETA como oca e a jogava fora;
  (b) a decisão é por TURNO, não por step — um `google_search_result` sem o
  `call` que o produziu é um par quebrado, isto é, request malformado do mesmo
  jeito. Cobertos por teste com SSE simulado (fetch fake).
- **`model_output` só é achatado em bloco `text` se for REALMENTE puro**: sem
  `signature`, sem `thought_signature`, **sem `annotations`** (com
  `google_search` é nelas que vêm as `url_citation` da bolha) e com
  `content.length > 0` — `[].every()` é `true` por vacuidade, e um conteúdo
  vazio passava por "texto puro" e sumia do histórico.
- **NÃO logar o `body` do request no console** (gemini.js): durante o diagnóstico
  do 400 ele foi despejado inteiro para ser reproduzido byte a byte — certo ali,
  errado num pacote publicado (carrega trecho dos autos e o base64 das peças que
  não subiram à Files API, e fica retido enquanto o DevTools estiver aberto). O
  que ficou é a linha de FORMA (tipos dos itens + KB), e o corpo é serializado
  UMA vez e reusado no `fetch` — `JSON.stringify` duplicado custa caro de verdade
  no caminho de fallback base64.
- **Erro HTTP: ler o corpo como TEXTO uma vez e só depois `JSON.parse`**
  (`friendlyHttpErrorGemini`). O corpo de uma `Response` só pode ser consumido
  UMA vez: `resp.json()` com `resp.text()` no catch lança "body stream already
  read" e engole justamente o caso não-JSON que o fallback existia para cobrir.
  O Google devolve o erro em DUAS formas — `{error:{message}}` e o ARRAY
  `[{error:{message}}]`; sem tratar a segunda o usuário via só "Erro da API do
  Google (400)". A função foi PARTIDA em `lerCorpoErroGemini` (lê o corpo uma vez
  e devolve a mensagem crua) + `mensagemErroGemini` (status + corpo → português),
  para o stream poder INSPECIONAR o corpo sem reler; `friendlyHttpErrorGemini`
  continua existindo com a assinatura de antes, para os call sites de
  upload/countTokens.
- **`safety_settings` = `BLOCK_NONE` em todas as categorias, com AUTOCURA**
  (`SAFETY_LIVRE` + `safetyGeminiSuportado`). Autos descrevem violência, crimes,
  drogas e abuso — conteúdo jurídico legítimo que o filtro configurável barra por
  padrão. Duas coisas que não podem cair:
  - Isto **não afeta a camada NÃO-configurável** do Google (o "blocked for an
    unspecified policy reason"): ali não há o que desligar, e a saída é trocar
    para um modelo Claude. A mensagem de erro diz isso, com o passo prático — o
    filtro é determinístico pelo conteúdo, então o erro **não é `retryable`**.
  - A autocura reenvia SEM o campo e desliga o recurso pela vida do worker
    quando a API recusa `safety_settings`, e o casamento é **`/safety/i`**, não o
    literal snake_case: a API recusa em pelo menos QUATRO redações — campo
    desconhecido (`Unknown name "safety_settings"`), valor de enum inválido
    (`Unknown value at 'safety_settings[4].category'` — o caso real do
    `HARM_CATEGORY_CIVIC_INTEGRITY`, que nem toda versão conhece), threshold
    restrito (`Safety setting threshold ... restricted`, com espaço e maiúscula)
    e a de hoje, descrita abaixo. Estreitar isso custa caro: um 400 não
    reconhecido deixa a extensão muda na primeira pergunta. O preço do casamento
    largo é, no pior caso, UM reenvio por vida do worker. Coberto por teste com
    `fetch` fake nas redações + o bloqueio de política (que NÃO pode custar um
    segundo envio dos autos).
  - **MEDIDO EM 13/08/2026, com chave real: a Gemini API NÃO ACEITA MAIS
    `safety_settings` — em NENHUM modelo.** A resposta é 400 com
    `The parameter 'safety_settings' is not available on the Gemini API but it is
    available on the Gemini Enterprise Agent Platform.` — quarta redação, e ela
    casa `/safety/i`, então a autocura funciona e o usuário não vê erro. Duas
    consequências: (a) **o afrouxamento do filtro configurável deixou de existir
    de fato** — o que resta é a instrução no prompt e a saída de trocar para um
    modelo Claude, e nenhuma nota da UI deve prometer o contrário; (b) a
    autocura, escrita para um caso RARO, passou a valer para todo request.
  - **Por isso a descoberta é MEMORIZADA em `chrome.storage.session`**
    (`CHAVE_SAFETY_OFF` + `carregarSafetyDaSessao`/`lembrarSafetyIndisponivel`,
    v0.40.1). Com a descoberta só numa variável de módulo, o worker MV3 — que
    morre a cada ~30 s de ociosidade — re-aprendia a cada turno: **400 + reenvio
    do corpo inteiro, quase sempre**. Barato quando as peças vão por `uri` da
    Files API; caro no fallback base64, em que dezenas de MB sobem duas vezes.
    Com a memória de sessão o preço cai para UMA vez por sessão do navegador.
    - **`session` e não `local`**: sobrevive à morte do worker (o que resolve o
      problema) e morre com o navegador — a granularidade certa para re-testar,
      sem lógica de expiração e sem gravar nada permanente no disco do usuário.
    - **NÃO apagar a maquinaria da autocura**, nem trocá-la por um "não mandar
      mais": se o campo voltar a ser aceito, a sessão seguinte volta a mandá-lo
      sozinha, sem release. É o que separa uma memória de um hardcode.
    - **Best-effort dos dois lados**: sem `chrome` (é assim que gemini.js é
      testado fora do navegador) ou com storage que lança, degrada exatamente
      para o comportamento anterior — no pior caso um reenvio. Falha ali não
      pode derrubar um turno, que é o oposto do que a função existe para evitar.
    - Coberto por teste com `fetch` fake que simula a API de hoje (recusa todo
      request com o campo) e recarrega o MÓDULO por query string para simular a
      morte do worker: descoberta+gravação, 2º turno na mesma vida, **worker
      reiniciado lendo da sessão** (o caso que corrige), ausência de `chrome`,
      storage que lança, e o bloqueio de política — que continua não podendo
      custar um segundo envio dos autos.
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
- **Busca**: toggle Jurisprudência no Gemini declara `[{type:"google_search"}]` — a tool
  não aceita parâmetro NENHUM (a doc da Interactions API não expõe `allowed_domains` nem
  filtro por site), então este é o ÚNICO dos três provedores em que a priorização de
  fontes .jus.br depende só de instrução no system prompt — garantia mole, que o modelo
  pode ignorar. Custo: nos modelos **Gemini 3.x a cobrança é POR QUERY EXECUTADA**, não
  por prompt (era por prompt no 2.5), e o modelo dispara várias buscas num mesmo turno —
  o custo de um turno com Jurisprudência ligada é múltiplo do preço unitário. Os valores
  antes anotados aqui (5.000 buscas/mês grátis, depois US$ 14/1.000) não constam da
  página de docs, que remete à tabela de preços: reconferir antes de usar em cálculo.
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
- **Busca**: toggle Jurisprudência na OpenAI declara `[{type:"web_search"}]` — a tool
  embutida da Responses API. Não voltar ao `web_search_preview`: é LEGADO e não aceita
  `filters` (nem `external_web_access`/`return_token_budget`). Aqui a restrição de
  domínios EXISTE, ao contrário do Gemini — e vai em **`filters.allowed_domains`**
  (aninhado), não no topo do objeto como na Anthropic. Trocar o lugar não dá erro
  amigável: ou 400 de campo extra, ou o filtro é ignorado em silêncio e a busca varre a
  web inteira, devolvendo blog no lugar de fonte oficial. Teto de 100 domínios e nomes
  **sem protocolo** (`stf.jus.br`, nunca `https://stf.jus.br/`).
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

## Provedor OpenRouter (Chat Completions) — o agregador

`src/openrouter.js` é o QUARTO irmão de `claude.js`, `gemini.js` e `openai.js`
(os três INTOCADOS): emite o MESMO vocabulário de eventos a partir do SSE da
**Chat Completions API** (`POST https://openrouter.ai/api/v1/chat/completions`,
header `Authorization: Bearer`, formato OpenAI-compatible). `background.js`
despacha por `providerDe(model)` (prefixo **`or:`**); `content.js` e `panel.js`
só condicionam por **caps**, nunca por nome de modelo.

O OpenRouter não é um provedor de modelo: é um **agregador** — uma chave dá
acesso a centenas de modelos de dezenas de fornecedores. É isso que muda o
desenho, e as diferenças abaixo não são detalhes de implementação.

- **NÃO HÁ FILES API NO FLUXO DE CHAT, e este é o fato estruturante.** A Files
  API do OpenRouter existe (beta, ids `or_file_…`), mas os arquivos do workspace
  são consumidos por **containers/sandbox** e pela *files server tool*; a página
  **PDF Inputs** — a autoridade sobre entrada de PDF numa chat completion —
  documenta só `file_data` (URL pública ou data URL). **Conferido em
  01/09/2026.** As peças do PJe também não podem ir por URL: exigem cookie de
  sessão. Logo, **para o modelo que LÊ PDF, o arquivo viaja INLINE em base64,
  em TODO turno** (a API é stateless); **para o modelo que NÃO lê
  (`aceitaPdf:false`), a peça vira TEXTO extraído localmente** — ver "Modelo
  que não lê PDF" abaixo. Consequências, todas por CAP e nenhuma por nome de
  provedor:
  - cap **`filesApi: false`** → `precisaUpload` (content.js) sai na primeira
    linha, `montarBlocos` cai sozinho no ramo base64 (o `fileProvider` nunca
    casa) e `podeAnexar` passa a exigir bytes. Peça vinda da memória de caso só
    com `fileId` é **re-baixada**, que é o comportamento correto.
  - o handler `upload` do worker RECUSA com motivo — rede de segurança para a
    chave do OpenRouter nunca sair num request para `api.anthropic.com`.
  - **`MAX_TOTAL_B64_CHARS_OPENROUTER` (20 MB) não é teto de fallback, é o teto
    do caminho NORMAL.** Conservador porque quem recebe o request no fim é o
    provedor upstream que o OpenRouter escolher, e esse limite ele não publica
    (conferido de novo em 02/09/2026: a doc só diz que existe um 413). O que se
    SABE é o limite dos provedores diretos, por isso a cap **`tetoB64Chars`**
    (`TETO_B64_POR_AUTOR` em openrouter.js: google 15 MB, anthropic 24,
    openai 40) o substitui por autor do slug; sem fonte, vale o padrão. E a
    **mensagem do teto nomeia o modelo e a SAÍDA** (modelo de texto) — sem
    isso "o OpenRouter é inútil num processo de 120 folhas" era a conclusão
    natural, e foi a relatada.
  - **Se um dia o content part aceitar `file_id`, o ponto de mudança é ÚNICO**:
    `montarBlocos` já prefere `d.fileId` quando `d.fileProvider` casa — basta a
    cap deixar de ser `false`. A nota existe para essa porta ficar aberta sem
    que ninguém precise redescobrir o caminho.
- **MODELO QUE NÃO LÊ PDF (OU IMAGEM) RECEBE O TEXTO EXTRAÍDO AQUI**
  (`precisaTextoLocal` + `entradaTextoLocal` + `extrairTextoLote` + `textoCache`
  em content.js, v0.56.0). Caso real que abriu a rodada: processo de 34 peças e
  120 folhas digitalizadas, "~22 MB — acima do limite" num DeepSeek de 1,3
  milhão de tokens. Para um modelo de texto mandar o arquivo não compra NADA:
  o OpenRouter o converte antes de entregar (engine `cloudflare-ai`, que **não
  faz OCR** — a folha digitalizada chega vazia) e o corpo carrega 20 MB de
  base64 que o modelo nunca vê. Agora o texto sai do pdf.js (camada de texto)
  e do PP-OCR local (folha digitalizada) — o MESMO caminho do modo sigiloso,
  sem a máscara — e vai como bloco `document` de texto: ~3 KB por folha em vez
  de ~140 KB. Regras:
  - **Decidido POR CAP** (`aceitaPdf === false` para PDF, `aceitaImagem ===
    false` para imagem — só o `false` EXPLÍCITO): os provedores diretos seguem
    byte a byte. O sigilo tem precedência (`entradaDoc` devolve o mascarado
    antes de olhar isto).
  - **Mesmo funil do sigilo** (`baixarSelecionadas`, depois do bloco do sigilo)
    e o gancho dos ANEXOS do input no `onSend` (eles não passam pelo funil).
    `entradaDoc` **falha fechada**: sem texto extraído a peça não vai — o
    arquivo nunca é a saída certa para quem não o lê. Falha de extração vira
    item de `falhas` com `texto:true` e motivo próprio, nunca "falha de
    download" nem "expirou no provedor" (`semConteudo` distingue).
  - **`textoDaPeca` é o ponto ÚNICO da extração**, cacheado em `textoCache` (no
    TOPO do IIFE, junto do `sigiloCache`, pela zona morta temporal: a
    estimativa o lê do callback de seleção). Uma extração por peça e por
    sessão: trocar de modo ou de modelo não refaz o OCR; o sigilo mascara o
    texto já extraído. Folha cujo OCR FALHOU não fixa o cache (a falha pode ser
    transitória; `MARCA_OCR_FALHOU`).
  - **`CAPS_OR_PADRAO` tem `aceitaPdf:false`**: catálogo fora do ar ⇒ um modelo
    nativo recebe texto naquela sessão. Degradação aceita — erra para o lado
    que funciona em qualquer modelo.
  - **`tetoTextoDe` passou a cortar SÓ quando a soma não cabe** no orçamento
    (0,55 × janela): dividir por N cortava a inicial de 40 folhas com 34 peças
    ocupando 8% da janela. Se não cabe, vale a repartição de antes.
  - **`estimativaLocalTokens` mede o TEXTO** (via `entradaParaMedir`) assim que
    ele existe; antes, páginas × `tokensPagina`. O `maxPages` não se aplica ao
    texto (`paginasDe` conta só `kind:"pdf"`); a guarda por tokens continua.
  - O rótulo do grupo do conversor mudou para "o texto do PDF é extraído no
    seu computador", e "NÃO lê imagens" ganhou "fotos entram por OCR local".
  - Coberto por `t-texto-local.mjs` (jsdom, content.js real): modelo de texto
    (nenhum base64, OCR local rodou, `## Página n` no bloco), NÃO-REGRESSÃO do
    modelo nativo (base64 como sempre, zero OCR), PDF de 25 MB passando no
    modelo de texto e barrado no nativo com a mensagem que aponta a saída.
- **NÃO HÁ CONTAGEM DE TOKENS.** Nenhum análogo ao `count_tokens` da Anthropic
  ou ao `/responses/input_tokens` da OpenAI. Cap **`contagemTokens: false`**, e
  o worker responde `{tokens: null, semContagem: true, contextTokens}` em vez de
  erro — devolver erro funcionaria (o chamador já tolera falha) mas encheria o
  console de ruído a cada turno e perderia a chance de dizer que a ausência é do
  PROVEDOR. A guarda de 90% **continua existindo**, por
  `guardaPorEstimativa` (content.js): mesmo limiar, calculado sobre
  `max(ultimoTotalExato, estimativaLocalTokens(ids))` — a MESMA conta do
  `podePularPreVoo`. Do 2º turno em diante o número é exato, porque o `usage`
  do turno anterior é exato e vem de graça. **A mensagem de erro diz que é
  estimativa**: afirmar "94% do contexto" sobre um chute seria dar precisão que
  o número não tem, e é com base nessa frase que o usuário decide o que
  desmarcar. Os QUATRO chamadores passam `opts.ids` — o mesmo conjunto do
  `guardaPaginas` daquele caminho.
- **O CUSTO VEM MEDIDO, não calculado.** `usage.cost` é o valor real debitado
  em créditos (US$) e vem em toda resposta, sem precisar pedir. `executarTurno`
  prefere `final.custoUsd` quando o cliente o traz e só cai em `custoUsdDe` para
  os outros três. É isso que torna sustentável oferecer centenas de modelos:
  **não há tabela de preços a manter**.
- **`aceitaImagem` era uma cap ESCRITA E NUNCA LIDA, e passou a valer.** Ela
  existia em `background.js` e em `openrouter.js` e nenhum consumidor a
  consultava — inofensiva enquanto todo modelo ofertado era multimodal, e um
  defeito no instante em que a lista ganhou um modelo de **texto puro** (os mais
  baratos do catálogo são assim). O anexo em imagem é PROVA de primeira classe
  aqui (foto do BO, print de conversa), e mandá-lo a quem não o lê dá 400 — ou,
  pior, o silêncio de um provedor que descarta a parte que não entende, e o
  modelo responde sobre uma prova que nunca viu. Hoje `montarBlocos` barra
  quando `modelCaps.aceitaImagem === false` (só o `false` EXPLÍCITO: `undefined`
  — os três provedores diretos — segue passando byte a byte). Duas regras:
  - **O par rótulo+imagem é indivisível.** O `continue` acontece ANTES de os
    dois blocos entrarem, senão sobraria "[Peça anexada como imagem: …]"
    anunciando ao modelo um anexo que não foi — o oposto do que aquele rótulo
    existe para fazer.
  - **Canal PRÓPRIO de aviso (`semSuporte`), não o `semConteudo`.** Aquele diz
    "o envio anterior expirou · envie de novo", e as duas metades seriam falsas:
    reenviar falharia igual, e o que resolve é trocar de modelo. Mesma razão que
    separou `semConteudo` das falhas de download.
- **SMOKE TEST REAL, 01/09/2026 (chave de teste do usuário).** O que só um turno
  de verdade responde, e três coisas surpreenderam:
  - **`data_collection:"deny"` NÃO deixou nenhum modelo sem provedor.** Era o
    risco em aberto, e ele não se materializou: responderam Luna, Grok 4.20,
    **DeepSeek V4 Flash (17 provedores, quase todos terceiros)** e **GLM 5.3
    Flash (22)**. A mensagem do 503 continua valendo como rede, mas o cenário é
    menos provável do que a contagem de provedores sugeria.
  - **O `usage` da OpenAI via OpenRouter NÃO conta os tokens do arquivo.**
    `prompt_tokens: 3` para um PDF de 12 páginas que o modelo LEU (acertou uma
    linha com número aleatório de dentro dele). O **custo vem correto** — 2p→12p
    multiplicou por 5,1, exatamente como no Gemini, cujo usage é fiel. Por isso
    `atualizarGaugePosTurno` passou a usar `max(usage, estimativaLocal)` quando
    `contagemTokens === false`: tratar aquele 3 como medição exata faria o
    medidor cair para ~0% logo depois de um turno com centenas de folhas e
    gravaria um `ultimoTotalExato` ridículo. Onde o usage é fiel os dois
    coincidem (6408 medidos contra 6384 estimados em 12 folhas).
  - **PDF: os SEIS modelos testados leram**, nos dois grupos — inclusive
    DeepSeek e GLM pela engine gratuita `cloudflare-ai`. O caminho de PDF da
    extensão (bloco `document` → `traduzirHistorico` → `file_data`) funciona de
    ponta a ponta.
  - **A armadilha do `testarChave` confirmada empiricamente**: com uma chave
    INVENTADA, `/api/v1/key` devolve **401** e `/api/v1/models` devolve **200**.
  - Busca web: a tool disparou, a citação voltou e a fonte ficou DENTRO da
    allowlist (`processo.stj.jus.br`). Custa ~US$ 0,012 por turno (o catálogo
    publica `pricing.web_search`), a mesma ordem dos outros provedores.
  - Round-trip do raciocínio: o `x-openrouter-item` volta e o 2º turno responde
    certo; **trocar de modelo dentro do OpenRouter no meio da conversa também
    funciona** (o guard omite o `reasoning_details` e o texto viaja) — a decisão
    de não usar `conversaProvider` aqui está validada.
- **`tokensPagina` é a ÚNICA cap que NÃO vem do catálogo, e ela existe por causa
  da ausência de count_tokens.** O catálogo publica preço e janela, mas não diz
  quantos tokens uma página de PDF consome — e esse número varia 8× entre
  famílias (Anthropic ≈ 2000, Google = 258). Nos outros três provedores errar
  ali é inofensivo: o `count_tokens` corrige antes da guarda. Aqui a guarda roda
  sobre `max(ultimoTotalExato, estimativaLocal)`, e **o `max()` faz um chute alto
  nunca ser desmentido — nem pelo usage exato do turno anterior**. Com os
  2000/página do padrão, um `or:google/gemini-3.7-flash` (1M) seria barrado em
  ~450 folhas que ocupam **12%** da janela real: recusa antecipada em cima do
  caso de uso principal do produto. `TOKENS_PAGINA_POR_AUTOR` (openrouter.js)
  resolve por autor do slug, e a regra para mexer nela é dura: **só entra número
  com FONTE**. O 258 do Google é o mesmo que `MODEL_CAPS` já usa no Gemini
  direto — não é dado novo, é o mesmo modelo por outro caminho. Sem fonte, o
  campo fica AUSENTE (`undefined`) e vale o padrão do content.js, que erra para
  o lado seguro. Um campo presente com valor errado é pior que ausente.
  **E a FONTE pode ser a medição, não a doc**: o valor do Google aqui é **532**,
  medido três vezes com chave real e PDFs de densidade diferente (não muda com o
  conteúdo — o Gemini cobra a PÁGINA). A documentação diz 258, e é o que
  `MODEL_CAPS` usa no caminho DIRETO; pela rota do OpenRouter é o dobro. Não
  ajustar um pelo outro: são caminhos distintos, medidos separadamente.
- **NENHUM modelo do OpenRouter entra em `MODEL_CAPS`, e isso é decisão.** As
  caps vêm do **catálogo público** (`GET /api/v1/model/{autor}/{slug}`, sem
  chave), sob demanda, cacheadas em `chrome.storage.session` (`orcaps:<slug>` +
  `VERSAO_CAPS_OR`). Escrever janela/preço/“aceita PDF?” à mão para modelos de
  terceiros criaria a pior espécie de dado — o que envelhece calado e faz a
  extensão barrar um envio que caberia. Regras:
  - `garantirCapsOR(model)` é chamada no TOPO dos handlers que já eram async
    (`caps`, `countTokens`, `executarTurno`), o que deixa **`capsDe` síncrona**
    como sempre foi. Torná-la async espalharia `await` por `sugestaoRedacao` e
    `modeloDoTurno`, que são puros.
  - Falha do catálogo é **best-effort**: cai no `CAPS_OR_PADRAO` conservador e
    **não é cacheada** (a próxima tentativa reconsulta). Cada campo do default
    erra para o lado barato: janela pequena barra cedo; `aceitaPdf:false` manda
    o PDF pelo conversor gratuito, que funciona em qualquer modelo; `effort:false`
    não manda um parâmetro que o modelo pode recusar.
  - `session` e não `local`: o catálogo muda (preço, janela, modelo novo) e uma
    sessão do navegador é a granularidade certa para reconsultar — mesma
    disciplina da memória do `safety_settings` do Gemini.
  - A lista curada de modelos existe **só na UI** (os `<option>`), e o
    `<option value="or:*">` abre o campo livre. `modeloConhecido(id)` responde
    pelo FORMATO (`^or:[^/]+/…$`), não por tabela.
  - **A lista curada tem TRÊS GRUPOS (`data-pdf` no `<optgroup>`), e a fronteira
    entre os dois primeiros é COMO O PDF CHEGA ao modelo.** `nativo`: o modelo lê
    o arquivo (`input_modalities` tem `file`) e recebe a página como PÁGINA.
    `conversor`: o modelo é de texto e o OpenRouter converte antes, de graça
    (`ENGINE_PDF_CONVERSOR`) — custa 10× a 25× menos e **perde a imagem da
    página**, então peça digitalizada sai vazia (o caminho dela é o OCR local).
    `livre`: só o marcador `or:*`, que não afirma nada.
    - **Exigir PDF nativo de TODA a lista foi a primeira versão, e era exigir
      demais**: os modelos mais baratos do catálogo (DeepSeek V4 Flash 0731 a
      US$ 0,065/0,18, GLM 5.3 Flash a 0,075/0,25, os dois com 1,31M) são de
      texto — e desde a v0.56.0 é a EXTENSÃO que extrai o texto para eles (ver
      "Modelo que não lê PDF"), não o conversor do provedor. ARMADILHA do
      catálogo: o slug curto `deepseek/deepseek-v4-flash` aponta para a revisão
      VELHA (0423, 1M, mais cara); a nova tem sufixo de data
      (`deepseek-v4-flash-0731`, 1,31M). O alias `~deepseek/…-latest` não serve:
      o `~` não passa em `modeloConhecido`. O que muda não é "funciona ou
      não", é a qualidade do que chega — e isso é escolha do usuário, desde que
      o rótulo diga. Por isso o grupo do conversor promete sobre IMAGEM no
      rótulo ("lê imagens" / "NÃO lê imagens"): é a diferença que se sente, e o
      teste confere a promessa contra o catálogo.
    - Comum aos dois: **janela ≥ 1M** e **servido pelo fabricante ou por nuvem
      grande**. O segundo não é preciosismo: com `data_collection:"deny"` em
      todo request, modelo servido só por terceiros pode ficar **sem provedor
      elegível** (o 503).
    - **O critério virou teste porque já falhou**: a v0.54.0 nasceu com
      `x-ai/grok-4.6` rotulado "1M tokens" tendo **500 mil** — eu verifiquei que
      o slug EXISTIA, não o tamanho. `t-curadoria.mjs` lê os `<option>` do HTML
      real e revalida tudo contra a API pública, inclusive que nenhum rótulo
      promete mais janela do que o modelo tem.
- **O prefixo `or:` no id, e não a barra do slug.** Os dois funcionariam hoje —
  nenhum id direto de Anthropic, Google ou OpenAI tem barra —, mas o prefixo
  mantém `providerDe` como o que ela sempre foi (uma tabela de prefixos) e faz
  um id do OpenRouter se identificar sozinho no storage, sem depender de uma
  propriedade do formato de OUTRO fornecedor continuar valendo. `slugOpenRouter`
  é o ponto ÚNICO da tradução.
- **Trocar de modelo DENTRO do OpenRouter é permitido — e é a razão de o bloco
  de raciocínio carregar o `model`.** `conversaProvider` seria grosso demais
  aqui: um agregador hospeda Claude, Gemini e GPT sob o mesmo nome de provedor,
  então trocar de modelo lá dentro trocaria o formato do raciocínio sem que a
  guarda percebesse. O cliente grava `{type:"x-openrouter-item", model, raw}` e
  **só devolve `reasoning_details` quando o modelo do turno é o mesmo que os
  produziu** — o TEXTO do histórico é portável entre modelos, o raciocínio não.
  O `model` gravado é o que a RESPOSTA reportou (com fallback de modelo o
  OpenRouter pode ter atendido por outro). Omitir o `reasoning_details` do
  reenvio é SEMPRE seguro: nada quebra, perde-se contexto de raciocínio — é a
  saída de emergência se algum provedor passar a recusar o formato.
- **`provider: {data_collection: "deny"}` em TODO request.** Quem escolhe o
  provedor final é o OpenRouter, e parte deles armazena os prompts para treino.
  Aqui trafegam AUTOS. É este campo que mantém verdadeira a promessa da caixa de
  privacidade e o que o art. 19 da Res. CNJ 615 cobra de quem usa IA externa.
  O preço: pode não sobrar provedor elegível para um modelo, e aí a API responde
  **503** — por isso a mensagem daquele status **cita a política pelo nome**,
  senão o usuário vê "sem provedor" num modelo que a página do OpenRouter mostra
  disponível e não tem como ligar a causa ao efeito.
- **Compressão de contexto DESLIGADA explicitamente**
  (`plugins:[{id:"context-compression", enabled:false}]`). O OpenRouter só a liga
  por padrão em endpoints de ≤ 8k de contexto — nenhum que interesse aqui —, mas
  o que ela faz é DESCARTAR o meio do prompt quando não cabe: num pacote de autos
  isso é perder peças em silêncio. Uma linha para nunca depender do default.
- **Motor de PDF escolhido pela CAP, nunca pelo default**
  (`plugins:[{id:"file-parser", pdf:{engine}}]`): `native` quando o catálogo diz
  que o modelo aceita arquivo, `cloudflare-ai` (gratuito) quando não. **O padrão
  do OpenRouter é o `mistral-ocr`, que é PAGO** (US$ 2 por 1.000 páginas) e
  reparseia a CADA turno — num processo de 300 folhas seriam US$ 0,60 por
  mensagem, cobrados sem ninguém ter pedido. As constantes `ENGINE_PDF_NATIVO`/
  `ENGINE_PDF_CONVERSOR` são EXPORTADAS pelo cliente: quem decide é o worker
  (tem as caps), quem sabe o nome que a API espera é o cliente.
- **SEM `max_tokens`, e isto INVERTE a regra dos clientes Gemini e OpenAI** (que
  o mandam sempre explícito). Aqui ele não protege: o roteador só encaminha a
  provedores capazes de devolver o tamanho pedido, então um teto generoso
  **restringe o roteamento** — pode sobrar menos provedor, ou nenhum. Resposta
  cortada continua sinalizada por `finish_reason:"length"` → `{kind:"trunc"}`.
- **ERRO NO MEIO DO STREAM CHEGA COM HTTP 200** (os headers já foram enviados):
  `{"error":{...},"choices":[{"finish_reason":"error"}]}`. Um 200 que só traz
  erro é FALHA — tratá-lo como sucesso entregaria uma bolha em branco. E as
  linhas de comentário SSE `: OPENROUTER PROCESSING` (keep-alive) precisam ser
  puladas antes do `JSON.parse`: sem isso o stream morre no primeiro keep-alive
  de um turno longo, que é justamente o caso dos autos grandes.
- **`testarChave` usa `GET /api/v1/key`, NUNCA a listagem de modelos.** Nos três
  provedores diretos o endpoint de validação é o de listagem, que lá exige
  credencial. **No OpenRouter a listagem é PÚBLICA** — responde 200 para
  qualquer coisa no header, inclusive nada. Copiar o padrão daria "Chave
  válida." para uma chave inventada, e o erro só apareceria no primeiro turno,
  disfarçado de falha da API.
- **Busca**: o toggle Jurisprudência declara o MESMO shape da OpenAI em
  `toolsBusca` (`{type:"web_search", filters:{allowed_domains}}`) e a tradução
  para o dialeto do provedor (um `plugin` de id `"web"`, não uma tool) mora no
  cliente. A allowlist aqui é garantia **MOLE**: a doc diz que o suporte a
  `include_domains` "varia por engine", e quem escolhe a engine é o OpenRouter —
  mesma situação do `google_search` do Gemini.
- **Sem citações por página** (`citacoesNativas:false`, como Gemini e OpenAI): o
  `SYSTEM_PROMPT_CIT_TEXTUAL` manda citar peça e folha no próprio texto e a UI
  mostra o `ⓘ`. As annotations `url_citation` viram citações web normais, ao
  vivo; as annotations do tipo `file` (resultado do file-parser, que poderia ser
  reenviado para não re-parsear) são ignoradas nesta versão.
- **O selo do modelo lê `caps.nome`** (`Anthropic: Claude Sonnet 4.5`, publicado
  pelo catálogo) antes da tabela `NOMES_MODELO` do painel — são centenas de
  modelos de terceiros, e sem isso o selo mostraria `or:anthropic/claude-sonnet-4.5`
  cru num elemento cujo trabalho é dizer, na língua do usuário, quem respondeu.
- **Config**: chave em `chrome.storage.local.openrouterApiKey`; o modelo continua
  no campo `model` (o campo livre **não cria estado novo**). O `Salvar` recusa o
  marcador `or:*` sem identificador e **não grava nada** nesse caso — a tela fica
  como está e nada do que o usuário digitou se perde. Ele aceita o slug puro, com
  prefixo, ou a URL da página do modelo, e devolve o campo normalizado.
  `manifest.json` inclui `https://openrouter.ai/*`.

## Prioridade das fontes na busca web (os quatro provedores)

As fontes da busca vivem em **três degraus** (`content.js`): `FONTES_SUPERIORES`
(STF, STJ) → `FONTES_TRIBUNAL` (o tribunal deste processo, derivado da URL) →
`FONTES_DEMAIS`. Num parecer "o STJ decidiu" e "um blog noticiou" não pesam igual,
e até a v0.23 as dez fontes eram tratadas como equivalentes.

- **A união dos degraus é o `allowed_domains`; a ORDEM é o `PROMPT_BUSCA`.**
  `allowed_domains` é binário (dentro/fora) e nenhuma das três APIs tem parâmetro
  de ranking — só o prompt expressa prioridade. Por isso `PROMPT_BUSCA` é um
  trecho próprio, concatenado nos **DOIS** system prompts: antes disso a instrução
  de busca existia só no `SYSTEM_PROMPT_CIT_TEXTUAL` e o caminho **Anthropic não
  tinha instrução nenhuma** sobre fontes.
- **`TRIBUNAL_DO_PROCESSO` é derivado no TOPO do IIFE**, não junto da lista de
  domínios: o `PROMPT_BUSCA` o consome ~150 linhas antes, e declará-lo depois
  lançaria `Cannot access before initialization` na montagem (a zona morta
  temporal descrita em "Desenvolvimento e teste").
- **`tjce.jus.br` deixou de ser hardcoded**: entra pelo 2º degrau quando o processo
  é do TJCE. Num processo do TRF5, jurisprudência do TJCE é ruído.
- **A garantia é desigual por provedor, e isso é estrutural**: Anthropic e OpenAI
  aplicam a allowlist no servidor (garantia dura); o Gemini não tem o recurso e
  depende só da instrução (garantia mole); no OpenRouter o filtro existe
  (`include_domains`) mas o suporte **varia por engine**, e quem escolhe a
  engine é ele — garantia mole também. Medido em smoke test real: com o
  `PROMPT_BUSCA` em degraus o Gemini passou a emitir queries com `site stj jus br`,
  mas ainda citou `tjro.jus.br` num processo do TJCE. **Não tentar "consertar" isso
  na API** — não há como; o que existe é tornar o vazamento VISÍVEL na bolha.
- **O host da fonte nem sempre sai da URL** (`hostDaFonte`): o Gemini devolve um
  redirecionador opaco (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`)
  e põe o domínio verdadeiro no `title`. Sem essa resolução o rodapé anunciaria
  "google.com" numa resposta cuja fonte é o STJ, e todo nível cairia em "outra". O
  `title` só vira host quando ELE é um domínio — na Anthropic e na OpenAI o title é
  a manchete da página, e usá-lo ali seria inventar origem.
- **Peça dos autos e fonte da web são grupos SEPARADOS no rodapé da bolha**
  (`updateAssistant`): uma é prova no processo, a outra é página da internet, e
  misturá-las apagava a fronteira que mais importa juridicamente. O número do
  rodapé é o MESMO do sobrescrito no texto (placeholder PUA → `<sup>`), então o
  agrupamento **não reordena nada** — mexer na ordem quebraria a correspondência
  entre a marca na frase e a linha da fonte.

## Invariantes importantes

- **`onMinuta` e `onMapa` NÃO são `async` no topo, e isso não é estilo.** As guardas de
  entrada (`busy`, `ocupadoJsf()`, seleção vazia, orientação faltando) precisam devolver
  **`false` de forma SÍNCRONA**, porque é assim que o painel sabe que a recusa aconteceu
  e preserva a instrução digitada, a categoria de modelos e a tese. Num handler `async`,
  `return false` vira `Promise.resolve(false)` e o teste `=== false` no `doSend` nunca
  casa — o estado do usuário é destruído do mesmo jeito, em silêncio. O trabalho de
  verdade vai em `minutarAgora`/`mapearAgora`, funções async chamadas depois das guardas.
  Antes disso o `doSend` limpava o campo, soltava o chip e desligava o modo **antes** de
  saber se o content aceitara: com o PJe ocupado, o usuário perdia tudo o que escreveu.
  (`ocupadoJsf()` já escrevia o motivo no status; o defeito era a ORDEM. O `busy` puro,
  esse sim, voltava mudo — agora escreve.)
- **As guardas de "marque ao menos uma peça" usam `selecaoEfetivaPainel()`**
  (checkboxes + `selPendente`), nunca `getSelected()` puro. A timeline do PJe é lazy:
  num processo retomado da memória as rows não existem no DOM, e a guarda recusava o
  gesto com os chips do contexto na tela mostrando as peças marcadas. O `content.js` já
  tinha a defesa (`selecaoEfetiva`), mas ela nunca era alcançada — a recusa acontecia
  antes, no painel. Vale para minuta **e** mapa, no botão e no envio.
- **Minuta e mapa passam `optsDoTurno()` ao `stream` e ao pré-voo.** Sem isso,
  "Jurisprudência ligada + Gerar minuta" produzia uma minuta **sem busca**, com o toggle
  aceso e nada na tela dizendo. Os dois também chamam `estimarContexto` (que LANÇA acima
  de 90% da janela, com `err.ctxCheio`): antes só o chat tinha pré-voo, e autos grandes
  somados a até 12 peças-modelo voltavam como erro cru da API.
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
- **O upload é PIPELINADO ao download** (bomba dentro de `baixarSelecionadas`): cada
  peça começa a subir assim que ELA baixa, em vez de esperar a fila inteira — o turno
  passa de `Σdownload + Σupload` para `Σdownload + o upload da última`. A bomba mora
  ali, e não no handler de envio, porque existem TRÊS pares baixar→subir idênticos
  (chat, minuta e mapa): assim os três ganham o pipeline sem mudar os call sites.
  Invariantes que não podem cair:
  - **UM LOTE POR VEZ** (flag `bombeando`). O cache de upload do worker é
    read-then-write: duas chamadas simultâneas com a mesma `cacheKey` erram o cache
    as duas e sobem o arquivo duas vezes.
  - **`try/catch` em volta de cada lote.** Uma rejeição não tratada se propagaria
    pelo `await cadeiaUpload` e derrubaria o turno inteiro por causa de um upload — o
    oposto do design, em que falha de upload só devolve a peça ao fallback base64.
  - **`await cadeiaUpload` antes de devolver** `{ok, falhas}`. Sem isso o chamador
    seguiria para o seu próprio `subirPecas` com uploads em voo, e voltaria a corrida.
  - Os `await subirPecas(...)` que ficaram nos call sites viram no-ops para quem
    subiu e uma SEGUNDA tentativa para quem falhou — intencional (429 por rate limit
    costuma passar em segundos); no máximo duas tentativas por peça e por turno.
  - `guardaPaginas` passa a rodar DEPOIS dos uploads. Aceito: os `fileId` ficam em
    `chrome.storage.session` e viram prefetch, `refinarContexto` já subia sem guarda
    de páginas, e `paginasDe` depende do `d.pages` que só existe após o download.
  - `baixarQuieto` (medição de fundo) fica FORA do pipeline: é cancelável por
    `estSeq`/`busy` entre awaits, e uploads em voo depois do cancelamento
    reintroduziriam a corrida sem ninguém para aguardá-los.
- **Pré-voo (`count_tokens`) CONDICIONAL** (`podePularPreVoo`): num turno sem peça
  nova ele é o ÚNICO bloqueio antes do stream, isto é, 100% do tempo percebido entre
  o Enter e o primeiro token. Ele existe para barrar acima de 90% da janela — quando
  o turno anterior deixou uma medição EXATA (`ultimoTotalExato`, o usage do último
  request físico, que vem de graça) e o maior entre ela e a estimativa local fica
  abaixo de `LIMIAR_PULAR_PREVOO` (60% da janela), não há o que barrar. Guardas: sem
  medição exata anterior (1º turno) mede; peça selecionada FORA do cache mede (o que
  não é medido não pode ser dispensado da medição). A guarda de 90% e o tratamento de
  `model_context_window_exceeded` seguem como rede.
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
  `chave|principais|todas`), popup `@` e mensagens são
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
  mesma view.
  **O poll sonda a MESMA rota que o download vai usar** — `urlsDownload(id)[0]`, a
  completa. Sondar a curta era um defeito silencioso e caro: ela responde 200 com
  casca vazia em toda peça HTML (decisões, despachos, petições do editor), então
  `probe.ok` ficava verdadeiro no primeiro poll e a ativação DESISTIA em 700 ms em vez
  de esperar os ~5,6 s — e o erro final era "a peça retornou vazia", exatamente a
  falha que a ativação existe para resolver, justamente nas peças que mais importam.
  Com `HEAD` não dá para distinguir casca de conteúdo (não há corpo), então a
  correção é a ROTA, não o critério. A ativação depende de a peça estar NA TIMELINE, o que pode não valer para
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
- **O que NÃO é um dos três formatos NUNCA é "lido como texto"** (`IMAGENS`/
  `ASSINATURAS`/`tipoImagem`/`tipoBinario`/`pareceBinario` em `pje.js`): o PJe aceita
  anexo de qualquer tipo — foto de celular, print, .docx, áudio da audiência — e
  `blob.text()` decodifica QUALQUER byte sem reclamar. Sem essa barreira, um JPEG
  anexado chegava ao modelo como `���JFIF…`: milhares de tokens de lixo binário
  no lugar do conteúdo, com o selo da lista dizendo **TEXTO** (caso real: peças
  184100639/184100640). É o mesmo defeito que a assinatura do `%PDF-` já evitava, nos
  formatos que faltavam. Duas camadas de detecção: tabela de assinaturas e, para o
  binário sem assinatura catalogada, densidade de caracteres de **controle C0** > 2%.
  O critério é o controle, e **não** o `U+FFFD`: HTML servido em ISO-8859-1 sem charset
  no header chega com um replacement POR ACENTO (petição → peti�ão) e é texto legítimo
  — barrá-lo derrubaria peças que sempre funcionaram (caso coberto no teste do
  scratchpad). Duas saídas, e a diferença é o que dá para fazer com o arquivo:
  - **IMAGEM (JPEG/PNG/GIF/WebP) vira `{kind:"img"}` e VAI para o modelo como
    imagem** — ver a seção "Anexos em imagem" abaixo. Só os quatro formatos que os
    três provedores aceitam em comum entram aqui; **BMP e TIFF** (que aparecem em
    scanner de cartório) nenhum deles lê, então ficam na lista de recusa — mandar e
    tomar 400 seria pior que dizer o motivo.
  - **O resto é RECUSADO com o motivo** (.docx/.zip, OLE2, áudio/vídeo, formato de
    scanner exótico). `lerCorpo` **lança** em vez de devolver `null`: `null` significa
    "esta rota não serviu" e faria `baixar` gastar a ativação JSF (~5,6 s, serializada)
    para terminar dizendo "a peça retornou vazia", que é falso — ela veio inteira. O
    erro sobe para o relatório de peças que não entraram, no chat.
- **Anexos em imagem vão para o modelo COMO IMAGEM** (`kind:"img"` em `lerCorpo`,
  ramo próprio em `montarBlocos`): o BO fotografado, o print de conversa e o
  comprovante são PROVA, e são o anexo mais comum depois do PDF. Regras:
  - **DOIS blocos por peça, e o de texto não é enfeite**: a Citations API não cita
    imagem (não há página nem trecho), então o rótulo `[Peça anexada como imagem:
    <título>]` é o ÚNICO canal pelo qual o **id** chega ao modelo — a regra
    peça·id·folha vale aqui como nas outras saídas. Os dois blocos levam `__pecaId`:
    desmarcar a peça tem de remover o par inteiro, senão sobra um rótulo anunciando
    um anexo que não foi.
  - **Redimensionada no navegador antes de sair** (`normalizarImagem`, `createImageBitmap`
    + `OffscreenCanvas`, sem biblioteca): teto de 1568px no lado maior (acima disso a
    API reduz do lado dela antes de tokenizar, então mandar maior só gasta payload) e
    ~3,5 MB. Foto de celular tem 4–12 MP: reduzir é o que separa "a peça entra na
    análise" de um 400. Falha na redução **não é fatal** — devolve o blob original e
    quem decide é o teto. As dimensões voltam junto porque é delas que sai a estimativa
    de tokens (`tokensImagem`, largura × altura / 750).
  - **Base64 inline nos três provedores, sem Files API**: imagens são pequenas perto de
    um PDF de autos, e o upload multiplicaria a superfície de erro por três. Cada
    cliente traduz do bloco Anthropic (`{type:"image", source:{type:"base64"}}`) para o
    seu: Gemini → content part `{type:"image", data, mime_type}` (irmão do `document`,
    não uma variante dele); OpenAI → `{type:"input_image", image_url:"data:…;base64,…"}`.
    `claude.js` segue INTOCADO — o bloco já é o formato nativo dele.
  - **Imagem não entra na guarda de `maxPages`**: aquele teto é de páginas de PDF por
    request, não de anexos (a Anthropic aceita até 100 imagens). Somá-la ali faria um
    processo com 30 fotos e 2 PDFs bater num limite que ele não bateu.
  - No `.zip` sai como `.jpeg`/`.png` — o `fmt` guarda o formato de ORIGEM mesmo quando
    a redução converte para JPEG, e a tabela `EXTENSAO` do `exportar.js` PRECISA ter
    esses formatos: sem eles o `|| ".txt"` do fim fazia a foto sair do pacote como um
    `.txt` de lixo binário. No preview aparece por `data:` URI — **não `blob:`**, que a
    CSP de alguns tribunais barra.
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
  marcadas), a medição completa não roda — a ativação JSF do PJe é serializada e
  levaria minutos. Em vez de parar por completo, entra o **prefetch progressivo**
  (`prefetchProgressivo`): baixa em lotes de `LOTE_PREFETCH` (4), **em ordem de
  relevância** (essencial → relevante → neutro → ruído), cedendo a `busy`, `estSeq` e
  `exportando` ANTES de cada lote. Motivo: o usuário leva de meio a um minuto
  escrevendo a pergunta, e esse tempo era desperdiçado — o envio pagava a fila inteira
  do zero. Ordenar por relevância importa porque, se ele interromper, o que já baixou
  é justamente o que o envio vai pedir primeiro. Ceder é obrigatório: o prefetch
  competiria com o turno pela sessão JSF, que é serializada. Ao terminar, chama
  `refinarContexto` de volta — sem laço, porque ali `faltam` já está vazio e o
  caminho normal assume. Nunca deixa o estado pior que o de antes: o que não baixar,
  o envio busca com o card de progresso visível.
  `estSeq` descarta respostas atrasadas e `ultimaChaveEst`
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
  tentativa limpa. `panel.setPecasEnviadas([...pecasNaConversa])` é chamado no
  **`finally`** do turno: são QUATRO caminhos que mexem em `pecasNaConversa` (sucesso,
  resposta vazia, erro e turno desfeito) e espalhar a chamada garantiria esquecer um.
- **O teto do bloco de TEXTO acompanha a JANELA do modelo e é REPARTIDO**
  (`tetoTextoChars`/`tetoTextoDe`), e o corte NÃO pode ser silencioso. Vale para
  peça de texto (HTML do editor, RTF migrado) e para anexo do input (`.md`,
  `.txt`, `.docx`), que compartilham o caminho por `entradaDoc`.
  - **Era a constante `MAX_CHARS_TEXTO` (60.000) e isso era um bug de escala**:
    o número nasceu de "peça HTML ≈ 30 páginas", quando anexo do input não
    existia. Um `.md` de 1,57 milhão de caracteres entrava a **3,8%** — o
    usuário via "2% do contexto" com um modelo de 1M e a resposta avisava que a
    leitura parou na página 25. Pior, era **assimétrico por formato**: o mesmo
    conteúdo em PDF passa INTEIRO (vai por `file_id`, sem corte), então o
    formato mais leve era o único penalizado.
  - **A repartição não é preciosismo.** Com teto individual generoso, 20 peças
    de texto marcadas de uma vez estourariam a janela e o pré-voo BARRARIA o
    turno — trocando uma degradação graciosa (entram cortadas, com aviso) por um
    erro duro. Um anexo sozinho fica com quase todo o orçamento; 20 peças o
    dividem. Piso de 60.000 (o teto histórico) para janelas pequenas.
  - **A fração é 0,55 porque o resto da janela tem dono**: histórico, system,
    inventário e — o maior — os PDFs das peças. A guarda de 90% em
    `estimarContexto` segue sendo a rede real; este teto é a primeira linha.
  - O texto cortado leva `marcaTruncado(teto)` — aviso explícito, **com o
    número**, para o modelo não concluir que algo "não consta" do que ele não
    leu — e o item entra em `pecasTruncadas`, reportado pelo canal do
    `mostrarFalhasPecas` com rótulos próprios (`avisoTrunc`): ali os documentos
    ENTRARAM, pela metade, que é uma perda de outra natureza que a do download.
  - **`avisoTrunc` recebe a LISTA, não a contagem**: anexo e peça são coisas
    diferentes para quem lê. "1 peça é longa demais" sobre um arquivo recém-solto
    na caixa manda o usuário procurar nos autos uma peça que não foi cortada, e
    a saída de cada um é outra (o `.zip` só existe para as peças; um anexo, quem
    divide é o usuário). `ehIdAnexo` é o predicado único, compartilhado com
    `ehBlocoAnexo`.
  - **`tetoTextoDe(ids)` é o ponto ÚNICO dos três consumidores** (`montarBlocos`
    corta, `pecasTruncadas` reporta, `estimativaLocalTokens` mede) — se cada um
    contasse os textos por conta própria, o gauge mediria um corte diferente do
    que o request faz. Os conjuntos batem em todos os caminhos:
    `[...anexadas, ...anexosNovos]` no chat, `dl.ok` na minuta e no mapa.
  - **IMPRECISÃO ACEITA e documentada no código**: `estimativaLocalTokens` mede a
    seleção INTEIRA e `montarBlocos` recebe só o DELTA, então uma peça de texto
    nova somada a muitas antigas é medida com o teto dividido por todas e entra
    com o teto do delta — a estimativa fica abaixo do real. Com teto constante os
    dois davam no mesmo. A camada local é declaradamente aproximada e o
    `count_tokens` mede o request de fato acima de 60% da janela.
  - **`CHARS_POR_TOKEN` mudou para o TOPO do arquivo** por causa disso: `refresh()`
    roda na linha ~1271 e a const vivia na ~2495, junto do medidor — a zona morta
    temporal descrita em "Desenvolvimento e teste". Mover uma `const` para mais
    cedo no mesmo escopo é seguro por construção.
  - `casodb.js` NÃO corta pelo teto de envio ao gravar (`MAX_CHARS_PECA` = 2M é
    outro limite, de sanidade do banco): o texto gravado pode entrar inteiro
    depois de uma troca de modelo, e guardar o corte de hoje congelaria a decisão
    de ontem.
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
  - **EXCEÇÃO deliberada: o que vem da LINHA DO TEMPO cita-se
    `(movimentação de DD/MM/AAAA)`.** Publicação, intimação, decurso e trânsito
    não têm peça nem folha; exigir o formato de documento para eles empurrava o
    modelo a omitir a data ou a pendurá-la numa peça qualquer — citação inventada
    num ato assinado. Ver "A LINHA DO TEMPO PROCESSUAL no contexto".
    - Ela vive em **TRÊS** lugares, e a v0.45.1 só acertou dois: além do
      `SUFIXO_MINUTA` e do `SUFIXO_MAPA`, o **`SYSTEM_PROMPT_CIT_TEXTUAL`**
      precisa dela — é o caminho dos modelos SEM citação nativa (Gemini e
      OpenAI), e o padrão da extensão é o `gpt-5.6-luna`. Ali a cláusula de
      citação textual pedia `(Peça, id, fl.)` para todo fato relevante e a
      dispensa não estava no trecho vizinho; o `PROMPT_FIM` já pedia a FORMA
      ("cite o movimento e a data"), mas não dispensava o formato de documento.
      No `PROMPT_INICIO` (compartilhado, caminho Anthropic) ela **não** entra:
      lá as citações são nativas por página e não há formato literal a dispensar.
- **Contexto do caso no system** (`contextoDoProcesso` em content.js): número CNJ
  (`PJE.getNumeroProcesso`), **ficha do processo** e data de hoje. Sem o CNJ o mapa
  mental titulava com número inventado; sem a data, prazos e "situação atual" saíam
  calculados contra o conhecimento congelado do modelo. Todos entram por
  `systemPromptAtual()` — o mesmo ponto único do `customPrompt` —, então alcançam
  chat, minuta, mapa e count_tokens nos três provedores de uma vez. A data muda o
  system uma vez por dia, o que é inofensivo: o cache é ephemeral de 5 min e a virada
  nunca cai numa janela viva.
  A **ficha** (`resumoFicha`) sai de `PJE.lerCabecalhoProcesso()`, que já existia e
  até então só a exportação `.zip` usava: classe, assunto, órgão julgador e os
  titulares de cada polo (representantes NÃO entram — dobrariam o tamanho sem ajudar
  a entender o caso). São ~80 tokens que o modelo não deduz com segurança dos PDFs
  (nem sempre a peça marcada é a inicial), e sem eles ele troca os polos e erra o
  rito. Lida UMA vez por sessão (`fichaCache`): `systemPromptAtual()` roda duas vezes
  por turno e raspar o DOM de novo seria desperdício. Best-effort: ficha nula ⇒ o
  system fica byte a byte o de antes.
- **Avisos em bloco na resposta** (`PROMPT_DESTAQUES` em content.js +
  `lerCallout`/`CALLOUTS` em panel.js): a observação que MUDA a leitura do
  processo — "esta peça é só encaminhamento, a defesa está na 205649798", "a
  peça decisiva não foi anexada", "não deu para confirmar este valor" — chegava
  como mais um parágrafo no meio de uma resposta longa. Quem lê autos lê por
  VARREDURA: ressalva sem peso visual é ressalva não lida, e aqui o custo disso
  é decidir com base errada.
  - A sintaxe é a dos **"alerts" do GitHub** (`> [!ALERTA]`) por ADERÊNCIA, não
    por gosto: os modelos a conhecem do treino, e marcação inventada seria
    obedecida pela metade. Como é uma citação markdown legítima, o provedor que
    ignore a instrução degrada para blockquote em vez de vazar sintaxe crua.
  - **Três níveis, e as tabelas dos dois lados precisam bater**: `[!ALERTA]`
    (`--alerta-*`, o que pode levar a erro de decisão), `[!ATENÇÃO]`
    (`--warn-*`, ressalva sobre a BASE da resposta) e `[!NOTA]` (azul da marca).
    `CALLOUTS` aceita também os rótulos canônicos em inglês (WARNING, NOTE,
    CAUTION…): o modelo escorrega para eles mesmo instruído em português, e um
    rótulo não reconhecido apareceria como `[!WARNING]` cru na tela.
  - Vai nos DOIS system prompts de chat e **é proibido na minuta e no mapa**
    (regra explícita no `SUFIXO_MINUTA`/`SUFIXO_MAPA`): um `[!ALERTA]` no meio
    de uma sentença que vai ao PJe é defeito, não destaque — ali o canal do que
    falta continua sendo o `[COMPLETAR: …]`.
  - Teto de três avisos por resposta, dito no prompt: destaque que aparece em
    tudo deixa de destacar.
- **Inventário das peças NÃO anexadas** (`inventarioNaoMarcadas` + `comInventario`):
  ao fim do turno do usuário vai a lista de `id - título` das peças que estão na
  timeline mas ficaram de fora. É o que fecha o ciclo entre a IA e a seleção — sem
  ele, perguntar "qual foi o valor da perícia?" com o laudo desmarcado devolve um
  "não consta" seco, e o usuário não descobre que a peça está a um clique.
  - Vai no **texto do turno**, nunca no system: a lista muda a cada refresh da
    timeline (MutationObserver, debounce de 400 ms) e no system invalidaria o cache
    de prefixo o tempo todo.
  - E é anexado só na **cópia** que vai à API (`prepararEnvio` já devolve uma), nunca
    em `conversation`: no histórico ele se acumularia turno a turno — dez turnos com
    200 peças seriam ~20 mil tokens de listas repetidas e desatualizadas. Teste
    cobre: no 2º turno tem de haver exatamente UM inventário.
  - Entra ANTES do `estimarContexto`, para o pré-voo medir o request que vai de fato.
  - Teto `INVENTARIO_MAX` (80): acima disso, só as peças de relevância
    `essencial`/`relevante` (mesmo critério do "principais"), e o corte vai DITO no
    texto — sem cap silencioso.
  - `PROMPT_FIM` traz a regra correspondente: **nunca afirmar conteúdo de peça não
    anexada**, e distinguir "não consta das peças anexadas" de "não existe no
    processo". Sem ela o modelo trataria a lista como conteúdo disponível.

## Memória de caso (`casodb.js` no worker + `caso.js` + `content.js`)

Reabrir um processo já analisado retoma a conversa e **não re-baixa as peças**.
Antes disso, fechar a aba matava `conversation`, `pecasNaConversa` e — o mais
caro — o `docsCache`, que custou até `200 × 5,6 s ≈ 18 min` da fila serializada
do PJe. O `fileId` sobrevivia em `storage.session` mas era lido de DENTRO do
`docsCache`: na prática o cache de sessão poupava o upload e nunca o download.

- **TODO acesso a `CASO` passa por `memoriaDisponivel`** (`typeof CASO !==
  "undefined"`). Não é paranoia: é o que permite testar o `content.js` em jsdom sem
  carregar o `caso.js`, e é a rede se o IIFE dele parar de carregar. O `CASO.salvar`
  do `onReset` era o ÚNICO dos nove acessos sem a guarda — ali um `ReferenceError`
  mataria o "Nova conversa" DEPOIS de limpar a tela e ANTES de dizer onde a
  conversa foi guardada, que é o pior instante possível.
- **O banco NÃO PODE viver no content script.** Content scripts rodam na origem
  da PÁGINA: um `indexedDB.open()` em `content.js` abriria o banco de
  `pje.tjce.jus.br` — os autos ficariam legíveis por qualquer script do tribunal
  e sumiriam quando o usuário limpasse os dados do site. Por isso `casodb.js` é
  um ES module do worker e `caso.js` é só o cliente RPC.
  IndexedDB e não `storage.local` por três razões: **cota** (o `local` tem teto
  de 10 MB e já hospeda config + `minuta:*` + `modelo:*`; estourá-lo faz o `set`
  de uma minuta FALHAR — o IndexedDB segue a cota por origem do navegador);
  **structured clone**, que preserva o `{type:"x-gemini-item", raw}` que precisa
  voltar byte a byte; e **escrita granular** por peça.
  Nota de fato conferida na doc oficial (2026-08): `unlimitedStorage` **NÃO
  gera aviso de permissão** — só `bookmarks`, `history`, `tabs` e afins geram.
  Não a declaramos porque não é necessária (o teto de 20 casos de texto fica em
  poucos MB); o que ela daria de útil é isenção de *eviction* sob pressão de
  disco. Não repetir a afirmação de que ela "mexeria no aviso de instalação":
  isso é falso e levaria a decisões erradas.
- **O b64 dos PDFs e das imagens NUNCA vai ao disco.** O que dispensa o download
  é o `fileId` da Files API — `montarBlocos` o prefere e nem toca no base64
  (content.js:1330). `salvarPecas` apaga `b64`/`semBytes` como última barreira.
  Peça de TEXTO guarda o texto: ali ele É o conteúdo e dispensa o download por
  completo.
- **QUATRO predicados são a fonte única da regra** (irmãos de `precisaUpload`):
  `fileIdValido` (provedor bate · `fileExp` com 60 s de folga · `chaveHash`),
  `podeAnexar` (ramos EXPLÍCITOS por `kind` — imagem vai **sempre** inline em
  base64 nos três provedores, então um `fileId` não a dispensa de nada),
  `precisaBaixar` e `temBytes`. Todo `!docsCache.has(id)` de decisão de download
  virou `precisaBaixar`; `garantirBaixada` é o funil ÚNICO e **mescla**
  (`Object.assign`) em vez de substituir — um `set` cru apagaria o `fileId` e a
  peça subiria de novo a cada sessão, anulando metade da economia.
- **`precisaBaixar` e `temBytes` respondem perguntas DIFERENTES, e confundi-las
  já custou dois bugs de uma vez.** O primeiro é "preciso baixar para
  **ENVIAR**?", e a resposta é **não** quando há `fileId` válido — o modelo
  recebe a peça por referência da Files API. Mas há dois consumidores que não
  mandam a peça a lugar nenhum e para os quais o `fileId` não vale nada: o
  **preview**, que desenha pixels, e a **exportação `.zip`**, que grava o arquivo
  original. Os dois chamavam `garantirBaixada(id)` e, numa peça vinda da memória
  de caso (`fileId` + zero bytes — o caminho COMUM ao reabrir um processo), o
  download era pulado. Sintomas distintos e ambos silenciosos: no preview o botão
  "Abrir documento" não fazia nada (baixava zero e o popover re-renderizava o
  mesmo aviso); no `.zip` a peça saía **vazia**, num arquivo que só se abre
  depois. Os dois passaram a pedir `garantirBaixada(id, {bytes:true})`. A
  medição de contexto (`baixarQuieto`) segue com `precisaBaixar`, porque lá o
  `fileId` de fato basta — o `count_tokens` referencia por ele.
  - Corolário na UI: o botão do preview confere se o que voltou tem **conteúdo**
    (`b64`, ou `text` quando é peça de texto), não se voltou algo. Retorno sem
    bytes cai no mesmo ramo no re-render, e o clique parece não ter feito nada —
    era metade do sintoma. Os DOIS ramos de `preview-miss` fazem essa checagem.
  - Coberto por teste que extrai os quatro predicados do `content.js` real (por
    varredura de chaves no fonte, não cópia) e roda em `vm` com um `docsCache`
    falso.
- **Armadilhas que já custaram bug nesta rodada:**
  - **Gravar antes de hidratar apaga o caso.** O `refresh()` do boot roda
    `setDocs` → `syncSelection` → `selChangeCb` SÍNCRONO, com a lista vazia. Sem
    a trava `casoCarregado`, a primeira gravação salva `selecao: []` por cima da
    memória. A ordem `hidratar → casoCarregado = true` é a correção inteira.
  - **`fileIdValido` lê `modelCaps`**, que no boot é `null` e cai no default
    "anthropic": hidratar antes do `await garantirCaps()` descartaria em silêncio
    todo `fileId` do Gemini, que é o provedor PADRÃO. O recurso pareceria não
    existir.
  - **`subirPecas` sem guarda de `b64`** subiria arquivo VAZIO, receberia um
    fileId válido e contaminaria o cache de sessão E o banco — o modelo
    responderia "não consta" sobre peças que recebeu em branco.
  - **`montarBlocos` fazia `d.b64.length`** no fallback: uma peça hidratada sem
    bytes derrubava o turno inteiro com TypeError. Agora sai por `podeAnexar` e
    entra em `semConteudo`, reportado no chat.
  - **O debounce precisa de TETO** (`TETO_ADIAR`): cada peça que baixa pede uma
    gravação e reagenda o timer — num prefetch de 200 peças a gravação seria
    adiada até o fim, e fechar a aba perderia exatamente o download que a
    memória existe para preservar.
  - **A poda NÃO pode rodar a cada gravação.** `podarCasos` percorre todos os
    casos; com `getAll()` ela desserializava as CONVERSAS INTEIRAS de 20
    processos a cada 1,2 s de debounce, dentro do worker — o processo que o
    Chrome mata primeiro. Agora usa `openKeyCursor` no índice `porAtualizacao`
    (só timestamps, o valor nunca é lido) e só roda quando um caso NOVO nasce —
    a criação é o único momento em que o teto de quantidade pode ser cruzado.
  - **`metaDe` tem fallback (`"Peça 123"`) e ele NÃO pode ir ao disco.** A
    timeline é lazy, então uma peça do histórico pode não estar no `docsIndex`;
    gravar o fallback trocaria "184100639 - Contestação" por "Peça 184100639"
    PARA SEMPRE, porque a mesclagem do banco aceita o campo. `pecaParaBanco` lê
    `docsIndex.get(id)` direto e OMITE o título quando não há — omitir preserva
    o que está gravado.
- **`selecaoEfetiva()` = checkboxes + `selPendente`, e ela é a fonte de verdade
  do TURNO** (não `getSelected()` puro). A timeline do PJe é lazy: ao reabrir um
  processo, boa parte das rows não existe no DOM e os checkboxes correspondentes
  não podem estar marcados. Três coisas quebravam por isso, e as três em
  silêncio: (1) o `if (selectedIds.length === 0)` do `onSend` recusava o envio
  com "marque ao menos uma peça" numa conversa que o usuário acabara de ver
  retomada; (2) `prepararEnvio` filtrava TODOS os blocos `document` do histórico
  — a IA responderia sobre um processo vazio; (3) a gravação salvaria a seleção
  encolhida, e ela sumiria um pouco a cada sessão. A guarda de peça marcada
  passou a valer só quando **não há** peça no histórico (`pecasNaConversa`).
  Vale para chat, minuta e mapa.
- **O `fileId` também vive DENTRO do histórico**, e é o modo de falha mais
  provável do recurso: `conversation` guarda `{source:{type:"file", file_id}}`
  dos turnos anteriores, e re-baixar a peça NÃO conserta o bloco antigo — o
  usuário levaria um 400 críptico na primeira mensagem de toda conversa
  retomada. `revalidarPecasDoHistorico` (chamada em `onSend` após
  `garantirCaps`) re-sobe o que venceu e **reescreve os `file_id` in-place**
  (legítimo: o bloco `document` não carrega assinatura, ao contrário do
  thinking). Peça que não voltou sai do histórico e é reportada. No caminho
  normal custa uma varredura e mais nada. **Minuta e mapa NÃO chamam essa
  função**: são requests isolados, montam blocos do zero e não reenviam
  `conversation`.
- **`chaveHash`** (SHA-256 da chave truncado em 8 hex, calculado no worker —
  a chave nunca sai de lá) invalida os uploads quando o usuário troca de conta.
  Viaja no `upload` e no **`caps`**, que já roda no boot e no `storage.onChanged`
  de chave/modelo: a invalidação acontece sozinha, sem caminho novo. A resposta
  de `upload` passou a levar `exp` também — antes a expiração do Gemini existia
  só dentro do worker, o que bastava enquanto o cache morria com a aba.
- **O que decide se há conversa a gravar é `temProduto`, e ele tem DUAS metades**
  — cada uma corrigindo um erro oposto:
  - `conversation` sozinho não serve: minuta, mapa mental e "escolher com IA"
    são requests ISOLADOS e não entram nele **por decisão de projeto**. Enquanto
    `gravarCasoEConversa` media por ele (`if (!conversation.length) return`),
    uma sessão inteira de minutas e mapas NUNCA virava conversa no disco: a tela
    com meia dúzia de cards e o banco vazio; fechar a aba apagava tudo sem
    aviso. Foi o bug que abriu a rodada.
  - O transcript INTEIRO também não serve: num turno que falha o histórico é
    desfeito (`conversation.pop()`) e a bolha do assistente é removida, mas a
    pergunta do usuário fica na tela — gravar ali encheria a lista de conversas
    com perguntas nunca respondidas.
  - Sobra o certo: **houve resposta** (uma entrada `assistant` no transcript, que
    é o que o card da minuta e o do mapa deixam) **ou** já há histórico de API.
    `onReset` usa a MESMA função para decidir se anuncia "conversa anterior
    guardada" — anunciar num caso em que nada foi gravado seria mentir sobre
    memória, que é pior do que o silêncio.

  Consequências que andam juntas e não podem se separar:
  - `retomarConversa` aceita conversa **sem** `conversation` (basta transcript),
    e `aplicarConversa` faz `caso.conversation || []` — `undefined` ali derruba
    o próximo `.length`, lido em quase todo caminho do envio.
  - **Minuta, mapa e triagem gravam no `finally`** (`salvarCasoAgora()`), como o
    chat e a exportação. Sem isso o registro só chegava ao disco se algum outro
    evento disparasse gravação depois — e o download das peças daquele turno
    junto. Na triagem vale o mesmo por outro motivo: ela reescreve a SELEÇÃO, e
    o `selChangeCb` que ela dispara cai na guarda de `busy` do `agendarSalvar`.
- **A identidade da conversa (`convAtual`) só é assumida quando
  `aplicarConversa` devolve `true`** — ela devolve `false` ao recusar histórico
  de outro provedor. Assumir antes era destrutivo nos DOIS caminhos (boot e
  troca pela lista): a tela fica vazia, `convAtual` segue apontando para o
  registro cheio, e a primeira gravação escreve o vazio por cima. O usuário
  perdia a conversa por ter clicado nela. E o `return true` no fim da função é
  parte da correção: sem ele a conversa aparece na tela, ninguém assume a
  identidade, e a gravação seguinte cria uma DUPLICATA.
- **"Nova conversa" apaga a CONVERSA, preserva as PEÇAS.** O botão promete zerar
  o chat, não esquecer o processo; apagar as peças faria o usuário pagar o
  download inteiro por ter trocado de assunto.
- **Duas abas no mesmo processo**: `salvarCaso` recebe o `base` (o
  `atualizadoEm` que aquela aba leu ao hidratar). Se o registro mudou desde
  então, os `CAMPOS_DE_SESSAO` (conversa, transcript, seleção, custo) são
  descartados e só o aditivo (peças, ficha) passa. **Não existe merge de
  conversas** — são duas sequências de raciocínio assinado, e intercalá-las
  produziria um histórico que nenhuma API aceita.
- **Retomada da UI**: `restaurarConversa` é REPLAY de `addMessage`/
  `updateAssistant` (o `transcript` interno volta correto sozinho e o ⬇ segue
  funcionando). Card de minuta/mapa retomado vira UMA LINHA — o `__entry.text`
  deles guarda o markdown inteiro, que como bolha despejaria 30 KB na conversa.
  `restaurarSelecao` guarda `selPendente` e o `setDocs` aplica cada id UMA vez:
  cobre a timeline lazy sem ressuscitar peça que o usuário desmarcou.
  **Troca de provedor desde a última sessão retoma só as PEÇAS** — o histórico
  de um provedor não roda no outro, e retomá-lo entregaria um estado que o envio
  bloquearia de todo jeito.
- **Privacidade**: default ligado, `chrome.storage.local.memoriaCaso` (desligar
  **apaga tudo na hora** — um interruptor que só impede gravações futuras
  deixaria no disco o que o usuário acabou de recusar); poda de 14 dias/20 casos
  de carona em cada gravação e no `onInstalled`; a faixa `.retomada` ANUNCIA a
  memória e hospeda o botão de apagar (dois cliques, nunca `confirm()`).
  Documentado em `PRIVACY.md`, `help.html#memoria` e `README.md`.

## Tour de primeiro uso (`tour.js` + `panel.js`)

Visita guiada de 13 passos que se desenha SOBRE o painel real. Existe porque os
gestos de seleção em faixa (arrastar, Shift+clique, botão direito) estavam na
extensão desde a v0.23 e quase ninguém os descobria: gesto não se anuncia
sozinho, e o guia do estado vazio é texto — ninguém abre um acordeão para achar
o que não sabe que existe. **Sete dos treze passos são sobre marcar peças**, que
é a tarefa repetida dezenas de vezes por processo.

- **Por que NÃO uma biblioteca** (Driver.js/Shepherd/Intro.js, todas avaliadas):
  (1) os alvos vivem no **Shadow DOM** e `document.querySelector` deles devolve
  `null`; (2) elas injetam o popover em `document.body`, FORA do shadow, e o
  balão volta a ficar exposto ao CSS do tribunal — o painel usa Shadow DOM
  exatamente para não estar; (3) o que este tour ensina são **gestos**, e
  nenhuma delas anima gesto; (4) ele **pilota** o painel (`open`, `aplicarModo`,
  `setDocsOcultas`), que é código só daqui. O recorte — a parte que a lib
  resolveria — são cinco linhas de CSS. Mesmo argumento que manteve o JSZip
  fora do projeto.
- **INVARIANTE: o tour NUNCA toca no estado real.** Os gestos são demonstrados
  num **palco falso** (lista fictícia dentro do balão). Animar sobre as rows
  verdadeiras marcaria peças de verdade → `selChangeCb` → estimativa de contexto
  → `baixarQuieto`/prefetch, isto é, uma visita de boas-vindas **iniciando
  downloads na fila serializada do PJe**. O palco também é o que faz os passos
  funcionarem com a timeline ainda vazia, que é justamente o primeiro uso.
  Coberto por teste (nenhum disparo de `onSelectionChange` na visita inteira).
- **O `ctrl` é a fronteira, e é deliberadamente mínimo**: `{root, wrap, abrir,
  modo, modoAtual, mostrarPecas}`. Nenhum método que altere seleção, conversa ou
  envio atravessa — é o que garante o invariante acima por construção, não por
  disciplina.
- **Uma caixa de 0×0 não pinta `box-shadow` no Chrome** — nem com spread de
  9999px. O recorte é `box-shadow: 0 0 0 9999px` num `div` posicionado sobre o
  alvo; nas telas SEM alvo (capa e encerramento) o buraco colapsaria em 0×0 e o
  escurecimento sumia inteiro, deixando a capa boiando sobre a página do
  tribunal. Por isso `sem-alvo` vai nos DOIS elementos: o buraco se apaga
  (`opacity`, nunca `[hidden]`, para o fade de volta) e quem escurece passa a ser
  o **fundo da camada**. `getComputedStyle` mostra a sombra viva e correta nesse
  estado — a falha é invisível fora de um teste de pixel.
- **NUNCA `requestAnimationFrame` na primeira pintura.** O Chrome congela o rAF
  em aba de segundo plano (o mesmo que já derrubou o primeiro desenho do mapa
  mental), e abrir processos com Ctrl+clique em várias abas é o padrão de
  trabalho no PJe: a visita auto-abre ~1 s após o boot e o usuário encontraria a
  tela escurecida com um cartão **vazio**. Pinta-se síncrono, com **dois**
  repintes (320 ms e 700 ms) porque o `.panel` ANIMA ao abrir (era
  `animation: rise`, hoje a transição de entrada descrita em "Micro-animações")
  e medir o
  alvo no meio dela põe o spotlight ao lado do botão.
- **Ordem dos lados do balão: direita ANTES de abaixo** quando o alvo está na
  metade esquerda. "Abaixo primeiro" é o default óbvio e estava errado aqui — os
  alvos da esquerda são todos da coluna de peças, e um balão abaixo deles cobre
  justamente a lista que o passo explica.
- **Os palcos declaram uma timeline; quem agenda é o `laco`.** Quando cada palco
  fazia o próprio `setInterval` e registrava os `setTimeout` na lista geral (só
  esvaziada na troca de passo), um passo deixado aberto empilhava dezenas de
  entradas mortas por minuto. `tocar` devolve a função de PARADA e
  `limparTimers` a chama. Teste cobre: nunca mais de um laço vivo, zero ao fim.
- **Esc é capturado em `capture:true` no window**, senão a cascata de Esc do
  painel (`/` → `@` → modal → modo minuta) fecharia outra coisa junto.
- **Abre sozinho UMA vez** (`chrome.storage.local.tourVisto`, versionado), e só
  com a conversa vazia — cobrir uma conversa restaurada da memória de caso seria
  o pior momento possível. A primeira tela é uma **capa que pergunta** antes de
  percorrer; recusar ali marca o "visto", porque quem recusou não quer ser
  abordado a cada processo. O caminho de volta é o botão `.hint-tour` no estado
  vazio, que some com a primeira mensagem como o resto do bloco.
- `panel.js` trata `PjeTour` como **opcional** (`typeof PjeTour !== "undefined"`,
  como `MLIB` e `DocxImport`): sem o arquivo, o convite some e nada quebra. E a
  **instância nasce depois** de `open`/`aplicarModo`/`setDocsOcultas` existirem —
  só o flag `temTour` mora no topo, porque `showEmptyHint()` roda antes (a
  armadilha da zona morta temporal, aqui no `panel.js`).

## Busca de peças e orientações (panel.js)

- **"Carregar todas as peças" tenta TRÊS rotas, nesta ordem** (detalhes e
  armadilhas em `docs/pje-tela-documentos.md`; o catálogo da família REST
  inteira, com o que já foi validado em sessão real, em `docs/pje-api-rest.md`):
  0. **`PJE.listarPelaApi`** — `GET /{base}/seam/resource/rest/pje-legacy/
     processos/{idProcesso}/documentos`, da mesma família REST que a extensão já
     usa para baixar peça. Devolve um ARRAY puro de `{id, descricao, data,
     binario, linkDownload}` em **uma requisição**, autenticada pelo cookie de
     sessão. **A `descricao` é o TIPO OFICIAL** ("Petição Inicial", "Documento de
     Comprovação") — o dado por causa do qual a grid existia —, e o custo é
     **ZERO tela JSF**, contra ~10 da grid num processo de 138 peças. Como é a
     leitura da grid que esgota o orçamento de telas e faz a aba morrer com "Sua
     página expirou", esta rota tira o risco do caminho normal.
     Medido no processo P2: 35 documentos contra 33 na timeline —
     **superconjunto** (nenhum id da timeline faltou) e em ordem cronológica
     CRESCENTE, que até aqui era só premissa da exportação.
     - **GUARDA ANTI-REGRESSÃO**: lista MENOR que a timeline já no DOM é
       recusada (`null` → cai na grid). Uma lista que encolhe é pior que
       nenhuma: a peça some sem ninguém ver.
     - `juntadoEm` é convertido para o formato BRASILEIRO **na origem** — é o
       contrato que `instanteDe`, o índice do `.zip` e o "Escolher com IA" já
       esperam. Converter ali é o que faz o resto do código não mudar uma linha
       e, portanto, não ter como regredir.
     - **Não traz `juntadoPor` nem os `extras`** do tribunal. Por isso a grid
       NÃO foi removida — e por isso `aplicarListaOficial` (content.js) é o
       ponto único que aplica qualquer lista: a fonte nova manda no que sabe e
       **cede** no que não sabe, senão a promoção por autor institucional, a
       coluna do índice e o sinal da triagem sumiriam em silêncio.
       PISTA FALSA já investigada: a irmã `processos/{id}/atosProcessuais`
       promete `nomeUsuarioJuntada` no DTO de 2019 — seria exatamente o
       `juntadoPor` que falta —, mas no TJCE 2.9.7.0 ela responde 200 com
       **array VAZIO** (medido em 13/08/2026). Não é substituta da grid.
     - O **aviso de risco** (`.gwarn`) migrou para ANTES da grid, e quem o
       dispara é o content.js (`panel.confirmarLeituraPesada()`): mostrá-lo no
       clique do ⟳ anunciaria um perigo que, no caminho normal, não existe.
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
  **O "ver na timeline" NÃO aponta mais para este botão** — e essa nota, que
  dizia o contrário, é o registro de uma regressão SEMÂNTICA: ela estava certa
  quando o ⟳ ERA a rota por scroll, e virou falsa quando a rota REST entrou na
  frente (v0.38). Ver "Lista completa ≠ linha do tempo carregada", abaixo.
- **Busca na lista de peças** (`.docsearch`/`filtrarDocs`): filtra por título **e pelo
  tipo oficial** sem acentos (`row.dataset.busca = textoBusca(d)`), só esconde/mostra
  linhas (`row.hidden` — depende da regra global `[hidden]{display:none !important}` do
  panel.css); os checkboxes seguem sendo a fonte de verdade (peça marcada e filtrada
  continua marcada). Indexar o `tipo` importa porque o título costuma ser o nome do
  arquivo ("Documentos diversos") e o tipo é o vocabulário controlado do PJe
  ("Despacho de Mero Expediente"): sem ele, buscar "despacho" não achava a peça que
  já aparecia dourada na lista. `textoBusca` é usada pela lista **e** pelo popup `@`,
  para os dois nunca divergirem. Esc limpa; `setDocs` re-aplica o filtro após
  re-renderizar a lista.
- **TRÊS degraus de seleção — `chave | principais | todas`** (`DEGRAUS` +
  `aplicarDegrau` em panel.js), sobre o eixo `data-rel` da row (ver "Relevância"
  abaixo), **nunca** sobre a classe de categoria:
  - `chave` (`[data-rel="essencial"]`) — a espinha dorsal: ~12 peças num processo de
    200. É o degrau que resolve o problema real; "principais" marcava ~78 de 200
    porque a regra de `cat-peticao` casa quase toda juntada das partes.
  - `principais` (`:not([data-rel="neutro"]):not([data-rel="ruido"])`) — as peças de
    conteúdo, sem o expediente.
  - `todas` — a lista inteira.

  Contrato dos três: **ADITIVO** (marcar nunca desmarca o que o usuário escolheu à
  mão — os conjuntos são encaixados, então os segmentos acendem em faixa) e
  **respeitam o filtro ativo** (agem só nas rows visíveis). O recálculo em
  `syncAtalhos` usa o MESMO conjunto (`rowsVisiveis()`) — quando ele varria a lista
  inteira, o checkbox se desmarcava sozinho logo após o clique sempre que havia busca.
  `syncAtalhos` é separado de `syncSelection` porque `filtrarDocs` precisa recalcular
  **sem** disparar `selChangeCb` (digitar na busca não muda a seleção, e avisar o
  content script a cada tecla o faria re-estimar o contexto à toa).

  **Modo de falha a não reintroduzir**: degrau com conjunto VAZIO (comum em `chave`
  antes de a grid ser lida) fazia o clique não fazer nada, em silêncio. A `.sel-nota`
  diz o motivo — tokens de aviso SUAVE (`--warn-*`), nunca a `.alertbar`. Sem o tipo
  oficial a classificação sai só do título e `chave` seleciona de menos: a nota
  aponta o `⟳ Carregar tudo`, que é o botão que resolve.
- **Relevância — segundo eixo, ortogonal à categoria** (`classificarPeca` em
  panel.js, logo depois de `CATEGORIAS`): a categoria responde "que tipo de peça é
  esta?" e vira COR; a relevância responde "esta peça vai para a IA?" e vira
  `row.dataset.rel` (dataset, **não** classe — as classes `cat-*` são semânticas pelo
  DESIGN.md §2 e uma `.rel-*` convidaria a pendurar cor nela). Quatro níveis:
  `essencial` (`RE_CHAVE`), `relevante` (derivado: tem categoria destacada),
  `neutro`, `ruido` (`RE_RUIDO`). Só os dois extremos têm tabela.
  - `classificarPeca` normaliza **uma vez por alvo** e devolve `{cat, rel}`;
    `categoriaDe` virou um wrapper (`.cat`). O custo real nunca foram as regex, é o
    `norm()` — e `setDocs` re-renderiza a lista a cada mutação da timeline.
  - Laço EXTERNO por alvo (`d.tipo` antes de `d.titulo`), interno na ordem
    ruído → chave → categorias: um tipo oficial "Certidão de Intimação" precisa
    vencer um título que contenha "sentença".
  - **Ruído força `cat-outro`**: "Certidão de Intimação da Sentença" pintada de
    dourado atrai o olho para o que não importa.
  - `RE_RUIDO` é CONSERVADORA e sempre ANCORADA. Nunca usar `certidao` sozinho
    (trânsito em julgado é ato relevante), `comprovante` sozinho (é prova em
    consumidor), `carta` sozinho (precatória não é ruído), `juntada de documentos`
    (é onde vive a prova) nem `mandado` (mandado de segurança).
  - **Armadilha da construção**: o grupo inteiro vai entre `\b…\b`, então toda
    alternativa precisa terminar em palavra COMPLETA — `saneador` não pega "Decisão
    Saneadora" e `acordo homologad` não pega "homologado". Flexões explícitas, nunca
    `\w*` solto (faria "inicial" casar "inicialmente"). Valem também o lookbehind de
    `(?<!cumprimento de )sentenca` e a separação `acordao` ≠ `acordo`.
- **Refino ESTRUTURAL da relevância** (`refinarRelevancia` em panel.js): dois
  sinais fortes não cabem em `classificarPeca` porque **não são propriedades da
  peça**. Ele roda em `setDocs`, sobre a lista já classificada, e devolve
  `Map id -> {rel, motivo}`; `classificarPeca`/`categoriaDe` ficam INTOCADAS —
  elas seguem sendo chamadas com peça avulsa pelos chips, pelo popup `@`, pelo
  preview e pelo content.js, e nenhum desses tem lista para oferecer. **UMA
  classificação por peça** é calculada em `setDocs` e reaproveitada pelos dois
  (classificar duas vezes dobraria o `norm()`, que é a parte cara).
  - **(1) A petição inicial, por POSIÇÃO.** É o sinal de maior retorno: o
    título costuma ser o nome do arquivo ("Petição", "Documentos diversos"),
    aí `RE_CHAVE` não casa nada e a peça mais importante do processo fica fora
    do degrau `chave`, em silêncio. Procura a primeira **petição**
    (`cat-peticao`) nas **5 primeiras** peças em ordem cronológica
    (`window.PjeExport.ordenarCronologico` — a MESMA premissa da exportação em
    `.zip`; duplicá-la aqui faria as duas divergirem sem ninguém ver).
  - **A guarda de `temTipoOficial` é o que impede o falso positivo caro**, e
    ela não é sobre o tipo: a timeline do PJe é LAZY, e numa lista parcial a
    peça mais antiga CARREGADA não é a mais antiga do PROCESSO. O tipo oficial
    só existe depois que a grid foi lida, e a grid é a rota que traz a lista
    inteira — é a proxy de completude disponível no painel.
  - **"Parar na primeira peça que não for ruído" está ERRADO** (foi a primeira
    versão, e o teste pegou): `RE_RUIDO` nunca usa `certidao` sozinho, então
    "Certidão de Distribuição" — que abre um número enorme de processos — não é
    ruído. O laço parava nela e a promovia a "provável inicial". Peça que não é
    petição não bloqueia a busca; a **janela** é que impede o laço de varrer os
    autos e rotular de inicial uma petição do meio.
  - **(2) Autor institucional, só para PROMOVER** (`RE_AUTOR_CONTEUDO` sobre
    `d.juntadoPor`): MP, promotoria, procuradoria e defensoria promovem a
    `relevante` o que o título e o tipo NÃO classificaram (`rel === "neutro"`).
    Quem juntou é **desempate**, nunca veredito — sobrepor um `RE_CHAVE` que
    casou faria uma sentença virar outra coisa por causa de quem a protocolou.
  - **Rebaixar por quem juntou foi avaliado e DESCARTADO**, por duas razões que
    se somam. Estrutural: nenhum degrau distingue `neutro` de `ruido`
    (`principais` exclui os dois), então rebaixar não mudaria seleção nenhuma —
    só criaria mais uma forma de a peça sumir sem ninguém ver. De domínio: o
    caso que parece render, "Petição juntada pela secretaria", é justamente
    onde a secretaria protocola petição de parte que chegou em papel.
  - **O motivo NÃO é enfeite**: peça que entra num degrau por um sinal que não
    está escrito no nome dela precisa poder ser contestada. Vai para o `title`
    da row, junto de quem juntou — o mesmo lugar onde o "Escolher com IA" já
    grava o motivo dele. O refino **nunca mexe na COR**: categoria e relevância
    são eixos ortogonais (DESIGN.md §2), e repintar a peça promovida afirmaria
    uma categoria que a classificação não reconheceu.
  - **Nº de páginas do PDF NÃO está disponível aqui** (e a tentação é real): o
    `paginas` que a grid devolve é a paginação da TABELA. O número de páginas
    da peça só existe no `docsCache`, depois do download, e o `docsCache` é do
    content.js — é por isso que ele aparece na lista do "Escolher com IA" e não
    nos degraus.
  - Testado fora do navegador (19 casos) carregando `exportar.js` + `panel.js`
    reais em `vm`, via `_refinarRelevancia`/`_classificarPeca`. O acesso a
    `PjeExport` é `window.PjeExport.…` explícito, e não o global nu: o IIFE de
    `exportar.js` publica a API só como propriedade de `window`, e o acesso nu
    só funciona pelo global-object-is-window do navegador.
- **Orientações no estado vazio** (`showEmptyHint`) — **progressive disclosure em
  quatro camadas**, nesta ordem: (1) três passos (`.passos`: marcar → pedir →
  conferir a origem), em coluna única e em 3 colunas SÓ no `.expanded` (na janela
  livre larga sobram ~420px de chat, e três cartões ali ficam com duas palavras
  por linha); (2) chips de exemplo (`EXEMPLOS`) que **preenchem** o campo — nunca
  enviam: sem peça marcada o envio falharia e a primeira experiência do usuário
  seria um erro; (3) `<details class="guia">` FECHADO por padrão (estado em
  `chrome.storage.local.guiaAberta`, restaurado depois de `showEmptyHint` existir
  — mesma armadilha do `docsOcultas`) com quatro parágrafos: não é agente
  autônomo, a lista pode vir incompleta, o contexto é limitado e **a conexão
  manda no tempo de espera** (cabo » Wi-Fi). O `<summary>` **nomeia a
  velocidade** ("…e o que deixa mais rápido") de propósito: o parágrafo de rede
  é o mais acionável do guia e ficava atrás de um rótulo — "limites e
  alternativas" — que não prometia falar disso, e ninguém abre um acordeão para
  descobrir o que não sabe que está lá dentro. A mesma frase agora abre também a
  caixa `.privacy` do popup/opções, que é onde ela alcança quem ainda não usou a
  extensão. **Mas ele não pode COMEÇAR por "Como funciona"** (é "Limites,
  privacidade e o que deixa mais rápido"): o convite ao tour, logo acima, chama-se
  "Ver como funciona" e também abre com um triângulo — dois controles empilhados,
  com o mesmo ícone e a mesma primeira palavra, liam-se como um só, e o que se
  perdia era justamente a visita guiada. A separação dos dois é feita em TRÊS
  eixos, e nenhum sozinho basta: espaço (`margin-bottom` no `.hint-tour` — ele é
  `inline-flex` e o `<details>` não tem `margin-top`, então o padrão eram 0px),
  peso (`--fs-ui`/600 contra o `--fs-micro` cinza do summary) e o selo de duração
  `.ht-dur` ("1 min"), que responde à pergunta que decide se alguém aceita um
  tour; (4) botão "Guia completo,
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

- **O launcher ("Analisar com IA") chama atenção em DOIS regimes**, e a
  diferença é ter usado o painel alguma vez:
  - `.wrap.pulse` — três halos no boot, e silêncio. É o de sempre, e vale para
    quem já usou: localiza o botão para quem sabe que ele existe.
  - `.wrap.chamando` — pulso CONTÍNUO (ciclo de 1,9 s: anel de ~1,4 s e 0,45 s
    de repouso) para quem **nunca abriu o painel**. Os três halos já existiam e
    mesmo assim havia quem não achasse o botão, e o motivo é QUANDO eles
    acontecem: rodam no boot da página, exatamente quando o usuário espera o PJe
    carregar e está olhando para outro lugar — cinco segundos depois não há mais
    nada na tela a que voltar. Duas diferenças: o pulso REPETE até o primeiro
    clique, e o botão ganha **escala** (movimento de forma é o que a visão
    periférica capta; o halo sozinho é mudança de cor num canto que o olho não
    está varrendo).
  - **O repouso é curto de propósito.** A primeira versão deixava 3 s de
    silêncio entre as rajadas, para não hipnotizar, e o efeito foi o oposto:
    quem olha para o botão vê um halo, espera, não vê mais nada e conclui que
    ele piscou uma vez e parou. Um chamado que exige paciência para ser
    percebido não é um chamado.
  - **O repouso do keyframe tem spread ZERO**, não só opacidade zero: é o que
    faz o anel sumir em vez de encolher de volta ao botão, e o que torna o salto
    para a rajada seguinte invisível.
  - **O estado mora nas CLASSES do wrap, não numa variável espelho.** Uma
    variável "já usou" inicializada de forma pessimista fazia o `open()` que
    acontece ANTES da resposta do storage (o content.js abre o painel em alguns
    caminhos) sair pela guarda sem gravar nada — e o chamado voltava na carga
    seguinte para quem já tinha usado. Painel já aberto quando a resposta chega
    conta como uso: grava e **nunca** liga o chamado, senão ele ficaria armado
    para quando o usuário fechasse o painel que acabou de usar.
  - `chrome.storage.local.launcherUsado`; o `get` vem DEPOIS de
    `open`/`marcarLauncherUsado` existirem (o stub de teste chama o callback de
    forma síncrona — a mesma armadilha do `docsOcultas` e do `guiaAberta`).
  - Em `prefers-reduced-motion` o chamado **não some**: perde a escala e o halo
    e vira uma respiração de brilho. Quem pediu menos animação é justamente quem
    mais precisa que o botão se anuncie por outro canal.
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

## Pacote de carta precatória (`precatoria.js` + exportar.js + panel.js)

Segunda saída do botão de download: para cada carta precatória **expedida**, uma
pasta com a carta, a peça de **origem** da ação e a **decisão que a fundamenta** —
pronta para virar um envio de malote digital. É um conjunto definido por norma
(CPC art. 260, II; CPP art. 354), não por julgamento: por isso é REGRA, e não um
pedido ao modelo.

- **O MOVIMENTO processual é o sinal, não o título da peça** — e essa é a decisão
  central. A timeline não traz só `id - título`: cada `.media.interno` tem o
  movimento em `.texto-movimento` e as peças em `.anexos a`, com a data num
  `.media.data` IRMÃO que vale até o próximo. `PJE.lerEventos()` lê isso;
  `listarDocumentos` passa a anexar `mov`/`dataMov` a cada doc (best-effort — num
  tribunal com outra estrutura os campos somem e tudo segue como antes).
  Medido no processo P1 (103 eventos, 113 peças):

  | critério | cartas achadas | precisão |
  |---|---|---|
  | título (`/carta precatória/`) | 6 | 50% |
  | movimento (`EXPEDIÇÃO DE CARTA PRECATÓRIA`) | 3 | 100% |

  As três falsas eram a precatória **devolvida**, juntada de volta sob o
  movimento `DOCUMENTO` e partida em `Cartas Precatórias / 1`, `/ 2`, `/ 3`. Pelo
  título são indistinguíveis da expedida. O movimento é vocabulário **CNJ**,
  controlado; o título costuma ser o nome do arquivo que alguém subiu.
- **A rota é a TIMELINE, nunca a grid** (`carregarTimelineCompleta`, não
  `listarPelaGrid`): a grid traz tipo oficial e total de páginas, mas **não traz
  movimento**. Preferir a grid aqui — como faz o `⟳ Carregar tudo` — tornaria o
  pacote menos confiável exatamente no ponto que mais importa.
- **A rotina de carregar a timeline é chamada SOZINHA**, e não por comodidade:
  das três peças, duas são inalcançáveis numa lista parcial. A peça de origem é a
  **mais antiga** do processo (no caso real, posição 103 de 103 — e a timeline
  abre com 47), e uma carta expedida meses atrás fica fora do trecho rolado. Sem
  isso o pacote sairia faltando peça, em silêncio, num zip que só se confere
  depois de aberto. É também a melhor resposta ao "ninguém clica em Carregar
  tudo": no fluxo em que o clique é obrigatório, ele deixa de existir.
- **Não se classifica o rito para escolher UMA regra de origem.** `ORIGENS` é uma
  lista de candidatos (denúncia → queixa-crime → petição inicial) tentada
  INTEIRA; o rito só reordena. O processo real processo P2 é uma
  **queixa-crime cuja peça inicial se chama "Petição Inicial"** — uma
  classificação binária mandaria procurar "Denúncia" e não acharia nada. Assim o
  acerto não depende de a ficha do processo existir.
- **Dois falsos positivos GRAVES que só os autos reais revelaram** (a peça errada
  iria no malote sem ninguém notar):
  - `\binicial\b` solto: em processo migrado do SAJ, TODO título carrega o sufixo
    `| Pág. Inicial SAJ 177`. A regra casaria a lista inteira. Só
    `\bpeticao inicial\b` — e o veto **não pode** conter `pag. inicial`, porque a
    própria denúncia se chama `Denúncia (Outras) (Denúncia | Pág. Inicial SAJ 1)`.
  - `\bqueixa\b` solto: existe a peça `Petição (queixa fulano de tal para
    protocolar )` — um rascunho — que venceria a verdadeira inicial. Só
    `queixa-crime` fechado.
- **`RE_DECISAO` precisa cobrir `interlocutoria`**: em processo migrado do SAJ a
  decisão se chama `Interlocutória (Decisões Interlocutórias | …)`. Uma regra com
  apenas `decisao|despacho|sentenca` não acha decisão NENHUMA nesses processos —
  que são justamente os mais antigos e mais precatoriados. O veto exclui
  `conclus`/`intimac`/`publicad` (`CONCLUSOS PARA DESPACHO` vem imediatamente
  antes do despacho e casaria `despacho`), e exigir que a decisão TENHA peça
  barra o resto.
- **A decisão é a anterior À CARTA, não a última do processo.** Quando a
  precatória não é o último ato, as duas divergem — e a última instruiria a carta
  com decisão posterior a ela. "Anterior" é índice MAIOR: a timeline entrega do
  mais recente ao mais antigo. Validado nos autos: intervalos de 2 e 4 dias entre
  a decisão e a expedição.
- **Movimento e peça nem sempre no MESMO evento**: no PJe nativo aparece o par
  "evento com movimento e sem peça" seguido de "evento com peça e sem movimento"
  (4 ocorrências no processo P2). `lerEventos` faz o movimento órfão ser
  HERDADO pelo evento seguinte; sem isso, uma carta nesse formato sumiria calada.
- **O pacote leva o PDF OFICIAL, não o texto da peça** (`PJE.baixarPdfOficial` +
  `obterParaMalote` em content.js). O que entra num anexo de malote é o
  documento do tribunal — timbre, paginação, rodapé de assinatura —, e a rota
  REST de sempre entrega o CONTEÚDO (peça do editor vira texto), que serve para
  ler e para a IA analisar mas **não é documento**. Como carta, despacho e
  decisão nascem quase sempre no editor, o pacote inteiro saía em `.txt` — e o
  defeito só apareceria no juízo deprecado.
  **A rota foi levantada na sessão real (12/08/2026)** e é a do próprio botão ⬇
  do visualizador: um POST no form `detalheDocumento` com
  `detalheDocumento:download` devolve a PÁGINA (~230 KB), e dentro dela vem uma
  URL pré-assinada de MinIO (`minio-pjedocs…?X-Amz-…&X-Amz-Expires=120`) — o PDF
  é **gerado sob demanda**, não existe antes do clique (medido: abrir a peça no
  visualizador dispara só `…/documento/download/{id}`, e nada de storage). Um
  `fetch` na URL traz os bytes; o CORS é liberado.
  O que não pode cair:
  - **O POST baixa o documento CORRENTE** — ele não recebe id nenhum. Por isso a
    peça é aberta antes (`ativarPeca`, já serializado) e a resposta é conferida:
    se o id não aparece no HTML, devolve `null` em vez de gravar **o PDF errado**
    no pacote, que ninguém notaria até o malote.
  - **Dois postbacks por peça** — é caro para a sessão JSF, então é do PACOTE, e
    nunca do chat, da medição ou da exportação em massa (que somariam centenas).
  - **A URL vale 120 s**: usar na hora, sem cache.
  - **Best-effort**: qualquer falha vira `null` e o chamador segue com o texto de
    sempre. É por isso que o aviso continua existindo — a degradação é graciosa,
    mas nunca silenciosa: faixa no modal ANTES de gerar (`.prec-aviso` fixo),
    bloco no topo do `LEIA-ME.md` com a lista dos arquivos a substituir
    (`textoNoPacote`) e a marca na LINHA de cada arquivo, porque quem monta o
    e-mail lê a lista da pasta, não o cabeçalho. Critério: `formato !== "pdf"` e
    não-imagem — peça digitalizada, que já é PDF, não é marcada.
  - Específico do TJCE por enquanto (o form `detalheDocumento` é desta tela);
    onde ele não existir, `null` na primeira linha e nada muda. Coberto por
    teste em jsdom com `fetch` fake: caminho feliz + as seis guardas.
- **MARCA para conferência, nunca baixa direto** (`panel.mostrarPrecatorias`): a
  escolha é por regra sobre metadados e o resultado vai por MALOTE — um erro só
  apareceria no juízo deprecado, semanas depois, e um `.zip` só se confere
  abrindo. O usuário vê as peças de cada pasta com o motivo e decide.
- **UM zip com pastas, não N zips**: `baixarBlob` entrega UM arquivo, e N
  downloads exigiriam a permissão `downloads` — que o projeto evita para não
  mudar o aviso de instalação da Store (mesma razão do iframe da grid).
- **O CAMINHO tem teto duro: 260 caracteres no Windows.** Este pacote é o mais
  fundo que a extensão produz (uma pasta por carta) e estourava de verdade — o
  Explorer recusava com "O caminho de destino é muito longo", e o PDF "não
  abria" pelo MESMO motivo: abrir um arquivo de dentro do zip faz o Windows
  copiá-lo para `%TEMP%` com o mesmo caminho comprido, e a cópia falha antes de
  o arquivo existir. **O zip estava correto** (CRC e bytes conferidos com o
  `zipfile` do Python); o defeito era só o comprimento. Três correções, e a
  primeira é a que mais rende:
  - **Nenhuma pasta raiz DENTRO do zip.** O Explorer já cria uma pasta com o
    nome do arquivo ao "Extrair tudo", então uma raiz interna homônima
    duplicava 37 caracteres. Vale para a exportação de peças também.
  - `nomePastaPacote` perdeu o id da carta (`01_2026-08-01`): ele já está
    inteiro no nome do arquivo da carta, dentro da mesma pasta.
  - `PAPEL` encurtado (`1-carta`, não `1-carta-precatoria`) e o trecho
    descritivo cortado em `DESC_MAX_PACOTE` (32, contra os 50 da exportação
    comum) — o título do PJe é repetitivo justo no começo ("Carta Precatória
    (Outras) (Carta Precatória | Pág…"), então o que se corta é o que menos
    identifica.

  Resultado medido: **156 → 70 caracteres** dentro do zip, e folga de 79 até no
  destino mais fundo. O teste do `zipfile` exige **margem** (≥40), não só
  "cabe": um pacote que passa raspando volta a quebrar na primeira pasta de
  destino um pouco mais funda.
- **`nomeReal.slice()` depende do prefixo REAL da entrada.** Ao tirar a raiz, o
  `slice(pasta.length + 7)` do índice virou `ReferenceError` — o mesmo modo de
  falha do `ehPdf` que já quebrou a exportação inteira. `node --check` não pega;
  quem pegou foi o teste que gera o zip de verdade.
- **A peça de origem se REPETE em cada pasta**, de propósito: cada pasta é um
  envio independente e precisa sair completa do zip. O download é feito uma vez
  só (cache `vistos`), então a repetição não custa rede.
- **Baixa TUDO antes de gravar qualquer coisa.** Se a própria CARTA não vier, a
  pasta não deve existir — gravando à medida que baixa, o zip ficava com uma
  pasta contendo só a denúncia, que no destino parece um pacote e não é. Como a
  entrada já estaria escrita, não haveria como desfazer. A pasta que não saiu vai
  NOMEADA no `LEIA-ME.md` e no `resumo.semCarta`: sumiço silencioso, nunca.
- **`instanceof Date` não serve** em `precData`/`diaIso`: é falso entre realms
  (Date de outro contexto) e para a mesma data em texto ISO — e o nome da pasta
  depende disso. Duck typing (`getTime`), com degradação para `null`.
- Testado fora do navegador com **fixtures REAIS** dos dois processos (31
  asserções da heurística + 33 da UI em jsdom + o zip validado pelo `zipfile` do
  Python). O visual foi conferido em Chrome headless nos modos expandido e
  estreito — foi assim que apareceram o rótulo quebrando em duas linhas, o aviso
  repetido no estado vazio e o rodapé sem separação.

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
- **`ehBin` (PDF ou imagem) ≠ "tem páginas"**: os dois viajam em base64 e não
  passam pelo deflate, mas só o PDF tem contagem de páginas para declarar no
  índice — `paginas` sai de `c.kind === "pdf"`, nunca de `ehBin`. Ler `ehPdf`
  ali depois da renomeação foi o que derrubou a exportação inteira (ver a nota
  do `no-undef` em "Desenvolvimento e teste").
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
  regra peça·id·folha (a **sexta** é o `indice.md` do pacote de TEXTO) — ao editar
  `PROMPT_INICIO`/`SYSTEM_PROMPT_CIT_TEXTUAL`/`SUFIXO_MINUTA`/`SUFIXO_MAPA`,
  editar os dois também.
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

  **Estados de uma peça no card**: `wait` → `loading` (baixando) → `upload` (subindo
  à Files API, só nos PDFs) → `done`; ou → `erro`, quando o **download** falha. Três
  regras que não podem cair:
  - **`prepDone` é IDEMPOTENTE**: conta peças PRONTAS, não transições. Com mais de
    uma fase, um `done` repetido levaria o contador além de N/N e a barra além de
    100%. Protege também a exportação, que usa os mesmos estados.
  - **Nem toda peça sobe** (`precisaUpload`, extraída para ser a fonte ÚNICA da
    regra e usada pelos dois lados): HTML, RTF e imagem vão inline e ficariam presas
    em `upload` para sempre.
  - **Falha de UPLOAD não é `erro`**: a peça cai no fallback base64 e ENTRA no
    request; marcar erro sugeriria que ela ficou de fora. Falha de upload → `done`;
    `falhas` (download) continua sendo a única lista de peças ausentes.

  Antes disso o contador batia N/N no fim do download e o card ficava congelado em
  100% durante todo o upload, parecendo travado. `endPrep` continua onde está — é
  invariante: só depois de `montarBlocos`, que é onde o teto de base64 pode estourar.
- **Teto de 600 MB** (`TETO_BYTES`): o conteúdo vive em `docsCache` como base64
  (~1,33× os bytes) e é materializado em Uint8Array ao zipar. Estourar mata a aba
  sem dizer por quê; a mensagem manda exportar em levas marcando parte das peças.

## Extração de texto das peças + OCR local (`ocr-render.js` + `ocr-offscreen.js`)

Menu do split button `⬇ Baixar .zip`. Lê a camada de texto dos PDFs e aplica OCR
local (PP-OCRv6; guia técnico `pp-ocrv6-extensao-chrome-mv3.docx`) nas páginas
digitalizadas. **DOIS formatos de saída, e o trabalho é o mesmo nos dois** — só o
destino da string muda, que é o que torna a adição quase-zero em risco:

- **"Extrair o texto (um arquivo .md)…"** — **um `.md`** com o processo inteiro,
  `# <peça>` / `## Página N`, o formato do `tjocr`, para alimentar o TecJustiça
  Sigilo e o Claude Code sem adaptação. É o padrão e o que o botão `Extrair texto`
  da faixa entrega.
- **"Extrair o texto (um .md por peça)…"** (`opcoes.porPeca`) —
  `processo-<CNJ>-texto.zip` com `pecas/NNN_Titulo_ID.md`, `indice.md` (tabela com
  link por peça), `indice.json` e **o consolidado acima junto**. O `.md` único é
  indivisível: para trabalhar UMA peça é preciso carregar todas, o `grep` não
  devolve o nome do documento, e não há como pedir "leia só a contestação".

Regras deste par:
- **O pacote é SUPERCONJUNTO, e a igualdade é TESTADA**: o consolidado gravado
  dentro do `.zip` é byte a byte o `.md` que o outro modo baixa. É essa invariante
  que torna a não-regressão do caminho antigo verificável por CONSTRUÇÃO — não por
  inspeção do diff. Ela existe porque `registrarPeca` (content.js) é o ponto ÚNICO
  do corpo da peça: os dois formatos saem da MESMA string.
- **Sem `opcoes.porPeca` o handler faz byte a byte o de antes.** A guarda de `ZipW`
  vem ANTES do `startPrep`, como a de `PjeExport`: sem o escritor, o pacote só
  falharia no FIM, depois de o usuário pagar os minutos de download e de OCR.
- **`registrarPeca` NÃO mexe em `comTexto`.** O anexo em imagem entra no
  consolidado e não conta como peça com texto — é assim desde sempre, e esse número
  vai no cabeçalho do arquivo. A contagem fica nos chamadores para a distinção
  ficar visível em vez de escondida num parâmetro.
- **A `ordem` sai do índice do laço, nunca de `pecasTexto.length`**: peça que falha
  CONSOME o número e a numeração de `pecas/` salta nela (regra do `montarZip`). Por
  isso a `ordem` vai também no registro da falha — sem ela o salto vira mistério
  para quem abre o pacote no destino.
- **Todo formato de saída novo traz o seu próprio ESCAPE** (`escYaml`/`escTabela`
  em exportar.js). O título vem dos autos e "Petição: emenda | fls. 30" quebra as
  DUAS gramáticas novas, em silêncio: os dois-pontos fazem do valor YAML um mapa
  aninhado, e a barra vertical fecha a célula da tabela e desloca a linha inteira,
  trocando o link de uma peça pelo de outra. Todo valor de texto sai entre aspas —
  inclusive os que "a gente sabe" que são seguros, porque a exceção é o que se
  esquece de manter. Mesmo eixo do escape-first do `renderMd`.
- **`EXTENSAO.md` é aditivo**: nenhum `c.fmt` de conteúdo vale `"md"`, então
  `montarZip` não muda e `montarZipTexto` reusa `nomeArquivo` — os dois pacotes,
  extraídos lado a lado, casam peça a peça.
- **Armadilha medida na revisão**: `arquivo: nomeReal.slice("pecas/".length)`
  aparece IDÊNTICA em `montarZip` e em `montarZipTexto`. Uma edição por busca de
  texto acerta a primeira; foi o que aconteceu com uma mutação de teste, que
  quebrou o pacote de PDFs enquanto o teste do pacote de texto seguia verde.

- **O QUE PASSA PELO OCR é decidido POR PÁGINA, não por documento** — e o portão
  é `if (c.kind !== "pdf" || !c.b64) return { d, c }` em `prepararPeca`:
  - **HTML e RTF** (peças do editor) não abrem no pdf.js e não vão ao OCR: já são
    texto quando chegam do PJe.
  - **PDF com camada de texto** usa a camada; **PDF digitalizado** vai ao OCR;
    **PDF misto** faz os dois, folha a folha (`classificarPagina`).
  - **ANEXO EM IMAGEM (JPEG/PNG) VAI AO OCR desde a v0.53.1**, sem pdf.js e sem
    rasterização: o b64 já está no cache, já reduzido por `normalizarImagem`, e
    vira data URL direto. Até a v0.53.0 este ramo escrevia "_[anexo em imagem —
    o texto depende do OCR]_" e **não chamava o motor**: o rótulo nasceu na
    v0.49.0, quando OCR não existia, e a v0.50.0 não revisitou o ramo. O
    resultado era o mesmo documento fotografado ter sorte diferente conforme
    tivesse chegado como PDF ou como JPEG — e uma frase que parecia explicação
    ("o OCR tentou e não conseguiu") no lugar do texto que ninguém buscou.
    **Lição: ao acrescentar uma capacidade, varrer os rótulos que a MENCIONAM —
    eles viram promessa no instante em que ela passa a existir.**
  - **`reconhecerImagem` é o ponto ÚNICO da chamada ao motor**, usado pela folha
    de PDF e pelo anexo: com duas chamadas, a nota de progresso, a média de OCR
    e o nome do backend divergiriam no primeiro ajuste feito só de um lado. Ela
    LANÇA no erro — o que se escreve no arquivo quando o reconhecimento falha é
    diferente numa folha e num anexo.
  - O anexo só conta em `comTexto` **quando o OCR de fato leu algo**: o número
    vai no cabeçalho do `.md` e não pode inflar com anexos que saíram vazios.
    Vazio é resultado LEGÍTIMO numa foto (a estrada rural não tem texto) e entra
    em `pagsSemOcr`, com rótulo que distingue "não achou" de "não tentou".
- **INVARIANTE: o texto extraído NUNCA entra no payload de um request A UM
  MODELO QUE LÊ PDF.** A extração da v0.21.0 foi removida (`6248c2c`) exatamente
  por isso: no Gemini, que cobra 258 tokens fixos por página de PDF e **não
  cobra o texto nativo**, mandar o texto extraído levou o contexto de 59% para
  153%. A aritmética não mudou. O destino aqui é o disco do usuário;
  `montarBlocos` não conhece este caminho. **As DUAS exceções são por CAP**, e
  em nenhuma o arquivo seria a alternativa: o modo sigiloso (o arquivo não pode
  sair) e o modelo que NÃO lê PDF (`aceitaPdf:false` — o provedor converteria
  sem OCR; ver "Modelo que não lê PDF" na seção OpenRouter).
- **Roda no DOCUMENTO OFFSCREEN**, não no content script (1,7 MB de pdf.js em toda
  página `jus.br`, expostos ao tribunal) nem no service worker (sem `new Worker`, e
  morto no meio). Permissão `offscreen` **não gera aviso de instalação**; a CSP
  `extension_pages` ganhou `'wasm-unsafe-eval'` e `worker-src 'self'` (campo de
  manifest, também sem aviso).
- **`createDocument` resolve quando o DOCUMENTO existe, não quando o script está
  pronto** — `ocr-offscreen.js` ainda vai carregar o bundle do ORT (o pdf.js saiu
  daqui na v0.51.2; quem rasteriza é o iframe de `ocr-render.js`).
  Sem o handshake (`esperarOffscreenPronto`, ping com teto de 5 s) a PRIMEIRA
  extração de toda sessão morre com "Receiving end does not exist", e some no
  segundo clique: parece intermitência de rede e não é.
- **PODAR ANTES DE CLASSIFICAR.** O carimbo do PJe/e-SAJ são ~250 caracteres
  EXTRAÍVEIS por folha. Classificando o texto cru, toda página 100% digitalizada
  passa por "texto nativo" e nunca chega ao OCR — e o usuário recebe um `.md` só com
  rodapés. O limiar (`MIN_CHARS_UTEIS_POR_PAGINA` = 50) vale sobre o texto PODADO.
- **`chaveLinha` mascara CÓDIGO ALFANUMÉRICO, e o sinal é a CAIXA.** O carimbo do
  e-SAJ traz um código por folha (`MisnBHPj`, `2R8iZpra`): sem mascará-lo, nem o
  critério literal nem o numérico pegam o carimbo. Nenhuma palavra portuguesa tem
  maiúscula no meio; todo código gerado tem. Só de dígitos ou só de maiúsculas
  (`ANTONIO`) **não** é código.
- **O critério NUMÉRICO só vale nas 3 primeiras e 3 últimas linhas** (`naBorda`).
  Apagar linha por "diferir só nos números" DESTRÓI informação quando o número É o
  conteúdo — "Valor Total do lote: R$ 1.001,00" repetido num formulário casa o padrão
  e é exatamente o dado procurado. O critério LITERAL não tem essa restrição: linha
  idêntica em 80% das folhas não carrega informação nenhuma.
- **A extração entra na fila JSF** (`ocupadoJsf`): ela baixa peça, e download de peça
  mexe na sessão. Sem isso, envio, minuta, mapa, preview e prefetch rodariam em
  paralelo e o PJe derrubaria a view da aba.
- **A peça atravessa em base64** (`chrome.runtime.sendMessage` serializa como JSON —
  um `ArrayBuffer` viraria `{}`). Custa +33% e uma cópia de string, daí uma peça por
  vez e o teto `MAX_B64_EXTRACAO`.
- **Página sem camada de texto sai MARCADA**, nunca vazia em silêncio, e "escaneada"
  é distinguida de "em branco" pelo `getOperatorList` — que só roda nas páginas
  candidatas, porque é a parte cara.
- **A DIVISÃO DE CONTEXTO É OBRIGATÓRIA, e cada peça está onde está por um
  motivo diferente.** `pdf.js` vive no IFRAME (`src/ocr-render.js`); o MOTOR DE
  OCR vive no OFFSCREEN, porque o iframe morre no F5 da página do tribunal e
  sofre throttling de aba em segundo plano, e um processo de 300 folhas leva
  minutos. E nenhum dos dois no service worker, que não tem `new Worker`.
  `getTextContent()` funciona em qualquer um dos três; `render()` é que é
  exigente — ver a regra do rAF abaixo.
- **O QUE TRAVA O `render()` É ESTAR OCULTO, NÃO SER OFFSCREEN — e confundir as
  duas coisas custou uma versão inteira.** A nota antiga aqui dizia "trava em
  documento offscreen", e a leitura natural dela é *mude de contexto e o
  problema acaba*. Mudei: o pdf.js saiu do offscreen para um **iframe também
  oculto** (1×1, `opacity:0`, `left:-9999px`, cross-origin com a página do
  tribunal) — o Chrome aplica render throttling ali exatamente como no
  offscreen, e o travamento voltou idêntico. **Ao mover código para fugir de um
  defeito, nomeie a PROPRIEDADE que o causa, não o lugar onde ele apareceu**:
  eu preservei a propriedade errada e troquei o sintoma de endereço.
  - `InternalRenderTask._scheduleNext()` chama **`window.requestAnimationFrame`**
    quando o intent é de display (só o de impressão usa microtask). Em contexto
    oculto o rAF nunca dispara e `page.render()` **não resolve NEM rejeita** —
    o pior modo de falha que existe: sem erro, sem fim, sem arquivo, e o log
    morre entre duas linhas vizinhas sem nada que aponte a causa.
  - A saída é o **shim de rAF** no topo de `ocr-render.js`, e não trocar o
    intent para `"print"` (que também evita o rAF, mas muda o que é desenhado —
    aparência de impressão das anotações; no OCR se quer a folha como o usuário
    a vê no visualizador do PJe). O pdf.js não usa o rAF para animar: usa como
    agendador de CEDÊNCIA, e essa semântica se preserva inteira.
  - **A cedência é por `MessageChannel`, não por `setTimeout(fn, 0)`.** Os dois
    funcionam em documento oculto, mas o Chrome estrangula timers a ~1/s em aba
    de SEGUNDO PLANO — e abrir processos com Ctrl+clique em várias abas é o
    padrão de trabalho no PJe. Numa extração de 54 folhas o usuário troca de
    aba, e o timer estrangulado devolveria a lentidão silenciosa que as threads
    do WASM acabaram de eliminar. `setTimeout` fica de reserva para contexto sem
    `MessageChannel`.
  - **Rede independente da causa**: `rasterizar` tem teto de tempo POR PÁGINA
    (`RASTER_TIMEOUT_MS`, 60 s contra os 159 ms medidos) e chama
    `tarefaRender.cancel()` ao estourar — sem o cancelamento, a tarefa abandonada
    seguiria desenhando num canvas já zerado. Assim um travamento futuro custa
    UMA FOLHA, nomeada no `.md`, e não a peça inteira.
  - **Log na ENTRADA da etapa longa, não só na saída.** O rastro registrava
    `raster fl.N ->` depois do trabalho: quando o render pendurou, não dava para
    saber se o laço sequer havia entrado na folha.
  - Coberto por teste que EXTRAI o shim do fonte por varredura de chaves e roda
    em `vm` contra uma janela cujo rAF nunca dispara — o primeiro caso reproduz
    o travamento, e ele existe para que a correção nunca vire fé.
- **THREADS NO WASM: 21× — e é a diferença entre usável e não.** Medido na mesma
  página, mesmo modelo, mesma máquina: **2.357 ms com 4 threads contra ~50.000 ms
  numa thread só**. Num processo real com 54 folhas digitalizadas isso é 2 minutos
  contra 45. O ORT só usa threads com `SharedArrayBuffer`, que o Chrome só entrega
  em contexto CROSS-ORIGIN ISOLATED — para páginas de extensão isso se declara no
  manifest (`cross_origin_embedder_policy: require-corp` +
  `cross_origin_opener_policy: same-origin`), e as duas chaves **não** geram aviso
  de instalação. Sem elas o recurso "funciona" e é inviável, que é o pior estado.
  Conferido: nenhuma página de extensão carrega subrecurso externo (os `https://`
  dos HTMLs são todos `<a href>` de navegação, que a COEP não governa).
- **O backend vai ESCRITO no `.md`** (`WebGPU` ou `WASM ×4`). Sem isso, uma
  regressão de isolamento faria o OCR voltar aos 50 s/página **sem sintoma
  nenhum** além de lentidão — e lentidão sem causa visível não se diagnostica.
- **O teste de WebGPU tem TETO DE TEMPO.** `isWebGpuAvailable` faz
  `await navigator.gpu.requestAdapter()`, e um documento offscreen não tem
  superfície de renderização: adapter que não resolve pendura o turno inteiro sem
  erro. Rota que pendura precisa de ALTERNATIVA, não de paciência — a mesma regra
  que o `MOVS_TIMEOUT_MS` das movimentações e o `pje login` do CLI já registram.
- **O progresso conta PÁGINAS, não peças.** O card marca uma linha por peça, e uma
  peça pode ter 22 folhas escaneadas: ver o mesmo ícone girando por minutos é
  indistinguível de travamento — foi assim que a v0.50.0 chegou ao usuário como
  "travou". A `.prep-nota` mostra a contagem e o ritmo MEDIDO, nunca uma promessa.
- **O bundle aponta o ORT para um CDN no próprio import** (`applyDefaultWasmPaths()`
  roda ao carregar). Sob MV3 esse fetch nunca aconteceria — código remoto é
  proibido. Sobrescrever `wasmPaths` depois do bundle carregar não é preferência:
  é o que faz funcionar.
- **PP-OCRv6 tier TINY, e a escolha foi MEDIDA, não herdada.** O guia
  `pp-ocrv6-extensao-chrome-mv3.docx` recomenda Small — e ele próprio manda
  decidir com documentos reais. Nas 4 páginas digitalizadas de um processo real:
  tiny 3417 chars em 3079 ms; Small 3242 em 6470 ms. 5× menor (5,96 MB contra
  29,6), 2,1× mais rápido, e melhor onde dá para ver a olho ("Acesse o vídeo
  clicando na imagem acima" contra "Acee ide cliad na magem acima").
- **O BACKEND SE PROVA POR MEDIÇÃO, nunca por disponibilidade — e a correção
  desta regra custou 7,6× num processo real.** A versão anterior dizia "WebGPU
  se prova por SESSÃO, nunca por `navigator.gpu`" e ficava com o WebGPU sempre
  que `initialize()` resolvesse. Mas **`initialize()` que resolve prova que a
  sessão SUBIU, não que ela é RÁPIDA**: no onnxruntime-web o WebGPU cobre um
  subconjunto dos operadores, e o que ele não cobre volta à CPU pagando uma
  transferência GPU↔CPU por operador. Medido num processo migrado do SAJ com 93
  folhas digitalizadas: **~18 s por página no WebGPU contra os 2,4 s do WASM
  ×4** — com o backend rápido disponível e desligado por uma decisão que nunca
  olhou para o relógio.
  - **A escolha antiga era INSTÁVEL, e é isso que a torna indefensável.** O
    teste de GPU tem teto de 3 s: com a GPU fria o `requestAdapter()` estourava
    e caía no WASM (foi assim que a v0.51.0 mediu os 2,4 s); com ela quente o
    WebGPU vencia. O mesmo pacote, na mesma máquina, ficava 7× mais lento sem
    ninguém mudar nada.
  - **O duelo roda na PRIMEIRA PÁGINA REAL**, não num benchmark sintético: a
    mesma imagem, o mesmo modelo, e o resultado do vencedor é o resultado da
    página — a medição não custa uma página a mais. É também a página do
    processo que o usuário está de fato extraindo, que é a régua certa.
  - **O ORÇAMENTO DO DESAFIANTE SAI DO CAMPEÃO** (`min(60s, max(20s, 4×msWasm))`):
    ele não precisa terminar, precisa GANHAR. Esperar o fim encareceria a
    primeira página, que é justamente a que o usuário está olhando.
  - **A decisão é MEMORIZADA, nunca hardcodada** — mesma lição do
    `safety_settings` do Gemini. `chrome.storage.local` e não `session`: é
    propriedade da MÁQUINA (que GPU tem, e se ela ganha do WASM com threads),
    não da sessão do navegador. `VERSAO_DUELO` a invalida quando muda o modelo,
    o ORT ou o pré-processamento, e o botão "Medir de novo o motor de OCR" nas
    opções existe para o dia em que a máquina muda (driver, placa, o notebook
    que passou a usar a GPU dedicada).
  - **QUEM PERSISTE É O WORKER.** Documento offscreen só tem `chrome.runtime`
    garantido — **nem `chrome.storage`** (a regra já estava escrita no cabeçalho
    de `ocr-offscreen.html` e foi violada na primeira versão desta rodada). A
    decisão lembrada chega no pedido (`msg.backend`) e a medida volta na
    resposta (`decisao`); `background.js` grava. O offscreen VALIDA a versão,
    porque é ele que conhece as condições sob as quais a medição vale.
  - **O `try` em volta de `medirBackends` é a garantia por CONSTRUÇÃO.** Dentro
    dela já há tratamento, mas tratamento é inspeção — e um `ReferenceError` no
    próprio caminho de erro escapa dele. Foi exatamente o que aconteceu: uma
    constante removida numa edição derrubou a página inteira a partir do bloco
    que existia para não deixar isso acontecer. `node --check` não pega (é a
    armadilha do `no-undef` já registrada em "Desenvolvimento e teste"); quem
    pegou foi o teste em `vm` com motor falso.
- **O PREPARO DA PRÓXIMA PEÇA É PIPELINADO AO OCR DA ATUAL** (`prepararPeca` +
  `emPreparo` no laço de `onExtrairTexto`) — a mesma técnica da bomba de upload
  dentro de `baixarSelecionadas`. Baixar e rasterizar não disputam recurso com o
  reconhecimento: o download é rede mais a fila JSF, a rasterização é o pdf.js no
  iframe, o OCR é o motor no offscreen. Em série o turno custa
  `Σdownload + Σraster + Σocr`; adiantando UMA peça, custa `Σocr` mais o preparo
  da primeira. Num processo migrado do SAJ — 96 peças de UMA página digitalizada
  cada — é o preparo inteiro que sai da conta.
  - **Profundidade 1**, deliberada: cada folha rasterizada é um data URL de
    ~250 KB vivo em memória, e adiantar várias peças de 20 folhas encheria a aba
    para ganhar um tempo que a fila serializada do PJe não deixa ganhar.
  - **`prepararPeca` NUNCA REJEITA** (devolve `{erro}`): uma rejeição de peça
    adiantada não teria ninguém esperando por ela no instante em que acontece —
    seria unhandled rejection derrubando o turno por causa de uma peça, o oposto
    da regra de que falha de download não derruba a extração.
  - O cancelamento e o `telaMorta` são reconferidos DEPOIS do `await emPreparo`,
    não só no topo: estado conferido antes de um `await` precisa ser reconferido
    depois dele.
- **TEMPO POR ETAPA, e não um número só.** O card mostrava "~18,0 s por página"
  calculado como `(agora − início) ÷ páginas reconhecidas` — somando ao OCR o
  download de cada peça na fila do PJe e a rasterização. O usuário lia aquilo
  como "o OCR leva 18 s", e não havia como saber onde o tempo estava indo:
  **otimizar sem separar as etapas é apostar.** Hoje o offscreen devolve o `ms`
  MEDIDO do reconhecimento, o card mostra "OCR x,x s · ritmo y,y s/pág" (duas
  grandezas, porque respondem a perguntas diferentes: o ritmo estima quando
  termina, o tempo de OCR diz se o motor está no backend certo) e o resumo final
  vai ao console com as quatro parcelas. A média de OCR entra no cabeçalho do
  `.md`, ao lado do backend, pela MESMA razão que ele: uma regressão de
  desempenho não deixa outro vestígio.
- **A RASTERIZAÇÃO MIRA UM LADO ALVO EM PIXELS (`LADO_ALVO_PX` = 1700), não uma
  escala fixa.** `scale: 2.0` multiplica o mediabox, e portanto entrega
  resoluções DIFERENTES conforme o tamanho da página: numa A4 dá os 1684 px que
  se quer, num ofício com mediabox de 300×400 pt dá 800 px — resolução baixa
  demais, e o resultado é OCR ruim numa página que o motor leria bem. O alvo saiu
  de dois números do próprio motor: ele recorta do canvas CHEIO limitado por
  `maxCropSourceSideLength` = 2000 px (passar disso é rasterizar pixels que ele
  descarta) e normaliza cada linha para 48 px de altura — numa A4 com ~45 linhas,
  a 1700 px a linha tem ~21 px e é ampliada 2,3×; a 1264 px (a escala 1.5 que a
  skill do usuário sugere) seria ampliada 3×, com mais borrão. **Baixar a escala
  não é de graça: o ganho aparece na rasterização e a conta chega no
  reconhecimento.**
- **Página lida com sucesso PRECISA perder o `estado` de classificação.** Ele
  nasce como `"escaneada"`/`"camada-ruim"` e era usado depois para contar as
  páginas sem texto reconhecível, de modo que toda página lida com sucesso
  continuava contada como não lida: num processo real o cabeçalho dizia "93
  reconhecida(s) por OCR local" e "93 sem texto reconhecível" — as mesmas 93. O
  corpo do arquivo estava certo (o texto sai por `f.texto`), então o defeito
  vivia só na contagem — e o `.md` sai da ferramenta e vira registro de
  trabalho: ele não pode mentir sobre o que leu. Hoje o sucesso grava
  `"ocr-ok"`, e sobram na contagem os dois casos legítimos (a página que não
  chegou a ser tentada e a que o OCR leu sem achar texto).
- **O `.wasm` e o `.mjs` do ORT vêm da MESMA compilação, e os dois vão no
  pacote.** Copiar só o `.wasm` devolve "no available backend found". A variante
  é a `jsep`, que traz WebGPU **e** o caminho WASM no mesmo arquivo — conferir
  com `grep -o "ort-wasm[a-z0-9.-]*" vendor/ppu-ocr.web.bundle.js` ao atualizar.
- **Rasteriza-se SÓ o que vai ao OCR.** Num processo real, 4 páginas de 41. Uma
  A4 a 144 dpi em RGBA são ~13 MB antes do JPEG; rasterizar tudo mataria a aba e
  trocaria segundos por minutos. O canvas ganha FUNDO BRANCO antes do render:
  PDF sem fundo declarado renderiza transparente, e transparente vira PRETO no
  JPEG — o OCR receberia uma folha preta.
- **A página vai ao offscreen como data URL, nunca Blob**: um Blob atravessa
  `chrome.runtime.sendMessage` como `{}` vazio. Já o PDF vai ao iframe por
  `postMessage` com o ArrayBuffer TRANSFERIDO — cópia zero; pelo worker ele
  viraria base64 (+33%) e mais duas cópias de string.
- **O NONCE do iframe não é zelo**: ele é criado a partir do contexto da página
  do tribunal, e qualquer script dela pode postar nele. Sem o nonce, um script
  do PJe mandaria um PDF arbitrário para processamento.
- **Página que o OCR leu vem MARCADA no `.md`, com a confiança.** OCR erra, e
  quem assina precisa saber o que conferir. E imagem sem texto legível — a foto
  de uma estrada rural — sai dizendo isso: o resultado vazio ali está CERTO.
- **BUG-21 RESOLVIDO, e a lição não é a que o nome sugere.** Ele foi catalogado
  como "`page.render()` trava em documento offscreen", e o iframe de página de
  extensão foi adotado como a saída. **O iframe é oculto e o travamento veio
  junto** — a causa era o rAF congelado em contexto que não pinta, e isso vale
  para offscreen, para `display:none` e para iframe cross-origin fora da
  viewport. Quem resolve é o shim de rAF (ver a regra acima); o iframe continua
  certo pelos outros motivos (CSP e globais de extensão, nenhum bundle em página
  de tribunal), só não era suficiente sozinho.

## Seleção assistida por IA (`✨ Escolher com IA`)

Camada 2 da seleção; a camada 1 (`classificarPeca`, por regex) continua sendo o
padrão instantâneo e é a única que funciona sem chave, offline e em 0 ms. O botão
vive na `.docs-tip` (escopo "lista toda", regra do DESIGN.md §5), ao lado de
`⟳ Carregar tudo` e `⬇ Baixar .zip`.

- **Só a LISTA sai no request** — `#nº | id | título | tipo | data | quem juntou |
  etiqueta da triagem local | páginas`, nenhum byte de conteúdo de peça. É um chat
  comum e ISOLADO (sem tools, sem blocos `document`, fora de
  `conversation`/`pecasNaConversa`), como a minuta e o mapa: por isso funciona nos três
  provedores. ~28 tokens por peça (200 peças ≈ 5,7 mil tokens).
- **A lista vai em ordem CRONOLÓGICA, e isso é correção de um defeito**
  (`listaParaIA` reusa `PjeExport.ordenarCronologico`, a mesma da exportação em
  `.zip`): a lista da tela vem do mais RECENTE para o mais antigo, e o prompt
  antigo dizia "a primeira 'Petição' costuma ser a inicial" — apontando o modelo
  para a petição mais recente, o oposto do que se queria, justamente na peça mais
  importante do processo. As linhas são numeradas e o critério da ordenação (dado
  ou premissa) vai DITO no texto.
- **Os SINAIS valem mais que o raciocínio** — é a aposta desta camada. Cada linha
  leva também **quem juntou** (distingue a petição do autor da do réu), o **tipo
  oficial** (só quando difere do título — senão é token puro), a **etiqueta da
  triagem local** (`classificarPeca`, apresentada como palpite, não veredito) e o
  **nº de páginas** quando a peça já foi baixada (uma "Petição" de 2 páginas é
  encaminhamento; de 40, é a inicial). `docsCache` é um **Map**: acesso por
  colchetes devolveria `undefined` sempre, e a falha seria muda.
- **`effort` BAIXO, qualquer que seja a preferência salva** (`EFFORT_TRIAGEM`, via
  `payload.effort` → override em `executarTurno`): a triagem é classificação sobre
  metadados, e com raciocínio alto o usuário esperava dezenas de segundos por uma
  lista de ids — a queixa que originou a rodada. O override é por turno e não toca
  na configuração, que segue valendo para o chat.
- **System PRÓPRIO e enxuto** (`systemTriagem`): o system do chat traz regras de
  citação por página, de não-invenção, de busca web e do inventário — nada disso se
  aplica a quem não lê peça nenhuma, e ainda são ~900 tokens a conciliar. O que
  importa dali é a FICHA do processo (classe, assunto, partes), que `contextoDoProcesso`
  já monta e diz o que é relevante NESTE caso.
- **Marcação AO VIVO** (`idsParciais` + `marcarParcial`): os `ids` são o primeiro
  campo do JSON, então as peças acendem na lista enquanto o modelo ainda escreve os
  motivos — a espera vira progresso visível. Só id fechado entre aspas conta (um id
  pela metade marcaria a peça errada). Como isso mexe na seleção antes de o turno
  terminar, o painel manda a seleção anterior no callback (`iaCb(docs, texto,
  getSelected())`) e **erro ou resultado vazio restauram o estado do usuário**.
- **Acima de `MAX_LINHAS_IA` (400) o corte é pelo MEIO**, não pelas pontas: a
  inicial está no começo e a sentença no fim; o miolo é onde vive o expediente
  repetitivo. A omissão vai dita numa linha própria — sem cap silencioso.
- **Sob demanda, nunca automático**: nada acontece sem o usuário pedir — zero custo
  surpresa, zero latência não solicitada, e o resultado é sempre atribuível a uma ação
  dele (coerente com o guia do painel afirmar que a extensão não é agente autônomo).
- **O texto do campo vira o OBJETIVO** e NÃO é consumido: "houve prescrição?" traz
  peças diferentes de "qual o valor da causa?"; vazio, o objetivo é descrever o
  processo. A pergunta continua no campo, pronta para enviar com as peças certas.
- **A escolha SUBSTITUI a seleção** — contrato oposto ao dos três degraus, que somam.
  Uma escolha que só acrescenta não é uma escolha: se a IA concluiu que a peça é
  irrelevante e ela segue marcada, o pedido não foi atendido.
- **O parser assume que o modelo vai desobedecer** (`lerJsonEscolha`): corta do
  primeiro `{` ao último `}` (sobrevive a cerca ```` ``` ```` e preâmbulo), descarta id
  que não está na lista, deduplica repetidos e, se nada sobrar, **não desmarca nada**
  e diz o que fazer. Cada uma dessas defesas tem teste.
- **Auditável**: o motivo de cada peça vai no `title` da row e o critério na
  `.sel-nota` — o usuário precisa poder discordar.

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

**A peça que falha SAI DA SELEÇÃO** (`panel.desmarcarPecas`), e isso completa a
tolerância acima — sem esse passo ela seguia marcada, era re-tentada a cada turno e,
quando era a única peça NOVA, abortava o turno seguinte inteiro: o usuário perdia a
pergunta já digitada e tinha de caçar na lista qual das duzentas era a culpada. Como
ela nunca entrou no histórico, desmarcá-la não tira nada do contexto; marcar de novo é
nova tentativa de download, e o aviso diz isso. `desmarcarPecas` cobre a row LAZY
(remove de `selPendente`), senão a peça voltaria marcada no próximo `setDocs`.
Desmarcar durante `busy` é seguro: `onSelectionChange` retorna cedo.

O caso degenerado (tudo falhou, sem histórico e sem anexo) ainda derruba o turno — e
ali o `throw` pula o relatório, então o `desmarcarPecas` acontece ANTES dele, ou o
próximo envio repetiria a mesma falha.

## A sessão JSF é UMA fila só (a tela do PJe não pode morrer)

Sintoma que originou a regra: em processo grande, ao clicar **Enviar**, a página
dos autos virava a tela de erro do PJe. A sessão continua **viva** (reabrir o
processo resolve sem novo login) — o que morre é a **view JSF daquela aba**: o
servidor guarda o estado de cada tela numa lista por sessão, e cada POST de
página inteira empurra a mais antiga para fora.

**Quem gasta view em volume é a leitura da grid**: `listarPelaGrid` faz um POST
de página inteira POR PÁGINA (armadilha 4 de `docs/pje-tela-documentos.md`).
Medido no processo P4: **138 peças ≈ 9 páginas ≈ 10 a 12 telas
novas**, contra um teto por sessão da ordem de 15. **Quem descobre o estrago é o
`link.click()` da ativação**, o primeiro postback seguinte — daí o erro aparecer
no Enviar, e não no ⟳ que o causou.

**Por que a rota REST não custa view — agora por MECANISMO, não só por medição**
(fonte: `web.xml`/`components.xml` do PJe legacy; ver `docs/pje-api-rest.md`): o
**Faces Servlet**, único que cria e despeja view state, está mapeado só em
`*.seam`/`*.xhtml`. As rotas REST não passam por ele; o que elas recebem é o
**Seam Filter**, mapeado em `*.seam` **e** `/seam/resource/rest/pje-legacy/*`, que
dá o contexto de sessão — daí o cookie bastar e não haver token. Confirmado em
sessão real (13/08/2026): ~60 requisições REST seguidas e a tela seguia viva,
com `ViewState` no DOM. Corolário que vale como regra: **rota fora do prefixo
`pje-legacy/` não recebe o Seam Filter** (`fluxo`, `informacaoSessao`,
`monitoracao`, `miniPac`) — e na sondagem elas **penduraram**, que é pior que
erro, porque prende o turno. Não chamar.

- **`ocupadoJsf()` é a fila única** (content.js, ao lado de
  `bloqueadoPelaExportacao`). Envio, minuta, mapa, preview, prefetch,
  refinamento, exportação e leitura da grid cedem uns aos outros. A matriz
  handler × flag **já divergiu uma vez** — só a exportação e as precatórias
  tinham as três, e o par que o usuário cruza de verdade (marcar peças e enviar
  enquanto o ⟳ roda, que leva até 120 s) não era guardado por ninguém. Coberto
  por teste tabular que varre o fonte.
- **A recusa diz motivo e progresso** (`progressoGrid`, "página 7 de 14"): negar
  por dois minutos sem explicar é indistinguível de travamento.
- **`salvarCasoAgora()` roda ANTES do `startPrep`**, dentro de
  `baixarSelecionadas` — o funil dos três pares baixar→subir, mesma razão de a
  bomba de upload morar ali. Se a tela morrer no meio das ativações, o usuário
  reabre o processo e o que já baixou está no disco COM o `fileId`. Tem de ser
  `salvarCasoAgora` e não `agendarSalvar`, que retorna cedo durante `busy`.
- **`telaMorta` para o lote em vez de martelar**: depois que a view morre, cada
  peça restante é só mais um POST que produz erro. As pendentes viram falhas com
  motivo próprio. O aviso vai por `setStatus` e **nunca** por `setAlerta`, que
  embute um botão "Nova conversa" — a ação errada, já que jogaria fora a conversa
  recém-gravada.
- **Mas a morte é CONFIRMADA em duas leituras, e a segunda não é zelo.** O
  sintoma que `marcarTelaMorta` observa é `#divTimeLine` ter sumido — e o mesmo
  A4J que entrega a peça também **re-renderiza a timeline** (é o que troca os
  nós no lazy load). Durante a troca o nó não existe, então um retrato tirado
  ali é indistinguível da tela de erro. O falso positivo é o pior tipo: `telaMorta`
  nunca volta a `false`, então ele aborta o lote, transforma as peças pendentes
  em falhas nomeadas e desliga download, prefetch e medição **pelo resto da
  sessão** — sem saída que não seja recarregar a página, e anunciando uma
  expiração que não houve. A segunda leitura (700 ms) só roda no caminho em que
  a timeline já sumiu, e separa o re-render, que dura um instante, da morte de
  verdade, que não volta mais.
- **A concorrência de download CEDE à ativação** (`CONCORRENCIA_DOWNLOAD` = 3, e
  os workers esperam enquanto `PJE.ativacaoEmVoo()`): três GETs mais os oito HEAD
  do poll mais o POST A4J são quatro frentes na mesma sessão. Adaptativo em vez
  de fixo em 1 porque o caso comum — peça que vem pela rota completa, sem tocar
  no JSF — não perde velocidade nenhuma. Vale nos DOIS laços de download
  (`baixarSelecionadas` e `baixarQuieto`).
- **ARMADILHA da cedência: o `await` invalida o topo do laço.** Os dois workers
  testavam `while (fila.length)` e faziam `shift()` sem nada no meio; a espera
  pela ativação abriu uma janela entre os dois. Com 2 peças e 3 workers, dois
  esperam o mesmo POST, acordam juntos, o primeiro leva a última peça e o
  segundo recebe **`undefined`** — que vira um GET para uma URL com "undefined"
  e uma falha fantasma no relatório do chat. Por isso `telaMorta` **e** o
  `shift` são reconferidos DEPOIS da espera (`if (id === undefined) break`).
  Regra geral: **estado conferido antes de um `await` precisa ser reconferido
  depois dele.** Coberto por teste que reproduz a corrida com e sem a guarda.
- **AVALIADO E DESCARTADO: devolver o iframe à tela dos autos antes do
  `remove()`.** Parece prudente e é contraproducente — `iframe.src =
  location.href` carrega `listAutosDigitais.seam` outra vez e **cria mais uma
  view**, gastando justamente o recurso que se esgotou, além de até 8 s de
  espera. O benefício suposto ("tela corrente em escopo de sessão") não é o
  mecanismo que a mensagem do PJe indica: "Sua página expirou" é
  ViewExpiredException, que é view state.
- **A lista da grid é gravada na memória de caso** (`gravarGrid`/`hidratarGrid`):
  o ⟳ passa a valer por PROCESSO, não por sessão. Ganho duplo — some a exposição
  repetida e o **tipo oficial** já está na primeira pintura da lista (é dele que
  sai o degrau `chave`, antes perdido até alguém reler a grid). `gravarGrid` é
  chamada UMA vez por leitura e **nunca** entra em `snapshotCaso`: são ~25 KB num
  processo de 138 peças, e o debounce dispara a cada peça que baixa.
- **Cache no disco obriga a datar TODA afirmação sobre a lista.** `gridInfo`
  deixou de ser "o que esta sessão leu" e passou a poder vir de semanas atrás. A
  dica da lista já dizia "lida em DD/MM"; faltava o mesmo em
  `descreverOrigemLista`, que escreve o LEIA-ME e o índice do **`.zip`** — e
  ali custa mais caro, porque o pacote sai da ferramenta e vira registro:
  afirmar "por completo" no presente sobre uma leitura antiga esconde que as
  peças juntadas depois não estão lá. Fora do dia da leitura, o texto diz a data
  **e** a consequência.
- **O que NÃO dá para corrigir daqui vira ORIENTAÇÃO no gesto** (`.gwarn` em
  panel.js + a seção `#expirou` do `help.html`). A parte do problema que sobra
  depois de todas as guardas é **comportamento**: quantas abas do PJe estão
  abertas (todas dividem a MESMA sessão) e quando o usuário clica no ⟳. Isso não
  se resolve em código — e um guia que ninguém abre antes de clicar também não
  resolve. Por isso o aviso é um modal **no clique do ⟳**, com o que vai
  acontecer, o que fazer (fechar as outras abas é o item nº 1, é o que mais muda
  o resultado) e a garantia de que nada se perde. Regras: quem decide mostrar é
  o PAINEL, não o content.js (é UI pura — o `carregarTLCb` nem sabe que o aviso
  existe); a leitura de `avisoGridVisto` acontece **no clique**, nunca no boot,
  o que dispensa a armadilha de callback síncrono que já mordeu `docsOcultas` e
  `guiaAberta`; e há "não mostrar de novo", porque o aviso é para ensinar, e
  quem já aprendeu não precisa ser abordado a cada processo.
- **O custo da leitura é dito ANTES, e o convite à releitura vem com o preço.**
  O total de páginas é sabido já na 1ª e é o melhor previsor do efeito colateral:
  passando de ~6, a view desta aba pode ser despejada — e quem descobre é o
  gesto seguinte do usuário (o Enviar), que então parece o culpado. Pela mesma
  razão, a dica de leitura PARCIAL não pode só convidar a "clicar de novo": a
  releitura **recomeça da primeira página** e é exatamente o gesto que gasta
  view em volume. As duas frases dizem também que nada se perde, que é a
  pergunta real de quem vê a tela do PJe cair.
- **NÃO mexer no `ca` da URL do iframe.** Testado na sessão real:
  `listAutosDigitais.seam?idProcesso=…` sem o `ca` responde "Sem permissão para
  acessar a página" — ele é a **chave de acesso**, não a conversação. Quem
  identifica a conversação Seam é o **`cid`** (`error.seam?cid=681717`). Removê-lo
  mataria a rota da grid em SILÊNCIO: o `catch → null` cai no scroll, a lista
  continua vindo e o defeito passa despercebido por semanas. Confirmação
  independente: o PJe expõe
  `GET …/rest/pje-legacy/painelUsuario/gerarChaveAcessoProcesso/{idProcesso}`,
  que devolve exatamente esse token — o nome do endpoint encerra a questão.
- **Instrumentação atrás de `DIAG`** (`dlog` em pje.js, `console.log` e nunca
  `console.debug` — Verbose vem desligado): contador de ativações por turno (o
  número que decide se vale mexer na serialização do submit A4J), páginas e
  requisições da grid, e as três sentinelas — `pagehide` com o último gesto JSF
  (o único registro do instante da morte, e só sobrevive com "Preserve log"),
  `#divTimeLine` sumido (a variante sem navegação) e `PJE.ehTelaDeErro()` no
  bootstrap, que é o único sinal que sobrevive à navegação.
- **Partir a leitura da grid em levas com clique foi avaliado e DESCARTADO**: as
  páginas já são lidas sequencialmente, então o teto não reduz concorrência
  nenhuma — é o mesmo total de POSTs, com fricção no meio. O que reduz POSTs é
  não repetir a leitura (cache) e, se a grid oferecer, mais linhas por página.

## Anexos do input (📎) — arquivos do usuário na conversa

Arquivo que o usuário solta na caixa de mensagem (PDF, `.docx`, `.rtf`, `.txt`, `.md`)
para analisar junto das peças **ou sozinho**. A UI é reflexo; o dono é a Map `anexos`
em `content.js`.

- **Id sintético `anexo:<n>` e entrada no MESMO formato do `docsCache`**
  (`{kind, fmt, b64|text, pages…}`): é o que faz `montarBlocos`, `paginasDe`,
  `estimativaLocalTokens` e `pecasTruncadas` tratarem anexo e peça pelo mesmo caminho,
  via **`entradaDoc(id)`** (`docsCache.get(id) || anexos.get(id)`). Ler `docsCache` cru
  num desses fazia todo anexo cair em `semConteudo` e nunca chegar ao modelo.
  **O contra-exemplo dessa unificação — e o único até agora — foi o TETO de texto**:
  o anexo herdou por tabela o corte de 60.000 chars pensado para peça HTML de ~30
  páginas, e um `.md` de 1,57 milhão entrava a 3,8% num modelo de 1M. Compartilhar o
  caminho é certo; compartilhar um NÚMERO calibrado para o outro caso não era. Hoje o
  teto acompanha a janela do modelo (ver a invariante do teto de texto acima). Ao
  unificar peça e anexo num caminho novo, conferir se as CONSTANTES daquele caminho
  também valem para os dois.
- **`comAnexos(ids)` é a fronteira, e ela tem nome de propósito**: tudo que **MEDE**
  (estimativa local, `paginasDe`, o `ativos` do pré-voo, o gauge) precisa dos anexos;
  tudo que **BAIXA** (`precisaBaixar`, `baixarQuieto`, `subirPecas`,
  `revalidarPecasDoHistorico`) precisa ficar SÓ com as peças — um `"anexo:1"` na fila de
  download vira uma ida ao PJe atrás de peça que não existe. O erro que isso já causou:
  `refinarContexto` montava o request prospectivo com `ativos = new Set(ids)` e, como
  `prepararEnvio` remove todo bloco com `__pecaId` fora de `ativos`, o **pré-voo media um
  envio SEM os anexos** — a guarda de 90% ficava otimista justamente depois de anexar um
  PDF grande. Mesmo eixo do par `precisaBaixar`/`temBytes`: a pergunta parece uma só e
  são duas.
- **Nada vai ao disco.** `conversaParaDisco()` troca cada bloco de anexo por um STUB sem
  bytes antes do snapshot da memória de caso, e `aplicarConversa` os REMOVE na retomada
  (com aviso para reanexar). Ao contrário de uma peça, um arquivo do usuário não tem de
  onde ser rebaixado — guardá-lo seria criar cópia permanente de um documento que ele só
  quis mostrar uma vez. `ehBlocoAnexo` é o predicado ÚNICO dos dois lados.
- **`upload` de anexo NÃO manda `cacheKey`**, ao contrário de `subirPecas`. O cache do
  worker vive em `chrome.storage.session`, que sobrevive ao F5; os anexos, não — e
  `anexo:<n>` reinicia em 1 a cada carga da página. O par (processo, `"anexo:1"`,
  tamanho) de hoje colidia com o de um arquivo DIFERENTE de antes do último
  recarregamento, e o worker devolvia o `file_id` do velho: o modelo analisava um
  documento que o usuário não anexou, em silêncio. Dentro da sessão quem evita o
  re-upload é o `d.fileId`, então o cache ali era só risco.
- **`.docx` é o caso à parte**: NENHUM dos três provedores o lê nativamente como
  documento (só o PDF tem a rota de visão), então o texto é extraído no cliente pelo
  `DocxImport` e entra como bloco de texto, igual a `.txt`/`.md`. O resto passa por
  `PJE.lerAnexo` → `lerCorpo`, o MESMO leitor das peças (`new Response(file)` herda o
  content-type do File; vazio, a detecção por assinatura assume) — nada de um segundo
  detector de tipo que pudesse divergir, e a barreira de binário/imagem vale igual.
- **Os anexos entram SEMPRE em `ativos`** no envio: seus blocos levam `__pecaId` para o
  ✕ do chip poder liberá-los do contexto como uma peça desmarcada, mas enquanto estão
  anexados não são "peça desmarcada" — sem isso `prepararEnvio` os filtraria já no 2º
  turno. Removê-los é ação explícita (o ✕ tira o id de `anexos`, e aí o filtro passa a
  valer).
- **Nunca pular o pré-voo com anexo novo** (`!anexosNovos.length && podePularPreVoo(…)`):
  o que não foi medido não pode ser dispensado da medição.
- Anexos são da CONVERSA, não do processo: "Nova conversa" os solta (as peças, não —
  elas servem a todas as conversas daquele processo). Tetos: 10 por conversa, 32 MB por
  arquivo, antes do teto de b64 compartilhado com as peças.
- **CONVERSAR SÓ COM O ANEXO, sem marcar peça, é caso de uso de primeira classe**
  — o documento que chegou por e-mail, o contrato que a parte trouxe, a peça de
  OUTRO processo que se quer comparar. Duas frentes, e as duas já custaram o
  recurso inteiro:
  - **As DUAS guardas do envio contam `anexos.size`, nunca `anexosNovos`.**
    `anexosNovos` é o DELTA (o que ainda não subiu): no 1º turno ele é
    não-vazio e tudo passa; do 2º em diante o mesmo arquivo já está no
    histórico, o delta esvazia e o turno morria — primeiro na guarda de entrada
    ("Marque uma peça, anexe um arquivo…") e, se ela passasse, no
    `!idsNovosParaBlocos.length && !pecasNaConversa.size` lá dentro ("não há
    peça marcada nem arquivo anexado para analisar"). As duas frases são falsas
    com o chip do arquivo na tela. `anexos` é o **simétrico de
    `pecasNaConversa`** para os arquivos do usuário: o que está no contexto
    AGORA. Corrigir só uma delas não destrava nada — o ramo `else` que segue
    "com o contexto já anexado" sempre esteve certo; faltava chegar nele.
  - **`soAnexosNoContexto()` reescreve as premissas do system** (zero peças
    marcadas, zero em `pecasNaConversa`, ≥ 1 anexo). Sem isso o system afirmava
    "Processo em análise: X", o inventário listava as peças não marcadas, e o
    modelo concluía que o usuário se enganara: respondia com uma cobrança para
    marcar peças em vez da resposta. No modo, (a) o número e a ficha viram
    "processo aberto na tela (contexto, NÃO o objeto desta conversa)" — a ficha
    CONTINUA indo, é ela que permite dizer com precisão que o arquivo é de outro
    processo; (b) entra o `PROMPT_SO_ANEXOS`; (c) `comInventario` não anexa o
    inventário (era a fonte dos ids da cobrança, e são ~2 mil tokens por
    mensagem numa conversa que não é sobre estes autos).
  - **É um modo LIDO do estado, nunca um toggle na UI**: sai sozinho no instante
    em que uma peça é marcada. Um interruptor pediria ao usuário que declarasse
    o que a seleção já diz, e seria mais um estado para dessincronizar do
    contexto que de fato vai à API.
  - **O aviso de divergência PERMANECE** (o `[!ALERTA]` do `PROMPT_DESTAQUES`):
    anexar o arquivo errado é erro caro e o usuário precisa saber. O que o modo
    remove é a INSISTÊNCIA depois do aviso.
  - Coberto por teste de integração em jsdom (content.js real, 2 turnos com o
    mesmo anexo) que verifica os dois desbloqueios, o system do modo, a ausência
    do inventário — e a REGRESSÃO: marcar uma peça devolve "Processo em análise"
    e tira o trecho.
  - **MINUTA E MAPA TAMBÉM ACEITAM ANEXO SEM PEÇA** (v0.59.0). Até aqui os dois
    tinham a guarda dura `selectedIds.length === 0` e recusavam com "Marque as
    peças que devem embasar a minuta" — com o chip do arquivo na tela. Quatro
    frentes, e a ordem em que elas mordem importa:
    - **O PAINEL guarda ANTES do content, em QUATRO pontos** (o botão e o envio,
      de cada modo), e corrigir só o content não destrava nada: o `.btn-minuta`
      nem ENTRAVA no modo, então o Enviar seguinte virava uma mensagem de chat
      comum. `temMaterialParaAto()` é a fonte única — "há material para embasar?"
      não é "há peça marcada?".
    - **O gancho de ANONIMIZAÇÃO dos anexos** (e o do texto local) precisa
      existir nos dois fluxos: os anexos não passam por `baixarSelecionadas`, e
      desde que `entradaDoc` falha FECHADO sob sigilo, um anexo não mascarado
      SUMIRIA do request — a minuta sairia sem o documento que a embasa,
      justamente no modo em que isso mais importa.
    - **O SYSTEM DA MINUTA precisou de premissa própria** (`PROMPT_MINUTA_SO_ANEXOS`,
      e `systemMinuta` passou a receber `soAnexos`). É o ponto mais grave da
      rodada: `systemMinuta` chamava `contextoDoProcesso(false)` HARDCODED, então
      um ato redigido a partir de um contrato anexado saía com o system afirmando
      "Processo em análise: X" e mandando a ficha com os titulares de cada polo —
      e o modelo preenchia cabeçalho e dispositivo com **as partes do processo
      aberto na tela**. Um ato com as partes erradas é o pior defeito possível
      num documento assinado, e sai plausível e bem escrito. O MAPA não precisou:
      ele usa `systemPromptAtual()`, e `soAnexosNoContexto()` já dá true ali.
    - **A CITAÇÃO ganhou ramo** — anexo não tem id, e o `SUFIXO_MINUTA` exige
      `(Título da peça, id 123456, fl. 7)` em toda afirmação: sem forma própria o
      modelo fica entre omitir a origem e inventar um id. A forma é
      `(arquivo anexado «nome», fl. N)`, e ela mora no texto do turno, **não na
      constante compartilhada** — assim a minuta sem anexo sai byte a byte como
      antes. Mesma razão da exceção da movimentação.
    - **`origem` grava os anexos, e o objeto é montado CAMPO A CAMPO** (não há
      spread do `ctx` em `guardarMinuta`). Passar o dado no `ctx` não o
      persiste: a primeira versão desta rodada tinha o `ctx.anexos` preenchido,
      o comentário justificando o art. 19, §6º e o editor lendo `o.anexos` em
      TRÊS pontos — com o campo nunca chegando ao disco. `node --check` passa, o
      ESLint de `no-undef` passa, e o registro do ato sai incompleto exatamente
      no caso em que alguém pergunta de onde ele veio. **Ao acrescentar um campo
      a um registro persistido, conferir a lista de chaves do objeto, não o
      chamador.** Mesmo eixo do `garantirBaixada`, que precisa de `Object.assign`
      e não de um `set` cru.
    - **`origem.soAnexos` existe porque o `processo` gravado continua sendo o da
      TELA.** `guardarMinuta` lê `PJE.getNumeroProcesso()` sempre, e antes desta
      rodada isso era sempre verdade — não havia minuta sem peça. Com o caso
      novo, o cartão de "Minhas minutas" passou a exibir o CNJ como se fosse o
      objeto do ato. Guardar o número continua certo (a minuta nasceu ali, e é
      por ele que a busca a acha); o que não pode é a afirmação implícita. A
      marca `de arquivo anexado` vem ANTES do número no `.mc-meta`, para
      reordenar a leitura, e o `title` do processo diz que ele é contexto — a
      MESMA distinção que o `soAnexosNoContexto()` já fazia no system prompt.
      **Um caminho novo pode tornar falso um campo que sempre foi verdadeiro:
      ao permitir um estado que não existia, varrer quem LÊ o registro.**
    - Coberto pelos cenários F, G e H do `t-content.mjs` — o G é a
      NÃO-REGRESSÃO: com peça marcada, o system volta a afirmar o processo e a
      lista de ids reaparece. **Correção de teste feita junto**: o stub de
      `PJE.lerAnexo` devolvia `null`, então NENHUM teste conseguia provar que o
      anexo chega ao request — o chip aparecia e o payload saía sem o documento.
      Os dois defeitos acima têm asserção sobre o REGISTRO GRAVADO (a mutação
      que remove as duas linhas do objeto `origem` derruba três asserções,
      inclusive a de não-regressão): testar o request não os alcançava, porque
      eles acontecem depois do `done`.
- **LACUNA CONHECIDA** (documentada em `subirAnexos`): anexo PDF já no histórico não é
  revalidado por `revalidarPecasDoHistorico` (o `ativos` dela é `selecaoEfetiva()`), então
  trocar a CHAVE da API no meio da conversa deixa um `file_id` de outra conta e o turno
  seguinte leva 400. "Nova conversa" resolve. Se for tratar: os bytes do anexo estão
  sempre em memória, basta re-subir e reescrever o `file_id` no bloco — sem download.

## O redesign da v0.60 — o que mudou de ANATOMIA (`panel.js` + `panel.css`)

> **Isto não foi troca de paleta.** O markup do painel foi reconstruído. O
> `DESIGN.md` §5 tem a anatomia das seis regiões com o diagrama; aqui ficam só as
> invariantes que quebram se alguém mexer sem saber.

- **A CHROME PASSOU A SER CLARA, e isso obriga TRÊS inversões — nenhuma é
  opcional.** `--on-hd-*` viram tinta ESCURA, `--veu-*` viram véus ESCUROS e
  `--sig-hd` acompanha a polaridade (verde CLARO, como o tema Papel já fazia).
  Tinta clara sobre chrome clara é texto invisível; película branca sobre chrome
  branca não revela nada. Foi o que sumiu o nome do produto do topo do popup
  quando a família `--on-hd-*` ficou de fora do `ui.css`.
- **A TINTA DA CHROME É UMA FAMÍLIA PRÓPRIA** (`--on-hd`, `-2`, `-3`,
  `-forte`), e usar `--muted`/`--text` no cabeçalho **só falha no tema que
  inverte a polaridade**. As abas nasceram com `color: var(--muted)`: certo no
  padrão claro, ilegível no `institucional`, cuja chrome é petróleo. Um erro de
  token só se revela no tema oposto — é por isso que a captura dos SETE temas
  vale mais que a inspeção do padrão.
- **`.hd button` tem especificidade 0,1,1 e governa TODO botão do cabeçalho**
  (`transparent`, `30×30`, `--r-sm`). Controle novo ali precisa de `.hd .x` **e**
  de DESFAZER o que ela impôs — `width: auto` antes de mais nada. Ela venceu o
  `.sigselo` na v0.57 e as abas na primeira versão desta barra, que saíram com
  30px e empilharam texto por cima do vizinho.
- **NENHUMA CRASE dentro de `wrap.innerHTML`.** O markup é um template literal, e
  uma crase num comentário HTML ali ENCERRA a string. O sintoma nunca aponta para
  lá: numa forma o `node --check` PASSA e o erro nasce em runtime
  (`ReferenceError: rail is not defined`); na outra é um `SyntaxError` numa linha
  que é um COMENTÁRIO. No navegador o painel simplesmente não monta. A convenção
  deste projeto é comentar muito citando seletores com crase, então a regra não
  pode depender de disciplina: `tests/t-template-crase.mjs` varre as ~365 linhas
  do template e cobra zero.
- **O medidor de contexto MIGROU** da `.metarow` para o rodapé da coluna de
  peças (`.docs-ft .gauge`) — é ali que a pergunta dele ("cabe mais peça?") tem
  resposta. Com a lista colapsada ele iria junto, e por isso a **`.docs-rail`
  passou a carregar a porcentagem**: um medidor que some não mede. As regras de
  largura que ele tinha para caber na `.metarow` (`flex: 0 0 64px`, e o
  `flex-basis: 90px` do expandido) **foram removidas**: num container em COLUNA
  o `flex-basis` é a ALTURA, e era ele que transformava a barra de 5px num blob
  de 90px.
- **`.hint-key` FOI APOSENTADA, e com ela o defeito do 📎 — por construção.** Ela
  era revelada pelo foco do textarea e mudava a ALTURA do rodapé: o
  `pointerdown` num botão da linha lhe dava foco, a faixa expandia, a `.inrow`
  subia 20px e o botão saía de baixo do cursor. Os atalhos se dissolveram no
  **placeholder** e numa linha FIXA do `.comp-meta`. Nada no rodapé cresce ou
  encolhe com o foco. A regra geral fica valendo: **faixa que muda de altura não
  pode ser disparada pelo foco de uma linha que contém botões.**
- **A `.movbox` SE APOSENTOU: a linha do tempo virou VIEW** (`.main[data-view]`
  + `.view-tempo`). Some junto toda a maquinaria de popover ancorado —
  `position: fixed` no selo, cálculo de acima/abaixo, clique-fora por
  `composedPath()` no `document`, Esc em cascata, listener de `resize`. Duas
  invariantes: a view mostra **o que foi ao modelo** (os `itens` e a marca do
  corte VIAJAM no payload de `setLinhaDoTempo`, montados do mesmo array que
  produz as linhas do request — não há segundo cálculo para divergir); e **sair
  dela é obrigação de dois caminhos** (`novaConversa` e `restaurarConversa`),
  senão a view fica presa mostrando a linha do tempo de um processo com a
  conversa de outro.
- **UM ÚNICO MÉTODO PÚBLICO NASCEU**: `panel.setSessao("viva"|"expirou")`,
  chamada de `marcarTelaMorta`. O dot da pill do processo precisa de um canal —
  `telaMorta` é estado do `content.js`. A alternativa (dot sempre verde) seria
  pior que não ter dot: um sinal que nunca muda afirma um estado que ninguém
  conferiu. Os outros 81 métodos seguem intactos.
- **O popover Exibição não reimplementa nada.** Os botões `.expand`, `.side`,
  `.free`, `.fs`, `.docsvis` e `.dl` são os MESMOS elementos, com as mesmas
  classes e handlers — mudaram de lugar e ganharam rótulo. Por isso não há um
  `aplicarModo` novo. O estado marcado é calculado NA ABERTURA (`marcarExib`), e
  não a cada troca de modo: assim a caixa não precisa ser notificada de nada e
  nunca fica dessincronizada.
- **`--cat-peticao` foi para o CIANO, e não para o indigo do desenho de
  referência.** Indigo virou a cor de AÇÃO, e uma categoria da cor dos botões
  recria a confusão que tirou petições do azul na v0.24. A regra que sobrevive
  às duas rodadas: os quatro matizes ficam a ≥ 100° um do outro e nenhum a menos
  de 50° da cor de ação.
- **Três afirmações do desenho de referência NÃO foram implementadas, e o motivo
  é o mesmo**: elas não são verdade nesta extensão.
  - *"Citação Verificada Página a Página"* — só existe com `citacoesNativas`
    (modelos Claude); nos outros três provedores a citação é textual.
  - *"Zero Alucinação Normativa"* — anunciar infalibilidade é regra proibida
    aqui, e pela razão registrada no ponteiro do TecJustiça Sigilo: produz
    confiança onde deveria produzir revisão.
  - *`fls. 132–158`* na linha da peça — a extensão **não conhece o intervalo de
    folhas**, só o total de páginas e só depois do download. Um intervalo
    inventado é plausível, verificável só nos autos, e errado.

### O que o USO REAL corrigiu (v0.60.1)

O redesign foi publicado com a suíte verde, contraste 106/106 e captura dos
sete temas — e oito defeitos só apareceram quando o dono do projeto abriu um
processo de verdade. Nenhum deles era invisível por acaso: cada um cai numa
categoria que a rede de testes **não cobria**, e é isso que vale registrar.

- **BOTÃO NOVO PRECISA SER INSCRITO NA FAMÍLIA — declarar a classe não basta.**
  O `@ Peça` nasceu na v0.60 e ficou de fora da regra que veste
  `.tgl-search, .tgl-sigilo, .btn-minuta…`: saiu com o estilo do NAVEGADOR
  (fundo cinza, borda preta de 2px, Arial), no meio de seis irmãos vestidos.
  É o espelho da armadilha do `.hd button`: lá era preciso DESFAZER o que a
  regra genérica impôs; aqui, LEMBRAR de entrar nela. Quando o estilo de um
  componente é uma lista de seletores, todo membro novo é uma edição em N
  lugares — `svg`, `:hover`, `.on` e as regras do `.estreito`.
- **CONTROLE DE FORMULÁRIO NÃO HERDA FONTE, e o painel rodava com DUAS.**
  `:host { all: initial }` corta a herança da página, e o navegador aplica a
  sua própria (`font: 400 13.333px Arial`) a `<button>`, `<input>`,
  `<textarea>` e `<select>`. Medido no expandido: **206 nós fora da família**,
  entre eles a faixa de ferramentas inteira. Defeito ANTIGO — anterior ao
  redesign — e ele não aparece como "fonte errada": aparece como uma barra que
  "não combina" com o que está em volta sem que se saiba dizer por quê. Uma
  linha (`button, input, textarea, select { font-family: inherit }`) zerou.
- **WRAPPER COM DOIS ESCRITORES: a visibilidade é DERIVADA, nunca de um deles.**
  `.cc-ctx` (linha 1 do cartão) recebe os chips de PEÇA (`syncSelection`) e os
  de ANEXO (`renderAnexos`). Ele nasceu `hidden` no template e nenhum dos dois
  o desescondia — quem escondesse apagaria os chips do outro. Resultado: com
  `[hidden]{display:none!important}`, os chips **não existiam** na v0.60, e
  com eles se foi o ✕ que tira do contexto uma peça cuja row está lazy, que
  não tem outro caminho na tela. `syncCcCtx()` deriva de `ctxbar.hidden &&
  anexosbar.hidden` e é chamada pelos dois.
  - **A asserção olha os ANCESTRAIS** (`closest("[hidden]")`), não o `hidden`
    do próprio elemento: um teste que só olhasse `.ctxbar.hidden` passaria com
    os chips invisíveis. Mesma família do stub que devolvia `null` e tornava
    indemonstrável que o anexo chega ao request.
- **MUDAR UM CONTROLE DE LUGAR MUDA O GESTO QUE ELE DEVE TER.** `.expand`,
  `.side`, `.free` e `.fs` eram ALTERNADORES — certo como ícone solto no
  cabeçalho, em que o mesmo botão liga e desliga. Dentro de um menu
  `menuitemradio` com um ✓ ao lado do item ativo, alternar mente duas vezes:
  clicar em "Largo" estando largo devolvia ao flutuante (o oposto do que o ✓
  afirma), e "Flutuante", que só existe desde a v0.60, **não tinha handler
  nenhum** — clicar não fazia nada. A nota do código dizia "os MESMOS
  elementos, com os MESMOS handlers", e era exatamente o que estava errado.
- **O `.exibbox` era o ÚNICO popover dentro do `.panel`, e por isso saía
  cortado.** O painel carrega `transform` (o FLIP e a escala do arrasto), e
  transform cria bloco de contenção para descendentes `position: fixed`: de
  dentro dele a caixa deixa de ser fixa na viewport e é recortada pelo painel.
  Todos os outros cinco (`.temabox`, `.selmenu`, `.audbox`, `.preview`,
  `.zipmenu`) já eram `wrap.appendChild`. A regra estava escrita e o
  componente novo nasceu fora dela.
- **TROCAR ÍCONE POR `innerHTML` APAGA O RÓTULO.** `setDocsOcultas` reescrevia
  o `innerHTML` do `.docsvis` para alternar o chevron — inofensivo enquanto o
  botão era só ícone no cabeçalho, destrutivo desde que ele passou a carregar
  `<span class="lbl">Ocultar as peças</span>` e a marca de estado. Como a
  função roda no BOOT (restaurando a preferência), o item do menu nascia mudo.
  Troca-se o `<svg>` (`replaceWith`), nunca o conteúdo do botão. É o inverso
  exato do `textContent` que apaga o `<svg>`.
- **TINTA DA CHROME FORA DA CHROME: `--on-hd-*` inverteu, e dois consumidores
  não estavam no cabeçalho.** `.chip-mini` (dentro da bolha do usuário,
  `--pje-2`) e `.msg.assistant pre` (dentro de `--ink`) são superfícies
  ESCURAS em todos os temas e usavam a família da chrome, que virou tinta
  escura na v0.60. O relato foi "esse roxo está escondendo o nome das peças".
  O que se varreu no redesign foram os literais `#fff`; **faltou varrer os
  consumidores dos tokens que MUDARAM DE POLARIDADE** — que é o conjunto mais
  perigoso, porque eles seguem "corretos" no tema em que foram escritos.
- **`--on-acao` TAMBÉM FAZIA DOIS TRABALHOS.** Ele é a tinta do botão primário
  e era a tinta da bolha do usuário. No tema Noite o primário é CLARO (logo
  `--on-acao` é escuro) enquanto a bolha continua sendo o azul-médio de
  `--pje-2`: o texto da própria pergunta saía a **2,38:1**, e estava assim em
  produção. Daí `--on-bolha`. É a terceira vez que a mesma pergunta rende
  (`--pje-2`, `--surface-painel`, agora este): **ao acrescentar um tema, ou ao
  inverter uma polaridade, perguntar quais tokens estão fazendo dois
  trabalhos.**
- **O TESTE DE CONTRASTE SÓ MEDE OS PARES QUE ALGUÉM ESCREVEU NELE.** Ele deu
  106/106 numa versão em que o chip da peça estava ilegível — porque a bolha
  do usuário não era um par da tabela. Ao criar uma superfície de cor própria,
  o par dela entra no `t-temas-contraste` junto: sem isso o teste afirma sobre
  um recorte e é lido como afirmação sobre a tela.
- **LITERAL DE COR EM SOMBRA E HALO NÃO É MEDIDO POR NINGUÉM.** Sobreviveram
  9 literais petróleo da paleta antiga — todos em `box-shadow` do launcher, dos
  anéis de foco e de três bordas. O teste de contraste mede tinta sobre fundo;
  o de literais varria hex e não `rgba()`. O sintoma era um botão indigo com
  sombra petróleo, que se lê como "as cores não combinam" sem se saber onde.
- **REGRA DE RESPONSIVIDADE DIZ QUEM PERDE, POR FAMÍLIA — nunca por nome.**
  No `.estreito`, a regra listava `.btn-mapa, .btn-plib, .btn-mlib,
  .tgl-sigilo` como quem perde o rótulo. O botão seguinte nasceu FORA dela, a
  fileira estourou, e o painel flutuante — que é o modo PADRÃO — apareceu com
  sete botões em duas linhas, metade com rótulo e metade sem. Com `:not()`
  sobre a família, o botão novo já nasce no comportamento que cabe.
- **ENGRENAGEM SIGNIFICA CONFIGURAÇÕES, e o menu de layout não pode usá-la.**
  O relato veio do próprio autor do projeto: *"procurei muito o botão para
  expandir o chat até adivinhar que era nessa tela, que na prática significa
  configurações"*. Duas colisões ao mesmo tempo: com a convenção universal, e
  com a aba **Configurações ↗** a 40px de distância — o mesmo símbolo
  apontando para dois destinos na mesma barra. O gatilho passou a EXIBIR o
  modo atual (o ícone do modo + chevron), que é a convenção de ESCOLHA:
  responde "onde estou" e "o que posso fazer" antes do clique. Ele é o único
  botão do cabeçalho mais largo que 30px, e por isso precisa de `width: auto`
  para desfazer o `.hd button`.
- **A FAIXA DE FERRAMENTAS FICOU FANTASMA** (sem borda e sem fundo em
  repouso). Sete pílulas com borda dentro de uma caixa que já é um cartão
  liam-se como sete cartões numa linha que é secundária à mensagem. O ESTADO
  continua com peso: os toggles acesos ganham fundo tingido, então "ligado"
  passou a ser a única coisa que aparece como superfície ali — que é
  exatamente o que aquela linha precisa dizer.
- **PLANO CUMPRIDO PELA METADE: no `.estreito` o tipo caía e a row NÃO voltava
  a uma linha.** O plano do redesign dizia as duas coisas na mesma frase; o
  código fez só a primeira, e o id ficou sozinho na segunda linha do card.
  Onde isso morde é o modo PADRÃO — o flutuante tem 420px, logo é `.estreito`,
  e ali a `.docs` é uma FAIXA de 264px em que sobram ~96px para o `.doclist`:
  com card de ~59px cabia UMA peça e meia, e a segunda aparecia partida ao
  meio pelo rodapé, que se lê como falha de render e não como "há mais para
  rolar". Com `grid-template-areas: "chk nome meta ver"` o card cai para ~43px
  e a faixa mostra duas peças inteiras mais a borda da terceira. **O markup não
  muda** — quem faz o reflow são as ÁREAS, e é para isso que a segunda linha
  existe como área e não como elemento.
  - Só a CAPTURA acha um defeito assim: `getComputedStyle` reporta a `.docrow`
    viva e correta, e a medição de largura da fileira (que eu tinha) diz que
    nada estourou. O que estourou foi a ALTURA de uma lista rolável, e isso não
    é erro — é densidade.

## Temas do painel e o carimbo do modo sigiloso (`panel.css` + `panel.js`)

Sete paletas (**Padrão** = indigo sobre slate com chrome clara, **Noite**,
**Papel**, **Vidro**, **Toga**, **Rosa**, **Institucional** = o visual da v0.24
à v0.59, com os 126 tokens daquela versão VERBATIM — ele é a rede de
não-regressão do redesign, e `tests/visual/impressao.mjs` o fotografa para
comparar com a baseline) e a substituição da faixa do modo sigiloso por um **carimbo** na linha
do CNJ. O visual e o porquê de cada escolha estão no `DESIGN.md` ("Temas" no §2
e "Modo sigiloso: o carimbo" no §5). Aqui ficam as invariantes.

- **UM TEMA É SÓ UM BLOCO DE OVERRIDES DE TOKEN.** `.wrap[data-tema="…"]` logo
  depois do `.wrap` base — nenhuma regra de componente muda, nenhum seletor
  novo nasce. O molde já existia e roda em produção desde a v0.55: é o que
  `.wrap.sigiloso` faz trocando `--hd`/`--mark-*`/`--btn-*` por `--sig-*`. Se um
  tema precisar de uma regra de componente, ou o token está faltando ou a regra
  está errada — **a única exceção aceita hoje** é `.wrap[data-tema="papel"] .hd
  { border-bottom }`, porque um cabeçalho claro não tem como se separar da
  conversa por contraste.
- **ATRIBUTO, nunca classe.** A especificidade 0,2,0 vence o `.wrap` base sem
  depender da ordem no arquivo, e o tema não disputa a mesma dimensão das
  classes de MODO (`.sigiloso`, `.expanded`, `.estreito`, `.livre`), que se
  combinam livremente com ele.
- **`--surface-painel` É O TOKEN QUE NENHUM TEMA PODE ESQUECER.** Ele pinta o
  fundo da JANELA, e `.msgs`, `.main` e `.content` não declaram fundo nenhum —
  os três HERDAM dele. O Noite saiu na v0.58.0 sem redefini-lo: o painel ficava
  branco por baixo de uma paleta escura, o "Como posso ajudar?" a **1,26:1**
  (medido) e a coluna de peças clara dentro do tema noturno. É o primeiro item
  que o `t-temas-coerencia` exige.
- **A LEGIBILIDADE DE UM TEMA SE MEDE, e o teste mede a COR RESULTANTE, não a
  presença de um token** (`t-temas-contraste`): para cada par que se encontra na
  tela, ele resolve os tokens efetivos (base + overrides), compõe a PILHA de
  camadas — um véu interno fica sobre a placa, que fica sobre a página, e a
  composição para na primeira camada opaca — e cobra o AA. Três armadilhas que
  já produziram número falso, todas registradas no próprio teste:
  - **Comentário que cita `--token: valor;` engole a declaração seguinte**, se o
    parser não remover comentários antes: o `[^;]+` do regex atravessa o fim do
    comentário e casa até o `;` da linha de verdade. Foi assim que o teste
    afirmou que o Noite não redefinia `--surface-painel` — ele redefinia — e
    mediu 1,22:1 num tema já corrigido.
  - **Gradiente não é cor**, e um par cujo fundo o parser não entende era PULADO
    em silêncio. Como `--hd` e `--surface-painel` passaram a ser gradiente em
    cinco dos seis temas, o teste deixaria de medir justamente o par crítico.
    Hoje o gradiente vira a lista das suas paradas e vale o PIOR caso; par que
    não dá para medir é FALHA, nunca silêncio.
  - **Véu medido direto sobre a página** dá um número que não existe na tela.
    Sem a pilha, o mesmo teste reprovava o Vidro em lugares corretos e o
    aprovava em lugares errados, na mesma execução.
- **MATIZ CONSTANTE, LUMINOSIDADE AJUSTADA.** `--cat-*`, `--ok`, `--warn` e
  `--alerta` não mudam de matiz por tema: ali a cor É o dado (a categoria da
  peça, a gravidade do aviso). O que se ajusta são as variantes `-bg`, `-line` e
  `-ink`, para o contraste sobreviver ao fundo escuro.
- **O SANEAMENTO DOS LITERAIS É PRÉ-REQUISITO, e ele já pagou por si.**
  `panel.css` tinha 113 literais de cor fora do bloco de tokens — mas só **3 de
  matiz**. Os outros eram três famílias mecânicas, e cada uma quebrava um tema
  diferente: `background: #fff` (29) era um cartão branco no meio do Noite;
  `color: #fff` no cabeçalho (6) era texto branco sobre branco no Papel; os véus
  `rgba(255,255,255,a)` (7) sumiam sobre chrome clara. Viraram `--surface`,
  `--on-hd-forte` e `--veu-*`. O `color: #fff` sobre AÇÃO (23) virou `--on-acao`
  e **não muda em tema nenhum** — o botão continua saturado —, mas ficou
  explícito para a exceção ser decisão e não esquecimento.
- **A PROVA DO SANEAMENTO É UMA IMPRESSÃO DIGITAL, não a leitura do diff.**
  Cinquenta substituições não se conferem a olho. O arnês headless coleta, para
  CADA elemento da árvore sombra, as 11 propriedades de cor computadas, em
  quatro estados (largo/estreito × sigilo on/off): **25.454 propriedades, zero
  diferentes** antes e depois. Refazer essa medição é a única maneira honesta de
  mexer nos tokens de novo.
  - **E ela mede o tema PADRÃO, mais nada.** Foi por isso que ela ficou verde
    numa versão em que o Noite não pintava o fundo da janela e o Rosa não
    existia: o padrão estava intacto, que é exatamente o que ela existe para
    provar. Prova de NÃO-REGRESSÃO não é prova de que a coisa nova funciona —
    quem responde por isso é o `t-temas-contraste`.
- **A COR DE TEXTO BASE DO PAINEL NÃO EXISTIA, e foi a medição que achou.**
  `:host { all: initial }` deixa `canvastext` (preto) e a bolha da resposta não
  declara `color` — ela herda. Sobre conversa branca sempre funcionou; no Noite
  virou texto invisível (**1,3:1**, medido). A declaração é
  `.wrap[data-tema] .panel { color: var(--text) }` — condicional ao tema, para o
  padrão continuar idêntico. Se ela virar global, a impressão digital acusa.
- **Um token, dois papéis: vence o papel que ocupa mais pixels.** `--pje-2` é
  tinta em alguns lugares e FUNDO da bolha do usuário em outro. No Noite,
  clareá-lo para ser tinta legível sobre o escuro deixaria a bolha ilegível.
  Ficou escuro (fundo), e o consumidor que precisava de tinta clara (`.tm-i`
  marcado) passou a usar `--pje`.
- **Toga tinge a CHROME, nunca a AÇÃO.** Vermelho aqui é `--alerta`; um botão
  primário vinho ao lado da barra de alerta apagaria a fronteira entre "informa"
  e "impede" do §2. `--pje` e `--btn-*` continuam azuis.
- **VIDRO: o fundo da JANELA precisou de token próprio, e essa é a lição.** A
  primeira versão não era vidro — o `.panel` pintava `var(--surface)` (branco
  OPACO) e o cabeçalho é filho dele, então o `backdrop-filter` desfocava o
  branco do próprio painel e saía um cinza lavado. Enquanto o fundo da janela e
  o fundo de um cartão compartilhavam o token, vidro era impossível. Daí
  `--surface-painel`: igual a `--surface` no padrão (a impressão digital
  confirma), translúcido só no Vidro. **Ao acrescentar um tema, perguntar quais
  tokens estão fazendo DOIS trabalhos** — foi o mesmo problema do `--pje-2`.
- **Uma placa de vidro, não cinco.** O desfoque mora no `.panel` e só nele:
  `backdrop-filter` aninhado refiltra o que o pai já filtrou e embarra. E
  **nunca no `.wrap`** — ele cria bloco de contenção para descendentes
  `position: fixed`, e os popovers são filhos dele (a mesma razão pela qual
  eles não são filhos do `.panel`, por causa do `transform` do arrasto).
- **A PLACA DO VIDRO É BRANCA E TINGIDA DE AZUL, com tinta escura — e a versão
  FUMÊ ESCURA que esteve aqui foi REJEITADA em uso.** A régua continua sendo o
  contraste sobre o que está atrás, nunca a aparência sobre um fundo só; o que
  mudou é a leitura do que a medição provava. Quatro versões:
  1. branco a 0,50 sobre a folha do PJe, tinta clara: desfocar branco dá branco.
     A captura mostrou um painel opaco comum — não havia o que revelar.
  2. azul-claro a 0,20, tinta clara: o efeito apareceu sobre a folha e a
     legibilidade MORREU sobre a barra institucional — **1,04:1, medido**.
  3. fumê escura a 0,78, tinta clara: mediu bem (folha 5,5:1, barra 11,0:1,
     cinza 6,0:1) e o dono do projeto a recusou — *"tem até a transparência, mas
     o tema vidro não é esse; design de vidro gradiente branco"*. Não era um
     defeito de contraste: era o material errado para o nome.
  4. **branca tingida a 0,74, tinta ESCURA** — a atual.
  - **A CONCLUSÃO ERRADA VEIO DE UMA MEDIÇÃO CERTA, e é essa a lição.** A nota
    anterior tratava "claro não serve" como resultado medido. Os itens 1 e 2
    falharam de verdade, mas os dois levavam TINTA CLARA junto — e é a cor da
    tinta que decide QUAL fundo é o hostil. Com tinta clara o inimigo é a folha
    branca, e a placa só a domina escurecendo. Com tinta escura o inimigo se
    inverte para a barra institucional azul, e ali uma placa CLARA também
    domina. **Ao trocar a cor da tinta de um tema translúcido, refazer a medição
    da translucidez: as duas decisões não são independentes.**
  - Medido na versão atual, com a parada mais fraca do gradiente — e a placa não
    é a única camada que precisa passar (ver o item seguinte):

    | | folha branca | barra institucional | cinza do visualizador |
    |---|---|---|---|
    | a placa | 5,69:1 | 3,28:1 | 5,37:1 |
    | a chrome | 4,66:1 | 3,33:1 | 4,49:1 |
    | a chrome sigilosa | 4,61:1 | 3,44:1 | 4,46:1 |

    O alfa CAIU de 0,78 para 0,74: a placa clara é mais translúcida que a escura
    e ainda tem folga.
  - **A CHROME ENTRA NA MEDIÇÃO, e não só a placa.** Nos modos lateral e cheia o
    painel encosta no topo da viewport, e quem fica sobre a barra institucional
    é o CABEÇALHO. Medindo só o corpo, o teste aprovou um tema cujo CNJ ficava em
    **2,7:1** exatamente ali — e quem mostrou isso foi a CAPTURA, antes do teste.
    O `t-temas-contraste` passou a varrer três camadas (placa, chrome, chrome
    sigilosa) × três fundos.
  - **O RISCO DE LUZ NÃO É UMA FAIXA MAIS CLARA — É UM PAR.** Sobre papel
    branco, branco sobre branco é invisível, e o brilho sozinho sumiria
    justamente no fundo mais comum. Vidro real sobre papel aparece como uma
    aresta ligeiramente mais ESCURA e azulada logo ANTES do brilho: são as duas
    paradas juntas (30% escurecida, 34,5% brilhante) que fazem o risco existir
    nos dois fundos. Ele mora DENTRO do gradiente de `--surface-painel` porque
    `.panel::before/::after` já têm dono — a pega de arrastar e a alça de
    redimensionar do modo livre.
  - **TINGIR é o que substitui escurecer.** A placa não pode diferir do papel por
    luminosidade sem ficar escura; então difere por MATIZ. Um véu neutro claro
    sobre fundo neutro claro é o único caso que não tem saída.
  - **A receita de glassmorphism que se lê por aí pressupõe fundo escuro ou
    colorido** (é de onde vem "superfície luminosa"). Sobre papel de tribunal ela
    se inverte — e a saída não é clarear nem escurecer, é tingir.
  - **O TEMA É O TEMA BASE, TRANSLÚCIDO.** Ele não redefine `--pje`, `--btn-*`,
    `--mark-*`, `--on-acao`, os estados nem as categorias: o padrão já é um tema
    CLARO de tinta escura e acento institucional, e uma segunda cópia daquilo
    aqui divergiria na primeira revisão. O que muda são as SUPERFÍCIES, as
    LINHAS, os VÉUS e as SOMBRAS — e o bloco encolheu de ~160 para ~110
    declarações por causa disso.
  - **Sobre chrome CLARA os véus brancos somem**: `--veu-1..3`, `--veu-borda` e
    `--veu-pega` passam a ser ESCUROS, o mesmo que o Papel já precisara. O
    `--veu-luz` é a exceção — ele brilha sobre o quadrado SATURADO da marca, que
    não clareou.
  - **O tema NÃO degrada ao expandir.** A v0.58.0 desligava o desfoque em tela
    cheia alegando que "não há nada atrás" — falso por MECANISMO: atrás do
    `.panel` a página do tribunal continua pintada, e o `backdrop-filter` a
    alcança. Hoje o `.full` e o `.expanded` mostram a folha atravessando a placa
    (confirmado em captura). O `.backdrop` do expandido fica em 0,20: a 0,45 ele
    apagaria a página e a placa passaria a desfocar um cinza chapado, isto é,
    deixaria de ser vidro no modo em que a janela é maior.
  - **As bolhas e os popovers ficam OPACOS** (`--surface`, `--surface-card`): é
    onde o §2 põe o peso visual, e bolha translúcida deixa o texto do tribunal
    passar POR TRÁS do texto da resposta. Sólidos sobre a placa fosca dão de
    graça a leitura de profundidade que o tema busca.
  - **IMPRECISÃO ACEITA e medida**: `--muted-2`/`--muted-3` (meta, contadores,
    placeholders) ficam em ~2,5:1 sobre a barra institucional. É o preço da
    translucidez no terceiro degrau da hierarquia, e vale porque o degrau que
    carrega informação (`--text`, `--muted`) tem folga.
- **UM TOKEN QUE VIRA GRADIENTE PRECISA QUE TODO CONSUMIDOR DELE ACEITE IMAGEM,
  e foi aqui que a v0.58.0 quebrou o MODO SIGILOSO em cinco dos seis temas.**
  `--sig-hd` virou gradiente junto com `--hd` e `--surface-painel`, mas o
  consumidor dele era `background-color`, que não aceita imagem: a declaração
  ficava inválida em tempo de valor computado, caía para `transparent`, e o
  cabeçalho pintava **rgba(0, 0, 0, 0)** — medido nos cinco. O sinal de que os
  autos NÃO estão saindo em claro simplesmente não acontecia no tema escolhido
  pelo usuário, e nada acusava: o token seguia lá, correto, e `getComputedStyle`
  o reportava vivo. É a mesma família do `.hd button` que vencia o `.sigselo` —
  **o valor está certo e o CONSUMIDOR não o aceita**, que nenhum teste de token
  pega.
  - A correção é o consumidor empilhar DUAS camadas de `background-image` (a
    textura por cima, a chrome por baixo) e **`--sig-hd` ser gradiente em TODOS
    os temas, inclusive no padrão**: um token com duas formas é um token com
    dois consumidores possíveis, e o de amanhã escolhe a errada.
  - **Consequência na impressão digital**: no tema padrão com sigilo LIGADO, o
    `background-color` do `.hd` passa de `rgb(20,63,51)` a `rgba(0,0,0,0)` e o
    `background-image` ganha uma camada. Os pixels são os mesmos (o gradiente é
    de uma cor só); a medição acusa, e a diferença é INTENCIONAL.
  - A mesma armadilha estava em `.sigok .plib-hd { border-bottom-color:
    var(--sig-hd) }`, onde só apagava a linha. **Ao promover um token de cor a
    gradiente, varrer os consumidores: `background-color`, `border-*-color`,
    `color` e `fill` recusam gradiente em silêncio.**
  - **Chrome sigilosa CLARA precisa da textura ESCURA** (`--sig-textura-clara`,
    aplicada no Papel e no Vidro): a textura branca a 5,5% é invisível sobre
    verde-claro, e o modo perderia o sinal ambiente que ela existe para dar. Pelo
    mesmo motivo o ✕ do `.se-hd` e o do `.sigok` deixaram de ser branco literal e
    passaram a `--on-hd-forte`/`--on-hd-2`.
- **ROSA é o único tema em que a AÇÃO acompanha a chrome**, e a diferença para o
  Toga tem motivo: vinho fica perto demais do vermelho-tijolo de `--alerta`;
  magenta fica a ~40° dele, e `--alerta` aparece como fundo claro com tinta
  escura, nunca como botão sólido.
- **DECLARAR O MESMO TOKEN DUAS VEZES NO MESMO BLOCO É SILENCIOSO, e a última
  vence.** O Vidro ficou com o CNJ em 1,3:1 de contraste porque sobrou um
  `--on-hd-2` claro depois do novo escuro. Nem o `node --check` nem o balanço de
  chaves pegam; quem pegou foi a medição de contraste, e há uma varredura de
  duplicatas por bloco de tema no `t-temas-coerencia`.
- **O TEMA ROSA FOI PUBLICADO SEM UMA LINHA DE CSS na v0.58.0.** O `<option>`
  existia nas duas telas, o changelog o anunciava e as notas da release o
  prometiam; escolher "Rosa" punha `data-tema="rosa"` no wrap e o painel
  continuava azul. E o `t-temas.mjs` passava 23/23 porque testava o MECANISMO —
  o atributo troca, persiste, propaga entre abas — e nunca a existência da
  paleta do outro lado. É o mesmo defeito do teste que lia `.sigbar .sb-n` com
  `|| {}`: verde sem testar. A rede contra a repetição é o `t-temas-coerencia`,
  que lê a lista `TEMAS` do FONTE e exige, para cada id, bloco no CSS com
  `--hd` e `--surface-painel`, sem token declarado duas vezes, e as duas telas
  (painel e opções) oferecendo o mesmo conjunto.
  - **LACUNA CONHECIDA**: a asserção que conferia a amostra do seletor contra a
    chrome só roda quando `--hd` é hex, e desde que a chrome virou GRADIENTE em
    cinco dos seis temas ela não roda em nenhum deles. As amostras foram
    atualizadas à mão para a parada do meio de cada gradiente; nada garante que
    continuem batendo. Para fechar: exigir que a amostra seja uma das paradas.
  - **A doc também afirmava medições sobre esse tema inexistente** ("o Rosa
    nasceu com 3,5:1 no CNJ e só virou tema depois de dois ajustes"). Nota que
    descreve código que não chegou a existir é pior que nota ausente: a sessão
    seguinte a lê e acredita.
- **Persistência**: `chrome.storage.local.tema` (`""` = padrão). Lido no
  `mount()` do `panel.js`, o mesmo tier de `layoutModo`/`docsOcultas` —
  **`aplicarTema` é declarada ANTES do `get`**, porque o stub de teste chama o
  callback de forma síncrona (a zona morta temporal que já mordeu `docsOcultas`,
  `guiaAberta` e `launcherUsado`). Restaurar passa `gravar: false`: regravar no
  boot dispararia `storage.onChanged` em todas as abas. A propagação entre abas
  entra no listener que já existe em `content.js` → `panel.setTema(v)`, que
  também não regrava — senão as abas ficam em pingue-pongue.
- **Dois controles, uma chave**: o botão no cabeçalho (primeiro item do segundo
  `.hd-grp`, o cluster de APRESENTAÇÃO — a `.toolbar` já vive no limite com seis
  botões) e o campo em `options.html`. A `.temabox` é `position: fixed` como a
  `.movbox` e o `.selmenu`, fecha por `composedPath()` no `document` com
  `capture:true` (o alvo chega RETARGETADO para o host, então `e.target` fecharia
  a caixa no próprio clique de dentro) e por Esc com `stopPropagation`.
- **As telas satélites NÃO são tematizadas** nesta rodada: o tema veste só o
  painel dentro do PJe. `ui.css` continua espelhando os valores do `.wrap` base.

### O carimbo (`.sigselo`) — o que não pode voltar a quebrar

- **`.hd .sigselo`, nunca `.sigselo`.** `.hd button` (0,1,1) governa TODO botão
  do cabeçalho com `background: transparent`, `30×30` e `--r-sm`, e vence um
  seletor de 0,1,0 propriedade a propriedade: o carimbo saía como um quadrado
  transparente com o texto quebrando dentro e o cabeçalho esticando para 111px.
  `getComputedStyle` reportava a regra viva e correta — ela simplesmente perdia.
  E é preciso `width: auto` explícito: **não basta declarar o que se quer, é
  preciso DESFAZER o que a regra genérica impôs.**
- **`white-space: nowrap` no carimbo** é o que garante a promessa de "não muda a
  altura": sem ele o anúncio quebra em duas linhas DENTRO do botão.
- **No estreito, `flex-wrap` quebra a linha antes de encolher os itens dela.** O
  carimbo empurrava o ✕ para uma terceira linha (+42px — mais que os 26px da
  faixa que ele substituiu). `flex: 1 1 0` no `.tit-wrap` resolve, e vale **só
  com o carimbo aceso** (`:has(.sigselo:not([hidden]))`): sem sigilo o cabeçalho
  estreito continua byte a byte o de antes.
- **As formas curtas são TRÊS spans, não uma string** (`.ss-t` rótulo, `.ss-n`
  número, `.ss-u` substantivo, `.ss-d` folha): é o CSS do estreito que decide o
  que cai, como em `.sl-l`/`.sl-s`. Medido: "· 47 protegidos" custa 103px e não
  cabe ao lado do CNJ em 420px; "· 47" custa 50px e cabe.
- **`setSigiloProgresso` FUNDE o parcial e `null` zera.** São dois chamadores em
  escopos diferentes — o laço das peças conhece `{feitas, total}` e o OCR, lá
  dentro, conhece só a folha. Se o parcial substituísse, a chamada da folha
  apagaria o contador de peças. E o laço passa `detalhe: ""` ao trocar de peça,
  senão a folha da peça anterior sobrevive à troca.
- **O anúncio dispara na TRANSIÇÃO desligado→ligado**, nunca no estado:
  `setSigiloso` é chamada pelo content a cada turno, e um anúncio por estado
  voltaria toda vez.
- **O teste lia `.sigbar .sb-n` com `|| {}` e passava comparando `""` com `""`.**
  Apagar a faixa não o quebrou — ele parou de testar em silêncio, que é pior.
  Trocar o seletor fez parte da mudança, não de limpeza posterior.

## Micro-animações do painel (`panel.css` + `panel.js`)

Abrir, fechar, arrastar e colapsar deixaram de ser saltos. Tudo em CSS nativo:
os tokens de movimento e o porquê de não haver biblioteca estão no DESIGN.md
("Movimento"). O que mora aqui são as armadilhas — nenhuma delas visível num
`getComputedStyle`.

- **`@starting-style` + `allow-discrete` no lugar de `animation: rise`.** A
  `animation` só tinha ENTRADA: fechar era um sumiço seco. As duas regras dão os
  dois sentidos e mantêm o painel visível durante a saída, apesar do
  `display: none`.
- **O `close` NÃO pode desmontar o layout de forma síncrona.** Ele removia
  `open` + `expanded/full/lateral/livre/livre-wide` e chamava `limparGeoLivre()`
  na mesma linha. Com uma saída animada isso fica visível e feio: a janela do
  modo livre SALTA para o canto inferior direito em 420x660 e só então
  desaparece — trocar um sumiço seco por um salto é piorar. Hoje só o `open` sai
  na hora; o resto é desmontado depois, por um `setTimeout` de `MS_SAIDA`, com
  **guarda de reabertura** (`if (wrap.classList.contains("open")) return`) —
  sem ela, reabrir durante a saída faria a limpeza do painel ANTIGO desmontar o
  painel NOVO.
- **`getBoundingClientRect` INCLUI o transform, e é por isso que
  `salvarGeoLivre` aceita uma geometria CONHECIDA.** Durante o arrasto o painel
  está com `scale(1.005)`; medir ali gravaria uma janela 0,5% maior a cada
  arrasto, e o erro é CUMULATIVO (a leitura seguinte parte da anterior). O
  arrasto informa a geometria que acabou de calcular, tirada de
  `offsetWidth`/`offsetHeight`, que são de LAYOUT e imunes ao transform. O
  `ResizeObserver` segue medindo — lá nunca há `.movendo`.
- **A escala do arrasto é segura porque os popovers são irmãos do `.panel`**
  (`wrap.appendChild`), não filhos: um `transform` cria bloco de contenção para
  descendentes `position: fixed`, e `.audbox`, `.movbox`, `.selmenu` e
  `.preview` ficariam ancorados no lugar errado se morassem dentro dele.
- **O colapso da lista é AXIAL, e o eixo muda com o modo**: coluna (largura) no
  expandido e no livre largo, faixa (altura) no flutuante, no lateral e no
  estreito. E os contextos vão LISTADOS no seletor
  (`.wrap.estreito.docs-collapsed .docs` etc.): `.wrap.estreito .docs` fixa
  `max-height` e `padding` com a MESMA especificidade 2000 linhas adiante, e
  vencia por ordem — a faixa não colapsava. Antes não havia conflito porque o
  colapso era `display: none`, propriedade que ninguém disputa. **Trocar
  `display` por uma propriedade animável cria disputas que não existiam.**
- **`overflow: hidden` + `min-width` nos filhos não é zelo**: sem o piso de
  largura o texto da lista se RE-QUEBRA a cada largura intermediária e o que se
  vê são 240ms de borrão de reflow em vez de uma coluna saindo de cena.
- **A entrada da bolha vive no `.msg`, nunca no `.body`.** A bolha do assistente
  é criada UMA vez e re-renderizada a cada delta do stream (`updateAssistant`
  reescreve o `innerHTML` do `.body`): uma entrada nos filhos dispararia a cada
  token. `@starting-style` no `.msg` roda uma vez por INSERÇÃO — seguro por
  construção, e há teste (6 deltas, zero redisparos). A retomada da memória de
  caso, que é um REPLAY de `addMessage`, insere tudo na mesma tarefa: as bolhas
  entram JUNTAS, num só esmaecimento, e não em escada (testado).
- **ANTES DE ANIMAR, CONFERIR SE JÁ ANIMA.** `.minutabar`, `.mapabar` e
  `.promptbar` já tinham `animation: chip-in`, e `animation` vence `transition`
  na mesma propriedade: a transição que acrescentei a elas era código morto com
  um comentário afirmando o contrário, e o `allow-discrete` junto lhes dava uma
  SAÍDA de 120ms inexistente — a faixa ficaria presa na tela depois de fechada.
  Só a medição pegou (elas computavam `scale(0.85)`, o `from` do `chip-in`).
- **MEDIR ANIMAÇÃO EM HEADLESS TEM TRÊS ARMADILHAS**, e as duas já falsificaram
  medições aqui: (a) o `panel.css` chega por `fetch` ASSÍNCRONO — medir antes
  dele mede uma árvore sem estilo, em que um `<button>` é `inline-block` e o
  painel cai no fluxo normal; (b) sob `--virtual-time-budget` o relógio das
  transições NÃO avança, então esperar fotografa o estado INICIAL congelado (a
  coluna e a aba na tela ao mesmo tempo). A saída é inspecionar as
  `CSSTransition` pela **WAAPI** — `getAnimations()` diz se existem, com que
  duração e com que curva, e `finish()` leva ao estado final sem depender de
  tempo nenhum — mas **`document.getAnimations()` não alcança a árvore SOMBRA**
  neste arnês, e usá-lo produziu um falso negativo convincente (o teste dizia
  que a lista não colapsava, com o CSS correto); `elemento.getAnimations()`
  alcança. Headless também reporta `prefers-reduced-motion: reduce` por padrão:
  sem saber disso, mede-se sempre o ramo reduzido.

## Modo sigiloso — anonimização LOCAL (`trava.js`, `pseudonimos.js`, `anonimizar.js`, `tokenizador.js`, `ner-nucleo.js`, `ner-worker.js`)

O que a seção seguinte apontava para um programa separado passou a existir
DENTRO da extensão. Com o botão `🔒 Sigiloso` ligado, a peça **deixa de viajar
como arquivo** e vai como TEXTO com os dados pessoais substituídos por rótulos
estáveis (`[PESSOA_1]`, `[CPF_2]`). Todo o reconhecimento acontece na máquina do
usuário; o PDF não sai dela. É o caminho do art. 19, §3º, IV da Res. CNJ 615
("salvo anonimização na origem") sem depender de um segundo programa.

**Duas camadas de detecção, na ordem do Presidio — nenhum detector isolado vale
como verdade absoluta.** Primeiro os DETERMINÍSTICOS (`anonimizar.js`): regex
com dígito verificador (CPF, CNPJ, CNJ, NIT), OAB, e-mail, telefone, CEP com
âncora de contexto, e — o de maior retorno e custo zero — o **gazetteer da
ficha**, que sai do `PJE.lerCabecalhoProcesso()` e traz nome, documento e OAB de
cada parte e de cada advogado. Depois o **NER** por cima, para o que só um modelo
acha (nomes de terceiros no meio do texto). `ANON.fundir` junta os dois e
`PSEUD._resolverSobreposicao` desempata — mais longo; empate, maior score — pela
**união** dos intervalos, nunca pela substituição, que descobriria texto no meio.

- **O DV trabalha nos DOIS sentidos**: candidato com dígito verificador inválido
  é DESCARTADO (`1.234.567.890-12` num contrato não é CPF de ninguém) e o válido
  tem o score ELEVADO a 0,98, o que o faz vencer o NER na resolução por empate.
- **A política preserva três classes**, e isso não é detalhe: `TEMPO`
  (prazo e prescrição são o eixo do produto), `LEGISLACAO` e `JURISPRUDENCIA`
  ("art. 5º da CF" é a fundamentação). `LOCAL` fica opcional — endereço
  identifica, comarca não. `conferirPolitica` **lança** se o modelo devolver um
  rótulo que a política não conhece: modelo novo vira recusa explícita, nunca um
  mapa silenciosamente incompleto.
- **A deny list é ESTRUTURAL, não polimento** (`src/config/deny-list.json`):
  mascarar "Ministério Público" ou "Banco do Brasil" não protege ninguém e
  arruína a leitura jurídica. Há DUAS formas deliberadas de casar: as listas
  simples (`*`, `PERSON`, `ORGANIZATION`, `LOCATION`) exigem o valor INTEIRO
  normalizado; `prefixos` aceita o termo no começo com fronteira de palavra.
  É o que cobre `"Ministério Público do Estado do Ceará"`, `"Tribunal de
  Justiça do Estado do Ceará"` e `"Vara Única de Ocara"` sem liberar
  `"TribunalX"`. Prefixos de uma palavra só existem na lista curada de
  instituições (`vara`, `comarca`, `delegacia`); cabeça que uma EMPRESA também
  usa (`escola`, `fundação`, `agência`, `câmara` — a CDL é "Câmara de
  Dirigentes Lojistas" —, `sistema`, `central`, `núcleo`) NÃO entra solta, só
  qualificada (`câmara cível`, `seção judiciária`, `agência nacional`): o
  `negado` vale TAMBÉM para o gazetteer da ficha, e um prefixo largo mandaria
  "Fundação Bradesco" ou "Escola X Ltda" — parte com CNPJ — em claro. A regra
  tem teste caso a caso (`t-v56-unit`).

**O mapa de pseudônimos é a CHAVE DE REIDENTIFICAÇÃO** — o artefato mais
sensível que a extensão produz. `[PESSOA_1]` tem de ser a MESMA pessoa em todas
as peças: numerando por peça, juntar a inicial e a procuração entrega ao modelo
um texto em que o mesmo rótulo designa duas pessoas, e a resposta sai bem
escrita, plausível e trocando as pessoas. Por isso ele vive no **`casodb`, por
processo** (IndexedDB no WORKER — nunca na origem da página do tribunal, onde
qualquer script do PJe o leria) e **NUNCA em `chrome.storage.sync`**, que
trafega pela conta Google. `hidratar` **preserva a numeração gravada**; ver
"Duas passadas" abaixo.

- **DUAS PASSADAS em `mascarar`, e fundi-las é o bug clássico**: numerar na ordem
  de LEITURA (para `[PESSOA_1]` ser a primeira pessoa que aparece) e substituir
  de TRÁS PARA FRENTE (para não deslocar os offsets ainda não aplicados).
- **`hidratar` NÃO renumera** e `rotular` usa **maior + 1**, nunca `size + 1`.
  Medido antes da correção: um mapa `{n:1, n:3}` voltava como `{1, 2}`,
  `[PESSOA_3]` deixava de resolver e `[PESSOA_2]` — um rótulo que nunca existiu —
  passava a devolver o nome de quem era o 3. Num texto já mascarado, restaurar
  isso insere o nome da pessoa ERRADA num documento que vai ao PJe assinado. A
  correção tem de ser DUPLA: preservar o `n` sozinho faria a próxima pessoa
  nascer com um número já ocupado.
- **Offset inválido LANÇA** (`mascarar`): `slice` é permissivo e devolveria
  string vazia, de modo que a máscara simplesmente não aconteceria — sem erro.
  Um anonimizador que segue em frente com o detector quebrado entrega documento
  não anonimizado com cara de anonimizado.

**A GUARDA DE SAÍDA é a última barreira, e ela MEDE O RESULTADO em vez de
garantir o processo** (`trava.js` + `instalarGuardaDeSaida` em background.js).
O payload tem TREZE canais que carregam PII — conteúdo da peça, `title` de cada
bloco, CNJ, ficha (que manda os titulares de cada polo no system, em TODO
turno), inventário das não marcadas, datas das peças, linha do tempo (cujo
`textoFinalExterno` traz nomes), texto digitado, tese da minuta, `customPrompt`,
biblioteca de prompts, peças-modelo e anexos. Filtrar treze canais é uma LISTA,
e lista envelhece: o décimo quarto que alguém acrescentar em 2027 vaza em
silêncio. Uma pós-condição sobre o corpo serializado não envelhece.

- **POR QUE NO `fetch`, e não em cada cliente.** São quatro clientes, um deles
  declarado INTOCADO em três notas deste arquivo — e quatro também é uma lista:
  o quinto provedor vazaria calado. A guarda no `fetch` do worker é impossível
  de contornar de dentro dele e cobre de graça o `countTokens`, o `upload` e o
  cliente que ninguém escreveu ainda. **Por HOST**: só os quatro hosts de
  provedor entram no caminho caro; o resto passa sem custo.
- **CADA REQUISIÇÃO CARREGA A CHAVE DO PROCESSO** (`CAB_CTX`, `x-pje-ctx`, que a
  guarda lê e REMOVE antes do envio real). Sem ela, o turno NORMAL de outra aba
  seria conferido contra a lista de um processo que não é o dele — e barrado
  pela regra de binários. Requisição a host de provedor **SEM** a chave, havendo
  sigilo armado, é BLOQUEADA: a lista de clientes ainda pode envelhecer, mas
  agora ela envelhece para o lado da recusa, nunca para o do vazamento.
  A constante está espelhada em CINCO arquivos e há teste que confere que batem.
- **`casoChave` NÃO pode depender da memória de caso.** Ela nasce da URL, na
  declaração. Enquanto era atribuída dentro de `iniciarMemoria`, um `CASO`
  indisponível deixava `armarSigilo` sair na primeira linha — a anonimização
  continuava funcionando e a ÚLTIMA BARREIRA simplesmente não existia, sem nada
  na tela dizendo.
- **A guarda é RE-ARMADA depois do mascaramento** (fim de `anonimizarLote`), e
  não só no início do turno: naquele instante o mapa só tem o que foi mascarado
  ANTES, e nada das peças daquele turno. Medido no teste de ponta a ponta: ia
  armada com UM valor enquanto o request levava três. Rede de segurança com a
  lista pela metade é pior que nenhuma, porque parece completa.
- **Recusa ESTRUTURAL antes da textual**: corpo binário (`FormData`, `Blob`,
  `ArrayBuffer`) para host de provedor sob sigilo é bloqueado **sem olhar
  dentro**; e corpo que não dá para inspecionar (não-JSON) também, porque não
  dar para inspecionar não é razão para liberar. A URL é conferida
  **DECODIFICADA** — `Elioneudo%20Evaristo` não casa `elioneudo evaristo`,
  porque a normalização colapsa espaço em branco e não `%20`.
- **O erro que cruza o worker NUNCA mostra o valor encontrado**: leva tipo,
  posição e o rótulo (`[ORGANIZACAO_3]`), que não é o dado. O content resolve o
  rótulo contra o mapa que já está na máquina e só então mostra o valor ao dono
  dos autos. E **nunca é `retryable`** — explicitamente `false`, não por
  `undefined` ser falsy: o filtro é determinístico pelo conteúdo, e re-tentar
  sem uma decisão seria o mesmo bloqueio com o custo do backoff.
- **`isentas`**: as regiões de texto CONSTANTE do próprio programa (os dois
  system prompts). Sem elas, bastaria o detector rotular "Brasil" ou "Justiça"
  numa peça para a guarda encontrar o valor DENTRO do nosso próprio system e
  bloquear um turno que não revela ninguém. Isentar é seguro porque a região é
  definida pela ocorrência LITERAL de uma constante daqui.

**A CAIXA DE AUDITORIA é o que torna o recurso verificável, e ela faltava.**
O mecanismo inteiro estava pronto e o usuário tinha um botão, uma contagem e a
palavra da extensão — e a palavra da extensão não é auditoria. O sinal de que a
peça faltava estava no próprio código: `PSEUD.tabela()` existe com o comentário
"a tabela que a caixa de auditoria mostra" e **não tinha um único consumidor**.

**O HISTÓRICO É REMASCARADO COM O MAPA ATUAL A CADA ENVIO, e o bloqueio da
guarda tem saída que PRESERVA o nome** (`remascaradorDeSaida` dentro de
`prepararEnvio`, `conferirSaidaSigilo`, a bolha com "Mascarar e reenviar" /
"Nova conversa", v0.56.1). Caso real: "Antônio José Correia" ([PESSOA_9])
bloqueava o envio e a bolha só oferecia "Liberar" — quem quer manter o nome
protegido ficava sem opção. A causa é estrutural: o mapa CRESCE ao longo da
conversa (o NER só achou o nome na terceira peça), a API é stateless e cada
turno remonta a conversa inteira — o bloco antigo (texto da peça, ou a resposta
em que o modelo repetiu o nome) volta com o nome em claro, e a guarda bloqueia
para sempre. Regras:
- **Remascara a CÓPIA de saída, nunca `conversation`**: `prepararEnvio` já
  devolve uma cópia; só blocos de texto e `document` de texto (`source.data` e
  `title`) são tocados. Assinado ou opaco (`thinking`, `x-gemini-item`,
  `x-openai-item`, `x-openrouter-item`, imagem, `file`) fica intacto.
- **Memoizado por bloco (WeakMap) e invalidado pela VERSÃO do mapa**
  (rótulos + liberados): sem isso `mascararCurto` varreria o histórico inteiro
  a cada envio. Durante a MEDIÇÃO (`medindoSemGravar`) o memo é pulado, e
  `refinarContexto` liga o flag também em volta do `prepararEnvio` — a medição
  não pode gravar rótulo novo (o teste do mapa-que-não-cresce cobre).
- **`conferirSaidaSigilo(msgs)` roda ANTES do pré-voo nos três fluxos** com a
  MESMA regra da guarda (`PSEUD.conferir`), bloco a bloco: ela sabe dizer ONDE
  o valor está ("numa resposta anterior da IA", "no texto da peça «x», enviada
  num turno anterior", "no raciocínio guardado do modelo") e se o bloco é
  reescrevível. O erro tem a forma do bloqueio do worker (`vazamento`, `tipo`,
  `rotulo`) mais `onde` e `editavel`. O system NÃO é conferido aqui (o worker
  cobre, com as `isentas`).
- **A bolha oferece primeiro o que PRESERVA o nome**: "Mascarar e reenviar"
  (chat, canal reescrevível — o reenvio já remascara) e "Nova conversa (mantém
  as peças)" (`panel.novaConversa`, o MESMO `resetCb` do botão) — a única saída
  quando o canal é opaco, e aí ela ganha `.destaque`. "Liberar" fica por último,
  no vermelho de alerta, dito como o que é: abrir mão de uma proteção. Minuta e
  mapa passaram a mostrar a bolha (antes caíam em "Erro:").
- **O `sigiloCache` também acompanha o mapa** (`textoSigiloAtual`, regravado
  uma vez por versão do mapa): a caixa de conferência e a auditoria leem o
  cache, e mostrariam o nome em claro num texto cuja cópia enviada já levava o
  rótulo — o usuário aprovaria uma coisa e sairia outra.
- **Segundo bloqueio do WORKER pelo MESMO rótulo tira o "Mascarar e reenviar"**
  (`ultimoBloqueioWorker`, `repetido`): o reenvio já remascarou tudo o que é
  reescrevível; repetir o botão seria um laço, e a bolha passa à conversa nova.
- Coberto por `t-turno-sigiloso.mjs` modos `historico` (2º turno com uma peça
  cujo NER descobre um nome que a 1ª peça já levara em claro: o bloco antigo
  sai remascarado, nenhuma bolha, o mapa gravado conhece o nome) e `opaco`
  (raciocínio do OpenRouter com o nome: bloqueio LOCAL antes da rede, sem
  pré-voo, bolha sem "Mascarar" e com "Nova conversa" em destaque, que zera o
  chat mantendo o modo) e pelo `t-sigilo-56 bloqueio` (as duas saídas presentes,
  "Mascarar" antes de "Liberar"). O caminho da bolha na minuta e no mapa não
  tem teste de ponta a ponta.

**O BLOQUEIO É UMA DECISÃO: "este valor é um dado pessoal?"** (v0.57.0,
depois de o dono do projeto não saber o que fazer diante de "ALIMENTOS"
rotulado como pessoa e uma bolha que só oferecia "Liberar" ou "Nova
conversa"). Regra do usuário, gravada em memória: **usabilidade e feedback
são a prioridade; nunca um beco sem saída.** O que mudou:
- **Opaco contaminado é DESCARTADO da cópia de saída** (`podeOmitirOpaco` em
  `remascaradorDeSaida`): `x-openrouter-item` (a doc diz que omitir
  `reasoning_details` é sempre seguro) e `x-openai-item` (o item `reasoning` é
  opcional no histórico) saem quando carregam valor do mapa; no Gemini só o
  `thought`. Perde-se o contexto de raciocínio daquele turno, e nada mais — era
  ESTE o caso que obrigava a "nova conversa". `conversation` não muda.
- **A bolha faz a pergunta e dá dois cartões de mesmo peso** (`.sb-card`):
  "É dado pessoal → manter protegido" (`Manter protegido e reenviar`; a máscara
  é refeita e o opaco descartado) e "Não é → liberar" (`Liberar e reenviar`,
  com "também nos outros processos"). Mostra o VALOR, em que peça o rótulo
  nasceu (`origemDoRotulo`) e onde ia sair. Ações sobre a PEÇA na linha
  secundária: "Tirar «peça» desta conversa" (desmarca; os blocos saem do
  request por construção — o "vamos excluir a peça" do usuário) e "Editar o
  texto da peça" (só peça NOVA: o histórico é o que foi visto). "Nova
  conversa" só quando é a única saída (`repetido`, ou opaco que a API não deixa
  omitir).
- **Liberar em todos os processos** (`liberadosGlobais`,
  `chrome.storage.local.sigiloLiberadosGlobais`, no `negadoAtual`): a palavra
  comum que o NER confundiu não aborda o usuário no processo seguinte. E a
  tabela da auditoria ganhou "não é dado pessoal" por linha
  (`onLiberarAuditoria`): o lugar de corrigir um falso positivo ANTES de ele
  segurar um envio.
- **`deny-list.json` PERSON ganhou o vocabulário processual** ("alimentos",
  "curatela", "tutela", "guarda", "petição", "sentença", "requerente"…, ~120
  entradas): casa só o valor INTEIRO normalizado, então nenhum nome de gente é
  atingido. É a correção na ORIGEM; liberar é o remendo.
- **"Não enviar" por peça na caixa de conferência** (`.sk-remover`;
  `confirmarEnvioSigiloso` devolve `removidas`, e os três chamadores filtram
  `idsNovosParaBlocos`/`dl.ok` e desmarcam). Peça removida continua em
  `sigiloAguardando`: marcada de novo, a caixa a mostra outra vez.
- Testado: `opaco` (o turno SAI, sem o item e sem o nome; a conversa gravada
  mantém o item), `t-sigilo-56 bloqueio` (pergunta, dois cartões, ordem,
  opção global, sem "Nova conversa"). Sem teste de ponta a ponta: "Tirar a
  peça", "Editar" na bolha, liberar pela auditoria e "Não enviar" na caixa.

**A ESPERA PELO MODELO TEM RELÓGIO — DENTRO DA BOLHA, no status e no campo**
(`comecarEspera`/`rotularEspera`/`pararEspera` em content.js, v0.56.1, e
`panel.setEspera` + placeholder do `lockInput`, v0.57.0). Terceiro relato do
mesmo defeito ("Isso é horrível, cara! Você não sabe se deu erro e travou"):
o status é um segundo lugar; o olho está na bolha. O texto "Analisando… —
12 s" vai no `.wait-t` ao lado dos pontos, e o campo diz "Aguardando a
resposta do modelo…" enquanto travado. **Teste PRINCIPAL antes de qualquer
release**: `t-turno-sigiloso.mjs normal lento` (4 s até o primeiro token, com
thinking e delta vazios no meio: pontos + texto que anda na bolha, no status e
no placeholder) e `normal erro` (nenhuma bolha vazia sobra; o status diz o
erro; o campo destrava). Entre o Enter e o primeiro token pode
haver dezenas de segundos, e a tela mostrava uma bolha vazia com três pontos e o
status em branco — relato real: "não sei se o chat está processando". O status
conta os segundos ("Analisando… — 12 s"): um número que anda é o que distingue
"esperando" de "travou". `rotularEspera` troca o texto sem zerar o relógio
(raciocínio, busca); `pararEspera` no primeiro token e no `finally` dos três
fluxos. E **delta VAZIO não é o primeiro token**: os clientes Gemini/OpenAI
emitem `text: ""`, e limpar o status e tirar os pontos por ele deixava a bolha
em branco pelo resto do raciocínio — `onDelta` ignora, e `updateAssistant`
mantém o indicador enquanto não há texto.

**Falso positivo da guarda vira decisão LOCAL, não erro de rede.** A bolha
`.sigilo-bloqueio` mostra o valor resolvido localmente e oferece “Liberar neste
processo”. A escolha entra em `casodb` junto do mapa (`sigilo.liberados`) e o
item é MARCADO como liberado no mapa (`PSEUD.liberar`), nunca apagado: sai de
`proibidos()` (a guarda deixa de procurá-lo) e de `quantos()` (a tarja conta o
que está protegido), mas `paraValor`/`reidentificar` continuam resolvendo o
rótulo — uma minuta gerada ANTES da liberação ainda carrega `[ORGANIZACAO_1]`,
e apagar o item deixaria a marca órfã num texto já produzido (a família do
"hidratar renumerava"). A tabela da auditoria mostra a linha como liberada. O
valor passa a alimentar o mesmo `negado` usado por regex, gazetteer e NER —
**em TODAS as formas vistas** (`PSEUD.formasDe`): liberado só pela forma
canônica, "Banco Bradesco S.A." voltava pelo NER na peça seguinte, `chaveDe`
caía no registro liberado e o texto saía com um rótulo que a guarda já não
procurava. Por isso **`rotular` devolve `null` para registro liberado** (em
qualquer forma, inclusive a variante que `procurarVariante` fundiria) e
`mascarar` pula a ocorrência. E **`sobrasDoMapa` NÃO escreve no mapa**: o
rótulo viaja no achado (`acharGazetteer` copia `it.rotulo` dos itens do mapa),
porque rotular num caminho que só mostra o que sobrou criava forma nova em
silêncio. As peças PENDENTES de revisão recebem a liberação como o
`sigiloCache`. Os textos já mascarados no `sigiloCache` recebem o valor de
volta sem repetir OCR/NER; a guarda é re-armada antes do reenvio. No chat, a
bolha do turno bloqueado sai também do transcript antes de o texto voltar ao
campo — sem isso a liberação criaria duas perguntas iguais na conversa gravada.

**O mapa já conhecido participa das peças seguintes e dos canais curtos.** O
NER não é determinístico: pode achar um nome na contestação e deixá-lo passar na
réplica. `achadosDoMapa` reaplica o gazetteer com tudo o que o mapa já conhece,
e `mascararCurto` faz o mesmo na ficha, títulos e pergunta. É o que mantém UM
rótulo por valor e evita que a pós-condição descarte a peça seguinte por uma
ocorrência que o NER dela não viu. Era a causa REAL dos dois sintomas da
v0.55.0 em uso: o bloqueio "um valor do tipo ORGANIZACAO apareceu (posição
5637)" — o órgão julgador vai na ficha do system em TODO request, o NER o
rotulava dentro da peça, e `mascararCurto` (só detectores determinísticos)
nunca o via — e as "7 peças não puderam ser baixadas", que na verdade tinham
baixado e caído na pós-condição `PSEUD.conferir` por um valor que o mapa
conhecia de outra peça. **`PSEUD.conferir` passou a exigir fronteira de
palavra**, a MESMA regra da trava e do gazetteer: sem ela "Ana" dentro de
"Fernanda" reprovava a peça inteira. Três verificadores, uma regra.

**O MASCARAMENTO DE UMA PEÇA RODA ATÉ CONVERGIR** (`mascararAteConvergir`):
a primeira passada mascara o que os detectores acharam, mas o mapa CRESCE
durante ela — uma pessoa vista pela primeira vez nesta peça ganha rótulo ali —
e a mesma pessoa reaparece no mesmo texto numa forma que o NER não marcou
("BANCO BRADESCO S.A." depois de "Banco Bradesco"). Era o que ainda derrubava
peças depois do gazetteer do mapa ("um valor do tipo PESSOA, [PESSOA_31],
sobrou": o valor nascera na própria peça). As passadas seguintes reaplicam o
gazetteer com o mapa atualizado até não sobrar nada (teto de 4; o mapa é
finito). Coberto pela 3ª peça do `t-sigilo-56`.

**O ENVIO PEDE APROVAÇÃO HUMANA — a conferência fica ENTRE o mascaramento e o
request** (`sigiloAguardando` + `confirmarEnvioSigiloso` + `exigirAprovacaoSigilo`
em content.js; `.sigok` em panel.js). Até aqui a extensão mascarava e ENVIAVA no
mesmo gesto: a auditoria mostrava o que tinha SAÍDO, e conferir depois não
desfaz um vazamento — o próprio guia dizia "a revisão do que sai continua sendo
sua" sem dar o momento de fazê-la. Agora, quando o turno tem peça recém-mascarada,
uma caixa mostra o texto exatamente como vai sair (peça por peça, com as MESMAS
marcas da auditoria, via `pintarMarcas`), oferece "Ver o texto"/"Editar" (o
editor `.sig-edit` abre POR CIMA da caixa, e a linha repinta ao fechar — daí o
`onFechar` do editor) e só sai no "Enviar N peças". Regras que não podem cair:
- **NÃO mora em `baixarSelecionadas`**, ao contrário do gancho do mascaramento:
  no chat os ANEXOS do input são anonimizados DEPOIS daquele funil, e uma caixa
  lá dentro ou não os mostraria ou apareceria duas vezes por turno. É chamada
  nos TRÊS fluxos (chat, minuta, mapa), depois de tudo o que mascara e antes de
  qualquer rede — inclusive antes do `subirAnexos` e do pré-voo.
- **Três call sites são uma lista, e o que garante a regra é o PORTÃO DURO**:
  `stream` e `estimarContexto` recusam request cujo `opts.ids` contenha peça em
  `sigiloAguardando`. Quem esquecer de chamar a caixa recebe um erro, nunca um
  envio. `refinarContexto` trata peça aguardando como peça sem máscara — sem
  isso, um envio CANCELADO na caixa deixava o texto no `sigiloCache` e o próximo
  clique num checkbox mandava `count_tokens` ao provedor com o que o usuário
  acabara de recusar (coberto por teste).
- **Só o DELTA do turno** (interseção do conjunto com o que vai no request): o
  que já saiu antes não volta à caixa; peça mascarada e depois desmarcada
  continua esperando sem travar nada.
- **Cancelar é decisão, não erro** (`e.cancelado`): o chat tira a bolha do
  transcript e devolve o texto ao campo (mesmo tratamento do bloqueio da
  guarda); minuta e mapa só escrevem no status. As peças FICAM no conjunto — o
  próximo envio pergunta de novo, e sem refazer OCR nem NER.
- **`chrome.storage.local.sigiloAprovar`** (default ligado, `!== false`):
  "não perguntar de novo" na própria caixa e a volta em Configurações →
  privacidade. Desligada, `confirmarEnvioSigiloso` ESVAZIA o conjunto sem caixa
  — sem isso o portão duro barraria o envio.
- **A auditoria só lista o que SAIU**: `dadosAuditoria` pula peça em
  `sigiloAguardando` (a caixa e o relatório afirmam "enviada"), e a aprovação
  repinta o selo — sem isso o retrato era o de `anonimizarLote`, tirado antes.
- Coberto em `t-turno-sigiloso.mjs` (a caixa aparece antes de qualquer porta ou
  `countTokens`; editar de dentro dela muda o request; modos `cancelar` e
  `semaprovar`; a auditoria conta 0 após cancelar e 1 após aprovar) e em
  `t-sigilo-56.mjs` (as três peças do turno na caixa). Minuta e mapa chamam a
  MESMA função e passam no `node --check`, mas o portão deles não tem teste de
  ponta a ponta.

**PEÇA REPROVADA NA PÓS-CONDIÇÃO VIRA DECISÃO, não só relatório.** O texto
mascarado até onde deu fica em `sigiloPendentes` (jogá-lo fora obrigaria a
refazer OCR e NER só para o usuário olhar o que sobrou), e o relatório do chat
traz por peça as AÇÕES (`f.acoes`): "Liberar «valor» e refazer" (libera e
devolve a peça à seleção — o próximo envio a anonimiza de novo sem aquele
valor) e "Revisar o texto", que abre `panel.abrirEditorSigilo`: o texto exato
que sairia, o que sobrou em claro com rótulo e valor, "Mascarar todas"
(troca literal, sem caixa), "Liberar neste processo" e um textarea livre.
"Usar este texto" passa por `aceitarTextoRevisado` — que CONFERE de novo
(`PSEUD.conferir`) antes de gravar no `sigiloCache` e remarcar a peça; texto
que ainda tem valor em claro não entra, e o editor diz qual. É a resposta ao
pedido do usuário de "ver e editar ele mesmo para continuar a análise": a
anonimização automática é a primeira passada, a conferência final é humana, e
a interface precisa dar a mão para essa conferência em vez de só desmarcar a
peça.

**A TABELA DESFAZ A ANONIMIZAÇÃO NA TELA** (`panel.setReidentificador` +
`renderMd`/`preencherComReid`): a resposta volta com `[PESSOA_1]` e o painel
mostra o NOME, numa `<mark class="reid">` com o rótulo no `title`. Até aqui a
tabela existia e a tela não a usava — o usuário lia "[ORGANIZACAO_13]" numa
resposta sobre o processo dele. A troca é só de EXIBIÇÃO: transcript,
exportação e histórico continuam com o rótulo (foi ele que saiu). O valor entra
por placeholder PUA (`\uE020 n \uE021`, sempre como escape no fonte), a mesma
técnica das citações: atravessa o escape e o inline sem ser interpretado. A
bolha do usuário faz o mesmo por nós de DOM. A MINUTA ganhou o botão
"Restaurar nomes" no editor: `guardarMinuta` grava `casoChave`, e o editor pede
o mapa ao worker (`casoLer`) e troca os rótulos nos NÓS DE TEXTO do documento
(nunca por replace no HTML). O mapa mental ainda mostra os rótulos crus.

**VARIANTES DO MESMO NOME RECEBEM O MESMO RÓTULO** (`chaveDe` +
`procurarVariante` em pseudonimos.js). "BANCO BRADESCO", "Banco Bradesco
S.A." e "BANCO BRADESCO S/A" ganhavam TRÊS rótulos, e o modelo, vendo
[ORGANIZACAO_13], [_15], [_23] e [_36], concluía que eram quatro requeridas e
escrevia isso na resposta (aconteceu). A chave canônica tira sufixo societário
e palavras de ligação; um trecho de ≥ 2 tokens contido em (ou contendo) UMA
única entrada funde com ela ("JOSÉ DA SILVA" depois de "MARIA JOSÉ DA SILVA");
ambíguo vira rótulo novo, e um token só nunca funde. As formas vistas ficam em
`reg.formas` e `proibidos()` emite UMA entrada por forma — a guarda e o
gazetteer procuram literais. `hidratar` preserva as formas.

**O FLIP LÊ A BASE COM A TRANSIÇÃO CSS DESLIGADA.** O `.panel` tem
`transition: transform`, e a troca de classe muda a transform base (nenhuma →
`translate(-50%, -50%)`): no instante seguinte à troca a transform computada
ainda era a ANTIGA (frame zero da transição) e `getBoundingClientRect` também.
A base lida era a identidade, o FLIP terminava com a janela no canto e ela
SALTAVA para o centro — "vai para a esquerda e volta para o meio". Com
`transition: none` inline + reflow antes de medir, o computado é o destino de
verdade; a transição volta num `setTimeout(0)`, quando já não há mudança a que
reagir. Medido no headless: `flip-from: matrix(1,0,0,1,-560,-361) …` e UMA
animação em voo, não duas.

**A PERGUNTA DIGITADA É RE-MASCARADA DEPOIS DAS PEÇAS** (`onSend`, logo antes
de montar o `userContent`), e a ordem importa: a primeira máscara roda no topo
do handler com o mapa de ANTES do turno, e o NER só encontra a "Cooperativa X"
dentro da peça durante `baixarSelecionadas`. Sem a segunda passada, "a
Cooperativa X pagou?" saía em claro ao lado da peça com `[ORGANIZACAO_1]` e a
guarda bloqueava o turno por um valor que a própria extensão acabara de
aprender. A bolha do usuário acompanha (`panel.atualizarTextoUsuario`): ela
mostra o que FOI à API.

**O `deny-list.json` PRECISA estar em `web_accessible_resources`.** Ele é lido
por `fetch(chrome.runtime.getURL(...))` de dentro do content script, e o
Chrome nega recurso de extensão a página de fora sem a entrada no manifest —
com o `catch` de `carregarDeny` devolvendo `() => false`, a lista simplesmente
não valia (o console dizia "deny list não carregou; seguindo sem ela") e
"Ministério Público" virava `[ORGANIZACAO_n]`. Mesma razão de o `panel.css`
estar lá.

**O MODO VESTE O PAINEL INTEIRO, não só o botão que o ligou** (classe
`.wrap.sigiloso`, posta por `pintarSigilo`): o CABEÇALHO troca de cor (verde
profundo `--sig-hd`), a marca e o botão Enviar vão para o mesmo gradiente, a
janela ganha borda de 2px com halo, e a tarja hachurada sob o cabeçalho leva
cadeado e a contagem do que está protegido. Um botão aceso responde "eu liguei
isto"; o que se precisa aqui é "eu **estou** aqui" — e o que muda é o que SAI
da máquina. A v0.55 tentou só a moldura (borda de 1px + faixa clara) e o
usuário leu como "uma coisinha verde": a marca pode ser ambiente na chrome; o
que continua branco é a CONVERSA, porque o §2 do DESIGN.md pôs o peso visual no
texto da resposta. Duas armadilhas de plataforma, as duas invisíveis fora de uma
captura de pixel (`getComputedStyle` reporta tudo vivo e correto nas duas):

- **`box-shadow: inset` pinta ABAIXO dos filhos** — o cabeçalho e as duas colunas
  cobrem o anel inteiro. Mesmo eixo da caixa 0×0 do tour.
- **`::after` e `::before` do `.panel` JÁ TÊM DONO** (a pega de arrastar e a alça
  de redimensionar do modo livre). Um elemento tem um `::after` só, então as duas
  regras disputam o mesmo pseudo propriedade a propriedade: a de baixo no arquivo
  vence onde declara e o resto da outra SOBRA. O anel saiu 13×13 no canto errado
  e a alça de redimensionar do modo livre foi destruída junto. Quem carrega a
  moldura é a borda que o `.panel` já tem — sem elemento novo, sem pseudo, e ela
  contorna também o cabeçalho escuro.

O selo `🔒 sigiloso` da `.metarow` virou BOTÃO e abre a `.audbox`, espelhando a
`.movbox` da linha do tempo (mesmo gesto, mesma anatomia — dois desenhos para o
mesmo gesto divergiriam no primeiro ajuste). Três camadas, na ordem em que a
dúvida aparece:

1. **QUANTO** foi mascarado, por tipo (`PESSOA 4`, `CPF 2`…) — a visão de uma
   olhada.
2. **O QUE** foi mascarado, peça por peça, com o **TEXTO QUE DE FATO SAIU**. Ele
   já está em memória (é o mesmo que foi ao request), então mostrar um resumo
   seria pedir que o usuário confiasse na extensão outra vez — que é justamente
   o que a auditoria existe para dispensar.
3. **A CHAVE** (rótulo → valor original), que é o que permite reidentificar.

**A camada 3 fica SÓ NA TELA, e essa separação é a decisão central.** O
relatório que se baixa (`⬇ Baixar relatório de conferência`) leva as camadas 1 e
2 e **não** leva a tabela: ela desfaz a anonimização, e um arquivo feito para ser
mostrado a terceiro que a carregasse provaria o CONTRÁRIO do que existe para
provar. O relatório diz isso em voz alta, e diz também o seu próprio limite ("a
conferência final é humana").

- **No relatório, o título da peça vai MASCARADO** (`tituloEnviado`), e o
  original fica só na tela. Título de auto carrega nome — "Petição inicial de
  FULANO DE TAL" —, e o arquivo vazaria no cabeçalho de cada seção. Na tela vale
  o original: quem audita precisa saber QUAL peça está olhando, e
  "[PESSOA_1] — petição inicial" não diz.
- **O CNJ e o NOME DO ARQUIVO também.** O número identifica o processo e, por
  ele, as partes; o nome do arquivo é um canal como qualquer outro. O relatório
  sai como `conferencia-anonimizacao-AAAA-MM-DD.md`.
- **Conjunto vazio se explica** (a regra da `.sel-nota`): sem nada mascarado
  ainda, a caixa diz que o mascaramento acontece no primeiro envio — a pergunta
  "então está funcionando?" nasce exatamente ali.

**E o PROGRESSO passou a contar.** Depois do download a peça já está `done` e a
barra em 100% — e a anonimização é a parte LENTA (o OCR de centenas de folhas).
O card ficava cheio, parado e mudo enquanto o trabalho continuava: o mesmo
"parecendo travado" que a v0.50.0 do OCR entregou ao usuário. Hoje a peça volta
a girar (estado `anon`, que herda o estilo do `upload` — é a MESMA peça
avançando de fase) e a nota CONTA (`Anonimizando 3 de 12 — <peça>`), porque uma
nota que só nomeia a peça não diz se falta muito.

**O QUE A REVISÃO PROFUNDA MUDOU** (advisor + Codex, 11 achados; os que mais
importam, porque nenhum tinha sintoma):

- **A guarda vivia só na memória do worker MV3 — que morre a cada ~30 s de
  ociosidade.** Ele renascia com o Map VAZIO e o atalho `if (!sigilo.size)`
  liberava toda requisição sem inspeção: a anonimização do content continuava
  acontecendo e a última barreira simplesmente não existia. Hoje o estado é
  persistido em `chrome.storage.session` (mesma disciplina do `safety_settings`
  do Gemini: sobrevive ao worker, morre com o navegador) e a guarda é
  **assíncrona** — ela ESPERA a restauração antes de decidir.
- **`entradaDoc` falha FECHADA sob sigilo.** Ela caía no original quando não
  havia versão mascarada, e isso acontecia sempre com ANEXOS (que não passam por
  `baixarSelecionadas`) — era o único caminho pelo qual o arquivo chegaria a
  `montarBlocos` com o modo ligado. Hoje devolve só o mascarado; a peça sem
  máscara é PULADA e reportada. Os anexos passaram a ser anonimizados junto.
- **`entradaParaMedir` é o irmão de MEDIÇÃO, e a distinção é a mesma do par
  `precisaBaixar`/`temBytes`**: "o que VAI no request?" não é "quanto isto
  OCUPA?". Sem ela, a falha fechada acima fazia a estimativa local contar ZERO e
  o medidor de contexto SUMIR da tela até a primeira peça ser mascarada —
  justamente na fase em que o usuário está marcando peças.
- **`count_tokens` não roda sob sigilo enquanto houver peça sem máscara.** Ele é
  uma requisição ao PROVEDOR com o corpo do request dentro; mandá-lo para "só
  contar" seria o mesmo vazamento. A camada local continua, que é de graça.
- **MEDIÇÃO NÃO PODE MUTAR ESTADO.** `refinarContexto` roda no debounce de 900 ms
  de TODA mudança de seleção e montava o system com `mascararCurto(ficha)` — que
  chama `mapa.rotular()`. O usuário ligava o modo, clicava numa peça e o
  artefato mais sensível da extensão ia ao disco por um caminho que ele não
  acionou. Hoje há `medindoSemGravar`, que mascara num mapa EFÊMERO (o texto sai
  igualmente anonimizado; nada é gravado), ligado só durante uma chamada
  SÍNCRONA — não há janela `await` com ele ligado.
- **Guarda que não armou = modo que não pode ficar ligado.** `rpc` REJEITA com o
  worker morto, e sem tratamento o handler morria com unhandled rejection: o
  modo já estava ligado, o selo pintado, e a barreira ausente. Hoje o modo volta
  atrás e o status diz por quê. E `seqSigilo` serializa cliques rápidos — o
  primeiro gesto não pode pintar "ligado" depois de o segundo ter desligado.
- **Histórico legado**: conversa gravada antes desta versão não tem
  `conversaSigilosa`, e `!== null` deixava LIGAR o modo por cima de um histórico
  cheio de `file_id`. Hoje é `(conversaSigilosa ?? false)`.
- **A guarda inspeciona o `Request`**: corpo e cabeçalho podem vir dentro dele
  (`fetch(new Request(url, {body}))`), e ali `init.body` é `undefined`. Corpo de
  tipo não reconhecido (`URLSearchParams`) é RECUSADO — liberar por não
  reconhecer é o oposto de falhar fechado.
- **Uploads do modo NORMAL levam a atribuição.** Sem ela, com sigilo armado em
  QUALQUER aba, um upload legítimo de outro processo caía na recusa por falta de
  ctx, o cliente voltava para base64 e um PDF grande estourava o teto.
- **`conferirPolitica` não tinha CHAMADOR** — a falha fechada que ela implementa
  nunca acontecia. Hoje `ner-worker.js` a chama ao carregar o config.
- **RG tinha promessa e não tinha detector.** `POLITICA_PADRAO` declarava
  `RG: true` e a documentação pública afirmava que RG era mascarado; não havia
  padrão nenhum. Hoje existe, e é o ÚNICO **ancorado na palavra** — RG não tem
  dígito verificador padronizado e o número cru é indistinguível de qualquer
  outro de 7 a 9 dígitos, então sem o rótulo por perto não há como afirmar que é
  RG. **Limitação dita**: um RG sem âncora ("portador do 12.345.678-9") não é
  detectado; se for de uma parte, o gazetteer da ficha o pega.
- **Canais que ficavam de fora e hoje passam pela máscara**: `customPrompt` (vai
  em TODO request), a **tese da minuta** (texto de quem assina, que quase sempre
  nomeia as partes — sem isso TODA minuta seria bloqueada), as **peças-modelo**
  (documentos REAIS de outros processos, com nomes de terceiros que a guarda nem
  reconheceria), os títulos e datas da minuta e do mapa, e o objetivo e a lista
  da triagem. **A máscara é aplicada só nas partes DINÂMICAS**, nunca sobre as
  constantes do programa: passar o `SUFIXO_MINUTA` pela máscara adulteraria a
  própria instrução se o detector tivesse rotulado uma palavra dela numa peça.

**DUAS ABAS NO MESMO PROCESSO: o mapa é FUNDIDO, não sobrescrito** (v0.59.0).
`mapaSigilo` é uma cópia por ABA, hidratada uma vez no boot, e `salvarCaso`
mescla com spread raso — então o campo `sigilo` inteiro era substituído pela
última gravação. As duas abas partiam do mesmo mapa, davam o **mesmo número a
pessoas diferentes**, e a segunda gravação apagava a primeira: o texto já tinha
saído com `[PESSOA_2]` e o disco passava a devolver outro nome. É a mesma
família do defeito em que `hidratar` renumerava — e o mesmo preço: um nome
trocado numa minuta que vai ao PJe assinada. Três peças, e nenhuma sozinha
basta:

- **`PSEUD.absorver` + `PSEUD.fundir`** (pseudonimos.js) são o algoritmo. O
  gravado é a AUTORIDADE e entra inteiro (os rótulos dele já podem ter viajado
  num request); os itens locais são absorvidos um a um. `absorver` é o irmão de
  `restaurar`, e a diferença é a que importa: ali o número gravado é um FATO,
  aqui é um PEDIDO — vale só se estiver livre, senão a parte ganha outro e a
  troca é reportada em `renumerados`. **A guarda tem de estar em `absorver`, e
  não em `anotar`**, que sobrescreve o `porRotulo` sem reclamar. A fusão respeita
  a chave canônica, então "BANCO BRADESCO" e "Banco Bradesco S.A." vindos de
  abas diferentes continuam sendo uma parte só.
- **Compare-and-swap em `salvarCaso`** (casodb.js + o `baseSigilo` que atravessa
  `caso.js` e `background.js`) é a ATOMICIDADE. Sem ela as duas abas leem o mesmo
  estado, as duas fundem contra ele e a segunda gravação apaga a primeira do
  mesmo jeito — a fusão sozinha só encurtaria a janela. O `sigilo` ganhou um
  campo `rev`; gravação com base velha é RECUSADA e a resposta traz o que está no
  disco. **O resto do patch passa mesmo assim**: perder o download de uma peça
  por causa de um conflito de mapa seria trocar um problema por outro. Sem
  `baseSigilo` o comportamento é byte a byte o de antes, que é o certo para os
  campos aditivos (peças, ficha, grid).
  - **A fusão fica no CONTENT e não no worker**, e isso é decisão: ela depende da
    chave canônica, que vive em `pseudonimos.js` (content script). Duplicá-la no
    worker criaria duas definições de identidade para divergirem — e divergir ali
    custa uma pessoa com dois rótulos, ou dois rótulos com uma pessoa.
- **`sincronizarMapaSigilo` dentro de `armarSigilo`** ENCOLHE a janela, e é
  importante não dizer mais do que isso. `armarSigilo` roda no início de TODO
  turno e o mascaramento das peças só acontece adiante (em `anonimizarLote`,
  dentro de `baixarSelecionadas`): sincronizando ali, os rótulos novos nascem a
  partir do maior número GLOBAL que se conhecia naquele instante. **A janela que
  resta é [a sincronização → o envio]** — caixa de conferência, upload e pré-voo,
  isto é, dezenas de segundos, não milissegundos. O DISCO fica consistente de
  todo jeito (o CAS garante que quem grava por último funde), mas o texto que a
  segunda aba ENVIOU naquele intervalo ainda pode carregar um rótulo colidido.
  Fechar isso de vez exigiria alocar o rótulo no worker, e `rotular` é síncrona —
  torná-la assíncrona espalharia `await` por `mascararCurto` e por todo o
  caminho de medição. Sai cedo quando a `rev` não mudou: numa sessão de uma aba
  só, que é 100% do uso normal, não custa nada além de uma leitura.
- **Renumeração conserta o `sigiloCache`, não o descarta** (`reescreverRotulos`):
  descartar obrigaria a refazer o OCR de centenas de folhas por uma troca que
  custa um replace. E a passada é **UMA só** — com duas, uma cadeia (2 vira 3 e 3
  vira 4) faria a segunda pegar o que a primeira acabou de escrever, e é numa
  fusão que a cadeia aparece.
- Coberto por `t-sigilo-duas-abas.mjs`, que reproduz a corrida (as duas abas dão
  o 2 a pessoas diferentes) e roda o CAS contra um IndexedDB de verdade
  (`fake-indexeddb`). **Testado por MUTAÇÃO nas duas metades**: tirar a checagem
  de ocupação em `absorver` derruba 4 asserções (uma delas dizendo que o 2
  passou a ser de Pedro); tirar a comparação de `rev` no `casodb` derruba outras
  4, entre elas "o mapa da aba B NÃO entrou por cima".
  - **LACUNA DE TESTE, dita porque não dizer é pior**: `fundir` e o CAS são
    testados em ISOLAMENTO; a FIAÇÃO entre eles — `sincronizarMapaSigilo` →
    `aplicarFusaoSigilo` → a reescrita do `sigiloCache` — não tem teste de ponta
    a ponta. O `t-turno-sigiloso` stuba `CASO` para falhar, então exercita só o
    ramo do catch. Para fechar: um modo em que `CASO.ler` devolva um mapa com
    `rev` diferente.

**LACUNA QUE PERMANECE:** desligar o modo numa aba desarma a guarda da outra,
cujo botão continua aceso.

**Onde o mascaramento acontece, e por que ali.** O gancho vive DENTRO de
`baixarSelecionadas`, no mesmo funil da bomba de upload e pela mesma razão que o
arquivo já dá para ela: são três pares baixar→subir idênticos (chat, minuta e
mapa), e nos call sites seria fácil esquecer um — e esquecer UM significa mandar
o PDF de um processo sigiloso para a API.

- **O texto mascarado vai para um cache SEPARADO** (`sigiloCache`), e
  `entradaDoc` o prefere quando o modo está ligado. Sobrescrever o `docsCache`
  faria o **preview** desenhar texto no lugar do PDF e a **exportação `.zip`**
  gravar as peças anonimizadas — dois consumidores que querem o documento
  ORIGINAL porque não mandam nada para lugar nenhum. Mesmo eixo do par
  `precisaBaixar`/`temBytes`.
- **`precisaUpload` sai na PRIMEIRA linha no modo sigiloso**, e a guarda tem de
  estar ali e não no chamador: aquele predicado lê o `docsCache` **direto**, não
  o `entradaDoc`, então enxergaria a entrada ORIGINAL e mandaria o PDF para a
  Files API — o arquivo sairia por um caminho que não passa por `montarBlocos`,
  que é onde toda a atenção estava. O handler `upload` do worker recusa como
  rede de segurança.
- Os quatro predicados fazem o certo com `kind:"text"` **por construção**:
  `podeAnexar` exige `d.text`, `precisaUpload` só olha `pdf`, `temBytes` idem.
  Foi isso que permitiu a integração não tocar em `montarBlocos`.
- **Quem numera primeiro é a FICHA, não a peça — e isso é aceito.**
  `refinarContexto` roda no clique da peça, muito antes de qualquer turno, e
  monta um request prospectivo com `systemPromptAtual()` — que passa a ficha por
  `mascararCurto`. As partes saem numeradas na ordem do CABEÇALHO (polo ativo,
  depois passivo). É a ordem do REQUEST (o system precede as peças) e é a ordem
  CANÔNICA do processo, estável entre sessões — pela ordem da primeira peça, as
  mesmas pessoas ganhariam rótulos diferentes conforme qual peça o usuário
  marcasse primeiro. `[PESSOA_1]` = polo ativo é ainda mais legível.
- **Os canais CURTOS passam por `mascararCurto`** (só os detectores
  determinísticos, síncrono, com o MESMO mapa): `title` do bloco `document`, a
  ficha e o CNJ do system, o inventário, a linha do tempo e **o texto que o
  usuário digitou** — ele escreve "o que o João alegou na fl. 12?" e derrubaria
  o próprio turno na guarda. A bolha do usuário mostra o texto MASCARADO, de
  propósito: é o que foi à API, e a conversa não pode exibir uma coisa e enviar
  outra.
- O texto da peça sai de `lerPdfNoFrame` (pdf.js no iframe) + OCR das folhas
  digitalizadas. **NÃO reusa o laço de `onExtrairTexto`**: aquele monta o `.md`
  com front-matter, índice e meia dúzia de acumuladores presos num closure — o
  que se quer aqui é a string. Mesma escolha do `rtfParaTexto` copiado em
  `docx-importar.js`.
- **Peça que não dá para anonimizar NÃO vai como arquivo**: fica de fora e entra
  no relatório de falhas do chat. Deixá-la seguir pelo caminho normal seria o
  único jeito de o PDF escapar.
- **Falha do NER DERRUBA a peça.** Sem ele os determinísticos ainda valem, mas
  nomes de terceiros no meio do texto passariam — e seguir em silêncio seria
  prometer uma anonimização que não aconteceu.

**Troca de modo no meio da conversa é BLOQUEADA** (`conversaSigilosa`, irmão de
`conversaProvider`): o histórico não pode misturar os dois, porque a mesma peça
apareceria duas vezes — uma com nomes e outra com rótulos — e os blocos binários
do histórico derrubariam o request na guarda. Alerta no toggle e guarda DURA no
envio; "Nova conversa" resolve. **`zerarEstadoDaConversa` NÃO desliga o modo nem
apaga o mapa**: o botão promete zerar o chat, não esquecer que o processo corre
em segredo de justiça — e apagar o mapa quebraria a reidentificação de uma
minuta já gerada.

**O NER roda num Web Worker do documento OFFSCREEN, e ele MORRE ao fim do lote.**
Ele precisa de `crossOriginIsolated` para o ORT usar threads (o OCR mediu 21× no
mesmo eixo), e isolamento cross-origin só existe em página de extensão; o service
worker não tem `new Worker`. E `InferenceSession.create()` copia os pesos para
dentro da `WebAssembly.Memory` do ORT, que **cresce e nunca encolhe**: o BERT
residente ao lado do PP-OCRv6 deixou a extração 1,48× mais lenta no app irmão.
`Worker.terminate()` é o único ponto de liberação determinística que a plataforma
oferece — mas terminar a cada peça recarregaria 109 MB toda vez, então o desenho
é encerrar por **ociosidade** (45 s), com fechamento explícito ao fim do lote.

**O modelo** é `pierreguillou/ner-bert-base-cased-pt-lenerbr` (LeNER-Br, 13
rótulos BIO), exportado para ONNX na revisão fixada e **quantizado para INT8**.
Procedência, contrato, comando de exportação e as três armadilhas de ambiente
estão em `vendor/ner-modelo/PROCEDENCIA.md`. O `.onnx` **não é versionado** (109
MB, e o GitHub recusa blob acima de 100 MB sem LFS): `empacotar.ps1` confere o
SHA-256 contra o `PROCEDENCIA.md` — fonte única — e RECUSA gerar o pacote se o
arquivo faltar ou divergir.

- **INT8 foi MEDIDO, não suposto**: FP32 são 434 MB que praticamente não
  comprimem (93% no ZIP, pacote publicado saltaria de 13,9 MB para ~416 MB); o
  INT8 é 109 MB, comprime para 65 e é **23% mais rápido**. E — o que decide —
  **produz as mesmas entidades**: os logits diferem em TODOS os valores medidos
  (máx. 2,85) e o teste de ponta a ponta dá 71/71 nos dois.
- **O critério de aceitação MUDA com a quantização, e é aí que engana.** Contra
  o PyTorch, o FP32 tinha de bater em 5e-05. O INT8 não bate e não precisa: a
  pergunta deixou de ser "os logits são iguais?" e passou a ser "as mesmas
  entidades saem?". Ao trocar de modelo ou de esquema de quantização, **regravar
  os logits e rodar aquele teste** — comparar logits não diz nada aqui.

**O tokenizador é escrito à mão** (`tokenizador.js`, WordPiece do BERT com
offsets de caractere) porque a extensão não tem build step e o Transformers.js
traria o PRÓPRIO ONNX Runtime, duplicando os 27 MB de `vendor/ort/`. A fidelidade
aqui é de SEGURANÇA, não de estilo: um token a mais ou a menos desloca o rótulo
previsto, e o efeito de um rótulo deslocado num anonimizador é **um nome que não
foi mascarado**. Ele é conferido contra a implementação **Rust do HuggingFace**
(`tokenizers`), ids **e** offsets — escritor conferido pelo próprio escritor não
prova nada, a mesma regra do `ZipW`/`zipfile` e do QR/`jsQR`.

- O contrato vem do modelo, não da memória: `do_lower_case: false`,
  `strip_accents: null` — **cased e COM acento**, o oposto do reflexo do resto
  do projeto (o `norm()` do painel tira acento em toda classificação de peça).
  `conferirConfig` LANÇA na divergência. A armadilha: `strip_accents` tem default
  `null`, que significa "siga o `do_lower_case`" — lê-lo como `false` sem olhar o
  outro campo é o erro que a função existe para impedir.
- **A normalização é NFC e acontece UMA vez, na entrada.** Em `content.js` ela é
  feita inline (`normalize("NFC")`) e não por `Tokenizador.paraCanonico`, porque
  `tokenizador.js` NÃO é content script — roda no Web Worker, do outro lado da
  ponte, e carregá-lo em toda página `jus.br` por uma linha seria caro à toa.
  **NFC e nunca NFKC**: a compatibilidade reescreve ligaduras, frações e formas
  de largura, e o que sai daqui é o texto do documento. (No `pseudonimos.js` é o
  oposto — NFKD, porque ali o objetivo é COMPARAR, e um OCR que devolve a
  ligadura `ﬁ` precisa casar `fi` no gazetteer.)
- **INVARIANTE: `JANELA_OVER` tem de ser MAIOR que a entidade mais longa, EM
  TOKENS.** Abaixo disso a entidade sobre a fronteira não é vista inteira por
  NENHUMA das duas janelas, e a regra `naBorda` não salva — não há o que marcar.
  "ELIONEUDO EVARISTO" são DOZE tokens (o WordPiece parte nome próprio em pedaços
  de uma letra) e com `over: 8` a detecção some por completo. Os 64 do arquivo
  dão folga de 5×. Há teste que **passa por falhar**, fixando esse custo.
- **A unidade de decisão é a PALAVRA, nunca o subtoken** (`agregarPalavras`), e
  **"O" só vence quando TODOS os subtokens dizem O**: com "Jo" = B-PESSOA (0,70)
  e "##ão" = O (0,80), o máximo puro faria a palavra virar O e o NOME SUMIR. Num
  anonimizador o erro caro é o falso NEGATIVO.
- **Sequência BIO malformada é o caso NORMAL**: `I-X` sem `B-X` antes ABRE a
  entidade em vez de descartar — descartar por malformação é perder uma pessoa
  em silêncio.
- **A detecção na borda é MARCADA, não descartada** (`naBorda` +
  `fundirJanelas`): a versão truncada só cai quando existe uma FIRME cobrindo o
  mesmo trecho. A janela vizinha pode simplesmente não disparar ali, e descartar
  apagaria a ÚNICA detecção que existia.

**Testado com 448 verificações** no scratchpad: o tokenizador contra o oráculo
Rust (28 casos, ids e offsets, com 9 mutantes pegos), os quatro módulos de
lógica, a guarda de saída extraída do fonte real e rodada em `vm`, a fiação
(constantes duplicadas, manifest, ponte offscreen), a cadeia inteira com os
**logits REAIS do modelo** sobre texto jurídico, e **um turno completo em jsdom
nos DOIS modos** — o de modo desligado é o que prova a não-regressão.

## Anonimização na origem — o ponteiro para o TecJustiça Sigilo

O `help.html` já ENUNCIAVA o art. 19, §3º, IV da Res. CNJ 615 (vedado usar IA privada ou
externa em documento sigiloso, **salvo anonimização na origem**) e terminava em "a decisão
sobre o que marcar é sua" — um dever sem caminho. O caminho é o
[TecJustiça Sigilo](https://github.com/marcosmarf27/tecjustica-sigilo): programa Electron
separado, 100% local, que mascara PII e grava um `.txt`; o `.txt` volta pelo 📎, que já o
aceita e já sabe conversar **sem peça marcada** (`soAnexosNoContexto`).

**Nenhuma linha do caminho de dados mudou** — a rodada inteira é DESCOBERTA, em três
camadas: `.hint-sigilo` no estado vazio do painel, cartão na página de opções + linha na
`.privacy` das duas telas de config, e a seção `#sigilo` do guia. Regras:

- **O clique leva ao GUIA, nunca direto ao GitHub.** O instalador tem ~660 MB, só roda em
  Windows x64 e baixa mais ~1,7 GB de modelo na primeira execução. Quem descobre isso
  depois do download descobriu tarde — é o mesmo erro do `.gwarn`, que existe para avisar
  ANTES do gesto caro. O botão de baixar mora no fim do card que explica os requisitos.
- **O painel só aponta**; o que envelhece (tamanho, formatos, entidades detectadas,
  precisão) mora no `help.html`, como a tabela de modelos e preços.
- **O ponto de descoberta é o ESTADO VAZIO**, não a `.toolbar` (vive no limite em 484px)
  nem a `.docs-tip` (escopo "lista inteira"), e nunca a `.inrow` — faixa que muda de
  altura numa linha com botões é o bug do 📎 que "só abria na terceira vez". Ele some com
  a primeira mensagem, como o resto do bloco: nada pode entrar entre a pergunta e a
  resposta.
- **`.hint-tour` e `.hint-sigilo` dividem a regra de CSS** (irmãs, como
  `.tip-load, .tip-zip, .tip-ia`) e vivem numa **fileira** `.hint-acoes` com `wrap` — duas
  pílulas de mesmo desenho empilhadas leem-se como menu. Medido: 473px em fileira única
  nos modos largos; em 420px quebra em duas, centrada e sem vazamento. A margem que separa
  do `<details>` vive no wrapper, não no botão — no botão ela empurraria só a primeira
  linha quando a fileira quebrasse.
- **O selo `.hs-sel` usa `--ok-*`, não `--accent-bg-2` do `.ht-dur`**: o do tour responde
  "quanto isto me custa?" (1 min); este responde à objeção que nasce junto com a ideia
  ("o documento vai para outro servidor?"), e "não" é confirmação, não custo.
- **A ressalva de precisão não é rodapé.** ~91% em texto jurídico é bom para uma primeira
  passada e insuficiente para confiar de olhos fechados; o que escapa vai INTEIRO para a
  API. Anonimizador que se anuncia infalível é pior que nenhum, porque produz confiança
  onde deveria produzir revisão.
- Dito no guia, porque muda o trabalho: **um `.txt` é citado por TRECHO, não por folha**
  (o bloco vai como `document` com `source.type:"text"` e `citations:{enabled:true}` —
  `char_location`, sem página).
- **BUG PRÉ-EXISTENTE corrigido de carona**: `.ic-in` (ui.css) fixa `color: var(--pje)`
  porque nasceu para viver DENTRO DE UMA FRASE (DESIGN.md §5). Dentro do `.num` — círculo
  cujo fundo é esse mesmo `--pje` — o ícone ficava **azul sobre azul**, invisível e sem
  erro nenhum, em CINCO cards publicados; passava por "marcador redondo". A regra
  `.card .num .ic-in { color: inherit; margin-right: 0 }` conserta os cinco. Só uma
  captura de pixel mostra esse tipo de falha — `getComputedStyle` reporta tudo vivo e
  correto, como no `box-shadow` da caixa 0×0 do tour.

## A LINHA DO TEMPO PROCESSUAL no contexto (`PJE.listarMovimentacoes` + `linhaDoTempoProcessual`)

**As datas dos atos são o eixo que as peças não têm.** Relato que abriu a rodada:
pedir a data do trânsito em julgado devolvia *"não é possível determinar com
segurança"* — e a resposta estava CORRETA, porque publicação, decurso de prazo e
trânsito são **movimentos**, e movimento quase nunca vira peça com texto. O modelo
recebia os PDFs, o `title` `"207691389 - Sentença"` (sem data), a ficha e mais nada.
Não era o modelo "não vendo" as datas: elas nunca foram enviadas.

Três blocos passaram a viajar no texto do turno, pelas MESMAS razões do inventário
(a timeline muda, então não vão no system; e só na cópia enviada, senão acumulam):
**linha do tempo processual**, **data de juntada das peças anexadas** e o
inventário, que ganhou a data de cada peça não marcada.

- **A fonte é a rota REST `processos/{id}/movimentacoes`**, não o DOM. Melhor em
  tudo o que importa: alcança além do trecho rolado (o DOM dá só o que carregou), tem
  **hora** (`dataAtualizacao` é epoch; o `.media.data` da timeline só dá o dia),
  usa o **vocabulário CNJ** (`codEvento`/`dsEvento`) e traz o `textoFinalExterno`
  — que é o campo que FECHA a conta do prazo: *"Decorrido prazo de EUDES … em
  16/07/2026 23:59"*. Custa ~77 ms e **zero tela JSF**. Medido em sessão real no
  processo P3; detalhes em `docs/pje-api-rest.md`.
- **`lerEventos()` (DOM) continua como FALLBACK**, para o tribunal em que a rota
  não exista. O cabeçalho do bloco DIZ qual fonte produziu a lista, e o aviso de
  parcialidade **só sai no fallback** — repeti-lo com a fonte oficial faria o
  modelo recusar uma data que ele tem em mãos, que é o defeito de origem.
- **Cache + `garantirMovimentacoes()`**: `linhaDoTempoProcessual` é SÍNCRONA
  (roda dentro de `comInventario`, na montagem do request), então quem busca é um
  `await` no início do turno — em `onSend`, `minutarAgora` e `mapearAgora`, os
  três que montam contexto. Falha de rede **não apaga** o que o turno anterior
  obteve (só substitui em caso de sucesso).
- **TETO DE TEMPO obrigatório na rota** (`MOVS_TIMEOUT_MS` = 4 s, `AbortController`)
  **e desistência pela vida da página quando ele estoura** (`movsPendurou`). Ela
  roda no começo de TODO turno, então um endpoint que aceita a conexão e nunca
  responde deixaria o Enter **sem efeito nenhum** — sem token, sem erro e sem
  status, porque `setStatus("")` acabou de rodar. Rota que pendura é pior que rota
  que falha, e não é hipótese: é o que as rotas fora de `pje-legacy/` fizeram na
  sondagem. O fallback pelo DOM é instantâneo, então esperar mais não compra nada.
  A desistência vale **só para o pendura** — erro de HTTP (404 no PJe sem a rota,
  500 transitório) volta rápido e pode ser passageiro, então continua tentando.
  - **E só depois de DUAS expirações seguidas** (`MOVS_TIMEOUTS_ATE_DESISTIR`;
    sucesso zera o contador). Armar o desligamento na PRIMEIRA foi um defeito de
    escala introduzido pela v0.46.0, que passou a chamar a rota também **no
    BOOT** — o instante mais congestionado da aba, com o PJe ainda carregando no
    MESMO host. Um soluço de rede de 4 s ali degradava a **sessão inteira** para
    o fallback do DOM (linha do tempo parcial, sem hora), e o selo anunciava
    "(da tela)" e "PARCIAL" como se fosse limitação do tribunal: silencioso,
    irreversível sem F5, e exatamente a resposta ruim sobre prazo que esta seção
    existe para eliminar. O preço no pior caso não muda de ordem — com a rota
    realmente pendurada, o boot gasta a 1ª expiração e o 1º turno a 2ª, isto é,
    UM Enter de 4 s por página. O que desliga a rota é ela pendurar SEMPRE, não
    ter pendurado uma vez.
- **ORDENA SEMPRE, e o desempate depende da FONTE.** Não confiar na ordem de
  quem entregou: a rota devolve fora de ordem, e pular o sort "porque o pje.js já
  ordenou" pôs a distribuição depois da sentença — só o teste viu. O desempate
  muda porque a granularidade da data muda: no REST o timestamp é ao segundo e
  empate é raro (preserva a ordem de origem); no DOM a data é por DIA, todos os
  atos do dia empatam, e como a timeline lista do mais recente para o mais antigo
  o desempate certo é **inverter**.
  - **Movimento sem data sai do `sort` ANTES**, e vai para o fim. Um comparador
    que devolve 0 para todo par que envolva `null` **não é ordem total**: com
    A(1), B(sem data) e C(2) tem-se `cmp(A,B)=0`, `cmp(B,C)=0` e `cmp(A,C)<0` ao
    mesmo tempo, e diante de comparador inconsistente o `sort` pode devolver
    qualquer permutação — inclusive **trocando de lugar dois atos datados**.
    Particionar resolve por construção; o desempate explícito por índice dispensa
    depender da estabilidade do `sort`.
- **Hora só quando ela existe.** Ato de meia-noite exata é o que o PJe grava em
  publicação de diário; escrever "00:00" ali afirmaria precisão que o dado não
  tem.
- **As datas das peças NÃO vão no `title` do bloco `document`.** Tentador (ficaria
  colada ao documento), e errado por dois motivos: `tituloLimpo` deriva do mesmo
  campo e o rótulo das citações sairia poluído; e o `title` entra no prefixo
  CACHEADO, então uma peça anexada antes de a lista oficial chegar ficaria sem
  data para sempre. Na lista separada, recalculada a cada turno, a data aparece
  assim que a lista oficial chega.
- **Teto `MOV_MAX` (140), e o corte NÃO pode ser posicional** (`ehExpediente`).
  Cortar o meio é a regra do "Escolher com IA" e do inventário, e aqui ela estava
  errada: num processo de 400 movimentos o miolo é exatamente onde mora o ato
  procurado — a publicação da sentença de 2019, o trânsito da fase anterior. Pior
  que perder o dado era o RÓTULO: "movimentos de expediente omitidos" afirmava
  sobre o que ninguém tinha olhado, e um "não consta" nasceria de uma ausência
  fabricada pela própria extensão.
  - **Define-se o DESCARTÁVEL, nunca o essencial** (`RE_MOV_EXPEDIENTE`, ancorada
    em `^` porque o primeiro termo é o nome do evento). Isso inverte o modo de
    falha para o lado seguro: movimento que a lista não reconhece **fica**.
  - **VETO por cima, buscado em TODO o texto** (`RE_MOV_IMPORTA`, sem âncora):
    "Certidão de trânsito em julgado" começa por `certidao`, que é expediente, e é
    o ato mais importante que a linha do tempo tem a dizer. Ancorar o veto logo
    após a palavra não serviria — na fonte REST o texto é `evento — complemento`,
    então entre "certidao" e "de transito" há um travessão.
  - Fora do descartável **de propósito**: `expedição de…` (é assim que muito PJe
    registra a comunicação que inicia o prazo) e `vista`/`ciência` (vista ao MP
    abre prazo). Colateral aceito e no teste: `\bautua` no veto (que protege a
    "Autuação", marco inicial de processo migrado) mantém "Retificação de
    autuação", que é expediente puro — errar para o lado de manter custa tokens.
  - As pontas ficam intactas (35 primeiros, 63 últimos) e o **rótulo do corte diz
    a verdade**: só afirma "de expediente" quando foi só expediente; quando o
    excesso obriga a cortar por posição, diz que **não** são só de expediente e
    que pode faltar publicação, intimação ou decurso naquele intervalo.
  - **E diz o INTERVALO de datas atingido**, não só "omitidos aqui". O que sai
    está ESPALHADO pelo miolo (são os movimentos de expediente entre `ini` e
    `fim`), mas a marca entra numa posição só: dizer apenas "aqui" localiza num
    ponto o que aconteceu ao longo de um trecho, e depois da marca as datas
    seguem saltando sem nada que explique. Vale para o texto que vai ao modelo e
    para a `.mv-gap` da lista. O recorte da data usa `soODia`, que por causa
    disso mora no TOPO do IIFE, junto de `fmtData`: os dois consumidores estão
    em pontos distantes da mesma função, e uma `const` declarada entre eles
    lançaria "Cannot access before initialization" no primeiro.
- **NÃO afirmar "lista completa do processo".** A cobertura da rota foi medida em
  UM processo, de 25 movimentos — nada prova que ela não pagine num de 400 —, e a
  frase ficava CONTRADITÓRIA logo depois do corte do miolo. O rodapé afirma a
  **procedência** ("registro oficial do PJe"), que é o que se sabe, mais o total e
  quantos foram listados. É a procedência que dá ao modelo a confiança de não
  hedgear, sem prometer o que ninguém conferiu.
  - **GUARDA ANTI-TRUNCAMENTO**, irmã da que `listarPelaApi` já tem: se a timeline
    do DOM mostra ato ANTERIOR ao mais antigo da lista oficial, a lista não
    alcança o início do processo — o aviso sai com as duas datas e o rodapé
    **para de afirmar** que a fonte não depende do que está carregado na tela. O
    sinal é POSITIVO (o DOM carrega do mais recente para o mais antigo, então ele
    nunca ultrapassa a rota por acidente). A folga de **24 h** não é
    arredondamento: a data do DOM nasce à meia-noite local e a da rota tem hora,
    então sem ela todo processo teria o aviso.
  - **A medida da timeline nasce DENTRO do ramo que a lê.** `PJE.listarDocumentos()`
    varre `#divTimeLine a` com regex por link E chama `lerEventos()` por dentro
    (recursão pela árvore inteira); ela só serve à guarda de parcialidade do
    **fallback**. Calculada antes do `if`, rodava também no caminho comum — o da
    rota REST, em que ninguém a lê —, somando uma varredura completa por turno na
    janela entre o Enter e o request. Coberto por teste (zero chamadas no turno
    com a rota REST viva; ≥ 1 no fallback).
- **Data de JUNTADA não é data do ATO**, e isso vai dito no rótulo do bloco e no
  `PROMPT_FIM`: petição protocolada em papel é juntada dias depois, documento
  antigo é juntado hoje. Confundir os dois é o erro de prazo mais fácil de cometer
  e o mais difícil de perceber conferindo a resposta. `datasDasPecas` também não
  corta a data por posição — `dataBr` REPASSA formato desconhecido (decisão certa
  lá), e `slice(0,16)` transformava "19 de junho de 2026" em "19 de junho de 20".
- **A regra no `PROMPT_FIM` não é opcional**: o modelo foi treinado a responder
  pelo CONTEÚDO dos documentos, e prazo é justamente o que não está escrito neles.
  Sem a instrução ele ignora o bloco. Ela manda tratar a linha do tempo como
  fonte **preferencial** de datas, citar movimento + data, distinguir o que está
  REGISTRADO do que ele CALCULOU, e — no fallback parcial — ler ausência como
  "não carregado", nunca como "não aconteceu". E, mesmo com a lista completa,
  **ausência é "não há movimento registrado de X", nunca "X não aconteceu"**:
  registro é o que foi lançado no sistema, não o mundo — um trânsito que ocorreu e
  não foi certificado existe juridicamente e não está ali.
- **O que vai ao modelo se ANUNCIA na interface** (`panel.setLinhaDoTempo` + o selo
  `.linhatempo` na `.metarow`, v0.45.2). Até aqui o bloco viajava e a UI não dizia
  nada: dava para ler uma resposta sobre PRAZO sem saber se ela veio do registro
  oficial ou de uma leitura parcial da tela, nem que a lista havia sido cortada. O
  corte "ia dito" — **ao modelo, que já tinha o dado**, e não a quem decide se
  confia na resposta. Regras:
  - **O anúncio nasce DENTRO de `linhaDoTempoProcessual`** (`anunciarLinhaDoTempo`),
    no ponto único que monta o bloco. São TRÊS caminhos que a chamam (chat, minuta,
    mapa) e um espelho mantido do lado de fora divergiria no primeiro que alguém
    esquecesse — o selo passaria a descrever uma intenção em vez do request. É
    best-effort: falhar em pintar um selo não pode derrubar um turno.
  - **Todos os `return ""` também anunciam** (`{n:0}`): zero movimento se explica,
    não desaparece (a regra da `.sel-nota` e do estado vazio da biblioteca) — é o
    selo que diz por que a pergunta de prazo vai voltar sem resposta.
  - **O selo NASCE NO BOOT** (`setTimeout` de 600 ms no FIM de `iniciar()`), não na
    primeira resposta — e isto corrige o defeito que o dono do projeto encontrou
    na v0.45.2: *"onde é que fica essas informações das datas que eu não estou
    vendo?"*. Quem quer conferir se a extensão viu as datas **abre o painel e
    olha**; não pergunta primeiro. Segunda vez que um recurso entregue ficou
    invisível por depender de uma ação (a primeira foi a caixa de apoio).
    - A rota REST cabe no boot porque custa ~77 ms e **zero tela JSF**; se falhar,
      `linhaDoTempoProcessual` cai sozinha para o DOM, que é de graça.
    - **Chama-se a função INTEIRA e descarta-se o texto**, de propósito: é o mesmo
      caminho que monta o bloco do request, então o selo não tem como divergir do
      que o turno vai mandar. Um atalho que só contasse movimentos seria uma
      segunda contagem para divergir da primeira.
    - **600 ms, e no fim de `iniciar()`**: cedo o bastante para preceder o dedo do
      usuário no rodapé (a armadilha da "faixa que muda de altura"), e depois de
      TODAS as declarações — chamar isso de dentro do `refresh()`, que roda ~800
      linhas antes de `movsOficiais` existir, lançaria "Cannot access before
      initialization" e levaria metade do painel junto, em silêncio.
  - **`zerarEstadoDaConversa` NÃO apaga o selo**, e isto inverte a decisão da
    v0.45.3 (que o zerava junto com o medidor e o custo). Enquanto ele nascia no
    turno, descrevia "a última resposta" e apagá-lo fazia sentido. Nascendo no
    boot, ele descreve o **PROCESSO** — quantos movimentos existem, de que fonte, e
    a lista que dá para ler —, e isso segue verdadeiro depois de "Nova conversa":
    o próximo turno manda os mesmos movimentos. Apagá-lo devolveria o selo ao
    estado invisível que originou a correção.
  - Estados, tokens e a razão de o selo morar na `.metarow` (e não na `.docs-tip`)
    estão no DESIGN.md, "Selo da linha do tempo".
- **O selo ABRE a lista dos movimentos** (`.movbox`), e é isso que responde à
  pergunta do usuário: *"onde é que fica essas informações das datas?"*. O selo
  dizia QUANTOS movimentos foram; as datas em si não apareciam em lugar nenhum —
  iam ao modelo e só voltavam se ele as citasse na resposta. Quem confere prazo
  precisa do REGISTRO, não do resumo.
  - **A lista é a MESMA que foi ao modelo, já cortada**, e o corte entra nela como
    uma LINHA (`.mv-gap`), não só como número no cabeçalho: sem a marca, as datas
    saltariam de 2011 para 2026 no meio da lista sem explicação — pior que dizer
    que faltou pedaço.
  - **`itens` viaja com `evento` e `texto` SEPARADOS** (além do `mov` já
    concatenado que vai ao modelo): na tela o evento é negrito e o complemento vem
    abaixo, e é no complemento que está o que fecha a conta ("… em 16/07/2026
    23:59").
  - **`textContent`, NUNCA `innerHTML`**: movimento e complemento são conteúdo dos
    autos, e o `escapeHtml` do painel não escapa aspa simples. A única exceção é o
    ✕, que é SVG do próprio pacote.
  - **`position: fixed`**, como o `.selmenu` e a `.confirmbox` — o `.wrap` é um
    container de tamanho ZERO. Alinhado à direita do selo e ACIMA dele (é lá que há
    espaço); abaixo só quando não cabe em cima. Medido: borda direita da caixa
    coincidente com a do selo, 420×375 em (69,234) com o selo em (421,617).
  - O id da peça vira botão e reusa **`irParaPeca`** — o MESMO caminho do "ver na
    timeline" da lista de peças (que troca para o modo lateral antes de rolar).
    Só id que casa `^\d+$` entra, como nas citações do chat.
  - Esc fecha com **`stopPropagation`** (senão a cascata do painel cancelaria o
    modo minuta junto) e `setLinhaDoTempo` fecha a caixa ao trocar o retrato —
    nunca mostrar movimentos de um estado anterior.
  - **O clique fora fecha pelo `document`, NÃO pelo `wrap`** (é a diferença desta
    caixa para o `.selmenu`, que só ouve o `wrap`). O `wrap` enxerga apenas o
    Shadow DOM, e nos modos lateral, livre e flutuante a página do tribunal fica
    visível e CLICÁVEL ao lado, com a caixa em `position: fixed` por cima dela:
    ancorado ali, clicar nos autos não fechava nada e a lista ficava aberta sobre
    o processo (o `.selmenu` sobrevive a isso porque ainda fecha em todo
    `setDocs`; esta caixa não). Os gestos DENTRO do painel — ✕, troca de modo,
    backdrop, arrasto do modo livre — já eram cobertos pelo `pointerdown` que
    borbulha até ali; o que faltava era o lado de fora.
  - **A decisão é por `composedPath()`, nunca por `e.target`**: no `document` o
    alvo de dentro do Shadow DOM chega RETARGETADO para o host, então
    `e.target.closest(".movbox")` daria `null` e o clique dentro da própria caixa
    a fecharia — inclusive o do botão "peça N", que morreria antes do `click`.
    `capture: true` e a guarda `!movbox` na primeira linha: fora desse estado o
    listener não custa nada. Testar isso exige `pointerdown` + `click`, nunca só
    `click`: com evento sintético incompleto o teste acusa fechamentos que na
    verdade funcionam (foi assim que dois falsos positivos entraram numa revisão).
- **A movimentação precisa de FORMA PRÓPRIA de citação na minuta e no mapa**
  (`(movimentação de DD/MM/AAAA)` no `SUFIXO_MINUTA` e no `SUFIXO_MAPA`). Os dois
  exigem `(Título da peça, id 123456, fl. 7)` para toda afirmação e proíbem
  inventar data — e a data da linha do tempo **não tem peça nem folha**. Sem forma
  própria o modelo ficava entre duas saídas ruins: omitir a data, e o relatório da
  sentença sai sem os atos que o fundamentam (o defeito que esta rodada existe
  para resolver), ou pendurar a data numa peça qualquer para satisfazer o formato
  — citação inventada num documento que vai ao PJe assinado. É a exceção
  DELIBERADA à regra "peça · id · folha nas cinco saídas": o eixo do tempo tem
  origem diferente do eixo do documento.
- Cobertos por três testes: a normalização da rota (`fetch` fake com o JSON REAL
  medido, incluindo ordem, empate, sufixo `Documento: N`, as quatro formas de
  degradar e a **rota que pendura**), a tabela de `ehExpediente` (49 movimentos do
  vocabulário CNJ, extraídos do fonte real por varredura e rodados em `vm`) e o
  caminho do envio em jsdom — o bloco no payload, a ordem cronológica, o
  não-acúmulo no histórico, o fallback, o aviso de parcial, o **processo de 200
  movimentos** (o trânsito do miolo sobrevive; o rótulo do corte confessa quando
  precisa), o **movimento sem data que não embaralha os datados**, a guarda
  anti-truncamento (com o negativo do mesmo dia) e a citação da movimentação
  chegando ao request da minuta e do mapa.

## Lista completa ≠ linha do tempo carregada (o laço do "ver na timeline")

**São dois DOMs, e só uma das três rotas do ⟳ mexe no segundo.** A lista do painel
vem de `listarDocumentos()` + `aplicarListaOficial`; a linha do tempo é o
`#divTimeLine` da PÁGINA. `listarPelaApi` (rota 1, REST) e `listarPelaGrid`
(rota 2, iframe) preenchem a LISTA sem injetar um nó sequer na timeline — só
`carregarTimelineCompleta` (rota 3, scroll) o faz, e desde a v0.38 ela é o
FALLBACK: no caminho normal ela nunca roda.

Consequência sentida pelo usuário e relatada como bug: `scrollAte`/`acharLink`
procuram em `#divTimeLine a`, então o "ver na timeline" funcionava nas peças do
trecho já rolado e falhava no resto — *"para alguns aparece, outros não"*. E a
mensagem de falha mandava usar o **⟳ Carregar tudo**, que resolve pela REST e
deixa a timeline exatamente como estava: o usuário clicava, nada mudava, e voltava
ao mesmo aviso. Laço sem saída, com a impressão — correta — de que *"na extensão
tem tudo, no PJe não"*.

- **A correção é o handler fazer o trabalho, não instruir o usuário a repeti-lo**:
  falhou o `scrollAte`, roda `carregarTimelineCompleta` e tenta de novo.
- **`pararQuando` (2º parâmetro, opcional) encerra a rolagem assim que a peça
  aparece.** Este gesto não quer a lista inteira, quer UMA peça; numa peça do meio
  são segundos contra o teto de 90 s. Sem o parâmetro o comportamento é byte a
  byte o de antes, e o campo `achou` **não** aparece no retorno de quem não
  perguntou. Ao parar cedo, a rolagem NÃO é restaurada — quem pediu vai rolar até
  o alvo em seguida, e restaurar produziria dois saltos na tela.
- **`PJE.temNaTimeline(id)` é público por isso**: "está na timeline?" é pergunta
  diferente de "está na lista?", e confundi-las é a origem do defeito. Mesmo eixo
  do par `precisaBaixar`/`temBytes`.
- **A flag de reentrada é PRÓPRIA (`procurandoNaTimeline`), nunca
  `carregandoTimeline`**: esta última é a da fila JSF e faria o envio ser recusado
  com "Lendo a lista oficial de documentos" — frase falsa aqui, porque rolar não
  fala com o JSF (é o gesto que o usuário faria com o dedo).
- **Quando a peça não está mesmo na timeline, a mensagem diz a VERDADE** (a lista
  oficial é superconjunto da timeline) e oferece o preview, que não depende
  daquele DOM. Mandar "tentar de novo" seria repetir o laço.
- **O MESMO defeito atingia `ativarPeca`, e foi corrigido na v0.59.0** — ali o
  efeito era pior que um aviso: falha de DOWNLOAD em peça que só a lista oficial
  conhece, tolerada como falha comum, e o modelo respondendo "não consta" sobre
  documento que existe nos autos. `garantirNaTimeline(id)` (pje.js) roda ANTES
  de `ativarPeca` dentro de `baixar`. Quatro decisões que não podem cair:
  - **Cadeia PRÓPRIA (`buscaTimelineChain`), não a `activationChain`**: rolar não
    fala com o JSF, então não pode ficar atrás dos ~5,6 s de uma ativação nem
    contar como ativação em voo. Mas precisa ser serializada, porque o download
    roda com concorrência 3 e duas rolagens disputariam o mesmo scroller.
  - **`devolverRolagem: true`**, opção nova de `carregarTimelineCompleta`. No
    "ver na timeline" a rolagem É o resultado pedido e restaurá-la produziria
    dois saltos; aqui ela é COLATERAL — o usuário pediu uma análise —, e o
    download roda também em caminhos de fundo (medição de contexto, prefetch).
    Mover a tela por baixo de quem está lendo os autos é o defeito da faixa que
    muda de altura sob o dedo.
  - **`timelineVarridaAteOFim`**: uma varredura que terminou por estabilidade
    responde por TODAS as peças. Sem essa memória, cada peça inalcançável de um
    lote custaria até 90 s. Só marca quando `completo` é true — marcar no
    estouro do teto daria uma timeline gigante como esgotada, e as peças do fim
    dela ficariam inalcançáveis pelo resto da sessão.
  - **A ORDEM das condições da mensagem final**, que a primeira versão errou:
    peça fora da timeline devolve **404** (o endpoint só libera o que foi aberto
    na sessão), então testar `ultimoStatus` antes fazia a mensagem nova nunca
    aparecer. A causa provável manda; "não está na linha do tempo" é mais
    acionável que um número de status. E ela deixou de mandar "abra-a na linha
    do tempo" uma peça que não está lá — era o laço sem saída, e orientação
    impossível é pior que nenhuma.
  - Coberto por `t-peca-fora-da-timeline.mjs` (jsdom com lazy load e servidor
    stateful de verdade: 404 até o clique na timeline). **Testado por mutação**:
    trocar a chamada por `acharLink(id)` derruba as duas asserções centrais — a
    peça não baixa e não é ativada.
- Coberto por dois testes: `carregarTimelineCompleta` com lazy load simulado em
  jsdom (parada antecipada, retrocompatibilidade, peça inexistente) e o handler
  real do content.js por monkeypatch no `mount`.

## Apoio por PIX (`apoio.js` + `icons/pix-qr.svg` + a caixa `.apoio`)

Irmão do botão de assinatura do Substack, não substituto: a assinatura é recorrente
e sustenta os próximos projetos; o PIX é o gesto de quem quer retribuir UMA vez pelo
que já usou. Vive nos MESMOS três lugares da `.apoio` (ajuda, novidades, opções) e
como **uma linha** no guia recolhido do painel — a regra de nunca pedir apoio no
fluxo de trabalho não afrouxa por ser um valor menor.

- **O POPUP é a exceção, e ela foi paga com um relato.** Ele ficou de fora na
  primeira versão ("600px de altura são para configurar a chave") e o resultado
  foi que **nem o autor do projeto achou o recurso**: o popup é a única tela que o
  usuário abre por vontade própria e que não é fluxo de trabalho, e ali o apoio
  era UM link de texto entre sete no rodapé. Medido: a caixa estava a 87% da
  página de opções, 96% do guia, 98% das novidades — e ausente justamente onde se
  procura. Hoje há a faixa `.apoiar` (versão de uma linha, QR em `<details>`
  recolhido), e ela **nasce `hidden`**: o `popup.js` só a revela quando há chave
  salva, espelhando o `#firstRun`, que aparece só enquanto NÃO há. Pedir apoio a
  quem ainda está configurando é pedir antes de ter entregado qualquer coisa.
- **O que continua intocado é o PAINEL** — lá se trabalha, e lá o apoio é uma
  linha dentro do guia recolhido. Teste cobre: nenhum QR e nenhum payload em
  `panel.js`.

- **O QR é um arquivo ESTÁTICO** (`icons/pix-qr.svg`, ~2,9 KB, `<path>` único), não
  um gerador em runtime. O payload é fixo (chave, sem valor), então gerar no cliente
  seria vendorizar uma biblioteca de QR para produzir sempre a mesma imagem — mesmo
  argumento que manteve o JSZip fora do projeto. Fica em `icons/` porque é imagem, e
  `icons/` já entra no pacote.
- **O payload é BR Code (EMV MPM) e o CRC16 é obrigatório.** Chave de **telefone vai
  em E.164** (`+5588993650420`): com 11 dígitos crus o app do banco a lê como CPF e
  procura outro titular. Campo 59 tem teto de 25 caracteres (o nome completo não
  cabe) e o 60, de 15. Sem campo 54 — quem apoia escolhe quanto.
- **O que se copia é o payload INTEIRO, não a chave**: é o "PIX Copia e Cola", que
  cola direto em qualquer banco. A chave crua continua VISÍVEL ao lado, e o QR ao
  lado dela: três caminhos independentes (ler de outro aparelho, colar, digitar), e
  nenhum exige o outro.
- **O payload aparece em QUATRO lugares** (três `data-pix` + o QR). Um typo ali não
  dá erro em lugar nenhum — gera um QR que o banco recusa, ou pior, uma chave de
  outra pessoa. O teste **recalcula o payload do zero**, confere as três cópias,
  revalida o CRC de cada uma, confirma que `icons/pix-qr.svg` é byte a byte o QR
  desse payload e o **decodifica com jsQR** (leitor independente — escritor
  conferido pelo próprio escritor não prova nada, como o `zipfile` sobre o `ZipW`).
- **`apoio.js` é arquivo, não `<script>` inline**: a CSP da extensão é
  `script-src 'self'` e o inline não executaria — em silêncio. Ele sai na primeira
  linha se não houver `[data-pix]` na página.
- **Falha de cópia é DITA.** Clipboard API → `execCommand` → e, se as duas falharem,
  o rótulo manda usar o QR (que está na tela) e o código vai para o `title`. Um botão
  mudo faz o usuário colar um clipboard vazio no aplicativo do banco. O rótulo troca
  no `<span class="lbl">`, nunca no botão — `textContent` apagaria o `<svg>`.
- **Marca de terceiro: o nome no texto, nunca o logo.** "Heineken" escrito é uso
  nominativo; reproduzir o wordmark ou a estrela numa extensão publicada na Web
  Store é uso não autorizado. O ícone é uma garrafa de desenho próprio.
- **`empacotar.ps1` copia `src/` INTEIRA e sem filtro** — descoberto nesta rodada ao
  criar um `.local.html` ali para o QR relativo resolver. `*.local.html` é ignorado
  pelo git, então o arquivo não aparece em `git status` e **iria calado para o ZIP da
  Store**. Laboratório fica no scratchpad ou na raiz, nunca em `src/`.

## Peça citada como faltante vira um clique (`pecasCitadasFaltantes` + `panel.sugerirPecas`)

Quando a resposta aponta uma peça que não está no contexto ("o comprovante está na peça
214661494, que não foi anexada"), aquele id vira um **botão de adicionar** abaixo da
bolha. O modelo já fez o trabalho de identificar a peça; o clique poupa procurá-la entre
duzentas. Fecha o ciclo que o `inventarioNaoMarcadas` abriu.

- **Só entram ids que são peça REAL desta timeline** (`docsIndex`): é a comparação contra
  ela que elimina o falso positivo — um valor, uma data ou um número de lei com 6+ dígitos
  quase nunca casa um id real. Já-no-contexto (marcadas ou em `pecasNaConversa`) ficam de
  fora, e há teto de 12.
- `panel.marcarPecas` é **ADITIVO** (contrato oposto ao do "Escolher com IA", que
  substitui) e **mescla** em `selPendente` em vez de substituir, ao contrário de
  `restaurarSelecao` — cobrir a row lazy sem apagar o que já esperava.
- A caixa é **irmã do `.body`**, como o `.editor-act`: sobrevive ao `updateAssistant`.
  Uma vez por bolha (`if (el.querySelector(".pecas-sug")) return`).

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

## Orientação obrigatória na minuta (Resolução CNJ 615/2025)

Minutar uma **sentença, decisão ou acórdão** exige que o usuário informe a **TESE e o
dispositivo** antes de gerar; **despacho** exige o **SENTIDO** da determinação; **ofício,
mandado, alvará e ata** não exigem nada. O botão "Gerar minuta" fica desabilitado até a
orientação existir.

**O fundamento é textual, não uma boa prática que inventamos.** O Anexo da Resolução
separa **AR4** — *"formulação de juízos conclusivos sobre a aplicação da norma jurídica
ou precedentes a um conjunto determinado de fatos concretos"* (**ALTO risco**) — de
**BR4** — *"produção de textos de apoio para facilitar a confecção de atos judiciais,
**desde que a supervisão e a versão final do documento sejam realizadas pelo magistrado
e com base em suas instruções, especialmente as decisões acerca das preliminares e
questões de mérito**"* (baixo risco). O próprio BR4 **condiciona** o baixo risco a que a
decisão de mérito venha do humano.

E o **art. 19, §3º, V** fecha a questão para esta extensão em particular: *"é vedado o
uso de LLMs e sistemas de IA generativa de natureza privada ou externos ao Judiciário
para as finalidades previstas nesta Resolução como de risco excessivo ou de alto
risco"*. A extensão usa a chave de uma API comercial — é solução privada e externa
(hipótese do art. 19, §2º). Logo, minutar uma sentença sem tese não é "arriscado": é
**vedado**. Some-se o **art. 19, §3º, II** (vedado o uso autônomo *"sem a devida
**orientação**, interpretação, verificação e revisão"* — orientação vem ANTES de revisão
no texto normativo) e o **art. 32** (a IA não pode *"restringir ou substituir a
autoridade final"*).

Regras que não podem cair:

- **A `INSTRUCAO_MINUTA_PADRAO` não pode voltar a pedir "o ato cabível".** A redação
  antiga (*"Elabore a minuta do ato cabível… com relatório, fundamentação e
  dispositivo"*) encomendava ao modelo o ato **e** o resultado — AR4 em estado puro, no
  caminho mais usado do produto. Ela está **duplicada** em `content.js` e `panel.js`, e
  um teste confere que as duas batem byte a byte.
- **`ESPECIES_ATO` (panel.js) é a fonte única dos três regimes** (`tese`/`sentido`/
  `livre`). Os dois `<optgroup>` separam "a sua decisão entra no ato" de "não entra"; o
  **regime é da espécie**, não do grupo, e é o rótulo + placeholder do campo que
  distinguem tese de sentido.
- **`atoDaMinuta()` é o ponto ÚNICO** lido pelo `doSend`, pelo gate do botão e pela nota.
  Devolve `null` quando falta o obrigatório.
- **Mínimo de 12 caracteres, e a extensão NÃO julga a qualidade da tese.** Ela exige que
  a tese EXISTA. Julgar se é boa seria, ela própria, formular o juízo conclusivo que a
  regra existe para impedir.
- **O gate do botão Enviar tem DUAS fontes** (`lockInput` e a falta de orientação) e
  `aplicarEstadoSend()` as concilia. Escrever `sendBtn.disabled` direto em qualquer uma
  delas faz o fim de um turno reabilitar o botão sem tese, ou sair do modo minuta
  reabilitá-lo no meio de um turno.
- **`regraDaOrientacao(ato)` fica FORA do `SUFIXO_MINUTA`.** Aquele é a regra de FORMA,
  vale para toda minuta e é a maior superfície de regressão do fluxo; esta é condicional
  e é concatenada depois dele. Regime `livre` devolve `""` — o request de um ofício sai
  **byte a byte** como antes.
- **`blocoOrientacao` vai no FIM do texto**, não no prefixo cacheado: a orientação muda a
  cada request, ao contrário dos modelos, que são estáveis. Em XML pelo mesmo motivo da
  `molduraModelos` — é texto livre do usuário, e a tag é a única fronteira que o modelo
  não confunde com a resposta (o fechamento é removido do texto do usuário).
- **Peça que CONTRARIA a tese vira `[COMPLETAR: divergência — …]`.** É o ponto mais
  delicado do desenho: "corrigir" quem assina devolveria o modelo ao AR4; calar produziria
  um ato fundamentado contra os próprios autos. Reusa o canal que o `SUFIXO_MINUTA` já
  estabelece — **não criar um segundo marcador**, que brigaria com a proibição de blocos
  de aviso no corpo do ato.
- **A saída "Analisar o que é cabível" não é enfeite.** Bloquear sem alternativa empurra
  o usuário a escrever qualquer coisa no campo só para destravar o botão — o oposto do
  que a exigência existe para conseguir. Ela manda a pergunta pelo CHAT comum (`sendCb`),
  onde a resposta volta com citações, ressalvas e inventário: um **estudo**, que não se
  confunde com um ato pronto para assinar. Mora só no painel, não toca no content.js.
- **A ORIGEM vai ao disco com a minuta** (`guardarMinuta(md, titulo, ctx)` → campo
  `origem`) e aparece na faixa `.origem` do editor: é o registro dos arts. 19, §6º e 21,
  §2º. Minutas anteriores a esta versão **não têm o campo** — ler como `d.origem || null`
  e degradar. A faixa fica FORA da folha, não entra no "Copiar formatado"/`.docx` e é
  `display:none` na impressão: o que vai ao PJe é o ato.
- **O `onMinuta`/`onMapa` NÃO podem voltar a ser `async` no topo** — ver a regra da
  recusa síncrona em "Invariantes importantes".
- A explicação vive no **`help.html#resolucao615`** (a referência que envelhece mora lá,
  o painel aponta). Ela também documenta os deveres que a extensão **não** cumpre por
  ninguém: revisar e assinar, o art. 19, §3º, IV (segredo de justiça em IA externa), o
  art. 19, §7º (informar o tribunal) e o §3º, I (capacitação).

## A barra do modo minuta (v0.61.0) — duas perguntas, e nenhuma caixa âmbar

> Relato do dono do projeto: *"isso não tá bom, tá confuso"*; depois, *"Não me
> faça pensar, do Krug. Tem que ser o mais fluido possível e o mais fácil de ser
> usado. **Hoje é o principal problema da extensão**."*

Ela tinha **oito blocos empilhados e três caixas âmbar**. Duas das três avisavam
sobre o estado PADRÃO; a terceira acusava o usuário antes de ele fazer nada.

- **O SEGUNDO `<select>` PERGUNTAVA O QUE A LINHA DE CIMA JÁ RESPONDIA, e por
  isso deixou de existir.** `MLIB.CATEGORIAS` e `ESPECIES_ATO` têm os MESMOS
  valores (`sentenca`, `despacho`, `ata`, `oficio`, `mandado`, `decisao`,
  `outro`), e o mecanismo é "todos os modelos daquela categoria vão ao
  contexto". Dada a espécie, o conjunto está determinado: sobra um BINÁRIO.
  Virou `<input type="checkbox" class="mm-chk" checked>` com a contagem no
  rótulo (`.mm-txt`).
- **`categoriaDaEspecie(esp)` é a fonte ÚNICA da tradução**, e `cat` só existe
  em `ESPECIES_ATO` onde a categoria difere do valor: `acordao` → `decisao`
  (o MLIB agrupa "Decisões, votos e acórdãos"). Um segundo mapa divergiria — e
  errar ali **não dá erro**: a minuta sai sem os modelos, calada.
- **A nota de divergência ("o ato é Sentença e os modelos são de Despachos")
  não foi removida — o ESTADO dela ficou inalcançável.** `atualizarNotaModelos`
  ficou com UM ramo, o do teto de contexto, que é a única coisa ali que o
  usuário não tem como saber sozinho.
- **REVISÃO DE DECISÃO, pedida pelo usuário.** A regra da v0.48 era *"a linha de
  modelos NUNCA some por biblioteca vazia"*, para quem nunca cadastrou não
  concluir que a feature não existe. **A affordance CONTINUA** — é o
  `+ Cadastrar peças-modelo de Sentenças` no rodapé, que até NOMEIA a espécie.
  O que sai é o campo vazio: um seletor sem opção nenhuma é pior que um convite.
  Como a maioria nunca cadastrou modelo, este é o estado COMUM.
- **A `.perfil-nota` deixou de ser aviso e virou FATO.** Quem redige o ato é
  informação de primeira ordem para quem assina (*"é importante escolher um
  modelo bom para a geração de expedientes"*), e só aparecia quando havia TROCA,
  em âmbar. Hoje é linha neutra presente em todo o modo minuta, e a
  justificativa da troca foi para o `title` — ela se lê UMA vez e ocupava duas
  linhas do rodapé em toda minuta.
- **A `.mt-nota` virou texto de APOIO na mesma linha do "Analisar o que é
  cabível".** No estado inicial nada está errado; o que diz "falta um passo" é o
  asterisco do rótulo e o Enviar apagado. Caixa de aviso na primeira olhada
  acusa antes do gesto.
- **A `.minutabar` virou COLUNA.** Era `flex-wrap` com cada bloco pedindo
  `flex-basis: 100%` para forçar a própria linha — uma coluna escrita com as
  ferramentas de uma linha. A `.minuta-linha` é flex de largura de CONTEÚDO
  (um seletor de oito opções não tem por que ocupar 700px), e por isso o
  `.estreito` não precisa de regra própria: os dois itens quebram sozinhos.
- **MEDIDO em oito estados**: a barra caiu de ~260px para 168px com a tese
  preenchida, e as caixas âmbar de três para ZERO em todos.
- **`tests/t-minutabar.mjs` (26 asserções) é NOVO, e a lacuna que ele fecha foi
  descoberta aqui: a barra não tinha teste NENHUM.** O `grep` por
  `.minuta-modelo-sel` só achava a cópia regenerada em `tests/espelho/`, que o
  `t-worker` produz a cada execução e ninguém assere. **Grep que só acha
  resultado em `tests/espelho/` é grep que não achou nada.** Provado por
  MUTAÇÃO nas duas metades (tirar o `cat` do acórdão derruba 2 asserções; fazer
  a caixa nunca sumir derruba outras 2).
- **O CONVITE NOMEIA A ESPÉCIE, ENTÃO TEM DE ABRIR NELA.** `+ Cadastrar
  peças-modelo de Ofícios` abria o formulário da biblioteca em **Sentenças** —
  `abrirMlibForm(null)` fixava `mlibFC.value = "sentenca"` desde sempre, e isso
  era inofensivo enquanto o botão se chamava só "Cadastrar". **O rótulo virou
  promessa no instante em que passou a nomear a espécie**, e a mesma linha de
  código passou a mentir sem ter mudado. Hoje `abrirMlib({form, cat})` repassa
  `catDosModelos()`, e o valor é conferido **depois** de atribuído: `select.value`
  com um id fora da lista deixa o campo VAZIO em silêncio (a armadilha do
  `#model` do popup). É a mesma lição do OCR: **ao acrescentar uma capacidade,
  varrer os rótulos que a MENCIONAM — eles viram promessa no instante em que ela
  passa a existir.**
- **O `README.md` e o `help.html` descreviam o `<select>` que deixou de
  existir** (“escolha a espécie em **Seguir modelos**”), e o estado vazio da
  própria biblioteca também (“escolha a categoria em Seguir modelos”). Mudança de
  UI é mudança de DOCUMENTAÇÃO: `grep` pelo rótulo do controle removido, em
  `src/`, no README e no guia. O que fica é o **changelog** — ali a frase é
  datada e descreve o que era verdade naquela versão.
- **O regime `sentido` (despacho) tem TEXTO PRÓPRIO e nenhum dos oito retratos
  o exercitava.** É o terceiro regime, e o único cujo campo pede a
  DETERMINAÇÃO (“A determinação é sua”) em vez da tese. Hoje são **onze**
  estados medidos, e o `t-minutabar` o cobre. Regra: **regime novo, cena nova** —
  estado com texto próprio que ninguém fotografou é estado que ninguém viu.
- **Cadastrar e voltar acende a caixa SEM religar o modo** (`MLIB.aoMudar` →
  `atualizarSeletorMinuta(true)`), e isso não tinha teste porque o stub do
  harness trazia `onChanged: { addListener() {} }` — **vazio**. Um stub que
  aceita o listener e nunca o chama torna o caminho INDEMONSTRÁVEL, do mesmo
  jeito que o `PJE.lerAnexo` que devolvia `null` na v0.59. Provado por mutação.
- **NÃO fundir o textarea da tese com o campo de instrução do compositor** —
  são dois campos de texto no mesmo gesto e é o "faz pensar" que sobra, mas a
  `INSTRUCAO_MINUTA_PADRAO` está duplicada em dois arquivos com teste de
  igualdade byte a byte, e `blocoInstrucao` decide a moldura por ela ser o
  default. É trabalho de uma rodada própria.

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

### A página "Minhas minutas" (modo-lista)

**Ela não é uma lista de arquivos: é uma lista de coisas que estão MORRENDO.** A poda
apaga tudo em 7 dias e guarda no máximo 10 (`MAX_MINUTAS`/`VALIDADE_MINUTA_MS`, em
content.js), e a versão anterior escondia as duas coisas — a minuta sumia sem aviso.
Layout de duas colunas acima de 900px (filtros sticky + lista agrupada por tempo).

- **`linhaCompacta` (dropdown de 280px) e `linhaCartao` (página) são SEPARADAS.**
  Enquanto as duas eram a mesma função, a página de tela cheia herdava o desenho pensado
  para um menu estreito — **era essa partilha que a mantinha pobre**. Ao mexer numa,
  conferir a outra: o teste cobre a regressão do dropdown.
- **`tempoRestante(ts)` olha para FRENTE**, ao contrário de `tempoRelativo`. Sem ela, uma
  minuta a 4 horas de ser apagada mostrava apenas "há 6 dias". **O verbo é obrigatório em
  todos os degraus** ("expira em 6 dias"): um "6 dias" seco fica logo acima de "há 6
  dias" na linha de meta, e sem o verbo os dois se leem como a mesma coisa.
- **A barra de vida só aparece abaixo de 48 h.** Ela é elemento de ALERTA, e uma barra
  quase cheia em todo card é o que o DESIGN.md §2 chama de "tudo alerta com a mesma
  intensidade, nada alerta" — além de se ler como um separador do cartão. Efeito
  colateral bom: o card urgente fica fisicamente maior que os calmos.
- **NÃO há paginação, e isso é decisão.** O teto é 10; paginar daria sensação de
  completude sem a informação. Quem responde "estou vendo tudo?" é o rodapé
  ("N de 10 guardadas") mais o contador em cada opção de filtro. Acima do teto (estado
  transitório entre podas) o texto troca — "12 de 10" seria aritmética estranha.
- **`MAX_MINUTAS_UI`/`VALIDADE_MINUTA_MS_UI` são cópias declaradas** das constantes
  privadas do content.js, com nota no código: divergir faria a tela mentir sobre quando a
  minuta some, que é a informação que ela existe para dar.
- **O filtro de ESPÉCIE vem de `origem.especie`**, gravado pela orientação obrigatória.
  Minutas anteriores caem no grupo "Sem espécie registrada" — sem esse grupo elas sumiriam
  da lista filtrada.
- **A busca cobre o CORPO** (`textoBuscaMinuta`), não só título e processo. O campo fica
  na coluna da ESQUERDA, fora do que é re-renderizado, e por isso não perde o foco durante
  a digitação (era esse o motivo do antigo filtro por `row.hidden`).
- **Hífen NÃO é marcação no meio do texto** (`tituloUtil`/`previaMinuta`): removê-lo do
  texto inteiro transformava "Intime-se" em "Intimese" — justamente o vocabulário de um
  despacho, que é o caso em que o título fraco mais aparece. Só no início da linha.
- **`^#{1,6}[ \t]*.*$` e NUNCA `\s+`** ao remover títulos: `\s` casa `\n` (o `.` não),
  então num markdown que comece com título VAZIO o `\s+` atravessava as quebras e o `.*$`
  engolia o primeiro parágrafo — a prévia saía vazia nas minutas de título fraco.
- **`min-width: 0` no `.mp-filtros` e no `.mp-grupo` é OBRIGATÓRIO.** Item de grid/flex
  tem `min-width: auto` e se recusa a encolher abaixo do conteúdo: sem isso a faixa
  horizontal de chips esticava a coluna até ~1060px numa viewport de 742px, arrastava o
  grid e os cards apareciam cortados — e o `overflow-x: auto` não continha nada, porque
  não havia largura a conter.
- **O override de tela estreita vai no FIM do bloco CSS.** Media query não aumenta
  especificidade: enquanto ele estava junto do `@media (min-width: 900px)` no topo, o
  `.mp-grupo { flex-direction: column }` declarado adiante vencia por ordem. O sintoma
  engana — as propriedades NOVAS aplicam e as sobrescritas não, o que parece uma media
  query funcionando pela metade.
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

### A coluna lateral do editor (v0.61.0)

> *"Coloca as opções aí na lateral direita. Esse editor tá muito feio."* — com a
> captura de um despacho real aberto.

As sete ações saíram do cabeçalho e viraram dois blocos com nome na coluna
direita: **Levar ao PJe** (`#copiar` em destaque, `#docx`, `#imprimir`,
`#reid`) e **Este rascunho** (`#salvo`, `#rascunhos`, `#descartar`). A
`.origem` e a `.rodape-nota`, que eram faixas soltas (uma acima da folha, outra
no fim da página), viraram cartões dessa coluna.

- **UM ARQUIVO, DUAS TELAS — e mover um nó muda o que a regra da OUTRA
  alcança.** `editor.html` é o editor com `?id` e a lista "Minhas minutas" sem
  ele. A regra que escondia as ações na lista era `.modo-lista .acoes .grupo`,
  porque os botões viviam dentro de `<span class="grupo">`; ao levá-los para a
  lateral os `.grupo` deixaram de existir, a regra parou de casar, e **"Minhas
  minutas" passou a oferecer "Copiar formatado" e "Descartar" sem documento
  aberto**. Foi o dono do projeto quem viu, minutos depois de recarregar. Hoje a
  regra mira a REGIÃO (`.modo-lista .lateral`): **região sobrevive a rearranjo,
  encaixe de filhos não.**
- **`.acoes` traz `margin-left: auto` e `align-items: center` de quando era uma
  fileira no canto direito do cabeçalho.** Numa COLUNA os dois centram a pilha e
  destroem o eixo de leitura. É a lição do `.hd button`, de novo: **não basta
  declarar o que se quer, é preciso DESFAZER o que a regra genérica impôs.**
- **Os botões vestiam `--on-hd` e `--veu-*` — a tinta e os véus da CHROME.**
  Certos no cabeçalho, errados sobre um cartão `--surface`. É o mesmo defeito
  que a v0.60.1 achou no `.chip-mini` e no `pre` da bolha: **ao mover um
  componente para outra superfície, trocar a família de tokens junto.**
- `--w-lateral` é 260px porque é o que faz "Imprimir ou salvar em PDF" caber
  numa linha: rótulo que quebra numa pilha destrói o eixo que a pilha cria.
  Abaixo de 1180px a lateral vira faixa ACIMA da folha (uma A4 tem ~794px).

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
  inteiros + vários modelos, o que só cabe nas janelas de 1M — no Haiku (200k) o
  **seletor da minuta some** e o botão **📚 Modelos** fica **DESABILITADO com
  tooltip** explicando por quê (não some: sumir deixaria o usuário sem saber que a
  feature existe). A minuta comum segue funcionando. Ao vivo na troca de modelo;
  fecha o modal se ele estiver aberto quando desabilita.
  **O seletor de ESPÉCIE do ato e o campo de tese NÃO passam por este gate** — são
  obrigação normativa (ver "Orientação obrigatória") e não podem sumir junto com uma
  feature opcional. Coberto por teste.
- **Seleção por CATEGORIA, não por modelo** (decisão de produto): o seletor da
  `.minutabar` escolhe uma espécie e `modelosMinutaSelecionados()` reúne TODOS os modelos
  daquela categoria (ordenados por recência) até dois tetos — `MODELOS_MAX_ENVIO` (12) e
  `MODELOS_TETO_CHARS` (180000, ~45k tokens; o 1º sempre entra). Corte avisado no console
  (sem cap silencioso). A categoria é pré-selecionada por `detectarCategoria` (espelha o
  agrupamento de `MINUTA_ESPECIE`); o usuário pode trocar. Passa via `minutaCb(t, sel,
  modelos)` — a assinatura ganhou o 3º arg, e sem modelos o comportamento é byte a byte
  o de antes.
- **A linha de modelos da `.minutabar` NUNCA some por biblioteca vazia**
  (`atualizarSeletorMinuta`): sem nada cadastrado ela mostra "nenhuma peça-modelo
  cadastrada" + o botão **Cadastrar modelo** (abre o `.mlib` já no formulário).
  Esconder era o defeito relatado: quem nunca cadastrou ligava o modo minuta,
  não via vestígio da feature e concluía — com razão — que ela não existia. É a
  mesma regra da `.sel-nota` nos degraus de seleção: **conjunto vazio se
  explica, não desaparece**. Só o gate de janela (< 1M) e a ausência do `MLIB`
  escondem a linha inteira; ali o botão da barra de ferramentas, DESABILITADO
  com tooltip, já é a explicação. `modelosMinutaSelecionados` ganhou a guarda
  `minutaModeloSel.hidden` — com o wrap visível, "não há o que enviar" deixou de
  depender de o `<select>` estar sem opções.
- **O caminho do CHAT comum também precisa apontar para os modelos**
  (`adicionarAcaoEditor`): pedir a peça no chat e clicar em "Abrir no editor" é
  um turno de chat, que nunca passa pela `.minutabar` — a biblioteca ficava
  invisível justamente para quem acabou de pedir uma peça redigida. Quando a
  heurística `pareceMinuta` acende o destaque E há modelos cadastrados, entra ao
  lado uma ação secundária "Refazer seguindo seus modelos", que só clica no
  `.btn-minuta` (reusa validação de peças marcadas e exclusividade com o mapa).
  Ela devolve o **pedido original** ao campo antes disso (`info.pedido`, posto
  pelo content.js com o `text` do turno): sem isso o `.btn-minuta` veria o campo
  vazio e injetaria a `INSTRUCAO_MINUTA_PADRAO` — genérica —, trocando "sentença
  de improcedência pela prescrição" por "redija a peça adequada", num clique
  cujo nome promete REFAZER o mesmo pedido. Campo já preenchido nunca é
  sobrescrito. Ela precisa de CSS próprio porque
  `.editor-act.destaque button` pinta TODO botão do bloco com o gradiente da
  ação principal — dois destaques disputariam o mesmo clique.
- **O modal `.mlib` abre SEMPRE na LISTA — nunca direto no formulário.** O
  botão da barra fazia `abrirMlib(modelosLib.length ? {} : {form:true})` para
  poupar um clique de quem ainda não tinha modelo, e `mlibTela("form")` esconde
  `Novo`/`Importar` de propósito (clicá-los com um lote em conferência
  descartaria o trabalho). Cada decisão está certa sozinha; na INTERSEÇÃO delas,
  quem tinha zero modelos nunca via o botão **Importar** — exatamente o público
  da importação em lote de `.docx`/`.rtf`, e o defeito relatado pelo usuário. O
  estado vazio da lista já era a tela de boas-vindas certa (nomeia os dois
  caminhos) e ninguém o via; agora ele também OFERECE os dois como botões, que é
  a regra da `.sel-nota` e da `.minutabar`: **conjunto vazio se explica e dá a
  saída, não desaparece**. O atalho `{form:true}` continua válido onde a
  promessa é cadastrar — o botão "Cadastrar modelo" da `.minutabar`.
  `podeImportar` (`temDocx && !!impDrop`) é a fonte ÚNICA da condição, lida
  pelos três pontos (botão do cabeçalho, atalho do estado vazio, registro do
  handler); repetida em cada um, um deles ofereceria um caminho que outro não
  atende — e o modo de falha é um botão que não faz nada.
- **Testar a UI da biblioteca em jsdom exige `<script>` de verdade, nunca
  `w.eval()`**: `modelos.js` e `prompts.js` declaram `const MLIB`/`const PLIB`
  no topo, e uma declaração léxica dentro de um `eval` morre com ele — entre
  scripts clássicos do mesmo realm ela é compartilhada, que é como o Chrome
  executa content scripts. Com `eval`, `typeof MLIB` dá `"undefined"` dentro do
  panel.js e a feature inteira some: um falso positivo de bug convincente.
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

## Importar peças-modelo de `.docx`/`.rtf` (docx-importar.js + modelos.js + as duas cascas)

Cadastrar dez modelos não pode custar dez formulários. O usuário solta 5–10 arquivos
de uma vez, cada um vira uma **ficha** já preenchida e um clique cadastra todas.
Existe nos DOIS lugares — modal `.mlib` do painel e página `src/modelos.html` —, com
a lógica compartilhada e só a casca escrita duas vezes.

- **`.rtf` entra pelo mesmo `lerArquivo`**, com extrator próprio no `docx-importar.js`
  — nada de ZIP/`DecompressionStream` (RTF não é compactado). É o formato do editor
  ANTIGO do PJe, então é nele que estão as peças-modelo de quem trabalha com processos
  migrados. O extrator é uma **CÓPIA** do `rtfParaTexto` do `pje.js`, e a duplicação é
  deliberada: a importação roda também na página `src/modelos.html`, contexto de
  extensão que NÃO enxerga o global `PJE` (content script) — a mesma razão de o
  `mapa.js` duplicar `escapeHtml`/`inlineMd`. `file.text()` decodifica em UTF-8, o que
  basta porque o RTF bem-formado escapa os bytes altos como `\'XX` (resolvidos pela
  CP1252, onde vivem os acentos e o travessão). Ao mexer num, conferir o outro.

- **`src/docx-importar.js` já existia** (leitor de um arquivo, usado só na página) e
  **não estava no `manifest.json`** — por isso o modal do painel não tinha importação
  nenhuma. Ele entra nos content_scripts **entre `modelos.js` e `panel.js`**. O IIFE
  não toca em nada de ambiente na definição (`DecompressionStream` é checado dentro do
  `lerArquivo`, `DOMParser` só dentro do `textoDoXml`), então acrescentá-lo não pode
  quebrar o boot. `panel.js` o trata como **opcional** (`typeof DocxImport !==
  "undefined"`, igual ao `MLIB`): sem ele o botão Importar some e o resto funciona —
  é o que mantém o harness de boot verde sem stub novo.
- **Nenhum global novo.** `lerLote` mora no `DocxImport` (dono do formato);
  `adivinharCategoria`, `chaveTitulo`, `fichaImportada`, `medirFicha`,
  `marcarDuplicados` e `salvarLote` moram no `MLIB` (dono do esquema e do storage).
  Um `modelos-importar.js` dependeria dos DOIS — seria o primeiro content script com
  duas dependências entre globais. Efeito colateral: `categoriaValida`, que era código
  morto, virou a guarda do que a adivinhação devolve.
- **`adivinharCategoria` tem TRÊS sinais, e a precedência é nome → cabeçalho →
  dispositivo.** (1) O **nome do arquivo** vence quando existe (foi decisão do
  usuário) e, dentro dele, vence o casamento **mais à esquerda** — nome é "Espécie —
  assunto", a posição carrega informação; sem isso "Despacho designando audiência de
  instrução.docx" cairia em `ata`. (2) O **cabeçalho** (12 primeiras linhas úteis) é
  **ancorado em `^`**: `textoDoXml` entrega um parágrafo por linha, e sem a âncora
  "…conforme a sentença de fls. 30" passaria por cabeçalho. (3) O **dispositivo** (18
  últimas) é o sinal mais discriminante, e ali a ORDEM da tabela é tudo — `sentenca`
  vem ANTES de `mandado` ("Publique-se… Expeça-se mandado" é sentença) e `despacho`
  vem POR ÚLTIMO (`cite-se`/`cumpra-se` estão em quase todo dispositivo). Valem as
  armadilhas de sempre: `norm()` antes de tudo, `(?<!(cumprimento|execucao|
  liquidacao|carta) de )sentenca` (sem `carta`, "Carta de sentença" viraria sentença),
  `mandado\b(?! de seguranca)`, `ata(?!\s*notarial)`, `acordao` ≠ `acordo`, e — na
  construção `\b(…)\b` — toda alternativa começando E terminando em caractere de
  palavra (`p\.r\.i`, nunca `p\.r\.i\.`, cujo ponto quebraria o `\b` de fechamento).
  Devolve `{categoria, confianca, sinal}`: o `sinal` vira o `title` do selo, porque o
  usuário precisa poder discordar sabendo de onde veio o palpite.
- **O selo "sugerida" some no PRIMEIRO `change` do seletor** (`catTocada`): ele afirma
  "isto é um palpite", e depois do toque deixaria de ser verdade. Com
  `confianca:"nenhuma"` o rótulo troca para "confira" em tom de aviso suave.
- **O teto de 60.000 é do ITEM SERIALIZADO, não do texto**: o envelope (UUID, chaves
  do JSON, dois timestamps) custa ~201 bytes, então `medirFicha` roda também a cada
  edição do TÍTULO — uma ficha cruza o teto por causa dele. Ficha acima do teto entra
  **desmarcada**, com aviso suave, e **não bloqueia o lote**; a saída para encurtar
  aparece no RESULTADO, depois de gravar os outros (`mlibAposForm`/`aposForm` levam o
  rascunho ao formulário normal com `{novo:true}` e devolvem ao resultado). Pular para
  o formulário no meio da conferência exigiria carregar N fichas por uma troca de
  tela, e perder o lote seria o pior desfecho.
- **ARMADILHA CRÍTICA — soltar arquivo FORA da zona.** Por padrão o Chrome NAVEGA para
  o `file://`, o que na página de autos mata a sessão JSF e o trabalho junto. A guarda
  precisa dos **DOIS** eventos com `preventDefault` (é o `dragover` que declara a área
  como alvo válido e cancela a navegação; só o `drop` não basta — modo de falha
  silencioso), em **`window` com `capture:true`** (eventos de arrasto são *composed*:
  atravessam o Shadow DOM e chegam ao window retargetados, então um par de listeners
  cobre o shadow tree E a página do tribunal), com funções **nomeadas** (arrow inline
  não sai no `removeEventListener`), ligada/desligada com a tela e **idempotente**. A
  guarda NUNCA chama `stopPropagation` — quem consome o evento é a zona. `dragleave`
  é por **CONTADOR** (`dragenter`++/`dragleave`--), nunca por `relatedTarget`, que vem
  retargetado para o host. Custo aceito e comentado no código: com o importador aberto
  um arquivo solto sobre a página do PJe é engolido. `impDesligar()` é chamado por
  TODOS os caminhos de saída, inclusive o gate de 1M (`setModelosHabilitado(false)` →
  `fecharMlib()`).
- **Três telas no card, um ponto único** (`mlibTela` no painel, `mostrarTela` na
  página): lista, formulário e importação são exclusivos, e "Novo"/"Importar" somem
  fora da lista (clicá-los com um lote em conferência descartaria o trabalho).
  `fecharMlibForm` PRECISA voltar para `"lista"` — ela é chamada por `fecharMlib` e
  por `abrirMlib`, e sem isso fechar com a importação aberta deixaria duas telas
  visíveis na abertura seguinte.
- **A ficha é construída com `createElement` + `.value`/`.textContent`, nunca
  `innerHTML`**: título e texto vêm de arquivo externo e o `escapeHtml` do painel não
  escapa aspa simples. Os handlers são delegados no container, com `data-i` INTEIRO
  como chave (não o nome do arquivo — evita `CSS.escape` e nomes hostis em seletor). E
  editar o título **não re-renderiza a ficha** (`pintarFicha` atualiza só o que muda):
  re-render a cada tecla arrancaria o foco do campo.
- **Nada silencioso**: erro de leitura de um arquivo não derruba o lote (vira ficha de
  erro com a mensagem do `DocxImport` verbatim, e as falhas aparecem ANTES das fichas
  — é o que explica o botão dizer "Cadastrar 7" quando foram soltos 8); cancelar a
  leitura NÃO descarta o que já foi lido; `salvarLote` serializa e AGREGA os erros em
  vez de parar no primeiro; e o resultado nomeia, um a um, tudo o que ficou de fora.
- **Descarte do lote em dois cliques** (backdrop, ✕ e Esc armam o botão Cancelar),
  nunca `confirm()` nativo. O Esc do `.mlib-card` mantém o `stopPropagation`.
- Fixtures de teste: `.docx` fabricados com o **`ZipW` do próprio repo** (escritor e
  leitor conferem campo a campo — método 8/0, CRC no cabeçalho local, EOCD).
  Armadilha do fixture: o estilo tem de ser `w:val` com o prefixo ligado ao namespace,
  senão `getAttributeNS(W,"val")` devolve `null` e a regra de heading nunca dispara.

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
  (`\uE010`…`\uE011`, sempre escapados no código) para um `art. 5º` escrito como
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

## Perfil do modelo (`perfil` no MODEL_CAPS) e o aviso de novidades

Duas coisas que a extensão não dizia: **para que serve cada modelo** e **que ela
foi atualizada**.

### `perfil` — para QUE serve o modelo

O eixo **não é "modelo bom/ruim"**, e é isso que o torna estável: os dois
trabalhos pagam metades diferentes da tabela de preços. **Analisar** os autos é
dominado pelo INPUT (centenas de páginas entram, poucos milhares de tokens
saem); **redigir** um expediente tem o mesmo input, mas o que se compra é o
OUTPUT. Por isso o mais barato para varrer costuma ser o mais fraco para
escrever — o `gpt-5.6-luna` (0,20/1,20) é o caso exemplar, e foi a queixa real
que abriu a rodada.

- **É uma CAP, nunca um `if (model === "…")`.** A regra do projeto —
  `content.js` e `panel.js` condicionam por caps e jamais por nome de modelo —
  vale aqui apesar de o conteúdo ser editorial: `perfil: "analise" | "redacao" |
  "ambos"` entra em `MODEL_CAPS` e um modelo novo passa a precisar de uma linha
  na tabela, não de um ramo novo na UI.
- **`sugestaoRedacao(model)` (background.js) prefere o MESMO provedor**, e isso
  não é detalhe: mandar quem usa a OpenAI trocar para o Gemini é pedir outra
  conta e outra chave só para seguir um conselho — atrito alto o bastante para o
  conselho não ser seguido. Entre os candidatos do provedor, o mais barato por
  `preco.out` (o custo de redigir é dominado pela saída). Sem irmão que sirva,
  cai no melhor de qualquer um. Hoje os três de perfil `analise` acham irmão:
  Luna→Terra, Haiku→Sonnet 5, Flash-Lite→3.7 Flash.
- **Viaja na resposta de `caps`** (`sugestao`), que já roda no boot e a cada
  `storage.onChanged` de chave/modelo — a orientação se atualiza sozinha na troca
  de modelo, sem caminho novo.
- **A nota da minuta INFORMA, NUNCA BLOQUEIA** (`.perfil-nota`, tokens
  `--warn-*`, irmã da `.mt-nota` e da `.sel-nota`; jamais a `.alertbar`, que é
  para o que impede de continuar). Barrar seria a extensão julgando o trabalho de
  quem assina — o oposto do que a Res. CNJ 615 estabelece sobre a autoridade
  final. A minuta funciona igual; o que se diz é que outro modelo provavelmente
  escreve melhor.
- **`NOMES_MODELO` subiu para o TOPO do IIFE do `panel.js`** por causa disso: os
  consumidores agora são DOIS e distantes (o selo do modelo, ~linha 6800, e a
  nota de perfil, ~1930), e uma `const` declarada entre eles lançaria "Cannot
  access before initialization" no primeiro — a zona morta temporal de sempre.
- **`PERFIS` em `popup.js` é duplicata deliberada** do campo, pela MESMA razão do
  `MODELO_PADRAO`: aquele é ES module do worker e este é script clássico. A
  sugestão do popup sai da ORDEM DOS `<option>` do mesmo `<optgroup>` (o primeiro
  que serve), e não de uma tabela de preços copiada — hoje os três casos batem
  com o worker, e é isso que o teste cobre.
- **É o campo mais PERECÍVEL da tabela, mais que o preço.** Vale como
  recomendação ("costuma render melhor"), nunca como veredito, e mora num lugar
  só para uma revisão custar uma palavra por linha. **Só `gpt-5.6-luna` e
  `gemini-3.7-flash` foram MEDIDOS em uso real** (19/08/2026); os outros oito são
  inferência do tier, e isso está dito no comentário de cada linha.

### O `perfil` deixou de ser conselho e virou AÇÃO (v0.48.0)

Até a v0.47 o `perfil` só alimentava uma **nota** na barra de minuta mandando
"trocar nas opções", e a minuta saía no modelo do chat de todo jeito. Agora ela
roda mesmo num irmão de redação do MESMO provedor: Luna→**Terra**,
Haiku→**Sonnet 5**, Flash-Lite→**Gemini 3.7 Flash**.

- **A tabela é a que já existia**: `sugestaoRedacao` devolve exatamente esses
  três (filtra `perfil !== "analise"`, prefere o mesmo provedor, desempata pelo
  menor `preco.out`). Um modelo novo entra por uma linha em `MODEL_CAPS`, não
  por um ramo novo na UI — a regra "condicionar por caps, nunca por nome de
  modelo" continua valendo inclusive aqui.
- **`modeloDoTurno(cfg, pedido)` é o override de MODELO por turno**, irmão do
  de `effort`, e vive ao lado dele em `executarTurno`. Aceito **só dentro do
  mesmo provedor**, e a guarda não é zelo: as peças já subiram à Files API do
  provedor do modelo CONFIGURADO, e é com ele que `precisaUpload`,
  `fileIdValido` e `montarBlocos` decidem. Um modelo de outro provedor faria o
  request sair com `file_id` da API errada e morrer num 400 críptico.
- **O custo se corrige sozinho.** `capsDe(model)` e `custoUsdDe` já derivam do
  `model` resolvido dentro do `executarTurno`: o rodapé, o tooltip e o degrau
  de preço acima de 272k saem certos sem nenhuma linha a mais. O salto é real —
  Luna 0,20/1,20 → Terra 2/12 —, e é por isso que a barra anuncia antes.
- **`countTokens` precisa do MESMO override.** Sem ele o pré-voo mede na janela
  do modelo do chat, e no caso Haiku→Sonnet são 200 mil contra 1 milhão: a
  guarda de 90% barraria minutas que cabem com folga.
- **`modeloDaMinuta` decide por "o usuário ESCOLHEU?", nunca por "o escolhido é
  diferente do chat?"** — e a distinção já custou um bug na revisão do plano.
  Fixar o próprio modelo do chat é escolha legítima ("quero minutar no Luna
  mesmo, é mais barato"); comparar os dois fazia o automático sobrescrevê-la em
  silêncio, e o campo das opções prometia controle negando justamente a opção de
  NÃO trocar. Só cai no automático quando a escolha não tem COMO ser honrada: id
  fora da tabela, ou de outro provedor.
- **`caps` devolve `minuta: {model, caps, trocado}`** — as caps do redator
  viajam junto para o content decidir por elas sem conhecer nome de modelo, a
  mesma regra do campo `caps`. `modeloMinuta` entra no `storage.onChanged`.
- **O gate da biblioteca de peças-modelo passou a olhar as caps da MINUTA**
  (`content.js`, `setModelosHabilitado`), e isto corrige um silêncio caro: quem
  escolhe "Anthropic" no popup cai no `claude-haiku-4-5` (200k), o gate
  desligava o botão 📚 e `modelosMinutaSelecionados()` devolvia `[]` **sem
  aviso no envio** — a minuta saía sem peça-modelo nenhuma. Como ela agora roda
  no Sonnet 5, medir pelo chat seria negar a feature por um limite que não se
  aplica. Mesma lógica em `guardaPaginas(ids, caps)` e `optsDoTurno(caps)` (as
  versões de `web_search` variam entre irmãos Anthropic).
- **`minutarAgora` passou a chamar `await garantirCaps()`**, e isso é
  consequência DIRETA de a nota ter virado afirmação. Enquanto ela sugeria, a
  corrida era inofensiva; anunciando "GPT-5.6 Terra" numa janela em que as caps
  ainda não chegaram, o turno sairia no Luna (sem `payload.model` o worker cai
  no `cfg.model`) e a tela estaria mentindo. **Mudar o modo verbal de um texto
  de UI pode criar um requisito técnico novo.**
- **`origem.modelo` grava o REDATOR, não o modelo do chat**: é esse campo que o
  `editor.js` imprime como "Texto produzido com auxílio de IA (…)", o registro
  dos arts. 19, §6º e 21, §2º da Res. CNJ 615. Com o do chat ele passaria a
  mentir no instante em que a minuta trocou de modelo.
- **Imprecisões ACEITAS e comentadas no código**: `tetoTextoChars` e o selo da
  toolbar continuam no modelo do chat. O primeiro corta o texto das peças mais
  do que precisaria no caso Haiku→Sonnet (degradação graciosa, já avisada por
  `pecasTruncadas`; mexer nele exigiria manter `montarBlocos`, `pecasTruncadas`
  e `estimativaLocalTokens` em sincronia). O segundo é deliberado: o selo
  descreve a CONFIGURAÇÃO, e quem responde "quem redige esta minuta" é a barra,
  no gesto.
- **`setPerfilModelo` SAIU** e deu lugar a `setModeloMinuta({model, modelChat,
  trocado})`: duas APIs escrevendo no mesmo elemento divergiriam. O gatilho da
  nota é `trocado`, não `perfil === "analise"` — quem fixa outro modelo nas
  opções também precisa ser avisado.
- **Campo "Modelo para minutas"** (`chrome.storage.local.modeloMinuta`, "" =
  automático) nas duas telas. Os `<option>` são **clonados do `#model` em JS**
  (`montarModeloMinuta`): uma segunda lista no HTML seria mais um lugar para
  divergir dos ids reais. O item "Automático" **nomeia o modelo resolvido** —
  "Automático" sozinho obriga a adivinhar o que vai acontecer, que é a dúvida
  que o campo existe para tirar.
- **A lista mostra SÓ o provedor do modelo do chat**, e trocar o modelo do chat
  a REMONTA. Oferecer os outros faria a tela exibir uma escolha que o worker
  recusa (`modeloDoTurno`); assim, um valor salvo de outro provedor some do
  campo sozinho — a MESMA decisão que `modeloDaMinuta` toma, então tela e
  comportamento não têm como divergir. O `Salvar` grava o que está na tela.
- **`modeloDaMinuta` devolve `{model, fixado}`, e o `fixado` não é enfeite**: a
  nota da barra afirma "mais adequado a redigir" e "custa mais", e as duas só
  valem no automático (análise → redação). Quem está no Sol e fixa o Terra
  receberia as duas INVERTIDAS — o Terra não redige melhor que o Sol, e custa
  menos. Na escolha manual a nota apenas RELATA o que vai acontecer, que é tudo
  o que a extensão sabe.

### O system da MINUTA é PRÓPRIO (`systemMinuta`, v0.48.0)

A minuta usava o system do CHAT, e três trechos dele trabalhavam contra o
resultado. Não era teoria: é o que explica "a minuta não segue os meus modelos".

- **`PROMPT_INICIO` mandava "Baseie-se SOMENTE nos documentos anexados (peças
  selecionadas pelo usuário)"** — e peça-modelo **não é** peça selecionada.
  Havia uma regra no system mandando ignorar a moldura
  `<modelos_de_referencia>`. Na minuta ela vira `PROMPT_FONTE_MINUTA`, que
  separa os eixos: conteúdo dos autos, forma dos modelos.
- **`PROMPT_FIM` pedia "para uma pergunta pontual, responda em uma ou duas
  frases corridas, sem estruturar"** numa tarefa cuja estrutura é obrigatória.
  Virou `PROMPT_FORMATO_CHAT`, fora da minuta.
- **`PROMPT_DESTAQUES` mandava usar `> [!ALERTA]` e o `SUFIXO_MINUTA` gasta a
  última frase PROIBINDO** — dois comandos contraditórios no mesmo payload. O
  comentário do `PROMPT_DESTAQUES` sempre AFIRMOU que ele não ia na minuta; ia,
  porque a minuta chama `systemPromptAtual()`. **Doc contra realidade — agora a
  afirmação é verdade**, e a frase do sufixo fica como cinto-e-suspensório.
- **Os prompts foram PARTIDOS, nunca reescritos**: `PROMPT_PAPEL` +
  `PROMPT_FONTE_CHAT|MINUTA` + `PROMPT_RASTREIO`, `PROMPT_FIM_COMUM` +
  `PROMPT_FORMATO_CHAT`, e os dois trechos de citação em `PROMPT_CIT_NATIVA`/
  `PROMPT_CIT_TEXTUAL`. Como `join(" ")` sobre arrays concatenados é
  associativo, o system do CHAT sai **byte a byte** o de antes (5.302 e 5.381
  chars) — e há teste que compara com o `git show HEAD`.
- **A citação é SEMPRE a TEXTUAL** (`PROMPT_CIT_TEXTUAL`), e `citacoesNativas`
  NÃO é consultada aqui — o que num outro fluxo seria descuido, aqui é a regra.
  Duas razões: (a) a citação nativa **não existe no produto final** — a minuta
  vira markdown, abre no editor e sai em `.docx` para o PJe, enquanto os
  `page_location` da API ficariam na bolha do chat, que neste fluxo nem existe
  (a resposta vira um card); (b) o `PROMPT_CIT_NATIVA` manda literalmente "NÃO
  repita id nem folha no corpo do texto" e o `SUFIXO_MINUTA` exige "(Título da
  peça, id 123456, fl. 7)" em TODA afirmação — num modelo Anthropic eram dois
  comandos OPOSTOS sobre a rastreabilidade, que é a coisa mais importante do
  ato. Some-se que é a mesma regra peça·id·folha das cinco saídas. Coberto por
  teste que monta a minuta com caps de citação nativa.
- **`comBusca` é PARÂMETRO**, não uma leitura de `panel.isSearchOn()` lá
  dentro: `systemMinuta` é chamada DUAS vezes por turno (pré-voo e stream) e as
  duas precisam da MESMA string — um toggle alternado entre elas faria o
  `count_tokens` medir um request diferente do que sai.
- **Pré-requisito que era um bug**: `estimarContexto` chamava
  `systemPromptAtual()` HARDCODED e ignorava `opts.system`. O mecanismo de
  override por turno já existia (a triagem passa `{system: systemTriagem()}` e
  `stream` faz `Object.assign`), mas o pré-voo não o via.

### A INSTRUÇÃO do usuário tem moldura e vai no fim (v0.48.0)

Ela era concatenada crua na frente do `SUFIXO_MINUTA` — sem tag, sem separador
— e perdia nas duas dimensões que decidem o que um modelo obedece:

- **FRONTEIRA**: a tese tem `<orientacao_decisoria>`, os modelos têm
  `<modelos_de_referencia>`, e o pedido do usuário era o ÚNICO texto livre sem
  moldura, indistinguível das regras do produto. ~80 chars de instrução contra
  ~3.000 de imperativo categórico logo depois; um pedido que contrariasse o
  sufixo ("sem tabelas", "texto corrido") perdia.
- **RECÊNCIA**: depois dela ainda vinham a lista de ids, as datas de juntada e
  até ~15 mil chars de linha do tempo. A última coisa lida NÃO era o pedido.

`blocoInstrucao` resolve as duas, e três detalhes não podem cair:

- **Ela sobe, mas fica ANTES de `blocoOrientacao`.** A tese continua sendo a
  última coisa que o modelo lê, porque é obrigação normativa (a decisão de quem
  assina); a instrução é regra de forma. Rebaixar a tese para dar recência à
  forma seria inverter a hierarquia que a Res. CNJ 615 estabelece.
- **Com a `INSTRUCAO_MINUTA_PADRAO` a moldura é NEUTRA**, sem a cláusula de
  prevalência: o painel injeta esse texto sozinho no campo vazio, e dar-lhe peso
  de "o usuário pediu isto" seria fabricar uma ordem que ninguém deu.
- `SUFIXO_MINUTA.trimStart()` — ele começa com um espaço, herdado de quando
  vinha depois da instrução, e agora abre o bloco.

E na `molduraModelos` a **REGRA ABSOLUTA passou para DEPOIS dos modelos**: é a
frase mais categórica do bloco, e abrindo-o dominava a leitura — o modelo
entrava nos `<modelo>` já convencido de não aproveitar nada deles, que é
exatamente o "ignorou o meu modelo". A ordem que funciona é **o que fazer → os
modelos → o limite**.

### Os silêncios da seleção de modelos (`.mm-nota`, v0.48.0)

"Conjunto vazio se EXPLICA, não desaparece" — a regra da `.sel-nota` e da
`.minutabar`. Três coisas aconteciam em silêncio e davam, para quem gerava, o
MESMO sintoma: nenhuma categoria escolhida, modelos cortados pelo teto de
180.000 chars (reportados só no `console.info`) e a categoria dos modelos
divergindo da espécie do ato (são `<select>` independentes: dá para pedir
"Sentença" e mandar modelos de "Despachos"). A nota diz qual foi, com tokens
`--warn-*` e nunca a `.alertbar` — a minuta sai, só que sem o que o usuário
talvez esperasse; a divergência pode ser deliberada e por isso não bloqueia.
O cálculo puro foi extraído para `selecaoDeModelos(cat)`, separado de
`modelosMinutaSelecionados`, porque a nota repinta a cada gesto e chamar a
função que loga encheria o console de linhas idênticas.

### O aviso de novidades: a ATUALIZAÇÃO é o canal

**A Chrome Web Store não tem push para quem já instalou** — não existe API para
mandar mensagem a quem tem a extensão. Os únicos mecanismos são a própria
atualização (`onInstalled` com `reason === "update"` e `details.previousVersion`)
e o badge do ícone. Buscar avisos num servidor foi descartado: exigiria
`host_permissions` novo e mudaria a história de privacidade da extensão (mesmo
argumento que manteve a permissão `downloads` fora).

- **Badge, nunca abrir aba.** O Chrome atualiza extensões em segundo plano, então
  uma aba nasceria no meio do trabalho do usuário. O badge espera ser olhado, em
  vez de exigir atenção — é o único aviso compatível com a regra de nunca entrar
  entre a pergunta e a resposta.
- **Compara só MAJOR.MINOR** (`marcoDe`). Foram 7 versões em dois dias
  (v0.45.0 → v0.46.2): um badge por bump treina o usuário a ignorá-lo em uma
  semana, que é o oposto do objetivo.
- **`onStartup` re-acende o badge.** Ele é estado da UI do navegador: sobrevive à
  morte do service worker (o caso comum) mas é ZERADO ao reiniciar o Chrome — sem
  isso o aviso sumiria justamente para quem atualizou e foi dormir.
- **Abrir o popup apaga o BADGE, não o AVISO.** O badge já fez o trabalho de
  chamar atenção e foi atendido; a faixa sobrevive até ser lida ou dispensada,
  porque quem abriu o popup para trocar de modelo pode não ter olhado.
- **`previousVersion` só existe naquele instante** — por isso vai ao
  `storage.local` na hora, senão some com o worker e a faixa não teria como dizer
  "desde a sua versão".

### Pedido de avaliação na Web Store

Link para `.../<ID>/reviews` nas QUATRO telas de apoio (popup, opções, ajuda,
novidades) — nunca no painel, pela mesma regra do PIX e do Substack.

- **Vem ANTES dos pedidos de dinheiro** na fileira: é o mais barato para quem lê
  (grátis, meio minuto), e pedir o caro primeiro faz o barato parecer consolo.
- **A política da Store PROÍBE incentivar avaliação** — nada é oferecido em
  troca, aqui nem em lugar nenhum. Pedir é permitido; recompensar, não.
- **Só a quem já tem chave salva**, no popup: o `#apoiarBox` já seguia essa regra
  (`mostrarApoio`), e ela vale igual — pedir avaliação a quem ainda está
  configurando rende uma estrela ("não entendi como usa").
- O **ID da extensão** (`imgfakkieoijdhdpafjjlefcckbmbppm`) não estava em lugar
  nenhum do repositório; ele é o que monta as URLs públicas da ficha.

## CLI `pje` — baixar autos em lote (`cli/`, FORA da extensão)

`cli/` é um programa Node **separado** (baixar autos por CNJ fora do navegador).
**Nada em `src/`, `manifest.json`, `vendor/`, `icons/` ou `empacotar.ps1` muda
por causa dele**, e ele fica fora do pacote da Store por construção. O detalhe
vive em **`cli/CLAUDE.md`**, que carrega sozinho ao trabalhar naquele diretório.

Fica aqui só o que é preciso quando se está em `src/` — isto é, quando aquele
arquivo NÃO carrega:

- **`src/exportar.js` tem um SEGUNDO CONSUMIDOR.** O CLI o reusa lendo, nunca
  alterando: `opts.zip` do `montarZip` não é um formato, é um **sink**
  (`criar`/`add`/`fechar`), e um sistema de arquivos o satisfaz. Ao mexer em
  `exportar.js`, lembrar disso — e que rodar os dois sobre o mesmo processo é um
  **oráculo** que revela divergência.
- **Duas regras que nasceram no `pje login` e valem para o projeto inteiro:**
  - **Rota que pendura precisa de ALTERNATIVA, não de teto maior.** (A mesma que
    governa o `MOVS_TIMEOUT_MS` das movimentações e o teste de WebGPU do OCR.)
  - **Numa espera longa, nenhuma chamada isolada pode ser fatal** — `finally`
    NÃO engole exceção, e um comando que anuncia esperar dez minutos morria aos
    12 segundos por um `await` desguarnecido.

## A tela "Meus modelos de peças" alcançou a irmã (v0.61.0)

**Duas telas irmãs divergiram, e ninguém viu.** `editor.html` no modo-lista
("Minhas minutas") ganhou na v0.42 filtros com contagem, agrupamento por tempo,
duas colunas e cards ricos; `modelos.html` ficou numa coluna de 720px centrada,
com cards de três linhas, desperdiçando mil pixels. Boa parte do que o mockup de
redesign pedia para esta tela **já existia na irmã**.

- **Chips de espécie com contagem, e as VAZIAS entram com zero.** É a resposta ao
  relato *"poucas categorias, deixe mais aberto"*: o seletor antigo só mostrava
  categoria que tivesse modelo, e a leitura de quem chega é "a extensão só
  aceita estas três espécies". Os chips respondem também "o que dá para
  cadastrar?".
- **Pré-visualização à direita** (`textContent`, NUNCA `innerHTML`: o texto veio
  de um `.docx` do usuário). Até aqui, ver o texto de um modelo exigia abrir a
  EDIÇÃO dele. Por isso o clique na linha passou a ABRIR a prévia, e "Editar" é
  botão explícito: conferir qual dos três é o certo virou gesto barato e
  reversível.
- **Sem badge de categoria no card, e não por esquecimento**: a lista já é
  AGRUPADA por ela, e pintar as espécies de ato criaria um segundo vocabulário
  de cores ao lado do `--cat-*` do painel, que significa outra coisa (a
  categoria da PEÇA do processo).
- **`.primario` era uma classe que só funcionava no cabeçalho**, e isso foi um
  defeito criado pela CORREÇÃO da v0.60.1: para vencer `.topo button` (0,1,1) a
  regra foi escopada em `.topo .primario`, e o "Editar" da prévia — que nasceu
  depois com a mesma classe — saiu cinza. Hoje quem pinta é a regra GERAL, e o
  escopo em `.topo` só existe para vencer a genérica, repetindo os mesmos
  valores. **Ao escopar uma regra para vencer uma disputa, conferir se a classe
  ainda vale fora daquele escopo.**

### A varredura de TOKEN FANTASMA (a rede mais barata desta rodada)

`var(--x)` **sem fallback**, apontando para um token que a folha dona não
declara, deixa a declaração inteira INVÁLIDA — em silêncio. `background` vira
transparente, `border-color` vira `currentColor`. Nenhum teste de contraste pega
isso, porque para ele a propriedade simplesmente não existe. Foi assim que
quatro `--veu-*` ficaram fantasmas no `ui.css` na v0.60.1.

O script vive no scratchpad (não há `package.json` no repo) e leva ~1 s: para
cada folha, `declarados(cadeia) ⊇ usados(folha)`. **A cadeia importa** —
`panel.css` vive no Shadow DOM e NÃO herda o `ui.css`, enquanto `editor.css`,
`modelos-page.css` e `mapa.css` herdam. Ele pegou `--w-modelos` e `--w-lateral`
**duas vezes na mesma sessão**, no instante em que foram escritos.

## Desenvolvimento e teste

- **A SUÍTE VIVE EM `tests/`** (`cd tests && node correr.mjs`, ~95 s): 36
  verdes na v0.60. `--rapido` roda só os de unidade.
- **E HÁ UMA REDE VISUAL, em `tests/visual/`, que o `correr.mjs` NÃO roda**
  (depende do Chrome instalado). São três ferramentas que medem coisas
  diferentes, e nenhuma substitui a outra:
  - **`impressao.mjs`** — para CADA elemento da árvore sombra, 11 propriedades
    de cor computadas, em oito retratos. Responde *"alguma cor mudou onde não
    devia?"* — e só isso: mede **um tema por execução**, então prova de
    não-regressão nunca é prova de que o tema novo funciona (quem responde por
    isso é o `t-temas-contraste`).
    - **UMA BASELINE DE REGRESSÃO VISUAL SÓ VALE ENQUANTO A ÁRVORE É A MESMA, e
      quem reconstrói markup a REGRAVA no mesmo commit.** A `base-v0.59.json`
      ficou órfã na v0.60 e ninguém percebeu: os caminhos de seletor mudaram, e
      comparar contra ela devolve **2.773 elementos novos/ausentes**. Nem com
      `TEMA=institucional` ela serve — aquele tema preserva os ~130 TOKENS, e a
      comparação ainda acusa **1.604** diferenças, porque **o redesign mudou
      COMPONENTES, não só cores**: token intacto num componente reconstruído
      pinta outra coisa. O custo de deixar assim não é o arquivo velho: é a
      rodada seguinte invocar a ferramenta como prova, receber milhares de
      diferenças legítimas, e o hábito virar ignorar o resultado. Baseline da
      v0.60.1: `base-v0.60.json`, 4.335 elementos × 11 = **47.685**, fechando em
      zero. A antiga fica no repo como RETRATO do visual que o `institucional`
      promete preservar — só não é mais oráculo.
  - **`capturar.mjs`** — um PNG por tema × estado do sigilo, mais o vazio, a
    view de tempo e o movimento reduzido. Responde *"a tela está certa?"*, que é
    outra pergunta: sombra `inset` pintada abaixo dos filhos, caixa 0×0 que não
    desenha `box-shadow`, item numa terceira linha do cabeçalho — `getComputedStyle`
    reporta tudo vivo e correto em todos esses casos.
  - **`minutabar.mjs`** — os **onze** estados da barra do modo minuta. Responde
    às duas perguntas que decidiram a v0.61.0 e que nenhuma outra ferramenta
    mede: *quanto ela tem de altura* e *quantas caixas âmbar aparecem*. A
    página-arnês ao lado MARCA UMA PEÇA antes de ligar o modo — sem isso o
    `.btn-minuta` recusa (`temMaterialParaAto`) e a barra mede **0px em todos os
    estados**, uniformidade que parece resultado.
  - **`telas.mjs`** — as seis satélites (popup, opções, ajuda, editor, modelos,
    novidades). Painel e satélites compartilham a paleta por `ui.css`, e
    divergir cria DUAS identidades no mesmo produto sem nenhum teste acusar.
- **ARMADILHAS DO ARNÊS, todas medidas** (e documentadas em
  `tests/visual/README.md`):
  1. O domínio CDP é **`Emulation`**, não `Emulator` — com o nome errado o
     comando é ignorado em silêncio e a captura sai cortada.
  2. **`--force-prefers-reduced-motion` NÃO funciona** neste Chrome: medido,
     `matchMedia(...).matches` continua `true` com a flag. Quem manda é
     `Emulation.setEmulatedMedia`. Sem isso mede-se sempre o ramo reduzido, que
     é **outro layout** — foi assim que se descobriu que o painel expandido
     ficava DESCENTRADO para quem pede menos movimento, um defeito de
     acessibilidade que estava em produção.
  3. O modo é trocado **clicando no botão real**, nunca pondo a classe na mão:
     pôr a classe pula o `aplicarModo()`, que centra a janela e faz o FLIP.
  4. O arnês **relata exceções da página**. Sem isso, um `ReferenceError` no
     `panel.js` chega como *"panel.css nao chegou"* — apontando para a folha de
     estilo, que está perfeita.

- **ARMADILHA DA ZONA MORTA TEMPORAL no `content.js`** (já derrubou o painel
  inteiro uma vez): o arquivo é um IIFE gigante que REGISTRA callbacks no painel
  centenas de linhas antes de declarar o estado que eles leem, e chama
  `refresh()` no meio — que roda `panel.setDocs` de forma **síncrona**. Todo
  `const`/`let` do escopo do IIFE declarado DEPOIS de `refresh()` e lido por um
  desses callbacks lança `Cannot access before initialization` dentro do
  `setDocs`, que **aborta e leva junto o resto do content.js** — sumiu a seleção
  em faixa inteira, sem nenhum sintoma que apontasse para a causa. Estado lido
  por callback vive no TOPO, junto do `const panel`.
- **TESTE DE MUTAÇÃO SEM `assert` NO ALVO É TESTE DE MUTAÇÃO QUE NÃO RODOU.**
  `str.replace(a, b, 1)` **não avisa quando `a` não casa** — devolve a string
  intacta. Um script que imprime “mutação aplicada” incondicionalmente entrega
  um falso NEGATIVO convincente: a suíte segue verde e a conclusão é “o teste
  novo é fraco”, quando o produto nunca foi mutado. Aconteceu nesta rodada, com
  a mutança certa e a indentação errada. Todo script de mutação começa com
  `assert s.count(velho) == 1`. Mesma família do `grep` que só acha resultado em
  `tests/espelho/`.
- Não há bundler. Valide sintaxe com `node --check src/*.js`.
- **`node --check` NÃO pega variável inexistente** — ele só valida sintaxe, e um
  `ReferenceError` de runtime derruba a função inteira. Foi assim que um
  `paginas: ehPdf ? …` sobrevivente de um `ehPdf` → `ehBin` quebrou a exportação
  em `.zip` por completo, com a mensagem "Não foi possível exportar: ehPdf is
  not defined". Depois de renomear variável ou remover recurso, rode um ESLint
  descartável com **só duas regras** (`no-undef` e `no-unused-vars`) sobre
  `src/*.js`: instale no scratchpad, declare os globais dos content scripts
  (`PJE`, `PjePanel`, `PLIB`, `MLIB`, `ZipW`, `PjeExport`, `DocxImport`,
  `chrome`…) e trate como falso positivo o `typeof module !== "undefined"` dos
  rodapés de teste e os IIFE `var X = (function(){…})()`, que são consumidos por
  outro arquivo. Não deixe o config no repo: o projeto não tem `package.json`.
- **CSS não tem `node --check`, e comentário desbalanceado é SILENCIOSO.** Um
  `/* … */` partido em duas metades (o segundo `*/` órfão) faz o parser entrar
  em modo de erro e **descartar declarações até o próximo `;`** — dentro de um
  bloco some a propriedade que vier depois, e entre regras some a REGRA
  seguinte inteira. Nada aparece no console e a página continua de pé, com um
  estilo a menos. Depois de editar `.css`, rodar um verificador descartável no
  scratchpad que conte `/*`/`*/` e `{`/`}` nas folhas de `src/` — 30 linhas, e
  é a única rede contra esse erro.
- **NENHUM caractere de controle CRU no fonte — e o pior é o `NUL`.** A regra já
  valia para os placeholders PUA do `renderMd` e do mapa ("sempre como escapes
  ASCII no código"); aqui ela tem um custo maior, de FERRAMENTA. O git decide se
  um arquivo é binário procurando um `\0` nos primeiros ~8 KB: `precatoria.js`
  usava dois NUL crus como separador em `textoEvento` e entrou no repositório
  como **`Bin 0 -> 12113 bytes`** — 247 linhas de lógica jurídica commitadas sem
  uma linha de diff, e toda alteração futura ali invisível em revisão. O
  ripgrep também pula binários, então as buscas no repo passam a mentir por
  omissão (procurar `textoEvento` em `src/` não devolvia nada). `node --check`
  passa: o NUL é legal dentro de string. Escrever `"\u0000"` resolve tudo e não
  muda um byte em runtime. Varredura: procurar bytes `< 0x09`, `0x0B`, `0x0C`,
  `0x0E–0x1F` e o intervalo PUA `U+E000–U+F8FF` em `src/*` e nos `.md`.
- **Testar o CAMINHO DO ENVIO em jsdom** (irmão do teste de boot, e o que protege
  o fluxo mais usado): sobre o mesmo harness, marcar um checkbox, escrever no
  textarea, clicar em `.send` e conferir que (a) o `.status` NÃO traz recusa de
  fila (`Lendo a lista oficial…`, `Exportação em andamento`), (b) `PJE.baixar`
  foi chamada com o id marcado, (c) foi ao worker um `{type:"chat"}` pela porta,
  (d) o conteúdo da peça está dentro do payload e (e) o `countTokens` rodou.
  Stubs necessários além dos do boot: `apiKey` no `storage.local`, e o
  `sendMessage` respondendo `countTokens` e `upload`.
  **Armadilha do stub**: o `kind` de peça de texto é **`"text"`**, não
  `"texto"` (`fmt` é que vale `"texto"|"html"|"rtf"`). Com o valor errado,
  `podeAnexar` recusa a peça, ela entra em `semConteudo` e o request sai SEM o
  documento — um falso positivo de bug convincente, porque o turno segue e o
  inventário ainda anuncia a peça como não anexada.
- **Testar o BOOT do content.js sem PJe** (o único teste que pega erro de ordem
  de inicialização): DOM com `#divTimeLine`, stubs de `chrome`, `PJE`
  (a superfície real é `listarDocumentos`, não `listar`), `PLIB`,
  `MLIB` (**precisa de `CATEGORIAS`**, que o `mount` itera), `ZipW` e
  `PjeExport`; roda `panel.js` e depois `content.js` no mesmo contexto. Em
  `jsdom` (`npm i jsdom` no scratchpad) sai sem navegador — mas é preciso stubar
  `ResizeObserver`, `requestIdleCallback`, `matchMedia`, `CSS.escape`,
  `setPointerCapture` e o `fetch` do `panel.css`, e procurar o host do Shadow DOM
  em `document.documentElement` (é lá que o `mount` o anexa), não no `body`.
  Conferir por COMPORTAMENTO que os handlers do fim do arquivo subiram —
  arrastar marca a faixa, Shift+clique estende, botão direito abre o `.selmenu`
  —, porque um `content.js` abortado no meio ainda monta o painel e lista as
  peças. Quatro armadilhas do harness, todas já custaram um falso resultado:
  (a) `runScripts: "dangerously"` no JSDOM, senão os `<script>` anexados não
  executam e o teste morre no primeiro stub; (b) o jsdom **não implementa
  `Response`** — sem um polyfill que herde o content-type do Blob, `PJE.lerAnexo`
  falha com "Response is not defined" e o erro parece bug do produto; (c) para
  alcançar `DocxImport`/`MLIB`/`PLIB` do lado do Node é preciso uma PONTE por
  `<script>` (`window.__X = X`) — são `const` léxicos de script clássico e não
  viram propriedade de `window`, então `if (w.DocxImport)` pula o bloco inteiro
  em silêncio e o teste "passa" sem ter rodado; (d) a seleção que inclui a row
  lazy é `selecaoParaMemoria()`, não `getSelected()` (esse é só os checkboxes).
  Vale também extrair funções do fonte real por VARREDURA DE CHAVES e rodá-las em
  `vm` — é assim que os predicados da memória de caso e as invariantes de
  `refinarContexto`/`subirAnexos` são testados sem copiar código que possa
  divergir. Testes de unidade fora do
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
  servido por HTTP local (fetch do CSS falha em `file://`). **`mount()` DEVOLVE a
  API** — `const painel = PjePanel.mount()`, e é nele que vivem `setConfigured(true)`,
  `setDocs([...])`, `setTimelineTip({texto, carregando})`… Chamar `PjePanel.setDocs`
  direto lança `is not a function` e a lista fica vazia, sem nada na tela que
  explique. O painel abre pelo botão `.launcher` (não `.fab`) e o modo se troca
  pelos botões `.expand` / `.side` / `.free` do cabeçalho. As APIs `startPrep` /
  `setPrepState` / `endPrep` / `addMessage` permitem simular todo o fluxo visual.
  Duas armadilhas do harness por automação: `document.hasFocus()` é **false** com
  a janela em segundo plano, então `:focus` não casa e regras como
  `:has(.tip-i:focus)` parecem quebradas (o `activeElement` está correto); e o
  ponto de virada dos modos largos é a **coluna** de peças (328/372px), não a
  largura do painel — testar layout de lista só no flutuante não vê o pior caso.
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

- **Processos de referência (`processo P1`…`P4`).** As medições citadas neste
  arquivo e no código foram feitas em processos REAIS do TJCE, mas os números
  CNJ **não são publicados**: este repositório é público, e um número de
  processo identifica as partes — no caso de matéria criminal, uma pessoa
  investigada, ré ou presa. Os rótulos preservam a distinção entre as medições
  sem expor ninguém. `P1` é o de cartas precatórias (103 eventos, 113 peças);
  `P2` é uma queixa-crime migrada do SAJ; `P3` é o das movimentações via REST;
  `P4` é o de 138 peças que derrubava a view JSF. Dados pessoais em exemplos de
  código (nomes, CPF, OAB) são **fictícios** por regra.

- Comentários e strings de UI em português do Brasil (com acentuação correta).
- **Visual: `DESIGN.md` manda — ele é a ÚNICA fonte da paleta.** Tokens,
  componentes, escala, restrições da plataforma e o porquê de as fontes não virem
  de CDN vivem lá. Aqui não se repete valor de cor: a lista que existia neste
  ponto ficou defasada (anunciava `#0078aa` depois de a paleta migrar para
  `#12729f`, e petições/provas depois de trocarem de cor) e passou a ser lida em
  toda sessão como se fosse verdade. Onde as variáveis moram continua valendo:
  topo de `panel.css` (`.wrap`), espelhadas em `ui.css` (`:root`, para
  popup/opções/ajuda, cujos HTMLs têm referências inline a `var(--pje-2)`).
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
- **A faixa `.hint-key` NÃO EXISTE MAIS (v0.60), e a regra que ela ensinou
  continua valendo.** Os atalhos viraram o placeholder do campo mais uma linha
  FIXA no `.comp-meta` — dois lugares que não medem altura. A regra: **faixa que
  muda de altura não pode ser disparada pelo foco de uma linha que contém
  botões.** O texto abaixo é o registro do defeito que ela causava, mantido
  porque a armadilha vale para qualquer faixa nova.
- **[HISTÓRICO] Quem revelava o `.hint-key` era a classe `.hint-on` (foco do TEXTAREA), NUNCA um
  `.inrow:focus-within` no CSS** — e a diferença custou o 📎 e o Enviar. Como
  `.msgs` é `flex:1`, expandir essa faixa faz o rodapé crescer e a `.inrow`
  **subir 20px** (medido no Chrome, contra um 📎 de 32px); o `pointerdown` num
  botão da linha é justamente o que lhe dá foco, então o botão saía de baixo do
  cursor durante a transição de 180 ms, o `mouseup` caía noutro elemento e o
  navegador disparava o `click` no **ancestral comum** — o seletor de arquivos
  não abria e o envio não acontecia, sem erro nenhum no console. Sintoma
  relatado: "clico, o painel se mexe, e só na terceira vez abre"; com a conversa
  VAZIA funcionava, porque ali o `.novato` já deixa a faixa aberta. O `focusout`
  **preserva** o estado quando o foco continua dentro da `.inrow`: colapsar ao
  clicar no 📎 no meio da digitação é o mesmo defeito ao contrário. O `.attach`
  ainda faz `preventDefault` no `mousedown` para não roubar o foco do campo.
  Regra geral: **faixa que muda de altura não pode ser disparada pelo foco de
  uma linha que contém botões.**
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
  - **O endereço do console do provedor é um LINK (`.pc-obter`), no `.pc-head`, e
    fica visível SEMPRE.** Enquanto ele era texto dentro da `.hint` ("Crie em
    console.anthropic.com"), a tela que pede uma chave não tinha como levar até
    ela: dava para selecionar e copiar, e só. Pior, `pintarMascara` esconde a
    `.hint` inteira quando há chave salva — exatamente quando se volta ao console
    para conferir saldo, limite ou chave revogada. Por isso ele mora ao lado do
    "Trocar" (`.pc-acts`), não na dica. URLs: `console.anthropic.com/settings/keys`,
    `aistudio.google.com/apikey`, `platform.openai.com/api-keys` — os mesmos do
    `help.html`, que continua sendo o passo a passo.
  - **A `.save-row` tem margem PRÓPRIA** (`--sp-5`). `.save-acts .btn` zera o
    `margin-top` que o `.btn` carregava de quando nascia sozinho na coluna, e sem
    a margem da linha "Testar chave"/"Salvar configuração" encostava nos chips de
    persona — some a fronteira entre "ainda estou preenchendo" e "agora eu ajo".
    Consequência no popup: o `.save-status` (overlay `position:absolute; inset:0`
    sobre o botão) **não pode repetir esses 14px** — repetindo, o "Salvo!" saía
    deslocado para baixo do botão que ele deveria cobrir.
- Modelos da API: manter os IDs do `popup.html`/`options.html` alinhados aos aliases
  atuais da Anthropic (`claude-haiku-4-5` — rápido e barato, mas com janela de 200 mil
  tokens/100 págs.; o Sonnet 5 de 1M é a opção para autos volumosos) e do Google
  (`gemini-3.8-flash` — o mais novo da linha Flash, 09/2026, id conferido na
  página de modelos da API, mesmo preço de tabela do 3.7 e ainda sem smoke test;
  `gemini-3.7-flash`, o único MEDIDO para redigir; `gemini-3.6-flash` e
  `gemini-3.5-flash-lite` seguem na lista). Modelo novo entra em SEIS pontos:
  `MODEL_CAPS` (antes do irmão que ele substitui — `sugestaoRedacao` desempata
  por ordem), `FALLBACK_POR_PROVEDOR`, `PADRAO`/`PERFIS` do popup.js,
  `NOMES_MODELO` do painel, os `<option>` das DUAS telas (grupo direto e grupo
  OpenRouter, se o catálogo o tiver) e as tabelas do `help.html`/README. **Modelo
  que já esteve na lista NÃO é removido**: `select.value` com um id que sumiu deixa o
  campo VAZIO, e quem tinha aquele modelo salvo perderia a seleção. E a tabela
  `MODEL_CAPS` sincronizada com os docs (limites, versões de tools, thinking/effort).
- **`gpt-5.6-luna` é o DEFAULT em `background.js`** (desde a v0.40.0; antes era o
  `gemini-3.6-flash`). Dois motivos, e os dois são de produto: **preço** — US$ 0,20/1,20
  contra 1,50/7,50 do Gemini Flash, e a conta de mandar autos inteiros é feita de
  input — e a **allowlist de domínios na busca**, que a OpenAI aplica no SERVIDOR e o
  Gemini não tem (lá a prioridade das fontes .jus.br é só instrução de prompt, garantia
  mole que já vazou em smoke test — ver "Prioridade das fontes na busca web").
  **Consequência que permanece**: `citacoesNativas:false` também na OpenAI, então a
  experiência padrão segue usando citação TEXTUAL (o `ⓘ` ao lado do selo) em vez das
  `[n]` clicáveis por página; quem as quiser troca para um modelo Anthropic. **A base
  instalada não é afetada**: o "Salvar" do popup grava `model` sempre, então só storage
  SEM `model` (instalação nova) cai no default.
- **Trocar o default é mudança de QUATRO pontos, não de um.** Além de `getCfg` e
  `MODELO_PADRAO` (abaixo), o modelo novo precisa ser o **primeiro `<option>`** das
  duas telas — é para onde o navegador cai quando `select.value` não casa nenhum id,
  e alinhar os dois transforma esse fallback silencioso em rede de segurança — e o
  **cartão de provedor** dele vem primeiro na fileira, que é a hierarquia que o
  usuário lê. Ordem hoje: GPT → Claude → Gemini.
- **O modelo padrão vive em DOIS lugares e eles precisam bater**: `getCfg` em
  `background.js` (ES module do worker) e `MODELO_PADRAO` em `popup.js` (script
  clássico, compartilhado por popup e options — não pode importar do worker).
  Quando o default virou Gemini (v0.25), só o worker mudou: sem `model` no storage
  o `<select>` caía no PRIMEIRO `<option>` do HTML (o Haiku), então na **primeira
  instalação** — o público que chega pela Store — o popup pedia a chave da
  Anthropic para uma extensão que ia falar com o Google, e o selo do painel
  contradizia a tela de configuração. `select.value` com um id fora da lista
  (config de uma versão anterior) deixa o campo VAZIO: o popup cai no padrão em
  vez de gravar modelo vazio. Coberto por teste em jsdom que lê o default do
  próprio `background.js` — divergir de novo quebra o teste, não o usuário. O
  teste extrai TUDO dos fontes (default, ids dos `<option>`, chaves de
  `MODEL_CAPS`, nomes do selo): repetir a constante nele criaria uma terceira
  cópia para divergir. Ele cobre também o que a troca de default quebraria em
  silêncio — as duas telas oferecendo conjuntos diferentes de modelos, um modelo
  ofertado sem caps ou sem nome no selo, e o `PADRAO` de um cartão apontando para
  id inexistente.
- **`capsDe` tem fallback POR PROVEDOR** (`FALLBACK_POR_PROVEDOR`): id
  desconhecido tem o provedor decidido por `providerDe` (prefixo, acerta
  sempre), então cair sempre nas caps do Haiku dava um par incoerente — request
  para o Google com janela de 200 mil tokens, guarda de 100 páginas e
  `citacoesNativas` ligada (o system pediria citação por página a um modelo que
  não as produz).
- **O selo do modelo (`setModelo` em panel.js) tem tabela de NOMES própria** e
  ela precisa acompanhar `MODEL_CAPS`: o fallback é o id cru, e um selo cujo
  trabalho é dizer qual modelo respondeu não pode mostrar `gpt-5.6-luna`.
- Config no `chrome.storage.local`: `apiKey` (Anthropic), `geminiApiKey` (Google),
  `openaiApiKey` (OpenAI),
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
