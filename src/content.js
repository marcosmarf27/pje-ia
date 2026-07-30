// Orquestra o painel: lista documentos, baixa peças marcadas, mantém a conversa
// e faz streaming da resposta do Claude (via Port com o service worker).
(function () {
  if (window.__pjeIaLoaded) return;
  window.__pjeIaLoaded = true;

  // O content script roda em QUALQUER página *.jus.br (matches do manifest),
  // mas a maioria não é uma tela de autos do PJe (login SSO, portais,
  // consultas públicas…). Todo o boot do painel vive em iniciar(), chamada
  // uma única vez quando a timeline de autos (#divTimeLine) existe — sem ela,
  // nada é injetado no DOM da página. O bootstrap fica no fim do arquivo.
  function iniciar() {

  // Trechos comuns do system prompt; a parte de CITAÇÕES varia por provedor:
  // a Anthropic gera citações estruturadas por página (citations API); o
  // Gemini não tem esse recurso — o modelo é instruído a citar a peça e a
  // página NO PRÓPRIO texto (caps.citacoesNativas === false).
  // A identificação da peça (nome + id) vive no trecho COMPARTILHADO porque é
  // requisito do produto nos dois provedores: o id é o número que abre o título
  // de cada peça e é por ele que o usuário reencontra a peça na timeline do PJe
  // (mesma convenção do SUFIXO_MAPA e do SUFIXO_MINUTA).
  const PROMPT_INICIO = [
    "Você é um assistente jurídico que analisa autos de processos do PJe.",
    "Responda sempre em português do Brasil.",
    "Baseie-se SOMENTE nos documentos anexados (peças selecionadas pelo usuário).",
    "Toda afirmação sobre os autos precisa ser rastreável até a peça de origem.",
    "Cada peça anexada tem um id — o número que abre o seu título (em",
    "'123456 - Contestação', o id é 123456) — e é por ele que o usuário reencontra",
    "a peça na linha do tempo do processo. NUNCA invente id, folha, data ou valor.",
  ];
  const PROMPT_FIM = [
    "Seja objetivo e técnico. Comece pela resposta: nada de preâmbulo do tipo 'Vou",
    "analisar as peças' ou 'Com base nos documentos fornecidos'.",
    "Se a informação não estiver nos documentos selecionados,",
    "diga explicitamente que não consta nas peças fornecidas — não invente.",
    "Atenção a peças de mero encaminhamento: no PJe é comum a petição conter apenas",
    "uma remissão como 'Em anexo' ou 'Segue anexo', com o conteúdo real nos documentos",
    "anexos protocolados junto dela. Nesse caso, diga claramente que a peça é só um",
    "encaminhamento e oriente o usuário a marcar também os anexos correspondentes",
    "(ex.: as peças 'Documento de Comprovação' logo abaixo dela na lista).",
    "Use markdown — títulos curtos, listas e tabelas (ex.: linha do tempo dos atos,",
    "partes, pedidos) — quando a resposta tiver mais de um eixo; para uma pergunta",
    "pontual, responda em uma ou duas frases corridas, sem estruturar.",
  ];
  const SYSTEM_PROMPT = PROMPT_INICIO.concat(
    [
      "As citações precisas de trechos são geradas automaticamente pelo sistema e já",
      "mostram peça, id e folha ao usuário — apoie cada afirmação relevante no trecho",
      "correspondente e NÃO repita id nem folha no corpo do texto.",
      "Peças digitalizadas sem camada de texto podem não permitir citação automática;",
      "só nesse caso escreva a referência no próprio texto (ex.: 'na Contestação, id",
      "123456') e avise o usuário de que aquela peça não é citável.",
    ],
    PROMPT_FIM
  ).join(" ");
  const SYSTEM_PROMPT_CIT_TEXTUAL = PROMPT_INICIO.concat(
    [
      "Ao afirmar fatos relevantes, cite a peça, o id E a página no PRÓPRIO texto,",
      "no formato '(Contestação, id 123456, fl. 12)' — indique sempre a página do",
      "PDF de origem quando conseguir identificá-la; sem folha identificável, use",
      "'(Contestação, id 123456)'.",
      "Se usar a busca na web, priorize fontes oficiais brasileiras: sites .jus.br",
      "(tribunais, STF, STJ, TST, CNJ) e planalto.gov.br — cite a fonte de cada",
      "informação obtida na web.",
    ],
    PROMPT_FIM
  ).join(" ");
  // Instruções personalizadas do usuário (persona/preferências — magistrado,
  // assessor, advogado…), definidas nas opções. Entram DEPOIS das regras-base
  // com um rótulo que preserva a autoridade delas (não inventar, só usar as
  // peças). Vazio (default) = prompt byte a byte idêntico ao de sempre — quem
  // não usa o recurso não muda NADA, em nenhum provedor. Custo aceito: editar
  // no meio de uma conversa invalida o cache de prefixo (mesma regra da troca
  // de modelo/busca).
  let customPrompt = "";

  // O system prompt do turno depende do modelo ATUAL (caps) e das instruções
  // personalizadas — usado no envio (chat, minuta e mapa) E no count_tokens, para o
  // pré-voo medir o mesmo request que vai de fato. Anthropic recebe como
  // `system`; Gemini como `system_instruction` (o worker repassa verbatim).
  // Contexto do caso que o modelo não tem como deduzir dos PDFs com segurança:
  // o número CNJ (sem ele o mapa mental titulava com número inventado) e a data
  // de hoje (prazos, prescrição e "situação atual" sairiam calculados contra o
  // conhecimento congelado do modelo). Custo de cache desprezível: o cache é
  // ephemeral de 5 min, então a virada diária nunca cai dentro de uma janela viva.
  function contextoDoProcesso() {
    let s = "";
    try {
      const num = PJE.getNumeroProcesso();
      if (num) s += " Processo em análise: " + num + ".";
    } catch {
      /* página sem número identificável — segue sem ele */
    }
    return s + " Hoje é " + new Date().toLocaleDateString("pt-BR") + ".";
  }

  function systemPromptAtual() {
    const base =
      (modelCaps && modelCaps.citacoesNativas === false
        ? SYSTEM_PROMPT_CIT_TEXTUAL
        : SYSTEM_PROMPT) + contextoDoProcesso();
    if (!customPrompt) return base;
    return (
      base +
      " Instruções adicionais definidas pelo usuário desta extensão (perfil e " +
      "preferências dele — siga-as no que não conflitar com as regras acima): " +
      customPrompt
    );
  }

  // Limite de payload do FALLBACK base64 (quando o upload à Files API falha):
  // a API da Anthropic aceita 32 MB por requisição (teto de 24 MB com folga);
  // a do Gemini aceita ~20 MB (teto de 15 MB). base64 infla ~33%. No caminho
  // normal as peças são referenciadas por file_id/uri e o teto não se aplica.
  const MAX_TOTAL_B64_CHARS = 24 * 1024 * 1024;
  const MAX_TOTAL_B64_CHARS_GEMINI = 15 * 1024 * 1024;

  // Betas enviadas em todos os requests de chat (documentos por file_id).
  const BETAS_CHAT = ["files-api-2025-04-14"];

  // Fontes confiáveis para a busca de jurisprudência/legislação (allowed_domains).
  const DOMINIOS_JURIDICOS = [
    "stf.jus.br",
    "stj.jus.br",
    "tst.jus.br",
    "tjce.jus.br",
    "cnj.jus.br",
    "planalto.gov.br",
    "lexml.gov.br",
    "jusbrasil.com.br",
    "conjur.com.br",
    "migalhas.com.br",
  ];
  // Multi-PJe: inclui o domínio-raiz do tribunal atual (ex.: pje1g.trf5.jus.br
  // → trf5.jus.br) para a busca alcançar a jurisprudência do próprio tribunal.
  {
    const raiz = location.hostname.split(".").slice(-3).join(".");
    if (/\.jus\.br$/.test(raiz) && !DOMINIOS_JURIDICOS.includes(raiz)) {
      DOMINIOS_JURIDICOS.push(raiz);
    }
  }

  // Ferramentas de busca web na versão suportada pelo modelo atual.
  // Gemini: google_search não aceita allowed_domains — a priorização de
  // fontes .jus.br vai por instrução no system prompt (SYSTEM_PROMPT_CIT_TEXTUAL).
  function toolsBusca() {
    if (!modelCaps) return [];
    if (modelCaps.provider === "gemini") return [{ type: "google_search" }];
    return [
      {
        type: modelCaps.webSearch,
        name: "web_search",
        max_uses: 5,
        allowed_domains: DOMINIOS_JURIDICOS,
      },
      {
        type: modelCaps.webFetch,
        name: "web_fetch",
        max_uses: 3,
        allowed_domains: DOMINIOS_JURIDICOS,
      },
    ];
  }

  const docsCache = new Map(); // id -> {kind:"pdf",b64,size,pages,fileId?} | {kind:"text",text}
  let conversation = []; // [{role, content}]
  let custoConversaUsd = 0; // soma dos custos estimados dos turnos (US$)

  // Registra o custo de um turno concluído (chat, minuta ou mapa) no medidor do
  // rodapé. O worker calcula o valor pela tabela de preços do modelo; a API
  // devolve só as contagens de tokens (usage).
  function registrarCusto(fim) {
    if (!fim || fim.custoUsd == null) return;
    custoConversaUsd += fim.custoUsd;
    panel.setCusto({
      turnoUsd: fim.custoUsd,
      conversaUsd: custoConversaUsd,
      usage: fim.usage,
      provedorNome:
        modelCaps && modelCaps.provider === "gemini" ? "Google" : "Anthropic",
    });
  }
  // Peças cujos blocos document JÁ estão no histórico desta conversa. Anexamos
  // só o DELTA a cada turno: reanexar tudo duplicaria as páginas/tokens no
  // request (o histórico não pode ser editado) e estourava os limites já no
  // segundo envio. Peça desmarcada permanece no histórico até "Nova conversa".
  let pecasNaConversa = new Set();
  // A busca web foi usada nesta conversa: o histórico contém blocos de
  // ferramenta, então as tools continuam declaradas nos turnos seguintes
  // (mesmo com o toggle desligado) — remover trocaria o conjunto de tools,
  // invalidando o cache de prefixo e arriscando rejeição do histórico.
  let buscaNaConversa = false;
  // Provedor (anthropic|gemini) do PRIMEIRO turno da conversa: o histórico de
  // um provedor não é traduzível para o outro (thinking assinado da Anthropic
  // vs. thought signatures do Gemini) — trocar no meio exige "Nova conversa".
  let conversaProvider = null;
  let alertaTrocaLigado = false; // o alerta atual é o de troca de provedor
  let busy = false;
  // Estimativa dinâmica de contexto (dispara quando a seleção muda): timer de
  // debounce + número de sequência para descartar respostas atrasadas +
  // chave da última medição (refreshs da timeline re-disparam syncSelection
  // sem mudança real — não vale re-medir).
  let estTimer = null;
  let estSeq = 0;
  let ultimaChaveEst = "";

  // Texto do alerta persistente de contexto cheio (barra vermelha no rodapé).
  const ALERTA_CTX_CHEIO =
    "O contexto da IA encheu: a conversa e as peças ocupam quase todo o limite do modelo. " +
    "Novas mensagens não serão aceitas — desmarque peças na lista para liberar espaço " +
    "(elas saem do contexto na hora) ou comece uma nova conversa.";
  const ALERTA_TROCA_PROVEDOR =
    "Você trocou entre um modelo Claude e um Gemini no meio da conversa — o histórico de um " +
    "não é compatível com o outro (raciocínio assinado pelo provedor). Clique em ⟲ Nova " +
    "conversa para usar o novo modelo, ou volte ao modelo anterior nas opções.";

  const panel = PjePanel.mount();

  // ---------------------------------------------------------------------------
  // Contexto órfão: quando a extensão é atualizada/recarregada em
  // chrome://extensions, o content script antigo continua vivo na aba, mas
  // QUALQUER chamada a chrome.runtime/chrome.storage passa a lançar
  // "Extension context invalidated" (erro não capturável no console do
  // usuário). Todas as chamadas passam por estas guardas: silenciam o erro
  // e avisam UMA vez para recarregar a aba (F5 injeta o script novo).
  // ---------------------------------------------------------------------------
  const MSG_CTX_PERDIDO =
    "A extensão foi atualizada ou recarregada. Recarregue esta página (F5) para voltar a usar o assistente.";
  let contextoPerdido = false;
  function avisarContextoPerdido() {
    if (contextoPerdido) return;
    contextoPerdido = true;
    try {
      panel.setAlerta(MSG_CTX_PERDIDO);
      panel.lockInput(true);
    } catch {
      /* painel pode não existir mais — nada a fazer */
    }
  }
  function extensaoViva() {
    try {
      if (chrome.runtime && chrome.runtime.id) return true;
    } catch {
      /* no contexto órfão até LER chrome.runtime pode lançar */
    }
    avisarContextoPerdido();
    return false;
  }

  // Request/response com o worker (upload, contagem de tokens, capacidades).
  function rpc(msg) {
    return new Promise((resolve, reject) => {
      if (!extensaoViva()) return reject(new Error(MSG_CTX_PERDIDO));
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("sem resposta do serviço da extensão"));
          if (resp.error) return reject(new Error(resp.error));
          resolve(resp);
        });
      } catch {
        avisarContextoPerdido();
        reject(new Error(MSG_CTX_PERDIDO));
      }
    });
  }

  // Capacidades do modelo atual (limite de páginas, contexto, ferramentas web)
  // + id do modelo e nível de raciocínio ativos (mostrados no selo do rodapé).
  let modelCaps = null;
  let modelInfo = null; // {model, effort} da última resposta de caps

  // Reflete na UI o que o modelo atual suporta: selo do modelo ativo, nota de
  // citações textuais (Gemini) e a guarda de troca de provedor no meio da
  // conversa. Chamada sempre que modelCaps muda.
  function aplicarCapsNaUI() {
    if (!modelCaps) return;
    panel.setModelo(
      modelInfo && {
        model: modelInfo.model,
        effort: modelInfo.effort,
        comEffort: modelCaps.effort !== false,
      }
    );
    panel.setModoCitacoes(modelCaps.citacoesNativas === false ? "textual" : "nativa");
    // A biblioteca de modelos assume 1M tokens (a minuta manda os autos + vários
    // modelos): habilitada só nesses; nos menores (Haiku) a feature some.
    panel.setModelosHabilitado((modelCaps.contextTokens || 0) >= 1000000);
    const prov = modelCaps.provider || "anthropic";
    if (conversation.length && conversaProvider && prov !== conversaProvider) {
      panel.setAlerta(ALERTA_TROCA_PROVEDOR);
      alertaTrocaLigado = true;
    } else if (alertaTrocaLigado) {
      // voltou ao provedor da conversa: o alerta de troca se resolve sozinho
      panel.setAlerta(null);
      alertaTrocaLigado = false;
    }
  }

  function refreshCaps() {
    if (!extensaoViva()) return;
    try {
      chrome.runtime.sendMessage({ type: "caps" }, (r) => {
        void chrome.runtime.lastError; // worker pode estar acordando — sem ruído
        if (r && r.caps) {
          modelCaps = r.caps;
          modelInfo = { model: r.model, effort: r.effort };
          aplicarCapsNaUI();
        }
      });
    } catch {
      avisarContextoPerdido();
    }
  }
  refreshCaps();

  // Garante as capacidades ANTES de validar limites (o primeiro envio pode
  // chegar antes do refreshCaps inicial responder — a guarda ficaria muda).
  function garantirCaps() {
    if (modelCaps) return Promise.resolve();
    return new Promise((resolve) => {
      if (!extensaoViva()) return resolve();
      try {
        chrome.runtime.sendMessage({ type: "caps" }, (r) => {
          void chrome.runtime.lastError;
          if (r && r.caps) {
            modelCaps = r.caps;
            modelInfo = { model: r.model, effort: r.effort };
            aplicarCapsNaUI();
          }
          resolve(); // sem caps segue mesmo assim: count_tokens e a API guardam
        });
      } catch {
        avisarContextoPerdido();
        resolve();
      }
    });
  }

  // Estado da chave: mostra CTA de configuração quando ausente e reage a mudanças
  // (ex.: quando o usuário salva a chave pelo popup, sem recarregar a página).
  function refreshKey() {
    if (!extensaoViva()) return;
    try {
      // a chave exigida é a do PROVEDOR do modelo escolhido (Anthropic ou
      // Google) — o provedor sai do prefixo do id, sem esperar o caps chegar.
      // customPrompt pega carona na mesma leitura (evita um get a mais).
      chrome.storage.local.get(["apiKey", "geminiApiKey", "model", "customPrompt"], (v) => {
        customPrompt = (v.customPrompt || "").trim();
        const gemini = String(v.model || "").startsWith("gemini-");
        panel.setConfigured(gemini ? !!v.geminiApiKey : !!v.apiKey);
      });
    } catch {
      avisarContextoPerdido();
    }
  }
  refreshKey();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.apiKey || ch.geminiApiKey || ch.model)) refreshKey();
    // effort entra aqui por causa do selo do modelo (mostra o nível ativo)
    if (area === "local" && (ch.model || ch.apiKey || ch.geminiApiKey || ch.effort))
      refreshCaps();
    if (area === "local" && ch.customPrompt) {
      customPrompt = String(ch.customPrompt.newValue || "").trim();
      // o system mudou → a última medição de contexto não vale mais
      ultimaChaveEst = "";
    }
  });
  panel.onConfigure(() => {
    if (!extensaoViva()) return;
    try {
      chrome.runtime.sendMessage({ type: "openOptions" });
    } catch {
      avisarContextoPerdido();
    }
  });

  panel.onReset(() => {
    if (busy) return; // não zera no meio de uma resposta
    conversation = [];
    custoConversaUsd = 0;
    panel.setCusto(null);
    pecasNaConversa.clear();
    buscaNaConversa = false;
    conversaProvider = null; // conversa nova pode começar em qualquer provedor
    alertaTrocaLigado = false;
    clearTimeout(estTimer);
    estSeq++; // descarta estimativas em voo
    ultimaChaveEst = ""; // próxima seleção re-mede do zero
    panel.setContexto(null);
    panel.setAlerta(null);
    panel.clearMessages();
    refreshKey(); // re-renderiza CTA de chave se necessário
  });

  // "Ver na timeline": rola a página do PJe até a peça com destaque temporário
  // (PJE.scrollAte não clica em nada — zero efeito JSF, zero download).
  panel.onVerNaTimeline((id) => {
    if (!PJE.scrollAte(id)) {
      panel.setStatus(
        'A peça "' + metaDe(id).titulo +
          '" ainda não está na linha do tempo — use "⟳ Carregar todas as peças" (abaixo da lista) e tente de novo.'
      );
    }
  });

  // "Carregar todas as peças": rola a timeline do PJe até o fim pelo usuário
  // (o PJe carrega as peças sob demanda). O MutationObserver da timeline vai
  // repovoando a lista sozinho durante o processo; aqui só cuidamos do
  // feedback na dica. Sem guarda de busy: a rolagem não clica em nada (zero
  // efeito JSF) — é o mesmo gesto que o usuário faria à mão a qualquer hora.
  let carregandoTimeline = false;
  panel.onCarregarTimeline(async () => {
    if (carregandoTimeline) return;
    carregandoTimeline = true;
    try {
      const res = await PJE.carregarTimelineCompleta((n) =>
        panel.setTimelineTip({
          texto: "Carregando a linha do tempo… " + n + " peça(s) na lista.",
          carregando: true,
        })
      );
      panel.setTimelineTip({
        texto: res.completo
          ? "Linha do tempo completa: " + res.total + " peça(s) na lista."
          : res.total +
            " peça(s) na lista — a linha do tempo pode ter mais; clique de novo para continuar.",
      });
    } catch (e) {
      console.warn("[PJe IA] carregar timeline:", e);
      panel.setTimelineTip(null); // volta ao padrão; o botão segue disponível
    } finally {
      carregandoTimeline = false;
    }
  });

  // Preview no hover: fornece o conteúdo JÁ em cache (síncrono, nunca baixa —
  // download do PJe é serializado na sessão JSF e travaria a cada passada de
  // mouse). Cache-miss devolve null e o painel oferece o botão "Baixar".
  panel.onPreview((id) => docsCache.get(id) || null);

  // Botão "Baixar" do preview: idempotente e compartilhado com o envio (a
  // peça baixada aqui entra no docsCache que baixarSelecionadas reaproveita).
  panel.onPreviewBaixar(async (id) => {
    if (busy) throw new Error("aguarde a resposta atual terminar para abrir a peça");
    if (!docsCache.has(id)) docsCache.set(id, await PJE.baixar(id));
    return docsCache.get(id);
  });

  let docsIndex = new Map(); // id -> {id, titulo} (para chips e card de progresso)
  function refresh() {
    const docs = PJE.listarDocumentos();
    docsIndex = new Map(docs.map((d) => [d.id, d]));
    panel.setDocs(docs);
  }
  refresh();

  function metaDe(id) {
    return docsIndex.get(id) || { id, titulo: "Peça " + id };
  }

  // Anexa o observer à timeline. Se #divTimeLine ainda não existe (a página pode
  // renderizá-la após o document_idle), espera-a surgir e então observa.
  function attachTimelineObserver() {
    const tl = document.querySelector("#divTimeLine");
    if (!tl) return false;
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(refresh, 400);
    }).observe(tl, { childList: true, subtree: true });
    refresh();
    return true;
  }
  if (!attachTimelineObserver()) {
    const bodyObs = new MutationObserver(() => {
      if (attachTimelineObserver()) bodyObs.disconnect();
    });
    bodyObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Baixa as peças com concorrência limitada (3 por vez), com progresso por
  // peça no card de preparo (spinner -> check + barra de progresso).
  async function baixarSelecionadas(ids) {
    panel.startPrep(ids.map(metaDe));
    const queue = ids.slice();
    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        panel.setPrepState(id, "loading");
        if (!docsCache.has(id)) {
          try {
            docsCache.set(id, await PJE.baixar(id));
          } catch (e) {
            // identifica a peça pelo nome na mensagem de erro
            throw new Error('"' + metaDe(id).titulo + '" — ' + (e && e.message ? e.message : e));
          }
        }
        panel.setPrepState(id, "done");
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }

  // Sobe as peças PDF ainda sem file_id para a Files API (2 por vez). Falha de
  // upload não interrompe: a peça cai no fallback base64 (teto de 24 MB).
  async function subirPecas(ids) {
    const idProc = PJE.getIdProcesso() || "proc";
    // um fileId da Anthropic não serve num request Gemini (e vice-versa):
    // peça com upload de OUTRO provedor re-sobe para o provedor atual
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    const pend = ids.filter((id) => {
      const d = docsCache.get(id);
      return (
        d && d.kind === "pdf" && (!d.fileId || (d.fileProvider || "anthropic") !== provAtual)
      );
    });
    if (!pend.length) return;
    panel.setStatus("Enviando peças para análise…", true);
    const queue = pend.slice();
    async function w() {
      while (queue.length) {
        const id = queue.shift();
        const d = docsCache.get(id);
        try {
          const r = await rpc({
            type: "upload",
            payload: {
              filename: "peca-" + id + ".pdf",
              b64: d.b64,
              mime: "application/pdf",
              cacheKey: idProc + ":" + id + ":" + (d.size || 0),
            },
          });
          d.fileId = r.fileId;
          d.fileProvider = r.provider || "anthropic";
        } catch (e) {
          console.debug("[PJe IA] upload da peça", id, "falhou; usando base64:", e && e.message);
        }
      }
    }
    await Promise.all([w(), w()]);
  }

  // Soma as páginas de PDF das peças informadas (sem lançar erro).
  function paginasDe(ids) {
    let total = 0;
    for (const id of ids) {
      const d = docsCache.get(id);
      if (d && d.kind === "pdf") total += d.pages || 1;
    }
    return total;
  }

  // Bloqueia envios acima do limite de páginas de PDF por request do modelo
  // (600 nos modelos de 1M de contexto; 100 no Haiku). Conta SÓ as peças
  // ativas (selecionadas) — peça desmarcada sai do request e não conta mais.
  function guardaPaginas(ids) {
    if (!modelCaps) return 0;
    const total = paginasDe(ids);
    if (total > modelCaps.maxPages) {
      const dica =
        modelCaps.maxPages <= 100
          ? " Dica: o Haiku aceita só 100 páginas — nas opções da extensão, troque para o Sonnet 5 (até 600 páginas)."
          : "";
      throw new Error(
        "as peças selecionadas somam ~" + total + " páginas — acima do limite de " +
          modelCaps.maxPages + " páginas por análise deste modelo. Desmarque algumas peças e analise por partes." +
          dica
      );
    }
    return total;
  }

  // Pré-voo gratuito de tokens (count_tokens): estima o tamanho do contexto e
  // bloqueia acima de 90% da janela do modelo. Falha da estimativa não bloqueia.
  // IMPORTANTE: recebe as MESMAS tools/betas do turno — depois de uma busca, o
  // histórico contém blocos de ferramenta e o count_tokens sem as tools
  // declaradas seria rejeitado (o medidor e a guarda de 90% morreriam mudos).
  async function estimarContexto(messages, opts) {
    let r = null;
    try {
      const payload = {
        system: systemPromptAtual(),
        messages,
        betas: (opts && opts.betas) || BETAS_CHAT,
      };
      if (opts && opts.tools) payload.tools = opts.tools;
      r = await rpc({ type: "countTokens", payload });
    } catch (e) {
      // estimativa é opcional, mas a falha precisa ser diagnosticável (F12)
      console.debug("[PJe IA] count_tokens falhou:", (e && e.message) || e);
      return null;
    }
    if (!r || !r.tokens || !r.contextTokens) return null;
    const pct = Math.round((r.tokens / r.contextTokens) * 100);
    if (r.tokens > r.contextTokens * 0.9) {
      // desmarcar peça agora LIBERA contexto (o bloco sai do request) — a
      // orientação principal é desmarcar; nova conversa é o recomeço total.
      const err = new Error(
        "a conversa ocupa ~" + pct + "% do contexto da IA (" +
          Math.round(r.tokens / 1000) + " mil tokens) — não sobra espaço para a análise. " +
          "Desmarque peças na lista (elas saem do contexto na hora) ou clique em ⟲ (Nova conversa)."
      );
      err.ctxCheio = true;
      err.pct = pct;
      throw err;
    }
    return { tokens: r.tokens, ctxTokens: r.contextTokens, pct };
  }

  // A API rejeita citações reenviadas no histórico do assistant: além de
  // campos extras (ex.: file_id em page_location → 400 "Extra inputs are not
  // permitted"), ela REVALIDA os índices (document_index) contra o layout do
  // request atual — e com o anexo incremental (documentos novos entram em
  // mensagens posteriores) essa revalidação falha (400 "Invalid citation
  // indices: Document not found for placeholder citation"). O caminho robusto
  // é remover o campo `citations` dos blocos de texto antes de gravar no
  // histórico: bloco de texto sem citações é sempre válido, o texto integral
  // segue visível ao modelo e a UI mantém as citações renderizadas do turno.
  function sanearCitacoes(blocks) {
    return blocks.map((b) => {
      if (!b || b.type !== "text" || b.citations == null) return b;
      const semCit = Object.assign({}, b);
      delete semCit.citations;
      return semCit;
    });
  }

  // Remove breakpoints de cache antigos do histórico (a API aceita no máx. 4).
  function stripOldCacheControl() {
    for (const turn of conversation) {
      if (Array.isArray(turn.content)) {
        for (const block of turn.content) {
          if (block && block.cache_control) delete block.cache_control;
        }
      }
    }
  }

  // Monta os blocos das peças; marca o último com cache_control para que os
  // turnos seguintes reaproveitem o prefixo (economia de ~90% nos tokens).
  // O "title" nos blocos document permite ao modelo citar a peça pelo nome.
  // Cada bloco carrega __pecaId (campo INTERNO, removido em prepararEnvio antes
  // de qualquer request) — é o que permite desmarcar uma peça e liberá-la do
  // contexto de verdade, filtrando o bloco no reenvio do histórico.
  function montarBlocos(ids) {
    const blocks = [];
    let totalB64 = 0;
    // fileId só vale se o upload foi feito para o provedor ATUAL — um URI da
    // File API do Google num request Anthropic (ou o inverso) daria 400
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    for (const id of ids) {
      const d = docsCache.get(id);
      if (d.kind === "pdf") {
        if (d.fileId && (d.fileProvider || "anthropic") === provAtual) {
          // caminho normal: referência por file_id (Files API) — payload mínimo
          blocks.push({
            type: "document",
            source: { type: "file", file_id: d.fileId },
            title: metaDe(id).titulo,
            citations: { enabled: true },
            __pecaId: id,
          });
        } else {
          // fallback: base64 inline (upload indisponível)
          totalB64 += d.b64.length;
          blocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: d.b64 },
            title: metaDe(id).titulo,
            citations: { enabled: true },
            __pecaId: id,
          });
        }
      } else {
        // peças HTML viram documento de texto puro — também citáveis
        blocks.push({
          type: "document",
          source: { type: "text", media_type: "text/plain", data: d.text.slice(0, 60000) },
          title: metaDe(id).titulo,
          citations: { enabled: true },
          __pecaId: id,
        });
      }
    }
    const tetoB64 =
      provAtual === "gemini" ? MAX_TOTAL_B64_CHARS_GEMINI : MAX_TOTAL_B64_CHARS;
    if (totalB64 > tetoB64) {
      const mb = Math.round(totalB64 / 1024 / 1024);
      throw new Error(
        `as peças selecionadas somam ~${mb} MB — acima do limite da análise. Desmarque algumas peças maiores e tente de novo.`
      );
    }
    // Breakpoint de cache é conceito da Anthropic; o Gemini usa implicit
    // caching (automático) e o gemini.js nem copiaria o campo — mas não
    // sujar o histórico evita surpresas se o usuário voltar ao Claude.
    if (blocks.length && provAtual !== "gemini") {
      blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
    }
    return blocks;
  }

  // Prepara o histórico para envio: a API é STATELESS (o histórico inteiro é
  // remontado a cada request), então dá para filtrar os blocos document das
  // peças desmarcadas — desmarcar libera contexto de verdade, sem esperar
  // "Nova conversa". Regras:
  //  - `ativos` (Set de ids) mantém só as peças marcadas; null mantém todas.
  //  - o campo interno __pecaId NUNCA vai para a API (rejeitaria campo extra).
  //  - blocos do assistant (thinking assinado, ferramentas) não são tocados —
  //    só turnos de usuário carregam __pecaId.
  // Custo aceito: mudar a seleção invalida o cache de prefixo daquele ponto em
  // diante (mesma regra já aceita para o toggle de busca/troca de modelo).
  function prepararEnvio(msgs, ativos) {
    return msgs.map((t) => {
      if (!Array.isArray(t.content)) return t;
      const content = [];
      for (const b of t.content) {
        if (b && b.__pecaId != null) {
          if (ativos && !ativos.has(b.__pecaId)) continue; // peça desmarcada: fora do request
          const limpo = Object.assign({}, b);
          delete limpo.__pecaId;
          content.push(limpo);
        } else {
          content.push(b);
        }
      }
      return { role: t.role, content };
    });
  }

  // Abre um canal com o worker e resolve quando o turno termina.
  // Resolve com {content, stopReason}: os blocos completos da resposta
  // (necessários no histórico para citações, ferramentas e thinking assinado).
  //
  // AUTO-RESUME: o service worker pode MORRER no meio de um turno longo (o
  // MV3 mata o worker por várias razões, mesmo com keepalive; recarregar a
  // extensão também mata) — a porta cai sem "done"/"error". O turno é
  // STATELESS (o payload remonta tudo), então reconectamos e reenviamos
  // sozinhos, até 2 vezes: o prefixo já está no cache de prompt e a
  // repetição custa uma fração. handlers.onReinicio(n) zera a UI do turno
  // (o novo envio re-streama tudo desde o início).
  function stream(messages, handlers, opts, tipo) {
    const MAX_REENVIOS = 2;
    return new Promise((resolve, reject) => {
      let reenvios = 0;

      function abrir() {
        if (!extensaoViva()) return reject(new Error(MSG_CTX_PERDIDO));
        let port;
        try {
          port = chrome.runtime.connect({ name: "claude" });
        } catch {
          avisarContextoPerdido();
          return reject(new Error(MSG_CTX_PERDIDO));
        }
        let finished = false;
        let recuperando = false; // recuperação (watchdog OU onDisconnect) já disparada
        let cao = null; // timer do watchdog
        // Ping periódico: receber mensagem pela porta reseta o timer de
        // ociosidade do service worker (MV3 mata o worker após ~30 s sem
        // eventos — fatal em turnos longos, que ficam muito tempo em silêncio).
        const ping = setInterval(() => {
          try {
            port.postMessage({ type: "ping" });
          } catch {
            clearInterval(ping);
          }
        }, 15000);
        function limpar() {
          clearInterval(ping);
          clearTimeout(cao);
        }
        // Centraliza a reconexão: chamada pelo onDisconnect (o worker fechou a
        // porta) E pelo watchdog (porta aberta, worker zumbi). Como
        // port.disconnect() do NOSSO lado não dispara nosso onDisconnect, o
        // watchdog precisa chamar isto direto. `recuperando` evita disparo duplo.
        function recuperar(motivo) {
          if (finished || recuperando) return;
          recuperando = true;
          limpar();
          // worker morto no meio do turno: reenvia do zero (payload intacto)
          if (reenvios < MAX_REENVIOS && extensaoViva()) {
            reenvios++;
            console.debug(
              "[PJe IA] serviço " +
                (motivo === "watchdog" ? "sem resposta (watchdog)" : "caiu") +
                " no meio do turno — reenviando (" + reenvios + "/" + MAX_REENVIOS + ")"
            );
            if (handlers.onReinicio) handlers.onReinicio(reenvios);
            setTimeout(abrir, 1200); // respiro para o worker renascer
          } else {
            reject(new Error("conexão com o serviço interrompida — tente de novo"));
          }
        }
        // Watchdog do worker ZUMBI: o service worker MV3 pode parar de executar
        // com a porta AINDA aberta — aí nem onMessage nem onDisconnect chegam e o
        // turno ficaria preso para sempre ("processa, mas não navega"). O ping é
        // respondido com "pong" pelo worker VIVO (inclusive no meio de um turno
        // longo e silencioso); se passar WATCHDOG_MS sem NENHUMA mensagem (nem
        // pong, nem delta) tratamos como morto e reconectamos. 40 s dá folga
        // sobre o intervalo de ping de 15 s (2+ pongs perdidos) para não matar
        // um worker vivo porém quieto.
        const WATCHDOG_MS = 40000;
        function rearmarCao() {
          clearTimeout(cao);
          cao = setTimeout(() => {
            try {
              port.disconnect();
            } catch {}
            recuperar("watchdog");
          }, WATCHDOG_MS);
        }
        port.onMessage.addListener((m) => {
          rearmarCao(); // qualquer mensagem do worker = prova de vida
          if (m.type === "pong") return; // heartbeat: já rearmou o watchdog
          if (m.type === "delta") handlers.onDelta(m.text);
          else if (m.type === "thinking") handlers.onThinking(m.text);
          else if (m.type === "citation") handlers.onCitation && handlers.onCitation(m.citation);
          else if (m.type === "tool") handlers.onTool && handlers.onTool(m.name, m.input);
          else if (m.type === "file") handlers.onFile && handlers.onFile(m);
          else if (m.type === "trunc") handlers.onTrunc();
          // "iter": novo request físico do turno (checkpoint do texto na UI);
          // "retry": o worker vai re-tentar o request após erro transitório —
          // descartar o que chegou DEPOIS do último checkpoint (evita duplicar)
          else if (m.type === "iter") handlers.onIter && handlers.onIter();
          else if (m.type === "retry") handlers.onRetry && handlers.onRetry();
          else if (m.type === "done") {
            finished = true;
            limpar();
            port.disconnect();
            resolve({
              content: m.content || [],
              stopReason: m.stopReason || null,
              usage: m.usage || null,
              usageReq: m.usageReq || null,
              custoUsd: m.custoUsd == null ? null : m.custoUsd,
            });
          } else if (m.type === "error") {
            finished = true;
            limpar();
            port.disconnect();
            reject(new Error(m.error));
          }
        });
        port.onDisconnect.addListener(() => {
          if (finished) return limpar();
          recuperar("disconnect");
        });
        rearmarCao(); // arma o watchdog já na conexão
        port.postMessage({
          type: tipo || "chat",
          payload: Object.assign(
            { system: systemPromptAtual(), messages, betas: BETAS_CHAT },
            opts || {}
          ),
        });
      }

      abrir();
    });
  }

  // Dispara o download de um texto no navegador (Blob + âncora; sem a permissão
  // "downloads") — markdown do mapa mental e da minuta.
  function baixarTexto(filename, texto, mime) {
    const blob = new Blob([texto], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Rótulo humano de uma citação da API: "Peça, fl(s). X[–Y]" (fim exclusivo)
  // para PDFs; título do site (com link) para resultados da busca web;
  // para documentos de texto (char_location) não há página — sobra o trecho.
  // O `id` sai como campo PRÓPRIO (não colado no rótulo): é ele que o painel usa
  // para tornar a citação clicável (rola a timeline até a peça). O id vem de
  // graça no document_title, que é o `title` que montarBlocos enviou.
  function infoCitacao(c) {
    if (c.type === "web_search_result_location") {
      return { label: c.title || c.url || "fonte na web", url: c.url };
    }
    const bruto = String(c.document_title || "");
    const id = (bruto.match(/^(\d{6,})\s*-\s*/) || [])[1] || null;
    const doc = tituloLimpo(bruto) || "peça";
    if (c.type === "page_location") {
      const ini = c.start_page_number;
      const fim = (c.end_page_number || ini + 1) - 1;
      return {
        label: doc + (fim > ini ? ", fls. " + ini + "–" + fim : ", fl. " + ini),
        id,
      };
    }
    // char_location: sem página. O trecho citado é a única âncora disponível.
    const trecho = String(c.cited_text || "").replace(/\s+/g, " ").trim();
    return { label: doc, id, trecho: trecho.slice(0, 300) || undefined };
  }
  function tituloLimpo(t) {
    return String(t || "").replace(/^\d{6,}\s*-\s*/, "");
  }
  function chaveCitacao(c) {
    if (c.type === "web_search_result_location") return "web:" + (c.url || c.title || "");
    return [
      c.type,
      c.document_index,
      c.start_page_number != null ? c.start_page_number : c.start_char_index,
      c.end_page_number != null ? c.end_page_number : c.end_char_index,
    ].join(":");
  }

  // Ferramentas/betas do turno atual: busca web quando o toggle está ligado —
  // e, uma vez usada na conversa, nos turnos seguintes também (histórico com
  // blocos de ferramenta exige as tools declaradas, inclusive no count_tokens).
  function optsDoTurno() {
    const opts = {};
    if ((panel.isSearchOn() || buscaNaConversa) && modelCaps) {
      opts.tools = toolsBusca();
      opts.betas = BETAS_CHAT.concat(
        modelCaps.webFetch === "web_fetch_20250910" ? ["web-fetch-2025-09-10"] : []
      );
    }
    return opts;
  }

  // Baixa em silêncio (sem card de preparo) as peças que faltam no cache, com
  // concorrência 3 (a mesma do envio). Usado pela estimativa dinâmica: o
  // download de agora vira PREFETCH — o envio reaproveita o cache e fica mais
  // rápido. Falha em uma peça não interrompe (ela só fica fora da estimativa;
  // o envio tenta de novo com erro visível). onProgresso(feitas, total) deixa
  // o usuário ver o andamento em seleções grandes.
  async function baixarQuieto(ids, onProgresso) {
    const fila = ids.filter((id) => !docsCache.has(id));
    if (!fila.length) return;
    const total = fila.length;
    let feitas = 0;
    async function w() {
      while (fila.length) {
        const id = fila.shift();
        try {
          docsCache.set(id, await PJE.baixar(id));
        } catch (e) {
          console.debug("[PJe IA] estimativa: peça", id, "não baixou:", e && e.message);
        }
        feitas++;
        if (onProgresso) onProgresso(feitas, total);
      }
    }
    await Promise.all([w(), w(), w()]);
  }

  // ---------------------------------------------------------------------------
  // Medidor DINÂMICO de contexto em DUAS camadas — o clique não pode esperar
  // download nem rede:
  //  1) estimativa LOCAL instantânea (0 ms): heurística sobre o que já está em
  //     cache — PDF ≈ páginas × 2000 tokens (texto+imagem), texto ≈ chars/3,5.
  //     Atualiza a barrinha a cada clique e a cada peça baixada.
  //  2) refinamento PRECISO em segundo plano (debounce): baixa o que falta
  //     (prefetch p/ o envio), sobe PDFs à Files API (count e envio ficam
  //     leves, por file_id) e corrige o número com count_tokens (gratuito).
  // Alerta de contexto cheio só pela medição precisa (a local é aproximada).
  // ---------------------------------------------------------------------------
  const TOKENS_POR_PAGINA_PDF = 2000; // ordem de grandeza da API p/ PDF citável
  const CHARS_POR_TOKEN = 3.5;
  // Acima deste nº de peças AINDA NÃO baixadas, a medição em segundo plano não
  // dispara downloads (ex.: "todas" marcadas — o PJe ativa peça a peça de forma
  // serializada, levaria minutos). Fica a estimativa local parcial; a medição
  // completa acontece no envio, com o card de progresso visível.
  const LIMIAR_PREFETCH = 12;

  function estimativaLocalTokens(ids) {
    // system prompt + instruções fixas + instruções personalizadas do usuário
    let t = 900 + Math.ceil(customPrompt.length / CHARS_POR_TOKEN);
    // custo por página varia por provedor: Anthropic ≈ 2000 (texto+imagem
    // citável); Gemini = 258 (documentação oficial) — vem do caps
    const tokensPagina =
      (modelCaps && modelCaps.tokensPagina) || TOKENS_POR_PAGINA_PDF;
    for (const id of ids) {
      const d = docsCache.get(id);
      if (!d) continue; // ainda não baixada: entra quando o download chegar
      t +=
        d.kind === "pdf"
          ? (d.pages || 1) * tokensPagina
          : Math.ceil(Math.min(d.text.length, 60000) / CHARS_POR_TOKEN);
    }
    for (const turn of conversation) {
      if (typeof turn.content === "string") {
        t += Math.ceil(turn.content.length / CHARS_POR_TOKEN);
        continue;
      }
      for (const b of turn.content) {
        if (!b) continue;
        // blocos de peça: já contados acima (marcadas) ou fora do request
        if (b.__pecaId != null || b.type === "document") continue;
        if (b.type === "text") t += Math.ceil((b.text || "").length / CHARS_POR_TOKEN);
        else t += Math.ceil(JSON.stringify(b).length / 4); // thinking/ferramentas
      }
    }
    return t;
  }

  // Depois de um turno bem-sucedido, o usage do ÚLTIMO request físico é a
  // medição EXATA do contexto (entrada + cache + resposta que acabou de entrar
  // no histórico) — atualiza o medidor de graça, sem novo count_tokens.
  function atualizarGaugePosTurno(fim, ids) {
    const u = fim && fim.usageReq;
    if (!u || !modelCaps) return;
    const tokens =
      (u.input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0) +
      (u.output_tokens || 0);
    if (!tokens) return;
    panel.setContexto({
      tokens,
      ctxTokens: modelCaps.contextTokens,
      paginas: paginasDe(ids),
      maxPaginas: modelCaps.maxPages,
      pecas: ids.length,
    });
    // medição real deste estado: refreshs da timeline não precisam re-medir
    ultimaChaveEst = ids.slice().sort().join(",") + "|" + conversation.length;
  }

  function mostrarEstimativaLocal(ids) {
    if (!modelCaps) return;
    panel.setContexto({
      tokens: estimativaLocalTokens(ids),
      ctxTokens: modelCaps.contextTokens,
      paginas: paginasDe(ids),
      maxPaginas: modelCaps.maxPages,
      pecas: ids.length,
      // peças ainda sem download não têm medida — o gauge avisa em vez de
      // fingir precisão
      pendentes: ids.filter((id) => !docsCache.has(id)).length,
    });
  }

  panel.onSelectionChange((ids) => {
    clearTimeout(estTimer);
    // Durante um turno o ENVIO é dono do medidor: refreshs da timeline do PJe
    // disparam syncSelection sem mudança real e sobrescreveriam a medição
    // oficial com uma estimativa local defasada.
    if (busy) return;
    if (!ids.length && !conversation.length) {
      estSeq++; // cancela estimativas em voo
      panel.setContexto(null); // nada selecionado e nada conversado: sem medidor
      return;
    }

    // Camada 1: resposta IMEDIATA ao clique, com o que já se sabe localmente.
    if (modelCaps) mostrarEstimativaLocal(ids);
    else garantirCaps().then(() => !busy && mostrarEstimativaLocal(ids));

    // Camada 2: refinamento em segundo plano (downloads + uploads + count).
    estTimer = setTimeout(async () => {
      if (busy) return;
      // mesma seleção e mesma conversa da última medição precisa: pula
      const chave = ids.slice().sort().join(",") + "|" + conversation.length;
      if (chave === ultimaChaveEst) return;
      const seq = ++estSeq;
      try {
        await garantirCaps();
        const faltam = ids.filter((id) => !docsCache.has(id));
        if (faltam.length > LIMIAR_PREFETCH) {
          // seleção grande (ex.: "todas" marcadas): não dispara a tempestade
          // de downloads — estimativa parcial honesta, medição exata no envio
          mostrarEstimativaLocal(ids);
          panel.setStatus(
            "Estimativa parcial: " + faltam.length +
              " peça(s) ainda não baixadas — a medição completa acontece no envio."
          );
          return;
        }
        // baixa o que falta; a barrinha sobe a cada peça que chega
        await baixarQuieto(ids, (feitas, total) => {
          if (seq !== estSeq || busy) return;
          panel.setStatus("Medindo o contexto… baixando peças (" + feitas + "/" + total + ")", true);
          mostrarEstimativaLocal(ids);
        });
        if (seq !== estSeq || busy) return;
        // sobe os PDFs à Files API JÁ na medição: o count_tokens referencia
        // por file_id (payload mínimo) e o envio reaproveita o upload
        await subirPecas(ids);
        if (seq !== estSeq || busy) return;
        panel.setStatus("Calculando o tamanho exato do contexto…", true);

        // request PROSPECTIVO: histórico filtrado + um turno de rascunho com
        // as peças novas (as que ainda não têm blocos no histórico)
        const ativos = new Set(ids);
        const novas = ids.filter((id) => !pecasNaConversa.has(id) && docsCache.has(id));
        const rascunho = [...conversation];
        if (novas.length) {
          rascunho.push({
            role: "user",
            content: [...montarBlocos(novas), { type: "text", text: "…" }],
          });
        }
        const msgs = prepararEnvio(rascunho, ativos);
        if (!msgs.length) {
          panel.setStatus("");
          panel.setContexto(null);
          return;
        }

        const est = await estimarContexto(msgs, optsDoTurno());
        if (seq !== estSeq || busy) return;
        panel.setStatus("");
        if (est) {
          ultimaChaveEst = chave; // só memoriza medição que deu certo
          panel.setAlerta(null); // coube: alerta anterior se resolve sozinho
          panel.setContexto({
            tokens: est.tokens,
            ctxTokens: est.ctxTokens,
            paginas: paginasDe(ids),
            maxPaginas: modelCaps ? modelCaps.maxPages : 0,
            pecas: ids.length,
          });
        }
      } catch (e) {
        if (seq !== estSeq || busy) return;
        panel.setStatus("");
        if (e && e.ctxCheio) {
          ultimaChaveEst = ""; // com alerta ligado, a próxima mudança SEMPRE re-mede
          panel.setAlerta(ALERTA_CTX_CHEIO);
          alertaTrocaLigado = false; // o alerta visível agora é o de contexto
        } else {
          console.debug("[PJe IA] estimativa dinâmica falhou:", e && e.message);
        }
      }
    }, 900);
  });

  panel.onSend(async (text, selectedIds) => {
    if (busy) return;
    if (selectedIds.length === 0) {
      panel.setStatus("Marque ao menos uma peça — na lista acima ou digitando @ no campo.");
      return;
    }
    // Troca de provedor no meio da conversa: bloqueia ANTES de qualquer
    // mudança de estado (o histórico de um provedor não roda no outro).
    // aplicarCapsNaUI já liga o alerta na troca do modelo; esta é a guarda
    // dura para o caso de o envio chegar antes do refresh de caps.
    const provTurno = (modelCaps && modelCaps.provider) || "anthropic";
    if (conversation.length && conversaProvider && provTurno !== conversaProvider) {
      panel.setAlerta(ALERTA_TROCA_PROVEDOR);
      alertaTrocaLigado = true;
      return;
    }
    busy = true;
    clearTimeout(estTimer);
    estSeq++; // o envio faz a estimativa oficial — mata estimativas em voo

    // Anexo INCREMENTAL: só as peças que ainda não estão no histórico entram
    // neste turno. As já enviadas continuam valendo (fazem parte do prefixo
    // cacheado da conversa) — reanexá-las duplicaria páginas e tokens.
    const novas = selectedIds.filter((id) => !pecasNaConversa.has(id));
    const attach = novas.length > 0;
    // mostra na mensagem quais peças ENTRAM no contexto neste turno
    panel.addMessage(
      "user",
      text,
      attach ? novas.map((id) => metaDe(id).titulo) : null
    );
    panel.lockInput(true);
    panel.setStatus("");

    let assistantEl = null;
    let acc = "";
    let truncated = false;

    try {
      await garantirCaps(); // limites do modelo antes de qualquer validação
      let userContent;
      let paginas = 0;
      if (attach) {
        await baixarSelecionadas(novas);
        // a guarda conta o que VAI no request: só as peças ativas (marcadas)
        paginas = guardaPaginas(selectedIds);
        await subirPecas(novas);
        stripOldCacheControl();
        userContent = [...montarBlocos(novas), { type: "text", text }];
      } else {
        paginas = guardaPaginas(selectedIds);
        userContent = text;
      }

      // Busca de jurisprudência (ver optsDoTurno). Nunca combinamos ferramentas
      // web com code_execution no mesmo request (as versões _20260209 já
      // embutem execução para filtragem dinâmica).
      const opts = optsDoTurno();

      // O request de fato: histórico + turno novo, SEM os blocos das peças
      // desmarcadas (prepararEnvio filtra por __pecaId) e sem campos internos.
      const ativos = new Set(selectedIds);
      const msgsEnvio = prepararEnvio(
        [...conversation, { role: "user", content: userContent }],
        ativos
      );

      panel.setStatus("Estimando o tamanho do contexto…", true);
      const est = await estimarContexto(msgsEnvio, opts);
      if (attach) panel.endPrep(); // confirma "peças anexadas" após validar limites
      let infoCtx = "";
      if (est) {
        infoCtx = " (~" + Math.round(est.tokens / 1000) + " mil tokens, " + est.pct + "% do contexto)";
        panel.setAlerta(null); // coube: qualquer alerta anterior está resolvido
        panel.setContexto({
          tokens: est.tokens,
          ctxTokens: est.ctxTokens,
          paginas,
          maxPaginas: modelCaps ? modelCaps.maxPages : 0,
          pecas: selectedIds.length,
        });
      } else {
        // count_tokens falhou (ex.: 429 após muitos uploads): re-pinta com a
        // estimativa local — o cache agora tem todas as peças baixadas, então
        // o número é decente. Sem isto o medidor ficaria CONGELADO no retrato
        // de quando a seleção foi feita ("N peça(s) sem medir", 0%).
        mostrarEstimativaLocal(selectedIds);
      }

      conversation.push({ role: "user", content: userContent });
      for (const id of novas) pecasNaConversa.add(id);
      if (!conversaProvider) {
        conversaProvider = (modelCaps && modelCaps.provider) || "anthropic";
      }

      panel.setStatus("Analisando…" + infoCtx, true);
      assistantEl = panel.addMessage("assistant", "");
      // Citações deste turno: marcadores [n] entram no texto via placeholders
      // (área de uso privado do Unicode — sobrevivem intactos ao escape do
      // renderizador) e a lista numerada vai no rodapé da mensagem.
      const cites = [];
      let statusFerramenta = false; // há status de busca/ferramenta na tela
      const citeKeys = new Map();
      let thinkAcc = "";
      let ckpt = null; // estado da UI no início do request físico corrente
      const fim = await stream(msgsEnvio, {
        onDelta(delta) {
          // limpa o status inicial e também o de ferramenta (a busca acabou
          // quando o texto volta a fluir)
          if (!acc || statusFerramenta) {
            panel.setStatus("");
            statusFerramenta = false;
          }
          acc += delta;
          panel.updateAssistant(assistantEl, acc, cites);
        },
        onThinking(t) {
          if (t) {
            thinkAcc += t;
            panel.setThinking(assistantEl, thinkAcc);
          }
          if (!acc) panel.setStatus("Raciocinando sobre as peças…", true);
        },
        onCitation(c) {
          const k = chaveCitacao(c);
          let n = citeKeys.get(k);
          if (!n) {
            n = cites.length + 1;
            citeKeys.set(k, n);
            cites.push(infoCitacao(c));
          }
          acc += "\uE000" + n + "\uE001";
          panel.updateAssistant(assistantEl, acc, cites);
        },
        // Mostra a atividade da ferramenta SEMPRE (o modelo costuma escrever
        // "vou pesquisar…" antes de buscar — sem isso o usuário fica sem
        // nenhum sinal durante a busca). Com o input completo, mostra também
        // O QUE está sendo pesquisado/lido.
        onTool(name, input) {
          statusFerramenta = true;
          if (name === "web_search") {
            const q = input && input.query;
            panel.setStatus(
              q ? "Pesquisando jurisprudência: “" + q + "”…" : "Pesquisando jurisprudência na web…",
              true
            );
          } else if (name === "web_fetch") {
            let fonte = "";
            try {
              fonte = input && input.url ? new URL(input.url).hostname : "";
            } catch {}
            panel.setStatus(
              fonte ? "Lendo fonte: " + fonte + "…" : "Lendo página de fonte jurídica…",
              true
            );
          } else {
            panel.setStatus("Executando ferramenta…", true);
          }
        },
        onTrunc() {
          truncated = true;
        },
        // Checkpoint por request físico: em re-tentativa transitória do
        // worker, volta ao estado do início da iteração que falhou (o que já
        // chegou dela chegaria DE NOVO e duplicaria texto/citações na tela).
        onIter() {
          ckpt = {
            acc,
            think: thinkAcc,
            nCites: cites.length,
          };
        },
        onRetry() {
          if (ckpt) {
            acc = ckpt.acc;
            thinkAcc = ckpt.think;
            cites.length = ckpt.nCites;
            for (const [k, n] of citeKeys) if (n > ckpt.nCites) citeKeys.delete(k);
          } else {
            acc = "";
          }
          panel.updateAssistant(assistantEl, acc, cites);
          panel.setStatus("Instabilidade momentânea na API — tentando de novo…", true);
        },
        // O serviço da extensão morreu no meio: o turno recomeça DO ZERO
        // (novo stream re-emite tudo) — zera todo o estado acumulado da UI.
        onReinicio() {
          acc = "";
          thinkAcc = "";
          cites.length = 0;
          citeKeys.clear();
          ckpt = null;
          truncated = false;
          statusFerramenta = false;
          panel.updateAssistant(assistantEl, acc, cites);
          panel.setStatus("O serviço da extensão reiniciou — reenviando a análise…", true);
        },
      }, opts);
      registrarCusto(fim);

      if (acc.trim()) {
        // Preserva os blocos completos da resposta (não só o texto): a API
        // exige thinking assinado intacto e blocos de ferramenta/citações no
        // histórico dos turnos seguintes.
        conversation.push({
          role: "assistant",
          content:
            fim.content && fim.content.length
              ? sanearCitacoes(fim.content)
              : [{ type: "text", text: acc.replace(/\uE000\d+\uE001/g, "") }],
        });
        // turno gravado com tools declaradas \u2192 mant\u00EA-las at\u00E9 "Nova conversa"
        if (opts.tools) buscaNaConversa = true;
        atualizarGaugePosTurno(fim, selectedIds);
        let st = "";
        if (truncated)
          st = "A resposta atingiu o tamanho máximo — peça para continuar, se necessário.";
        if (fim.stopReason === "pause_turn") {
          // o teto de continuações do worker foi atingido com o servidor ainda
          // pausado (busca web muito longa): a resposta pode estar incompleta
          st = "A análise foi interrompida no limite de buscas — peça para continuar, se necessário.";
        }
        if (fim.stopReason === "model_context_window_exceeded") {
          // o modelo estourou a janela no meio da resposta: alerta persistente
          ultimaChaveEst = "";
          panel.setAlerta(ALERTA_CTX_CHEIO);
          alertaTrocaLigado = false; // o alerta visível agora é o de contexto
          st = "A resposta foi cortada: o limite de contexto do modelo foi atingido.";
        }
        panel.setStatus(st);

        // Oferta de editor. Toda resposta longa pode ser editada como
        // documento; quando o pedido foi claramente de uma peça redigida
        // (pareceMinuta), a oferta vira botão em destaque. A heurística NÃO
        // toca no request nem no system prompt — decide só a proeminência.
        const mdResposta = acc.replace(/\uE000\d+\uE001/g, "").trim();
        const destaque = pareceMinuta(text);
        if (destaque || mdResposta.length >= 400) {
          panel.adicionarAcaoEditor(assistantEl, {
            destaque,
            onAbrir: async (btn) => {
              if (btn) btn.disabled = true;
              try {
                const url = await guardarMinuta(mdResposta, tituloDaMinuta(mdResposta));
                window.open(url, "_blank", "noopener");
              } catch (err) {
                panel.setStatus(
                  "Não foi possível abrir o editor: " + (err && err.message ? err.message : err)
                );
              } finally {
                if (btn) btn.disabled = false;
              }
            },
          });
        }
      } else {
        // resposta vazia: não grava turno (evitaria content vazio no próximo request)
        panel.removeMessage(assistantEl);
        conversation.pop(); // remove o turno do usuário correspondente
        for (const id of novas) pecasNaConversa.delete(id); // peças saem junto
        // conversa esvaziou: o rótulo de provedor cai junto (senão um turno
        // futuro em OUTRO provedor herdaria o rótulo velho e a guarda de
        // troca deixaria passar um histórico misto)
        if (!conversation.length) conversaProvider = null;
        panel.setStatus("O modelo não retornou texto. Tente novamente.");
      }
    } catch (e) {
      panel.endPrep(true); // remove o card de preparo, se ainda estiver na tela
      panel.setStatus("Erro: " + (e && e.message ? e.message : e));
      // contexto cheio: além do erro no status, liga a barra de alerta
      // persistente — o usuário precisa AGIR (desmarcar peças ou recomeçar)
      if (e && e.ctxCheio) {
        ultimaChaveEst = "";
        panel.setAlerta(ALERTA_CTX_CHEIO);
        alertaTrocaLigado = false; // o alerta visível agora é o de contexto
      }
      // remove a bolha vazia do assistente, se houver
      if (assistantEl && !acc) panel.removeMessage(assistantEl);
      // desfaz o turno do usuário para permitir nova tentativa
      if (conversation.length && conversation[conversation.length - 1].role === "user") {
        conversation.pop();
      }
      for (const id of novas) pecasNaConversa.delete(id); // peças do turno desfeito
      // conversa esvaziou: o rótulo de provedor cai junto (ver ramo acima)
      if (!conversation.length) conversaProvider = null;
    } finally {
      busy = false;
      panel.lockInput(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Minuta: um turno de chat comum cuja resposta é o TEXTO de uma peça
  // (despacho, decisão, sentença…) em markdown. Como o mapa mental, não usa
  // tools, skills nem execução de código — por isso funciona em QUALQUER
  // modelo, Claude ou Gemini. O markdown vira HTML aqui (com o renderMd do
  // painel, que já escapa antes de formatar) e vai para chrome.storage.local,
  // de onde src/editor.html o abre para edição, cópia e exportação.
  // ---------------------------------------------------------------------------
  const INSTRUCAO_MINUTA_PADRAO =
    "Elabore a minuta do ato cabível neste momento do processo, com relatório, " +
    "fundamentação e dispositivo, indicando a origem de cada afirmação.";

  // Prescritivo pelo mesmo motivo do sufixo do mapa: modelos menores seguem
  // instruções ao pé da letra, e aqui o produto é um texto que vai circular
  // FORA da extensão — sem as regras de origem e de não-invenção, a minuta
  // chega ao gabinete sem como ser conferida.
  const SUFIXO_MINUTA =
    " Responda APENAS com o texto da minuta em Markdown, sem preâmbulo, sem comentário" +
    " final e sem blocos de código (sem cercas ```)." +
    " ESTRUTURA: uma única linha começando com # (o nome do ato — SENTENÇA, DECISÃO," +
    " DESPACHO, do que se tratar); depois as seções com ## (na sentença: I – Relatório," +
    " II – Fundamentação, III – Dispositivo; no despacho, texto corrido, sem seções)." +
    " PARÁGRAFOS: texto corrido em linguagem forense brasileira, impessoal e em terceira" +
    " pessoa. SEPARE CADA PARÁGRAFO POR UMA LINHA EM BRANCO — dois parágrafos colados em" +
    " linhas seguidas viram um só. Use **negrito** no dispositivo e no que for decisivo." +
    " TABELAS: quando a informação for tabular (partes e qualificação, linha do tempo dos" +
    " atos, valores, provas), APRESENTE-A EM TABELA Markdown — cabeçalho, a linha de" +
    " separação com hifens (| --- | --- |) e uma coluna final \"Origem\". Use listas" +
    " numeradas (1. 2. 3.) para enumerar pedidos, requisitos ou provas." +
    " ORIGEM OBRIGATÓRIA: toda afirmação sobre os autos leva a referência entre parênteses," +
    " no formato (Título da peça, id 123456, fl. 7) — o id é o número que abre o título de" +
    " cada peça na lista abaixo e a folha é a do PDF daquela peça. Sem folha identificável," +
    " use (Título da peça, id 123456)." +
    " NUNCA invente nome de parte, número de processo, data, valor, dispositivo legal ou" +
    " precedente: se algo necessário não constar das peças anexadas, escreva no lugar" +
    " [COMPLETAR: o que falta], para quem for assinar preencher." +
    " NÃO assine, não date e não crie cabeçalho de tribunal, vara ou comarca — isso o" +
    " sistema do PJe já acrescenta.";

  // Quando o usuário escolhe uma categoria de modelos (biblioteca MLIB), TODAS
  // as peças-modelo daquela espécie (o painel já aplica o teto) entram no
  // request da minuta como MOLDURA de FORMA — nunca de conteúdo. Vai como bloco
  // de texto e é o PRIMEIRO do content (antes das peças), para ficar no prefixo
  // cacheado. A regra anti-contaminação é dura de propósito: os modelos são de
  // OUTROS processos e trazem nomes, valores e datas que NÃO podem vazar para a
  // minuta. A IA escolhe a base mais adequada e pode aproveitar estrutura e
  // linguajar das outras. XML (não Markdown) porque o conteúdo interno é
  // Markdown — a tag é a única fronteira que o modelo não confunde com a
  // resposta. Tags <modelo…> acidentais no texto do usuário são removidas para
  // não quebrar a moldura.
  function molduraModelos(modelos) {
    if (!Array.isArray(modelos) || !modelos.length) return null;
    const limpar = (t) => String(t).replace(/<\/?modelos?(_de_referencia)?\b[^>]*>/gi, "");
    const partes = modelos.map((m, i) => {
      const cat = m.categoria ? ' categoria="' + String(m.categoria).replace(/"/g, "") + '"' : "";
      const tit = m.titulo ? ' titulo="' + String(m.titulo).replace(/"/g, "'") + '"' : "";
      return '<modelo n="' + (i + 1) + '"' + cat + tit + ">\n" + limpar(m.texto) + "\n</modelo>";
    });
    const varios = modelos.length > 1;
    const intro = varios
      ? "Os " + modelos.length + " blocos <modelo> abaixo são peças-modelo da MESMA " +
        "espécie que o usuário cadastrou. ANALISE todos, escolha como base o que melhor " +
        "se ajusta a este caso e aproveite a ESTRUTURA, a ordem das seções, o fraseado e " +
        "o tom forense — inclusive combinando trechos de LINGUAGEM (fórmulas de praxe, " +
        "conectivos, jargão) de mais de um. Eles são de OUTROS processos.\n"
      : "O bloco <modelo> abaixo é uma peça-modelo que o usuário cadastrou para você " +
        "imitar a FORMA: a estrutura das seções, a ordem, o fraseado e o tom forense. " +
        "Ela é de OUTRO processo.\n";
    return {
      type: "text",
      text:
        "<modelos_de_referencia>\n" +
        intro +
        "REGRA ABSOLUTA: não copie NENHUM fato dos modelos — nomes de partes, números, " +
        "datas, valores, endereços, dispositivos legais, fundamentos ou trechos " +
        "específicos do caso. Aproveite só a forma e a linguagem. Todo o conteúdo da " +
        "minuta sai EXCLUSIVAMENTE das peças deste processo, anexadas em seguida. Se um " +
        "modelo trouxer um dado que não conste dessas peças, use [COMPLETAR: …] no lugar. " +
        "Os modelos são a forma; os autos são o conteúdo.\n" +
        partes.join("\n") +
        "\n</modelos_de_referencia>",
    };
  }

  panel.onMinuta(async (text, selectedIds, modelos) => {
    if (busy) return;
    if (selectedIds.length === 0) {
      panel.setStatus("Marque as peças que devem embasar a minuta.");
      return;
    }
    busy = true;
    panel.lockInput(true);

    const instrucao = (text && text.trim()) || INSTRUCAO_MINUTA_PADRAO;
    const molduraBloco = molduraModelos(modelos);
    const catModelos =
      molduraBloco && typeof MLIB !== "undefined"
        ? MLIB.rotuloCategoria(modelos[0].categoria)
        : "";
    panel.addMessage(
      "user",
      "📝 Gerar minuta: " +
        instrucao +
        (molduraBloco
          ? "\n\n📚 Seguindo " + modelos.length + " modelo(s) de referência" +
            (catModelos ? " — " + catModelos : "")
          : ""),
      selectedIds.map((id) => metaDe(id).titulo)
    );
    let assistantEl = null;
    let acc = "";
    let ckptMinuta = ""; // texto na UI no início do request físico corrente

    try {
      await baixarSelecionadas(selectedIds);
      guardaPaginas(selectedIds);
      await subirPecas(selectedIds);
      const blocos = montarBlocos(selectedIds);
      panel.endPrep();

      panel.setStatus("Redigindo a minuta a partir das peças marcadas…", true);
      assistantEl = panel.addMessage("assistant", "");

      // Request ISOLADO, como o mapa mental: não entra em conversation nem em
      // pecasNaConversa — gerar uma minuta não altera a conversa em andamento.
      // A moldura do modelo (se houver) é o PRIMEIRO bloco: fica antes das
      // peças, no prefixo cacheado, e o reforço na instrução volta a amarrar
      // "forma do modelo, fatos das peças".
      const reforcoModelo = molduraBloco
        ? " Baseie a FORMA (estrutura, seções, linguagem) nos modelos de referência" +
          " fornecidos no início — escolhendo o mais adequado e aproveitando o linguajar" +
          " dos demais —, mas com os FATOS exclusivamente das peças deste processo."
        : "";
      const messages = prepararEnvio(
        [
          {
            role: "user",
            content: [
              ...(molduraBloco ? [molduraBloco] : []),
              ...blocos,
              {
                type: "text",
                // A lista de peças vai explícita no texto (além do title de
                // cada bloco document) porque o id é OBRIGATÓRIO na origem de
                // cada afirmação: é por ele que se reencontra a peça na
                // timeline do PJe.
                text:
                  instrucao +
                  SUFIXO_MINUTA +
                  reforcoModelo +
                  " Peças anexadas, use exatamente estes ids: " +
                  selectedIds.map((id) => metaDe(id).titulo).join("; ") +
                  ".",
              },
            ],
          },
        ],
        null
      );

      const fimMinuta = await stream(messages, {
        onDelta(delta) {
          acc += delta;
          panel.updateAssistant(assistantEl, acc);
        },
        onThinking() {
          if (!acc) panel.setStatus("Planejando a estrutura do ato…", true);
        },
        onTool() {},
        onTrunc() {},
        onIter() {
          ckptMinuta = acc;
        },
        onRetry() {
          acc = ckptMinuta;
          panel.updateAssistant(assistantEl, acc);
          panel.setStatus("Instabilidade momentânea na API — tentando de novo…", true);
        },
        onReinicio(n) {
          acc = "";
          ckptMinuta = "";
          panel.updateAssistant(assistantEl, acc);
          panel.setStatus(
            "O serviço da extensão reiniciou — refazendo a minuta (tentativa " + (n + 1) + ")…",
            true
          );
        },
      });
      registrarCusto(fimMinuta);

      const md = limparMarkdownMinuta(acc);
      if (!md) {
        panel.setStatus("O modelo não devolveu a minuta — tente gerar novamente.");
        if (assistantEl) panel.removeMessage(assistantEl);
        return;
      }

      const url = await guardarMinuta(md, tituloDaMinuta(md));
      const idProc = PJE.getIdProcesso();
      const nomeMd = ("minuta" + (idProc ? "-processo-" + idProc : "") + ".md").replace(
        /[^\w.\-]+/g,
        "-"
      );

      panel.mostrarCardMinuta(assistantEl, {
        md,
        resumo: resumoDaMinuta(md),
        // A aba abre no CLIQUE, não sozinha: a resposta demora e o gesto do
        // usuário no "Gerar" já expirou — abrir aqui cairia no bloqueador de
        // pop-ups. window.open de URL da extensão é navegação de topo, imune à
        // CSP do tribunal (mesmo truque do "Abrir em nova aba" do preview).
        onAbrir: () => window.open(url, "_blank", "noopener"),
        onBaixar: () => baixarTexto(nomeMd, md, "text/markdown;charset=utf-8"),
      });
      panel.setStatus("");
    } catch (e) {
      panel.endPrep(true);
      panel.setStatus("Erro: " + (e && e.message ? e.message : e));
      if (assistantEl && !acc) panel.removeMessage(assistantEl);
    } finally {
      busy = false;
      panel.lockInput(false);
    }
  });

  // --- Rascunhos de minuta -----------------------------------------------
  // Ficam em chrome.storage.local — e não em session, como o mapa — porque o
  // ponto do recurso é reabrir a minuta depois, inclusive noutro dia. Isso põe
  // trecho dos autos NO DISCO: a poda dupla (10 mais recentes e nada acima de
  // 7 dias) e o botão "Descartar" do editor existem por causa disso.
  const MAX_MINUTAS = 10;
  const VALIDADE_MINUTA_MS = 7 * 24 * 60 * 60 * 1000;

  function guardarMinuta(md, titulo) {
    return new Promise((resolve, reject) => {
      const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
      const chave = "minuta:" + id;
      let processo = "";
      try {
        processo = PJE.getNumeroProcesso() || "";
      } catch (e) {}
      const registro = {
        // Guarda o Markdown CRU: a página do editor (src/editor.html) o converte
        // com o MinutaMd — parser dedicado que faz listas aninhadas, tabelas com
        // alinhamento e parágrafos de verdade (o renderMd do chat achataria).
        // O HTML editado é gravado de volta pelo próprio editor a cada mudança.
        md,
        titulo: titulo || "Minuta",
        processo,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      };
      chrome.storage.local.set({ [chave]: registro }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        podarMinutas();
        resolve(chrome.runtime.getURL("src/editor.html?id=" + encodeURIComponent(id)));
      });
    });
  }

  function podarMinutas() {
    chrome.storage.local.get(null, (tudo) => {
      if (chrome.runtime.lastError || !tudo) return;
      const limite = Date.now() - VALIDADE_MINUTA_MS;
      const quando = (k) => (tudo[k] && tudo[k].atualizadoEm) || 0;
      const chaves = Object.keys(tudo).filter((k) => k.indexOf("minuta:") === 0);
      const vencidas = chaves.filter((k) => quando(k) < limite);
      const vivas = chaves
        .filter((k) => vencidas.indexOf(k) === -1)
        .sort((a, b) => quando(b) - quando(a));
      const remover = vencidas.concat(vivas.slice(MAX_MINUTAS));
      if (remover.length) chrome.storage.local.remove(remover);
    });
  }

  // Tira a cerca ``` que alguns modelos põem em volta do markdown e o
  // preâmbulo antes do primeiro título. Mesmo papel do limparMarkdownMapa.
  function limparMarkdownMinuta(txt) {
    let t = String(txt || "").trim();
    const cerca = t.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
    if (cerca) t = cerca[1].trim();
    const i = t.search(/^#{1,3}\s+/m);
    if (i > 0) t = t.slice(i);
    return t.trim();
  }

  // O nome do ato (linha do #) vira o título do documento e o nome do arquivo.
  function tituloDaMinuta(md) {
    const m = String(md || "").match(/^#\s+(.+)$/m);
    const t = m ? m[1].replace(/[*_`]/g, "").trim() : "";
    return t ? t.slice(0, 80) : "Minuta";
  }

  function resumoDaMinuta(md) {
    const linhas = md.split(/\r?\n/);
    const secoes = linhas.filter((l) => /^##\s+/.test(l)).length;
    const paragrafos = linhas.filter((l) => l.trim() && !/^[#>|\-*\d]/.test(l.trim())).length;
    return (secoes ? secoes + " seção(ões) · " : "") + paragrafos + " parágrafo(s)";
  }

  // Heurística de intenção — a primeira do projeto. É deliberadamente
  // inofensiva: NÃO muda o request nem o system prompt, só decide se a oferta
  // de editor ao fim de uma resposta de chat aparece em destaque. Falso
  // negativo custa um clique a mais; falso positivo, um botão a mais.
  const MINUTA_VERBO =
    /\b(minut\w*|elabor\w*|redij\w*|redig\w*|escrev\w*|prepar\w*|fa[cç]\w*|gere|gerar|produz\w*)\b/i;
  const MINUTA_ESPECIE =
    /\b(despacho|senten[çc]a|decis[ãa]o|voto|ac[óo]rd[ãa]o|of[íi]cio|mandado|alvar[áa]|termo|parecer|promo[çc][ãa]o|cota|minuta|peti[çc][ãa]o|contesta[çc][ãa]o|r[ée]plica|recurso|apela[çc][ãa]o|embargos|agravo|alega[çc][õo]es|relat[óo]rio)\b/i;
  const MINUTA_VETO = /\b(resum\w*|explic\w*|quais|qual|quando|quanto|liste|listar|analis\w*)\b/i;
  function pareceMinuta(t) {
    const s = String(t || "");
    return MINUTA_VERBO.test(s) && MINUTA_ESPECIE.test(s) && !MINUTA_VETO.test(s);
  }

  // ---------------------------------------------------------------------------
  // Mapa mental (markmap): um turno de chat comum cuja resposta é markdown
  // hierárquico. Não usa tools, skills nem code execution — por isso funciona
  // em qualquer modelo, Claude ou Gemini. O markdown vai para o
  // worker (storage.session) e a página src/mapa.html desenha o mapa.
  // ---------------------------------------------------------------------------
  const INSTRUCAO_MAPA_PADRAO =
    "Mapeie o processo: partes e representantes, síntese dos fatos, pedidos, teses de cada " +
    "parte, provas produzidas, decisões proferidas e situação atual do feito.";

  // Prescritivo pelo mesmo motivo do SUFIXO_MINUTA: modelos menores (Haiku)
  // seguem instruções ao pé da letra, e o parser de src/mapa.js só entende
  // títulos e listas — preâmbulo, tabela ou bloco de código estragariam o mapa.
  const SUFIXO_MAPA =
    " Responda APENAS com o mapa em Markdown, sem nenhum texto antes ou depois e sem blocos" +
    " de código." +
    " ESTRUTURA: uma única linha começando com # (o processo e seu número); em seguida as" +
    " seções com ##, sempre NESTA ORDEM da análise processual, incluindo só as que os autos" +
    " permitirem: Partes e representação; Fatos (cronológicos); Pedidos; Teses e defesa;" +
    " Provas; Audiências; Decisões (cronológicas); Recursos; Prazos; Situação atual. Dentro de" +
    " cada seção, itens com \"-\", aninhados por indentação de dois espaços e no máximo três" +
    " níveis. Cada item é um rótulo curto (até cerca de 12 palavras), não uma frase completa." +
    " ORIGEM OBRIGATÓRIA: todo item que afirme algo dos autos TERMINA com a referência entre" +
    " parênteses, no formato (Título da peça, id 123456, fl. 7) — o id é o número que abre o" +
    " título de cada peça na lista abaixo e a folha é a do PDF daquela peça. Sem folha" +
    " identificável, use (Título da peça, id 123456). NUNCA invente id, folha, data ou valor." +
    " RECURSOS: use **negrito** no rótulo do item e ==destaque== no que for decisivo; quando a" +
    " informação for tabular (partes, linha do tempo, valores, prazos), use UMA tabela Markdown" +
    " na seção correspondente, com no máximo 3 colunas e células curtas. NÃO use emojis," +
    " imagens, HTML, fórmulas nem numeração de tópicos.";

  panel.onMapa(async (text, selectedIds) => {
    if (busy) return;
    if (selectedIds.length === 0) {
      panel.setStatus("Marque as peças que devem embasar o mapa mental.");
      return;
    }
    busy = true;
    panel.lockInput(true);

    const instrucao = (text && text.trim()) || INSTRUCAO_MAPA_PADRAO;
    panel.addMessage(
      "user",
      "🧠 Gerar mapa mental: " + instrucao,
      selectedIds.map((id) => metaDe(id).titulo)
    );
    let assistantEl = null;
    let acc = "";
    let ckptMapa = ""; // texto na UI no início do request físico corrente

    try {
      await baixarSelecionadas(selectedIds);
      guardaPaginas(selectedIds);
      await subirPecas(selectedIds);
      const blocos = montarBlocos(selectedIds);
      panel.endPrep();

      panel.setStatus("Montando o mapa mental a partir das peças marcadas…", true);
      assistantEl = panel.addMessage("assistant", "");

      // Request ISOLADO, como a minuta: não entra em conversation nem em
      // pecasNaConversa — o anexo incremental e o histórico do chat seguem
      // intactos, e gerar um mapa não muda a conversa em andamento.
      const messages = prepararEnvio(
        [
          {
            role: "user",
            content: [
              ...blocos,
              {
                type: "text",
                // A lista de peças vai explícita no texto (além do title de
                // cada bloco document) porque o id é OBRIGATÓRIO na origem de
                // cada tópico: é por ele que o usuário reencontra a peça na
                // timeline do PJe.
                text:
                  instrucao +
                  SUFIXO_MAPA +
                  " Peças anexadas, use exatamente estes ids: " +
                  selectedIds.map((id) => metaDe(id).titulo).join("; ") +
                  ".",
              },
            ],
          },
        ],
        null
      );

      const fimMapa = await stream(messages, {
        onDelta(delta) {
          acc += delta;
          panel.updateAssistant(assistantEl, acc);
        },
        onThinking() {
          if (!acc) panel.setStatus("Organizando os eixos do mapa…", true);
        },
        onTool() {},
        onTrunc() {},
        onIter() {
          ckptMapa = acc;
        },
        onRetry() {
          acc = ckptMapa;
          panel.updateAssistant(assistantEl, acc);
          panel.setStatus("Instabilidade momentânea na API — tentando de novo…", true);
        },
        onReinicio(n) {
          acc = "";
          ckptMapa = "";
          panel.updateAssistant(assistantEl, acc);
          panel.setStatus(
            "O serviço da extensão reiniciou — refazendo o mapa (tentativa " + (n + 1) + ")…",
            true
          );
        },
      });
      registrarCusto(fimMapa);

      const md = limparMarkdownMapa(acc);
      if (!md) {
        panel.setStatus("O modelo não devolveu o mapa — tente gerar novamente.");
        if (assistantEl) panel.removeMessage(assistantEl);
        return;
      }

      const idProc = PJE.getIdProcesso();
      const titulo = "Processo" + (idProc ? " " + idProc : "");
      const { id } = await rpc({
        type: "guardarMapa",
        payload: { md, titulo, processo: idProc || "" },
      });
      const url = chrome.runtime.getURL("src/mapa.html?id=" + encodeURIComponent(id));
      const nomeMd = ("mapa-mental" + (idProc ? "-processo-" + idProc : "") + ".md").replace(
        /[^\w.\-]+/g,
        "-"
      );

      panel.mostrarCardMapa(assistantEl, {
        md,
        resumo: resumoDoMapa(md),
        // A aba abre no CLIQUE, não sozinha: a resposta demora e o gesto do
        // usuário no "Gerar" já expirou — abrir aqui cairia no bloqueador de
        // pop-ups. window.open de URL da extensão é navegação de topo, imune à
        // CSP do tribunal (mesmo truque do "Abrir em nova aba" do preview).
        onAbrir: () => window.open(url, "_blank", "noopener"),
        onBaixar: () => baixarTexto(nomeMd, md, "text/markdown;charset=utf-8"),
      });
      panel.setStatus("");
    } catch (e) {
      panel.endPrep(true);
      panel.setStatus("Erro: " + (e && e.message ? e.message : e));
      if (assistantEl && !acc) panel.removeMessage(assistantEl);
    } finally {
      busy = false;
      panel.lockInput(false);
    }
  });

  // Tira a cerca ``` que alguns modelos colocam em volta do markdown, mesmo
  // instruídos a não fazê-lo, e o preâmbulo antes do primeiro título.
  function limparMarkdownMapa(txt) {
    let t = String(txt || "").trim();
    const cerca = t.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
    if (cerca) t = cerca[1].trim();
    const i = t.search(/^#{1,2}\s+/m);
    if (i > 0) t = t.slice(i);
    return t.trim();
  }

  // "5 eixos · 34 tópicos" para o card — contagem barata por regex (o parser
  // de verdade vive na página do mapa).
  function resumoDoMapa(md) {
    const linhas = md.split(/\r?\n/);
    const eixos = linhas.filter((l) => /^##\s+/.test(l)).length;
    const itens = linhas.filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l)).length;
    return eixos + " eixo(s) · " + itens + " tópico(s)";
  }

  } // fim de iniciar()

  // Bootstrap: monta o painel só em telas de autos do PJe. Em apps de página
  // única (frontend novo do PJe) a timeline pode surgir bem depois do load —
  // o observer fica atento até ela aparecer (custo desprezível: um
  // querySelector por lote de mutações).
  if (document.querySelector("#divTimeLine")) {
    iniciar();
  } else {
    const boot = new MutationObserver(() => {
      if (document.querySelector("#divTimeLine")) {
        boot.disconnect();
        iniciar();
      }
    });
    boot.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
