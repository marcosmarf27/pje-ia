// UI do painel lateral (chat + seletor de documentos), isolada em Shadow DOM.
var PjePanel = (function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // Nome de exibição de cada modelo. Vive no TOPO do IIFE porque DOIS pontos
  // distantes a consomem — o selo do modelo (`setModelo`) e a nota de perfil da
  // minuta —, e uma const declarada entre eles lançaria "Cannot access before
  // initialization" no primeiro (a zona morta temporal). O fallback é o id cru,
  // que não quebra nada mas põe "gpt-5.6-luna" num selo cujo trabalho é dizer
  // ao usuário, na língua dele, qual modelo respondeu: ao somar um modelo em
  // MODEL_CAPS, somar aqui também.
  const NOMES_MODELO = {
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-opus-4-8": "Claude Opus 4.8",
    "claude-fable-5": "Claude Fable 5",
    "gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini-3.7-flash": "Gemini 3.7 Flash",
    "gemini-3.6-flash": "Gemini 3.6 Flash",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
  };

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

  // ---------------------------------------------------------------------------
  // AVISOS EM BLOCO (callouts) dentro da resposta.
  //
  // O modelo é instruído (PROMPT_DESTAQUES, em content.js) a marcar o que o
  // usuário PRECISA notar como uma citação markdown cuja primeira linha é um
  // rótulo entre colchetes — `> [!ATENÇÃO]`. É o padrão de "alerts" do GitHub,
  // escolhido justamente porque os modelos o conhecem muito bem do treino: uma
  // sintaxe inventada aqui seria obedecida pela metade.
  //
  // Existe porque a observação que MUDA a leitura do processo — "esta peça é só
  // encaminhamento, a defesa está na 205649798", "a peça essencial não foi
  // anexada" — chegava como mais um parágrafo igual aos outros, no meio de uma
  // resposta longa, e passava batido. Quem lê autos lê por varredura.
  //
  // A tabela aceita as formas em português E as canônicas do GitHub: o modelo
  // escorrega para WARNING/NOTE mesmo instruído em português, e um rótulo não
  // reconhecido apareceria como "[!WARNING]" cru na cara do usuário.
  // ---------------------------------------------------------------------------
  const CALLOUTS = {
    alerta: { cls: "co-erro", rotulo: "Alerta" },
    erro: { cls: "co-erro", rotulo: "Alerta" },
    critico: { cls: "co-erro", rotulo: "Alerta" },
    caution: { cls: "co-erro", rotulo: "Alerta" },
    danger: { cls: "co-erro", rotulo: "Alerta" },
    atencao: { cls: "co-aviso", rotulo: "Atenção" },
    aviso: { cls: "co-aviso", rotulo: "Atenção" },
    ressalva: { cls: "co-aviso", rotulo: "Atenção" },
    importante: { cls: "co-aviso", rotulo: "Atenção" },
    important: { cls: "co-aviso", rotulo: "Atenção" },
    warning: { cls: "co-aviso", rotulo: "Atenção" },
    nota: { cls: "co-nota", rotulo: "Nota" },
    note: { cls: "co-nota", rotulo: "Nota" },
    info: { cls: "co-nota", rotulo: "Nota" },
    dica: { cls: "co-nota", rotulo: "Nota" },
    tip: { cls: "co-nota", rotulo: "Nota" },
  };

  // `linhas` já vem SEM o "> " e DEPOIS do escape (o `>` do markdown chega aqui
  // como `&gt;` e foi removido pelo chamador) — colchetes e `!` não são
  // escapados, então o rótulo casa direto. Devolve null quando não é um aviso:
  // aí o chamador desenha a citação normal, e nada se perde.
  function lerCallout(linhas) {
    if (!linhas.length) return null;
    const m = linhas[0].trim().match(/^\[!\s*([A-Za-zÀ-ÿ]+)\s*\]\s*(.*)$/);
    if (!m) return null;
    const tipo = CALLOUTS[norm(m[1])];
    if (!tipo) return null;
    // O texto pode vir na mesma linha do rótulo ou nas seguintes; e pode não
    // vir nenhum (o modelo põe o rótulo e escreve o parágrafo fora do bloco).
    // Corpo vazio ainda rende o cabeçalho — o realce é do rótulo.
    const corpo = [m[2]].concat(linhas.slice(1)).filter((l) => l.trim() !== "");
    return (
      '<div class="callout ' + tipo.cls + '" role="note">' +
      '<div class="co-h">' +
      (tipo.cls === "co-nota" ? SVG.coNota : SVG.coAlerta) +
      "<span>" + tipo.rotulo + "</span></div>" +
      (corpo.length ? '<div class="co-b">' + corpo.map(inlineMd).join("<br>") + "</div>" : "") +
      "</div>"
    );
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

  // REIDENTIFICAÇÃO NA TELA. O modo sigiloso manda `[PESSOA_1]` à API e a
  // resposta volta com o rótulo; a tabela que o desfaz está NESTE computador,
  // e mostrá-lo cru era pedir ao usuário que traduzisse a resposta de cabeça
  // (o relato: "temos a tabela de identificação, mas parece que não
  // utilizamos"). `reidentificador(rotulo)` devolve o valor ou null; o content
  // o instala com o mapa vivo. A troca é só de EXIBIÇÃO: o transcript, a
  // exportação e o histórico continuam com o rótulo — foi ele que saiu.
  // O valor entra por placeholder na área de uso privado (como as citações):
  // atravessa o escape e a formatação inline sem ser interpretado.
  let reidentificador = null;
  const RE_ROTULO_ANON = /\[([A-Z][A-Z0-9]*_\d+)\]/g;
  function marcaReid(rotulo, valor) {
    return (
      '<mark class="reid" title="' +
      escapeHtml("[" + rotulo + "] — nome restaurado neste computador; a IA recebeu só o rótulo") +
      '">' + escapeHtml(valor) + "</mark>"
    );
  }
  function renderMd(text, cites) {
    const reids = [];
    let bruto = String(text == null ? "" : text);
    if (reidentificador) {
      bruto = bruto.replace(RE_ROTULO_ANON, (m, rot) => {
        let v = null;
        try { v = reidentificador("[" + rot + "]"); } catch { v = null; }
        if (v == null || v === "") return m;
        reids.push({ rot, v });
        return "\uE020" + (reids.length - 1) + "\uE021";
      });
    }
    const src = escapeHtml(bruto);
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

      // citação — e o AVISO EM BLOCO, que é uma citação cuja primeira linha traz
      // o rótulo `[!ALERTA]` (ver `lerCallout` no topo do arquivo).
      if (/^\s*&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*&gt;\s?/, ""));
          i++;
        }
        out.push(
          lerCallout(buf) || "<blockquote>" + buf.map(inlineMd).join("<br>") + "</blockquote>"
        );
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
    if (reids.length) {
      html = html.replace(new RegExp("\\uE020(\\d+)\\uE021", "g"), (m, n) => {
        const r = reids[Number(n)];
        return r ? marcaReid(r.rot, r.v) : m;
      });
    }
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
  // ---------------------------------------------------------------------------
  // Ícones. Traçado em grade de 24, fill:none, currentColor — nada de emoji, que
  // renderiza diferente em cada sistema, não aceita currentColor e não alinha na
  // grade óptica dos demais. A ESPESSURA varia por contexto (DESIGN.md §5): um
  // valor único faz o ícone de 13px pesar mais que o de 18px.
  // ---------------------------------------------------------------------------
  const P = {
    download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
    // Nova conversa: o balão com uma CRUZ dentro. O balão SOZINHO — que é o que
    // este botão mostrava, e por isso saiu da tabela — dizia só "conversa", e ao
    // lado da pilha de balões das conversas guardadas os dois viravam o mesmo
    // desenho borrado a 15px: não havia como adivinhar qual criava e qual
    // listava. A cruz é o sinal universal de "criar", e é ela que separa os dois
    // em meio segundo de olhar. O mesmo desenho é repetido no `help.html`, onde
    // o texto nomeia o botão (DESIGN.md §5, "ícone dentro de uma frase").
    chatNovo:
      '<path d="M20 15a3 3 0 0 1-3 3H9l-4 3v-4H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/>' +
      '<path d="M12 8v6"/><path d="M9 11h6"/>',
    // Aviso em bloco dentro da resposta (callout): triângulo com "!". O ponto é
    // um traço curto + um ponto, como o do `info` — a 14px um "!" desenhado
    // como glifo vira borrão.
    alerta:
      '<path d="M12 4.5L21 19.5H3z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/>',
    convs: '<path d="M17 12a3 3 0 0 1-3 3H8l-3 2.5V15H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3z"/><path d="M8 17v1a3 3 0 0 0 3 3h5l3 2.5V20h1a3 3 0 0 0 3-3v-5a3 3 0 0 0-3-3"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
    fold: '<path d="M13 7l-5 5 5 5"/><path d="M19 7l-5 5 5 5"/>',
    // modos de layout — o retângulo é o painel; a divisória diz onde ele encosta
    // Painel lateral: DOIS blocos separados — a página do tribunal, larga, e o
    // painel encostado na borda. Era um retângulo com uma divisória interna,
    // quase idêntico ao de ocultar peças (`docshide`), e o DESIGN.md já
    // registrava que os dois se confundiam. Separar os blocos resolve por
    // silhueta, que é o que o olho lê a 15px.
    side: '<rect x="2.5" y="4.5" width="11.5" height="15" rx="2"/><rect x="16.5" y="4.5" width="5" height="15" rx="1.5"/>',
    sideL: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 5v14"/>',
    // Janela livre (a que se arrasta e redimensiona): DUAS janelas sobrepostas,
    // a convenção universal de "janela solta/restaurar". O desenho antigo era
    // uma janela única com barra de título — correto e mudo: descrevia um
    // painel qualquer, e nada nele dizia que aquele sai do lugar.
    split:
      '<rect x="2.5" y="7.5" width="13" height="12" rx="2"/>' +
      '<path d="M7.5 7.5V5.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
    // Painel largo (modal central com a lista em coluna). ERA um par de setas
    // "↔", que lê como REDIMENSIONAR largura — não como "abrir grande com a
    // lista ao lado". O desenho novo mostra o que o modo entrega: uma coluna à
    // esquerda e o texto à direita.
    expand: '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M9 4.5v15"/><path d="M12 9h6M12 12h6"/>',
    fs: '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-7 7"/><path d="M4 20l7-7"/>',
    fsOff: '<path d="M9 4H4v5"/><path d="M15 20h5v-5"/><path d="M4 4l6 6"/><path d="M20 20l-6-6"/>',
    // a lista recolhe/expande: o chevron DENTRO do retângulo dá o sentido da
    // ação (← recolhe, → traz de volta). Sem ele o ícone ficava idêntico ao do
    // modo lateral e ninguém achava o botão.
    docshide: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/><path d="M16 8.5L12.5 12l3.5 3.5"/>',
    docsshow: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/><path d="M12.5 8.5L16 12l-3.5 3.5"/>',
    lupa: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v4h-4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    chevron: '<path d="M7 10l5 5 5-5"/>',
    enviar: '<path d="M5 12h13"/><path d="M12 6l6 6-6 6"/>',
    mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    lista: '<path d="M4 5h13"/><path d="M4 12h10"/><path d="M4 19h7"/>',
    // Extrair texto: a FOLHA com linhas escritas e uma seta saindo dela. A folha
    // sozinha diria "documento" (que é o que a lista inteira já é); é a seta que
    // diz que algo SAI daqui.
    extrairTexto:
      '<path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-7"/>' +
      '<path d="M8 8h6"/><path d="M8 12h5"/><path d="M8 16h4"/>' +
      '<path d="M18 3v7"/><path d="M15 7l3 3 3-3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    // Relógio para o selo da linha do tempo processual. Ponteiros em 10h10 (e
    // não 12h00, que a 14px vira um traço só): é o desenho que se lê como
    // "tempo" no tamanho em que ele vai aparecer. Emoji está fora — DESIGN.md §5.
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 1.9"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    ver: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.6v2.8"/><path d="M12 17.6v2.8"/><path d="M3.6 12h2.8"/><path d="M17.6 12h2.8"/>',
    // toolbar
    minuta: '<path d="M5 20h14"/><path d="M15 4l5 5-9 9H6v-5z"/>',
    mapa: '<circle cx="12" cy="12" r="3"/><path d="M12 9V5"/><path d="M14.5 13.5l3 2.5"/><path d="M9.5 13.5l-3 2.5"/>',
    prompts: '<path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8z"/><path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z"/>',
    modelos: '<path d="M4 6h7v14H4z"/><path d="M13 6h7v14h-7z"/>',
    // Metade do círculo preenchida: a convenção de contraste/aparência. Não é
    // uma paleta de pintor (que sugere "escolher uma cor", e o que se escolhe
    // aqui é um conjunto) nem uma lua (que sugere só claro/escuro, e são cinco).
    tema: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
    // A TARJA — duas linhas de texto e a barra de redação por cima da do meio.
    // Substitui o cadeado no modo sigiloso, e a troca não é estética: cadeado é
    // segurança GENÉRICA (e neste produto já é o ícone de "a chave fica neste
    // navegador", ver o comentário do `chave` abaixo), enquanto a tarja é o que
    // ESTA função faz — ela mascara nomes num documento. Um sinal, um glifo,
    // nos três lugares (botão da barra, carimbo do cabeçalho, selo da metarow).
    //
    // O <rect> é a ÚNICA forma preenchida do conjunto de ícones, e é ela que
    // faz o desenho ler como "texto tarjado" em vez de três linhas soltas. O
    // `stroke="none"` nele é obrigatório: sem isso o contorno de 1,9 engrossa a
    // barra até ela encostar nas linhas vizinhas em 13px.
    tarja: '<path d="M4 7h16"/><rect x="4" y="10.6" width="13" height="4" rx="1.4" fill="currentColor" stroke="none"/><path d="M4 19h8"/>',
    // mesmo desenho do botão "Importar de .docx" da página modelos.html: as
    // duas portas de entrada da importação precisam mostrar o mesmo ícone
    importar: '<path d="M12 20V9"/><path d="M7 13l5-5 5 5"/><path d="M5 4h14"/>',
    // clipe de papel do botão de anexar arquivos no input
    clip: '<path d="M20 11l-8.5 8.5a4 4 0 0 1-5.7-5.7l8.5-8.5a2.5 2.5 0 0 1 3.5 3.5l-8 8a1 1 0 0 1-1.4-1.4l7.3-7.3"/>',
    // malote: envelope com alça — o pacote de carta precatória é o que sai por ele
    malote: '<path d="M3 8h18v12H3z"/><path d="M3 8l9 6 9-6"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/>',
    // caret para baixo — abre o menu do split button de download
    caret: '<path d="M6 9l6 6 6-6"/>',
    // escudo com check — anonimização antes do envio (TecJustiça Sigilo). Escudo
    // e não cadeado: cadeado já é o ícone de "a chave fica neste navegador" no
    // popup, e são garantias diferentes (uma guarda o segredo, a outra protege
    // o documento antes de ele sair).
    escudo:
      '<path d="M12 3l7.5 3v5.6c0 4.5-3.2 8-7.5 8.9-4.3-.9-7.5-4.4-7.5-8.9V6z"/>' +
      '<path d="M9 12.2l2.1 2.1 4-4.2"/>',
  };
  // px = lado do ícone; w = stroke-width (a escala do DESIGN.md §5).
  function ic(paths, px, w) {
    return (
      '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"
    );
  }

  // Botões da toolbar são <svg> + <span class="lbl">: trocar o texto do botão
  // inteiro destruiria o ícone. Estes dois helpers mexem em um sem tocar no
  // outro; se o .lbl não existir (botão sem ícone), caem no próprio elemento.
  function rotulo(btn, txt) {
    if (!btn) return;
    const el = btn.querySelector(".lbl") || btn;
    el.textContent = txt;
  }
  function icone(btn, svg) {
    const el = btn && btn.querySelector("svg");
    if (el) el.outerHTML = svg;
  }

  const SVG = {
    free: ic(P.split, 15, 1.8),
    fs: ic(P.fs, 15, 1.8),
    fsOff: ic(P.fsOff, 15, 1.8),
    expand: ic(P.expand, 15, 1.8),
    side: ic(P.side, 15, 1.8),
    sideL: ic(P.sideL, 15, 1.8),
    docshide: ic(P.docshide, 15, 1.8),
    docsshow: ic(P.docsshow, 15, 1.8),
    fold: ic(P.fold, 13, 2),
    ver: ic(P.ver, 13, 1.8), // alvo/crosshair: a 12px o desenho fechava e lia-se como estrela
    close: ic(P.close, 15, 1.9),
    reset: ic(P.chatNovo, 15, 1.8),
    convs: ic(P.convs, 15, 1.8),
    // Ícones dos avisos em bloco das respostas (renderMd). 14px porque vivem
    // dentro de um parágrafo, e stroke 1.9 pela escala do DESIGN.md §5.
    coAlerta: ic(P.alerta, 14, 1.9),
    coNota: ic(P.info, 14, 1.9),
    download: ic(P.download, 15, 1.8),
    copy: ic(P.copy, 13, 1.8),
    doc: ic(P.doc, 11, 1.8),
    x: ic(P.x, 9, 3),
    check: ic(P.check, 10, 2),
    lupa: ic(P.lupa, 12, 2),
    // --- toolbar: a cor vem do CSS (currentColor), a espessura é 1.9 ---
    cancel: ic(P.close, 13, 1.9), // ✕ no tamanho da toolbar, não o de chip
    ia: ic(P.prompts, 13, 2),
    novo: ic('<path d="M12 5v14"/><path d="M5 12h14"/>', 13, 2),
    juris: ic(P.lupa, 13, 1.9),
    minuta: ic(P.minuta, 13, 1.9),
    mapa: ic(P.mapa, 13, 1.9),
    prompts: ic(P.prompts, 13, 1.9),
    modelos: ic(P.modelos, 13, 1.9),
    tarja: ic(P.tarja, 13, 1.9),
    tema: ic(P.tema, 15, 1.7),
    importar: ic(P.importar, 13, 1.9),
    importarG: ic(P.importar, 24, 1.4), // grande: traço mais fino (DESIGN.md §5)
    // --- demais ---
    info: ic(P.info, 15, 1.8),
    relogio: ic(P.relogio, 14, 1.8),
    clip: ic(P.clip, 16, 1.8),
    enviar: ic(P.enviar, 14, 2),
    chevron: ic(P.chevron, 11, 2.2),
    mais: ic(P.mais, 15, 1.8),
    lista: ic(P.lista, 15, 1.9),
    reload: ic(P.reload, 13, 2),
    zip: ic(P.download, 13, 2),
    extrairTexto: ic(P.extrairTexto, 13, 2),
    malote: ic(P.malote, 14, 1.9),
    caret: ic(P.caret, 11, 2.2),
    play: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l10 7-10 7z"/></svg>',
    escudo: ic(P.escudo, 14, 1.8),
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
  // Só a data de "15/09/20 12:31" (o que a grid do PJe entrega em `juntadoEm`,
  // com hora e, em alguns tribunais, ano de dois dígitos). Regex sobre o que é
  // DATA, nunca corte por posição: o `slice(0, 10)` que existia aqui devolvia
  // "15/09/20 1" — a hora pela metade — sempre que o ano vinha abreviado.
  function dataCurta(v) {
    const m = String(v || "").match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    return m ? m[0] : "";
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
    // "resposta a acusacao" é a defesa escrita do processo penal (art. 396-A do
    // CPP) e não casava nenhuma regra — ficava cinza como se fosse expediente.
    { cls: "cat-peticao", re: /\b(peticao|inicial|emenda|contestacao|reconvencao|replica|treplica|recurso|apelacao|embargos|agravo|impugnacao|excecao|alegacoes|manifestacao|defesa|resposta a acusacao|denuncia|queixa|memoriais|razoes|contrarrazoes|cumprimento de sentenca|habeas|cota|promocao|quesitos|rol de testemunhas|acordo)\b/ },
    // provas técnicas e atos de investigação (criminal: IP, APF, exames…)
    { cls: "cat-prova", re: /\b(laudo|pericia|parecer|ata notarial|auto de|flagrante|inquerito|boletim de ocorrencia|exame|corpo de delito|midia|interceptacao|relatorio|estudo social|estudo psicossocial|antecedentes)\b/ },
  ];
  // ---------------------------------------------------------------------------
  // RELEVÂNCIA — segundo eixo, ortogonal à categoria.
  //
  // A categoria acima responde "que tipo de peça é esta?" e vira COR. Ela não
  // serve para responder "quais peças eu mando para a IA?", que é outra
  // pergunta: num processo de 200 peças, tudo que não é `cat-outro` são ~120,
  // porque a regra de petição casa `peticao|manifestacao|cota|promocao` — ou
  // seja, praticamente toda juntada das partes. "Principais" acabava
  // significando "quase todas".
  //
  // Quatro níveis:
  //   essencial — a espinha dorsal do processo: as ~10 peças que respondem a
  //               maioria das perguntas (inicial, contestação, laudo, sentença…)
  //   relevante — derivado: tem categoria destacada mas não é da espinha
  //   neutro    — sem categoria e sem sinal de expediente
  //   ruido     — expediente puro: certidão de intimação, AR, guia, procuração
  //
  // `relevante` e `neutro` NÃO têm tabela própria — saem da categoria que já
  // existe. Só os dois extremos precisam de regra.
  // ---------------------------------------------------------------------------

  // A espinha dorsal, cível e criminal. Herda as armadilhas já anotadas nas
  // CATEGORIAS: o lookbehind de "cumprimento de sentença" (que é fase das
  // partes, não ato de mérito) e a separação entre `acordao` e `acordo` (o \b
  // não existe entre "acordo" e o "a" seguinte).
  //
  // ARMADILHA PRÓPRIA desta construção: o grupo inteiro vai entre \b…\b, então
  // toda alternativa precisa terminar em PALAVRA COMPLETA. Escrever "saneador"
  // não pega "Decisão Saneadora" e "acordo homologad" não pega "homologado" —
  // o \b final exige um limite e encontra uma letra. Por isso as flexões vão
  // explícitas, em vez de \w* solto (que faria "inicial" casar "inicialmente").
  const RE_CHAVE = new RegExp(
    "\\b(" +
      [
        // inicial
        "peticao inicial", "inicial", "denuncia", "queixa-crime",
        "reclamacao trabalhista",
        // resposta
        "contestacao", "defesa (previa|preliminar|escrita)",
        "resposta a acusacao", "reconvencao",
        // réplica
        "replica", "impugnacao a contestacao",
        // saneamento
        "saneador(a|es|as)?", "saneamento",
        // prova técnica
        "laudo(s)?", "pericia(s)?", "parecer tecnico",
        // instrução
        "ata(s)? de audiencia", "audiencia de instrucao", "termo de audiencia",
        // razões finais
        "alegacoes finais", "memoriais",
        // mérito
        "(?<!cumprimento de )sentenca", "acordao", "liminar(es)?",
        "tutela (de urgencia|antecipada)", "acordo homologad(o|a)",
        // recurso
        "apelacao", "contrarrazoes",
        "recurso (especial|extraordinario|ordinario)",
      ].join("|") +
      ")\\b"
  );

  // Expediente. CONSERVADORA de propósito e sempre ANCORADA — termo solto aqui
  // custa caro, porque tira a peça de "principais" e ela some do recorte sem o
  // usuário perceber. Nunca use: `certidao` sozinho (certidão de trânsito em
  // julgado é ato relevante), `comprovante` sozinho (é prova em consumidor),
  // `carta` sozinho (precatória não é ruído), `juntada de documentos` (é onde
  // vive a prova), `mandado` (mandado de segurança).
  const RE_RUIDO = new RegExp(
    "\\b(" +
      [
        "certidao de (intimacao|publicacao|decurso|prazo|citacao)",
        "termo de juntada", "ato ordinatorio", "aviso de recebimento",
        "carta de (citacao|intimacao)", "guia de (recolhimento|custas)",
        "procuracao", "substabelecimento", "comprovante de residencia",
        "publicacao.*(dje|diario)",
      ].join("|") +
      ")\\b"
  );

  // Órgãos cuja atuação é, por si, sinal de peça de CONTEÚDO. Casa contra o
  // campo "Juntado por" da grid, e serve SÓ para promover (ver
  // `refinarRelevancia`) — nunca para rebaixar.
  //
  // Mesmas armadilhas de construção das duas tabelas acima: o grupo vai entre
  // \b…\b, então toda alternativa precisa terminar em palavra COMPLETA, e as
  // flexões vão explícitas em vez de \w* solto.
  const RE_AUTOR_CONTEUDO = new RegExp(
    "\\b(" +
      [
        "ministerio publico", "promotor(a|ia)?", "procurador(a|ia)?",
        "defensoria", "defensor(a)? public(o|a)",
      ].join("|") +
      ")\\b"
  );

  // Classifica nos DOIS eixos de uma vez. Aceita string (título) ou o objeto da
  // peça, e devolve {cat, rel}.
  //
  // Quando a peça vem da tela "Documentos" do PJe ela traz o TIPO OFICIAL
  // ("Despacho de Mero Expediente", "Certidão de Intimação"), que é muito
  // melhor que o título para isto — o título costuma ser o nome do arquivo
  // ("Despachos / 2"), enquanto o tipo é o vocabulário controlado do sistema.
  // Por isso o laço EXTERNO é por alvo (tipo primeiro, título depois): um tipo
  // oficial "Certidão de Intimação" precisa vencer um título que por acaso
  // contenha "sentença", que é o falso positivo mais comum do título.
  //
  // Dentro de cada alvo a ordem é ruído → chave → categorias, e a normalização
  // acontece UMA vez por alvo: o custo real aqui não são as regex, é o norm()
  // (toLowerCase + NFD + replace), e `setDocs` re-renderiza a lista inteira a
  // cada mutação da timeline do PJe.
  function classificarPeca(docOuTitulo) {
    const d = docOuTitulo && typeof docOuTitulo === "object" ? docOuTitulo : null;
    const alvos = (d ? [d.tipo, d.titulo] : [docOuTitulo]).filter(Boolean);
    for (const alvo of alvos) {
      const t = norm(alvo);
      // Expediente é sempre NEUTRO na cor, mesmo quando o título menciona a
      // peça a que se refere: "Certidão de Intimação da Sentença" pintada de
      // dourado atrai o olho exatamente para o que não importa, e é a mistura
      // do expediente com as peças de conteúdo que faz a lista cansar.
      if (RE_RUIDO.test(t)) return { cat: "cat-outro", rel: "ruido" };
      if (RE_CHAVE.test(t)) return { cat: catPorTexto(t), rel: "essencial" };
      const cat = catPorTexto(t);
      // sem sinal de nível NESTE alvo: se ele já dá categoria, o nível é
      // derivado dela; senão, tenta o próximo alvo (título, depois de tipo)
      if (cat !== "cat-outro") return { cat, rel: "relevante" };
    }
    return { cat: "cat-outro", rel: "neutro" };
  }
  function catPorTexto(t) {
    for (const c of CATEGORIAS) if (c.re.test(t)) return c.cls;
    return "cat-outro";
  }
  // Só a categoria — o que chips, preview e popup @ consomem.
  function categoriaDe(docOuTitulo) {
    return classificarPeca(docOuTitulo).cat;
  }
  // Normaliza para busca sem acentos/caixa (ex.: "peticao" acha "Petição").
  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Índice de busca de uma peça: título MAIS o tipo oficial, quando a tela
  // "Documentos" do PJe já foi lida. O tipo é o vocabulário controlado do
  // sistema ("Despacho de Mero Expediente") e costuma descrever a peça melhor
  // que o título, que é o nome do arquivo ("Documentos diversos") — enquanto
  // só o título era indexado, buscar "despacho" não achava a peça certa,
  // embora ela já aparecesse com a cor de decisão na lista.
  // Usado pela busca da lista E pelo popup @, para os dois nunca divergirem.
  function textoBusca(d) {
    return norm(d.titulo + " " + (d.tipo || ""));
  }

  // ---------------------------------------------------------------------------
  // Refino ESTRUTURAL da relevância — o que a peça não sabe sozinha
  // ---------------------------------------------------------------------------
  // `classificarPeca` é PURA e POR PEÇA: entra um texto, sai um rótulo. Dois
  // sinais fortes não cabem nesse formato, e por motivos diferentes:
  //
  //   (1) "é a inicial" quer dizer "é a primeira peça de conteúdo do processo",
  //       que é propriedade da LISTA — nenhuma peça descobre isso olhando para
  //       si mesma;
  //   (2) "quem juntou" está no objeto, mas só significa alguma coisa COMPARADO
  //       ao que o título já disse: é desempate, nunca veredito.
  //
  // Por isso o refino é uma passada à parte sobre a lista já classificada, e
  // `classificarPeca`/`categoriaDe` seguem intocadas — elas continuam sendo
  // chamadas com peça avulsa pelos chips, pelo popup @, pelo preview e pelo
  // content.js, e nenhum desses tem lista nenhuma para oferecer.
  //
  // Devolve Map id -> {rel, motivo}. O MOTIVO não é enfeite: peça que entra num
  // degrau por um sinal que NÃO está escrito no nome dela precisa poder ser
  // contestada — vai para o `title` da row, o mesmo lugar onde o "Escolher com
  // IA" já grava o motivo dele. Nada aqui muda a COR: categoria e relevância
  // são eixos ortogonais (DESIGN.md §2), e repintar a peça promovida seria
  // afirmar uma categoria que a classificação não reconheceu.
  function refinarRelevancia(docs, clsPorId, temTipo) {
    const ajustes = new Map();
    if (!docs || !docs.length) return ajustes;

    // (1) A PETIÇÃO INICIAL, por POSIÇÃO.
    //
    // É o sinal de maior retorno: o título costuma ser o nome do arquivo
    // ("Petição", "Documentos diversos"), aí RE_CHAVE não casa nada e a peça
    // mais importante do processo fica FORA do degrau `chave` — em silêncio.
    //
    // A guarda de `temTipo` é o que impede o falso positivo caro, e ela não é
    // sobre o tipo em si: a timeline do PJe é LAZY, e numa lista parcial a peça
    // mais antiga CARREGADA não é a mais antiga do PROCESSO. Marcá-la como
    // inicial apontaria para a peça errada sem nenhum sintoma. O tipo oficial só
    // existe depois que a grid foi lida, e a grid é justamente a rota que traz a
    // lista inteira — então ele é a proxy de completude disponível aqui. Sem
    // ele, a `.sel-nota` do degrau já manda carregar tudo.
    if (temTipo) {
      // `window.PjeExport.…` explícito, não o global nu: `exportar.js` publica a
      // API SÓ como propriedade de window (o IIFE não declara `var PjeExport`),
      // e o acesso nu só funciona por causa do global-object-is-window do
      // navegador. Isso torna o refino testável fora dele — e é a mesma
      // premissa de cronologia da exportação em .zip, que não pode ser
      // duplicada aqui sob risco de as duas divergirem em silêncio.
      const ord = window.PjeExport
        ? window.PjeExport.ordenarCronologico(docs).docs
        : docs.slice().reverse();
      // Procura a primeira PETIÇÃO, dentro de uma janela curta.
      //
      // "Parar na primeira peça que não for ruído" foi a primeira versão e
      // estava errada — o teste pegou: `RE_RUIDO` é conservadora de propósito e
      // NUNCA usa `certidao` sozinho (certidão de trânsito em julgado é ato
      // relevante), então "Certidão de Distribuição", que abre um número enorme
      // de processos, não é ruído. O laço parava nela e a promovia a "provável
      // inicial" — o erro silencioso que esta camada mais precisa evitar.
      //
      // A janela existe porque, sem ela, um processo que não tenha a inicial na
      // lista faria o laço varrer os autos inteiros e rotular de "inicial" uma
      // petição qualquer do meio. A inicial está entre as primeiras peças por
      // definição: se não está aqui, o sinal não é confiável e desistir é o
      // comportamento certo.
      const janela = Math.min(5, ord.length);
      for (let i = 0; i < janela; i++) {
        const c = clsPorId.get(ord[i].id);
        if (!c) continue;
        if (c.rel === "ruido") continue; // procuração, guia, AR: expediente
        // O título já reconheceu uma peça-chave aqui na abertura ("Petição
        // Inicial", "Denúncia", "Reclamação Trabalhista"): não há o que
        // promover, e seguir procurando só acharia uma petição POSTERIOR para
        // rotular de inicial.
        if (c.rel === "essencial") break;
        if (c.cat === "cat-peticao") {
          ajustes.set(ord[i].id, {
            rel: "essencial",
            motivo: "1ª petição do processo — provável inicial",
          });
          break;
        }
        // Certidão de distribuição, autuação, ofício de abertura: não são a
        // inicial, mas também não bloqueiam a busca por ela.
      }
    }

    // (2) AUTOR INSTITUCIONAL, só para PROMOVER.
    //
    // Rebaixar por quem juntou foi avaliado e DESCARTADO, por duas razões que
    // se somam. A estrutural: nenhum dos três degraus distingue `neutro` de
    // `ruido` (`principais` exclui os dois), então rebaixar não mudaria seleção
    // nenhuma — só criaria mais uma forma de a peça sumir sem ninguém ver. E a
    // de domínio: o caso que parece render, "Petição juntada pela secretaria",
    // é justamente onde a secretaria protocola petição de parte que chegou em
    // papel.
    for (const d of docs) {
      if (ajustes.has(d.id) || !d.juntadoPor) continue;
      const c = clsPorId.get(d.id);
      // Só onde o título e o tipo não disseram nada: quem juntou é DESEMPATE.
      // Sobrepor um RE_CHAVE que casou faria uma sentença virar outra coisa por
      // causa de quem a protocolou.
      if (!c || c.rel !== "neutro") continue;
      if (!RE_AUTOR_CONTEUDO.test(norm(d.juntadoPor))) continue;
      ajustes.set(d.id, {
        rel: "relevante",
        motivo: "juntada por órgão de atuação institucional",
      });
    }
    return ajustes;
  }

  // Aviso da lista possivelmente incompleta. Fora do painel ele é UM ÍCONE ⚠️
  // com este texto no title (o aviso ocupava duas linhas fixas na coluna); o
  // texto só volta a ser visível durante o carregamento, quando vira progresso.
  const TIP_PADRAO_ATTR =
    "O PJe só carrega as peças conforme a linha do tempo é rolada — esta lista " +
    "pode estar incompleta. Clique em “Carregar tudo” para rolar a " +
    "linha do tempo até o fim.";
  const TIP_PADRAO = TIP_PADRAO_ATTR;

  // Tooltip do medidor: no painel estreito o texto visível é a forma curta, e
  // a frase completa é acrescentada AQUI pelo setContexto — o dado nunca some.
  const GAUGE_TITLE =
    "Quanto do limite do modelo esta conversa já ocupa (tokens e páginas de " +
    "PDF). Ao encher, desmarque peças (libera espaço na hora) ou use o botão " +
    "“Nova conversa”, no cabeçalho.";

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

  // As @font-face vão para o <head> da PÁGINA, não para o Shadow DOM: regra
  // @font-face dentro de shadow tree é ignorada pela spec de CSS Scoping (e o
  // Chrome cumpre), então a família nunca seria registrada e todo o painel
  // cairia no fallback — em silêncio, sem erro no console. Injetar só
  // @font-face na página é inócuo: registra nomes, não altera nenhum estilo
  // dela. E o prefixo relativo precisa virar absoluto porque o CSS é injetado
  // como TEXTO (uma url() relativa resolveria contra o host do tribunal).
  // Ver DESIGN.md §3.
  function injetarFontes() {
    if (document.getElementById("pje-ia-fontes")) return;
    fetch(chrome.runtime.getURL("src/fontes.css"))
      .then((r) => r.text())
      .then((css) => {
        const el = document.createElement("style");
        el.id = "pje-ia-fontes";
        el.textContent = css.replaceAll(
          "../vendor/fontes/",
          chrome.runtime.getURL("vendor/fontes/")
        );
        (document.head || document.documentElement).appendChild(el);
      })
      .catch(() => {}); // sem fonte a stack de fallback assume; nada quebra
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
    injetarFontes();

    const iconUrl = chrome.runtime.getURL("icons/icon48.png");
    const wrap = document.createElement("div");
    wrap.className = "wrap pulse";
    wrap.innerHTML = `
      <div class="backdrop"></div>
      <button class="launcher"><span class="sc">${SVG.prompts}</span> Analisar com IA</button>
      <div class="panel">
        <div class="hd">
          <span class="mark"><img src="${iconUrl}" alt=""></span>
          <span class="tit-wrap">
            <span class="ttl">Assistente dos Autos</span>
            <span class="cnj-row">
              <span class="cnj" title="Número do processo em análise"></span>
              <button class="sigselo" hidden aria-expanded="false">${SVG.tarja}<span class="ss-a"></span><span class="ss-t"></span><span class="ss-n"></span></button>
            </span>
          </span>
          <div class="hd-grp">
            <button class="dl" title="Baixar a conversa em arquivo (.md)" aria-label="Baixar a conversa em arquivo">${SVG.download}</button>
            <button class="convs" title="Conversas guardadas deste processo" aria-label="Conversas guardadas deste processo" aria-haspopup="true" aria-expanded="false" hidden>${SVG.convs}<span class="convs-n" aria-hidden="true"></span></button>
            <button class="reset" title="Nova conversa — a atual fica guardada na lista ao lado" aria-label="Nova conversa">${SVG.reset}</button>
          </div>
          <div class="hd-grp">
            <button class="tema" title="Aparência do painel" aria-label="Aparência do painel" aria-haspopup="true" aria-expanded="false">${SVG.tema}</button>
            <button class="docsvis" title="Ocultar a lista de peças (mais espaço para o chat)" aria-label="Ocultar ou exibir a lista de peças" aria-pressed="false">${SVG.docshide}</button>
            <button class="expand" title="Painel largo (mostra as peças na lateral)" aria-label="Painel largo">${SVG.expand}</button>
            <button class="side" title="Painel lateral (mantém o processo visível ao lado)" aria-label="Painel lateral">${SVG.side}</button>
            <button class="free" title="Janela livre (arraste pelo título; redimensione pelo canto inferior direito)" aria-label="Janela livre">${SVG.free}</button>
            <button class="fs" title="Tela cheia" aria-label="Tela cheia">${SVG.fs}</button>
          </div>
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
                  <label class="all" title="Marca a espinha dorsal do processo: petição inicial, contestação, réplica, saneador, laudo, ata de instrução, memoriais, sentença, acórdão e recursos. Costumam ser cerca de uma dúzia de peças e respondem a maioria das perguntas."><input type="checkbox" class="chk-ess"><span class="op-l">chave</span><span class="op-s">chave</span></label>
                  <label class="all" title="Marca as peças de conteúdo — decisões, audiências, petições e provas —, deixando de fora o expediente (certidões de intimação, avisos de recebimento, guias, procurações). Respeita a busca ativa."><input type="checkbox" class="chk-main"><span class="op-l">principais</span><span class="op-s">princ.</span></label>
                  <label class="all" title="Marca todas as peças da lista (respeita a busca ativa)"><input type="checkbox" class="chk-all"><span class="op-l">todas</span><span class="op-s">todas</span></label>
                </span>
                <span class="sel-nota" hidden></span>
              </div>
            </div>
            <div class="legend" aria-hidden="true">
              <span><i class="l-dot cat-decisao"></i>decisões</span>
              <span><i class="l-dot cat-audiencia"></i>audiências</span>
              <span><i class="l-dot cat-peticao"></i>petições</span>
              <span><i class="l-dot cat-prova"></i>provas</span>
            </div>
            <div class="naosup" role="note" hidden></div>
            <div class="doclist" title="Arraste para marcar várias peças · Shift+clique marca até aqui · botão direito abre “marcar daqui para baixo/cima”"></div>
            <div class="docs-tip">
              <span class="tip-i" role="note" tabindex="0" title="${TIP_PADRAO_ATTR}" aria-label="${TIP_PADRAO_ATTR}">!</span>
              <span class="tip-txt"></span>
              <button type="button" class="tip-load" title="Rola a linha do tempo do processo automaticamente até o fim para carregar TODAS as peças do processo na lista">${SVG.reload}<span class="lbl">Carregar tudo</span></button>
              <button type="button" class="tip-ia" title="Envia à IA só a LISTA de peças (id, título, tipo e data — nenhum conteúdo) e pede que ela escolha as relevantes. Se houver texto no campo de pergunta, escolhe para AQUELA pergunta; vazio, escolhe as peças que descrevem o processo. Custa alguns centavos e leva poucos segundos.">${SVG.ia}<span class="lbl">Escolher com IA</span></button>
              <button type="button" class="tip-txt-ocr" title="Extrair o texto das peças para um arquivo .md — lê a camada de texto do PDF e aplica OCR local nas páginas digitalizadas. O texto NÃO vai para a conversa.">${SVG.extrairTexto}<span class="lbl">Extrair texto</span></button>
      <span class="zipwrap">
                <button type="button" class="tip-zip" title="Baixa os arquivos ORIGINAIS das peças (PDF, HTML) num único .zip, numerados na ordem do processo e com um índice de tipo, data e autor da juntada. Exporta as peças MARCADAS; sem nenhuma marcada, exporta todas as da lista.">${SVG.zip}<span class="lbl">Baixar .zip</span></button>
                <button type="button" class="tip-zip-mais" aria-haspopup="menu" aria-expanded="false" title="Outras formas de baixar — inclusive o pacote pronto de carta precatória" aria-label="Outras formas de baixar">${SVG.caret}</button>
              </span>
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
                  <button class="tgl-search" aria-pressed="false" title="Liga/desliga a busca de jurisprudência e legislação em fontes oficiais (STF, STJ, Planalto…). Com a busca ligada, escreva a pergunta e use o botão Enviar normalmente.">${SVG.juris}<span class="lbl">Jurisprudência</span></button>
                  <button class="tgl-sigilo" aria-pressed="false" title="Modo sigiloso: as peças deixam de ser enviadas como ARQUIVO e passam a ser enviadas como texto com nomes, CPF, OAB, endereços e o número do processo substituídos por rótulos ([PESSOA_1]). Todo o reconhecimento acontece no seu computador; o PDF não sai da máquina. Exigido pelo art. 19, §3º, IV da Resolução CNJ 615/2025 para processo em segredo de justiça.">${SVG.tarja}<span class="lbl">Sigiloso</span></button>
                  <button class="btn-minuta" title="Liga o modo minuta: a instrução aparece no campo (edite à vontade) e o botão Enviar vira “Gerar minuta” — a resposta abre num editor de texto, em nova aba, de onde você copia para o PJe, baixa em Word (.docx) ou imprime.">${SVG.minuta}<span class="lbl">Minutar</span></button>
                  <button class="btn-mapa" title="Liga o modo mapa mental: a instrução aparece no campo (edite à vontade) e o botão Enviar vira “Gerar mapa” — a resposta abre num mapa mental interativo, em nova aba.">${SVG.mapa}<span class="lbl">Mapa mental</span></button>
                  <button class="btn-plib" title="Seus prompts salvos: crie instruções reutilizáveis (título + texto) e insira-as na conversa digitando “/” no início do campo de mensagem. Sincronizam entre navegadores logados na mesma conta Google.">${SVG.prompts}<span class="lbl">Prompts</span></button>
                  <button class="btn-mlib" title="Seus modelos de peças (sentenças, decisões, despachos, ofícios…): cadastre várias por categoria e, ao gerar uma minuta, escolha a categoria para o assistente seguir a estrutura e o estilo dos seus modelos — os fatos continuam saindo só das peças do processo.">${SVG.modelos}<span class="lbl">Modelos</span></button>
                </div>
                <div class="metarow">
                  <div class="gauge" hidden title="${GAUGE_TITLE}">
                    <div class="gauge-bar"><div class="gauge-fill"></div></div>
                    <span class="gauge-txt"><span class="g-full"></span><span class="g-short"></span></span>
                  </div>
                  <div class="custo" hidden>
                    <span class="custo-txt"><span class="g-full"></span><span class="g-short"></span></span>
                  </div>
                  <button class="linhatempo" hidden aria-expanded="false">
                    ${SVG.relogio}<span class="lt-txt"><span class="g-full"></span><span class="g-short"></span></span>
                  </button>
                  <button class="selo-sigilo" hidden aria-expanded="false">${SVG.tarja}<span class="sl-l"></span><span class="sl-s"></span></button>
                  <button class="modelo-badge" hidden title="Modelo de IA em uso nesta conversa — clique para trocar nas opções da extensão"></button>
                  <span class="cite-note" hidden tabindex="0" role="note" title="Modelos Gemini: as citações de página aparecem no próprio texto da resposta (ex.: “conforme a Contestação, fl. 12”), sem os marcadores [n] automáticos dos modelos Claude." aria-label="Neste modelo as citações de página aparecem no próprio texto da resposta, sem os marcadores numerados dos modelos Claude.">${SVG.info}</span>
                </div>
              </div>
              <div class="minutabar" hidden>
                <span class="docxbar-t">${SVG.minuta} <b>Modo minuta ligado</b> — revise a instrução abaixo e clique em <b>Gerar minuta</b>: a resposta abre num editor, em nova aba, pronta para revisar e levar ao PJe.</span>
                <button class="minutabar-x" title="Cancelar a geração da minuta (Esc)">${SVG.x}</button>
                <div class="minuta-ato">
                  <span class="ma-lab">Espécie do ato:</span>
                  <select class="minuta-ato-sel" aria-label="Espécie do ato a minutar" title="A espécie define se a extensão precisa da sua orientação antes de redigir: atos que decidem exigem a tese; expediente, não."></select>
                </div>
                <div class="minuta-tese" hidden>
                  <label class="mt-lab">
                    <span class="mt-txt"></span>
                    <button class="mt-info" type="button" aria-label="Por que a extensão pede isto" title="Por que a extensão pede isto — Resolução CNJ 615/2025">${SVG.info}</button>
                  </label>
                  <textarea class="mt-txtarea" rows="2" spellcheck="true"></textarea>
                  <span class="mt-nota" hidden></span>
                  <button class="mt-analise" type="button" hidden title="Faz a pergunta no chat comum: a resposta é um estudo do que é cabível, com as origens e as ressalvas — não um ato pronto para assinar.">Analisar o que é cabível (no chat)</button>
                </div>
                <div class="minuta-modelo" hidden>
                  <span class="mm-lab">Seguir modelos:</span>
                  <select class="minuta-modelo-sel" aria-label="Categoria de peças-modelo que a minuta deve seguir" title="Escolha uma categoria: o assistente recebe as suas peças-modelo daquela espécie e segue a estrutura e o estilo da mais adequada ao caso — os fatos continuam vindo só das peças do processo."></select>
                  <span class="mm-vazio" hidden>nenhuma cadastrada — a minuta sai no estilo padrão</span>
                  <span class="mm-nota" hidden></span>
                  <button class="mm-add" hidden title="Cadastre uma sentença, decisão, despacho ou ofício seu: nas próximas minutas o assistente segue a estrutura e o estilo dela.">${SVG.novo}<span class="lbl">Cadastrar</span></button>
                </div>
                <div class="perfil-nota" hidden></div>
              </div>
              <div class="mapabar" hidden>
                <span class="docxbar-t">${SVG.mapa} <b>Modo mapa mental ligado</b> — revise a instrução abaixo e clique em <b>Gerar mapa</b>: a resposta vira um mapa mental interativo, que abre em nova aba.</span>
                <button class="mapabar-x" title="Cancelar a geração do mapa mental (Esc)">${SVG.x}</button>
              </div>
              <div class="promptbar" hidden></div>
              <div class="anexosbar" hidden></div>
              <div class="inrow">
                <button class="attach" title="Anexar arquivos (PDF, Word .docx, RTF, TXT ou Markdown) para analisar junto das peças — ou sozinhos" aria-label="Anexar arquivos">${SVG.clip}</button>
                <input type="file" class="attach-input" accept=".pdf,.docx,.rtf,.txt,.md,.markdown,text/plain,text/markdown,text/rtf,application/rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden aria-hidden="true">
                <textarea class="in" rows="1" placeholder="Pergunte sobre as peças… (@ cita uma peça · 📎 anexa arquivo)"></textarea>
                <button class="send"><span class="lbl">Enviar</span>${SVG.enviar}</button>
              </div>
              <div class="hint-key"><div class="hk-in"><b>@</b> cita peças &nbsp;·&nbsp; <b>/</b> insere um prompt salvo &nbsp;·&nbsp; <b>Enter</b> envia <span class="hk-shift">&nbsp;·&nbsp; <b>Shift+Enter</b> quebra linha</span></div></div>
            </div>
          </div>
        </div>
        <div class="plib" hidden>
          <div class="plib-card" role="dialog" aria-modal="true" aria-label="Prompts salvos" tabindex="-1">
            <div class="plib-hd">
              <span class="t">${SVG.prompts} Prompts salvos</span>
              <button class="plib-new">${SVG.novo}<span class="lbl">Novo</span></button>
              <button class="plib-close" title="Fechar (Esc)" aria-label="Fechar o gerenciador de prompts">${SVG.close}</button>
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
              <span class="t">${SVG.modelos} Modelos de peças</span>
              <button class="mlib-imp-btn plib-new" title="Importar peças-modelo de arquivos .docx ou .rtf — pode escolher vários de uma vez, e você confere tudo antes de cadastrar">${SVG.importar}<span class="lbl">Importar</span></button>
              <button class="mlib-new plib-new">${SVG.novo}<span class="lbl">Novo</span></button>
              <button class="mlib-close plib-close" title="Fechar (Esc)" aria-label="Fechar o gerenciador de modelos">${SVG.close}</button>
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
            <div class="mlib-imp" hidden>
              <div class="imp-rolo">
                <div class="imp-drop" role="button" tabindex="0" aria-label="Escolher arquivos .docx ou .rtf — ou arraste os arquivos até aqui">
                  ${SVG.importarG}
                  <span class="imp-drop-t">Arraste seus arquivos <b>.docx</b> ou <b>.rtf</b> até aqui</span>
                  <span class="imp-drop-s">ou clique para escolher — pode mandar vários de uma vez</span>
                </div>
                <div class="imp-prog" hidden>
                  <div class="imp-prog-hd">
                    <span class="imp-spin" aria-hidden="true"></span>
                    <span class="imp-prog-t" aria-live="polite">lendo os arquivos…</span>
                    <button class="imp-parar">Parar</button>
                  </div>
                  <div class="imp-bar"><i></i></div>
                </div>
                <div class="imp-fichas"></div>
                <div class="imp-res" hidden></div>
              </div>
              <div class="imp-acts" hidden>
                <button class="imp-cancel plib-cancel"><span class="lbl">Cancelar</span></button>
                <button class="imp-ok plib-save" aria-live="polite"><span class="lbl">Cadastrar</span></button>
              </div>
              <div class="imp-acts imp-acts-fim" hidden>
                <button class="imp-fechar plib-save">Voltar aos modelos</button>
              </div>
              <input type="file" class="imp-file" accept=".docx,.rtf" multiple hidden>
            </div>
          </div>
        </div>
        <div class="prec plib" hidden>
          <div class="prec-card plib-card" role="dialog" aria-modal="true" aria-label="Pacotes de carta precatória" tabindex="-1">
            <div class="plib-hd">
              <span class="t">${SVG.malote} Cartas precatórias</span>
              <button class="prec-close plib-close" title="Fechar (Esc)" aria-label="Fechar">${SVG.close}</button>
            </div>
            <div class="prec-intro"></div>
            <div class="prec-list"></div>
            <div class="plib-form-acts">
              <button class="prec-cancel plib-cancel">Cancelar</button>
              <button class="prec-ok plib-save">Baixar .zip</button>
            </div>
          </div>
        </div>
        <div class="gwarn plib" hidden>
          <div class="gwarn-card plib-card" role="dialog" aria-modal="true" aria-label="Antes de carregar a lista oficial" tabindex="-1">
            <div class="plib-hd">
              <span class="t">Antes de carregar a lista oficial</span>
              <button class="gwarn-close plib-close" title="Fechar (Esc)" aria-label="Fechar">${SVG.close}</button>
            </div>
            <div class="gwarn-body">
              <p>Para trazer a lista <b>completa</b> — com o tipo oficial de cada peça —, a
              extensão abre a tela “Documentos” do PJe e vira página por página. Cada
              virada conta como <b>uma tela nova</b> na sua sessão do PJe, e o PJe guarda
              poucas de cada vez.</p>
              <div class="gwarn-risco">Em processo grande, a aba pode voltar com
              <b>“Sua página expirou”</b> no próximo clique. É um limite do PJe, não uma
              falha da extensão — e a sessão continua válida: basta reabrir o processo.</div>
              <ul class="gwarn-list">
                <li><span class="gwarn-m">1</span><span><b>Feche as outras abas do PJe antes.</b>
                Todas as abas do navegador dividem a <b>mesma</b> sessão, e cada uma já
                ocupa um lugar — é o que mais muda o resultado.</span></li>
                <li><span class="gwarn-m">2</span><span><b>Carregue antes de conversar.</b>
                Assim, se a tela expirar, você reabre o processo sem interromper nada
                pela metade.</span></li>
                <li><span class="gwarn-m">3</span><span><b>Nada se perde</b>, em nenhum caso:
                a conversa e as peças já baixadas ficam guardadas. E esta leitura vale
                <b>por processo</b> — na próxima vez a lista volta do disco, sem tocar no PJe.</span></li>
              </ul>
            </div>
            <label class="gwarn-nao"><input type="checkbox" class="gwarn-cb"> Não mostrar este aviso de novo</label>
            <div class="plib-form-acts">
              <button class="gwarn-cancel plib-cancel">Agora não</button>
              <button class="gwarn-ok plib-save">Carregar lista</button>
            </div>
          </div>
        </div>
        <div class="sigok plib" hidden>
          <div class="sigok-card plib-card" role="dialog" aria-modal="true" aria-label="Conferir antes de enviar" tabindex="-1">
            <div class="plib-hd">
              <span class="t">${SVG.tarja}Conferir antes de enviar</span>
              <button class="sigok-close plib-close" title="Fechar (Esc)" aria-label="Fechar">${SVG.close}</button>
            </div>
            <div class="sigok-body">
              <p class="sigok-resumo"></p>
              <div class="sigok-chips"></div>
              <div class="sigok-nota"><b>Nada foi enviado ainda.</b> A detecção automática pode deixar
              passar um nome ou um número, e o que escapar vai inteiro para a IA. Abra cada
              peça e confira o texto que sai — edite ou libere o que for preciso.</div>
              <div class="sigok-list"></div>
            </div>
            <label class="sigok-nao"><input type="checkbox" class="sigok-cb"> Não perguntar de novo (dá para reativar nas Configurações)</label>
            <div class="plib-form-acts">
              <button class="sigok-cancel plib-cancel">Cancelar envio</button>
              <button class="sigok-ok plib-save">Enviar</button>
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
    // Os três degraus de seleção, do mais enxuto ao mais amplo
    const chkEss = $(".chk-ess");
    const chkAll = $(".chk-all");
    const chkMain = $(".chk-main");
    const selNota = $(".sel-nota");
    const countEl = $(".count");
    const railNEl = $(".rail-n"); // badge da aba vertical (lista recolhida)
    const docQ = $(".doc-q");
    const docQN = $(".doc-q-n");
    const naoSupBox = $(".naosup");
    const tipBox = $(".docs-tip");
    const tipTxt = $(".tip-txt");
    const tipLoad = $(".tip-load");
    const tipZip = $(".tip-zip");
    const tipIa = $(".tip-ia");
    const tipOcr = $(".tip-txt-ocr");
    // `{titulo, texto}` quando esta página é de um PJe cujo dialeto a extensão
    // ainda não lê (ver `PJE.dialeto`); `null` no caso normal, que é o de todos
    // os tribunais suportados — nada aqui muda para eles.
    //
    // O estado mora no PAINEL, e não só no content.js, porque é a coluna de
    // peças inteira que troca de recado: a lista vazia deixa de ser "não achei
    // nada NESTA TELA" (que sugere rolar, clicar, tentar de novo) e passa a ter
    // causa e nome. Declarado AQUI, no topo, junto dos elementos que ele
    // governa — a armadilha da zona morta temporal vale neste arquivo também.
    let naoSuportado = null;
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
    const ltEl = $(".linhatempo");
    const ltFull = $(".lt-txt .g-full");
    const ltShort = $(".lt-txt .g-short");
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
    // A lista já tem o TIPO oficial (tela "Documentos" do PJe)? Sem ele a
    // classificação sai só do título — que costuma ser o nome do arquivo — e o
    // degrau "chave" seleciona de menos. Não desabilitamos a opção por isso (o
    // título ainda acerta "Sentença", "Petição Inicial", "Contestação",
    // "Laudo"), mas o clique passa a dizer que dá para melhorar.
    let temTipoOficial = false;
    // Peças que JÁ foram enviadas nesta conversa. O anexo é incremental (cada
    // peça entra no histórico uma única vez), então numa conversa longa o
    // usuário perde a conta do que já mandou — e desmarcar/remarcar uma peça
    // que já está no contexto não custa nada, enquanto marcar uma nova custa
    // download, upload e tokens. O dado vive no content script; o painel só o
    // reflete, via setPecasEnviadas.
    let pecasEnviadas = new Set();

    // -------------------------------------------------------------------------
    // Conversas guardadas do processo. O menu é `position: fixed` pela mesma
    // razão do `.selmenu` e da `.confirmbox`: o `.wrap` é um container de
    // tamanho ZERO (quem tem dimensão é o `.panel`), e posicionar por dentro
    // dele jogaria o menu para fora da tela.
    // -------------------------------------------------------------------------
    let convLista = [];
    let convAtualId = null;
    let trocarConvCb = null;
    let apagarConvCb = null;
    let convMenu = null;
    const convBtn = $(".convs");

    function fecharConvMenu() {
      if (!convMenu) return;
      convMenu.remove();
      convMenu = null;
      convBtn.setAttribute("aria-expanded", "false");
    }

    function abrirConvMenu() {
      fecharConvMenu();
      convMenu = document.createElement("div");
      convMenu.className = "convmenu";
      const h = document.createElement("div");
      h.className = "cm-h";
      h.textContent = "Conversas deste processo";
      convMenu.appendChild(h);

      // "Nova conversa" DENTRO da lista, além do botão do cabeçalho. Quem abre a
      // lista está justamente decidindo entre continuar uma e começar outra — e
      // é aqui que a ação faz sentido no fluxo, não num ícone vizinho que já se
      // confundia com este. Duplicar um comando é barato; obrigar a fechar o
      // menu para achar o botão certo não é.
      const nova = document.createElement("button");
      nova.type = "button";
      nova.className = "cm-nova";
      nova.innerHTML = SVG.reset + "<span>Nova conversa</span>";
      nova.addEventListener("click", (e) => {
        e.stopPropagation();
        fecharConvMenu();
        if (resetCb) resetCb();
      });
      convMenu.appendChild(nova);

      for (const c of convLista) {
        const row = document.createElement("div");
        row.className = "cm-row" + (c.convId === convAtualId ? " atual" : "");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cm-abrir";
        // textContent, nunca innerHTML: o título é a primeira pergunta do
        // usuário, que pode conter qualquer coisa vinda dos autos.
        const tt = document.createElement("span");
        tt.className = "cm-t";
        tt.textContent = c.titulo || "Conversa sem pergunta";
        const meta = document.createElement("span");
        meta.className = "cm-m";
        meta.textContent =
          (c.convId === convAtualId ? "aberta agora · " : "") +
          c.mensagens + " mensagem(ns)";
        b.appendChild(tt);
        b.appendChild(meta);
        b.addEventListener("click", () => {
          fecharConvMenu();
          if (c.convId !== convAtualId && trocarConvCb) trocarConvCb(c.convId);
        });
        row.appendChild(b);

        // Excluir em DOIS cliques, como em toda exclusão da extensão.
        const x = document.createElement("button");
        x.type = "button";
        x.className = "cm-x";
        x.title = "Excluir esta conversa";
        x.textContent = "excluir";
        let armado = false;
        x.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!armado) {
            armado = true;
            x.classList.add("armado");
            x.textContent = "excluir?";
            setTimeout(() => {
              if (!armado) return;
              armado = false;
              x.classList.remove("armado");
              x.textContent = "excluir";
            }, 4000);
            return;
          }
          if (apagarConvCb) apagarConvCb(c.convId);
          row.remove();
        });
        row.appendChild(x);
        convMenu.appendChild(row);
      }

      // O rodapé responde, no lugar em que a dúvida nasce, as duas perguntas
      // que o menu levanta: onde isto está guardado e se vale para todos os
      // processos. A resposta é o modelo mental do recurso — a memória é por
      // processo (host + grau + id) e mora só neste computador.
      const rod = document.createElement("div");
      rod.className = "cm-f";
      rod.textContent =
        "Guardadas neste computador, separadas por processo — cada processo tem a sua lista.";
      convMenu.appendChild(rod);

      wrap.appendChild(convMenu);
      const r = convBtn.getBoundingClientRect();
      convMenu.style.top = Math.round(r.bottom + 6) + "px";
      // Ancorado à DIREITA do botão: o menu tem ~300px e o cabeçalho fica no
      // canto direito do painel — alinhar pela esquerda o jogaria para fora.
      convMenu.style.left =
        Math.max(8, Math.round(r.right - convMenu.offsetWidth)) + "px";
      convBtn.setAttribute("aria-expanded", "true");
    }

    convBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (convMenu) fecharConvMenu();
      else abrirConvMenu();
    });
    // Fecha ao clicar fora e no Esc, como os demais popovers do painel.
    root.addEventListener("click", () => fecharConvMenu());

    // Seleção restaurada da memória de caso, esperando as rows aparecerem. A
    // timeline do PJe é lazy: no boot só existe o trecho já rolado, e as demais
    // peças chegam pelo MutationObserver minutos depois. Cada id é aplicado UMA
    // vez (o `delete` no setDocs) — assim uma peça que o usuário desmarcou de
    // propósito não volta marcada no próximo re-render da lista.
    let selPendente = null;

    // -------------------------------------------------------------------------
    // Estado vazio em camadas (progressive disclosure): três passos + exemplos
    // clicáveis sempre visíveis; o texto explicativo mora num <details> fechado
    // por padrão (estado lembrado); a referência completa (tabela de modelos,
    // preços, fluxo, dicas de cache) vive só no help.html — o painel APONTA
    // para ela em vez de recitá-la, que era a origem da parede de texto.
    // -------------------------------------------------------------------------
    let hintEl = null;
    let guiaAberta = false;
    // Tour de primeiro uso — dependência OPCIONAL, como MLIB e DocxImport: sem
    // o arquivo, o convite some e o resto funciona.
    // ARMADILHA DA ZONA MORTA TEMPORAL (a mesma documentada para o content.js):
    // `showEmptyHint()` é chamado ~100 linhas ABAIXO, antes de `open`,
    // `aplicarModo` e `setDocsOcultas` existirem — então a INSTÂNCIA do tour não
    // pode ser criada aqui. Só o flag mora no topo (é ele que o estado vazio lê
    // para desenhar o convite); `tourInst` é preenchido lá embaixo, e o handler
    // do clique só o lê quando o usuário clica, quando já existe.
    const temTour = typeof PjeTour !== "undefined";
    // Declarado AQUI, junto do `temTour`, e não lá embaixo com os outros
    // helpers: `showEmptyHint()` roda poucas linhas adiante e lê os dois. Um
    // `const` depois dela lançaria "Cannot access before initialization" dentro
    // do `setDocs`, derrubando o resto do content script em silêncio (a zona
    // morta temporal descrita no CLAUDE.md).
    let urlApoio = "";
    let urlWhats = "";
    try {
      urlApoio = chrome.runtime.getURL("src/help.html") + "#apoiar";
      // A VERSÃO vai na mensagem pronta. É o dado que todo relato esquece e que
      // decide se o bug é conhecido ou novo — perguntá-lo depois custa uma ida e
      // volta, e o usuário já fechou a tela onde ele aparece.
      const v = chrome.runtime.getManifest().version;
      urlWhats =
        "https://wa.me/5588993650420?text=" +
        encodeURIComponent("Olá! Sobre a extensão TecJustiça PJe (v" + v + "): ");
    } catch {
      /* fora da extensão (harness de teste) — as frases saem sem os links */
    }
    let tourInst = null;
    function abrirTour() {
      if (tourInst) tourInst.iniciar();
    }
    function showEmptyHint() {
      if (hintEl || msgs.querySelector(".msg")) return;
      hintEl = document.createElement("div");
      hintEl.className = "hint-empty";
      hintEl.innerHTML =
        '<span class="big">Como posso ajudar?</span>' +
        '<div class="passos">' +
        '<div class="passo"><span class="pn">1</span><b>Marque as peças</b>' +
        // "ao lado" só é verdade nos modos largos: no estreito a lista fica
        // ACIMA do chat. Duas versões no DOM, escolha no CSS — mesmo mecanismo
        // dos rótulos longo/curto do segmented (.op-l/.op-s).
        '<span><span class="p-lado">na lista ao lado</span>' +
        '<span class="p-gaveta">na gaveta acima</span> — <b>chave</b> traz a ' +
        "espinha dorsal do processo; há também a busca e o <b>@</b> no campo</span></div>" +
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
        // Convite PERMANENTE ao tour. A visita guiada abre sozinha uma única vez
        // (primeiro uso); daí em diante o caminho de volta é este botão, que
        // vive no estado vazio de toda conversa nova e some com a 1ª mensagem —
        // pelo mesmo motivo do resto do bloco: descoberta é assunto de quem
        // ainda não começou, e nada disso pode aparecer entre a pergunta e a
        // resposta.
        // As duas pílulas de descoberta vivem numa FILEIRA (wrap), não empilhadas:
        // dois botões de mesmo desenho um sob o outro leem-se como lista de menu,
        // que é a confusão que a nota do .hint-tour descreve. A margem que separa
        // do <details> migrou para o wrapper — no botão ela empurraria só a
        // primeira linha quando a fileira quebrasse no painel estreito.
        '<div class="hint-acoes">' +
        (temTour
          ? '<button type="button" class="hint-tour" title="Visita guiada pelos recursos do painel — cerca de um minuto, sem alterar nada no seu processo">' +
            SVG.play +
            'Ver como funciona<span class="ht-dur">1 min</span></button>'
          : "") +
        // Anonimização na origem (art. 19, §3º, IV da Res. CNJ 615): a extensão
        // manda as peças marcadas direto à API de um provedor privado, e o
        // guia já ENUNCIA esse dever sem oferecer caminho nenhum.
        //
        // ATÉ A v0.54 O CAMINHO ERA UM PROGRAMA SEPARADO (o TecJustiça Sigilo), e
        // esta dica dizia isso. Deixou de ser verdade: a anonimização passou a
        // ser NATIVA (botão 🔒 Sigiloso na barra). Uma frase que ERA verdade é o
        // modo de falha que este projeto já registrou duas vezes — por isso ela
        // mudou junto com a feature, e não depois.
        //
        // O clique continua abrindo o GUIA, e não ligando o modo: quem chega
        // aqui está descobrindo o assunto, e ligar um modo que muda o que sai da
        // máquina sem explicar antes é o oposto do que o aviso existe para
        // fazer. O guia explica e o botão da barra liga.
        '<button type="button" class="hint-sigilo" title="Processo em segredo de justiça? A extensão pode anonimizar as peças no seu próprio computador antes de enviar: nomes, CPF, OAB, endereços e o número do processo viram rótulos, e o PDF não sai da máquina. Abre o guia; para ligar, use o botão Sigiloso na barra de ferramentas.">' +
        SVG.escudo +
        'Anonimizar dados sigilosos<span class="hs-sel">no seu PC</span></button>' +
        "</div>" +
        '<details class="guia"' +
        (guiaAberta ? " open" : "") +
        // O summary nomeia a VELOCIDADE de propósito: o parágrafo sobre rede é
        // o mais acionável do guia (cabo em vez de Wi-Fi muda a experiência
        // inteira) e ficava atrás de um rótulo — "limites e alternativas" — que
        // não prometia falar disso. Ninguém abre um acordeão para descobrir o
        // que não sabe que está lá dentro.
        //
        // Mas ele NÃO pode mais começar por "Como funciona": o botão do tour,
        // logo acima, chama-se "Ver como funciona" e também abre com um
        // triângulo. Dois controles empilhados, com o mesmo ícone e a mesma
        // primeira palavra, liam-se como um só — e o que se perdia era
        // justamente a visita guiada, que é o onboarding. O rótulo passa a
        // nomear o CONTEÚDO (limites e privacidade), preservando a promessa de
        // velocidade que o parágrafo de rede cumpre.
        "><summary>Limites, privacidade e o que deixa mais rápido</summary>" +
        "<p><b>Não é um agente autônomo</b> (como o Claude Code): ele não navega no " +
        "processo sozinho. Você marca as peças, envia a solicitação e a resposta usa " +
        "somente os documentos marcados — dá para marcar e desmarcar entre uma " +
        "pergunta e outra.</p>" +
        "<p><b>A lista pode vir incompleta:</b> o PJe só carrega as peças conforme a " +
        "linha do tempo é rolada. Antes de procurar uma peça antiga, use " +
        "<b>Carregar tudo</b>, abaixo da lista.</p>" +
        "<p><b>O contexto é limitado:</b> peças, perguntas e respostas precisam caber " +
        "na janela do modelo. O medidor ao lado das ferramentas mostra o quanto já foi " +
        "usado; se encher, desmarque peças (libera espaço na hora) ou comece uma " +
        "conversa nova.</p>" +
        // O gargalo real do produto, e o que mais surpreende quem começa: a
        // espera não é da IA, é do tribunal entregando peça por peça. Fica no
        // guia (fechado por padrão) para não engordar o estado vazio, mas com
        // destaque próprio — é a diferença entre "a extensão é lenta" e "a
        // minha conexão está ruim".
        "<p><b>Sua conexão manda no tempo de espera:</b> o PJe entrega as peças " +
        "<b>uma de cada vez</b> (cerca de 5 s cada). No Wi-Fi instável isso se " +
        "multiplica por dezenas de documentos e a extensão parece travada, quando na " +
        "verdade está esperando o tribunal. <b>Cabo de rede faz muita diferença</b> — " +
        "e marcar só as peças que interessam, mais ainda.</p>" +
        '<p>Para autos muito grandes, conheça o <a href="https://mcp.tecjustica.com/" ' +
        'target="_blank" rel="noopener">TecJustiça MCP</a>, em que o contexto do processo ' +
        "é gerenciado automaticamente pelo código, e a demonstração com o PJe do Ceará em " +
        '<a href="https://pjece.tecjustica.com/" target="_blank" rel="noopener">' +
        "pjece.tecjustica.com</a>.</p>" +
        // Apoio ao projeto: UMA linha, no fim de um acordeão FECHADO por padrão
        // e só no estado vazio (some no primeiro turno). O painel é ferramenta
        // de trabalho — pedido de assinatura entre a pergunta e a resposta
        // cobraria pedágio no meio da análise dos autos. A caixa completa vive
        // na ajuda, nas novidades e na configuração.
        // Canal de suporte DENTRO do guia, e não solto no estado vazio: quem
        // precisa dele já teve um problema, e um convite a reclamar exposto o
        // tempo todo sugere que reclamar é o esperado. Fica ANTES do parágrafo
        // de apoio — primeiro o que resolve a vida de quem está travado.
        (urlWhats
          ? "<p><b>Deu problema, ou faltou alguma coisa?</b> Me chame no " +
            '<a href="' +
            escapeHtml(urlWhats) +
            '" target="_blank" rel="noopener">WhatsApp</a> e diga o tribunal e o ' +
            "que aconteceu — a versão da extensão já vai junto na mensagem. " +
            "<b>Não mande conteúdo de processo em segredo de justiça</b>: descreva " +
            "o problema sem os autos.</p>"
          : "") +
        "<p><b>Gratuita e de código aberto.</b> Se estiver sendo útil, você pode apoiar " +
        'os próximos projetos assinando o <a href="https://tecjustica.substack.com/" ' +
        'target="_blank" rel="noopener">TecJustiça</a> — R$ 10 por mês' +
        // O PIX é uma LINHA aqui, e o QR mora nas telas satélites: este
        // parágrafo já é o limite do que se pode pedir dentro da ferramenta de
        // trabalho (ver a regra da `.apoio` em ui.css). Sem a URL — harness de
        // teste, contexto invalidado — a frase degrada para texto sem link, e
        // nada quebra.
        (urlApoio
          ? ' — ou <a href="' +
            escapeHtml(urlApoio) +
            '" target="_blank" rel="noopener">uma Heineken por PIX</a>, de uma vez só'
          : "") +
        ". Nenhum recurso daqui é pago.</p>" +
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
      const btnTour = hintEl.querySelector(".hint-tour");
      // `abrirTour` lê `tourInst` NO CLIQUE — quando este handler é registrado a
      // instância ainda não existe (ver a nota da zona morta temporal acima).
      if (btnTour) btnTour.addEventListener("click", abrirTour);
      const btnSig = hintEl.querySelector(".hint-sigilo");
      if (btnSig) btnSig.addEventListener("click", () => abrirAjuda("sigilo"));
      hintEl.querySelector(".hint-help").addEventListener("click", () => abrirAjuda(""));
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

    // O chamado do launcher (ver `.chamando` no panel.css) vale só para quem
    // NUNCA abriu o painel — depois de atendido, ele vira ruído no canto da
    // tela, e ruído no canto é o que ensina o usuário a ignorar aquele pedaço.
    //
    // O ESTADO mora nas classes do wrap, não numa variável espelho: uma
    // variável "já usou" inicializada de forma pessimista fazia o `open` que
    // acontece ANTES da resposta do storage (o content.js abre o painel em
    // alguns caminhos) sair pela guarda sem gravar nada — e o chamado voltava
    // na carga seguinte, para quem já tinha usado. `jaGravou` é só para não
    // repetir a escrita, e a declaração vem antes de `open`, que a consome
    // (a armadilha da zona morta temporal vale aqui dentro também).
    let jaGravou = false;
    function marcarLauncherUsado() {
      wrap.classList.remove("chamando");
      if (jaGravou) return;
      jaGravou = true;
      try {
        chrome.storage.local.set({ launcherUsado: true });
      } catch {
        /* contexto da extensão invalidado — segue sem persistir */
      }
    }
    function open() {
      wrap.classList.add("open");
      wrap.classList.remove("pulse");
      marcarLauncherUsado(); // abrir pelo botão ou pela API conta como uso
    }
    launcher.addEventListener("click", open);
    // O `get` vem DEPOIS de `open`/`marcarLauncherUsado` existirem: o stub de
    // teste chama o callback de forma síncrona, a mesma armadilha já
    // documentada para `docsOcultas` e `guiaAberta`.
    try {
      chrome.storage.local.get(["launcherUsado"], (v) => {
        if (v && v.launcherUsado) return;
        // Painel já aberto quando a resposta chegou: isso É uso. Grava e
        // NUNCA liga o chamado — ligá-lo aqui o deixaria armado para quando o
        // usuário fechasse o painel que ele mesmo acabou de usar.
        if (wrap.classList.contains("open")) return marcarLauncherUsado();
        wrap.classList.add("chamando");
      });
    } catch {
      /* fora da extensão (harness de teste): sem chamado, nada quebra */
    }

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
    // Nos modos largos a lista de peças é uma COLUNA estreita (320px), não a
    // faixa de 460px do flutuante — e ali o exemplo do placeholder não cabe:
    // o campo fica com ~137px e o texto sai cortado no meio da palavra, que
    // lê como defeito. O exemplo é uma dica de descoberta e vale nos modos em
    // que há espaço para ele. Chamado por aplicarModo, o ponto único de
    // transição de layout.
    const PH_BUSCA_LONGO = "Buscar peça… (ex.: contestação)";
    const PH_BUSCA_CURTO = "Buscar peça…";
    function ajustarPlaceholderBusca() {
      const estreito =
        wrap.classList.contains("expanded") ||
        wrap.classList.contains("full") ||
        wrap.classList.contains("livre-wide");
      docQ.placeholder = estreito ? PH_BUSCA_CURTO : PH_BUSCA_LONGO;
    }

    // TROCA DE MODO ANIMADA (FLIP). Os modos trocam `position`, `width`,
    // `height`, `top/left` e até o `transform` de centragem — nada disso
    // interpola por transição CSS entre `absolute` e `fixed`. O que interpola é
    // a DIFERENÇA: mede-se a janela ANTES, aplica-se o modo, mede-se DEPOIS, e
    // uma animação WAAPI no `transform` leva do retângulo velho ao novo. Corre
    // no compositor (não é o rAF de biblioteca que o Chrome congela em aba de
    // fundo — e em aba de fundo ninguém está olhando de todo jeito).
    //
    // `transform-origin: 0 0` inline durante a animação, porque a conta abaixo
    // é feita no canto superior esquerdo; e a transform BASE do modo de destino
    // (o `translate(-50%, -50%)` do expandido) entra nos DOIS keyframes, lida
    // do estilo computado já em px, senão o primeiro frame perderia a
    // centragem e a janela pularia.
    let flipAnim = null;
    // A origem inline que estava ANTES de qualquer FLIP, capturada UMA vez
    // enquanto nenhum está ativo. Dois cliques rápidos no mesmo botão de modo
    // cancelam o primeiro FLIP com o segundo já em voo; `cancel()` dispara o
    // handler de forma assíncrona, e se cada chamada capturasse "a origem de
    // agora" a segunda leria o "0 0" da primeira e o gravaria para sempre —
    // toda abertura seguinte encolheria para o canto superior esquerdo em vez
    // de voltar ao botão. Por isso a origem é única e os handlers só agem se a
    // animação que terminou é a CORRENTE.
    let origemFlip = null;
    function flipJanela(antes) {
      if (!antes || !panelEl.animate) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // A TRANSIÇÃO CSS DE `transform` É DESLIGADA PARA MEDIR. A troca de classe
      // muda a transform base (nenhuma → `translate(-50%, -50%)` no expandido),
      // e o `.panel` tem `transition: transform`: no instante seguinte à troca a
      // transform COMPUTADA ainda é a antiga (a transição está no frame zero),
      // e `getBoundingClientRect` também. Medido: a base lida era a identidade,
      // o FLIP terminava com a janela no canto e ela SALTAVA para o centro no
      // fim — "vai para a esquerda e volta para o meio". Com a transição
      // desligada e um reflow, o computado é o destino de verdade; a transição
      // volta no tick seguinte, quando já não há mudança a que reagir.
      const transAntes = panelEl.style.transition;
      panelEl.style.transition = "none";
      void panelEl.offsetWidth;
      const depois = panelEl.getBoundingClientRect();
      const religar = () => {
        panelEl.style.transition = transAntes;
      };
      if (!depois.width || !depois.height || !antes.width || !antes.height) return religar();
      const dx = antes.left - depois.left;
      const dy = antes.top - depois.top;
      const sx = antes.width / depois.width;
      const sy = antes.height / depois.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return religar();
      const cs = getComputedStyle(panelEl);
      const base = cs.transform && cs.transform !== "none" ? cs.transform + " " : "";
      setTimeout(religar, 0);
      if (flipAnim) {
        const velha = flipAnim;
        flipAnim = null;
        velha.cancel();
      } else {
        origemFlip = panelEl.style.transformOrigin;
      }
      panelEl.style.transformOrigin = "0 0";
      const anim = panelEl.animate(
        [
          { transform: base + "translate(" + dx + "px, " + dy + "px) scale(" + sx + ", " + sy + ")" },
          { transform: base || "none" },
        ],
        { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
      flipAnim = anim;
      const fim = () => {
        if (flipAnim !== anim) return; // uma mais nova assumiu; ela restaura
        panelEl.style.transformOrigin = origemFlip || "";
        origemFlip = null;
        flipAnim = null;
      };
      anim.onfinish = fim;
      anim.oncancel = fim;
    }
    // O FLIP está em voo? O ResizeObserver do modo livre pergunta antes de
    // gravar geometria.
    function flipEmVoo() {
      return flipAnim !== null;
    }

    function aplicarModo(modo) {
      hidePreview(); // a posição do popover fica inválida ao trocar o layout
      // Só há o que animar se a janela está aberta e o modo muda de verdade.
      const antes =
        wrap.classList.contains("open") && modoAtual() !== modo
          ? panelEl.getBoundingClientRect()
          : null;
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
      // reavalia as classes de LARGURA aqui também: o ResizeObserver não dispara
      // quando o painel troca de modo sem mudar de largura (flutuante ⇄ lateral
      // numa janela estreita têm os mesmos 420px), e é ele quem chama o
      // ajustarPlaceholderBusca.
      atualizarLargura();
      flipJanela(antes);
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
    // Abaixo deste limiar cabe UMA fileira de botões e UMA coluna: entra a
    // classe .estreito (DESIGN.md §5). NÃO é uma classe do modo lateral — o
    // flutuante também tem 420px e a janela livre desce até 340. O piso de 1
    // ignora o painel FECHADO, cujo offsetWidth é 0 (`.wrap.open .panel` é que
    // liga o display): sem essa guarda a classe entraria com o painel oculto e
    // o layout piscaria na abertura.
    const ESTREITO_PX = 520;
    function atualizarLargura() {
      const w = panelEl.offsetWidth;
      const on = wrap.classList.contains("livre") && w >= LIVRE_LARGO_PX;
      if (on !== wrap.classList.contains("livre-wide")) hidePreview(); // âncora muda de lugar
      wrap.classList.toggle("livre-wide", on);
      const estreito = w >= 1 && w < ESTREITO_PX;
      if (estreito !== wrap.classList.contains("estreito")) hidePreview();
      wrap.classList.toggle("estreito", estreito);
      // as classes de largura são alternadas AQUI, não em aplicarModo (media
      // query mede a viewport e erraria no modo livre) — então o placeholder da
      // busca, que depende da largura da COLUNA de peças, também precisa ser
      // reavaliado.
      ajustarPlaceholderBusca();
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
      atualizarLargura();
    }
    function limparGeoLivre() {
      panelEl.style.left = "";
      panelEl.style.top = "";
      panelEl.style.width = "";
      panelEl.style.height = "";
    }
    let geoTimer = null;
    // `conhecida` ({left, top, width, height}) evita a MEDIÇÃO quando o chamador
    // já sabe a geometria — e no arrasto ele sabe, porque acabou de calculá-la.
    // Não é otimização: durante o arrasto o painel está com `scale(1.005)` e
    // `getBoundingClientRect` INCLUI o transform, então medir ali gravaria uma
    // janela meio por cento maior a cada arrasto, cumulativamente. As medidas do
    // arrasto vêm de `offsetWidth`/`offsetHeight`, que são de LAYOUT e imunes ao
    // transform. O ResizeObserver segue medindo: lá nunca há `.movendo`.
    function salvarGeoLivre(conhecida) {
      const r = conhecida || panelEl.getBoundingClientRect();
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
      // `g` é a geometria de LAYOUT desta janela, mantida atualizada a cada
      // movimento e entregue ao `salvarGeoLivre` no fim — ver a nota lá.
      arrasto = {
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        g: {
          left: r.left,
          top: r.top,
          width: panelEl.offsetWidth,
          height: panelEl.offsetHeight,
        },
      };
      panelEl.classList.add("movendo"); // ergue: sombra mais funda + 0,5% de escala
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
      arrasto.g = { left: g.x, top: g.y, width: g.w, height: g.h };
    });
    const fimArrasto = () => {
      if (!arrasto) return;
      const g = arrasto.g;
      arrasto = null;
      panelEl.classList.remove("movendo"); // pousa (a transição leva 120ms)
      salvarGeoLivre(g); // NUNCA medir aqui: o transform ainda está em voo
    };
    hdEl.addEventListener("pointerup", fimArrasto);
    hdEl.addEventListener("pointercancel", fimArrasto);
    // A alça nativa de resize não emite evento próprio — o observer persiste.
    // Guardas: só no modo livre (ele também dispara em toda troca de layout)
    // e com o painel aberto (fechado, o rect é 0x0 e apagaria a geometria).
    const roLivre = new ResizeObserver(() => {
      atualizarLargura();
      // Durante o FLIP da troca de modo o painel está com um `transform` de
      // escala, e `getBoundingClientRect` o INCLUI (a mesma razão de o arrasto
      // passar uma geometria conhecida): gravar aqui persistiria uma janela
      // pela metade. `aplicarGeoLivre` já escreveu os valores certos inline;
      // a saída do modo e o próximo resize gravam de novo.
      if (
        wrap.classList.contains("livre") &&
        wrap.classList.contains("open") &&
        !arrasto &&
        !flipEmVoo()
      )
        salvarGeoLivre();
    });
    roLivre.observe(panelEl);

    // ------------------------------------------------------------- TEMAS
    //
    // Um tema é um bloco de overrides de token no `panel.css`, selecionado por
    // `[data-tema]` no `.wrap`. Aqui não há CSS nenhum: trocar de tema é trocar
    // um ATRIBUTO. Isso importa porque o `panel.css` é buscado UMA vez no
    // `mount()` e nunca reinjetado — se o tema dependesse do arquivo, mudá-lo
    // ao vivo exigiria um segundo fetch e uma janela de FOUC.
    // As três cores de cada amostra são CHROME · ACENTO · SUPERFÍCIE, na ordem
    // em que aparecem no painel. Quando a chrome é gradiente, a amostra leva a
    // parada do MEIO — é a que domina os 60px do cabeçalho. Amostra que não
    // corresponde à paleta é pior que amostra nenhuma: ela promete uma cara e
    // entrega outra no clique.
    const TEMAS = [
      { id: "", nome: "Azul TecJustiça", amostra: ["#0e4459", "#2e7e9c", "#ffffff"] },
      { id: "noite", nome: "Noite", amostra: ["#122734", "#56c2e8", "#14252f"] },
      { id: "papel", nome: "Papel", amostra: ["#efe7d9", "#2c7189", "#fdfbf6"] },
      { id: "vidro", nome: "Vidro", amostra: ["#dbeef9", "#2e7e9c", "#f2f9fd"] },
      { id: "toga", nome: "Toga", amostra: ["#6b2537", "#93374b", "#fffbfc"] },
      { id: "rosa", nome: "Rosa", amostra: ["#c41f6a", "#d5327f", "#fdeff6"] },
    ];
    let temaAtual = "";

    // Declarada ANTES do `storage.get` que a chama. Não é estilo: o stub de
    // teste executa o callback de forma SÍNCRONA, e uma função declarada
    // depois estaria na zona morta temporal — a mesma armadilha que já mordeu
    // `docsOcultas`, `guiaAberta` e `launcherUsado`.
    function aplicarTema(id, gravar) {
      const valido = TEMAS.some((t) => t.id === id) ? id : "";
      temaAtual = valido;
      if (valido) wrap.setAttribute("data-tema", valido);
      else wrap.removeAttribute("data-tema");
      const cx = $(".temabox");
      if (cx) {
        for (const b of cx.querySelectorAll(".tm-i"))
          b.setAttribute("aria-checked", String(b.dataset.tema === valido));
      }
      if (gravar === false) return;
      try {
        chrome.storage.local.set({ tema: valido });
      } catch {
        /* contexto invalidado: o tema vale para esta sessão e mais nada */
      }
    }

    // A CAIXA DE TEMAS. `position: fixed` e filha do `.wrap`, como a `.movbox`,
    // a `.audbox` e o `.selmenu` — o `.wrap` é um container de tamanho ZERO
    // (quem tem dimensão é o `.panel`), então posicionar por dentro dele joga o
    // elemento para fora da tela.
    let temabox = null;
    function fecharTema() {
      if (!temabox) return;
      temabox.remove();
      temabox = null;
      const b = $(".hd .tema");
      if (b) b.setAttribute("aria-expanded", "false");
    }
    function abrirTema() {
      fecharTema();
      const btn = $(".hd .tema");
      if (!btn) return;
      temabox = document.createElement("div");
      temabox.className = "temabox";
      temabox.setAttribute("role", "radiogroup");
      temabox.setAttribute("aria-label", "Aparência do painel");
      const tit = document.createElement("div");
      tit.className = "tm-h";
      tit.textContent = "Aparência";
      temabox.appendChild(tit);
      for (const t of TEMAS) {
        const b = document.createElement("button");
        b.className = "tm-i";
        b.dataset.tema = t.id;
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(t.id === temaAtual));
        const sw = document.createElement("span");
        sw.className = "tm-sw";
        // A amostra mostra a CHROME, o acento e a superfície — as três decisões
        // que separam um tema do outro. Um quadrado de cor só não distingue
        // Papel de Vidro, que compartilham a superfície clara.
        for (const c of t.amostra) {
          const q = document.createElement("i");
          q.style.background = c;
          sw.appendChild(q);
        }
        b.appendChild(sw);
        const n = document.createElement("span");
        n.className = "tm-n";
        n.textContent = t.nome;
        b.appendChild(n);
        b.addEventListener("click", () => {
          aplicarTema(t.id);
          fecharTema();
        });
        temabox.appendChild(b);
      }
      wrap.appendChild(temabox);
      const r = btn.getBoundingClientRect();
      const larg = 210;
      temabox.style.left = Math.max(8, Math.min(r.right - larg, innerWidth - larg - 8)) + "px";
      // Abaixo do botão quando cabe; acima quando não — a mesma regra da
      // `.movbox`, que é ancorada num selo do rodapé e por isso prefere subir.
      const alt = temabox.getBoundingClientRect().height || 190;
      temabox.style.top =
        (r.bottom + 6 + alt < innerHeight ? r.bottom + 6 : Math.max(8, r.top - 6 - alt)) + "px";
      btn.setAttribute("aria-expanded", "true");
    }
    const btnTema = $(".hd .tema");
    if (btnTema) {
      btnTema.addEventListener("click", (e) => {
        e.stopPropagation();
        if (temabox) fecharTema();
        else abrirTema();
      });
    }
    // O clique fora fecha pelo DOCUMENTO, não pelo `wrap`: nos modos lateral,
    // livre e flutuante a página do tribunal fica visível e CLICÁVEL ao lado,
    // com a caixa `position: fixed` por cima dela — ancorado no `wrap`, clicar
    // nos autos não fecharia nada. E a decisão é por `composedPath()`, nunca
    // por `e.target`: no documento o alvo de dentro do Shadow DOM chega
    // RETARGETADO para o host, então `closest(".temabox")` daria `null` e o
    // clique dentro da própria caixa a fecharia — inclusive o do botão de tema,
    // que morreria antes do `click`. (A mesma lição da `.movbox`.)
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!temabox) return;
        const cam = e.composedPath ? e.composedPath() : [];
        if (cam.includes(temabox) || cam.includes(btnTema)) return;
        fecharTema();
      },
      true
    );

    // Esc fecha a caixa, com `stopPropagation` para não cancelar junto o modo
    // minuta — a cascata de Esc do painel é `/` → `@` → modal → modo minuta, e
    // quem está por cima consome o evento.
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && temabox) {
          e.stopPropagation();
          fecharTema();
        }
      },
      true
    );

    // Restaura a preferência de layout (vale a partir do próximo open()).
    try {
      chrome.storage.local.get(["layoutModo", "livreGeo", "tema"], (v) => {
        // `gravar: false` — restaurar não é escolher, e regravar aqui
        // dispararia um `storage.onChanged` em todas as abas a cada boot.
        if (v && typeof v.tema === "string") aplicarTema(v.tema, false);
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

    // Espelha `--dur-1` do panel.css: é quanto dura a saída do painel. Só o
    // valor pode divergir, e o pior caso de divergência é cosmético (desmontar
    // o layout cedo demais aparece como um salto no fim da saída).
    const MS_SAIDA = 220;
    let saidaTimer = null;
    closeBtn.addEventListener("click", () => {
      hidePreview();
      if (wrap.classList.contains("livre")) salvarGeoLivre(); // antes de tirar a classe
      // SÓ o `open` sai agora — é ele que dispara a saída. As classes de LAYOUT
      // e a geometria inline têm de sobreviver a ela: removidas aqui, a janela
      // do modo livre saltaria para o canto em 420x660 e só então desapareceria.
      wrap.classList.remove("open");
      clearTimeout(saidaTimer);
      saidaTimer = setTimeout(() => {
        // Reabriu no meio da saída: quem manda é o painel novo, não a limpeza
        // do antigo — sem esta guarda, desmontaríamos o layout de uma janela
        // que o usuário acabou de abrir.
        if (wrap.classList.contains("open")) return;
        wrap.classList.remove("expanded", "full", "lateral", "livre", "livre-wide");
        limparGeoLivre();
      }, MS_SAIDA);
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
    // Espelha `--dur-3` (240ms) do panel.css com uma folga: é quanto dura o
    // colapso da lista. Conferido por teste, como o MS_SAIDA.
    const MS_COLAPSO = 320;
    let colapsoTimer = null;
    function setDocsOcultas(on, persistir) {
      // O clipe só existe durante a transição (e no repouso colapsado, por CSS):
      // permanente, ele cortaria o balão do aviso da timeline, que é absoluto e
      // abre para cima de dentro da lista.
      const dEl = $(".docs");
      if (dEl) {
        dEl.classList.add("anim");
        clearTimeout(colapsoTimer);
        colapsoTimer = setTimeout(() => dEl.classList.remove("anim"), MS_COLAPSO);
      }
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

    // -------------------------------------------------------------------------
    // Tour de primeiro uso. A instância nasce AQUI, e não junto do `temTour` lá
    // em cima, porque o controle remoto abaixo referencia `open`, `aplicarModo`
    // e `setDocsOcultas` — que só existem a partir deste ponto do arquivo.
    //
    // O `ctrl` é deliberadamente MÍNIMO: o tour recebe o que precisa para
    // pilotar a visita (abrir, expandir, mostrar a lista) e nada além disso.
    // Nenhum método que altere seleção, conversa ou envio atravessa esta
    // fronteira — é ela que garante, por construção, que a visita guiada não
    // consegue mexer no processo do usuário nem que se queira.
    // -------------------------------------------------------------------------
    if (temTour) {
      tourInst = PjeTour.criar({
        root,
        wrap,
        abrir: open,
        modo: aplicarModo,
        modoAtual,
        mostrarPecas: () => setDocsOcultas(false, false),
      });
      // Auto-abertura ÚNICA, e só quando a conversa está vazia: se o painel já
      // tem mensagens (memória de caso retomada), quem chegou não é novato — e
      // cobrir uma conversa restaurada com um tour seria o pior momento
      // possível. A primeira tela do tour é uma capa que PERGUNTA antes de
      // percorrer; recusar ali marca o "visto" e o convite fica no estado vazio.
      PjeTour.precisa((sim) => {
        if (!sim || !tourInst || msgs.querySelector(".msg")) return;
        // atraso curto: deixa o boot (setDocs, caps, retomada) assentar antes
        // de medir os alvos — o tour lê getBoundingClientRect deles
        setTimeout(() => {
          if (tourInst && !tourInst.ativo() && !msgs.querySelector(".msg")) tourInst.iniciar();
        }, 900);
      });
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
      // SÓ o rótulo — o <svg> é irmão dele. Escrever no textContent do botão
      // apagaria o ícone no primeiro clique (e sem erro nenhum).
      rotulo(tglSearch, searchOn ? "Jurisprudência ligada" : "Jurisprudência");
      statusEl.textContent = searchOn
        ? "Busca de jurisprudência ligada: as próximas perguntas enviadas poderão consultar STF, STJ, Planalto e outras fontes oficiais."
        : "Busca de jurisprudência desligada.";
    });

    // MODO SIGILOSO. Toggle com ESTADO, irmão do de jurisprudência — mas com uma
    // diferença que não pode ser apagada: este muda O QUE SAI DA MÁQUINA. Por
    // isso o estado aparece em DOIS lugares (o botão e o selo da metarow) e o
    // status escreve o que passou a valer, em vez de só confirmar o clique.
    const tglSigilo = $(".tgl-sigilo");
    const seloSigilo = $(".selo-sigilo");
    const sigselo = $(".sigselo");
    let sigiloOn = false;
    let sigiloCb = null;
    // O que o carimbo mostra enquanto a anonimização roda: `{feitas, total,
    // detalhe}`, ou `null` em repouso. Ver `setSigiloProgresso`.
    let sigProgresso = null;
    let sigAnuncioTimer = 0;
    // A última contagem que `pintarSigilo` recebeu. `setSigiloProgresso` repinta
    // o carimbo fora do ciclo de `pintarSigilo` e precisa dela para não zerar o
    // número ao voltar do progresso para o repouso.
    let ultimoQuantosSigilo = 0;
    // O anúncio dura o bastante para ser lido uma vez e não o bastante para
    // virar paisagem. Mesmo prazo do resultado da leitura da lista, que volta
    // ao repouso em 12 s — aqui é menos, porque a frase é mais curta.
    const MS_ANUNCIO_SIGILO = 7000;

    // O TEXTO DO CARIMBO. Três momentos, um elemento — e a ordem importa: o
    // progresso VENCE o estado de repouso, porque enquanto as peças estão sendo
    // lidas a contagem de protegidos ainda está subindo e um número que muda
    // sozinho sem explicação é pior que nenhum.
    function pintarCarimbo(n) {
      if (!sigselo) return;
      const rot = sigselo.querySelector(".ss-t");
      const num = sigselo.querySelector(".ss-n");
      if (sigProgresso) {
        const p = sigProgresso;
        rot.textContent = "ANONIMIZANDO";
        num.textContent = p.total ? p.feitas + "/" + p.total : String(p.feitas || "");
        // A FOLHA em filho próprio, pelo mesmo motivo do substantivo: no
        // estreito ela é o que sobra depois de já se saber a peça, e são os
        // 31px que faziam o cabeçalho do modo lateral quebrar numa 3ª linha.
        if (p.detalhe) {
          const d = document.createElement("i");
          d.className = "ss-d";
          d.textContent = " · " + p.detalhe;
          num.appendChild(d);
        }
        return;
      }
      rot.textContent = "SIGILOSO";
      // O número é a única coisa que muda em repouso, e é por isso que ele
      // continua sendo lido depois do terceiro processo do dia. Sem nenhum dado
      // protegido ainda, o carimbo diz só o estado — inventar um "0 protegidos"
      // faria a primeira impressão do modo ser a de que ele não fez nada.
      // O SUBSTANTIVO num filho próprio, para o estreito poder tirá-lo sem
      // tirar o número. É o mesmo par `.sl-l`/`.sl-s` do selo da metarow: duas
      // formas no DOM, a escolha no CSS. MEDIDO: com "· 47 protegidos" o
      // carimbo tem 103px, o CNJ tem 140, e os dois não cabem na linha do
      // cabeçalho a 420px — ele quebrava e o cabeçalho ia de 98px para 140px.
      num.textContent = "";
      if (n) {
        num.appendChild(document.createTextNode("· " + n));
        const u = document.createElement("i");
        u.className = "ss-u";
        u.textContent = n === 1 ? " protegido" : " protegidos";
        num.appendChild(u);
      }
    }

    // Pintar é SEPARADO de alternar: o content script também precisa pintar
    // (ao retomar um processo que já estava em modo sigiloso), e sem a separação
    // ele teria de simular um clique — que dispararia o callback e ligaria o
    // modo de novo, do lado de lá.
    function pintarSigilo(ligado, quantos, dados) {
      // Guardado ANTES da atribuição: é a transição desligado→ligado que dispara
      // o anúncio do carimbo, e não o estado. Sem isto o anúncio voltaria a cada
      // repinte — e `setSigiloso` é chamada pelo content a cada turno.
      const acendeu = !sigiloOn && !!ligado;
      sigiloOn = !!ligado;
      // A classe veste o PAINEL INTEIRO. É ela que liga a tarja, o anel da
      // janela e a borda do campo de mensagem — um modo que muda o que sai da
      // máquina precisa estar no ambiente, não só no controle que o ligou.
      wrap.classList.toggle("sigiloso", sigiloOn);
      // O convite do estado vazio some com o modo LIGADO: ele oferece fazer o
      // que já está sendo feito, e uma interface que insiste em vender o que o
      // usuário já comprou o faz duvidar se comprou mesmo.
      const convite = $(".hint-sigilo");
      if (convite) convite.hidden = sigiloOn;
      // O CARIMBO, colado à IDENTIDADE do processo (a linha do CNJ). Ele
      // substituiu a `.sigbar`, que era uma faixa hachurada de largura inteira
      // logo abaixo do cabeçalho — ver o porquê da troca no DESIGN.md. O que
      // importa preservar aqui: o carimbo não custa altura nenhuma, então
      // nenhum dos três momentos dele move a `.inrow` (o bug do 📎).
      if (sigselo) {
        sigselo.hidden = !sigiloOn;
        if (!sigiloOn) {
          // Desligar limpa o progresso: um "ANONIMIZANDO 3/12" congelado é a
          // pior coisa que o carimbo pode dizer depois que o modo saiu de cena.
          sigProgresso = null;
          clearTimeout(sigAnuncioTimer);
          sigselo.classList.remove("anunciando");
        } else if (acendeu) {
          // O ANÚNCIO. A frase que a faixa antiga mantinha para sempre agora
          // aparece uma vez, no instante em que ela responde a uma pergunta —
          // logo depois do gesto que ligou o modo — e some sozinha. É
          // confirmação de uma ação recém-tomada, não um cartaz.
          sigselo.querySelector(".ss-a").textContent =
            "As peças saem anonimizadas daqui";
          sigselo.classList.add("anunciando");
          clearTimeout(sigAnuncioTimer);
          sigAnuncioTimer = setTimeout(() => {
            sigselo.classList.remove("anunciando");
          }, MS_ANUNCIO_SIGILO);
        }
        ultimoQuantosSigilo = Number(quantos) || 0;
        pintarCarimbo(ultimoQuantosSigilo);
        sigselo.title =
          "Modo sigiloso ligado: as peças vão como texto anonimizado e o arquivo original não sai desta máquina." +
          " Clique para AUDITAR o que foi mascarado.";
      }
      if (dados !== undefined) audDados = dados;
      // A caixa nunca pode mostrar o retrato de um estado anterior — a mesma
      // regra do `setLinhaDoTempo`, que fecha a `.movbox` ao trocar o retrato.
      if (!sigiloOn) fecharAud();
      else if (audbox) { fecharAud(); abrirAud(); }
      tglSigilo.setAttribute("aria-pressed", String(sigiloOn));
      tglSigilo.classList.toggle("on", sigiloOn);
      // SÓ o rótulo — o <svg> é irmão dele. Escrever no textContent do botão
      // apagaria o ícone no primeiro clique, sem erro nenhum.
      rotulo(tglSigilo, sigiloOn ? "Sigiloso ligado" : "Sigiloso");
      seloSigilo.hidden = !sigiloOn;
      if (sigiloOn) {
        const n = Number(quantos) || 0;
        // DUAS versões no DOM, escolha no CSS — o mesmo padrão do medidor e do
        // custo (`.g-full`/`.g-short`). Em 420px o selo longo (133px) empurrava
        // o selo do modelo para uma SEGUNDA linha na `.metarow`, e a regra do
        // painel estreito é uma fileira: o que dobra de linha vira bagunça.
        // O eixo aqui é `.estreito`, e não `.expanded`: na janela livre larga a
        // barra tem espaço de sobra e a forma longa é a que informa.
        //
        // Escrevendo nos DOIS spans, nunca no botão: o <svg> é irmão deles, e
        // um `textContent` no botão o apagaria no primeiro repinte.
        seloSigilo.querySelector(".sl-l").textContent = n
          ? "sigiloso · " + n + (n === 1 ? " dado" : " dados")
          : "sigiloso";
        // Na forma curta o ícone já diz "sigiloso"; o que falta é o NÚMERO, que
        // é o que muda a cada peça e o que o usuário acompanha.
        seloSigilo.querySelector(".sl-s").textContent = n ? String(n) : "";
        seloSigilo.title =
          "As peças vão como texto anonimizado; o arquivo original não sai desta máquina." +
          (n
            ? n === 1
              ? " 1 dado distinto já foi substituído por rótulo."
              : " " + n + " dados distintos já foram substituídos por rótulo."
            : "") +
          " Clique para AUDITAR: o que foi mascarado e o texto exato que foi enviado.";
      }
    }

    tglSigilo.addEventListener("click", () => {
      pintarSigilo(!sigiloOn);
      statusEl.textContent = sigiloOn
        ? "Modo sigiloso LIGADO: as peças passam a ser lidas e anonimizadas no seu computador antes do envio — a primeira análise demora mais, porque cada peça é lida (e as digitalizadas passam por OCR)."
        : "Modo sigiloso desligado: as peças voltam a ser enviadas como arquivo.";
      if (sigiloCb) sigiloCb(sigiloOn);
    });

    // ---------------------------------------------------------------- AUDITORIA
    //
    // O selo do modo sigiloso ABRE esta caixa, e é ela que responde à pergunta
    // que o recurso inteiro precisa poder responder: "como eu SEI que esta peça
    // saiu anonimizada?". Sem ela o usuário tinha um botão, uma contagem e a
    // palavra da extensão — e a palavra da extensão não é auditoria.
    //
    // Três camadas, na ordem em que a dúvida aparece:
    //   1. QUANTO foi mascarado, por tipo — a visão de uma olhada;
    //   2. O QUE foi mascarado, peça por peça, com o TEXTO QUE DE FATO SAIU;
    //   3. A CHAVE (rótulo -> valor original), que é o que permite reidentificar.
    //
    // A camada 3 fica SÓ NA TELA. Ela desfaz a anonimização — um relatório que a
    // carregasse seria o oposto do que ele existe para provar. O arquivo que se
    // baixa leva as camadas 1 e 2, e diz isso em voz alta.
    // Do rótulo TÉCNICO para o português. `ORGANIZACAO` vem do `id2label` do
    // modelo e não leva acento, porque identificador de código não leva — na
    // tela isso lê como erro de digitação. Um tipo novo cai no `else` e aparece
    // cru, que é feio mas honesto: melhor mostrar o identificador do que
    // inventar um nome para uma categoria que ninguém decidiu como chamar.
    const NOME_TIPO = {
      PESSOA: ["pessoa", "pessoas"],
      ORGANIZACAO: ["organização", "organizações"],
      LOCAL: ["local", "locais"],
      CPF: ["CPF", "CPFs"],
      CNPJ: ["CNPJ", "CNPJs"],
      RG: ["RG", "RGs"],
      OAB: ["OAB", "OABs"],
      PROCESSO: ["nº de processo", "nºs de processo"],
      EMAIL: ["e-mail", "e-mails"],
      TELEFONE: ["telefone", "telefones"],
      CEP: ["CEP", "CEPs"],
      NIT: ["NIT", "NITs"],
      CONTA: ["conta", "contas"],
    };
    function nomeTipo(tipo, n) {
      const par = NOME_TIPO[tipo];
      if (!par) return n + " " + tipo;
      return n + " " + par[n === 1 ? 0 : 1];
    }

    let audDados = null;
    let audbox = null;
    let audBaixarCb = null;
    let audLiberarCb = null;

    function fecharAud() {
      if (!audbox) return;
      audbox.remove();
      audbox = null;
      seloSigilo.setAttribute("aria-expanded", "false");
    }

    // Escreve o texto enviado DESTACANDO cada rótulo, com o valor original no
    // `title`. É o que transforma a lista numa prova inspecionável: lê-se a peça
    // como o modelo a leu, e cada marca responde "o que estava aqui?".
    //
    // Construído com NÓS, nunca `innerHTML`: isto é conteúdo dos autos, e o
    // `escapeHtml` do painel não escapa aspa simples. Um `<mark>` por rótulo e
    // nós de texto para o resto — seguro por construção.
    function pintarMarcas(el, texto, itens) {
      el.textContent = "";
      const valorDe = new Map();
      // `itens` explícito é a caixa de conferência (que tem a tabela do
      // instante); sem ele vale a da auditoria.
      for (const it of itens || (audDados && audDados.itens) || []) valorDe.set(it.rotulo, it.valor);
      // Regex LOCAL: a do PSEUD é global e carrega `lastIndex` entre chamadas.
      const re = /\[([A-Z][A-Z0-9]*)_(\d+)\]/g;
      let ultimo = 0;
      let m;
      let n = 0;
      while ((m = re.exec(texto)) !== null) {
        if (m.index > ultimo) el.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
        const mk = document.createElement("mark");
        mk.className = "aud-rot";
        mk.textContent = m[0];
        const v = valorDe.get(m[0]);
        // O valor original vai no `title`, não na tela: ele é o dado sensível, e
        // deixá-lo visível transformaria a prova de anonimização num documento
        // com os nomes de volta.
        mk.title = v ? "Aqui estava: " + v : "Rótulo sem correspondência no mapa";
        el.appendChild(mk);
        ultimo = m.index + m[0].length;
        n++;
      }
      if (ultimo < texto.length) el.appendChild(document.createTextNode(texto.slice(ultimo)));
      return n;
    }

    function linhaAud(classe, texto) {
      const el = document.createElement("div");
      el.className = classe;
      el.textContent = texto;   // textContent SEMPRE: isto é conteúdo dos autos
      return el;
    }

    function abrirAud() {
      fecharAud();
      const box = document.createElement("div");
      box.className = "audbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "Auditoria da anonimização");

      const hd = document.createElement("div");
      hd.className = "mv-hd";
      const t = document.createElement("span");
      t.className = "mv-t";
      const d = audDados || { itens: [], pecas: [] };
      const q = d.itens.length;
      t.textContent =
        q === 0
          ? "Anonimização"
          : "Anonimização — " + q + (q === 1 ? " dado mascarado" : " dados mascarados");
      const x = document.createElement("button");
      x.type = "button";
      x.className = "mv-x";
      x.title = "Fechar (Esc)";
      x.innerHTML = SVG.x;
      x.addEventListener("click", fecharAud);
      hd.appendChild(t);
      hd.appendChild(x);
      box.appendChild(hd);

      const lista = document.createElement("div");
      lista.className = "mv-list";

      // CONJUNTO VAZIO SE EXPLICA (a regra da `.sel-nota`): sem nada mascarado
      // ainda, o clique não pode abrir uma caixa em branco — a pergunta "então
      // está funcionando?" nasce exatamente aqui.
      if (!d.itens.length && !d.pecas.length) {
        lista.appendChild(linhaAud("mv-vazio",
          "Nada foi anonimizado ainda. O mascaramento acontece no primeiro envio: " +
          "marque as peças e pergunte alguma coisa. Depois disso, esta caixa mostra " +
          "o que foi substituído e o texto exato que saiu."));
      }

      // --- 1) resumo por tipo
      if (d.itens.length) {
        const porTipo = new Map();
        for (const it of d.itens) porTipo.set(it.tipo, (porTipo.get(it.tipo) || 0) + 1);
        const res = document.createElement("div");
        res.className = "aud-res";
        for (const [tipo, n] of [...porTipo].sort((a, b) => b[1] - a[1])) {
          const c = document.createElement("span");
          c.className = "aud-chip";
          // Número ANTES do nome: é assim que se lê em voz alta ("3 pessoas"),
          // e é o número que muda.
          c.textContent = nomeTipo(tipo, n);
          res.appendChild(c);
        }
        lista.appendChild(res);
      }

      // --- 2) as peças, com o TEXTO QUE SAIU
      if (d.pecas.length) {
        lista.appendChild(linhaAud("aud-sec", "Peças anonimizadas e enviadas"));
        for (const pe of d.pecas) {
          const row = document.createElement("div");
          row.className = "aud-peca";
          const cab = document.createElement("div");
          cab.className = "aud-pcab";
          const nome = document.createElement("b");
          nome.textContent = pe.titulo || String(pe.id);
          const meta = document.createElement("span");
          meta.className = "aud-pmeta";
          // A contagem de SUBSTITUIÇÕES, e não só o tamanho: é ela que diz o
          // quanto daquela peça foi tocado. Sai da contagem real das marcas.
          const subs = (String(pe.texto || "").match(/\[[A-Z][A-Z0-9]*_\d+\]/g) || []).length;
          meta.textContent =
            pe.chars + " caracteres · " + subs + (subs === 1 ? " substituição" : " substituições");
          const ver = document.createElement("button");
          ver.type = "button";
          ver.className = "aud-ver";
          ver.textContent = "ver o texto enviado";
          const corpo = document.createElement("pre");
          corpo.className = "aud-texto";
          corpo.hidden = true;
          pintarMarcas(corpo, pe.texto || "");
          ver.addEventListener("click", () => {
            corpo.hidden = !corpo.hidden;
            ver.textContent = corpo.hidden ? "ver o texto enviado" : "ocultar";
            posicionarAud();
          });
          cab.appendChild(nome);
          cab.appendChild(meta);
          cab.appendChild(ver);
          row.appendChild(cab);
          row.appendChild(corpo);
          lista.appendChild(row);
        }
      }

      // --- 3) a CHAVE, só na tela
      if (d.itens.length) {
        lista.appendChild(linhaAud("aud-sec", "Tabela de reidentificação (não sai daqui)"));
        lista.appendChild(linhaAud("aud-avi",
          "Esta tabela desfaz a anonimização. Ela fica só neste computador e NÃO " +
          "acompanha o relatório — um relatório que a carregasse provaria o contrário " +
          "do que ele existe para provar."));
        for (const it of d.itens) {
          const row = document.createElement("div");
          row.className = "aud-map";
          const r = document.createElement("code");
          r.textContent = it.rotulo;
          const v = document.createElement("span");
          v.className = "aud-val";
          v.textContent = it.valor;
          row.appendChild(r);
          row.appendChild(v);
          // Liberado pelo usuário: continua na tabela (uma minuta antiga pode
          // carregar o rótulo), mas sai em claro daqui em diante — e a linha
          // diz isso, senão a tabela afirmaria uma proteção que não existe.
          if (it.liberado) {
            row.classList.add("liberado");
            const l = document.createElement("span");
            l.className = "aud-lib";
            l.textContent = "liberado — sai em claro";
            row.appendChild(l);
          } else if (audLiberarCb) {
            // O lugar natural de corrigir um falso positivo ANTES de ele
            // segurar um envio: "ALIMENTOS" não é pessoa, e quem lê a tabela
            // vê isso na hora. Escopo do processo; o global fica na bolha.
            const b = document.createElement("button");
            b.type = "button";
            b.className = "aud-liberar";
            b.textContent = "não é dado pessoal";
            b.title = "Libera este valor neste processo: passa a sair em claro";
            b.addEventListener("click", async () => {
              b.disabled = true;
              try {
                await audLiberarCb(it.rotulo, { global: false });
              } catch (e) {
                b.disabled = false;
              }
            });
            row.appendChild(b);
          }
          lista.appendChild(row);
        }
      }

      box.appendChild(lista);

      // --- o relatório
      const pe = document.createElement("div");
      pe.className = "aud-pe";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "aud-baixar";
      // Ícone do pacote (o mesmo do "Baixar .zip"), não emoji — DESIGN.md §7.
      btn.innerHTML = SVG.zip;
      const rot = document.createElement("span");
      rot.className = "lbl";
      rot.textContent = "Baixar relatório de conferência";
      btn.appendChild(rot);
      btn.title =
        "Um arquivo .md com o que foi mascarado (por tipo) e o TEXTO EXATO que foi " +
        "enviado ao provedor, peça por peça. Não leva a tabela de reidentificação.";
      btn.disabled = !d.pecas.length;
      btn.addEventListener("click", () => {
        if (audBaixarCb) audBaixarCb();
      });
      pe.appendChild(btn);
      box.appendChild(pe);

      wrap.appendChild((audbox = box));
      seloSigilo.setAttribute("aria-expanded", "true");
      posicionarAud();
    }

    // `position: fixed` porque o `.wrap` é um container de tamanho ZERO — igual à
    // `.movbox`. O que MUDA em relação a ela é o enquadramento: a `.movbox` é uma
    // lista curta e se ancora na viewport sem consequência; esta caixa carrega o
    // TEXTO DE UMA PEÇA, fica alta, e presa à viewport ela cobria a barra de
    // título do painel e transbordava a borda esquerda em 420px. Um popover que
    // cobre o cabeçalho do próprio dono lê como erro de posicionamento.
    //
    // Então ela é enquadrada no PAINEL: nunca acima do topo dele, nunca abaixo do
    // fim, nunca fora das laterais. Quem cede é a altura da lista, que já rola.
    function posicionarAud() {
      if (!audbox) return;
      const pr = panelEl.getBoundingClientRect();
      const r = seloSigilo.getBoundingClientRect();
      const larg = Math.min(520, Math.max(300, pr.width - 24), window.innerWidth - 24);
      audbox.style.width = larg + "px";

      // A moldura: o painel, com 8px de folga, e ainda dentro da janela.
      const teto = Math.max(6, pr.top + 8);
      const chao = Math.min(window.innerHeight - 6, pr.bottom - 8);

      // A lista cede primeiro. Mede-se o cabeçalho + rodapé zerando-a, e o que
      // sobra da moldura é o teto dela. O piso de 120px existe para a caixa não
      // virar uma fresta num painel muito baixo — ali é melhor transbordar do
      // que ficar ilegível.
      const lista = audbox.querySelector(".mv-list");
      if (lista) {
        lista.style.maxHeight = "0px";
        const semLista = audbox.offsetHeight;
        lista.style.maxHeight = Math.max(120, chao - teto - semLista) + "px";
      }

      const alt = audbox.offsetHeight;
      audbox.style.left =
        Math.max(
          Math.max(6, pr.left + 6),
          Math.min(r.right - larg, pr.right - larg - 6, window.innerWidth - larg - 6)
        ) + "px";
      // ACIMA do selo quando couber — é de lá que ela sai. Quando não couber,
      // encosta no teto do painel em vez de sair por cima dele.
      audbox.style.top = Math.max(teto, Math.min(r.top - alt - 8, chao - alt)) + "px";
    }

    seloSigilo.addEventListener("click", () => (audbox ? fecharAud() : abrirAud()));
    // O CARIMBO é a segunda porta para a MESMA caixa. Duas portas para um
    // destino é padrão daqui (o "ver na timeline" tem três: a row da peça, a
    // citação da bolha e a lista de movimentos), e as duas se justificam: o selo
    // da metarow fica na fileira dos fatos sobre a resposta, e o carimbo é o
    // estado ambiente — quem quer conferir olha para o cabeçalho primeiro.
    if (sigselo) {
      sigselo.addEventListener("click", () => (audbox ? fecharAud() : abrirAud()));
    }

    // Esc fecha — e com `stopPropagation`, senão a cascata de Esc do painel
    // (`/` -> `@` -> modal -> modo minuta) cancelaria outra coisa junto. Mesma
    // disciplina do Esc da `.movbox` e do preview.
    wrap.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && audbox) {
          e.stopPropagation();
          fecharAud();
          seloSigilo.focus();
        }
      },
      true
    );

    // O clique fora fecha pelo DOCUMENT, não pelo `wrap`: nos modos lateral,
    // livre e flutuante a página do tribunal fica visível e CLICÁVEL ao lado, e
    // ancorado no wrap um clique nos autos não fecharia nada. `composedPath` e
    // não `e.target`: no document o alvo de dentro do Shadow DOM chega
    // RETARGETADO para o host, e `closest(".audbox")` daria null — o clique
    // dentro da própria caixa a fecharia.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!audbox) return;
        const caminho = (e.composedPath && e.composedPath()) || [];
        if (caminho.indexOf(audbox) >= 0 || caminho.indexOf(seloSigilo) >= 0) return;
        fecharAud();
      },
      true
    );

    // Geração de MINUTA por modo explícito: o clique no botão liga o modo — a
    // instrução padrão (editável) entra no campo, a faixa .minutabar explica o
    // passo e o botão Enviar vira "📝 Gerar minuta". Enviar/Enter geram; ✕, Esc
    // ou novo clique no botão cancelam. (Não reintroduzir o fluxo de "dois
    // cliques no mesmo botão": todo mundo aperta Enviar.)
    // Como o mapa mental, o turno é um chat comum — sem skill, sem execução de
    // código —, então funciona em QUALQUER modelo, Claude ou Gemini.
    // A instrução padrão NÃO pede mais "o ato cabível… e dispositivo". Pedir o
    // ato E o resultado é encomendar ao modelo a "formulação de juízos
    // conclusivos sobre a aplicação da norma jurídica" — o item AR4 do Anexo da
    // Resolução CNJ 615/2025, classificado como ALTO RISCO. Quem diz a espécie
    // agora é o seletor abaixo, e quem diz o resultado é a tese do usuário; o
    // que sobra para a instrução é a FORMA. (Duplicada em content.js — ao
    // mudar uma, mudar a outra.)
    const INSTRUCAO_MINUTA_PADRAO =
      "Redija a minuta seguindo a praxe forense, indicando a origem de cada afirmação.";
    const btnMinuta = $(".btn-minuta");
    const minutabar = $(".minutabar");
    let minutaCb = null;
    let minutaMode = false;

    // ---- Qual modelo redige a minuta ----------------------------------------
    // O modelo mais barato para LER os autos costuma ser o mais fraco para
    // ESCREVER o expediente — não é defeito, é a estrutura de preço: analisar
    // é dominado pelo input (centenas de páginas entram, poucos milhares de
    // tokens saem) e redigir é dominado pelo output.
    //
    // Antes isto era uma SUGESTÃO ("experimente trocar nas opções") e a minuta
    // saía no modelo do chat de todo jeito. Hoje ela roda mesmo num irmão de
    // redação do MESMO provedor, então a nota deixou de sugerir e passou a
    // ANUNCIAR — inclusive o custo, que sobe junto. Mudar o modo verbal criou um
    // requisito técnico do outro lado: `minutarAgora` precisa aguardar as caps
    // antes de gerar, senão esta frase afirma um modelo e o turno usa outro.
    //
    // INFORMA, NUNCA BLOQUEIA (tokens `--warn-*`, como a `.sel-nota`; jamais a
    // `.alertbar`): a escolha do modelo segue sendo de quem assina — Res. CNJ
    // 615 —, e o campo "Modelo para minutas" das opções permite fixar outro.
    const perfilNota = $(".perfil-nota");
    let minutaModeloInfo = null; // {model, modelChat, trocado, fixado} | null
    let modeloAtualId = null; // preenchido por setModelo, para nomear o ativo

    function nomeModelo(id) {
      return NOMES_MODELO[id] || id || "o modelo ativo";
    }

    function atualizarPerfilNota() {
      if (!perfilNota) return;
      // Sem troca não há o que anunciar; sem info (caps ainda não chegaram) a
      // nota não afirma nada — melhor calada que adivinhando.
      if (!minutaMode || !minutaModeloInfo || !minutaModeloInfo.trocado) {
        perfilNota.hidden = true;
        perfilNota.textContent = "";
        return;
      }
      const alvo = escapeHtml(nomeModelo(minutaModeloInfo.model));
      const chat = escapeHtml(nomeModelo(minutaModeloInfo.modelChat || modeloAtualId));
      // Escolha MANUAL não recebe as afirmações do automático. "Mais adequado a
      // redigir" e "custa mais" descrevem a troca análise → redação; quem está
      // no Sol e fixa o Terra receberia as duas invertidas — o Terra não redige
      // melhor que o Sol, e custa menos. Aqui a extensão só relata o que vai
      // acontecer, que é tudo o que ela sabe.
      perfilNota.innerHTML = minutaModeloInfo.fixado
        ? "Esta minuta será redigida pelo <b>" +
          alvo +
          "</b>, que você fixou em <b>Modelo para minutas</b> nas opções — o chat " +
          "segue no <b>" +
          chat +
          "</b>."
        : "Esta minuta será redigida pelo <b>" +
          alvo +
          "</b> — mais adequado a redigir que o <b>" +
          chat +
          "</b>, que você usa no chat. Custa mais por minuta; para fixar outro, " +
          "use <b>Modelo para minutas</b> nas opções da extensão.";
      perfilNota.hidden = false;
    }

    // ---- Orientação obrigatória (Resolução CNJ 615/2025) --------------------
    // O Anexo da resolução separa a "formulação de juízos conclusivos sobre a
    // aplicação da norma jurídica" (AR4, ALTO risco) da "produção de textos de
    // apoio para facilitar a confecção de atos judiciais" (BR4, baixo) e dos
    // "atos processuais ordinatórios" (BR1, baixo). A diferença entre os dois
    // primeiros não está no texto que sai: está em QUEM decidiu o resultado.
    // Com a tese informada antes, a IA redige uma conclusão que já é humana —
    // é isso que rebaixa o risco da ferramenta, e é por isso que o campo é
    // obrigatório em vez de sugerido. O art. 19, §3º, II veda o uso autônomo
    // "sem a devida ORIENTAÇÃO, interpretação, verificação e revisão": a
    // orientação vem antes da revisão no próprio texto normativo.
    //
    // TRÊS regimes, e o grupo do <optgroup> NÃO é o regime — quem manda é a
    // espécie. O grupo separa "a sua decisão entra no ato" de "não entra"; o
    // rótulo e o placeholder do campo é que distinguem tese de sentido.
    const ESPECIES_ATO = [
      { valor: "sentenca", rotulo: "Sentença", regime: "tese", decide: true },
      { valor: "decisao", rotulo: "Decisão interlocutória / tutela", regime: "tese", decide: true },
      { valor: "acordao", rotulo: "Acórdão / voto", regime: "tese", decide: true },
      { valor: "despacho", rotulo: "Despacho", regime: "sentido", decide: true },
      { valor: "oficio", rotulo: "Ofício", regime: "livre", decide: false },
      { valor: "mandado", rotulo: "Mandado / alvará", regime: "livre", decide: false },
      { valor: "ata", rotulo: "Ata de audiência", regime: "livre", decide: false },
      { valor: "outro", rotulo: "Outro", regime: "livre", decide: false },
    ];
    // Mínimo de existência, não de qualidade: barra o campo vazio e o "a"
    // digitado só para destravar o botão. A extensão exige que a tese EXISTA e
    // não julga se ela é boa — julgar seria, ela própria, formular o juízo
    // conclusivo que a regra existe para impedir. Um só número para os dois
    // regimes: dois pediriam duas justificativas.
    const TESE_MIN = 12;
    const TEXTO_REGIME = {
      tese: {
        rotulo: "Tese e dispositivo",
        ph:
          "Ex.: Procedência parcial. Prescrição afastada (art. 206, §3º, V, CC — marco em " +
          "12/03/2023). Dano moral de R$ 8.000,00; dano material improcedente por falta de prova.",
        falta:
          "Informe a tese e o dispositivo: a Resolução CNJ 615 não admite que a IA " +
          "decida o sentido do ato.",
      },
      sentido: {
        rotulo: "O que determinar",
        ph: "Ex.: Expeça-se carta precatória para oitiva da testemunha X, em Fortaleza.",
        falta:
          "Diga o que determinar: a Resolução CNJ 615 não admite que a IA decida o " +
          "sentido do ato.",
      },
    };
    const minutaAtoSel = $(".minuta-ato-sel");
    const minutaTeseWrap = $(".minuta-tese");
    const minutaTeseTxt = $(".mt-txtarea");
    const minutaTeseLab = $(".mt-txt");
    const minutaTeseNota = $(".mt-nota");
    const minutaTeseAlt = $(".mt-analise");
    // A saída para quem ainda NÃO sabe a tese. Bloquear sem alternativa
    // empurraria o usuário a escrever qualquer coisa no campo só para
    // destravar o botão — o oposto do que a exigência existe para conseguir.
    // Aqui a pergunta vai pelo CHAT comum, e a resposta volta com citações,
    // ressalvas e o inventário das peças não anexadas: um ESTUDO, que não se
    // confunde com um ato pronto para assinar. Não toca no content.js.
    const PERGUNTA_CABIVEL =
      "Analise as peças marcadas e indique qual é o ato cabível neste momento do " +
      "processo. Para cada caminho possível, diga em que ele se apoia nos autos, o " +
      "que ele levaria a decidir e o que ainda falta para decidir com segurança. " +
      "Não redija a peça — quero o estudo para depois definir a tese.";
    // Escolha MANUAL da espécie: a partir dela a detecção automática pela
    // instrução para de sobrescrever o que o usuário decidiu.
    let atoTocado = false;
    // O mesmo para a CATEGORIA de peças-modelo. Sem distinguir escolha manual
    // de auto-seleção, o valor anterior do <select> vencia a detecção e nunca
    // era limpo: quem gerava uma sentença e depois pedia um despacho recebia,
    // calado, os modelos de sentença. Declarada aqui (e não no bloco do MLIB,
    // ~2 mil linhas abaixo) porque `setMinutaMode` a escreve.
    let catModeloTocada = false;

    // Estado do botão Enviar: DUAS fontes independentes o desabilitam — o turno
    // em andamento (lockInput) e a falta de orientação. Sem um ponto único,
    // quem escrevesse por último venceria: sair do modo minuta reabilitaria o
    // botão no meio de um turno, e o fim de um turno reabilitaria o botão sem a
    // tese preenchida.
    let inputTravado = false;
    let gateMinuta = false;
    function aplicarEstadoSend() {
      sendBtn.disabled = inputTravado || gateMinuta;
    }

    function especieDe(valor) {
      return ESPECIES_ATO.find((e) => e.valor === valor) || null;
    }

    // Fonte ÚNICA da regra, lida pelo doSend, pelo gate do botão e pela nota.
    // Devolve null quando falta o obrigatório — quem explica o motivo é a nota.
    function atoDaMinuta() {
      const esp = especieDe(minutaAtoSel ? minutaAtoSel.value : "");
      if (!esp) return null;
      const tese = minutaTeseTxt ? minutaTeseTxt.value.trim() : "";
      if (esp.regime !== "livre" && tese.length < TESE_MIN) return null;
      return {
        especie: esp.valor,
        rotulo: esp.rotulo,
        regime: esp.regime,
        tese: esp.regime === "livre" ? "" : tese,
      };
    }

    // Mostra/esconde a linha da tese conforme a espécie, troca rótulo e
    // placeholder, e recalcula o gate. Chamada na troca de espécie, a cada
    // tecla da tese e ao ligar/desligar o modo.
    function atualizarLinhaTese() {
      if (!minutaTeseWrap) return;
      const esp = especieDe(minutaAtoSel ? minutaAtoSel.value : "");
      const regime = esp ? esp.regime : null;
      const t = regime && TEXTO_REGIME[regime];
      minutaTeseWrap.hidden = !t;
      if (t) {
        minutaTeseLab.textContent = t.rotulo;
        minutaTeseTxt.placeholder = t.ph;
      }
      // Sem espécie escolhida o botão também fica travado: a espécie é o que
      // decide se há orientação a exigir, e "não escolhi" não é "não exige".
      gateMinuta = minutaMode && !atoDaMinuta();
      let nota = "";
      if (minutaMode && !esp) nota = "Escolha a espécie do ato para continuar.";
      else if (minutaMode && t && !atoDaMinuta()) nota = t.falta;
      setTeseNota(nota);
      // A alternativa só aparece quando há orientação a dar e ela falta: com a
      // tese preenchida ela seria um convite a jogar fora o que foi escrito.
      if (minutaTeseAlt) minutaTeseAlt.hidden = !(minutaMode && t && !atoDaMinuta());
      aplicarEstadoSend();
    }

    function setTeseNota(txt) {
      if (!minutaTeseNota) return;
      minutaTeseNota.textContent = "";
      if (!txt) {
        minutaTeseNota.hidden = true;
        return;
      }
      minutaTeseNota.appendChild(document.createTextNode(txt + " "));
      const a = document.createElement("button");
      a.type = "button";
      a.className = "mt-como";
      a.textContent = "Como funciona →";
      a.addEventListener("click", () => abrirAjuda("resolucao615"));
      minutaTeseNota.appendChild(a);
      minutaTeseNota.hidden = false;
    }

    function popularSeletorAto() {
      if (!minutaAtoSel || minutaAtoSel.options.length) return; // uma vez só
      const vazio = document.createElement("option");
      vazio.value = "";
      vazio.textContent = "— escolha a espécie —";
      minutaAtoSel.appendChild(vazio);
      const grupos = [
        { rotulo: "Atos que dependem da sua decisão", decide: true },
        { rotulo: "Expediente (segue sem orientação)", decide: false },
      ];
      for (const g of grupos) {
        const og = document.createElement("optgroup");
        og.label = g.rotulo;
        for (const e of ESPECIES_ATO) {
          if (e.decide !== g.decide) continue;
          const op = document.createElement("option");
          op.value = e.valor;
          op.textContent = e.rotulo;
          og.appendChild(op);
        }
        minutaAtoSel.appendChild(og);
      }
    }

    function setMinutaMode(on) {
      minutaMode = on;
      minutabar.hidden = !on;
      btnMinuta.classList.toggle("on", on);
      rotulo(btnMinuta, on ? "Cancelar minuta" : "Minutar");
      icone(btnMinuta, on ? SVG.cancel : SVG.minuta);
      rotulo(sendBtn, on ? "Gerar minuta" : "Enviar");
      sendBtn.classList.toggle("docx", on);
      inEl.placeholder = on
        ? "Instrução da minuta — edite e clique em Gerar minuta…"
        : "Pergunte sobre as peças… (@ cita uma peça)";
      if (!on) statusEl.textContent = "";
      if (on) {
        popularSeletorAto();
        // Pré-seleciona pela instrução já digitada, mas só enquanto o usuário
        // não tiver escolhido à mão.
        if (!atoTocado && minutaAtoSel && !minutaAtoSel.value) {
          const cat = detectarCategoria(inEl.value);
          if (cat && especieDe(cat)) minutaAtoSel.value = cat;
        }
      } else {
        // Sair do modo zera a orientação: ela é de UM ato, e uma tese que
        // sobrevivesse ao cancelamento voltaria calada no ato seguinte —
        // exatamente o defeito que a categoria de modelos tinha.
        atoTocado = false;
        if (minutaAtoSel) minutaAtoSel.value = "";
        if (minutaTeseTxt) minutaTeseTxt.value = "";
        if (minutaModeloSel) minutaModeloSel.value = "";
        catModeloTocada = false;
      }
      atualizarPerfilNota();
      atualizarLinhaTese();
      atualizarSeletorMinuta(on); // popula/oculta o seletor de peça-modelo
    }
    if (minutaAtoSel) {
      minutaAtoSel.addEventListener("change", () => {
        atoTocado = true;
        atualizarLinhaTese();
        // A divergência espécie × categoria dos modelos muda com este gesto.
        atualizarNotaModelos();
      });
    }
    // Re-detecta espécie e categoria enquanto o usuário DIGITA a instrução.
    // Antes a detecção rodava só ao ligar o modo, então quem ligava com o campo
    // vazio (ou com um prompt salvo ativo, que suprime a instrução padrão) e só
    // depois escrevia "sentença de improcedência" nunca via a pré-seleção
    // acontecer. Debounce porque `input` dispara a cada tecla e
    // `popularSeletorModelos` reconstrói o <select>.
    let tDetectar = 0;
    inEl.addEventListener("input", () => {
      if (!minutaMode) return;
      clearTimeout(tDetectar);
      tDetectar = setTimeout(() => {
        if (!minutaMode) return;
        const cat = detectarCategoria(inEl.value);
        if (!atoTocado && minutaAtoSel && cat && especieDe(cat)) {
          minutaAtoSel.value = cat;
          atualizarLinhaTese();
        }
        if (!catModeloTocada) atualizarSeletorMinuta(true);
      }, 320);
    });
    if (minutaTeseAlt) {
      minutaTeseAlt.addEventListener("click", () => {
        const sel = selecaoEfetivaPainel();
        if (!sel.length || !sendCb) return;
        setMinutaMode(false); // sai do modo: o que vai é uma pergunta de chat
        // A bolha do usuário quem monta é o content.js (com os anexos), como
        // em qualquer envio de chat — daí só a chamada aqui.
        sendCb(PERGUNTA_CABIVEL, sel);
      });
    }
    if (minutaTeseTxt) {
      minutaTeseTxt.addEventListener("input", atualizarLinhaTese);
      // Esc no campo da tese cancela o modo minuta como em qualquer outro
      // ponto da faixa; sem isto o Esc ficaria preso no textarea.
      minutaTeseTxt.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setMinutaMode(false);
          inEl.focus();
        }
      });
    }
    btnMinuta.addEventListener("click", () => {
      if (minutaMode) return setMinutaMode(false); // segundo clique = cancelar
      // Seleção EFETIVA (checkboxes + row lazy ainda não renderizada): num
      // processo retomado da memória a timeline do PJe ainda não montou as
      // rows, e recusar por `getSelected()` dizia "marque as peças" com os
      // chips do contexto na tela mostrando as peças marcadas.
      if (!selecaoEfetivaPainel().length) {
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
      rotulo(btnMapa, on ? "Cancelar mapa" : "Mapa mental");
      icone(btnMapa, on ? SVG.cancel : SVG.mapa);
      rotulo(sendBtn, on ? "Gerar mapa" : "Enviar");
      sendBtn.classList.toggle("docx", on); // mesmo halo azul do modo documento
      inEl.placeholder = on
        ? "Instrução do mapa mental — edite e clique em Gerar mapa…"
        : "Pergunte sobre as peças… (@ cita uma peça)";
      if (!on) statusEl.textContent = "";
    }
    btnMapa.addEventListener("click", () => {
      if (mapaMode) return setMapaMode(false); // segundo clique = cancelar
      if (!selecaoEfetivaPainel().length) {
        // idem minuta: a row lazy do processo retomado conta como marcada
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
      // O corpo NASCE com o indicador de digitação: enquanto só há raciocínio
      // (o bloco "Raciocínio" aberto acima), os pontos dizem que a resposta
      // ainda está por vir. O primeiro `updateAssistant` com texto os substitui.
      el.innerHTML =
        '<details class="think" hidden><summary>Raciocínio</summary><div class="think-t"></div></details>' +
        '<div class="body"><span class="dots"><i></i><i></i><i></i></span><span class="wait-t"></span></div>' +
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
    // Seleção EFETIVA: checkboxes marcados MAIS os ids que ainda esperam a row
    // aparecer (`selPendente`). A timeline do PJe é lazy, então num processo
    // retomado da memória boa parte das peças não existe no DOM — e as guardas
    // de "marque ao menos uma peça" que liam só `getSelected()` recusavam o
    // gesto com os chips do contexto na tela mostrando as peças marcadas. O
    // content.js já tinha a defesa (`selecaoEfetiva`), mas nunca era alcançada:
    // a recusa acontecia antes, aqui. É a mesma conta do `selecaoParaMemoria`,
    // extraída para os três consumidores não divergirem.
    function selecaoEfetivaPainel() {
      const ids = getSelected();
      if (selPendente && selPendente.size) ids.push(...selPendente);
      return [...new Set(ids)];
    }
    // Abre o guia numa âncora. Ponto único: fora da extensão (harness de teste)
    // `chrome.runtime.getURL` lança, e cada call site repetindo o try/catch já
    // seria a terceira cópia.
    function abrirAjuda(ancora) {
      try {
        const u = chrome.runtime.getURL("src/help.html") + (ancora ? "#" + ancora : "");
        window.open(u, "_blank", "noopener");
      } catch {
        /* fora da extensão (harness de teste) */
      }
    }
    function setDocChecked(id, on) {
      const c = doclist.querySelector('input[value="' + CSS.escape(id) + '"]');
      if (c) c.checked = on;
    }

    let prevChipIds = new Set(); // anima só chips recém-adicionados
    let selChangeCb = null; // content script re-estima o contexto ao mudar a seleção

    // Os TRÊS degraus de seleção, do mais enxuto ao mais amplo. Os conjuntos são
    // ENCAIXADOS (chave ⊂ principais ⊂ todas), que é o que faz os segmentos
    // acenderem em faixa e lerem como um termômetro de abrangência.
    //
    // O eixo aqui é `data-rel` (ver classificarPeca), não a classe de categoria:
    // categoria é cor, relevância é recorte. Enquanto "principais" significava
    // "tudo que não é cat-outro", ele marcava ~120 de 200 peças num processo
    // real — a regra de petição casa quase toda juntada das partes.
    const DEGRAUS = {
      ess: (r) => r.dataset.rel === "essencial",
      main: (r) => r.dataset.rel !== "neutro" && r.dataset.rel !== "ruido",
      all: () => true,
    };

    // Estado dos atalhos de seleção.
    //
    // Eles agem SÓ nas rows visíveis (respeitam a busca ativa), então o estado
    // deles também é relativo ao filtro atual. Enquanto o recálculo varria a
    // lista inteira, o checkbox se desmarcava sozinho no instante seguinte ao
    // clique sempre que havia filtro: as peças escondidas não estavam marcadas
    // e derrubavam o `every`.
    //
    // Separado de `syncSelection` porque `filtrarDocs` precisa recalculá-los
    // SEM disparar `selChangeCb`: digitar na busca não muda a seleção, e
    // avisar o content script a cada tecla o faria re-estimar o contexto à toa.
    function syncAtalhos() {
      const visiveis = rowsVisiveis();
      const todasMarcadas = (filtro) => {
        const rows = visiveis.filter(filtro);
        return (
          rows.length > 0 &&
          rows.every((r) => {
            const c = r.querySelector('input[type="checkbox"]');
            return c && c.checked;
          })
        );
      };
      chkEss.checked = todasMarcadas(DEGRAUS.ess);
      chkMain.checked = todasMarcadas(DEGRAUS.main);
      chkAll.checked = todasMarcadas(DEGRAUS.all);
    }

    function syncSelection() {
      const sel = getSelectedDocs();
      const total = allDocs.length;

      syncAtalhos();
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

    // Nota dos atalhos: some sozinha no próximo gesto de seleção. Não usa o
    // `.status` (disputado — a estimativa de contexto escreve nele ~900 ms
    // depois e apaga a mensagem) nem a `.docs-tip` (que tem dono, com
    // auto-reset de 12 s).
    function setSelNota(txt) {
      // Num PJe não suportado a lista está vazia por uma causa que já tem
      // aviso próprio, e qualquer nota sobre degraus de seleção é ruído — com
      // potencial de ENGANAR, que foi exatamente o que originou este recurso:
      // o usuário clicou em “chave”, leu “Nenhuma peça reconhecida como
      // «chave»” e entendeu que faltava a CHAVE DA API (que estava certa).
      if (naoSuportado) txt = "";
      selNota.textContent = txt || "";
      selNota.hidden = !txt;
    }

    // Estado vazio da lista de peças.
    //
    // O aviso de tribunal não suportado NÃO mora aqui, e isso é correção de um
    // defeito que o teste pegou: pendurado no estado vazio, ele dependia de a
    // lista chegar vazia — verdade no PJe KZ de hoje, mas premissa, não
    // garantia. Um único link que casasse o padrão da timeline faria o aviso
    // SUMIR e deixaria o usuário com peças que não têm rota de download. Ele
    // passou a ser um bloco fixo da coluna (`.naosup`), e aqui só resta não
    // repetir o assunto: um "nenhuma peça encontrada" logo abaixo de um aviso
    // que já explicou o motivo é uma segunda frase mais fraca enfraquecendo a
    // primeira.
    function htmlListaVazia() {
      if (naoSuportado) return "";
      return '<div class="empty">Nenhuma peça encontrada nesta tela.</div>';
    }

    // Aplica um degrau de seleção. Os três compartilham o mesmo contrato:
    // agem só nas rows VISÍVEIS (a busca ativa é respeitada) e são ADITIVOS —
    // marcar nunca desmarca o que o usuário escolheu à mão.
    function aplicarDegrau(chk, filtro, nome) {
      const alvo = rowsVisiveis().filter(filtro);
      // Modo de falha silencioso: numa lista sem nenhuma peça do degrau (comum
      // em "chave" antes de a grid ser lida), o clique não faria absolutamente
      // nada e o checkbox voltaria sozinho — indistinguível de um botão
      // quebrado. Dizer o motivo é o mínimo.
      if (!alvo.length) {
        chk.checked = false;
        setSelNota(
          temTipoOficial
            ? "Nenhuma peça desta lista foi reconhecida como “" + nome + "”."
            : "Nenhuma peça reconhecida como “" + nome + "” — a lista ainda não " +
              "tem o tipo oficial de cada peça. Clique em “Carregar tudo” para " +
              "melhorar a classificação."
        );
        return;
      }
      for (const r of alvo) {
        const c = r.querySelector('input[type="checkbox"]');
        if (c) c.checked = chk.checked;
      }
      // Sem o tipo oficial a classificação sai só do título (que costuma ser o
      // nome do arquivo), então "chave" seleciona de menos — em silêncio, que é
      // o pior jeito: o usuário pede o essencial, recebe 3 de 12 e a análise
      // sai sobre autos incompletos sem ninguém perceber.
      setSelNota(
        chk.checked && !temTipoOficial && nome === "chave"
          ? alvo.length + " marcadas só pelo título — “Carregar tudo” melhora a escolha."
          : ""
      );
      syncSelection();
    }

    chkEss.addEventListener("change", () =>
      aplicarDegrau(chkEss, DEGRAUS.ess, "chave")
    );
    chkMain.addEventListener("change", () =>
      aplicarDegrau(chkMain, DEGRAUS.main, "principais")
    );
    chkAll.addEventListener("change", () =>
      aplicarDegrau(chkAll, DEGRAUS.all, "todas")
    );
    // eventos change dos checkboxes individuais borbulham até a lista
    doclist.addEventListener("change", () => {
      setSelNota(""); // a nota fala do último clique em atalho; este é outro gesto
      syncSelection();
    });

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
      if (e.target.closest("button")) return; // o .d-ver tem dono próprio
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
    // -------------------------------------------------------------------------
    // AVISO ANTES DA LEITURA **CARA** DA LISTA OFICIAL (a grid).
    //
    // A extensão tem duas rotas para a lista: a API REST, que não custa nada à
    // sessão, e a grid da tela "Documentos", que faz POST de página INTEIRA por
    // página — e é ela que pode derrubar a aba com "Sua página expirou". Só a
    // segunda merece aviso, e é por isso que quem decide mostrá-lo é o
    // content.js, no instante em que vai cair nela: avisar no clique do ⟳ diria
    // ao usuário que ele corre um risco que, no caminho normal, não corre.
    //
    // O motivo do aviso não é corrigível em código: o que decide o desfecho é
    // comportamento — quantas abas do PJe estão abertas (todas dividem a MESMA
    // sessão) e quando se clica. Por isso a orientação chega no instante da
    // decisão, e não num guia que ninguém abre antes.
    //
    // Devolve uma Promise<boolean>: `true` segue, `false` desiste. A leitura do
    // storage acontece AQUI, e não no boot, o que dispensa a armadilha de
    // callback síncrono do stub de teste que já mordeu `docsOcultas` e
    // `guiaAberta`.
    // -------------------------------------------------------------------------
    const gwarnBox = $(".gwarn");
    const gwarnCard = $(".gwarn-card");
    const gwarnCb = $(".gwarn-cb");
    // A resposta pendente. Só pode ser entregue UMA vez: o usuário pode fechar
    // pelo ✕, pelo Cancelar, pelo Esc ou pelo backdrop, e todos passam por aqui.
    let gwarnResolve = null;
    function responderGwarn(v) {
      const r = gwarnResolve;
      gwarnResolve = null;
      gwarnBox.hidden = true;
      if (r) r(v);
    }
    $(".gwarn-close").addEventListener("click", () => responderGwarn(false));
    $(".gwarn-cancel").addEventListener("click", () => responderGwarn(false));
    gwarnBox.addEventListener("click", (e) => {
      if (e.target === gwarnBox) responderGwarn(false);
    });
    // stopPropagation como no `.plib-card` e no `.prec-card`: sem ele o Esc daqui
    // cancelaria junto o modo minuta/mapa que estivesse ligado atrás.
    gwarnCard.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        responderGwarn(false);
      }
    });
    $(".gwarn-ok").addEventListener("click", () => {
      if (gwarnCb.checked) {
        try {
          chrome.storage.local.set({ avisoGridVisto: true });
        } catch {
          /* contexto de extensão invalidado: o aviso volta na próxima, e tudo bem */
        }
      }
      responderGwarn(true);
    });
    function confirmarLeituraPesada() {
      return new Promise((resolve) => {
        // Uma chamada nova com outra pendente deixaria a primeira promessa
        // pendurada para sempre — e quem a esperava travaria em silêncio. Não
        // deveria acontecer (o content.js serializa), mas promessa presa é o
        // tipo de defeito que não dá sintoma nenhum: fecha-se a anterior.
        if (gwarnResolve) responderGwarn(false);
        let respondeu = false;
        const decidir = (r) => {
          if (respondeu) return; // storage que responde síncrono E via promessa
          respondeu = true;
          if (r && r.avisoGridVisto) return resolve(true); // já sabe do risco
          gwarnResolve = resolve;
          gwarnCb.checked = false;
          gwarnBox.hidden = false;
          gwarnCard.focus();
        };
        try {
          const p = chrome.storage.local.get({ avisoGridVisto: false }, decidir);
          if (p && typeof p.then === "function") p.then(decidir);
        } catch {
          decidir(null); // sem storage, avisa — errar para o lado de explicar
        }
      });
    }
    tipLoad.addEventListener("click", () => carregarTLCb && carregarTLCb());

    // -------------------------------------------------------------------------
    // CONFERÊNCIA ANTES DE ENVIAR (modo sigiloso) — ver `confirmarEnvioSigiloso`
    // no content.js. Promessa única, como a `.gwarn`: ✕, "Cancelar envio", Esc
    // e o backdrop respondem `false`; só "Enviar" responde `true`. A lista de
    // peças é construída com NÓS (conteúdo dos autos, nunca innerHTML) e o
    // texto de cada peça é pintado por `pintarMarcas` — as MESMAS marcas da
    // auditoria, para o que se aprova aqui e o que se confere depois serem a
    // mesma coisa aos olhos.
    // -------------------------------------------------------------------------
    const sigokBox = $(".sigok");
    const sigokCard = $(".sigok-card");
    const sigokCb = $(".sigok-cb");
    const sigokList = $(".sigok-list");
    const sigokResumo = $(".sigok-resumo");
    const sigokChips = $(".sigok-chips");
    const sigokOk = $(".sigok-ok");
    let sigokResolve = null;
    let sigokInfo = null;
    // ids cujo texto está aberto — preservado no repintar (editar uma peça não
    // pode fechar as outras que o usuário estava lendo)
    const sigokAbertos = new Set();
    // ids que o usuário tirou DESTE envio ("Não enviar"): voltam ao content
    // no {ok:true, removidas}, que os desmarca.
    const sigokRemovidas = new Set();
    function responderSigok(v) {
      const r = sigokResolve;
      const removidas = [...sigokRemovidas];
      sigokResolve = null;
      sigokInfo = null;
      sigokBox.hidden = true;
      sigokList.textContent = "";
      sigokAbertos.clear();
      sigokRemovidas.clear();
      if (r) r(v ? { ok: true, removidas } : false);
    }
    $(".sigok-close").addEventListener("click", () => responderSigok(false));
    $(".sigok-cancel").addEventListener("click", () => responderSigok(false));
    sigokBox.addEventListener("click", (e) => {
      if (e.target === sigokBox) responderSigok(false);
    });
    sigokCard.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        responderSigok(false);
      }
    });
    sigokOk.addEventListener("click", () => {
      const info = sigokInfo;
      if (sigokCb.checked && info && typeof info.onNaoPerguntar === "function") info.onNaoPerguntar();
      responderSigok(true);
    });
    const RE_ROTULO_SK = /\[([A-Z][A-Z0-9]*)_(\d+)\]/g;
    function pintarSigok(d) {
      const pecas = ((d && d.pecas) || []).filter((pe) => !sigokRemovidas.has(String(pe.id)));
      const itens = (d && d.itens) || [];
      // Resumo: quantas peças e quantas SUBSTITUIÇÕES neste envio — o número
      // que muda de um turno para o outro, e não o total do processo.
      let subs = 0;
      const porTipo = new Map(); // tipo -> rótulos distintos neste envio
      for (const pe of pecas) {
        const t = String(pe.texto || "");
        let m;
        RE_ROTULO_SK.lastIndex = 0;
        while ((m = RE_ROTULO_SK.exec(t)) !== null) {
          subs++;
          if (!porTipo.has(m[1])) porTipo.set(m[1], new Set());
          porTipo.get(m[1]).add(m[0]);
        }
      }
      sigokResumo.textContent =
        (pecas.length === 1 ? "1 peça vai sair" : pecas.length + " peças vão sair") +
        " como texto anonimizado, com " +
        subs + (subs === 1 ? " substituição" : " substituições") + ".";
      sigokChips.textContent = "";
      for (const [tipo, set] of [...porTipo].sort((a, b) => b[1].size - a[1].size)) {
        const c = document.createElement("span");
        c.className = "aud-chip";
        c.textContent = nomeTipo(tipo, set.size);
        sigokChips.appendChild(c);
      }
      sigokChips.hidden = !porTipo.size;
      sigokOk.textContent = pecas.length
        ? "Enviar " + (pecas.length === 1 ? "1 peça" : pecas.length + " peças")
        : "Enviar sem peça nova";

      sigokList.textContent = "";
      for (const pe of pecas) {
        const row = document.createElement("div");
        row.className = "sk-row";
        const cab = document.createElement("div");
        cab.className = "sk-cab";
        const nome = document.createElement("span");
        nome.className = "sk-t";
        nome.textContent = pe.titulo || String(pe.id);
        const meta = document.createElement("span");
        meta.className = "sk-m";
        const n = (String(pe.texto || "").match(/\[[A-Z][A-Z0-9]*_\d+\]/g) || []).length;
        meta.textContent =
          (pe.chars || 0) + " caracteres · " + n + (n === 1 ? " substituição" : " substituições");
        const acts = document.createElement("span");
        acts.className = "sk-acts";
        const ver = document.createElement("button");
        ver.type = "button";
        ver.className = "sk-ver";
        const corpo = document.createElement("pre");
        corpo.className = "sk-txt";
        pintarMarcas(corpo, pe.texto || "", itens);
        const aberto = sigokAbertos.has(pe.id);
        corpo.hidden = !aberto;
        ver.textContent = aberto ? "Ocultar" : "Ver o texto";
        ver.addEventListener("click", () => {
          corpo.hidden = !corpo.hidden;
          if (corpo.hidden) sigokAbertos.delete(pe.id);
          else sigokAbertos.add(pe.id);
          ver.textContent = corpo.hidden ? "Ver o texto" : "Ocultar";
        });
        acts.appendChild(ver);
        const info = sigokInfo;
        if (info && typeof info.onEditar === "function") {
          const ed = document.createElement("button");
          ed.type = "button";
          ed.className = "sk-edit";
          ed.textContent = "Editar";
          ed.title = "Abre o texto para mascarar, liberar ou corrigir à mão antes de enviar";
          ed.addEventListener("click", async () => {
            ed.disabled = true;
            try {
              await info.onEditar(pe.id);
            } finally {
              ed.disabled = false;
              // a caixa pode já ter sido respondida enquanto o editor estava aberto
              if (sigokInfo === info && typeof info.recarregar === "function") {
                pintarSigok(info.recarregar());
              }
            }
          });
          acts.appendChild(ed);
        }
        // "Não enviar": a peça sai DESTE envio (e da seleção). É o "vamos
        // excluir a peça" — a decisão mais barata quando o texto não convence.
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "sk-remover";
        rm.textContent = "Não enviar";
        rm.title = "Tira esta peça do envio e da seleção; marque-a de novo quando quiser";
        rm.addEventListener("click", () => {
          sigokRemovidas.add(String(pe.id));
          const inf = sigokInfo;
          pintarSigok(inf && typeof inf.recarregar === "function" ? inf.recarregar() : { pecas, itens });
        });
        acts.appendChild(rm);
        cab.appendChild(nome);
        cab.appendChild(meta);
        cab.appendChild(acts);
        row.appendChild(cab);
        row.appendChild(corpo);
        sigokList.appendChild(row);
      }
    }

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
    // -------------------------------------------------------------------------
    // PACOTE DE CARTA PRECATÓRIA — a segunda saída do botão de download.
    //
    // É um SPLIT button, e não um menu no clique principal: baixar as peças é o
    // caso comum e não podia ganhar um clique a mais para acomodar o novo. O
    // caret abre o menu; o corpo do botão segue fazendo o que sempre fez.
    // -------------------------------------------------------------------------
    const tipZipMais = $(".tip-zip-mais");
    let precCb = null;
    let textoCb = null;

    // Botão PRÓPRIO na faixa, e não só o item do menu do split button: com a
    // coluna estreita os botões viram só-ícone e o caret fica um alvo de ~10px
    // colado no download. O usuário clicou no corpo do botão e recebeu o .zip.
    // Ação que não se acha não existe.
    tipOcr.addEventListener("click", () => {
      if (!textoCb || tipOcr.disabled) return;
      const marcadas = getSelectedDocs();
      const alvo = marcadas.length ? marcadas : allDocs;
      if (!alvo.length) {
        statusEl.textContent = "A lista de peças está vazia — não há texto para extrair.";
        return;
      }
      textoCb(alvo, { todas: !marcadas.length });
    });
    let zipmenu = null;
    function fecharZipMenu() {
      if (zipmenu) zipmenu.remove();
      zipmenu = null;
      tipZipMais.setAttribute("aria-expanded", "false");
    }
    tipZipMais.addEventListener("click", (e) => {
      e.stopPropagation();
      if (zipmenu) return fecharZipMenu();
      if (tipZip.disabled) return;
      // `position: fixed` e ancorado pelo rect do botão: o `.wrap` é um
      // container de tamanho ZERO (quem tem dimensão é o `.panel`), então
      // posicionar por dentro dele jogaria o menu para fora da tela — a mesma
      // regra do `.selmenu` e da `.confirmbox`.
      const r = tipZipMais.getBoundingClientRect();
      zipmenu = document.createElement("div");
      zipmenu.className = "selmenu zipmenu";
      zipmenu.setAttribute("role", "menu");
      const marcadas = getSelectedDocs();
      const bPecas = document.createElement("button");
      bPecas.type = "button";
      bPecas.setAttribute("role", "menuitem");
      bPecas.textContent = marcadas.length
        ? "Peças marcadas (" + marcadas.length + ")"
        : "Todas as peças da lista";
      bPecas.addEventListener("click", () => {
        fecharZipMenu();
        tipZip.click();
      });
      const bPrec = document.createElement("button");
      bPrec.type = "button";
      bPrec.className = "sep";
      bPrec.setAttribute("role", "menuitem");
      bPrec.textContent = "Pacote de carta precatória…";
      bPrec.title =
        "Monta, para cada carta precatória expedida, uma pasta com a carta, a peça " +
        "de origem da ação e a decisão que a fundamenta — pronta para o malote digital.";
      bPrec.addEventListener("click", () => {
        fecharZipMenu();
        if (precCb) precCb();
      });
      // Extrair texto: mesma família das outras duas (ação sobre a lista que
      // termina num arquivo baixado), então entra aqui e não numa quarta pílula
      // da `.docs-tip` — a fileira é `nowrap` e os rótulos já somam ~416 px numa
      // coluna de 328 px.
      // DOIS destinos para o mesmo trabalho de extração, e o rótulo de cada um
      // NOMEIA o formato: "Extrair o texto…" sozinho não dizia se saía um
      // arquivo ou muitos, e é essa a única diferença entre os dois.
      function itemTexto(rotulo, dica, opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.textContent = rotulo;
        b.title = dica;
        b.addEventListener("click", () => {
          fecharZipMenu();
          if (!textoCb) return;
          const alvo = marcadas.length ? marcadas : allDocs;
          if (!alvo.length) {
            statusEl.textContent = "A lista de peças está vazia — não há texto para extrair.";
            return;
          }
          textoCb(alvo, Object.assign({ todas: !marcadas.length }, opts));
        });
        return b;
      }
      const bTexto = itemTexto(
        "Extrair o texto (um arquivo .md)…",
        "Lê o texto das peças marcadas e baixa um único .md com o processo inteiro, " +
          "uma seção por página. O texto NÃO vai para a conversa.",
        null
      );
      bTexto.className = "sep";
      const bTextoZip = itemTexto(
        "Extrair o texto (um .md por peça)…",
        "Mesmo trabalho, outro empacotamento: um .zip com um arquivo .md por peça, " +
          "um índice com links e o .md do processo inteiro junto. Serve para " +
          "trabalhar peça a peça fora da extensão. O texto NÃO vai para a conversa.",
        { porPeca: true }
      );
      zipmenu.appendChild(bPecas);
      zipmenu.appendChild(bPrec);
      zipmenu.appendChild(bTexto);
      zipmenu.appendChild(bTextoZip);
      wrap.appendChild(zipmenu);
      const larg = zipmenu.offsetWidth || 210;
      zipmenu.style.left = Math.max(6, Math.min(r.right - larg, innerWidth - larg - 6)) + "px";
      zipmenu.style.top = Math.max(6, r.top - zipmenu.offsetHeight - 6) + "px";
      tipZipMais.setAttribute("aria-expanded", "true");
      bPecas.focus();
    });
    document.addEventListener("click", fecharZipMenu);
    wrap.addEventListener("click", (e) => {
      if (zipmenu && !zipmenu.contains(e.target) && e.target !== tipZipMais) fecharZipMenu();
    });

    // -------------------------------------------------------------------------
    // Conferência dos pacotes antes de baixar.
    //
    // MARCA, não baixa direto: a seleção é feita por regra sobre os metadados do
    // PJe e o resultado vai por MALOTE — um erro aqui só apareceria no juízo
    // deprecado, semanas depois, e um `.zip` só se confere abrindo. O usuário vê
    // as três peças de cada pasta, com o motivo de cada uma, e decide.
    // -------------------------------------------------------------------------
    const precBox = $(".prec");
    const precCard = $(".prec-card");
    const precList = $(".prec-list");
    const precIntro = $(".prec-intro");
    const precOk = $(".prec-ok");
    let precDados = null;
    let precConfirmar = null;

    // "carta", e não "carta precatória": o rótulo é uma coluna de largura fixa,
    // e o nome longo quebrava em duas linhas, desalinhando a lista inteira. No
    // modal chamado "Cartas precatórias", com cada bloco começando por "Carta
    // N — expedida em …", o "precatória" já foi dito duas vezes.
    const PAPEL_ROTULO = { carta: "carta", origem: "origem da ação", decisao: "decisão" };
    function precLinhaPeca(papel, doc, extra) {
      const li = document.createElement("div");
      li.className = "prec-p prec-p-" + papel;
      const tag = document.createElement("span");
      tag.className = "prec-tag";
      tag.textContent = PAPEL_ROTULO[papel];
      const id = document.createElement("span");
      id.className = "prec-id";
      id.textContent = doc.id;
      const t = document.createElement("span");
      t.className = "prec-t";
      // título vem dos autos: textContent, nunca innerHTML
      t.textContent = tituloCurto(doc.titulo);
      // O nome é cortado com ellipsis (a coluna é estreita e o título do PJe é
      // longo). O `title` devolve o texto inteiro no hover — sem ele, decidir se
      // a peça certa foi escolhida dependeria de adivinhar o que o "…" esconde.
      t.title = doc.titulo;
      li.appendChild(tag);
      li.appendChild(id);
      li.appendChild(t);
      if (extra) {
        const e = document.createElement("span");
        e.className = "prec-extra";
        e.textContent = extra;
        li.appendChild(e);
      }
      return li;
    }
    // `instanceof Date` NÃO serve aqui: ele é falso entre realms (um Date criado
    // noutro contexto — harness de teste, worker, valor reidratado — não é
    // "instância" deste `Date`), e falso também para a mesma data em texto ISO.
    // Duck typing cobre os três casos e degrada para `null` sem quebrar.
    function precData(d) {
      if (!d) return null;
      const dt = typeof d === "string" ? new Date(d) : d;
      if (!dt || typeof dt.getTime !== "function" || isNaN(dt.getTime())) return null;
      return dt.toLocaleDateString("pt-BR");
    }
    function pintarPrec() {
      precList.textContent = "";
      precIntro.textContent = "";
      const pacotes = (precDados && precDados.pacotes) || [];
      // Sem pacote, o aviso "nenhuma carta encontrada" diria em faixa laranja
      // exatamente o que o estado vazio já diz logo abaixo, com mais palavras e
      // sem a saída. Dizer duas vezes a mesma coisa não reforça, dilui.
      const avisos = ((precDados && precDados.avisos) || []).filter(
        (a) => pacotes.length || !/nenhuma carta/i.test(a)
      );
      for (const a of avisos) {
        const w = document.createElement("div");
        w.className = "prec-aviso";
        w.textContent = a;
        precIntro.appendChild(w);
      }
      if (!pacotes.length) {
        // Estado VAZIO se explica, não desaparece — mesma regra da `.sel-nota`
        // nos degraus de seleção e da linha de modelos da minuta.
        const v = document.createElement("div");
        v.className = "prec-vazio";
        v.textContent =
          "Nenhuma carta precatória expedida foi encontrada nesta lista. Se o processo " +
          "tem cartas, clique em “⟳ Carregar tudo” para trazer a lista completa da " +
          "linha do tempo e tente de novo.";
        precList.appendChild(v);
        precOk.disabled = true;
        return;
      }
      // AVISO DE FORMATO — fixo, e antes de gerar. Este pacote vira anexo de
      // malote, e peça escrita no editor do PJe (que é o caso da carta, do
      // despacho e da decisão quase sempre) chega à extensão como CONTEÚDO, não
      // como o PDF assinado. Descobrir isso depois de anexar ao e-mail é o pior
      // momento possível — daí a faixa de aviso, e não uma linha na nota de
      // rodapé. O `.zip` repete a informação com a lista exata dos arquivos.
      const fmt = document.createElement("div");
      fmt.className = "prec-aviso";
      fmt.textContent =
        "Peças escritas no editor do PJe saem como .txt: a extensão recebe o conteúdo " +
        "delas, não o PDF com timbre e assinatura. Para enviar pelo malote, baixe essas " +
        "peças pelo ícone ⬇ do visualizador do PJe e substitua os .txt na pasta — o " +
        "LEIA-ME do .zip diz quais são.";
      precIntro.appendChild(fmt);
      const nota = document.createElement("div");
      nota.className = "prec-nota";
      nota.textContent =
        "Cada pasta do .zip vira um envio de malote. Confira as peças antes de baixar — " +
        "a escolha é automática e não lê o conteúdo dos documentos.";
      precIntro.appendChild(nota);
      for (const p of pacotes) {
        const box = document.createElement("label");
        box.className = "prec-item";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = p.__on !== false;
        cb.addEventListener("change", () => {
          p.__on = cb.checked;
          precOk.disabled = !pacotes.some((x) => x.__on !== false);
        });
        const corpo = document.createElement("div");
        corpo.className = "prec-corpo";
        const hd = document.createElement("div");
        hd.className = "prec-hd";
        const d = precData(p.data);
        hd.textContent = "Carta " + p.n + (d ? " — expedida em " + d : "");
        corpo.appendChild(hd);
        for (const c of p.carta) corpo.appendChild(precLinhaPeca("carta", c, null));
        if (p.origem) corpo.appendChild(precLinhaPeca("origem", p.origem, p.origemRotulo));
        if (p.decisao) {
          const dd = precData(p.decisaoData);
          corpo.appendChild(
            precLinhaPeca("decisao", p.decisao, dd ? "de " + dd + ", anterior à carta" : null)
          );
        }
        if (p.faltas && p.faltas.length) {
          const f = document.createElement("div");
          f.className = "prec-falta";
          f.textContent = "Não localizado: " + p.faltas.join("; ");
          corpo.appendChild(f);
        }
        box.appendChild(cb);
        box.appendChild(corpo);
        precList.appendChild(box);
      }
      precOk.disabled = false;
    }
    function abrirPrec(dados, onConfirmar) {
      precDados = dados;
      precConfirmar = onConfirmar;
      pintarPrec();
      precBox.hidden = false;
      precCard.focus();
    }
    function fecharPrec() {
      precBox.hidden = true;
      precDados = null;
      precConfirmar = null;
    }
    $(".prec-close").addEventListener("click", fecharPrec);
    $(".prec-cancel").addEventListener("click", fecharPrec);
    precBox.addEventListener("click", (e) => {
      if (e.target === precBox) fecharPrec();
    });
    // stopPropagation como no `.plib-card`: sem ele o Esc do modal cancelaria
    // junto o modo minuta/mapa que estivesse ligado atrás.
    precCard.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fecharPrec();
      }
    });
    precOk.addEventListener("click", () => {
      if (!precDados || !precConfirmar) return;
      const escolhidos = precDados.pacotes.filter((p) => p.__on !== false);
      if (!escolhidos.length) return;
      const cb = precConfirmar;
      fecharPrec();
      cb(escolhidos);
    });

    // Trava o botão enquanto a exportação corre (o download do PJe é
    // serializado: dois lotes ao mesmo tempo brigariam pela sessão JSF).
    function setZipOcupado(on) {
      tipZip.disabled = !!on;
      tipZipMais.disabled = !!on;
      if (on) fecharZipMenu();
      // rotulo(), nunca textContent: o botão é <svg> + <span class="lbl">, e
      // escrever no botão inteiro apagaria o ícone no primeiro clique. Era o
      // que acontecia aqui — e ainda com um rótulo ("⬇ Documentos") que nem
      // batia com o do template ("Baixar .zip").
      rotulo(tipZip, on ? "Baixando…" : "Baixar .zip");
      tipOcr.disabled = !!on;
    }

    // -------------------------------------------------------------------------
    // ESCOLHER COM IA — camada 2 da seleção.
    //
    // A camada 1 (classificarPeca, por regex) responde em 0 ms, sem chave e sem
    // custo, e é o padrão. O que ela não tem é CONTEXTO: num processo com sete
    // peças chamadas só "Petição", ela não sabe qual é a inicial; um título
    // "Documento 3" não classifica nada.
    //
    // Aqui a lista inteira — id, título, tipo e data, NENHUM conteúdo de peça —
    // vai à IA, que devolve os ids relevantes. É sob demanda de propósito: nada
    // acontece sem o usuário pedir, então não há custo surpresa nem espera não
    // solicitada, e o resultado é sempre atribuível a uma ação dele.
    //
    // A pergunta que estiver no campo vira o OBJETIVO da escolha ("houve
    // prescrição?" traz peças diferentes de "qual o valor da causa?"). Vazio, o
    // objetivo é entender o processo. O texto não é consumido — continua no
    // campo para o usuário enviar em seguida, agora com as peças certas.
    // -------------------------------------------------------------------------
    let iaCb = null;
    tipIa.addEventListener("click", () => {
      if (!iaCb || tipIa.disabled) return;
      if (!allDocs.length) {
        statusEl.textContent = "A lista de peças está vazia.";
        return;
      }
      setSelNota("");
      // A seleção ATUAL vai junto: a escolha marca as peças ao vivo, conforme
      // os ids chegam, e o content script precisa saber ao que voltar se o
      // turno falhar no meio — sem isso uma falha deixaria a lista num estado
      // parcial que o usuário não pediu nem consegue desfazer.
      iaCb(allDocs, inEl.value.trim(), getSelected());
    });
    function setIaOcupado(on) {
      tipIa.disabled = !!on;
      rotulo(tipIa, on ? "Escolhendo…" : "Escolher com IA");
    }
    // Aplica a escolha da IA: marca os ids, DESMARCANDO o resto — aqui a
    // substituição é o contrato certo (ao contrário dos degraus, que somam):
    // o usuário pediu uma escolha, e uma escolha que só acrescenta ao que já
    // estava marcado não é uma escolha. `motivos` alimenta o title de cada row,
    // para o critério ficar auditável peça a peça.
    function aplicarEscolhaIA(ids, motivos) {
      const set = new Set(ids || []);
      for (const r of doclist.querySelectorAll(".docrow")) {
        const c = r.querySelector('input[type="checkbox"]');
        if (!c) continue;
        c.checked = set.has(c.value);
        const m = motivos && motivos[c.value];
        const t = r.querySelector(".d-t");
        if (t) {
          const base = t.dataset.tituloOriginal || t.getAttribute("title") || "";
          if (!t.dataset.tituloOriginal) t.dataset.tituloOriginal = base;
          t.setAttribute("title", m ? base + "\n\n" + m : base);
        }
      }
      syncSelection();
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
      // O `|| naoSuportado` não é redundante com o `setNaoSuportado`: esta
      // linha REESCREVE o `disabled` a cada chamada e reabilitaria o botão que
      // ele desligou. Quem grava por último manda.
      tipLoad.disabled = carregando || !!naoSuportado;
      // rotulo(), nunca textContent: o botão é <svg> + <span class="lbl"> e
      // escrever no botão inteiro apagaria o ícone na primeira carga.
      rotulo(tipLoad, carregando ? "Carregando…" : "Carregar tudo");
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
    // -------------------------------------------------------------------------
    // LINHA DO TEMPO DO PROCESSO — a lista LEGÍVEL por trás do selo.
    //
    // O selo (v0.45.2) dizia quantos movimentos foram ao modelo; as datas em si
    // não apareciam em lugar nenhum — para lê-las era preciso que o modelo as
    // citasse na resposta. Quem confere prazo precisa do REGISTRO, não do
    // resumo: é ele que diz se a resposta bate com os autos. O selo virou a
    // porta para ele.
    //
    // Criado sob demanda e `position: fixed`, como o `.selmenu` e a
    // `.confirmbox`: o `.wrap` é um container de tamanho ZERO (quem tem dimensão
    // é o `.panel`), então posicionar por dentro dele joga o elemento para fora
    // da tela.
    // -------------------------------------------------------------------------
    let movItens = [];
    let movCab = "";
    let movExplica = "";
    let movbox = null;
    function fecharMov() {
      if (!movbox) return;
      movbox.remove();
      movbox = null;
      ltEl.setAttribute("aria-expanded", "false");
    }
    function abrirMov() {
      fecharMov();
      const box = document.createElement("div");
      box.className = "movbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "Linha do tempo do processo");
      const hd = document.createElement("div");
      hd.className = "mv-hd";
      const t = document.createElement("span");
      t.className = "mv-t";
      t.textContent = movCab;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "mv-x";
      x.title = "Fechar (Esc)";
      x.innerHTML = SVG.x; // ícone do próprio pacote, não conteúdo externo
      x.addEventListener("click", fecharMov);
      hd.appendChild(t);
      hd.appendChild(x);
      box.appendChild(hd);
      const lista = document.createElement("div");
      lista.className = "mv-list";
      // CONJUNTO VAZIO SE EXPLICA (a regra da `.sel-nota` e do estado vazio da
      // biblioteca). Antes, sem movimento nenhum, `abrirMov` saía na primeira
      // linha: o selo âmbar ficava com `cursor: pointer` prometendo um clique que
      // não fazia NADA — o mesmo "botão mudo" que o botão de copiar o PIX já
      // custou uma correção. E é justo aqui que a pergunta "por que não há
      // datas?" nasce, então é aqui que ela tem de ser respondida (o tooltip
      // responde, mas some no toque e passa despercebido num chip pequeno).
      if (!movItens.length) {
        const v = document.createElement("div");
        v.className = "mv-vazio";
        v.textContent = movExplica;
        lista.appendChild(v);
      }
      for (const it of movItens) {
        // Marca do corte: a lista salta de uma data para outra bem distante, e
        // sem esta linha o salto passaria por continuidade.
        if (it.lacuna) {
          const g = document.createElement("div");
          g.className = "mv-gap";
          g.textContent = "… " + it.lacuna + " …";
          lista.appendChild(g);
          continue;
        }
        const row = document.createElement("div");
        row.className = "mv-row";
        const d = document.createElement("span");
        d.className = "mv-d";
        d.textContent = it.data || "sem data";
        const b = document.createElement("span");
        b.className = "mv-b";
        const ev = document.createElement("b");
        // textContent, NUNCA innerHTML: isto é conteúdo dos autos (o movimento
        // e o complemento vêm do PJe), e o `escapeHtml` do painel não escapa
        // aspa simples.
        ev.textContent = it.evento || "";
        b.appendChild(ev);
        if (it.texto) {
          const c = document.createElement("span");
          c.className = "mv-c";
          c.textContent = it.texto;
          b.appendChild(c);
        }
        for (const id of it.pecas || []) {
          // Só id que PARECE id entra como botão — o mesmo critério das citações
          // do chat (o número vem do texto do movimento, que é dado dos autos).
          if (!/^\d+$/.test(String(id))) continue;
          const p = document.createElement("button");
          p.type = "button";
          p.className = "mv-p";
          p.dataset.id = String(id);
          p.title = "Ver a peça " + id + " na linha do tempo do PJe";
          p.textContent = "peça " + id;
          b.appendChild(p);
        }
        row.appendChild(d);
        row.appendChild(b);
        lista.appendChild(row);
      }
      box.appendChild(lista);
      // Delegado: uma lista de 140 movimentos não precisa de 140 listeners.
      lista.addEventListener("click", (e) => {
        const p = e.target.closest(".mv-p");
        if (!p) return;
        fecharMov();
        irParaPeca(p.dataset.id);
      });
      wrap.appendChild(movbox = box);
      ltEl.setAttribute("aria-expanded", "true");
      posicionarMov();
    }
    function posicionarMov() {
      if (!movbox) return;
      const p = panelEl.getBoundingClientRect();
      const r = ltEl.getBoundingClientRect();
      // A caixa é DO PAINEL, não da página, e é isso que a medição nos modos
      // mostrou: ancorada só no selo e clampada pela viewport, ela vazava para
      // fora do painel no LATERAL (420px colado à direita) e ia parar sobre a
      // tela do tribunal, encostando na borda da janela — parecia acidente, não
      // desenho. Agora as bordas do painel são o limite, com 8px de recuo: onde
      // o painel é estreito a caixa fica visivelmente DENTRO dele.
      const larg = Math.max(240, Math.min(420, p.width - 16));
      movbox.style.width = larg + "px";
      // A altura também respeita o painel — uma caixa mais alta que ele
      // flutuaria por cima do cabeçalho e da página ao mesmo tempo.
      const lista = movbox.querySelector(".mv-list");
      if (lista) lista.style.maxHeight = Math.max(140, Math.min(460, p.height - 96)) + "px";
      const alt = movbox.offsetHeight;
      // Alinhada à DIREITA do selo (que vive no canto direito do rodapé), porque
      // é dele que a caixa sai — mas sem passar da borda do painel.
      const dir = Math.min(r.right, p.right - 8);
      movbox.style.left =
        Math.max(p.left + 8, Math.min(dir - larg, window.innerWidth - larg - 6)) + "px";
      // ACIMA do selo, que é onde há espaço; abaixo só quando não cabe em cima.
      if (r.top - alt - 8 >= 6) movbox.style.top = r.top - alt - 8 + "px";
      else movbox.style.top = Math.max(6, Math.min(r.bottom + 8, window.innerHeight - alt - 6)) + "px";
    }
    ltEl.addEventListener("click", () => (movbox ? fecharMov() : abrirMov()));
    // Fecha em clique fora e no Esc. O `stopPropagation` no Esc é obrigatório:
    // sem ele a cascata do painel (`/` → `@` → modal → modo minuta) cancelaria
    // outra coisa junto — mesma regra do Esc do preview.
    //
    // O listener vive no `document`, e não no `wrap` como o do `.selmenu`: o
    // `wrap` só enxerga o que acontece DENTRO do Shadow DOM, e nos modos
    // lateral, livre e flutuante a página do tribunal fica visível e CLICÁVEL ao
    // lado — com a caixa em `position: fixed` por cima dela. Ancorado no `wrap`,
    // clicar nos autos não fechava nada: a lista ficava aberta sobre o processo
    // enquanto o usuário trabalhava, e só o Esc a tirava. (O `.selmenu` tem o
    // mesmo desenho, mas ele ainda fecha em todo `setDocs`; esta caixa não.)
    //
    // A decisão é por `composedPath()`, NUNCA por `e.target`: no `document` o
    // alvo de dentro do Shadow DOM chega RETARGETADO para o host, então
    // `e.target.closest(".movbox")` daria `null` e o clique dentro da própria
    // caixa a fecharia — inclusive o clique no botão "peça N", que morreria
    // antes do `click`. `composedPath` atravessa a fronteira e devolve os nós
    // reais.
    //
    // `capture: true` para o fechamento não depender de ninguém deixar o evento
    // subir, e a guarda `!movbox` na primeira linha para que, fora deste estado,
    // o listener não custe nada.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!movbox) return;
        const caminho = e.composedPath ? e.composedPath() : [];
        if (caminho.indexOf(movbox) >= 0 || caminho.indexOf(ltEl) >= 0) return;
        fecharMov();
      },
      true
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && movbox) {
          e.stopPropagation();
          fecharMov();
        }
      },
      true
    );
    window.addEventListener("resize", posicionarMov);

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

      const bd = document.createElement("div");
      bd.className = "preview-bd";
      previewEl.appendChild(bd);

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
            // mesma guarda do ramo "sem bytes" abaixo: o que volta precisa ter
            // CONTEÚDO, senão o re-render repete o aviso e o clique parece
            // não ter feito nada
            if (baixado && (baixado.b64 || (baixado.kind === "text" && baixado.text))) {
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

      // Anexo em imagem. Vai por `data:` URI e não por `blob:` de propósito: a
      // CSP hostil de alguns tribunais barra `blob:` em embed (é o motivo do
      // fallback do PDF logo abaixo), e `img-src data:` passa onde `blob:` não
      // passa. A imagem já vem reduzida a 1568px pelo pje.js, então o custo de
      // memória do data URI é pequeno.
      // Peça binária SEM os bytes. Deixou de ser um caso defensivo e virou o
      // caso COMUM: com a memória de caso, uma peça retomada volta do disco só
      // com metadados e a referência do upload — os bytes ficam de fora de
      // propósito (são os autos inteiros). Cobre imagem e PDF de uma vez, e
      // precisa vir ANTES do ramo de imagem: `"…base64," + undefined` renderiza
      // uma imagem quebrada, sem nada que explique o que houve nem o botão que
      // resolve.
      const pesado = (info.size || 0) > PREVIEW_MAX_HOVER_B;
      if (!info.b64) {
        modoCompact();
        const box = document.createElement("div");
        box.className = "preview-miss";
        box.innerHTML =
          "<span>O conteúdo desta peça não está carregado nesta conversa.</span>" +
          '<button type="button" class="preview-dl">Abrir documento</button>';
        const btn = box.querySelector(".preview-dl");
        const soAvisoB = (t) => (box.innerHTML = "<span>" + escapeHtml(t) + "</span>");
        btn.addEventListener("click", async () => {
          if (!previewDlCb) return;
          btn.disabled = true;
          btn.textContent = "Abrindo…";
          previewDlPendente = true;
          try {
            const baixado = await previewDlCb(id);
            if (previewId !== id) return;
            // A peça precisa ter voltado COM os bytes: um retorno sem `b64`
            // (ou sem texto) cairia neste mesmo ramo no re-render e o clique
            // pareceria não ter feito nada — que era exatamente o sintoma
            // quando a peça vinha da memória de caso só com o `fileId`.
            const veioInteira =
              baixado && (baixado.b64 || (baixado.kind === "text" && baixado.text));
            if (veioInteira) {
              renderPreview(row, baixado);
              const anc = doclist.querySelector('.docrow[data-id="' + CSS.escape(id) + '"]');
              if (anc) posicionarPreview(anc);
            } else soAvisoB("Não foi possível abrir a peça.");
          } catch (err) {
            if (previewId === id)
              soAvisoB("Falha ao abrir: " + String((err && err.message) || err));
          } finally {
            previewDlPendente = false;
          }
        });
        bd.appendChild(box);
        return;
      }

      // Anexo em imagem. Vai por `data:` URI e não por `blob:` de propósito: a
      // CSP hostil de alguns tribunais barra `blob:` em embed (é o motivo do
      // fallback do PDF logo abaixo), e `img-src data:` passa onde `blob:` não
      // passa. A imagem já vem reduzida a 1568px pelo pje.js, então o custo de
      // memória do data URI é pequeno.
      if (info.kind === "img") {
        const im = document.createElement("img");
        im.className = "preview-img";
        im.alt = "Imagem da peça";
        im.src = "data:" + (info.mime || "image/jpeg") + ";base64," + info.b64;
        bd.appendChild(im);
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
      // O conjunto visível mudou, e é sobre ele que os atalhos agem: sem isto
      // "principais"/"todas" ficavam com o estado da lista anterior ao filtro.
      syncAtalhos();
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
      const all = allDocs.filter((d) => !q || textoBusca(d).includes(q));
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
            '<span class="pchip-i" aria-hidden="true">' + SVG.prompts + '</span>' +
            '<span class="scol"><span class="t" title="' + escapeHtml(it.p.titulo) + '">' +
            escapeHtml(it.p.titulo) +
            '</span><span class="mrow-sub">' + escapeHtml(previaDe(it.p.texto)) +
            "</span></span>";
        } else {
          row.className = "mrow mrow-acao" + (i === slash.idx ? " active" : "");
          row.textContent =
            it.tipo === "salvar"
              ? "Salvar o texto atual como prompt…"
              : promptsLib.length
                ? "Gerenciar prompts…"
                : "Criar seu primeiro prompt…";
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
        '<span class="pchip-i" aria-hidden="true">' + SVG.prompts + '</span>' +
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

    // ----- Atalhos de teclado (.hint-key): revelar sem mover a .inrow -----
    // A faixa de atalhos era revelada por `.inrow:focus-within + .hint-key` no
    // CSS, e o efeito colateral derrubava os botões da própria linha. Com a
    // conversa em andamento (sem `.novato`) ela está colapsada; o pointerdown
    // num botão da .inrow lhe dá foco, `:focus-within` casa, a faixa expande e
    // — como `.msgs` é flex:1 — o rodapé cresce e a .inrow SOBE 20px (medido no
    // Chrome, contra um 📎 de 32px de altura). O botão sai de baixo do cursor
    // no meio da transição de 180ms; o mouseup cai noutro elemento e o
    // navegador dispara o `click` no ancestral comum, não no botão. O seletor
    // de arquivos não abria, o usuário via o painel "se mexer" e só acertava
    // quando o foco já estava dentro da linha — o "clico três vezes e aí abre".
    //
    // A regra passa a ser: quem revela/esconde é o TEXTAREA. Foco em botão da
    // .inrow não move nada — nem ao ENTRAR (clicar no 📎 com o campo frio), nem
    // ao SAIR (clicar no 📎 no meio da digitação, que colapsaria a faixa e
    // moveria o botão para baixo — o mesmo defeito ao contrário).
    if (inEl && inrowEl && ft) {
      // Sincroniza o estado inicial: `open()` foca o campo, e se isso acontecer
      // antes deste registro o evento `focus` já passou — clicar num campo que
      // JÁ está focado não dispara outro, e a faixa ficaria presa colapsada.
      if (inEl.matches(":focus")) ft.classList.add("hint-on");
      inEl.addEventListener("focus", () => ft.classList.add("hint-on"));
      inrowEl.addEventListener("focusout", (e) => {
        // Foco que continua dentro da linha (um botão dela) preserva o estado.
        if (e.relatedTarget && inrowEl.contains(e.relatedTarget)) return;
        ft.classList.remove("hint-on");
      });
    }

    // ----- Anexos do input (📎): botão, campo de arquivo e chips -----
    // A UI é reflexo: o content script é dono da lista (Map `anexos`) e a manda
    // pronta em `setAnexos`. Aqui só disparamos a escolha, entregamos os File ao
    // content script e desenhamos os chips.
    const anexosbar = $(".anexosbar");
    const attachBtn = $(".attach");
    const attachInput = $(".attach-input");
    let anexarCb = null;
    let removerAnexoCb = null;
    let anexosAtuais = [];
    if (attachBtn && attachInput) {
      // O 📎 não rouba o foco do campo (mesma técnica dos popups @ e /): quem
      // anexa está no meio de uma mensagem e volta a digitar em seguida — e um
      // botão que não recebe foco também não pode disparar mudança de layout
      // sob o próprio cursor. O `click` segue normal, inclusive por teclado.
      attachBtn.addEventListener("mousedown", (e) => e.preventDefault());
      attachBtn.addEventListener("click", () => attachInput.click());
      attachInput.addEventListener("change", () => {
        const files = [...(attachInput.files || [])];
        // Zera SEMPRE: senão escolher o mesmo arquivo de novo não dispara change,
        // e um arquivo que falhou nunca poderia ser re-tentado.
        attachInput.value = "";
        if (files.length && anexarCb) anexarCb(files);
      });
    }
    // Desenha os chips dos anexos. `enviado` (já no contexto) muda só o título.
    function renderAnexos(lista) {
      anexosAtuais = Array.isArray(lista) ? lista : [];
      if (!anexosbar) return;
      anexosbar.innerHTML = "";
      anexosbar.hidden = !anexosAtuais.length;
      inrowEl.classList.toggle("com-anexo", !!anexosAtuais.length);
      if (!anexosAtuais.length) return;
      for (const a of anexosAtuais) {
        const chip = document.createElement("span");
        chip.className = "achip" + (a.enviado ? " enviado" : "");
        const nome = a.nome || a.id;
        chip.innerHTML =
          '<span class="achip-i" aria-hidden="true">' + SVG.clip + "</span>" +
          '<span class="achip-t" title="' + escapeHtml(nome) + (a.sub ? " — " + escapeHtml(a.sub) : "") +
          (a.enviado ? " (no contexto)" : "") + '">' +
          '<b>' + escapeHtml(tituloCurto(nome)) + "</b>" +
          (a.sub ? '<span class="achip-s">' + escapeHtml(a.sub) + "</span>" : "") +
          "</span>" +
          '<button class="chip-x achip-x" title="Remover o anexo do contexto" aria-label="Remover ' +
          escapeHtml(tituloCurto(nome)) + ' do contexto">' + SVG.x + "</button>";
        chip.querySelector(".achip-x").addEventListener("click", () => {
          if (removerAnexoCb) removerAnexoCb(a.id);
        });
        anexosbar.appendChild(chip);
      }
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
          '<div class="plib-empty">Nenhum prompt salvo ainda.<br>Clique em <b>Novo</b> para criar o primeiro — depois é só digitar <b>/</b> no campo de mensagem para usá-lo.</div>';
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
    const btnMlibNew = $(".mlib-new");
    const btnMlibImp = $(".mlib-imp-btn");
    const mlibImp = $(".mlib-imp");
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
    const minutaModeloVazio = $(".mm-vazio");
    const minutaModeloAdd = $(".mm-add");

    let modelosLib = []; // espelho ordenado de MLIB.listar
    let mlibEditId = null;
    let mlibIdNovo = "";
    let mlibDelArm = null;
    let mlibAposForm = null; // callback ao sair do formulário (importação em lote)

    // --- estado e nós da IMPORTAÇÃO EM LOTE (o bloco de código está lá embaixo) ---
    // Declarados AQUI, e não junto do bloco que os usa, pela regra da zona morta
    // temporal do CLAUDE.md: `fecharMlib()` e `setModelosHabilitado()` chamam
    // `impDesligar()`, que lê tudo isto. Um `let` declarado depois lançaria
    // "Cannot access before initialization" dentro de um callback — o erro que
    // aborta o resto do arquivo em silêncio.
    const impDrop = $(".imp-drop");
    const impFile = $(".imp-file");
    const impProg = $(".imp-prog");
    const impProgT = $(".imp-prog-t");
    const impBarraI = $(".imp-bar i");
    const impFichasEl = $(".imp-fichas");
    const impActs = $(".imp-acts:not(.imp-acts-fim)");
    const impActsFim = $(".imp-acts-fim");
    const impOk = $(".imp-ok");
    const impCancel = $(".imp-cancel");
    const impResEl = $(".imp-res");
    let impFichas = [];
    let impFalhas = []; // {nome, erro} — arquivos que não puderam ser lidos
    let impSinal = null;
    let impLendo = false;
    let impDescarteArm = false;
    let impProfundidade = 0; // dragenter/dragleave: contador (ver a guarda)
    let impGuardaLigada = false;
    // A biblioteca de modelos só faz sentido em modelos de 1M tokens (a minuta
    // manda os autos inteiros + vários modelos): setModelosHabilitado, chamado
    // pelo content.js quando as caps chegam, desliga a feature nos menores
    // (Haiku). Começa true para não sumir no harness de teste (sem caps).
    let modelosHabilitado = true;

    // MLIB é content script carregado antes deste; o harness de teste pode não
    // incluí-lo — sem ele a feature some em silêncio, nada quebra. O mesmo vale
    // para o DocxImport (importação de .docx): sem ele o botão Importar some e
    // o resto do modal funciona igual. Declarados AQUI, no topo do bloco, e não
    // junto do código que os usa: mlibTela() os lê e é chamada por callbacks —
    // um `const` declarado depois lançaria pela zona morta temporal.
    const temMlib = typeof MLIB !== "undefined";
    const temDocx = typeof DocxImport !== "undefined";
    // Fonte ÚNICA de "dá para importar": o botão do cabeçalho, o atalho do
    // estado vazio e o registro do handler precisam concordar. Enquanto cada
    // um repetia a própria condição, um deles podia oferecer um caminho que
    // outro não atende — e o modo de falha é um botão que não faz nada.
    const podeImportar = temDocx && !!impDrop;
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
      // A escolha MANUAL vence a detecção; a auto-seleção, não. Enquanto os
      // dois casos eram o mesmo `anterior`, o valor auto-selecionado numa
      // minuta grudava e nunca era limpo: quem gerava uma sentença e depois
      // pedia um despacho recebia, calado, os modelos de sentença.
      if (catModeloTocada && anterior && comModelo.has(anterior))
        minutaModeloSel.value = anterior;
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
    // Cálculo PURO da seleção: devolve o que vai e o total da categoria, sem
    // logar nada. Separado de `modelosMinutaSelecionados` porque a nota da UI
    // (atualizarNotaModelos) precisa do mesmo número a cada repintura, e chamar
    // a função que loga encheria o console de linhas idênticas.
    function selecaoDeModelos(cat) {
      const doGrupo = modelosLib
        .filter((m) => (m.categoria || "outro") === cat && m.texto)
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      const out = [];
      let chars = 0;
      for (const m of doGrupo) {
        if (out.length >= MODELOS_MAX_ENVIO) break;
        const tam = String(m.texto).length;
        // `continue` e não `break`: com `break`, o primeiro modelo que não
        // coubesse encerrava a fila, e um modelo recente e gigante bloqueava
        // todos os mais antigos que ainda cabiam — sem nada dizer por quê.
        //
        // A guarda `out.length &&` que existia aqui era uma SEGUNDA regra
        // escondida na mesma linha ("o primeiro entra mesmo acima do teto").
        // Inofensiva com `break`; com `continue` ela virava o próprio bug —
        // a lista vem ordenada por recência, então um modelo gigante recente
        // entrava primeiro, consumia os 180k sozinho e fazia todos os outros
        // não caberem. As duas intenções são legítimas e foram separadas: aqui
        // se pula quem não cabe, e o piso vem logo abaixo.
        if (chars + tam > MODELOS_TETO_CHARS) continue;
        out.push(m);
        chars += tam;
      }
      // Piso: se NENHUM coube (todos maiores que o teto), vai o mais recente
      // assim mesmo — escolher uma categoria precisa fazer alguma coisa, e um
      // envio silenciosamente sem modelo nenhum seria a feature não acontecer.
      if (!out.length && doGrupo.length) out.push(doGrupo[0]);
      return { out, total: doGrupo.length };
    }

    // "Conjunto vazio se EXPLICA, não desaparece" — a mesma regra da .sel-nota
    // dos degraus e da própria .minutabar. Três coisas aconteciam em SILÊNCIO e
    // davam, para quem gerava, o mesmo sintoma ("não seguiu os meus modelos"):
    // nenhuma categoria escolhida, modelos cortados pelo teto de contexto, e a
    // categoria dos modelos divergindo da espécie do ato.
    //
    // Aviso SUAVE (--warn-*), nunca a .alertbar: em nenhum dos casos algo está
    // quebrado — a minuta sai, só que sem o que o usuário talvez esperasse.
    function atualizarNotaModelos() {
      const nota = $(".mm-nota");
      if (!nota) return;
      const dizer = (t) => {
        nota.textContent = t || "";
        nota.hidden = !t;
      };
      if (!minutaMode || !minutaModeloWrap || minutaModeloWrap.hidden) return dizer("");
      // Biblioteca vazia: a .mm-vazio ao lado já explica e já oferece a saída.
      if (!modelosLib.length || !minutaModeloSel || minutaModeloSel.hidden) return dizer("");
      const cat = minutaModeloSel.value;
      if (!cat) {
        return dizer(
          "Nenhuma categoria escolhida: a minuta sai no estilo padrão, sem seguir as suas peças-modelo."
        );
      }
      const { out, total } = selecaoDeModelos(cat);
      const partes = [];
      if (total > out.length) {
        partes.push(
          out.length + " de " + total + " peças-modelo desta categoria cabem no contexto; " +
            "as demais ficam de fora (as mais recentes entram primeiro)."
        );
      }
      // A espécie do ato e a categoria dos modelos são <select> INDEPENDENTES:
      // dá para pedir "Sentença" e mandar modelos de "Despachos". Pode ser
      // deliberado — por isso não bloqueia —, mas calado vira defeito.
      const ato = minutaAtoSel && minutaAtoSel.value;
      if (ato && cat !== ato && MLIB.CATEGORIAS.some((c) => c.valor === ato)) {
        const esp = ESPECIES_ATO.find((e) => e.valor === ato);
        partes.push(
          "O ato é " + ((esp && esp.rotulo) || ato) + " e os modelos são de " +
            MLIB.rotuloCategoria(cat) + "."
        );
      }
      dizer(partes.join(" "));
    }

    function modelosMinutaSelecionados() {
      if (!minutaModeloSel || !minutaModeloWrap || minutaModeloWrap.hidden) return [];
      // A linha aparece também no estado VAZIO (só o convite para cadastrar):
      // ali o <select> está oculto e não há o que enviar. Sem esta guarda a
      // função dependeria de o select estar sem opções para devolver [].
      if (minutaModeloSel.hidden) return [];
      const cat = minutaModeloSel.value;
      if (!cat) return [];
      const { out, total } = selecaoDeModelos(cat);
      // "sem cap silencioso": o corte agora vai à UI (atualizarNotaModelos), e o
      // console fica como registro de diagnóstico para quem abre o F12.
      if (total > out.length) {
        try {
          console.info(
            "[PJe IA] minuta: " + out.length + " de " + total +
              " modelos da categoria couberam no teto de contexto (" +
              MODELOS_TETO_CHARS + " chars); os demais ficaram de fora."
          );
        } catch (e) {}
      }
      return out;
    }

    // Mostra/esconde e popula o seletor conforme o modo minuta, a existência de
    // modelos e o modelo ativo (só 1M). Chamada por setMinutaMode, pelo aoMudar
    // do MLIB e por setModelosHabilitado.
    // Biblioteca VAZIA não esconde a linha: mostra o convite. Sumir era o
    // defeito — quem nunca cadastrou um modelo ligava o modo minuta e não via
    // vestígio nenhum de que a feature existe, concluindo (com razão) que ela
    // não estava lá. É a mesma regra da `.sel-nota` nos degraus de seleção:
    // conjunto vazio se explica, não desaparece. O gate de janela (1M) e a
    // ausência do MLIB continuam escondendo tudo — ali o botão da barra de
    // ferramentas, desabilitado com tooltip, já é a explicação.
    function atualizarSeletorMinuta(on) {
      if (!minutaModeloWrap) return;
      if (!on || !temMlib || !modelosHabilitado) {
        minutaModeloWrap.hidden = true;
        atualizarNotaModelos();
        return;
      }
      const vazio = !modelosLib.length;
      if (minutaModeloVazio) minutaModeloVazio.hidden = !vazio;
      if (minutaModeloAdd) minutaModeloAdd.hidden = !vazio;
      minutaModeloSel.hidden = vazio;
      if (!vazio) popularSeletorModelos(detectarCategoria(inEl.value));
      minutaModeloWrap.hidden = false;
      atualizarNotaModelos();
    }
    // Atalho do estado vazio: abre o gerenciador já no formulário — o caminho
    // até aqui (barra de ferramentas → Modelos → Novo) é justamente o que
    // ninguém percorre sem saber que existe.
    // Escolha manual da categoria: a partir daqui a detecção pela instrução
    // para de sobrescrevê-la (ver `catModeloTocada` no bloco do modo minuta).
    if (minutaModeloSel) {
      minutaModeloSel.addEventListener("change", () => {
        catModeloTocada = true;
        atualizarNotaModelos();
      });
    }
    if (minutaModeloAdd) {
      minutaModeloAdd.addEventListener("click", (e) => {
        e.preventDefault();
        if (!temMlib || !modelosHabilitado) return;
        abrirMlib({ form: true });
      });
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
    // O card tem TRÊS telas mutuamente exclusivas — lista, formulário e
    // importação em lote. Um ponto único liga uma e desliga as outras duas;
    // com os `hidden` alternados na mão, fechar o modal com a importação
    // aberta deixava duas telas visíveis na abertura seguinte.
    function mlibTela(qual) {
      mlibListEl.hidden = qual !== "lista";
      mlibForm.hidden = qual !== "form";
      if (mlibImp) mlibImp.hidden = qual !== "importar";
      // "Novo" e "Importar" só fazem sentido a partir da lista: clicá-los com
      // um lote em conferência descartaria o trabalho sem aviso nenhum
      const naLista = qual === "lista";
      if (btnMlibNew) btnMlibNew.hidden = !naLista;
      if (btnMlibImp) btnMlibImp.hidden = !naLista || !podeImportar;
    }

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
      impDesligar();
      fecharMlibForm();
      inEl.focus();
    }

    function abrirMlibForm(m, opts) {
      const o = opts || {};
      // o.novo: `m` é um RASCUNHO ainda não gravado (vem da importação em
      // lote, quando a peça passou do teto e vai ser encurtada aqui)
      const rascunho = !!(m && o.novo);
      mlibEditId = m && !rascunho ? m.id : null;
      mlibIdNovo = rascunho ? m.id : m ? null : temMlib ? MLIB.novoId() : "";
      mlibFT.value = m ? m.titulo : "";
      mlibFC.value = m ? m.categoria || "outro" : "sentenca";
      mlibFD.value = m ? m.descricao || "" : "";
      mlibFX.value = m ? m.texto : "";
      mlibErr.textContent = "";
      mlibTela("form");
      atualizarMlibCnt();
      mlibFT.focus();
    }

    // `salvou` avisa o callback de saída (usado pela importação) se o rascunho
    // virou modelo. Nunca ligar direto num addEventListener: o MouseEvent
    // chegaria como `salvou` e seria truthy.
    function fecharMlibForm(salvou) {
      mlibEditId = null;
      mlibErr.textContent = "";
      const volta = mlibAposForm;
      mlibAposForm = null;
      if (volta) volta(!!salvou);
      else mlibTela("lista");
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
        // O texto NOMEIA os dois caminhos e a fileira os OFERECE. Os botões do
        // cabeçalho ficam na periferia de quem abre a biblioteca pela primeira
        // vez, e "Importar" só significa alguma coisa depois que o usuário sabe
        // que dá para soltar vários .docx de uma vez — por isso o rótulo aqui
        // diz o FORMATO, e não o verbo sozinho. Mesma razão do .mm-add na barra
        // da minuta: conjunto vazio se explica e oferece a saída, não desaparece.
        mlibListEl.innerHTML =
          '<div class="plib-empty">Nenhum modelo cadastrado ainda.<br>' +
          (podeImportar
            ? "Traga vários arquivos <b>.docx</b> ou <b>.rtf</b> de uma vez — você confere tudo antes de cadastrar."
            : "Cole o texto de uma peça sua para cadastrar a primeira.") +
          " Depois, ao gerar uma minuta, escolha a categoria em <b>Seguir modelos</b>." +
          '<div class="mempty-acts">' +
          (podeImportar
            ? '<button class="mempty-imp plib-save" title="Importar peças-modelo de arquivos .docx ou .rtf — pode escolher vários de uma vez, e você confere tudo antes de cadastrar">' +
              SVG.importar +
              "Importar .docx ou .rtf</button>"
            : "") +
          '<button class="mempty-new plib-new">' + SVG.novo + "Colar o texto</button>" +
          "</div></div>";
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
      if (!btn) return;
      // Atalhos do estado vazio (fora de .plib-row, por isso vêm antes da guarda
      // de linha). `abrirImportar` é declaração de função — o hoisting no escopo
      // do mount cobre a chamada, que só acontece no clique.
      if (btn.classList.contains("mempty-imp")) return abrirImportar();
      if (btn.classList.contains("mempty-new")) return abrirMlibForm(null);
      const row = e.target.closest(".plib-row");
      if (!row) return;
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
        fecharMlibForm(true);
        renderMlibList();
      });
    }
    // ----- Importar peças-modelo de .docx, em LOTE -----
    // Cadastrar dez modelos não pode custar dez formulários. O usuário solta os
    // arquivos de uma vez, cada um vira uma FICHA já preenchida (título do nome
    // do arquivo, espécie adivinhada do conteúdo, prévia do texto lido) e um
    // clique cadastra todas. A conferência existe porque errar a CATEGORIA é o
    // erro caro: a minuta procura modelos POR categoria, então um modelo mal
    // classificado fica invisível — e o usuário não descobre por quê.
    const nFmt = (n) => Number(n || 0).toLocaleString("pt-BR");

    // --- guarda do arrasto ---
    // Por padrão o Chrome NAVEGA para o file:// de um arquivo solto em qualquer
    // ponto do documento — na página de autos isso mata a sessão JSF do PJe e o
    // trabalho do usuário junto. Os DOIS eventos precisam de preventDefault: é
    // o `dragover` que declara a área como alvo válido e cancela a navegação;
    // prevenir só o `drop` não basta (modo de falha silencioso clássico).
    //
    // Vão no WINDOW, em captura: eventos de arrasto são `composed`, atravessam
    // a fronteira do Shadow DOM e chegam ao window já retargetados — um par de
    // listeners cobre o shadow tree E a página do tribunal atrás dele.
    //
    // A guarda NUNCA chama stopPropagation: ela só cancela o default. Quem
    // consome o evento é o handler da própria zona.
    //
    // Custo aceito: com o importador aberto, um arquivo solto sobre a página do
    // PJe (visível ao lado, no modo lateral) é engolido. É deliberado — a
    // alternativa é a navegação que destrói a sessão —, dura os segundos do
    // modal, e o modal está visivelmente aberto na tela.
    function impGuardaOver(e) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    }
    function impGuardaDrop(e) {
      e.preventDefault();
    }
    function impLigarGuarda() {
      if (impGuardaLigada) return; // idempotente: abrir duas vezes não empilha
      window.addEventListener("dragover", impGuardaOver, true);
      window.addEventListener("drop", impGuardaDrop, true);
      impGuardaLigada = true;
    }
    // Chamada por TODOS os caminhos de saída do modal (fechar, ✕, backdrop,
    // Esc e o gate de 1M, que fecha o modal por fora).
    function impDesligar() {
      if (impGuardaLigada) {
        window.removeEventListener("dragover", impGuardaOver, true);
        window.removeEventListener("drop", impGuardaDrop, true);
        impGuardaLigada = false;
      }
      impProfundidade = 0;
      if (impDrop) impDrop.classList.remove("arrastando");
      impSinal = null;
      impLendo = false;
      impFichas = [];
      impFalhas = [];
    }

    // Fechar o modal com um lote em conferência jogaria fora o trabalho de
    // conferir dez fichas — arma primeiro, como toda ação destrutiva aqui.
    function sairDoMlib() {
      if (mlibImp && !mlibImp.hidden && (impFichas.length || impFalhas.length)) {
        impPedirDescarte(fecharMlib);
        return;
      }
      fecharMlib();
    }

    function impEstado(qual) {
      const conferindo = qual === "conferindo";
      const vazio = qual === "vazio";
      impDrop.hidden = !vazio && !conferindo;
      impDrop.classList.toggle("compacta", conferindo);
      impDrop.querySelector(".imp-drop-t").innerHTML = conferindo
        ? "Arraste ou clique para <b>adicionar mais</b>"
        : "Arraste seus arquivos <b>.docx</b> ou <b>.rtf</b> até aqui";
      impProg.hidden = qual !== "lendo";
      impFichasEl.hidden = qual === "resultado";
      // O rodapé aparece também no VAZIO, com só o "Voltar": sem ele, quem abriu
      // a importação sem querer não tinha como retornar à lista — o ✕ fecha o
      // modal inteiro, que é outra coisa.
      impActs.hidden = !conferindo && !vazio;
      impOk.hidden = !conferindo;
      if (vazio) rotulo(impCancel, "Voltar");
      impResEl.hidden = qual !== "resultado";
      impActsFim.hidden = qual !== "resultado";
    }

    // O botão do rodapé volta para a LISTA; o ✕ e o Esc fecham o modal. Cada um
    // faz o que promete, e os dois protegem um lote em conferência.
    // impDesligar() é obrigatório aqui: sair da tela de importação sem tirar os
    // listeners deixaria a guarda engolindo arquivos soltos na página do PJe
    // enquanto o modal já está na lista.
    function impVoltarLista() {
      impDesligar();
      impResetCancelar();
      mlibTela("lista");
      renderMlibList();
    }

    function abrirImportar() {
      if (!podeImportar || !temMlib) return; // a função termina em impDrop.focus()
      impFichas = [];
      impFalhas = [];
      impFichasEl.textContent = "";
      impResEl.textContent = "";
      impResetCancelar();
      impEstado("vazio");
      mlibTela("importar");
      impLigarGuarda();
      impDrop.focus();
    }

    // `aoConfirmar` é o que acontece depois do 2º clique: voltar à lista (botão
    // do rodapé) ou fechar o modal (✕, backdrop, Esc).
    function impPedirDescarte(aoConfirmar) {
      const feito = aoConfirmar || impVoltarLista;
      if (!impFichas.length && !impFalhas.length) return feito();
      if (impDescarteArm) return feito();
      impDescarteArm = true;
      rotulo(
        impCancel,
        "Descartar " + impFichas.length + (impFichas.length === 1 ? " ficha?" : " fichas?")
      );
      impCancel.classList.add("arm");
    }
    function impResetCancelar() {
      impDescarteArm = false;
      rotulo(impCancel, "Cancelar");
      impCancel.classList.remove("arm");
    }

    async function impLer(arquivos) {
      const lista = Array.from(arquivos || []).filter(Boolean);
      if (!lista.length || impLendo) return;
      impLendo = true;
      impResetCancelar();
      impSinal = { cancelado: false };
      impEstado("lendo");
      impProgT.textContent = "lendo 1 de " + lista.length + "…";
      impBarraI.style.width = "0%";

      const res = await DocxImport.lerLote(lista, {
        sinal: impSinal,
        onItem: (r, i, n) => {
          impProgT.textContent = i < n ? "lendo " + (i + 1) + " de " + n + "…" : "lido.";
          impBarraI.style.width = Math.round((i / n) * 100) + "%";
        },
      });

      const interrompido = impSinal && impSinal.cancelado && res.length < lista.length;
      impLendo = false;
      impSinal = null;

      for (const r of res) {
        if (r.ok) impFichas.push(MLIB.fichaImportada(r));
        else impFalhas.push({ nome: r.nome, erro: r.erro });
      }
      // cancelar NÃO descarta o que já foi lido — o estado nunca fica pior
      if (interrompido) {
        impFalhas.push({
          nome: "leitura interrompida",
          erro:
            res.length + " de " + lista.length +
            " arquivos foram lidos. Arraste os demais de novo se quiser.",
        });
      }
      MLIB.marcarDuplicados(impFichas, modelosLib);
      impRender();
      impEstado(impFichas.length || impFalhas.length ? "conferindo" : "vazio");
    }

    // Construído com createElement e .value/.textContent, NUNCA innerHTML: o
    // título e o texto vêm de um arquivo externo, e o escapeHtml daqui não
    // escapa aspa simples (o que já basta para quebrar um atributo).
    function impFichaEl(f, i) {
      const box = document.createElement("div");
      box.className = "imp-ficha" + (f.incluir ? "" : " fora");
      box.dataset.i = String(i);

      const lab = document.createElement("label");
      lab.className = "imp-inc";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "imp-chk";
      chk.checked = !!f.incluir;
      chk.setAttribute("aria-label", "Cadastrar este modelo");
      const arq = document.createElement("span");
      arq.className = "imp-arq";
      arq.textContent = f.arquivo;
      arq.title = f.arquivo;
      lab.appendChild(chk);
      lab.appendChild(arq);
      box.appendChild(lab);

      const campos = document.createElement("div");
      campos.className = "imp-campos";
      const tit = document.createElement("input");
      tit.type = "text";
      tit.className = "imp-tit";
      tit.maxLength = 80;
      tit.value = f.modelo.titulo;
      tit.setAttribute("aria-label", "Título do modelo");
      campos.appendChild(tit);

      const catwrap = document.createElement("div");
      catwrap.className = "imp-catwrap";
      const sel = document.createElement("select");
      sel.className = "imp-cat";
      sel.setAttribute("aria-label", "Categoria do modelo");
      for (const c of MLIB.CATEGORIAS) {
        const op = document.createElement("option");
        op.value = c.valor;
        op.textContent = c.rotulo;
        sel.appendChild(op);
      }
      sel.value = f.modelo.categoria;
      catwrap.appendChild(sel);
      const sug = document.createElement("span");
      sug.className = "imp-sug";
      catwrap.appendChild(sug);
      campos.appendChild(catwrap);
      box.appendChild(campos);

      const meta = document.createElement("div");
      meta.className = "imp-meta";
      const chars = document.createElement("span");
      chars.className = "imp-chars";
      meta.appendChild(chars);
      const prevB = document.createElement("button");
      prevB.className = "imp-prev-b";
      prevB.textContent = "ver as primeiras linhas";
      prevB.setAttribute("aria-expanded", "false");
      meta.appendChild(prevB);
      box.appendChild(meta);

      const prev = document.createElement("pre");
      prev.className = "imp-prev";
      prev.hidden = true;
      prev.textContent = impPrimeirasLinhas(f.modelo.texto);
      box.appendChild(prev);

      const nota = document.createElement("div");
      nota.className = "imp-nota";
      nota.hidden = true;
      box.appendChild(nota);

      impPintarFicha(box, f);
      return box;
    }

    function impPrimeirasLinhas(texto) {
      const ls = String(texto || "").split("\n").filter((l) => l.trim());
      const corte = ls.slice(0, 6).join("\n");
      return ls.length > 6 ? corte + "\n…" : corte;
    }

    // Atualiza só o que MUDA. Re-renderizar a ficha inteira a cada tecla
    // digitada no título arrancaria o foco do campo.
    function impPintarFicha(box, f) {
      box.classList.toggle("fora", !f.incluir);
      const sug = box.querySelector(".imp-sug");
      const nada = f.sugerida.confianca === "nenhuma";
      sug.hidden = f.catTocada;
      sug.textContent = nada ? "confira" : "sugerida";
      sug.classList.toggle("fraca", nada);
      sug.title = nada
        ? "Não foi possível reconhecer a espécie — escolha a categoria."
        : "Categoria sugerida " +
          (f.sugerida.sinal === "nome"
            ? "pelo nome do arquivo"
            : f.sugerida.sinal === "cabecalho"
              ? "pelo cabeçalho do documento"
              : "pelo dispositivo da peça") +
          ".";

      const pct = Math.round((f.bytes / MLIB.TETO_BYTES) * 100);
      const chars = box.querySelector(".imp-chars");
      chars.textContent = nFmt(f.modelo.texto.length) + " caracteres · " + pct + "%";
      chars.classList.toggle("estouro", f.acimaDoTeto);

      const nota = box.querySelector(".imp-nota");
      const avisos = [];
      if (f.acimaDoTeto) {
        avisos.push(
          "Passa do limite de " + nFmt(MLIB.TETO_BYTES) +
            " caracteres por modelo, então não entra no lote. Depois de cadastrar os outros você poderá abri-lo para encurtar."
        );
      }
      if (f.duplicado) avisos.push("Já existe um modelo com este título.");
      nota.textContent = avisos.join(" ");
      nota.hidden = !avisos.length;
    }

    function impFalhaEl(fa) {
      const box = document.createElement("div");
      box.className = "imp-ficha erro";
      const arq = document.createElement("span");
      arq.className = "imp-arq";
      arq.textContent = fa.nome;
      arq.title = fa.nome;
      box.appendChild(arq);
      const err = document.createElement("div");
      err.className = "imp-erro";
      err.textContent = fa.erro;
      box.appendChild(err);
      return box;
    }

    function impRender() {
      impFichasEl.textContent = "";
      // As falhas vêm PRIMEIRO: são a informação excepcional, e é o que explica
      // por que o botão diz "Cadastrar 7" quando foram soltos 8 arquivos.
      for (const fa of impFalhas) impFichasEl.appendChild(impFalhaEl(fa));
      impFichas.forEach((f, i) => impFichasEl.appendChild(impFichaEl(f, i)));
      impAtualizarAcao();
    }

    function impAtualizarAcao() {
      const n = impFichas.filter((f) => f.incluir).length;
      rotulo(impOk, n ? "Cadastrar " + n + (n === 1 ? " modelo" : " modelos") : "Cadastrar");
      impOk.disabled = !n;
    }

    // Duplicidade é relativa ao CONJUNTO: mudar um título pode resolver (ou
    // criar) o aviso de outra ficha, então as notas de todas são repintadas.
    function impRepintarTodas() {
      MLIB.marcarDuplicados(impFichas, modelosLib);
      impFichasEl.querySelectorAll(".imp-ficha:not(.erro)").forEach((box) => {
        const f = impFichas[Number(box.dataset.i)];
        if (f) impPintarFicha(box, f);
      });
      impAtualizarAcao();
    }

    function impCadastrar() {
      const escolhidas = impFichas.filter((f) => f.incluir);
      if (!escolhidas.length) return;
      const semTitulo = escolhidas.find((f) => !f.modelo.titulo.trim());
      if (semTitulo) {
        const box = impFichasEl.querySelector(
          '.imp-ficha[data-i="' + impFichas.indexOf(semTitulo) + '"]'
        );
        if (box) box.querySelector(".imp-tit").focus();
        return;
      }
      impOk.disabled = true;
      MLIB.salvarLote(
        escolhidas.map((f) => f.modelo),
        (r) => impMostrarResultado(r, escolhidas)
      );
    }

    // "Sem cap silencioso": o resultado diz quantos entraram E nomeia, um a um,
    // tudo o que ficou de fora, com o motivo.
    function impMostrarResultado(r, escolhidas) {
      const comErro = new Set((r.erros || []).map((e) => e.id));
      const gravadas = escolhidas.filter((f) => !comErro.has(f.modelo.id));
      // otimista, como no salvar avulso; o aoMudar re-lista logo em seguida
      modelosLib = modelosLib
        .filter((x) => !gravadas.some((f) => f.modelo.id === x.id))
        .concat(gravadas.map((f) => f.modelo))
        .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));

      impResEl.textContent = "";
      const ok = document.createElement("div");
      ok.className = "imp-res-ok";
      ok.innerHTML = SVG.check;
      const okT = document.createElement("span");
      okT.textContent = r.ok
        ? r.ok + (r.ok === 1 ? " modelo cadastrado" : " modelos cadastrados")
        : "Nenhum modelo foi cadastrado";
      ok.appendChild(okT);
      impResEl.appendChild(ok);

      const fora = [];
      for (const e of r.erros || []) fora.push({ rotulo: e.titulo, motivo: e.erro, ficha: null });
      for (const f of impFichas) {
        if (gravadas.indexOf(f) >= 0 || comErro.has(f.modelo.id)) continue;
        if (f.acimaDoTeto) {
          fora.push({
            rotulo: f.modelo.titulo,
            motivo: "passa do limite de " + nFmt(MLIB.TETO_BYTES) + " caracteres",
            ficha: f,
          });
        } else {
          fora.push({ rotulo: f.modelo.titulo, motivo: "desmarcado por você", ficha: null });
        }
      }
      for (const fa of impFalhas) fora.push({ rotulo: fa.nome, motivo: fa.erro, ficha: null });

      if (fora.length) {
        const bloco = document.createElement("div");
        bloco.className = "imp-res-fora";
        const h = document.createElement("div");
        h.className = "imp-res-h";
        h.textContent = "não entraram (" + fora.length + ")";
        bloco.appendChild(h);
        for (const item of fora) {
          const l = document.createElement("div");
          l.className = "imp-res-l";
          const t = document.createElement("span");
          const b = document.createElement("b");
          b.textContent = item.rotulo;
          t.appendChild(b);
          t.appendChild(document.createTextNode(" — " + item.motivo));
          l.appendChild(t);
          if (item.ficha) {
            const btn = document.createElement("button");
            btn.className = "imp-res-b";
            btn.textContent = "encurtar";
            btn.addEventListener("click", () => impEncurtar(item.ficha, l));
            l.appendChild(btn);
          }
          bloco.appendChild(l);
        }
        impResEl.appendChild(bloco);
      }

      impFichas = impFichas.filter((f) => gravadas.indexOf(f) < 0);
      renderMlibList();
      impEstado("resultado");
    }

    // O texto lido não pode se perder: leva o rascunho ao formulário normal,
    // onde o contador mostra ao vivo quanto falta cortar. Ao voltar, a linha
    // some do resultado se o modelo foi salvo.
    function impEncurtar(f, linha) {
      mlibAposForm = (salvou) => {
        if (salvou && linha && linha.parentNode) linha.remove();
        if (salvou) impFichas = impFichas.filter((x) => x !== f);
        mlibTela("importar");
        impEstado("resultado");
      };
      abrirMlibForm(f.modelo, { novo: true });
    }

    if (temMlib && podeImportar) {
      btnMlibImp.addEventListener("click", abrirImportar);

      const escolher = () => {
        impFile.value = ""; // permite reimportar os MESMOS arquivos
        impFile.click();
      };
      impDrop.addEventListener("click", escolher);
      impDrop.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          escolher();
        }
      });
      impFile.addEventListener("change", () => impLer(impFile.files));

      // `dragleave` dispara ao cruzar CADA filho da zona, e dentro do Shadow
      // DOM o `relatedTarget` vem retargetado para o host — contar entradas e
      // saídas é o único jeito confiável de saber quando o ponteiro saiu.
      impDrop.addEventListener("dragenter", (e) => {
        e.preventDefault();
        impProfundidade++;
        impDrop.classList.add("arrastando");
      });
      impDrop.addEventListener("dragover", (e) => {
        // sobrepõe o dropEffect "none" da guarda global: AQUI pode soltar
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      });
      impDrop.addEventListener("dragleave", () => {
        impProfundidade = Math.max(0, impProfundidade - 1);
        if (!impProfundidade) impDrop.classList.remove("arrastando");
      });
      impDrop.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        impProfundidade = 0;
        impDrop.classList.remove("arrastando");
        if (e.dataTransfer && e.dataTransfer.files) impLer(e.dataTransfer.files);
      });

      // handlers DELEGADOS: as fichas são recriadas a cada render
      impFichasEl.addEventListener("change", (e) => {
        const box = e.target.closest(".imp-ficha");
        if (!box || !box.dataset.i) return;
        const f = impFichas[Number(box.dataset.i)];
        if (!f) return;
        if (e.target.classList.contains("imp-chk")) {
          f.incluir = e.target.checked;
          impPintarFicha(box, f);
          impAtualizarAcao();
        } else if (e.target.classList.contains("imp-cat")) {
          f.modelo.categoria = e.target.value;
          f.catTocada = true; // o selo "sugerida" deixaria de ser verdade
          MLIB.medirFicha(f);
          impPintarFicha(box, f);
        }
      });
      impFichasEl.addEventListener("input", (e) => {
        if (!e.target.classList.contains("imp-tit")) return;
        const box = e.target.closest(".imp-ficha");
        const f = impFichas[Number(box.dataset.i)];
        if (!f) return;
        f.modelo.titulo = e.target.value;
        MLIB.medirFicha(f);
        impRepintarTodas();
      });
      impFichasEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".imp-prev-b");
        if (!btn) return;
        const prev = btn.closest(".imp-ficha").querySelector(".imp-prev");
        prev.hidden = !prev.hidden;
        btn.setAttribute("aria-expanded", String(!prev.hidden));
        btn.textContent = prev.hidden ? "ver as primeiras linhas" : "esconder o texto";
      });

      impOk.addEventListener("click", impCadastrar);
      impCancel.addEventListener("click", () => impPedirDescarte());
      $(".imp-fechar").addEventListener("click", impVoltarLista);
      $(".imp-parar").addEventListener("click", () => {
        if (impSinal) impSinal.cancelado = true;
      });
    } else if (btnMlibImp) {
      btnMlibImp.hidden = true;
    }

    if (temMlib) {
      mlibCard.querySelector(".mlib-save").addEventListener("click", salvarMlibForm);
      mlibCard.querySelector(".mlib-cancel").addEventListener("click", () => fecharMlibForm());
      mlibCard.querySelector(".mlib-new").addEventListener("click", () => abrirMlibForm(null));
      mlibCard.querySelector(".mlib-close").addEventListener("click", sairDoMlib);
      mlibEl.addEventListener("click", (e) => {
        if (e.target === mlibEl) sairDoMlib();
      });
      // Esc no modal: fecha o form (se aberto) ou o modal — e NÃO vaza para o
      // Esc do painel (que cancelaria o modo minuta junto)
      mlibCard.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        if (!mlibForm.hidden) fecharMlibForm();
        else sairDoMlib();
      });
      // O botão da barra abre a BIBLIOTECA, e a lista — mesmo vazia — é a única
      // tela onde "Importar" e "Novo" existem (`mlibTela("form")` os esconde de
      // propósito, para um lote em conferência não ser descartado sem aviso).
      // Pular para o formulário com a biblioteca vazia parecia poupar um clique
      // e escondia a importação em lote de .docx/.rtf justamente de quem nunca
      // cadastrou nada — o público para quem ela foi feita. Duas decisões certas
      // sozinhas, erradas na interseção. O estado vazio da lista é a tela de
      // boas-vindas: nomeia os dois caminhos e oferece os dois botões.
      btnMlib.addEventListener("click", () => abrirMlib());
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
        const sel = selecaoEfetivaPainel();
        if (!sel.length) {
          statusEl.textContent = "Marque as peças que devem embasar a minuta.";
          return;
        }
        // Orientação obrigatória (Resolução CNJ 615): sem espécie, ou sem tese
        // quando ela é exigida, não há o que gerar. A nota da faixa já diz o
        // motivo e o botão está desabilitado — este é o cinto e suspensório
        // para o Enter, que não passa pelo `disabled`.
        const ato = atoDaMinuta();
        if (!ato) {
          atualizarLinhaTese();
          if (minutaTeseTxt && !minutaTeseWrap.hidden) minutaTeseTxt.focus();
          else if (minutaAtoSel) minutaAtoSel.focus();
          return;
        }
        // lê os modelos da categoria ANTES de desligar o modo (o seletor some)
        const modelos = modelosMinutaSelecionados();
        // O estado só é destruído DEPOIS que o content aceita. O handler recusa
        // de forma síncrona quando há turno em curso ou a sessão do PJe está
        // ocupada; limpar antes fazia o usuário perder a instrução digitada, a
        // categoria escolhida e — agora — a tese, com o modo desligado por
        // cima. Recusa devolve `false` (o handler não pode ser `async` no
        // topo: num `async`, `return false` viraria uma Promise e este teste
        // nunca casaria).
        if (minutaCb(t, sel, modelos, ato) === false) return;
        setMinutaMode(false);
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
        const sel = selecaoEfetivaPainel(); // idem minuta: cobre a row lazy
        if (!sel.length) {
          statusEl.textContent = "Marque as peças que devem embasar o mapa mental.";
          return;
        }
        // idem minuta: só limpa depois do aceite (o handler recusa por turno em
        // curso ou sessão do PJe ocupada)
        if (mapaCb(t, sel) === false) return;
        setMapaMode(false);
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

    // Texto do USUÁRIO com os rótulos reidentificados na tela — por nós de DOM,
    // nunca innerHTML (é texto do usuário).
    function preencherComReid(el, texto) {
      el.textContent = "";
      const t = String(texto || "");
      if (!reidentificador) {
        el.textContent = t;
        return;
      }
      let ult = 0;
      RE_ROTULO_ANON.lastIndex = 0;
      let m;
      while ((m = RE_ROTULO_ANON.exec(t)) !== null) {
        let v = null;
        try { v = reidentificador("[" + m[1] + "]"); } catch { v = null; }
        if (v == null || v === "") continue;
        el.appendChild(document.createTextNode(t.slice(ult, m.index)));
        const mk = document.createElement("mark");
        mk.className = "reid";
        mk.title = "[" + m[1] + "] — nome restaurado neste computador; a IA recebeu só o rótulo";
        mk.textContent = v;
        el.appendChild(mk);
        ult = m.index + m[0].length;
      }
      el.appendChild(document.createTextNode(t.slice(ult)));
    }

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

    // Estados de uma peça no card: wait → loading (baixando) → upload (subindo
    // para a API, só nos PDFs) → done. Ou → erro, quando o download falha.
    function setPrepState(id, state) {
      if (!prepEl) return;
      const row = prepEl.querySelector('.prep-row[data-id="' + CSS.escape(id) + '"]');
      if (!row) return;
      const ic = row.querySelector(".prep-ic");
      // O contador conta PEÇAS PRONTAS, não transições de estado. Sem esta
      // guarda, um "done" repetido — fácil de acontecer agora que a peça passa
      // por mais de uma fase — levaria o contador além de N/N e a barra além
      // de 100%. Vale também para a exportação, que usa os mesmos estados.
      //
      // A marca vive em `row.dataset.fim`, NÃO na className do ícone: a
      // primeira versão lia a classe, e a peça que passa por `done → anon →
      // done` (modo sigiloso: baixa, depois mascara) apagava a marca ao entrar
      // em `anon` e era contada DUAS vezes — o card chegou a mostrar 25/15.
      const jaTerminou = row.dataset.fim === "1";
      ic.className = "prep-ic " + state;
      ic.innerHTML = state === "done" ? SVG.check : "";
      // "erro" também ADIANTA o contador: a peça terminou de ser tentada. Sem
      // isso a barra de uma exportação com falhas nunca chegaria ao fim, e o
      // usuário ficaria olhando um progresso travado sem saber que acabou.
      if ((state === "done" || state === "erro") && !jaTerminou) {
        row.dataset.fim = "1";
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

    // Nomeada (em vez de devolvida direto) porque a retomada da memória de caso
    // precisa REUSAR os métodos públicos: `restaurarConversa` é replay de
    // addMessage/updateAssistant, e depender de `this` ali quebraria se alguém
    // desestruturasse a API — nenhum outro ponto deste arquivo usa `this`.
    const api = {
      open,
      // Visita guiada sob demanda (o convite do estado vazio já a dispara; isto
      // é para o content script poder oferecê-la de outro lugar). No-op sem o
      // tour.js carregado.
      iniciarTour: abrirTour,
      onSend(cb) {
        sendCb = cb;
      },
      onConfigure(cb) {
        configureCb = cb;
      },
      // O MESMO gesto do botão "Nova conversa" — usado pela bolha de bloqueio
      // do modo sigiloso, que oferece a conversa nova como saída que preserva
      // o nome. Passa pelo mesmo callback; não há segundo caminho de reset.
      novaConversa() {
        if (resetCb) resetCb();
      },
      onReset(cb) {
        resetCb = cb;
      },
      // Notifica quando o usuário marca/desmarca peças (ids selecionados).
      onSelectionChange(cb) {
        selChangeCb = cb;
      },
      // Anexos do input (📎). onAnexar recebe os File escolhidos; onRemoverAnexo
      // recebe o id do anexo a soltar; setAnexos redesenha os chips a partir da
      // lista que o content script mantém.
      onAnexar(cb) {
        anexarCb = cb;
      },
      onRemoverAnexo(cb) {
        removerAnexoCb = cb;
      },
      setAnexos(lista) {
        renderAnexos(lista);
      },
      // Clique no botão "ver na timeline" de uma peça (recebe o id).
      onVerNaTimeline(cb) {
        verTimelineCb = cb;
      },
      // Botão "Carregar todas as peças" da dica sob a lista.
      onCarregarTimeline(cb) {
        carregarTLCb = cb;
      },
      // Pede o "de acordo" antes da rota CARA da lista (a grid, que gasta telas
      // da sessão do PJe). Promise<boolean>. Quem chama é o content.js, no
      // momento em que sabe que vai cair nela — ver o comentário longo do
      // `.gwarn`. Já silenciado pelo usuário, resolve `true` sem abrir nada.
      confirmarLeituraPesada,
      // Botão "Baixar .zip" da mesma faixa. cb(docs, {todas}) — `docs` já vem
      // resolvido (marcadas, ou todas quando nada está marcado) e `todas` diz
      // qual dos dois caminhos foi tomado, para o content script informar.
      onExportarZip(cb) {
        zipCb = cb;
      },
      // Pedido de pacote de carta precatória (item do menu do botão de download).
      // O content.js responde chamando `mostrarPrecatorias` com o resultado da
      // heurística — o painel não conhece `PjePrecatoria` nem a timeline.
      onPrecatorias(cb) {
        precCb = cb;
      },
      // Extração de texto das peças. Recebe `(docs, {todas})`, igual ao
      // `onExportarZip` — o painel só nomeia o alvo; quem baixa, extrai e monta
      // o `.md` é o content.js.
      onExtrairTexto(cb) {
        textoCb = cb;
      },
      // Abre a conferência. `onConfirmar(pacotesEscolhidos)` só é chamado se o
      // usuário confirmar — a UI nunca dispara download sozinha.
      mostrarPrecatorias: abrirPrec,
      fecharPrecatorias: fecharPrec,
      // Trava/destrava o botão durante a exportação.
      setZipOcupado,
      // Peças que já estão no contexto da conversa. Chamado ao fim de cada
      // turno e em "Nova conversa" (com lista vazia).
      setPecasEnviadas(ids) {
        pecasEnviadas = new Set(ids || []);
        for (const r of doclist.querySelectorAll(".docrow")) {
          r.classList.toggle("enviada", pecasEnviadas.has(r.dataset.id));
        }
      },
      // Escolha assistida por IA (camada 2 da seleção — a camada 1, por regex,
      // segue sendo o padrão instantâneo)
      onEscolherIA(cb) {
        iaCb = cb;
      },
      setIaOcupado,
      aplicarEscolhaIA,
      setSelNota,
      // usada pelo content script para o teto do inventário de peças não
      // anexadas: o critério de corte é o mesmo da lista
      classificarPeca,
      // Estado da dica: {texto, carregando}. Sem argumento volta ao padrão.
      setTimelineTip,
      // Declara que esta página é de um PJe cujo dialeto a extensão ainda não
      // lê. Muda só o que a coluna de peças DIZ e desliga os botões que não
      // teriam como funcionar — nenhum outro comportamento é tocado, porque em
      // tribunal suportado esta função nunca é chamada e o painel é byte a
      // byte o de antes.
      //
      // Os botões saem por `disabled` com o motivo no `title`, e não escondidos:
      // um controle que some não ensina nada, e o usuário que já conhecia o
      // “⟳ Carregar tudo” concluiria que a extensão quebrou. É a mesma escolha
      // do 📚 Modelos fora da janela de 1M.
      setNaoSuportado(info) {
        naoSuportado = info || null;
        if (!naoSuportado) return;
        setSelNota("");
        naoSupBox.textContent = "";
        const t = document.createElement("b");
        t.textContent = naoSuportado.titulo;
        const p = document.createElement("p");
        p.textContent = naoSuportado.texto;
        naoSupBox.append(t, p);
        naoSupBox.hidden = false;
        const motivo = naoSuportado.titulo + " — este controle não teria o que fazer aqui.";
        // Os degraus entram junto, e não por simetria: com a `.sel-nota`
        // suprimida acima, clicar em “chave” numa lista vazia não faria NADA e
        // o checkbox voltaria sozinho — “indistinguível de um botão quebrado”,
        // que é a frase com que o próprio `aplicarDegrau` justifica a nota que
        // aqui deixou de existir. O aviso logo acima é a explicação; o
        // `disabled` é o que impede a pergunta.
        for (const b of [tipLoad, tipIa, tipOcr, tipZip, tipZipMais, chkEss, chkMain, chkAll, docQ]) {
          if (!b) continue;
          b.disabled = true;
          b.title = motivo;
        }
        // A lista pode já ter sido pintada com o vazio clássico (o content.js
        // chama isto logo após o mount, mas o `refresh()` do boot é síncrono e
        // a ordem entre os dois não deve virar requisito silencioso).
        const vazio = doclist.querySelector(".empty");
        if (vazio) vazio.remove();
      },
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
      // Fonte de verdade da seleção: os checkboxes. Exposto para a memória de
      // caso poder GRAVAR o que está marcado — o content script já sabia a
      // seleção pelos callbacks, mas só no momento em que ela muda, e a
      // gravação acontece em outros instantes (fim de turno, fim de exportação).
      getSelected,
      // Seleção para GRAVAR na memória: os checkboxes marcados MAIS os ids que
      // ainda esperam a row aparecer (`selPendente`).
      //
      // A diferença não é preciosismo. A timeline do PJe é lazy: ao reabrir um
      // processo, boa parte das peças ainda não está no DOM. Gravar só
      // `getSelected()` apagaria da memória exatamente as peças que ainda não
      // tiveram chance de ser restauradas — e a cada sessão a seleção do
      // usuário encolheria um pouco mais, sem nada na tela explicando por quê.
      selecaoParaMemoria() {
        const ids = getSelected();
        if (selPendente && selPendente.size) ids.push(...selPendente);
        return [...new Set(ids)];
      },
      // Cópia rasa do transcript, para a memória de caso persistir a conversa
      // como o usuário a vê. Cópia, e não o array vivo: quem grava não pode
      // segurar uma referência que o próximo delta do stream vai mutar.
      lerTranscript() {
        return transcript.map((e) => ({ ...e }));
      },

      // ----------------------------------------------------------------------
      // MEMÓRIA DE CASO — retomada.
      // ----------------------------------------------------------------------

      // Repõe a conversa na tela a partir do transcript gravado. É REPLAY dos
      // métodos normais (addMessage/updateAssistant), não um renderizador novo:
      // assim o `transcript` interno volta correto sozinho e o ⬇ "Baixar a
      // conversa em .md" segue funcionando sem saber que houve retomada.
      // Os placeholders PUA de citação atravessam intactos — são caracteres do
      // próprio texto, e o renderMd os converte em <sup> como no primeiro
      // desenho.
      restaurarConversa(itens) {
        if (!Array.isArray(itens) || !itens.length) return 0;
        clearEmptyHint();
        let n = 0;
        for (const t of itens) {
          if (!t || !t.text) continue;
          if (t.role === "user") {
            api.addMessage("user", t.text, t.atts);
          } else if (t.tipo === "minuta" || t.tipo === "mapa") {
            // Minuta e mapa foram gravados com o MARKDOWN INTEIRO no texto (é o
            // que o export precisa). Re-renderizá-lo como bolha despejaria
            // dezenas de KB de documento na conversa — retomado, o turno vira
            // uma linha que aponta para onde o arquivo realmente está.
            const el = api.addMessage("assistant", "");
            estruturaAssistant(el);
            el.__entry.text = t.text;
            el.__entry.tipo = t.tipo;
            el.__body.innerHTML =
              '<div class="mapacard' + (t.tipo === "minuta" ? " minutacard" : "") + '">' +
              '<div class="mapacard-t">' + (t.tipo === "minuta" ? SVG.minuta : SVG.mapa) +
              " <b>" + (t.tipo === "minuta" ? "Minuta gerada" : "Mapa mental gerado") +
              " nesta conversa</b></div>" +
              '<div class="mapacard-hint">' +
              (t.tipo === "minuta"
                ? "Abra em Configurações → Minhas minutas."
                : "O mapa fica disponível enquanto o navegador estiver aberto.") +
              "</div></div>";
          } else {
            api.updateAssistant(api.addMessage("assistant", ""), t.text, t.cites);
          }
          n++;
        }
        msgs.scrollTop = msgs.scrollHeight;
        return n;
      },

      // Faixa no topo das mensagens. `onEsquecer` é opcional; sem ele o botão
      // não aparece (é o caso da faixa mostrada sem memória gravável).
      mostrarRetomada(info) {
        if (!info) return;
        const el = document.createElement("div");
        el.className = "retomada";
        const t = document.createElement("div");
        t.className = "ret-t";
        t.innerHTML =
          "<b>Conversa retomada</b>" +
          (info.quando ? " de " + escapeHtml(info.quando) : "") +
          (info.nMsgs ? " · " + info.nMsgs + " mensagem(ns)" : "") +
          '<span class="ret-onde">O texto das peças deste processo está guardado ' +
          "neste computador para não baixar tudo de novo.</span>";
        el.appendChild(t);
        if (info.onEsquecer) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "ret-esq";
          b.textContent = "Esquecer este processo";
          // Exclusão em DOIS cliques, nunca confirm() nativo: o dialog da página
          // vive fora do Shadow DOM e congela a extensão junto com o PJe.
          let armado = false;
          b.addEventListener("click", () => {
            if (!armado) {
              armado = true;
              b.classList.add("armado");
              b.textContent = "Esquecer?";
              setTimeout(() => {
                if (!armado) return;
                armado = false;
                b.classList.remove("armado");
                b.textContent = "Esquecer este processo";
              }, 4000);
              return;
            }
            info.onEsquecer();
            el.remove();
          });
          el.appendChild(b);
        }
        msgs.insertBefore(el, msgs.firstChild);
      },

      // ----------------------------------------------------------------------
      // Conversas do processo.
      //
      // O botão só existe quando há mais de uma conversa gravada: com uma só,
      // ele seria uma lista de um item — ruído no cabeçalho, que já tem oito
      // controles. A entrada aparece quando passa a ter função.
      // ----------------------------------------------------------------------
      setConversas(lista, atualId) {
        convLista = Array.isArray(lista) ? lista : [];
        convAtualId = atualId || null;
        // Visível a partir de UMA conversa guardada, não de duas.
        //
        // A regra anterior ("só com mais de uma") tinha lógica no papel e era
        // péssima na prática: ao excluir uma de duas, o botão SUMIA junto — e o
        // usuário, que acabara de apagar UMA, via o controle inteiro
        // desaparecer. Indistinguível de ter perdido tudo. Um controle nunca
        // pode sumir como efeito colateral da ação que o usuário acabou de
        // fazer nele.
        const mostrar = convLista.length > 0;
        convBtn.hidden = !mostrar;
        if (!mostrar) fecharConvMenu();
        else {
          convBtn.title =
            (convLista.length === 1
              ? "1 conversa guardada neste processo"
              : convLista.length + " conversas guardadas neste processo") +
            " — clique para abrir a lista";
          // O NÚMERO ao lado do ícone é o que faz este botão se explicar: dois
          // desenhos de balão vizinhos são indistinguíveis, mas um deles com
          // "3" ao lado só pode ser a lista. Vai num <span> próprio, nunca em
          // `convBtn.textContent`, que apagaria o <svg> (DESIGN.md §5).
          const n = convBtn.querySelector(".convs-n");
          if (n) n.textContent = String(convLista.length);
        }
        // Menu aberto: re-renderiza para refletir a exclusão sem fechar na cara
        // do usuário.
        if (convMenu) abrirConvMenu();
      },
      onTrocarConversa(cb) {
        trocarConvCb = cb;
      },
      onApagarConversa(cb) {
        apagarConvCb = cb;
      },

      // Marca os checkboxes da seleção anterior. NÃO marca nada agora: guarda os
      // ids e o `setDocs` os aplica conforme as rows aparecem. É o que resolve a
      // corrida com o MutationObserver da timeline — peça que só entra na lista
      // depois de rolar também é restaurada — SEM ressuscitar peça que o
      // usuário desmarcou (cada id é aplicado uma única vez).
      restaurarSelecao(ids) {
        if (!Array.isArray(ids) || !ids.length) return;
        selPendente = new Set(ids);
        // As rows que JÁ estão na tela são marcadas na hora; o resto espera o
        // próximo setDocs.
        let mexeu = false;
        for (const row of doclist.querySelectorAll(".docrow")) {
          if (!selPendente.has(row.dataset.id)) continue;
          selPendente.delete(row.dataset.id);
          row.querySelector('input[type="checkbox"]').checked = true;
          mexeu = true;
        }
        if (mexeu) syncSelection();
      },
      // Desmarca peças pelo id (checkbox = fonte de verdade). Usada quando o
      // download de uma peça falha: tirá-la da seleção é o que impede que ela
      // trave os próximos turnos. Cobre também a peça ainda LAZY (row não criada)
      // removendo-a de `selPendente`, senão ela voltaria marcada no próximo
      // setDocs. Devolve true se algo mudou.
      desmarcarPecas(ids) {
        if (!Array.isArray(ids) || !ids.length) return false;
        let mexeu = false;
        for (const id of ids) {
          const c = doclist.querySelector('input[value="' + CSS.escape(id) + '"]');
          if (c && c.checked) {
            c.checked = false;
            mexeu = true;
          }
          if (selPendente && selPendente.delete(id)) mexeu = true;
        }
        if (mexeu) syncSelection();
        return mexeu;
      },
      // Marca peças pelo id, de forma ADITIVA (não desmarca nada). É o que faz o
      // botão "adicionar peça citada" incluir no contexto uma peça que o modelo
      // apontou como faltante. Peça ainda LAZY entra em `selPendente` (mesclado,
      // não substituído como em `restaurarSelecao`) e é marcada quando a row
      // aparecer. Devolve os ids que ainda não estavam marcados.
      marcarPecas(ids) {
        if (!Array.isArray(ids) || !ids.length) return [];
        const novos = [];
        let mexeu = false;
        for (const id of ids) {
          const c = doclist.querySelector('input[value="' + CSS.escape(id) + '"]');
          if (c) {
            if (!c.checked) {
              c.checked = true;
              mexeu = true;
              novos.push(id);
            }
          } else {
            // row ainda lazy: guarda em selPendente e conta como mudança para
            // o syncSelection rodar — assim a memória (selecaoParaMemoria inclui
            // selPendente) persiste a peça já, simétrico ao desmarcarPecas.
            if (!selPendente) selPendente = new Set();
            if (!selPendente.has(id)) {
              selPendente.add(id);
              novos.push(id);
              mexeu = true;
            }
          }
        }
        if (mexeu) syncSelection();
        // Realce nas linhas que a EXTENSÃO acabou de marcar (o "Escolher com
        // IA" e a peça citada como faltante). Só nas que estão no DOM: a row
        // lazy não existe para acender, e quando ela nascer o `setDocs` já terá
        // apagado a classe de todo jeito.
        for (const id of novos) {
          const row = doclist.querySelector('.docrow[data-id="' + CSS.escape(id) + '"]');
          if (!row) continue;
          row.classList.remove("acesa");
          void row.offsetWidth; // reinicia a animação se a linha já acendeu antes
          row.classList.add("acesa");
        }
        return novos;
      },
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
        // Reclassificação quando a grid chega é de graça: setDocs recria todas
        // as rows e a seleção sobrevive pelo snapshot acima. Note o efeito
        // correto mas surpreendente — a seleção anterior NÃO é re-aplicada, e o
        // segmento "chave" passa a aparecer apagado porque o conjunto de peças
        // essenciais mudou. Isso é o sinal certo (a seleção é estado do
        // usuário); não "conserte" re-aplicando o degrau aqui.
        temTipoOficial = docs.some((d) => d.tipo);
        // UMA classificação por peça, reaproveitada pelo refino e pelo render.
        // O custo real aqui nunca foram as regex, é o norm() (toLowerCase + NFD
        // + replace), e `setDocs` roda a cada mutação da timeline do PJe —
        // classificar duas vezes dobraria justamente a parte cara.
        const clsPorId = new Map();
        for (const d of docs) clsPorId.set(d.id, classificarPeca(d));
        const refino = refinarRelevancia(docs, clsPorId, temTipoOficial);
        doclist.innerHTML = "";
        for (const d of docs) {
          const p = partesTitulo(d.titulo);
          const cls = clsPorId.get(d.id);
          const aj = refino.get(d.id); // {rel, motivo} ou undefined
          const row = document.createElement("label");
          row.className = "docrow " + cls.cat;
          // Relevância vai em DATASET, não em classe: as classes cat-* são
          // semânticas (DESIGN.md §2) e uma classe .rel-* convidaria a pendurar
          // cor nela — o eixo de cor já é a categoria. Aqui o dado serve aos
          // seletores dos atalhos de seleção, não à aparência.
          row.dataset.rel = aj ? aj.rel : cls.rel;
          row.dataset.busca = textoBusca(d); // título + tipo, sem acentos
          row.dataset.id = d.id; // usado pelo preview e pelo "ver na timeline"
          if (pecasEnviadas.has(d.id)) row.classList.add("enviada");
          // O TIPO oficial da grid descreve a peça melhor que o título (que é o
          // nome do arquivo) e a DATA de juntada dá o eixo cronológico — os dois
          // vão para o tooltip, sem custar um pixel na linha.
          // A data ESTAVA na linha, em coluna própria, e era o pior negócio da
          // lista: ~60px dos 328px da coluna, tirados justamente do nome da
          // peça, para responder uma pergunta que a ORDEM da lista já responde
          // (a timeline vem em ordem cronológica). Quem escolhe peça escolhe
          // pelo nome; a data é conferência, e conferência cabe no hover.
          // QUEM JUNTOU entra aqui pelo mesmo argumento da data: é o campo que
          // distingue peças de nome igual (a petição do autor da do réu, a
          // manifestação do MP da do assistente) e não cabe na linha, onde
          // disputaria os pixels do nome da peça.
          //
          // O MOTIVO do refino fecha a dica, e é ele que torna o degrau
          // AUDITÁVEL: uma peça marcada por posição ou por autor entrou por um
          // sinal que não está escrito no nome dela, e sem isso o usuário não
          // teria como discordar do que não vê.
          const dica =
            d.titulo +
            (d.tipo && d.tipo !== p.nome ? " — " + d.tipo : "") +
            (dataCurta(d.juntadoEm) ? " · juntada em " + dataCurta(d.juntadoEm) : "") +
            (d.juntadoPor ? " · por " + d.juntadoPor : "") +
            (aj ? " · " + aj.motivo : "");
          row.innerHTML =
            `<input type="checkbox" value="${escapeHtml(d.id)}">` +
            '<span class="d-dot" aria-hidden="true"></span>' +
            `<span class="d-t" title="${escapeHtml(dica)}">` +
            `<span class="d-nm">${escapeHtml(p.nome)}</span>` +
            (p.id ? `<span class="d-id">${p.id}</span>` : "") +
            "</span>" +
            '<button type="button" class="d-ver" title="Ver esta peça na linha do tempo do processo" aria-label="Localizar esta peça na linha do tempo">' +
            SVG.ver + "</button>";
          // `selPendente.delete` devolve true só na PRIMEIRA vez que este id
          // aparece: restaura a seleção da sessão anterior sem re-marcar o que
          // o usuário já desmarcou desde então.
          if (cur.has(d.id) || (selPendente && selPendente.delete(d.id))) {
            row.querySelector("input").checked = true;
          }
          doclist.appendChild(row);
        }
        if (!docs.length) {
          doclist.innerHTML = htmlListaVazia();
        }
        filtrarDocs(); // re-aplica a busca ativa à lista recém-renderizada
        syncSelection();
        // A lista foi recriada: os índices da seleção em faixa não valem mais.
        ancoraSel = -1;
        fecharMenuSel();
        if (mention) updateMention(); // popup aberto: reflete a lista atualizada
      },
      // attachments: títulos das peças anexadas neste turno (opcional)
      addMessage(role, text, attachments) {
        clearEmptyHint();
        const el = document.createElement("div");
        el.className = "msg " + role;
        // `atts` entra no transcript porque ele é o registro do turno, e os
        // chips de peça anexada fazem parte do que foi perguntado. Ficavam só
        // no DOM: não sobreviviam nem ao "Baixar a conversa em .md", que
        // exportava a pergunta sem dizer sobre quais peças ela foi feita.
        el.__entry = { role, text: text || "" };
        if (attachments && attachments.length) el.__entry.atts = attachments.slice();
        transcript.push(el.__entry);
        if (role === "assistant") {
          if (text) {
            estruturaAssistant(el).__body.innerHTML = renderMd(text);
          } else {
            // aguardando o modelo: indicador de digitação
            el.classList.add("typing");
            // Os pontos + o TEXTO da espera (`setEspera`): "Analisando… — 12 s"
            // dentro da bolha, que é onde o olho está. Uma bolha muda durante
            // um raciocínio longo é indistinguível de travamento (relato real).
            el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span><span class="wait-t"></span>';
          }
        } else {
          const txt = document.createElement("div");
          txt.className = "txt";
          preencherComReid(txt, text);
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
        // Nada para mostrar ainda: a bolha continua com o indicador de
        // digitação. Um delta vazio (provedores mandam) não pode deixar uma
        // bolha em branco pelo resto do raciocínio.
        if (!fullText && !(cites && cites.length) && !el.__body) return;
        estruturaAssistant(el);
        // recolhe o raciocínio quando a resposta começa a chegar
        if (el.__think && !el.__think.hidden && fullText) el.__think.open = false;
        let html = renderMd(fullText, cites);
        if (cites && cites.length) {
          // Peça dos autos e página da internet são coisas de natureza diferente
          // — uma é prova no processo, a outra é fonte externa —, e até aqui as
          // duas saíam na MESMA lista, com a mesma aparência. Num texto que mistura
          // os autos com jurisprudência (o caso de uso principal) isso apagava a
          // fronteira que mais importa juridicamente. Agora vão em grupos rotulados.
          //
          // O número (n) é capturado ANTES de agrupar e NADA é reordenado: ele é o
          // mesmo do sobrescrito no corpo do texto (placeholder PUA → <sup> no
          // renderMd), então mexer na ordem quebraria a correspondência entre a
          // marca na frase e a linha da fonte.
          const NIVEL_TITULO = {
            superior: "Tribunal superior (STF/STJ)",
            tribunal: "Tribunal deste processo",
            outra: "Outra fonte jurídica",
          };
          const numeradas = cites.map((c, i) => ({ c, n: i + 1 }));
          const ehWeb = (x) => !!(x.c.url && /^https?:\/\//.test(x.c.url));
          const daWeb = numeradas.filter(ehWeb);
          const dosAutos = numeradas.filter((x) => !ehWeb(x));

          const linha = ({ c, n }) => {
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
              // Domínio de origem ao lado do título. No Gemini ele NÃO sai da URL
              // (que é um redirecionador do Google) e sim do title — ver
              // hostDaFonte em content.js. E quando o título JÁ É o domínio (o
              // caso do Gemini, que não manda manchete), repetir daria
              // "stj.jus.br stj.jus.br": mostra-se um só.
              if (c.host && c.host.toLowerCase() !== String(c.label || "").trim().toLowerCase()) {
                corpo +=
                  ' <span class="cite-host" title="' +
                  escapeHtml(NIVEL_TITULO[c.nivel] || "Fonte na web") + '">' +
                  escapeHtml(c.host) + "</span>";
              }
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
              '<span class="cite-row"' +
              (c.nivel ? ' data-nivel="' + escapeHtml(c.nivel) + '"' : "") +
              '><sup class="cit">' + n + "</sup> " + corpo + "</span>"
            );
          };

          // O título de grupo só existe quando HÁ fonte web: sem ela, "veio dos
          // autos" é a expectativa padrão do usuário e o rótulo seria só ruído.
          let bloco = '<div class="cites">';
          if (daWeb.length && dosAutos.length) {
            bloco += '<div class="cites-h">Peças dos autos</div>';
          }
          bloco += dosAutos.map(linha).join("");
          if (daWeb.length) {
            bloco +=
              '<div class="cites-h">Fontes na web (' + daWeb.length + ")</div>" +
              daWeb.map(linha).join("");
          }
          html += bloco + "</div>";
        }
        el.__body.innerHTML = html;
        if (el.__entry) {
          el.__entry.text = fullText;
          el.__entry.cites = cites || null;
        }
        msgs.scrollTop = msgs.scrollHeight;
      },
      // Resumo do raciocínio (thinking) em bloco colapsável no topo da bolha.
      // O texto da espera dentro da bolha ("Analisando… — 12 s"). Só enquanto
      // ela ainda mostra os pontos; com texto de resposta, o `.wait-t` já saiu.
      setEspera(el, texto) {
        const w = el && el.querySelector(".wait-t");
        if (w) w.textContent = texto || "";
      },
      setThinking(el, text) {
        // Raciocínio VAZIO (o OpenRouter manda um `thinking` sem texto só para
        // acender o status) não pode estruturar a bolha: `estruturaAssistant`
        // tira o indicador de digitação, e o que sobrava era uma bolha em
        // branco pelo resto do raciocínio (relato real, DeepSeek). Sem texto e
        // sem estrutura ainda, os pontos ficam.
        if (!text && !el.__body) return;
        estruturaAssistant(el);
        el.__think.hidden = !text;
        if (text) {
          // "sem texto ainda" = o corpo só tem o indicador de digitação
          if (el.__body.querySelector(".dots")) el.__think.open = true;
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
      // O tema, para o content propagar a troca feita NOUTRA aba (ou na página
      // de opções) pelo `storage.onChanged`. `gravar: false` porque quem
      // recebe a notificação não é quem escolheu — regravar aqui devolveria o
      // evento ao storage e as abas ficariam em pingue-pongue.
      setTema(id) {
        aplicarTema(id, false);
      },
      isSigiloso() {
        return sigiloOn;
      },
      onSigiloso(cb) {
        sigiloCb = cb;
      },
      // Pinta sem disparar o callback — é o que o content usa ao retomar um
      // processo que já estava em modo sigiloso.
      setSigiloso(ligado, quantos, dados) {
        pintarSigilo(ligado, quantos, dados);
      },
      // O PROGRESSO DA ANONIMIZAÇÃO, no carimbo. É uma API própria e não um
      // parâmetro de `setSigiloso` porque as duas mudam em ritmos diferentes:
      // o estado do modo muda uma vez por turno, o progresso muda uma vez por
      // peça (e uma vez por FOLHA, no OCR). Passar `null` volta ao repouso.
      //
      // O que ela mostra já era escrito em `setPrepNota`, dentro do card de
      // preparo — mas o card some quando o turno termina, e é justamente
      // durante a anonimização que o carimbo estaria mudo com "0 protegidos".
      // PARCIAL FUNDE, `null` ZERA. São dois chamadores em escopos diferentes:
      // o laço das peças conhece `{feitas, total}` e o OCR, lá dentro, conhece
      // só a folha. Se o parcial substituísse, a chamada da folha apagaria o
      // contador de peças e o carimbo diria "fl. 3" sem dizer 3 de quantas.
      setSigiloProgresso(p) {
        if (!p) sigProgresso = null;
        else if (p.total || p.feitas || p.detalhe)
          sigProgresso = Object.assign({}, sigProgresso, p);
        if (sigiloOn) pintarCarimbo(ultimoQuantosSigilo);
      },
      // O relatório de conferência: quem monta é o content (ele tem o texto e a
      // ficha); o painel só oferece o gesto.
      // Reescreve o texto de uma bolha do USUÁRIO já na tela (e no transcript
      // que a exportação e a memória gravam). Usado pelo modo sigiloso quando a
      // máscara da pergunta muda DEPOIS de as peças serem anonimizadas: a bolha
      // tem de mostrar exatamente o que foi à API. `textContent`, nunca
      // innerHTML — é texto do usuário.
      atualizarTextoUsuario(el, texto) {
        if (!el) return;
        const txt = el.querySelector(".txt");
        if (txt) preencherComReid(txt, texto || "");
        if (el.__entry) el.__entry.text = texto || "";
      },
      // Instala quem resolve `[PESSOA_1]` → nome na TELA (ver `renderMd`).
      // Repinta o que já está na conversa: uma retomada da memória de caso
      // monta as bolhas antes de o mapa chegar.
      setReidentificador(fn) {
        reidentificador = typeof fn === "function" ? fn : null;
        for (const el of msgs.querySelectorAll(".msg.user .txt")) {
          const m = el.closest(".msg");
          if (m && m.__entry) preencherComReid(el, m.__entry.text || "");
        }
      },
      // EDITOR DE REVISÃO do texto anonimizado de UMA peça. O usuário vê o
      // texto exatamente como sairia, o que sobrou em claro (com rótulo e
      // valor), e decide: mascarar todas as ocorrências à mão, liberar o valor
      // neste processo, ou editar livremente e usar. `onSalvar(texto)` devolve
      // {ok} ou {ok:false, msg, sobras} — é o content que confere.
      // Conteúdo dos autos: só textContent/value, nunca innerHTML.
      // CONFERÊNCIA antes de enviar (modo sigiloso). `info.dados` = {itens,
      // pecas:[{id,titulo,texto,chars}]}, `info.recarregar()` devolve o mesmo
      // shape relido, `info.onEditar(id)` abre o editor e resolve ao fechar,
      // `info.onNaoPerguntar()` grava a dispensa. Resolve true só no "Enviar".
      confirmarEnvioSigiloso(info) {
        return new Promise((resolve) => {
          // Uma chamada nova com outra pendente deixaria a primeira promessa
          // pendurada — mesma regra da `.gwarn`.
          if (sigokResolve) responderSigok(false);
          sigokResolve = resolve;
          sigokInfo = info || {};
          sigokCb.checked = false;
          sigokRemovidas.clear();
          pintarSigok(sigokInfo.dados || {});
          sigokBox.hidden = false;
          sigokCard.focus();
        });
      },
      abrirEditorSigilo(info) {
        const i = info || {};
        const antigo = wrap.querySelector(".sig-edit");
        if (antigo) antigo.remove();
        const box = document.createElement("div");
        box.className = "sig-edit";
        // Todo fechamento passa por aqui: quem abriu pode precisar saber
        // (a caixa de conferência repinta a linha da peça ao fechar).
        const fechar = () => {
          box.remove();
          if (typeof i.onFechar === "function") i.onFechar();
        };
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "Revisar texto anonimizado");
        const hd = document.createElement("div");
        hd.className = "se-hd";
        const t = document.createElement("span");
        t.className = "se-t";
        t.textContent = "Revisar texto anonimizado — " + (i.titulo || "");
        hd.appendChild(t);
        const x = document.createElement("button");
        x.type = "button";
        x.className = "se-x";
        x.setAttribute("aria-label", "Fechar");
        x.innerHTML = SVG.close;
        x.addEventListener("click", fechar);
        hd.appendChild(x);
        box.appendChild(hd);

        const nota = document.createElement("p");
        nota.className = "se-nota";
        nota.textContent =
          "Este é o texto que sairia para a IA. O que a conferência achou em claro está listado abaixo — " +
          "mascare, libere ou edite o texto à vontade e clique em Usar este texto.";
        box.appendChild(nota);

        const ta = document.createElement("textarea");
        ta.className = "se-ta";
        ta.spellcheck = false;
        ta.value = i.texto || "";

        const sobras = document.createElement("div");
        sobras.className = "se-sobras";
        const pintarSobras = (lista) => {
          sobras.textContent = "";
          if (!lista || !lista.length) {
            const okEl = document.createElement("span");
            okEl.className = "se-ok";
            okEl.textContent = "Nada em claro do que o mapa conhece.";
            sobras.appendChild(okEl);
            return;
          }
          for (const s of lista) {
            const linha = document.createElement("div");
            linha.className = "se-sobra";
            const v = document.createElement("b");
            v.textContent = "«" + s.valor + "»";
            linha.appendChild(v);
            const r = document.createElement("code");
            r.textContent = s.rotulo;
            linha.appendChild(r);
            const bm = document.createElement("button");
            bm.type = "button";
            bm.textContent = "Mascarar todas";
            bm.title = "Troca todas as ocorrências deste valor pelo rótulo, no texto acima";
            bm.addEventListener("click", () => {
              // literal, sem caixa: é o mesmo critério do mapa
              const re = new RegExp(String(s.valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
              ta.value = ta.value.replace(re, s.rotulo);
              linha.remove();
              if (!sobras.querySelector(".se-sobra")) pintarSobras([]);
            });
            linha.appendChild(bm);
            if (typeof i.onLiberar === "function") {
              const bl = document.createElement("button");
              bl.type = "button";
              bl.textContent = "Liberar neste processo";
              bl.title = "Não é dado pessoal: passa a sair em claro neste processo";
              bl.addEventListener("click", async () => {
                bl.disabled = true;
                try {
                  await i.onLiberar(s.rotulo);
                  linha.remove();
                  if (!sobras.querySelector(".se-sobra")) pintarSobras([]);
                } catch (e) {
                  bl.disabled = false;
                  msg.textContent = "Não deu para liberar: " + ((e && e.message) || e);
                }
              });
              linha.appendChild(bl);
            }
            sobras.appendChild(linha);
          }
        };
        pintarSobras(i.sobras || []);
        box.appendChild(sobras);
        box.appendChild(ta);

        const msg = document.createElement("div");
        msg.className = "se-msg";
        box.appendChild(msg);

        const acts = document.createElement("div");
        acts.className = "se-acts";
        const usar = document.createElement("button");
        usar.type = "button";
        usar.className = "se-usar";
        usar.textContent = "Usar este texto";
        usar.addEventListener("click", async () => {
          usar.disabled = true;
          msg.textContent = "";
          try {
            const r = await (i.onSalvar ? i.onSalvar(ta.value) : { ok: true });
            if (r && r.ok === false) {
              msg.textContent = "Ainda não dá para usar — " + (r.msg || "há valores em claro.");
              if (r.sobras) pintarSobras(r.sobras);
              usar.disabled = false;
              return;
            }
            fechar();
          } catch (e) {
            msg.textContent = "Não deu: " + ((e && e.message) || e);
            usar.disabled = false;
          }
        });
        acts.appendChild(usar);
        const canc = document.createElement("button");
        canc.type = "button";
        canc.className = "se-canc";
        canc.textContent = "Cancelar";
        canc.addEventListener("click", fechar);
        acts.appendChild(canc);
        box.appendChild(acts);
        // Esc fecha só o editor (stopPropagation: a cascata do painel fecharia
        // o modo minuta junto).
        box.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            fechar();
          }
        });
        wrap.appendChild(box);
        ta.focus();
        return box;
      },
      // Abre a caixa de auditoria (o que o clique no selo faz). Existe para o
      // aviso de bloqueio poder levar o usuário direto ao que foi mascarado.
      abrirAuditoria() {
        if (!sigiloOn) return;
        abrirAud();
      },
      onBaixarAuditoria(cb) {
        audBaixarCb = cb;
      },
      onLiberarAuditoria(cb) {
        audLiberarCb = cb;
      },
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
      // Qual modelo vai REDIGIR a minuta. Chamado pelo content.js quando as
      // caps chegam/mudam; a nota só aparece no modo minuta, então trocar de
      // modelo (ou o campo "Modelo para minutas") a reescreve na hora.
      // Substitui o antigo `setPerfilModelo`: duas APIs escrevendo no mesmo
      // elemento divergiriam na primeira edição.
      setModeloMinuta(info) {
        minutaModeloInfo = info || null;
        atualizarPerfilNota();
      },
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
        if (entry) {
          entry.text = info.md || ""; // exportar .md leva o mapa inteiro
          // Marca o tipo para a RETOMADA: o markdown de um mapa tem dezenas de
          // KB e re-renderizá-lo como bolha de chat despejaria o texto cru na
          // conversa. Retomado, ele vira uma linha que aponta para onde o mapa
          // está de fato.
          entry.tipo = "mapa";
        }
        el.__body.innerHTML =
          '<div class="mapacard">' +
          '<div class="mapacard-t">' + SVG.mapa + ' <b>Mapa mental gerado</b>' +
          (info.resumo ? " — " + escapeHtml(info.resumo) : "") +
          "</div>" +
          '<div class="mapacard-acts">' +
          '<button class="mapacard-abrir">Abrir mapa</button>' +
          '<button class="mapacard-md">' + SVG.zip + ' Baixar .md</button>' +
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
        if (entry) {
          entry.text = info.md || "";
          entry.tipo = "minuta"; // mesma razão do card do mapa (ver acima)
        }
        el.__body.innerHTML =
          '<div class="mapacard minutacard">' +
          '<div class="mapacard-t">' + SVG.minuta + ' <b>Minuta gerada</b>' +
          (info.resumo ? " — " + escapeHtml(info.resumo) : "") +
          "</div>" +
          '<div class="mapacard-acts">' +
          '<button class="mapacard-abrir">Abrir no editor</button>' +
          '<button class="mapacard-md">' + SVG.zip + ' Baixar .md</button>' +
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
        b.innerHTML =
        SVG.minuta +
        '<span class="lbl">' +
        (info.destaque ? "Abrir no editor" : "Editar como documento") +
        "</span>";
        b.title =
          "Abre esta resposta num editor de texto, em nova aba: revise, copie para " +
          "o PJe, baixe em Word (.docx) ou imprima.";
        b.addEventListener("click", () => info.onAbrir && info.onAbrir(b));
        box.appendChild(b);
        // Quem pede a peça no CHAT comum nunca passa pela barra do modo minuta
        // — e é lá que vive a escolha dos modelos. Sem esta ação a biblioteca
        // fica invisível justamente para quem acabou de pedir uma peça
        // redigida, que é o público dela. Só quando a heurística reconheceu o
        // pedido (`destaque`) e a feature está disponível: numa resposta
        // analítica qualquer, a linha seria ruído.
        if (info.destaque && temMlib && modelosHabilitado && modelosLib.length) {
          const alt = document.createElement("button");
          alt.className = "editor-alt";
          alt.textContent = "Refazer seguindo seus modelos";
          alt.title =
            "Liga o modo minuta, onde você escolhe a categoria das suas peças-modelo: " +
            "o assistente segue a estrutura e o estilo delas (os fatos continuam saindo " +
            "só das peças do processo).";
          alt.addEventListener("click", () => {
            // O pedido ORIGINAL volta ao campo antes de ligar o modo. Sem isto,
            // `btnMinuta` veria o campo vazio e injetaria a instrução PADRÃO —
            // genérica —, trocando "sentença de improcedência pela prescrição"
            // por "redija a peça adequada". O usuário perderia justamente o que
            // acabou de escrever, e num clique cujo nome promete REFAZER o
            // mesmo pedido.
            if (!inEl.value.trim() && info.pedido) {
              inEl.value = info.pedido;
              autoresize();
            }
            if (!minutaMode) btnMinuta.click(); // reusa validação e exclusividade com o mapa
            inEl.focus();
          });
          box.appendChild(alt);
        }
        el.appendChild(box);
        msgs.scrollTop = msgs.scrollHeight;
      },
      // Peças que o modelo CITOU como faltantes (ids que ele mencionou mas que
      // não estão no contexto) viram botões de "adicionar" abaixo da bolha. O
      // modelo já faz o trabalho de apontar "o comprovante está na peça
      // 214661494, que não foi anexada"; aqui esse id vira um clique que marca a
      // peça — o usuário não precisa procurá-la na lista.
      //
      // Irmão do `.editor-act`: sobrevive ao `updateAssistant` (é filho do
      // container do turno, não do `.body`). `info.pecas` = [{id, titulo}];
      // `info.onAdd(ids)` marca as peças (o content script decide o que fazer).
      sugerirPecas(el, info) {
        if (!el || !info || !info.pecas || !info.pecas.length) return;
        if (el.querySelector(".pecas-sug")) return; // uma vez por bolha
        estruturaAssistant(el);
        const box = document.createElement("div");
        box.className = "pecas-sug";
        const lab = document.createElement("div");
        lab.className = "pecas-sug-lab";
        lab.textContent =
          info.pecas.length === 1
            ? "Peça citada que não está no contexto:"
            : "Peças citadas que não estão no contexto:";
        box.appendChild(lab);
        const linha = document.createElement("div");
        linha.className = "pecas-sug-chips";
        const marcados = new Set();
        // troca o + pelo ✓ e desabilita (a peça já foi marcada)
        function marcarFeito(btn) {
          btn.classList.add("feito");
          btn.disabled = true;
          const svg = btn.querySelector("svg");
          if (svg) svg.outerHTML = SVG.check;
        }
        for (const p of info.pecas) {
          const b = document.createElement("button");
          b.className = "pecas-sug-add";
          b.dataset.id = p.id;
          b.innerHTML =
            SVG.novo +
            '<span class="ps-id">' + escapeHtml(String(p.id)) + "</span>" +
            (p.titulo ? '<span class="ps-t">' + escapeHtml(tituloCurto(p.titulo)) + "</span>" : "");
          b.title = "Marcar “" + (p.titulo || p.id) + "” para incluí-la no próximo envio";
          b.addEventListener("click", () => {
            if (marcados.has(p.id)) return;
            marcados.add(p.id);
            marcarFeito(b);
            if (info.onAdd) info.onAdd([p.id]);
          });
          linha.appendChild(b);
        }
        // "Adicionar todas" só quando há mais de uma: com uma peça o botão único
        // já resolve.
        if (info.pecas.length > 1) {
          const todas = document.createElement("button");
          todas.className = "pecas-sug-all";
          todas.textContent = "Adicionar todas";
          todas.addEventListener("click", () => {
            const restantes = info.pecas.map((p) => p.id).filter((id) => !marcados.has(id));
            if (!restantes.length) return;
            for (const p of info.pecas) marcados.add(p.id);
            for (const b of linha.querySelectorAll(".pecas-sug-add")) {
              if (b.classList.contains("feito")) continue;
              marcarFeito(b);
            }
            todas.disabled = true;
            if (info.onAdd) info.onAdd(restantes);
          });
          linha.appendChild(todas);
        }
        box.appendChild(linha);
        el.appendChild(box);
        msgs.scrollTop = msgs.scrollHeight;
      },
      // busy=true mostra um spinner antes do texto (trabalho em andamento —
      // análise, geração de documento, upload…), para o usuário ver que a
      // extensão está trabalhando e não travada.
      // `icone` troca o anel genérico de "trabalhando" por um símbolo do que
      // está acontecendo — hoje só "busca" (lupa). O anel diz que ALGO ocorre;
      // a lupa diz O QUE, que é a informação que o usuário quer durante uma
      // pesquisa de jurisprudência.
      setStatus(s, busy, icone) {
        statusEl.textContent = s || "";
        statusEl.classList.toggle("busy", !!busy && !!s);
        statusEl.classList.toggle("buscando", !!busy && !!s && icone === "busca");
      },
      // Repõe um turno bloqueado no composer. O texto volta inteiro e os dois
      // popups contextuais são recalculados, como numa digitação normal.
      restaurarTexto(texto) {
        inEl.value = String(texto || "");
        autoresize();
        updateMention();
        updateSlash();
        inEl.focus();
      },
      // Usado só depois de uma decisão explícita na bolha de bloqueio. Passa
      // pelo mesmo `doSend` do clique/Enter; não existe um segundo caminho de
      // montagem da mensagem para divergir.
      enviarAgora() {
        if (inEl.disabled || sendBtn.disabled) return false;
        doSend();
        return true;
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
      // `opts` ({titulo, dica}) existe porque a mesma estrutura — lista de
      // peças + motivo + o que fazer a respeito — serve para mais de um tipo
      // de perda parcial. Hoje: peça que não baixou (padrão) e peça de texto
      // longa demais, que entrou cortada. Sem os opts, o texto é byte a byte o
      // de antes.
      mostrarFalhasPecas(falhas, opts) {
        if (!falhas || !falhas.length) return null;
        const o = opts || {};
        const el = document.createElement("details");
        el.className = "falhas";
        const n = falhas.length;
        const sum = document.createElement("summary");
        // Falha de ANONIMIZAÇÃO (modo sigiloso) não é falha de download: a
        // peça baixou, o mascaramento é que não fechou. Dizer "não pôde ser
        // baixada" mandava o usuário abrir a peça na linha do tempo — conselho
        // falso para um problema que está em outro lugar.
        const anon = falhas.filter((f) => f && f.anon).length;
        const tituloAnon =
          anon === n
            ? n === 1
              ? "1 peça não pôde ser anonimizada e ficou de fora desta análise"
              : n + " peças não puderam ser anonimizadas e ficaram de fora desta análise"
            : anon
              ? n + " peças ficaram de fora desta análise (" + anon + " por falha na anonimização)"
              : null;
        sum.textContent =
          o.titulo ||
          tituloAnon ||
          (n === 1
            ? "1 peça não pôde ser baixada e ficou de fora desta análise"
            : n + " peças não puderam ser baixadas e ficaram de fora desta análise");
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
          // AÇÕES por item (modo sigiloso): liberar o valor que reprovou a
          // peça, ou revisar o texto num editor. Uma falha que só se anuncia
          // deixa o usuário sem saída além de desmarcar a peça.
          if (Array.isArray(f.acoes) && f.acoes.length) {
            const acts = document.createElement("div");
            acts.className = "falha-acoes";
            for (const a of f.acoes) {
              const b = document.createElement("button");
              b.type = "button";
              b.className = "falha-acao";
              b.textContent = a.rotulo;
              b.addEventListener("click", async () => {
                b.disabled = true;
                try {
                  await a.fn();
                } catch (e) {
                  statusEl.textContent = "Não deu: " + ((e && e.message) || e);
                } finally {
                  b.disabled = false;
                }
              });
              acts.appendChild(b);
            }
            li.appendChild(acts);
          }
          ul.appendChild(li);
        }
        el.appendChild(ul);
        const p = document.createElement("p");
        p.className = "falhas-dica";
        p.textContent =
          o.dica ||
          (anon
            ? "No modo sigiloso a peça só sai como texto anonimizado; quando o mascaramento não fecha, ela fica de fora em vez de sair como arquivo. Marque-a de novo para tentar outra vez, ou abra o selo «sigiloso» no rodapé para ver o que foi mascarado."
            : "Elas continuam marcadas: no próximo envio a extensão tenta de novo. Se persistir, abra a peça na linha do tempo do PJe uma vez e envie outra vez.");
        el.appendChild(p);
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
        return el;
      },

      // A guarda de saída barrou um valor ANTES da rede. Isto vive no chat —
      // onde nasceu a ação — e não na `.alertbar`: não exige recomeçar a
      // conversa, exige uma decisão sobre UM valor. Conteúdo do processo entra
      // sempre por textContent; o HTML abaixo é só estrutura constante.
      // BLOQUEIO DA GUARDA = UMA DECISÃO: "este valor é um dado pessoal?".
      // A versão anterior empurrava para "Nova conversa" e chamava "Liberar" de
      // abrir mão de uma proteção — e o dono do projeto, diante de "ALIMENTOS"
      // rotulado como pessoa, não soube o que fazer. A bolha agora DIZ o que
      // aconteceu (o valor, onde ele nasceu, onde ia sair), faz a pergunta e
      // oferece os dois caminhos com o mesmo peso — manter protegido (a
      // máscara é refeita; o raciocínio guardado que não dá para reescrever é
      // descartado) ou liberar (palavra comum, termo jurídico, órgão) — mais
      // as ações sobre a PEÇA: tirar desta conversa, editar o texto. "Nova
      // conversa" só quando é de fato a única saída (`repetido`, ou opaco que
      // a API não deixa omitir). Conteúdo dos autos por textContent, sempre.
      mostrarBloqueioSigilo(info) {
        const o = info || {};
        clearEmptyHint();
        const el = document.createElement("section");
        el.className = "msg sigilo-bloqueio";
        el.setAttribute("role", "alert");
        el.innerHTML =
          '<div class="sb-h">' + SVG.coAlerta +
          '<span>A proteção segurou este envio</span></div>' +
          '<div class="sb-valor" hidden><span>Valor encontrado</span><strong></strong><em class="sb-orig"></em></div>' +
          '<p class="sb-p"></p>' +
          '<p class="sb-q"></p>' +
          '<div class="sb-acts"></div>' +
          '<p class="sb-nota"></p>';

        const tipo = o.tipo && NOME_TIPO[o.tipo]
          ? NOME_TIPO[o.tipo][0]
          : String(o.tipo || "dado protegido").toLowerCase();
        const editavel = o.editavel !== false;
        const podeReenviar = typeof o.onMascarar === "function";
        const semSaidaProtegida = !!o.repetido || (!editavel && !podeReenviar);

        const valorEl = el.querySelector(".sb-valor");
        if (o.valor) {
          valorEl.querySelector("strong").textContent = "“" + o.valor + "”";
          valorEl.querySelector(".sb-orig").textContent =
            "reconhecido como " + tipo + (o.rotulo ? " (" + o.rotulo + ")" : "") +
            (o.origem ? " em «" + o.origem + "»" : "");
          valorEl.hidden = false;
        }
        el.querySelector(".sb-p").textContent =
          (o.valor ? "Esse valor" : "Um valor identificado como " + tipo) +
          " ia sair em claro" + (o.onde ? " " + o.onde : "") +
          ". Nada foi enviado à IA — no modo sigiloso, tudo o que o reconhecedor marcou " +
          "sai substituído por um rótulo, e aqui a substituição não alcançou esse trecho.";

        const q = el.querySelector(".sb-q");
        const acts = el.querySelector(".sb-acts");
        const nota = el.querySelector(".sb-nota");
        const concluir = (titulo, texto) => {
          el.classList.add("liberado");
          el.querySelector(".sb-h span").textContent = titulo;
          q.textContent = "";
          acts.textContent = "";
          nota.textContent = texto;
        };
        const card = (classe, titulo, texto) => {
          const c = document.createElement("div");
          c.className = "sb-card " + classe;
          const t = document.createElement("b");
          t.textContent = titulo;
          const d = document.createElement("span");
          d.textContent = texto;
          c.appendChild(t);
          c.appendChild(d);
          acts.appendChild(c);
          return c;
        };

        if (!o.rotulo && !o.valor) {
          // Sem rótulo não há decisão a tomar: só o caminho de conferir.
          q.textContent =
            "Não foi possível apontar qual rótulo causou o bloqueio. Confira a auditoria e tente de novo.";
        } else if (semSaidaProtegida) {
          q.textContent = "Este valor é um dado pessoal?";
          // Manter protegido: só a conversa nova (a parte da conversa que o
          // carrega não pode ser reescrita nem omitida).
          const cp = card("sb-proteger", "É dado pessoal → manter protegido",
            o.repetido
              ? "A máscara já foi refeita e a proteção segurou de novo pelo mesmo valor: ele está numa parte da conversa que não dá para reescrever daqui. Comece uma nova conversa — as peças anonimizadas e a tabela de rótulos continuam valendo."
              : "Ele está numa parte da conversa que não pode ser reescrita nem omitida. Comece uma nova conversa — as peças anonimizadas e a tabela de rótulos continuam valendo.");
          if (typeof o.onNovaConversa === "function") {
            const bn = document.createElement("button");
            bn.type = "button";
            bn.className = "sb-nova";
            bn.textContent = "Nova conversa (mantém as peças)";
            bn.addEventListener("click", () => o.onNovaConversa());
            cp.appendChild(bn);
          }
        } else {
          q.textContent = "Este valor é um dado pessoal?";
          const cp = card("sb-proteger", "É dado pessoal → manter protegido",
            "A máscara é refeita em toda a conversa com o que o mapa já conhece" +
              (editavel ? "" : "; o raciocínio guardado do modelo que carregava o valor é descartado (só esse trecho)") +
              (podeReenviar ? ", e a pergunta é reenviada." : ". Gere novamente quando quiser."));
          if (podeReenviar) {
            const bm = document.createElement("button");
            bm.type = "button";
            bm.className = "sb-mascarar";
            bm.textContent = "Manter protegido e reenviar";
            bm.addEventListener("click", () => {
              bm.disabled = true;
              bm.textContent = "Reenviando…";
              try {
                o.onMascarar();
                concluir("Reenviado com a máscara refeita",
                  "Se a proteção segurar de novo, a bolha seguinte diz onde o valor está.");
              } catch (e) {
                bm.disabled = false;
                bm.textContent = "Manter protegido e reenviar";
              }
            });
            cp.appendChild(bm);
          }
        }

        // Liberar: o caminho do falso positivo. Vale para os dois casos acima.
        if (o.valor && typeof o.onLiberar === "function") {
          const cl = card("sb-soltar", "Não é dado pessoal → liberar",
            "Palavra comum, termo jurídico ou órgão público que o reconhecedor confundiu com um nome. Passa a sair em claro" +
              (o.reenvia ? " e a pergunta é reenviada." : "."));
          const lab = document.createElement("label");
          lab.className = "sb-global";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(" também nos outros processos"));
          cl.appendChild(lab);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sb-liberar";
          btn.textContent = o.reenvia ? "Liberar e reenviar" : "Liberar neste processo";
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Liberando…";
            try {
              const liberado = await o.onLiberar({ global: cb.checked });
              if (liberado == null) {
                btn.disabled = false;
                btn.textContent = "Tentar liberar novamente";
                return;
              }
              concluir(
                cb.checked ? "Valor liberado em todos os processos" : "Valor liberado neste processo",
                o.reenvia ? "A pergunta foi reenviada com este valor em claro." : "Gere novamente quando quiser continuar."
              );
            } catch (e) {
              btn.disabled = false;
              btn.textContent = "Tentar liberar novamente";
              nota.textContent = "Não foi possível liberar o valor. A proteção continua ativa.";
            }
          });
          cl.appendChild(btn);
        }

        // Ações sobre a PEÇA atingida e a auditoria — secundárias, numa linha.
        const sec = document.createElement("div");
        sec.className = "sb-sec";
        if (typeof o.onRemoverPeca === "function") {
          const br = document.createElement("button");
          br.type = "button";
          br.className = "sb-remover";
          br.textContent = "Tirar " + (o.pecaTitulo ? "«" + String(o.pecaTitulo).slice(0, 48) + "»" : "a peça") + " desta conversa";
          br.title = "Desmarca a peça: os blocos dela ficam fora do envio, e a pergunta é reenviada";
          br.addEventListener("click", () => {
            br.disabled = true;
            o.onRemoverPeca();
            concluir("Peça tirada desta conversa", "A pergunta foi reenviada sem ela. Marque-a de novo quando quiser.");
          });
          sec.appendChild(br);
        }
        if (typeof o.onEditarPeca === "function") {
          const be = document.createElement("button");
          be.type = "button";
          be.className = "sb-editar";
          be.textContent = "Editar o texto da peça";
          be.title = "Abre o texto anonimizado para corrigir à mão; ao usar o texto, a pergunta é reenviada";
          be.addEventListener("click", () => o.onEditarPeca());
          sec.appendChild(be);
        }
        if (sigiloOn) {
          const ver = document.createElement("button");
          ver.type = "button";
          ver.className = "sb-aud";
          ver.textContent = "Ver o que foi mascarado";
          ver.addEventListener("click", () => abrirAud());
          sec.appendChild(ver);
        }
        if (sec.childNodes.length) el.appendChild(sec);

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
        // Conversa RETOMADA da memória: há acumulado, mas não houve resposta
        // nesta sessão. Escrever "~US$ 0,00 nesta resposta" afirmaria um turno
        // que não aconteceu — o acumulado sozinho é o número verdadeiro.
        if (info.turnoUsd == null) {
          custoFull.textContent = "~" + fmtUsd(info.conversaUsd) + " nesta conversa até aqui";
          custoShort.textContent = "~" + fmtUsd(info.conversaUsd);
          custoEl.title = "Custo acumulado da conversa retomada da memória deste processo.";
          custoEl.hidden = false;
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
      // SELO DA LINHA DO TEMPO PROCESSUAL — o que de fato foi ao modelo no
      // eixo do TEMPO (movimentos: publicação, intimação, decurso, trânsito).
      //
      // Existe porque a v0.45 mandava esse bloco e não dizia nada a ninguém: o
      // usuário lia uma resposta sobre PRAZO sem saber se ela veio do registro
      // oficial do PJe ou de uma leitura parcial da tela, nem que a lista havia
      // sido cortada por tamanho. O corte "ia dito" — ao MODELO, que já tinha o
      // dado, e não a quem decide se confia na resposta.
      //
      // Fica na `.metarow` porque é da mesma família do medidor e do custo:
      // fatos sobre a resposta que acabou de sair. E tem DOIS estados num só
      // mecanismo (como o ⚠️ da lista e o ⓘ das citações): normal quando a
      // linha do tempo foi inteira, aviso quando falta pedaço. Tokens SUAVES
      // (--warn-*), nunca os da `.alertbar` — a lista chegou, só não completa,
      // e nada está impedido de continuar.
      //
      // info: {n, total, fonte:"oficial"|"tela", cortou, cortouChave, truncada,
      //        parcial, de, ate}. null esconde.
      setLinhaDoTempo(info) {
        // A lista legível vive por trás do selo; ela é substituída junto com ele
        // para nunca mostrar movimentos de um retrato anterior.
        movItens = (info && info.itens) || [];
        fecharMov();
        if (!info) {
          ltEl.hidden = true;
          ltFull.textContent = "";
          ltShort.textContent = "";
          return;
        }
        const n = Number(info.n) || 0;
        const total = Number(info.total) || n;
        const oficial = info.fonte !== "tela";
        const cortou = Math.max(0, total - n);
        // Erro de concordância num selo cuja função é dar confiança é o detalhe
        // que faz duvidar do número ao lado dele.
        // Um só pluralizador para os três lugares que contam movimento, e os
        // verbos que concordam com ele. O caso de UM movimento não é exótico: é
        // o processo recém-distribuído, que é justamente o primeiro que alguém
        // abre — ali "1 movimento lidos" e "1 movimento ficaram de fora"
        // apareceriam na estreia do recurso.
        const movs = (k) => k + " movimento" + (k === 1 ? "" : "s");
        const ficou = (k) => (k === 1 ? " ficou" : " ficaram");
        // O aviso é sobre FALTAR pedaço — a fonte mais fraca (a tela) não é
        // aviso por si, e é o RÓTULO que a distingue: dizer "(da tela)" informa
        // sem alarmar, e alarmar o caso normal de um tribunal sem a rota REST
        // faria o selo perder o significado justamente onde ele importa.
        const alerta = !n || cortou > 0 || !!info.truncada || !!info.parcial;
        ltEl.classList.toggle("warn", alerta);
        const partes = [];
        if (!n) {
          ltFull.textContent = "sem linha do tempo";
          ltShort.textContent = "sem datas";
          partes.push(
            "Não foi possível obter os movimentos deste processo: a consulta oficial não " +
              "respondeu e a linha do tempo desta tela não trouxe atos. Perguntas de prazo, " +
              "publicação, intimação e trânsito em julgado podem ficar sem resposta — e a " +
              "ausência de um ato aqui NÃO significa que ele não aconteceu."
          );
        } else {
          const fonteTxt = oficial ? "" : " (da tela)";
          ltFull.textContent =
            "linha do tempo: " +
            (cortou ? n + " de " + movs(total) : movs(n)) + fonteTxt;
          ltShort.textContent = (cortou ? n + "/" + total : String(n)) + " movs" + fonteTxt;
          partes.push(
            "Linha do tempo do processo — " + movs(total) +
              (oficial
                ? " do registro oficial do PJe"
                : (total === 1 ? " lido" : " lidos") +
                  " desta tela (a consulta oficial não respondeu aqui; sem a hora dos atos)") +
              // Um movimento só — o processo recém-distribuído — tem UMA data:
              // "de 04/05/2026 a 04/05/2026" anuncia uma faixa que não existe.
              (info.de && info.ate
                ? info.de === info.ate ? ", em " + info.de : ", de " + info.de + " a " + info.ate
                : "") +
              ". É a fonte das datas de publicação, intimação, decurso de prazo e trânsito."
          );
        }
        if (cortou) {
          partes.push(
            info.cortouChave
              ? movs(cortou) + ficou(cortou) + " de fora para caber, e o corte alcançou atos que " +
                "NÃO são de expediente: ali pode faltar publicação, intimação ou decurso."
              : movs(cortou) + " de expediente (juntada, petição, certidão)" + ficou(cortou) +
                " de fora para caber; publicação, prazo, intimação, decurso e trânsito foram " +
                "preservados."
          );
        }
        if (info.truncada) {
          partes.push(
            "A lista NÃO alcança o início do processo: esta tela mostra ato anterior ao mais " +
              "antigo listado — ausência aqui não é inexistência."
          );
        }
        if (info.parcial) {
          partes.push(
            "A linha do tempo desta tela está PARCIAL (carrega sob demanda): podem existir atos " +
              "anteriores fora da lista."
          );
        }
        // Cabeçalho da lista: a procedência e o tamanho, que é o que decide o
        // peso do que se vai ler ali.
        movCab = !n
          ? "Sem linha do tempo"
          : (oficial ? "Registro oficial do PJe" : "Lido da linha do tempo desta tela") +
            " · " + movs(total) + (cortou ? " (" + n + " listados)" : "");
        const txt = partes.join(" ");
        // A explicação da caixa é a MESMA do tooltip: uma segunda redação para o
        // mesmo fato viraria duas versões da verdade para divergirem.
        movExplica = txt;
        const clicar = movItens.length ? " Clique para ler a lista." : "";
        ltEl.title = txt + clicar;
        ltEl.setAttribute("aria-label", txt + clicar);
        ltEl.hidden = false;
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
          '<span class="alert-t">' + escapeHtml(msg) + "</span>" +
          '<button class="alert-reset" title="Começar uma nova conversa do zero">' +
          SVG.reset + " Nova conversa</button>";
        alertEl
          .querySelector(".alert-reset")
          .addEventListener("click", () => resetCb && resetCb());
        alertEl.hidden = false;
      },
      lockInput(b) {
        inEl.disabled = b;
        // O campo DIZ que está esperando: o placeholder é o segundo lugar
        // para onde o olho vai depois da bolha. O original volta no destravar
        // (o modo minuta/mapa troca o placeholder, por isso se guarda o atual).
        if (b) {
          if (!inEl.dataset.phOriginal) inEl.dataset.phOriginal = inEl.placeholder;
          inEl.placeholder = "Aguardando a resposta do modelo…";
        } else if (inEl.dataset.phOriginal) {
          inEl.placeholder = inEl.dataset.phOriginal;
          delete inEl.dataset.phOriginal;
        }
        // O `disabled` do Enviar tem DUAS fontes (turno em andamento e falta de
        // orientação na minuta) e é `aplicarEstadoSend` quem as concilia —
        // escrever direto aqui faria o fim de um turno reabilitar o botão sem
        // a tese preenchida.
        inputTravado = b;
        aplicarEstadoSend();
        // trava também as ações — clicar durante uma resposta não faz nada,
        // e botão ativo-porém-morto confunde.
        tglSearch.disabled = b;
        btnMinuta.disabled = b;
        btnMapa.disabled = b;
        btnPlib.disabled = b;
        if (attachBtn) attachBtn.disabled = b;
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
        modeloAtualId = (info && info.model) || null;
        if (!info || !info.model) {
          modeloBadge.hidden = true;
          return;
        }
        const EFFORTS = { high: "alto", medium: "médio", low: "baixo" };
        // `info.nome` vem das CAPS (hoje, do catálogo do OpenRouter) e tem
        // precedência sobre a tabela local: são centenas de modelos de
        // terceiros, e sem ele o selo mostraria "or:anthropic/claude-sonnet-4.5"
        // cru — num elemento cujo trabalho é dizer, na língua do usuário, qual
        // modelo respondeu. A tabela continua mandando nos modelos diretos.
        let txt = NOMES_MODELO[info.model] || info.nome || info.model;
        // modelos sem suporte a effort (Haiku) não mostram o nível — exibir
        // um valor que a API não recebe seria mentira
        if (info.comEffort && EFFORTS[info.effort]) {
          txt += " · raciocínio " + EFFORTS[info.effort];
        }
        modeloBadge.textContent = txt;
        modeloBadge.hidden = false;
      },
    };
    return api;
  }

  return {
    mount,
    _renderMd: renderMd,
    _findSlashToken: findSlashToken,
    _montarTextoEnvio: montarTextoEnvio,
    _classificarPeca: classificarPeca,
    _refinarRelevancia: refinarRelevancia,
  };
})();
