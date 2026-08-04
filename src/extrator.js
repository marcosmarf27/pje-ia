// ---------------------------------------------------------------------------
// PJe IA — extração da CAMADA DE TEXTO de um PDF, com pdf.js.
//
// Roda numa PÁGINA DE EXTENSÃO oculta (src/extrator.html), carregada como
// iframe pelo content script. Três motivos para não rodar em outro lugar:
//
//  · content script: 1,7 MB de pdf.js passariam a carregar em TODA página
//    jus.br (inclusive SSO e portais onde o painel nem é injetado), e ficariam
//    expostos a qualquer script do tribunal. A regra do projeto — escrita no
//    CLAUDE.md e no vendor/LICENSES.md — é que nenhum bundle entra em página de
//    tribunal;
//  · service worker MV3: não tem `new Worker`, então o pdf.js roda em
//    "fake worker" na própria thread — um PDF de 300 páginas bloquearia o
//    worker por dezenas de segundos, e o MV3 pode matá-lo no meio. Pior: o PDF
//    só chegaria lá em base64 (sendMessage serializa como JSON), pagando +33%
//    e uma cópia de string de dezenas de MB;
//  · aqui: DOM completo, `new Worker(..., {type:"module"})` de verdade em
//    thread separada, e o PDF chega por postMessage TRANSFERABLE — cópia zero.
//
// Páginas em web_accessible_resources não são barradas pela CSP da página que
// as embute (só o Cross-Origin-Embedder-Policy barraria, raro em tribunal).
// Ainda assim o content script trata o silêncio deste iframe como falha e
// segue sem a extração local — contrato best-effort de sempre.
// ---------------------------------------------------------------------------
import * as pdfjsLib from "../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

// Abaixo disto a "camada de texto" não presta (digitalização sem OCR devolve 0;
// digitalização com OCR ruim devolve um punhado de caracteres soltos). É o
// gatilho para o content script oferecer o OCR pago.
const MIN_CHARS_POR_PAGINA = 100;

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
      eol: !!it.hasEOL,
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
// tokens de ruído. São DOIS carimbos com naturezas diferentes, e daí os dois
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
const chaveLinha = (l) => norm(l).replace(/\d+/g, "#");
const DENSIDADE_DIGITOS = 0.15;

function densaEmDigitos(l) {
  const s = l.replace(/\s/g, "");
  if (!s) return false;
  return (s.replace(/\D/g, "").length / s.length) >= DENSIDADE_DIGITOS;
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
  const ehLixo = (l) =>
    lixoLiteral.has(norm(l)) || (densaEmDigitos(l) && lixoPadrao.has(chaveLinha(l)));
  return folhas.map((f) => ({
    p: f.p,
    texto: f.texto.split("\n").filter((l) => !ehLixo(l)).join("\n").trim(),
  }));
}

// --- extração ---------------------------------------------------------------
async function extrair(buf) {
  // O objeto de LOADING é quem tem destroy() — o PDFDocumentProxy não. Chamar
  // doc.destroy() lança TypeError DEPOIS de todo o texto já ter sido extraído,
  // e o resultado se perde na resposta de erro: a extração falhava inteira por
  // causa da última linha. Pego no primeiro teste com o pdf.js de verdade.
  const tarefa = pdfjsLib.getDocument({
    data: buf,
    // A CSP de páginas de extensão é `script-src 'self'` — sem eval. As demais
    // desligam trabalho de RENDERIZAÇÃO, que não usamos: só queremos texto.
    // Opções que o pdf.js não conheça são ignoradas, então isto é seguro entre
    // versões. `disableNormalization` fica de FORA de propósito: a normalização
    // (ligaduras ﬁ→fi, hífen suave) é exatamente o que se quer para o modelo.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    // Só ERROS no console (0 = ERRORS). Sem isto o pdf.js enche o console da
    // página do tribunal com avisos inofensivos a cada peça: "TT: undefined
    // function" (hinting de TrueType) e "Ensure that the standardFontDataUrl
    // API parameter is provided" — este último porque NÃO vendorizamos as 14
    // fontes-padrão (416 KB). Testado: peça com Helvetica não-embutida e sem
    // /ToUnicode extrai com valores, artigos e numeração de folha intactos, que
    // é o que importa aqui. Erros de verdade continuam vindo por exceção.
    verbosity: 0,
  });
  const doc = await tarefa.promise;

  // Guardado ANTES do destroy(): depois de destruído o documento, ler
  // numPages devolve lixo (ou lança).
  const paginas = doc.numPages;
  const folhas = [];
  for (let n = 1; n <= paginas; n++) {
    const page = await doc.getPage(n);
    try {
      const tc = await page.getTextContent();
      folhas.push({ p: n, texto: textoDaPagina(tc.items || []) });
    } catch {
      // página corrompida não derruba a peça inteira — entra em branco e a
      // numeração das folhas seguintes continua certa
      folhas.push({ p: n, texto: "" });
    }
    page.cleanup();
  }
  const podadas = podarRepetidas(folhas);
  const chars = podadas.reduce((a, f) => a + f.texto.length, 0);
  await tarefa.destroy(); // libera o worker; doc.destroy() NÃO existe na v6
  return {
    folhas: podadas,
    paginas,
    chars,
    // O chamador decide o que fazer; aqui só reportamos o fato.
    pobre: paginas > 0 && chars / paginas < MIN_CHARS_POR_PAGINA,
  };
}

// --- protocolo com o content script ----------------------------------------
// Marcador próprio para não confundir com postMessages da página do tribunal.
// A resposta volta para a origem de QUEM PERGUNTOU (nunca "*"): não há nada a
// vazar — quem pergunta já tem o PDF nas mãos —, mas endereçar é o correto.
window.addEventListener("message", async (ev) => {
  const m = ev.data;
  if (!m || m.__pjeia !== "extrair" || !m.buf) return;
  const responder = (extra) => {
    try {
      ev.source.postMessage(
        Object.assign({ __pjeia: "extraido", req: m.req }, extra),
        ev.origin === "null" ? "*" : ev.origin
      );
    } catch {
      /* iframe já descartado pelo chamador */
    }
  };
  try {
    const r = await extrair(m.buf);
    responder(r);
  } catch (e) {
    // PasswordException (PDF com senha de usuário) cai aqui, como qualquer
    // outra falha: a peça simplesmente continua indo como PDF.
    responder({ erro: String((e && e.message) || e) });
  }
});

// Funções puras expostas para teste fora do navegador (mesmo recurso do
// `window.__mapa` em mapa.js): o teste carrega este arquivo em `vm` sem a linha
// de import e exercita a geometria e a poda com itens sintéticos.
window.__extrator = { textoDaPagina, podarRepetidas, chaveLinha, MIN_CHARS_POR_PAGINA };

// Avisa o content script de que já dá para mandar trabalho — o evento `load` do
// iframe dispara antes de o módulo ES resolver os imports.
try {
  parent.postMessage({ __pjeia: "extrator-pronto" }, "*");
} catch {
  /* sem parent (aberto direto para depuração) */
}
