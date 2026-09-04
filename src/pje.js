// Camada de acesso ao PJe. Roda no contexto (mundo isolado) da página dos autos.
// Reutiliza os mecanismos validados ao vivo: timeline no DOM + endpoint REST de download.
var PJE = (function () {
  // ---------------------------------------------------------------------------
  // DIAGNÓSTICO da queda da tela do PJe em processo grande.
  //
  // Sintoma: ao clicar Enviar, a página dos autos vira a tela de erro do PJe
  // (`error.seam`). A sessão continua VIVA — reabrir o processo resolve sem novo
  // login —, então o que morre é a VIEW JSF daquela aba: o servidor guarda o
  // estado de cada tela numa lista por sessão, e cada POST de página inteira
  // empurra a mais antiga para fora. Quem faz esses POSTs em volume é a leitura
  // da grid (um por página, ~9 num processo de 138 peças); quem descobre o
  // estrago é o `link.click()` da ativação, que é o primeiro postback seguinte.
  //
  // Nada aqui muda comportamento: são contadores e um registro do último gesto,
  // para o console dizer QUAL gesto precedeu a morte. Remover = apagar `dlog`,
  // as chamadas marcadas `// DIAG` e este bloco.
  // ---------------------------------------------------------------------------
  const DIAG = true;
  function dlog() {
    // `console.log` e NUNCA `console.debug`: o nível Verbose do DevTools vem
    // desligado por padrão, e instrumentação que ninguém enxerga não serve.
    if (DIAG) console.log.apply(console, ["[PJe IA]"].concat([].slice.call(arguments)));
  }

  // Último gesto que fez POSTBACK na view desta aba. A sentinela do content.js
  // lê isto no `pagehide` — é o ÚNICO registro que existe do instante da morte,
  // porque a navegação para a tela de erro destrói este contexto.
  let ultimoGesto = null; // {tipo, id, em}
  function marcarGesto(tipo, id) {
    ultimoGesto = { tipo, id: id == null ? "" : String(id), em: Date.now() };
  }
  function gestoJsf() {
    if (!ultimoGesto) return null;
    return Object.assign({}, ultimoGesto, { haMs: Date.now() - ultimoGesto.em });
  }

  // Ativações A4J em voo. A concorrência de download cede a isto: três GETs
  // simultâneos MAIS os HEADs do poll MAIS um POST A4J são quatro requisições
  // disputando a mesma sessão, e é assim que o Seam derruba a conversação.
  let ativandoAgora = 0;
  let ativacoesFeitas = 0;
  function ativacaoEmVoo() {
    return ativandoAgora > 0;
  }
  function contadorAtivacoes(zerar) {
    const n = ativacoesFeitas;
    if (zerar) ativacoesFeitas = 0;
    return n;
  }

  // A tela dos autos ainda está viva nesta aba? `#divTimeLine` é o marcador da
  // página de autos (é a mesma condição que o boot do content.js usa). Quando o
  // A4J responde com a tela de erro SEM navegar, a timeline some e o DOM fica —
  // é a variante que o `pagehide` não pega.
  function telaDosAutosViva() {
    return !!document.querySelector("#divTimeLine");
  }

  // Esta página É a tela de erro do PJe? Critério exato, conferido na sessão
  // real: o PJe manda para `/{base}/error.seam` (com um `cid` de conversação na
  // query). Vale mais que qualquer regex sobre o texto, que muda por tribunal.
  function ehTelaDeErro() {
    return /\/error\.seam$/.test(location.pathname);
  }

  // Base path do PJe (ex.: "pje1grau"). Deriva da URL para tolerar variações.
  function getBase() {
    return location.pathname.split("/")[1] || "pje1grau";
  }

  // Lê o idProcesso da querystring dos autos.
  function getIdProcesso() {
    return new URLSearchParams(location.search).get("idProcesso");
  }

  // DIALETO do PJe desta página — o PORTÃO por trás do qual todo caminho novo
  // de outro PJe tem de ficar, para os tribunais que funcionam hoje seguirem
  // no ramo "legacy" byte a byte.
  //
  // A extensão inteira foi construída contra o PJe 1.x (JSF/Seam): o
  // `idProcesso` vem na QUERYSTRING, as peças são links "123456 - Nome" dentro
  // de `#divTimeLine` e todas as rotas vivem sob
  // `/{base}/seam/resource/rest/pje-legacy/`. O PJe KZ — o frontend novo, base
  // path `pjekz` (relatado no TRT2: `/pjekz/processo/4047423/detalhe`) — não
  // tem NADA disso: o id do processo mora no PATH e a árvore `seam` não
  // existe. Lá `getIdProcesso()` devolve null, `listarPelaApi` e
  // `listarPelaGrid` saem na PRIMEIRA linha (`if (!proc) return null`) e a
  // lista chega vazia ao painel.
  //
  // POR QUE PELO BASE PATH, e nunca por "a lista veio vazia": a timeline do
  // PJe é LAZY, então um heurístico de FALHA acusaria de não suportado o
  // tribunal legado cuja timeline ainda não carregou — trocaria um silêncio
  // por uma afirmação falsa, que é pior. Sinal POSITIVO só acende onde o
  // dialeto é de fato outro.
  function dialeto() {
    return /^pjekz$/i.test(getBase()) ? "kz" : "legacy";
  }

  // Esta página fala o dialeto que a extensão lê? Açúcar para o único
  // consumidor de hoje (o aviso no painel), e o nome que os call sites leem.
  function suportado() {
    return dialeto() === "legacy";
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

  // "FULANO DE TAL DA SILVA - CPF: 000.000.000-00 (AUTOR)"
  // "BELTRANO SOUZA ... - OAB CE00000 - CPF: 111.111.111-11 (ADVOGADO)"
  // "BANCO ITAU CONSIGNADO S.A. - CNPJ: 00.000.000/0001-00 (REU)"
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

  // EVENTOS DA TIMELINE — movimento processual + data + peças daquele ato.
  //
  // A timeline não traz só `id - título`: cada evento é um `.media.interno` com
  // o MOVIMENTO em `.texto-movimento` e as peças em `.anexos a`; a data vive num
  // `.media.data` IRMÃO, que vale para os eventos seguintes até o próximo.
  //
  // Ler o movimento importa porque ele é o vocabulário CNJ — controlado e muito
  // mais discriminante que o título, que no PJe costuma ser o nome do arquivo.
  // Medido em processo real (processo P1, 103 eventos): buscar carta
  // precatória pelo TÍTULO devolve 6 peças, das quais 3 são a precatória
  // devolvida, juntada sob o movimento "DOCUMENTO"; buscar pelo MOVIMENTO
  // ("EXPEDIÇÃO DE CARTA PRECATÓRIA") devolve exatamente as 3 expedidas.
  //
  // ARMADILHA: movimento e peça nem sempre estão no MESMO evento. No PJe nativo
  // aparece o par "evento com movimento e sem peça" seguido de "evento com peça
  // e sem movimento" (4 ocorrências no processo P2). Por isso o movimento
  // órfão é HERDADO pelo evento seguinte quando este não tem movimento próprio
  // — sem essa herança, uma precatória nesse formato sumiria em silêncio.
  const MES_PT = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  function lerEventos() {
    const raiz = document.querySelector("#divTimeLine");
    if (!raiz) return [];
    const eventos = [];
    let dataAtual = null;
    (function varrer(no) {
      for (const el of no.children) {
        const cls = " " + (el.className || "").toString() + " ";
        if (/ media /.test(cls) && / data /.test(cls)) {
          const m = (el.textContent || "").trim().match(/(\d{1,2})\s+(\w{3})\w*\s+(\d{4})/);
          if (m && MES_PT[m[2].toLowerCase()] != null) {
            dataAtual = new Date(+m[3], MES_PT[m[2].toLowerCase()], +m[1]);
          }
          continue;
        }
        if (/ media /.test(cls) && / interno /.test(cls)) {
          const mv = el.querySelector(".texto-movimento");
          const pecas = [];
          for (const a of el.querySelectorAll(".anexos a")) {
            const m = (a.textContent || "").trim().replace(/\s+/g, " ").match(/^(\d{6,})\s*-\s*(.+)$/);
            if (m) pecas.push({ id: m[1], titulo: m[0].slice(0, 140) });
          }
          eventos.push({
            data: dataAtual ? new Date(dataAtual.getTime()) : null,
            mov: mv ? (mv.textContent || "").trim().replace(/\s+/g, " ") : "",
            pecas,
          });
          continue;
        }
        if (el.children && el.children.length) varrer(el);
      }
    })(raiz);
    // herança do movimento órfão (ver ARMADILHA acima)
    for (let i = 1; i < eventos.length; i++) {
      const ant = eventos[i - 1];
      if (!eventos[i].mov && eventos[i].pecas.length && ant.mov && !ant.pecas.length) {
        eventos[i].mov = ant.mov;
        eventos[i].movHerdado = true;
      }
    }
    return eventos;
  }

  // Varre a timeline (#divTimeLine) e devolve [{id, titulo, mov?, dataMov?}] sem
  // duplicatas. O movimento e a data vêm de `lerEventos` e são best-effort: num
  // layout de tribunal em que a estrutura de eventos não case, os campos ficam
  // ausentes e tudo que já existia continua igual (a lista sai dos links, como
  // sempre saiu).
  function listarDocumentos() {
    const links = [...document.querySelectorAll("#divTimeLine a")];
    const seen = new Set();
    const out = [];
    let meta = new Map();
    try {
      for (const ev of lerEventos()) {
        for (const p of ev.pecas) {
          if (!meta.has(p.id)) meta.set(p.id, { mov: ev.mov || null, dataMov: ev.data || null });
        }
      }
    } catch (e) {
      console.debug("[PJe IA] eventos da timeline:", e && e.message);
      meta = new Map();
    }
    for (const a of links) {
      const t = (a.textContent || "").trim().replace(/\s+/g, " ");
      const m = t.match(/^(\d{6,})\s*-\s*(.+)$/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        const d = { id: m[1], titulo: t.slice(0, 140) };
        const x = meta.get(m[1]);
        if (x) {
          if (x.mov) d.mov = x.mov;
          if (x.dataMov) d.dataMov = x.dataMov;
        }
        out.push(d);
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

  // ------------------------------------------------------------------------
  // A PEÇA PODE NÃO ESTAR NA LINHA DO TEMPO, e desde a v0.38 esse é o caso
  // COMUM, não a exceção. A lista do painel vem da rota REST (ou da grid), que
  // é um SUPERCONJUNTO da timeline e não injeta nó nenhum nela; só a rolagem
  // popula o `#divTimeLine`. Como `ativarPeca` procura o link por lá, a peça
  // que só a lista oficial conhece nunca chegava a ser ativada — e a mensagem
  // final de `baixar` mandava "abra-a na linha do tempo do processo", que é
  // justamente o que não dá para fazer. O mesmo laço sem saída que o "ver na
  // timeline" fechou na v0.45, um degrau mais fundo: aqui ele não devolve um
  // aviso, devolve uma PEÇA FALTANDO na análise, e o modelo responde "não
  // consta" sobre um documento que existe nos autos.
  let buscaTimelineChain = Promise.resolve();
  // Uma varredura que chegou ao fim (sem estourar o teto de 90 s) responde por
  // TODAS as peças, não só pela que a pediu: se o link não está no DOM depois
  // dela, ele não está. Sem esta memória, cada peça inalcançável de um lote
  // custaria uma varredura inteira.
  let timelineVarridaAteOFim = false;

  async function garantirNaTimeline(id) {
    if (acharLink(id)) return true;
    if (timelineVarridaAteOFim) return false;
    // SERIALIZADA, como a ativação: duas rolagens concorrentes disputariam o
    // mesmo scroller (o download roda com concorrência 3). A cadeia é PRÓPRIA e
    // não a `activationChain` — rolar não fala com o JSF, então não pode ficar
    // atrás dos ~5,6 s de uma ativação nem contar como ativação em voo.
    const meu = buscaTimelineChain.then(async () => {
      if (acharLink(id)) return true; // outra rolagem da fila já trouxe
      if (timelineVarridaAteOFim) return false;
      const r = await carregarTimelineCompleta(null, () => !!acharLink(id), {
        devolverRolagem: true,
      });
      // `completo` só é true quando a varredura terminou por estabilidade, e não
      // por estouro do teto. Marcar no estouro faria uma timeline gigante, que
      // não coube em 90 s, ser dada como esgotada — e as peças do fim dela
      // ficariam inalcançáveis pelo resto da sessão.
      if (r && r.completo && !r.achou) timelineVarridaAteOFim = true;
      return !!(r && r.achou);
    });
    // A cadeia segue viva mesmo se esta busca falhar: uma rejeição não tratada
    // aqui travaria todas as buscas seguintes da sessão.
    buscaTimelineChain = meu.catch(() => {});
    return meu;
  }

  function ativarPeca(id) {
    const run = async () => {
      const link = acharLink(id);
      if (!link) throw new Error("peça " + id + " não está visível na linha do tempo");
      // DIAG — este `click()` é um POST A4J na view desta aba. É o gesto que
      // encontra a view já descartada e devolve a tela de erro; registrá-lo é o
      // que permite ao log dizer "morreu depois da ativação da peça X".
      ativandoAgora++;
      ativacoesFeitas++;
      const tAtiv = Date.now();
      marcarGesto("ativação", id);
      dlog("ativação #" + ativacoesFeitas + " peça " + id + " — clique disparado");
      try {
        link.click();
      } catch (e) {
        ativandoAgora--;
        throw e;
      }
      try {
        return await pollLiberacao(id, tAtiv);
      } finally {
        ativandoAgora--;
        // DIAG — a tela pode ter virado a de erro SEM navegar (resposta A4J
        // parcial). Quem navega é pego pelo `pagehide` no content.js.
        if (!telaDosAutosViva()) {
          dlog("SENTINELA: #divTimeLine sumiu depois da ativação da peça " + id);
        }
      }
    };
    activationChain = activationChain.then(run, run);
    return activationChain;
  }

  // O poll que espera o PJe LIBERAR a peça (separado só para o `finally` acima
  // conseguir envolver o clique e a espera sem aninhar mais um try).
  async function pollLiberacao(id, tAtiv) {
    // Aguarda o servidor registrar a peça na sessão, sondando a MESMA rota que
    // o download vai usar — a PRIMEIRA de `urlsDownload` (a completa, quando o
    // host tem sigla e há idProcesso).
    //
    // Sondar a rota CURTA aqui era um defeito silencioso e caro: ela responde
    // 200 com uma casca vazia para toda peça HTML (decisões, despachos,
    // petições do editor), então `probe.ok` ficava verdadeiro no primeiro poll
    // e a ativação DESISTIA em 700 ms, em vez de esperar os ~5,6 s. Em
    // seguida `tentarRotas` rodava de novo, a peça ainda não estava liberada e
    // o erro final era "a peça N retornou vazia" — exatamente a falha que esta
    // função existe para resolver, e justamente nas peças que mais importam.
    const url = urlsDownload(id)[0];
    for (let i = 0; i < 8; i++) {
      await sleep(700);
      const probe = await fetch(url, { method: "HEAD", credentials: "include" });
      if (probe.ok) {
        dlog("ativação peça " + id + " — liberada em " + (Date.now() - tAtiv) + " ms");
        return;
      }
    }
    dlog("ativação peça " + id + " — DESISTIU após " + (Date.now() - tAtiv) + " ms");
    throw new Error("o PJe não liberou a peça " + id + " a tempo — tente novamente");
  }

  // ---------------------------------------------------------------------------
  // PDF OFICIAL de uma peça — o mesmo arquivo que o ⬇ do visualizador entrega.
  //
  // POR QUE ISTO EXISTE, e por que NÃO substitui a rota REST: peça escrita no
  // editor do PJe é servida pelo REST como CONTEÚDO (HTML), que vira texto. Para
  // LER e para a IA analisar, texto é melhor — menor, pesquisável, sem OCR. Mas
  // o pacote de carta precatória vira anexo de MALOTE DIGITAL, e ali o que vale
  // é o documento do tribunal: timbre, paginação e o rodapé de assinatura. Um
  // `.txt` no malote não é documento nenhum.
  //
  // O mecanismo foi levantado na sessão real (12/08/2026) e é o do próprio
  // botão: um POST no form `detalheDocumento` com `detalheDocumento:download`
  // devolve a PÁGINA (~230 KB), e dentro dela vem uma URL pré-assinada de MinIO
  // (`minio-pjedocs…?X-Amz-…&X-Amz-Expires=120`) — o PDF é gerado sob demanda,
  // não existe antes do clique. Um `fetch` nessa URL traz os bytes (CORS
  // liberado, conferido na página do PJe).
  //
  // Quatro coisas que não podem cair:
  //  · O POST baixa o documento CORRENTE no visualizador — ele não recebe id
  //    nenhum. Por isso a peça é ABERTA antes (`ativarPeca`, que já serializa na
  //    `activationChain`), e a resposta é conferida: se o id da peça não aparece
  //    no HTML, o visualizador estava noutro documento e devolvemos null em vez
  //    de gravar o PDF ERRADO no pacote — que ninguém notaria até o malote.
  //  · Custa DOIS postbacks por peça (abrir + baixar). É muito para a sessão
  //    JSF, então isto é do PACOTE, nunca do chat nem da exportação em massa.
  //  · A URL vale 120 s: usar imediatamente, sem cache.
  //  · Best-effort de ponta a ponta: qualquer falha devolve `null` e o chamador
  //    segue com o texto de sempre (o pacote então avisa, no LEIA-ME, que aquele
  //    arquivo não é o documento assinado). Nada aqui pode derrubar um turno.
  //
  // Específico do TJCE por enquanto: o form `detalheDocumento` é desta tela.
  // Onde ele não existir, `null` na primeira linha e nada muda.
  const RE_ARQUIVO_NA_RESPOSTA = /https?:\/\/[^"'\s\\<>]*\.pdf[^"'\s\\<>]*/i;
  async function baixarPdfOficial(id) {
    try {
      const form = document.getElementById("detalheDocumento");
      if (!form) return null;
      const acao = form.getAttribute("action");
      const vsEl = form.querySelector('[name="javax.faces.ViewState"]');
      if (!acao || !vsEl || !vsEl.value) return null;

      // Abre a peça no visualizador. `ativarPeca` já é o caminho serializado e
      // ainda espera o servidor liberá-la — que é a mesma prova de que abriu.
      await ativarPeca(id);

      const body = new URLSearchParams();
      body.set("detalheDocumento:msgsOpenedState", "");
      body.set("detalheDocumento", "detalheDocumento");
      body.set("autoScroll", "");
      body.set("javax.faces.ViewState", vsEl.value);
      body.set("detalheDocumento:download", "detalheDocumento:download");
      marcarGesto("download-pdf", id);
      const resp = await fetch(acao, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!resp.ok) {
        dlog("pdf oficial " + id + ": POST devolveu " + resp.status);
        return null;
      }
      const html = await resp.text();
      // A guarda que impede o pacote sair com a peça ERRADA (ver acima).
      if (html.indexOf(String(id)) < 0) {
        dlog("pdf oficial " + id + ": o visualizador está noutra peça — desisto");
        return null;
      }
      const m = html.match(RE_ARQUIVO_NA_RESPOSTA);
      if (!m) {
        dlog("pdf oficial " + id + ": nenhuma URL de arquivo na resposta");
        return null;
      }
      // `credentials: "omit"` — a URL já é assinada, e mandar cookie para outro
      // host (o storage) não ajuda em nada e vaza sessão para fora do PJe.
      const arq = await fetch(m[0], { credentials: "omit" });
      if (!arq.ok) {
        dlog("pdf oficial " + id + ": storage devolveu " + arq.status);
        return null;
      }
      const blob = await arq.blob();
      if (!blob.size) return null;
      const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (String.fromCharCode.apply(null, head) !== "%PDF-") {
        dlog("pdf oficial " + id + ": o que voltou não é PDF");
        return null;
      }
      const pages = await contarPaginas(blob);
      const b64 = await blobToB64(blob);
      dlog("pdf oficial " + id + ": " + blob.size + " bytes, " + pages + " página(s)");
      // MESMO formato de `lerCorpo`, para o resto do pipeline não saber a
      // diferença — mais `oficial`, que é o que o LEIA-ME usa para não marcar
      // como "texto a substituir" a peça que veio assinada.
      return { kind: "pdf", fmt: "pdf", b64, size: blob.size, pages, oficial: true };
    } catch (e) {
      dlog("pdf oficial " + id + ": " + ((e && e.message) || e));
      return null;
    }
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

  // Identidade do processo para a memória de caso (o banco no service worker).
  // NÃO pode ser só o idProcesso: ele é a chave primária no banco DAQUELE
  // tribunal e colide entre tribunais — o processo 123456 do TJCE e o 123456 do
  // TRF5 são coisas diferentes, e sem o host um leria a conversa do outro. O
  // grau entra pela mesma razão (1º e 2º grau são bancos distintos no mesmo
  // host, em vários tribunais).
  // null quando a página não tem idProcesso na URL — e null DESLIGA a memória
  // naquela aba, em vez de inventar uma chave que agruparia processos distintos.
  function chaveDoCaso() {
    const proc = getIdProcesso();
    if (!proc) return null;
    return location.hostname + "|" + grauAtual() + "|" + proc;
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
    // de a peça estar NA TIMELINE — o que, desde que a lista passou a vir da
    // rota REST (v0.38), deixou de ser o caso comum. Por isso a peça é trazida
    // para lá ANTES: sem isso `ativarPeca` lança na primeira linha, o download
    // falha numa peça que existe nos autos, e o modelo responde "não consta".
    //
    // Custo: a rolagem para assim que a peça aparece (`pararQuando`), então no
    // caso típico são segundos; o teto de 90 s só é pago quando ela não está
    // mesmo lá — e UMA vez por sessão, porque a varredura completa responde por
    // todas as peças (`timelineVarridaAteOFim`). Ela não fala com o JSF, então
    // não gasta view nem disputa a `activationChain`.
    const naTimeline = await garantirNaTimeline(id).catch(() => false);
    try {
      await ativarPeca(id);
    } catch {
      /* sem link na timeline: ainda assim tentamos de novo abaixo */
    }
    corpo = await tentarRotas();
    if (corpo) return corpo;

    // A ORDEM importa, e a primeira versão desta guarda errava nela: quando a
    // peça não está na timeline o servidor responde 404 (o endpoint só libera o
    // que foi aberto na sessão), então testar o status ANTES fazia a mensagem
    // nova nunca aparecer — o "HTTP 404" cru voltava a ser tudo o que o usuário
    // via. A causa provável manda na mensagem, e "não está na linha do tempo" é
    // mais acionável que um número de status.
    throw new Error(
      !naTimeline
        ? // NUNCA mandar "abra na linha do tempo" uma peça que não está lá: era
          // o laço sem saída, e orientação impossível é pior que nenhuma.
          "a peça " + id + " está na lista oficial do processo, mas o PJe não a " +
          "mostra na linha do tempo desta tela — e é de lá que ele libera o " +
          "download. Passe o mouse sobre ela na lista para ver o conteúdo."
        : ultimoStatus && ultimoStatus !== 200
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
  function contarRe(s, re) {
    const m = s.match(re);
    return m ? m.length : 0;
  }

  async function contarPaginas(blob) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const s = new TextDecoder("latin1").decode(bytes);
      const pages = contarRe(s, RE_PAGINA);
      if (pages) return pages;
      let max = 0;
      const re = /\/Count\s+(\d+)/g;
      let mm;
      while ((mm = re.exec(s))) max = Math.max(max, parseInt(mm[1], 10));
      if (max) return max;
      return (await contarPaginasObjStm(bytes, s)) || 1;
    } catch {
      return 1;
    }
  }

  // Latin1 preserva a relação 1:1 entre índice na string e offset no binário —
  // por isso dá para achar "stream"/"endstream" na string e fatiar os bytes.
  async function contarPaginasObjStm(bytes, s) {
    let total = 0;
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
        total += contarRe(txt, RE_PAGINA);
      } catch {
        /* stream com outro filtro ou corrompido: ignora e segue */
      }
    }
    return total;
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

  // Assinaturas de arquivo que NÃO são documento de texto nem PDF/RTF. O PJe
  // aceita anexo de qualquer tipo: foto de celular, print de conversa, planilha,
  // áudio da audiência. Sem esta tabela todos eles caíam no ramo de texto lá
  // embaixo — `blob.text()` decodifica QUALQUER byte — e a peça chegava ao
  // modelo como `����JFIF���...`: milhares de tokens de lixo no lugar do
  // conteúdo, com o selo da lista dizendo TEXTO. É o mesmo defeito que a
  // assinatura do PDF já corrigia (17 mil tokens de lixo binário), nos formatos
  // que faltavam.
  //
  // Duas famílias, e a diferença é o que dá para fazer com elas:
  //
  //   IMAGENS  — os três provedores enxergam (visão). Um Boletim de Ocorrência
  //              fotografado ou um print de conversa é PROVA, e é justamente o
  //              anexo que mais aparece: viram bloco de imagem no request.
  //   O RESTO  — .docx, .zip, áudio da audiência, formato de scanner exótico:
  //              nada a fazer, a peça é recusada com o motivo.
  //
  // Só os quatro formatos que Anthropic, Google e OpenAI aceitam em COMUM
  // entram como imagem. TIFF e BMP (que aparecem em scanner de cartório) não
  // são aceitos por nenhum dos três e ficam na lista de recusa — mandar e
  // tomar 400 seria pior que dizer o motivo.
  const IMAGENS = [
    { fmt: "jpeg", mime: "image/jpeg", teste: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { fmt: "png", mime: "image/png", teste: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { fmt: "gif", mime: "image/gif", teste: (b, s) => s.startsWith("GIF8") },
    { fmt: "webp", mime: "image/webp", teste: (b, s) => s.startsWith("RIFF") && s.slice(8, 12) === "WEBP" },
  ];
  // O rótulo é o que o usuário lê no relatório de falhas — daí ser o nome do
  // arquivo, não o mime.
  const ASSINATURAS = [
    { rot: "imagem BMP (formato que os modelos não leem)", teste: (b, s) => s.startsWith("BM") },
    { rot: "imagem TIFF (formato que os modelos não leem)", teste: (b, s) => s.startsWith("II*\0") || s.startsWith("MM\0*") },
    { rot: "arquivo de áudio/vídeo", teste: (b, s) => s.startsWith("RIFF") && /WAVE|AVI /.test(s.slice(8, 12)) },
    { rot: "arquivo de áudio/vídeo", teste: (b, s) => s.slice(4, 8) === "ftyp" || s.startsWith("OggS") || s.startsWith("ID3") },
    { rot: "arquivo de vídeo", teste: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
    // PK = ZIP e tudo que é ZIP por dentro: .docx, .xlsx, .odt
    { rot: "arquivo compactado ou do Office (ZIP)", teste: (b, s) => s.startsWith("PK\x03\x04") || s.startsWith("PK\x05\x06") },
    // OLE2: .doc/.xls/.msg antigos
    { rot: "arquivo do Office antigo (.doc/.xls)", teste: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  ];
  function casa(lista, bytes, inicio) {
    for (const a of lista) {
      try {
        if (a.teste(bytes, inicio)) return a;
      } catch {
        /* assinatura mais curta que o cabeçalho lido: só ignora */
      }
    }
    return null;
  }
  function tipoImagem(bytes, inicio) {
    return casa(IMAGENS, bytes, inicio);
  }
  function tipoBinario(bytes, inicio) {
    const a = casa(ASSINATURAS, bytes, inicio);
    return a ? a.rot : null;
  }

  // Lado máximo recomendado pela Anthropic: acima disso a imagem é reduzida do
  // lado deles ANTES de ser tokenizada, então mandar maior só gasta payload.
  const IMG_LADO_MAX = 1568;
  // Acima disto a Anthropic recusa a imagem (5 MB por imagem). O teto aqui é
  // menor porque a conta que importa é a do base64, ~1,33× os bytes.
  const IMG_BYTES_MAX = 3_500_000;

  // Foto de celular anexada ao processo tem rotina de 4-12 MP: reduzir é o que
  // separa "a peça entra na análise" de um 400 da API. Roda no navegador
  // (createImageBitmap + OffscreenCanvas), sem biblioteca e sem upload.
  // Falha aqui NÃO é fatal: devolve o blob original e quem decide é o teto.
  async function normalizarImagem(blob, mime) {
    try {
      if (blob.size <= IMG_BYTES_MAX) {
        const bm0 = await createImageBitmap(blob);
        const cabe = Math.max(bm0.width, bm0.height) <= IMG_LADO_MAX;
        const w0 = bm0.width;
        const h0 = bm0.height;
        bm0.close();
        // as dimensões voltam junto: é delas que sai a estimativa de tokens da
        // imagem (largura × altura / 750), sem precisar decodificar de novo
        if (cabe) return { blob, mime, w: w0, h: h0 };
      }
      const bm = await createImageBitmap(blob);
      const escala = Math.min(1, IMG_LADO_MAX / Math.max(bm.width, bm.height));
      const w = Math.max(1, Math.round(bm.width * escala));
      const h = Math.max(1, Math.round(bm.height * escala));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bm, 0, 0, w, h);
      bm.close();
      // JPEG mesmo quando a origem é PNG: print de tela em PNG de 8 MP vira
      // ~300 KB sem perda perceptível de legibilidade, que é o que importa num
      // documento. GIF animado perde a animação — nenhum modelo a lê mesmo.
      const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      return { blob: out, mime: "image/jpeg", w, h };
    } catch (e) {
      console.debug("[PJe IA] não foi possível redimensionar a imagem:", e && e.message);
      return { blob, mime };
    }
  }

  // Rede de segurança para o binário SEM assinatura conhecida (o PJe serve
  // formatos de scanner que ninguém catalogou). Texto de verdade não tem bytes
  // de controle C0 — e é justamente isso que enche um binário decodificado.
  //
  // O limiar não pode ser rígido: HTML servido em ISO-8859-1 sem charset no
  // header chega com um U+FFFD POR ACENTO (petição → peti�ão), e isso é texto
  // legítimo que a extensão lê há tempos. Por isso o critério é o caractere de
  // CONTROLE, que a acentuação mal decodificada não produz.
  function pareceBinario(texto) {
    const amostra = texto.slice(0, 4000);
    if (!amostra) return false;
    let controle = 0;
    for (let i = 0; i < amostra.length; i++) {
      const c = amostra.charCodeAt(i);
      if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127) controle++;
    }
    return controle / amostra.length > 0.02;
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
      // Nem PDF, nem RTF, nem HTML. Antes de aceitar como texto: é imagem (vai
      // para o modelo como imagem) ou outro binário (recusado com o motivo)?
      if (!ehPdf && !ehRtf) {
        const img = tipoImagem(head, inicio);
        if (img) {
          const norm = await normalizarImagem(blob, img.mime);
          if (norm.blob.size > IMG_BYTES_MAX) {
            throw new Error(
              "a peça " + id + " é uma imagem grande demais para a análise (" +
                Math.round(norm.blob.size / 1e6) + " MB). Abra-a no PJe para ver o conteúdo."
            );
          }
          const b64 = await blobToB64(norm.blob);
          console.debug(
            "[PJe IA] peça", id, "imagem", img.fmt.toUpperCase(), "—", blob.size,
            "bytes" + (norm.blob.size !== blob.size ? " → " + norm.blob.size + " após reduzir" : "")
          );
          // `fmt` guarda o formato de ORIGEM (o selo da lista e o nome do
          // arquivo no .zip saem daí); `mime` é o que vai no request. Quando a
          // redução converte para JPEG, os dois divergem de propósito.
          return {
            kind: "img", fmt: img.fmt, mime: norm.mime, b64, size: norm.blob.size,
            w: norm.w || 0, h: norm.h || 0,
          };
        }
        // LANÇA em vez de devolver null de propósito — `null` significa "esta
        // rota não serviu" e faria `baixar` gastar a ativação JSF (~5,6 s,
        // serializada) para no fim dizer "a peça retornou vazia", que é falso:
        // ela veio inteira, só não é um documento que a extensão saiba ler. O
        // erro sobe para o relatório de peças que não entraram, no chat.
        const bin = tipoBinario(head, inicio);
        if (bin) {
          console.debug("[PJe IA] peça", id, "é", bin, "—", blob.size, "bytes, fora do envio");
          throw new Error(
            "a peça " + id + " é " + bin + ": a extensão lê PDF, HTML, RTF e imagens. " +
              "Abra-a no PJe para ver o conteúdo."
          );
        }
      }
    }
    if (ehPdf) {
      if (!blob.size) {
        console.debug("[PJe IA] peça", id, "PDF de 0 bytes");
        return null;
      }
      const pages = await contarPaginas(blob);
      console.debug("[PJe IA] peça", id, "PDF de", blob.size, "bytes,", pages, "página(s)");
      const b64 = await blobToB64(blob);
      // `fmt` guarda o formato de ORIGEM da peça. `kind` diz como o conteúdo
      // viaja daqui em diante (pdf x texto) e é o que o envio usa; `fmt`
      // preserva a distinção que o `kind` achata — HTML e RTF viram ambos
      // "text" — e é o que a exportação em ZIP registra no índice.
      return { kind: "pdf", fmt: "pdf", b64, size: blob.size, pages };
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
    // Última barreira antes de o conteúdo virar contexto: formato binário sem
    // assinatura na tabela (scanners de tribunal produzem os mais variados).
    // Não vale para HTML — página com um caractere de controle solto continua
    // sendo página.
    if (!ct.includes("html") && pareceBinario(text)) {
      console.debug("[PJe IA] peça", id, "parece binário (" + ct + "):", blob.size, "bytes, fora do envio");
      throw new Error(
        "a peça " + id + " está num formato que a extensão não sabe ler (ela lê PDF, HTML, RTF e imagens). " +
          "Abra-a no PJe para ver o conteúdo."
      );
    }
    console.debug("[PJe IA] peça", id, "texto de", text.length, "chars (" + ct + ")");
    if (!text) return null;
    return { kind: "text", fmt: ct.includes("html") ? "html" : "texto", text };
  }

  // Lê um arquivo LOCAL que o usuário anexou no input (PDF, TXT, MD — e de
  // quebra imagem, que `lerCorpo` já sabe tratar). REUSA `lerCorpo`, o mesmo
  // leitor das peças do PJe, construindo uma Response a partir do File: assim
  // não há um segundo detector de tipo nem um segundo extrator de texto que
  // pudessem divergir deste — a mesma barreira de binário/imagem/PDF vale.
  // A Response herda o content-type do próprio File (`file.type`); quando ele
  // vem vazio (comum em `.md`), a detecção por assinatura de `lerCorpo` assume.
  // Devolve o MESMO formato de `lerCorpo` ({kind, fmt, b64|text, ...}) e LANÇA,
  // com mensagem amigável, quando o arquivo é vazio ou de um tipo não lido.
  async function lerAnexo(file) {
    const nome = (file && file.name) || "arquivo";
    const corpo = await lerCorpo(new Response(file), nome);
    if (!corpo) throw new Error('o arquivo "' + nome + '" está vazio ou não pôde ser lido.');
    return corpo;
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

  // `pararQuando` (opcional) encerra a rolagem assim que ELE devolver true —
  // usado por "ver na timeline", que não precisa da lista inteira: precisa de
  // UMA peça. Numa peça do meio dos autos isso é a diferença entre 3 segundos e
  // os 90 do teto. Sem o parâmetro, o comportamento é byte a byte o de antes.
  // Devolve a rolagem para onde estava. Re-localiza a timeline porque o
  // re-render A4J troca os nós durante a carga — uma referência guardada
  // apontaria para um elemento morto e a restauração viraria no-op.
  function devolverRolagem(scrollAntes) {
    const tlFim = document.querySelector("#divTimeLine");
    if (!tlFim) return;
    const sc = acharScroller(tlFim);
    if (sc === window) window.scrollTo(0, scrollAntes);
    else sc.scrollTop = scrollAntes;
  }

  async function carregarTimelineCompleta(onProgress, pararQuando, opts) {
    let tl = document.querySelector("#divTimeLine");
    // `achou: false` também aqui: quem passou `pararQuando` espera SEMPRE uma
    // resposta sobre a busca, e um `undefined` neste ramo se leria como "não
    // perguntei" em vez de "não achei" — a diferença que decide se o chamador
    // avisa o usuário ou fica calado.
    // `completo: false`, e não true: sem `#divTimeLine` não há timeline
    // carregada — afirmar o contrário faz o chamador concluir que a varredura
    // ESGOTOU a lista. Ver a flag `sumiu` abaixo: é o mesmo erro, e ele
    // envenenava a sessão inteira.
    if (!tl) return { total: 0, completo: false, achou: pararQuando ? false : undefined };
    // Já está lá: não rola nada. Vale para o caso em que o chamador testou antes
    // e a timeline mudou no meio (o A4J re-renderiza sozinho).
    if (pararQuando && pararQuando()) {
      return { total: listarDocumentos().length, completo: true, achou: true };
    }
    const scrollAntes = (() => {
      const sc = acharScroller(tl);
      return sc === window ? window.scrollY : sc.scrollTop;
    })();
    const contar = () => document.querySelectorAll("#divTimeLine a").length;
    const inicio = Date.now();
    const TETO_MS = 90000;
    let total = contar();
    let estaveis = 0; // rodadas seguidas sem crescimento — 2 encerram
    let sumiu = false; // a timeline desapareceu no meio (re-render A4J)
    while (estaveis < 2 && Date.now() - inicio < TETO_MS) {
      // Re-localiza timeline e scroller a CADA rodada: o re-render A4J que
      // anexa as peças novas pode substituir os nós no DOM — uma referência
      // guardada apontaria para um elemento morto e a rolagem viraria no-op.
      tl = document.querySelector("#divTimeLine");
      if (!tl) {
        // O MESMO A4J que traz as peças RE-RENDERIZA a timeline, e durante a
        // troca o nó não existe: um retrato tirado aqui é indistinguível de
        // navegação. Sair com `completo: true` faria o chamador concluir que a
        // lista foi esgotada — e em `garantirNaTimeline` isso marca
        // `timelineVarridaAteOFim`, que NUNCA volta: um soluço de re-render
        // tornaria toda peça fora da timeline inalcançável pelo resto da
        // sessão. É a mesma família do falso positivo do `telaMorta`.
        sumiu = true;
        break;
      }
      const sc = acharScroller(tl);
      if (sc === window) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else {
        sc.scrollTop = sc.scrollHeight;
      }
      let cresceu = false;
      let achou = false;
      for (let i = 0; i < 10 && !cresceu; i++) {
        await sleep(300);
        const agora = contar();
        if (agora > total) {
          total = agora;
          cresceu = true;
        }
        // Confere a cada leva, e não só quando a leva CRESCE: a peça procurada
        // pode chegar numa rodada em que a contagem já estava estável.
        if (pararQuando && pararQuando()) {
          achou = true;
          break;
        }
      }
      if (onProgress) onProgress(listarDocumentos().length);
      if (achou) {
        // Por padrão NÃO devolve a rolagem: quem pediu a parada ("ver na
        // timeline") vai rolar até o alvo em seguida, e restaurar aqui
        // produziria dois saltos na tela.
        //
        // `devolverRolagem` existe para o caso OPOSTO, que é o do download: ali
        // a rolagem é COLATERAL — o usuário pediu uma análise, não um passeio
        // pela timeline —, e o download roda também em caminhos de fundo
        // (medição de contexto, prefetch). Mover a tela por baixo de quem está
        // lendo os autos seria o mesmo defeito da faixa que muda de altura sob
        // o dedo.
        if (opts && opts.devolverRolagem) devolverRolagem(scrollAntes);
        return { total: listarDocumentos().length, completo: true, achou: true };
      }
      estaveis = cresceu ? 0 : estaveis + 1;
    }
    devolverRolagem(scrollAntes);
    return {
      total: listarDocumentos().length,
      completo: !sumiu && Date.now() - inicio < TETO_MS,
      achou: pararQuando ? !!pararQuando() : undefined,
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
    // DIAG — cada virada de página é um POST de PÁGINA INTEIRA (ver a armadilha
    // 4 de docs/pje-tela-documentos.md). É o gesto que cria telas JSF em volume:
    // ~9 num processo de 138 peças, contra um teto por sessão da ordem de 15.
    marcarGesto("grid:página", n);
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

  // ---------------------------------------------------------------------------
  // LISTA OFICIAL PELA API REST — a rota que não custa NADA à sessão do PJe.
  //
  // Levantada na sessão real (12/08/2026) sondando a família `pje-legacy`, que a
  // extensão já usa para baixar peça:
  //   GET /{base}/seam/resource/rest/pje-legacy/processos/{idProcesso}/documentos
  // devolve um ARRAY puro de `{id, descricao, data, binario, linkDownload}`,
  // autenticado pelo mesmo cookie de sessão.
  //
  // POR QUE ISTO MUDA O JOGO: a `descricao` é o **tipo oficial** do PJe
  // ("Petição Inicial", "Documento de Comprovação") — exatamente o dado mais
  // valioso da grid, que é dele que sai o degrau `chave`. E vem em UMA
  // requisição REST: **zero tela JSF**, contra ~10 da grid num processo de 138
  // peças. É a leitura da grid que gasta o orçamento de telas da sessão e faz a
  // aba do usuário morrer com "Sua página expirou"; por aqui esse custo
  // simplesmente não existe.
  //
  // Medido no processo P2: 35 documentos pela API contra 33 na
  // timeline carregada — SUPERCONJUNTO (nenhum id da timeline faltou), com dois
  // a mais que ela não mostrava, e em ordem cronológica CRESCENTE, que até aqui
  // era só premissa nossa na exportação.
  //
  // Regras que não podem cair:
  //  · **GUARDA ANTI-REGRESSÃO**: se a API devolver MENOS itens do que a
  //    timeline já tem no DOM, alguma coisa está errada (filtro por sigilo,
  //    paginação escondida, outro entendimento de "documento") — e uma lista que
  //    ENCOLHE é pior que nenhuma, porque a peça some sem ninguém ver. Nesse
  //    caso devolve `null` e o chamador segue para a grid, como antes.
  //  · `juntadoEm` sai daqui no formato BRASILEIRO, que é o contrato que
  //    `instanteDe`, o índice do `.zip` e a lista do "Escolher com IA" já
  //    esperam. Converter na origem é o que faz o resto do código não mudar uma
  //    linha — e, portanto, não ter como regredir.
  //  · Não traz `juntadoPor` nem as colunas `extras` do tribunal: quem quiser
  //    esses dois continua tendo a grid. Por isso ela não foi removida.
  //  · Best-effort como todo o resto: qualquer falha devolve `null`.
  // ---------------------------------------------------------------------------
  function dataBr(s) {
    const t = String(s || "").trim();
    // "2026-06-22 15:52:38.789" (e a variante com "T") -> "22/06/2026 15:52"
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5];
    const d = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d) return d[3] + "/" + d[2] + "/" + d[1];
    return t; // já veio em outro formato: repassa sem inventar
  }

  async function listarPelaApi() {
    const proc = getIdProcesso();
    if (!proc) return null;
    try {
      const url =
        "/" + getBase() + "/seam/resource/rest/pje-legacy/processos/" + proc + "/documentos";
      const r = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        dlog("api de documentos: HTTP " + r.status + " — caindo para a grid");
        return null;
      }
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) return null;
      const docs = [];
      const vistos = new Set();
      for (const d of j) {
        const id = String((d && d.id) != null ? d.id : "").trim();
        // mesmo limiar do regex da timeline: id de peça é longo
        if (!/^\d{4,}$/.test(id) || vistos.has(id)) continue;
        vistos.add(id);
        const tipo = String((d && d.descricao) || "").trim();
        docs.push({
          id,
          // O título da timeline (que o usuário reconhece) vence na mesclagem;
          // este só vale para a peça que a timeline lazy ainda não trouxe, e
          // segue a MESMA convenção "id - nome" do resto da extensão.
          titulo: tipo ? id + " - " + tipo : id,
          tipo: tipo || null,
          juntadoEm: dataBr(d && d.data),
          binario: !!(d && d.binario),
        });
      }
      if (!docs.length) return null;
      const naTimeline = listarDocumentos().length;
      if (docs.length < naTimeline) {
        dlog(
          "api de documentos: devolveu " + docs.length + " e a timeline já tem " +
            naTimeline + " — lista suspeita, caindo para a grid"
        );
        return null;
      }
      dlog("api de documentos: " + docs.length + " documento(s), zero tela JSF gasta");
      return { docs, total: docs.length, paginas: 1, paginasLidas: 1, incompleto: false, fonte: "api" };
    } catch (e) {
      dlog("api de documentos: " + ((e && e.message) || e) + " — caindo para a grid");
      return null;
    }
  }

  // TETO DE TEMPO da rota de movimentações, e ele não é zelo: ela roda no começo
  // de TODO turno, então um endpoint que aceita a conexão e nunca responde
  // deixaria o Enter sem efeito NENHUM — sem token, sem erro, sem status —, e
  // para sempre. Rota que pendura é pior que rota que falha justamente por isso,
  // e não é hipótese: foi o que as rotas fora de `pje-legacy/` fizeram na
  // sondagem (ver docs/pje-api-rest.md). O fallback pelo DOM é instantâneo,
  // então esperar mais que isto não compra nada.
  const MOVS_TIMEOUT_MS = 4000;
  // Desistir pela vida da PÁGINA vale só para o pendura: no tribunal em que a
  // rota não responde, pagar 4 s a cada pergunta seria trocar um defeito por
  // outro. Erro de HTTP (404 num PJe sem a rota, 500 transitório) NÃO desiste —
  // ele volta rápido e pode ser passageiro.
  //
  // Mas são precisas DUAS expirações seguidas, e isso não é frouxidão: a v0.46.0
  // passou a chamar esta rota também no BOOT (o `setTimeout` de 600 ms no fim de
  // `iniciar()`), que é o instante mais congestionado da aba — o PJe ainda está
  // carregando, no MESMO host. Com o desligamento armado na primeira expiração,
  // um soluço de rede de 4 s ali degradava a SESSÃO INTEIRA para o fallback do
  // DOM: linha do tempo parcial, sem hora, e o selo anunciando "(da tela)" e
  // "PARCIAL" como se fosse limitação do tribunal. Silencioso, irreversível sem
  // F5, e é exatamente a resposta ruim sobre prazo que a rodada da linha do
  // tempo existe para eliminar.
  //
  // O preço no pior caso (rota REALMENTE pendurada) não muda de ordem: o boot
  // gasta a 1ª expiração e o 1º turno gasta a 2ª, isto é, UM Enter de 4 s por
  // página — o mesmo que o desenho anterior pagaria se a chamada do boot não
  // existisse. Sucesso zera o contador: o que desliga a rota é ela pendurar
  // SEMPRE, não ter pendurado uma vez.
  const MOVS_TIMEOUTS_ATE_DESISTIR = 2;
  let movsTimeouts = 0;
  let movsPendurou = false;

  /**
   * MOVIMENTAÇÕES do processo pela API REST — a linha do tempo PROCESSUAL, que
   * é coisa diferente da lista de peças. Devolve
   *   [{ms, data, cod, evento, texto, docs:[id]}]  (ordem CRESCENTE)
   * ou `null` quando a rota não responde (o chamador cai para o DOM).
   *
   * É a fonte que faltava para toda pergunta de PRAZO. Medido no
   * processo P3 (17/08/2026): 25 movimentos, ~77 ms, e o que vem é
   * melhor que a timeline em três eixos —
   *   • `dataAtualizacao` é epoch em ms, então há **hora**; o `.media.data` do DOM
   *     só dá o dia, e dois atos do mesmo dia ficavam indistinguíveis;
   *   • `codEvento`/`dsEvento` são o vocabulário CNJ (1051 Decurso de Prazo,
   *     92 Publicação, 12283 Confirmada…), não o nome que alguém digitou;
   *   • `textoFinalExterno` traz o complemento que decide a conta —
   *     "Decorrido prazo de EUDES … em 16/07/2026 23:59".
   * E, decisivo: **não depende da timeline carregada** (o DOM entrega só o
   * trecho rolado) e **não gasta view JSF**, porque está sob `pje-legacy/` e
   * portanto não passa pelo Faces Servlet — ver docs/pje-api-rest.md.
   */
  async function listarMovimentacoes() {
    const proc = getIdProcesso();
    if (!proc || movsPendurou) return null;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const relogio = ctl ? setTimeout(() => ctl.abort(), MOVS_TIMEOUT_MS) : null;
    try {
      const url =
        "/" + getBase() + "/seam/resource/rest/pje-legacy/processos/" + proc + "/movimentacoes";
      const r = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: ctl ? ctl.signal : undefined,
      });
      if (!r.ok) {
        dlog("movimentações: HTTP " + r.status + " — caindo para a timeline");
        return null;
      }
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) return null;
      const movs = [];
      for (const m of j) {
        const ms = Number(m && m.dataAtualizacao);
        const evento = String((m && m.dsEvento) || "").trim();
        const texto = String((m && m.textoFinalExterno) || "").trim();
        if (!evento && !texto) continue;
        movs.push({
          ms: Number.isFinite(ms) && ms > 0 ? ms : null,
          data: Number.isFinite(ms) && ms > 0 ? new Date(ms) : null,
          cod: String((m && m.codEvento) || "").trim(),
          evento,
          // O complemento repete o evento em metade dos casos ("Decisão
          // Interlocutória de Mérito" nos dois campos); guardar a repetição
          // dobraria a linha sem acrescentar nada. E o sufixo "Documento: N"
          // sai do texto porque o id volta como `docs` — mantê-lo escrevia o
          // mesmo número duas vezes na mesma linha ("… Documento: 207691389
          // (peça 207691389)"), o que é ruído e token gasto.
          texto:
            texto && texto !== evento
              ? texto.replace(/\s*documento:?\s*\d{4,}\.?\s*$/i, "").trim()
              : "",
          // "Documento: 207691389" é o formato do PJe. Casar `\d{6,}` solto
          // pegaria datas e valores que aparecem no mesmo texto.
          docs: [...texto.matchAll(/documento:?\s*(\d{4,})/gi)].map((x) => x[1]),
        });
      }
      if (!movs.length) return null;
      // CRESCENTE: a rota devolve em ordem arbitrária (medido: o 1º item era o
      // mais recente). Sem data não há como ordenar — esses ficam no fim, na
      // ordem em que vieram, em vez de inventarem posição na cronologia.
      //
      // PARTICIONA antes de ordenar, e não é estilo: o comparador de uma linha
      // (`a.ms == null ? 1 : b.ms == null ? -1 : a.ms - b.ms`) devolve 1 para os
      // DOIS lados de um par de movimentos SEM data — cmp(a,b) === cmp(b,a) === 1
      // viola antissimetria, e diante de comparador inconsistente o `sort` pode
      // devolver qualquer permutação. É a mesma lição que `linhaDoTempoProcessual`
      // já registrou em content.js, que faltava aqui. O `sort` do V8 é estável,
      // então entre `ms` iguais a ordem da API é preservada — que é o que o
      // desempate da fonte REST no content.js (`a.i - b.i`) pressupõe.
      const comData = movs.filter((m) => m.ms != null).sort((a, b) => a.ms - b.ms);
      const semData = movs.filter((m) => m.ms == null);
      const ordenados = comData.concat(semData);
      dlog("movimentações: " + ordenados.length + " movimento(s) pela API REST, zero tela JSF");
      // Sucesso zera o contador de expirações: o que desliga a rota pela vida da
      // página é ela pendurar SEMPRE, não ter pendurado uma vez.
      movsTimeouts = 0;
      return ordenados;
    } catch (e) {
      if (ctl && ctl.signal.aborted) {
        movsTimeouts++;
        if (movsTimeouts >= MOVS_TIMEOUTS_ATE_DESISTIR) movsPendurou = true;
        dlog(
          "movimentações: sem resposta em " + MOVS_TIMEOUT_MS + " ms (" +
            movsTimeouts + "ª expiração)" +
            (movsPendurou ? " — desistindo nesta página" : " — tentando de novo no próximo turno")
        );
      } else {
        dlog("movimentações: " + ((e && e.message) || e) + " — caindo para a timeline");
      }
      return null;
    } finally {
      if (relogio) clearTimeout(relogio);
    }
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
      // MESMA URL, e o `ca` é OBRIGATÓRIO: ele é a CHAVE DE ACESSO ao processo,
      // não o id de conversação. Conferido na sessão real —
      // `listAutosDigitais.seam?idProcesso=…` sem o `ca` responde "Sem permissão
      // para acessar a página". Quem identifica a conversação Seam é o `cid`
      // (visível no destino do erro: `error.seam?cid=681717`). Não tente abrir
      // este iframe "numa conversação própria" removendo o `ca`: a rota morre em
      // SILÊNCIO, porque o `catch` abaixo devolve null e o chamador cai no
      // scroll — a lista continua vindo e o defeito passa despercebido.
      iframe.src = location.href;
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
      let lidas = 1;
      const acumular = (linhas) => {
        for (const l of linhas) {
          if (vistos.has(l.id)) continue;
          vistos.add(l.id);
          docs.push(l);
        }
        // Página e total vão junto: quem recusa o envio durante a leitura
        // precisa poder dizer QUANTO falta, e não só que está ocupado.
        if (onProgress) onProgress(docs.length, lidas, paginas);
      };
      acumular(lerLinhas(tb, mapa));

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
        dlog("grid: página " + lidas + "/" + paginas + ", " + docs.length + " documento(s)");
      }

      if (!docs.length) return null;
      // DIAG — o custo REAL desta leitura na sessão do PJe. `performance` do
      // iframe é same-origin e precisa ser lido ANTES do `remove()`; é a única
      // medida direta de quantas requisições a grid gastou.
      dlog(
        "grid: FIM — " + lidas + "/" + paginas + " páginas, " + docs.length +
          " documento(s), " + Math.round((Date.now() - inicio) / 1000) + "s, " +
          reqsDoIframe(iframe) + " requisições no iframe"
      );
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

  // Quantas requisições o iframe gastou. Same-origin, então a Performance
  // Timeline dele é legível daqui — mas só ENQUANTO ele existe.
  function reqsDoIframe(iframe) {
    try {
      return iframe.contentWindow.performance.getEntriesByType("resource").length;
    } catch {
      return -1; // documento já foi embora: não vale falhar por causa de um log
    }
  }

  // AVALIADO E DESCARTADO: navegar o iframe de volta aos autos antes do
  // `remove()`, para não largar a sessão parada na tela "Documentos".
  //
  // A ideia parece prudente e é contraproducente: `iframe.src = location.href`
  // carrega `listAutosDigitais.seam` outra vez e, portanto, **cria mais uma view
  // JSF** — gastando justamente o recurso que se esgotou. Custo certo (uma view
  // a mais no fim da operação que já consumiu ~10, e até 8 s de espera) contra
  // um benefício hipotético sobre "tela corrente em escopo de sessão", mecanismo
  // que a mensagem do PJe não sustenta: "Sua página expirou" é
  // ViewExpiredException, que é view state, não tela corrente.
  //
  // Se um dia houver evidência de estado de sessão corrompido (sintoma
  // DIFERENTE de view expirada), reabrir — mas medindo o custo em views.

  return {
    getBase,
    getIdProcesso,
    getNumeroProcesso,
    // O portão de dialeto (ver o comentário longo em `dialeto`).
    dialeto,
    suportado,
    chaveDoCaso,
    lerCabecalhoProcesso,
    listarDocumentos,
    lerEventos,
    baixar,
    scrollAte,
    // Predicado público: "esta peça existe no DOM da LINHA DO TEMPO?" — que é
    // pergunta DIFERENTE de "esta peça existe na lista do painel". A lista pode
    // vir inteira da rota REST sem que um único nó novo entre na timeline, e é
    // dessa diferença que nascia o laço sem saída do "ver na timeline".
    temNaTimeline: (id) => !!acharLink(id),
    carregarTimelineCompleta,
    listarPelaApi,
    listarMovimentacoes,
    listarPelaGrid,
    lerAnexo,
    // Só o pacote de precatória usa (dois postbacks por peça — ver o comentário).
    baixarPdfOficial,
    // Diagnóstico da queda da view (ver o bloco DIAG no topo). `ativacaoEmVoo`
    // não é só log: a concorrência de download cede a ela.
    ativacaoEmVoo,
    contadorAtivacoes,
    gestoJsf,
    telaDosAutosViva,
    ehTelaDeErro,
    dlog,
    // expostos para teste fora do navegador
    _acharGrid: acharGrid,
    _mapaColunas: mapaColunas,
    _lerLinhas: lerLinhas,
    _limparCelula: limparCelula,
    _rtfParaTexto: rtfParaTexto,
    _parsePessoa: parsePessoa,
    _urlsDownload: urlsDownload,
    _totalPaginasGrid: totalPaginasGrid,
    _contarPaginas: contarPaginas,
    _lerCorpo: lerCorpo,
    _tipoBinario: tipoBinario,
    _tipoImagem: tipoImagem,
    _pareceBinario: pareceBinario,
  };
})();
