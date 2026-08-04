// UI do painel lateral (chat + seletor de documentos), isolada em Shadow DOM.
var PjePanel = (function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // ---------------------------------------------------------------------------
  // Renderizador markdown seguro (escapa primeiro, depois formata).
  // Suporta: títulos, negrito/itálico, código inline, blocos ```, listas,
  // listas numeradas, tabelas, citações (>), linhas --- e links http(s).
  // ---------------------------------------------------------------------------
  function inlineMd(s) {
    let h = s;
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>";
    });
    return h;
  }

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{2,}[\s:|-]*$/.test(line) && line.includes("-");
  }
  function splitRow(line) {
    let l = line.trim();
    if (l.startsWith("|")) l = l.slice(1);
    if (l.endsWith("|")) l = l.slice(0, -1);
    return l.split("|").map((c) => c.trim());
  }

  function renderMd(text, cites) {
    const src = escapeHtml(text);
    const lines = src.split(/\r?\n/);
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // bloco de código cercado
      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; // pula o fecho
        out.push("<pre><code>" + buf.join("\n") + "</code></pre>");
        continue;
      }

      // tabela (linha com | seguida do separador |---|)
      if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(splitRow(lines[i++]));
        }
        let t = "<table><thead><tr>";
        for (const c of head) t += "<th>" + inlineMd(c) + "</th>";
        t += "</tr></thead><tbody>";
        for (const r of rows) {
          t += "<tr>";
          for (let k = 0; k < head.length; k++) t += "<td>" + inlineMd(r[k] || "") + "</td>";
          t += "</tr>";
        }
        t += "</tbody></table>";
        out.push(t);
        continue;
      }

      // título
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const lvl = Math.min(h[1].length + 2, 6); // #→h3… (mantém hierarquia visual do chat)
        out.push("<h" + lvl + ">" + inlineMd(h[2]) + "</h" + lvl + ">");
        i++;
        continue;
      }

      // linha horizontal
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // citação
      if (/^\s*&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*&gt;\s?/, ""));
          i++;
        }
        out.push("<blockquote>" + buf.map(inlineMd).join("<br>") + "</blockquote>");
        continue;
      }

      // lista com marcadores
      if (/^\s*[-*]\s+/.test(line)) {
        let ul = "<ul>";
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          ul += "<li>" + inlineMd(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>";
          i++;
        }
        out.push(ul + "</ul>");
        continue;
      }

      // lista numerada
      if (/^\s*\d+[.)]\s+/.test(line)) {
        let ol = "<ol>";
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          ol += "<li>" + inlineMd(lines[i].replace(/^\s*\d+[.)]\s+/, "")) + "</li>";
          i++;
        }
        out.push(ol + "</ol>");
        continue;
      }

      // linha em branco
      if (line.trim() === "") {
        i++;
        continue;
      }

      // parágrafo (junta linhas consecutivas com <br>)
      const buf = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*&gt;)/.test(lines[i]) &&
        !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
      ) {
        buf.push(lines[i]);
        i++;
      }
      out.push("<p>" + buf.map(inlineMd).join("<br>") + "</p>");
    }

    let html = out.join("");
    // Marcadores de citação: o content script injeta placeholders na área de
    // uso privado do Unicode (U+E000 n U+E001) — eles atravessam o escapeHtml
    // intactos e só aqui, DEPOIS do escape, viram sobrescritos [n].
    html = html.replace(new RegExp("\\uE000(\\d+)\\uE001", "g"), (m, n) => {
      const c = cites && cites[Number(n) - 1];
      return (
        '<sup class="cit"' +
        (c ? ' title="' + escapeHtml(c.label) + '"' : "") +
        ">" + n + "</sup>"
      );
    });
    return html;
  }

  // Ícones SVG (evita depender de glifos unicode que podem faltar na fonte).
  // Cada ação do cabeçalho tem um desenho DISTINTO: baixar (seta na bandeja),
  // nova conversa (balão com +), expandir (seta horizontal dupla), lateral
  // (retângulo com coluna à direita), janela livre (janela com barra de
  // título), tela cheia (setas diagonais para os cantos) e fechar (X).
  const SVG = {
    free:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/><path d="M1.8 5.4h12.4"/></svg>',
    fs:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>',
    expand:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5"/></svg>',
    side:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/><path d="M9.8 2.5v11"/></svg>',
    // ocultar/exibir a lista de peças: o chevron DENTRO do retângulo dá o
    // sentido da ação (← recolhe a coluna, → traz de volta) — sem ele o ícone
    // ficava idêntico ao do modo lateral e ninguém achava o botão
    docshide:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/><path d="M6.2 2.5v11"/><path d="M11.4 5.9L9.3 8l2.1 2.1"/></svg>',
    docsshow:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/><path d="M6.2 2.5v11"/><path d="M9.3 5.9L11.4 8l-2.1 2.1"/></svg>',
    fold:
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5L4 8l4.5 4.5M13 3.5L8.5 8l4.5 4.5"/></svg>',
    ver:
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="4.2"/><path d="M8 1.4v2.6M8 12v2.6M1.4 8h2.6M12 8h2.6"/></svg>',
    // extrair texto: folha com linhas de texto e uma seta saindo — a ação é
    // "tirar o texto de dentro do documento", não "converter o documento"
    extrair:
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 1.8H4.2a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h4"/><path d="M9.2 1.8L12 4.6v3"/><path d="M5.4 5.4h4M5.4 8h4M5.4 10.6h2.4"/><path d="M11 11.4h3.4M12.9 9.9l1.5 1.5-1.5 1.5"/></svg>',
    // marca da peça que JÁ vai como texto: três linhas, discretas
    emTexto:
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/></svg>',
    // voltar ao documento: seta em U para uma folha. Precisa ser um ícone
    // DIFERENTE do de extrair — antes o desfazer reusava o mesmo glifo e só
    // trocava o title, então terminar a extração não mudava nada na tela e o
    // botão parecia estar oferecendo a mesma coisa de novo.
    voltarDoc:
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 2.4h-4a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h5.8a1 1 0 0 0 1-1V4.8z"/><path d="M9.6 2.4v2.4h2.8"/><path d="M9.2 9.4H6.4M7.6 8.1L6.3 9.4l1.3 1.3"/></svg>',
    close:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
    reset:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7.6c0 2.7-2.7 4.9-6 4.9-.8 0-1.6-.1-2.3-.4L2.6 13l1-2.3C2.6 9.8 2 8.8 2 7.6c0-2.7 2.7-4.9 6-4.9s6 2.2 6 4.9z"/><path d="M8 5.7v3.8M6.1 7.6h3.8"/></svg>',
    download:
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7M5 6.7l3 3 3-3M3 13h10"/></svg>',
    copy:
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
    doc:
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5h-5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z"/><path d="M9.5 1.5V5h3"/></svg>',
    x:
      '<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
    check:
      '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5l3.5 3.5 7-8"/></svg>',
    lupa:
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.6 10.6L14 14"/></svg>',
  };

  // Título curto da peça (sem o prefixo numérico do id) para chips e menções.
  function tituloCurto(t) {
    return String(t).replace(/^\d{6,}\s*-\s*/, "");
  }
  // Separa "141516171 - Petição Inicial" em {id, nome} para exibição.
  function partesTitulo(t) {
    const m = String(t).match(/^(\d{6,})\s*-\s*(.+)$/);
    return m ? { id: m[1], nome: m[2] } : { id: "", nome: String(t) };
  }

  // ---------------------------------------------------------------------------
  // Categorias de peças (regex sobre o título sem acentos) para destaque visual.
  // A primeira que casar vence — mantenha as mais específicas primeiro.
  // ---------------------------------------------------------------------------
  const CATEGORIAS = [
    // atos do juízo — o lookbehind tira "cumprimento de sentença" daqui (é
    // fase/petição das partes, não ato decisório); "acordao" ≠ "acordo"
    // (o \b não casa dentro de "acordao", então "acordo" pode ir às petições)
    { cls: "cat-decisao", re: /\b((?<!cumprimento de )sentenca|decisao|despacho|acordao|liminar|tutela|julgamento|impronuncia|pronuncia|homologacao|medida protetiva|transito em julgado)\b/ },
    // atas, audiências e atos orais ("ata notarial" é prova — regra de provas)
    { cls: "cat-audiencia", re: /\b(ata(?!\s+notarial)|audiencia|assentada|depoimento|interrogatorio|oitiva|degravacao)\b/ },
    // peças das partes e do Ministério Público
    { cls: "cat-peticao", re: /\b(peticao|inicial|emenda|contestacao|reconvencao|replica|treplica|recurso|apelacao|embargos|agravo|impugnacao|excecao|alegacoes|manifestacao|defesa|denuncia|queixa|memoriais|razoes|contrarrazoes|cumprimento de sentenca|habeas|cota|promocao|quesitos|rol de testemunhas|acordo)\b/ },
    // provas técnicas e atos de investigação (criminal: IP, APF, exames…)
    { cls: "cat-prova", re: /\b(laudo|pericia|parecer|ata notarial|auto de|flagrante|inquerito|boletim de ocorrencia|exame|corpo de delito|midia|interceptacao|relatorio|estudo social|estudo psicossocial|antecedentes)\b/ },
  ];
  // Classifica pelo texto. Quando a peça vem da tela "Documentos" do PJe ela
  // traz o TIPO OFICIAL ("Despacho de Mero Expediente", "Certidão de
  // Intimação"), que é muito melhor que o título para isto — o título costuma
  // ser o nome do arquivo ("Despachos / 2"), enquanto o tipo é o vocabulário
  // controlado do sistema. Aceita string (título) ou o objeto da peça.
  function categoriaDe(docOuTitulo) {
    const d = docOuTitulo && typeof docOuTitulo === "object" ? docOuTitulo : null;
    const alvos = d ? [d.tipo, d.titulo] : [docOuTitulo];
    for (const alvo of alvos) {
      if (!alvo) continue;
      const t = norm(alvo);
      for (const c of CATEGORIAS) if (c.re.test(t)) return c.cls;
    }
    return "cat-outro";
  }
  // Normaliza para busca sem acentos/caixa (ex.: "peticao" acha "Petição").
  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Aviso da lista possivelmente incompleta. Fora do painel ele é UM ÍCONE ⚠️
  // com este texto no title (o aviso ocupava duas linhas fixas na coluna); o
  // texto só volta a ser visível durante o carregamento, quando vira progresso.
  const TIP_PADRAO_ATTR =
    "O PJe só carrega as peças conforme a linha do tempo é rolada — esta lista " +
    "pode estar incompleta. Clique em “Carregar tudo” para rolar a " +
    "linha do tempo até o fim.";
  const TIP_PADRAO = "⚠️ " + TIP_PADRAO_ATTR;

  // Tooltip do medidor: no painel estreito o texto visível é a forma curta, e
  // a frase completa é acrescentada AQUI pelo setContexto — o dado nunca some.
  const GAUGE_TITLE =
    "Quanto do limite do modelo esta conversa já ocupa (tokens e páginas de " +
    "PDF). Ao encher, desmarque peças (libera espaço na hora) ou clique em ⟲ " +
    "para começar uma nova conversa.";

  // Exemplos do estado vazio: clicar PREENCHE o campo (não envia — sem peça
  // marcada o envio falharia). Ensinam o gesto sem gastar um parágrafo.
  const EXEMPLOS = [
    "Resuma a petição inicial e a contestação",
    "Monte a linha do tempo dos atos do processo",
    "Quais as teses da defesa e as provas que as sustentam?",
  ];

  // Formata um valor em dólares para exibição (vírgula decimal pt-BR).
  function fmtUsd(v) {
    if (v == null || !isFinite(v)) return "?";
    if (v > 0 && v < 0.001) return "US$ 0,001";
    return "US$ " + v.toFixed(v < 0.1 ? 3 : 2).replace(".", ",");
  }
  // Formata contagem de tokens de forma legível ("12,3 mil", "870").
  function fmtMil(n) {
    n = n || 0;
    if (n < 1000) return String(n);
    return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(".", ",") + " mil";
  }

  // Token do popup "/" (prompts salvos): "/" só dispara como PRIMEIRO
  // caractere não-branco da mensagem — diferente do "@", a barra é
  // onipresente no texto jurídico (01/02/2026, art. 5º/CF, "e/ou") e no
  // meio do texto ela nunca é comando. A query não aceita "\n", "@" nem
  // outra "/": um segundo "/" (data/URL colada no início) ou um "@" (o
  // usuário passou a citar peça) fecham o popup sozinhos, por construção.
  function findSlashToken(value, pos) {
    const before = String(value).slice(0, pos);
    const m = before.match(/^\s*\/([^/@\n]*)$/);
    if (!m) return null;
    return { start: before.length - m[1].length - 1, end: pos, query: m[1] };
  }

  // Texto que vai à API quando há prompt salvo ativo: o prompt PRECEDE o
  // que o usuário digitou (linha em branco entre os dois); com o campo
  // vazio, vai o prompt sozinho. Sem prompt, o texto passa intocado.
  function montarTextoEnvio(promptTexto, textoLivre) {
    if (!promptTexto) return textoLivre;
    const livre = String(textoLivre || "").trim();
    return livre ? promptTexto + "\n\n" + livre : promptTexto;
  }

  function mount() {
    const host = document.createElement("div");
    host.id = "pje-ia-host";
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    root.appendChild(styleEl);
    fetch(chrome.runtime.getURL("src/panel.css"))
      .then((r) => r.text())
      .then((css) => (styleEl.textContent = css))
      .catch(() => {});

    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    const wrap = document.createElement("div");
    wrap.className = "wrap pulse";
    wrap.innerHTML = `
      <div class="backdrop"></div>
      <button class="launcher"><span class="sc">⚖️</span> Analisar com IA</button>
      <div class="panel">
        <div class="hd">
          <img class="mark" src="${iconUrl}" alt="">
          <span class="tit-wrap">
            <span class="ttl">Assistente dos Autos</span>
            <span class="cnj" title="Número do processo em análise"></span>
          </span>
          <button class="dl" title="Baixar a conversa em arquivo (.md)" aria-label="Baixar a conversa em arquivo">${SVG.download}</button>
          <button class="reset" title="Nova conversa (zera o chat e o contexto)" aria-label="Nova conversa">${SVG.reset}</button>
          <button class="docsvis" title="Ocultar a lista de peças (mais espaço para o chat)" aria-label="Ocultar ou exibir a lista de peças" aria-pressed="false">${SVG.docshide}</button>
          <button class="expand" title="Painel largo (mostra as peças na lateral)" aria-label="Painel largo">${SVG.expand}</button>
          <button class="side" title="Painel lateral (mantém o processo visível ao lado)" aria-label="Painel lateral">${SVG.side}</button>
          <button class="free" title="Janela livre (arraste pelo título; redimensione pelo canto inferior direito)" aria-label="Janela livre">${SVG.free}</button>
          <button class="fs" title="Tela cheia" aria-label="Tela cheia">${SVG.fs}</button>
          <button class="close" title="Fechar o painel" aria-label="Fechar o painel">${SVG.close}</button>
        </div>
        <div class="content">
          <button type="button" class="docs-rail" title="Exibir a lista de peças" aria-label="Exibir a lista de peças">
            <span class="rail-i">${SVG.docsshow}</span>
            <span class="rail-t">Peças do processo</span>
            <span class="rail-n"></span>
          </button>
          <div class="docs">
            <div class="docs-hd">
              <div class="dh-row">
                <strong>Peças do processo</strong>
                <span class="count"></span>
                <button type="button" class="docs-fold" title="Ocultar a lista de peças (mais espaço para o chat)" aria-label="Ocultar a lista de peças">${SVG.fold}</button>
              </div>
              <div class="docsearch">
                <input type="search" class="doc-q" placeholder="Buscar peça… (ex.: contestação)" aria-label="Buscar peça pelo nome">
                <span class="doc-q-n" hidden></span>
                <span class="sel-opts">
                  <label class="all" title="Marca só as peças destacadas por categoria — decisões, audiências, petições e provas (as coloridas na lista): normalmente as mais relevantes para a análise do processo."><input type="checkbox" class="chk-main"> principais</label>
                  <label class="all" title="Marca todas as peças da lista (respeita a busca ativa)"><input type="checkbox" class="chk-all"> todas</label>
                </span>
              </div>
            </div>
            <div class="legend" aria-hidden="true">
              <span><i class="l-dot cat-decisao"></i>decisões</span>
              <span><i class="l-dot cat-audiencia"></i>audiências</span>
              <span><i class="l-dot cat-peticao"></i>petições</span>
              <span><i class="l-dot cat-prova"></i>provas</span>
            </div>
            <div class="doclist" title="Arraste para marcar várias peças · Shift+clique marca até aqui · botão direito abre “marcar daqui para baixo/cima”"></div>
            <div class="docs-tip">
              <span class="tip-i" role="note" tabindex="0" title="${TIP_PADRAO_ATTR}" aria-label="${TIP_PADRAO_ATTR}">⚠️</span>
              <span class="tip-txt"></span>
              <button type="button" class="tip-load" title="Rola a linha do tempo do processo automaticamente até o fim para carregar TODAS as peças do processo na lista">⟳ Carregar tudo</button>
              <button type="button" class="tip-zip" title="Baixa os arquivos ORIGINAIS das peças (PDF, HTML) num único .zip, numerados na ordem do processo e com um índice de tipo, data e autor da juntada. Não faz extração de texto. Exporta as peças MARCADAS; sem nenhuma marcada, exporta todas as da lista.">⬇ Documentos</button>
              <!-- Pacote de TEXTO: existe só quando há texto extraído. São
                   coisas diferentes — um .zip são os autos, o outro é a leitura
                   deles, e serve para trabalhar fora da extensão. -->
              <button type="button" class="tip-zipt" hidden title="Baixa as peças em TEXTO num .zip: um arquivo por peça e um autos.md com tudo concatenado. Usa o texto JÁ EXTRAÍDO; peças ainda em documento entram como o arquivo original. Exporta as peças MARCADAS; sem nenhuma marcada, todas as da lista.">⬇ Texto</button>
              <!-- Aviso e ação são UM componente, não um parágrafo solto com um
                   botão órfão embaixo. "Carregar lista" e "baixar" são
                   ferramentas da lista; "extrair" responde a uma condição — são
                   classes diferentes e não podem dividir a mesma fila. -->
              <div class="extrai-bar" hidden>
                <span class="eb-ic" aria-hidden="true"></span>
                <span class="eb-t"></span>
                <button type="button" class="eb-go">Extrair</button>
              </div>
            </div>
          </div>
          <div class="main">
            <div class="msgs"></div>
            <div class="ft">
              <div class="mention" hidden>
                <div class="mention-hd">
                  <span>Adicionar peça ao contexto</span>
                  <span class="mention-keys"><kbd>↑↓</kbd> navegar <kbd>↵</kbd> marcar <kbd>esc</kbd> fechar</span>
                </div>
                <div class="mention-q" aria-hidden="true">
                  ${SVG.lupa}<span class="mq-t"></span><span class="mq-caret"></span><span class="mq-n"></span>
                </div>
                <div class="mention-list" role="listbox"></div>
              </div>
              <div class="slash" hidden>
                <div class="slash-hd">
                  <span>Inserir prompt salvo</span>
                  <span class="mention-keys"><kbd>↑↓</kbd> navegar <kbd>↵</kbd> inserir <kbd>esc</kbd> fechar</span>
                </div>
                <div class="mention-q" aria-hidden="true">
                  ${SVG.lupa}<span class="mq-t"></span><span class="mq-caret"></span><span class="mq-n"></span>
                </div>
                <div class="slash-list" role="listbox"></div>
              </div>
              <div class="status" aria-live="polite"></div>
              <div class="alertbar" role="alert" hidden></div>
              <div class="ctxbar" hidden></div>
              <div class="toolbar">
                <div class="tools">
                  <button class="tgl-search" aria-pressed="false" title="Liga/desliga a busca de jurisprudência e legislação em fontes oficiais (STF, STJ, Planalto…). Com a busca ligada, escreva a pergunta e use o botão Enviar normalmente.">🔍 Jurisprudência</button>
                  <button class="btn-minuta" title="Liga o modo minuta: a instrução aparece no campo (edite à vontade) e o botão Enviar vira “Gerar minuta” — a resposta abre num editor de texto, em nova aba, de onde você copia para o PJe, baixa em Word (.docx) ou imprime.">📝 Minutar</button>
                  <button class="btn-mapa" title="Liga o modo mapa mental: a instrução aparece no campo (edite à vontade) e o botão Enviar vira “Gerar mapa” — a resposta abre num mapa mental interativo, em nova aba.">🧠 Mapa mental</button>
                  <button class="btn-plib" title="Seus prompts salvos: crie instruções reutilizáveis (título + texto) e insira-as na conversa digitando “/” no início do campo de mensagem. Sincronizam entre navegadores logados na mesma conta Google.">✦ Prompts</button>
                  <button class="btn-mlib" title="Seus modelos de peças (sentenças, decisões, despachos, ofícios…): cadastre várias por categoria e, ao gerar uma minuta, escolha a categoria para o assistente seguir a estrutura e o estilo dos seus modelos — os fatos continuam saindo só das peças do processo.">📚 Modelos</button>
                </div>
                <div class="metarow">
                  <div class="gauge" hidden title="${GAUGE_TITLE}">
                    <div class="gauge-bar"><div class="gauge-fill"></div></div>
                    <span class="gauge-txt"><span class="g-full"></span><span class="g-short"></span></span>
                  </div>
                  <div class="custo" hidden>
                    <span class="custo-txt"><span class="g-full"></span><span class="g-short"></span></span>
                  </div>
                  <button class="modelo-badge" hidden title="Modelo de IA em uso nesta conversa — clique para trocar nas opções da extensão"></button>
                  <span class="cite-note" hidden tabindex="0" role="note" title="Modelos Gemini: as citações de página aparecem no próprio texto da resposta (ex.: “conforme a Contestação, fl. 12”), sem os marcadores [n] automáticos dos modelos Claude." aria-label="Neste modelo as citações de página aparecem no próprio texto da resposta, sem os marcadores numerados dos modelos Claude.">ⓘ</span>
                </div>
              </div>
              <div class="minutabar" hidden>
                <span class="docxbar-t">📝 <b>Modo minuta ligado</b> — revise a instrução abaixo e clique em <b>Gerar minuta</b>: a resposta abre num editor, em nova aba, pronta para revisar e levar ao PJe.</span>
                <button class="minutabar-x" title="Cancelar a geração da minuta (Esc)">✕</button>
                <label class="minuta-modelo" hidden>
                  <span class="mm-lab">Seguir modelos:</span>
                  <select class="minuta-modelo-sel" title="Escolha uma categoria: o assistente recebe as suas peças-modelo daquela espécie e segue a estrutura e o estilo da mais adequada ao caso — os fatos continuam vindo só das peças do processo."></select>
                </label>
              </div>
              <div class="mapabar" hidden>
                <span class="docxbar-t">🧠 <b>Modo mapa mental ligado</b> — revise a instrução abaixo e clique em <b>Gerar mapa</b>: a resposta vira um mapa mental interativo, que abre em nova aba.</span>
                <button class="mapabar-x" title="Cancelar a geração do mapa mental (Esc)">✕</button>
              </div>
              <div class="promptbar" hidden></div>
              <div class="inrow">
                <textarea class="in" rows="1" placeholder="Pergunte sobre as peças… (@ cita uma peça)"></textarea>
                <button class="send">Enviar</button>
              </div>
              <div class="hint-key"><div class="hk-in"><b>@</b> cita peças &nbsp;·&nbsp; <b>/</b> insere um prompt salvo &nbsp;·&nbsp; <b>Enter</b> envia &nbsp;·&nbsp; <b>Shift+Enter</b> quebra linha</div></div>
            </div>
          </div>
        </div>
        <div class="plib" hidden>
          <div class="plib-card" role="dialog" aria-modal="true" aria-label="Prompts salvos" tabindex="-1">
            <div class="plib-hd">
              <span class="t">✦ Prompts salvos</span>
              <button class="plib-new">✚ Novo</button>
              <button class="plib-close" title="Fechar (Esc)" aria-label="Fechar o gerenciador de prompts">✕</button>
            </div>
            <div class="plib-list"></div>
            <div class="plib-form" hidden>
              <input type="text" class="plib-ft" maxlength="60" placeholder="Título do prompt (ex.: Relatório de audiência)" aria-label="Título do prompt">
              <textarea class="plib-fx" placeholder="Texto do prompt — a instrução completa, enviada no início da mensagem quando você usar este prompt…" aria-label="Texto do prompt"></textarea>
              <div class="plib-cnt"></div>
              <div class="plib-err" role="alert"></div>
              <div class="plib-form-acts">
                <button class="plib-cancel">Cancelar</button>
                <button class="plib-save">Salvar</button>
              </div>
            </div>
          </div>
        </div>
        <div class="mlib plib" hidden>
          <div class="mlib-card plib-card" role="dialog" aria-modal="true" aria-label="Modelos de peças" tabindex="-1">
            <div class="plib-hd">
              <span class="t">📚 Modelos de peças</span>
              <button class="mlib-new plib-new">✚ Novo</button>
              <button class="mlib-close plib-close" title="Fechar (Esc)" aria-label="Fechar o gerenciador de modelos">✕</button>
            </div>
            <div class="mlib-list plib-list"></div>
            <div class="mlib-form plib-form" hidden>
              <input type="text" class="mlib-ft" maxlength="80" placeholder="Título do modelo (ex.: Sentença de improcedência — dano moral)" aria-label="Título do modelo">
              <select class="mlib-fc" aria-label="Categoria do modelo"></select>
              <input type="text" class="mlib-fd" maxlength="120" placeholder="Descrição — opcional (quando usar este modelo)" aria-label="Descrição do modelo">
              <textarea class="mlib-fx" placeholder="Cole o texto da peça-modelo — o assistente imita a ESTRUTURA e o estilo; os fatos vêm sempre das peças do processo, nunca do modelo…" aria-label="Texto do modelo"></textarea>
              <div class="mlib-cnt plib-cnt"></div>
              <div class="mlib-err plib-err" role="alert"></div>
              <div class="plib-form-acts">
                <button class="mlib-cancel plib-cancel">Cancelar</button>
                <button class="mlib-save plib-save">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    root.appendChild(wrap);

    const $ = (s) => wrap.querySelector(s);
    const launcher = $(".launcher");
    const backdrop = $(".backdrop");
    const resetBtn = $(".reset");
    const expandBtn = $(".expand");
    const closeBtn = $(".close");
    const docsBox = $(".docs");
    const doclist = $(".doclist");
    const chkAll = $(".chk-all");
    const chkMain = $(".chk-main");
    const countEl = $(".count");
    const railNEl = $(".rail-n"); // badge da aba vertical (lista recolhida)
    const docQ = $(".doc-q");
    const docQN = $(".doc-q-n");
    const tipBox = $(".docs-tip");
    const tipTxt = $(".tip-txt");
    const extraiBar = $(".extrai-bar");
    const ebTexto = $(".eb-t");
    const ebGo = $(".eb-go");
    $(".eb-ic").innerHTML = SVG.extrair; // mesmo glifo do botão da row
    const tipLoad = $(".tip-load");
    const tipZip = $(".tip-zip");
    const tipZipT = $(".tip-zipt");
    const msgs = $(".msgs");
    const ft = $(".ft");
    const statusEl = $(".status");
    const gaugeEl = $(".gauge");
    const gaugeFill = $(".gauge-fill");
    // Medidor e custo escrevem DUAS versões do mesmo dado: a frase completa
    // (modos largos) e a forma curta (flutuante/lateral, onde a linha de meta
    // é estreita). Quem escolhe é o CSS — nenhuma informação vira só tooltip.
    const gaugeFull = $(".gauge-txt .g-full");
    const gaugeShort = $(".gauge-txt .g-short");
    const custoEl = $(".custo");
    const custoFull = $(".custo-txt .g-full");
    const custoShort = $(".custo-txt .g-short");
    const citeNote = $(".cite-note");
    const modeloBadge = $(".modelo-badge");
    const alertEl = $(".alertbar");
    const ctxbar = $(".ctxbar");
    const mentionEl = $(".mention");
    const mentionList = $(".mention-list");
    const mentionQT = $(".mq-t"); // espelho ao vivo da busca digitada após o @
    const mentionQN = $(".mq-n"); // contador de peças encontradas
    const mentionQC = $(".mq-caret"); // cursor falso (re-sincronizado a cada tecla)
    const inEl = $(".in");
    const sendBtn = $(".send");

    let allDocs = []; // [{id, titulo}] espelho da lista lateral

    // -------------------------------------------------------------------------
    // Estado vazio em camadas (progressive disclosure): três passos + exemplos
    // clicáveis sempre visíveis; o texto explicativo mora num <details> fechado
    // por padrão (estado lembrado); a referência completa (tabela de modelos,
    // preços, fluxo, dicas de cache) vive só no help.html — o painel APONTA
    // para ela em vez de recitá-la, que era a origem da parede de texto.
    // -------------------------------------------------------------------------
    let hintEl = null;
    let guiaAberta = false;
    function showEmptyHint() {
      if (hintEl || msgs.querySelector(".msg")) return;
      hintEl = document.createElement("div");
      hintEl.className = "hint-empty";
      hintEl.innerHTML =
        '<span class="big">Como posso ajudar?</span>' +
        '<div class="passos">' +
        '<div class="passo"><span class="pn">1</span><b>Marque as peças</b>' +
        "<span>na lista ao lado — busca, atalho <b>principais</b> ou <b>@</b> no campo</span></div>" +
        '<div class="passo"><span class="pn">2</span><b>Peça o que precisa</b>' +
        "<span>resumo, linha do tempo, minuta — só o que foi marcado é lido</span></div>" +
        '<div class="passo"><span class="pn">3</span><b>Confira a origem</b>' +
        "<span>cada afirmação vem com a peça, o <i>id</i> e a folha</span></div>" +
        "</div>" +
        '<div class="exemplos">' +
        EXEMPLOS.map(
          (t) =>
            '<button type="button" class="ex" title="Coloca este texto no campo de mensagem para você editar">' +
            escapeHtml(t) +
            "</button>"
        ).join("") +
        "</div>" +
        '<details class="guia"' +
        (guiaAberta ? " open" : "") +
        "><summary>Como funciona, limites e alternativas</summary>" +
        "<p><b>Não é um agente autônomo</b> (como o Claude Code): ele não navega no " +
        "processo sozinho. Você marca as peças, envia a solicitação e a resposta usa " +
        "somente os documentos marcados — dá para marcar e desmarcar entre uma " +
        "pergunta e outra.</p>" +
        "<p><b>A lista pode vir incompleta:</b> o PJe só carrega as peças conforme a " +
        "linha do tempo é rolada. Antes de procurar uma peça antiga, use " +
        "<b>⟳ Carregar tudo</b>, abaixo da lista.</p>" +
        "<p><b>O contexto é limitado:</b> peças, perguntas e respostas precisam caber " +
        "na janela do modelo. O medidor ao lado das ferramentas mostra o quanto já foi " +
        "usado; se encher, desmarque peças (libera espaço na hora) ou comece uma " +
        "conversa nova.</p>" +
        // O gargalo real do produto, e o que mais surpreende quem começa: a
        // espera não é da IA, é do tribunal entregando peça por peça. Fica no
        // guia (fechado por padrão) para não engordar o estado vazio, mas com
        // destaque próprio — é a diferença entre "a extensão é lenta" e "a
        // minha conexão está ruim".
        "<p><b>📶 Sua conexão manda no tempo de espera:</b> o PJe entrega as peças " +
        "<b>uma de cada vez</b> (cerca de 5 s cada). No Wi-Fi instável isso se " +
        "multiplica por dezenas de documentos e a extensão parece travada, quando na " +
        "verdade está esperando o tribunal. <b>Cabo de rede faz muita diferença</b> — " +
        "e marcar só as peças que interessam, mais ainda.</p>" +
        '<p>💡 Para autos muito grandes, conheça o <a href="https://mcp.tecjustica.com/" ' +
        'target="_blank" rel="noopener">TecJustiça MCP</a>, em que o contexto do processo ' +
        "é gerenciado automaticamente pelo código, e a demonstração com o PJe do Ceará em " +
        '<a href="https://pjece.tecjustica.com/" target="_blank" rel="noopener">' +
        "pjece.tecjustica.com</a>.</p>" +
        "</details>" +
        '<button type="button" class="hint-help">Guia completo, modelos e preços →</button>';
      // exemplos: PREENCHEM o campo (não enviam — sem peça marcada o envio
      // falharia e a primeira experiência seria um erro)
      hintEl.querySelectorAll(".ex").forEach((b) => {
        b.addEventListener("click", () => {
          if (inEl.disabled) return; // resposta em curso: o campo está travado
          inEl.value = b.textContent; // as aspas são ::before/::after, não entram
          autoresize();
          inEl.focus();
        });
      });
      const det = hintEl.querySelector(".guia");
      det.addEventListener("toggle", () => {
        guiaAberta = det.open;
        try {
          chrome.storage.local.set({ guiaAberta: det.open });
        } catch {
          /* contexto da extensão invalidado — segue sem persistir */
        }
      });
      hintEl.querySelector(".hint-help").addEventListener("click", () => {
        try {
          window.open(chrome.runtime.getURL("src/help.html"), "_blank", "noopener");
        } catch {
          /* fora da extensão (harness de teste) */
        }
      });
      msgs.appendChild(hintEl);
      ft.classList.add("novato"); // atalhos de teclado visíveis para quem chega agora
    }
    function clearEmptyHint() {
      ft.classList.remove("novato");
      if (hintEl) {
        hintEl.remove();
        hintEl = null;
      }
    }
    showEmptyHint();
    // Restauração do <details> DEPOIS de showEmptyHint existir e rodar (o stub
    // de teste chama o callback de forma síncrona — mesma armadilha documentada
    // do docsOcultas): se o usuário deixou a guia aberta, ela reabre.
    try {
      chrome.storage.local.get(["guiaAberta"], (v) => {
        if (!v || !v.guiaAberta) return;
        guiaAberta = true;
        const det = hintEl && hintEl.querySelector(".guia");
        if (det) det.open = true;
      });
    } catch {
      /* sem storage (harness de teste): guia fechada */
    }

    function open() {
      wrap.classList.add("open");
      wrap.classList.remove("pulse");
    }
    launcher.addEventListener("click", open);

    // -------------------------------------------------------------------------
    // Modos de layout (classes no .wrap): flutuante (nenhuma), expandido
    // (modal central com backdrop), tela cheia (expanded+full) e lateral
    // (sidebar à direita com a página visível — sem backdrop). "lateral" e
    // "expanded" são mutuamente exclusivas. A preferência persiste em
    // chrome.storage.local (tela cheia é transitória: persiste "expandido").
    // -------------------------------------------------------------------------
    function modoAtual() {
      if (wrap.classList.contains("livre")) return "livre";
      if (wrap.classList.contains("full")) return "cheia";
      if (wrap.classList.contains("expanded")) return "expandido";
      if (wrap.classList.contains("lateral")) return "lateral";
      return "flutuante";
    }
    function aplicarModo(modo) {
      hidePreview(); // a posição do popover fica inválida ao trocar o layout
      const eraLivre = wrap.classList.contains("livre");
      // Captura a geometria ANTES de tirar a classe (sem .livre o .panel volta
      // a position:absolute e o rect muda) — cobre o resize pela alça nativa
      // mesmo se o ResizeObserver não tiver disparado (janela ocluída suprime
      // callbacks do pipeline de render, mesma razão do setTimeout do
      // "ver na timeline").
      if (eraLivre && modo !== "livre") salvarGeoLivre();
      wrap.classList.remove("expanded", "full", "lateral", "livre", "livre-wide");
      if (modo === "expandido") wrap.classList.add("expanded");
      else if (modo === "cheia") wrap.classList.add("expanded", "full");
      else if (modo === "lateral") wrap.classList.add("lateral");
      else if (modo === "livre") {
        wrap.classList.add("livre");
        aplicarGeoLivre();
      }
      // INVARIANTE: a geometria do modo livre vive em inline styles
      // (left/top/width/height), e inline vence classe — sem esta limpeza os
      // valores vazariam e deformariam o expandido/lateral/flutuante.
      if (eraLivre && modo !== "livre") limparGeoLivre();
      try {
        chrome.storage.local.set({ layoutModo: modo === "cheia" ? "expandido" : modo });
      } catch {
        /* contexto da extensão invalidado (recarga) — segue sem persistir */
      }
    }

    // ---- Modo livre: janela solta — arrasta pelo cabeçalho e redimensiona
    // pela alça nativa (resize:both) do canto inferior direito. Definido ANTES
    // do restore do layout: o stub de teste chama o callback do storage de
    // forma SÍNCRONA (mesma armadilha documentada do docsOcultas).
    const panelEl = $(".panel");
    const hdEl = $(".hd");
    let geoLivre = null; // {x, y, w, h} — persistido em chrome.storage.local
    function clampGeoLivre(g) {
      const vw = window.innerWidth,
        vh = window.innerHeight;
      const w = Math.min(Math.max(g.w, 340), Math.floor(vw * 0.96));
      const h = Math.min(Math.max(g.h, 380), Math.floor(vh * 0.96));
      // o cabeçalho precisa continuar alcançável para re-arrastar (uma tira
      // de 120px do painel sempre fica dentro da viewport)
      const x = Math.min(Math.max(g.x, 120 - w), vw - 120);
      const y = Math.min(Math.max(g.y, 0), vh - 60);
      return { x, y, w, h };
    }
    // Acima deste limiar de LARGURA DO PAINEL a lista de peças vira coluna
    // lateral (como no expandido). Media query não serve: ela mede a viewport,
    // não o painel — a classe .livre-wide é alternada aqui e no ResizeObserver.
    const LIVRE_LARGO_PX = 740;
    function atualizarLivreLargo() {
      const on =
        wrap.classList.contains("livre") && panelEl.offsetWidth >= LIVRE_LARGO_PX;
      if (on !== wrap.classList.contains("livre-wide")) hidePreview(); // âncora muda de lugar
      wrap.classList.toggle("livre-wide", on);
    }
    function aplicarGeoLivre() {
      const vw = window.innerWidth,
        vh = window.innerHeight;
      const padrao = {
        w: Math.min(760, Math.floor(vw * 0.92)),
        h: Math.min(820, Math.floor(vh * 0.85)),
      };
      padrao.x = Math.floor((vw - padrao.w) / 2);
      padrao.y = Math.floor((vh - padrao.h) / 2);
      const g = clampGeoLivre(geoLivre || padrao);
      panelEl.style.left = g.x + "px";
      panelEl.style.top = g.y + "px";
      panelEl.style.width = g.w + "px";
      panelEl.style.height = g.h + "px";
      atualizarLivreLargo();
    }
    function limparGeoLivre() {
      panelEl.style.left = "";
      panelEl.style.top = "";
      panelEl.style.width = "";
      panelEl.style.height = "";
    }
    let geoTimer = null;
    function salvarGeoLivre() {
      const r = panelEl.getBoundingClientRect();
      geoLivre = {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
      clearTimeout(geoTimer);
      geoTimer = setTimeout(() => {
        try {
          chrome.storage.local.set({ livreGeo: geoLivre });
        } catch {
          /* contexto invalidado — segue sem persistir */
        }
      }, 400);
    }
    // Arrasto pelo cabeçalho — MENOS pelos botões (eles mantêm o clique)
    let arrasto = null;
    hdEl.addEventListener("pointerdown", (e) => {
      if (!wrap.classList.contains("livre")) return;
      if (e.button !== 0 || e.target.closest("button")) return;
      const r = panelEl.getBoundingClientRect();
      arrasto = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try {
        hdEl.setPointerCapture(e.pointerId); // segura o arrasto fora do cabeçalho
      } catch {
        /* pointer sintético/sem id válido: o arrasto ainda funciona sobre o hd */
      }
      hidePreview(); // o popover está ancorado numa row que vai se mover junto
      e.preventDefault(); // sem seleção de texto no meio do arrasto
    });
    hdEl.addEventListener("pointermove", (e) => {
      if (!arrasto) return;
      const g = clampGeoLivre({
        x: e.clientX - arrasto.dx,
        y: e.clientY - arrasto.dy,
        w: panelEl.offsetWidth,
        h: panelEl.offsetHeight,
      });
      panelEl.style.left = g.x + "px";
      panelEl.style.top = g.y + "px";
    });
    const fimArrasto = () => {
      if (!arrasto) return;
      arrasto = null;
      salvarGeoLivre();
    };
    hdEl.addEventListener("pointerup", fimArrasto);
    hdEl.addEventListener("pointercancel", fimArrasto);
    // A alça nativa de resize não emite evento próprio — o observer persiste.
    // Guardas: só no modo livre (ele também dispara em toda troca de layout)
    // e com o painel aberto (fechado, o rect é 0x0 e apagaria a geometria).
    const roLivre = new ResizeObserver(() => {
      atualizarLivreLargo();
      if (
        wrap.classList.contains("livre") &&
        wrap.classList.contains("open") &&
        !arrasto
      )
        salvarGeoLivre();
    });
    roLivre.observe(panelEl);

    // Restaura a preferência de layout (vale a partir do próximo open()).
    try {
      chrome.storage.local.get(["layoutModo", "livreGeo"], (v) => {
        if (v && v.livreGeo) geoLivre = v.livreGeo;
        if (v && v.layoutModo === "lateral") wrap.classList.add("lateral");
        else if (v && v.layoutModo === "expandido") wrap.classList.add("expanded");
        else if (v && v.layoutModo === "livre") {
          wrap.classList.add("livre");
          aplicarGeoLivre();
        }
      });
    } catch {
      /* sem storage (harness de teste): fica no flutuante */
    }

    closeBtn.addEventListener("click", () => {
      hidePreview();
      if (wrap.classList.contains("livre")) salvarGeoLivre(); // antes de tirar a classe
      wrap.classList.remove("open", "expanded", "full", "lateral", "livre", "livre-wide");
      limparGeoLivre();
    });
    expandBtn.addEventListener("click", () =>
      aplicarModo(modoAtual() === "expandido" ? "flutuante" : "expandido")
    );
    // Tela cheia: entrar implica o layout expandido; sair volta ao expandido.
    const fsBtn = $(".fs");
    fsBtn.addEventListener("click", () =>
      aplicarModo(modoAtual() === "cheia" ? "expandido" : "cheia")
    );
    const sideBtn = $(".side");
    sideBtn.addEventListener("click", () =>
      aplicarModo(modoAtual() === "lateral" ? "flutuante" : "lateral")
    );
    const freeBtn = $(".free");
    freeBtn.addEventListener("click", () =>
      aplicarModo(modoAtual() === "livre" ? "flutuante" : "livre")
    );
    backdrop.addEventListener("click", () => aplicarModo("flutuante"));

    // Ocultar/exibir a coluna de peças nos modos expandido/tela cheia (mais
    // espaço para o chat). Só VISUAL: os checkboxes seguem no DOM — seleção,
    // chips, popup @ e envio continuam funcionando com a lista oculta. O
    // botão só aparece nos modos expandidos (CSS) e a preferência persiste.
    const docsVisBtn = $(".docsvis");
    const docsFoldBtn = $(".docs-fold");
    const docsRail = $(".docs-rail");
    function setDocsOcultas(on, persistir) {
      wrap.classList.toggle("docs-collapsed", on);
      docsVisBtn.classList.toggle("on", on);
      docsVisBtn.setAttribute("aria-pressed", String(!!on));
      // o ícone acompanha a ação disponível: chevron ← recolhe, → traz de volta
      docsVisBtn.innerHTML = on ? SVG.docsshow : SVG.docshide;
      docsVisBtn.title = on
        ? "Exibir a lista de peças"
        : "Ocultar a lista de peças (mais espaço para o chat)";
      hidePreview(); // popover ancorado numa row que deixou de existir na tela
      if (persistir !== false) {
        try {
          chrome.storage.local.set({ docsOcultas: !!on });
        } catch {
          /* contexto da extensão invalidado — segue sem persistir */
        }
      }
    }
    docsVisBtn.addEventListener("click", () =>
      setDocsOcultas(!wrap.classList.contains("docs-collapsed"))
    );
    // controles colocados JUNTO da coluna que eles controlam (o botão do
    // header ninguém achava): « no cabeçalho da lista recolhe; a aba
    // vertical que fica no lugar da coluna traz de volta
    docsFoldBtn.addEventListener("click", () => setDocsOcultas(true));
    docsRail.addEventListener("click", () => setDocsOcultas(false));
    try {
      chrome.storage.local.get(["docsOcultas"], (v) => {
        if (v && v.docsOcultas) setDocsOcultas(true, false);
      });
    } catch {
      /* sem storage (harness de teste): lista visível */
    }

    let resetCb = null;
    resetBtn.addEventListener("click", () => {
      if (resetCb) resetCb();
    });

    // Toggle de busca de jurisprudência (estado lido pelo content script no envio)
    const tglSearch = $(".tgl-search");
    let searchOn = false;
    tglSearch.addEventListener("click", () => {
      searchOn = !searchOn;
      tglSearch.setAttribute("aria-pressed", String(searchOn));
      tglSearch.classList.toggle("on", searchOn);
      // feedback imediato: o rótulo e o status dizem o que o toggle faz
      tglSearch.textContent = searchOn ? "🔍 Jurisprudência ligada" : "🔍 Jurisprudência";
      statusEl.textContent = searchOn
        ? "Busca de jurisprudência ligada: as próximas perguntas enviadas poderão consultar STF, STJ, Planalto e outras fontes oficiais."
        : "Busca de jurisprudência desligada.";
    });

    // Geração de MINUTA por modo explícito: o clique no botão liga o modo — a
    // instrução padrão (editável) entra no campo, a faixa .minutabar explica o
    // passo e o botão Enviar vira "📝 Gerar minuta". Enviar/Enter geram; ✕, Esc
    // ou novo clique no botão cancelam. (Não reintroduzir o fluxo de "dois
    // cliques no mesmo botão": todo mundo aperta Enviar.)
    // Como o mapa mental, o turno é um chat comum — sem skill, sem execução de
    // código —, então funciona em QUALQUER modelo, Claude ou Gemini.
    const INSTRUCAO_MINUTA_PADRAO =
      "Elabore a minuta do ato cabível neste momento do processo, com relatório, " +
      "fundamentação e dispositivo, indicando a origem de cada afirmação.";
    const btnMinuta = $(".btn-minuta");
    const minutabar = $(".minutabar");
    let minutaCb = null;
    let minutaMode = false;
    function setMinutaMode(on) {
      minutaMode = on;
      minutabar.hidden = !on;
      btnMinuta.classList.toggle("on", on);
      btnMinuta.textContent = on ? "✕ Cancelar minuta" : "📝 Minutar";
      sendBtn.textContent = on ? "📝 Gerar minuta" : "Enviar";
      sendBtn.classList.toggle("docx", on);
      inEl.placeholder = on
        ? "Instrução da minuta — edite e clique em Gerar minuta…"
        : "Pergunte sobre as peças… (@ cita uma peça)";
      if (!on) statusEl.textContent = "";
      atualizarSeletorMinuta(on); // popula/oculta o seletor de peça-modelo
    }
    btnMinuta.addEventListener("click", () => {
      if (minutaMode) return setMinutaMode(false); // segundo clique = cancelar
      if (!getSelected().length) {
        statusEl.textContent =
          "Para gerar a minuta, primeiro marque as peças que devem embasá-la.";
        return;
      }
      if (mapaMode) setMapaMode(false); // os dois modos são mutuamente exclusivos
      // preserva o que o usuário já digitou; senão, oferece a instrução
      // padrão — SALVO quando há prompt salvo ativo (chip): ele já é a
      // instrução da minuta, injetar a padrão duplicaria comandos
      if (!inEl.value.trim() && !promptAtivo) {
        inEl.value = INSTRUCAO_MINUTA_PADRAO;
        autoresize();
      }
      setMinutaMode(true);
      inEl.focus();
    });
    minutabar
      .querySelector(".minutabar-x")
      .addEventListener("click", () => setMinutaMode(false));

    // Modo MAPA MENTAL — mesmo contrato do modo documento (o Enviar é
    // sequestrado, a faixa explica o passo, ✕/Esc/segundo clique cancelam).
    // Diferença: não depende de skill nem de execução de código, então roda
    // também nos modelos Gemini; a resposta é markdown e vira mapa em
    // src/mapa.html, numa aba própria.
    const INSTRUCAO_MAPA_PADRAO =
      "Mapeie o processo: partes e representantes, síntese dos fatos, pedidos, teses de cada " +
      "parte, provas produzidas, decisões proferidas e situação atual do feito.";
    const btnMapa = $(".btn-mapa");
    const mapabar = $(".mapabar");
    let mapaCb = null;
    let mapaMode = false;
    function setMapaMode(on) {
      mapaMode = on;
      mapabar.hidden = !on;
      btnMapa.classList.toggle("on", on);
      btnMapa.textContent = on ? "✕ Cancelar mapa" : "🧠 Mapa mental";
      sendBtn.textContent = on ? "🧠 Gerar mapa" : "Enviar";
      sendBtn.classList.toggle("docx", on); // mesmo halo azul do modo documento
      inEl.placeholder = on
        ? "Instrução do mapa mental — edite e clique em Gerar mapa…"
        : "Pergunte sobre as peças… (@ cita uma peça)";
      if (!on) statusEl.textContent = "";
    }
    btnMapa.addEventListener("click", () => {
      if (mapaMode) return setMapaMode(false); // segundo clique = cancelar
      if (!getSelected().length) {
        statusEl.textContent =
          "Para gerar o mapa mental, primeiro marque as peças que devem embasá-lo.";
        return;
      }
      if (minutaMode) setMinutaMode(false); // os dois modos são mutuamente exclusivos
      if (!inEl.value.trim() && !promptAtivo) {
        inEl.value = INSTRUCAO_MAPA_PADRAO;
        autoresize();
      }
      setMapaMode(true);
      inEl.focus();
    });
    mapabar
      .querySelector(".mapabar-x")
      .addEventListener("click", () => setMapaMode(false));

    // Selo do modelo ativo: clique abre a configuração da extensão (o
    // callback é o mesmo do CTA "configure sua chave").
    $(".modelo-badge").addEventListener("click", () => configureCb && configureCb());

    // -------------------------------------------------------------------------
    // Transcript da conversa (para exportar .md e copiar por mensagem).
    // Os placeholders de citação viram [n] no texto exportado.
    // -------------------------------------------------------------------------
    const transcript = []; // [{role, text, cites?}]
    const RE_CIT_PLACEHOLDER = new RegExp("\\uE000(\\d+)\\uE001", "g");
    function textoExportavel(t) {
      return String(t || "").replace(RE_CIT_PLACEHOLDER, "[$1]");
    }

    const dlBtn = $(".dl");
    dlBtn.addEventListener("click", () => {
      if (!transcript.length) return;
      const linhas = ["# Conversa — TecJustiça PJe", ""];
      for (const t of transcript) {
        linhas.push(t.role === "user" ? "## Usuário" : "## Assistente");
        linhas.push("");
        linhas.push(t.text || "");
        if (t.cites && t.cites.length) {
          linhas.push("");
          linhas.push("Fontes:");
          t.cites.forEach((c, i) =>
            linhas.push(
              i + 1 + ". " + c.label +
                // o id é o que permite reencontrar a peça na timeline do PJe
                (c.id ? " (id " + c.id + ")" : "") +
                (c.url ? " — " + c.url : "")
            )
          );
        }
        linhas.push("");
      }
      const blob = new Blob([linhas.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "conversa-pje-ia.md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });

    // Estrutura interna da bolha do assistant: raciocínio colapsável + corpo +
    // botão de copiar. Criada sob demanda (a bolha nasce com o indicador de
    // digitação e só ganha estrutura no primeiro delta/thinking).
    function estruturaAssistant(el) {
      if (el.__body) return el;
      el.classList.remove("typing");
      el.innerHTML =
        '<details class="think" hidden><summary>Raciocínio</summary><div class="think-t"></div></details>' +
        '<div class="body"></div>' +
        '<button class="copy" title="Copiar texto da resposta">' + SVG.copy + "</button>";
      el.__think = el.querySelector(".think");
      el.__thinkT = el.querySelector(".think-t");
      el.__body = el.querySelector(".body");
      el.querySelector(".copy").addEventListener("click", () => {
        const entry = el.__entry;
        const txt = textoExportavel(entry && entry.text);
        if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
      });
      return el;
    }

    // auto-resize do textarea
    function autoresize() {
      inEl.style.height = "auto";
      inEl.style.height = Math.min(inEl.scrollHeight, 140) + "px";
    }

    // -------------------------------------------------------------------------
    // Seleção de peças: os checkboxes da lista lateral são a fonte de verdade.
    // Chips da barra de contexto, contador e popup @ são visões sincronizadas.
    // -------------------------------------------------------------------------
    function getSelected() {
      return [...doclist.querySelectorAll('input[type="checkbox"]:checked')].map(
        (c) => c.value
      );
    }
    function getSelectedDocs() {
      const ids = new Set(getSelected());
      return allDocs.filter((d) => ids.has(d.id));
    }
    function setDocChecked(id, on) {
      const c = doclist.querySelector('input[value="' + CSS.escape(id) + '"]');
      if (c) c.checked = on;
    }

    let prevChipIds = new Set(); // anima só chips recém-adicionados
    let selChangeCb = null; // content script re-estima o contexto ao mudar a seleção
    function syncSelection() {
      const sel = getSelectedDocs();
      const total = allDocs.length;

      chkAll.checked = total > 0 && sel.length === total;
      // "principais": peças com categoria destacada (≠ cat-outro) — o estado
      // do checkbox reflete se TODAS elas estão marcadas
      const mainChks = [
        ...doclist.querySelectorAll('.docrow:not(.cat-outro) input[type="checkbox"]'),
      ];
      chkMain.checked = mainChks.length > 0 && mainChks.every((c) => c.checked);
      countEl.textContent = total
        ? sel.length
          ? `${sel.length}/${total} no contexto`
          : `${total} peça` + (total > 1 ? "s" : "")
        : "";
      countEl.classList.toggle("on", sel.length > 0);
      railNEl.textContent = total ? (sel.length ? `${sel.length}/${total}` : `${total}`) : "";

      if (selChangeCb) selChangeCb(sel.map((d) => d.id));

      // chips da barra de contexto
      ctxbar.innerHTML = "";
      if (!sel.length) {
        ctxbar.hidden = true;
        prevChipIds = new Set();
        return;
      }
      ctxbar.hidden = false;
      const lab = document.createElement("span");
      lab.className = "ctxlab";
      lab.textContent = "Peças no contexto (" + sel.length + ")";
      ctxbar.appendChild(lab);
      // bandeja própria para os chips: rolagem interna sem empurrar o rótulo
      const bandeja = document.createElement("div");
      bandeja.className = "chips";
      ctxbar.appendChild(bandeja);
      for (const d of sel) {
        const chip = document.createElement("span");
        chip.className =
          "chip " + categoriaDe(d) + (prevChipIds.has(d.id) ? "" : " new");
        chip.innerHTML =
          SVG.doc +
          '<span class="chip-t" title="' + escapeHtml(d.titulo) + '">' +
          escapeHtml(tituloCurto(d.titulo)) +
          '</span><button class="chip-x" title="Remover do contexto" aria-label="Remover ' +
          escapeHtml(tituloCurto(d.titulo)) + ' do contexto">' + SVG.x + "</button>";
        chip.querySelector(".chip-x").addEventListener("click", () => {
          setDocChecked(d.id, false);
          syncSelection();
        });
        bandeja.appendChild(chip);
      }
      prevChipIds = new Set(sel.map((d) => d.id));
    }

    // "todas" respeita a busca: com filtro ativo, marca/desmarca só as peças
    // visíveis (ex.: buscar "contestação" + todas = marca as contestações).
    chkAll.addEventListener("change", () => {
      const filtrando = !!norm(docQ.value.trim());
      doclist.querySelectorAll('input[type="checkbox"]').forEach((c) => {
        const row = c.closest(".docrow");
        if (!filtrando || (row && !row.hidden)) c.checked = chkAll.checked;
      });
      syncSelection();
    });
    // "principais": só as peças com categoria destacada (decisões, audiências,
    // petições, provas — as coloridas). Mesmo comportamento do "todas": os
    // checkboxes seguem sendo a fonte de verdade e o filtro ativo é respeitado.
    chkMain.addEventListener("change", () => {
      const filtrando = !!norm(docQ.value.trim());
      doclist.querySelectorAll('input[type="checkbox"]').forEach((c) => {
        const row = c.closest(".docrow");
        if (!row || row.classList.contains("cat-outro")) return;
        if (!filtrando || !row.hidden) c.checked = chkMain.checked;
      });
      syncSelection();
    });
    // eventos change dos checkboxes individuais borbulham até a lista
    doclist.addEventListener("change", syncSelection);

    // -------------------------------------------------------------------------
    // SELEÇÃO EM FAIXA — marcar 40 petições em sequência não pode custar 40
    // cliques.
    //
    // Três gestos, todos operando sobre os MESMOS checkboxes (a fonte de verdade
    // de toda a extensão; chips, contador, popup @ e envio são projeções dela):
    //
    //   · arrastar          — marca/desmarca a faixa por onde o ponteiro passa;
    //   · Shift+clique      — do último item tocado até este (padrão universal:
    //                         Explorer, Gmail, GitHub — ninguém precisa aprender);
    //   · botão direito     — menu com "daqui para baixo/cima", que é o que
    //                         resolve quando o outro extremo está fora da tela.
    //
    // Todos respeitam o FILTRO ativo: operam só nas rows visíveis, igual ao
    // "todas" e ao "principais".
    // -------------------------------------------------------------------------
    let ancoraSel = -1; // índice da última row alternada (âncora do Shift)
    let arrastando = false;
    let arrastoValor = true; // marcando ou desmarcando
    let origemMarcada = false; // a row onde o arrasto começou já foi aplicada?

    function rowsVisiveis() {
      return [...doclist.querySelectorAll(".docrow")].filter((r) => !r.hidden);
    }
    function idxDaRow(row) {
      return rowsVisiveis().indexOf(row);
    }
    function aplicarFaixa(de, ate, valor) {
      const rows = rowsVisiveis();
      const a = Math.min(de, ate);
      const b = Math.max(de, ate);
      for (let i = a; i <= b; i++) {
        const inp = rows[i] && rows[i].querySelector("input");
        if (inp) inp.checked = valor;
      }
      syncSelection();
    }

    doclist.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return; // .d-ver / .d-extrai têm dono
      const row = e.target.closest(".docrow");
      if (!row) return;
      const i = idxDaRow(row);
      if (i < 0) return;
      const inp = row.querySelector("input");
      if (!inp) return;

      if (e.shiftKey && ancoraSel >= 0) {
        // Shift+clique: o label alternaria só esta row — preciso do intervalo.
        e.preventDefault();
        aplicarFaixa(ancoraSel, i, !inp.checked || ancoraSel !== i);
        return;
      }
      // Início de arrasto: o valor alvo é o OPOSTO do estado atual, e ele se
      // propaga para todas as rows que o ponteiro cruzar. O clique normal segue
      // funcionando pelo <label> — não damos preventDefault aqui (ele impediria
      // o label de alternar a row de origem).
      arrastando = true;
      arrastoValor = !inp.checked;
      ancoraSel = i;
      origemMarcada = false; // só vira true se o gesto virar arrasto de fato
      // Sem isto o gesto seleciona os IDS como texto (a exceção
      // `.d-id{user-select:text}` vive dentro da row) e não marca nada: a lista
      // fica azul nos números e o arrasto morre. Como não damos preventDefault,
      // suspender via classe é o único caminho — e só durante o gesto, para o
      // id continuar copiável quando parado.
      doclist.classList.add("arrastando");
    });

    doclist.addEventListener("pointerover", (e) => {
      if (!arrastando) return;
      const row = e.target.closest(".docrow");
      if (!row) return;
      const inp = row.querySelector("input");
      if (!inp) return;
      const i = idxDaRow(row);
      // A row de ORIGEM é alternada pelo <label> — mas só quando o gesto vira um
      // CLIQUE. Num arrasto o clique não se completa, então ela ficava de fora:
      // arrastar da peça 1 até a 5 marcava 2,3,4,5 e deixava justamente aquela
      // onde o dedo começou. Ao cruzar a primeira row diferente, o gesto está
      // confirmado como arrasto — é a hora de marcar a origem também.
      if (i !== ancoraSel && !origemMarcada) {
        origemMarcada = true;
        const rowOrigem = doclist.querySelectorAll(".docrow")[ancoraSel];
        const inpOrigem = rowOrigem && rowOrigem.querySelector("input");
        if (inpOrigem && inpOrigem.checked !== arrastoValor) inpOrigem.checked = arrastoValor;
      }
      if (inp.checked !== arrastoValor && i !== ancoraSel) {
        inp.checked = arrastoValor;
        syncSelection();
      } else if (origemMarcada) syncSelection();
    });

    // No documento, não na lista: o ponteiro solta com frequência fora dela.
    // `fimArrastoLista`, não `fimArrasto`: este nome já pertence ao arrasto da
    // JANELA no modo livre (mount, bem acima). São dois gestos diferentes.
    function fimArrastoLista() {
      if (!arrastando) return;
      arrastando = false;
      doclist.classList.remove("arrastando");
      // Se algo escapou e virou seleção (o pointerdown pode cair num nó já
      // selecionável antes de a classe valer), limpa: deixar os ids pintados
      // de azul depois do gesto faz parecer que o arrasto falhou mesmo quando
      // marcou tudo certo.
      const sel = root.getSelection ? root.getSelection() : window.getSelection();
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
    }
    document.addEventListener("pointerup", fimArrastoLista);
    document.addEventListener("pointercancel", fimArrastoLista);

    // --- menu "daqui para baixo / daqui para cima" ----------------------------
    let menuSel = null;
    function fecharMenuSel() {
      if (menuSel) menuSel.remove();
      menuSel = null;
    }
    doclist.addEventListener("contextmenu", (e) => {
      const row = e.target.closest(".docrow");
      if (!row) return;
      const i = idxDaRow(row);
      if (i < 0) return;
      e.preventDefault();
      fecharMenuSel();
      const total = rowsVisiveis().length;
      const menu = document.createElement("div");
      menu.className = "selmenu";
      menu.setAttribute("role", "menu");
      const opcoes = [
        ["Marcar daqui para baixo", () => aplicarFaixa(i, total - 1, true)],
        ["Marcar daqui para cima", () => aplicarFaixa(0, i, true)],
        ["Desmarcar daqui para baixo", () => aplicarFaixa(i, total - 1, false)],
        ["Desmarcar daqui para cima", () => aplicarFaixa(0, i, false)],
        ["Marcar só esta", () => {
          aplicarFaixa(0, total - 1, false);
          aplicarFaixa(i, i, true);
        }],
      ];
      opcoes.forEach(function (o, n) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = o[0];
        if (n === 2) b.className = "sep";
        b.addEventListener("click", () => {
          fecharMenuSel();
          o[1]();
          ancoraSel = i;
        });
        menu.appendChild(b);
      });
      wrap.appendChild(menu);
      menuSel = menu;
      // Coordenadas de VIEWPORT (o .selmenu é position:fixed): o .wrap tem
      // tamanho zero e clampar por dentro dele mandaria o menu para o canto.
      const r = row.getBoundingClientRect();
      menu.style.left = Math.max(6, Math.min(e.clientX, window.innerWidth - 214)) + "px";
      menu.style.top = Math.max(6, Math.min(r.bottom + 2, window.innerHeight - 172)) + "px";
    });
    // Fecha em qualquer clique fora, Esc e ao re-renderizar a lista.
    wrap.addEventListener("pointerdown", (e) => {
      if (menuSel && !e.target.closest(".selmenu")) fecharMenuSel();
    });

    // -------------------------------------------------------------------------
    // "Carregar todas as peças": a timeline do PJe carrega sob demanda; o
    // botão pede ao content script para rolá-la até o fim pelo usuário. O
    // estado visual (texto da dica + botão travado) é controlado por
    // setTimelineTip — o content script é quem sabe o progresso real.
    // -------------------------------------------------------------------------
    let carregarTLCb = null;
    tipLoad.addEventListener("click", () => carregarTLCb && carregarTLCb());

    // -------------------------------------------------------------------------
    // "Baixar .zip": exporta as peças MARCADAS — ou todas as da lista, quando
    // nenhuma está marcada. A regra segue a mesma fonte de verdade de todo o
    // resto (os checkboxes); o fallback para "todas" existe porque exportar os
    // autos inteiros é o caso comum, e obrigar a marcar 300 peças antes seria
    // um pedágio sem propósito. Qual dos dois aconteceu vai dito no card de
    // progresso — a ação não pode ser ambígua.
    // -------------------------------------------------------------------------
    let zipCb = null;
    tipZip.addEventListener("click", () => {
      if (!zipCb || tipZip.disabled) return;
      const marcadas = getSelectedDocs();
      const alvo = marcadas.length ? marcadas : allDocs;
      if (!alvo.length) {
        statusEl.textContent = "A lista de peças está vazia — não há o que exportar.";
        return;
      }
      zipCb(alvo, { todas: !marcadas.length });
    });
    // Trava o botão enquanto a exportação corre (o download do PJe é
    // serializado: dois lotes ao mesmo tempo brigariam pela sessão JSF).
    function setZipOcupado(on) {
      tipZip.disabled = !!on;
      tipZip.textContent = on ? "Baixando…" : "⬇ Documentos";
    }
    // Em repouso o aviso é só o ícone ⚠️ (o texto vive no title dele) — ocupava
    // duas linhas fixas da coluna. Com PROGRESSO ou carregando, o texto volta a
    // ser visível: é feedback de uma ação em curso, não um aviso de fundo.
    // A mensagem FINAL ("linha do tempo completa: 38 peças") tem prazo: sem ele
    // o content.js a deixa fixa pelo resto da sessão (o último setTimelineTip
    // vem com carregando:false e nunca mais é chamado), devolvendo à coluna as
    // duas linhas que esta rodada tirou.
    // O aviso padrão fica SEMPRE no .tip-txt (escondido por CSS em repouso): é
    // ele que o hover/foco no ⚠️ revela. Só o progresso o substitui.
    let tipTimer = null;
    function repousoTip() {
      tipTxt.textContent = TIP_PADRAO;
      tipBox.classList.remove("carregando");
    }
    function setTimelineTip(estado) {
      const { texto = null, carregando = false } = estado || {};
      clearTimeout(tipTimer);
      tipLoad.disabled = carregando;
      tipLoad.textContent = carregando ? "Carregando…" : "⟳ Carregar tudo";
      if (!texto && !carregando) return repousoTip();
      tipTxt.textContent = texto || TIP_PADRAO;
      tipBox.classList.add("carregando");
      if (!carregando) tipTimer = setTimeout(repousoTip, 12000);
    }
    repousoTip();

    // -------------------------------------------------------------------------
    // "Ver na timeline": botão por peça (delegado — as rows são recriadas a
    // cada setDocs). O content script rola a página do PJe até o documento.
    // -------------------------------------------------------------------------
    let verTimelineCb = null;
    // Compartilhado pelo botão da lista de peças e pelas citações do chat.
    function irParaPeca(id) {
      if (!id || !verTimelineCb) return;
      hidePreview();
      // No modal (expandido/cheia) a página fica coberta: troca para o modo
      // lateral antes de rolar, para o usuário VER o documento destacado.
      if (wrap.classList.contains("expanded")) aplicarModo("lateral");
      // setTimeout (não rAF: o Chrome suprime rAF em janela ocluída) — dá
      // tempo do layout assentar antes de o content script rolar a página.
      setTimeout(() => verTimelineCb(id), 50);
    }
    doclist.addEventListener("click", (e) => {
      const btn = e.target.closest(".d-ver");
      if (!btn) return;
      // A row é um <label>: sem o preventDefault o clique alternaria o
      // checkbox (fonte de verdade da seleção) e dispararia o change delegado.
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".docrow");
      if (!row) return;
      irParaPeca(row.dataset.id);
    });
    // Citação do rodapé de uma resposta → mesma navegação. Handler DELEGADO no
    // container: as bolhas são re-renderizadas a cada delta do stream, então um
    // listener por linha morreria no primeiro token seguinte.
    msgs.addEventListener("click", (e) => {
      const btn = e.target.closest(".cite-go");
      if (btn) irParaPeca(btn.dataset.id);
    });

    // -------------------------------------------------------------------------
    // Extração de texto das peças.
    //
    // A UI fala "extrair o texto", nunca "OCR": OCR é nome de implementação, e
    // para quem usa o PJe o conceito é tirar o texto de dentro do documento. O
    // termo técnico vive no help.html.
    //
    // O estado por peça mora AQUI num Map e é re-aplicado a cada setDocs — as
    // rows são recriadas a cada refresh da timeline do PJe, então guardar
    // estado no DOM o perderia no primeiro refresh.
    // -------------------------------------------------------------------------
    let extracaoEstado = {}; // { [id]: {usando, fonte, paginas} }
    let extrairCb = null;
    let extrairLoteCb = null;
    let desfazerExtracaoCb = null;
    let extraivelCb = null; // (id) -> {podeExtrair, imagens, escaneado} | null

    // Consulta ao content script protegida: `extraivelCb` é código de FORA do
    // painel, e um erro dentro dele não pode derrubar quem o chamou. Esta
    // função roda no meio do `setDocs`, então uma exceção aqui abortava a
    // montagem da lista de peças — a espinha dorsal do painel — e levava junto
    // tudo que é registrado depois no content.js. Foi exatamente o que um
    // `const` fora de ordem causou: sumiram a seleção em faixa E a extração.
    // Mesmo contrato best-effort do resto dos callbacks.
    function extraivelSeguro(id) {
      if (!extraivelCb) return null;
      try {
        return extraivelCb(id);
      } catch (e) {
        console.debug("[PJe IA] onExtraivel falhou para a peça", id, e && e.message);
        return null;
      }
    }

    function aplicarExtracaoNasRows() {
      for (const row of doclist.querySelectorAll(".docrow")) {
        const id = row.dataset.id;
        const st = extracaoEstado[id];
        const badge = row.querySelector(".d-emtexto");
        const btn = row.querySelector(".d-extrai");
        const usando = !!(st && st.usando);
        // A marca por peça VOLTOU, e é permanente (não depende de hover).
        //
        // Ela tinha saído porque num processo com 43 de 44 peças extraídas o
        // mesmo ícone em toda linha vira um muro. Mas o muro honesto é melhor
        // que o estado invisível: sem marca, terminar a extração de UMA peça
        // não mudava absolutamente nada na tela — não havia como saber se
        // funcionou. E o uso peça a peça, que é o principal, ficava sem
        // qualquer confirmação. É o único estado que altera o que o modelo
        // recebe, então é o único que merece marca permanente.
        if (badge) {
          badge.hidden = !usando;
          if (usando) {
            if (!badge.firstChild) badge.innerHTML = SVG.emTexto;
            const fonte = st.fonte === "mistral" ? "OCR" : "leitura local";
            badge.title =
              "Esta peça vai para a IA como TEXTO — " +
              (st.paginas || 0) + " folha(s), por " + fonte +
              ". Passe o mouse sobre a peça para comparar com o documento original.";
            badge.setAttribute("aria-label", badge.title);
          }
        }
        row.classList.toggle("em-texto", usando);

        // Selo do formato. Responde de relance "em quais peças o OCR faz
        // sentido?" — só PDF. Aparece quando a peça já foi baixada (antes
        // disso o formato é desconhecido) e some quando ela passou a ir como
        // texto, porque aí quem manda é a marca verde.
        const fmt = row.querySelector(".d-fmt");
        if (fmt) {
          const f = st && st.formato;
          fmt.hidden = !f || usando;
          if (!fmt.hidden) {
            fmt.textContent = f;
            fmt.className = "d-fmt fmt-" + f.toLowerCase();
            fmt.title =
              f === "PDF"
                ? "Documento em PDF — é o único formato que aceita extração de texto/OCR"
                : "Peça escrita no editor do PJe (" + f + "): já é texto, não precisa de extração";
            fmt.setAttribute("aria-label", fmt.title);
          }
        }

        if (btn) {
          const info = extraivelSeguro(id);
          // O botão só existe onde há o que fazer: peça já em texto ganha
          // "voltar ao documento" — com ÍCONE PRÓPRIO, senão ele fica idêntico
          // ao de extrair e parece oferecer a mesma ação de novo.
          if (usando) {
            btn.hidden = false;
            btn.classList.add("desfaz");
            btn.innerHTML = SVG.voltarDoc;
            btn.title = "Voltar a usar o documento original desta peça";
            btn.setAttribute("aria-label", btn.title);
          } else if (info && info.podeExtrair) {
            btn.hidden = false;
            btn.classList.remove("desfaz");
            btn.innerHTML = SVG.extrair;
            // Retentativa informada: dizer só "extrair" numa peça que já
            // falhou convida ao mesmo erro sem explicar nada.
            btn.title = info.falhouAntes
              ? "Tentar de novo — a última tentativa falhou: " + info.falhouAntes
              : info.escaneado
                ? "Esta peça é digitalizada — extrair o texto dela com OCR"
                : "Extrair o texto desta peça (leitura local, sem custo)";
            btn.setAttribute("aria-label", btn.title);
          } else {
            btn.hidden = true;
          }
        }
      }
    }

    doclist.addEventListener("click", (e) => {
      const btn = e.target.closest(".d-extrai");
      if (!btn) return;
      // A row é um <label>: sem isto o clique alternaria o checkbox, que é a
      // fonte de verdade da seleção (mesmo contrato do .d-ver).
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".docrow");
      if (!row) return;
      const id = row.dataset.id;
      if (btn.classList.contains("desfaz")) {
        if (desfazerExtracaoCb) desfazerExtracaoCb(id);
        return;
      }
      pedirExtracao([id], row);
    });

    // UMA tela, UMA decisão.
    //
    // A versão anterior espalhava a escolha em cinco lugares (diálogo de
    // imagens, aviso de peças não medidas, "forçar OCR", "refazer com OCR",
    // veredito de custo por modelo) porque eu deixei um detalhe de
    // IMPLEMENTAÇÃO — ler no navegador quando dá, OCR quando não dá — virar
    // decisão de interface. Não é. O usuário decide UMA coisa: extrair estas
    // peças, pagando OCR ou não. Como a extensão consegue o texto é problema
    // dela.
    //
    // Renderizado no Shadow DOM: confirm() nativo vive fora dele e CONGELA a
    // extensão (mesma razão da exclusão em dois cliques na biblioteca).
    function pedirExtracao(ids, ancora) {
      let comImagens = 0;
      let paginas = 0;
      let temChaveOcr = false;
      for (const id of ids) {
        const info = extraivelSeguro(id);
        if (!info) continue;
        if (info.imagens > 0) comImagens++;
        paginas += info.paginas || 0;
        if (info.ocrDisponivel) temChaveOcr = true;
      }
      const usd = paginas * 0.002;
      const custoTxt = !paginas
        ? ""
        : usd < 0.01
          ? " · menos de US$ 0,01"
          : " · ≈ US$ " +
            usd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const partes = [
        ids.length === 1
          ? "Extrair o texto desta peça."
          : "Extrair o texto de " + ids.length + " peças.",
      ];
      if (comImagens) {
        partes.push(
          (ids.length === 1
            ? "Ela tem imagens"
            : comImagens === ids.length
              ? "Todas têm imagens"
              : comImagens + " delas têm imagens") +
            " (assinatura, carimbo, documento digitalizado): em texto o modelo deixa de ver isso."
        );
      }
      // UMA via só: OCR do Mistral.
      //
      // A leitura local (pdf.js) saiu da INTERFACE de propósito. Oferecer as
      // duas obrigava o usuário a escolher entre implementações — e a pergunta
      // que ele fazia era justamente "estou usando o Mistral ou não?". Ter de
      // perguntar isso já é o defeito. Agora o botão diz o que faz, com o custo
      // ao lado, e não há segunda opção para confundir.
      //
      // O pdf.js continua no código como caminho de quem NÃO configurou a
      // chave: ali não há escolha a oferecer, só um jeito de conseguir o texto.
      if (!temChaveOcr) {
        partes.push(
          "Sem a chave da Mistral, a leitura é feita no seu navegador — funciona em " +
            "peças com texto próprio, mas não em digitalizações."
        );
      }
      confirmarVisual(
        partes.join(" "),
        temChaveOcr ? "Extrair com OCR" + custoTxt : "Extrair",
        ancora,
        () => {
          const opts = temChaveOcr ? { forcarOcr: true } : {};
          if (extrairCb && ids.length === 1) extrairCb(ids[0], opts);
          else if (extrairLoteCb) extrairLoteCb(ids, opts);
        }
      );
    }

    let confirmEl = null;
    function fecharConfirm() {
      if (confirmEl) confirmEl.remove();
      confirmEl = null;
    }
    // `alt` é uma segunda ação OPCIONAL — a menos segura das duas. Ela existe
    // porque numa decisão em bloco sobre um conjunto misto "sim ou não" é uma
    // escolha falsa: o que se quer quase sempre é "faça na parte que não perde
    // nada". Ela fica visualmente subordinada à primária (ver .cb-alt no CSS).
    function confirmarVisual(texto, rotuloOk, ancora, onOk, alt) {
      fecharConfirm();
      const box = document.createElement("div");
      box.className = "confirmbox";
      box.setAttribute("role", "dialog");
      box.innerHTML =
        '<p class="cb-t"></p>' +
        '<div class="cb-acoes">' +
        '<button type="button" class="cb-no">Cancelar</button>' +
        (alt ? '<button type="button" class="cb-alt"></button>' : "") +
        '<button type="button" class="cb-yes"></button>' +
        "</div>";
      box.querySelector(".cb-t").textContent = texto; // conteúdo dos autos: nunca innerHTML
      box.querySelector(".cb-yes").textContent = rotuloOk;
      box.querySelector(".cb-no").addEventListener("click", fecharConfirm);
      box.querySelector(".cb-yes").addEventListener("click", () => {
        fecharConfirm();
        onOk();
      });
      if (alt) {
        const b = box.querySelector(".cb-alt");
        b.textContent = alt.rotulo;
        b.addEventListener("click", () => {
          fecharConfirm();
          alt.onOk();
        });
      }
      wrap.appendChild(box);
      confirmEl = box;
      if (ancora && ancora.getBoundingClientRect) {
        // Viewport, não o .wrap (que tem tamanho zero) — ver o CSS do .confirmbox.
        //
        // A altura é MEDIDA depois de inserir, nunca presumida. A versão
        // anterior usava um `130` fixo: com um texto de quatro linhas a caixa
        // passava disso e os botões ficavam abaixo da borda da tela — o usuário
        // via a pergunta e não via as respostas. Como o painel vive na parte de
        // baixo da página, esse é o caso COMUM, não a exceção.
        const r = ancora.getBoundingClientRect();
        const cx = box.getBoundingClientRect();
        const M = 8; // respiro mínimo até a borda da janela
        box.style.left =
          Math.max(M, Math.min(r.left, window.innerWidth - cx.width - M)) + "px";
        // Abaixo da âncora quando couber; senão ACIMA dela; e se não couber em
        // lugar nenhum, encostada no topo com a altura limitada pelo CSS.
        const abaixo = r.bottom + 6;
        const acima = r.top - cx.height - 6;
        box.style.top =
          (abaixo + cx.height + M <= window.innerHeight
            ? abaixo
            : acima >= M
              ? acima
              : Math.max(M, window.innerHeight - cx.height - M)) + "px";
      }
      box.querySelector(".cb-yes").focus();
    }

    // Aviso AGREGADO na faixa, e não um ícone por peça: num inquérito com 50
    // anexos digitalizados, uma marca por linha vira um muro. A .docs-tip já é
    // o lugar de "algo sobre a lista + o botão que resolve" (é onde vive o
    // aviso de timeline incompleta). Informa, não barra: o envio funciona
    // normalmente com peça digitalizada não extraída.
    // Linha de STATUS da seleção — não um aviso solto.
    //
    // Ela responde de uma vez às três perguntas que a versão anterior deixava
    // no ar: quantas peças estão marcadas, quantas JÁ vão como texto, e quantas
    // ainda podem ir (com o botão que faz exatamente isso). E — o que mais
    // importa — **ela não some quando o usuário marca mais peças**: antes o
    // cálculo só via peças já baixadas, então marcar "todas" escondia a opção,
    // o oposto do esperado.
    let extracaoAviso = null;
    function setExtracaoAviso(info) {
      extracaoAviso = info;
      extraiBar.hidden = !info || !info.marcadas;
      if (extraiBar.hidden) return;
      const pend = info.pendentes;
      const indisp = info.indisponiveis || 0;
      extraiBar.classList.toggle("tem-ocr", !!info.ocr);
      extraiBar.classList.toggle("tudo-pronto", !pend);

      // O texto muda de forma conforme o estado, em vez de acumular cláusulas:
      // "44 marcadas · 43 em texto · 1 em documento · ≈ US$ 0,28" trunca em
      // 420px e vira reticências. Cada estado tem UMA frase curta.
      // A frase diz UMA coisa: quantas peças ainda podem virar texto. Nada de
      // vereditos de custo por modelo, categorias de indisponibilidade ou
      // aritmética de "N de M" — tudo isso era eu explicando a implementação
      // numa linha de 420px, e o efeito foi o oposto do pretendido.
      let frase;
      let curta;
      if (!pend) {
        frase = info.jaTexto
          ? info.jaTexto + (info.jaTexto > 1 ? " peças em texto" : " peça em texto")
          : "Nenhuma peça para extrair";
        curta = frase;
      } else {
        frase = pend + (pend > 1 ? " peças em PDF" : " peça em PDF") + " podem virar texto";
        curta = pend + " em PDF";
      }
      // Custo só quando ele existe de verdade. "US$ 0,00" é mentira: o OCR
      // CUSTA (US$ 0,002/folha) e uma folha só arredondava para zero. Sem chave
      // da Mistral o custo é zero de fato e nada é mostrado. Vírgula decimal —
      // o painel é todo em pt-BR.
      const c = info.custoUsd || 0;
      if (c > 0) {
        const usd = c < 0.01
          ? "menos de US$ 0,01"
          : "≈ US$ " + c.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        frase += " · " + usd;
        curta += " · " + (c < 0.01 ? "< US$ 0,01" : usd.replace("≈ ", ""));
      }
      // DUAS versões no DOM, escolhidas pelo CSS — o mesmo padrão do medidor de
      // contexto (.g-full/.g-short). No modo expandido o painel é largo mas a
      // COLUNA de peças é estreita (~310px), e a frase completa truncava
      // exatamente no custo — o número que decide se vale extrair.
      ebTexto.textContent = "";
      const full = document.createElement("span");
      full.className = "eb-full";
      full.textContent = frase;
      const short = document.createElement("span");
      short.className = "eb-short";
      short.textContent = curta;
      ebTexto.appendChild(full);
      ebTexto.appendChild(short);

      ebGo.hidden = !pend;
      ebGo.textContent = "Extrair texto";

      // O detalhamento vive no title, onde não custa espaço nem atenção.
      const det = [];
      if (info.locais) det.push(info.locais + " com texto próprio (lidas no navegador, sem custo)");
      if (info.ocr) det.push(info.ocr + " digitalizada(s), por OCR");
      if (info.naoMedidas) det.push(info.naoMedidas + " ainda não baixada(s) do PJe");
      if (indisp) det.push(indisp + " sem extração possível agora");
      ebGo.title = pend
        ? "Extrair o texto de " + pend + " peça(s) em PDF" +
          (det.length ? ": " + det.join("; ") : "") +
          ". Só PDF aceita extração — peças escritas no editor do PJe já são texto."
        : "";
      extraiBar.title = pend
        ? ebGo.title
        : "Estas peças já vão para a IA como texto.";
    }
    ebGo.addEventListener("click", () => {
      if (!extracaoAviso || !extrairLoteCb) return;
      // A LISTA que o content script contou, não uma recontagem local. Quando
      // o painel rederivava o alvo por outro caminho, as duas contas divergiam
      // e o botão dizia "Extrair 44" processando zero. Uma fonte, uma verdade.
      const ids = (extracaoAviso.ids || []).slice();
      if (ids.length) pedirExtracao(ids, ebGo);
    });

    // Mesma resolução de escopo do .tip-zip: as MARCADAS; sem nenhuma marcada,
    // a lista inteira. A seleção por checkbox continua sendo a fonte de verdade.
    let zipTextoCb = null;
    tipZipT.addEventListener("click", () => {
      if (!zipTextoCb) return;
      const marcadas = getSelectedDocs();
      const alvo = marcadas.length ? marcadas : allDocs;
      if (!alvo.length) return;
      zipTextoCb(alvo, { todas: !marcadas.length });
    });

    // -------------------------------------------------------------------------
    // Preview de peça no hover (só nos modos expandido/cheia e lateral, onde
    // há espaço). O conteúdo vem SEMPRE do cache do content script (callback
    // síncrono) — o hover NUNCA baixa nada: o download do PJe é serializado
    // na sessão JSF e levaria segundos, travando a extensão. Cache-miss
    // mostra aviso + botão "Baixar" (gesto explícito). Um único popover e no
    // máximo UM blob URL vivos por vez; revogação a cada fechamento.
    // -------------------------------------------------------------------------
    const previewEl = document.createElement("div");
    previewEl.className = "preview";
    previewEl.hidden = true;
    wrap.appendChild(previewEl);

    let previewCb = null; // (id) -> {kind:"pdf"|"text", ...} | null (síncrono)
    let previewDlCb = null; // (id) -> Promise<info> — só no clique em "Baixar"
    let previewId = null; // peça exibida no momento
    // Aba escolhida À MÃO no popover ("doc"|"texto"); null = automático, que
    // mostra o que o modelo vai receber. Reseta a cada peça nova.
    let previewAba = null;
    let abrirTextoCb = null; // (id) -> abre a página de leitura do texto
    let previewUrl = null; // blob URL vivo (no máximo um)
    let previewTimer = null; // debounce de intenção do hover
    let previewHideTimer = null; // fechamento tolerante (mouse indo ao popover)
    let previewCspBloqueado = false; // página barrou embed de blob: PDF (CSP)
    // Download via botão "Baixar" em andamento: a ativação JSF do PJe mexe na
    // timeline → MutationObserver → setDocs, que fecharia o popover no meio.
    // A flag suprime SÓ esse fechamento automático (Esc/scroll seguem valendo).
    let previewDlPendente = false;
    const PREVIEW_HOVER_MS = 400;
    const PREVIEW_MAX_HOVER_B = 15 * 1024 * 1024; // atob de b64 maior travaria a UI

    function limparPreviewUrl() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
    }
    function hidePreview() {
      clearTimeout(previewTimer);
      clearTimeout(previewHideTimer);
      previewId = null;
      if (!previewEl.hidden) {
        previewEl.hidden = true;
        previewEl.innerHTML = ""; // solta o <embed> (o viewer de PDF retém memória)
      }
      limparPreviewUrl();
    }
    function b64ParaBlobUrl(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    }
    function fmtBytes(n) {
      if (!n) return "? KB";
      return n >= 1048576
        ? (n / 1048576).toFixed(1).replace(".", ",") + " MB"
        : Math.max(1, Math.round(n / 1024)) + " KB";
    }

    function renderPreview(row, info) {
      const id = row.dataset.id;
      const d = allDocs.find((x) => x.id === id);
      limparPreviewUrl();
      previewEl.innerHTML = "";
      previewEl.classList.remove("compact");
      // Conteúdo compacto (texto/aviso) dispensa altura manual do resize —
      // herdar a altura de um PDF redimensionado deixaria área em branco.
      const modoCompact = () => {
        previewEl.classList.add("compact");
        previewEl.style.height = "";
      };

      const hd = document.createElement("div");
      hd.className = "preview-hd " + (d ? categoriaDe(d) : "cat-outro");
      hd.innerHTML =
        '<span class="d-dot"></span><span class="t" title="' +
        escapeHtml(d ? d.titulo : id) + '">' +
        escapeHtml(d ? tituloCurto(d.titulo) : id) + "</span>";
      previewEl.appendChild(hd);

      // Abas Documento / Texto quando a peça tem texto extraído.
      //
      // O preview mostra O QUE O MODELO VÊ: se a peça passou a ir como texto,
      // é o texto que abre por padrão. É isso que torna a conferência
      // confiável — o usuário decide se aceita a extração olhando exatamente o
      // que foi para a API, não uma aproximação.
      const temTexto = !!(info && info.txt);
      const verTexto = temTexto && (previewAba === "texto" || (previewAba == null && info.txtUsar));
      if (temTexto) {
        const tabs = document.createElement("div");
        tabs.className = "preview-tabs";
        // A aba que está EM USO leva a marca "•" — sem ela as duas abas
        // parecem alternativas equivalentes e não se sabe qual delas é a que
        // vai para a IA, que é a única pergunta que importa aqui.
        const marca = ' <span class="pv-uso" title="É esta versão que vai para a IA">•</span>';
        const usaTxt = !!info.txtUsar;
        tabs.innerHTML =
          '<button type="button" class="pv-tab' + (verTexto ? "" : " on") +
          '" data-aba="doc" title="O arquivo original da peça, como o PJe serve">Documento' +
          (usaTxt ? "" : marca) + "</button>" +
          '<button type="button" class="pv-tab' + (verTexto ? " on" : "") +
          '" data-aba="texto" title="O texto extraído desta peça">Texto' +
          (usaTxt ? marca : "") + "</button>";
        tabs.addEventListener("click", (e) => {
          const b = e.target.closest(".pv-tab");
          if (!b) return;
          previewAba = b.dataset.aba;
          renderPreview(row, info);
        });
        hd.appendChild(tabs);
      }

      const bd = document.createElement("div");
      bd.className = "preview-bd";
      previewEl.appendChild(bd);

      if (verTexto) {
        modoCompact();
        const t = document.createElement("div");
        t.className = "preview-txt";
        t.textContent = info.txt; // NUNCA innerHTML — conteúdo dos autos
        bd.appendChild(t);
        const ft = document.createElement("div");
        ft.className = "preview-ft";
        const fonte = info.txtFonte === "mistral" ? "OCR" : "leitura local";
        // "Voltar ao documento" mora AQUI, e não só no ícone do hover da row:
        // é olhando o texto que se descobre que ele não presta — um RG ou uma
        // foto de laudo viram poucas linhas ilegíveis, e o modelo perdeu a
        // imagem que era todo o conteúdo. A saída tem de estar na tela onde o
        // problema aparece, não escondida num ícone de outra linha.
        // "Refazer com OCR" aparece quando a leitura foi LOCAL e há chave da
        // Mistral. É aqui que a decisão faz sentido: ninguém pede OCR antes de
        // ver que o texto local não serviu — e este é o painel onde isso se vê.
        const infoEx = extraivelSeguro(id) || {};
        const podeOcr = info.txtFonte !== "mistral" && infoEx.ocrDisponivel;
        ft.innerHTML =
          "<span>" + (info.txtPaginas || 0) + " folha(s) · " + fonte + "</span>" +
          (podeOcr
            ? '<button type="button" class="preview-ocr" title="Ler esta peça de novo pelo OCR da Mistral (pago). Use quando o texto acima saiu incompleto ou ilegível.">Refazer com OCR</button>'
            : "") +
          (info.txtUsar
            ? '<button type="button" class="preview-voltar-doc">Voltar ao documento</button>'
            : "") +
          // Comparar é a ação PRINCIPAL depois de extrair: o texto só é
          // confiável se der para bater contra o original, e este popover é
          // pequeno demais para as duas coisas lado a lado.
          '<button type="button" class="preview-abrir-txt" data-cmp="1" title="Abre o texto e o PDF original lado a lado, numa aba nova">Comparar</button>';
        const bOcr = ft.querySelector(".preview-ocr");
        if (bOcr) {
          bOcr.addEventListener("click", () => {
            bOcr.disabled = true;
            bOcr.textContent = "Lendo…";
            if (extrairCb) extrairCb(id, { forcarOcr: true });
          });
        }
        ft.querySelector(".preview-abrir-txt").addEventListener("click", (ev) => {
          if (abrirTextoCb) abrirTextoCb(id, { comparar: ev.currentTarget.dataset.cmp === "1" });
        });
        const bVolta = ft.querySelector(".preview-voltar-doc");
        if (bVolta) {
          bVolta.addEventListener("click", async () => {
            if (!desfazerExtracaoCb) return;
            bVolta.disabled = true;
            await desfazerExtracaoCb(id);
            // Mostra o resultado da própria ação: a aba salta para o documento,
            // que é o que passou a ir para a IA.
            if (previewId !== id) return;
            previewAba = "doc";
            renderPreview(row, info);
          });
        }
        previewEl.appendChild(ft);
        return;
      }

      if (!info) {
        // cache-miss: nada de download automático — só sob gesto explícito
        modoCompact();
        const box = document.createElement("div");
        box.className = "preview-miss";
        box.innerHTML =
          "<span>Peça ainda não carregada nesta conversa.</span>" +
          '<button type="button" class="preview-dl">Abrir documento</button>';
        const btn = box.querySelector(".preview-dl");
        const soAviso = (t) => (box.innerHTML = "<span>" + escapeHtml(t) + "</span>");
        btn.addEventListener("click", async () => {
          if (!previewDlCb) return;
          btn.disabled = true;
          btn.textContent = "Abrindo…";
          previewDlPendente = true;
          try {
            const baixado = await previewDlCb(id);
            // re-renderiza só se o popover ainda mostra ESTA peça
            if (previewId !== id) return;
            if (baixado) {
              renderPreview(row, baixado);
              // o conteúdo pode ter crescido (aviso → PDF): reposiciona na
              // row ATUAL (o setDocs pode ter recriado a lista nesse meio-tempo)
              const anc = doclist.querySelector(
                '.docrow[data-id="' + CSS.escape(id) + '"]'
              );
              if (anc) posicionarPreview(anc);
            } else soAviso("Não foi possível abrir a peça.");
          } catch (err) {
            if (previewId === id)
              soAviso("Falha ao abrir: " + String((err && err.message) || err));
          } finally {
            previewDlPendente = false;
          }
        });
        bd.appendChild(box);
        return;
      }

      if (info.kind === "text") {
        modoCompact();
        const t = document.createElement("div");
        t.className = "preview-txt";
        t.textContent = info.text; // NUNCA innerHTML — conteúdo dos autos
        bd.appendChild(t);
        return;
      }

      // PDF em cache. `!info.b64` acontece quando a peça veio de uma sessão
      // anterior só com o texto extraído: o documento existe, mas os bytes dele
      // não foram baixados de novo (e não precisam ser, para o envio).
      const pesado = (info.size || 0) > PREVIEW_MAX_HOVER_B;
      if (!info.b64) {
        modoCompact();
        const box = document.createElement("div");
        box.className = "preview-miss";
        box.innerHTML =
          "<span>Só o texto desta peça está carregado.</span>" +
          '<button type="button" class="preview-dl">Abrir documento</button>';
        const btn = box.querySelector(".preview-dl");
        btn.addEventListener("click", async () => {
          if (!previewDlCb) return;
          btn.disabled = true;
          btn.textContent = "Abrindo…";
          previewDlPendente = true;
          try {
            const baixado = await previewDlCb(id);
            if (previewId !== id) return;
            if (baixado) {
              renderPreview(row, baixado);
              const anc = doclist.querySelector('.docrow[data-id="' + CSS.escape(id) + '"]');
              if (anc) posicionarPreview(anc);
            }
          } catch (err) {
            if (previewId === id) box.textContent = "Falha ao abrir: " + ((err && err.message) || err);
          } finally {
            previewDlPendente = false;
          }
        });
        bd.appendChild(box);
        return;
      }
      if (previewCspBloqueado || pesado) {
        modoCompact();
        const box = document.createElement("div");
        box.className = "preview-miss";
        box.textContent = pesado
          ? "PDF grande — use “Abrir em nova aba” para visualizar."
          : "A pré-visualização embutida foi bloqueada pela política de segurança desta página.";
        bd.appendChild(box);
      } else {
        previewUrl = b64ParaBlobUrl(info.b64);
        const em = document.createElement("embed");
        em.type = "application/pdf";
        // COM a toolbar nativa do Chrome: zoom −/+, ajustar à página e
        // navegação de graça (Ctrl+scroll também faz zoom dentro do viewer).
        em.src = previewUrl;
        bd.appendChild(em);
      }
      const ft = document.createElement("div");
      ft.className = "preview-ft";
      ft.innerHTML =
        "<span>" + (info.pages || 1) + " página(s) · " + fmtBytes(info.size) + "</span>" +
        '<button type="button" class="preview-tab">Abrir em nova aba</button>';
      ft.querySelector(".preview-tab").addEventListener("click", () => {
        // posse do URL vai para a nova aba; revoga com folga para ela carregar
        const u = b64ParaBlobUrl(info.b64);
        window.open(u, "_blank");
        setTimeout(() => URL.revokeObjectURL(u), 30000);
      });
      previewEl.appendChild(ft);
    }

    // Abre à direita da row quando cabe (expandido: docs é a coluna esquerda);
    // senão à esquerda (lateral: painel colado à borda direita da janela).
    function posicionarPreview(row) {
      const r = row.getBoundingClientRect();
      // largura REAL quando o usuário já redimensionou o popover (persiste na
      // sessão); oculto (display:none) o offsetWidth é 0 e cai no estimado
      const W = previewEl.offsetWidth || Math.min(520, window.innerWidth * 0.46);
      const cabeDireita = window.innerWidth - r.right >= W + 24;
      previewEl.style.left = cabeDireita
        ? Math.round(r.right + 12) + "px"
        : Math.round(Math.max(8, r.left - W - 12)) + "px";
      const H = previewEl.offsetHeight || Math.min(640, window.innerHeight * 0.82);
      previewEl.style.top =
        Math.round(
          Math.min(Math.max(8, r.top - 40), Math.max(8, window.innerHeight - H - 8))
        ) + "px";
    }

    function showPreview(row) {
      if (!previewCb || !row.isConnected) return;
      // peça nova: volta ao automático (mostrar o que o modelo vê). Manter a
      // aba escolhida na peça anterior faria o popover abrir no "Documento" de
      // uma peça que está indo como texto, contradizendo o próprio princípio.
      if (previewId !== row.dataset.id) previewAba = null;
      previewId = row.dataset.id;
      renderPreview(row, previewCb(previewId));
      posicionarPreview(row); // 1º passe: posição estimada, ainda oculto
      previewEl.hidden = false;
      posicionarPreview(row); // 2º passe: ajusta com a altura real (.compact)
    }

    // Botão do mouse pressionado dentro do popover = usuário redimensionando
    // pela alça nativa (o ponteiro pode escapar do popover no meio do arrasto —
    // fechar aqui sumiria com ele na mão do usuário).
    let previewInteragindo = false;
    previewEl.addEventListener("pointerdown", () => {
      previewInteragindo = true;
    });
    window.addEventListener("pointerup", () => {
      previewInteragindo = false;
    });
    function agendarFecharPreview() {
      clearTimeout(previewHideTimer);
      previewHideTimer = setTimeout(() => {
        if (previewInteragindo) return agendarFecharPreview(); // resize em curso
        if (!previewEl.matches(":hover") && !doclist.matches(":hover")) hidePreview();
      }, 250);
    }

    // mouseover/mouseout borbulham (mouseenter não) — delegação nas rows
    doclist.addEventListener("mouseover", (e) => {
      if (
        !wrap.classList.contains("expanded") &&
        !wrap.classList.contains("lateral") &&
        !wrap.classList.contains("livre")
      )
        return;
      const row = e.target.closest(".docrow");
      if (!row || !previewCb) return;
      clearTimeout(previewHideTimer);
      if (row.dataset.id === previewId && !previewEl.hidden) return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => showPreview(row), PREVIEW_HOVER_MS);
    });
    doclist.addEventListener("mouseout", (e) => {
      const row = e.target.closest(".docrow");
      if (row && !(e.relatedTarget && row.contains(e.relatedTarget)))
        clearTimeout(previewTimer);
      agendarFecharPreview();
    });
    previewEl.addEventListener("mouseenter", () => clearTimeout(previewHideTimer));
    previewEl.addEventListener("mouseleave", agendarFecharPreview);
    // rolar a lista invalida a âncora do popover
    doclist.addEventListener("scroll", hidePreview, { passive: true });
    // Esc fecha só o preview (stopPropagation: não derruba o modo docx junto)
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !previewEl.hidden) {
        hidePreview();
        e.stopPropagation();
      }
    });
    // CSP da página pode barrar <embed> de blob: PDF — detecção real pelo
    // evento de violação (dispara no document dono, mesmo com Shadow DOM).
    document.addEventListener("securitypolicyviolation", (e) => {
      if (
        String(e.blockedURI || "").startsWith("blob") &&
        /object-src|frame-src|default-src|plugin/.test(String(e.violatedDirective || ""))
      ) {
        previewCspBloqueado = true;
        if (previewId && !previewEl.hidden) {
          const row = doclist.querySelector(
            '.docrow[data-id="' + CSS.escape(previewId) + '"]'
          );
          const info = previewCb && previewCb(previewId);
          if (row && info && info.kind === "pdf") renderPreview(row, info);
        }
      }
    });

    // -------------------------------------------------------------------------
    // Busca de peças: filtra a lista pelo título (sem acentos, via norm()).
    // Só esconde/mostra linhas — os checkboxes continuam sendo a fonte de
    // verdade da seleção (peça marcada e filtrada segue marcada).
    // -------------------------------------------------------------------------
    function filtrarDocs() {
      // O filtro muda QUAIS rows são visíveis, e as faixas operam sobre elas:
      // a âncora antiga apontaria para outra peça.
      ancoraSel = -1;
      fecharMenuSel();
      // rows podem sumir/mudar de lugar sob o popover (exceto durante o
      // download do próprio preview — o refresh da timeline passa por aqui)
      if (!previewDlPendente) hidePreview();
      const q = norm(docQ.value.trim());
      let visiveis = 0;
      for (const row of doclist.querySelectorAll(".docrow")) {
        const hit = !q || (row.dataset.busca || "").includes(q);
        row.hidden = !hit;
        if (hit) visiveis++;
      }
      const aviso = doclist.querySelector(".doc-noresult");
      if (aviso) aviso.remove();
      if (q && !visiveis && allDocs.length) {
        const d = document.createElement("div");
        d.className = "empty doc-noresult";
        d.textContent = "Nenhuma peça com esse nome.";
        doclist.appendChild(d);
      }
      docQN.hidden = !q;
      docQN.textContent = q ? visiveis + "/" + allDocs.length : "";
    }
    docQ.addEventListener("input", filtrarDocs);
    docQ.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        docQ.value = "";
        filtrarDocs();
      }
    });

    // -------------------------------------------------------------------------
    // Menção @: digitar "@" abre um popup com as peças; selecionar marca a peça
    // (mesmo estado da lista lateral) e remove o token "@busca" do texto.
    // -------------------------------------------------------------------------
    let mention = null; // {start, end, items:[{id,titulo}], idx}

    function findMentionToken() {
      const pos = inEl.selectionStart;
      const before = inEl.value.slice(0, pos);
      // "@" no início ou após espaço/pontuação de abertura; busca pode ter espaços
      const m = before.match(/(^|[\s([{])@([^@\n]*)$/);
      if (!m) return null;
      return { start: pos - m[2].length - 1, end: pos, query: m[2] };
    }

    function closeMention() {
      mention = null;
      mentionEl.hidden = true;
    }

    const MENTION_MAX = 50; // itens visíveis no popup; o excedente vira aviso

    function updateMention() {
      const tok = findMentionToken();
      if (!tok || !allDocs.length) return closeMention();
      const q = norm(tok.query.trim());
      const all = allDocs.filter((d) => !q || norm(d.titulo).includes(q));
      // Busca sem resultado NÃO fecha o popup na hora (o campo de busca
      // sumir no meio da digitação parecia travamento) — mostra o estado
      // vazio. MAS: se a query sem resultado passa de 20 chars, o usuário
      // está escrevendo a frase (um "@" que não é peça), não buscando —
      // aí sim o popup fecha e para de re-renderizar a cada tecla.
      if (!all.length && tok.query.trim().length > 20) return closeMention();
      const items = all.slice(0, MENTION_MAX);
      const prevId =
        mention && mention.items[mention.idx] ? mention.items[mention.idx].id : null;
      const keepIdx = items.findIndex((d) => d.id === prevId);
      mention = {
        start: tok.start,
        end: tok.end,
        items,
        extra: all.length - items.length,
        idx: keepIdx >= 0 ? keepIdx : 0,
        query: tok.query, // CRU (sem trim): o espelho mostra até o espaço final
        total: all.length,
      };
      renderMention();
    }

    function renderMention() {
      const ids = new Set(getSelected());
      // campo de busca visível: espelha o que o usuário digita depois do @
      // (a digitação continua no campo de mensagem — aqui é só o reflexo,
      // com contador de resultados; a mecânica de filtro é a mesma de sempre)
      mentionQT.classList.toggle("vazio", !mention.query);
      mentionQT.textContent =
        mention.query || "digite para buscar pelo nome da peça…";
      // cursor de verdade fica SÓLIDO enquanto se digita e pisca parado:
      // reinicia a animação a cada render (o keyframe começa na fase visível)
      mentionQC.style.animation = "none";
      void mentionQC.offsetWidth; // força o reflow que zera a animação
      mentionQC.style.animation = "";
      mentionQN.textContent =
        mention.total === 0
          ? "nenhuma peça"
          : mention.total === 1
            ? "1 peça"
            : mention.total + " peças";
      mentionList.innerHTML = "";
      if (!mention.items.length) {
        const vazio = document.createElement("div");
        vazio.className = "mrow-more";
        vazio.textContent =
          "Nenhuma peça com esse nome — apague para ver todas (esc fecha).";
        mentionList.appendChild(vazio);
        mentionEl.hidden = false;
        return;
      }
      mention.items.forEach((d, i) => {
        const row = document.createElement("div");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === mention.idx ? "true" : "false");
        row.className =
          "mrow " + categoriaDe(d) +
          (i === mention.idx ? " active" : "") + (ids.has(d.id) ? " on" : "");
        row.innerHTML =
          SVG.doc +
          '<span class="t" title="' + escapeHtml(d.titulo) + '">' +
          escapeHtml(d.titulo) +
          "</span>" +
          (ids.has(d.id)
            ? '<span class="on-badge">' + SVG.check + " no contexto</span>"
            : "");
        // mousedown (não click) para agir antes do blur do textarea
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pickMention(i);
        });
        row.addEventListener("mouseenter", () => {
          if (mention && mention.idx !== i) {
            mention.idx = i;
            renderMention();
          }
        });
        mentionList.appendChild(row);
      });
      if (mention.extra > 0) {
        const more = document.createElement("div");
        more.className = "mrow-more";
        more.textContent =
          "… e mais " + mention.extra + " peças — continue digitando para filtrar";
        mentionList.appendChild(more);
      }
      mentionEl.hidden = false;
      const act = mentionList.querySelector(".mrow.active");
      if (act) act.scrollIntoView({ block: "nearest" });
    }

    function pickMention(i) {
      if (!mention || !mention.items[i]) return;
      const d = mention.items[i];
      const already = new Set(getSelected()).has(d.id);
      // remove o token "@busca" do texto
      const v = inEl.value;
      inEl.value = v.slice(0, mention.start) + v.slice(mention.end);
      const caret = mention.start;
      setDocChecked(d.id, !already); // alterna: marcado sai, desmarcado entra
      syncSelection();
      closeMention();
      autoresize();
      inEl.focus();
      inEl.setSelectionRange(caret, caret);
    }

    // -------------------------------------------------------------------------
    // Biblioteca de prompts: "/" no INÍCIO da mensagem abre o popup com os
    // prompts salvos (PLIB, storage.sync); selecionar remove o token e liga o
    // CHIP na .promptbar — o texto do prompt precede a mensagem só no envio,
    // nunca é despejado no textarea. Gerenciador (CRUD) no modal .plib.
    // -------------------------------------------------------------------------
    const slashEl = $(".slash");
    const slashList = $(".slash-list");
    const slashQT = $(".slash .mq-t");
    const slashQN = $(".slash .mq-n");
    const slashQC = $(".slash .mq-caret");
    const promptbar = $(".promptbar");
    const inrowEl = $(".inrow");
    const btnPlib = $(".btn-plib");
    const plibEl = $(".plib");
    const plibCard = $(".plib-card");
    const plibListEl = $(".plib-list");
    const plibForm = $(".plib-form");
    const plibFT = $(".plib-ft");
    const plibFX = $(".plib-fx");
    const plibCnt = $(".plib-cnt");
    const plibErr = $(".plib-err");

    let promptsLib = []; // espelho ordenado de PLIB.listar
    let slash = null; // {start, end, items, idx, query, total, extra}
    let promptAtivo = null; // {id, titulo, texto} — no máximo UM por mensagem
    let plibEditId = null; // id em edição no form (null = novo)
    let plibIdNovo = ""; // id sorteado para o prompt novo em edição
    let plibDelArm = null; // id com exclusão "armada" (2º clique confirma)

    // PLIB é content script carregado antes deste — mas o harness de teste
    // pode não incluí-lo: sem ele a feature some em silêncio, nada quebra.
    const temPlib = typeof PLIB !== "undefined";
    if (temPlib) {
      PLIB.listar((ps) => {
        promptsLib = ps;
      });
      // mudanças em qualquer aba (ou vindas do sync de outra máquina)
      PLIB.aoMudar((ps) => {
        promptsLib = ps;
        if (slash) updateSlash();
        if (!plibEl.hidden) renderPlibList();
      });
    } else {
      btnPlib.hidden = true;
    }

    function previaDe(texto) {
      const l =
        String(texto || "")
          .split("\n")
          .map((s) => s.trim())
          .find(Boolean) || "";
      return l.length > 90 ? l.slice(0, 90) + "…" : l;
    }

    function closeSlash() {
      slash = null;
      slashEl.hidden = true;
    }

    function keyDeItem(it) {
      return it.tipo === "prompt" ? "p:" + it.p.id : it.tipo;
    }

    function updateSlash() {
      if (!temPlib) return;
      const tok = findSlashToken(inEl.value, inEl.selectionStart);
      if (!tok) return closeSlash();
      const q = norm(tok.query.trim());
      const all = promptsLib.filter((p) => !q || norm(p.titulo).includes(q));
      // mesma regra do popup @: busca sem resultado não fecha na hora (o
      // estado vazio orienta), mas acima de 20 chars o usuário está
      // escrevendo uma frase que começa com "/", não buscando
      if (!all.length && tok.query.trim().length > 20) return closeSlash();
      const items = all
        .slice(0, MENTION_MAX)
        .map((p) => ({ tipo: "prompt", p }));
      // ações fixas no rodapé: salvar o texto atual (quando há texto além
      // do token) e abrir o gerenciador (vira o CTA de criação na 1ª vez)
      const resto = (inEl.value.slice(0, tok.start) + inEl.value.slice(tok.end)).trim();
      if (resto) items.push({ tipo: "salvar" });
      items.push({ tipo: "gerenciar" });
      const prevKey =
        slash && slash.items[slash.idx] ? keyDeItem(slash.items[slash.idx]) : null;
      const keepIdx = items.findIndex((it) => keyDeItem(it) === prevKey);
      slash = {
        start: tok.start,
        end: tok.end,
        items,
        idx: keepIdx >= 0 ? keepIdx : 0,
        query: tok.query, // CRU (sem trim): o espelho mostra até o espaço final
        total: all.length,
        extra: all.length - Math.min(all.length, MENTION_MAX),
      };
      renderSlash();
    }

    function renderSlash() {
      slashQT.classList.toggle("vazio", !slash.query);
      slashQT.textContent = slash.query || "digite para buscar pelo título do prompt…";
      // cursor falso: sólido enquanto digita, piscando parado (igual ao @)
      slashQC.style.animation = "none";
      void slashQC.offsetWidth;
      slashQC.style.animation = "";
      slashQN.textContent =
        slash.total === 0
          ? "nenhum prompt"
          : slash.total === 1
            ? "1 prompt"
            : slash.total + " prompts";
      slashList.innerHTML = "";
      if (slash.total === 0 && slash.query.trim()) {
        const vazio = document.createElement("div");
        vazio.className = "mrow-more";
        vazio.textContent =
          "Nenhum prompt com esse título — apague para ver todos (esc fecha).";
        slashList.appendChild(vazio);
      } else if (slash.total === 0 && !promptsLib.length) {
        const vazio = document.createElement("div");
        vazio.className = "mrow-more";
        vazio.textContent =
          "Você ainda não tem prompts salvos — instruções reutilizáveis que entram no início da mensagem.";
        slashList.appendChild(vazio);
      }
      slash.items.forEach((it, i) => {
        const row = document.createElement("div");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === slash.idx ? "true" : "false");
        if (it.tipo === "prompt") {
          row.className = "mrow srow" + (i === slash.idx ? " active" : "");
          row.innerHTML =
            '<span class="pchip-i" aria-hidden="true">✦</span>' +
            '<span class="scol"><span class="t" title="' + escapeHtml(it.p.titulo) + '">' +
            escapeHtml(it.p.titulo) +
            '</span><span class="mrow-sub">' + escapeHtml(previaDe(it.p.texto)) +
            "</span></span>";
        } else {
          row.className = "mrow mrow-acao" + (i === slash.idx ? " active" : "");
          row.textContent =
            it.tipo === "salvar"
              ? "✚ Salvar o texto atual como prompt…"
              : promptsLib.length
                ? "⚙ Gerenciar prompts…"
                : "✚ Criar seu primeiro prompt…";
        }
        // mousedown (não click) para agir antes do blur do textarea
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pickSlash(i);
        });
        row.addEventListener("mouseenter", () => {
          if (slash && slash.idx !== i) {
            slash.idx = i;
            renderSlash();
          }
        });
        slashList.appendChild(row);
      });
      if (slash.extra > 0) {
        const more = document.createElement("div");
        more.className = "mrow-more";
        more.textContent =
          "… e mais " + slash.extra + " prompts — continue digitando para filtrar";
        slashList.appendChild(more);
      }
      slashEl.hidden = false;
      const act = slashList.querySelector(".mrow.active");
      if (act) act.scrollIntoView({ block: "nearest" });
    }

    function pickSlash(i) {
      if (!slash || !slash.items[i]) return;
      const it = slash.items[i];
      const caret = slash.start;
      // remove o token "/busca" do texto (como o pickMention)
      const v = inEl.value;
      const semToken = v.slice(0, slash.start) + v.slice(slash.end);
      inEl.value = semToken;
      closeSlash();
      autoresize();
      if (it.tipo === "prompt") {
        setPromptAtivo(it.p);
        // devolve o foco ao campo, no lugar onde o token estava
        inEl.focus();
        inEl.setSelectionRange(caret, caret);
      } else if (it.tipo === "salvar") {
        // o modal fica com o foco (o inEl volta a recebê-lo ao fechar)
        abrirPlib({ form: true, texto: semToken.trim() });
      } else {
        abrirPlib(promptsLib.length ? {} : { form: true });
      }
    }

    // Chip do prompt ativo na .promptbar (fundida à caixa de entrada).
    // p = null desliga. A prévia do texto aparece num tooltip CSS no hover.
    function setPromptAtivo(p) {
      promptAtivo = p || null;
      promptbar.innerHTML = "";
      promptbar.hidden = !promptAtivo;
      inrowEl.classList.toggle("com-prompt", !!promptAtivo);
      if (!promptAtivo) return;
      const texto = String(promptAtivo.texto || "");
      const tip = texto.length > 400 ? texto.slice(0, 400) + "…" : texto;
      const chip = document.createElement("span");
      chip.className = "pchip";
      chip.innerHTML =
        '<span class="pchip-i" aria-hidden="true">✦</span>' +
        '<span class="pchip-t" title="' + escapeHtml(promptAtivo.titulo) + '">' +
        escapeHtml(promptAtivo.titulo) + "</span>" +
        '<button class="chip-x pchip-x" title="Remover o prompt da mensagem" aria-label="Remover o prompt ' +
        escapeHtml(promptAtivo.titulo) + ' da mensagem">' + SVG.x + "</button>" +
        '<span class="pchip-tip" aria-hidden="true">' + escapeHtml(tip) + "</span>";
      chip.querySelector(".pchip-x").addEventListener("click", () => setPromptAtivo(null));
      promptbar.appendChild(chip);
      const hint = document.createElement("span");
      hint.className = "promptbar-hint";
      hint.textContent = "enviado no início da mensagem";
      promptbar.appendChild(hint);
    }

    // ----- Gerenciador de prompts (modal .plib) -----
    function abrirPlib(opts) {
      opts = opts || {};
      plibEl.hidden = false;
      plibDelArm = null;
      if (opts.form) abrirPlibForm(null, opts.texto || "");
      else fecharPlibForm();
      renderPlibList();
      if (!opts.form) plibCard.focus();
    }

    function fecharPlib() {
      plibEl.hidden = true;
      fecharPlibForm();
      inEl.focus();
    }

    function abrirPlibForm(p, textoInicial) {
      plibEditId = p ? p.id : null;
      // id do prompt NOVO gerado uma única vez ao abrir o form: o contador
      // de bytes roda a cada tecla e sortear um id a cada chamada seria
      // desperdício (e mediria um tamanho diferente do que será salvo)
      plibIdNovo = p ? null : temPlib ? PLIB.novoId() : "";
      plibFT.value = p ? p.titulo : "";
      plibFX.value = p ? p.texto : textoInicial || "";
      plibErr.textContent = "";
      plibForm.hidden = false;
      plibListEl.hidden = true; // o form substitui a lista (card compacto)
      atualizarPlibCnt();
      plibFT.focus();
    }

    function fecharPlibForm() {
      plibEditId = null;
      plibForm.hidden = true;
      plibListEl.hidden = false;
      plibErr.textContent = "";
    }

    function promptDoForm() {
      const agora = Date.now();
      const antigo = plibEditId && promptsLib.find((x) => x.id === plibEditId);
      return {
        id: plibEditId || plibIdNovo,
        titulo: plibFT.value.trim(),
        texto: plibFX.value.trim(),
        criadoEm: antigo ? antigo.criadoEm : agora,
        atualizadoEm: agora,
      };
    }

    function atualizarPlibCnt() {
      if (!temPlib) return;
      const b = PLIB.bytesDe(promptDoForm());
      const pct = Math.min(999, Math.round((b / PLIB.TETO_BYTES) * 100));
      plibCnt.textContent =
        plibFX.value.length + " caracteres — " + pct + "% do limite de sincronização";
      plibCnt.classList.toggle("estouro", b > PLIB.TETO_BYTES);
    }
    plibFT.addEventListener("input", atualizarPlibCnt);
    plibFX.addEventListener("input", atualizarPlibCnt);
    // Enter no título salva (o texto é multilinha e mantém o Enter próprio)
    plibFT.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        salvarPlibForm();
      }
    });

    function renderPlibList() {
      plibDelArm = null; // re-render desarma qualquer exclusão pendente
      plibListEl.innerHTML = "";
      if (!promptsLib.length) {
        plibListEl.innerHTML =
          '<div class="plib-empty">Nenhum prompt salvo ainda.<br>Clique em <b>✚ Novo</b> para criar o primeiro — depois é só digitar <b>/</b> no campo de mensagem para usá-lo.</div>';
        return;
      }
      for (const p of promptsLib) {
        const row = document.createElement("div");
        row.className = "plib-row";
        row.dataset.id = p.id;
        row.innerHTML =
          '<div class="plib-info"><span class="plib-t" title="' + escapeHtml(p.titulo) + '">' +
          escapeHtml(p.titulo) +
          '</span><span class="plib-prev">' + escapeHtml(previaDe(p.texto)) + "</span></div>" +
          '<div class="plib-acts">' +
          '<button class="plib-use" title="Inserir este prompt na mensagem">usar</button>' +
          '<button class="plib-edit" title="Editar este prompt">editar</button>' +
          '<button class="plib-del" title="Excluir este prompt">excluir</button></div>';
        plibListEl.appendChild(row);
      }
    }

    // ações DELEGADAS na lista (as rows são recriadas a cada render)
    plibListEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      const row = e.target.closest(".plib-row");
      if (!btn || !row) return;
      const p = promptsLib.find((x) => x.id === row.dataset.id);
      if (!p) return;
      if (btn.classList.contains("plib-use")) {
        fecharPlib();
        setPromptAtivo(p);
      } else if (btn.classList.contains("plib-edit")) {
        abrirPlibForm(p);
      } else if (btn.classList.contains("plib-del")) {
        // exclusão em DOIS cliques (nunca confirm() nativo — o dialog da
        // página fica fora do Shadow DOM e congela a extensão)
        if (plibDelArm !== p.id) {
          // desarma o botão de outra linha (senão dois ficariam "excluir?")
          plibListEl.querySelectorAll(".plib-del.arm").forEach((b) => {
            b.textContent = "excluir";
            b.classList.remove("arm");
          });
        }
        if (plibDelArm === p.id) {
          plibDelArm = null;
          PLIB.excluir(p.id, () => {
            // atualização otimista; o storage.onChanged confirma em seguida
            promptsLib = promptsLib.filter((x) => x.id !== p.id);
            renderPlibList();
          });
        } else {
          plibDelArm = p.id;
          btn.textContent = "excluir?";
          btn.classList.add("arm");
        }
      }
    });

    function salvarPlibForm() {
      const p = promptDoForm();
      if (!p.titulo) {
        plibErr.textContent = "Dê um título ao prompt.";
        plibFT.focus();
        return;
      }
      if (!p.texto) {
        plibErr.textContent = "Escreva o texto do prompt.";
        plibFX.focus();
        return;
      }
      PLIB.salvar(p, (erro) => {
        if (erro) {
          plibErr.textContent = "Não foi possível salvar: " + erro;
          return;
        }
        // atualização otimista (o storage.onChanged confirma em seguida)
        promptsLib = promptsLib
          .filter((x) => x.id !== p.id)
          .concat(p)
          .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
        fecharPlibForm();
        renderPlibList();
      });
    }
    plibCard.querySelector(".plib-save").addEventListener("click", salvarPlibForm);
    plibCard.querySelector(".plib-cancel").addEventListener("click", fecharPlibForm);
    // "✚ Novo" aproveita o que já está escrito no campo como ponto de
    // partida (o caso real: a pessoa redigiu a instrução e só então
    // percebeu que quer guardá-la) — o campo de mensagem não é alterado
    plibCard
      .querySelector(".plib-new")
      .addEventListener("click", () => abrirPlibForm(null, inEl.value.trim()));
    plibCard.querySelector(".plib-close").addEventListener("click", fecharPlib);
    // clique no fundo escuro fecha (padrão de modal)
    plibEl.addEventListener("click", (e) => {
      if (e.target === plibEl) fecharPlib();
    });
    // Esc dentro do modal: fecha o form (se aberto) ou o modal — e NÃO vaza
    // para o Esc do painel (que cancelaria o modo docx junto)
    plibCard.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (!plibForm.hidden) fecharPlibForm();
      else fecharPlib();
    });
    btnPlib.addEventListener("click", () =>
      abrirPlib(promptsLib.length ? {} : { form: true })
    );

    // ----- Biblioteca de MODELOS (peças-modelo, MLIB/storage.local) ----------
    // Irmã do PLIB, com dois papéis: (1) o modal .mlib faz o CRUD (título,
    // categoria, descrição, texto); (2) o seletor da .minutabar escolhe uma
    // CATEGORIA e, ao gerar a minuta, TODAS as peças-modelo daquela espécie
    // (até um teto) vão ao request numa moldura XML (content.js): a IA analisa,
    // escolhe a base mais adequada e pode aproveitar estrutura e linguajar das
    // outras — mas os FATOS saem só das peças do processo, NUNCA dos modelos.
    // Ao contrário do prompt, um modelo não é despejado no textarea: ele só
    // acompanha o turno da minuta.
    const btnMlib = $(".btn-mlib");
    const BTN_MLIB_TITLE_ON = btnMlib ? btnMlib.title : ""; // título de HTML (reusado ao reabilitar)
    const mlibEl = $(".mlib");
    const mlibCard = $(".mlib-card");
    const mlibListEl = $(".mlib-list");
    const mlibForm = $(".mlib-form");
    const mlibFT = $(".mlib-ft");
    const mlibFC = $(".mlib-fc");
    const mlibFD = $(".mlib-fd");
    const mlibFX = $(".mlib-fx");
    const mlibCnt = $(".mlib-cnt");
    const mlibErr = $(".mlib-err");
    const minutaModeloWrap = $(".minuta-modelo");
    const minutaModeloSel = $(".minuta-modelo-sel");

    let modelosLib = []; // espelho ordenado de MLIB.listar
    let mlibEditId = null;
    let mlibIdNovo = "";
    let mlibDelArm = null;
    // A biblioteca de modelos só faz sentido em modelos de 1M tokens (a minuta
    // manda os autos inteiros + vários modelos): setModelosHabilitado, chamado
    // pelo content.js quando as caps chegam, desliga a feature nos menores
    // (Haiku). Começa true para não sumir no harness de teste (sem caps).
    let modelosHabilitado = true;

    // MLIB é content script carregado antes deste; o harness de teste pode não
    // incluí-lo — sem ele a feature some em silêncio, nada quebra.
    const temMlib = typeof MLIB !== "undefined";
    if (temMlib) {
      // popula o <select> de categoria do form uma única vez
      for (const c of MLIB.CATEGORIAS) {
        const op = document.createElement("option");
        op.value = c.valor;
        op.textContent = c.rotulo;
        mlibFC.appendChild(op);
      }
      MLIB.listar((ms) => {
        modelosLib = ms;
        if (minutaMode) atualizarSeletorMinuta(true);
      });
      MLIB.aoMudar((ms) => {
        modelosLib = ms;
        if (!mlibEl.hidden) renderMlibList();
        if (minutaMode) atualizarSeletorMinuta(true);
      });
    } else {
      if (btnMlib) btnMlib.hidden = true;
      if (minutaModeloWrap) minutaModeloWrap.hidden = true;
    }

    // Detecção da espécie a partir da instrução, para PRÉ-selecionar a
    // categoria no seletor. Espelha o agrupamento de MINUTA_ESPECIE
    // (content.js); é só uma conveniência de UI (o usuário pode trocar).
    function detectarCategoria(texto) {
      const s = norm(String(texto || ""));
      if (/\bsentenc/.test(s)) return "sentenca";
      if (/\bdespacho/.test(s)) return "despacho";
      if (/\b(decisao|decisoes|voto|acordao|acordaos|liminar|tutela)\b/.test(s)) return "decisao";
      if (/\b(ata|audiencia|termo de audiencia)\b/.test(s)) return "ata";
      if (/\boficio/.test(s)) return "oficio";
      if (/\b(mandado|alvara)\b/.test(s)) return "mandado";
      return null;
    }

    // Reconstrói o <select> do modo minuta: uma opção por CATEGORIA que tenha
    // modelos, com a contagem. Preserva a escolha MANUAL anterior; sem ela,
    // pré-seleciona pela categoria detectada na instrução.
    function popularSeletorModelos(preselCat) {
      if (!minutaModeloSel) return;
      const anterior = minutaModeloSel.value; // valor = categoria
      minutaModeloSel.innerHTML = "";
      const nenhum = document.createElement("option");
      nenhum.value = "";
      nenhum.textContent = "— nenhum (estilo padrão) —";
      minutaModeloSel.appendChild(nenhum);
      const comModelo = new Set();
      for (const cat of MLIB.CATEGORIAS) {
        const n = modelosLib.filter((m) => (m.categoria || "outro") === cat.valor).length;
        if (!n) continue;
        comModelo.add(cat.valor);
        const op = document.createElement("option");
        op.value = cat.valor;
        op.textContent = cat.rotulo + " (" + n + ")";
        minutaModeloSel.appendChild(op);
      }
      if (anterior && comModelo.has(anterior)) minutaModeloSel.value = anterior;
      else if (preselCat && comModelo.has(preselCat)) minutaModeloSel.value = preselCat;
      // sem categoria detectada e só UMA categoria com modelos: pré-seleciona
      // essa — a feature "acontece" sem exigir um clique a mais (o usuário
      // ainda pode voltar para "nenhum")
      else if (comModelo.size === 1) minutaModeloSel.value = comModelo.values().next().value;
      else minutaModeloSel.value = "";
    }

    // Modelos enviados por minuta: TODOS os da categoria escolhida, do mais
    // recente ao mais antigo, até dois tetos — nº de modelos e total de
    // caracteres (guarda de contexto: a minuta não tem pré-voo de tokens). O
    // primeiro modelo sempre entra, mesmo acima do teto de caracteres.
    const MODELOS_MAX_ENVIO = 12;
    const MODELOS_TETO_CHARS = 180000; // ~45 mil tokens no total
    function modelosMinutaSelecionados() {
      if (!minutaModeloSel || !minutaModeloWrap || minutaModeloWrap.hidden) return [];
      const cat = minutaModeloSel.value;
      if (!cat) return [];
      const doGrupo = modelosLib
        .filter((m) => (m.categoria || "outro") === cat && m.texto)
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      const out = [];
      let chars = 0;
      for (const m of doGrupo) {
        if (out.length >= MODELOS_MAX_ENVIO) break;
        const tam = String(m.texto).length;
        if (out.length && chars + tam > MODELOS_TETO_CHARS) break;
        out.push(m);
        chars += tam;
      }
      // "sem cap silencioso": avisa no console quando corta modelos da categoria
      if (doGrupo.length > out.length) {
        try {
          console.info(
            "[PJe IA] minuta: enviando " + out.length + " de " + doGrupo.length +
              " modelos da categoria (teto de contexto)."
          );
        } catch (e) {}
      }
      return out;
    }

    // Mostra/esconde e popula o seletor conforme o modo minuta, a existência de
    // modelos e o modelo ativo (só 1M). Chamada por setMinutaMode, pelo aoMudar
    // do MLIB e por setModelosHabilitado.
    function atualizarSeletorMinuta(on) {
      if (!minutaModeloWrap) return;
      if (!on || !temMlib || !modelosHabilitado || !modelosLib.length) {
        minutaModeloWrap.hidden = true;
        return;
      }
      popularSeletorModelos(detectarCategoria(inEl.value));
      minutaModeloWrap.hidden = false;
    }

    // Liga/desliga toda a feature de modelos conforme a janela do modelo ativo
    // (1M tokens). Em vez de SUMIR nos menores (o usuário ficaria sem saber por
    // quê), o botão do CRUD fica DESABILITADO com tooltip explicando; o seletor
    // da minuta some (o botão já é a explicação) e o modal fecha se aberto.
    // O texto NÃO lista modelos por nome de propósito: o gate é por capacidade
    // (janela de 1M) e o catálogo muda — uma lista aqui envelheceria calada.
    const BTN_MLIB_TITLE_OFF =
      "A biblioteca de modelos precisa de uma janela de 1 milhão de tokens: a minuta " +
      "manda os autos inteiros e ainda os seus modelos. O modelo de IA ativo tem uma " +
      "janela menor — troque nas opções da extensão para usá-la.";
    function setModelosHabilitado(on) {
      modelosHabilitado = !!on;
      if (btnMlib) {
        btnMlib.hidden = !temMlib; // some só no harness sem MLIB
        btnMlib.disabled = temMlib && !modelosHabilitado;
        if (temMlib && !modelosHabilitado) btnMlib.title = BTN_MLIB_TITLE_OFF;
        else if (temMlib) btnMlib.title = BTN_MLIB_TITLE_ON;
      }
      if (!modelosHabilitado && mlibEl && !mlibEl.hidden) fecharMlib();
      if (minutaMode) atualizarSeletorMinuta(true);
    }

    // ----- Gerenciador de modelos (modal .mlib) -----
    function abrirMlib(opts) {
      opts = opts || {};
      mlibEl.hidden = false;
      mlibDelArm = null;
      if (opts.form) abrirMlibForm(null);
      else fecharMlibForm();
      renderMlibList();
      if (!opts.form) mlibCard.focus();
    }

    function fecharMlib() {
      mlibEl.hidden = true;
      fecharMlibForm();
      inEl.focus();
    }

    function abrirMlibForm(m) {
      mlibEditId = m ? m.id : null;
      mlibIdNovo = m ? null : temMlib ? MLIB.novoId() : "";
      mlibFT.value = m ? m.titulo : "";
      mlibFC.value = m ? m.categoria || "outro" : "sentenca";
      mlibFD.value = m ? m.descricao || "" : "";
      mlibFX.value = m ? m.texto : "";
      mlibErr.textContent = "";
      mlibForm.hidden = false;
      mlibListEl.hidden = true;
      atualizarMlibCnt();
      mlibFT.focus();
    }

    function fecharMlibForm() {
      mlibEditId = null;
      mlibForm.hidden = true;
      mlibListEl.hidden = false;
      mlibErr.textContent = "";
    }

    function modeloDoForm() {
      const agora = Date.now();
      const antigo = mlibEditId && modelosLib.find((x) => x.id === mlibEditId);
      return {
        id: mlibEditId || mlibIdNovo,
        titulo: mlibFT.value.trim(),
        categoria: mlibFC.value || "outro",
        descricao: mlibFD.value.trim(),
        texto: mlibFX.value.trim(),
        criadoEm: antigo ? antigo.criadoEm : agora,
        atualizadoEm: agora,
      };
    }

    function atualizarMlibCnt() {
      if (!temMlib) return;
      const b = MLIB.bytesDe(modeloDoForm());
      const pct = Math.min(999, Math.round((b / MLIB.TETO_BYTES) * 100));
      mlibCnt.textContent = mlibFX.value.length + " caracteres — " + pct + "% do limite";
      mlibCnt.classList.toggle("estouro", b > MLIB.TETO_BYTES);
    }
    if (temMlib) {
      mlibFT.addEventListener("input", atualizarMlibCnt);
      mlibFD.addEventListener("input", atualizarMlibCnt);
      mlibFX.addEventListener("input", atualizarMlibCnt);
      // Enter no título salva (o texto é multilinha e mantém o Enter próprio)
      mlibFT.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          salvarMlibForm();
        }
      });
    }

    function renderMlibList() {
      mlibDelArm = null;
      mlibListEl.innerHTML = "";
      if (!modelosLib.length) {
        mlibListEl.innerHTML =
          '<div class="plib-empty">Nenhum modelo cadastrado ainda.<br>Clique em <b>✚ Novo</b> para cadastrar sua primeira peça-modelo — depois, ao gerar uma minuta, escolha a categoria em <b>Seguir modelos</b>.</div>';
        return;
      }
      for (const m of modelosLib) {
        const row = document.createElement("div");
        row.className = "plib-row";
        row.dataset.id = m.id;
        const prev = m.descricao || previaDe(m.texto);
        row.innerHTML =
          '<div class="plib-info"><span class="plib-t" title="' + escapeHtml(m.titulo) + '">' +
          '<span class="mlib-cat">' + escapeHtml(MLIB.rotuloCategoria(m.categoria)) + "</span>" +
          escapeHtml(m.titulo) +
          '</span><span class="plib-prev">' + escapeHtml(prev) + "</span></div>" +
          '<div class="plib-acts">' +
          '<button class="mlib-edit" title="Editar este modelo">editar</button>' +
          '<button class="mlib-del plib-del" title="Excluir este modelo">excluir</button></div>';
        mlibListEl.appendChild(row);
      }
    }

    // ações DELEGADAS na lista (as rows são recriadas a cada render)
    mlibListEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      const row = e.target.closest(".plib-row");
      if (!btn || !row) return;
      const m = modelosLib.find((x) => x.id === row.dataset.id);
      if (!m) return;
      if (btn.classList.contains("mlib-edit")) {
        abrirMlibForm(m);
      } else if (btn.classList.contains("mlib-del")) {
        // exclusão em DOIS cliques (nunca confirm() nativo — congela a página)
        if (mlibDelArm !== m.id) {
          mlibListEl.querySelectorAll(".mlib-del.arm").forEach((b) => {
            b.textContent = "excluir";
            b.classList.remove("arm");
          });
        }
        if (mlibDelArm === m.id) {
          mlibDelArm = null;
          MLIB.excluir(m.id, () => {
            modelosLib = modelosLib.filter((x) => x.id !== m.id);
            renderMlibList();
          });
        } else {
          mlibDelArm = m.id;
          btn.textContent = "excluir?";
          btn.classList.add("arm");
        }
      }
    });

    function salvarMlibForm() {
      const m = modeloDoForm();
      if (!m.titulo) {
        mlibErr.textContent = "Dê um título ao modelo.";
        mlibFT.focus();
        return;
      }
      if (!m.texto) {
        mlibErr.textContent = "Cole o texto da peça-modelo.";
        mlibFX.focus();
        return;
      }
      MLIB.salvar(m, (erro) => {
        if (erro) {
          mlibErr.textContent = "Não foi possível salvar: " + erro;
          return;
        }
        modelosLib = modelosLib
          .filter((x) => x.id !== m.id)
          .concat(m)
          .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
        fecharMlibForm();
        renderMlibList();
      });
    }
    if (temMlib) {
      mlibCard.querySelector(".mlib-save").addEventListener("click", salvarMlibForm);
      mlibCard.querySelector(".mlib-cancel").addEventListener("click", fecharMlibForm);
      mlibCard.querySelector(".mlib-new").addEventListener("click", () => abrirMlibForm(null));
      mlibCard.querySelector(".mlib-close").addEventListener("click", fecharMlib);
      mlibEl.addEventListener("click", (e) => {
        if (e.target === mlibEl) fecharMlib();
      });
      // Esc no modal: fecha o form (se aberto) ou o modal — e NÃO vaza para o
      // Esc do painel (que cancelaria o modo minuta junto)
      mlibCard.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        if (!mlibForm.hidden) fecharMlibForm();
        else fecharMlib();
      });
      btnMlib.addEventListener("click", () =>
        abrirMlib(modelosLib.length ? {} : { form: true })
      );
    }

    inEl.addEventListener("input", () => {
      autoresize();
      updateMention();
      updateSlash();
    });
    // o caret pode mudar sem input (clique, setas, Home/End) — reavalia o token
    inEl.addEventListener("click", () => {
      updateMention();
      updateSlash();
    });
    inEl.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        updateMention();
        updateSlash();
      }
    });
    inEl.addEventListener("blur", () =>
      setTimeout(() => {
        closeMention();
        closeSlash();
      }, 120)
    );

    let sendCb = null;
    let configureCb = null;
    function doSend() {
      // prompt salvo ativo (chip) PRECEDE o texto digitado — a combinação
      // acontece aqui, no painel: o content script recebe o texto final e o
      // protocolo/histórico não mudam em nada
      const t = montarTextoEnvio(promptAtivo && promptAtivo.texto, inEl.value);
      // No modo minuta, Enviar/Enter geram a minuta (instrução vazia cai na
      // padrão, tratada pelo content script) — nunca viram mensagem de chat.
      if (minutaMode) {
        if (!minutaCb) return;
        const sel = getSelected();
        if (!sel.length) {
          statusEl.textContent = "Marque as peças que devem embasar a minuta.";
          return;
        }
        // lê os modelos da categoria ANTES de desligar o modo (o seletor some)
        const modelos = modelosMinutaSelecionados();
        setMinutaMode(false);
        minutaCb(t, sel, modelos);
        inEl.value = "";
        inEl.style.height = "auto";
        setPromptAtivo(null); // consumido no envio
        closeMention();
        closeSlash();
        return;
      }
      // Idem no modo mapa mental: Enviar/Enter geram o mapa, nunca uma
      // mensagem de chat.
      if (mapaMode) {
        if (!mapaCb) return;
        const sel = getSelected();
        if (!sel.length) {
          statusEl.textContent = "Marque as peças que devem embasar o mapa mental.";
          return;
        }
        setMapaMode(false);
        mapaCb(t, sel);
        inEl.value = "";
        inEl.style.height = "auto";
        setPromptAtivo(null); // consumido no envio
        closeMention();
        closeSlash();
        return;
      }
      if (!sendCb) return;
      if (!t.trim()) return; // com chip ativo t nunca é vazio: chip sozinho envia
      sendCb(t, getSelected());
      inEl.value = "";
      inEl.style.height = "auto";
      setPromptAtivo(null); // consumido no envio
      closeMention();
      closeSlash();
    }
    sendBtn.addEventListener("click", doSend);
    inEl.addEventListener("keydown", (e) => {
      if (slash && !slashEl.hidden) {
        const n = slash.items.length;
        // sem prompt casando com a busca (query não-vazia), só o Esc é
        // capturado — Enter envia a mensagem que começa com "/" literal
        // (as ações fixas continuam clicáveis pelo mouse)
        const navegavel = slash.total > 0 || !slash.query.trim();
        if (navegavel && e.key === "ArrowDown") {
          e.preventDefault();
          slash.idx = (slash.idx + 1) % n;
          renderSlash();
          return;
        }
        if (navegavel && e.key === "ArrowUp") {
          e.preventDefault();
          slash.idx = (slash.idx - 1 + n) % n;
          renderSlash();
          return;
        }
        if (navegavel && (e.key === "Enter" || e.key === "Tab")) {
          e.preventDefault();
          pickSlash(slash.idx);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeSlash();
          return;
        }
      }
      if (mention && !mentionEl.hidden) {
        const n = mention.items.length;
        // com a lista VAZIA (busca sem resultado) só o Esc é capturado —
        // setas movem o caret e Enter envia normalmente (impedir o envio
        // bloquearia mensagens com "@algo" que não é peça)
        if (n && e.key === "ArrowDown") {
          e.preventDefault();
          mention.idx = (mention.idx + 1) % n;
          renderMention();
          return;
        }
        if (n && e.key === "ArrowUp") {
          e.preventDefault();
          mention.idx = (mention.idx - 1 + n) % n;
          renderMention();
          return;
        }
        if (n && (e.key === "Enter" || e.key === "Tab")) {
          e.preventDefault();
          pickMention(mention.idx);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeMention();
          return;
        }
      }
      // Esc com o popup @ fechado cancela o modo minuta / mapa mental
      if (e.key === "Escape" && (minutaMode || mapaMode)) {
        e.preventDefault();
        if (minutaMode) setMinutaMode(false);
        if (mapaMode) setMapaMode(false);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    // -------------------------------------------------------------------------
    // Card de preparo: progresso por peça enquanto os PDFs são baixados.
    // -------------------------------------------------------------------------
    let prepEl = null;
    let prepTotal = 0;
    let prepDone = 0;
    let prepOpts = {};

    // opts (todos opcionais, e os padrões reproduzem o comportamento original):
    //   titulo     — cabeçalho enquanto corre ("Preparando peças…")
    //   fim        — texto de conclusão; recebe o total ("N peças anexadas…")
    //   onCancelar — quando presente, acrescenta um botão Cancelar. Só faz
    //                sentido em lotes longos (exportação): o preparo de um
    //                envio dura segundos e um botão ali seria ruído.
    function startPrep(items, opts) {
      endPrep(true);
      clearEmptyHint();
      prepOpts = opts || {};
      prepTotal = items.length;
      prepDone = 0;
      prepEl = document.createElement("div");
      prepEl.className = "prep";
      let rows = "";
      for (const d of items) {
        rows +=
          '<div class="prep-row" data-id="' + escapeHtml(d.id) + '">' +
          '<span class="prep-ic wait"></span>' +
          '<span class="t" title="' + escapeHtml(d.titulo) + '">' +
          escapeHtml(tituloCurto(d.titulo)) +
          "</span></div>";
      }
      prepEl.innerHTML =
        '<div class="prep-hd"><span class="prep-spin"></span><span class="prep-ttl">' +
        escapeHtml(prepOpts.titulo || "Preparando peças…") +
        "</span>" +
        '<span class="prep-n">0/' + prepTotal + "</span>" +
        (prepOpts.onCancelar
          ? '<button type="button" class="prep-cancel" title="Interrompe a exportação">Cancelar</button>'
          : "") +
        "</div>" +
        '<div class="prep-list">' + rows + "</div>" +
        '<div class="prep-bar"><i></i></div>';
      if (prepOpts.onCancelar) {
        prepEl.querySelector(".prep-cancel").addEventListener("click", (ev) => {
          ev.target.disabled = true;
          ev.target.textContent = "Cancelando…";
          prepOpts.onCancelar();
        });
      }
      msgs.appendChild(prepEl);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function setPrepState(id, state) {
      if (!prepEl) return;
      const row = prepEl.querySelector('.prep-row[data-id="' + CSS.escape(id) + '"]');
      if (!row) return;
      const ic = row.querySelector(".prep-ic");
      ic.className = "prep-ic " + state;
      ic.innerHTML = state === "done" ? SVG.check : "";
      // "erro" também ADIANTA o contador: a peça terminou de ser tentada. Sem
      // isso a barra de uma exportação com falhas nunca chegaria ao fim, e o
      // usuário ficaria olhando um progresso travado sem saber que acabou.
      if (state === "done" || state === "erro") {
        prepDone++;
        prepEl.querySelector(".prep-n").textContent = prepDone + "/" + prepTotal;
        prepEl.querySelector(".prep-bar i").style.width =
          Math.round((prepDone / prepTotal) * 100) + "%";
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    function endPrep(immediate) {
      if (!prepEl) return;
      const el = prepEl;
      prepEl = null;
      if (immediate) {
        el.remove();
        return;
      }
      // confirma visualmente e recolhe
      const btnCancel = el.querySelector(".prep-cancel");
      if (btnCancel) btnCancel.remove();
      el.querySelector(".prep-ttl").textContent = prepOpts.fim
        ? prepOpts.fim(prepTotal, prepDone)
        : prepTotal === 1
          ? "Peça anexada à conversa"
          : prepTotal + " peças anexadas à conversa";
      el.querySelector(".prep-spin").outerHTML =
        '<span class="prep-okic">' + SVG.check + "</span>";
      el.classList.add("ok");
      setTimeout(() => {
        el.classList.add("fade");
        setTimeout(() => el.remove(), 350);
      }, 1100);
    }

    // Overlay "configure sua chave"
    let needkeyEl = null;
    function setConfigured(ok) {
      if (ok) {
        if (needkeyEl) {
          needkeyEl.remove();
          needkeyEl = null;
        }
        docsBox.style.display = "";
        ft.style.display = "";
        showEmptyHint();
        return;
      }
      docsBox.style.display = "none";
      ft.style.display = "none";
      clearEmptyHint();
      if (!needkeyEl) {
        needkeyEl = document.createElement("div");
        needkeyEl.className = "needkey";
        needkeyEl.innerHTML =
          '<div class="k">Configure sua chave</div><p>Para usar o assistente, informe sua chave de API — da Anthropic (modelos Claude) ou do Google (modelos Gemini), conforme o modelo escolhido.</p><button>Abrir configuração</button>';
        needkeyEl
          .querySelector("button")
          .addEventListener("click", () => configureCb && configureCb());
        msgs.appendChild(needkeyEl);
      }
    }

    return {
      open,
      onSend(cb) {
        sendCb = cb;
      },
      onConfigure(cb) {
        configureCb = cb;
      },
      onReset(cb) {
        resetCb = cb;
      },
      // Notifica quando o usuário marca/desmarca peças (ids selecionados).
      onSelectionChange(cb) {
        selChangeCb = cb;
      },
      // Clique no botão "ver na timeline" de uma peça (recebe o id).
      onVerNaTimeline(cb) {
        verTimelineCb = cb;
      },
      // Botão "Carregar todas as peças" da dica sob a lista.
      onCarregarTimeline(cb) {
        carregarTLCb = cb;
      },
      // Botão "Baixar .zip" da mesma faixa. cb(docs, {todas}) — `docs` já vem
      // resolvido (marcadas, ou todas quando nada está marcado) e `todas` diz
      // qual dos dois caminhos foi tomado, para o content script informar.
      onExportarZip(cb) {
        zipCb = cb;
      },
      // Trava/destrava o botão durante a exportação.
      setZipOcupado,
      // Estado da dica: {texto, carregando}. Sem argumento volta ao padrão.
      setTimelineTip,
      // Preview no hover: cb SÍNCRONO que devolve o conteúdo em cache ou null
      // ({kind:"pdf", b64, size, pages} | {kind:"text", text}) — nunca baixa.
      onPreview(cb) {
        previewCb = cb;
      },
      // Botão "Baixar" do preview em cache-miss: cb assíncrono (PJE.baixar).
      onPreviewBaixar(cb) {
        previewDlCb = cb;
      },
      setConfigured,
      clearMessages() {
        msgs.innerHTML = "";
        hintEl = null;
        needkeyEl = null;
        prepEl = null;
        transcript.length = 0;
        setMinutaMode(false); // nova conversa desliga os modos minuta…
        setMapaMode(false); // …e mapa mental
        setPromptAtivo(null); // e solta o chip de prompt salvo
        statusEl.textContent = "";
        alertEl.hidden = true;
        alertEl.innerHTML = "";
        showEmptyHint();
      },
      setDocs(docs) {
        // rows serão recriadas — fecha o popover (nó morto), SALVO durante o
        // download do preview: a ativação JSF do PJe re-dispara setDocs e
        // fecharia o popover "Baixando…" na cara do usuário
        if (!previewDlPendente) hidePreview();
        const cur = new Set(getSelected());
        allDocs = docs.slice();
        doclist.innerHTML = "";
        for (const d of docs) {
          const p = partesTitulo(d.titulo);
          const row = document.createElement("label");
          row.className = "docrow " + categoriaDe(d);
          row.dataset.busca = norm(d.titulo); // índice da busca (sem acentos)
          row.dataset.id = d.id; // usado pelo preview e pelo "ver na timeline"
          row.innerHTML =
            `<input type="checkbox" value="${escapeHtml(d.id)}">` +
            '<span class="d-dot" aria-hidden="true"></span>' +
            `<span class="d-t" title="${escapeHtml(d.titulo)}">` +
            `<span class="d-nm">${escapeHtml(p.nome)}</span>` +
            (p.id ? `<span class="d-id">${p.id}</span>` : "") +
            "</span>" +
            // Marca da peça que JÁ vai como texto — irmã de .d-t com flex:none.
            // DENTRO do .d-t ela roubaria largura do nome e mataria a elipse.
            // É o ÚNICO estado que vira marca permanente: mudou o que o modelo
            // recebe, e o usuário precisa ver isso ao revisar a seleção.
            '<span class="d-emtexto" hidden></span>' +
            // Formato do arquivo (PDF/HTML/RTF). Só o PDF aceita OCR — HTML e
            // RTF do editor do PJe JÁ são texto —, então mostrar o formato é o
            // que torna óbvio, sem ler nada, onde a extração faz sentido. Fica
            // vazio até a peça ser baixada: o formato só se conhece pelo
            // content-type e pela assinatura no binário.
            '<span class="d-fmt" hidden></span>' +
            '<button type="button" class="d-extrai" hidden title="Extrair o texto desta peça" aria-label="Extrair o texto desta peça">' +
            SVG.extrair + "</button>" +
            '<button type="button" class="d-ver" title="Ver esta peça na linha do tempo do processo" aria-label="Localizar esta peça na linha do tempo">' +
            SVG.ver + "</button>";
          if (cur.has(d.id)) row.querySelector("input").checked = true;
          doclist.appendChild(row);
        }
        if (!docs.length) {
          doclist.innerHTML = '<div class="empty">Nenhuma peça encontrada nesta tela.</div>';
        }
        filtrarDocs(); // re-aplica a busca ativa à lista recém-renderizada
        syncSelection();
        // As rows acabaram de ser recriadas: o glifo de "vai como texto" e o
        // botão de extrair vivem num Map do painel, não no DOM, justamente
        // para sobreviverem a este re-render (que o MutationObserver da
        // timeline do PJe dispara a cada refresh).
        aplicarExtracaoNasRows();
        // A lista foi recriada: os índices da seleção em faixa não valem mais.
        ancoraSel = -1;
        fecharMenuSel();
        if (mention) updateMention(); // popup aberto: reflete a lista atualizada
      },
      // Estado da extração vindo do content script: { [id]: {usando, fonte,
      // paginas} }. Só as peças que JÁ vão como texto aparecem aqui.
      setExtracaoEstado(mapa) {
        extracaoEstado = mapa || {};
        aplicarExtracaoNasRows();
        // O pacote de texto só faz sentido quando existe texto: sem isso o
        // botão seria mais uma coisa na faixa que não resolve nada.
        tipZipT.hidden = !Object.keys(extracaoEstado).length;
      },
      onExportarTexto(cb) {
        zipTextoCb = cb;
      },
      setZipTextoOcupado(on) {
        tipZipT.disabled = !!on;
        tipZipT.textContent = on ? "Baixando…" : "⬇ Texto";
      },
      setExtracaoAviso,
      // (id) -> {podeExtrair, imagens, escaneado} | null. SÍNCRONO, como o
      // onPreview: é consultado a cada re-render das rows.
      onExtraivel(cb) {
        extraivelCb = cb;
      },
      onExtrair(cb) {
        extrairCb = cb;
      },
      onExtrairLote(cb) {
        extrairLoteCb = cb;
      },
      onDesfazerExtracao(cb) {
        desfazerExtracaoCb = cb;
      },
      onAbrirTexto(cb) {
        abrirTextoCb = cb;
      },
      // attachments: títulos das peças anexadas neste turno (opcional)
      addMessage(role, text, attachments) {
        clearEmptyHint();
        const el = document.createElement("div");
        el.className = "msg " + role;
        el.__entry = { role, text: text || "" };
        transcript.push(el.__entry);
        if (role === "assistant") {
          if (text) {
            estruturaAssistant(el).__body.innerHTML = renderMd(text);
          } else {
            // aguardando o modelo: indicador de digitação
            el.classList.add("typing");
            el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
          }
        } else {
          const txt = document.createElement("div");
          txt.className = "txt";
          txt.textContent = text;
          el.appendChild(txt);
          if (attachments && attachments.length) {
            const at = document.createElement("div");
            at.className = "msg-atts";
            for (const t of attachments) {
              const c = document.createElement("span");
              c.className = "chip-mini";
              c.innerHTML =
                SVG.doc + "<span title=\"" + escapeHtml(t) + "\">" +
                escapeHtml(tituloCurto(t)) + "</span>";
              at.appendChild(c);
            }
            el.appendChild(at);
          }
        }
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
        return el;
      },
      // cites: [{label, url?, id?, trecho?}] — citações do turno; viram
      // sobrescritos [n] no texto e uma lista numerada de fontes no rodapé da
      // bolha. Com `id` (peça do processo), a linha vira botão que rola a
      // timeline até a peça — é o que torna a resposta auditável nos autos.
      updateAssistant(el, fullText, cites) {
        estruturaAssistant(el);
        // recolhe o raciocínio quando a resposta começa a chegar
        if (el.__think && !el.__think.hidden && fullText) el.__think.open = false;
        let html = renderMd(fullText, cites);
        if (cites && cites.length) {
          html +=
            '<div class="cites">' +
            cites
              .map((c, i) => {
                const rot = escapeHtml(c.label);
                // O id só entra no DOM se for realmente numérico (vem do título
                // da peça, que é conteúdo dos autos).
                const id = /^\d+$/.test(String(c.id || "")) ? String(c.id) : "";
                let corpo;
                if (c.url && /^https?:\/\//.test(c.url)) {
                  // fontes da web (busca de jurisprudência) viram links
                  corpo =
                    '<a href="' + escapeHtml(c.url) + '" target="_blank" rel="noopener">' +
                    rot + "</a>";
                } else if (id) {
                  corpo =
                    '<button type="button" class="cite-go" data-id="' + id + '"' +
                    ' title="Ver esta peça na linha do tempo do processo">' +
                    rot + ' <span class="cite-id">id ' + id + "</span></button>";
                } else {
                  corpo = rot;
                }
                // char_location não tem folha: o trecho citado é a única âncora.
                if (c.trecho) {
                  corpo +=
                    ' <span class="cite-tr" title="' + escapeHtml(c.trecho) + '">“' +
                    escapeHtml(c.trecho.slice(0, 60)) + "…”</span>";
                }
                return (
                  '<span class="cite-row"><sup class="cit">' + (i + 1) + "</sup> " +
                  corpo + "</span>"
                );
              })
              .join("") +
            "</div>";
        }
        el.__body.innerHTML = html;
        if (el.__entry) {
          el.__entry.text = fullText;
          el.__entry.cites = cites || null;
        }
        msgs.scrollTop = msgs.scrollHeight;
      },
      // Resumo do raciocínio (thinking) em bloco colapsável no topo da bolha.
      setThinking(el, text) {
        estruturaAssistant(el);
        el.__think.hidden = !text;
        if (text) {
          if (!el.__body.innerHTML) el.__think.open = true;
          el.__thinkT.textContent = text;
        }
        msgs.scrollTop = msgs.scrollHeight;
      },
      removeMessage(el) {
        if (el) {
          const i = transcript.indexOf(el.__entry);
          if (i >= 0) transcript.splice(i, 1);
          el.remove();
        }
        showEmptyHint();
      },
      startPrep,
      setPrepState,
      endPrep,
      isSearchOn() {
        return searchOn;
      },
      onMinuta(cb) {
        minutaCb = cb;
      },
      onMapa(cb) {
        mapaCb = cb;
      },
      // Habilita a biblioteca de modelos só nos modelos de 1M tokens (chamada
      // pelo content.js quando as caps chegam/mudam).
      setModelosHabilitado,
      // Número CNJ do processo, exibido sob o nome do produto no cabeçalho.
      setProcesso(num) {
        const el = $(".cnj");
        if (el) el.textContent = num || "";
      },
      // Resultado do mapa mental: em vez do markdown cru (longo e repetitivo)
      // a bolha vira um card com as ações, e o texto fica num <details>
      // recolhido. O card é escrito no __body da bolha — depois disso NÃO se
      // pode chamar updateAssistant nesse elemento (ela reescreve o innerHTML).
      mostrarCardMapa(el, info) {
        if (!el || !info) return;
        estruturaAssistant(el);
        const entry = el.__entry;
        if (entry) entry.text = info.md || ""; // exportar .md leva o mapa inteiro
        el.__body.innerHTML =
          '<div class="mapacard">' +
          '<div class="mapacard-t">🧠 <b>Mapa mental gerado</b>' +
          (info.resumo ? " — " + escapeHtml(info.resumo) : "") +
          "</div>" +
          '<div class="mapacard-acts">' +
          '<button class="mapacard-abrir">Abrir mapa</button>' +
          '<button class="mapacard-md">⬇ Baixar .md</button>' +
          "</div>" +
          "<details class=\"mapacard-src\"><summary>Ver o texto do mapa</summary>" +
          '<div class="mapacard-md-body">' + renderMd(info.md || "") + "</div>" +
          "</details>" +
          "</div>";
        el.__body
          .querySelector(".mapacard-abrir")
          .addEventListener("click", () => info.onAbrir && info.onAbrir());
        el.__body
          .querySelector(".mapacard-md")
          .addEventListener("click", () => info.onBaixar && info.onBaixar());
        // abrir o texto do mapa cresce a bolha para fora da área visível
        el.__body.querySelector(".mapacard-src").addEventListener("toggle", () => {
          msgs.scrollTop = msgs.scrollHeight;
        });
        msgs.scrollTop = msgs.scrollHeight;
      },
      // Resultado da minuta: mesmo contrato do card do mapa (o __body é
      // reescrito — NÃO chamar updateAssistant nesse elemento depois disto).
      // O texto fica no <details> porque a minuta é longa e o que interessa
      // no chat é a AÇÃO: abrir no editor.
      mostrarCardMinuta(el, info) {
        if (!el || !info) return;
        estruturaAssistant(el);
        const entry = el.__entry;
        if (entry) entry.text = info.md || "";
        el.__body.innerHTML =
          '<div class="mapacard minutacard">' +
          '<div class="mapacard-t">📝 <b>Minuta gerada</b>' +
          (info.resumo ? " — " + escapeHtml(info.resumo) : "") +
          "</div>" +
          '<div class="mapacard-acts">' +
          '<button class="mapacard-abrir">Abrir no editor</button>' +
          '<button class="mapacard-md">⬇ Baixar .md</button>' +
          "</div>" +
          '<details class="mapacard-src"><summary>Ver o texto da minuta</summary>' +
          '<div class="mapacard-md-body">' + renderMd(info.md || "") + "</div>" +
          "</details>" +
          "</div>";
        el.__body
          .querySelector(".mapacard-abrir")
          .addEventListener("click", () => info.onAbrir && info.onAbrir());
        el.__body
          .querySelector(".mapacard-md")
          .addEventListener("click", () => info.onBaixar && info.onBaixar());
        el.__body.querySelector(".mapacard-src").addEventListener("toggle", () => {
          msgs.scrollTop = msgs.scrollHeight;
        });
        msgs.scrollTop = msgs.scrollHeight;
      },
      // Oferta de editor ao fim de uma resposta de chat COMUM: uma linha de
      // ação abaixo da bolha. Fica no próprio elemento da mensagem (irmã do
      // .body), e não dentro dele, para sobreviver a um updateAssistant
      // posterior. `destaque` a torna um botão cheio — é o que a heurística de
      // intenção liga quando o usuário claramente pediu uma peça redigida.
      adicionarAcaoEditor(el, info) {
        if (!el || !info || el.querySelector(".editor-act")) return;
        estruturaAssistant(el);
        const box = document.createElement("div");
        box.className = "editor-act" + (info.destaque ? " destaque" : "");
        const b = document.createElement("button");
        b.textContent = info.destaque ? "📝 Abrir no editor" : "📝 Editar como documento";
        b.title =
          "Abre esta resposta num editor de texto, em nova aba: revise, copie para " +
          "o PJe, baixe em Word (.docx) ou imprima.";
        b.addEventListener("click", () => info.onAbrir && info.onAbrir(b));
        box.appendChild(b);
        el.appendChild(box);
        msgs.scrollTop = msgs.scrollHeight;
      },
      // busy=true mostra um spinner antes do texto (trabalho em andamento —
      // análise, geração de documento, upload…), para o usuário ver que a
      // extensão está trabalhando e não travada.
      setStatus(s, busy) {
        statusEl.textContent = s || "";
        statusEl.classList.toggle("busy", !!busy && !!s);
      },
      // Nota dentro do card de progresso — hoje usada para avisar que o
      // download está lento. Aparece DURANTE a espera, que é quando a
      // informação vale: um aviso estático sobre Wi-Fi seria ignorado por quem
      // está com rede boa e visto tarde demais por quem não está.
      setPrepNota(texto) {
        if (!prepEl) return;
        let nota = prepEl.querySelector(".prep-nota");
        if (!texto) {
          if (nota) nota.remove();
          return;
        }
        if (!nota) {
          nota = document.createElement("div");
          nota.className = "prep-nota";
          prepEl.appendChild(nota);
        }
        nota.textContent = texto;
      },
      // Relatório das peças que não puderam ser baixadas neste turno.
      //
      // Vive NO CHAT, e não no .status (que é transitório) nem na .alertbar (que
      // é para o que impede de continuar): a análise seguiu com o resto, e o
      // usuário precisa poder ler com calma qual peça faltou e por quê, para
      // tentar de novo depois. Antes, uma única peça com 404 abortava o turno
      // inteiro e a pergunta já digitada se perdia.
      //
      // Fica FECHADO por padrão — é informação de diagnóstico, não deve competir
      // com a resposta.
      mostrarFalhasPecas(falhas) {
        if (!falhas || !falhas.length) return null;
        const el = document.createElement("details");
        el.className = "falhas";
        const n = falhas.length;
        const sum = document.createElement("summary");
        sum.textContent =
          n === 1
            ? "1 peça não pôde ser baixada e ficou de fora desta análise"
            : n + " peças não puderam ser baixadas e ficaram de fora desta análise";
        el.appendChild(sum);
        const ul = document.createElement("ul");
        for (const f of falhas) {
          const li = document.createElement("li");
          const t = document.createElement("b");
          // conteúdo dos autos: textContent, nunca innerHTML
          t.textContent = f.titulo || String(f.id);
          li.appendChild(t);
          const m = document.createElement("span");
          m.textContent = " — " + (f.erro || "falha ao baixar");
          li.appendChild(m);
          ul.appendChild(li);
        }
        el.appendChild(ul);
        const p = document.createElement("p");
        p.className = "falhas-dica";
        p.textContent =
          "Elas continuam marcadas: no próximo envio a extensão tenta de novo. Se persistir, abra a peça na linha do tempo do PJe uma vez e envie outra vez.";
        el.appendChild(p);
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
        return el;
      },

      // Prestação de contas da extração, no CHAT.
      //
      // O `.status` é transitório: uma operação que levou minutos e pode ter
      // custado dinheiro não pode terminar sem deixar rastro do que fez. E o
      // card de progresso some ao fim. Era daí que vinha "não fica claro quais
      // foram as peças, nem se está lendo só os PDFs" — o relatório responde
      // as duas de uma vez, separando POR VIA: leitura local (grátis), OCR
      // (pago) e as que já eram texto e não precisavam de nada.
      mostrarRelatorioExtracao(r) {
        if (!r) return null;
        const total = (r.locais || 0) + (r.ocr || 0);
        const falhas = r.falhas || [];
        // Nada aconteceu e nada falhou: não vale uma bolha no chat.
        if (!total && !falhas.length && !r.jaTexto && !r.bloqueadas) return null;
        const el = document.createElement("details");
        el.className = "extrai-rel";
        if (falhas.length) el.classList.add("tem-falha");
        el.open = !!falhas.length; // o que exige atenção abre sozinho

        const sum = document.createElement("summary");
        sum.textContent = r.cancelado
          ? "Extração cancelada — " + total + " peça(s) já tinham sido lidas"
          : total === 1
            ? "1 peça agora vai para a IA como texto"
            : total + " peças agora vão para a IA como texto";
        el.appendChild(sum);

        const ul = document.createElement("ul");
        const linha = (txt) => {
          const li = document.createElement("li");
          li.textContent = txt;
          ul.appendChild(li);
        };
        if (r.locais) {
          linha(
            r.locais + (r.locais > 1 ? " peças lidas" : " peça lida") +
              " no seu navegador, sem custo (o PDF já tinha texto dentro)"
          );
        }
        if (r.ocr) {
          const usd = (r.custoUsd || 0).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          linha(
            r.ocr + (r.ocr > 1 ? " peças digitalizadas lidas" : " peça digitalizada lida") +
              " por OCR · US$ " + usd
          );
        }
        if (r.jaTexto) {
          // Responde diretamente ao "não sei se ele está lendo só os PDFs".
          linha(
            r.jaTexto + (r.jaTexto > 1 ? " peças já eram" : " peça já era") +
              " texto (documento do editor do PJe) — não precisaram de extração"
          );
        }
        if (r.bloqueadas) {
          linha(
            r.bloqueadas + (r.bloqueadas > 1 ? " peças já estavam" : " peça já estava") +
              " no contexto desta conversa e seguem como documento — “Nova conversa” permite extraí-las"
          );
        }
        el.appendChild(ul);

        if (falhas.length) {
          const h = document.createElement("p");
          h.className = "rel-sub";
          h.textContent =
            falhas.length === 1
              ? "1 peça não pôde ser extraída e segue como documento:"
              : falhas.length + " peças não puderam ser extraídas e seguem como documento:";
          el.appendChild(h);
          const uf = document.createElement("ul");
          uf.className = "rel-falhas";
          for (const f of falhas) {
            const li = document.createElement("li");
            const b = document.createElement("b");
            b.textContent = f.titulo || String(f.id); // conteúdo dos autos: textContent
            li.appendChild(b);
            const m = document.createElement("span");
            m.textContent = " — " + (f.erro || "falha na extração");
            li.appendChild(m);
            uf.appendChild(li);
          }
          el.appendChild(uf);
        }

        const p = document.createElement("p");
        p.className = "rel-dica";
        p.textContent = falhas.length
          ? "Elas saíram da fila para o botão não repetir o mesmo erro. O ícone da própria peça, no hover, tenta de novo. Passe o mouse sobre qualquer peça para comparar o texto com o documento original."
          : "Passe o mouse sobre uma peça para comparar o texto extraído com o documento original — e voltar ao documento se preferir.";
        el.appendChild(p);

        // Diagnóstico da lentidão fica no title: baixar do PJe é o gargalo
        // (~5,6 s por peça, serializado pelo tribunal) e a leitura em si leva
        // menos de meio segundo. Sem separar, "demorou" acusa a extração.
        if (r.segDown || r.segLer) {
          el.title =
            "Tempo: " + (r.segDown || 0) + " s baixando do PJe · " +
            (r.segLer || 0) + " s lendo o texto";
        }
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
        return el;
      },
      // Medidor de contexto da conversa: barra + resumo (tokens e páginas
      // acumulados no request vs. limites do modelo). null esconde.
      setContexto(info) {
        if (!info || !info.ctxTokens) {
          gaugeEl.hidden = true;
          return;
        }
        const pctTok = info.tokens / info.ctxTokens;
        const pctPag = info.maxPaginas ? (info.paginas || 0) / info.maxPaginas : 0;
        const pct = Math.min(1, Math.max(pctTok, pctPag));
        gaugeFill.style.width = Math.round(pct * 100) + "%";
        gaugeEl.classList.toggle("warn", pct >= 0.7 && pct < 0.9);
        gaugeEl.classList.toggle("crit", pct >= 0.9);
        // as peças ainda sem download entram nas DUAS versões: fingir precisão
        // seria pior do que a frase ficar um pouco mais longa
        const pend = info.pendentes ? " · " + info.pendentes + " sem medir" : "";
        gaugeFull.textContent =
          (info.pecas || 0) + " peças · ~" +
          Math.round(info.tokens / 1000) + " mil tokens (" +
          Math.round(pctTok * 100) + "%)" +
          (info.maxPaginas
            ? " · " + (info.paginas || 0) + "/" + info.maxPaginas + " págs."
            : "") +
          pend;
        // forma curta (painel estreito): o percentual é o dado acionável
        gaugeShort.textContent =
          Math.round(pct * 100) + "% · " + (info.pecas || 0) + " peças" + pend;
        gaugeEl.title = GAUGE_TITLE + " — " + gaugeFull.textContent;
        gaugeEl.hidden = false;
      },
      // Custo estimado da conversa (US$, calculado pelo worker a partir do
      // usage da API × tabela de preços do modelo). null esconde e zera.
      setCusto(info) {
        if (!info) {
          custoEl.hidden = true;
          custoFull.textContent = "";
          custoShort.textContent = "";
          return;
        }
        custoFull.textContent =
          "~" + fmtUsd(info.turnoUsd) + " nesta resposta · ~" +
          fmtUsd(info.conversaUsd) + " na conversa";
        // curta: o acumulado da conversa é o número que importa no dia a dia
        custoShort.textContent = "~" + fmtUsd(info.conversaUsd);
        const prov = info.provedorNome || "Anthropic";
        const u = info.usage;
        custoEl.title = u
          ? "Estimativa pela tabela de preços da " + prov + " (não inclui impostos). " +
            "Última resposta: " +
            fmtMil(u.input_tokens) + " tokens de entrada, " +
            fmtMil((u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)) +
            " de cache (bem mais baratos) e " +
            fmtMil(u.output_tokens) + " gerados."
          : "Estimativa pela tabela de preços da " + prov + ".";
        custoEl.hidden = false;
      },
      // Barra de ALERTA persistente (contexto cheio): diferente do status
      // (transitório), fica visível até ser resolvida — com ação de recomeço.
      // null/"" esconde.
      setAlerta(msg) {
        if (!msg) {
          alertEl.hidden = true;
          alertEl.innerHTML = "";
          return;
        }
        alertEl.innerHTML =
          '<span class="alert-t">⚠️ ' + escapeHtml(msg) + "</span>" +
          '<button class="alert-reset" title="Começar uma nova conversa do zero">' +
          SVG.reset + " Nova conversa</button>";
        alertEl
          .querySelector(".alert-reset")
          .addEventListener("click", () => resetCb && resetCb());
        alertEl.hidden = false;
      },
      lockInput(b) {
        inEl.disabled = b;
        sendBtn.disabled = b;
        // trava também as ações — clicar durante uma resposta não faz nada,
        // e botão ativo-porém-morto confunde.
        tglSearch.disabled = b;
        btnMinuta.disabled = b;
        btnMapa.disabled = b;
        btnPlib.disabled = b;
        const px = promptbar.querySelector(".pchip-x");
        if (px) px.disabled = b;
      },
      // Nota discreta sobre o modo de citações do modelo atual: "textual"
      // (Gemini — páginas citadas no próprio texto) mostra a nota; "nativa"
      // (Claude — marcadores [n] automáticos) esconde.
      setModoCitacoes(modo) {
        citeNote.hidden = modo !== "textual";
      },
      // Selo do modelo ATIVO na barra de ferramentas ("Gemini 3.6 Flash ·
      // raciocínio alto") — o usuário vê na hora que a troca nas opções
      // valeu, sem precisar confiar às cegas. info: {model, effort, comEffort}.
      setModelo(info) {
        if (!info || !info.model) {
          modeloBadge.hidden = true;
          return;
        }
        const NOMES = {
          "claude-haiku-4-5": "Claude Haiku 4.5",
          "claude-sonnet-5": "Claude Sonnet 5",
          "claude-opus-4-8": "Claude Opus 4.8",
          "claude-fable-5": "Claude Fable 5",
          "gemini-3.6-flash": "Gemini 3.6 Flash",
          "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
        };
        const EFFORTS = { high: "alto", medium: "médio", low: "baixo" };
        let txt = "🧠 " + (NOMES[info.model] || info.model);
        // modelos sem suporte a effort (Haiku) não mostram o nível — exibir
        // um valor que a API não recebe seria mentira
        if (info.comEffort && EFFORTS[info.effort]) {
          txt += " · raciocínio " + EFFORTS[info.effort];
        }
        modeloBadge.textContent = txt;
        modeloBadge.hidden = false;
      },
    };
  }

  return {
    mount,
    _renderMd: renderMd,
    _findSlashToken: findSlashToken,
    _montarTextoEnvio: montarTextoEnvio,
  };
})();
