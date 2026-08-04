// Camada de acesso ao PJe. Roda no contexto (mundo isolado) da página dos autos.
// Reutiliza os mecanismos validados ao vivo: timeline no DOM + endpoint REST de download.
var PJE = (function () {
  // Base path do PJe (ex.: "pje1grau"). Deriva da URL para tolerar variações.
  function getBase() {
    return location.pathname.split("/")[1] || "pje1grau";
  }

  // Lê o idProcesso da querystring dos autos.
  function getIdProcesso() {
    return new URLSearchParams(location.search).get("idProcesso");
  }

  // Número CNJ do processo (NNNNNNN-DD.AAAA.J.TR.OOOO). Vai ao system prompt
  // para o modelo não precisar garimpá-lo nos PDFs — sem ele, o título do mapa
  // mental saía com número inventado. O padrão CNJ é nacional, então a mesma
  // regex serve qualquer tribunal.
  // Busca em cascata do barato para o caro: título da aba → cabeçalho dos autos
  // → um PEDAÇO do texto da página. Nunca varrer o body inteiro: a página dos
  // autos é enorme e isto roda no boot. null quando não encontra (todo o
  // consumo é condicional).
  // O cache é POR PROCESSO, não por página: o PJe novo é uma SPA e troca de
  // autos sem recarregar — um cache permanente devolveria o número do processo
  // anterior para o system prompt do processo novo.
  const RE_CNJ = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
  let numeroCache; // undefined = ainda não procurou; null = procurou e não achou
  let numeroCacheDe = null; // idProcesso a que o cache acima pertence
  function getNumeroProcesso() {
    const proc = getIdProcesso();
    if (numeroCache !== undefined && numeroCacheDe === proc) return numeroCache;
    numeroCacheDe = proc;
    // Thunks, não valores: ler innerText da página dos autos custa caro (força
    // layout num DOM enorme) e não pode acontecer quando o título já resolveu.
    const fontes = [
      () => document.title,
      () =>
        (document.querySelector("#navbar, .navbar, #cabecalho, .cabecalho") || {})
          .textContent,
      () => ((document.body && document.body.innerText) || "").slice(0, 5000),
    ];
    for (const f of fontes) {
      const m = String(f() || "").match(RE_CNJ);
      if (m) return (numeroCache = m[0]);
    }
    return (numeroCache = null);
  }

  // ==========================================================================
  // Cabeçalho do processo (classe, assunto, partes…) — para a exportação
  // ==========================================================================
  //
  // O painel de detalhes dos Autos Digitais é a ficha do processo, e sai de
  // graça do DOM que já está na tela. Sem ela, um ZIP das peças chega ao
  // destino sem dizer de que ação se trata, quem são as partes ou qual o valor
  // discutido — informação que está a um seletor de distância.
  //
  // A leitura é BEST-EFFORT em todos os níveis (qualquer falha vira null e a
  // exportação segue sem a ficha): é um enfeite valioso, nunca um requisito.

  // "JOSE SIDOU DA SILVA - CPF: 170.373.523-49 (AUTOR)"
  // "JOSUE CALEBE ... - OAB CE53045 - CPF: 073.706.313-03 (ADVOGADO)"
  // "BANCO ITAU CONSIGNADO S.A. - CNPJ: 33.885.724/0001-19 (REU)"
  //
  // O papel vem entre parênteses NO FIM, e é o que distingue autor de réu e
  // parte de advogado. Puro e exportado para teste — o formato é do PJe, não
  // do navegador.
  function parsePessoa(linha) {
    const t = limparCelula(linha);
    if (!t) return null;
    const mPapel = t.match(/\(([^()]+)\)\s*$/);
    const papel = mPapel ? mPapel[1].trim() : null;
    const semPapel = (mPapel ? t.slice(0, mPapel.index) : t).trim();
    const mDoc = semPapel.match(/\b(CPF|CNPJ)\s*:\s*([\d.\-/]+)/i);
    const mOab = semPapel.match(/\bOAB\s*([A-Z]{2}\s*[\w.-]+)/i);
    // O nome é tudo que vem ANTES do primeiro " - CPF/CNPJ/OAB". Cortar no
    // primeiro hífen quebraria "BANCO ITAU CONSIGNADO S.A." e todo nome
    // composto com hífen.
    const nome = semPapel
      .split(/\s+-\s+(?:CPF|CNPJ|OAB)\b/i)[0]
      .trim()
      .replace(/[\s-]+$/, "");
    if (!nome) return null;
    return {
      nome,
      papel,
      documento: mDoc ? mDoc[2] : null,
      tipoDocumento: mDoc ? mDoc[1].toUpperCase() : null,
      oab: mOab ? mOab[1].replace(/\s+/g, "") : null,
      texto: t,
    };
  }

  // Um polo (#poloAtivo / #poloPassivo): cada <td> é uma parte, e a <ul> que
  // ele contém traz os representantes dela.
  function lerPolo(sel) {
    const box = document.querySelector(sel);
    if (!box) return null;
    const partes = [];
    for (const td of box.querySelectorAll("tbody tr td")) {
      // O titular é o texto do <td> SEM a árvore de representantes; ler o
      // textContent inteiro colaria o nome do advogado no da parte.
      const clone = td.cloneNode(true);
      clone.querySelectorAll("ul").forEach((u) => u.remove());
      const titular = parsePessoa(clone.textContent);
      if (!titular) continue;
      const representantes = [];
      for (const li of td.querySelectorAll("ul li")) {
        const p = parsePessoa(li.textContent);
        if (p) representantes.push(p);
      }
      partes.push(Object.assign(titular, { representantes }));
    }
    return partes.length ? partes : null;
  }

  // Ficha completa: {campos:{rótulo->valor}, poloAtivo, poloPassivo, numero}.
  function lerCabecalhoProcesso() {
    try {
      const campos = {};
      const det = document.querySelector("#maisDetalhes");
      if (det) {
        // Os pares vivem em VÁRIOS <dl class="dl-horizontal"> irmãos (o PJe
        // quebra órgão julgador, cargo e competência em blocos próprios), por
        // isso varremos todos em vez de pegar o primeiro.
        for (const dl of det.querySelectorAll("dl")) {
          let rotulo = null;
          for (const el of dl.children) {
            if (el.tagName === "DT") {
              rotulo = limparCelula(el.textContent).replace(/\s*[:?]+$/, "");
            } else if (el.tagName === "DD" && rotulo) {
              // <dd> pode conter uma <ul> (Assunto costuma ser lista)
              const itens = [...el.querySelectorAll("li")]
                .map((li) => limparCelula(li.textContent))
                .filter(Boolean);
              const valor = itens.length ? itens.join("; ") : limparCelula(el.textContent);
              if (valor) campos[rotulo] = valor;
              rotulo = null;
            }
          }
        }
      }
      const poloAtivo = lerPolo("#poloAtivo");
      const poloPassivo = lerPolo("#poloPassivo");
      if (!Object.keys(campos).length && !poloAtivo && !poloPassivo) return null;
      return { numero: getNumeroProcesso(), campos, poloAtivo, poloPassivo };
    } catch (e) {
      console.debug("[PJe IA] cabeçalho do processo:", e && e.message);
      return null;
    }
  }

  // Varre a timeline (#divTimeLine) e devolve [{id, titulo}] sem duplicatas.
  function listarDocumentos() {
    const links = [...document.querySelectorAll("#divTimeLine a")];
    const seen = new Set();
    const out = [];
    for (const a of links) {
      const t = (a.textContent || "").trim().replace(/\s+/g, " ");
      const m = t.match(/^(\d{6,})\s*-\s*(.+)$/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        out.push({ id: m[1], titulo: t.slice(0, 140) });
      }
    }
    return out;
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Localiza o <a> de uma peça na timeline (usado pela ativação e pelo scroll).
  function acharLink(id) {
    return (
      [...document.querySelectorAll("#divTimeLine a")].find((a) =>
        (a.textContent || "").trim().startsWith(id)
      ) || null
    );
  }

  // O endpoint de download é STATEFUL: o servidor só autoriza a peça que foi
  // "aberta" na sessão. Quando o download dá 404, disparamos o clique da peça
  // na timeline (A4J) para registrá-la e tentamos de novo. As ativações são
  // serializadas — o JSF não tolera dois submits simultâneos na mesma view.
  let activationChain = Promise.resolve();
  function ativarPeca(id) {
    const run = async () => {
      const link = acharLink(id);
      if (!link) throw new Error("peça " + id + " não está visível na linha do tempo");
      link.click();
      // aguarda o servidor registrar a peça na sessão (poll no próprio download)
      const url =
        "/" + getBase() + "/seam/resource/rest/pje-legacy/documento/download/" + id;
      for (let i = 0; i < 8; i++) {
        await sleep(700);
        const probe = await fetch(url, { method: "HEAD", credentials: "include" });
        if (probe.ok) return;
      }
      throw new Error("o PJe não liberou a peça " + id + " a tempo — tente novamente");
    };
    activationChain = activationChain.then(run, run);
    return activationChain;
  }

  // Sigla do tribunal a partir do host: o rótulo imediatamente antes de
  // "jus.br" (pje.tjce.jus.br → TJCE; pje1g.trf5.jus.br → TRF5). Devolve null
  // no que não casar (ex.: *.cloud.pje.jus.br) — aí só a rota curta é usada.
  function siglaTribunal() {
    const p = location.hostname.split(".");
    const i = p.indexOf("jus");
    return i > 0 && p[i - 1] && p[i - 1] !== "pje" ? p[i - 1].toUpperCase() : null;
  }

  function grauAtual() {
    return /2grau|2g(?![a-z])/.test(getBase() + " " + location.hostname) ? "2g" : "1g";
  }

  // Rotas de download, da mais capaz para a mais antiga:
  //  1. COMPLETA — .../download/{TRIBUNAL}/{grau}/{idProcesso}/{idDocumento}
  //     serve os DOIS tipos de peça: as nascidas digitais (HTML — decisões,
  //     despachos, petições do editor) e as com binário (PDF).
  //  2. CURTA — .../download/{idDocumento}
  //     existe por retrocompatibilidade e **só funciona para os PDFs**: para as
  //     peças HTML o servidor devolve uma casca vazia, porque sem o contexto do
  //     processo ele não sabe montar o documento. Era daí que vinha boa parte
  //     das "peças vazias" que só a ativação na timeline resolvia.
  function urlsDownload(id) {
    const base = "/" + getBase() + "/seam/resource/rest/pje-legacy/documento/download/";
    const trib = siglaTribunal();
    const proc = getIdProcesso();
    const urls = [];
    if (trib && proc) urls.push(base + trib + "/" + grauAtual() + "/" + proc + "/" + id);
    urls.push(base + id);
    return urls;
  }

  // Baixa a peça tentando as rotas em ordem e aceitando a primeira que devolva
  // CORPO ÚTIL — não basta HTTP 200: a rota curta responde 200 com uma casca
  // vazia quando a peça é HTML, e é justamente esse caso que a rota completa
  // resolve. Se nenhuma servir, ativa a peça na timeline (o endpoint REST só
  // libera o que já foi "aberto" na sessão JSF) e repete.
  async function baixar(id) {
    const urls = urlsDownload(id);
    let ultimoStatus = 0;
    const tentarRotas = async () => {
      for (const u of urls) {
        let r;
        try {
          r = await fetch(u, { credentials: "include" });
        } catch {
          continue; // falha de rede nesta rota: tenta a próxima
        }
        ultimoStatus = r.status;
        if (!r.ok) continue;
        const corpo = await lerCorpo(r, id);
        if (corpo) return corpo;
      }
      return null;
    };

    let corpo = await tentarRotas();
    if (corpo) return corpo;

    // Ativação é o caminho lento (~5,6 s e serializado na sessão JSF) e depende
    // de a peça estar NA TIMELINE — peças que só a grid conhece podem não estar.
    try {
      await ativarPeca(id);
    } catch {
      /* sem link na timeline: ainda assim tentamos de novo abaixo */
    }
    corpo = await tentarRotas();
    if (corpo) return corpo;

    throw new Error(
      ultimoStatus && ultimoStatus !== 200
        ? "falha ao baixar a peça " + id + " (HTTP " + ultimoStatus + ")"
        : "a peça " + id + " retornou vazia — abra-a na linha do tempo do processo e tente novamente"
    );
  }

  // Conta as páginas de um PDF por heurística no binário, em três passos:
  // 1) ocorrências de "/Type /Page" (objetos de página) no texto cru;
  // 2) maior "/Count N" da árvore de páginas;
  // 3) PDFs modernos guardam os objetos em object streams comprimidos — nada
  //    aparece no cru; descomprime os streams /ObjStm (FlateDecode) com a API
  //    nativa do navegador e conta os objetos de página lá dentro.
  const RE_PAGINA = /\/Type\s*\/Page(?![a-zA-Z])/g;
  // Sinais estruturais colhidos NA MESMA varredura (a string latin1 já existe,
  // então contá-los é de graça): fontes declaradas, imagens, e os filtros de
  // compressão típicos de digitalização.
  const RE_FONTE = /\/Font(?![a-zA-Z])/g;
  const RE_IMAGEM = /\/Subtype\s*\/Image(?![a-zA-Z])/g;
  const RE_FILTRO_SCAN = /\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)(?![a-zA-Z])/g;
  // Acima disto a página quase certamente é uma imagem: peça com texto nativo
  // fica em 5–30 KB/página; digitalização a 200 dpi vai de 80 a 400 KB/página.
  // ÚNICO ponto de calibragem da classificação — mexer aqui muda a decisão toda.
  const PDF_KB_PAGINA_SCAN = 80;

  function contarRe(s, re) {
    const m = s.match(re);
    return m ? m.length : 0;
  }

  // Analisa o binário do PDF: número de páginas + os sinais que dizem se a peça
  // é texto nativo ou digitalização. Devolve sempre um objeto (nunca lança).
  //
  // A classificação existe para rotear a extração de texto: PDF nativo tem a
  // camada de texto lida DE GRAÇA pelo pdf.js local; digitalização precisa de
  // OCR pago. Errar para o lado "nativo" é barato (o pdf.js devolve pouco texto
  // e a peça cai no OCR); errar para "escaneado" gastaria dinheiro à toa — por
  // isso os sinais fortes vêm primeiro e o peso por página é o último recurso.
  async function analisarPdf(blob) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const s = new TextDecoder("latin1").decode(bytes);
      let pages = contarRe(s, RE_PAGINA);
      let fontes = contarRe(s, RE_FONTE);
      let imagens = contarRe(s, RE_IMAGEM);
      let scans = contarRe(s, RE_FILTRO_SCAN);
      if (!pages) {
        let max = 0;
        const re = /\/Count\s+(\d+)/g;
        let mm;
        while ((mm = re.exec(s))) max = Math.max(max, parseInt(mm[1], 10));
        pages = max;
      }
      // Objetos em ObjStm não aparecem no cru — nem as páginas, nem as fontes.
      // Só inflamos quando a contagem de páginas falhou (é o gatilho original):
      // inflar 400 streams só para procurar /Font custaria caro em toda peça, e
      // o peso por página já responde a pergunta nesses casos.
      if (!pages) {
        const obj = await varrerObjStm(bytes, s);
        pages = obj.pages;
        fontes += obj.fontes;
        imagens += obj.imagens;
        scans += obj.scans;
      }
      if (!pages) pages = 1;
      const kbPagina = blob.size / 1024 / pages;
      // Três sinais, do mais confiável para o mais fraco:
      //  1. nenhuma fonte declarada e há imagem → pilha de digitalizações;
      //  2. ~uma imagem de scan por página E página pesada → digitalizado COM
      //     camada de OCR do scanner (aqui o /Font existe, mas vem do carimbo de
      //     assinatura eletrônica do PJe, não do conteúdo — por isso /Font
      //     sozinho NUNCA basta para concluir que a peça é nativa);
      //  3. só o peso por página — único sinal quando os objetos ficaram em
      //     ObjStm e não foram inflados.
      let escaneado;
      if (!fontes && imagens) escaneado = true;
      else if (scans >= pages * 0.8 && kbPagina > PDF_KB_PAGINA_SCAN) escaneado = true;
      else escaneado = kbPagina > PDF_KB_PAGINA_SCAN * 2;
      return { pages, fontes, imagens, scans, kbPagina, escaneado };
    } catch {
      return { pages: 1, fontes: 0, imagens: 0, scans: 0, kbPagina: 0, escaneado: false };
    }
  }

  // Latin1 preserva a relação 1:1 entre índice na string e offset no binário —
  // por isso dá para achar "stream"/"endstream" na string e fatiar os bytes.
  async function varrerObjStm(bytes, s) {
    const out = { pages: 0, fontes: 0, imagens: 0, scans: 0 };
    let lidos = 0;
    const re = /\/Type\s*\/ObjStm/g;
    let m;
    while ((m = re.exec(s)) && lidos < 400) {
      const st = s.indexOf("stream", m.index);
      if (st < 0) break;
      let ini = st + 6;
      if (s.charCodeAt(ini) === 13) ini++;
      if (s.charCodeAt(ini) === 10) ini++;
      let fim = s.indexOf("endstream", ini);
      if (fim < 0) break;
      // remove o fim-de-linha entre os dados e "endstream" (bytes extras
      // depois do terminador zlib fariam a descompressão falhar)
      while (fim > ini && (s.charCodeAt(fim - 1) === 10 || s.charCodeAt(fim - 1) === 13)) fim--;
      lidos++;
      try {
        const txt = new TextDecoder("latin1").decode(await inflar(bytes.subarray(ini, fim)));
        out.pages += contarRe(txt, RE_PAGINA);
        out.fontes += contarRe(txt, RE_FONTE);
        out.imagens += contarRe(txt, RE_IMAGEM);
        out.scans += contarRe(txt, RE_FILTRO_SCAN);
      } catch {
        /* stream com outro filtro ou corrompido: ignora e segue */
      }
    }
    return out;
  }

  // Descomprime um stream FlateDecode (formato zlib) com DecompressionStream.
  async function inflar(u8) {
    const ds = new DecompressionStream("deflate");
    const st = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(st).arrayBuffer());
  }

  // Interpreta o corpo da resposta. Devolve null quando veio vazio
  // (PDF de 0 bytes ou texto em branco após a extração).
  // Detecção de PDF em DUAS camadas: content-type E assinatura %PDF- no início
  // do binário — o PJe pode servir PDF como application/octet-stream (ou sem
  // content-type), e sem o sniff a peça cairia no ramo de texto virando lixo
  // UTF-8 no contexto (até ~17 mil tokens desperdiçados por peça).
  // ---------------------------------------------------------------- RTF ----
  // O PJe serve peças em três formatos: PDF (digitalizados e anexos), HTML
  // (nascidas do editor atual) e **RTF** (nascidas do editor antigo — comuns em
  // processos migrados). Sem tratar o RTF, a peça chegava ao modelo como um
  // despejo de marcação (`{\rtf1\ansi\deff0{\fonttbl…`), gastando milhares de
  // tokens de lixo e sem o texto legível.
  //
  // Extrator próprio, sem biblioteca: RTF é ASCII com grupos entre chaves e
  // "control words" (`\par`, `\tab`, `\'e7`…). Extraímos apenas o TEXTO.

  // 0x80–0x9F do CP1252 não batem com Latin-1/Unicode (é onde ficam as aspas
  // curvas e o travessão). Os acentos do português vivem em 0xC0–0xFF, que
  // coincidem — por isso só estes precisam de mapa.
  const CP1252_ALTO = {
    128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡",
    136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ", 142: "Ž", 145: "‘",
    146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 152: "˜",
    153: "™", 154: "š", 155: "›", 156: "œ", 158: "ž", 159: "Ÿ",
  };

  // Grupos cujo CONTEÚDO não é texto do documento. `\*` marca destinos
  // ignoráveis por especificação; os demais são as tabelas de cabeçalho.
  // O `\b` vale só para as PALAVRAS: depois de `\*` não existe boundary (nem
  // `*` nem a `\` seguinte são caracteres de palavra), então um `\b` global
  // fazia `{\*\generator …}` escapar da poda e o texto do grupo vazava.
  const RTF_GRUPOS_MORTOS =
    /^\\(?:\*|(?:fonttbl|colortbl|stylesheet|info|pntext|listtable|listoverridetable|rsidtbl|generator|themedata|datastore|xmlnstbl|latentstyles)\b)/;

  function rtfParaTexto(rtf) {
    const s = String(rtf || "");
    let out = "";
    let i = 0;
    let pularUnicode = 0; // \ucN — quantos caracteres de fallback ignorar
    while (i < s.length) {
      const c = s[i];

      if (c === "{") {
        // grupo morto? pula o bloco inteiro, respeitando o balanceamento
        const resto = s.slice(i + 1, i + 40);
        if (RTF_GRUPOS_MORTOS.test(resto)) {
          let nivel = 0;
          while (i < s.length) {
            if (s[i] === "\\" && (s[i + 1] === "{" || s[i + 1] === "}")) { i += 2; continue; }
            if (s[i] === "{") nivel++;
            else if (s[i] === "}") {
              nivel--;
              if (nivel === 0) { i++; break; }
            }
            i++;
          }
          continue;
        }
        i++;
        continue;
      }
      if (c === "}") { i++; continue; }

      if (c === "\\") {
        const n = s[i + 1];
        if (n === "\\" || n === "{" || n === "}") { out += n; i += 2; continue; }
        if (n === "\n" || n === "\r") { out += "\n"; i += 2; continue; }
        if (n === "'") {
          const code = parseInt(s.substr(i + 2, 2), 16);
          if (!isNaN(code)) {
            if (pularUnicode > 0) pularUnicode--;
            else out += CP1252_ALTO[code] || String.fromCharCode(code);
          }
          i += 4;
          continue;
        }
        const m = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(s.slice(i));
        if (!m) { i += 2; continue; } // \<símbolo> desconhecido
        const palavra = m[1];
        const arg = m[2] != null ? parseInt(m[2], 10) : null;
        if (palavra === "par" || palavra === "line" || palavra === "sect") out += "\n";
        else if (palavra === "tab") out += "\t";
        else if (palavra === "uc") pularUnicode = 0; // reinicia a contagem
        else if (palavra === "u" && arg != null) {
          out += String.fromCharCode(arg < 0 ? arg + 65536 : arg);
          pularUnicode = 1; // o caractere seguinte é o fallback ANSI
        }
        i += m[0].length;
        continue;
      }

      if (c === "\r" || c === "\n") { i++; continue; } // quebras do arquivo não são texto
      if (pularUnicode > 0) { pularUnicode--; i++; continue; }
      out += c;
      i++;
    }
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function lerCorpo(r, id) {
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const blob = await r.blob();
    let ehPdf = ct.includes("pdf");
    let ehRtf = ct.includes("rtf");
    // Assinatura no binário: o PJe legado serve tanto PDF quanto RTF como
    // octet-stream, e confiar só no content-type mandaria RTF para o ramo de
    // texto (o modelo receberia a marcação crua) ou PDF para o de texto (17 mil
    // tokens de lixo binário).
    if (!ehPdf && !ehRtf && !ct.includes("html") && blob.size >= 5) {
      const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
      const inicio = String.fromCharCode(...head);
      ehPdf = inicio.includes("%PDF-");
      if (!ehPdf) ehRtf = /^\s*\{\\rtf/.test(inicio);
    }
    if (ehPdf) {
      if (!blob.size) {
        console.debug("[PJe IA] peça", id, "PDF de 0 bytes");
        return null;
      }
      const an = await analisarPdf(blob);
      const pages = an.pages;
      console.debug(
        "[PJe IA] peça", id, "PDF de", blob.size, "bytes,", pages, "página(s),",
        an.escaneado ? "digitalizada" : "texto nativo",
        "(" + Math.round(an.kbPagina) + " KB/pág, " + an.fontes + " fonte(s), " +
          an.imagens + " imagem(ns))"
      );
      const b64 = await blobToB64(blob);
      // `fmt` guarda o formato de ORIGEM da peça. `kind` diz como o conteúdo
      // viaja daqui em diante (pdf x texto) e é o que o envio usa; `fmt`
      // preserva a distinção que o `kind` achata — HTML e RTF viram ambos
      // "text" — e é o que a exportação em ZIP registra no índice.
      //
      // `escaneado` e `imagens` são ADITIVOS: roteiam a extração de texto
      // (nativo → pdf.js local e grátis; digitalizado → OCR pago) e alimentam o
      // aviso de que extrair apaga o canal visual. Quem não usa a extração não
      // enxerga diferença nenhuma neste objeto.
      return {
        kind: "pdf", fmt: "pdf", b64, size: blob.size, pages,
        escaneado: an.escaneado, imagens: an.imagens,
      };
    }
    // blob.text() decodifica sempre UTF-8; honra o charset do header quando
    // outro (PJe legado pode servir HTML em ISO-8859-1 — acentuação).
    let raw;
    const charset = (ct.match(/charset=([\w-]+)/) || [])[1];
    if (charset && !/^utf-?8$/i.test(charset)) {
      try {
        raw = new TextDecoder(charset).decode(await blob.arrayBuffer());
      } catch {
        raw = await blob.text();
      }
    } else {
      raw = await blob.text();
    }
    // Peças RTF (editor antigo do PJe, comuns em processos migrados): extrai o
    // texto. Sem isto o modelo receberia `{\rtf1\ansi\deff0{\fonttbl…` inteiro.
    let text = raw;
    if (ehRtf) {
      const extraido = rtfParaTexto(raw);
      console.debug(
        "[PJe IA] peça", id, "RTF de", blob.size, "bytes →", extraido.length, "chars de texto"
      );
      text = extraido.trim();
      if (!text) return null;
      return { kind: "text", fmt: "rtf", text };
    }
    // Peças HTML: extrai só o texto legível (sem tags/scripts) para o modelo.
    if (ct.includes("html")) {
      try {
        const doc = new DOMParser().parseFromString(raw, "text/html");
        doc.querySelectorAll("script,style").forEach((n) => n.remove());
        text = (doc.body ? doc.body.textContent : raw).replace(/\n{3,}/g, "\n\n");
      } catch {
        /* mantém o bruto */
      }
    }
    text = text.trim();
    console.debug("[PJe IA] peça", id, "texto de", text.length, "chars (" + ct + ")");
    if (!text) return null;
    return { kind: "text", fmt: ct.includes("html") ? "html" : "texto", text };
  }

  // Rola a timeline do PJe até a peça e a destaca com um flash temporário.
  // NÃO clica no link (zero efeito A4J/JSF, não entra na activationChain) —
  // é só navegação visual. Retorna false quando a peça não está na timeline
  // (SPA pode não ter carregado o trecho); o chamador orienta o usuário.
  // O estilo do flash é injetado no DOM da PÁGINA (o alvo vive fora do
  // Shadow DOM do painel, onde o CSS da extensão não alcança).
  function garantirEstiloFlash() {
    if (document.getElementById("pje-ia-flash-style")) return;
    const st = document.createElement("style");
    st.id = "pje-ia-flash-style";
    st.textContent =
      "@keyframes pjeIaFlash{0%,100%{box-shadow:0 0 0 0 rgba(0,120,170,0);background:transparent}" +
      "20%{box-shadow:0 0 0 5px rgba(0,120,170,.45);background:rgba(0,120,170,.16)}}" +
      ".pje-ia-flash{animation:pjeIaFlash 1.1s ease-out 2;border-radius:4px}";
    document.head.appendChild(st);
  }

  let flashEl = null;
  let flashTimer = null;
  function scrollAte(id) {
    const link = acharLink(id);
    if (!link) return false;
    garantirEstiloFlash();
    const alvo = link.closest("li, tr, .media") || link.parentElement || link;
    if (flashEl) {
      flashEl.classList.remove("pje-ia-flash");
      clearTimeout(flashTimer);
    }
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    void alvo.offsetWidth; // reinicia a animação quando o alvo é o mesmo nó
    alvo.classList.add("pje-ia-flash");
    flashEl = alvo;
    flashTimer = setTimeout(() => {
      alvo.classList.remove("pje-ia-flash");
      flashEl = null;
    }, 2400);
    return true;
  }

  // A timeline carrega as peças sob demanda (scroll infinito): em processos
  // maiores, só o trecho já rolado existe no DOM — e, portanto, na lista do
  // painel. Esta função faz o trabalho pelo usuário: rola o container da
  // timeline programaticamente até o fim, aguarda cada leva chegar do
  // servidor e repete até a lista parar de crescer (ou 90 s). NÃO clica em
  // nada — zero efeito na activationChain; é o mesmo gesto de rolagem que o
  // usuário faria à mão (a rolagem programática dispara o evento scroll
  // nativo que o lazy load do PJe escuta). Ao final, devolve a rolagem para
  // onde estava. onProgress recebe o total de peças a cada rodada.
  function rolavel(el) {
    return (
      /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight + 10
    );
  }

  function acharScroller(tl) {
    // O elemento que de fato rola varia por tribunal/tema. No TJCE (validado
    // ao vivo) é um DESCENDENTE da timeline: div.eventos-timeline.scroll-y —
    // o #divTimeLine em si e todos os seus ancestrais têm overflow visible.
    // Ordem de busca: (1) descendente rolável que contenha os links das
    // peças; (2) ancestral rolável; (3) a janela, como último recurso.
    const desc = [...tl.querySelectorAll("*")].find(
      (el) => rolavel(el) && el.querySelector("a")
    );
    if (desc) return desc;
    for (let el = tl; el && el !== document.body; el = el.parentElement) {
      if (rolavel(el)) return el;
    }
    return window;
  }

  async function carregarTimelineCompleta(onProgress) {
    let tl = document.querySelector("#divTimeLine");
    if (!tl) return { total: 0, completo: true };
    const scrollAntes = (() => {
      const sc = acharScroller(tl);
      return sc === window ? window.scrollY : sc.scrollTop;
    })();
    const contar = () => document.querySelectorAll("#divTimeLine a").length;
    const inicio = Date.now();
    const TETO_MS = 90000;
    let total = contar();
    let estaveis = 0; // rodadas seguidas sem crescimento — 2 encerram
    while (estaveis < 2 && Date.now() - inicio < TETO_MS) {
      // Re-localiza timeline e scroller a CADA rodada: o re-render A4J que
      // anexa as peças novas pode substituir os nós no DOM — uma referência
      // guardada apontaria para um elemento morto e a rolagem viraria no-op.
      tl = document.querySelector("#divTimeLine");
      if (!tl) break; // página re-renderizou/navegou no meio
      const sc = acharScroller(tl);
      if (sc === window) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else {
        sc.scrollTop = sc.scrollHeight;
      }
      let cresceu = false;
      for (let i = 0; i < 10 && !cresceu; i++) {
        await sleep(300);
        const agora = contar();
        if (agora > total) {
          total = agora;
          cresceu = true;
        }
      }
      if (onProgress) onProgress(listarDocumentos().length);
      estaveis = cresceu ? 0 : estaveis + 1;
    }
    const tlFim = document.querySelector("#divTimeLine");
    if (tlFim) {
      const sc = acharScroller(tlFim);
      if (sc === window) window.scrollTo(0, scrollAntes);
      else sc.scrollTop = scrollAntes;
    }
    return {
      total: listarDocumentos().length,
      completo: Date.now() - inicio < TETO_MS,
    };
  }

  // Converte Blob -> base64 puro (sem prefixo data: e sem quebras de linha).
  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = String(fr.result);
        resolve(s.slice(s.indexOf(",") + 1));
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // ==========================================================================
  // Rota alternativa de listagem: a tela "Documentos" (grid paginada)
  //
  // Os Autos Digitais listam por SCROLL INFINITO, e "parou de crescer" é um
  // heurístico temporal, não uma garantia: se o servidor demorar mais que a
  // janela de espera, `carregarTimelineCompleta` para cedo e devolve uma lista
  // parcial SEM ERRO NENHUM. A tela "Documentos" (menu ☰ → Documentos) é uma
  // grid tabular paginada que resolve isso — ela informa o TOTAL de páginas, o
  // que dá um oráculo de completude: dá para AFIRMAR que leu tudo, e avisar
  // quando não leu. De quebra traz o TIPO oficial da peça ("Despacho de Mero
  // Expediente", "Certidão de Intimação"), a data da juntada e quem juntou —
  // nada disso existe na timeline, onde a categoria é adivinhada por regex.
  //
  // POR QUE UM IFRAME e não uma aba em segundo plano: a paginação faz POST de
  // página INTEIRA e recria o documento, então não dá para segurar estado nele
  // — e fazer isso na aba do usuário tiraria da tela o documento que ele está
  // lendo. Um iframe oculto same-origin isola o documento destruído sem custar
  // as permissões `tabs`+`scripting` (que mudariam o aviso de instalação da
  // Web Store), e o estado da paginação fica aqui, no content script. Dentro do
  // iframe clicamos no link REAL: quem monta o POST do RichFaces é o próprio
  // A4J do PJe, então não replicamos parâmetros de JSF na mão.
  //
  // Tudo aqui é BEST-EFFORT: qualquer falha devolve null e o chamador cai no
  // scroll de sempre. Nunca lançar para o content script.
  // ==========================================================================

  const semAcento = (s) =>
    String(s == null ? "" : s).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

  // Os <th> do RichFaces vêm com <script> CDATA embutido no texto.
  function limparCelula(t) {
    return String(t == null ? "" : t)
      .replace(/\/\/<!\[CDATA\[[\s\S]*?\/\/\]\]>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Assinatura mínima da grid de documentos: uma tabela com Id + Juntado em +
  // Tipo só pode ser essa. É o segundo critério porque o id
  // `processoDocumentoGridList` some conforme o A4J re-renderiza.
  const GRID_ASSINATURA = ["id", "juntado em", "tipo"];

  function acharGrid(doc) {
    const cands = [];
    const porId = doc.querySelector("#processoDocumentoGridList");
    if (porId) {
      const t = porId.tagName === "TABLE" ? porId : porId.querySelector("table");
      if (t) cands.push(t);
    }
    for (const tb of doc.querySelectorAll("table")) {
      const ths = [...tb.querySelectorAll("th")].map((th) => semAcento(limparCelula(th.textContent)));
      if (ths.length < 3) continue;
      const casa = GRID_ASSINATURA.every((c) =>
        ths.some((t) => t === semAcento(c) || t.indexOf(semAcento(c)) === 0)
      );
      if (casa && cands.indexOf(tb) < 0) cands.push(tb);
    }
    if (!cands.length) return null;
    // As tabelas do RichFaces são ANINHADAS e o ancestral aparece antes na
    // ordem do documento. Queremos a mais INTERNA: se pegássemos a de fora, os
    // <th> de tudo o que ela embrulha desalinhariam o mapa de colunas.
    return cands.find((t) => !cands.some((o) => o !== t && t.contains(o))) || cands[cands.length - 1];
  }

  // Mapa nome-da-coluna -> índice, lido do CABEÇALHO. Se um tribunal reordenar
  // ou acrescentar coluna, o parser acompanha em vez de ler o campo errado.
  function mapaColunas(tb) {
    for (const tr of tb.querySelectorAll("tr")) {
      const ths = [...tr.children].filter((c) => c.tagName === "TH");
      if (ths.length < 3) continue;
      const mapa = {};
      ths.forEach((th, i) => {
        const nome = semAcento(limparCelula(th.textContent));
        if (nome && !(nome in mapa)) mapa[nome] = i;
      });
      if ("id" in mapa) return mapa;
    }
    return null;
  }

  // Colunas que viram campo próprio. As DEMAIS não são descartadas: vão para
  // `extras`, porque a grid varia de tribunal para tribunal (sigilo, matéria,
  // órgão, situação…) e um parser que só lê as cinco que eu conheço joga fora
  // exatamente o que aquele tribunal tem de particular. Como o mapa de colunas
  // é lido do cabeçalho, colunas novas entram sozinhas.
  const COLUNAS_PROPRIAS = new Set(["id", "documento", "tipo", "juntado em", "juntado por"]);

  function lerLinhas(tb, mapa) {
    const out = [];
    const cel = (tds, nome) => {
      const i = mapa[semAcento(nome)];
      return i == null || !tds[i] ? "" : limparCelula(tds[i].textContent);
    };
    const extrasDe = (tds) => {
      const ex = {};
      for (const nome of Object.keys(mapa)) {
        if (COLUNAS_PROPRIAS.has(nome)) continue;
        const i = mapa[nome];
        const v = tds[i] ? limparCelula(tds[i].textContent) : "";
        // Colunas de ação (o ícone de download, o checkbox) chegam vazias —
        // guardá-las só encheria o índice de campos sem valor.
        if (v) ex[nome] = v;
      }
      return ex;
    };
    for (const tr of tb.querySelectorAll("tr")) {
      const tds = [...tr.children].filter((c) => c.tagName === "TD");
      if (tds.length < 3) continue;
      const id = cel(tds, "id");
      if (!/^\d{4,}$/.test(id)) continue; // cabeçalho, rodapé ou linha de controle
      const documento = cel(tds, "documento");
      const tipo = cel(tds, "tipo");
      out.push({
        id,
        // MESMO formato da timeline ("123456 - Nome"): é por ele que o id
        // viaja até o modelo, no `title` do bloco document.
        titulo: (id + " - " + (documento || tipo || "Documento")).slice(0, 140),
        tipo,
        juntadoEm: cel(tds, "juntado em"),
        juntadoPor: cel(tds, "juntado por"),
        extras: extrasDe(tds),
      });
    }
    return out;
  }

  function totalPaginasGrid(doc) {
    const el = doc.querySelector(".rich-inslider-right-num");
    const v = parseInt(limparCelula(el && el.textContent), 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  // Carimba o documento ANTES de submeter: o documento novo nasce sem o
  // atributo. Sem isso não há como saber que a página trocou — o valor do
  // slider foi escrito por nós, então testá-lo passa na página velha.
  function carimbar(doc) {
    try {
      doc.documentElement.setAttribute("data-pje-stale", "1");
    } catch {
      /* documento já substituído */
    }
  }

  function irParaPagina(doc, n) {
    const inp = doc.querySelector("input.rich-inslider-field");
    if (!inp) return false;
    const W = doc.defaultView; // eventos precisam ser do realm do IFRAME
    carimbar(doc);
    inp.value = String(n);
    for (const ev of ["input", "change", "blur"]) {
      inp.dispatchEvent(new W.Event(ev, { bubbles: true }));
    }
    inp.dispatchEvent(
      new W.KeyboardEvent("keyup", { bubbles: true, key: "Enter", keyCode: 13 })
    );
    return true;
  }

  // Documento do iframe, ou null se a origem estiver bloqueada (X-Frame-Options).
  function docDe(iframe) {
    try {
      return iframe.contentDocument || null;
    } catch {
      return null; // cross-origin: o tribunal barrou o enquadramento
    }
  }

  // Assinatura do conteúdo da grid: os ids da 1ª e da última linha. Serve para
  // detectar troca de página quando o carimbo não some (ver abaixo).
  function assinaturaGrid(tb, mapa) {
    const linhas = lerLinhas(tb, mapa || mapaColunas(tb) || {});
    if (!linhas.length) return "";
    return linhas[0].id + ":" + linhas[linhas.length - 1].id + ":" + linhas.length;
  }

  // Pronto = carregado + grid presente + (se pedido) o slider na página
  // esperada + evidência de que o documento é NOVO.
  //
  // A evidência tem duas fontes porque o carimbo sozinho não basta: ele prova
  // troca quando o A4J faz POST de página inteira (o documento novo nasce sem o
  // atributo), mas se a resposta vier como AJAX PARCIAL o documento é o mesmo,
  // o carimbo permanece e a espera nunca terminaria. Por isso aceitamos também
  // "a grid mudou de conteúdo" — e, no primeiro acesso, a simples existência da
  // grid já é a prova (antes do clique não havia nenhuma).
  //
  // Timeouts generosos: ~270 KB de HTML com <script> inline por linha deixam o
  // renderer sem resposta por dezenas de segundos.
  async function esperarGrid(iframe, opts) {
    const { pagina = null, assinaturaAntes = null, tetoMs = 30000 } = opts || {};
    const fim = Date.now() + tetoMs;
    while (Date.now() < fim) {
      await sleep(400);
      const doc = docDe(iframe);
      if (!doc || doc.readyState !== "complete") continue;
      const tb = acharGrid(doc);
      if (!tb) continue;
      const semCarimbo = !doc.documentElement.hasAttribute("data-pje-stale");
      const mudou =
        assinaturaAntes != null && assinaturaGrid(tb) !== assinaturaAntes;
      // primeiro acesso (sem assinatura anterior): achar a grid já é a prova
      if (assinaturaAntes != null && !semCarimbo && !mudou) continue;
      if (pagina != null) {
        const inp = doc.querySelector("input.rich-inslider-field");
        if (!inp || String(inp.value).trim() !== String(pagina)) continue;
      }
      return tb;
    }
    return null;
  }

  // O clique pode ser engolido em silêncio: o A4J.AJAX.Submit sai, o servidor
  // devolve a mesma tela e nada muda, sem erro (provável relação com a
  // conversação Seam ainda se estabelecendo). Daí as re-tentativas.
  async function abrirAbaDocumentos(iframe) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const doc = docDe(iframe);
      if (!doc) return null;
      const link =
        doc.querySelector('a[id$="linkAbaDocumentos"]') ||
        doc.querySelector('a[onclick*="linkAbaDocumentos"]');
      if (!link) return null;
      carimbar(doc);
      try {
        link.click();
      } catch {
        return null;
      }
      // sem assinatura anterior: antes do clique não havia grid, então achá-la
      // já prova que a tela trocou — não dependemos do carimbo aqui
      const tb = await esperarGrid(iframe, { tetoMs: 25000 });
      if (tb) return tb;
    }
    return null;
  }

  /**
   * Lista os documentos pela grid. Devolve
   *   {docs, total, paginas, paginasLidas, incompleto}
   * ou `null` quando a rota não está disponível (aí o chamador usa o scroll).
   *
   * `incompleto` é o ponto da coisa toda: quando páginas lidas < total, a
   * lista É parcial e dá para AVISAR — ao contrário do scroll, que entrega
   * parcial com cara de completo.
   */
  async function listarPelaGrid(onProgress) {
    if (!getIdProcesso()) return null;
    if (!document.body) return null;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("title", "");
    // Fora da tela em vez de display:none — o RichFaces mede componentes no
    // carregamento e um frame sem caixa pode render nada.
    iframe.style.cssText =
      "position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;visibility:hidden;";
    const inicio = Date.now();
    const TETO_MS = 120000;
    try {
      iframe.src = location.href; // mesma URL: leva idProcesso, ca e a sessão
      document.body.appendChild(iframe);
      await new Promise((res) => {
        let feito = false;
        const ok = () => {
          if (!feito) {
            feito = true;
            res();
          }
        };
        iframe.addEventListener("load", ok, { once: true });
        setTimeout(ok, 30000);
      });
      if (!docDe(iframe)) return null; // X-Frame-Options / origem bloqueada

      let tb = await abrirAbaDocumentos(iframe);
      if (!tb) return null;

      const doc0 = docDe(iframe);
      const paginas = totalPaginasGrid(doc0);
      const mapa = mapaColunas(tb);
      if (!mapa) return null;

      const vistos = new Set();
      const docs = [];
      const acumular = (linhas) => {
        for (const l of linhas) {
          if (vistos.has(l.id)) continue;
          vistos.add(l.id);
          docs.push(l);
        }
        if (onProgress) onProgress(docs.length);
      };
      acumular(lerLinhas(tb, mapa));

      let lidas = 1;
      let assinatura = assinaturaGrid(tb, mapa);
      for (let n = 2; n <= paginas; n++) {
        if (Date.now() - inicio > TETO_MS) break;
        const doc = docDe(iframe);
        if (!doc || !irParaPagina(doc, n)) break;
        const tbn = await esperarGrid(iframe, {
          pagina: n,
          assinaturaAntes: assinatura,
          tetoMs: 25000,
        });
        if (!tbn) break; // conta como incompleto — não silencia
        const mn = mapaColunas(tbn) || mapa;
        acumular(lerLinhas(tbn, mn));
        assinatura = assinaturaGrid(tbn, mn);
        lidas++;
      }

      if (!docs.length) return null;
      return {
        docs,
        total: docs.length,
        paginas,
        paginasLidas: lidas,
        incompleto: lidas < paginas,
      };
    } catch {
      return null; // qualquer falha: o chamador usa o scroll
    } finally {
      iframe.remove(); // SEMPRE, inclusive em erro
    }
  }

  return {
    getBase,
    getIdProcesso,
    getNumeroProcesso,
    lerCabecalhoProcesso,
    listarDocumentos,
    baixar,
    scrollAte,
    carregarTimelineCompleta,
    listarPelaGrid,
    // expostos para teste fora do navegador
    _acharGrid: acharGrid,
    _mapaColunas: mapaColunas,
    _lerLinhas: lerLinhas,
    _limparCelula: limparCelula,
    _rtfParaTexto: rtfParaTexto,
    _parsePessoa: parsePessoa,
    _urlsDownload: urlsDownload,
    _totalPaginasGrid: totalPaginasGrid,
    _analisarPdf: analisarPdf,
  };
})();
