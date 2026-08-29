// ---------------------------------------------------------------------------
// TecJustiça PJe — leitura do PDF de uma peça: camada de texto + rasterização.
//
// Roda numa PÁGINA DE EXTENSÃO carregada pelo content script como IFRAME OCULTO
// (src/ocr-render.html). Três razões, e a terceira é a que tirou este código do
// documento offscreen onde ele nasceu na v0.49.0:
//
//  · content script: 1,7 MB de pdf.js passariam a carregar em TODA página
//    jus.br, expostos a qualquer script do tribunal. A regra do projeto é que
//    nenhum bundle entra em página de tribunal;
//  · service worker MV3: não tem `new Worker`, e morre no meio de um PDF longo;
//  · documento OFFSCREEN: `page.render()` do pdf.js TRAVA lá. Um documento
//    offscreen é sempre "hidden", e o renderizador espera por
//    `requestAnimationFrame`, que o Chrome congela em contexto oculto — o mesmo
//    congelamento que já derrubou o primeiro desenho do mapa mental em aba de
//    segundo plano. `getTextContent()` funciona no offscreen; `render()` não.
//
// Um IFRAME de página de extensão não é nenhum dos três: tem origem
// `chrome-extension://`, então valem a CSP e os globais da extensão, não os do
// tribunal.
//
// MAS ELE TAMBÉM É OCULTO, e essa é a lição desta rodada: o que travava o
// `render()` no offscreen nunca foi SER OFFSCREEN — era ESTAR OCULTO. Este
// iframe tem 1×1 px, `opacity:0` e vive a `left:-9999px`, fora da viewport, e é
// cross-origin em relação à página do tribunal: o Chrome aplica render
// throttling e congela o rAF exatamente como no offscreen. Trocar de contexto
// preservando a propriedade errada reproduziu o mesmo travamento com outra
// roupa — sintoma idêntico e pior, porque `page.render()` não resolve NEM
// rejeita: o log morre entre "classificado" e "raster fl.1", sem erro nenhum.
// É por isso que existe o shim logo abaixo.
//
// UMA PÁGINA POR VEZ. Uma A4 a 144 dpi em RGBA já são ~13 MB antes do JPEG;
// guardar as páginas de um processo de 300 folhas mataria a aba.
// ---------------------------------------------------------------------------
import * as pdfjsLib from "../vendor/pdf.min.mjs";

