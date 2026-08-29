// ---------------------------------------------------------------------------
// TecJustiça PJe — extração da CAMADA DE TEXTO das peças, com pdf.js.
//
// Roda no DOCUMENTO OFFSCREEN (src/ocr-offscreen.html), criado sob demanda pelo
// service worker. Três motivos para não rodar em outro lugar — os dois primeiros
// já estavam escritos no `extrator.js` da v0.21.0 e continuam valendo:
//
//  · content script: 1,7 MB de pdf.js passariam a carregar em TODA página
//    jus.br (inclusive SSO e portais onde o painel nem é injetado), e ficariam
//    expostos a qualquer script do tribunal. A regra do projeto — CLAUDE.md e
//    vendor/LICENSES.md — é que nenhum bundle entra em página de tribunal;
//  · service worker MV3: não tem `new Worker`, então o pdf.js roda em "fake
//    worker" na própria thread — um PDF de 300 páginas bloquearia o worker por
//    dezenas de segundos, e o MV3 pode matá-lo no meio;
//  · aqui: DOM completo, `new Worker` de verdade em thread separada, e canvas
//    para a rasterização que a Fatia 2 (PP-OCRv6) vai precisar.
//
// Só `chrome.runtime` é garantido no offscreen — não usar outras APIs chrome.
//
// UMA PÁGINA POR VEZ, sempre. Uma A4 a 300 dpi em RGBA são dezenas de MB antes
// dos tensores; guardar as páginas de um processo de 300 folhas mataria a aba.
// ---------------------------------------------------------------------------
import * as pdfjsLib from "../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

// Abaixo disto a "camada de texto" não presta: digitalização sem OCR devolve 0;
// digitalização com OCR ruim devolve um punhado de caracteres soltos. É o
// gatilho para a página ir ao PP-OCRv6 (Fatia 2).
//
// O número é medido sobre o CONTEÚDO ÚTIL — isto é, DEPOIS de `podarRepetidas`.
// É a armadilha do PJe: o rodapé de assinatura eletrônica ("Num. NNN - Pág. N",
// "Assinado eletronicamente por…", URL de validação) são ~250 caracteres de
// texto EXTRAÍVEL carimbados em toda folha. Contando o texto cru, uma página
// 100% escaneada "tem texto" e nunca chegaria ao OCR.
const MIN_CHARS_UTEIS_POR_PAGINA = 50;

// Acima disto a página tem conteúdo próprio de sobra e não vale pagar o
// `getOperatorList` para saber se há imagem. Folgado de propósito: o carimbo
// sozinho dá ~250, e uma página escaneada com carimbo duplicado passaria de 500.
const CHARS_DISPENSA_EXAME = 600;

// Proporção de caracteres inválidos acima da qual a camada textual é
// considerada DEFEITUOSA — o guia PP-OCRv6 (§8.1) chama de "camada ruim":
// existe texto, mas é mojibake ou lixo de uma camada OCR corrompida.
const MAX_TAXA_INVALIDOS = 0.02;

// --- montagem do texto de UMA página ---------------------------------------
// getTextContent() emite os itens na ordem do CONTENT STREAM, que é a ordem em
// que o produtor escreveu — não a ordem visual. PDFs de tribunal nascem de
// geradores lineares (JasperReports, iText, conversão de DOCX) e quase sempre
// já vêm em ordem, mas duas colunas ou uma tabela bastam para embaralhar. Por
// isso reagrupamos por geometria: y decrescente em bandas de linha, x crescente
// dentro da linha.
//
// `transform` é a matriz de 6 elementos do PDF: [4] = x, [5] = y, com origem no
// canto INFERIOR esquerdo — daí ordenar por y DECRESCENTE para ir do topo à base.
function textoDaPagina(itens) {
  const uteis = [];
  for (const it of itens) {
    if (!it || typeof it.str !== "string" || !it.str) continue;
    if (!it.transform) continue;
    uteis.push({
      x: it.transform[4],
      y: it.transform[5],
      h: Math.abs(it.height) || Math.abs(it.transform[3]) || 10,
      w: it.width || 0,
      s: it.str,
    });
  }
  if (!uteis.length) return "";
  // Ordenar antes de agrupar deixa o agrupamento linear (O(n log n)); procurar
  // a linha de cada item numa lista seria quadrático, e uma peça de 300 páginas
  // tem centenas de milhares de itens.
  uteis.sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  let atual = null;
  for (const it of uteis) {
    // Tolerância proporcional à fonte: sobrescrito e subscrito pertencem à
    // linha, um parágrafo novo não.
    const tol = Math.max(2, it.h * 0.5);
    if (!atual || Math.abs(atual.y - it.y) > tol) {
      atual = { y: it.y, itens: [] };
      linhas.push(atual);
    }
    atual.itens.push(it);
  }
  const out = [];
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x - b.x);
    let s = "";
    let fimAnterior = null;
    for (const it of l.itens) {
      // Espaço entre palavras muitas vezes NÃO é um caractere no PDF — é uma
      // lacuna de posicionamento. Sem isto o resultado sai "otextoficaassim".
      if (fimAnterior !== null && it.x - fimAnterior > 1) s += " ";
      s += it.s;
      fimAnterior = it.x + it.w;
    }
    s = s.replace(/[ \t]+/g, " ").trim();
    if (s) out.push(s);
  }
  return out.join("\n");
}

