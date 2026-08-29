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

  // Imagem (anexo em foto/print) guarda o formato de ORIGEM em `fmt` — é o que
  // dá a extensão certa no pacote em vez de um .txt de lixo binário.
  // `md` NÃO é formato de conteúdo de peça — nenhum `c.fmt` vale "md", então
  // `montarZip` segue byte a byte o de antes. Ele existe para o pacote de TEXTO
  // (`montarZipTexto`) poder reusar o `nomeArquivo` e sair com a mesma convenção
  // `NNN_Titulo_ID` do pacote de PDFs: extraídos lado a lado, os dois casam
  // peça a peça.
  const EXTENSAO = {
    pdf: ".pdf", html: ".txt", rtf: ".txt", texto: ".txt",
    jpeg: ".jpeg", png: ".png", gif: ".gif", webp: ".webp",
    md: ".md",
  };

  function nomeArquivo(doc, ordem, fmt) {
    const num = String(ordem).padStart(3, "0");
    const desc = nomeLimpo(doc.titulo);
    return num + "_" + (desc ? desc + "_" : "") + doc.id + (EXTENSAO[fmt] || ".txt");
  }

  // Nome do ARQUIVO .zip (sem a extensão). Já foi também o nome de uma pasta
  // raiz dentro do zip, e essa duplicação era o defeito: o Explorer cria uma
  // pasta com o nome do arquivo ao extrair, então o nome do processo aparecia
  // duas vezes no caminho — ver o comentário em `montarZipPrecatorias`.
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
    const { cnj, gerado, criterio, itens, falhas, ficha, origemLista } = info;
    const temPessoas = !!(ficha && (ficha.poloAtivo || ficha.poloPassivo));
    return []
      .concat(
        [
          "# Peças do processo " + (cnj || "(número não identificado)"),
          "",
          "Exportado pela extensão **TecJustiça PJe** em " + gerado + ".",
          "",
        ],
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
    } = opts;
    const Zip = opts.zip || (typeof window !== "undefined" && window.ZipW);
    if (!Zip) throw new Error("escritor de ZIP indisponível");

    const { docs: emOrdem, criterio } = ordenarCronologico(docs);
    // O nome do ARQUIVO leva o processo; o conteúdo não repete (ver o comentário
    // longo em `montarZipPrecatorias`: a raiz interna homônima duplicava o nome
    // no caminho, e o Windows recusa acima de 260 caracteres). Aqui a estrutura é
    // mais rasa e não estourava, mas o desperdício era o mesmo — e um título de
    // peça longo somado a uma pasta de destino funda chegava perto.
    const nomeZip = nomePasta(cnj);
    const zip = Zip.criar({ data: agora });

    const itens = [];
    const falhas = [];
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
      // Binário = PDF e imagem (anexo em foto/print). Os dois viajam em base64
      // no cache e viram bytes aqui; os dois já são contêineres comprimidos,
      // então nenhum passa pelo deflate. `fmt` ("pdf"/"jpeg"/"png") vira a
      // extensão do arquivo, e é por isso que a imagem sai do zip como .jpeg
      // em vez de virar um .txt de lixo, que era o destino dela antes.
      const ehBin = c.kind === "pdf" || c.kind === "img";
      const dados = ehBin ? b64ParaBytes(c.b64) : c.text;
      const bytes = ehBin ? dados.length : new TextEncoder().encode(c.text).length;

      bytesTotais += bytes;
      if (bytesTotais > TETO_BYTES) {
        throw new Error(
          "as peças somam mais de " +
            Math.round(TETO_BYTES / 1048576) +
            " MB e não cabem num único arquivo aqui. Marque parte das peças na lista e exporte em duas ou mais levas."
        );
      }

      // PDF e imagem já são contêineres comprimidos: recomprimir custa CPU por ~1%.
      const nomeReal = await zip.add("pecas/" + arquivo, dados, { comprimir: !ehBin });

      itens.push({
        ordem,
        arquivo: nomeReal.slice("pecas/".length), // o índice cita só o nome
        id: d.id,
        titulo: semIdInicial(d.titulo) || d.titulo || "",
        tituloCompleto: d.titulo || "",
        tipo: d.tipo || null,
        juntadoEm: d.juntadoEm || null,
        juntadoPor: d.juntadoPor || null,
        formato: fmt,
        // só PDF tem contagem de páginas: `ehBin` também cobre imagem, e um
        // anexo em foto não tem "páginas" para declarar no índice
        paginas: c.kind === "pdf" ? c.pages || null : null,
        bytes,
        extras: d.extras && Object.keys(d.extras).length ? d.extras : undefined,
      });
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
      gerado: agora.toLocaleString("pt-BR"),
      geradoIso: agora.toISOString(),
    };

    await zip.add("LEIA-ME.md", montarLeiaMe(info));
    await zip.add("indice.txt", montarIndiceTxt(info));
    await zip.add("indice.json", montarIndiceJson(info));
    return {
      blob: zip.fechar(),
      nome: nomeZip + ".zip",
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

  // ---------------------------------------------------------------------------
  // PACOTES DE CARTA PRECATÓRIA
  //
  // Um `.zip` com UMA PASTA POR CARTA, cada uma contendo a carta, a peça de
  // origem da ação e a decisão que a fundamenta. A peça de origem se repete em
  // todas as pastas de propósito: cada pasta vira um envio de malote digital
  // independente e precisa sair completa do arquivo.
  //
  // É um zip só, e não um por carta, porque `baixarBlob` entrega UM arquivo — N
  // downloads exigiriam a permissão `downloads`, que este projeto evita para não
  // mudar o aviso de instalação da Web Store (mesma razão do iframe da grid).
  // ---------------------------------------------------------------------------
  // Os rótulos são CURTOS porque o caminho inteiro tem um teto duro: o Windows
  // recusa a extração acima de 260 caracteres, e este pacote é o mais fundo que
  // a extensão produz (pasta por carta). "1-carta-precatoria" gastava 18 dos
  // ~130 disponíveis e não dizia nada que "1-carta" não diga — o pacote inteiro
  // já se chama "precatorias-<cnj>.zip".
  const PAPEL = { carta: "1-carta", origem: "2-origem", decisao: "3-decisao" };

  // Teto do trecho descritivo NO PACOTE de precatória (o da exportação comum
  // continua 50). Aqui há dois níveis de pasta a mais, e o título do PJe é
  // repetitivo justamente no começo — "Carta Precatória (Outras) (Carta
  // Precatória | Pág. Inicial SAJ 1)" —, então os caracteres cortados são os
  // que menos identificam a peça. O id continua inteiro no nome.
  const DESC_MAX_PACOTE = 32;

  // `instanceof Date` é falso entre realms (Date criado noutro contexto) e para
  // a mesma data em texto ISO — e o nome da PASTA depende disso. Duck typing.
  function diaIso(d) {
    if (!d) return null;
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!dt || typeof dt.getTime !== "function" || isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  // `NN_AAAA-MM-DD`. O id da carta SAIU daqui de propósito: ele já está inteiro
  // no nome do arquivo da carta, dentro desta mesma pasta, e repeti-lo custava
  // 21 caracteres num caminho que o Windows corta em 260. A data é o que
  // identifica a carta para quem monta o malote.
  function nomePastaPacote(p) {
    return String(p.n).padStart(2, "0") + "_" + (diaIso(p.data) || "sem-data");
  }

  // Cada peça vira `<papel>_<Titulo-limpo>_<id>.<ext>`. O papel abre o nome (e
  // não a posição, como no pacote de peças) porque aqui a pasta tem três
  // arquivos com FUNÇÕES distintas — quem abre no juízo deprecado precisa saber
  // qual é a carta e qual é a instrução, não em que ordem foram juntadas.
  function nomeArquivoPacote(papel, doc, fmt, sufixo) {
    const desc = nomeLimpo(doc.titulo).slice(0, DESC_MAX_PACOTE).replace(/-+$/, "");
    return (
      PAPEL[papel] + (sufixo || "") + "_" + (desc ? desc + "_" : "") + doc.id + (EXTENSAO[fmt] || ".txt")
    );
  }

  // Peças que saíram como TEXTO, em todas as pastas. Este pacote existe para
  // virar anexo de malote digital, e um `.txt` ali é um documento sem valor: o
  // que o juízo deprecado precisa receber é o PDF com timbre, paginação e o
  // rodapé "Assinado eletronicamente por…". A peça nascida no editor do PJe é
  // servida pela rota REST como CONTEÚDO (HTML), não como o PDF assinado — e
  // como carta, despacho e decisão nascem quase sempre no editor, o caso comum
  // é o pacote inteiro sair assim. Enquanto a extensão não souber pedir o PDF
  // oficial, o mínimo é que ninguém anexe isso sem saber.
  function textoNoPacote(info) {
    const out = [];
    for (const p of info.pacotes || []) {
      for (const a of p.arquivos || []) {
        if (a.formato !== "pdf" && !/^(jpeg|png|gif|webp)$/.test(a.formato)) {
          out.push({ pasta: p.pasta, arquivo: a.arquivo, titulo: a.titulo, id: a.id });
        }
      }
    }
    return out;
  }

  function montarLeiaMePacotes(info) {
    const L = [];
    if (info.segredo) {
      L.push("> ⚠️  PROCESSO EM SEGREDO DE JUSTIÇA — trate este material conforme as regras de sigilo.", "");
    }
    const soTexto = textoNoPacote(info);
    if (soTexto.length) {
      L.push(
        "> ## ⚠️  LEIA ANTES DE ANEXAR AO MALOTE",
        ">",
        "> " + soTexto.length + " arquivo(s) deste pacote saíram como **TEXTO (.txt)**, e",
        "> **não são o documento oficial**. Elas nasceram no editor do PJe, e a rota de",
        "> download da extensão entrega o CONTEÚDO da peça — sem o brasão, sem a",
        "> paginação e sem o rodapé “Assinado eletronicamente por…”.",
        ">",
        "> Serve para ler e conferir. **Não serve para o malote digital.**",
        ">",
        "> O que fazer: abra cada uma dessas peças no PJe (visualizador de documentos)",
        "> e use o ícone de download ⬇ dele — o PJe devolve o PDF assinado. Substitua",
        "> o `.txt` correspondente dentro da pasta, mantendo o nome do arquivo.",
        ">",
        "> Arquivos a substituir:"
      );
      for (const t of soTexto) L.push("> - `" + t.pasta + "/" + t.arquivo + "` — " + t.titulo);
      L.push("", "");
    }
    L.push("# Pacotes de carta precatória — processo " + (info.cnj || "(sem número)"), "");
    L.push(
      "Gerado em " + info.gerado + " pela extensão TecJustiça PJe, a partir das peças",
      "da linha do tempo do processo. Cada pasta reúne o que instrui UMA carta",
      "precatória e foi pensada para virar um envio de malote digital.",
      ""
    );
    L.push("## O que há em cada pasta", "");
    L.push(
      "- `" + PAPEL.carta + "_…` — a carta precatória expedida;",
      "- `" + PAPEL.origem + "_…` — a peça que deu origem à ação (denúncia, queixa ou petição inicial);",
      "- `" + PAPEL.decisao + "_…` — a decisão/despacho **anterior à expedição** da carta, que a fundamenta.",
      ""
    );
    L.push(
      "A peça de origem se repete em todas as pastas de propósito: cada pasta é um",
      "envio independente e precisa sair completa daqui.",
      "",
      "Os arquivos `.pdf` são os documentos do PJe — o mesmo arquivo que o botão de",
      "download (⬇) do visualizador entrega, com timbre e assinatura.",
      ""
    );
    L.push("## Como as peças foram escolhidas", "");
    L.push(
      info.porMovimento
        ? "As cartas foram identificadas pelo **movimento processual** lançado no PJe " +
            "(“Expedição de carta precatória”), que é vocabulário controlado — e não pelo " +
            "título do arquivo. Isso evita confundir a carta EXPEDIDA com a carta DEVOLVIDA, " +
            "que costuma ter título idêntico."
        : "⚠️  Neste processo não havia movimento processual legível, então as cartas foram " +
            "identificadas pelo **título** da peça. Confira se alguma delas é uma precatória " +
            "devolvida, e não expedida.",
      "",
      "A decisão de cada pasta é a mais recente **anterior** à expedição daquela carta — ",
      "e não a última decisão do processo, que pode ser posterior a ela.",
      ""
    );
    L.push(
      "**Confira antes de enviar.** A seleção é automática e feita por regra sobre os",
      "metadados do PJe; ela não lê o conteúdo das peças.",
      ""
    );
    if (info.ficha) {
      L.push("## Processo", "", "```", ...blocoFicha(info.ficha), "```", "");
    }
    L.push("## Pastas", "");
    for (const p of info.pacotes) {
      if (p.semCarta) {
        // Pasta NÃO criada. Aparece aqui porque some do zip: um pacote que
        // desaparece sem explicação faria o servidor procurar o que não existe.
        L.push("### (carta " + p.n + " — pasta NÃO gerada)");
        L.push("");
        L.push("⚠️  " + (p.faltas || []).join("; ") + ".");
        L.push("");
        L.push("Tente de novo: o download do PJe às vezes falha na primeira tentativa.");
        L.push("");
        continue;
      }
      L.push("### " + p.pasta);
      L.push("");
      // A marca vai na LINHA do arquivo, e não só no aviso do topo: quem abre a
      // pasta para montar o e-mail lê esta lista, não o cabeçalho.
      for (const a of p.arquivos) {
        const bruto = a.formato !== "pdf" && !/^(jpeg|png|gif|webp)$/.test(a.formato);
        L.push(
          "- `" + a.arquivo + "` — " + a.titulo +
            (bruto ? "  ⚠️ **texto, não é o PDF assinado — substitua antes de enviar**" : "")
        );
      }
      if (p.faltas && p.faltas.length) {
        L.push("", "⚠️  Não foi possível localizar: " + p.faltas.join("; ") + ".");
      }
      L.push("");
    }
    if (info.falhas.length) {
      L.push("## Peças que não puderam ser baixadas", "");
      for (const f of info.falhas) L.push("- " + f.id + " — " + f.titulo + " (" + f.motivo + ")");
      L.push("");
    }
    return L.join("\n");
  }

  // `pacotes` vem do `PjePrecatoria.montarPacotes`. `obter(id)` é o mesmo do
  // `montarZip` — devolve `{kind, fmt, b64|text, pages}`.
  async function montarZipPrecatorias(opts) {
    const {
      pacotes,
      obter,
      cnj,
      ficha = null,
      porMovimento = true,
      onEtapa,
      sinal,
      agora = new Date(),
    } = opts;
    const Zip = opts.zip || (typeof window !== "undefined" && window.ZipW);
    if (!Zip) throw new Error("escritor de ZIP indisponível");
    if (!pacotes || !pacotes.length) throw new Error("nenhuma carta precatória para exportar");

    // O NOME DO ARQUIVO leva o processo; o conteúdo do zip NÃO repete isso.
    //
    // Repetia, e era um bug de verdade no Windows: ao "Extrair tudo" o Explorer
    // já cria uma pasta com o nome do .zip, então uma raiz interna homônima
    // duplicava 37 caracteres no caminho. Com os dois níveis que este pacote tem
    // (uma pasta por carta), o caminho passava de 260 — o teto do Windows — e a
    // extração falhava com "O caminho de destino é muito longo". O PDF também
    // "não abria" pelo mesmo motivo: abrir um arquivo de dentro do zip faz o
    // Explorer copiá-lo para %TEMP% com o mesmo caminho comprido, e a cópia
    // falha antes de existir. O zip em si estava correto (CRC e bytes conferidos
    // com um leitor independente) — o defeito era só o comprimento.
    const nomeZip =
      "precatorias-" + (String(cnj || "").replace(/[^\d.-]+/g, "") || "sem-numero");
    const zip = Zip.criar({ data: agora });
    const falhas = [];
    const vistos = new Map(); // id -> conteúdo já baixado (a origem se repete)
    let bytesTotais = 0;
    const info = [];

    for (const p of pacotes) {
      if (sinal && sinal.cancelado) throw new Error("cancelado");
      const pasta = nomePastaPacote(p);
      const arquivos = [];
      // A carta pode vir partida em vários arquivos (o PJe divide documentos
      // grandes): todas as partes entram, numeradas.
      const alvos = [];
      p.carta.forEach((d, k) =>
        alvos.push({ papel: "carta", doc: d, sufixo: p.carta.length > 1 ? "-parte" + (k + 1) : "" })
      );
      if (p.origem) alvos.push({ papel: "origem", doc: p.origem, sufixo: "" });
      if (p.decisao) alvos.push({ papel: "decisao", doc: p.decisao, sufixo: "" });

      // BAIXA TUDO ANTES DE GRAVAR QUALQUER COISA. Não é preciosismo de ordem:
      // se a própria CARTA não vier, a pasta não deve existir. Gravando à medida
      // que baixa, o download falho da carta deixava no zip uma pasta com a
      // denúncia sozinha — que no destino parece um pacote e não é um, e o
      // servidor só descobre depois de abrir. Como a entrada já estaria escrita,
      // não haveria como desfazer.
      const baixados = [];
      for (const alvo of alvos) {
        if (sinal && sinal.cancelado) throw new Error("cancelado");
        const id = alvo.doc.id;
        let c = vistos.get(id);
        if (c === undefined) {
          if (onEtapa) onEtapa(id, "loading");
          try {
            c = await obter(id);
            if (!c) throw new Error("peça vazia");
            vistos.set(id, c);
          } catch (e) {
            vistos.set(id, null);
            falhas.push({
              id,
              titulo: semIdInicial(alvo.doc.titulo) || String(id),
              motivo: (e && e.message) || String(e),
            });
            if (onEtapa) onEtapa(id, "erro");
            continue;
          }
          if (onEtapa) onEtapa(id, "done");
        }
        if (!c) continue; // já falhou numa pasta anterior
        baixados.push({ alvo, c });
      }
      if (!baixados.some((b) => b.alvo.papel === "carta")) {
        // Sem a carta não há pacote. Some da lista de pastas e vira uma linha
        // NOMEADA no LEIA-ME — nunca um sumiço silencioso.
        info.push({
          pasta: pasta,
          n: p.n,
          data: diaIso(p.data),
          arquivos: [],
          faltas: (p.faltas || []).concat("a própria carta precatória não pôde ser baixada"),
          semCarta: true,
        });
        continue;
      }
      for (const { alvo, c } of baixados) {
        if (sinal && sinal.cancelado) throw new Error("cancelado");
        const id = alvo.doc.id;
        const fmt = c.fmt || (c.kind === "pdf" ? "pdf" : "texto");
        const ehBin = c.kind === "pdf" || c.kind === "img";
        const dados = ehBin ? b64ParaBytes(c.b64) : c.text;
        const bytes = ehBin ? dados.length : new TextEncoder().encode(c.text).length;
        bytesTotais += bytes;
        if (bytesTotais > TETO_BYTES) {
          throw new Error(
            "os pacotes somam mais de " +
              Math.round(TETO_BYTES / 1048576) +
              " MB e não cabem num único arquivo aqui. Gere menos cartas por vez."
          );
        }
        const arquivo = nomeArquivoPacote(alvo.papel, alvo.doc, fmt, alvo.sufixo);
        await zip.add(pasta + "/" + arquivo, dados, { comprimir: !ehBin });
        arquivos.push({
          arquivo,
          papel: alvo.papel,
          id,
          titulo: semIdInicial(alvo.doc.titulo) || alvo.doc.titulo || "",
          formato: fmt,
          paginas: c.kind === "pdf" ? c.pages || null : null,
          bytes,
        });
      }
      info.push({
        pasta,
        n: p.n,
        data: diaIso(p.data),
        arquivos,
        faltas: p.faltas || [],
      });
    }

    if (sinal && sinal.cancelado) throw new Error("cancelado");

    const meta = {
      cnj,
      ficha,
      segredo: sobSegredo(ficha),
      porMovimento,
      pacotes: info,
      falhas,
      gerado: agora.toLocaleString("pt-BR"),
      geradoIso: agora.toISOString(),
    };
    await zip.add("LEIA-ME.md", montarLeiaMePacotes(meta));
    await zip.add("pacotes.json", JSON.stringify(meta, null, 2));
    return {
      blob: zip.fechar(),
      nome: nomeZip + ".zip",
      resumo: {
        // só as pastas que de fato existem no zip — contar as que ficaram de
        // fora faria o status prometer um pacote que o usuário não vai achar
        pacotes: info.filter((p) => !p.semCarta).length,
        semCarta: info.filter((p) => p.semCarta).length,
        arquivos: info.reduce((n, p) => n + p.arquivos.length, 0),
        falhas: falhas.length,
        bytes: bytesTotais,
      },
      pacotes: info,
      falhasDetalhe: falhas,
    };
  }

  // ---------------------------------------------------------------------------
  // PACOTE DE TEXTO — um `.md` por peça, com índice
  //
  // Irmão do `montarZip`, e a diferença não é de embalagem: aquele leva o
  // ARQUIVO ORIGINAL da peça (o PDF que o tribunal serve), este leva o TEXTO já
  // extraído dela — a camada nativa do PDF mais o que o OCR local reconheceu.
  //
  // Existe porque o `.md` único do processo inteiro é INDIVISÍVEL: para
  // trabalhar UMA peça é preciso carregar todas, o `grep` não devolve o nome do
  // documento, e não há como pedir "leia só a contestação". O pacote é um
  // SUPERCONJUNTO — o consolidado vai dentro dele —, então escolher este formato
  // não custa o outro.
  //
  // Como `montarZip`, recebe o `zip` INJETÁVEL: um sink de sistema de arquivos
  // satisfaz os mesmos três métodos (é o que o CLI faz com `montarZip`).
  // ---------------------------------------------------------------------------

  // ESCAPE. O título da peça vem dos autos e passa a entrar em DUAS gramáticas
  // novas; cada uma quebra de um jeito próprio, e as duas em SILÊNCIO:
  //
  //  - YAML: "Petição: emenda" faz do valor um mapa aninhado e o arquivo deixa
  //    de ser lido por qualquer parser. Por isso TODO valor de texto sai entre
  //    aspas duplas — inclusive os que "a gente sabe" que são seguros, porque a
  //    exceção é justamente o que se esquece de manter.
  //  - Tabela markdown: um `|` no título fecha a célula e desloca a linha
  //    inteira, trocando o link de uma peça pelo de outra.
  //
  // Mesmo eixo do escape-first do `renderMd` e do `textContent` do preview:
  // conteúdo dos autos nunca vai cru para uma gramática.
  function escYaml(v) {
    if (v === null || v === undefined) return '""';
    if (typeof v === "number" && isFinite(v)) return String(v);
    return (
      '"' +
      String(v)
        .replace(/[\r\n\t]+/g, " ")
        // a barra invertida PRIMEIRO: na ordem inversa, a que este passo insere
        // para escapar a aspa seria ela própria dobrada pelo passo seguinte
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"') +
      '"'
    );
  }

  function escTabela(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/[\r\n]+/g, " ")
      .replace(/\|/g, "\\|");
  }

  // Metadados legíveis por máquina no topo de cada arquivo. O NOME do arquivo já
  // carrega ordem, título e id — é o único metadado que sobrevive a sair da
  // ferramenta —, mas um arquivo LIDO SOZINHO, que é o ponto deste formato,
  // precisa dizer de que PROCESSO ele é e o que dentro dele veio de OCR.
  function frontMatterPeca(p, info) {
    const L = ["---"];
    const par = (k, v) => L.push(k + ": " + escYaml(v));
    par("processo", info.cnj || "");
    par("ordem", p.ordem);
    par("id", String(p.doc.id));
    par("peca", semIdInicial(p.doc.titulo) || p.doc.titulo || "");
    if (p.doc.tipo) par("tipo", p.doc.tipo);
    if (p.doc.juntadoEm) par("juntado_em", p.doc.juntadoEm);
    if (p.doc.juntadoPor) par("juntado_por", p.doc.juntadoPor);
    par("paginas", p.paginas || 0);
    par("paginas_ocr", p.paginasOcr || 0);
    par("paginas_sem_texto", p.paginasSemTexto || 0);
    par("formato_origem", p.formato || "pdf");
    par("extraido_em", info.geradoIso);
    L.push("---", "");
    return L.join("\n");
  }

  // Uma TABELA, ao contrário do `indice.txt` do pacote de peças. Lá a tabela foi
  // recusada porque dez campos só caberiam truncando; aqui são seis campos e,
  // principalmente, o LINK — que só existe em markdown e é o que transforma o
  // índice em navegação.
  function montarIndiceTexto(info) {
    const { cnj, gerado, criterio, itens, falhas, ficha, origemLista } = info;
    const r = info.resumo || {};
    const L = [];
    L.push("# Texto das peças — processo " + (cnj || "(número não identificado)"), "");
    if (sobSegredo(ficha)) {
      L.push(
        "> ## ⛔ Segredo de justiça",
        ">",
        "> Este processo tramita em segredo de justiça. O conteúdo desta pasta é",
        "> de acesso restrito — não redistribua.",
        ""
      );
    }
    L.push(
      "> Extraído pela extensão **TecJustiça PJe** em " + gerado + ".",
      "> Ordem das peças: " + criterio + ".",
      "> " +
        itens.length +
        " peça(s), " +
        (r.pagsNativas || 0) +
        " página(s) com texto nativo" +
        (r.pagsOcr
          ? ", " +
            r.pagsOcr +
            " reconhecida(s) por OCR local (PP-OCRv6" +
            (r.backend ? ", " + r.backend : "") +
            (r.msPorPagina ? ", " + (r.msPorPagina / 1000).toFixed(1) + " s/página" : "") +
            ")"
          : "") +
        (r.pagsSemOcr ? ", " + r.pagsSemOcr + " sem texto reconhecível" : "") +
        ".",
      ""
    );
    if (r.pagsOcr) {
      L.push(
        "> **O texto reconhecido por OCR pode conter erros.** As páginas lidas assim vêm",
        "> marcadas no corpo do arquivo, com a confiança medida — confira no documento",
        "> original antes de citar.",
        ""
      );
    }
    L.push(
      "## O que tem aqui",
      "",
      "- **`pecas/`** — um arquivo `.md` por peça, na ordem dos autos. O topo de cada um",
      "  traz os metadados em YAML (processo, id, tipo, data de juntada, páginas), então",
      "  o arquivo se explica sozinho mesmo lido fora desta pasta.",
      "- **`" + info.arquivoConsolidado + "`** — o processo inteiro num arquivo só, no",
      "  mesmo formato de sempre. É o que alimenta o TecJustiça Sigilo e ferramentas que",
      "  esperam um documento único.",
      "- **`indice.json`** — os mesmos dados desta página, para consumo por programa.",
      "",
      "## Como os arquivos são nomeados",
      "",
      "```",
      "NNN_Titulo-da-peca_ID.md",
      "```",
      "",
      "- **NNN** — posição da peça no processo, em ordem cronológica crescente, para a",
      "  ordenação alfabética da pasta já ser a ordem dos autos. O critério usado nesta",
      "  extração foi: " + criterio + ".",
      "- **ID** — o identificador da peça no PJe. É por ele que ela é reencontrada na",
      "  linha do tempo do processo, e é ele que deve aparecer em qualquer citação.",
      "",
      "O nome é o MESMO do pacote `⬇ Baixar .zip` (que traz os PDFs originais): extraídos",
      "lado a lado, os dois casam peça a peça.",
      "",
      "## Como citar",
      "",
      "```",
      "(Título da peça, id 123456, fl. 7)",
      "```",
      "",
      "O **id** é obrigatório: é o número que abre o título da peça e o único jeito de",
      "quem lê reencontrá-la no PJe. Citar só o nome não serve — processos têm várias",
      "peças com o mesmo nome.",
      ""
    );
    const fichaLinhas = blocoFicha(ficha);
    if (fichaLinhas.length) {
      L.push("## Ficha do processo", "", "```");
      for (const l of fichaLinhas) L.push(l);
      L.push("```", "");
    }
    L.push(
      "## Peças (" + itens.length + ")",
      "",
      "| # | Peça | id | Juntada | Páginas | Arquivo |",
      "|--:|---|--:|---|---|---|"
    );
    for (const it of itens) {
      const pags =
        (it.paginas || 0) +
        (it.paginasOcr ? " (" + it.paginasOcr + " por OCR)" : "") +
        (it.paginasSemTexto ? " · " + it.paginasSemTexto + " sem texto" : "");
      L.push(
        "| " +
          [
            String(it.ordem).padStart(3, "0"),
            escTabela(it.titulo),
            it.id,
            escTabela(it.juntadoEm || "—"),
            pags,
            "[" + escTabela(it.arquivo) + "](pecas/" + encodeURI(it.arquivo) + ")",
          ].join(" | ") +
          " |"
      );
    }
    L.push("");
    if (falhas.length) {
      L.push(
        "## Peças que não entraram (" + falhas.length + ")",
        "",
        "Cada uma consumiu o seu número de ordem, que por isso NÃO aparece em `pecas/` —",
        "é daí que vêm os saltos na numeração (…002, 004…). O salto é a peça que faltou,",
        "não um erro de contagem.",
        "",
        "| # | id | Peça | Motivo |",
        "|--:|--:|---|---|"
      );
      for (const f of falhas) {
        L.push(
          "| " +
            [
              String(f.ordem).padStart(3, "0"),
              f.id,
              // O id já está na coluna anterior; o título das falhas chega do
              // content.js com ele na frente ("123456 - Nome"), e `semIdInicial`
              // é idempotente para quem já vem limpo (o `montarZip` corta na
              // origem).
              escTabela(semIdInicial(f.titulo) || f.titulo || ""),
              escTabela(f.motivo),
            ].join(" | ") +
            " |"
        );
      }
      L.push("");
    }
    L.push(
      "## Limites que valem saber",
      "",
      "- **A lista pode não ser o processo inteiro**: " + origemLista + ".",
      "- **Assinaturas, carimbos e imagens não aparecem aqui.** O que sobrevive é o",
      "  texto; confira sempre no documento original.",
      "- **Página digitalizada sem camada de texto** depende do OCR, e o que ele não",
      "  reconheceu vem marcado no lugar — nunca omitido em silêncio.",
      ""
    );
    return L.join("\n");
  }

  function montarIndiceTextoJson(info) {
    return JSON.stringify(
      {
        processo: info.cnj || null,
        segredoDeJustica: sobSegredo(info.ficha),
        ficha: info.ficha || null,
        geradoEm: info.geradoIso,
        gerador: "TecJustiça PJe (extensão Chrome)",
        conteudo: "texto extraído das peças (camada nativa do PDF + OCR local)",
        ordem: info.criterio,
        origemDaLista: info.origemLista,
        arquivoConsolidado: info.arquivoConsolidado,
        resumo: info.resumo || null,
        total: info.itens.length,
        pecas: info.itens,
        falhas: info.falhas,
      },
      null,
      2
    );
  }

  // opts: {pecas, consolidado, cnj, ficha, origemLista, criterio, resumo, falhas,
  //        agora:Date, zip:{criar}}
  //
  // `pecas`: [{doc, ordem, corpo, paginas, paginasOcr, paginasSemTexto, formato}]
  // — `corpo` é o markdown das páginas, montado pelo content.js. Ele chega
  // PRONTO de propósito: é a MESMA string que entra no consolidado, então os
  // dois formatos não têm como divergir.
  async function montarZipTexto(opts) {
    const {
      pecas = [],
      consolidado = "",
      cnj,
      ficha = null,
      origemLista = "lista lida da linha do tempo do processo",
      criterio = "",
      resumo = null,
      falhas = [],
      agora = new Date(),
    } = opts;
    const Zip = opts.zip || (typeof window !== "undefined" && window.ZipW);
    if (!Zip) throw new Error("escritor de ZIP indisponível");

    // Sem pasta raiz dentro do zip: o Explorer já cria uma com o nome do arquivo
    // ao extrair, e a raiz interna homônima duplicaria o nome no caminho — o
    // defeito medido no pacote de precatórias, onde o Windows recusa acima de
    // 260 caracteres.
    const base = nomePasta(cnj);
    const nomeConsolidado = base + ".md";
    const zip = Zip.criar({ data: agora });

    const info = {
      cnj,
      ficha,
      criterio,
      origemLista,
      resumo,
      falhas,
      arquivoConsolidado: nomeConsolidado,
      gerado: agora.toLocaleString("pt-BR"),
      geradoIso: agora.toISOString(),
      itens: [],
    };

    for (const p of pecas) {
      const arquivo = nomeArquivo(p.doc, p.ordem, "md");
      const texto =
        frontMatterPeca(p, info) + "\n# " + p.doc.titulo + "\n\n" + p.corpo + "\n";
      // O nome REAL é o que volta do `add` (ele desambigua homônimos): usar o
      // pretendido faria o link do índice apontar para um arquivo inexistente.
      const nomeReal = await zip.add("pecas/" + arquivo, texto);
      info.itens.push({
        ordem: p.ordem,
        arquivo: nomeReal.slice("pecas/".length),
        id: p.doc.id,
        titulo: semIdInicial(p.doc.titulo) || p.doc.titulo || "",
        tituloCompleto: p.doc.titulo || "",
        tipo: p.doc.tipo || null,
        juntadoEm: p.doc.juntadoEm || null,
        juntadoPor: p.doc.juntadoPor || null,
        formatoOrigem: p.formato || null,
        paginas: p.paginas || 0,
        paginasOcr: p.paginasOcr || 0,
        paginasSemTexto: p.paginasSemTexto || 0,
        caracteres: p.corpo ? p.corpo.length : 0,
        extras: p.doc.extras && Object.keys(p.doc.extras).length ? p.doc.extras : undefined,
      });
    }

    if (consolidado) await zip.add(nomeConsolidado, consolidado);
    await zip.add("indice.md", montarIndiceTexto(info));
    await zip.add("indice.json", montarIndiceTextoJson(info));

    return {
      blob: zip.fechar(),
      nome: base + "-texto.zip",
      resumo: {
        ok: info.itens.length,
        falhas: falhas.length,
        paginas: info.itens.reduce((n, it) => n + (it.paginas || 0), 0),
      },
      itens: info.itens,
    };
  }

  const api = {
    montarZip,
    montarZipTexto,
    montarIndiceTexto,
    montarIndiceTextoJson,
    frontMatterPeca,
    montarZipPrecatorias,
    nomePastaPacote,
    nomeArquivoPacote,
    montarLeiaMePacotes,
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