// SHIM DE rAF — o que faz a rasterização funcionar em documento oculto.
//
// `InternalRenderTask._scheduleNext()` do pdf.js chama `window.requestAnimationFrame`
// quando o intent é de display (só o de impressão usa microtask). Ele NÃO o usa
// para animar: usa como agendador de cedência — "executei 15 ms de operadores,
// devolvo o event loop e me chame de volta". Numa página que não pinta nada na
// tela, o rAF não tem outra função, e `setTimeout(fn, 0)` preserva a semântica
// que importa (macrotask, cede ao event loop) FUNCIONANDO em contexto oculto.
//
// Trocar o intent para "print" também evitaria o rAF, mas mudaria o que é
// desenhado (aparência de impressão das anotações) — e o que se quer no OCR é a
// folha como o usuário a vê no visualizador do PJe.
//
// Esta página é 100% nossa, sem animação e sem saída visual: substituir aqui não
// alcança nem o painel nem a página do tribunal.
//
// E a cedência é por MessageChannel, NÃO por `setTimeout(fn, 0)`. Os dois
// funcionam em documento oculto, mas o Chrome estrangula timers a ~1/s em aba de
// SEGUNDO PLANO — e abrir processos com Ctrl+clique em várias abas é o padrão de
// trabalho no PJe. Uma extração de 54 folhas dura minutos: o usuário troca de
// aba no meio, e com timer estrangulado cada folha passaria a custar segundos de
// espera pura. `MessagePort.postMessage` é macrotask e NÃO é estrangulado.
// `setTimeout` fica de reserva para o contexto sem MessageChannel (o `vm` dos
// testes), onde o estrangulamento não existe.
if (typeof window !== "undefined") {
  let idRaf = 0;
  const pendentes = new Map();

  const canal = typeof MessageChannel === "function" ? new MessageChannel() : null;
  if (canal) {
    canal.port1.onmessage = (ev) => {
      const id = ev.data;
      const fn = pendentes.get(id);
      if (!fn) return; // cancelado entre o agendamento e a entrega
      pendentes.delete(id);
      try {
        fn(performance.now());
      } catch (e) {
        console.error("[PJe IA OCR][pdf] callback de render falhou:", e);
      }
    };
    canal.port1.start();
  }

  window.requestAnimationFrame = (fn) => {
    const id = ++idRaf;
    if (canal) {
      pendentes.set(id, fn);
      canal.port2.postMessage(id);
    } else {
      pendentes.set(
        id,
        setTimeout(() => {
          pendentes.delete(id);
          try {
            fn(performance.now());
          } catch (e) {
            console.error("[PJe IA OCR][pdf] callback de render falhou:", e);
          }
        }, 0)
      );
    }
    return id;
  };

  // O pdf.js CANCELA o frame agendado quando a tarefa de render é abortada
  // (`RenderTask.cancel`, que a guarda de tempo do `rasterizar` chama). Sem o
  // par, um cancelamento deixaria o callback rodar sobre um canvas já zerado.
  window.cancelAnimationFrame = (id) => {
    const v = pendentes.get(id);
    if (v === undefined) return;
    pendentes.delete(id);
    if (!canal) clearTimeout(v);
  };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

// Abaixo disto a "camada de texto" não presta: digitalização sem OCR devolve 0;
// digitalização com OCR ruim devolve um punhado de caracteres soltos. É o
// gatilho para a página ir ao PP-OCRv6.
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
// existe texto, mas é mojibake ou lixo de uma camada de OCR corrompida.
const MAX_TAXA_INVALIDOS = 0.02;

// RESOLUÇÃO DA RASTERIZAÇÃO — em PIXELS DE ALVO, não em escala fixa.
//
// Era `scale: 2.0`, e uma escala fixa multiplica o mediabox: ela entrega
// resoluções DIFERENTES para páginas diferentes. Numa A4 (595×842 pt) dá 1684 px
// de altura, que é o que se quer; num ofício digitalizado em meia página, ou num
// recorte de jornal com mediabox de 300×400 pt, dá 800 px — resolução baixa
// demais para o reconhecedor, e o resultado é OCR ruim numa página que o motor
// leria bem. No outro extremo, uma planta ou um mapa em A1 renderizaria uma
// imagem de dezenas de megapixels para ser encolhida logo depois.
//
// Mirar num maior lado ALVO torna o resultado independente do tamanho da página.
// O alvo é 1700 px por duas razões medidas no próprio motor:
//
//  · o reconhecedor recorta do canvas CHEIO, limitado por `maxCropSourceSideLength`
//    = 2000 px. Passar disso é rasterizar pixels que o motor descarta;
//  · ele normaliza cada linha para 48 px de altura. Numa A4 com ~45 linhas, a
//    1700 px a linha tem ~21 px e é AMPLIADA 2,3×; a 1264 px (a escala 1.5 que a
//    skill sugere) teria ~16 px e seria ampliada 3×, com mais borrão. É por isso
//    que baixar a escala não é de graça: o ganho aparece na rasterização e a
//    conta chega no reconhecimento.
//
// Numa A4 o alvo de 1700 reproduz praticamente a escala 2.0 de antes (1684 px),
// então este processo não muda de comportamento — o que muda é a página fora do
// padrão, que era onde a escala fixa errava.
const LADO_ALVO_PX = 1700;
// QUEM EVITA AMPLIAR DEMAIS É O TETO, e confundir isso já custou um bug: um piso
// de 1.0 não impede ampliação nenhuma — ele impede REDUZIR, e numa planta ou num
// mapa em A0 (2384×3370 pt) forçava 8 MP onde o alvo pede 2, com ~32 MB de canvas
// RGBA, para o detector encolher tudo logo depois.
//
// O teto de 4× é que protege a página pequena: ampliar 12× um recorte não cria
// informação que o scan não tem. O piso é só sanidade numérica, para um mediabox
// absurdo não produzir escala zero ou negativa.
const ESCALA_MIN = 0.05;
const ESCALA_MAX = 4.0;

function escalaPara(pagina) {
  const base = pagina.getViewport({ scale: 1 });
  const maior = Math.max(base.width, base.height) || 1;
  const bruta = LADO_ALVO_PX / maior;
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, bruta));
}

