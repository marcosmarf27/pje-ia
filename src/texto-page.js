// ---------------------------------------------------------------------------
// PJe IA — página de leitura do TEXTO EXTRAÍDO de uma peça.
//
// O popover do painel serve para conferir uma folha; um inquérito tem 142. Aqui
// dá para buscar, pular de folha em folha, copiar e baixar. Sem ?k, a página
// vira a LISTA de tudo que já foi extraído (mesmo truque do modo-lista do
// editor.html: sem uma porta de entrada, os registros ficariam órfãos no disco).
//
// Camada de dados: o MESMO TEXTOLIB do content script — o que se muda aqui
// aparece no painel na hora, via aoMudar, sem RPC nenhuma.
// ---------------------------------------------------------------------------
(function () {
  var $ = function (s) {
    return document.querySelector(s);
  };
  var params = new URLSearchParams(location.search);
  var chave = params.get("k");

  var elTitulo = $("#titulo");
  var elSub = $("#subtitulo");
  var elAcoes = $("#acoes");
  var elLista = $("#lista");
  var elTelaLista = $("#telaLista");
  var elTelaTexto = $("#telaTexto");
  var elCorpo = $("#corpo");
  var elAviso = $("#aviso");
  var elBusca = $("#busca");
  var elAchados = $("#achados");
  var elFlNum = $("#flNum");
  var elFlTot = $("#flTot");
  var elRodape = $("#rodapeTxt");
  var elComparar = $("#comparar");
  var elTelaPdf = $("#telaPdf");
  var elPdfBox = $("#pdfBox");
  var elHdTexto = $("#hdTexto");

  var reg = null;
  var blobUrl = null; // no máximo UM vivo; revogado ao trocar/fechar

  function avisar(t) {
    elAviso.textContent = t;
    elAviso.hidden = false;
  }

  // O texto vem dos autos: escape-first, sempre. O MinutaMd é o renderizador de
  // DOCUMENTO do projeto (o renderMd do painel é de balão de chat: achata
  // listas e junta parágrafos com <br>) e mantém a ordem escape → formata.
  function html(md) {
    try {
      return MinutaMd.paraHtml(md);
    } catch (e) {
      var d = document.createElement("div");
      d.textContent = md;
      return d.innerHTML;
    }
  }

  // --- modo LISTA ------------------------------------------------------------
  function montarLista() {
    document.title = "Textos extraídos — TecJustiça PJe";
    elTitulo.textContent = "Textos extraídos";
    elSub.textContent = "guardados neste computador · apagados após 7 dias";
    elTelaLista.hidden = false;
    // O rodapé padrão fala de conferir o documento original de UMA peça; numa
    // tela que só lista, ele não faz sentido.
    elRodape.innerHTML =
      "Cada item abaixo é o texto que a extensão extraiu de uma peça. Eles são " +
      "apagados automaticamente após 7 dias ou quando o espaço acaba.";
    TEXTOLIB.listar(function (regs) {
      if (!regs.length) {
        elLista.innerHTML =
          '<div class="vazio"><p><b>Nenhum texto extraído ainda.</b></p>' +
          "<p>Na tela de autos do PJe, passe o mouse sobre uma peça e use " +
          "<b>Extrair o texto</b>. Peças com texto nativo são lidas no seu " +
          "próprio navegador, sem custo.</p></div>";
        return;
      }
      elLista.innerHTML = "";
      regs.forEach(function (r) {
        var a = document.createElement("a");
        a.className = "item";
        a.href = "texto.html?k=" + encodeURIComponent(r.chave);
        var t = document.createElement("b");
        t.textContent = r.titulo || String(r.peca); // conteúdo dos autos
        a.appendChild(t);
        var m = document.createElement("span");
        m.className = "meta";
        m.textContent =
          (r.paginas || 0) + " folha(s) · " +
          (r.fonte === "mistral" ? "OCR" : "leitura local") +
          (r.usar ? " · em uso na análise" : "") +
          " · " + new Date(r.em || 0).toLocaleDateString("pt-BR");
        a.appendChild(m);
        elLista.appendChild(a);
      });
    });
  }

  // --- modo TEXTO ------------------------------------------------------------
  function montarTexto() {
    elTelaTexto.hidden = false;
    elAcoes.hidden = false;
    var nome = reg.titulo || String(reg.peca);
    document.title = nome + " — texto extraído";
    elTitulo.textContent = nome;
    elSub.textContent =
      (reg.paginas || 0) + " folha(s) · " +
      (reg.fonte === "mistral" ? "extraído por OCR" : "lido no seu navegador") +
      (reg.custoUsd
        ? " · US$ " +
          reg.custoUsd.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 3,
          })
        : "");
    elFlTot.textContent = "de " + (reg.paginas || 0);
    elFlNum.max = String(reg.paginas || 1);

    elCorpo.innerHTML = "";
    (reg.folhas || []).forEach(function (f) {
      // Fatia pelo MESMO mapa de offsets que reconstrói a folha nas citações:
      // o que se lê aqui é exatamente o que o modelo recebeu.
      var bruto = reg.md.slice(f.ini, f.fim).replace(/^\[fl\. \d+\]\n?/, "");
      var sec = document.createElement("section");
      sec.className = "folha";
      sec.id = "fl-" + f.p;
      var h = document.createElement("h4");
      h.textContent = "fl. " + f.p;
      sec.appendChild(h);
      var div = document.createElement("div");
      div.className = "folha-txt";
      div.innerHTML = bruto.trim() ? html(bruto) : '<p class="vazia">(folha sem texto)</p>';
      sec.appendChild(div);
      elCorpo.appendChild(sec);
    });
  }

  // --- comparação lado a lado ------------------------------------------------
  //
  // O texto extraído só é confiável se der para conferir contra o original — e
  // conferir alternando de aba é o mesmo que não conferir. O binário da peça
  // vive no docsCache da aba do PJe (memória do content script), então ele
  // viaja por `chrome.storage.session` sob uma chave ÚNICA e sobrescrita
  // (`cmp:pdf`): um por vez, sem acumular na cota de 10 MB.
  var CHAVE_CMP = "cmp:pdf";

  function fecharComparacao() {
    elTelaPdf.hidden = true;
    elHdTexto.hidden = true;
    document.body.classList.remove("comparando");
    elPdfBox.innerHTML = "";
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    if (elComparar) elComparar.textContent = "Comparar com o original";
  }

  function b64ParaBlob(b64) {
    var bin = atob(b64);
    var n = bin.length;
    var buf = new Uint8Array(n);
    for (var i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: "application/pdf" });
  }

  function abrirComparacao() {
    chrome.storage.session.get(CHAVE_CMP, function (v) {
      var pacote = v && v[CHAVE_CMP];
      // Só serve se for O PDF DESTA peça: a chave é única e sobrescrita, então
      // um pacote de outra peça significa que o usuário abriu outra no meio.
      if (!pacote || !pacote.b64 || pacote.chave !== chave) {
        elPdfBox.innerHTML =
          '<div class="pdf-miss"><p><b>O documento original não está disponível nesta aba.</b></p>' +
          "<p>Na tela do processo, passe o mouse sobre a peça e use " +
          "<b>Comparar com o original</b> — o PDF é enviado junto.</p></div>";
      } else {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(b64ParaBlob(pacote.b64));
        var emb = document.createElement("embed");
        emb.type = "application/pdf";
        emb.src = blobUrl; // toolbar NATIVA do Chrome: zoom e navegação de graça
        elPdfBox.innerHTML = "";
        elPdfBox.appendChild(emb);
      }
      elTelaPdf.hidden = false;
      elHdTexto.hidden = false;
      document.body.classList.add("comparando");
      if (elComparar) elComparar.textContent = "Fechar comparação";
    });
  }

  function ligarComparacao() {
    if (!elComparar) return;
    elComparar.hidden = false;
    elComparar.addEventListener("click", function () {
      if (document.body.classList.contains("comparando")) fecharComparacao();
      else abrirComparacao();
    });
    var fechar = $("#fecharPdf");
    if (fechar) fechar.addEventListener("click", fecharComparacao);
    // Abre já comparando quando veio do botão do painel — o gesto do usuário
    // foi "quero comparar", não "quero ler".
    if (params.get("cmp") === "1") abrirComparacao();
  }

  function irParaFolha(p) {
    var el = document.getElementById("fl-" + p);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    elFlNum.value = String(p);
  }

  // --- busca -----------------------------------------------------------------
  // Destaque aplicado sobre os NÓS DE TEXTO já renderizados (TreeWalker), nunca
  // por replace no HTML: um replace corromperia atributos e tags.
  var marcados = [];
  function limparMarcas() {
    marcados.forEach(function (m) {
      var pai = m.parentNode;
      if (!pai) return;
      pai.replaceChild(document.createTextNode(m.textContent), m);
      pai.normalize();
    });
    marcados = [];
  }

  function buscar(q) {
    limparMarcas();
    if (!q || q.length < 2) {
      elAchados.textContent = "";
      return;
    }
    var alvo = q.toLowerCase();
    var walker = document.createTreeWalker(elCorpo, NodeFilter.SHOW_TEXT, null);
    var nos = [];
    var n;
    while ((n = walker.nextNode())) nos.push(n);
    var total = 0;
    nos.forEach(function (no) {
      var txt = no.nodeValue;
      var baixo = txt.toLowerCase();
      if (baixo.indexOf(alvo) < 0) return;
      var frag = document.createDocumentFragment();
      var i = 0;
      var j;
      while ((j = baixo.indexOf(alvo, i)) >= 0) {
        if (j > i) frag.appendChild(document.createTextNode(txt.slice(i, j)));
        var mk = document.createElement("mark");
        mk.textContent = txt.slice(j, j + alvo.length);
        frag.appendChild(mk);
        marcados.push(mk);
        total++;
        i = j + alvo.length;
      }
      if (i < txt.length) frag.appendChild(document.createTextNode(txt.slice(i)));
      no.parentNode.replaceChild(frag, no);
    });
    elAchados.textContent = total ? total + " achado(s)" : "nada encontrado";
    if (marcados.length) marcados[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // --- ações ------------------------------------------------------------------
  function ligarAcoes() {
    var t;
    elBusca.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        buscar(elBusca.value.trim());
      }, 220);
    });
    elFlNum.addEventListener("change", function () {
      irParaFolha(Math.max(1, Math.min(reg.paginas || 1, parseInt(elFlNum.value, 10) || 1)));
    });
    $("#flAnt").addEventListener("click", function () {
      irParaFolha(Math.max(1, (parseInt(elFlNum.value, 10) || 1) - 1));
    });
    $("#flProx").addEventListener("click", function () {
      irParaFolha(Math.min(reg.paginas || 1, (parseInt(elFlNum.value, 10) || 1) + 1));
    });
    $("#copiar").addEventListener("click", function () {
      var b = $("#copiar");
      navigator.clipboard.writeText(reg.md).then(
        function () {
          b.textContent = "Copiado!";
          setTimeout(function () {
            b.textContent = "Copiar";
          }, 1400);
        },
        function () {
          b.textContent = "Falhou";
        }
      );
    });
    $("#baixar").addEventListener("click", function () {
      var nome = (reg.titulo || String(reg.peca)).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
      var url = URL.createObjectURL(new Blob([reg.md], { type: "text/markdown;charset=utf-8" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = nome + ".md";
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 30000);
    });
  }

  // --- boot -------------------------------------------------------------------
  if (typeof TEXTOLIB === "undefined") {
    avisar("Não foi possível abrir o armazenamento da extensão.");
    return;
  }
  if (!chave) {
    montarLista();
    return;
  }
  chrome.storage.local.get(chave, function (v) {
    reg = v && v[chave];
    if (!reg || !reg.md) {
      avisar(
        "Este texto não está mais guardado. Ele pode ter sido apagado pela limpeza " +
          "automática (7 dias) ou para liberar espaço. Extraia de novo na tela do processo."
      );
      elTitulo.textContent = "Texto não encontrado";
      elSub.textContent = "";
      return;
    }
    montarTexto();
    ligarAcoes();
    ligarComparacao();
  });
})();
