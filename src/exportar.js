// src/exportar.js — exporta as peças do processo num único ZIP, com metadados.
//
// Motivação: a extensão manda as peças para o modelo por dentro (Files API), e
// isso resolve o uso NELA. Mas quem quer trabalhar os autos fora — no Claude
// Code, num script, num arquivo de caso — não tinha por onde. Baixar peça a
// peça pelo PJe dá um monte de `documento.pdf` sem ordem nem procedência.
//
// O que este módulo produz é um ZIP AUTO-DESCRITO: além dos arquivos, vão um
// `LEIA-ME.md` (que explica a convenção a quem — ou ao que — abrir a pasta),
// um `indice.txt` de uma linha por peça e um `indice.json` para consumo
// programático. O nome de cada arquivo carrega posição, título e id, porque
// **o nome do arquivo é o único metadado que sobrevive a sair da ferramenta**.
//
// O módulo é PURO de propósito: não conhece `docsCache`, `PJE` nem o painel —
// recebe a lista, a ficha do processo e um `obter(id)`. É o que permite
// testá-lo fora do navegador.
(() => {
  "use strict";

  // Guarda de memória. O conteúdo fica em `docsCache` como base64 (~1,33× os
  // bytes) e é materializado em Uint8Array na hora de zipar; sem um teto, um
  // processo de milhares de páginas mata a aba sem dizer por quê. O número é
  // conservador de propósito: é melhor pedir para exportar em partes do que
  // perder 40 minutos de download numa aba que morre no fim.
  const TETO_BYTES = 600 * 1024 * 1024;

  // ---------------------------------------------------------------------------
  // Nomes de arquivo
  // ---------------------------------------------------------------------------

  // Construída de string, não como literal: o intervalo são caracteres
  // COMBINANTES, invisíveis no editor — no fonte eles seriam indistinguíveis
  // de um erro de digitação.
  const RE_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

  // O título das peças chega no formato "215362915 - Certidão (Outras)" — o id
  // ABRE o título (é assim que ele viaja até o modelo, no `title` do bloco
  // document). Para o nome do arquivo tiramos esse prefixo, senão o id
  // apareceria duas vezes.
  function semIdInicial(titulo) {
    return String(titulo || "").replace(/^\s*\d{6,}\s*-\s*/, "").trim();
  }

  function nomeLimpo(titulo) {
    return (
      semIdInicial(titulo)
        // NFD + remoção das marcas de combinação preserva a LETRA base
        // ("Certidão" → "Certidao"); um [^\w] ingênuo comeria o caractere todo.
        .normalize("NFD")
        .replace(RE_DIACRITICOS, "")
        .replace(/[^\w\s.-]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50)
        .replace(/-+$/, "")
    );
  }

  // `md` é o texto EXTRAÍDO de uma peça (pela leitura local ou por OCR): sai
  // como .md porque carrega os marcadores de folha e a formatação do OCR.
  const EXTENSAO = { pdf: ".pdf", html: ".txt", rtf: ".txt", texto: ".txt", md: ".md" };

  function nomeArquivo(doc, ordem, fmt) {
    const num = String(ordem).padStart(3, "0");
    const desc = nomeLimpo(doc.titulo);
    return num + "_" + (desc ? desc + "_" : "") + doc.id + (EXTENSAO[fmt] || ".txt");
  }

  // Nome da pasta raiz dentro do ZIP: tudo sai numa pasta só, para quem
  // descompacta na pasta de Downloads não espalhar 300 arquivos por lá.
  function nomePasta(cnj) {
    const limpo = String(cnj || "").replace(/[^\d.-]+/g, "");
    return "processo-" + (limpo || "sem-numero");
  }

  // ---------------------------------------------------------------------------
  // Ordem cronológica
  // ---------------------------------------------------------------------------

  // "dd/MM/yyyy HH:mm" (o formato da coluna "Juntado em" da grid). Devolve o
  // instante em ms ou NaN.
  function instanteDe(s) {
    const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return NaN;
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }

  // Numera as peças em ordem CRONOLÓGICA CRESCENTE, para o prefixo NNN fazer a
  // ordenação alfabética da pasta coincidir com a ordem dos autos.
  //
  // Duas fontes, nesta ordem de confiança:
  //  1. a data de juntada (só existe quando a grid "Documentos" foi lida) — é
  //     um dado, não um palpite;
  //  2. a inversa da ordem da tela: tanto a grid quanto os Autos Digitais
  //     listam do mais recente para o mais antigo. É uma PREMISSA, e por isso
  //     o critério usado vai escrito no índice em vez de ficar implícito.
  function ordenarCronologico(docs) {
    const comData = docs.filter((d) => !isNaN(instanteDe(d.juntadoEm)));
    if (comData.length >= 2 && comData.length >= docs.length * 0.6) {
      const ordenado = docs
        .map((d, i) => ({ d, i, t: instanteDe(d.juntadoEm) }))
        .sort((a, b) => {
          // Sem data, mantém a posição relativa (ordenação estável): mover uma
          // peça sem data para um extremo seria inventar cronologia.
          if (isNaN(a.t) && isNaN(b.t)) return a.i - b.i;
          if (isNaN(a.t)) return 1;
          if (isNaN(b.t)) return -1;
          return a.t - b.t || a.i - b.i;
        })
        .map((x) => x.d);
      return { docs: ordenado, criterio: "data de juntada (coluna “Juntado em”)" };
    }
    return {
      docs: docs.slice().reverse(),
      criterio: "inversa da ordem da tela (o PJe lista da peça mais recente para a mais antiga)",
    };
  }

  // ---------------------------------------------------------------------------
  // Ficha do processo (raspada do painel de detalhes dos Autos Digitais)
  // ---------------------------------------------------------------------------

  function pessoaTxt(p) {
    const campos = [p.nome];
    if (p.tipoDocumento && p.documento) campos.push(p.tipoDocumento + " " + p.documento);
    if (p.oab) campos.push("OAB " + p.oab);
    return campos.join(" | ") + (p.papel ? " (" + p.papel + ")" : "");
  }

  // "Segredo de justiça? SIM" muda como o pacote inteiro deve ser tratado,
  // então vira aviso no topo em vez de mais uma linha no meio da ficha.
  function sobSegredo(ficha) {
    if (!ficha || !ficha.campos) return false;
    for (const k of Object.keys(ficha.campos)) {
      if (/segredo|sigilo/i.test(k) && /^sim\b/i.test(String(ficha.campos[k]).trim())) return true;
    }
    return false;
  }

  function blocoFicha(ficha) {
    if (!ficha) return [];
    const linhas = [];
    const campos = ficha.campos || {};
    const chaves = Object.keys(campos);
    if (chaves.length) {
      const larg = Math.max(...chaves.map((k) => k.length));
      for (const k of chaves) linhas.push("  " + k.padEnd(larg) + " : " + campos[k]);
    }
    const polos = [
      ["POLO ATIVO", ficha.poloAtivo],
      ["POLO PASSIVO", ficha.poloPassivo],
    ];
    for (const [rotulo, polo] of polos) {
      if (!polo || !polo.length) continue;
      linhas.push("", rotulo);
      for (const p of polo) {
        linhas.push("  " + pessoaTxt(p));
        for (const r of p.representantes || []) linhas.push("      rep. " + pessoaTxt(r));
      }
    }
    return linhas;
  }

  // ---------------------------------------------------------------------------
  // Índices
  // ---------------------------------------------------------------------------

  function fmtBytes(n) {
    if (!n) return "0 B";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }

  const ROTULO_FMT = {
    pdf: "PDF",
    html: "TXT (peça HTML do editor do PJe)",
    rtf: "TXT (peça RTF do editor antigo)",
    texto: "TXT",
  };

  const REGUA = "=".repeat(78);

  function montarLeiaMe(info) {
    const { cnj, gerado, criterio, itens, falhas, ficha, origemLista, modo } = info;
    const temPessoas = !!(ficha && (ficha.poloAtivo || ficha.poloPassivo));
    return []
      .concat(
        [
          (modo === "texto" ? "# Texto das peças do processo " : "# Peças do processo ") +
            (cnj || "(número não identificado)"),
          "",
          "Exportado pela extensão **TecJustiça PJe** em " + gerado + ".",
          "",
        ],
        // O pacote de texto é a LEITURA dos autos, não os autos: quem abrir
        // precisa saber disso na primeira linha, antes de usar o conteúdo para
        // qualquer coisa.
        modo === "texto"
          ? [
              "> ## ⚠️ Este pacote contém TEXTO EXTRAÍDO, não os documentos originais",
              ">",
              "> O texto foi extraído dos PDFs pela leitura local do navegador ou por OCR.",
              "> **Assinaturas, carimbos, selos e imagens NÃO aparecem aqui**, e a extração",
              "> pode errar em digitalizações de baixa qualidade. Para qualquer uso que",
              "> dependa da forma do documento, volte ao original no PJe.",
              ">",
              "> `autos.md` traz todas as peças concatenadas na ordem cronológica;",
              "> a pasta `pecas/` traz uma por arquivo. Os marcadores `[fl. N]` indicam",
              "> a folha de origem dentro de cada peça.",
              "",
            ]
          : [],
        sobSegredo(ficha)
          ? [
              "> ## ⛔ Segredo de justiça",
              ">",
              "> Este processo tramita em segredo de justiça. O conteúdo desta pasta é",
              "> de acesso restrito — não redistribua.",
              "",
            ]
          : [],
        [
          "> **Conteúdo real de um processo judicial.** As peças e o índice contêm dados",
          "> pessoais das partes" +
            (temPessoas ? " (inclusive CPF/CNPJ e inscrição na OAB)" : "") +
            ". Trate com o mesmo cuidado devido aos autos.",
          "",
          "## O que tem aqui",
          "",
          "- `pecas/` — um arquivo por peça, na ordem dos autos.",
          "- `indice.txt` — **uma linha por peça**, com todos os metadados. É o arquivo",
          "  a ler primeiro para saber o que existe e onde está. Traz também a ficha do",
          "  processo: classe, assunto, valor da causa, órgão julgador e as partes.",
          "- `indice.json` — os mesmos dados em JSON, para consumo por programa.",
          "",
          "## Como os arquivos são nomeados",
          "",
          "```",
          "NNN_Titulo-da-peca_ID.ext",
          "```",
          "",
          "- **NNN** — posição da peça no processo, em ordem cronológica crescente.",
          "  Assim a ordenação alfabética da pasta já é a ordem dos autos. O critério",
          "  usado nesta exportação foi: " + criterio + ".",
          "- **ID** — o identificador da peça no PJe. É por ele que a peça é",
          "  reencontrada na linha do tempo do processo, e é ele que deve aparecer em",
          "  qualquer citação.",
          "- **.ext** — `.pdf` quando a peça é um PDF (digitalizada ou anexo); `.txt`",
          "  quando o PJe a serve como HTML ou RTF (peças redigidas no editor do próprio",
          "  PJe). Nesses casos o `.txt` contém o texto já extraído — o HTML e a marcação",
          "  RTF foram descartados de propósito, porque não são conteúdo.",
          "",
          "## Como citar",
          "",
          "Ao afirmar qualquer coisa a partir destes arquivos, indique a origem no",
          "formato usado pelo restante da ferramenta:",
          "",
          "```",
          "(Título da peça, id 123456, fl. 7)",
          "```",
          "",
          "O **id** é obrigatório: é o número que abre o título da peça e o único jeito",
          "de quem lê reencontrá-la no PJe. Citar só o nome não serve — processos têm",
          "várias peças com o mesmo nome.",
          "",
          "## Limites que valem saber",
          "",
          "- **PDFs digitalizados podem não ter camada de texto.** Nesse caso o arquivo é",
          "  imagem: dá para ler visualmente, mas não dá para buscar por texto.",
          "- **Peças de encaminhamento são normais.** Petições cujo conteúdo é apenas “Em",
          "  anexo” não estão corrompidas — o teor está nos anexos protocolados junto,",
          "  que são peças próprias desta mesma lista.",
          "- **A lista pode não ser o processo inteiro**: " + origemLista + ".",
        ],
        falhas.length
          ? [
              "- **" +
                falhas.length +
                " peça(s) não puderam ser baixadas** — a relação está no fim do `indice.txt`,",
              "  com o número de ordem de cada uma. Como esses números foram consumidos, a",
              "  numeração da pasta salta neles (…002, 004…): o salto é a peça que faltou,",
              "  não um erro de contagem.",
            ]
          : [],
        ["", "Total exportado: **" + itens.length + " peça(s)**.", ""]
      )
      .join("\n");
  }

  // Uma linha por peça, campos separados por " | ", SEM truncar nada. A opção
  // óbvia seria uma tabela de colunas alinhadas, mas com dez campos ela só cabe
  // truncando — e um índice que corta o nome de quem juntou a peça deixa de
  // responder à pergunta que se faria a ele. Linha longa é lida por busca
  // (Ctrl+F, grep), que é como este arquivo vai ser usado de fato.
  function montarIndiceTxt(info) {
    const { cnj, gerado, criterio, itens, falhas, ficha, origemLista } = info;
    const linhas = [].concat(
      sobSegredo(ficha)
        ? [
            "!! ESTE PROCESSO TRAMITA EM SEGREDO DE JUSTIÇA.",
            "!! O conteúdo desta pasta é de acesso restrito. Não redistribua.",
            "",
          ]
        : [],
      [REGUA, "PROCESSO " + (cnj || "(número não identificado)"), REGUA, ""],
      blocoFicha(ficha),
      ficha ? [""] : [],
      [
        REGUA,
        "PEÇAS (" + itens.length + ")",
        REGUA,
        "",
        "Gerado em " + gerado + " pela extensão TecJustiça PJe.",
        "Ordem: " + criterio + ".",
        "Origem da lista: " + origemLista + ".",
        "",
        "Uma linha por peça, campos separados por “ | ”, nesta ordem:",
        "  NNN | arquivo | id | peça | tipo oficial | juntado em | juntado por |",
        "  formato | páginas | tamanho [ | campos extras do tribunal]",
        "",
      ]
    );
    for (const it of itens) {
      const campos = [
        String(it.ordem).padStart(3, "0"),
        it.arquivo,
        "id " + it.id,
        it.titulo,
        it.tipo || "—",
        it.juntadoEm || "—",
        it.juntadoPor || "—",
        ROTULO_FMT[it.formato] || it.formato,
        it.paginas ? it.paginas + " págs." : "—",
        fmtBytes(it.bytes),
      ];
      // Colunas que só aquele tribunal tem entram no fim, nomeadas — o índice
      // não pode perder o que a grid oferece a mais.
      for (const k of Object.keys(it.extras || {})) campos.push(k + ": " + it.extras[k]);
      linhas.push(campos.join(" | "));
    }
    if (falhas.length) {
      linhas.push("", REGUA, "PEÇAS QUE NÃO PUDERAM SER BAIXADAS (" + falhas.length + ")", REGUA, "");
      linhas.push(
        "Cada uma consumiu o seu número de ordem, que por isso NÃO aparece na",
        "pasta “pecas/” — é daí que vêm os saltos na numeração.",
        ""
      );
      for (const f of falhas)
        linhas.push(String(f.ordem).padStart(3, "0") + " | id " + f.id + " | " + f.titulo + " | " + f.motivo);
      linhas.push(
        "",
        "O download do PJe depende da sessão: uma peça pode falhar por ainda não ter",
        "sido aberta na linha do tempo. Abrir a peça no processo e exportar de novo",
        "costuma resolver."
      );
    }
    linhas.push("");
    return linhas.join("\n");
  }

  function montarIndiceJson(info) {
    return JSON.stringify(
      {
        processo: info.cnj || null,
        segredoDeJustica: sobSegredo(info.ficha),
        ficha: info.ficha || null,
        geradoEm: info.geradoIso,
        gerador: "TecJustiça PJe (extensão Chrome)",
        ordem: info.criterio,
        origemDaLista: info.origemLista,
        total: info.itens.length,
        pecas: info.itens,
        falhas: info.falhas,
      },
      null,
      2
    );
  }

  // ---------------------------------------------------------------------------
  // Montagem do ZIP
  // ---------------------------------------------------------------------------

  function b64ParaBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // opts: {docs, obter(id)->conteudo, cnj, ficha, origemLista, onEtapa(id,estado),
  //        sinal:{cancelado}, agora:Date, zip:{criar}}
  //
  // `obter` é assíncrono e pode demorar MUITO (o download do PJe é serializado na
  // sessão JSF, ~5,6 s por peça quando precisa de ativação). É por isso que há
  // `sinal.cancelado` conferido a cada peça, e não um "aguarde".
  async function montarZip(opts) {
    const {
      docs,
      obter,
      cnj,
      ficha = null,
      origemLista = "lista lida da linha do tempo do processo",
      onEtapa,
      sinal,
      agora = new Date(),
      // "documentos" (padrão) = os arquivos originais, byte a byte como sempre.
      // "texto" = as peças em forma de texto, mais um autos.md concatenado.
      // São pacotes conceitualmente distintos: um são os autos, o outro é a
      // LEITURA deles.
      modo = "documentos",
    } = opts;
    const Zip = opts.zip || (typeof window !== "undefined" && window.ZipW);
    if (!Zip) throw new Error("escritor de ZIP indisponível");

    const { docs: emOrdem, criterio } = ordenarCronologico(docs);
    const pasta = nomePasta(cnj);
    const zip = Zip.criar({ data: agora });

    const itens = [];
    const falhas = [];
    const autos = []; // pedaços do autos.md (só no modo "texto")
    let bytesTotais = 0;

    for (let i = 0; i < emOrdem.length; i++) {
      if (sinal && sinal.cancelado) throw new Error("cancelado");
      const d = emOrdem[i];
      const ordem = i + 1;
      if (onEtapa) onEtapa(d.id, "loading");
      let c;
      try {
        c = await obter(d.id);
        if (!c) throw new Error("peça vazia");
      } catch (e) {
        // A `ordem` vai junto de propósito: ela foi CONSUMIDA por esta peça e
        // não será reaproveitada, então a pasta fica com um buraco na
        // numeração (…002, 004…). Sem registrar o número aqui, esse buraco
        // seria um mistério para quem abre o pacote — e o pacote existe para
        // se explicar sozinho no destino.
        falhas.push({
          ordem,
          id: d.id,
          titulo: semIdInicial(d.titulo) || String(d.id),
          motivo: (e && e.message) || String(e),
        });
        if (onEtapa) onEtapa(d.id, "erro");
        continue;
      }

      const fmt = c.fmt || (c.kind === "pdf" ? "pdf" : "texto");
      const arquivo = nomeArquivo(d, ordem, fmt);
      const ehPdf = c.kind === "pdf";
      const dados = ehPdf ? b64ParaBytes(c.b64) : c.text;
      const bytes = ehPdf ? dados.length : new TextEncoder().encode(c.text).length;

      bytesTotais += bytes;
      if (bytesTotais > TETO_BYTES) {
        throw new Error(
          "as peças somam mais de " +
            Math.round(TETO_BYTES / 1048576) +
            " MB e não cabem num único arquivo aqui. Marque parte das peças na lista e exporte em duas ou mais levas."
        );
      }

      // PDF já é um contêiner deflacionado: recomprimir custa CPU por ~1%.
      const nomeReal = await zip.add(pasta + "/pecas/" + arquivo, dados, { comprimir: !ehPdf });

      itens.push({
        ordem,
        arquivo: nomeReal.slice(pasta.length + 7), // sem o "<pasta>/pecas/"
        id: d.id,
        titulo: semIdInicial(d.titulo) || d.titulo || "",
        tituloCompleto: d.titulo || "",
        tipo: d.tipo || null,
        juntadoEm: d.juntadoEm || null,
        juntadoPor: d.juntadoPor || null,
        formato: fmt,
        paginas: ehPdf ? c.pages || null : null,
        bytes,
        extras: d.extras && Object.keys(d.extras).length ? d.extras : undefined,
      });
      // Pacote de TEXTO: além do arquivo por peça, um `autos.md` único com
      // tudo na ordem cronológica. O arquivo por peça preserva a
      // rastreabilidade no nome (NNN_Titulo_ID); o concatenado é o que se joga
      // inteiro num chat ou num script, sem ter de montar nada.
      if (modo === "texto" && !ehPdf) {
        autos.push(
          "\n\n# " + d.id + " — " + (semIdInicial(d.titulo) || d.titulo || "") + "\n\n" + c.text
        );
      }
      if (onEtapa) onEtapa(d.id, "done");
    }

    // Cancelar durante a ÚLTIMA peça escaparia da guarda do topo do laço e
    // entregaria o arquivo mesmo assim. Quem clicou em Cancelar não espera um
    // download.
    if (sinal && sinal.cancelado) throw new Error("cancelado");

    const info = {
      cnj,
      ficha,
      criterio,
      origemLista,
      itens,
      falhas,
      modo,
      gerado: agora.toLocaleString("pt-BR"),
      geradoIso: agora.toISOString(),
    };

    await zip.add(pasta + "/LEIA-ME.md", montarLeiaMe(info));
    await zip.add(pasta + "/indice.txt", montarIndiceTxt(info));
    await zip.add(pasta + "/indice.json", montarIndiceJson(info));
    if (modo === "texto" && autos.length) {
      await zip.add(
        pasta + "/autos.md",
        "# " + (cnj || "Processo") + " — texto das peças\n" +
          "\n> Texto EXTRAÍDO dos PDFs (leitura local ou OCR). Confira sempre no" +
          " documento original: assinaturas, carimbos e imagens não aparecem aqui," +
          " e a extração pode errar em digitalizações de baixa qualidade.\n" +
          "> Peças na ordem cronológica (" + criterio + ").\n" +
          autos.join("")
      );
    }

    return {
      blob: zip.fechar(),
      nome: pasta + ".zip",
      resumo: {
        ok: itens.length,
        falhas: falhas.length,
        bytes: bytesTotais,
        paginas: itens.reduce((n, it) => n + (it.paginas || 0), 0),
      },
      itens,
      falhasDetalhe: falhas,
    };
  }

  const api = {
    montarZip,
    nomeArquivo,
    nomeLimpo,
    nomePasta,
    ordenarCronologico,
    montarLeiaMe,
    montarIndiceTxt,
    montarIndiceJson,
    blocoFicha,
    sobSegredo,
    instanteDe,
    TETO_BYTES,
  };

  if (typeof window !== "undefined") window.PjeExport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