// JPEG e não PNG: um scan A4 vira ~200 KB em vez de ~2 MB, e a diferença some no
// OCR. 0.82 é o valor medido na skill do usuário.
const JPEG_QUALIDADE = 0.82;

// Teto de uma rasterização. Generoso de propósito: uma A4 medida neste processo
// leva 159 ms, então 60 s não interrompe folha nenhuma que esteja de fato
// trabalhando — ele existe só para o caso de o render PENDURAR, que é o defeito
// que originou o shim de rAF no topo do arquivo.
const RASTER_TIMEOUT_MS = 60000;

// --- montagem do texto de UMA página ---------------------------------------
// getTextContent() emite os itens na ordem do CONTENT STREAM, que é a ordem em
// que o produtor escreveu — não a ordem visual. PDFs de tribunal nascem de
// geradores lineares (JasperReports, iText, conversão de DOCX) e quase sempre já
// vêm em ordem, mas duas colunas ou uma tabela bastam para embaralhar. Por isso
// reagrupamos por geometria: y decrescente em bandas de linha, x crescente
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
  // Ordenar antes de agrupar deixa o agrupamento linear (O(n log n)); procurar a
  // linha de cada item numa lista seria quadrático, e uma peça de 300 páginas
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
// "Num. 141516180 - Pág. 3"; o e-SAJ, com um bloco maior ainda. Repetido em 300
// páginas isso são milhares de linhas de ruído. São DOIS carimbos com naturezas
// diferentes, e daí os dois critérios abaixo:
//
//  A. LITERAL — a linha é idêntica em quase toda folha. Pega a assinatura
//     eletrônica, o cabeçalho do tribunal, o nome do órgão julgador.
//  B. NUMÉRICO — a linha só varia nos dígitos ("Num. X - Pág. N"). Mascarar os
//     dígitos casaria também conteúdo legítimo que difere só por número, então
//     este critério exige que a linha seja DENSA EM DÍGITOS e esteja na BORDA
//     da folha.
const norm = (l) => l.replace(/\s+/g, " ").trim().toLowerCase();

