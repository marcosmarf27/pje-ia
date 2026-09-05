// ---------------------------------------------------------------------------
// Página "Meus modelos de peças" (src/modelos.html).
//
// Por que existe, se o painel do PJe já tem o modal .mlib: cadastrar modelos é
// tarefa de PREPARAÇÃO — feita uma vez, sentado, com as peças-referência em
// mãos —, não algo que se faça no meio da análise de um processo. Exigir uma
// aba de autos aberta só para cadastrar era uma dependência artificial.
//
// A camada de DADOS é a mesma (MLIB, de modelos.js): esta página só desenha uma
// UI de tela cheia sobre ela. Nada de esquema novo, e o que se cadastra aqui
// aparece no painel na hora (MLIB.aoMudar propaga pelo storage.onChanged).
// ---------------------------------------------------------------------------
(() => {
  const $ = (s) => document.querySelector(s);
  const temMlib = typeof MLIB !== "undefined";

  const elLista = $("#lista");
  const elTelaLista = $("#telaLista");
  const elTelaForm = $("#telaForm");
  const elTelaImportar = $("#telaImportar");
  const elBarraBusca = $("#barraBusca");
  const elBusca = $("#busca");
  const elCont = $("#contador");
  const elChips = $("#chips");
  const elPrevia = $("#previa");
  const elFormTit = $("#formTit");
  const elFT = $("#fTitulo");
  const elFC = $("#fCategoria");
  const elFD = $("#fDescricao");
  const elFX = $("#fTexto");
  const elChars = $("#contChars");
  const elErro = $("#formErro");

  let modelos = [];
  let editId = null;
  let idNovo = "";
  let delArm = null; // id com exclusão "armada" (dois cliques)
  let catAtiva = ""; // chip de espécie ligado; "" = todas
  let previaId = null; // modelo aberto na coluna da direita
  let aposForm = null; // callback ao sair do formulário (usado pela importação)

  // --- estado e nós da IMPORTAÇÃO EM LOTE (o bloco de código está lá embaixo) ---
  // Declarados AQUI, junto do resto do estado, e não no bloco que os usa:
  // `mostrarTela`/`fecharForm` correm antes dele no arquivo, e um `let` lido por
  // callback antes de ser inicializado lança "Cannot access before
  // initialization" — a armadilha da zona morta temporal do CLAUDE.md.
  const elArquivos = $("#arquivos");
  const elDrop = $("#impDrop");
  const elProg = $("#impProg");
  const elProgTxt = $("#impProgTxt");
  const elBarraI = $("#impBarraI");
  const elFichas = $("#impFichas");
  const elImpAcoes = $("#impAcoes");
  const elImpAcoesFim = $("#impAcoesFim");
  const elImpCadastrar = $("#impCadastrar");
  const elImpCancelar = $("#impCancelar");
  const elImpRes = $("#impRes");
  const btnImportarLote = $("#importarLote");
  const temDocx = typeof DocxImport !== "undefined";
  let impFichas = [];
  let impFalhas = []; // {nome, erro} — arquivos que não puderam ser lidos
  let impSinal = null;
  let impLendo = false;
  let impDescarteArm = false;
  // `dragleave` dispara ao cruzar CADA filho da zona; contar entradas e saídas
  // é o único jeito confiável de saber quando o ponteiro realmente saiu.
  let profundidade = 0;
  let guardaLigada = false;

  // ------------------------------------------------------------- utilidades
  function escapar(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  const norm = (s) =>
    String(s == null ? "" : s).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

  function previa(texto) {
    const t = String(texto || "").replace(/\s+/g, " ").trim();
    return t.length > 110 ? t.slice(0, 110) + "…" : t;
  }

  function quando(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ----------------------------------------------------------------- lista
  function vazioHtml() {
    return (
      '<div class="vazio-pg">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
      '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
      '<path d="M9 7h7M9 11h5"/></svg>' +
      '<div class="vt">Nenhum modelo cadastrado ainda</div>' +
      '<div class="vd">Cadastre as suas peças-modelo — sentenças, decisões, despachos, ' +
      "ofícios — e, ao gerar uma minuta, o assistente segue a <b>estrutura</b> e o estilo " +
      "delas. Os fatos continuam saindo apenas das peças do processo em tela.<br><br>" +
      "Se você já tem essas peças no Word (.docx) ou em RTF, <b>Importar</b> lê várias de uma vez " +
      "e deixa tudo preenchido para você conferir.</div>" +
      "</div>"
    );
  }

  // A lista é AGRUPADA por categoria, na ordem de MLIB.CATEGORIAS. Repetir a
  // etiqueta da espécie em cada linha fazia um rótulo em caixa alta ("DECISÕES,
  // VOTOS E ACÓRDÃOS") competir com o título, que é o que se procura de fato. E
  // a categoria é justamente o eixo em que se pensa aqui — a minuta seleciona os
  // modelos POR categoria —, então ela vale como cabeçalho de seção, uma vez só.
  // Tamanho em KB do que vai ao contexto da minuta. É o único número desta tela
  // que o usuário não tem como estimar de olho, e ele importa: a minuta manda
  // TODOS os modelos da categoria, e o teto de contexto é por categoria.
  function tamanho(texto) {
    const b = new TextEncoder().encode(String(texto || "")).length;
    return b < 1024 ? b + " B" : (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
  }

  function linhaHtml(m) {
    const sub = m.descricao || previa(m.texto);
    const cat = temMlib ? MLIB.rotuloCategoria(m.categoria) : "";
    const val = m.categoria || "outro";
    const busca = norm(m.titulo + " " + cat + " " + (m.descricao || ""));
    return (
      '<div class="mrow" data-id="' + escapar(m.id) + '" data-busca="' + escapar(busca) + '" ' +
      'data-cat="' + escapar(val) + '" ' +
      'tabindex="0" role="button" aria-label="Ver ' + escapar(m.titulo) + '">' +
      '<div class="info">' +
      '<span class="mt">' + escapar(m.titulo) + "</span>" +
      '<span class="mm">' + escapar(sub) + "</span>" +
      // SEM badge de categoria, e nao por esquecimento: a lista ja e AGRUPADA
      // por ela (o cabecalho da secao a diz uma vez), e pintar as especies de
      // ato criaria um segundo vocabulario de cores ao lado do --cat-* do
      // painel, que ja significa outra coisa — a categoria da PECA do processo.
      '<span class="mmeta">' +
      (m.atualizadoEm ? "<span>" + quando(m.atualizadoEm) + "</span>" : "") +
      "<span>" + tamanho(m.texto) + "</span>" +
      "</span>" +
      "</div>" +
      '<div class="acts">' +
      '<button class="edit" type="button">Editar</button>' +
      '<button class="del" type="button">Excluir</button>' +
      "</div></div>"
    );
  }

  // ----------------------------------------------------- chips de categoria
  function renderChips() {
    if (!elChips || !temMlib) return;
    const conta = (v) => modelos.filter((m) => (m.categoria || "outro") === v).length;
    let html =
      '<button type="button" class="mp-chip" data-cat="" aria-pressed="' +
      (catAtiva ? "false" : "true") + '">Todas<span class="cn">' + modelos.length + "</span></button>";
    for (const c of MLIB.CATEGORIAS) {
      const n = conta(c.valor);
      html +=
        '<button type="button" class="mp-chip' + (n ? "" : " vazio") + '" data-cat="' +
        escapar(c.valor) + '" aria-pressed="' + (catAtiva === c.valor ? "true" : "false") + '">' +
        escapar(c.rotulo) + '<span class="cn">' + n + "</span></button>";
    }
    elChips.innerHTML = html;
    elChips.hidden = false;
  }

  // ------------------------------------------------------- pré-visualização
  // `textContent` no corpo, NUNCA innerHTML: o texto veio de um .docx do
  // usuário e pode conter qualquer coisa. Mesma regra da ficha de importação.
  function mostrarPrevia(id) {
    if (!elPrevia) return;
    const m = modelos.find((x) => x.id === id);
    if (!m) {
      elPrevia.hidden = true;
      elPrevia.textContent = "";
      previaId = null;
      return;
    }
    previaId = id;
    elPrevia.textContent = "";
    const hd = document.createElement("div");
    hd.className = "pv-hd";
    const t = document.createElement("h2");
    t.className = "pv-t";
    t.textContent = m.titulo;
    const meta = document.createElement("div");
    meta.className = "pv-meta";
    meta.textContent =
      (temMlib ? MLIB.rotuloCategoria(m.categoria) : "") +
      (m.atualizadoEm ? " · " + quando(m.atualizadoEm) : "") +
      " · " + tamanho(m.texto);
    hd.appendChild(t);
    hd.appendChild(meta);
    if (m.descricao) {
      const d = document.createElement("div");
      d.className = "pv-desc";
      d.textContent = m.descricao;
      hd.appendChild(d);
    }
    const corpo = document.createElement("pre");
    corpo.className = "pv-corpo";
    corpo.textContent = m.texto || "";
    const acts = document.createElement("div");
    acts.className = "pv-acts";
    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "primario";
    ed.textContent = "Editar";
    ed.addEventListener("click", () => abrirForm(m));
    const fe = document.createElement("button");
    fe.type = "button";
    fe.className = "ghost";
    fe.textContent = "Fechar";
    fe.addEventListener("click", () => mostrarPrevia(null));
    acts.appendChild(ed);
    acts.appendChild(fe);
    elPrevia.appendChild(hd);
    elPrevia.appendChild(corpo);
    elPrevia.appendChild(acts);
    elPrevia.hidden = false;
    for (const r of elLista.querySelectorAll(".mrow"))
      r.classList.toggle("aberta", r.dataset.id === id);
  }

  function render() {
    delArm = null;
    if (!modelos.length) {
      elBarraBusca.hidden = true;
      if (elChips) elChips.hidden = true;
      if (elPrevia) { elPrevia.hidden = true; previaId = null; }
      elLista.innerHTML = vazioHtml();
      elLista.classList.add("solta");
      return;
    }
    elBarraBusca.hidden = false;
    elLista.classList.remove("solta");
    renderChips();
    let html = "";
    for (const cat of MLIB.CATEGORIAS) {
      const doGrupo = modelos.filter((m) => (m.categoria || "outro") === cat.valor);
      if (!doGrupo.length) continue;
      html +=
        '<section class="grupo">' +
        '<h2 class="ghd">' + escapar(cat.rotulo) +
        '<span class="gn">' + doGrupo.length + "</span></h2>" +
        '<div class="glinhas">' + doGrupo.map(linhaHtml).join("") + "</div>" +
        "</section>";
    }
    elLista.innerHTML = html;
    // A prévia sobrevive ao re-render (a lista é reconstruída a cada gravação),
    // mas só se o modelo ainda existir — excluir o que estava aberto a fecha.
    if (previaId) mostrarPrevia(previaId);
    filtrar();
  }

  function filtrar() {
    const q = norm(elBusca.value.trim());
    let n = 0;
    elLista.querySelectorAll(".mrow").forEach((row) => {
      // DOIS critérios, e o chip é o de fora: buscar dentro de uma espécie é o
      // gesto natural ("prescrição, entre as minhas sentenças").
      const bate =
        (!q || row.dataset.busca.includes(q)) && (!catAtiva || row.dataset.cat === catAtiva);
      row.hidden = !bate;
      if (bate) n++;
    });
    // grupo sem nenhuma linha visível some inteiro — senão sobrariam cabeçalhos
    // de categoria pairando sobre o vazio durante a busca
    elLista.querySelectorAll(".grupo").forEach((g) => {
      g.hidden = !g.querySelector(".mrow:not([hidden])");
    });
    const anterior = elLista.querySelector(".sem-res");
    if (anterior) anterior.remove();
    if (!n) {
      const d = document.createElement("div");
      d.className = "sem-res";
      // O vazio precisa dizer POR QUE está vazio: com um chip de espécie ligado,
      // "nenhum modelo corresponde à busca" manda procurar erro na palavra
      // digitada quando o que filtrou foi o chip.
      const alvo = catAtiva && temMlib ? " em " + MLIB.rotuloCategoria(catAtiva) : "";
      const termo = elBusca.value.trim();
      d.textContent = termo
        ? "Nenhum modelo" + alvo + " corresponde a “" + termo + "”."
        : "Nenhum modelo cadastrado" + alvo + " ainda.";
      elLista.appendChild(d);
    }
    elCont.textContent = n + (n === 1 ? " modelo" : " modelos");
  }

  // ------------------------------------------------------------ formulário
  // São TRÊS telas irmãs (lista, formulário, importação) e elas são
  // mutuamente exclusivas: um único ponto liga uma e desliga as outras duas,
  // senão sobra tela visível por baixo de tela.
  function mostrarTela(qual) {
    elTelaLista.hidden = qual !== "lista";
    elTelaForm.hidden = qual !== "form";
    elTelaImportar.hidden = qual !== "importar";
    // as ações do cabeçalho ("Importar", "Novo modelo") descartariam sem aviso
    // o que está sendo digitado ou conferido — somem fora da lista
    document.body.classList.toggle("editando", qual !== "lista");
    const mesa = document.querySelector(".mesa");
    if (mesa) mesa.scrollTop = 0;
  }

  // opts.novo: `m` é um RASCUNHO que ainda não está gravado (vem da importação
  // em lote, quando a peça passou do teto e o usuário vai encurtá-la aqui).
  // Salvar cria o item; não atualiza um existente.
  function abrirForm(m, opts) {
    const o = opts || {};
    const rascunho = !!(m && o.novo);
    editId = m && !rascunho ? m.id : null;
    idNovo = rascunho ? m.id : m ? null : temMlib ? MLIB.novoId() : "";
    elFormTit.textContent = o.titulo || (m && !rascunho ? "Editar modelo" : "Novo modelo");
    elFT.value = m ? m.titulo || "" : "";
    elFC.value = m ? m.categoria || "outro" : "sentenca";
    elFD.value = m ? m.descricao || "" : "";
    elFX.value = m ? m.texto || "" : "";
    delete elFX.dataset.importado; // form novo: a próxima importação substitui
    elErro.hidden = true;
    mostrarTela("form");
    atualizarChars();
    elFT.focus();
  }

  // `salvou` diz ao callback de saída (usado pela importação) se o rascunho
  // virou modelo ou foi abandonado. Nunca ligar direto num addEventListener:
  // o MouseEvent chegaria como `salvou` e seria truthy.
  function fecharForm(salvou) {
    editId = null;
    elErro.hidden = true;
    const volta = aposForm;
    aposForm = null;
    if (volta) volta(!!salvou);
    else mostrarTela("lista");
  }

  function doForm() {
    const agora = Date.now();
    const antigo = editId && modelos.find((x) => x.id === editId);
    return {
      id: editId || idNovo,
      titulo: elFT.value.trim(),
      categoria: elFC.value || "outro",
      descricao: elFD.value.trim(),
      texto: elFX.value.trim(),
      criadoEm: antigo ? antigo.criadoEm : agora,
      atualizadoEm: agora,
    };
  }

  function atualizarChars() {
    if (!temMlib) return;
    const b = MLIB.bytesDe(doForm());
    const pct = Math.min(999, Math.round((b / MLIB.TETO_BYTES) * 100));
    elChars.textContent = elFX.value.length + " caracteres — " + pct + "% do limite";
    elChars.classList.toggle("estouro", b > MLIB.TETO_BYTES);
  }

  function salvar() {
    const m = doForm();
    if (!m.titulo) {
      mostrarErro("Dê um título ao modelo.", elFT);
      return;
    }
    if (!m.texto) {
      mostrarErro("Cole o texto da peça-modelo.", elFX);
      return;
    }
    MLIB.salvar(m, (erro) => {
      if (erro) return mostrarErro("Não foi possível salvar: " + erro, null);
      // o aoMudar re-lista sozinho; atualiza já para a volta ser instantânea
      modelos = modelos
        .filter((x) => x.id !== m.id)
        .concat(m)
        .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "pt-BR"));
      fecharForm(true);
      render();
    });
  }

  function mostrarErro(msg, foco) {
    elErro.textContent = msg;
    elErro.hidden = false;
    if (foco) foco.focus();
  }

  // ------------------------------------------------------------------ boot
  if (!temMlib) {
    elLista.innerHTML =
      '<div class="sem-res">Não foi possível acessar o armazenamento da extensão.</div>';
    return;
  }

  for (const c of MLIB.CATEGORIAS) {
    const op = document.createElement("option");
    op.value = c.valor;
    op.textContent = c.rotulo;
    elFC.appendChild(op);
  }

  MLIB.listar((ms) => {
    modelos = ms;
    render();
  });
  MLIB.aoMudar((ms) => {
    modelos = ms;
    // só re-desenha a lista se ela estiver à vista — re-render por baixo do
    // formulário aberto faria o usuário perder o que está digitando
    if (!elTelaLista.hidden) render();
  });

  // ações DELEGADAS (as linhas são recriadas a cada render)
  elLista.addEventListener("click", (e) => {
    const row = e.target.closest(".mrow");
    if (!row) return;
    const m = modelos.find((x) => x.id === row.dataset.id);
    if (!m) return;
    const btn = e.target.closest("button");
    // Clicar na LINHA abre a PRÉVIA, não o formulário. Antes ela editava — a
    // ação óbvia enquanto não havia como só OLHAR o modelo. Com a coluna da
    // direita, "ver" passou a ser o gesto barato e reversível, e "editar" um
    // botão explícito: quem quer conferir qual dos três é o certo não entra num
    // formulário para descobrir.
    if (!btn) return mostrarPrevia(previaId === m.id ? null : m.id);
    if (btn.classList.contains("edit")) return abrirForm(m);
    if (!btn.classList.contains("del")) return;
    // exclusão em DOIS cliques — confirm() nativo trava a página
    if (delArm !== m.id) {
      elLista.querySelectorAll(".del.arm").forEach((b) => {
        b.textContent = "Excluir";
        b.classList.remove("arm");
      });
    }
    if (delArm === m.id) {
      delArm = null;
      MLIB.excluir(m.id, () => {
        modelos = modelos.filter((x) => x.id !== m.id);
        render();
      });
    } else {
      delArm = m.id;
      btn.textContent = "Excluir?";
      btn.classList.add("arm");
    }
  });

  // teclado: Enter/Espaço na linha focada edita (a linha é role="button")
  elLista.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest && e.target.closest(".mrow");
    if (!row || e.target.tagName === "BUTTON") return;
    e.preventDefault();
    const m = modelos.find((x) => x.id === row.dataset.id);
    // Mesmo gesto do clique — teclado e mouse nao podem fazer coisas
    // diferentes na mesma linha.
    if (m) mostrarPrevia(previaId === m.id ? null : m.id);
  });

  // Chips de especie. Delegado no container: eles sao reconstruidos a cada
  // gravacao, e um listener por chip morreria no primeiro cadastro.
  if (elChips) {
    elChips.addEventListener("click", (e) => {
      const b = e.target.closest(".mp-chip");
      if (!b) return;
      const alvo = b.dataset.cat || "";
      // Clicar no chip ja ligado DESLIGA: sem isso, voltar a "todas" exigiria
      // achar o chip "Todas", que fica na ponta esquerda de uma fileira longa.
      catAtiva = catAtiva === alvo ? "" : alvo;
      for (const c of elChips.querySelectorAll(".mp-chip"))
        c.setAttribute("aria-pressed", (c.dataset.cat || "") === catAtiva ? "true" : "false");
      filtrar();
    });
  }

  // ---------------------------------------------------- importar de .docx
  // Cadastrar um modelo é colar uma peça inteira; quem já tem os modelos em
  // arquivos do Word teria de abrir cada um, selecionar tudo e copiar. O
  // importador lê o .docx aqui mesmo (sem upload, sem biblioteca — ver
  // docx-importar.js) e preenche o campo, deixando o texto EDITÁVEL antes de
  // salvar: nada é gravado sem o usuário conferir.
  const elArquivo = $("#arquivo");
  const btnImportar = $("#importar");
  if (btnImportar && elArquivo && typeof DocxImport !== "undefined") {
    btnImportar.addEventListener("click", () => {
      elArquivo.value = ""; // permite reimportar o MESMO arquivo depois de editar
      elArquivo.click();
    });
    elArquivo.addEventListener("change", async () => {
      const file = elArquivo.files && elArquivo.files[0];
      if (!file) return;
      // Escrever no BOTÃO apagaria o <svg> do ícone, e o restore do finally
      // devolveria só o texto — o ícone sumiria já na primeira importação.
      // Mesma regra do piscar() em editor.js e do rotulo() em panel.js.
      const alvoRot = btnImportar.querySelector("span") || btnImportar;
      const rotulo = alvoRot.textContent;
      alvoRot.textContent = "lendo…";
      btnImportar.disabled = true;
      try {
        const texto = await DocxImport.lerArquivo(file);
        // não sobrescreve trabalho já feito sem avisar
        if (elFX.value.trim() && !elFX.dataset.importado) {
          elFX.value = elFX.value.trim() + "\n\n" + texto;
        } else {
          elFX.value = texto;
        }
        elFX.dataset.importado = "1";
        if (!elFT.value.trim()) elFT.value = DocxImport.tituloDe(file);
        elErro.hidden = true;
        atualizarChars();
      } catch (e) {
        mostrarErro("Não foi possível importar: " + ((e && e.message) || e), null);
      } finally {
        alvoRot.textContent = rotulo;
        btnImportar.disabled = false;
      }
    });
  } else if (btnImportar) {
    btnImportar.hidden = true;
  }

  // ------------------------------------------- importar .docx EM LOTE
  // Cadastrar dez modelos não pode custar dez formulários. Aqui o usuário
  // solta os arquivos de uma vez, cada um vira uma FICHA já preenchida
  // (título do nome do arquivo, espécie adivinhada do conteúdo, prévia do
  // texto lido) e um clique cadastra todas. A conferência existe porque
  // errar a CATEGORIA é o erro caro: a minuta busca modelos por categoria,
  // então um modelo mal classificado fica invisível — e o usuário não
  // descobre por quê.
  const nFmt = (n) => Number(n || 0).toLocaleString("pt-BR");

  function svgIc(paths, tam, esp) {
    return (
      '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="' + esp + '" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"
    );
  }

  // --- guarda do arrasto ---------------------------------------------------
  // Por padrão o Chrome NAVEGA para o file:// de um arquivo solto em qualquer
  // ponto da página — aqui isso descartaria o lote inteiro em conferência.
  // Os DOIS eventos precisam de preventDefault: é o `dragover` que declara a
  // área como alvo válido e cancela a navegação; só o `drop` não basta.
  // Funções NOMEADAS porque arrow inline não pode ser removida depois.
  function guardaOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  }
  function guardaDrop(e) {
    e.preventDefault();
  }
  function ligarGuarda() {
    if (guardaLigada) return; // idempotente: abrir duas vezes não empilha
    window.addEventListener("dragover", guardaOver, true);
    window.addEventListener("drop", guardaDrop, true);
    guardaLigada = true;
  }
  function desligarGuarda() {
    if (!guardaLigada) return;
    window.removeEventListener("dragover", guardaOver, true);
    window.removeEventListener("drop", guardaDrop, true);
    guardaLigada = false;
    profundidade = 0;
    if (elDrop) elDrop.classList.remove("arrastando");
  }

  // --- estados -------------------------------------------------------------
  function impEstado(qual) {
    const conferindo = qual === "conferindo";
    const vazio = qual === "vazio";
    elDrop.hidden = !vazio && !conferindo;
    elDrop.classList.toggle("compacta", conferindo);
    elDrop.querySelector(".imp-drop-t").innerHTML = conferindo
      ? "Arraste ou clique para <b>adicionar mais</b> arquivos"
      : "Arraste seus arquivos <b>.docx</b> ou <b>.rtf</b> até aqui";
    elProg.hidden = qual !== "lendo";
    elFichas.hidden = qual === "resultado";
    // O rodapé aparece também no VAZIO, com só o "Voltar": sem ele, quem abriu
    // a importação sem querer ficava sem caminho de volta para a lista.
    elImpAcoes.hidden = !conferindo && !vazio;
    elImpCadastrar.hidden = !conferindo;
    if (vazio) elImpCancelar.textContent = "Voltar";
    elImpRes.hidden = qual !== "resultado";
    elImpAcoesFim.hidden = qual !== "resultado";
  }

  function abrirImportar() {
    if (!temDocx) return;
    impFichas = [];
    impFalhas = [];
    impDescarteArm = false;
    elFichas.textContent = "";
    elImpRes.textContent = "";
    resetCancelar();
    impEstado("vazio");
    mostrarTela("importar");
    ligarGuarda();
    elDrop.focus();
  }

  function fecharImportar() {
    impSinal = null;
    impLendo = false;
    desligarGuarda();
    impFichas = [];
    impFalhas = [];
    mostrarTela("lista");
  }

  // Descarte SEMPRE em dois cliques (confirm() nativo trava a página). Sem
  // fichas em conferência não há o que confirmar: sai direto.
  function pedirDescarte() {
    if (!impFichas.length && !impFalhas.length) return fecharImportar();
    if (impDescarteArm) return fecharImportar();
    impDescarteArm = true;
    elImpCancelar.textContent =
      "Descartar " + impFichas.length + (impFichas.length === 1 ? " ficha?" : " fichas?");
    elImpCancelar.classList.add("arm");
  }
  function resetCancelar() {
    impDescarteArm = false;
    elImpCancelar.textContent = "Cancelar";
    elImpCancelar.classList.remove("arm");
  }

  // --- leitura -------------------------------------------------------------
  async function impLer(arquivos) {
    const lista = Array.from(arquivos || []).filter(Boolean);
    if (!lista.length || impLendo) return;
    impLendo = true;
    resetCancelar();
    impSinal = { cancelado: false };
    impEstado("lendo");
    elProgTxt.textContent = "lendo 1 de " + lista.length + "…";
    elBarraI.style.width = "0%";

    const res = await DocxImport.lerLote(lista, {
      sinal: impSinal,
      onItem: (r, i, n) => {
        elProgTxt.textContent = i < n ? "lendo " + (i + 1) + " de " + n + "…" : "lido.";
        elBarraI.style.width = Math.round((i / n) * 100) + "%";
      },
    });

    const interrompido = impSinal.cancelado && res.length < lista.length;
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
          " arquivos foram lidos. Os demais não entraram — arraste-os de novo se quiser.",
      });
    }
    MLIB.marcarDuplicados(impFichas, modelos);
    impRender();
    impEstado(impFichas.length || impFalhas.length ? "conferindo" : "vazio");
  }

  // --- desenho das fichas --------------------------------------------------
  // Construído com createElement e .value/.textContent, NUNCA innerHTML: o
  // título e o texto vêm de um arquivo externo, e o escapeHtml do projeto não
  // escapa aspa simples (o que basta para quebrar um atributo).
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
    prevB.type = "button";
    prevB.className = "imp-prev-b";
    prevB.textContent = "ver as primeiras linhas";
    prevB.setAttribute("aria-expanded", "false");
    meta.appendChild(prevB);
    box.appendChild(meta);

    const prev = document.createElement("pre");
    prev.className = "imp-prev";
    prev.hidden = true;
    prev.textContent = primeirasLinhas(f.modelo.texto);
    box.appendChild(prev);

    const nota = document.createElement("div");
    nota.className = "imp-nota";
    nota.hidden = true;
    box.appendChild(nota);

    pintarFicha(box, f);
    return box;
  }

  function primeirasLinhas(texto) {
    const ls = String(texto || "").split("\n").filter((l) => l.trim());
    const corte = ls.slice(0, 8).join("\n");
    return ls.length > 8 ? corte + "\n…" : corte;
  }

  // Atualiza só os pedaços que MUDAM. Re-renderizar a ficha inteira a cada
  // tecla digitada no título arrancaria o foco do campo.
  function pintarFicha(box, f) {
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
    chars.textContent = nFmt(f.modelo.texto.length) + " caracteres · " + pct + "% do limite";
    chars.classList.toggle("estouro", f.acimaDoTeto);

    const nota = box.querySelector(".imp-nota");
    const avisos = [];
    if (f.acimaDoTeto) {
      avisos.push(
        "Passa do limite de " + nFmt(MLIB.TETO_BYTES) +
          " caracteres por modelo, então não entra no lote. Depois de cadastrar os outros, você poderá abri-lo para encurtar."
      );
    }
    if (f.duplicado) avisos.push("Já existe um modelo com este título — mude o título se não quiser dois.");
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
    elFichas.textContent = "";
    // As falhas vêm PRIMEIRO: são a informação excepcional, e é o que explica
    // por que o botão diz "Cadastrar 7" quando foram soltos 8 arquivos.
    for (const fa of impFalhas) elFichas.appendChild(impFalhaEl(fa));
    impFichas.forEach((f, i) => elFichas.appendChild(impFichaEl(f, i)));
    impAtualizarAcao();
  }

  function impAtualizarAcao() {
    const n = impFichas.filter((f) => f.incluir).length;
    elImpCadastrar.textContent = n
      ? "Cadastrar " + n + (n === 1 ? " modelo" : " modelos")
      : "Cadastrar";
    elImpCadastrar.disabled = !n;
  }

  // Duplicidade é relativa ao CONJUNTO: mudar um título pode resolver (ou
  // criar) o aviso de outra ficha, então as notas de todas são repintadas.
  function impRepintarTodas() {
    MLIB.marcarDuplicados(impFichas, modelos);
    elFichas.querySelectorAll(".imp-ficha:not(.erro)").forEach((box) => {
      const f = impFichas[Number(box.dataset.i)];
      if (f) pintarFicha(box, f);
    });
    impAtualizarAcao();
  }

  // --- gravação e resultado ------------------------------------------------
  function impCadastrar() {
    const escolhidas = impFichas.filter((f) => f.incluir);
    if (!escolhidas.length) return;
    const semTitulo = escolhidas.find((f) => !f.modelo.titulo.trim());
    if (semTitulo) {
      const box = elFichas.querySelector('.imp-ficha[data-i="' + impFichas.indexOf(semTitulo) + '"]');
      if (box) box.querySelector(".imp-tit").focus();
      return;
    }
    elImpCadastrar.disabled = true;
    MLIB.salvarLote(
      escolhidas.map((f) => f.modelo),
      (r) => impMostrarResultado(r, escolhidas)
    );
  }

  // "Sem cap silencioso": o resultado diz quantos entraram E nomeia, um a um,
  // tudo o que ficou de fora com o motivo.
  function impMostrarResultado(r, escolhidas) {
    const comErro = new Set((r.erros || []).map((e) => e.id));
    const gravadas = escolhidas.filter((f) => !comErro.has(f.modelo.id));
    elImpRes.textContent = "";

    const ok = document.createElement("div");
    ok.className = "imp-res-ok";
    ok.innerHTML = svgIc('<path d="M20 6 9 17l-5-5"/>', 18, 2);
    const okT = document.createElement("span");
    okT.textContent = r.ok
      ? r.ok + (r.ok === 1 ? " modelo cadastrado" : " modelos cadastrados")
      : "Nenhum modelo foi cadastrado";
    ok.appendChild(okT);
    elImpRes.appendChild(ok);

    const fora = [];
    for (const e of r.erros || []) {
      fora.push({ rotulo: e.titulo, motivo: e.erro, ficha: null });
    }
    for (const f of impFichas) {
      if (gravadas.indexOf(f) >= 0) continue;
      if (comErro.has(f.modelo.id)) continue;
      if (f.acimaDoTeto) {
        fora.push({
          rotulo: f.modelo.titulo,
          motivo: "passa do limite de " + nFmt(MLIB.TETO_BYTES) + " caracteres por modelo",
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
      const h = document.createElement("h3");
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
          btn.type = "button";
          btn.textContent = "Abrir para encurtar";
          btn.addEventListener("click", () => abrirParaEncurtar(item.ficha, l));
          l.appendChild(btn);
        }
        bloco.appendChild(l);
      }
      elImpRes.appendChild(bloco);
    }

    // as gravadas saem da conferência; o que sobra continua disponível
    impFichas = impFichas.filter((f) => gravadas.indexOf(f) < 0);
    impEstado("resultado");
  }

  // O texto lido não pode se perder: leva o rascunho ao formulário normal,
  // onde o contador mostra ao vivo quanto falta cortar. Ao voltar, a linha
  // some do resultado se o modelo foi salvo.
  function abrirParaEncurtar(f, linha) {
    aposForm = (salvou) => {
      if (salvou && linha && linha.parentNode) linha.remove();
      if (salvou) impFichas = impFichas.filter((x) => x !== f);
      mostrarTela("importar");
      impEstado("resultado");
    };
    abrirForm(f.modelo, { novo: true, titulo: "Encurtar antes de cadastrar" });
  }

  // --- wiring --------------------------------------------------------------
  if (temDocx && elDrop) {
    btnImportarLote.addEventListener("click", abrirImportar);

    const escolher = () => {
      elArquivos.value = ""; // permite reimportar os MESMOS arquivos
      elArquivos.click();
    };
    elDrop.addEventListener("click", escolher);
    elDrop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        escolher();
      }
    });
    elArquivos.addEventListener("change", () => impLer(elArquivos.files));

    elDrop.addEventListener("dragenter", (e) => {
      e.preventDefault();
      profundidade++;
      elDrop.classList.add("arrastando");
    });
    elDrop.addEventListener("dragover", (e) => {
      // sobrepõe o dropEffect "none" da guarda global: AQUI pode soltar
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    elDrop.addEventListener("dragleave", () => {
      profundidade = Math.max(0, profundidade - 1);
      if (!profundidade) elDrop.classList.remove("arrastando");
    });
    elDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      profundidade = 0;
      elDrop.classList.remove("arrastando");
      if (e.dataTransfer && e.dataTransfer.files) impLer(e.dataTransfer.files);
    });

    // handlers DELEGADOS: as fichas são recriadas a cada render
    elFichas.addEventListener("change", (e) => {
      const box = e.target.closest(".imp-ficha");
      if (!box || !box.dataset.i) return;
      const f = impFichas[Number(box.dataset.i)];
      if (!f) return;
      if (e.target.classList.contains("imp-chk")) {
        f.incluir = e.target.checked;
        pintarFicha(box, f);
        impAtualizarAcao();
      } else if (e.target.classList.contains("imp-cat")) {
        f.modelo.categoria = e.target.value;
        f.catTocada = true; // o selo "sugerida" deixaria de ser verdade
        MLIB.medirFicha(f);
        pintarFicha(box, f);
      }
    });
    elFichas.addEventListener("input", (e) => {
      if (!e.target.classList.contains("imp-tit")) return;
      const box = e.target.closest(".imp-ficha");
      const f = impFichas[Number(box.dataset.i)];
      if (!f) return;
      f.modelo.titulo = e.target.value;
      MLIB.medirFicha(f);
      impRepintarTodas();
    });
    elFichas.addEventListener("click", (e) => {
      const btn = e.target.closest(".imp-prev-b");
      if (!btn) return;
      const prev = btn.closest(".imp-ficha").querySelector(".imp-prev");
      prev.hidden = !prev.hidden;
      btn.setAttribute("aria-expanded", String(!prev.hidden));
      btn.textContent = prev.hidden ? "ver as primeiras linhas" : "esconder o texto";
    });

    elImpCadastrar.addEventListener("click", impCadastrar);
    elImpCancelar.addEventListener("click", pedirDescarte);
    $("#impFechar").addEventListener("click", fecharImportar);
    $("#impParar").addEventListener("click", () => {
      if (impSinal) impSinal.cancelado = true;
    });
  } else if (btnImportarLote) {
    btnImportarLote.hidden = true;
  }

  $("#novo").addEventListener("click", () => abrirForm(null));
  $("#salvar").addEventListener("click", salvar);
  $("#cancelar").addEventListener("click", () => fecharForm());
  elBusca.addEventListener("input", filtrar);
  elBusca.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elBusca.value) {
      e.stopPropagation();
      elBusca.value = "";
      filtrar();
    }
  });
  for (const el of [elFT, elFD, elFX]) el.addEventListener("input", atualizarChars);
  elFT.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      salvar();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!elTelaForm.hidden) fecharForm();
    // com um lote em conferência, o Esc ARMA o descarte e o segundo confirma —
    // fechar de primeira jogaria fora o trabalho de conferir dez fichas
    else if (elTelaImportar && !elTelaImportar.hidden) pedirDescarte();
  });
})();