// --- poda de cabeçalho/rodapé ----------------------------------------------
// O PJe carimba TODA página com "Assinado eletronicamente por…" e
// "Num. 141516180 - Pág. 3". Repetido em 300 páginas isso são milhares de
// linhas de ruído. São DOIS carimbos com naturezas diferentes, e daí os dois
// critérios abaixo:
//
//  A. LITERAL — a linha é idêntica em quase toda folha. Pega a assinatura
//     eletrônica, o cabeçalho do tribunal, o nome do órgão julgador.
//  B. NUMÉRICO — a linha só varia nos dígitos ("Num. X - Pág. N"). Mascarar os
//     dígitos casaria também conteúdo legítimo que difere só por número (um
//     extrato, um formulário, uma tabela repetida em 50 páginas), então este
//     critério exige que a linha seja DENSA EM DÍGITOS: identificador de
//     documento e numeração de página são; prosa jurídica não é.
//
// Sem a restrição de densidade, "conteúdo próprio da folha 1/2/3…" colapsaria
// numa chave só e o texto real seria apagado — o que é pior do que manter o
// carimbo.
const norm = (l) => l.replace(/\s+/g, " ").trim().toLowerCase();

// Além dos dígitos, mascara CÓDIGOS ALFANUMÉRICOS — token com letra E dígito,
// de 6 caracteres para cima. É o que o carimbo do e-SAJ acrescenta em cada
// folha ("… e o código 2R8iZpra"), e sem isso a chave mudava a cada página:
// nem o critério literal nem o numérico pegavam o carimbo, e uma peça migrada
// do SAJ saía do processamento com 250 caracteres de rodapé por página fazendo
// as folhas escaneadas passarem por "texto nativo".
//
// A guarda de densidade de dígitos continua valendo por cima disto — o que se
// normaliza aqui é a FORMA do identificador, não o critério.
// Roda ANTES do `norm`, porque um dos dois sinais é a CAIXA: nenhuma palavra
// portuguesa tem maiúscula no meio, mas todo código gerado tem ("MisnBHPj",
// "2R8iZpra"). O outro sinal é misturar letra e dígito. Um token só de letras
// maiúsculas ("ANTONIO") ou só de dígitos não é código e passa intacto.
function mascararCodigos(linha) {
  return linha.replace(/\b[A-Za-z0-9]{6,}\b/g, (t) => {
    if (!/[A-Za-z]/.test(t)) return t;
    return /\d/.test(t) || /[a-z][A-Z]/.test(t) ? "@" : t;
  });
}
const chaveLinha = (l) => norm(mascararCodigos(l)).replace(/\d+/g, "#");

// O critério NUMÉRICO só vale nas bordas da folha. Cabeçalho e rodapé são, por
// definição, as primeiras e as últimas linhas; e apagar uma linha por ela
// "diferir só nos números" DESTRÓI informação quando o número É o conteúdo —
// "Valor Total do lote: R$ 1.001,00" repetido num formulário de 8 folhas casa o
// padrão e é exatamente o dado que o usuário quer. O critério LITERAL não tem
// essa restrição: linha idêntica em 80% das folhas não carrega informação
// nenhuma, esteja onde estiver.
const LINHAS_DE_BORDA = 3;
const naBorda = (i, total) => i < LINHAS_DE_BORDA || i >= total - LINHAS_DE_BORDA;
const DENSIDADE_DIGITOS = 0.15;

