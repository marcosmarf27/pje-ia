// Orquestra o painel: lista documentos, baixa peças marcadas, mantém a conversa
// e faz streaming da resposta do Claude (via Port com o service worker).
(function () {
  if (window.__pjeIaLoaded) return;
  window.__pjeIaLoaded = true;

  // SÓ no documento de topo. O guard acima é por CONTEXTO, e todo iframe é um
  // contexto novo — sem esta linha o content script se injetaria também dentro
  // dos iframes da página. Isso importa desde que `PJE.listarPelaGrid` passou a
  // abrir um iframe com a PRÓPRIA URL dos autos: lá dentro existe #divTimeLine,
  // então um painel inteiro (com observers, porta para o worker e requisição de
  // caps) seria montado num frame invisível a cada leitura da grid. Vale também
  // para os iframes do próprio PJe: o painel só faz sentido na janela de topo.
  if (window.top !== window.self) return;

  // O content script roda em QUALQUER página *.jus.br (matches do manifest),
  // mas a maioria não é uma tela de autos do PJe (login SSO, portais,
  // consultas públicas…). Todo o boot do painel vive em iniciar(), chamada
  // uma única vez quando a timeline de autos (#divTimeLine) existe — sem ela,
  // nada é injetado no DOM da página. O bootstrap fica no fim do arquivo.
  function iniciar() {

  // Tribunal do processo aberto, derivado da URL (pje1g.trf5.jus.br → trf5.jus.br).
  // Fica AQUI, no topo, e NÃO junto da lista de domínios lá embaixo: o system
  // prompt logo abaixo o consome, e um `const` declarado depois disso lançaria
  // "Cannot access before initialization" já na montagem — a zona morta temporal
  // que já derrubou o painel inteiro uma vez (ver CLAUDE.md, "Desenvolvimento").
  const TRIBUNAL_DO_PROCESSO = (() => {
    const raiz = location.hostname.split(".").slice(-3).join(".");
    return /\.jus\.br$/.test(raiz) ? raiz : null;
  })();

  // A tela do PJe morreu debaixo de nós (view JSF expirada — ver o bloco DIAG em
  // pje.js). Fica no TOPO junto do resto do estado lido por callback: quem a lê é
  // o worker de `baixarSelecionadas`, registrado centenas de linhas antes das
  // declarações do meio do arquivo (zona morta temporal).
  //
  // Depois que a view morre, cada peça restante é só mais um POST que produz
  // erro: parar e DIZER o motivo é a diferença entre um susto e o usuário
  // achando que a extensão travou.
  let telaMorta = false;

  // Progresso da leitura da grid ("página 7 de 14"), para a recusa de `ocupadoJsf`
  // dizer QUANTO falta em vez de só negar. Mesma razão de estar no topo.
  let progressoGrid = "";

  // Trechos comuns do system prompt; a parte de CITAÇÕES varia por provedor:
  // a Anthropic gera citações estruturadas por página (citations API); o
  // Gemini não tem esse recurso — o modelo é instruído a citar a peça e a
  // página NO PRÓPRIO texto (caps.citacoesNativas === false).
  // A identificação da peça (nome + id) vive no trecho COMPARTILHADO porque é
  // requisito do produto nos dois provedores: o id é o número que abre o título
  // de cada peça e é por ele que o usuário reencontra a peça na timeline do PJe
  // (mesma convenção do SUFIXO_MAPA e do SUFIXO_MINUTA).
  //
  // PARTIDO em três porque a MINUTA precisa de uma variante (ver systemMinuta):
  // a frase da FONTE, escrita para o chat, dizia ao modelo para se basear
  // "SOMENTE nos documentos anexados (peças selecionadas pelo usuário)" — e as
  // peças-modelo da biblioteca NÃO são peça selecionada. Havia, portanto, uma
  // regra no system mandando ignorá-las, contra a moldura <modelos_de_referencia>
  // que pedia o contrário: era o candidato mais forte para "a minuta não seguiu
  // os meus modelos". Na minuta ela vira uma frase que separa os dois eixos —
  // conteúdo dos autos, forma dos modelos.
  //
  // O `PROMPT_INICIO` do chat é reconstruído na ordem original logo abaixo, e
  // como `join(" ")` sobre arrays concatenados é associativo, ele sai byte a
  // byte o de antes (o teste de regressão do chat trava isso).
  const PROMPT_PAPEL = [
    "Você é um assistente jurídico que analisa autos de processos do PJe.",
    "Responda sempre em português do Brasil.",
  ];
  const PROMPT_FONTE_CHAT = [
    "Baseie-se SOMENTE nos documentos anexados (peças selecionadas pelo usuário).",
  ];
  const PROMPT_FONTE_MINUTA = [
    "O CONTEÚDO do ato — fatos, nomes, datas, valores, pedidos, fundamentos — sai",
    "EXCLUSIVAMENTE das peças anexadas deste processo e da linha do tempo dele.",
    "Se a mensagem trouxer peças-modelo, elas são de OUTROS processos e servem",
    "apenas de referência de FORMA (estrutura, seções, fraseado, tom): siga a",
    "forma delas e não aproveite nenhum fato delas.",
  ];
  const PROMPT_RASTREIO = [
    "Toda afirmação sobre os autos precisa ser rastreável até a peça de origem.",
    "Cada peça anexada tem um id — o número que abre o seu título (em",
    "'123456 - Contestação', o id é 123456) — e é por ele que o usuário reencontra",
    "a peça na linha do tempo do processo. NUNCA invente id, folha, data ou valor.",
    // Divergência entre peças é o DADO da análise processual, não ruído a ser
    // resolvido: o autor e o réu narram o mesmo fato de formas diferentes, e
    // escolher uma versão em silêncio esconde justamente o que está em disputa.
    "Quando duas peças divergirem sobre o mesmo fato, valor ou data, APONTE a",
    "divergência e dê a origem das duas versões — não escolha uma nem faça média.",
    // Sem isto o modelo narra na ordem em que leu as peças (que é a ordem da
    // seleção), e não na ordem em que os atos aconteceram.
    "Ao narrar fatos ou atos processuais, siga a ordem CRONOLÓGICA e informe a",
    "data de cada um quando ela constar da peça.",
  ];
  const PROMPT_INICIO = PROMPT_PAPEL.concat(PROMPT_FONTE_CHAT, PROMPT_RASTREIO);
  const PROMPT_FIM_COMUM = [
    "Seja objetivo e técnico. Comece pela resposta: nada de preâmbulo do tipo 'Vou",
    "analisar as peças' ou 'Com base nos documentos fornecidos'.",
    "Se a informação não estiver nos documentos selecionados,",
    "diga explicitamente que não consta nas peças fornecidas — não invente.",
    // O inventário das peças NÃO marcadas viaja no texto do turno (ver
    // inventarioNaoMarcadas). Sem esta regra o modelo trataria a lista como
    // conteúdo disponível e passaria a afirmar coisas sobre peças que não leu.
    // A LINHA DO TEMPO PROCESSUAL viaja no mesmo lugar (ver
    // linhaDoTempoProcessual). Sem esta regra o modelo a ignora: ele foi
    // treinado a responder a partir do CONTEÚDO dos documentos, e prazo é
    // justamente o que não está escrito neles — publicação, decurso e trânsito
    // são movimentos, e movimento quase nunca vira peça com texto.
    "Você pode receber, ao fim da mensagem, a LINHA DO TEMPO do processo: os",
    "movimentos registrados no PJe, cada um com data. Ela é fonte legítima e",
    "PREFERENCIAL para datas de publicação, intimação, decurso de prazo, trânsito",
    "em julgado, conclusão e distribuição — não diga que não é possível determinar",
    "uma data sem antes procurá-la ali. Ao usá-la, cite o movimento e a data",
    "(ex.: 'decurso de prazo em 10/02/2026, conforme a linha do tempo'), e",
    "distinga o que está REGISTRADO do que você CALCULOU a partir do registro:",
    "se o cálculo depender de um dado que não consta, diga qual dado falta.",
    "Se o bloco avisar que a linha do tempo está PARCIAL, trate a ausência de um",
    "ato como 'não carregado', nunca como 'não aconteceu'.",
    // A linha do tempo é REGISTRO, e registro é o que foi lançado no sistema —
    // não é o mundo. A diferença tem consequência prática: um trânsito que
    // ocorreu e não foi certificado existe juridicamente e não está ali. Dizer
    // "não há movimento registrado de X" é verdadeiro e útil; dizer "X não
    // aconteceu" é conclusão que o dado não sustenta.
    "Mesmo com a linha do tempo completa, ela é o que está REGISTRADO no sistema:",
    "se um ato não aparece, diga 'não há movimento registrado de X', e não 'X não",
    "aconteceu'.",
    // Confundir os dois é o erro de prazo mais fácil de cometer e o mais difícil
    // de perceber conferindo a resposta.
    "A data de JUNTADA de uma peça é quando ela entrou nos autos e NÃO é",
    "necessariamente a data do ato que ela documenta (uma petição protocolada em",
    "papel é juntada dias depois; um documento antigo pode ser juntado hoje). Para",
    "prazo, use o movimento correspondente da linha do tempo.",
    "Você pode receber, ao fim da mensagem, a lista das peças do processo que NÃO",
    "foram anexadas — apenas id e título. NUNCA afirme nada sobre o conteúdo",
    "delas: você não as leu. Use-a só para uma coisa — quando a resposta não",
    "estiver nas peças anexadas e o título de uma não anexada indicar que ela",
    "provavelmente a contém, diga isso e informe o id para o usuário marcá-la e",
    "perguntar de novo. Distinga sempre 'não consta das peças anexadas' de 'não",
    "existe no processo'.",
    "Atenção a peças de mero encaminhamento: no PJe é comum a petição conter apenas",
    "uma remissão como 'Em anexo' ou 'Segue anexo', com o conteúdo real nos documentos",
    "anexos protocolados junto dela. Nesse caso, diga claramente que a peça é só um",
    "encaminhamento e oriente o usuário a marcar também os anexos correspondentes",
    "(ex.: as peças 'Documento de Comprovação' logo abaixo dela na lista).",
  ];
  // Formatação de RESPOSTA DE CHAT, e só dela: "para uma pergunta pontual,
  // responda em uma ou duas frases corridas, sem estruturar" briga de frente com
  // a ESTRUTURA que o SUFIXO_MINUTA exige (um # com o nome do ato, ## nas
  // seções). Fica fora do system da minuta.
  const PROMPT_FORMATO_CHAT = [
    "Use markdown — títulos curtos, listas e tabelas (ex.: linha do tempo dos atos,",
    "partes, pedidos) — quando a resposta tiver mais de um eixo; para uma pergunta",
    "pontual, responda em uma ou duas frases corridas, sem estruturar.",
  ];
  const PROMPT_FIM = PROMPT_FIM_COMUM.concat(PROMPT_FORMATO_CHAT);
  // Ordem de prioridade das fontes na busca web. Vive em trecho PRÓPRIO porque os
  // DOIS system prompts precisam dele: até aqui a instrução de busca existia só no
  // caminho de citação textual (Gemini/OpenAI) e o caminho Anthropic não tinha
  // NENHUMA — dependia só de `allowed_domains`, que é binário (dentro/fora) e não
  // sabe dizer "STF e STJ primeiro". Prioridade é RANKING, e nenhuma das três APIs
  // tem parâmetro de ranking: só o prompt expressa isso, nos três provedores.
  const PROMPT_BUSCA = [
    "Se usar a busca na web, siga esta ordem de prioridade das fontes:",
    "(1) STF (stf.jus.br) e STJ (stj.jus.br) — súmulas, repetitivos e precedentes",
    "vinculantes têm precedência sobre qualquer outra fonte;",
    TRIBUNAL_DO_PROCESSO
      ? "(2) o tribunal deste processo (" +
        TRIBUNAL_DO_PROCESSO +
        ") — a jurisprudência local aplicável ao caso;"
      : "(2) o tribunal do próprio processo, quando identificável;",
    "(3) as demais fontes (TST, CNJ, repositórios de jurisprudência) apenas quando",
    "as anteriores não responderem — e, nesse caso, diga que a resposta não veio de",
    "fonte superior. Para texto de lei, use planalto.gov.br.",
    "Cite a fonte de cada informação obtida na web.",
  ];
  // DESTAQUES — o que o usuário precisa bater o olho e ver.
  //
  // A observação que muda a leitura do processo ("esta peça é só encaminhamento,
  // a defesa está na 205649798"; "a peça decisiva não foi anexada"; "não deu
  // para confirmar este valor") chegava como mais um parágrafo no meio de uma
  // resposta longa. Quem lê autos lê por VARREDURA: ressalva sem peso visual é
  // ressalva não lida — e aqui o custo disso é decidir com base errada.
  //
  // A sintaxe é a dos "alerts" do GitHub (`> [!ALERTA]`) por ADERÊNCIA, não por
  // gosto: os modelos a conhecem muito bem do treino, e uma marcação inventada
  // aqui seria obedecida pela metade. Ela é uma citação markdown legítima, então
  // um provedor que ignore a instrução degrada para blockquote em vez de vazar
  // marcação estranha. Quem desenha o bloco colorido é `lerCallout` em panel.js
  // — os rótulos DAQUI e os aceitos LÁ precisam continuar batendo.
  //
  // Vai nos DOIS system prompts (citação nativa e textual). NÃO vai na minuta
  // nem no mapa: os dois têm sufixo próprio, e um "[!ALERTA]" no meio de uma
  // sentença seria um defeito, não um destaque.
  const PROMPT_DESTAQUES = [
    "Quando houver algo que o usuário PRECISE notar de imediato, escreva um aviso em",
    "bloco: uma citação markdown cuja primeira linha é só o rótulo entre colchetes e",
    "cujo texto vem nas linhas seguintes, todas começando com '>'. Assim:",
    "\n> [!ATENÇÃO]\n> A peça 205649792 - Contestação é apenas encaminhamento ('SEGUE" +
      " ANEXO'); o conteúdo da defesa está na peça 205649798.\n",
    "Use [!ALERTA] para o que pode levar a erro de análise ou de decisão: divergência",
    "entre peças sobre fato, valor ou data; prazo, prescrição ou preclusão em jogo; peça",
    "essencial que NÃO foi anexada; documento que contradiz a conclusão.",
    "Use [!ATENÇÃO] para ressalvas sobre a BASE da resposta: peça que é só",
    "encaminhamento; documento ilegível ou digitalizado sem texto; conteúdo cortado por",
    "tamanho; informação que você não conseguiu confirmar na peça.",
    "Use [!NOTA] para observação útil que não é risco.",
    "Todo aviso nomeia a peça e o id de que trata. No máximo TRÊS avisos por resposta e",
    "nunca para o conteúdo principal — um destaque que aparece em tudo deixa de",
    "destacar. Não use esses blocos dentro de tabelas.",
  ];
  // MODO SÓ-ANEXOS — entra no system só quando `soAnexosNoContexto()` (ver lá o
  // porquê do modo ser lido do estado, e não ligado na UI). Fora dele o prompt
  // fica byte a byte o de sempre, nos três provedores.
  //
  // O aviso de divergência CONTINUA sendo desejado: se o arquivo é de outro
  // processo, o usuário precisa saber — pode ter anexado o errado. É o
  // [!ALERTA] do PROMPT_DESTAQUES e ele permanece. O que sai daqui é a
  // INSISTÊNCIA depois do aviso: a lista de peças para marcar, que respondia
  // uma pergunta que ninguém fez e deixava a verdadeira sem resposta.
  const PROMPT_SO_ANEXOS = [
    "NESTA conversa o material de análise são os ARQUIVOS ANEXADOS pelo usuário na",
    "caixa de mensagem. Nenhuma peça dos autos abertos foi anexada, e isso é",
    "intencional: responda com base nos arquivos anexados.",
    "É legítimo que eles tratem de OUTRO processo, ou que nem sejam peça judicial —",
    "o processo aberto na tela é apenas o contexto em que o usuário está",
    "trabalhando, NÃO o objeto desta conversa.",
    "Se o arquivo tratar de processo diferente do que está na tela, diga isso UMA",
    "vez, num aviso em bloco, e siga respondendo o que foi perguntado.",
    "NÃO peça ao usuário que marque peças e NÃO liste peças dos autos — só se ele",
    "perguntar sobre o processo da tela, e aí oriente-o a marcá-las na lista à",
    "esquerda do painel.",
    "Estes documentos não têm id de peça: ao citar, use o NOME do arquivo no lugar",
    "do id, com a folha quando conseguir identificá-la — ex.: '(contrato.pdf, fl. 3)'.",
  ];
  // Os dois trechos de citação viram constantes próprias porque o systemMinuta
  // escolhe entre eles pelas caps da MINUTA, que podem diferir das do chat.
  const PROMPT_CIT_NATIVA = [
    "As citações precisas de trechos são geradas automaticamente pelo sistema e já",
    "mostram peça, id e folha ao usuário — apoie cada afirmação relevante no trecho",
    "correspondente e NÃO repita id nem folha no corpo do texto.",
    "Peças digitalizadas sem camada de texto podem não permitir citação automática;",
    "só nesse caso escreva a referência no próprio texto (ex.: 'na Contestação, id",
    "123456') e avise o usuário de que aquela peça não é citável.",
  ];
  const SYSTEM_PROMPT = PROMPT_INICIO.concat(
    PROMPT_CIT_NATIVA,
    PROMPT_BUSCA,
    PROMPT_FIM,
    PROMPT_DESTAQUES
  ).join(" ");
  const PROMPT_CIT_TEXTUAL = [
      "Ao afirmar fatos relevantes, cite a peça, o id E a página no PRÓPRIO texto,",
      "no formato '(Contestação, id 123456, fl. 12)' — indique sempre a página do",
      "PDF de origem quando conseguir identificá-la; sem folha identificável, use",
      "'(Contestação, id 123456)'.",
      // EXCEÇÃO da LINHA DO TEMPO, a mesma que o SUFIXO_MINUTA e o SUFIXO_MAPA
      // ganharam: movimento não tem peça nem folha. Sem dizê-la AQUI, a regra de
      // cima ficava sozinha no trecho mais próximo e empurrava o modelo para uma
      // de duas saídas ruins — omitir a data (e a pergunta de prazo volta sem
      // resposta, que é o defeito que esta linha do tempo existe para eliminar)
      // ou pendurá-la numa peça qualquer para satisfazer o formato, isto é,
      // citação inventada. Vale mais aqui do que em qualquer outro lugar: este é
      // o caminho dos modelos SEM citação nativa (Gemini e OpenAI), e o padrão da
      // extensão é o `gpt-5.6-luna`. O `PROMPT_FIM` já pede a forma; o que
      // faltava era a DISPENSA explícita do formato de documento.
      "Fato que vier da LINHA DO TEMPO do processo (distribuição, publicação,",
      "intimação, decurso de prazo, trânsito em julgado, conclusão) não tem peça nem",
    "folha: cite-o como '(movimentação de DD/MM/AAAA)' e NUNCA o pendure numa peça",
    "para satisfazer o formato acima.",
  ];
  const SYSTEM_PROMPT_CIT_TEXTUAL = PROMPT_INICIO.concat(
    PROMPT_CIT_TEXTUAL,
    PROMPT_BUSCA,
    PROMPT_FIM,
    PROMPT_DESTAQUES
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
  //
  // Além do CNJ, vai a FICHA do processo: classe, assunto, órgão julgador e as
  // partes de cada polo. São ~80 tokens que o modelo não consegue deduzir com
  // segurança dos PDFs — nem sempre a peça marcada é a inicial —, e sem eles
  // ele confunde os polos (chama o réu de autor), erra o rito e não sabe a
  // competência. `PJE.lerCabecalhoProcesso` já existia; até agora só a
  // exportação em .zip a usava.
  //
  // Lida UMA vez por sessão: a ficha não muda enquanto a página está aberta, e
  // `systemPromptAtual()` é chamado duas vezes por turno (count_tokens + envio).
  const CAMPOS_FICHA = [
    "classe judicial", "classe", "assunto", "orgao julgador", "órgão julgador",
    "jurisdicao", "jurisdição", "competencia", "competência",
  ];
  let fichaCache; // undefined = ainda não lida; null = não há ficha nesta página
  function resumoFicha(soAnexos) {
    if (fichaCache === undefined) {
      try {
        fichaCache = PJE.lerCabecalhoProcesso();
      } catch {
        fichaCache = null; // best-effort: sem ficha, o system segue como antes
      }
    }
    if (!fichaCache) return "";
    const partes = [];
    const campos = fichaCache.campos || {};
    // casa sem depender do acento/caixa exatos do rótulo, que varia por tribunal
    for (const [rotulo, valor] of Object.entries(campos)) {
      const r = rotulo.toLowerCase().trim();
      if (CAMPOS_FICHA.some((c) => r === c || r.startsWith(c))) {
        partes.push(rotulo + ": " + valor);
      }
    }
    const polo = (lista, nome) => {
      if (!lista || !lista.length) return null;
      // só os titulares, sem os representantes: a lista de advogados dobraria o
      // tamanho da ficha sem ajudar a entender o caso
      const nomes = lista.slice(0, 6).map((p) => p.nome).filter(Boolean);
      if (!nomes.length) return null;
      return (
        nome + ": " + nomes.join("; ") +
        (lista.length > nomes.length ? " e mais " + (lista.length - nomes.length) : "")
      );
    };
    const a = polo(fichaCache.poloAtivo, "Polo ativo");
    const p = polo(fichaCache.poloPassivo, "Polo passivo");
    if (a) partes.push(a);
    if (p) partes.push(p);
    if (!partes.length) return "";
    // No modo só-anexos a ficha continua indo — é ela que permite ao modelo
    // dizer COM PRECISÃO que o arquivo é de outro processo —, mas o rótulo não
    // pode prometer que o teor virá "das peças anexadas": não há nenhuma, e a
    // frase é justamente o que fazia o modelo cobrar a marcação.
    if (soAnexos) {
      return (
        " Ficha do processo aberto na tela do PJe, para você reconhecer se os" +
        " arquivos anexados são deste processo ou de outro: " + partes.join(". ") + "."
      );
    }
    return (
      " Ficha do processo, lida da tela do PJe (use para situar o caso; o teor" +
      " vem SEMPRE das peças anexadas): " + partes.join(". ") + "."
    );
  }

  // `soAnexos` vem de FORA (de `systemPromptAtual`, o único chamador) em vez de
  // ser lido aqui: o predicado varre a seleção do painel, e lê-lo de novo aqui
  // dobraria a varredura por montagem de prompt — que acontece duas vezes por
  // turno (count_tokens + envio). Repassado, o rótulo do número e o da ficha
  // também não têm como discordar entre si.
  function contextoDoProcesso(soAnexos) {
    let s = "";
    try {
      const num = PJE.getNumeroProcesso();
      if (num) {
        s += soAnexos
          ? " Processo aberto na tela do PJe (contexto de trabalho, NÃO é o objeto" +
            " desta conversa): " + num + "."
          : " Processo em análise: " + num + ".";
      }
    } catch {
      /* página sem número identificável — segue sem ele */
    }
    return (
      s + resumoFicha(soAnexos) + " Hoje é " + new Date().toLocaleDateString("pt-BR") + "."
    );
  }

  function systemPromptAtual() {
    const soAnexos = soAnexosNoContexto();
    const base =
      (modelCaps && modelCaps.citacoesNativas === false
        ? SYSTEM_PROMPT_CIT_TEXTUAL
        : SYSTEM_PROMPT) +
      contextoDoProcesso(soAnexos) +
      // Depois do contexto do processo, para reescrever a premissa que ele
      // acabou de estabelecer; antes do customPrompt, que segue por último.
      (soAnexos ? " " + PROMPT_SO_ANEXOS.join(" ") : "");
    if (!customPrompt) return base;
    return (
      base +
      " Instruções adicionais definidas pelo usuário desta extensão (perfil e " +
      "preferências dele — siga-as no que não conflitar com as regras acima): " +
      customPrompt
    );
  }

  // O system da MINUTA. Até aqui ela usava o system do CHAT — ~5,4 mil chars de
  // regras de análise —, e três deles trabalhavam contra o resultado:
  //
  //   (1) a frase da FONTE mandava se basear só nas peças SELECIONADAS, o que
  //       exclui as peças-modelo (ver PROMPT_FONTE_MINUTA);
  //   (2) o PROMPT_FORMATO_CHAT pedia "uma ou duas frases corridas, sem
  //       estruturar" numa tarefa cuja estrutura é obrigatória;
  //   (3) o PROMPT_DESTAQUES mandava usar "> [!ALERTA]" e o SUFIXO_MINUTA gasta
  //       a última frase PROIBINDO — dois comandos contraditórios no mesmo
  //       payload. O comentário do PROMPT_DESTAQUES sempre AFIRMOU que ele não
  //       ia na minuta; ia, porque a minuta chama systemPromptAtual(). Agora a
  //       afirmação é verdade, e a frase do sufixo vira cinto-e-suspensório.
  //
  // `comBusca` é PARÂMETRO, e não uma leitura de `panel.isSearchOn()` aqui
  // dentro: esta função é chamada DUAS vezes por turno (pré-voo e stream) e as
  // duas precisam da MESMA string — um toggle alternado no meio faria o
  // count_tokens medir um request diferente do que sai.
  //
  // `soAnexos` não entra: minutar exige peça marcada (guarda dura no painel e
  // em minutarAgora), então o modo só-anexos nunca se aplica aqui.
  function systemMinuta(comBusca) {
    const base =
      PROMPT_PAPEL.concat(
        PROMPT_FONTE_MINUTA,
        PROMPT_RASTREIO,
        // SEMPRE a citação TEXTUAL, qualquer que seja o provedor — e isto não é
        // um descuido de não olhar `citacoesNativas`. Duas razões, e as duas
        // valem mesmo nos modelos que citam por página:
        //   (1) a citação nativa NÃO EXISTE no produto final. A minuta vira
        //       markdown, abre no editor e sai em .docx para o PJe; os
        //       `page_location` da API ficam na bolha do chat, que aqui nem
        //       existe (a resposta vira um card). A referência TEM de estar no
        //       texto ou não existe para quem assina.
        //   (2) o `PROMPT_CIT_NATIVA` manda literalmente "NÃO repita id nem
        //       folha no corpo do texto", enquanto o `SUFIXO_MINUTA` exige
        //       "(Título da peça, id 123456, fl. 7)" em toda afirmação. Num
        //       modelo Anthropic isso eram dois comandos opostos sobre a coisa
        //       mais importante do ato — a rastreabilidade peça·id·folha.
        PROMPT_CIT_TEXTUAL,
        comBusca ? PROMPT_BUSCA : [],
        PROMPT_FIM_COMUM
      ).join(" ") + contextoDoProcesso(false);
    if (!customPrompt) return base;
    // Mesmo rótulo de subordinação do chat: a persona do usuário orienta o
    // estilo, mas não desliga a não-invenção nem a origem obrigatória.
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
  // OpenAI aceita 50 MB (arquivo e somados por request); 40 MB de base64 (~30 MB
  // decodificados) fica com folga confortável sob o limite.
  const MAX_TOTAL_B64_CHARS_OPENAI = 40 * 1024 * 1024;

  // Chars por token — heurística única do projeto, usada pela estimativa local
  // e pelo teto de texto abaixo. Declarada AQUI, no topo, e não junto do
  // medidor (que é onde ela era): `tetoTextoChars` a lê e é chamada por
  // `montarBlocos`/`pecasTruncadas`/`estimativaLocalTokens`, e a armadilha da
  // zona morta temporal deste arquivo (ver CLAUDE.md) torna qualquer `const`
  // declarada depois de `refresh()` um risco para quem a lê de um callback.
  const CHARS_POR_TOKEN = 3.5;

  // Teto do bloco de TEXTO — peça HTML do editor, RTF de processo migrado, ou
  // arquivo de texto que o usuário anexa no input (.md/.txt/.docx).
  //
  // NÃO é constante, e a diferença importa: o teto existe para proteger a
  // JANELA do modelo, e a janela vai de 200 mil (Haiku) a 1,05 milhão de
  // tokens (GPT-5.6). Enquanto ele foi o número fixo de 60.000 — herdado de
  // quando só existiam peças de texto do PJe, ~30 páginas —, um anexo de 1,5
  // milhão de caracteres entrava a 3,8%: o usuário via "2% do contexto" com um
  // modelo de 1M e a resposta dizia que a leitura parou na página 25. O mesmo
  // conteúdo em PDF passaria INTEIRO (vai por file_id, sem corte), então o
  // formato mais leve era o único penalizado.
  //
  // O orçamento é REPARTIDO entre os textos do conjunto, e isso não é
  // preciosismo: com teto individual generoso, 20 peças de texto marcadas de
  // uma vez estourariam a janela e o pré-voo BARRARIA o turno — trocando uma
  // degradação graciosa (entram cortadas, com aviso) por um erro duro. Assim,
  // um anexo sozinho fica com quase todo o orçamento e 20 peças o dividem.
  //
  // A fração é 0,55 e não 0,9 porque o resto da janela tem dono: o histórico
  // da conversa, o system, o inventário de peças não marcadas e — o maior
  // deles — os PDFs das peças marcadas. A guarda de 90% em `estimarContexto`
  // segue sendo a rede real; este teto é a primeira linha, não a única.
  const TETO_TEXTO_MIN = 60000; // piso: o teto histórico, para janelas pequenas
  const FRACAO_JANELA_TEXTO = 0.55;
  function tetoTextoChars(nTextos) {
    const janela = (modelCaps && modelCaps.contextTokens) || 200000;
    const orcamento = janela * FRACAO_JANELA_TEXTO * CHARS_POR_TOKEN;
    return Math.max(TETO_TEXTO_MIN, Math.floor(orcamento / Math.max(1, nTextos)));
  }
  // O teto que vale para um CONJUNTO de ids. Ponto ÚNICO dos três consumidores
  // (`montarBlocos` corta, `pecasTruncadas` reporta, `estimativaLocalTokens`
  // mede): se cada um contasse os textos por conta própria, o gauge mediria um
  // corte diferente do que o request faz e o relatório anunciaria peças que não
  // foram cortadas — a mesma razão que já mantinha a constante compartilhada.
  function tetoTextoDe(ids) {
    let n = 0;
    for (const id of ids) {
      const d = entradaDoc(id);
      if (d && d.kind === "text" && d.text) n++;
    }
    return tetoTextoChars(n);
  }
  // O corte em si é aceitável; cortar EM SILÊNCIO não é. O modelo veria metade
  // da peça e responderia "não consta" sobre o que estava na outra metade — e
  // essa resposta é indistinguível de uma correta. Por isso o texto cortado
  // leva um aviso explícito para o modelo e o item é listado para o usuário no
  // fim do turno. O número vai no aviso: "cortada no limite" sem dizer onde não
  // ajuda o modelo a calibrar o que falta.
  function marcaTruncado(teto) {
    return (
      "\n\n[ATENÇÃO: este documento é longo e foi cortado aqui, no limite de " +
      Math.round(teto / 1000) +
      " mil caracteres. O restante do conteúdo dele NÃO está nesta análise — " +
      "não conclua que algo 'não consta' dele; diga que ele entrou " +
      "parcialmente e indique até onde você conseguiu ler.]"
    );
  }

  // Betas enviadas em todos os requests de chat (documentos por file_id).
  const BETAS_CHAT = ["files-api-2025-04-14"];

  // Fontes confiáveis da busca, em TRÊS DEGRAUS de autoridade. A distinção não é
  // cosmética: num parecer, "o STJ decidiu" e "um blog jurídico noticiou" não têm
  // o mesmo peso, e até aqui a extensão tratava as dez fontes como equivalentes.
  //
  // Os degraus servem a dois consumidores diferentes:
  //  - `DOMINIOS_JURIDICOS` (a UNIÃO) é o que vai em `allowed_domains`: a API só
  //    entende dentro/fora, então o filtro continua binário e nada é excluído;
  //  - a ORDEM vai por PROMPT_BUSCA (nos três provedores) e o NÍVEL de cada fonte
  //    citada vira rótulo na bolha (`nivelFonte`), para o usuário ver de onde veio.
  const FONTES_SUPERIORES = ["stf.jus.br", "stj.jus.br"];
  // Multi-PJe: o tribunal do processo entra como 2º degrau. Vindo da URL, cobre
  // qualquer tribunal (pje1g.trf5.jus.br → trf5.jus.br) sem lista fixa — por isso
  // "tjce.jus.br" deixou de ser hardcoded: num processo do TRF5, jurisprudência do
  // TJCE é ruído, e num processo do TJCE ela entra por aqui de qualquer forma.
  const FONTES_TRIBUNAL = TRIBUNAL_DO_PROCESSO ? [TRIBUNAL_DO_PROCESSO] : [];
  const FONTES_DEMAIS = [
    "tst.jus.br",
    "cnj.jus.br",
    "planalto.gov.br", // legislação, não jurisprudência
    "lexml.gov.br",
    "jusbrasil.com.br",
    "conjur.com.br",
    "migalhas.com.br",
  ];
  const DOMINIOS_JURIDICOS = [
    ...new Set([...FONTES_SUPERIORES, ...FONTES_TRIBUNAL, ...FONTES_DEMAIS]),
  ];

  // Nível de uma fonte pelo host, para o rótulo da citação. Sufixo além de
  // igualdade porque a busca devolve subdomínio (noticias.stf.jus.br,
  // processo.stj.jus.br — ambos vistos no smoke test real).
  function nivelFonte(host) {
    const casa = (d) => host === d || host.endsWith("." + d);
    if (FONTES_SUPERIORES.some(casa)) return "superior";
    if (FONTES_TRIBUNAL.some(casa)) return "tribunal";
    return "outra";
  }

  // Ferramentas de busca web na versão suportada pelo modelo atual.
  // Gemini: google_search não aceita allowed_domains — ali a priorização de
  // fontes depende SÓ da instrução do PROMPT_BUSCA (garantia mole). Nos outros
  // dois a allowlist é aplicada no servidor (garantia dura); o PROMPT_BUSCA vai
  // junto assim mesmo, porque é ele que expressa a ORDEM entre os três degraus.
  // `caps` é parâmetro (default: o modelo do chat) porque as VERSÕES das tools
  // variam entre irmãos do MESMO provedor — na Anthropic o Sonnet 5 usa as
  // `_20260209` e o Haiku as básicas —, e a minuta pode rodar noutro modelo.
  function toolsBusca(caps) {
    const c = caps || modelCaps;
    if (!c) return [];
    if (c.provider === "gemini") return [{ type: "google_search" }];
    // OpenAI: web_search embutida da Responses API (o tipo antigo
    // "web_search_preview" é legado e não aceita os controles novos). Aqui a
    // restrição de domínios EXISTE — vai em `filters.allowed_domains` (teto de
    // 100 domínios, nomes sem protocolo) —, ao contrário do Gemini, que não
    // tem o recurso. Sem ela a busca de jurisprudência varreria a web inteira
    // e devolveria blog no lugar de fonte oficial: num uso jurídico isso não é
    // detalhe, e deixaria o GPT pior que o Claude sem motivo técnico.
    if (c.provider === "openai") {
      return [{ type: "web_search", filters: { allowed_domains: DOMINIOS_JURIDICOS } }];
    }
    return [
      {
        type: c.webSearch,
        name: "web_search",
        max_uses: 5,
        allowed_domains: DOMINIOS_JURIDICOS,
      },
      {
        type: c.webFetch,
        name: "web_fetch",
        max_uses: 3,
        allowed_domains: DOMINIOS_JURIDICOS,
      },
    ];
  }

  const docsCache = new Map(); // id -> {kind:"pdf",b64,size,pages,fileId?} | {kind:"text",text}

  // ANEXOS DO INPUT — arquivos que o usuário anexa na própria caixa de mensagem
  // (PDF, TXT, MD), para conversar sobre eles junto das peças do processo, ou
  // sozinhos. Vivem SÓ na sessão, de propósito: ao contrário das peças, não têm
  // origem no PJe para re-baixar, e gravar bytes de arquivo do usuário no disco
  // é justamente o que a extensão evita (a mesma regra do b64 das peças). Cada
  // anexo ganha um id sintético "anexo:<n>" e uma entrada no mesmo FORMATO do
  // `docsCache` ({kind, fmt, b64|text, pages…}) — é o que deixa `montarBlocos` e
  // as contas de página/token tratarem anexo e peça pelo mesmo caminho, via
  // `entradaDoc`. NUNCA entram no `docsCache` nem na fila de gravação
  // (`pecasSujas`): o que os distingue de uma peça é só esta Map.
  const anexos = new Map(); // "anexo:<n>" -> {id, nome, kind, fmt, b64|text, size, pages?, mime?, w?, h?, fileId?, fileProvider?, fileExp?, chaveHash?}
  let anexoSeq = 0; // gera os ids sintéticos (Date.now/Math.random são proibidos aqui — ver CLAUDE.md)
  // Anexos ainda NÃO enviados (delta deste turno). Ordenados pela ordem em que o
  // usuário os soltou; viram parte do histórico ao serem enviados, como as peças.
  const anexosPendentes = [];

  // A entrada de conteúdo de um id, seja peça (docsCache) ou anexo. Ponto único
  // para `montarBlocos`, `paginasDe` e afins não precisarem saber a origem.
  function entradaDoc(id) {
    return docsCache.get(id) || anexos.get(id);
  }

  // Seleção de peças MAIS os anexos do input — o conjunto que de fato vai ao
  // modelo, e portanto o único conjunto que se pode MEDIR.
  //
  // Existe como função porque a distinção importa e é fácil de errar: tudo que
  // MEDE (estimativa local, páginas, `ativos` do pré-voo, gauge) precisa dos
  // anexos; tudo que BAIXA (`precisaBaixar`, `baixarQuieto`, `subirPecas`,
  // `revalidarPecasDoHistorico`) precisa ficar SÓ com as peças — um id
  // sintético "anexo:1" na fila de download vira uma ida ao PJe atrás de uma
  // peça que não existe. Por isso os dois conjuntos nunca se fundem num só.
  function comAnexos(ids) {
    return anexos.size ? [...ids, ...anexos.keys()] : ids;
  }

  // Um id é de anexo do input quando é o sintético "anexo:<n>". Extraído para
  // ser fonte ÚNICA: além do histórico, o relatório de itens cortados precisa
  // da distinção para não chamar de "peça" um arquivo que o usuário anexou —
  // quem lê "1 peça é longa demais" vai procurar na lista dos autos.
  function ehIdAnexo(id) {
    return typeof id === "string" && id.indexOf("anexo:") === 0;
  }
  // Um bloco do histórico é de anexo do input quando o `__pecaId` sintético
  // começa por "anexo:". Usado para (a) removê-los na retomada — os bytes são de
  // sessão e o `file_id` já venceu — e (b) NÃO gravar os bytes no disco.
  function ehBlocoAnexo(b) {
    return !!b && ehIdAnexo(b.__pecaId);
  }

  // Cópia do `conversation` pronta para o disco: os blocos de anexo do input
  // carregam o base64 do PDF ou o TEXTO extraído do arquivo do usuário, e gravar
  // isso é justamente o que a extensão evita (a mesma regra do b64 das peças —
  // ver casodb.js e `salvarPecas`). Como `aplicarConversa` já os REMOVE na
  // retomada, persistir os bytes seria guardar o que nunca será reusado; e como
  // a memória de caso não os re-hidrata, o `file_id` deles estaria morto de todo
  // jeito. Trocamos cada bloco de anexo por um STUB sem bytes que preserva só o
  // `__pecaId` — assim a retomada ainda os detecta (para avisar "reanexe os
  // arquivos"), mas nenhum byte do arquivo do usuário toca o disco. O
  // `conversation` VIVO (que vai à API neste sessão) fica intocado.
  function conversaParaDisco() {
    return conversation.map((turno) => {
      if (!Array.isArray(turno.content) || !turno.content.some(ehBlocoAnexo)) return turno;
      return Object.assign({}, turno, {
        content: turno.content.map((b) =>
          ehBlocoAnexo(b) ? { __pecaId: b.__pecaId, _anexoStub: true } : b
        ),
      });
    });
  }

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
        modelCaps && modelCaps.provider === "gemini"
          ? "Google"
          : modelCaps && modelCaps.provider === "openai"
            ? "OpenAI"
            : "Anthropic",
    });
  }
  // Peças cujos blocos document JÁ estão no histórico desta conversa. Anexamos
  // só o DELTA a cada turno: reanexar tudo duplicaria as páginas/tokens no
  // request (o histórico não pode ser editado) e estourava os limites já no
  // segundo envio. Peça desmarcada permanece no histórico até "Nova conversa".
  let pecasNaConversa = new Set();
  // "Este id ainda NÃO tem blocos no histórico?" — a pergunta que decide o que
  // entra no turno de rascunho da medição e no anexo incremental do envio.
  //
  // Peça e anexo respondem por listas DIFERENTES, e é fácil não notar: as peças
  // já enviadas vivem em `pecasNaConversa`, mas os anexos NUNCA entram nesse
  // Set — quem os rastreia é o complemento de `anexosPendentes`. Por isso
  // `!pecasNaConversa.has(id)` responde "sim, é novo" para TODO anexo, inclusive
  // os já enviados, e é o predicado errado para os dois lados quando aplicado
  // sozinho a um conjunto misto.
  function ehNovoNoTurno(id) {
    return ehIdAnexo(id) ? anexosPendentes.includes(id) : !pecasNaConversa.has(id);
  }
  // A busca web foi usada nesta conversa: o histórico contém blocos de
  // ferramenta, então as tools continuam declaradas nos turnos seguintes
  // (mesmo com o toggle desligado) — remover trocaria o conjunto de tools,
  // invalidando o cache de prefixo e arriscando rejeição do histórico.
  let buscaNaConversa = false;
  // Provedor (anthropic|gemini|openai) do PRIMEIRO turno da conversa: o
  // histórico de um provedor não é traduzível para o outro (thinking assinado
  // da Anthropic vs. thought signatures do Gemini vs. reasoning criptografado
  // da OpenAI) — trocar no meio exige "Nova conversa".
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
  // Total de tokens do último request FÍSICO, medido pelo usage da API (exato e
  // de graça). Base para dispensar o count_tokens do turno seguinte quando a
  // folga sobre a janela é larga — ver podePularPreVoo.
  let ultimoTotalExato = 0;

  // Texto do alerta persistente de contexto cheio (barra vermelha no rodapé).
  const ALERTA_CTX_CHEIO =
    "O contexto da IA encheu: a conversa e as peças ocupam quase todo o limite do modelo. " +
    "Novas mensagens não serão aceitas — desmarque peças na lista para liberar espaço " +
    "(elas saem do contexto na hora) ou comece uma nova conversa.";
  const ALERTA_TROCA_PROVEDOR =
    "Você trocou de provedor de IA no meio da conversa (entre Claude, Gemini e OpenAI) — o " +
    "histórico de um não é compatível com o outro (raciocínio assinado pelo provedor). Clique " +
    "em ⟲ Nova conversa para usar o novo modelo, ou volte ao modelo anterior nas opções.";

  const panel = PjePanel.mount();

  // Esta página é de um PJe cujo dialeto a extensão lê? (ver `PJE.dialeto`.)
  // Quando não é — hoje só o PJe KZ, o frontend novo, relatado no TRT2 —, a
  // coluna de peças passa a EXPLICAR a lista vazia em vez de anunciá-la, e os
  // botões que dependeriam das rotas do PJe legado saem desabilitados.
  //
  // A guarda de `typeof` não é zelo: o harness de boot em jsdom stuba o `PJE`
  // com a superfície que usa, e um TypeError AQUI abortaria o content.js
  // inteiro — o painel montaria, metade dele não existiria e nada no console
  // apontaria para esta linha (é a mesma classe de estrago da zona morta
  // temporal descrita logo abaixo).
  if (typeof PJE.suportado === "function" && !PJE.suportado()) {
    panel.setNaoSuportado({
      titulo: "Este tribunal ainda não é suportado",
      texto:
        "A tela de documentos aqui é a do PJe novo (KZ), que a extensão ainda não " +
        "sabe ler — por isso nenhuma peça aparece na lista. Não é a sua chave de " +
        "API: não há nada a configurar. Nos tribunais com o PJe clássico a " +
        "extensão funciona normalmente.",
    });
  }

  // ATENÇÃO ao acrescentar estado lido por callback do painel: este arquivo
  // REGISTRA os callbacks muito antes de declarar as variáveis que eles leem e
  // chama `refresh()` no meio — que roda `panel.setDocs` de forma SÍNCRONA. Um
  // `const`/`let` do escopo deste IIFE declarado DEPOIS dessa chamada e lido por
  // um desses callbacks cai na ZONA MORTA TEMPORAL: lança "Cannot access before
  // initialization" dentro do setDocs, que aborta no meio e derruba o resto do
  // content.js junto. Uma linha de posição errada já apagou metade do painel.
  // Estado assim vive AQUI, junto do `panel`.

  // ---------------------------------------------------------------------------
  // MEMÓRIA DE CASO — estado. Mora aqui pela regra do parágrafo acima: o
  // `onSelectionChange` (registrado ~1.400 linhas abaixo) chama `agendarSalvar`,
  // e o `refresh()` do boot dispara esse callback de forma SÍNCRONA.
  // ---------------------------------------------------------------------------
  const memoriaDisponivel = typeof CASO !== "undefined";
  // Identidade do processo (host|grau|idProcesso). null = página sem idProcesso:
  // a memória fica desligada nesta aba em vez de inventar uma chave que
  // agruparia processos distintos.
  let casoChave = null;
  // TRAVA DE GRAVAÇÃO, e o bug nº 1 desta rodada mora aqui: o `refresh()` do
  // boot roda setDocs → syncSelection → selChangeCb ANTES de qualquer leitura,
  // com a lista de peças ainda vazia. Sem esta trava, a primeira gravação
  // salvaria `selecao: []` por cima da memória do processo — a extensão
  // apagaria sozinha o que existe para lembrar.
  let casoCarregado = false;
  let salvarTimer = null;
  // Instante do primeiro pedido de gravação da rodada atual de debounce. O
  // debounce agrupa, mas NÃO pode adiar para sempre: durante um prefetch cada
  // peça que baixa pede uma gravação, e sem teto o timer seria empurrado peça
  // após peça — num processo de 200 a gravação só aconteceria no fim, e fechar
  // a aba no meio perderia justamente o download que a memória existe para
  // preservar. Passado o teto, grava e recomeça a contar.
  let salvarDesde = 0;
  // Teto de adiamento do debounce. Fica AQUI, antes de `agendarSalvar`, e não
  // logo abaixo dela: `const` tem zona morta temporal, e `agendarSalvar` é
  // chamada pelo `selChangeCb` que o `refresh()` do boot dispara de forma
  // síncrona. Hoje a guarda de `casoChave` retorna antes de a constante ser
  // lida — mas depender disso é exatamente a armadilha que já derrubou o painel
  // inteiro uma vez.
  const TETO_ADIAR = 5000;
  // Ids cujo registro mudou desde a última gravação. Gravar a lista inteira a
  // cada peça baixada reescreveria centenas de registros por turno.
  const pecasSujas = new Set();
  // Desliga a gravação nesta sessão depois que o disco encheu mesmo com a poda
  // de emergência: insistir só gastaria RPC para falhar de novo.
  let memoriaMorta = false;
  // Impressão digital da chave da API em uso (vem do worker no `caps`). É ela
  // que invalida um fileId gravado quando o usuário troca de conta.
  let chaveHashAtual = null;
  // Peças que a última montagem de blocos deixou de fora por não ter conteúdo
  // anexável — preenchida por `montarBlocos`, relatada pelo envio.
  let semConteudo = [];

  // Seleção EFETIVA: os checkboxes marcados mais as peças restauradas da
  // memória cuja row a timeline lazy do PJe ainda não criou. Ponto único, usado
  // pelo filtro do histórico e pela gravação — os dois precisam do mesmo
  // conjunto, e divergir aqui faria a peça sair do request numa sessão e do
  // disco na seguinte. Degrada para os checkboxes se o painel for antigo.
  function selecaoEfetiva() {
    return panel.selecaoParaMemoria ? panel.selecaoParaMemoria() : panel.getSelected();
  }

  // MODO SÓ-ANEXOS: o material desta conversa são APENAS os arquivos que o
  // usuário soltou na caixa — nenhuma peça dos autos marcada e nenhuma no
  // histórico. Não é um modo que se liga na UI: é uma LEITURA do estado, e sai
  // sozinho no instante em que uma peça é marcada. Um toggle exigiria o usuário
  // declarar o que a seleção já diz, e criaria um estado a mais para
  // dessincronizar do contexto que de fato vai à API.
  //
  // Anexar documento de OUTRO processo é uso legítimo e frequente — a peça que
  // chegou por e-mail, o contrato que a parte trouxe, a decisão que se quer
  // comparar. O que quebrava eram as premissas do system ("Processo em
  // análise: X") e o inventário das não marcadas: o modelo concluía que o
  // usuário se enganara e devolvia uma cobrança para marcar peças no lugar da
  // resposta.
  //
  // try/catch por construção: roda a partir de `systemPromptAtual`, que é
  // chamada de vários pontos, e no boot parte deste estado ainda não existe.
  // Falhar aqui é dizer "não é o modo", nunca derrubar a montagem do prompt.
  function soAnexosNoContexto() {
    try {
      return anexos.size > 0 && !pecasNaConversa.size && selecaoEfetiva().length === 0;
    } catch {
      return false;
    }
  }
  // Conversa ABERTA nesta aba e o carimbo do retrato dela. O carimbo vai em
  // toda gravação para o banco detectar que outra aba escreveu na mesma
  // conversa no meio-tempo — e ramificar em vez de sobrescrever.
  let convAtual = null;
  let convVersao = 0;
  let avisouConflito = false;
  // Resumos das conversas deste processo, para a lista do painel.
  let conversasDoCaso = [];

  // Extrai de uma entrada do docsCache só o que vai ao disco. O `b64` fica de
  // fora POR CONSTRUÇÃO — são os autos inteiros, e o que evita o re-download é o
  // `fileId`, não os bytes (montarBlocos prefere o fileId e nem toca no b64).
  function pecaParaBanco(id) {
    const d = docsCache.get(id);
    if (!d) return null;
    const p = {
      id: String(id),
      kind: d.kind,
      fmt: d.fmt,
      size: d.size,
      baixadoEm: Date.now(),
    };
    // O título só entra quando a peça está MESMO na lista. `metaDe` tem
    // fallback (`"Peça 123"`) para nunca devolver undefined, e usá-lo aqui era
    // um apagador silencioso: a timeline do PJe é lazy, então numa sessão em
    // que o usuário não rolou até a peça o `docsIndex` não a tem — e a
    // gravação trocaria "184100639 - Contestação" por "Peça 184100639" no
    // disco, para sempre. Omitir o campo faz a mesclagem do banco preservar o
    // título bom.
    const m = docsIndex.get(id);
    if (m && m.titulo) p.titulo = m.titulo;
    if (m && m.tipo) p.tipo = m.tipo;
    if (m && m.juntadoEm) p.juntadoEm = m.juntadoEm;
    if (m && m.juntadoPor) p.juntadoPor = m.juntadoPor;
    if (d.kind === "pdf") p.pages = d.pages;
    if (d.kind === "img") {
      p.mime = d.mime;
      p.w = d.w;
      p.h = d.h;
    }
    // Só peça de TEXTO guarda conteúdo: nela o texto É o que vai ao modelo, e
    // guardá-lo dispensa o download por completo (não depende de fileId nenhum).
    if (d.kind === "text" && d.text) p.text = d.text;
    if (d.fileId) {
      p.fileId = d.fileId;
      p.fileProvider = d.fileProvider || "anthropic";
      if (d.fileExp) p.fileExp = d.fileExp;
      if (d.chaveHash) p.chaveHash = d.chaveHash;
    }
    return p;
  }

  // Monta o registro do caso a partir do estado vivo. Recalcula a chave e
  // ABORTA se ela mudou: o PJe novo é uma SPA e troca de autos sem recarregar a
  // página — gravar aqui escreveria a conversa de um processo no registro de
  // outro, que é pior do que não gravar nada.
  function snapshotCaso() {
    if (PJE.chaveDoCaso() !== casoChave) return null;
    const snap = {
      cnj: PJE.getNumeroProcesso() || null,
      host: location.hostname,
      grau: casoChave.split("|")[1] || null,
      idProcesso: PJE.getIdProcesso() || null,
      versaoExt: (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || null,
    };
    // A LISTA OFICIAL (grid) NÃO entra aqui, de propósito — ela é gravada UMA vez
    // por leitura, em `gravarGrid()`. Este snapshot roda a cada debounce de 1,2 s
    // (cada peça que baixa pede uma gravação), e a lista de um processo de 138
    // peças passa de 25 KB: repeti-la centenas de vezes durante um prefetch
    // custaria caro no worker — que é justamente o processo que o Chrome mata
    // primeiro. O banco MESCLA o patch, então gravá-la uma vez basta.
    return snap;
  }

  // O que pertence a UMA conversa (e não ao processo). Separado do caso porque
  // agora há várias por processo: o que muda a cada turno é isto, e reescrever
  // o caso inteiro junto seria trabalho à toa.
  function snapshotConversa() {
    return {
      // sem os bytes dos anexos do input (ver `conversaParaDisco`)
      conversation: conversaParaDisco(),
      pecasNaConversa: [...pecasNaConversa],
      transcript: panel.lerTranscript ? panel.lerTranscript() : [],
      // `selecaoEfetiva` e não `getSelected`: inclui as peças restauradas que
      // ainda esperam a timeline lazy do PJe carregar as rows delas.
      selecao: selecaoEfetiva(),
      custoConversaUsd,
      conversaProvider,
      buscaNaConversa,
      ultimoTotalExato,
    };
  }

  // Há o que gravar nesta conversa? O critério é PRODUTO na tela, e ele tem duas
  // metades, cada uma corrigindo um erro oposto:
  //
  // - `conversation` sozinho NÃO serve: minuta, mapa mental e "escolher com IA"
  //   são requests ISOLADOS e, por decisão de projeto, não entram nele. Medir
  //   por ele fazia uma sessão inteira de minutas e mapas nunca virar conversa
  //   no disco — a tela com meia dúzia de cards, o banco vazio, e fechar a aba
  //   apagava tudo sem aviso. Foi o bug que abriu esta rodada.
  // - O transcript INTEIRO também não serve: quando um turno falha, o histórico
  //   é desfeito (`conversation.pop()`) e a bolha do assistente é removida, mas
  //   a pergunta do usuário fica na tela. Gravar ali encheria a lista de
  //   conversas com perguntas que nunca foram respondidas.
  //
  // Sobra o certo: houve resposta — uma entrada de `assistant`, que é o que a
  // minuta e o mapa deixam — ou já existe histórico de API.
  function temProduto(transcript) {
    if (conversation.length) return true;
    return (transcript || []).some((t) => t && t.role === "assistant" && t.text);
  }

  // Grava agora. Chamada nos `finally` dos turnos — o fim de um turno é o
  // momento mais valioso para persistir, e é também quando `busy` acabou de
  // cair. NUNCA rejeita: a memória de caso é comodidade, e um
  // `unhandledrejection` aqui derrubaria o turno que ela deveria proteger.
  // Gravações são SERIALIZADAS numa fila. Sem isto, duas chamadas concorrentes
  // (o `finally` de um turno e o debounce da seleção, por exemplo) leem
  // `convAtual` ainda `null` — a primeira ainda não respondeu — e cada uma
  // MANDA CRIAR uma conversa. O sintoma na tela é exatamente o relatado: uma
  // pergunta vira duas conversas idênticas na lista.
  let filaSalvar = Promise.resolve();
  function salvarCasoAgora() {
    clearTimeout(salvarTimer);
    salvarDesde = 0;
    if (!memoriaDisponivel || !casoChave || !casoCarregado || memoriaMorta) {
      return Promise.resolve();
    }
    // `.catch` na CAUDA da fila, e não em volta: um erro numa gravação não pode
    // envenenar a promessa que as próximas encadeiam.
    filaSalvar = filaSalvar.then(gravarCasoEConversa, gravarCasoEConversa);
    return filaSalvar;
  }

  async function gravarCasoEConversa() {
    if (!memoriaDisponivel || !casoChave || !casoCarregado || memoriaMorta) return;
    try {
      const patch = snapshotCaso();
      if (!patch) return; // trocou de processo no meio (SPA)
      if (pecasSujas.size) {
        const ids = [...pecasSujas];
        const lote = ids.map(pecaParaBanco).filter(Boolean);
        // Limpa ANTES de gravar (para uma peça que mude no meio do await entrar
        // na próxima rodada), mas DEVOLVE os ids se a gravação falhar — senão
        // uma falha transitória do worker faria a peça baixada nunca chegar ao
        // disco, e o download seria repetido na sessão seguinte.
        pecasSujas.clear();
        try {
          await CASO.pecas(casoChave, lote);
        } catch (e) {
          for (const id of ids) pecasSujas.add(id);
          throw e;
        }
      }
      const r = await CASO.salvar(casoChave, patch);
      if (r && r.cheio) {
        memoriaMorta = true;
        console.log("[PJe IA] memória: DESLIGADA nesta sessão (disco cheio)");
        return;
      }
      // A conversa só é gravada quando existe: uma sessão em que o usuário só
      // marcou peças e não perguntou nada não cria conversa vazia na lista.
      //
      // O critério é o TRANSCRIPT, nunca `conversation` sozinho — e essa
      // distinção foi um bug de perda de trabalho. `conversation` é o histórico
      // que vai à API; minuta, mapa mental e "escolher com IA" são requests
      // ISOLADOS e, por decisão de projeto, não entram nele. Medir por ele
      // fazia uma sessão inteira de minutas e mapas nunca virar conversa no
      // disco: a tela com meia dúzia de cards, o banco vazio, e fechar a aba
      // apagava tudo sem aviso. O que o usuário reconhece como "a conversa" é
      // o que está na tela, e é o transcript que guarda isso.
      const snap = snapshotConversa();
      if (!temProduto(snap.transcript)) return;
      const c = await CASO.salvarConversa(casoChave, convAtual, snap, convVersao);
      if (!c || !c.convId) {
        // Silêncio aqui era o pior modo de falha do recurso: o worker pode não
        // responder (morto, contexto órfão, mensagem grande demais) e o
        // usuário seguiria trabalhando achando que está guardado.
        console.log(
          "[PJe IA] memória: a conversa NÃO foi gravada — o serviço da extensão não respondeu"
        );
        return;
      }
      convAtual = c.convId;
      // O carimbo desta gravação vira a base da próxima: sem atualizá-lo, a
      // segunda gravação desta mesma aba pareceria vir de um retrato velho e
      // seria tratada como conflito consigo mesma.
      convVersao = c.atualizadoEm || 0;
      if (c.ramificou && !avisouConflito) {
        // Outra aba estava na MESMA conversa e gravou antes. Em vez de perder
        // um dos dois trabalhos, o banco criou um ramo — e este passa a ser o
        // desta aba. Avisa UMA vez: repetir a cada gravação viraria ruído.
        avisouConflito = true;
        panel.setStatus(
          "Este processo está aberto em outra aba. Para não perder nada, o que você " +
            "fizer aqui virou uma conversa separada — ela aparece na lista de conversas."
        );
        atualizarListaConversas();
      }
    } catch (e) {
      // `console.log`, e não `debug`: o nível Verbose do DevTools vem
      // DESLIGADO por padrão, então um `debug` aqui é instrumentação que
      // ninguém vê — inútil justamente quando é preciso diagnosticar.
      console.log("[PJe IA] memória: FALHOU ao gravar —", e && e.message);
    }
  }

  // Gravação com debounce, para os gatilhos de alta frequência (cada clique na
  // seleção, cada peça que termina de baixar).
  function agendarSalvar() {
    if (!memoriaDisponivel || !casoChave || !casoCarregado || memoriaMorta) return;
    // Durante um turno ou uma exportação, quem grava é o `finally` de cada um:
    // o estado no meio do caminho é parcial (peças anexadas sem a resposta que
    // as consumiu) e a gravação disputaria o worker com o próprio streaming.
    if (busy || exportando) return;
    const agora = Date.now();
    if (!salvarDesde) salvarDesde = agora;
    // Teto de adiamento: passou de TETO_ADIAR sendo empurrado, grava já.
    if (agora - salvarDesde >= TETO_ADIAR) return void salvarCasoAgora();
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => {
      salvarCasoAgora();
    }, 1200);
  }

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
          if (resp.error) {
            // O worker classifica o erro (429/5xx/queda de rede = transitório) e
            // o `retryable` viajava até aqui só para ser jogado fora na
            // construção do Error. Quem re-tenta precisa dele.
            const err = new Error(resp.error);
            if (resp.retryable) err.retryable = true;
            // Diagnóstico que o worker anexou (hoje, o do offscreen do OCR):
            // sem carregá-lo no Error ele morre aqui, e o motivo real da falha
            // fica num console que ninguém abre.
            if (resp.diag) err.diag = resp.diag;
            return reject(err);
          }
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
  // Capacidades do modelo que REDIGE a minuta — quase sempre um irmão de
  // redação do mesmo provedor (ver modeloDaMinuta no worker). São caps
  // PRÓPRIAS porque diferem das do chat onde importa: Haiku (200 mil tokens,
  // 100 páginas) contra Sonnet 5 (1 milhão, 600). Quem decide por elas está
  // listado em aplicarCapsNaUI e em minutarAgora.
  let capsMinuta = null;
  let minutaInfo = null; // {model, trocado} da última resposta de caps

  // Ponto ÚNICO de aplicação da resposta de `caps`: refreshCaps e garantirCaps
  // faziam o mesmo bloco duas vezes, e agora que ele preenche DOIS conjuntos de
  // caps a duplicata divergiria no primeiro que alguém esquecesse.
  function aplicarRespostaCaps(r) {
    if (!r || !r.caps) return false;
    modelCaps = r.caps;
    modelInfo = { model: r.model, effort: r.effort };
    // Sem o campo `minuta` (worker de uma versão anterior ainda vivo): a minuta
    // degrada para o modelo do chat, que é o comportamento de sempre.
    capsMinuta = (r.minuta && r.minuta.caps) || r.caps;
    minutaInfo = r.minuta
      ? { model: r.minuta.model, trocado: !!r.minuta.trocado, fixado: !!r.minuta.fixado }
      : { model: r.model, trocado: false, fixado: false };
    aplicarCapsNaUI();
    return true;
  }

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
    // Qual modelo vai REDIGIR a minuta. Antes isto era uma SUGESTÃO ("experimente
    // trocar nas opções"); hoje a troca acontece de fato, então a barra ANUNCIA
    // o que vai rodar. Vem por caps/worker, nunca por nome de modelo aqui.
    panel.setModeloMinuta(
      minutaInfo && {
        model: minutaInfo.model,
        modelChat: modelInfo && modelInfo.model,
        trocado: minutaInfo.trocado,
        fixado: minutaInfo.fixado,
      }
    );
    // A biblioteca de modelos assume 1M tokens (a minuta manda os autos + vários
    // modelos). O gate olha as caps da MINUTA, não as do chat: quem escolhe
    // "Anthropic" no popup cai no Haiku (200k), e o gate desligava o botão 📚 e
    // fazia modelosMinutaSelecionados() devolver [] EM SILÊNCIO no envio — a
    // minuta saía sem peça-modelo nenhuma. Como ela agora roda no Sonnet 5 (1M),
    // medir pelo chat seria negar a feature por um limite que não se aplica.
    panel.setModelosHabilitado(((capsMinuta || modelCaps).contextTokens || 0) >= 1000000);
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
        // Impressão digital da chave em uso: este handler já roda no boot E a
        // cada troca de chave/modelo, então é por ele que os fileId gravados no
        // disco são invalidados quando o usuário muda de conta — sem um caminho
        // novo só para isso.
        if (r && "chaveHash" in r) chaveHashAtual = r.chaveHash || null;
        aplicarRespostaCaps(r);
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
          aplicarRespostaCaps(r);
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
      // a chave exigida é a do PROVEDOR do modelo escolhido (Anthropic, Google
      // ou OpenAI) — o provedor sai do prefixo do id, sem esperar o caps
      // chegar. customPrompt pega carona na mesma leitura (evita um get a mais).
      chrome.storage.local.get(
        ["apiKey", "geminiApiKey", "openaiApiKey", "model", "customPrompt"],
        (v) => {
          customPrompt = (v.customPrompt || "").trim();
          const m = String(v.model || "");
          const configurado = m.startsWith("gemini-")
            ? !!v.geminiApiKey
            : m.startsWith("gpt-")
              ? !!v.openaiApiKey
              : !!v.apiKey;
          panel.setConfigured(configurado);
        }
      );
      // Número do processo no cabeçalho: com vários processos abertos em abas,
      // era impossível saber a qual deles o painel se referia (ver DESIGN.md).
      try {
        panel.setProcesso(PJE.getNumeroProcesso() || "");
      } catch {
        /* página sem número identificável — o cabeçalho fica só com o produto */
      }
    } catch {
      avisarContextoPerdido();
    }
  }
  refreshKey();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.apiKey || ch.geminiApiKey || ch.openaiApiKey || ch.model))
      refreshKey();
    // effort entra aqui por causa do selo do modelo (mostra o nível ativo);
    // modeloMinuta, por causa do anúncio na barra de minuta e do gate da
    // biblioteca de peças-modelo — os dois saem das caps da minuta.
    if (
      area === "local" &&
      (ch.model ||
        ch.apiKey ||
        ch.geminiApiKey ||
        ch.openaiApiKey ||
        ch.effort ||
        ch.modeloMinuta)
    )
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

  panel.onReset(async () => {
    if (busy) return; // não zera no meio de uma resposta
    // Havia o que arquivar? MESMO critério da gravação (`temProduto`) — se a
    // mensagem dissesse "ficou guardada" num caso em que nada foi gravado, ela
    // seria mentira, e mentira sobre memória é pior do que silêncio.
    const tinhaTrabalho = temProduto(panel.lerTranscript ? panel.lerTranscript() : []);
    // ARQUIVA a conversa atual antes de abrir a nova. Esta é a correção de uma
    // decisão errada da rodada anterior: enquanto nada era persistido, "Nova
    // conversa" só limpava a tela. Com memória, sobrescrever significaria
    // DESTRUIR trabalho gravado — sem aviso e sem volta. Agora a anterior
    // continua no disco e reaparece na lista de conversas.
    await salvarCasoAgora();
    clearTimeout(estTimer);
    estSeq++; // descarta estimativas em voo
    zerarEstadoDaConversa();
    // `null` faz a próxima gravação CRIAR uma conversa, em vez de escrever por
    // cima da que acabou de ser arquivada.
    convAtual = null;
    convVersao = 0;
    panel.clearMessages();
    refreshKey(); // re-renderiza CTA de chave se necessário
    // As PEÇAS não são tocadas: elas são do processo, custaram download e
    // servem a todas as conversas dele. Para esquecer o processo inteiro há o
    // botão próprio na faixa de retomada.
    //
    // A guarda `memoriaDisponivel` estava FALTANDO aqui — era o único dos nove
    // acessos a `CASO` no arquivo sem ela. Como `caso.js` entra pelo manifest,
    // na prática nunca faltou; mas se o IIFE dele parar de carregar (erro de
    // sintaxe numa edição futura), o botão "Nova conversa" morre com
    // `ReferenceError` no MEIO do trabalho — depois de já ter limpado a tela e
    // antes de anunciar onde a conversa foi guardada. A guarda é de graça, e é
    // ela que o resto do arquivo já usa.
    if (memoriaDisponivel && casoChave) CASO.salvar(casoChave, { convAtual: null });
    atualizarListaConversas();
    // "Nova conversa" APAGA a tela, e uma tela apagada é indistinguível de
    // trabalho perdido — a queixa não é hipotética. O status diz para onde a
    // conversa foi e por qual botão se volta a ela.
    if (tinhaTrabalho) {
      panel.setStatus(
        "Conversa anterior guardada — ela continua na lista de conversas deste processo " +
          "(o botão com o número, no topo do painel)."
      );
    }
  });

  // "Ver na timeline": rola a página do PJe até a peça com destaque temporário
  // (PJE.scrollAte não clica em nada — zero efeito JSF, zero download).
  // Reentrada do PRÓPRIO gesto. Não usa `carregandoTimeline` de propósito: essa
  // flag é a da fila JSF e faria o envio ser recusado com "Lendo a lista oficial
  // de documentos", frase que aqui seria FALSA — rolar a timeline não fala com o
  // JSF (é o mesmo gesto que o usuário faria com o dedo, a qualquer hora).
  let procurandoNaTimeline = false;
  panel.onVerNaTimeline(async (id) => {
    if (PJE.scrollAte(id)) return;
    // A peça está na LISTA e não está na LINHA DO TEMPO — e desde que o
    // "⟳ Carregar tudo" passou a resolver pela rota REST (v0.38), esse é o caso
    // COMUM, não a exceção: a rota devolve os documentos todos em uma requisição
    // e não injeta nó nenhum na timeline. A mensagem antiga mandava clicar
    // justamente naquele botão, então o usuário repetia o gesto que não muda
    // nada e voltava ao mesmo aviso — laço sem saída, e a impressão correta de
    // que "a extensão tem tudo, mas o PJe não".
    //
    // Quem popula a timeline é UMA rota só: a rolagem. Então é ela que roda
    // aqui, e para assim que a peça aparece (`temNaTimeline`) em vez de varrer
    // os autos inteiros — numa peça do meio, segundos em vez do teto de 90 s.
    // A rolagem pode levar segundos, e nesse intervalo o usuário pode mandar uma
    // pergunta. O `.status` é UM só: sem esta guarda, o progresso da busca
    // sobrescreveria "Baixando peça 3 de 12…" e, pior, o `setStatus("")` do
    // sucesso APAGARIA o status do turno em andamento — deixando o envio mudo
    // justamente na parte lenta. Enquanto há turno, a busca é silenciosa; o que
    // ela faz de visível (a peça piscando na timeline) não depende do status.
    // Definido ANTES da guarda de reentrada porque aquela mensagem pisaria do
    // mesmo jeito.
    const dizer = (t) => {
      if (!busy) panel.setStatus(t);
    };
    if (procurandoNaTimeline) {
      dizer("Já estou procurando na linha do tempo — um instante.");
      return;
    }
    procurandoNaTimeline = true;
    const nome = metaDe(id).titulo;
    try {
      dizer('Procurando "' + nome + '" na linha do tempo do PJe…');
      await PJE.carregarTimelineCompleta(
        (n) => dizer("Carregando a linha do tempo do PJe… " + n + " peça(s)."),
        () => PJE.temNaTimeline(id)
      );
      if (PJE.scrollAte(id)) {
        dizer("");
        return;
      }
      // Chegou ao fim da timeline e a peça não está lá. Não é falha de
      // carregamento: ela veio da lista oficial (REST/grid), que é um
      // SUPERCONJUNTO da timeline. Dizer isso é melhor que mandar tentar de
      // novo — o usuário pode abrir a peça pelo preview, que não depende do DOM
      // da timeline.
      dizer(
        'A peça "' + nome + '" está na lista oficial do processo, mas o PJe não a ' +
          "mostra na linha do tempo desta tela. Passe o mouse sobre ela na lista para ver o conteúdo."
      );
    } catch (e) {
      console.warn("[PJe IA] ver na timeline:", e);
      dizer("Não foi possível percorrer a linha do tempo: " + ((e && e.message) || e));
    } finally {
      procurandoNaTimeline = false;
    }
  });

  // "Carregar todas as peças": rola a timeline do PJe até o fim pelo usuário
  // (o PJe carrega as peças sob demanda). O MutationObserver da timeline vai
  // repovoando a lista sozinho durante o processo; aqui só cuidamos do
  // feedback na dica. Sem guarda de busy: a rolagem não clica em nada (zero
  // efeito JSF) — é o mesmo gesto que o usuário faria à mão a qualquer hora.
  // Peças vindas da GRID (tela "Documentos"): mescladas às da timeline em
  // `setDocs`. Guardamos o `tipo` oficial de cada uma — a timeline não tem esse
  // dado e a categoria acaba adivinhada por regex sobre o título.
  let docsDaGrid = null;
  // Cobertura da última leitura da grid, para a exportação poder DIZER de onde
  // a lista veio em vez de deixar implícito que é o processo inteiro.
  let gridInfo = null;

  // Ponto ÚNICO que aplica a lista oficial, venha ela da API REST, da grid ou do
  // disco. Existe por causa de uma regressão possível e silenciosa: a API não
  // devolve `juntadoPor` nem as colunas `extras` daquele tribunal, e a grid (ou
  // uma leitura anterior já guardada) pode tê-los. Substituir a lista inteira
  // apagaria esses campos — e com eles o refino de relevância por autor
  // institucional, a coluna do índice do `.zip` e o sinal do "Escolher com IA",
  // sem nada na tela dizendo que sumiram. Aqui a fonte nova manda no que ela
  // sabe e CEDE no que não sabe.
  function aplicarListaOficial(lista) {
    const antes = new Map((docsDaGrid || []).map((d) => [d.id, d]));
    lista.docs = lista.docs.map((d) => {
      const velho = antes.get(d.id);
      if (!velho) return d;
      const out = Object.assign({}, d);
      for (const campo of ["juntadoPor", "extras", "tipo", "juntadoEm"]) {
        if (!out[campo] && velho[campo]) out[campo] = velho[campo];
      }
      return out;
    });
    docsDaGrid = lista.docs;
    // `lidaEm` é o que permite à dica dizer DE QUANDO é a lista quando ela voltar
    // do disco na próxima sessão. Sem isso o cache apresentaria uma leitura de
    // semanas atrás como se fosse de agora.
    lista.lidaEm = Date.now();
    gridInfo = lista;
    gravarGrid(); // uma vez por leitura — ver o comentário em `snapshotCaso`
    atualizarListaPecas();
  }

  let carregandoTimeline = false;
  // Reentrada do PRÓPRIO ⟳, separada da fila JSF de propósito: a rota 1 (API) e
  // a espera pela confirmação do usuário não tocam no JSF, e ocupar a fila nelas
  // seria bloquear envio, minuta, mapa e preview sem motivo — ver o comentário
  // em `carregandoTimeline = true`, mais abaixo.
  let lendoLista = false;
  panel.onCarregarTimeline(async () => {
    if (lendoLista || carregandoTimeline) return;
    // A ROTA 1 (grid) faz submits A4J dentro do iframe, e a exportação está
    // ativando peças na timeline — duas frentes na MESMA sessão JSF, que o
    // PJe serializa. É a outra ponta da guarda `bloqueadoPelaExportacao`: sem
    // ela, o único caminho que mexe no JSF sem passar por lá seria este.
    if (exportando) {
      panel.setTimelineTip({
        texto: "Exportação em andamento — aguarde o .zip terminar para recarregar a lista.",
      });
      return;
    }
    // A OUTRA ponta que faltava: durante um turno a extensão está ativando peças
    // na timeline, e a grid começaria a fazer POST de página inteira no iframe ao
    // mesmo tempo. Este par — turno × grid — é o que derruba a tela do usuário
    // em processo grande, e era o único que ninguém guardava.
    if (busy) {
      panel.setTimelineTip({
        texto: "Aguarde a resposta atual terminar para recarregar a lista de peças.",
      });
      return;
    }
    lendoLista = true;
    try {
      // ROTA 1 — API REST (`processos/{id}/documentos`): UMA requisição, ZERO
      // tela JSF gasta, e traz o tipo oficial de cada peça — que é o dado pelo
      // qual a grid existia. Ela vem primeiro porque é instantânea e porque o
      // custo da grid (uma tela por página) é justamente o que derruba a aba do
      // usuário em processo grande. Best-effort: `null` cai na rota 2, inclusive
      // quando a lista vem MENOR que a timeline já conhece — uma lista que
      // encolhe é pior que nenhuma.
      //
      // Repare que a fila JSF (`carregandoTimeline`) NÃO é ocupada aqui: esta
      // rota não fala com o JSF, e ocupá-la faria o envio ser recusado à toa.
      panel.setTimelineTip({
        texto: "Consultando a lista oficial de documentos do processo…",
        carregando: true,
      });
      const api = await PJE.listarPelaApi();
      if (api && api.docs.length) {
        aplicarListaOficial(api);
        panel.setTimelineTip({
          texto:
            "Lista completa: " + api.total + " documento(s), direto do PJe — " +
            "sem abrir telas do sistema.",
        });
        return;
      }

      // ROTA 2 — grid da tela "Documentos" (ver docs/pje-tela-documentos.md).
      // CARA: um POST de página INTEIRA por página, e é daqui que vem o risco de
      // a aba do usuário expirar. Por isso o aviso está AQUI, e não no clique do
      // ⟳: no caminho normal (rota 1) esse risco não existe, e avisar seria
      // descrever um perigo que ele não corre.
      //
      // A ESPERA PELO USUÁRIO ACONTECE COM A FILA JSF LIVRE. Ele pode ler o
      // aviso, ir fazer outra coisa e voltar minutos depois; com a fila tomada,
      // todo esse tempo o envio, a minuta e o preview seriam recusados — e com a
      // mensagem "Lendo a lista oficial de documentos", que nesse intervalo é
      // FALSA: não há leitura nenhuma acontecendo, só um modal aberto.
      if (!(await panel.confirmarLeituraPesada())) {
        panel.setTimelineTip(null);
        return;
      }
      // RECONFERE o que foi testado antes do `await`: o usuário pode ter mandado
      // uma pergunta enquanto o aviso estava na tela, e aí a grid entraria no
      // JSF junto com as ativações do turno — exatamente o par que derruba a
      // aba. Mesma regra da corrida dos workers de download.
      if (busy || exportando) {
        panel.setTimelineTip({
          texto: "Outra operação começou enquanto o aviso estava aberto — clique de novo quando ela terminar.",
        });
        return;
      }
      carregandoTimeline = true;
      const grid = await PJE.listarPelaGrid((n, pag, total) => {
        // `progressoGrid` alimenta a recusa de `ocupadoJsf`: enquanto isto roda,
        // o envio é negado, e negar sem dizer quanto falta é o que faz a recusa
        // parecer travamento.
        progressoGrid = pag && total ? "página " + pag + " de " + total : "";
        // O TAMANHO da leitura é sabido já na 1ª página, e ele é o melhor
        // previsor do único efeito colateral que o usuário sente: cada página é
        // um POST de página inteira, isto é, uma tela nova na sessão do PJe, e o
        // servidor guarda um punhado delas. Passando de ~6, a view desta aba
        // pode ser despejada — e quem DESCOBRE isso é o gesto seguinte do
        // usuário (o Enviar), que então parece o culpado. Avisar antes é a
        // diferença entre "a extensão quebrou o PJe" e "fui avisado, e não
        // perdi nada".
        panel.setTimelineTip({
          texto:
            "Lendo a lista oficial… " + n + " documento(s)" +
            (progressoGrid ? ", " + progressoGrid : "") + "." +
            (total >= 6
              ? " Processo grande: se a aba do PJe expirar ao terminar, reabra o " +
                "processo — a conversa e as peças já baixadas ficam guardadas."
              : ""),
          carregando: true,
        });
      });
      if (grid && grid.docs.length) {
        aplicarListaOficial(grid);
        panel.setTimelineTip({
          // A releitura recomeça da PRIMEIRA página — e é justamente ela que
          // gasta view JSF em volume (um POST de página inteira por página).
          // Convidar ao segundo clique sem dizer o preço é convidar à queda da
          // tela logo em seguida, no gesto seguinte do usuário. O que ele
          // precisa saber cabe numa oração: o que pode acontecer e que não se
          // perde nada.
          texto: grid.incompleto
            ? grid.total +
              " documento(s) — leitura PARCIAL (" +
              grid.paginasLidas +
              " de " +
              grid.paginas +
              " páginas). Clique de novo para tentar o resto: a releitura " +
              "recomeça do início e cansa a sessão do PJe; se a tela desta aba " +
              "expirar, basta reabrir o processo — a conversa e as peças ficam guardadas."
            : "Lista completa: " +
              grid.total +
              " documento(s) (" +
              grid.paginas +
              " de " +
              grid.paginas +
              " páginas lidas).",
        });
        return;
      }

      // ROTA 3 — fallback: rolar a timeline até o fim, como sempre.
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
      // As duas flags saem aqui: `carregandoTimeline` pode nem ter sido tomada
      // (o caminho da API não a toma), e zerá-la à toa é inofensivo — o que não
      // pode acontecer é sair deste handler com qualquer uma delas presa.
      carregandoTimeline = false;
      lendoLista = false;
      progressoGrid = "";
      agendarSalvar();
    }
  });

  // ---------------------------------------------------------------------------
  // "Baixar .zip": exporta as peças para trabalhar os autos FORA da extensão.
  //
  // Sem a permissão "downloads", de propósito: ela mudaria o aviso de instalação
  // da Web Store numa extensão já publicada — o mesmo motivo que fez a leitura da
  // grid virar iframe em vez de aba. Blob + âncora `download` (o caminho que o
  // mapa e a minuta já usam) resolve, e como o resultado é UM arquivo, não há a
  // enxurrada de downloads que a API evitaria.
  // ---------------------------------------------------------------------------
  let exportando = false;
  panel.onExportarZip(async (docs, opcoes) => {
    if (exportando) return;
    if (busy) {
      panel.setStatus("Aguarde a resposta atual terminar para exportar as peças.");
      return;
    }
    if (carregandoTimeline) {
      panel.setStatus("Aguarde a leitura da lista de peças terminar para exportar.");
      return;
    }
    if (typeof PjeExport === "undefined" || typeof ZipW === "undefined") {
      panel.setStatus("Exportação indisponível: recarregue a página do processo.");
      return;
    }
    exportando = true;
    const sinal = { cancelado: false };
    const todas = !!(opcoes && opcoes.todas);
    panel.setZipOcupado(true);
    // `docs` já são os objetos {id, titulo} do painel — passar por metaDe
    // (que recebe um ID) devolveria "Peça [object Object]" em cada linha.
    panel.startPrep(docs, {
      titulo: todas
        ? "Exportando as " + docs.length + " peças da lista…"
        : "Exportando " + docs.length + " peça(s) marcada(s)…",
      fim: (total, feitas) =>
        feitas === total
          ? "Arquivo .zip gerado com " + total + " peça(s)"
          : "Arquivo .zip gerado — " + feitas + " de " + total + " peça(s)",
      onCancelar: () => {
        sinal.cancelado = true;
      },
    });
    try {
      const r = await PjeExport.montarZip({
        docs,
        cnj: PJE.getNumeroProcesso(),
        // Ficha do processo (classe, assunto, partes…): sai do DOM que já está
        // na tela e é o que faz o pacote se explicar sozinho no destino.
        ficha: PJE.lerCabecalhoProcesso(),
        origemLista: descreverOrigemLista(todas),
        sinal,
        onEtapa: (id, estado) => panel.setPrepState(id, estado),
        // Mesmo caminho do envio: o que já está em cache não baixa de novo, e o
        // que baixar aqui fica disponível para a conversa (prefetch de graça).
        // `{bytes:true}` porque o pacote leva o ARQUIVO ORIGINAL: uma peça
        // retomada da memória tem `fileId` e nenhum byte, e sem a flag ela saía
        // vazia do `.zip` — em silêncio, num arquivo que só se abre depois.
        obter: (id) => garantirBaixada(id, { bytes: true }),
      });
      panel.endPrep();
      baixarBlob(r.nome, r.blob);
      const partes = [r.resumo.ok + " peça(s)"];
      if (r.resumo.paginas) partes.push(r.resumo.paginas + " páginas");
      partes.push(fmtMB(r.blob.size));
      panel.setStatus(
        "✅ " + r.nome + " — " + partes.join(", ") +
          (r.resumo.falhas
            ? ". " + r.resumo.falhas + " peça(s) falharam (a relação está no indice.txt)."
            : ".")
      );
    } catch (e) {
      const msg = (e && e.message) || String(e);
      panel.endPrep(true);
      panel.setStatus(
        msg === "cancelado" ? "Exportação cancelada." : "Não foi possível exportar: " + msg
      );
      if (msg !== "cancelado") console.warn("[PJe IA] exportar zip:", e);
    } finally {
      exportando = false;
      panel.setZipOcupado(false);
      // A exportação baixou dezenas de peças que a memória ainda não conhece —
      // gravá-las aqui é o que faz um "Baixar .zip" adiantar o turno seguinte.
      salvarCasoAgora();
    }
  });

  // ---------------------------------------------------------------------------
  // EXTRAÇÃO DE TEXTO DAS PEÇAS
  //
  // Lê a camada de texto dos PDFs (pdf.js, no documento offscreen) e devolve UM
  // `.md` com o processo inteiro — `# <peça>` / `## Página N`, o mesmo formato
  // do tjocr, para alimentar o TecJustiça Sigilo e o Claude Code sem adaptação.
  //
  // INVARIANTE: o texto extraído NÃO entra no payload de nenhum request de chat.
  // A extração da v0.21.0 foi removida exatamente por isso — no Gemini, que
  // cobra 258 tokens fixos por página de PDF e não cobra o texto nativo, mandar
  // o texto levou o contexto de 59% para 153%. Aqui o destino é o disco do
  // usuário, e `montarBlocos` nunca lê o resultado disto.
  // ---------------------------------------------------------------------------
  let extraindoTexto = false;

  // Teto por peça. O PDF vai ao iframe por postMessage TRANSFERÍVEL (cópia
  // zero), então o teto aqui é de sanidade de memória, não de serialização.
  const MAX_B64_EXTRACAO = 96 * 1024 * 1024;

  // TETO DE TEMPO DO OCR DE UMA PÁGINA.
  //
  // Sem isto, o `rpc` espera PARA SEMPRE: se o offscreen não responder — motor
  // que não inicializa, documento derrubado, mensagem perdida — a extração fica
  // parada na mesma peça, sem erro, sem fim e sem arquivo. Foi exatamente o que
  // chegou ao usuário como "fica em loop e não termina".
  //
  // É a mesma regra que o `MOVS_TIMEOUT_MS` das movimentações e o `pje login` do
  // CLI já registram, e que eu havia escrito no CLAUDE.md nesta mesma rodada
  // antes de deixar esta chamada sem teto: rota que pendura precisa de
  // ALTERNATIVA, não de paciência.
  //
  // Generoso de propósito: a PRIMEIRA página paga o warm-up do motor (carregar
  // 6 MB de modelo e compilar o WASM), que em máquina lenta passa de meio minuto.
  // A PRIMEIRA página é especial e ficou mais cara de propósito: além do
  // warm-up do motor, é nela que o offscreen mede WASM contra WebGPU para
  // decidir o backend (`medirBackends`). O pior caso somado — init do WASM, o
  // OCR do WASM, init do WebGPU e o orçamento do desafiante — cabe aqui com
  // folga; o duelo tem tetos próprios justamente para não furar este.
  const OCR_TIMEOUT_1A_MS = 240000;
  const OCR_TIMEOUT_MS = 60000;

  function comTeto(promessa, ms, oQue) {
    let t;
    return Promise.race([
      promessa.finally(() => clearTimeout(t)),
      new Promise((_, rej) => {
        t = setTimeout(
          () => rej(new Error(oQue + " não respondeu em " + Math.round(ms / 1000) + "s")),
          ms
        );
      }),
    ]);
  }

  // --- iframe de leitura de PDF ---------------------------------------------
  // Página de extensão embutida oculta. Não é o content script (nenhum bundle
  // entra em página de tribunal) nem o offscreen (`page.render()` trava lá, com
  // o rAF congelado). Ver o cabeçalho de src/ocr-render.js.
  let renderFrame = null;
  let renderPronto = null;
  const RENDER_NONCE = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const RENDER_TIMEOUT_MS = 20000;
  let reqSeq = 0;

  function garantirRender() {
    if (renderPronto) return renderPronto;
    renderPronto = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        limparRender();
        reject(new Error("a leitura de PDF não iniciou a tempo"));
      }, RENDER_TIMEOUT_MS);
      function aoPronto(ev) {
        const m = ev.data;
        if (!m || m.__pjeia !== "render-pronto" || m.nonce !== RENDER_NONCE) return;
        clearTimeout(t);
        window.removeEventListener("message", aoPronto);
        resolve(renderFrame);
      }
      window.addEventListener("message", aoPronto);
      const fr = document.createElement("iframe");
      fr.src = chrome.runtime.getURL("src/ocr-render.html?n=" + encodeURIComponent(RENDER_NONCE));
      fr.setAttribute("aria-hidden", "true");
      fr.setAttribute("tabindex", "-1");
      fr.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
      document.documentElement.appendChild(fr);
      renderFrame = fr;
    });
    return renderPronto;
  }

  function limparRender() {
    if (renderFrame && renderFrame.parentNode) renderFrame.parentNode.removeChild(renderFrame);
    renderFrame = null;
    renderPronto = null;
  }

  function b64ParaBytes(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // Manda o PDF ao iframe com o ArrayBuffer TRANSFERIDO — cópia zero. Um
  // inquérito de 140 páginas são dezenas de MB; pelo caminho do worker eles
  // virariam base64 (+33%) e mais duas cópias de string.
  async function lerPdfNoFrame(b64, querImagens) {
    const fr = await garantirRender();
    const bytes = b64ParaBytes(b64);
    const req = ++reqSeq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        window.removeEventListener("message", aoLido);
        reject(new Error("a leitura do PDF demorou demais"));
      }, 180000);
      function aoLido(ev) {
        const m = ev.data;
        if (!m || m.__pjeia !== "lido" || m.req !== req) return;
        clearTimeout(t);
        window.removeEventListener("message", aoLido);
        if (m.ok) resolve(m.resultado);
        else reject(new Error(m.erro || "falha ao ler o PDF"));
      }
      window.addEventListener("message", aoLido);
      fr.contentWindow.postMessage(
        { __pjeia: "ler", nonce: RENDER_NONCE, req, buf: bytes.buffer, querImagens },
        "*",
        [bytes.buffer]
      );
    });
  }

  // O offscreen tem console próprio, alcançável só por chrome://extensions ->
  // Inspecionar visualizações. Um relato de erro que exige três consoles não
  // chega a ninguém: o diagnóstico volta junto da resposta e é impresso AQUI,
  // no F12 da página do processo, que é onde o usuário já está.
  function mostrarDiag(linhas) {
    if (!linhas || !linhas.length) return;
    for (const l of linhas) console.log("[PJe IA OCR][offscreen]", l);
  }

  function rotuloEstado(e) {
    if (e === "escaneada") return "_[página digitalizada — não foi possível rasterizar]_";
    if (e === "camada-ruim") return "_[camada de texto defeituosa]_";
    if (e === "vazia") return "_[página em branco]_";
    if (e === "falhou") return "_[não foi possível ler esta página]_";
    // OCR rodou e não achou texto. É o caso da FOTO — o retrato de uma estrada
    // rural devolve nada, e está CERTO. Dizer isso vale mais que uma seção vazia.
    if (e === "ocr-vazio") return "_[imagem sem texto legível]_";
    if (e === "ocr-falhou") return "_[o reconhecimento de texto falhou nesta página]_";
    return "";
  }

  panel.onExtrairTexto(async (docs, opcoes) => {
    if (extraindoTexto) return;
    if (busy) {
      panel.setStatus("Aguarde a resposta atual terminar para extrair o texto.");
      return;
    }
    if (ocupadoJsf()) return;
    // Mesma guarda do `.zip`: sem `exportar.js` carregado não há como ordenar as
    // peças, e um ReferenceError aqui derrubaria o handler inteiro em silêncio.
    if (typeof PjeExport === "undefined") {
      panel.setStatus("Extração indisponível: recarregue a página do processo.");
      return;
    }
    if (!docs || !docs.length) {
      panel.setStatus("A lista de peças está vazia — não há texto para extrair.");
      return;
    }
    const todas = !!(opcoes && opcoes.todas);
    extraindoTexto = true;
    const sinal = { cancelado: false };
    panel.setZipOcupado(true);
    panel.startPrep(docs, {
      titulo: todas
        ? "Extraindo o texto das " + docs.length + " peças da lista…"
        : "Extraindo o texto de " + docs.length + " peça(s)…",
      fim: (total, feitas) =>
        feitas === total
          ? "Texto extraído de " + total + " peça(s)"
          : "Texto extraído — " + feitas + " de " + total + " peça(s)",
      onCancelar: () => {
        sinal.cancelado = true;
      },
    });

    console.log(
      "%c[PJe IA OCR] início",
      "font-weight:bold",
      "| versão " + (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "?"),
      "|", docs.length, "peça(s)"
    );
    const partes = [];
    const falhas = [];
    let comTexto = 0;
    let pagsNativas = 0;
    let pagsOcr = 0;
    let pagsSemOcr = 0;
    let backendOcr = "";
    const errosOcr = [];
    const t0Ocr = Date.now();
    // TEMPO POR ETAPA, e não um número só. O card mostrava "~18,0 s por página"
    // calculado como (agora − início) ÷ páginas reconhecidas — o que soma ao OCR
    // o download de cada peça na fila serializada do PJe e a rasterização. O
    // usuário lia aquilo como "o OCR leva 18 s", e não havia como saber onde o
    // tempo estava indo: otimizar sem separar as etapas é apostar. As três são
    // medidas em separado e vão ao log por peça e ao resumo no fim.
    let msBaixando = 0;
    let msLendoPdf = 0;
    let msOcr = 0;
    // Hoje sempre com OCR. A flag existe para o dia em que houver um "só o texto
    // nativo" na interface — e para deixar explícito, no código, que a
    // rasterização é o que separa segundos de minutos.
    const comOcr = true;
    try {
      const { docs: emOrdem, criterio } = PjeExport.ordenarCronologico(docs);

      // PREPARO PIPELINADO AO OCR — a mesma técnica da bomba de upload dentro de
      // `baixarSelecionadas`. Baixar a peça e rasterizá-la não disputa recurso
      // nenhum com o reconhecimento: o download é rede mais a fila JSF, a
      // rasterização é o pdf.js no iframe, e o OCR é o motor no offscreen. Em
      // série, o turno custa Σdownload + Σraster + Σocr; adiantando UMA peça,
      // custa Σocr mais o preparo da primeira. Num processo migrado do SAJ —
      // 96 peças de UMA página digitalizada cada — é o preparo inteiro que sai
      // da conta.
      //
      // PROFUNDIDADE 1, deliberadamente. Cada folha rasterizada é um data URL de
      // ~250 KB vivo em memória; adiantar várias peças de 20 folhas encheria a
      // aba para ganhar um tempo que a fila serializada do PJe não deixa ganhar
      // de todo jeito.
      //
      // `prepararPeca` NUNCA REJEITA: devolve `{erro}`. Uma rejeição de uma peça
      // adiantada não teria ninguém esperando por ela no instante em que
      // acontece — seria uma unhandled rejection derrubando um turno por causa
      // de uma peça, o oposto da regra de que falha de download não derruba a
      // extração.
      const prepararPeca = async (d) => {
        try {
          // CEDE ao cancelamento, e a guarda que importa é a de DEPOIS do
          // download. MEDIDO: o laço dispara o preparo da peça seguinte antes do
          // OCR da atual, então quando o usuário cancela o download dela já
          // começou e não há como evitá-lo — mas a RASTERIZAÇÃO ainda não, e é
          // ela que ocuparia o iframe com o pdf.js depois de o usuário já ter
          // desistido. Uma folha órfã por cancelamento, e ela acontece DEPOIS
          // que o turno termina, que é o que a torna invisível.
          //
          // A guarda de entrada cobre a janela (curta) entre o disparo e a
          // primeira linha, e o `telaMorta` — que aí sim vale a pena: com a view
          // do PJe morta, cada requisição restante é só mais um POST que produz
          // erro.
          if (sinal.cancelado || telaMorta) return { d, cancelada: true };
          panel.setPrepState(d.id, "loading");
          // `{bytes:true}` é obrigatório: peça retomada da memória de caso tem
          // `fileId` e ZERO bytes, e sem a flag ela sairia vazia — em silêncio.
          const tBaixa = Date.now();
          const c = await garantirBaixada(d.id, { bytes: true });
          msBaixando += Date.now() - tBaixa;
          if (sinal.cancelado) return { d, cancelada: true };
          if (!c) throw new Error("peça vazia");
          if (c.kind !== "pdf" || !c.b64) return { d, c };
          if (c.b64.length > MAX_B64_EXTRACAO) {
            throw new Error(
              "peça grande demais para a extração (" + fmtMB((c.b64.length * 3) / 4) + ")"
            );
          }
          console.log("[PJe IA OCR] lendo", d.id, d.titulo);
          const tLeitura = Date.now();
          const res = await comTeto(lerPdfNoFrame(c.b64, comOcr), 180000, "a leitura do PDF");
          const msEstaLeitura = Date.now() - tLeitura;
          msLendoPdf += msEstaLeitura;
          console.log(
            "[PJe IA OCR]", d.id, "->", res.paginas, "pág,", res.precisamOcr, "p/ OCR",
            "| leitura+raster", msEstaLeitura, "ms"
          );
          return { d, c, res };
        } catch (e) {
          return { d, erro: e };
        }
      };

      // A primeira já parte antes do laço; dentro dele, a seguinte é disparada
      // ANTES do OCR da atual — é isso que faz as duas etapas se sobreporem.
      let emPreparo = emOrdem.length ? prepararPeca(emOrdem[0]) : null;
      for (let iPeca = 0; iPeca < emOrdem.length; iPeca++) {
        if (sinal.cancelado) throw new Error("cancelado");
        const pronta = await emPreparo;
        // A condição é reconferida AQUI e não no topo: o `await` acima é uma
        // janela em que o usuário pode ter cancelado e em que a view do PJe pode
        // ter morrido. Estado conferido antes de um `await` precisa ser
        // reconferido depois dele.
        emPreparo =
          iPeca + 1 < emOrdem.length && !sinal.cancelado && !telaMorta
            ? prepararPeca(emOrdem[iPeca + 1])
            : null;
        const d = pronta.d;
        // Peça abandonada no preparo (cancelamento/tela morta): não é falha —
        // ninguém tentou baixá-la. O `if` do topo do laço já jogou o turno fora;
        // este ramo só evita que ela vire um erro nomeado no relatório.
        if (pronta.cancelada) throw new Error("cancelado");
        try {
          if (pronta.erro) throw pronta.erro;
          const c = pronta.c;
          const resPronta = pronta.res;

          if (c.kind === "text") {
            // HTML e RTF do editor já são texto: não há PDF para abrir.
            partes.push("# " + d.titulo + "\n\n" + (c.text || "").trim() + "\n");
            comTexto++;
          } else if (resPronta) {
            // O download, o teto de tamanho e a leitura do PDF já aconteceram em
            // `prepararPeca`, adiantados enquanto a peça anterior fazia OCR.
            const res = resPronta;
            pagsNativas += res.nativas;

            // OCR das páginas sem camada de texto, UMA POR VEZ: o motor é único
            // e a memória de uma A4 rasterizada não é pequena.
            for (const f of res.folhas) {
              if (!f.img) continue;
              if (sinal.cancelado) throw new Error("cancelado");
              // O card marca uma linha por PEÇA, e uma peça pode ter 22 páginas
              // escaneadas: sem esta nota o usuário fica minutos olhando o mesmo
              // spinner sem saber se anda. Ela conta PÁGINAS, que é a unidade
              // real do trabalho, e mostra o ritmo medido — não uma promessa.
              const feitas = pagsOcr;
              // DUAS grandezas, porque respondem a perguntas diferentes e
              // confundi-las foi o defeito: o RITMO (tudo ÷ páginas) é o que
              // permite estimar quando termina, e o tempo de OCR é o que diz se
              // o motor está no backend certo. Enquanto havia só o ritmo, um
              // download lento da fila do PJe aparecia como "o OCR está lento".
              const ritmo = feitas && Date.now() > t0Ocr ? (Date.now() - t0Ocr) / feitas : 0;
              const mediaOcr = feitas ? msOcr / feitas : 0;
              panel.setPrepNota(
                "Reconhecendo texto (OCR) — " +
                  (feitas + 1) + "ª página" +
                  (mediaOcr ? " · OCR " + (mediaOcr / 1000).toFixed(1) + " s" : "") +
                  (ritmo ? " · ritmo " + (ritmo / 1000).toFixed(1) + " s/pág" : "") +
                  " · " + d.titulo.slice(0, 32) + ", fl. " + f.p
              );
              try {
                const primeira = pagsOcr === 0;
                const o = await comTeto(
                  rpc({ type: "ocrReconhecer", payload: { img: f.img } }),
                  primeira ? OCR_TIMEOUT_1A_MS : OCR_TIMEOUT_MS,
                  "o reconhecimento de texto"
                );
                mostrarDiag(o && o.resultado && o.resultado.diag);
                const t = (o.resultado && o.resultado.texto) || "";
                // FORA do `if (t)`: a página que o motor processou e devolveu
                // vazia (a foto sem texto legível) consumiu o mesmo tempo, e
                // deixá-la de fora tornava a média otimista. Pior, `backendOcr`
                // saía junto: num processo só de fotos ilegíveis o cabeçalho do
                // .md ficaria SEM o nome do motor — exatamente o campo que
                // existe para diagnosticar lentidão.
                if (typeof o.resultado.ms === "number") msOcr += o.resultado.ms;
                if (o.resultado.backend) backendOcr = o.resultado.backend;
                if (t) {
                  f.texto = t;
                  f.ocr = true;
                  f.score = o.resultado.score;
                  pagsOcr++;
                  // O ESTADO PRECISA SER LIMPO no sucesso. Ele nasce da
                  // classificação ("escaneada"/"camada-ruim") e era usado
                  // depois para contar as páginas SEM texto reconhecível — de
                  // modo que toda página lida com sucesso continuava contada
                  // como não lida. O cabeçalho do .md dizia, num processo real,
                  // "93 reconhecida(s) por OCR local, 93 sem texto
                  // reconhecível": as mesmas 93. O arquivo sai da ferramenta e
                  // vira registro de trabalho; ele não pode mentir sobre o que
                  // leu.
                  f.estado = "ocr-ok";
                } else {
                  f.estado = "ocr-vazio";
                }
              } catch (e) {
                f.estado = "ocr-falhou";
                f.erroOcr = (e && e.message) || String(e);
                errosOcr.push(f.erroOcr);
                mostrarDiag(e && e.diag);
                console.warn("[PJe IA OCR] falhou em", d.id, "fl." + f.p, "->", f.erroOcr);
              }
              delete f.img; // solta o data URL da página antes da próxima
            }
            panel.setPrepNota("");
            // Sobram aqui os DOIS casos legítimos de "sem texto reconhecível":
            // a página que precisava de OCR e não chegou a ser tentada (a
            // rasterização falhou, então não houve imagem) e a que o OCR leu
            // sem achar texto — a foto de uma estrada rural, em que o resultado
            // vazio está CERTO. A página lida com sucesso saiu daqui ao ganhar
            // o estado "ocr-ok".
            pagsSemOcr += res.folhas.filter(
              (f) =>
                f.estado === "escaneada" ||
                f.estado === "camada-ruim" ||
                f.estado === "ocr-vazio"
            ).length;

            const folhas = res.folhas
              .map((f) => {
                const corpo =
                  f.texto ||
                  (f.estado === "ocr-falhou" && f.erroOcr
                    ? "_[o reconhecimento de texto falhou nesta página: " + f.erroOcr + "]_"
                    : rotuloEstado(f.estado));
                const marca = f.ocr
                  ? "\n\n_[texto reconhecido por OCR" +
                    (typeof f.score === "number" ? " — confiança " + f.score.toFixed(0) + "%" : "") +
                    "]_"
                  : "";
                return "## Página " + f.p + "\n\n" + corpo + marca;
              })
              .join("\n\n");
            partes.push("# " + d.titulo + "\n\n" + folhas + "\n");
            comTexto++;
          } else {
            // Imagem anexada: não tem camada de texto para ler. Dizer o motivo
            // vale mais que uma seção vazia (regra do projeto: conjunto vazio
            // se explica, não desaparece).
            partes.push("# " + d.titulo + "\n\n_[anexo em imagem — o texto depende do OCR]_\n");
          }
          panel.setPrepState(d.id, "done");
        } catch (e) {
          falhas.push({ id: d.id, titulo: d.titulo, motivo: (e && e.message) || String(e) });
          panel.setPrepState(d.id, "erro");
        }
      }
      if (sinal.cancelado) throw new Error("cancelado");
      if (!comTexto) throw new Error("nenhuma peça devolveu texto");

      // ONDE FOI O TEMPO. Sem esta linha, "o OCR está lento" é indistinguível
      // de "o download do PJe está lento" — e as duas pedem correções opostas.
      const msTotal = Date.now() - t0Ocr;
      const seg = (ms) => (ms / 1000).toFixed(1) + "s";
      // A SOMA DAS ETAPAS PASSA DO TOTAL, e isso é o pipeline funcionando: o
      // preparo de uma peça corre debaixo do OCR da anterior. O campo que estava
      // aqui era "outros", calculado como `max(0, total − soma)` — com
      // sobreposição ele dá SEMPRE zero, escondendo justamente o que a mudança
      // economizou e sugerindo que não sobrou nada por explicar. Os dois números
      // agora são ditos pelo nome: o que se ganhou sobrepondo, e o que nenhuma
      // etapa reivindica (o transporte da imagem entre os três contextos e a
      // montagem do arquivo).
      const somaEtapas = msBaixando + msLendoPdf + msOcr;
      console.log(
        "%c[PJe IA OCR] fim", "font-weight:bold",
        "| total", seg(msTotal),
        "| download", seg(msBaixando),
        "| leitura+raster", seg(msLendoPdf),
        "| OCR", seg(msOcr) + (pagsOcr ? " (" + seg(msOcr / pagsOcr) + "/pág)" : ""),
        "| sobreposto", seg(Math.max(0, somaEtapas - msTotal)),
        "| não medido", seg(Math.max(0, msTotal - somaEtapas)),
        "|", backendOcr || "sem OCR"
      );

      // Os motivos de falha do OCR vão AGRUPADOS no cabeçalho: espalhados pelas
      // páginas, quem abre o arquivo teria de caçá-los folha a folha.
      const motivosOcr = [...new Set(errosOcr)];
      const cnj = PJE.getNumeroProcesso() || "processo";
      const cab =
        "# Processo " + cnj + "\n\n" +
        "> Texto extraído pela extensão TecJustiça PJe em " +
        new Date().toLocaleString("pt-BR") + ".\n" +
        "> Ordem das peças: " + criterio + ".\n" +
        "> " + comTexto + " peça(s), " + pagsNativas + " página(s) com texto nativo" +
        (pagsOcr
          ? ", " + pagsOcr + " reconhecida(s) por OCR local (PP-OCRv6" +
            (backendOcr ? ", " + backendOcr : "") +
            // O TEMPO MÉDIO vai junto do backend pela MESMA razão que o backend
            // vai: uma regressão de desempenho não deixa outro vestígio. Foi a
            // palavra "WebGPU" neste cabeçalho que revelou que o motor rodava
            // 7,6× mais devagar que o necessário; sozinha ela dizia QUAL, e não
            // QUANTO.
            (pagsOcr && msOcr ? ", " + (msOcr / pagsOcr / 1000).toFixed(1) + " s/página" : "") +
            ")"
          : "") +
        (pagsSemOcr ? ", " + pagsSemOcr + " sem texto reconhecível" : "") + ".\n" +
        (pagsOcr
          ? "> O texto reconhecido por OCR pode conter erros — confira no documento original.\n"
          : "") +
        (motivosOcr.length
          ? "> O reconhecimento falhou em " + errosOcr.length + " página(s). Motivo(s): " +
            motivosOcr.join(" · ") + ".\n"
          : "") +
        (falhas.length
          ? "> Não entraram: " +
            falhas.map((f) => f.titulo + " (" + f.motivo + ")").join("; ") + ".\n"
          : "") +
        "> Confira sempre no documento original: assinaturas, carimbos e imagens não " +
        "aparecem aqui.\n";

      const md = cab + "\n---\n\n" + partes.join("\n---\n\n");
      console.log(
        "%c[PJe IA OCR] fim",
        "font-weight:bold",
        "|", comTexto, "peça(s) |", pagsNativas, "nativas |", pagsOcr, "por OCR |",
        errosOcr.length, "falhas de OCR |", falhas.length, "peças de fora"
      );
      panel.endPrep();
      baixarBlob("processo-" + cnj + ".md", new Blob([md], { type: "text/markdown" }));
      panel.setStatus(
        "✅ Texto de " + comTexto + " peça(s) baixado" +
          (pagsOcr ? " — " + pagsOcr + " página(s) lidas por OCR local." : ".")
      );
    } catch (e) {
      const msg = (e && e.message) || String(e);
      panel.endPrep(true);
      panel.setStatus(
        msg === "cancelado" ? "Extração cancelada." : "Não foi possível extrair o texto: " + msg
      );
      if (msg !== "cancelado") console.warn("[PJe IA] extrair texto:", e);
    } finally {
      extraindoTexto = false;
      panel.setZipOcupado(false);
      panel.setPrepNota("");
      // O iframe segura 1,7 MB de pdf.js e o documento aberto. Fora de uso ele
      // e' peso morto na aba do tribunal — e recria-lo custa ~1 s.
      limparRender();
      // Baixou dezenas de peças que a memória ainda não conhece — mesma razão
      // do `.zip`.
      salvarCasoAgora();
    }
  });

  // ---------------------------------------------------------------------------
  // PACOTE DE CARTA PRECATÓRIA
  //
  // Duas coisas separam este fluxo do "Baixar .zip" comum:
  //
  // (1) Ele PRECISA da timeline completa, e não por comodidade. Das três peças
  //     do pacote, duas são inalcançáveis numa lista parcial: a peça de origem é
  //     a MAIS ANTIGA do processo (no 0200984-48.2025 ela estava na posição 103
  //     de 103, e a timeline abre com 47), e uma carta expedida meses atrás fica
  //     fora do trecho já rolado. Sem carregar, o pacote sairia faltando peça —
  //     em silêncio, num zip que só se confere depois de aberto. Por isso a
  //     rotina é chamada AQUI, e o usuário não precisa lembrar de clicar.
  //
  // (2) A rota é a TIMELINE (scroll), nunca a grid da tela "Documentos". A grid
  //     traz o tipo oficial e o total de páginas, mas NÃO traz o movimento
  //     processual — e é o movimento que distingue a carta expedida da carta
  //     devolvida. Preferir a grid aqui, como faz o "⟳ Carregar tudo", tornaria
  //     o pacote menos confiável justamente no ponto que mais importa.
  // ---------------------------------------------------------------------------
  panel.onPrecatorias(async () => {
    if (typeof PjePrecatoria === "undefined" || typeof PjeExport === "undefined") {
      panel.setStatus("Recurso indisponível: recarregue a página do processo.");
      return;
    }
    if (exportando || carregandoTimeline) {
      panel.setStatus("Aguarde a operação em andamento terminar.");
      return;
    }
    if (busy) {
      panel.setStatus("Aguarde a resposta atual terminar.");
      return;
    }
    carregandoTimeline = true;
    try {
      panel.setTimelineTip({
        texto: "Carregando a linha do tempo inteira para achar as cartas precatórias…",
        carregando: true,
      });
      await PJE.carregarTimelineCompleta((n) =>
        panel.setTimelineTip({
          texto: "Carregando a linha do tempo… " + n + " peça(s).",
          carregando: true,
        })
      );
      panel.setTimelineTip(null);
      atualizarListaPecas();
      const eventos = PJE.lerEventos();
      const dados = PjePrecatoria.montarPacotes(eventos, { ficha: PJE.lerCabecalhoProcesso() });
      panel.mostrarPrecatorias(dados, (escolhidos) => baixarPrecatorias(escolhidos, dados));
    } catch (e) {
      console.warn("[PJe IA] precatórias:", e);
      panel.setTimelineTip(null);
      panel.setStatus("Não foi possível montar os pacotes: " + ((e && e.message) || e));
    } finally {
      carregandoTimeline = false;
    }
  });

  // O que entra no PACOTE DE MALOTE é outra coisa do que entra no chat: aqui o
  // arquivo vai ser ANEXADO a um e-mail para outro juízo, então o que vale é o
  // documento do tribunal — timbre, paginação, rodapé de assinatura —, e não o
  // conteúdo da peça. A rota REST de sempre entrega o CONTEÚDO (peça do editor
  // vira texto), que serve para ler e para a IA analisar, mas não é documento.
  //
  // Então: tenta o PDF oficial primeiro (o mesmo arquivo do ⬇ do visualizador) e
  // cai no caminho normal quando ele não vier — por tribunal diferente, por
  // tela mudada, por peça que nem tem PDF. A degradação é graciosa **e
  // anunciada**: o que sair como texto entra no LEIA-ME com a instrução de
  // substituir, em vez de passar por documento oficial.
  //
  // Custo: dois postbacks por peça (abrir no visualizador + baixar), pagos só
  // aqui — jamais no chat, na medição ou na exportação em massa, que somariam
  // centenas deles na sessão JSF.
  //
  // E pagos só por QUEM PRECISA: a rota de sempre vem primeiro, e quando ela já
  // devolve um PDF a peça está resolvida — é o caso da digitalizada e da que o
  // advogado protocolou, cujo arquivo nos autos JÁ é o documento. Só a peça que
  // volta como texto (a nascida no editor: carta, despacho, decisão) paga a
  // rota nova. Num pacote típico isso corta um terço dos postbacks, e ainda
  // aproveita o `docsCache`: peça já baixada nesta sessão não vai ao PJe de
  // novo. Inverter esta ordem custaria dois postbacks por peça mesmo quando o
  // arquivo certo já estava na mão.
  async function obterParaMalote(id) {
    // `{bytes:true}` pelo mesmo motivo da exportação comum: o pacote leva o
    // ARQUIVO ORIGINAL, e uma peça vinda da memória de caso tem `fileId` e zero
    // bytes — sem a flag ela sairia vazia do zip.
    const conteudo = await garantirBaixada(id, { bytes: true });
    if (conteudo && conteudo.kind === "pdf") return conteudo;
    const oficial = await PJE.baixarPdfOficial(id);
    return oficial || conteudo;
  }

  async function baixarPrecatorias(pacotes, dados) {
    if (exportando) return;
    // Renumera na ordem em que serão gravados: se o usuário desmarcou a carta 2,
    // as pastas do zip não podem sair 01 e 03 — o número aqui é a posição no
    // PACOTE, e o rastro para os autos é o id, que vai no nome do arquivo.
    const escolhidos = pacotes.map((p, i) => Object.assign({}, p, { n: i + 1 }));
    const ids = [];
    for (const p of escolhidos) for (const id of PjePrecatoria.idsDoPacote(p)) ids.push(id);
    const unicos = [...new Set(ids)];
    exportando = true;
    const sinal = { cancelado: false };
    panel.setZipOcupado(true);
    // O card de progresso fala em PEÇAS, não em pastas: uma peça baixa uma vez
    // só e serve a várias pastas (a peça de origem se repete em todas).
    panel.startPrep(
      unicos.map((id) => ({ id, titulo: metaDe(id).titulo })),
      {
        titulo:
          escolhidos.length === 1
            ? "Montando o pacote da carta precatória…"
            : "Montando " + escolhidos.length + " pacotes de carta precatória…",
        fim: (total, feitas) =>
          feitas === total
            ? "Pacote(s) prontos com " + total + " peça(s)"
            : "Pacote(s) gerados — " + feitas + " de " + total + " peça(s)",
        onCancelar: () => {
          sinal.cancelado = true;
        },
      }
    );
    try {
      const r = await PjeExport.montarZipPrecatorias({
        pacotes: escolhidos,
        cnj: PJE.getNumeroProcesso(),
        ficha: PJE.lerCabecalhoProcesso(),
        porMovimento: !(dados && dados.pacotes[0] && dados.pacotes[0].fonte === "titulo"),
        sinal,
        onEtapa: (id, estado) => panel.setPrepState(id, estado),
        obter: obterParaMalote,
      });
      panel.endPrep();
      baixarBlob(r.nome, r.blob);
      panel.setStatus(
        "✅ " + r.nome + " — " + r.resumo.pacotes + " pasta(s), " +
          r.resumo.arquivos + " arquivo(s), " + fmtMB(r.blob.size) +
          (r.resumo.semCarta
            ? ". " + r.resumo.semCarta +
              " pasta(s) NÃO saíram: a carta não pôde ser baixada (tente de novo)."
            : "") +
          (r.resumo.falhas ? " " + r.resumo.falhas + " peça(s) falharam (a relação está no LEIA-ME)." : "")
      );
    } catch (e) {
      const msg = (e && e.message) || String(e);
      panel.endPrep(true);
      panel.setStatus(
        msg === "cancelado" ? "Montagem cancelada." : "Não foi possível montar o pacote: " + msg
      );
      if (msg !== "cancelado") console.warn("[PJe IA] zip precatórias:", e);
    } finally {
      exportando = false;
      panel.setZipOcupado(false);
      salvarCasoAgora();
    }
  }

  // De onde veio a lista que está sendo exportada — vai escrito no LEIA-ME e no
  // índice. "Pode estar incompleta" precisa ser dito COM o motivo; sem ele, a
  // ressalva vira ruído que ninguém lê.
  function descreverOrigemLista(todas) {
    let base;
    // QUANDO a lista foi lida entrou aqui junto com o cache no disco: desde que
    // a grid passou a ser gravada na memória de caso, `gridInfo` pode ser de uma
    // sessão de semanas atrás. Este texto vai para o LEIA-ME e o índice do .zip,
    // que saem da ferramenta e viram registro — afirmar "por completo" no
    // presente sobre uma leitura antiga é o defeito que a própria dica da lista
    // evita ("lida em DD/MM"), e aqui custaria mais caro: as peças juntadas
    // depois não estão no pacote e nada nele diria isso.
    const quando = gridInfo && gridInfo.lidaEm
      ? new Date(gridInfo.lidaEm).toLocaleDateString("pt-BR")
      : null;
    const carimbo = !quando
      ? ""
      : ", lida em " +
        quando +
        (quando === new Date().toLocaleDateString("pt-BR")
          ? ""
          : " — peças juntadas depois dessa data não entraram");
    if (gridInfo && gridInfo.fonte === "api") {
      // A lista veio da API de documentos do PJe: uma resposta só, sem paginação
      // — dizer "N de N páginas lidas" aqui descreveria um mecanismo que não foi
      // usado, e o índice do `.zip` é justamente onde a procedência precisa ser
      // exata.
      base =
        "lida da lista oficial de documentos do PJe (" +
        gridInfo.total +
        " documentos, resposta única)" +
        carimbo;
    } else if (gridInfo && !gridInfo.incompleto) {
      base =
        "lida da tela oficial “Documentos” do PJe, por completo (" +
        gridInfo.total +
        " documentos em " +
        gridInfo.paginas +
        " página(s))" +
        carimbo;
    } else if (gridInfo) {
      base =
        "lida da tela oficial “Documentos” do PJe, mas PARCIALMENTE (" +
        gridInfo.paginasLidas +
        " de " +
        gridInfo.paginas +
        " páginas)" +
        carimbo;
    } else {
      base =
        "lida da linha do tempo do processo, que o PJe carrega sob demanda conforme " +
        "a rolagem — peças antigas podem não ter entrado";
    }
    return base + (todas ? "" : "; e esta exportação inclui apenas as peças marcadas na lista");
  }

  function fmtMB(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  }

  // Preview no hover: fornece o conteúdo JÁ em cache (síncrono, nunca baixa —
  // download do PJe é serializado na sessão JSF e travaria a cada passada de
  // mouse). Cache-miss devolve null e o painel oferece o botão "Baixar".
  panel.onPreview((id) => docsCache.get(id) || null);

  // Botão "Baixar" do preview: idempotente e compartilhado com o envio (a
  // peça baixada aqui entra no docsCache que baixarSelecionadas reaproveita).
  panel.onPreviewBaixar(async (id) => {
    if (busy) throw new Error("aguarde a resposta atual terminar para abrir a peça");
    if (exportando) throw new Error("aguarde a exportação terminar para abrir a peça");
    // O preview pode ATIVAR a peça (postback na timeline), então também entra na
    // fila única da sessão JSF — aqui como exceção, porque o painel espera um
    // throw e não uma recusa silenciosa.
    if (carregandoTimeline)
      throw new Error("aguarde a leitura da lista de documentos terminar para abrir a peça");
    // `{bytes:true}`: o preview desenha o PDF/a imagem na tela, então precisa do
    // conteúdo aqui — uma peça retomada da memória tem `fileId` e nenhum byte, e
    // sem esta flag o download era pulado e o botão não fazia nada.
    return await garantirBaixada(id, { bytes: true });
  });

  let docsIndex = new Map(); // id -> {id, titulo} (para chips e card de progresso)

  // Une as duas fontes de listagem. A GRID (tela "Documentos") é a boa quando
  // existe — ela é completa e traz o TIPO oficial da peça —, mas a timeline
  // segue mandando na ORDEM (é a ordem cronológica que o usuário vê na tela) e
  // é a única fonte enquanto a grid não foi consultada. Peças que só a grid
  // conhece entram no fim: são justamente as que o scroll não tinha alcançado.
  function mesclarDocs() {
    const daTimeline = PJE.listarDocumentos();
    if (!docsDaGrid || !docsDaGrid.length) return daTimeline;
    const porId = new Map(docsDaGrid.map((d) => [d.id, d]));
    const out = [];
    const vistos = new Set();
    for (const d of daTimeline) {
      const g = porId.get(d.id);
      vistos.add(d.id);
      // título da timeline (o usuário reconhece) + os dados que só a grid tem:
      // tipo oficial (usado por `categoriaDe`), a procedência da juntada (data
      // e autor) e as colunas `extras` daquele tribunal — todos alimentam o
      // índice da exportação em ZIP. `extras` PRECISA vir junto: ele existe
      // justamente para preservar o que só aquela grid tem, e a peça que está
      // nas DUAS fontes é o caso comum — deixá-lo de fora aqui faria o campo
      // sobreviver só nas peças que a timeline não alcançou.
      out.push(
        g
          ? Object.assign({}, d, {
              tipo: g.tipo,
              juntadoEm: g.juntadoEm,
              juntadoPor: g.juntadoPor,
              extras: g.extras,
            })
          : d
      );
    }
    for (const g of docsDaGrid) if (!vistos.has(g.id)) out.push(g);
    return out;
  }

  function atualizarListaPecas() {
    const docs = mesclarDocs();
    docsIndex = new Map(docs.map((d) => [d.id, d]));
    panel.setDocs(docs);
  }
  const refresh = atualizarListaPecas;
  refresh();

  function metaDe(id) {
    const a = anexos.get(id);
    if (a) return { id, titulo: a.titulo || a.nome || ("Anexo " + id) };
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

  // A tela dos autos expirou no servidor. Diz o que houve, de quem é a falha e
  // qual é a saída — e diz que o trabalho está guardado, porque a pergunta que o
  // usuário faz nessa hora é "perdi tudo?".
  //
  // `setStatus` e NÃO `setAlerta`: a barra de alerta embute um botão "Nova
  // conversa", que aqui é a ação errada — jogaria fora justamente a conversa que
  // acabou de ser gravada antes das ativações.
  function marcarTelaMorta() {
    if (telaMorta) return;
    telaMorta = true;
    PJE.dlog("SENTINELA: tela dos autos morta — abortando o que restava do lote");
    panel.setStatus(
      "A tela do PJe expirou (é do PJe, não da extensão). Feche e reabra o " +
        "processo — a conversa e as peças já baixadas foram guardadas e não " +
        "serão baixadas de novo."
    );
  }

  // Acima disto o download está fora do normal e vale dizer ao usuário que o
  // problema é a rede — a ativação JSF de uma peça leva ~5,6 s em condições boas.
  const SEGUNDOS_PECA_LENTO = 12;

  // Downloads simultâneos. Continua 3 no caso comum (peça que vem pela rota
  // completa, sem tocar no JSF), mas os workers CEDEM enquanto houver um POST
  // A4J em voo: três GETs mais os oito HEADs do poll mais o POST são quatro
  // frentes disputando a mesma sessão do PJe, e é assim que o Seam derruba a
  // conversação por `concurrent-request-timeout`. Ceder custa nada quando não há
  // ativação, que é justamente o caso em que a velocidade importa.
  const CONCORRENCIA_DOWNLOAD = 3;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Baixa a peça uma única vez por aba: o download do PJe é serializado na
  // sessão JSF (~5,6 s cada), então todo caminho que precisa do conteúdo passa
  // por aqui e reaproveita o cache — envio, preview, exportação e medição.
  // opts.bytes: exige os BYTES na aba, não só "dá para enviar" (ver `temBytes`).
  // É o que o preview e a exportação `.zip` pedem — para eles um `fileId` não
  // substitui o conteúdo.
  async function garantirBaixada(id, opts) {
    let d = docsCache.get(id);
    const precisa = opts && opts.bytes ? !temBytes(id) : precisaBaixar(id);
    if (precisa) {
      const novo = await PJE.baixar(id);
      // MESCLA, nunca substitui: a entrada que veio do disco carrega o `fileId`
      // e o `chaveHash`, e um `set` cru os apagaria — a peça subiria de novo à
      // Files API a cada sessão, anulando metade da economia. `semBytes` sai
      // porque agora os bytes estão aqui.
      d = Object.assign({}, d || {}, novo);
      delete d.semBytes;
      docsCache.set(id, d);
      // Peça nova (ou completada) no cache: entra na fila da memória. O que vai
      // ao disco são os metadados e o texto — nunca o base64.
      pecasSujas.add(id);
      agendarSalvar();
    }
    return d;
  }

  // Baixa as peças com concorrência limitada (3 por vez), com progresso por
  // peça no card de preparo (spinner -> check + barra de progresso).
  //
  // Peça que falha NÃO interrompe o turno. O PJe devolve 404 em peças que
  // existem na lista mas não têm download servível (atos ordinatórios vindos de
  // sistema anterior, por exemplo), e antes uma única dessas abortava a análise
  // inteira: o usuário desmarcava, mandava de novo, e caía na seguinte. Agora o
  // envio segue com o que deu certo e as falhas viram um relatório — quem quiser
  // investigar tem a lista e o motivo de cada uma.
  //
  // Devolve {ok:[ids], falhas:[{id, titulo, erro}]}.
  async function baixarSelecionadas(ids) {
    // GRAVA ANTES DE TOCAR NO JSF. Daqui para a frente cada peça pode disparar
    // uma ativação, e é durante essa fase que a tela do PJe morre em processo
    // grande. Quando isso acontece o usuário fecha e reabre o processo — e o que
    // já tinha baixado precisa estar no disco COM o `fileId`, senão a segunda
    // tentativa paga a fila inteira de novo e corre o mesmo risco.
    //
    // Tem de ser `salvarCasoAgora`, não `agendarSalvar`: esta última retorna
    // cedo durante `busy`, que é exatamente o estado de um turno. Fica AQUI, no
    // funil dos três pares baixar→subir (chat, minuta e mapa), pela mesma razão
    // que a bomba de upload mora aqui — nos call sites, seria fácil esquecer um.
    await salvarCasoAgora();
    panel.startPrep(ids.map(metaDe));
    const queue = ids.slice();
    const falhas = [];

    // BOMBA DE UPLOAD — o upload de cada peça começa assim que ELA baixa, em
    // vez de esperar a fila inteira. Antes o turno custava Σdownload + Σupload;
    // agora custa Σdownload + o upload da última peça, porque os demais já
    // aconteceram debaixo do download das seguintes.
    //
    // Ela mora AQUI, e não no handler de envio, porque há três pares
    // baixar→subir idênticos (chat, minuta e mapa): assim os três ganham o
    // pipeline sem mudar uma linha nos call sites.
    //
    // Os `await subirPecas(...)` que vêm logo depois nos call sites passam a ser
    // no-ops para as peças que subiram (o filtro `precisaUpload` descarta quem
    // já tem fileId do provedor atual) e uma SEGUNDA TENTATIVA para as que
    // falharam. Isso é intencional: a falha típica de upload é 429 por rate
    // limit depois de muitos arquivos, e alguns segundos depois ela costuma
    // passar. O custo aparece só quando a falha é permanente (arquivo grande
    // demais), e aí o fallback base64 assume de qualquer forma. São no máximo
    // duas tentativas por peça e por turno.
    //
    // Três invariantes que não podem cair:
    //  · UM LOTE POR VEZ (`bombeando`). O cache de upload do worker é
    //    read-then-write: duas chamadas simultâneas com a mesma cacheKey erram
    //    o cache as duas e sobem o arquivo duas vezes.
    //  · try/catch em volta de CADA lote. Uma rejeição não tratada se
    //    propagaria pelo `await cadeiaUpload` lá embaixo e derrubaria o turno
    //    inteiro por causa de um upload — o oposto exato do design atual, em
    //    que falha de upload apenas devolve a peça ao fallback base64.
    //  · `await cadeiaUpload` ANTES de devolver. Sem isso o chamador seguiria
    //    para o seu próprio `subirPecas` com uploads ainda em voo, e voltaria a
    //    corrida do primeiro item.
    const filaUpload = [];
    let bombeando = false;
    let cadeiaUpload = Promise.resolve();
    function bombear() {
      if (bombeando) return;
      bombeando = true;
      cadeiaUpload = (async () => {
        while (filaUpload.length) {
          const lote = filaUpload.splice(0);
          try {
            // silencioso: quem fala durante esta fase é o card de preparo; um
            // status "Enviando peças…" competindo com "Preparando peças 3/12"
            // descreveria duas coisas ao mesmo tempo.
            await subirPecas(lote, { silencioso: true });
          } catch (e) {
            console.debug("[PJe IA] lote de upload falhou:", e && e.message);
          }
          // Pronta — inclusive a que falhou no upload: ela entra no request
          // pelo fallback base64, então marcá-la como erro diria ao usuário
          // que a peça ficou de fora, o que é falso. A única lista de peças
          // ausentes continua sendo `falhas` (download).
          for (const id of lote) panel.setPrepState(id, "done");
        }
        bombeando = false;
      })();
    }

    // Ritmo do download. O gargalo real da extensão é este: o PJe serializa a
    // entrega das peças, então a banda do usuário domina o tempo total. Quando
    // fica ruim, a extensão PARECE travada — e o usuário não tem como saber que
    // o problema é a rede dele. Medimos e dizemos.
    const t0 = Date.now();
    let baixadas = 0;
    let avisouLento = false;
    async function worker() {
      while (queue.length) {
        // Cede a vez enquanto outro worker está no meio de uma ativação A4J (o
        // POST + os 8 HEADs do poll). Quem está ativando não passa por aqui: ele
        // só volta ao topo do laço depois que a própria ativação terminou.
        while (PJE.ativacaoEmVoo() && !telaMorta) await esperar(300);

        // TUDO É RECONFERIDO DEPOIS DA ESPERA, e não antes dela. Este `await` é
        // novo, e com ele o estado testado no topo do laço deixou de valer: dois
        // workers podem esperar o mesmo POST e acordar juntos, o primeiro leva a
        // última peça e o segundo receberia `undefined` do `shift` — que viraria
        // um GET para uma URL com "undefined" e uma falha fantasma no relatório.
        if (telaMorta) {
          // A tela do PJe morreu: cada peça restante seria só mais um POST numa
          // view que não existe mais. As pendentes viram FALHAS com o motivo —
          // parar em silêncio pareceria travamento, e elas seguem elegíveis para
          // a próxima tentativa (nunca entraram em `pecasNaConversa`).
          while (queue.length) {
            const pend = queue.shift();
            falhas.push({
              id: pend,
              titulo: metaDe(pend).titulo,
              erro: "a tela do PJe expirou antes desta peça",
            });
            panel.setPrepState(pend, "erro");
          }
          break;
        }
        const id = queue.shift();
        if (id === undefined) break; // outro worker levou a última durante a espera
        panel.setPrepState(id, "loading");
        if (precisaBaixar(id)) {
          try {
            await garantirBaixada(id);
            baixadas++;
            // Throughput real (segundos por peça ENTREGUE), não o tempo de uma
            // peça isolada: é o número que o usuário sente esperando.
            const media = (Date.now() - t0) / 1000 / baixadas;
            // A partir da 2ª peça (a 1ª carrega a latência de abrir a sessão) e
            // com folga sobre os ~5,6 s normais de uma ativação JSF.
            if (!avisouLento && baixadas >= 2 && media > SEGUNDOS_PECA_LENTO) {
              avisouLento = true;
              panel.setPrepNota(
                "Download lento (~" +
                  Math.round(media) +
                  " s por peça). O gargalo costuma ser a rede: uma conexão por cabo " +
                  "é bem mais estável que o Wi-Fi para baixar os autos."
              );
            }
          } catch (e) {
            falhas.push({
              id,
              titulo: metaDe(id).titulo,
              erro: (e && e.message ? e.message : String(e)).replace(/^falha ao baixar a peça \d+ ?/i, ""),
            });
            // `erro` também adianta o contador do card — sem isso a barra de um
            // envio com falhas nunca chegaria ao fim (mesma regra da exportação)
            panel.setPrepState(id, "erro");
            continue;
          } finally {
            // A ativação desta peça pode ter encontrado a view já expirada. O
            // sintoma no DOM é a timeline sumir — a variante em que o A4J
            // responde a tela de erro SEM navegar (a que navega é registrada
            // pela sentinela do `pagehide`).
            //
            // CONFIRMA ANTES DE CONDENAR, e não é excesso de zelo: o mesmo A4J
            // que entrega a peça também RE-RENDERIZA a timeline — é o que troca
            // os nós no lazy load —, e durante essa troca `#divTimeLine` não
            // existe. Um retrato tirado nesse instante é indistinguível da tela
            // de erro, e aqui o falso positivo é caro e PERMANENTE: `telaMorta`
            // aborta o lote, transforma as peças pendentes em falhas nomeadas e
            // desliga download, prefetch e medição pelo resto da sessão — sem
            // volta que não seja recarregar a página. A segunda leitura só roda
            // quando a timeline já sumiu (caminho raro), e separa o re-render,
            // que dura um instante, da morte de verdade, que não volta mais.
            if (!telaMorta && !PJE.telaDosAutosViva()) {
              await esperar(700);
              if (!PJE.telaDosAutosViva()) marcarTelaMorta();
            }
          }
        }
        // A peça está em cache. Se ainda falta subir à Files API, ela tem uma
        // SEGUNDA fase pela frente e o card precisa dizer isso: enquanto o
        // contador batia N/N no fim do download, o card ficava congelado em
        // 100% durante todo o upload, parecendo travado. Este ponto cobre
        // também a peça que JÁ estava em cache (o `if` acima foi pulado) —
        // desejável, porque ela pode não ter fileId, ou tê-lo de outro provedor.
        if (precisaUpload(id)) {
          panel.setPrepState(id, "upload");
          filaUpload.push(id);
          bombear();
        } else {
          panel.setPrepState(id, "done");
        }
      }
    }
    await Promise.all(
      Array.from({ length: CONCORRENCIA_DOWNLOAD }, () => worker())
    );
    bombear(); // a última peça pode ter entrado na fila com a bomba parada
    await cadeiaUpload;
    const perdidas = new Set(falhas.map((f) => f.id));
    const ok = ids.filter((id) => !perdidas.has(id));
    // DIAG — correlaciona a queda da tela com o volume REAL do turno. O número
    // de ativações é o que decide se vale mexer na serialização do submit A4J:
    // se forem 2 em 40 peças, aquele caminho é irrelevante.
    PJE.dlog(
      "download: " + ok.length + " ok, " + falhas.length + " falha(s), " +
        PJE.contadorAtivacoes(true) + " ativação(ões), " +
        Math.round((Date.now() - t0) / 1000) + "s" + (telaMorta ? " — TELA MORTA" : "")
    );
    return { ok, falhas };
  }

  // Precisa de upload à Files API? Só PDF, e só quando ainda não há fileId do
  // provedor ATUAL (um file_id da Anthropic não serve num request Gemini).
  // Extraída para ser a fonte ÚNICA da regra: `subirPecas` a usa para montar a
  // fila e o card de progresso a usa para saber se aquela peça ainda tem uma
  // fase pela frente. Duplicar isso garantiria divergência — `fileProvider` já
  // é sutil o bastante.
  function precisaUpload(id) {
    const d = docsCache.get(id);
    if (!d || d.kind !== "pdf") return false;
    // Sem bytes não há o que subir. Acontece com peça HIDRATADA da memória de
    // caso: ela volta do disco só com metadados e fileId, e quem decide se
    // precisa de download é `precisaBaixar`, não este predicado.
    if (!d.b64) return false;
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    return !d.fileId || (d.fileProvider || "anthropic") !== provAtual;
  }

  // ---------------------------------------------------------------------------
  // MEMÓRIA DE CASO — os três predicados que decidem o que fazer com uma peça
  // que voltou do disco SEM os bytes (marca interna `semBytes`).
  //
  // Esta é a economia inteira do recurso: uma peça PDF cujo `fileId` ainda vale
  // é reenviada à API sem baixar nada — `montarBlocos` prefere o file_id e nem
  // toca no base64. Peça de TEXTO nem isso precisa: o texto veio junto.
  // ---------------------------------------------------------------------------

  // O fileId gravado ainda serve para o request de agora? Três formas de não
  // servir, e as três dariam erro críptico da API se passassem batidas:
  //  - provedor diferente (um file_id da Anthropic num request Gemini = 400);
  //  - vencido (a File API do Google apaga os arquivos em 48 h);
  //  - de OUTRA CONTA (o usuário trocou a chave; os arquivos são da conta).
  // A folga de 60 s na expiração evita o caso em que o arquivo vence entre a
  // checagem e a chegada do request ao servidor.
  function fileIdValido(d) {
    if (!d || !d.fileId) return false;
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    if ((d.fileProvider || "anthropic") !== provAtual) return false;
    if (d.fileExp && d.fileExp <= Date.now() + 60000) return false;
    // `chaveHash` ausente = upload feito antes desta versão: não dá para
    // afirmar que mudou de conta, e recusar por precaução só custaria um
    // download desnecessário a quem não trocou de chave.
    if (d.chaveHash && chaveHashAtual && d.chaveHash !== chaveHashAtual) return false;
    return true;
  }

  // Dá para anexar esta peça (ou ANEXO do input) ao request AGORA, do jeito que
  // ela está?
  //
  // Lê por `entradaDoc`, NÃO por `docsCache` direto: `montarBlocos` chama isto
  // também para os anexos do input, que vivem só na Map `anexos`. Ler o
  // `docsCache` cru fazia todo anexo cair em `semConteudo` ("o envio anterior
  // expirou") e nunca chegar ao modelo. Para uma peça de verdade `entradaDoc`
  // devolve a MESMA entrada do `docsCache`, então o comportamento não muda.
  //
  // A resposta depende de COMO cada tipo viaja, e por isso os ramos são
  // explícitos: só o PDF tem a rota por referência (Files API). A IMAGEM vai
  // sempre em base64 inline nos três provedores — um fileId não a dispensa de
  // nada, e tratá-la junto do PDF faria uma peça sem bytes parecer pronta.
  function podeAnexar(id) {
    const d = entradaDoc(id);
    if (!d) return false;
    if (d.kind === "text") return !!d.text;
    if (d.kind === "img") return !!d.b64;
    return !!(d.b64 || fileIdValido(d));
  }

  // Precisa passar pelo PJe (a fila serializada de ~5,6 s por peça)? É a
  // pergunta que a memória de caso existe para responder "não".
  function precisaBaixar(id) {
    const d = docsCache.get(id);
    if (!d) return true; // nunca vista
    if (!d.semBytes) return false; // veio inteira nesta sessão
    return !podeAnexar(id);
  }

  // Os BYTES desta peça estão aqui, nesta aba?
  //
  // NÃO é a mesma pergunta de `precisaBaixar`, e confundir as duas foi um bug
  // real: aquela responde "preciso baixar para ENVIAR?", e a resposta lá é
  // *não* quando existe um `fileId` válido — o modelo recebe a peça por
  // referência da Files API e os bytes são dispensáveis. Só que há dois
  // consumidores que não têm essa saída, porque não mandam a peça a lugar
  // nenhum: o PREVIEW, que desenha pixels na tela, e a EXPORTAÇÃO `.zip`, que
  // grava o arquivo original no pacote. Para eles o `fileId` não serve de nada.
  //
  // O sintoma era diferente em cada um, e o da exportação era o pior: no
  // preview o botão "Abrir documento" ficava sem efeito (baixava zero, o
  // popover re-renderizava o mesmo aviso); no `.zip`, a peça saía VAZIA ou
  // derrubava a entrada — em silêncio, num pacote que o usuário só abre depois.
  // Nos dois casos só acontecia com peça vinda da memória de caso, que é
  // justamente o caminho comum ao reabrir um processo.
  function temBytes(id) {
    const d = docsCache.get(id);
    if (!d) return false;
    if (d.kind === "text") return !!d.text; // ali o texto É o conteúdo
    return !!d.b64;
  }

  // ---------------------------------------------------------------------------
  // MEMÓRIA DE CASO — revalidação do que está no HISTÓRICO.
  //
  // O caso difícil do recurso, e o mais provável de dar errado sem tratamento:
  // `conversation` guarda blocos `{type:"document", source:{type:"file",
  // file_id}}` dos turnos anteriores. Numa conversa retomada dias depois, esses
  // file_id podem não existir mais no provedor (Gemini apaga em 48 h; trocar de
  // chave leva junto os da Anthropic e da OpenAI).
  //
  // E isso NÃO se conserta re-baixando a peça: o bloco antigo continua
  // apontando para o arquivo morto, e o usuário recebe um 400 críptico da API
  // logo na primeira mensagem da sessão — sem nada que ligue o erro à causa.
  //
  // Roda ANTES do download das peças novas, e no caminho normal custa zero (sai
  // na primeira linha quando não há nada a revalidar).
  // ---------------------------------------------------------------------------

  // Percorre o histórico trocando o file_id de cada bloco pela referência ATUAL
  // da peça. Mutação in-place é legítima aqui: o request é remontado do zero a
  // cada turno e o bloco `document` não carrega assinatura do provedor (ao
  // contrário do thinking, que é intocável).
  function reescreverFileIdsNoHistorico(perdidas) {
    let trocados = 0;
    for (const turno of conversation) {
      if (!Array.isArray(turno.content)) continue;
      const mantidos = [];
      for (const b of turno.content) {
        const id = b && b.__pecaId;
        if (!id || !b.source || b.source.type !== "file") {
          mantidos.push(b);
          continue;
        }
        if (perdidas.has(id)) continue; // some do histórico junto com a peça
        const d = docsCache.get(id);
        if (d && d.fileId && d.fileId !== b.source.file_id) {
          b.source.file_id = d.fileId;
          trocados++;
        }
        mantidos.push(b);
      }
      if (mantidos.length !== turno.content.length) turno.content = mantidos;
    }
    return trocados;
  }

  // O provedor disse que o arquivo referenciado não existe. As três APIs
  // escrevem isso de formas diferentes, e nenhuma tem um código estável para
  // isto — o casamento é por texto, de propósito conservador: um falso positivo
  // aqui só custa um re-upload no envio seguinte.
  function erroDeArquivoSumido(e) {
    const m = String((e && e.message) || e || "");
    return /(file|arquivo|files\/)/i.test(m) && /(not found|não encontrad|404|expired|invalid)/i.test(m);
  }

  // Solta as referências de upload do provedor atual: as peças voltam a precisar
  // de upload (e de download, se os bytes também não estiverem aqui) no próximo
  // envio. Não apaga nada do banco — `pecaParaBanco` regrava sem fileId na
  // próxima gravação, que é o efeito desejado.
  function esquecerUploadsDoProvedor() {
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    for (const [id, d] of docsCache) {
      if (!d || !d.fileId || (d.fileProvider || "anthropic") !== provAtual) continue;
      delete d.fileId;
      delete d.fileProvider;
      delete d.fileExp;
      delete d.chaveHash;
      pecasSujas.add(id);
    }
  }

  async function revalidarPecasDoHistorico(ativos) {
    if (!pecasNaConversa.size) return;
    // Só peças que (a) estão no histórico POR REFERÊNCIA, (b) seguem marcadas —
    // `prepararEnvio` já filtra as desmarcadas do request — e (c) cuja
    // referência não vale mais.
    const porReferencia = new Set();
    for (const turno of conversation) {
      if (!Array.isArray(turno.content)) continue;
      for (const b of turno.content) {
        if (b && b.__pecaId && b.source && b.source.type === "file") porReferencia.add(b.__pecaId);
      }
    }
    const alvo = [...porReferencia].filter(
      (id) => (!ativos || ativos.has(id)) && !fileIdValido(docsCache.get(id))
    );
    if (!alvo.length) return; // caminho normal

    console.debug("[PJe IA] revalidando", alvo.length, "peça(s) do histórico");
    const dl = await baixarSelecionadas(alvo);
    await subirPecas(dl.ok);
    // Quem não voltou sai do histórico: um bloco apontando para arquivo morto
    // derrubaria o turno inteiro, e a peça some do contexto de forma HONESTA —
    // volta a ser "nova" e pode ser reanexada marcando-a de novo.
    const perdidas = new Set(alvo.filter((id) => !fileIdValido(docsCache.get(id))));
    reescreverFileIdsNoHistorico(perdidas);
    for (const id of perdidas) pecasNaConversa.delete(id);
    if (perdidas.size) {
      panel.setPecasEnviadas([...pecasNaConversa]);
      panel.mostrarFalhasPecas(
        [...perdidas].map((id) => ({
          id,
          titulo: metaDe(id).titulo,
          erro: "o arquivo enviado antes expirou e a peça não pôde ser baixada de novo",
        })),
        {
          titulo: "peça(s) saíram do contexto desta conversa",
          dica: "Marque-as de novo para reanexá-las ao próximo envio.",
        }
      );
    }
  }

  // Sobe as peças PDF ainda sem file_id para a Files API (2 por vez). Falha de
  // upload não interrompe: a peça cai no fallback base64 (teto de 24 MB).
  //
  // `opts.silencioso` existe para a bomba de upload de `baixarSelecionadas`:
  // quando o upload corre POR BAIXO do download, quem narra a fase é o card de
  // preparo, e um `.status` competindo com ele descreveria duas coisas ao mesmo
  // tempo. Chamada sem opts, o comportamento é o de sempre.
  async function subirPecas(ids, opts) {
    const idProc = PJE.getIdProcesso() || "proc";
    // um fileId da Anthropic não serve num request Gemini (e vice-versa):
    // peça com upload de OUTRO provedor re-sobe para o provedor atual
    const pend = ids.filter(precisaUpload);
    if (!pend.length) return;
    if (!opts || !opts.silencioso) panel.setStatus("Enviando peças para análise…", true);
    const queue = pend.slice();
    async function w() {
      while (queue.length) {
        const id = queue.shift();
        const d = docsCache.get(id);
        // Sem bytes não se sobe nada. Sem esta guarda o worker receberia
        // `b64: undefined`, subiria um arquivo VAZIO, devolveria um fileId
        // perfeitamente válido para ele e contaminaria o cache de sessão E o
        // banco — o modelo então responderia "não consta" sobre peças que
        // recebeu em branco. Falha silenciosa e persistente, a pior espécie.
        if (!d || !d.b64) continue;
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
          // `exp` (Gemini, 48 h) e `chaveHash` (conta da chave) são o que
          // permite, na sessão seguinte, decidir se este fileId ainda vale sem
          // ter de descobrir isso por um 400 no meio do turno.
          if (r.exp) d.fileExp = r.exp;
          if (r.chaveHash) d.chaveHash = r.chaveHash;
          pecasSujas.add(id);
          agendarSalvar();
        } catch (e) {
          console.debug("[PJe IA] upload da peça", id, "falhou; usando base64:", e && e.message);
        }
      }
    }
    await Promise.all([w(), w()]);
  }

  // Sobe à Files API os ANEXOS PDF do input ainda sem file_id do provedor atual.
  // Gêmeo enxuto de `subirPecas`, separado de propósito: os anexos não são peças
  // do PJe, então ficam FORA da fila de gravação da memória de caso (`pecasSujas`
  // / `agendarSalvar`) — nada de arquivo do usuário vai ao disco. Falha de upload
  // não interrompe: o anexo cai no fallback base64 de `montarBlocos` (teto de
  // b64 compartilhado com as peças). Imagem e texto vão sempre inline; só PDF
  // sobe.
  //
  // LACUNA CONHECIDA, e ela é estreita de propósito: um anexo PDF já enviado
  // fica no histórico por `file_id`, e `revalidarPecasDoHistorico` NÃO o
  // revalida (o `ativos` dela é `selecaoEfetiva()`, que não tem anexo). Se o
  // usuário TROCAR A CHAVE da API no meio da conversa, aquele `file_id` passa a
  // ser de outra conta e o turno seguinte leva 400. Não é coberto aqui porque a
  // saída certa — ensinar aquela função a tratar um segundo tipo de entidade —
  // mexe na parte mais delicada da memória de caso, e o gatilho é raro (o
  // provedor já é bloqueado por `conversaProvider`; sobra a troca de conta
  // DENTRO do mesmo provedor, com PDF anexado, na mesma sessão). "Nova
  // conversa" resolve. Se for tratar: os bytes do anexo estão sempre em
  // memória, então basta re-subir e reescrever o `file_id` no bloco — sem
  // download, que é o passo caro no caso das peças.
  async function subirAnexos(ids) {
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    const pend = ids.filter((id) => {
      const d = anexos.get(id);
      return (
        d && d.kind === "pdf" && d.b64 &&
        (!d.fileId || (d.fileProvider || "anthropic") !== provAtual)
      );
    });
    if (!pend.length) return;
    const queue = pend.slice();
    async function w() {
      while (queue.length) {
        const id = queue.shift();
        const d = anexos.get(id);
        if (!d || !d.b64) continue;
        try {
          const r = await rpc({
            type: "upload",
            payload: {
              filename: d.nome || "anexo-" + id + ".pdf",
              b64: d.b64,
              mime: "application/pdf",
              // SEM `cacheKey`, ao contrário de `subirPecas` — e isto não é
              // esquecimento. Aquele cache vive em `chrome.storage.session`,
              // que SOBREVIVE ao recarregar a página; os anexos, não (a Map é
              // de memória e a retomada os descarta). Então ele nunca pode
              // acertar de forma útil aqui: dentro da sessão quem já evita o
              // re-upload é o `d.fileId` conferido acima. O que sobrava era só
              // o risco — `anexo:<n>` reinicia em 1 a cada carga da página,
              // então o par (processo, "anexo:1", tamanho) de HOJE colide com o
              // de um arquivo DIFERENTE anexado antes do último F5, e o worker
              // devolveria o file_id do arquivo velho. O modelo então analisa
              // um documento que o usuário não anexou, sem nada na tela dizendo
              // isso — a falha silenciosa que este projeto trata como a pior.
            },
          });
          d.fileId = r.fileId;
          d.fileProvider = r.provider || "anthropic";
          if (r.exp) d.fileExp = r.exp;
          if (r.chaveHash) d.chaveHash = r.chaveHash;
        } catch (e) {
          console.debug("[PJe IA] upload do anexo", id, "falhou; usando base64:", e && e.message);
        }
      }
    }
    await Promise.all([w(), w()]);
  }

  // Tokens de um anexo em imagem: a fórmula da Anthropic é largura × altura / 750 (o Gemini cobra por
  // ladrilhos e a OpenAI por tiles — a mesma ordem de grandeza, e o count_tokens
  // do pré-voo corrige de graça). `pje.js` já entrega a imagem reduzida a 1568px
  // no lado maior, então o teto real desta conta é ~3.300 tokens. Sem dimensões
  // (o navegador não conseguiu decodificar), usa o valor de uma foto típica já
  // reduzida — errar para mais aqui só antecipa um aviso.
  function tokensImagem(d) {
    if (d && d.w && d.h) return Math.ceil((d.w * d.h) / 750);
    return 1600;
  }

  // Páginas de PDF — a guarda que isto alimenta é `MODEL_CAPS.maxPages`, que é
  // um limite de PÁGINAS DE PDF POR REQUEST, não de anexos. Imagem não entra na
  // conta de propósito: ela tem limite próprio (a Anthropic aceita até 100 por
  // request) e somá-la aqui faria um processo com 30 fotos e 2 PDFs bater num
  // teto que ele não bateu.
  function paginasDe(ids) {
    let total = 0;
    for (const id of ids) {
      const d = entradaDoc(id);
      if (d && d.kind === "pdf") total += d.pages || 1;
    }
    return total;
  }

  // Bloqueia envios acima do limite de páginas de PDF por request do modelo
  // (600 nos modelos de 1M de contexto; 100 no Haiku). Conta SÓ as peças
  // ativas (selecionadas) — peça desmarcada sai do request e não conta mais.
  // `caps` default = as do chat; a minuta passa as dela, senão o teto do Haiku
  // (100 páginas) barraria uma minuta que vai rodar no Sonnet 5 (600).
  function guardaPaginas(ids, caps) {
    const c = caps || modelCaps;
    if (!c) return 0;
    const total = paginasDe(ids);
    if (total > c.maxPages) {
      const dica =
        c.maxPages <= 100
          ? " Dica: o Haiku aceita só 100 páginas — nas opções da extensão, troque para o Sonnet 5 (até 600 páginas)."
          : "";
      throw new Error(
        "as peças selecionadas somam ~" + total + " páginas — acima do limite de " +
          c.maxPages + " páginas por análise deste modelo. Desmarque algumas peças e analise por partes." +
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
        // O system do TURNO, não o do chat: a minuta tem system próprio
        // (systemMinuta) e o pré-voo precisa medir o request que vai de fato —
        // eram ~5,4 mil chars de diferença medindo outra coisa.
        system: (opts && opts.system) || systemPromptAtual(),
        messages,
        betas: (opts && opts.betas) || BETAS_CHAT,
      };
      if (opts && opts.tools) payload.tools = opts.tools;
      // Idem para o MODELO: sem ele o worker mede na janela do modelo do chat.
      if (opts && opts.model) payload.model = opts.model;
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

  // Peças (e anexos) de texto que serão cortados — pela MESMA regra que
  // `montarBlocos` usa para cortar, via `tetoTextoDe`, para as duas leituras
  // nunca divergirem. O formato do retorno é o de `mostrarFalhasPecas`
  // ({id, titulo, erro}).
  function pecasTruncadas(ids) {
    const out = [];
    const teto = tetoTextoDe(ids);
    for (const id of ids) {
      const d = entradaDoc(id); // peça (docsCache) ou anexo (.md/.txt longo)
      if (d && d.kind === "text" && d.text && d.text.length > teto) {
        out.push({
          id,
          titulo: metaDe(id).titulo,
          erro:
            (ehIdAnexo(id) ? "anexo longo (~" : "peça longa (~") +
            Math.round(d.text.length / 1000) +
            " mil caracteres): entrou só até os primeiros " +
            Math.round(teto / 1000) +
            " mil",
        });
      }
    }
    return out;
  }
  // Rótulos do relatório de itens cortados. Não pode reusar o texto padrão do
  // relatório de download: lá as peças ficaram DE FORA, aqui elas entraram —
  // pela metade, que é uma perda de outra natureza e com outra saída.
  //
  // Recebe a LISTA, não a contagem: anexo do input e peça dos autos são coisas
  // diferentes para quem lê. "1 peça é longa demais" sobre um arquivo que o
  // usuário acabou de soltar na caixa manda ele procurar na lista dos autos uma
  // peça que não foi cortada — e a saída para cada um dos dois também é outra.
  function avisoTrunc(cortadas) {
    const n = cortadas.length;
    const nAnexos = cortadas.filter((c) => ehIdAnexo(c.id)).length;
    const soAnexos = nAnexos === n;
    const soPecas = nAnexos === 0;
    let titulo;
    if (soAnexos) {
      titulo =
        n === 1
          ? "1 anexo é longo demais e entrou cortado nesta análise"
          : n + " anexos são longos demais e entraram cortados nesta análise";
    } else if (soPecas) {
      titulo =
        n === 1
          ? "1 peça é longa demais e entrou cortada nesta análise"
          : n + " peças são longas demais e entraram cortadas nesta análise";
    } else {
      titulo = n + " documentos são longos demais e entraram cortados nesta análise";
    }
    // O teto acompanha a janela do modelo, então trocar de modelo é uma saída
    // REAL e não óbvia — vale dizer antes das outras. O .zip só existe para as
    // peças dos autos; para um anexo, quem divide o arquivo é o usuário.
    const saida = soAnexos
      ? "Para alcançar o restante, divida o arquivo em partes menores e anexe " +
        "uma de cada vez, ou pergunte especificamente sobre o trecho final."
      : "Para alcançar o restante, pergunte especificamente sobre a parte final " +
        "ou use ⬇ Baixar .zip e trabalhe o documento inteiro fora da extensão.";
    return {
      titulo,
      dica:
        (soAnexos ? "Eles entraram" : "Elas entraram") +
        ", mas só até o corte — o que vem depois não foi lido, e o modelo foi " +
        "avisado para não afirmar que algo 'não consta'. O limite acompanha a " +
        "janela do modelo e é dividido entre os documentos de texto do envio: " +
        "marcar menos itens de texto de uma vez, ou usar um modelo de janela " +
        "maior, aumenta o quanto de cada um entra. " +
        saida,
    };
  }

  // ---------------------------------------------------------------------------
  // INVENTÁRIO das peças que estão na lista mas NÃO foram anexadas.
  //
  // Fecha o ciclo entre a IA e a seleção: sem ele, a resposta a "qual foi o
  // valor da perícia?" com o laudo desmarcado é um "não consta" seco, e o
  // usuário não tem como saber que a peça existe e está a um clique. Com ele, o
  // modelo devolve o id da peça para marcar.
  //
  // Vai no TEXTO DO TURNO, e não no system: a lista muda a cada refresh da
  // timeline do PJe (MutationObserver com debounce de 400 ms) e no system
  // invalidaria o cache de prefixo o tempo todo.
  //
  // E é anexado só na CÓPIA que vai à API (`prepararEnvio` já devolve uma), never
  // em `conversation`: no histórico ele se acumularia turno a turno — dez turnos
  // de uma conversa com 200 peças seriam ~20 mil tokens de listas repetidas e
  // desatualizadas, competindo com o conteúdo real.
  const INVENTARIO_MAX = 80; // acima disto, só as peças de maior relevância

  // ---------------------------------------------------------------------------
  // LINHA DO TEMPO PROCESSUAL — os movimentos datados, no contexto.
  //
  // Faltava a informação que decide toda pergunta de PRAZO. O modelo recebia o
  // conteúdo das peças e, como identificação, só "207691389 - Sentença": sem
  // data de juntada, sem publicação, sem decurso de prazo. Relato real: pedir a
  // data do trânsito em julgado devolvia "não é possível determinar" — e estava
  // certo, porque expedição de intimação, publicação e decurso de prazo são
  // MOVIMENTOS, e movimento quase nunca vira peça com texto. A extensão já lia
  // tudo isso (`PJE.lerEventos`, desde a v0.35) e usava só no pacote de carta
  // precatória.
  //
  // Vai junto do inventário, pelas MESMAS razões: no texto do turno (a timeline
  // muda a cada refresh e no system invalidaria o cache), e só na cópia que vai
  // à API (no histórico se acumularia turno a turno).
  const MOV_MAX = 140; // acima disto, corta pelo MEIO e diz que cortou
  // Movimentações pela API REST (`PJE.listarMovimentacoes`). É a fonte
  // PREFERENCIAL e melhor em três eixos que raspar a timeline: tem HORA, usa o
  // vocabulário CNJ e — o que mais importa — **não depende da timeline
  // carregada**, então a linha do tempo deixa de nascer parcial no caso comum.
  // Fica em cache porque `linhaDoTempoProcessual` é síncrona (roda dentro de
  // `comInventario`, na montagem do request); quem preenche é
  // `garantirMovimentacoes`, no começo do turno.
  let movsOficiais = null;
  async function garantirMovimentacoes() {
    try {
      if (!PJE.listarMovimentacoes) return;
      const m = await PJE.listarMovimentacoes();
      // Só substitui em caso de SUCESSO: uma falha de rede num turno não pode
      // apagar a linha do tempo que o turno anterior já tinha obtido.
      if (m && m.length) movsOficiais = m;
    } catch (e) {
      console.warn("[PJe IA] movimentações:", e);
    }
  }
  function fmtData(d, comHora) {
    if (!d || typeof d.getTime !== "function" || isNaN(d.getTime())) return null;
    const p = (n) => String(n).padStart(2, "0");
    const dia = p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
    // A hora entra só quando ela EXISTE de verdade (fonte REST). A meia-noite
    // exata é o que o PJe grava em ato sem hora (publicação em diário), e
    // escrever "00:00" ali afirmaria uma precisão que o dado não tem.
    if (!comHora || (d.getHours() === 0 && d.getMinutes() === 0)) return dia;
    return dia + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  // Só o DIA de uma data já formatada. Mora AQUI, junto de `fmtData`, e não
  // junto do primeiro consumidor: `linhaDoTempoProcessual` a usa em dois pontos
  // distantes um do outro (o rótulo do corte, no meio da função, e a faixa do
  // selo, no fim), e uma `const` declarada entre os dois lançaria "Cannot access
  // before initialization" no primeiro — a zona morta temporal descrita no
  // CLAUDE.md. O recorte é por REGEX, nunca por posição: `slice(0, 10)` produz
  // data truncada assim que o formato muda (foi o que fez "19 de junho de 2026"
  // virar "19 de junho de 20" em `datasDasPecas`). Formato desconhecido volta
  // inteiro.
  const soODia = (s) => {
    const m = String(s || "").match(/^\d{2}\/\d{2}\/\d{4}/);
    return m ? m[0] : s || null;
  };
  // Normalizador local (minúsculas, sem acento). O `norm` do painel classifica
  // TÍTULO de peça; aqui o vocabulário é outro — movimento CNJ —, e manter as
  // duas leituras em arquivos separados é o que impede que uma regra escrita
  // para peça mude a classificação de um movimento sem ninguém ver.
  const normMov = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  // VETO — qualquer sinal de prazo, ciência ou decisão MANTÉM o movimento, e é
  // buscado em todo o texto (não ancorado): "Certidão de trânsito em julgado"
  // começa por "certidao", que é expediente, e é o ato mais importante que a
  // linha do tempo tem a dizer. Ancorar o veto logo depois da palavra não
  // serviria: na fonte REST o texto é `evento — complemento`, então entre
  // "certidao" e "de transito" há um travessão.
  const RE_MOV_IMPORTA =
    /\b(transit|decurso|decorrid|prazo|public|disponibiliza|intima|cita|notific|sentenc|acordao|acordo|decisao|decid|julga|proced|homologa|extin|arquiv|desarquiv|baixa|suspens|sobresta|reativ|remessa|recurso|apela|agravo|embarg|liminar|tutela|penhora|leilao|hasta|prescri|perici|audienc|conclus|distribu|redistribu|autua)/;
  // EXPEDIENTE — o que PODE ser descartado quando a lista não cabe. Definir o
  // descartável, e não o essencial, inverte o modo de falha para o lado seguro:
  // movimento que esta lista não reconhece FICA. Ancorado no início porque o
  // primeiro termo é o nome do evento (na fonte REST, o `dsEvento`).
  // Deliberadamente FORA dela: "expedição de…" (é assim que muito PJe registra
  // a comunicação que inicia o prazo) e "vista/ciência" (vista ao MP abre
  // prazo). Errar para o lado de manter custa tokens; errar para o outro apaga
  // a resposta e ainda a chama de expediente.
  const RE_MOV_EXPEDIENTE =
    /^(juntada|peticao|documento|ato ordinatorio|mero expediente|certidao|carga|guia|alterac|retificac|cadastr|atualizac|inclusao|exclusao|reclassificac|anexac|desanexac|apensament|desapensament|impressao|conversao|migrac)/;
  function ehExpediente(mov) {
    const t = normMov(mov);
    if (!t) return true; // sem texto de movimento não informa ato nenhum
    if (RE_MOV_IMPORTA.test(t)) return false;
    return RE_MOV_EXPEDIENTE.test(t);
  }
  // Retrato do que FOI ao modelo no eixo do tempo, para o selo da `.metarow`.
  // Mora aqui, no ponto único que monta o bloco, e não num espelho do lado de
  // fora: são TRÊS caminhos que chamam `linhaDoTempoProcessual` (chat, minuta e
  // mapa), e um espelho divergiria no primeiro que alguém esquecesse — o selo
  // passaria a descrever uma intenção em vez do request que saiu. Best-effort:
  // falhar em pintar um selo não pode derrubar um turno.
  function anunciarLinhaDoTempo(info) {
    try {
      if (panel.setLinhaDoTempo) panel.setLinhaDoTempo(info);
    } catch (e) {
      console.warn("[PJe IA] selo da linha do tempo:", e);
    }
  }
  function linhaDoTempoProcessual() {
    let itens = null;
    let fonteRest = false;
    if (movsOficiais && movsOficiais.length) {
      fonteRest = true;
      // `ev` e `cp` (evento e complemento) viajam SEPARADOS além do `mov` já
      // concatenado: o texto que vai ao modelo é uma linha só, mas a lista que o
      // usuário lê no painel põe o evento em negrito e o complemento abaixo — e
      // é no complemento que está o que fecha a conta ("… em 16/07/2026 23:59").
      itens = movsOficiais.map((m) => ({
        data: fmtData(m.data, true),
        ord: m.ms,
        ev: m.evento,
        cp: m.texto || "",
        mov: m.evento + (m.texto ? " — " + m.texto : ""),
        pecas: m.docs || [],
      }));
    } else {
      // FALLBACK: a timeline do DOM. Serve ao tribunal em que a rota REST não
      // existe ou muda de nome, e ao PJe cuja sessão recusa a chamada.
      let eventos;
      try {
        eventos = PJE.lerEventos ? PJE.lerEventos() : [];
      } catch (e) {
        console.warn("[PJe IA] linha do tempo:", e);
        anunciarLinhaDoTempo({ n: 0 });
        return "";
      }
      if (!Array.isArray(eventos) || !eventos.length) {
        // Zero movimento se ANUNCIA, não desaparece (a mesma regra da `.sel-nota`
        // e do estado vazio da biblioteca): é este selo que explica por que uma
        // pergunta de prazo vai voltar sem resposta neste processo.
        anunciarLinhaDoTempo({ n: 0 });
        return "";
      }
      // Só entra quem tem MOVIMENTO — um evento sem texto de movimento não
      // informa ato nenhum, e ocuparia linha dizendo apenas uma data.
      itens = eventos
        .map((ev) => ({
          data: fmtData(ev.data),
          ord: ev.data && ev.data.getTime ? ev.data.getTime() : null,
          // No DOM não há a separação evento/complemento: o `.texto-movimento` é
          // uma coisa só. `cp` vazio, e a lista do painel mostra só o negrito.
          ev: (ev.mov || "").trim(),
          cp: "",
          mov: (ev.mov || "").trim(),
          pecas: (ev.pecas || []).map((p) => p.id),
        }))
        .filter((x) => x.mov);
    }
    if (!itens || !itens.length) {
      anunciarLinhaDoTempo({ n: 0 });
      return "";
    }
    // A ordem tem de ser CRESCENTE, como na exportação e no "Escolher com IA":
    // a cronologia invertida faz o modelo ler a sentença antes da inicial.
    //
    // ORDENA SEMPRE — não confia na ordem de quem entregou. O `pje.js` já
    // devolve crescente, mas cronologia errada numa análise de prazo é erro
    // caro e silencioso, e o preço de reordenar uma lista de 25 itens é zero.
    // (Isto foi um defeito real: ao "otimizar" pulando o sort no ramo REST, um
    // stub que devolvia fora de ordem passou a produzir a distribuição DEPOIS
    // da sentença — e só o teste viu.)
    //
    // O que muda por fonte é o DESEMPATE, e a razão é a granularidade da data:
    //   • REST: timestamp ao segundo, único por ato. Empate é raro (dois atos
    //     no mesmo instante) e ali a ordem de origem é a correta — preserva.
    //   • DOM: a data é por DIA, então todos os atos de um dia empatam; e a
    //     timeline lista do mais recente para o mais antigo, logo o desempate
    //     certo é INVERTER a ordem em que vieram.
    //
    // Quem NÃO tem data sai do sort e vai para o FIM, na ordem em que veio — não
    // se inventa posição na cronologia para quem não trouxe data. A separação é
    // ANTES de ordenar de propósito: um comparador que devolve 0 para todo par
    // que envolva `null` não define uma ordem total — com A(1), B(sem data) e
    // C(2) tem-se cmp(A,B)=0, cmp(B,C)=0 e cmp(A,C)<0 ao mesmo tempo. Diante de
    // comparador inconsistente o `sort` pode devolver QUALQUER permutação,
    // inclusive trocando de lugar dois atos datados, e cronologia embaralhada em
    // silêncio é o pior defeito que este bloco poderia ter. Particionar resolve
    // por construção, e o desempate explícito por índice dispensa depender da
    // estabilidade do `sort`.
    const comData = [];
    const semData = [];
    itens.forEach((x, i) => (x.ord != null ? comData : semData).push({ x, i }));
    comData.sort((a, b) =>
      a.x.ord !== b.x.ord ? a.x.ord - b.x.ord : fonteRest ? a.i - b.i : b.i - a.i
    );
    itens = comData.concat(semData).map((p) => p.x);
    const total = itens.length;
    let cortou = 0;
    let cortouChave = false;
    let marcaEm = 0;
    // Intervalo de datas efetivamente atingido pelo corte. Ver a nota do rótulo,
    // logo abaixo do laço.
    let corteDe = null;
    let corteAte = null;
    if (total > MOV_MAX) {
      // O corte pelo meio é CEGO, e aqui isso custava caro: num processo de 400
      // movimentos o miolo é exatamente onde mora o ato procurado (a publicação
      // da sentença de 2019, o trânsito da fase anterior). Pior que perder o
      // dado era o rótulo — "movimentos de expediente omitidos" afirmava sobre
      // o que ninguém tinha olhado.
      //
      // Então descarta-se só o que é RECONHECIDAMENTE expediente, e só no
      // miolo: as pontas ficam intactas (o começo tem distribuição e citação; o
      // fim, sentença, intimação, decurso e trânsito).
      const excesso = total - MOV_MAX;
      const ini = Math.min(Math.floor(MOV_MAX * 0.25), total);
      const fim = Math.max(total - Math.floor(MOV_MAX * 0.45), ini);
      marcaEm = ini;
      const sacrificar = new Set();
      // Do mais ANTIGO do miolo para frente: expediente recente tem mais chance
      // de pertencer ao prazo que está sendo perguntado agora.
      for (let i = ini; i < fim && sacrificar.size < excesso; i++) {
        if (ehExpediente(itens[i].mov)) sacrificar.add(i);
      }
      if (sacrificar.size < excesso) {
        // Nem só de expediente se faz o excesso. O resto sai por posição — e
        // isso vai DITO na linha do corte: omitir um ato que não é expediente e
        // chamá-lo de expediente é justamente a mentira que este bloco existe
        // para não contar.
        for (let i = ini; i < fim && sacrificar.size < excesso; i++) sacrificar.add(i);
        cortouChave = true;
      }
      cortou = sacrificar.size;
      // O QUE SAIU está ESPALHADO pelo miolo, não concentrado num ponto — são os
      // movimentos de expediente encontrados entre `ini` e `fim`. A marca, porém,
      // entra numa posição só (`marcaEm`), e dizer apenas "omitidos aqui"
      // localiza num ponto o que aconteceu ao longo de um TRECHO: depois da marca
      // as datas seguem saltando, sem nada que explique. Dizer o INTERVALO
      // resolve pelo lado certo — o leitor (modelo ou usuário) passa a saber
      // exatamente em que faixa do processo a lista está rala.
      const idxCortados = [...sacrificar].sort((a, b) => a - b);
      corteDe = soODia(itens[idxCortados[0]].data);
      corteAte = soODia(itens[idxCortados[idxCortados.length - 1]].data);
      itens = itens.filter((_, i) => !sacrificar.has(i));
    }
    // "entre DD/MM/AAAA e DD/MM/AAAA" só quando as DUAS pontas têm data (e são
    // distintas): movimento sem data existe, e uma faixa com metade em branco
    // afirmaria menos do que o silêncio.
    const faixaCorte =
      corteDe && corteAte
        ? corteDe === corteAte
          ? " (em " + corteDe + ")"
          : " (entre " + corteDe + " e " + corteAte + ")"
        : "";
    const linhas = itens.map(
      (x) =>
        (x.data || "sem data") +
        " · " +
        x.mov +
        (x.pecas.length ? " (peça" + (x.pecas.length > 1 ? "s " : " ") + x.pecas.join(", ") + ")" : "")
    );
    if (cortou) {
      linhas.splice(
        marcaEm,
        0,
        cortouChave
          ? "… (" +
              cortou +
              " movimento(s) omitidos" + faixaCorte + " por limite de tamanho — NÃO são só de " +
              "expediente: pode faltar publicação, intimação ou decurso de prazo neste intervalo) …"
          : "… (" + cortou + " movimento(s) de expediente omitidos" + faixaCorte + " — juntada, " +
              "petição, certidão, ato ordinatório e afins; nenhum de publicação, prazo, intimação " +
              "ou trânsito) …"
      );
    }
    // COBERTURA: `lerEventos` lê o DOM da linha do tempo, que carrega sob
    // demanda — e a lista de peças pode vir completa pela rota REST sem que um
    // único movimento novo entre na tela. Afirmar uma data de trânsito sobre um
    // trecho parcial é exatamente o erro que este bloco existe para evitar, então
    // a parcialidade vai DITA. Ver "Lista completa ≠ linha do tempo carregada".
    let aviso = "";
    let restTruncada = false;
    let domParcial = false;
    try {
      // A rota REST devolve o processo INTEIRO — o aviso de parcialidade só vale
      // para o fallback pelo DOM. Repeti-lo com a fonte oficial faria o modelo
      // recusar uma data que ele tem em mãos, que é o defeito de origem.
      //
      // A medida da timeline nasce DENTRO deste ramo, e não antes dele: quem a
      // produz é `PJE.listarDocumentos()`, que varre `#divTimeLine a` com regex
      // por link E chama `lerEventos()` por dentro (recursão pela árvore inteira
      // da timeline). Calculada fora, ela rodava também no caminho comum — o da
      // rota REST, em que ninguém a lê —, somando uma varredura completa por
      // turno na janela entre o Enter e o request, num processo que pode ter
      // centenas de peças. Os dois ramos deste `try` já eram mutuamente
      // exclusivos por `fonteRest`; o que faltava era a MEDIDA nascer junto do
      // ramo que a lê.
      if (!fonteRest) {
        const naTimeline = PJE.listarDocumentos ? PJE.listarDocumentos().length : 0;
        if (naTimeline && docsIndex.size > naTimeline) {
          domParcial = true;
          aviso =
            " ATENÇÃO: a linha do tempo desta tela está PARCIAL — o processo tem " +
            docsIndex.size +
            " documentos e só " +
            naTimeline +
            " estão carregados nela. Podem existir atos ANTERIORES não listados aqui; " +
            "não conclua data de trânsito, decurso ou publicação a partir de ausência.";
        }
      }
      // GUARDA ANTI-TRUNCAMENTO da rota REST, irmã da que `listarPelaApi` já
      // tem ("lista MENOR que a timeline é recusada"). A cobertura da rota foi
      // medida em UM processo, de 25 movimentos: nada prova que ela não pagine
      // num processo de 400, e afirmar procedência oficial sobre uma lista
      // truncada é o pior desfecho possível aqui — o modelo passaria a negar
      // com confiança um ato que existe.
      //
      // O sinal é POSITIVO e é o único disponível de graça: a timeline do DOM
      // carrega do mais RECENTE para o mais antigo, então ela nunca alcança um
      // ato ANTERIOR ao mais antigo da lista oficial — a menos que a lista
      // oficial não chegue lá. Se isso acontecer, quem sabe menos é a rota.
      //
      // A folga de 24 h não é arredondamento: a data do DOM é por DIA (nasce à
      // meia-noite local) e a da rota tem hora, então um ato do MESMO dia
      // registrado às 14:48 fica "depois" da meia-noite dele sem que nada
      // esteja faltando.
      if (fonteRest && PJE.lerEventos) {
        const maisAntigoRest = Math.min(
          ...movsOficiais.map((m) => (m.ms == null ? Infinity : m.ms))
        );
        let maisAntigoDom = Infinity;
        for (const ev of PJE.lerEventos()) {
          const t = ev && ev.data && ev.data.getTime ? ev.data.getTime() : null;
          if (t != null && t < maisAntigoDom) maisAntigoDom = t;
        }
        if (
          Number.isFinite(maisAntigoRest) &&
          Number.isFinite(maisAntigoDom) &&
          maisAntigoDom < maisAntigoRest - 86400000
        ) {
          restTruncada = true;
          aviso =
            " ATENÇÃO: a linha do tempo desta tela mostra atos ANTERIORES ao mais antigo " +
            "listado aqui (" +
            fmtData(new Date(maisAntigoDom)) +
            " contra " +
            fmtData(new Date(maisAntigoRest)) +
            "), então esta lista NÃO alcança o início do processo. Não conclua data de " +
            "trânsito, decurso ou publicação a partir de ausência.";
        }
      }
    } catch {
      /* best-effort: sem a medida, o bloco vai sem o aviso */
    }
    // O selo da barra recebe o MESMO retrato que foi para o texto — inclusive o
    // corte e as duas formas de lista incompleta. As pontas da faixa saem dos
    // itens que sobraram (o primeiro e o último COM data): é o intervalo que o
    // modelo enxergou, não o que o processo tem.
    // Só o DIA na faixa: a hora é o que distingue dois atos na LISTA, e no
    // tooltip do selo — que diz apenas "de … a …" — ela virava ruído. `soODia`
    // vive no topo do IIFE, junto de `fmtData`, porque o rótulo do corte (bem
    // acima) também a usa.
    const datados = itens.filter((x) => x.data);
    // A lista que o painel mostra é a MESMA que foi ao modelo, já cortada — e o
    // corte entra nela como uma LINHA, não só como um número no cabeçalho: sem a
    // marca, as datas saltariam de 2020 para 2026 no meio da lista sem
    // explicação, o que é pior que dizer que faltou pedaço.
    const itensUI = itens.map((x) => ({
      data: x.data,
      evento: x.ev || x.mov,
      texto: x.cp || "",
      pecas: x.pecas || [],
    }));
    if (cortou) {
      itensUI.splice(marcaEm, 0, {
        data: "",
        evento: "",
        lacuna:
          cortou +
          (cortouChave
            ? " movimento(s) omitidos por limite de tamanho — NÃO só de expediente"
            : " movimento(s) de expediente omitidos") +
          faixaCorte,
        pecas: [],
      });
    }
    anunciarLinhaDoTempo({
      n: total - cortou,
      total,
      fonte: fonteRest ? "oficial" : "tela",
      cortou,
      cortouChave,
      truncada: restTruncada,
      parcial: domParcial,
      de: datados.length ? soODia(datados[0].data) : null,
      ate: datados.length ? soODia(datados[datados.length - 1].data) : null,
      itens: itensUI,
    });
    return (
      "\n\n[LINHA DO TEMPO DO PROCESSO — movimentos " +
      (fonteRest
        ? "oficiais registrados no PJe (código e descrição do CNJ, com hora quando o ato tem hora)"
        : "lidos da linha do tempo desta tela") +
      ", do mais antigo ao mais recente. É a fonte para prazos, publicação, " +
      "decurso, intimação e trânsito em julgado; o texto das peças costuma não " +
      "trazer essas datas.]\n" +
      linhas.join("\n") +
      "\n(" +
      total +
      " movimento(s)" +
      (cortou ? " no processo, " + (total - cortou) + " listados aqui" : "") +
      // NÃO dizer "lista completa do processo": é afirmação que não foi medida
      // (nada garante que a rota não pagine em processo muito longo) e que
      // ficava CONTRADITÓRIA logo depois de cortar o miolo. O que se sabe com
      // certeza é a PROCEDÊNCIA — e é ela que dá ao modelo a confiança de que
      // ele precisa, sem prometer o que ninguém conferiu. A regra de ler
      // ausência como "não registrado" está no PROMPT_FIM.
      // A vantagem da rota ("não depende do que está carregado na tela") deixa
      // de ser verdade justamente no caso que a guarda acima detecta — e
      // repeti-la ali seria contradizer o aviso na mesma linha.
      (fonteRest && !restTruncada
        ? " — registro oficial do PJe, não depende do que está carregado na tela."
        : fonteRest
          ? " — registro oficial do PJe."
          : " na linha do tempo carregada.") +
      aviso +
      ")"
    );
  }

  // Datas de JUNTADA das peças que foram anexadas. Vêm da lista oficial (rota
  // REST/grid), então são completas mesmo com a timeline parcial — e são o que
  // ancora cada documento no tempo, já que o `title` do bloco não leva data (pôr
  // ali contaminaria o rótulo das citações, que sai do mesmo campo).
  function datasDasPecas(idsAnexados) {
    const linhas = [];
    for (const id of idsAnexados) {
      if (ehIdAnexo(id)) continue; // arquivo do usuário: não tem juntada nos autos
      const d = docsIndex.get(id);
      if (!d || !d.juntadoEm) continue;
      // `dataBr` já normaliza "AAAA-MM-DD HH:mm:ss" para "DD/MM/AAAA HH:mm",
      // mas ele REPASSA sem tocar o que vier em formato desconhecido (é a
      // decisão certa lá: não inventar). Cortar por posição aqui, então,
      // produziria data truncada — "19 de junho de 20" — num bloco cujo único
      // conteúdo é data. Só encurta o que casa o formato esperado.
      const q = String(d.juntadoEm).trim();
      const m = q.match(/^(\d{2}\/\d{2}\/\d{4})(?:[ T](\d{2}:\d{2}))?/);
      linhas.push(d.titulo + " — juntada em " + (m ? m[1] + (m[2] ? " " + m[2] : "") : q));
    }
    if (!linhas.length) return "";
    // O rótulo diz JUNTADA, e diz o que ela não é. A data de juntada é quando o
    // documento entrou nos autos: petição protocolada em papel entra dias
    // depois, e documento antigo é juntado hoje. Tratá-la como data do ato erra
    // o prazo por uma distância que ninguém percebe conferindo a resposta.
    return (
      "\n\n[Data de JUNTADA das peças anexadas — quando o documento entrou nos autos, " +
      "que não é necessariamente a data do ato que ele documenta]\n" + linhas.join("\n")
    );
  }

  function inventarioNaoMarcadas(idsAnexados) {
    const dentro = new Set(idsAnexados);
    // Map preserva a ordem de inserção, que aqui é a da timeline do PJe — ou
    // seja, a ordem em que o usuário vê as peças na tela.
    let fora = [...docsIndex.values()].filter((d) => !dentro.has(d.id));
    if (!fora.length) return "";
    const total = fora.length;
    let cortou = false;
    if (fora.length > INVENTARIO_MAX) {
      // O critério de corte é o mesmo do atalho "principais": expediente
      // (certidão de intimação, AR, guia, procuração) não ajuda a decidir o que
      // marcar, e é justamente o que enche a lista nos processos grandes.
      const relevantes = fora.filter((d) => {
        const rel = classificarDoc(d);
        return rel !== "neutro" && rel !== "ruido";
      });
      if (relevantes.length && relevantes.length < fora.length) {
        fora = relevantes;
        cortou = true;
      }
      if (fora.length > INVENTARIO_MAX) {
        fora = fora.slice(0, INVENTARIO_MAX);
        cortou = true;
      }
    }
    return (
      "\n\n[Peças deste processo que NÃO estão anexadas — apenas id, título e data " +
      "de juntada; você não leu o conteúdo delas: " +
      // A data entra aqui porque muda a decisão de QUAL marcar: numa pergunta de
      // prazo, "Certidão (23/01/2026)" diz mais do que "Certidão", e é o que
      // permite ao modelo pedir a peça certa em vez de a primeira com o nome
      // parecido. Vem da lista oficial, então existe mesmo com a timeline parcial.
      fora
        .map((d) => d.titulo + (d.juntadoEm ? " (" + String(d.juntadoEm).slice(0, 10) + ")" : ""))
        .join("; ") +
      "." +
      (cortou
        ? " (Listadas " + fora.length + " de " + total + "; as demais são de expediente.)"
        : "") +
      "]"
    );
  }
  // Relevância de uma peça, pela MESMA regra que classifica a lista no painel —
  // duplicar a tabela aqui garantiria que as duas divergissem com o tempo.
  // Degrada para "relevante" (nunca corta nada) se o painel não expuser a API.
  function classificarDoc(d) {
    try {
      return panel.classificarPeca(d).rel;
    } catch {
      return "relevante";
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
    // Peças que ficaram de fora por não ter mais conteúdo anexável (memória de
    // caso com fileId vencido). Vive no escopo do IIFE, e não no retorno, porque
    // `montarBlocos` é chamada de quatro lugares e mudar a assinatura obrigaria
    // os quatro a lidar com um segundo valor que só um deles reporta.
    semConteudo = [];
    // fileId só vale se o upload foi feito para o provedor ATUAL — um URI da
    // File API do Google num request Anthropic (ou o inverso) daria 400
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    // Calculado UMA vez, antes do laço: o teto depende de quantos textos há no
    // conjunto, então precisa ser o mesmo para todos eles.
    const tetoTexto = tetoTextoDe(ids);
    for (const id of ids) {
      const d = entradaDoc(id);
      // Peça sem conteúdo no cache (download falhou) é PULADA, nunca uma
      // exceção: os chamadores já filtram, mas um TypeError aqui derrubaria o
      // turno inteiro por causa de uma peça — exatamente o que a tolerância a
      // falha de download existe para evitar.
      if (!d) continue;
      // Peça HIDRATADA da memória cujo fileId não vale mais e cujos bytes não
      // foram rebaixados: não há o que anexar. Sai da lista e é REPORTADA — um
      // `continue` mudo faria o modelo responder sobre um conjunto de peças
      // diferente do que o usuário marcou, sem nada na tela dizendo isso.
      // (Sem esta guarda o ramo de fallback faria `d.b64.length` e o TypeError
      // derrubaria o turno inteiro por causa de uma peça.)
      if (!podeAnexar(id)) {
        semConteudo.push({
          id,
          titulo: metaDe(id).titulo,
          erro: "o arquivo enviado antes não está mais disponível no provedor",
        });
        continue;
      }
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
      } else if (d.kind === "img") {
        // Anexo em IMAGEM (foto do BO, print de conversa, comprovante): vai
        // como imagem mesmo — os três provedores enxergam. Antes ele caía no
        // ramo de texto de `lerCorpo` e chegava aqui como `����JFIF…`.
        //
        // DOIS blocos, e o de texto não é enfeite: a Citations API não cita
        // imagem (não há página nem trecho), então o rótulo com título e id é
        // o ÚNICO jeito de o modelo dizer de onde tirou o que viu — a regra
        // peça·id·folha vale aqui como nas outras saídas. Sem ele o modelo
        // descreve "uma foto de um boletim" sem poder apontar qual peça é.
        //
        // Os dois levam `__pecaId`: desmarcar a peça tem de remover o par
        // inteiro, senão sobra um rótulo anunciando um anexo que não foi.
        totalB64 += d.b64.length;
        blocks.push({
          type: "text",
          text: "[Peça anexada como imagem: " + metaDe(id).titulo + "]",
          __pecaId: id,
        });
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: d.mime || "image/jpeg", data: d.b64 },
          __pecaId: id,
        });
      } else {
        // peças HTML/RTF viram documento de texto puro — também citáveis.
        // O corte no teto leva o aviso junto: sem ele o modelo lê uma peça pela
        // metade sem saber disso e responde "não consta" sobre o que ficou de
        // fora — erro que a UI não tem como distinguir de acerto.
        const cortado = d.text.length > tetoTexto;
        blocks.push({
          type: "document",
          source: {
            type: "text",
            media_type: "text/plain",
            data: cortado ? d.text.slice(0, tetoTexto) + marcaTruncado(tetoTexto) : d.text,
          },
          title: metaDe(id).titulo,
          citations: { enabled: true },
          __pecaId: id,
        });
      }
    }
    const tetoB64 =
      provAtual === "gemini"
        ? MAX_TOTAL_B64_CHARS_GEMINI
        : provAtual === "openai"
          ? MAX_TOTAL_B64_CHARS_OPENAI
          : MAX_TOTAL_B64_CHARS;
    if (totalB64 > tetoB64) {
      const mb = Math.round(totalB64 / 1024 / 1024);
      throw new Error(
        `as peças selecionadas somam ~${mb} MB — acima do limite da análise. Desmarque algumas peças maiores e tente de novo.`
      );
    }
    // Breakpoint de cache é conceito EXCLUSIVO da Anthropic; Gemini e OpenAI
    // usam cache automático (implicit) e os clientes deles nem copiariam o
    // campo — mas não sujar o histórico evita surpresas se o usuário voltar ao
    // Claude.
    if (blocks.length && provAtual === "anthropic") {
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

  // Acrescenta o inventário de peças não anexadas ao ÚLTIMO bloco de texto do
  // último turno do usuário. Opera sobre a saída de `prepararEnvio`, que já é
  // uma cópia — por isso `conversation` nunca vê o inventário e ele não se
  // acumula no histórico.
  function comInventario(msgs, idsAnexados) {
    // No modo só-anexos o inventário é contraproducente duas vezes: era ele que
    // dava ao modelo os ids com que montava a cobrança ("marque a 109951875…"),
    // e são ~2 mil tokens de lista repetidos em TODA mensagem de uma conversa
    // que não é sobre estes autos. A capacidade não se perde: o system manda
    // orientar quem perguntar do processo da tela a marcar as peças na lista.
    if (soAnexosNoContexto()) return msgs;
    // Três blocos, um propósito: dar ao modelo o EIXO DO TEMPO, que as peças
    // sozinhas não têm. A ordem é a da leitura — primeiro o que aconteceu no
    // processo, depois quando cada peça anexada entrou, por último o que existe
    // e não foi lido. Todos são voláteis pelo mesmo motivo (a timeline muda), e
    // por isso viajam juntos, no texto do turno e só na cópia enviada.
    const txt = linhaDoTempoProcessual() + datasDasPecas(idsAnexados) + inventarioNaoMarcadas(idsAnexados);
    if (!txt || !msgs.length) return msgs;
    const i = msgs.length - 1;
    const ultima = msgs[i];
    if (ultima.role !== "user") return msgs;
    if (typeof ultima.content === "string") {
      return msgs
        .slice(0, i)
        .concat([{ role: "user", content: ultima.content + txt }]);
    }
    if (!Array.isArray(ultima.content)) return msgs;
    // o último bloco de texto é o da pergunta; os anteriores são as peças
    let alvo = -1;
    for (let k = ultima.content.length - 1; k >= 0; k--) {
      if (ultima.content[k] && ultima.content[k].type === "text") {
        alvo = k;
        break;
      }
    }
    if (alvo < 0) return msgs;
    const content = ultima.content.map((b, k) =>
      k === alvo ? Object.assign({}, b, { text: b.text + txt }) : b
    );
    return msgs.slice(0, i).concat([{ role: "user", content }]);
  }

  // Peças que a RESPOSTA citou como faltantes: ids que o modelo escreveu no
  // texto (tipicamente num aviso "o comprovante está na peça 214661494, que não
  // foi anexada") mas que NÃO estão no contexto. Viram botões de "adicionar"
  // abaixo da bolha — o modelo já apontou a peça, o clique poupa procurá-la.
  //
  // Só entram ids que são peça REAL desta timeline (`docsIndex`): comparar
  // contra ela é o que elimina os falsos positivos (um valor, uma data, um
  // número de lei que por acaso tenha 6+ dígitos quase nunca casa um id real).
  // Já-no-contexto (marcadas ou no histórico) ficam de fora. Teto de sanidade.
  function pecasCitadasFaltantes(texto) {
    if (!texto) return [];
    const jaTem = new Set([...selecaoEfetiva(), ...pecasNaConversa]);
    const vistos = new Set();
    const out = [];
    const re = /\d{6,}/g;
    let m;
    while ((m = re.exec(texto))) {
      const id = m[0];
      if (vistos.has(id)) continue;
      vistos.add(id);
      if (!docsIndex.has(id) || jaTem.has(id)) continue;
      out.push({ id, titulo: metaDe(id).titulo });
      if (out.length >= 12) break;
    }
    return out;
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

  // Dispara o download de um Blob no navegador (âncora com `download`; SEM a
  // permissão "downloads", que mudaria o aviso de instalação da Web Store).
  // Usado pelo markdown do mapa e da minuta e pelo .zip das peças.
  function baixarBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // A revogação precisa de folga: o Chrome lê o blob DEPOIS do clique, e um
    // .zip de centenas de MB leva um tempo perceptível para ser gravado.
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  function baixarTexto(filename, texto, mime) {
    baixarBlob(filename, new Blob([texto], { type: mime || "text/plain;charset=utf-8" }));
  }

  // Rótulo humano de uma citação da API: "Peça, fl(s). X[–Y]" (fim exclusivo)
  // para PDFs; título do site (com link) para resultados da busca web;
  // para documentos de texto (char_location) não há página — sobra o trecho.
  // O `id` sai como campo PRÓPRIO (não colado no rótulo): é ele que o painel usa
  // para tornar a citação clicável (rola a timeline até a peça). O id vem de
  // graça no document_title, que é o `title` que montarBlocos enviou.
  // Redirecionadores de busca. O Gemini NÃO devolve a URL da fonte: devolve um
  // link opaco do Vertex (vertexaisearch.cloud.google.com/grounding-api-redirect/…)
  // que só resolve no clique. Medido no smoke test real — e ali o `title` traz o
  // domínio verdadeiro ("stj.jus.br"), que é justamente o que o usuário precisa
  // ver antes de clicar. Sem esta correção o rodapé anunciaria "google.com" numa
  // resposta cuja fonte é o STJ, e a etiqueta de nível cairia sempre em "outra".
  const REDIRECIONADORES = ["vertexaisearch.cloud.google.com"];
  function hostDeUrl(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  function hostDaFonte(c) {
    const h = hostDeUrl(c.url);
    const opaco = !h || REDIRECIONADORES.some((r) => h === r || h.endsWith("." + r));
    if (!opaco) return h;
    // O `title` só pode virar host se ELE for um domínio (caso Gemini). Na
    // Anthropic e na OpenAI o title é a manchete da página ("Bem de família do
    // fiador…") e usá-lo como origem seria inventar um domínio.
    const t = String(c.title || "").trim();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)) return t.replace(/^www\./, "");
    return h;
  }

  function infoCitacao(c) {
    if (c.type === "web_search_result_location") {
      const host = hostDaFonte(c);
      return {
        label: c.title || host || c.url || "fonte na web",
        url: c.url,
        host: host || undefined,
        nivel: host ? nivelFonte(host) : undefined,
      };
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
    // char_location (peça HTML/RTF): a API não devolve página, então a única
    // âncora é o próprio trecho citado.
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
  // `caps` default = as do chat; a minuta passa as dela (as tools e o beta de
  // web_fetch acompanham o modelo que vai de fato rodar).
  function optsDoTurno(caps) {
    const c = caps || modelCaps;
    const opts = {};
    if ((panel.isSearchOn() || buscaNaConversa) && c) {
      opts.tools = toolsBusca(c);
      opts.betas = BETAS_CHAT.concat(
        c.webFetch === "web_fetch_20250910" ? ["web-fetch-2025-09-10"] : []
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
    // `precisaBaixar` e não `!has`: peça hidratada da memória com fileId vivo
    // (ou de texto) já está pronta para o request — pedi-la ao PJe gastaria a
    // fila serializada para não mudar nada.
    const fila = ids.filter(precisaBaixar);
    if (!fila.length) return;
    const total = fila.length;
    let feitas = 0;
    async function w() {
      while (fila.length) {
        // Mesma cedência do download do turno: enquanto há um POST A4J em voo,
        // os outros workers esperam, para não somar GETs concorrentes ao pico da
        // sessão do PJe. E, como o topo do laço deixou de valer depois do
        // `await`, o `shift` é reconferido — dois workers podem acordar juntos e
        // o segundo receberia `undefined`.
        while (PJE.ativacaoEmVoo() && !telaMorta) await esperar(300);
        if (telaMorta) break; // view expirada: medir agora só produz mais erro
        const id = fila.shift();
        if (id === undefined) break;
        try {
          await garantirBaixada(id);
        } catch (e) {
          console.debug("[PJe IA] estimativa: peça", id, "não baixou:", e && e.message);
        }
        feitas++;
        if (onProgresso) onProgresso(feitas, total);
      }
    }
    await Promise.all(
      Array.from({ length: CONCORRENCIA_DOWNLOAD }, () => w())
    );
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
  // CHARS_POR_TOKEN vive no TOPO do arquivo, junto do teto de texto que a usa.
  // Acima deste nº de peças AINDA NÃO baixadas, a medição em segundo plano não
  // dispara downloads (ex.: "todas" marcadas — o PJe ativa peça a peça de forma
  // serializada, levaria minutos). Fica a estimativa local parcial; a medição
  // completa acontece no envio, com o card de progresso visível.
  const LIMIAR_PREFETCH = 12;

  function estimativaLocalTokens(ids) {
    // system prompt + instruções fixas + instruções personalizadas do usuário
    let t = 900 + Math.ceil(customPrompt.length / CHARS_POR_TOKEN);
    // O MESMO teto que o envio vai aplicar — medir por outro faria o gauge
    // anunciar um tamanho que o request não tem.
    //
    // IMPRECISÃO CONHECIDA, e ela nasceu com o teto repartido: aqui `ids` é a
    // seleção INTEIRA (`comAnexos(sel)`), enquanto `montarBlocos` recebe só o
    // DELTA do turno. Com teto constante os dois davam no mesmo; agora, uma
    // peça de texto nova somada a muitas antigas é medida com o teto dividido
    // por todas e entra com o teto do delta — a estimativa fica abaixo do real.
    // Aceito: esta camada é declaradamente aproximada (o alerta de contexto
    // cheio sai da medição precisa), e `count_tokens` mede o request de fato
    // sempre que o total passa de 60% da janela. Modelar o corte real exigiria
    // saber com que teto cada bloco do histórico foi cortado.
    const tetoTexto = tetoTextoDe(ids);
    // custo por página varia por provedor: Anthropic ≈ 2000 (texto+imagem
    // citável); Gemini = 258 (documentação oficial) — vem do caps
    const tokensPagina =
      (modelCaps && modelCaps.tokensPagina) || TOKENS_POR_PAGINA_PDF;
    for (const id of ids) {
      const d = entradaDoc(id); // peça (docsCache) ou anexo do input
      // peça ainda não baixada: entra na conta quando o download chegar.
      // Contá-la como 0 seria pior — o gauge afirmaria um tamanho que não é o
      // do envio (por isso o gauge também mostra quantas ficaram sem medir).
      if (!d) continue;
      if (d.kind === "img") {
        t += tokensImagem(d);
      } else if (d.kind === "pdf") {
        t += (d.pages || 1) * tokensPagina;
      } else if (d.text) {
        t += Math.ceil(Math.min(d.text.length, tetoTexto) / CHARS_POR_TOKEN);
      }
      // Peça de texto sem `text` é a hidratada cujo conteúdo passou do teto de
      // sanidade do banco: só metadados voltaram. Some da conta como uma peça
      // ainda não baixada — que é o que ela é.
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
    // Medição EXATA e de graça deste estado. Além do medidor, é o que permite
    // dispensar o count_tokens do próximo turno quando a folga é larga.
    ultimoTotalExato = tokens;
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

  // Fração da janela abaixo da qual o pré-voo não tem o que decidir. 60% deixa
  // 40% de margem para a estimativa local errar — ela erra para MAIS nos PDFs
  // (2000 tokens/página é o teto da ordem de grandeza), que é o lado seguro.
  const LIMIAR_PULAR_PREVOO = 0.6;

  function podePularPreVoo(ids) {
    if (!modelCaps || !modelCaps.contextTokens) return false;
    // sem uma medição EXATA anterior não há base de comparação
    if (!ultimoTotalExato) return false;
    // Peça selecionada sem conteúdo em cache não entra na estimativa local
    // (estimativaLocalTokens a pula de propósito, para não fingir precisão) —
    // e o que não é medido não pode ser dispensado da medição.
    if (ids.some((id) => !docsCache.has(id))) return false;
    // o maior entre o que o request anterior custou de fato e o que este deve
    // custar: a estimativa local sozinha subestimaria thinking e ferramentas
    const base = Math.max(ultimoTotalExato, estimativaLocalTokens(ids));
    return base < modelCaps.contextTokens * LIMIAR_PULAR_PREVOO;
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
      // fingir precisão. Anexos do input já vêm com o conteúdo em mãos, então
      // nunca contam como "sem medir".
      pendentes: ids.filter((id) => !docsCache.has(id) && !anexos.has(id)).length,
    });
  }

  panel.onSelectionChange((ids) => {
    clearTimeout(estTimer);
    // A seleção é trabalho do usuário: marcar 30 peças à mão e perdê-las ao
    // fechar a aba é a mesma perda que a conversa. Vai antes da guarda de
    // `busy` porque `agendarSalvar` já não faz nada durante um turno — e ali
    // quem grava é o `finally`.
    agendarSalvar();
    // Durante um turno o ENVIO é dono do medidor: refreshs da timeline do PJe
    // disparam syncSelection sem mudança real e sobrescreveriam a medição
    // oficial com uma estimativa local defasada.
    if (busy) return;
    if (!ids.length && !anexos.size && !conversation.length) {
      estSeq++; // cancela estimativas em voo
      panel.setContexto(null); // nada selecionado e nada conversado: sem medidor
      return;
    }

    // Camada 1: resposta IMEDIATA ao clique, com o que já se sabe localmente.
    // `comAnexos`: o que vai ao modelo é seleção MAIS anexos do input, e medir
    // só a seleção fazia o gauge encolher a cada clique numa peça — o anexo
    // sumia da conta que ele mesmo tinha acabado de engordar.
    const idsMedidos = comAnexos(ids);
    if (modelCaps) mostrarEstimativaLocal(idsMedidos);
    else garantirCaps().then(() => !busy && mostrarEstimativaLocal(idsMedidos));

    // Camada 2: refinamento em segundo plano (downloads + uploads + count).
    estTimer = setTimeout(() => refinarContexto(ids), 900);
  });

  // Camada 2 da medição, disparada pela mudança de seleção (com debounce,
  // Prefetch de seleções grandes, em lotes e cancelável.
  //
  // Ordem: peças de maior relevância primeiro. Se o usuário interromper (ou o
  // envio começar), o que já baixou é justamente o que mais importa — e é o que
  // o envio vai precisar primeiro de qualquer forma.
  const LOTE_PREFETCH = 4;
  async function prefetchProgressivo(ids, faltam, seq) {
    const peso = { essencial: 0, relevante: 1, neutro: 2, ruido: 3 };
    const fila = faltam
      .map((id) => ({ id, p: peso[classificarDoc(metaDe(id))] ?? 1 }))
      .sort((a, b) => a.p - b.p)
      .map((x) => x.id);

    let feitas = 0;
    const total = fila.length;
    while (fila.length) {
      // Cede ANTES de cada lote: `busy` cobre o envio (que passa a ser dono do
      // download), `estSeq` cobre uma nova seleção e `carregandoTimeline` cobre
      // a leitura da grid — este último é o par que mais aparece na prática, já
      // que o usuário marca peças enquanto o ⟳ ainda está virando páginas, e aí
      // seriam duas frentes na mesma sessão JSF.
      if (seq !== estSeq || busy || exportando || carregandoTimeline || telaMorta) {
        panel.setStatus("");
        return;
      }
      const lote = fila.splice(0, LOTE_PREFETCH);
      await baixarQuieto(lote);
      feitas += lote.length;
      if (seq !== estSeq || busy || exportando || carregandoTimeline || telaMorta) {
        panel.setStatus("");
        return;
      }
      // `comAnexos` e não `ids`: esta função recebe o conjunto que BAIXA (só
      // peças — um "anexo:1" na fila viraria uma ida ao PJe atrás de peça que
      // não existe), mas quem MEDE precisa dos anexos. Sem isso o gauge era
      // repintado sem eles a cada lote do prefetch: o número caía no meio da
      // barra de progresso e voltava no fim, sem nada explicando o pulo.
      mostrarEstimativaLocal(comAnexos(ids));
      panel.setStatus(
        fila.length
          ? "Adiantando o download das peças (" + feitas + "/" + total + ") — pode " +
            "escrever a pergunta normalmente."
          : "",
        !!fila.length
      );
    }
    // Baixou tudo: agora a medição exata cabe, e ela é barata (as peças já
    // estão em cache e serão referenciadas por file_id).
    if (seq === estSeq && !busy && !exportando) refinarContexto(ids);
  }

  // acima).
  async function refinarContexto(ids) {
    // `exportando` entra aqui, e não na guarda de cima: a estimativa LOCAL
    // (camada 1) é de graça e pode continuar durante a exportação, mas este
    // refinamento BAIXA peças — e a exportação já está usando a sessão JSF,
    // que é serializada. Duas frentes de download só se atrapalhariam, e as
    // ativações da própria exportação re-disparam este handler o tempo todo.
    // `carregandoTimeline` entra pela mesma razão: a leitura da grid é a frente
    // JSF mais pesada que existe aqui, e o refinamento começaria a baixar peças
    // no meio dela. `telaMorta` porque, depois da view expirar, todo download é
    // só mais um POST inútil.
    if (busy || exportando || carregandoTimeline || telaMorta) return;
    // O conjunto MEDIDO inclui os anexos do input; o conjunto BAIXADO, não (ver
    // `comAnexos`). A chave da memoização é a do medido: anexar ou soltar um
    // arquivo muda o request e precisa re-medir, exatamente como marcar uma peça.
    const idsMedidos = comAnexos(ids);
    // mesma seleção e mesma conversa da última medição precisa: pula
    const chave = idsMedidos.slice().sort().join(",") + "|" + conversation.length;
    if (chave === ultimaChaveEst) return;
    const seq = ++estSeq;
    try {
      await garantirCaps();
      const faltam = ids.filter(precisaBaixar);
      if (faltam.length > LIMIAR_PREFETCH) {
        // SELEÇÃO GRANDE (ex.: "principais" com 40 peças, ou "todas").
        //
        // Medir tudo aqui levaria minutos — o PJe serializa a entrega. Mas
        // parar por completo desperdiçava o tempo mais valioso do fluxo: o
        // usuário leva de meio a um minuto escrevendo a pergunta, e nesse
        // intervalo nada era baixado; o envio pagava a fila inteira do zero.
        //
        // Então baixamos um LOTE por vez, em ordem de relevância, cedendo a
        // qualquer sinal de que o usuário agiu (nova seleção, envio,
        // exportação). O que baixar entra no cache e o envio reaproveita; o
        // que não baixar, o envio busca com o card de progresso visível — o
        // comportamento de antes, nunca pior.
        mostrarEstimativaLocal(idsMedidos);
        await prefetchProgressivo(ids, faltam, seq);
        return;
      }
      // baixa o que falta; a barrinha sobe a cada peça que chega
      await baixarQuieto(ids, (feitas, total) => {
        if (seq !== estSeq || busy) return;
        panel.setStatus("Medindo o contexto… baixando peças (" + feitas + "/" + total + ")", true);
        mostrarEstimativaLocal(idsMedidos);
      });
      if (seq !== estSeq || busy) return;
      // sobe os PDFs à Files API JÁ na medição: o count_tokens referencia
      // por file_id (payload mínimo) e o envio reaproveita o upload
      await subirPecas(ids);
      if (seq !== estSeq || busy) return;
      // E os anexos do input, pelo mesmo motivo: `subirAnexos` só age em PDF
      // que ainda não tem `fileId` do provedor atual, então é idempotente e
      // barato. Sem ele o anexo novo entraria no count_tokens como base64
      // inline — megabytes num pré-voo que roda a cada mudança de seleção.
      await subirAnexos(idsMedidos.filter(ehIdAnexo).filter(ehNovoNoTurno));
      if (seq !== estSeq || busy) return;
      panel.setStatus("Calculando o tamanho exato do contexto…", true);

      // request PROSPECTIVO: histórico filtrado + um turno de rascunho com
      // as peças novas (as que ainda não têm blocos no histórico)
      //
      // `idsMedidos` e não `ids`: `prepararEnvio` trata todo bloco com
      // `__pecaId` fora de `ativos` como "peça desmarcada" e o REMOVE. Com só a
      // seleção aqui, os blocos dos anexos do input saíam do histórico do
      // request medido — o pré-voo media um envio menor que o real, e a guarda
      // de 90% ficava otimista exatamente quando o usuário tinha acabado de
      // anexar um PDF grande.
      const ativos = new Set(idsMedidos);
      // `podeAnexar` e não `has`: uma peça hidratada sem conteúdo utilizável
      // entraria em `montarBlocos` logo abaixo, que a descartaria — e no
      // caminho antigo (b64 ausente) estouraria um TypeError DENTRO deste try,
      // matando a medição em silêncio e deixando o medidor congelado.
      //
      // `idsMedidos` e não `ids`, pela SEGUNDA vez nesta função e por um motivo
      // diferente do `ativos` acima: aquele conserta o histórico; este, o turno
      // de RASCUNHO. Com `ids` (só peças), um anexo AINDA NÃO ENVIADO não tem
      // bloco no histórico nem entrava aqui — o count_tokens media um request
      // sem ele. Era a mesma cegueira que o `ativos` corrigiu, sobrevivendo na
      // outra metade do request, e ela passou despercebida enquanto o anexo de
      // texto era cortado em 60 mil chars (~17 mil tokens, ruído). Com o teto
      // acompanhando a janela, o mesmo anexo vale ~450 mil tokens: o gauge
      // despencaria depois de subir e a guarda de 90% ficaria cega justamente
      // no caso que ela existe para pegar.
      const novas = idsMedidos.filter((id) => ehNovoNoTurno(id) && podeAnexar(id));
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
          paginas: paginasDe(idsMedidos),
          maxPaginas: modelCaps ? modelCaps.maxPages : 0,
          pecas: idsMedidos.length,
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
  }

  // Exportação e turno disputariam a MESMA sessão JSF (o download do PJe é
  // serializado). Em vez de deixar os dois se atrapalharem em silêncio — com o
  // usuário vendo só lentidão —, o segundo é recusado com o motivo.
  function bloqueadoPelaExportacao() {
    if (!exportando) return false;
    panel.setStatus("Exportação em andamento. Aguarde o .zip terminar ou clique em Cancelar.");
    return true;
  }

  // FILA ÚNICA DA SESSÃO JSF.
  //
  // Envio, minuta, mapa, preview, prefetch, refinamento, exportação e leitura da
  // grid falam todos com o MESMO servidor de estado do PJe, e ele não tolera
  // duas frentes na mesma view: uma faz POST de página inteira dentro do iframe
  // enquanto a outra clica na timeline, e a tela do usuário vira `error.seam`.
  //
  // Vira função única porque a matriz de handlers × flags JÁ DIVERGIU: até aqui
  // só `onExportarZip` e `onPrecatorias` checavam as três; o envio e o prefetch
  // ignoravam `carregandoTimeline`, que é exatamente o par que o usuário cruza
  // no fluxo normal (clicar ⟳ num processo grande leva até 120 s, e é nesse
  // intervalo que ele marca as peças e manda a pergunta).
  //
  // Devolve `true` quando está OCUPADO — e já escreve o motivo, como a irmã
  // acima. Recusa sem motivo vira "a extensão não fez nada".
  function ocupadoJsf() {
    if (bloqueadoPelaExportacao()) return true;
    // A extração baixa peça, e download de peça mexe na sessão JSF — que é uma
    // fila só. Sem esta linha, envio, minuta, mapa, preview e prefetch rodariam
    // em paralelo com ela e o PJe derrubaria a view da aba.
    if (extraindoTexto) {
      panel.setStatus(
        "Extraindo o texto das peças. O PJe não aceita duas operações ao mesmo tempo — " +
          "isto volta assim que terminar, ou clique em Cancelar."
      );
      return true;
    }
    if (carregandoTimeline) {
      panel.setStatus(
        "Lendo a lista oficial de documentos" + (progressoGrid ? " (" + progressoGrid + ")" : "") +
          ". O PJe não aceita duas operações ao mesmo tempo — isto volta assim que terminar."
      );
      return true;
    }
    return false;
  }

  panel.onSend(async (text, selectedIdsDoPainel) => {
    if (busy || ocupadoJsf()) return;
    // A seleção do turno é a EFETIVA (checkboxes + peças restauradas cuja row a
    // timeline lazy ainda não criou) — ver `selecaoEfetiva`.
    const selectedIds = selecaoEfetiva().length
      ? selecaoEfetiva()
      : selectedIdsDoPainel;
    // Anexos do input que ainda não foram enviados (delta deste turno).
    const anexosNovos = anexosPendentes.slice();
    // A guarda só vale para conversa NOVA e SEM anexo. Com peças já no histórico,
    // perguntar sem marcar nada é legítimo — e numa conversa RETOMADA cujas rows
    // ainda não carregaram era o caso comum: o usuário via a conversa de volta,
    // digitava e levava um "marque ao menos uma peça" sobre um processo que ele
    // acabara de ver analisado. Um anexo no input também basta: dá para trabalhar
    // só com os arquivos anexados, sem marcar peça nenhuma.
    // `anexos.size` e NÃO `anexosNovos.length`: `anexosNovos` é o DELTA (os que
    // ainda não subiram). No 1º turno com anexo ele é não-vazio e a guarda
    // passava; do 2º em diante o mesmo anexo já está no histórico, o delta
    // esvazia e o envio era recusado com "Marque uma peça" — com o chip do
    // arquivo visível na tela e uma conversa inteira sobre ele. `anexos` é o
    // simétrico de `pecasNaConversa` para os arquivos do usuário: o que está no
    // contexto AGORA. Removê-lo pelo ✕ do chip volta a valer a guarda, que é o
    // certo — aí o contexto ficou de fato vazio.
    if (selectedIds.length === 0 && !pecasNaConversa.size && !anexos.size) {
      panel.setStatus("Marque uma peça, anexe um arquivo (📎) ou digite @ para citar uma peça.");
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

    // Anexo INCREMENTAL: só as peças (e anexos) que ainda não estão no histórico
    // entram neste turno. Os já enviados continuam valendo (fazem parte do
    // prefixo cacheado da conversa) — reanexá-los duplicaria páginas e tokens.
    const novas = selectedIds.filter((id) => !pecasNaConversa.has(id));
    const attach = novas.length > 0 || anexosNovos.length > 0;
    // mostra na mensagem o que ENTRA no contexto neste turno — peças e anexos
    const atts = attach
      ? [
          ...novas.map((id) => metaDe(id).titulo),
          ...anexosNovos.map((id) => "📎 " + metaDe(id).titulo),
        ]
      : null;
    panel.addMessage("user", text, atts);
    panel.lockInput(true);
    panel.setStatus("");

    let assistantEl = null;
    let acc = "";
    let truncated = false;
    // Peças que de fato entraram neste turno (o download pode falhar em
    // algumas) e o relatório do que ficou de fora.
    let anexadas = novas;
    let falhasDownload = [];

    try {
      await garantirCaps(); // limites do modelo antes de qualquer validação
      // Movimentações do processo (linha do tempo PROCESSUAL). Vai junto porque
      // é o eixo do tempo que as peças não têm — sem ele, pergunta de prazo
      // volta como "não é possível determinar". Custa ~77 ms de rede e nenhuma
      // tela JSF; falhar não impede o turno (cai para a leitura do DOM).
      await garantirMovimentacoes();
      // Conversa retomada da memória: as referências de upload dos turnos
      // ANTERIORES podem ter expirado. Isto roda antes do download das peças
      // novas e, no caminho normal (nada a revalidar), custa uma varredura do
      // histórico e mais nada.
      // Mesmo conjunto que o filtro do histórico usa (ver `selecaoEfetiva`):
      // revalidar por `selectedIds` puro deixaria de fora justamente as peças
      // cujas rows a timeline lazy ainda não trouxe — que são as que o request
      // vai carregar por referência.
      await revalidarPecasDoHistorico(new Set(selecaoEfetiva()));
      let userContent;
      let paginas = 0;
      if (attach && novas.length) {
        const r = await baixarSelecionadas(novas);
        anexadas = r.ok;
        falhasDownload = r.falhas;
      } else {
        anexadas = [];
      }
      // Peça que falha no download NÃO pode travar o próximo turno: ela é tirada
      // da seleção mais abaixo (`desmarcarPecas`), então aqui só decidimos se há
      // algo a analisar. "Nada baixou" só derruba o turno quando não há mais nada
      // — nem histórico, nem anexo —; do contrário seguimos com o que existe e as
      // falhas viram relatório (o usuário não perde a pergunta que já digitou).
      const idsNovosParaBlocos = [...anexadas, ...anexosNovos];
      // `!anexos.size` fecha a SEGUNDA metade do bloqueio do turno só-de-anexo:
      // no 2º turno não há nada NOVO (o arquivo já subiu) e `pecasNaConversa`
      // está vazio, então mesmo passando a guarda lá de cima o turno morria
      // aqui, com "não há peça marcada nem arquivo anexado para analisar" — uma
      // frase falsa, com o chip do anexo na tela. O ramo `else` logo abaixo já
      // fazia a coisa certa ("segue com o contexto já anexado"); faltava deixar
      // chegar nele. Anexo no contexto é contexto, como as peças do histórico.
      if (!idsNovosParaBlocos.length && !pecasNaConversa.size && !anexos.size) {
        // Caso degenerado: tudo falhou, sem histórico e sem anexo. O turno cai
        // aqui e o relatório detalhado abaixo (com o desmarcar) NÃO chega a
        // rodar — o throw vai direto ao catch. Ainda assim a peça que falhou
        // PRECISA sair da seleção: senão o próximo envio repete a MESMA falha,
        // que é exatamente o "peça trava o chat" que este fluxo existe para
        // impedir. O erro abaixo já diz o motivo; remarcar a peça é nova
        // tentativa. (desmarcar durante `busy` é seguro — `onSelectionChange`
        // retorna cedo, como no desmarcar do caminho normal.)
        if (falhasDownload.length) panel.desmarcarPecas(falhasDownload.map((f) => f.id));
        throw new Error(
          falhasDownload.length === 1
            ? 'não foi possível baixar "' + falhasDownload[0].titulo + '" — ' + falhasDownload[0].erro
            : falhasDownload.length
              ? "nenhuma das " + falhasDownload.length + " peças novas pôde ser baixada"
              : "não há peça marcada nem arquivo anexado para analisar"
        );
      }
      if (idsNovosParaBlocos.length) {
        // a guarda conta TUDO que vai no request: peças ativas + todos os anexos
        // do contexto (não só os novos deste turno — os já enviados seguem no
        // request pelo histórico).
        paginas = guardaPaginas([...selectedIds, ...anexos.keys()]);
        await subirPecas(anexadas);
        await subirAnexos(anexosNovos);
        stripOldCacheControl();
        userContent = [...montarBlocos(idsNovosParaBlocos), { type: "text", text }];
      } else {
        // Acompanhamento sem peça/anexo novo (ou todas as novas falharam, mas há
        // histórico): segue com o contexto já anexado.
        paginas = guardaPaginas([...selectedIds, ...anexos.keys()]);
        userContent = text;
      }

      // Busca de jurisprudência (ver optsDoTurno). Nunca combinamos ferramentas
      // web com code_execution no mesmo request (as versões _20260209 já
      // embutem execução para filtragem dinâmica).
      const opts = optsDoTurno();

      // O request de fato: histórico + turno novo, SEM os blocos das peças
      // desmarcadas (prepararEnvio filtra por __pecaId) e sem campos internos.
      //
      // `selecaoEfetiva` e não `selectedIds`, e a diferença é a que separa
      // "desmarcada" de "ainda não apareceu": a timeline do PJe é LAZY, então
      // ao reabrir um processo boa parte das rows não existe no DOM e os
      // checkboxes correspondentes não podem estar marcados. Filtrar por
      // `selectedIds` puro mandaria o histórico da conversa retomada SEM
      // NENHUMA das peças que o usuário havia anexado — a IA responderia sobre
      // um processo vazio, e nada na tela diria isso. As pendentes entram
      // porque o usuário não as desmarcou; desmarcar de verdade continua
      // liberando contexto, porque o id sai do `selPendente` ao ser aplicado.
      // Os anexos do input entram SEMPRE em `ativos`: seus blocos carregam
      // `__pecaId` (o id sintético) para o chip poder liberá-los do contexto
      // como uma peça desmarcada, mas enquanto estão anexados eles não são
      // "peça desmarcada" — sem isto `prepararEnvio` os filtraria do histórico já
      // no segundo turno. Removê-los é ação explícita do usuário (o ✕ do chip
      // tira o id de `anexos`, e aí este filtro passa a valer para eles também).
      const ativos = new Set([...selecaoEfetiva(), ...anexos.keys()]);
      // O inventário entra AQUI, na cópia que vai à API — antes do count_tokens,
      // para o pré-voo medir exatamente o request que será enviado.
      const msgsEnvio = comInventario(
        prepararEnvio(
          [...conversation, { role: "user", content: userContent }],
          ativos
        ),
        selectedIds
      );

      // PRÉ-VOO CONDICIONAL. O count_tokens custa uma ida e volta à API e, num
      // turno sem peça nova (a pergunta de acompanhamento), é o ÚNICO bloqueio
      // antes do stream — ou seja, 100% do tempo que o usuário percebe entre o
      // Enter e o primeiro token.
      //
      // Ele existe para uma coisa: barrar o envio acima de 90% da janela. Quando
      // o turno anterior deixou uma medição EXATA (o usage do último request
      // físico, que já vem de graça) e a estimativa local do que foi acrescido
      // desde então mantém tudo muito abaixo do limite, não há o que barrar — a
      // guarda de 90% e o tratamento de model_context_window_exceeded seguem
      // como rede se a conta estiver errada.
      let est = null;
      // Anexo novo é conteúdo que a medição exata anterior não viu: nunca pular o
      // pré-voo quando há um (o que não foi medido não pode ser dispensado).
      const pulouPreVoo = !anexosNovos.length && podePularPreVoo(selectedIds);
      if (pulouPreVoo) {
        console.debug("[PJe IA] pré-voo pulado: folga larga sobre a medição exata anterior");
      } else {
        panel.setStatus("Estimando o tamanho do contexto…", true);
        est = await estimarContexto(msgsEnvio, opts);
      }
      if (novas.length) panel.endPrep(); // confirma "peças anexadas" após validar limites
      // Relatório do que ficou de fora. Fica NO CHAT (não no .status, que é
      // transitório): o usuário precisa poder ler com calma, ver o motivo de
      // cada peça e tentar de novo depois — sem que a análise que ele pediu
      // tenha sido perdida no caminho.
      //
      // E a peça que falhou é TIRADA DA SELEÇÃO (desmarcada): é o que impede o
      // bug de ela travar o próximo turno. Como ela nunca entrou no histórico,
      // seguir marcada só a faria ser re-tentada a cada envio — e quando fosse a
      // única peça "nova", o turno seguinte abortava inteiro, obrigando o usuário
      // a caçar e desmarcar a peça à mão. Desmarcá-la aqui é fazer por ele o que
      // ele teria de fazer; o aviso diz que ela saiu e como reanexar (marcar de
      // novo = nova tentativa de download).
      if (falhasDownload.length) {
        panel.mostrarFalhasPecas(falhasDownload, {
          dica:
            "Para não travar a conversa, " +
            (falhasDownload.length === 1 ? "a peça foi retirada" : "as peças foram retiradas") +
            " da seleção — a análise seguiu com o restante. Para tentar de novo, " +
            (falhasDownload.length === 1 ? "marque-a" : "marque-as") +
            " outra vez na lista; se persistir, abra a peça uma vez na linha do tempo do PJe antes.",
        });
        panel.desmarcarPecas(falhasDownload.map((f) => f.id));
      }
      // Peças que a memória retomou mas cujo upload não existe mais no
      // provedor, e que não foram rebaixadas a tempo. Grupo próprio porque a
      // causa e a saída são outras: não é "o PJe não entregou", é "o arquivo
      // enviado antes expirou" — e o conserto é reenviar, não desmarcar.
      if (semConteudo.length) {
        panel.mostrarFalhasPecas(semConteudo, {
          titulo: "peça(s) não entraram: o envio anterior expirou",
          dica: "Envie a mensagem de novo — elas serão baixadas e reenviadas.",
        });
      }
      // Peças (e anexos de texto) que entraram CORTADAS. Só os deste turno: os
      // dos turnos anteriores já foram reportados quando entraram.
      const cortadas = pecasTruncadas([...anexadas, ...anexosNovos]);
      if (cortadas.length) {
        panel.mostrarFalhasPecas(cortadas, avisoTrunc(cortadas));
      }
      let infoCtx = "";
      if (est) {
        infoCtx = " (~" + Math.round(est.tokens / 1000) + " mil tokens, " + est.pct + "% do contexto)";
        panel.setAlerta(null); // coube: qualquer alerta anterior está resolvido
        panel.setContexto({
          tokens: est.tokens,
          ctxTokens: est.ctxTokens,
          paginas,
          maxPaginas: modelCaps ? modelCaps.maxPages : 0,
          pecas: selectedIds.length + anexos.size,
        });
      } else {
        // Dois caminhos chegam aqui: o pré-voo foi PULADO (folga larga) ou ele
        // FALHOU (ex.: 429 após muitos uploads). Nos dois, re-pinta com a
        // estimativa local — o cache agora tem todas as peças baixadas, então o
        // número é decente. Sem isto o medidor ficaria CONGELADO no retrato de
        // quando a seleção foi feita ("N peça(s) sem medir", 0%). Inclui os
        // anexos do input (como todo outro ponto de medição), senão o gauge
        // subcontaria os já enviados nos turnos de acompanhamento.
        mostrarEstimativaLocal([...selectedIds, ...anexos.keys()]);
        // Pular só acontece com folga larga sobre a janela — o que significa
        // que qualquer alerta de contexto cheio anterior está resolvido. Falha
        // do count_tokens não diz nada sobre isso, então ali o alerta fica.
        if (pulouPreVoo) panel.setAlerta(null);
      }

      conversation.push({ role: "user", content: userContent });
      // só as que REALMENTE entraram: peça que falhou no download precisa
      // continuar elegível na próxima tentativa
      for (const id of anexadas) pecasNaConversa.add(id);
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
              true,
              "busca"
            );
          } else if (name === "web_fetch") {
            let fonte = "";
            try {
              fonte = input && input.url ? new URL(input.url).hostname : "";
            } catch {}
            panel.setStatus(
              fonte ? "Lendo fonte: " + fonte + "…" : "Lendo página de fonte jurídica…",
              true,
              "busca"
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
        // Anexos deste turno passaram a fazer parte do hist\u00F3rico: saem da fila de
        // pendentes (n\u00E3o se reanexam no pr\u00F3ximo envio) e seguem no chip como "no
        // contexto", igual \u00E0s pe\u00E7as enviadas.
        if (anexosNovos.length) {
          for (const id of anexosNovos) {
            const i = anexosPendentes.indexOf(id);
            if (i >= 0) anexosPendentes.splice(i, 1);
          }
          atualizarChipsAnexos();
        }
        atualizarGaugePosTurno(fim, [...selectedIds, ...anexos.keys()]);
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
            // O pedido deste turno, para a ação "Refazer seguindo seus modelos"
            // reabrir o modo minuta COM ele, em vez da instrução padrão.
            pedido: text,
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

        // Peças que a resposta apontou como faltantes viram botões de "adicionar"
        // — o modelo já identifica "o comprovante está na peça 214661494, não
        // anexada"; aqui esse id vira um clique que marca a peça para o próximo
        // envio, sem o usuário ter de procurá-la na lista.
        const faltantes = pecasCitadasFaltantes(mdResposta);
        if (faltantes.length) {
          panel.sugerirPecas(assistantEl, {
            pecas: faltantes,
            onAdd: (ids) => {
              const novos = panel.marcarPecas(ids);
              if (novos && novos.length) {
                panel.setStatus(
                  novos.length === 1
                    ? "Peça adicionada à seleção — ela entra no próximo envio."
                    : novos.length + " peças adicionadas à seleção — entram no próximo envio."
                );
              }
            },
          });
        }
      } else {
        // resposta vazia: não grava turno (evitaria content vazio no próximo request)
        panel.removeMessage(assistantEl);
        conversation.pop(); // remove o turno do usuário correspondente
        for (const id of anexadas) pecasNaConversa.delete(id); // peças saem junto
        // conversa esvaziou: o rótulo de provedor cai junto (senão um turno
        // futuro em OUTRO provedor herdaria o rótulo velho e a guarda de
        // troca deixaria passar um histórico misto)
        if (!conversation.length) conversaProvider = null;
        panel.setStatus("O modelo não retornou texto. Tente novamente.");
      }
    } catch (e) {
      panel.endPrep(true); // remove o card de preparo, se ainda estiver na tela
      // REDE REATIVA da memória de caso: a revalidação preventiva cobre o que
      // dá para prever (expiração, troca de chave), mas o provedor pode apagar
      // um arquivo por conta própria. Aqui o erro já aconteceu — o turno foi
      // desfeito pelo bloco abaixo de qualquer forma —, então o que resta é
      // limpar as referências mortas para que o PRÓXIMO envio re-suba as peças,
      // e dizer isso em vez de repassar o 404 cru da API.
      if (erroDeArquivoSumido(e)) {
        esquecerUploadsDoProvedor();
        panel.setStatus(
          "Os arquivos enviados antes não estão mais disponíveis no provedor. " +
            "Envie a mensagem de novo — as peças serão reenviadas."
        );
      } else {
        panel.setStatus("Erro: " + (e && e.message ? e.message : e));
      }
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
      for (const id of anexadas) pecasNaConversa.delete(id); // peças do turno desfeito
      // conversa esvaziou: o rótulo de provedor cai junto (ver ramo acima)
      if (!conversation.length) conversaProvider = null;
    } finally {
      busy = false;
      panel.lockInput(false);
      // Um ponto só para os QUATRO caminhos que mexem em `pecasNaConversa`
      // (turno bem-sucedido, resposta vazia, erro e turno desfeito): o finally
      // roda em todos, e espalhar a chamada garantiria esquecer um deles.
      panel.setPecasEnviadas([...pecasNaConversa]);
      // Fim de turno é o momento mais valioso para persistir, e o único em que
      // TODOS os quatro desfechos convergem — inclusive os dois que desfazem o
      // turno, cujo estado revertido também precisa ir ao disco.
      salvarCasoAgora();
    }
  });

  // ---------------------------------------------------------------------------
  // ANEXOS DO INPUT — o usuário solta PDF/TXT/MD na caixa de mensagem para
  // conversar sobre eles junto das peças, ou sozinhos. A UI (botão 📎, campo de
  // arquivo e os chips) vive no painel; aqui está a leitura, o estado e o que
  // vai ao modelo. Regras: leitura pelo MESMO extrator das peças
  // (`PJE.lerAnexo` → `lerCorpo`), nada ao disco (sessão só), e cada anexo entra
  // no request pelo mesmo `montarBlocos` das peças (id sintético + `entradaDoc`).
  // ---------------------------------------------------------------------------

  // Rótulo curto para o chip: tipo + tamanho/páginas.
  function anexoSubLabel(d) {
    if (!d) return "";
    if (d.kind === "pdf") return "PDF · " + (d.pages || 1) + (d.pages === 1 ? " pág." : " págs.");
    if (d.kind === "img") return (d.fmt || "imagem").toUpperCase();
    const kb = Math.max(1, Math.round((d.size || (d.text ? d.text.length : 0)) / 1024));
    const rot =
      d.fmt === "html" ? "HTML" : d.fmt === "docx" ? "Word" : d.fmt === "rtf" ? "RTF" : "Texto";
    return rot + " · " + kb + " KB";
  }

  // Lê o arquivo anexado. PDF/TXT/MD (e imagem) passam pelo MESMO extrator das
  // peças (`PJE.lerAnexo` → `lerCorpo`); o .docx é caso à parte porque NENHUM
  // dos três provedores o lê nativamente como documento (só PDF tem a rota de
  // visão/análise de documento) — então extraímos o TEXTO no cliente com o
  // `DocxImport` que a extensão já usa para importar peças-modelo, e ele entra
  // como bloco de texto igual a um .txt/.md. `DocxImport` é opcional (mesma
  // guarda do painel): sem ele, o .docx cai no `lerAnexo`, que o recusa com
  // motivo (é um ZIP → binário).
  async function lerArquivoAnexo(file) {
    const nome = String((file && file.name) || "").toLowerCase();
    if ((nome.endsWith(".docx") || nome.endsWith(".doc")) && typeof DocxImport !== "undefined") {
      // lerArquivo já lança mensagem clara para .doc (Word 97-2003) e vazio.
      const texto = await DocxImport.lerArquivo(file);
      return { kind: "text", fmt: "docx", text: texto, size: (file && file.size) || texto.length };
    }
    return PJE.lerAnexo(file);
  }

  // Reprojeta os anexos no painel (chips). O painel é só reflexo — a fonte de
  // verdade é a Map `anexos` daqui.
  function atualizarChipsAnexos() {
    if (!panel.setAnexos) return;
    panel.setAnexos(
      [...anexos.values()].map((d) => ({
        id: d.id,
        nome: d.titulo || d.nome,
        sub: anexoSubLabel(d),
        enviado: !anexosPendentes.includes(d.id),
      }))
    );
  }

  // Anexar ou soltar um arquivo muda o request tanto quanto marcar uma peça, e
  // por isso passa pelas MESMAS duas camadas de medição: a estimativa local
  // imediata e, com o mesmo debounce do clique na lista, o refinamento exato
  // (count_tokens). Sem a segunda camada o gauge ficava no chute local até o
  // envio — e um PDF anexado de 300 páginas só apareceria no número no momento
  // em que já não dava para tirá-lo sem perder a pergunta digitada.
  function reestimarComAnexos() {
    if (busy || !modelCaps) return;
    clearTimeout(estTimer);
    const sel = selecaoEfetiva();
    mostrarEstimativaLocal(comAnexos(sel));
    estTimer = setTimeout(() => refinarContexto(sel), 900);
  }

  // Teto de sanidade por anexo (antes do teto de b64 compartilhado que
  // `montarBlocos` aplica no conjunto todo). PDFs grandes vão à Files API, mas
  // acima disto o base64 na memória e o pré-voo já ficam pesados demais para uma
  // caixa de mensagem — o usuário anexa a peça pelo próprio PJe nesse caso.
  const ANEXO_BYTES_MAX = 32 * 1024 * 1024; // 32 MB por arquivo
  const ANEXO_MAX_QTD = 10; // por sessão — a caixa de mensagem não é gerenciador de arquivos

  if (panel.onAnexar) {
    panel.onAnexar(async (files) => {
      const lista = [...(files || [])];
      if (!lista.length) return;
      const falhas = [];
      let entrou = 0;
      for (const file of lista) {
        if (anexos.size >= ANEXO_MAX_QTD) {
          falhas.push({ titulo: file.name || "arquivo", erro: "limite de " + ANEXO_MAX_QTD + " anexos por conversa atingido" });
          continue;
        }
        if (file.size > ANEXO_BYTES_MAX) {
          falhas.push({
            titulo: file.name || "arquivo",
            erro: "arquivo grande demais (" + Math.round(file.size / 1e6) + " MB) para anexar aqui",
          });
          continue;
        }
        try {
          const corpo = await lerArquivoAnexo(file);
          const id = "anexo:" + ++anexoSeq;
          const nomeCurto = (file.name || "arquivo").replace(/\.[^.]+$/, "");
          anexos.set(id, Object.assign({}, corpo, { id, nome: file.name, titulo: "Anexo — " + nomeCurto }));
          anexosPendentes.push(id);
          entrou++;
        } catch (e) {
          falhas.push({ titulo: file.name || "arquivo", erro: (e && e.message) || String(e) });
        }
      }
      if (entrou) {
        atualizarChipsAnexos();
        reestimarComAnexos();
      }
      if (falhas.length) {
        panel.mostrarFalhasPecas(falhas, {
          titulo: falhas.length === 1 ? "1 arquivo não pôde ser anexado" : falhas.length + " arquivos não puderam ser anexados",
          dica: "A extensão anexa PDF, Word (.docx), TXT e Markdown (.md). Verifique o formato e o tamanho e tente de novo.",
        });
      }
    });
  }

  if (panel.onRemoverAnexo) {
    panel.onRemoverAnexo((id) => {
      if (!anexos.has(id)) return;
      // Sai da Map (é o que faz `prepararEnvio` filtrar os blocos dele do
      // histórico no próximo envio, liberando o contexto — simétrico ao
      // desmarcar de uma peça) e da fila de pendentes.
      anexos.delete(id);
      const i = anexosPendentes.indexOf(id);
      if (i >= 0) anexosPendentes.splice(i, 1);
      atualizarChipsAnexos();
      reestimarComAnexos();
    });
  }

  // ---------------------------------------------------------------------------
  // ESCOLHER COM IA — a camada 2 da seleção de peças.
  //
  // Manda à IA SÓ A LISTA (id, título, tipo e data de juntada) — nenhum byte de
  // conteúdo de peça — e recebe de volta os ids relevantes. É o que a regex da
  // camada 1 não consegue fazer: distinguir, entre sete peças chamadas
  // "Petição", qual é a inicial; entender que a "Manifestação" logo após o
  // laudo é a manifestação sobre o laudo; ler um "Documento 3".
  //
  // É um chat comum e ISOLADO, como a minuta e o mapa: sem tools, sem peças
  // anexadas, sem entrar em `conversation` nem em `pecasNaConversa` — logo,
  // funciona nos três provedores e não altera a conversa em andamento.
  //
  // Barato: ~30 tokens por peça (300 peças ≈ 9 mil tokens de entrada, alguns
  // centavos no pior caso) contra as centenas de milhares que a análise em si
  // consome. Mas o custo aparece no rodapé como qualquer outro turno.
  // ---------------------------------------------------------------------------
  const MAX_LINHAS_IA = 400; // teto de sanidade; acima disso o pedido já não cabe bem
  // Raciocínio BAIXO nesta chamada, qualquer que seja a preferência salva. A
  // triagem é classificação sobre metadados, não análise jurídica: com effort
  // alto o usuário espera dezenas de segundos por uma lista de ids — foi a
  // queixa que originou esta rodada. E o que decide a qualidade aqui não é o
  // tempo de raciocínio, são os SINAIS da lista (ordem cronológica, quem
  // juntou, tipo oficial, a triagem local), que esta rodada multiplicou.
  const EFFORT_TRIAGEM = "low";

  // System PRÓPRIO. O system do chat traz as regras de citação por página, de
  // não-invenção, de busca na web e do inventário de peças — nada disso se
  // aplica a quem não vai ler peça nenhuma, e ainda ocupa ~900 tokens de
  // instrução que o modelo precisa conciliar com a tarefa real. O que importa
  // do contexto é a FICHA do processo (classe, assunto, partes): é ela que diz
  // o que é relevante NESTE caso, e `contextoDoProcesso` já a monta.
  function systemTriagem() {
    return (
      "Você é um assistente de triagem de autos judiciais brasileiros. A partir da LISTA " +
      "de peças de um processo — apenas metadados, você NÃO tem o conteúdo delas —, indica " +
      "quais precisam ser lidas para um objetivo. Responde SEMPRE apenas com o JSON pedido, " +
      "sem preâmbulo e sem cercas de código." +
      // `false` EXPLÍCITO: a triagem escolhe peças DOS AUTOS, então aqui o
      // processo da tela é mesmo o objeto — o modo só-anexos não se aplica,
      // mesmo que haja um anexo na caixa. Sem o literal, o `undefined` cairia
      // no mesmo ramo por acaso, e a próxima leitura acharia que faltou o
      // argumento.
      contextoDoProcesso(false)
    );
  }

  // As regras de escolha. Vão no TEXTO do turno (não no system) porque mudam
  // junto com o formato da lista, que é montada aqui.
  const REGRAS_ESCOLHA = [
    "COMO LER A LISTA: uma peça por linha, em ordem CRONOLÓGICA — a nº 1 é a mais ANTIGA " +
      "do processo e a última é a mais RECENTE. Os campos vêm separados por “ | ”: número, " +
      "id, título, tipo oficial, data de juntada, quem juntou e a etiqueta da triagem " +
      "automática desta extensão (essencial, relevante, comum, expediente) — um palpite por " +
      "palavra-chave, que serve de ponto de partida e não de veredito.",
    "COMO ESCOLHER:",
    "• A espinha dorsal do processo quase sempre entra: petição inicial (costuma estar entre " +
      "as PRIMEIRAS linhas), contestação ou defesa, réplica, decisão saneadora, laudos e " +
      "perícias, atas e termos de audiência, alegações finais ou memoriais, sentença, " +
      "recursos e a decisão que os julga.",
    "• Vá além do título: peças de mesmo nome se distinguem pela DATA, por QUEM as juntou e " +
      "pela posição. Uma “Petição” da parte autora no começo é a inicial; uma da parte ré " +
      "logo depois da citação é a contestação.",
    "• Petição de encaminhamento (“Em anexo”, “junta documentos”) não tem conteúdo próprio: " +
      "ao escolher uma, escolha TAMBÉM os documentos juntados na mesma data.",
    "• Deixe de fora o expediente que não decide nada — certidões de intimação, avisos de " +
      "recebimento, comprovantes de publicação, guias, procurações, termos de juntada —, " +
      "salvo quando o objetivo for justamente prazo, intimação ou representação.",
    "• TAMANHO: escolha o MENOR conjunto que resolva o objetivo. Na maioria dos processos " +
      "isso fica entre 8 e 20 peças; num processo pequeno pode ser bem menos, e passar de 40 " +
      "só se o objetivo exigir (“todos os laudos”, “todas as decisões”). Peças demais " +
      "encarecem e diluem a análise; de menos, inviabilizam.",
  ].join("\n");

  const SUFIXO_ESCOLHA = [
    "FORMATO DA RESPOSTA — apenas este objeto JSON, sem preâmbulo, sem comentário e sem " +
      "cercas de código:",
    '{"ids":["123456","123457"],"motivos":{"123456":"petição inicial"},"resumo":"frase curta"}',
    "Em `ids`, os ids das peças escolhidas em ordem cronológica, EXATAMENTE como informados " +
      "— nunca invente um id nem devolva um que não esteja na lista. Em `motivos`, no máximo " +
      "6 palavras por peça dizendo por que ela entrou. Em `resumo`, uma frase com o critério " +
      "que você usou.",
  ].join("\n");

  // Etiqueta da triagem local (camada 1) que vai como DICA em cada linha. Os
  // nomes internos viram palavras que o modelo entende sem glossário.
  const ROTULO_REL = {
    essencial: "essencial",
    relevante: "relevante",
    neutro: "comum",
    ruido: "expediente",
  };

  function linhaDaPeca(d, n) {
    const nome = tituloLimpo(d.titulo) || "(sem título)";
    const campos = ["#" + n, d.id, nome];
    // O tipo oficial só entra quando ACRESCENTA: na maioria das peças ele
    // repete o título ("Contestação | Contestação") e seria token puro.
    if (d.tipo && d.tipo.trim().toLowerCase() !== nome.trim().toLowerCase()) campos.push(d.tipo);
    if (d.juntadoEm) campos.push(String(d.juntadoEm).slice(0, 16));
    if (d.juntadoPor) campos.push(String(d.juntadoPor).slice(0, 40));
    const rel = panel.classificarPeca ? panel.classificarPeca(d).rel : null;
    if (rel && ROTULO_REL[rel]) campos.push(ROTULO_REL[rel]);
    // Páginas só existem para peça já baixada (prefetch, preview, turno
    // anterior) — quando existem, são o melhor sinal de substância que há:
    // uma "Petição" de 2 páginas é encaminhamento, de 40 é a inicial.
    // `docsCache` é um Map: acesso por colchetes devolveria undefined SEMPRE,
    // e a falha seria muda (a linha sairia sem o número de páginas).
    const c = docsCache.get(d.id);
    if (c && c.pages) campos.push(c.pages + " pág.");
    return campos.join(" | ");
  }

  // Ordena cronologicamente (a mesma função da exportação em .zip: data de
  // juntada quando a grid foi lida, senão a inversa da ordem da tela) e, se a
  // lista passar do teto, corta pelo MEIO. Cortar as primeiras jogaria fora a
  // inicial; cortar as últimas, a sentença. O miolo é onde vive o expediente
  // repetitivo, e a omissão vai DITA no texto — sem cap silencioso.
  function listaParaIA(docs) {
    const ord = window.PjeExport
      ? PjeExport.ordenarCronologico(docs)
      : { docs: docs.slice().reverse(), criterio: "inversa da ordem da tela" };
    const emOrdem = ord.docs;
    if (emOrdem.length <= MAX_LINHAS_IA) {
      return { linhas: emOrdem.map((d, i) => linhaDaPeca(d, i + 1)), omitidas: 0, criterio: ord.criterio };
    }
    const metade = Math.floor(MAX_LINHAS_IA / 2);
    const inicio = emOrdem.slice(0, metade).map((d, i) => linhaDaPeca(d, i + 1));
    const desde = emOrdem.length - (MAX_LINHAS_IA - metade);
    const fim = emOrdem.slice(desde).map((d, i) => linhaDaPeca(d, desde + i + 1));
    const omitidas = emOrdem.length - MAX_LINHAS_IA;
    return {
      linhas: inicio.concat(["… " + omitidas + " peças do meio do processo omitidas por limite de tamanho …"], fim),
      omitidas,
      criterio: ord.criterio,
    };
  }

  // Ids já COMPLETOS dentro do array "ids" de um JSON ainda em construção — é o
  // que permite marcar as peças AO VIVO, conforme o modelo as emite, em vez de
  // deixar o usuário olhando para um botão "Escolhendo…" por vários segundos.
  // Só aceita id fechado entre aspas: um id pela metade marcaria a peça errada.
  function idsParciais(texto) {
    const i = texto.indexOf('"ids"');
    if (i < 0) return [];
    const abre = texto.indexOf("[", i);
    if (abre < 0) return [];
    const fecha = texto.indexOf("]", abre);
    const trecho = texto.slice(abre + 1, fecha < 0 ? texto.length : fecha);
    return (trecho.match(/"(\d{3,})"/g) || []).map((s) => s.slice(1, -1));
  }

  // O modelo pode devolver o JSON cercado por ``` ou com um preâmbulo, apesar da
  // instrução. Extrai o primeiro objeto plausível em vez de falhar.
  function lerJsonEscolha(texto) {
    const s = String(texto || "");
    const bruto = s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1);
    if (!bruto) return null;
    try {
      return JSON.parse(bruto);
    } catch {
      return null;
    }
  }

  panel.onEscolherIA(async (docs, objetivo, selAntes) => {
    if (busy || bloqueadoPelaExportacao()) return;
    if (!docs || !docs.length) return;
    busy = true;
    panel.setIaOcupado(true);
    panel.setStatus("Lendo a lista de peças e escolhendo as relevantes…", true);
    // Marcar ao vivo significa mexer na seleção do usuário antes de saber se o
    // turno termina bem: guardamos o estado anterior para poder devolvê-lo.
    const selOriginal = Array.isArray(selAntes) ? selAntes.slice() : null;
    let mexeuNaSelecao = false;
    try {
      await garantirCaps();
      const alvo = objetivo
        ? 'responder a esta pergunta do usuário: "' + objetivo.slice(0, 500) + '"'
        : "entender o processo: quem são as partes, o que se pede, o que a outra " +
          "parte responde, que provas há e como o feito está hoje";
      const lista = listaParaIA(docs);
      const texto =
        "OBJETIVO: escolher, na lista de peças abaixo, quais precisam ser lidas para " +
        alvo + ".\n\n" +
        REGRAS_ESCOLHA + "\n\n" +
        SUFIXO_ESCOLHA + "\n\n" +
        "LISTA DE PEÇAS (" + docs.length + " no total, em ordem cronológica; critério: " +
        lista.criterio + "):\n" +
        lista.linhas.join("\n");

      const validos = new Set(docs.map((d) => d.id));
      let acc = "";
      let marcados = 0;
      // A marcação ao vivo é o antídoto da espera: os `ids` são o PRIMEIRO
      // campo do JSON, então as peças acendem na lista bem antes de o modelo
      // terminar de escrever os motivos e o resumo.
      function marcarParcial() {
        const ids = [...new Set(idsParciais(acc))].filter((id) => validos.has(id));
        if (ids.length <= marcados) return;
        marcados = ids.length;
        mexeuNaSelecao = true;
        panel.aplicarEscolhaIA(ids, null);
        panel.setStatus(
          "Escolhendo… " + marcados + " peça" + (marcados > 1 ? "s" : "") + " até agora",
          true
        );
      }
      const fim = await stream(
        prepararEnvio([{ role: "user", content: [{ type: "text", text: texto }] }], null),
        {
          onDelta(d) {
            acc += d;
            marcarParcial();
          },
          onThinking() {},
          onTool() {},
          onTrunc() {},
          onRetry() {
            acc = "";
            marcados = 0; // a re-tentativa recomeça o JSON do zero
            panel.setStatus("Instabilidade momentânea na API — tentando de novo…", true);
          },
          onReinicio() {
            acc = "";
            marcados = 0;
            panel.setStatus("O serviço da extensão reiniciou — tentando de novo…", true);
          },
        },
        // System próprio e raciocínio baixo: ver EFFORT_TRIAGEM/systemTriagem.
        { system: systemTriagem(), effort: EFFORT_TRIAGEM }
      );
      registrarCusto(fim);

      const r = lerJsonEscolha(acc);
      // Só ids que EXISTEM na lista: um id inventado marcaria nada e faria a
      // contagem mentir. Também dedup, porque o modelo às vezes repete.
      const ids = [...new Set((r && Array.isArray(r.ids) ? r.ids : []).map(String))].filter(
        (id) => validos.has(id)
      );
      if (!ids.length) {
        // Nada aproveitável: a seleção que o usuário tinha volta como estava —
        // a marcação ao vivo não pode deixar a lista num estado que ele não
        // pediu e que só ele saberia desfazer.
        if (mexeuNaSelecao && selOriginal) panel.aplicarEscolhaIA(selOriginal, null);
        panel.setStatus(
          "A IA não conseguiu escolher peças desta lista. Use os atalhos chave/principais."
        );
        return;
      }
      panel.aplicarEscolhaIA(ids, (r && r.motivos) || null);
      panel.setStatus("");
      // O resultado precisa ser AUDITÁVEL: o usuário tem de poder discordar. O
      // critério vai na nota e o motivo de cada peça no title da linha dela.
      panel.setSelNota(
        "✨ A IA marcou " + ids.length + " de " + docs.length + " peças" +
          (r && r.resumo ? " — " + String(r.resumo).slice(0, 160) : "") +
          ". Passe o mouse numa peça para ver o motivo; ajuste à vontade."
      );
    } catch (e) {
      // Erro no meio do stream: desfaz a marcação parcial pelo mesmo motivo do
      // caso "nenhum id" — a seleção era do usuário e o turno não terminou.
      if (mexeuNaSelecao && selOriginal) panel.aplicarEscolhaIA(selOriginal, null);
      const msg = (e && e.message) || String(e);
      panel.setStatus("Não foi possível escolher com IA: " + msg);
      if (e && e.ctxCheio) panel.setAlerta(ALERTA_CTX_CHEIO);
    } finally {
      busy = false;
      panel.setIaOcupado(false);
      // A escolha da IA REESCREVE a seleção de peças, que é parte do registro
      // da conversa. O `selChangeCb` que ela dispara cai na guarda de `busy`
      // do `agendarSalvar` (o turno ainda estava correndo), então sem esta
      // linha a nova seleção só iria ao disco no próximo evento qualquer.
      salvarCasoAgora();
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
  // NÃO pede mais "o ato cabível… e dispositivo". Pedir o ato E o resultado é
  // encomendar ao modelo a "formulação de juízos conclusivos sobre a aplicação
  // da norma jurídica" — o item AR4 do Anexo da Resolução CNJ 615/2025, de ALTO
  // risco. Quem diz a espécie agora é o seletor da faixa, e quem diz o
  // resultado é a tese do usuário. (Duplicada em panel.js — mudar as duas.)
  const INSTRUCAO_MINUTA_PADRAO =
    "Redija a minuta seguindo a praxe forense, indicando a origem de cada afirmação.";

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
    // A LINHA DO TEMPO do processo viaja neste MESMO request (publicação,
    // intimação, decurso, trânsito) e não tem peça nem folha. Sem um formato
    // próprio para ela, a regra acima deixava o modelo entre duas saídas ruins:
    // omitir a data — e o relatório da sentença sai sem os atos que a
    // fundamentam, que é o defeito que esta rodada existe para resolver — ou
    // pendurar a data numa peça qualquer para satisfazer o formato, isto é, uma
    // citação INVENTADA num documento que vai ao PJe assinado. A saída é dar à
    // movimentação a sua própria forma de citar.
    " Fato que vier da LINHA DO TEMPO do processo (distribuição, publicação, intimação," +
    " decurso de prazo, trânsito em julgado, conclusão) é citado como (movimentação de" +
    " DD/MM/AAAA): nunca atribua a uma peça uma data que veio da linha do tempo, e nunca" +
    " invente folha para ela." +
    " NUNCA invente nome de parte, número de processo, data, valor, dispositivo legal ou" +
    " precedente: se algo necessário não constar das peças anexadas, escreva no lugar" +
    " [COMPLETAR: o que falta], para quem for assinar preencher." +
    " NÃO assine, não date e não crie cabeçalho de tribunal, vara ou comarca — isso o" +
    " sistema do PJe já acrescenta." +
    // O system prompt do chat manda destacar ressalvas com blocos "> [!ALERTA]".
    // Aqui a saída é o texto de um ato processual, que circula fora da extensão:
    // um bloco desses no meio de uma sentença é defeito, não destaque. O canal
    // para o que falta continua sendo o [COMPLETAR: …].
    " NÃO use blocos de aviso do tipo \"> [!ALERTA]\" ou \"> [!ATENÇÃO]\": nada de" +
    " observação ao leitor no corpo do ato — o que não estiver confirmado nas peças vira" +
    " [COMPLETAR: o que falta].";

  // ---------------------------------------------------------------------------
  // ORIENTAÇÃO DECISÓRIA (Resolução CNJ 615/2025)
  //
  // O Anexo da resolução separa a "formulação de juízos conclusivos sobre a
  // aplicação da norma jurídica ou precedentes a um conjunto determinado de
  // fatos concretos" (AR4, ALTO risco) da "produção de textos de apoio para
  // facilitar a confecção de atos judiciais" (BR4, baixo) e dos "atos
  // processuais ordinatórios" (BR1, baixo). A diferença entre os dois primeiros
  // não está no texto que sai — está em QUEM decidiu o resultado. Com a tese
  // informada antes, o modelo redige uma conclusão que já é humana, e é isso
  // que rebaixa o risco da ferramenta.
  //
  // O art. 19, §3º, II veda o uso como instrumento autônomo "sem a devida
  // ORIENTAÇÃO, interpretação, verificação e revisão": a orientação vem antes
  // da revisão no próprio texto normativo. O art. 20, IV mantém o magistrado
  // "integralmente responsável"; o art. 32 veda que a IA "restrinja ou
  // substitua a autoridade final".
  //
  // O bloco vai em XML pelo mesmo motivo da `molduraModelos`: o conteúdo é
  // texto livre do usuário e a tag é a única fronteira que o modelo não
  // confunde com a resposta. E vai no FIM (junto da instrução), não no prefixo
  // cacheado — a orientação muda a cada request, ao contrário dos modelos.
  function blocoOrientacao(ato) {
    if (!ato || ato.regime === "livre" || !ato.tese) return "";
    const limpo = String(ato.tese).replace(/<\/?orientacao_decisoria\b[^>]*>/gi, "");
    return (
      "\n\n<orientacao_decisoria>\n" +
      "ESPÉCIE DO ATO: " + (ato.rotulo || ato.especie) + "\n" +
      (ato.regime === "tese"
        ? "TESE E DISPOSITIVO, definidos por quem vai assinar:\n"
        : "DETERMINAÇÃO, definida por quem vai assinar:\n") +
      limpo +
      "\n</orientacao_decisoria>"
    );
  }

  // A INSTRUÇÃO do usuário, com moldura própria e no FIM da mensagem.
  //
  // Antes ela era concatenada crua na frente do SUFIXO_MINUTA — sem tag, sem
  // separador — e perdia nas duas dimensões que decidem o que um modelo obedece:
  //
  //   FRONTEIRA: a tese tem <orientacao_decisoria>, os modelos têm
  //     <modelos_de_referencia>, e o pedido do usuário era o ÚNICO texto livre
  //     sem moldura, indistinguível das regras do produto. Uma instrução de ~80
  //     chars vinha seguida de ~3.000 chars de imperativo categórico; um pedido
  //     que contrariasse o sufixo ("sem tabelas", "texto corrido") perdia.
  //   RECÊNCIA: depois dela ainda vinham a lista de ids, as datas de juntada e
  //     até ~15 mil chars de linha do tempo. A última coisa lida NÃO era o
  //     pedido.
  //
  // Ela sobe para o fim, mas fica ANTES de `blocoOrientacao`: a tese continua
  // sendo a última coisa que o modelo lê, porque é obrigação normativa (a
  // decisão de quem assina, Res. CNJ 615) e a instrução é regra de forma.
  //
  // Com a instrução PADRÃO a moldura é neutra, sem a cláusula de prevalência: o
  // painel injeta esse texto sozinho no campo vazio, e dar-lhe peso de "o
  // usuário pediu isto" seria fabricar uma ordem que ninguém deu.
  function blocoInstrucao(instrucao) {
    const txt = String(instrucao || "").trim();
    if (!txt) return "";
    const limpo = txt.replace(/<\/?instrucao_do_usuario\b[^>]*>/gi, "");
    const cabeca =
      txt === INSTRUCAO_MINUTA_PADRAO
        ? "Instrução para esta minuta:"
        : "É isto que quem vai assinar pediu para esta minuta. Onde ela for mais " +
          "específica que as regras de forma acima, ela PREVALECE — salvo as regras " +
          "de não inventar dado e de indicar a origem de cada afirmação, que valem " +
          "sempre.";
    return (
      "\n\n<instrucao_do_usuario>\n" + cabeca + "\n" + limpo + "\n</instrucao_do_usuario>"
    );
  }

  // A regra que diz ao modelo o que fazer com o bloco acima. Fica FORA do
  // `SUFIXO_MINUTA` de propósito: aquele é a regra de FORMA, vale para toda
  // minuta e é a maior superfície de regressão do fluxo — esta é condicional.
  function regraDaOrientacao(ato) {
    if (!ato || ato.regime === "livre") return "";
    // O ponto mais delicado do desenho é o que fazer quando as peças
    // CONTRARIAM a orientação. "Corrigir" quem assina devolveria o modelo ao
    // AR4 — ele estaria formulando o juízo conclusivo por conta própria. Calar
    // seria pior: um ato fundamentado contra os próprios autos, com aparência
    // de acabado. A saída é o canal que o SUFIXO_MINUTA já estabelece, o
    // [COMPLETAR: …] — e NÃO um marcador novo, que brigaria com a proibição de
    // blocos de aviso no corpo do ato.
    const comum =
      " Se alguma peça CONTRARIAR a orientação, não altere o dispositivo e não" +
      " omita o ponto: registre-o no corpo do ato como [COMPLETAR: divergência —" +
      " a orientação afirma X, mas (Título da peça, id 123456, fl. 7) registra Y]," +
      " para quem for assinar resolver antes de assinar." +
      " Se a orientação não disser algo necessário (valor, prazo, verba de" +
      " sucumbência, prazo de cumprimento), use [COMPLETAR: …] no lugar — nunca" +
      " arbitre por conta própria.";
    if (ato.regime === "tese") {
      return (
        " ORIENTAÇÃO OBRIGATÓRIA: a tese e o dispositivo do bloco" +
        " <orientacao_decisoria> JÁ FORAM DECIDIDOS por quem assina o ato. Você" +
        " NÃO decide o resultado, NÃO escolhe entre teses possíveis e NÃO propõe" +
        " solução diferente: a sua tarefa é REDIGIR o ato que implementa essa" +
        " decisão, fundamentando-a com os fatos e as provas das peças anexadas." +
        comum
      );
    }
    return (
      " ORIENTAÇÃO OBRIGATÓRIA: a determinação do bloco <orientacao_decisoria> JÁ" +
      " FOI DECIDIDA por quem assina o ato. Redija o despacho que a implementa, na" +
      " forma de praxe, sem acrescentar determinação que não conste dela e sem" +
      " decidir questão de mérito." +
      comum
    );
  }

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
    // A REGRA ABSOLUTA vem DEPOIS dos modelos, não antes. Ela é a frase mais
    // categórica do bloco, e abrindo-o dominava a leitura inteira: o modelo
    // entrava nos <modelo> já convencido de que não devia aproveitar nada deles
    // — que é exatamente o "ignorou o meu modelo" relatado. A ordem que funciona
    // é: o que fazer (intro) → os modelos → o limite.
    return {
      type: "text",
      text:
        "<modelos_de_referencia>\n" +
        intro +
        partes.join("\n") +
        "\nREGRA ABSOLUTA: não copie NENHUM fato dos modelos — nomes de partes, números, " +
        "datas, valores, endereços, dispositivos legais, fundamentos ou trechos " +
        "específicos do caso. Aproveite só a forma e a linguagem. Todo o conteúdo da " +
        "minuta sai EXCLUSIVAMENTE das peças deste processo, anexadas em seguida. Se um " +
        "modelo trouxer um dado que não conste dessas peças, use [COMPLETAR: …] no lugar. " +
        "Os modelos são a forma; os autos são o conteúdo." +
        "\n</modelos_de_referencia>",
    };
  }

  // NÃO é `async` no topo, e isso é a parte que não pode ser "simplificada": as
  // guardas de entrada precisam devolver `false` DE FORMA SÍNCRONA para o
  // painel saber que a recusa aconteceu e preservar a instrução, a categoria e
  // a tese que o usuário digitou. Num handler `async`, `return false` viraria
  // `Promise.resolve(false)` e o teste `=== false` lá nunca casaria — o estado
  // seria destruído do mesmo jeito. O trabalho de verdade vai na IIFE async
  // logo abaixo.
  panel.onMinuta((text, selecaoDoPainel, modelos, ato) => {
    // `ocupadoJsf()` já escreve o motivo no status; o `busy` puro não escrevia
    // nada, e uma recusa muda é indistinguível de um botão quebrado.
    if (busy) {
      panel.setStatus("Ainda estou respondendo — aguarde este turno terminar.");
      return false;
    }
    if (ocupadoJsf()) return false;
    // Seleção EFETIVA, pelo mesmo motivo do chat: num processo retomado as rows
    // da timeline lazy podem não existir ainda, e a minuta recusaria peças que
    // o usuário vê marcadas na conversa.
    const selectedIds = selecaoEfetiva().length ? selecaoEfetiva() : selecaoDoPainel;
    if (selectedIds.length === 0) {
      panel.setStatus("Marque as peças que devem embasar a minuta.");
      return false;
    }
    busy = true;
    panel.lockInput(true);
    // REDE DE SEGURANÇA, e não zelo: `busy = true` é posto AQUI, enquanto o
    // `finally` que o zera vive dentro de `minutarAgora` — e as primeiras
    // linhas de lá (moldura dos modelos, bolha do usuário) rodam ANTES do try
    // interno. Uma exceção nesse trecho rejeitaria a Promise sem dono e
    // deixaria `busy` preso em true para sempre: a extensão trava, e só
    // recarregar a página resolve.
    minutarAgora(text, selectedIds, modelos, ato).catch((e) => {
      busy = false;
      panel.lockInput(false);
      panel.endPrep(true);
      panel.setStatus("Erro: " + ((e && e.message) || e));
    });
    return true;
  });

  async function minutarAgora(text, selectedIds, modelos, ato) {
    const instrucao = (text && text.trim()) || INSTRUCAO_MINUTA_PADRAO;
    const molduraBloco = molduraModelos(modelos);
    const catModelos =
      molduraBloco && typeof MLIB !== "undefined"
        ? MLIB.rotuloCategoria(modelos[0].categoria)
        : "";
    // A orientação aparece na bolha do usuário porque ela É a decisão dele: o
    // transcript é o registro da conversa, e quem reabrir o caso precisa ver
    // com que tese aquela minuta foi pedida (art. 19, §6º e art. 21, §2º).
    const linhaAto = ato
      ? "\n\n⚖️ " + ato.rotulo +
        (ato.tese
          ? " — " + (ato.regime === "tese" ? "tese e dispositivo" : "determinação") +
            ": " + ato.tese
          : "")
      : "";
    panel.addMessage(
      "user",
      "📝 Gerar minuta: " +
        instrucao +
        linhaAto +
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
      // Linha do tempo processual: prazos e intimações não estão no texto
      // das peças, e este caminho monta os blocos do zero (não passa por
      // `comInventario`). Best-effort — falhar não impede o turno.
      await garantirMovimentacoes();
      // As caps ANTES de qualquer decisão. A minuta não chamava garantirCaps —
      // dependia de o refreshCaps do boot já ter respondido —, e isso era
      // inofensivo enquanto a UI não afirmava nada. Deixou de ser: a barra agora
      // ANUNCIA o modelo que vai redigir, e numa janela de corrida ela diria
      // "GPT-5.6 Terra" enquanto o turno sairia no Luna (sem `payload.model` o
      // worker cai no modelo do chat), sem nada na tela dizendo. Resolve
      // imediato quando as caps já chegaram, que é o caminho normal.
      await garantirCaps();
      // Peça que falha no download não derruba a minuta: seguimos com o que
      // baixou e o relatório diz o que ficou de fora (mesma regra do chat).
      const dl = await baixarSelecionadas(selectedIds);
      if (!dl.ok.length) throw new Error("nenhuma das peças marcadas pôde ser baixada");
      // Teto de páginas do modelo que vai REDIGIR: o do chat barraria em 100
      // páginas (Haiku) uma minuta que vai rodar no Sonnet 5, que aceita 600.
      guardaPaginas(dl.ok, capsMinuta);
      await subirPecas(dl.ok);
      const blocos = montarBlocos(dl.ok);
      panel.endPrep();
      if (dl.falhas.length) panel.mostrarFalhasPecas(dl.falhas);
      const cortadasMinuta = pecasTruncadas(dl.ok);
      if (cortadasMinuta.length) {
        panel.mostrarFalhasPecas(cortadasMinuta, avisoTrunc(cortadasMinuta));
      }

      panel.setStatus("Redigindo a minuta a partir das peças marcadas…", true);

      // Request ISOLADO, como o mapa mental: não entra em conversation nem em
      // pecasNaConversa — gerar uma minuta não altera a conversa em andamento.
      // A moldura do modelo (se houver) é o PRIMEIRO bloco: fica antes das
      // peças, no prefixo cacheado, e o reforço na instrução volta a amarrar
      // "forma do modelo, fatos das peças".
      // O reforço é o ÚNICO fio que liga a moldura — lá no topo do prefixo
      // cacheado — à tarefa, centenas de milhares de tokens adiante. Nomear a
      // quantidade torna verificável que eles chegaram: "os 3 modelos" é uma
      // afirmação que o modelo pode conferir contra o que leu.
      const reforcoModelo = molduraBloco
        ? " Baseie a FORMA (estrutura, seções, linguagem) " +
          (modelos.length > 1
            ? "nos " + modelos.length + " modelos de referência"
            : "no modelo de referência") +
          " no início desta mensagem — escolhendo o mais adequado e aproveitando o" +
          " linguajar dos demais —, mas com os FATOS exclusivamente das peças deste" +
          " processo."
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
                //
                // A lista sai de `dl.ok`, NUNCA de `selectedIds`: peça que
                // falhou no download não tem bloco no request, e anunciá-la
                // como anexada convida o modelo a citar um id que ele não viu
                // — o pior erro possível aqui, porque a citação sai com a
                // mesma cara de uma legítima e só se descobre conferindo os
                // autos.
                //
                // A INSTRUÇÃO do usuário saiu daqui da frente e vai no FIM, com
                // moldura própria (ver blocoInstrucao). O `trimStart` é porque o
                // SUFIXO_MINUTA começa com um espaço, herdado de quando vinha
                // depois dela.
                text:
                  SUFIXO_MINUTA.trimStart() +
                  regraDaOrientacao(ato) +
                  reforcoModelo +
                  " Peças anexadas, use exatamente estes ids: " +
                  dl.ok.map((id) => metaDe(id).titulo).join("; ") +
                  "." +
                  // O ato a redigir depende do que JÁ ACONTECEU: prazo
                  // decorrido, parte intimada, data da publicação. Nada disso
                  // está no texto das peças, e um relatório de sentença escrito
                  // sem essas datas sai incompleto ou inventado.
                  datasDasPecas(dl.ok) +
                  linhaDoTempoProcessual() +
                  blocoInstrucao(instrucao) +
                  // A tese continua por ÚLTIMO: é a decisão de quem assina.
                  blocoOrientacao(ato),
              },
            ],
          },
        ],
        null
      );

      // Busca de jurisprudência: a minuta ia SEM as tools mesmo com o toggle
      // aceso — "Jurisprudência ligada + Gerar minuta" produzia uma minuta sem
      // busca nenhuma, e nada na tela dizia isso. O mesmo `opts` vai ao pré-voo,
      // senão a conta de tokens não é a do request que sai.
      const optsMinuta = optsDoTurno(capsMinuta);
      // O MODELO da minuta (irmão de redação do mesmo provedor) e o SYSTEM
      // próprio dela viajam no mesmo `opts`, que `stream` mescla por cima do
      // payload padrão — o mesmo mecanismo que a triagem já usa para o system.
      // Vão TAMBÉM ao `estimarContexto` logo abaixo: o pré-voo tem de medir o
      // request que sai, e são ~5,4 mil chars de system e uma janela diferentes.
      if (minutaInfo && minutaInfo.model) optsMinuta.model = minutaInfo.model;
      optsMinuta.system = systemMinuta(!!optsMinuta.tools);

      // Pré-voo: a minuta não tinha nenhum — autos grandes somados a até 12
      // peças-modelo voltavam como erro cru da API em vez da mensagem que diz
      // o que fazer. `guardaPaginas` acima cobre só o teto de páginas de PDF.
      // `estimarContexto` LANÇA acima de 90% da janela (com `err.ctxCheio`); o
      // catch abaixo trata, como no chat.
      //
      // A bolha do assistente nasce DEPOIS daqui de propósito: um turno barrado
      // pelo pré-voo não deve deixar bolha vazia na conversa. (O catch ainda
      // remove `assistantEl` se ele existir — a falha pode vir do stream.)
      await estimarContexto(messages, optsMinuta);
      assistantEl = panel.addMessage("assistant", "");

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
      }, optsMinuta);
      registrarCusto(fimMinuta);

      const md = limparMarkdownMinuta(acc);
      if (!md) {
        panel.setStatus("O modelo não devolveu a minuta — tente gerar novamente.");
        if (assistantEl) panel.removeMessage(assistantEl);
        return;
      }

      const url = await guardarMinuta(md, tituloDaMinuta(md), {
        ato,
        // O modelo que REDIGIU, não o configurado no chat: é este campo que o
        // editor imprime como "Texto produzido com auxílio de IA (…)", o
        // registro dos arts. 19, §6º e 21, §2º da Res. CNJ 615. Com o do chat
        // ele passaria a mentir no instante em que a minuta trocou de modelo.
        modelo: (minutaInfo && minutaInfo.model) || (modelInfo && modelInfo.model) || "",
        modelosCategoria: catModelos || "",
        modelosQtd: modelos && modelos.length ? modelos.length : 0,
      });
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
      // contexto cheio: o pré-voo agora existe também aqui, e o usuário precisa
      // AGIR (desmarcar peças, mandar menos modelos ou recomeçar)
      if (e && e.ctxCheio) {
        ultimaChaveEst = "";
        panel.setAlerta(ALERTA_CTX_CHEIO);
      }
      if (assistantEl && !acc) panel.removeMessage(assistantEl);
    } finally {
      busy = false;
      panel.lockInput(false);
      // A minuta É um registro da conversa: o card fica na tela e o markdown
      // inteiro vive no transcript. Sem esta linha ele só chegava ao disco se
      // algum OUTRO evento disparasse gravação depois — gerar a minuta e
      // fechar a aba perdia o card e, junto, as peças que acabaram de baixar
      // (a fila `pecasSujas` também sai daqui).
      salvarCasoAgora();
    }
  }

  // --- Rascunhos de minuta -----------------------------------------------
  // Ficam em chrome.storage.local — e não em session, como o mapa — porque o
  // ponto do recurso é reabrir a minuta depois, inclusive noutro dia. Isso põe
  // trecho dos autos NO DISCO: a poda dupla (10 mais recentes e nada acima de
  // 7 dias) e o botão "Descartar" do editor existem por causa disso.
  const MAX_MINUTAS = 10;
  const VALIDADE_MINUTA_MS = 7 * 24 * 60 * 60 * 1000;

  function guardarMinuta(md, titulo, ctx) {
    return new Promise((resolve, reject) => {
      const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
      const chave = "minuta:" + id;
      let processo = "";
      try {
        processo = PJE.getNumeroProcesso() || "";
      } catch (e) {}
      // A ORIGEM da minuta vai ao disco junto com ela: espécie, a orientação
      // verbatim e o modelo de IA usado. É o registro que os arts. 19, §6º e
      // 21, §2º da Resolução CNJ 615 pedem — e, na prática, é o que permite a
      // quem revisa dias depois saber com que tese aquele texto foi pedido.
      // Registros ANTERIORES a esta versão não têm o campo: quem lê precisa
      // tolerar a ausência (`d.origem || null`).
      const ato = ctx && ctx.ato;
      const origem = ato
        ? {
            especie: ato.especie,
            rotulo: ato.rotulo,
            regime: ato.regime,
            tese: ato.tese || "",
            modelo: (ctx && ctx.modelo) || "",
            modelosCategoria: (ctx && ctx.modelosCategoria) || "",
            modelosQtd: (ctx && ctx.modelosQtd) || 0,
            em: Date.now(),
          }
        : null;
      const registro = {
        // Guarda o Markdown CRU: a página do editor (src/editor.html) o converte
        // com o MinutaMd — parser dedicado que faz listas aninhadas, tabelas com
        // alinhamento e parágrafos de verdade (o renderMd do chat achataria).
        // O HTML editado é gravado de volta pelo próprio editor a cada mudança.
        md,
        titulo: titulo || "Minuta",
        processo,
        origem,
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
    // Mesma razão da nota no SUFIXO_MINUTA: as seções Prazos, Situação atual e
    // Fatos vivem de datas que estão na LINHA DO TEMPO, não em peça nenhuma —
    // sem um formato próprio, ou o nó sai sem data ou a data sai pendurada numa
    // peça que não a contém.
    " Item que vier da LINHA DO TEMPO do processo (publicação, intimação, decurso de prazo," +
    " trânsito em julgado) termina com (movimentação de DD/MM/AAAA), nunca com uma peça." +
    " RECURSOS: use **negrito** no rótulo do item e ==destaque== no que for decisivo; quando a" +
    " informação for tabular (partes, linha do tempo, valores, prazos), use UMA tabela Markdown" +
    " na seção correspondente, com no máximo 3 colunas e células curtas. NÃO use emojis," +
    " imagens, HTML, fórmulas, numeração de tópicos nem blocos de aviso do tipo" +
    " \"> [!ALERTA]\" (o mapa é feito de nós; um bloco de citação não vira nó).";

  // Guardas SÍNCRONAS e `false` na recusa, pelo mesmo motivo da minuta: o
  // painel só limpa o campo e desliga o modo depois do aceite (ver a nota do
  // `onMinuta` sobre por que este handler não pode ser `async` no topo).
  panel.onMapa((text, selecaoDoPainel) => {
    if (busy) {
      panel.setStatus("Ainda estou respondendo — aguarde este turno terminar.");
      return false;
    }
    if (ocupadoJsf()) return false;
    const selectedIds = selecaoEfetiva().length ? selecaoEfetiva() : selecaoDoPainel;
    if (selectedIds.length === 0) {
      panel.setStatus("Marque as peças que devem embasar o mapa mental.");
      return false;
    }
    busy = true;
    panel.lockInput(true);
    // idem minuta: sem este catch, uma exceção antes do try interno deixaria
    // `busy` preso e travaria a extensão
    mapearAgora(text, selectedIds).catch((e) => {
      busy = false;
      panel.lockInput(false);
      panel.endPrep(true);
      panel.setStatus("Erro: " + ((e && e.message) || e));
    });
    return true;
  });

  async function mapearAgora(text, selectedIds) {
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
      // Linha do tempo processual: prazos e intimações não estão no texto
      // das peças, e este caminho monta os blocos do zero (não passa por
      // `comInventario`). Best-effort — falhar não impede o turno.
      await garantirMovimentacoes();
      // Peça que falha no download não derruba o mapa: seguimos com o que
      // baixou e o relatório diz o que ficou de fora (mesma regra do chat).
      const dl = await baixarSelecionadas(selectedIds);
      if (!dl.ok.length) throw new Error("nenhuma das peças marcadas pôde ser baixada");
      guardaPaginas(dl.ok);
      await subirPecas(dl.ok);
      const blocos = montarBlocos(dl.ok);
      panel.endPrep();
      if (dl.falhas.length) panel.mostrarFalhasPecas(dl.falhas);
      const cortadasMapa = pecasTruncadas(dl.ok);
      if (cortadasMapa.length) {
        panel.mostrarFalhasPecas(cortadasMapa, avisoTrunc(cortadasMapa));
      }

      panel.setStatus("Montando o mapa mental a partir das peças marcadas…", true);

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
                //
                // Sai de `dl.ok`, NUNCA de `selectedIds` — ver a nota igual no
                // caminho da minuta: anunciar uma peça que não baixou faz o
                // modelo citar um id que ele nunca viu.
                text:
                  instrucao +
                  SUFIXO_MAPA +
                  " Peças anexadas, use exatamente estes ids: " +
                  dl.ok.map((id) => metaDe(id).titulo).join("; ") +
                  "." +
                  // O mapa tem eixos de PRAZOS e de situação atual, que sem as
                  // datas dos atos saem vazios ou adivinhados.
                  datasDasPecas(dl.ok) +
                  linhaDoTempoProcessual(),
              },
            ],
          },
        ],
        null
      );

      // Idem minuta: sem `opts` o mapa saía sem as tools de busca mesmo com o
      // toggle Jurisprudência aceso, e nada na tela dizia isso. E a bolha do
      // assistente nasce só depois do pré-voo, para um turno barrado não
      // deixar bolha vazia na conversa.
      const optsMapa = optsDoTurno();
      await estimarContexto(messages, optsMapa);
      assistantEl = panel.addMessage("assistant", "");

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
      }, optsMapa);
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
      if (e && e.ctxCheio) {
        ultimaChaveEst = "";
        panel.setAlerta(ALERTA_CTX_CHEIO);
      }
      if (assistantEl && !acc) panel.removeMessage(assistantEl);
    } finally {
      busy = false;
      panel.lockInput(false);
      // Mesma razão da minuta: o card do mapa é parte do registro da conversa,
      // e o download das peças que ele acabou de fazer também.
      salvarCasoAgora();
    }
  }

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

  // ---------------------------------------------------------------------------
  // MEMÓRIA DE CASO — arranque.
  //
  // Roda no FIM de `iniciar()`, e a posição é a decisão: acima disso o arquivo
  // ainda está registrando callbacks e declarando estado, e a hidratação toca
  // exatamente as variáveis que a zona morta temporal pune (ver o comentário
  // longo lá em cima). Aqui tudo já existe.
  //
  // Sem `await`: nada do painel depende dela para funcionar, e um processo cujo
  // banco esteja lento não pode segurar a montagem da lista de peças.
  // ---------------------------------------------------------------------------
  async function iniciarMemoria() {
    if (!memoriaDisponivel) return;
    casoChave = PJE.chaveDoCaso();
    if (!casoChave) return; // página sem idProcesso: memória desligada nesta aba
    try {
      // ESPERAR os caps é obrigatório, e a razão não é óbvia: `fileIdValido`
      // compara `d.fileProvider` com o provedor ATUAL, e sem `modelCaps` esse
      // provedor cai no default "anthropic". Hidratar antes do caps chegar
      // descartaria em silêncio todo fileId do Gemini — que é o provedor
      // PADRÃO da extensão. O recurso pareceria simplesmente não funcionar.
      await garantirCaps();
      const { caso, desligado } = await CASO.ler(casoChave);
      // O usuário desligou a memória nas opções. Não basta deixar de hidratar:
      // sem `memoriaMorta`, cada clique na lista custaria uma ida ao worker só
      // para ser recusada lá.
      // Uma linha de estado SEMPRE, mesmo quando não há nada a retomar: é por
      // ela que se descobre, sem adivinhação, se a memória está ligada, qual
      // processo ela identificou e o que havia gravado. Sem isso o único
      // sintoma de qualquer falha é "não mudou nada na tela".
      console.log(
        "[PJe IA] memória: " + casoChave +
          (desligado
            ? " — DESLIGADA nas opções"
            : !caso
              ? " — nada gravado ainda (esta é a 1ª sessão neste processo)"
              : " — " + (caso.pecas || []).length + " peça(s), " +
                (caso.conversas || []).length + " conversa(s) gravadas")
      );
      if (desligado) memoriaMorta = true;
      else if (caso) {
        hidratarPecas(caso.pecas);
        hidratarGrid(caso.grid);
        retomarConversa(caso);
        conversasDoCaso = caso.conversas || [];
        panel.setConversas(conversasDoCaso, convAtual);
      }
      // A trava só cai DEPOIS da leitura: até aqui, qualquer gravação
      // disparada pelo boot escreveria por cima da memória que ainda não foi
      // lida. É o bug nº 1 desta rodada, e a ordem destas duas linhas é a
      // correção inteira.
      casoCarregado = true;
      agendarSalvar();
    } catch (e) {
      console.log("[PJe IA] memória: INDISPONÍVEL —", e && e.message);
      casoCarregado = true; // falha de leitura não impede a extensão de gravar
    }
  }

  // Repõe o estado da CONVERSA e o desenha de volta na tela.
  //
  // O provedor é a primeira coisa conferida: um histórico da Anthropic não roda
  // no Gemini (raciocínio assinado) e vice-versa. Se o usuário trocou de modelo
  // desde a última sessão, retomar a conversa entregaria um histórico que o
  // envio bloquearia de todo jeito, com um alerta que ele não pediu logo ao
  // abrir os autos. Melhor começar limpo: as PEÇAS (que já foram hidratadas e
  // são o caro) continuam valendo.
  // Troca a conversa aberta. É o mesmo caminho da retomada do boot, e por isso
  // reusa `aplicarConversa`: carregar da lista e carregar do disco no arranque
  // são a mesma operação vista de dois lugares.
  async function trocarConversa(convId) {
    if (busy || !casoChave || convId === convAtual) return;
    // O que está na tela precisa ir ao disco ANTES de sair de cena — trocar de
    // conversa não pode custar o último turno da anterior.
    await salvarCasoAgora();
    const conv = await CASO.lerConversa(casoChave, convId);
    if (!conv) {
      panel.setStatus("Essa conversa não está mais guardada.");
      return;
    }
    panel.clearMessages();
    zerarEstadoDaConversa();
    // A identidade da conversa só é assumida se ela REALMENTE abriu. Assumi-la
    // antes era destrutivo: quando `aplicarConversa` recusa (conversa de outro
    // provedor), a tela fica vazia mas `convAtual` continua apontando para o
    // registro cheio — e a primeira gravação seguinte escreveria o vazio por
    // cima dele. O usuário perderia a conversa por ter clicado nela.
    if (!aplicarConversa(conv)) {
      convAtual = null;
      convVersao = 0;
      panel.setStatus(
        "Essa conversa foi feita com outro provedor de IA (Claude, Gemini ou OpenAI) e não " +
          "pode ser reaberta neste modelo — o raciocínio vem assinado pelo provedor. Volte ao " +
          "modelo anterior nas opções para lê-la."
      );
      atualizarListaConversas();
      return;
    }
    convAtual = convId;
    convVersao = conv.atualizadoEm || 0;
    // Grava o ponteiro: é esta conversa que a próxima sessão retoma.
    CASO.salvar(casoChave, { convAtual: convId });
    atualizarListaConversas();
  }

  // Zera só o que pertence a UMA conversa. As peças (`docsCache`) ficam — elas
  // são do processo, custaram download e servem a todas as conversas dele.
  function zerarEstadoDaConversa() {
    conversation = [];
    pecasNaConversa.clear();
    // Anexos são da CONVERSA, não do processo: "Nova conversa" os solta (ao
    // contrário das peças, que servem a todas as conversas do processo).
    anexos.clear();
    anexosPendentes.length = 0;
    custoConversaUsd = 0;
    conversaProvider = null;
    buscaNaConversa = false;
    ultimoTotalExato = 0;
    ultimaChaveEst = "";
    alertaTrocaLigado = false;
    panel.setCusto(null);
    panel.setContexto(null);
    panel.setAlerta(null);
    panel.setPecasEnviadas([]);
    if (panel.setAnexos) panel.setAnexos([]);
    // O selo da linha do tempo NÃO é limpo aqui, e isto é a correção de uma
    // decisão que durou uma versão. Na v0.45.3 ele foi zerado junto com o
    // medidor e o custo, porque descrevia "o último turno". Desde que passou a
    // nascer no BOOT (v0.46.0), ele descreve o PROCESSO — quantos movimentos
    // existem, de que fonte, e a lista que dá para ler —, e isso continua
    // verdadeiro depois de "Nova conversa": o próximo turno manda os mesmos
    // movimentos. Apagá-lo seria apagar uma verdade e devolver o selo ao estado
    // invisível que o usuário não conseguiu achar. As PEÇAS seguem a mesma
    // lógica e pelo mesmo motivo.
  }

  panel.onTrocarConversa((convId) => {
    trocarConversa(convId).catch((e) =>
      panel.setStatus("Não foi possível abrir a conversa: " + (e && e.message))
    );
  });

  panel.onApagarConversa(async (convId) => {
    if (!casoChave) return;
    try {
      await CASO.apagarConversa(casoChave, convId);
      // Apagou a que está na tela: o chat continua aberto (o usuário não pediu
      // para perder o que está fazendo), mas deixa de ter registro no disco —
      // a próxima gravação cria uma conversa nova.
      if (convId === convAtual) {
        convAtual = null;
        convVersao = 0;
      }
      atualizarListaConversas();
    } catch (e) {
      panel.setStatus("Não foi possível excluir a conversa: " + (e && e.message));
    }
  });

  // Repõe a lista de conversas no painel a partir do que está no banco.
  async function atualizarListaConversas() {
    if (!memoriaDisponivel || !casoChave || memoriaMorta) return;
    try {
      const { caso } = await CASO.ler(casoChave);
      conversasDoCaso = (caso && caso.conversas) || [];
      panel.setConversas(conversasDoCaso, convAtual);
    } catch {
      /* a lista é comodidade: falha nela não pode atrapalhar o trabalho */
    }
  }

  function retomarConversa(caso) {
    const conv = caso.conversa;
    if (!conv) return;
    // Conversa SEM `conversation` é legítima e precisa voltar: uma sessão só de
    // minuta e mapa mental não tem histórico de API nenhum (esses turnos são
    // requests isolados), mas tem registro na tela — e era justamente ela que
    // se perdia. O critério é o mesmo da gravação: o que o usuário vê.
    const temHistorico = Array.isArray(conv.conversation) && conv.conversation.length;
    const temTela = Array.isArray(conv.transcript) && conv.transcript.length;
    if (!temHistorico && !temTela) return;
    // A identidade só é assumida se a conversa abriu de fato — ver o comentário
    // em `trocarConversa`: apontar para uma conversa que não foi aplicada faz a
    // próxima gravação apagá-la.
    if (!aplicarConversa(conv)) return;
    convAtual = conv.convId;
    convVersao = conv.atualizadoEm || 0;
  }

  // Põe uma conversa (do disco) no estado vivo e na tela. Devolve `false`
  // quando RECUSA abrir — e o chamador precisa desse retorno para não assumir a
  // identidade de uma conversa que não abriu (ver `trocarConversa`).
  function aplicarConversa(caso) {
    const provAtual = (modelCaps && modelCaps.provider) || "anthropic";
    if (caso.conversaProvider && caso.conversaProvider !== provAtual) {
      console.log(
        "[PJe IA] memória de caso: conversa anterior era do provedor " +
          caso.conversaProvider + " e o atual é " + provAtual + " — só as peças foram retomadas"
      );
      return false;
    }
    // `|| []` obrigatório: uma conversa só de minuta/mapa não tem histórico de
    // API, e `conversation = undefined` derrubaria o próximo `.length` — que é
    // lido em quase todo caminho do envio.
    conversation = Array.isArray(caso.conversation) ? caso.conversation : [];
    // Anexos do input são de SESSÃO: seus bytes não vão ao disco (o snapshot já
    // os salva como stub sem bytes — ver `conversaParaDisco`), então numa
    // conversa retomada os blocos deles apontariam para uploads que não voltam.
    // Tira-os do histórico aqui — senão o stub/`file_id` morto sujaria o request
    // — e avisa, para o usuário saber que pode reanexá-los. Peças do PJe
    // continuam intactas: elas se re-baixam e `revalidarPecasDoHistorico` cuida
    // dos uploads vencidos. (`ehBlocoAnexo` é o mesmo predicado do snapshot.)
    let anexosRetomados = 0;
    for (const turno of conversation) {
      if (!Array.isArray(turno.content)) continue;
      // só reescreve o content quando há mesmo um bloco de anexo — uma conversa
      // normal (o caso comum) não é tocada.
      if (!turno.content.some(ehBlocoAnexo)) continue;
      const antes = turno.content.length;
      turno.content = turno.content.filter((b) => !ehBlocoAnexo(b));
      anexosRetomados += antes - turno.content.length;
    }
    pecasNaConversa = new Set(caso.pecasNaConversa || []);
    custoConversaUsd = caso.custoConversaUsd || 0;
    conversaProvider = caso.conversaProvider || null;
    buscaNaConversa = !!caso.buscaNaConversa;
    ultimoTotalExato = caso.ultimoTotalExato || 0;

    const n = panel.restaurarConversa(caso.transcript || []);
    panel.setPecasEnviadas([...pecasNaConversa]);
    if (caso.selecao && caso.selecao.length) panel.restaurarSelecao(caso.selecao);
    panel.mostrarRetomada({
      quando: dataAmigavel(caso.atualizadoEm),
      nMsgs: n,
      onEsquecer: esquecerEsteProcesso,
    });
    if (custoConversaUsd > 0) {
      // Só o acumulado da conversa: não houve turno nesta sessão, e mostrar um
      // "nesta resposta" seria afirmar um custo que não aconteceu agora.
      panel.setCusto({ conversaUsd: custoConversaUsd });
    }
    if (anexosRetomados) {
      panel.setStatus(
        "Os arquivos anexados nesta conversa não são guardados entre sessões — " +
          "anexe-os de novo (📎) se precisar retomá-los."
      );
    }
    // ABRIU. Sem este `true` a conversa aparece na tela mas o chamador não
    // assume a identidade dela — e a gravação seguinte cria uma DUPLICATA em
    // vez de continuar a conversa retomada (pego pelo teste de retomada).
    return true;
  }

  // "3 de agosto" / "ontem" / "hoje". O usuário pensa a distância em dias, não
  // em data absoluta — e a data completa não cabe na faixa no painel estreito.
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];
  function dataAmigavel(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const hoje = new Date();
    const dias = Math.floor((hoje.setHours(0,0,0,0) - new Date(ts).setHours(0,0,0,0)) / 86400000);
    if (dias <= 0) return "hoje";
    if (dias === 1) return "ontem";
    if (dias < 7) return dias + " dias atrás";
    return d.getDate() + " de " + MESES[d.getMonth()];
  }

  // Apaga a memória DESTE processo. Não mexe na conversa em andamento nem no
  // docsCache: o usuário pediu para não guardar mais, não para perder o que
  // está fazendo agora. `memoriaMorta` impede que o próximo `agendarSalvar`
  // regrave tudo em seguida — sem isso o botão pareceria não funcionar.
  async function esquecerEsteProcesso() {
    if (!memoriaDisponivel || !casoChave) return;
    clearTimeout(salvarTimer);
    memoriaMorta = true;
    pecasSujas.clear();
    try {
      await CASO.esquecer(casoChave);
      // A segunda frase não é enfeite: `memoriaMorta` desliga a gravação até o
      // fim desta sessão, de propósito (senão a conversa em andamento seria
      // regravada segundos depois e o botão pareceria não ter funcionado). Sem
      // dizer isso, o usuário continuaria trabalhando achando que está sendo
      // guardado — e não estaria.
      panel.setStatus(
        "A memória deste processo foi apagada deste computador. Nada será guardado " +
          "até você recarregar a página."
      );
    } catch (e) {
      panel.setStatus("Não foi possível apagar a memória: " + (e && e.message));
    }
  }

  // Repõe no docsCache o que o banco guardou. As entradas voltam PARCIAIS —
  // sem `b64` — e é a marca `semBytes` que avisa os predicados disso. Toda a
  // economia do recurso mora nesta função: uma peça de texto volta completa, e
  // uma peça PDF com fileId vivo volta pronta para o request sem nenhum byte
  // ter atravessado a rede.
  function hidratarPecas(pecas) {
    if (!Array.isArray(pecas)) return;
    let comFile = 0;
    let texto = 0;
    for (const p of pecas) {
      if (!p || !p.id) continue;
      // Nunca sobrescrever o que esta sessão já baixou: o disco é o retrato
      // antigo, e o cache vivo tem os bytes.
      if (docsCache.has(p.id)) continue;
      const d = { kind: p.kind, fmt: p.fmt, size: p.size, semBytes: true };
      if (p.kind === "pdf") d.pages = p.pages;
      if (p.kind === "img") {
        d.mime = p.mime;
        d.w = p.w;
        d.h = p.h;
      }
      if (p.text) d.text = p.text;
      if (p.fileId) {
        d.fileId = p.fileId;
        d.fileProvider = p.fileProvider || "anthropic";
        if (p.fileExp) d.fileExp = p.fileExp;
        if (p.chaveHash) d.chaveHash = p.chaveHash;
      }
      // Entrada sem NADA de aproveitável (peça binária cujo upload venceu e
      // cujos bytes não guardamos) fica de fora: no cache ela só serviria para
      // fazer `precisaBaixar` responder o mesmo que responderia sem ela, e
      // atrapalharia o gauge, que conta `docsCache.has` como "medida".
      if (!d.text && !fileIdValido(d)) continue;
      docsCache.set(p.id, d);
      if (d.text) texto++;
      else comFile++;
    }
    if (texto + comFile) {
      console.log(
        "[PJe IA] memória: " + (texto + comFile) + " peça(s) retomadas do disco (" +
          texto + " de texto, " + comFile + " por referência de upload) — sem novo download"
      );
    }
  }

  // Grava a lista oficial no disco. Chamada UMA vez por leitura da grid — nunca
  // pelo snapshot recorrente (ver `snapshotCaso`): são ~25 KB num processo de
  // 138 peças, e o debounce de gravação dispara a cada peça que baixa.
  //
  // É o que faz o ⟳ passar a valer por PROCESSO em vez de por sessão. Como o
  // banco mescla o patch, gravar só este campo não toca em mais nada.
  function gravarGrid() {
    if (!memoriaDisponivel || !casoChave || !casoCarregado || memoriaMorta) return;
    if (!gridInfo || !docsDaGrid || !docsDaGrid.length) return;
    CASO.salvar(casoChave, {
      grid: {
        docs: docsDaGrid,
        paginas: gridInfo.paginas,
        paginasLidas: gridInfo.paginasLidas,
        incompleto: !!gridInfo.incompleto,
        lidaEm: gridInfo.lidaEm || Date.now(),
        // A PROCEDÊNCIA vai junto, senão a lista volta do disco sem ela e o
        // `.zip` gerado na sessão seguinte afirmaria "lida da tela Documentos,
        // em 1 de 1 páginas" sobre o que veio da API numa resposta só —
        // descrevendo um mecanismo que não foi usado, no arquivo em que a
        // procedência é justamente o que precisa ser exato. Registro anterior
        // gravado sem o campo continua caindo nos ramos antigos.
        fonte: gridInfo.fonte || "grid",
      },
    });
  }

  // Repõe a LISTA OFICIAL (grid) do disco — irmã de `hidratarPecas`.
  //
  // Isto é o que faz o ⟳ passar a valer por PROCESSO em vez de por sessão: a
  // leitura da grid custa um POST de página inteira por página na sessão do PJe,
  // e é esse volume que expira a view da aba em processo grande. Reler o mesmo
  // processo a cada abertura era pagar o risco de novo sem ganhar nada.
  //
  // O ⟳ continua existindo (o processo anda), mas agora é ATUALIZAÇÃO, e a dica
  // diz de quando é a lista — leitura antiga apresentada como atual seria pior
  // que não ter cache.
  function hidratarGrid(grid) {
    if (!grid || !Array.isArray(grid.docs) || !grid.docs.length) return;
    docsDaGrid = grid.docs;
    gridInfo = grid;
    atualizarListaPecas(); // o tipo oficial já entra na 1ª pintura da lista
    const quando = grid.lidaEm ? new Date(grid.lidaEm).toLocaleDateString("pt-BR") : null;
    panel.setTimelineTip({
      texto:
        grid.docs.length + " documento(s) da lista oficial" +
        (quando ? ", lida em " + quando : "") +
        (grid.incompleto
          ? " — leitura PARCIAL (" + grid.paginasLidas + " de " + grid.paginas + " páginas)."
          : ".") +
        " Clique em ⟳ para atualizar.",
    });
    console.log(
      "[PJe IA] memória: lista oficial retomada do disco — " + grid.docs.length +
        " documento(s), sem nenhuma requisição ao PJe"
    );
  }
  iniciarMemoria();

  // Rede de segurança: o usuário troca de aba ou fecha a janela sem ter mexido
  // em nada desde o último debounce. É best-effort de propósito — em `pagehide`
  // o sendMessage pode não chegar, e por isso os `finally` dos turnos continuam
  // sendo o caminho principal, não este.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") salvarCasoAgora();
  });

  // SENTINELA da morte da view (DIAG) — a linha mais importante do diagnóstico.
  //
  // Quando a view JSF expira, o PJe NAVEGA a aba para `error.seam`, e a navegação
  // destrói este contexto: nenhum log posto depois sobrevive. Este handler roda
  // no documento VELHO, no último instante em que ele existe, e é o único
  // registro possível de QUAL gesto precedeu a queda.
  //
  // Só aparece no console com "Preserve log" ligado no DevTools — sem isso a
  // navegação limpa tudo e a evidência some junto.
  window.addEventListener("pagehide", () => {
    const g = PJE.gestoJsf && PJE.gestoJsf();
    if (!g) return; // saída normal, sem nenhum gesto nosso no JSF: nada a dizer
    PJE.dlog(
      "SENTINELA: a página do PJe está saindo — último gesto JSF: " +
        g.tipo + " " + g.id + " há " + g.haMs + " ms"
    );
  });

  // O SELO DA LINHA DO TEMPO NASCE NO BOOT, não na primeira resposta.
  //
  // Relato do dono do projeto, que atualizou a extensão e não achou o recurso:
  // *"onde é que fica essas informações das datas que eu não estou vendo?"*. Ele
  // estava certo, e o defeito era de projeto: o selo só era pintado DENTRO do
  // turno, e quem quer conferir se a extensão viu as datas abre o painel e
  // OLHA — não pergunta primeiro. É a segunda vez que um recurso entregue fica
  // invisível por depender de uma ação (a primeira foi a caixa de apoio, e a
  // lição registrada foi a mesma).
  //
  // Deferido e best-effort. A rota REST cabe no boot porque custa ~77 ms e ZERO
  // tela JSF — não passa pelo Faces Servlet (ver docs/pje-api-rest.md) —, e se
  // falhar `linhaDoTempoProcessual` cai sozinha para o DOM, que é de graça.
  //
  // Chama-se a função INTEIRA e descarta-se o texto DE PROPÓSITO: é o mesmo
  // caminho que monta o bloco do request, então o selo não tem como divergir do
  // que o turno vai mandar. Um atalho que só contasse os movimentos seria uma
  // segunda contagem para divergir da primeira.
  //
  // 600 ms: depois do assentamento do boot e ANTES de o usuário chegar ao
  // painel. Pintar tarde arriscaria mexer na altura do rodapé com o dedo dele já
  // sobre um botão — é a armadilha da "faixa que muda de altura" documentada no
  // CLAUDE.md, e aqui ela se evita pela ordem, não por sorte.
  //
  // TDZ: isto roda no FIM de `iniciar()`, depois de todas as declarações. Chamar
  // `linhaDoTempoProcessual()` de dentro do `refresh()` (que roda ~800 linhas
  // antes de `movsOficiais` existir) lançaria "Cannot access before
  // initialization" e levaria metade do painel junto, em silêncio.
  setTimeout(() => {
    (async () => {
      try {
        await garantirMovimentacoes();
        linhaDoTempoProcessual();
      } catch (e) {
        console.warn("[PJe IA] linha do tempo no boot:", e);
      }
    })();
  }, 600);

  } // fim de iniciar()

  // Bootstrap: monta o painel só em telas de autos do PJe. Em apps de página
  // única (frontend novo do PJe) a timeline pode surgir bem depois do load —
  // o observer fica atento até ela aparecer (custo desprezível: um
  // querySelector por lote de mutações).
  // DIAG — esta página É a tela de erro do PJe? É o único sinal que SOBREVIVE à
  // navegação: o contexto anterior morreu com ela, e aqui, no documento novo,
  // ainda dá para dizer que a aba acabou de cair. Roda antes de `iniciar()`
  // porque a tela de erro não tem timeline e o painel nunca seria montado.
  if (PJE.ehTelaDeErro()) {
    PJE.dlog(
      "SENTINELA: esta página é a tela de ERRO do PJe (" + location.pathname +
        location.search + ") — a view da aba anterior expirou. A sessão segue " +
        "válida: reabrir o processo resolve."
    );
  }

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