// Roda ANTES do `norm`, porque um dos dois sinais é a CAIXA: nenhuma palavra
// portuguesa tem maiúscula no meio, mas todo código gerado tem ("MisnBHPj",
// "2R8iZpra"). O outro sinal é misturar letra e dígito. Um token só de letras
// maiúsculas ("ANTONIO") ou só de dígitos não é código e passa intacto.
//
// Sem isto, o carimbo do e-SAJ — que traz um código por folha — muda de chave a
// cada página, nenhum dos dois critérios o pega, e uma peça migrada do SAJ sai
// com 250 caracteres de rodapé por página fazendo as folhas escaneadas passarem
// por "texto nativo".
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
    const daBorda = linhas.filter((l, i) => naBorda(i, linhas.length) && densaEmDigitos(l));
    for (const l of new Set(daBorda.map(chaveLinha))) {
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
// Regra do guia PP-OCRv6 (§8.1): não decidir por `texto.length > 0`. Um PDF pode
// trazer texto invisível defeituoso, uma marca d'água ou uma camada de OCR
// corrompida — e nesses casos o texto existente é PIOR que nada.
//
// A diferença entre "página escaneada" e "página em branco" importa: uma vai ao
// OCR, a outra é uma folha de rosto vazia e o relatório precisa dizer isso em
// vez de sugerir que faltou processar algo.
//
// `texto` aqui é o texto JÁ PODADO — ver MIN_CHARS_UTEIS_POR_PAGINA.
function classificarPagina(texto, temImagem) {
  const normalizado = texto.normalize("NFKC").replace(/\s+/g, " ").trim();
  const chars = [...normalizado].length;
  // U+FFFD (replacement) e NUL, SEMPRE como escapes ASCII: caractere de controle
  // CRU no fonte faz o git tratar o arquivo como binário e o diff some.
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

// --- rasterização de UMA página --------------------------------------------
// Devolve um data URL. NÃO um Blob: em extensão, um Blob atravessa
// `chrome.runtime.sendMessage` como `{}` vazio — base64 atravessa, ao preço de
// +33%.
async function rasterizar(pagina) {
  const viewport = pagina.getViewport({ scale: escalaPara(pagina) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  // Fundo branco: PDF sem fundo declarado renderiza TRANSPARENTE, e transparente
  // vira PRETO no JPEG — o OCR receberia uma folha preta.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // TETO DE TEMPO, e ele existe por causa de um travamento REAL (o rAF congelado
  // do shim acima). Um `render()` que não resolve nem rejeita pendurava a peça
  // inteira; com teto, a FOLHA falha com motivo e as outras seguem — a mesma
  // regra que faz uma peça que não baixa não derrubar o turno. `cancel()` é
  // obrigatório: sem ele a tarefa abandonada continua desenhando num canvas que
  // já vai ser zerado.
  const tarefaRender = pagina.render({ canvasContext: ctx, viewport });
  let estourou;
  try {
    await Promise.race([
      tarefaRender.promise,
      new Promise((_, rej) => {
        estourou = setTimeout(
          () => rej(new Error("a rasterização não respondeu em 60s")),
          RASTER_TIMEOUT_MS
        );
      }),
    ]);
  } catch (e) {
    try {
      tarefaRender.cancel();
    } catch {}
    canvas.width = 0;
    canvas.height = 0;
    throw e;
  } finally {
    clearTimeout(estourou);
  }

  const url = canvas.toDataURL("image/jpeg", JPEG_QUALIDADE);
  // Zerar o canvas solta os bytes antes da próxima página.
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// --- leitura de uma peça ----------------------------------------------------
const dr = (...a) => console.log("[PJe IA OCR][pdf]", ...a);

async function lerPeca(bytes, querImagens) {
  dr("abrindo PDF de", bytes.length, "bytes");
  const tarefa = pdfjsLib.getDocument({
    data: bytes,
    // A CSP de páginas de extensão não permite `eval` — sem isto o pdf.js tenta
    // compilar funções de fonte em runtime e falha.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await tarefa.promise;
  const paginas = doc.numPages;
  dr("PDF aberto:", paginas, "página(s)");
  const objs = [];
  try {
    for (let n = 1; n <= paginas; n++) {
      try {
        const pagina = await doc.getPage(n);
        const conteudo = await pagina.getTextContent();
        const texto = textoDaPagina(conteudo.items);
        // O exame de imagem precisa do objeto `pagina` — acontece aqui, mas a
        // CLASSIFICAÇÃO só depois da poda (o carimbo infla o texto cru e
        // mascararia o scan).
        const temImagem =
          texto.length >= CHARS_DISPENSA_EXAME ? false : await temImagemNaPagina(pagina);
        objs.push({ p: n, texto, temImagem, pagina });
      } catch (e) {
        // Página corrompida não derruba a peça inteira.
        objs.push({ p: n, texto: "", temImagem: false, estado: "falhou", erro: String((e && e.message) || e) });
      }
    }

    // PODAR ANTES DE CLASSIFICAR.
    const folhas = podarRepetidas(
      objs.map((f) => ({ p: f.p, texto: f.texto, temImagem: f.temImagem, estado: f.estado, erro: f.erro }))
    );
    for (const f of folhas) {
      if (f.estado !== "falhou") f.estado = classificarPagina(f.texto, f.temImagem);
    }

    // Rasteriza SÓ o que vai ao OCR. É a diferença entre segundos e minutos:
    // num processo real, 4 de 41 páginas.
    dr(
      "classificado:",
      folhas.filter((f) => f.estado === "nativo").length + " nativas,",
      folhas.filter((f) => f.estado === "escaneada" || f.estado === "camada-ruim").length + " p/ OCR,",
      folhas.filter((f) => f.estado === "vazia").length + " vazias"
    );
    if (querImagens) {
      for (let i = 0; i < folhas.length; i++) {
        const f = folhas[i];
        if (f.estado !== "escaneada" && f.estado !== "camada-ruim") continue;
        try {
          const t0 = Date.now();
          // Linha ANTES do trabalho, não só depois. Quando o render pendurava,
          // o rastro morria entre "classificado" e o "raster fl.N ->" final, e
          // não dava para saber se o laço sequer tinha entrado na folha. Log de
          // etapa longa se escreve na ENTRADA.
          dr("rasterizando fl." + f.p + "…");
          if (objs[i] && objs[i].pagina) f.img = await rasterizar(objs[i].pagina);
          dr("raster fl." + f.p, "->", Date.now() - t0, "ms,", Math.round((f.img || "").length / 1024), "KB");
        } catch (e) {
          f.erroRaster = String((e && e.message) || e);
          dr("ERRO ao rasterizar fl." + f.p, "->", f.erroRaster);
        }
      }
    }

    return {
      paginas,
      folhas: folhas.map((f) => {
        const { temImagem, ...resto } = f;
        return resto;
      }),
      chars: folhas.reduce((s, f) => s + f.texto.length, 0),
      nativas: folhas.filter((f) => f.estado === "nativo").length,
      precisamOcr: folhas.filter((f) => f.estado === "escaneada" || f.estado === "camada-ruim").length,
      vazias: folhas.filter((f) => f.estado === "vazia").length,
      falhas: folhas.filter((f) => f.estado === "falhou").length,
    };
  } finally {
    for (const o of objs) if (o.pagina) o.pagina.cleanup();
    // `doc.destroy()` não existe nas versões novas do pdf.js; quem destrói é a
    // loading task. Chamar o errado lança TypeError DEPOIS de todo o texto já ter
    // sido extraído — falha que parece perda total e não é.
    await tarefa.destroy();
  }
}

// --- canal com o content script ---------------------------------------------
// `postMessage` direto entre janelas, com o ArrayBuffer TRANSFERIDO (cópia
// zero). É o que evita o base64 de dezenas de MB que o caminho pelo service
// worker cobraria.
//
// O NONCE não é zelo: o iframe é criado a partir do contexto da página do
// tribunal, e qualquer script dela pode postar aqui. Sem ele, um script do PJe
// mandaria um PDF arbitrário para processamento.
const NONCE = new URLSearchParams(location.search).get("n") || "";

window.addEventListener("message", async (ev) => {
  const m = ev.data;
  if (!m || m.__pjeia !== "ler" || !NONCE || m.nonce !== NONCE) return;
  const responder = (corpo) =>
    ev.source.postMessage(Object.assign({ __pjeia: "lido", req: m.req }, corpo), "*");
  try {
    const r = await lerPeca(new Uint8Array(m.buf), !!m.querImagens);
    responder({ ok: true, resultado: r });
  } catch (e) {
    responder({ ok: false, erro: String((e && e.message) || e) });
  }
});

// O evento `load` do iframe dispara ANTES de o módulo ES resolver os imports —
// por isso quem avisa que está pronto é o próprio módulo, no fim dele.
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ __pjeia: "render-pronto", nonce: NONCE }, "*");
}

// Ponto de entrada para os testes fora do navegador (convenção do mapa.js).
window.__ocrRender = { textoDaPagina, podarRepetidas, classificarPagina, chaveLinha, densaEmDigitos };
