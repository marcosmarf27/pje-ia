// Editor de minutas — página própria da extensão (chrome-extension://).
//
// Por que uma aba e não um modal no painel: o painel vive em Shadow DOM, e
// `document.getSelection()` não atravessa essa fronteira — todo editor rico
// quebra ali. É a mesma razão de fundo que levou o mapa mental para uma página
// própria (lá, a CSP do tribunal). A página lê a minuta de
// `chrome.storage.local` pelo `?id=` da URL e grava de volta as edições.

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const elTitulo = $("#titulo");
  const elSub = $("#subtitulo");
  const elSalvo = $("#salvo");
  const elAviso = $("#aviso");

  let chave = null; // "minuta:<id>"
  let dados = null; // {html, titulo, processo, criadoEm, atualizadoEm}
  let editor = null;
  let tSalvar = 0;

  // --------------------------------------------------------------- utilidades

  function mostrarAviso(html) {
    elAviso.innerHTML = html;
    elAviso.hidden = false;
  }

  function horaCurta(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function tempoRelativo(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "agora";
    const m = Math.floor(s / 60);
    if (m < 60) return "há " + m + " min";
    const h = Math.floor(m / 60);
    if (h < 24) return "há " + h + " h";
    const dias = Math.floor(h / 24);
    return "há " + dias + (dias > 1 ? " dias" : " dia");
  }

  function escaparTexto(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // Nome de arquivo seguro no Windows e no Linux, sem acento perdido.
  function nomeArquivo(ext) {
    const base = (elTitulo.value || "Minuta").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
    const proc = dados && dados.processo ? " " + String(dados.processo).replace(/[^\d.-]/g, "") : "";
    return (base + proc || "Minuta") + ext;
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Confirmação sem alert()/confirm(): o próprio botão responde por 1,6 s.
  // Os botões do cabeçalho são <svg> + <span>: escrever no BOTÃO apagaria o
  // ícone — e para sempre, porque a restauração devolveria só o texto. Mesma
  // regra do rotulo() em panel.js. Sem o <span> (botão sem ícone) cai no
  // próprio botão, que é o comportamento antigo.
  function piscar(btn, texto) {
    const alvo = btn.querySelector("span") || btn;
    const antes = alvo.textContent;
    alvo.textContent = texto;
    btn.classList.add("feito");
    setTimeout(() => {
      alvo.textContent = antes;
      btn.classList.remove("feito");
    }, 1600);
  }

  // ------------------------------------------------------------ persistência

  const temStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  function salvar() {
    if (!chave || !dados || !temStorage) return;
    dados.html = editor.value;
    dados.titulo = elTitulo.value.trim() || "Minuta";
    dados.atualizadoEm = Date.now();
    chrome.storage.local.set({ [chave]: dados }, () => {
      if (chrome.runtime.lastError) {
        elSalvo.className = "salvo";
        elSalvo.textContent = "não salvou";
        elSalvo.title = chrome.runtime.lastError.message;
        return;
      }
      elSalvo.className = "salvo ok";
      elSalvo.textContent = "salvo " + horaCurta(dados.atualizadoEm);
      elSalvo.title = "Rascunho guardado neste computador";
      document.title = dados.titulo + " — TecJustiça PJe";
    });
  }

  function agendarSalvar() {
    elSalvo.className = "salvo editando";
    elSalvo.textContent = "editando…";
    clearTimeout(tSalvar);
    tSalvar = setTimeout(salvar, 800);
  }

  // ----------------------------------------------------- lista de rascunhos
  // O rascunho vive em chrome.storage.local; sem uma forma de listá-los, ficaria
  // órfão no disco. Esta lista é a porta de recuperação — funciona a partir de
  // qualquer aba do editor (dropdown) e da própria página sem ?id (modo lista).
  // Ela CRESCE (uma minuta por geração), então tem busca (filtro por título e
  // número do processo) e exclusão por linha (dois cliques, como no descartar —
  // confirm() nativo trava a página).

  // Busca sem acento (NFD + remoção de diacríticos), o mesmo norm() do painel.
  const norm = (s) =>
    String(s == null ? "" : s).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

  const SVG_LUPA =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.6 10.6 14 14"/></svg>';
  const SVG_LIXO =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 4h10.8M6 4V2.7h4V4M4.1 4l.6 9a1 1 0 0 0 1 .95h4.6a1 1 0 0 0 1-.95l.6-9M6.6 6.6v5M9.4 6.6v5"/></svg>';

  function listarRascunhos(cb) {
    if (!temStorage) return cb([]);
    chrome.storage.local.get(null, (tudo) => {
      if (chrome.runtime.lastError || !tudo) return cb([]);
      const lista = Object.keys(tudo)
        .filter((k) => k.indexOf("minuta:") === 0)
        .map((k) => Object.assign({ id: k.slice("minuta:".length) }, tudo[k]))
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      cb(lista);
    });
  }

  // Estado vazio COMPACTO — usado no dropdown, onde só cabe uma frase.
  function vazioHtml() {
    return (
      '<div class="vazio">Nenhuma minuta guardada. Gere uma pelo botão ' +
      "“Minutar” no painel do processo.</div>"
    );
  }

  // Estado vazio da PÁGINA. A tela cheia com uma única linha cinza parecia
  // defeito; aqui a mesma informação vira orientação — o que é esta tela, como
  // criar a primeira minuta e para onde ir agora.
  function vazioPaginaHtml() {
    return (
      '<div class="vazio-pg">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3v5h5M9 13h6M9 17h4"/></svg>' +
      '<div class="vt">Nenhuma minuta guardada ainda</div>' +
      '<div class="vd">As minutas que você gerar aparecem aqui para reabrir e continuar ' +
      "depois. Para criar a primeira, abra os autos de um processo no PJe, marque as peças " +
      "e clique em <b>Minutar</b> no painel da extensão.</div>" +
      '<div class="vlinks">' +
      '<a href="modelos.html"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h7v14H4z"/><path d="M13 6h7v14h-7z"/></svg>Meus modelos de peças</a>' +
      '<a href="help.html" target="_blank">Como usar a extensão →</a>' +
      "</div></div>"
    );
  }

  // Uma linha por rascunho no DROPDOWN (280px de largura). A âncora (.ropen)
  // abre; o botão .rdel (fora da âncora) exclui.
  //
  // A página de tela cheia usa `linhaCartao`, não esta. Enquanto as duas
  // compartilhavam a mesma função, a página herdava o desenho pensado para um
  // menu estreito — era isso que a mantinha pobre.
  function linhaCompacta(r, atualId) {
    const atual = r.id === atualId;
    const quando = tempoRelativo(r.atualizadoEm || r.criadoEm || Date.now());
    const proc = r.processo ? escaparTexto(r.processo) + " · " : "";
    return (
      '<div class="rrow' + (atual ? " atual" : "") + '" data-id="' +
      escaparTexto(r.id) + '" data-busca="' + escaparTexto(textoBuscaMinuta(r)) + '">' +
      '<a class="ropen" href="editor.html?id=' + encodeURIComponent(r.id) + '">' +
      '<span class="rt">' + escaparTexto(tituloUtil(r)) + "</span>" +
      '<span class="rm">' + proc + quando + (atual ? " · aberta" : "") + "</span>" +
      "</a>" +
      '<button class="rdel" type="button" title="Excluir esta minuta" ' +
      'aria-label="Excluir minuta">' + SVG_LIXO + "</button>" +
      "</div>"
    );
  }
  function linhasRascunhos(lista, atualId) {
    if (!lista.length) return vazioHtml();
    return lista.map((r) => linhaCompacta(r, atualId)).join("");
  }

  // ---------------------------------------------------- prazo de validade
  // A poda vive no content.js (MAX_MINUTAS / VALIDADE_MINUTA_MS) e é privada
  // ao IIFE de lá. Duplicada aqui DE PROPÓSITO e com esta nota: divergir faria
  // a tela mentir sobre quando a minuta some — que é a informação que ela
  // existe para dar. Ao mudar uma, mudar a outra.
  const MAX_MINUTAS_UI = 10;
  const VALIDADE_MINUTA_MS_UI = 7 * 24 * 60 * 60 * 1000;
  const H = 3600000;

  // `tempoRelativo` só olha para TRÁS. Numa lista cujo conteúdo é apagado em 7
  // dias, o que decide se o usuário perde trabalho é o que falta para o fim —
  // e não havia nada que soubesse calcular isso. Uma minuta a 4 horas de ser
  // apagada mostrava apenas "há 6 dias".
  function tempoRestante(ts) {
    const ms = VALIDADE_MINUTA_MS_UI - (Date.now() - (ts || 0));
    if (ms <= 0) return { ms: 0, pct: 0, nivel: "fim", txt: "expira a qualquer momento" };
    const pct = Math.max(0, Math.min(100, (ms / VALIDADE_MINUTA_MS_UI) * 100));
    const h = Math.floor(ms / H);
    if (ms < 6 * H) return { ms, pct, nivel: "critico", txt: "expira em " + Math.max(1, h) + " h" };
    if (ms < 24 * H) return { ms, pct, nivel: "aviso", txt: "expira em " + h + " h" };
    const d = Math.floor(ms / (24 * H));
    // O verbo é obrigatório em TODOS os degraus. Um "6 dias" seco no canto do
    // card fica logo acima de "há 6 dias" na linha de meta — um é futuro, o
    // outro é passado, e sem o verbo os dois se leem como a mesma coisa.
    return { ms, pct, nivel: "ok", txt: "expira em " + d + (d > 1 ? " dias" : " dia") };
  }

  // Título FRACO: `tituloDaMinuta` (content.js) devolve "Minuta" quando o
  // markdown não trouxe um `#`. Duas minutas do mesmo processo ficavam
  // idênticas na lista — a primeira linha útil do corpo distingue.
  function tituloUtil(r) {
    const t = (r.titulo || "").trim();
    if (t && t !== "Minuta") return t;
    const linha = String(r.md || "")
      .split("\n")
      // O hífen só é marcação no INÍCIO da linha (item de lista). Removê-lo do
      // texto inteiro transformava "Intime-se" em "Intimese" e "Cite-se" em
      // "Citese" — e esse é justamente o vocabulário de um despacho, que é o
      // caso em que o título fraco mais aparece.
      .map((l) =>
        l
          .replace(/^#{1,6}\s+/, "")
          .replace(/^\s*[-*+]\s+/, "")
          .replace(/[*_`>|]/g, "")
          .trim()
      )
      // Pula a linha que só repete o título fraco: quando ela é a primeira do
      // corpo, aceitá-la devolveria "Minuta" outra vez — o mesmo rótulo que
      // esta função existe para substituir.
      .find((l) => l.length > 3 && l !== t);
    return linha ? linha.slice(0, 80) : t || "Minuta";
  }

  // Prévia do corpo: o que distingue duas minutas parecidas de relance.
  function previaMinuta(r, n) {
    return String(r.md || "")
      // `[ \t]*` e NÃO `\s+`: `\s` casa `\n` (o `.` não), então num markdown
      // que comece com título VAZIO ("# " + linha em branco) o `\s+` atravessa
      // as quebras e o `.*$` engolia o primeiro parágrafo inteiro — a prévia
      // saía vazia justamente nas minutas de título fraco, que são as que mais
      // precisam dela.
      .replace(/^#{1,6}[ \t]*.*$/gm, " ")   // títulos já estão no rótulo
      .replace(/\[COMPLETAR:[^\]]*\]/g, " ") // marcador de pendência polui a prévia
      .replace(/^[ \t]*[-*+][ \t]+/gm, "")   // marcador de lista, só no início da linha
      .replace(/[*_`>#|]/g, "")              // (sem o hífen: "Intime-se" viraria "Intimese")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n || 110);
  }

  // Índice de busca: título, processo E CORPO. O corpo ficava de fora, então
  // procurar por uma parte do texto da minuta não achava nada.
  function textoBuscaMinuta(r) {
    const o = r.origem || null;
    return norm(
      tituloUtil(r) + " " + (r.processo || "") + " " +
      (o ? (o.rotulo || "") + " " + (o.tese || "") + " " : "") +
      previaMinuta(r, 400)
    );
  }

  // A cor da espécie reusa os tokens --cat-* das categorias de peça. Não é
  // reciclagem: no sistema essas cores são SEMÂNTICAS (DESIGN.md §2) e já
  // significam exatamente isto — dourado para atos decisórios, verde para
  // audiência, neutro para o resto.
  const CAT_ESPECIE = {
    sentenca: "decisao", decisao: "decisao", acordao: "decisao", despacho: "decisao",
    ata: "audiencia", oficio: "outro", mandado: "outro", outro: "outro",
  };
  const SEM_ESPECIE = "__sem__";
  // Sentinela para "sem processo". Sem ela, a opção nasceria com valor "" — o
  // MESMO de "Todas" —, e clicar em "Sem processo" mostraria a lista inteira:
  // uma opção que não faz o que promete, e a única forma de isolar as minutas
  // sem processo identificado.
  const SEM_PROCESSO = "__semproc__";
  function processoDaMinuta(r) {
    return r.processo || SEM_PROCESSO;
  }
  function especieDaMinuta(r) {
    return (r.origem && r.origem.especie) || SEM_ESPECIE;
  }
  function rotuloEspecie(r) {
    if (r.origem && r.origem.rotulo) return r.origem.rotulo;
    return "Sem espécie registrada";
  }

  // Cabeçalho de busca (fica FORA das linhas re-filtradas, para o campo não
  // perder o foco durante a digitação — o filtro só liga/desliga row.hidden).
  function campoBusca(n) {
    return (
      '<div class="rbusca">' + SVG_LUPA +
      '<input type="search" class="rbusca-in" autocomplete="off" spellcheck="false" ' +
      'placeholder="Buscar por título ou processo…" aria-label="Buscar minuta">' +
      '<span class="rbusca-n">' + n + (n === 1 ? " minuta" : " minutas") + "</span>" +
      "</div>"
    );
  }

  function contarVisiveis(escopo) {
    const lista = escopo.querySelector(".drop-list, .lista-b");
    if (!lista) return;
    const rows = lista.querySelectorAll(".rrow");
    const cnt = escopo.querySelector(".rbusca-n");
    if (cnt) cnt.textContent = rows.length + (rows.length === 1 ? " minuta" : " minutas");
    if (!rows.length) {
      const busca = escopo.querySelector(".rbusca");
      if (busca) busca.hidden = true; // sem itens, buscar não faz sentido
      lista.innerHTML = vazioHtml();
    }
  }

  // Filtro por título/processo. Esc no campo (com texto) só limpa — não fecha o
  // dropdown; vazio, o Esc borbulha e o handler global fecha.
  function ligarBusca(escopo) {
    const inp = escopo.querySelector(".rbusca-in");
    const lista = escopo.querySelector(".drop-list, .lista-b");
    if (!inp || !lista) return;
    inp.addEventListener("input", () => {
      const q = norm(inp.value.trim());
      let vis = 0;
      lista.querySelectorAll(".rrow").forEach((row) => {
        const ok = !q || (row.dataset.busca || "").indexOf(q) !== -1;
        row.hidden = !ok;
        if (ok) vis++;
      });
      let sem = lista.querySelector(".sem-res");
      if (vis === 0) {
        if (!sem) {
          sem = document.createElement("div");
          sem.className = "sem-res";
          lista.appendChild(sem);
        }
        sem.hidden = false;
        sem.textContent = "Nenhuma minuta corresponde a “" + inp.value.trim() + "”.";
      } else if (sem) {
        sem.hidden = true;
      }
      const cnt = escopo.querySelector(".rbusca-n");
      if (cnt) cnt.textContent = vis + (vis === 1 ? " minuta" : " minutas");
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && inp.value) {
        e.stopPropagation();
        inp.value = "";
        inp.dispatchEvent(new Event("input"));
      }
    });
  }

  function desarmarLixo(btn) {
    clearTimeout(btn._t);
    btn.dataset.armado = "";
    btn.classList.remove("armado");
    btn.innerHTML = SVG_LIXO;
  }

  function excluirRascunho(id, feito) {
    const k = "minuta:" + id;
    const fim = () => {
      // se a minuta excluída é a aberta NESTA aba, para o autosave (senão o
      // próximo salvar a recriaria) e sinaliza no indicador de salvamento
      if (chave === k) {
        chave = null;
        clearTimeout(tSalvar);
        elSalvo.className = "salvo";
        elSalvo.textContent = "excluída";
        elSalvo.title = "Esta minuta foi excluída da lista de rascunhos";
      }
      feito && feito();
    };
    if (temStorage) chrome.storage.local.remove(k, fim);
    else fim();
  }

  // Exclusão por linha, delegada no container (as linhas são recriadas a cada
  // abertura). Dois cliques: 1º arma (o botão vira “Excluir?” vermelho, some em
  // 4 s), 2º confirma.
  function ligarExcluir(escopo) {
    const lista = escopo.querySelector(".drop-list, .lista-b");
    if (!lista) return;
    lista.addEventListener("click", (e) => {
      const btn = e.target.closest(".rdel");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest(".rrow");
      if (!row) return;
      if (btn.dataset.armado !== "1") {
        lista.querySelectorAll(".rdel.armado").forEach(desarmarLixo);
        btn.dataset.armado = "1";
        btn.classList.add("armado");
        btn.textContent = "Excluir?";
        btn._t = setTimeout(() => desarmarLixo(btn), 4000);
        return;
      }
      clearTimeout(btn._t);
      excluirRascunho(row.dataset.id, () => {
        row.classList.add("saindo");
        setTimeout(() => {
          row.remove();
          contarVisiveis(escopo);
        }, 170);
      });
    });
  }

  let dropAberto = false;
  function toggleDrop() {
    const drop = $("#drop");
    if (dropAberto) return fecharDrop();
    listarRascunhos((lista) => {
      const atualId = chave ? chave.slice("minuta:".length) : null;
      drop.innerHTML =
        (lista.length ? campoBusca(lista.length) : "") +
        '<div class="drop-list" role="menu" aria-label="Minutas guardadas">' +
        linhasRascunhos(lista, atualId) +
        "</div>";
      ligarBusca(drop);
      ligarExcluir(drop);
      drop.hidden = false;
      dropAberto = true;
      const inp = drop.querySelector(".rbusca-in");
      if (inp) inp.focus();
    });
  }
  function fecharDrop() {
    if (!dropAberto) return;
    $("#drop").hidden = true;
    dropAberto = false;
  }

  // Página sem ?id (ou minuta inexistente): a própria tela vira a lista.
  function mostrarListaCheia(aviso) {
    document.body.classList.add("modo-lista");
    elTitulo.value = "Minhas minutas";
    elTitulo.readOnly = true;
    elSub.textContent = "guardadas neste computador · apagadas após 7 dias";
    // O rodapé padrão fala de "Descartar" e de conferir citações — instruções
    // do EDITOR, sem sentido numa tela que só lista. Troca pelo que vale aqui.
    const nota = document.querySelector(".rodape-nota");
    if (nota) {
      nota.innerHTML =
        "As minutas ficam guardadas <b>apenas neste computador</b> e são apagadas " +
        "automaticamente após 7 dias (no máximo as 10 mais recentes).";
    }
    listarRascunhos((lista) => {
      if (!lista.length) {
        mostrarAviso(
          '<div class="lista-box">' +
            (aviso ? '<div class="lista-aviso">' + aviso + "</div>" : "") +
            vazioPaginaHtml() +
            "</div>"
        );
        return;
      }
      montarPainelMinutas(lista, aviso);
    });
  }

  // ------------------------------------------------- a página de minutas
  // Estado dos filtros. Vive fora do render porque `renderListaMinutas` é
  // chamada a cada mudança e reconstrói só a coluna da direita — o campo de
  // busca fica na coluna da ESQUERDA, fora do que é re-renderizado, e por isso
  // não perde o foco durante a digitação (era esse o motivo do antigo filtro
  // por `row.hidden`, que agora não é mais necessário).
  const filtro = { especie: "", processo: "", ordem: "recente", busca: "" };

  function aplicarFiltros(lista) {
    let out = lista.slice();
    if (filtro.especie) out = out.filter((r) => especieDaMinuta(r) === filtro.especie);
    if (filtro.processo) out = out.filter((r) => processoDaMinuta(r) === filtro.processo);
    if (filtro.busca) {
      const q = norm(filtro.busca.trim());
      if (q) out = out.filter((r) => textoBuscaMinuta(r).indexOf(q) !== -1);
    }
    const quando = (r) => r.atualizadoEm || r.criadoEm || 0;
    if (filtro.ordem === "antiga") out.sort((a, b) => quando(a) - quando(b));
    else if (filtro.ordem === "titulo")
      out.sort((a, b) => tituloUtil(a).localeCompare(tituloUtil(b), "pt-BR"));
    else if (filtro.ordem === "processo")
      out.sort(
        (a, b) =>
          String(a.processo || "~").localeCompare(String(b.processo || "~"), "pt-BR") ||
          quando(b) - quando(a)
      );
    else out.sort((a, b) => quando(b) - quando(a));
    return out;
  }

  // Agrupamento TEMPORAL. "Expirando em breve" vem primeiro e é o único ponto
  // em que a ordem cronológica é quebrada de propósito: ali o custo de não ver
  // é perder trabalho. Só se aplica na ordenação por recência — agrupar por
  // tempo uma lista em ordem alfabética não diria nada.
  function agruparMinutas(lista) {
    if (filtro.ordem !== "recente") return [{ titulo: "", itens: lista }];
    const agora = new Date();
    const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
    const ontem0 = hoje0 - 24 * H;
    const g = { expira: [], hoje: [], ontem: [], antes: [] };
    for (const r of lista) {
      const ts = r.atualizadoEm || r.criadoEm || 0;
      if (tempoRestante(ts).ms < 24 * H) g.expira.push(r);
      else if (ts >= hoje0) g.hoje.push(r);
      else if (ts >= ontem0) g.ontem.push(r);
      else g.antes.push(r);
    }
    return [
      { titulo: "Expirando em breve", itens: g.expira, urgente: true },
      { titulo: "Hoje", itens: g.hoje },
      { titulo: "Ontem", itens: g.ontem },
      { titulo: "Antes", itens: g.antes },
    ].filter((s) => s.itens.length);
  }

  function linhaCartao(r) {
    const ts = r.atualizadoEm || r.criadoEm || Date.now();
    const vida = tempoRestante(ts);
    const cat = CAT_ESPECIE[especieDaMinuta(r)] || "outro";
    const previa = previaMinuta(r);
    // "editada" separa o que foi trabalhado do que só foi gerado. 2 s de folga
    // porque o editor grava o HTML convertido logo na primeira abertura.
    const editada = (r.atualizadoEm || 0) > (r.criadoEm || 0) + 2000;
    return (
      '<div class="mcard" data-id="' + escaparTexto(r.id) + '">' +
      '<a class="mc-open" href="editor.html?id=' + encodeURIComponent(r.id) + '">' +
      '<div class="mc-top">' +
      '<span class="mc-esp cat-' + cat + '">' + escaparTexto(rotuloEspecie(r)) + "</span>" +
      '<span class="mc-vida n-' + vida.nivel + '">' + escaparTexto(vida.txt) + "</span>" +
      "</div>" +
      '<div class="mc-tit">' + escaparTexto(tituloUtil(r)) + "</div>" +
      '<div class="mc-meta">' +
      (r.processo ? '<span class="mc-proc">' + escaparTexto(r.processo) + "</span>" : "") +
      "<span>" + tempoRelativo(ts) + "</span>" +
      (editada ? '<span class="mc-ed">editada</span>' : "") +
      "</div>" +
      (previa ? '<div class="mc-previa">' + escaparTexto(previa) + "…</div>" : "") +
      // A barra só aparece quando resta MENOS de 48 h. Ela é um elemento de
      // alerta, e uma barra quase cheia em todos os cards é o que o DESIGN.md
      // chama de "tudo alerta com a mesma intensidade, nada alerta" — além de
      // se ler como um separador do cartão. O prazo calmo já vai no rótulo.
      (vida.nivel === "ok"
        ? ""
        : '<div class="mc-barra"><i class="n-' + vida.nivel +
          '" style="width:' + vida.pct.toFixed(1) + '%"></i></div>') +
      "</a>" +
      '<button class="rdel mc-del" type="button" title="Excluir esta minuta" ' +
      'aria-label="Excluir minuta">' + SVG_LIXO + "</button>" +
      "</div>"
    );
  }

  function opcoesFiltro(lista, chave, rotuloDe, atual) {
    const cont = new Map();
    for (const r of lista) {
      const v = chave(r);
      cont.set(v, (cont.get(v) || 0) + 1);
    }
    const itens = [...cont.entries()].sort((a, b) => b[1] - a[1]);
    // O contador em cada opção é o que responde "estou vendo tudo?" sem o
    // usuário precisar contar as linhas.
    const linha = (valor, rot, n) =>
      '<button type="button" class="mp-opt' + (atual === valor ? " on" : "") +
      '" data-v="' + escaparTexto(valor) + '"><span>' + escaparTexto(rot) +
      '</span><b>' + n + "</b></button>";
    return (
      linha("", "Todas", lista.length) +
      itens.map(([v, n]) => linha(v, rotuloDe(v), n)).join("")
    );
  }

  function montarPainelMinutas(lista, aviso) {
    const rotEsp = (v) => {
      if (v === SEM_ESPECIE) return "Sem espécie registrada";
      const r = lista.find((x) => especieDaMinuta(x) === v);
      return r ? rotuloEspecie(r) : v;
    };
    const html =
      '<div class="minutas-pg">' +
      (aviso ? '<div class="lista-aviso">' + aviso + "</div>" : "") +
      '<aside class="mp-filtros">' +
      '<div class="mp-busca">' + SVG_LUPA +
      '<input type="search" class="mp-busca-in" autocomplete="off" spellcheck="false" ' +
      'placeholder="Buscar no título, processo ou texto…" aria-label="Buscar minuta">' +
      "</div>" +
      '<div class="mp-grupo" data-f="especie"><div class="mp-h">Espécie</div>' +
      opcoesFiltro(lista, especieDaMinuta, rotEsp, filtro.especie) + "</div>" +
      '<div class="mp-grupo" data-f="processo"><div class="mp-h">Processo</div>' +
      opcoesFiltro(lista, processoDaMinuta, (v) => (v === SEM_PROCESSO ? "Sem processo" : v),
        filtro.processo) +
      "</div>" +
      '<div class="mp-grupo"><div class="mp-h">Ordenar</div>' +
      '<select class="mp-ordem" aria-label="Ordenar as minutas">' +
      '<option value="recente">Mais recentes</option>' +
      '<option value="antiga">Mais antigas</option>' +
      '<option value="processo">Por processo</option>' +
      '<option value="titulo">Por título (A–Z)</option>' +
      "</select></div>" +
      // O teto é a resposta à pergunta "está tudo aqui?". Não há paginação
      // porque não pode haver mais de 10: paginar daria sensação de
      // completude sem a informação.
      '<div class="mp-teto"><b>' +
      // "12 de 10" seria aritmética estranha, e o estado existe: a poda roda a
      // cada gravação, então entre uma e outra a lista pode passar do teto.
      (lista.length > MAX_MINUTAS_UI
        ? lista.length + " guardadas"
        : lista.length + " de " + MAX_MINUTAS_UI + " guardadas") +
      "</b>" +
      (lista.length > MAX_MINUTAS_UI
        ? "<span>Acima do limite de " + MAX_MINUTAS_UI +
          ": as mais antigas serão apagadas na próxima gravação.</span>"
        : lista.length === MAX_MINUTAS_UI
        ? "<span>O limite está cheio: a próxima minuta apaga a mais antiga.</span>"
        : "<span>Guardo as " + MAX_MINUTAS_UI +
          " mais recentes; cada uma some 7 dias depois de editada.</span>") +
      '<button type="button" class="mp-ajuda">Como funciona →</button></div>' +
      "</aside>" +
      '<div class="mp-lista"></div>' +
      "</div>";
    mostrarAviso(html);
    const raiz = elAviso.querySelector(".minutas-pg");
    if (!raiz) return;
    const alvo = raiz.querySelector(".mp-lista");
    const inp = raiz.querySelector(".mp-busca-in");
    const ordem = raiz.querySelector(".mp-ordem");
    ordem.value = filtro.ordem;

    function render() {
      const vis = aplicarFiltros(lista);
      if (!vis.length) {
        alvo.innerHTML =
          '<div class="mp-vazio">Nenhuma minuta corresponde aos filtros.' +
          '<button type="button" class="mp-limpar">Limpar filtros</button></div>';
        return;
      }
      alvo.innerHTML = agruparMinutas(vis)
        .map(
          (s) =>
            (s.titulo
              ? '<div class="mp-sec' + (s.urgente ? " urgente" : "") + '">' +
                "<span>" + escaparTexto(s.titulo) + "</span><b>" + s.itens.length + "</b></div>"
              : "") + s.itens.map(linhaCartao).join("")
        )
        .join("");
    }
    render();

    let tBusca = 0;
    inp.addEventListener("input", () => {
      clearTimeout(tBusca);
      tBusca = setTimeout(() => {
        filtro.busca = inp.value;
        render();
      }, 140);
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && inp.value) {
        e.stopPropagation();
        inp.value = "";
        filtro.busca = "";
        render();
      }
    });
    ordem.addEventListener("change", () => {
      filtro.ordem = ordem.value;
      render();
    });
    // Filtros delegados: as opções são recriadas quando uma minuta é excluída.
    raiz.addEventListener("click", (e) => {
      const opt = e.target.closest(".mp-opt");
      if (opt) {
        const grupo = opt.closest(".mp-grupo");
        const qual = grupo && grupo.dataset.f;
        if (!qual) return;
        filtro[qual] = opt.dataset.v;
        grupo.querySelectorAll(".mp-opt").forEach((b) => b.classList.remove("on"));
        opt.classList.add("on");
        render();
        return;
      }
      if (e.target.closest(".mp-limpar")) {
        filtro.especie = "";
        filtro.processo = "";
        filtro.busca = "";
        inp.value = "";
        raiz.querySelectorAll(".mp-opt").forEach((b) =>
          b.classList.toggle("on", b.dataset.v === "")
        );
        render();
        return;
      }
      if (e.target.closest(".mp-ajuda")) {
        try {
          window.open("help.html#resolucao615", "_blank", "noopener");
        } catch (err) {
          /* fora da extensão */
        }
      }
    });
    // Exclusão em dois cliques, como no dropdown. A lista é remontada do zero
    // depois (os contadores dos filtros e o "N de 10" mudam junto) — sem isso
    // a coluna da esquerda passaria a mentir sobre o que sobrou.
    alvo.addEventListener("click", (e) => {
      const btn = e.target.closest(".rdel");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest(".mcard");
      if (!card) return;
      if (btn.dataset.armado !== "1") {
        alvo.querySelectorAll(".rdel.armado").forEach(desarmarLixo);
        btn.dataset.armado = "1";
        btn.classList.add("armado");
        btn.textContent = "Excluir?";
        btn._t = setTimeout(() => desarmarLixo(btn), 4000);
        return;
      }
      clearTimeout(btn._t);
      excluirRascunho(card.dataset.id, () => {
        card.classList.add("saindo");
        setTimeout(() => mostrarListaCheia(""), 170);
      });
    });
  }

  // --------------------------------------------------- origem da minuta
  // A orientação que gerou o texto, mostrada a quem vai revisar. É o registro
  // que os arts. 19, §6º e 21, §2º da Resolução CNJ 615/2025 pedem — e, na
  // prática, é o que permite a quem abre a minuta dias depois saber com que
  // tese ela foi pedida, em vez de ter de inferir do texto.
  //
  // Fica FORA da folha e não entra no "Copiar formatado" nem no .docx: o que
  // vai ao PJe é o ato. Recolhida por padrão — quem já sabe a tese não precisa
  // relê-la a cada abertura.
  //
  // Minutas gravadas ANTES desta versão não têm o campo: sem `d.origem` a
  // faixa simplesmente não aparece e a tela fica a de antes.
  function mostrarOrigem(d) {
    const o = d && d.origem;
    const box = document.getElementById("origem");
    if (!box) return;
    if (!o || !(o.tese || o.rotulo)) {
      box.hidden = true;
      return;
    }
    box.textContent = "";
    const sum = document.createElement("summary");
    const forte = document.createElement("b");
    forte.textContent = o.rotulo || "Minuta";
    sum.appendChild(forte);
    sum.appendChild(
      document.createTextNode(
        o.tese
          ? " · gerada a partir da sua " +
            (o.regime === "sentido" ? "determinação" : "tese")
          : " · gerada com auxílio de IA"
      )
    );
    box.appendChild(sum);
    if (o.tese) {
      const p = document.createElement("blockquote");
      p.className = "og-tese";
      p.textContent = o.tese; // conteúdo do usuário: textContent, nunca innerHTML
      box.appendChild(p);
    }
    const pe = document.createElement("p");
    pe.className = "og-meta";
    pe.textContent =
      "Texto produzido com auxílio de IA" +
      (o.modelo ? " (" + o.modelo + ")" : "") +
      (o.modelosQtd ? ", seguindo " + o.modelosQtd + " modelo(s) seus" : "") +
      ". Revise e assine: a responsabilidade pelo ato continua sendo de quem o assina.";
    box.appendChild(pe);
    box.hidden = false;
  }

  // ------------------------------------------ reidentificação (modo sigiloso)
  // A minuta gerada em modo sigiloso chega com [PESSOA_1] no lugar dos nomes.
  // A tabela que desfaz isso vive no casodb do WORKER, por processo; a página
  // a pede pela chave do caso gravada com a minuta e troca os rótulos nos NÓS
  // DE TEXTO do documento (nunca por replace no HTML: um nome com "<" quebraria
  // a marcação). Grava o resultado como qualquer edição. É o único caminho
  // pelo qual o nome volta ao documento — e ele fica neste computador.
  const RE_ROTULO_ANON = /\[[A-Z][A-Z0-9]*_\d+\]/;
  function prepararReidentificacao(d) {
    const btn = document.getElementById("reid");
    if (!btn) return;
    const corpo = String((d && (d.html || d.md)) || "");
    if (!d || !d.casoChave || !RE_ROTULO_ANON.test(corpo) || typeof PSEUD === "undefined") {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.onclick = () => {
      btn.disabled = true;
      chrome.runtime.sendMessage({ type: "casoLer", chave: d.casoChave }, (r) => {
        btn.disabled = false;
        const g = r && r.ok && r.caso && r.caso.sigilo && r.caso.sigilo.mapa;
        if (!g) {
          elSalvo.className = "salvo";
          elSalvo.textContent = "tabela de reidentificação não encontrada neste computador";
          return;
        }
        const mapa = PSEUD.hidratar(g);
        const doc = new DOMParser().parseFromString("<div id=\"r\">" + editor.value + "</div>", "text/html");
        const raiz = doc.getElementById("r");
        const walker = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        let trocados = 0;
        let semMapa = 0;
        let no;
        while ((no = walker.nextNode())) {
          if (!RE_ROTULO_ANON.test(no.nodeValue)) continue;
          const res = PSEUD.reidentificar(no.nodeValue, mapa);
          trocados += res.trocados || 0;
          semMapa += res.desconhecidos || 0;
          no.nodeValue = res.texto;
        }
        editor.value = raiz.innerHTML;
        salvar();
        elSalvo.className = "salvo ok";
        elSalvo.textContent =
          trocados + " nome(s) restaurado(s)" +
          (semMapa ? " · " + semMapa + " rótulo(s) sem correspondência" : "");
        if (!RE_ROTULO_ANON.test(editor.value)) btn.hidden = true;
      });
    };
  }

  // ------------------------------------------------------------------ Jodit

  function montarEditor(html) {
    editor = Jodit.make("#ed", {
      language: "pt_br",
      theme: "default",
      toolbar: "#barra", // barra fora da folha — ver o comentário no editor.html
      toolbarAdaptive: false,
      toolbarSticky: false,
      statusbar: false,
      spellcheck: true,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      defaultActionOnPaste: "insert_clear_html",
      minHeight: 700,
      // A CSP da extensão (script-src 'self') proíbe carregar scripts externos.
      // O modo código do Jodit (botão "source") puxa o "ace" de cdnjs e o
      // beautify puxa "js-beautify" — os dois seriam bloqueados. Desligamos
      // ambos: o editor de minutas é WYSIWYG puro, sem visão de HTML cru.
      beautifyHTML: false,
      sourceEditor: "area",
      // Sem imagem, vídeo, emoji, upload nem código-fonte: isto é uma peça.
      buttons: [
        "undo", "redo", "|",
        "paragraph", "|",
        "bold", "italic", "underline", "strikethrough", "|",
        "left", "center", "right", "justify", "|",
        "ul", "ol", "indent", "outdent", "|",
        "table", "link", "|",
        "find", "eraser",
      ],
      controls: {
        paragraph: {
          list: {
            p: "Parágrafo",
            h1: "Título do ato",
            h2: "Seção",
            h3: "Subseção",
            blockquote: "Citação recuada",
          },
        },
      },
    });
    editor.value = html || "<p></p>";
    editor.events.on("change", agendarSalvar);
    return editor;
  }

  // ---------------------------------------------------------------- exportar

  async function copiarFormatado(btn) {
    const html = editor.value;
    const texto = editor.text || "";
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        }),
      ]);
      piscar(btn, "Copiado");
    } catch (e) {
      // Sem permissão de clipboard ou sem gesto: cai no caminho antigo, que
      // funciona porque a seleção é feita na própria página.
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.setAttribute("contenteditable", "true");
      tmp.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre-wrap";
      document.body.appendChild(tmp);
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(tmp);
      sel.removeAllRanges();
      sel.addRange(r);
      const ok = document.execCommand("copy");
      sel.removeAllRanges();
      tmp.remove();
      piscar(btn, ok ? "Copiado" : "Falhou");
    }
  }

  async function baixarDocx(btn) {
    btn.disabled = true;
    // MESMO cuidado do piscar() logo acima: o botão é <svg> + <span>, e escrever
    // no BOTÃO apaga o ícone — de forma permanente, porque a restauração devolve
    // só o texto e o <svg> não volta. Sem isto, o ícone do "Baixar .docx" some no
    // primeiro clique e o piscar() seguinte já nem acha o <span> para restaurar.
    const alvo = btn.querySelector("span") || btn;
    const antes = alvo.textContent;
    alvo.textContent = "gerando…";
    try {
      const blob = await EditorDocx.gerarBlob(editor.value, elTitulo.value);
      baixar(blob, nomeArquivo(".docx"));
      alvo.textContent = antes;
      piscar(btn, "Baixado");
    } catch (e) {
      console.error("[PJe IA] falha ao gerar .docx", e);
      alvo.textContent = antes;
      piscar(btn, "Falhou");
    } finally {
      btn.disabled = false;
    }
  }

  function descartar(btn) {
    // Exclusão em dois cliques, como na biblioteca de prompts: confirm() nativo
    // é o tipo de diálogo que trava a página.
    if (btn.dataset.armado !== "1") {
      btn.dataset.armado = "1";
      btn.textContent = "Descartar?";
      btn.classList.add("feito");
      setTimeout(() => {
        if (btn.dataset.armado !== "1") return;
        btn.dataset.armado = "";
        btn.textContent = "Descartar";
        btn.classList.remove("feito");
      }, 4000);
      return;
    }
    clearTimeout(tSalvar);
    const fim = () => {
      chave = null;
      if (editor) editor.destruct();
      mostrarAviso(
        "<b>Rascunho descartado.</b><div>Pode fechar esta aba. " +
          "A conversa no painel do PJe continua lá.</div>"
      );
    };
    if (temStorage && chave) chrome.storage.local.remove(chave, fim);
    else fim();
  }

  function ligarBotoes() {
    $("#copiar").addEventListener("click", (e) => copiarFormatado(e.currentTarget));
    $("#docx").addEventListener("click", (e) => baixarDocx(e.currentTarget));
    $("#imprimir").addEventListener("click", () => window.print());
    $("#descartar").addEventListener("click", (e) => descartar(e.currentTarget));
    $("#rascunhos").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDrop();
    });
    // clique fora / Esc fecham o dropdown
    document.addEventListener("click", (e) => {
      if (dropAberto && !e.target.closest(".drop-wrap")) fecharDrop();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharDrop();
    });
    elTitulo.addEventListener("input", agendarSalvar);
    // Ctrl+S é reflexo de quem escreve: salva na hora em vez de abrir o
    // "salvar página" do Chrome.
    document.addEventListener("keydown", (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        clearTimeout(tSalvar);
        salvar();
      }
    });
  }

  // ------------------------------------------------------------------ início

  ligarBotoes();

  const id = new URLSearchParams(location.search).get("id");

  if (!temStorage) {
    // Modo de teste fora da extensão (HTTP local): sobe o editor vazio.
    elSub.textContent = "modo de teste — sem persistência";
    montarEditor("<h1>Minuta</h1><p>Editor em modo de teste.</p>");
  } else if (!id) {
    // Sem identificador: a página vira a lista de rascunhos (recuperação).
    mostrarListaCheia("");
  } else {
    chave = "minuta:" + id;
    chrome.storage.local.get(chave, (res) => {
      const d = res && res[chave];
      if (!d || !(d.html || d.md)) {
        chave = null;
        mostrarListaCheia(
          "<b>Esta minuta não está mais guardada.</b> Rascunhos são apagados " +
            "depois de 7 dias. Abaixo, as que ainda estão disponíveis:"
        );
        return;
      }
      dados = d;
      elTitulo.value = d.titulo || "Minuta";
      document.title = elTitulo.value + " — TecJustiça PJe";
      elSub.textContent = d.processo ? "Processo " + d.processo : "";
      elSalvo.className = "salvo ok";
      elSalvo.textContent = "salvo " + horaCurta(d.atualizadoEm || d.criadoEm || Date.now());
      mostrarOrigem(d);
      prepararReidentificacao(d);
      // HTML editado tem prioridade; na primeira abertura, converte o Markdown
      // cru com o parser dedicado e grava o HTML de volta.
      if (d.html) {
        montarEditor(d.html);
      } else {
        montarEditor(MinutaMd.paraHtml(d.md));
        salvar(); // persiste o HTML convertido para as próximas aberturas
      }
    });
  }
})();