function densaEmDigitos(l) {
  const s = l.replace(/\s/g, "");
  if (!s) return false;
  return s.replace(/\D/g, "").length / s.length >= DENSIDADE_DIGITOS;
}

function podarRepetidas(folhas) {
  // Com poucas folhas não dá para distinguir carimbo de conteúdo.
  if (folhas.length < 4) return folhas;
  const limiar = Math.max(4, Math.floor(folhas.length * 0.8));
  const porLinha = new Map();
  const porPadrao = new Map();
  for (const f of folhas) {
    // Set por folha: uma linha repetida DENTRO da mesma folha conta uma vez só.
    const linhas = f.texto.split("\n");
    for (const k of new Set(linhas.map(norm))) {
      if (k.length < 8) continue; // linhas curtas ("3", "fls.") não são carimbo
      porLinha.set(k, (porLinha.get(k) || 0) + 1);
    }
    for (const l of new Set(linhas.filter(densaEmDigitos).map(chaveLinha))) {
      if (l.length < 8) continue;
      porPadrao.set(l, (porPadrao.get(l) || 0) + 1);
    }
  }
  const lixoLiteral = new Set();
  for (const [k, n] of porLinha) if (n >= limiar) lixoLiteral.add(k);
  const lixoPadrao = new Set();
  for (const [k, n] of porPadrao) if (n >= limiar) lixoPadrao.add(k);
  if (!lixoLiteral.size && !lixoPadrao.size) return folhas;
  const ehLixo = (l, i, total) =>
    lixoLiteral.has(norm(l)) ||
    (naBorda(i, total) && densaEmDigitos(l) && lixoPadrao.has(chaveLinha(l)));
  return folhas.map((f) => {
    const linhas = f.texto.split("\n");
    return Object.assign({}, f, {
      texto: linhas
        .filter((l, i) => !ehLixo(l, i, linhas.length))
        .join("\n")
        .trim(),
    });
  });
}

// --- decisão POR PÁGINA -----------------------------------------------------
// Regra do guia PP-OCRv6 (§8.1): não decidir por `texto.length > 0`. Um PDF
// pode trazer texto invisível defeituoso, uma marca d'água ou uma camada de OCR
// corrompida — e nesses casos o texto existente é PIOR que nada.
//
// A diferença entre "página escaneada" e "página em branco" importa para o
// usuário: uma vai ao OCR, a outra é uma folha de rosto vazia e o relatório
// precisa dizer isso em vez de sugerir que faltou processar algo.
//
// `texto` aqui é o texto JÁ PODADO — ver MIN_CHARS_UTEIS_POR_PAGINA.
function classificarPagina(texto, temImagem) {
  const normalizado = texto.normalize("NFKC").replace(/\s+/g, " ").trim();
  const chars = [...normalizado].length;
  // U+FFFD (replacement) e NUL, SEMPRE como escapes ASCII. Caractere de
  // controle CRU no fonte faz o git tratar o arquivo como binario e o diff
  // some (regra do CLAUDE.md); e o NUL literal que eu escrevi aqui na
  // primeira versao ja tinha transformado este arquivo em "Bin".
  const invalidos = (normalizado.match(/[\uFFFD\u0000]/g) || []).length;
  const camadaRuim = chars > 0 && invalidos / chars > MAX_TAXA_INVALIDOS;

  if (camadaRuim) return "camada-ruim";
  if (chars >= MIN_CHARS_UTEIS_POR_PAGINA) return "nativo";
  return temImagem ? "escaneada" : "vazia";
}

// Conta operadores de pintura de imagem. NÃO mede a ÁREA coberta (isso exigiria
// aplicar a matriz de transformação de cada imagem, caro e frágil); serve só
// para separar "folha escaneada" de "folha genuinamente em branco", e por isso
// só roda nas páginas que já ficaram abaixo do limiar de caracteres.
async function temImagemNaPagina(pagina) {
  try {
    const ops = await pagina.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const pinta = new Set(
      [
        OPS.paintImageXObject,
        OPS.paintJpegXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
      ].filter((v) => v !== undefined)
    );
    for (const fn of ops.fnArray) if (pinta.has(fn)) return true;
    return false;
  } catch {
    // Página que não abre o operator list é, na prática, página que não dá para
    // classificar — assumir escaneada manda ao OCR, que é o lado barato do erro.
    return true;
  }
}

// --- extração de uma peça ---------------------------------------------------
async function extrairPeca(bytes) {
  const tarefa = pdfjsLib.getDocument({
    data: bytes,
    // A CSP de páginas de extensão não permite `eval` — o pdf.js precisa saber
    // disso ou tenta compilar funções de fonte em runtime.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await tarefa.promise;
  const folhas = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      let pagina = null;
      try {
        pagina = await doc.getPage(n);
        const conteudo = await pagina.getTextContent();
        const texto = textoDaPagina(conteudo.items);
        // O exame de imagem precisa do objeto `pagina`, que é liberado no
        // `finally` — então ele acontece AQUI, mas a CLASSIFICAÇÃO só depois da
        // poda (o carimbo do PJe infla o texto cru e mascararia o scan).
        const temImagem =
          texto.length >= CHARS_DISPENSA_EXAME ? false : await temImagemNaPagina(pagina);
        folhas.push({ p: n, texto, temImagem });
      } catch (e) {
        // Página corrompida não derruba a peça inteira — entra em branco e o
        // relatório diz o motivo.
        folhas.push({ p: n, texto: "", temImagem: false, estado: "falhou", erro: String((e && e.message) || e) });
      } finally {
        if (pagina) pagina.cleanup();
      }
    }
  } finally {
    // `doc.destroy()` não existe nas versões novas do pdf.js; quem destrói é a
    // loading task. Chamar o errado lança TypeError DEPOIS de todo o texto já
    // ter sido extraído — falha que parece perda total e não é.
    await tarefa.destroy();
  }

  // PODAR ANTES DE CLASSIFICAR. O rodapé de assinatura do PJe são ~250
  // caracteres extraíveis por folha: classificando o texto cru, uma peça
  // inteiramente digitalizada passaria por "texto nativo" e nunca chegaria ao
  // OCR — e o usuário receberia um .md só com carimbos.
  const podadas = podarRepetidas(folhas).map((f) =>
    f.estado === "falhou" ? f : Object.assign({}, f, { estado: classificarPagina(f.texto, f.temImagem) })
  );
  const chars = podadas.reduce((s, f) => s + f.texto.length, 0);
  return {
    paginas: doc.numPages,
    folhas: podadas,
    chars,
    nativas: podadas.filter((f) => f.estado === "nativo").length,
    precisamOcr: podadas.filter((f) => f.estado === "escaneada" || f.estado === "camada-ruim").length,
    vazias: podadas.filter((f) => f.estado === "vazia").length,
    falhas: podadas.filter((f) => f.estado === "falhou").length,
  };
}

// --- base64 -> bytes --------------------------------------------------------
function b64ParaBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- canal ------------------------------------------------------------------
// O service worker é quem fala com este documento. Mensagens de outros alvos
// passam direto (devolver `false` deixa outro listener responder).
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (!msg || msg.alvo !== "ocrOffscreen") return false;

  if (msg.tipo === "ping") {
    responder({ ok: true });
    return true;
  }

  if (msg.tipo === "extrairPeca") {
    // A peça chega em base64 porque `chrome.runtime.sendMessage` serializa como
    // JSON — um ArrayBuffer viraria `{}`. Custa +33% e uma cópia de string, e é
    // por isso que a extração é pedida UMA PEÇA POR VEZ.
    (async () => {
      try {
        const bytes = b64ParaBytes(msg.b64);
        const r = await extrairPeca(bytes);
        responder({ ok: true, resultado: r });
      } catch (e) {
        responder({ ok: false, erro: String((e && e.message) || e) });
      }
    })();
    return true; // resposta assíncrona
  }

  return false;
});

// Ponto de entrada para os testes fora do navegador (mesma convenção do mapa.js).
if (typeof window !== "undefined") {
  window.__ocrOffscreen = { textoDaPagina, podarRepetidas, classificarPagina, b64ParaBytes };
}
